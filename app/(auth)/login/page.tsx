"use client";
// app/(auth)/login/page.tsx
// เลย์เอาต์การ์ดกลางจอบนพื้นไล่สี — โครงเดียวกับตัวอย่างที่ให้มา
// แต่ใช้สี/ฟอนต์ของ iephoto.online (faculty #ef3961) ไม่ใช่โทนฟ้า
// กรอกแค่รหัสนักศึกษาก็พอ ระบบเติม @kmitl.ac.th ให้เอง
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useSettings } from "@/lib/settings-context";
import { Button, Alert } from "@/components/ui";
import Icon from "@/components/icon";

const DOMAIN = "@kmitl.ac.th";

/** "68030263" -> "68030263@kmitl.ac.th" · ถ้าพิมพ์เต็มมาแล้วใช้ตามนั้น */
function toEmail(input: string): string {
  const v = input.trim().toLowerCase();
  if (!v) return "";
  return v.includes("@") ? v : v + DOMAIN;
}

export default function LoginPage() {
  const router = useRouter();
  const { settings } = useSettings();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const email = useMemo(() => toEmail(account), [account]);
  const showDomainBadge = !account.includes("@");

  async function handleReset() {
    setError("");
    setInfo("");
    if (!account.trim()) return setError('กรอกรหัสนักศึกษาก่อนกด "ลืมรหัสผ่าน"');
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setInfo(`ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่ ${email} แล้ว`);
    } catch {
      setInfo("ถ้าอีเมลนี้มีในระบบ จะได้รับลิงก์ตั้งรหัสผ่านใหม่ในไม่ช้า");
    } finally {
      setResetting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!account.trim()) return setError("กรุณากรอกรหัสนักศึกษาหรืออีเมล");
    if (!password) return setError("กรุณากรอกรหัสผ่าน");

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found")
        setError("รหัสนักศึกษา/อีเมล หรือรหัสผ่านไม่ถูกต้อง");
      else if (code === "auth/invalid-email") setError("รูปแบบอีเมลไม่ถูกต้อง");
      else if (code === "auth/too-many-requests") setError("พยายามเข้าสู่ระบบมากเกินไป กรุณารอสักครู่");
      else if (code === "auth/network-request-failed") setError("เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่");
      else setError("เข้าสู่ระบบไม่สำเร็จ");
      setLoading(false);
    }
  }

  return (
    <div className="auth-bg flex min-h-screen flex-1 items-center justify-center p-5">
      <div className="auth-card animate-in w-full max-w-[26rem] rounded-[28px] p-7 sm:p-9">
        <div className="mb-6 text-center">
          <div className="auth-badge mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[18px] text-[var(--faculty)]">
            <Icon name="equipment" size={24} strokeWidth={2} />
          </div>
          <h1 className="t-title text-[var(--ink)]">เข้าสู่ระบบ</h1>
          <p className="t-body mx-auto mt-1 max-w-[19rem] text-[var(--muted-ink)]">
            {settings.siteName} · {settings.tagline}
          </p>
        </div>

        {error && <Alert onClose={() => setError("")}>{error}</Alert>}
        {info && <Alert tone="success">{info}</Alert>}

        <form onSubmit={handleSubmit} className="space-y-2.5">
          <div className="auth-field flex items-center">
            <span className="grid w-11 shrink-0 place-items-center text-[var(--muted-ink)]">
              <Icon name="user" size={18} />
            </span>
            <input
              type="text"
              inputMode="email"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="รหัสนักศึกษา"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-label="รหัสนักศึกษาหรืออีเมล KMITL"
              className="min-w-0 flex-1 bg-transparent py-3.5 pr-2 text-[16px] leading-snug outline-none placeholder:text-[var(--muted-ink)]"
              required
            />
            {showDomainBadge && (
              <span className="shrink-0 pr-4 text-sm font-medium text-[var(--muted-ink)]">{DOMAIN}</span>
            )}
          </div>

          <div className="auth-field flex items-center">
            <span className="grid w-11 shrink-0 place-items-center text-[var(--muted-ink)]">
              <Icon name="admin" size={18} />
            </span>
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="รหัสผ่าน"
              autoComplete="current-password"
              className="min-w-0 flex-1 bg-transparent py-3.5 pr-2 text-[16px] leading-snug outline-none placeholder:text-[var(--muted-ink)]"
              required
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              aria-pressed={showPw}
              className="tap grid shrink-0 place-items-center px-3 text-[var(--muted-ink)] transition hover:text-[var(--ink)]"
            >
              <Icon name={showPw ? "hide" : "show"} size={18} />
            </button>
          </div>

          <div className="flex justify-end pb-1">
            <button
              type="button"
              onClick={handleReset}
              disabled={resetting}
              className="tap text-[0.8125rem] font-medium text-[var(--muted-ink)] transition hover:text-[var(--faculty)] disabled:opacity-50"
            >
              {resetting ? "กำลังส่ง…" : "ลืมรหัสผ่าน?"}
            </button>
          </div>

          <Button type="submit" loading={loading} fullWidth size="lg" iconEnd="next">
            เข้าสู่ระบบ
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <span className="auth-divider flex-1" />
          <span className="t-caption shrink-0">หรือ</span>
          <span className="auth-divider flex-1" />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Link
            href="/book"
            className="auth-alt press flex min-h-[46px] items-center justify-center gap-2 rounded-2xl text-center text-[0.8125rem] font-semibold leading-tight"
          >
            <Icon name="studio" size={16} />
            จองไม่ต้องล็อกอิน
          </Link>
          <Link
            href="/register"
            className="auth-alt press flex min-h-[46px] items-center justify-center gap-2 rounded-2xl text-[0.8125rem] font-semibold"
          >
            <Icon name="add" size={16} />
            สมัครสมาชิก
          </Link>
        </div>

        <p className="t-caption mt-6 text-center">ใช้ได้เฉพาะอีเมล {DOMAIN} ของ สจล.</p>
      </div>
    </div>
  );
}
