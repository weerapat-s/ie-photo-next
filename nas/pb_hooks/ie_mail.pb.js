/// <reference path="../pb_data/types.d.ts" />
// nas/pb_hooks/ie_mail.pb.js — อีเมลทุกฉบับของ PocketBase ออกทาง Worker (ตัวจริงอยู่ใน ie_mail.js)
// ไม่เรียก e.next() = ไม่ใช้ SMTP ของ PocketBase เลย
onMailerSend((e) => {
  require(`${__hooks}/ie_mail.js`).relay(e);
});
