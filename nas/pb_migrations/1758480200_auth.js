/// <reference path="../pb_data/types.d.ts" />
// ตั้งค่าการล็อกอินของสมาชิก + กันยิงรหัสผ่านรัว ๆ
//
// ═══ บัญชีที่ย้ายมาจาก Firebase ═══════════════════════════════════
//
// รหัสผ่านใน Firebase ย้ายออกมาไม่ได้ (Google เก็บเป็น hash แบบของตัวเอง)
// บัญชีที่ย้ายมาจึงมี legacyAuth = true กับรหัสสุ่มที่ไม่มีใครรู้
// ล็อกอินครั้งแรกด้วยรหัสเดิม → /api/ie/legacy-login ถามรหัสนั้นกับ Firebase ตรง ๆ
// ถ้าถูก ตั้งเป็นรหัสบน NAS แล้วปิด legacyAuth — ครั้งต่อไปล็อกอินกับ NAS ล้วน ๆ
// สมาชิกไม่ต้องทำอะไรเพิ่ม ไม่ต้องรีเซ็ตรหัส (ดู pb_hooks/ie_auth.js)
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    // hidden: API ไม่ส่งค่านี้ออกไป และคนทั่วไปแก้ไม่ได้ — มีแค่ hook กับสคริปต์ย้ายข้อมูลที่แตะ
    users.fields.add(new Field({ name: "legacyAuth", type: "bool", hidden: true }));

    // Firebase ยอมรหัส 6 ตัว — บัญชีเดิมที่ใช้รหัสสั้นต้องล็อกอินได้เหมือนเดิม
    users.fields.getByName("password").min = 6;

    // ล็อกอินค้างไว้ 30 วัน (เว็บต่ออายุให้เองทุกครั้งที่เปิด) — ใกล้เคียง Firebase ที่ไม่หลุดเอง
    users.authToken.duration = 30 * 24 * 3600;

    // ลิงก์ตั้งรหัสใหม่ชี้ไปหน้าของเว็บเอง (app/(auth)/reset-password) ไม่ใช่หน้าแอดมินของ PocketBase
    users.resetPasswordTemplate.subject = "ตั้งรหัสผ่านใหม่ — {APP_NAME}";
    users.resetPasswordTemplate.body =
      "<p>สวัสดี</p>" +
      "<p>มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชี {APP_NAME} ของคุณ กดลิงก์ด้านล่างเพื่อตั้งรหัสใหม่</p>" +
      '<p><a href="{APP_URL}/reset-password/?token={TOKEN}">ตั้งรหัสผ่านใหม่</a></p>' +
      "<p>ลิงก์ใช้ได้ 30 นาที ถ้าไม่ได้ขอเอง ไม่ต้องทำอะไร รหัสเดิมยังใช้ได้ตามปกติ</p>";

    app.save(users);

    const s = app.settings();
    // เว็บเข้ามาทาง Cloudflare Tunnel — PocketBase เห็นทุกคนเป็น 127.0.0.1
    // ต้องอ่าน IP จริงจากหัวที่ Cloudflare ใส่มา ไม่งั้น rate limit จะนับทุกคนรวมกันเป็นคนเดียว
    s.trustedProxy.headers = ["CF-Connecting-IP"];
    s.rateLimits.enabled = true;
    s.rateLimits.rules = [
      // ล็อกอิน/ตั้งรหัส — กันเดารหัสผ่าน
      { label: "*:auth", maxRequests: 10, duration: 60 },
      { label: "/api/ie/legacy-login", maxRequests: 5, duration: 60 },
      { label: "*:requestPasswordReset", maxRequests: 3, duration: 300 },
      // สมัคร/ส่งคำขอ — กันสแปม
      { label: "*:create", maxRequests: 30, duration: 10 },
      // ภาพรวมทั้ง API (หน้าแอดมินเปิดหลายตารางพร้อมกันได้สบาย)
      { label: "/api/", maxRequests: 600, duration: 10 },
    ];
    app.save(s);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    if (users.fields.getByName("legacyAuth")) users.fields.removeByName("legacyAuth");
    app.save(users);
  }
);
