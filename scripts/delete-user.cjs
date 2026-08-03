// scripts/delete-user.cjs — ลบถาวร — ไม่ลบ banned/{uid} เพื่อกันสมัครกลับด้วย uid เดิม
// ใช้: node --env-file=.env.local scripts/delete-user.cjs <uid>
const { getDb, getAuthAdmin } = require("./lib-admin.cjs");
const { FieldValue } = require("firebase-admin/firestore");
(async () => {
  const uid = process.argv[2];
  if (!uid) throw new Error("ต้องระบุ uid — ใช้: node --env-file=.env.local scripts/delete-user.cjs <uid>");
  const db = getDb(), auth = getAuthAdmin();
  await db.collection("banned").doc(uid).set({ bannedAt: FieldValue.serverTimestamp() });
  await auth.revokeRefreshTokens(uid).catch(() => {});
  await auth.deleteUser(uid).catch((e) => console.warn("  auth:", e.message));
  await db.collection("users").doc(uid).delete();
  console.log(`✅ ลบ ${uid} เรียบร้อย (banned/${uid} ยังอยู่)`);
  process.exit(0);
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
