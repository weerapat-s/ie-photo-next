// scripts/test-model-chain.mts — ลำดับสลับโมเดลต้องถูกต้อง
// (ตัวเรียก API จริงทดสอบไม่ได้โดยไม่เผาโควตา 15,000 token จึงทดสอบส่วนที่เป็นตรรกะล้วน)
import { modelChain, DEFAULT_CHAIN, PROVIDER_OF, isQuotaExhausted, isBadKey } from "../lib/ai/models.ts";

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = "") =>
  ok ? (console.log("  ✓", n), pass++) : (console.log("  ✗", n, d), fail++);

console.log("— ลำดับสลับโมเดล —");

const base = { baseUrl: "", apiKey: "k", enabled: true } as never;

check("ไม่ตั้งอะไรเลย = ใช้ลำดับมาตรฐาน",
  JSON.stringify(modelChain({ ...(base as object), model: "" } as never)) === JSON.stringify(DEFAULT_CHAIN));

const withPrimary = modelChain({ ...(base as object), model: "gpt-5.4-mini" } as never);
check("โมเดลหลักมาก่อนเสมอ", withPrimary[0] === "gpt-5.4-mini");
check("โมเดลหลักไม่โผล่ซ้ำในลำดับสำรอง",
  withPrimary.filter((m) => m === "gpt-5.4-mini").length === 1, withPrimary.join(","));

const custom = modelChain({ ...(base as object), model: "", models: ["a", "b", "a"] } as never);
check("ลำดับที่ตั้งเองทับค่ามาตรฐาน และตัดตัวซ้ำ",
  JSON.stringify(custom) === JSON.stringify(["a", "b"]), custom.join(","));

// จุดสำคัญ: โควตาแยกตามค่าย สลับในค่ายเดิมจึงไม่ได้โควตาใหม่
const providers = DEFAULT_CHAIN.map((m) => PROVIDER_OF.get(m));
check("ลำดับมาตรฐานไม่ซ้ำค่ายเลย", new Set(providers).size === providers.length, providers.join(","));
check("ทุกโมเดลในลำดับมาตรฐานเป็นชื่อที่ปลายทางรู้จัก",
  providers.every(Boolean), providers.join(","));

// ── จับสัญญาณโควตาหมด ──
// ของจริงจาก OKMD: 401 + {"error":"This model reached daily limit."}
const REAL = '{"error":"This model reached daily limit."}';
check("401 + 'daily limit' = โควตาหมด (ต้องสลับค่าย ไม่ใช่หยุด)", isQuotaExhausted(401, REAL));
check("401 + 'daily limit' ไม่ใช่คีย์ผิด", !isBadKey(401, REAL));
check("429 = โควตาหมดเสมอ", isQuotaExhausted(429, ""));
check("401 ธรรมดา = คีย์ผิดจริง", isBadKey(401, '{"error":"invalid api key"}'));
check("401 ธรรมดาไม่ใช่โควตาหมด", !isQuotaExhausted(401, '{"error":"invalid api key"}'));

console.log(`Model chain: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
