import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { DriveShare } from "./db";

function appSecret() {
  const value = process.env.DRIVE_SESSION_SECRET || process.env.SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("缺少 DRIVE_SESSION_SECRET");
  return "private-drive-local-development-secret";
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hashSharePassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}`;
}

export function verifySharePassword(password: string, stored: string) {
  const [algorithm, salt, expected] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  return safeEqual(scryptSync(password, salt, 32).toString("hex"), expected);
}

export function isShareActive(share: DriveShare) {
  return !share.revoked_at && Date.parse(share.expires_at) > Date.now();
}

function shareCookieName(share: Pick<DriveShare, "id">) {
  return `tow1_share_${share.id.replaceAll("-", "").slice(0, 20)}`;
}

function shareAccessValue(share: Pick<DriveShare, "id" | "password_hash" | "expires_at">) {
  return createHmac("sha256", appSecret()).update(`share:${share.id}:${share.password_hash}:${share.expires_at}`).digest("hex");
}

export async function grantShareAccess(share: DriveShare) {
  const maxAge = Math.max(1, Math.floor((Date.parse(share.expires_at) - Date.now()) / 1000));
  (await cookies()).set(shareCookieName(share), shareAccessValue(share), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge
  });
}

export async function hasShareAccess(share: DriveShare) {
  if (!isShareActive(share)) return false;
  const value = (await cookies()).get(shareCookieName(share))?.value;
  return Boolean(value) && safeEqual(value as string, shareAccessValue(share));
}

export function shareClientKey(ip: string) {
  return createHash("sha256").update(`${appSecret()}:${ip}`).digest("hex");
}
