"use client";
// components/panels/titles-manager.tsx — จัดการรายการยศ/ตำแหน่งในชุมนุม (เปิดจากหน้าสมาชิก)
//
// รายการเก็บที่ settings/app.memberTitles — ลำดับในรายการ = ลำดับในช่องเลือกของการ์ดสมาชิก
// แก้ชื่อ/ลบยศที่มีคนถืออยู่ → อัปเดตสมาชิกคนนั้นให้ด้วยในคราวเดียว
// (ไม่งั้นการ์ดยังโชว์ชื่อเก่าค้าง ทั้งที่ไม่มีในรายการแล้ว)
import { useState } from "react";
import { doc, serverTimestamp, writeBatch } from "@/lib/db/firestore";
import { db } from "@/lib/db/client";
import { useAuth } from "@/lib/db/auth-context";
import { useSettings } from "@/lib/settings-context";
import { describeWriteError } from "@/lib/errors";
import { Modal, Button, Alert, inputClass } from "@/components/ui";
import Icon from "@/components/icon";
import type { UserDoc, WithId } from "@/lib/types";

const MAX_TITLES = 30;
const MAX_LEN = 40;

/** รายการในหน้าต่าง — orig = ชื่อเดิมตอนเปิด (null = เพิ่มใหม่) */
interface Item {
  key: string;
  orig: string | null;
  name: string;
}

export default function TitlesManager({
  open,
  onClose,
  users,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  users: WithId<UserDoc>[];
  onSaved: (msg: string) => void;
}) {
  // ปิดแล้วเปิดใหม่ = เริ่มจากค่าล่าสุดบนเซิร์ฟเวอร์ (ไม่ค้างของที่แก้แล้วยกเลิก)
  return open ? <Editor onClose={onClose} users={users} onSaved={onSaved} /> : null;
}

