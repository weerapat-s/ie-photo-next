/**
 * workers/notify.js — อีเมลแจ้งเตือนเรื่องการยืมอุปกรณ์ ส่งจาก admin@ienas.site
 *
 * ส่งผ่าน Cloudflare Email Service จากโดเมนของชุมนุมเอง
 * ไม่ใช้ Resend เพราะคีย์ Resend อยู่ใน okmd-proxy บัญชีชุมนุมที่ตอนนี้ไม่มีใครเข้าได้
 *
 * เส้นทาง:
 *   POST /notify/assigned        กรรมการมอบหมายของให้ใครสักคน → แจ้งกรรมการ (NOTIFY_TO)
 *     body { requestId, holderName, items: string[] }
 *   POST /notify/borrow-request  สมาชิกส่งคำขอยืม → ยืนยันถึงตัวน้อง + แจ้งกรรมการ
 *     body { requestId }
 *   ทั้งคู่ต้องมี Authorization: Bearer <token ล็อกอินของ PocketBase> — Worker ถาม NAS ว่าเป็นใคร
 *
 * ═══ กันไม่ให้กลายเป็นเครื่องส่งสแปม ═══════════════════════════
 *
 *   ผู้รับไม่เคยมาจาก client — มีได้แค่สองแบบ:
 *     • NOTIFY_TO (กรรมการ) ตั้งไว้ใน wrangler.nas.toml
 *     • อีเมลของคนที่ล็อกอินอยู่ ตามที่ NAS ยืนยันจาก token — ปลอมไม่ได้
 *   ใครยิงมาก็ส่งเมลหาคนอื่นนอกจากตัวเองกับกรรมการไม่ได้
 *
 *   เนื้อหามาจากฐานข้อมูล ไม่ใช่ข้อความที่ client ส่งมา:
 *     /borrow-request อ่านคำขอจริงจาก bookings ด้วย token ของเจ้าตัว
 *     (rules ให้อ่านได้เฉพาะคำขอของตัวเอง) — แต่งรายการของเองไม่ได้
 *
 *   คำขอหนึ่งใบส่งได้ครั้งเดียว (จำไว้ใน KV NOTIFY_SENT) และต้องเป็นคำขอที่
 *   เพิ่งสร้าง — กดซ้ำรัว ๆ ให้โควตารายวัน (200 ฉบับ) หมดไม่ได้
 */
import { pbIdentity, isAdminIdent } from "./pb-auth.js";

const SITE = "https://iephoto.ienas.site";
/** คำขอเก่ากว่านี้ไม่ส่งแล้ว — กันเอารหัสเก่ามายิงซ้ำ */
const FRESH_MS = 30 * 60 * 1000;
/** จำว่าส่งแล้วนานเท่านี้ (วินาที) */
const DEDUPE_TTL = 7 * 24 * 3600;

const clean = (v, max) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
/** วันที่จาก PocketBase เป็น "2026-09-22 03:00:00.000Z" — ต้องมี T ถึง parse ได้ทุกเบราว์เซอร์/runtime */
const toMs = (d) => (typeof d === "string" ? Date.parse(d.replace(" ", "T")) : Number(d));
const fmt = (d) =>
  new Date(toMs(d)).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });

/** ข้อมูลบัญชีจาก record ที่ NAS ยืนยันแล้ว */
function meFrom(ident) {
  const r = ident.record || {};
  const s = (k) => (typeof r[k] === "string" ? r[k] : "");
  return {
    role: ident.kind === "superuser" ? "super_admin" : s("role"),
    disabled: r.disabled === true,
    name: `${s("firstName")} ${s("lastName")}`.trim() || s("nickname") || s("email"),
    nickname: s("nickname"),
    studentId: s("studentId"),
    phone: s("phone"),
    email: s("email"),
    uid: r.id,
  };
}

/**
 * คำขอยืมของคนนี้ตามรหัสคำขอ — อ่านด้วย token ของเจ้าตัว
 * API rules บน NAS ให้เห็นเฉพาะคำขอของตัวเองอยู่แล้ว กรอง userId ซ้ำอีกชั้นกันพลาด
 */
