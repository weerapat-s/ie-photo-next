// scripts/wipe-users.cjs — ลบบัญชีสมาชิกทั้งหมด (Auth + users collection) ให้ลงทะเบียนใหม่
// ไม่แตะ equipments/studios/bookings/tasks/feeds
// รัน: node --env-file=.env.local scripts/wipe-users.cjs [--confirm]
const { getDb, getAuthAdmin } = require("./lib-admin.cjs");

const confirmed = process.argv.includes("--confirm");

(async () => {
  const auth = getAuthAdmin();
  const db = getDb();

  const usersSnap = await db.collection("users").get();
  const list = [];
  let nextPageToken;
  do {
    const page = await auth.listUsers(1000, nextPageToken);
    page.users.forEach((u) => list.push({ uid: u.uid, email: u.email }));
    nextPageToken = page.pageToken;
  } while (nextPageToken);

  console.log(`=== พบบัญชีทั้งหมด ${list.length} คน (users doc: ${usersSnap.size}) ===`);
  list.forEach((u) => console.log(`  - ${u.email} (${u.uid})`));

  if (!confirmed) {
    console.log("\n(dry-run — รันด้วย --confirm เพื่อลบจริง)");
    return;
  }

  console.log("\n=== กำลังลบ ===");
  if (list.length) {
    await auth.deleteUsers(list.map((u) => u.uid));
    console.log(`  ✓ ลบ Auth ${list.length} บัญชี`);
  }
  for (const d of usersSnap.docs) await d.ref.delete();
  console.log(`  ✓ ลบ users doc ${usersSnap.size} รายการ`);
  console.log("\n✅ ล้างบัญชีสมาชิกทั้งหมดแล้ว — ทุกคนต้องสมัครใหม่");
})().then(() => process.exit(0)).catch((e) => { console.error("✗ FAILED:", e.message); process.exit(1); });
