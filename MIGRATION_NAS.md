# ย้ายจาก Firebase มา NAS ของชุมนุม

> สถานะ: **พร้อมย้ายจริง** — โค้ดและเซิร์ฟเวอร์บน NAS เสร็จและทดสอบแล้ว
> เหลือรัน `bash scripts/cutover-nas.sh` ตอนโควตาอ่าน Firestore รีเซ็ต (14:00 น. เวลาไทย)
> จนกว่าจะรัน เว็บจริงยังเป็น `iephoto.web.app` (Firebase)

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
| Firestore | **PocketBase 0.40.4** container `iephoto-pb` — SQLite + realtime |
| `firestore.rules` | API rules (หยาบ) + `nas/pb_hooks/ie_lib.js` (ละเอียด แปลทีละข้อ) — ทดสอบ 65 ข้อ `bash nas/test-rules.sh` |
| `firebase/firestore` ในโค้ด | `lib/db/firestore.ts` — API หน้าตาเดิม ข้างในเป็น PocketBase (แก้แค่บรรทัด import) |
| Firebase Auth | ตาราง `users` ของ PocketBase — `lib/db/auth.ts`, `lib/db/auth-context.tsx` |
| Firebase Hosting | PocketBase เสิร์ฟ `out/` จาก `pb_public` — ชื่อเดียวกับ API ไม่ติด CORS |
| รูปการยืม (base64 ในเอกสาร / Nextcloud) | ตาราง `files` (protected — เปิดได้เฉพาะเจ้าของ + กรรมการ ด้วย file token) |
| okmd-proxy (AI) | route `/api/ie/ai/*` บน NAS (`ie_ai.js`) — คีย์ OKMD อยู่ฝั่งเซิร์ฟเวอร์ |
| okmd-proxy `/send` + Resend | Worker `iephoto-nas` `/mail` ส่งจาก `admin@ienas.site` (Cloudflare Email Service) |
| GitHub Actions `notify.yml` + cron ของ okmd-proxy | `cronAdd` ใน `ie_cron.js` (อีเมลเตือน · Discord · push) + container `iephoto-push` |
| `iephoto.web.app` | **`iephoto.ienas.site`** ผ่าน Cloudflare Tunnel `nas-immich` |

ทำไม PocketBase ไม่ใช่ Supabase: container เดียว (Supabase รันเองราว 10 ตัว)
สำรองข้อมูล = คัดลอกโฟลเดอร์เดียว มีหน้าแอดมิน และแนวคิดกติกาสิทธิ์ใกล้ Firestore

## ล็อกอิน — สมาชิกใช้รหัสผ่านเดิมได้ ไม่ต้องรีเซ็ต

รหัสผ่านใน Firebase ย้ายออกมาไม่ได้ บัญชีที่ย้ายมาจึงมี `legacyAuth = true` + รหัสสุ่ม
ล็อกอินครั้งแรก: NAS ไปถาม Firebase เองว่ารหัสนี้ถูกไหม (`nas/pb_hooks/ie_auth.js`)
ถูก → ตั้งเป็นรหัสบน NAS แล้วปิด `legacyAuth` ครั้งต่อไปใช้ NAS ล้วน ๆ

ลืมรหัส → "ลืมรหัสผ่าน?" → อีเมลจาก `admin@ienas.site` → หน้า `/reset-password/`
อีเมลทุกฉบับของ PocketBase ออกทาง Worker (`ie_mail.js`) ยืนยันตัวด้วย token ของ
superuser หรือประธาน (Worker ถามกลับมาที่ NAS) — ไม่มีรหัสลับร่วมให้ต้องตั้ง

ปิดอีเมล "ล็อกอินจากเครื่องใหม่" ของ PocketBase ไว้แล้ว (ไม่งั้นโควตาเมล 200 ฉบับ/วันหมด)

## สิ่งที่ทดสอบแล้วบน NAS จริง

