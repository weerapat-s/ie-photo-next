"use client";
// components/qr-scanner.tsx — สแกน QR ด้วยกล้องมือถือ (ใช้ร่วมกันทั้งหน้ายืมและหน้าสถานี)
//
// ข้อจำกัดที่ผู้ใช้ต้องรู้ (แสดงเป็นข้อความในตัว component):
//   - ต้องเป็น HTTPS (production เป็นอยู่แล้ว)
//   - เปิดใน in-app browser ของ Line/Facebook กล้องจะไม่ทำงาน ต้องเปิดใน Safari/Chrome
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

const REGION_ID = "qr-scanner-region";

export default function QrScanner({
  onScan,
  onClose,
  hint,
}: {
  /** คืนค่าดิบที่สแกนได้ — ผู้เรียกเอาไป parseScan() เอง */
  onScan: (raw: string) => void;
  onClose: () => void;
  hint?: string;
}) {
  const [err, setErr] = useState("");
  const [starting, setStarting] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  // กันยิงซ้ำรัวๆ จาก frame เดียวกัน — จำค่าล่าสุด + เวลา
  const lastRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(REGION_ID, { verbose: false });
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" }, // กล้องหลัง
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          const now = Date.now();
          // ตัวเดิมภายใน 1.5 วิ = ถือค้างอยู่ ไม่นับซ้ำ
          if (decoded === lastRef.current.value && now - lastRef.current.at < 1500) return;
          lastRef.current = { value: decoded, at: now };
          if (navigator.vibrate) navigator.vibrate(60);
          onScanRef.current(decoded);
        },
        () => {
          // callback ตอนอ่านไม่ออกในแต่ละเฟรม — เงียบไว้ ไม่งั้น log ท่วม
        }
      )
      .then(() => {
        if (!cancelled) setStarting(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStarting(false);
        const msg = e instanceof Error ? e.message : String(e);
        if (/NotAllowedError|Permission/i.test(msg)) {
          setErr("ไม่ได้รับอนุญาตให้ใช้กล้อง — กดอนุญาตกล้องในเบราว์เซอร์แล้วลองใหม่");
        } else if (/NotFoundError|no camera/i.test(msg)) {
          setErr("ไม่พบกล้องบนอุปกรณ์นี้");
        } else {
          setErr("เปิดกล้องไม่สำเร็จ — ถ้าเปิดจากแอป Line/Facebook ให้เปิดใน Safari หรือ Chrome แทน");
        }
      });

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (!s) return;
      s.stop()
        .then(() => s.clear())
        .catch(() => {
          /* ปิดไม่สำเร็จก็ไม่เป็นไร component ถูก unmount แล้ว */
        });
    };
  }, []);

  return (
    <div className="rounded-3xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">📷 เล็ง QR ให้อยู่ในกรอบ</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          ปิดกล้อง
        </button>
      </div>

      <div id={REGION_ID} className="overflow-hidden rounded-2xl bg-black/80 [&_video]:w-full" />

      {starting && <p className="mt-3 text-center text-sm text-muted-foreground">กำลังเปิดกล้อง…</p>}
      {hint && !err && <p className="mt-3 text-center text-xs text-muted-foreground">{hint}</p>}
      {err && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          ⚠️ {err}
        </p>
      )}
    </div>
  );
}
