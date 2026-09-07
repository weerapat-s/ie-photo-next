"use client";
// components/member-qr-card.tsx — QR ประจำตัวสมาชิก (โชว์ที่เคาน์เตอร์ตอนรับ/คืนของ)
//
// ความปลอดภัย: memberCode เป็นรหัสสุ่ม ไม่ใช่รหัสนักศึกษา (คนอื่นเดา/ปั๊ม QR ปลอมไม่ได้)
// ตั้งได้ครั้งเดียวจากฝั่งเจ้าของ — จะแก้เองภายหลังไม่ได้ (บังคับที่ firestore.rules)
// ถ้าทำหลุด/โดนถ่ายรูปไป ต้องให้แอดมินออกรหัสใหม่ให้
import { useEffect, useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import QrImage from "@/components/qr-image";
import { generateMemberCode, memberQrPayload } from "@/lib/qr";

export default function MemberQrCard() {
  const { user, profile } = useAuth();
  const [err, setErr] = useState("");
  // กันสร้างรหัสซ้ำจาก re-render หลายรอบ
  const issuingRef = useRef(false);

  const memberCode = profile?.memberCode || "";

  // ยังไม่มีรหัส → ออกให้อัตโนมัติครั้งแรกที่เปิดหน้านี้
  useEffect(() => {
    if (!user || !profile || memberCode || issuingRef.current) return;
    issuingRef.current = true;
    updateDoc(doc(db, "users", user.uid), { memberCode: generateMemberCode() }).catch(() => {
      setErr("ออกรหัสประจำตัวไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง");
      issuingRef.current = false;
    });
  }, [user, profile, memberCode]);

  const fullName = `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim();

  return (
    <div className="glass-card rounded-3xl p-5">
      <h3 className="font-medium text-foreground">🪪 QR ประจำตัว</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">
        โชว์ QR นี้ที่เคาน์เตอร์ตอนรับของและตอนคืนของ
      </p>

      {err && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          ⚠️ {err}
        </p>
      )}

      {memberCode ? (
        <div className="mt-4 flex flex-col items-center gap-2">
          <div className="rounded-2xl bg-white p-3">
            <QrImage value={memberQrPayload(memberCode)} size={200} alt="QR ประจำตัวสมาชิก" />
          </div>
          <p className="text-sm font-semibold text-foreground">{fullName || profile?.studentId}</p>
          <p className="font-mono text-xs tracking-widest text-muted-foreground">{memberCode}</p>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            อย่าให้คนอื่นถ่ายรูป QR นี้ไป — ถ้าหลุด แจ้งแอดมินออกรหัสใหม่ให้
          </p>
        </div>
      ) : (
        <p className="mt-4 text-center text-sm text-muted-foreground">กำลังออกรหัสประจำตัว…</p>
      )}
    </div>
  );
}
