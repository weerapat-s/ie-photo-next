"use client";
// app/(admin)/scan/page.tsx — สถานีสแกนหน้าเคาน์เตอร์
//
// flow ที่ใช้จริง:
//   ยืม  — สมาชิกเลือกของในหน้า /borrow เอง แล้วมาโชว์ QR ประจำตัวที่เคาน์เตอร์
//          แอดมินสแกน → เห็นรูปหน้า/ชื่อ/เบอร์/ของที่ขอ/กำหนดคืน → กด "อนุมัติ + ส่งมอบ"
//   คืน  — สมาชิกโชว์ QR อีกครั้ง → แอดมินสแกน → เห็นของที่ถืออยู่ → กด "รับคืน"
//
// ความปลอดภัย: QR เป็นแค่ตัวชี้ตัวคน ไม่ใช่รหัสผ่าน
// รูปหน้าที่โชว์มีไว้ให้แอดมินเทียบกับคนตรงหน้าก่อนส่งของ
import { useMemo, useState } from "react";
import {
  collection, query, where, limit, getDocs, getDoc, doc, writeBatch, addDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useNow } from "@/lib/hooks";
import { useAuth } from "@/lib/firebase/auth-context";
import { PageHeader, Card, Badge, Spinner, Button, Modal, EmptyState } from "@/components/ui";
import QrScanner from "@/components/qr-scanner";
import { parseScan } from "@/lib/qr";
import { fmtDateTime, BOOKING_STATUS } from "@/lib/format";
import type { BookingDoc, UserDoc, WithId } from "@/lib/types";

/** เหลือ/เกินกำหนดกี่วัน — ค่าบวก = ยังไม่ถึงกำหนด, ลบ = เลยมาแล้ว */
function daysLeft(endMs: number, now: number) {
  return Math.ceil((endMs - now) / 86_400_000);
}
function durationDays(startMs: number, endMs: number) {
  return Math.max(1, Math.ceil((endMs - startMs) / 86_400_000));
}

