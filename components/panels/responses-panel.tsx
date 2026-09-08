"use client";
// components/panels/responses-panel.tsx — ดูคำตอบฟอร์ม + ดาวน์โหลด CSV
// (เดิมเป็นหน้า /responses — ย้ายมาเป็นแท็บใน /settings)
import { useMemo, useState } from "react";
import { collection, query, orderBy, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useCollection } from "@/lib/hooks";
import {
  Card,
  Badge,
  Spinner,
  Button,
  Modal,
  EmptyState,
  Alert,
  ChipBar,
  Row,
  useToast,
} from "@/components/ui";
import { displayValue, toCsv } from "@/lib/forms";
import { fmtDateTime } from "@/lib/format";
import type { FormDoc, FormResponseDoc, WithId } from "@/lib/types";

export default function ResponsesPanel() {
  const { show, node: toastNode } = useToast();
  const { data: forms } = useCollection<FormDoc>(() => query(collection(db, "forms"), orderBy("createdAt", "desc")), []);
  const { data: responses, loading } = useCollection<FormResponseDoc>(
    () => query(collection(db, "formResponses"), orderBy("createdAt", "desc")),
    []
  );

  const [formFilter, setFormFilter] = useState<string>("all");
  const [viewing, setViewing] = useState<WithId<FormResponseDoc> | null>(null);
  const [err, setErr] = useState("");

  const shown = formFilter === "all" ? responses : responses.filter((r) => r.formId === formFilter);

  const chips = useMemo(
    () => [
      { key: "all", label: "ทั้งหมด", count: responses.length },
      ...forms.map((f) => ({
        key: f.id,
        label: f.title,
        count: responses.filter((r) => r.formId === f.id).length,
      })),
    ],
    [forms, responses]
  );

  function downloadCsv() {
    if (shown.length === 0) return;
    // รวมคีย์ทุกคำตอบ — ฟอร์มอาจถูกแก้ระหว่างทาง คำตอบเก่าจึงมีคีย์ไม่เท่ากัน
    const form = forms.find((f) => f.id === formFilter);
    const keys = form
      ? form.fields.filter((f) => f.type !== "heading").map((f) => f.id)
      : Array.from(new Set(shown.flatMap((r) => Object.keys(r.values))));
    const labelOf = (k: string) => form?.fields.find((f) => f.id === k)?.label ?? k;

    const header = ["วันเวลา", "ฟอร์ม", "ผู้ส่ง", "ติดต่อ", ...keys.map(labelOf)];
    const rows = shown.map((r) => [
      fmtDateTime(r.createdAt),
      r.formTitle,
      r.submitterName,
      r.submitterContact,
      ...keys.map((k) => displayValue(r.values[k] ?? null)),
    ]);

    // BOM ให้ Excel ภาษาไทยไม่เพี้ยน
    const blob = new Blob(["﻿" + toCsv([header, ...rows])], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form?.title ?? "form-responses"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    show("ดาวน์โหลด CSV แล้ว");
  }

  async function remove(r: WithId<FormResponseDoc>) {
    if (!confirm("ลบคำตอบนี้ถาวร?")) return;
    try {
      await deleteDoc(doc(db, "formResponses", r.id));
      setViewing(null);
      show("ลบคำตอบแล้ว");
    } catch {
      setErr("ลบไม่สำเร็จ");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="t-body text-[var(--muted-ink)]">
          <b className="t-num text-[var(--ink)]">{responses.length}</b> คำตอบทั้งหมด
        </p>
        <Button variant="outline" onClick={downloadCsv} disabled={shown.length === 0} icon="download">
          ดาวน์โหลด CSV
        </Button>
      </div>

      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      <ChipBar className="mb-4" value={formFilter} onChange={setFormFilter} options={chips} />

      {loading ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState icon="responses" text="ยังไม่มีคำตอบในหมวดนี้" />
      ) : (
        <div className="stagger space-y-2.5">
          {shown.map((r, i) => (
            <Card
              key={r.id}
              className="press cursor-pointer p-4"
              style={{ ["--i" as string]: Math.min(i, 12) }}
              onClick={() => setViewing(r)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[var(--ink)]">{r.submitterName || "ไม่ระบุชื่อ"}</p>
                  <p className="truncate text-xs text-[var(--muted-ink)]">
                    {r.formTitle} · {fmtDateTime(r.createdAt)}
                  </p>
                  <p className="truncate text-xs text-[var(--muted-ink)]">{r.submitterContact}</p>
                </div>
                {!r.userId && (
                  <Badge className="bg-amber-100 text-amber-800 border border-amber-200">คนนอก</Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={viewing.formTitle} maxWidth="max-w-xl">
          <div className="mb-4 rounded-2xl bg-black/[0.03] p-3">
            <Row label="ผู้ส่ง">{viewing.submitterName || "—"}</Row>
            <Row label="ติดต่อ">{viewing.submitterContact || "—"}</Row>
            <Row label="ส่งเมื่อ">{fmtDateTime(viewing.createdAt)}</Row>
          </div>

          <div className="space-y-3">
            {Object.entries(viewing.values).map(([k, v]) => {
              const form = forms.find((f) => f.id === viewing.formId);
              const label = form?.fields.find((f) => f.id === k)?.label ?? k;
              const isImage = typeof v === "string" && v.startsWith("data:image/");
              return (
                <div key={k}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">{label}</p>
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v as string} alt={label} className="mt-1 max-h-64 w-full rounded-2xl border border-black/8 object-contain" />
                  ) : (
                    <p className="mt-0.5 whitespace-pre-line text-sm text-[var(--ink)]">{displayValue(v)}</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex gap-2 border-t border-black/8 pt-4">
            <Button variant="outline" onClick={() => setViewing(null)} className="flex-1">
              ปิด
            </Button>
            <Button variant="ghost" onClick={() => remove(viewing)} className="text-red-600">
              ลบคำตอบ
            </Button>
          </div>
        </Modal>
      )}

      {toastNode}
    </div>
  );
}
