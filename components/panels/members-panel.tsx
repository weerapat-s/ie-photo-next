"use client";
// components/panels/members-panel.tsx — จัดการสมาชิก (สิทธิ์ + ยศ + ระงับ)
// (เดิมเป็นหน้า /users — ย้ายมาเป็นแท็บใน /team)
import { useMemo, useState } from "react";
import {
  collection,
  query,
  orderBy,
  doc,
  updateDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { describeWriteError } from "@/lib/errors";
import { useDevMode } from "@/lib/hooks";
import { DEV_BADGE } from "@/lib/dev-mode";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection } from "@/lib/hooks";
import {
  Card,
  Badge,
  Spinner,
  Button,
  EmptyState,
  Alert,
  ChipBar,
  useToast,
  SearchInput,
  Modal,
  Field,
  inputClass
} from "@/components/ui";
import Icon from "@/components/icon";
import { useSettings } from "@/lib/settings-context";
import { ROLE_BADGE, ROLE_LABEL, ROLE_SHORT, ROLE_ICON, displayName, searchText, sortByRank } from "@/lib/roles";
import type { UserDoc, Role, TaskDoc } from "@/lib/types";

type Filter = Role | "all" | "banned";

export default function MembersPanel() {
  const { user: me, role: myRole } = useAuth();
  const { settings } = useSettings();
  const isSuper = myRole === "super_admin";
  const devOn = useDevMode();
  const { show, node: toastNode } = useToast();

  const { data: users, loading } = useCollection<UserDoc>(
    () => query(collection(db, "users"), orderBy("studentId")),
    []
  );
  const { data: tasks } = useCollection<TaskDoc>(() => query(collection(db, "tasks")), []);

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");
  const [deleting, setDeleting] = useState<(UserDoc & { id: string }) | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => {
    const byRole =
      filter === "all"
        ? users
        : filter === "banned"
          ? users.filter((u) => u.disabled)
          : users.filter((u) => u.role === filter);
    const q = search.trim().toLowerCase();
    const found = !q
      ? byRole
      : byRole.filter((u) => searchText(u).includes(q));
    const sorted = [...found].sort(sortByRank);
    // โหมด dev = อยู่เหนือทุกคน — ดันการ์ดตัวเองขึ้นบนสุดของรายการ
    // (แค่การจัดเรียงบนจอ ไม่ได้แก้ยศจริงในฐานข้อมูล)
    if (devOn && me) {
      const i = sorted.findIndex((u) => u.id === me.uid);
      if (i > 0) sorted.unshift(...sorted.splice(i, 1));
    }
    return sorted;
  }, [users, filter, search, devOn, me]);

  const [editing, setEditing] = useState<(UserDoc & { id: string }) | null>(null);

  async function changeTitle(uid: string, title: string) {
    setErr("");
    try {
      await updateDoc(doc(db, "users", uid), { title: title || null });
      show(title ? `ตั้งยศเป็น "${title}"` : "ล้างยศแล้ว");
    } catch {
      setErr("ตั้งยศไม่สำเร็จ — ประธานตั้งยศให้ตัวเองไม่ได้ ต้องให้คนอื่นตั้งให้");
    }
  }

  async function changeRole(uid: string, role: Role) {
    setErr("");
    try {
      await updateDoc(doc(db, "users", uid), { role });
      show("เปลี่ยนบทบาทเรียบร้อย");
    } catch {
      setErr("เปลี่ยนบทบาทไม่สำเร็จ");
    }
  }

  async function suspend(u: UserDoc & { id: string }) {
    setErr("");
    const activeCount = tasks.filter(
      (t) => (t.assignedToId === u.id || t.assignedById === u.id) && t.status !== "completed" && t.status !== "cancelled"
    ).length;

    let confirmMsg = `ระงับบัญชี ${u.studentId}?`;
    if (activeCount > 0) confirmMsg += `\n⚠️ บัญชีนี้ยังมีงานค้างอยู่ ${activeCount} รายการ`;
    if (!confirm(confirmMsg)) return;

    try {
      await setDoc(doc(db, "banned", u.id), { bannedAt: serverTimestamp(), by: me?.uid ?? null });
      await updateDoc(doc(db, "users", u.id), { disabled: true });
      show(`ระงับบัญชี ${u.studentId} แล้ว — เขียนข้อมูลไม่ได้ทันที`);
    } catch {
      setErr("ระงับบัญชีไม่สำเร็จ");
    }
  }

  /**
   * ลบบัญชีสมาชิก — ลบโปรไฟล์ + ตัดสิทธิ์เขียนทันที
   *
   * ข้อจำกัดที่ต้องรู้: ลบ "บัญชี Firebase Auth" จากหน้าเว็บไม่ได้
   * (ต้องใช้ Admin SDK ซึ่งอยู่ฝั่งเซิร์ฟเวอร์เท่านั้น)
   * สิ่งที่ทำได้คือลบ users/{uid} + ตั้ง banned/{uid} ค้างไว้
   * → คนนั้นล็อกอินผ่าน Auth ได้ แต่ระบบเตะออกทันทีและเขียนอะไรไม่ได้เลย
   * ถ้าต้องการลบให้หมดจริง ๆ ให้รัน scripts/delete-user.cjs ต่อ
   */
  async function deleteAccount() {
    if (!deleting) return;
    if (confirmText.trim() !== deleting.studentId) {
      setErr("พิมพ์รหัสนักศึกษาให้ตรงก่อนยืนยัน");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const batch = writeBatch(db);
      // banned ต้องคงอยู่ ไม่งั้น auth-context จะสร้าง user doc คืนให้อัตโนมัติ
      batch.set(doc(db, "banned", deleting.id), {
        bannedAt: serverTimestamp(),
        by: me?.uid ?? null,
        deletedAccount: true,
      });
      batch.delete(doc(db, "users", deleting.id));
      batch.delete(doc(db, "crew", deleting.id));
      await batch.commit();
      show(`ลบบัญชี ${deleting.studentId} แล้ว`);
      setDeleting(null);
      setConfirmText("");
    } catch {
      setErr("ลบบัญชีไม่สำเร็จ — ต้องเป็นแอดมิน และห้ามลบบัญชีตัวเอง");
    } finally {
      setBusy(false);
    }
  }

  async function unsuspend(u: UserDoc & { id: string }) {
    setErr("");
    if (!confirm(`ปลดการระงับบัญชี ${u.studentId}?`)) return;
    try {
      await deleteDoc(doc(db, "banned", u.id));
      await updateDoc(doc(db, "users", u.id), { disabled: false });
      show(`ปลดการระงับ ${u.studentId} แล้ว`);
    } catch {
      setErr("ปลดการระงับไม่สำเร็จ");
    }
  }

  return (
    <div>
      <p className="t-body mb-4 text-[var(--muted-ink)]">
        <b className="t-num text-[var(--ink)]">{users.length}</b> บัญชี · กรรมการ{" "}
        <b className="t-num text-[var(--ink)]">{users.filter((u) => u.role !== "member").length}</b> คน
      </p>

      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      <SearchInput value={search} onChange={setSearch} placeholder="ค้นหาชื่อ / รหัสนักศึกษา / อีเมล" className="mb-3" />

      <ChipBar
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={[
          { key: "all", label: "ทั้งหมด", count: users.length },
          { key: "member", label: "สมาชิก", count: users.filter((u) => u.role === "member").length },
          { key: "admin", label: "Admin", count: users.filter((u) => u.role === "admin").length },
          { key: "banned", label: "ถูกระงับ", count: users.filter((u) => u.disabled).length },
        ]}
      />

      {loading ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState icon="members" text="ไม่พบสมาชิกที่ตรงเงื่อนไข" />
      ) : (
        <div className="stagger space-y-2">
          {shown.map((u, i) => {
            const isMe = u.id === me?.uid;
            // จัดการสิทธิ์/ระงับ/ลบ — admin แตะ super_admin ไม่ได้ (ต้องเป็น super เอง)
            const canManage = !isMe && !(u.role === "super_admin" && !isSuper);
            // แก้ข้อมูลส่วนตัว (ชื่อ/เบอร์) — แอดมินคนไหนก็แก้ของใครก็ได้รวมประธาน
            // (rules คุมไว้ว่าแตะได้แค่ฟิลด์ข้อมูล ไม่ให้แตะยศ/ระงับ)
            const canEditInfo = !isMe;
            const isBanned = !!u.disabled;

            return (
              <Card key={u.id} className="p-4" style={{ ["--i" as string]: Math.min(i, 12) }}>
                <div className="flex items-start gap-3">
                  {u.profileImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.profileImageUrl} alt="" className="h-11 w-11 shrink-0 rounded-2xl object-cover" />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-black/5 text-lg">
                      {ROLE_ICON[u.role]}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-bold text-[var(--ink)]">
                      {u.firstName || u.lastName ? (
                        displayName(u)
                      ) : (
                        <span className="text-[var(--muted-ink)]">ยังไม่ได้กรอกชื่อ</span>
                      )}
                      {isMe && <span className="text-xs font-normal text-[var(--muted-ink)]">(คุณ)</span>}
                      {isBanned && <Badge className="tone-bad" icon="ban">ถูกระงับ</Badge>}
                    </p>
                    {u.title && (
                      <p className="truncate text-xs font-semibold text-[var(--faculty)]">{u.title}</p>
                    )}
                    <p className="truncate text-xs text-[var(--muted-ink)]">
                      {u.studentId} · {u.email}
                    </p>
                    {u.phone && (
                      <a
                        href={`tel:${u.phone}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--tone-ok-ink)]"
                      >
                        <Icon name="phone" size={16} /> {u.phone}
                      </a>
                    )}
                  </div>
                  <Badge className={isMe && devOn ? "tone-brand" : ROLE_BADGE[u.role]}>
                    {isMe && devOn ? DEV_BADGE : `${ROLE_ICON[u.role]} ${ROLE_SHORT[u.role]}`}
                  </Badge>
                </div>

                {(canEditInfo || canManage) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/6 pt-3">
                    {canManage && (
                      <>
                        <select
                          value={u.role}
                          onChange={(e) => changeRole(u.id, e.target.value as Role)}
                          className="glass-input min-h-[40px] rounded-xl px-3 py-1.5 !text-sm"
                          aria-label={`สิทธิ์ของ ${u.studentId}`}
                        >
                          <option value="member">{ROLE_LABEL.member}</option>
                          <option value="admin">{ROLE_LABEL.admin}</option>
                          {isSuper && <option value="super_admin">{ROLE_LABEL.super_admin}</option>}
                        </select>
                        <select
                          value={u.title ?? ""}
                          onChange={(e) => changeTitle(u.id, e.target.value)}
                          className="glass-input min-h-[40px] rounded-xl px-3 py-1.5 !text-sm"
                          aria-label={`ยศในชุมนุมของ ${u.studentId}`}
                        >
                          <option value="">— ไม่มียศ —</option>
                          {settings.memberTitles.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                          {u.title && !settings.memberTitles.includes(u.title) && (
                            <option value={u.title}>{u.title}</option>
                          )}
                        </select>
                        {isBanned ? (
                          <Button size="sm" variant="outline" icon="approved" onClick={() => unsuspend(u)}>
                            ปลดระงับ
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" icon="ban" onClick={() => suspend(u)} className="text-[var(--tone-warn-ink)]">
                            ระงับ
                          </Button>
                        )}
                      </>
                    )}
                    {canEditInfo && (
                      <Button size="sm" variant="outline" icon="edit" onClick={() => setEditing(u)}>
                        แก้ข้อมูล
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="remove"
                        onClick={() => {
                          setDeleting(u);
                          setConfirmText("");
                          setErr("");
                        }}
                        className="ml-auto text-[var(--tone-bad-ink)]"
                      >
                        ลบบัญชี
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-center text-xs leading-relaxed text-[var(--muted-ink)]">
        <b>สิทธิ์</b> คุมว่าเข้าหน้าไหนได้ · <b>ยศ</b> เป็นตำแหน่งในชุมนุมที่โชว์ให้คนอื่นเห็น
        (แก้ตัวเลือกยศได้ที่หน้าตั้งค่าระบบ)
      </p>
      <p className="mt-2 text-center text-xs leading-relaxed text-[var(--muted-ink)]">
        ระงับแล้วเขียนข้อมูลไม่ได้ทันที · ตัดสิทธิ์เข้าสู่ระบบต้องรัน{" "}
        <code className="rounded bg-black/5 px-1">scripts/suspend-user.cjs &lt;uid&gt;</code> · ลบถาวรใช้{" "}
        <code className="rounded bg-black/5 px-1">scripts/delete-user.cjs &lt;uid&gt;</code>
      </p>

      {editing && <EditMemberModal member={editing} onClose={() => setEditing(null)} />}

      <Modal
        open={!!deleting}
        onClose={() => {
          setDeleting(null);
          setConfirmText("");
        }}
        title={`ลบบัญชี ${deleting ? displayName(deleting) : ""}`}
      >
        <div className="tone-bad mb-4 flex items-start gap-2.5 rounded-2xl px-4 py-3">
          <span className="mt-0.5">
            <Icon name="warning" size={16} />
          </span>
          <div className="t-body min-w-0">
            ลบโปรไฟล์ถาวรและตัดสิทธิ์ทันที — <b>กู้คืนไม่ได้</b>
          </div>
        </div>

        <p className="t-body mb-4 text-[var(--muted-ink)]">
          บัญชีเข้าสู่ระบบ (Firebase Auth) ลบจากหน้าเว็บไม่ได้ ต้องใช้ Admin SDK
          — หลังกดลบ คนนี้จะยังล็อกอินผ่านได้แต่ระบบเตะออกทันทีและเขียนอะไรไม่ได้เลย
          ถ้าต้องการลบให้หมดจริง ให้รัน{" "}
          <code className="rounded bg-black/5 px-1">scripts/delete-user.cjs {deleting?.id}</code> ต่อ
        </p>

        {deleting && (
          <Field label={`พิมพ์รหัสนักศึกษา "${deleting.studentId}" เพื่อยืนยัน`} required>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className={inputClass}
              placeholder={deleting.studentId}
              autoComplete="off"
            />
          </Field>
        )}

        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setDeleting(null);
              setConfirmText("");
            }}
          >
            ยกเลิก
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            loading={busy}
            disabled={!deleting || confirmText.trim() !== deleting.studentId}
            onClick={deleteAccount}
          >
            ลบบัญชีถาวร
          </Button>
        </div>
      </Modal>

      {toastNode}
    </div>
  );
}

/** แก้ข้อมูลส่วนตัวของสมาชิก — แอดมินแก้ doc คนอื่นได้ตาม firestore.rules */
function EditMemberModal({
  member,
  onClose,
}: {
  member: UserDoc & { id: string };
  onClose: () => void;
}) {
  const [firstName, setFirstName] = useState(member.firstName ?? "");
  const [lastName, setLastName] = useState(member.lastName ?? "");
  const [nickname, setNickname] = useState(member.nickname ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true);
    setErr("");
    try {
      await updateDoc(doc(db, "users", member.id), {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nickname: nickname.trim(),
        phone: phone.trim(),
      });
      onClose();
    } catch (e) {
      setErr(describeWriteError(e, "แก้ข้อมูล"));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`แก้ข้อมูล ${member.studentId}`}>
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}
      <div className="grid gap-0 sm:grid-cols-2 sm:gap-3">
        <Field label="ชื่อจริง">
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} maxLength={60} />
        </Field>
        <Field label="นามสกุล">
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} maxLength={60} />
        </Field>
      </div>
      <Field label="ชื่อเล่น">
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} className={inputClass} maxLength={30} />
      </Field>
      <Field label="เบอร์โทร">
        <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} maxLength={20} />
      </Field>
      <Button onClick={save} loading={busy} fullWidth size="lg" className="mt-2">
        บันทึก
      </Button>
    </Modal>
  );
}