async function readOwnRequest(env, me, token, requestId) {
  const filter = `requestId = "${requestId}" && userId = "${me.uid}"`;
  const url =
    `${env.PB_URL}/api/collections/bookings/records?perPage=25&skipTotal=1` +
    `&fields=itemName,status,startAt,endAt,createdAt,usageReason,usageType,overnight,overnightStorage` +
    `&filter=${encodeURIComponent(filter)}`;
  const res = await fetch(url, { headers: { Authorization: token } });
  if (!res.ok) throw new Error(`อ่านคำขอไม่ได้ (${res.status})`);
  return ((await res.json()).items || []).map((r) => ({
    itemName: r.itemName || "",
    status: r.status,
    startAt: r.startAt,
    endAt: r.endAt,
    createdAt: r.createdAt,
    usageReason: r.usageReason || "",
    usageType: r.usageType || "",
    overnight: r.overnight === true,
    overnightStorage: r.overnightStorage || "",
  }));
}

/** ส่ง 1 ฉบับ — โยน Error พร้อม code ของ Cloudflare ถ้าไม่สำเร็จ */
async function sendOne(env, to, subject, text, html) {
  const res = await env.EMAIL.send({
    from: { email: env.MAIL_FROM, name: "IE-Photo" },
    to,
    subject,
    text,
    html,
  });
  return res?.messageId;
}

const wrapHtml = (inner) => `<div style="font-family:sans-serif;max-width:520px;line-height:1.6">${inner}</div>`;

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

  if (request.method !== "POST") return reply({ error: "POST only" }, 405);
  if (!env.EMAIL || !env.MAIL_FROM || !env.NOTIFY_TO) {
    return reply({ error: "ยังไม่ได้ตั้งค่าการส่งอีเมลใน wrangler.nas.toml" }, 503);
  }

  // ── ตัวตน (ถาม NAS) ─────────────────────────────────────────
  let ident, me;
  try {
    ident = await pbIdentity(request, env);
    me = meFrom(ident);
  } catch (e) {
    return reply({ error: `ยืนยันตัวตนไม่ผ่าน: ${String(e.message || e).slice(0, 120)}` }, 401);
  }
  if (me.disabled) return reply({ error: "บัญชีถูกระงับ" }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "bad json" }, 400);
  }

  try {
    if (url.pathname === "/notify/assigned") return await assigned(env, ident, me, body, reply);
    if (url.pathname === "/notify/borrow-request") return await borrowRequest(env, ident, me, body, reply);
    return reply({ error: "ไม่รู้จักเส้นทางนี้" }, 404);
  } catch (e) {
    // code เช่น E_SENDER_NOT_VERIFIED / E_RECIPIENT_NOT_ALLOWED ช่วยบอกว่าตั้งค่าตรงไหนขาด
    const code = e?.code ? `${e.code}: ` : "";
    return reply({ error: `ส่งอีเมลไม่สำเร็จ — ${code}${String(e?.message || e).slice(0, 160)}` }, 502);
  }
}

