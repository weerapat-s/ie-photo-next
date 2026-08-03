// scripts/migrate-equipment-status.cjs — borrowed → available (สถานะ "ถูกยืม" ย้ายไปคำนวณจาก slots แทน)
// รัน: node --env-file=.env.local scripts/migrate-equipment-status.cjs
const { getDb } = require("./lib-admin.cjs");
(async () => {
  const db = getDb();
  const snap = await db.collection("equipments").where("status", "==", "borrowed").get();
  for (const d of snap.docs) await d.ref.update({ status: "available" });
  console.log(`✅ equipments: แปลง borrowed → available ${snap.size} ชิ้น`);
  process.exit(0);
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
