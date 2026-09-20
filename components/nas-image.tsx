"use client";
// components/nas-image.tsx — แสดงรูปหลักฐานการยืม ไม่ว่าจะเก็บแบบเก่าหรือแบบใหม่
//
// booking รุ่นเก่าเก็บรูปเป็น data: URL ฝังในเอกสาร ส่วนรุ่นใหม่เก็บแค่ path บน NAS
// ทั้งสองแบบใช้ฟิลด์เดียวกัน (formImageUrl / returnImageUrl) เพื่อไม่ต้องย้ายข้อมูลเก่า
// useNasSrc เป็นตัวแยกให้เองว่าต้องดึงผ่าน Worker หรือใช้ค่าตรง ๆ
import { useNasSrc } from "@/lib/nas";

export default function NasImage({
  value,
  alt,
  className = "",
  /** ลิงก์ "เปิดแท็บใหม่" ใต้รูป — หน้าที่แสดงในโมดัลใช้, การ์ดเล็ก ๆ ไม่ต้อง */
  openLink,
}: {
  value: string | null | undefined;
  alt: string;
  className?: string;
  openLink?: { label: string; className?: string };
}) {
  const { src, error, loading } = useNasSrc(value);

  if (loading) {
    return (
      <div
        className={`flex min-h-40 items-center justify-center rounded-2xl border border-border bg-muted/40 ${className}`}
      >
        <p className="text-sm text-muted-foreground">กำลังโหลดรูปจาก NAS…</p>
      </div>
    );
  }

  if (error || !src) {
    return (
      <div
        className={`flex min-h-40 items-center justify-center rounded-2xl border border-red-200 bg-red-50 p-4 ${className}`}
        role="alert"
      >
        <p className="text-center text-sm text-red-700">{error || "ไม่มีรูป"}</p>
      </div>
    );
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={className} />
      {openLink && (
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className={openLink.className || "mt-3 block text-center text-sm font-medium text-primary hover:underline"}
        >
          {openLink.label}
        </a>
      )}
    </>
  );
}
