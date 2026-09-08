"use client";
// components/tabs.tsx — แท็บในหน้า ใช้ยุบหลายหน้าที่เนื้อหาใกล้กันให้เหลือหน้าเดียว
//
// เก็บแท็บที่เลือกไว้ใน query string (?tab=…) เพื่อให้:
//   • กดปุ่มย้อนกลับของเบราว์เซอร์แล้วกลับมาแท็บเดิม
//   • แชร์ลิงก์ตรงไปแท็บที่ต้องการได้
// ไม่ใช้ state ล้วน ๆ เพราะผู้ใช้มือถือกด back บ่อยกว่าปุ่มในหน้า
import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Icon, { type IconName } from "@/components/icon";

export interface TabDef<T extends string> {
  key: T;
  label: string;
  icon?: IconName;
  /** ตัวเลขกำกับ เช่น จำนวนรายการค้าง */
  badge?: number;
}

export function useTabParam<T extends string>(tabs: TabDef<T>[], fallback: T): [T, (t: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab");
  const active = tabs.some((t) => t.key === raw) ? (raw as T) : fallback;

  const setTab = useCallback(
    (t: T) => {
      const next = new URLSearchParams(params.toString());
      if (t === fallback) next.delete("tab");
      else next.set("tab", t);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router, fallback]
  );

  return [active, setTab];
}

/** แถบแท็บแบบ segmented — เต็มความกว้างบนมือถือ กดง่ายด้วยนิ้วโป้ง */
export default function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className = "",
}: {
  tabs: TabDef<T>[];
  value: T;
  onChange: (t: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="แท็บเนื้อหา"
      className={`flex gap-1 rounded-2xl bg-[var(--surface-sunken)] p-1 ${className}`}
    >
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={`
              press flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl px-2
              text-[0.8125rem] font-semibold transition
              ${active ? "bg-white text-[var(--ink)] shadow-[0_2px_8px_rgba(0,0,0,0.07)]" : "text-[var(--muted-ink)]"}
            `}
          >
            {t.icon && <Icon name={t.icon} size={16} />}
            <span className="truncate">{t.label}</span>
            {typeof t.badge === "number" && t.badge > 0 && (
              <span
                className={`t-num rounded-full px-1.5 text-[0.6875rem] font-bold ${
                  active ? "bg-[var(--faculty)] text-white" : "bg-black/8 text-[var(--muted-ink)]"
                }`}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
