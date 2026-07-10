import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_CALLBACK_URL: z.string().optional().default(''),
  RESEND_API_KEY: z.string().optional().default(''),
  RESEND_FROM: z.string().default('Freakn <hola@freakn.com>'),
  RESEND_REPLY_TO: z.string().optional().default(''),
  BRAND_NAME: z.string().default('Freakn English'),
  BRAND_TAGLINE: z.string().default('1 a 1 en vivo'),
  BRAND_COLOR: z.string().default('#FEF6C7'),
  BRAND_INK: z.string().default('#0A0A0A'),
  BRAND_ACCENT: z.string().default('#0A0A0A'),
  BRAND_LOGO_URL: z.string().optional().default(''),
  BRAND_SUPPORT_EMAIL: z.string().optional().default(''),
  WOMPI_PUBLIC_KEY: z.string().optional().default(''),
  WOMPI_PRIVATE_KEY: z.string().optional().default(''),
  WOMPI_INTEGRITY_SECRET: z.string().optional().default(''),
  WOMPI_EVENTS_SECRET: z.string().optional().default(''),
  WOMPI_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  PUBLIC_SITE_URL: z.string().url().default('https://freaknenglish.com'),
  CORS_ORIGINS: z.string().default('https://freaknenglish.com,http://localhost:5173'),
  TEACHER_PAYRATE_COP: z.coerce.number().default(15000),
})

export const env = schema.parse(process.env)
export type Env = z.infer<typeof schema>
