"use client";
// app/(member)/borrow/page.tsx — ยืมอุปกรณ์ (เลือกหลายชิ้น + แนบเอกสาร)
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, orderBy, addDoc, Timestamp, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { compressImageToDataUrl } from "@/lib/image";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection } from "@/lib/hooks";
import { PageHeader, Card, Spinner, Button, Field, inputClass, EmptyState } from "@/components/ui";
import { EQUIPMENT_TYPE_LABEL } from "@/lib/format";
import type { EquipmentDoc } from "@/lib/types";

export default function BorrowPage() {
  const { user, profile } = useAuth();
  const router = useRouter();

  const { data: equipments, loading } = useCollection<EquipmentDoc>(
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

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const canSubmit =
    selected.size > 0 && start && end && reason.trim() && file && new Date(end) > new Date(start) && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setErr("");
    if (!file) return setErr("กรุณาแนบเอกสารขออนุญาต");
    if (new Date(end) <= new Date(start)) return setErr("เวลาคืนต้องอยู่หลังเวลายืม");
    setBusy(true);
    try {
      // ย่อ+บีบอัดเอกสารเป็น data URL เก็บใน Firestore ตรง (ไม่ต้องใช้ Storage)
      // ใช้ครั้งเดียว แชร์กับทุกชิ้นที่เลือก
      const formImageUrl = await compressImageToDataUrl(file, 1400, 0.75);

      const userName = `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() || user.email || "";
      const items = equipments.filter((eq) => selected.has(eq.id));
      await Promise.all(
        items.map((eq) =>
          addDoc(collection(db, "bookings"), {
            bookingType: "equipment",
            itemId: eq.id,
            itemName: eq.name,
            userId: user.uid,
            userName,
            userPhone: profile?.phone ?? "",
            guestName: null,
            guestEmail: null,
            startAt: Timestamp.fromDate(new Date(start)),
            endAt: Timestamp.fromDate(new Date(end)),
            formImageUrl,
            returnImageUrl: null,
            usageReason: reason.trim(),
            usageType: null,
            status: "pending",
            responsibleUserId: null,
            responsibleUserName: null,
            consentToken: null,
            createdAt: serverTimestamp(),
          })
        )
      );
      router.push("/my-bookings");
    } catch {
      setErr("ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="ยืมอุปกรณ์" subtitle="เลือกอุปกรณ์ที่ต้องการ แนบเอกสาร แล้วส่งคำขอ" />

      <form onSubmit={submit}>
        <Card className="mb-4">
          <h3 className="mb-3 font-medium">เลือกอุปกรณ์ {selected.size > 0 && `(${selected.size} ชิ้น)`}</h3>
          {loading ? (
            <Spinner />
          ) : equipments.length === 0 ? (
            <EmptyState text="ไม่มีอุปกรณ์ว่างในขณะนี้" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {equipments.map((eq) => (
                <label
                  key={eq.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm ${
                    selected.has(eq.id) ? "border-orange-400 bg-orange-50" : "border-neutral-200"
                  }`}
                >
                  <input type="checkbox" checked={selected.has(eq.id)} onChange={() => toggle(eq.id)} />
                  <span>{eq.name}</span>
                  <span className="ml-auto text-xs text-neutral-400">{EQUIPMENT_TYPE_LABEL[eq.type]}</span>
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
              className="block w-full text-sm"
            />
            {file ? (
              <p className="mt-1 text-xs text-green-600">✅ แนบแล้ว: {file.name}</p>
            ) : (
              <p className="mt-1 text-xs text-red-500">⚠️ ต้องแนบเอกสารก่อนส่งคำขอ</p>
            )}
          </Field>
        </Card>

        {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">⚠️ {err}</div>}
        <Button type="submit" disabled={!canSubmit} className="w-full">
          {busy ? "กำลังส่ง…" : "ส่งคำขอยืมอุปกรณ์"}
        </Button>
      </form>
    </div>
  );
}
