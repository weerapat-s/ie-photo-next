"use client";
// app/(member)/deliveries/page.tsx — ระบบส่งงาน / ลิงก์ NAS
// แผงเดียวกับแท็บ "ไฟล์งาน" ใน /my แต่หน้านี้เป็นเมนูหลักของแอดมิน
// (แผงรู้บทบาทเอง: แอดมินเห็นทุกงาน + สร้างได้ · สมาชิกเห็นเฉพาะของตัวเอง)
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { useAuth } from "@/lib/firebase/auth-context";
import DeliveriesPanel from "@/components/panels/deliveries-panel";

export default function DeliveriesPage() {
  const { role } = useAuth();
  const router = useRouter();
  const isAdmin = role === "admin" || role === "super_admin";

  // กรรมการ: หน้านี้ถูกยุบไปเป็นแท็บใน /assign แล้ว — ส่งต่อไปที่นั่น
  // สมาชิกยังใช้หน้านี้ตามเดิม (เห็นเฉพาะงานของตัวเอง)
  useEffect(() => {
    if (isAdmin) router.replace("/assign?tab=delivery");
  }, [isAdmin, router]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={isAdmin ? "ADMIN" : "งานของคุณ"}
        title="ส่งงาน"
        subtitle={
          isAdmin
            ? "วางลิงก์ NAS ให้ทีมงานอัปไฟล์ และลิงก์ดาวน์โหลดให้ผู้รับ"
            : "ลิงก์อัปโหลดสำหรับทีมงาน และลิงก์รับไฟล์สำหรับงานที่คุณจอง"
        }
      />
      <DeliveriesPanel />
    </div>
  );
}
