/**
 * workers/okmd-proxy.js — Cloudflare Worker วางหน้า OKMD AI Playground
 *
 * ทำไมต้องมี:
 *   1. gen.ai.kku.ac.th ไม่ส่งหัว Access-Control-Allow-Origin กลับมา
 *      เบราว์เซอร์จึงบล็อกการเรียกตรงจาก https://iephoto.web.app
 *      (ตรวจแล้ว: preflight ได้ 204 แต่ไม่มีหัว CORS → fetch ล้มด้วย "Failed to fetch")
 *   2. แอปนี้เป็น static export ไม่มีเซิร์ฟเวอร์ของตัวเอง ถ้าฝังคีย์ลงไฟล์ JS
 *      ใครเปิด view-source ก็เอาคีย์ไปใช้ได้ทันที
 *
 * Worker นี้ถือคีย์ไว้ฝั่งเซิร์ฟเวอร์ รับเฉพาะคำขอจากโดเมนที่อนุญาต แล้วเติมหัว CORS ให้
 * คีย์จึงไม่เคยเดินทางมาถึงเบราว์เซอร์เลย
 *
 * สถานะตอนนี้: https://okmd-proxy.wooden-date.workers.dev (claim เข้าบัญชีชุมนุมแล้ว)
 * แต่ตัวที่รันอยู่บนนั้นยังเป็นโค้ดรุ่นแรก — **ยังไม่มี /send และยังไม่มีคีย์ฝั่งเซิร์ฟเวอร์**
 * ต้องรัน worker:deploy + worker:key + worker:mail ถึงจะครบตามไฟล์นี้
 * ตัวแอปตั้งค่านี้เป็นปลายทางเริ่มต้นให้อยู่แล้ว (ดู DEFAULT_BASE_URL ใน lib/ai/client.ts)
 *
 * ขั้นที่ควรทำต่อ — ย้ายคีย์มาเก็บฝั่ง Worker เพื่อไม่ให้คีย์ผ่านเบราว์เซอร์:
 *   npm run worker:login    ← ล็อกอิน Cloudflare ครั้งเดียว
 *   npm run worker:key      ← วางคีย์ OKMD แล้ว Enter (เก็บเป็น Secret)
 * จากนั้นลบคีย์ออกจากช่อง API key ในหน้า ตั้งค่า → ผู้ช่วย AI
 * (โค้ดรองรับทั้งสองแบบ: มี Secret ใช้ Secret · ไม่มีก็ส่งต่อ Authorization ที่ client ส่งมา)
 *
 * แก้โค้ดแล้วเผยแพร่ใหม่: npm run worker:deploy
 *
 * หมายเหตุความปลอดภัย: Origin ปลอมได้ถ้าเรียกจากนอกเบราว์เซอร์ ตัวกรองนี้กัน
 * เว็บอื่นเอา Worker ไปใช้ต่อได้ แต่ไม่ได้กันคนที่ยิง curl ตรง ๆ
 * ถ้าต้องการแน่นกว่านี้ ให้ตั้ง CLUB_TOKEN เพิ่ม แล้วให้แอปส่งหัว X-Club-Token มาด้วย
 */

import { runReminders } from "./cron-reminders.js";

const UPSTREAM = "https://gen.ai.kku.ac.th/okmd/api/v1";

