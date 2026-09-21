/// <reference path="../pb_data/types.d.ts" />
// เจ้าของคำขอลบ slot ของคำขอตัวเองได้ เมื่อคำขอนั้นถูกยกเลิกแล้ว
//
// บั๊กเดิมตั้งแต่สมัย Firestore: ปุ่ม "ยกเลิก" ของสมาชิกทำ batch สองอย่าง —
// เปลี่ยนคำขอเป็น cancelled + ลบ slot (lib/bookings.ts) แต่กติกาให้ลบ slot ได้แค่แอดมิน
// ทั้ง batch จึงล้ม สมาชิกยกเลิกเองไม่ได้เลย ขึ้น "ยกเลิกไม่สำเร็จ" ทุกครั้ง
//
// batch ทำตามลำดับใน transaction เดียว — ตอนลบ slot คำขอเป็น cancelled ไปแล้ว
// จึงบังคับได้ว่าต้องยกเลิกคำขอก่อนถึงลบ slot ได้ (ลบ slot ของคำขอที่ยังอนุมัติอยู่ไม่ได้)
migrate(
  (app) => {
    const slots = app.findCollectionByNameOrId("slots");
    slots.deleteRule =
      '(@request.auth.role = "admin" || @request.auth.role = "super_admin")' +
      ' || (@request.auth.id != "" && @collection.bookings:bk.id ?= id' +
      ' && @collection.bookings:bk.userId ?= @request.auth.id && @collection.bookings:bk.status ?= "cancelled")';
    app.save(slots);
  },
  (app) => {
    const slots = app.findCollectionByNameOrId("slots");
    slots.deleteRule = '(@request.auth.role = "admin" || @request.auth.role = "super_admin")';
    app.save(slots);
  }
);
