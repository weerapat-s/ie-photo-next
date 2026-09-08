"use client";
// lib/ai/client.ts — คุยกับ API ที่เข้ากันได้กับ OpenAI (OKMD AI Playground)
//
// ทำไมไม่ใช้ `openai` npm: แอปนี้ export เป็นไฟล์นิ่ง โหลดทั้ง SDK มาเพื่อยิง
// POST เส้นเดียวไม่คุ้มขนาดบันเดิล — รูปแบบสาย (wire format) เหมือนกันทุกอย่าง
//
// ข้อควรรู้เรื่องปลายทาง:
// gen.ai.kku.ac.th ไม่ส่งหัว Access-Control-Allow-Origin กลับมา เบราว์เซอร์จึง
// บล็อกการเรียกตรงจากหน้าเว็บ (ตรวจแล้วได้ "Failed to fetch") ต้องผ่าน proxy
// ที่เติมหัว CORS ให้ — ดู workers/okmd-proxy.js
// ผลพลอยได้คือคีย์ไปอยู่ฝั่ง proxy ไม่ต้องส่งมาถึงเบราว์เซอร์เลย
import { modelChain, PROVIDER_OF, isQuotaExhausted, isBadKey } from "./models";
import type { AiConfigDoc } from "@/lib/types";

export { modelChain } from "./models";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class AiError extends Error {
  constructor(
    message: string,
    /** true = แก้ได้ด้วยการตั้งค่า ไม่ใช่ปัญหาชั่วคราว */
    readonly configIssue = false
  ) {
    super(message);
    this.name = "AiError";
  }
}

/**
 * proxy ของชุมนุม (Cloudflare Worker · โค้ดอยู่ที่ workers/okmd-proxy.js)
 *
 * ตัวนี้คือ Worker ที่ claim เข้าบัญชีชุมนุมแล้ว จึงอยู่ถาวร
 * ข้อจำกัดตอนนี้: ยังเป็นโค้ดรุ่นแรก — ไม่มี /send และไม่มีคีย์ฝั่งเซิร์ฟเวอร์
 * จึงต้องกรอกคีย์ OKMD ในหน้าตั้งค่า และอีเมลยังส่งไม่ได้จนกว่าจะ
 * `npm run worker:deploy` + `npm run worker:key` + `npm run worker:mail`
 *
 * บทเรียน: อย่าตั้งค่าเริ่มต้นเป็น Worker บนบัญชีชั่วคราวของ Cloudflare
 * บัญชีนั้นหายไปเองเมื่อพ้นเวลา claim แล้วทั้ง AI และอีเมลดับพร้อมกัน
 */
export const DEFAULT_BASE_URL = "https://okmd-proxy.wooden-date.workers.dev/v1";

export interface ChatResult {
  text: string;
  /** โมเดลที่ตอบจริง — อาจไม่ใช่ตัวแรกถ้าโควตาหมดแล้วสลับ */
  model: string;
  provider: string;
  /** โควตาที่เหลือของค่ายนั้นวันนี้ (null = ปลายทางไม่ได้บอกมา) */
  quotaLeft: number | null;
  /** โมเดลที่ลองแล้วโควตาหมด เรียงตามลำดับที่ลอง */
  skipped: string[];
}

/**
 * พร้อมใช้เมื่อ: เปิดอยู่ และมีอย่างน้อยหนึ่งอย่าง —
 *   • คีย์ (ใช้คู่กับ proxy เริ่มต้น) หรือ
 *   • baseUrl ที่ตั้งเอง (กรณี proxy ถือคีย์ไว้ให้แล้ว จึงไม่ต้องมีคีย์ฝั่งนี้)
 * ถ้าไม่มีทั้งคู่ = ยังไม่ได้ตั้งค่า ขึ้นข้อความบอกดีกว่าปล่อยให้ยิงแล้วได้ 401
 */
export function aiReady(cfg: AiConfigDoc | null | undefined): cfg is AiConfigDoc {
  if (!cfg || cfg.enabled === false) return false;
  return !!cfg.apiKey?.trim() || !!cfg.baseUrl?.trim();
}

/** อ่านโควตาคงเหลือจากคำตอบ — ปลายทางแนบ model_quota มาให้ทุกครั้ง */
interface QuotaBlock {
  daily_remaining_tokens?: number;
}

