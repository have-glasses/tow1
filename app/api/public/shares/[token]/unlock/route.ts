import { NextResponse } from "next/server";
import { clearShareAttempts, getItem, getShareAttempt, getShareByToken, recordFailedShareAttempt } from "@/lib/db";
import { grantShareAccess, isShareActive, shareClientKey, verifySharePassword } from "@/lib/shares";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const share = await getShareByToken(token);
  const item = share ? await getItem(share.item_id) : null;
  if (!share || !item || item.status !== "active" || !isShareActive(share)) return NextResponse.json({ error: "分享已失效" }, { status: 410 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  const clientKey = shareClientKey(ip);
  const attempt = await getShareAttempt(share.id, clientKey);
  if (attempt?.blocked_until && Date.parse(attempt.blocked_until) > Date.now()) {
    const retryAfter = Math.max(1, Math.ceil((Date.parse(attempt.blocked_until) - Date.now()) / 1000));
    return NextResponse.json({ error: "尝试次数过多，请稍后再试", retryAfter }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }
  const { password } = await request.json() as { password?: string };
  if (!verifySharePassword(String(password || ""), share.password_hash)) {
    const failed = await recordFailedShareAttempt(share.id, clientKey);
    const remaining = Math.max(0, 5 - failed.failureCount);
    return NextResponse.json({ error: remaining ? `密码不正确，还可尝试 ${remaining} 次` : "尝试次数过多，请稍后再试" }, { status: failed.blockedUntil ? 429 : 403 });
  }
  await clearShareAttempts(share.id, clientKey);
  await grantShareAccess(share);
  return NextResponse.json({ ok: true });
}
