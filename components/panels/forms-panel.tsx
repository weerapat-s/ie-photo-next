"use client";
// components/panels/forms-panel.tsx — สร้าง/แก้ไขฟอร์ม แล้วแชร์เป็นลิงก์
// (เดิมเป็นหน้า /form-builder — ย้ายมาเป็นแท็บใน /settings)
import { useState } from "react";
import {
  collection,
  query,
  orderBy,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection } from "@/lib/hooks";
import {
  Card,
  Badge,
  Spinner,
  Button,
  Modal,
  Field,
  inputClass,
  EmptyState,
  Alert,
  Switch,
  CopyLink,
  useToast,
} from "@/components/ui";
import Icon from "@/components/icon";
import { FieldRenderer } from "@/components/form-renderer";
import {
  FIELD_TYPE_LABEL,
  FIELD_TYPE_ICON,
  HAS_OPTIONS,
  IS_DISPLAY_ONLY,
  blankField,
  newFieldId,
  sanitizeFields,
  formUrl,
} from "@/lib/forms";
import { fmtDateTime } from "@/lib/format";
import { describeWriteError } from "@/lib/errors";
import type { FieldType, FormBinding, FormDoc, FormField, WithId } from "@/lib/types";

const BINDING_LABEL: Record<FormBinding, string> = {
  none: "ฟอร์มอิสระ (แชร์ลิงก์)",
  equipment: "แนบตอนยืมอุปกรณ์",
  studio: "แนบตอนจองสตูดิโอ",
  photographer: "แนบตอนจองตากล้อง",
};

