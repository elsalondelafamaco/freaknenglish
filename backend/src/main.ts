import * as fs from 'node:fs'

// Railway envía stdout/stderr a un pipe ASÍNCRONO: si el proceso muere o se
// cuelga en la carga de módulos, ese buffer se descarta y no vemos nada. Por eso
// escribimos las trazas de arranque con fs.writeSync (síncrono, se vacía ya).
const out = (m: string) => {
  try {
    fs.writeSync(1, `[boot] ${m}\n`)
  } catch {}
}
const berr = (m: string) => {
  try {
    fs.writeSync(2, `[boot-err] ${m}\n`)
  } catch {}
}

process.on('uncaughtException', (e) => {
  berr('uncaughtException: ' + ((e as Error)?.stack ?? String(e)))
  process.exit(1)
})
process.on('unhandledRejection', (e) => {
  berr('unhandledRejection: ' + ((e as Error)?.stack ?? String(e)))
  process.exit(1)
})

out('BOOT_TRACE_MARKER_V1 main.ts top reached; PORT=' + process.env.PORT + ' NODE_ENV=' + process.env.NODE_ENV)

async function bootstrap() {
  out('import @nestjs/core')
  const { NestFactory } = await import('@nestjs/core')
  out('import @nestjs/common')
  const { ValidationPipe, VersioningType } = await import('@nestjs/common')
  out('import @nestjs/swagger')
  const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger')
  out('import nestjs-pino')
  const { Logger } = await import('nestjs-pino')
  out('import cookie-parser')
  const cookieParser = (await import('cookie-parser')).default
  out('import express')
  const express = (await import('express')).default
  out('import ./config/env')
  const { env } = await import('./config/env')
  out('env OK; env.PORT=' + env.PORT)
  out('import ./app.module (carga TODOS los módulos)')
  const { AppModule } = await import('./app.module')
  out('AppModule import OK')
  out('import RedisIoAdapter')
  const { RedisIoAdapter } = await import('./modules/board/redis-io.adapter')

  out('NestFactory.create(AppModule)...')
  // bodyParser:false — lo registramos manualmente para que el webhook de Wompi
  // reciba el body CRUDO (verificación HMAC). Con el parser global activo,
  // json() y raw() leían el mismo stream dos veces → 500 "stream is not
  // readable" en todos los webhooks.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, bodyParser: false })
  out('app creada')
  app.useLogger(app.get(Logger))

  app.setGlobalPrefix('api')
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
  app.use(cookieParser())
  // Orden importa: raw primero (marca req._body y json lo respeta después).
  app.use(
    '/api/v1/public/wompi/webhook',
    express.raw({ type: 'application/json', limit: '1mb' }),
  )
  app.use(express.json({ limit: '5mb' }))
  app.use(express.urlencoded({ extended: true, limit: '5mb' }))
  app.enableCors({
    origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
  })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))

  out('conectando Redis (timeout 8s)...')
  try {
    const ioAdapter = new RedisIoAdapter(app)
    await Promise.race([
      ioAdapter.connectToRedis(),
      new Promise((_r, rej) => setTimeout(() => rej(new Error('redis timeout 8s')), 8000)),
    ])
    app.useWebSocketAdapter(ioAdapter)
    out('Redis OK')
  } catch (e) {
    berr('Redis omitido: ' + ((e as Error)?.message ?? String(e)))
  }

  out('Swagger...')
  const config = new DocumentBuilder()
    .setTitle('Freakn API')
    .setDescription('FreaknEnglish 1-on-1 backend API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build()
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config))

  out('app.listen(' + env.PORT + ')...')
  await app.listen(env.PORT, '0.0.0.0')
  out('LISTENING on :' + env.PORT)
}

bootstrap().catch((e) => {
  berr('bootstrap fatal: ' + ((e as Error)?.stack ?? String(e)))
  process.exit(1)
})
