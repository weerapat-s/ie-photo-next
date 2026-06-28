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
      <Card className="transition hover:shadow-md">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl ${accent}`}>{icon}</div>
          <div>
            <p className="text-2xl font-semibold">{value}</p>
            <p className="text-xs text-neutral-500">{label}</p>
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
        <Stat icon="⏳" label="รออนุมัติ" value={pendingBookings} href="/bookings" accent="bg-amber-100" />
        <Stat icon="📸" label="รอตรวจคืน" value={pendingReturns} href="/bookings" accent="bg-purple-100" />
        <Stat icon="📦" label="อุปกรณ์พร้อมใช้" value={availableEq} href="/inventory" accent="bg-green-100" />
        <Stat icon="🗂️" label="การจองทั้งหมด" value={bookings.length} href="/bookings" accent="bg-blue-100" />
        <Stat icon="👥" label="สมาชิก" value={users.length} href="/users" accent="bg-neutral-100" />
        <Stat icon="📋" label="งานค้าง" value={pendingTasks} href="/tasks" accent="bg-orange-100" />
      </div>
    </div>
  );
}
