// lib/nav.ts — โครงเมนูของระบบ
//
// หลักการจัดหมวด: หน้าไหนที่ผู้ใช้ "ทำงานเดียวกัน" ให้อยู่หน้าเดียวกันแล้วแบ่งด้วยแท็บ
// เดิมแอดมินมีเมนู 16 รายการ สมาชิก 10 — เยอะจนหาไม่เจอ ตอนนี้เหลือ 7 / 5
//
//   แอดมิน  ภาพรวม · งาน · มอบหมาย (รวมส่งงาน) · ทรัพยากร · ทีมงาน ·
//           งานของฉัน · วันว่างของฉัน · ปฏิทิน · ตั้งค่า · โปรไฟล์
//   สมาชิก  หน้าแรก · ขอยืม · ของฉัน · ปฏิทิน · วันว่าง · ฟอร์ม · โปรไฟล์
//
// การจองทรัพยากร (อุปกรณ์ · สตูดิโอ · ตากล้อง) เป็นงานของกรรมการ ไม่ใช่ของสมาชิก
// สมาชิกเป็น "ทรัพยากร" ของงาน หน้าที่คือบอกว่าตัวเองไม่ว่างวันไหน แล้วกรรมการสั่งงาน
// ตามนั้น — ลูกค้าภายนอกยังส่งคำขอเองได้ที่หน้าสาธารณะ /book
//
// หน้าเก่าที่ถูกยุบยังเข้าถึงได้อยู่ (redirect ไปแท็บที่ถูกต้อง) — บุ๊กมาร์กและ
// ทางลัดบนโฮมสกรีนของคนที่ติดตั้ง PWA ไว้แล้วจึงไม่พัง
import type { IconName } from "@/components/icon";
import type { AppSettings, Role } from "./types";

export interface NavLink {
  href: string;
  label: string;
  icon: IconName;
  /** true = โผล่ใน dock บนมือถือ (สูงสุด 5 ช่อง) */
  primary?: boolean;
}

/**
 * เทียบ path แบบไม่สนใจ "/" ท้าย
 *
 * next.config ตั้ง trailingSlash: true (จำเป็นสำหรับ static export บน Firebase)
 * usePathname() จึงคืน "/assign/" ขณะที่ลิงก์ในเมนูเขียน "/assign"
 * เทียบด้วย === ตรง ๆ เลยไม่มีวันตรง → dock ไม่ไฮไลต์ navbar ไม่ไฮไลต์
 * และแถบย้อนกลับไม่โผล่เลยสักหน้า
 */
export function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  return norm(a) === norm(b);
}

/** ตัด "/" ท้ายและ query ออก เหลือแต่เส้นทางจริง */
export function norm(p: string | null | undefined): string {
  if (!p) return "";
  const clean = p.split("?")[0].split("#")[0];
  return clean.length > 1 ? clean.replace(/\/+$/, "") : clean;
}

export function navLinks(role: Role | null, s: AppSettings): NavLink[] {
  const isAdmin = role === "admin" || role === "super_admin";

  const member: NavLink[] = [
    { href: "/feed", label: "หน้าแรก", icon: "feed", primary: true },
    // ขอยืมอุปกรณ์ — สมาชิกทำเองได้ (ส่งคำขอ รอกรรมการอนุมัติ)
    { href: "/borrow-equipment", label: "ขอยืม", icon: "equipment", primary: true },
    { href: "/my", label: "ของฉัน", icon: "delivery", primary: true },
    { href: "/calendar", label: "ปฏิทิน", icon: "calendar", primary: true },
    { href: "/availability", label: "วันว่าง", icon: "availability" },
    { href: "/forms", label: "ฟอร์ม", icon: "form" },
    { href: "/profile", label: "โปรไฟล์", icon: "user", primary: true },
  ];

  const admin: NavLink[] = [
    { href: "/overview", label: "ภาพรวม", icon: "overview", primary: true },
    { href: "/workflow", label: "งาน", icon: "workflow", primary: true },
    // "ส่งงาน" ถูกยุบไปเป็นแท็บใน /assign แล้ว — เป็นการจ่ายงานให้คนเหมือนกัน
    { href: "/assign", label: "มอบหมาย", icon: "assign", primary: true },
    { href: "/resources", label: "ทรัพยากร", icon: "inventory", primary: true },
    { href: "/scan", label: "สถานีสแกน", icon: "equipment", primary: true },
    { href: "/labels", label: "พิมพ์ QR", icon: "form" },
    { href: "/team", label: "ทีมงาน", icon: "members", primary: true },
    // กรรมการเป็นทั้งคนสั่งงานและคนทำงาน — ต้องเข้าถึงงานของตัวเองได้เหมือนสมาชิก
    { href: "/my", label: "งานของฉัน", icon: "delivery" },
    { href: "/availability", label: "วันว่างของฉัน", icon: "availability" },
    { href: "/calendar", label: "ปฏิทิน", icon: "calendar" },
    { href: "/settings", label: "ตั้งค่า", icon: "settings" },
    { href: "/profile", label: "โปรไฟล์", icon: "user" },
  ];

  // ปิดฟีเจอร์ในหน้าตั้งค่า → เมนูหายทันที
  const enabled = (href: string): boolean => {
    if (href === "/feed") return s.featureFeed;
    if (href === "/borrow-equipment") return s.featureBorrow;
    if (href === "/assign")
      return s.featureBorrow || s.featureStudio || s.featurePhotographer || s.featureDeliveries;
    if (href === "/resources") return s.featureBorrow || s.featureStudio || s.featurePhotographer;
    // สถานีสแกน/พิมพ์ QR ใช้กับการยืมของเท่านั้น — ปิดฟีเจอร์ยืม เมนูก็หายไปด้วย
    if (href === "/scan" || href === "/labels") return s.featureBorrow;
    if (href === "/deliveries") return s.featureDeliveries;
    if (href === "/forms") return s.featureForms;
    return true;
  };

  return (isAdmin ? admin : member).filter((l) => enabled(l.href));
}

/** ช่องใน dock บนมือถือ — สูงสุด 5 ไม่งั้นเป้ากดแคบเกินนิ้วโป้ง */
export function tabLinks(role: Role | null, s: AppSettings): NavLink[] {
  return navLinks(role, s)
    .filter((l) => l.primary)
    .slice(0, 5);
}
