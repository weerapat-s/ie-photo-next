// lib/analytics.ts — ฟังก์ชันสรุปตัวเลขสำหรับหน้าภาพรวม (บริสุทธิ์ทั้งหมด เทสได้ ไม่แตะ Firestore)
// ทุกฟังก์ชันรับ `now` เข้ามา ไม่เรียก Date.now() เอง — เรียกตอน render ไม่ได้ (React Compiler)
import type { BookingDoc, BookingType, DeliveryDoc, TaskDoc, WithId } from "./types";

const DAY = 86_400_000;

/** ขั้นตอนของงาน 1 ชิ้น เรียงตามลำดับการทำงานจริง */
export type Stage = "requested" | "scheduled" | "active" | "wrapping" | "done";

export const STAGE_META: Record<Stage, { label: string; hint: string; cls: string; dot: string }> = {
  requested: {
    label: "คำขอใหม่",
    hint: "รอกรรมการอนุมัติ",
    cls: "bg-amber-50 border-amber-200",
    dot: "bg-amber-400",
  },
  scheduled: {
    label: "ยืนยันแล้ว",
    hint: "รอถึงวันงาน",
    cls: "bg-sky-50 border-sky-200",
    dot: "bg-sky-400",
  },
  active: {
    label: "กำลังดำเนินงาน",
    hint: "อยู่ในช่วงเวลาที่จองไว้",
    cls: "bg-violet-50 border-violet-200",
    dot: "bg-violet-400",
  },
  wrapping: {
    label: "เก็บงาน",
    hint: "รอคืนของ / รออัปไฟล์",
    cls: "bg-orange-50 border-orange-200",
    dot: "bg-orange-400",
  },
  done: {
    label: "ปิดงาน",
    hint: "คืนของ/ส่งไฟล์ครบแล้ว",
    cls: "bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-400",
  },
};

export const STAGE_ORDER: Stage[] = ["requested", "scheduled", "active", "wrapping", "done"];

/** จัดการจอง 1 ใบว่าอยู่ขั้นไหนของ workflow */
export function stageOfBooking(b: BookingDoc, now: number): Stage | null {
  if (b.status === "rejected" || b.status === "cancelled") return null;
  if (b.status === "pending") return "requested";
  if (b.status === "pending_return") return "wrapping";
  if (b.status === "returned") return "done";
  // approved — แยกตามเวลาว่าอยู่ก่อน/ระหว่าง/หลังช่วงที่จอง
  const start = b.startAt.toMillis();
  const end = b.endAt.toMillis();
  if (now < start) return "scheduled";
  if (now <= end) return "active";
  return "wrapping"; // เลยเวลาแล้วแต่ยังไม่ปิด = ต้องตาม
}

export interface StageBucket {
  stage: Stage;
  bookings: WithId<BookingDoc>[];
}

export function groupByStage(bookings: WithId<BookingDoc>[], now: number): StageBucket[] {
  const map = new Map<Stage, WithId<BookingDoc>[]>(STAGE_ORDER.map((s) => [s, []]));
  for (const b of bookings) {
    const st = stageOfBooking(b, now);
    if (st) map.get(st)!.push(b);
  }
  // ในแต่ละขั้น เรียงตามเวลาเริ่มงาน — ใกล้ถึงก่อน
  for (const list of map.values()) list.sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
  return STAGE_ORDER.map((stage) => ({ stage, bookings: map.get(stage)! }));
}

/** จำนวนงานที่ "ต้องมีคนลงมือ" — ตัวเลขเดียวที่ประธานควรเห็นก่อนใคร */
export function actionRequired(
  bookings: WithId<BookingDoc>[],
  deliveries: WithId<DeliveryDoc>[],
  now: number
): { pendingApproval: number; pendingReturn: number; awaitingUpload: number; overdue: number; total: number } {
  const pendingApproval = bookings.filter((b) => b.status === "pending").length;
  const pendingReturn = bookings.filter((b) => b.status === "pending_return").length;
  const awaitingUpload = deliveries.filter((d) => d.status === "awaiting_upload").length;
  const overdue = deliveries.filter(
    (d) => d.dueAt && d.status !== "delivered" && d.status !== "archived" && d.dueAt.toMillis() < now
  ).length;
  return {
    pendingApproval,
    pendingReturn,
    awaitingUpload,
    overdue,
    total: pendingApproval + pendingReturn + awaitingUpload,
  };
}

