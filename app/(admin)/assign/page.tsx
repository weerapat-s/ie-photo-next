"use client";
// app/(admin)/assign/page.tsx — มอบหมายงานและทรัพยากร (กรรมการเท่านั้น)
//
// เดิมหน้านี้คือ "จองใช้บริการ" ของสมาชิก แต่โมเดลจริงของชุมนุมคือ
// กรรมการเป็นคนจัดสรร ไม่ใช่สมาชิกแย่งกันจอง — สมาชิกมีหน้าที่บอกวันไม่ว่าง
// แล้วกรรมการสั่งงานตามนั้น (หน้า /availability)
//
// งานที่กรรมการมอบหมาย = ยืนยันคิวทันที ไม่ต้องรออนุมัติซ้ำ
//
// รวม "ส่งงาน" เข้ามาเป็นแท็บที่นี่ด้วย เพราะมันคืองานมอบหมายชนิดหนึ่ง —
// สั่งให้ใครไปถ่าย กับสั่งให้ใครส่งไฟล์ เป็นการจ่ายงานให้คนเหมือนกัน
// เดิมแยกเป็นคนละเมนู ทำให้กรรมการต้องเด้งไปมาระหว่างสองหน้าเพื่อจบงานเดียว
import { Suspense } from "react";
import { useSettings } from "@/lib/settings-context";
import { PageHeader, Spinner, EmptyState } from "@/components/ui";
import Tabs, { useTabParam, type TabDef } from "@/components/tabs";
import BorrowPanel from "@/components/panels/borrow-panel";
import StudioBookPanel from "@/components/panels/studio-book-panel";
import PhotographerBookPanel from "@/components/panels/photographer-book-panel";
import DeliveriesPanel from "@/components/panels/deliveries-panel";

type Tab = "equipment" | "studio" | "photographer" | "delivery";

export default function AssignPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AssignInner />
    </Suspense>
  );
}

function AssignInner() {
  const { settings } = useSettings();

  const tabs: TabDef<Tab>[] = [
    ...(settings.featureBorrow ? [{ key: "equipment" as Tab, label: "อุปกรณ์", icon: "equipment" as const }] : []),
    ...(settings.featureStudio ? [{ key: "studio" as Tab, label: "สตูดิโอ", icon: "studio" as const }] : []),
    ...(settings.featurePhotographer
      ? [{ key: "photographer" as Tab, label: "ตากล้อง", icon: "photographer" as const }]
      : []),
    ...(settings.featureDeliveries
      ? [{ key: "delivery" as Tab, label: "ส่งงาน", icon: "delivery" as const }]
      : []),
  ];
  const [tab, setTab] = useTabParam<Tab>(tabs, tabs[0]?.key ?? "equipment");

  const subtitle =
    tab === "equipment"
      ? "เลือกอุปกรณ์ ช่วงเวลา แล้วระบุผู้รับผิดชอบ — ของหายรู้ทันทีว่าใครถือ"
      : tab === "studio"
        ? `กันห้องให้งานของชุมนุม · ครั้งละไม่เกิน ${settings.maxStudioHours} ชั่วโมง`
        : tab === "delivery"
          ? "สั่งให้ทีมอัปไฟล์ และส่งลิงก์ดาวน์โหลดให้ผู้รับ"
          : "เลือกตากล้อง ช่วงเวลา แล้วมอบหมายทีมที่ว่างจริงในวันนั้น";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="กรรมการ"
        title="มอบหมายงาน"
        subtitle={subtitle}
      />

      {tabs.length === 0 ? (
        <EmptyState icon="ban" text="ปิดการใช้ทรัพยากรทุกประเภทไว้ในหน้าตั้งค่า" />
      ) : (
        <>
          {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-5" />}
          {tab === "equipment" && <BorrowPanel mode="assign" />}
          {tab === "studio" && <StudioBookPanel mode="assign" />}
          {tab === "photographer" && <PhotographerBookPanel mode="assign" />}
          {tab === "delivery" && <DeliveriesPanel />}
        </>
      )}
    </div>
  );
}
