// scripts/test-ai-parse.mts — parseAiReply ต้องไม่โชว์ JSON ดิบให้ผู้ใช้
import { parseAiReply } from "../lib/ai/plan.ts";

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = "") =>
  ok ? (console.log("  \u2713", n), pass++) : (console.log("  \u2717", n, d), fail++);

console.log("\u2014 \u0e41\u0e01\u0e30\u0e04\u0e33\u0e15\u0e2d\u0e1a AI \u2014");

const ok = parseAiReply('{"reply":"\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35","questions":[],"plan":null}');
check("JSON \u0e1b\u0e01\u0e15\u0e34", ok.reply === "\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35");

const fenced = parseAiReply('```json\n{"reply":"\u0e17\u0e14\u0e2a\u0e2d\u0e1a","questions":[]}\n```');
check("fence json \u0e15\u0e31\u0e14\u0e2d\u0e2d\u0e01", fenced.reply === "\u0e17\u0e14\u0e2a\u0e2d\u0e1a", fenced.reply);

const cut = '```json\n{\n  "reply": "\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e07\u0e32\u0e19",\n  "questions": [\n    "\u0e21\u0e35\u0e07\u0e32\u0e19\u0e2d\u0e30\u0e44\u0e23?",\n    "\u0e41\u0e15\u0e48\u0e25\u0e30';
const salvaged = parseAiReply(cut);
check("JSON \u0e15\u0e31\u0e14 \u0e01\u0e39\u0e49 reply \u0e44\u0e14\u0e49", salvaged.reply === "\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e07\u0e32\u0e19", salvaged.reply);
check("\u0e44\u0e21\u0e48\u0e21\u0e35 fence \u0e2b\u0e25\u0e38\u0e14", !salvaged.reply.includes("`" + "`" + "`") && !salvaged.reply.includes('"reply"'), salvaged.reply);
check("\u0e01\u0e39\u0e49 questions \u0e17\u0e35\u0e48\u0e04\u0e23\u0e1a", salvaged.questions.includes("\u0e21\u0e35\u0e07\u0e32\u0e19\u0e2d\u0e30\u0e44\u0e23?"), JSON.stringify(salvaged.questions));

const plain = parseAiReply("\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e07\u0e32\u0e19\u0e25\u0e49\u0e19");
check("\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e25\u0e49\u0e27\u0e19", plain.reply === "\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e07\u0e32\u0e19\u0e25\u0e49\u0e19");

const esc = parseAiReply('{"reply":"a\\nb"}');
check("\u0e16\u0e2d\u0e14 backslash-n", esc.reply === "a\nb", JSON.stringify(esc.reply));

console.log("AI parse: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
