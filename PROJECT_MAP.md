# IE-Photo — แผนที่โปรเจกต์

คู่มือว่า **ไฟล์อะไรอยู่ตรงไหน ทำอะไร และแก้ยังไง**
อ่านไฟล์นี้ก่อนเริ่มแก้อะไรก็ตาม โดยเฉพาะถ้าทำงานหลายคน

---

## 1. โปรเจกต์นี้อยู่ไหน

| อะไร | ที่ไหน |
|---|---|
| โค้ด (เครื่อง weerapat) | `C:\xampp\htdocs\ie-photo-next` |
| GitHub | https://github.com/weerapat-s/ie-photo-next (private) |
| เว็บจริง | https://iephoto.web.app |
| Firebase project | `iephoto` — region **asia-southeast1** (สิงคโปร์) |
| Firestore database | ชื่อ **`default`** (เป็น *named database* ไม่ใช่ `(default)`) ⚠️ |
| ของเก่า (PHP เลิกใช้แล้ว) | `C:\xampp\htdocs\IE-Photo-WEB` |

> ⚠️ **กับดักที่คนพลาดบ่อย:** database ชื่อ `default` ไม่ใช่ `(default)`
> ทุกที่ที่เรียก Firestore ต้องส่ง database id เข้าไปด้วย ไม่งั้นเจอ error `NOT_FOUND (code 5)`

### Branch

| branch | มีอะไร |
|---|---|
| `master` | สายหลัก — รวมทุกอย่างรวมถึงระบบ QR |
| `feature/qr-system` | สำเนางานระบบ QR แยกไว้ |
| `agent/light-ui-firebase-ux` | งาน UI ของเพื่อน (merge เข้า master ไปแล้ว) |

---

## 2. เว็บนี้ทำงานยังไง (ภาพรวม)

**Next.js static export + Firebase** — ไม่มี server เป็นของตัวเอง

```
เบราว์เซอร์  ──►  ไฟล์ HTML/JS นิ่งๆ บน Firebase Hosting
     │
     └──────────►  Firestore / Firebase Auth  (ยิงตรงจากเบราว์เซอร์)
                        ▲
                        └── firestore.rules = ด่านความปลอดภัยเดียวที่มี
```

**สิ่งที่ต้องเข้าใจ:**
- ไม่มี backend → **ตรวจสิทธิ์ทั้งหมดอยู่ที่ `firestore.rules`** ห้ามพึ่งการเช็คในหน้าเว็บอย่างเดียว (คนแก้ผ่าน DevTools ได้)
- ไม่มี API route, ไม่มี server component ที่รันตอน request — ทุกหน้าเป็น client component
- งานที่ต้องรันเบื้องหลัง (แจ้งเตือน) ใช้ **GitHub Actions cron** แทน Cloud Functions (เพื่อไม่ต้องเสียเงินขึ้น Blaze)
- รูปภาพเก็บเป็น **base64 data URL ใน Firestore** ไม่ได้ใช้ Firebase Storage

---

## 3. ไฟล์อยู่ตรงไหน

### 3.1 หน้าเว็บ — `app/`

Next.js App Router: โฟลเดอร์ในวงเล็บ `(...)` ไม่นับเป็น URL แต่ใช้จัดกลุ่ม + ครอบ layout

