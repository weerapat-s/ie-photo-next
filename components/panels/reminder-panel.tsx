"use client";
// components/panels/reminder-panel.tsx — "มีอะไรใกล้ถึงกำหนดบ้าง"
//
// รวมทุกอย่างที่มีเส้นตายไว้ที่เดียว เรียงตามความด่วน:
// ของที่ยืมใกล้ครบกำหนด · งานถ่ายที่ใกล้ถึง · งานย่อย · ไฟล์งาน
//
// scope="all"  → กรรมการเห็นของทั้งชุมนุม (พร้อมชื่อคนที่ต้องรับผิดชอบ)
// scope="mine" → สมาชิกเห็นเฉพาะที่เกี่ยวกับตัวเอง
//
// เจตนา: ให้เห็นก่อนที่จะสาย ไม่ใช่รู้ตอนของหายหรืองานเลยกำหนดไปแล้ว
import { useMemo } from "react";
import Link from "next/link";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection, useNow } from "@/lib/hooks";
import { isAdminRole, displayName } from "@/lib/roles";
import { fmtDateTime } from "@/lib/format";
import { allReminders, describeLeft, type Reminder, type ReminderKind } from "@/lib/reminders";
import { Badge, EmptyState, Spinner } from "@/components/ui";
import Icon, { type IconName } from "@/components/icon";
import type { BookingDoc, DeliveryDoc, TaskDoc, UserDoc } from "@/lib/types";

const KIND: Record<ReminderKind, { icon: IconName; label: string; href: string }> = {
  borrow_due_soon: { icon: "equipment", label: "ใกล้ครบกำหนดคืน", href: "/my" },
  borrow_overdue: { icon: "overdue", label: "เลยกำหนดคืนแล้ว", href: "/my" },
  job_soon: { icon: "photographer", label: "งานถ่ายใกล้ถึง", href: "/calendar" },
  task_due_soon: { icon: "task", label: "งานย่อยใกล้กำหนดส่ง", href: "/my" },
  delivery_due: { icon: "delivery", label: "ไฟล์งานใกล้กำหนดส่ง", href: "/my" },
};

export default function ReminderPanel({ scope = "mine" }: { scope?: "all" | "mine" }) {
  const { user, role } = useAuth();
  const isAdmin = isAdminRole(role);
  const now = useNow(60_000);
  const all = scope === "all" && isAdmin;

  const { data: bookings, loading } = useCollection<BookingDoc>(
    () =>
      all
        ? collection(db, "bookings")
        : user
          ? query(collection(db, "bookings"), where("userId", "==", user.uid))
          : null,
    [all, user?.uid]
  );
  const { data: tasks } = useCollection<TaskDoc>(
    () =>
      all
        ? collection(db, "tasks")
        : user
          ? query(collection(db, "tasks"), where("assignedToId", "==", user.uid))
          : null,
    [all, user?.uid]
  );
  const { data: deliveries } = useCollection<DeliveryDoc>(
    () => (user ? collection(db, "deliveries") : null),
    [user?.uid]
  );
  const { data: users } = useCollection<UserDoc>(() => (all ? collection(db, "users") : null), [all]);

  const nameOf = useMemo(() => new Map(users.map((u) => [u.id, displayName(u)])), [users]);

  const items = useMemo(() => {
    const list = allReminders({ bookings, tasks, deliveries, now });
    // มุมมองส่วนตัว: เอาเฉพาะที่ตัวเองเกี่ยวข้อง
    // (งานถ่าย/ไฟล์งานมาจากคอลเลกชันรวม จึงต้องกรองอีกชั้น)
    return all ? list : list.filter((r) => !!user && r.userIds.includes(user.uid));
  }, [bookings, tasks, deliveries, now, all, user]);

  if (loading) return <Spinner label="กำลังตรวจกำหนดเวลา…" />;

  if (items.length === 0) {
    return (
      <EmptyState
        icon="success"
        text={all ? "ไม่มีอะไรใกล้ถึงกำหนดในตอนนี้" : "คุณไม่มีอะไรค้างกำหนด"}
      />
    );
  }

  return (
    <ul className="surface-flat divide-y divide-[var(--hairline)] overflow-hidden rounded-3xl">
      {items.map((r) => (
        <ReminderRow key={`${r.kind}:${r.refId}`} r={r} showWho={all} nameOf={nameOf} />
      ))}
    </ul>
  );
}

function ReminderRow({
  r,
  showWho,
  nameOf,
}: {
  r: Reminder;
  showWho: boolean;
  nameOf: Map<string, string>;
}) {
  const meta = KIND[r.kind];
  const late = r.hoursLeft < 0;
  // เหลือไม่ถึง 6 ชั่วโมงถือว่าด่วนแล้ว ต้องเด้งออกมาให้เห็นเท่ากับที่เลยกำหนด
  const urgent = !late && r.hoursLeft <= 6;

  return (
    <li className="flex items-start gap-3 p-4">
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
          late ? "tone-bad" : urgent ? "tone-warn" : "tone-mute"
        }`}
      >
        <Icon name={meta.icon} size={20} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="t-caption font-semibold">{meta.label}</p>
        <p className="t-heading truncate text-[var(--ink)]">{r.title}</p>
        <p className="t-caption mt-0.5">
          กำหนด {fmtDateTime({ toMillis: () => r.dueMs } as never)}
        </p>
        {showWho && r.userIds.length > 0 && (
          <p className="t-caption mt-0.5 flex items-center gap-1.5">
            <Icon name="user" size={16} />
            {r.userIds.map((u) => nameOf.get(u) ?? "ไม่ทราบชื่อ").join(", ")}
          </p>
        )}
        {r.location && (
          <p className="t-caption mt-0.5 flex items-center gap-1.5">
            <Icon name="studio" size={16} /> {r.location}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Badge className={late ? "tone-bad" : urgent ? "tone-warn" : "tone-ok"}>
          {describeLeft(r.hoursLeft)}
        </Badge>
        <Link
          href={meta.href}
          className="t-caption font-semibold text-[var(--faculty)] underline-offset-2 hover:underline"
        >
          จัดการ →
        </Link>
      </div>
    </li>
  );
}
