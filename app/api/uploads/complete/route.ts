import { NextResponse } from "next/server";
import { isOwnerAuthenticated } from "@/lib/auth";
import { completeFile, getItem } from "@/lib/db";

export async function POST(request: Request) {
  if (!(await isOwnerAuthenticated())) return NextResponse.json({ error: "登录已失效" }, { status: 401 });
  const { id } = await request.json() as { id?: string };
  const item = id ? await getItem(id) : null;
  if (!item || item.kind !== "file" || item.status !== "uploading") return NextResponse.json({ error: "上传记录不存在" }, { status: 404 });
  await completeFile(item.id);
  return NextResponse.json({ ok: true });
}
