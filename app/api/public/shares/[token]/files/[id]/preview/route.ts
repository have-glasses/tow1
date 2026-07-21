import { NextResponse } from "next/server";
import { createDownloadUrl } from "@/lib/cos";
import { getItem, getShareByToken, itemBelongsToShare } from "@/lib/db";
import { hasShareAccess, isShareActive } from "@/lib/shares";

function extension(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

function isPreviewable(mimeType: string | null, name: string) {
  const value = mimeType || "application/octet-stream";
  const ext = extension(name);
  return value.startsWith("image/") || value.startsWith("video/") || value.startsWith("audio/") || value.startsWith("text/") || value === "application/pdf" ||
    ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif", "mp4", "webm", "mov", "mp3", "wav", "ogg", "m4a", "txt", "md", "csv", "json", "log", "pdf"].includes(ext);
}

function isStreamableMedia(mimeType: string | null, name: string) {
  const value = mimeType || "";
  return value.startsWith("video/") || value.startsWith("audio/") || ["mp4", "webm", "mov", "mp3", "wav", "ogg", "m4a"].includes(extension(name));
}

function boundedRange(range: string | null) {
  const chunkSize = 2 * 1024 * 1024;
  const match = range?.match(/^bytes=(\d+)-(\d*)$/i);
  const start = match ? Number(match[1]) : 0;
  const requestedEnd = match?.[2] ? Number(match[2]) : Number.POSITIVE_INFINITY;
  const end = Math.max(start, Math.min(requestedEnd, start + chunkSize - 1));
  return `bytes=${start}-${end}`;
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

export async function GET(request: Request, context: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await context.params;
  const share = await getShareByToken(token);
  if (!share || !isShareActive(share) || !(await hasShareAccess(share))) return NextResponse.json({ error: "分享访问未授权或已失效" }, { status: 403 });
  const [root, item] = await Promise.all([getItem(share.item_id), getItem(id)]);
  if (!root || root.status !== "active" || !item || item.kind !== "file" || item.status !== "active" || !item.storage_key) return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  if (!(await itemBelongsToShare(item.id, root.id))) return NextResponse.json({ error: "无权访问此文件" }, { status: 403 });
  if (!isPreviewable(item.mime_type, item.name)) return NextResponse.json({ error: "此文件暂不支持预览" }, { status: 415 });

  const range = request.headers.get("range");
  const upstreamRange = isStreamableMedia(item.mime_type, item.name) ? boundedRange(range) : range;
  const upstream = await fetch(createDownloadUrl(item.storage_key), { headers: upstreamRange ? { range: upstreamRange } : undefined });
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
