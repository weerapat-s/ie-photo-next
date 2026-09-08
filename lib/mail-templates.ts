// lib/mail-templates.ts — แม่แบบอีเมลแจ้งเตือนทุกเหตุการณ์
//
// หลักที่ยึด:
//  • หัวเรื่องบอกให้จบในบรรทัดเดียว — คนอ่านบนมือถือเห็นแค่บรรทัดนั้น
//  • ย่อหน้าแรกตอบว่า "ต้องทำอะไร เมื่อไหร่" ไม่ต้องเลื่อนอ่าน
//  • ปิดท้ายด้วยลิงก์ไปหน้าที่ทำงานนั้นได้เลย ไม่ใช่หน้าแรก
//  • ข้อความล้วน ไม่ใช้ HTML — กันลิงก์หลอกและอ่านได้ทุกแอปเมล
//
// ไฟล์นี้ไม่ import อะไรเลย เพื่อให้สคริปต์ทดสอบเรียกได้ตรง ๆ

const SITE = "https://iephoto.web.app";

export interface MailTemplate {
  subject: string;
  body: string;
}

/** เหตุการณ์ทั้งหมดที่ระบบส่งอีเมล — คู่กับฟิลด์ kind ใน mailQueue */
export type MailKind =
  | "borrow_approved"
  | "borrow_due_soon"
  | "borrow_overdue"
  | "borrow_returned"
  | "assigned"
  | "job_soon"
  | "task_new"
  | "task_due_soon"
  | "delivery_due"
  | "booking_approved"
  | "booking_rejected";

interface Base {
  /** ชื่อเล่นหรือชื่อจริงของผู้รับ */
  name: string;
  siteName: string;
}

function wrap(name: string, siteName: string, lines: (string | false | null | undefined)[], link: string): string {
  return [
    `สวัสดี ${name}`,
    "",
    ...lines.filter((l): l is string => !!l),
    "",
    `เปิดดูในระบบ: ${link}`,
    "",
    "— อีเมลฉบับนี้ส่งอัตโนมัติจากระบบ ไม่ต้องตอบกลับ",
    `${siteName} · ชุมนุมถ่ายภาพวิศวกรรมอุตสาหการ สจล.`,
  ].join("\n");
}

/* ═══ อุปกรณ์ ═════════════════════════════════════════════════ */

export function borrowApproved(
  i: Base & { items: string; from: string; until: string; note?: string | null }
): MailTemplate {
  return {
    subject: `[${i.siteName}] อนุมัติให้ยืมแล้ว: ${i.items}`,
    body: wrap(
      i.name,
      i.siteName,
      [
        `คำขอยืมอุปกรณ์ของคุณได้รับอนุมัติแล้ว`,
        "",
        `อุปกรณ์: ${i.items}`,
        `รับได้ตั้งแต่: ${i.from}`,
        `ต้องคืนภายใน: ${i.until}`,
        i.note ? `หมายเหตุจากกรรมการ: ${i.note}` : null,
        "",
        "สิ่งที่ต้องทำ:",
        "1. ตรวจสภาพอุปกรณ์ตอนรับ ถ้ามีรอยหรือชำรุด ถ่ายรูปแจ้งกรรมการทันที",
        "2. ถึงกำหนดคืน กดปุ่ม “คืนอุปกรณ์” ในระบบพร้อมแนบรูปสภาพอุปกรณ์",
        "3. คืนช้าโดยไม่แจ้ง มีผลต่อสิทธิ์ยืมครั้งถัดไป",
      ],
      `${SITE}/my`
    ),
  };
}

export function borrowDueSoon(i: Base & { items: string; until: string; hoursLeft: number }): MailTemplate {
  return {
    subject: `[${i.siteName}] ใกล้ครบกำหนดคืน (${i.hoursLeft} ชม.): ${i.items}`,
    body: wrap(
      i.name,
      i.siteName,
      [
        `อุปกรณ์ที่คุณยืมอยู่ใกล้ครบกำหนดคืนแล้ว`,
        "",
        `อุปกรณ์: ${i.items}`,
        `กำหนดคืน: ${i.until} (เหลืออีกประมาณ ${i.hoursLeft} ชั่วโมง)`,
        "",
        "ถ้ายังใช้ไม่เสร็จ ติดต่อกรรมการเพื่อขอต่อเวลาก่อนถึงกำหนด",
        "อย่ารอให้เลยกำหนดแล้วค่อยแจ้ง เพราะอาจมีคนจองต่อจากคุณ",
      ],
      `${SITE}/my`
    ),
  };
}

