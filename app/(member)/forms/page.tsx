"use client";
// app/(member)/forms/page.tsx — ฟอร์มที่เปิดให้กรอก
// ไม่อยู่ในเมนูหลักแล้ว (เข้าจากทางลัดในหน้าแรก หรือลิงก์ที่แชร์มา)
// เพราะสมาชิกส่วนใหญ่เข้ามาผ่านลิงก์ตรง ไม่ได้ไล่หาจากเมนู
import { useState } from "react";
import { collection, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection } from "@/lib/hooks";
import { PageHeader, Spinner, Button, Modal, EmptyState, Badge } from "@/components/ui";
import FormRenderer from "@/components/form-renderer";
import type { FormDoc, WithId } from "@/lib/types";

export default function FormsPage() {
  const { user, profile } = useAuth();
  const { data: forms, loading, error } = useCollection<FormDoc>(
    () => query(collection(db, "forms"), where("active", "==", true), orderBy("createdAt", "desc")),
    []
  );
  const [filling, setFilling] = useState<WithId<FormDoc> | null>(null);

  const identity = user
    ? {
        uid: user.uid,
        name: `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() || user.email || "",
        contact: profile?.phone || user.email || "",
      }
    : null;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="ฟอร์ม" title="ฟอร์มที่เปิดให้กรอก" subtitle="แบบฟอร์มของชุมนุมที่ยังเปิดรับคำตอบ" />

      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState icon="warning" text="โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้า" />
      ) : forms.length === 0 ? (
        <EmptyState icon="form" text="ยังไม่มีฟอร์มที่เปิดรับคำตอบ" />
      ) : (
        /* รายการแบบแถว — ฟอร์มมีข้อมูลน้อย ไม่ต้องใช้การ์ดใบใหญ่ */
        <ul className="surface-flat divide-y divide-[var(--hairline)] overflow-hidden rounded-3xl">
          {forms.map((f) => (
            <li key={f.id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <h3 className="t-heading text-[var(--ink)]">{f.title}</h3>
                {f.description && (
                  <p className="t-body line-clamp-2 whitespace-pre-line text-[var(--muted-ink)]">{f.description}</p>
                )}
              </div>
              <Badge className="tone-brand">{f.fields.filter((x) => x.type !== "heading").length} ข้อ</Badge>
              <Button size="sm" onClick={() => setFilling(f)} iconEnd="next">
                กรอก
              </Button>
            </li>
          ))}
        </ul>
      )}

      {filling && (
        <Modal open onClose={() => setFilling(null)} title={filling.title} maxWidth="max-w-xl">
          <FormRenderer form={filling} user={identity} bare />
        </Modal>
      )}
    </div>
  );
}
