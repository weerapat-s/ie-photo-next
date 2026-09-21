// nas/push/server.mjs — ตัวส่ง Web Push ของ IE-Photo (container iephoto-push บน NAS)
//
// PocketBase (JSVM) เข้ารหัสแบบที่ Web Push ต้องใช้ไม่ได้ (ECDH P-256 + AES-GCM + ลายเซ็น VAPID)
// จึงแยกตัวส่งออกมาเป็น Node ตัวเล็กที่ใช้ไลบรารี web-push ตัวเดิม (เหมือน scripts/send-notifications.cjs)
//
// ฟังเฉพาะในเครือข่าย docker "iephoto" — ไม่เปิดพอร์ตออกเครื่อง ไม่มีทางยิงจากนอก NAS
// คนเรียกมีคนเดียวคือ hook ตามเวลาของ PocketBase (nas/pb_hooks/ie_cron.js)
//
// POST /push  { subscription, payload }  →  { status: "sent" | "gone" | "error" }
//   gone = เครื่องนั้นยกเลิกรับแจ้งเตือนแล้ว (404/410) ให้ผู้เรียกลบ subscription ทิ้ง
import http from "node:http";
import webpush from "web-push";

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("ต้องตั้ง VAPID_PUBLIC_KEY และ VAPID_PRIVATE_KEY");
  process.exit(1);
}
webpush.setVapidDetails("https://iephoto.ienas.site", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const reply = (res, obj) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
};

http
  .createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") return reply(res, { ok: true });
    if (req.method !== "POST" || req.url !== "/push") {
      res.writeHead(404);
      return res.end();
    }
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 64 * 1024) return reply(res, { status: "error", error: "body ใหญ่เกิน" });
    }
    try {
      const { subscription, payload } = JSON.parse(body);
      await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 6 * 3600 });
      reply(res, { status: "sent" });
    } catch (e) {
      const gone = e?.statusCode === 404 || e?.statusCode === 410;
      reply(res, { status: gone ? "gone" : "error", error: String(e?.message || e).slice(0, 200) });
    }
  })
  .listen(8097, () => console.log("iephoto-push ฟังที่ :8097"));
