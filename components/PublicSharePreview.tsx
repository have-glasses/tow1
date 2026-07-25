"use client";

import { useState } from "react";
import { Download, ExternalLink, FileVideo, Play, X } from "lucide-react";

export type PublicPreviewItem = {
  id: string;
  name: string;
  mime_type: string | null;
  size_bytes: number;
};

export type PublicDownloadItem = {
  id: string;
  name: string;
};

function isRestrictedInAppBrowser() {
  const userAgent = navigator.userAgent;
  return /MicroMessenger|Weibo|QQ\/|AlipayClient|DingTalk|aweme|Toutiao|BytedanceWebview/i.test(userAgent);
}

function DownloadBrowserGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal download-guide-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="download-guide-icon"><ExternalLink size={24} /></div>
        <h2>请在浏览器中打开</h2>
        <p>当前应用可能无法直接下载文件。</p>
        <ol>
          <li>点击右上角菜单</li>
          <li>选择“在浏览器打开”</li>
          <li>重新点击下载</li>
        </ol>
        <button className="primary-button" type="button" onClick={onClose}>知道了</button>
      </section>
    </div>
  );
}

function extension(item: Pick<PublicPreviewItem, "name">) {
  return item.name.split(".").pop()?.toLowerCase() || "";
}

export function isPreviewablePublic(item: Pick<PublicPreviewItem, "name" | "mime_type">) {
  const type = item.mime_type || "";
  const ext = extension(item);
  return type.startsWith("image/") || type.startsWith("video/") || type.startsWith("audio/") || type.startsWith("text/") || type === "application/pdf" ||
    ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif", "mp4", "webm", "mov", "mp3", "wav", "ogg", "m4a", "txt", "md", "csv", "json", "log", "pdf"].includes(ext);
}

export function isImagePublic(item: Pick<PublicPreviewItem, "name" | "mime_type">) {
  return Boolean(item.mime_type?.startsWith("image/")) || ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif"].includes(extension(item));
}

function previewKind(item: Pick<PublicPreviewItem, "name" | "mime_type">) {
  const type = item.mime_type || "";
  const ext = extension(item);
  if (isImagePublic(item)) return "image";
  if (type.startsWith("video/") || ["mp4", "webm", "mov"].includes(ext)) return "video";
  if (type.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a"].includes(ext)) return "audio";
  if (type.startsWith("text/") || ["txt", "md", "csv", "json", "log"].includes(ext)) return "text";
  if (type === "application/pdf" || ext === "pdf") return "pdf";
  return null;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let i = 1; i < units.length && value >= 1024; i += 1) { value /= 1024; unit = units[i]; }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

function videoThumbnailTime(video: HTMLVideoElement) {
  return Number.isFinite(video.duration) ? Math.min(0.5, Math.max(0.05, video.duration * 0.05)) : 0.1;
}

export function PublicVideoTile({ itemId, token }: { itemId: string; token: string }) {
  const [failed, setFailed] = useState(false);
  const previewUrl = `/api/public/shares/${token}/files/${itemId}/preview`;

  return (
    <div className="file-visual video-thumb">
      {failed ? <FileVideo className="video-icon" /> : <video
        src={previewUrl}
        preload="metadata"
        muted
        playsInline
        onLoadedMetadata={(event) => { event.currentTarget.currentTime = videoThumbnailTime(event.currentTarget); }}
        onError={() => setFailed(true)}
      />}
      <span className="play-badge" aria-hidden="true"><Play size={16} fill="currentColor" /></span>
    </div>
  );
}

export function PublicBatchDownloadButton({ files, token, tooMany = false }: { files: PublicDownloadItem[]; token: string; tooMany?: boolean }) {
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [showBrowserGuide, setShowBrowserGuide] = useState(false);

  async function downloadAll() {
    if (isRestrictedInAppBrowser()) {
      setShowBrowserGuide(true);
      return;
    }
    if (tooMany) {
      setMessage("文件较多，请进入子文件夹分批下载");
      return;
    }
    if (!files.length || running) return;
    setRunning(true);
    setProgress(0);
    setMessage("");

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const link = document.createElement("a");
      link.href = `/api/public/shares/${token}/files/${file.id}`;
      link.download = file.name;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setProgress(index + 1);
      if (index < files.length - 1) await new Promise((resolve) => window.setTimeout(resolve, 600));
    }

    setRunning(false);
    setMessage(`已发起 ${files.length} 个下载；若被拦截，请允许此网站下载多个文件`);
  }

  return (
    <div className="batch-download">
      <button className="secondary-button compact-link" type="button" onClick={downloadAll} disabled={running || !files.length}>
        <Download size={16} />{running ? `正在下载 ${progress}/${files.length}` : "下载全部"}
      </button>
      {message ? <span className="batch-download-message" role="status">{message}</span> : null}
      {showBrowserGuide ? <DownloadBrowserGuide onClose={() => setShowBrowserGuide(false)} /> : null}
    </div>
  );
}

export function PublicDownloadLink({ href, name, className = "public-download" }: { href: string; name: string; className?: string }) {
  const [showBrowserGuide, setShowBrowserGuide] = useState(false);

  return (
    <>
      <a className={className} href={href} download={name} onClick={(event) => {
        if (!isRestrictedInAppBrowser()) return;
        event.preventDefault();
        setShowBrowserGuide(true);
      }}><Download size={17} />下载</a>
      {showBrowserGuide ? <DownloadBrowserGuide onClose={() => setShowBrowserGuide(false)} /> : null}
    </>
  );
}

export function PublicPreviewButton({ item, token }: { item: PublicPreviewItem; token: string }) {
  const [open, setOpen] = useState(false);
  if (!isPreviewablePublic(item)) return null;
  const previewUrl = `/api/public/shares/${token}/files/${item.id}/preview`;
  const downloadUrl = `/api/public/shares/${token}/files/${item.id}`;
  const kind = previewKind(item);

  return (
    <>
      <button className="file-open preview-open" onClick={() => setOpen(true)} aria-label={`预览 ${item.name}`} />
      {open ? <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
        <section className="modal preview-modal" onMouseDown={(event) => event.stopPropagation()}>
          <div className="preview-heading">
            <div><h2>{item.name}</h2><p>{formatBytes(item.size_bytes)}</p></div>
            <button className="icon-button" onClick={() => setOpen(false)} aria-label="关闭"><X size={18} /></button>
          </div>
          <div className="preview-body">
            {kind === "image" ? <img src={previewUrl} alt={item.name} /> : null}
            {kind === "pdf" ? <iframe src={previewUrl} title={item.name} /> : null}
            {kind === "text" ? <iframe src={previewUrl} title={item.name} /> : null}
            {kind === "video" ? <video src={previewUrl} controls /> : null}
            {kind === "audio" ? <audio src={previewUrl} controls /> : null}
          </div>
          <div className="modal-actions">
            <PublicDownloadLink className="secondary-button" href={downloadUrl} name={item.name} />
            <button className="primary-button compact" onClick={() => setOpen(false)}>完成</button>
          </div>
        </section>
      </div> : null}
    </>
  );
}
