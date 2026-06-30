"use client";
// app/(member)/studio/page.tsx — จองสตูดิโอ + แอดมินแก้ไขข้อมูลห้อง
import { useMemo, useState } from "react";
import { collection, query, orderBy, addDoc, doc, updateDoc, Timestamp, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection } from "@/lib/hooks";
import { PageHeader, Badge, Spinner, Button, Modal, Field, inputClass } from "@/components/ui";
import type { StudioDoc, WithId } from "@/lib/types";

export default function StudioPage() {
  const { user, profile, role } = useAuth();
  const isAdmin = role === "admin" || role === "super_admin";

  const { data: studios, loading } = useCollection<StudioDoc>(
    () => query(collection(db, "studios"), orderBy("name")),
    []
  );

  const [booking, setBooking] = useState<WithId<StudioDoc> | null>(null);
  const [editing, setEditing] = useState<WithId<StudioDoc> | null>(null);

  return (
    <div>
      <PageHeader title="จองสตูดิโอ" subtitle="เลือกห้องสตูดิโอที่ต้องการใช้งาน" />

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {studios.map((s) => (
            <div
              key={s.id}
              className={`rounded-3xl p-6 ${
                s.theme === "dark"
                  ? "border border-white/10 bg-neutral-900 text-white shadow-[0_24px_60px_rgba(7,17,31,.28)]"
                  : "glass-card"
              }`}
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{s.name}</h3>
                  <p className={`text-sm ${s.theme === "dark" ? "text-neutral-300" : "text-neutral-500"}`}>
                    {s.subtitle}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={s.status === "open" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                    {s.status === "open" ? "เปิดให้จอง" : "ปิด"}
                  </Badge>
                  {isAdmin && (
                    <button onClick={() => setEditing(s)} className="text-sm underline opacity-70 hover:opacity-100">
                      ✏️ แก้ไข
                    </button>
                  )}
                </div>
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

              <Button
                onClick={() => setBooking(s)}
                disabled={s.status !== "open"}
                className="w-full"
              >
                จองห้องนี้
              </Button>
            </div>
          ))}
        </div>
      )}

      {booking && user && (
        <BookingModal
          studio={booking}
          userId={user.uid}
          userName={`${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() || user.email || ""}
          userPhone={profile?.phone ?? ""}
          onClose={() => setBooking(null)}
        />
      )}
      {editing && isAdmin && <EditModal studio={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BookingModal({
  studio,
  userId,
  userName,
  userPhone,
  onClose,
}: {
  studio: WithId<StudioDoc>;
  userId: string;
  userName: string;
  userPhone: string;
  onClose: () => void;
}) {
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
    setErr("");
    if (!start || !end) return setErr("กรุณาเลือกวันเวลา");
    if (new Date(end) <= new Date(start)) return setErr("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม");
    if (!reason.trim()) return setErr("กรุณาระบุวัตถุประสงค์");
    setBusy(true);
    try {
      await addDoc(collection(db, "bookings"), {
        bookingType: "studio",
        itemId: studio.id,
        itemName: studio.name,
        userId,
        userName,
        userPhone,
        guestName: null,
        guestEmail: null,
        startAt: Timestamp.fromDate(new Date(start)),
        endAt: Timestamp.fromDate(new Date(end)),
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
      setErr("จองไม่สำเร็จ — ตรวจว่า deploy Security Rules แล้วหรือยัง");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`จอง ${studio.name}`}>
      {done ? (
        <div className="py-4 text-center">
          <div className="mb-2 text-3xl">✅</div>
          <p className="text-sm">ส่งคำขอจองเรียบร้อย รอแอดมินอนุมัติ</p>
          <Button onClick={onClose} className="mt-4">
            ปิด
          </Button>
        </div>
      ) : (
        <>
          {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">⚠️ {err}</div>}
          <Field label="วันเวลาที่เริ่ม" required>
            <input type="datetime-local" min={nowLocal} value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
          </Field>
          <Field label="วันเวลาที่สิ้นสุด" required>
            <input type="datetime-local" min={start || nowLocal} value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
          </Field>
          <Field label="วัตถุประสงค์การใช้งาน" required>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputClass} placeholder="เช่น ถ่าย Portrait, MV, Product..." />
          </Field>
          <Button onClick={submit} disabled={busy} className="mt-2 w-full">
            {busy ? "กำลังส่ง…" : "ยืนยันการจอง"}
          </Button>
        </>
      )}
    </Modal>
  );
}

function EditModal({ studio, onClose }: { studio: WithId<StudioDoc>; onClose: () => void }) {
  const [subtitle, setSubtitle] = useState(studio.subtitle);
  const [tags, setTags] = useState(studio.tags?.join(", ") ?? "");
  const [features, setFeatures] = useState(studio.features?.join("\n") ?? "");
  const [openHours, setOpenHours] = useState(studio.openHours);
  const [contactPhone, setContactPhone] = useState(studio.contactPhone);
  const [theme, setTheme] = useState(studio.theme);
  const [status, setStatus] = useState(studio.status);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true);
    setErr("");
    try {
      await updateDoc(doc(db, "studios", studio.id), {
        subtitle,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        features: features.split("\n").map((f) => f.trim()).filter(Boolean),
        openHours,
        contactPhone,
        theme,
        status,
      });
      onClose();
    } catch {
      setErr("บันทึกไม่สำเร็จ (ต้องเป็นแอดมิน + deploy rules แล้ว)");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`แก้ไข ${studio.name}`}>
      {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">⚠️ {err}</div>}
      <Field label="คำโปรย (subtitle)">
        <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className={inputClass} />
      </Field>
      <Field label="แท็ก (คั่นด้วย ,)">
        <input value={tags} onChange={(e) => setTags(e.target.value)} className={inputClass} />
      </Field>
      <Field label="คุณสมบัติ (บรรทัดละ 1 ข้อ)">
        <textarea value={features} onChange={(e) => setFeatures(e.target.value)} rows={4} className={inputClass} />
      </Field>
      <Field label="เวลาเปิด">
        <input value={openHours} onChange={(e) => setOpenHours(e.target.value)} className={inputClass} />
      </Field>
      <Field label="เบอร์ติดต่อ">
        <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputClass} />
      </Field>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Field label="ธีม">
          <select value={theme} onChange={(e) => setTheme(e.target.value as StudioDoc["theme"])} className={inputClass}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </Field>
        <Field label="สถานะ">
          <select value={status} onChange={(e) => setStatus(e.target.value as StudioDoc["status"])} className={inputClass}>
            <option value="open">เปิดให้จอง</option>
            <option value="closed">ปิด</option>
          </select>
        </Field>
      </div>
      <Button onClick={save} disabled={busy} className="mt-2 w-full">
        {busy ? "กำลังบันทึก…" : "บันทึก"}
      </Button>
    </Modal>
  );
}
