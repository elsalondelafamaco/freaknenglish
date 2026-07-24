/**
 * Env vars centralizadas con tipos.
 *
 * Migración:
 *   - Browser actual: `import.meta.env.VITE_*`
 *   - Server actual (TanStack Start): `process.env.*`
 *   - Next.js / Node en Railway:
 *       Browser  → `process.env.NEXT_PUBLIC_*`
 *       Server   → `process.env.*`
 *
 *   Para portar basta cambiar el cuerpo de getters, NO los call sites.
 */

function readPublic(key: string, fallback = ""): string {
  // VITE_* en el cliente; en Next sería NEXT_PUBLIC_*
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (import.meta as any).env ?? {};
  return (env[`VITE_${key}`] as string | undefined) ?? fallback;
}

export const publicEnv = {
  /** Public key del Widget de Wompi (pub_test_... / pub_prod_...) */
  wompiPublicKey: () => readPublic("WOMPI_PUBLIC_KEY", "pub_test_placeholder"),
  /** Moneda (Wompi Colombia siempre COP) */
  currency: () => readPublic("CURRENCY", "COP"),
  /** Origin público para construir redirect URLs */
  appOrigin: () =>
    readPublic(
      "APP_ORIGIN",
      typeof window !== "undefined" ? window.location.origin : "",
    ),
};

/**
 * Secrets server-side. NO usar desde el browser.
 * En Lovable Cloud se inyectan vía `process.env.*` dentro de server fns/handlers.
 */
export const serverEnvKeys = {
  resend: "RESEND_API_KEY",
  wompiEvents: "WOMPI_EVENTS_KEY",
} as const;