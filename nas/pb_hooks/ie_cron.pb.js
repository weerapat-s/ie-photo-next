/// <reference path="../pb_data/types.d.ts" />
// nas/pb_hooks/ie_cron.pb.js — ตั้งเวลาแจ้งเตือน (ตัวจริงอยู่ใน ie_cron.js)
// เวลาของ cron ใน PocketBase เป็น UTC — 01:00 UTC = 08:00 น. เวลาไทย

// push ใกล้ถึงเวลา + แจ้งคำขอใหม่เข้า Discord (เท่ากับ GitHub Actions เดิม)
cronAdd("ie-every-half-hour", "*/30 * * * *", () => {
  require(`${__hooks}/ie_cron.js`).everyHalfHour($app);
});

// อีเมลเตือนประจำวัน + สรุปของค้างเลยกำหนดเข้า Discord
cronAdd("ie-morning", "0 1 * * *", () => {
  require(`${__hooks}/ie_cron.js`).morning($app);
});

// สั่งรันเองได้ (superuser เท่านั้น) — ไว้ทดสอบหลังแก้ ไม่ต้องรอถึงเวลา
//   POST /api/ie/cron/every-half-hour   POST /api/ie/cron/morning
routerAdd(
  "POST",
  "/api/ie/cron/{job}",
  (e) => {
    const job = e.request.pathValue("job");
    const cron = require(`${__hooks}/ie_cron.js`);
    if (job === "every-half-hour") cron.everyHalfHour(e.app);
    else if (job === "morning") cron.morning(e.app);
    else return e.json(404, { error: "ไม่รู้จักงานนี้" });
    return e.json(200, { ok: true });
  },
  $apis.requireSuperuserAuth()
);
