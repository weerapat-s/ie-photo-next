/**
 * workers/pb-auth.js — ตรวจว่าคนที่ยิงมาหา Worker เป็นใคร ด้วยการถาม PocketBase บน NAS
 *
 * token ของ PocketBase เซ็นด้วยกุญแจลับที่อยู่บน NAS เท่านั้น Worker ตรวจลายเซ็นเองไม่ได้
 * จึงส่ง token กลับไปให้ NAS ยืนยัน (auth-refresh) — ผ่าน = ได้ข้อมูลบัญชีตัวจริงกลับมา
 * (บทบาท ชื่อ อีเมล มาจากฐานข้อมูล ไม่ใช่จากสิ่งที่ผู้ยิงบอก)
 *
 * รองรับสองแบบ:
 *   • สมาชิก/กรรมการที่ล็อกอินเว็บ   (ตาราง users)
 *   • ระบบบน NAS เอง (hook ส่งอีเมลตั้งรหัสใหม่/แจ้งเตือนตามเวลา) ใช้ token ของ superuser
 *
 * จำผลไว้ 5 นาทีต่อ token — กดส่งหลายฉบับติดกันไม่ต้องถาม NAS ทุกฉบับ
 */

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function refresh(env, collection, token) {
  const res = await fetch(`${env.PB_URL}/api/collections/${collection}/auth-refresh`, {
    method: "POST",
    headers: { Authorization: token },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.record ?? null;
}

/**
 * @returns {Promise<{ kind: "user" | "superuser", record: Record<string, any>, token: string }>}
 * โยน Error ถ้า token ใช้ไม่ได้
 */
export async function pbIdentity(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("ไม่มี token");
  if (!env.PB_URL) throw new Error("ยังไม่ได้ตั้ง PB_URL ใน wrangler.nas.toml");

  const key = await sha256(token);
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.ident;

  let ident = null;
  const user = await refresh(env, "users", token);
  if (user) ident = { kind: "user", record: user, token };
  else {
    const su = await refresh(env, "_superusers", token);
    if (su) ident = { kind: "superuser", record: su, token };
  }
  if (!ident) throw new Error("token ไม่ถูกต้องหรือหมดอายุ");

  if (cache.size > 500) cache.clear();
  cache.set(key, { ident, until: Date.now() + CACHE_MS });
  return ident;
}

export function isAdminIdent(ident) {
  if (ident.kind === "superuser") return true;
  const role = ident.record?.role;
  return role === "admin" || role === "super_admin";
}
