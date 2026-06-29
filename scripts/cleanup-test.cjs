// scripts/cleanup-test.cjs — ลบ test data ที่สร้างตอนทดสอบ UI
const { getDb, getAuthAdmin } = require("./lib-admin.cjs");

(async () => {
  const db = getDb();
  const auth = getAuthAdmin();
  let uid = null;
  try { uid = (await auth.getUserByEmail("test-ui@kmitl.ac.th")).uid; } catch {}

  let n = 0;
  // bookings + feeds ของ test user
  if (uid) {
    for (const col of ["bookings", "feeds"]) {
      const snap = await db.collection(col).where("userId", "==", uid).get();
      for (const d of snap.docs) { await d.ref.delete(); n++; }
    }
    const tasks = await db.collection("tasks").where("assignedToId", "==", uid).get();
    for (const d of tasks.docs) { await d.ref.delete(); n++; }
  }
  // test equipment
  const eq = await db.collection("equipments").where("name", "==", "TEST อุปกรณ์ทดสอบ").get();
  for (const d of eq.docs) { await d.ref.delete(); n++; }
  // test user
  if (uid) {
    await db.collection("users").doc(uid).delete();
    await auth.deleteUser(uid);
    n++;
  }
  console.log(`✓ ลบ test data ${n} รายการ (รวม user test-ui ถ้ามี)`);
  process.exit(0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
