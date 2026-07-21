"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArchiveRestore, ChevronRight, Cloud, Download, ImagePlus,
  Folder, FolderPlus, HardDrive, Home, LogOut,
  MoreHorizontal, Play, Search, Share2, Trash2, Upload, X
} from "lucide-react";
import type { DriveItem } from "@/lib/db";
import { createFolderAction, logoutAction, permanentlyDeleteItemAction, renameItemAction, restoreItemAction, trashItemAction } from "@/app/actions";
import ShareDialog from "./ShareDialog";
import { FileTypeIcon, isAudioFile, isImageFile, isVideoFile } from "./FileTypeIcon";
import ThemeSwitcher from "./ThemeSwitcher";

type Props = {
  items: DriveItem[];
  parent: DriveItem | null;
  trash: boolean;
  stats: { used: number; count: number; quotaBytes: number | null };
};

type UploadState = { name: string; progress: number; error?: string; note?: string };
type UploadedPart = { partNumber: number; size: number };
type UploadSession = { id: string; name: string; size: number; lastModified: number; parentId: string | null; partSize: number };
type PreparePayload = { id: string; partSize: number; uploadedParts?: UploadedPart[]; error?: string };

const UPLOAD_SESSION_KEY = "tow1:upload-sessions";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let i = 1; i < units.length && value >= 1024; i += 1) { value /= 1024; unit = units[i]; }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

function extension(item: DriveItem) {
  return item.name.split(".").pop()?.toLowerCase() || "";
}

function isImage(item: DriveItem) {
  return isImageFile(item);
}

function isVideo(item: DriveItem) {
  return isVideoFile(item);
}

function isAudio(item: DriveItem) {
  return isAudioFile(item);
}

function previewKind(item: DriveItem) {
  const type = item.mime_type || "";
  const ext = extension(item);
  if (isImage(item)) return "image";
  if (isVideo(item)) return "video";
  if (isAudio(item)) return "audio";
  if (type.startsWith("text/") || ["txt", "md", "csv", "json", "log"].includes(ext)) return "text";
  if (type === "application/pdf" || ext === "pdf") return "pdf";
  return null;
}

function canPreview(item: DriveItem) {
  return Boolean(previewKind(item));
}

function PreviewDialog({ item, onClose }: { item: DriveItem; onClose: () => void }) {
  const previewUrl = `/api/files/${item.id}/preview`;
  const kind = previewKind(item);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal preview-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="preview-heading">
          <div>
            <h2>{item.name}</h2>
            <p>{formatBytes(item.size_bytes)}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </div>
        <div className="preview-body">
          {kind === "image" ? <img src={previewUrl} alt={item.name} /> : null}
          {kind === "pdf" ? <iframe src={previewUrl} title={item.name} /> : null}
          {kind === "text" ? <iframe src={previewUrl} title={item.name} /> : null}
          {kind === "video" ? <video src={previewUrl} controls autoPlay playsInline /> : null}
          {kind === "audio" ? <audio src={previewUrl} controls /> : null}
        </div>
        <div className="modal-actions">
          <a className="secondary-button" href={`/api/files/${item.id}/download`}><Download size={16} />下载</a>
          <button className="primary-button compact" onClick={onClose}>完成</button>
        </div>
      </section>
    </div>
  );
}

function uploadBlob(url: string, blob: Blob, onProgress: (loaded: number) => void, contentType = "application/octet-stream") {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded);
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`COS 返回 ${xhr.status}`));
    xhr.onerror = () => reject(new Error("无法连接文件存储，请检查 COS 跨域设置"));
    xhr.send(blob);
  });
}

function sessionKey(file: globalThis.File, parentId: string | null) {
  return `${parentId || "root"}:${file.name}:${file.size}:${file.lastModified}`;
}

function readUploadSessions() {
  try {
    return JSON.parse(localStorage.getItem(UPLOAD_SESSION_KEY) || "{}") as Record<string, UploadSession>;
  } catch {
    return {};
  }
}

