"use client";
// app/(member)/my-bookings/page.tsx — ประวัติการจองทั้งหมด
//
// หน้า /my โชว์เฉพาะสิ่งที่ยัง "ต้องทำ" เพื่อให้จบในหน้าเดียวโดยไม่ยาว
// ส่วนของที่คืนไปแล้ว/ยกเลิกแล้ว ย้ายมาอยู่ที่นี่ — เป็นข้อมูลย้อนหลัง
// ที่ดูนาน ๆ ที ไม่ควรกินพื้นที่หน้าที่ใช้ทุกวัน
import { PageHeader } from "@/components/ui";
import MyBookingsPanel from "@/components/panels/my-bookings-panel";

export default function MyBookingsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="ของฉัน"
        title="ประวัติการจอง"
        subtitle="ทุกรายการที่เคยจอง รวมที่คืนแล้วและที่ยกเลิกไป"
      />
      <MyBookingsPanel />
    </div>
  );
}