function Editor({
  onClose,
  users,
  onSaved,
}: {
  onClose: () => void;
  users: WithId<UserDoc>[];
  onSaved: (msg: string) => void;
}) {
  const { user, role } = useAuth();
  const { settings } = useSettings();
  const isSuper = role === "super_admin";
  /**
   * เปลี่ยนยศคนนี้ได้ไหม — ตรงกับกติกาบน NAS (usersUpdateOk ใน nas/pb_hooks/ie_lib.js)
   * แอดมินธรรมดาเปลี่ยนยศตัวเองไม่ได้ และแตะยศประธานไม่ได้ · ประธานทำได้ทุกคน
   * คนที่ข้ามไปยังถือชื่อยศเดิมอยู่ (การ์ดยังโชว์) จนกว่าประธานจะเปลี่ยนให้
   */
  const canRetitle = (u: WithId<UserDoc>) => isSuper || (u.id !== user?.uid && u.role !== "super_admin");
  const [items, setItems] = useState<Item[]>(() =>
    settings.memberTitles.map((t, i) => ({ key: `o${i}`, orig: t, name: t }))
  );
  const [removed, setRemoved] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const holders = (title: string | null) => (title ? users.filter((u) => u.title === title).length : 0);
  const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, MAX_LEN);
  const names = items.map((i) => clean(i.name));
  const duplicate = names.find((n, i) => n && names.indexOf(n) !== i);
  const empty = names.some((n) => !n);
  const changed =
    removed.length > 0 ||
    items.length !== settings.memberTitles.length ||
    items.some((it, i) => it.orig !== settings.memberTitles[i] || clean(it.name) !== it.orig);

  function add() {
    const n = clean(newName);
    if (!n) return;
    if (names.includes(n)) return setErr(`มียศ "${n}" อยู่แล้ว`);
    if (items.length >= MAX_TITLES) return setErr(`มีได้ไม่เกิน ${MAX_TITLES} ยศ`);
    setErr("");
    setItems((xs) => [...xs, { key: `n${Date.now()}`, orig: null, name: n }]);
    setNewName("");
  }

  function rename(key: string, name: string) {
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, name } : x)));
  }

  function move(idx: number, dir: -1 | 1) {
    setItems((xs) => {
      const j = idx + dir;
      if (j < 0 || j >= xs.length) return xs;
      const next = [...xs];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  function remove(it: Item) {
    const n = holders(it.orig);
    if (n > 0 && !confirm(`ยศ "${it.orig}" มีคนถืออยู่ ${n} คน — ลบแล้วคนเหล่านั้นจะไม่มียศ\nลบต่อไหม?`)) return;
    setItems((xs) => xs.filter((x) => x.key !== it.key));
    if (it.orig) setRemoved((r) => [...r, it.orig!]);
  }

  async function save() {
    if (!user || busy) return;
    if (empty) return setErr("มีช่องชื่อยศว่างอยู่ — กรอกหรือลบทิ้งก่อน");
    if (duplicate) return setErr(`ชื่อยศ "${duplicate}" ซ้ำกัน`);
    setBusy(true);
    setErr("");
    try {
      // รายการยศ + สมาชิกที่ถือยศที่ถูกแก้ชื่อ/ลบ — ชุดเดียว สำเร็จหรือไม่ก็ไม่เปลี่ยนอะไรเลย
      const batch = writeBatch(db);
      batch.set(
        doc(db, "settings", "app"),
        { memberTitles: names, updatedAt: serverTimestamp(), updatedBy: user.uid },
        { merge: true }
      );
      let touched = 0;
      let skipped = 0;
      const retitle = (from: string, to: string | null) => {
        for (const u of users.filter((x) => x.title === from)) {
          if (!canRetitle(u)) {
            skipped++;
            continue;
          }
          batch.update(doc(db, "users", u.id), { title: to });
          touched++;
        }
      };
      for (const it of items) {
        const to = clean(it.name);
        if (it.orig && it.orig !== to) retitle(it.orig, to);
      }
      for (const t of removed) retitle(t, null);
      await batch.commit();
      onSaved(
        `บันทึกยศแล้ว${touched ? ` · อัปเดตสมาชิก ${touched} คน` : ""}` +
          (skipped ? ` · อีก ${skipped} คนต้องให้ประธานเปลี่ยนให้` : "")
      );
      onClose();
    } catch (e) {
      setErr(describeWriteError(e, "บันทึกยศ"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="จัดการยศ / ตำแหน่ง"
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            ยกเลิก
          </Button>
          <Button onClick={save} loading={busy} disabled={!changed} className="flex-1">
            บันทึก
          </Button>
        </div>
      }
    >
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      <p className="t-caption mb-3">
        ลำดับในรายการ = ลำดับในช่องเลือกยศของการ์ดสมาชิก · แก้ชื่อยศที่มีคนถืออยู่ ระบบเปลี่ยนให้คนนั้นด้วย
      </p>

      {/* เพิ่มยศใหม่ */}
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="ชื่อยศใหม่ เช่น ฝ่ายกราฟิก"
          maxLength={MAX_LEN}
          className={`${inputClass} flex-1`}
          aria-label="ชื่อยศใหม่"
        />
        <Button type="submit" icon="add" disabled={!clean(newName)} className="shrink-0">
          เพิ่ม
        </Button>
      </form>

      {items.length === 0 ? (
        <p className="t-body py-6 text-center text-[var(--muted-ink)]">ยังไม่มียศ — เพิ่มได้จากช่องด้านบน</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => {
            const n = holders(it.orig);
            return (
              <li key={it.key} className="flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  <input
                    value={it.name}
                    onChange={(e) => rename(it.key, e.target.value)}
                    maxLength={MAX_LEN}
                    className={`${inputClass} !py-2`}
                    aria-label={`ชื่อยศลำดับที่ ${i + 1}`}
                  />
                  <p className="t-caption mt-0.5 pl-1">
                    {it.orig === null ? "เพิ่มใหม่" : n ? `มีคนถือ ${n} คน` : "ยังไม่มีคนถือ"}
                    {it.orig && clean(it.name) !== it.orig && clean(it.name) && ` · เปลี่ยนจาก "${it.orig}"`}
                  </p>
                </div>
                {/* ปุ่มเรียงแนวนอน 40px — เป้ากดพอสำหรับนิ้วบนมือถือ */}
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[var(--muted-ink)] hover:bg-black/5 disabled:opacity-30"
                  aria-label={`เลื่อน "${it.name}" ขึ้น`}
                >
                  <Icon name="up" size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === items.length - 1}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[var(--muted-ink)] hover:bg-black/5 disabled:opacity-30"
                  aria-label={`เลื่อน "${it.name}" ลง`}
                >
                  <Icon name="down" size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(it)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[var(--tone-bad-ink)] hover:bg-[var(--tone-bad-ink)]/10"
                  aria-label={`ลบยศ "${it.name}"`}
                >
                  <Icon name="remove" size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
