"use client";
// app/(member)/my-bookings/page.tsx — การจองของฉัน + คืนอุปกรณ์
import { useState } from "react";
import { collection, query, where, orderBy, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { compressImageToDataUrl } from "@/lib/image";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection, useNow } from "@/lib/hooks";
import { useToast } from "@/components/ui";
import {
  Card,
  Badge,
  Spinner,
  Button,
  Modal,
  EmptyState,
  Alert,
  ChipBar,
  ImagePicker,
  Row,
  LinkButton,
} from "@/components/ui";
import Icon from "@/components/icon";
import { fmtRange, fmtRelative, BOOKING_STATUS, BOOKING_TYPE_ICON, BOOKING_TYPE_LABEL } from "@/lib/format";
import QrImage from "@/components/qr-image";
import { requestQrPayload } from "@/lib/qr";
import { canCancel, cancelBooking, cancelPrompt } from "@/lib/bookings";
import type { BookingDoc, BookingStatus, WithId } from "@/lib/types";

type Filter = "active" | "all" | BookingStatus;

export default function MyBookingsPanel() {
  const { user } = useAuth();
  const { data: bookings, loading, error } = useCollection<BookingDoc>(
    () =>
      user ? query(collection(db, "bookings"), where("userId", "==", user.uid), orderBy("createdAt", "desc")) : null,
    [user?.uid]
  );
  const [returning, setReturning] = useState<WithId<BookingDoc> | null>(null);
  const [detail, setDetail] = useState<WithId<BookingDoc> | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const now = useNow(60_000);
  const { show, node: toastNode } = useToast();

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

  const isActive = (b: BookingDoc) =>
    b.status === "pending" || b.status === "approved" || b.status === "pending_return";

  const shown =
    filter === "all"
      ? bookings
      : filter === "active"
        ? bookings.filter(isActive)
        : bookings.filter((b) => b.status === filter);

  return (
    <div>
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}
      <ChipBar
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={[
          { key: "active", label: "กำลังดำเนินการ", count: bookings.filter(isActive).length },
          { key: "all", label: "ทั้งหมด", count: bookings.length },
          { key: "approved", label: "อนุมัติแล้ว", count: bookings.filter((b) => b.status === "approved").length },
          { key: "returned", label: "คืนแล้ว", count: bookings.filter((b) => b.status === "returned").length },
        ]}
      />

      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState icon="warning" text="โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้า" />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="booking"
          text="ยังไม่มีการจองในหมวดนี้"
          action={<LinkButton href="/availability">ตั้งวันที่ไม่ว่าง</LinkButton>}
        />
      ) : (
        <div className="stagger space-y-3">
          {shown.map((b, i) => {
            const st = BOOKING_STATUS[b.status];
            const upcoming = b.status === "approved" && b.startAt.toMillis() > now;
            return (
              <Card key={b.id} style={{ ["--i" as string]: Math.min(i, 12) }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon name={BOOKING_TYPE_ICON[b.bookingType]} size={18} className="text-[var(--faculty)]" />
                      <span className="font-bold text-[var(--ink)]">{b.itemName}</span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted-ink)]">{fmtRange(b.startAt, b.endAt)}</p>
                    {upcoming && (
                      <p className="text-xs font-semibold text-[var(--faculty)]">
                        เริ่ม{fmtRelative(b.startAt)}
                      </p>
                    )}
                    {b.usageReason && (
                      <p className="mt-1.5 line-clamp-2 text-sm text-[var(--ink)]/75">{b.usageReason}</p>
                    )}
                  </div>
                  <Badge className={st.cls}>{st.label}</Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-black/6 pt-3">
                  <Button size="sm" variant="outline" icon="show" onClick={() => setDetail(b)}>
                    รายละเอียด
                  </Button>

                  {b.bookingType === "equipment" && b.status === "approved" && (
                    <Button size="sm" icon="reset" onClick={() => setReturning(b)}>
                      คืนอุปกรณ์
                    </Button>
                  )}

                  {/* ยกเลิกได้เฉพาะที่ยังไม่ถึงเวลาใช้จริง — เงื่อนไขตรงกับ firestore.rules */}
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

                  {b.status === "pending_return" && (
                    <span className="t-caption self-center font-semibold text-[var(--tone-warn-ink)]">
                      รอกรรมการตรวจรับคืน
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {detail && (
        <Modal open onClose={() => setDetail(null)} title={detail.itemName}>
          <Row label="ประเภท">{BOOKING_TYPE_LABEL[detail.bookingType]}</Row>
          <Row label="สถานะ">{BOOKING_STATUS[detail.status].label}</Row>
          <Row label="ช่วงเวลา">{fmtRange(detail.startAt, detail.endAt)}</Row>
          {detail.usageType && <Row label="ประเภทงาน">{detail.usageType}</Row>}
          {detail.location && <Row label="สถานที่">{detail.location}</Row>}
          {detail.crewSize ? <Row label="จำนวนตากล้อง">{detail.crewSize} คน</Row> : null}
          <Row label="วัตถุประสงค์">{detail.usageReason || "—"}</Row>

          {/* QR ของคำขอ — ให้แอดมินสแกนตอนรับของและตอนคืนของ */}
          {detail.requestId &&
            detail.status !== "returned" &&
            detail.status !== "cancelled" &&
            detail.status !== "rejected" && (
              <div className="mt-4 border-t border-black/8 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">
                  {detail.status === "pending" ? "QR สำหรับรับของ" : "QR สำหรับคืนของ"}
                </p>
                <div className="flex flex-col items-center">
                  <div className="rounded-2xl bg-white p-3">
                    <QrImage value={requestQrPayload(detail.requestId)} size={180} alt="QR คำขอยืมอุปกรณ์" />
                  </div>
                  <p className="mt-2 font-mono text-xs tracking-widest text-[var(--muted-ink)]">{detail.requestId}</p>
                  <p className="mt-1 text-center text-xs text-[var(--muted-ink)]">ให้แอดมินสแกนที่เคาน์เตอร์</p>
                </div>
              </div>
            )}
          {detail.formImageUrl && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">เอกสารที่แนบ</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={detail.formImageUrl} alt="เอกสาร" className="w-full rounded-2xl border border-black/8" />
            </div>
          )}
          <Button onClick={() => setDetail(null)} fullWidth className="mt-5">
            ปิด
          </Button>
        </Modal>
      )}

      {returning && <ReturnModal booking={returning} onClose={() => setReturning(null)} />}
      {toastNode}
    </div>
  );
}

function ReturnModal({ booking, onClose }: { booking: WithId<BookingDoc>; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!file) return setErr("กรุณาแนบรูปอุปกรณ์ก่อนยืนยัน");
    setBusy(true);
    setErr("");
    try {
      // ย่อ+บีบอัดเป็น data URL เก็บใน Firestore ตรง (ไม่ต้องใช้ Storage)
      const returnImageUrl = await compressImageToDataUrl(file, 1000, 0.75);
      await updateDoc(doc(db, "bookings", booking.id), {
        status: "pending_return",
        returnImageUrl,
      });
      onClose();
    } catch {
      setErr("คืนไม่สำเร็จ กรุณาลองใหม่");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`คืน ${booking.itemName}`}>
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}
      <p className="mb-3 text-sm text-[var(--muted-ink)]">
        ถ่ายรูปอุปกรณ์เป็นหลักฐานก่อนยืนยันการคืน แอดมินจะตรวจแล้วปิดรายการให้
      </p>
      <ImagePicker
        file={file}
        preview={preview}
        onPick={(f) => {
          setFile(f);
          setPreview(f ? URL.createObjectURL(f) : null);
        }}
        hint="ถ่ายให้เห็นสภาพอุปกรณ์ชัดเจน"
      />
      <Button onClick={submit} disabled={!file} loading={busy} fullWidth size="lg" className="mt-4">
        ยืนยันการคืน
      </Button>
    </Modal>
  );
}
