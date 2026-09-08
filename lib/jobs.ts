// lib/jobs.ts — รวม bookings เป็น "งานชุมนุม" (club job/event) ตามชื่องาน
//
// ระบบไม่มีคอลเลกชัน "งาน" แยก — งานคือชื่อที่ผูกไว้ใน bookings หลายใบ
// (งานถ่าย + การยืมของที่ระบุว่า "ยืมเพื่องานนี้") ไฟล์นี้จับกลุ่มให้เห็นเป็นงานเดียว
// พร้อมช่วงเวลา สถานะ คนที่ทำงาน และของที่ถูกยืมไปเพื่องานนั้น
//
// บริสุทธิ์ทั้งหมด (รับ now เข้ามา ไม่เรียก Date.now() เอง) — เทสได้ ไม่แตะ Firestore
import type { BookingDoc, WithId } from "./types";

export type JobStatus = "upcoming" | "active" | "done";

export interface ClubJob {
  name: string;
  startMs: number;
  endMs: number;
  status: JobStatus;
  bookings: WithId<BookingDoc>[];
  /** uid ของคนที่เกี่ยวข้อง: ผู้รับผิดชอบงาน (assigneeIds) + ผู้ถือของที่ยืม (userId) */
  peopleIds: string[];
  /** ชื่ออุปกรณ์ที่ถูกยืมเพื่องานนี้ (เฉพาะ bookingType = equipment) */
  equipmentNames: string[];
}

const PREFIX = "ชุมนุม: ";

/** ดึง "ชื่องานชุมนุม" จาก booking 1 ใบ — คืน null ถ้าเป็นงานส่วนตัว/ไม่ผูกงาน
 *  ตรงกับกติกาที่หน้า borrow เขียนไว้: อุปกรณ์เก็บเป็น "ชุมนุม: <ชื่อ>" · งานถ่ายใช้ usageType/usageReason */
export function extractJobName(b: BookingDoc): string | null {
  const ut = b.usageType?.trim() ?? "";
  if (ut.startsWith(PREFIX)) return ut.slice(PREFIX.length).trim() || null;
  if (b.bookingType === "photographer") return (ut || b.usageReason || "").trim() || null;
  return null;
}

function statusOf(startMs: number, endMs: number, now: number): JobStatus {
  if (endMs < now) return "done";
  if (startMs <= now) return "active";
  return "upcoming";
}

/**
 * รวม bookings เป็นรายการงานชุมนุม
 * - ตัดใบที่ยกเลิก/ถูกปฏิเสธออก (ไม่ใช่ของจริงแล้ว)
 * - ช่วงเวลา = ตั้งแต่ใบแรกเริ่ม จนถึงใบสุดท้ายจบ
 * - เรียง: กำลังทำ/ใกล้ถึงก่อน (ตามเวลาเริ่ม) แล้วค่อยงานที่จบแล้ว (ล่าสุดก่อน)
 */
export function deriveClubJobs(bookings: WithId<BookingDoc>[], now: number): ClubJob[] {
  const map = new Map<string, WithId<BookingDoc>[]>();
  for (const b of bookings) {
    if (b.status === "cancelled" || b.status === "rejected") continue;
    const name = extractJobName(b);
    if (!name) continue;
    (map.get(name) ?? map.set(name, []).get(name)!).push(b);
  }

  const jobs: ClubJob[] = [];
  for (const [name, list] of map) {
    const startMs = Math.min(...list.map((b) => b.startAt.toMillis()));
    const endMs = Math.max(...list.map((b) => b.endAt.toMillis()));
    const peopleIds = [
      ...new Set(
        list.flatMap((b) => [...(b.assigneeIds ?? []), ...(b.userId ? [b.userId] : [])])
      ),
    ];
    const equipmentNames = [
      ...new Set(list.filter((b) => b.bookingType === "equipment").map((b) => b.itemName)),
    ];
    jobs.push({ name, startMs, endMs, status: statusOf(startMs, endMs, now), bookings: list, peopleIds, equipmentNames });
  }

  const rank: Record<JobStatus, number> = { active: 0, upcoming: 1, done: 2 };
  return jobs.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    // งานที่ยังไม่จบ: ใกล้ถึงก่อน · งานที่จบแล้ว: เพิ่งจบก่อน
    return a.status === "done" ? b.endMs - a.endMs : a.startMs - b.startMs;
  });
}

/** ชื่องานที่ยัง "ไม่จบ" (ใช้โชว์เป็นตัวเลือกตอนยืม — งานที่ผ่านไปแล้วจะหายเอง) */
export function activeJobNames(bookings: WithId<BookingDoc>[], now: number): string[] {
  return deriveClubJobs(bookings, now)
    .filter((j) => j.status !== "done")
    .map((j) => j.name);
}
