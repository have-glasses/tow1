import { NextResponse } from "next/server";
import { isOwnerAuthenticated } from "@/lib/auth";
import { createDeleteUrl, createDownloadUrl, createFolderCoverKey, createHeadUrl, createUploadUrl } from "@/lib/cos";
import { getItem, setFolderCover } from "@/lib/db";

const MAX_COVER_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

async function activeFolder(id: string) {
  const item = await getItem(id);
  return item?.kind === "folder" && item.status === "active" ? item : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isOwnerAuthenticated())) return NextResponse.json({ error: "登录已失效" }, { status: 401 });
  const { id } = await context.params;
  const folder = await activeFolder(id);
  if (!folder?.cover_storage_key) return NextResponse.json({ error: "文件夹没有封面" }, { status: 404 });
  return NextResponse.redirect(createDownloadUrl(folder.cover_storage_key));
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isOwnerAuthenticated())) return NextResponse.json({ error: "登录已失效" }, { status: 401 });
  const { id } = await context.params;
  const folder = await activeFolder(id);
  if (!folder) return NextResponse.json({ error: "文件夹不存在" }, { status: 404 });
  const input = await request.json() as { stage?: "prepare" | "complete"; type?: string; size?: number };
  const storageKey = createFolderCoverKey(folder.id);

  if (input.stage === "prepare") {
    const type = String(input.type || "");
    const size = Number(input.size || 0);
    if (!ALLOWED_TYPES.has(type)) return NextResponse.json({ error: "请选择 JPG、PNG、WebP 或 AVIF 图片" }, { status: 400 });
    if (!Number.isFinite(size) || size <= 0 || size > MAX_COVER_BYTES) return NextResponse.json({ error: "封面图片不能超过 5MB" }, { status: 400 });
    return NextResponse.json({ uploadUrl: createUploadUrl(storageKey) });
  }

  if (input.stage === "complete") {
    const response = await fetch(createHeadUrl(storageKey), { method: "HEAD", cache: "no-store" });
    const size = Number(response.headers.get("content-length") || 0);
    if (!response.ok || !Number.isFinite(size) || size <= 0 || size > MAX_COVER_BYTES) {
      return NextResponse.json({ error: "封面上传未完成，请重试" }, { status: 409 });
    }
    await setFolderCover(folder.id, storageKey);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "请求无效" }, { status: 400 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isOwnerAuthenticated())) return NextResponse.json({ error: "登录已失效" }, { status: 401 });
  const { id } = await context.params;
  const folder = await activeFolder(id);
  if (!folder) return NextResponse.json({ error: "文件夹不存在" }, { status: 404 });
  if (folder.cover_storage_key) {
    const response = await fetch(createDeleteUrl(folder.cover_storage_key), { method: "DELETE" });
    if (!response.ok && response.status !== 404) return NextResponse.json({ error: "无法删除封面，请重试" }, { status: 502 });
  }
  await setFolderCover(folder.id, null);
  return NextResponse.json({ ok: true });
}
