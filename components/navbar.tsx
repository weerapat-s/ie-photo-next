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

const SUPER_EXTRA: NavLink[] = [{ href: "/visitors", label: "ผู้เข้าชม", icon: "👁️" }];

export default function Navbar() {
  const { role, profile, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const isAdmin = role === "admin" || role === "super_admin";
  let links = isAdmin ? [...ADMIN_LINKS] : MEMBER_LINKS;
  if (role === "super_admin") links = [...ADMIN_LINKS, ...SUPER_EXTRA];

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5">
        <Link href={isAdmin ? "/dashboard" : "/feed"} className="flex items-center gap-1.5 font-semibold">
          <span className="text-lg">📷</span> IE-PHOTO
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
          <a href="tel:0969545290" className="text-sm font-medium text-green-600">
            📞 096-954-5290
          </a>
          <Link href="/profile" className="rounded-lg px-2.5 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">
            {profile?.firstName || "โปรไฟล์"}
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
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
        <div className="border-t border-neutral-200 bg-white px-4 py-2 lg:hidden">
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
          <a href="tel:0969545290" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-green-600">
            <span>📞</span> 096-954-5290
          </a>
          <button
            onClick={handleLogout}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          >
            ออกจากระบบ
          </button>
        </div>
      )}
    </nav>
  );
}
