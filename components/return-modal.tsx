"use client";
// components/return-modal.tsx — กล่องคืนอุปกรณ์ (ใช้ร่วมทั้งหน้าสมาชิกและหน้ากรรมการ)
//
// รับหลักฐานได้ 2 ทาง: ถ่ายรูปตรงนั้น หรือวางลิงก์รูปที่อัปขึ้นที่เก็บกลางไว้แล้ว
// (รูปจากกล้องมือถือมักใหญ่เกินขนาดที่ Firestore รับ จึงต้องมีทางเลือกที่สอง)
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { describeWriteError } from "@/lib/errors";
import { compressImageToDataUrl } from "@/lib/image";
import { Modal, Alert, Button, ImagePicker } from "@/components/ui";
import Icon from "@/components/icon";
import type { BookingDoc, WithId } from "@/lib/types";

export default function ReturnModal({
  booking,
  uploadLink,
  onDone,
  onClose,
}: {
  booking: WithId<BookingDoc>;
  uploadLink: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const ready = !!file || link.trim().startsWith("http");

  async function submit() {
    if (!ready) return setErr("แนบรูปหรือวางลิงก์รูปอย่างใดอย่างหนึ่ง");
    setBusy(true);
    setErr("");
    try {
      const returnImageUrl = file ? await compressImageToDataUrl(file, 1000, 0.75) : link.trim();
      await updateDoc(doc(db, "bookings", booking.id), { status: "pending_return", returnImageUrl });
      onDone();
    } catch (e) {
      setErr(
        e instanceof Error && e.message === "IMAGE_TOO_LARGE"
          ? "รูปใหญ่เกินไป — อัปขึ้นที่เก็บกลางแล้ววางลิงก์แทน"
          : describeWriteError(e, "คืนอุปกรณ์")
      );
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`คืน ${booking.itemName}`}>
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}
      <p className="t-caption mb-3">
        ถ่ายรูปสภาพอุปกรณ์เป็นหลักฐานก่อนยืนยัน กรรมการจะตรวจแล้วปิดรายการให้
      </p>

      <ImagePicker
        file={file}
        preview={preview}
        onPick={(f) => {
          setFile(f);
          setPreview(f ? URL.createObjectURL(f) : null);
        }}
        hint="ถ่ายให้เห็นสภาพอุปกรณ์ชัดเจน"
      />

      <div className="surface-sunken mt-3 rounded-2xl p-3">
        <p className="t-caption mb-2">รูปใหญ่เกินไป? อัปขึ้นที่เก็บไฟล์กลางแล้ววางลิงก์แทนได้</p>
        <a
          href={uploadLink}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-glass press mb-2 inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold"
        >
          <Icon name="upload" size={16} /> เปิดที่อัปโหลดกลาง
        </a>
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="วางลิงก์รูปที่อัปแล้ว"
          className="w-full rounded-xl border border-[var(--hairline-strong)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--faculty)]"
          maxLength={500}
        />
      </div>

      <Button onClick={submit} disabled={!ready} loading={busy} fullWidth size="lg" className="mt-4">
        ยืนยันการคืน
      </Button>
    </Modal>
  );
}
