"use client";
// components/panels/members-panel.tsx — จัดการสมาชิก (สิทธิ์ + ยศ + ระงับ)
// (เดิมเป็นหน้า /users — ย้ายมาเป็นแท็บใน /team)
import { useMemo, useState } from "react";
import {
  collection,
  query,
  doc,
  updateDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from "@/lib/db/firestore";
import { db } from "@/lib/db/client";
import { describeWriteError } from "@/lib/errors";
import { useDevMode } from "@/lib/hooks";
import { DEV_BADGE } from "@/lib/dev-mode";
import { useAuth } from "@/lib/db/auth-context";
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
  inputClass,
  ImagePicker,
} from "@/components/ui";
import { compressImageToDataUrl } from "@/lib/image";
import Icon from "@/components/icon";
import { useSettings } from "@/lib/settings-context";
import { ROLE_BADGE, ROLE_LABEL, ROLE_SHORT, ROLE_ICON, displayName, searchText, sortByRank } from "@/lib/roles";
import type { UserDoc, Role, TaskDoc } from "@/lib/types";
import { allUsersQuery } from "@/lib/queries";
import TitlesManager from "./titles-manager";

type Filter = Role | "all" | "banned";

export default function MembersPanel() {
  const { user: me, role: myRole } = useAuth();
  const { settings } = useSettings();
  const isSuper = myRole === "super_admin";
  const devOn = useDevMode();
  const { show, node: toastNode } = useToast();

  const { data: users, loading } = useCollection<UserDoc>(
    () => allUsersQuery(),
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
  const [titlesOpen, setTitlesOpen] = useState(false);

  async function changeTitle(uid: string, title: string) {
    setErr("");
    try {
      await updateDoc(doc(db, "users", uid), { title: title || null });
      show(title ? `ตั้งตำแหน่งเป็น "${title}"` : "ล้างตำแหน่งแล้ว");
    } catch {
      setErr("ตั้งยศไม่สำเร็จ — แอดมินตั้งยศของตัวเองหรือของประธานไม่ได้ ต้องให้ประธานตั้งให้");
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
   * ลบบัญชีสมาชิก — บน NAS ตาราง users คือบัญชีล็อกอินเอง ลบแล้วล็อกอินไม่ได้อีกเลย
   * banned/{uid} คงไว้เป็นหลักฐานว่าถูกลบโดยใคร เมื่อไร (deletedAccount = true)
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

      <div className="mb-3 flex gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="ค้นหาชื่อ / รหัสนักศึกษา / อีเมล"
          className="min-w-0 flex-1"
        />
        <Button variant="outline" icon="edit" onClick={() => setTitlesOpen(true)} className="shrink-0 whitespace-nowrap">
          จัดการยศ
        </Button>
      </div>

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
        // การ์ดแนวตั้งคนละใบ — รูปด้านบน ข้อมูลติดต่อครบในการ์ด (ชื่อจริง · ชื่อเล่น · ตำแหน่ง · เบอร์ · อีเมล)
        // มือถือ 2 คอลัมน์ · เพิ่มตามจอ แต่ไม่เกิน 6 ใบต่อแถว (จอกว้างมากการ์ดขยายแทนเพิ่มคอลัมน์)
        // ปุ่มจัดการอยู่ท้ายการ์ด เฉพาะคนที่มีสิทธิ์แตะบัญชีนั้น
        <div className="stagger grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {shown.map((u, i) => {
            const isMe = u.id === me?.uid;
            // จัดการสิทธิ์/ระงับ/ลบ — admin แตะ super_admin ไม่ได้ (ต้องเป็น super เอง)
            const canManage = !isMe && !(u.role === "super_admin" && !isSuper);
            // แก้ข้อมูลส่วนตัว (ชื่อ/เบอร์/รูป) — แอดมินแก้ของใครก็ได้รวมประธาน และแก้ของตัวเองได้
            // (hook บน NAS คุมไว้ว่าแตะได้แค่ช่องข้อมูล ไม่ให้แตะสิทธิ์/ระงับ)
            const canEditInfo = true;
            // ยศ — จัดการคนอื่นได้ตามสิทธิ์ · ของตัวเองตั้งได้เฉพาะประธาน (ตรงกับ usersUpdateOk ใน ie_lib.js)
            const canSetTitle = canManage || (isMe && isSuper);
            const isBanned = !!u.disabled;
            const fullName = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();

            return (
              <Card
                key={u.id}
                className={`flex flex-col !p-3 ${isBanned ? "opacity-75" : ""}`}
                style={{ ["--i" as string]: Math.min(i, 12) }}
              >
                {/* รูป — สัดส่วนแนวตั้ง 4:5 */}
                <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-black/[0.04]">
                  {u.profileImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.profileImageUrl} alt={fullName || u.studentId} className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-[var(--muted-ink)]">
                      <span className="grid place-items-center gap-1 text-center">
                        <Icon name={ROLE_ICON[u.role]} size={32} />
                        <span className="text-xs">ยังไม่มีรูป</span>
                      </span>
                    </span>
                  )}
                  <div className="absolute inset-x-2 top-2 flex flex-wrap items-start justify-between gap-1">
                    <Badge
                      className={`${isMe && devOn ? "tone-brand" : ROLE_BADGE[u.role]} shadow-sm backdrop-blur`}
                      icon={isMe && devOn ? undefined : ROLE_ICON[u.role]}
                    >
                      {isMe && devOn ? DEV_BADGE : ROLE_SHORT[u.role]}
                    </Badge>
                    {isBanned && (
                      <Badge className="tone-bad shadow-sm" icon="ban">
                        ถูกระงับ
                      </Badge>
                    )}
                  </div>
                </div>

                {/* ข้อมูล */}
                <div className="flex flex-1 flex-col gap-1.5 px-1 pt-3">
                  <div>
                    <p className="font-bold leading-snug text-[var(--ink)]">
                      {fullName || <span className="text-[var(--muted-ink)]">ยังไม่ได้กรอกชื่อ</span>}
                      {isMe && <span className="ml-1 text-xs font-normal text-[var(--muted-ink)]">(คุณ)</span>}
                    </p>
                    <p className="text-sm text-[var(--muted-ink)]">
                      ชื่อเล่น{" "}
                      <span className="font-semibold text-[var(--ink)]">{u.nickname?.trim() || "—"}</span>
                    </p>
                  </div>

                  <p className="flex items-center gap-1.5 text-sm">
                    <Icon name="members" size={16} className="shrink-0 text-[var(--muted-ink)]" />
                    {u.title ? (
                      <span className="font-semibold text-[var(--faculty)]">{u.title}</span>
                    ) : (
                      <span className="text-[var(--muted-ink)]">ไม่มีตำแหน่ง</span>
                    )}
                  </p>

                  {u.phone ? (
                    <a
                      href={`tel:${u.phone}`}
                      className="flex items-center gap-1.5 text-sm font-semibold text-[var(--tone-ok-ink)]"
                    >
                      <Icon name="phone" size={16} className="shrink-0" /> {u.phone}
                    </a>
                  ) : (
                    <p className="flex items-center gap-1.5 text-sm text-[var(--muted-ink)]">
                      <Icon name="phone" size={16} className="shrink-0" /> ไม่มีเบอร์
                    </p>
                  )}

                  <a
                    href={`mailto:${u.email}`}
                    title={u.email}
                    className="flex min-w-0 items-start gap-1.5 text-sm text-[var(--ink)] hover:text-[var(--faculty)]"
                  >
                    <Icon name="mail" size={16} className="mt-0.5 shrink-0 text-[var(--muted-ink)]" />
                    {/* ขึ้นบรรทัดใหม่ได้ ไม่ตัดทิ้ง — การ์ดบนมือถือแคบ อีเมลต้องอ่านได้ครบ */}
                    <span className="min-w-0 break-all">{u.email}</span>
                  </a>
                  <p className="t-num text-xs text-[var(--muted-ink)]">รหัส {u.studentId}</p>

                  {(canEditInfo || canManage) && (
                    <div className="mt-auto flex flex-col gap-2 border-t border-black/6 pt-3">
                      {canManage && (
                        <select
                          value={u.role}
                          onChange={(e) => changeRole(u.id, e.target.value as Role)}
                          className="glass-input min-h-[40px] w-full rounded-xl px-3 py-1.5 !text-sm"
                          aria-label={`สิทธิ์ของ ${u.studentId}`}
                        >
                          <option value="member">{ROLE_LABEL.member}</option>
                          <option value="admin">{ROLE_LABEL.admin}</option>
                          {isSuper && <option value="super_admin">{ROLE_LABEL.super_admin}</option>}
                        </select>
                      )}
                      {canSetTitle && (
                        <select
                          value={u.title ?? ""}
                          onChange={(e) => changeTitle(u.id, e.target.value)}
                          className="glass-input min-h-[40px] w-full rounded-xl px-3 py-1.5 !text-sm"
                          aria-label={`ตำแหน่งในชุมนุมของ ${u.studentId}`}
                        >
                          <option value="">— ไม่มีตำแหน่ง —</option>
                          {settings.memberTitles.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                          {u.title && !settings.memberTitles.includes(u.title) && (
                            <option value={u.title}>{u.title}</option>
                          )}
                        </select>
                      )}
                      {canEditInfo && (
                        <Button
                          size="sm"
                          variant="outline"
                          icon="edit"
                          onClick={() => setEditing(u)}
                          fullWidth
                          className="whitespace-nowrap"
                        >
                          แก้ข้อมูล
                        </Button>
                      )}
                      {canManage && (
                        <div className="flex gap-1.5">
                          {isBanned ? (
                            <Button
                              size="sm"
                              variant="outline"
                              icon="approved"
                              onClick={() => unsuspend(u)}
                              className="flex-1 whitespace-nowrap"
                            >
                              ปลดระงับ
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon="ban"
                              onClick={() => suspend(u)}
                              className="flex-1 whitespace-nowrap text-[var(--tone-warn-ink)]"
                            >
                              ระงับ
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            icon="remove"
                            onClick={() => {
                              setDeleting(u);
                              setConfirmText("");
                              setErr("");
                            }}
                            className="flex-1 whitespace-nowrap text-[var(--tone-bad-ink)]"
                            aria-label={`ลบบัญชี ${u.studentId}`}
                          >
                            ลบ
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-center text-xs leading-relaxed text-[var(--muted-ink)]">
        <b>สิทธิ์</b> คุมว่าเข้าหน้าไหนได้ · <b>ยศ/ตำแหน่ง</b> ในชุมนุมโชว์ให้คนอื่นเห็น
        (เพิ่ม/แก้/ลบยศได้ที่ปุ่ม &ldquo;จัดการยศ&rdquo; ด้านบน)
      </p>
      <p className="mt-2 text-center text-xs leading-relaxed text-[var(--muted-ink)]">
        ระงับแล้วล็อกอินและเขียนข้อมูลไม่ได้ทันที · ลบบัญชี = ลบบัญชีล็อกอินทิ้งด้วย กู้คืนไม่ได้
      </p>

      {editing && (
        <EditMemberModal member={editing} isSelf={editing.id === me?.uid} onClose={() => setEditing(null)} />
      )}
      <TitlesManager open={titlesOpen} onClose={() => setTitlesOpen(false)} users={users} onSaved={show} />

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
          ลบทั้งข้อมูลสมาชิกและบัญชีเข้าสู่ระบบ — คนนี้จะล็อกอินไม่ได้อีก
          ถ้าจะกลับมาใช้ต้องสมัครใหม่
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
  isSelf,
  onClose,
}: {
  member: UserDoc & { id: string };
  isSelf: boolean;
  onClose: () => void;
}) {
  const [firstName, setFirstName] = useState(member.firstName ?? "");
  const [lastName, setLastName] = useState(member.lastName ?? "");
  const [nickname, setNickname] = useState(member.nickname ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(member.profileImageUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const patch: Record<string, unknown> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nickname: nickname.trim(),
        phone: phone.trim(),
      };
      // 256px เท่าหน้าโปรไฟล์ — รายชื่อสมาชิกโหลดรูปทุกคนพร้อมกัน ไม่ควรหนัก
      if (photo) patch.profileImageUrl = await compressImageToDataUrl(photo, 256, 0.8);
      await updateDoc(doc(db, "users", member.id), patch);
      onClose();
    } catch (e) {
      setErr(
        e instanceof Error && e.message === "IMAGE_TOO_LARGE"
          ? "รูปใหญ่เกินไป เลือกรูปที่เล็กลง"
          : describeWriteError(e, "แก้ข้อมูล")
      );
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={isSelf ? "แก้ข้อมูลของฉัน" : `แก้ข้อมูล ${member.studentId}`}>
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}
      <Field label="รูปโปรไฟล์">
        <ImagePicker
          file={photo}
          preview={preview}
          onPick={(f) => {
            setPhoto(f);
            setPreview(f ? URL.createObjectURL(f) : member.profileImageUrl ?? null);
          }}
          hint="รูปหน้าตรงชัด ๆ — เว้นไว้ = ใช้รูปเดิม"
        />
      </Field>
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
