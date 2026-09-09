"use client";
// app/book/page.tsx — จองสตูดิโอ/ตากล้องแบบไม่ต้องล็อกอิน (หน้าสาธารณะ)
// อยู่นอก (member) group จึงไม่มี RequireAuth ครอบ
import { useState } from "react";
import Link from "next/link";
import { collection, query, orderBy, doc, writeBatch, Timestamp, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { findSlotConflicts, slotPayload } from "@/lib/slots";
import { useSettings } from "@/lib/settings-context";
import { useCollection } from "@/lib/hooks";
import {
  Spinner,
  Button,
  Modal,
  Field,
  inputClass,
  EmptyState,
  Alert,
  ChipBar,
} from "@/components/ui";
import PublicShell from "@/components/public-shell";
import { PhotographerCard, PhotographerBookingModal } from "@/components/photographer";
import Icon, { type IconName } from "@/components/icon";
import { StudioCard } from "@/components/studio";
import TimePicker, { type TimeRange } from "@/components/time-picker";
import type { PhotographerDoc, SlotDoc, StudioDoc, WithId } from "@/lib/types";

type Tab = "studio" | "photographer";

export default function PublicBookPage() {
  const { settings } = useSettings();

  const { data: studios, loading, error } = useCollection<StudioDoc>(
    () => query(collection(db, "studios"), orderBy("name")),
    []
  );
  const { data: crew, loading: loadingCrew } = useCollection<PhotographerDoc>(
    () => query(collection(db, "photographers"), orderBy("sortOrder")),
    []
  );

  const studioOn = settings.featureStudio && settings.allowGuestStudioBooking;
  const crewOn = settings.featurePhotographer && settings.allowGuestPhotographerBooking;

  const [tab, setTab] = useState<Tab>(studioOn ? "studio" : "photographer");
  const [bookingStudio, setBookingStudio] = useState<WithId<StudioDoc> | null>(null);
  const [bookingCrew, setBookingCrew] = useState<WithId<PhotographerDoc> | null>(null);

  const tabs: { key: Tab; label: string; icon: IconName; count: number }[] = [
    ...(studioOn
      ? [{ key: "studio" as Tab, label: "สตูดิโอ", icon: "studio" as IconName, count: studios.length }]
      : []),
    ...(crewOn
      ? [
          {
            key: "photographer" as Tab,
            label: "ตากล้อง",
            icon: "photographer" as IconName,
            count: crew.filter((c) => c.status === "open").length,
          },
        ]
      : []),
  ];

  return (
    <PublicShell>
      <div className="animate-in mb-7 text-center">
        <p className="t-eyebrow mb-1.5">จองออนไลน์</p>
        <h1 className="t-display text-[var(--ink)] sm:text-[2.5rem]">
          จอง<span className="text-gradient">สตูดิโอ</span>และ<span className="text-gradient">ตากล้อง</span>
        </h1>
        <p className="t-body mx-auto mt-2.5 max-w-md text-[var(--muted-ink)]">
          ไม่ต้องสมัครสมาชิก กรอกข้อมูลติดต่อแล้วรอทีมงานยืนยัน
        </p>
        <div className="mt-5 flex justify-center">
          <Button
            onClick={() => document.getElementById("book-list")?.scrollIntoView({ behavior: "smooth" })}
          >
            ดูรายการที่เปิดจอง
          </Button>
        </div>
      </div>

      {tabs.length === 0 ? (
        <EmptyState icon="ban" text="ตอนนี้ปิดรับการจองจากบุคคลภายนอกชั่วคราว" />
      ) : (
        <>
          {tabs.length > 1 && (
            <div className="mb-5 flex justify-center">
              <ChipBar value={tab} onChange={setTab} options={tabs} />
            </div>
          )}

          <div id="book-list" className="scroll-mt-24">
            {tab === "studio" &&
              (loading ? (
                <Spinner label="กำลังโหลดห้องสตูดิโอ…" />
              ) : error ? (
                <EmptyState icon="warning" text="โหลดข้อมูลห้องไม่สำเร็จ กรุณารีเฟรชหน้า" />
              ) : studios.length === 0 ? (
                <EmptyState icon="studio" text="ยังไม่มีห้องสตูดิโอเปิดให้จอง" />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {studios.map((s, i) => (
                    <StudioCard key={s.id} s={s} index={i} onBook={() => setBookingStudio(s)} />
                  ))}
                </div>
              ))}

            {tab === "photographer" &&
              (loadingCrew ? (
                <Spinner label="กำลังโหลดทีมตากล้อง…" />
              ) : crew.length === 0 ? (
                <EmptyState icon="photographer" text="ยังไม่มีตากล้องเปิดรับงาน" />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {crew.map((p, i) => (
                    <PhotographerCard key={p.id} p={p} index={i} onBook={() => setBookingCrew(p)} />
                  ))}
                </div>
              ))}
          </div>
        </>
      )}

      <p className="mt-9 text-center text-sm text-[var(--muted-ink)]">
        เป็นสมาชิกชุมนุมอยู่แล้ว?{" "}
        <Link href="/login" className="font-semibold text-[var(--faculty)] hover:underline">
          เข้าสู่ระบบเพื่อดูการจองของคุณ
        </Link>
      </p>

      {bookingStudio && <GuestStudioModal studio={bookingStudio} onClose={() => setBookingStudio(null)} />}
      {bookingCrew && (
        <PhotographerBookingModal photographer={bookingCrew} mode="guest" onClose={() => setBookingCrew(null)} />
      )}
    </PublicShell>
  );
}

/* ═══ ฟอร์มจองสตูดิโอสำหรับคนนอก ═════════════════════════════ */
function GuestStudioModal({ studio, onClose }: { studio: WithId<StudioDoc>; onClose: () => void }) {
  const { settings } = useSettings();
  // ตารางคิวสาธารณะ — คนนอกก็อ่านได้ ใช้โชว์ว่าช่วงไหนถูกจองแล้ว
  const { data: slots } = useCollection<SlotDoc>(() => query(collection(db, "slots")), []);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [range, setRange] = useState<TimeRange>({ start: null, end: null });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    if (busy) return;
    setErr("");
    if (!name.trim()) return setErr("กรุณากรอกชื่อ-นามสกุล");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr("กรุณากรอกอีเมลให้ถูกต้อง");
    if (phone.trim().length < 9) return setErr("กรุณากรอกเบอร์โทรให้ถูกต้อง");
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
      const startTs = Timestamp.fromDate(startDate);
      const endTs = Timestamp.fromDate(endDate);

      // guest นับเฉพาะ slot ที่ "อนุมัติแล้ว" ว่าชน — กัน slot ปลอมบล็อกคนอื่น
      const conflicts = await findSlotConflicts(studio.id, startDate, endDate, { onlyApproved: true });
      if (conflicts.length) {
        setErr("ช่วงเวลานี้มีการจองที่ยืนยันแล้ว กรุณาเลือกเวลาอื่น");
        setBusy(false);
        return;
      }

      const bookingRef = doc(collection(db, "bookings"));  // จอง id เองก่อนเขียน
      const slotRef = doc(db, "slots", bookingRef.id);     // slot id = booking id
      const batch = writeBatch(db);
      batch.set(bookingRef, {
        bookingType: "studio",
        itemId: studio.id,
        itemName: studio.name,
        userId: null,
        userName: name.trim(),
        userPhone: phone.trim(),
        guestName: name.trim(),
        guestEmail: email.trim(),
        startAt: startTs,
        endAt: endTs,
        formImageUrl: null,
        returnImageUrl: null,
        usageReason: reason.trim(),
        usageType: null,
        location: null,
        crewSize: null,
        status: "pending",
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
        })
      );
      await batch.commit();
      setDone(true);
    } catch {
      setErr("ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`จอง ${studio.name}`}>
      {done ? (
        <div className="py-4 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl tone-ok"><Icon name="success" size={28} /></span>
          <p className="font-semibold text-[var(--ink)]">ส่งคำขอจองเรียบร้อย</p>
          <p className="mt-1.5 text-sm text-[var(--muted-ink)]">
            ยังไม่ยืนยันการจอง — ทีมงานจะตรวจสอบเวลาว่างแล้วติดต่อกลับที่เบอร์/อีเมลที่ให้ไว้
          </p>
          <Button onClick={onClose} className="mt-5" fullWidth>
            ปิด
          </Button>
        </div>
      ) : (
        <>
          {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

          <Field label="ชื่อ-นามสกุล" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="สมชาย ใจดี" maxLength={100} />
          </Field>
          <div className="grid gap-0 sm:grid-cols-2 sm:gap-3">
            <Field label="อีเมล" required>
              <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@example.com" maxLength={120} />
            </Field>
            <Field label="เบอร์โทรศัพท์" required>
              <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="0XXXXXXXXX" maxLength={20} />
            </Field>
          </div>
          <Field label="วันและเวลาที่ต้องการ" required help="ช่องที่ทึบคือห้องนี้ถูกจองไว้แล้ว">
            <TimePicker
              slots={slots}
              itemId={studio.id}
              value={range}
              onChange={setRange}
              maxAdvanceDays={settings.maxAdvanceDays}
              maxHours={settings.maxStudioHours}
            />
          </Field>
          <Field label="วัตถุประสงค์การใช้งาน" required>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputClass} placeholder="เช่น ถ่าย Portrait, MV, Product…" maxLength={500} />
          </Field>

          <Button onClick={submit} loading={busy} fullWidth size="lg" className="mt-2">
            ส่งคำขอจอง
          </Button>
          <p className="mt-2 text-center text-xs text-[var(--muted-ink)]">
            ส่งแล้วรอทีมงานยืนยัน · ติดต่อ {settings.contactPhone}
          </p>
        </>
      )}
    </Modal>
  );
}
