// scripts/test-reminders.mts — ตรรกะการเตือนต้องแม่น
//
// เตือนผิดวัน หรือเตือนซ้ำ ๆ ทั้งวัน = คนเลิกอ่านอีเมลจากระบบทันที
// ตรงนี้จึงต้องมีเทสต์คุมทุกขอบเขต ไม่ใช่ลองด้วยตาแล้วผ่าน
import {
  allReminders,
  borrowReminders,
  jobReminders,
  taskReminders,
  deliveryReminders,
  dedupeKey,
  describeLeft,
  daysLate,
  LEAD,
} from "../lib/reminders.ts";

let pass = 0,
  fail = 0;
const check = (n: string, ok: boolean, d = "") =>
  ok ? (console.log("  ✓", n), pass++) : (console.log("  ✗", n, d ? `\n     ${d}` : ""), fail++);

const HOUR = 3_600_000;
const NOW = new Date("2026-09-01T12:00:00+07:00").getTime();
const ts = (ms: number) => ({ toMillis: () => ms });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const booking = (o: any): any => ({
  bookingType: "equipment",
  status: "approved",
  userId: "uidA",
  itemName: "Nikon D850",
  startAt: ts(NOW - 5 * HOUR),
  endAt: ts(NOW + 5 * HOUR),
  ...o,
});

console.log("— ตรรกะการเตือน —");

/* ── อุปกรณ์ ── */
{
  const near = booking({ id: "b1", endAt: ts(NOW + 6 * HOUR) });
  const far = booking({ id: "b2", endAt: ts(NOW + 90 * HOUR) });
  const late = booking({ id: "b3", endAt: ts(NOW - 30 * HOUR) });
  const handed = booking({ id: "b4", endAt: ts(NOW + 2 * HOUR), status: "pending_return" });
  const studio = booking({ id: "b5", endAt: ts(NOW + 2 * HOUR), bookingType: "studio" });

  const r = borrowReminders([near, far, late, handed, studio], NOW);
  const ids = r.map((x) => x.refId);

  check("เตือนของที่ใกล้ครบกำหนด", ids.includes("b1"));
  check(`ยังไม่เตือนถ้าเหลือเกิน ${LEAD.borrowHours} ชม.`, !ids.includes("b2"));
  check("เตือนของที่เลยกำหนด", r.find((x) => x.refId === "b3")?.kind === "borrow_overdue");
  check("กดคืนแล้ว (pending_return) ไม่เตือนซ้ำ", !ids.includes("b4"), ids.join(","));
  check("สตูดิโอไม่นับเป็นการยืมของ", !ids.includes("b5"));
  check("ของใกล้ครบกำหนดใช้ kind ถูก", r.find((x) => x.refId === "b1")?.kind === "borrow_due_soon");
  check("เตือนถึงคนที่ยืม", r.find((x) => x.refId === "b1")?.userIds.join() === "uidA");
}

/* ── งานถ่าย ── */
{
  const soon = booking({
    id: "j1",
    bookingType: "photographer",
    startAt: ts(NOW + 10 * HOUR),
    endAt: ts(NOW + 14 * HOUR),
    assigneeIds: ["uidA", "uidB"],
    usageType: "ถ่ายรับปริญญา",
    location: "หอประชุม",
  });
  const noCrew = booking({
    id: "j2",
    bookingType: "photographer",
    startAt: ts(NOW + 10 * HOUR),
    endAt: ts(NOW + 14 * HOUR),
    assigneeIds: [],
  });
  const started = booking({
    id: "j3",
    bookingType: "photographer",
    startAt: ts(NOW - 1 * HOUR),
    endAt: ts(NOW + 3 * HOUR),
    assigneeIds: ["uidA"],
  });

  const r = jobReminders([soon, noCrew, started], NOW);
  const ids = r.map((x) => x.refId);
  check("เตือนงานถ่ายที่ใกล้ถึง", ids.includes("j1"));
  check("เตือนทุกคนในทีม", r.find((x) => x.refId === "j1")?.userIds.length === 2);
  check("งานที่ยังไม่มีคนรับ ไม่เตือนรายคน", !ids.includes("j2"));
  check("งานที่เริ่มไปแล้ว ไม่เตือน", !ids.includes("j3"));
  check("ส่งสถานที่ไปด้วย", r.find((x) => x.refId === "j1")?.location === "หอประชุม");
}

