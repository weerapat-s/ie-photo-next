"use client";
// app/(auth)/login/page.tsx
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    setError("");
    setInfo("");
    if (!email) return setError("กรุณากรอกอีเมลก่อนกด \"ลืมรหัสผ่าน\"");
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setInfo("ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว กรุณาตรวจสอบกล่องจดหมาย");
    } catch {
      setInfo("ถ้าอีเมลนี้มีในระบบ จะได้รับลิงก์ตั้งรหัสผ่านใหม่ในไม่ช้า");
    } finally {
      setResetting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // role อ่านจาก Firestore doc (auth-context) → ให้หน้าแรก redirect ตาม role
      router.push("/");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found")
        setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      else if (code === "auth/too-many-requests") setError("พยายามเข้าสู่ระบบมากเกินไป กรุณารอสักครู่");
      else setError("เข้าสู่ระบบไม่สำเร็จ");
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
          <h1 className="text-xl font-semibold text-slate-100">เข้าสู่ระบบ</h1>
          <p className="text-sm text-slate-400">ยินดีต้อนรับกลับสู่ IE-Photo</p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">⚠️ {error}</div>
        )}
        {info && (
          <div className="mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 text-sm text-emerald-400">✅ {info}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">อีเมล</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="6XXXXXXX@kmitl.ac.th"
              autoComplete="username"
              className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">รหัสผ่าน</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="รหัสผ่านของคุณ"
              autoComplete="current-password"
              className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-grad w-full rounded-full py-3 text-sm font-semibold disabled:opacity-50"
          >
            {loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
          </button>
        </form>

        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className="mt-3 w-full text-center text-sm text-slate-400 hover:text-slate-200 underline disabled:opacity-50"
        >
          {resetting ? "กำลังส่ง…" : "ลืมรหัสผ่าน?"}
        </button>

        <p className="mt-5 text-center text-sm text-slate-400">
          ยังไม่มีบัญชี?{" "}
          <Link href="/register" className="font-semibold text-orange-400 hover:underline">
            สมัครสมาชิกใหม่
          </Link>
        </p>

        <div className="mt-4 border-t border-slate-800/80 pt-4 text-center">
          <p className="text-sm text-slate-400">บุคคลภายนอกต้องการจองสตูดิโอ?</p>
          <Link
            href="/book"
            className="mt-1 inline-block text-sm font-semibold text-orange-400 hover:underline"
          >
            🎬 จองได้เลยไม่ต้องเข้าสู่ระบบ →
          </Link>
        </div>
      </div>
    </div>
  );
}
