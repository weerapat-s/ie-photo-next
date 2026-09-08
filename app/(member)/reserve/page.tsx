"use client";
// app/(member)/reserve/page.tsx — หน้า "จองใช้บริการ" เดิม
//
// การจองทรัพยากรย้ายไปเป็นงานของกรรมการแล้ว (/assign "มอบหมายงาน")
// เก็บ path เดิมไว้เป็นตัวส่งต่อ เพื่อไม่ให้บุ๊กมาร์กและทางลัด PWA พัง
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useAuth } from "@/lib/firebase/auth-context";
import { isAdminRole } from "@/lib/roles";
import { Spinner } from "@/components/ui";

export default function ReserveRedirect() {
  return (
    <Suspense fallback={<Spinner />}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const router = useRouter();
  const params = useSearchParams();
  const { role, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (isAdminRole(role)) {
      const tab = params.get("tab");
      router.replace(tab ? `/assign?tab=${tab}` : "/assign");
    } else {
      // สมาชิกจองเองไม่ได้แล้ว — พาไปหน้าที่ยังทำได้จริง
      router.replace("/availability");
    }
  }, [loading, role, params, router]);

  return <Spinner label="กำลังพาไปหน้าใหม่…" />;
}
