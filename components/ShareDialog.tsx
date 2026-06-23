"use client";

import { useEffect, useState } from "react";
import { Ban, Check, Clock3, Copy, Link2, Share2, X } from "lucide-react";
import type { DriveItem } from "@/lib/db";

type ShareSummary = {
  id: string;
  url: string;
  expiresAt: string;
  createdAt: string;
  downloadCount: number;
  status: "active" | "expired" | "revoked";
};

function defaultExpiry() {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function statusText(status: ShareSummary["status"]) {
  if (status === "active") return "有效";
  if (status === "expired") return "已过期";
  return "已撤销";
}

export default function ShareDialog({ item, onClose }: { item: DriveItem; onClose: () => void }) {
  const [shares, setShares] = useState<ShareSummary[]>([]);
  const [password, setPassword] = useState("");
  const [expiresAt, setExpiresAt] = useState(defaultExpiry);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState("");

  async function loadShares() {
    const response = await fetch(`/api/shares?itemId=${encodeURIComponent(item.id)}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "无法读取分享记录");
    setShares(result.shares);
  }

  useEffect(() => { loadShares().catch((caught) => setError(caught instanceof Error ? caught.message : "无法读取分享记录")); }, [item.id]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, password, expiresAt: new Date(expiresAt).toISOString() })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "创建分享失败");
      setShares((current) => [result.share, ...current]);
      setPassword("");
      await copyLink(result.share.url, result.share.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建分享失败");
    } finally {
      setPending(false);
    }
  }

  async function copyLink(url: string, id: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("无法自动复制，请手动复制链接");
    }
  }

  async function revoke(id: string) {
    setError("");
    const response = await fetch(`/api/shares/${id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return setError(result.error || "撤销分享失败");
    setShares((current) => current.map((share) => share.id === id ? { ...share, status: "revoked" } : share));
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal share-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="share-dialog-heading"><div><span className="share-heading-icon"><Share2 size={19} /></span><div><h2>分享“{item.name}”</h2><p>访客输入密码后可以查看和下载。</p></div></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button></div>
        <form onSubmit={create} className="share-form">
          <label>分享密码<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={4} maxLength={64} placeholder="至少 4 个字符" required /></label>
          <label>到期时间<input value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} type="datetime-local" required /></label>
          {error ? <p className="form-error share-error">{error}</p> : null}
          <button className="primary-button" disabled={pending}><Link2 size={17} />{pending ? "正在创建…" : "创建并复制链接"}</button>
        </form>

        <div className="share-history">
          <div className="share-history-title"><strong>分享记录</strong><span>{shares.filter((share) => share.status === "active").length} 个有效链接</span></div>
          {shares.length ? <div className="share-list">{shares.map((share) => <div className={`share-row ${share.status}`} key={share.id}>
            <div><span className="share-status">{statusText(share.status)}</span><small><Clock3 size={13} />{new Date(share.expiresAt).toLocaleString("zh-CN", { hour12: false })} · 下载 {share.downloadCount} 次</small></div>
            {share.status === "active" ? <div className="share-row-actions"><button onClick={() => copyLink(share.url, share.id)} title="复制链接">{copied === share.id ? <Check size={16} /> : <Copy size={16} />}</button><button onClick={() => revoke(share.id)} title="撤销分享"><Ban size={16} /></button></div> : null}
          </div>)}</div> : <p className="share-empty">还没有分享记录。</p>}
        </div>
      </section>
    </div>
  );
}
