/**
 * workers/notify.js — อีเมลแจ้งเตือนกรรมการเมื่อมีการมอบหมายอุปกรณ์
 *
 * ส่งผ่าน Cloudflare Email Service จากโดเมนของชุมนุมเอง (admin@ienas.site)
 * ไม่ใช้ Resend เพราะคีย์ Resend อยู่ใน okmd-proxy บัญชีชุมนุมที่ตอนนี้ไม่มีใครเข้าได้
 *
 * ═══ กันไม่ให้กลายเป็นเครื่องส่งสแปม ═══════════════════════════
 *
 *   1. ผู้รับถูกล็อกไว้ที่ binding (allowed_destination_addresses ใน wrangler.nas.toml)
 *      Cloudflare ปฏิเสธเองถ้าพยายามส่งไปที่อื่น — ไม่ได้พึ่งโค้ดตรงนี้อย่างเดียว
 *      และเป็นที่อยู่ที่ยืนยันในบัญชีแล้ว จึงส่งฟรีโดยไม่ต้องเปิด Workers Paid
 *
 *   2. ต้องเป็นกรรมการจริง — ตรวจลายเซ็น ID token แล้วอ่าน users/{uid} ด้วย token
 *      ของคนกดเอง (กติกาให้อ่านเอกสารตัวเองได้) ไม่ต้องถือ service account ไว้บน Worker
 *      บทบาทมาจากฐานข้อมูล ไม่ได้มาจากสิ่งที่ client บอกมา
 *
 *   3. รับเฉพาะข้อมูลที่มีโครงสร้าง (รหัสคำขอ ชื่อคนรับ รายการของ) แล้ว Worker
 *      ประกอบข้อความเอง — client เขียนหัวข้อ/เนื้อหาอิสระไม่ได้ ใช้ส่งอย่างอื่นไม่ได้
 *
 * เส้นทาง:
 *   POST /notify/assigned   Authorization: Bearer <idToken>
 *     body { requestId, holderName, items: string[] }
 */
import { uidFromRequest } from "./firebase-auth.js";

const SITE = "https://iephoto.web.app";

/** อ่าน users/{uid} ด้วย token ของเจ้าตัว — ได้บทบาทจริงจากฐานข้อมูล */
async function readOwnUser(env, uid, idToken) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}` +
    `/databases/${env.FIREBASE_DATABASE_ID || "default"}/documents/users/${uid}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!res.ok) throw new Error(`อ่านข้อมูลผู้ใช้ไม่ได้ (${res.status})`);
  const f = (await res.json()).fields || {};
  const s = (k) => f[k]?.stringValue ?? "";
  return {
    role: s("role"),
    disabled: f.disabled?.booleanValue === true,
    name: `${s("firstName")} ${s("lastName")}`.trim() || s("nickname") || s("email"),
  };
}

const clean = (v, max) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);

/**
 * คืน Response ถ้าเป็นเส้นทาง /notify — คืน null ถ้าไม่ใช่
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {Record<string, string>} cors
 */
export async function handleNotify(request, env, cors) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/notify/")) return null;

  const reply = (obj, status) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
    });

  if (url.pathname !== "/notify/assigned") return reply({ error: "ไม่รู้จักเส้นทางนี้" }, 404);
  if (request.method !== "POST") return reply({ error: "POST only" }, 405);

  if (!env.EMAIL || !env.MAIL_FROM || !env.NOTIFY_TO) {
    return reply({ error: "ยังไม่ได้ตั้งค่าการส่งอีเมลใน wrangler.nas.toml" }, 503);
  }

  // ── ตัวตน + บทบาท ─────────────────────────────────────────────
  let sender;
  try {
    const uid = await uidFromRequest(request, env);
    const idToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    sender = await readOwnUser(env, uid, idToken);
  } catch (e) {
    return reply({ error: `ยืนยันตัวตนไม่ผ่าน: ${String(e.message || e).slice(0, 120)}` }, 401);
  }
  if (sender.disabled) return reply({ error: "บัญชีถูกระงับ" }, 403);
  if (sender.role !== "admin" && sender.role !== "super_admin") {
    return reply({ error: "ต้องเป็นกรรมการเท่านั้น" }, 403);
  }

  // ── ข้อมูลที่รับ — มีโครงสร้าง จำกัดความยาว ─────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "bad json" }, 400);
  }
  const requestId = clean(body?.requestId, 20);
  const holderName = clean(body?.holderName, 100);
  const items = (Array.isArray(body?.items) ? body.items : [])
    .slice(0, 20)
    .map((i) => clean(i, 120))
    .filter(Boolean);

  if (!/^[A-Z0-9]{6,20}$/.test(requestId) || !holderName || items.length === 0) {
    return reply({ error: "ต้องมี requestId, holderName, items" }, 400);
  }

  // ── ประกอบข้อความเอง ─────────────────────────────────────────
  const when = new Date().toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const subject = `มอบหมายอุปกรณ์ให้ ${holderName} (${items.length} ชิ้น)`;
  const text = [
    `${sender.name} มอบหมายอุปกรณ์ให้ ${holderName}`,
    `เวลา ${when}`,
    "",
    ...items.map((i) => `· ${i}`),
    "",
    `รหัสคำขอ ${requestId}`,
    `คนรับของต้องสแกน QR ที่สถานีตอนมารับ: ${SITE}/scan/`,
  ].join("\n");

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const html =
    `<div style="font-family:sans-serif;max-width:480px">` +
    `<p><b>${esc(sender.name)}</b> มอบหมายอุปกรณ์ให้ <b>${esc(holderName)}</b></p>` +
    `<p style="color:#666">${esc(when)}</p>` +
    `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` +
    `<p>รหัสคำขอ <code style="font-size:16px;letter-spacing:2px">${esc(requestId)}</code></p>` +
    `<p><a href="${SITE}/scan/">เปิดสถานีสแกน</a></p>` +
    `</div>`;

  try {
    const res = await env.EMAIL.send({
      from: { email: env.MAIL_FROM, name: "IE-Photo" },
      to: env.NOTIFY_TO,
      subject,
      text,
      html,
    });
    console.log(`notify assigned ok request=${requestId} messageId=${res?.messageId}`);
    return reply({ ok: true }, 200);
  } catch (e) {
    // code เช่น E_SENDER_NOT_VERIFIED / E_RECIPIENT_NOT_ALLOWED ช่วยบอกว่าตั้งค่าตรงไหนขาด
    const code = e?.code ? `${e.code}: ` : "";
    return reply({ error: `ส่งอีเมลไม่สำเร็จ — ${code}${String(e?.message || e).slice(0, 160)}` }, 502);
  }
}
