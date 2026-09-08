"use client";
// components/panels/system-settings-panel.tsx — ตั้งค่าทั้งระบบ (settings/app)
// (เดิมเป็นทั้งหน้า /settings — ตอนนี้เป็นแท็บแรกของหน้านั้น)
// แก้แล้วมีผลทันทีทุกเครื่องผ่าน onSnapshot ใน SettingsProvider
import { useState } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { describeWriteError } from "@/lib/errors";
import { useAuth } from "@/lib/firebase/auth-context";
import { useSettings } from "@/lib/settings-context";
import {
  Card,
  Section,
  Button,
  Field,
  inputClass,
  Switch,
  Alert,
  useToast,
} from "@/components/ui";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/types";

const PRESET_COLORS = ["#ef3961", "#ff5b1f", "#7c3aed", "#0ea5e9", "#10b981", "#1d1d1f"];

export default function SystemSettingsPanel() {
  const { user } = useAuth();
  const { settings, loading } = useSettings();
  const { show, node: toastNode } = useToast();

  // เก็บเฉพาะ "ส่วนที่แก้" ทับค่าจากเซิร์ฟเวอร์
  // → ค่าที่ยังไม่แตะอัปเดตสดตาม onSnapshot โดยไม่เขียนทับสิ่งที่กำลังพิมพ์
  const [edits, setEdits] = useState<Partial<AppSettings> | null>(null);
  const draft: AppSettings = edits ? { ...settings, ...edits } : settings;
  const dirty = edits !== null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setEdits((e) => ({ ...(e ?? {}), [key]: value }));
  }

  async function save() {
    if (!user) return;
    setBusy(true);
    setErr("");
    try {
      await setDoc(
        doc(db, "settings", "app"),
        { ...draft, updatedAt: serverTimestamp(), updatedBy: user.uid },
        { merge: true }
      );
      setEdits(null);
      show("บันทึกการตั้งค่าแล้ว");
    } catch (e) {
      setErr(describeWriteError(e, "บันทึก"));
    } finally {
      setBusy(false);
    }
  }

  function resetDefaults() {
    if (!confirm("คืนค่าตั้งต้นทั้งหมด? (ยังไม่บันทึกจนกว่าจะกดบันทึก)")) return;
    setEdits({ ...DEFAULT_SETTINGS });
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-40 rounded-full" />
        <div className="skeleton h-48 rounded-3xl" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <Button onClick={save} loading={busy} disabled={!dirty} icon="approved">
          {dirty ? "บันทึก" : "บันทึกแล้ว"}
        </Button>
      </div>

      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}
      {dirty && <Alert tone="warn">มีการแก้ไขที่ยังไม่บันทึก</Alert>}

      <div className="space-y-6">
        {/* ── แบรนด์ ───────────────────────────────────────────── */}
        <Section title="ข้อมูลชุมนุม">
          <Card>
            <Field label="ชื่อระบบ" required>
              <input value={draft.siteName} onChange={(e) => set("siteName", e.target.value)} className={inputClass} maxLength={40} />
            </Field>
            <Field label="คำโปรย">
              <input value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} className={inputClass} maxLength={120} />
            </Field>
            <div className="grid gap-0 sm:grid-cols-2 sm:gap-3">
              <Field label="เบอร์ติดต่อ">
                <input value={draft.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} className={inputClass} maxLength={20} />
              </Field>
              <Field label="อีเมลติดต่อ">
                <input value={draft.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} className={inputClass} maxLength={120} />
              </Field>
            </div>
            <Field label="ลิงก์อัลบั้มกิจกรรม" help="โผล่ในเมนูและหน้าฟีด">
              <input value={draft.galleryUrl} onChange={(e) => set("galleryUrl", e.target.value)} className={inputClass} placeholder="https://…" />
            </Field>
            <Field label="ประกาศบนหัวเว็บ" help="เว้นว่าง = ไม่แสดงแถบประกาศ">
              <input value={draft.announcement} onChange={(e) => set("announcement", e.target.value)} className={inputClass} maxLength={140} placeholder="เช่น ปิดให้บริการ 12–15 เม.ย." />
            </Field>

            <Field label="สีหลักของระบบ" help="เปลี่ยนแล้วสีปุ่ม/ป้าย/เมนูทั้งเว็บเปลี่ยนตาม">
              <div className="flex flex-wrap items-center gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set("accentColor", c)}
                    aria-label={`ใช้สี ${c}`}
                    className={`tap h-10 w-10 rounded-full border-2 transition ${
                      draft.accentColor.toLowerCase() === c ? "scale-110 border-[var(--ink)]" : "border-white"
                    }`}
                    style={{ background: c, boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}
                  />
                ))}
                <input
                  type="color"
                  value={draft.accentColor}
                  onChange={(e) => set("accentColor", e.target.value)}
                  className="tap h-10 w-14 cursor-pointer rounded-xl border border-black/10 bg-white p-1"
                  aria-label="เลือกสีเอง"
                />
              </div>
            </Field>
          </Card>
        </Section>

        {/* ── กติกาการจอง ─────────────────────────────────────── */}
        <Section title="กติกาการจอง">
          <Card>
            <div className="grid gap-0 sm:grid-cols-3 sm:gap-3">
              <Field label="จองล่วงหน้าได้ (วัน)">
                <input type="number" min={1} max={365} value={draft.maxAdvanceDays} onChange={(e) => set("maxAdvanceDays", Number(e.target.value))} className={inputClass} />
              </Field>
              <Field label="ยืมอุปกรณ์นานสุด (วัน)">
                <input type="number" min={1} max={30} value={draft.maxBorrowDays} onChange={(e) => set("maxBorrowDays", Number(e.target.value))} className={inputClass} />
              </Field>
              <Field label="จองสตูดิโอนานสุด (ชม.)">
                <input type="number" min={1} max={72} value={draft.maxStudioHours} onChange={(e) => set("maxStudioHours", Number(e.target.value))} className={inputClass} />
              </Field>
            </div>

            <ToggleRow
              label="บังคับแนบเอกสารตอนยืมอุปกรณ์"
              desc="ปิดได้ถ้าชุมนุมใช้ระบบอนุมัติแบบอื่น"
              checked={draft.requireBorrowDocument}
              onChange={(v) => set("requireBorrowDocument", v)}
            />
            <ToggleRow
              label="ให้บุคคลภายนอกจองสตูดิโอได้"
              desc="เปิดหน้า /book ให้คนที่ไม่ได้ล็อกอิน"
              checked={draft.allowGuestStudioBooking}
              onChange={(v) => set("allowGuestStudioBooking", v)}
            />
            <ToggleRow
              label="ให้บุคคลภายนอกจองตากล้องได้"
              checked={draft.allowGuestPhotographerBooking}
              onChange={(v) => set("allowGuestPhotographerBooking", v)}
            />
          </Card>
        </Section>

        {/* ── งานตากล้อง ──────────────────────────────────────── */}
        <Section title="งานตากล้อง">
          <Card>
            <Field label="ประเภทงาน (บรรทัดละ 1 รายการ)" help="โผล่เป็นตัวเลือกในฟอร์มจองตากล้อง">
              <textarea
                rows={6}
                value={draft.photographerJobTypes.join("\n")}
                onChange={(e) => set("photographerJobTypes", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
                className={inputClass}
              />
            </Field>
            <Field
              label="ยศในชุมนุม (บรรทัดละ 1 รายการ)"
              help="ตัวเลือกที่กรรมการเลือกให้สมาชิกได้ในหน้าจัดการสมาชิก"
            >
              <textarea
                rows={6}
                value={draft.memberTitles.join("\n")}
                onChange={(e) =>
                  set("memberTitles", e.target.value.split("\n").map((t) => t.trim()).filter(Boolean))
                }
                className={inputClass}
              />
            </Field>
            <Field label="ขอตากล้องได้สูงสุด (คน/งาน)">
              <input type="number" min={1} max={20} value={draft.maxCrewSize} onChange={(e) => set("maxCrewSize", Number(e.target.value))} className={inputClass} />
            </Field>
          </Card>
        </Section>

        {/* ── ส่งงาน / NAS ────────────────────────────────────── */}
        <Section title="ส่งงาน / NAS">
          <Card>
            <Field label="โดเมน NAS" help="ใช้ตรวจว่าลิงก์ที่วางมาจาก NAS จริง">
              <input value={draft.nasBaseUrl} onChange={(e) => set("nasBaseUrl", e.target.value)} className={inputClass} placeholder="https://nextcloud.ienas.site" />
            </Field>
            <Field label="คำแนะนำการอัปไฟล์" help="ข้อความที่ทีมงานเห็นในหน้าส่งงาน">
              <textarea rows={3} value={draft.nasUploadHint} onChange={(e) => set("nasUploadHint", e.target.value)} className={inputClass} maxLength={400} />
            </Field>
            <Field label="กำหนดส่งงานเริ่มต้น (วันหลังจบงาน)">
              <input type="number" min={1} max={90} value={draft.deliveryDefaultDays} onChange={(e) => set("deliveryDefaultDays", Number(e.target.value))} className={inputClass} />
            </Field>
          </Card>
        </Section>

        {/* ── เปิด/ปิดฟีเจอร์ ─────────────────────────────────── */}
        <Section title="เปิด/ปิดฟีเจอร์" >
          <Card>
            <p className="mb-3 text-xs text-[var(--muted-ink)]">ปิดแล้วเมนูและหน้าที่เกี่ยวข้องจะหายไปจากทุกบัญชี</p>
            <ToggleRow label="ฟีดกิจกรรม" checked={draft.featureFeed} onChange={(v) => set("featureFeed", v)} />
            <ToggleRow label="ยืมอุปกรณ์ + คลังอุปกรณ์" checked={draft.featureBorrow} onChange={(v) => set("featureBorrow", v)} />
            <ToggleRow label="จองสตูดิโอ" checked={draft.featureStudio} onChange={(v) => set("featureStudio", v)} />
            <ToggleRow label="จองตากล้อง" checked={draft.featurePhotographer} onChange={(v) => set("featurePhotographer", v)} />
            <ToggleRow label="มอบหมายงาน" checked={draft.featureTasks} onChange={(v) => set("featureTasks", v)} />
            <ToggleRow label="ฟอร์มที่สร้างเอง" checked={draft.featureForms} onChange={(v) => set("featureForms", v)} />
            <ToggleRow label="ระบบส่งงาน / ลิงก์ NAS" checked={draft.featureDeliveries} onChange={(v) => set("featureDeliveries", v)} />
          </Card>
        </Section>

        <div className="flex flex-wrap gap-2 pb-6">
          <Button onClick={save} loading={busy} disabled={!dirty} size="lg" className="flex-1">
            บันทึกการตั้งค่า
          </Button>
          <Button variant="outline" onClick={resetDefaults} size="lg">
            คืนค่าตั้งต้น
          </Button>
        </div>
      </div>

      {toastNode}
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-black/6 py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--ink)]">{label}</p>
        {desc && <p className="text-xs text-[var(--muted-ink)]">{desc}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
