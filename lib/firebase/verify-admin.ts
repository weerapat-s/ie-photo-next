// lib/firebase/verify-admin.ts — server helper ตรวจว่า request มาจาก admin
import { adminAuth } from "./admin";

export interface Caller {
  uid: string;
  role: "admin" | "super_admin";
}

/** ตรวจ Authorization: Bearer <idToken> ว่าเป็น admin/super_admin */
export async function verifyAdmin(req: Request): Promise<Caller | null> {
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const role = decoded.role as string | undefined;
    if (role === "admin" || role === "super_admin") {
      return { uid: decoded.uid, role };
    }
    return null;
  } catch {
    return null;
  }
}
