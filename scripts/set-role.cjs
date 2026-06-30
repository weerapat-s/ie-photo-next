// scripts/set-role.cjs — ตั้ง role ให้ user (custom claim + Firestore doc)
// ใช้ bootstrap แอดมินคนแรก
// รัน: node --env-file=.env.local scripts/set-role.cjs <email> <member|admin|super_admin>
const { getDb, getAuthAdmin } = require("./lib-admin.cjs");

const [, , email, role] = process.argv;
const VALID = ["member", "admin", "super_admin"];

if (!email || !VALID.includes(role)) {
  console.error("ใช้: node --env-file=.env.local scripts/set-role.cjs <email> <member|admin|super_admin>");
  process.exit(1);
}

(async () => {
  const auth = getAuthAdmin();
  const db = getDb();
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { role });
  await db.collection("users").doc(user.uid).set({ role }, { merge: true });
  console.log(`✓ ตั้ง ${email} เป็น "${role}" แล้ว (uid: ${user.uid})`);
  console.log("  → ผู้ใช้แค่ refresh หน้าเว็บ (role อ่านจาก Firestore doc ทุกครั้งที่โหลด)");
  process.exit(0);
})().catch((e) => {
  console.error("✗ FAILED:", e.message);
  if (e.code === "auth/user-not-found") console.error("  → ยังไม่มี user อีเมลนี้ (ต้องสมัครก่อน)");
  process.exit(1);
});
