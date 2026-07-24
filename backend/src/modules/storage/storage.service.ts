import { Injectable, Logger } from '@nestjs/common'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'node:crypto'

export interface SignUploadInput {
  filename: string
  contentType?: string
  /** Prefix dentro del bucket (e.g. `lessons/${lessonId}`). */
  prefix?: string
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
export class StorageService {
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

  async signUpload(input: SignUploadInput): Promise<SignUploadResult> {
    const safe = input.filename.replace(/[^a-zA-Z0-9._-]+/g, '_')
    const prefix = input.prefix?.replace(/^\/+|\/+$/g, '') ?? 'uploads'
    const storageKey = `${prefix}/${randomUUID()}-${safe}`
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
}