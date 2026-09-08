// scripts/test-pairing.mts — ของที่ต้องเบิกคู่กัน
// รัน: node --experimental-strip-types scripts/test-pairing.mts
import { pairRequirements, unmetRequirements, describeUnmet } from "../lib/pairing.ts";
import type { EquipmentDoc, WithId } from "../lib/types.ts";

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log("  ✓", name); pass++; }
  else { console.log("  ✗", name, "\n     got :", a, "\n     want:", b); fail++; }
}

const item = (
  id: string,
  name: string,
  type: EquipmentDoc["type"],
  pairGroups?: EquipmentDoc["pairGroups"]
): WithId<EquipmentDoc> => ({ id, name, type, status: "available", pairGroups });

const lens70 = item("l70", "70-200", "lens");
const lens35 = item("l35", "35mm", "lens");
const sd1 = item("sd1", "SD 128GB", "memory");
const nikon = item("nk", "Nikon D850", "camera", [
  { label: "เลนส์", itemIds: ["l70", "l35"], required: true },
  { label: "เมมโมรี่การ์ด", itemIds: ["sd1"], required: true },
]);
const tripod = item("tp", "ขาตั้ง", "accessory");
const all = [nikon, lens70, lens35, sd1, tripod];

console.log("— ของที่ต้องเบิกคู่กัน —");

eq("ไม่เลือกกล้อง = ไม่มีเงื่อนไข", unmetRequirements(["tp"], all).length, 0);

eq(
  "เลือกกล้องเปล่า ๆ = ขาด 2 กลุ่ม",
  unmetRequirements(["nk"], all).map((r) => r.label),
  ["เลนส์", "เมมโมรี่การ์ด"]
);

eq("เลือกเลนส์ 1 ตัวแล้ว ยังขาดเมม", unmetRequirements(["nk", "l35"], all).map((r) => r.label), ["เมมโมรี่การ์ด"]);
eq("ครบทั้งเลนส์และเมม = ผ่าน", unmetRequirements(["nk", "l70", "sd1"], all).length, 0);
eq("เลือกเลนส์ 2 ตัวก็ผ่าน (ขั้นต่ำ 1)", unmetRequirements(["nk", "l70", "l35", "sd1"], all).length, 0);

eq(
  "กลุ่มไม่บังคับไม่บล็อกการจอง",
  unmetRequirements(
    ["c2"],
    [item("c2", "Sony A7", "camera", [{ label: "ขาตั้ง", itemIds: ["tp"], required: false }]), tripod]
  ).length,
  0
);

eq(
  "ของในกลุ่มที่ถูกลบไปแล้ว ต้องไม่โผล่เป็นตัวเลือก",
  pairRequirements(["c3"], [item("c3", "กล้องเก่า", "camera", [{ label: "เลนส์", itemIds: ["หายไป"], required: true }])]).length,
  0
);

eq(
  "ข้อความเตือนบอกชื่อของและกลุ่มที่ขาด",
  describeUnmet(unmetRequirements(["nk"], all)),
  "Nikon D850 ต้องเลือกเลนส์อย่างน้อย 1 ชิ้น · Nikon D850 ต้องเลือกเมมโมรี่การ์ดอย่างน้อย 1 ชิ้น"
);

eq("ไม่ขาดอะไร = ไม่มีข้อความ", describeUnmet([]), "");

eq(
  "กล้อง 2 ตัวที่มีกฎ นับแยกกัน",
  unmetRequirements(["nk", "nk2"], [...all, item("nk2", "Canon R5", "camera", [{ label: "เมม", itemIds: ["sd1"], required: true }])]).length,
  3
);

console.log(`Pairing: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
