// lib/db/client.ts — ตัวเชื่อม PocketBase บน NAS (แทน lib/firebase/client.ts เดิม)
//
// เว็บกับฐานข้อมูลอยู่โดเมนเดียวกัน (PocketBase เสิร์ฟหน้าเว็บจาก pb_public เอง)
// จึงใช้ "/" ได้เลย ไม่ต้องตั้ง CORS ไม่ต้องรู้ที่อยู่ล่วงหน้า
// ตอนพัฒนา (next dev ที่ localhost) ตั้ง NEXT_PUBLIC_PB_URL=https://iephoto.ienas.site ใน .env.local
import PocketBase from "pocketbase";

export const PB_URL = process.env.NEXT_PUBLIC_PB_URL || "/";

export const pb = new PocketBase(PB_URL);

// SDK ตั้งค่าเริ่มต้นให้ยกเลิกคำขอซ้ำที่ยิงพร้อมกัน — แอปนี้หลายคอมโพเนนต์ดึงตารางเดียวกันพร้อมกันจริง
pb.autoCancellation(false);

/** ตัวแทน Firestore instance — โค้ดเดิมส่ง db เข้า collection()/doc() เหมือนเดิมได้ */
export interface Firestore {
  readonly type: "firestore";
}
export const db: Firestore = { type: "firestore" };
