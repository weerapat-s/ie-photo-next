// lib/pairing.ts — ของที่ต้องเบิกคู่กัน
//
// ปัญหาจริงของชุมนุม: คนยืมกล้องแล้วลืมเมม หรือได้กล้องมาแต่ไม่มีเลนส์ที่ใส่ได้
// รู้ตัวอีกทีตอนถึงหน้างาน — งานเสีย ทั้งที่ของอยู่ในตู้
//
// วิธีแก้: ผูก "กลุ่มของที่ต้องมาด้วย" ไว้กับตัวหลัก (ปกติคือกล้อง)
// เช่น Nikon D850 → กลุ่ม "เลนส์" [70-200, 35mm] · กลุ่ม "เมมโมรี่การ์ด" [SD-01, SD-02]
// กติกาคือ **เลือกอย่างน้อย 1 ชิ้นต่อกลุ่ม** ไม่ใช่ต้องเอาทั้งกลุ่ม
// เพราะเลนส์ 2 ตัวในลิสต์คือ "ตัวเลือก" ไม่ใช่ "ชุด"
import type { EquipmentDoc, WithId } from "./types";

export interface PairRequirement {
  /** ของชิ้นที่ตั้งกฎนี้ไว้ (กล้อง) */
  ownerId: string;
  ownerName: string;
  label: string;
  required: boolean;
  /** ตัวเลือกในกลุ่มที่ยังใช้งานได้จริง (ถูกลบ/ซ่อมอยู่ ตัดออกแล้ว) */
  options: WithId<EquipmentDoc>[];
  /** ชิ้นในกลุ่มที่ถูกเลือกไปแล้ว */
  chosen: WithId<EquipmentDoc>[];
}

/**
 * ไล่กฎของทุกชิ้นที่เลือกไว้ แล้วบอกว่ากลุ่มไหนครบ/ไม่ครบ
 * @param selectedIds ของที่ผู้ใช้เลือกอยู่
 * @param all         อุปกรณ์ทั้งหมดที่ยังเลือกได้ (ปกติกรองสถานะ available มาแล้ว)
 */
export function pairRequirements(
  selectedIds: string[],
  all: WithId<EquipmentDoc>[]
): PairRequirement[] {
  const byId = new Map(all.map((e) => [e.id, e]));
  const picked = new Set(selectedIds);
  const out: PairRequirement[] = [];

  for (const id of selectedIds) {
    const owner = byId.get(id);
    if (!owner?.pairGroups?.length) continue;
    for (const g of owner.pairGroups) {
      // ของที่ถูกลบหรือไม่ว่างแล้วต้องไม่โผล่มาเป็นตัวเลือก ไม่งั้นกดแล้วงง
      const options = (g.itemIds ?? []).map((x) => byId.get(x)).filter((x): x is WithId<EquipmentDoc> => !!x);
      if (options.length === 0) continue;
      out.push({
        ownerId: owner.id,
        ownerName: owner.name,
        label: g.label || "ของที่ต้องมาด้วย",
        required: g.required !== false,
        options,
        chosen: options.filter((x) => picked.has(x.id)),
      });
    }
  }
  return out;
}

/** กลุ่มบังคับที่ยังไม่ได้เลือกอะไรเลย — มีอยู่ = จองไม่ได้ */
export function unmetRequirements(
  selectedIds: string[],
  all: WithId<EquipmentDoc>[]
): PairRequirement[] {
  return pairRequirements(selectedIds, all).filter((r) => r.required && r.chosen.length === 0);
}

/** ข้อความสั้น ๆ บอกว่าขาดอะไร ใช้ขึ้นเตือนตอนกดส่ง */
export function describeUnmet(unmet: PairRequirement[]): string {
  if (unmet.length === 0) return "";
  const parts = unmet.map((r) => `${r.ownerName} ต้องเลือก${r.label}อย่างน้อย 1 ชิ้น`);
  return parts.join(" · ");
}
