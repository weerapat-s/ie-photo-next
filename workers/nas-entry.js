/**
 * workers/nas-entry.js — Worker ตัวเล็กที่ทำหน้าที่เดียว: รูปเอกสารการยืมบน NAS
 *
 * ทำไมแยกออกมาจาก okmd-proxy:
 *   okmd-proxy อยู่บัญชี Cloudflare ของชุมนุม (Wooden Date / 18d2d741…) ซึ่งตอนนี้
 *   ไม่มีใครในทีมเข้าได้ — บัญชีที่ใช้งานอยู่ไม่ได้เป็นสมาชิกของบัญชีนั้น (ตรวจแล้ว
 *   ในหน้าเลือกบัญชีของ dashboard มีแค่บัญชีส่วนตัว)
 *
 *   ย้าย okmd-proxy ทั้งตัวต้องตั้ง secret ใหม่ 5 ตัว และเปลี่ยนปลายทาง AI ของทุกคน
 *   ส่วน /nas ต้องการแค่ NAS_SHARE_TOKEN ตัวเดียว (ตรวจ ID token ด้วย JWKS สาธารณะ
 *   ของ Google ไม่ต้องใช้ service account) จึงแยกเฉพาะส่วนนี้ออกมาก่อน
 *   AI, /send, cron ยังวิ่งที่ okmd-proxy ตัวเดิมตามปกติ
 *
 * ถ้าวันหนึ่งกลับเข้าบัญชีชุมนุมได้ ย้าย /nas กลับไปรวมกับ okmd-proxy ได้เลย
 * (โค้ด handleNas ตัวเดียวกัน) แล้วลบไฟล์นี้กับ wrangler.nas.toml ทิ้ง
 *
 * deploy:  npm run worker:nas-deploy
 * secret:  npm run worker:nas
 */
import { handleNas } from "./nas-files.js";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "";
    const originOk = origin === allowed;

    const cors = {
      "Access-Control-Allow-Origin": allowed,
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // ด่านแรกกันเว็บอื่นเอาไปใช้ — ด่านจริงคือการตรวจ ID token ใน handleNas
    // เพราะ Origin ปลอมได้ถ้ายิงจากนอกเบราว์เซอร์
    if (!originOk) {
      return new Response(JSON.stringify({ error: "origin not allowed" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const res = await handleNas(request, env, cors);
    if (res) return res;

    return new Response(JSON.stringify({ error: "ไม่รู้จักเส้นทางนี้" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  },
};
