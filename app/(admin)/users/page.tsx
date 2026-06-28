"use client";
// app/(admin)/users/page.tsx — จัดการสมาชิก (role + ลบ)
import { useState } from "react";
import { collection, query, orderBy } from "firebase/firestore";
import { db, auth } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection } from "@/lib/hooks";
import { PageHeader, Card, Badge, Spinner, Button, EmptyState } from "@/components/ui";
import type { UserDoc, Role } from "@/lib/types";

const ROLE_BADGE: Record<Role, string> = {
  super_admin: "bg-purple-100 text-purple-700",
  admin: "bg-green-100 text-green-700",
  member: "bg-neutral-100 text-neutral-600",
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
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function callApi(path: string, body: object) {
    setErr("");
    setMsg("");
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error || "เกิดข้อผิดพลาด");
      return false;
    }
    return true;
  }

  async function changeRole(uid: string, role: Role) {
    if (await callApi("/api/admin/set-role", { uid, role })) setMsg("เปลี่ยนบทบาทเรียบร้อย (ผู้ใช้ต้อง login ใหม่)");
  }

  async function deleteUser(uid: string, label: string) {
    if (!confirm(`ลบบัญชี ${label}?`)) return;
    if (await callApi("/api/admin/delete-user", { uid })) setMsg("ลบบัญชีเรียบร้อย");
  }

  return (
    <div>
      <PageHeader title="จัดการสมาชิก" subtitle="เปลี่ยนบทบาท · ลบบัญชี" />

      {msg && <div className="mb-3 rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-700">✅ {msg}</div>}
      {err && <div className="mb-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">⚠️ {err}</div>}

      {loading ? (
        <Spinner />
      ) : users.length === 0 ? (
        <EmptyState icon="👥" text="ยังไม่มีสมาชิก" />
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const isMe = u.id === me?.uid;
            const canEdit = !isMe && !(u.role === "super_admin" && !isSuper);
            return (
              <Card key={u.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {u.firstName || u.lastName ? `${u.firstName} ${u.lastName}`.trim() : <span className="text-neutral-400">ยังไม่ได้กรอกชื่อ</span>}
                    {isMe && <span className="ml-1 text-xs text-neutral-400">(คุณ)</span>}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {u.studentId} · {u.email}
                    {u.phone && (
                      <>
                        {" · "}
                        <a href={`tel:${u.phone}`} className="text-green-600">
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
                      defaultValue={u.role}
                      onChange={(e) => changeRole(u.id, e.target.value as Role)}
                      className="rounded-lg border border-neutral-300 px-2 py-1.5 pr-7 text-sm"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      {isSuper && <option value="super_admin">Super Admin</option>}
                    </select>
                    <Button variant="ghost" onClick={() => deleteUser(u.id, u.studentId)} className="text-red-500">
                      🗑️
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
