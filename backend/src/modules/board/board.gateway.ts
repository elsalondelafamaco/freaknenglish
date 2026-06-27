import { Logger, UseGuards } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { JwtService } from '@nestjs/jwt'
import { Server, Socket } from 'socket.io'
import { BoardService } from './board.service'
import { env } from '../../config/env'

/**
 * Real-time board gateway.
 *
 * Wire protocol (client → server):
 *   socket.emit('board:join', { boardId })
 *   socket.emit('board:op', { boardId, op, clientOpId })
 *   socket.emit('board:cursor', { boardId, x, y })
 *
 * Wire protocol (server → client):
 *   'board:op'      → { seq, userId, op, clientOpId, createdAt }
 *   'board:presence'→ { users: [{ id, fullName }] }
 *   'board:cursor'  → { userId, x, y }
 *
 * Auth: client connects with `auth: { token }` (JWT). Reconnect strategy on
 * client should call REST /boards/:id/ops?since=N to catch up missed ops.
 */
@WebSocketGateway({
  namespace: '/board',
  cors: { origin: env.CORS_ORIGINS.split(','), credentials: true },
})
export class BoardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server
  private readonly log = new Logger(BoardGateway.name)

  constructor(private boards: BoardService, private jwt: JwtService) {}

  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth?.token as string | undefined
      if (!token) return socket.disconnect(true)
      const payload = this.jwt.verify(token, { secret: env.JWT_SECRET }) as { sub: string; email: string; role: string }
      socket.data.user = { id: payload.sub, email: payload.email, role: payload.role }
    } catch (e) {
      this.log.warn(`Socket auth failed: ${(e as Error).message}`)
      socket.disconnect(true)
    }
  }

  handleDisconnect(socket: Socket) {
    for (const room of socket.rooms) {
      if (room.startsWith('board:')) this.broadcastPresence(room)
    }
  }

  @SubscribeMessage('board:join')
  async onJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: { boardId: string }) {
    await this.boards.ensureMember(body.boardId, socket.data.user.id)
    const room = `board:${body.boardId}`
    await socket.join(room)
    this.broadcastPresence(room)
    return { ok: true }
  }

  @SubscribeMessage('board:op')
  async onOp(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { boardId: string; op: unknown; clientOpId: string },
  ) {
    const op = await this.boards.appendOp({
      boardId: body.boardId,
      userId: socket.data.user.id,
      op: body.op,
      clientOpId: body.clientOpId,
    })
    this.server.to(`board:${body.boardId}`).emit('board:op', op)
    return { ok: true, seq: op.seq }
  }

  @SubscribeMessage('board:cursor')
  onCursor(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { boardId: string; x: number; y: number },
  ) {
    socket.to(`board:${body.boardId}`).emit('board:cursor', {
      userId: socket.data.user.id,
      x: body.x,
      y: body.y,
    })
  }

  private async broadcastPresence(room: string) {
    const sockets = await this.server.in(room).fetchSockets()
    const users = sockets.map((s) => s.data.user).filter(Boolean)
    this.server.to(room).emit('board:presence', { users })
  }
}
