"use client";
// app/(admin)/team/page.tsx — คนในชุมนุมที่เดียวจบ
// ยุบ 2 หน้าเดิม (จัดการสมาชิก · มอบหมายงาน) เป็นแท็บ — ทั้งคู่คือ "จัดการคน"
import { Suspense } from "react";
import { collection, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useSettings } from "@/lib/settings-context";
import { useCollection, useNow } from "@/lib/hooks";
import { PageHeader, Spinner } from "@/components/ui";
import Tabs, { useTabParam, type TabDef } from "@/components/tabs";
import MembersPanel from "@/components/panels/members-panel";
import TasksPanel from "@/components/panels/tasks-panel";
import { crewLoad, hrStats, describeBalance } from "@/lib/analytics";
import type { BookingDoc, DeliveryDoc, PhotographerDoc, TaskDoc, UserDoc } from "@/lib/types";

type Tab = "members" | "tasks";

export default function TeamPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <TeamInner />
    </Suspense>
  );
}

function TeamInner() {
  const { settings } = useSettings();
  const now = useNow(60_000);

  const { data: users } = useCollection<UserDoc>(() => collection(db, "users"), []);
  const { data: tasks } = useCollection<TaskDoc>(() => query(collection(db, "tasks")), []);
  const { data: crew } = useCollection<PhotographerDoc>(() => collection(db, "photographers"), []);
  const { data: bookings } = useCollection<BookingDoc>(() => collection(db, "bookings"), []);
  const { data: deliveries } = useCollection<DeliveryDoc>(() => collection(db, "deliveries"), []);

  const openTasks = tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").length;

  const tabs: TabDef<Tab>[] = [
    { key: "members", label: "สมาชิก", icon: "members", badge: users.length },
    ...(settings.featureTasks
      ? [{ key: "tasks" as Tab, label: "งานที่มอบหมาย", icon: "task" as const, badge: openTasks }]
      : []),
  ];
  const [tab, setTab] = useTabParam<Tab>(tabs, "members");

  const load = crewLoad(crew, bookings, deliveries, tasks, now);
  const hr = hrStats(load);
  const balance = describeBalance(hr.gini, hr.activeCrew);
  const toneCls = { ok: "tone-ok", warn: "tone-warn", bad: "tone-bad" }[balance.tone];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="ADMIN" title="ทีมงาน" subtitle="สมาชิก สิทธิ์ ยศ และการกระจายงาน" />

      {/* ── สรุปทรัพยากรบุคคล — บรรทัดเดียว ไม่ใช้การ์ด ── */}
      <div className="mb-5 border-y border-[var(--hairline)] py-3">
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Stat label="คนในทีมถ่าย" value={`${hr.activeCrew}/${hr.totalCrew}`} hint="มีงานค้าง / ทั้งหมด" />
          <Stat label="งานค้างเฉลี่ย" value={hr.avgLoad.toFixed(1)} hint="งานต่อคน" />
          <Stat label="คนที่แบกหนักสุด" value={hr.maxLoad} hint="งานค้าง" />
          <div className="min-w-0">
            <dt className="t-caption">การกระจายงาน</dt>
            <dd className="mt-0.5">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${toneCls}`}>
                {balance.label}
              </span>
            </dd>
          </div>
        </dl>

        {(hr.overloaded.length > 0 || hr.idle.length > 0) && (
          <p className="t-caption mt-2.5">
            {hr.overloaded.length > 0 && (
              <>
                งานล้น: <b className="text-[var(--tone-bad-ink)]">{hr.overloaded.join(", ")}</b>
                {hr.idle.length > 0 && " · "}
              </>
            )}
            {hr.idle.length > 0 && (
              <>
                ยังว่าง: <b className="text-[var(--tone-ok-ink)]">{hr.idle.slice(0, 5).join(", ")}</b>
                {hr.idle.length > 5 && ` +${hr.idle.length - 5}`}
              </>
            )}
          </p>
        )}
      </div>

      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-5" />}

      {tab === "members" && <MembersPanel />}
      {tab === "tasks" && <TasksPanel />}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div>
      <dt className="t-caption">{label}</dt>
      <dd className="t-num text-lg font-bold leading-tight text-[var(--ink)]">
        {value} {hint && <span className="t-caption font-normal">{hint}</span>}
      </dd>
    </div>
  );
}
