"use client";

import { useAdminSession } from "../AdminSessionContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AdminLoginPage() {
  const router = useRouter();
  const { refresh, needsSetup, account } = useAdminSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (needsSetup) router.replace("/admin/setup");
    else if (account) router.replace("/admin/calendar");
  }, [needsSetup, account, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(data.error ?? "Sign-in failed.");
        return;
      }
      await refresh();
      router.replace("/admin/calendar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900/80 p-8 shadow-xl">
        <h1 className="text-center text-lg font-semibold text-white">Seacrest Admin</h1>
        <p className="mt-1 text-center text-xs text-zinc-500">Sign in to continue</p>
        <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
          <label className="block text-xs font-medium text-zinc-400">
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
              required
            />
          </label>
          <label className="block text-xs font-medium text-zinc-400">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
              required
            />
          </label>
          {err ? <p className="text-xs text-red-400">{err}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
