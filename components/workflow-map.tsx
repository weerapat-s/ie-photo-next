"use client";
// components/workflow-map.tsx — แผนภูมิ "โครงสร้างการทำงาน" ของทั้งระบบ
//
// ต่างจากบอร์ดงาน (StageColumn) ที่โชว์ "ใบจองจริง" ไหลข้ามขั้น
// แผนภูมินี้โชว์ "โครงสร้าง" ว่าระบบทำงานเป็นสายอย่างไร และแต่ละขั้น
// ผูกกับ "เมนู" ไหน + ข้อมูล (collection/field) อะไรที่ส่งต่อกันระหว่างขั้น
//
// เป้าหมาย: กรรมการมองครั้งเดียวเข้าใจว่า
//   • คำขอเข้ามาทางไหน (สมาชิก/คนนอก/ฟอร์ม)
//   • ต้องไปทำงานที่เมนูไหนในแต่ละขั้น (กดโหนดแล้วเด้งไปเมนูนั้นได้เลย)
//   • ข้อมูลไหลเชื่อมกันยังไง (bookings → assigneeIds → deliveries)
//   • เมนูสนับสนุน (ทรัพยากร/ทีมงาน/วันว่าง/ตั้งค่า) ป้อนข้อมูลเข้าขั้นไหน
//
// ตัวเลขบนโหนดดึงจากข้อมูลจริงที่หน้า workflow โหลดมาแล้ว — ไม่เปิด listener ซ้ำ
import Link from "next/link";
import { useMemo } from "react";
import Icon, { type IconName } from "@/components/icon";
import { groupByStage, STAGE_META, STAGE_ORDER, type Stage } from "@/lib/analytics";
import type { AppSettings, BookingDoc, DeliveryDoc, UserDoc, WithId } from "@/lib/types";

/** เมนูที่กรรมการไป"ลงมือ"กับงานในแต่ละขั้น + ข้อมูลที่ขั้นนั้นเขียน/อ่าน */
const STAGE_MENU: Record<Stage, { href: string; menu: string; act: string; icon: IconName }> = {
  requested: { href: "/workflow", menu: "งาน", act: "อนุมัติคำขอ", icon: "workflow" },
  scheduled: { href: "/assign", menu: "มอบหมาย", act: "จ่ายงานให้ทีม", icon: "assign" },
  active: { href: "/my", menu: "งานของฉัน", act: "ทีมลงมือถ่าย/ใช้ของ", icon: "delivery" },
  wrapping: { href: "/assign", menu: "มอบหมาย · ส่งงาน", act: "รับคืน / อัปไฟล์", icon: "delivery" },
  done: { href: "/overview", menu: "ภาพรวม", act: "สรุปผล / ฟีด", icon: "overview" },
};

/** ป้ายบนเส้นเชื่อม = ข้อมูลที่ส่งต่อจากขั้นซ้ายไปขั้นขวา */
const EDGE_LABEL: string[] = [
  "status = approved",
  "assigneeIds",
  "ถึงกำหนด → คืน/ส่ง",
  "returned / uploaded",
];

