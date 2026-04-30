"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Stats = {
  now: string;
  uptimeSec: number;
  node: { rssMB: number; heapUsedMB: number; heapTotalMB: number; externalMB: number };
  os: {
    totalMB: number;
    freeMB: number;
    usedMB: number;
    load1: number;
    load5: number;
    load15: number;
    cpuCount: number;
    platform: string;
  };
};

function cx(...parts: Array<string | false | undefined | null>) {
  return parts.filter(Boolean).join(" ");
}

function fmtUptime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function ServerHealthWidget() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const lastOkAt = useRef<number>(0);

  useEffect(() => {
    let mounted = true;
    const ac = new AbortController();

    const poll = async () => {
      const t0 = performance.now();
      try {
        const res = await fetch("/api/admin/server-stats", { cache: "no-store", signal: ac.signal });
        const t1 = performance.now();
        setLatencyMs(Math.round(t1 - t0));
        const text = await res.text();
        const json = JSON.parse(text) as Stats & { error?: string };
        if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
        if (!mounted) return;
        setStats(json);
        setError(null);
        lastOkAt.current = Date.now();
        setStale(false);
      } catch (e) {
        if (!mounted) return;
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
      }
    };

    void poll();
    const id = window.setInterval(poll, 5000);
    const staleId = window.setInterval(() => {
      const last = lastOkAt.current;
      if (!last) return;
      setStale(Date.now() - last > 20000);
    }, 2000);

    return () => {
      mounted = false;
      ac.abort();
      window.clearInterval(id);
      window.clearInterval(staleId);
    };
  }, []);

  const derived = useMemo(() => {
    if (!stats) return null;
    const osUsedPct = stats.os.totalMB > 0 ? Math.round((stats.os.usedMB / stats.os.totalMB) * 100) : 0;
    const nodeRssPct = stats.os.totalMB > 0 ? Math.round((stats.node.rssMB / stats.os.totalMB) * 100) : 0;

    const warnMem = osUsedPct >= 90 || nodeRssPct >= 35;
    const warnLoad = stats.os.cpuCount > 0 ? stats.os.load1 >= stats.os.cpuCount * 1.25 : stats.os.load1 >= 2;
    const warnLatency = (latencyMs ?? 0) >= 1200;
    const ok =
      !stale &&
      !error &&
      !warnMem &&
      !warnLoad &&
      !warnLatency;

    const severity = ok ? "ok" : warnMem || warnLatency || stale ? "bad" : "warn";
    return { osUsedPct, nodeRssPct, warnMem, warnLoad, warnLatency, ok, severity };
  }, [stats, latencyMs, error, stale]);

  const severityClass =
    derived?.severity === "bad"
      ? "border-red-500/30 bg-red-500/[0.06]"
      : derived?.severity === "warn"
        ? "border-amber-500/30 bg-amber-500/[0.06]"
        : "border-emerald-500/25 bg-emerald-500/[0.05]";

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <div
        className={cx(
          "w-[220px] rounded-xl border p-2 shadow-[0_18px_60px_-24px_rgba(0,0,0,0.75)] backdrop-blur-xl",
          "ring-1 ring-white/[0.035]",
          severityClass,
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300/90">
              Server health
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-400/90">
              {stale ? (
                <span className="text-amber-200/90">Stale (no update)</span>
              ) : error ? (
                <span className="text-red-200">{error}</span>
              ) : stats ? (
                <span className="text-zinc-500">{new Date(stats.now).toLocaleTimeString()}</span>
              ) : (
                "Loading…"
              )}
            </div>
          </div>
          <div
            className={cx(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              derived?.severity === "bad"
                ? "bg-red-500/10 text-red-200 ring-1 ring-red-500/20"
                : derived?.severity === "warn"
                  ? "bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/20"
                  : "bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-500/20",
            )}
          >
            {derived?.severity === "bad" ? "Needs attention" : derived?.severity === "warn" ? "Watch" : "OK"}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
          <div className="rounded-lg border border-white/10 bg-black/10 p-1.5">
            <div className="text-[10px] font-semibold text-zinc-400/90">Latency</div>
            <div className={cx("mt-0.5 font-mono text-[11px]", derived?.warnLatency ? "text-red-200" : "text-zinc-100")}>
              {latencyMs != null ? `${latencyMs} ms` : "—"}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/10 p-1.5">
            <div className="text-[10px] font-semibold text-zinc-400/90">Uptime</div>
            <div className="mt-0.5 font-mono text-[11px] text-zinc-100">{stats ? fmtUptime(stats.uptimeSec) : "—"}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/10 p-1.5">
            <div className="text-[10px] font-semibold text-zinc-400/90">RAM (sys)</div>
            <div className={cx("mt-0.5 font-mono text-[11px]", derived?.warnMem ? "text-amber-200" : "text-zinc-100")}>
              {stats && derived ? `${derived.osUsedPct}%` : "—"}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/10 p-1.5">
            <div className="text-[10px] font-semibold text-zinc-400/90">RAM (app)</div>
            <div className="mt-0.5 font-mono text-[11px] text-zinc-100">
              {stats && derived ? `${stats.node.rssMB} MB (${derived.nodeRssPct}%)` : "—"}
            </div>
          </div>
        </div>

        <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-500/90">
          <div className={cx(derived?.warnLoad ? "text-amber-200" : "")}>
            Load: {stats ? `${stats.os.load1} / ${stats.os.cpuCount} CPU` : "—"}
          </div>
          <div className="truncate">
            {stats ? `${stats.os.platform}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

