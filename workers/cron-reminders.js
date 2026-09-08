// workers/cron-reminders.js — เตือนอัตโนมัติทางอีเมลด้วย Cron (ไม่ต้องมีใครเปิดแอป)
//
// สถาปัตยกรรม: แอปเป็น static export ไม่มีเซิร์ฟเวอร์คอยตื่นมาเช็ค เดิมจึงกวาด
// หาของที่ถึงกำหนดตอนกรรมการเปิดแอป (components/reminder-sweep.tsx) — ถ้าไม่มีใคร
// เปิดแอปทั้งวัน อีเมลเตือนก็ไม่ออก
//
// ตัวนี้รันบน Cloudflare Worker ตามเวลา (cron) อ่าน Firestore เองผ่าน service
// account (ข้ามกติกาได้เพราะเป็นสิทธิ์ระดับเซิร์ฟเวอร์) แล้วส่งอีเมลผ่าน Resend
//
// กันส่งซ้ำด้วยคีย์ kind:refId:uid:วัน (เวลาไทย) — ใช้คีย์เดียวกับฝั่งแอป
// ทั้งสองทางจึงไม่ส่งซ้ำกัน (แอปเปิดตอนกลางวัน + cron ตอนเช้า = อีเมลฉบับเดียว)

const PROJECT = "iephoto";
const DB = "default"; // named database (ไม่ใช่ "(default)")
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DB}/documents`;
const HOUR = 3_600_000;
const TZ_OFFSET = 7 * HOUR; // Asia/Bangkok = UTC+7 (ไม่มี DST)

const LEAD = { borrowHours: 24, jobHours: 24, taskDays: 2, deliveryDays: 2 };

/* ═══ Firestore REST — ถอดค่า ═══════════════════════════════════ */

/** ถอดค่า 1 ช่องจากรูปแบบของ Firestore REST เป็นค่า JS ปกติ */
function decode(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue; // เก็บ ISO ไว้ แปลง ms ทีหลัง
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decode);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields ?? {});
  return null;
}

function decodeFields(fields) {
  const o = {};
  for (const k in fields) o[k] = decode(fields[k]);
  return o;
}

/** ms จากค่า timestamp (ISO string) — null ถ้าไม่มี */
function ms(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/* ═══ service account → access token ═══════════════════════════ */

function b64urlFromString(s) {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlFromBytes(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

/** ขอ access token จาก Google ด้วย JWT ที่เซ็นด้วย service account */
async function getAccessToken(saJson) {
  const sa = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64urlFromString(JSON.stringify(header))}.${b64urlFromString(JSON.stringify(claim))}`;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64urlFromBytes(new Uint8Array(sig))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("token: " + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

/* ═══ Firestore REST — อ่าน/เขียน ══════════════════════════════ */

async function listAll(token, collection) {
  const out = [];
  let pageToken = "";
  do {
    const url = `${BASE}/${collection}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    for (const d of j.documents ?? []) out.push({ id: d.name.split("/").pop(), ...decodeFields(d.fields ?? {}) });
    pageToken = j.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

async function getDocFields(token, path) {
  const r = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const j = await r.json();
  return decodeFields(j.fields ?? {});
}

/** เขียน mailQueue 1 ใบ (บันทึกว่าเตือนแล้ว — คีย์กันส่งซ้ำอยู่ในนี้) */
async function writeMailLog(token, fields) {
  const now = new Date().toISOString();
  const body = {
    fields: {
      to: { stringValue: fields.to },
      subject: { stringValue: fields.subject.slice(0, 200) },
      body: { stringValue: fields.body.slice(0, 4000) },
      status: { stringValue: "sent" },
      kind: { stringValue: fields.kind },
      refId: { stringValue: fields.refId },
      dedupeKey: { stringValue: fields.dedupeKey },
      createdAt: { timestampValue: now },
      sentAt: { timestampValue: now },
    },
  };
  await fetch(`${BASE}/mailQueue`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* ═══ คำนวณว่าอะไรต้องเตือน (พอร์ตจาก lib/reminders.ts) ═════════ */

function hoursBetween(from, to) {
  return Math.round((to - from) / HOUR);
}

function computeReminders(now, bookings, tasks, deliveries) {
  const out = [];
  for (const b of bookings) {
    if (b.bookingType === "equipment" && b.status === "approved") {
      const due = ms(b.endAt);
      if (due == null) continue;
      const left = hoursBetween(now, due);
      const base = { refId: b.id, userIds: b.userId ? [b.userId] : [], title: b.itemName, dueMs: due, hoursLeft: left };
      if (due < now) out.push({ ...base, kind: "borrow_overdue" });
      else if (left <= LEAD.borrowHours) out.push({ ...base, kind: "borrow_due_soon" });
    }
    if (b.bookingType === "photographer" && b.status === "approved") {
      const start = ms(b.startAt);
      if (start == null || start < now) continue;
      const left = hoursBetween(now, start);
      if (left > LEAD.jobHours) continue;
      const ids = b.assigneeIds ?? [];
      if (ids.length === 0) continue;
      out.push({ kind: "job_soon", refId: b.id, userIds: ids, title: b.usageType || b.itemName, dueMs: start, hoursLeft: left, location: b.location });
    }
  }
  for (const t of tasks) {
    if (t.status === "completed" || t.status === "cancelled") continue;
    const due = ms(t.dueDate);
    if (due == null) continue;
    const left = hoursBetween(now, due);
    if (left > LEAD.taskDays * 24) continue;
    out.push({ kind: "task_due_soon", refId: t.id, userIds: t.assignedToId ? [t.assignedToId] : [], title: t.title, dueMs: due, hoursLeft: left });
  }
  for (const d of deliveries) {
    if (d.status === "delivered" || d.status === "archived") continue;
    const due = ms(d.dueAt);
    if (due == null) continue;
    const left = hoursBetween(now, due);
    if (left > LEAD.deliveryDays * 24) continue;
    const ids = (d.assigneeIds && d.assigneeIds.length ? d.assigneeIds : d.assignedToId ? [d.assignedToId] : []);
    if (ids.length === 0) continue;
    out.push({ kind: "delivery_due", refId: d.id, userIds: ids, title: d.title, dueMs: due, hoursLeft: left });
  }
  return out.sort((a, b) => a.hoursLeft - b.hoursLeft);
}

/** คีย์กันส่งซ้ำ — ต้องตรงกับ lib/reminders.ts เป๊ะ (เวลาไทย) */
function dedupeKey(r, uid, now) {
  const d = new Date(now + TZ_OFFSET); // ขยับเป็นเวลาไทยก่อนตัดวัน
  const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return `${r.kind}:${r.refId}:${uid}:${day}`;
}

function daysLate(hoursLeft) {
  return Math.max(1, Math.ceil(-hoursLeft / 24));
}

function fmtWhen(dueMs) {
  return new Date(dueMs + TZ_OFFSET)
    .toISOString()
    .replace("T", " ")
    .slice(0, 16); // YYYY-MM-DD HH:MM เวลาไทย
}

/* ═══ แม่แบบอีเมล (ย่อจาก lib/mail-templates.ts) ════════════════ */

const SITE = "https://iephoto.web.app";

function tpl(r, name, siteName, uploadLink) {
  const when = fmtWhen(r.dueMs);
  const foot = `\n\n— อีเมลเตือนอัตโนมัติ ไม่ต้องตอบกลับ\n${siteName} · ชุมนุมถ่ายภาพ IE-Photo สจล.`;
  switch (r.kind) {
    case "borrow_due_soon":
      return { subject: `[${siteName}] ใกล้ครบกำหนดคืน: ${r.title}`, body: `สวัสดี ${name}\n\nอุปกรณ์ "${r.title}" ใกล้ครบกำหนดคืน (${when})\nเหลือประมาณ ${r.hoursLeft} ชั่วโมง — ถ้ายังใช้ไม่เสร็จ ติดต่อกรรมการก่อนถึงกำหนด\n\nดูที่ ${SITE}/my${foot}` };
    case "borrow_overdue":
      return { subject: `[${siteName}] เลยกำหนดคืนแล้ว: ${r.title}`, body: `สวัสดี ${name}\n\nอุปกรณ์ "${r.title}" เลยกำหนดคืนมาแล้ว ${daysLate(r.hoursLeft)} วัน\nกรุณาคืนโดยเร็ว หรือแจ้งกรรมการว่าติดปัญหาอะไร\n\nดูที่ ${SITE}/my${foot}` };
    case "job_soon":
      return { subject: `[${siteName}] เตือนงานถ่ายใกล้ถึง: ${r.title}`, body: `สวัสดี ${name}\n\nคุณมีงานถ่าย "${r.title}" ในอีกประมาณ ${r.hoursLeft} ชั่วโมง (${when})${r.location ? `\nสถานที่: ${r.location}` : ""}\nเช็กอุปกรณ์ให้พร้อม ถ้าไปไม่ได้แจ้งกรรมการทันที\n\nดูที่ ${SITE}/calendar${foot}` };
    case "task_due_soon":
      return { subject: `[${siteName}] งานย่อยใกล้กำหนดส่ง: ${r.title}`, body: `สวัสดี ${name}\n\nงาน "${r.title}" ใกล้ถึงกำหนดส่ง (${when})\nถ้าทำไม่ทัน แจ้งกรรมการตั้งแต่ตอนนี้\n\nดูที่ ${SITE}/my${foot}` };
    case "delivery_due":
      return { subject: `[${siteName}] ไฟล์งานใกล้กำหนดส่ง: ${r.title}`, body: `สวัสดี ${name}\n\nไฟล์งาน "${r.title}" ใกล้ถึงกำหนดส่ง (${when})\nอัปไฟล์ขึ้นที่เก็บกลาง: ${uploadLink}\nแล้วกดยืนยันในระบบ\n\nดูที่ ${SITE}/my${foot}` };
    default:
      return null;
  }
}

/* ═══ ตัวรัน cron ══════════════════════════════════════════════ */

/**
 * @param env ต้องมี SERVICE_ACCOUNT (JSON คีย์) + RESEND_API_KEY
 * @param sendEmail ฟังก์ชันส่งอีเมล (ใช้ตัวเดียวกับ /send) → คืน Response
 */
export async function runReminders(env, sendEmail) {
  if (!env.SERVICE_ACCOUNT) {
    console.log("cron: ยังไม่ได้ตั้ง SERVICE_ACCOUNT — ข้าม");
    return { ok: false, reason: "no service account" };
  }
  const token = await getAccessToken(env.SERVICE_ACCOUNT);

  const settings = (await getDocFields(token, "settings/app")) ?? {};
  if (settings.notifyEmail === false) return { ok: true, sent: 0, reason: "notify off" };
  const siteName = settings.siteName || "IE-Photo";
  const uploadLink = settings.uploadLinkUrl || SITE;

  const [users, bookings, tasks, deliveries] = await Promise.all([
    listAll(token, "users"),
    listAll(token, "bookings"),
    listAll(token, "tasks"),
    listAll(token, "deliveries"),
  ]);

  const now = Date.now();
  const reminders = computeReminders(now, bookings, tasks, deliveries);
  if (reminders.length === 0) return { ok: true, sent: 0 };

  // คีย์ที่ส่งไปแล้ววันนี้ (จาก mailQueue) — กันส่งซ้ำ ทั้งจาก cron รอบก่อนและจากแอป
  const sent = new Set();
  for (const m of await listAll(token, "mailQueue")) {
    if (m.dedupeKey && ms(m.createdAt) && now - ms(m.createdAt) < 36 * HOUR) sent.add(m.dedupeKey);
  }

  const userOf = new Map(users.map((u) => [u.id, u]));
  let count = 0;

  for (const r of reminders) {
    for (const uid of r.userIds) {
      const key = dedupeKey(r, uid, now);
      if (sent.has(key)) continue;
      const u = userOf.get(uid);
      if (!u || !u.email) continue;
      const t = tpl(r, (u.nickname || u.firstName || "ทีมงาน").trim(), siteName, uploadLink);
      if (!t) continue;
      sent.add(key);
      try {
        await sendEmail(u.email, t.subject, t.body);
        await writeMailLog(token, { to: u.email, subject: t.subject, body: t.body, kind: r.kind, refId: r.refId, dedupeKey: key });
        count++;
      } catch (e) {
        console.log("cron send failed:", String(e).slice(0, 120));
      }
    }
  }
  return { ok: true, sent: count };
}
