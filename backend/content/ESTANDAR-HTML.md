# Estándar Freakn para lecciones y checkpoints en HTML

Todo HTML de contenido (lección, actividad extra, guía o checkpoint) debe cumplir
este estándar **en su propio código fuente**. No hay wrappers ni scripts
inyectados en build: lo que está en el archivo es lo que corre. Así, un HTML
nuevo hecho por el equipo se comporta igual sin depender del pipeline.

---

## 1. Cabecera obligatoria

```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
```

## 2. Responsive real (no parches genéricos)

El HTML debe verse bien en **mobile (360–430px)** y **desktop**. Reglas:

- Ningún desborde horizontal: `document.body.scrollWidth <= clientWidth`.
- Layouts de dos columnas (`.layout-split > .half`, `grid-cols-2`, `w-1/2`…)
  se **apilan** en mobile con un `@media (max-width: 820px)` escrito en el
  `<style>` propio del archivo, ajustado a SUS clases reales.
- Tipografías gigantes de deck (`text-6xl`, `text-8xl`) bajan a tamaños legibles.
- Paddings de `3–5rem` bajan a `1rem`.
- Botones: mínimo 44px de alto y `font-size: 16px` (evita zoom en iOS).
- Barras de navegación entre slides: los botones deben caber (o envolver).
- El deck puede seguir siendo pantalla completa, pero el contenido de cada
  slide debe poder hacer scroll vertical si no cabe.

## 3. Bloque estándar `FreaknActivity` (copiar tal cual)

Va una sola vez, antes del `</body>` o al inicio del `<script>` principal:

```html
<script>
  /* FREAKN ACTIVITY API v1 — puente con la plataforma.
     Si el HTML se abre fuera de la app, no hace nada (no rompe). */
  window.FreaknActivity = (function () {
    function post(type, payload) {
      try { parent.postMessage({ source: "freakn-lesson", type: type, payload: payload }, "*"); }
      catch (e) {}
    }
    return {
      /** Reporta el resultado de una actividad calificable. */
      submit: function (r) {
        post("freakn:activity:result", {
          activityId: r.activityId,          // id estable dentro del archivo
          title: r.title || document.title,  // nombre legible
          score: r.score,                    // puntos obtenidos
          maxScore: r.maxScore,              // puntaje máximo
          answers: r.answers || []           // ver formato abajo
        });
      },
      /** Marca la lección como vista/terminada (sin puntaje). */
      complete: function () { post("freakn:lesson:complete", {}); }
    };
  })();
</script>
```

### Formato de `answers`

```js
[
  {
    id: "q1",                       // id estable de la pregunta
    question: "How do you greet…?", // enunciado legible
    answer: "Good morning",         // lo que respondió el estudiante
    correct: true,                  // opcional: si acertó
    expected: "Good morning"        // opcional: respuesta correcta
  }
]
```

## 4. Cableado de las respuestas

Cada archivo llama a `FreaknActivity.submit(...)` **desde su propia lógica**,
cuando el estudiante termina la actividad (o cuando responde la última
pregunta). Patrón recomendado: acumular en un arreglo y enviar al final.

```js
var freaknAnswers = [];
function registrarRespuesta(id, pregunta, respuesta, acerto, esperada) {
  if (freaknAnswers.some(function (a) { return a.id === id; })) return; // 1er intento
  freaknAnswers.push({ id: id, question: pregunta, answer: respuesta,
                       correct: acerto, expected: esperada });
}
function reportarResultado() {
  FreaknActivity.submit({
    activityId: "lesson-quiz",              // o "checkpoint", "extra-activity"
    title: document.title,
    score: freaknAnswers.filter(function (a) { return a.correct; }).length,
    maxScore: freaknAnswers.length,
    answers: freaknAnswers
  });
}
```

- **Lecciones y actividades extra:** `activityId: "lesson-quiz"` /
  `"extra-activity"`. Reportar al terminar el último ejercicio del archivo.
- **Checkpoints:** `activityId: "checkpoint"`. Reportar **siempre** al mostrar
  el resultado final, con todas las respuestas.

## 5. Qué NO hacer

- No cambiar el diseño, los colores, los textos ni el contenido pedagógico.
- No renombrar las funciones existentes del archivo.
- No agregar dependencias externas nuevas.
- No usar `!important` masivo: los ajustes responsive deben ser puntuales.

## 6. Checklist antes de dar por listo un archivo

- [ ] `<meta viewport>` presente.
- [ ] `@media (max-width: 820px)` propio, con las clases reales del archivo.
- [ ] Sin desborde horizontal en 375px.
- [ ] Bloque `FreaknActivity` v1 presente una sola vez.
- [ ] `FreaknActivity.submit(...)` se llama con respuestas reales al terminar.
- [ ] El archivo abre y funciona igual que antes fuera de la plataforma.
