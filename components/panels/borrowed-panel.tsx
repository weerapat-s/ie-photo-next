"use client";
// components/panels/borrowed-panel.tsx — ของที่ถูกยืมอยู่ตอนนี้
//
// ตอบคำถามเดียวที่สำคัญที่สุดเรื่องอุปกรณ์: **ตอนนี้ของอยู่กับใคร**
// เดิมข้อมูลนี้กระจายอยู่ในรายการจองซึ่งปนกับสตูดิโอและงานถ่าย หาไม่เจอ
//
// scope="all"  → กรรมการเห็นของทุกชิ้นที่ยังไม่กลับเข้าคลัง
// scope="mine" → สมาชิกเห็นเฉพาะของที่ตัวเองถืออยู่
//
// ปุ่มคืนกดได้ทั้งคนที่ยืมเองและกรรมการ — ของหายบ่อยเพราะคนยืมลืมกด
// กรรมการที่รับของคืนหน้างานจึงต้องปิดรายการแทนได้
import { useMemo, useState } from "react";
import { collection, doc, query, where, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { useSettings } from "@/lib/settings-context";
import { useCollection, useNow } from "@/lib/hooks";
import { isAdminRole } from "@/lib/roles";
import { fmtRange, fmtRelative } from "@/lib/format";
import { sendMail, borrowReturned } from "@/lib/mail";
import { canCancel, cancelBooking, cancelPrompt } from "@/lib/bookings";
import { Spinner, EmptyState, Badge, Button, Alert, useToast } from "@/components/ui";
import Icon from "@/components/icon";
import ReturnModal from "@/components/return-modal";
import type { BookingDoc, UserDoc, WithId } from "@/lib/types";

export default function BorrowedPanel({ scope = "mine" }: { scope?: "all" | "mine" }) {
  const { user, role, profile } = useAuth();
  const { settings } = useSettings();
  const isAdmin = isAdminRole(role);
  const now = useNow(60_000);
  const { show, node: toastNode } = useToast();

  // กรรมการเห็นทุกใบ · สมาชิกอ่านได้เฉพาะใบของตัวเอง (firestore.rules บังคับอยู่แล้ว)
  // รายชื่อสมาชิก — ใช้หาอีเมลคนยืมตอนส่งแจ้งเตือน (กรรมการเท่านั้นที่อ่านได้)
  const { data: users } = useCollection<UserDoc>(() => (isAdmin ? collection(db, "users") : null), [isAdmin]);

  const { data: bookings, loading, error } = useCollection<BookingDoc>(
    () =>
      scope === "all" && isAdmin
        ? query(collection(db, "bookings"), where("bookingType", "==", "equipment"))
        : user
          ? query(collection(db, "bookings"), where("userId", "==", user.uid))
          : null,
    [scope, isAdmin, user?.uid]
  );

  const [returning, setReturning] = useState<WithId<BookingDoc> | null>(null);
  const [err, setErr] = useState("");

  /** ของที่ยังไม่กลับเข้าคลัง = อนุมัติแล้วแต่ยังไม่ปิดรายการ */
  const active = useMemo(
    () =>
      bookings
        .filter((b) => b.bookingType === "equipment" && (b.status === "approved" || b.status === "pending_return"))
        .sort((a, b) => a.endAt.toMillis() - b.endAt.toMillis()),
    [bookings]
  );

  const late = active.filter((b) => b.status === "approved" && b.endAt.toMillis() < now);
  const checking = active.filter((b) => b.status === "pending_return");

  // ลิสต์เดียวจบ เรียงตามความด่วน — เดิมแยกเป็น 3 ชิปให้กดสลับไปมา
  // ทั้งที่คำถามจริงคือ "มีอะไรต้องตามบ้าง" ซึ่งต้องเห็นพร้อมกันหมด
  const shown = active;

  /** กรรมการปิดรายการให้เลย — ใช้ตอนรับของคืนหน้างานแล้วคนยืมไม่ได้กดเอง */
  async function closeNow(b: WithId<BookingDoc>) {
    if (!confirm(`ยืนยันว่าได้รับ "${b.itemName}" คืนแล้ว?`)) return;
    setErr("");
    try {
      await updateDoc(doc(db, "bookings", b.id), { status: "returned", returnedAt: serverTimestamp() });
      show("ปิดรายการแล้ว");

      // แจ้งคนยืมว่าปิดรายการแล้ว — กันข้อโต้แย้งภายหลังว่า "คืนไปแล้วหรือยัง"
      const borrower = users.find((u) => u.id === b.userId);
      if (settings.notifyEmail !== false && borrower?.email) {
        const m = borrowReturned({
          name: borrower.nickname?.trim() || borrower.firstName || "ทีมงาน",
          items: b.itemName,
          by: `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() || "กรรมการ",
          siteName: settings.siteName,
        });
        void sendMail({ ...m, to: borrower.email, kind: "borrow_returned", refId: b.id });
      }
    } catch {
      setErr("ปิดรายการไม่สำเร็จ — ต้องเป็นกรรมการเท่านั้น");
    }
  }

  async function cancel(b: WithId<BookingDoc>) {
    if (!confirm(cancelPrompt(b))) return;
    setErr("");
    try {
      await cancelBooking(b);
      show("ยกเลิกแล้ว");
    } catch {
      setErr("ยกเลิกไม่สำเร็จ — ถ้าเลยเวลาเริ่มแล้วต้องกดคืนแทน");
    }
  }

  if (loading) return <Spinner label="กำลังโหลดรายการยืม…" />;
  if (error) return <EmptyState icon="warning" text="โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้า" />;

  return (
    <div>
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      {/* สรุปหัวลิสต์ — บอกภาพรวมโดยไม่ต้องกดสลับดู */}
      {active.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge className="tone-mute" icon="equipment">
            ยืมอยู่ {active.length} ชิ้น
          </Badge>
          {late.length > 0 && (
            <Badge className="tone-bad" icon="overdue">
              เลยกำหนด {late.length}
            </Badge>
          )}
          {checking.length > 0 && (
            <Badge className="tone-warn" icon="pending">
              รอตรวจรับ {checking.length}
            </Badge>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon="approved"
          text={scope === "all" ? "ของอยู่ในคลังครบทุกชิ้น" : "คุณไม่ได้ถืออุปกรณ์ของชุมนุมอยู่"}
        />
      ) : (
        <ul className="surface-flat divide-y divide-[var(--hairline)] overflow-hidden rounded-3xl">
          {shown.map((b) => {
            const overdue = b.status === "approved" && b.endAt.toMillis() < now;
            const mine = b.userId === user?.uid;
            return (
              <li key={b.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="t-heading text-[var(--ink)]">{b.itemName}</p>

                    {/* บรรทัดสำคัญที่สุด — ของอยู่กับใคร */}
                    <p className="t-body mt-0.5 flex items-center gap-1.5 text-[var(--ink)]/85">
                      <Icon name="user" size={16} className="text-[var(--faculty)]" />
                      {mine ? "อยู่กับคุณ" : `อยู่กับ ${b.userName || "ไม่ระบุชื่อ"}`}
                    </p>

                    <p className="t-caption mt-0.5">{fmtRange(b.startAt, b.endAt)}</p>
                    {b.usageReason && <p className="t-caption mt-0.5">เพื่อ {b.usageReason}</p>}
                    {scope === "all" && b.userPhone && (
                      <a
                        href={`tel:${b.userPhone}`}
                        className="t-caption mt-1 inline-flex items-center gap-1 font-semibold text-[var(--faculty)]"
                      >
                        <Icon name="phone" size={16} /> {b.userPhone}
                      </a>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {b.status === "pending_return" ? (
                      <Badge className="tone-warn" icon="pending">
                        รอตรวจรับ
                      </Badge>
                    ) : overdue ? (
                      <Badge className="tone-bad" icon="overdue">
                        เลยกำหนด
                      </Badge>
                    ) : (
                      <Badge className="tone-ok">กำหนดคืน {fmtRelative(b.endAt)}</Badge>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--hairline)] pt-3">
                  {/* คนยืมกดคืนพร้อมแนบรูป · กรรมการปิดรายการได้เลยตอนรับของหน้างาน */}
                  {b.status === "approved" && (mine || isAdmin) && (
                    <Button size="sm" icon="reset" onClick={() => setReturning(b)}>
                      {mine ? "คืนอุปกรณ์" : "คืนแทน"}
                    </Button>
                  )}
                  {isAdmin && (
                    <Button size="sm" variant="outline" icon="approved" onClick={() => closeNow(b)}>
                      รับคืนแล้ว ปิดรายการ
                    </Button>
                  )}
                  {/* ยังไม่ถึงเวลารับของ = ยกเลิกได้ ไม่ต้องรบกวนกรรมการ */}
                  {mine && canCancel(b, now) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="close"
                      onClick={() => cancel(b)}
                      className="text-[var(--tone-bad-ink)]"
                    >
                      ยกเลิก
                    </Button>
                  )}
                  {!isAdmin && !mine && <p className="t-caption">ติดต่อกรรมการถ้าต้องการใช้ชิ้นนี้</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {returning && (
        <ReturnModal
          booking={returning}
          uploadLink={settings.uploadLinkUrl}
          onDone={() => {
            setReturning(null);
            show("ส่งคำขอคืนแล้ว รอกรรมการตรวจรับ");
          }}
          onClose={() => setReturning(null)}
        />
      )}
      {toastNode}
    </div>
  );
}
