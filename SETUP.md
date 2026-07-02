# IE-Photo Next — คู่มือตั้งค่า

Next.js + Firebase rewrite ของ IE-Photo Booking System
แผนเต็ม: [`../IE-Photo-WEB/MIGRATION_PLAN.md`](../IE-Photo-WEB/MIGRATION_PLAN.md)

**Live:** https://iephoto.web.app (โปรเจกต์ Firebase: `iephoto`, Firestore @ asia-southeast1 สิงคโปร์)

---

## ✅ สร้างเสร็จครบทั้ง 7 Phase (0–6) + ย้าย region

- **Phase 0–2:** scaffold, Firebase, Auth (สมัคร/ล็อกอิน/role), navbar, guards, profile
- **Phase 3:** ฟีด, ยืมอุปกรณ์, การจองของฉัน+คืน, งานของฉัน, ปฏิทิน, จองสตูดิโอ
- **Phase 4:** จัดการการจอง(อนุมัติ/คืน), คลังอุปกรณ์, สมาชิก, งาน, แดชบอร์ด
- **Phase 5:** จองสตูดิโอ + แอดมินแก้ไขข้อมูลห้อง
- **Phase 6:** อีเมลแจ้งผล (Resend), deploy config
- **Perf:** Firestore persistent cache, preconnect, cache headers
- **Region migration:** ย้ายจากโปรเจกต์ `ie-photo` (asia-southeast3 โซล) → `iephoto` (asia-southeast1 สิงคโปร์) เพื่อความเร็ว

---

## 📦 ประวัติการย้ายโปรเจกต์ (ie-photo → iephoto)

เดิมแอปนี้ deploy อยู่ที่โปรเจกต์ `ie-photo` (`ie-photo.web.app`) แต่ Firestore อยู่ที่ asia-southeast3
(โซล) ซึ่งไกลจากไทย ย้ายมาโปรเจกต์ `iephoto` ที่มี Firestore @ asia-southeast1 (สิงคโปร์) ซึ่งเร็วกว่า

**สิ่งที่ย้ายมาแล้ว:**
- Firestore ทุก collection (users, equipments, studios, bookings, tasks, feeds) — คง doc id เดิม
- Auth ทุกบัญชี — คง **UID + email เดิม** (ประวัติการจองยังเชื่อมถูกต้อง)

**สิ่งที่ย้ายมาไม่ได้ (ข้อจำกัดของ Firebase):**
- **รหัสผ่านเดิม** — สมาชิกที่มีอยู่ก่อนย้ายต้องกด **"ลืมรหัสผ่าน?"** ในหน้า login ครั้งเดียวเพื่อตั้งรหัสใหม่
  (มีปุ่มนี้ในหน้า login แล้ว)

**โปรเจกต์ `ie-photo` เดิม** ยังไม่ได้ลบ/ปิด — แต่ข้อมูลจะ**ไม่ sync กัน**อีกต่อไปหลังจากจุดย้าย
ถ้าไม่ใช้แล้วควรลบ hosting/project เดิมทิ้งเพื่อกันความสับสน (ผู้ใช้เข้าผิด URL แล้วเจอข้อมูลเก่า)

---

## 🚀 ทำให้ใช้งานได้จริง (checklist)

### 1. Email/Password — ✅ เปิดแล้วที่ iephoto
### 2. Firestore rules — ✅ deploy แล้ว (`scripts/deploy-rules.cjs`)
### 3. Storage — ⏳ ยังไม่เปิด (ไม่บล็อกฟีเจอร์หลัก — รูปโปรไฟล์ใช้ data URL แทนอยู่แล้ว)

ถ้าต้องการเปิดอัปโหลดเอกสารยืม/รูปคืนของ (ไฟล์ใหญ่กว่า):
1. Console → **Build → Storage** → Get started → region `asia-southeast1`
2. ```bash
   node scripts/deploy-rules.cjs "C:\path\to\iephoto-serviceAccount.json"
   ```

### 4. ตั้งแอดมินเพิ่ม
```bash
node --env-file=.env.local scripts/set-role.cjs <email> <member|admin|super_admin>
```

---

## คำสั่ง
```bash
npm run dev                                          # dev (localhost:3000)
npm run build                                        # production build (static export → out/)
node --env-file=.env.local scripts/seed.cjs          # seed อุปกรณ์/สตูดิโอ (idempotent)
node --env-file=.env.local scripts/set-role.cjs <email> <role>
node --env-file=.env.local scripts/test-system.cjs   # integration test (28 checks: rules+data)
node scripts/check-project.cjs <sa.json>             # เช็คสถานะโปรเจกต์ใดๆ (Firestore/Auth/Storage)
node scripts/deploy-rules.cjs [sa.json]              # deploy rules (ไม่ใส่ path = ใช้ .env.local)

# deploy hosting (ต้องตั้ง GOOGLE_APPLICATION_CREDENTIALS ก่อน)
npx firebase-tools deploy --only hosting --project iephoto
```

## หมายเหตุสำคัญ
- Firestore เป็น **named database `default`** (ไม่ใช่ `(default)`) — code ทุกที่ชี้ id นี้แล้ว
- Firestore database ใหม่ (Blaze plan) เท่านั้นที่สร้าง**เพิ่ม**ในโปรเจกต์เดิมได้ — ถ้าจะสร้าง database
  ที่ region อื่นแบบไม่เสียเงิน ต้องสร้าง**โปรเจกต์ Firebase ใหม่**ทั้งอัน (แบบที่ทำมา)
- อีเมล (Resend) เป็น optional — ใส่ `RESEND_API_KEY` ใน `.env.local` เมื่อพร้อม (ไม่ใส่ก็ทำงานได้ แค่ไม่ส่งเมล)