export interface PeriodStat {
  current: number;
  previous: number;
  /** % เปลี่ยนแปลง — null เมื่อรอบก่อนเป็น 0 (หารไม่ได้ อย่ามั่วเป็น 100%) */
  changePct: number | null;
}

/** เทียบจำนวนงานรอบ N วันล่าสุด กับ N วันก่อนหน้านั้น */
export function comparePeriods(
  bookings: WithId<BookingDoc>[],
  now: number,
  days = 30
): PeriodStat {
  const span = days * DAY;
  const curStart = now - span;
  const prevStart = now - span * 2;
  let current = 0;
  let previous = 0;
  for (const b of bookings) {
    const t = b.createdAt?.toMillis?.();
    if (typeof t !== "number") continue;
    if (t >= curStart) current++;
    else if (t >= prevStart) previous++;
  }
  return { current, previous, changePct: previous === 0 ? null : ((current - previous) / previous) * 100 };
}

/** จำนวนงานต่อวันย้อนหลัง N วัน — ใช้วาดกราฟแท่งเล็ก */
export function dailyCounts(bookings: WithId<BookingDoc>[], now: number, days = 14): number[] {
  const out = new Array(days).fill(0);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const base = todayStart.getTime();
  for (const b of bookings) {
    const t = b.createdAt?.toMillis?.();
    if (typeof t !== "number") continue;
    // เทียบ "เที่ยงคืนของวันนั้น" กับ "เที่ยงคืนวันนี้"
    // (ลบเวลาดิบตรง ๆ ไม่ได้ — งานที่เกิดวันนี้หลังเที่ยงคืนจะได้ค่าติดลบแล้วหลุดช่วงไป)
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    const daysAgo = Math.round((base - d.getTime()) / DAY); // round กันเวลาคลาดจาก DST
    const idx = days - 1 - daysAgo;
    if (idx >= 0 && idx < days) out[idx]++;
  }
  return out;
}

/** สัดส่วนงานแยกตามประเภท */
export function byType(bookings: WithId<BookingDoc>[]): Record<BookingType, number> {
  const out: Record<BookingType, number> = { equipment: 0, studio: 0, photographer: 0 };
  for (const b of bookings) if (b.bookingType in out) out[b.bookingType]++;
  return out;
}

export interface CrewLoad {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** คิวถ่ายที่ยังไม่จบ */
  upcoming: number;
  /** งานส่งที่ยังไม่ปิด */
  openDeliveries: number;
  /** งานที่ได้รับมอบหมายและยังไม่เสร็จ */
  openTasks: number;
  total: number;
}

