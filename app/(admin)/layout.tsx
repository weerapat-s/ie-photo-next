// app/(admin)/layout.tsx — กลุ่มหน้าแอดมิน (ต้องเป็น admin/super_admin)
import { RequireAdmin } from "@/components/auth-guard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RequireAdmin>{children}</RequireAdmin>;
}
