// เทสตรรกะสรุปตัวเลข — ไม่แตะ Firestore
import { stageOfBooking, groupByStage, comparePeriods, dailyCounts, actionRequired, crewLoad, onTimeRate } from "../lib/analytics.ts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 31, 12, 0, 0);
const ts = (ms: number) => ({ toMillis: () => ms }) as never;
const bk = (o: Record<string, unknown>) => ({
  id: String(o.id ?? Math.random()), bookingType: "studio", itemId: "s1", itemName: "Studio 1",
  userId: "u1", userName: "A", userPhone: "", guestName: null, guestEmail: null,
  formImageUrl: null, returnImageUrl: null, usageReason: "x", usageType: null,
  responsibleUserId: null, responsibleUserName: null, consentToken: null,
  startAt: ts(NOW + DAY), endAt: ts(NOW + 2 * DAY), createdAt: ts(NOW), status: "approved", ...o,
}) as never;

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : (fail++, console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`));
};

// ── stage ──
eq("pending → requested", stageOfBooking(bk({ status: "pending" }), NOW), "requested");
eq("rejected → null", stageOfBooking(bk({ status: "rejected" }), NOW), null);
eq("cancelled → null", stageOfBooking(bk({ status: "cancelled" }), NOW), null);
eq("approved อนาคต → scheduled", stageOfBooking(bk({ startAt: ts(NOW + DAY), endAt: ts(NOW + 2*DAY) }), NOW), "scheduled");
eq("approved กำลังใช้ → active", stageOfBooking(bk({ startAt: ts(NOW - DAY), endAt: ts(NOW + DAY) }), NOW), "active");
eq("approved เลยเวลา → wrapping", stageOfBooking(bk({ startAt: ts(NOW - 3*DAY), endAt: ts(NOW - DAY) }), NOW), "wrapping");
eq("pending_return → wrapping", stageOfBooking(bk({ status: "pending_return" }), NOW), "wrapping");
eq("returned → done", stageOfBooking(bk({ status: "returned" }), NOW), "done");
// ขอบเขต: อยู่ที่ endAt พอดี ต้องยังนับว่า active
eq("ตรง endAt พอดี → active", stageOfBooking(bk({ startAt: ts(NOW - DAY), endAt: ts(NOW) }), NOW), "active");

// ── groupByStage: เรียงตามเวลาเริ่ม + ตัดใบที่ยกเลิกทิ้ง ──
const g = groupByStage([
  bk({ id: "late", startAt: ts(NOW + 5*DAY), endAt: ts(NOW + 6*DAY) }),
  bk({ id: "soon", startAt: ts(NOW + DAY), endAt: ts(NOW + 2*DAY) }),
  bk({ id: "gone", status: "cancelled" }),
], NOW);
eq("scheduled เรียงใกล้ก่อน", g.find(x => x.stage === "scheduled")!.bookings.map(b => b.id), ["soon", "late"]);
eq("ยกเลิกไม่โผล่", g.reduce((n, s) => n + s.bookings.length, 0), 2);

// ── comparePeriods ──
const cp = comparePeriods([
  bk({ createdAt: ts(NOW - 2*DAY) }), bk({ createdAt: ts(NOW - 5*DAY) }),
  bk({ createdAt: ts(NOW - 40*DAY) }),
], NOW, 30);
eq("รอบนี้ 2 รอบก่อน 1", [cp.current, cp.previous], [2, 1]);
eq("changePct +100", Math.round(cp.changePct!), 100);
eq("รอบก่อน 0 → changePct null", comparePeriods([bk({ createdAt: ts(NOW - DAY) })], NOW, 30).changePct, null);

// ── dailyCounts ──
const dc = dailyCounts([bk({ createdAt: ts(NOW) }), bk({ createdAt: ts(NOW) }), bk({ createdAt: ts(NOW - 100*DAY) })], NOW, 14);
eq("ยาว 14 ช่อง", dc.length, 14);
eq("วันนี้ 2 งาน", dc[13], 2);
eq("งานเก่าเกินช่วงไม่นับ", dc.reduce((a, b) => a + b, 0), 2);

// ── actionRequired ──
const dl = (o: Record<string, unknown>) => ({ status: "awaiting_upload", dueAt: null, updatedAt: null, ...o }) as never;
const ar = actionRequired(
  [bk({ status: "pending" }), bk({ status: "pending_return" })],
  [dl({}), dl({ status: "uploaded", dueAt: ts(NOW - DAY) })],
  NOW
);
eq("รวมงานที่ต้องลงมือ", [ar.pendingApproval, ar.pendingReturn, ar.awaitingUpload, ar.overdue, ar.total], [1, 1, 1, 1, 3]);
eq("งานที่ส่งแล้วไม่นับว่าเลยกำหนด",
   actionRequired([], [dl({ status: "delivered", dueAt: ts(NOW - DAY) })], NOW).overdue, 0);

// ── crewLoad ──
const cl = crewLoad(
  [{ id: "p1", name: "เอ", uid: "u9", avatarUrl: null }, { id: "p2", name: "บี", uid: null, avatarUrl: null }],
  [bk({ bookingType: "photographer", itemId: "p1", endAt: ts(NOW + DAY) }),
   bk({ bookingType: "photographer", itemId: "p1", endAt: ts(NOW - DAY), startAt: ts(NOW - 2*DAY) })],
  [dl({ assignedToId: "u9" })],
  [{ assignedToId: "u9", status: "pending" } as never],
  NOW
);
eq("นับเฉพาะคิวที่ยังไม่จบ", cl[0].upcoming, 1);
eq("รวมภาระ = คิว+ส่ง+งาน", cl[0].total, 3);
eq("เรียงคนภาระเยอะขึ้นก่อน", cl.map(c => c.name), ["เอ", "บี"]);

// ── onTimeRate ──
eq("ไม่มีงานปิด → null", onTimeRate([dl({})]).rate, null);
eq("ส่งก่อนกำหนด = 100%",
   onTimeRate([dl({ status: "delivered", dueAt: ts(NOW), updatedAt: ts(NOW - DAY) })]).rate, 100);
eq("ส่งช้า = 0%",
   onTimeRate([dl({ status: "delivered", dueAt: ts(NOW - DAY), updatedAt: ts(NOW) })]).rate, 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

/* ═══ เทส HR analytics ═══ */
import { giniCoefficient, hrStats, describeBalance, assetStats } from "../lib/analytics.ts";

const crew = (name: string, total: number) => ({ id: name, name, avatarUrl: null, upcoming: total, openDeliveries: 0, openTasks: 0, total });

let p2 = 0, f2 = 0;
const eq2 = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? p2++ : (f2++, console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`));
};