```
app/
├── layout.tsx              ← ครอบทุกหน้า: ฟอนต์, metadata, PWA, AuthProvider
├── page.tsx                ← "/" เด้งตาม role (admin→dashboard, member→feed, ไม่ล็อกอิน→login)
│
├── (auth)/                 ← หน้าสาธารณะ ไม่ต้องล็อกอิน
│   ├── login/page.tsx      ← เข้าสู่ระบบ + ลืมรหัสผ่าน
│   └── register/page.tsx   ← สมัคร (บังคับอีเมล @kmitl.ac.th)
│
├── book/page.tsx           ← จองสตูดิโอโดยไม่ต้องล็อกอิน (คนนอก) — อยู่นอกกลุ่ม ไม่มี guard
│
├── (member)/               ← ต้องล็อกอิน — layout ครอบด้วย RequireAuth
│   ├── layout.tsx
│   ├── feed/page.tsx       ← ฟีดกิจกรรม + กดไลก์
│   ├── borrow/page.tsx     ← ยืมอุปกรณ์ (เลือกของ/สแกน QR/แนบเอกสาร)
│   ├── studio/page.tsx     ← จองสตูดิโอ (+ แอดมินแก้ข้อมูลห้องได้ที่นี่)
│   ├── my-bookings/page.tsx← การจองของฉัน + แจ้งคืนของ
│   ├── my-tasks/page.tsx   ← งานที่ได้รับมอบหมาย
│   ├── calendar/page.tsx   ← ปฏิทิน (อ่านจาก slots ไม่ใช่ bookings)
│   └── profile/page.tsx    ← โปรไฟล์ + QR ประจำตัว + เปิดแจ้งเตือน
│
└── (admin)/                ← ต้องเป็น admin/super_admin — layout ครอบด้วย RequireAdmin
    ├── layout.tsx
    ├── dashboard/page.tsx  ← ภาพรวมตัวเลข
    ├── bookings/page.tsx   ← อนุมัติ/ปฏิเสธ/รับคืน
    ├── inventory/page.tsx  ← คลังอุปกรณ์ + ตั้งรหัส QR
    ├── labels/page.tsx     ← พิมพ์สติกเกอร์ QR
    ├── scan/page.tsx       ← สถานีสแกนหน้าเคาน์เตอร์
    ├── tasks/page.tsx      ← มอบหมายงาน
    └── users/page.tsx      ← เปลี่ยน role / ระงับบัญชี
```

**เพิ่มหน้าใหม่ยังไง:** สร้าง `app/(กลุ่มที่ต้องการ)/ชื่อหน้า/page.tsx` แล้วขึ้นต้นไฟล์ด้วย `"use client";`
ถ้าเป็นหน้าแอดมิน วางใน `(admin)/` แล้ว guard มาให้อัตโนมัติ ไม่ต้องเช็คเอง
อย่าลืมเพิ่มลิงก์ใน `components/navbar.tsx`

### 3.2 ตรรกะที่ใช้ร่วมกัน — `lib/`

| ไฟล์ | ทำอะไร |
|---|---|
| `firebase/client.ts` | ตั้งค่า Firebase (⚠️ ส่ง database id `default` ทุกจุด) + เปิด cache ในเครื่อง |
| `firebase/auth-context.tsx` | สถานะ login ทั้งแอป · อ่าน role จาก user doc · เช็คบัญชีถูกระงับ · ซ่อม doc ที่หาย |
| `types.ts` | **โครงข้อมูลทุก collection — เริ่มอ่านที่นี่ถ้าจะแก้ข้อมูล** |
| `hooks.ts` | `useCollection` / `useDocument` (realtime) · `useNow` (เวลาปัจจุบันแบบไม่พังกฎ React) |
| `slots.ts` | เช็คเวลาจองชนกัน (อ่านจาก `slots` ที่เปิดสาธารณะ) |
| `qr.ts` | รูปแบบข้อมูลใน QR + สุ่มรหัสสมาชิก + เดารหัสอุปกรณ์ |
| `image.ts` | ย่อ+บีบอัดรูปเป็น data URL (ไม่ใช้ Storage) |
| `push.ts` | สมัคร/ยกเลิกแจ้งเตือน Web Push |
| `format.ts` | แปลงวันที่ + ป้ายสถานะภาษาไทย |
| `email.ts` | ส่งอีเมล — **ยังไม่ได้ใช้** (ไม่ได้ตั้ง API key) |
| `utils.ts` | helper รวม class ของ Tailwind (`cn()`) ใช้กับ `components/ui/button.tsx` |

### 3.3 ชิ้นส่วน UI — `components/`

| ไฟล์ | ทำอะไร |
|---|---|
| `ui.tsx` | ของกลาง: `Card` `Button` `Modal` `Badge` `Field` `Spinner` `EmptyState` — **ใช้ตัวพวกนี้ก่อนเขียนใหม่** |
| `auth-guard.tsx` | `RequireAuth` / `RequireAdmin` — ตัวกันหน้า |
| `navbar.tsx` | เมนู (แยกรายการของ member กับ admin) |
| `qr-scanner.tsx` | เปิดกล้องสแกน QR |
| `qr-image.tsx` | วาด QR จากข้อความ |
| `member-qr-card.tsx` | การ์ด QR ประจำตัวในหน้าโปรไฟล์ |
| `notification-toggle.tsx` | สวิตช์เปิด/ปิดแจ้งเตือน |
| `sw-register.tsx` | ลงทะเบียน service worker (PWA) |
| `ui/button.tsx` | ปุ่มสไตล์ shadcn — โปรเจกต์นี้ใช้ `Button` จาก `ui.tsx` เป็นหลัก ตัวนี้เหลือจากตอน scaffold |

