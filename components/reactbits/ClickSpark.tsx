"use client";
// components/reactbits/ClickSpark.tsx — ประกายตอนแตะ/คลิก (ดัดแปลงจาก React Bits)
// canvas ใบเดียว position:fixed คลุมจอ — ขนาดภาพวัดจากขนาดที่แสดงจริง และพิกัดเทียบขอบ canvas
// (ต้นฉบับวัดจากขนาด parent ซึ่งสูงตามเนื้อหา ทำให้ประกายเหลื่อมเมื่อหน้ายาว)
import { useRef, useEffect, useCallback } from "react";

interface ClickSparkProps {
  sparkColor?: string;
  sparkSize?: number;
  sparkRadius?: number;
  sparkCount?: number;
  duration?: number;
  easing?: "linear" | "ease-in" | "ease-in-out" | "ease-out";
  extraScale?: number;
  children?: React.ReactNode;
}

interface Spark {
  x: number;
  y: number;
  angle: number;
  startTime: number;
}

export default function ClickSpark({
  sparkColor = "#ef3961",
  sparkSize = 11,
  sparkRadius = 17,
  sparkCount = 8,
  duration = 420,
  easing = "ease-out",
  extraScale = 1.0,
  children,
}: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sparksRef = useRef<Spark[]>([]);

  // ขนาดภาพใน canvas ต้องเท่าขนาดที่ canvas "แสดงจริง" บนจอเป๊ะ
  //
  // บั๊กเดิม (มือถือ): CSS ตั้ง height:100vh แต่ภาพตั้งตาม window.innerHeight
  // บน Chrome มือถือตอนแถบที่อยู่เว็บโผล่ 100vh สูงกว่า innerHeight → ภาพถูกยืดแนวตั้ง
  // ประกายจึงเลื่อนต่ำกว่านิ้ว ยิ่งแตะใกล้ล่างจอยิ่งเพี้ยน
  // แก้: วัดขนาดจริงของ canvas เอง (ResizeObserver จับตอนแถบที่อยู่โผล่/หุบด้วย)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener("resize", resize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  const easeFunc = useCallback(
    (t: number) => {
      switch (easing) {
        case "linear":
          return t;
        case "ease-in":
          return t * t;
        case "ease-in-out":
          return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        default:
          return t * (2 - t);
      }
    },
    [easing]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId = 0;
    const draw = (timestamp: number) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.restore();

      sparksRef.current = sparksRef.current.filter((spark) => {
        const elapsed = timestamp - spark.startTime;
        if (elapsed >= duration) return false;

        const eased = easeFunc(elapsed / duration);
        const distance = eased * sparkRadius * extraScale;
        const lineLength = sparkSize * (1 - eased);

        const x1 = spark.x + distance * Math.cos(spark.angle);
        const y1 = spark.y + distance * Math.sin(spark.angle);
        const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle);
        const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle);

        ctx.strokeStyle = sparkColor;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.globalAlpha = 1 - eased;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        return true;
      });

      animationId = requestAnimationFrame(draw);
    };

    animationId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationId);
  }, [sparkColor, sparkSize, sparkRadius, sparkCount, duration, easeFunc, extraScale]);

  // ฟังที่ document — ครอบคลุมทุกจุดรวมทั้งเนื้อหาใน portal/modal
  useEffect(() => {
    const onPointerUp = (e: PointerEvent) => {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      // พิกัดเทียบกับขอบ canvas จริง ไม่ใช่ขอบหน้าต่าง
      const rect = canvasRef.current?.getBoundingClientRect();
      const x = e.clientX - (rect?.left ?? 0);
      const y = e.clientY - (rect?.top ?? 0);
      const now = performance.now();
      sparksRef.current.push(
        ...Array.from({ length: sparkCount }, (_, i) => ({
          x,
          y,
          angle: (2 * Math.PI * i) / sparkCount,
          startTime: now,
        }))
      );
      // กันสะสมเมื่อกดรัว
      if (sparksRef.current.length > sparkCount * 12) {
        sparksRef.current.splice(0, sparksRef.current.length - sparkCount * 12);
      }
    };
    document.addEventListener("pointerup", onPointerUp);
    return () => document.removeEventListener("pointerup", onPointerUp);
  }, [sparkCount]);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{
          // inset:0 = เท่ากรอบที่ของ fixed ใช้จริง (ไม่ใช้ 100vh ซึ่งบนมือถือสูงกว่าจอที่เห็น)
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          userSelect: "none",
          zIndex: 200,
          pointerEvents: "none",
        }}
      />
      {children}
    </>
  );
}
