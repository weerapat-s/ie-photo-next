// scripts/test-jobs.mts — รวม booking เป็น "งานชุมนุม" ถูกต้องไหม
// รัน: node --experimental-strip-types scripts/test-jobs.mts
import { deriveClubJobs, activeJobNames, extractJobName } from "../lib/jobs.ts";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBooking = any;

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 8); // 8 ก.ย. 2026
const ts = (ms: number) => ({ toMillis: () => ms });

/** สร้าง booking ปลอมพอให้ deriveClubJobs ทำงาน */
function bk(o: Partial<AnyBooking> & { id: string; startMs: number; endMs: number }): AnyBooking {
  return {
    bookingType: "equipment",
    itemName: "ของ",
    userId: null,
    status: "approved",
    usageType: null,
    usageReason: "",
    assigneeIds: [],
    ...o,
    startAt: ts(o.startMs),
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

console.log("— รวมงานชุมนุม (lib/jobs) —");

// ── extractJobName ──
check(
  "อุปกรณ์ 'ชุมนุม: X' → ชื่องาน X",
  extractJobName({ bookingType: "equipment", usageType: "ชุมนุม: Expo 2026", usageReason: "" } as AnyBooking) ===
    "Expo 2026"
);
check(
  "งานส่วนตัว → ไม่นับเป็นงานชุมนุม (null)",
  extractJobName({ bookingType: "equipment", usageType: "งานส่วนตัว", usageReason: "" } as AnyBooking) === null
);
check(
  "งานถ่าย → ใช้ usageType เป็นชื่องาน",
  extractJobName({ bookingType: "photographer", usageType: "ถ่ายรับปริญญา", usageReason: "x" } as AnyBooking) ===
    "ถ่ายรับปริญญา"
);

// ── deriveClubJobs: รวมใบที่ชื่อเดียวกัน + ช่วงเวลา + คน + ของ ──
{
  const bookings = [
    // งาน Expo: ถ่าย (มอบหมาย u1,u2) + ยืมกล้อง (u3 ถือ) — ยังไม่ถึง
    bk({ id: "a", bookingType: "photographer", usageType: "Expo 2026", startMs: NOW + 3 * DAY, endMs: NOW + 3 * DAY + 4 * 3600_000, assigneeIds: ["u1", "u2"] }),
    bk({ id: "b", bookingType: "equipment", usageType: "ชุมนุม: Expo 2026", itemName: "Nikon D850", startMs: NOW + 2 * DAY, endMs: NOW + 4 * DAY, userId: "u3" }),
    // งานเก่าที่จบแล้ว
    bk({ id: "c", bookingType: "photographer", usageType: "กีฬาสีปีที่แล้ว", startMs: NOW - 10 * DAY, endMs: NOW - 9 * DAY, assigneeIds: ["u1"] }),
    // งานส่วนตัว — ต้องไม่โผล่
    bk({ id: "d", bookingType: "equipment", usageType: "งานส่วนตัว", startMs: NOW + DAY, endMs: NOW + 2 * DAY, userId: "u4" }),
    // ยกเลิก — ต้องไม่นับ
    bk({ id: "e", bookingType: "photographer", usageType: "Expo 2026", status: "cancelled", startMs: NOW + DAY, endMs: NOW + DAY, assigneeIds: ["u9"] }),
  ];
  const jobs = deriveClubJobs(bookings as AnyBooking[], NOW);

  check("ได้ 2 งาน (Expo + กีฬาสี) ตัดส่วนตัว/ยกเลิกออก", jobs.length === 2, `ได้ ${jobs.length}`);

  const expo = jobs.find((j) => j.name === "Expo 2026")!;
  check("Expo รวม 2 ใบ (ถ่าย+ยืม)", !!expo && expo.bookings.length === 2, `${expo?.bookings.length}`);
  check(
    "Expo ช่วงเวลา = ครอบทั้งสองใบ (min start … max end)",
    expo.startMs === NOW + 2 * DAY && expo.endMs === NOW + 4 * DAY,
    `start=${expo.startMs - NOW}ms end=${expo.endMs - NOW}ms`
  );
  check("Expo สถานะ upcoming (ยังไม่ถึง)", expo.status === "upcoming", expo.status);
  check(
    "Expo คนในงาน = u1,u2 (มอบหมาย) + u3 (ถือของ) ไม่ซ้ำ",
    expo.peopleIds.length === 3 && ["u1", "u2", "u3"].every((u) => expo.peopleIds.includes(u)),
    expo.peopleIds.join(",")
  );
  check("Expo ของที่ยืม = Nikon D850", expo.equipmentNames.length === 1 && expo.equipmentNames[0] === "Nikon D850");
  check("ยกเลิกไม่ทำให้ u9 โผล่ในคนของงาน", !expo.peopleIds.includes("u9"));

  const past = jobs.find((j) => j.name === "กีฬาสีปีที่แล้ว")!;
  check("งานเก่าสถานะ done", past.status === "done", past.status);

  // ── activeJobNames: งานจบแล้วต้องหาย ──
  const active = activeJobNames(bookings as AnyBooking[], NOW);
  check("activeJobNames มี Expo", active.includes("Expo 2026"));
  check("activeJobNames ตัดงานที่จบแล้วออก", !active.includes("กีฬาสีปีที่แล้ว"), active.join(","));
}

// ── สถานะ active: งานที่กำลังอยู่ในช่วงเวลา ──
{
  const jobs = deriveClubJobs(
    [bk({ id: "x", bookingType: "photographer", usageType: "ค่ายตอนนี้", startMs: NOW - DAY, endMs: NOW + DAY, assigneeIds: ["u1"] })] as AnyBooking[],
    NOW
  );
  check("งานคร่อม now → active", jobs[0]?.status === "active", jobs[0]?.status);
}

console.log(`Jobs: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