- กติกาสิทธิ์ 65 ข้อ (`bash nas/test-rules.sh` — container ชั่วคราว ลบทิ้งหลังจบ)
- นำเข้าข้อมูลตัวอย่าง + รันซ้ำไม่สร้างของซ้ำ · รูป base64 กลายเป็นไฟล์ protected
- หน้าเว็บจริงกับฐานทดลอง: ล็อกอิน · ภาพรวมแอดมิน · อนุมัติ (batch + realtime)
  · สมาชิกส่งคำขอยืม · ยกเลิก · หน้าแอดมินหลักทุกหน้าโหลดได้
- ล็อกอินรหัสเดิม: NAS ถาม Firebase ได้จริง (คีย์ใช้ได้) + ขั้นตั้งรหัสแล้วออก token
- cron: คำนวณรายการเตือนถูก (ส่งจริงได้หลัง deploy Worker รุ่นใหม่)

บั๊กเดิมที่เจอระหว่างทางและแก้แล้ว: สมาชิกกด "ยกเลิก" คำขอไม่ได้เลยตั้งแต่สมัย Firestore
(batch ลบ slot แต่กติกาให้ลบได้แค่แอดมิน) — `1758480300_slot_owner_cancel.js`

## ย้ายจริง — `bash scripts/cutover-nas.sh`

1. ตรวจของพร้อม (NAS · firebase · wrangler · gh · โควตา Firestore)
2. ปิด Firestore ทั้งหมด (`nas/firestore.freeze.rules`) — เว็บเดิมเขียนเพิ่มไม่ได้
3. `scripts/export-firestore.mjs` → `.nas-import/` (มีข้อมูลส่วนตัว อยู่ใน .gitignore)
4. `bash nas/import.sh` → คำสั่ง `pocketbase ie-import` ใน container (ไม่ผ่าน API)
5. `scripts/silence-firestore.cjs` — ปิดอีเมลเตือนของ okmd-proxy ที่ยังอ่าน Firestore
6. deploy Worker `iephoto-nas` รุ่นใหม่
7. `iephoto.web.app` → 302 ไป `iephoto.ienas.site` (`firebase.redirect.json`)
8. ปิด GitHub Actions `notify.yml`

หลังย้าย: ดู `.nas-import/report.json` ว่ามีช่องที่ไม่อยู่ใน schema ไหม แล้วลบ `.nas-import/`

## ย้อนกลับ (ถ้าจำเป็น)

redirect เป็น 302 ถอยได้ ข้อมูลใน Firestore ไม่ถูกลบ (แค่ปิดกติกา)
```
git worktree add ../iephoto-rollback 96db084     # master ก่อนย้าย
cd ../iephoto-rollback && npm ci && npm run build
npx firebase deploy --only hosting,firestore:rules --project iephoto
gh workflow enable notify.yml
```
ของที่เขียนบน NAS หลังย้ายจะไม่กลับไป Firestore — ถอยเร็วที่สุดเท่าที่ทำได้ถ้าจะถอย

## งานที่เหลือหลังย้าย (ไม่ขวางการใช้งาน)

- ตั้ง webhook Discord: หน้าแอดมิน PocketBase (`/_/`) → ตาราง `secrets` → `ai` → `discordWebhookUrl`
  (ค่าเดิมอยู่ใน GitHub secret `DISCORD_WEBHOOK_URL` — ไม่ตั้ง = ข้ามการแจ้ง Discord เงียบ ๆ)
- สร้าง superuser ของ PocketBase (ลิงก์ติดตั้งอยู่ใน `sudo docker logs iephoto-pb`)
- ปิดสิทธิ์ `sudo` แบบไม่ใส่รหัสบน NAS (`/etc/sudoers.d/99-nas-temp`)
- พิจารณากันหน้า `/_/` จากเน็ตสาธารณะ (Cloudflare Access)
- ลบโค้ด/สคริปต์ Firebase ที่ไม่ใช้แล้ว (`workers/okmd-proxy.js`, `scripts/send-notifications.cjs` ฯลฯ)
