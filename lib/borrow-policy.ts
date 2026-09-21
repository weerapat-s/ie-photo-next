// lib/borrow-policy.ts — กติกาการยืมที่ทั้งฝั่งสมาชิกและฝั่งเคาน์เตอร์ต้องใช้ให้ตรงกัน
//
// อยู่แยกไฟล์เพราะมีคนเรียกใช้ 3 ที่: หน้ายืม (กันส่งคำขอ), หน้าสถานีสแกน (กันส่งมอบ)
// และสคริปต์แจ้งเตือน (สรุปรายชื่อค้าง) ถ้าปล่อยให้แต่ละที่เขียนเงื่อนไขเอง
// เดี๋ยวก็เพี้ยนกัน แล้วจะกลายเป็นว่าเว็บห้ามแต่เคาน์เตอร์ยอม
import type { BookingDoc, WithId } from "@/lib/types";

/**
 * ยืมนานกว่านี้ = คาบเกี่ยวกลางคืนแน่นอนไม่ว่าจะเริ่มกี่โมง
 *
 * ใช้ "ความยาวช่วงเวลา" แทนการเช็คว่าข้ามเที่ยงคืนจริงไหม เพราะกติกาต้องเขียนซ้ำ
 * ใน firestore.rules ด้วย ซึ่งคำนวณวันตามเขตเวลาไทยไม่ได้ (ไม่มี timezone ให้ใช้)
 * เทียบ duration ตรง ๆ จึงเป็นเงื่อนไขเดียวที่สองฝั่งให้ผลตรงกันเสมอ
 */
export const OVERNIGHT_AFTER_MS = 12 * 3_600_000;

export function needsOvernightApproval(startMs: number, endMs: number): boolean {
  return endMs - startMs > OVERNIGHT_AFTER_MS;
}

/** ของยังไม่กลับเข้าคลัง — รออนุมัติไม่นับ เพราะยังไม่ได้ของไป */
export function isHolding(b: BookingDoc): boolean {
  return b.status === "approved" || b.status === "pending_return";
}

/** รายการที่ถืออยู่และเลยกำหนดคืนไปแล้ว */
export function overdueItems<T extends BookingDoc>(
  bookings: WithId<T>[],
  now: number
): WithId<T>[] {
  return bookings.filter((b) => isHolding(b) && b.endAt.toMillis() < now);
}

/** ข้อความบอกว่าติดอะไรอยู่ — ใช้ทั้งหน้ายืมและหน้าสถานี จะได้พูดเหมือนกัน */
export function overdueBlockMessage(overdue: WithId<BookingDoc>[], now: number): string {
  const names = overdue
    .map((b) => {
      const days = Math.max(1, Math.floor((now - b.endAt.toMillis()) / 86_400_000));
      return `${b.itemName} (เลยกำหนด ${days} วัน)`;
    })
    .join(", ");
  return `ยังมีของค้างเลยกำหนดคืน: ${names} — ต้องคืนของให้ครบก่อนจึงจะยืมชิ้นใหม่ได้`;
}

/**
 * ก่อนกรรมการกด "อนุมัติ" จากปุ่ม (ไม่ผ่านสถานีสแกน) — คืนเหตุที่ต้องบล็อก, null = ผ่าน
 *
 * สถานีสแกนบล็อกคนค้างของอยู่แล้ว แต่ปุ่มอนุมัติในหน้าภาพรวม/รายการจองไม่ได้ผ่านตรงนั้น
 * ถ้าไม่เช็คซ้ำตรงนี้ กติกา "ค้างแล้วยืมใหม่ไม่ได้" จะมีรูให้ลอดได้
 * (น้องส่งคำขอตอนยังไม่ค้าง แล้วมาค้างทีหลังก่อนกรรมการกดอนุมัติ)
 *
 * @param all คำขอทั้งหมดที่หน้าจอโหลดไว้ — ต้องมีของคนนี้ครบถึงจะตัดสินได้ถูก
 */
export function approvalBlockReason<T extends BookingDoc>(
  b: WithId<T>,
  all: WithId<T>[],
  now: number
): string | null {
  if (b.bookingType !== "equipment" || !b.userId) return null;
  const late = overdueItems(
    all.filter((x) => x.userId === b.userId && x.id !== b.id),
    now
  );
  return late.length ? overdueBlockMessage(late, now) : null;
}
