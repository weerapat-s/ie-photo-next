"use client";
// components/auth-guard.tsx — กันคนไม่ login / ไม่มีสิทธิ์ เข้าหน้าที่ป้องกัน
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/auth-context";
import Navbar from "./navbar";

function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center" role="status" aria-label="กำลังตรวจสอบสิทธิ์">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      <span className="sr-only">กำลังตรวจสอบสิทธิ์</span>
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
      <a href="#main-content" className="skip-link">ข้ามไปเนื้อหาหลัก</a>
      <Navbar />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 outline-none">{children}</main>
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
      <a href="#main-content" className="skip-link">ข้ามไปเนื้อหาหลัก</a>
      <Navbar />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 outline-none">{children}</main>
    </>
  );
}
