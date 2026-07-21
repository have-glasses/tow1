import { NextResponse } from "next/server";
import { isOwnerAuthenticated } from "@/lib/auth";
import { completeMultipartUpload, listMultipartParts } from "@/lib/cos";
import { completeFile, getItem, getUploadSession } from "@/lib/db";

export async function POST(request: Request) {
  if (!(await isOwnerAuthenticated())) return NextResponse.json({ error: "登录已失效" }, { status: 401 });
  const { id } = await request.json() as { id?: string };
  const item = id ? await getItem(id) : null;
  if (!item || item.kind !== "file" || item.status !== "uploading" || !item.storage_key) {
    return NextResponse.json({ error: "上传记录不存在" }, { status: 404 });
  }

  const session = await getUploadSession(item.id);
  if (session) {
    const parts = await listMultipartParts(item.storage_key, session.upload_id);
    const uploadedBytes = parts.reduce((total, part) => total + part.size, 0);
    if (uploadedBytes !== item.size_bytes) {
      return NextResponse.json({ error: "文件分片还没有全部上传完成" }, { status: 409 });
    }
    await completeMultipartUpload(item.storage_key, session.upload_id, parts);
  }

  await completeFile(item.id);
  return NextResponse.json({ ok: true });
}