### 3.4 ไฟล์ตั้งค่า

| ไฟล์ | ทำอะไร |
|---|---|
| `firestore.rules` | 🔒 **ความปลอดภัยทั้งหมดอยู่ที่นี่** แก้แล้วต้อง deploy แยก |
| `firestore.indexes.json` | index ของ Firestore |
| `firebase.json` | ตั้งค่า hosting + cache header (⚠️ ลำดับสำคัญ ดูข้อ 7) |
| `next.config.ts` | `output: "export"` (static) · `trailingSlash: true` |
| `.env.local` | 🔑 **คีย์ลับ ห้าม commit** — ไม่อยู่ใน git |
| `public/sw.js` | service worker: cache + รับ push |
| `public/manifest.json` | PWA (ติดตั้งเป็นแอปได้) |

### 3.5 สคริปต์ — `scripts/`

รันแบบนี้เสมอ (ต้องมี `.env.local`):
```bash
node --env-file=.env.local scripts/<ชื่อไฟล์>.cjs
```

| สคริปต์ | ทำอะไร |
|---|---|
| `lib-admin.cjs` | ตัวกลาง — สคริปต์อื่นเรียกใช้ต่อ Firebase Admin |
| `deploy-rules.cjs` | **deploy `firestore.rules`** (ไม่ต้อง firebase login) |
| `test-system.cjs` | 🧪 ทดสอบสิทธิ์ 30 เคส — **รันทุกครั้งหลังแก้ rules** |
| `test-queries.cjs` | ทดสอบว่า query ทุกอันในเว็บทำงานได้ (จับ index ที่ขาด) |
| `test-guest-booking.cjs` | ทดสอบการจองของคนนอก |
| `send-notifications.cjs` | แจ้งเตือน push + ส่งคำขอจองใหม่เข้า Discord (รันโดย cron) |
| `set-role.cjs <email> <role>` | ตั้ง role — `member` / `admin` / `super_admin` |
| `check-user.cjs <email>` | ดูสถานะบัญชี |
| `suspend-user.cjs <uid>` | ระงับบัญชีถาวร (ตัด token + บล็อก rules) |
| `delete-user.cjs <uid>` | ลบบัญชี ⚠️ ใส่ banned ถาวร — **สมัครใหม่ด้วยอีเมลเดิมไม่ได้อีก** |
| `seed.cjs` | ใส่ข้อมูลตั้งต้น |
| `migrate-*.cjs` | ย้ายข้อมูลตอนเปลี่ยนโครงสร้าง (รันครั้งเดียว) — `migrate-slots` `migrate-push` `migrate-equipment-status` `migrate-project` |
| `check-project.cjs` | เช็คว่าต่อ Firebase project/database ถูกตัวไหม |
| `preflight.cjs` | ตรวจ env + การเชื่อมต่อก่อนรันงานจริง |
| `gen-icons.cjs` | สร้างไอคอน PWA ทุกขนาด |
| `update-phone.cjs` | แก้เบอร์ติดต่อในข้อมูลสตูดิโอ |
| `cleanup-test.cjs` | ลบข้อมูลที่เกิดจากการทดสอบ |
| `wipe-users.cjs` | ⚠️ ล้างผู้ใช้ทั้งหมด — ใช้ตอน reset เท่านั้น |

---

## 4. ข้อมูลอยู่ยังไง (Firestore)

โครงเต็มอยู่ใน [`lib/types.ts`](lib/types.ts)

| collection | เก็บอะไร | ใครอ่านได้ |
|---|---|---|
| `users/{uid}` | โปรไฟล์ + role + `memberCode` (QR ประจำตัว) | เจ้าของ + แอดมิน |
| `equipments/{id}` | อุปกรณ์ + `code` (รหัส QR) | สมาชิกที่ล็อกอิน |
| `studios/{id}` | ห้องสตูดิโอ | **ทุกคน** (คนนอกดูได้) |
| `bookings/{id}` | คำขอจอง/ยืม (มีชื่อ เบอร์ รูปเอกสาร) | สมาชิกที่ล็อกอิน |
| `slots/{id}` | **ตารางเวลาล้วน ไม่มีข้อมูลส่วนตัว** | **ทุกคน** |
| `tasks/{id}` | งานที่มอบหมาย | คนที่เกี่ยว + แอดมิน |
| `feeds/{id}` | ฟีดกิจกรรม + ไลก์ | สมาชิกที่ล็อกอิน |
| `banned/{uid}` | รายชื่อบัญชีที่ถูกระงับ | เจ้าของ + แอดมิน |

