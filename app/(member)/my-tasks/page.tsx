"use client";
// app/(member)/my-tasks/page.tsx — งานที่ได้รับมอบหมาย + อัปเดตสถานะ
import { collection, query, where, orderBy, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection } from "@/lib/hooks";
import { PageHeader, Card, Badge, Spinner, Button, EmptyState } from "@/components/ui";
import { fmtDate, TASK_STATUS } from "@/lib/format";
import type { TaskDoc } from "@/lib/types";

export default function MyTasksPage() {
  const { user } = useAuth();
  const { data: tasks, loading } = useCollection<TaskDoc>(
    () =>
      user ? query(collection(db, "tasks"), where("assignedToId", "==", user.uid), orderBy("createdAt", "desc")) : null,
    [user?.uid]
  );

  async function setStatus(id: string, status: TaskDoc["status"]) {
    await updateDoc(doc(db, "tasks", id), { status });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="งานของฉัน" subtitle="งานที่ได้รับมอบหมาย" />

      {loading ? (
        <Spinner />
      ) : tasks.length === 0 ? (
        <EmptyState icon="✅" text="ยังไม่มีงานที่ได้รับมอบหมาย" />
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <Card key={t.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{t.title}</p>
                  {t.description && <p className="mt-1 text-sm text-neutral-600">{t.description}</p>}
                  <p className="mt-1 text-xs text-neutral-400">
                    มอบโดย {t.assignedByName} {t.dueDate && `· กำหนด ${fmtDate(t.dueDate)}`}
                  </p>
                </div>
                <Badge className={TASK_STATUS[t.status].cls}>{TASK_STATUS[t.status].label}</Badge>
              </div>
              {t.status !== "completed" && t.status !== "cancelled" && (
                <div className="mt-3 flex gap-2 border-t border-neutral-100 pt-3">
                  {t.status === "pending" && (
                    <Button variant="outline" onClick={() => setStatus(t.id, "in_progress")}>
                      เริ่มทำ
                    </Button>
                  )}
                  <Button onClick={() => setStatus(t.id, "completed")}>ทำเสร็จแล้ว</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
