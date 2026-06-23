import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const cookieName = "private_drive_session";

function username() {
  return process.env.DRIVE_USERNAME?.trim() || "owner";
}

function secret() {
  const value = process.env.DRIVE_SESSION_SECRET || process.env.SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("缺少 DRIVE_SESSION_SECRET");
  return "private-drive-local-development-secret";
}

function sessionValue() {
  return createHmac("sha256", secret()).update(`private-drive:${username()}`).digest("hex");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyOwner(inputUsername: string, password: string) {
  if (!safeEqual(inputUsername, username())) return false;
  const stored = process.env.DRIVE_PASSWORD_HASH?.trim();
  if (stored) {
    const [algorithm, salt, expected] = stored.split("$");
    if (algorithm !== "scrypt" || !salt || !expected) return false;
    const actual = scryptSync(password, salt, 32).toString("hex");
    return safeEqual(actual, expected);
  }
  const plain = process.env.DRIVE_PASSWORD || "";
  return Boolean(plain) && safeEqual(password, plain);
}

export async function createOwnerSession() {
  const store = await cookies();
  store.set(cookieName, sessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export async function clearOwnerSession() {
  (await cookies()).delete(cookieName);
}

export async function isOwnerAuthenticated() {
  const value = (await cookies()).get(cookieName)?.value;
  return Boolean(value) && safeEqual(value as string, sessionValue());
}
