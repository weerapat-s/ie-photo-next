// scripts/check-user.cjs — เช็คสถานะบัญชี (ไม่มีทางดูรหัสผ่านได้ — เข้ารหัสแบบถอดไม่ได้)
const { getDb, getAuthAdmin } = require("./lib-admin.cjs");
(async () => {
  const email = process.argv[2];
  const auth = getAuthAdmin();
  const db = getDb();
  try {
    const u = await auth.getUserByEmail(email);
    const doc = await db.collection("users").doc(u.uid).get();
    const data = doc.data() || {};
    console.log(JSON.stringify({
      uid: u.uid,
      email: u.email,
      emailVerified: u.emailVerified,
      disabled: u.disabled,
      createdAt: u.metadata.creationTime,
      lastSignIn: u.metadata.lastSignInTime,
      hasPasswordSet: !!u.passwordHash, // มีรหัสผ่านตั้งไว้ไหม (ไม่ใช่ค่ารหัสผ่าน)
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      role: data.role,
      profileCompleted: data.profileCompleted,
    }, null, 2));
  } catch (e) {
    console.error("ไม่พบบัญชี:", e.message);
  }
  process.exit(0);
})();
