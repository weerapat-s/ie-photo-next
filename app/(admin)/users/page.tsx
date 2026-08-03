"use client";
// app/(admin)/users/page.tsx — จัดการสมาชิก (role + ระงับ/ปลดระงับ)
import { useState } from "react";
import { collection, query, orderBy, doc, updateDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection } from "@/lib/hooks";
import { PageHeader, Card, Badge, Spinner, Button, EmptyState } from "@/components/ui";
import type { UserDoc, Role, TaskDoc } from "@/lib/types";

const ROLE_BADGE: Record<Role, string> = {
  super_admin: "bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-[0_0_12px_rgba(168,85,247,0.2)]",
  admin: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.2)]",
  member: "bg-slate-800 text-slate-300 border border-slate-700/60",
};
const ROLE_LABEL: Record<Role, string> = {
  super_admin: "⭐ Super Admin",
  admin: "🛡 Admin",
  member: "Member",
};

export default function UsersPage() {
  const { user: me, role: myRole } = useAuth();
  const isSuper = myRole === "super_admin";
  const { data: users, loading } = useCollection<UserDoc>(
    () => query(collection(db, "users"), orderBy("studentId")),
    []
  );
  const { data: tasks } = useCollection<TaskDoc>(() => query(collection(db, "tasks")), []);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function changeRole(uid: string, role: Role) {
    setErr("");
    setMsg("");
    try {
      await updateDoc(doc(db, "users", uid), { role });
      setMsg("เปลี่ยนบทบาทเรียบร้อย");
    } catch {
      setErr("เปลี่ยนบทบาทไม่สำเร็จ");
    }
  }

  async function suspend(u: UserDoc & { id: string }) {
    setErr("");
    setMsg("");
    const activeTasks = tasks.filter((t) => (t.assignedToId === u.id || t.assignedById === u.id) && t.status !== "completed" && t.status !== "cancelled");
    const activeCount = activeTasks.length;
    
    let confirmMsg = `ระงับบัญชี ${u.studentId}?`;
    if (activeCount > 0) {
      confirmMsg += `\n⚠️ บัญชีนี้ยังมีรายการงานค้างอยู่ ${activeCount} รายการ`;
    }

    if (!confirm(confirmMsg)) return;

    try {
      await setDoc(doc(db, "banned", u.id), { bannedAt: serverTimestamp(), by: me?.uid ?? null });
      await updateDoc(doc(db, "users", u.id), { disabled: true });
      setMsg(`ระงับบัญชี ${u.studentId} เรียบร้อย — ผู้ใช้เขียนข้อมูลไม่ได้ทันที`);
    } catch {
      setErr("ระงับบัญชีไม่สำเร็จ");
    }
  }

  async function unsuspend(u: UserDoc & { id: string }) {
    setErr("");
    setMsg("");
    if (!confirm(`ปลดการระงับบัญชี ${u.studentId}?`)) return;

    try {
      await deleteDoc(doc(db, "banned", u.id));
      await updateDoc(doc(db, "users", u.id), { disabled: false });
      setMsg(`ปลดการระงับบัญชี ${u.studentId} เรียบร้อย`);
    } catch {
      setErr("ปลดการระงับไม่สำเร็จ");
    }
  }

  return (
    <div>
      <PageHeader title="จัดการสมาชิก" subtitle="เปลี่ยนบทบาท · ระงับบัญชี" />

      {msg && <div className="mb-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 text-sm text-emerald-400">✅ {msg}</div>}
      {err && <div className="mb-3 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">⚠️ {err}</div>}

      {loading ? (
        <Spinner />
      ) : users.length === 0 ? (
        <EmptyState icon="👥" text="ยังไม่มีสมาชิก" />
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const isMe = u.id === me?.uid;
            const canEdit = !isMe && !(u.role === "super_admin" && !isSuper);
            const isBanned = !!u.disabled;

            return (
              <Card key={u.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-100 flex items-center gap-2">
                    {u.firstName || u.lastName ? `${u.firstName} ${u.lastName}`.trim() : <span className="text-slate-500">ยังไม่ได้กรอกชื่อ</span>}
                    {isMe && <span className="text-xs text-slate-400">(คุณ)</span>}
                    {isBanned && <Badge className="bg-red-500/20 text-red-300 border border-red-500/30">🚫 ถูกระงับ</Badge>}
                  </p>
                  <p className="text-xs text-slate-400">
                    {u.studentId} · {u.email}
                    {u.phone && (
                      <>
                        {" · "}
                        <a href={`tel:${u.phone}`} className="text-emerald-400 hover:underline">
                          📞 {u.phone}
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <Badge className={`ml-auto ${ROLE_BADGE[u.role]}`}>{ROLE_LABEL[u.role]}</Badge>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u.id, e.target.value as Role)}
                      className="rounded-xl border border-slate-700/80 bg-slate-800/80 text-slate-200 px-2.5 py-1.5 pr-7 text-sm outline-none focus:border-orange-500"
                    >
                      <option value="member" className="bg-slate-900 text-slate-200">Member</option>
                      <option value="admin" className="bg-slate-900 text-slate-200">Admin</option>
                      {isSuper && <option value="super_admin" className="bg-slate-900 text-slate-200">Super Admin</option>}
                    </select>
                    {isBanned ? (
                      <Button variant="outline" onClick={() => unsuspend(u)} className="text-xs">
                        ปลดระงับ
                      </Button>
                    ) : (
                      <Button variant="ghost" onClick={() => suspend(u)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                        🚫
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-slate-400">
        📌 ระงับแล้วเขียนข้อมูลไม่ได้ทันที · ตัดสิทธิ์เข้าสู่ระบบต้องรัน <code className="text-slate-300">scripts/suspend-user.cjs &lt;uid&gt;</code> · ลบถาวรใช้ <code className="text-slate-300">scripts/delete-user.cjs &lt;uid&gt;</code>
      </p>
    </div>
  );
}
