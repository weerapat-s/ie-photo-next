// app/(member)/layout.tsx — กลุ่มหน้าสมาชิก (ต้อง login)
import { RequireAuth } from "@/components/auth-guard";

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
