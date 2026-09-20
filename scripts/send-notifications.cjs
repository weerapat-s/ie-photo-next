/* scripts/send-notifications.cjs — เช็คงาน/การจองใกล้ครบกำหนด แล้วส่ง Web Push + แจ้งคำขอจองใหม่เข้า Discord
 * รันจาก GitHub Actions cron (ดู .github/workflows/notify.yml)
 * ต้องมี env: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY,
 *             FIREBASE_DATABASE_ID, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
 * ไม่บังคับ: DISCORD_WEBHOOK_URL (ไม่ตั้งค่า = ข้ามการแจ้ง Discord เงียบๆ)
 *
 * ทุก query ใช้ .select() เลือกเฉพาะฟิลด์ที่ใช้จริง — booking บางใบฝังรูป base64
 * หลักแสน byte ไว้ใน formImageUrl/returnImageUrl และ Firestore รุ่นนี้คิดโควตาเป็น
 * "read units" ตามขนาดเอกสาร ดึงมาทั้งใบทั้งที่ไม่ได้ใช้รูปเลยจึงกินโควตาฟรีจนหมดวัน
 */
const webpush = require("web-push");
const { getDb } = require("./lib-admin.cjs");
const { FieldValue } = require("firebase-admin/firestore");

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";
const BOOKING_TYPE_LABEL = { equipment: "📷 อุปกรณ์", studio: "🎬 สตูดิโอ" };

/** เวลาไทย = UTC+7 คงที่ ไม่มี DST — บวกเอาตรง ๆ ได้ ไม่ต้องพึ่งไลบรารี timezone */
const BKK_OFFSET_MS = 7 * 3600 * 1000;
/** ชั่วโมงที่ประกาศรายชื่อของค้างเข้า Discord (เวลาไทย) */
const OVERDUE_DIGEST_HOUR = 8;

function bkkParts(d) {
  const t = new Date(d.getTime() + BKK_OFFSET_MS);
  return { hour: t.getUTCHours(), dateKey: t.toISOString().slice(0, 10) };
}

webpush.setVapidDetails(
  "https://iephoto.web.app",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const TASK_WINDOW_MS = 24 * 3600 * 1000; // แจ้งงานที่ครบกำหนดภายใน 24 ชม. (รวมที่เลยกำหนดไม่เกิน 7 วัน)
const BOOKING_WINDOW_MS = 3 * 3600 * 1000; // แจ้งการจองที่จะเริ่มภายใน 3 ชม.

async function sendTo(db, userId, payload) {
  const ref = db.collection("users").doc(userId);
  // fieldMask: เอาเฉพาะ subscription — รูปโปรไฟล์เป็น data URL ก้อนใหญ่ ไม่ต้องดึงมา
  const [doc] = await db.getAll(ref, { fieldMask: ["pushSubscriptions", "pushSubscription"] });
  const u = doc.data() || {};
  const subs = Array.isArray(u.pushSubscriptions)
    ? u.pushSubscriptions
    : (u.pushSubscription ? [u.pushSubscription] : []);

  if (!subs.length) return "no-subscription";
  let okCount = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      okCount++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        // subscription หมดอายุ/ถูกยกเลิก — ลบเฉพาะเครื่องนี้ออกจาก array
        await ref.update({ pushSubscriptions: FieldValue.arrayRemove(sub) });
      } else {
        console.error(`  push failed for ${userId}:`, e.message);
      }
    }
  }
  return okCount > 0 ? "sent" : "all-failed";
}

async function notifyTasks(db) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + TASK_WINDOW_MS);
  const lowerBound = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  // query ใส่ขอบล่าง + filter status เพื่อประสิทธิภาพ
  const snap = await db
    .collection("tasks")
    .where("status", "in", ["pending", "in_progress"])
    .where("dueDate", ">", lowerBound)
    .where("dueDate", "<=", cutoff)
    .select("title", "dueDate", "assignedToId", "assignedToName", "reminderSentAt")
    .get();

  let sent = 0;
  for (const d of snap.docs) {
    const t = d.data();
    if (t.reminderSentAt) continue;
    if (!t.assignedToId) continue;

    const overdue = t.dueDate.toDate() < now;
    const result = await sendTo(db, t.assignedToId, {
      title: overdue ? "⏰ งานเลยกำหนดแล้ว" : "📋 งานใกล้ครบกำหนด",
      body: t.title,
      url: "/my-tasks",
      tag: `task-${d.id}`,
    });
    console.log(`  task "${t.title}" → ${t.assignedToName}: ${result}`);
    if (result === "sent") {
      await d.ref.update({ reminderSentAt: FieldValue.serverTimestamp() });
      sent++;
    }
  }
  return sent;
}

