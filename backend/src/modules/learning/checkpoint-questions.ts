/**
 * Tipos de pregunta de checkpoints v2.
 *
 * Todos se califican SERVER-SIDE por VALOR (strings), nunca por índice, para
 * poder barajar opciones/bancos al servir sin romper la calificación.
 *
 * Tipos:
 *  - single    · opción múltiple, una correcta        (legacy sin `type`)
 *  - multi     · opción múltiple, varias correctas
 *  - truefalse · verdadero / falso
 *  - fill      · completar la frase escribiendo (acepta variantes)
 *  - order     · ordenar elementos (drag & drop)
 *  - match     · emparejar columnas (drag/tap)
 *  - dragwords · arrastrar palabras del banco a los huecos {{1}}, {{2}}…
 */

export type CheckpointQuestion =
  | { id: string; type?: 'single'; prompt: string; options: string[]; correctIndex: number }
  | { id: string; type: 'multi'; prompt: string; options: string[]; correctIndexes: number[] }
  | { id: string; type: 'truefalse'; prompt: string; correct: boolean }
  | { id: string; type: 'fill'; prompt: string; accepted: string[] }
  | { id: string; type: 'order'; prompt: string; items: string[] }
  | { id: string; type: 'match'; prompt: string; pairs: Array<{ left: string; right: string }> }
  | { id: string; type: 'dragwords'; prompt: string; text: string; words: string[]; extraWords?: string[] }

export type QuestionFeedback = {
  id: string
  correct: boolean
  /** Respuesta del estudiante en formato legible. */
  given: string
  /** Respuesta esperada legible (solo si settings.showAnswers). */
  expected?: string
}

export type CheckpointSettings = {
  /** Puede repetirlo aunque ya lo haya aprobado. */
  allowRetryAfterPass: boolean
  /** Máximo de intentos totales (null = ilimitado). */
  maxAttempts: number | null
  /** Horas de espera entre intentos (null = sin espera). */
  cooldownHours: number | null
  /** Barajar el orden de las preguntas al presentarlo. */
  shuffleQuestions: boolean
  /** Mostrar corrección detallada al terminar. */
  showAnswers: boolean
  /** Límite de tiempo en minutos (null = sin límite; lo aplica el frontend). */
  timeLimitMin: number | null
}

export const DEFAULT_CHECKPOINT_SETTINGS: CheckpointSettings = {
  allowRetryAfterPass: false,
  maxAttempts: null,
  cooldownHours: null,
  shuffleQuestions: false,
  showAnswers: true,
  timeLimitMin: null,
}

export function parseSettings(raw: unknown): CheckpointSettings {
  const s = (raw ?? {}) as Partial<CheckpointSettings>
  return {
    allowRetryAfterPass: s.allowRetryAfterPass ?? DEFAULT_CHECKPOINT_SETTINGS.allowRetryAfterPass,
    maxAttempts: Number.isFinite(s.maxAttempts as number) && (s.maxAttempts as number) > 0 ? Math.floor(s.maxAttempts as number) : null,
    cooldownHours: Number.isFinite(s.cooldownHours as number) && (s.cooldownHours as number) > 0 ? s.cooldownHours as number : null,
    shuffleQuestions: s.shuffleQuestions ?? false,
    showAnswers: s.showAnswers ?? true,
    timeLimitMin: Number.isFinite(s.timeLimitMin as number) && (s.timeLimitMin as number) > 0 ? Math.floor(s.timeLimitMin as number) : null,
  }
}

const norm = (s: unknown) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // sin tildes
    .replace(/\s+/g, ' ')

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function questionType(q: CheckpointQuestion): string {
  return (q as any).type ?? 'single'
}

/**
 * Versión pública de la pregunta (sin respuestas) lista para el estudiante.
 * Baraja lo que deba presentarse desordenado (orden, banco de palabras,
 * columna derecha del match).
 */
export function sanitizeQuestion(q: CheckpointQuestion): any {
  const type = questionType(q)
  const base = { id: q.id, type, prompt: q.prompt }
  switch (type) {
    case 'single':
      return { ...base, options: (q as any).options }
    case 'multi':
      return { ...base, options: (q as any).options, correctCount: ((q as any).correctIndexes ?? []).length }
    case 'truefalse':
      return base
    case 'fill':
      return base
    case 'order':
      return { ...base, items: shuffled((q as any).items ?? []) }
    case 'match': {
      const pairs = ((q as any).pairs ?? []) as Array<{ left: string; right: string }>
      return { ...base, lefts: pairs.map((p) => p.left), rights: shuffled(pairs.map((p) => p.right)) }
    }
    case 'dragwords': {
      const words = ((q as any).words ?? []) as string[]
      const extra = ((q as any).extraWords ?? []) as string[]
      return { ...base, text: (q as any).text, blanks: words.length, wordBank: shuffled([...words, ...extra]) }
    }
    default:
      return base
  }
}

