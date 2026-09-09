"use client";
// lib/qr.ts — รูปแบบข้อมูลใน QR ของระบบยืมของ
//
// ใส่ prefix ไว้กัน QR ของระบบอื่น (สลิปธนาคาร, บัตรงาน ฯลฯ) หลุดเข้ามาแล้วระบบเข้าใจผิด
//   อุปกรณ์/กุญแจ : IEP-E:CAM-001
//   สมาชิก        : IEP-M:M7K2QX9A
//
// หมายเหตุความปลอดภัย: memberCode เป็นแค่ "ตัวชี้ตัวคน" ไม่ใช่รหัสผ่าน
// ทุกการส่งมอบ/รับคืนยังต้องให้แอดมินที่ล็อกอินอยู่เป็นคนกดยืนยันเสมอ

export const EQUIPMENT_PREFIX = "IEP-E:";
export const MEMBER_PREFIX = "IEP-M:";
/** คำขอยืม 1 ใบ (รวมหลายชิ้นที่กดพร้อมกัน) */
export const REQUEST_PREFIX = "IEP-R:";

export type ScanResult =
  | { kind: "equipment"; code: string }
  | { kind: "member"; code: string }
  | { kind: "request"; code: string }
  | { kind: "unknown"; raw: string };

/** สร้างเนื้อหา QR ของอุปกรณ์ */
export function equipmentQrPayload(code: string): string {
  return EQUIPMENT_PREFIX + code.trim().toUpperCase();
}

/** สร้างเนื้อหา QR ของคำขอยืม — เก็บแค่รหัสอ้างอิง ข้อมูลจริงดึงจาก Firestore ตอนสแกน
 *  (ไม่ยัดข้อมูลลง QR เพราะปลอมได้ และ QR เก็บข้อความไทยยาวๆ ไม่ไหว) */
export function requestQrPayload(requestId: string): string {
  return REQUEST_PREFIX + requestId.trim().toUpperCase();
}

/** สุ่มรหัสคำขอ */
export function generateRequestId(): string {
  return generateMemberCode(12);
}

/** สร้างเนื้อหา QR ประจำตัวสมาชิก */
export function memberQrPayload(memberCode: string): string {
  return MEMBER_PREFIX + memberCode.trim().toUpperCase();
}

/**
 * อ่านค่าที่สแกนได้ → บอกว่าเป็นของอุปกรณ์ หรือของสมาชิก
 * รองรับกรณีพิมพ์รหัสเปล่าๆ เองด้วย (ไม่มี prefix) → เดาว่าเป็นรหัสอุปกรณ์
 */
export function parseScan(raw: string): ScanResult {
  const value = raw.trim();
  const upper = value.toUpperCase();

  if (upper.startsWith(EQUIPMENT_PREFIX)) {
    const code = upper.slice(EQUIPMENT_PREFIX.length).trim();
    return code ? { kind: "equipment", code } : { kind: "unknown", raw: value };
  }
  if (upper.startsWith(REQUEST_PREFIX)) {
    const code = upper.slice(REQUEST_PREFIX.length).trim();
    return code ? { kind: "request", code } : { kind: "unknown", raw: value };
  }
  if (upper.startsWith(MEMBER_PREFIX)) {
    const code = upper.slice(MEMBER_PREFIX.length).trim();
    return code ? { kind: "member", code } : { kind: "unknown", raw: value };
  }
  // พิมพ์รหัสอุปกรณ์เองโดยไม่มี prefix (ช่องสำรองตอนกล้องใช้ไม่ได้)
  if (/^[A-Z0-9][A-Z0-9-]{1,29}$/.test(upper)) {
    return { kind: "equipment", code: upper };
  }
  return { kind: "unknown", raw: value };
}

// ตัดอักษรที่อ่านสับสน (0/O, 1/I/L) ออก — กันคนอ่านผิดตอนพิมพ์รหัสเอง
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** สุ่ม memberCode สำหรับ QR ประจำตัว (เดาไม่ได้ ต่างจากรหัสนักศึกษา) */
export function generateMemberCode(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

/** เดารหัสอุปกรณ์จากประเภท เช่น camera → CAM-007 (แค่ค่าเริ่มต้น แอดมินแก้ได้) */
export function suggestEquipmentCode(type: string, existingCodes: string[]): string {
  const prefixByType: Record<string, string> = {
    camera: "CAM",
    lens: "LEN",
    accessory: "ACC",
    memory: "MEM",
    key: "KEY",
  };
  const prefix = prefixByType[type] || "ITM";
  let max = 0;
  for (const c of existingCodes) {
    const m = /^([A-Z]+)-(\d+)$/.exec((c || "").toUpperCase());
    if (m && m[1] === prefix) max = Math.max(max, Number(m[2]));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}
