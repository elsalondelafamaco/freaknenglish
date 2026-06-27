/**
 * AuthService — interfaz pública. Hoy: implementación mock (`MockAuthService`).
 * Mañana (Railway): `JwtAuthService` con NextAuth o un servicio propio,
 * cumpliendo la misma interfaz.
 */

import type { AuthResult, Provider, Session, User } from "./types";
import { readDb, uid, writeDb } from "./repository";

const SESSION_KEY = "freakn.session.v1";

export interface AuthService {
  signUp(input: SignUpInput): Promise<AuthResult>;
  signIn(input: SignInInput): Promise<AuthResult>;
  signInWithProvider(provider: Provider): Promise<AuthResult>;
  signOut(): Promise<void>;
  getCurrentSession(): Session | null;
  getCurrentUser(): User | null;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
}

export interface SignUpInput {
  fullName: string;
  email: string;
  password: string;
}
export interface SignInInput {
  email: string;
  password: string;
}

function persistSession(s: Session) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }
}
function clearSession() {
  if (typeof localStorage !== "undefined") localStorage.removeItem(SESSION_KEY);
}
function loadSession(): Session | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (new Date(s.expiresAt).getTime() < Date.now()) {
      clearSession();
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function newSession(userId: string): Session {
  return {
    userId,
    token: uid("tok"),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function findUserByEmail(email: string): User | null {
  const db = readDb();
  const lower = email.trim().toLowerCase();
  const u = Object.values(db.users as Record<string, User>).find(
    (x) => x.email.toLowerCase() === lower,
  );
  return u ?? null;
}

function getUserById(id: string): User | null {
  const db = readDb();
  return ((db.users as Record<string, User>)[id] as User) ?? null;
}

async function delay<T>(value: T, ms = 300): Promise<T> {
  await new Promise((r) => setTimeout(r, ms));
  return value;
}

/**
 * Mock implementation.
 *
 * @migration Reemplazar por NextAuth (App Router) o un AuthService propio
 * sobre Postgres + bcrypt + JWT. Las firmas públicas no cambian.
 */
export class MockAuthService implements AuthService {
  async signUp({ fullName, email, password }: SignUpInput) {
    if (findUserByEmail(email)) {
      throw new Error("Ya existe una cuenta con este email.");
    }
    const user: User = {
      id: uid("usr"),
      email: email.trim().toLowerCase(),
      fullName: fullName.trim(),
      roles: ["student"],
      createdAt: new Date().toISOString(),
    };
    const session = newSession(user.id);
    writeDb((db) => {
      (db.users as Record<string, User>)[user.id] = user;
      db.meta.passwordsByEmail[user.email] = password; // MOCK ONLY
      (db.sessions as Record<string, Session>)[session.token] = session;
    });
    persistSession(session);
    return delay({ user, session });
  }

  async signIn({ email, password }: SignInInput) {
    const user = findUserByEmail(email);
    const db = readDb();
    const expected = db.meta.passwordsByEmail[email.trim().toLowerCase()];
    if (!user || expected !== password) {
      await delay(null, 400);
      throw new Error("Email o contraseña incorrectos.");
    }
    const session = newSession(user.id);
    writeDb((db) => {
      (db.sessions as Record<string, Session>)[session.token] = session;
    });
    persistSession(session);
    return delay({ user, session });
  }

  async signInWithProvider(provider: Provider) {
    // MOCK: crea/recupera un usuario "demo" del provider.
    const email = provider === "google" ? "demo.google@freakn.dev" : "demo@freakn.dev";
    const existing = findUserByEmail(email);
    const user: User =
      existing ??
      ({
        id: uid("usr"),
        email,
        fullName: provider === "google" ? "Demo Google" : "Demo User",
        roles: ["student"],
        createdAt: new Date().toISOString(),
      } as User);
    const session = newSession(user.id);
    writeDb((db) => {
      (db.users as Record<string, User>)[user.id] = user;
      (db.sessions as Record<string, Session>)[session.token] = session;
    });
    persistSession(session);
    return delay({ user, session });
  }

  async signOut() {
    clearSession();
    await delay(null, 100);
  }

  getCurrentSession(): Session | null {
    return loadSession();
  }

  getCurrentUser(): User | null {
    const s = loadSession();
    return s ? getUserById(s.userId) : null;
  }

  async requestPasswordReset(email: string) {
    // MOCK: no envía email; genera un token y lo retorna en el query string.
    const user = findUserByEmail(email);
    if (!user) return delay(undefined, 300); // no leak
    const token = uid("rst");
    writeDb((db) => {
      (db.meta as unknown as { resets: Record<string, string> }).resets = {
        ...((db.meta as unknown as { resets?: Record<string, string> }).resets ?? {}),
        [token]: user.email,
      };
    });
    console.info(
      `[mock-auth] Password reset link → ${window.location.origin}/reset-password?token=${token}`,
    );
    return delay(undefined, 300);
  }

  async resetPassword(token: string, newPassword: string) {
    const db = readDb();
    const resets = (db.meta as unknown as { resets?: Record<string, string> }).resets ?? {};
    const email = resets[token];
    if (!email) throw new Error("El enlace ha expirado o es inválido.");
    writeDb((db) => {
      db.meta.passwordsByEmail[email] = newPassword;
      delete ((db.meta as unknown as { resets: Record<string, string> }).resets ?? {})[token];
    });
    await delay(null, 300);
  }
}

export const authService: AuthService = new MockAuthService();