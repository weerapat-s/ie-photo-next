// scripts/silence-firestore.cjs — หลังย้ายไป NAS: ปิดอีเมลเตือนที่ยังอ่านจาก Firestore
//
// okmd-proxy (บัญชี Cloudflare ที่ไม่มีใครเข้าได้แล้ว) มี cron ส่งอีเมลเตือนทุกเช้าจากข้อมูลใน Firestore
// ข้อมูลนั้นหยุดนิ่งแล้ว ถ้าปล่อยไว้จะเตือน "เลยกำหนดคืน" กับของที่คืนไปแล้วบน NAS ทุกวัน
// ตัว cron เช็ค settings/app.notifyEmail === false แล้วหยุดเอง — ตั้งค่านั้นใน Firestore (ไม่แตะ NAS)
//
// รัน: node --env-file=.env.local scripts/silence-firestore.cjs
const { getDb } = require("./lib-admin.cjs");

(async () => {
  await getDb().collection("settings").doc("app").set({ notifyEmail: false }, { merge: true });
  console.log("Firestore settings/app.notifyEmail = false — cron อีเมลของ okmd-proxy หยุดแล้ว");
  process.exit(0);
})().catch((e) => {
  console.error("ไม่สำเร็จ:", e.message);
  process.exit(1);
});
