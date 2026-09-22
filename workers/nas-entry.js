/**
 * workers/nas-entry.js — Worker iephoto-nas (บัญชี Cloudflare ส่วนตัว) : ส่งอีเมลของ IE-Photo
 *
 * ย้ายเว็บมาอยู่บน NAS (PocketBase) แล้ว Worker นี้เหลือหน้าที่เดียวคือส่งอีเมลจาก
 * admin@ienas.site ผ่าน Cloudflare Email Service (NAS ส่งเองไม่ได้ — ไม่มี SMTP ที่ใช้ได้)
 *
 *   POST /mail                    อีเมลทั่วไป — กรรมการ หรือระบบบน NAS   (workers/mail.js)
 *   POST /notify/assigned         แจ้งกรรมการตอนมอบหมายอุปกรณ์          (workers/notify.js)
 *   POST /notify/borrow-request   ยืนยันถึงคนยืม + แจ้งกรรมการ
 *
 * ทุกเส้นทางยืนยันตัวด้วย token ของ PocketBase — Worker ถาม NAS ว่าเป็นใคร (workers/pb-auth.js)
 * เดิมตรวจ ID token ของ Firebase และมี /nas (รูปบน Nextcloud) — เลิกใช้แล้วหลังย้ายมา NAS
 *
 * deploy:  npm run worker:nas-deploy
 */
import { handleNotify } from "./notify.js";
import { handleMail } from "./mail.js";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
    const originOk = allowed.includes(origin);

    const cors = {
      "Access-Control-Allow-Origin": originOk ? origin : allowed[0] || "",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // ด่านแรกกันเว็บอื่นเอาไปใช้ในเบราว์เซอร์ — ด่านจริงคือ token ที่ NAS ต้องยืนยัน
    // ไม่มี Origin เลย = เรียกจากเซิร์ฟเวอร์ (hook บน NAS) ให้ผ่านไปตรวจ token
    if (origin && !originOk) {
      return new Response(JSON.stringify({ error: "origin not allowed" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const res = (await handleMail(request, env, cors)) ?? (await handleNotify(request, env, cors));
    if (res) return res;

    return new Response(JSON.stringify({ error: "ไม่รู้จักเส้นทางนี้" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  },
};
