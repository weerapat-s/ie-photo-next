"use client";
// components/ai/generate-button.tsx — ปุ่มสั่งวางแผน สลับข้อความทีละตัวอักษร
//
// ตอนกด ข้อความจะไล่เปลี่ยนทีละตัวจาก "วางแผนให้" → "กำลังวางแผน"
// ทำด้วย CSS transition-delay ตาม index ไม่ใช้ requestAnimationFrame
// (เหตุผลเดียวกับเมนู: ถ้าเฟรมถูกหน่วง อนิเมชันแบบ JS จะค้างกลางทาง)
import Icon from "@/components/icon";
import "./generate-button.css";

/**
 * ตัดข้อความเป็น "กลุ่มอักขระที่มองเห็นเป็นตัวเดียว"
 *
 * ห้ามใช้ [...str] กับภาษาไทย — สระบน/ล่างและวรรณยุกต์เป็นคนละ code point
 * ถ้าแยกไปคนละกล่อง "ให้" จะกลายเป็น "ใ" "ห" "้" ลอยหลุดจากพยัญชนะ
 * Intl.Segmenter รวมให้ถูกตามหลักภาษา ส่วน fallback เกาะ combining mark
 * (U+0E31–U+0E4E) ไว้กับตัวหน้าเอง
 */
function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter("th", { granularity: "grapheme" });
    return [...seg.segment(text)].map((s) => s.segment);
  }
  const out: string[] = [];
  for (const ch of text) {
    if (out.length && /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0300-\u036F]/.test(ch)) {
      out[out.length - 1] += ch;
    } else {
      out.push(ch);
    }
  }
  return out;
}

export default function GenerateButton({
  onClick,
  loading = false,
  disabled = false,
  idleLabel = "วางแผนให้",
  busyLabel = "กำลังวางแผน",
  className = "",
}: {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  idleLabel?: string;
  busyLabel?: string;
  className?: string;
}) {
  // ทั้งสองคำซ้อนทับกัน ความกว้างปุ่มจึงยึดคำที่ยาวกว่าไว้ ไม่กระตุกตอนสลับ
  const idle = graphemes(idleLabel);
  const busy = graphemes(busyLabel);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      data-loading={loading || undefined}
      className={`gen-btn press ${className}`}
    >
      <Icon name="empty" size={16} className="gen-btn-star" />

      <span className="gen-btn-labels">
        {/* คำที่ยาวกว่าเป็นตัวกำหนดความกว้าง แต่มองไม่เห็น */}
        <span className="gen-btn-ghost" aria-hidden>
          {idleLabel.length >= busyLabel.length ? idleLabel : busyLabel}
        </span>

        <span className="gen-btn-line gen-btn-idle" aria-hidden>
          {idle.map((ch, i) => (
            <span key={i} style={{ ["--i" as string]: i } as React.CSSProperties}>
              {ch}
            </span>
          ))}
        </span>

        <span className="gen-btn-line gen-btn-busy" aria-hidden>
          {busy.map((ch, i) => (
            <span key={i} style={{ ["--i" as string]: i } as React.CSSProperties}>
              {ch}
            </span>
          ))}
        </span>

        {/* ตัวอ่านหน้าจอเอาข้อความจากตรงนี้ ไม่ต้องอ่านทีละตัวอักษร */}
        <span className="sr-only">{loading ? busyLabel : idleLabel}</span>
      </span>
    </button>
  );
}
