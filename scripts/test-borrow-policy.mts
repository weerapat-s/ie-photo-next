// scripts/test-borrow-policy.mts — กติกายืมข้ามคืน + ของค้างเลยกำหนด
// รัน: node --experimental-strip-types scripts/test-borrow-policy.mts
//
// สำคัญตรงเงื่อนไขข้ามคืน เพราะเขียนซ้ำอยู่ 2 ที่ (ที่นี่กับ firestore.rules)
// ถ้าเกณฑ์เพี้ยนกัน จะกลายเป็นว่าหน้าเว็บยอมแต่ฐานข้อมูลปฏิเสธ (หรือแย่กว่า: กลับกัน)
import {
  OVERNIGHT_AFTER_MS,
  needsOvernightApproval,
  isHolding,
  overdueItems,
  overdueBlockMessage,
} from "../lib/borrow-policy.ts";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBooking = any;

const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 20); // 20 ก.ย. 2026
const ts = (ms: number) => ({ toMillis: () => ms });

function bk(o: { id: string; status: string; endMs: number; itemName?: string }): AnyBooking {
  return {
    id: o.id,
    itemName: o.itemName ?? "กล้อง",
    status: o.status,
    endAt: ts(o.endMs),
  };
}

let pass = 0,
  fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log("  ✓", name);
    pass++;
  } else {
    console.log("  ✗", name, detail ? `\n     ${detail}` : "");
    fail++;
  }
}

console.log("— ยืมข้ามคืน —");
{
  check("เกณฑ์ตรงกับที่เขียนใน firestore.rules (12 ชม.)", OVERNIGHT_AFTER_MS === 12 * HOUR, String(OVERNIGHT_AFTER_MS));
  check("ยืม 3 ชม. ไม่ใช่ข้ามคืน", needsOvernightApproval(NOW, NOW + 3 * HOUR) === false);
  check("ยืม 12 ชม. พอดี ยังไม่นับ (ขอบเขตต้องตรงกับ rules ที่ใช้ <=)", needsOvernightApproval(NOW, NOW + 12 * HOUR) === false);
  check("ยืม 12 ชม. 1 มิลลิ = ข้ามคืน", needsOvernightApproval(NOW, NOW + 12 * HOUR + 1) === true);
  check("ยืม 3 วัน = ข้ามคืน", needsOvernightApproval(NOW, NOW + 3 * DAY) === true);
}

console.log("— ของที่ยังถืออยู่ —");
{
  check("approved = ถืออยู่", isHolding(bk({ id: "a", status: "approved", endMs: NOW })));
  check("pending_return = ยังถืออยู่ (ส่งคืนแต่ยังไม่รับเข้าคลัง)", isHolding(bk({ id: "b", status: "pending_return", endMs: NOW })));
  check("pending = ยังไม่ได้ของ ไม่นับ", isHolding(bk({ id: "c", status: "pending", endMs: NOW })) === false);
  check("returned = คืนแล้ว ไม่นับ", isHolding(bk({ id: "d", status: "returned", endMs: NOW })) === false);
  check("cancelled = ไม่นับ", isHolding(bk({ id: "e", status: "cancelled", endMs: NOW })) === false);
}

console.log("— ของค้างเลยกำหนด —");
{
  const rows = [
    bk({ id: "1", status: "approved", endMs: NOW - 3 * DAY, itemName: "บอดี้ A" }),
    bk({ id: "2", status: "approved", endMs: NOW + DAY, itemName: "เลนส์ B" }),
    bk({ id: "3", status: "pending_return", endMs: NOW - DAY, itemName: "ขาตั้ง C" }),
    bk({ id: "4", status: "pending", endMs: NOW - 5 * DAY, itemName: "ยังไม่ได้รับ D" }),
    bk({ id: "5", status: "returned", endMs: NOW - 9 * DAY, itemName: "คืนแล้ว E" }),
  ];
  const late = overdueItems(rows, NOW);

  check("นับเฉพาะที่ถืออยู่และเลยกำหนด", late.length === 2, late.map((b: AnyBooking) => b.id).join(","));
  check("ได้ทั้ง approved และ pending_return", late.map((b: AnyBooking) => b.id).sort().join(",") === "1,3");
  check("ยังไม่ถึงกำหนดไม่โดนนับ", !late.some((b: AnyBooking) => b.id === "2"));
  check("รออนุมัติไม่โดนนับ แม้วันที่ขอจะผ่านไปแล้ว", !late.some((b: AnyBooking) => b.id === "4"));
  check("คืนแล้วไม่โดนนับ", !late.some((b: AnyBooking) => b.id === "5"));

  const msg = overdueBlockMessage(late, NOW);
  check("ข้อความบอกชื่อของที่ค้าง", msg.includes("บอดี้ A") && msg.includes("ขาตั้ง C"), msg);
  check("ข้อความบอกจำนวนวันที่เลย", msg.includes("เลยกำหนด 3 วัน") && msg.includes("เลยกำหนด 1 วัน"), msg);

  // เพิ่งเลยกำหนดไปไม่กี่นาที ต้องยังขึ้นว่า 1 วัน ไม่ใช่ 0 วัน (ไม่งั้นอ่านแล้วงง)
  const justLate = overdueItems([bk({ id: "6", status: "approved", endMs: NOW - 60_000 })], NOW);
  check("เพิ่งเลยกำหนดไม่ขึ้น 0 วัน", overdueBlockMessage(justLate, NOW).includes("เลยกำหนด 1 วัน"));

  check("ไม่มีของค้าง = รายการว่าง", overdueItems([bk({ id: "7", status: "approved", endMs: NOW + DAY })], NOW).length === 0);
}

console.log(`Borrow policy: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
