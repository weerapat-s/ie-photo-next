"use client";
// app/(member)/availability/page.tsx — บอกกรรมการว่าไม่ว่างวันไหน
//
// นี่คือหน้าที่หลักของสมาชิกในระบบใหม่: ไม่ต้องแย่งกันจอง แค่กันวันที่ติดธุระไว้
// วันที่ไม่ได้กัน = ว่าง กรรมการมอบหมายงานได้ทันทีโดยไม่ต้องถามซ้ำ
import AvailabilityPanel from "@/components/panels/availability-panel";
import { PageHeader } from "@/components/ui";

export default function AvailabilityPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="ตารางของฉัน"
        title="วันที่ไม่ว่าง"
        subtitle="กันวันไหนไว้ = ปิดรับงานวันนั้น ทั้งการมอบหมายและการกดรับงานเอง"
      />
      <AvailabilityPanel />
    </div>
  );
}
