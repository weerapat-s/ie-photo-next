// nas/pb_hooks/ie_import.js — นำข้อมูลที่ export จาก Firestore เข้า PocketBase (ใช้ครั้งเดียวตอนย้าย)
//
// รันผ่าน nas/import.sh (สั่ง `pocketbase ie-import <dir>` ใน container) — ไม่ผ่าน API
// จึงไม่ต้องมีบัญชี superuser และไม่ติดกติกาของ hook ใด ๆ (เหมือน Admin SDK)
//
// ไฟล์ที่ได้จาก scripts/export-firestore.mjs:
//   <collection>.json  ค่าแปลงเป็นรูปแบบ PocketBase แล้ว ใส่ตามตัวได้เลย
//   auth-users.json    บัญชีจาก Firebase Auth
//   files/*, nc/*      รูปเอกสารการยืม → สร้างเป็นเรคคอร์ดในตาราง files
//
// รันซ้ำได้: เรคคอร์ดที่มีอยู่แล้วถูกอัปเดตทับ ยกเว้น
//   • รหัสผ่าน/สถานะ legacyAuth ของบัญชีที่มีอยู่แล้ว (คนที่ล็อกอินบน NAS ไปแล้วไม่โดนรีเซ็ต)
//   • รูปที่ย้ายเป็นไฟล์ไปแล้ว (ไม่สร้างไฟล์ซ้ำ)

const ORDER = [
  "users", "banned", "crew", "availability", "equipments", "studios", "photographers", "slots",
  "bookings", "tasks", "aiChats", "mailQueue", "feeds", "forms", "formResponses", "deliveries",
  "settings", "secrets",
];

function readJson(dir, name) {
  try {
    return JSON.parse(toString($os.readFile(dir + "/" + name)));
  } catch (_) {
    return null;
  }
}

function findOrNew(app, col, id) {
  try {
    return { rec: app.findRecordById(col.name, id), isNew: false };
  } catch (_) {
    const rec = new Record(col);
    rec.set("id", id);
    return { rec: rec, isNew: true };
  }
}

function makeFile(app, dir, filesCol, ph) {
  const f = new Record(filesCol);
  f.set("file", $filesystem.fileFromPath(dir + "/" + ph["@file"]));
  f.set("owner", ph.owner || "");
  f.set("kind", ph.kind || "form");
  if (ph.createdAt) f.set("createdAt", ph.createdAt);
  app.save(f);
  return "files/" + f.id + "/" + f.getString("file");
}

function run(app, dir) {
  const stats = {};
  const errors = [];

  // อีเมลจาก Firebase Auth เชื่อถือได้กว่าช่อง email ในเอกสาร users
  const authUsers = readJson(dir, "auth-users.json") || [];
  const authById = {};
  for (const u of authUsers) authById[u.uid] = u;

  const filesCol = app.findCollectionByNameOrId("files");

  for (const name of ORDER) {
    let rows = readJson(dir, name + ".json");
    if (!rows) continue;
    const col = app.findCollectionByNameOrId(name);
    stats[name] = { created: 0, updated: 0, failed: 0 };

    if (name === "users") {
      // บัญชีใน Auth ที่ไม่มีเอกสาร users (สมัครค้าง) — สร้างให้ด้วย ไม่งั้นล็อกอินไม่ได้
      const have = {};
      for (const r of rows) have[r.id] = true;
      for (const u of authUsers) {
        if (!have[u.uid] && u.email) rows.push({ id: u.uid, email: u.email, role: "member", studentId: u.email.split("@")[0] });
      }
    }

    for (const row of rows) {
      try {
        const got = findOrNew(app, col, row.id);
        const rec = got.rec;
        for (const k in row) {
          if (k === "id" || k === "email") continue;
          let v = row[k];
          if (v && typeof v === "object" && v["@file"]) {
            const cur = rec.getString(k);
            if (cur.indexOf("files/") === 0) continue; // ย้ายไปแล้วรอบก่อน
            try {
              v = makeFile(app, dir, filesCol, v);
            } catch (err) {
              errors.push(name + "/" + row.id + "." + k + ": ไฟล์ " + v["@file"] + " — " + err);
              v = "";
            }
          }
          rec.set(k, v);
        }

        if (name === "users") {
          const email = ((authById[row.id] && authById[row.id].email) || row.email || "").toLowerCase();
          if (!email) throw new Error("ไม่มีอีเมล");
          rec.setEmail(email);
          rec.setEmailVisibility(true);
          rec.setVerified(true);
          if (got.isNew) {
            // รหัสสุ่มที่ไม่มีใครรู้ — ล็อกอินครั้งแรกด้วยรหัสเดิมผ่าน legacy-login (ie_auth.js)
            rec.setPassword($security.randomString(40));
            rec.set("legacyAuth", true);
          }
        }

        app.save(rec);
        stats[name][got.isNew ? "created" : "updated"]++;
      } catch (err) {
        stats[name].failed++;
        errors.push(name + "/" + row.id + ": " + String(err).slice(0, 300));
      }
    }
  }

  console.log(JSON.stringify(stats, null, 1));
  if (errors.length) {
    console.log("ผิดพลาด " + errors.length + " รายการ:");
    for (const e of errors.slice(0, 200)) console.log("  " + e);
  } else {
    console.log("นำเข้าครบ ไม่มีข้อผิดพลาด");
  }
}

module.exports = { run };
