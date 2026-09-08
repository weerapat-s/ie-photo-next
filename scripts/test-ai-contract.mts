// scripts/test-ai-contract.mts — ยิงโมเดลจริงเพื่อพิสูจน์ว่า "สัญญา JSON" ใช้ได้
//
// นี่คือจุดที่พังง่ายที่สุดของฟีเจอร์ผู้ช่วย: ถ้าโมเดลไม่ยอมตอบเป็น JSON ตามรูปแบบ
// หรือแต่ง bookingId/uid ขึ้นมาเอง แผนที่ได้จะใช้ไม่ได้ทั้งหมด — และจะรู้ก็ต่อเมื่อ
// กรรมการเปิดใช้จริงแล้ว unit test ธรรมดาจับไม่ได้ ต้องคุยกับโมเดลจริงเท่านั้น
//
// รัน: OKMD_KEY=sk_... OKMD_URL=https://<worker>/v1 node --experimental-strip-types scripts/test-ai-contract.mts
// ไม่ใส่คีย์ = ข้ามไป (npm test จะได้ไม่พังบนเครื่องที่ไม่มีคีย์ และไม่กินโควตาโดยไม่ตั้งใจ)
import { SYSTEM_PROMPT } from "../lib/ai/prompt.ts";
import { parseAiReply, resolvePlan, type AiPlan } from "../lib/ai/plan.ts";

const KEY = process.env.OKMD_KEY ?? "";
const URL_BASE = process.env.OKMD_URL ?? "https://okmd-proxy.wooden-date.workers.dev/v1";
const MODEL = process.env.OKMD_MODEL ?? "gemini-2.5-flash-lite";

if (!KEY) {
  console.log("— ข้ามการทดสอบ AI (ไม่ได้ตั้ง OKMD_KEY) —");
  process.exit(0);
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

/** ชุมนุมจำลอง — ตั้งใจให้มีกับดัก: คนหนึ่งงานล้น อีกคนกันวันไว้ อีกคนว่างสนิท */
const SNAPSHOT = `วันนี้: วันอังคารที่ 1 กันยายน 2569 (2026-09-01)

กำลังคน: ทีมงาน 3 คน · มีงานอยู่ 2 คน · เฉลี่ย 2.7 งาน/คน · หนักสุด 7 งาน · การกระจายงาน: กระจุกอยู่คนเดียว (Gini 0.61)
ยังว่างไม่มีงานเลย: ซี
เสี่ยงงานล้น: เอ
อุปกรณ์: ทั้งหมด 8 · พร้อมใช้ 6 · ซ่อม 1

รายชื่อสมาชิก:
- เอ ทดสอบ (uid=uidA) · กรรมการ (แอดมิน) · ทีมงาน · งานค้าง 7
- บี ทดสอบ (uid=uidB) · สมาชิก · ทีมงาน · งานค้าง 1 · ไม่ว่าง: 2026-09-05,2026-09-06
- ซี ทดสอบ (uid=uidC) · สมาชิก · ทีมงาน · งานค้าง 0

งานในอีก 45 วัน:
- photographer "ถ่ายรับปริญญา" (bookingId=bk1) · 5 ก.ย. 09:00–5 ก.ย. 12:00 · สถานะ approved · ที่ หอประชุมใหญ่ · ขอ 2 คน · ยังไม่มีคนรับ
- photographer "ถ่ายกีฬาสี" (bookingId=bk2) · 20 ก.ย. 08:00–20 ก.ย. 17:00 · สถานะ approved · ที่ สนามกีฬา · ขอ 1 คน · ยังไม่มีคนรับ

งานย่อยที่ยังค้าง:
- (ไม่มี)`;

const BOOKINGS = [
  { id: "bk1", usageType: "ถ่ายรับปริญญา", itemName: "ทีม", crewSize: 2 },
  { id: "bk2", usageType: "ถ่ายกีฬาสี", itemName: "ทีม", crewSize: 1 },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
] as any[];
const USERS = [
  { id: "uidA", firstName: "เอ", lastName: "ทดสอบ" },
  { id: "uidB", firstName: "บี", lastName: "ทดสอบ" },
  { id: "uidC", firstName: "ซี", lastName: "ทดสอบ" },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
] as any[];

async function ask(userText: string): Promise<string> {
  const res = await fetch(`${URL_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`,
      Origin: "https://iephoto.web.app",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      stream: false,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: `สถานะชุมนุมตอนนี้:\n${SNAPSHOT}` },
        { role: "user", content: userText },
      ],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

console.log("— สัญญา JSON ของผู้ช่วย (ยิงโมเดลจริง) —");

// ── 1. สั่งวางแผนงานที่ยังไม่มีคนรับ → ต้องได้แผนที่ใช้ได้จริง ──
{
  const raw = await ask("วางแผนมอบหมายงานที่ยังไม่มีคนรับให้หน่อย");
  const parsed = parseAiReply(raw);
  check("ตอบเป็น JSON ที่แกะได้ (มีแผนหรือคำถาม)", !!parsed.plan || parsed.questions.length > 0, raw.slice(0, 300));

  if (parsed.plan) {
    const { actions, dropped } = resolvePlan(parsed.plan as AiPlan, BOOKINGS, USERS);
    check("อ้าง bookingId/uid ที่มีอยู่จริงทั้งหมด", dropped === 0, `ถูกตัดทิ้ง ${dropped} รายการ`);
    check("เสนอมอบหมายอย่างน้อย 1 งาน", actions.length > 0);

    const bk1 = actions.find((a) => a.type === "assign" && a.bookingId === "bk1");
    if (bk1 && bk1.type === "assign") {
      check(
        "งาน 5 ก.ย. ไม่จ่ายให้ บี ที่กันวันนั้นไว้",
        !bk1.userIds.includes("uidB"),
        `ได้ ${bk1.userIds.join(",")}`
      );
      check("งานที่ขอ 2 คน ไม่เสนอเกิน 2", bk1.userIds.length <= 2, `เสนอ ${bk1.userIds.length} คน`);
    }

    const all = actions.flatMap((a) => (a.type === "assign" ? a.userIds : []));
    check("กระจายไปหาคนที่ยังว่าง (ซี) ไม่กองที่ เอ ซึ่งงานล้น", all.includes("uidC"), `ได้ ${all.join(",")}`);
  }
  check("มีคำอธิบายเป็นข้อความให้คนอ่าน", parsed.reply.length > 0);
}

// ── 2. สั่งงานที่ข้อมูลไม่พอ → ต้องถามกลับ ไม่ใช่เดา ──
{
  const raw = await ask("จัดทีมให้งานถ่ายอีเวนต์ที่จะจัดเดือนหน้าหน่อย");
  const parsed = parseAiReply(raw);
  check(
    "ข้อมูลไม่พอ → ถามกลับ ไม่แต่งงานที่ไม่มีอยู่",
    parsed.questions.length > 0 || parsed.plan === null,
    raw.slice(0, 300)
  );
  if (parsed.plan) {
    const { dropped } = resolvePlan(parsed.plan as AiPlan, BOOKINGS, USERS);
    check("ถ้าเสนอแผนมาด้วย ต้องไม่มี id ที่แต่งขึ้น", dropped === 0, `ถูกตัดทิ้ง ${dropped}`);
  }
}

// ── 3. ถามเชิงบริหาร → ตอบได้โดยไม่ต้องมีแผน ──
{
  const raw = await ask("ตอนนี้ใครงานล้นบ้าง");
  const parsed = parseAiReply(raw);
  check("ตอบคำถามบริหารได้", parsed.reply.length > 0, raw.slice(0, 200));
  check("ระบุชื่อคนที่งานล้นได้ถูก", parsed.reply.includes("เอ"), parsed.reply.slice(0, 200));
}

// ── 4. สั่งสร้างงานย่อย → ต้องได้ create_task ที่ระบุคนถูก ──
{
  const raw = await ask('สร้างงานย่อยให้ ซี คัดภาพงานรับปริญญา ส่งภายในวันที่ 10 กันยายน 2026');
  const parsed = parseAiReply(raw);
  const task = parsed.plan?.actions.find((a) => a.type === "create_task");
  check("สร้างงานย่อยได้ (create_task)", !!task, raw.slice(0, 300));
  if (task && task.type === "create_task") {
    check("มอบงานย่อยให้คนที่สั่ง (ซี = uidC)", task.assignToId === "uidC", `ได้ ${task.assignToId}`);
    check(
      "วันกำหนดส่งเป็นรูปแบบ YYYY-MM-DD",
      !task.dueDate || /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate),
      String(task.dueDate)
    );
  }
}

