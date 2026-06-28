"use client";
// app/(admin)/dashboard/page.tsx — placeholder (Phase 4 จะเติมเต็ม)
import { useAuth } from "@/lib/firebase/auth-context";

export default function DashboardPage() {
  const { profile, role, user } = useAuth();
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">แดชบอร์ด</h1>
      <p className="mb-6 text-sm text-neutral-500">ภาพรวมระบบ</p>
      <div className="rounded-2xl border border-purple-200 bg-purple-50 p-5 text-sm">
        ✅ เข้าสู่ระบบในฐานะ <strong>{role}</strong> — {profile?.firstName || user?.email}
      </div>
    </div>
  );
}
