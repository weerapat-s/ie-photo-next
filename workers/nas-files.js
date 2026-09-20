/**
 * workers/nas-files.js — เก็บรูปเอกสารการยืมไว้บน Nextcloud (NAS ของชุมนุม) แทน Firestore
 *
 * ทำไมต้องมี:
 *   1. เดิมรูปเอกสาร/รูปตอนคืนถูกบีบเป็น base64 แล้วฝังลงเอกสาร booking ตรง ๆ
 *      Firestore รุ่นที่ชุมนุมใช้คิดโควตาอ่านเป็น "read unit" ตามขนาดเอกสาร (~4KB/unit)
 *      booking ใบเดียวที่มีรูป 500KB จึงกินโควตาเท่าอ่านเอกสารเปล่า ~125 ใบ
 *      แค่เปิดหน้ารายการไม่กี่รอบก็หมดโควตารายวัน
 *   2. Nextcloud public share ยิงตรงจากเบราว์เซอร์ไม่ได้ — preflight ตอบ 401
 *      และไม่มีหัว Access-Control-* (ตรวจแล้วด้วย curl)
 *   3. สำคัญกว่าข้อ 2: token ของ share = สิทธิ์เต็มของโฟลเดอร์นั้น
 *      ใครได้ token ไป PROPFIND ก็ไล่ดูรายชื่อไฟล์และโหลดเอกสารของทุกคนได้หมด
 *      (ทดสอบแล้ว: PROPFIND Depth:1 คืนรายชื่อไฟล์จริง)
 *      ถ้าเอา token ใส่ในบันเดิล JS ของ static export = ใครเปิด view-source ก็ได้ไปเลย
 *
 * Worker จึงถือ token ไว้ฝั่งเซิร์ฟเวอร์ และให้ผ่านเฉพาะคนที่ล็อกอิน Firebase แล้วจริง
 * (ตรวจลายเซ็น ID token กับกุญแจสาธารณะของ Google ทุกครั้ง ไม่ได้เชื่อแค่ว่ามี header มา)
 *
 * ตั้งค่า:
 *   wrangler.toml [vars]  NAS_WEBDAV_BASE, FIREBASE_PROJECT_ID
 *   secret                npm run worker:nas     ← วาง token ของ share แล้ว Enter
 *
 * เส้นทาง:
 *   POST /nas/upload?kind=form|return   body = ไบต์รูปดิบ, Authorization: Bearer <idToken>
 *                                       คืน { path }
 *   GET  /nas/file?p=<path>             Authorization: Bearer <idToken>
 *                                       คืนไบต์รูป (เบราว์เซอร์ต้อง fetch เป็น blob
 *                                       เพราะ <img src> ส่งหัว Authorization ไม่ได้)
 */

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

/** รูปแบบ path ที่ยอมรับ — กัน ../ และกันไล่เดาไฟล์คนอื่น */
const PATH_RE = /^borrow\/\d{4}-\d{2}\/(form|return)-[A-Za-z0-9_-]{16,32}\.jpg$/;

/* ── ตรวจ Firebase ID token ────────────────────────────────────────
 * ใช้ JWKS (รูปแบบ JWK) ไม่ใช่ปลายทาง x509 เพราะ importKey("jwk") ใช้ได้ตรง ๆ
 * ส่วน x509 ต้องแกะ ASN.1 เองซึ่งพังง่ายกว่ามาก
 */
const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let jwksCache = { keys: null, expires: 0 };

async function getJwks() {
  const now = Date.now();
  if (jwksCache.keys && now < jwksCache.expires) return jwksCache.keys;

  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  const body = await res.json();

  // Google บอกอายุมาใน Cache-Control — เคารพตามนั้น เผื่อมีการหมุนกุญแจ
  const cc = res.headers.get("Cache-Control") || "";
  const maxAge = Number((cc.match(/max-age=(\d+)/) || [])[1] || 3600);
  jwksCache = { keys: body.keys || [], expires: now + maxAge * 1000 };
  return jwksCache.keys;
}

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

/**
 * คืน uid ถ้า token ใช้ได้จริง — โยน Error ถ้าไม่ผ่าน
 * ตรวจครบทั้งลายเซ็น, aud, iss, exp, sub ตามที่เอกสาร Firebase กำหนด
 */
async function verifyIdToken(idToken, projectId) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("รูปแบบ token ไม่ถูกต้อง");

  const header = b64urlToJson(parts[0]);
  const payload = b64urlToJson(parts[1]);

  if (header.alg !== "RS256") throw new Error("alg ต้องเป็น RS256");

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= now) throw new Error("token หมดอายุ");
  if (payload.iat && payload.iat > now + 300) throw new Error("iat อยู่ในอนาคต");
  if (payload.aud !== projectId) throw new Error("aud ไม่ตรงโปรเจกต์");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("iss ไม่ถูกต้อง");
  if (!payload.sub) throw new Error("ไม่มี sub");

  const jwk = (await getJwks()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("ไม่พบกุญแจที่ตรงกับ kid");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!ok) throw new Error("ลายเซ็นไม่ถูกต้อง");

  return payload.sub;
}

