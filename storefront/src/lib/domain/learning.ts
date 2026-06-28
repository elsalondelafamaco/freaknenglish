/**
 * Catálogo de módulos por nivel + helpers de progreso.
 *
 * Es estático en el mock; en producción será un CMS (tabla `modules`,
 * `lessons`, `lesson_progress` en `docs/data-model.md`).
 */
import type {
  Checkpoint,
  CheckpointAttempt,
  EnglishLevel,
  LearningModule,
  LessonProgress,
} from "./types";
import { readDb, writeDb, uid } from "./repository";

/** Datos seed (sólo se usan si el store CMS está vacío). */
const CHECKPOINTS_SEED: Checkpoint[] = [
  {
    id: "chk_beginner",
    level: "beginner",
    title: "Checkpoint: pasa a nivel intermedio",
    unlocksLevel: "intermediate",
    passScore: 3,
    questions: [
      {
        id: "q1",
        prompt: "What ___ your name?",
        options: ["is", "are", "am", "be"],
        correctIndex: 0,
      },
      {
        id: "q2",
        prompt: "She ___ coffee every morning.",
        options: ["drink", "drinks", "drinking", "drank"],
        correctIndex: 1,
      },
      {
        id: "q3",
        prompt: "Yesterday I ___ to the cinema.",
        options: ["go", "goes", "went", "gone"],
        correctIndex: 2,
      },
      {
        id: "q4",
        prompt: "There ___ many people at the party.",
        options: ["was", "were", "is", "be"],
        correctIndex: 1,
      },
    ],
  },
  {
    id: "chk_intermediate",
    level: "intermediate",
    title: "Checkpoint: pasa a nivel avanzado",
    unlocksLevel: "advanced",
    passScore: 3,
    questions: [
      {
        id: "q1",
        prompt: "If I ___ more time, I would travel.",
        options: ["have", "had", "would have", "having"],
        correctIndex: 1,
      },
      {
        id: "q2",
        prompt: "She's been working here ___ five years.",
        options: ["since", "from", "for", "during"],
        correctIndex: 2,
      },
      {
        id: "q3",
        prompt: "The report ___ by the team last week.",
        options: ["wrote", "was written", "has wrote", "writing"],
        correctIndex: 1,
      },
      {
        id: "q4",
        prompt: "I'm not used ___ so early.",
        options: ["to wake up", "to waking up", "waking up", "wake up"],
        correctIndex: 1,
      },
    ],
  },
];

const MODULES_SEED: LearningModule[] = [
  {
    id: "mod_b1",
    level: "beginner",
    order: 1,
    coverEmoji: "👋",
    title: "Greetings & Introductions",
    summary: "Aprende a presentarte y romper el hielo con confianza.",
    lessons: [
      {
        id: "l_b1_1",
        moduleId: "mod_b1",
        order: 1,
        title: "Saying hello like a native",
        kind: "video",
        url: "https://www.youtube.com/embed/sENgdSF8ppI",
        estMinutes: 6,
      },
      {
        id: "l_b1_2",
        moduleId: "mod_b1",
        order: 2,
        title: "Personal info vocab (PDF)",
        kind: "pdf",
        url: "https://www.englishclub.com/download/PDF/EnglishClub-Personal-Information.pdf",
        estMinutes: 8,
      },
      {
        id: "l_b1_3",
        moduleId: "mod_b1",
        order: 3,
        title: "Practice deck",
        kind: "download",
        url: "#",
        estMinutes: 4,
      },
    ],
  },
  {
    id: "mod_b2",
    level: "beginner",
    order: 2,
    coverEmoji: "🍽️",
    title: "Ordering at a Restaurant",
    summary: "Pide comida y bebidas en inglés sin titubear.",
    checkpointId: "chk_beginner",
    lessons: [
      {
        id: "l_b2_1",
        moduleId: "mod_b2",
        order: 1,
        title: "Restaurant phrases",
        kind: "video",
        url: "https://www.youtube.com/embed/QFGvfb-Cfqo",
        estMinutes: 7,
      },
      {
        id: "l_b2_2",
        moduleId: "mod_b2",
        order: 2,
        title: "Menu vocab cheat sheet",
        kind: "pdf",
        url: "https://www.englishclub.com/download/PDF/EnglishClub-Restaurant.pdf",
        estMinutes: 5,
      },
    ],
  },
  {
    id: "mod_i1",
    level: "intermediate",
    order: 1,
    coverEmoji: "💼",
    title: "Business Small Talk",
    summary: "Conecta en reuniones y eventos profesionales.",
    lessons: [
      {
        id: "l_i1_1",
        moduleId: "mod_i1",
        order: 1,
        title: "Opening a conversation",
        kind: "video",
        url: "https://www.youtube.com/embed/4dBKjLYk4Sw",
        estMinutes: 9,
      },
      {
        id: "l_i1_2",
        moduleId: "mod_i1",
        order: 2,
        title: "10 power phrases (slides)",
        kind: "slides",
        url: "https://docs.google.com/presentation/d/e/2PACX-1vQ7s3vBfFr4nWVrUmJ_5tNm/embed",
        estMinutes: 12,
      },
    ],
  },
  {
    id: "mod_i2",
    level: "intermediate",
    order: 2,
    coverEmoji: "✈️",
    title: "Travel & Airports",
    summary: "Maneja check-in, migración y emergencias.",
    checkpointId: "chk_intermediate",
    lessons: [
      {
        id: "l_i2_1",
        moduleId: "mod_i2",
        order: 1,
        title: "At the airport — full dialogue",
        kind: "video",
        url: "https://www.youtube.com/embed/Rb37FdK6FvA",
        estMinutes: 10,
      },
      {
        id: "l_i2_2",
        moduleId: "mod_i2",
        order: 2,
        title: "Travel emergencies vocab",
        kind: "pdf",
        url: "https://www.englishclub.com/download/PDF/EnglishClub-Travel.pdf",
        estMinutes: 6,
      },
    ],
  },
  {
    id: "mod_a1",
    level: "advanced",
    order: 1,
    coverEmoji: "🎙️",
    title: "Debating & Persuasion",
    summary: "Argumenta con claridad y persuade en inglés.",
    lessons: [
      {
        id: "l_a1_1",
        moduleId: "mod_a1",
        order: 1,
        title: "Structuring an argument",
        kind: "video",
        url: "https://www.youtube.com/embed/Y0Lho8gpqlA",
        estMinutes: 11,
      },
    ],
  },
];

