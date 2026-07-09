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
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5">
        <Link href={isAdmin ? "/dashboard" : "/feed"} className="flex items-center gap-1.5 text-lg font-extrabold">
          <span>📷</span> <span className="text-grad">IE-PHOTO</span>
        </Link>

        {/* desktop links */}
        <div className="ml-4 hidden flex-1 items-center gap-0.5 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-2.5 py-1.5 text-sm transition hover:bg-neutral-100 ${
                pathname === l.href ? "font-semibold text-orange-600" : "text-neutral-600"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <a
            href="https://immich.ienas.site/"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-2.5 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            🖼️ ภาพกิจกรรม
          </a>
          <a href="tel:0621481739" className="text-sm font-medium text-green-600">
            📞 062-148-1739
          </a>
          <Link href="/profile" className="rounded-lg px-2.5 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">
            {profile?.firstName || "โปรไฟล์"}
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-full border border-white/70 bg-white/50 px-3.5 py-1.5 text-sm backdrop-blur transition hover:bg-white/80"
          >
            ออกจากระบบ
          </button>
        </div>

        {/* mobile toggle */}
        <button onClick={() => setOpen(!open)} className="ml-auto rounded-lg p-2 text-xl lg:hidden">
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* mobile menu */}
      {open && (
        <div className="glass-nav border-t px-4 py-2 lg:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${
                pathname === l.href ? "bg-orange-50 font-semibold text-orange-600" : "text-neutral-700"
              }`}
            >
              <span>{l.icon}</span> {l.label}
            </Link>
          ))}
          <div className="my-2 border-t border-neutral-100" />
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-neutral-700"
          >
            <span>👤</span> โปรไฟล์
          </Link>
          <a
            href="https://immich.ienas.site/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-neutral-700"
          >
            <span>🖼️</span> ภาพกิจกรรมที่ผ่านมา
          </a>
          <a href="tel:0621481739" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-green-600">
            <span>📞</span> 062-148-1739
          </a>
          <button
            onClick={handleLogout}
            className="mt-1 w-full rounded-full border border-white/70 bg-white/50 px-3 py-2 text-sm"
          >
            ออกจากระบบ
          </button>
        </div>
      )}
    </nav>
  );
}
