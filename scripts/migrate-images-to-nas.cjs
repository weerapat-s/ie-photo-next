// scripts/migrate-images-to-nas.cjs — ย้ายรูปที่ฝังอยู่ในคำขอยืมเก่าออกไปไว้บน NAS
//
// รัน (ตรวจอย่างเดียว ไม่แก้อะไร):  node --env-file=.env.local scripts/migrate-images-to-nas.cjs
// รันจริง:                          node --env-file=.env.local scripts/migrate-images-to-nas.cjs --apply
//
// ═══ ทำไมต้องย้าย ═══════════════════════════════════════════════
//
// คำขอยืมรุ่นแรกเก็บรูปเอกสาร/รูปตอนคืนเป็น data URL ฝังลงเอกสาร booking ตรง ๆ
// (ใบละหลายร้อย KB) Firestore รุ่นนี้คิดโควตาอ่านตามขนาดเอกสาร ทุกหน้าที่โหลด
// รายการคำขอ (ภาพรวม · รายการจอง · ทะเบียนการยืม ฯลฯ) จึงโหลดรูปพวกนี้มาด้วยทุกครั้ง
// จนโควตาอ่านรายวันหมดทั้งโปรเจกต์ เว็บใช้ไม่ได้ทั้งวัน (เกิดจริง 21 ก.ย. 2026)
// คำขอใหม่เก็บบน NAS อยู่แล้ว (PR #11) — สคริปต์นี้จัดการของเก่าที่ค้างอยู่
//
// ═══ กันข้อมูลหาย ═══════════════════════════════════════════════
//
//   1. สำรองรูปเดิมลงเครื่องก่อน (โฟลเดอร์ BACKUP_DIR) ทุกรูป ก่อนแตะฐานข้อมูล
//   2. อัปขึ้น NAS ผ่าน Worker iephoto-nas ทางเดียวกับหน้าเว็บ แล้ว "อ่านกลับมาเทียบ"
//      ไบต์ต้องตรงกันทุกตัว ถึงจะเปลี่ยนฟิลด์เป็น path ไม่ตรง = ข้ามใบนั้น ไม่แตะ
//   3. แตะเฉพาะค่าที่ขึ้นต้นด้วย data:image/ — path บน NAS กับลิงก์ภายนอกไม่ยุ่ง
//      รันซ้ำกี่รอบก็ได้ รอบหลังจะไม่เจออะไรให้ย้าย
//
// หน้าเว็บแสดงได้ทั้งแบบเก่าและใหม่อยู่แล้ว (components/nas-image.tsx) ไม่ต้องแก้หน้าไหนเพิ่ม
//
// ต้องรันตอนโควตาอ่านยังเหลือ — สคริปต์อ่านคำขอทุกใบครั้งเดียว (รวมรูป) เท่ากับเปิด
// หน้ารายการจองหนึ่งครั้ง หลังย้ายเสร็จ ทุกหน้าจะเบาลงถาวร
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { getDb, getAuthAdmin } = require("./lib-admin.cjs");

const APPLY = process.argv.includes("--apply");
const WORKER = "https://iephoto-nas.vaumgasem.workers.dev";
const SITE = "https://iephoto.web.app";
const PROBE_UID = "image-migration-bot";
const BACKUP_DIR = path.join(os.homedir(), "ie-photo-image-backup");

/** ฟิลด์รูปใน booking → ชนิดไฟล์บน NAS (Worker รับแค่ form | return) */
const FIELDS = { formImageUrl: "form", returnImageUrl: "return", handoverImageUrl: "form" };

const isDataImage = (v) => typeof v === "string" && v.startsWith("data:image/");
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

function decode(dataUrl) {
  const comma = dataUrl.indexOf(",");
  return Buffer.from(dataUrl.slice(comma + 1), "base64");
}

async function idToken(auth) {
  const custom = await auth.createCustomToken(PROBE_UID);
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Referer: `${SITE}/` },
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    }
  );
  const j = await r.json();
  if (!j.idToken) throw new Error("ขอ token ไม่ได้: " + JSON.stringify(j.error || j).slice(0, 150));
  return j.idToken;
}