/* ============================================================
 * Store CMS (CRUD)
 * Persiste en `cmsModules` / `cmsCheckpoints`. Seed-on-empty.
 * ============================================================ */

function ensureCmsSeeded() {
  const db = readDb();
  const mods = db.cmsModules as Record<string, LearningModule>;
  const chks = db.cmsCheckpoints as Record<string, Checkpoint>;
  const needsModules = !mods || Object.keys(mods).length === 0;
  const needsChks = !chks || Object.keys(chks).length === 0;
  if (!needsModules && !needsChks) return;
  writeDb((d) => {
    if (needsChks) {
      d.cmsCheckpoints = {};
      for (const c of CHECKPOINTS_SEED) {
        (d.cmsCheckpoints as Record<string, Checkpoint>)[c.id] = c;
      }
    }
    if (needsModules) {
      d.cmsModules = {};
      for (const m of MODULES_SEED) {
        (d.cmsModules as Record<string, LearningModule>)[m.id] = m;
      }
    }
  });
}

export function listAllModules(): LearningModule[] {
  ensureCmsSeeded();
  const db = readDb();
  return Object.values(db.cmsModules as Record<string, LearningModule>).sort(
    (a, b) => a.order - b.order,
  );
}

export function listAllCheckpoints(): Checkpoint[] {
  ensureCmsSeeded();
  const db = readDb();
  return Object.values(db.cmsCheckpoints as Record<string, Checkpoint>);
}

export function modulesByLevel(level: EnglishLevel): LearningModule[] {
  return listAllModules()
    .filter((m) => m.level === level)
    .sort((a, b) => a.order - b.order);
}

export function getModule(id: string): LearningModule | null {
  ensureCmsSeeded();
  const db = readDb();
  return (db.cmsModules as Record<string, LearningModule>)[id] ?? null;
}

export function getCheckpoint(id: string): Checkpoint | null {
  ensureCmsSeeded();
  const db = readDb();
  return (db.cmsCheckpoints as Record<string, Checkpoint>)[id] ?? null;
}

export interface SaveModuleInput {
  id?: string;
  level: EnglishLevel;
  order: number;
  coverEmoji?: string;
  title: string;
  summary: string;
  checkpointId?: string;
}

export function saveModule(input: SaveModuleInput): LearningModule {
  ensureCmsSeeded();
  const id = input.id ?? uid("mod");
  const db = readDb();
  const existing = (db.cmsModules as Record<string, LearningModule>)[id];
  const next: LearningModule = {
    id,
    level: input.level,
    order: input.order,
    coverEmoji: input.coverEmoji ?? existing?.coverEmoji ?? "📘",
    title: input.title.trim(),
    summary: input.summary.trim(),
    checkpointId: input.checkpointId,
    lessons: existing?.lessons ?? [],
  };
  writeDb((d) => {
    (d.cmsModules as Record<string, LearningModule>)[id] = next;
  });
  return next;
}

export function deleteModule(id: string): void {
  writeDb((d) => {
    delete (d.cmsModules as Record<string, LearningModule>)[id];
  });
}

