"use client";
// app/form/page.tsx — หน้าเปิดฟอร์มสาธารณะ /form/?id=<formId>
// ใช้ query param แทน dynamic route เพราะ static export ต้องรู้ id ล่วงหน้า
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { doc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { useDocument } from "@/lib/hooks";
import { Spinner, EmptyState, LinkButton } from "@/components/ui";
import PublicShell from "@/components/public-shell";
import FormRenderer from "@/components/form-renderer";
import type { FormDoc } from "@/lib/types";

export default function PublicFormPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <FormPageInner />
    </Suspense>
  );
}

function FormPageInner() {
  const params = useSearchParams();
  const id = params.get("id");
  const { user, profile } = useAuth();

  const { data: form, loading } = useDocument<FormDoc>(
    () => (id ? doc(db, "forms", id) : null),
    [id]
  );

  const identity = user
    ? {
        uid: user.uid,
        name: `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() || user.email || "",
        contact: profile?.phone || user.email || "",
      }
    : null;

  return (
    <PublicShell maxWidth="max-w-2xl">
      {!id ? (
        <EmptyState icon="link" text="ลิงก์ไม่ถูกต้อง — ไม่พบรหัสฟอร์ม" action={<LinkButton href="/">กลับหน้าแรก</LinkButton>} />
      ) : loading ? (
        <Spinner label="กำลังโหลดฟอร์ม…" />
      ) : !form ? (
        <EmptyState icon="empty" text="ไม่พบฟอร์มนี้ อาจถูกลบไปแล้ว" action={<LinkButton href="/">กลับหน้าแรก</LinkButton>} />
      ) : !form.active ? (
        <EmptyState icon="ban" text="ฟอร์มนี้ปิดรับคำตอบแล้ว" />
      ) : !form.allowGuest && !user ? (
        <EmptyState
          icon="user"
          text="ฟอร์มนี้เปิดให้เฉพาะสมาชิกที่เข้าสู่ระบบ"
          action={<LinkButton href="/login">เข้าสู่ระบบ</LinkButton>}
        />
      ) : (
        <>
          <div className="animate-in mb-5">
            <h1 className="text-2xl font-bold leading-tight text-[var(--ink)] sm:text-3xl">{form.title}</h1>
            {form.description && (
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[var(--muted-ink)]">
                {form.description}
              </p>
            )}
          </div>
          <FormRenderer form={form} user={identity} />
        </>
      )}
    </PublicShell>
  );
}
