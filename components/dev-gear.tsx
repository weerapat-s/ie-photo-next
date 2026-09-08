"use client";
// components/dev-gear.tsx — ปุ่มลับรูปฟันเฟือง (เฉพาะกรรมการ)
//
// ปุ่มไม่บอกอะไร สีแปลกจากธีม มี hover ตอบสนอง — ดูเหมือนของประดับ
// กดรัว 6 ครั้งติดกัน (ภายใน 2 วินาที) = สลับโหมด dev เปิด/ปิด
// เปิดแล้วยศแสดงเป็น </> ทั่วทั้งแอป และค้างข้ามการล็อกเอาต์ (เก็บบนเครื่อง)
//
// โผล่เฉพาะบัญชีที่เป็นกรรมการอยู่แล้ว — สมาชิกธรรมดาไม่เห็นปุ่มนี้
// และต่อให้เห็น ก็ปลดล็อกได้แค่ป้าย ไม่ได้สิทธิ์เขียนจริง (ดู lib/dev-mode.ts)
import { useRef, useState } from "react";
import { useAuth } from "@/lib/firebase/auth-context";
import { useDevMode } from "@/lib/hooks";
import { isAdminRole } from "@/lib/roles";
import { toggleDevMode } from "@/lib/dev-mode";
import Icon from "@/components/icon";

const NEEDED = 6;
const WINDOW_MS = 2000;

export default function DevGear() {
  const { role } = useAuth();
  const devOn = useDevMode();
  const taps = useRef<number[]>([]);
  const [flash, setFlash] = useState(false);

  // เฉพาะกรรมการ — สมาชิกธรรมดาไม่ต้องเห็นด้วยซ้ำ
  if (!isAdminRole(role)) return null;

  function tap() {
    const now = Date.now();
    // เก็บเฉพาะการกดที่อยู่ในกรอบเวลา — กดช้า ๆ ไม่นับสะสม
    taps.current = [...taps.current.filter((t) => now - t < WINDOW_MS), now];
    if (taps.current.length >= NEEDED) {
      taps.current = [];
      const on = toggleDevMode();
      setFlash(true);
      setTimeout(() => setFlash(false), 900);
      // สั่นเบา ๆ ถ้าเครื่องรองรับ — สัญญาณว่าท่าติดโดยไม่ต้องมีข้อความ
      try {
        navigator.vibrate?.(on ? [20, 40, 20] : 30);
      } catch {
        /* ไม่รองรับก็ข้าม */
      }
    }
  }

  return (
    <button
      type="button"
      onClick={tap}
      aria-hidden
      tabIndex={-1}
      className="dev-gear"
      data-on={devOn || undefined}
      data-flash={flash || undefined}
    >
      <Icon name="settings" size={18} />
    </button>
  );
}
