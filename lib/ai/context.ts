"use client";
// lib/ai/context.ts — สรุปสถานะชุมนุมให้ AI อ่าน
//
// โควตาของ OKMD คือ 30,000 token/วัน ทั้งชุมนุมใช้ร่วมกัน — บริบทจึงต้องสั้น
// ตัดรายละเอียดที่ AI ไม่ต้องใช้ตัดสินใจออกให้หมด และ **ไม่ส่งข้อมูลส่วนตัว**
// (เบอร์โทร อีเมล รหัสนักศึกษา) ออกไปนอกระบบ ส่งแค่ชื่อ ยศ และตัวเลขภาระงาน
import { dateKey, daysBetween } from "@/lib/availability";
import { displayName, titleLine } from "@/lib/roles";
import { hrStats, describeBalance, type CrewLoad } from "@/lib/analytics";
import type { AvailabilityDoc, BookingDoc, EquipmentDoc, UserDoc, WithId } from "@/lib/types";

/** จำกัดจำนวนแถวที่ส่งไป — ชุมนุมมีสมาชิกหลักสิบ งานหลักสิบ พอเห็นภาพแล้ว */
const MAX_PEOPLE = 40;
const MAX_JOBS = 25;
const HORIZON_DAYS = 45;

export interface ClubSnapshotInput {
  now: number;
  users: WithId<UserDoc>[];
  bookings: WithId<BookingDoc>[];
  availability: WithId<AvailabilityDoc>[];
  equipments: WithId<EquipmentDoc>[];
  load: CrewLoad[];
  /** ภาระงานราย uid — crewLoad คีย์ด้วย id ของ photographers ไม่ใช่ uid จึงต้องแปลงมาก่อน */
  loadByUid: Map<string, number>;
  /** uid ของคนที่เป็นทีมงาน (มี doc crew/{uid}) */
  crewUids: Set<string>;
  /** ความถนัดจากการ์ดตากล้อง (photographers.skills) คีย์ด้วย uid */
  skillsByUid: Map<string, string[]>;
  /** งานย่อยที่ยังค้าง — AI ต้องเห็นก่อนจะสร้างงานซ้ำ */
  openTasks: { title: string; assignedToName: string }[];
}

