// lib/availability.ts — วันว่าง/ไม่ว่างของทีมงาน
//
// กติกาที่ยึด: **ไม่ระบุ = ว่าง**
// ตากล้องกันเฉพาะวันที่ติดธุระ ไม่ต้องมาเช็กอินทุกวันว่าว่าง
// กรรมการจึงสั่งงานได้ทันทีถ้าไม่มีใครกันวันนั้นไว้ — ระบบไม่บล็อกการทำงานปกติ
import type { AvailabilityDoc, WithId } from "./types";

/** คีย์วันแบบเวลาท้องถิ่น YYYY-MM-DD — ห้ามใช้ toISOString() เพราะมันเป็น UTC
 *  (งานตอน 4 ทุ่มของไทยจะเด้งไปเป็นวันถัดไป) */
export function dateKey(d: Date | number): string {
  const x = typeof d === "number" ? new Date(d) : d;
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ทุกวันที่งานคาบเกี่ยว (งานข้ามคืนนับทั้งสองวัน) */
export function daysBetween(startMs: number, endMs: number): string[] {
  const out: string[] = [];
  const cur = new Date(startMs);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(endMs);
  last.setHours(0, 0, 0, 0);
  // กันวนไม่รู้จบถ้าข้อมูลเพี้ยน — งานเกิน 60 วันไม่มีจริง
  for (let i = 0; i <= 60 && cur.getTime() <= last.getTime(); i++) {
    out.push(dateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export type BusyMap = Map<string, Set<string>>;

/** uid → เซ็ตวันที่ไม่ว่าง (ค้นเร็วกว่าไล่ array ทุกครั้ง) */
export function buildBusyMap(docs: WithId<AvailabilityDoc>[]): BusyMap {
  const m: BusyMap = new Map();
  for (const d of docs) m.set(d.id, new Set(d.busyDates ?? []));
  return m;
}

/** คนนี้ติดธุระในช่วงงานนี้ไหม — คืนวันที่ชนกัน ([] = ว่าง) */
export function busyDaysInRange(
  busy: BusyMap,
  uid: string,
  startMs: number,
  endMs: number
): string[] {
  const set = busy.get(uid);
  if (!set || set.size === 0) return [];
  return daysBetween(startMs, endMs).filter((d) => set.has(d));
}

/** แสดงวันแบบสั้นภาษาไทย: "2026-09-05" → "5 ก.ย." */
export function shortDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return new Date(y, m - 1, d).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

/* ═══ สถานะรับงาน — รวมธง open/closed กับวันที่กันไว้เป็นเรื่องเดียว ══════ */

export type CrewState = "closed" | "busy_today" | "busy_soon" | "open";

export interface CrewStatus {
  state: CrewState;
  /** ข้อความบนป้าย */
  label: string;
  /** คลาสสีของป้าย */
  tone: string;
  /** true = มอบหมาย/จองไม่ได้ตอนนี้ */
  blocked: boolean;
  /** เหตุผลที่กดไม่ได้ — ใช้เป็นข้อความบนปุ่ม */
  reason?: string;
}

/**
 * สถานะรับงานที่ "จริง" ของทีมงานหนึ่งคน
 *
 * ระบบเดิมมี 2 แหล่งที่ไม่คุยกัน:
 *   • photographers.status  — ธง เปิด/ปิด ที่กรรมการตั้งให้
 *   • availability.busyDates — วันที่เจ้าตัวกดกันไว้เอง
 * การ์ดเคยอ่านแค่ธงแรก จึงขึ้น "ว่างรับงาน" ทั้งที่เจ้าตัวกันวันนี้ไว้แล้ว
 *
 * ตัวนี้รวมสองอย่างเข้าด้วยกัน โดยให้ "วันที่เจ้าตัวกันไว้" มีน้ำหนักกว่า —
 * เจ้าตัวรู้ตารางตัวเองดีกว่าธงที่ตั้งค้างไว้นานแล้ว
 */
export function crewStatus(
  status: string | undefined,
  busyDates: string[],
  now: number
): CrewStatus {
  if (status !== "open")
    return { state: "closed", label: "ปิดรับงาน", tone: "tone-mute", blocked: true, reason: "ยังไม่เปิดรับงาน" };

  const today = dateKey(now);
  const upcoming = busyDates.filter((d) => d >= today).sort();

  if (upcoming[0] === today)
    return {
      state: "busy_today",
      label: "ไม่ว่างวันนี้",
      tone: "tone-bad",
      blocked: true,
      reason: "เจ้าตัวกันวันนี้ไว้",
    };

  if (upcoming.length > 0)
    return {
      state: "busy_soon",
      label: `ว่าง · ติด ${upcoming.length} วัน`,
      tone: "tone-warn",
      blocked: false,
    };

  return { state: "open", label: "ว่างรับงาน", tone: "tone-ok", blocked: false };
}
