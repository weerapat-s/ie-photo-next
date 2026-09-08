"use client";
// app/(member)/calendar/page.tsx — ปฏิทินงาน
//
// รวม 3 ชั้นข้อมูลไว้ในมุมมองเดียว:
//   1. slots     — ตารางจองสาธารณะ (ไม่มีข้อมูลส่วนตัว ทุกคนอ่านได้)
//   2. bookings  — งานที่ "เรามองเห็น" เท่านั้น ใช้เติมว่าใครถูกมอบหมาย
//   3. availability — วันที่ตัวเองกันไว้ว่าไม่ว่าง
// สิ่งที่มองไม่เห็นก็แค่ไม่มีรายละเอียดเพิ่ม ไม่ทำให้ปฏิทินพัง
import { useMemo, useState } from "react";
import { collection, query, orderBy, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection, useNow } from "@/lib/hooks";
import { PageHeader, Badge, Spinner, EmptyState, ChipBar } from "@/components/ui";
import Icon from "@/components/icon";
import { fmtDate, fmtTime, BOOKING_TYPE_ICON, BOOKING_TYPE_LABEL } from "@/lib/format";
import { dateKey, shortDay } from "@/lib/availability";
import { isAdminRole } from "@/lib/roles";
import type { AvailabilityDoc, BookingDoc, BookingType, SlotDoc, UserDoc, WithId } from "@/lib/types";

type Filter = "all" | "mine" | BookingType;

const SLOT_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "รอยืนยัน", cls: "tone-warn" },
  approved: { label: "ยืนยันแล้ว", cls: "tone-ok" },
};