export function borrowOverdue(i: Base & { items: string; until: string; daysLate: number }): MailTemplate {
  return {
    subject: `[${i.siteName}] เลยกำหนดคืนแล้ว ${i.daysLate} วัน: ${i.items}`,
    body: wrap(
      i.name,
      i.siteName,
      [
        `อุปกรณ์ที่คุณยืมเลยกำหนดคืนมาแล้ว ${i.daysLate} วัน`,
        "",
        `อุปกรณ์: ${i.items}`,
        `กำหนดคืนเดิม: ${i.until}`,
        "",
        "กรุณาคืนโดยเร็วที่สุด หรือแจ้งกรรมการว่าติดปัญหาอะไร",
        "อุปกรณ์ที่ค้างอยู่กับคุณทำให้คนอื่นที่จองไว้ใช้งานไม่ได้",
      ],
      `${SITE}/my`
    ),
  };
}

export function borrowReturned(i: Base & { items: string; by: string }): MailTemplate {
  return {
    subject: `[${i.siteName}] รับคืนอุปกรณ์เรียบร้อย: ${i.items}`,
    body: wrap(
      i.name,
      i.siteName,
      [
        `กรรมการตรวจรับอุปกรณ์คืนเรียบร้อยแล้ว รายการนี้ปิดแล้ว`,
        "",
        `อุปกรณ์: ${i.items}`,
        `ผู้ตรวจรับ: ${i.by}`,
        "",
        "ขอบคุณที่คืนตามกำหนดและดูแลของส่วนกลาง",
      ],
      `${SITE}/my`
    ),
  };
}

/* ═══ งานถ่าย ═════════════════════════════════════════════════ */

export function assigned(
  i: Base & { jobTitle: string; when: string; location?: string | null; teammates?: string; contact?: string | null }
): MailTemplate {
  return {
    subject: `[${i.siteName}] คุณได้รับมอบหมายงาน: ${i.jobTitle}`,
    body: wrap(
      i.name,
      i.siteName,
      [
        `กรรมการมอบหมายงานถ่ายให้คุณ`,
        "",
        `งาน: ${i.jobTitle}`,
        `เวลา: ${i.when}`,
        i.location ? `สถานที่: ${i.location}` : null,
        i.teammates ? `ทีมที่ไปด้วยกัน: ${i.teammates}` : null,
        i.contact ? `เบอร์ผู้ประสานงาน: ${i.contact}` : null,
        "",
        "สิ่งที่ต้องทำ:",
        "1. เช็กว่าวันเวลานี้คุณว่างจริง ถ้าติดธุระ แจ้งกรรมการทันทีเพื่อหาคนแทน",
        "2. จองอุปกรณ์ที่ต้องใช้ล่วงหน้า อย่ารอวันงาน",
        "3. ไปถึงก่อนเวลาอย่างน้อย 15 นาที",
      ],
      `${SITE}/my`
    ),
  };
}

export function jobSoon(
  i: Base & { jobTitle: string; when: string; location?: string | null; hoursLeft: number }
): MailTemplate {
  return {
    subject: `[${i.siteName}] เตือนงานพรุ่งนี้: ${i.jobTitle}`,
    body: wrap(
      i.name,
      i.siteName,
      [
        `เตือนความจำ — คุณมีงานถ่ายในอีกประมาณ ${i.hoursLeft} ชั่วโมง`,
        "",
        `งาน: ${i.jobTitle}`,
        `เวลา: ${i.when}`,
        i.location ? `สถานที่: ${i.location}` : null,
        "",
        "เช็กก่อนออกจากบ้าน: แบตกล้อง · การ์ดความจำ · เลนส์ที่ต้องใช้ · แบตสำรอง",
        "ถ้าไปไม่ได้ แจ้งกรรมการเดี๋ยวนี้ อย่ารอถึงวันงาน",
      ],
      `${SITE}/calendar`
    ),
  };
}

/* ═══ งานย่อย ═════════════════════════════════════════════════ */

