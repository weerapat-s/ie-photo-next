"use client";
// app/(member)/borrow/page.tsx — ยืมอุปกรณ์ (เลือกหลายชิ้น + แนบเอกสาร)
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, orderBy, doc, writeBatch, Timestamp, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { compressImageToDataUrl } from "@/lib/image";
import { findSlotConflicts, slotPayload } from "@/lib/slots";
import { generateRequestId } from "@/lib/qr";
import { useAuth } from "@/lib/firebase/auth-context";
import { useSettings } from "@/lib/settings-context";
import { useCollection, useNow } from "@/lib/hooks";
import {
  Card,
  Spinner,
  Button,
  Field,
  inputClass,
  EmptyState,
  Alert,
  ChipBar,
  ImagePicker,
} from "@/components/ui";
import { EQUIPMENT_TYPE_LABEL } from "@/lib/format";
import TimePicker, { type TimeRange } from "@/components/time-picker";
import AssignPicker from "@/components/assign-picker";
import { buildBusyMap } from "@/lib/availability";
import { pairRequirements, unmetRequirements, describeUnmet } from "@/lib/pairing";
import { isAdminRole, displayName } from "@/lib/roles";
import { activeJobNames } from "@/lib/jobs";
import Icon from "@/components/icon";
import EquipmentThumb from "@/components/equipment-thumb";
import type { AvailabilityDoc, BookingDoc, EquipmentDoc, EquipmentType, SlotDoc, UserDoc } from "@/lib/types";

type TypeFilter = EquipmentType | "all";

