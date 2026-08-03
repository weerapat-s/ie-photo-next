"use client";
// app/(admin)/bookings/page.tsx — จัดการการจอง (อนุมัติ/ปฏิเสธ/ตรวจคืน)
import { useState } from "react";
import {
  collection, query, orderBy, doc, writeBatch, addDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useCollection } from "@/lib/hooks";
import { PageHeader, Card, Badge, Spinner, Button, Modal, EmptyState } from "@/components/ui";
import { fmtDateTime, BOOKING_STATUS } from "@/lib/format";
import type { BookingDoc, BookingStatus, WithId } from "@/lib/types";

const FILTERS: { key: BookingStatus | "all"; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "pending", label: "รอดำเนินการ" },
  { key: "approved", label: "อนุมัติแล้ว" },
  { key: "pending_return", label: "รอตรวจคืน" },
  { key: "returned", label: "คืนแล้ว" },
];

export default function AdminBookingsPage() {
  const { data: bookings, loading } = useCollection<BookingDoc>(
    () => query(collection(db, "bookings"), orderBy("createdAt", "desc")),
    []
  );
  const [filter, setFilter] = useState<BookingStatus | "all">("all");
  const [viewImg, setViewImg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const shown = filter === "all" ? bookings : bookings.filter((b) => b.status === filter);

  // อนุมัติ/ปฏิเสธ + sync slot + สร้าง feed
  async function decide(b: WithId<BookingDoc>, status: "approved" | "rejected") {
    if (actionBusy) return;
    setActionErr("");

    // เตือนถ้ามีการจองที่ "อนุมัติแล้ว" ของ item เดียวกัน ช่วงเวลาทับกัน
    if (status === "approved") {
      const overlap = bookings.find(
        (o) =>
          o.id !== b.id &&
          o.itemId === b.itemId &&
          o.status === "approved" &&
          o.startAt.toMillis() < b.endAt.toMillis() &&
          o.endAt.toMillis() > b.startAt.toMillis()
      );
      if (
        overlap &&
        !confirm(
          `⚠️ "${b.itemName}" มีการจองที่อนุมัติแล้วช่วงเวลาทับกัน (ของ ${overlap.userName})\nยืนยันอนุมัติซ้อนหรือไม่?`
        )
      ) {
        return;
      }
    }

    setActionBusy(b.id);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "bookings", b.id), { status });
      // slot: อนุมัติ = ยืนยันช่วงเวลา / ปฏิเสธ = ปล่อยช่วงเวลาคืน (ห้าม update ทิ้งไว้)
      if (status === "approved") {
        batch.update(doc(db, "slots", b.id), { status: "approved" });
      } else {
        batch.delete(doc(db, "slots", b.id));
      }
      await batch.commit();

      if (status === "approved") {
        await addDoc(collection(db, "feeds"), {
          message: `${b.userName} จอง${b.bookingType === "studio" ? "สตูดิโอ" : "อุปกรณ์"} "${b.itemName}" ได้รับการอนุมัติแล้ว`,
          bookingId: b.id,
          userId: b.userId,
          formImageUrl: null, // ❌ ห้ามก็อปเอกสารขออนุญาตขึ้นฟีดสาธารณะ
          bookingStatus: "approved",
          likedBy: [],
          likeCount: 0,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error("decide error:", err);
      setActionErr("ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setActionBusy(null);
    }
  }

  // ยืนยันรับคืน → returned + ลบ slot
  async function confirmReturn(b: WithId<BookingDoc>) {
    if (actionBusy) return;
    setActionErr("");
    setActionBusy(b.id);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "bookings", b.id), { status: "returned" });
      batch.delete(doc(db, "slots", b.id)); // คืนแล้ว = ปล่อยช่วงเวลา
      await batch.commit();
    } catch (err) {
      console.error("confirmReturn error:", err);
      setActionErr("บันทึกการรับคืนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title="รายการจอง" subtitle="อนุมัติ ปฏิเสธ และตรวจรับคืนอุปกรณ์" />

      {actionErr && (
        <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">
          ⚠️ {actionErr}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm transition ${
              filter === f.key
                ? "bg-orange-500 text-white shadow-[0_0_15px_rgba(255,91,31,0.4)] font-medium"
                : "bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border border-slate-700/50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState text="ไม่มีรายการในหมวดนี้" />
      ) : (
        <div className="space-y-3">
          {shown.map((b) => (
            <Card key={b.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span>{b.bookingType === "studio" ? "🎬" : "📷"}</span>
                    <span className="font-medium text-slate-100">{b.itemName}</span>
                    <Badge className={BOOKING_STATUS[b.status].cls}>{BOOKING_STATUS[b.status].label}</Badge>
                    {!b.userId && <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30">บุคคลภายนอก</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-slate-300">
                    👤 {b.userName} {b.userPhone && `· 📞 ${b.userPhone}`}
                    {b.guestEmail && ` · ✉️ ${b.guestEmail}`}
                  </p>
                  <p className="text-sm text-slate-400">
                    {fmtDateTime(b.startAt)} → {fmtDateTime(b.endAt)}
                  </p>
                  {b.usageReason && <p className="mt-1 text-sm text-slate-300">📝 {b.usageReason}</p>}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-2">
                    {b.formImageUrl && (
                      <Button variant="outline" onClick={() => setViewImg(b.formImageUrl!)}>
                        📄 เอกสาร
                      </Button>
                    )}
                    {b.returnImageUrl && (
                      <Button variant="outline" onClick={() => setViewImg(b.returnImageUrl!)}>
                        🖼️ รูปคืน
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {b.status === "pending" && (
                      <>
                        <Button onClick={() => decide(b, "approved")} disabled={actionBusy === b.id}>
                          {actionBusy === b.id ? "กำลังดำเนินการ…" : "อนุมัติ"}
                        </Button>
                        <Button variant="danger" onClick={() => decide(b, "rejected")} disabled={actionBusy === b.id}>
                          ปฏิเสธ
                        </Button>
                      </>
                    )}
                    {b.status === "pending_return" && (
                      <Button onClick={() => confirmReturn(b)} disabled={actionBusy === b.id}>
                        {actionBusy === b.id ? "กำลังดำเนินการ…" : "ยืนยันรับคืน"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!viewImg} onClose={() => setViewImg(null)} title="หลักฐาน" maxWidth="max-w-2xl">
        {viewImg && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewImg} alt="evidence" className="max-h-[70vh] w-full rounded-xl border border-white/10 object-contain" />
            <a href={viewImg} target="_blank" rel="noreferrer" className="mt-3 block text-center text-sm text-orange-400 hover:underline">
              เปิดในแท็บใหม่ ↗
            </a>
          </>
        )}
      </Modal>
    </div>
  );
}
