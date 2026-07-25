# Instrucciones de trabajo — estandarización de HTML

Tu tarea: estandarizar los `.html` de UNA carpeta de `content/beginner/`,
editándolos **in-place**.

## Reglas

1. Lee `content/ESTANDAR-HTML.md`: es la especificación y manda sobre todo lo demás.
2. Trabaja **archivo por archivo**. Por cada uno:
   - Léelo y entiende SU layout y SU lógica de calificación. Los nombres de
     función varían entre archivos (`checkAnswer`, `checkWrittenAnswer`,
     `checkStory`, `endGame`, `finishLesson`, `processGameAction`…): adáptate a
     lo que ese archivo tenga.
   - Asegura `<meta name="viewport" content="width=device-width, initial-scale=1">`.
   - Agrega dentro de SU propio `<style>` un `@media (max-width: 820px)` escrito
     para SUS clases reales: apilar columnas (`.layout-split`, `.half`,
     `grid-cols-*`, `w-1/2`…), bajar tipografías de deck (`text-6xl`,
     `text-8xl`…), paddings de 3–5rem a 1rem, botones `min-height:44px` y
     `font-size:16px`, barra de navegación que quepa, y **cero desborde
     horizontal a 375px**. Nada de reglas genéricas con `!important` masivo.
   - Inserta UNA sola vez el bloque `FreaknActivity` v1 **exacto** de la
     sección 3 del estándar.
   - Cablea `FreaknActivity.submit({...})` dentro de la lógica que YA existe,
     para que reporte al terminar la actividad. `activityId`:
     - `lesson.html` → `"lesson-quiz"`
     - `extra.html` → `"extra-activity"`
     - `checkpoint.html` → `"checkpoint"` (obligatorio: reportar SIEMPRE al
       mostrar el resultado final, con todas las respuestas; es la nota)
     - `guide.html` → normalmente no tiene ejercicios: solo responsive + bloque
       + `FreaknActivity.complete()` al final. **No inventes preguntas.**
   - `answers` con el formato del estándar: `{id, question, answer, correct, expected}`.
3. **No** cambies diseño, colores, textos ni contenido pedagógico. **No**
   renombres funciones existentes. **No** agregues dependencias externas.
4. Sé económico: ediciones puntuales, sin resúmenes largos, y no releas el
   archivo completo después de editarlo.

## Validación obligatoria

```bash
cd C:\codes\freakn\backend && node scripts/check-standard.mjs | grep <tu-carpeta>
```

Ninguno de tus archivos debe aparecer en la lista de pendientes. Si aparece,
corrige y vuelve a validar.

## Respuesta final

Solo datos, sin prosa: `{"dir":"<carpeta>","ok":true,"notas":"1 línea"}`
