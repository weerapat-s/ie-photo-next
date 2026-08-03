// scripts/migrate-slots.cjs — สร้าง slot จาก booking ที่ยังมีผล (pending/approved) — idempotent, slot id = booking id
// รัน: node --env-file=.env.local scripts/migrate-slots.cjs
const { getDb } = require("./lib-admin.cjs");
(async () => {
  const db = getDb();
  const snap = await db.collection("bookings").where("status", "in", ["pending", "approved"]).get();
  let made = 0, skipped = 0;
  for (const d of snap.docs) {
    const b = d.data();
    const ref = db.collection("slots").doc(d.id);
    if ((await ref.get()).exists) { skipped++; continue; }
    await ref.set({
      bookingId: d.id,
      itemId: b.itemId,
      itemName: b.itemName,
      bookingType: b.bookingType,
      startAt: b.startAt,
      endAt: b.endAt,
      status: b.status === "approved" ? "approved" : "pending",
    });
    made++;
  }
  console.log(`✅ slots: สร้าง ${made} · ข้าม ${skipped}`);
  process.exit(0);
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
