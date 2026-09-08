"use client";
// app/(admin)/settings/page.tsx — ตั้งค่าและเครื่องมือของแอดมิน
// ยุบ 3 หน้าเดิม (ตั้งค่าระบบ · สร้างฟอร์ม · คำตอบฟอร์ม) เป็นแท็บ
// ทั้งสามคือ "งานตั้งค่าที่ทำนาน ๆ ที" ไม่ควรกินช่องเมนูหลักคนละช่อง
import { Suspense } from "react";
import { collection, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useSettings } from "@/lib/settings-context";
import { useCollection } from "@/lib/hooks";
import { PageHeader, Spinner } from "@/components/ui";
import Tabs, { useTabParam, type TabDef } from "@/components/tabs";
import SystemSettingsPanel from "@/components/panels/system-settings-panel";
import FormsPanel from "@/components/panels/forms-panel";
import ResponsesPanel from "@/components/panels/responses-panel";
import DataPanel from "@/components/panels/data-panel";
import AiSettingsPanel from "@/components/panels/ai-settings-panel";
import type { FormDoc, FormResponseDoc } from "@/lib/types";

type Tab = "system" | "ai" | "forms" | "responses" | "data";

export default function SettingsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SettingsInner />
    </Suspense>
  );
}

function SettingsInner() {
  const { settings } = useSettings();
  const { data: forms } = useCollection<FormDoc>(() => query(collection(db, "forms")), []);
  const { data: responses } = useCollection<FormResponseDoc>(
    () => (settings.featureForms ? query(collection(db, "formResponses")) : null),
    [settings.featureForms]
  );

  const tabs: TabDef<Tab>[] = [
    { key: "system", label: "ระบบ", icon: "settings" },
    { key: "ai", label: "ผู้ช่วย AI", icon: "empty" },
    ...(settings.featureForms
      ? [
          { key: "forms" as Tab, label: "ฟอร์ม", icon: "form" as const, badge: forms.length },
          { key: "responses" as Tab, label: "คำตอบ", icon: "responses" as const, badge: responses.length },
        ]
      : []),
    { key: "data", label: "ลบข้อมูล", icon: "remove" },
  ];
  const [tab, setTab] = useTabParam<Tab>(tabs, "system");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="ADMIN"
        title="ตั้งค่า"
        subtitle="ปรับระบบ สร้างฟอร์ม และดูคำตอบ — ทุกอย่างแก้ได้เองไม่ต้องแตะโค้ด"
      />
      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-5" />}
      {tab === "system" && <SystemSettingsPanel />}
      {tab === "ai" && <AiSettingsPanel />}
      {tab === "forms" && <FormsPanel />}
      {tab === "responses" && <ResponsesPanel />}
      {tab === "data" && <DataPanel />}
    </div>
  );
}
