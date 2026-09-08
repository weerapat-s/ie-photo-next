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
import type { ResolvedAction } from "./plan";
import type { UserDoc, WithId } from "@/lib/types";

export interface ApplyResult {
  assigned: number;
  tasksCreated: number;
  peopleUpdated: number;
  /** แอ็กชันที่ตัดออกเพราะกฎความปลอดภัยไม่ยอมให้ทำจากฝั่งนี้ */
  skipped: string[];
  /** อีเมลที่ส่งออกไปได้จริง */
  mailed: number;
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
  const out: ApplyResult = { assigned: 0, tasksCreated: 0, peopleUpdated: 0, skipped: [], mailed: 0 };

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
  if (out.assigned + out.tasksCreated + out.peopleUpdated > 0) await batch.commit();
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
  if (r.peopleUpdated) parts.push(`อัปเดตข้อมูล ${r.peopleUpdated} คน`);
  if (r.mailed) parts.push(`ส่งอีเมลแจ้ง ${r.mailed} ฉบับ`);
  return parts.length ? parts.join(" · ") : "ไม่มีรายการที่ทำได้";
}
