"use client";
// components/ui.tsx — shared UI primitives
import { useEffect, useRef } from "react";
import Link from "next/link";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass-card animate-in rounded-3xl p-5 ${className}`}>{children}</div>;
}

export function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-700 border-t-orange-500 shadow-[0_0_15px_rgba(255,91,31,0.5)]" />
    </div>
  );
}

export function EmptyState({ icon = "📭", text }: { icon?: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 py-12 text-center">
      <div className="mb-2 text-3xl">{icon}</div>
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "danger" | "ghost" }) {
  const styles = {
    primary: "btn-grad",
    outline: "border border-slate-700/80 bg-slate-800/50 backdrop-blur hover:bg-slate-700/70 text-slate-200 hover:border-slate-600",
    danger: "bg-red-600/90 text-white hover:bg-red-500 shadow-[0_4px_20px_rgba(239,68,68,.35)]",
    ghost: "hover:bg-slate-800/60 text-slate-300",
  }[variant];
  return (
    <button
      className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function LinkButton({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`btn-grad inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold ${className}`}
    >
      {children}
    </Link>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

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

    // Focus container only once on mount/open
    containerRef.current?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={() => closeRef.current()}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className={`w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0d1320] p-6 text-slate-100 shadow-[0_30px_80px_rgba(0,0,0,.8),0_0_30px_rgba(255,91,31,0.1)] backdrop-blur-xl outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
          <button onClick={() => closeRef.current()} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-sm font-medium text-slate-300">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

export const inputClass = "glass-input w-full rounded-xl px-3.5 py-2.5 text-sm";
