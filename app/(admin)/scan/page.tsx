"use client";
// app/(admin)/scan/page.tsx — สถานีสแกนหน้าเคาน์เตอร์ (ส่งมอบ / รับคืน)
//
// ยิงได้ 2 ทาง:
//   - ยิง QR ประจำตัวสมาชิก  → เห็นว่าคนนี้มีอะไรรออยู่ / ถืออะไรอยู่
//   - ยิง QR ของอุปกรณ์      → เห็นว่าชิ้นนี้ใครจอง / ใครถือไป
//
// ความปลอดภัย: QR เป็นแค่ตัวชี้ตัวคน/ตัวของ ไม่ใช่รหัสผ่าน
// ทุกการกดส่งมอบ/รับคืนทำโดยแอดมินที่ล็อกอินอยู่เท่านั้น (หน้านี้อยู่ใต้ RequireAdmin)
import { useMemo, useState } from "react";
import { collection, query, orderBy, doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useCollection } from "@/lib/hooks";
import { PageHeader, Card, Badge, Spinner, Button, EmptyState } from "@/components/ui";
import QrScanner from "@/components/qr-scanner";
import { parseScan } from "@/lib/qr";
import { fmtDateTime, BOOKING_STATUS } from "@/lib/format";
import type { BookingDoc, EquipmentDoc, UserDoc, WithId } from "@/lib/types";

type Target =
  | { kind: "member"; user: WithId<UserDoc> }
  | { kind: "equipment"; item: WithId<EquipmentDoc> };

