/// <reference path="../pb_data/types.d.ts" />
// nas/pb_hooks/ie_ai.pb.js — ทางผ่านไป OKMD AI (gen.ai.kku.ac.th) แทน Worker okmd-proxy
//
// ทำไมต้องมีทางผ่าน: gen.ai.kku.ac.th ไม่ส่งหัว CORS เบราว์เซอร์เรียกตรงไม่ได้
// เดิมใช้ Worker okmd-proxy แต่ตัวนั้นอยู่บัญชี Cloudflare ที่ไม่มีใครเข้าได้แล้ว และรับเฉพาะ
// iephoto.web.app — ย้ายเว็บมา NAS แล้วเรียกไม่ได้ จึงให้ NAS ส่งต่อเอง (โดเมนเดียวกับเว็บ ไม่ติด CORS)
//
// คีย์ OKMD อ่านจาก secrets/ai ฝั่งเซิร์ฟเวอร์ — ไม่ต้องเดินทางผ่านเบราว์เซอร์อีก
// ใช้ได้เฉพาะกรรมการ (ตรงกับกติกาเดิมที่อ่าน secrets/ai ได้แค่แอดมิน)

routerAdd("POST", "/api/ie/ai/chat/completions", (e) => {
  return require(`${__hooks}/ie_ai.js`).forward(e, "/chat/completions", "POST");
});

routerAdd("GET", "/api/ie/ai/models", (e) => {
  return require(`${__hooks}/ie_ai.js`).forward(e, "/models", "GET");
});
