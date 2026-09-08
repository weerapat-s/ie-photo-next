"use client";
// app/(admin)/overview/page.tsx — ภาพรวมชุมนุมสำหรับประธาน/กรรมการ
//
// ลำดับข้อมูลตามหลัก UX (สำคัญสุดอยู่บนสุด อ่านจบใน 5 วินาที):
//   0. ช่องสั่งงาน AI — สั่งได้ทันทีตั้งแต่หน้าแรกที่เปิด
//   1. "ต้องลงมือ" — ตัวเลขเดียวที่บอกว่าวันนี้ต้องทำอะไร + ทางลัดไปทำเลย
//   2. ชีพจรชุมนุม — ปริมาณงาน เทียบรอบก่อน + กราฟ 14 วัน
//   3. workflow ย่อ — งานค้างอยู่ขั้นไหนบ้าง
//   4. ภาระทีม — ใครแบกเยอะ ใครว่าง
import Link from "next/link";
import { collection, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { useSettings } from "@/lib/settings-context";
import { useCollection, useNow } from "@/lib/hooks";
import { PageHeader, Card, Section, Badge, SkeletonCard, EmptyState, LinkButton } from "@/components/ui";
import Icon, { IconTile } from "@/components/icon";
import GlareHover from "@/components/reactbits/GlareHover";
import OverviewAsk from "@/components/ai/overview-ask";
import ReminderPanel from "@/components/panels/reminder-panel";
import AdminInbox from "@/components/panels/admin-inbox";
import { fmtRange, fmtRelative, BOOKING_TYPE_ICON } from "@/lib/format";
import { displayName, titleLine, ROLE_ICON } from "@/lib/roles";
import {
  actionRequired,
  describeBalance,
  hrStats,
  byType,
  comparePeriods,
  crewLoad,
  dailyCounts,
  groupByStage,
  onTimeRate,
  STAGE_META,
} from "@/lib/analytics";
import type {
  BookingDoc,
  DeliveryDoc,
  EquipmentDoc,
  PhotographerDoc,
  TaskDoc,
  UserDoc,
} from "@/lib/types";

export default function OverviewPage() {
  const { profile, role } = useAuth();
  const { settings } = useSettings();
  const now = useNow(60_000);

  const { data: bookings, loading: l1 } = useCollection<BookingDoc>(
    () => query(collection(db, "bookings"), orderBy("createdAt", "desc")),
    []
  );
  const { data: deliveries, loading: l2 } = useCollection<DeliveryDoc>(() => collection(db, "deliveries"), []);
  const { data: tasks, loading: l3 } = useCollection<TaskDoc>(() => collection(db, "tasks"), []);
  const { data: users, loading: l4 } = useCollection<UserDoc>(() => collection(db, "users"), []);
  const { data: crew } = useCollection<PhotographerDoc>(() => collection(db, "photographers"), []);
  const { data: equipments } = useCollection<EquipmentDoc>(() => collection(db, "equipments"), []);

  if (l1 || l2 || l3 || l4) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-9 w-52 rounded-full" />
        <SkeletonCard lines={2} />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} lines={1} />
          ))}
        </div>
      </div>
    );
  }

  const todo = actionRequired(bookings, deliveries, now);
  const period = comparePeriods(bookings, now, 30);
  const chart = dailyCounts(bookings, now, 14);
  const types = byType(bookings);
  const stages = groupByStage(bookings, now);
  const load = crewLoad(crew, bookings, deliveries, tasks, now);
  const onTime = onTimeRate(deliveries);
  const hr = hrStats(load);
  const balance = describeBalance(hr.gini, hr.activeCrew);

  const activeMembers = new Set(
    bookings.filter((b) => b.createdAt?.toMillis?.() > now - 30 * 86_400_000 && b.userId).map((b) => b.userId)
  ).size;

  const upcoming = bookings
    .filter((b) => b.status === "approved" && b.endAt.toMillis() > now)
    .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())
    .slice(0, 4);

  const board = stages.filter((s) => s.stage !== "done");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={role === "super_admin" ? "มุมมองประธาน" : "มุมมองกรรมการ"}
        title={`ภาพรวม${settings.siteName}`}
        subtitle={
          profile?.firstName ? `สวัสดี ${profile.firstName} — นี่คือสถานะชุมนุมตอนนี้` : "สถานะชุมนุมตอนนี้"
        }
        action={<LinkButton href="/workflow" variant="outline">ดู workflow เต็ม →</LinkButton>}
      />

      {/* ── 0. สั่งงานด้วย AI ────────────────────────────────── */}
      <OverviewAsk />

      {/* ── 1. ต้องลงมือ ─────────────────────────────────────── */}
      {/* รายการที่รอตัดสินใจ พร้อมปุ่มลงมือในตัว — ไม่ต้องเด้งไปหน้าอื่น */}
      <Section title="ต้องตัดสินใจ" className="mb-7">
        <AdminInbox />
      </Section>

      {/* ตัวเลขงานส่ง — ยังเป็นทางลัดเพราะการส่งไฟล์ต้องไปวางลิงก์ที่หน้านั้นอยู่ดี */}
      {(todo.awaitingUpload > 0 || todo.overdue > 0) && (
        <Section title="งานส่งไฟล์" className="mb-7">
          <div className="grid grid-cols-2 gap-3">
            <TodoCard href="/assign?tab=delivery" icon="delivery" label="รออัปไฟล์" value={todo.awaitingUpload} tone="sky" />
            <TodoCard href="/assign?tab=delivery" icon="overdue" label="เลยกำหนดส่ง" value={todo.overdue} tone="red" />
          </div>
        </Section>
      )}

      {/* ── 1.5 ใกล้ถึงกำหนด ─────────────────────────────────── */}
      <Section title="ใกล้ถึงกำหนด" className="mb-7">
        <ReminderPanel scope="all" />
      </Section>

      {/* ── 2. ชีพจรชุมนุม ───────────────────────────────────── */}
      <Section title="ชีพจรชุมนุม · 30 วันล่าสุด" className="mb-7">
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-4xl font-extrabold leading-none text-[var(--ink)]">{period.current}</p>
              <p className="mt-1.5 text-sm text-[var(--muted-ink)]">งานที่เข้ามาใน 30 วัน</p>
            </div>
            <TrendPill previous={period.previous} changePct={period.changePct} />
          </div>

          <MiniBars data={chart} className="mt-5" />
          <p className="mt-1.5 text-center text-[11px] text-[var(--muted-ink)]">ปริมาณงานรายวัน 14 วันล่าสุด</p>

          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-black/6 pt-4">
            <MiniStat icon="equipment" label="อุปกรณ์" value={types.equipment} />
            <MiniStat icon="studio" label="สตูดิโอ" value={types.studio} />
            <MiniStat icon="photographer" label="ตากล้อง" value={types.photographer} />
          </div>
        </Card>

        {/* สถิติเสริม — แถวเดียว ไม่ต้องแตกเป็นการ์ด 4 ใบให้กินพื้นที่ */}
        <dl className="mt-3 flex flex-wrap items-start gap-x-7 gap-y-3 border-y border-[var(--hairline)] py-3">
          <Fact
            label="ส่งงานตรงเวลา"
            value={onTime.rate === null ? "—" : `${Math.round(onTime.rate)}%`}
            sub={onTime.closed === 0 ? "ยังไม่มีงานที่ปิด" : `จาก ${onTime.closed} งาน`}
          />
          <Fact label="สมาชิกที่ใช้งานจริง" value={String(activeMembers)} sub={`จาก ${users.length} คน`} />
          <Fact
            label="อุปกรณ์พร้อมใช้"
            value={`${equipments.filter((e) => e.status === "available").length}/${equipments.length}`}
            sub="ชิ้นที่ยืมได้"
          />
          <Fact label="ทีมเปิดรับงาน" value={String(crew.filter((c) => c.status === "open").length)} sub="คน" />
          <Fact label="งานค้างของทีม" value={String(hr.avgLoad.toFixed(1))} sub="เฉลี่ยต่อคน" />
        </dl>
      </Section>

      {/* ── 3. workflow ย่อ ─────────────────────────────────── */}
      <Section
        title="งานค้างอยู่ขั้นไหน"
        className="mb-7"
        action={
          <Link href="/workflow" className="text-sm font-semibold text-[var(--faculty)]">
            เปิดบอร์ด →
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {board.map(({ stage, bookings: items }) => {
            const meta = STAGE_META[stage];
            return (
              <Link key={stage} href="/workflow">
                <div className={`press h-full rounded-2xl border p-3.5 ${meta.cls}`}>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
                    <p className="truncate text-xs font-bold text-[var(--ink)]">{meta.label}</p>
                  </div>
                  <p className="text-2xl font-extrabold leading-none text-[var(--ink)]">{items.length}</p>
                  <p className="mt-1 text-[11px] leading-tight text-[var(--ink)]/55">{meta.hint}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </Section>

      {/* ── 4. ภาระทีม ──────────────────────────────────────── */}
      <Section
        title="ภาระงานของทีม"
        className="mb-7"
        action={
          <Link href="/resources?tab=crew" className="text-sm font-semibold text-[var(--faculty)]">
            จัดการทีม →
          </Link>
        }
      >
        {load.length === 0 ? (
          <EmptyState
            icon="photographer"
            text="ยังไม่มีตากล้องในทีม"
            action={<LinkButton href="/resources?tab=crew">เพิ่มจากสมาชิกชุมนุม</LinkButton>}
          />
        ) : (
          <div>
            <p className="t-caption mb-2">
              การกระจายงาน:{" "}
              <span
                className={`rounded-full px-2 py-0.5 font-semibold ${
                  { ok: "tone-ok", warn: "tone-warn", bad: "tone-bad" }[balance.tone]
                }`}
              >
                {balance.label}
              </span>
              {hr.idle.length > 0 && <> · ยังว่าง {hr.idle.length} คน</>}
            </p>
            <ul className="surface-flat divide-y divide-[var(--hairline)] overflow-hidden rounded-3xl">
            {load.slice(0, 8).map((c) => {
              const max = Math.max(...load.map((x) => x.total), 1);
              return (
                <li key={c.id} className="flex items-center gap-3 p-3">
                  {c.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--faculty)]/10 text-[var(--faculty)]">
                      <Icon name="photographer" size={18} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--ink)]">{c.name}</p>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/6">
                      <div
                        className="h-full rounded-full bg-[var(--faculty)] transition-all duration-500"
                        style={{ width: `${(c.total / max) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="t-num text-sm font-bold text-[var(--ink)]">{c.total}</p>
                    <p className="t-num text-[10px] text-[var(--muted-ink)]">
                      คิว {c.upcoming} · ส่ง {c.openDeliveries} · งาน {c.openTasks}
                    </p>
                  </div>
                </li>
              );
            })}
            </ul>
          </div>
        )}
      </Section>

      {/* ── คิวที่กำลังจะถึง ────────────────────────────────── */}
      <Section title="คิวที่กำลังจะถึง" className="mb-4">
        {upcoming.length === 0 ? (
          <EmptyState icon="calendar" text="ไม่มีคิวที่ยืนยันแล้วในช่วงนี้" />
        ) : (
          <div className="space-y-2">
            {upcoming.map((b) => (
              <GlareHover key={b.id} className="glass-card flex items-center gap-3 rounded-2xl p-3.5">
                <IconTile name={BOOKING_TYPE_ICON[b.bookingType]} size={18} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[var(--ink)]">{b.itemName}</p>
                  <p className="truncate text-xs text-[var(--muted-ink)]">
                    {b.userName} · {fmtRange(b.startAt, b.endAt)}
                  </p>
                </div>
                <Badge className="bg-[var(--faculty)]/10 text-[var(--faculty)] border border-[var(--faculty)]/20">
                  {fmtRelative(b.startAt)}
                </Badge>
              </GlareHover>
            ))}
          </div>
        )}
      </Section>

      {/* ── กรรมการชุดปัจจุบัน ─────────────────────────────── */}
      <Section title="กรรมการชุดปัจจุบัน">
        <ul className="surface-flat divide-y divide-[var(--hairline)] overflow-hidden rounded-3xl">
          {users
            .filter((u) => u.role !== "member")
            .slice(0, 10)
            .map((u) => (
              <li key={u.id} className="flex items-center gap-3 p-3">
                {u.profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.profileImageUrl} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black/5 text-base">
                    {ROLE_ICON[u.role]}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">{displayName(u)}</p>
                  <p className="truncate text-xs text-[var(--muted-ink)]">{titleLine(u)}</p>
                </div>
                {u.phone && (
                  <a
                    href={`tel:${u.phone}`}
                    aria-label={`โทรหา ${displayName(u)}`}
                    className="tap grid shrink-0 place-items-center rounded-xl text-[var(--tone-ok-ink)] transition hover:bg-black/5"
                  >
                    <Icon name="phone" size={16} />
                  </a>
                )}
              </li>
            ))}
        </ul>
      </Section>
    </div>
  );
}

/* ═══ ชิ้นส่วนย่อย ═══════════════════════════════════════════ */

function TodoCard({
  href,
  icon,
  label,
  value,
  tone,
}: {
  href: string;
  icon: string;
  label: string;
  value: number;
  tone: "amber" | "violet" | "sky" | "red";
}) {
  const tones = {
    amber: "bg-amber-100 text-amber-700",
    violet: "bg-violet-100 text-violet-700",
    sky: "bg-sky-100 text-sky-700",
    red: "bg-red-100 text-red-700",
  };
  const urgent = value > 0;
  return (
    <Link href={href}>
      <GlareHover
        className={`press hover-scale h-full rounded-2xl p-4 ${urgent ? "glow-card" : "glass-card opacity-70"}`}
      >
        <div className={`mb-2 grid h-9 w-9 place-items-center rounded-xl text-lg ${tones[tone]}`}>{icon}</div>
        <p className="text-2xl font-extrabold leading-none text-[var(--ink)]">{value}</p>
        <p className="mt-1 text-xs text-[var(--muted-ink)]">{label}</p>
      </GlareHover>
    </Link>
  );
}

function TrendPill({
  previous,
  changePct,
}: {
  previous: number;
  changePct: number | null;
}) {
  if (changePct === null) {
    return (
      <span className="rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold text-[var(--muted-ink)]">
        ยังไม่มีข้อมูลรอบก่อนให้เทียบ
      </span>
    );
  }
  const up = changePct >= 0;
  return (
    <span
      className={`rounded-full px-3 py-1.5 text-xs font-bold ${
        up ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
      }`}
    >
      {up ? "▲" : "▼"} {Math.abs(Math.round(changePct))}% · รอบก่อน {previous} งาน
    </span>
  );
}

/** กราฟแท่งเล็ก วาดด้วย div ล้วน — ไม่ต้องพึ่งไลบรารีชาร์ต */
function MiniBars({ data, className = "" }: { data: number[]; className?: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className={`flex h-16 items-end gap-1 ${className}`} role="img" aria-label="กราฟปริมาณงานรายวัน">
      {data.map((v, i) => (
        <div key={i} className="flex-1" title={`${v} งาน`}>
          <div
            className={`w-full rounded-t-md transition-all duration-500 ${
              v > 0 ? "bg-[var(--faculty)]/75" : "bg-black/8"
            }`}
            style={{ height: `${Math.max((v / max) * 64, 3)}px` }}
          />
        </div>
      ))}
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-lg" aria-hidden>{icon}</p>
      <p className="text-lg font-bold leading-none text-[var(--ink)]">{value}</p>
      <p className="mt-0.5 text-[11px] text-[var(--muted-ink)]">{label}</p>
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <dt className="t-caption">{label}</dt>
      <dd className="t-num text-xl font-extrabold leading-tight text-[var(--ink)]">
        {value} <span className="t-caption font-normal">{sub}</span>
      </dd>
    </div>
  );
}
