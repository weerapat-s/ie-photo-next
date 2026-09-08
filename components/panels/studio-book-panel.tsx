"use client";
// app/(member)/studio/page.tsx — จองสตูดิโอ + แอดมินแก้ไขข้อมูลห้อง
import { useState } from "react";
import { collection, query, orderBy, doc, writeBatch, Timestamp, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { findSlotConflicts, slotPayload } from "@/lib/slots";
import { useAuth } from "@/lib/firebase/auth-context";
import { useSettings } from "@/lib/settings-context";
import { useCollection } from "@/lib/hooks";
import { Spinner, Button, Modal, Field, inputClass, Alert, EmptyState } from "@/components/ui";
import Icon from "@/components/icon";
import { StudioCard, StudioEditModal } from "@/components/studio";
import TimePicker, { type TimeRange } from "@/components/time-picker";
import { isAdminRole } from "@/lib/roles";
import type { SlotDoc, StudioDoc, WithId } from "@/lib/types";

/** self = สมาชิกจองในนามตัวเอง · assign = กรรมการกันห้องให้งานของชุมนุม (ยืนยันทันที) */
export type BookMode = "self" | "assign";

export default function StudioBookPanel({ mode = "self" }: { mode?: BookMode }) {
  const { user, profile, role } = useAuth();
  const isAdmin = role === "admin" || role === "super_admin";

  const { data: studios, loading, error } = useCollection<StudioDoc>(
    () => query(collection(db, "studios"), orderBy("name")),
    []
  );

  const [booking, setBooking] = useState<WithId<StudioDoc> | null>(null);
  const [editing, setEditing] = useState<WithId<StudioDoc> | null>(null);

  return (
    <div>

      {loading ? (
        <Spinner label="กำลังโหลดห้องสตูดิโอ…" />
      ) : error ? (
        <EmptyState icon="warning" text="โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้า" />
      ) : studios.length === 0 ? (
        <EmptyState icon="studio" text="ยังไม่มีห้องสตูดิโอในระบบ" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {studios.map((s, i) => (
            <StudioCard
              key={s.id}
              s={s}
              index={i}
              onBook={() => setBooking(s)}
              bookLabel={mode === "assign" ? "กันห้องนี้" : undefined}
              onEdit={isAdmin ? () => setEditing(s) : undefined}
            />
          ))}
        </div>
      )}

      {booking && user && (
        <StudioBookingModal
          studio={booking}
          userId={user.uid}
          userName={`${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() || user.email || ""}
          userPhone={profile?.phone ?? ""}
          mode={mode}
          onClose={() => setBooking(null)}
        />
      )}
      {editing && isAdmin && <StudioEditModal studio={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StudioBookingModal({
  studio,
  userId,
  userName,
  userPhone,
  mode,
  onClose,
}: {
  studio: WithId<StudioDoc>;
  userId: string;
  userName: string;
  userPhone: string;
  mode: BookMode;
  onClose: () => void;
}) {
  const { settings } = useSettings();
  const { role } = useAuth();
  const assigning = mode === "assign";
  const { data: slots } = useCollection<SlotDoc>(() => query(collection(db, "slots")), []);
  const [range, setRange] = useState<TimeRange>({ start: null, end: null });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    if (busy) return;
    setErr("");
    if (range.start === null || range.end === null) return setErr("กรุณาเลือกวันและช่วงเวลาให้ครบ");
    const startDate = new Date(range.start);
    const endDate = new Date(range.end);
    if (endDate <= startDate) return setErr("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม");
    if (startDate.getTime() < Date.now() - 60_000) return setErr("ไม่สามารถจองเวลาในอดีตได้");
    if (endDate.getTime() - startDate.getTime() > settings.maxStudioHours * 3_600_000)
      return setErr(`จองต่อครั้งได้ไม่เกิน ${settings.maxStudioHours} ชั่วโมง`);
    if (!reason.trim()) return setErr("กรุณาระบุวัตถุประสงค์");

    setBusy(true);
    try {
      // เช็คการจองซ้อน — member นับทั้ง pending+approved ว่าชน
      const conflicts = await findSlotConflicts(studio.id, startDate, endDate);
      if (conflicts.length) {
        setErr("ช่วงเวลานี้มีคนจองแล้ว กรุณาเลือกเวลาอื่น");
        setBusy(false);
        return;
      }

      const startTs = Timestamp.fromDate(startDate);
      const endTs = Timestamp.fromDate(endDate);
      const bookingRef = doc(collection(db, "bookings"));
      const slotRef = doc(db, "slots", bookingRef.id);
      const batch = writeBatch(db);
      batch.set(bookingRef, {
        bookingType: "studio",
        itemId: studio.id,
        itemName: studio.name,
        userId,
        userName,
        userPhone,
        guestName: null,
        guestEmail: null,
        startAt: startTs,
        endAt: endTs,
        formImageUrl: null,
        returnImageUrl: null,
        usageReason: reason.trim(),
        usageType: null,
        location: null,
        crewSize: null,
        // กรรมการกันห้องเอง = ตัดสินใจแล้ว ไม่ต้องรออนุมัติซ้ำ
        status: assigning ? "approved" : "pending",
        responsibleUserId: null,
        responsibleUserName: null,
        consentToken: null,
        formId: null,
        formResponseId: null,
        createdAt: serverTimestamp(),
      });
      batch.set(
        slotRef,
        slotPayload({
          bookingId: bookingRef.id,
          itemId: studio.id,
          itemName: studio.name,
          bookingType: "studio",
          startAt: startTs,
          endAt: endTs,
          status: assigning ? "approved" : "pending",
        })
      );
      await batch.commit();
      setDone(true);
    } catch {
      setErr("จองไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${assigning ? "กันห้อง" : "จอง"} ${studio.name}`}>
      {done ? (
        <div className="py-4 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl tone-ok"><Icon name="success" size={28} /></span>
          <p className="font-semibold text-[var(--ink)]">
            {assigning ? "กันห้องเรียบร้อย" : "ส่งคำขอจองเรียบร้อย"}
          </p>
          <p className="mt-1.5 text-sm text-[var(--muted-ink)]">
            {assigning
              ? "คิวขึ้นปฏิทินแล้ว ทุกคนเห็นทันทีว่าห้องนี้ไม่ว่าง"
              : "รอแอดมินอนุมัติ ดูสถานะได้ที่หน้า “การจองของฉัน”"}
          </p>
          <Button onClick={onClose} className="mt-5" fullWidth>
            ปิด
          </Button>
        </div>
      ) : (
        <>
          {err && <Alert onClose={() => setErr("")}>{err}</Alert>}
          <Field label="วันและเวลาที่ต้องการ" required help="ช่องที่ทึบคือห้องนี้ถูกจองไว้แล้ว">
            <TimePicker
              slots={slots}
              itemId={studio.id}
              value={range}
              onChange={setRange}
              maxAdvanceDays={settings.maxAdvanceDays}
              maxHours={settings.maxStudioHours}
              detailed={isAdminRole(role)}
            />
          </Field>
          <Field label="วัตถุประสงค์การใช้งาน" required>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputClass} placeholder="เช่น ถ่าย Portrait, MV, Product…" maxLength={500} />
          </Field>
          <Button onClick={submit} loading={busy} fullWidth size="lg" className="mt-2">
            {assigning ? "ยืนยันการกันห้อง" : "ยืนยันการจอง"}
          </Button>
        </>
      )}
    </Modal>
  );
}
