import { NextResponse } from "next/server";
import { isOwnerAuthenticated } from "@/lib/auth";
import { createDownloadUrl } from "@/lib/cos";
import { getItem } from "@/lib/db";

function extension(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

function isPreviewable(mimeType: string | null, name: string) {
  const value = mimeType || "application/octet-stream";
  const ext = extension(name);
  return value.startsWith("image/") || value.startsWith("video/") || value.startsWith("audio/") || value.startsWith("text/") || value === "application/pdf" ||
    ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif", "mp4", "webm", "mov", "mp3", "wav", "ogg", "m4a", "txt", "md", "csv", "json", "log", "pdf"].includes(ext);
}

function contentType(mimeType: string | null, name: string, upstreamType: string | null) {
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  const ext = extension(name);
  const byExtension: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml", avif: "image/avif",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4",
    txt: "text/plain; charset=utf-8", md: "text/markdown; charset=utf-8", csv: "text/csv; charset=utf-8", json: "application/json", log: "text/plain; charset=utf-8",
    pdf: "application/pdf"
  };
  return byExtension[ext] || upstreamType || "application/octet-stream";
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isOwnerAuthenticated())) return NextResponse.json({ error: "登录已失效" }, { status: 401 });
  const { id } = await context.params;
  const item = await getItem(id);
  if (!item || item.kind !== "file" || item.status !== "active" || !item.storage_key) return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  if (!isPreviewable(item.mime_type, item.name)) return NextResponse.json({ error: "此文件暂不支持预览" }, { status: 415 });

  const range = request.headers.get("range");
  const upstream = await fetch(createDownloadUrl(item.storage_key), { headers: range ? { range } : undefined });
  if (!upstream.ok && upstream.status !== 206) return NextResponse.json({ error: "无法读取文件预览" }, { status: upstream.status || 502 });

  const headers = new Headers();
  headers.set("Content-Type", contentType(item.mime_type, item.name, upstream.headers.get("content-type")));
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(item.name)}`);
  headers.set("Cache-Control", "private, max-age=60");
  const contentLength = upstream.headers.get("content-length");
  const contentRange = upstream.headers.get("content-range");
  const acceptRanges = upstream.headers.get("accept-ranges");
  if (contentLength) headers.set("Content-Length", contentLength);
  if (contentRange) headers.set("Content-Range", contentRange);
  if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);
  return new Response(upstream.body, { status: upstream.status, headers });
}
