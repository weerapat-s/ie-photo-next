"use client";
// lib/ai/plan.ts — แปลงคำตอบของ AI เป็นแผนที่ระบบเอาไปทำต่อได้
//
// หลักที่ยึด: **AI เสนอ ระบบไม่ลงมือเอง** ทุกแอ็กชันต้องให้กรรมการกดยืนยัน
// และต้องตรวจก่อนว่า id ที่ AI อ้างมามีอยู่จริง — โมเดลแต่ง id ขึ้นมาเองได้เสมอ
import type { BookingDoc, EquipmentDoc, UserDoc, WithId } from "@/lib/types";

/** มอบหมายคนเข้างานที่มีอยู่แล้ว */
export interface AssignAction {
  type: "assign";
  bookingId: string;
  userIds: string[];
  why?: string;
}

/** จ่าย/ให้ยืมอุปกรณ์กับสมาชิก (สร้างใบจองใหม่ อนุมัติทันที) */
export interface LendEquipmentAction {
  type: "lend_equipment";
  equipmentId: string;
  userId: string;
  /** YYYY-MM-DD — ไม่ใส่ = เริ่มวันนี้ */
  startDate?: string;
  /** YYYY-MM-DD — ไม่ใส่ = ค่าเริ่มต้นของระบบ */
  endDate?: string;
  /** ยืมเพื่องานอะไร */
  usageType?: string;
  why?: string;
}

/** สร้างงานย่อยมอบให้คน (เช่น "คัดภาพงานรับปริญญา") */
export interface CreateTaskAction {
  type: "create_task";
  title: string;
  assignToId: string;
  description?: string;
  /** YYYY-MM-DD */
  dueDate?: string;
  bookingId?: string;
  why?: string;
}

/** แก้ข้อมูลคน — ชื่อ ชื่อเล่น เบอร์ ยศ ความถนัด ประสบการณ์ โน้ต */
export interface UpdatePersonAction {
  type: "update_person";
  userId: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  phone?: string;
  /** สิทธิ์ในระบบ — rules ยังคุมว่าใครตั้งใครได้ */
  role?: "member" | "admin" | "super_admin";
  skills?: string[];
  seniority?: number;
  note?: string;
  why?: string;
}

export type PlanAction = AssignAction | CreateTaskAction | UpdatePersonAction | LendEquipmentAction;

export interface AiPlan {
  summary: string;
  actions: PlanAction[];
}

export interface AiReply {
  reply: string;
  questions: string[];
  plan: AiPlan | null;
}

/** ตัดรั้ว ```json ที่โมเดลชอบใส่มา แล้วคว้าเฉพาะก้อน { … } ก้อนแรก */
function extractJson(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return body.slice(start, end + 1);
}

/** ตัดรั้ว ``` ที่โมเดลใส่มา ไม่ให้ผู้ใช้เห็นเป็นข้อความดิบ */
function stripFences(s: string): string {
  return s.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
}

/** ถอด escape ในสตริง JSON แบบง่าย (\n \" \\ ฯลฯ) */
function unescapeJson(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

/**
 * กู้ข้อความ reply จาก JSON ที่ไม่สมบูรณ์
 *
 * โมเดลบางครั้งตอบ JSON แล้วถูกตัดกลางคัน (เจอจริง: จบที่ `"แต่ละ` ไม่มีปีกกาปิด)
 * JSON.parse จึงล้ม ถ้าปล่อยไปจะโชว์ ```json ดิบให้ผู้ใช้เห็น และบันทึกลงประวัติเป็นขยะ
 * ตรงนี้ดึงค่า reply กับ questions ด้วย regex แม้ก้อนจะไม่ครบ
 */
function salvageReply(raw: string): AiReply | null {
  const body = raw.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i)?.[1] ?? raw;
  const replyMatch = body.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!replyMatch) return null;
  const questions: string[] = [];
  const qBlock = body.match(/"questions"\s*:\s*\[([\s\S]*?)(?:\]|$)/)?.[1];
  if (qBlock) {
    for (const m of qBlock.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      const q = unescapeJson(m[1]).trim();
      if (q) questions.push(q);
    }
  }
  return { reply: unescapeJson(replyMatch[1]).trim(), questions, plan: null };
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

function str(v: unknown, max: number): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
}

/** แปลงแอ็กชันดิบ 1 อัน — คืน null ถ้ารูปแบบไม่ครบ */
function toAction(a: Record<string, unknown>): PlanAction | null {
  switch (a?.type) {
    case "assign": {
      const bookingId = str(a.bookingId, 60);
      const userIds = asStringArray(a.userIds);
      if (!bookingId || userIds.length === 0) return null;
      return { type: "assign", bookingId, userIds, why: str(a.why, 300) };
    }
    case "create_task": {
      const title = str(a.title, 200);
      const assignToId = str(a.assignToId, 60);
      if (!title || !assignToId) return null;
      const due = str(a.dueDate, 10);
      return {
        type: "create_task",
        title,
        assignToId,
        description: str(a.description, 500),
        // รับเฉพาะรูปแบบ YYYY-MM-DD — อย่างอื่นทิ้งดีกว่าเดาแล้วตั้งวันผิด
        dueDate: due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : undefined,
        bookingId: str(a.bookingId, 60),
        why: str(a.why, 300),
      };
    }
    case "lend_equipment": {
      const equipmentId = str(a.equipmentId, 60);
      const userId = str(a.userId, 60);
      if (!equipmentId || !userId) return null;
      const s = str(a.startDate, 10);
      const e = str(a.endDate, 10);
      const ok = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
      return {
        type: "lend_equipment",
        equipmentId,
        userId,
        startDate: ok(s),
        endDate: ok(e),
        usageType: str(a.usageType, 120),
        why: str(a.why, 300),
      };
    }
    case "update_person": {
      const userId = str(a.userId, 60);
      if (!userId) return null;
      const act: UpdatePersonAction = { type: "update_person", userId, why: str(a.why, 300) };
      const fn = str(a.firstName, 60);
      if (fn) act.firstName = fn;
      const ln = str(a.lastName, 60);
      if (ln) act.lastName = ln;
      const nick = str(a.nickname, 30);
      if (nick) act.nickname = nick;
      const phone = str(a.phone, 20);
      if (phone) act.phone = phone;
      if (a.role === "member" || a.role === "admin" || a.role === "super_admin") act.role = a.role;
      const skills = asStringArray(a.skills).slice(0, 12);
      if (skills.length) act.skills = skills;
      const sen = typeof a.seniority === "number" ? Math.round(a.seniority) : undefined;
      if (sen !== undefined && sen >= 1 && sen <= 5) act.seniority = sen;
      const note = str(a.note, 300);
      if (note) act.note = note;
      // ไม่มีอะไรจะแก้เลย = ไม่ต้องมีแอ็กชันนี้
      return act.firstName || act.lastName || act.nickname || act.phone || act.role ||
        act.skills || act.seniority || act.note
        ? act
        : null;
    }
    default:
      return null;
  }
}

