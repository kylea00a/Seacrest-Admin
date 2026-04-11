import type { Metadata } from "next";
import RightDock from "./_components/RightDock";

export const metadata: Metadata = {
  title: "Seacrest Admin",
  description: "Departments, expenses, and recurring dues calendar",
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-zinc-950 text-zinc-100 selection:bg-emerald-500/25 selection:text-emerald-50">
      {/* Subtle mesh + depth */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(16,185,129,0.14),transparent_55%),radial-gradient(ellipse_80%_50%_at_100%_0%,rgba(34,197,94,0.08),transparent_50%),radial-gradient(ellipse_60%_40%_at_0%_100%,rgba(20,184,166,0.06),transparent_50%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[length:100%_24px] opacity-[0.25]"
      />
      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-sm font-bold text-emerald-200 shadow-inner shadow-emerald-900/30">
              S
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/90">
                Seacrest Admin
              </p>
              <p className="text-xs text-zinc-500">Finance &amp; sales workspace</p>
            </div>
          </div>
          <p className="max-w-md text-right text-xs leading-relaxed text-zinc-500">
            Open the <span className="text-zinc-400">menu</span> on the right to switch sections.
          </p>
        </header>
        <div className="animate-fade-in">{children}</div>
      </div>
      <RightDock />
    </div>
  );
}
