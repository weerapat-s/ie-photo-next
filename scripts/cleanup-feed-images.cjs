// scripts/cleanup-feed-images.cjs — ล้าง base64 เอกสารที่ฝังใน feed ย้อนหลัง + เติมฟิลด์ like ที่ rules ใหม่ต้องใช้
// รัน: node --env-file=.env.local scripts/cleanup-feed-images.cjs
const { getDb } = require("./lib-admin.cjs");
(async () => {
  const db = getDb();
  const snap = await db.collection("feeds").get();
  let cleared = 0, filled = 0;
  for (const d of snap.docs) {
    const f = d.data();
    const patch = {};
    if (f.formImageUrl) { patch.formImageUrl = null; cleared++; }
    if (!Array.isArray(f.likedBy)) { patch.likedBy = []; filled++; }
    if (typeof f.likeCount !== "number") patch.likeCount = 0;
    if (Object.keys(patch).length) await d.ref.update(patch);
  }
  console.log(`✅ feeds: ล้างรูป ${cleared} · เติม likedBy ${filled}`);
  process.exit(0);
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
