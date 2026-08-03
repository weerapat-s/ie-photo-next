// scripts/test-queries.cjs — รัน query ทุกรูปแบบที่แอปใช้จริง กับ DB จริง
// เพื่อหา query ที่ต้องการ composite index ที่ยังไม่ได้สร้าง (จะ fail เงียบใน UI)
// หมายเหตุ: Admin SDK ข้าม rules แต่ "ไม่ข้าม" ข้อกำหนดเรื่อง index — ทดสอบได้ตรง
const { getDb } = require("./lib-admin.cjs");

const FAKE_UID = "no-such-user-just-testing-index";

async function tryQuery(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`     → ${e.message.split("\n")[0]}`);
    return false;
  }
}

(async () => {
  const db = getDb();
  let fail = 0;

  console.log("=== query ที่หน้าเว็บใช้จริง ===");
  fail += !(await tryQuery("borrow: equipments where status==available orderBy type", () =>
    db.collection("equipments").where("status", "==", "available").orderBy("type").get()
  ));
  fail += !(await tryQuery("my-bookings: bookings where userId== orderBy createdAt desc", () =>
    db.collection("bookings").where("userId", "==", FAKE_UID).orderBy("createdAt", "desc").get()
  ));
  fail += !(await tryQuery("calendar: slots orderBy startAt", () =>
    db.collection("slots").orderBy("startAt").get()
  ));
  fail += !(await tryQuery("admin bookings: orderBy createdAt desc", () =>
    db.collection("bookings").orderBy("createdAt", "desc").get()
  ));
  fail += !(await tryQuery("my-tasks: tasks where assignedToId== orderBy createdAt desc", () =>
    db.collection("tasks").where("assignedToId", "==", FAKE_UID).orderBy("createdAt", "desc").get()
  ));
  fail += !(await tryQuery("admin tasks: orderBy createdAt desc", () =>
    db.collection("tasks").orderBy("createdAt", "desc").get()
  ));
  fail += !(await tryQuery("feed: feeds orderBy createdAt desc", () =>
    db.collection("feeds").orderBy("createdAt", "desc").get()
  ));
  fail += !(await tryQuery("users: orderBy studentId", () =>
    db.collection("users").orderBy("studentId").get()
  ));
  fail += !(await tryQuery("studios: orderBy name", () =>
    db.collection("studios").orderBy("name").get()
  ));

  fail += !(await tryQuery("conflict check: slots where itemId==", () =>
    db.collection("slots").where("itemId", "==", "1").get()
  ));

  console.log("=== query ของ script แจ้งเตือน ===");
  const now = new Date();
  const lowerBoundTask = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const cutoffTask = new Date(now.getTime() + 24 * 3600 * 1000);

  fail += !(await tryQuery("notify tasks: status in [...] AND dueDate > lower AND dueDate <= cutoff", () =>
    db
      .collection("tasks")
      .where("status", "in", ["pending", "in_progress"])
      .where("dueDate", ">", lowerBoundTask)
      .where("dueDate", "<=", cutoffTask)
      .get()
  ));

  const lowerBoundBooking = new Date(now.getTime() - 3600 * 1000);
  const cutoffBooking = new Date(now.getTime() + 3 * 3600 * 1000);

  fail += !(await tryQuery("notify bookings: status==approved AND startAt > lower AND startAt <= cutoff", () =>
    db
      .collection("bookings")
      .where("status", "==", "approved")
      .where("startAt", ">", lowerBoundBooking)
      .where("startAt", "<=", cutoffBooking)
      .get()
  ));

  console.log(fail ? `\n✗ พบ ${fail} query ที่มีปัญหา` : "\n✅ ทุก query ทำงานได้");
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e.message);
  process.exit(1);
});
