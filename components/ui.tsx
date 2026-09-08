"use client";
// components/ui.tsx — ชุด UI พื้นฐาน Liquid Glass (โทนเดียวกับ index.html)
// ออกแบบมือถือมาก่อน: Modal เป็น bottom sheet บนจอเล็ก, เป้ากดอย่างน้อย 44px
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Icon, { type IconName } from "@/components/icon";
import { useBrowserValue } from "@/lib/hooks";

/* ═══ หัวข้อหน้า ═══════════════════════════════════════════════ */
export function PageHeader({
  title,
  subtitle,
  action,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="animate-in mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="t-eyebrow mb-1">{eyebrow}</p>}
        <h1 className="t-display text-[var(--ink)]">{title}</h1>
        {subtitle && <p className="t-body mt-1 text-[var(--muted-ink)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ═══ การ์ด ════════════════════════════════════════════════════ */
export function Card({
  children,
  className = "",
  glow = false,
  hover = false,
  surface = "raised",
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  hover?: boolean;
  /** raised = การ์ดหลัก · flat = รายการย่อย · sunken = กล่องข้อมูลในการ์ดอีกที */
  surface?: "raised" | "flat" | "sunken";
} & React.HTMLAttributes<HTMLDivElement>) {
  const base = glow
    ? "glow-card"
    : surface === "flat"
      ? "surface-flat"
      : surface === "sunken"
        ? "surface-sunken"
        : "glass-card";
  return (
    <div className={`${base} ${hover ? "hover-scale" : ""} rounded-3xl p-5 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Section({
  title,
  children,
  action,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
        <h2 className="t-label text-[var(--muted-ink)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ═══ ป้ายสถานะ ════════════════════════════════════════════════ */
export function Badge({
  children,
  className = "",
  icon,
}: {
  children: React.ReactNode;
  className?: string;
  icon?: IconName;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </span>
  );
}

/* ═══ สถานะโหลด/ว่าง ═══════════════════════════════════════════ */
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <div className="ring-spin h-8 w-8 rounded-full border-[3px] border-black/8 border-t-[var(--faculty)]" />
      {label && <p className="t-body text-[var(--muted-ink)]">{label}</p>}
    </div>
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="glass-card rounded-3xl p-5">
      <div className="skeleton mb-3 h-4 w-1/3 rounded-full" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton mb-2 h-3 rounded-full" style={{ width: `${90 - i * 14}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon = "empty",
  text,
  action,
}: {
  icon?: IconName;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="animate-in rounded-3xl border border-dashed border-[var(--hairline-strong)] bg-white/50 px-6 py-12 text-center">
      <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-black/[0.04] text-[var(--muted-ink)]">
        <Icon name={icon} size={24} />
      </span>
      <p className="t-body mx-auto max-w-xs text-[var(--muted-ink)]">{text}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/* ═══ แจ้งเตือนในหน้า ══════════════════════════════════════════ */
export function Alert({
  tone = "error",
  children,
  onClose,
}: {
  tone?: "error" | "success" | "info" | "warn";
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const map: Record<string, { cls: string; icon: IconName }> = {
    error: { cls: "tone-bad", icon: "warning" },
    success: { cls: "tone-ok", icon: "success" },
    info: { cls: "tone-info", icon: "info" },
    warn: { cls: "tone-warn", icon: "warning" },
  };
  const m = map[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`animate-in t-body mb-4 flex items-start gap-2.5 rounded-2xl px-4 py-3 ${m.cls}`}
    >
      <span className="mt-[3px]">
        <Icon name={m.icon} size={16} />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <button onClick={onClose} aria-label="ปิด" className="tap -my-1 -mr-1 shrink-0 opacity-55 hover:opacity-100">
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}

/* ═══ ปุ่ม ═════════════════════════════════════════════════════ */
type ButtonVariant = "primary" | "outline" | "danger" | "ghost" | "soft";

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  loading = false,
  fullWidth = false,
  icon,
  iconEnd,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  fullWidth?: boolean;
  icon?: IconName;
  iconEnd?: IconName;
}) {
  const variants: Record<ButtonVariant, string> = {
    primary: "btn-grad",
    outline: "btn-glass",
    soft: "bg-[var(--faculty)]/10 text-[var(--faculty)] hover:bg-[var(--faculty)]/16 border border-[var(--faculty)]/20",
    danger: "bg-[var(--tone-bad-ink)] text-white shadow-[0_8px_20px_rgba(156,31,46,.28)] hover:brightness-110",
    ghost: "text-[var(--ink)] hover:bg-black/5",
  };
  const sizes = {
    // เป้ากดขั้นต่ำ 40px แม้แต่ปุ่มเล็ก — ต่ำกว่านี้นิ้วโป้งพลาดบ่อยบนมือถือ
    // (Apple แนะนำ 44pt, Material 48dp · 40 คือขั้นต่ำที่ยังจัดวางในแถวปุ่มได้สวย)
    sm: "px-3.5 py-2 text-[0.8125rem] min-h-[40px]",
    md: "px-4 py-2.5 text-sm min-h-[46px]",
    lg: "px-6 py-3 text-base min-h-[52px]",
  };
  // ไอคอนในปุ่มเล็กเคยเป็น 14 ซึ่งจางจนดูไม่ออกว่าเป็นรูปอะไร
  const iconSize = size === "sm" ? 16 : 18;
  return (
    <button
      disabled={disabled || loading}
      className={`press inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="ring-spin h-3.5 w-3.5 shrink-0 rounded-full border-2 border-current/30 border-t-current" />
      ) : (
        icon && <Icon name={icon} size={iconSize} />
      )}
      {children}
      {iconEnd && !loading && <Icon name={iconEnd} size={iconSize} />}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  className = "",
  variant = "primary",
  external = false,
  icon,
  iconEnd,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  variant?: ButtonVariant;
  external?: boolean;
  icon?: IconName;
  iconEnd?: IconName;
}) {
  const cls = `press inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold ${
    variant === "primary" ? "btn-grad" : variant === "outline" ? "btn-glass" : "text-[var(--faculty)]"
  } ${className}`;
  const inner = (
    <>
      {icon && <Icon name={icon} size={16} />}
      {children}
      {iconEnd && <Icon name={iconEnd} size={16} />}
    </>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}

/* ═══ ชิปกรอง (เลื่อนแนวนอนบนมือถือ) ══════════════════════════ */
export function ChipBar<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: { key: T; label: string; count?: number; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`snap-x-list no-scrollbar -mx-1 px-1 pb-1 ${className}`} role="tablist">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={`press inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
              active
                ? "bg-[var(--faculty)] text-white shadow-[0_6px_16px_rgba(239,57,97,0.3)]"
                : "glass-thin text-[var(--ink)]"
            }`}
          >
            {o.icon && <Icon name={o.icon} size={18} />}
            {o.label}
            {typeof o.count === "number" && (
              <span className={`t-num ml-1.5 text-xs ${active ? "text-white/75" : "text-[var(--muted-ink)]"}`}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ═══ สวิตช์ ═══════════════════════════════════════════════════ */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-[52px] shrink-0 rounded-full transition disabled:opacity-40 ${
        checked ? "bg-[var(--faculty)] shadow-[0_4px_12px_rgba(239,57,97,0.35)]" : "bg-black/15"
      }`}
    >
      {/* ต้องมี left-0.5 — ไม่งั้น static position ของ absolute ไปอิง text-align:center ของ <button>
          (ค่า UA) ทำให้หัวสวิตช์เริ่มที่กลางรางแล้วเลื่อนล้นออกนอกขอบขวา 22px */}
      <span
        className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-0"
        }`}
      />
    </button>
  );
}

/* ═══ Modal / Bottom sheet ════════════════════════════════════ */
export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  footer?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  // portal ได้ต่อเมื่ออยู่ฝั่ง client แล้ว
  const readMounted = useCallback(() => true, []);
  const mounted = useBrowserValue(readMounted, false);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    containerRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open || !mounted) return null;

  // ต้อง portal ไป body — ถ้า Modal ถูกวางในการ์ดที่มี backdrop-filter
  // การ์ดจะกลายเป็น containing block ของ position:fixed แล้ว modal จะไม่เต็มจอ
  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/35 backdrop-blur-[3px] p-0 sm:items-center sm:p-4"
      onClick={() => closeRef.current()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`
          w-full ${maxWidth} outline-none
          max-h-[92vh] overflow-y-auto overscroll-contain
          rounded-t-[28px] sm:rounded-3xl
          border border-white/70 bg-[rgba(255,255,255,0.94)]
          p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:p-6 sm:pb-6
          text-[var(--ink)]
          shadow-[0_-10px_60px_rgba(0,0,0,0.22)] sm:shadow-[0_30px_80px_rgba(0,0,0,0.22)]
          backdrop-blur-2xl
          [animation:sheetUp_.34s_cubic-bezier(0.16,1,0.3,1)_both] sm:[animation:fadeUpFloat_.34s_cubic-bezier(0.16,1,0.3,1)_both]
        `}
      >
        {/* ที่จับลากแบบ iOS — เห็นเฉพาะจอเล็ก */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-black/15 sm:hidden" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="t-heading text-[var(--ink)]">{title}</h3>
          <button
            onClick={() => closeRef.current()}
            aria-label="ปิด"
            className="tap -mr-2 -mt-1 grid shrink-0 place-items-center rounded-full text-[var(--muted-ink)] transition hover:bg-black/5 hover:text-[var(--ink)]"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
        {footer && <div className="mt-5 border-t border-black/8 pt-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ═══ ฟอร์ม ════════════════════════════════════════════════════ */
export function Field({
  label,
  children,
  required,
  help,
  error,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  help?: string;
  error?: string;
}) {
  return (
    <div className="mb-3.5" data-field-invalid={error ? "" : undefined}>
      <label className="t-label mb-1.5 block text-[var(--ink)]">
        {label} {required && <span className="text-[var(--faculty)]">*</span>}
      </label>
      {children}
      {help && !error && <p className="t-caption mt-1">{help}</p>}
      {error && (
        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-[var(--tone-bad-ink)]">
          <Icon name="warning" size={16} />
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass = "glass-input w-full rounded-2xl px-4 py-3 text-[15px] leading-snug";

/* ═══ ช่องค้นหา ═══════════════════════════════════════════════ */
export function SearchInput({
  value,
  onChange,
  placeholder = "ค้นหา",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted-ink)]">
        <Icon name="search" size={18} />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="glass-input w-full rounded-2xl py-3 pl-11 pr-10 text-[15px] leading-snug"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="ล้างคำค้น"
          className="tap absolute right-1 top-1/2 grid -translate-y-1/2 place-items-center rounded-xl px-2 text-[var(--muted-ink)] transition hover:text-[var(--ink)]"
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}

/* ═══ ตัวเลือกรูปภาพพร้อมพรีวิว ═══════════════════════════════ */
export function ImagePicker({
  file,
  preview,
  onPick,
  hint,
  accept = "image/*",
}: {
  file: File | null;
  preview: string | null;
  onPick: (f: File | null) => void;
  hint?: string;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="press flex w-full items-center gap-3 rounded-2xl border border-dashed border-black/15 bg-white/60 p-3 text-left transition hover:border-[var(--faculty)]/50 hover:bg-white"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[var(--faculty)]/10 text-[var(--faculty)]">
            <Icon name="equipment" size={24} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="t-label block truncate text-[var(--ink)]">
            {file ? file.name : "แตะเพื่อถ่ายรูปหรือเลือกไฟล์"}
          </span>
          <span className="t-caption block">{hint ?? "JPG / PNG — ระบบย่อขนาดให้อัตโนมัติ"}</span>
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

/* ═══ Toast แบบสั้น ═══════════════════════════════════════════ */
export function useToast() {
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, tone: "ok" | "err" = "ok") => {
    setToast({ text, tone });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const node = toast ? (
    <div
      role="status"
      className="fixed inset-x-0 z-[300] flex justify-center px-4"
      style={{ bottom: "calc(var(--dock-h) + 12px)" }}
    >
      <div
        className={`animate-in max-w-sm rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur ${
          toast.tone === "ok" ? "bg-[var(--ink)]/92" : "bg-red-600/95"
        }`}
      >
        {toast.text}
      </div>
    </div>
  ) : null;

  return { show, node };
}

/* ═══ แถวข้อมูล key/value ═════════════════════════════════════ */
export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] py-2.5 last:border-0">
      <span className="t-body shrink-0 text-[var(--muted-ink)]">{label}</span>
      <span className="t-body min-w-0 text-right font-semibold text-[var(--ink)]">{children}</span>
    </div>
  );
}

/* ═══ ลิงก์ที่ก็อปได้ในคลิกเดียว ═══════════════════════════════ */
export function CopyLink({ url, label }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-[var(--hairline)] bg-white/70 p-2 pl-3.5">
      <Icon name="link" size={16} className="text-[var(--muted-ink)]" />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--faculty)] hover:underline"
      >
        {label ?? url}
      </a>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            // clipboard ถูกบล็อก (http หรือ permission) — ให้ผู้ใช้กดลิงก์ก็อปเองแทน
            setCopied(false);
          }
        }}
        className="press tap inline-flex shrink-0 items-center gap-1 rounded-xl bg-black/5 px-3 text-xs font-semibold text-[var(--ink)]"
      >
        <Icon name={copied ? "approved" : "copy"} size={16} />
        {copied ? "คัดลอกแล้ว" : "คัดลอก"}
      </button>
    </div>
  );
}
