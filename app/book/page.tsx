"use client";
// app/book/page.tsx — จองสตูดิโอแบบไม่ต้องล็อกอิน (หน้าสาธารณะ)
// อยู่นอก (member) group จึงไม่มี RequireAuth ครอบ
import { useMemo, useState } from "react";
import Link from "next/link";
import { collection, query, orderBy, addDoc, Timestamp, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useCollection } from "@/lib/hooks";
import { Badge, Spinner, Button, Modal, Field, inputClass, EmptyState } from "@/components/ui";
import type { StudioDoc, WithId } from "@/lib/types";

export default function PublicBookPage() {
  const { data: studios, loading, error } = useCollection<StudioDoc>(
    () => query(collection(db, "studios"), orderBy("name")),
    []
  );
  const [booking, setBooking] = useState<WithId<StudioDoc> | null>(null);

  const contactPhone = studios[0]?.contactPhone || "062-148-1739";

  return (
    <div className="flex min-h-screen flex-col">
      {/* header เรียบง่ายสำหรับหน้าสาธารณะ */}
      <header className="glass-nav sticky top-0 z-50">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <span className="flex items-center gap-1.5 text-lg font-extrabold">
            <span>📷</span> <span className="text-grad">IE-PHOTO</span>
          </span>
          <div className="ml-auto flex items-center gap-1">
            <a
              href={`tel:${contactPhone.replace(/-/g, "")}`}
              className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-green-600 hover:bg-neutral-100"
            >
              📞 {contactPhone}
            </a>
            <Link
              href="/login"
              className="rounded-full border border-white/70 bg-white/50 px-3.5 py-1.5 text-sm backdrop-blur transition hover:bg-white/80"
            >
              เข้าสู่ระบบ
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">จองสตูดิโอ</h1>
          <p className="mt-1.5 text-sm text-neutral-500">
            จองได้เลยไม่ต้องสมัครสมาชิก — กรอกข้อมูลติดต่อแล้วรอทีมงานยืนยัน
          </p>
        </div>

        {loading ? (
          <Spinner />
        ) : error ? (
          <EmptyState icon="⚠️" text="โหลดข้อมูลห้องไม่สำเร็จ กรุณารีเฟรชหน้า" />
        ) : studios.length === 0 ? (
          <EmptyState icon="🎬" text="ยังไม่มีห้องสตูดิโอเปิดให้จอง" />
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {studios.map((s) => (
              <div
                key={s.id}
                className={`animate-in rounded-3xl p-6 transition-transform duration-400 hover:-translate-y-1 ${
                  s.theme === "dark"
                    ? "border border-white/10 bg-neutral-900 text-white shadow-[0_24px_60px_rgba(7,17,31,.28)] hover:shadow-[0_30px_70px_rgba(7,17,31,.35)]"
                    : "glass-card"
                }`}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold">{s.name}</h3>
                    <p className={`text-sm ${s.theme === "dark" ? "text-neutral-300" : "text-neutral-500"}`}>
                      {s.subtitle}
                    </p>
                  </div>
                  <Badge className={s.status === "open" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                    {s.status === "open" ? "เปิดให้จอง" : "ปิด"}
                  </Badge>
                </div>

                <div className="mb-3 flex flex-wrap gap-1.5">
                  {s.tags?.map((t) => (
                    <span
                      key={t}
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        s.theme === "dark" ? "bg-white/10" : "bg-neutral-100"
                      }`}
                    >
                      {t}
                    </span>
                  ))}
                </div>

                <ul className="mb-4 space-y-1 text-sm">
                  {s.features?.map((f) => (
                    <li key={f} className="flex gap-1.5">
                      <span className="text-orange-500">•</span> {f}
                    </li>
                  ))}
                </ul>

                <div className={`mb-4 text-xs ${s.theme === "dark" ? "text-neutral-400" : "text-neutral-500"}`}>
                  🕐 {s.openHours} &nbsp;·&nbsp; 📞 {s.contactPhone}
                </div>

                <Button onClick={() => setBooking(s)} disabled={s.status !== "open"} className="w-full">
                  จองห้องนี้
                </Button>
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-sm text-neutral-500">
          เป็นสมาชิกชุมนุมอยู่แล้ว?{" "}
          <Link href="/login" className="font-semibold text-orange-600">
            เข้าสู่ระบบเพื่อดูการจองของคุณ
          </Link>
        </p>
      </main>

      {booking && <GuestBookingModal studio={booking} onClose={() => setBooking(null)} />}
    </div>
  );
}

function GuestBookingModal({ studio, onClose }: { studio: WithId<StudioDoc>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const nowLocal = useMemo(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }, []);

  async function submit() {
    if (busy) return;
    setErr("");
    if (!name.trim()) return setErr("กรุณากรอกชื่อ-นามสกุล");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr("กรุณากรอกอีเมลให้ถูกต้อง");
    if (phone.trim().length < 9) return setErr("กรุณากรอกเบอร์โทรให้ถูกต้อง");
    if (!start || !end) return setErr("กรุณาเลือกวันเวลา");
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (endDate <= startDate) return setErr("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม");
    if (startDate.getTime() < Date.now() - 60_000) return setErr("ไม่สามารถจองเวลาในอดีตได้");
    if (!reason.trim()) return setErr("กรุณาระบุวัตถุประสงค์");

    setBusy(true);
    try {
      // หมายเหตุ: guest อ่าน bookings ไม่ได้ (ตาม rules) จึงเช็คซ้อนฝั่ง client ไม่ได้
      // แอดมินจะเห็นคำเตือนตอนกดอนุมัติถ้าช่วงเวลาทับกับที่อนุมัติไปแล้ว
      await addDoc(collection(db, "bookings"), {
        bookingType: "studio",
        itemId: studio.id,
        itemName: studio.name,
        userId: null,
        userName: name.trim(),
        userPhone: phone.trim(),
        guestName: name.trim(),
        guestEmail: email.trim(),
        startAt: Timestamp.fromDate(startDate),
        endAt: Timestamp.fromDate(endDate),
        formImageUrl: null,
        returnImageUrl: null,
        usageReason: reason.trim(),
        usageType: null,
        status: "pending",
        responsibleUserId: null,
        responsibleUserName: null,
        consentToken: null,
        createdAt: serverTimestamp(),
      });
      setDone(true);
    } catch {
      setErr("ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`จอง ${studio.name}`}>
      {done ? (
        <div className="py-4 text-center">
          <div className="mb-2 text-3xl">✅</div>
          <p className="text-sm">ส่งคำขอจองเรียบร้อย</p>
          <p className="mt-1 text-sm text-neutral-500">
            ทีมงานจะติดต่อกลับที่เบอร์/อีเมลที่ให้ไว้เพื่อยืนยัน
          </p>
          <Button onClick={onClose} className="mt-4">
            ปิด
          </Button>
        </div>
      ) : (
        <>
          {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">⚠️ {err}</div>}

          <Field label="ชื่อ-นามสกุล" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="สมชาย ใจดี" maxLength={100} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="อีเมล" required>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@example.com" maxLength={120} />
            </Field>
            <Field label="เบอร์โทรศัพท์" required>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="0XXXXXXXXX" maxLength={20} />
            </Field>
          </div>
          <Field label="วันเวลาที่เริ่ม" required>
            <input type="datetime-local" min={nowLocal} value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
          </Field>
          <Field label="วันเวลาที่สิ้นสุด" required>
            <input type="datetime-local" min={start || nowLocal} value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
          </Field>
          <Field label="วัตถุประสงค์การใช้งาน" required>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputClass} placeholder="เช่น ถ่าย Portrait, MV, Product..." maxLength={500} />
          </Field>

          <Button onClick={submit} disabled={busy} className="mt-2 w-full">
            {busy ? "กำลังส่ง…" : "ส่งคำขอจอง"}
          </Button>
          <p className="mt-2 text-center text-xs text-neutral-400">
            ส่งแล้วรอทีมงานยืนยัน จะติดต่อกลับตามข้อมูลที่กรอก
          </p>
        </>
      )}
    </Modal>
  );
}
