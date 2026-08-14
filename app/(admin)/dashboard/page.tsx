"use client";
// app/(admin)/dashboard/page.tsx — ภาพรวมระบบ
import Link from "next/link";
import { collection, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useCollection } from "@/lib/hooks";
import { PageHeader, Card, Spinner } from "@/components/ui";
import type { BookingDoc, EquipmentDoc, UserDoc, TaskDoc } from "@/lib/types";

function Stat({ icon, label, value, href, accent }: { icon: string; label: string; value: number; href: string; accent: string }) {
  return (
    <Link href={href}>
      <Card className="transition hover:border-primary/40 hover:shadow-[0_12px_28px_rgba(181,31,70,0.12)]">
        <div className="flex items-center gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xl ${accent}`}>{icon}</div>
          <div>
            <p className="text-2xl font-bold text-slate-100">{value}</p>
            <p className="text-xs text-slate-400">{label}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const { data: bookings, loading: l1 } = useCollection<BookingDoc>(() => query(collection(db, "bookings"), orderBy("createdAt", "desc")), []);
  const { data: equipments, loading: l2 } = useCollection<EquipmentDoc>(() => collection(db, "equipments"), []);
  const { data: users, loading: l3 } = useCollection<UserDoc>(() => collection(db, "users"), []);
  const { data: tasks, loading: l4 } = useCollection<TaskDoc>(() => collection(db, "tasks"), []);

  if (l1 || l2 || l3 || l4) return <Spinner />;

  const pendingBookings = bookings.filter((b) => b.status === "pending").length;
  const pendingReturns = bookings.filter((b) => b.status === "pending_return").length;
  const availableEq = equipments.filter((e) => e.status === "available").length;
  const pendingTasks = tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").length;

  return (
    <div>
      <PageHeader title="แดชบอร์ด" subtitle="ภาพรวมระบบ IE-Photo" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat icon="⏳" label="รออนุมัติ" value={pendingBookings} href="/bookings" accent="border border-amber-200 bg-amber-50 text-amber-800" />
        <Stat icon="📸" label="รอตรวจคืน" value={pendingReturns} href="/bookings" accent="border border-purple-200 bg-purple-50 text-purple-800" />
        <Stat icon="📦" label="อุปกรณ์พร้อมใช้" value={availableEq} href="/inventory" accent="border border-emerald-200 bg-emerald-50 text-emerald-800" />
        <Stat icon="🗂️" label="การจองทั้งหมด" value={bookings.length} href="/bookings" accent="border border-blue-200 bg-blue-50 text-blue-800" />
        <Stat icon="👥" label="สมาชิก" value={users.length} href="/users" accent="border border-border bg-muted text-foreground" />
        <Stat icon="📋" label="งานค้าง" value={pendingTasks} href="/tasks" accent="border border-orange-200 bg-orange-50 text-orange-800" />
      </div>
    </div>
  );
}
