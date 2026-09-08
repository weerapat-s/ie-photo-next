"use client";
// components/navbar.tsx — แถบบน: โลโก้ + ลิงก์ (จอใหญ่) + เมนูสไลด์ (จอเล็ก)
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/auth-context";
import { useSettings } from "@/lib/settings-context";
import { navLinks, samePath } from "@/lib/nav";
import StaggeredMenu from "@/components/reactbits/StaggeredMenu";
import Icon from "@/components/icon";

export default function Navbar() {
  const { role, profile, signOut } = useAuth();
  const { settings } = useSettings();
  const pathname = usePathname();
  const router = useRouter();

  const isAdmin = role === "admin" || role === "super_admin";
  const links = navLinks(role, settings);
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

          {/* ลิงก์เต็มบนจอใหญ่ — จอเล็กใช้เมนูสไลด์ + แถบล่างแทน */}
          <div className="ml-3 hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar lg:flex">
            {links
              .filter((l) => l.href !== "/profile")
              .map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={samePath(pathname, l.href) ? "page" : undefined}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition ${
                    samePath(pathname, l.href)
                      ? "bg-[var(--faculty)] font-semibold text-white shadow-[0_6px_16px_rgba(239,57,97,0.28)]"
                      : "text-[var(--ink)]/75 hover:bg-black/5 hover:text-[var(--ink)]"
                  }`}
                >
                  {l.label}
                </Link>
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
