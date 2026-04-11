import type { Metadata } from "next";
import AdminShell from "./AdminShell";
import { AdminSessionProvider } from "./AdminSessionContext";

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
    <AdminSessionProvider>
      <AdminShell>{children}</AdminShell>
    </AdminSessionProvider>
  );
}
