// app/api/notify/booking/route.ts — แจ้งผลการจองทางอีเมล (admin เรียกหลังอนุมัติ/ปฏิเสธ)
import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { verifyAdmin } from "@/lib/firebase/verify-admin";
import { sendEmail, bookingDecisionEmail } from "@/lib/email";

export async function POST(req: Request) {
  const caller = await verifyAdmin(req);
  if (!caller) return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });

  const { userId, userName, itemName, approved } = await req.json();
  if (!userId || !itemName) return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });

  try {
    const user = await adminAuth.getUser(userId);
    if (!user.email) return NextResponse.json({ ok: false, reason: "no email" });
    const { subject, html } = bookingDecisionEmail(userName || "", itemName, !!approved);
    const sent = await sendEmail(user.email, subject, html);
    return NextResponse.json({ ok: true, sent });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
