"use client";
// lib/notify.ts — อีเมลแจ้งกรรมการตอนมอบหมายอุปกรณ์
//
// ส่งผ่าน Worker iephoto-nas (workers/notify.js) จาก admin@ienas.site
// ผู้รับถูกล็อกไว้ฝั่ง Worker ไม่ได้กำหนดจากตรงนี้ — ส่งแค่ข้อมูลการมอบหมายไป
// Worker ประกอบข้อความเองและตรวจว่าคนกดเป็นกรรมการจริง
import { auth } from "@/lib/firebase/client";
import { WORKER_BASE } from "@/lib/nas";

export interface AssignedNotice {
  requestId: string;
  holderName: string;
  items: string[];
}

/**
 * ไม่ throw — อีเมลแจ้งเตือนล้มต้องไม่ทำให้การมอบหมายที่บันทึกไปแล้วดูเหมือนล้มตาม
 * คืนข้อความ error ไว้โชว์ให้กรรมการรู้ว่าเมลไม่ออก (null = ส่งสำเร็จ)
 */
export async function notifyAssigned(notice: AssignedNotice): Promise<string | null> {
  try {
    const user = auth.currentUser;
    if (!user) return "ยังไม่ได้เข้าสู่ระบบ";
    const res = await fetch(`${WORKER_BASE}/notify/assigned`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await user.getIdToken()}`,
      },
      body: JSON.stringify(notice),
    });
    if (res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return data.error || `ส่งอีเมลไม่สำเร็จ (${res.status})`;
  } catch {
    return "ติดต่อตัวส่งอีเมลไม่ได้";
  }
}

/**
 * สมาชิกส่งคำขอยืมเสร็จ → อีเมลยืนยันถึงตัวเอง + แจ้งกรรมการ
 *
 * ส่งแค่รหัสคำขอ — Worker อ่านรายการของจริงจากฐานข้อมูลเอง และส่งถึงอีเมลที่อยู่ใน
 * token ของคนล็อกอินเท่านั้น หน้าเว็บกำหนดผู้รับหรือเนื้อหาไม่ได้
 *
 * keepalive: หน้ายืมเปลี่ยนไปหน้า "ของฉัน" ทันทีหลังส่ง ให้คำขอนี้วิ่งต่อจนจบ
 * ไม่รอผล — อีเมลล้มต้องไม่ขวางการส่งคำขอยืมที่บันทึกสำเร็จไปแล้ว
 */
export async function notifyBorrowRequest(requestId: string): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) return;
    await fetch(`${WORKER_BASE}/notify/borrow-request`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await user.getIdToken()}`,
      },
      body: JSON.stringify({ requestId }),
    });
  } catch {
    // เงียบไว้ — คำขอยืมบันทึกสำเร็จแล้ว อีเมลเป็นแค่ของแถม
  }
}