/**
 * อ่านคำตอบดิบ → AiReply
 * ถ้าโมเดลไม่ยอมตอบ JSON ก็ไม่ทิ้งคำตอบ — เอาข้อความดิบมาแสดงเป็น reply แทน
 * (ดีกว่าขึ้น error ให้ผู้ใช้งงว่าพิมพ์ผิดตรงไหน)
 */
export function parseAiReply(raw: string): AiReply {
  const json = extractJson(raw);
  // ไม่มีก้อน JSON ปิดครบ — อาจเป็นข้อความล้วน หรือ JSON ที่ถูกตัดกลางคัน
  // ลองกู้ reply ก่อน (ถ้าหน้าตาเป็น JSON) ไม่งั้นค่อยถือเป็นข้อความล้วน
  if (!json) return salvageReply(raw) ?? { reply: stripFences(raw), questions: [], plan: null };

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(json) as Record<string, unknown>;
  } catch {
    // JSON ไม่ครบ (ถูกตัดกลางคัน) — กู้ reply ให้ได้ก่อนยอมโชว์ของดิบ
    return salvageReply(raw) ?? { reply: stripFences(raw), questions: [], plan: null };
  }

  const planRaw = data.plan as Record<string, unknown> | null | undefined;
  const actionsRaw = Array.isArray(planRaw?.actions) ? planRaw.actions : [];
  const actions = actionsRaw
    .map((a) => toAction(a as Record<string, unknown>))
    .filter((a): a is PlanAction => a !== null);

  const reply = typeof data.reply === "string" ? data.reply.trim() : "";
  return {
    reply: reply || salvageReply(raw)?.reply || "",
    questions: asStringArray(data.questions),
    plan:
      planRaw && actions.length
        ? { summary: typeof planRaw.summary === "string" ? planRaw.summary : "", actions }
        : null,
  };
}

/* ═══ จับคู่แผนกับข้อมูลจริง ═══════════════════════════════════ */

export interface ResolvedAssign extends AssignAction {
  booking: WithId<BookingDoc>;
  users: WithId<UserDoc>[];
}
export interface ResolvedCreateTask extends CreateTaskAction {
  assignee: WithId<UserDoc>;
}
export interface ResolvedUpdatePerson extends UpdatePersonAction {
  user: WithId<UserDoc>;
}
export interface ResolvedLendEquipment extends LendEquipmentAction {
  equipment: WithId<EquipmentDoc>;
  user: WithId<UserDoc>;
}
export type ResolvedAction =
  | ResolvedAssign
  | ResolvedCreateTask
  | ResolvedUpdatePerson
  | ResolvedLendEquipment;

/**
 * ทิ้งแอ็กชันที่อ้างของไม่มีอยู่จริง
 * @returns actions ที่ใช้ได้ + จำนวนที่ถูกทิ้งไป (เอาไปบอกผู้ใช้ตรง ๆ)
 */
export function resolvePlan(
  plan: AiPlan,
  bookings: WithId<BookingDoc>[],
  users: WithId<UserDoc>[],
  equipments: WithId<EquipmentDoc>[] = []
): { actions: ResolvedAction[]; dropped: number } {
  const bookingOf = new Map(bookings.map((b) => [b.id, b]));
  const userOf = new Map(users.map((u) => [u.id, u]));
  const equipOf = new Map(equipments.map((e) => [e.id, e]));
  const out: ResolvedAction[] = [];
  let dropped = 0;

  for (const a of plan.actions) {
    if (a.type === "assign") {
      const booking = bookingOf.get(a.bookingId);
      const known = a.userIds.filter((id) => userOf.has(id));
      if (!booking || known.length === 0) {
        dropped++;
        continue;
      }
      out.push({ ...a, userIds: known, booking, users: known.map((id) => userOf.get(id)!) });
    } else if (a.type === "create_task") {
      const assignee = userOf.get(a.assignToId);
      if (!assignee) {
        dropped++;
        continue;
      }
      out.push({ ...a, assignee });
    } else if (a.type === "lend_equipment") {
      const equipment = equipOf.get(a.equipmentId);
      const user = userOf.get(a.userId);
      if (!equipment || !user) {
        dropped++;
        continue;
      }
      out.push({ ...a, equipment, user });
    } else {
      const user = userOf.get(a.userId);
      if (!user) {
        dropped++;
        continue;
      }
      out.push({ ...a, user });
    }
  }
  return { actions: out, dropped };
}
