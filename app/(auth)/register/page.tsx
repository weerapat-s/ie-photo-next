"use client";
// app/(auth)/register/page.tsx — สมัครสมาชิกด้วยอีเมล @kmitl.ac.th
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const emailValid = !email || email.toLowerCase().endsWith("@kmitl.ac.th");
  const canSubmit = email && emailValid && password.length >= 6 && password === confirm && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // กัน double-submit
    setError("");
    if (!emailValid) return setError("อนุญาตเฉพาะอีเมล @kmitl.ac.th เท่านั้น");
    if (password.length < 6) return setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
    if (password !== confirm) return setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");

    setLoading(true);
    try {
      const mail = email.trim().toLowerCase();
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
    <div className="flex-1 flex items-center justify-center p-6 min-h-screen">
      <div className="glass-card animate-in w-full max-w-sm rounded-3xl p-8 shadow-[0_25px_60px_rgba(0,0,0,0.7),0_0_30px_rgba(255,91,31,0.15)]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--orange)] to-[var(--pink)] text-2xl text-white shadow-[0_10px_30px_rgba(255,91,31,.45)]">
            📷
          </div>
          <h1 className="text-xl font-semibold text-slate-100">สมัครสมาชิก</h1>
          <p className="text-sm text-slate-400">IE-Photo Booking System</p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">⚠️ {error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">อีเมล KMITL</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="6XXXXXXX@kmitl.ac.th"
              autoComplete="username"
              className={`glass-input w-full rounded-xl px-3.5 py-2.5 text-sm ${emailValid ? "" : "!border-red-400"}`}
              required
            />
            {!emailValid && <p className="mt-1 text-xs text-red-400">ต้องเป็นอีเมล @kmitl.ac.th</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">รหัสผ่าน</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="อย่างน้อย 6 ตัวอักษร"
              autoComplete="new-password"
              className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">ยืนยันรหัสผ่าน</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="กรอกรหัสผ่านอีกครั้ง"
              autoComplete="new-password"
              className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm"
              required
            />
            {confirm && password !== confirm && (
              <p className="mt-1 text-xs text-red-400">รหัสผ่านไม่ตรงกัน</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="btn-grad w-full rounded-full py-3 text-sm font-semibold disabled:opacity-50"
          >
            {loading ? "กำลังสมัคร…" : "สมัครสมาชิก"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-400">
          มีบัญชีแล้ว?{" "}
          <Link href="/login" className="font-semibold text-orange-400 hover:underline">
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </div>
  );
}
