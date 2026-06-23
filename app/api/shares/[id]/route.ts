import { NextResponse } from "next/server";
import { isOwnerAuthenticated } from "@/lib/auth";
import { getShareById, revokeShare } from "@/lib/db";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isOwnerAuthenticated())) return NextResponse.json({ error: "登录已失效" }, { status: 401 });
  const { id } = await context.params;
  const share = await getShareById(id);
  if (!share) return NextResponse.json({ error: "分享不存在" }, { status: 404 });
  await revokeShare(id);
  return NextResponse.json({ ok: true });
}
