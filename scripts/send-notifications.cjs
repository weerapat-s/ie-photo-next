/* scripts/send-notifications.cjs — เช็คงาน/การจองใกล้ครบกำหนด แล้วส่ง Web Push
 * รันจาก GitHub Actions cron (ดู .github/workflows/notify.yml)
 * ต้องมี env: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY,
 *             FIREBASE_DATABASE_ID, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
 */
const webpush = require("web-push");
const { getDb } = require("./lib-admin.cjs");
const { FieldValue } = require("firebase-admin/firestore");

webpush.setVapidDetails(
  "https://iephoto.web.app",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const TASK_WINDOW_MS = 24 * 3600 * 1000; // แจ้งงานที่ครบกำหนดภายใน 24 ชม. (รวมที่เลยกำหนดไปแล้วด้วย)
const BOOKING_WINDOW_MS = 3 * 3600 * 1000; // แจ้งการจองที่จะเริ่มภายใน 3 ชม.

async function sendTo(db, userId, payload) {
  const userSnap = await db.collection("users").doc(userId).get();
  const sub = userSnap.data()?.pushSubscription;
  if (!sub) return "no-subscription";
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
    return "sent";
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) {
      // subscription หมดอายุ/ถูกยกเลิก — ล้างทิ้ง
      await db.collection("users").doc(userId).update({ pushSubscription: null });
      return "expired-cleared";
    }
    console.error(`  push failed for ${userId}:`, e.message);
    return "error";
  }
}

async function notifyTasks(db) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + TASK_WINDOW_MS);
  const snap = await db.collection("tasks").where("dueDate", "<=", cutoff).get();

  let sent = 0;
  for (const d of snap.docs) {
    const t = d.data();
    if (!["pending", "in_progress"].includes(t.status)) continue;
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
    if (result === "sent" || result === "expired-cleared") {
      await d.ref.update({ reminderSentAt: FieldValue.serverTimestamp() });
      if (result === "sent") sent++;
    }
  }
  return sent;
}

async function notifyBookings(db) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + BOOKING_WINDOW_MS);
  const snap = await db.collection("bookings").where("startAt", "<=", cutoff).get();

  let sent = 0;
  for (const d of snap.docs) {
    const b = d.data();
    if (b.status !== "approved") continue;
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
    if (result === "sent" || result === "expired-cleared") {
      await d.ref.update({ reminderSentAt: FieldValue.serverTimestamp() });
      if (result === "sent") sent++;
    }
  }
  return sent;
}

(async () => {
  const db = getDb();
  console.log("=== ตรวจงานใกล้ครบกำหนด ===");
  const taskSent = await notifyTasks(db);
  console.log("=== ตรวจการจองใกล้ถึงเวลา ===");
  const bookingSent = await notifyBookings(db);
  console.log(`\n✅ ส่งแจ้งเตือนสำเร็จ: งาน ${taskSent} รายการ, การจอง ${bookingSent} รายการ`);
  process.exit(0);
})().catch((e) => {
  console.error("✗ FAILED:", e.message);
  process.exit(1);
});
