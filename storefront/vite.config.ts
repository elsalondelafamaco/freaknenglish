// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Proxy opcional del dev server hacia una API remota (p. ej. la de producción)
// para revisar la home con el contenido real del CMS. Se activa SOLO si defines
// `VITE_API_PROXY_TARGET` en tu `.env.local`; sin esa variable el
// comportamiento es idéntico al de siempre.
//
// Hace falta porque la API responde `Cross-Origin-Resource-Policy: same-site`:
// desde `freaknenglish.com` las imágenes cargan, pero desde `localhost` el
// navegador las bloquea (ERR_BLOCKED_BY_RESPONSE.NotSameSite). Al pasarlas por
// el proxy quedan en el mismo origen y el bloqueo desaparece.
const apiProxyTarget = loadEnv(
  process.env.NODE_ENV ?? "development",
  process.cwd(),
  "",
).VITE_API_PROXY_TARGET;

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this.
    server: { entry: "server" },
  },
  // Force Nitro's standalone Node server preset for Railway. The Lovable wrapper
  // defaults Nitro to `cloudflare-module`; this top-level `nitro.preset` override
  // is the documented way to hard-pin the target outside a Lovable build, so the
  // build emits a .output/server/index.mjs that opens an HTTP listener on PORT.
  nitro: { preset: "node-server" },
  vite: {
    ...(apiProxyTarget
      ? {
          server: {
            proxy: {
              "/api/v1": { target: apiProxyTarget, changeOrigin: true, secure: true },
            },
          },
        }
      : {}),
    plugins: [
      // D9 · PWA offline básica para el catálogo Learning.
      // Registro guardado desde src/lib/pwa/register.ts (nunca en dev/iframe/preview).
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        strategies: "generateSW",
        filename: "sw.js",
        devOptions: { enabled: false },
        includeAssets: [
          "favicon-16.png",
          "favicon-32.png",
          "apple-touch-icon.png",
          "icon-192.png",
          "icon-512.png",
          "icon-maskable-512.png",
          "manifest.webmanifest",
        ],
        workbox: {
          navigateFallback: "/",
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
          globPatterns: ["**/*.{js,css,html,svg,png,ico,webp,woff2}"],
          runtimeCaching: [
            {
              // HTML navigations → NetworkFirst
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "html-nav",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
            {
              // Learning API → SWR
              urlPattern: /\/api\/v1\/learning\//,
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "learning-api",
                expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Imágenes de lecciones → CacheFirst con LRU
              urlPattern: ({ request, url }) =>
                request.destination === "image" && !url.pathname.startsWith("/api/"),
              handler: "CacheFirst",
              options: {
                cacheName: "images",
                expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
  },
});
