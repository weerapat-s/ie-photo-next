"use client";
// app/(admin)/resources/page.tsx — ทรัพยากรทั้งหมดในหน้าเดียว
// ยุบ 3 หน้าเดิม (คลังอุปกรณ์ · สตูดิโอ · ทีมตากล้อง) เป็นแท็บ
// เพราะทั้งสามคือ "ของที่เอาไปให้จอง" งานเดียวกัน แค่คนละชนิด
import { Suspense } from "react";
import { collection, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useSettings } from "@/lib/settings-context";
import { useCollection, useNow } from "@/lib/hooks";
import { PageHeader, Spinner } from "@/components/ui";
import Tabs, { useTabParam, type TabDef } from "@/components/tabs";
import EquipmentPanel from "@/components/panels/equipment-panel";
import BorrowedPanel from "@/components/panels/borrowed-panel";
import StudioPanel from "@/components/panels/studio-panel";
import CrewPanel from "@/components/panels/crew-panel";
import { assetStats } from "@/lib/analytics";
import type { EquipmentDoc, PhotographerDoc, SlotDoc, StudioDoc } from "@/lib/types";

type Tab = "equipment" | "borrowed" | "studio" | "crew";

export default function ResourcesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ResourcesInner />
    </Suspense>
  );
}

function ResourcesInner() {
  const { settings } = useSettings();
  const now = useNow(60_000);

  const { data: equipments } = useCollection<EquipmentDoc>(
    () => query(collection(db, "equipments"), orderBy("type")),
    []
  );
  const { data: studios } = useCollection<StudioDoc>(() => query(collection(db, "studios"), orderBy("name")), []);
  const { data: crew } = useCollection<PhotographerDoc>(
    () => query(collection(db, "photographers"), orderBy("sortOrder")),
    []
  );
  const { data: slots } = useCollection<SlotDoc>(() => collection(db, "slots"), []);

  const tabs: TabDef<Tab>[] = [
    ...(settings.featureBorrow
      ? [{ key: "equipment" as Tab, label: "อุปกรณ์", icon: "equipment" as const, badge: equipments.length }]
      : []),
    ...(settings.featureBorrow
      ? [{ key: "borrowed" as Tab, label: "ยืมอยู่", icon: "user" as const }]
      : []),
    ...(settings.featureStudio
      ? [{ key: "studio" as Tab, label: "สตูดิโอ", icon: "studio" as const, badge: studios.length }]
      : []),
    ...(settings.featurePhotographer
      ? [{ key: "crew" as Tab, label: "ทีมงาน", icon: "photographer" as const, badge: crew.length }]
      : []),
  ];

  const [tab, setTab] = useTabParam<Tab>(tabs, tabs[0]?.key ?? "equipment");

  const assets = assetStats(equipments, slots, equipments.map((e) => e.id), now);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="ADMIN"
        title="ทรัพยากร"
        subtitle="อุปกรณ์ ห้องสตูดิโอ และทีมงานที่เปิดให้จอง"
      />

      {/* แถบสรุปแบบบรรทัดเดียว — ไม่ต้องใช้การ์ด 4 ใบให้เปลืองพื้นที่ */}
      <dl className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[var(--hairline)] py-3">
        <Stat label="อุปกรณ์ทั้งหมด" value={assets.total} />
        <Stat label="ถูกใช้อยู่" value={assets.inUse} />
        <Stat label="ซ่อมบำรุง" value={assets.maintenance} tone={assets.maintenance > 0 ? "warn" : undefined} />
        <Stat label="อัตราการใช้" value={`${Math.round(assets.utilization)}%`} />
        <Stat label="ทีมเปิดรับงาน" value={crew.filter((c) => c.status === "open").length} />
      </dl>

      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-5" />}

      {tab === "equipment" && <EquipmentPanel />}
      {tab === "borrowed" && <BorrowedPanel scope="all" />}
      {tab === "studio" && <StudioPanel />}
      {tab === "crew" && <CrewPanel />}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "warn";
}) {
  return (
    <div>
      <dt className="t-caption">{label}</dt>
      <dd
        className={`t-num text-lg font-bold leading-tight ${
          tone === "warn" ? "text-[var(--tone-warn-ink)]" : "text-[var(--ink)]"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
