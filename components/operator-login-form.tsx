"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function OperatorLoginForm() {
  const router = useRouter(); const [error, setError] = useState(""); const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setPending(true); const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/operator/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Sign in failed.");
      router.replace("/operator"); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Sign in failed."); setPending(false); }
  }
  return <form onSubmit={submit}><div className="field"><label htmlFor="email">Operator email</label><input id="email" name="email" type="email" autoComplete="username" required /></div><div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" minLength={8} required /></div><button className="button-primary full" type="submit" disabled={pending} aria-busy={pending}>{pending ? "Signing in…" : "Sign in"}</button>{error && <p className="field-error" role="alert">{error}</p>}</form>;
}
