"use client";
// components/panels/crew-panel.tsx — จัดการทีมตากล้องที่เปิดให้จอง
// (เดิมเป็นหน้า /crew — ย้ายมาเป็นแท็บใน /resources)
import { useState } from "react";
import {
  collection,
  query,
  orderBy,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { describeWriteError } from "@/lib/errors";
import { compressImageToDataUrl } from "@/lib/image";
import { useCollection } from "@/lib/hooks";
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
  ImagePicker,
  useToast,
  SearchInput
} from "@/components/ui";
import Icon from "@/components/icon";
import { displayName, titleLine, sortByRank, searchText } from "@/lib/roles";
import type { PhotographerDoc, UserDoc, WithId } from "@/lib/types";

export default function CrewPanel() {
  const { data: crew, loading } = useCollection<PhotographerDoc>(
    () => query(collection(db, "photographers"), orderBy("sortOrder")),
    []
  );
  const { data: users } = useCollection<UserDoc>(() => query(collection(db, "users"), orderBy("studentId")), []);
  const { show, node: toastNode } = useToast();

  const [editing, setEditing] = useState<WithId<PhotographerDoc> | null>(null);
  const [creating, setCreating] = useState(false);
  const [addingMembers, setAddingMembers] = useState(false);
  const [err, setErr] = useState("");

  async function remove(p: WithId<PhotographerDoc>) {
    if (!confirm(`ลบ "${p.name}" ออกจากทีม?\n(การจองเดิมยังอยู่ แต่จะจองคนนี้ใหม่ไม่ได้)`)) return;
    try {
      await deleteDoc(doc(db, "photographers", p.id));
      if (p.uid) await deleteDoc(doc(db, "crew", p.uid)).catch(() => {});
      show("ลบแล้ว");
    } catch (e) {
      setErr(describeWriteError(e, "ลบ"));
    }
  }

  async function toggleStatus(p: WithId<PhotographerDoc>) {
    try {
      await updateDoc(doc(db, "photographers", p.id), {
        status: p.status === "open" ? "closed" : "open",
      });
    } catch (e) {
      setErr(describeWriteError(e, "เปลี่ยนสถานะ"));
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="t-body text-[var(--muted-ink)]">
          <b className="t-num text-[var(--ink)]">{crew.length}</b> คนในทีม · เปิดรับงาน{" "}
          <b className="t-num text-[var(--ink)]">{crew.filter((c) => c.status === "open").length}</b>
        </p>
        <div className="flex gap-2">
          <Button onClick={() => setAddingMembers(true)} icon="add">
            จากสมาชิก
          </Button>
          <Button variant="outline" onClick={() => setCreating(true)} icon="edit">
            กรอกเอง
          </Button>
        </div>
      </div>

      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      {loading ? (
        <Spinner />
      ) : crew.length === 0 ? (
        <EmptyState
          icon="photographer"
          text="ยังไม่มีตากล้องในทีม"
          action={<Button onClick={() => setAddingMembers(true)}>เลือกจากสมาชิกชุมนุม</Button>}
        />
      ) : (
        <div className="stagger space-y-3">
          {crew.map((p, i) => (
            <Card key={p.id} className="p-4" style={{ ["--i" as string]: i }}>
              <div className="flex items-start gap-3">
                {p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.avatarUrl} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
                ) : (
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[var(--faculty)]/10 text-[var(--faculty)]">
                    <Icon name="photographer" size={24} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-[var(--ink)]">{p.name}</p>
                    <Badge
                      className={
                        p.status === "open"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : "bg-neutral-100 text-neutral-600 border border-neutral-200"
                      }
                    >
                      {p.status === "open" ? "เปิดรับงาน" : "ปิดรับ"}
                    </Badge>
                  </div>
                  <p className="text-sm text-[var(--muted-ink)]">{p.role}</p>
                  {p.skills?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.skills.map((s) => (
                        <span key={s} className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-[var(--ink)]/70">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 flex gap-2 border-t border-black/6 pt-3">
                <Button size="sm" variant="outline" icon="edit" onClick={() => setEditing(p)}>
                  แก้ไข
                </Button>
                <Button size="sm" variant="outline" onClick={() => toggleStatus(p)}>
                  {p.status === "open" ? "ปิดรับงาน" : "เปิดรับงาน"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(p)} className="ml-auto text-red-600">
                  
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {addingMembers && (
        <AddFromMembersModal
          users={users}
          crew={crew}
          nextOrder={crew.length}
          onClose={() => setAddingMembers(false)}
          onSaved={(n) => show(`เพิ่มเข้าทีมแล้ว ${n} คน`)}
        />
      )}

      {(creating || editing) && (
        <CrewModal
          crewDoc={editing}
          users={users}
          nextOrder={crew.length}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => show("บันทึกแล้ว")}
        />
      )}

      {toastNode}
    </div>
  );
}

/* ═══ เพิ่มตากล้องจากรายชื่อสมาชิกชุมนุม ═══════════════════════
   ดึงชื่อ/รูป/ยศ จาก users มาเลย ไม่ต้องพิมพ์ซ้ำ และผูก uid ให้อัตโนมัติ
   (ผูก uid = ส่งงาน/แจ้งเตือนเข้าบัญชีคนนั้นได้ทันที) */
function AddFromMembersModal({
  users,
  crew,
  nextOrder,
  onClose,
  onSaved,
}: {
  users: WithId<UserDoc>[];
  crew: WithId<PhotographerDoc>[];
  nextOrder: number;
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // คนที่อยู่ในทีมแล้ว ไม่ต้องโชว์ให้เลือกซ้ำ
  const alreadyIn = new Set(crew.map((c) => c.uid).filter(Boolean) as string[]);
  const q = search.trim().toLowerCase();
  const pool = users.filter((u) => !alreadyIn.has(u.id));

  // ยังไม่ได้ตั้งชื่อเล่น = เพิ่มเข้าทีมไม่ได้
  // เพราะการ์ดตากล้องและตารางงานเรียกกันด้วยชื่อเล่น ถ้าว่างจะกลายเป็นชื่อจริงล้วน
  // แล้วคนอ่านตารางไม่รู้ว่าใครเป็นใคร — กันไว้ตั้งแต่ต้นทางดีกว่าไปแก้ทีหลัง
  const hasNickname = (u: WithId<UserDoc>) => !!u.nickname?.trim();
  const blocked = pool.filter((u) => !hasNickname(u));
  const candidates = pool
    .filter(hasNickname)
    .filter((u) => !q || searchText(u).includes(q))
    .sort(sortByRank);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (picked.size === 0) return setErr("กรุณาเลือกอย่างน้อย 1 คน");
    setBusy(true);
    setErr("");
    try {
      // เขียนทีเดียวทั้งชุด — ลิมิต batch 500 เหลือเฟือสำหรับขนาดชุมนุม
      const batch = writeBatch(db);
      let order = nextOrder;
      for (const uid of picked) {
        const u = users.find((x) => x.id === uid);
        if (!u) continue;
        const ref = doc(collection(db, "photographers"));
        batch.set(ref, {
          name: displayName(u),
          uid: u.id,
          role: (u.title ?? "").trim() || "ช่างภาพ",
          bio: "",
          skills: [],
          avatarUrl: u.profileImageUrl ?? null,
          status: "open",
          sortOrder: order++,
        } satisfies PhotographerDoc);
        // เครื่องหมายให้ firestore.rules เช็คได้ว่าบัญชีนี้เป็นทีมงาน (ใช้กดรับงาน)
        batch.set(doc(db, "crew", u.id), { photographerId: ref.id, addedAt: serverTimestamp() });
      }
      await batch.commit();
      onSaved(picked.size);
      onClose();
    } catch (e) {
      setErr(describeWriteError(e, "เพิ่ม"));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="เพิ่มตากล้องจากสมาชิก" maxWidth="max-w-xl">
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="ค้นหาชื่อจริง / ชื่อเล่น / รหัสนักศึกษา"
        className="mb-3"
      />

      {blocked.length > 0 && (
        <Alert tone="info">
          อีก {blocked.length} คนยังไม่ได้ตั้งชื่อเล่น จึงยังเพิ่มเข้าทีมไม่ได้ —
          ให้เจ้าตัวเข้าระบบแล้วกรอกที่หน้าโปรไฟล์ก่อน ({blocked
            .slice(0, 3)
            .map((u) => u.studentId || u.email)
            .join(", ")}
          {blocked.length > 3 ? " ฯลฯ" : ""})
        </Alert>
      )}

      {candidates.length === 0 ? (
        <EmptyState icon="members" text={q ? "ไม่พบสมาชิกที่ตรงคำค้น" : "สมาชิกทุกคนอยู่ในทีมแล้ว"} />
      ) : (
        <div className="max-h-[46vh] space-y-2 overflow-y-auto overscroll-contain pr-1">
          {candidates.map((u) => {
            const on = picked.has(u.id);
            return (
              <label
                key={u.id}
                className={`press flex min-h-[58px] cursor-pointer items-center gap-3 rounded-2xl border p-3 transition ${
                  on
                    ? "border-[var(--faculty)] bg-[var(--faculty)]/8 shadow-[0_6px_18px_rgba(239,57,97,0.14)]"
                    : "border-black/8 bg-white/60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(u.id)}
                  className="h-[18px] w-[18px] shrink-0 accent-[var(--faculty)]"
                />
                {u.profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.profileImageUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-black/5 text-[var(--muted-ink)]">
                    <Icon name="user" size={18} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--ink)]">{displayName(u)}</span>
                  <span className="block truncate text-xs text-[var(--muted-ink)]">{titleLine(u)}</span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      <Button onClick={save} loading={busy} disabled={picked.size === 0} fullWidth size="lg" className="mt-4">
        เพิ่มเข้าทีม {picked.size > 0 && `(${picked.size} คน)`}
      </Button>
      <p className="mt-2 text-center text-xs text-[var(--muted-ink)]">
        ระบบดึงชื่อ รูป และยศจากโปรไฟล์ให้อัตโนมัติ · แก้รายคนได้ทีหลัง
      </p>
    </Modal>
  );
}

function CrewModal({
  crewDoc,
  users,
  nextOrder,
  onClose,
  onSaved,
}: {
  crewDoc: WithId<PhotographerDoc> | null;
  users: WithId<UserDoc>[];
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(crewDoc?.name ?? "");
  const [uid, setUid] = useState(crewDoc?.uid ?? "");
  const [jobRole, setJobRole] = useState(crewDoc?.role ?? "ช่างภาพ");
  const [bio, setBio] = useState(crewDoc?.bio ?? "");
  const [skills, setSkills] = useState(crewDoc?.skills?.join(", ") ?? "");
  const [status, setStatus] = useState<PhotographerDoc["status"]>(crewDoc?.status ?? "open");
  const [sortOrder, setSortOrder] = useState(crewDoc?.sortOrder ?? nextOrder);
  const [file, setFile] = useState<File | null>(null);
  /** รูปที่ได้มาโดยไม่ต้องอัปโหลด (ดึงจากโปรไฟล์สมาชิก) — ต้องเก็บแยกจาก preview
      เพราะ preview อาจเป็น blob: ของไฟล์ที่เพิ่งเลือก ซึ่งเขียนลง Firestore ไม่ได้ */
  const [inheritedAvatar, setInheritedAvatar] = useState<string | null>(crewDoc?.avatarUrl ?? null);
  const [preview, setPreview] = useState<string | null>(crewDoc?.avatarUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function pick(f: File | null) {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : inheritedAvatar);
  }

  async function save() {
    if (!name.trim()) return setErr("กรุณากรอกชื่อ");
    setBusy(true);
    setErr("");
    try {
      let avatarUrl = inheritedAvatar;
      if (file) avatarUrl = await compressImageToDataUrl(file, 320, 0.8);

      const payload: PhotographerDoc = {
        name: name.trim(),
        uid: uid || null,
        role: jobRole.trim() || "ช่างภาพ",
        bio: bio.trim(),
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        avatarUrl,
        status,
        sortOrder: Number(sortOrder) || 0,
      };

      let photographerId = crewDoc?.id ?? null;
      if (crewDoc) await updateDoc(doc(db, "photographers", crewDoc.id), { ...payload });
      else photographerId = (await addDoc(collection(db, "photographers"), payload)).id;

      // ผูก/ถอดเครื่องหมายทีมงาน ให้ตรงกับ uid ที่เลือก
      if (payload.uid) {
        await setDoc(doc(db, "crew", payload.uid), {
          photographerId,
          addedAt: serverTimestamp(),
        });
      }
      if (crewDoc?.uid && crewDoc.uid !== payload.uid) {
        await deleteDoc(doc(db, "crew", crewDoc.uid)).catch(() => {});
      }

      onSaved();
      onClose();
    } catch (e) {
      setErr(
        e instanceof Error && e.message === "IMAGE_TOO_LARGE"
          ? "รูปใหญ่เกินไป กรุณาเลือกรูปที่เล็กลง"
          : "บันทึกไม่สำเร็จ กรุณาลองใหม่"
      );
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={crewDoc ? `แก้ไข ${crewDoc.name}` : "เพิ่มตากล้อง"}>
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      <Field label="รูปโปรไฟล์">
        <ImagePicker file={file} preview={preview} onPick={pick} hint="สี่เหลี่ยมจัตุรัสสวยที่สุด" />
      </Field>

      <Field label="ชื่อที่แสดง" required>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} maxLength={60} placeholder="เช่น พี่เอก" />
      </Field>

      <Field label="ตำแหน่ง">
        <input value={jobRole} onChange={(e) => setJobRole(e.target.value)} className={inputClass} maxLength={40} placeholder="ช่างภาพหลัก / ตากล้องวิดีโอ" />
      </Field>

      <Field label="ผูกกับบัญชีสมาชิก" help="เลือกแล้วเติมชื่อ/ยศให้อัตโนมัติ · ผูกไว้เพื่อส่งงานและแจ้งเตือนเข้าบัญชีนั้น">
        <select
          value={uid}
          onChange={(e) => {
            const id = e.target.value;
            setUid(id);
            const u = users.find((x) => x.id === id);
            if (!u) return;
            // เติมให้เฉพาะช่องที่ยังว่าง — ไม่ทับของที่แอดมินพิมพ์ไว้เอง
            setName((prev) => prev.trim() || displayName(u));
            setJobRole((prev) => (prev.trim() && prev !== "ช่างภาพ" ? prev : titleLine(u)));
            if (!file && u.profileImageUrl) {
              setInheritedAvatar(u.profileImageUrl);
              setPreview(u.profileImageUrl);
            }
          }}
          className={inputClass}
        >
          <option value="">— ไม่ผูก —</option>
          {[...users].sort(sortByRank).map((u) => (
            <option key={u.id} value={u.id}>
              {displayName(u)} · {titleLine(u)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="ความถนัด (คั่นด้วย ,)">
        <input value={skills} onChange={(e) => setSkills(e.target.value)} className={inputClass} placeholder="Portrait, Event, Video" />
      </Field>

      <Field label="แนะนำตัวสั้น ๆ">
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className={inputClass} maxLength={300} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="สถานะ">
          <select value={status} onChange={(e) => setStatus(e.target.value as PhotographerDoc["status"])} className={inputClass}>
            <option value="open">เปิดรับงาน</option>
            <option value="closed">ปิดรับ</option>
          </select>
        </Field>
        <Field label="ลำดับแสดง" help="เลขน้อยขึ้นก่อน">
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className={inputClass} />
        </Field>
      </div>

      <Button onClick={save} loading={busy} fullWidth size="lg" className="mt-2">
        บันทึก
      </Button>
    </Modal>
  );
}
