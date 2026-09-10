"use client";
// app/(admin)/workflow/page.tsx — บอร์ดติดตามงานทั้งชุมนุมตั้งแต่คำขอจนปิดงาน
//
// มือถือ: คอลัมน์เลื่อนแนวนอนแบบ snap ทีละใบ (นิ้วโป้งปัดได้)
// จอใหญ่: เห็นทุกคอลัมน์พร้อมกัน
// ทุกใบกดแล้วทำงานต่อได้ทันที — อนุมัติ/รับคืน/เปิดงานส่ง ไม่ต้องเด้งไปหน้าอื่น
import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  query,
  orderBy,
  doc,
  writeBatch,
  addDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useCollection, useNow } from "@/lib/hooks";
import {
  PageHeader,
  Card,
  Badge,
  Spinner,
  Button,
  Modal,
  Alert,
  ChipBar,
  Row,
  useToast,
} from "@/components/ui";
import Icon from "@/components/icon";
import AssignPicker from "@/components/assign-picker";
import WorkflowMap from "@/components/workflow-map";
import { buildBusyMap, busyDaysInRange, shortDay } from "@/lib/availability";
import { useAuth } from "@/lib/firebase/auth-context";
import { useSettings } from "@/lib/settings-context";
import {
  fmtRange,
  fmtRelative,
  BOOKING_STATUS,
  BOOKING_TYPE_ICON,
  BOOKING_TYPE_LABEL,
  DELIVERY_STATUS,
} from "@/lib/format";
import { groupByStage, STAGE_META, STAGE_ORDER, type Stage } from "@/lib/analytics";
import { deriveClubJobs, type ClubJob, type JobStatus } from "@/lib/jobs";
import { slotPayload } from "@/lib/slots";
import type { AvailabilityDoc, BookingDoc, BookingType, DeliveryDoc, UserDoc, WithId } from "@/lib/types";

type TypeFilter = BookingType | "all";

