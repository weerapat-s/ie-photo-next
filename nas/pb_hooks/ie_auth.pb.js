/// <reference path="../pb_data/types.d.ts" />
// nas/pb_hooks/ie_auth.pb.js — เส้นทางล็อกอินพิเศษ (ตัวจริงอยู่ใน ie_auth.js)

// ล็อกอินครั้งแรกของบัญชีที่ย้ายมาจาก Firebase ด้วยรหัสผ่านเดิม
routerAdd("POST", "/api/ie/legacy-login", (e) => {
  return require(`${__hooks}/ie_auth.js`).legacyLogin(e);
});

// ตั้งรหัสใหม่ผ่านอีเมลแล้ว = ไม่ต้องพึ่งรหัสเดิมใน Firebase อีก
onRecordConfirmPasswordResetRequest((e) => {
  e.record.set("legacyAuth", false);
  return e.next();
}, "users");
