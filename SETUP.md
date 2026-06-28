# IE-Photo Next — คู่มือตั้งค่า

Next.js + Firebase rewrite ของ IE-Photo Booking System
แผนเต็ม: [`../IE-Photo-WEB/MIGRATION_PLAN.md`](../IE-Photo-WEB/MIGRATION_PLAN.md)

---

## ✅ สร้างเสร็จครบทั้ง 7 Phase (0–6)
- **Phase 0–2:** scaffold, Firebase, Auth (สมัคร/ล็อกอิน/role), navbar, guards, profile
- **Phase 3:** ฟีด, ยืมอุปกรณ์, การจองของฉัน+คืน, งานของฉัน, ปฏิทิน, จองสตูดิโอ
- **Phase 4:** จัดการการจอง(อนุมัติ/คืน), คลังอุปกรณ์, สมาชิก, งาน, แดชบอร์ด
- **Phase 5:** จองสตูดิโอ + แอดมินแก้ไขข้อมูลห้อง
- **Phase 6:** อีเมลแจ้งผล (Resend), deploy config

---

## 🚀 ทำให้ใช้งานได้จริง (เหลือ 3 ขั้น — ต้องเป็นคุณทำ)

### 1. เปิด Email/Password
Firebase Console → **Authentication** → Sign-in method → เปิด **Email/Password** → Save

### 2. Deploy Rules (Firestore + Storage)
```bash
cd C:\xampp\htdocs\ie-photo-next
npx firebase login            # ยืนยัน Google ในเบราว์เซอร์
npx firebase deploy --only firestore:rules,storage
```
มี `firebase.json` + `.firebaserc` ตั้งค่าไว้แล้ว (ชี้ named database `default`)
*หรือ* paste `firestore.rules` / `storage.rules` ใน Console เอง (เลือก database `default`)

### 3. สมัครคนแรก แล้วตั้งเป็น super_admin
1. เปิดแอป → สมัครด้วยอีเมล @kmitl.ac.th → ตั้งชื่อในหน้าโปรไฟล์
2. ตั้งตัวเองเป็น super_admin:
```bash
node --env-file=.env.local scripts/set-role.cjs <อีเมลคุณ> super_admin
```
3. logout/login ใหม่ → จะเห็นเมนูแอดมินครบ

---

## คำสั่ง
```bash
npm run dev                                          # dev (localhost:3000)
npm run build                                        # production build
node --env-file=.env.local scripts/seed.cjs          # seed อุปกรณ์/สตูดิโอ (idempotent)
node --env-file=.env.local scripts/set-role.cjs <email> <role>
```

## หมายเหตุสำคัญ
- Firestore เป็น **named database `default`** (ไม่ใช่ `(default)`) — code ทุกที่ชี้ id นี้แล้ว
- ถ้าจะ deploy ขึ้น Vercel: ใส่ env ทั้งหมดจาก `.env.local` ใน Vercel project settings
- อีเมล (Resend) เป็น optional — ใส่ `RESEND_API_KEY` ใน `.env.local` เมื่อพร้อม (ไม่ใส่ก็ทำงานได้ แค่ไม่ส่งเมล)
