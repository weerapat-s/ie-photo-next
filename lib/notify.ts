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