function fmt(ms: number): string {
  return new Date(ms).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * สร้างบริบทเป็นข้อความสั้น ๆ
 * ใช้ uid จริงในวงเล็บ เพราะแผนที่ AI เสนอกลับมาต้องอ้าง uid ให้ระบบเขียนต่อได้
 */
export function buildClubSnapshot(input: ClubSnapshotInput): string {
  const { now, users, bookings, availability, equipments, load, loadByUid, crewUids, skillsByUid, openTasks } = input;
  const todayKey = dateKey(now);
  const horizon = now + HORIZON_DAYS * 86_400_000;

  const busyOf = new Map(availability.map((a) => [a.id, (a.busyDates ?? []).filter((d) => d >= todayKey)]));

  // ── คน ──
  const people = users
    .filter((u) => !u.disabled)
    .slice(0, MAX_PEOPLE)
    .map((u) => {
      const busy = busyOf.get(u.id) ?? [];
      const isCrew = crewUids.has(u.id);
      const nick = u.nickname?.trim();
      const roleLabel = u.role === "super_admin" ? "ประธาน" : u.role === "admin" ? "กรรมการ" : "สมาชิก";
      const parts = [
        `${displayName(u)}${nick ? ` (${nick})` : ""} (uid=${u.id})`,
        titleLine(u),
        `สิทธิ์ ${roleLabel}`,
        isCrew ? "ทีมงาน" : "",
        `รหัส ${u.studentId ?? "-"}`,
        `งานค้าง ${loadByUid.get(u.id) ?? 0}`,
      ];
      // ความถนัดมาจาก 2 ที่: โปรไฟล์สมาชิก และการ์ดตากล้อง — รวมแล้วตัดซ้ำ
      const skills = [...new Set([...(u.skills ?? []), ...(skillsByUid.get(u.id) ?? [])])];
      if (skills.length) parts.push(`ถนัด: ${skills.slice(0, 8).join(",")}`);
      if (u.seniority) parts.push(`ประสบการณ์ ${u.seniority}/5`);
      if (u.note?.trim()) parts.push(`โน้ต: ${u.note.trim().slice(0, 80)}`);
      if (busy.length) parts.push(`ไม่ว่าง: ${busy.slice(0, 8).join(",")}${busy.length > 8 ? "…" : ""}`);
      return "- " + parts.join(" · ");
    });

  // ── งานที่ยังไม่จบ ──
  const nameOf = new Map(users.map((u) => [u.id, displayName(u)]));
  const jobs = bookings
    .filter(
      (b) =>
        b.endAt.toMillis() > now &&
        b.startAt.toMillis() < horizon &&
        b.status !== "cancelled" &&
        b.status !== "rejected"
    )
    .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())
    .slice(0, MAX_JOBS)
    .map((b) => {
      const ids = b.assigneeIds ?? [];
      const parts = [
        `${b.bookingType} "${b.usageType || b.itemName}" (bookingId=${b.id})`,
        `${fmt(b.startAt.toMillis())}–${fmt(b.endAt.toMillis())}`,
        `สถานะ ${b.status}`,
      ];
      if (b.location) parts.push(`ที่ ${b.location}`);
      if (b.crewSize) parts.push(`ขอ ${b.crewSize} คน`);
      parts.push(
        ids.length
          ? `มอบหมายแล้ว: ${ids.map((x) => nameOf.get(x) ?? x).join(",")}`
          : "ยังไม่มีคนรับ"
      );
      return "- " + parts.join(" · ");
    });

  // ── ภาพรวมกำลังคน ──
  const hr = hrStats(load);
  const balance = describeBalance(hr.gini, hr.activeCrew);
  const gear = {
    total: equipments.length,
    available: equipments.filter((e) => e.status === "available").length,
    maintenance: equipments.filter((e) => e.status === "maintenance").length,
  };

  return [
    `วันนี้: ${new Date(now).toLocaleDateString("th-TH", { dateStyle: "full" })} (${todayKey})`,
    "",
    `กำลังคน: ทีมงาน ${hr.totalCrew} คน · มีงานอยู่ ${hr.activeCrew} คน · เฉลี่ย ${hr.avgLoad.toFixed(1)} งาน/คน · หนักสุด ${hr.maxLoad} งาน · การกระจายงาน: ${balance.label} (Gini ${hr.gini.toFixed(2)})`,
    hr.idle.length ? `ยังว่างไม่มีงานเลย: ${hr.idle.join(", ")}` : "",
    hr.overloaded.length ? `เสี่ยงงานล้น: ${hr.overloaded.join(", ")}` : "",
    `อุปกรณ์: ทั้งหมด ${gear.total} · พร้อมใช้ ${gear.available} · ซ่อม ${gear.maintenance}`,
    "",
    "รายชื่อสมาชิก:",
    ...people,
    "",
    `งานในอีก ${HORIZON_DAYS} วัน:`,
    ...(jobs.length ? jobs : ["- (ไม่มีงานค้าง)"]),
    "",
    "งานย่อยที่ยังค้าง:",
    ...(openTasks.length
      ? openTasks.slice(0, 15).map((t) => `- ${t.title} → ${t.assignedToName}`)
      : ["- (ไม่มี)"]),
  ]
    .filter(Boolean)
    .join("\n");
}

/** เช็คว่าคนนี้ติดธุระในช่วงงานไหม — ใช้ตรวจแผนที่ AI เสนอก่อนให้กดยืนยัน */
export function conflictDays(
  availability: WithId<AvailabilityDoc>[],
  uid: string,
  startMs: number,
  endMs: number
): string[] {
  const doc = availability.find((a) => a.id === uid);
  if (!doc?.busyDates?.length) return [];
  const set = new Set(doc.busyDates);
  return daysBetween(startMs, endMs).filter((d) => set.has(d));
}

export { SYSTEM_PROMPT } from "./prompt";
