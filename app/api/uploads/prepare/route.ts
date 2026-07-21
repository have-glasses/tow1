import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isOwnerAuthenticated } from "@/lib/auth";
import { createMultipartUpload, createStorageKey, listMultipartParts } from "@/lib/cos";
import { createUploadSession, findUploadSession, getItem, getUploadSession, reserveFile } from "@/lib/db";

const PART_SIZE = 8 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await isOwnerAuthenticated())) return NextResponse.json({ error: "登录已失效" }, { status: 401 });
  try {
    const input = await request.json() as { name?: string; type?: string; size?: number; parentId?: string | null; lastModified?: number | null };
    const name = String(input.name || "").trim();
    const size = Number(input.size || 0);
    const fileLastModified = Number.isFinite(Number(input.lastModified)) ? Number(input.lastModified) : null;
    const maxMb = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || 5120);
    if (!name || name.length > 180 || /[\\/:*?\"<>|]/.test(name)) throw new Error("文件名无效");
    if (!Number.isFinite(size) || size <= 0 || size > maxMb * 1024 * 1024) throw new Error(`单个文件不能超过 ${maxMb} MB`);
    const parentId = input.parentId || null;
    if (parentId) {
      const parent = await getItem(parentId);
      if (!parent || parent.kind !== "folder" || parent.status !== "active") throw new Error("目标文件夹不存在");
    }

    const existing = await findUploadSession({ parentId, name, sizeBytes: size, fileLastModified });
    if (existing) {
      const item = await getItem(existing.item_id);
      if (item?.storage_key) {
        const uploadedParts = await listMultipartParts(item.storage_key, existing.upload_id).catch(() => []);
        return NextResponse.json({ id: item.id, mode: "multipart", partSize: existing.part_size, uploadedParts });
      }
    }

    const id = crypto.randomUUID();
    const storageKey = createStorageKey(id);
    await reserveFile({ id, parentId, name, storageKey, mimeType: String(input.type || "application/octet-stream"), sizeBytes: size });
    const uploadId = await createMultipartUpload(storageKey, String(input.type || "application/octet-stream"));
    await createUploadSession({ itemId: id, uploadId, partSize: PART_SIZE, fileLastModified });
    const session = await getUploadSession(id);
    return NextResponse.json({ id, mode: "multipart", partSize: session?.part_size || PART_SIZE, uploadedParts: [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法开始上传" }, { status: 400 });
  }
}
