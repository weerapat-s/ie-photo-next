"use client";
// lib/ai/apply.ts — ลงมือทำตามแผนที่กรรมการกดยืนยันแล้ว
//
// แยกออกจาก UI เพื่อให้เห็นชัดว่า "AI แตะข้อมูลได้แค่ 3 อย่างนี้เท่านั้น"
// ทุกอย่างเขียนใน batch เดียว — ถ้าพังก็พังทั้งชุด ไม่เหลือแผนที่ทำครึ่ง ๆ กลาง ๆ
import { collection, doc, writeBatch, arrayUnion, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { displayName } from "@/lib/roles";
import { sendMail, assigned, taskNew } from "@/lib/mail";
import { fmtRange } from "@/lib/format";
import { slotPayload, findSlotConflicts } from "@/lib/slots";
import type { LendEquipmentAction, ResolvedAction } from "./plan";
import type { UserDoc, WithId } from "@/lib/types";

const DAY = 86_400_000;
/** ยืมกี่วันถ้า AI ไม่ระบุวันคืน */
const DEFAULT_LEND_DAYS = 3;

export interface ApplyResult {
  assigned: number;
  tasksCreated: number;
  peopleUpdated: number;
  /** อุปกรณ์ที่จ่าย/ให้ยืมสำเร็จ */
  lent: number;
  /** แอ็กชันที่ตัดออกเพราะกฎความปลอดภัยไม่ยอมให้ทำจากฝั่งนี้ */
  skipped: string[];
  /** อีเมลที่ส่งออกไปได้จริง */
  mailed: number;
}

/** คำนวณช่วงเวลายืม + เช็คคิวชน — คืนช่วงที่ใช้ได้ หรือเหตุผลที่ทำไม่ได้
 *  กัน start ในอดีต เพราะ firestore.rules บังคับ startAt > now-5m */
async function planLend(
  a: ResolvedAction & { type: "lend_equipment" }
): Promise<{ startAt: Timestamp; endAt: Timestamp } | { skip: string }> {
  const now = Date.now();
  let startMs = a.startDate ? new Date(`${a.startDate}T00:00:00`).getTime() : now;
  if (!Number.isFinite(startMs) || startMs < now) startMs = now + 60_000; // เผื่อเลย now-5m ชัวร์
  let endMs = a.endDate ? new Date(`${a.endDate}T23:59:59`).getTime() : startMs + DEFAULT_LEND_DAYS * DAY;
  if (!Number.isFinite(endMs) || endMs <= startMs) endMs = startMs + DEFAULT_LEND_DAYS * DAY;
  if (endMs > startMs + 29 * DAY) endMs = startMs + 29 * DAY; // rules: ไม่เกิน 30 วัน
  const conflicts = await findSlotConflicts(a.equipmentId, new Date(startMs), new Date(endMs));
  if (conflicts.length) return { skip: `${a.equipment.name} — ช่วงเวลานี้ถูกจองไว้แล้ว` };
  return { startAt: Timestamp.fromDate(new Date(startMs)), endAt: Timestamp.fromDate(new Date(endMs)) };
}

/**
 * @param actor กรรมการที่กดยืนยัน — ใช้เป็นผู้สั่งงานใน task ที่สร้าง
 */
export async function applyPlan(
  actions: ResolvedAction[],
  actor: { uid: string; name: string },
  me: WithId<UserDoc> | null,
  /** ตั้งค่าแจ้งเตือน — ไม่ส่งมา = ไม่ส่งอีเมล */
  notify?: { siteName: string; aiBaseUrl?: string; emailOn: boolean }
): Promise<ApplyResult> {
  const batch = writeBatch(db);
  const out: ApplyResult = { assigned: 0, tasksCreated: 0, peopleUpdated: 0, lent: 0, skipped: [], mailed: 0 };

  // เช็คคิวชนของการยืมทั้งหมดก่อน (async) — ทำก่อนสร้าง batch เพราะ batch เขียนพร้อมกันทีเดียว
  const lendRanges = new Map<LendEquipmentAction, { startAt: Timestamp; endAt: Timestamp } | { skip: string }>();
  for (const a of actions) {
    if (a.type === "lend_equipment") lendRanges.set(a, await planLend(a));
  }

  for (const a of actions) {
    if (a.type === "assign") {
      // arrayUnion ให้เซิร์ฟเวอร์รวมเอง — ไม่ทับคนที่มอบหมายไว้ก่อนหน้า
      batch.update(doc(db, "bookings", a.bookingId), { assigneeIds: arrayUnion(...a.userIds) });
      out.assigned++;
      continue;
    }

    if (a.type === "create_task") {
      const ref = doc(collection(db, "tasks"));
      batch.set(ref, {
        title: a.title,
        description: a.description ?? null,
        assignedById: actor.uid,
        assignedByName: actor.name,
        assignedToId: a.assignToId,
        assignedToName: displayName(a.assignee),
        bookingId: a.bookingId ?? null,
        status: "pending",
        dueDate: a.dueDate ? Timestamp.fromDate(new Date(`${a.dueDate}T23:59:59`)) : null,
        createdAt: serverTimestamp(),
      });
      out.tasksCreated++;
      continue;
    }

    if (a.type === "lend_equipment") {
      const range = lendRanges.get(a);
      if (!range || "skip" in range) {
        out.skipped.push(range && "skip" in range ? range.skip : `${a.equipment.name} — จ่ายไม่ได้`);
        continue;
      }
      const bRef = doc(collection(db, "bookings"));
      batch.set(bRef, {
        bookingType: "equipment",
        itemId: a.equipment.id,
        itemName: a.equipment.name,
        userId: a.user.id,
        userName: displayName(a.user),
        userPhone: a.user.phone ?? "",
        guestName: null,
        guestEmail: null,
        startAt: range.startAt,
        endAt: range.endAt,
        formImageUrl: null,
        returnImageUrl: null,
        usageReason: a.why?.trim() || "จ่ายผ่านผู้ช่วย AI",
        usageType: a.usageType?.trim() ? `ชุมนุม: ${a.usageType.trim()}` : "งานชุมนุม",
        location: null,
        crewSize: null,
        status: "approved",
        assigneeIds: [a.user.id],
        responsibleUserId: null,
        responsibleUserName: null,
        consentToken: null,
        createdAt: serverTimestamp(),
      });
      batch.set(
        doc(db, "slots", bRef.id),
        slotPayload({
          bookingId: bRef.id,
          itemId: a.equipment.id,
          itemName: a.equipment.name,
          bookingType: "equipment",
          startAt: range.startAt,
          endAt: range.endAt,
          status: "approved",
        })
      );
      out.lent++;
      continue;
    }

    // update_person — firestore.rules ห้ามแอดมินแก้ doc ของตัวเองผ่านเส้นทางแอดมิน
    // (กันการเลื่อนสิทธิ์ตัวเอง) จึงต้องตัดออกแล้วบอกผู้ใช้ตรง ๆ ว่าให้ไปแก้ที่โปรไฟล์
    if (a.userId === actor.uid) {
      out.skipped.push(`${displayName(a.user)} — แก้ข้อมูลตัวเองต้องทำที่หน้าโปรไฟล์`);
      continue;
    }
    const patch: Record<string, unknown> = {};
    if (a.firstName) patch.firstName = a.firstName;
    if (a.lastName) patch.lastName = a.lastName;
    if (a.nickname) patch.nickname = a.nickname;
    if (a.phone) patch.phone = a.phone;
    if (a.role) patch.role = a.role;
    if (a.skills) patch.skills = a.skills;
    if (a.seniority) patch.seniority = a.seniority;
    if (a.note) patch.note = a.note;
    batch.update(doc(db, "users", a.userId), patch);
    out.peopleUpdated++;
  }

  // ไม่มีอะไรให้เขียนเลย (โดนตัดหมด) — ไม่ต้อง commit ให้เปลืองรอบ
  if (out.assigned + out.tasksCreated + out.peopleUpdated + out.lent > 0) await batch.commit();
  void me;

  // แจ้งเตือนหลัง commit สำเร็จเท่านั้น — จะได้ไม่ส่งเมลบอกงานที่บันทึกไม่ติด
  if (notify?.emailOn) {
    for (const a of actions) {
      if (a.type === "assign") {
        for (const u of a.users) {
          if (!u.email) continue;
          const m = assigned({
            name: u.nickname?.trim() || u.firstName || "ทีมงาน",
            jobTitle: a.booking.usageType || a.booking.itemName,
            when: fmtRange(a.booking.startAt, a.booking.endAt),
            location: a.booking.location,
            teammates: a.users
              .filter((x) => x.id !== u.id)
              .map((x) => x.nickname?.trim() || x.firstName)
              .filter(Boolean)
              .join(", "),
            contact: a.booking.userPhone || null,
            siteName: notify.siteName,
          });
          if (await sendMail({ ...m, to: u.email, kind: "assigned", refId: a.bookingId }, notify.aiBaseUrl))
            out.mailed++;
        }
      } else if (a.type === "create_task" && a.assignee.email) {
        const m = taskNew({
          name: a.assignee.nickname?.trim() || a.assignee.firstName || "ทีมงาน",
          title: a.title,
          description: a.description ?? null,
          due: a.dueDate ?? null,
          by: actor.name,
          siteName: notify.siteName,
        });
        if (await sendMail({ ...m, to: a.assignee.email, kind: "task_new", refId: null }, notify.aiBaseUrl))
          out.mailed++;
      }
    }
  }

  return out;
}

/** สรุปผลเป็นข้อความสั้น ๆ ให้ toast */
export function describeResult(r: ApplyResult): string {
  const parts: string[] = [];
  if (r.assigned) parts.push(`มอบหมาย ${r.assigned} งาน`);
  if (r.tasksCreated) parts.push(`สร้างงานย่อย ${r.tasksCreated} รายการ`);
  if (r.lent) parts.push(`จ่ายอุปกรณ์ ${r.lent} รายการ`);
  if (r.peopleUpdated) parts.push(`อัปเดตข้อมูล ${r.peopleUpdated} คน`);
  if (r.mailed) parts.push(`ส่งอีเมลแจ้ง ${r.mailed} ฉบับ`);
  return parts.length ? parts.join(" · ") : "ไม่มีรายการที่ทำได้";
}
