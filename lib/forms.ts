// lib/forms.ts — helper ของระบบฟอร์มที่สร้างเอง
import type { FieldType, FormField, FormValue } from "./types";

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "ข้อความสั้น",
  textarea: "ข้อความยาว",
  number: "ตัวเลข",
  email: "อีเมล",
  tel: "เบอร์โทร",
  date: "วันที่",
  time: "เวลา",
  datetime: "วันที่ + เวลา",
  select: "เลือกจากรายการ",
  radio: "เลือกได้ 1 ข้อ",
  checkbox: "เลือกได้หลายข้อ",
  image: "แนบรูป",
  heading: "หัวข้อคั่น",
};

export const FIELD_TYPE_ICON: Record<FieldType, string> = {
  text: "🔤",
  textarea: "📝",
  number: "🔢",
  email: "✉️",
  tel: "📞",
  date: "📅",
  time: "🕐",
  datetime: "🗓️",
  select: "▾",
  radio: "◉",
  checkbox: "☑️",
  image: "🖼️",
  heading: "―",
};

/** ชนิดที่ต้องมีตัวเลือก */
export const HAS_OPTIONS: FieldType[] = ["select", "radio", "checkbox"];

/** ชนิดที่ไม่เก็บค่า (เป็นตัวคั่นสายตาเฉย ๆ) */
export const IS_DISPLAY_ONLY: FieldType[] = ["heading"];

let seq = 0;
/** id ของฟิลด์ — ต้องคงที่ตลอดอายุฟอร์ม เพราะเป็น key ของค่าที่บันทึกไว้ */
export function newFieldId(): string {
  seq += 1;
  return `f${Date.now().toString(36)}${seq.toString(36)}`;
}

export function blankField(type: FieldType = "text"): FormField {
  return {
    id: newFieldId(),
    type,
    label: type === "heading" ? "หัวข้อใหม่" : "คำถามใหม่",
    required: false,
    // ต้องเป็น [] ไม่ใช่ undefined — Firestore เขียน undefined ไม่ได้ (throw ตั้งแต่ฝั่ง client)
    options: HAS_OPTIONS.includes(type) ? ["ตัวเลือก 1", "ตัวเลือก 2"] : [],
    placeholder: "",
    help: "",
    maxLength: null,
    min: null,
    max: null,
  };
}

/**
 * ทำให้ field พร้อมเขียนลง Firestore — ไม่มี undefined หลงเหลือแม้แต่ตัวเดียว
 * (Firestore ปฏิเสธ undefined ทั้ง document ทันที ไม่ใช่เรื่องสิทธิ์)
 */
export function sanitizeFields(fields: FormField[]): FormField[] {
  return fields.map((f) => ({
    id: f.id,
    type: f.type,
    label: (f.label ?? "").trim(),
    placeholder: f.placeholder ?? "",
    help: f.help ?? "",
    required: !!f.required,
    options: HAS_OPTIONS.includes(f.type) ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : [],
    maxLength: f.maxLength ?? null,
    min: f.min ?? null,
    max: f.max ?? null,
  }));
}

/** ตรวจคำตอบ 1 ฟิลด์ — คืนข้อความ error หรือ null ถ้าผ่าน */
export function validateField(f: FormField, v: FormValue): string | null {
  if (IS_DISPLAY_ONLY.includes(f.type)) return null;

  const empty =
    v === null ||
    v === undefined ||
    v === "" ||
    (Array.isArray(v) && v.length === 0) ||
    (f.type === "checkbox" && Array.isArray(v) && v.length === 0);

  if (f.required && empty) return "กรุณากรอกข้อมูลนี้";
  if (empty) return null;

  if (f.type === "email" && typeof v === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    return "รูปแบบอีเมลไม่ถูกต้อง";
  }
  if (f.type === "tel" && typeof v === "string" && v.replace(/\D/g, "").length < 9) {
    return "เบอร์โทรสั้นเกินไป";
  }
  if (f.type === "number" && typeof v === "number") {
    if (typeof f.min === "number" && v < f.min) return `ต้องไม่น้อยกว่า ${f.min}`;
    if (typeof f.max === "number" && v > f.max) return `ต้องไม่เกิน ${f.max}`;
  }
  if ((f.type === "text" || f.type === "textarea") && typeof v === "string") {
    const cap = f.maxLength ?? (f.type === "text" ? 200 : 2000);
    if (v.length > cap) return `ยาวเกิน ${cap} ตัวอักษร`;
  }
  return null;
}

/** ตรวจทั้งฟอร์ม — คืน map ของ fieldId → error */
export function validateForm(fields: FormField[], values: Record<string, FormValue>) {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const e = validateField(f, values[f.id] ?? null);
    if (e) errors[f.id] = e;
  }
  return errors;
}

/** ค่าเริ่มต้นของฟอร์ม */
export function initialValues(fields: FormField[]): Record<string, FormValue> {
  const v: Record<string, FormValue> = {};
  for (const f of fields) {
    if (IS_DISPLAY_ONLY.includes(f.type)) continue;
    v[f.id] = f.type === "checkbox" ? [] : "";
  }
  return v;
}

/** แปลงคำตอบเป็นข้อความอ่านง่าย (ใช้ในหน้าคำตอบ/CSV) */
export function displayValue(v: FormValue): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "ใช่" : "ไม่";
  const s = String(v);
  // ค่ารูปเป็น data URL — อย่าเทลงตาราง
  return s.startsWith("data:image/") ? "[รูปภาพ]" : s;
}

/** สร้าง CSV จากคำตอบ (escape ครบตาม RFC 4180) */
export function toCsv(rows: string[][]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

/** ลิงก์สาธารณะของฟอร์ม — ใช้ query param เพราะ static export ไม่มี dynamic route */
export function formUrl(formId: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/form/?id=${formId}`;
}