async function uploadAndVerify(token, bytes, kind) {
  const H = { Origin: SITE, Authorization: `Bearer ${token}` };
  const up = await fetch(`${WORKER}/nas/upload?kind=${kind}`, {
    method: "POST",
    headers: { ...H, "Content-Type": "image/jpeg" },
    body: bytes,
  });
  const body = await up.json().catch(() => ({}));
  if (!up.ok || !body.path) throw new Error(`อัปไม่สำเร็จ ${up.status} ${body.error || ""}`);

  const down = await fetch(`${WORKER}/nas/file?p=${encodeURIComponent(body.path)}`, { headers: H });
  const got = Buffer.from(await down.arrayBuffer());
  if (!down.ok || !got.equals(bytes)) throw new Error(`อ่านกลับไม่ตรง (${down.status}, ${got.length}/${bytes.length} ไบต์)`);
  return body.path;
}

(async () => {
  const db = getDb();
  const auth = getAuthAdmin();

  console.log(APPLY ? "=== รันจริง ===" : "=== ตรวจอย่างเดียว (ใส่ --apply เพื่อย้ายจริง) ===");
  const snap = await db.collection("bookings").get();

  const todo = [];
  let totalBytes = 0;
  for (const d of snap.docs) {
    const data = d.data();
    for (const [field, kind] of Object.entries(FIELDS)) {
      if (isDataImage(data[field])) {
        const size = Buffer.byteLength(data[field]);
        totalBytes += size;
        todo.push({ id: d.id, field, kind, value: data[field], size });
      }
    }
  }
  console.log(`คำขอทั้งหมด ${snap.size} ใบ · มีรูปฝังอยู่ ${todo.length} รูป · รวม ${kb(totalBytes)}`);
  for (const t of todo) console.log(`  ${t.id}  ${t.field.padEnd(16)} ${kb(t.size)}`);

  // รายงานขนาดของที่เหลือ เพื่อรู้ว่าอะไรกินโควตาต่อ (ไม่ย้าย — หน้าอื่นยังแสดงแบบ data URL)
  for (const [col, field] of [["users", "profileImageUrl"], ["equipments", "imageUrl"]]) {
    const s = await db.collection(col).select(field).get();
    const sizes = s.docs.map((x) => x.get(field)).filter(isDataImage).map((v) => Buffer.byteLength(v));
    const sum = sizes.reduce((a, b) => a + b, 0);
    console.log(`(รายงาน) ${col}.${field}: ${sizes.length} รูป รวม ${kb(sum)} · ใหญ่สุด ${kb(Math.max(0, ...sizes))}`);
  }

  if (!APPLY || todo.length === 0) {
    console.log(todo.length ? "\nยังไม่ได้แก้อะไร — ใส่ --apply เพื่อย้ายจริง" : "\nไม่มีอะไรต้องย้ายแล้ว");
    process.exit(0);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const token = await idToken(auth);
  let moved = 0;
  let failed = 0;
  try {
    for (const t of todo) {
      const bytes = decode(t.value);
      // 1) สำรองก่อนแตะอะไรทั้งนั้น
      fs.writeFileSync(path.join(BACKUP_DIR, `${t.id}.${t.field}.jpg`), bytes);
      try {
        // 2) อัป + อ่านกลับมาเทียบ
        const nasPath = await uploadAndVerify(token, bytes, t.kind);
        // 3) เปลี่ยนฟิลด์ก็ต่อเมื่อค่ายังเป็นรูปเดิม — กันทับของที่มีคนแก้ระหว่างรัน
        await db.runTransaction(async (tx) => {
          const ref = db.collection("bookings").doc(t.id);
          const cur = await tx.get(ref);
          if (cur.get(t.field) !== t.value) throw new Error("ค่าเปลี่ยนไประหว่างรัน — ข้าม");
          tx.update(ref, { [t.field]: nasPath });
        });
        moved++;
        console.log(`  ✓ ${t.id} ${t.field} → ${nasPath}`);
      } catch (e) {
        failed++;
        console.log(`  ✗ ${t.id} ${t.field}: ${e.message}`);
      }
    }
  } finally {
    await auth.deleteUser(PROBE_UID).catch(() => {});
  }
  console.log(`\nย้ายแล้ว ${moved} · ข้าม ${failed} · สำรองรูปเดิมไว้ที่ ${BACKUP_DIR}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
