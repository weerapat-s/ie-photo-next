"use client";
// app/(member)/calendar/page.tsx — ตารางการจอง (agenda view อ่านจาก slots สาธารณะ)
import { collection, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useCollection } from "@/lib/hooks";
import { PageHeader, Card, Badge, Spinner, EmptyState } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { SlotDoc, WithId } from "@/lib/types";

const SLOT_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "รอดำเนินการ", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "อนุมัติแล้ว", cls: "bg-green-100 text-green-700" },
};

export default function CalendarPage() {
  // อ่านจาก slots collection (ไม่มีข้อมูลส่วนตัว อ่านได้ทุกคน)
  // query แค่ orderBy("startAt") — ไม่ใส่ where("endAt", ">", ...) ใน query เพื่อหลีกเลี่ยง inequality index restriction
  const { data: slots, loading, error } = useCollection<SlotDoc>(
    () => query(collection(db, "slots"), orderBy("startAt")),
    []
  );

  // client filter: กรองรายการที่ endAt > Date.now()
  const now = Date.now();
  const upcoming = slots.filter((s) => s.endAt.toMillis() > now);

  // group ตามวัน
  const groups: Record<string, WithId<SlotDoc>[]> = {};
  for (const s of upcoming) {
    const key = fmtDate(s.startAt);
    (groups[key] ||= []).push(s);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="ปฏิทินการจอง" subtitle="ตารางการใช้อุปกรณ์และสตูดิโอ" />

      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState icon="⚠️" text="โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้า" />
      ) : upcoming.length === 0 ? (
        <EmptyState icon="📅" text="ยังไม่มีการจองที่กำลังจะมาถึง" />
      ) : (
        <div className="space-y-5">
          {Object.entries(groups).map(([day, items]) => (
            <div key={day}>
              <h3 className="mb-2 text-sm font-semibold text-slate-400">{day}</h3>
              <div className="space-y-2">
                {items.map((s) => {
                  const badge = SLOT_STATUS_BADGE[s.status] ?? SLOT_STATUS_BADGE.pending;
                  return (
                    <Card key={s.id} className="p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span>{s.bookingType === "studio" ? "🎬" : "📷"}</span>
                          <div>
                            <p className="text-sm font-medium text-slate-100">{s.itemName}</p>
                            <p className="text-xs text-slate-400">
                              {fmtDateTime(s.startAt)} → {fmtDateTime(s.endAt)}
                            </p>
                          </div>
                        </div>
                        <Badge className={badge.cls}>{badge.label}</Badge>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