/* ── Nextcloud ──────────────────────────────────────────────────── */

/** token ของ share ใช้เป็น "ชื่อผู้ใช้" ของ Basic auth รหัสผ่านว่าง */
function nasAuth(env) {
  return `Basic ${btoa(`${env.NAS_SHARE_TOKEN}:`)}`;
}

function nasUrl(env, path) {
  const base = String(env.NAS_WEBDAV_BASE || "").replace(/\/+$/, "");
  return `${base}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function randomName(kind) {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return `${kind}-${s.slice(0, 24)}.jpg`;
}

/** สร้างโฟลเดอร์ทีละชั้น — Nextcloud ไม่สร้าง parent ให้อัตโนมัติ
 *  405 = มีอยู่แล้ว ถือว่าผ่าน */
async function ensureDir(env, dir) {
  const parts = dir.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const sub = parts.slice(0, i).join("/");
    const res = await fetch(nasUrl(env, sub), {
      method: "MKCOL",
      headers: { Authorization: nasAuth(env) },
    });
    if (!res.ok && res.status !== 405) throw new Error(`MKCOL ${sub} ${res.status}`);
  }
}

/* ── ตัวจัดการเส้นทาง ───────────────────────────────────────────── */

/**
 * คืน Response ถ้าเส้นทางเป็นของ /nas — คืน null ถ้าไม่ใช่ เพื่อให้ Worker หลักทำต่อ
 * @param {Request} request
 * @param {Record<string, string>} env
 * @param {Record<string, string>} cors หัว CORS ที่ Worker หลักคำนวณไว้แล้ว
 */
export async function handleNas(request, env, cors) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/nas/")) return null;

  const reply = (obj, status) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
    });

  if (!env.NAS_SHARE_TOKEN || !env.NAS_WEBDAV_BASE) {
    return reply({ error: "ยังไม่ได้ตั้งค่า NAS บน worker — รัน npm run worker:nas" }, 503);
  }
  if (!env.FIREBASE_PROJECT_ID) {
    return reply({ error: "ยังไม่ได้ตั้ง FIREBASE_PROJECT_ID ใน wrangler.toml" }, 503);
  }

  const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  let uid;
  try {
    uid = await verifyIdToken(bearer, env.FIREBASE_PROJECT_ID);
  } catch (e) {
    return reply({ error: `ยืนยันตัวตนไม่ผ่าน: ${String(e.message || e).slice(0, 120)}` }, 401);
  }

  // ── อัปโหลด ──────────────────────────────────────────────────
  if (url.pathname === "/nas/upload") {
    if (request.method !== "POST") return reply({ error: "POST only" }, 405);

    const kind = url.searchParams.get("kind") === "return" ? "return" : "form";
    const body = await request.arrayBuffer();
    if (body.byteLength === 0) return reply({ error: "ไฟล์ว่าง" }, 400);
    if (body.byteLength > MAX_UPLOAD_BYTES) {
      return reply({ error: `ไฟล์ใหญ่เกิน ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` }, 413);
    }

    const now = new Date();
    const dir = `borrow/${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const path = `${dir}/${randomName(kind)}`;

    const put = () =>
      fetch(nasUrl(env, path), {
        method: "PUT",
        headers: { Authorization: nasAuth(env), "Content-Type": "image/jpeg" },
        body,
      });

    let res = await put();
    // 409 = โฟลเดอร์เดือนนี้ยังไม่มี — สร้างแล้วลองใหม่ครั้งเดียว
    if (res.status === 409) {
      await ensureDir(env, dir);
      res = await put();
    }
    if (!res.ok) {
      return reply({ error: `อัปขึ้น NAS ไม่สำเร็จ (${res.status})` }, 502);
    }

    console.log(`nas upload ok uid=${uid} path=${path} bytes=${body.byteLength}`);
    return reply({ path }, 200);
  }

  // ── อ่านกลับ ─────────────────────────────────────────────────
  if (url.pathname === "/nas/file") {
    if (request.method !== "GET") return reply({ error: "GET only" }, 405);

    const path = url.searchParams.get("p") || "";
    if (!PATH_RE.test(path)) return reply({ error: "path ไม่ถูกต้อง" }, 400);

    const res = await fetch(nasUrl(env, path), { headers: { Authorization: nasAuth(env) } });
    if (!res.ok) return reply({ error: `อ่านจาก NAS ไม่สำเร็จ (${res.status})` }, res.status === 404 ? 404 : 502);

    return new Response(res.body, {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": res.headers.get("Content-Type") || "image/jpeg",
        // private: เป็นเอกสารของสมาชิก ห้าม CDN กลางเก็บไว้แจกต่อ
        "Cache-Control": "private, max-age=600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return reply({ error: "ไม่รู้จักเส้นทางนี้" }, 404);
}
