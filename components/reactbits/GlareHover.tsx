"use client";
// components/reactbits/GlareHover.tsx — แสงกวาดผ่านตอน hover (ดัดแปลงจาก React Bits)
// ต่างจากต้นฉบับ: ขนาด/พื้นหลัง/ขอบเป็น opt-in ทั้งหมด
// ต้นฉบับบังคับ 500×500 + พื้นดำ + เส้นขอบ ทำให้ทับสไตล์ของการ์ดที่ครอบอยู่
// (เช่น .glass-card / .liquid-glass-dark จะโดนพื้นโปร่งของมันทับจนตัวอักษรอ่านไม่ออก)
import "./GlareHover.css";

interface GlareHoverProps {
  width?: string;
  height?: string;
  /** ใส่เมื่ออยากให้คอมโพเนนต์นี้เป็นคนวาดพื้นหลังเอง — ปกติปล่อยให้ className จัดการ */
  background?: string;
  borderRadius?: string;
  borderColor?: string;
  children?: React.ReactNode;
  glareColor?: string;
  glareOpacity?: number;
  glareAngle?: number;
  glareSize?: number;
  transitionDuration?: number;
  playOnce?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function GlareHover({
  width,
  height,
  background,
  borderRadius,
  borderColor,
  children,
  glareColor = "#ffffff",
  glareOpacity = 0.55,
  glareAngle = -32,
  glareSize = 260,
  transitionDuration = 720,
  playOnce = false,
  className = "",
  style = {},
}: GlareHoverProps) {
  const hex = glareColor.replace("#", "");
  let rgba = glareColor;
  if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    rgba = `rgba(${r}, ${g}, ${b}, ${glareOpacity})`;
  } else if (/^[0-9A-Fa-f]{3}$/.test(hex)) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    rgba = `rgba(${r}, ${g}, ${b}, ${glareOpacity})`;
  }

  const vars: React.CSSProperties = {
    "--gh-angle": `${glareAngle}deg`,
    "--gh-duration": `${transitionDuration}ms`,
    "--gh-size": `${glareSize}%`,
    "--gh-rgba": rgba,
  } as React.CSSProperties;

  // ตั้งค่าเฉพาะที่ผู้เรียกส่งมาจริง — ไม่งั้นจะทับสไตล์ของ className
  if (width) vars.width = width;
  if (height) vars.height = height;
  if (background) vars.background = background;
  if (borderRadius) vars.borderRadius = borderRadius;
  if (borderColor) vars.border = `1px solid ${borderColor}`;

  return (
    <div
      className={`glare-hover ${playOnce ? "glare-hover--play-once" : ""} ${className}`}
      style={{ ...vars, ...style }}
    >
      {children}
    </div>
  );
}
