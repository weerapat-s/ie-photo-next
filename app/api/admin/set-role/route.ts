// app/api/admin/set-role/route.ts — เปลี่ยน role ของ user (admin เท่านั้น)
import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { verifyAdmin } from "@/lib/firebase/verify-admin";

const VALID = ["member", "admin", "super_admin"];

export async function POST(req: Request) {
  const caller = await verifyAdmin(req);
  if (!caller) return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });

  const { uid, role } = await req.json();
  if (!uid || !VALID.includes(role)) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  // เฉพาะ super_admin เท่านั้นที่ตั้ง/แก้ super_admin ได้
  if (role === "super_admin" && caller.role !== "super_admin") {
    return NextResponse.json({ error: "เฉพาะ super admin เท่านั้น" }, { status: 403 });
  }
  if (uid === caller.uid) {
    return NextResponse.json({ error: "เปลี่ยนบทบาทตัวเองไม่ได้" }, { status: 400 });
  }

  try {
    await adminAuth.setCustomUserClaims(uid, { role });
    await adminDb.collection("users").doc(uid).set({ role }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
