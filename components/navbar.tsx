"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/auth-context";

interface NavLink {
  href: string;
  label: string;
  icon: string;
}

const MEMBER_LINKS: NavLink[] = [
  { href: "/feed", label: "ฟีด", icon: "🏠" },
  { href: "/borrow", label: "ยืมอุปกรณ์", icon: "📷" },
  { href: "/studio", label: "จองสตูดิโอ", icon: "🎬" },
  { href: "/my-tasks", label: "งานของฉัน", icon: "📋" },
  { href: "/calendar", label: "ปฏิทิน", icon: "📅" },
  { href: "/my-bookings", label: "การจองของฉัน", icon: "🗂️" },
];

const ADMIN_LINKS: NavLink[] = [
  { href: "/dashboard", label: "แดชบอร์ด", icon: "📊" },
  { href: "/bookings", label: "รายการจอง", icon: "✅" },
  { href: "/borrow", label: "ยืมอุปกรณ์", icon: "📷" },
  { href: "/studio", label: "จองสตูดิโอ", icon: "🎬" },
  { href: "/inventory", label: "คลังอุปกรณ์", icon: "📦" },
  { href: "/tasks", label: "จัดการงาน", icon: "📋" },
  { href: "/calendar", label: "ปฏิทิน", icon: "📅" },
  { href: "/users", label: "จัดการสมาชิก", icon: "👥" },
];

const activeLinkClass = "border border-primary/20 bg-primary/10 font-semibold text-primary";
const idleLinkClass = "text-muted-foreground hover:bg-accent hover:text-foreground";

export default function Navbar() {
  const { role, profile, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstMobileLinkRef = useRef<HTMLAnchorElement>(null);

  const isAdmin = role === "admin" || role === "super_admin";
  const links = isAdmin ? ADMIN_LINKS : MEMBER_LINKS;
  const primaryAction = isAdmin
    ? { href: "/bookings", label: "จัดการคิว" }
    : { href: "/borrow", label: "ยืมอุปกรณ์" };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    const frame = requestAnimationFrame(() => firstMobileLinkRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  return (
    <nav className="glass-nav sticky top-0 z-50" aria-label="เมนูหลัก">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5">
        <Link
          href={isAdmin ? "/dashboard" : "/feed"}
          className="flex shrink-0 items-center gap-2 rounded-xl px-1 py-1 text-lg font-extrabold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-base text-primary-foreground shadow-[0_5px_14px_rgba(181,31,70,.22)]"
            aria-hidden="true"
          >
            📷
          </span>
          <span className="hidden text-grad sm:inline">IE-PHOTO</span>
        </Link>

        <div className="ml-2 hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto lg:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition",
                  active ? activeLinkClass : idleLinkClass,
                ].join(" ")}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto hidden shrink-0 items-center gap-1.5 lg:flex">
          <Link href={primaryAction.href} className="btn-grad rounded-full px-3.5 py-2 text-sm font-semibold">
            {primaryAction.label}
          </Link>
          <a
            href="https://nextcloud.ienas.site/s/z6gZY5wcSiCoXBg"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="เปิดภาพกิจกรรมที่ผ่านมา"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-base text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <span aria-hidden="true">🖼️</span>
          </a>
          <a
            href="tel:0621481739"
            aria-label="โทร 062-148-1739"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-base text-emerald-600 transition hover:bg-emerald-50"
          >
            <span aria-hidden="true">📞</span>
          </a>
          <Link
            href="/profile"
            className="max-w-[7rem] truncate rounded-xl px-2.5 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            {profile?.firstName || "โปรไฟล์"}
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="shrink-0 rounded-full border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition hover:border-primary/30 hover:bg-accent hover:text-foreground"
          >
            ออกจากระบบ
          </button>
        </div>

        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="ml-auto flex h-11 w-11 items-center justify-center rounded-xl text-xl text-foreground transition hover:bg-accent lg:hidden"
          aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {open && (
        <div id="mobile-navigation" className="border-t border-border bg-card/95 px-4 py-3 shadow-lg lg:hidden">
          <div className="mx-auto max-w-6xl">
            <Link
              ref={firstMobileLinkRef}
              href={primaryAction.href}
              onClick={() => setOpen(false)}
              className="btn-grad mb-2 flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold"
            >
              {primaryAction.label}
            </Link>
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition",
                    active ? activeLinkClass : idleLinkClass,
                  ].join(" ")}
                >
                  <span aria-hidden="true">{link.icon}</span>
                  {link.label}
                </Link>
              );
            })}
            <div className="my-2 border-t border-border" />
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <span aria-hidden="true">👤</span>
              โปรไฟล์
            </Link>
            <a
              href="https://nextcloud.ienas.site/s/z6gZY5wcSiCoXBg"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <span aria-hidden="true">🖼️</span>
              ภาพกิจกรรมที่ผ่านมา
            </a>
            <a
              href="tel:0621481739"
              className="flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-emerald-700 hover:bg-emerald-50"
            >
              <span aria-hidden="true">📞</span>
              062-148-1739
            </a>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-2 min-h-11 w-full rounded-full border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
