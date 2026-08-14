/* scripts/test-system.cjs — integration test: rules + data flow ครบทุกมุม
 * ใช้ Admin SDK สร้าง user + custom token → client SDK ทดสอบสิทธิ์จริง
 * รัน: node --env-file=.env.local scripts/test-system.cjs
 */
const { initializeApp: adminInit, cert, getApps } = require("firebase-admin/app");
const { getAuth: adminAuth } = require("firebase-admin/auth");
const { getFirestore: adminFs } = require("firebase-admin/firestore");

const { initializeApp: clientInit } = require("firebase/app");
const { getAuth, signInWithCustomToken, signOut } = require("firebase/auth");
const {
  getFirestore, doc, getDoc, getDocs, collection, addDoc, setDoc, updateDoc, deleteDoc, writeBatch, query, where,
} = require("firebase/firestore");

const DB_ID = process.env.FIREBASE_DATABASE_ID || "default";

// ── Admin SDK ──
if (!getApps().length) {
  adminInit({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}
const aAuth = adminAuth();
const aDb = adminFs();
aDb.settings({ databaseId: DB_ID });

// ── Client SDK ──
const capp = clientInit({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const cAuth = getAuth(capp);
const cDb = getFirestore(capp, DB_ID);

let pass = 0, fail = 0;
const fails = [];
function ok(name) { console.log("  ✓", name); pass++; }
function bad(name, why) { console.log("  ✗", name, "—", why); fail++; fails.push(name); }
async function expectOk(name, fn) { try { await fn(); ok(name); } catch (e) { bad(name, "ควรผ่านแต่ error: " + (e.code || e.message)); } }
async function expectDenied(name, fn) {
  try { await fn(); bad(name, "ควรถูกบล็อกแต่ผ่าน!"); }
  catch (e) { e.code === "permission-denied" ? ok(name) : bad(name, "error อื่น: " + (e.code || e.message)); }
}

const MEMBER = { email: "test-member@kmitl.ac.th", uid: null };
const ADMIN = { email: "test-admin@kmitl.ac.th", uid: null };

async function makeUser(email, role) {
  try { const u = await aAuth.getUserByEmail(email); await aAuth.deleteUser(u.uid); } catch {}
  const u = await aAuth.createUser({ email, password: "test123456", emailVerified: true });
  await aAuth.setCustomUserClaims(u.uid, { role });
  await aDb.collection("users").doc(u.uid).set({
    studentId: email.split("@")[0], firstName: "Test", lastName: role, email, phone: "0900000000",
    role, profileImageUrl: null, profileCompleted: true, createdAt: new Date(),
  });
  return u.uid;
}

async function signAs(uid) {
  const token = await aAuth.createCustomToken(uid);
  await signInWithCustomToken(cAuth, token);
}

(async () => {
  console.log("\n=== SETUP ===");
  MEMBER.uid = await makeUser(MEMBER.email, "member");
  ADMIN.uid = await makeUser(ADMIN.email, "super_admin");
  console.log(`  member=${MEMBER.uid} admin=${ADMIN.uid}`);

  // ดึง studio/equipment จริงมาใช้ทดสอบ
  const studioSnap = await aDb.collection("studios").limit(1).get();
  const studioId = studioSnap.docs[0]?.id;
  const eqSnap = await aDb.collection("equipments").limit(1).get();
  const eqId = eqSnap.docs[0]?.id;

  let bookingId, taskId, tempEqId, feedId;

  console.log("\n=== MEMBER ===");
  await signAs(MEMBER.uid);
  await expectOk("member อ่าน studios (public)", () => getDocs(collection(cDb, "studios")));
  await expectOk("member อ่าน equipments", () => getDocs(collection(cDb, "equipments")));
  await expectOk("member อ่าน user doc ตัวเอง", () => getDoc(doc(cDb, "users", MEMBER.uid)));
  await expectOk("member แก้ชื่อตัวเอง", () => updateDoc(doc(cDb, "users", MEMBER.uid), { firstName: "Changed" }));
  await expectDenied("member แก้ role ตัวเอง (ต้องบล็อก)", () => updateDoc(doc(cDb, "users", MEMBER.uid), { role: "admin" }));
  await expectDenied("member อ่าน user คนอื่น (ต้องบล็อก)", () => getDoc(doc(cDb, "users", ADMIN.uid)));
  await expectDenied("member list users ทั้งหมด (ต้องบล็อก)", () => getDocs(collection(cDb, "users")));

  await expectOk("member สร้าง booking (pending)", async () => {
    const ref = doc(collection(cDb, "bookings"));
    const startAt = new Date();
    const endAt = new Date(Date.now() + 3600000);
    const batch = writeBatch(cDb);
    batch.set(ref, {
      bookingType: "equipment", itemId: eqId, itemName: "Test", userId: MEMBER.uid, userName: "Test",
      userPhone: "0900000000", guestName: null, guestEmail: null, startAt, endAt,
      formImageUrl: null, returnImageUrl: null, usageReason: "test", usageType: null, status: "pending",
      responsibleUserId: null, responsibleUserName: null, consentToken: null, createdAt: new Date(),
    });
    batch.set(doc(cDb, "slots", ref.id), {
      bookingId: ref.id, itemId: eqId, itemName: "Test", bookingType: "equipment", startAt, endAt, status: "pending",
    });
    await batch.commit();
    bookingId = ref.id;
  });
  await expectDenied("member สร้าง booking สถานะ approved (ต้องบล็อก)", () =>
    addDoc(collection(cDb, "bookings"), { bookingType: "studio", itemId: "x", itemName: "x", userId: MEMBER.uid, status: "approved", createdAt: new Date() })
  );
  await expectDenied("member สร้าง booking ในนามคนอื่น (ต้องบล็อก)", () =>
    addDoc(collection(cDb, "bookings"), { bookingType: "studio", itemId: "x", itemName: "x", userId: ADMIN.uid, status: "pending", createdAt: new Date() })
  );
  await expectDenied("member อนุมัติ booking ตัวเอง (ต้องบล็อก)", () => updateDoc(doc(cDb, "bookings", bookingId), { status: "approved" }));
  await expectDenied("member คืนของก่อนอนุมัติ (ต้องบล็อก)", () =>
    updateDoc(doc(cDb, "bookings", bookingId), { status: "pending_return", returnImageUrl: "data:image/jpeg;base64,AAAA" })
  );

  await expectDenied("member สร้าง pending slot โดยไม่มี booking คู่ (ต้องบล็อก)", () =>
    setDoc(doc(cDb, "slots", "orphan-test-slot"), {
      bookingId: "orphan-test-slot", itemId: eqId, itemName: "Test", bookingType: "equipment",
      startAt: new Date(Date.now() + 3600000), endAt: new Date(Date.now() + 7200000), status: "pending",
    })
  );

  await expectDenied("member สร้าง equipment (ต้องบล็อก)", () => addDoc(collection(cDb, "equipments"), { name: "x", type: "camera", status: "available" }));
  await expectDenied("member แก้ studio (ต้องบล็อก)", () => updateDoc(doc(cDb, "studios", studioId), { subtitle: "hacked" }));
  await expectDenied("member สร้าง feed (ต้องบล็อก)", () => addDoc(collection(cDb, "feeds"), { message: "x", likedBy: [], likeCount: 0, createdAt: new Date() }));

  console.log("\n=== ADMIN ===");
  await signAs(ADMIN.uid);
  await expectOk("admin list bookings ทั้งหมด", () => getDocs(collection(cDb, "bookings")));
  await expectOk("admin อนุมัติ booking และ slot ของ member", async () => {
    const batch = writeBatch(cDb);
    batch.update(doc(cDb, "bookings", bookingId), { status: "approved" });
    batch.update(doc(cDb, "slots", bookingId), { status: "approved" });
    await batch.commit();
  });
  await expectOk("admin list users ทั้งหมด", () => getDocs(collection(cDb, "users")));
  await expectOk("admin สร้าง equipment", async () => {
    const ref = await addDoc(collection(cDb, "equipments"), { name: "TEST-EQ", type: "camera", status: "available" });
    tempEqId = ref.id;
  });
  await expectOk("admin แก้ equipment status", () => updateDoc(doc(cDb, "equipments", tempEqId), { status: "maintenance" }));
  await expectOk("admin แก้ studio", () => updateDoc(doc(cDb, "studios", studioId), { subtitle: studioSnap.docs[0].data().subtitle }));
  await expectOk("admin สร้าง feed", async () => {
    const ref = await addDoc(collection(cDb, "feeds"), { message: "test feed", bookingId: null, userId: null, formImageUrl: null, bookingStatus: null, likedBy: [], likeCount: 0, createdAt: new Date() });
    feedId = ref.id;
  });
  await expectOk("admin สร้าง task มอบ member", async () => {
    const ref = await addDoc(collection(cDb, "tasks"), {
      title: "test task", description: null, assignedById: ADMIN.uid, assignedByName: "Admin",
      assignedToId: MEMBER.uid, assignedToName: "Member", bookingId: null, status: "pending", dueDate: null, createdAt: new Date(),
    });
    taskId = ref.id;
  });

  console.log("\n=== MEMBER (task + feed like) ===");
  await signAs(MEMBER.uid);
  await expectOk("member คืนอุปกรณ์ที่อนุมัติและเริ่มแล้ว", () =>
    updateDoc(doc(cDb, "bookings", bookingId), { status: "pending_return", returnImageUrl: "data:image/jpeg;base64,AAAA" })
  );
  await expectOk("member อ่าน task ที่ได้รับมอบหมาย", () => getDoc(doc(cDb, "tasks", taskId)));
  await expectOk("member อัปเดต status งานตัวเอง", () => updateDoc(doc(cDb, "tasks", taskId), { status: "in_progress" }));
  await expectDenied("member แก้ title งาน (ต้องบล็อก)", () => updateDoc(doc(cDb, "tasks", taskId), { title: "hacked" }));
  await expectOk("member กดไลก์ feed", () => updateDoc(doc(cDb, "feeds", feedId), { likedBy: [MEMBER.uid], likeCount: 1 }));
  await expectDenied("member แก้ข้อความ feed (ต้องบล็อก)", () => updateDoc(doc(cDb, "feeds", feedId), { message: "hacked" }));

  console.log("\n=== CLEANUP ===");
  await signOut(cAuth);
  await aDb.collection("bookings").doc(bookingId).delete();
  await aDb.collection("slots").doc(bookingId).delete();
  await aDb.collection("tasks").doc(taskId).delete();
  await aDb.collection("equipments").doc(tempEqId).delete();
  await aDb.collection("feeds").doc(feedId).delete();
  await aAuth.deleteUser(MEMBER.uid);
  await aAuth.deleteUser(ADMIN.uid);
  await aDb.collection("users").doc(MEMBER.uid).delete();
  await aDb.collection("users").doc(ADMIN.uid).delete();
  console.log("  ลบ test data แล้ว");

  console.log(`\n=== ผล: ${pass} ผ่าน / ${fail} fail ===`);
  if (fail) { console.log("FAIL:", fails.join(", ")); process.exit(1); }
  console.log("✅ ผ่านทั้งหมด — rules + data flow ถูกต้อง");
  process.exit(0);
})().catch((e) => { console.error("CRASH:", e); process.exit(1); });
