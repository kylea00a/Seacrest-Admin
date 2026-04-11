"use client";

import { useAdminSession } from "../AdminSessionContext";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

export default function AdminLoginPage() {
  const router = useRouter();
  const { refresh, needsSetup, account } = useAdminSession();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (needsSetup) router.replace("/admin/setup");
    else if (account) router.replace("/admin/calendar");
  }, [needsSetup, account, router]);

  async function runSignIn() {
    const emailVal = emailRef.current?.value.trim() ?? "";
    const passwordVal = passwordRef.current?.value ?? "";
    if (!emailVal || !passwordVal) {
      flushSync(() => {
        setErr("Enter your email and password.");
      });
      return;
    }

    flushSync(() => {
      setErr(null);
      setBusy(true);
    });

    const loginUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/admin/auth/login`;

    const ac = new AbortController();
    const timeoutId = window.setTimeout(() => ac.abort(), 45_000);
    try {
      const res = await fetch(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailVal, password: passwordVal }),
        credentials: "same-origin",
        signal: ac.signal,
      });

      const raw = await res.text();
      let data: { error?: string } = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as { error?: string };
        } catch {
          flushSync(() => {
            setErr(res.ok ? "Unexpected server response." : `Sign-in failed (${res.status}).`);
          });
          return;
        }
      }
      if (!res.ok) {
        flushSync(() => {
          setErr(data.error ?? `Sign-in failed (${res.status}).`);
        });
        return;
      }
      const snapshot = await refresh();
      if (snapshot.needsSetup) {
        router.replace("/admin/setup");
        return;
      }
      if (!snapshot.account) {
        flushSync(() => {
          setErr(
            "The browser did not keep your session. If you open the admin over plain HTTP (not HTTPS), set ADMIN_SESSION_INSECURE_HTTP=1 in the server environment and restart, or put the site behind HTTPS.",
          );
        });
        return;
      }
      router.replace("/admin/calendar");
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.name === "AbortError"
            ? "Request timed out — check that the dev server is running and try again."
            : e.message
          : "Could not reach the server.";
      flushSync(() => {
        setErr(msg);
      });
    } finally {
      window.clearTimeout(timeoutId);
      flushSync(() => {
        setBusy(false);
      });
    }
  }

  return (
    <div className="relative z-50 flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900/80 p-8 shadow-xl">
        <h1 className="text-center text-lg font-semibold text-white">Seacrest Admin</h1>
        <p className="mt-1 text-center text-xs text-zinc-500">Sign in to continue</p>
        <form
          method="post"
          action="#"
          noValidate
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void runSignIn();
          }}
        >
          <div>
            <label className="block text-xs font-medium text-zinc-400" htmlFor="admin-login-email">
              Email
            </label>
            <input
              ref={emailRef}
              id="admin-login-email"
              name="email"
              type="email"
              autoComplete="username"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400" htmlFor="admin-login-password">
              Password
            </label>
            <input
              ref={passwordRef}
              id="admin-login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
            />
          </div>
          <div aria-live="polite" className="min-h-[1.25rem]">
            {err ? <p className="text-xs text-red-400">{err}</p> : null}
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full cursor-pointer rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
