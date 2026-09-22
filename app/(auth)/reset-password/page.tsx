"use client";
// app/(auth)/reset-password/page.tsx — ตั้งรหัสผ่านใหม่จากลิงก์ในอีเมล
// ลิงก์มาจากแม่แบบอีเมลใน nas/pb_migrations/1758480200_auth.js: /reset-password/?token=...
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { confirmPasswordReset } from "@/lib/db/auth";
import { Button, Alert } from "@/components/ui";
import Icon from "@/components/icon";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
    if (password !== confirm) return setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
    setLoading(true);
    try {
      await confirmPasswordReset(token, password);
      setDone(true);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "auth/invalid-action-code")
        setError("ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว — กลับไปหน้าเข้าสู่ระบบแล้วกด \"ลืมรหัสผ่าน?\" ใหม่");
      else if (code === "auth/weak-password") setError("รหัสผ่านสั้นหรือง่ายเกินไป");
      else if (code === "auth/network-request-failed") setError("เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่");
      else setError((err as Error).message || "ตั้งรหัสผ่านไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-bg flex min-h-screen flex-1 items-center justify-center p-5">
      <div className="auth-card animate-in w-full max-w-[26rem] rounded-[28px] p-7 sm:p-9">
        <div className="mb-6 text-center">
          <div className="auth-badge mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[18px] text-[var(--faculty)]">
            <Icon name="admin" size={24} strokeWidth={2} />
          </div>
          <h1 className="t-title text-[var(--ink)]">ตั้งรหัสผ่านใหม่</h1>
        </div>

        {!token ? (
          <Alert>ลิงก์ไม่ครบ — เปิดจากปุ่มในอีเมลอีกครั้ง หรือขอลิงก์ใหม่ที่หน้าเข้าสู่ระบบ</Alert>
        ) : done ? (
          <>
            <Alert tone="success">ตั้งรหัสผ่านใหม่แล้ว เข้าสู่ระบบด้วยรหัสใหม่ได้เลย</Alert>
            <Button fullWidth size="lg" iconEnd="next" onClick={() => router.push("/login")}>
              ไปหน้าเข้าสู่ระบบ
            </Button>
          </>
        ) : (
          <>
            {error && <Alert onClose={() => setError("")}>{error}</Alert>}
            <form onSubmit={handleSubmit} className="space-y-2.5">
              <div className="auth-field flex items-center">
                <span className="grid w-11 shrink-0 place-items-center text-[var(--muted-ink)]">
                  <Icon name="admin" size={18} />
                </span>
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)"
                  autoComplete="new-password"
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
              <div className="auth-field flex items-center">
                <span className="grid w-11 shrink-0 place-items-center text-[var(--muted-ink)]">
                  <Icon name="admin" size={18} />
                </span>
                <input
                  type={showPw ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="พิมพ์รหัสผ่านใหม่อีกครั้ง"
                  autoComplete="new-password"
                  className="min-w-0 flex-1 bg-transparent py-3.5 pr-2 text-[16px] leading-snug outline-none placeholder:text-[var(--muted-ink)]"
                  required
                />
              </div>
              <Button type="submit" loading={loading} fullWidth size="lg" iconEnd="next">
                บันทึกรหัสผ่านใหม่
              </Button>
            </form>
          </>
        )}

        <p className="t-caption mt-6 text-center">
          <Link href="/login" className="hover:text-[var(--faculty)]">
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </div>
  );
}
