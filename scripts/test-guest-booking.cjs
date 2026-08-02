/* scripts/test-guest-booking.cjs — ทดสอบ rules ของการจองแบบไม่ล็อกอิน
 * ใช้ client SDK แบบไม่ sign in เลย (เหมือนคนนอกเปิดหน้า /book)
 * รัน: node --env-file=.env.local scripts/test-guest-booking.cjs
 */
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, Timestamp } = require("firebase/firestore");
const { getDb } = require("./lib-admin.cjs");

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const cDb = getFirestore(app, process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "default");

let pass = 0, fail = 0;
const fails = [];
function ok(n) { console.log("  ✓", n); pass++; }
function bad(n, why) { console.log("  ✗", n, "—", why); fail++; fails.push(n); }
async function expectOk(n, fn) { try { return await fn(), ok(n), true; } catch (e) { bad(n, "ควรผ่านแต่ error: " + (e.code || e.message)); return false; } }
async function expectDenied(n, fn) {
  try { await fn(); bad(n, "ควรถูกบล็อกแต่ผ่าน!"); }
  catch (e) { e.code === "permission-denied" ? ok(n) : bad(n, "error อื่น: " + (e.code || e.message)); }
}

const inHours = (h) => Timestamp.fromDate(new Date(Date.now() + h * 3600 * 1000));

function validGuest(overrides = {}) {
  return {
    bookingType: "studio", itemId: "1", itemName: "Studio 1",
    userId: null, userName: "ผู้ทดสอบ ภายนอก", userPhone: "0812345678",
    guestName: "ผู้ทดสอบ ภายนอก", guestEmail: "guest-test@example.com",
    startAt: inHours(48), endAt: inHours(50),
    formImageUrl: null, returnImageUrl: null,
    usageReason: "ทดสอบจองแบบไม่ล็อกอิน", usageType: null,
    status: "pending", responsibleUserId: null, responsibleUserName: null,
    consentToken: null, createdAt: Timestamp.now(),
    ...overrides,
  };
}

(async () => {
  let createdId = null;

  console.log("=== guest: สิ่งที่ต้องทำได้ ===");
  await expectOk("อ่าน studios (public)", () => getDocs(collection(cDb, "studios")));
  const okCreate = await expectOk("สร้าง booking สตูดิโอถูกต้อง", async () => {
    const ref = await addDoc(collection(cDb, "bookings"), validGuest());
    createdId = ref.id;
  });

  console.log("=== guest: สิ่งที่ต้องถูกบล็อก ===");
  await expectDenied("อ่าน bookings ทั้งหมด (ข้อมูลคนอื่น)", () => getDocs(collection(cDb, "bookings")));
  await expectDenied("อ่าน users", () => getDocs(collection(cDb, "users")));
  await expectDenied("อ่าน tasks", () => getDocs(collection(cDb, "tasks")));
  await expectDenied("จองอุปกรณ์ (เฉพาะสตูดิโอเท่านั้น)", () =>
    addDoc(collection(cDb, "bookings"), validGuest({ bookingType: "equipment" })));
  await expectDenied("ตั้งสถานะ approved เอง", () =>
    addDoc(collection(cDb, "bookings"), validGuest({ status: "approved" })));
  await expectDenied("อ้าง userId ของคนอื่น", () =>
    addDoc(collection(cDb, "bookings"), validGuest({ userId: "someone-else-uid" })));
  await expectDenied("itemId ที่ไม่มีจริง", () =>
    addDoc(collection(cDb, "bookings"), validGuest({ itemId: "no-such-studio-xyz" })));
  await expectDenied("ไม่ใส่ชื่อ", () =>
    addDoc(collection(cDb, "bookings"), validGuest({ guestName: "", userName: "" })));
  await expectDenied("อีเมลผิดรูปแบบ", () =>
    addDoc(collection(cDb, "bookings"), validGuest({ guestEmail: "not-an-email" })));
  await expectDenied("เบอร์สั้นเกินไป", () =>
    addDoc(collection(cDb, "bookings"), validGuest({ userPhone: "123" })));
  await expectDenied("ยัดรูป base64 ขนาดใหญ่", () =>
    addDoc(collection(cDb, "bookings"), validGuest({ formImageUrl: "data:image/jpeg;base64," + "A".repeat(50000) })));
  await expectDenied("จองย้อนอดีต", () =>
    addDoc(collection(cDb, "bookings"), validGuest({ startAt: inHours(-48), endAt: inHours(-46) })));
  await expectDenied("เวลาสิ้นสุดก่อนเริ่ม", () =>
    addDoc(collection(cDb, "bookings"), validGuest({ startAt: inHours(50), endAt: inHours(48) })));
  await expectDenied("usageReason ยาวเกิน 500", () =>
    addDoc(collection(cDb, "bookings"), validGuest({ usageReason: "ก".repeat(600) })));
  await expectDenied("แก้ studio", () =>
    updateDoc(doc(cDb, "studios", "1"), { subtitle: "hacked" }));
  await expectDenied("สร้าง studio ใหม่", () =>
    addDoc(collection(cDb, "studios"), { name: "hacked" }));
  await expectDenied("สร้าง feed", () =>
    addDoc(collection(cDb, "feeds"), { message: "spam", likedBy: [], likeCount: 0, createdAt: Timestamp.now() }));
  if (createdId) {
    await expectDenied("แก้ booking ที่ตัวเองเพิ่งสร้าง", () =>
      updateDoc(doc(cDb, "bookings", createdId), { status: "approved" }));
    await expectDenied("ลบ booking ที่ตัวเองเพิ่งสร้าง", () =>
      deleteDoc(doc(cDb, "bookings", createdId)));
  }

  console.log("=== cleanup ===");
  if (createdId) {
    await getDb().collection("bookings").doc(createdId).delete();
    console.log("  ลบ booking ทดสอบแล้ว");
  }

  console.log(`\n=== ผล: ${pass} ผ่าน / ${fail} fail ===`);
  if (fail) { console.log("FAIL:", fails.join(", ")); process.exit(1); }
  console.log("✅ guest booking rules ถูกต้อง");
  process.exit(0);
})().catch((e) => { console.error("CRASH:", e); process.exit(1); });
