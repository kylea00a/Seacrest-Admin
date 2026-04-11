"use client";

import { useAdminSession } from "../AdminSessionContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AdminSetupPage() {
  const router = useRouter();
  const { refresh, needsSetup, account } = useAdminSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("Superadmin");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!needsSetup && account) router.replace("/admin/calendar");
    if (!needsSetup && !account) router.replace("/admin/login");
  }, [needsSetup, account, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(data.error ?? "Setup failed.");
        return;
      }
      await refresh();
      router.replace("/admin/calendar");
    } finally {
      setBusy(false);
    }
  }

  if (!needsSetup) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-500">
        Checking…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900/80 p-8 shadow-xl">
        <h1 className="text-center text-lg font-semibold text-white">First-time setup</h1>
        <p className="mt-1 text-center text-xs text-zinc-500">
          Create the superadmin account. Data is stored under <code className="text-zinc-400">data/admin/</code>.
        </p>
        <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
          <label className="block text-xs font-medium text-zinc-400">
            Display name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
            />
          </label>
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
            Password (min 8 characters)
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
              minLength={8}
              required
            />
          </label>
          {err ? <p className="text-xs text-red-400">{err}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create superadmin"}
          </button>
        </form>
      </div>
    </div>
  );
}
