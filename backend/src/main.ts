import { NestFactory } from '@nestjs/core'
import { ValidationPipe, VersioningType } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { Logger } from 'nestjs-pino'
import cookieParser from 'cookie-parser'
import express from 'express'
import { AppModule } from './app.module'
import { RedisIoAdapter } from './modules/board/redis-io.adapter'
import { env } from './config/env'

// Trazas crudas (stdout directo) para diagnosticar arranques que mueren sin log.
console.log('[boot] main.ts cargado. PORT=', process.env.PORT, 'NODE_ENV=', process.env.NODE_ENV)

async function bootstrap() {
  console.log('[boot] creando app Nest...')
  const app = await NestFactory.create(AppModule, { bufferLogs: false })
  console.log('[boot] app Nest creada')
  app.useLogger(app.get(Logger))

  app.setGlobalPrefix('api')
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })

  app.use(cookieParser())

  // Raw body ONLY for Wompi webhook so we can verify HMAC signature on bytes.
  app.use(
    '/api/v1/public/wompi/webhook',
    express.raw({ type: 'application/json', limit: '1mb' }),
  )

  app.enableCors({
    origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
  })

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))

  // Redis adapter para Socket.IO. Con timeout duro: node-redis puede COLGARSE al
  // conectar (no rechaza) y dejaría el arranque bloqueado para siempre. Si no
  // conecta en 8s, seguimos con el adapter por defecto (instancia única).
  console.log('[boot] conectando Redis (Socket.IO)...')
  try {
    const ioAdapter = new RedisIoAdapter(app)
    await Promise.race([
      ioAdapter.connectToRedis(),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error('timeout 8s conectando a Redis')), 8000),
      ),
    ])
    app.useWebSocketAdapter(ioAdapter)
    console.log('[boot] Redis Socket.IO OK')
  } catch (err) {
    console.error(
      '[boot] Redis Socket.IO no disponible, sigo con adapter por defecto:',
      (err as Error)?.message ?? err,
    )
  }

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Freakn API')
    .setDescription('Freakn English 1-on-1 backend API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build()
  const doc = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api/docs', app, doc)

  console.log('[boot] app.listen en :' + env.PORT)
  await app.listen(env.PORT, '0.0.0.0')
  console.log(`▲ Freakn backend listening on :${env.PORT}`)
}

bootstrap().catch((err) => {
  // Sin esto, un fallo de arranque muere en silencio.
  console.error('[bootstrap] Error fatal al iniciar el backend:', err)
  process.exit(1)
})