function writeUploadSession(key: string, session: UploadSession) {
  const sessions = readUploadSessions();
  sessions[key] = session;
  localStorage.setItem(UPLOAD_SESSION_KEY, JSON.stringify(sessions));
}

function deleteUploadSession(key: string) {
  const sessions = readUploadSessions();
  delete sessions[key];
  localStorage.setItem(UPLOAD_SESSION_KEY, JSON.stringify(sessions));
}

function videoThumbnailTime(video: HTMLVideoElement) {
  return Number.isFinite(video.duration) ? Math.min(0.5, Math.max(0.05, video.duration * 0.05)) : 0.1;
}

function VideoTilePreview({ item }: { item: DriveItem }) {
  const previewUrl = `/api/files/${item.id}/preview`;

  return (
    <div className="file-visual video-thumb">
      <video
        src={previewUrl}
        preload="metadata"
        muted
        playsInline
        onLoadedMetadata={(event) => { event.currentTarget.currentTime = videoThumbnailTime(event.currentTarget); }}
      />
      <span className="play-badge" aria-hidden="true"><Play size={16} fill="currentColor" /></span>
    </div>
  );
}

export default function DriveWorkspace({ items, parent, trash, stats }: Props) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const coverPicker = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [showFolder, setShowFolder] = useState(false);
  const [renaming, setRenaming] = useState<DriveItem | null>(null);
  const [sharing, setSharing] = useState<DriveItem | null>(null);
  const [previewing, setPreviewing] = useState<DriveItem | null>(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [uploading, setUploading] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState("");
  const visibleItems = useMemo(() => items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())), [items, query]);
  const remainingBytes = stats.quotaBytes === null ? null : Math.max(0, stats.quotaBytes - stats.used);
  const usedPercent = stats.quotaBytes ? Math.min(100, Math.round(stats.used / stats.quotaBytes * 100)) : null;

  useEffect(() => {
    let cancelled = false;

    async function repairUploads() {
      try {
        const response = await fetch("/api/uploads/repair", { method: "POST" });
        const payload = await response.json().catch(() => null) as { repaired?: number } | null;
        if (!cancelled && response.ok && payload?.repaired) router.refresh();
      } catch {
        // Repair is opportunistic; normal page loading should not depend on it.
      }
    }

    repairUploads();
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    const parentId = parent?.id || null;
    const pending = Object.values(readUploadSessions()).filter((session) => session.parentId === parentId);
    if (pending.length) {
      setUploads(pending.map((session) => ({ name: session.name, progress: 0, note: "重新选择同一文件继续" })));
    }
  }, [parent?.id]);

  useEffect(() => {
    if (!uploading) return;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    function warnBeforeNavigation(event: globalThis.MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.hasAttribute("download") || anchor.target === "_blank") return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;

      if (!window.confirm("文件正在上传，离开当前页面会中断上传。确定要离开吗？")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", warnBeforeNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", warnBeforeNavigation, true);
    };
  }, [uploading]);

  async function saveFolder(formData: FormData) {
    await createFolderAction(formData);
    setShowFolder(false);
  }

  async function saveRename(formData: FormData) {
    await renameItemAction(formData);
    setRenaming(null);
  }

  async function moveToTrash(formData: FormData) {
    await trashItemAction(formData);
    setRenaming(null);
  }

  async function uploadFolderCover(files: FileList | null) {
    const file = files?.[0];
    const folder = renaming;
    if (!file || folder?.kind !== "folder") return;
    setCoverBusy(true);
    setCoverError("");
    try {
      const prepared = await fetch(`/api/folders/${folder.id}/cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "prepare", type: file.type, size: file.size })
      });
      const preparedPayload = await prepared.json() as { uploadUrl?: string; error?: string };
      if (!prepared.ok || !preparedPayload.uploadUrl) throw new Error(preparedPayload.error || "无法上传封面");
      await uploadBlob(preparedPayload.uploadUrl, file, () => undefined, file.type);
      const completed = await fetch(`/api/folders/${folder.id}/cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "complete" })
      });
      const completedPayload = await completed.json().catch(() => ({})) as { error?: string };
      if (!completed.ok) throw new Error(completedPayload.error || "封面保存失败");
      setRenaming(null);
      router.refresh();
    } catch (error) {
      setCoverError(error instanceof Error ? error.message : "封面上传失败");
    } finally {
      setCoverBusy(false);
      if (coverPicker.current) coverPicker.current.value = "";
    }
  }

  async function removeFolderCover() {
    const folder = renaming;
    if (folder?.kind !== "folder") return;
    setCoverBusy(true);
    setCoverError("");
    try {
      const response = await fetch(`/api/folders/${folder.id}/cover`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "无法恢复默认封面");
      setRenaming(null);
      router.refresh();
    } catch (error) {
      setCoverError(error instanceof Error ? error.message : "无法恢复默认封面");
    } finally {
      setCoverBusy(false);
    }
  }

  function updateUploadProgress(index: number, progress: number, note?: string) {
    const nextProgress = Math.max(0, Math.min(99, Math.floor(progress)));
    setUploads((current) => current.map((entry, i) => i === index ? {
      ...entry,
      progress: Math.max(entry.progress, nextProgress),
      note
    } : entry));
  }

  async function uploadFileInParts(file: globalThis.File, index: number) {
    const parentId = parent?.id || null;
    const key = sessionKey(file, parentId);
    const saved = readUploadSessions()[key];
    const prepared = await fetch("/api/uploads/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, type: file.type, size: file.size, lastModified: file.lastModified, parentId })
    });
    const payload = await prepared.json() as PreparePayload;
    if (!prepared.ok) throw new Error(payload.error || "无法开始上传");

    const partSize = payload.partSize;
    writeUploadSession(key, { id: payload.id, name: file.name, size: file.size, lastModified: file.lastModified, parentId, partSize });
    const status = saved?.id === payload.id
      ? await fetch("/api/uploads/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: payload.id })
        }).then((response) => response.ok ? response.json() as Promise<PreparePayload> : payload).catch(() => payload)
      : payload;

    const uploadedParts = new Map((status.uploadedParts || payload.uploadedParts || []).map((part) => [part.partNumber, part.size]));
    let uploadedBytes = Array.from(uploadedParts.values()).reduce((total, size) => total + size, 0);
    updateUploadProgress(index, uploadedBytes / file.size * 100, uploadedBytes ? "续传中" : undefined);

    const partCount = Math.ceil(file.size / partSize);
    for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
      if (uploadedParts.has(partNumber)) continue;
      const start = (partNumber - 1) * partSize;
      const end = Math.min(file.size, start + partSize);
      const signed = await fetch("/api/uploads/part-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: payload.id, partNumber })
      });
      const signedPayload = await signed.json() as { uploadUrl?: string; error?: string };
      if (!signed.ok || !signedPayload.uploadUrl) throw new Error(signedPayload.error || "无法继续上传分片");
      const part = file.slice(start, end);
      await uploadBlob(signedPayload.uploadUrl, part, (loaded) => {
        updateUploadProgress(index, (uploadedBytes + loaded) / file.size * 100, partNumber > 1 ? "续传中" : undefined);
      });
      uploadedBytes += part.size;
      updateUploadProgress(index, uploadedBytes / file.size * 100, "续传中");
    }

    const completed = await fetch("/api/uploads/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: payload.id })
    });
    const completePayload = await completed.json().catch(() => ({})) as { error?: string };
    if (!completed.ok) throw new Error(completePayload.error || "文件已上传，但保存记录失败");
    deleteUploadSession(key);
    setUploads((current) => current.map((entry, i) => i === index ? { ...entry, progress: 100, note: undefined } : entry));
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    setUploads(selected.map((file) => ({ name: file.name, progress: 0 })));
    setUploading(true);
    try {
      for (const [index, file] of selected.entries()) {
        try {
          await uploadFileInParts(file, index);
        } catch (error) {
          setUploads((current) => current.map((entry, i) => i === index ? { ...entry, error: error instanceof Error ? error.message : "上传失败，可重新选择同一文件继续" } : entry));
        }
      }
      router.refresh();
      if (picker.current) picker.current.value = "";
      window.setTimeout(() => setUploads((current) => current.filter((entry) => entry.error)), 1200);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark small"><Cloud size={20} /></span><span>Tow1</span></div>
        <nav>
          <Link className={!trash ? "nav-item active" : "nav-item"} href="/"><Home size={18} />我的文件</Link>
          <Link className={trash ? "nav-item active" : "nav-item"} href="/?view=trash"><Trash2 size={18} />回收站</Link>
        </nav>
        <div className="storage-card">
          <div className="storage-heading"><HardDrive size={17} /><span>存储空间</span></div>
          <strong>{formatBytes(stats.used)}</strong>
          <span>{stats.count} 个文件</span>
          {stats.quotaBytes ? <><div className="storage-meter"><i style={{ width: `${usedPercent}%` }} /></div><span>剩余 {formatBytes(remainingBytes || 0)} / 共 {formatBytes(stats.quotaBytes)}</span></> : <span>未设置容量上限</span>}
        </div>
        <form action={logoutAction}><button className="nav-item logout"><LogOut size={18} />退出登录</button></form>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索当前文件夹" /></div>
          <div className="top-actions">
            <ThemeSwitcher />
            {!trash ? <><button className="secondary-button" onClick={() => setShowFolder(true)}><FolderPlus size={17} />新建文件夹</button>
              <button className="primary-button compact" onClick={() => picker.current?.click()}><Upload size={17} />上传文件</button>
              <input ref={picker} hidden type="file" multiple onChange={(e) => uploadFiles(e.target.files)} /></> : null}
          </div>
        </header>

        <section className="content">
          <div className="breadcrumb">
            <Link href="/">我的文件</Link>
            {parent ? <><ChevronRight size={15} /><span>{parent.name}</span></> : null}
            {trash ? <><ChevronRight size={15} /><span>回收站</span></> : null}
          </div>
          <div className="title-row"><div><h1>{trash ? "回收站" : parent?.name || "我的文件"}</h1><p>{visibleItems.length} 个项目</p></div></div>

          {visibleItems.length ? (
            <div className="file-grid">
              {visibleItems.map((item) => (
                <article
                  className="file-card"
                  key={item.id}
                  onMouseEnter={(event) => {
                    if (!isVideo(item) || trash) return;
                    event.currentTarget.querySelector("video")?.play().catch(() => undefined);
                  }}
                  onMouseLeave={(event) => {
                    const video = event.currentTarget.querySelector("video");
                    if (!video) return;
                    video.pause();
                    video.currentTime = videoThumbnailTime(video);
                  }}
                >
                  {item.kind === "folder" && !trash ? <Link className="file-open" href={`/?folder=${item.id}`} aria-label={`打开 ${item.name}`} /> : null}
                  {item.kind === "file" && !trash && canPreview(item) ? <button className="file-open preview-open" onClick={() => setPreviewing(item)} aria-label={`预览 ${item.name}`} /> : null}
                  {isVideo(item) ? <VideoTilePreview item={item} /> : (
                    <div className={item.kind === "folder" && !trash ? "file-visual folder-thumb" : isImage(item) ? "file-visual image-thumb" : "file-visual"}>
                      {item.kind === "folder" && item.cover_storage_key && !trash
                        ? <img src={`/api/folders/${item.id}/cover?v=${encodeURIComponent(item.updated_at)}`} alt="" loading="lazy" />
                        : isImage(item) ? <img src={`/api/files/${item.id}/preview`} alt="" loading="lazy" /> : <FileTypeIcon item={item} />}
                    </div>
                  )}
                  <div className="file-info"><strong title={item.name}>{item.name}</strong><span>{item.kind === "folder" ? "文件夹" : formatBytes(item.size_bytes)}</span></div>
                  <div className="item-actions">
                    {trash ? (
                      <>
                        <form action={restoreItemAction}><input type="hidden" name="id" value={item.id} /><button title="恢复"><ArchiveRestore size={17} /></button></form>
                        <form action={permanentlyDeleteItemAction}><input type="hidden" name="id" value={item.id} /><button className="danger-icon" title="永久删除" onClick={(event) => { if (!confirm(`永久删除“${item.name}”？这个操作不能撤销。`)) event.preventDefault(); }}><Trash2 size={17} /></button></form>
                      </>
                    ) : <>
                      {item.kind === "file" ? <a href={`/api/files/${item.id}/download`} title="下载"><Download size={17} /></a> : null}
                      <button title="更多" onClick={() => { setCoverError(""); setRenaming(item); }}><MoreHorizontal size={18} /></button>
                    </>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">{trash ? <Trash2 /> : <Folder />}</div>
              <h2>{query ? "没有匹配的文件" : trash ? "回收站是空的" : "这里还没有文件"}</h2>
              {!trash && !query ? <p>上传文件，或新建一个文件夹开始整理。</p> : null}
            </div>
          )}
        </section>
      </main>

      {uploads.length ? <div className="upload-panel"><div className="panel-title">上传任务<button onClick={() => setUploads([])}><X size={16} /></button></div>{uploads.map((item, index) => <div className="upload-row" key={`${item.name}-${index}`}><div><span>{item.name}</span><small>{item.error || item.note || `${item.progress}%`}</small></div><div className={item.error ? "progress error" : "progress"}><i style={{ width: `${item.progress}%` }} /></div></div>)}</div> : null}

      {showFolder ? <div className="modal-backdrop" onMouseDown={() => setShowFolder(false)}><form action={saveFolder} className="modal" onMouseDown={(e) => e.stopPropagation()}><h2>新建文件夹</h2><input type="hidden" name="parentId" value={parent?.id || ""} /><label>文件夹名称<input name="name" autoFocus maxLength={180} required /></label><div className="modal-actions"><button type="button" className="text-button" onClick={() => setShowFolder(false)}>取消</button><button className="primary-button compact">创建</button></div></form></div> : null}

      {renaming ? <div className="modal-backdrop" onMouseDown={() => setRenaming(null)}><form action={saveRename} className="modal" onMouseDown={(e) => e.stopPropagation()}><h2>管理项目</h2><input type="hidden" name="id" value={renaming.id} /><label>名称<input name="name" defaultValue={renaming.name} autoFocus maxLength={180} required /></label>{renaming.kind === "folder" ? <div className="folder-cover-actions"><span>文件夹封面</span><div><button type="button" className="secondary-button" disabled={coverBusy} onClick={() => coverPicker.current?.click()}><ImagePlus size={16} />{renaming.cover_storage_key ? "更换图片" : "选择图片"}</button>{renaming.cover_storage_key ? <button type="button" className="text-button" disabled={coverBusy} onClick={removeFolderCover}>恢复默认</button> : null}</div><input ref={coverPicker} hidden type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => uploadFolderCover(event.target.files)} />{coverError ? <p className="form-error">{coverError}</p> : null}</div> : null}<div className="item-management-actions"><button type="button" className="secondary-button" onClick={() => { setSharing(renaming); setRenaming(null); }}><Share2 size={16} />分享</button><button formAction={moveToTrash} className="danger-button"><Trash2 size={16} />移入回收站</button></div><div className="modal-actions"><button type="button" className="text-button" onClick={() => setRenaming(null)}>取消</button><button className="primary-button compact">保存</button></div></form></div> : null}
      {previewing ? <PreviewDialog item={previewing} onClose={() => setPreviewing(null)} /> : null}
      {sharing ? <ShareDialog item={sharing} onClose={() => setSharing(null)} /> : null}
    </div>
  );
}
