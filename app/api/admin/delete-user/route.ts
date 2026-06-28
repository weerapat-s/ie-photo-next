// app/api/admin/delete-user/route.ts — ลบบัญชี user (admin เท่านั้น)
import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { verifyAdmin } from "@/lib/firebase/verify-admin";

export async function POST(req: Request) {
  const caller = await verifyAdmin(req);
  if (!caller) return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });

  const { uid } = await req.json();
  if (!uid) return NextResponse.json({ error: "ไม่พบ uid" }, { status: 400 });
  if (uid === caller.uid) return NextResponse.json({ error: "ลบบัญชีตัวเองไม่ได้" }, { status: 400 });

  try {
    await adminAuth.deleteUser(uid);
    await adminDb.collection("users").doc(uid).delete();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
