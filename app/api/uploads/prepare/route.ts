import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isOwnerAuthenticated } from "@/lib/auth";
import { createStorageKey, createUploadUrl } from "@/lib/cos";
import { getItem, reserveFile } from "@/lib/db";

export async function POST(request: Request) {
  if (!(await isOwnerAuthenticated())) return NextResponse.json({ error: "登录已失效" }, { status: 401 });
  try {
    const input = await request.json() as { name?: string; type?: string; size?: number; parentId?: string | null };
    const name = String(input.name || "").trim();
    const size = Number(input.size || 0);
    const maxMb = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || 5120);
    if (!name || name.length > 180 || /[\\/:*?\"<>|]/.test(name)) throw new Error("文件名无效");
    if (!Number.isFinite(size) || size <= 0 || size > maxMb * 1024 * 1024) throw new Error(`单个文件不能超过 ${maxMb} MB`);
    const parentId = input.parentId || null;
    if (parentId) {
      const parent = await getItem(parentId);
      if (!parent || parent.kind !== "folder" || parent.status !== "active") throw new Error("目标文件夹不存在");
    }
    const id = crypto.randomUUID();
    const storageKey = createStorageKey(id);
    await reserveFile({ id, parentId, name, storageKey, mimeType: String(input.type || "application/octet-stream"), sizeBytes: size });
    return NextResponse.json({ id, uploadUrl: createUploadUrl(storageKey) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法开始上传" }, { status: 400 });
  }
}
