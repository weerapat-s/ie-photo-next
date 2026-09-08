"use client";
// components/assign-picker.tsx — กล่องมอบหมายงาน (เลือกได้หลายคน)
//
// 1 งานมอบได้หลายคน · 1 คนรับได้หลายงาน — ไม่มีเพดานทั้งสองทาง
// ถ้าส่ง `range` มาด้วย จะเช็ควันไม่ว่างของแต่ละคนแล้วเตือน
// (เตือน ไม่ห้าม — กรรมการอาจรู้บริบทที่ระบบไม่รู้ เช่น เจ้าตัวยืนยันปากเปล่าแล้ว)
import { useMemo, useState } from "react";
import { Modal, EmptyState, SearchInput, Badge, Button } from "@/components/ui";
import Icon from "@/components/icon";
import { displayName, titleLine, sortByRank, searchText, ROLE_ICON } from "@/lib/roles";
import { busyDaysInRange, shortDay, type BusyMap } from "@/lib/availability";
import type { UserDoc, WithId } from "@/lib/types";

export default function AssignPicker({
  open,
  onClose,
  users,
  selected,
  title = "มอบหมายให้",
  /** ช่วงเวลาของงาน — ใส่มาแล้วจะเตือนคนที่กันวันไว้ */
  range,
  busy,
  /** จำกัดตัวเลือกเฉพาะ uid ในเซ็ตนี้ (เช่น เฉพาะทีมตากล้อง) */
  limitToIds,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  users: WithId<UserDoc>[];
  selected: string[];
  title?: string;
  range?: { startMs: number; endMs: number };
  busy?: BusyMap;
  limitToIds?: Set<string>;
  onSave: (uids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<string[]>(selected);
  const [dirty, setDirty] = useState(false);
  /** uid ที่กรรมการกดยืนยันว่าจะสั่งทับวันที่เจ้าตัวกันไว้ */
  const [override, setOverride] = useState<Set<string>>(new Set());

  // ค่าจากภายนอกเป็นต้นทาง จนกว่าผู้ใช้จะเริ่มแก้ในกล่องนี้
  const picked = dirty ? draft : selected;

  const list = useMemo(() => {
    const base = limitToIds ? users.filter((u) => limitToIds.has(u.id)) : users;
    const q = search.trim().toLowerCase();
    const found = q
      ? base.filter((u) => searchText(u).includes(q))
      : base;
    return [...found].sort(sortByRank);
  }, [users, limitToIds, search]);

  function toggle(uid: string) {
    setDirty(true);
    setDraft((prev) => {
      const base = dirty ? prev : selected;
      return base.includes(uid) ? base.filter((x) => x !== uid) : [...base, uid];
    });
  }

  function close() {
    setDirty(false);
    setSearch("");
    onClose();
  }

  return (
    <Modal open={open} onClose={close} title={title}>
      <SearchInput value={search} onChange={setSearch} placeholder="ค้นหาชื่อ / รหัสนักศึกษา" className="mb-3" />

      <p className="t-caption mb-2 px-1">
        เลือกแล้ว <b className="t-num text-[var(--ink)]">{picked.length}</b> คน · เลือกได้หลายคน ·
        คนที่กันวันไว้จะเลือกไม่ได้จนกว่าจะกด “สั่งทับ”
      </p>

      {list.length === 0 ? (
        <EmptyState icon="members" text={search ? "ไม่พบสมาชิกที่ตรงคำค้น" : "ยังไม่มีสมาชิกให้เลือก"} />
      ) : (
        <ul className="surface-flat max-h-[44vh] divide-y divide-[var(--hairline)] overflow-y-auto rounded-2xl">
          {list.map((u) => {
            const on = picked.includes(u.id);
            const clash = range && busy ? busyDaysInRange(busy, u.id, range.startMs, range.endMs) : [];
            return (
              <li key={u.id}>
                <label
                  className={`press flex cursor-pointer items-center gap-3 p-3 transition ${
                    on ? "bg-[var(--tone-brand-bg)]" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={clash.length > 0 && !override.has(u.id)}
                    onChange={() => toggle(u.id)}
                    className="h-[18px] w-[18px] shrink-0 accent-[var(--faculty)] disabled:opacity-40"
                  />
                  {u.profileImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.profileImageUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-black/5 text-[var(--muted-ink)]">
                      <Icon name={ROLE_ICON[u.role]} size={18} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="t-label block truncate text-[var(--ink)]">{displayName(u)}</span>
                    <span className="t-caption block truncate">{titleLine(u)}</span>
                  </span>
                  {clash.length > 0 &&
                    (override.has(u.id) ? (
                      <Badge className="tone-bad" icon="warning">
                        สั่งทับวันที่กันไว้
                      </Badge>
                    ) : (
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <Badge className="tone-warn" icon="warning">
                          ติด {clash.map(shortDay).slice(0, 2).join(", ")}
                          {clash.length > 2 ? ` +${clash.length - 2}` : ""}
                        </Badge>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setOverride((prev) => new Set(prev).add(u.id));
                          }}
                          className="press t-caption rounded-full px-2 py-1 font-semibold text-[var(--faculty)]"
                        >
                          สั่งทับ
                        </button>
                      </span>
                    ))}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={close}>
          ยกเลิก
        </Button>
        <Button
          className="flex-1"
          icon="approved"
          onClick={() => {
            onSave(picked);
            close();
          }}
        >
          บันทึก ({picked.length})
        </Button>
      </div>
    </Modal>
  );
}
