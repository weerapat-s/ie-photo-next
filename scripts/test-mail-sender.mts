// scripts/test-mail-sender.mts — ใครปรากฏเป็นผู้ส่งอีเมลของชุมนุม
// รัน: node --experimental-strip-types scripts/test-mail-sender.mts
//
// จุดที่ต้องไม่พังเงียบ: ถ้าหาคนที่ตั้งไว้ไม่เจอ (ลาออก/เปลี่ยนรหัส/พิมพ์ผิด)
// ต้องคืน resolved=false ให้หน้าจอเตือนได้ ไม่ใช่ส่งในนามคนมั่ว ๆ หรือโยน error
// จนส่งอีเมลไม่ได้ทั้งระบบ
import { resolveMailSender } from "../lib/mail-sender.ts";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyUser = any;

const SITE = "IE-Photo";
/** ตัวจัดรูปชื่อแบบเดียวกับที่หน้าเมลส่งเข้าไป (lib/roles displayName) */
const nameOf = (u: AnyUser) => `${u.firstName} ${u.lastName}`.trim();

function u(o: { id: string; studentId?: string; email?: string; firstName?: string; lastName?: string; nickname?: string }): AnyUser {
  return {
    id: o.id,
    studentId: o.studentId ?? "",
    email: o.email ?? "",
    firstName: o.firstName ?? "",
    lastName: o.lastName ?? "",
    nickname: o.nickname,
    role: "member",
  };
}

const USERS: AnyUser[] = [
  u({ id: "a", studentId: "68030271", email: "boss@kmitl.ac.th", firstName: "วีรพัฒน์", lastName: "อ่วมเกษม" }),
  u({ id: "b", studentId: "68030288", email: "other@kmitl.ac.th", firstName: "คนอื่น", lastName: "นามสกุล" }),
  u({ id: "c", studentId: "", email: "noid@kmitl.ac.th", firstName: "ไม่มีรหัส", lastName: "เลย" }),
];

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

console.log("— หาผู้ส่งจากรหัสนักศึกษา —");
{
  const s = resolveMailSender(USERS, "68030271", SITE, nameOf);
  check("เจอคนที่ตั้งไว้", s.resolved === true);
  check("ตอบกลับไปที่อีเมลของคนนั้น", s.replyTo === "boss@kmitl.ac.th", String(s.replyTo));
  check("ชื่อที่แสดงมีทั้งชื่อคนและชื่อชุมนุม", s.fromName.includes("วีรพัฒน์") && s.fromName.includes(SITE), s.fromName);
  check("คืนตัว user มาด้วย เผื่อหน้าจอใช้ต่อ", s.user?.id === "a");
}

console.log("— กรณีที่ต้องเตือน ไม่ใช่พัง —");
{
  const missing = resolveMailSender(USERS, "99999999", SITE, nameOf);
  check("หารหัสไม่เจอ = resolved false", missing.resolved === false);
  check("ไม่เจอแล้วไม่มี replyTo (ดีกว่าส่งไปที่มั่ว ๆ)", missing.replyTo === null);
  check("ไม่เจอแล้วใช้ชื่อชุมนุมแทน", missing.fromName === SITE, missing.fromName);
  check("ยังบอกรหัสที่ตั้งไว้ เพื่อให้หน้าจอบอกได้ว่าหาอะไรไม่เจอ", missing.studentId === "99999999");

  const empty = resolveMailSender(USERS, "", SITE, nameOf);
  check("ยังไม่ได้ตั้งรหัส = resolved false ไม่ใช่ไปจับคนที่ studentId ว่าง", empty.resolved === false);
  check("ยังไม่ได้ตั้งรหัส ไม่หยิบ user ที่รหัสว่างมาใช้", empty.user === null);

  const noUsers = resolveMailSender([], "68030271", SITE, nameOf);
  check("ยังโหลด users ไม่เสร็จ = ไม่พัง", noUsers.resolved === false && noUsers.fromName === SITE);
}

console.log("— ช่องว่างหัวท้าย —");
{
  const padded = resolveMailSender(USERS, "  68030271  ", SITE, nameOf);
  check("รหัสที่พิมพ์ติดช่องว่างยังหาเจอ", padded.resolved === true && padded.user?.id === "a");

  const spacedUser = resolveMailSender([u({ id: "d", studentId: " 68030271 ", email: "x@kmitl.ac.th", firstName: "มีช่องว่าง", lastName: "ในฐานข้อมูล" })], "68030271", SITE, nameOf);
  check("รหัสในฐานข้อมูลติดช่องว่างก็ยังหาเจอ", spacedUser.resolved === true);
}

console.log(`Mail sender: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
