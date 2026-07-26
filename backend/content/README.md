# Contenido de aprendizaje versionado (seed automático)

Este folder es la **fuente de verdad** del contenido de aprendizaje. Al arrancar
el backend (local o Railway), `ContentSyncService` lee `index.json` y hace upsert
de módulos y lecciones — con solo hacer push, el contenido queda cargado en
productivo sin pasos manuales, igual que si se hubiera subido desde el admin.

## Estructura

```
content/
  index.json            ← manifiesto GENERADO (no editar a mano)
  ESTANDAR-HTML.md      ← el estándar que debe cumplir todo HTML de contenido
  INSTRUCCIONES-AGENTE.md
  beginner/
    u1-m01/             ← unidad 1, módulo 1
      lesson.html       ← lección interactiva
      extra.html        ← actividad extra (opcional)
      guide.html        ← guía de estudio (opcional)
    u1-checkpoint/
      checkpoint.html   ← checkpoint de la unidad
```

Los HTML **no se procesan en build**: cada archivo cumple el estándar en su
propio código (viewport, CSS responsive propio y el bloque `FreaknActivity` con
sus llamadas a `submit`). Así, un HTML nuevo hecho por el equipo o por un GPT
se comporta igual sin depender del pipeline. Ver `ESTANDAR-HTML.md`.

## Flujo para agregar o cambiar contenido

1. Crea/edita el HTML en `content/beginner/<carpeta>/` siguiendo
   `ESTANDAR-HTML.md`.
2. Regenera el índice:
   ```bash
   node scripts/build-content.mjs
   ```
   Lee las carpetas, deduce unidad/módulo del nombre (`u<N>-m<NN>`) y arma
   `index.json` con títulos tomados del `<title>` de cada lección.
3. Valida:
   ```bash
   node scripts/check-standard.mjs            # estructura: viewport, bloque, media query, submit
   node scripts/verify-html-runtime.mjs u1    # comportamiento: abre en Chrome a 375px
   ```
   El segundo es el que importa: mide el ancho real, detecta errores de JS y
   comprueba que el envío produzca un payload válido.
4. Commit + push → Railway arranca y sincroniza.

## Scripts

| Script | Para qué |
| --- | --- |
| `build-content.mjs` | Genera `index.json` desde `content/beginner/`. |
| `check-standard.mjs` | Revisión estructural rápida de los 131 archivos. |
| `verify-html-runtime.mjs` | Validación real en Chrome headless (responsive + envío). |
| `drive-manifest.tsv` | Mapa `destino → fileId` del Drive original, por si hay que rebajar algo. |

## Checkpoints

Los checkpoints son HTML como cualquier otro, con `activityId: "checkpoint"` y
la obligación de reportar **todas** las respuestas al mostrar el resultado.
Pueden ir como módulo aparte (cierre de unidad) o intercalados entre lecciones;
el bloqueo de lo que viene después lo maneja la plataforma, no el HTML.
