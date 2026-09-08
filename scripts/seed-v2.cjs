// scripts/seed-v2.cjs — seed ข้อมูลของฟีเจอร์ใหม่: settings/app, photographers, ฟอร์มตัวอย่าง
// idempotent: settings ใช้ merge / photographers+forms seed เฉพาะตอน collection ว่าง
// รัน: node --env-file=.env.local scripts/seed-v2.cjs
const { getDb } = require("./lib-admin.cjs");
const { FieldValue } = require("firebase-admin/firestore");

const settings = {
  siteName: "IE-Photo",
  tagline: "ระบบจองอุปกรณ์ สตูดิโอ และตากล้อง",
  contactPhone: "062-148-1739",
  contactEmail: "ie_photo@kmitl.ac.th",
  galleryUrl: "https://nextcloud.ienas.site/s/z6gZY5wcSiCoXBg",
  accentColor: "#ef3961",

  maxAdvanceDays: 90,
  maxBorrowDays: 7,
  maxStudioHours: 24,
  requireBorrowDocument: true,
  allowGuestStudioBooking: true,
  allowGuestPhotographerBooking: true,

  photographerJobTypes: [
    "งานอีเวนต์ / กิจกรรม",
    "ถ่ายภาพบุคคล / Portrait",
    "ถ่ายภาพสินค้า",
    "ถ่ายวิดีโอ / MV",
    "ไลฟ์สตรีม",
    "ถ่ายภาพหมู่ / รับปริญญา",
  ],
  maxCrewSize: 6,

  nasBaseUrl: "https://nextcloud.ienas.site",
  nasUploadHint: "อัปไฟล์ต้นฉบับทั้งหมดขึ้นโฟลเดอร์ที่ลิงก์ไว้ ห้ามลบไฟล์ของคนอื่น",
  deliveryDefaultDays: 7,

  featureFeed: true,
  featureBorrow: true,
  featureStudio: true,
  featurePhotographer: true,
  featureTasks: true,
  featureForms: true,
  featureDeliveries: true,

  announcement: "",
};

const photographers = [
  {
    name: "ทีมช่างภาพ IE-Photo",
    uid: null,
    role: "ทีมกลาง (จัดคนให้อัตโนมัติ)",
    bio: "ส่งคำขอมาได้เลย ทีมงานจะจัดช่างภาพที่ว่างและถนัดงานของคุณให้",
    skills: ["Event", "Portrait", "Product", "Video"],
    avatarUrl: null,
    status: "open",
    sortOrder: 0,
  },
];

const sampleForm = {
  title: "แบบฟอร์มขอใช้บริการถ่ายภาพ",
  description:
    "กรอกรายละเอียดงานที่ต้องการ ทีมงานจะติดต่อกลับภายใน 1–2 วันทำการ",
  fields: [
    { id: "f_event", type: "text", label: "ชื่องาน/กิจกรรม", placeholder: "เช่น ปฐมนิเทศนักศึกษาใหม่", help: "", required: true, options: [], maxLength: 140, min: null, max: null },
    { id: "f_org", type: "text", label: "หน่วยงาน/ชมรมที่ขอ", placeholder: "", help: "", required: true, options: [], maxLength: 140, min: null, max: null },
    { id: "f_date", type: "datetime", label: "วันและเวลาที่จัดงาน", placeholder: "", help: "", required: true, options: [], maxLength: null, min: null, max: null },
    { id: "f_place", type: "text", label: "สถานที่", placeholder: "เช่น หอประชุมใหญ่", help: "", required: true, options: [], maxLength: 200, min: null, max: null },
    { id: "f_type", type: "checkbox", label: "บริการที่ต้องการ", placeholder: "", help: "เลือกได้มากกว่า 1", required: true, options: ["ถ่ายภาพนิ่ง", "ถ่ายวิดีโอ", "ไลฟ์สตรีม", "ตัดต่อวิดีโอ"], maxLength: null, min: null, max: null },
    { id: "f_crew", type: "number", label: "จำนวนช่างภาพที่ต้องการ", placeholder: "", help: "", required: false, options: [], maxLength: null, min: 1, max: 6 },
    { id: "f_note", type: "textarea", label: "รายละเอียดเพิ่มเติม", placeholder: "ลำดับงาน จุดสำคัญที่ต้องเก็บภาพ ฯลฯ", help: "", required: false, options: [], maxLength: 2000, min: null, max: null },
    { id: "f_doc", type: "image", label: "แนบหนังสือขออนุเคราะห์ (ถ้ามี)", placeholder: "", help: "", required: false, options: [], maxLength: null, min: null, max: null },
  ],
  binding: "none",
  active: true,
  allowGuest: true,
  successMessage: "ขอบคุณครับ ทีมงานได้รับคำขอแล้ว จะติดต่อกลับภายใน 1–2 วันทำการ",
  createdById: "seed",
  responseCount: 0,
};

async function main() {
  const db = getDb();

  // ── settings/app ── merge เพื่อไม่ทับค่าที่แอดมินตั้งไว้แล้ว
  await db.collection("settings").doc("app").set(
    { ...settings, updatedAt: FieldValue.serverTimestamp(), updatedBy: "seed" },
    { merge: true }
  );
  console.log("✓ settings/app");

  // ── photographers ── seed เฉพาะตอนยังว่าง
  const crewSnap = await db.collection("photographers").limit(1).get();
  if (crewSnap.empty) {
    for (const p of photographers) {
      await db.collection("photographers").add(p);
    }
    console.log(`✓ photographers × ${photographers.length}`);
  } else {
    console.log("· photographers มีอยู่แล้ว ข้าม");
  }

  // ── forms ── seed ฟอร์มตัวอย่างเฉพาะตอนยังว่าง
  const formSnap = await db.collection("forms").limit(1).get();
  if (formSnap.empty) {
    await db.collection("forms").add({
      ...sampleForm,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: null,
    });
    console.log("✓ forms × 1 (ฟอร์มตัวอย่าง)");
  } else {
    console.log("· forms มีอยู่แล้ว ข้าม");
  }

  console.log("\nเสร็จแล้ว — เปิดหน้า /settings เพื่อปรับค่าทั้งหมดได้จากเว็บ");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
