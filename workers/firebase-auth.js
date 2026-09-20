/**
 * workers/firebase-auth.js — ตรวจว่าคนที่ยิงมาหา Worker เป็นใครจริง ๆ
 *
 * ทำไมเช็ค Origin อย่างเดียวไม่พอ:
 *   หัว Origin เบราว์เซอร์เป็นคนใส่ให้ แต่ curl ใส่เองได้ตามใจ
 *   เส้นทางที่ทำอะไรแทนชุมนุมได้ (ส่งอีเมลจากบัญชีชุมนุม, อ่านเอกสารบน NAS)
 *   จึงต้องตรวจลายเซ็น ID token จริง ไม่ใช่เชื่อหัวที่ปลอมได้
 *
 * ใช้ปลายทาง JWKS (รูปแบบ JWK) ไม่ใช่ x509 เพราะ importKey("jwk") ใช้ได้ตรง ๆ
 * ส่วน x509 ต้องแกะ ASN.1 เองซึ่งพังง่ายกว่ามาก
 */
import { getAccessToken, getDocFields } from "./cron-reminders.js";

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
export async function verifyIdToken(idToken, projectId) {
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

/** ดึง uid จากหัว Authorization: Bearer <idToken> */
export async function uidFromRequest(request, env) {
  if (!env.FIREBASE_PROJECT_ID) throw new Error("ยังไม่ได้ตั้ง FIREBASE_PROJECT_ID ใน wrangler.toml");
  const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  return verifyIdToken(bearer, env.FIREBASE_PROJECT_ID);
}

/**
 * ตรวจว่าเป็นกรรมการจริง — โยน Error ถ้าไม่ใช่
 *
 * บทบาทอยู่ในเอกสาร users/{uid} ไม่ใช่ custom claim (แอปเป็น static export
 * ไม่มีเซิร์ฟเวอร์ไว้ตั้ง claim) จึงต้องอ่าน Firestore ด้วย service account
 * @returns ข้อมูลผู้ใช้ที่อ่านมาได้ เผื่อผู้เรียกอยากใช้ชื่อ/อีเมลต่อ
 */
export async function requireAdmin(request, env) {
  const uid = await uidFromRequest(request, env);
  if (!env.SERVICE_ACCOUNT) throw new Error("ยังไม่ได้ตั้ง SERVICE_ACCOUNT บน worker — รัน npm run worker:sa");

  const token = await getAccessToken(env.SERVICE_ACCOUNT);
  const u = await getDocFields(token, `users/${uid}`);
  if (!u) throw new Error("ไม่พบบัญชีผู้ใช้");
  if (u.disabled === true) throw new Error("บัญชีถูกระงับ");
  if (u.role !== "admin" && u.role !== "super_admin") throw new Error("ต้องเป็นกรรมการเท่านั้น");

  return { uid, ...u };
}
