import * as fs from 'node:fs'
// Solo tipos: se borra al compilar, no altera el orden real de imports que
// vigilan las trazas de arranque de abajo.
import type { NextFunction, Request, Response } from 'express'

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
  // Ambas rutas apuntan al mismo handler: `public/wompi/webhook` es la
  // canónica y `checkout/wompi/webhook` es el alias histórico que quedó
  // configurado en el panel de Wompi. Las dos necesitan el body crudo.
  for (const ruta of ['/api/v1/public/wompi/webhook', '/api/v1/checkout/wompi/webhook']) {
    app.use(ruta, express.raw({ type: 'application/json', limit: '1mb' }))
  }
  app.use(express.json({ limit: '5mb' }))
  app.use(express.urlencoded({ extended: true, limit: '5mb' }))

  // Cabeceras de seguridad. Es una API JSON (no sirve HTML), así que se
  // aplican las que aportan aquí, sin arrastrar una dependencia extra:
  //  · nosniff        — impide que el navegador adivine el tipo de contenido
  //  · DENY en frames — la API no debe embeberse en un iframe (clickjacking)
  //  · no-referrer    — no filtra URLs internas al navegar hacia afuera
  //  · HSTS           — solo en producción (en local rompería http://)
  //  · sin X-Powered-By — deja de anunciar que corre Express
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
    if (env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }
    next()
  })
  app.getHttpAdapter().getInstance().disable('x-powered-by')
  app.enableCors({
    origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
  })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))

  out('conectando Redis (timeout 8s)...')
  const ioAdapter = new RedisIoAdapter(app)
  try {
    await Promise.race([
      ioAdapter.connectToRedis(),
      new Promise((_r, rej) => setTimeout(() => rej(new Error('redis timeout 8s')), 8000)),
    ])
    out('Redis OK')
  } catch (e) {
    berr(
      'Redis omitido — TIEMPO REAL SOLO DENTRO DE ESTA INSTANCIA: con más de una ' +
        'réplica, lo que escribe un usuario NO le llega a otro conectado a otra. ' +
        ((e as Error)?.message ?? String(e)),
    )
  }
  // FUERA del try a propósito. Antes estaba dentro, así que al fallar Redis se
  // perdía también el `createIOServer` del adaptador —y con él el
  // `maxHttpBufferSize` de 8 MB—, volviendo al de 1 MB de Socket.IO, que ante
  // un frame grande CIERRA la conexión sin dar error. El adaptador ya no hace
  // nada con Redis si no se conectó, así que aplicarlo siempre es seguro.
  app.useWebSocketAdapter(ioAdapter)

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
