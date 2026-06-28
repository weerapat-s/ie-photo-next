// components/ui.tsx — shared UI primitives
import Link from "next/link";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>
  );
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
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-neutral-300 border-t-orange-500" />
    </div>
  );
}

export function EmptyState({ icon = "📭", text }: { icon?: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 py-12 text-center">
      <div className="mb-2 text-3xl">{icon}</div>
      <p className="text-sm text-neutral-500">{text}</p>
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
    primary: "bg-orange-500 text-white hover:bg-orange-600",
    outline: "border border-neutral-300 hover:bg-neutral-100",
    danger: "bg-red-500 text-white hover:bg-red-600",
    ghost: "hover:bg-neutral-100",
  }[variant];
  return (
    <button
      className={`rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 ${styles} ${className}`}
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
      className={`inline-flex items-center gap-1 rounded-lg bg-orange-500 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-orange-600 ${className}`}
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
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
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
      <label className="mb-1 block text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300";