/* ── งานย่อย ── */
{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const task = (o: any): any => ({ status: "pending", assignedToId: "uidC", title: "คัดภาพ", ...o });
  const r = taskReminders(
    [
      task({ id: "t1", dueDate: ts(NOW + 20 * HOUR) }),
      task({ id: "t2", dueDate: ts(NOW + 200 * HOUR) }),
      task({ id: "t3", dueDate: ts(NOW + 10 * HOUR), status: "completed" }),
      task({ id: "t4", dueDate: null }),
    ],
    NOW
  );
  const ids = r.map((x) => x.refId);
  check("เตือนงานย่อยที่ใกล้กำหนด", ids.includes("t1"));
  check("ยังไม่ถึงเวลา ไม่เตือน", !ids.includes("t2"));
  check("งานที่เสร็จแล้ว ไม่เตือน", !ids.includes("t3"));
  check("งานที่ไม่ได้ตั้งวันส่ง ไม่เตือน", !ids.includes("t4"));
}

/* ── ไฟล์งาน ── */
{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const del = (o: any): any => ({ status: "pending", title: "ไฟล์งานกีฬาสี", ...o });
  const r = deliveryReminders(
    [
      del({ id: "d1", dueAt: ts(NOW + 20 * HOUR), assigneeIds: ["uidA"] }),
      del({ id: "d2", dueAt: ts(NOW + 20 * HOUR), assigneeIds: [], assignedToId: "uidB" }),
      del({ id: "d3", dueAt: ts(NOW + 20 * HOUR), assigneeIds: [] }),
      del({ id: "d4", dueAt: ts(NOW + 5 * HOUR), assigneeIds: ["uidA"], status: "delivered" }),
    ],
    NOW
  );
  const ids = r.map((x) => x.refId);
  check("เตือนไฟล์งานที่ใกล้กำหนด", ids.includes("d1"));
  check("ถอยไปใช้ assignedToId เดิมได้ถ้าไม่มี assigneeIds", ids.includes("d2"));
  check("ไม่มีคนรับผิดชอบ ไม่เตือน", !ids.includes("d3"));
  check("ส่งไปแล้ว ไม่เตือน", !ids.includes("d4"));
}

/* ── เรียงลำดับความด่วน ── */
{
  const r = allReminders({
    bookings: [
      booking({ id: "x1", endAt: ts(NOW + 20 * HOUR) }),
      booking({ id: "x2", endAt: ts(NOW - 48 * HOUR) }),
      booking({ id: "x3", endAt: ts(NOW + 2 * HOUR) }),
    ],
    tasks: [],
    deliveries: [],
    now: NOW,
  });
  check("เลยกำหนดขึ้นก่อน แล้วไล่ตามเวลาที่เหลือ", r.map((x) => x.refId).join(",") === "x2,x3,x1", r.map((x) => x.refId).join(","));
}

/* ── กันส่งซ้ำ ── */
{
  const r = borrowReminders([booking({ id: "k1", endAt: ts(NOW + 3 * HOUR) })], NOW)[0];
  const morning = new Date("2026-09-01T08:00:00+07:00").getTime();
  const evening = new Date("2026-09-01T22:00:00+07:00").getTime();
  const tomorrow = new Date("2026-09-02T08:00:00+07:00").getTime();
  check("เช้ากับเย็นวันเดียวกัน = คีย์เดียวกัน (ไม่ส่งซ้ำ)", dedupeKey(r, "uidA", morning) === dedupeKey(r, "uidA", evening));
  check("ข้ามวันแล้วเตือนใหม่ได้", dedupeKey(r, "uidA", morning) !== dedupeKey(r, "uidA", tomorrow));
  check("คนละคน = คนละคีย์", dedupeKey(r, "uidA", morning) !== dedupeKey(r, "uidB", morning));
}

/* ── ข้อความบอกเวลา ── */
{
  check("เหลือไม่ถึงวันบอกเป็นชั่วโมง", describeLeft(5) === "เหลือ 5 ชม.", describeLeft(5));
  check("เหลือหลายวันบอกเป็นวัน", describeLeft(50) === "เหลือ 2 วัน", describeLeft(50));
  check("เลยกำหนดบอกว่าเลยมาแล้ว", describeLeft(-30) === "เลยมาแล้ว 1 วัน", describeLeft(-30));
  check("ถึงกำหนดพอดี", describeLeft(0) === "ถึงกำหนดแล้ว");
  check("เลยกำหนดไม่ขึ้น 0 วัน", daysLate(-3) === 1, String(daysLate(-3)));
}

console.log(`Reminders: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
