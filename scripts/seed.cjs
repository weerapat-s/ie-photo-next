// scripts/seed.cjs — seed ข้อมูลอ้างอิง (equipments + studios) ลง Firestore
// idempotent: studios ใช้ doc id คงที่ / equipments seed เฉพาะตอน collection ว่าง
// รัน: node --env-file=.env.local scripts/seed.cjs
const { getDb } = require("./lib-admin.cjs");
const { FieldValue } = require("firebase-admin/firestore");

const equipments = [
  { name: "Sony A7 III", type: "camera", status: "available" },
  { name: "Canon EOS R5", type: "camera", status: "available" },
  { name: "Nikon Z6 II", type: "camera", status: "available" },
  { name: "Lens 50mm f/1.8", type: "lens", status: "available" },
  { name: "Lens 24-70mm f/2.8", type: "lens", status: "available" },
  { name: "DJI Ronin-S", type: "accessory", status: "available" },
  { name: "Godox AD200 Pro", type: "accessory", status: "available" },
  { name: "Tripod Manfrotto", type: "accessory", status: "available" },
];

const studios = [
  {
    id: "1",
    name: "Studio 1",
    status: "open",
    subtitle: "Professional Lighting",
    tags: ["📸 Portrait", "👗 Fashion", "🎬 MV"],
    features: [
      "ชุดไฟ Strobe 4 จุด + Softbox",
      "พื้นหลัง Seamless ขาว / ดำ / เทา",
      "ขนาดพื้นที่ ~6×8 เมตร",
      "มีอุปกรณ์เสริม: Reflector, Stand",
    ],
    openHours: "จ–ศ 08:00–20:00 น. / ส–อา 09:00–17:00 น.",
    contactPhone: "096-954-5290",
    theme: "dark",
  },
  {
    id: "2",
    name: "Studio 2",
    status: "open",
    subtitle: "Natural Light / Minimal",
    tags: ["📦 Product", "🌿 Lifestyle", "🎥 Vlog"],
    features: [
      "หน้าต่างแสงธรรมชาติขนาดใหญ่",
      "พื้นหลัง White Infinity Cyc Wall",
      "ขนาดพื้นที่ ~5×6 เมตร",
      "เหมาะงาน minimal, clean-look",
    ],
    openHours: "จ–ศ 08:00–20:00 น. / ส–อา 09:00–17:00 น.",
    contactPhone: "096-954-5290",
    theme: "light",
  },
];

async function main() {
  const db = getDb();

  // ── studios — doc id คงที่ "1"/"2" → set() idempotent ──
  for (const s of studios) {
    const { id, ...data } = s;
    await db.collection("studios").doc(id).set(data, { merge: true });
    console.log(`✓ studio ${id}: ${data.name}`);
  }

  // ── equipments — seed เฉพาะตอนยังว่าง (กัน duplicate) ──
  const existing = await db.collection("equipments").limit(1).get();
  if (existing.empty) {
    for (const e of equipments) {
      await db.collection("equipments").add({ ...e, createdAt: FieldValue.serverTimestamp() });
      console.log(`✓ equipment: ${e.name}`);
    }
  } else {
    console.log("• equipments มีข้อมูลอยู่แล้ว — ข้าม");
  }

  console.log("\n✅ seed เสร็จสมบูรณ์");
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ seed FAILED:", e.code || "", e.message);
  process.exit(1);
});