export default function WorkflowMap({
  bookings,
  deliveries,
  users,
  settings,
  now,
}: {
  bookings: WithId<BookingDoc>[];
  deliveries: WithId<DeliveryDoc>[];
  users: WithId<UserDoc>[];
  settings: AppSettings;
  now: number;
}) {
  const stageCount = useMemo(() => {
    const m = {} as Record<Stage, number>;
    for (const b of groupByStage(bookings, now)) m[b.stage] = b.bookings.length;
    return m;
  }, [bookings, now]);

  // จำนวนคำขอที่ยังรออนุมัติ แยกตามช่องทางเข้า — โชว์ว่างานเข้าทางไหนบ้าง
  const pending = useMemo(() => bookings.filter((b) => b.status === "pending"), [bookings]);
  const inBorrow = pending.filter((b) => b.bookingType === "equipment" && b.userId).length;
  const inPublic = pending.filter((b) => !b.userId).length;
  const openDeliveries = deliveries.filter((d) => d.status === "awaiting_upload" || d.status === "uploaded").length;
  const crewCount = users.length;

  // เมนูสนับสนุน — ป้อนข้อมูลให้สายงาน ปิดได้จากหน้าตั้งค่า (เมนูจะจางถ้าปิด)
  const feeders: {
    href: string;
    label: string;
    icon: IconName;
    feeds: string;
    data: string;
    on: boolean;
    badge?: string;
  }[] = [
    {
      href: "/resources",
      label: "ทรัพยากร",
      icon: "inventory",
      feeds: "คลังของที่จองได้",
      data: "equipments · studios · photographers",
      on: settings.featureBorrow || settings.featureStudio || settings.featurePhotographer,
    },
    {
      href: "/team",
      label: "ทีมงาน",
      icon: "members",
      feeds: "คนที่รับงานได้",
      data: "users · crew",
      on: true,
      badge: crewCount ? `${crewCount} คน` : undefined,
    },
    {
      href: "/availability",
      label: "วันว่าง",
      icon: "availability",
      feeds: "กันวันชนตอนมอบหมาย",
      data: "availability.busyDates",
      on: true,
    },
    {
      href: "/settings",
      label: "ตั้งค่า",
      icon: "settings",
      feeds: "เปิด/ปิดฟีเจอร์ · กำหนดส่ง",
      data: "settings/app",
      on: true,
    },
  ];

  const entries: { href: string; label: string; icon: IconName; who: string; on: boolean; badge?: string }[] = [
    {
      href: "/borrow-equipment",
      label: "ขอยืมอุปกรณ์",
      icon: "equipment",
      who: "สมาชิกส่งเอง",
      on: settings.featureBorrow,
      badge: inBorrow ? `${inBorrow} รอ` : undefined,
    },
    {
      href: "/book",
      label: "จองสาธารณะ",
      icon: "photographer",
      who: "คนนอก: สตูดิโอ/ตากล้อง",
      on: settings.featureStudio || settings.featurePhotographer,
      badge: inPublic ? `${inPublic} รอ` : undefined,
    },
    {
      href: "/forms",
      label: "ฟอร์ม",
      icon: "form",
      who: "เก็บข้อมูลเพิ่ม",
      on: settings.featureForms,
    },
  ];

  return (
    <div className="surface-raised rounded-3xl p-4 sm:p-5">
      <div className="mb-4">
        <p className="t-label flex items-center gap-1.5 text-[var(--ink)]">
          <Icon name="workflow" size={18} className="text-[var(--faculty)]" />
          โครงสร้างการทำงานของระบบ
        </p>
        <p className="t-caption mt-0.5">
          กดโหนดใดก็ได้เพื่อกระโดดไปเมนูนั้น — เส้นเชื่อมบอกว่าข้อมูลไหลต่อกันอย่างไร
        </p>
      </div>

      {/* ── ทางเข้า: คำขอเข้าระบบทางไหนบ้าง ───────────────────── */}
      <SectionTag>ทางเข้า — คำขอเข้าระบบ</SectionTag>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {entries.map((e) => (
          <NodeLink
            key={e.href}
            href={e.href}
            icon={e.icon}
            title={e.label}
            sub={e.who}
            badge={e.badge}
            tone="entry"
            dim={!e.on}
          />
        ))}
      </div>

      <FlowGap label="สร้าง bookings + slots (สถานะ pending)" />

      {/* ── สายงานหลัก 5 ขั้น ผูกกับเมนูที่ต้องไปลงมือ ─────────── */}
      <SectionTag>สายงานหลัก — แต่ละขั้นทำที่เมนูไหน</SectionTag>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-0">
        {STAGE_ORDER.map((stage, i) => {
          const meta = STAGE_META[stage];
          const m = STAGE_MENU[stage];
          return (
            <div key={stage} className="contents lg:flex lg:min-w-0 lg:flex-1 lg:items-center">
              <Link
                href={m.href}
                className={`group block flex-1 rounded-2xl border p-3 transition active:scale-[.99] hover:brightness-[.98] ${meta.cls}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
                  <span className="t-caption font-bold text-[var(--ink)]/45">ขั้น {i + 1}</span>
                  <span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold text-[var(--ink)]">
                    {stageCount[stage] ?? 0}
                  </span>
                </div>
                <p className="mt-1 text-sm font-bold text-[var(--ink)]">{meta.label}</p>
                <p className="t-caption mt-0.5 leading-tight">{meta.hint}</p>
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-[var(--faculty)]">
                  <Icon name={m.icon} size={14} />
                  {m.menu}
                </span>
                <p className="t-caption mt-1 leading-tight text-[var(--ink)]/55">{m.act}</p>
              </Link>

              {/* เส้นเชื่อม + ป้ายข้อมูลที่ส่งต่อ (ไม่โชว์หลังขั้นสุดท้าย) */}
              {i < STAGE_ORDER.length - 1 && <EdgeConnector label={EDGE_LABEL[i]} />}
            </div>
          );
        })}
      </div>

      <FlowGap label="ปิดงาน → เข้าสถิติภาพรวม + ฟีดแจ้งสมาชิก" up />

      {/* ── เมนูสนับสนุน: ป้อนข้อมูลเข้าสายงาน ─────────────────── */}
      <SectionTag>ข้อมูลสนับสนุน — ป้อนเข้าสายงาน</SectionTag>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {feeders.map((f) => (
          <NodeLink
            key={f.href}
            href={f.href}
            icon={f.icon}
            title={f.label}
            sub={f.feeds}
            data={f.data}
            badge={f.badge}
            tone="feeder"
            dim={!f.on}
          />
        ))}
      </div>

      {/* งานส่งไฟล์ที่ยังค้าง — เชื่อมกับขั้น "เก็บงาน" */}
      {openDeliveries > 0 && (
        <p className="t-caption mt-3 flex items-center gap-1.5 text-[var(--muted-ink)]">
          <Icon name="delivery" size={14} className="text-orange-500" />
          งานส่งไฟล์ค้างอยู่ {openDeliveries} งาน — ตามได้ที่ขั้น “เก็บงาน”
        </p>
      )}
    </div>
  );
}

/** หัวข้อย่อยของแต่ละแถบในแผนภูมิ */
function SectionTag({ children }: { children: React.ReactNode }) {
  return <p className="t-caption mb-2 font-semibold uppercase tracking-wide text-[var(--ink)]/45">{children}</p>;
}

/** ช่องว่างแนวตั้งระหว่างแถบ พร้อมลูกศร + ป้ายบอกข้อมูลที่ส่งต่อ */
function FlowGap({ label, up = false }: { label: string; up?: boolean }) {
  return (
    <div className="my-3 flex items-center gap-2">
      <span className="h-px flex-1 bg-[var(--hairline)]" />
      <span className="t-caption flex items-center gap-1 rounded-full bg-[var(--faculty)]/10 px-2.5 py-0.5 font-medium text-[var(--faculty)]">
        <Icon name={up ? "up" : "down"} size={14} />
        {label}
      </span>
      <span className="h-px flex-1 bg-[var(--hairline)]" />
    </div>
  );
}

/** เส้นเชื่อมระหว่างขั้น — แนวนอนบนจอใหญ่ แนวตั้งบนมือถือ */
function EdgeConnector({ label }: { label: string }) {
  return (
    <div className="flex shrink-0 items-center justify-center py-0.5 lg:w-16 lg:flex-col lg:py-0">
      <Icon name="chevronDown" size={16} className="text-[var(--ink)]/25 lg:hidden" />
      <Icon name="chevronRight" size={16} className="hidden text-[var(--ink)]/25 lg:block" />
      <span className="t-caption ml-1 rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[10px] text-[var(--muted-ink)] lg:ml-0 lg:mt-1 lg:max-w-full lg:text-center lg:leading-tight">
        {label}
      </span>
    </div>
  );
}

/** การ์ดโหนด (ทางเข้า / เมนูสนับสนุน) — กดแล้วไปเมนูนั้น */
function NodeLink({
  href,
  icon,
  title,
  sub,
  data,
  badge,
  tone,
  dim,
}: {
  href: string;
  icon: IconName;
  title: string;
  sub: string;
  data?: string;
  badge?: string;
  tone: "entry" | "feeder";
  dim?: boolean;
}) {
  const toneCls =
    tone === "entry"
      ? "border-[var(--faculty)]/25 bg-[var(--faculty)]/5"
      : "border-[var(--hairline)] bg-[var(--surface-sunken)]";
  return (
    <Link
      href={href}
      className={`group block rounded-2xl border p-3 transition active:scale-[.99] hover:brightness-[.98] ${toneCls} ${
        dim ? "opacity-45" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon name={icon} size={18} className="shrink-0 text-[var(--faculty)]" />
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--ink)]">{title}</p>
        {badge && (
          <span className="shrink-0 rounded-full bg-[var(--faculty)]/12 px-2 py-0.5 text-[11px] font-bold text-[var(--faculty)]">
            {badge}
          </span>
        )}
      </div>
      <p className="t-caption mt-1 leading-tight">{sub}</p>
      {data && <p className="mt-1 truncate font-mono text-[10px] text-[var(--ink)]/40">{data}</p>}
      {dim && <p className="t-caption mt-1 text-[var(--ink)]/40">ปิดอยู่ (เปิดที่ตั้งค่า)</p>}
    </Link>
  );
}