### เรื่องสำคัญ: `slots` คู่กับ `bookings`

**slot 1 ใบ = booking 1 ใบ และใช้ `id` เดียวกันเสมอ**

มีไว้เพราะ: คนนอกที่ยังไม่ล็อกอินต้องเช็คได้ว่าเวลาที่จะจองชนกับใครไหม แต่ต้องไม่เห็นชื่อ/เบอร์คนอื่น
→ `slots` เลยเก็บแค่ itemId / เวลา / สถานะ แล้วเปิดให้อ่านสาธารณะ

**เขียนต้องเขียนคู่กันเสมอใน batch เดียว:**
```ts
const bookingRef = doc(collection(db, "bookings"));   // จอง id ก่อน
const slotRef    = doc(db, "slots", bookingRef.id);   // ใช้ id เดียวกัน
const batch = writeBatch(db);
batch.set(bookingRef, {...});
batch.set(slotRef, slotPayload({...}));
await batch.commit();
```
> `firestore.rules` บังคับด้วย `getAfter()` ว่า slot ใหม่ต้องมี booking คู่ใน batch เดียวกัน — เขียนแยกจะโดนปฏิเสธ

**ตอนอนุมัติ/ปฏิเสธ:**
- อนุมัติ → `batch.update(slot, {status:"approved"})`
- ปฏิเสธ / คืนของ → **`batch.delete(slot)`** (ไม่งั้นเวลานั้นถูกจองค้างตลอดไป)

---

## 5. ระบบ QR (ของใหม่)

### รูปแบบข้อมูลใน QR
```
อุปกรณ์ : IEP-E:CAM-001
สมาชิก  : IEP-M:M7K2QX9A
```
prefix มีไว้กัน QR ของระบบอื่นหลุดเข้ามาแล้วระบบเข้าใจผิด — โค้ดอยู่ที่ [`lib/qr.ts`](lib/qr.ts)

### รหัสอุปกรณ์
`CAM-` กล้อง · `LEN-` เลนส์ · `MEM-` การ์ดความจำ · `ACC-` อุปกรณ์เสริม · `KEY-` กุญแจ
ตั้งได้ที่หน้า `/inventory` แล้วพิมพ์สติกเกอร์ที่ `/labels`

### QR ประจำตัวสมาชิก
- ออกให้อัตโนมัติครั้งแรกที่เปิดหน้า `/profile`
- ใช้**รหัสสุ่ม** ไม่ใช่รหัสนักศึกษา (คนอื่นปั๊ม QR ปลอมไม่ได้)
- **ตั้งได้ครั้งเดียว เจ้าของแก้เองไม่ได้** (บังคับใน rules) ถ้าหลุดต้องให้แอดมินออกใหม่
- 🔑 **QR เป็นแค่ตัวชี้ตัวคน ไม่ใช่รหัสผ่าน** — ทุกการส่งมอบ/รับคืนยังต้องแอดมินที่ล็อกอินอยู่กดเอง

### ข้อจำกัดของกล้อง
- ต้องเป็น **HTTPS** (production เป็นอยู่แล้ว)
- **เปิดในแอป Line/Facebook กล้องไม่ทำงาน** → ต้องเปิดใน Safari/Chrome
- ทุกหน้าที่สแกนได้ มีช่องพิมพ์รหัสเองสำรองไว้ (ใช้กับเครื่องยิงบาร์โค้ด USB ได้ด้วย)

---

## 6. งานที่ทำบ่อย

### รันในเครื่อง
```bash
npm install
npm run dev        # http://localhost:3000
```

### ตรวจก่อน commit
```bash
npx tsc --noEmit               # เช็ค type
npx eslint app lib components  # เช็ค lint
npm run build                  # ต้องผ่านก่อนเสมอ
```

### แก้ rules → ต้องทำครบ 2 ขั้น
```bash
node --env-file=.env.local scripts/deploy-rules.cjs
node --env-file=.env.local scripts/test-system.cjs   # ต้องได้ 30/30
```

### ขึ้นเว็บจริง
```bash
npm run build
npx firebase-tools deploy --only hosting --project iephoto
```

