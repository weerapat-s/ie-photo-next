"use client";
// app/(member)/my/page.tsx — ทุกอย่างของฉัน จบในหน้าเดียว
//
// เดิมหน้านี้มีแท็บ 5 อัน แล้วในแท็บยังมีชิปกรองซ้อนอีกชั้น — กล้องตัวเดียวกัน
// โผล่ทั้งใน "ใกล้ถึงกำหนด" "การจอง" และ "ของที่ฉันถือ" คนใช้ต้องไล่กดหาว่า
// ปุ่มคืนอยู่แท็บไหน
//
// ตอนนี้ไม่มีแท็บเลย เรียงเป็นส่วน ๆ ตามลำดับที่คนต้องการจริง:
//   1. ต้องทำตอนนี้   — ของเลยกำหนด/ใกล้ครบกำหนด งานที่ใกล้ถึง พร้อมปุ่มลงมือ
//   2. ของที่ถืออยู่   — คืนหรือยกเลิกได้ตรงนั้น
//   3. งานที่รับผิดชอบ — งานถ่ายที่ถูกมอบหมาย + งานย่อย
//   4. รออนุมัติ      — คำขอที่ยังไม่ผ่าน ยกเลิกได้
//   5. ไฟล์งาน       — ลิงก์อัปโหลด/ดาวน์โหลด
// ส่วนไหนไม่มีของก็ไม่แสดง — หน้าจะสั้นลงเองเมื่อไม่มีอะไรค้าง
import { useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, query, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { useSettings } from "@/lib/settings-context";
import { useCollection, useDocument, useNow } from "@/lib/hooks";
import { canCancel, cancelBooking, cancelPrompt } from "@/lib/bookings";
import { allReminders, describeLeft } from "@/lib/reminders";
import { fmtRange, fmtDate, fmtRelative } from "@/lib/format";
import { PageHeader, Badge, Button, Spinner, Alert, EmptyState, useToast } from "@/components/ui";
import Icon, { type IconName } from "@/components/icon";
import ReturnModal from "@/components/return-modal";
import OpenJobsPanel from "@/components/panels/open-jobs-panel";
import type { BookingDoc, DeliveryDoc, TaskDoc, WithId } from "@/lib/types";

export default function MyPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const now = useNow(60_000);
  const { show, node: toastNode } = useToast();

  const uid = user?.uid;

  const { data: myBookings, loading } = useCollection<BookingDoc>(
    () => (uid ? query(collection(db, "bookings"), where("userId", "==", uid)) : null),
    [uid]
  );
  // งานถ่ายที่ถูกมอบหมาย — เจ้าของใบจองคือลูกค้า ไม่ใช่เรา จึงต้องอ่านจากคอลเลกชันรวม
  const { data: crewJobs } = useCollection<BookingDoc>(
    () =>
      uid
        ? query(
            collection(db, "bookings"),
            where("bookingType", "==", "photographer"),
            where("status", "==", "approved")
          )
        : null,
    [uid]
  );
  const { data: tasks } = useCollection<TaskDoc>(
    () => (uid ? query(collection(db, "tasks"), where("assignedToId", "==", uid)) : null),
    [uid]
  );
  const { data: deliveries } = useCollection<DeliveryDoc>(
    () => (uid ? collection(db, "deliveries") : null),
    [uid]
  );

  // เป็นทีมตากล้องไหม (มี doc crew/{uid}) — ใช้ตัดสินว่าจะโชว์ "งานที่เปิดรับ" ไหม
  const { data: crewMark } = useDocument<{ photographerId: string }>(
    () => (uid ? doc(db, "crew", uid) : null),
    [uid]
  );

  const [returning, setReturning] = useState<WithId<BookingDoc> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  /* ── จัดกลุ่มข้อมูล ─────────────────────────────────────── */

  const heldAll = useMemo(
    () =>
      myBookings
        .filter(
          (b) => b.bookingType === "equipment" && (b.status === "approved" || b.status === "pending_return")
        )
        .sort((a, b) => a.endAt.toMillis() - b.endAt.toMillis()),
    [myBookings]
  );

  const waiting = useMemo(
    () => myBookings.filter((b) => b.status === "pending").sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis()),
    [myBookings]
  );

  const myJobs = useMemo(
    () =>
      crewJobs
        .filter((b) => (b.assigneeIds ?? []).includes(uid ?? "") && b.endAt.toMillis() > now)
        .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis()),
    [crewJobs, uid, now]
  );

  const openTasks = useMemo(
    () => tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled"),
    [tasks]
  );

  // งานส่งไฟล์ที่ผูกกับงานถ่าย — โชว์ inline บนการ์ดงาน ไม่ต้องแยกส่วน
  const deliveryOf = useMemo(() => {
    const m = new Map<string, WithId<DeliveryDoc>>();
    for (const d of deliveries) if (d.bookingId) m.set(d.bookingId, d);
    return m;
  }, [deliveries]);

  const jobBookingIds = useMemo(() => new Set(myJobs.map((j) => j.id)), [myJobs]);

  const myDeliveries = useMemo(
    () =>
      deliveries.filter(
        (d) =>
          d.status !== "archived" &&
          (d.assignedToId === uid || (d.assigneeIds ?? []).includes(uid ?? "")) &&
          // ที่ผูกกับงานถ่ายของเราแล้ว โชว์ inline บนการ์ดงาน — ไม่ต้องซ้ำในส่วนนี้
          !(d.bookingId && jobBookingIds.has(d.bookingId))
      ),
    [deliveries, uid, jobBookingIds]
  );

  /** เรื่องด่วน — ดึงมาจากตรรกะเดียวกับที่ใช้ส่งอีเมลเตือน จะได้ไม่เพี้ยนกัน */
  const urgent = useMemo(
    () =>
      allReminders({ bookings: [...myBookings, ...crewJobs], tasks, deliveries, now }).filter(
        (r) => !!uid && r.userIds.includes(uid)
      ),
    [myBookings, crewJobs, tasks, deliveries, now, uid]
  );

  // ของที่ด่วนแล้วจะไปโผล่ในส่วน "ต้องทำตอนนี้" พร้อมปุ่มคืนอยู่แล้ว
  // ไม่ต้องแสดงซ้ำอีกรอบข้างล่าง — ของชิ้นเดียวโผล่สองที่คือปัญหาเดิมที่กำลังแก้
  const urgentIds = useMemo(() => new Set(urgent.map((r) => r.refId)), [urgent]);
  const held = useMemo(() => heldAll.filter((b) => !urgentIds.has(b.id)), [heldAll, urgentIds]);

  /* ── การกระทำ ──────────────────────────────────────────── */

  async function cancel(b: WithId<BookingDoc>) {
    if (busy || !confirm(cancelPrompt(b))) return;
    setBusy(b.id);
    setErr("");
    try {
      await cancelBooking(b);
      show("ยกเลิกแล้ว — คิวถูกปล่อยให้คนอื่นจองต่อได้");
    } catch {
      setErr("ยกเลิกไม่สำเร็จ — ถ้าเลยเวลาเริ่มแล้วต้องกดคืนแทน");
    } finally {
      setBusy(null);
    }
  }

  async function markUploaded(deliveryId: string) {
    setBusy(deliveryId);
    setErr("");
    try {
      await updateDoc(doc(db, "deliveries", deliveryId), { status: "uploaded", updatedAt: new Date() });
      show("แจ้งว่าอัปไฟล์แล้ว รอกรรมการตรวจ");
    } catch {
      setErr("อัปเดตไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function setTaskStatus(id: string, status: TaskDoc["status"]) {
    setBusy(id);
    setErr("");
    try {
      await updateDoc(doc(db, "tasks", id), { status });
      show(status === "completed" ? "ปิดงานแล้ว" : "เริ่มทำแล้ว");
    } catch {
      setErr("อัปเดตสถานะไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Spinner label="กำลังโหลดงานของคุณ…" />;

  const nothing =
    urgent.length === 0 &&
    heldAll.length === 0 &&
    waiting.length === 0 &&
    myJobs.length === 0 &&
    openTasks.length === 0 &&
    myDeliveries.length === 0;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="ของฉัน"
        title="งานของฉัน"
        subtitle="ทุกอย่างที่ต้องทำอยู่ในหน้านี้ — ไม่ต้องไปหาที่อื่น"
      />

      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      {nothing && (
        <EmptyState
          icon="success"
          text="ตอนนี้คุณไม่มีอะไรค้าง — ไม่มีของที่ต้องคืน ไม่มีงานที่ต้องส่ง"
          action={<Link href="/availability" className="t-label text-[var(--faculty)]">ตั้งวันที่ไม่ว่าง →</Link>}
        />
      )}

      {/* ── 1. ต้องทำตอนนี้ ─────────────────────────────────── */}
      {urgent.length > 0 && (
        <Section title="ต้องทำตอนนี้" icon="overdue" count={urgent.length} tone="urgent">
          <ul className="surface-flat divide-y divide-[var(--hairline)] overflow-hidden rounded-3xl">
            {urgent.map((r) => {
              const late = r.hoursLeft < 0;
              const b = myBookings.find((x) => x.id === r.refId);
              return (
                <li key={`${r.kind}:${r.refId}`} className="flex flex-wrap items-center gap-3 p-4">
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${late ? "tone-bad" : "tone-warn"}`}
                  >
                    <Icon name={late ? "overdue" : "pending"} size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="t-heading truncate text-[var(--ink)]">{r.title}</p>
                    <p className="t-caption">{describeLeft(r.hoursLeft)}</p>
                  </div>
                  {/* ปุ่มลงมือต้องอยู่ตรงนี้เลย ไม่ใช่ให้ไปหาที่อื่น */}
                  {b && b.status === "approved" && b.bookingType === "equipment" && (
                    <Button size="sm" icon="reset" onClick={() => setReturning(b)}>
                      คืนเลย
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* ── 2. ของที่ถืออยู่ ─────────────────────────────────── */}
      {held.length > 0 && (
        <Section
          title={urgent.length > 0 ? "ของที่ถืออยู่ (ยังไม่ด่วน)" : "ของที่ถืออยู่"}
          icon="equipment"
          count={held.length}
        >
          <div className="space-y-2">
            {held.map((b) => (
              <div key={b.id} className="surface-flat rounded-3xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="t-heading text-[var(--ink)]">{b.itemName}</p>
                  {b.status === "pending_return" ? (
                    <Badge className="tone-warn" icon="pending">
                      รอกรรมการตรวจรับ
                    </Badge>
                  ) : (
                    <Badge className={b.endAt.toMillis() < now ? "tone-bad" : "tone-ok"}>
                      คืน {fmtRelative(b.endAt)}
                    </Badge>
                  )}
                </div>
                <p className="t-caption mt-1">{fmtRange(b.startAt, b.endAt)}</p>
                {b.usageReason && <p className="t-caption">เพื่อ {b.usageReason}</p>}

                {b.status === "approved" && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--hairline)] pt-3">
                    <Button size="sm" icon="reset" onClick={() => setReturning(b)}>
                      คืนอุปกรณ์
                    </Button>
                    {canCancel(b, now) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="close"
                        loading={busy === b.id}
                        onClick={() => cancel(b)}
                        className="text-[var(--tone-bad-ink)]"
                      >
                        ยกเลิก
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── งานที่เปิดรับ (ทีมตากล้องกดรับเอง) ───────────────── */}
      {crewMark && settings.featurePhotographer && (
        <section className="mb-7">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--faculty)]/12 text-[var(--faculty)]">
              <Icon name="photographer" size={16} />
            </span>
            <h2 className="t-heading text-[var(--ink)]">งานที่เปิดรับ</h2>
          </div>
          <OpenJobsPanel />
        </section>
      )}

      {/* ── 3. งานที่รับผิดชอบ ───────────────────────────────── */}
      {(myJobs.length > 0 || openTasks.length > 0) && (
        <Section title="งานที่รับผิดชอบ" icon="photographer" count={myJobs.length + openTasks.length}>
          <div className="space-y-2">
            {myJobs.map((j) => (
              <div key={j.id} className="surface-flat rounded-3xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="t-heading text-[var(--ink)]">{j.usageType || j.itemName}</p>
                  <Badge className="tone-brand">{fmtRelative(j.startAt)}</Badge>
                </div>
                <p className="t-caption mt-1">{fmtRange(j.startAt, j.endAt)}</p>
                {j.location && (
                  <p className="t-caption flex items-center gap-1.5">
                    <Icon name="studio" size={16} /> {j.location}
                  </p>
                )}
                {j.userPhone && (
                  <a
                    href={`tel:${j.userPhone}`}
                    className="btn-glass press mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold"
                  >
                    <Icon name="phone" size={16} /> โทรหาผู้ประสานงาน
                  </a>
                )}

                {/* งานส่งไฟล์ของงานนี้ — อยู่ในการ์ดเดียวกับงานถ่าย ไม่ต้องไปหาอีกที่ */}
                {(() => {
                  const d = deliveryOf.get(j.id);
                  if (!d) return null;
                  const uploaded = d.status !== "awaiting_upload";
                  return (
                    <div className="mt-3 border-t border-[var(--hairline)] pt-3">
                      <p className="t-caption mb-2 flex items-center gap-1.5 font-semibold">
                        <Icon name="delivery" size={16} className="text-[var(--faculty)]" />
                        ส่งไฟล์งาน
                        <Badge className={uploaded ? "tone-ok" : "tone-warn"}>
                          {uploaded ? "อัปแล้ว" : "รออัปไฟล์"}
                        </Badge>
                        {d.dueAt && <span>· ภายใน {fmtDate(d.dueAt)}</span>}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={d.uploadUrl || settings.uploadLinkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-glass press inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold"
                        >
                          <Icon name="upload" size={16} /> อัปไฟล์ขึ้น NAS
                        </a>
                        {!uploaded && (
                          <Button size="sm" icon="approved" loading={busy === d.id} onClick={() => markUploaded(d.id)}>
                            อัปเสร็จแล้ว
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}

            {openTasks.map((t) => (
              <div key={t.id} className="surface-flat rounded-3xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="t-heading text-[var(--ink)]">{t.title}</p>
                  {t.dueDate && <Badge className="tone-mute">ส่ง {fmtDate(t.dueDate)}</Badge>}
                </div>
                {t.description && <p className="t-caption mt-1">{t.description}</p>}
                <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--hairline)] pt-3">
                  {t.status === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busy === t.id}
                      onClick={() => setTaskStatus(t.id, "in_progress")}
                    >
                      เริ่มทำ
                    </Button>
                  )}
                  <Button
                    size="sm"
                    icon="approved"
                    loading={busy === t.id}
                    onClick={() => setTaskStatus(t.id, "completed")}
                  >
                    เสร็จแล้ว
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── 4. รออนุมัติ ─────────────────────────────────────── */}
      {waiting.length > 0 && (
        <Section title="รออนุมัติ" icon="pending" count={waiting.length}>
          <ul className="surface-flat divide-y divide-[var(--hairline)] overflow-hidden rounded-3xl">
            {waiting.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="t-heading truncate text-[var(--ink)]">{b.usageType || b.itemName}</p>
                  <p className="t-caption">{fmtRange(b.startAt, b.endAt)}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="close"
                  loading={busy === b.id}
                  onClick={() => cancel(b)}
                  className="text-[var(--tone-bad-ink)]"
                >
                  ยกเลิก
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── 5. ไฟล์งาน ──────────────────────────────────────── */}
      {settings.featureDeliveries && myDeliveries.length > 0 && (
        <Section title="ไฟล์งาน" icon="delivery" count={myDeliveries.length}>
          <ul className="surface-flat divide-y divide-[var(--hairline)] overflow-hidden rounded-3xl">
            {myDeliveries.map((d) => (
              <li key={d.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="t-heading text-[var(--ink)]">{d.title}</p>
                  {d.dueAt && <Badge className="tone-mute">ส่ง {fmtDate(d.dueAt)}</Badge>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={d.uploadUrl || settings.uploadLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-glass press inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold"
                  >
                    <Icon name="upload" size={16} /> อัปไฟล์
                  </a>
                  {d.downloadUrl && (
                    <a
                      href={d.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-glass press inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold"
                    >
                      <Icon name="download" size={16} /> ดาวน์โหลด
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ประวัติทั้งหมดแยกไว้ — ไม่ใช่ของที่ต้องเห็นทุกวัน */}
      <p className="mt-8 text-center">
        <Link href="/my-bookings" className="t-label text-[var(--faculty)]">
          ดูประวัติการจองทั้งหมด →
        </Link>
      </p>

      {returning && (
        <ReturnModal
          booking={returning}
          uploadLink={settings.uploadLinkUrl}
          onDone={() => {
            setReturning(null);
            show("ส่งคำขอคืนแล้ว รอกรรมการตรวจรับ");
          }}
          onClose={() => setReturning(null)}
        />
      )}
      {toastNode}
    </div>
  );
}

/** หัวข้อส่วน — เลขกำกับบอกจำนวนโดยไม่ต้องนับเอง */
function Section({
  title,
  icon,
  count,
  tone,
  children,
}: {
  title: string;
  icon: IconName;
  count: number;
  tone?: "urgent";
  children: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className={`grid h-7 w-7 place-items-center rounded-lg ${
            tone === "urgent" ? "bg-[var(--tone-bad-ink)] text-white" : "bg-black/5 text-[var(--muted-ink)]"
          }`}
        >
          <Icon name={icon} size={16} />
        </span>
        <h2 className="t-heading text-[var(--ink)]">{title}</h2>
        <span className="t-num t-caption">{count}</span>
      </div>
      {children}
    </section>
  );
}
