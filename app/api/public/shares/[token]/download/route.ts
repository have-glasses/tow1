import { NextResponse } from "next/server";
import { createDownloadUrl } from "@/lib/cos";
import { getItem, getShareByToken, itemBelongsToShare, listItems, recordShareDownload, type DriveItem } from "@/lib/db";
import { hasShareAccess, isShareActive } from "@/lib/shares";
import { createZip, zipPath } from "@/lib/zip";

async function collectFiles(folder: DriveItem, prefix: string[] = []): Promise<Array<{ item: DriveItem; path: string[] }>> {
  const children = await listItems(folder.id);
  const files: Array<{ item: DriveItem; path: string[] }> = [];
  for (const child of children) {
    if (child.kind === "folder") files.push(...await collectFiles(child, [...prefix, child.name]));
    else files.push({ item: child, path: [...prefix, child.name] });
  }
  return files;
}

function zipFilename(name: string) {
  return `${encodeURIComponent(name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_") || "tow1-share")}.zip`;
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const share = await getShareByToken(token);
  if (!share || !isShareActive(share) || !(await hasShareAccess(share))) return NextResponse.json({ error: "分享访问未授权或已失效" }, { status: 403 });

  const root = await getItem(share.item_id);
  if (!root || root.status !== "active") return NextResponse.json({ error: "分享已失效" }, { status: 410 });
  const requestedFolderId = new URL(request.url).searchParams.get("folder");
  let target = root;
  if (root.kind === "folder" && requestedFolderId) {
    const requested = await getItem(requestedFolderId);
    if (!requested || requested.kind !== "folder" || requested.status !== "active" || !(await itemBelongsToShare(requested.id, root.id))) return NextResponse.json({ error: "无权访问此文件夹" }, { status: 403 });
    target = requested;
  }

  const fileRefs = target.kind === "file" ? [{ item: target, path: [target.name] }] : await collectFiles(target);
  if (!fileRefs.length) return NextResponse.json({ error: "没有可下载的文件" }, { status: 404 });
  if (fileRefs.length > 200) return NextResponse.json({ error: "文件过多，请进入子文件夹分批下载" }, { status: 413 });

  const files: Array<{ name: string; data: Uint8Array }> = [];
  for (const ref of fileRefs) {
    if (!ref.item.storage_key) continue;
    const upstream = await fetch(createDownloadUrl(ref.item.storage_key));
    if (!upstream.ok) return NextResponse.json({ error: `无法读取文件：${ref.item.name}` }, { status: upstream.status || 502 });
    files.push({ name: zipPath(ref.path), data: new Uint8Array(await upstream.arrayBuffer()) });
  }
  if (!files.length) return NextResponse.json({ error: "没有可下载的文件" }, { status: 404 });

  await recordShareDownload(share.id);
  const archive = createZip(files);
  return new Response(archive, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${zipFilename(target.name)}`,
      "Cache-Control": "private, no-store"
    }
  });
}
