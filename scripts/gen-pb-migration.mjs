// scripts/gen-pb-migration.mjs — สร้าง migration ของ PocketBase จาก lib/db/schema.ts
//
// รัน: node --experimental-strip-types scripts/gen-pb-migration.mjs
// ผลลัพธ์: nas/pb_migrations/1758480100_collections.js
//
// โครงตาราง (ช่อง/ชนิด) มาจาก lib/db/schema.ts ที่เดียว — ชั้นข้อมูลฝั่งเว็บใช้ไฟล์เดียวกัน
// กติกาสิทธิ์ "หยาบ" (ใครอ่าน/เขียนตารางไหนได้) อยู่ในไฟล์นี้ (RULES ข้างล่าง)
// กติกา "ละเอียด" (แตะได้แค่ช่องไหน ค่าต้องอยู่ในกรอบไหน) อยู่ใน nas/pb_hooks
// — แปลตรงตัวจาก firestore.rules เดิม บรรทัดต่อบรรทัด
//
// migration ที่ขึ้น NAS ไปแล้วห้ามแก้ (PocketBase รันแต่ละไฟล์ครั้งเดียว)
// ถ้าต้องเปลี่ยนโครง ให้สร้าง migration ใหม่ ไม่ใช่รันสคริปต์นี้ทับ
import fs from "node:fs";
import path from "node:path";
import { SCHEMA } from "../lib/db/schema.ts";

const OUT = path.join(import.meta.dirname, "..", "nas", "pb_migrations", "1758480100_collections.js");

// ── กติกาสิทธิ์ของ PocketBase ─────────────────────────────────────
// "" = ทุกคน (รวมคนไม่ล็อกอิน) · null = superuser เท่านั้น
const AUTHED = '@request.auth.id != ""';
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "super_admin")';
const ONLY_ADMIN = { list: ADMIN, view: ADMIN, create: ADMIN, update: ADMIN, delete: ADMIN };
const PUBLIC_READ_ADMIN_WRITE = { list: "", view: "", create: ADMIN, update: ADMIN, delete: ADMIN };
const AUTHED_READ_ADMIN_WRITE = { list: AUTHED, view: AUTHED, create: ADMIN, update: ADMIN, delete: ADMIN };

/** ทีมงาน = มี record ใน crew ที่ id = uid (แทน exists(/crew/$(uid)) ของ Firestore) */
const IS_CREW = "@collection.crew.id ?= @request.auth.id";
/** ผู้เกี่ยวข้องกับงานส่งไฟล์ — ตรง ๆ หรือผ่านใบจองที่ผูกกันอยู่ (inDelivery เดิม) */
const IN_DELIVERY =
  "(assignedToId = @request.auth.id || assigneeIds ~ @request.auth.id" +
  " || (@collection.bookings:b.id = bookingId && @collection.bookings:b.assigneeIds ~ @request.auth.id))";

