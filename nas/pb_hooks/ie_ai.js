// nas/pb_hooks/ie_ai.js — ตัวส่งต่อคำขอไป OKMD AI (ดู ie_ai.pb.js)

const UPSTREAM = "https://gen.ai.kku.ac.th/okmd/api/v1";

function forward(e, path, method) {
  const auth = e.auth;
  const role = auth ? auth.getString("role") : "";
  if (!auth || auth.collection().name !== "users" || (role !== "admin" && role !== "super_admin")) {
    throw new ForbiddenError("ใช้ผู้ช่วย AI ได้เฉพาะกรรมการ");
  }

  let key = "";
  try {
    key = e.app.findRecordById("secrets", "ai").getString("apiKey").trim();
  } catch (_) {}
  if (!key) return e.json(401, { error: { message: "ยังไม่ได้ตั้งคีย์ AI — ไปที่ ตั้งค่า → ผู้ช่วย AI" } });

  let res;
  try {
    res = $http.send({
      url: UPSTREAM + path,
      method: method,
      headers: { "content-type": "application/json", authorization: "Bearer " + key },
      body: method === "POST" ? JSON.stringify(e.requestInfo().body || {}) : "",
      // AI ตอบยาว ๆ ใช้เวลาได้เป็นนาที
      timeout: 120,
    });
  } catch (err) {
    return e.json(502, { error: { message: "ติดต่อ OKMD AI ไม่ได้: " + String(err).slice(0, 160) } });
  }

  // ส่งต่อคำตอบตามตัว (รวมรหัสสถานะ) — ฝั่งเว็บแยกโควตาหมด/คีย์ผิดจากรหัสกับเนื้อความเอง
  return e.blob(res.statusCode, "application/json; charset=utf-8", res.body);
}

module.exports = { forward };
