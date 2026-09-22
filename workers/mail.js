/**
 * workers/mail.js — ส่งอีเมลทั่วไปจาก admin@ienas.site (แทน /send ของ okmd-proxy เดิม)
 *
 * ใครใช้:
 *   • กรรมการในหน้าเว็บ (lib/mail.ts — แจ้งมอบหมายงาน, เตือนคืนของ ฯลฯ)
 *   • ระบบบน NAS (PocketBase hook — อีเมลตั้งรหัสใหม่, แจ้งเตือนตามเวลา) ด้วย token ของ superuser
 *
 * POST /mail   Authorization: <token ของ PocketBase>
 *   body { to, subject, body | text, html?, replyTo?, fromName? }
 *
 * ต่างจาก /notify/* ตรงที่ผู้รับกำหนดได้ — จึงยอมเฉพาะกรรมการหรือระบบบน NAS เท่านั้น
 * (NAS ยืนยันบทบาทจากฐานข้อมูล ไม่ใช่จากสิ่งที่ผู้ยิงบอก) เหมือน /send เดิมที่ต้องเป็นกรรมการ
 */
import { pbIdentity, isAdminIdent } from "./pb-auth.js";

const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
const clean = (v, max) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** ข้อความล้วน → HTML อ่านง่าย (ขึ้นบรรทัดใหม่ตามต้นฉบับ ลิงก์กดได้) */
function textToHtml(text) {
  const body = esc(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, "<br>");
  return `<div style="font-family:sans-serif;max-width:560px;line-height:1.6">${body}</div>`;
}

export async function handleMail(request, env, cors) {
  const url = new URL(request.url);
  if (url.pathname !== "/mail") return null;

  const reply = (obj, status) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
    });

  if (request.method !== "POST") return reply({ error: "POST only" }, 405);
  if (!env.EMAIL || !env.MAIL_FROM) return reply({ error: "ยังไม่ได้ตั้งค่าการส่งอีเมลใน wrangler.nas.toml" }, 503);

  let ident;
  try {
    ident = await pbIdentity(request, env);
  } catch (e) {
    return reply({ error: `ยืนยันตัวตนไม่ผ่าน: ${String(e.message || e).slice(0, 120)}` }, 401);
  }
  if (!isAdminIdent(ident)) return reply({ error: "ส่งอีเมลได้เฉพาะกรรมการ" }, 403);

  let m;
  try {
    m = await request.json();
  } catch {
    return reply({ error: "bad json" }, 400);
  }

  const to = clean(m?.to, 200).toLowerCase();
  const subject = clean(m?.subject, 200);
  const text = String(m?.text ?? m?.body ?? "").slice(0, 20000);
  const html = typeof m?.html === "string" && m.html ? m.html.slice(0, 100000) : textToHtml(text);
  const replyTo = clean(m?.replyTo, 200);
  const fromName = clean(m?.fromName, 80) || "IE-Photo";
  if (!EMAIL_RE.test(to) || !subject || !text) return reply({ error: "ต้องมี to, subject, body" }, 400);

  try {
    const res = await env.EMAIL.send({
      from: { email: env.MAIL_FROM, name: fromName },
      to,
      subject,
      text,
      html,
      ...(EMAIL_RE.test(replyTo) ? { replyTo } : {}),
    });
    // forwarded: false = ถึงผู้รับตัวจริง (ไม่ได้ส่งเข้ากล่องกลางแบบสมัย Resend ทดลอง)
    return reply({ ok: true, forwarded: false, id: res?.messageId ?? null }, 200);
  } catch (e) {
    const code = e?.code ? `${e.code}: ` : "";
    return reply({ error: `ส่งอีเมลไม่สำเร็จ — ${code}${String(e?.message || e).slice(0, 160)}` }, 502);
  }
}
