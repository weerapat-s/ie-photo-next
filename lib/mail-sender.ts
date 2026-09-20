// lib/mail-sender.ts — ใครคือ "คนส่ง" ที่ผู้รับจะเห็นในอีเมลของชุมนุม
//
// ข้อจำกัดที่เปลี่ยนไม่ได้ด้วยโค้ด:
//   ผู้ให้บริการอีเมลยอมให้ส่งจาก "ที่อยู่ของโดเมนที่ยืนยันแล้ว" เท่านั้น
//   จะใส่อีเมลนักศึกษาเป็นผู้ส่งตรง ๆ ไม่ได้ ไม่งั้นใครก็ปลอมเป็นใครก็ได้
//   (SPF/DKIM มีไว้กันเรื่องนี้โดยเฉพาะ)
//
// สิ่งที่ทำได้จริงและทำอยู่:
//   • ชื่อที่แสดง (display name) = ชื่อของคนที่ตั้งไว้ เช่น "ชื่อ นามสกุล · IE-Photo"
//   • reply_to = อีเมลของคนนั้น กดตอบกลับแล้วเข้ากล่องเขาโดยตรง
// ผู้รับจึงเห็นชื่อคนส่งถูกคน และตอบกลับได้ถูกที่ แม้ที่อยู่ผู้ส่งจะเป็นของระบบ
//
// ไฟล์นี้ตั้งใจไม่ import อะไรที่รันจริง (มีแต่ import type) เพื่อให้เทสต์
// โหลดตรง ๆ ด้วย node ได้ — ตัว hook ที่ต้องใช้ React/Firestore อยู่ในหน้าที่เรียกใช้
import type { UserDoc, WithId } from "@/lib/types";

export interface MailSender {
  /** เจอตัวคนที่ตั้งไว้ไหม — ไม่เจอ = ใช้ชื่อชุมนุมแทน และควรเตือนในหน้าจอ */
  resolved: boolean;
  /** รหัสนักศึกษาที่ตั้งไว้ในหน้าตั้งค่า */
  studentId: string;
  fromName: string;
  replyTo: string | null;
  user: WithId<UserDoc> | null;
}

/**
 * หาคนส่งจากรหัสนักศึกษาที่ตั้งไว้ใน settings
 *
 * @param nameOf ตัวจัดรูปชื่อ (ปกติส่ง displayName จาก lib/roles มา) — รับเข้ามา
 *   แทนที่จะ import เอง เพื่อให้ไฟล์นี้ไม่มี dependency ตอนรันและเทสต์ได้ตรง ๆ
 */
export function resolveMailSender(
  users: WithId<UserDoc>[],
  studentId: string,
  siteName: string,
  nameOf: (u: WithId<UserDoc>) => string
): MailSender {
  const id = (studentId || "").trim();
  // id ว่าง = ยังไม่ได้ตั้ง ต้องไม่ไปจับคนที่ studentId ว่างมาเป็นผู้ส่ง
  const user = id ? (users.find((u) => (u.studentId || "").trim() === id) ?? null) : null;

  if (!user) {
    return { resolved: false, studentId: id, fromName: siteName, replyTo: null, user: null };
  }
  return {
    resolved: true,
    studentId: id,
    fromName: `${nameOf(user)} · ${siteName}`,
    replyTo: user.email || null,
    user,
  };
}
