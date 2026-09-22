// nas/pb_hooks/ie_auth.js — ล็อกอินครั้งแรกของบัญชีที่ย้ายมาจาก Firebase
//
// รหัสผ่านเดิมอยู่ใน Firebase Auth และย้ายออกมาไม่ได้ บัญชีที่ย้ายมาจึงมี
// legacyAuth = true (ดู pb_migrations/1758480200_auth.js)
//
// ขั้นตอน: เว็บลองล็อกอินกับ NAS ก่อน ถ้าไม่ผ่านจึงเรียก /api/ie/legacy-login
//   1. หาบัญชีจากอีเมล ต้องยังเป็น legacyAuth (ย้ายแล้วใช้เส้นนี้ไม่ได้อีก)
//   2. NAS ถาม Firebase เองว่ารหัสนี้ถูกไหม (signInWithPassword ของ Identity Toolkit)
//      และ uid ที่ Firebase ตอบต้องตรงกับ id ของบัญชีบน NAS
//   3. ถูก → ตั้งรหัสนี้เป็นรหัสบน NAS ปิด legacyAuth แล้วคืน token เหมือนล็อกอินปกติ
//
// เว็บไม่ได้เป็นคนบอกว่า "Firebase ยืนยันแล้ว" — NAS คุยกับ Google ตรงผ่าน HTTPS เอง
// จึงปลอมไม่ได้ ส่วนการเดารหัสผ่านโดน rate limit ทั้งของ NAS และของ Firebase
//
// ต้องตั้ง FIREBASE_WEB_API_KEY ใน container (nas/deploy.sh อ่านจาก .env.local)
// — เป็นคีย์สาธารณะของเว็บเดิม ฝังอยู่ในไฟล์ JS ของ iephoto.web.app อยู่แล้ว ไม่ใช่ความลับ

const FAIL = "Failed to authenticate.";

function legacyLogin(e) {
  const body = e.requestInfo().body || {};
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || password.length < 6 || password.length > 200) throw new BadRequestError(FAIL);

  let rec;
  try {
    rec = e.app.findAuthRecordByEmail("users", email);
  } catch (_) {
    throw new BadRequestError(FAIL);
  }
  if (!rec.getBool("legacyAuth")) throw new BadRequestError(FAIL);

  const key = $os.getenv("FIREBASE_WEB_API_KEY");
  if (!key) {
    e.app.logger().error("legacy-login: ยังไม่ได้ตั้ง FIREBASE_WEB_API_KEY");
    throw new BadRequestError(FAIL);
  }

  let res;
  try {
    res = $http.send({
      url: "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + encodeURIComponent(key),
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email, password: password, returnSecureToken: false }),
      timeout: 15,
    });
  } catch (err) {
    e.app.logger().error("legacy-login: ต่อ Firebase ไม่ได้", "error", String(err));
    throw new ApiError(503, "ตรวจรหัสผ่านเดิมไม่ได้ชั่วคราว ลองใหม่อีกครั้ง");
  }

  if (res.statusCode !== 200 || !res.json || res.json.localId !== rec.id) {
    // เก็บเหตุผลจาก Firebase ไว้ไล่ปัญหา (เช่น INVALID_LOGIN_CREDENTIALS / คีย์ใช้ไม่ได้) — ไม่เก็บรหัสผ่าน
    const why = res.json && res.json.error ? res.json.error.message : res.json && res.json.localId ? "uid ไม่ตรง" : "";
    e.app.logger().info("legacy-login: Firebase ไม่ผ่าน", "user", rec.id, "status", res.statusCode, "reason", why);
    throw new BadRequestError(FAIL);
  }

  rec.setPassword(password);
  rec.set("legacyAuth", false);
  e.app.save(rec);

  return $apis.recordAuthResponse(e, rec, "password", null);
}

module.exports = { legacyLogin };
