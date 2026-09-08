"use client";
// components/panels/equipment-panel.tsx — จัดการคลังอุปกรณ์
// (เดิมเป็นหน้า /inventory — ย้ายมาเป็นแท็บใน /resources)
import { useMemo, useState } from "react";
import { collection, query, orderBy, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { describeWriteError } from "@/lib/errors";
import { useCollection, useNow } from "@/lib/hooks";
import {
  Card,
  Badge,
  Spinner,
  Button,
  Modal,
  Field,
  inputClass,
  EmptyState,
  Alert,
  ChipBar,
  useToast,
  SearchInput,
  ImagePicker,
} from "@/components/ui";
import { EQUIPMENT_STATUS, EQUIPMENT_TYPE_LABEL } from "@/lib/format";
import Icon from "@/components/icon";
import AssignPicker from "@/components/assign-picker";
import EquipmentThumb from "@/components/equipment-thumb";
import { compressImageToDataUrl } from "@/lib/image";
import { displayName } from "@/lib/roles";
import type { EquipmentDoc, EquipmentStatus, EquipmentType, PairGroup, SlotDoc, UserDoc, WithId } from "@/lib/types";

type Filter = EquipmentType | "all";

export default function EquipmentPanel() {
  const { data: items, loading } = useCollection<EquipmentDoc>(
    () => query(collection(db, "equipments"), orderBy("type")),
    []
  );
  const { data: slots } = useCollection<SlotDoc>(() => query(collection(db, "slots")), []);
  const { data: users } = useCollection<UserDoc>(() => query(collection(db, "users"), orderBy("studentId")), []);
  const { show, node: toastNode } = useToast();
  const now = useNow(60_000);

  const [adding, setAdding] = useState(false);
  /** ของชิ้นที่กำลังเลือกผู้รับผิดชอบ */
  const [assigning, setAssigning] = useState<WithId<EquipmentDoc> | null>(null);
  const [editing, setEditing] = useState<WithId<EquipmentDoc> | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");

  const shown = useMemo(() => {
    const byType = filter === "all" ? items : items.filter((i) => i.type === filter);
    const q = search.trim().toLowerCase();
    return q ? byType.filter((i) => i.name.toLowerCase().includes(q)) : byType;
  }, [items, filter, search]);

  async function changeStatus(id: string, status: EquipmentStatus) {
    try {
      await updateDoc(doc(db, "equipments", id), { status });
    } catch (e) {
      setErr(describeWriteError(e, "เปลี่ยนสถานะ"));
    }
  }

  /**
   * กรรมการสั่งให้ใครดูแลของชิ้นนี้
   * ของ 1 ชิ้นมีผู้ดูแลได้คนเดียว (ไม่งั้นเวลาของหายจะไม่รู้ว่าถามใคร)
   * — ถ้าเลือกมาหลายคน เอาคนแรก · เลือกศูนย์คน = ยกเลิกมอบหมาย
   */
  async function assign(eq: WithId<EquipmentDoc>, uids: string[]) {
    const uid = uids[0] ?? null;
    const name = uid ? (users.find((u) => u.id === uid) ? displayName(users.find((u) => u.id === uid)!) : null) : null;
    try {
      await updateDoc(doc(db, "equipments", eq.id), {
        responsibleUserId: uid,
        responsibleUserName: name,
        assignedAt: uid ? serverTimestamp() : null,
      });
      show(uid ? `มอบหมาย "${eq.name}" ให้ ${name}` : `ยกเลิกผู้ดูแล "${eq.name}"`);
    } catch (e) {
      setErr(describeWriteError(e, "มอบหมาย"));
    }
  }

  async function remove(eq: WithId<EquipmentDoc>) {
    const activeSlots = slots.filter((s) => s.itemId === eq.id && s.endAt.toMillis() > Date.now());
    const msg = activeSlots.length
      ? `⚠️ "${eq.name}" มีการจองค้างอยู่ ${activeSlots.length} รายการ\nลบแล้วรายการเหล่านั้นจะกำพร้า ยืนยันลบ?`
      : `ลบอุปกรณ์ "${eq.name}"?`;
    if (!confirm(msg)) return;

    try {
      await deleteDoc(doc(db, "equipments", eq.id));
      show("ลบอุปกรณ์แล้ว");
    } catch (e) {
      setErr(describeWriteError(e, "ลบอุปกรณ์"));
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="t-body text-[var(--muted-ink)]">
          ทั้งหมด <b className="t-num text-[var(--ink)]">{items.length}</b> ชิ้น · พร้อมใช้{" "}
          <b className="t-num text-[var(--ink)]">{items.filter((i) => i.status === "available").length}</b>
        </p>
        <Button onClick={() => setAdding(true)} icon="add">
          เพิ่มอุปกรณ์
        </Button>
      </div>

      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      <SearchInput value={search} onChange={setSearch} placeholder="ค้นหาอุปกรณ์" className="mb-3" />

      <ChipBar
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={[
          { key: "all", label: "ทั้งหมด", count: items.length },
          { key: "camera", label: "กล้อง", icon: "equipment", count: items.filter((i) => i.type === "camera").length },
          { key: "lens", label: "เลนส์", icon: "search", count: items.filter((i) => i.type === "lens").length },
          { key: "memory", label: "เมม", icon: "inventory", count: items.filter((i) => i.type === "memory").length },
          { key: "accessory", label: "อื่น ๆ", icon: "inventory", count: items.filter((i) => i.type === "accessory").length },
        ]}
      />

      {loading ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState icon="inventory" text="ไม่พบอุปกรณ์ในหมวดนี้" action={<Button onClick={() => setAdding(true)}>เพิ่มอุปกรณ์</Button>} />
      ) : (
        <div className="stagger space-y-2">
          {shown.map((eq, i) => {
            const st = EQUIPMENT_STATUS[eq.status] ?? EQUIPMENT_STATUS.available;
            const isCurrentlyBorrowed = slots.some(
              (s) =>
                s.itemId === eq.id &&
                s.status === "approved" &&
                s.startAt.toMillis() <= now &&
                s.endAt.toMillis() > now
            );

            return (
              <Card key={eq.id} className="p-4" style={{ ["--i" as string]: Math.min(i, 12) }}>
                <div className="flex items-start gap-3">
                  <EquipmentThumb type={eq.type} imageUrl={eq.imageUrl} name={eq.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-[var(--muted-ink)]">{EQUIPMENT_TYPE_LABEL[eq.type]}</span>
                      <span className="font-bold text-[var(--ink)]">{eq.name}</span>
                      {/* ป้ายเดียวพอ — เดิมขึ้น "พร้อมใช้งาน" คู่กับ "ถูกยืมอยู่ตอนนี้"
                          ซึ่งขัดกันเอง คนอ่านไม่รู้ว่าหยิบไปใช้ได้หรือไม่ได้ */}
                      {isCurrentlyBorrowed && eq.status === "available" ? (
                        <Badge className="tone-warn" icon="user">ถูกยืมอยู่ตอนนี้</Badge>
                      ) : (
                        <Badge className={st.cls}>{st.label}</Badge>
                      )}
                    </div>
                    {eq.note && <p className="t-body mt-1 text-[var(--muted-ink)]">{eq.note}</p>}
                  </div>
                </div>

                {/* ผู้รับผิดชอบ — โชว์เสมอ ถึงยังไม่มอบหมายก็บอกว่ายังว่าง
                    เพื่อให้กรรมการกวาดตาเห็นว่าของชิ้นไหนยังไม่มีคนดูแล */}
                <p className="t-caption mt-1.5 flex items-center gap-1.5">
                  <Icon name="user" size={16} />
                  {eq.responsibleUserName ? (
                    <>ผู้รับผิดชอบ: <b className="text-[var(--ink)]">{eq.responsibleUserName}</b></>
                  ) : (
                    <span className="text-[var(--tone-warn-ink)]">ยังไม่มีผู้รับผิดชอบ</span>
                  )}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/6 pt-3">
                  <select
                    value={eq.status}
                    onChange={(e) => changeStatus(eq.id, e.target.value as EquipmentStatus)}
                    className="glass-input min-h-[40px] rounded-xl px-3 py-1.5 !text-sm"
                    aria-label={`สถานะของ ${eq.name}`}
                  >
                    <option value="available">พร้อมใช้งาน</option>
                    <option value="maintenance">ซ่อมบำรุง</option>
                  </select>
                  <Button size="sm" variant="outline" icon="user" onClick={() => setAssigning(eq)}>
                    {eq.responsibleUserId ? "เปลี่ยนผู้รับผิดชอบ" : "มอบหมาย"}
                  </Button>
                  <Button size="sm" variant="outline" icon="edit" onClick={() => setEditing(eq)}>
                    แก้ไข
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="remove"
                    onClick={() => remove(eq)}
                    className="ml-auto text-[var(--tone-bad-ink)]"
                  >
                    ลบ
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {(adding || editing) && (
        <EquipmentModal
          item={editing}
          all={items}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => show("บันทึกแล้ว")}
        />
      )}

      <AssignPicker
        open={!!assigning}
        onClose={() => setAssigning(null)}
        users={users}
        title={assigning ? `ใครดูแล "${assigning.name}"` : "มอบหมายให้"}
        selected={assigning?.responsibleUserId ? [assigning.responsibleUserId] : []}
        onSave={(uids) => assigning && assign(assigning, uids)}
      />

      {toastNode}
    </div>
  );
}

function EquipmentModal({
  item,
  all,
  onClose,
  onSaved,
}: {
  item: WithId<EquipmentDoc> | null;
  /** อุปกรณ์ทั้งหมด — ใช้เลือกของที่ต้องเบิกคู่กัน */
  all: WithId<EquipmentDoc>[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [type, setType] = useState<EquipmentType>(item?.type ?? "camera");
  const [status, setStatus] = useState<EquipmentStatus>(item?.status ?? "available");
  const [note, setNote] = useState(item?.note ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(item?.imageUrl ?? null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(item?.imageUrl ?? null);
  const [groups, setGroups] = useState<PairGroup[]>(item?.pairGroups ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // ผูกกับตัวเองไม่ได้ และกลุ่มที่ไม่มีของเลยไม่ต้องเก็บ
  const others = all.filter((e) => e.id !== item?.id);
  const cleanGroups = () =>
    groups
      .map((g) => ({
        label: g.label.trim() || "ของที่ต้องมาด้วย",
        itemIds: g.itemIds.filter((x) => others.some((e) => e.id === x)),
        required: g.required,
      }))
      .filter((g) => g.itemIds.length > 0);

  async function save() {
    if (!name.trim()) return setErr("กรุณากรอกชื่ออุปกรณ์");
    setBusy(true);
    setErr("");
    try {
      // ย่อรูปเป็น data URL เก็บใน Firestore ตรง (ไม่ใช้ Storage) — อัปใหม่ค่อยแทนของเดิม
      let finalImage = imageUrl;
      if (imageFile) finalImage = await compressImageToDataUrl(imageFile, 900, 0.72);

      if (item) {
        await updateDoc(doc(db, "equipments", item.id), {
          name: name.trim(),
          type,
          status,
          note: note.trim() || null,
          imageUrl: finalImage,
          pairGroups: cleanGroups(),
        });
      } else {
        await addDoc(collection(db, "equipments"), {
          name: name.trim(),
          type,
          status: "available",
          note: note.trim() || null,
          imageUrl: finalImage,
          pairGroups: cleanGroups(),
          createdAt: serverTimestamp(),
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(describeWriteError(e, "บันทึก"));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={item ? `แก้ไข ${item.name}` : "เพิ่มอุปกรณ์ใหม่"}>
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}
      <Field label="ชื่ออุปกรณ์" required>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="เช่น Sony A7 IV" maxLength={120} />
      </Field>
      <Field label="ประเภท" required>
        <select value={type} onChange={(e) => setType(e.target.value as EquipmentType)} className={inputClass}>
          <option value="camera">กล้อง</option>
          <option value="lens">เลนส์</option>
          <option value="memory">เมมโมรี่การ์ด</option>
          <option value="accessory">อุปกรณ์เสริม</option>
        </select>
      </Field>
      {item && (
        <Field label="สถานะ">
          <select value={status} onChange={(e) => setStatus(e.target.value as EquipmentStatus)} className={inputClass}>
            <option value="available">พร้อมใช้งาน</option>
            <option value="maintenance">ซ่อมบำรุง</option>
          </select>
        </Field>
      )}
      <Field label="รูปอุปกรณ์" help="ไม่ใส่ก็ได้ — ระบบจะใช้รูปแทนตามประเภทให้อัตโนมัติ">
        <div className="flex items-center gap-3">
          <EquipmentThumb type={type} imageUrl={preview} name={name} size="lg" />
          <div className="min-w-0 flex-1">
            <ImagePicker
              file={imageFile}
              preview={preview}
              onPick={(f) => {
                setImageFile(f);
                setPreview(f ? URL.createObjectURL(f) : imageUrl);
              }}
              hint="ถ่ายหรือเลือกรูปอุปกรณ์"
            />
            {preview && (
              <button
                type="button"
                onClick={() => {
                  setImageFile(null);
                  setImageUrl(null);
                  setPreview(null);
                }}
                className="press t-caption mt-1.5 font-semibold text-[var(--tone-bad-ink)]"
              >
                เอารูปออก (ใช้รูปแทนตามประเภท)
              </button>
            )}
          </div>
        </div>
      </Field>
      <Field label="หมายเหตุ" help="เช่น หมายเลขเครื่อง อุปกรณ์ที่มากับชุด">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputClass} maxLength={300} />
      </Field>
      {/* ── ของที่ต้องเบิกคู่กัน ─────────────────────────────────
          เดิมคนยืมกล้องแล้วลืมเมม รู้ตัวตอนถึงหน้างาน — ตั้งกฎไว้ตรงนี้
          ระบบจะไม่ให้กดจองจนกว่าจะเลือกของในกลุ่มครบ */}
      <Field
        label="ของที่ต้องเบิกคู่กัน"
        help="เช่น กล้องตัวนี้ต้องมีเลนส์ 1 ตัว และเมม 1 ใบเสมอ — เลือกอย่างน้อย 1 ชิ้นต่อกลุ่ม"
      >
        <div className="space-y-3">
          {groups.map((g, gi) => (
            <div key={gi} className="surface-sunken rounded-2xl p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  value={g.label}
                  onChange={(e) =>
                    setGroups((prev) => prev.map((x, i) => (i === gi ? { ...x, label: e.target.value } : x)))
                  }
                  className={`${inputClass} !mb-0 flex-1`}
                  placeholder="ชื่อกลุ่ม เช่น เลนส์"
                  maxLength={40}
                />
                <button
                  type="button"
                  onClick={() => setGroups((prev) => prev.filter((_, i) => i !== gi))}
                  aria-label={`ลบกลุ่ม ${g.label}`}
                  className="tap grid shrink-0 place-items-center rounded-xl text-[var(--muted-ink)] hover:bg-black/5"
                >
                  <Icon name="remove" size={16} />
                </button>
              </div>

              <label className="mb-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={g.required}
                  onChange={(e) =>
                    setGroups((prev) =>
                      prev.map((x, i) => (i === gi ? { ...x, required: e.target.checked } : x))
                    )
                  }
                  className="h-[18px] w-[18px] accent-[var(--faculty)]"
                />
                <span className="text-[var(--ink)]">บังคับเลือก (ไม่เลือกแล้วจองไม่ได้)</span>
              </label>

              <div className="flex flex-wrap gap-1.5">
                {others.length === 0 ? (
                  <p className="t-caption">ยังไม่มีอุปกรณ์อื่นในระบบให้ผูก</p>
                ) : (
                  others.map((e) => {
                    const on = g.itemIds.includes(e.id);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() =>
                          setGroups((prev) =>
                            prev.map((x, i) =>
                              i === gi
                                ? {
                                    ...x,
                                    itemIds: on
                                      ? x.itemIds.filter((y) => y !== e.id)
                                      : [...x.itemIds, e.id],
                                  }
                                : x
                            )
                          )
                        }
                        className={`press rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                          on
                            ? "bg-[var(--faculty)] text-white"
                            : "bg-white text-[var(--ink)]/75 ring-1 ring-[var(--hairline)]"
                        }`}
                      >
                        {e.name}
                        <span className="ml-1 opacity-60">{EQUIPMENT_TYPE_LABEL[e.type]}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            icon="add"
            size="sm"
            onClick={() => setGroups((prev) => [...prev, { label: "", itemIds: [], required: true }])}
          >
            เพิ่มกลุ่ม
          </Button>
        </div>
      </Field>

      <Button onClick={save} loading={busy} fullWidth size="lg" className="mt-2">
        บันทึก
      </Button>
    </Modal>
  );
}
