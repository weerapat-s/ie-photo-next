"use client";
// lib/bookings.ts — การกระทำกับใบจองที่ใช้ร่วมกันหลายหน้า
import { doc, writeBatch, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { BookingDoc, WithId } from "@/lib/types";

/**
 * ยกเลิกได้ไหม — ต้องตรงกับ ownerCancel() ใน firestore.rules เป๊ะ ๆ
 * ไม่งั้นปุ่มจะโผล่แล้วกดไม่ผ่าน ซึ่งน่าหงุดหงิดกว่าไม่มีปุ่ม
 *
 * รออนุมัติ → ยกเลิกได้เสมอ
 * อนุมัติแล้วแต่ยังไม่ถึงเวลา → ยกเลิกได้ (คืนคิวให้คนอื่น)
 * อนุมัติแล้วและเลยเวลาเริ่ม → ของอยู่ในมือแล้ว ต้อง "คืน" ไม่ใช่ "ยกเลิก"
 */
export function canCancel(b: BookingDoc, now: number): boolean {
  if (b.status === "pending") return true;
  return b.status === "approved" && b.startAt.toMillis() > now;
}

/**
 * ยกเลิกใบจอง + เอาคิวออกจากตารางสาธารณะ
 * slot ใช้ id เดียวกับ booking จึงลบคู่กันได้ใน batch เดียว —
 * ถ้าลบไม่พร้อมกันจะเหลือคิวค้างบล็อกคนอื่นทั้งที่ยกเลิกไปแล้ว
 */
export async function cancelBooking(b: WithId<BookingDoc>): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, "bookings", b.id), { status: "cancelled" });
  batch.delete(doc(db, "slots", b.id));
  await batch.commit();
}

/** ข้อความยืนยันก่อนยกเลิก — บอกให้ชัดว่ากำลังจะยกเลิกอะไร */
export function cancelPrompt(b: BookingDoc): string {
  const what = b.usageType || b.itemName;
  return `ยกเลิกการจอง "${what}"?\nคิวนี้จะถูกปล่อยให้คนอื่นจองต่อได้ทันที`;
}

/** ms ของเวลาเริ่ม — ใช้เทียบกับ now ที่ส่งมาจาก useNow */
export function startMs(b: BookingDoc): number {
  return (b.startAt as Timestamp).toMillis();
}