// ── 5. บอกความถนัดใหม่ → ต้องเสนอ update_person ไม่ใช่แค่พูดเฉย ๆ ──
{
  const raw = await ask("ซี เพิ่งบอกว่าถนัดตัดต่อวิดีโอด้วย บันทึกไว้ให้หน่อย");
  const parsed = parseAiReply(raw);
  const upd = parsed.plan?.actions.find((a) => a.type === "update_person");
  check("เติมข้อมูลคนได้ (update_person)", !!upd, raw.slice(0, 300));
  if (upd && upd.type === "update_person") {
    check("แก้ข้อมูลของคนที่ถูกต้อง (ซี)", upd.userId === "uidC", `ได้ ${upd.userId}`);
  }
}

// \u2500\u2500 6. \u0e2a\u0e31\u0e48\u0e07\u0e41\u0e01\u0e49\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e25\u0e48\u0e19/\u0e22\u0e28 \u2192 update_person \u0e21\u0e35\u0e1f\u0e34\u0e25\u0e14\u0e4c\u0e43\u0e2b\u0e21\u0e48 \u2500\u2500
{
  const raw = await ask("\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e25\u0e48\u0e19\u0e02\u0e2d\u0e07 \u0e0b\u0e35 \u0e40\u0e1b\u0e47\u0e19 \u0e15\u0e49\u0e19\u0e2d\u0e49\u0e2d\u0e22");
  const parsed = parseAiReply(raw);
  const upd = parsed.plan?.actions.find((a) => a.type === "update_person");
  check("\u0e41\u0e01\u0e49\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e25\u0e48\u0e19\u0e1c\u0e48\u0e32\u0e19\u0e41\u0e0a\u0e15\u0e44\u0e14\u0e49", !!upd, raw.slice(0, 250));
  if (upd && upd.type === "update_person") {
    check("\u0e15\u0e31\u0e49\u0e07 nickname \u0e43\u0e2b\u0e49\u0e04\u0e19\u0e17\u0e35\u0e48\u0e16\u0e39\u0e01 (uidC)", upd.userId === "uidC", `\u0e44\u0e14\u0e49 ${upd.userId}`);
  }
}

console.log(`AI contract: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
