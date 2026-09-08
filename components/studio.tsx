"use client";
// components/studio.tsx — การ์ดห้องสตูดิโอ + กล่องแก้ไขข้อมูลห้อง (ใช้ร่วมหน้าสมาชิก/สาธารณะ)
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Badge, Button, Modal, Field, inputClass, Alert } from "@/components/ui";
import { stripEmoji } from "@/lib/format";
import GlareHover from "@/components/reactbits/GlareHover";
import Icon from "@/components/icon";
import type { StudioDoc, WithId } from "@/lib/types";

export function StudioCard({
  s,
  onBook,
  onEdit,
  index = 0,
  /** ทับข้อความบนปุ่ม — ฝั่งกรรมการเรียกว่า "กันห้อง" ไม่ใช่ "จอง" */
  bookLabel,
}: {
  s: WithId<StudioDoc>;
  onBook: () => void;
  onEdit?: () => void;
  index?: number;
  bookLabel?: string;
}) {
  const closed = s.status !== "open";
  const dark = s.theme === "dark";
  return (
    <div className="animate-in" style={{ animationDelay: `${index * 55}ms` }}>
      <GlareHover
        className={`hover-scale rounded-3xl p-5 ${dark ? "liquid-glass-dark" : "glass-card"}`}
        glareOpacity={dark ? 0.28 : 0.5}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-lg font-bold leading-tight">{s.name}</h3>
            <p className={`text-sm ${dark ? "text-white/65" : "text-[var(--muted-ink)]"}`}>{s.subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              className={
                closed
                  ? "bg-neutral-100 text-neutral-600 border border-neutral-200"
                  : "bg-emerald-100 text-emerald-800 border border-emerald-200"
              }
            >
              {closed ? "ปิด" : "เปิดให้จอง"}
            </Badge>
            {onEdit && (
              <button
                onClick={onEdit}
                aria-label={`แก้ไข ${s.name}`}
                className="tap grid place-items-center rounded-xl opacity-60 transition hover:opacity-100"
              >
                <Icon name="edit" size={16} />
              </button>
            )}
          </div>
        </div>

        {s.tags?.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {s.tags.map((t) => (
              <span
                key={t}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  dark ? "bg-white/10 text-white/80" : "border border-black/6 bg-white/70 text-[var(--ink)]/75"
                }`}
              >
                {stripEmoji(t)}
              </span>
            ))}
          </div>
        )}

        {s.features?.length > 0 && (
          <ul className={`mb-4 space-y-1 text-sm ${dark ? "text-white/80" : "text-[var(--ink)]/80"}`}>
            {s.features.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--faculty)]" />
                <span>{stripEmoji(f)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className={`mb-4 space-y-1 text-xs ${dark ? "text-white/55" : "text-[var(--muted-ink)]"}`}>
          <p className="flex items-center gap-1.5">
            <Icon name="time" size={16} /> {s.openHours}
          </p>
          <p className="flex items-center gap-1.5">
            <Icon name="phone" size={16} /> {s.contactPhone}
          </p>
        </div>

        <Button onClick={onBook} disabled={closed} fullWidth>
          {closed ? "ยังไม่เปิดให้จอง" : (bookLabel ?? "จองห้องนี้")}
        </Button>
      </GlareHover>
    </div>
  );
}

export function StudioEditModal({
  studio,
  onClose,
}: {
  studio: WithId<StudioDoc>;
  onClose: () => void;
}) {
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
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}
      <Field label="คำโปรย">
        <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className={inputClass} maxLength={140} />
      </Field>
      <Field label="แท็ก (คั่นด้วย ,)">
        <input value={tags} onChange={(e) => setTags(e.target.value)} className={inputClass} />
      </Field>
      <Field label="คุณสมบัติ (บรรทัดละ 1 ข้อ)">
        <textarea value={features} onChange={(e) => setFeatures(e.target.value)} rows={4} className={inputClass} />
      </Field>
      <div className="grid gap-0 sm:grid-cols-2 sm:gap-3">
        <Field label="เวลาเปิด">
          <input value={openHours} onChange={(e) => setOpenHours(e.target.value)} className={inputClass} />
        </Field>
        <Field label="เบอร์ติดต่อ">
          <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputClass} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="ธีมการ์ด">
          <select value={theme} onChange={(e) => setTheme(e.target.value as StudioDoc["theme"])} className={inputClass}>
            <option value="light">สว่าง</option>
            <option value="dark">เข้ม</option>
          </select>
        </Field>
        <Field label="สถานะ">
          <select value={status} onChange={(e) => setStatus(e.target.value as StudioDoc["status"])} className={inputClass}>
            <option value="open">เปิดให้จอง</option>
            <option value="closed">ปิด</option>
          </select>
        </Field>
      </div>
      <Button onClick={save} loading={busy} fullWidth size="lg" className="mt-2">
        บันทึก
      </Button>
    </Modal>
  );
}
