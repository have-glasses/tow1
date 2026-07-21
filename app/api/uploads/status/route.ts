import { NextResponse } from "next/server";
import { isOwnerAuthenticated } from "@/lib/auth";
import { listMultipartParts } from "@/lib/cos";
import { getItem, getUploadSession } from "@/lib/db";

export async function POST(request: Request) {
  if (!(await isOwnerAuthenticated())) return NextResponse.json({ error: "登录已失效" }, { status: 401 });
  const input = await request.json() as { id?: string };
  const item = input.id ? await getItem(input.id) : null;
  const session = input.id ? await getUploadSession(input.id) : null;
  if (!item || item.kind !== "file" || item.status !== "uploading" || !item.storage_key || !session) {
    return NextResponse.json({ error: "上传任务不存在" }, { status: 404 });
  }
  const uploadedParts = await listMultipartParts(item.storage_key, session.upload_id);
  return NextResponse.json({ id: item.id, partSize: session.part_size, uploadedParts });
}
