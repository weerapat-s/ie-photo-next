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

  const shown = filter === "all" ? bookings : bookings.filter((b) => b.status === filter);

  // อนุมัติ/ปฏิเสธ + sync สถานะอุปกรณ์ + สร้าง feed
  async function decide(b: WithId<BookingDoc>, status: "approved" | "rejected") {
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

    const batch = writeBatch(db);
    batch.update(doc(db, "bookings", b.id), { status });
    if (status === "approved" && b.bookingType === "equipment") {
      batch.update(doc(db, "equipments", b.itemId), { status: "borrowed" });
    }
    await batch.commit();

    if (status === "approved") {
      await addDoc(collection(db, "feeds"), {
        message: `${b.userName} จอง${b.bookingType === "studio" ? "สตูดิโอ" : "อุปกรณ์"} "${b.itemName}" ได้รับการอนุมัติแล้ว`,
        bookingId: b.id,
        userId: b.userId,
        formImageUrl: b.formImageUrl,
        bookingStatus: "approved",
        likedBy: [],
        likeCount: 0,
        createdAt: serverTimestamp(),
      });
    }
  }

  // ยืนยันรับคืน → returned + อุปกรณ์ available
  async function confirmReturn(b: WithId<BookingDoc>) {
    const batch = writeBatch(db);
    batch.update(doc(db, "bookings", b.id), { status: "returned" });
    if (b.bookingType === "equipment") {
      batch.update(doc(db, "equipments", b.itemId), { status: "available" });
    }
    await batch.commit();
  }

  return (
    <div>
      <PageHeader title="รายการจอง" subtitle="อนุมัติ ปฏิเสธ และตรวจรับคืนอุปกรณ์" />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-sm ${
              filter === f.key ? "bg-orange-500 text-white" : "bg-neutral-100 text-neutral-600"
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
                    <span className="font-medium">{b.itemName}</span>
                    <Badge className={BOOKING_STATUS[b.status].cls}>{BOOKING_STATUS[b.status].label}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-neutral-600">
                    👤 {b.userName} {b.userPhone && `· 📞 ${b.userPhone}`}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {fmtDateTime(b.startAt)} → {fmtDateTime(b.endAt)}
                  </p>
                  {b.usageReason && <p className="mt-1 text-sm text-neutral-600">📝 {b.usageReason}</p>}
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
                        <Button onClick={() => decide(b, "approved")}>อนุมัติ</Button>
                        <Button variant="danger" onClick={() => decide(b, "rejected")}>
                          ปฏิเสธ
                        </Button>
                      </>
                    )}
                    {b.status === "pending_return" && <Button onClick={() => confirmReturn(b)}>ยืนยันรับคืน</Button>}
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
            <img src={viewImg} alt="evidence" className="max-h-[70vh] w-full rounded-lg object-contain" />
            <a href={viewImg} target="_blank" rel="noreferrer" className="mt-3 block text-center text-sm text-orange-600">
              เปิดในแท็บใหม่ ↗
            </a>
          </>
        )}
      </Modal>
    </div>
  );
}
