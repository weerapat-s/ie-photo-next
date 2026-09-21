// scripts/export-firestore.mjs — ดึงข้อมูลทั้งหมดจาก Firestore + Firebase Auth เตรียมย้ายขึ้น NAS
//
// รัน:  node --env-file=.env.local --experimental-strip-types scripts/export-firestore.mjs
// ได้:  .nas-import/   (อยู่ใน .gitignore — มีข้อมูลส่วนตัวสมาชิก ห้าม commit)
//         <collection>.json   เรคคอร์ดที่แปลงเป็นรูปแบบของ PocketBase แล้ว (id เดิมทุกตัว)
//         auth-users.json     บัญชีจาก Firebase Auth (uid, อีเมล)
//         files/*             รูปเอกสารการยืมที่เคยฝังเป็น data URL ในคำขอ
//         nc-paths.txt        รูปที่อยู่บน Nextcloud (borrow/...) — nas/import.sh คัดลอกให้บน NAS
//         report.json         ช่องที่ไม่มีใน lib/db/schema.ts (ต้องเป็นศูนย์ก่อนย้ายจริง)
// แล้วต่อด้วย bash nas/import.sh ส่งขึ้น NAS และนำเข้า PocketBase
//
// อ่านทุกเอกสารครั้งเดียว — Firestore รุ่นฟรีคิดโควตาอ่านตามขนาด รันตอนโควตาเพิ่งรีเซ็ต (14:00 น.)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { SCHEMA } from "../lib/db/schema.ts";

const require = createRequire(import.meta.url);
const { getDb, getAuthAdmin } = require("./lib-admin.cjs");

const OUT = path.join(import.meta.dirname, "..", ".nas-import");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "files"), { recursive: true });

const db = getDb();

/** รูปในคำขอยืมเป็นเอกสารส่วนตัว → ย้ายเป็นไฟล์ protected บน NAS (ที่อื่นเป็นรูปสาธารณะ ฝังต่อได้) */
const FILE_FIELDS = { formImageUrl: "form", returnImageUrl: "return", handoverImageUrl: "handover" };

const isTs = (v) => v && typeof v === "object" && typeof v.toDate === "function";
const iso = (v) => (isTs(v) ? v.toDate().toISOString() : v instanceof Date ? v.toISOString() : null);

/** Timestamp ที่ซ้อนใน map/array → ISO */
function plain(v) {
  const t = iso(v);
  if (t) return t;
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = plain(x);
    return o;
  }
  return v;
}

const report = { unknownFields: {}, coerced: [], files: 0, ncPaths: 0 };

function convert(name, id, def, field, v) {
  switch (def.kind) {
    case "date": {
      if (v == null || v === "") return "";
      const t = iso(v) ?? (typeof v === "string" && !isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
      if (t === null) report.coerced.push(`${name}/${id}.${field}: date ${JSON.stringify(v).slice(0, 60)} → ""`);
      return t ?? "";
    }
    case "text":
    case "longtext":
      if (v == null) return "";
      if (typeof v === "string") return v;
      report.coerced.push(`${name}/${id}.${field}: ${typeof v} → text`);
      return typeof v === "object" ? JSON.stringify(plain(v)) : String(v);
    case "number":
      if (v == null || v === "") return 0;
      if (typeof v === "number") return v;
      report.coerced.push(`${name}/${id}.${field}: ${typeof v} ${String(v).slice(0, 30)} → number`);
      return Number(v) || 0;
    case "bool":
      return v === true;
    case "json":
      return v === undefined ? null : plain(v);
  }
}

let fileSeq = 0;
function extractFile(name, id, field, value, owner, createdAt) {
  if (typeof value !== "string" || !value) return value;
  const kind = FILE_FIELDS[field];
  if (value.startsWith("data:")) {
    const m = /^data:(image\/[a-z+]+);base64,(.*)$/s.exec(value);
    if (!m) return value;
    const ext = m[1] === "image/png" ? "png" : m[1] === "image/webp" ? "webp" : "jpg";
    const fname = `${id}-${field}-${++fileSeq}.${ext}`;
    fs.writeFileSync(path.join(OUT, "files", fname), Buffer.from(m[2], "base64"));
    report.files++;
    return { "@file": `files/${fname}`, owner, kind, createdAt };
  }
  if (value.startsWith("borrow/")) {
    report.ncPaths++;
    fs.appendFileSync(path.join(OUT, "nc-paths.txt"), value + "\n");
    return { "@file": `nc/${value}`, owner, kind, createdAt };
  }
  return value;
}

for (const [name, def] of Object.entries(SCHEMA)) {
  const snap = await db.collection(name).get();
  const rows = [];
  for (const d of snap.docs) {
    const data = d.data();
    const row = { id: d.id };
    for (const [field, fdef] of Object.entries(def)) row[field] = convert(name, d.id, fdef, field, data[field]);
    if (name === "users") row.email = typeof data.email === "string" ? data.email : "";
    for (const k of Object.keys(data)) {
      if (!(k in def) && !(name === "users" && k === "email")) {
        const u = (report.unknownFields[name] ??= {});
        u[k] = (u[k] ?? 0) + 1;
      }
    }
    if (name === "bookings") {
      for (const f of Object.keys(FILE_FIELDS)) {
        row[f] = extractFile(name, d.id, f, row[f], row.userId || "", row.createdAt || "");
      }
    }
    rows.push(row);
  }
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(rows));
  console.log(`${name.padEnd(14)} ${String(rows.length).padStart(5)} รายการ`);
}

// บัญชีจาก Firebase Auth — บางคนอาจมีบัญชีแต่ไม่มีเอกสาร users (สมัครค้าง)
const authUsers = [];
let pageToken;
do {
  const page = await getAuthAdmin().listUsers(1000, pageToken);
  for (const u of page.users) authUsers.push({ uid: u.uid, email: (u.email || "").toLowerCase(), disabled: u.disabled });
  pageToken = page.pageToken;
} while (pageToken);
fs.writeFileSync(path.join(OUT, "auth-users.json"), JSON.stringify(authUsers));
console.log(`${"auth-users".padEnd(14)} ${String(authUsers.length).padStart(5)} บัญชี`);

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(`\nรูปที่แยกเป็นไฟล์: ${report.files} · รูปบน Nextcloud: ${report.ncPaths}`);
console.log(`ช่องที่ไม่มีใน schema: ${JSON.stringify(report.unknownFields)}`);
if (report.coerced.length) console.log(`แปลงชนิดค่า ${report.coerced.length} จุด (ดู report.json)`);
process.exit(0);
