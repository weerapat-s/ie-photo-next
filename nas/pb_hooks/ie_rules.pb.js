/// <reference path="../pb_data/types.d.ts" />
// nas/pb_hooks/ie_rules.pb.js — ผูกกติกาความปลอดภัยเข้ากับทุกคำขอเขียน
// ตัวกติกาจริงอยู่ใน ie_lib.js (แปลจาก firestore.rules เดิม)
//
// ไม่ใส่ชื่อ collection = ทำงานกับทุกตาราง — ie_lib แยกตามชื่อตารางเอง
// ต้อง require ข้างใน handler (PocketBase รันแต่ละ handler ใน VM แยก)

onRecordCreateRequest((e) => {
  require(`${__hooks}/ie_lib.js`).onCreate(e);
});

onRecordUpdateRequest((e) => {
  require(`${__hooks}/ie_lib.js`).onUpdate(e);
});

onRecordDeleteRequest((e) => {
  require(`${__hooks}/ie_lib.js`).onDelete(e);
});

onRecordAuthRequest((e) => {
  require(`${__hooks}/ie_lib.js`).onAuth(e);
}, "users");
