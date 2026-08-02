"use client";
// components/navbar.tsx — top navbar แบบ role-based + mobile toggle
import { useState } from "react";
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

export default function Navbar() {
  const { role, profile, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const isAdmin = role === "admin" || role === "super_admin";
  const links = isAdmin ? ADMIN_LINKS : MEMBER_LINKS;

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  return (
    <nav className="glass-nav sticky top-0 z-50">
      <div className="mx-auto flex max-w-6xl items-center gap-1.5 px-4 py-2.5">
        <Link
          href={isAdmin ? "/dashboard" : "/feed"}
          className="flex shrink-0 items-center gap-1.5 text-lg font-extrabold"
        >
          <span>📷</span> <span className="hidden text-grad sm:inline">IE-PHOTO</span>
        </Link>

        {/* desktop links — scroll แนวนอนแทนล้น/ตกบรรทัด */}
        <div
          className="ml-2 hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto lg:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition ${
                pathname === l.href
                  ? "font-semibold text-orange-400 bg-orange-500/10 border border-orange-500/20 shadow-[0_0_12px_rgba(255,91,31,0.2)]"
                  : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto hidden shrink-0 items-center gap-1 lg:flex">
          <a
            href="https://nextcloud.ienas.site/s/z6gZY5wcSiCoXBg"
            target="_blank"
            rel="noopener noreferrer"
            title="ภาพกิจกรรมที่ผ่านมา"
            className="rounded-lg p-2 text-base text-slate-300 hover:bg-slate-800/60 hover:text-slate-100 transition"
          >
            🖼️
          </a>
          <a href="tel:0621481739" title="โทร 062-148-1739" className="rounded-lg p-2 text-base text-emerald-400 hover:bg-slate-800/60 transition">
            📞
          </a>
          <Link
            href="/profile"
            className="max-w-[7rem] truncate rounded-lg px-2.5 py-1.5 text-sm text-slate-300 hover:bg-slate-800/60 hover:text-slate-100 transition"
          >
            {profile?.firstName || "โปรไฟล์"}
          </Link>
          <button
            onClick={handleLogout}
            className="shrink-0 rounded-full border border-slate-700/80 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-200 backdrop-blur transition hover:bg-slate-700/80 hover:border-slate-600"
          >
            ออกจากระบบ
          </button>
        </div>

        {/* mobile toggle */}
        <button onClick={() => setOpen(!open)} className="ml-auto rounded-lg p-2 text-xl text-slate-200 lg:hidden">
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* mobile menu */}
      {open && (
        <div className="glass-nav border-t border-slate-800/80 px-4 py-3 lg:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition ${
                pathname === l.href
                  ? "bg-orange-500/15 font-semibold text-orange-400 border border-orange-500/20"
                  : "text-slate-300 hover:bg-slate-800/60"
              }`}
            >
              <span>{l.icon}</span> {l.label}
            </Link>
          ))}
          <div className="my-2 border-t border-slate-800/80" />
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800/60"
          >
            <span>👤</span> โปรไฟล์
          </Link>
          <a
            href="https://nextcloud.ienas.site/s/z6gZY5wcSiCoXBg"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800/60"
          >
            <span>🖼️</span> ภาพกิจกรรมที่ผ่านมา
          </a>
          <a href="tel:0621481739" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-emerald-400">
            <span>📞</span> 062-148-1739
          </a>
          <button
            onClick={handleLogout}
            className="mt-2 w-full rounded-full border border-slate-700/80 bg-slate-800/60 px-3 py-2 text-sm text-slate-200"
          >
            ออกจากระบบ
          </button>
        </div>
      )}
    </nav>
  );
}
