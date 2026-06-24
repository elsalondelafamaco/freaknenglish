/**
 * Datos de demostración para el mock. Se aplican una sola vez por instalación
 * (idempotente: si el usuario ya existe, no se sobrescribe).
 *
 * Credenciales de prueba documentadas en `docs/migration.md`.
 * En migración a Postgres, esto se convierte en un script `seed.sql`.
 */
import type { DbShape } from "./repository";
import type { User, Subscription } from "./types";

interface DemoUser {
  id: string;
  email: string;
  password: string;
  fullName: string;
  roles: User["roles"];
}

export const DEMO_USERS: DemoUser[] = [
  {
    id: "usr_demo_student",
    email: "estudiante@freakn.dev",
    password: "Freakn123!",
    fullName: "Sofía Estudiante",
    roles: ["student"],
  },
  {
    id: "usr_demo_teacher",
    email: "profe@freakn.dev",
    password: "Freakn123!",
    fullName: "Mark Teacher",
    roles: ["teacher"],
  },
  {
    id: "usr_demo_admin",
    email: "admin@freakn.dev",
    password: "Freakn123!",
    fullName: "Admin Freakn",
    roles: ["admin"],
  },
];

export function seedDemoData(db: DbShape): void {
  for (const d of DEMO_USERS) {
    if ((db.users as Record<string, User>)[d.id]) continue;
    const user: User = {
      id: d.id,
      email: d.email,
      fullName: d.fullName,
      roles: d.roles,
      level: d.roles.includes("student") ? "intermediate" : undefined,
      createdAt: new Date().toISOString(),
    };
    (db.users as Record<string, User>)[user.id] = user;
    db.meta.passwordsByEmail[user.email] = d.password;
  }

  // Suscripción activa de demo para el estudiante.
  const subId = "sub_demo_student";
  if (!(db.subscriptions as Record<string, Subscription>)[subId]) {
    (db.subscriptions as Record<string, Subscription>)[subId] = {
      id: subId,
      userId: "usr_demo_student",
      planId: "4-dias",
      status: "active",
      startedAt: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    } satisfies Subscription;
  }
}