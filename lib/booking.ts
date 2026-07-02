"use client";
// lib/booking.ts — เช็คการจองซ้อน (ช่วงเวลาทับกันบน item เดียวกัน)
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { BookingDoc, WithId } from "@/lib/types";

/**
 * หาการจองที่ทับช่วงเวลา [start, end) ของ item เดียวกัน
 * นับเฉพาะสถานะ pending/approved (rejected/returned/cancelled ไม่บล็อก)
 * @param excludeId ข้าม booking id นี้ (ใช้ตอนแอดมินเช็คก่อนอนุมัติตัวมันเอง)
 */
export async function findBookingConflicts(
  itemId: string,
  start: Date,
  end: Date,
  opts: { onlyApproved?: boolean; excludeId?: string } = {}
): Promise<WithId<BookingDoc>[]> {
  const statuses = opts.onlyApproved ? ["approved"] : ["pending", "approved"];
  const snap = await getDocs(
    query(collection(db, "bookings"), where("itemId", "==", itemId), where("status", "in", statuses))
  );
  const s = Timestamp.fromDate(start);
  const e = Timestamp.fromDate(end);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as BookingDoc) }))
    .filter(
      (b) =>
        b.id !== opts.excludeId &&
        // ช่วงเวลาทับกัน: startA < endB && endA > startB
        b.startAt.toMillis() < e.toMillis() &&
        b.endAt.toMillis() > s.toMillis()
    );
}
