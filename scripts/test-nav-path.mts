// scripts/test-nav-path.mts — การเทียบ path ต้องทนกับ "/" ท้าย
//
// บั๊กที่เกิดจริง: next.config ตั้ง trailingSlash: true (จำเป็นสำหรับ static export)
// usePathname() จึงคืน "/assign/" แต่ลิงก์ในเมนูเขียน "/assign"
// เทียบด้วย === เลยไม่มีวันตรง → dock ไม่ไฮไลต์ navbar ไม่ไฮไลต์
// และแถบย้อนกลับไม่โผล่เลยสักหน้า (วัดจากของจริง: raw "/docklive/")
import { norm, samePath } from "../lib/nav.ts";

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = "") =>
  ok ? (console.log("  ✓", n), pass++) : (console.log("  ✗", n, d), fail++);

console.log("— เทียบเส้นทางเมนู —");

check("path ที่มีขีดท้าย ตรงกับลิงก์ที่ไม่มี", samePath("/assign/", "/assign"));
check("ไม่มีขีดท้ายทั้งคู่ก็ยังตรง", samePath("/assign", "/assign"));
check("มีขีดท้ายทั้งคู่ก็ยังตรง", samePath("/assign/", "/assign/"));
check("คนละหน้าไม่ตรง", !samePath("/assign/", "/resources"));

// เคสที่พลาดง่าย: หน้าแรกเป็น "/" ล้วน ห้ามถูกตัดจนเหลือสตริงว่าง
check('หน้าแรก "/" ไม่ถูกตัดทิ้ง', norm("/") === "/", norm("/"));
check('"/" ตรงกับ "/"', samePath("/", "/"));
check('"/" ไม่ตรงกับ "/feed"', !samePath("/", "/feed"));

check("ตัด query string ออก", norm("/assign/?tab=delivery") === "/assign", norm("/assign/?tab=delivery"));
check("path ที่มี query ยังตรงกับลิงก์", samePath("/assign/?tab=delivery", "/assign"));
check("ตัด hash ออก", norm("/my/#top") === "/my", norm("/my/#top"));

check("ค่าว่าง/null ไม่พัง", norm(null) === "" && norm(undefined) === "");
check("null ไม่ตรงกับหน้าอะไรเลย", !samePath(null, "/feed"));

// prefix ซ้ำกันต้องไม่ตรงกัน — /my กับ /my-bookings คนละหน้า
check('"/my/" ไม่ตรงกับ "/my-bookings"', !samePath("/my/", "/my-bookings"));

console.log(`Nav path: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
