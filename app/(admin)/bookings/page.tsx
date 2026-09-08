"use client";
// app/(admin)/bookings/page.tsx — จัดการการจอง (อนุมัติ/ปฏิเสธ/ตรวจคืน)
import { useMemo, useState } from "react";
import { collection, query, orderBy, doc, writeBatch, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useCollection } from "@/lib/hooks";
import {
  PageHeader,
  Card,
  Badge,
  Spinner,
  Button,
  Modal,
  EmptyState,
  Alert,
  ChipBar,
  Row,
  useToast,
  SearchInput
} from "@/components/ui";
import Icon from "@/components/icon";
import {
  fmtRange,
  fmtDateTime,
  BOOKING_STATUS,
  BOOKING_TYPE_ICON,
  BOOKING_TYPE_LABEL,
} from "@/lib/format";
import type { BookingDoc, BookingStatus, WithId } from "@/lib/types";

const FILTERS: { key: BookingStatus | "all"; label: string }[] = [
  { key: "pending", label: "รอดำเนินการ" },
  { key: "approved", label: "อนุมัติแล้ว" },
  { key: "pending_return", label: "รอตรวจคืน" },
  { key: "returned", label: "คืนแล้ว" },
  { key: "all", label: "ทั้งหมด" },
];

export default function AdminBookingsPage() {
  const { data: bookings, loading } = useCollection<BookingDoc>(
    () => query(collection(db, "bookings"), orderBy("createdAt", "desc")),
    []
  );
  const { show, node: toastNode } = useToast();

  const [filter, setFilter] = useState<BookingStatus | "all">("pending");
  const [search, setSearch] = useState("");
  const [viewImg, setViewImg] = useState<string | null>(null);
  const [detail, setDetail] = useState<WithId<BookingDoc> | null>(null);
  const [actionErr, setActionErr] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const shown = useMemo(() => {
    const byStatus = filter === "all" ? bookings : bookings.filter((b) => b.status === filter);
    const q = search.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter(
      (b) =>
        b.itemName.toLowerCase().includes(q) ||
        b.userName.toLowerCase().includes(q) ||
        (b.userPhone ?? "").includes(q)
    );
  }, [bookings, filter, search]);

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
      if (status === "approved") batch.update(doc(db, "slots", b.id), { status: "approved" });
      else batch.delete(doc(db, "slots", b.id));
      await batch.commit();

      if (status === "approved") {
        await addDoc(collection(db, "feeds"), {
          message: `${b.userName} จอง${BOOKING_TYPE_LABEL[b.bookingType]} "${b.itemName}" ได้รับการอนุมัติแล้ว`,
          bookingId: b.id,
          userId: b.userId,
          formImageUrl: null, // ❌ ห้ามก็อปเอกสารขออนุญาตขึ้นฟีดสาธารณะ
          bookingStatus: "approved",
          likedBy: [],
          likeCount: 0,
          createdAt: serverTimestamp(),
        });
      }
      show(status === "approved" ? "อนุมัติแล้ว" : "ปฏิเสธแล้ว");
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
      show("บันทึกการรับคืนแล้ว");
    } catch (err) {
      console.error("confirmReturn error:", err);
      setActionErr("บันทึกการรับคืนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="ADMIN" title="รายการจอง" subtitle="อนุมัติ ปฏิเสธ และตรวจรับคืน" />

      {actionErr && <Alert onClose={() => setActionErr("")}>{actionErr}</Alert>}

      <SearchInput value={search} onChange={setSearch} placeholder="ค้นหาชื่อผู้จอง / อุปกรณ์ / เบอร์โทร" className="mb-3" />

      <ChipBar
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((f) => ({
          ...f,
          count: f.key === "all" ? bookings.length : bookings.filter((b) => b.status === f.key).length,
        }))}
      />

      {loading ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState text="ไม่มีรายการในหมวดนี้" />
      ) : (
        <div className="stagger space-y-3">
          {shown.map((b, i) => {
            const busy = actionBusy === b.id;
            return (
              <Card key={b.id} style={{ ["--i" as string]: Math.min(i, 12) }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon name={BOOKING_TYPE_ICON[b.bookingType]} size={18} className="text-[var(--faculty)]" />
                      <span className="font-bold text-[var(--ink)]">{b.itemName}</span>
                      <Badge className={BOOKING_STATUS[b.status].cls}>{BOOKING_STATUS[b.status].label}</Badge>
                      {!b.userId && (
                        <Badge className="bg-amber-100 text-amber-800 border border-amber-200">บุคคลภายนอก</Badge>
                      )}
                    </div>
                    <p className="t-body mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[var(--ink)]/80">
                      <span className="inline-flex items-center gap-1.5">
                        <Icon name="user" size={16} /> {b.userName}
                      </span>
                      {b.userPhone && (
                        <a
                          href={`tel:${b.userPhone}`}
                          className="inline-flex items-center gap-1.5 font-semibold text-[var(--tone-ok-ink)]"
                        >
                          <Icon name="phone" size={16} /> {b.userPhone}
                        </a>
                      )}
                    </p>
                    {b.guestEmail && (
                      <p className="t-body truncate text-[var(--muted-ink)]">
                        <a href={`mailto:${b.guestEmail}`} className="inline-flex items-center gap-1.5 hover:underline">
                          <Icon name="mail" size={16} /> {b.guestEmail}
                        </a>
                      </p>
                    )}
                    <p className="text-sm text-[var(--muted-ink)]">{fmtRange(b.startAt, b.endAt)}</p>
                    {b.location && <p className="t-body text-[var(--muted-ink)]">{b.location}</p>}
                    {b.usageReason && (
                      <p className="t-body mt-1.5 line-clamp-2 text-[var(--ink)]/75">{b.usageReason}</p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-black/6 pt-3">
                  <Button size="sm" variant="outline" onClick={() => setDetail(b)}>
                    รายละเอียด
                  </Button>
                  {b.formImageUrl && (
                    <Button size="sm" variant="outline" icon="form" onClick={() => setViewImg(b.formImageUrl!)}>
                      เอกสาร
                    </Button>
                  )}
                  {b.returnImageUrl && (
                    <Button size="sm" variant="outline" icon="gallery" onClick={() => setViewImg(b.returnImageUrl!)}>
                      รูปคืน
                    </Button>
                  )}

                  {b.status === "pending" && (
                    <>
                      <Button size="sm" onClick={() => decide(b, "approved")} loading={busy} className="ml-auto">
                        อนุมัติ
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => decide(b, "rejected")} disabled={busy}>
                        ปฏิเสธ
                      </Button>
                    </>
                  )}
                  {b.status === "pending_return" && (
                    <Button size="sm" onClick={() => confirmReturn(b)} loading={busy} className="ml-auto">
                      ยืนยันรับคืน
                    </Button>
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
          <Row label="ผู้จอง">{detail.userName}</Row>
          <Row label="เบอร์โทร">{detail.userPhone || "—"}</Row>
          {detail.guestEmail && <Row label="อีเมล">{detail.guestEmail}</Row>}
          <Row label="ช่วงเวลา">{fmtRange(detail.startAt, detail.endAt)}</Row>
          {detail.usageType && <Row label="ประเภทงาน">{detail.usageType}</Row>}
          {detail.location && <Row label="สถานที่">{detail.location}</Row>}
          {detail.crewSize ? <Row label="จำนวนตากล้อง">{detail.crewSize} คน</Row> : null}
          <Row label="วัตถุประสงค์">{detail.usageReason || "—"}</Row>
          <Row label="ส่งคำขอเมื่อ">{fmtDateTime(detail.createdAt)}</Row>
          <Button onClick={() => setDetail(null)} fullWidth className="mt-5">
            ปิด
          </Button>
        </Modal>
      )}

      <Modal open={!!viewImg} onClose={() => setViewImg(null)} title="หลักฐาน" maxWidth="max-w-2xl">
        {viewImg && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewImg} alt="หลักฐาน" className="max-h-[70vh] w-full rounded-2xl border border-black/8 object-contain" />
            <a
              href={viewImg}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block text-center text-sm font-semibold text-[var(--faculty)] hover:underline"
            >
              เปิดในแท็บใหม่ ↗
            </a>
          </>
        )}
      </Modal>

      {toastNode}
    </div>
  );
}