export default function CalendarPage() {
  const { user, role } = useAuth();
  const isAdmin = isAdminRole(role);
  const now = useNow(60_000);

  // ตารางสาธารณะ — ไม่ใส่ where("endAt",">") เพื่อเลี่ยงข้อจำกัด inequality index
  const { data: slots, loading, error } = useCollection<SlotDoc>(
    () => query(collection(db, "slots"), orderBy("startAt")),
    []
  );

  // งานที่เรามองเห็น: แอดมินเห็นหมด · ทีมงานเห็นงานถ่ายที่อนุมัติแล้ว · สมาชิกเห็นของตัวเอง
  const { data: visibleBookings } = useCollection<BookingDoc>(
    () =>
      isAdmin
        ? query(collection(db, "bookings"), orderBy("createdAt", "desc"))
        : user
          ? query(collection(db, "bookings"), where("userId", "==", user.uid))
          : null,
    [isAdmin, user?.uid]
  );

  // งานถ่ายที่อนุมัติแล้ว — ทีมงานอ่านได้ตาม rules ถ้าไม่ใช่ทีมงานจะ error เงียบ ๆ
  const { data: crewJobs } = useCollection<BookingDoc>(
    () =>
      !isAdmin && user
        ? query(
            collection(db, "bookings"),
            where("bookingType", "==", "photographer"),
            where("status", "==", "approved")
          )
        : null,
    [isAdmin, user?.uid]
  );

  const { data: users } = useCollection<UserDoc>(() => (isAdmin ? collection(db, "users") : null), [isAdmin]);

  const { data: availability } = useCollection<AvailabilityDoc>(
    () => (user ? collection(db, "availability") : null),
    [user?.uid]
  );

  const [filter, setFilter] = useState<Filter>("all");

  /** bookingId → booking (เท่าที่เรามีสิทธิ์อ่าน) */
  const bookingOf = useMemo(() => {
    const m = new Map<string, WithId<BookingDoc>>();
    for (const b of [...visibleBookings, ...crewJobs]) m.set(b.id, b);
    return m;
  }, [visibleBookings, crewJobs]);

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) m.set(u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.studentId);
    return m;
  }, [users]);

  /** วันที่ตัวเองกันไว้ว่าไม่ว่าง */
  const myBusy = useMemo(() => {
    const doc = availability.find((a) => a.id === user?.uid);
    return new Set(doc?.busyDates ?? []);
  }, [availability, user?.uid]);

  const upcoming = useMemo(() => slots.filter((s) => s.endAt.toMillis() > now), [slots, now]);

  const isMine = (s: WithId<SlotDoc>) => {
    const b = bookingOf.get(s.bookingId);
    if (!b || !user) return false;
    return b.userId === user.uid || (b.assigneeIds ?? []).includes(user.uid);
  };

  const shown = useMemo(() => {
    if (filter === "mine") return upcoming.filter(isMine);
    if (filter === "all") return upcoming;
    return upcoming.filter((s) => s.bookingType === filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcoming, filter, bookingOf, user?.uid]);

  const groups = useMemo(() => {
    const g: Record<string, WithId<SlotDoc>[]> = {};
    for (const s of shown) (g[dateKey(s.startAt.toMillis())] ||= []).push(s);
    return g;
  }, [shown]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="ตาราง"
        title="ปฏิทินงาน"
        subtitle="ช่วงเวลาที่จองไว้ · ใครรับผิดชอบงานไหน · วันที่คุณกันไว้"
      />

      <ChipBar
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={[
          { key: "all", label: "ทั้งหมด", count: upcoming.length },
          { key: "mine", label: "ของฉัน", icon: "user", count: upcoming.filter(isMine).length },
          { key: "equipment", label: "อุปกรณ์", icon: "equipment", count: upcoming.filter((s) => s.bookingType === "equipment").length },
          { key: "studio", label: "สตูดิโอ", icon: "studio", count: upcoming.filter((s) => s.bookingType === "studio").length },
          { key: "photographer", label: "ตากล้อง", icon: "photographer", count: upcoming.filter((s) => s.bookingType === "photographer").length },
        ]}
      />

      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState icon="warning" text="โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้า" />
      ) : shown.length === 0 ? (
        <EmptyState icon="calendar" text="ยังไม่มีงานที่กำลังจะมาถึงในหมวดนี้" />
      ) : (
        <div className="space-y-6">
          {Object.entries(groups).map(([day, items], gi) => {
            const busyDay = myBusy.has(day);
            return (
              <div key={day} className="animate-in" style={{ animationDelay: `${Math.min(gi, 8) * 45}ms` }}>
                <div className="sticky top-[62px] z-10 mb-2 flex flex-wrap items-center gap-2 px-1">
                  <h3 className="rounded-full bg-[var(--ink)] px-3 py-1 text-xs font-bold text-white">
                    {fmtDate(items[0].startAt)}
                  </h3>
                  <span className="t-caption">{items.length} รายการ</span>
                  {busyDay && (
                    <Badge className="tone-bad" icon="warning">
                      คุณกันวันนี้ไว้
                    </Badge>
                  )}
                </div>

                <ul className="surface-flat divide-y divide-[var(--hairline)] overflow-hidden rounded-3xl">
                  {items.map((s) => {
                    const b = bookingOf.get(s.bookingId);
                    const badge = SLOT_BADGE[s.status] ?? SLOT_BADGE.pending;
                    const ids = b?.assigneeIds ?? [];
                    const joined = !!user && ids.includes(user.uid);
                    return (
                      <li key={s.id} className="flex items-start gap-3 p-3.5">
                        <div className="w-14 shrink-0 text-center">
                          <p className="t-num text-sm font-bold leading-tight text-[var(--ink)]">
                            {fmtTime(s.startAt)}
                          </p>
                          <p className="t-num text-[10px] text-[var(--muted-ink)]">ถึง {fmtTime(s.endAt)}</p>
                        </div>
                        <div className="h-10 w-px shrink-0 bg-[var(--hairline)]" />

                        <div className="min-w-0 flex-1">
                          <p className="t-label flex items-center gap-1.5 truncate text-[var(--ink)]">
                            <Icon
                              name={BOOKING_TYPE_ICON[s.bookingType]}
                              size={16}
                              className="text-[var(--faculty)]"
                            />
                            {s.itemName}
                          </p>
                          <p className="t-caption">{BOOKING_TYPE_LABEL[s.bookingType]}</p>

                          {/* ผู้รับผิดชอบ — เห็นเฉพาะงานที่เรามีสิทธิ์อ่านรายละเอียด */}
                          {b && s.bookingType === "photographer" && (
                            <p className="t-caption mt-1 flex items-center gap-1.5">
                              <Icon name="user" size={16} />
                              {ids.length === 0 ? (
                                <span className="text-[var(--tone-warn-ink)]">ยังไม่มีคนรับ</span>
                              ) : isAdmin ? (
                                ids.map((u) => nameOf.get(u) ?? u).join(", ")
                              ) : joined ? (
                                `คุณ${ids.length > 1 ? ` +${ids.length - 1} คน` : ""}`
                              ) : (
                                `ทีมงาน ${ids.length} คน`
                              )}
                            </p>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge className={badge.cls}>{badge.label}</Badge>
                          {joined && (
                            <Badge className="tone-brand" icon="approved">
                              งานคุณ
                            </Badge>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {myBusy.size > 0 && (
        <p className="t-caption mt-6 text-center">
          วันที่คุณกันไว้: {[...myBusy].sort().slice(0, 6).map(shortDay).join(" · ")}
          {myBusy.size > 6 ? ` +${myBusy.size - 6}` : ""}
        </p>
      )}
    </div>
  );
}
