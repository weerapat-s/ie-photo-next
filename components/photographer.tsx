"use client";
// components/photographer.tsx — การ์ดตากล้อง + ฟอร์มจอง (ใช้ร่วมกันทั้งหน้าสมาชิกและหน้าสาธารณะ)
import { useMemo, useState } from "react";
import { collection, doc, writeBatch, Timestamp, serverTimestamp, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { findSlotConflicts, slotPayload } from "@/lib/slots";
import { useSettings } from "@/lib/settings-context";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection, useNow } from "@/lib/hooks";
import { isAdminRole } from "@/lib/roles";
import { Badge, Button, Modal, Field, inputClass, Alert } from "@/components/ui";
import AssignPicker from "@/components/assign-picker";
import { buildBusyMap } from "@/lib/availability";
import { displayName } from "@/lib/roles";
import { stripEmoji } from "@/lib/format";
import { shortDay, crewStatus } from "@/lib/availability";
import GlareHover from "@/components/reactbits/GlareHover";
import TimePicker, { type TimeRange } from "@/components/time-picker";
import Icon from "@/components/icon";
import type { AvailabilityDoc, PhotographerDoc, SlotDoc, UserDoc, WithId } from "@/lib/types";

/* ═══ การ์ดโปรไฟล์ตากล้อง ═════════════════════════════════════ */
export function PhotographerCard({
  p,
  onBook,
  onEdit,
  index = 0,
  /** ทับข้อความบนปุ่ม — ฝั่งกรรมการเรียกว่า "มอบหมาย" ไม่ใช่ "จอง" */
  bookLabel,
  /** วันที่เจ้าตัวแจ้งว่าไม่ว่าง (YYYY-MM-DD, เฉพาะที่ยังไม่ผ่าน) */
  busyDates = [],
}: {
  p: WithId<PhotographerDoc>;
  onBook: () => void;
  onEdit?: () => void;
  index?: number;
  bookLabel?: string;
  busyDates?: string[];
}) {
  // สถานะที่แสดงต้องรวม "ธงเปิด/ปิด" กับ "วันที่เจ้าตัวกันไว้" เป็นคำตอบเดียว
  // ไม่ใช่ป้ายบอกอย่างหนึ่งแล้วปฏิทินบอกอีกอย่าง
  const now = useNow(60 * 60_000);
  const st = crewStatus(p.status, busyDates, now);
  const closed = st.blocked;
  return (
    <div className="animate-in" style={{ animationDelay: `${index * 55}ms` }}>
      <GlareHover className="glass-card hover-scale rounded-3xl p-5">
        <div className="flex items-start gap-3">
          {p.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
          ) : (
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[var(--faculty)]/10 text-[var(--faculty)]">
              <Icon name="photographer" size={28} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold leading-tight text-[var(--ink)]">{p.name}</h3>
              <Badge className={st.tone}>
                {st.label}
              </Badge>
            </div>
            <p className="text-sm text-[var(--muted-ink)]">{p.role}</p>
          </div>
          {onEdit && (
            <button
              onClick={onEdit}
              aria-label={`แก้ไข ${p.name}`}
              className="tap grid shrink-0 place-items-center rounded-xl text-[var(--muted-ink)] transition hover:bg-black/5 hover:text-[var(--ink)]"
            >
              <Icon name="edit" size={16} />
            </button>
          )}
        </div>

        {/* วันที่เจ้าตัวแจ้งไว้เอง — ต้องเห็นก่อนกดมอบหมาย ไม่ใช่ไปเจอตอนเลือกเวลา */}
        {busyDates.length > 0 && (
          <p className="t-caption mt-2 flex flex-wrap items-center gap-1.5 text-[var(--tone-bad-ink)]">
            <Icon name="warning" size={16} />
            ไม่ว่าง: {busyDates.slice(0, 5).map(shortDay).join(", ")}
            {busyDates.length > 5 ? ` +${busyDates.length - 5} วัน` : ""}
          </p>
        )}

        {p.bio && <p className="mt-3 text-sm leading-relaxed text-[var(--ink)]/80">{p.bio}</p>}

        {p.skills?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.skills.map((s) => (
              <span
                key={s}
                className="rounded-full border border-black/6 bg-white/70 px-2.5 py-0.5 text-xs font-medium text-[var(--ink)]/75"
              >
                {stripEmoji(s)}
              </span>
            ))}
          </div>
        )}

        <Button onClick={onBook} disabled={closed} fullWidth className="mt-4">
          {closed ? (st.reason ?? "ยังไม่เปิดรับงาน") : (bookLabel ?? "จองตากล้องคนนี้")}
        </Button>
      </GlareHover>
    </div>
  );
}

