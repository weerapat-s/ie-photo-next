"use client";
// app/(admin)/form-builder/page.tsx — หน้านี้ถูกยุบไปรวมกับ /settings แล้ว
// เก็บไว้เป็นตัวส่งต่อ เพื่อไม่ให้บุ๊กมาร์กเดิมและทางลัดบนโฮมสกรีน (PWA) พัง
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";

export default function RedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings?tab=forms");
  }, [router]);
  return <Spinner label="กำลังพาไปหน้าใหม่…" />;
}
