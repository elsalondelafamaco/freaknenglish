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
import { BoardService, MAX_UPDATE_BYTES } from './board.service'
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
      this.registrarSalida(socket)
    } catch (e) {
      this.log.warn(`Socket auth failed: ${(e as Error).message}`)
      // Se avisa ANTES de cortar para que el cliente distinga "se me venció la
      // sesión" (hay que renovar el token y reconectar) de "me sacaron". El
      // token dura 15 minutos y una clase dura 50, así que esto pasa en toda
      // clase larga; sin la señal, el socket quedaba muerto hasta recargar.
      socket.emit('auth:expired')
      socket.disconnect(true)
    }
  }

  /**
   * `disconnecting` y no `disconnect`: socket.io VACÍA `socket.rooms` antes de
   * emitir `disconnect`, así que este bucle no recorría nada y la presencia
   * nunca se refrescaba al irse alguien — los puntitos seguían mostrando a
   * quien ya había cerrado.
   */
  handleDisconnect(socket: Socket) {
    void socket
  }

  private registrarSalida(socket: Socket) {
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('board:')) this.broadcastPresence(room)
        // Las salas de página también: antes ni siquiera se contemplaban.
        if (room.startsWith('page:')) this.broadcastPagePresence(room)
      }
    })
  }

  /**
   * Reemite a la sala una operación que llegó por el camino REST.
   *
   * El fallback REST guardaba pero no avisaba a nadie, así que todo lo escrito
   * cuando el socket no respondía solo aparecía al recargar la página — que es
   * exactamente lo que reportaban los profes.
   */
  broadcastPageOp(pageId: string, op: { seq: number; userId: string; clientOpId: string }, updateB64: string) {
    if (!this.server) return
    // `server.to` incluye al autor, pero el cliente ya descarta sus propias
    // operaciones por `clientOpId` y aplicar un update de Yjs dos veces es
    // idempotente, así que no hace daño.
    this.server.to(`page:${pageId}`).emit('page:update', {
      seq: op.seq,
      userId: op.userId,
      clientOpId: op.clientOpId,
      update: updateB64,
    })
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

  // ─── Page-scoped Yjs sync ───────────────────────────────────────
  @SubscribeMessage('page:join')
  async onPageJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { pageId: string },
  ) {
    const state = await this.boards.getPageState(body.pageId, socket.data.user.id)
    const room = `page:${body.pageId}`
    await socket.join(room)
    this.broadcastPagePresence(room)
    return { ok: true, ...state }
  }

  @SubscribeMessage('page:leave')
  async onPageLeave(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { pageId: string },
  ) {
    const room = `page:${body.pageId}`
    await socket.leave(room)
    this.broadcastPagePresence(room)
    return { ok: true }
  }

  @SubscribeMessage('page:update')
  async onPageUpdate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { pageId: string; update: string; clientOpId: string },
  ) {
    const buffer = Buffer.from(body.update, 'base64')
    if (buffer.length === 0) return { ok: false, error: 'empty_update' }
    // `too_large` va aparte de cualquier otro fallo: al cliente le sirve para
    // saber que reintentar no arregla nada y que hay que avisarle al profe.
    if (buffer.length > MAX_UPDATE_BYTES) {
      this.log.warn(`page:update rechazado por tamaño: ${buffer.length} bytes (page ${body.pageId})`)
      return { ok: false, error: 'too_large', max: MAX_UPDATE_BYTES, size: buffer.length }
    }
    const op = await this.boards.appendPageOp({
      pageId: body.pageId,
      userId: socket.data.user.id,
      update: buffer,
      clientOpId: body.clientOpId,
    })
    // Broadcast to peers (skip sender to avoid echo)
    socket.to(`page:${body.pageId}`).emit('page:update', {
      seq: op.seq,
      userId: op.userId,
      clientOpId: op.clientOpId,
      update: body.update,
    })
    return { ok: true, seq: op.seq }
  }

  @SubscribeMessage('page:awareness')
  onPageAwareness(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { pageId: string; update: string },
  ) {
    socket.to(`page:${body.pageId}`).emit('page:awareness', {
      userId: socket.data.user.id,
      update: body.update,
    })
  }

  private async broadcastPagePresence(room: string) {
    const sockets = await this.server.in(room).fetchSockets()
    const users = sockets.map((s) => s.data.user).filter(Boolean)
    this.server.to(room).emit('page:presence', { users })
  }

  private async broadcastPresence(room: string) {
    const sockets = await this.server.in(room).fetchSockets()
    const users = sockets.map((s) => s.data.user).filter(Boolean)
    this.server.to(room).emit('board:presence', { users })
  }
}
