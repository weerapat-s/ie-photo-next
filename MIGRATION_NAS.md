# ย้ายจาก Firebase มา NAS ของชุมนุม

> สถานะ: **กำลังทำ** — เว็บจริงยังเป็น Firebase จนกว่าจะถึงขั้นที่ 6 (สลับใช้จริง)

## ทำไมย้าย

21 ก.ย. 2026 โควตาอ่าน Firestore รายวันหมดทั้งโปรเจกต์ เว็บใช้ไม่ได้ทั้งวัน
Firestore รุ่นฟรีที่ใช้อยู่คิดโควตาอ่านตามขนาดเอกสาร และคำขอเก่าฝังรูปไว้ในตัว
ชุมนุมตัดสินใจย้ายทุกอย่าง (ข้อมูล · ล็อกอิน · หน้าเว็บ) มาไว้บน NAS ของตัวเอง
ไม่มีโควตา ไม่มีค่าใช้จ่ายรายเดือน

**ความเสี่ยงที่รับไว้แล้ว:** NAS ต่อเน็ตผ่านสายแลนมหาลัยที่ต้องมีบอทคอยล็อกอิน
(ดู kmitl-wifi-bot บน NAS) ไฟดับหรือเน็ตหลุด = เว็บล่มทั้งหมด รวมถึงหน้าเว็บ

## สิ่งที่ใช้แทน

| เดิม (Firebase) | ใหม่ (NAS) |
|---|---|
| Firestore | **PocketBase 0.40.4** — SQLite + realtime + กติกาสิทธิ์รายตาราง |
| Firebase Auth | PocketBase auth (ตาราง `users`) |
| Firebase Hosting | PocketBase เสิร์ฟ `out/` จาก `pb_public` เอง — ชื่อเดียว ไม่ต้องยุ่งเรื่องข้ามโดเมน |
| Worker `iephoto-nas` + Nextcloud (รูปการยืม) | ช่อง file ของ PocketBase เก็บบนดิสก์ NAS ตรง ๆ |
| Worker `/notify` + GitHub Actions cron | `pb_hooks` (JS บนเซิร์ฟเวอร์ + `cronAdd`) |
| `iephoto.web.app` | **`iephoto.ienas.site`** ผ่าน Cloudflare Tunnel ตัวเดิมของ NAS |

ทำไม PocketBase ไม่ใช่ Supabase: container เดียว (Supabase รันเองราว 10 ตัว)
สำรองข้อมูล = คัดลอกโฟลเดอร์เดียว มีหน้าแอดมิน และแนวคิดกติกาสิทธิ์ใกล้ Firestore

## สิ่งที่ทดสอบแล้วบน NAS จริง

- **เก็บ ID เดิมได้ทั้งหมด** — ตั้ง id เป็น UID 28 ตัวของ Firebase (ตาราง auth) และ
  ID 20 ตัวของ Firestore (ตารางทั่วไป) ได้ ผ่านการปรับ `min/max/pattern` ของช่อง id
  → การอ้างอิงข้ามตาราง (`userId`, `itemId`, `bookingId` …) ไม่ต้องแปลงเลย

## ขั้นตอน

| # | ขั้น | สถานะ |
|---|---|---|
| 1 | PocketBase บน NAS (`nas/`) + สำรองข้อมูล + ชื่อ `iephoto.ienas.site` | container ขึ้นแล้ว · รอเปิดชื่อผ่าน tunnel |
| 2 | สร้างตาราง 19 ตัว + แปลงกติกา `firestore.rules` (453 บรรทัด) เป็น API rules + hooks | ยังไม่เริ่ม |
| 3 | ย้ายข้อมูลจาก Firestore (รักษา ID เดิม) + ย้ายรูปที่ฝังอยู่เป็นไฟล์ | รอโควตา Firestore กลับมา |
| 4 | ชั้นข้อมูลแทน `firebase/firestore` ที่หน้าตา API เหมือนเดิม (`lib/db`) — 60 ไฟล์แก้แค่ import เป็นหลัก | ยังไม่เริ่ม |
| 5 | ล็อกอินใหม่ — ทุกคนตั้งรหัสผ่านใหม่ครั้งแรกผ่านอีเมลจาก `admin@ienas.site` (รหัสเดิมย้ายจาก Firebase ไม่ได้) | ยังไม่เริ่ม |
| 6 | สลับใช้จริง + `iephoto.web.app` พาไปที่อยู่ใหม่ + ปิด Firestore เป็นอ่านอย่างเดียว | ยังไม่เริ่ม |

### คำสั่ง Firestore ที่ชั้นแทนที่ต้องรองรับ (นับจากโค้ดจริง)

`collection` `doc` `query` `where` (`==` `in` `array-contains` `>=` `>`) `orderBy` `limit`
`onSnapshot` `getDocs` `getDoc` `addDoc` `setDoc` (merge) `updateDoc` `deleteDoc`
`writeBatch` `serverTimestamp` `Timestamp` `arrayUnion` `arrayRemove`

## ระหว่างทาง

Firebase ยังต้องมีชีวิตจนถึงขั้น 6 — ถ้าโควตาหมดอีก ให้รัน
`scripts/migrate-images-to-nas.cjs` (ย้ายรูปที่ฝังในคำขอเก่าออก) เพื่อให้เว็บเดิมอยู่ได้
