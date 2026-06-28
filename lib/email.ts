// lib/email.ts — ส่งอีเมลผ่าน Resend REST API (server-only)
// ถ้ายังไม่ตั้ง RESEND_API_KEY จะ no-op (log เฉยๆ ไม่ error)
const FROM = process.env.RESEND_FROM || "IE-Photo <onboarding@resend.dev>";

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email skipped — no RESEND_API_KEY] to=${to} subject=${subject}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (!res.ok) {
      console.error("Resend error:", await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("sendEmail failed:", e);
    return false;
  }
}

export function bookingDecisionEmail(name: string, itemName: string, approved: boolean): { subject: string; html: string } {
  const status = approved ? "ได้รับการอนุมัติ ✅" : "ถูกปฏิเสธ ❌";
  return {
    subject: `การจอง "${itemName}" ${approved ? "ได้รับการอนุมัติ" : "ถูกปฏิเสธ"}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#F2531C">IE-Photo Booking</h2>
        <p>สวัสดีคุณ ${name || ""}</p>
        <p>การจอง <strong>${itemName}</strong> ของคุณ${status}</p>
        ${approved ? "<p>กรุณามารับ/ใช้งานตามวันเวลาที่จองไว้</p>" : "<p>หากมีข้อสงสัยกรุณาติดต่อเลขาชุมนุม 096-954-5290</p>"}
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p style="color:#999;font-size:12px">IE-Photo KMITL · ระบบจองอุปกรณ์และสตูดิโอ</p>
      </div>`,
  };
}
