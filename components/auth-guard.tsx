"use client";
// components/auth-guard.tsx — กันคนไม่ login / ไม่มีสิทธิ์ เข้าหน้าที่ป้องกัน
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/auth-context";
import Navbar from "./navbar";

function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-orange-500 shadow-[0_0_15px_rgba(255,91,31,0.5)]" />
    </div>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) return <Loading />;
  if (!user) return null;

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">{children}</main>
    </>
  );
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const isAdmin = role === "admin" || role === "super_admin";

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!isAdmin) router.replace("/feed");
  }, [loading, user, isAdmin, router]);

  if (loading) return <Loading />;
  if (!user || !isAdmin) return null;

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">{children}</main>
    </>
  );
}
