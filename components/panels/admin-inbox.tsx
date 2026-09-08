"use client";
// components/panels/admin-inbox.tsx — กล่องงานที่ต้องตัดสินใจ (หน้าภาพรวม)
//
// เดิมหน้าภาพรวมโชว์แค่ "รออนุมัติ 3" เป็นตัวเลขให้กดไปหน้าอื่นถึงจะทำอะไรได้
// ตัวเลขบอกว่ามีงาน แต่ไม่ช่วยให้งานเสร็จ — กรรมการต้องเด้งไป /workflow ทุกครั้ง
//
// ตอนนี้รายการที่รอตัดสินใจอยู่ตรงนี้พร้อมปุ่มลงมือ อนุมัติ/ไม่อนุมัติ/รับคืน
// จบได้ในหน้าเดียวโดยไม่ต้องเปลี่ยนหน้า ส่วนบอร์ดเต็มยังอยู่ที่ /workflow
// สำหรับตอนอยากไล่ดูทั้งกระบวนการ
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { describeWriteError } from "@/lib/errors";
import { useAuth } from "@/lib/firebase/auth-context";
import { useSettings } from "@/lib/settings-context";
import { useCollection, useNow } from "@/lib/hooks";
import { fmtRange, fmtRelative, BOOKING_TYPE_LABEL, BOOKING_TYPE_ICON } from "@/lib/format";
import { sendMail, bookingApproved, bookingRejected, borrowApproved } from "@/lib/mail";
import { Badge, Button, Alert, useToast } from "@/components/ui";
import Icon from "@/components/icon";
import type { BookingDoc, UserDoc, WithId } from "@/lib/types";

