"use client";
// components/panels/data-panel.tsx — ศูนย์ลบข้อมูลของแอดมิน
//
// หลักความปลอดภัยที่ยึด (ลบแล้วกู้ไม่ได้ ต้องกันพลาดให้หนัก):
//   1. เลือกทีละรายการ ไม่มีปุ่ม "ลบทั้งหมด" ให้กดพลาด
//   2. ยืนยัน 2 ชั้น — ติ๊กเลือก แล้วต้องพิมพ์คำยืนยันซ้ำอีกที
//   3. บอกล่วงหน้าว่าจะลบอะไรตามไปด้วย (เช่น ลบการจอง = ลบคิวใน slots ด้วย)
//   4. ลบทีละชุดด้วย batch — ครึ่ง ๆ กลาง ๆ ไม่เกิด
import { useMemo, useState } from "react";
import { collection, query, orderBy, doc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useCollection, useNow } from "@/lib/hooks";
import {
  Spinner,
  EmptyState,
  Badge,
  Button,
  Alert,
  ChipBar,
  Modal,
  Field,
  inputClass,
  useToast,
} from "@/components/ui";
import Icon from "@/components/icon";
import { fmtDateTime, BOOKING_STATUS, BOOKING_TYPE_LABEL, DELIVERY_STATUS } from "@/lib/format";
import type { BookingDoc, DeliveryDoc, FeedDoc, FormResponseDoc } from "@/lib/types";

type Kind = "bookings" | "feeds" | "responses" | "deliveries";

const KIND_META: Record<Kind, { label: string; icon: "booking" | "feed" | "responses" | "delivery"; cascade?: string }> = {
  bookings: { label: "การจอง", icon: "booking", cascade: "คิวใน slots ของการจองนั้นถูกลบตามไปด้วย" },
  feeds: { label: "โพสต์ในฟีด", icon: "feed" },
  responses: { label: "คำตอบฟอร์ม", icon: "responses" },
  deliveries: { label: "งานส่ง", icon: "delivery", cascade: "ลิงก์ NAS ที่บันทึกไว้จะหายไปด้วย" },
};

interface Row {
  id: string;
  title: string;
  sub: string;
  badge?: { text: string; cls: string };
  /** ms — ใช้เรียงและกรองตามอายุ */
  at: number;
}

