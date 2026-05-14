"use client";

import { useEffect, useState } from "react";
import type { TelegramBotConfig, TelegramNotificationKind } from "@/data/admin/types";

type BotDraft = TelegramBotConfig & {
  hasToken?: boolean;
  maskedToken?: string;
};

type SettingsResponse = {
  settings?: { bots?: BotDraft[]; updatedAt?: string };
  error?: string;
};

const SEND_OPTIONS: Array<{ key: TelegramNotificationKind; label: string }> = [
  { key: "calendarReminders", label: "Calendar reminders" },
  { key: "calendarExpenses", label: "Calendar expenses" },
];

function emptyBot(): BotDraft {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: "Telegram Bot",
    token: "",
    enabled: true,
    recipients: [],
    schedules: [],
    sendKinds: { calendarReminders: true, calendarExpenses: true },
    createdAt: now,
    updatedAt: now,
  };
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Bad response (${res.status})`);
  }
}

export default function TelegramNotificationsPage() {
  const [bots, setBots] = useState<BotDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/telegram/settings", { cache: "no-store" });
      const json = await readJson<SettingsResponse>(res);
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setBots(json.settings?.bots ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updateBot = (id: string, patch: Partial<BotDraft>) => {
    setBots((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/telegram/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bots }),
      });
      const json = await readJson<SettingsResponse & { ok?: boolean }>(res);
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setBots(json.settings?.bots ?? []);
      setNotice("Telegram notification settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-card max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="admin-title">Telegram Notifications</h1>
          <p className="admin-muted mt-1 max-w-3xl">
            Add Telegram bots, chat IDs, send checklist, and Manila-time schedules. Bot tokens are saved server-side and are
            not shown again after saving.
          </p>
        </div>
        <button type="button" onClick={() => setBots((p) => [...p, emptyBot()])} className="admin-btn-primary">
          Add bot
        </button>
      </div>

      {loading ? <div className="mt-4 text-sm text-zinc-300">Loading…</div> : null}
      {error ? <div className="admin-alert-error mt-4">{error}</div> : null}
      {notice ? (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {bots.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-300">
            No Telegram bots yet. Click Add bot to create one.
          </div>
        ) : null}

        {bots.map((bot) => (
          <div key={bot.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                <label className="text-xs text-zinc-400">
                  Bot name
                  <input
                    value={bot.name}
                    onChange={(e) => updateBot(bot.id, { name: e.target.value })}
                    className="admin-input mt-1 w-full"
                  />
                </label>
                <label className="text-xs text-zinc-400">
                  Bot token {bot.hasToken ? <span className="text-zinc-500">({bot.maskedToken})</span> : null}
                  <input
                    value={bot.token}
                    onChange={(e) => updateBot(bot.id, { token: e.target.value })}
                    className="admin-input mt-1 w-full"
                    placeholder={bot.hasToken ? "Leave blank to keep saved token" : "Paste BotFather token"}
                  />
                </label>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                  <input
                    type="checkbox"
                    checked={bot.enabled}
                    onChange={(e) => updateBot(bot.id, { enabled: e.target.checked })}
                    className="rounded border-white/20 bg-black/30"
                  />
                  Enabled
                </label>
                <button
                  type="button"
                  onClick={() => setBots((prev) => prev.filter((b) => b.id !== bot.id))}
                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/20"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div>
                <div className="text-xs font-semibold text-zinc-200">What to send</div>
                <div className="mt-2 space-y-2">
                  {SEND_OPTIONS.map((opt) => (
                    <label key={opt.key} className="flex items-center gap-2 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={bot.sendKinds[opt.key]}
                        onChange={(e) =>
                          updateBot(bot.id, {
                            sendKinds: { ...bot.sendKinds, [opt.key]: e.target.checked },
                          })
                        }
                        className="rounded border-white/20 bg-black/30"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-zinc-200">Send to accounts / chats</div>
                  <button
                    type="button"
                    onClick={() =>
                      updateBot(bot.id, {
                        recipients: [
                          ...bot.recipients,
                          { id: crypto.randomUUID(), label: "", chatId: "", enabled: true },
                        ],
                      })
                    }
                    className="admin-btn-secondary px-2 py-1 text-[11px]"
                  >
                    Add chat
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {bot.recipients.map((r) => (
                    <div key={r.id} className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2">
                      <div className="flex items-center gap-2">
                        <input
                          value={r.label}
                          onChange={(e) =>
                            updateBot(bot.id, {
                              recipients: bot.recipients.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)),
                            })
                          }
                          className="admin-input min-w-0 flex-1 py-1 text-xs"
                          placeholder="Name (e.g. Jay)"
                        />
                        <label className="flex items-center gap-1 text-[11px] text-zinc-400">
                          <input
                            type="checkbox"
                            checked={r.enabled}
                            onChange={(e) =>
                              updateBot(bot.id, {
                                recipients: bot.recipients.map((x) => (x.id === r.id ? { ...x, enabled: e.target.checked } : x)),
                              })
                            }
                          />
                          Send
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          value={r.chatId}
                          onChange={(e) =>
                            updateBot(bot.id, {
                              recipients: bot.recipients.map((x) => (x.id === r.id ? { ...x, chatId: e.target.value } : x)),
                            })
                          }
                          className="admin-input min-w-0 flex-1 py-1 font-mono text-xs"
                          placeholder="Telegram chat ID"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateBot(bot.id, { recipients: bot.recipients.filter((x) => x.id !== r.id) })
                          }
                          className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-200"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  {bot.recipients.length === 0 ? <div className="text-xs text-zinc-500">No chats added.</div> : null}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-zinc-200">Schedule (Asia/Manila)</div>
                  <button
                    type="button"
                    onClick={() =>
                      updateBot(bot.id, {
                        schedules: [...bot.schedules, { id: crypto.randomUUID(), time: "10:00", enabled: true }],
                      })
                    }
                    className="admin-btn-secondary px-2 py-1 text-[11px]"
                  >
                    Add time
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {bot.schedules.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2">
                      <input
                        type="time"
                        value={s.time}
                        onChange={(e) =>
                          updateBot(bot.id, {
                            schedules: bot.schedules.map((x) => (x.id === s.id ? { ...x, time: e.target.value } : x)),
                          })
                        }
                        className="admin-input py-1 text-xs"
                      />
                      <label className="flex items-center gap-1 text-[11px] text-zinc-400">
                        <input
                          type="checkbox"
                          checked={s.enabled}
                          onChange={(e) =>
                            updateBot(bot.id, {
                              schedules: bot.schedules.map((x) => (x.id === s.id ? { ...x, enabled: e.target.checked } : x)),
                            })
                          }
                        />
                        On
                      </label>
                      <button
                        type="button"
                        onClick={() => updateBot(bot.id, { schedules: bot.schedules.filter((x) => x.id !== s.id) })}
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-200"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {bot.schedules.length === 0 ? <div className="text-xs text-zinc-500">No send times added.</div> : null}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" onClick={() => void load()} disabled={saving} className="admin-btn-secondary">
          Reload
        </button>
        <button type="button" onClick={() => void save()} disabled={saving} className="admin-btn-primary">
          {saving ? "Saving…" : "Save Telegram Settings"}
        </button>
      </div>
    </div>
  );
}

