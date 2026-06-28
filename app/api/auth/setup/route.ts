// app/api/auth/setup/route.ts
// เรียกหลังสมัครสำเร็จฝั่ง client — ตั้ง role=member (custom claim) + สร้าง user doc
// ใช้ Admin SDK จึง bypass Security Rules (สร้าง doc ได้แม้ rules ยังไม่ deploy)
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export async function POST(req: Request) {
  try {
    const { idToken, studentId } = await req.json();
    if (!idToken) {
      return NextResponse.json({ error: "missing idToken" }, { status: 400 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;
    const email = decoded.email ?? "";

    // อนุญาตเฉพาะ @kmitl.ac.th
    if (!email.toLowerCase().endsWith("@kmitl.ac.th")) {
      return NextResponse.json({ error: "อนุญาตเฉพาะอีเมล @kmitl.ac.th" }, { status: 403 });
    }

    const userRef = adminDb.collection("users").doc(uid);
    const existing = await userRef.get();

    // ตั้ง role=member เฉพาะครั้งแรก (ไม่ทับ admin/super_admin ที่อาจตั้งไว้)
    if (!decoded.role) {
      await adminAuth.setCustomUserClaims(uid, { role: "member" });
    }

    if (!existing.exists) {
      await userRef.set({
        studentId: studentId || email.split("@")[0],
        firstName: "",
        lastName: "",
        email,
        phone: "",
        role: (decoded.role as string) || "member",
        profileImageUrl: null,
        profileCompleted: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("auth/setup:", e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการตั้งค่าบัญชี" }, { status: 500 });
  }
}