export default function ScanStationPage() {
  const { data: bookings, loading: l1 } = useCollection<BookingDoc>(
    () => query(collection(db, "bookings"), orderBy("createdAt", "desc")),
    []
  );
  const { data: users, loading: l2 } = useCollection<UserDoc>(() => collection(db, "users"), []);
  const { data: equipments, loading: l3 } = useCollection<EquipmentDoc>(() => collection(db, "equipments"), []);

  const [scanning, setScanning] = useState(true);
  const [manual, setManual] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loading = l1 || l2 || l3;

  /** รายการที่เกี่ยวข้องกับสิ่งที่สแกนมา — เฉพาะที่ยัง "มีชีวิต" (อนุมัติแล้ว / รอตรวจคืน) */
  const rows = useMemo(() => {
    if (!target) return [];
    const active = bookings.filter((b) => b.status === "approved" || b.status === "pending_return");
    if (target.kind === "member") return active.filter((b) => b.userId === target.user.id);
    return active.filter((b) => b.itemId === target.item.id);
  }, [target, bookings]);

  /** คำขอที่ยังรออนุมัติ — แสดงไว้เตือนแอดมินว่ายังกดอนุมัติไม่ครบ */
  const pendingRows = useMemo(() => {
    if (!target) return [];
    const pending = bookings.filter((b) => b.status === "pending");
    if (target.kind === "member") return pending.filter((b) => b.userId === target.user.id);
    return pending.filter((b) => b.itemId === target.item.id);
  }, [target, bookings]);

  function handleScan(raw: string) {
    setErr("");
    setMsg("");
    const parsed = parseScan(raw);

    if (parsed.kind === "member") {
      const u = users.find((x) => (x.memberCode || "").toUpperCase() === parsed.code);
      if (!u) return setErr(`ไม่พบสมาชิกที่ใช้รหัส ${parsed.code}`);
      setTarget({ kind: "member", user: u });
      setMsg(`👤 ${`${u.firstName} ${u.lastName}`.trim() || u.studentId}`);
      return;
    }

    if (parsed.kind === "equipment") {
      const item = equipments.find((x) => (x.code || "").toUpperCase() === parsed.code);
      if (!item) return setErr(`ไม่พบอุปกรณ์รหัส ${parsed.code}`);
      setTarget({ kind: "equipment", item });
      setMsg(`📦 ${item.name}`);
      return;
    }

    setErr("อ่าน QR ไม่ออก ลองใหม่อีกครั้ง");
  }

  /** ส่งมอบของ: บันทึกเวลาที่รับของจริง (ยังคงสถานะ approved จนกว่าจะคืน) */
  async function markPickedUp(b: WithId<BookingDoc>) {
    if (busyId) return;
    setBusyId(b.id);
    setErr("");
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "bookings", b.id), { pickedUpAt: serverTimestamp() });
      await batch.commit();
      setMsg(`✅ ส่งมอบ "${b.itemName}" แล้ว`);
    } catch {
      setErr("บันทึกการส่งมอบไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusyId(null);
    }
  }

  /** รับคืน: ปิดรายการ + ปล่อยช่วงเวลาใน slots (เหมือนปุ่มในหน้ารายการจอง) */
  async function markReturned(b: WithId<BookingDoc>) {
    if (busyId) return;
    setBusyId(b.id);
    setErr("");
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "bookings", b.id), { status: "returned" });
      batch.delete(doc(db, "slots", b.id));
      await batch.commit();
      setMsg(`✅ รับคืน "${b.itemName}" เรียบร้อย`);
    } catch {
      setErr("บันทึกการรับคืนไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusyId(null);
    }
  }

  const targetTitle =
    target?.kind === "member"
      ? `${`${target.user.firstName} ${target.user.lastName}`.trim() || target.user.studentId}`
      : target?.kind === "equipment"
        ? target.item.name
        : "";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="สถานีสแกน"
        subtitle="ยิง QR ประจำตัวสมาชิก หรือ QR ที่ติดบนอุปกรณ์"
        action={
          <Button variant="outline" onClick={() => setScanning((v) => !v)}>
            {scanning ? "ปิดกล้อง" : "📷 เปิดกล้อง"}
          </Button>
        }
      />

      {scanning && (
        <div className="mb-4">
          <QrScanner
            onScan={handleScan}
            onClose={() => setScanning(false)}
            hint="ยิงบัตร QR ของสมาชิก เพื่อดูว่ามีอะไรรอรับ / ถืออะไรอยู่"
          />
        </div>
      )}

      {/* ช่องสำรอง เผื่อกล้องใช้ไม่ได้ */}
      <Card className="mb-4">
        <div className="flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (manual.trim()) { handleScan(manual); setManual(""); }
            }}
            placeholder="หรือพิมพ์รหัสเอง เช่น CAM-001 (ใช้กับเครื่องยิงบาร์โค้ด USB ได้เลย)"
            className="glass-input block w-full rounded-xl px-3.5 py-2.5 text-sm"
          />
          <Button
            variant="outline"
            onClick={() => { if (manual.trim()) { handleScan(manual); setManual(""); } }}
            className="flex-shrink-0"
          >
            ค้นหา
          </Button>
        </div>
      </Card>

      {msg && (
        <p className="mb-3 rounded-xl border border-border bg-muted px-4 py-2.5 text-sm font-medium text-foreground" role="status">
          {msg}
        </p>
      )}
      {err && (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
          ⚠️ {err}
        </p>
      )}

      {loading ? (
        <Spinner />
      ) : !target ? (
        <EmptyState icon="equipment" text="ยังไม่ได้สแกน — ยิง QR เพื่อเริ่ม" />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">
              {target.kind === "member" ? "👤 " : "📦 "}
              {targetTitle}
            </h2>
            <button
              type="button"
              onClick={() => { setTarget(null); setMsg(""); }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ล้าง
            </button>
          </div>

          {target.kind === "member" && (
            <p className="mb-3 text-sm text-muted-foreground">
              {target.user.studentId}
              {target.user.phone ? ` · 📞 ${target.user.phone}` : ""}
            </p>
          )}

          {pendingRows.length > 0 && (
            <Card className="mb-3">
              <p className="text-sm font-medium text-amber-700">
                ⏳ ยังมี {pendingRows.length} รายการที่ยังไม่ได้อนุมัติ
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                ต้องไปกดอนุมัติที่หน้า &quot;รายการจอง&quot; ก่อน ถึงจะส่งมอบได้
              </p>
            </Card>
          )}

          {rows.length === 0 ? (
            <EmptyState text="ไม่มีรายการที่อนุมัติแล้วค้างอยู่" />
          ) : (
            <div className="space-y-3">
              {rows.map((b) => (
                <Card key={b.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{b.bookingType === "studio" ? "🎬" : "📷"}</span>
                        <span className="font-medium text-foreground">{b.itemName}</span>
                        <Badge className={BOOKING_STATUS[b.status].cls}>{BOOKING_STATUS[b.status].label}</Badge>
                        {b.pickedUpAt && (
                          <Badge className="bg-blue-100 text-blue-700">รับของไปแล้ว</Badge>
                        )}
                      </div>
                      {target.kind === "equipment" && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          👤 {b.userName}
                          {b.userPhone ? ` · 📞 ${b.userPhone}` : ""}
                        </p>
                      )}
                      <p className="mt-1 text-sm text-muted-foreground">
                        {fmtDateTime(b.startAt)} → {fmtDateTime(b.endAt)}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      {!b.pickedUpAt && b.status === "approved" && (
                        <Button onClick={() => markPickedUp(b)} disabled={busyId === b.id}>
                          {busyId === b.id ? "กำลังบันทึก…" : "ส่งมอบแล้ว"}
                        </Button>
                      )}
                      <Button variant="outline" onClick={() => markReturned(b)} disabled={busyId === b.id}>
                        {busyId === b.id ? "กำลังบันทึก…" : "รับคืนแล้ว"}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