async function notifyBookings(db) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + BOOKING_WINDOW_MS);
  const lowerBound = new Date(now.getTime() - 3600 * 1000);

  // query ใส่ขอบล่าง + status == approved
  const snap = await db
    .collection("bookings")
    .where("status", "==", "approved")
    .where("startAt", ">", lowerBound)
    .where("startAt", "<=", cutoff)
    .select("itemName", "startAt", "userId", "userName", "reminderSentAt")
    .get();

  let sent = 0;
  for (const d of snap.docs) {
    const b = d.data();
    if (b.reminderSentAt) continue;
    if (!b.userId) continue;
    if (b.startAt.toDate() < now) continue; // เลยเวลาเริ่มไปแล้ว ไม่ต้องแจ้ง

    const startTimeStr = b.startAt.toDate().toLocaleString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "short",
    });
    const result = await sendTo(db, b.userId, {
      title: "🎬 การจองใกล้ถึงเวลาแล้ว",
      body: `${b.itemName} — เริ่ม ${startTimeStr}`,
      url: "/my-bookings",
      tag: `booking-${d.id}`,
    });
    console.log(`  booking "${b.itemName}" → ${b.userName}: ${result}`);
    if (result === "sent") {
      await d.ref.update({ reminderSentAt: FieldValue.serverTimestamp() });
      sent++;
    }
  }
  return sent;
}

async function notifyDiscordNewBookings(db) {
  if (!DISCORD_WEBHOOK_URL) return 0;

  // ดึง booking ที่ยัง pending ทั้งหมด แล้วกรอง discordNotifiedAt ฝั่งนี้
  // (เหมือน pattern reminderSentAt เดิม — pending มีจำนวนจำกัดเพราะแอดมินตัดสินใจแล้วก็หลุดจาก filter)
  const snap = await db
    .collection("bookings")
    .where("status", "==", "pending")
    .select(
      "bookingType", "itemName", "userId", "userName", "userPhone",
      "guestName", "startAt", "endAt", "discordNotifiedAt",
      "overnight", "overnightStorage"
    )
    .get();

  let sent = 0;
  for (const d of snap.docs) {
    const b = d.data();
    if (b.discordNotifiedAt) continue;

    const label = BOOKING_TYPE_LABEL[b.bookingType] || b.bookingType;
    const who = b.userId ? b.userName : `${b.guestName || b.userName} (บุคคลภายนอก)`;
    const timeStr = `${b.startAt.toDate().toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} → ${b.endAt.toDate().toLocaleString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;

    try {
      const res = await fetch(DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content:
            (b.overnight
              ? `🌙 **คำขอยืมข้ามคืน — ต้องให้กรรมการดู**\n`
              : `📥 **คำขอจองใหม่รอตรวจสอบ**\n`) +
            `${label} — **${b.itemName}**\n` +
            (b.overnight ? `🏠 เก็บไว้ที่: ${b.overnightStorage || "ไม่ระบุ"}\n` : "") +
            `👤 ${who}${b.userPhone ? ` · 📞 ${b.userPhone}` : ""}\n` +
            `🕐 ${timeStr}\n` +
            `🔗 https://iephoto.web.app/bookings`,
        }),
      });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      await d.ref.update({ discordNotifiedAt: FieldValue.serverTimestamp() });
      console.log(`  discord: "${b.itemName}" (${who}) → sent`);
      sent++;
    } catch (e) {
      console.error(`  discord failed for booking ${d.id}:`, e.message);
    }
  }
  return sent;
}

/**
 * ประกาศรายชื่อของที่เลยกำหนดคืนเข้า Discord วันละครั้ง
 *
 * cron รันทุกครึ่งชั่วโมง จึงต้องกันส่งซ้ำเอง — ใช้ transaction จองสิทธิ์ส่งของวันนั้น
 * ก่อนยิง webhook ถ้าสองรอบทับกันจะมีแค่รอบเดียวที่จองได้
 * (systemState ไม่มี rules รองรับ = ฝั่ง client อ่านไม่ได้ มีแต่ Admin SDK ที่แตะได้)
 */
