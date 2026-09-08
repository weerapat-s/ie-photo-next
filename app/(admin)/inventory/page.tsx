"use client";
// app/(admin)/inventory/page.tsx — หน้านี้ถูกยุบไปรวมกับ /resources แล้ว
// เก็บไว้เป็นตัวส่งต่อ เพื่อไม่ให้บุ๊กมาร์กเดิมและทางลัดบนโฮมสกรีน (PWA) พัง
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";

export default function RedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/resources?tab=equipment");
  }, [router]);
  return <Spinner label="กำลังพาไปหน้าใหม่…" />;
}
"use client";
// app/(admin)/inventory/page.tsx — จัดการคลังอุปกรณ์
import { useState } from "react";
import { collection, query, orderBy, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useCollection, useNow } from "@/lib/hooks";
import { PageHeader, Card, Badge, Spinner, Button, Modal, Field, inputClass, EmptyState } from "@/components/ui";
import Link from "next/link";
import { suggestEquipmentCode } from "@/lib/qr";
import { EQUIPMENT_STATUS, EQUIPMENT_TYPE_LABEL } from "@/lib/format";
import type { EquipmentDoc, EquipmentStatus, EquipmentType, SlotDoc } from "@/lib/types";

export default function InventoryPage() {
  const { data: items, loading } = useCollection<EquipmentDoc>(
    () => query(collection(db, "equipments"), orderBy("type")),
    []
  );
  const { data: slots } = useCollection<SlotDoc>(
    () => query(collection(db, "slots")),
    []
  );
  const now = useNow();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<EquipmentType>("camera");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const finalCode = (code.trim() || suggestEquipmentCode(type, items.map((i) => i.code || ""))).toUpperCase();
      if (items.some((i) => (i.code || "").toUpperCase() === finalCode)) {
        setErr(`รหัส ${finalCode} ถูกใช้กับอุปกรณ์ชิ้นอื่นแล้ว กรุณาเปลี่ยนรหัส`);
        return;
      }
      await addDoc(collection(db, "equipments"), {
        name: name.trim(),
        type,
        code: finalCode,
        status: "available",
        createdAt: serverTimestamp(),
      });
      setName("");
      setCode("");
      setType("camera");
      setAdding(false);
    } catch {
      setErr("เพิ่มอุปกรณ์ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(id: string, status: EquipmentStatus) {
    try {
      await updateDoc(doc(db, "equipments", id), { status });
    } catch {
      alert("เปลี่ยนสถานะไม่สำเร็จ");
    }
  }

  async function remove(eq: EquipmentDoc & { id: string }) {
    const now = Date.now();
    const activeSlots = slots.filter((s) => s.itemId === eq.id && s.endAt.toMillis() > now);
    if (activeSlots.length) {
      if (!confirm(`⚠️ "${eq.name}" มีการจองค้างอยู่ ${activeSlots.length} รายการ\nลบแล้วรายการเหล่านั้นจะกำพร้า ยืนยันลบ?`)) {
        return;
      }
    } else {
      if (!confirm(`ลบอุปกรณ์ "${eq.name}"?`)) return;
    }

    try {
      await deleteDoc(doc(db, "equipments", eq.id));
    } catch {
      alert("ลบอุปกรณ์ไม่สำเร็จ");
    }
  }

  return (
    <div>
      <PageHeader
        title="คลังอุปกรณ์"
        subtitle={`ทั้งหมด ${items.length} ชิ้น`}
        action={
          <div className="flex gap-2">
            <Link
              href="/labels"
              className="inline-flex min-h-10 items-center rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent"
            >
              🖨️ พิมพ์ QR
            </Link>
            <Button onClick={() => setAdding(true)}>+ เพิ่มอุปกรณ์</Button>
          </div>
        }
      />

      {err && (
        <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">
          ⚠️ {err}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon="📦" text="ยังไม่มีอุปกรณ์ในคลัง" />
      ) : (
        <div className="space-y-2">
          {items.map((eq) => {
            const st = EQUIPMENT_STATUS[eq.status] ?? EQUIPMENT_STATUS.available;
            const isCurrentlyBorrowed = slots.some(
              (s) =>
                now !== null &&
                s.itemId === eq.id &&
                s.status === "approved" &&
                s.startAt.toMillis() <= now &&
                s.endAt.toMillis() > now
            );

            return (
              <Card key={eq.id} className="flex flex-wrap items-center gap-3 p-3">
                <span className="text-sm text-slate-400">{EQUIPMENT_TYPE_LABEL[eq.type]}</span>
                <span className="font-medium text-foreground">{eq.name}</span>
                {eq.code ? (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{eq.code}</span>
                ) : (
                  <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">ยังไม่มีรหัส QR</span>
                )}
                <Badge className={st.cls}>● {st.label}</Badge>
                {isCurrentlyBorrowed && (
                  <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    📷 ถูกยืมอยู่ในขณะนี้
                  </Badge>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <select
                    value={eq.status}
                    onChange={(e) => changeStatus(eq.id, e.target.value as EquipmentStatus)}
                    className="rounded-xl border border-slate-700/80 bg-slate-800/80 text-slate-200 px-2.5 py-1.5 pr-7 text-sm outline-none focus:border-orange-500"
                  >
                    <option value="available" className="bg-slate-900 text-slate-200">พร้อมใช้งาน</option>
                    <option value="maintenance" className="bg-slate-900 text-slate-200">ซ่อมบำรุง</option>
                  </select>
                  <Button variant="ghost" onClick={() => remove(eq)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                    🗑️
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="เพิ่มอุปกรณ์ใหม่">
        <Field label="ชื่ออุปกรณ์" required>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="เช่น Sony A7 IV" />
        </Field>
        <Field label="รหัสอุปกรณ์ (ใช้ทำ QR)">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={inputClass}
            placeholder={suggestEquipmentCode(type, items.map((i) => i.code || ""))}
          />
        </Field>
        <Field label="ประเภท" required>
          <select value={type} onChange={(e) => setType(e.target.value as EquipmentType)} className={`${inputClass} bg-slate-900`}>
            <option value="camera" className="bg-slate-900 text-slate-200">📷 กล้อง</option>
            <option value="lens" className="bg-slate-900 text-slate-200">🔍 เลนส์</option>
            <option value="accessory" className="bg-slate-900 text-slate-200">📦 อุปกรณ์เสริม</option>
            <option value="memory" className="bg-slate-900 text-slate-200">🗂️ การ์ดความจำ</option>
            <option value="key" className="bg-slate-900 text-slate-200">🔑 กุญแจ</option>
          </select>
        </Field>
        <Button onClick={add} disabled={busy || !name.trim()} className="mt-2 w-full">
          {busy ? "กำลังเพิ่ม…" : "เพิ่มอุปกรณ์"}
        </Button>
      </Modal>
    </div>
  );
}
