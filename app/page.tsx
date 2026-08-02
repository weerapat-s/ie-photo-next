"use client";
// app/page.tsx — หน้าแรก: redirect ตามสถานะ login
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/auth-context";

export default function Home() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (role === "admin" || role === "super_admin") router.replace("/dashboard");
    else router.replace("/feed");
  }, [user, role, loading, router]);

  return (
    <div className="flex flex-1 items-center justify-center min-h-screen">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-orange-500 shadow-[0_0_15px_rgba(255,91,31,0.5)]" />
    </div>
  );
}
