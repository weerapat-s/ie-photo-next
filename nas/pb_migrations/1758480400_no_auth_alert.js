/// <reference path="../pb_data/types.d.ts" />
// ปิดอีเมล "มีการล็อกอินจากเครื่องใหม่" ให้แน่ใจ — ฐานที่รัน 1758480200 ไปก่อนเพิ่มบรรทัดนี้ยังเปิดอยู่
// เปิดไว้ = ทุกคนได้อีเมลตอนล็อกอินครั้งแรกหลังย้ายระบบ โควตาส่งอีเมล 200 ฉบับ/วันหมดทันที
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.authAlert.enabled = false;
    app.save(users);
  },
  () => {}
);
