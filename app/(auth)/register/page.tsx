"use client";
// app/(auth)/register/page.tsx — สมัครสมาชิกด้วยอีเมล @kmitl.ac.th
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { useSettings } from "@/lib/settings-context";
import { Button, Field, inputClass, Alert } from "@/components/ui";
import Icon from "@/components/icon";

const DOMAIN = "@kmitl.ac.th";

/** "68030263" → "68030263@kmitl.ac.th" · ถ้าพิมพ์เต็มมาแล้วใช้ตามนั้น */
function toEmail(input: string): string {
  const v = input.trim().toLowerCase();
  if (!v) return "";
  return v.includes("@") ? v : v + DOMAIN;
}

export default function RegisterPage() {
  const router = useRouter();
  const { settings } = useSettings();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const email = useMemo(() => toEmail(account), [account]);
  const showDomainBadge = !account.includes("@");
  const emailValid = !account.trim() || email.endsWith(DOMAIN);
  const canSubmit = !!account.trim() && emailValid && password.length >= 6 && password === confirm && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // กัน double-submit
    setError("");
    if (!emailValid) return setError("อนุญาตเฉพาะอีเมล @kmitl.ac.th เท่านั้น");
    if (password.length < 6) return setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
    if (password !== confirm) return setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");

    setLoading(true);
    try {
      const mail = email;
      const cred = await createUserWithEmailAndPassword(auth, mail, password);
      // สร้าง user doc (rules อนุญาตให้สร้าง doc ตัวเอง role=member)
      await setDoc(doc(db, "users", cred.user.uid), {
        studentId: mail.split("@")[0],
        firstName: "",
        lastName: "",
        email: mail,
        phone: "",
        role: "member",
        profileImageUrl: null,
        profileCompleted: false,
        createdAt: serverTimestamp(),
      });
      router.push("/profile?first_login=1");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/email-already-in-use") setError("อีเมลนี้ถูกใช้สมัครแล้ว");
      else if (code === "auth/weak-password") setError("รหัสผ่านอ่อนเกินไป");
      else setError((err as Error).message || "สมัครไม่สำเร็จ");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center p-5">
      <div className="glass-card animate-in w-full max-w-sm rounded-[28px] p-7">
        <div className="mb-6 text-center">
          <div className="btn-grad mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl text-white">
            <Icon name="equipment" size={24} />
          </div>
          <h1 className="t-title text-[var(--ink)]">สมัครสมาชิก</h1>
          <p className="mt-0.5 text-sm text-[var(--muted-ink)]">{settings.siteName} · {settings.tagline}</p>
        </div>

        {error && <Alert onClose={() => setError("")}>{error}</Alert>}

        <form onSubmit={handleSubmit}>
          <Field
            label="รหัสนักศึกษา / อีเมล KMITL"
            required
            help={showDomainBadge ? `กรอกแค่รหัสนักศึกษา ระบบเติม ${DOMAIN} ให้อัตโนมัติ` : undefined}
            error={!emailValid ? `ต้องเป็นอีเมล ${DOMAIN}` : undefined}
          >
            <div
              className={`flex overflow-hidden rounded-2xl border bg-white/78 transition focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(239,57,97,0.16)] ${
                emailValid ? "border-black/10 focus-within:border-[var(--faculty)]" : "border-red-400"
              }`}
            >
              <input
                type="text"
                inputMode="email"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="68030263"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-label="รหัสนักศึกษาหรืออีเมล"
                className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[16px] leading-snug outline-none"
                required
              />
              {showDomainBadge && (
                <span className="grid shrink-0 place-items-center border-l border-black/8 bg-black/[0.035] px-3 text-sm font-medium text-[var(--muted-ink)]">
                  {DOMAIN}
                </span>
              )}
            </div>
          </Field>

          <Field label="รหัสผ่าน" required help="อย่างน้อย 6 ตัวอักษร">
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="อย่างน้อย 6 ตัวอักษร"
                autoComplete="new-password"
                className={`${inputClass} pr-12`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                aria-pressed={showPw}
                className="tap absolute right-1 top-1/2 grid -translate-y-1/2 place-items-center rounded-xl px-2 text-[var(--muted-ink)] transition hover:text-[var(--ink)]"
              >
                <Icon name={showPw ? "hide" : "show"} size={18} />
              </button>
            </div>
          </Field>

          <Field
            label="ยืนยันรหัสผ่าน"
            required
            error={confirm && password !== confirm ? "รหัสผ่านไม่ตรงกัน" : undefined}
          >
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="กรอกรหัสผ่านอีกครั้ง"
              autoComplete="new-password"
              className={inputClass}
              required
            />
          </Field>

          <Button type="submit" disabled={!canSubmit} loading={loading} fullWidth size="lg" className="mt-2">
            สมัครสมาชิก
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-[var(--muted-ink)]">
          มีบัญชีแล้ว?{" "}
          <Link href="/login" className="font-semibold text-[var(--faculty)] hover:underline">
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </div>
  );
}
