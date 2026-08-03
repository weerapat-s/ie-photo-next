// scripts/migrate-push.cjs — pushSubscription (single) → pushSubscriptions (array)
// รัน: node --env-file=.env.local scripts/migrate-push.cjs
const { getDb } = require("./lib-admin.cjs");
const { FieldValue } = require("firebase-admin/firestore");
(async () => {
  const db = getDb();
  const snap = await db.collection("users").get();
  let moved = 0;
  for (const d of snap.docs) {
    const u = d.data();
    if (!u.pushSubscription) continue;
    const list = Array.isArray(u.pushSubscriptions) ? u.pushSubscriptions : [];
    if (!list.some((s) => s.endpoint === u.pushSubscription.endpoint)) list.push(u.pushSubscription);
    await d.ref.update({ pushSubscriptions: list, pushSubscription: FieldValue.delete() });
    moved++;
  }
  console.log(`✅ push: ย้าย ${moved} บัญชี`);
  process.exit(0);
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