/* ═══ กรรมการมอบหมายของ → แจ้งกรรมการ ═══════════════════════════ */
async function assigned(env, ident, me, body, reply) {
  if (!isAdminIdent(ident)) {
    return reply({ error: "ต้องเป็นกรรมการเท่านั้น" }, 403);
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

  const when = fmt(Date.now());
  const text = [
    `${me.name} มอบหมายอุปกรณ์ให้ ${holderName}`,
    `เวลา ${when}`,
    "",
    ...items.map((i) => `· ${i}`),
    "",
    `รหัสคำขอ ${requestId}`,
    `คนรับของต้องสแกน QR ที่สถานีตอนมารับ: ${SITE}/scan/`,
  ].join("\n");
  const html = wrapHtml(
    `<p><b>${esc(me.name)}</b> มอบหมายอุปกรณ์ให้ <b>${esc(holderName)}</b></p>` +
      `<p style="color:#666">${esc(when)}</p>` +
      `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` +
      `<p>รหัสคำขอ <code style="font-size:16px;letter-spacing:2px">${esc(requestId)}</code></p>` +
      `<p><a href="${SITE}/scan/">เปิดสถานีสแกน</a></p>`
  );

  await sendOne(env, env.NOTIFY_TO, `มอบหมายอุปกรณ์ให้ ${holderName} (${items.length} ชิ้น)`, text, html);
  return reply({ ok: true }, 200);
}

/* ═══ สมาชิกส่งคำขอยืม → ยืนยันถึงตัวน้อง + แจ้งกรรมการ ═══════════ */
async function borrowRequest(env, ident, me, body, reply) {
  if (ident.kind !== "user") return reply({ error: "ต้องเป็นสมาชิกที่ล็อกอิน" }, 403);
  const requestId = clean(body?.requestId, 20);
  if (!/^[A-Z0-9]{6,20}$/.test(requestId)) return reply({ error: "requestId ไม่ถูกต้อง" }, 400);

  // ส่งแล้วไม่ส่งซ้ำ — ตอบ ok เฉย ๆ ไม่ต้องให้หน้าเว็บขึ้น error
  const dedupeKey = `borrow:${requestId}`;
  if (env.NOTIFY_SENT && (await env.NOTIFY_SENT.get(dedupeKey))) {
    return reply({ ok: true, duplicate: true }, 200);
  }

  const rows = await readOwnRequest(env, me, ident.token, requestId);
  if (rows.length === 0) return reply({ error: "ไม่พบคำขอนี้ของคุณ" }, 404);

  const newest = Math.max(...rows.map((r) => (r.createdAt ? toMs(r.createdAt) : 0) || 0));
  if (!newest || Date.now() - newest > FRESH_MS) {
    return reply({ error: "คำขอนี้เก่าเกินกว่าจะส่งอีเมลแจ้งแล้ว" }, 409);
  }

  // จองสิทธิ์ส่งก่อนยิงจริง — สองคำขอพร้อมกันจะได้ไม่ส่งซ้ำสองรอบ
  // (KV ไม่ใช่ transaction แต่ปิดช่องกดรัวจากหน้าเว็บได้พอ)
  if (env.NOTIFY_SENT) await env.NOTIFY_SENT.put(dedupeKey, "1", { expirationTtl: DEDUPE_TTL });

  const r0 = rows[0];
  const items = rows.map((r) => r.itemName).filter(Boolean);
  const range = `${fmt(r0.startAt)} → ${fmt(r0.endAt)}`;
  const nick = me.nickname ? ` (${me.nickname})` : "";
  const myLink = `${SITE}/my-bookings/?request=${requestId}`;

  const results = { borrower: "skipped", admin: "skipped" };

  // ── ถึงตัวน้อง ──────────────────────────────────────────────
  if (me.email) {
    const text = [
      `สวัสดี ${me.name}${nick}`,
      "",
      "ได้รับคำขอยืมอุปกรณ์แล้ว ตอนนี้รอกรรมการอนุมัติ",
      "",
      ...items.map((i) => `· ${i}`),
      "",
      `ยืม ${range}`,
      r0.usageReason ? `เพื่อ ${r0.usageReason}` : "",
      r0.overnight ? `ยืมข้ามคืน — เก็บไว้ที่ ${r0.overnightStorage}` : "",
      "",
      `รหัสคำขอ ${requestId}`,
      "กรรมการอนุมัติแล้วสถานะในหน้า \"ของฉัน\" จะเปลี่ยน มารับของได้เลย ไม่ต้องสแกน",
      `QR ของคำขอนี้ (ใช้ยืนยันตัวที่เคาน์เตอร์ถ้ากรรมการขอ): ${myLink}`,
      "",
      "ของหายหรือเสียหายระหว่างยืม ผู้ยืมรับผิดชอบเต็มราคา · คืนให้ตรงกำหนด ถ้ายังค้างเลยกำหนดจะยืมชิ้นใหม่ไม่ได้",
    ]
      .filter((l, i, a) => l !== "" || a[i - 1] !== "")
      .join("\n");
    const html = wrapHtml(
      `<p>สวัสดี ${esc(me.name)}${esc(nick)}</p>` +
        `<p>ได้รับคำขอยืมอุปกรณ์แล้ว <b>ตอนนี้รอกรรมการอนุมัติ</b></p>` +
        `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` +
        `<p>ยืม ${esc(range)}</p>` +
        (r0.usageReason ? `<p>เพื่อ ${esc(r0.usageReason)}</p>` : "") +
        (r0.overnight ? `<p>ยืมข้ามคืน — เก็บไว้ที่ ${esc(r0.overnightStorage)}</p>` : "") +
        `<p>รหัสคำขอ <code style="font-size:16px;letter-spacing:2px">${esc(requestId)}</code></p>` +
        `<p>กรรมการอนุมัติแล้วสถานะในหน้า "ของฉัน" จะเปลี่ยน มารับของได้เลย ไม่ต้องสแกน</p>` +
        `<p><a href="${myLink}">เปิดคำขอนี้ / QR ยืนยันตัว</a></p>` +
        `<p style="color:#888;font-size:13px">ของหายหรือเสียหายระหว่างยืม ผู้ยืมรับผิดชอบเต็มราคา · ` +
        `คืนให้ตรงกำหนด ถ้ายังค้างเลยกำหนดจะยืมชิ้นใหม่ไม่ได้</p>`
    );
    try {
      await sendOne(env, me.email, `ส่งคำขอยืมอุปกรณ์แล้ว — รหัส ${requestId}`, text, html);
      results.borrower = "sent";
    } catch (e) {
      results.borrower = `${e?.code || "error"}: ${String(e?.message || e).slice(0, 100)}`;
    }
  }

  // ── ถึงกรรมการ ──────────────────────────────────────────────
  {
    const who = `${me.name}${nick}`;
    const text = [
      `คำขอยืมใหม่จาก ${who}`,
      [me.studentId, me.phone, me.email].filter(Boolean).join(" · "),
      "",
      ...items.map((i) => `· ${i}`),
      "",
      `ยืม ${range}`,
      r0.usageType ? `ประเภท ${r0.usageType}` : "",
      r0.usageReason ? `เพื่อ ${r0.usageReason}` : "",
      r0.overnight ? `⚠ ยืมข้ามคืน — เก็บไว้ที่ ${r0.overnightStorage}` : "",
      "",
      `รหัสคำขอ ${requestId}`,
      `อนุมัติได้เลยที่หน้าภาพรวม ไม่ต้องสแกน: ${SITE}/overview/`,
    ]
      .filter((l, i, a) => l !== "" || a[i - 1] !== "")
      .join("\n");
    const html = wrapHtml(
      `<p>คำขอยืมใหม่จาก <b>${esc(who)}</b></p>` +
        `<p style="color:#666">${esc([me.studentId, me.phone, me.email].filter(Boolean).join(" · "))}</p>` +
        `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` +
        `<p>ยืม ${esc(range)}</p>` +
        (r0.usageType ? `<p>ประเภท ${esc(r0.usageType)}</p>` : "") +
        (r0.usageReason ? `<p>เพื่อ ${esc(r0.usageReason)}</p>` : "") +
        (r0.overnight ? `<p style="color:#b45309"><b>ยืมข้ามคืน</b> — เก็บไว้ที่ ${esc(r0.overnightStorage)}</p>` : "") +
        `<p>รหัสคำขอ <code style="font-size:16px;letter-spacing:2px">${esc(requestId)}</code></p>` +
        `<p><a href="${SITE}/overview/">อนุมัติได้เลยที่หน้าภาพรวม</a> (ไม่ต้องสแกน)</p>`
    );
    const subject = `${r0.overnight ? "🌙 ยืมข้ามคืน: " : "คำขอยืมใหม่: "}${who} (${items.length} ชิ้น)`;
    try {
      await sendOne(env, env.NOTIFY_TO, subject, text, html);
      results.admin = "sent";
    } catch (e) {
      results.admin = `${e?.code || "error"}: ${String(e?.message || e).slice(0, 100)}`;
    }
  }

  const ok = results.admin === "sent" && (results.borrower === "sent" || !me.email);
  // ส่งไม่ออกเลยสักฉบับ = ปลดล็อกกันซ้ำ ให้ลองใหม่ได้
  if (results.admin !== "sent" && results.borrower !== "sent" && env.NOTIFY_SENT) {
    await env.NOTIFY_SENT.delete(dedupeKey);
  }
  return reply({ ok, results }, ok ? 200 : 502);
}
