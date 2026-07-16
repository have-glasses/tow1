"use client";

import { useState } from "react";
import { KeyRound, LockKeyhole } from "lucide-react";

export default function ShareUnlockForm({ token, itemName, expiresAt }: { token: string; itemName: string; expiresAt: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/public/shares/${token}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "无法打开分享");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法打开分享");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="share-shell">
      <section className="share-unlock-card">
        <div className="brand-mark"><LockKeyhole size={26} /></div>
        <p className="eyebrow">TOW1 SHARE</p>
        <h1>{itemName}</h1>
        <p className="muted">输入分享密码后即可查看和下载。</p>
        <form onSubmit={unlock} className="login-form">
          <label>分享密码<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="off" minLength={4} maxLength={64} required autoFocus /></label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" disabled={pending}><KeyRound size={17} />{pending ? "正在验证…" : "打开分享"}</button>
        </form>
        <p className="share-expiry">有效期至 {new Date(expiresAt).toLocaleString("zh-CN", { hour12: false })}</p>
      </section>
    </main>
  );
}
