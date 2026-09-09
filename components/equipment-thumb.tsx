"use client";
// components/equipment-thumb.tsx — รูปอุปกรณ์ + รูปแทนตามประเภทเมื่อยังไม่ใส่รูป
//
// ถ้ามี imageUrl (รูปจริงที่กรรมการอัป) ก็โชว์รูปนั้น
// ถ้ายังไม่มี โชว์ไอคอนตามประเภทบนพื้นสีเฉพาะ — ดูออกทันทีว่าเป็นกล้อง/เลนส์/เมม/อื่น ๆ
// โดยไม่ต้องพึ่งรูปจากภายนอก (โหลดชัวร์ ใช้ได้ออฟไลน์)
import Icon, { type IconName } from "@/components/icon";
import type { EquipmentType } from "@/lib/types";

/** ไอคอน + โทนสีของรูปแทน แยกตามประเภท */
const FALLBACK: Record<EquipmentType, { icon: IconName; from: string; to: string; fg: string }> = {
  camera: { icon: "equipment", from: "#fde4ea", to: "#fbb6c7", fg: "#b3244b" },
  lens: { icon: "search", from: "#e5e9ff", to: "#b9c4ff", fg: "#3b46b3" },
  memory: { icon: "inventory", from: "#e2f6ec", to: "#a9e3c4", fg: "#1f7a4d" },
  accessory: { icon: "inventory", from: "#f1ecff", to: "#cdbdf5", fg: "#6d4fb0" },
  key: { icon: "settings", from: "#fff1dc", to: "#f8d29a", fg: "#8a5a12" },
};

const SIZES = { sm: "h-12 w-12 rounded-xl", md: "h-16 w-16 rounded-2xl", lg: "h-24 w-24 rounded-2xl" };
const ICON = { sm: 20, md: 28, lg: 32 } as const;

export default function EquipmentThumb({
  type,
  imageUrl,
  name,
  size = "md",
  className = "",
}: {
  type: EquipmentType;
  imageUrl?: string | null;
  name?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = `${SIZES[size]} shrink-0 overflow-hidden ${className}`;
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt={name ?? ""} className={`${box} object-cover`} />;
  }
  const f = FALLBACK[type] ?? FALLBACK.accessory;
  return (
    <span
      className={`${box} grid place-items-center`}
      style={{ background: `linear-gradient(140deg, ${f.from}, ${f.to})`, color: f.fg }}
      aria-hidden
    >
      <Icon name={f.icon} size={ICON[size]} strokeWidth={2} />
    </span>
  );
}
