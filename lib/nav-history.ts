"use client";
// lib/nav-history.ts — จำ "หน้าก่อนหน้า" ไว้เอง พร้อมแจ้งผู้ฟังเมื่อเปลี่ยน
//
// ทำไมไม่อ่าน sessionStorage ตรง ๆ ในคอมโพเนนต์:
// ตัวจดจำเขียนค่าใน useEffect (หลัง render) ส่วนแถบย้อนกลับอ่านตอน render
// จึงได้ค่าเก่าค้างไปหนึ่งจังหวะเสมอ — ปุ่มย้อนกลับเลยไม่โผล่ หรือชี้ผิดหน้า
// เก็บไว้ในโมดูลแล้วแจ้ง subscriber ทำให้อ่านตอน render ได้ค่าล่าสุดจริง
//
// ทำไมไม่ใช้ history.back(): ถ้าเข้าหน้านั้นมาจากลิงก์ตรง/อีเมล back จะพาออกนอกแอปไปเลย
const KEY_CUR = "iephoto:currentPath";
const KEY_PREV = "iephoto:prevPath";

let current: string | null = null;
let prev: string | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

/** ดึงค่าที่ค้างจากรอบก่อน (รอดข้ามการรีเฟรช) ครั้งแรกที่ถูกเรียก */
function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    current = sessionStorage.getItem(KEY_CUR);
    prev = sessionStorage.getItem(KEY_PREV);
  } catch {
    /* โหมดส่วนตัวอ่านไม่ได้ — ถือว่ายังไม่มีประวัติ */
  }
}

/** บันทึกว่าตอนนี้อยู่หน้าไหน — เรียกทุกครั้งที่ path เปลี่ยน */
export function recordPath(path: string) {
  hydrate();
  if (current === path) return;
  if (current) prev = current;
  current = path;
  try {
    if (prev) sessionStorage.setItem(KEY_PREV, prev);
    sessionStorage.setItem(KEY_CUR, current);
  } catch {
    /* เขียนไม่ได้ก็ยังใช้ค่าในหน่วยความจำต่อได้ */
  }
  for (const fn of listeners) fn();
}

export function subscribePath(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** หน้าก่อนหน้า — คืนสตริงเดิมเสมอถ้าไม่เปลี่ยน (ปลอดภัยกับ useSyncExternalStore) */
export function getPrevPath(): string | null {
  hydrate();
  return prev;
}
