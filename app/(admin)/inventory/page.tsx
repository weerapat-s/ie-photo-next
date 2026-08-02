"use client";
// app/(admin)/inventory/page.tsx — จัดการคลังอุปกรณ์
import { useState } from "react";
import { collection, query, orderBy, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useCollection } from "@/lib/hooks";
import { PageHeader, Card, Badge, Spinner, Button, Modal, Field, inputClass, EmptyState } from "@/components/ui";
import { EQUIPMENT_STATUS, EQUIPMENT_TYPE_LABEL } from "@/lib/format";
import type { EquipmentDoc, EquipmentStatus, EquipmentType } from "@/lib/types";

export default function InventoryPage() {
  const { data: items, loading } = useCollection<EquipmentDoc>(
    () => query(collection(db, "equipments"), orderBy("type")),
    []
  );
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<EquipmentType>("camera");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    await addDoc(collection(db, "equipments"), {
      name: name.trim(),
      type,
      status: "available",
      createdAt: serverTimestamp(),
    });
    setName("");
    setType("camera");
    setBusy(false);
    setAdding(false);
  }

  async function changeStatus(id: string, status: EquipmentStatus) {
    await updateDoc(doc(db, "equipments", id), { status });
  }

  async function remove(id: string) {
    if (confirm("ลบอุปกรณ์นี้?")) await deleteDoc(doc(db, "equipments", id));
  }

  return (
    <div>
      <PageHeader
        title="คลังอุปกรณ์"
        subtitle={`ทั้งหมด ${items.length} ชิ้น`}
        action={<Button onClick={() => setAdding(true)}>+ เพิ่มอุปกรณ์</Button>}
      />

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon="📦" text="ยังไม่มีอุปกรณ์ในคลัง" />
      ) : (
        <div className="space-y-2">
          {items.map((eq) => (
            <Card key={eq.id} className="flex flex-wrap items-center gap-3 p-3">
              <span className="text-sm text-slate-400">{EQUIPMENT_TYPE_LABEL[eq.type]}</span>
              <span className="font-medium text-slate-100">{eq.name}</span>
              <Badge className={EQUIPMENT_STATUS[eq.status].cls}>● {EQUIPMENT_STATUS[eq.status].label}</Badge>
              <div className="ml-auto flex items-center gap-2">
                <select
                  value={eq.status}
                  onChange={(e) => changeStatus(eq.id, e.target.value as EquipmentStatus)}
                  className="rounded-xl border border-slate-700/80 bg-slate-800/80 text-slate-200 px-2.5 py-1.5 pr-7 text-sm outline-none focus:border-orange-500"
                >
                  <option value="available" className="bg-slate-900 text-slate-200">พร้อมใช้งาน</option>
                  <option value="borrowed" className="bg-slate-900 text-slate-200">กำลังถูกยืม</option>
                  <option value="maintenance" className="bg-slate-900 text-slate-200">ซ่อมบำรุง</option>
                </select>
                <Button variant="ghost" onClick={() => remove(eq.id)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                  🗑️
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="เพิ่มอุปกรณ์ใหม่">
        <Field label="ชื่ออุปกรณ์" required>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="เช่น Sony A7 IV" />
        </Field>
        <Field label="ประเภท" required>
          <select value={type} onChange={(e) => setType(e.target.value as EquipmentType)} className={`${inputClass} bg-slate-900`}>
            <option value="camera" className="bg-slate-900 text-slate-200">📷 กล้อง</option>
            <option value="lens" className="bg-slate-900 text-slate-200">🔍 เลนส์</option>
            <option value="accessory" className="bg-slate-900 text-slate-200">📦 อุปกรณ์เสริม</option>
          </select>
        </Field>
        <Button onClick={add} disabled={busy || !name.trim()} className="mt-2 w-full">
          {busy ? "กำลังเพิ่ม…" : "เพิ่มอุปกรณ์"}
        </Button>
      </Modal>
    </div>
  );
}
