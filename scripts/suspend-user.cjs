// scripts/suspend-user.cjs — ระงับบัญชีแบบสมบูรณ์: ตัด token + บล็อก rules + ตั้ง flag ให้ UI
// ใช้: node --env-file=.env.local scripts/suspend-user.cjs <uid>
const { getDb, getAuthAdmin } = require("./lib-admin.cjs");
const { FieldValue } = require("firebase-admin/firestore");
(async () => {
  const uid = process.argv[2];
  if (!uid) throw new Error("ต้องระบุ uid — ใช้: node --env-file=.env.local scripts/suspend-user.cjs <uid>");
  const db = getDb(), auth = getAuthAdmin();
  await auth.updateUser(uid, { disabled: true });     // 1) กัน login ใหม่
  await auth.revokeRefreshTokens(uid);                // 2) ตัด session ที่ค้างอยู่
  await db.collection("banned").doc(uid).set({ bannedAt: FieldValue.serverTimestamp() });  // 3) บล็อก rules
  await db.collection("users").doc(uid).update({ disabled: true }).catch(() => {});        // 4) UI indicator
  console.log(`✅ ระงับ ${uid} เรียบร้อย`);
  process.exit(0);
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
