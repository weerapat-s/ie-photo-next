"use client";
// lib/slots.ts — ตารางเวลาสาธารณะ (slot 1 ใบ = booking 1 ใบ, ใช้ id เดียวกันเสมอ)
// หมายเหตุ: rules ยืนยันไม่ได้ว่ามี booking คู่จริง (batch write ประเมินทีละ doc)
//          slots จึงเป็นข้อมูลช่วยตัดสินใจ ไม่ใช่ source of truth — แอดมินเป็นด่านสุดท้าย
import { collection, query, where, getDocs, type Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { BookingType, SlotDoc, WithId } from "@/lib/types";

export function slotPayload(input: {
  bookingId: string;
  itemId: string;
  itemName: string;
  bookingType: BookingType;
  startAt: Timestamp;
  endAt: Timestamp;
}): SlotDoc {
  return { ...input, status: "pending" };
}

/**
 * หา slot ที่ทับช่วง [start, end) ของ item เดียวกัน
 * @param onlyApproved true = นับเฉพาะที่อนุมัติแล้ว (ใช้ฝั่ง guest — กัน slot ปลอมบล็อกคนอื่น)
 *                     false/default = นับ pending+approved (ใช้ฝั่ง member)
 */
export async function findSlotConflicts(
  itemId: string,
  start: Date,
  end: Date,
  opts: { onlyApproved?: boolean; excludeId?: string } = {}
): Promise<WithId<SlotDoc>[]> {
  // query แค่ itemId → ใช้ single-field index อัตโนมัติ ไม่ต้องสร้าง composite
  const snap = await getDocs(query(collection(db, "slots"), where("itemId", "==", itemId)));
  const s = start.getTime();
  const e = end.getTime();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as SlotDoc) }))
    .filter((sl) => {
      if (sl.id === opts.excludeId) return false;
      if (opts.onlyApproved && sl.status !== "approved") return false;
      return sl.startAt.toMillis() < e && sl.endAt.toMillis() > s;  // startA < endB && endA > startB
    });
}
