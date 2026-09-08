// lib/ai/models.ts — รายชื่อโมเดลและลำดับสำรอง
//
// โควตาของ OKMD **แยกตามค่ายผู้ให้บริการ ไม่ใช่รวมกัน** (วัดจากของจริง:
// Gemini ใช้ไป 14,111 จาก 30,000 · ขณะที่ OpenAI ยังเหลือ 34,980 · Qwen เหลือ 19,685)
// ดังนั้นเมื่อค่ายหนึ่งโควตาหมด การสลับไป "คนละค่าย" คือได้โควตาก้อนใหม่จริง ๆ
// ลำดับสำรองด้านล่างจึงไล่ข้ามค่ายทุกขั้น ไม่ใช่ไล่รุ่นในค่ายเดิม
//
// ไฟล์นี้ไม่ import อะไรเลย เพื่อให้สคริปต์ทดสอบเรียกใช้ได้ตรง ๆ

export interface ModelInfo {
  id: string;
  /** ค่ายผู้ให้บริการ — ใช้ตัดสินว่าสลับแล้วได้โควตาใหม่ไหม */
  provider: string;
}

/** ทุกโมเดลที่ปลายทางเปิดให้ใช้ (ดึงจาก /v1/models เมื่อ 1 ก.ย. 2569) */
export const ALL_MODELS: ModelInfo[] = [
  { id: "claude-sonnet-5", provider: "Claude" },
  { id: "claude-sonnet-4.6", provider: "Claude" },
  { id: "deepseek-v4-pro", provider: "Deepseek" },
  { id: "deepseek-v4-flash", provider: "Deepseek" },
  { id: "gemini-3.7-flash", provider: "Gemini" },
  { id: "gemini-3.5-flash", provider: "Gemini" },
  { id: "gemini-3.1-pro-preview", provider: "Gemini" },
  { id: "gemini-3.1-flash-lite", provider: "Gemini" },
  { id: "gemini-3.1-flash-lite-preview", provider: "Gemini" },
  { id: "gemini-2.5-flash-lite", provider: "Gemini" },
  { id: "llama-4-maverick", provider: "Meta AI" },
  { id: "llama-4-scout", provider: "Meta AI" },
  { id: "mistral-medium-3.1", provider: "Mistral" },
  { id: "nova-2-lite-v1", provider: "Nova (AWS)" },
  { id: "nova-pro-v1", provider: "Nova (AWS)" },
  { id: "gpt-5.4", provider: "OpenAI" },
  { id: "gpt-5.4-mini", provider: "OpenAI" },
  { id: "gpt-5.4-nano", provider: "OpenAI" },
  { id: "sonar-pro", provider: "Perplexity" },
  { id: "qwen3.7-plus", provider: "Qwen" },
  { id: "qwen3.7-max", provider: "Qwen" },
  { id: "qwen3.6-flash", provider: "Qwen" },
  { id: "qwen3.5-9b", provider: "Qwen" },
  { id: "grok-4.3", provider: "xAI" },
];

export const PROVIDER_OF = new Map(ALL_MODELS.map((m) => [m.id, m.provider]));

/**
 * ลำดับที่ระบบไล่ใช้เมื่อโควตาหมด — ข้ามค่ายทุกขั้นเพื่อให้ได้โควตาใหม่
 * เลือกรุ่นเร็ว/ถูกของแต่ละค่ายก่อน เพราะงานนี้คือสรุปข้อมูลแล้วตอบ JSON
 * ไม่ได้ต้องการรุ่นใหญ่สุด
 */
export const DEFAULT_CHAIN: string[] = [
  "gemini-2.5-flash-lite", // Gemini  — เร็วและถูกสุด ผ่านเทสต์สัญญา JSON แล้ว
  "gpt-5.4-mini", //          OpenAI  — โควตาก้อนใหญ่สุดที่วัดได้ (35,000)
  "claude-sonnet-4.6", //     Claude  — เก่งภาษาไทยและทำตามรูปแบบดี
  "qwen3.7-plus", //          Qwen
  "deepseek-v4-flash", //     Deepseek
  "mistral-medium-3.1", //    Mistral
  "llama-4-scout", //         Meta AI
  "nova-2-lite-v1", //        Nova (AWS)
];

/**
 * ลำดับโมเดลที่จะไล่ใช้จริง — โมเดลหลักมาก่อน ตามด้วยตัวสำรองที่ยังไม่ซ้ำ
 * อยู่ไฟล์นี้ (ไม่ใช่ client.ts) เพราะเป็นตรรกะล้วน เทสต์ด้วย node ได้ตรง ๆ
 */
export function modelChain(cfg: { model?: string; models?: string[] }): string[] {
  const custom = (cfg.models ?? []).map((m) => m.trim()).filter(Boolean);
  const primary = cfg.model?.trim();
  const base = custom.length ? custom : DEFAULT_CHAIN;
  return [...new Set(primary ? [primary, ...base] : base)];
}

/**
 * ข้อความ/สถานะที่แปลว่า "ค่ายนี้โควตาหมดแล้ว ลองค่ายอื่น"
 *
 * สำคัญ: OKMD **ไม่ได้ตอบ 429** เวลาโควตาหมด แต่ตอบ 401 พร้อมข้อความ
 * `{"error":"This model reached daily limit."}` (วัดจากของจริง 1 ก.ย. 2569)
 * ถ้าตีว่า 401 = คีย์ผิดแล้วหยุดทันที ระบบจะไม่มีวันสลับค่ายเลย
 * จึงต้องอ่านเนื้อความก่อนตัดสิน ไม่ดูแค่รหัสสถานะ
 */
export function isQuotaExhausted(status: number, body: string): boolean {
  if (status === 429) return true;
  const s = body.toLowerCase();
  return (
    s.includes("daily limit") ||
    s.includes("quota") ||
    s.includes("rate limit") ||
    s.includes("exceeded") ||
    s.includes("limit reached")
  );
}

/** คีย์ผิดจริง ๆ (ไม่ใช่โควตาหมดที่ปลายทางส่งมาเป็น 401 เหมือนกัน) */
export function isBadKey(status: number, body: string): boolean {
  return (status === 401 || status === 403) && !isQuotaExhausted(status, body);
}