/** self = ยืมในนามตัวเอง · assign = กรรมการสั่งให้คนอื่นรับผิดชอบของ (ยืนยันทันที) */
export default function BorrowPanel({ mode = "self" }: { mode?: "self" | "assign" }) {
  const { user, profile } = useAuth();
  const assigning = mode === "assign";
  const { settings } = useSettings();
  const router = useRouter();

  const { data: equipments, loading, error: loadError } = useCollection<EquipmentDoc>(
    () => query(collection(db, "equipments"), where("status", "==", "available"), orderBy("type")),
    []
  );

  // ตารางคิวทั้งระบบ — ใช้โชว์ว่าช่วงไหนอุปกรณ์ถูกจองแล้ว
  const { data: slots } = useCollection<SlotDoc>(() => collection(db, "slots"), []);

  // งานชุมนุมที่ "ยังไม่จบ" — งานที่เสร็จ/ผ่านเวลาไปแล้วจะหายจากตัวเลือกเอง (ดู lib/jobs.ts)
  // (ระบบไม่มีคอลเลกชัน "งาน" แยก — งานคือชื่อที่ผูกไว้ใน bookings หลายใบ)
  const { data: allBookings } = useCollection<BookingDoc>(() => collection(db, "bookings"), []);
  // now ต้องมาก่อน clubJobs เพราะใช้ตัดงานที่จบแล้วออก (เรียก Date.now() ตอน render ไม่ได้)
  const now = useNow(60_000);
  const clubJobs = useMemo(() => activeJobNames(allBookings, now).slice(0, 30), [allBookings, now]);

  // โหมดมอบหมายต้องเลือกได้ว่าใครถือของ — อุปกรณ์รับผิดชอบได้ทีละคน
  // (ของหายต้องรู้ชัดว่าใครถือ ไม่ใช่หารกันรับผิด)
  const { data: users } = useCollection<UserDoc>(
    () => (assigning ? collection(db, "users") : null),
    [assigning]
  );
  const { data: availability } = useCollection<AvailabilityDoc>(
    () => (assigning ? collection(db, "availability") : null),
    [assigning]
  );
  const busyMap = useMemo(() => buildBusyMap(availability), [availability]);
  const [holder, setHolder] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [range, setRange] = useState<TimeRange>({ start: null, end: null });
  const [reason, setReason] = useState("");
  /**
   * งานชุมนุมหรืองานส่วนตัว — เก็บลง usageType ใช้ฟิลด์เดียวกับงานถ่าย
   * จึงไปโผล่ในระบบสั่งงาน/ภาระงาน/รายงานได้เหมือนกันโดยไม่ต้องเพิ่มฟิลด์ใหม่
   * และกรรมการเห็นทันทีว่าของออกไปเพื่อชุมนุมหรือเรื่องส่วนตัว
   */
  const [forClub, setForClub] = useState(true);
  /** ชื่องานชุมนุมที่เลือก (ว่าง = ยังไม่เลือก) */
  const [clubJob, setClubJob] = useState("");
  /** true = กำลังพิมพ์ชื่องานใหม่ */
  const [creatingJob, setCreatingJob] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // อุปกรณ์อาจถูกยืม/ถูกลบระหว่างที่ผู้ใช้กรอกฟอร์ม — คัดเฉพาะที่ยังว่างจริงตอน render
  // (ไม่ sync ด้วย effect เพื่อเลี่ยง render ซ้อน)
  const availableIds = useMemo(() => new Set(equipments.map((e) => e.id)), [equipments]);
  const selectedIds = useMemo(
    () => [...selected].filter((id) => availableIds.has(id)),
    [selected, availableIds]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const shown = typeFilter === "all" ? equipments : equipments.filter((e) => e.type === typeFilter);

  // ของที่ต้องเบิกคู่กัน — คำนวณจากสิ่งที่เลือกไว้ตอนนี้ (ดู lib/pairing.ts)
  const pairs = useMemo(() => pairRequirements(selectedIds, equipments), [selectedIds, equipments]);
  const unmet = useMemo(() => unmetRequirements(selectedIds, equipments), [selectedIds, equipments]);
  // กรรมการสั่งงานเองไม่ต้องแนบใบขออนุญาต — เอกสารมีไว้กันสมาชิกยืมตามอำเภอใจ
  const docRequired = settings.requireBorrowDocument && !assigning;

  const canSubmit =
    selectedIds.length > 0 &&
    range.start !== null &&
    range.end !== null &&
    reason.trim() &&
    unmet.length === 0 &&
    (!assigning || holder.length === 1) &&
    (!docRequired || file) &&
    range.end > range.start &&
    !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || busy) return;
    setErr("");
    if (docRequired && !file) return setErr("กรุณาแนบเอกสารขออนุญาต");
    if (assigning && holder.length !== 1) return setErr("เลือกผู้รับผิดชอบ 1 คน");
    if (unmet.length > 0) return setErr(describeUnmet(unmet));

    if (forClub && !clubJob.trim()) {
      setErr("เลือกงานชุมนุม หรือสร้างงานใหม่ก่อน");
      setCreatingJob(true);
      return;
    }
    if (range.start === null || range.end === null) return setErr("กรุณาเลือกวันและเวลาให้ครบ");
    const startDate = new Date(range.start);
    const endDate = new Date(range.end);
    if (endDate <= startDate) return setErr("เวลาคืนต้องอยู่หลังเวลายืม");
    if (range.start < now - 60_000) return setErr("ไม่สามารถจองเวลาในอดีตได้");
    if (endDate.getTime() - startDate.getTime() > settings.maxBorrowDays * 86_400_000)
      return setErr(`ยืมได้ครั้งละไม่เกิน ${settings.maxBorrowDays} วัน`);

    setBusy(true);
    try {
      const items = equipments.filter((eq) => selectedIds.includes(eq.id));
      if (items.length === 0) {
        setErr("อุปกรณ์ที่เลือกไม่พร้อมใช้งานแล้ว กรุณาเลือกใหม่");
        setBusy(false);
        return;
      }

      // เช็คการจองซ้อน — member นับทั้ง pending+approved ว่าชน
      const conflictNames: string[] = [];
      for (const eq of items) {
        const conflicts = await findSlotConflicts(eq.id, startDate, endDate);
        if (conflicts.length) conflictNames.push(eq.name);
      }
      if (conflictNames.length) {
        setErr(`ช่วงเวลานี้ถูกจองแล้ว: ${conflictNames.join(", ")} — กรุณาเลือกเวลาอื่น`);
        setBusy(false);
        return;
      }

      // ย่อ+บีบอัดเอกสารเป็น data URL เก็บใน Firestore ตรง (ไม่ต้องใช้ Storage)
      const formImageUrl = file ? await compressImageToDataUrl(file, 1400, 0.75) : null;

      // ผู้ถือของคือเจ้าของรายการจอง — เขาจะเห็นในหน้า "ของฉัน" และกดคืนเองได้
      const holderDoc = assigning ? users.find((u) => u.id === holder[0]) : null;
      const ownerId = holderDoc ? holderDoc.id : user.uid;
      const ownerName = holderDoc
        ? displayName(holderDoc)
        : `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() || user.email || "";
      const ownerPhone = holderDoc ? (holderDoc.phone ?? "") : (profile?.phone ?? "");
      const startTs = Timestamp.fromDate(startDate);
      const endTs = Timestamp.fromDate(endDate);

      // ของที่กดยืมพร้อมกันใช้ requestId เดียวกัน → ทำ QR ใบเดียวคุมทั้งคำขอได้
      const requestId = generateRequestId();

      // เขียนทั้งหมดใน batch เดียว (2N writes, ลิมิต 500 — เหลือเฟือ)
      const batch = writeBatch(db);
      for (const eq of items) {
        const bRef = doc(collection(db, "bookings"));
        batch.set(bRef, {
          requestId,
          bookingType: "equipment",
          itemId: eq.id,
          itemName: eq.name,
          userId: ownerId,
          userName: ownerName,
          userPhone: ownerPhone,
          guestName: null,
          guestEmail: null,
          startAt: startTs,
          endAt: endTs,
          formImageUrl,
          returnImageUrl: null,
          usageReason: reason.trim(),
          usageType: forClub ? (clubJob.trim() ? `ชุมนุม: ${clubJob.trim()}` : "งานชุมนุม") : "งานส่วนตัว",
          location: null,
          crewSize: null,
          status: assigning ? "approved" : "pending",
          assigneeIds: assigning ? [ownerId] : [],
          responsibleUserId: null,
          responsibleUserName: null,
          consentToken: null,
          formId: null,
          formResponseId: null,
          createdAt: serverTimestamp(),
        });
        batch.set(
          doc(db, "slots", bRef.id),
          slotPayload({
            bookingId: bRef.id,
            itemId: eq.id,
            itemName: eq.name,
            bookingType: "equipment",
            startAt: startTs,
            endAt: endTs,
            status: assigning ? "approved" : "pending",
          })
        );
      }
      await batch.commit();
      router.push(assigning ? "/workflow" : `/my-bookings?request=${requestId}`);
    } catch (error) {
      setErr(
        error instanceof Error && error.message === "IMAGE_TOO_LARGE"
          ? "รูปมีขนาดใหญ่เกินไป กรุณาเลือกรูปที่เล็กลง"
          : "ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
      );
      setBusy(false);
    }
  }

  return (
    <div>

      <form onSubmit={submit}>
        <Card className="mb-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-bold text-[var(--ink)]">เลือกอุปกรณ์</h3>
            {selectedIds.length > 0 && (
              <span className="rounded-full bg-[var(--faculty)]/10 px-2.5 py-0.5 text-xs font-semibold text-[var(--faculty)]">
                เลือกแล้ว {selectedIds.length} ชิ้น
              </span>
            )}
          </div>

          {!loading && !loadError && equipments.length > 0 && (
            <ChipBar
              className="mb-3"
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { key: "all", label: "ทั้งหมด", count: equipments.length },
                { key: "camera", label: "กล้อง", icon: "equipment", count: equipments.filter((e) => e.type === "camera").length },
                { key: "lens", label: "เลนส์", icon: "search", count: equipments.filter((e) => e.type === "lens").length },
                { key: "memory", label: "เมม", icon: "inventory", count: equipments.filter((e) => e.type === "memory").length },
                { key: "accessory", label: "อื่น ๆ", icon: "inventory", count: equipments.filter((e) => e.type === "accessory").length },
              ]}
            />
          )}

          {loading ? (
            <Spinner />
          ) : loadError ? (
            <EmptyState icon="warning" text="โหลดรายการอุปกรณ์ไม่สำเร็จ กรุณารีเฟรชหน้า" />
          ) : shown.length === 0 ? (
            <EmptyState text="ไม่มีอุปกรณ์ว่างในหมวดนี้" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {shown.map((eq) => {
                const on = selected.has(eq.id);
                return (
                  <label
                    key={eq.id}
                    className={`press flex min-h-[52px] cursor-pointer items-center gap-2.5 rounded-2xl border p-3 text-sm transition ${
                      on
                        ? "border-[var(--faculty)] bg-[var(--faculty)]/8 font-semibold shadow-[0_6px_18px_rgba(239,57,97,0.14)]"
                        : "border-black/8 bg-white/60 hover:bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(eq.id)}
                      className="h-[18px] w-[18px] shrink-0 accent-[var(--faculty)]"
                    />
                    <EquipmentThumb type={eq.type} imageUrl={eq.imageUrl} name={eq.name} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{eq.name}</span>
                    <span className="shrink-0 text-xs text-[var(--muted-ink)]">{EQUIPMENT_TYPE_LABEL[eq.type]}</span>
                  </label>
                );
              })}
            </div>
          )}

          {pairs.length > 0 && (
            <div className="mt-4 border-t border-[var(--hairline)] pt-4">
              <p className="t-label mb-2 text-[var(--ink)]">ของที่ต้องเบิกคู่กัน</p>
              <div className="space-y-2">
                {pairs.map((r, i) => {
                  const done = r.chosen.length > 0;
                  return (
                    <div
                      key={`${r.ownerId}-${i}`}
                      className={`rounded-2xl p-3 ${done ? "tone-ok" : r.required ? "tone-warn" : "tone-mute"}`}
                    >
                      <p className="t-label flex items-center gap-1.5">
                        <Icon name={done ? "approved" : r.required ? "warning" : "info"} size={16} />
                        {r.ownerName} · {r.label}
                        {!r.required && <span className="t-caption font-normal">(ไม่บังคับ)</span>}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {r.options.map((opt) => {
                          const on = selected.has(opt.id);
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => toggle(opt.id)}
                              className={`press rounded-full px-3 py-1 text-xs font-semibold transition ${
                                on ? "bg-[var(--faculty)] text-white" : "bg-white text-[var(--ink)]/80"
                              }`}
                            >
                              {on ? "✓ " : "+ "}
                              {opt.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        <Card className="mb-4">
          <Field
            label="ช่วงเวลาที่ยืม"
            required
            help={
              selectedIds.length === 0
                ? "เลือกอุปกรณ์ก่อน แล้วตารางจะบอกว่าช่วงไหนถูกจองแล้ว"
                : `ช่องที่ทึบคืออุปกรณ์ที่เลือกถูกจองไว้แล้ว · ยืมได้ไม่เกิน ${settings.maxBorrowDays} วัน`
            }
          >
            <TimePicker
              slots={slots}
              itemId={selectedIds}
              value={range}
              onChange={setRange}
              maxAdvanceDays={settings.maxAdvanceDays}
              maxHours={settings.maxBorrowDays * 24}
              maxDays={settings.maxBorrowDays}
              detailed={isAdminRole(profile?.role)}
            />
          </Field>
          {assigning && (
            <Field label="ผู้รับผิดชอบ" required help="คนเดียวต่อการมอบหมาย 1 ครั้ง — ของหายจะรู้ทันทีว่าใครถือ">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className={`${inputClass} flex items-center justify-between text-left`}
              >
                <span className={holder.length ? "text-[var(--ink)]" : "text-[var(--muted-ink)]"}>
                  {holder.length === 0
                    ? "เลือกผู้รับผิดชอบ"
                    : (() => {
                        const u = users.find((x) => x.id === holder[0]);
                        return u ? displayName(u) : holder[0];
                      })()}
                </span>
                <Icon name="chevronRight" size={16} className="shrink-0 text-[var(--muted-ink)]" />
              </button>
            </Field>
          )}

          <Field label="ยืมไปทำอะไร" required>
            <div className="grid grid-cols-2 gap-2">
              {[
                { club: true, label: "งานชุมนุม", icon: "members" as const, desc: "งานที่ชุมนุมรับมา" },
                { club: false, label: "งานส่วนตัว", icon: "user" as const, desc: "ฝึกฝน/งานของตัวเอง" },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => setForClub(o.club)}
                  aria-pressed={forClub === o.club}
                  className={`press rounded-2xl border-2 p-3 text-left transition ${
                    forClub === o.club
                      ? "border-[var(--faculty)] bg-[var(--faculty)]/8"
                      : "border-[var(--hairline-strong)] bg-white"
                  }`}
                >
                  <Icon
                    name={o.icon}
                    size={20}
                    className={forClub === o.club ? "text-[var(--faculty)]" : "text-[var(--muted-ink)]"}
                  />
                  <span className="t-label mt-1.5 block text-[var(--ink)]">{o.label}</span>
                  <span className="t-caption block">{o.desc}</span>
                </button>
              ))}
            </div>

            {/* งานชุมนุม → เลือกงาน หรือสร้างใหม่ (อยู่ในหน้าเดิม ข้อมูลไม่หาย)
                งานส่วนตัว → ไม่ต้องเลือกอะไร */}
            {forClub && (
              <div className="mt-3 surface-sunken rounded-2xl p-3" data-field-invalid={forClub && !clubJob.trim() && err ? "" : undefined}>
                <p className="t-label mb-2 text-[var(--ink)]">ยืมเพื่องานไหน</p>

                {!creatingJob && clubJobs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {clubJobs.map((j) => (
                      <button
                        key={j}
                        type="button"
                        onClick={() => setClubJob(j)}
                        className={`press rounded-full px-3 py-2 text-sm font-medium transition ${
                          clubJob === j
                            ? "bg-[var(--faculty)] text-white"
                            : "bg-white text-[var(--ink)] ring-1 ring-[var(--hairline-strong)]"
                        }`}
                      >
                        {j}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingJob(true);
                        setClubJob("");
                      }}
                      className="press inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-[var(--faculty)] ring-1 ring-[var(--faculty)]/30"
                    >
                      <Icon name="add" size={16} /> งานใหม่
                    </button>
                  </div>
                )}

                {(creatingJob || clubJobs.length === 0) && (
                  <div>
                    <input
                      value={clubJob}
                      onChange={(e) => setClubJob(e.target.value)}
                      placeholder="ชื่องาน เช่น ถ่ายรับปริญญา รุ่น 68"
                      className={inputClass}
                      maxLength={120}
                      autoFocus
                    />
                    {clubJobs.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setCreatingJob(false);
                          setClubJob("");
                        }}
                        className="press t-caption mt-2 font-semibold text-[var(--muted-ink)]"
                      >
                        ← เลือกจากงานที่มีอยู่
                      </button>
                    )}
                  </div>
                )}

                {clubJob.trim() && (
                  <p className="t-caption mt-2 flex items-center gap-1.5 text-[var(--tone-ok-ink)]">
                    <Icon name="approved" size={16} /> ยืมเพื่อ &ldquo;{clubJob.trim()}&rdquo;
                  </p>
                )}
              </div>
            )}
          </Field>

          <Field label="รายละเอียด" required>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputClass} maxLength={500} placeholder="ใช้ทำอะไร ที่ไหน" />
          </Field>
          <Field
            label="เอกสารขออนุญาต"
            required={docRequired}
            help={docRequired ? "ถ่ายรูปเอกสารที่มีลายเซ็นอาจารย์" : "ไม่บังคับ — แนบได้ถ้ามี"}
          >
            <ImagePicker
              file={file}
              preview={preview}
              onPick={(f) => {
                setFile(f);
                setPreview(f ? URL.createObjectURL(f) : null);
              }}
            />
          </Field>
        </Card>

        {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

        <Button type="submit" disabled={!canSubmit} loading={busy} fullWidth size="lg">
          {assigning ? `มอบหมายอุปกรณ์ ${selectedIds.length} ชิ้น` : "ส่งคำขอยืมอุปกรณ์"}
        </Button>
        {assigning && (
          <AssignPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            users={users}
            selected={holder}
            title="เลือกผู้รับผิดชอบอุปกรณ์"
            range={
              range.start !== null && range.end !== null
                ? { startMs: range.start, endMs: range.end }
                : undefined
            }
            busy={busyMap}
            onSave={(uids) => setHolder(uids.slice(-1))}
          />
        )}
      </form>
    </div>
  );
}