/** เส้นทางที่ยอมให้ผ่าน — กันไม่ให้ Worker กลายเป็น proxy เปิดสำหรับทุกอย่าง */
const ALLOWED_PATHS = ["/chat/completions", "/models"];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "*";
    const originOk = allowed === "*" || origin === allowed;

    const cors = {
      "Access-Control-Allow-Origin": originOk ? origin || allowed : allowed,
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Club-Token",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // กดรันเตือนด้วยมือเพื่อทดสอบ (ไม่ต้องรอ cron) — server-to-server ไม่มี Origin
    // จึงกันด้วย CRON_TOKEN แทนการเช็ค origin
    if (new URL(request.url).pathname === "/run-reminders") {
      if (!env.CRON_TOKEN || request.headers.get("X-Cron-Token") !== env.CRON_TOKEN) {
        return json({ error: { message: "unauthorized" } }, 401, {});
      }
      try {
        const result = await runReminders(env, (to, subject, body) => sendResend(env, to, subject, body));
        return json(result, 200, {});
      } catch (e) {
        return json({ error: { message: String(e).slice(0, 300) } }, 500, {});
      }
    }

    if (!originOk) {
      return json({ error: { message: "origin not allowed" } }, 403, cors);
    }

    // ถ้าตั้ง CLUB_TOKEN ไว้ ต้องส่งมาให้ตรงเท่านั้น
    if (env.CLUB_TOKEN && request.headers.get("X-Club-Token") !== env.CLUB_TOKEN) {
      return json({ error: { message: "bad club token" } }, 401, cors);
    }

    const url = new URL(request.url);

    // ── /send — ส่งอีเมลแจ้งเตือน ────────────────────────────────
    // แยกจากเส้นทาง AI เพราะใช้คีย์คนละตัว (ผู้ให้บริการอีเมล ไม่ใช่ OKMD)
    // ตั้งคีย์ด้วย: npm run worker:mail
    if (url.pathname === "/send") {
      if (request.method !== "POST") return json({ error: { message: "POST only" } }, 405, cors);
      if (!env.RESEND_API_KEY) {
        return json(
          { error: { message: "ยังไม่ได้ตั้ง RESEND_API_KEY บน worker — รัน npm run worker:mail" } },
          503,
          cors
        );
      }
      let mail;
      try {
        mail = await request.json();
      } catch {
        return json({ error: { message: "bad json" } }, 400, cors);
      }
      if (!mail?.to || !mail?.subject || !mail?.body) {
        return json({ error: { message: "ต้องมี to, subject, body" } }, 400, cors);
      }
      try {
        await sendResend(env, mail.to, mail.subject, mail.body);
        return json({ ok: true }, 200, cors);
      } catch (e) {
        return json({ error: { message: String(e).slice(0, 300) } }, 502, cors);
      }
    }

    // ตัด /v1 นำหน้าออก เพื่อให้ client ตั้ง baseUrl เป็น <worker>/v1 ได้ตามมาตรฐาน OpenAI
    const path = url.pathname.replace(/^\/v1/, "") || "/";
    if (!ALLOWED_PATHS.includes(path)) {
      return json({ error: { message: `path not allowed: ${path}` } }, 404, cors);
    }

    // ทางที่ดีที่สุด: Worker ถือคีย์เอง (ตั้งเป็น Secret) คีย์ไม่ต้องผ่านเบราว์เซอร์เลย
    // ถ้ายังไม่ได้ตั้ง จะยอมส่งต่อ Authorization ที่ client ส่งมาแทน
    // (ใช้ตอนทดลอง — แต่แปลว่าคีย์เดินทางผ่านเบราว์เซอร์ ควรตั้ง Secret ให้เร็วที่สุด)
    const auth = env.OKMD_API_KEY
      ? `Bearer ${env.OKMD_API_KEY}`
      : request.headers.get("Authorization");
    if (!auth) {
      return json(
        { error: { message: "ยังไม่ได้ตั้ง OKMD_API_KEY บน worker และไม่มี Authorization ส่งมา" } },
        401,
        cors
      );
    }

    const upstream = await fetch(UPSTREAM + path, {
      method: request.method,
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: request.method === "POST" ? await request.text() : undefined,
    });

    // ส่งต่อทั้งสถานะและเนื้อหา เพื่อให้ฝั่งแอปแยก 401 / 429 (โควตาหมด) ได้ถูก
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...cors,
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
      },
    });
  },

  // ── Cron: เตือนอัตโนมัติตามเวลา (ตั้งใน wrangler.toml) ──────────
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runReminders(env, (to, subject, body) => sendResend(env, to, subject, body))
        .then((r) => console.log("cron reminders:", JSON.stringify(r)))
        .catch((e) => console.log("cron failed:", String(e).slice(0, 200)))
    );
  },
};

/** ส่งอีเมลผ่าน Resend — ใช้ร่วมกันทั้ง /send และ cron
 *  คืน true ถ้าปลายทางรับ (ส่งตรงหรือส่งต่อเข้ากล่องกลางสำเร็จ) */
async function sendResend(env, to, subject, body) {
  const from = env.MAIL_FROM || "IE-Photo <onboarding@resend.dev>";
  const call = (recipient, subj, text) =>
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({ from, to: [recipient], subject: subj, text }),
    });

  let res = await call(String(to).slice(0, 200), String(subject).slice(0, 200), String(body).slice(0, 4000));
  if (res.status === 403 && env.MAIL_FALLBACK_TO && to !== env.MAIL_FALLBACK_TO) {
    const note =
      `[ส่งต่อจากระบบ] อีเมลนี้ตั้งใจส่งถึง: ${to}\n` +
      `ส่งตรงไม่ได้เพราะยังไม่ได้ยืนยันโดเมน กรุณาส่งต่อให้เจ้าตัว\n\n${"─".repeat(40)}\n\n`;
    res = await call(env.MAIL_FALLBACK_TO, `[ถึง ${to}] ${subject}`, note + body);
  }
  if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 120)}`);
  return true;
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