/* ═══ ฟอร์มจองตากล้อง ═════════════════════════════════════════ */
export function PhotographerBookingModal({
  photographer,
  mode,
  user,
  onClose,
}: {
  photographer: WithId<PhotographerDoc>;
  /** member = จองในนามบัญชีตัวเอง · guest = คนนอกกรอกข้อมูลติดต่อ
   *  assign = กรรมการสั่งงาน เลือกทีมได้เลยและยืนยันคิวทันที */
  mode: "member" | "guest" | "assign";
  user?: { uid: string; name: string; phone: string };
  onClose: () => void;
}) {
  const { settings } = useSettings();
  const { role } = useAuth();
  const assigning = mode === "assign";
  // ตารางคิวสาธารณะ — ใช้โชว์ว่าช่วงไหนถูกจองไปแล้ว (อ่านได้ทุกคนรวมทั้งบุคคลภายนอก)
  const { data: slots } = useCollection<SlotDoc>(() => query(collection(db, "slots")), []);

  // โหมดมอบหมายต้องรู้ว่ามีใครบ้างและใครกันวันไหนไว้ — โหมดอื่นไม่ query เปล่า ๆ
  const { data: users } = useCollection<UserDoc>(
    () => (assigning ? collection(db, "users") : null),
    [assigning]
  );
  // ต้องอ่านเสมอ ไม่ใช่เฉพาะโหมดมอบหมาย — คนนอกที่จองตากล้องคนนี้
  // ก็ต้องเลือกวันที่เจ้าตัวไม่ได้กันไว้เหมือนกัน
  const { data: availability } = useCollection<AvailabilityDoc>(
    () => collection(db, "availability"),
    []
  );
  const busyMap = useMemo(() => buildBusyMap(availability), [availability]);

  /** วันที่ตากล้องคนนี้แจ้งว่าไม่ว่าง — ปฏิทินจะปิดไม่ให้เลือก */
  const blockedDays = useMemo(() => {
    const uid = photographer.uid;
    if (!uid) return undefined;
    const days = availability.find((a) => a.id === uid)?.busyDates ?? [];
    return days.length ? new Set(days) : undefined;
  }, [availability, photographer.uid]);

  const [assignees, setAssignees] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [range, setRange] = useState<TimeRange>({ start: null, end: null });
  const [jobType, setJobType] = useState(settings.photographerJobTypes[0] ?? "");
  const [location, setLocation] = useState("");
  const [crewSize, setCrewSize] = useState(1);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    if (busy) return;
    setErr("");

    if (assigning && assignees.length === 0) return setErr("เลือกทีมงานที่จะมอบหมายอย่างน้อย 1 คน");
    if (mode === "guest") {
      if (!name.trim()) return setErr("กรุณากรอกชื่อ-นามสกุล");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr("กรุณากรอกอีเมลให้ถูกต้อง");
      if (phone.trim().length < 9) return setErr("กรุณากรอกเบอร์โทรให้ถูกต้อง");
    }
    if (range.start === null || range.end === null) return setErr("กรุณาเลือกวันและช่วงเวลาให้ครบ");

    const startDate = new Date(range.start);
    const endDate = new Date(range.end);
    if (endDate <= startDate) return setErr("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม");
    if (startDate.getTime() < Date.now() - 60_000) return setErr("ไม่สามารถจองเวลาในอดีตได้");
    if (!location.trim()) return setErr("กรุณาระบุสถานที่ถ่าย");
    if (!reason.trim()) return setErr("กรุณาระบุรายละเอียดงาน");

    setBusy(true);
    try {
      // คนนอกนับเฉพาะคิวที่ยืนยันแล้วว่าชน — กันคิวปลอมบล็อกคนอื่น
      const conflicts = await findSlotConflicts(photographer.id, startDate, endDate, {
        onlyApproved: mode === "guest",
      });
      if (conflicts.length) {
        setErr("ช่วงเวลานี้ตากล้องคนนี้มีคิวแล้ว กรุณาเลือกเวลาอื่นหรือเลือกคนอื่น");
        setBusy(false);
        return;
      }

      const startTs = Timestamp.fromDate(startDate);
      const endTs = Timestamp.fromDate(endDate);
      const bookingRef = doc(collection(db, "bookings"));
      const slotRef = doc(db, "slots", bookingRef.id);

      const batch = writeBatch(db);
      batch.set(bookingRef, {
        bookingType: "photographer",
        itemId: photographer.id,
        itemName: photographer.name,
        userId: mode === "guest" ? null : user!.uid,
        userName: mode === "guest" ? name.trim() : user!.name,
        userPhone: mode === "guest" ? phone.trim() : user!.phone,
        guestName: mode === "guest" ? name.trim() : null,
        guestEmail: mode === "guest" ? email.trim() : null,
        startAt: startTs,
        endAt: endTs,
        formImageUrl: null,
        returnImageUrl: null,
        usageReason: reason.trim(),
        usageType: jobType || null,
        location: location.trim(),
        crewSize: Number(crewSize) || 1,
        // กรรมการสั่งงาน = ตัดสินใจแล้ว ทีมเห็นงานในปฏิทินทันที
        status: assigning ? "approved" : "pending",
        assigneeIds: assigning ? assignees : [],
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
          itemId: photographer.id,
          itemName: photographer.name,
          bookingType: "photographer",
          startAt: startTs,
          endAt: endTs,
          status: assigning ? "approved" : "pending",
        })
      );

      // กรรมการมอบหมาย = ยืนยันทันที → เปิด "งานส่งไฟล์" ผูกกับงานถ่ายในชุดเดียว
      // (งานถ่ายกับงานส่งไฟล์เป็นงานเดียวกัน ไม่ต้องสร้างสองรอบ)
      if (assigning && settings.featureDeliveries !== false) {
        const dueMs = endTs.toMillis() + (settings.deliveryDefaultDays ?? 7) * 86_400_000;
        batch.set(doc(collection(db, "deliveries")), {
          title: jobType || photographer.name || "งานถ่ายภาพ",
          bookingId: bookingRef.id,
          customerUserId: user?.uid ?? null,
          customerName: user?.name || "งานชุมนุม",
          customerContact: user?.phone || "",
          assigneeIds: assignees,
          assignedToId: assignees[0] ?? null,
          assignedToName: null,
          uploadUrl: settings.uploadLinkUrl || null,
          downloadUrl: null,
          passcode: null,
          note: "",
          status: "awaiting_upload",
          dueAt: Timestamp.fromMillis(dueMs),
          expiresAt: null,
          createdById: user?.uid ?? "system",
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();
      setDone(true);
    } catch {
      setErr("ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${assigning ? "มอบหมายงาน" : "จอง"} ${photographer.name}`}>
      {done ? (
        <div className="py-4 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl tone-ok"><Icon name="success" size={28} /></span>
          <p className="font-semibold text-[var(--ink)]">
            {assigning ? "มอบหมายงานเรียบร้อย" : "ส่งคำขอจองเรียบร้อย"}
          </p>
          <p className="mt-1.5 text-sm text-[var(--muted-ink)]">
            {assigning
              ? "ทีมที่ได้รับมอบหมายเห็นงานนี้ในปฏิทินและหน้า “ของฉัน” แล้ว"
              : "ยังไม่ยืนยันคิว — ทีมงานจะตรวจสอบแล้วติดต่อกลับตามข้อมูลที่ให้ไว้"}
          </p>
          <Button onClick={onClose} className="mt-5" fullWidth>
            ปิด
          </Button>
        </div>
      ) : (
        <>
          {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

          {mode === "guest" && (
            <>
              <Field label="ชื่อ-นามสกุล" required>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} maxLength={100} placeholder="สมชาย ใจดี" />
              </Field>
              <div className="grid gap-0 sm:grid-cols-2 sm:gap-3">
                <Field label="อีเมล" required>
                  <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} maxLength={120} placeholder="you@example.com" />
                </Field>
                <Field label="เบอร์โทรศัพท์" required>
                  <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} maxLength={20} placeholder="0XXXXXXXXX" />
                </Field>
              </div>
            </>
          )}

          <Field label="ประเภทงาน" required>
            <select value={jobType} onChange={(e) => setJobType(e.target.value)} className={inputClass}>
              {settings.photographerJobTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <Field label="วันและเวลาที่ต้องการ" required help="ช่องที่ทึบคือมีคนจองตากล้องคนนี้ไว้แล้ว">
            <TimePicker
              slots={slots}
              blockedDays={blockedDays}
              itemId={photographer.id}
              value={range}
              onChange={setRange}
              maxAdvanceDays={settings.maxAdvanceDays}
              maxHours={24}
              detailed={isAdminRole(role)}
            />
          </Field>

          {assigning && (
            <Field
              label="มอบหมายให้"
              required
              help="คนที่กันวันนั้นไว้จะมีป้ายเตือน — มอบหมายได้อยู่ถ้าตกลงกันแล้ว"
            >
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className={`${inputClass} flex items-center justify-between text-left`}
              >
                <span className={assignees.length ? "text-[var(--ink)]" : "text-[var(--muted-ink)]"}>
                  {assignees.length === 0
                    ? "เลือกทีมงาน"
                    : assignees
                        .map((uid) => {
                          const u = users.find((x) => x.id === uid);
                          return u ? displayName(u) : uid;
                        })
                        .join(", ")}
                </span>
                <Icon name="chevronRight" size={16} className="shrink-0 text-[var(--muted-ink)]" />
              </button>
            </Field>
          )}

          <Field label="สถานที่ถ่าย" required>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} maxLength={200} placeholder="เช่น หอประชุมใหญ่ สจล." />
          </Field>

          <Field label="จำนวนตากล้องที่ต้องการ" help={`สูงสุด ${settings.maxCrewSize} คน`}>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={settings.maxCrewSize}
              value={crewSize}
              onChange={(e) => setCrewSize(Math.min(settings.maxCrewSize, Math.max(1, Number(e.target.value))))}
              className={inputClass}
            />
          </Field>

          <Field label="รายละเอียดงาน" required>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputClass} maxLength={500} placeholder="อธิบายงานที่ต้องการ จำนวนภาพ สไตล์ ฯลฯ" />
          </Field>

          <Button onClick={submit} loading={busy} fullWidth size="lg" className="mt-2">
            {assigning ? `ยืนยันการมอบหมาย (${assignees.length} คน)` : "ส่งคำขอจอง"}
          </Button>
          {!assigning && (
            <p className="mt-2 text-center text-xs text-[var(--muted-ink)]">
              ส่งแล้วรอทีมงานยืนยัน · ติดต่อ {settings.contactPhone}
            </p>
          )}

          {assigning && (
            <AssignPicker
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              users={users}
              selected={assignees}
              title="มอบหมายให้ทีมงาน"
              range={
                range.start !== null && range.end !== null
                  ? { startMs: range.start, endMs: range.end }
                  : undefined
              }
              busy={busyMap}
              onSave={setAssignees}
            />
          )}
        </>
      )}
    </Modal>
  );
}
