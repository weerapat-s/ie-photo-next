"use client";
// components/form-renderer.tsx — เรนเดอร์ฟอร์มจาก schema แล้วบันทึกคำตอบลง formResponses
import { useMemo, useState } from "react";
import {
  collection,
  doc,
  increment,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { compressImageToDataUrl } from "@/lib/image";
import { Button, Field, inputClass, Alert, ImagePicker } from "@/components/ui";
import Icon from "@/components/icon";
import { IS_DISPLAY_ONLY, initialValues, validateForm } from "@/lib/forms";
import type { FormDoc, FormField, FormValue, WithId } from "@/lib/types";

export default function FormRenderer({
  form,
  user,
  bookingId = null,
  bare = false,
  onSubmitted,
}: {
  form: WithId<FormDoc>;
  user?: { uid: string; name: string; contact: string } | null;
  bookingId?: string | null;
  /** true = ไม่ห่อการ์ด (ใช้เมื่ออยู่ใน Modal ที่มีพื้นหลังอยู่แล้ว) */
  bare?: boolean;
  onSubmitted?: (responseId: string) => void;
}) {
  const [values, setValues] = useState<Record<string, FormValue>>(() => initialValues(form.fields));
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [name, setName] = useState(user?.name ?? "");
  const [contact, setContact] = useState(user?.contact ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const needsIdentity = !user;

  const imageFields = useMemo(() => form.fields.filter((f) => f.type === "image"), [form.fields]);

  function setValue(id: string, v: FormValue) {
    setValues((prev) => ({ ...prev, [id]: v }));
    setErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  /**
   * เลื่อนไปช่องที่ยังไม่ถูกต้อง แล้วโฟกัสให้พิมพ์ต่อได้ทันที
   * ต้องหน่วงเฟรมนึงให้ React วาดขอบแดงก่อน ไม่งั้นเลื่อนไปเจอช่องที่ยังไม่แดง
   */
  function scrollToField(fieldId: string | null) {
    requestAnimationFrame(() => {
      const el = fieldId ? document.querySelector<HTMLElement>(`[data-field="${fieldId}"]`) : null;
      const target = el ?? document.querySelector<HTMLElement>("[data-field-invalid]");
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.querySelector<HTMLElement>("input,textarea,select,button")?.focus({ preventScroll: true });
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr("");

    if (needsIdentity) {
      if (!name.trim()) {
        setErr("กรุณากรอกชื่อผู้ส่ง");
        scrollToField("__name");
        return;
      }
      if (!contact.trim()) {
        setErr("กรุณากรอกเบอร์โทรหรืออีเมลที่ติดต่อกลับได้");
        scrollToField("__contact");
        return;
      }
    }

    const errs = validateForm(form.fields, values);
    // ฟิลด์รูปยังไม่ถูกแปลงตอนตรวจ — เช็คจากไฟล์ที่เลือกแทน
    for (const f of imageFields) {
      if (f.required && !files[f.id]) errs[f.id] = "กรุณาแนบรูป";
      else delete errs[f.id];
    }
    // มีทั้งช่องข้อมูลผู้ส่ง (ไม่มี id ในฟอร์ม) และช่องในฟอร์ม —
    // เลื่อนไปช่องแรกที่ผิด เรียงตามลำดับที่เห็นบนหน้าจอ ไม่ใช่ลำดับใน object
    const firstBad = form.fields.map((f) => f.id).find((id) => errs[id]);
    if (Object.keys(errs).length) {
      setErrors(errs);
      setErr("กรุณากรอกช่องที่มีขอบสีแดงให้ครบ");
      scrollToField(firstBad ?? null);
      return;
    }

    setBusy(true);
    try {
      // ย่อรูปทั้งหมดก่อนเขียน (เก็บเป็น data URL ใน Firestore — ไม่ใช้ Storage)
      const finalValues: Record<string, FormValue> = { ...values };
      for (const f of imageFields) {
        const file = files[f.id];
        if (file) finalValues[f.id] = await compressImageToDataUrl(file, 1200, 0.72);
        else finalValues[f.id] = null;
      }

      const respRef = doc(collection(db, "formResponses"));
      const batch = writeBatch(db);
      batch.set(respRef, {
        formId: form.id,
        formTitle: form.title,
        values: finalValues,
        userId: user?.uid ?? null,
        submitterName: (user?.name || name).trim(),
        submitterContact: (user?.contact || contact).trim(),
        bookingId,
        createdAt: serverTimestamp(),
      });
      batch.update(doc(db, "forms", form.id), { responseCount: increment(1) });
      await batch.commit();

      setDone(true);
      onSubmitted?.(respRef.id);
    } catch (e) {
      setErr(
        e instanceof Error && e.message === "IMAGE_TOO_LARGE"
          ? "รูปที่แนบใหญ่เกินไป กรุณาเลือกรูปที่เล็กลง"
          : "ส่งฟอร์มไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
      );
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className={`animate-in p-8 text-center ${bare ? "" : "glass-card rounded-3xl"}`}>
        <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl tone-ok"><Icon name="celebrate" size={28} /></span>
        <h2 className="t-heading text-[var(--ink)]">ส่งเรียบร้อย</h2>
        <p className="mt-1.5 text-sm text-[var(--muted-ink)]">
          {form.successMessage || "ขอบคุณที่กรอกฟอร์ม ทีมงานได้รับข้อมูลแล้ว"}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={bare ? "" : "glass-card animate-in rounded-3xl p-5 sm:p-6"}>
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      {needsIdentity && (
        <div className="mb-5 rounded-2xl border border-black/6 bg-white/60 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">
            ข้อมูลผู้ส่ง
          </p>
          <div data-field="__name" data-field-invalid={needsIdentity && !name.trim() ? "" : undefined}>
            <Field label="ชื่อ-นามสกุล" required>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} maxLength={100} />
            </Field>
          </div>
          <div data-field="__contact">
            <Field label="เบอร์โทร หรือ อีเมล" required>
              <input value={contact} onChange={(e) => setContact(e.target.value)} className={inputClass} maxLength={120} placeholder="0XXXXXXXXX หรือ you@example.com" />
            </Field>
          </div>
        </div>
      )}

      {form.fields.map((f) => (
        <div key={f.id} data-field={f.id} data-field-invalid={errors[f.id] ? "" : undefined}>
        <FieldRenderer
          field={f}
          value={values[f.id] ?? null}
          error={errors[f.id]}
          onChange={(v) => setValue(f.id, v)}
          file={files[f.id] ?? null}
          preview={previews[f.id] ?? null}
          onPickFile={(file) => {
            setFiles((p) => ({ ...p, [f.id]: file }));
            setPreviews((p) => ({ ...p, [f.id]: file ? URL.createObjectURL(file) : null }));
            setErrors((prev) => {
              if (!prev[f.id]) return prev;
              const next = { ...prev };
              delete next[f.id];
              return next;
            });
          }}
        />
        </div>
      ))}

      <Button type="submit" loading={busy} fullWidth size="lg" className="mt-4">
        ส่งฟอร์ม
      </Button>
    </form>
  );
}

/* ═══ ฟิลด์เดี่ยว ═════════════════════════════════════════════ */
export function FieldRenderer({
  field: f,
  value,
  error,
  onChange,
  file,
  preview,
  onPickFile,
  disabled,
}: {
  field: FormField;
  value: FormValue;
  error?: string;
  onChange: (v: FormValue) => void;
  file?: File | null;
  preview?: string | null;
  onPickFile?: (f: File | null) => void;
  disabled?: boolean;
}) {
  if (IS_DISPLAY_ONLY.includes(f.type)) {
    return (
      <div className="mb-4 mt-6 border-t border-black/8 pt-4 first:mt-0 first:border-0 first:pt-0">
        <h3 className="text-base font-bold text-[var(--ink)]">{f.label}</h3>
        {f.help && <p className="mt-0.5 text-sm text-[var(--muted-ink)]">{f.help}</p>}
      </div>
    );
  }

  const common = {
    className: inputClass,
    disabled,
    placeholder: f.placeholder || undefined,
    "aria-invalid": error ? true : undefined,
  };

  let control: React.ReactNode;
  switch (f.type) {
    case "textarea":
      control = (
        <textarea
          {...common}
          rows={4}
          maxLength={f.maxLength ?? 2000}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "number":
      control = (
        <input
          {...common}
          type="number"
          inputMode="numeric"
          min={f.min ?? undefined}
          max={f.max ?? undefined}
          value={value === null || value === "" ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
      );
      break;
    case "email":
      control = <input {...common} type="email" inputMode="email" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "tel":
      control = <input {...common} type="tel" inputMode="tel" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "date":
      control = <input {...common} type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "time":
      control = <input {...common} type="time" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "datetime":
      control = <input {...common} type="datetime-local" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "select":
      control = (
        <select {...common} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">— เลือก —</option>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    case "radio":
      control = (
        <div className="space-y-2">
          {(f.options ?? []).map((o) => (
            <label
              key={o}
              className={`press flex min-h-[46px] cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm transition ${
                value === o
                  ? "border-[var(--faculty)] bg-[var(--faculty)]/8 font-semibold"
                  : "border-black/10 bg-white/60"
              }`}
            >
              <input
                type="radio"
                name={f.id}
                checked={value === o}
                onChange={() => onChange(o)}
                disabled={disabled}
                className="h-4 w-4 accent-[var(--faculty)]"
              />
              {o}
            </label>
          ))}
        </div>
      );
      break;
    case "checkbox": {
      const arr = Array.isArray(value) ? value : [];
      control = (
        <div className="space-y-2">
          {(f.options ?? []).map((o) => {
            const on = arr.includes(o);
            return (
              <label
                key={o}
                className={`press flex min-h-[46px] cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm transition ${
                  on ? "border-[var(--faculty)] bg-[var(--faculty)]/8 font-semibold" : "border-black/10 bg-white/60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={disabled}
                  onChange={() => onChange(on ? arr.filter((x) => x !== o) : [...arr, o])}
                  className="h-4 w-4 accent-[var(--faculty)]"
                />
                {o}
              </label>
            );
          })}
        </div>
      );
      break;
    }
    case "image":
      control = (
        <ImagePicker
          file={file ?? null}
          preview={preview ?? null}
          onPick={(picked) => onPickFile?.(picked)}
          hint="ระบบย่อขนาดให้อัตโนมัติก่อนส่ง"
        />
      );
      break;
    default:
      control = (
        <input
          {...common}
          type="text"
          maxLength={f.maxLength ?? 200}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }

  return (
    <Field label={f.label} required={f.required} help={f.help} error={error}>
      {control}
    </Field>
  );
}