/** Califica una respuesta por VALOR. Devuelve feedback legible. */
export function gradeQuestion(q: CheckpointQuestion, answer: unknown): QuestionFeedback {
  const type = questionType(q)
  switch (type) {
    case 'single': {
      const opts = (q as any).options as string[]
      // Acepta índice (legacy) o el string de la opción.
      const given =
        typeof answer === 'number' ? opts[answer] : typeof answer === 'string' ? answer : undefined
      const expected = opts[(q as any).correctIndex]
      return { id: q.id, correct: norm(given) === norm(expected), given: given ?? '—', expected }
    }
    case 'multi': {
      const opts = (q as any).options as string[]
      const chosen = Array.isArray(answer)
        ? (answer as unknown[]).map((a) => (typeof a === 'number' ? opts[a] : String(a)))
        : []
      const expectedArr = (((q as any).correctIndexes ?? []) as number[]).map((i) => opts[i])
      const ok =
        chosen.length === expectedArr.length &&
        expectedArr.every((e) => chosen.some((c) => norm(c) === norm(e)))
      return { id: q.id, correct: ok, given: chosen.join(', ') || '—', expected: expectedArr.join(', ') }
    }
    case 'truefalse': {
      const given = typeof answer === 'boolean' ? answer : answer === 'true'
      const expected = (q as any).correct as boolean
      return {
        id: q.id,
        correct: given === expected,
        given: answer == null ? '—' : given ? 'Verdadero' : 'Falso',
        expected: expected ? 'Verdadero' : 'Falso',
      }
    }
    case 'fill': {
      const accepted = ((q as any).accepted ?? []) as string[]
      const given = String(answer ?? '')
      const ok = accepted.some((a) => norm(a) === norm(given))
      return { id: q.id, correct: ok, given: given || '—', expected: accepted[0] }
    }
    case 'order': {
      const items = ((q as any).items ?? []) as string[]
      const given = Array.isArray(answer) ? (answer as unknown[]).map(String) : []
      const ok = given.length === items.length && items.every((it, i) => norm(given[i]) === norm(it))
      return { id: q.id, correct: ok, given: given.join(' → ') || '—', expected: items.join(' → ') }
    }
    case 'match': {
      const pairs = ((q as any).pairs ?? []) as Array<{ left: string; right: string }>
      // answer: array de rights elegidos, alineados al orden de lefts servido
      // (lefts se sirven en el orden original de pairs).
      const given = Array.isArray(answer) ? (answer as unknown[]).map(String) : []
      const ok = given.length === pairs.length && pairs.every((p, i) => norm(given[i]) === norm(p.right))
      return {
        id: q.id,
        correct: ok,
        given: pairs.map((p, i) => `${p.left} → ${given[i] ?? '—'}`).join(' · '),
        expected: pairs.map((p) => `${p.left} → ${p.right}`).join(' · '),
      }
    }
    case 'dragwords': {
      const words = ((q as any).words ?? []) as string[]
      const given = Array.isArray(answer) ? (answer as unknown[]).map(String) : []
      const ok = given.length === words.length && words.every((w, i) => norm(given[i]) === norm(w))
      return { id: q.id, correct: ok, given: given.join(', ') || '—', expected: words.join(', ') }
    }
    default:
      return { id: q.id, correct: false, given: '—' }
  }
}

/** Validación al guardar desde el admin: lanza con mensaje claro si algo falta. */
export function validateQuestion(q: any, index: number): string | null {
  const n = index + 1
  if (!q?.id) return `Pregunta ${n}: falta id`
  if (!String(q?.prompt ?? '').trim()) return `Pregunta ${n}: falta el enunciado`
  const type = q.type ?? 'single'
  switch (type) {
    case 'single':
      if (!Array.isArray(q.options) || q.options.filter((o: string) => String(o).trim()).length < 2)
        return `Pregunta ${n}: necesita al menos 2 opciones`
      if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex >= q.options.length)
        return `Pregunta ${n}: marca la opción correcta`
      return null
    case 'multi':
      if (!Array.isArray(q.options) || q.options.filter((o: string) => String(o).trim()).length < 2)
        return `Pregunta ${n}: necesita al menos 2 opciones`
      if (!Array.isArray(q.correctIndexes) || q.correctIndexes.length < 1)
        return `Pregunta ${n}: marca al menos una opción correcta`
      return null
    case 'truefalse':
      if (typeof q.correct !== 'boolean') return `Pregunta ${n}: define si es verdadero o falso`
      return null
    case 'fill':
      if (!Array.isArray(q.accepted) || q.accepted.filter((a: string) => String(a).trim()).length < 1)
        return `Pregunta ${n}: agrega al menos una respuesta aceptada`
      return null
    case 'order':
      if (!Array.isArray(q.items) || q.items.filter((i: string) => String(i).trim()).length < 2)
        return `Pregunta ${n}: necesita al menos 2 elementos para ordenar`
      return null
    case 'match':
      if (!Array.isArray(q.pairs) || q.pairs.length < 2)
        return `Pregunta ${n}: necesita al menos 2 parejas`
      if (q.pairs.some((p: any) => !String(p?.left ?? '').trim() || !String(p?.right ?? '').trim()))
        return `Pregunta ${n}: hay parejas incompletas`
      return null
    case 'dragwords': {
      if (!String(q.text ?? '').trim()) return `Pregunta ${n}: falta la frase con huecos`
      const blanks = (String(q.text).match(/\{\{\d+\}\}/g) ?? []).length
      if (blanks < 1) return `Pregunta ${n}: la frase necesita huecos {{1}}, {{2}}…`
      if (!Array.isArray(q.words) || q.words.length !== blanks)
        return `Pregunta ${n}: define una palabra correcta por cada hueco (${blanks})`
      return null
    }
    default:
      return `Pregunta ${n}: tipo desconocido "${type}"`
  }
}
