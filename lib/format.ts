// lib/format.ts — helper แปลงวันที่/สถานะเป็นภาษาไทย
// สีสถานะใช้ 6 โทนกลางของระบบ (.tone-*) ไม่หยิบสี Tailwind ดิบ ๆ มาใช้
// เพราะ hue คนละตระกูลกับ faculty แล้วป้ายจะดูหลุดจากทั้งเว็บ
import type { IconName } from "@/components/icon";
import type { Timestamp } from "firebase/firestore";
import type {
  BookingStatus,
  BookingType,
  DeliveryStatus,
  EquipmentStatus,
  TaskStatus,
} from "./types";

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

export function fmtTime(ts: TS): string {
  const d = toDate(ts);
  if (!d) return "—";
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

/** ช่วงเวลาแบบสั้น — วันเดียวกันไม่ต้องซ้ำวันที่ */
export function fmtRange(start: TS, end: TS): string {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return "—";
  const sameDay = s.toDateString() === e.toDateString();
  return sameDay
    ? `${fmtDate(s)} · ${fmtTime(s)}–${fmtTime(e)}`
    : `${fmtDateTime(s)} → ${fmtDateTime(e)}`;
}

/** "อีก 3 วัน" / "เมื่อ 2 ชม.ที่แล้ว" */
export function fmtRelative(ts: TS): string {
  const d = toDate(ts);
  if (!d) return "—";
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  const rtf = new Intl.RelativeTimeFormat("th-TH", { numeric: "auto" });
  if (abs < hour) return rtf.format(Math.round(diff / min), "minute");
  if (abs < day) return rtf.format(Math.round(diff / hour), "hour");
  return rtf.format(Math.round(diff / day), "day");
}

// ── Booking status ──────────────────────────────────────────
export const BOOKING_STATUS: Record<BookingStatus, { label: string; cls: string }> = {
  pending:        { label: "รอดำเนินการ", cls: "tone-warn" },
  approved:       { label: "อนุมัติแล้ว",  cls: "tone-ok" },
  rejected:       { label: "ปฏิเสธแล้ว",   cls: "tone-bad" },
  returned:       { label: "คืนแล้ว",      cls: "tone-info" },
  cancelled:      { label: "ยกเลิก",       cls: "tone-mute" },
  pending_return: { label: "รอตรวจคืน",    cls: "tone-brand" },
};

export const EQUIPMENT_STATUS: Record<EquipmentStatus, { label: string; cls: string }> = {
  available:   { label: "พร้อมใช้งาน", cls: "tone-ok" },
  borrowed:    { label: "กำลังถูกยืม", cls: "tone-warn" },
  maintenance: { label: "ซ่อมบำรุง",   cls: "tone-bad" },
};

export const TASK_STATUS: Record<TaskStatus, { label: string; cls: string }> = {
  pending:     { label: "รอดำเนินการ", cls: "tone-warn" },
  in_progress: { label: "กำลังทำ",     cls: "tone-info" },
  completed:   { label: "เสร็จแล้ว",   cls: "tone-ok" },
  cancelled:   { label: "ยกเลิก",      cls: "tone-mute" },
};

export const DELIVERY_STATUS: Record<DeliveryStatus, { label: string; cls: string }> = {
  awaiting_upload: { label: "รออัปไฟล์",      cls: "tone-warn" },
  uploaded:        { label: "อัปแล้ว รอตรวจ", cls: "tone-info" },
  delivered:       { label: "ส่งงานแล้ว",     cls: "tone-ok" },
  archived:        { label: "ปิดงาน",         cls: "tone-mute" },
};

/**
 * ตัด emoji ที่ติดมากับข้อมูลเก่าใน Firestore (เช่น studios.tags = "📸 Portrait")
 * แก้ที่ชั้นแสดงผล เพราะข้อมูลเดิมแอดมินพิมพ์ไว้แล้ว จะไปไล่แก้ทุก doc ไม่คุ้ม
 * — พิมพ์ emoji เพิ่มเองทีหลังก็ยังโดนตัดให้อัตโนมัติ
 */
export function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const EQUIPMENT_TYPE_LABEL: Record<string, string> = {
  camera: "กล้อง",
  lens: "เลนส์",
  memory: "เมมโมรี่การ์ด",
  accessory: "อุปกรณ์เสริม",
};

export const EQUIPMENT_TYPE_ICON: Record<string, IconName> = {
  camera: "equipment",
  lens: "search",
  accessory: "inventory",
};

export const BOOKING_TYPE_LABEL: Record<BookingType, string> = {
  equipment: "อุปกรณ์",
  studio: "สตูดิโอ",
  photographer: "ตากล้อง",
};

export const BOOKING_TYPE_ICON: Record<BookingType, IconName> = {
  equipment: "equipment",
  studio: "studio",
  photographer: "photographer",
};