export default function WorkflowPage() {
  const now = useNow(60_000);
  const { show, node: toastNode } = useToast();

  const { data: bookings, loading } = useCollection<BookingDoc>(
    () => query(collection(db, "bookings"), orderBy("createdAt", "desc")),
    []
  );
  const { data: deliveries } = useCollection<DeliveryDoc>(() => collection(db, "deliveries"), []);
  const { data: users } = useCollection<UserDoc>(() => query(collection(db, "users"), orderBy("studentId")), []);
  const { data: availability } = useCollection<AvailabilityDoc>(() => collection(db, "availability"), []);
  const { user } = useAuth();
  const { settings } = useSettings();

  /** แผนผัง = โครงสร้างการทำงาน (ผูกเมนู) · บอร์ด = ใบจองไหลข้ามขั้น · งานชุมนุม = รวมตามอีเวนต์ */
  const [view, setView] = useState<"map" | "board" | "jobs">("map");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [detail, setDetail] = useState<WithId<BookingDoc> | null>(null);
  /** การจองที่กำลังเลือกผู้รับผิดชอบ (กรรมการสั่งได้ ไม่ต้องรอตากล้องกดรับเอง) */
  const [assigning, setAssigning] = useState<WithId<BookingDoc> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  // เปิดหน้าจากลิงก์ที่ระบุมุมมองไว้ (เช่น /workflow?view=board จากปุ่ม "จัดการ")
  // อ่านครั้งเดียวตอน mount ฝั่ง client — static export อ่าน query ตอน render ปกติไม่ได้
  // (setState ใน effect ที่นี่คือการตั้งค่าเริ่มต้นครั้งเดียว ไม่ได้วนซ้ำ · ref กันรันซ้ำ)
  const appliedView = useRef(false);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (appliedView.current) return;
    appliedView.current = true;
    const v = new URLSearchParams(window.location.search).get("view");
    if (v === "board" || v === "jobs" || v === "map") setView(v);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filtered = useMemo(
    () => (typeFilter === "all" ? bookings : bookings.filter((b) => b.bookingType === typeFilter)),
    [bookings, typeFilter]
  );
  const stages = useMemo(() => groupByStage(filtered, now), [filtered, now]);
  /** งานชุมนุมรวมตามอีเวนต์ — ใช้ bookings ทั้งหมด ไม่กรองตามประเภท */
  const jobs = useMemo(() => deriveClubJobs(bookings, now), [bookings, now]);
  const busyMap = useMemo(() => buildBusyMap(availability), [availability]);
  /** uid → ชื่อ ใช้แปลง assigneeIds เป็นชื่อคนตอนแสดงผล */
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) m.set(u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.studentId);
    return m;
  }, [users]);

  /** งานส่งที่ผูกกับการจองใบนี้ — โชว์บนการ์ดว่าเก็บงานถึงไหน */
  const deliveryOf = useMemo(() => {
    const m = new Map<string, WithId<DeliveryDoc>>();
    for (const d of deliveries) if (d.bookingId) m.set(d.bookingId, d);
    return m;
  }, [deliveries]);

  async function approve(b: WithId<BookingDoc>) {
    if (busy) return;
    setBusy(b.id);
    setErr("");
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "bookings", b.id), { status: "approved" });
      batch.update(doc(db, "slots", b.id), { status: "approved" });
      await batch.commit();
      await addDoc(collection(db, "feeds"), {
        message: `${b.userName} จอง${BOOKING_TYPE_LABEL[b.bookingType]} "${b.itemName}" ได้รับการอนุมัติแล้ว`,
        bookingId: b.id,
        userId: b.userId,
        formImageUrl: null,
        bookingStatus: "approved",
        likedBy: [],
        likeCount: 0,
        createdAt: serverTimestamp(),
      });
      show("อนุมัติแล้ว");
      setDetail(null);
    } catch {
      setErr("อนุมัติไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(null);
    }
  }

  /** กรรมการสั่งว่าใครรับผิดชอบงานนี้ — เขียน array เดียวกับที่ตากล้องกดรับเอง */
  async function assign(b: WithId<BookingDoc>, uids: string[]) {
    try {
      await updateDoc(doc(db, "bookings", b.id), { assigneeIds: uids });
      show(uids.length ? `มอบหมาย ${uids.length} คน` : "ยกเลิกผู้รับผิดชอบแล้ว");
    } catch {
      setErr("มอบหมายไม่สำเร็จ");
    }
  }

  /**
   * เปิดงานส่งจากการจองใบนี้ในคลิกเดียว
   * เติมชื่อลูกค้า ผู้รับผิดชอบ และกำหนดส่งให้อัตโนมัติจากค่าที่ตั้งไว้ใน /settings
   * เหลือให้แอดมินแค่ไปวางลิงก์ NAS อย่างเดียว
   */
  async function createDelivery(b: WithId<BookingDoc>) {
    if (!user || busy) return;
    if (deliveryOf.has(b.id)) {
      setErr("การจองนี้มีงานส่งอยู่แล้ว");
      return;
    }
    setBusy(b.id);
    setErr("");
    try {
      const due = new Date(b.endAt.toMillis() + settings.deliveryDefaultDays * 86_400_000);
      await addDoc(collection(db, "deliveries"), {
        title: `${b.itemName} — ${b.userName}`,
        bookingId: b.id,
        customerUserId: b.userId,
        customerName: b.userName,
        customerContact: b.guestEmail || b.userPhone || "",
        assignedToId: b.assigneeIds?.[0] ?? null,
        assignedToName: b.assigneeIds?.[0] ? (nameOf.get(b.assigneeIds[0]) ?? null) : null,
        uploadUrl: null,
        downloadUrl: null,
        passcode: null,
        note: "",
        status: "awaiting_upload",
        dueAt: Timestamp.fromDate(due),
        expiresAt: null,
        createdById: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: null,
      });
      show("สร้างงานส่งแล้ว — ไปวางลิงก์ NAS ที่หน้าส่งงาน");
    } catch {
      setErr("สร้างงานส่งไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function confirmReturn(b: WithId<BookingDoc>) {
    if (busy) return;
    setBusy(b.id);
    setErr("");
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "bookings", b.id), { status: "returned" });
      batch.delete(doc(db, "slots", b.id));
      await batch.commit();
      show("ปิดงานแล้ว");
      setDetail(null);
    } catch {
      setErr("บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(null);
    }
  }

  /**
   * ย้อนการคืน — เผลอกดรับคืนทั้งที่ของยังไม่ถึงกำหนดใช้/ยังไม่ได้คืนจริง
   * คืนสถานะเป็น approved แล้วสร้าง slot กลับ ไม่งั้นคิวจะว่างให้คนอื่นจองทับ
   * firestore.rules บังคับ slot.startAt > now-5m — ถ้าเริ่มไปแล้วต้องขยับมาเป็นตอนนี้
   */
  async function undoReturn(b: WithId<BookingDoc>) {
    if (busy) return;
    const startMs = Math.max(b.startAt.toMillis(), now + 60_000);
    const endMs = b.endAt.toMillis();
    if (endMs <= startMs) {
      setErr("งานนี้เลยเวลาไปแล้ว ย้อนกลับไม่ได้ — สร้างรายการใหม่แทน");
      return;
    }
    if (!confirm(`ย้อนการคืน "${b.itemName}" กลับเป็นยังไม่คืน?`)) return;
    setBusy(b.id);
    setErr("");
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "bookings", b.id), { status: "approved" });
      batch.set(
        doc(db, "slots", b.id),
        slotPayload({
          bookingId: b.id,
          itemId: b.itemId,
          itemName: b.itemName,
          bookingType: b.bookingType,
          startAt: Timestamp.fromMillis(startMs),
          endAt: Timestamp.fromMillis(endMs),
          status: "approved",
        })
      );
      await batch.commit();
      show("ย้อนการคืนแล้ว — กลับไปเป็นยังไม่คืน");
      setDetail(null);
    } catch {
      setErr("ย้อนการคืนไม่สำเร็จ — อาจมีคนจองคิวนี้ไปแล้ว");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="ADMIN"
        title="Workflow งานชุมนุม"
        subtitle="ติดตามทุกงานตั้งแต่คำขอจนปิด — ปัดดูทีละขั้นบนมือถือ"
      />

      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      <ChipBar
        className="mb-4"
        value={view}
        onChange={setView}
        options={[
          { key: "map", label: "แผนผัง", icon: "workflow" },
          { key: "board", label: "บอร์ดงาน", icon: "assign", count: bookings.length },
          { key: "jobs", label: "งานชุมนุม", icon: "members", count: jobs.length },
        ]}
      />

      {view === "map" ? (
        <WorkflowMap
          bookings={bookings}
          deliveries={deliveries}
          users={users}
          settings={settings}
          now={now}
          onOpenBoard={() => setView("board")}
        />
      ) : view === "jobs" ? (
        <JobsView jobs={jobs} nameOf={nameOf} now={now} loading={loading} />
      ) : loading ? (
        <Spinner label="กำลังโหลดงาน…" />
      ) : (
        <>
        <ChipBar
          className="mb-4"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { key: "all", label: "ทุกประเภท", count: bookings.length },
            { key: "equipment", label: "อุปกรณ์", icon: "equipment", count: bookings.filter((b) => b.bookingType === "equipment").length },
            { key: "studio", label: "สตูดิโอ", icon: "studio", count: bookings.filter((b) => b.bookingType === "studio").length },
            { key: "photographer", label: "ตากล้อง", icon: "photographer", count: bookings.filter((b) => b.bookingType === "photographer").length },
          ]}
        />
        <div
          className="
            snap-x-list no-scrollbar -mx-4 gap-3 px-4 pb-2
            lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0
          "
        >
          {stages.map(({ stage, bookings: items }) => (
            <StageColumn
              key={stage}
              stage={stage}
              items={items}
              deliveryOf={deliveryOf}
              now={now}
              busyId={busy}
              onOpen={setDetail}
              onApprove={approve}
              onReturn={confirmReturn}
              onUndoReturn={undoReturn}
              onAssign={setAssigning}
              onCreateDelivery={createDelivery}
              nameOf={nameOf}
              busyMap={busyMap}
            />
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-[var(--muted-ink)] lg:hidden">
          ← ปัดซ้าย-ขวาเพื่อดูขั้นถัดไป →
        </p>
        </>
      )}

      {detail && (
        <Modal open onClose={() => setDetail(null)} title={detail.itemName}>
          <Row label="ประเภท">{BOOKING_TYPE_LABEL[detail.bookingType]}</Row>
          <Row label="สถานะ">{BOOKING_STATUS[detail.status].label}</Row>
          <Row label="ผู้จอง">{detail.userName}</Row>
          <Row label="ติดต่อ">
            {detail.userPhone ? (
              <a href={`tel:${detail.userPhone}`} className="text-emerald-600">
                {detail.userPhone}
              </a>
            ) : (
              "—"
            )}
          </Row>
          <Row label="ช่วงเวลา">{fmtRange(detail.startAt, detail.endAt)}</Row>
          {detail.location && <Row label="สถานที่">{detail.location}</Row>}
          {detail.usageType && <Row label="ประเภทงาน">{detail.usageType}</Row>}
          <Row label="รายละเอียด">{detail.usageReason || "—"}</Row>
          <Row label="ผู้รับผิดชอบ">
            {(detail.assigneeIds ?? []).length === 0
              ? "ยังไม่มอบหมาย"
              : detail.assigneeIds!.map((u) => nameOf.get(u) ?? u).join(", ")}
          </Row>
          {(() => {
            const clash = (detail.assigneeIds ?? []).flatMap((uid) =>
              busyDaysInRange(busyMap, uid, detail.startAt.toMillis(), detail.endAt.toMillis()).map(
                (d) => `${nameOf.get(uid) ?? uid} ติด ${shortDay(d)}`
              )
            );
            return clash.length > 0 ? (
              <div className="tone-warn mt-3 rounded-2xl px-4 py-2.5 text-sm">{clash.join(" · ")}</div>
            ) : null;
          })()}

          <div className="mt-5 flex flex-wrap gap-2 border-t border-black/8 pt-4">
            {detail.status === "pending" && (
              <Button onClick={() => approve(detail)} loading={busy === detail.id} className="flex-1">
                อนุมัติ
              </Button>
            )}
            {detail.status === "pending_return" && (
              <Button onClick={() => confirmReturn(detail)} loading={busy === detail.id} className="flex-1">
                ยืนยันรับคืน
              </Button>
            )}
            <Button
              variant="outline"
              icon="user"
              onClick={() => {
                setAssigning(detail);
                setDetail(null);
              }}
            >
              มอบหมาย
            </Button>
          </div>
        </Modal>
      )}

      <AssignPicker
        open={!!assigning}
        onClose={() => setAssigning(null)}
        users={users}
        title={assigning ? `ใครรับผิดชอบ "${assigning.itemName}"` : "มอบหมายให้"}
        selected={assigning?.assigneeIds ?? []}
        range={
          assigning
            ? { startMs: assigning.startAt.toMillis(), endMs: assigning.endAt.toMillis() }
            : undefined
        }
        busy={busyMap}
        onSave={(uids) => assigning && assign(assigning, uids)}
      />

      {toastNode}
    </div>
  );
}

