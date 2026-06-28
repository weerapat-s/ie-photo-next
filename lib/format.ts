// lib/format.ts — helper แปลงวันที่/สถานะเป็นภาษาไทย
import type { Timestamp } from "firebase/firestore";
import type { BookingStatus, EquipmentStatus, TaskStatus } from "./types";

type TS = Timestamp | Date | null | undefined;

function toDate(ts: TS): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof (ts as Timestamp).toDate === "function") return (ts as Timestamp).toDate();
  return null;
}

export function fmtDateTime(ts: TS): string {
  const d = toDate(ts);
  if (!d) return "—";
  return d.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDate(ts: TS): string {
  const d = toDate(ts);
  if (!d) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

// ── Booking status ──────────────────────────────────────────
export const BOOKING_STATUS: Record<BookingStatus, { label: string; cls: string }> = {
  pending:        { label: "รอดำเนินการ", cls: "bg-amber-100 text-amber-700" },
  approved:       { label: "อนุมัติแล้ว",  cls: "bg-green-100 text-green-700" },
  rejected:       { label: "ปฏิเสธแล้ว",   cls: "bg-red-100 text-red-700" },
  returned:       { label: "คืนแล้ว",      cls: "bg-blue-100 text-blue-700" },
  cancelled:      { label: "ยกเลิก",       cls: "bg-neutral-100 text-neutral-500" },
  pending_return: { label: "รอตรวจคืน",    cls: "bg-purple-100 text-purple-700" },
};

export const EQUIPMENT_STATUS: Record<EquipmentStatus, { label: string; cls: string }> = {
  available:   { label: "พร้อมใช้งาน", cls: "bg-green-100 text-green-700" },
  borrowed:    { label: "กำลังถูกยืม", cls: "bg-amber-100 text-amber-700" },
  maintenance: { label: "ซ่อมบำรุง",   cls: "bg-red-100 text-red-700" },
};

export const TASK_STATUS: Record<TaskStatus, { label: string; cls: string }> = {
  pending:     { label: "รอดำเนินการ", cls: "bg-amber-100 text-amber-700" },
  in_progress: { label: "กำลังทำ",     cls: "bg-blue-100 text-blue-700" },
  completed:   { label: "เสร็จแล้ว",   cls: "bg-green-100 text-green-700" },
  cancelled:   { label: "ยกเลิก",      cls: "bg-neutral-100 text-neutral-500" },
};

export const EQUIPMENT_TYPE_LABEL: Record<string, string> = {
  camera: "📷 กล้อง",
  lens: "🔍 เลนส์",
  accessory: "📦 อุปกรณ์เสริม",
};
