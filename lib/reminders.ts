// lib/reminders.ts — หาว่าตอนนี้มีอะไรต้องเตือนบ้าง
//
// ตรรกะล้วน ไม่แตะ Firestore ไม่แตะ React — เทสต์ด้วย node ได้ตรง ๆ
// (การเตือนผิดวันคือความผิดพลาดที่คนเชื่อถือระบบน้อยลงทันที ต้องมีเทสต์คุม)
//
// ระบบเป็น static export ไม่มีเซิร์ฟเวอร์คอยตื่นมาเช็คทุกชั่วโมง
// จึงกวาดหาของที่ถึงกำหนดตอนมีคนเปิดแอป แล้วกันส่งซ้ำด้วยคีย์ kind:refId:วันที่
import type { BookingDoc, DeliveryDoc, TaskDoc, WithId } from "./types";

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** ล่วงหน้าเท่าไหร่ถึงเริ่มเตือน */
export const LEAD = {
  /** อุปกรณ์ใกล้ครบกำหนดคืน */
  borrowHours: 24,
  /** งานถ่ายใกล้ถึง */
  jobHours: 24,
  /** งานย่อยใกล้ถึงกำหนดส่ง */
  taskDays: 2,
  /** ไฟล์งานใกล้ถึงกำหนดส่ง */
  deliveryDays: 2,
} as const;

export type ReminderKind =
  | "borrow_due_soon"
  | "borrow_overdue"
  | "job_soon"
  | "task_due_soon"
  | "delivery_due";

export interface Reminder {
  kind: ReminderKind;
  /** id ของสิ่งที่อ้างถึง — คู่กับ kind ใช้กันส่งซ้ำ */
  refId: string;
  /** uid ของคนที่ต้องรู้ */
  userIds: string[];
  /** ชื่อสิ่งที่เตือน เอาไปขึ้นหัวข้อ */
  title: string;
  /** เวลาที่ถึงกำหนด (ms) */
  dueMs: number;
  /** บวก = เหลืออีกกี่ชั่วโมง · ลบ = เลยมาแล้ว */
  hoursLeft: number;
  /** ข้อมูลเสริมสำหรับแม่แบบอีเมล */
  location?: string | null;
}

function hoursBetween(from: number, to: number): number {
  return Math.round((to - from) / HOUR);
}

/**
 * อุปกรณ์ที่ยืมอยู่ — ใกล้ครบกำหนด หรือเลยกำหนดแล้ว
 * นับเฉพาะใบที่ยัง approved (ถ้ากดคืนแล้วเป็น pending_return จะไม่เตือนซ้ำ)
 */
export function borrowReminders(bookings: WithId<BookingDoc>[], now: number): Reminder[] {
  const out: Reminder[] = [];
  for (const b of bookings) {
    if (b.bookingType !== "equipment" || b.status !== "approved") continue;
    const due = b.endAt.toMillis();
    const left = hoursBetween(now, due);
    const base = {
      refId: b.id,
      userIds: b.userId ? [b.userId] : [],
      title: b.itemName,
      dueMs: due,
      hoursLeft: left,
    };
    if (due < now) {
      out.push({ ...base, kind: "borrow_overdue" });
    } else if (left <= LEAD.borrowHours) {
      out.push({ ...base, kind: "borrow_due_soon" });
    }
  }
  return out;
}

/** งานถ่ายที่ใกล้ถึง — เตือนคนที่ถูกมอบหมาย ไม่ใช่ลูกค้า */
export function jobReminders(bookings: WithId<BookingDoc>[], now: number): Reminder[] {
  const out: Reminder[] = [];
  for (const b of bookings) {
    if (b.bookingType !== "photographer" || b.status !== "approved") continue;
    const start = b.startAt.toMillis();
    if (start < now) continue; // เริ่มไปแล้ว เตือนไม่ทันแล้ว
    const left = hoursBetween(now, start);
    if (left > LEAD.jobHours) continue;
    const ids = b.assigneeIds ?? [];
    if (ids.length === 0) continue; // ยังไม่มีคนรับ — เป็นเรื่องของกรรมการ ไม่ใช่การเตือนรายคน
    out.push({
      kind: "job_soon",
      refId: b.id,
      userIds: ids,
      title: b.usageType || b.itemName,
      dueMs: start,
      hoursLeft: left,
      location: b.location,
    });
  }
  return out;
}

