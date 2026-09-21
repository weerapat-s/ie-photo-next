#!/usr/bin/env bash
# scripts/cutover-nas.sh — ย้ายจริง: ข้อมูล Firestore ขึ้น NAS แล้วชี้เว็บเดิมมาที่ใหม่
#
# รัน (Git Bash ที่โฟลเดอร์โปรเจกต์):  bash scripts/cutover-nas.sh
#   ต้องรันตอนโควตาอ่าน Firestore รายวันเพิ่งรีเซ็ต (14:00 น. เวลาไทย) — export อ่านทุกเอกสาร
#
# ลำดับ (หยุดทันทีถ้าขั้นไหนล้ม):
#   1. ตรวจของพร้อม: NAS ตอบ · firebase/wrangler/gh ล็อกอินอยู่
#   2. ปิด Firestore (กติกา deny ทั้งหมด) — เว็บเดิมเขียนเพิ่มไม่ได้ ข้อมูลไม่หลุดระหว่างย้าย
#   3. export Firestore + Firebase Auth → .nas-import/
#   4. นำเข้า PocketBase บน NAS
#   5. ปิดอีเมลเตือนของ okmd-proxy (อ่าน Firestore ที่หยุดนิ่งแล้ว)
#   6. Worker ส่งอีเมลรุ่นใหม่ (ยืนยันตัวกับ NAS แทน Firebase)
#   7. iephoto.web.app → ส่งต่อไป iephoto.ienas.site (302 ย้อนกลับได้)
#   8. ปิด GitHub Actions แจ้งเตือนตัวเก่า (NAS ทำแทนแล้ว)
#
# ย้อนกลับ (ถ้าจำเป็น): ดู MIGRATION_NAS.md หัวข้อ "ย้อนกลับ"
set -euo pipefail
cd "$(dirname "$0")/.."
step() { echo; echo "════ $* ════"; }

step "1. ตรวจของพร้อม"
curl -sf https://iephoto.ienas.site/api/health >/dev/null && echo "NAS ตอบ"
npx firebase projects:list 2>/dev/null | grep -q iephoto && echo "firebase ล็อกอินอยู่"
npx wrangler whoami 2>/dev/null | grep -q c120ec1f85adbda4cb1a94e4e79cf22d && echo "wrangler ล็อกอินบัญชีที่ถูกต้อง"
gh auth status >/dev/null 2>&1 && echo "gh ล็อกอินอยู่"
node --env-file=.env.local -e '
  require("./scripts/lib-admin.cjs").getDb().collection("settings").doc("app").get()
    .then(() => console.log("โควตา Firestore พร้อม"))
    .catch((e) => { console.error("อ่าน Firestore ไม่ได้ (โควตายังไม่รีเซ็ต?):", e.message.slice(0, 120)); process.exit(1); })'

step "2. ปิด Firestore (ห้ามเขียนเพิ่มระหว่างย้าย)"
npx firebase deploy --only firestore:rules --config firebase.freeze.json --project iephoto

step "3. export Firestore + Auth"
node --env-file=.env.local --experimental-strip-types scripts/export-firestore.mjs

step "4. นำเข้า PocketBase บน NAS"
bash nas/import.sh

step "5. ปิดอีเมลเตือนของ okmd-proxy"
node --env-file=.env.local scripts/silence-firestore.cjs

step "6. Worker ส่งอีเมลรุ่นใหม่"
npx wrangler deploy --config workers/wrangler.nas.toml

step "7. iephoto.web.app → iephoto.ienas.site"
npx firebase deploy --only hosting --config firebase.redirect.json --project iephoto

step "8. ปิด GitHub Actions แจ้งเตือนตัวเก่า"
gh workflow disable notify.yml || echo "(ปิดไม่ได้ — ปิดเองที่แท็บ Actions)"

step "เสร็จ"
echo "เว็บใหม่: https://iephoto.ienas.site  (ล็อกอินด้วยรหัสนักศึกษา + รหัสผ่านเดิม)"
echo ".nas-import/ ยังเก็บไว้ตรวจทาน — มีข้อมูลส่วนตัว ลบทิ้งเมื่อตรวจเสร็จ: rm -rf .nas-import"
