// scripts/test-cron.mjs — ตรรกะเตือนของ Worker ต้องเลือกถูกและคีย์กันซ้ำถูกฟอร์แมต
import { runReminders } from "../workers/cron-reminders.js";

// ดึงฟังก์ชันภายในมาทดสอบผ่าน re-export ชั่วคราวไม่ได้ (ไม่ export)
// จึงทดสอบผ่าน runReminders แบบ mock ทั้ง env และ network ไม่ได้ง่าย ๆ
// → ทดสอบ computeReminders/dedupeKey โดยอ่านไฟล์แล้ว eval เฉพาะส่วน pure
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../workers/cron-reminders.js", import.meta.url), "utf8");

// ตัดเอาเฉพาะฟังก์ชัน pure ที่ไม่พึ่ง fetch/crypto มาประเมิน
const pure = src
  .split("/* ═══ ตัวรัน cron")[0]           // ตัดส่วนที่มี fetch ออก
  .replace(/export async function[\s\S]*/, "")
  .replace(/export function/g, "function") + "\nglobalThis.__t={computeReminders,dedupeKey,daysLate,ms};";
new Function(pure)();
const { computeReminders, dedupeKey } = globalThis.__t;

let pass = 0, fail = 0;
const check = (n, ok, d = "") => (ok ? (console.log("  ✓", n), pass++) : (console.log("  ✗", n, d), fail++));

const NOW = Date.parse("2026-09-03T05:00:00Z"); // = 12:00 เวลาไทย
const iso = (ms) => new Date(ms).toISOString();
const H = 3_600_000, D = 86_400_000;

console.log("— cron reminders —");

// อุปกรณ์ใกล้ครบกำหนด (อีก 10 ชม.)
let r = computeReminders(NOW, [{ id: "b1", bookingType: "equipment", status: "approved", userId: "u1", itemName: "Nikon", endAt: iso(NOW + 10 * H) }], [], []);
check("อุปกรณ์ใกล้ครบกำหนด → borrow_due_soon", r.some((x) => x.kind === "borrow_due_soon" && x.refId === "b1"), JSON.stringify(r));

// อุปกรณ์เลยกำหนด
r = computeReminders(NOW, [{ id: "b2", bookingType: "equipment", status: "approved", userId: "u1", itemName: "Lens", endAt: iso(NOW - 2 * D) }], [], []);
check("อุปกรณ์เลยกำหนด → borrow_overdue", r.some((x) => x.kind === "borrow_overdue"));

// ยังไม่ใกล้ (อีก 5 วัน) = ไม่เตือน
r = computeReminders(NOW, [{ id: "b3", bookingType: "equipment", status: "approved", userId: "u1", itemName: "X", endAt: iso(NOW + 5 * D) }], [], []);
check("ยังไม่ใกล้กำหนด = ไม่เตือน", r.length === 0);

// งานถ่ายใกล้ถึง + มีคนรับ
r = computeReminders(NOW, [{ id: "j1", bookingType: "photographer", status: "approved", assigneeIds: ["u2"], usageType: "รับปริญญา", startAt: iso(NOW + 12 * H), location: "หอประชุม" }], [], []);
check("งานถ่ายใกล้ถึง (มีคนรับ) → job_soon", r.some((x) => x.kind === "job_soon" && x.userIds.includes("u2")));

// งานถ่ายใกล้ถึงแต่ยังไม่มีคนรับ = ไม่เตือนรายคน
r = computeReminders(NOW, [{ id: "j2", bookingType: "photographer", status: "approved", assigneeIds: [], startAt: iso(NOW + 12 * H) }], [], []);
check("งานถ่ายยังไม่มีคนรับ = ไม่เตือน", r.length === 0);

// งานย่อยใกล้ส่ง
r = computeReminders(NOW, [], [{ id: "t1", status: "pending", assignedToId: "u3", title: "คัดภาพ", dueDate: iso(NOW + 1 * D) }], []);
check("งานย่อยใกล้ส่ง → task_due_soon", r.some((x) => x.kind === "task_due_soon"));

// ไฟล์งานใกล้ส่ง
r = computeReminders(NOW, [], [], [{ id: "d1", status: "awaiting_upload", assigneeIds: ["u4"], title: "งานกีฬา", dueAt: iso(NOW + 1 * D) }]);
check("ไฟล์งานใกล้ส่ง → delivery_due", r.some((x) => x.kind === "delivery_due"));

// dedupeKey = kind:refId:uid:YYYY-MM-DD (เวลาไทย)
const k = dedupeKey({ kind: "job_soon", refId: "j1" }, "u2", NOW);
check("dedupeKey ฟอร์แมตถูก + วันไทย", k === "job_soon:j1:u2:2026-09-03", k);

// เที่ยงคืนไทยข้ามวัน — 16:30Z = 23:30 ไทย ยังเป็นวันเดิม
const late = Date.parse("2026-09-03T16:30:00Z");
check("23:30 ไทย ยังเป็น 2026-09-03", dedupeKey({ kind: "x", refId: "r" }, "u", late).endsWith(":2026-09-03"), dedupeKey({ kind: "x", refId: "r" }, "u", late));
// 17:30Z = 00:30 ไทยของวันถัดไป
const next = Date.parse("2026-09-03T17:30:00Z");
check("00:30 ไทย = วันถัดไป 2026-09-04", dedupeKey({ kind: "x", refId: "r" }, "u", next).endsWith(":2026-09-04"), dedupeKey({ kind: "x", refId: "r" }, "u", next));

console.log("Cron: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
