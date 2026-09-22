"use client";
// lib/mail.ts — แจ้งเตือนทางอีเมล
//
// สถาปัตยกรรม: ส่งอีเมลตรงจากเบราว์เซอร์ไม่ได้ จึงให้ Cloudflare Worker iephoto-nas
// ส่งผ่าน Cloudflare Email Service จาก admin@ienas.site (โดเมนของชุมนุมเอง)
//
//   เบราว์เซอร์ → Worker /mail (ถาม NAS ว่า token นี้เป็นกรรมการจริงไหม) → ผู้รับ
//        ↓
//   mailQueue/{id} บน NAS = สมุดบันทึกว่าส่งอะไรไปแล้วบ้าง
//
// ส่งไม่ออก อีเมลจะค้างสถานะ "failed" พร้อมเหตุผลให้กรรมการเห็นในหน้าอีเมล
// — ดีกว่าเงียบหายแล้วไม่มีใครรู้
import { addDoc, collection, doc, updateDoc, serverTimestamp } from "@/lib/db/firestore";
import { db } from "@/lib/db/client";
import { currentUser } from "@/lib/db/auth";
import { WORKER_BASE } from "@/lib/notify";

export interface MailInput {
  to: string;
  subject: string;
  body: string;
  /** ประเภทการแจ้ง เช่น "assigned" "task" — ใช้ไล่ดูย้อนหลัง */
  kind: string;
  refId?: string | null;
  /** คีย์กันส่งซ้ำ kind:refId:uid:วันที่ — ตัวกวาดใช้เช็คว่าวันนี้ส่งไปแล้วหรือยัง */
  dedupeKey?: string;
  /**
   * ตัวตนผู้ส่งที่อยากให้ผู้รับเห็น (ดู lib/mail-sender.ts)
   * ที่อยู่ผู้ส่งจริงเปลี่ยนไม่ได้ ต้องเป็นโดเมนที่ยืนยันกับผู้ให้บริการแล้ว
   * เปลี่ยนได้แค่ชื่อที่แสดงกับปลายทางของการกดตอบกลับ
   */
  replyTo?: string | null;
  fromName?: string | null;
}


/**
 * หย่อนอีเมลลงคิวแล้วพยายามส่งทันที
 * ไม่ throw — การแจ้งเตือนล้มเหลวต้องไม่ทำให้การมอบหมายงานล้มตาม
 * @returns true = ส่งออกไปแล้ว · false = ค้างคิวรอคีย์
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- พารามิเตอร์เดิม (ที่อยู่ Worker ของ AI) ผู้เรียกยังส่งมา
export async function sendMail(mail: MailInput, _aiBaseUrl?: string): Promise<boolean> {
  // Worker ตรวจบทบาทกับ NAS ก่อนยอมส่ง — ไม่มี token = ส่งไม่ได้
  const me = currentUser();

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
      replyTo: mail.replyTo ?? null,
      // ใครเป็นคนสั่งส่ง — ไว้ตามรอยตอนมีคนถามว่าเมลนี้มาจากไหน
      sentById: me?.uid ?? null,
      createdAt: serverTimestamp(),
    });
  } catch {
    return false; // เขียนคิวไม่ได้ ก็ไม่ต้องพยายามส่งต่อ
  }

  try {
    const idToken = me ? await me.getIdToken() : "";
    const res = await fetch(`${WORKER_BASE}/mail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        to: mail.to.trim(),
        subject: mail.subject,
        body: mail.body,
        replyTo: mail.replyTo ?? undefined,
        fromName: mail.fromName ?? undefined,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // 404 = Worker ยังเป็นโค้ดรุ่นที่ไม่มี /send บอกตรง ๆ ดีกว่าโชว์รหัสเปล่า ๆ
      await updateDoc(doc(db, "mailQueue", ref.id), {
        status: "failed",
        error:
          res.status === 404
            ? "Worker ยังไม่มีปลายทาง /mail — รัน npm run worker:nas-deploy"
            : res.status === 401
              ? `Worker ปฏิเสธสิทธิ์ส่งอีเมล: ${text.slice(0, 160)}`
              : `${res.status} ${text.slice(0, 200)}`,
      });
      return false;
    }
    // Worker บอกมาว่าส่งตรงถึงเจ้าตัวไม่ได้ ต้องส่งต่อเข้ากล่องกลาง
    // (ยังไม่ได้ยืนยันโดเมนกับผู้ให้บริการ) — บันทึกไว้ ไม่งั้นหน้าจอจะบอกว่าถึงแล้ว
    //
    // Worker รุ่นเก่าไม่ส่งฟิลด์นี้มาเลย ต้องเก็บเป็น null (ไม่รู้) ไม่ใช่ false
    // ถ้าเก็บ false หน้าจอจะขึ้น "ถึงผู้รับแล้ว" ทั้งที่อาจเข้ากล่องกลาง
    const out = (await res.json().catch(() => ({}))) as { forwarded?: boolean };
    await updateDoc(doc(db, "mailQueue", ref.id), {
      status: "sent",
      forwarded: typeof out.forwarded === "boolean" ? out.forwarded : null,
      sentAt: serverTimestamp(),
    });
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
