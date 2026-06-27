# PWA & Store Packaging

## Estado actual (Lovable / TanStack Start)

- Web App Manifest: `public/manifest.webmanifest`.
- Icons: `public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon-16.png`, `favicon-32.png`.
- Head tags wired en `src/routes/__root.tsx` (manifest, theme-color, apple-touch-icon, apple-mobile-web-app-*).
- **No service worker.** Decisión: instalable + add-to-home-screen es suficiente para v1. Offline real se evaluará después.

### Shortcuts del manifest
- `/app` — Mi dashboard
- `/app/calendar` — Calendario
- `/app/learning` — Módulos

### Theme
- `theme_color`: `#FBE34B` (amarillo marca)
- `background_color`: `#FEF6C7` (crema hero)
- `display`: `standalone`, orientación `portrait`.

## Migración a Next.js + Railway

1. Copiar `public/manifest.webmanifest` y todos los `public/*.png` tal cual a `next-app/public/`.
2. En `app/layout.tsx` exportar `metadata` con `manifest`, `themeColor`, `appleWebApp`, `icons` (Next.js Metadata API ya cubre todos los tags actuales).
3. Si se requiere offline en el futuro: usar `next-pwa` con `NetworkFirst` en navegaciones, nunca `CacheFirst` en HTML.
4. iOS/Android cachean `start_url`, `id`, `scope` y `display` al instalar — no cambiarlos sin un rollout pensado.

## Empaquetado a tiendas (futuro)

### Google Play (TWA con Bubblewrap)
- Requiere dominio publicado con HTTPS y `assetlinks.json` en `/.well-known/assetlinks.json`.
- `bubblewrap init --manifest=https://app.freakn.io/manifest.webmanifest`.
- Firmar APK/AAB y publicar como Trusted Web Activity.

### App Store (iOS)
- Apple no acepta PWAs directas. Opciones:
  - **Capacitor** envolviendo la URL publicada (recomendado, reutiliza la web).
  - Reescribir como app nativa (fuera del alcance de v1).
- Capacitor: `npx cap init Freakn io.freakn.app`, agregar plataforma iOS, `server.url` apuntando a producción para iterar sin re-publicar.

### Iconos requeridos por tienda
- Play: 512x512 (ya generado) + feature graphic 1024x500 (pendiente, marketing).
- App Store: 1024x1024 sin transparencia (pendiente, marketing).

## Checklist al publicar
- [ ] HTTPS obligatorio (Railway/Vercel ya lo dan).
- [ ] Lighthouse PWA score > 90.
- [ ] Probar "Add to Home Screen" en Safari iOS y Chrome Android.
- [ ] Verificar que `theme-color` se aplica a la barra del navegador.