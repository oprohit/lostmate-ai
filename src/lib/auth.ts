import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, type Profile } from "@/db/schema";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "lostmate_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const SESSION_SECRET = process.env.SESSION_SECRET ?? "lostmate-local-development-secret";

export type SafeUser = Pick<Profile, "id" | "email" | "name" | "role" | "avatarColor">;

function safeUser(user: Profile): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarColor: user.avatarColor,
  };
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) return false;
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  const storedKey = Buffer.from(key, "hex");
  return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey);
}

function sign(value: string) {
  return createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function createToken(userId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

function readToken(token: string | undefined) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAt, signature] = parts;
  const payload = `${userId}.${expiresAt}`;
  const expected = sign(payload);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  if (!userId || Number(expiresAt) < Math.floor(Date.now() / 1000)) return null;
  return userId;
}

export async function setSession(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, expires: new Date(0), path: "/" });
}

export async function getCurrentUser(): Promise<SafeUser | null> {
  const cookieStore = await cookies();
  const userId = readToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const [user] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  return user ? safeUser(user) : null;
}

export async function getUserByEmail(email: string) {
  const [user] = await db.select().from(profiles).where(eq(profiles.email, email.toLowerCase())).limit(1);
  return user ?? null;
}

export async function createUser(input: { email: string; name: string; password: string; role?: "user" | "staff" | "admin" }) {
  const passwordHash = await hashPassword(input.password);
  const [user] = await db
    .insert(profiles)
    .values({
      email: input.email.toLowerCase(),
      name: input.name.trim(),
      passwordHash,
      role: input.role ?? "user",
    })
    .returning();
  return user;
}

export async function ensureDemoUser(email: string, password: string, role: "user" | "staff") {
  const existing = await getUserByEmail(email);
  if (existing) return existing;
  return createUser({ email, password, name: role === "staff" ? "Avery Chen" : "Jordan Lee", role });
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Response("Authentication required", { status: 401 });
  return user;
}

export async function requireStaff() {
  const user = await requireUser();
  if (user.role !== "staff" && user.role !== "admin") throw new Response("Staff access required", { status: 403 });
  return user;
}

export function normalizeEmail(email: unknown) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function passwordIsStrong(password: string) {
  return password.length >= 8;
}

export function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
