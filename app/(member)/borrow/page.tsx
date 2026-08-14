"use client";
// app/(member)/borrow/page.tsx — ยืมอุปกรณ์ (เลือกหลายชิ้น + แนบเอกสาร)
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, orderBy, doc, writeBatch, Timestamp, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { compressImageToDataUrl } from "@/lib/image";
import { findSlotConflicts, slotPayload } from "@/lib/slots";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection } from "@/lib/hooks";
import { PageHeader, Card, Spinner, Button, Field, inputClass, EmptyState } from "@/components/ui";
import { EQUIPMENT_TYPE_LABEL } from "@/lib/format";
import type { EquipmentDoc } from "@/lib/types";

const MAX_EQUIPMENT_PER_REQUEST = 6;

export default function BorrowPage() {
  const { user, profile } = useAuth();
  const router = useRouter();

  const { data: equipments, loading, error: loadError } = useCollection<EquipmentDoc>(
    () => query(collection(db, "equipments"), where("status", "==", "available"), orderBy("type")),
    []
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const nowLocal = useMemo(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }, []);

  const availableEquipmentIds = useMemo(() => new Set(equipments.map((equipment) => equipment.id)), [equipments]);
  const availableSelected = useMemo(
    () => new Set([...selected].filter((id) => availableEquipmentIds.has(id))),
    [availableEquipmentIds, selected]
  );

  function toggle(id: string) {
    if (!availableSelected.has(id) && availableSelected.size >= MAX_EQUIPMENT_PER_REQUEST) {
      setErr("เลือกอุปกรณ์ได้สูงสุด " + MAX_EQUIPMENT_PER_REQUEST + " ชิ้นต่อคำขอ");
      return;
    }
    setErr("");
    setSelected((prev) => {
      // Discard equipment that became unavailable while the form was open.
      const next = new Set([...prev].filter((selectedId) => availableEquipmentIds.has(selectedId)));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const canSubmit =
    availableSelected.size > 0 &&
    availableSelected.size <= MAX_EQUIPMENT_PER_REQUEST &&
    start &&
    end &&
    reason.trim() &&
    file &&
    new Date(end) > new Date(start) &&
    !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || busy) return;
    setErr("");
    if (!file) return setErr("กรุณาแนบเอกสารขออนุญาต");
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (endDate <= startDate) return setErr("เวลาคืนต้องอยู่หลังเวลายืม");
    if (startDate.getTime() < Date.now() - 60_000) return setErr("ไม่สามารถจองเวลาในอดีตได้");
    setBusy(true);
    try {
      const items = equipments.filter((eq) => availableSelected.has(eq.id));

      // #6 — ถ้าอุปกรณ์หลุดจาก list ระหว่างกรอก → แจ้ง error ชัดเจน
      if (items.length === 0) {
        setErr("อุปกรณ์ที่เลือกไม่พร้อมใช้งานแล้ว กรุณาเลือกใหม่");
        setBusy(false);
        return;
      }
      if (items.length > MAX_EQUIPMENT_PER_REQUEST) {
        setErr("เลือกอุปกรณ์ได้สูงสุด " + MAX_EQUIPMENT_PER_REQUEST + " ชิ้นต่อคำขอ");
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
      // ใช้ครั้งเดียว แชร์กับทุกชิ้นที่เลือก
      const formImageUrl = await compressImageToDataUrl(file, 1400, 0.75);

      const userName = `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() || user.email || "";
      const startTs = Timestamp.fromDate(startDate);
      const endTs = Timestamp.fromDate(endDate);

      // จำกัดจำนวนรายการและ data URL ใน lib/image ให้ต่ำกว่าเพดาน batch 10 MiB
      const batch = writeBatch(db);
      for (const eq of items) {
        const bRef = doc(collection(db, "bookings"));
        batch.set(bRef, {
          bookingType: "equipment",
          itemId: eq.id,
          itemName: eq.name,
          userId: user.uid,
          userName,
          userPhone: profile?.phone ?? "",
          guestName: null,
          guestEmail: null,
          startAt: startTs,
          endAt: endTs,
          formImageUrl,
          returnImageUrl: null,
          usageReason: reason.trim(),
          usageType: null,
          status: "pending",
          responsibleUserId: null,
          responsibleUserName: null,
          consentToken: null,
          createdAt: serverTimestamp(),
        });
        batch.set(doc(db, "slots", bRef.id), slotPayload({
          bookingId: bRef.id, itemId: eq.id, itemName: eq.name,
          bookingType: "equipment", startAt: startTs, endAt: endTs,
        }));
      }
      await batch.commit();
      router.push("/my-bookings");
    } catch (error) {
      const message = error instanceof Error && error.message === "IMAGE_TOO_LARGE"
        ? "รูปมีขนาดใหญ่เกินไป กรุณาเลือกรูปที่เล็กลง"
        : "ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
      setErr(message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="ยืมอุปกรณ์" subtitle="เลือกอุปกรณ์ที่ต้องการ แนบเอกสาร แล้วส่งคำขอ" />
      <p className="mb-4 text-sm text-muted-foreground">
        ส่งคำขอได้สูงสุด {MAX_EQUIPMENT_PER_REQUEST} ชิ้นต่อครั้ง เพื่อให้เอกสารแนบถูกบันทึกครบทุกชิ้น
      </p>

      <form onSubmit={submit}>
        <Card className="mb-4">
          <h3 className="mb-3 font-medium text-slate-100">เลือกอุปกรณ์ {availableSelected.size > 0 && `(${availableSelected.size} ชิ้น)`}</h3>
          {loading ? (
            <Spinner />
          ) : loadError ? (
            <EmptyState icon="⚠️" text="โหลดรายการอุปกรณ์ไม่สำเร็จ กรุณารีเฟรชหน้า" />
          ) : equipments.length === 0 ? (
            <EmptyState text="ไม่มีอุปกรณ์ว่างในขณะนี้" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {equipments.map((eq) => (
                <label
                  key={eq.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm transition ${
                    availableSelected.has(eq.id)
                      ? "border-orange-500/50 bg-orange-500/15 text-slate-100 shadow-[0_0_15px_rgba(255,91,31,0.2)]"
                      : "border-slate-800/80 bg-slate-900/40 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40"
                  }`}
                >
                  <input type="checkbox" checked={availableSelected.has(eq.id)} onChange={() => toggle(eq.id)} className="accent-orange-500" />
                  <span>{eq.name}</span>
                  <span className="ml-auto text-xs text-slate-400">{EQUIPMENT_TYPE_LABEL[eq.type]}</span>
                </label>
              ))}
            </div>
          )}
        </Card>

        <Card className="mb-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="วันเวลาที่ยืม" required>
              <input type="datetime-local" min={nowLocal} value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
            </Field>
            <Field label="วันเวลาที่คืน" required>
              <input type="datetime-local" min={start || nowLocal} value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Field label="วัตถุประสงค์" required>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={inputClass} />
          </Field>
          <Field label="เอกสารขออนุญาต — ถ่ายรูปหรือแนบภาพ (JPG, PNG)" required>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
            />
            {file ? (
              <p className="mt-1 text-xs text-emerald-400">✅ แนบแล้ว: {file.name}</p>
            ) : (
              <p className="mt-1 text-xs text-red-400">⚠️ ต้องแนบเอกสารก่อนส่งคำขอ</p>
            )}
          </Field>
        </Card>

        {err && <div className="mb-3 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">⚠️ {err}</div>}
        <Button type="submit" disabled={!canSubmit} className="w-full">
          {busy ? "กำลังส่ง…" : "ส่งคำขอยืมอุปกรณ์"}
        </Button>
      </form>
    </div>
  );
}
