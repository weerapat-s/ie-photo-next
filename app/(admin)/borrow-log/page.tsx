"use client";
// app/(admin)/borrow-log/page.tsx — ทะเบียนการยืมอุปกรณ์ (สำหรับกรรมการชุมนุม)
//
// ตอบ 4 คำถามที่กรรมการถามบ่อยสุด ในหน้าเดียว:
//   ตอนนี้ของอยู่กับใคร · ยืมไปกี่วันแล้ว · เอาไปทำอะไร · ใครถือค้างเยอะ
//
// ต่างจากแท็บ "ถูกยืมอยู่" ใน /resources ตรงที่หน้านั้นเน้นทวงของคืนทีละชิ้น
// ส่วนหน้านี้เป็นมุมมองภาพรวม + ประวัติย้อนหลัง ไว้ดูว่าใครใช้ของบ่อยแค่ไหน
import { useMemo, useState } from "react";
import { collection, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useCollection, useNow } from "@/lib/hooks";
import { PageHeader, Card, Badge, Spinner, EmptyState, ChipBar } from "@/components/ui";
import { fmtDateTime, fmtRange } from "@/lib/format";
import { displayName } from "@/lib/roles";
import type { BookingDoc, UserDoc, WithId } from "@/lib/types";

type Tab = "out" | "history" | "people";

const DAY = 86_400_000;

/** ยืมมาแล้วกี่วัน (นับจากวันรับของจริง ถ้ามี ไม่งั้นนับจากวันเริ่ม) */
function daysHeld(b: BookingDoc, now: number) {
  const from = (b.pickedUpAt ?? b.startAt).toMillis();
  return Math.max(0, Math.floor((now - from) / DAY));
}
/** ขอยืมไว้กี่วัน */
function daysBooked(b: BookingDoc) {
  return Math.max(1, Math.ceil((b.endAt.toMillis() - b.startAt.toMillis()) / DAY));
}
/** เลยกำหนดกี่วัน (0 = ยังไม่เลย) */
function daysOverdue(b: BookingDoc, now: number) {
  return Math.max(0, Math.floor((now - b.endAt.toMillis()) / DAY));
}

