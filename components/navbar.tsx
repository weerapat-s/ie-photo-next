"use client";
// components/navbar.tsx — แถบบน: โลโก้ + ลิงก์ (จอใหญ่) + เมนูสไลด์ (จอเล็ก)
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/auth-context";
import { useSettings } from "@/lib/settings-context";
import { navGroups, navLinks, samePath } from "@/lib/nav";
import type { NavGroup } from "@/lib/nav";
import StaggeredMenu from "@/components/reactbits/StaggeredMenu";
import Icon from "@/components/icon";

export default function Navbar() {
  const { role, profile, signOut } = useAuth();
  const { settings } = useSettings();
  const pathname = usePathname();
  const router = useRouter();

  const isAdmin = role === "admin" || role === "super_admin";
  const links = navLinks(role, settings);
  const groups = navGroups(role, settings);
  const home = isAdmin ? "/dashboard" : settings.featureFeed ? "/feed" : "/my-bookings";

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  const socials = [
    { label: settings.contactPhone, link: `tel:${settings.contactPhone.replace(/-/g, "")}` },
    { label: "อัลบั้มกิจกรรม", link: settings.galleryUrl },
    { label: settings.contactEmail, link: `mailto:${settings.contactEmail}` },
  ].filter((s) => s.link && s.link !== "tel:" && s.link !== "mailto:");

  return (
    <>
      {settings.announcement && (
        <div className="bg-[var(--faculty)] px-4 py-2 text-center text-xs font-semibold text-white">
          {settings.announcement}
        </div>
      )}

      <nav className="glass-nav sticky top-0 z-[90]" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5">
          <Link href={home} className="press flex shrink-0 items-center gap-2 text-lg font-extrabold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--faculty)] text-white">
              <Icon name="equipment" size={16} strokeWidth={2.2} />
            </span>
            <span className="text-gradient">{settings.siteName.toUpperCase()}</span>
          </Link>

          {/* ลิงก์เต็มบนจอใหญ่ — จอเล็กใช้เมนูสไลด์ + แถบล่างแทน
              ห้ามใส่ overflow-x-auto กลับมา: ตาม CSS ถ้า overflow-x ไม่ใช่ visible
              overflow-y จะกลายเป็น auto ตาม เมนูดรอปดาวน์ที่ห้อยลงล่างจะถูกตัดทิ้ง
              กดแล้วเปิดจริงแต่มองไม่เห็น (เคยพังแบบนี้บนเว็บจริงมาแล้ว)
              ไม่ต้องมีตัวเลื่อนด้วย — ตั้งแต่รวบเป็นดรอปดาวน์ เหลือ 7 ปุ่ม กว้าง ~520px
              ที่จอแคบสุดที่แถบนี้โผล่ (1024px) ทั้งแถวใช้ ~908px ยังเหลือที่ว่าง */}
          <div className="ml-3 hidden min-w-0 flex-1 items-center gap-0.5 lg:flex">
            {groups
              .filter((g) => g.href !== "/profile")
              .map((g) => (
                <NavItem key={g.label} group={g} pathname={pathname} />
              ))}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Link
              href="/profile"
              className="press hidden max-w-[8rem] items-center gap-1.5 truncate rounded-full px-2.5 py-1.5 text-sm text-[var(--ink)]/80 transition hover:bg-black/5 lg:inline-flex"
            >
              {profile?.profileImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.profileImageUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <Icon name="user" size={16} />
              )}
              <span className="truncate">{profile?.firstName || "โปรไฟล์"}</span>
            </Link>
            <button
              onClick={handleLogout}
              className="btn-glass press hidden rounded-full px-3.5 py-1.5 text-sm font-medium lg:block"
            >
              ออกจากระบบ
            </button>

            <StaggeredMenu
              className="lg:hidden"
              items={links.map((l) => ({ label: l.label, link: l.href, ariaLabel: l.label }))}
              socialItems={socials}
              accentColor={settings.accentColor}
              colors={["#ffe4ea", settings.accentColor]}
              footer={
                <button
                  onClick={handleLogout}
                  className="btn-glass press w-full rounded-full py-3 text-sm font-semibold"
                >
                  ออกจากระบบ
                </button>
              }
            />
          </div>
        </div>
      </nav>
    </>
  );
}


/** ลิงก์เดี่ยว หรือปุ่มที่กางเมนูย่อย — ใช้เฉพาะแถบบนจอใหญ่ */
function NavItem({ group, pathname }: { group: NavGroup; pathname: string | null }) {
  // hooks ต้องถูกเรียกทุกครั้งก่อน early return — ไม่งั้นลำดับ hook เพี้ยนเมื่อสลับระหว่างลิงก์เดี่ยว/กลุ่ม
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeClass =
    "bg-[var(--faculty)] font-semibold text-white shadow-[0_6px_16px_rgba(239,57,97,0.28)]";
  const idleClass = "text-[var(--ink)]/75 hover:bg-black/5 hover:text-[var(--ink)]";
  const base = "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition";

  // ลิงก์เดี่ยว ไม่มีเมนูย่อย
  if (!group.children?.length) {
    const active = samePath(pathname, group.href);
    return (
      <Link
        href={group.href!}
        aria-current={active ? "page" : undefined}
        className={`${base} ${active ? activeClass : idleClass}`}
      >
        {group.label}
      </Link>
    );
  }

  // กลุ่ม — ถือว่า active ถ้าอยู่หน้าใดหน้าหนึ่งข้างใน
  const active = group.children.some((c) => samePath(pathname, c.href));

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`${base} inline-flex items-center gap-1 ${active ? activeClass : idleClass}`}
      >
        {group.label}
        <Icon name="chevronDown" size={14} className={open ? "rotate-180 transition" : "transition"} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 min-w-[11rem] overflow-hidden rounded-2xl border border-black/8 bg-white py-1 shadow-[0_18px_44px_rgba(52,37,46,.18)]"
        >
          {group.children.map((c) => {
            const on = samePath(pathname, c.href);
            return (
              <Link
                key={c.href}
                href={c.href}
                role="menuitem"
                aria-current={on ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 px-3.5 py-2 text-sm transition ${
                  on
                    ? "bg-[var(--faculty)]/10 font-semibold text-[var(--faculty)]"
                    : "text-[var(--ink)]/80 hover:bg-black/5"
                }`}
              >
                <Icon name={c.icon} size={16} />
                {c.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