export default function ScanStationPage() {
  const now = useNow();
  // แอดมินที่ล็อกอินอยู่ — บันทึกไว้ว่าใครเป็นคนปล่อยของออกไป
  const { user: admin, profile: adminProfile } = useAuth();

  const [scanning, setScanning] = useState(true);
  const [manual, setManual] = useState("");
  const [person, setPerson] = useState<WithId<UserDoc> | null>(null);
  // สแกนมาจาก QR ของคำขอใบไหน — ถ้ามี จะโฟกัสเฉพาะของในใบนั้น
  const [requestId, setRequestId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // รายการของคนที่สแกนมา — ดึงเฉพาะตอนสแกน ไม่ subscribe ทั้ง collection
  // (โปรเจกต์อยู่แพลนฟรี โควตาอ่าน 50,000/วัน หน้านี้เลยต้องประหยัด)
  const [rows, setRows] = useState<WithId<BookingDoc>[]>([]);
  const [loading, setLoading] = useState(false);
  // ผู้ยืมติ๊กรับทราบเงื่อนไขชดใช้ของ booking ไหนแล้วบ้าง (ติ๊กต่อหน้าแอดมินตอนรับของ)
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  // เอกสารแนบที่กำลังเปิดดู (เอกสารขออนุญาต / รูปตอนคืน)
  const [viewImg, setViewImg] = useState<{ src: string; title: string } | null>(null);


  /** ดึงเฉพาะรายการที่ยังมีผลของคนคนเดียว — ไม่กี่ read ต่อการสแกน 1 ครั้ง */
  async function loadFor(uid: string) {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "bookings"),
          where("userId", "==", uid),
          where("status", "in", ["pending", "approved", "pending_return"])
        )
      );
      setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as BookingDoc) })));
    } finally {
      setLoading(false);
    }
  }

  const mine = rows;
  /** รอแอดมินอนุมัติ + ส่งมอบ — ถ้าสแกนมาจาก QR คำขอ โฟกัสเฉพาะใบนั้น */
  const waiting = useMemo(() => {
    const pending = mine.filter((b) => b.status === "pending");
    if (!requestId) return pending;
    return pending.filter((b) => (b.requestId || "").toUpperCase() === requestId);
  }, [mine, requestId]);
  /** ถืออยู่ตอนนี้ ยังไม่คืน */
  const holding = useMemo(
    () => mine.filter((b) => b.status === "approved" || b.status === "pending_return"),
    [mine]
  );

  async function handleScan(raw: string) {
    setErr("");
    setMsg("");
    const parsed = parseScan(raw);

    try {
      // QR ของคำขอ — หา booking ใบนั้นก่อน แล้วค่อยดึงเจ้าของ
      if (parsed.kind === "request") {
        const rs = await getDocs(
          query(collection(db, "bookings"), where("requestId", "==", parsed.code))
        );
        if (rs.empty) return setErr(`ไม่พบคำขอรหัส ${parsed.code}`);
        const uid = rs.docs[0].data().userId as string | null;
        if (!uid) return setErr("พบคำขอ แต่ไม่มีผู้ยืมผูกอยู่");
        const u = await getDoc(doc(db, "users", uid));
        if (!u.exists()) return setErr("พบคำขอ แต่หาข้อมูลผู้ยืมไม่เจอ");
        setPerson({ id: u.id, ...(u.data() as UserDoc) });
        setRequestId(parsed.code);
        setScanning(false);
        await loadFor(uid);
        return;
      }

      // QR ประจำตัวสมาชิก
      if (parsed.kind === "member") {
        const us = await getDocs(
          query(collection(db, "users"), where("memberCode", "==", parsed.code), limit(1))
        );
        if (us.empty) return setErr(`ไม่พบสมาชิกที่ใช้รหัส ${parsed.code}`);
        const d = us.docs[0];
        setPerson({ id: d.id, ...(d.data() as UserDoc) });
        setRequestId(null);
        setScanning(false);
        await loadFor(d.id);
        return;
      }

      // QR บนอุปกรณ์ — บอกว่าใครถือชิ้นนี้อยู่
      if (parsed.kind === "equipment") {
        const es = await getDocs(
          query(collection(db, "equipments"), where("code", "==", parsed.code), limit(1))
        );
        if (es.empty) return setErr(`ไม่พบอุปกรณ์รหัส ${parsed.code}`);
        const item = es.docs[0];
        const bs = await getDocs(
          query(
            collection(db, "bookings"),
            where("itemId", "==", item.id),
            where("status", "in", ["approved", "pending_return"])
          )
        );
        const uid = bs.docs[0]?.data().userId as string | undefined;
        if (!uid) return setErr(`"${item.data().name}" ตอนนี้ไม่มีใครยืมอยู่`);
        const u = await getDoc(doc(db, "users", uid));
        if (!u.exists()) return setErr("ของถูกยืมอยู่ แต่หาข้อมูลผู้ยืมไม่เจอ");
        setPerson({ id: u.id, ...(u.data() as UserDoc) });
        setRequestId(null);
        setScanning(false);
        setMsg(`"${item.data().name}" อยู่กับคนนี้`);
        await loadFor(u.id);
        return;
      }

      setErr("อ่าน QR ไม่ออก ลองใหม่อีกครั้ง");
    } catch {
      setErr("ค้นหาข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  }

  /** อนุมัติ + ส่งมอบในครั้งเดียว (แอดมินเห็นตัวคนอยู่ตรงหน้าแล้ว) */
  async function approveAndHandOver(b: WithId<BookingDoc>) {
    if (busyId) return;
    setBusyId(b.id);
    setErr("");
    try {
      const approverName =
        `${adminProfile?.firstName ?? ""} ${adminProfile?.lastName ?? ""}`.trim() ||
        adminProfile?.nickname ||
        admin?.email ||
        "แอดมิน";

      const batch = writeBatch(db);
      batch.update(doc(db, "bookings", b.id), {
        status: "approved",
        pickedUpAt: serverTimestamp(),
        liabilityAcceptedAt: serverTimestamp(),
        approvedById: admin?.uid ?? null,
        approvedByName: approverName,
        approvedAt: serverTimestamp(),
      });
      batch.update(doc(db, "slots", b.id), { status: "approved" });
      await batch.commit();

      await addDoc(collection(db, "feeds"), {
        message: `${approverName} อนุมัติให้ ${b.userName} ยืม "${b.itemName}"`,
        bookingId: b.id,
        userId: b.userId,
        formImageUrl: null,
        bookingStatus: "approved",
        likedBy: [],
        likeCount: 0,
        createdAt: serverTimestamp(),
      });
      setMsg(`ส่งมอบ "${b.itemName}" แล้ว`);
      if (person) await loadFor(person.id);
    } catch {
      setErr("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusyId(null);
    }
  }

  /** รับคืน: ปิดรายการ + ปล่อยช่วงเวลาใน slots */
  async function markReturned(b: WithId<BookingDoc>) {
    if (busyId) return;
    setBusyId(b.id);
    setErr("");
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "bookings", b.id), { status: "returned" });
      batch.delete(doc(db, "slots", b.id));
      await batch.commit();
      setMsg(`รับคืน "${b.itemName}" เรียบร้อย`);
      if (person) await loadFor(person.id);
    } catch {
      setErr("บันทึกการรับคืนไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusyId(null);
    }
  }

  async function returnAll() {
    for (const b of holding) await markReturned(b);
    setMsg(`รับคืนครบ ${holding.length} รายการ`);
  }

  const fullName = person ? `${person.firstName} ${person.lastName}`.trim() || person.studentId : "";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="สถานีสแกน"
        subtitle="ให้ผู้ยืมโชว์ QR ประจำตัว — ตอนรับของและตอนคืนของ"
        action={
          <Button variant="outline" onClick={() => { setScanning((v) => !v); setErr(""); }}>
            {scanning ? "ปิดกล้อง" : "เปิดกล้อง"}
          </Button>
        }
      />

      {scanning && (
        <div className="mb-4">
          <QrScanner
            onScan={handleScan}
            onClose={() => setScanning(false)}
            hint="ยิง QR ประจำตัวของผู้ยืม (หรือ QR บนอุปกรณ์ เพื่อดูว่าใครถืออยู่)"
          />
        </div>
      )}

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
            placeholder="หรือพิมพ์รหัสเอง — รหัสสมาชิก หรือรหัสอุปกรณ์ (CAM-001)"
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
          {err}
        </p>
      )}

      {loading || now === null ? (
        <Spinner />
      ) : !person ? (
        <EmptyState icon="equipment" text="ยังไม่ได้สแกน — ให้ผู้ยืมโชว์ QR ประจำตัว" />
      ) : (
        <>
          {/* บัตรประจำตัวผู้ยืม — ให้แอดมินเทียบหน้ากับคนตรงหน้าก่อนส่งของ */}
          <Card className="mb-4">
            <div className="flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  person.profileImageUrl ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=F2531C&color=fff&size=160`
                }
                alt={`รูปของ ${fullName}`}
                className="h-24 w-24 flex-shrink-0 rounded-2xl border border-border object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold text-foreground">
                  {fullName}
                  {person.nickname ? <span className="text-muted-foreground"> ({person.nickname})</span> : null}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {person.studentId}
                  {person.title ? ` · ${person.title}` : ""}
                </p>
                {person.phone && (
                  <a href={`tel:${person.phone}`} className="mt-1 inline-block text-sm font-medium text-primary hover:underline">
                    {person.phone}
                  </a>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {waiting.length > 0 && <Badge className="bg-amber-100 text-amber-700">รอรับ {waiting.length}</Badge>}
                  {holding.length > 0 && <Badge className="bg-blue-100 text-blue-700">ถืออยู่ {holding.length}</Badge>}
                  {person.disabled && <Badge className="bg-red-100 text-red-700">บัญชีถูกระงับ</Badge>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setPerson(null); setRequestId(null); setMsg(""); setScanning(true); }}
                className="flex-shrink-0 text-sm text-muted-foreground hover:text-foreground"
              >
                สแกนคนถัดไป
              </button>
            </div>
          </Card>

          {/* รอรับของ — กดอนุมัติ+ส่งมอบตรงนี้ */}
          {waiting.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-base font-semibold text-foreground">รอรับของ ({waiting.length})</h2>
              <div className="space-y-3">
                {waiting.map((b) => {
                  const days = durationDays(b.startAt.toMillis(), b.endAt.toMillis());
                  return (
                    <Card key={b.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{b.itemName}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            ยืม {days} วัน · {fmtDateTime(b.startAt)} → {fmtDateTime(b.endAt)}
                          </p>
                          <p className="mt-0.5 text-sm text-muted-foreground">กำหนดคืน {fmtDateTime(b.endAt)}</p>
                          {b.usageReason && <p className="mt-1 text-sm text-foreground">{b.usageReason}</p>}
                          {!b.formImageUrl && (
                            <p className="mt-1 text-sm text-amber-700">ไม่ได้แนบเอกสารขออนุญาตมา</p>
                          )}
                        </div>
                        <div className="flex flex-shrink-0 gap-2">
                          {b.formImageUrl && (
                            <Button
                              variant="outline"
                              onClick={() => setViewImg({ src: b.formImageUrl!, title: `เอกสารขออนุญาต — ${b.itemName}` })}
                            >
                              ดูเอกสาร
                            </Button>
                          )}
                          <Button
                            onClick={() => approveAndHandOver(b)}
                            disabled={busyId === b.id || !accepted.has(b.id)}
                          >
                            {busyId === b.id ? "กำลังบันทึก…" : "อนุมัติ + ส่งมอบ"}
                          </Button>
                        </div>
                      </div>

                      {/* เงื่อนไขชดใช้ — ให้ผู้ยืมอ่านและติ๊กต่อหน้าแอดมิน ก่อนกดส่งมอบ */}
                      <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-muted/60 p-3">
                        <input
                          type="checkbox"
                          checked={accepted.has(b.id)}
                          onChange={(e) =>
                            setAccepted((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(b.id);
                              else next.delete(b.id);
                              return next;
                            })
                          }
                          className="mt-0.5 h-5 w-5 flex-shrink-0 accent-primary"
                        />
                        <span className="text-sm text-foreground">
                          ผู้ยืมรับทราบว่า <strong>หากอุปกรณ์สูญหายหรือชำรุดเสียหาย จะรับผิดชอบชดใช้เต็มจำนวนตามราคาสินค้า</strong>
                          {" "}และจะคืนภายในกำหนด
                        </span>
                      </label>
                      {!accepted.has(b.id) && (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          ต้องให้ผู้ยืมติ๊กรับทราบก่อน จึงจะกดส่งมอบได้
                        </p>
                      )}
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* ถืออยู่ — กดรับคืน */}
          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-foreground">ถืออยู่ตอนนี้ ({holding.length})</h2>
              {holding.length > 1 && (
                <Button variant="outline" onClick={returnAll} disabled={!!busyId}>
                  รับคืนทั้งหมด
                </Button>
              )}
            </div>

            {holding.length === 0 ? (
              <EmptyState text="ไม่มีของค้างอยู่กับคนนี้" />
            ) : (
              <div className="space-y-3">
                {holding.map((b) => {
                  const left = daysLeft(b.endAt.toMillis(), now);
                  const overdue = left < 0;
                  return (
                    <Card key={b.id} className={overdue ? "border-red-300" : ""}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">{b.itemName}</span>
                            <Badge className={BOOKING_STATUS[b.status].cls}>{BOOKING_STATUS[b.status].label}</Badge>
                            {overdue ? (
                              <Badge className="bg-red-100 text-red-700">เลยกำหนด {Math.abs(left)} วัน</Badge>
                            ) : (
                              <Badge className="bg-emerald-100 text-emerald-700">เหลืออีก {left} วัน</Badge>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            รับไปเมื่อ {b.pickedUpAt ? fmtDateTime(b.pickedUpAt) : fmtDateTime(b.startAt)}
                          </p>
                          <p className="text-sm text-muted-foreground">กำหนดคืน {fmtDateTime(b.endAt)}</p>
                          {b.approvedByName && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              อนุมัติโดย {b.approvedByName}
                              {b.approvedAt ? ` · ${fmtDateTime(b.approvedAt)}` : ""}
                            </p>
                          )}
                          {b.liabilityAcceptedAt && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              รับทราบเงื่อนไขชดใช้แล้วเมื่อ {fmtDateTime(b.liabilityAcceptedAt)}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-shrink-0 gap-2">
                          {b.formImageUrl && (
                            <Button
                              variant="outline"
                              onClick={() => setViewImg({ src: b.formImageUrl!, title: `เอกสารขออนุญาต — ${b.itemName}` })}
                            >
                              ดูเอกสาร
                            </Button>
                          )}
                          {b.returnImageUrl && (
                            <Button
                              variant="outline"
                              onClick={() => setViewImg({ src: b.returnImageUrl!, title: `รูปตอนคืน — ${b.itemName}` })}
                            >
                              รูปคืน
                            </Button>
                          )}
                          <Button variant="outline" onClick={() => markReturned(b)} disabled={busyId === b.id}>
                            {busyId === b.id ? "กำลังบันทึก…" : "รับคืนแล้ว"}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      <Modal open={!!viewImg} onClose={() => setViewImg(null)} title={viewImg?.title || "เอกสาร"} maxWidth="max-w-2xl">
        {viewImg && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewImg.src}
              alt={viewImg.title}
              className="max-h-[70vh] w-full rounded-2xl border border-border object-contain"
            />
            <a
              href={viewImg.src}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block text-center text-sm font-medium text-primary hover:underline"
            >
              เปิดเต็มจอในแท็บใหม่
            </a>
          </>
        )}
      </Modal>
    </div>
  );
}
