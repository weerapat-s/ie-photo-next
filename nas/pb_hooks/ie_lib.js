// nas/pb_hooks/ie_lib.js — กติกาความปลอดภัยของ IE-Photo (แปลจาก firestore.rules เดิม)
//
// ═══ แบ่งงานกับ API rules ═══════════════════════════════════════
//
// API rules (ใน migration) ตัดสินหยาบ ๆ ว่าใครแตะตารางไหนได้
// ไฟล์นี้ตัดสินละเอียด — แตะได้แค่ช่องไหน ค่าต้องอยู่ในกรอบไหน — ตรงกับ firestore.rules
// เดิมทีละข้อ ชื่อฟังก์ชันตั้งตามของเดิม (validMemberBooking, claimJob, likeDeltaOk ฯลฯ)
// จะได้เทียบกันได้บรรทัดต่อบรรทัด
//
// superuser (หน้าแอดมิน PocketBase / สคริปต์ย้ายข้อมูล) ข้ามกติกาทั้งหมด เหมือน Admin SDK
//
// ═══ serverTimestamp() ══════════════════════════════════════════
//
// ฝั่งเว็บส่งวันที่พิเศษ SERVER_TIME_MARK มาแทนเวลา — ไฟล์นี้แทนเป็นเวลาเซิร์ฟเวอร์
// เหมือน serverTimestamp() ของ Firestore ผู้ใช้จึงปลอมเวลาไม่ได้
// (เช่น liabilityAcceptedAt ต้องเป็นเวลาที่ส่งคำขอจริง ย้อนหลังไม่ได้)
//
// ทำไมเป็นวันที่ ไม่ใช่ข้อความอย่าง "__SERVER_TIMESTAMP__": PocketBase แปลงค่าใน body
// เป็นชนิดของช่องก่อนถึง hook — ข้อความในช่องวันที่แปลงไม่ได้ กลายเป็นค่าว่าง แยกไม่ออก
// ว่าผู้ใช้ส่งเครื่องหมายมาหรือไม่ได้ส่ง (ตรวจแล้วบน NAS จริง) วันที่ปี 1111 แปลงได้
// และไม่มีทางเป็นวันที่จริงในระบบนี้ ต้องตรงกับ SERVER_TIME_MARK ใน lib/db
//
// ไฟล์นี้ require จากในตัว handler เท่านั้น (ข้อกำหนดของ PocketBase JSVM)

/** ต้องตรงกับ SERVER_TIME_MARK ใน lib/db/firestore.ts */
const SERVER_TIME_MARK = "1111-11-11 11:11:11.111Z";
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const SCHEMA = require(`${__hooks}/ie_schema.js`);

// ── ตัวช่วย ────────────────────────────────────────────────────

function forbid(msg) {
  throw new ForbiddenError(msg || "ไม่มีสิทธิ์");
}
function bad(msg) {
  throw new BadRequestError(msg);
}

function roleOf(rec) {
  return rec ? rec.getString("role") : "";
}
function isAdmin(auth) {
  const r = roleOf(auth);
  return r === "admin" || r === "super_admin";
}
function isSuper(auth) {
  return roleOf(auth) === "super_admin";
}

function exists(app, collection, id) {
  if (!id) return false;
  try {
    app.findRecordById(collection, id);
    return true;
  } catch (_) {
    return false;
  }
}
function isBanned(app, uid) {
  return exists(app, "banned", uid);
}
function isCrew(app, uid) {
  return exists(app, "crew", uid);
}

/** เวลา (ms) จากช่องวันที่ — "" = null */
function ms(rec, field) {
  const s = rec.getString(field);
  if (!s) return null;
  const t = Date.parse(s.replace(" ", "T"));
  return isNaN(t) ? null : t;
}