async function notifyDiscordOverdue(db) {
  if (!DISCORD_WEBHOOK_URL) return 0;

  const now = new Date();
  const { hour, dateKey } = bkkParts(now);
  if (hour !== OVERDUE_DIGEST_HOUR) return 0;

  const ref = db.collection("systemState").doc("overdueDigest");
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data().lastSentDate === dateKey) return false;
    tx.set(ref, { lastSentDate: dateKey, sentAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
  if (!claimed) return 0;

  // แยกเป็นสอง query ที่ใช้ == แทน in เพราะ == คู่กับช่วงเวลา ใช้ index รายฟิลด์
  // ที่ Firestore สร้างให้เองได้เลย ไม่ต้องเพิ่ม composite index (โปรเจกต์นี้ไม่มีสักอัน)
  const fields = ["itemName", "userName", "userPhone", "endAt", "overnight"];
  const snaps = await Promise.all(
    ["approved", "pending_return"].map((status) =>
      db
        .collection("bookings")
        .where("status", "==", status)
        .where("endAt", "<", now)
        .select(...fields)
        .get()
    )
  );

  const rows = snaps.flatMap((snap) => snap.docs.map((d) => d.data()));
  if (rows.length === 0) {
    console.log("  overdue: ไม่มีของค้าง — ไม่ต้องประกาศ");
    return 0;
  }

  rows.sort((a, z) => a.endAt.toMillis() - z.endAt.toMillis());
  const shown = rows.slice(0, 25);
  const lines = shown.map((b) => {
    const late = Math.max(1, Math.floor((now.getTime() - b.endAt.toMillis()) / 86400000));
    const phone = b.userPhone ? ` · 📞 ${b.userPhone}` : "";
    const night = b.overnight ? " · 🌙 ยืมข้ามคืน" : "";
    return `• **${b.itemName}** — ${b.userName} · เลยกำหนด ${late} วัน${phone}${night}`;
  });
  const more =
    rows.length > shown.length ? `\n…และอีก ${rows.length - shown.length} รายการ` : "";

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content:
        `⏰ **ของค้างเลยกำหนดคืน ${rows.length} รายการ**\n` +
        lines.join("\n") +
        more +
        `\n🔗 https://iephoto.web.app/borrow-log`,
    }),
  });
  if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
  console.log(`  overdue: ประกาศ ${rows.length} รายการแล้ว`);
  return rows.length;
}

(async () => {
  const db = getDb();
  console.log("=== ตรวจงานใกล้ครบกำหนด ===");
  const taskSent = await notifyTasks(db);
  console.log("=== ตรวจการจองใกล้ถึงเวลา ===");
  const bookingSent = await notifyBookings(db);
  console.log("=== แจ้งคำขอจองใหม่เข้า Discord ===");
  const discordSent = await notifyDiscordNewBookings(db);
  console.log("=== ประกาศของค้างเลยกำหนด ===");
  const overdueSent = await notifyDiscordOverdue(db);
  console.log(
    `\n✅ ส่งแจ้งเตือนสำเร็จ: งาน ${taskSent} รายการ, การจอง ${bookingSent} รายการ, ` +
      `Discord ${discordSent} รายการ, ของค้าง ${overdueSent} รายการ`
  );
  process.exit(0);
})().catch((e) => {
  // โควตาอ่านรายวันหมด = สภาพแวดล้อม ไม่ใช่โค้ดพัง
  // ปล่อยให้ job แดงจะได้เมลแจ้งเตือนทุกครึ่งชั่วโมงจนกว่าโควตาจะรีเซ็ต ซึ่งไม่ช่วยอะไร
  if (e.code === 8 || /RESOURCE_EXHAUSTED|Quota/i.test(e.message || "")) {
    console.warn("⚠ ข้ามรอบนี้: โควตาอ่าน Firestore รายวันหมด — จะลองใหม่รอบหน้า");
    process.exit(0);
  }
  console.error("✗ FAILED:", e.message);
  process.exit(1);
});
