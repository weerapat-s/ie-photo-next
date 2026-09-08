"use client";
// lib/dev-mode.ts — โหมด dev ปลดล็อกด้วยท่าลับ
//
// ⚠️ ขอบเขตด้านความปลอดภัย (ตั้งใจออกแบบแบบนี้):
//   โหมดนี้เป็น "ชั้นการแสดงผล + ทางลัด" บนเครื่องเท่านั้น (เก็บใน localStorage)
//   มัน **ไม่ได้เพิ่มสิทธิ์จริง** ในฐานข้อมูล — ทุกการเขียนยังผ่าน firestore.rules
//   ที่เช็ค role จริงเสมอ
//
//   ดังนั้น:
//   • ประธาน/กรรมการ (super_admin/admin) เปิดโหมดนี้ = ได้ป้าย </> + ทางลัด
//     ครบทุกอย่างตามสิทธิ์ที่ตัวเองมีอยู่แล้ว
//   • สมาชิกธรรมดาเปิดโหมดนี้ = ได้แค่ป้าย cosmetic เขียนข้อมูลคนอื่นไม่ได้อยู่ดี
//
//   จงใจไม่ทำ backdoor ใน rules ที่ให้ "ใครก็ตามที่ทำท่านี้กลายเป็น god"
//   เพราะนั่นคือช่องโหว่ที่เปิดโค้ดเจอแล้วยึดทั้งระบบได้

const KEY = "iephoto:devMode";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function write(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* โหมดส่วนตัวเขียนไม่ได้ — โหมด dev ก็แค่ไม่ติดข้ามการรีเฟรช */
  }
  listeners.forEach((fn) => fn());
}

export function subscribeDevMode(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getDevMode(): boolean {
  return read();
}

export function toggleDevMode(): boolean {
  const next = !read();
  write(next);
  return next;
}

/** ป้ายยศที่แสดง — โหมด dev ขึ้น </> แทนยศจริง คนอื่นจึงเดาไม่ออกว่าเป็นยศอะไร */
export const DEV_BADGE = "</>";
