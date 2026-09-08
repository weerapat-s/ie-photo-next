"use client";
// components/ai/radiant-prompt.tsx — ช่องพิมพ์คำสั่งขอบไล่สีหมุน
//
// ดัดแปลงจาก Radiant Prompt Input ให้เข้ากับระบบนี้:
//  • ใช้โทเคนสีของแอป (--faculty เป็นสีนำ) แทนจานสีของต้นฉบับ
//  • ใช้ <textarea> ที่ยืดตามเนื้อหา ไม่ใช่ <input> บรรทัดเดียว —
//    คำสั่งมอบหมายงานภาษาไทยมักยาวหลายบรรทัด ถ้าอ่านไม่เห็นทั้งอันจะตรวจยาก
//  • ตัดปุ่มไมค์ของต้นฉบับออก (ระบบยังไม่มีการรับเสียง ปุ่มที่กดแล้วไม่เกิดอะไรแย่กว่าไม่มีปุ่ม)
//    ปุ่มซ้ายเปลี่ยนเป็น "แม่แบบคำสั่ง" ซึ่งทำงานจริง
//  • ขอบไล่สีหมุนด้วย @property + CSS animation ล้วน ไม่พึ่ง JS
import { useRef, useState } from "react";
import Icon from "@/components/icon";
import "./radiant-prompt.css";

export interface RadiantPromptInputProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled?: boolean;
  /** แม่แบบคำสั่งที่กดแล้วเติมลงช่อง — ปุ่ม + ทางซ้าย */
  templates?: string[];
  className?: string;
}

export default function RadiantPromptInput({
  placeholder = "สั่งงานหรือถามอะไรก็ได้…",
  value,
  onChange,
  onSubmit,
  disabled,
  templates = [],
  className = "",
}: RadiantPromptInputProps) {
  const [showTemplates, setShowTemplates] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  function submit() {
    const v = value.trim();
    if (!v || disabled) return;
    onSubmit(v);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // Enter = ส่ง · Shift+Enter = ขึ้นบรรทัดใหม่ (เหมือนแชตทั่วไป)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className={`w-full ${className}`}>
      {showTemplates && templates.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {templates.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                onChange(t);
                setShowTemplates(false);
                ref.current?.focus();
              }}
              className="press surface-flat rounded-full px-3 py-1.5 text-left text-xs font-medium text-[var(--ink)]/80 ring-1 ring-[var(--hairline)] hover:text-[var(--ink)]"
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className={`radiant-wrap ${disabled ? "is-busy" : ""}`}>
        <div className="radiant-border" aria-hidden />

        <div className="relative z-10 flex items-end gap-1.5 p-1.5 pl-2">
          {templates.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              aria-label="แม่แบบคำสั่ง"
              aria-expanded={showTemplates}
              className="tap grid shrink-0 place-items-center self-end rounded-full text-[var(--muted-ink)] transition hover:bg-black/5 hover:text-[var(--ink)]"
            >
              <Icon name={showTemplates ? "close" : "add"} size={20} />
            </button>
          )}

          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="radiant-field"
          />

          <button
            type="button"
            onClick={submit}
            disabled={!value.trim() || disabled}
            aria-label="ส่งคำสั่ง"
            className={`press grid h-11 w-11 shrink-0 place-items-center self-end rounded-full transition ${
              value.trim() && !disabled
                ? "bg-[var(--faculty)] text-white shadow-[0_6px_18px_rgba(239,57,97,0.32)]"
                : "cursor-not-allowed bg-black/5 text-[var(--muted-ink)]"
            }`}
          >
            <Icon name="up" size={20} strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </div>
  );
}