export function taskNew(
  i: Base & { title: string; description?: string | null; due?: string | null; by: string }
): MailTemplate {
  return {
    subject: `[${i.siteName}] งานใหม่: ${i.title}`,
    body: wrap(
      i.name,
      i.siteName,
      [
        `${i.by} มอบหมายงานให้คุณ`,
        "",
        `งาน: ${i.title}`,
        i.description ? `รายละเอียด: ${i.description}` : null,
        i.due ? `กำหนดส่ง: ${i.due}` : "ไม่ได้กำหนดวันส่ง",
        "",
        "อัปเดตสถานะในระบบเมื่อเริ่มทำและเมื่อเสร็จ กรรมการจะได้ไม่ต้องตามถาม",
      ],
      `${SITE}/my`
    ),
  };
}

export function taskDueSoon(i: Base & { title: string; due: string; daysLeft: number }): MailTemplate {
  return {
    subject: `[${i.siteName}] ใกล้ถึงกำหนดส่ง (${i.daysLeft} วัน): ${i.title}`,
    body: wrap(
      i.name,
      i.siteName,
      [
        `งานที่คุณรับผิดชอบใกล้ถึงกำหนดส่งแล้ว`,
        "",
        `งาน: ${i.title}`,
        `กำหนดส่ง: ${i.due} (เหลืออีก ${i.daysLeft} วัน)`,
        "",
        "ถ้าทำไม่ทัน แจ้งกรรมการตั้งแต่ตอนนี้เพื่อขอต่อเวลาหรือขอคนช่วย",
      ],
      `${SITE}/my`
    ),
  };
}

/* ═══ ส่งงาน ══════════════════════════════════════════════════ */

export function deliveryDue(
  i: Base & { jobTitle: string; due: string; daysLeft: number; uploadLink: string }
): MailTemplate {
  return {
    subject: `[${i.siteName}] ถึงกำหนดส่งไฟล์: ${i.jobTitle}`,
    body: wrap(
      i.name,
      i.siteName,
      [
        `ไฟล์งานที่คุณรับผิดชอบถึงกำหนดส่งแล้ว`,
        "",
        `งาน: ${i.jobTitle}`,
        `กำหนดส่ง: ${i.due}${i.daysLeft >= 0 ? ` (เหลือ ${i.daysLeft} วัน)` : ` (เลยมาแล้ว ${-i.daysLeft} วัน)`}`,
        "",
        "ขั้นตอนส่งงาน:",
        `1. อัปไฟล์ต้นฉบับทั้งหมดขึ้นที่เก็บกลาง: ${i.uploadLink}`,
        "2. คัดลอกลิงก์โฟลเดอร์แล้ววางในระบบที่หน้าไฟล์งาน",
        "3. กดยืนยันส่ง กรรมการจะตรวจแล้วปิดงานให้",
        "",
        "ห้ามลบไฟล์ของคนอื่นในที่เก็บกลาง",
      ],
      `${SITE}/my`
    ),
  };
}

/* ═══ ผลการอนุมัติ ════════════════════════════════════════════ */

export function bookingApproved(i: Base & { what: string; when: string }): MailTemplate {
  return {
    subject: `[${i.siteName}] อนุมัติคำขอแล้ว: ${i.what}`,
    body: wrap(
      i.name,
      i.siteName,
      [`คำขอของคุณได้รับอนุมัติแล้ว`, "", `รายการ: ${i.what}`, `เวลา: ${i.when}`],
      `${SITE}/my`
    ),
  };
}

export function bookingRejected(i: Base & { what: string; reason?: string | null }): MailTemplate {
  return {
    subject: `[${i.siteName}] คำขอไม่ผ่าน: ${i.what}`,
    body: wrap(
      i.name,
      i.siteName,
      [
        `คำขอของคุณไม่ผ่านการอนุมัติ`,
        "",
        `รายการ: ${i.what}`,
        i.reason ? `เหตุผล: ${i.reason}` : "ไม่ได้ระบุเหตุผล — สอบถามกรรมการได้",
        "",
        "ถ้าต้องการใช้จริง ติดต่อกรรมการเพื่อหาเวลาหรือทางเลือกอื่น",
      ],
      `${SITE}/my`
    ),
  };
}
