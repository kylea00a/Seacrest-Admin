"use client";

import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold text-white">Access denied</h1>
      <p className="max-w-md text-sm text-zinc-400">
        You do not have permission to open this section. Ask a superadmin to update your account access.
      </p>
      <Link
        href="/admin/calendar"
        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
      >
        Go to calendar
      </Link>
    </div>
  );
}