function str(rec, field) {
  return rec.getString(field);
}
function len(rec, field) {
  return rec.getString(field).length;
}
function arr(rec, field) {
  const s = rec.getString(field);
  if (!s || s === "null") return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
}
function obj(rec, field) {
  const s = rec.getString(field);
  if (!s || s === "null") return null;
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

/** ช่องที่ค่าเปลี่ยนจากของเดิม — แทน request.resource.data.diff(resource.data).affectedKeys() */
function changedFields(collection, rec) {
  const old = rec.original();
  const out = [];
  for (const f of SCHEMA.fields[collection] || []) {
    if (rec.getString(f) !== old.getString(f)) out.push(f);
  }
  return out;
}
function onlyChanged(changed, allowed) {
  for (const f of changed) if (allowed.indexOf(f) < 0) return false;
  return true;
}
function hasAll(big, small) {
  for (const x of small) if (big.indexOf(x) < 0) return false;
  return true;
}

/** แทน SERVER_TIME_MARK ในช่องวันที่ด้วยเวลาเซิร์ฟเวอร์ — คืนชื่อช่องที่ถูกแทน */
function applyServerTimestamps(e, collection) {
  const dates = SCHEMA.dates[collection] || [];
  const stamped = [];
  for (const f of dates) {
    if (e.record.getString(f) === SERVER_TIME_MARK) {
      e.record.set(f, new DateTime());
      stamped.push(f);
    }
  }
  return stamped;
}

/** เวลาเริ่ม/จบต้องสมเหตุสมผล — ใช้ร่วมกันใน slotShape และ bookingShape */
function timeWindowOk(rec, now) {
  const start = ms(rec, "startAt");
  const end = ms(rec, "endAt");
  return (
    start !== null &&
    end !== null &&
    end > start &&
    start > now - 5 * MIN &&
    start < now + 365 * DAY
  );
}

const BOOKING_TYPES = ["equipment", "studio", "photographer"];

// ── slots ──────────────────────────────────────────────────────
function slotShape(rec, now) {
  return (
    len(rec, "bookingId") > 0 && len(rec, "bookingId") <= 60 &&
    len(rec, "itemId") > 0 && len(rec, "itemId") <= 60 &&
    len(rec, "itemName") > 0 && len(rec, "itemName") <= 200 &&
    BOOKING_TYPES.indexOf(str(rec, "bookingType")) >= 0 &&
    timeWindowOk(rec, now)
  );
}
function validSlot(rec, now) {
  return slotShape(rec, now) && ms(rec, "endAt") < ms(rec, "startAt") + 7 * DAY && str(rec, "status") === "pending";
}
function validAdminSlot(rec, now) {
  return (
    slotShape(rec, now) &&
    ms(rec, "endAt") < ms(rec, "startAt") + 30 * DAY &&
    ["pending", "approved"].indexOf(str(rec, "status")) >= 0
  );
}

// ── bookings ───────────────────────────────────────────────────
function bookingShape(rec, now, stamped) {
  const crew = rec.getFloat("crewSize");
  const liability = str(rec, "liabilityAcceptedAt");
  return (
    BOOKING_TYPES.indexOf(str(rec, "bookingType")) >= 0 &&
    len(rec, "itemId") > 0 && len(rec, "itemId") <= 60 &&
    len(rec, "itemName") > 0 && len(rec, "itemName") <= 200 &&
    len(rec, "usageReason") > 0 && len(rec, "usageReason") <= 500 &&
    len(rec, "userName") <= 100 &&
    len(rec, "userPhone") <= 20 &&
    timeWindowOk(rec, now) &&
    str(rec, "returnImageUrl") === "" &&
    len(rec, "location") <= 200 &&
    (crew === 0 || (crew >= 1 && crew <= 20 && crew === Math.floor(crew))) &&
    len(rec, "usageType") <= 120 &&
    len(rec, "overnightStorage") <= 200 &&
    len(rec, "handoverImageUrl") <= 500 &&
    // เวลารับทราบเงื่อนไขชดใช้ต้องเป็นเวลาเซิร์ฟเวอร์ตอนเขียนเท่านั้น (request.time เดิม)
    (liability === "" || stamped.indexOf("liabilityAcceptedAt") >= 0)
  );
}

function validAdminBooking(rec, now, stamped) {
  return (
    bookingShape(rec, now, stamped) &&
    ["pending", "approved"].indexOf(str(rec, "status")) >= 0 &&
    arr(rec, "assigneeIds").length <= 20 &&
    ms(rec, "endAt") < ms(rec, "startAt") + 30 * DAY &&
    len(rec, "formImageUrl") <= 500
  );
}

function validMemberBooking(rec, now, stamped, uid) {
  const equipment = str(rec, "bookingType") === "equipment";
  const start = ms(rec, "startAt");
  const end = ms(rec, "endAt");
  return (
    bookingShape(rec, now, stamped) &&
    str(rec, "status") === "pending" &&
    str(rec, "userId") === uid &&
    end < start + 7 * DAY &&
    // ยืมอุปกรณ์ต้องรับทราบเงื่อนไขชดใช้ตอนส่งคำขอ (อนุมัติจากปุ่มได้โดยไม่ผ่านสถานีสแกน)
    (!equipment || stamped.indexOf("liabilityAcceptedAt") >= 0) &&
    // ยาวกว่า 12 ชม. = คาบเกี่ยวกลางคืน ต้องบอกที่เก็บของ (ตรงกับ OVERNIGHT_AFTER_MS)
    (!equipment ||
      end <= start + 12 * HOUR ||
      (rec.getBool("overnight") && len(rec, "overnightStorage") > 0)) &&
    len(rec, "formImageUrl") <= 500
  );
}

function validGuestBooking(app, rec, now, stamped) {
  const type = str(rec, "bookingType");
  const itemOk =
    type === "studio"
      ? exists(app, "studios", str(rec, "itemId"))
      : type === "photographer"
        ? exists(app, "photographers", str(rec, "itemId"))
        : false;
  return (
    bookingShape(rec, now, stamped) &&
    str(rec, "status") === "pending" &&
    str(rec, "userId") === "" &&
    itemOk &&
    len(rec, "guestName") > 0 && len(rec, "guestName") <= 100 &&
    /.+@.+[.].+/.test(str(rec, "guestEmail")) && len(rec, "guestEmail") <= 120 &&
    len(rec, "userName") > 0 &&
    len(rec, "userPhone") >= 9 &&
    ms(rec, "endAt") < ms(rec, "startAt") + 24 * HOUR &&
    str(rec, "formImageUrl") === "" &&
    str(rec, "responsibleUserId") === "" &&
    str(rec, "consentToken") === ""
  );
}

// เจ้าของยกเลิกได้ถ้ายังไม่เริ่มใช้จริง
function ownerCancel(changed, rec, now) {
  const old = rec.original();
  return (
    onlyChanged(changed, ["status"]) &&
    str(rec, "status") === "cancelled" &&
    (str(old, "status") === "pending" ||
      (str(old, "status") === "approved" && ms(old, "startAt") > now))
  );
}

function onlyReturnChanged(changed, rec) {
  const old = rec.original();
  return (
    onlyChanged(changed, ["status", "returnImageUrl"]) &&
    str(rec, "status") === "pending_return" &&
    str(old, "status") === "approved" &&
    len(rec, "returnImageUrl") <= 500
  );
}

// ทีมงานเข้า/ออกจากงานเองได้ — แตะได้แค่ assigneeIds และเฉพาะ uid ตัวเอง
function claimJob(app, changed, rec, uid) {
  const old = rec.original();
  if (!isCrew(app, uid)) return false;
  if (str(old, "bookingType") !== "photographer" || str(old, "status") !== "approved") return false;
  if (!onlyChanged(changed, ["assigneeIds"])) return false;
  const before = arr(old, "assigneeIds");
  const after = arr(rec, "assigneeIds");
  if (after.length > 20) return false;
  const join =
    before.indexOf(uid) < 0 && after.indexOf(uid) >= 0 && hasAll(after, before) && after.length === before.length + 1;
  const leave =
    before.indexOf(uid) >= 0 && after.indexOf(uid) < 0 && hasAll(before, after) && after.length === before.length - 1;
  return join || leave;
}

// ── feeds ──────────────────────────────────────────────────────
function likeDeltaOk(changed, rec, uid) {
  const old = rec.original();
  if (!onlyChanged(changed, ["likedBy", "likeCount"])) return false;
  const before = arr(old, "likedBy");
  const after = arr(rec, "likedBy");
  const bc = old.getFloat("likeCount");
  const ac = rec.getFloat("likeCount");
  const like =
    ac === bc + 1 &&
    before.indexOf(uid) < 0 &&
    after.indexOf(uid) >= 0 &&
    hasAll(after, before) &&
    hasAll(before.concat([uid]), after);
  const unlike = ac === bc - 1 && before.indexOf(uid) >= 0 && after.indexOf(uid) < 0 && hasAll(before, after);
  return like || unlike;
}

// ── mailQueue ──────────────────────────────────────────────────
function validMail(rec, uid) {
  const fw = obj(rec, "forwarded");
  return (
    /.+@.+[.].+/.test(str(rec, "to")) && len(rec, "to") <= 200 &&
    len(rec, "subject") > 0 && len(rec, "subject") <= 200 &&
    len(rec, "body") > 0 && len(rec, "body") <= 4000 &&
    str(rec, "status") === "queued" &&
    len(rec, "kind") <= 40 &&
    len(rec, "replyTo") <= 200 &&
    // ต้องเป็น uid ตัวเอง — ไม่งั้นบันทึกว่าคนอื่นเป็นคนสั่งส่งได้
    (str(rec, "sentById") === "" || str(rec, "sentById") === uid) &&
    (fw === null || typeof fw === "boolean")
  );
}

// ── formResponses ──────────────────────────────────────────────
function validFormResponse(app, rec, auth) {
  let form;
  try {
    form = app.findRecordById("forms", str(rec, "formId"));
  } catch (_) {
    return false;
  }
  const values = obj(rec, "values");
  return (
    len(rec, "formId") > 0 && len(rec, "formId") <= 60 &&
    len(rec, "formTitle") <= 200 &&
    values !== null && typeof values === "object" && !Array.isArray(values) &&
    Object.keys(values).length <= 60 &&
    len(rec, "submitterName") > 0 && len(rec, "submitterName") <= 120 &&
    len(rec, "submitterContact") <= 160 &&
    len(rec, "bookingId") <= 60 &&
    // ฟอร์มต้องเปิดรับคำตอบอยู่จริง และคนนอกส่งได้เฉพาะฟอร์มที่อนุญาต
    form.getBool("active") &&
    (auth ? str(rec, "userId") === auth.id : str(rec, "userId") === "" && form.getBool("allowGuest"))
  );
}

// ── users ──────────────────────────────────────────────────────
const OWNER_FIELDS = [
  "firstName", "lastName", "nickname", "phone", "skills", "profileImageUrl",
  "profileCompleted", "pushSubscription", "pushSubscriptions", "memberCode",
];
const PROFILE_FIELDS = ["firstName", "lastName", "nickname", "phone", "skills", "profileImageUrl"];

function usersUpdateOk(changed, rec, auth) {
  const old = rec.original();
  const self = auth.id === rec.id;

  // เจ้าของ — เฉพาะช่องโปรไฟล์ · memberCode ตั้งได้ครั้งเดียว
  if (self && onlyChanged(changed, OWNER_FIELDS)) {
    if (changed.indexOf("memberCode") < 0) return true;
    const code = str(rec, "memberCode");
    return str(old, "memberCode") === "" && code.length >= 6 && code.length <= 20;
  }
  // ประธาน — ตั้งยศของตัวเองได้
  if (isSuper(auth) && self && onlyChanged(changed, ["title"])) return true;
  // แอดมินแก้คนอื่น — admin ธรรมดาห้ามแตะ super_admin ทั้งขาขึ้น/ขาลง
  if (
    isAdmin(auth) && !self &&
    (isSuper(auth) || (roleOf(old) !== "super_admin" && roleOf(rec) !== "super_admin"))
  )
    return true;
  // แอดมินแก้ข้อมูลส่วนตัวของใครก็ได้ (รวมประธาน) เฉพาะช่องที่ไม่ใช่สิทธิ์
  if (isAdmin(auth) && !self && onlyChanged(changed, PROFILE_FIELDS)) return true;
  return false;
}

// ═══ ทางเข้าหลัก ═══════════════════════════════════════════════

function onCreate(e) {
  const name = e.record.collection().name;
  const now = Date.now();
  const stamped = applyServerTimestamps(e, name);

  if (e.hasSuperuserAuth()) return e.next();

  const auth = e.auth;
  const app = e.app;
  const rec = e.record;

  if (auth && isBanned(app, auth.id)) forbid("บัญชีนี้ถูกระงับ");

  switch (name) {
    case "users":
      // สมัครเองได้แค่สมาชิกธรรมดา — ยกสิทธิ์ต้องให้แอดมินทำ
      if (str(rec, "role") !== "" && str(rec, "role") !== "member") forbid("สมัครได้เฉพาะสมาชิก");
      // สมัครเองได้เฉพาะอีเมลของสถาบัน (เดิมเช็คแค่ในหน้าเว็บ ยิง API ตรงก็ข้ามได้)
      if (!/@kmitl\.ac\.th$/.test(rec.email().toLowerCase())) bad("สมัครได้เฉพาะอีเมล @kmitl.ac.th");
      rec.set("legacyAuth", false);
      rec.set("role", "member");
      // แอดมินต้องเห็นอีเมลสมาชิก (ส่งแจ้งเตือน) — การอ่านถูกคุมด้วย API rules อยู่แล้ว
      rec.setEmailVisibility(true);
      rec.set("createdAt", new DateTime());
      break;

    case "slots":
      if (!(validAdminSlot(rec, now) && isAdmin(auth)) && !validSlot(rec, now)) bad("ข้อมูลช่วงเวลาไม่ถูกต้อง");
      break;

    case "bookings": {
      let ok;
      if (auth && isAdmin(auth)) ok = validAdminBooking(rec, now, stamped);
      else if (auth) ok = validMemberBooking(rec, now, stamped, auth.id);
      else ok = validGuestBooking(app, rec, now, stamped);
      if (!ok) bad("ข้อมูลคำขอไม่ผ่านเงื่อนไข");
      break;
    }

    case "mailQueue":
      if (!validMail(rec, auth.id)) bad("ข้อมูลอีเมลไม่ถูกต้อง");
      break;

    case "formResponses":
      if (!validFormResponse(app, rec, auth)) bad("ส่งคำตอบฟอร์มนี้ไม่ได้");
      break;

    case "availability":
      if (arr(rec, "busyDates").length > 400) bad("วันไม่ว่างเยอะเกินไป");
      break;

    case "banned":
      bannedWriteOk(app, rec.id, auth);
      break;

    case "files":
      // เจ้าของไฟล์คือคนที่อัป — ห้ามอ้างเป็นของคนอื่น
      rec.set("owner", auth.id);
      rec.set("createdAt", new DateTime());
      if (["form", "return", "handover"].indexOf(str(rec, "kind")) < 0) bad("ชนิดไฟล์ไม่ถูกต้อง");
      break;
  }

  return e.next();
}

function onUpdate(e) {
  const name = e.record.collection().name;
  const now = Date.now();
  applyServerTimestamps(e, name);

  if (e.hasSuperuserAuth()) return e.next();

  const auth = e.auth;
  const app = e.app;
  const rec = e.record;
  if (auth && isBanned(app, auth.id)) forbid("บัญชีนี้ถูกระงับ");

  const changed = changedFields(name, rec);
  const admin = auth && isAdmin(auth);

  switch (name) {
    case "users":
      if (!usersUpdateOk(changed, rec, auth)) forbid("แก้ช่องนี้ไม่ได้");
      break;

    case "bookings":
      if (!admin) {
        const owner = str(rec.original(), "userId") === auth.id;
        const ok =
          (owner && (onlyReturnChanged(changed, rec) || ownerCancel(changed, rec, now))) ||
          claimJob(app, changed, rec, auth.id);
        if (!ok) forbid("แก้คำขอนี้ไม่ได้");
      }
      break;

    case "tasks":
      if (!admin) {
        const ok =
          str(rec.original(), "assignedToId") === auth.id &&
          onlyChanged(changed, ["status"]) &&
          ["pending", "in_progress", "completed"].indexOf(str(rec, "status")) >= 0;
        if (!ok) forbid("แก้งานนี้ไม่ได้");
      }
      break;

    case "feeds":
      if (!admin && !likeDeltaOk(changed, rec, auth.id)) forbid("แก้โพสต์นี้ไม่ได้");
      break;

    case "forms":
      if (!admin) {
        const old = rec.original();
        const ok =
          old.getBool("active") &&
          onlyChanged(changed, ["responseCount"]) &&
          rec.getFloat("responseCount") === old.getFloat("responseCount") + 1 &&
          (auth ? true : old.getBool("allowGuest"));
        if (!ok) forbid("แก้ฟอร์มนี้ไม่ได้");
      }
      break;

    case "deliveries":
      if (!admin) {
        // ทีมงานแจ้งได้แค่ว่า "อัปไฟล์แล้ว" — แตะลิงก์ไม่ได้
        const ok =
          onlyChanged(changed, ["status", "updatedAt"]) &&
          str(rec.original(), "status") === "awaiting_upload" &&
          str(rec, "status") === "uploaded";
        if (!ok) forbid("แก้งานส่งนี้ไม่ได้");
      }
      break;

    case "availability":
      if (arr(rec, "busyDates").length > 400) bad("วันไม่ว่างเยอะเกินไป");
      break;

    case "banned":
      bannedWriteOk(app, rec.id, auth);
      break;
  }

  return e.next();
}

function onDelete(e) {
  if (e.hasSuperuserAuth()) return e.next();
  const auth = e.auth;
  const app = e.app;
  if (auth && isBanned(app, auth.id)) forbid("บัญชีนี้ถูกระงับ");

  const name = e.record.collection().name;
  if (name === "users" && !isSuper(auth) && roleOf(e.record) === "super_admin") forbid("ลบประธานไม่ได้");
  if (name === "banned") bannedWriteOk(app, e.record.id, auth);
  return e.next();
}

/** ระงับ/ปลดระงับ — ห้ามทำกับตัวเอง · admin ธรรมดาแตะ super_admin ไม่ได้ */
function bannedWriteOk(app, uid, auth) {
  if (auth.id === uid) forbid("ระงับตัวเองไม่ได้");
  if (isSuper(auth)) return;
  let target = null;
  try {
    target = app.findRecordById("users", uid);
  } catch (_) {}
  if (target && roleOf(target) === "super_admin") forbid("ระงับประธานไม่ได้");
}

/** ล็อกอิน — บัญชีที่ถูกระงับเข้าไม่ได้เลย (Firebase เดิมกันได้แค่การเขียน) */
function onAuth(e) {
  if (e.record && isBanned(e.app, e.record.id)) forbid("บัญชีนี้ถูกระงับ");
  return e.next();
}

module.exports = { onCreate, onUpdate, onDelete, onAuth, SERVER_TIME_MARK };
