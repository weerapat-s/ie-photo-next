// อัปเดตเฉพาะ contactPhone ของทุก studio (ไม่แตะ field อื่น)
const { getDb } = require("./lib-admin.cjs");
const PHONE = process.argv[2] || "062-148-1739";
(async () => {
  const db = getDb();
  const snap = await db.collection("studios").get();
  for (const d of snap.docs) {
    await d.ref.update({ contactPhone: PHONE });
    console.log(`✓ ${d.id}: contactPhone → ${PHONE}`);
  }
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