eq2("gini: กระจายเท่ากันหมด = 0", Math.round(giniCoefficient([3, 3, 3, 3]) * 100), 0);
eq2("gini: ไม่มีใครมีงาน = 0", giniCoefficient([0, 0, 0]), 0);
eq2("gini: ลิสต์ว่าง = 0", giniCoefficient([]), 0);
eq2("gini: กองที่คนเดียว → สูง", giniCoefficient([0, 0, 0, 12]) > 0.7, true);

const hr = hrStats([crew("เอ", 10), crew("บี", 2), crew("ซี", 0)]);
eq2("นับคนที่มีงานจริง", [hr.activeCrew, hr.totalCrew], [2, 3]);
eq2("เฉลี่ยภาระ", Math.round(hr.avgLoad * 10) / 10, 4);
eq2("คนแบกหนักสุด", hr.maxLoad, 10);
eq2("คนว่าง", hr.idle, ["ซี"]);
eq2("คนงานล้น (เกินเฉลี่ย 1.5 เท่า)", hr.overloaded, ["เอ"]);
eq2("ทีมว่างหมด → ไม่มีใครล้น", hrStats([crew("เอ", 0), crew("บี", 0)]).overloaded, []);

eq2("อธิบายสมดุล: ไม่มีงาน", describeBalance(0, 0).tone, "ok");
eq2("อธิบายสมดุล: กระจายดี", describeBalance(0.1, 3).tone, "ok");
eq2("อธิบายสมดุล: กระจุก", describeBalance(0.6, 3).tone, "bad");

const ts2 = (ms: number) => ({ toMillis: () => ms });
const NOW2 = Date.UTC(2026, 7, 31, 12);
const as = assetStats(
  [{ status: "available" }, { status: "available" }, { status: "maintenance" }, { status: "available" }],
  [{ itemId: "e1", status: "approved", startAt: ts2(NOW2 - 1000), endAt: ts2(NOW2 + 1000) }],
  ["e1", "e2", "e3", "e4"],
  NOW2
);
eq2("อุปกรณ์: ใช้อยู่ 1 ซ่อม 1 ว่าง 2", [as.inUse, as.maintenance, as.available, as.total], [1, 1, 2, 4]);
eq2("อัตราการใช้ 25%", Math.round(as.utilization), 25);
eq2("ไม่มีอุปกรณ์ → ไม่หารศูนย์", assetStats([], [], [], NOW2).utilization, 0);

console.log(`HR: ${p2} passed, ${f2} failed`);
if (f2) process.exit(1);
