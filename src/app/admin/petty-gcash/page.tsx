"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AdminSettings,
  PettyCashLedgerTransaction,
  PettyCashRequest,
  PettyCashRequestType,
  PettyCashState,
  PettyFundId,
  UserRole,
} from "@/data/admin/types";
import { categoryForRequestType, PETTY_FUND_IDS } from "@/lib/pettyFundConstants";
import { PettyRequestFields, requestMetaLine, requestTypeApproveLabel } from "../_components/PettyRequestFields";
import { useAdminSession } from "../AdminSessionContext";

const SOURCE_FUND: PettyFundId = "pettyGCash";

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

export default function PettyGCashPage() {
  const { account, can } = useAdminSession();
  const [role, setRole] = useState<UserRole>("employee");
  const [employeeName, setEmployeeName] = useState("Employee");

  const [state, setState] = useState<PettyCashState | null>(null);
  const [requests, setRequests] = useState<PettyCashRequest[]>([]);
  const [ledger, setLedger] = useState<PettyCashLedgerTransaction[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dateRequested, setDateRequested] = useState(todayISO());
  const [requestType, setRequestType] = useState<PettyCashRequestType>("budget");
  const [targetFund, setTargetFund] = useState<PettyFundId>(SOURCE_FUND);

  const setRequestTypeAndTarget = (t: PettyCashRequestType) => {
    setRequestType(t);
    if (t === "transfer") {
      setTargetFund(PETTY_FUND_IDS.find((id) => id !== SOURCE_FUND) ?? "pettyGCash");
    } else if (t === "cashIn") {
      setTargetFund(SOURCE_FUND);
    }
  };

  const [balanceInput, setBalanceInput] = useState<string>("0");
  const availableBalance = state?.balance ?? 0;
  const canEdit = can("pettyGCashEdit") || account?.isSuperadmin;

  const [soaStart, setSoaStart] = useState("");
  const [soaEnd, setSoaEnd] = useState("");
  const [soaSearch, setSoaSearch] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState<10 | 25 | 50>(25);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pettyRes, settingsRes] = await Promise.all([
        fetch("/api/admin/petty-gcash", { cache: "no-store" }),
        fetch("/api/admin/settings", { cache: "no-store" }),
      ]);

      const json = (await pettyRes.json()) as { state?: PettyCashState; requests?: PettyCashRequest[]; error?: string };
      const ledgerAny = (json as unknown as { ledger?: PettyCashLedgerTransaction[] }).ledger;
      const settingsJson = (await settingsRes.json()) as { settings?: AdminSettings; error?: string };

      if (!pettyRes.ok) throw new Error(json.error ?? `Failed with status ${pettyRes.status}`);
      if (!settingsRes.ok) throw new Error(settingsJson.error ?? `Failed with status ${settingsRes.status}`);

      setState(json.state ?? null);
      setRequests(json.requests ?? []);
      setLedger(Array.isArray(ledgerAny) ? ledgerAny : []);
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
    if ((requestType === "budget" || requestType === "transfer") && amt > availableBalance) {
      return setError(`Insufficient balance. Available: ${currency(availableBalance)}`);
    }
    if (requestType === "transfer" && targetFund === SOURCE_FUND) {
      return setError("Choose a different fund to transfer to.");
    }

    const res = await fetch("/api/admin/petty-gcash?action=request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeName: employeeName.trim() || "Employee",
        category: categoryForRequestType(requestType),
        description: description.trim(),
        amount: amt,
        dateRequested,
        requestType,
        targetFund: requestType === "cashIn" || requestType === "transfer" ? targetFund : undefined,
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
    const res = await fetch("/api/admin/petty-gcash?action=decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action, decidedBy: account?.displayName ?? "Superadmin" }),
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
    const res = await fetch("/api/admin/petty-gcash?action=set-balance", {
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

  const deleteLedger = async (id: string) => {
    const ok = window.confirm("Delete this SOA entry?");
    if (!ok) return;
    setError(null);
    const res = await fetch("/api/admin/petty-gcash?action=delete-ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Failed to delete SOA entry.");
      return;
    }
    await load();
  };

  const editLedger = async (id: string) => {
    const row = ledger.find((t) => t.id === id);
    if (!row) return;
    const nextDate = window.prompt("Date (YYYY-MM-DD)", row.date) ?? "";
    if (!nextDate.trim()) return;
    const nextDesc = window.prompt("Description", row.description) ?? "";
    if (!nextDesc.trim()) return;
    const nextCat = window.prompt("Category (optional)", row.category ?? "") ?? "";
    const nextDebit = window.prompt("Debit (0 if none)", String(row.debit ?? 0)) ?? "";
    const nextCredit = window.prompt("Credit (0 if none)", String(row.credit ?? 0)) ?? "";
    const debit = Number(nextDebit);
    const credit = Number(nextCredit);
    if (!Number.isFinite(debit) || debit < 0) return setError("Debit must be a valid number (>= 0).");
    if (!Number.isFinite(credit) || credit < 0) return setError("Credit must be a valid number (>= 0).");
    if (debit <= 0 && credit <= 0) return setError("Either debit or credit must be > 0.");

    setError(null);
    const res = await fetch("/api/admin/petty-gcash?action=edit-ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        date: nextDate.trim(),
        description: nextDesc.trim(),
        category: nextCat.trim() || undefined,
        debit,
        credit,
      }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Failed to edit SOA entry.");
      return;
    }
    await load();
  };

  const pending = useMemo(() => requests.filter((r) => r.status === "pending"), [requests]);
  const approvedCount = useMemo(() => requests.filter((r) => r.status === "approved").length, [requests]);
  const pendingCount = pending.length;

  const soa = useMemo(() => {
    const list = [...ledger].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    let b = 0;
    const withBal = list.map((t) => {
      b += (t.credit ?? 0) - (t.debit ?? 0);
      return { ...t, runningBalance: b };
    });
    // Display latest first
    return withBal.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [ledger]);

  const soaFiltered = useMemo(() => {
    const start = soaStart && soaEnd && soaStart > soaEnd ? soaEnd : soaStart;
    const end = soaStart && soaEnd && soaStart > soaEnd ? soaStart : soaEnd;
    const q = soaSearch.trim().toLowerCase();
    return soa.filter((t) => {
      if (start && t.date < start) return false;
      if (end && t.date > end) return false;
      if (q) {
        const hay = `${t.description ?? ""} ${t.category ?? ""} ${t.date ?? ""} ${t.kind ?? ""} ${t.debit ?? ""} ${t.credit ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [soa, soaStart, soaEnd, soaSearch]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(soaFiltered.length / rowsPerPage)),
    [soaFiltered.length, rowsPerPage],
  );

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [soaStart, soaEnd, soaSearch, rowsPerPage]);

  const soaVisible = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return soaFiltered.slice(start, start + rowsPerPage);
  }, [soaFiltered, page, rowsPerPage]);

  const dateRangeLabel = useMemo(() => {
    if (soaStart && soaEnd) {
      const a = soaStart <= soaEnd ? soaStart : soaEnd;
      const b = soaStart <= soaEnd ? soaEnd : soaStart;
      return a === b ? a : `${a} to ${b}`;
    }
    if (soaStart) return `from ${soaStart}`;
    if (soaEnd) return `until ${soaEnd}`;
    return "all dates";
  }, [soaStart, soaEnd]);

  const exportSoa = async () => {
    if (!soaFiltered.length) {
      setError("No SOA rows in the selected date range to export.");
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const { buildPettyGCashSoaWorkbookBuffer } = await import("@/lib/pettyGCashSoaExport");
      const buf = await buildPettyGCashSoaWorkbookBuffer(
        soaFiltered.map((t) => ({
          date: t.date,
          description: t.description,
          category: t.category,
          debit: t.debit ?? 0,
          credit: t.credit ?? 0,
          runningBalance: t.runningBalance,
        })),
        dateRangeLabel,
      );
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const start = soaStart || "all";
      const end = soaEnd || "all";
      a.download = `petty-gcash-soa-${start}-to-${end}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="admin-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="admin-title">Petty GCash</h1>
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
            <div className="text-sm font-semibold">Request</div>

            <PettyRequestFields
              sourceFund={SOURCE_FUND}
              requestType={requestType}
              onRequestTypeChange={setRequestTypeAndTarget}
              targetFund={targetFund}
              onTargetFundChange={setTargetFund}
              dateRequested={dateRequested}
              onDateRequestedChange={setDateRequested}
              description={description}
              onDescriptionChange={setDescription}
              amount={amount}
              onAmountChange={setAmount}
              availableBalance={availableBalance}
              currency={currency}
            />

            <button
              type="submit"
              className="rounded-xl bg-pink-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-500/20 hover:bg-pink-400"
            >
              Submit
            </button>
          </form>
        )}

        {role === "superadmin" && (
          <div className="mt-6 space-y-4">
            <div className="text-sm font-semibold">Superadmin Controls</div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs font-semibold text-zinc-400">Set petty GCash balance</div>
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
                          <div className="mt-1 text-xs text-zinc-300">{requestMetaLine(r)}</div>
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
                          Approve ({requestTypeApproveLabel(r)})
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

        <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-200">SOA</div>
              <div className="mt-1 text-xs text-zinc-500">Latest first • running balance per row</div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem] flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Search</div>
                <input
                  type="search"
                  value={soaSearch}
                  onChange={(e) => setSoaSearch(e.target.value)}
                  placeholder="Description, category…"
                  className="admin-input mt-1 w-full min-w-[12rem] py-1.5 text-xs"
                />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">From</div>
                <input
                  type="date"
                  value={soaStart}
                  onChange={(e) => setSoaStart(e.target.value)}
                  className="admin-input mt-1 py-1.5 text-xs"
                />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">To</div>
                <input
                  type="date"
                  value={soaEnd}
                  onChange={(e) => setSoaEnd(e.target.value)}
                  className="admin-input mt-1 py-1.5 text-xs"
                />
              </div>
              {(soaStart || soaEnd || soaSearch) && (
                <button
                  type="button"
                  className="admin-btn-secondary px-2 py-1.5 text-xs"
                  onClick={() => {
                    setSoaStart("");
                    setSoaEnd("");
                    setSoaSearch("");
                  }}
                >
                  Clear filters
                </button>
              )}
              <button
                type="button"
                disabled={exporting || loading || soaFiltered.length === 0}
                className="admin-btn-secondary px-3 py-1.5 text-xs"
                title="Export filtered SOA rows to Excel"
                onClick={() => void exportSoa()}
              >
                {exporting ? "Exporting…" : "Export Excel"}
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
            <div className="font-semibold tabular-nums">
              {soaFiltered.length} of {soa.length} entries
              {soaStart || soaEnd ? ` · ${dateRangeLabel}` : ""}
              {soaSearch.trim() ? ` · “${soaSearch.trim()}”` : ""}
            </div>
            <div className="flex items-center gap-2">
              <span>Rows</span>
              <select
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value) as 10 | 25 | 50)}
                className="admin-select py-1 text-xs"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span className="tabular-nums">
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="admin-btn-secondary px-2 py-1 text-xs disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="admin-btn-secondary px-2 py-1 text-xs disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>

          <div className="admin-table-wrap mt-3 overflow-x-auto">
            <table className="min-w-[860px] text-xs">
              <thead className="bg-black/30 text-zinc-300">
                <tr>
                  <th className="px-3 py-2 text-left whitespace-nowrap">Date</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Debit</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Credit</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Balance</th>
                  {canEdit ? <th className="px-3 py-2 text-right whitespace-nowrap">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {soaVisible.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-zinc-500" colSpan={canEdit ? 6 : 5}>
                      {soa.length === 0 ? "No SOA entries yet." : "No SOA entries in this date range."}
                    </td>
                  </tr>
                ) : (
                  soaVisible.map((t) => (
                    <tr key={t.id} className="bg-black/10 text-zinc-100">
                      <td className="px-3 py-2 whitespace-nowrap text-zinc-300">{t.date}</td>
                      <td className="px-3 py-2">{t.description}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-rose-300/90">{t.debit ? currency(t.debit) : ""}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-300/90">{t.credit ? currency(t.credit) : ""}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-200">
                        {currency(t.runningBalance).replace(".00", "")}
                      </td>
                      {canEdit ? (
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => void editLedger(t.id)}
                              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-white/10"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteLedger(t.id)}
                              className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-200 hover:bg-red-500/20"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="admin-card">
        <div className="text-sm font-semibold">All Requests</div>
        <div className="mt-1 text-xs text-zinc-300">Latest first</div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-3 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300/90">Approved</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-100">{approvedCount}</div>
          </div>
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-300/90">Pending</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-amber-100">{pendingCount}</div>
          </div>
        </div>

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

