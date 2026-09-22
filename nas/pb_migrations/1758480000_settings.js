/// <reference path="../pb_data/types.d.ts" />
// ตั้งค่าระบบของ PocketBase — รันครั้งเดียวตอนเริ่มครั้งแรก (migration)
//
// ย้ายจาก Firebase มา NAS ของชุมนุมเอง (ก.ย. 2026) เพราะ Firestore รุ่นฟรีคิดโควตา
// อ่านตามขนาดเอกสาร แล้วโควตาหมดจนเว็บใช้ไม่ได้ทั้งวัน ดู MIGRATION_NAS.md
migrate(
  (app) => {
    const s = app.settings();

    s.meta.appName = "IE-Photo";
    s.meta.appURL = "https://iephoto.ienas.site";

    // สำรองฐานข้อมูลทุกวันตี 3 เก็บ 14 วัน (อยู่ใน pb_data/backups บน SSD)
    // มี cron ฝั่งเครื่องคัดลอกไปไว้ HDD อีกชั้น กันดิสก์ลูกเดียวพัง — ดู nas/README.md
    s.backups.cron = "0 3 * * *";
    s.backups.cronMaxKeep = 14;

    // เขียนหลายรายการพร้อมกันแบบ all-or-nothing — แทน writeBatch ของ Firestore
    // (ยืมหลายชิ้นในคำขอเดียว ต้องสร้าง booking + slot ทุกชิ้นสำเร็จพร้อมกัน)
    s.batch.enabled = true;
    s.batch.maxRequests = 100;

    app.save(s);
  },
  () => {
    // ย้อนไม่ได้และไม่จำเป็น — การตั้งค่าแก้ต่อได้จากหน้าแอดมิน
  }
);
