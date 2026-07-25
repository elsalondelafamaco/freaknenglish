# Contenido de aprendizaje versionado (seed automático)

Este folder es la **fuente de verdad** del contenido de los módulos de aprendizaje.
Al arrancar el backend (local o Railway), `ContentSyncService` lee `index.json` y
hace upsert de módulos y lecciones — así, con solo hacer push, el contenido queda
cargado en productivo sin pasos manuales.

## Estructura

```
content/
  index.json               ← manifiesto (módulos + lecciones, en orden)
  _shared/
    freakn-standard.html   ← fragmento inyectado a cada lección (CSS responsive + bridge JS)
  beginner/
    01-<slug>/
      lesson.html          ← lección principal (procesada: responsive + bridge)
      activity.html        ← (opcional) actividad extra
```

## `index.json`

```json
{
  "modules": [
    {
      "id": "beg-01-greetings",          // estable: NO cambiar entre deploys
      "level": "beginner",
      "title": "Greetings & Introductions",
      "description": "…",
      "position": 1,
      "lessons": [
        {
          "id": "beg-01-greetings-lesson", // estable
          "title": "Lesson: Greetings",
          "position": 1,
          "durationMin": 25,
          "kind": "html",
          "file": "beginner/01-greetings/lesson.html"
        }
      ]
    }
  ]
}
```

## Procesar HTML crudo (Drive → estándar)

```bash
node scripts/process-lesson.mjs <in.html> <out.html>
```

El procesador: agrega `<meta viewport>`, inyecta `_shared/freakn-standard.html`
(overrides responsive + bridge `FreaknActivity`) y deja el HTML listo. Después de
procesar, revisa manualmente que las actividades llamen a
`FreaknActivity.submit(...)` al calificar (ver contrato en `_shared`).

## Contrato del bridge (estandarización de actividades)

Toda actividad interactiva debe reportar su resultado así:

```js
FreaknActivity.submit({
  activityId: "quiz",            // id estable dentro de la lección
  title: "Quiz: Greetings",      // legible
  score: 8,                       // puntos obtenidos (opcional)
  maxScore: 10,                   // puntaje máximo (opcional)
  answers: [                      // respuestas estandarizadas
    { id: "q1", question: "How do you say…?", answer: "Hello", correct: true, expected: "Hello" }
  ]
});
```

El viewer de la plataforma escucha el `postMessage` y guarda el resultado en
`activity_results` (un registro por usuario+lección+actividad; los re-intentos
actualizan y suman `attempts`). El admin ve los resultados de todos los
estudiantes y cada profesor los de sus estudiantes asignados.
