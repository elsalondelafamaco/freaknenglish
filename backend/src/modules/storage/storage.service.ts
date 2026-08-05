import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'node:crypto'

export interface SignUploadInput {
  filename: string
  contentType?: string
  /** Prefix dentro del bucket (e.g. `lessons/${lessonId}`). */
  prefix?: string
  /**
   * Clave EXACTA dentro del bucket (sin uuid). Para assets del sitio cuya URL
   * debe ser estable entre re-subidas (e.g. `site/hero-image`): reemplazar el
   * archivo no cambia la URL pública.
   */
  fixedKey?: string
}

export interface SignUploadResult {
  uploadUrl: string
  publicUrl: string
  storageKey: string
  expiresIn: number
}

/**
 * Wrapper sobre el SDK v3 de AWS S3 apuntado a MinIO/S3 indistintamente.
 *
 * Flujo desde el storefront:
 *  1. Frontend → `POST /admin/uploads/sign` con `filename`, `contentType`.
 *  2. Backend devuelve `{ uploadUrl, publicUrl, storageKey }`.
 *  3. Frontend hace `PUT uploadUrl` con el binario (sin pasar por el backend).
 *  4. Frontend persiste `publicUrl` en la lección.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name)
  private readonly client: S3Client
  private readonly bucket = process.env.S3_BUCKET ?? 'freakn-cms'
  private readonly publicBase =
    process.env.S3_PUBLIC_URL ?? `${process.env.S3_ENDPOINT}/${this.bucket}`
  private readonly ttl = Number(process.env.S3_SIGNED_URL_TTL ?? 900)

  constructor() {
    this.client = new S3Client({
      region: process.env.S3_REGION ?? 'us-east-1',
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? '',
        secretAccessKey: process.env.S3_SECRET_KEY ?? '',
      },
    })
  }

  /**
   * Al arrancar, garantiza que el bucket exista y que sus objetos sean
   * públicos de lectura (los `publicUrl` se sirven sin firmar). Es idempotente
   * y NO bloquea el arranque: si MinIO no está disponible todavía solo registra
   * una advertencia, de modo que el healthcheck del backend nunca falle por esto.
   */
  onModuleInit(): void {
    if (!process.env.S3_ENDPOINT) return
    void this.ensureBucket()
  }

  private async ensureBucket(): Promise<void> {
    try {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
      } catch {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }))
        this.logger.log(`Bucket "${this.bucket}" creado.`)
      }
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'PublicRead',
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${this.bucket}/*`],
          },
        ],
      }
      await this.client.send(
        new PutBucketPolicyCommand({
          Bucket: this.bucket,
          Policy: JSON.stringify(policy),
        }),
      )
      this.logger.log(`Bucket "${this.bucket}" listo (política de lectura pública aplicada).`)
    } catch (err) {
      this.logger.warn(
        `No se pudo preparar el bucket "${this.bucket}" (se reintentará en el próximo arranque): ${(err as Error).message}`,
      )
    }
  }

  async signUpload(input: SignUploadInput): Promise<SignUploadResult> {
    const safe = input.filename.replace(/[^a-zA-Z0-9._-]+/g, '_')
    const prefix = input.prefix?.replace(/^\/+|\/+$/g, '') ?? 'uploads'
    const storageKey = input.fixedKey
      ? input.fixedKey.replace(/^\/+/, '')
      : `${prefix}/${randomUUID()}-${safe}`
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: input.contentType,
    })
    const uploadUrl = await getSignedUrl(this.client, cmd, { expiresIn: this.ttl })
    return {
      uploadUrl,
      publicUrl: `${this.publicBase}/${storageKey}`,
      storageKey,
      expiresIn: this.ttl,
    }
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      )
    } catch (err) {
      this.logger.warn(`No se pudo eliminar ${storageKey}: ${(err as Error).message}`)
    }
  }

  // ─── Explorador de archivos (módulo Storage del admin) ────────────────

  /** URL pública de una clave. Los objetos del bucket son de lectura pública. */
  publicUrlFor(storageKey: string): string {
    return `${this.publicBase}/${storageKey}`
  }

  /**
   * Lista objetos del bucket, paginado. `prefix` filtra por carpeta
   * (`site/`, `lessons/`…) y `cursor` es el token de continuación de S3.
   */
  async list(opts: { prefix?: string; cursor?: string; limit?: number } = {}): Promise<{
    items: Array<{ key: string; size: number; lastModified: string | null; url: string }>
    nextCursor: string | null
    /** "Carpetas" (prefijos comunes) cuando no se pide una en concreto. */
    folders: string[]
  }> {
    const res = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: opts.prefix || undefined,
        MaxKeys: Math.min(1000, Math.max(1, opts.limit ?? 200)),
        ContinuationToken: opts.cursor || undefined,
      }),
    )
    const items = (res.Contents ?? [])
      // S3 devuelve la propia "carpeta" como objeto de 0 bytes: no es un archivo.
      .filter((o) => o.Key && !o.Key.endsWith('/'))
      .map((o) => ({
        key: o.Key!,
        size: o.Size ?? 0,
        lastModified: o.LastModified ? o.LastModified.toISOString() : null,
        url: this.publicUrlFor(o.Key!),
      }))
    // Primer segmento de cada clave = carpeta, para poder filtrar en la UI.
    const folders = [...new Set(items.map((i) => i.key.split('/')[0]).filter(Boolean))].sort()
    return { items, nextCursor: res.NextContinuationToken ?? null, folders }
  }

  /**
   * Renombra (mueve) un objeto: S3 no tiene rename, así que se copia y se
   * borra el original. Falla si el destino ya existe, para no pisar archivos
   * por accidente.
   */
  async rename(from: string, to: string): Promise<{ key: string; url: string }> {
    if (!from || !to) throw new BadRequestException('Origen y destino son obligatorios')
    if (from === to) return { key: to, url: this.publicUrlFor(to) }
    let existe = true
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: to }))
    } catch {
      existe = false
    }
    // 400 y no 500: es un choque esperable y el admin necesita leer el motivo.
    if (existe) throw new BadRequestException(`Ya existe un archivo en "${to}"`)

    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        // CopySource va con el bucket delante y URL-encoded.
        CopySource: `/${this.bucket}/${encodeURIComponent(from).replace(/%2F/g, '/')}`,
        Key: to,
      }),
    )
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: from }))
    return { key: to, url: this.publicUrlFor(to) }
  }

  /** Borra varios objetos de un tirón. Devuelve cuántos se eliminaron. */
  async deleteMany(keys: string[]): Promise<number> {
    const limpias = keys.filter(Boolean)
    if (limpias.length === 0) return 0
    const res = await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: limpias.map((Key) => ({ Key })), Quiet: true },
      }),
    )
    const errores = res.Errors ?? []
    for (const e of errores) this.logger.warn(`No se pudo eliminar ${e.Key}: ${e.Message}`)
    return limpias.length - errores.length
  }
}
