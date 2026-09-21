// nas/pb_hooks/ie_mail.js — ส่งอีเมลจาก NAS ผ่าน Worker iephoto-nas (admin@ienas.site)
//
// NAS ไม่มี SMTP ที่ใช้ได้ (Cloudflare Email Service ส่งได้ทาง Worker เท่านั้น)
// จึงให้ Worker เป็นคนส่ง — NAS ยืนยันตัวกับ Worker ด้วย token อายุสั้นของ superuser
// (หรือของประธาน ถ้ายังไม่มี superuser) Worker ถามกลับมาที่ NAS ว่า token นี้ใช้ได้จริงไหม
// ไม่ต้องมีรหัสลับร่วมกันสักตัว — ดู workers/pb-auth.js

const WORKER = "https://iephoto-nas.vaumgasem.workers.dev";

function mintToken(app) {
  try {
    return app.findFirstRecordByFilter("_superusers", "id != ''").newAuthToken();
  } catch (_) {}
  try {
    return app.findFirstRecordByFilter("users", "role = 'super_admin'").newAuthToken();
  } catch (_) {}
  throw new Error("ยังไม่มีบัญชี superuser หรือประธาน ใช้ยืนยันตัวกับ Worker ส่งอีเมลไม่ได้");
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, "$2 $1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** ส่ง 1 ฉบับ — โยน Error พร้อมเหตุผลถ้าไม่สำเร็จ */
function send(app, m) {
  const res = $http.send({
    url: WORKER + "/mail",
    method: "POST",
    headers: { "content-type": "application/json", authorization: mintToken(app) },
    body: JSON.stringify({
      to: m.to,
      subject: m.subject,
      text: m.text || stripHtml(m.html),
      html: m.html || "",
      replyTo: m.replyTo || "",
      fromName: m.fromName || "IE-Photo",
    }),
    timeout: 30,
  });
  if (res.statusCode !== 200) {
    const err = (res.json && res.json.error) || "HTTP " + res.statusCode;
    throw new Error("ส่งอีเมลถึง " + m.to + " ไม่สำเร็จ: " + err);
  }
}

/** อีเมลของระบบ PocketBase (ตั้งรหัสใหม่ ฯลฯ) — ส่งแทน SMTP */
function relay(e) {
  const msg = e.message;
  const to = msg.to || [];
  for (let i = 0; i < to.length; i++) {
    send(e.app, { to: to[i].address, subject: msg.subject, text: msg.text, html: msg.html });
  }
}

module.exports = { send, relay };