const RULES = {
  settings: PUBLIC_READ_ADMIN_WRITE,
  secrets: ONLY_ADMIN,
  aiChats: ONLY_ADMIN,
  mailQueue: { list: ADMIN, view: ADMIN, create: AUTHED, update: ADMIN, delete: ADMIN },
  users: {
    list: `id = @request.auth.id || ${ADMIN}`,
    view: `id = @request.auth.id || ${ADMIN}`,
    // สมัครเองได้ — hook บังคับ role = member เสมอ
    create: "",
    update: `id = @request.auth.id || ${ADMIN}`,
    delete: ADMIN,
  },
  banned: {
    list: `id = @request.auth.id || ${ADMIN}`,
    view: `id = @request.auth.id || ${ADMIN}`,
    create: ADMIN,
    update: ADMIN,
    delete: ADMIN,
  },
  crew: AUTHED_READ_ADMIN_WRITE,
  availability: {
    list: AUTHED,
    view: AUTHED,
    create: `${AUTHED} && (@request.body.id = @request.auth.id || ${ADMIN})`,
    update: `${AUTHED} && (id = @request.auth.id || ${ADMIN})`,
    delete: `${AUTHED} && (id = @request.auth.id || ${ADMIN})`,
  },
  equipments: AUTHED_READ_ADMIN_WRITE,
  studios: PUBLIC_READ_ADMIN_WRITE,
  photographers: PUBLIC_READ_ADMIN_WRITE,
  // ตารางเวลาล้วน อ่านสาธารณะ — คนนอกต้องเช็คเวลาซ้อนได้ก่อนส่งคำขอ
  slots: { list: "", view: "", create: "", update: ADMIN, delete: ADMIN },
  bookings: {
    list:
      `${ADMIN} || (${AUTHED} && userId = @request.auth.id)` +
      ` || (${IS_CREW} && bookingType = "photographer"` +
      ` && (status = "approved" || status = "pending_return" || status = "returned"))`,
    view:
      `${ADMIN} || (${AUTHED} && userId = @request.auth.id)` +
      ` || (${IS_CREW} && bookingType = "photographer"` +
      ` && (status = "approved" || status = "pending_return" || status = "returned"))`,
    // คนนอก สมาชิก แอดมิน สร้างได้ทั้งหมด — hook ตรวจตามบทบาท
    create: "",
    update: `${ADMIN} || (${AUTHED} && userId = @request.auth.id) || (${IS_CREW} && bookingType = "photographer")`,
    delete: ADMIN,
  },
  tasks: {
    list: `${AUTHED} && (${ADMIN} || assignedToId = @request.auth.id || assignedById = @request.auth.id)`,
    view: `${AUTHED} && (${ADMIN} || assignedToId = @request.auth.id || assignedById = @request.auth.id)`,
    create: ADMIN,
    update: `${ADMIN} || (${AUTHED} && assignedToId = @request.auth.id)`,
    delete: ADMIN,
  },
  feeds: { list: AUTHED, view: AUTHED, create: ADMIN, update: AUTHED, delete: ADMIN },
  forms: { list: "", view: "", create: ADMIN, update: "", delete: ADMIN },
  formResponses: {
    list: `${ADMIN} || (${AUTHED} && userId = @request.auth.id)`,
    view: `${ADMIN} || (${AUTHED} && userId = @request.auth.id)`,
    create: "",
    update: ADMIN,
    delete: ADMIN,
  },
  deliveries: {
    list: `${AUTHED} && (${ADMIN} || customerUserId = @request.auth.id || ${IN_DELIVERY})`,
    view: `${AUTHED} && (${ADMIN} || customerUserId = @request.auth.id || ${IN_DELIVERY})`,
    create: ADMIN,
    update: `${AUTHED} && (${ADMIN} || ${IN_DELIVERY})`,
    delete: ADMIN,
  },
};

// ── ชนิดช่อง → ช่องของ PocketBase ─────────────────────────────────
function field(name, def) {
  switch (def.kind) {
    case "text":
      return { name, type: "text", max: 5000 };
    case "longtext":
      // รูปเดิมที่เป็น data URL ยาวได้หลายแสนตัวอักษร — ต้องเพดานสูง
      return { name, type: "text", max: 2000000 };
    case "number":
      return { name, type: "number" };
    case "bool":
      return { name, type: "bool" };
    case "date":
      return { name, type: "date" };
    case "json":
      // คำตอบฟอร์มฝังรูปได้ — เผื่อ 5 MB
      return { name, type: "json", maxSize: 5000000 };
    default:
      throw new Error(`unknown kind ${def.kind} (${name})`);
  }
}

/** รับ ID เดิมของ Firestore/Firebase ได้ — ของใหม่สุ่ม 20 ตัวเหมือน Firestore */
const ID_FIELD = {
  name: "id",
  type: "text",
  primaryKey: true,
  system: true,
  required: true,
  min: 1,
  max: 40,
  pattern: "^[A-Za-z0-9_-]+$",
  autogeneratePattern: "[a-zA-Z0-9]{20}",
};

// ── สร้างไฟล์ migration ───────────────────────────────────────────
const base = Object.keys(SCHEMA).filter((n) => n !== "users");
for (const n of Object.keys(SCHEMA)) {
  if (!RULES[n]) throw new Error(`ยังไม่ได้กำหนดกติกาของ ${n}`);
}

const collections = base.map((name) => ({
  name,
  fields: [ID_FIELD, ...Object.entries(SCHEMA[name]).map(([f, d]) => field(f, d))],
  rules: RULES[name],
}));

const usersFields = Object.entries(SCHEMA.users).map(([f, d]) => field(f, d));