### ตั้งใครเป็นแอดมิน
```bash
node --env-file=.env.local scripts/set-role.cjs 68030271@kmitl.ac.th super_admin
```

---

## 7. กับดักที่เคยพลาดมาแล้ว

| เรื่อง | ต้องรู้ |
|---|---|
| **database ชื่อ `default`** | ไม่ใช่ `(default)` — ลืมส่ง id แล้วเจอ `NOT_FOUND` |
| **ลำดับ cache header** | ใน `firebase.json` กฎที่อยู่**ท้ายกว่าจะชนะ** → `"**"` (no-cache) ต้องอยู่**บนสุด** ไม่งั้นทับกฎ static ทำให้ JS ไม่ถูก cache เลย |
| **`inequality` กับ `orderBy`** | Firestore บังคับว่า `orderBy` ตัวแรกต้องเป็นฟิลด์เดียวกับที่ใช้ `!=` / `>` / `<` → เลี่ยงด้วยการกรองฝั่ง client |
| **ลบสมาชิก** | ต้องเคลียร์ 3 ที่: `users` doc + `banned/{uid}` + Auth user ไม่งั้นค้างสถานะ "เข้าไม่ได้ + สมัครใหม่ก็ไม่ได้" |
| **รูปใหญ่เกิน** | data URL ต้องไม่เกิน ~650,000 ตัวอักษร (rules บังคับ) — `lib/image.ts` ย่อให้อัตโนมัติ |
| **`getAfter()` ใน rules** | ใช้ได้เฉพาะ doc ที่เขียนใน **batch เดียวกัน** |

---

## 8. กติกาการทำงานร่วมกัน ⚠️ สำคัญที่สุด

**เคยเกิดขึ้นแล้ว:** 2 คน `firebase deploy` จากเครื่องตัวเอง → ทับกันไปมา งานหายทั้งสองฝั่งหลายรอบ

### กติกา
1. **แก้อะไรก็ตาม → push ขึ้น git ก่อนเสมอ** ห้าม deploy จากเครื่องตัวเองโดยไม่ push
2. **ทำงานบน branch ของตัวเอง** แล้วเปิด PR อย่า push ตรงเข้า master
   ```bash
   git checkout -b ui/<ชื่องาน>
   git add -A && git commit -m "..."
   git pull --rebase origin master
   git push origin ui/<ชื่องาน>
   ```
3. **deploy จากที่เดียว** หลัง merge เข้า master แล้วเท่านั้น
4. ก่อน deploy ทุกครั้ง: `git pull origin master` แล้ว `npm run build` ให้ผ่านก่อน

### เช็คว่าเว็บจริงตรงกับ git ไหม
```bash
curl -s https://iephoto.web.app/ | grep -oE '<title>[^<]*</title>'
```
ถ้า title ไม่ตรงกับใน `app/layout.tsx` = มีคน deploy ทับด้วยโค้ดที่ไม่ได้อยู่ใน git

---

## 9. แจ้งเตือน

- **Web Push** — แจ้งงาน/การจองใกล้ถึงเวลา ทำงานแม้ปิดแอป
- **Discord** — คำขอจองใหม่เข้าห้องแอดมิน
- ทั้งคู่รันโดย GitHub Actions cron **ทุก 30 นาที** ([`.github/workflows/notify.yml`](.github/workflows/notify.yml))
- ไม่ใช่ realtime — ดีเลย์ได้ถึง 30 นาที (แลกกับการไม่ต้องเสียเงินขึ้น Blaze)
- คีย์ทั้งหมดอยู่ใน GitHub Secrets ไม่ได้อยู่ในโค้ด

---

## 10. ของที่ยังไม่ได้ทำ

- `lib/email.ts` ยังไม่ทำงาน (ไม่ได้ตั้ง `RESEND_API_KEY`)
- ยังไม่ได้เปิด Firebase Storage (ไม่จำเป็น เพราะรูปเก็บเป็น data URL)
- `slots` โตขึ้นเรื่อยๆ ไม่มีตัวลบของเก่า — อนาคตควรมี cron ลบที่ `endAt` เกิน 90 วัน
- หน้า dashboard นับข้อมูลโดยดึงทุก doc มานับฝั่ง client — ข้อมูลเยอะจะช้า

---

## 11. วิธีสั่งงาน (โจทย์ที่ควรมี)

