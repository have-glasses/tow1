import { NextResponse } from "next/server";
import { isOwnerAuthenticated } from "@/lib/auth";
import { createMultipartPartUrl } from "@/lib/cos";
import { getItem, getUploadSession, touchUploadSession } from "@/lib/db";

export async function POST(request: Request) {
  if (!(await isOwnerAuthenticated())) return NextResponse.json({ error: "登录已失效" }, { status: 401 });
  const input = await request.json() as { id?: string; partNumber?: number };
  const partNumber = Number(input.partNumber);
  const item = input.id ? await getItem(input.id) : null;
  const session = input.id ? await getUploadSession(input.id) : null;
  if (!item || item.kind !== "file" || item.status !== "uploading" || !item.storage_key || !session) {
    return NextResponse.json({ error: "上传任务不存在" }, { status: 404 });
  }
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
    return NextResponse.json({ error: "分片编号无效" }, { status: 400 });
  }
  await touchUploadSession(item.id);
  return NextResponse.json({ uploadUrl: createMultipartPartUrl(item.storage_key, session.upload_id, partNumber) });
}
