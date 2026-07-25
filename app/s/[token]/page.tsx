import Link from "next/link";
import { ChevronRight, Cloud, Download, Folder, ShieldX } from "lucide-react";
import { FileTypeIcon, isImageFile, isVideoFile } from "@/components/FileTypeIcon";
import ShareUnlockForm from "@/components/ShareUnlockForm";
import { PublicBatchDownloadButton, PublicPreviewButton, PublicVideoTile, type PublicDownloadItem } from "@/components/PublicSharePreview";
import { getItem, getShareByToken, itemBelongsToShare, listItems, type DriveItem } from "@/lib/db";
import { hasShareAccess, isShareActive } from "@/lib/shares";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let i = 1; i < units.length && value >= 1024; i += 1) { value /= 1024; unit = units[i]; }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

function InvalidShare() {
  return <main className="share-shell"><section className="share-unlock-card invalid-share"><div className="empty-icon"><ShieldX /></div><h1>分享已失效</h1><p className="muted">链接可能已过期或被分享者撤销。</p></section></main>;
}

async function collectDownloadItems(folder: DriveItem, limit = 200, files: PublicDownloadItem[] = []) {
  for (const child of await listItems(folder.id)) {
    if (files.length > limit) break;
    if (child.kind === "folder") await collectDownloadItems(child, limit, files);
    else files.push({ id: child.id, name: child.name });
  }
  return files;
}

export default async function SharedPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ folder?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const share = await getShareByToken(token);
  const root = share ? await getItem(share.item_id) : null;
  if (!share || !root || root.status !== "active" || !isShareActive(share)) return <InvalidShare />;
  if (!(await hasShareAccess(share))) return <ShareUnlockForm token={token} itemName={root.name} expiresAt={share.expires_at} />;

  let current = root;
  if (root.kind === "folder" && query.folder) {
    const requested = await getItem(query.folder);
    if (requested?.kind === "folder" && requested.status === "active" && await itemBelongsToShare(requested.id, root.id)) current = requested;
  }
  const items = root.kind === "folder" ? await listItems(current.id) : [root];
  const downloadItems = root.kind === "file" ? [{ id: root.id, name: root.name }] : await collectDownloadItems(current, 200);
  const tooManyDownloads = downloadItems.length > 200;

  return (
    <main className="public-share-page">
      <header className="public-share-header"><div className="brand"><span className="brand-mark small"><Cloud size={20} /></span><span>Tow1</span></div><span>安全分享</span></header>
      <section className="public-share-content">
        <div className="breadcrumb"><Link href={`/s/${token}`}>{root.name}</Link>{current.id !== root.id ? <><ChevronRight size={15} /><span>{current.name}</span></> : null}</div>
        <div className="share-title"><div><h1>{current.name}</h1><p>{root.kind === "file" ? "共享文件" : `${items.length} 个项目`}</p></div><div className="share-title-actions"><span>有效期至 {new Date(share.expires_at).toLocaleString("zh-CN", { hour12: false })}</span><PublicBatchDownloadButton files={downloadItems.slice(0, 200)} token={token} tooMany={tooManyDownloads} /></div></div>
        {items.length ? <div className="file-grid public-file-grid">{items.map((item) => <article className="file-card" key={item.id}>
          {item.kind === "folder" ? <Link className="file-open" href={`/s/${token}?folder=${item.id}`} aria-label={`打开 ${item.name}`} /> : null}
          {item.kind === "file" ? <PublicPreviewButton item={{ id: item.id, name: item.name, mime_type: item.mime_type, size_bytes: item.size_bytes }} token={token} /> : null}
          {isVideoFile(item) ? <PublicVideoTile itemId={item.id} token={token} /> : <div className={isImageFile(item) ? "file-visual image-thumb" : "file-visual"}>
            {isImageFile(item) ? <img src={`/api/public/shares/${token}/files/${item.id}/preview`} alt="" loading="lazy" /> : <FileTypeIcon item={item} />}
          </div>}
          <div className="file-info"><strong title={item.name}>{item.name}</strong><span>{item.kind === "folder" ? "文件夹" : formatBytes(item.size_bytes)}</span></div>
          {item.kind === "file" ? <a className="public-download" href={`/api/public/shares/${token}/files/${item.id}`}><Download size={17} />下载</a> : null}
        </article>)}</div> : <div className="empty-state"><div className="empty-icon"><Folder /></div><h2>文件夹是空的</h2></div>}
      </section>
    </main>
  );
}