export default function AdminInbox() {
  const { profile } = useAuth();
  const { settings } = useSettings();
  const now = useNow(60_000);
  const { show, node: toastNode } = useToast();

  const { data: bookings } = useCollection<BookingDoc>(() => collection(db, "bookings"), []);
  const { data: users } = useCollection<UserDoc>(() => collection(db, "users"), []);
  // งานส่งไฟล์ที่มีอยู่แล้ว — กันสร้างซ้ำเวลาอนุมัติงานถ่าย
  const { data: deliveries } = useCollection<{ bookingId: string | null }>(
    () => (settings.featureDeliveries ? collection(db, "deliveries") : null),
    [settings.featureDeliveries]
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [proof, setProof] = useState<WithId<BookingDoc> | null>(null);

  const pending = useMemo(
    () =>
      bookings
        .filter((b) => b.status === "pending")
        .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis()),
    [bookings]
  );

  const returning = useMemo(
    () => bookings.filter((b) => b.status === "pending_return"),
    [bookings]
  );

  const userOf = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  /** ส่งอีเมลแจ้งผล — ล้มเหลวไม่ควรทำให้การอนุมัติล้มตาม */
  function notify(b: WithId<BookingDoc>, kind: "approved" | "rejected", reason?: string) {
    if (settings.notifyEmail === false || !b.userId) return;
    const u = userOf.get(b.userId);
    if (!u?.email) return;
    const name = u.nickname?.trim() || u.firstName || "สมาชิก";
    const what = `${BOOKING_TYPE_LABEL[b.bookingType]} ${b.itemName}`;
    const tpl =
      kind === "rejected"
        ? bookingRejected({ name, siteName: settings.siteName, what, reason })
        : b.bookingType === "equipment"
          ? borrowApproved({
              name,
              siteName: settings.siteName,
              items: b.itemName,
              from: fmtRange(b.startAt, b.endAt),
              until: fmtRelative(b.endAt),
            })
          : bookingApproved({
              name,
              siteName: settings.siteName,
              what,
              when: fmtRange(b.startAt, b.endAt),
            });
    void sendMail({ ...tpl, to: u.email, kind: `booking_${kind}`, refId: b.id });
  }

  async function approve(b: WithId<BookingDoc>) {
    if (busy) return;
    setBusy(b.id);
    setErr("");
    try {
      // booking กับ slot ต้องเปลี่ยนพร้อมกัน ไม่งั้นตารางสาธารณะกับสถานะจริงไม่ตรงกัน
      const batch = writeBatch(db);
      batch.update(doc(db, "bookings", b.id), { status: "approved" });
      batch.update(doc(db, "slots", b.id), { status: "approved" });
      await batch.commit();
      await addDoc(collection(db, "feeds"), {
        message: `${b.userName} จอง${BOOKING_TYPE_LABEL[b.bookingType]} "${b.itemName}" ได้รับการอนุมัติแล้ว`,
        bookingId: b.id,
        userId: b.userId,
        formImageUrl: null,
        bookingStatus: "approved",
        likedBy: [],
        likeCount: 0,
        createdAt: serverTimestamp(),
      }).catch(() => {});
      notify(b, "approved");
      // งานถ่าย = มีการส่งไฟล์ตามมาเสมอ → เปิดงานส่งไฟล์ให้เลย ไม่ต้องสร้างแยก
      await ensureDelivery(b);
      show("อนุมัติแล้ว");
    } catch (e) {
      setErr(describeWriteError(e, "อนุมัติ"));
    } finally {
      setBusy(null);
    }
  }

  /**
   * เปิด "งานส่งไฟล์" ที่ผูกกับงานถ่ายใบนี้ ถ้ายังไม่มี
   * ทำให้งานถ่ายกับงานส่งไฟล์เป็นงานเดียวกัน — กรรมการไม่ต้องสร้างสองรอบ
   * สิทธิ์อัปไฟล์ไหลมาจาก assigneeIds ของใบจอง (ดู inDelivery ใน firestore.rules)
   */
  async function ensureDelivery(b: WithId<BookingDoc>) {
    if (b.bookingType !== "photographer" || settings.featureDeliveries === false) return;
    if (deliveries.some((d) => d.bookingId === b.id)) return; // มีแล้ว ไม่สร้างซ้ำ
    const dueMs = b.endAt.toMillis() + (settings.deliveryDefaultDays ?? 7) * 86_400_000;
    try {
      await addDoc(collection(db, "deliveries"), {
        title: b.usageType || b.itemName || "งานถ่ายภาพ",
        bookingId: b.id,
        customerUserId: b.userId ?? null,
        customerName: b.userName || b.guestName || "ผู้ขอถ่าย",
        customerContact: b.userPhone || "",
        assigneeIds: b.assigneeIds ?? [],
        assignedToId: (b.assigneeIds ?? [])[0] ?? null,
        assignedToName: null,
        uploadUrl: settings.uploadLinkUrl || null,
        downloadUrl: null,
        passcode: null,
        note: "",
        status: "awaiting_upload",
        dueAt: Timestamp.fromMillis(dueMs),
        expiresAt: null,
        createdById: profile?.id ?? "system",
        createdAt: serverTimestamp(),
      });
    } catch {
      /* เปิดงานส่งไม่สำเร็จไม่ควรทำให้การอนุมัติล้ม — กรรมการเปิดเองทีหลังได้ */
    }
  }

  async function reject(b: WithId<BookingDoc>) {
    const reason = prompt(`ไม่อนุมัติ "${b.itemName}"\nเหตุผล (ผู้ขอจะเห็นในอีเมล):`);
    if (reason === null) return; // กดยกเลิก
    if (busy) return;
    setBusy(b.id);
    setErr("");
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "bookings", b.id), { status: "rejected" });
      batch.delete(doc(db, "slots", b.id)); // ปล่อยคิวคืนให้คนอื่นทันที
      await batch.commit();
      notify(b, "rejected", reason.trim() || undefined);
      show("แจ้งผลไม่อนุมัติแล้ว");
    } catch (e) {
      setErr(describeWriteError(e, "บันทึก"));
    } finally {
      setBusy(null);
    }
  }

  async function confirmReturn(b: WithId<BookingDoc>) {
    if (busy) return;
    setBusy(b.id);
    setErr("");
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "bookings", b.id), { status: "returned" });
      batch.delete(doc(db, "slots", b.id));
      await batch.commit();
      show("รับคืนแล้ว ปิดรายการ");
    } catch (e) {
      setErr(describeWriteError(e, "บันทึก"));
    } finally {
      setBusy(null);
    }
  }

  async function assignSelf(b: WithId<BookingDoc>) {
    if (!profile) return;
    try {
      await updateDoc(doc(db, "bookings", b.id), { assigneeIds: [profile.id] });
      show("รับงานนี้เอง");
    } catch (e) {
      setErr(describeWriteError(e, "มอบหมาย"));
    }
  }

  const total = pending.length + returning.length;

  if (total === 0) {
    return (
      <div className="surface-flat flex items-center gap-3 rounded-3xl p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl tone-ok">
          <Icon name="success" size={24} />
        </span>
        <div>
          <p className="t-heading text-[var(--ink)]">ไม่มีอะไรรอตัดสินใจ</p>
          <p className="t-caption">ทุกคำขอถูกจัดการหมดแล้ว</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      <ul className="surface-flat divide-y divide-[var(--hairline)] overflow-hidden rounded-3xl">
        {pending.map((b) => (
          <li key={b.id} className="p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl tone-warn">
                <Icon name={BOOKING_TYPE_ICON[b.bookingType]} size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="t-heading truncate text-[var(--ink)]">{b.usageType || b.itemName}</p>
                <p className="t-caption">{fmtRange(b.startAt, b.endAt)}</p>
                <p className="t-caption mt-0.5 flex items-center gap-1.5">
                  <Icon name="user" size={16} />
                  {b.userName || b.guestName || "ไม่ระบุชื่อ"}
                  {b.userPhone && <> · {b.userPhone}</>}
                </p>
                {b.usageReason && <p className="t-caption mt-0.5">เพื่อ {b.usageReason}</p>}
              </div>
              <Badge className="tone-warn">รออนุมัติ</Badge>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--hairline)] pt-3">
              <Button size="sm" icon="approved" loading={busy === b.id} onClick={() => approve(b)}>
                อนุมัติ
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon="close"
                loading={busy === b.id}
                onClick={() => reject(b)}
                className="text-[var(--tone-bad-ink)]"
              >
                ไม่อนุมัติ
              </Button>
              {b.formImageUrl && (
                <Button size="sm" variant="outline" icon="show" onClick={() => setProof(b)}>
                  ดูเอกสาร
                </Button>
              )}
            </div>
          </li>
        ))}

        {returning.map((b) => (
          <li key={b.id} className="p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl tone-brand">
                <Icon name="reset" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="t-heading truncate text-[var(--ink)]">{b.itemName}</p>
                <p className="t-caption">คืนโดย {b.userName || "ไม่ระบุชื่อ"}</p>
                <p className="t-caption">{fmtRange(b.startAt, b.endAt)}</p>
              </div>
              <Badge className="tone-brand">รอตรวจรับ</Badge>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--hairline)] pt-3">
              <Button size="sm" icon="approved" loading={busy === b.id} onClick={() => confirmReturn(b)}>
                รับคืน ปิดรายการ
              </Button>
              {b.returnImageUrl && (
                <Button size="sm" variant="outline" icon="show" onClick={() => setProof(b)}>
                  ดูรูปหลักฐาน
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* งานถ่ายที่อนุมัติแล้วแต่ยังไม่มีคนรับ — เตือนไว้ตรงนี้ด้วย
          เพราะปล่อยไว้จะกลายเป็นงานที่ไม่มีใครไป */}
      {bookings.filter(
        (b) =>
          b.bookingType === "photographer" &&
          b.status === "approved" &&
          (b.assigneeIds ?? []).length === 0 &&
          b.endAt.toMillis() > now
      ).length > 0 && (
        <div className="tone-warn mt-3 flex flex-wrap items-center gap-2 rounded-2xl p-3">
          <Icon name="warning" size={18} />
          <span className="t-label flex-1">มีงานถ่ายที่อนุมัติแล้วแต่ยังไม่มีคนรับ</span>
          <Link href="/assign?tab=photographer" className="t-label font-bold text-[var(--faculty)]">
            จัดทีม →
          </Link>
        </div>
      )}

      {proof && (
        <ProofModal booking={proof} onClose={() => setProof(null)} onAssignSelf={() => assignSelf(proof)} />
      )}
      {toastNode}
    </div>
  );
}

function ProofModal({
  booking,
  onClose,
}: {
  booking: WithId<BookingDoc>;
  onClose: () => void;
  onAssignSelf: () => void;
}) {
  const src = booking.returnImageUrl || booking.formImageUrl;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[85dvh] max-w-lg overflow-auto rounded-3xl bg-white p-3" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="หลักฐาน" className="w-full rounded-2xl" /> : <p className="p-4">ไม่มีรูป</p>}
        <Button onClick={onClose} fullWidth className="mt-3">
          ปิด
        </Button>
      </div>
    </div>
  );
}
