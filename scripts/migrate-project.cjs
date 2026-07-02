/* scripts/migrate-project.cjs
 * ย้ายข้อมูลทั้งหมดจาก ie-photo (asia-southeast3) → iephoto (asia-southeast1)
 * - Firestore: ทุก collection คง doc id เดิม (users คง uid เดิมเป็น doc id)
 * - Auth: คง uid + email + emailVerified เดิม (ไม่มีรหัสผ่าน — ต้องรีเซ็ตรหัสผ่านครั้งเดียว)
 *
 * รัน: node scripts/migrate-project.cjs <old-sa.json> <new-sa.json>
 */
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const oldSaPath = process.argv[2];
const newSaPath = process.argv[3];
if (!oldSaPath || !newSaPath) {
  console.error("ใช้: node scripts/migrate-project.cjs <old-sa.json> <new-sa.json>");
  process.exit(1);
}
const oldSa = require(oldSaPath);
const newSa = require(newSaPath);

const oldApp = initializeApp({ credential: cert(oldSa) }, "old");
const newApp = initializeApp({ credential: cert(newSa) }, "new");

const OLD_DB_ID = "default"; // ie-photo ใช้ named db "default" @ asia-southeast3
const NEW_DB_ID = "default"; // iephoto ก็เป็น named db "default" @ asia-southeast1

const oldDb = getFirestore(oldApp, OLD_DB_ID);
const newDb = getFirestore(newApp, NEW_DB_ID);

const oldAuth = getAuth(oldApp);
const newAuth = getAuth(newApp);

const COLLECTIONS = ["users", "equipments", "studios", "bookings", "tasks", "feeds"];

async function migrateFirestore() {
  console.log("\n=== ย้าย Firestore ===");
  for (const col of COLLECTIONS) {
    const snap = await oldDb.collection(col).get();
    let n = 0;
    for (const d of snap.docs) {
      await newDb.collection(col).doc(d.id).set(d.data());
      n++;
    }
    console.log(`  ✓ ${col}: ${n} เอกสาร`);
  }
}

async function migrateAuthUsers() {
  console.log("\n=== ย้าย Auth users (uid + email เดิม, ไม่มีรหัสผ่าน) ===");
  let nextPageToken;
  let total = 0;
  const results = [];
  do {
    const page = await oldAuth.listUsers(1000, nextPageToken);
    for (const u of page.users) {
      try {
        await newAuth.importUsers([
          {
            uid: u.uid,
            email: u.email,
            emailVerified: u.emailVerified,
            displayName: u.displayName,
            disabled: u.disabled,
          },
        ]);
        total++;
      } catch (e) {
        // อาจมีอยู่แล้ว (รันซ้ำ) — ข้าม
        results.push({ email: u.email, error: e.message });
      }
    }
    nextPageToken = page.pageToken;
  } while (nextPageToken);
  console.log(`  ✓ ย้ายบัญชี ${total} คน`);
  if (results.length) {
    console.log(`  ⚠ ${results.length} คนข้าม (อาจมีอยู่แล้ว):`);
    results.forEach((r) => console.log(`    - ${r.email}: ${r.error}`));
  }
}

(async () => {
  await migrateFirestore();
  await migrateAuthUsers();
  console.log("\n✅ ย้ายข้อมูลเสร็จสมบูรณ์");
  console.log("   สมาชิกเดิมต้องกด \"ลืมรหัสผ่าน\" ครั้งเดียวเพื่อตั้งรหัสผ่านใหม่");
  process.exit(0);
})().catch((e) => {
  console.error("✗ FAILED:", e.message);
  process.exit(1);
});
