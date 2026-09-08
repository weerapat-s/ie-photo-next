"use client";
// app/(admin)/labels/page.tsx — พิมพ์สติกเกอร์ QR ติดอุปกรณ์
// เลือกชิ้นที่จะพิมพ์ได้ แล้วกดพิมพ์ผ่าน print dialog ของเบราว์เซอร์ (ไม่ต้องลงโปรแกรมอะไร)
import { useMemo, useState } from "react";
import { collection, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useCollection } from "@/lib/hooks";
import { PageHeader, Card, Spinner, Button, EmptyState } from "@/components/ui";
import QrImage from "@/components/qr-image";
import { equipmentQrPayload } from "@/lib/qr";
import { EQUIPMENT_TYPE_LABEL } from "@/lib/format";
import type { EquipmentDoc } from "@/lib/types";

export default function LabelsPage() {
  const { data: items, loading } = useCollection<EquipmentDoc>(
    () => query(collection(db, "equipments"), orderBy("type")),
    []
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const withCode = useMemo(() => items.filter((i) => (i.code || "").trim()), [items]);
  const missingCode = useMemo(() => items.filter((i) => !(i.code || "").trim()), [items]);

  // ยังไม่เลือกอะไร = พิมพ์ทั้งหมดที่มีรหัส
  const toPrint = selected.size ? withCode.filter((i) => selected.has(i.id)) : withCode;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      {/* ตอนพิมพ์ ซ่อนทุกอย่างยกเว้นแผ่นสติกเกอร์ */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-sheet, #print-sheet * { visibility: visible !important; }
          #print-sheet { position: absolute; inset: 0; padding: 8mm; }
          @page { margin: 8mm; }
        }
      `}</style>

      <div className="print:hidden">
        <PageHeader
          title="พิมพ์ QR อุปกรณ์"
          subtitle="ตัดแปะติดบนตัวอุปกรณ์ — สมาชิกยิง QR ตอนยืมได้เลย"
          action={
            <Button onClick={() => window.print()} disabled={!toPrint.length}>
              🖨️ พิมพ์ {toPrint.length} ดวง
            </Button>
          }
        />

        {loading ? (
          <Spinner />
        ) : (
          <>
            {missingCode.length > 0 && (
              <Card className="mb-4">
                <p className="text-sm font-medium text-foreground">
                  ⚠️ มีอุปกรณ์ {missingCode.length} ชิ้นที่ยังไม่มีรหัส — พิมพ์ QR ไม่ได้
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  ไปตั้งรหัสให้ก่อนที่หน้าคลังอุปกรณ์: {missingCode.map((i) => i.name).join(", ")}
                </p>
              </Card>
            )}

            {withCode.length === 0 ? (
              <EmptyState icon="inventory" text="ยังไม่มีอุปกรณ์ที่ตั้งรหัสไว้" />
            ) : (
              <Card className="mb-4">
                <p className="mb-3 text-sm text-muted-foreground">
                  ติ๊กเลือกเฉพาะชิ้นที่ต้องการพิมพ์ — ถ้าไม่เลือกเลยจะพิมพ์ทั้งหมด ({withCode.length} ชิ้น)
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {withCode.map((eq) => (
                    <label
                      key={eq.id}
                      className="flex cursor-pointer items-center gap-2 rounded-xl border border-border p-3 text-sm transition hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(eq.id)}
                        onChange={() => toggle(eq.id)}
                        className="accent-primary"
                      />
                      <span className="font-mono text-xs text-muted-foreground">{eq.code}</span>
                      <span className="truncate">{eq.name}</span>
                    </label>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      {/* แผ่นสติกเกอร์ที่จะถูกพิมพ์ */}
      <div id="print-sheet" className="grid grid-cols-3 gap-3 print:grid-cols-4">
        {toPrint.map((eq) => (
          <div
            key={eq.id}
            className="flex break-inside-avoid flex-col items-center gap-1 rounded-xl border border-black/20 bg-white p-2 text-center"
          >
            <QrImage value={equipmentQrPayload(eq.code || "")} size={96} alt={`QR ${eq.code}`} />
            <p className="w-full truncate text-[11px] font-semibold leading-tight text-black">{eq.name}</p>
            <p className="font-mono text-[10px] leading-none text-black/70">{eq.code}</p>
            <p className="text-[9px] leading-none text-black/50">{EQUIPMENT_TYPE_LABEL[eq.type] || eq.type}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
