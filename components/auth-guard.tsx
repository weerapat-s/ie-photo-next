"use client";
// components/auth-guard.tsx — กันคนไม่ login / ไม่มีสิทธิ์ เข้าหน้าที่ป้องกัน
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/auth-context";
import Navbar from "./navbar";
import Dock from "./dock";
import { AssistantProvider } from "./ai/assistant-context";
import ProfileGate from "./profile-gate";
import ReminderSweep from "./reminder-sweep";
import BackBar from "./back-bar";
import { usePathname } from "next/navigation";
import { norm } from "@/lib/nav";

function Loading() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center">
      <div className="ring-spin h-9 w-9 rounded-full border-[3px] border-black/8 border-t-[var(--faculty)]" />
    </div>
  );
}

/**
 * จำหน้าที่เพิ่งออกมา เพื่อให้ปุ่มย้อนกลับรู้ว่าควรพากลับไปไหน
 * ใช้ sessionStorage ไม่ใช่ history.back() เพราะ back อาจพาออกนอกแอปไปเลย
 * ถ้าผู้ใช้เปิดหน้านั้นมาจากลิงก์ตรงหรือจากอีเมล
 */
function TrackPath() {
  const pathname = norm(usePathname());
  useEffect(() => {
    try {
      const prev = sessionStorage.getItem("iephoto:currentPath");
      if (prev && prev !== pathname) sessionStorage.setItem("iephoto:prevPath", prev);
      sessionStorage.setItem("iephoto:currentPath", pathname);
    } catch {
      /* โหมดส่วนตัวเขียนไม่ได้ — ปุ่มย้อนกลับจะถอยไปใช้หน้าแม่แทน */
    }
  }, [pathname]);
  return null;
}

function Shell({ children, assistant = false }: { children: React.ReactNode; assistant?: boolean }) {
  return (
    <>
      <Navbar />
      <main className="pb-dock mx-auto w-full max-w-6xl flex-1 px-4 py-5 lg:pb-10">
        <TrackPath />
        <BackBar />
        {/* ผู้ช่วย AI สั่งงานระบบได้ จึงครอบเฉพาะฝั่งกรรมการ */}
        {assistant ? <AssistantProvider>{children}</AssistantProvider> : children}
      </main>
      <Dock />
      {/* ส่งอีเมลเตือนของที่ถึงกำหนด — ทำงานเงียบ ๆ ไม่เรนเดอร์อะไร */}
      {assistant && <ReminderSweep />}
    </>
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
    <ProfileGate>
      <Shell>{children}</Shell>
    </ProfileGate>
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
    <ProfileGate>
      <Shell assistant>{children}</Shell>
    </ProfileGate>
  );
}
