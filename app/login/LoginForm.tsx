"use client";

import { useActionState } from "react";
import { Cloud, LockKeyhole } from "lucide-react";
import { loginAction } from "./actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { error: "" });
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark"><Cloud size={28} /></div>
        <p className="eyebrow">PRIVATE SPACE</p>
        <h1>Tow1</h1>
        <p className="muted">你的文件，只在你的空间里。</p>
        <form action={action} className="login-form">
          <label>用户名<input name="username" autoComplete="username" defaultValue="owner" required /></label>
          <label>密码<input name="password" type="password" autoComplete="current-password" required /></label>
          {state.error ? <p className="form-error">{state.error}</p> : null}
          <button className="primary-button" disabled={pending}><LockKeyhole size={17} />{pending ? "正在进入…" : "进入我的空间"}</button>
        </form>
      </section>
    </main>
  );
}
