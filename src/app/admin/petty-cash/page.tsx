"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminSettings, PettyCashRequest, PettyCashState, UserRole } from "@/data/admin/types";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function currency(n: number) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "PHP" }).format(n);
  } catch {
    return `${n}`;
  }
}

function pill(status: string) {
  if (status === "approved") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === "rejected") return "border-red-500/30 bg-red-500/10 text-red-200";
  return "border-white/10 bg-white/5 text-zinc-200";
}

export default function PettyCashPage() {
  const [role, setRole] = useState<UserRole>("employee");
  const [employeeName, setEmployeeName] = useState("Employee");

  const [state, setState] = useState<PettyCashState | null>(null);
  const [requests, setRequests] = useState<PettyCashRequest[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState("Miscellaneous");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dateRequested, setDateRequested] = useState(todayISO());

  const [balanceInput, setBalanceInput] = useState<string>("0");
  const availableBalance = state?.balance ?? 0;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pettyRes, settingsRes] = await Promise.all([
        fetch("/api/admin/petty-cash", { cache: "no-store" }),
        fetch("/api/admin/settings", { cache: "no-store" }),
      ]);

      const json = (await pettyRes.json()) as { state?: PettyCashState; requests?: PettyCashRequest[]; error?: string };
      const settingsJson = (await settingsRes.json()) as { settings?: AdminSettings; error?: string };

      if (!pettyRes.ok) throw new Error(json.error ?? `Failed with status ${pettyRes.status}`);
      if (!settingsRes.ok) throw new Error(settingsJson.error ?? `Failed with status ${settingsRes.status}`);

      setState(json.state ?? null);
      setRequests(json.requests ?? []);
      setSettings(settingsJson.settings ?? null);
      setBalanceInput(String(json.state?.balance ?? 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amt = Number(amount);
    if (!description.trim()) return setError("Description is required.");
    if (!Number.isFinite(amt) || amt <= 0) return setError("Amount must be greater than 0.");
    if (amt > availableBalance) return setError(`Insufficient balance. Available: ${currency(availableBalance)}`);

    const res = await fetch("/api/admin/petty-cash?action=request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeName: employeeName.trim() || "Employee",
        category: category.trim(),
        description: description.trim(),
        amount: amt,
        dateRequested,
      }),
    });
    const json = (await res.json()) as { request?: PettyCashRequest; state?: PettyCashState; error?: string; availableBalance?: number };
    if (!res.ok) {
      setError(json.error ?? "Failed to create request.");
      return;
    }
    setDescription("");
    setAmount("");
    await load();
  };

  const decide = async (requestId: string, action: "approve" | "reject") => {
    setError(null);
    const res = await fetch("/api/admin/petty-cash?action=decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action, decidedBy: "Superadmin" }),
    });
    const json = (await res.json()) as { request?: PettyCashRequest; state?: PettyCashState; error?: string; availableBalance?: number };
    if (!res.ok) {
      setError(json.error ?? "Failed to update request.");
      return;
    }
    await load();
  };

  const setBalance = async () => {
    setError(null);
    const bal = Number(balanceInput);
    if (!Number.isFinite(bal) || bal < 0) {
      setError("Balance must be a valid number (>= 0).");
      return;
    }
    const res = await fetch("/api/admin/petty-cash?action=set-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ balance: bal }),
    });
    const json = (await res.json()) as { state?: PettyCashState; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Failed to set balance.");
      return;
    }
    setState(json.state ?? null);
  };

  const pending = useMemo(() => requests.filter((r) => r.status === "pending"), [requests]);
  const pettyCategories = useMemo(() => {
    const list = settings?.pettyCashCategories?.length ? settings.pettyCashCategories : ["Miscellaneous"];
    return Array.from(new Set(list.map((s) => s.trim()).filter(Boolean)));
  }, [settings]);

  useEffect(() => {
    if (!pettyCategories.length) return;
    if (!pettyCategories.includes(category)) setCategory(pettyCategories[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pettyCategories.join("|")]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="admin-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="admin-title">Petty Cash</h1>
            <div className="text-sm text-zinc-300">
              Requests, approvals, and automatic deductions from balance
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-[11px] font-semibold text-zinc-400">Available Balance</div>
            <div className="mt-1 text-lg font-bold text-white">
              {currency(availableBalance)}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="text-xs font-semibold text-zinc-400">Mode</div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none"
          >
            <option value="employee">Employee</option>
            <option value="superadmin">Superadmin</option>
          </select>
          {role === "employee" && (
            <input
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              className="w-56 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
              placeholder="Employee name"
            />
          )}
        </div>

        {loading ? (
          <div className="mt-4 text-sm text-zinc-300">Loading…</div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {role === "employee" && (
          <form onSubmit={createRequest} className="mt-6 space-y-4">
            <div className="text-sm font-semibold">Request Budget</div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-semibold">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
                  required
                >
                  {pettyCategories.map((c) => (
                    <option value={c} key={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold">Date requested</label>
                <input
                  type="date"
                  value={dateRequested}
                  onChange={(e) => setDateRequested(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none"
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-1">
                <label className="text-sm font-semibold">Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                  placeholder="Battery"
                  required
                />
              </div>
              <div className="sm:col-span-1">
                <label className="text-sm font-semibold">Amount</label>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                  placeholder="180"
                  required
                />
                <div className="mt-1 text-xs text-zinc-400">
                  Available: {currency(availableBalance)}
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="rounded-xl bg-pink-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-500/20 hover:bg-pink-400"
            >
              Submit Request
            </button>
          </form>
        )}

        {role === "superadmin" && (
          <div className="mt-6 space-y-4">
            <div className="text-sm font-semibold">Superadmin Controls</div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs font-semibold text-zinc-400">Set petty cash balance</div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={balanceInput}
                  onChange={(e) => setBalanceInput(e.target.value)}
                  inputMode="decimal"
                  className="w-48 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none"
                />
                <button
                  type="button"
                  onClick={setBalance}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10"
                >
                  Update
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">Pending requests</div>
                  <div className="mt-1 text-xs text-zinc-400">
                    Approving will automatically deduct from the balance.
                  </div>
                </div>
                <div className="text-xs font-semibold text-zinc-400">{pending.length} pending</div>
              </div>

              <div className="mt-4 space-y-3">
                {pending.length === 0 ? (
                  <div className="text-sm text-zinc-300">No pending requests.</div>
                ) : (
                  pending.map((r) => (
                    <div key={r.id} className="admin-card-inset">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white">
                            {r.description} — {currency(r.amount)}
                          </div>
                          <div className="mt-1 text-xs text-zinc-300">
                            {r.category} • {r.employeeName} • Requested {r.dateRequested}
                          </div>
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${pill(r.status)}`}>
                          {r.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => decide(r.id, "approve")}
                          className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-400"
                        >
                          Approve (deduct)
                        </button>
                        <button
                          type="button"
                          onClick={() => decide(r.id, "reject")}
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                        >
                          Reject
                        </button>
                        <div className="ml-auto text-xs text-zinc-400">
                          Balance: {currency(availableBalance)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="admin-card">
        <div className="text-sm font-semibold">All Requests</div>
        <div className="mt-1 text-xs text-zinc-300">Latest first</div>

        <div className="mt-4 space-y-2">
          {requests.length === 0 ? (
            <div className="text-sm text-zinc-300">No requests yet.</div>
          ) : (
            requests.slice(0, 30).map((r) => (
              <div key={r.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-white">
                      {r.description} — {currency(r.amount)}
                    </div>
                    <div className="mt-1 text-xs text-zinc-300">
                      {r.category} • {r.employeeName} • {r.dateRequested}
                    </div>
                    {r.decidedAt && (
                      <div className="mt-1 text-[11px] text-zinc-400">
                        {r.status} by {r.decidedBy ?? "Superadmin"} • {new Date(r.decidedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${pill(r.status)}`}>
                    {r.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