function StageColumn({
  stage,
  items,
  deliveryOf,
  now,
  busyId,
  onOpen,
  onApprove,
  onReturn,
  onUndoReturn,
  onAssign,
  onCreateDelivery,
  nameOf,
  busyMap,
}: {
  stage: Stage;
  items: WithId<BookingDoc>[];
  deliveryOf: Map<string, WithId<DeliveryDoc>>;
  now: number;
  busyId: string | null;
  onOpen: (b: WithId<BookingDoc>) => void;
  onApprove: (b: WithId<BookingDoc>) => void;
  onReturn: (b: WithId<BookingDoc>) => void;
  onUndoReturn: (b: WithId<BookingDoc>) => void;
  onAssign: (b: WithId<BookingDoc>) => void;
  onCreateDelivery: (b: WithId<BookingDoc>) => void;
  nameOf: Map<string, string>;
  busyMap: ReturnType<typeof buildBusyMap>;
}) {
  const meta = STAGE_META[stage];
  const index = STAGE_ORDER.indexOf(stage) + 1;

  // "ปิดงาน" กองสะสมไปเรื่อย ๆ จนเลื่อนหาของที่ต้องดูไม่เจอ
  // → โชว์เฉพาะที่เพิ่งปิดใน 1 วันล่าสุด ที่เก่ากว่านั้นเก็บไว้หลังปุ่ม
  // (คอลัมน์อื่นคืองานที่ยังต้องลงมือ ไม่ตัดออก)
  const [showOld, setShowOld] = useState(false);
  const collapses = stage === "done";
  const cutoff = now - 86_400_000;
  const older = collapses ? items.filter((b) => b.endAt.toMillis() < cutoff) : [];
  const shown = collapses && !showOld ? items.filter((b) => b.endAt.toMillis() >= cutoff) : items;
  const visible = shown.slice(0, 20);

  return (
    <section className="w-[84vw] max-w-[340px] shrink-0 lg:w-auto lg:max-w-none">
      <header className={`mb-2 rounded-2xl border px-3.5 py-2.5 ${meta.cls}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--ink)]">
            <span className="text-[var(--ink)]/40">{index}.</span> {meta.label}
          </h2>
          <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold text-[var(--ink)]">
            {items.length}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--ink)]/55">{meta.hint}</p>
      </header>

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/10 py-7 text-center text-xs text-[var(--muted-ink)]">
            ว่าง
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/10 py-6 text-center text-xs text-[var(--muted-ink)]">
            ไม่มีงานที่ปิดใน 1 วันล่าสุด
          </div>
        ) : (
          visible.map((b) => {
            const d = deliveryOf.get(b.id);
            const late = b.status === "approved" && b.endAt.toMillis() < now;
            return (
              <Card key={b.id} className="p-3.5">
                <button onClick={() => onOpen(b)} className="w-full text-left">
                  <div className="flex items-start gap-2">
                    <Icon name={BOOKING_TYPE_ICON[b.bookingType]} size={18} className="mt-0.5 text-[var(--faculty)]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--ink)]">{b.itemName}</p>
                      <p className="truncate text-xs text-[var(--muted-ink)]">{b.userName}</p>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-tight text-[var(--muted-ink)]">
                    {fmtRange(b.startAt, b.endAt)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Badge className={BOOKING_STATUS[b.status].cls}>{BOOKING_STATUS[b.status].label}</Badge>
                    {late && <Badge className="bg-red-100 text-red-700 border border-red-200">เลยเวลา</Badge>}
                    {d && <Badge className={DELIVERY_STATUS[d.status].cls}>{DELIVERY_STATUS[d.status].label}</Badge>}
                    {!b.userId && <Badge className="tone-warn">คนนอก</Badge>}
                    {(() => {
                      const ids = b.assigneeIds ?? [];
                      if (ids.length === 0) {
                        return (
                          b.status === "approved" && <Badge className="tone-warn">ยังไม่มีคนรับ</Badge>
                        );
                      }
                      const clash = ids.filter(
                        (uid) => busyDaysInRange(busyMap, uid, b.startAt.toMillis(), b.endAt.toMillis()).length > 0
                      );
                      return (
                        <>
                          <Badge className="tone-ok" icon="photographer">
                            {nameOf.get(ids[0]) ?? "ทีมงาน"}
                            {ids.length > 1 ? ` +${ids.length - 1}` : ""}
                          </Badge>
                          {clash.length > 0 && (
                            <Badge className="tone-warn" icon="warning">
                              {clash.length} คนติดธุระ
                            </Badge>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  {b.status === "approved" && b.startAt.toMillis() > now && (
                    <p className="mt-1.5 text-[11px] font-semibold text-[var(--faculty)]">
                      เริ่ม{fmtRelative(b.startAt)}
                    </p>
                  )}
                </button>

                {/* ปุ่มลงมือทันทีในการ์ด — ลดจำนวนคลิกจนเหลือ 1 */}
                <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-[var(--hairline)] pt-2.5">
                  {b.status === "pending" && (
                    <Button size="sm" fullWidth icon="approved" onClick={() => onApprove(b)} loading={busyId === b.id}>
                      อนุมัติ
                    </Button>
                  )}
                  {b.status === "pending_return" && (
                    <Button size="sm" fullWidth icon="approved" onClick={() => onReturn(b)} loading={busyId === b.id}>
                      ยืนยันรับคืน
                    </Button>
                  )}
                  {/* ของที่ยืมไปแล้ว (อนุมัติ) — กรรมการกดรับคืน/ปิดได้เลยจากบอร์ด
                      สำคัญกับของที่เลยกำหนด: เจ้าตัวไม่กดคืน กรรมการปิดเองได้ */}
                  {b.status === "approved" && b.bookingType === "equipment" && (
                    <Button
                      size="sm"
                      fullWidth={late}
                      variant={late ? "primary" : "outline"}
                      icon="approved"
                      onClick={() => onReturn(b)}
                      loading={busyId === b.id}
                      className={late ? "" : "flex-1"}
                    >
                      {late ? "รับคืน (เลยกำหนด)" : "รับคืน"}
                    </Button>
                  )}

                  {/* เผลอกดรับคืนทั้งที่ยังไม่ถึงเวลาใช้จริง — ย้อนกลับได้
                      เปิดให้เฉพาะงานที่ยังไม่เลยเวลาคืน (เลยไปแล้วสร้าง slot กลับไม่ได้) */}
                  {b.status === "returned" && b.endAt.toMillis() > now && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon="reset"
                      onClick={() => onUndoReturn(b)}
                      loading={busyId === b.id}
                      className="flex-1"
                    >
                      ย้อนการคืน
                    </Button>
                  )}

                  {/* มอบหมายผู้รับผิดชอบ — ใช้ได้กับทุกงานที่อนุมัติแล้ว ไม่เฉพาะงานถ่าย
                      เพราะของที่ยืมไปก็ต้องมีคนรับผิดชอบเหมือนกัน */}
                  {/* มอบหมายได้ตั้งแต่ยังเป็นคำขอ — กรรมการมักอยากล็อกตัวคนไว้ก่อนอนุมัติ */}
                  {b.status !== "rejected" && b.status !== "cancelled" && (
                    <Button size="sm" variant="outline" icon="user" onClick={() => onAssign(b)} className="flex-1">
                      {(b.assigneeIds?.length ?? 0) > 0
                        ? `ผู้รับผิดชอบ (${b.assigneeIds!.length})`
                        : "มอบหมาย"}
                    </Button>
                  )}

                  {/* เปิดงานส่งจากการจองนี้ — เฉพาะงานถ่ายที่ยังไม่มีงานส่ง */}
                  {b.bookingType === "photographer" && b.status === "approved" && !d && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon="delivery"
                      onClick={() => onCreateDelivery(b)}
                      loading={busyId === b.id}
                      className="flex-1"
                    >
                      เปิดงานส่ง
                    </Button>
                  )}
                </div>
              </Card>
            );
          })
        )}
        {shown.length > 20 && (
          <p className="py-1 text-center text-[11px] text-[var(--muted-ink)]">
            และอีก {shown.length - 20} รายการ
          </p>
        )}

        {/* งานที่ปิดเกิน 1 วัน — ซ่อนไว้ให้คอลัมน์ไม่ยาวจนหาของที่ต้องดูไม่เจอ */}
        {collapses && older.length > 0 && (
          <button
            type="button"
            onClick={() => setShowOld((v) => !v)}
            className="press w-full rounded-2xl border border-dashed border-black/12 py-2.5 text-xs font-semibold text-[var(--muted-ink)] hover:bg-black/5"
          >
            {showOld ? "ซ่อนงานที่เก่ากว่า 1 วัน" : `ดูงานที่เก่ากว่า 1 วัน (${older.length})`}
          </button>
        )}
      </div>
    </section>
  );
}

/* ═══ มุมมอง "งานชุมนุม" — รวม booking ตามอีเวนต์ ═══════════════
   เห็นในงานเดียว: ช่วงเวลา · ใครทำงาน · ยืมของอะไรไปบ้าง
   งานที่ผ่านไปแล้วยุบไว้ใต้ "จบแล้ว" — ค้างอยู่ข้างบนเฉพาะงานที่ยังต้องดูแล */
const JOB_STATUS: Record<JobStatus, { label: string; cls: string; dot: string }> = {
  active: { label: "กำลังดำเนินอยู่", cls: "tone-ok", dot: "bg-emerald-400" },
  upcoming: { label: "กำลังจะถึง", cls: "tone-brand", dot: "bg-sky-400" },
  done: { label: "จบแล้ว", cls: "tone-mute", dot: "bg-black/25" },
};

function fmtDayMs(ms: number): string {
  return new Date(ms).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function JobsView({
  jobs,
  nameOf,
  now,
  loading,
}: {
  jobs: ClubJob[];
  nameOf: Map<string, string>;
  now: number;
  loading: boolean;
}) {
  if (loading) return <Spinner label="กำลังโหลดงาน…" />;
  if (jobs.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-black/10 py-12 text-center">
        <Icon name="members" size={28} className="mx-auto mb-2 text-[var(--muted-ink)]" />
        <p className="text-sm text-[var(--muted-ink)]">ยังไม่มีงานชุมนุม — งานจะโผล่เมื่อมีการมอบหมายงานถ่าย หรือยืมของเพื่องานชุมนุม</p>
      </div>
    );
  }
  const live = jobs.filter((j) => j.status !== "done");
  const done = jobs.filter((j) => j.status === "done");

  return (
    <div className="space-y-3">
      {live.length === 0 && (
        <p className="t-caption text-center">ไม่มีงานที่ยังดำเนินอยู่ — ดูงานที่จบแล้วด้านล่าง</p>
      )}
      {live.map((j) => (
        <JobCard key={j.name} job={j} nameOf={nameOf} now={now} />
      ))}

      {done.length > 0 && (
        <details className="group">
          <summary className="press flex cursor-pointer list-none items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-[var(--muted-ink)]">
            <Icon name="chevronRight" size={16} className="transition group-open:rotate-90" />
            งานที่จบแล้ว ({done.length})
          </summary>
          <div className="mt-2 space-y-3">
            {done.map((j) => (
              <JobCard key={j.name} job={j} nameOf={nameOf} now={now} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function JobCard({ job, nameOf, now }: { job: ClubJob; nameOf: Map<string, string>; now: number }) {
  const meta = JOB_STATUS[job.status];
  const people = job.peopleIds.map((id) => nameOf.get(id) ?? "ไม่ทราบชื่อ");
  // นับ booking แยกตามประเภทในงานนี้
  const counts = job.bookings.reduce<Record<string, number>>((m, b) => {
    m[b.bookingType] = (m[b.bookingType] ?? 0) + 1;
    return m;
  }, {});
  const late = job.status === "active" && job.endMs < now; // เผื่อกรณี edge

  return (
    <Card className={`p-4 ${job.status === "done" ? "opacity-75" : ""}`}>
      <div className="mb-1.5 flex items-start gap-2">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
        <h3 className="min-w-0 flex-1 text-base font-bold text-[var(--ink)]">{job.name}</h3>
        <Badge className={meta.cls}>{meta.label}</Badge>
      </div>

      <p className="t-caption mb-2 flex items-center gap-1.5">
        <Icon name="calendar" size={14} />
        {fmtDayMs(job.startMs)}
        {fmtDayMs(job.startMs) !== fmtDayMs(job.endMs) ? ` – ${fmtDayMs(job.endMs)}` : ""}
        {late && <span className="tone-warn ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold">เลยกำหนด</span>}
      </p>

      {/* ประเภทงานในอีเวนต์นี้ */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {(["photographer", "equipment", "studio"] as const).map((t) =>
          counts[t] ? (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink)]/70"
            >
              <Icon name={BOOKING_TYPE_ICON[t]} size={14} />
              {BOOKING_TYPE_LABEL[t]} {counts[t]}
            </span>
          ) : null
        )}
      </div>

      {/* คนที่ทำงาน / ถือของในงานนี้ */}
      <div className="mb-2">
        <p className="t-caption mb-1 flex items-center gap-1">
          <Icon name="members" size={14} /> คนในงาน ({people.length})
        </p>
        {people.length === 0 ? (
          <p className="t-caption text-[var(--muted-ink)]">ยังไม่มีคนรับผิดชอบ</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {people.map((n, i) => (
              <span key={i} className="rounded-full bg-[var(--faculty)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--faculty)]">
                {n}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* อุปกรณ์ที่ถูกยืมเพื่องานนี้ */}
      {job.equipmentNames.length > 0 && (
        <div>
          <p className="t-caption mb-1 flex items-center gap-1">
            <Icon name="equipment" size={14} /> ของที่ยืมไป ({job.equipmentNames.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {job.equipmentNames.map((n) => (
              <span key={n} className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-0.5 text-xs text-[var(--ink)]/75">
                {n}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
