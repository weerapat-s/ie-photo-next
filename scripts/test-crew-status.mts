// scripts/test-crew-status.mts — สถานะรับงานต้องรวม 2 แหล่งให้ตรงกัน
//
// บั๊กที่เกิดจริง: การ์ดขึ้น "ว่างรับงาน" ทั้งที่เจ้าตัวกันวันนั้นไว้แล้ว
// เพราะป้ายอ่านแค่ธง open/closed ส่วนวันไม่ว่างอยู่คนละคอลเลกชัน
import { crewStatus, dateKey } from "../lib/availability.ts";

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = "") =>
  ok ? (console.log("  ✓", n), pass++) : (console.log("  ✗", n, d), fail++);

const NOW = new Date("2026-09-02T10:00:00+07:00").getTime();
const today = dateKey(NOW);          // 2026-09-02
const tomorrow = "2026-09-03";
const yesterday = "2026-09-01";

console.log("— สถานะรับงานของทีมงาน —");

check("ปิดรับถาวร = กดไม่ได้", crewStatus("closed", [], NOW).blocked);
check("ปิดรับถาวรขึ้นป้ายถูก", crewStatus("closed", [], NOW).label === "ปิดรับงาน");

const busyNow = crewStatus("open", [today], NOW);
check("เปิดรับ แต่กันวันนี้ไว้ = กดไม่ได้", busyNow.blocked, JSON.stringify(busyNow));
check("ป้ายบอกว่าไม่ว่างวันนี้", busyNow.label === "ไม่ว่างวันนี้", busyNow.label);
check("บอกเหตุผลบนปุ่มได้", !!busyNow.reason);

const busyLater = crewStatus("open", [tomorrow], NOW);
check("กันวันอื่นไว้ = วันนี้ยังรับได้", !busyLater.blocked);
check("แต่เตือนว่ามีวันติด", busyLater.label.includes("ติด 1 วัน"), busyLater.label);

const past = crewStatus("open", [yesterday], NOW);
check("วันที่ผ่านไปแล้วไม่นับ", !past.blocked && past.label === "ว่างรับงาน", past.label);

check("ไม่กันอะไรเลย = ว่างรับงาน", crewStatus("open", [], NOW).label === "ว่างรับงาน");
check("ธงปิดชนะแม้ไม่ได้กันวัน", crewStatus("closed", [], NOW).state === "closed");

// เรียงไม่เรียงต้องได้ผลเดียวกัน — busyDates จาก Firestore ไม่รับประกันลำดับ
check(
  "ลำดับวันใน busyDates ไม่มีผล",
  crewStatus("open", [tomorrow, today], NOW).label === crewStatus("open", [today, tomorrow], NOW).label
);

console.log(`Crew status: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
