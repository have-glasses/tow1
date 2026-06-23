import { NextResponse } from "next/server";
import { isOwnerAuthenticated } from "@/lib/auth";
import { createDownloadUrl } from "@/lib/cos";
import { getItem } from "@/lib/db";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isOwnerAuthenticated())) return NextResponse.json({ error: "登录已失效" }, { status: 401 });
  const { id } = await context.params;
  const item = await getItem(id);
  if (!item || item.kind !== "file" || item.status !== "active" || !item.storage_key) return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  return NextResponse.redirect(createDownloadUrl(item.storage_key));
}
