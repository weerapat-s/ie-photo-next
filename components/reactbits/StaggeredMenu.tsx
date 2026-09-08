"use client";
// components/reactbits/StaggeredMenu.tsx — เมนูสไลด์เข้าเป็นชั้น ๆ (ดัดแปลงจาก React Bits)
//
// ต่างจากต้นฉบับ:
//  • ปุ่ม toggle เรนเดอร์ inline ให้แม่จัดวางเองได้ (ต้นฉบับบังคับ header absolute + โลโก้)
//  • ลิงก์ใช้ next/link → เปลี่ยนหน้าแบบ client ไม่โหลดใหม่ทั้งหน้า
//  • แผงเป็น position:fixed + portal ไป body + ล็อกสกรอลล์ตอนเปิด
//  • **อนิเมชันเป็น CSS ล้วน ไม่ใช้ GSAP** — ดูเหตุผลใน StaggeredMenu.css
//    สรุปสั้น ๆ: ถ้า requestAnimationFrame ถูกหน่วง ไทม์ไลน์ของ GSAP ไม่เดิน
//    แผงจะค้างนอกจอทั้งที่สถานะเป็น "เปิด" แล้ว — เมนูกดแล้วไม่ขึ้น
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useBrowserValue } from "@/lib/hooks";
import "./StaggeredMenu.css";

export interface StaggeredMenuItem {
  label: string;
  link: string;
  ariaLabel?: string;
  icon?: React.ReactNode;
}

export interface StaggeredMenuSocialItem {
  label: string;
  link: string;
}

interface StaggeredMenuProps {
  position?: "left" | "right";
  colors?: string[];
  items?: StaggeredMenuItem[];
  socialItems?: StaggeredMenuSocialItem[];
  displaySocials?: boolean;
  displayItemNumbering?: boolean;
  className?: string;
  accentColor?: string;
  closeOnClickAway?: boolean;
  footer?: React.ReactNode;
  onMenuOpen?: () => void;
  onMenuClose?: () => void;
}

/** ตัวแปร CSS ที่ใช้หน่วงเวลาให้แต่ละแถวไถลขึ้นมาไม่พร้อมกัน */
function staggerVar(i: number) {
  return { ["--sm-i" as string]: i } as React.CSSProperties;
}

