import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { loadDepartments, saveDepartments } from "@/data/admin/storage";
import type { Department } from "@/data/admin/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const departments = loadDepartments();
  return NextResponse.json({ departments });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { name?: unknown };

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Missing or invalid `name`." }, { status: 400 });
  }

  const departments: Department[] = loadDepartments();
  const now = new Date().toISOString();
  const next: Department = {
    id: randomUUID(),
    name,
    createdAt: now,
  };

  departments.push(next);
  saveDepartments(departments);

  return NextResponse.json({ department: next });
}

