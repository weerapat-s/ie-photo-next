"use client";
// app/(member)/my-bookings/page.tsx — การจองของฉัน + คืนอุปกรณ์
import { useState } from "react";
import { collection, query, where, orderBy, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { compressImageToDataUrl } from "@/lib/image";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection } from "@/lib/hooks";
import { PageHeader, Card, Badge, Spinner, Button, Modal, EmptyState } from "@/components/ui";
import { fmtDateTime, BOOKING_STATUS } from "@/lib/format";
import type { BookingDoc, WithId } from "@/lib/types";

export default function MyBookingsPage() {
  const { user } = useAuth();
  const { data: bookings, loading, error } = useCollection<BookingDoc>(
    () =>
      user ? query(collection(db, "bookings"), where("userId", "==", user.uid), orderBy("createdAt", "desc")) : null,
    [user?.uid]
  );
  const [returning, setReturning] = useState<WithId<BookingDoc> | null>(null);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="การจองของฉัน" subtitle="ดูสถานะและคืนอุปกรณ์" />

      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState icon="⚠️" text="โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้า" />
      ) : bookings.length === 0 ? (
        <EmptyState text="ยังไม่มีการจอง" />
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <Card key={b.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span>{b.bookingType === "studio" ? "🎬" : "📷"}</span>
                    <span className="font-medium">{b.itemName}</span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-500">
                    {fmtDateTime(b.startAt)} → {fmtDateTime(b.endAt)}
                  </p>
                  {b.usageReason && <p className="mt-1 text-sm text-neutral-600">{b.usageReason}</p>}
                </div>
                <Badge className={BOOKING_STATUS[b.status].cls}>{BOOKING_STATUS[b.status].label}</Badge>
              </div>

              {b.bookingType === "equipment" && b.status === "approved" && (
                <div className="mt-3 border-t border-neutral-100 pt-3">
                  <Button variant="outline" onClick={() => setReturning(b)}>
                    📸 คืนอุปกรณ์ (แนบรูป)
                  </Button>
                </div>
              )}
              {b.status === "pending_return" && (
                <p className="mt-2 text-xs text-purple-600">รอแอดมินตรวจรับคืน</p>
              )}
            </Card>
          ))}
        </div>
      )}

      {returning && <ReturnModal booking={returning} onClose={() => setReturning(null)} />}
    </div>
  );
}

function ReturnModal({ booking, onClose }: { booking: WithId<BookingDoc>; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPreview(URL.createObjectURL(f));
    }
  }

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
      {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">⚠️ {err}</div>}
      <p className="mb-3 text-sm text-neutral-500">ถ่ายรูปอุปกรณ์เป็นหลักฐานก่อนยืนยันการคืน</p>
      <input type="file" accept="image/*" onChange={pick} className="mb-3 block w-full text-sm" />
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="preview" className="mb-3 max-h-48 w-full rounded-lg object-contain" />
      )}
      <Button onClick={submit} disabled={!file || busy} className="w-full">
        {busy ? "กำลังส่ง…" : "ยืนยันการคืน"}
      </Button>
    </Modal>
  );
}
