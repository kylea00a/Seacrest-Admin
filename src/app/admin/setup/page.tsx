"use client";

import { useAdminSession } from "../AdminSessionContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AdminSetupPage() {
  const router = useRouter();
  const { refresh, needsSetup, account } = useAdminSession();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!needsSetup && account) router.replace("/admin/calendar");
    if (!needsSetup && !account) router.replace("/admin/login");
  }, [needsSetup, account, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const form = e.currentTarget;
    const dnEl = form.elements.namedItem("displayName");
    const emailEl = form.elements.namedItem("email");
    const passEl = form.elements.namedItem("password");
    const displayNameVal =
      dnEl instanceof HTMLInputElement ? dnEl.value.trim() || "Superadmin" : "Superadmin";
    const emailVal = emailEl instanceof HTMLInputElement ? emailEl.value.trim() : "";
    const passwordVal = passEl instanceof HTMLInputElement ? passEl.value : "";
    if (!emailVal || passwordVal.length < 8) {
      setErr("Enter a valid email and a password of at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailVal,
          password: passwordVal,
          displayName: displayNameVal,
        }),
      });
      const raw = await res.text();
      let data: { error?: string } = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as { error?: string };
        } catch {
          setErr(res.ok ? "Unexpected server response." : `Setup failed (${res.status}).`);
          return;
        }
      }
      if (!res.ok) {
        setErr(data.error ?? `Setup failed (${res.status}).`);
        return;
      }
      const snapshot = await refresh();
      if (!snapshot.account) {
        setErr(
          "Account created, but the browser did not keep your session. If you use HTTP (not HTTPS), set ADMIN_SESSION_INSECURE_HTTP=1 on the server and restart, or use HTTPS.",
        );
        return;
      }
      router.replace("/admin/calendar");
    } catch (err) {
      setErr(err instanceof Error ? err.message : "Could not reach the server.");
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
        <form
          noValidate
          onSubmit={(e) => void onSubmit(e)}
          className="mt-6 space-y-4"
        >
          <label className="block text-xs font-medium text-zinc-400">
            Display name
            <input
              name="displayName"
              defaultValue="Superadmin"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
            />
          </label>
          <label className="block text-xs font-medium text-zinc-400">
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              defaultValue=""
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
            />
          </label>
          <label className="block text-xs font-medium text-zinc-400">
            Password (min 8 characters)
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              defaultValue=""
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
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
