"use client";
// app/(admin)/tasks/page.tsx — มอบหมาย/จัดการงาน
import { useState } from "react";
import { collection, query, orderBy, addDoc, doc, updateDoc, deleteDoc, Timestamp, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection } from "@/lib/hooks";
import { PageHeader, Card, Badge, Spinner, Button, Field, inputClass, EmptyState } from "@/components/ui";
import { fmtDate, TASK_STATUS } from "@/lib/format";
import type { TaskDoc, UserDoc } from "@/lib/types";

export default function AdminTasksPage() {
  const { user, profile } = useAuth();
  const { data: tasks, loading } = useCollection<TaskDoc>(
    () => query(collection(db, "tasks"), orderBy("createdAt", "desc")),
    []
  );
  const { data: users } = useCollection<UserDoc>(() => query(collection(db, "users"), orderBy("studentId")), []);

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !title.trim() || !assignee) return;
    setBusy(true);
    const target = users.find((u) => u.id === assignee);
    await addDoc(collection(db, "tasks"), {
      title: title.trim(),
      description: desc.trim() || null,
      assignedById: user.uid,
      assignedByName: `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() || "แอดมิน",
      assignedToId: assignee,
      assignedToName: target ? `${target.firstName} ${target.lastName}`.trim() || target.studentId : "",
      bookingId: null,
      status: "pending",
      dueDate: due ? Timestamp.fromDate(new Date(due)) : null,
      createdAt: serverTimestamp(),
    });
    setTitle("");
    setDesc("");
    setAssignee("");
    setDue("");
    setBusy(false);
  }

  return (
    <div>
      <PageHeader title="จัดการงาน" subtitle="มอบหมายงานให้สมาชิก" />

      <Card className="mb-5">
        <form onSubmit={create}>
          <Field label="ชื่องาน" required>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </Field>
          <Field label="รายละเอียด">
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className={inputClass} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="มอบหมายให้" required>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={`${inputClass} bg-slate-900`}>
                <option value="" className="bg-slate-900 text-slate-400">— เลือกสมาชิก —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id} className="bg-slate-900 text-slate-200">
                    {`${u.firstName} ${u.lastName}`.trim() || u.studentId}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="กำหนดส่ง">
              <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Button type="submit" disabled={busy || !title.trim() || !assignee} className="mt-2">
            + สร้างงาน
          </Button>
        </form>
      </Card>

      {loading ? (
        <Spinner />
      ) : tasks.length === 0 ? (
        <EmptyState icon="📋" text="ยังไม่มีงาน" />
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <Card key={t.id} className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-100">{t.title}</p>
                {t.description && <p className="text-sm text-slate-300">{t.description}</p>}
                <p className="mt-1 text-xs text-slate-400">
                  → {t.assignedToName} {t.dueDate && `· กำหนด ${fmtDate(t.dueDate)}`}
                </p>
              </div>
              <Badge className={TASK_STATUS[t.status].cls}>{TASK_STATUS[t.status].label}</Badge>
              <div className="flex gap-1">
                {t.status !== "completed" && (
                  <Button variant="outline" onClick={() => updateDoc(doc(db, "tasks", t.id), { status: "completed" })}>
                    ✓
                  </Button>
                )}
                <Button variant="ghost" onClick={() => confirm("ลบงานนี้?") && deleteDoc(doc(db, "tasks", t.id))} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                  🗑️
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