export function StaggeredMenu({
  position = "right",
  colors = ["#ffd9e1", "#ef3961"],
  items = [],
  socialItems = [],
  displaySocials = true,
  displayItemNumbering = true,
  className,
  accentColor = "#ef3961",
  closeOnClickAway = true,
  footer,
  onMenuOpen,
  onMenuClose,
}: StaggeredMenuProps) {
  const [open, setOpen] = useState(false);
  // portal ได้ต่อเมื่ออยู่ฝั่ง client แล้ว — อ่านผ่าน store ภายนอกแทน setState ใน effect
  const readMounted = useCallback(() => true, []);
  const mounted = useBrowserValue(readMounted, false);
  const panelRef = useRef<HTMLElement | null>(null);
  const toggleBtnRef = useRef<HTMLButtonElement | null>(null);

  const closeMenu = useCallback(() => {
    setOpen((was) => {
      if (was) onMenuClose?.();
      return false;
    });
  }, [onMenuClose]);

  const toggleMenu = useCallback(() => {
    setOpen((was) => {
      if (was) onMenuClose?.();
      else onMenuOpen?.();
      return !was;
    });
  }, [onMenuOpen, onMenuClose]);

  // ล็อกสกรอลล์พื้นหลัง + ปิดด้วย Escape ตอนเมนูเปิด
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, closeMenu]);

  // จอกว้างขึ้นจนปุ่มเมนูถูกซ่อน (เช่น lg:hidden) — ต้องปิดเอง ไม่งั้น body ค้าง overflow:hidden
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      if (toggleBtnRef.current && toggleBtnRef.current.offsetParent === null) closeMenu();
    };
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, [open, closeMenu]);

  useEffect(() => {
    if (!closeOnClickAway || !open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(t) &&
        toggleBtnRef.current &&
        !toggleBtnRef.current.contains(t)
      ) {
        closeMenu();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeOnClickAway, open, closeMenu]);

  const layerColors = (() => {
    const raw = colors && colors.length ? colors.slice(0, 4) : ["#ffd9e1", "#ef3961"];
    const arr = [...raw];
    if (arr.length >= 3) arr.splice(Math.floor(arr.length / 2), 1);
    return arr;
  })();

  return (
    <div
      className={`staggered-menu-wrapper inline-flex items-center ${className ?? ""}`}
      style={{ ["--sm-accent" as string]: accentColor } as React.CSSProperties}
      data-position={position}
      data-open={open || undefined}
    >
      <button
        ref={toggleBtnRef}
        className="sm-toggle tap"
        aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
        aria-expanded={open}
        aria-controls="staggered-menu-panel"
        onClick={toggleMenu}
        type="button"
      >
        <span className="sm-toggle-textWrap" aria-hidden="true">
          <span className="sm-toggle-textInner">
            <span className="sm-toggle-line">เมนู</span>
            <span className="sm-toggle-line">ปิด</span>
          </span>
        </span>
        <span className="sm-icon" aria-hidden="true">
          <span className="sm-icon-line" />
          <span className="sm-icon-line sm-icon-line-v" />
        </span>
      </button>

      {/* แผงเมนูต้องอยู่ใต้ <body> ตรง ๆ ไม่งั้น backdrop-filter ของแถบนำทาง
          จะกลายเป็น containing block ของ position:fixed ทำให้แผงสูงเท่าแถบนำทาง
          แทนที่จะเต็มจอ (บั๊กที่เห็นเป็นกล่องเล็ก ๆ มุมขวาบนทับเนื้อหา) */}
      {mounted &&
        createPortal(
          <div
            className="staggered-menu-portal"
            style={{ ["--sm-accent" as string]: accentColor } as React.CSSProperties}
            data-position={position}
            data-open={open || undefined}
          >
            <div className="sm-overlay" data-open={open || undefined} onClick={closeMenu} aria-hidden="true" />

            <div className="sm-prelayers" aria-hidden="true">
              {layerColors.map((c, i) => (
                <div key={i} className="sm-prelayer" style={{ background: c }} />
              ))}
            </div>

            <aside
              id="staggered-menu-panel"
              ref={panelRef as React.RefObject<HTMLElement>}
              className="staggered-menu-panel"
              aria-hidden={!open}
            >
              {/* ปุ่มปิดในแผงเอง — ปุ่ม toggle ในแถบนำทางถูกแผงบังอยู่
                  (แถบนำทางมี backdrop-filter จึงเป็น stacking context ยกซ้อนแผงไม่ได้) */}
              <button
                type="button"
                className="sm-close tap"
                aria-label="ปิดเมนู"
                onClick={closeMenu}
                tabIndex={open ? undefined : -1}
              >
                <span className="sm-close-line" />
                <span className="sm-close-line sm-close-line-v" />
              </button>

              <div className="sm-panel-inner">
                <ul className="sm-panel-list" role="list" data-numbering={displayItemNumbering || undefined}>
                  {items.length ? (
                    items.map((it, idx) => (
                      <li className="sm-panel-itemWrap" key={it.link + idx} style={staggerVar(idx)}>
                        <Link
                          className="sm-panel-item"
                          href={it.link}
                          aria-label={it.ariaLabel ?? it.label}
                          data-index={idx + 1}
                          tabIndex={open ? undefined : -1}
                          onClick={closeMenu}
                        >
                          <span className="sm-panel-itemLabel">{it.label}</span>
                        </Link>
                      </li>
                    ))
                  ) : (
                    <li className="sm-panel-itemWrap" aria-hidden="true">
                      <span className="sm-panel-item">
                        <span className="sm-panel-itemLabel">ไม่มีเมนู</span>
                      </span>
                    </li>
                  )}
                </ul>

                {displaySocials && socialItems.length > 0 && (
                  <div className="sm-socials" aria-label="ช่องทางติดต่อ">
                    <h3 className="sm-socials-title">ติดต่อ</h3>
                    <ul className="sm-socials-list" role="list">
                      {socialItems.map((s, i) => (
                        <li key={s.label + i} className="sm-socials-item" style={staggerVar(i)}>
                          <a
                            href={s.link}
                            target={s.link.startsWith("http") ? "_blank" : undefined}
                            rel="noopener noreferrer"
                            className="sm-socials-link"
                            tabIndex={open ? undefined : -1}
                          >
                            {s.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {footer && <div className="sm-panel-footer">{footer}</div>}
              </div>
            </aside>
          </div>,
          document.body
        )}
    </div>
  );
}

export default StaggeredMenu;
