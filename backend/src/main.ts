import { NestFactory } from '@nestjs/core'
import { ValidationPipe, VersioningType } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { Logger } from 'nestjs-pino'
import cookieParser from 'cookie-parser'
import express from 'express'
import { AppModule } from './app.module'
import { RedisIoAdapter } from './modules/board/redis-io.adapter'
import { env } from './config/env'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
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

  // Redis adapter for Socket.IO (board realtime)
  const ioAdapter = new RedisIoAdapter(app)
  await ioAdapter.connectToRedis()
  app.useWebSocketAdapter(ioAdapter)

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Freakn API')
    .setDescription('Freakn English 1-on-1 backend API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build()
  const doc = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api/docs', app, doc)

  await app.listen(env.PORT, '0.0.0.0')
  console.log(`▲ Freakn backend listening on :${env.PORT}`)
}
bootstrap()
