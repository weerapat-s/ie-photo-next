"use client";
// app/(member)/borrow-equipment/page.tsx — สมาชิกขอยืมอุปกรณ์
//
// ใช้แผงเดียวกับหน้ามอบหมายของกรรมการ (BorrowPanel) แต่โหมด self:
// ยืมในนามตัวเอง สถานะ pending รอกรรมการอนุมัติ — ต่างจากฝั่งกรรมการที่ยืนยันทันที
import { PageHeader, EmptyState } from "@/components/ui";
import { useSettings } from "@/lib/settings-context";
import BorrowPanel from "@/components/panels/borrow-panel";

export default function BorrowEquipmentPage() {
  const { settings } = useSettings();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="สมาชิก"
        title="ขอยืมอุปกรณ์"
        subtitle={`เลือกอุปกรณ์ ช่วงเวลา แล้วส่งคำขอ — ยืมได้ครั้งละไม่เกิน ${settings.maxBorrowDays} วัน`}
      />
      {settings.featureBorrow ? (
        <BorrowPanel mode="self" />
      ) : (
        <EmptyState icon="ban" text="ตอนนี้ปิดรับการยืมอุปกรณ์ชั่วคราว" />
      )}
    </div>
  );
}