async function callOnce(
  base: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  opts: { signal?: AbortSignal; temperature?: number }
): Promise<{ ok: true; text: string; quotaLeft: number | null } | { ok: false; exhausted: boolean; error: AiError }> {
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: opts.signal,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        temperature: opts.temperature ?? 0.3,
        // กันคำตอบ JSON ถูกตัดกลางคัน — แผนหลายคนใช้เนื้อที่พอควร
        max_tokens: 1500,
      }),
    });
  } catch {
    // fetch พังก่อนได้ response = เน็ตหลุด หรือถูก CORS บล็อก
    // (เบราว์เซอร์ไม่บอกแยกกันด้วยเหตุผลด้านความปลอดภัย)
    return {
      ok: false,
      exhausted: false,
      error: new AiError(
        "เชื่อมต่อ AI ไม่ได้ — ปลายทางอาจถูกลบไปแล้ว หรือไม่อนุญาต CORS ให้เว็บนี้เรียก " +
          "ตรวจที่อยู่ปลายทางในหน้าตั้งค่า แล้วกด “ทดสอบการเชื่อมต่อ” (ดู workers/okmd-proxy.js)",
        true
      ),
    };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // ต้องเช็คโควตาก่อนคีย์ผิด — ปลายทางใช้ 401 สื่อทั้งสองความหมาย
    if (isBadKey(res.status, body))
      return {
        ok: false,
        exhausted: false,
        error: new AiError("คีย์ AI ไม่ถูกต้องหรือหมดอายุ — ตรวจที่หน้าตั้งค่า", true),
      };
    return {
      ok: false,
      exhausted: isQuotaExhausted(res.status, body),
      error: new AiError(`AI ตอบกลับผิดพลาด (${res.status}) ${body.slice(0, 160)}`),
    };
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
    model_quota?: QuotaBlock;
  };

  const quotaLeft = data.model_quota?.daily_remaining_tokens ?? null;

  if (data.error?.message) {
    return {
      ok: false,
      exhausted: isQuotaExhausted(200, data.error.message),
      error: new AiError(`AI: ${data.error.message}`),
    };
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    return { ok: false, exhausted: false, error: new AiError("AI ตอบกลับมาว่าง ลองถามใหม่อีกครั้ง") };
  }
  return { ok: true, text, quotaLeft };
}

/**
 * ถาม AI พร้อมสลับโมเดลอัตโนมัติเมื่อโควตาหมด
 *
 * ไล่ตาม modelChain() ทีละตัว เจอ "โควตาหมด" ก็ข้ามไปตัวถัดไป (ซึ่งเป็นคนละค่าย
 * จึงมีโควตาก้อนใหม่) ส่วน error อื่น เช่น คีย์ผิด จะหยุดทันที ไม่ไล่ต่อให้เสียเวลา
 */
export async function chat(
  cfg: AiConfigDoc,
  messages: ChatMessage[],
  opts: { signal?: AbortSignal; temperature?: number; onSwitch?: (model: string) => void } = {}
): Promise<ChatResult> {
  const base = (cfg.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const apiKey = cfg.apiKey?.trim() ?? "";
  const chain = modelChain(cfg);
  const skipped: string[] = [];
  let lastError: AiError | null = null;

  for (const model of chain) {
    if (skipped.length) opts.onSwitch?.(model);
    const r = await callOnce(base, apiKey, model, messages, opts);
    if (r.ok) {
      return {
        text: r.text,
        model,
        provider: PROVIDER_OF.get(model) ?? "ไม่ทราบค่าย",
        quotaLeft: r.quotaLeft,
        skipped,
      };
    }
    lastError = r.error;
    if (!r.exhausted) throw r.error; // คีย์ผิด/CORS/เน็ตหลุด — ไล่ต่อไปก็เจอเหมือนกัน
    skipped.push(model);
  }

  throw new AiError(
    `โควตา AI หมดทุกค่ายที่ตั้งไว้แล้ววันนี้ (ลอง ${skipped.length} โมเดล) — พรุ่งนี้จะรีเซ็ตเอง` +
      (lastError ? `\nข้อผิดพลาดล่าสุด: ${lastError.message}` : "")
  );
}