export default function FormsPanel() {
  const { user } = useAuth();
  const { show, node: toastNode } = useToast();
  const { data: forms, loading } = useCollection<FormDoc>(
    () => query(collection(db, "forms"), orderBy("createdAt", "desc")),
    []
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");

  const editing = forms.find((f) => f.id === editingId) ?? null;

  async function createForm() {
    if (!user) return;
    setCreating(true);
    setErr("");
    try {
      const ref = await addDoc(collection(db, "forms"), {
        title: "ฟอร์มใหม่",
        description: "",
        fields: sanitizeFields([blankField("text")]),
        binding: "none",
        active: false,
        allowGuest: true,
        successMessage: "ขอบคุณที่กรอกฟอร์ม ทีมงานได้รับข้อมูลแล้ว",
        createdById: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: null,
        responseCount: 0,
      });
      setEditingId(ref.id);
    } catch (e) {
      setErr(describeWriteError(e, "สร้างฟอร์ม"));
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(f: WithId<FormDoc>) {
    try {
      await updateDoc(doc(db, "forms", f.id), { active: !f.active, updatedAt: serverTimestamp() });
    } catch {
      setErr("เปลี่ยนสถานะไม่สำเร็จ");
    }
  }

  async function removeForm(f: WithId<FormDoc>) {
    if (!confirm(`ลบฟอร์ม "${f.title}"?\nคำตอบที่เคยส่งจะยังอยู่ในหน้าคำตอบ`)) return;
    try {
      await deleteDoc(doc(db, "forms", f.id));
      show("ลบฟอร์มแล้ว");
    } catch {
      setErr("ลบไม่สำเร็จ");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="t-body text-[var(--muted-ink)]">
          <b className="t-num text-[var(--ink)]">{forms.length}</b> ฟอร์ม · เปิดรับคำตอบ{" "}
          <b className="t-num text-[var(--ink)]">{forms.filter((f) => f.active).length}</b>
        </p>
        <Button onClick={createForm} loading={creating} icon="add">
          ฟอร์มใหม่
        </Button>
      </div>

      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      {loading ? (
        <Spinner />
      ) : forms.length === 0 ? (
        <EmptyState
          icon="form"
          text="ยังไม่มีฟอร์ม"
          action={<Button onClick={createForm}>สร้างฟอร์มแรก</Button>}
        />
      ) : (
        <div className="stagger space-y-3">
          {forms.map((f, i) => (
            <Card key={f.id} style={{ ["--i" as string]: i }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-[var(--ink)]">{f.title}</h3>
                    <Badge
                      className={
                        f.active
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : "bg-neutral-100 text-neutral-600 border border-neutral-200"
                      }
                    >
                      {f.active ? "เปิดรับคำตอบ" : "ปิดอยู่"}
                    </Badge>
                    {f.allowGuest && (
                      <Badge className="bg-sky-100 text-sky-800 border border-sky-200">คนนอกกรอกได้</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted-ink)]">
                    {BINDING_LABEL[f.binding]} · {f.fields.length} คำถาม · {f.responseCount ?? 0} คำตอบ ·{" "}
                    {fmtDateTime(f.createdAt)}
                  </p>
                </div>
                <Switch checked={f.active} onChange={() => toggleActive(f)} label={`เปิดฟอร์ม ${f.title}`} />
              </div>

              {f.active && (
                <div className="mt-3">
                  <CopyLink url={formUrl(f.id)} />
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2 border-t border-black/6 pt-3">
                <Button size="sm" variant="outline" onClick={() => setEditingId(f.id)}>
                  แก้ไข
                </Button>
                <Button size="sm" variant="outline" onClick={() => window.open(formUrl(f.id), "_blank")}>
                  ดูฟอร์ม
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeForm(f)} className="ml-auto text-red-600">
                  
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <FormEditor
          key={editing.id}
          form={editing}
          onClose={() => setEditingId(null)}
          onSaved={() => show("บันทึกฟอร์มแล้ว")}
        />
      )}

      {toastNode}
    </div>
  );
}

/* ═══ ตัวแก้ไขฟอร์ม ═══════════════════════════════════════════ */
function FormEditor({
  form,
  onClose,
  onSaved,
}: {
  form: WithId<FormDoc>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(form.title);
  const [description, setDescription] = useState(form.description);
  const [binding, setBinding] = useState<FormBinding>(form.binding);
  const [allowGuest, setAllowGuest] = useState(form.allowGuest);
  const [successMessage, setSuccessMessage] = useState(form.successMessage);
  const [fields, setFields] = useState<FormField[]>(form.fields);
  const [openField, setOpenField] = useState<string | null>(null);
  const [tab, setTab] = useState<"build" | "preview" | "settings">("build");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function updateField(id: string, patch: Partial<FormField>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function addField(type: FieldType) {
    const f = blankField(type);
    setFields((prev) => [...prev, f]);
    setOpenField(f.id);
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }

  function move(id: string, dir: -1 | 1) {
    setFields((prev) => {
      const i = prev.findIndex((f) => f.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function duplicate(id: string) {
    setFields((prev) => {
      const i = prev.findIndex((f) => f.id === id);
      if (i < 0) return prev;
      const src = prev[i];
      const copy: FormField = {
        ...src,
        id: newFieldId(),
        label: `${src.label} (สำเนา)`,
        options: src.options ? [...src.options] : [],
      };
      const next = [...prev];
      next.splice(i + 1, 0, copy);
      return next;
    });
  }

  async function save() {
    if (!title.trim()) return setErr("กรุณาตั้งชื่อฟอร์ม");
    if (fields.length === 0) return setErr("ฟอร์มต้องมีอย่างน้อย 1 คำถาม");
    const bad = fields.find((f) => !f.label.trim());
    if (bad) return setErr("ทุกคำถามต้องมีข้อความกำกับ");
    const badOptions = fields.find(
      (f) => HAS_OPTIONS.includes(f.type) && (!f.options || f.options.filter(Boolean).length < 1)
    );
    if (badOptions) return setErr(`"${badOptions.label}" ต้องมีอย่างน้อย 1 ตัวเลือก`);

    setBusy(true);
    setErr("");
    try {
      await updateDoc(doc(db, "forms", form.id), {
        title: title.trim(),
        description: description.trim(),
        binding,
        allowGuest,
        successMessage: successMessage.trim(),
        fields: sanitizeFields(fields),
        updatedAt: serverTimestamp(),
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(describeWriteError(e, "บันทึกฟอร์ม"));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="แก้ไขฟอร์ม" maxWidth="max-w-2xl">
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      <div className="mb-4 flex gap-1 rounded-full bg-black/5 p-1">
        {(
          [
            ["build", "คำถาม"],
            ["preview", "ตัวอย่าง"],
            ["settings", "ตั้งค่า"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
              tab === k ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--muted-ink)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "settings" && (
        <>
          <Field label="ชื่อฟอร์ม" required>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} maxLength={120} />
          </Field>
          <Field label="คำอธิบาย">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputClass} maxLength={800} />
          </Field>
          <Field label="ผูกกับ flow ไหน" help="ฟอร์มอิสระ = แชร์ลิงก์ให้กรอกได้เลย">
            <select value={binding} onChange={(e) => setBinding(e.target.value as FormBinding)} className={inputClass}>
              {(Object.keys(BINDING_LABEL) as FormBinding[]).map((b) => (
                <option key={b} value={b}>
                  {BINDING_LABEL[b]}
                </option>
              ))}
            </select>
          </Field>
          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-black/8 bg-white/60 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">ให้คนนอกกรอกได้</p>
              <p className="text-xs text-[var(--muted-ink)]">ปิด = ต้องเข้าสู่ระบบก่อน</p>
            </div>
            <Switch checked={allowGuest} onChange={setAllowGuest} label="ให้คนนอกกรอกได้" />
          </div>
          <Field label="ข้อความหลังส่งสำเร็จ">
            <input value={successMessage} onChange={(e) => setSuccessMessage(e.target.value)} className={inputClass} maxLength={200} />
          </Field>
        </>
      )}

      {tab === "preview" && (
        <div className="rounded-2xl bg-black/[0.03] p-3">
          <h3 className="mb-1 text-lg font-bold text-[var(--ink)]">{title || "ฟอร์มใหม่"}</h3>
          {description && <p className="mb-4 text-sm text-[var(--muted-ink)]">{description}</p>}
          <div className="rounded-2xl bg-white/70 p-4">
            {fields.map((f) => (
              <FieldRenderer key={f.id} field={f} value={f.type === "checkbox" ? [] : ""} onChange={() => {}} disabled />
            ))}
            <Button fullWidth disabled className="mt-2">
              ส่งฟอร์ม
            </Button>
          </div>
        </div>
      )}

      {tab === "build" && (
        <>
          <div className="space-y-2">
            {fields.map((f, i) => (
              <div key={f.id} className="rounded-2xl border border-black/8 bg-white/70">
                <div className="flex items-center gap-2 p-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-black/5 text-sm" aria-hidden>
                    {FIELD_TYPE_ICON[f.type]}
                  </span>
                  <button
                    onClick={() => setOpenField(openField === f.id ? null : f.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-semibold text-[var(--ink)]">
                      {f.label || "(ไม่มีชื่อ)"}
                      {f.required && <span className="text-[var(--faculty)]"> *</span>}
                    </span>
                    <span className="block text-xs text-[var(--muted-ink)]">{FIELD_TYPE_LABEL[f.type]}</span>
                  </button>
                  <div className="flex shrink-0 items-center">
                    <button onClick={() => move(f.id, -1)} disabled={i === 0} className="tap px-1 text-[var(--muted-ink)] disabled:opacity-25" aria-label="เลื่อนขึ้น">
                      ↑
                    </button>
                    <button onClick={() => move(f.id, 1)} disabled={i === fields.length - 1} className="tap px-1 text-[var(--muted-ink)] disabled:opacity-25" aria-label="เลื่อนลง">
                      ↓
                    </button>
                    <button onClick={() => setOpenField(openField === f.id ? null : f.id)} className="tap px-1 text-[var(--muted-ink)]" aria-label="แก้ไข">
                      <Icon name={openField === f.id ? "chevronDown" : "edit"} size={16} />
                    </button>
                  </div>
                </div>

                {openField === f.id && (
                  <div className="border-t border-black/6 p-3">
                    <Field label="ข้อความคำถาม" required>
                      <input value={f.label} onChange={(e) => updateField(f.id, { label: e.target.value })} className={inputClass} maxLength={140} />
                    </Field>

                    <Field label="ชนิดคำถาม">
                      <select
                        value={f.type}
                        onChange={(e) => {
                          const t = e.target.value as FieldType;
                          updateField(f.id, {
                            type: t,
                            options: HAS_OPTIONS.includes(t) ? (f.options?.length ? f.options : ["ตัวเลือก 1"]) : [],
                          });
                        }}
                        className={inputClass}
                      >
                        {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => (
                          <option key={t} value={t}>
                            {FIELD_TYPE_ICON[t]} {FIELD_TYPE_LABEL[t]}
                          </option>
                        ))}
                      </select>
                    </Field>

                    {HAS_OPTIONS.includes(f.type) && (
                      <Field label="ตัวเลือก (บรรทัดละ 1 ข้อ)" required>
                        <textarea
                          rows={4}
                          value={(f.options ?? []).join("\n")}
                          onChange={(e) => updateField(f.id, { options: e.target.value.split("\n") })}
                          className={inputClass}
                        />
                      </Field>
                    )}

                    {!IS_DISPLAY_ONLY.includes(f.type) && (
                      <>
                        <Field label="ข้อความตัวอย่างในช่อง">
                          <input value={f.placeholder ?? ""} onChange={(e) => updateField(f.id, { placeholder: e.target.value })} className={inputClass} maxLength={100} />
                        </Field>
                        {f.type === "number" && (
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="ค่าต่ำสุด">
                              <input type="number" value={f.min ?? ""} onChange={(e) => updateField(f.id, { min: e.target.value === "" ? undefined : Number(e.target.value) })} className={inputClass} />
                            </Field>
                            <Field label="ค่าสูงสุด">
                              <input type="number" value={f.max ?? ""} onChange={(e) => updateField(f.id, { max: e.target.value === "" ? undefined : Number(e.target.value) })} className={inputClass} />
                            </Field>
                          </div>
                        )}
                      </>
                    )}

                    <Field label="คำอธิบายใต้ช่อง">
                      <input value={f.help ?? ""} onChange={(e) => updateField(f.id, { help: e.target.value })} className={inputClass} maxLength={160} />
                    </Field>

                    {!IS_DISPLAY_ONLY.includes(f.type) && (
                      <label className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-black/[0.03] px-4 py-2.5">
                        <span className="text-sm font-semibold text-[var(--ink)]">บังคับกรอก</span>
                        <Switch checked={f.required} onChange={(v) => updateField(f.id, { required: v })} label="บังคับกรอก" />
                      </label>
                    )}

                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => duplicate(f.id)}>
                        ทำสำเนา
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeField(f.id)} className="ml-auto text-red-600">
                        ลบคำถาม
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">
              เพิ่มคำถาม
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => addField(t)}
                  className="press glass-thin rounded-full px-3 py-1.5 text-xs font-medium text-[var(--ink)]"
                >
                  {FIELD_TYPE_ICON[t]} {FIELD_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="mt-5 flex gap-2 border-t border-black/8 pt-4">
        <Button variant="outline" onClick={onClose} className="flex-1">
          ยกเลิก
        </Button>
        <Button onClick={save} loading={busy} className="flex-1">
          บันทึกฟอร์ม
        </Button>
      </div>
    </Modal>
  );
}
