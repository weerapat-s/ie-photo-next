"use client";
// app/page.tsx — หน้าแรก: redirect ตามสถานะ login
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/auth-context";
import { useSettings } from "@/lib/settings-context";

export default function Home() {
  const { user, role, loading } = useAuth();
  const { settings } = useSettings();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (role === "admin" || role === "super_admin") router.replace("/dashboard");
    else router.replace(settings.featureFeed ? "/feed" : "/my-bookings");
  }, [user, role, loading, router, settings.featureFeed]);

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center">
      <div className="ring-spin h-9 w-9 rounded-full border-[3px] border-black/8 border-t-[var(--faculty)]" />
    </div>
  );
}
