"use client";
// app/(member)/calendar/page.tsx — ตารางการจอง (agenda view)
import { collection, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useCollection } from "@/lib/hooks";
import { PageHeader, Card, Badge, Spinner, EmptyState } from "@/components/ui";
import { fmtDate, fmtDateTime, BOOKING_STATUS } from "@/lib/format";
import type { BookingDoc, WithId } from "@/lib/types";

export default function CalendarPage() {
  // แสดงเฉพาะ pending/approved (ตารางจริงที่ใช้ห้อง/อุปกรณ์)
  const { data: bookings, loading } = useCollection<BookingDoc>(
    () => query(collection(db, "bookings"), where("status", "in", ["pending", "approved"]), orderBy("startAt")),
    []
  );

  // group ตามวัน
  const groups: Record<string, WithId<BookingDoc>[]> = {};
  for (const b of bookings) {
    const key = fmtDate(b.startAt);
    (groups[key] ||= []).push(b);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="ปฏิทินการจอง" subtitle="ตารางการใช้อุปกรณ์และสตูดิโอ" />

      {loading ? (
        <Spinner />
      ) : bookings.length === 0 ? (
        <EmptyState icon="📅" text="ยังไม่มีการจองที่กำลังจะมาถึง" />
      ) : (
        <div className="space-y-5">
          {Object.entries(groups).map(([day, items]) => (
            <div key={day}>
              <h3 className="mb-2 text-sm font-semibold text-neutral-500">{day}</h3>
              <div className="space-y-2">
                {items.map((b) => (
                  <Card key={b.id} className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span>{b.bookingType === "studio" ? "🎬" : "📷"}</span>
                        <div>
                          <p className="text-sm font-medium">{b.itemName}</p>
                          <p className="text-xs text-neutral-500">
                            {fmtDateTime(b.startAt)} → {fmtDateTime(b.endAt)}
                          </p>
                        </div>
                      </div>
                      <Badge className={BOOKING_STATUS[b.status].cls}>{BOOKING_STATUS[b.status].label}</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