export default function DataPanel() {
  const now = useNow(60_000);
  const { show, node: toastNode } = useToast();

  const { data: bookings, loading: l1 } = useCollection<BookingDoc>(
    () => query(collection(db, "bookings"), orderBy("createdAt", "desc")),
    []
  );
  const { data: feeds, loading: l2 } = useCollection<FeedDoc>(
    () => query(collection(db, "feeds"), orderBy("createdAt", "desc")),
    []
  );
  const { data: responses, loading: l3 } = useCollection<FormResponseDoc>(
    () => query(collection(db, "formResponses"), orderBy("createdAt", "desc")),
    []
  );
  const { data: deliveries, loading: l4 } = useCollection<DeliveryDoc>(
    () => query(collection(db, "deliveries"), orderBy("createdAt", "desc")),
    []
  );

  const [kind, setKind] = useState<Kind>("bookings");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /** กรองตามอายุ — ล้างของเก่าคือกรณีใช้งานจริงที่พบบ่อยสุด */
  const [olderThan, setOlderThan] = useState<0 | 90 | 180 | 365>(0);

  const rows: Row[] = useMemo(() => {
    const ms = (t: { toMillis?: () => number } | null | undefined) => t?.toMillis?.() ?? 0;
    if (kind === "bookings")
      return bookings.map((b) => ({
        id: b.id,
        title: `${BOOKING_TYPE_LABEL[b.bookingType]} · ${b.itemName}`,
        sub: `${b.userName} · ${fmtDateTime(b.createdAt)}`,
        badge: { text: BOOKING_STATUS[b.status].label, cls: BOOKING_STATUS[b.status].cls },
        at: ms(b.createdAt),
      }));
    if (kind === "feeds")
      return feeds.map((f) => ({
        id: f.id,
        title: f.message.slice(0, 80),
        sub: fmtDateTime(f.createdAt),
        at: ms(f.createdAt),
      }));
    if (kind === "responses")
      return responses.map((r) => ({
        id: r.id,
        title: r.formTitle,
        sub: `${r.submitterName} · ${fmtDateTime(r.createdAt)}`,
        at: ms(r.createdAt),
      }));
    return deliveries.map((d) => ({
      id: d.id,
      title: d.title,
      sub: `${d.customerName} · ${fmtDateTime(d.createdAt)}`,
      badge: { text: DELIVERY_STATUS[d.status].label, cls: DELIVERY_STATUS[d.status].cls },
      at: ms(d.createdAt),
    }));
  }, [kind, bookings, feeds, responses, deliveries]);

  const shown = useMemo(() => {
    if (olderThan === 0) return rows;
    const cutoff = now - olderThan * 86_400_000;
    return rows.filter((r) => r.at > 0 && r.at < cutoff);
  }, [rows, olderThan, now]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function switchKind(k: Kind) {
    setKind(k);
    setPicked(new Set()); // เปลี่ยนหมวดแล้วล้างที่เลือกไว้ กันลบผิดหมวด
  }

  const CONFIRM_WORD = "ลบ";

  async function runDelete() {
    if (confirmText.trim() !== CONFIRM_WORD) {
      setErr(`พิมพ์คำว่า "${CONFIRM_WORD}" ให้ตรงก่อนยืนยัน`);
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const ids = [...picked];
      // batch ลิมิต 500 ops — การจองใช้ 2 ops ต่อใบ (booking + slot) เลยหั่นทีละ 200
      const chunk = kind === "bookings" ? 200 : 400;
      for (let i = 0; i < ids.length; i += chunk) {
        const batch = writeBatch(db);
        for (const id of ids.slice(i, i + chunk)) {
          if (kind === "bookings") {
            batch.delete(doc(db, "bookings", id));
            batch.delete(doc(db, "slots", id)); // slot ใช้ id เดียวกับ booking เสมอ
          } else if (kind === "feeds") batch.delete(doc(db, "feeds", id));
          else if (kind === "responses") batch.delete(doc(db, "formResponses", id));
          else batch.delete(doc(db, "deliveries", id));
        }
        await batch.commit();
      }
      show(`ลบ ${ids.length} รายการแล้ว`);
      setPicked(new Set());
      setConfirming(false);
      setConfirmText("");
    } catch {
      setErr("ลบไม่สำเร็จ — ตรวจสิทธิ์แอดมินและการเชื่อมต่อ");
    } finally {
      setBusy(false);
    }
  }

  const loading = l1 || l2 || l3 || l4;
  const meta = KIND_META[kind];

  return (
    <div>
      <Alert tone="warn">
        ลบแล้ว<b>กู้คืนไม่ได้</b> — Firestore ไม่มีถังขยะ ตรวจให้แน่ใจก่อนยืนยันทุกครั้ง
      </Alert>

      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      <ChipBar
        className="mb-3"
        value={kind}
        onChange={switchKind}
        options={(Object.keys(KIND_META) as Kind[]).map((k) => ({
          key: k,
          label: KIND_META[k].label,
          icon: KIND_META[k].icon,
          count:
            k === "bookings"
              ? bookings.length
              : k === "feeds"
                ? feeds.length
                : k === "responses"
                  ? responses.length
                  : deliveries.length,
        }))}
      />

      <ChipBar
        className="mb-4"
        value={String(olderThan) as "0" | "90" | "180" | "365"}
        onChange={(v) => {
          setOlderThan(Number(v) as 0 | 90 | 180 | 365);
          setPicked(new Set());
        }}
        options={[
          { key: "0", label: "ทั้งหมด" },
          { key: "90", label: "เก่ากว่า 3 เดือน" },
          { key: "180", label: "เก่ากว่า 6 เดือน" },
          { key: "365", label: "เก่ากว่า 1 ปี" },
        ]}
      />

      {loading ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState icon="approved" text="ไม่มีข้อมูลในเงื่อนไขนี้" />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <button
              onClick={() =>
                setPicked((prev) => (prev.size === shown.length ? new Set() : new Set(shown.map((r) => r.id))))
              }
              className="t-label text-[var(--faculty)]"
            >
              {picked.size === shown.length ? "ยกเลิกที่เลือก" : `เลือกทั้งหน้า (${shown.length})`}
            </button>
            <span className="t-caption t-num">เลือกแล้ว {picked.size}</span>
          </div>

          <ul className="surface-flat max-h-[52vh] divide-y divide-[var(--hairline)] overflow-y-auto rounded-3xl">
            {shown.slice(0, 300).map((r) => {
              const on = picked.has(r.id);
              return (
                <li key={r.id}>
                  <label
                    className={`press flex cursor-pointer items-start gap-3 p-3.5 transition ${
                      on ? "bg-[var(--tone-bad-bg)]" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(r.id)}
                      className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--tone-bad-ink)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="t-label block truncate text-[var(--ink)]">{r.title}</span>
                      <span className="t-caption block truncate">{r.sub}</span>
                    </span>
                    {r.badge && <Badge className={r.badge.cls}>{r.badge.text}</Badge>}
                  </label>
                </li>
              );
            })}
          </ul>
          {shown.length > 300 && (
            <p className="t-caption mt-2 text-center">
              แสดง 300 รายการแรกจาก {shown.length} — ใช้ตัวกรองอายุเพื่อแคบลง
            </p>
          )}
        </>
      )}

      {picked.size > 0 && (
        <div className="sticky bottom-2 z-10 mt-4">
          <Button variant="danger" fullWidth size="lg" icon="remove" onClick={() => setConfirming(true)}>
            ลบ {picked.size} รายการที่เลือก
          </Button>
        </div>
      )}

      <Modal
        open={confirming}
        onClose={() => {
          setConfirming(false);
          setConfirmText("");
        }}
        title={`ยืนยันลบ ${meta.label}`}
      >
        <div className="tone-bad mb-4 flex items-start gap-2.5 rounded-2xl px-4 py-3">
          <span className="mt-0.5">
            <Icon name="warning" size={16} />
          </span>
          <div className="t-body min-w-0">
            กำลังจะลบ <b className="t-num">{picked.size}</b> รายการถาวร
            {meta.cascade && <> · {meta.cascade}</>}
          </div>
        </div>

        <Field label={`พิมพ์คำว่า "${CONFIRM_WORD}" เพื่อยืนยัน`} required>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className={inputClass}
            placeholder={CONFIRM_WORD}
            autoComplete="off"
          />
        </Field>

        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setConfirming(false);
              setConfirmText("");
            }}
          >
            ยกเลิก
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            loading={busy}
            disabled={confirmText.trim() !== CONFIRM_WORD}
            onClick={runDelete}
          >
            ลบถาวร
          </Button>
        </div>
      </Modal>

      {toastNode}
    </div>
  );
}
