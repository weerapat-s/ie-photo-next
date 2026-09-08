"use client";
// components/dock.tsx — Dock ลอยสำหรับมือถือ (แทนแถบเต็มความกว้างแบบเดิม)
//
// ทำไมเป็น dock ลอย ไม่ใช่แถบเต็มขอบ:
//   • เนื้อหาไหลต่อไปใต้ dock เห็นว่ายังมีของอยู่ข้างล่าง ไม่ถูกตัดจบห้วน ๆ
//   • ลอยขึ้นมาจากขอบล่าง = พ้นแถบ home indicator ของ iPhone กดไม่พลาด
//   • เลื่อนลงแล้วหุบตัวลง เลื่อนขึ้นแล้วโผล่ — คืนพื้นที่จอตอนอ่านเนื้อหายาว
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/firebase/auth-context";
import { useSettings } from "@/lib/settings-context";
import { samePath, tabLinks } from "@/lib/nav";
import Icon from "@/components/icon";

export default function Dock() {
  const { role } = useAuth();
  const { settings } = useSettings();
  const pathname = usePathname();
  const links = tabLinks(role, settings);

  // ซ่อนตอนเลื่อนลง โผล่ตอนเลื่อนขึ้น (คืนพื้นที่จอเวลาอ่านรายการยาว ๆ)
  //
  // เกณฑ์ต้องหลวมกว่าที่คิด: iOS Safari ยิง scroll ระหว่างดีดตัว (rubber-band)
  // และตอนแถบเครื่องมือยุบ/ขยาย ถ้าไวเกินไป dock จะกระพริบหนี ทำให้ "กดติดบ้างไม่ติดบ้าง"
  // — นิ้วกดตอนมันกำลังเลื่อนหนีพอดี
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY.current;
      if (Math.abs(dy) < 24) return; // ต่ำกว่านี้ถือว่าสั่น ไม่ใช่ตั้งใจเลื่อน
      const atBottom = y + window.innerHeight >= document.body.scrollHeight - 120;
      // ใกล้ท้ายหน้าอย่าซ่อน — ตรงนั้นคือที่ที่คนกำลังจะกดเมนู
      setHidden(dy > 0 && y > 160 && !atBottom);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (links.length === 0) return null;

  return (
    <nav
      aria-label="เมนูหลัก"
      className="fixed inset-x-0 bottom-0 z-[95] flex justify-center px-3 lg:hidden"
      style={{
        // เว้นจากขอบล่างให้พ้นแถบเครื่องมือของ Safari — 10px เดิมน้อยไป
        // นิ้วที่กดขอบล่างสุดมักโดนเบราว์เซอร์ดักไปก่อน
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 18px)",
        transform: hidden ? "translateY(140%)" : "translateY(0)",
        transition: "transform .32s cubic-bezier(0.16, 1, 0.3, 1)",
        // ตอนซ่อนต้องไม่ดักการกดค้างไว้ที่ตำแหน่งเดิม
        pointerEvents: hidden ? "none" : "auto",
      }}
    >
      <ul className="dock-shell flex w-full max-w-md items-stretch gap-0.5 rounded-[22px] p-1.5">
        {links.map((l) => {
          const active = samePath(pathname, l.href);
          return (
            <li key={l.href} className="min-w-0 flex-1">
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`
                  dock-item press relative flex h-[58px] flex-col items-center justify-center gap-1
                  rounded-[16px] px-0.5
                  ${active ? "is-active text-white" : "text-[var(--muted-ink)]"}
                `}
              >
                {/* พื้นหลังเป็นชั้นแยก เพื่อให้ย่อ/ขยายได้โดยไม่ดึงข้อความไปด้วย */}
                <span aria-hidden className="dock-pill" />
                <Icon
                  name={l.icon}
                  size={24}
                  strokeWidth={active ? 2.3 : 2}
                  className="dock-icon relative z-10"
                />
                <span
                  className={`relative z-10 w-full truncate text-center text-[10.5px] leading-none ${
                    active ? "font-bold" : "font-semibold"
                  }`}
                >
                  {l.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
