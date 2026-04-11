"use client";

import {
  ADMIN_PERMISSION_KEYS,
  ADMIN_PERMISSION_LABELS,
  defaultPermissionsAllFalse,
  type AdminPermissionKey,
} from "@/data/admin/adminPermissions";
import { useAdminSession } from "../AdminSessionContext";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  email: string;
  displayName: string;
  isSuperadmin: boolean;
  permissions: Record<AdminPermissionKey, boolean>;
};

export default function AccountsPage() {
  const router = useRouter();
  const { account: me, refresh: refreshSession } = useAdminSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setErr(null);
    const res = await fetch("/api/admin/accounts", { cache: "no-store" });
    const data = (await res.json()) as { accounts?: Row[]; error?: string };
    if (!res.ok) {
      setErr(data.error ?? "Failed to load accounts.");
      return;
    }
    setRows(data.accounts ?? []);
  }, []);

  useEffect(() => {
    if (!me?.isSuperadmin) {
      router.replace("/admin/forbidden");
      return;
    }
    void (async () => {
      await load();
      setLoading(false);
    })();
  }, [me, router, load]);

  if (!me?.isSuperadmin) return null;

  return (
    <div className="admin-card max-w-4xl">
      <h1 className="admin-title">Accounts</h1>
      <p className="admin-muted mt-1">
        Superadmin only. Create users and toggle which sections they can open. Superadmins always have full access.
      </p>

      {loading ? <p className="mt-4 text-sm text-zinc-400">Loading…</p> : null}
      {err ? <p className="mt-4 text-sm text-red-400">{err}</p> : null}

      <CreateAccountForm
        onCreated={async () => {
          await load();
          await refreshSession();
        }}
      />

      <div className="mt-8 space-y-6">
        {rows.map((a) => (
          <AccountEditor
            key={a.id}
            row={a}
            isSelf={a.id === me.id}
            onSaved={load}
            onDeleted={async () => {
              await load();
              await refreshSession();
            }}
          />
        ))}
      </div>
    </div>
  );
}

function CreateAccountForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [perm, setPerm] = useState<Record<AdminPermissionKey, boolean>>(defaultPermissionsAllFalse());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          displayName,
          isSuperadmin,
          permissions: isSuperadmin ? undefined : perm,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg(data.error ?? "Could not create.");
        return;
      }
      setEmail("");
      setPassword("");
      setDisplayName("");
      setIsSuperadmin(false);
      setPerm(defaultPermissionsAllFalse());
      setMsg("Account created.");
      await onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4"
    >
      <h2 className="text-sm font-semibold text-zinc-200">New account</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-zinc-400">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Password (min 8)
          <input
            type="password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-zinc-400 sm:col-span-2">
          Display name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
          />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={isSuperadmin}
          onChange={(e) => setIsSuperadmin(e.target.checked)}
          className="rounded border-white/20"
        />
        Superadmin (full access)
      </label>
      {!isSuperadmin ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {ADMIN_PERMISSION_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={perm[key]}
                onChange={(e) => setPerm((p) => ({ ...p, [key]: e.target.checked }))}
                className="rounded border-white/20"
              />
              {ADMIN_PERMISSION_LABELS[key]}
            </label>
          ))}
        </div>
      ) : null}
      {msg ? <p className="mt-2 text-xs text-emerald-400">{msg}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}

function AccountEditor({
  row,
  isSelf,
  onSaved,
  onDeleted,
}: {
  row: Row;
  isSelf: boolean;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(row.displayName);
  const [isSuperadmin, setIsSuperadmin] = useState(row.isSuperadmin);
  const [perm, setPerm] = useState(row.permissions);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDisplayName(row.displayName);
    setIsSuperadmin(row.isSuperadmin);
    setPerm({ ...defaultPermissionsAllFalse(), ...row.permissions });
  }, [row]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        id: row.id,
        displayName,
        isSuperadmin,
        permissions: isSuperadmin ? undefined : perm,
      };
      if (newPassword.length >= 8) body.password = newPassword;
      const res = await fetch("/api/admin/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "Save failed.");
        return;
      }
      setNewPassword("");
      await onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${row.email}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/accounts?id=${encodeURIComponent(row.id)}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "Delete failed.");
        return;
      }
      await onDeleted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium text-zinc-100">{row.email}</div>
          <div className="text-xs text-zinc-500">{row.id}</div>
        </div>
        {!isSelf ? (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
          >
            Delete
          </button>
        ) : (
          <span className="text-xs text-zinc-500">This is you</span>
        )}
      </div>
      <form onSubmit={(e) => void save(e)} className="mt-4 space-y-3">
        <label className="block text-xs text-zinc-400">
          Display name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full max-w-md rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={isSuperadmin}
            onChange={(e) => setIsSuperadmin(e.target.checked)}
            disabled={isSelf && isSuperadmin}
            className="rounded border-white/20"
          />
          Superadmin
        </label>
        {!isSuperadmin ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {ADMIN_PERMISSION_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={perm[key]}
                  onChange={(e) => setPerm((p) => ({ ...p, [key]: e.target.checked }))}
                  className="rounded border-white/20"
                />
                {ADMIN_PERMISSION_LABELS[key]}
              </label>
            ))}
          </div>
        ) : null}
        <label className="block text-xs text-zinc-400">
          New password (leave blank to keep)
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 w-full max-w-md rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
            placeholder="Min 8 characters"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