const js = `/// <reference path="../pb_data/types.d.ts" />
// สร้างโดย scripts/gen-pb-migration.mjs จาก lib/db/schema.ts — ห้ามแก้ด้วยมือ
// ตารางทั้งหมดของ IE-Photo + กติกาสิทธิ์หยาบ (กติกาละเอียดอยู่ใน pb_hooks)
migrate(
  (app) => {
    const rulesOf = (r) => ({
      listRule: r.list, viewRule: r.view, createRule: r.create, updateRule: r.update, deleteRule: r.delete,
    });

    // ── users (ตาราง auth ที่มีมากับ PocketBase) ──────────────────
    const users = app.findCollectionByNameOrId("users");
    const idf = users.fields.getByName("id");
    idf.min = 1;
    idf.max = 40;
    idf.pattern = "^[A-Za-z0-9_-]+$";
    idf.autogeneratePattern = "[a-zA-Z0-9]{28}";
    // name/avatar ของแม่แบบไม่ได้ใช้ — ของเราเก็บ firstName/lastName/profileImageUrl
    for (const unused of ["name", "avatar"]) {
      if (users.fields.getByName(unused)) users.fields.removeByName(unused);
    }
    for (const f of ${JSON.stringify(usersFields)}) users.fields.add(new Field(f));
    Object.assign(users, rulesOf(${JSON.stringify(RULES.users)}));
    // ห้ามล็อกอินด้วย Google/OTP — ใช้อีเมล + รหัสผ่านอย่างเดียวเหมือนเดิม
    users.passwordAuth.enabled = true;
    users.passwordAuth.identityFields = ["email"];
    users.oauth2.enabled = false;
    users.otp.enabled = false;
    users.mfa.enabled = false;
    app.save(users);

    // ── ตารางทั่วไป ─────────────────────────────────────────────
    for (const c of ${JSON.stringify(collections)}) {
      const col = new Collection({ type: "base", name: c.name, fields: c.fields, ...rulesOf(c.rules) });
      app.save(col);
    }

    // ── files — ไฟล์ที่อัปขึ้น (เอกสารการยืม · รูปตอนคืน · รูปส่งมอบ) ──────
    // protected: ต้องมี file token ถึงเปิดได้ — เป็นเอกสารส่วนตัว (บัตร นศ. ใบขออนุญาต)
    app.save(new Collection({
      type: "base",
      name: "files",
      fields: [
        ${JSON.stringify(ID_FIELD)},
        { name: "file", type: "file", required: true, maxSelect: 1, maxSize: 15728640, protected: true,
          mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] },
        { name: "owner", type: "text", max: 40 },
        { name: "kind", type: "text", max: 20 },
        { name: "createdAt", type: "date" },
      ],
      listRule: '${AUTHED} && (${ADMIN} || owner = @request.auth.id)',
      viewRule: '${AUTHED} && (${ADMIN} || owner = @request.auth.id)',
      createRule: '${AUTHED}',
      updateRule: null,
      deleteRule: '${ADMIN}',
    }));
  },
  (app) => {
    for (const name of ${JSON.stringify([...base, "files"])}) {
      try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
    }
  }
);
`;

fs.writeFileSync(OUT, js);
console.log(`เขียน ${path.relative(process.cwd(), OUT)} แล้ว — ${base.length + 2} ตาราง (รวม users, files)`);

// ── ข้อมูลโครงให้ pb_hooks ใช้ (ช่องไหนเป็นวันที่ · ช่องทั้งหมดของแต่ละตาราง) ──
// hooks ใช้หาช่องที่เปลี่ยน (แทน diff().affectedKeys() ของ Firestore) และแทนค่า
// serverTimestamp() ด้วยเวลาเซิร์ฟเวอร์
const HOOK_SCHEMA = path.join(import.meta.dirname, "..", "nas", "pb_hooks", "ie_schema.js");
const fieldsOf = {};
const datesOf = {};
for (const [name, def] of Object.entries(SCHEMA)) {
  fieldsOf[name] = Object.keys(def);
  datesOf[name] = Object.entries(def).filter(([, d]) => d.kind === "date").map(([f]) => f);
}
fieldsOf.files = ["file", "owner", "kind", "createdAt"];
datesOf.files = ["createdAt"];
fs.writeFileSync(
  HOOK_SCHEMA,
  `// สร้างโดย scripts/gen-pb-migration.mjs จาก lib/db/schema.ts — ห้ามแก้ด้วยมือ\n` +
    `module.exports = ${JSON.stringify({ fields: fieldsOf, dates: datesOf }, null, 2)};\n`
);
console.log(`เขียน ${path.relative(process.cwd(), HOOK_SCHEMA)} แล้ว`);
