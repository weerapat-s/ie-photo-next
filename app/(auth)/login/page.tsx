"use client";
// app/(auth)/login/page.tsx
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-2xl text-white">
            📷
          </div>
          <h1 className="text-xl font-semibold">เข้าสู่ระบบ</h1>
          <p className="text-sm text-neutral-500">ยินดีต้อนรับกลับสู่ IE-Photo</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">⚠️ {error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">อีเมล</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="6XXXXXXX@kmitl.ac.th"
              autoComplete="username"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">รหัสผ่าน</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="รหัสผ่านของคุณ"
              autoComplete="current-password"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-orange-500 py-2.5 text-sm font-medium text-white transition hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-neutral-500">
          ยังไม่มีบัญชี?{" "}
          <Link href="/register" className="font-semibold text-orange-600">
            สมัครสมาชิกใหม่
          </Link>
        </p>
      </div>
    </div>
  );
}
