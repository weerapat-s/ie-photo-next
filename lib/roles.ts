// lib/roles.ts — คำเรียกยศ/สิทธิ์ ให้ตรงกันทั้งระบบ
//
// แยก 2 แกนชัดเจน (หลัก UX: อย่าเอา "ตำแหน่งในองค์กร" ไปปนกับ "สิทธิ์ในระบบ")
//   role  = สิทธิ์ในระบบ  → member / admin / super_admin  (คุมด้วย firestore.rules)
//   title = ยศในชุมนุม    → "ประธานชุมนุม" ฯลฯ (ข้อความอิสระ ตั้งตัวเลือกได้ในหน้า /settings)
import type { IconName } from "@/components/icon";
import type { Role, UserDoc, WithId } from "./types";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "ประธาน / ผู้ดูแลสูงสุด",
  admin: "กรรมการ (แอดมิน)",
  member: "สมาชิก",
};

export const ROLE_SHORT: Record<Role, string> = {
  super_admin: "ประธาน",
  admin: "กรรมการ",
  member: "สมาชิก",
};

export const ROLE_BADGE: Record<Role, string> = {
  super_admin: "tone-brand",
  admin: "tone-ok",
  member: "tone-mute",
};

export const ROLE_ICON: Record<Role, IconName> = {
  super_admin: "president",
  admin: "admin",
  member: "member",
};

/**
 * ชื่อที่แสดงของสมาชิก — "ชื่อจริง นามสกุล (ชื่อเล่น)"
 *
 * ในชุมนุมเรียกกันด้วยชื่อเล่นเป็นหลัก แต่เอกสารและการติดต่อใช้ชื่อจริง
 * โชว์คู่กันไปเลยจะได้ไม่ต้องเดาว่า "ต้น" คือใครในรายชื่อ
 */
export function displayName(
  u: Pick<UserDoc, "firstName" | "lastName" | "studentId" | "email"> & { nickname?: string }
): string {
  const full = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  const nick = u.nickname?.trim();
  if (full) return nick ? `${full} (${nick})` : full;
  return nick || u.studentId || u.email || "ไม่ระบุชื่อ";
}

/**
 * ชื่อแสดงที่ "ไม่ซ้ำกับใคร" — ถ้ามีคนอื่นชื่อแสดงเหมือนกัน (เช่น ชื่อเล่นซ้ำ "เก้า")
 * ต่อท้ายด้วยรหัสนักศึกษา (หรือสิทธิ์ถ้าไม่มีรหัส) เพื่อให้แยกออกว่าเป็นคนละคน
 * ใช้ทุกที่ที่ให้ "เลือกคน" หรือโชว์ว่ามอบหมายให้ใคร — กันสั่งงานผิดคน
 */
export function uniqueLabel(
  u: WithId<UserDoc>,
  all: readonly WithId<UserDoc>[]
): string {
  const name = displayName(u);
  const dupe = all.some((o) => o.id !== u.id && displayName(o) === name);
  if (!dupe) return name;
  const tag = u.studentId?.trim() || ROLE_SHORT[u.role];
  return `${name} · ${tag}`;
}

/** ข้อความที่ใช้ค้นหาสมาชิก — ครอบทั้งชื่อจริง ชื่อเล่น รหัส และยศ */
export function searchText(
  u: Pick<UserDoc, "firstName" | "lastName" | "studentId" | "email" | "title"> & { nickname?: string }
): string {
  return [u.firstName, u.lastName, u.nickname, u.studentId, u.email, u.title]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** บรรทัดยศที่โชว์ใต้ชื่อ — ยศในชุมนุมมาก่อน ถ้าไม่มีค่อยใช้สิทธิ์ */
export function titleLine(u: Pick<UserDoc, "title" | "role">): string {
  return (u.title ?? "").trim() || ROLE_LABEL[u.role];
}

export function isAdminRole(role: Role | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

/** เรียงสมาชิก: ประธาน → กรรมการ → สมาชิก แล้วค่อยเรียงตามชื่อ */
export function sortByRank(a: WithId<UserDoc>, b: WithId<UserDoc>): number {
  const rank: Record<Role, number> = { super_admin: 0, admin: 1, member: 2 };
  const d = rank[a.role] - rank[b.role];
  return d !== 0 ? d : displayName(a).localeCompare(displayName(b), "th");
}