/** งานย่อยที่ใกล้ถึงกำหนดส่ง (รวมที่เลยกำหนดแล้ว) */
export function taskReminders(tasks: WithId<TaskDoc>[], now: number): Reminder[] {
  const out: Reminder[] = [];
  for (const t of tasks) {
    if (t.status === "completed" || t.status === "cancelled") continue;
    if (!t.dueDate) continue;
    const due = t.dueDate.toMillis();
    const left = hoursBetween(now, due);
    if (left > LEAD.taskDays * 24) continue;
    out.push({
      kind: "task_due_soon",
      refId: t.id,
      userIds: t.assignedToId ? [t.assignedToId] : [],
      title: t.title,
      dueMs: due,
      hoursLeft: left,
    });
  }
  return out;
}

/** ไฟล์งานที่ใกล้ถึงกำหนดส่ง */
export function deliveryReminders(deliveries: WithId<DeliveryDoc>[], now: number): Reminder[] {
  const out: Reminder[] = [];
  for (const d of deliveries) {
    if (d.status === "delivered" || d.status === "archived") continue;
    if (!d.dueAt) continue;
    const due = d.dueAt.toMillis();
    const left = hoursBetween(now, due);
    if (left > LEAD.deliveryDays * 24) continue;
    const ids = d.assigneeIds?.length ? d.assigneeIds : d.assignedToId ? [d.assignedToId] : [];
    if (ids.length === 0) continue;
    out.push({
      kind: "delivery_due",
      refId: d.id,
      userIds: ids,
      title: d.title,
      dueMs: due,
      hoursLeft: left,
    });
  }
  return out;
}

/** รวมทุกอย่างแล้วเรียงตามความด่วน — เลยกำหนดมาก่อน แล้วค่อยไล่ตามเวลาที่เหลือ */
export function allReminders(input: {
  bookings: WithId<BookingDoc>[];
  tasks: WithId<TaskDoc>[];
  deliveries: WithId<DeliveryDoc>[];
  now: number;
}): Reminder[] {
  const { bookings, tasks, deliveries, now } = input;
  return [
    ...borrowReminders(bookings, now),
    ...jobReminders(bookings, now),
    ...taskReminders(tasks, now),
    ...deliveryReminders(deliveries, now),
  ].sort((a, b) => a.hoursLeft - b.hoursLeft);
}

/**
 * คีย์กันส่งซ้ำ — เตือนเรื่องเดียวกันได้วันละครั้งเท่านั้น
 * ใช้เวลาท้องถิ่น ไม่ใช่ UTC เพราะ "วันนี้" ของผู้ใช้คือวันตามเวลาไทย
 */
export function dedupeKey(r: Reminder, uid: string, now: number): string {
  const d = new Date(now);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${r.kind}:${r.refId}:${uid}:${day}`;
}

/** ข้อความสั้นบอกว่าเหลือเวลาเท่าไหร่ — ใช้ทั้งในหน้าเว็บและหัวข้ออีเมล */
export function describeLeft(hoursLeft: number): string {
  if (hoursLeft < 0) {
    const late = -hoursLeft;
    return late < 24 ? `เลยมาแล้ว ${late} ชม.` : `เลยมาแล้ว ${Math.floor(late / 24)} วัน`;
  }
  if (hoursLeft === 0) return "ถึงกำหนดแล้ว";
  if (hoursLeft < 24) return `เหลือ ${hoursLeft} ชม.`;
  return `เหลือ ${Math.floor(hoursLeft / 24)} วัน`;
}

/** จำนวนวันที่เลยกำหนด — ใช้ในแม่แบบอีเมล (อย่างน้อย 1 เพื่อไม่ให้ขึ้น "เลย 0 วัน") */
export function daysLate(hoursLeft: number): number {
  return Math.max(1, Math.ceil(-hoursLeft / 24));
}

export const REMINDER_MS = { HOUR, DAY };