แผนที่ข้างบนบอกว่า *ของอยู่ตรงไหน* แต่ยังไม่ใช่ *โจทย์* — เวลาจะมอบงานให้ใคร (คนหรือ AI) ต้องระบุ 3 อย่างนี้เสมอ ไม่งั้นจะได้งานไม่ตรง หรือถูก deploy ทับกันอีก

### 11.1 โจทย์ต้องบอกอะไร

| หัวข้อ | ตัวอย่างที่ใช้ได้จริง |
|---|---|
| **1. ปัญหา/สิ่งที่อยากได้** | "หน้า `/borrow` กดสแกนแล้วกล้องไม่ขึ้นบน iPhone" · "อยากได้หน้าประวัติการยืมของแต่ละคน" |
| **2. ผลลัพธ์ที่ถือว่าเสร็จ** | "สแกนบน iPhone Safari แล้วติ๊กเลือกอุปกรณ์ได้" · "แอดมินเปิดดูได้ว่าใครยืมอะไรไปบ้าง ย้อนหลังได้" |
| **3. ขอบเขต — จบตรงไหน** | เลือกจากตารางข้อ 11.2 |

### 11.2 ระดับขอบเขต — ต้องเลือกก่อนเริ่มงาน

| ระดับ | ทำถึงไหน | ใช้ตอนไหน |
|---|---|---|
| **S1 — แก้โค้ดอย่างเดียว** | แก้ไฟล์ + `tsc` + `build` ผ่าน แล้วหยุด ไม่ commit | อยากรีวิว diff เองก่อน |
| **S2 — commit ด้วย** | S1 + commit ลง branch (ไม่ push) | ทำหลายรอบ ค่อย push ทีเดียว |
| **S3 — push + เปิด PR** | S2 + push branch + เปิด PR รอรีวิว | 🟢 **ค่าเริ่มต้นที่แนะนำ** เมื่อทำงานหลายคน |
| **S4 — merge + deploy ขึ้นเว็บจริง** | S3 + merge เข้า master + build + deploy | เจ้าของโปรเจกต์สั่งเท่านั้น |

> ถ้าโจทย์ไม่ได้ระบุระดับ → **ทำแค่ S3** (หยุดที่ PR) อย่า deploy เอง
> เพราะ deploy คือจุดที่เคยทำให้งานคนอื่นหายมาแล้วหลายรอบ (ดูข้อ 8)

### 11.3 สิ่งที่ต้องเช็คก่อนทำ S3/S4

สิทธิ์พวกนี้ **อย่าเพิ่งเช็คไว้ล่วงหน้า** — ตรวจตอนที่ได้รับมอบหมายให้ทำจริงเท่านั้น
(การลอง push/deploy เล่นๆ = เสี่ยงไปทับงานคนอื่น)

| จะทำ | เช็คก่อนด้วย | ถ้าไม่ผ่านต้องมี |
|---|---|---|
| push / เปิด PR (S3) | `gh auth status` | สิทธิ์ write บน repo |
| deploy hosting (S4) | `npx firebase-tools projects:list` | บัญชีที่เข้าถึง project `iephoto` ได้ |
| deploy rules (S4) | มี `.env.local` ที่มี `FIREBASE_PRIVATE_KEY` | service account |

### 11.4 เทมเพลตสั่งงาน — คัดลอกไปใช้ได้

```
ปัญหา/สิ่งที่อยากได้:
  <อธิบายสั้นๆ ว่าตอนนี้เป็นยังไง อยากให้เป็นยังไง>

ถือว่าเสร็จเมื่อ:
  - <เงื่อนไขที่วัดได้ เช่น "กดปุ่ม X แล้วเห็น Y">
  - <ถ้าเป็นบั๊ก: ระบุขั้นตอนที่ทำให้เกิด>

ขอบเขต: S1 / S2 / S3 / S4   ← เลือก 1

ห้ามแตะ:
  - <ถ้ามีไฟล์/ฟีเจอร์ที่ห้ามยุ่ง>
```

### 11.5 ทุกงานต้องผ่านก่อนถือว่าเสร็จ

```bash
npx tsc --noEmit               # ต้องไม่มี error
npm run build                  # ต้องผ่าน
npx eslint app lib components  # ไม่ควรมี error ใหม่
```
ถ้าแก้ `firestore.rules` เพิ่มอีกอัน:
```bash
node --env-file=.env.local scripts/test-system.cjs   # ต้องได้ 30/30
```
