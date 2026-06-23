import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isOwnerAuthenticated } from "@/lib/auth";
import { createShare, getItem, listShares } from "@/lib/db";
import { hashSharePassword, isShareActive } from "@/lib/shares";

function publicUrl(token: string, request: Request) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/+$/, "");
  return `${base}/s/${token}`;
}

export async function GET(request: Request) {
  if (!(await isOwnerAuthenticated())) return NextResponse.json({ error: "登录已失效" }, { status: 401 });
  const itemId = new URL(request.url).searchParams.get("itemId") || "";
  const item = await getItem(itemId);
  if (!item) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  const shares = await listShares(itemId);
  return NextResponse.json({ shares: shares.map((share) => ({
    id: share.id,
    url: publicUrl(share.token, request),
    expiresAt: share.expires_at,
    createdAt: share.created_at,
    downloadCount: share.download_count,
    status: share.revoked_at ? "revoked" : isShareActive(share) ? "active" : "expired"
  })) });
}

export async function POST(request: Request) {
  if (!(await isOwnerAuthenticated())) return NextResponse.json({ error: "登录已失效" }, { status: 401 });
  try {
    const input = await request.json() as { itemId?: string; password?: string; expiresAt?: string };
    const item = input.itemId ? await getItem(input.itemId) : null;
    if (!item || item.status !== "active") throw new Error("只能分享可用的文件或文件夹");
    const password = String(input.password || "");
    if (password.length < 4 || password.length > 64) throw new Error("分享密码需为 4–64 个字符");
    const expiresAt = new Date(String(input.expiresAt || ""));
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now() + 60 * 1000) throw new Error("到期时间必须晚于当前时间");
    if (expiresAt.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000) throw new Error("分享有效期不能超过一年");
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(24).toString("base64url");
    await createShare({ id, itemId: item.id, token, passwordHash: hashSharePassword(password), expiresAt: expiresAt.toISOString() });
    return NextResponse.json({ share: { id, url: publicUrl(token, request), expiresAt: expiresAt.toISOString(), createdAt: new Date().toISOString(), downloadCount: 0, status: "active" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建分享失败" }, { status: 400 });
  }
}