export default function BorrowLogPage() {
  const now = useNow(60_000);
  const [tab, setTab] = useState<Tab>("out");

  // เฉพาะการยืมอุปกรณ์ — สตูดิโอ/งานตากล้องมีหน้าของตัวเองอยู่แล้ว
  const { data: bookings, loading, error } = useCollection<BookingDoc>(
    () =>
      query(
        collection(db, "bookings"),
        where("bookingType", "==", "equipment"),
        orderBy("createdAt", "desc")
      ),
    []
  );
  const { data: users } = useCollection<UserDoc>(() => collection(db, "users"), []);

  const nameOf = useMemo(() => {
    const map = new Map(users.map((u) => [u.id, u]));
    return (b: WithId<BookingDoc>) => {
      const u = b.userId ? map.get(b.userId) : null;
      return u ? displayName(u) : b.userName || "ไม่ระบุชื่อ";
    };
  }, [users]);

  /** ยังไม่กลับเข้าคลัง */
  const out = useMemo(
    () => bookings.filter((b) => b.status === "approved" || b.status === "pending_return"),
    [bookings]
  );
  /** ปิดรายการไปแล้ว */
  const history = useMemo(() => bookings.filter((b) => b.status === "returned"), [bookings]);

  /** สรุปรายคน — ถือกี่ชิ้น เคยยืมกี่ครั้ง ค้างเลยกำหนดไหม */
  const people = useMemo(() => {
    if (now === null) return [];
    const acc = new Map<string, { name: string; holding: number; total: number; overdue: number }>();
    for (const b of bookings) {
      const key = b.userId || b.userName || "unknown";
      const row = acc.get(key) || { name: nameOf(b), holding: 0, total: 0, overdue: 0 };
      row.total += 1;
      if (b.status === "approved" || b.status === "pending_return") {
        row.holding += 1;
        if (daysOverdue(b, now) > 0) row.overdue += 1;
      }
      acc.set(key, row);
    }
    return [...acc.values()].sort((a, z) => z.holding - a.holding || z.total - a.total);
  }, [bookings, nameOf, now]);

  const overdueCount = useMemo(
    () => (now === null ? 0 : out.filter((b) => daysOverdue(b, now) > 0).length),
    [out, now]
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="กรรมการ"
        title="ทะเบียนการยืม"
        subtitle="ใครยืมอะไรไป กี่วัน เอาไปทำอะไร"
      />

      {overdueCount > 0 && (
        <Card className="mb-4 border-red-300">
          <p className="text-sm font-semibold text-red-700">
            เลยกำหนดคืน {overdueCount} รายการ
          </p>
          <p className="mt-0.5 text-sm text-[var(--muted-ink)]">
            ดูรายการที่ขึ้นป้ายแดงในแท็บ &quot;ถืออยู่ตอนนี้&quot;
          </p>
        </Card>
      )}

      <ChipBar
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { key: "out", label: "ถืออยู่ตอนนี้", count: out.length },
          { key: "history", label: "คืนแล้ว", count: history.length },
          { key: "people", label: "รายคน", count: people.length },
        ]}
      />

      {loading || now === null ? (
        <Spinner />
      ) : error ? (
        <EmptyState icon="warning" text="โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้า" />
      ) : tab === "people" ? (
        people.length === 0 ? (
          <EmptyState text="ยังไม่มีประวัติการยืม" />
        ) : (
          <div className="space-y-2">
            {people.map((p) => (
              <Card key={p.name} className="flex flex-wrap items-center gap-3">
                <span className="font-medium text-foreground">{p.name}</span>
                {p.holding > 0 && (
                  <Badge className="bg-blue-100 text-blue-700">ถืออยู่ {p.holding}</Badge>
                )}
                {p.overdue > 0 && (
                  <Badge className="bg-red-100 text-red-700">เลยกำหนด {p.overdue}</Badge>
                )}
                <span className="ml-auto text-sm text-[var(--muted-ink)]">
                  ยืมทั้งหมด {p.total} ครั้ง
                </span>
              </Card>
            ))}
          </div>
        )
      ) : (tab === "out" ? out : history).length === 0 ? (
        <EmptyState text={tab === "out" ? "ตอนนี้ไม่มีของอยู่ข้างนอก" : "ยังไม่มีรายการที่คืนแล้ว"} />
      ) : (
        <div className="space-y-3">
          {(tab === "out" ? out : history).map((b) => {
            const late = tab === "out" ? daysOverdue(b, now) : 0;
            return (
              <Card key={b.id} className={late > 0 ? "border-red-300" : ""}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{b.itemName}</span>
                      {tab === "out" && !b.pickedUpAt && (
                        <Badge className="bg-amber-100 text-amber-700">ยังไม่มารับ</Badge>
                      )}
                      {late > 0 && (
                        <Badge className="bg-red-100 text-red-700">เลยกำหนด {late} วัน</Badge>
                      )}
                    </div>

                    <p className="mt-1 text-sm text-[var(--muted-ink)]">
                      {nameOf(b)}
                      {b.userPhone ? ` · ${b.userPhone}` : ""}
                    </p>

                    <p className="mt-0.5 text-sm text-[var(--muted-ink)]">
                      {tab === "out"
                        ? `ยืมไปแล้ว ${daysHeld(b, now)} วัน · ขอไว้ ${daysBooked(b)} วัน · กำหนดคืน ${fmtDateTime(b.endAt)}`
                        : `${fmtRange(b.startAt, b.endAt)} · ${daysBooked(b)} วัน`}
                    </p>

                    {b.usageReason && (
                      <p className="mt-1 text-sm text-foreground">เพื่อ {b.usageReason}</p>
                    )}
                    {b.usageType && (
                      <p className="text-sm text-[var(--muted-ink)]">{b.usageType}</p>
                    )}
                    {b.approvedByName && (
                      <p className="mt-1 text-xs text-[var(--muted-ink)]">
                        อนุมัติโดย {b.approvedByName}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
