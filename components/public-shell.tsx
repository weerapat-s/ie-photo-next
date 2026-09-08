"use client";
// components/public-shell.tsx — โครงหน้าสาธารณะ (ไม่ต้องล็อกอิน): /book, /form
import Link from "next/link";
import { useSettings } from "@/lib/settings-context";
import Icon from "@/components/icon";

export default function PublicShell({
  children,
  maxWidth = "max-w-5xl",
}: {
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const { settings } = useSettings();
  const tel = settings.contactPhone.replace(/-/g, "");

  return (
    <div className="flex min-h-screen flex-col">
      {settings.announcement && (
        <div className="bg-[var(--faculty)] px-4 py-2 text-center text-xs font-semibold text-white">
          {settings.announcement}
        </div>
      )}

      <header className="glass-nav sticky top-0 z-[90]" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <Link href="/" className="press flex items-center gap-2 text-lg font-extrabold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--faculty)] text-white">
              <Icon name="equipment" size={16} strokeWidth={2.2} />
            </span>
            <span className="text-gradient">{settings.siteName.toUpperCase()}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <a
              href={`tel:${tel}`}
              className="press tap hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-[var(--tone-ok-ink)] hover:bg-black/5 sm:inline-flex"
            >
              <Icon name="phone" size={16} />
              {settings.contactPhone}
            </a>
            <a
              href={`tel:${tel}`}
              aria-label={`โทร ${settings.contactPhone}`}
              className="press tap grid place-items-center rounded-full text-[var(--tone-ok-ink)] sm:hidden"
            >
              <Icon name="phone" size={20} />
            </a>
            <Link href="/login" className="btn-glass press rounded-full px-3.5 py-1.5 text-sm font-semibold">
              เข้าสู่ระบบ
            </Link>
          </div>
        </div>
      </header>

      <main
        className={`mx-auto w-full ${maxWidth} flex-1 px-4 py-7`}
        style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
      >
        {children}
      </main>

      <footer className="border-t border-black/6 px-4 py-6 text-center text-xs text-[var(--muted-ink)]">
        {settings.siteName} · {settings.tagline}
        <br />
        <a href={`mailto:${settings.contactEmail}`} className="text-[var(--faculty)]">
          {settings.contactEmail}
        </a>
      </footer>
    </div>
  );
}
