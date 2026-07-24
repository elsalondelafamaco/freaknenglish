import { INestApplicationContext } from '@nestjs/common'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'
import { ServerOptions } from 'socket.io'
import { env } from '../../config/env'

/**
 * Redis adapter so the Socket.IO board namespace works across multiple
 * Nest instances (Railway can horizontally scale). In local dev with one
 * process Redis is still required because BullMQ uses it too.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterCtor: ReturnType<typeof createAdapter> | null = null

  constructor(app: INestApplicationContext) {
    super(app)
  }

  async connectToRedis() {
    const pub = createClient({ url: env.REDIS_URL })
    const sub = pub.duplicate()
    await Promise.all([pub.connect(), sub.connect()])
    this.adapterCtor = createAdapter(pub, sub)
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()),
        credentials: true,
      },
    })
    if (this.adapterCtor) server.adapter(this.adapterCtor)
    return server
  }
}