export interface SaveLessonInput {
  id?: string;
  moduleId: string;
  order: number;
  title: string;
  kind: "video" | "pdf" | "slides" | "download" | "html";
  url?: string;
  estMinutes?: number;
  contentHtml?: string;
  notes?: string;
  attachments?: { name: string; url: string; size?: number }[];
}

export function saveLesson(input: SaveLessonInput): LearningModule {
  ensureCmsSeeded();
  const db = readDb();
  const mod = (db.cmsModules as Record<string, LearningModule>)[input.moduleId];
  if (!mod) throw new Error("Módulo no encontrado");
  const lessonId = input.id ?? uid("lsn");
  const lessonShape: LearningModule["lessons"][number] = {
    id: lessonId,
    moduleId: input.moduleId,
    order: input.order,
    title: input.title.trim(),
    kind: input.kind as LearningModule["lessons"][number]["kind"],
    url: input.url,
    estMinutes: input.estMinutes,
    // Extra fields (stored even si el tipo aún no las declara):
    ...(input.contentHtml ? { contentHtml: input.contentHtml } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    ...(input.attachments ? { attachments: input.attachments } : {}),
  } as LearningModule["lessons"][number];
  const existingIdx = mod.lessons.findIndex((l) => l.id === lessonId);
  const nextLessons = [...mod.lessons];
  if (existingIdx >= 0) nextLessons[existingIdx] = lessonShape;
  else nextLessons.push(lessonShape);
  nextLessons.sort((a, b) => a.order - b.order);
  const next: LearningModule = { ...mod, lessons: nextLessons };
  writeDb((d) => {
    (d.cmsModules as Record<string, LearningModule>)[input.moduleId] = next;
  });
  return next;
}

export function deleteLesson(moduleId: string, lessonId: string): void {
  const db = readDb();
  const mod = (db.cmsModules as Record<string, LearningModule>)[moduleId];
  if (!mod) return;
  const next = { ...mod, lessons: mod.lessons.filter((l) => l.id !== lessonId) };
  writeDb((d) => {
    (d.cmsModules as Record<string, LearningModule>)[moduleId] = next;
  });
}

function progressKey(userId: string, lessonId: string) {
  return `${userId}:${lessonId}`;
}

export function listProgress(userId: string): LessonProgress[] {
  const db = readDb();
  return Object.values(db.lessonProgress as Record<string, LessonProgress>).filter(
    (p) => p.userId === userId,
  );
}

export function isLessonComplete(userId: string, lessonId: string): boolean {
  const db = readDb();
  return !!(db.lessonProgress as Record<string, LessonProgress>)[progressKey(userId, lessonId)];
}

export function markLessonComplete(userId: string, lessonId: string): void {
  writeDb((db) => {
    const key = progressKey(userId, lessonId);
    (db.lessonProgress as Record<string, LessonProgress>)[key] = {
      userId,
      lessonId,
      completedAt: new Date().toISOString(),
    };
  });
}

export function unmarkLesson(userId: string, lessonId: string): void {
  writeDb((db) => {
    delete (db.lessonProgress as Record<string, LessonProgress>)[progressKey(userId, lessonId)];
  });
}

export function moduleProgress(userId: string, mod: LearningModule): {
  done: number;
  total: number;
  pct: number;
  complete: boolean;
} {
  const done = mod.lessons.filter((l) => isLessonComplete(userId, l.id)).length;
  const total = mod.lessons.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, pct, complete: done === total && total > 0 };
}

export function levelProgress(userId: string, level: EnglishLevel): number {
  const mods = modulesByLevel(level);
  const total = mods.reduce((acc, m) => acc + m.lessons.length, 0);
  if (total === 0) return 0;
  const done = mods.reduce(
    (acc, m) => acc + m.lessons.filter((l) => isLessonComplete(userId, l.id)).length,
    0,
  );
  return Math.round((done / total) * 100);
}

export function recordCheckpointAttempt(input: {
  userId: string;
  checkpointId: string;
  score: number;
  passed: boolean;
}): CheckpointAttempt {
  const attempt: CheckpointAttempt = {
    id: uid("att"),
    takenAt: new Date().toISOString(),
    ...input,
  };
  writeDb((db) => {
    (db.checkpointAttempts as Record<string, CheckpointAttempt>)[attempt.id] = attempt;
  });
  return attempt;
}

export function bestCheckpointAttempt(
  userId: string,
  checkpointId: string,
): CheckpointAttempt | null {
  const db = readDb();
  const all = Object.values(db.checkpointAttempts as Record<string, CheckpointAttempt>).filter(
    (a) => a.userId === userId && a.checkpointId === checkpointId,
  );
  if (all.length === 0) return null;
  return all.sort((a, b) => b.score - a.score)[0];
}