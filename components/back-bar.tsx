"use client";
// components/back-bar.tsx — บอกว่าอยู่ตรงไหน และย้อนกลับไปหน้าก่อนหน้าได้
//
// ปัญหาเดิม: หน้าจอมือถือมีแต่ dock ที่ไฮไลต์เมนูหลัก แต่พอเข้าหน้าย่อย
// (ประวัติการจอง, แท็บใน /assign) ไม่มีอะไรบอกว่าอยู่ไหนและมาจากไหน
// ผู้ใช้ต้องเดาว่าจะกลับยังไง — บนเว็บที่ติดตั้งเป็น PWA ไม่มีปุ่ม back ของเบราว์เซอร์ด้วย
//
// แถบนี้จำ "หน้าก่อนหน้า" ไว้เองใน sessionStorage แทนที่จะพึ่ง history.back()
// เพราะ back อาจพาออกนอกแอปไปเลยถ้าเข้ามาจากลิงก์ตรง
import { useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/auth-context";
import { useSettings } from "@/lib/settings-context";
import { navLinks, norm, samePath } from "@/lib/nav";
import { subscribePath, getPrevPath } from "@/lib/nav-history";
import Icon from "@/components/icon";

/** ชื่อหน้าที่ไม่ได้อยู่ในเมนูหลัก — ต้องบอกเองว่าอยู่ตรงไหน */
const EXTRA_TITLES: Record<string, { label: string; parent: string }> = {
  "/my-bookings": { label: "ประวัติการจอง", parent: "/my" },
  "/borrow": { label: "ยืมอุปกรณ์", parent: "/assign" },
  "/studio": { label: "จองสตูดิโอ", parent: "/assign" },
  "/photographers": { label: "ตากล้อง", parent: "/assign" },
  "/deliveries": { label: "ส่งงาน", parent: "/assign" },
  "/my-tasks": { label: "งานของฉัน", parent: "/my" },
  "/reserve": { label: "จองใช้บริการ", parent: "/my" },
  "/form": { label: "แบบฟอร์ม", parent: "/forms" },
  "/dashboard": { label: "แดชบอร์ด", parent: "/overview" },
  "/users": { label: "สมาชิก", parent: "/team" },
  "/inventory": { label: "คลังอุปกรณ์", parent: "/resources" },
  "/crew": { label: "ทีมงาน", parent: "/resources" },
  "/tasks": { label: "งานของทีม", parent: "/team" },
  "/bookings": { label: "การจอง", parent: "/workflow" },
  "/responses": { label: "คำตอบฟอร์ม", parent: "/settings" },
  "/form-builder": { label: "สร้างฟอร์ม", parent: "/settings" },
};

export default function BackBar() {
  // ต้อง normalize ก่อนทุกครั้ง — trailingSlash ทำให้ค่าที่ได้มีขีดท้าย
  const pathname = norm(usePathname());
  const router = useRouter();
  const { role } = useAuth();
  const { settings } = useSettings();

  // subscribe จริง — พอ TrackPath บันทึกหน้าใหม่ ปุ่มนี้อัปเดตทันทีในจังหวะเดียวกัน
  const prev = useSyncExternalStore(subscribePath, getPrevPath, () => null);

  const links = navLinks(role, settings);
  const inMenu = links.find((l) => samePath(l.href, pathname));
  const extra = EXTRA_TITLES[pathname];

  // "มาจากหน้าอื่นจริง ๆ" — มี prev ที่ไม่ใช่หน้านี้เอง และไม่ใช่ราก/หน้า login/หน้า redirect
  // (กันวนลูป: /dashboard เด้งไป /overview เอง ถ้าถอยกลับไปจะเด้งกลับมาที่เดิม)
  const REDIRECT_STUBS = ["/", "/login", "/dashboard"];
  const prevN = prev ? norm(prev) : null;
  const cameFrom =
    prevN && !samePath(prevN, pathname) && !REDIRECT_STUBS.includes(prevN) ? prevN : null;

  // ไม่ต้องโชว์เมื่อ: เป็นหน้าย่อยที่ไม่รู้จัก (ไม่มี extra) และไม่ได้มาจากหน้าอื่น
  // PWA ไม่มีปุ่ม back ของเบราว์เซอร์ — หน้าเมนูหลักที่ "กดเข้ามาจากที่อื่น" ก็ควรถอยกลับได้
  if (!extra && !(inMenu && cameFrom)) return null;

  const backTo = cameFrom ?? extra?.parent ?? "/";
  const backLabel =
    links.find((l) => samePath(l.href, backTo))?.label ?? EXTRA_TITLES[backTo]?.label ?? "ย้อนกลับ";

  const goBack = () => router.push(backTo);

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={goBack}
          className="press inline-flex min-h-[40px] items-center gap-1 rounded-full pr-3 pl-2 text-sm font-semibold text-[var(--faculty)] hover:bg-black/5"
        >
          <Icon name="chevronRight" size={18} className="rotate-180" />
          {backLabel}
        </button>
        {extra && (
          <span className="t-caption flex items-center gap-1.5 truncate">
            <Icon name="chevronRight" size={16} className="opacity-40" />
            {extra.label}
          </span>
        )}
      </div>

      {/* ปุ่มลอยบนมือถือ — หน้ายาว ๆ (บอร์ดงาน/รายการ) เลื่อนลงไปแล้วแถบบนพ้นจอ
          ต้องยังกดกลับได้โดยไม่ต้องเลื่อนขึ้นสุด · ลอยเหนือ dock */}
      <button
        type="button"
        onClick={goBack}
        aria-label={`ย้อนกลับไป ${backLabel}`}
        className="press fixed left-3 z-[96] inline-flex items-center gap-1 rounded-full bg-[var(--ink)] py-2.5 pr-4 pl-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.25)] lg:hidden"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 86px)" }}
      >
        <Icon name="chevronRight" size={18} className="rotate-180" />
        กลับ
      </button>
    </>
  );
}
