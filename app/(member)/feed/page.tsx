"use client";
// app/(member)/feed/page.tsx — placeholder (Phase 3 จะเติมเต็ม)
import { useAuth } from "@/lib/firebase/auth-context";

export default function FeedPage() {
  const { profile, user } = useAuth();
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">กิจกรรมล่าสุด</h1>
      <p className="mb-6 text-sm text-neutral-500">อัปเดตการใช้งานอุปกรณ์และสตูดิโอ</p>
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-sm">
        ✅ เข้าสู่ระบบสำเร็จ — {profile?.firstName ? `สวัสดี ${profile.firstName}` : user?.email}
      </div>
    </div>
  );
}
