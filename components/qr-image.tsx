"use client";
// components/qr-image.tsx — วาด QR เป็นรูปจากข้อความ (ใช้ทั้งบนจอและตอนพิมพ์)
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QrImage({
  value,
  size = 180,
  className = "",
  alt = "QR",
}: {
  value: string;
  size?: number;
  className?: string;
  alt?: string;
}) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: size * 2, // วาดใหญ่กว่าที่แสดง 2 เท่า ให้คมทั้งบนจอ retina และตอนพิมพ์
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc("");
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!src) {
    return (
      <div
        className={`animate-pulse rounded-lg bg-muted ${className}`}
        style={{ width: size, height: size }}
        aria-label="กำลังสร้าง QR"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={size} height={size} className={className} />
  );
}
