# IE-Photo Next — คู่มือตั้งค่า

Next.js + Firebase rewrite ของ IE-Photo Booking System
ดูแผนเต็มที่ [`../IE-Photo-WEB/MIGRATION_PLAN.md`](../IE-Photo-WEB/MIGRATION_PLAN.md)

---

## ✅ Phase 0 — เสร็จแล้ว
- [x] Next.js 16 + TypeScript + Tailwind v4 + Turbopack
- [x] Firebase SDK (client + admin) ติดตั้ง + config module
- [x] shadcn/ui
- [x] TypeScript types ของทุก collection (`lib/types.ts`)
- [x] หน้า landing แสดงสถานะการตั้งค่า
- [x] build ผ่าน + dev server รันได้ (`localhost:3000`)

---

## 🔧 สิ่งที่ต้องทำต่อ (action ของคุณ) เพื่อปลด Phase 1

### 1. สร้าง Firebase Project
1. ไปที่ https://console.firebase.google.com → **Add project**
2. ตั้งชื่อ เช่น `ie-photo-booking` → สร้าง (ปิด Google Analytics ก็ได้)

### 2. เปิด services 3 ตัว
- **Authentication** → Get started → เปิด **Email/Password**
- **Firestore Database** → Create database → เลือก region `asia-southeast1` (สิงคโปร์ ใกล้ไทยสุด) → Production mode
- **Storage** → Get started → region เดียวกัน

### 3. เอา Client config (ฝั่ง browser)
1. Project Settings (⚙️) → **General** → เลื่อนลง **Your apps** → คลิกไอคอน Web `</>`
2. ตั้งชื่อ app → Register → จะได้ `firebaseConfig` มา
3. copy ค่าใส่ `.env.local`:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
   NEXT_PUBLIC_FIREBASE_APP_ID=...
   ```

### 4. เอา Admin config (ฝั่ง server — ความลับ)
1. Project Settings → **Service accounts** → **Generate new private key** → ได้ไฟล์ JSON
2. เปิดไฟล์ JSON copy ค่าใส่ `.env.local`:
   ```
   FIREBASE_PROJECT_ID=        ← project_id
   FIREBASE_CLIENT_EMAIL=      ← client_email
   FIREBASE_PRIVATE_KEY="..."  ← private_key (ทั้งก้อน คง \n ไว้)
   ```

### 5. เช็คว่าครบ
```bash
npm run dev
```
เปิด http://localhost:3000 → ทุกบรรทัดควรเป็น 🟢 พร้อม

---

## คำสั่งที่ใช้บ่อย
```bash
npm run dev      # dev server (localhost:3000)
npm run build    # production build
npm run start    # รัน production build
```

## โครงสร้าง
```
app/            หน้าเว็บ (App Router)
components/ui/  shadcn components
lib/
  firebase/
    client.ts   Firebase client SDK (browser)
    admin.ts    Firebase admin SDK (server เท่านั้น)
  types.ts      TypeScript types ของ Firestore collections
  utils.ts      shadcn helper (cn)
```
