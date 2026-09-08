"use client";
// lib/mail.ts — แจ้งเตือนทางอีเมล
//
// สถาปัตยกรรม: แอปเป็น static export ไม่มีเซิร์ฟเวอร์ของตัวเอง ส่งอีเมลตรงจาก
// เบราว์เซอร์ไม่ได้ (ต้องมีคีย์ผู้ให้บริการ ซึ่งห้ามหลุดมาฝั่ง client)
// จึงใช้ Cloudflare Worker ตัวเดิมที่ทำ proxy ให้ AI อยู่แล้วเป็นคนส่ง
//
//   เบราว์เซอร์ → Worker /send (ถือคีย์ผู้ให้บริการ) → ผู้ให้บริการอีเมล
//        ↓
//   mailQueue/{id} ใน Firestore = สมุดบันทึกว่าส่งอะไรไปแล้วบ้าง
//
// ถ้า Worker ยังไม่ได้ตั้งคีย์ อีเมลจะค้างสถานะ "queued" ให้กรรมการเห็นในหน้าตั้งค่า
// ว่ามีอะไรรอส่งอยู่ — ดีกว่าเงียบหายแล้วไม่มีใครรู้
import { addDoc, collection, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { DEFAULT_BASE_URL } from "@/lib/ai/client";

export interface MailInput {
  to: string;
  subject: string;
  body: string;
  /** ประเภทการแจ้ง เช่น "assigned" "task" — ใช้ไล่ดูย้อนหลัง */
  kind: string;
  refId?: string | null;
  /** คีย์กันส่งซ้ำ kind:refId:uid:วันที่ — ตัวกวาดใช้เช็คว่าวันนี้ส่งไปแล้วหรือยัง */
  dedupeKey?: string;
}

/** ที่อยู่ Worker /send — อิงจาก baseUrl ของ AI (Worker ตัวเดียวกัน) */
function sendUrl(aiBaseUrl?: string): string {
  const base = (aiBaseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "").replace(/\/v1$/, "");
  return `${base}/send`;
}

/**
 * หย่อนอีเมลลงคิวแล้วพยายามส่งทันที
 * ไม่ throw — การแจ้งเตือนล้มเหลวต้องไม่ทำให้การมอบหมายงานล้มตาม
 * @returns true = ส่งออกไปแล้ว · false = ค้างคิวรอคีย์
 */
export async function sendMail(mail: MailInput, aiBaseUrl?: string): Promise<boolean> {
  let ref;
  try {
    ref = await addDoc(collection(db, "mailQueue"), {
      to: mail.to.trim(),
      subject: mail.subject.slice(0, 200),
      body: mail.body.slice(0, 4000),
      status: "queued",
      kind: mail.kind,
      refId: mail.refId ?? null,
      dedupeKey: mail.dedupeKey ?? null,
      createdAt: serverTimestamp(),
    });
  } catch {
    return false; // เขียนคิวไม่ได้ ก็ไม่ต้องพยายามส่งต่อ
  }

  try {
    const res = await fetch(sendUrl(aiBaseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: mail.to.trim(), subject: mail.subject, body: mail.body }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // 404 = Worker ยังเป็นโค้ดรุ่นที่ไม่มี /send บอกตรง ๆ ดีกว่าโชว์รหัสเปล่า ๆ
      await updateDoc(doc(db, "mailQueue", ref.id), {
        status: "failed",
        error:
          res.status === 404
            ? "Worker ยังไม่มีปลายทาง /send — รัน npm run worker:deploy แล้ว npm run worker:mail"
            : `${res.status} ${text.slice(0, 200)}`,
      });
      return false;
    }
    await updateDoc(doc(db, "mailQueue", ref.id), { status: "sent", sentAt: serverTimestamp() });
    return true;
  } catch {
    await updateDoc(doc(db, "mailQueue", ref.id), {
      status: "failed",
      error: "ติดต่อตัวส่งอีเมลไม่ได้ (ยังไม่ได้ตั้งคีย์ผู้ให้บริการบน Worker?)",
    }).catch(() => {});
    return false;
  }
}

export { assigned, taskNew, borrowApproved, borrowDueSoon, borrowOverdue, borrowReturned, jobSoon, taskDueSoon, deliveryDue, bookingApproved, bookingRejected } from "./mail-templates";
export type { MailKind, MailTemplate } from "./mail-templates";
