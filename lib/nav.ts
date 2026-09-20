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
import { isAdminRole } from "./roles.ts";

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
    { href: "/borrow-log", label: "ทะเบียนการยืม", icon: "inventory" },
    { href: "/labels", label: "พิมพ์ QR", icon: "form" },
    { href: "/team", label: "ทีมงาน", icon: "members", primary: true },
    { href: "/mail", label: "ส่งอีเมล", icon: "form" },
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
    if (href === "/scan" || href === "/labels" || href === "/borrow-log") return s.featureBorrow;
    // ส่งอีเมลเองต้องเปิดการแจ้งเตือนทางอีเมลไว้ ไม่งั้นท่อส่งก็ไม่ได้ตั้ง
    if (href === "/mail") return s.notifyEmail;
    if (href === "/deliveries") return s.featureDeliveries;
    if (href === "/forms") return s.featureForms;
    return true;
  };

  return (isAdmin ? admin : member).filter((l) => enabled(l.href));
}

/** ช่องใน dock บนมือถือ — สูงสุด 5 ไม่งั้นเป้ากดแคบเกินนิ้วโป้ง */
/** กลุ่มเมนูบนแถบบน (จอใหญ่) — กลุ่มที่มี children จะกลายเป็นดรอปดาวน์ */
export interface NavGroup {
  label: string;
  icon: IconName;
  /** ลิงก์เดี่ยว (ไม่มีดรอปดาวน์) */
  href?: string;
  children?: NavLink[];
}

/**
 * จัดเมนูแถบบนเป็นกลุ่ม เพื่อไม่ให้ล้นจนต้องเลื่อนแนวนอน
 * มือถือไม่ใช้ฟังก์ชันนี้ — ใช้ navLinks() แบบเรียงแบนเหมือนเดิม เพราะเมนูสไลด์เลื่อนได้อยู่แล้ว
 *
 * รวมเฉพาะหน้าที่ "ทำงานเรื่องเดียวกัน" ไว้ด้วยกัน ไม่ยุบมั่วเพื่อให้สั้นอย่างเดียว
 */
export function navGroups(role: Role | null, s: AppSettings): NavGroup[] {
  const links = navLinks(role, s);
  const pick = (...hrefs: string[]) => links.filter((l) => hrefs.includes(l.href));
  const one = (href: string): NavGroup | null => {
    const l = links.find((x) => x.href === href);
    return l ? { label: l.label, icon: l.icon, href: l.href } : null;
  };

  const groups: (NavGroup | null)[] = [];

  if (isAdminRole(role)) {
    groups.push(one("/overview"), one("/workflow"), one("/assign"));

    // ทุกอย่างที่เกี่ยวกับของ: คลัง · สแกนรับ-ส่ง · ทะเบียน · สติกเกอร์
    const equip = pick("/resources", "/scan", "/borrow-log", "/labels");
    if (equip.length) groups.push({ label: "อุปกรณ์", icon: "inventory", children: equip });

    // ทีมงาน + การติดต่อทีมงาน อยู่ด้วยกัน
    const people = pick("/team", "/mail");
    if (people.length > 1) groups.push({ label: "ทีมงาน", icon: "members", children: people });
    else groups.push(one("/team"));

    // กรรมการเป็นทั้งคนสั่งงานและคนทำงาน — ของส่วนตัวแยกออกมาไม่ให้ปนกับงานบริหาร
    const mine = pick("/my", "/availability", "/calendar");
    if (mine.length) groups.push({ label: "ของฉัน", icon: "user", children: mine });

    groups.push(one("/settings"));
  } else {
    groups.push(one("/feed"), one("/borrow-equipment"));
    const mine = pick("/my", "/my-bookings", "/availability", "/calendar");
    if (mine.length) groups.push({ label: "ของฉัน", icon: "user", children: mine });
    groups.push(one("/forms"));
  }

  return groups.filter((g): g is NavGroup => g !== null && (!!g.href || !!g.children?.length));
}

export function tabLinks(role: Role | null, s: AppSettings): NavLink[] {
  return navLinks(role, s)
    .filter((l) => l.primary)
    .slice(0, 5);
}