/** ภาระงานรายคน — ใช้ตัดสินใจว่าจะจ่ายงานให้ใคร */
export function crewLoad(
  crew: { id: string; name: string; uid: string | null; avatarUrl: string | null }[],
  bookings: WithId<BookingDoc>[],
  deliveries: WithId<DeliveryDoc>[],
  tasks: WithId<TaskDoc>[],
  now: number
): CrewLoad[] {
  return crew
    .map((c) => {
      const upcoming = bookings.filter(
        (b) =>
          b.bookingType === "photographer" &&
          b.itemId === c.id &&
          (b.status === "approved" || b.status === "pending") &&
          b.endAt.toMillis() > now
      ).length;
      const openDeliveries = c.uid
        ? deliveries.filter(
            (d) => d.assignedToId === c.uid && d.status !== "delivered" && d.status !== "archived"
          ).length
        : 0;
      const openTasks = c.uid
        ? tasks.filter(
            (t) => t.assignedToId === c.uid && t.status !== "completed" && t.status !== "cancelled"
          ).length
        : 0;
      return {
        id: c.id,
        name: c.name,
        avatarUrl: c.avatarUrl,
        upcoming,
        openDeliveries,
        openTasks,
        total: upcoming + openDeliveries + openTasks,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** อัตราส่งงานตรงเวลา — นับเฉพาะงานที่ปิดแล้วและเคยตั้งกำหนดส่งไว้ */
export function onTimeRate(deliveries: WithId<DeliveryDoc>[]): { rate: number | null; closed: number } {
  const closed = deliveries.filter((d) => (d.status === "delivered" || d.status === "archived") && d.dueAt);
  if (closed.length === 0) return { rate: null, closed: 0 };
  const onTime = closed.filter((d) => {
    const done = d.updatedAt?.toMillis?.() ?? null;
    return done === null ? true : done <= d.dueAt!.toMillis();
  }).length;
  return { rate: (onTime / closed.length) * 100, closed: closed.length };
}

/* ═══ วิเคราะห์ทรัพยากรบุคคล (HR) ═══════════════════════════════
   เป้าหมาย: ตอบ 3 คำถามที่ประธานต้องตัดสินใจจริง
     1. กำลังคนพอไหม  2. งานกระจุกที่ใครหรือเปล่า  3. ของมีพอใช้ไหม        */

export interface HrStats {
  /** จำนวนคนที่มีงานค้างอยู่จริง */
  activeCrew: number;
  totalCrew: number;
  /** งานค้างเฉลี่ยต่อคน */
  avgLoad: number;
  /** งานค้างของคนที่แบกหนักสุด */
  maxLoad: number;
  /**
   * ดัชนีความเหลื่อมล้ำของภาระงาน (Gini 0–1)
   * 0 = กระจายเท่ากันทุกคน · ใกล้ 1 = กองอยู่ที่คนเดียว
   * ใช้ Gini แทนส่วนเบี่ยงเบนมาตรฐาน เพราะเทียบข้ามขนาดทีมได้ตรง ๆ
   */
  gini: number;
  /** คนที่ยังไม่มีงานเลย — เอาไปจ่ายงานต่อได้ */
  idle: string[];
  /** คนที่แบกเกินค่าเฉลี่ยเกิน 1.5 เท่า — เสี่ยงงานล้น */
  overloaded: string[];
}

/** Gini coefficient — วัดความเหลื่อมล้ำของการกระจายภาระงาน */
export function giniCoefficient(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return 0; // ไม่มีใครมีงานเลย = ไม่เหลื่อมล้ำ
  const sorted = [...values].sort((a, b) => a - b);
  let weighted = 0;
  for (let i = 0; i < n; i++) weighted += (i + 1) * sorted[i];
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

export function hrStats(load: CrewLoad[]): HrStats {
  const totals = load.map((c) => c.total);
  const totalCrew = load.length;
  const activeCrew = totals.filter((t) => t > 0).length;
  const sum = totals.reduce((a, b) => a + b, 0);
  const avgLoad = totalCrew === 0 ? 0 : sum / totalCrew;
  return {
    activeCrew,
    totalCrew,
    avgLoad,
    maxLoad: totals.length ? Math.max(...totals) : 0,
    gini: giniCoefficient(totals),
    idle: load.filter((c) => c.total === 0).map((c) => c.name),
    overloaded: load.filter((c) => avgLoad > 0 && c.total > avgLoad * 1.5).map((c) => c.name),
  };
}

/** แปลง Gini เป็นคำอธิบายที่คนอ่านแล้วรู้ว่าต้องทำอะไรต่อ */
export function describeBalance(gini: number, activeCrew: number): { label: string; tone: "ok" | "warn" | "bad" } {
  if (activeCrew === 0) return { label: "ยังไม่มีใครมีงานค้าง", tone: "ok" };
  if (gini < 0.25) return { label: "กระจายงานทั่วถึงดี", tone: "ok" };
  if (gini < 0.45) return { label: "เริ่มเอียงไปบางคน", tone: "warn" };
  return { label: "งานกระจุกที่คนไม่กี่คน", tone: "bad" };
}

export interface AssetStats {
  total: number;
  available: number;
  inUse: number;
  maintenance: number;
  /** % ของที่ถูกใช้อยู่จริงตอนนี้ */
  utilization: number;
}

/** อัตราการใช้อุปกรณ์ ณ ตอนนี้ — ของว่างเยอะเกินไป = ซื้อเกินจำเป็น */
export function assetStats(
  equipments: { status: string }[],
  slots: { itemId: string; status: string; startAt: { toMillis(): number }; endAt: { toMillis(): number } }[],
  equipmentIds: string[],
  now: number
): AssetStats {
  const total = equipments.length;
  const maintenance = equipments.filter((e) => e.status === "maintenance").length;
  const busy = new Set(
    slots
      .filter(
        (s) =>
          equipmentIds.includes(s.itemId) &&
          s.status === "approved" &&
          s.startAt.toMillis() <= now &&
          s.endAt.toMillis() > now
      )
      .map((s) => s.itemId)
  );
  const inUse = busy.size;
  return {
    total,
    available: Math.max(0, total - maintenance - inUse),
    inUse,
    maintenance,
    utilization: total === 0 ? 0 : (inUse / total) * 100,
  };
}
