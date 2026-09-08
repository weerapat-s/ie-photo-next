"use client";
// app/(member)/my-tasks/page.tsx — งานที่ได้รับมอบหมาย + อัปเดตสถานะ
import { useState } from "react";
import { collection, query, where, orderBy, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection, useNow } from "@/lib/hooks";
import {
  Card,
  Badge,
  Spinner,
  Button,
  EmptyState,
  ChipBar,
  Alert,
} from "@/components/ui";
import { fmtDate, fmtRelative, TASK_STATUS } from "@/lib/format";
import type { TaskDoc } from "@/lib/types";

type Filter = "open" | "all" | "completed";

export default function MyTasksPanel() {
  const { user } = useAuth();
  const { data: tasks, loading, error } = useCollection<TaskDoc>(
    () =>
      user ? query(collection(db, "tasks"), where("assignedToId", "==", user.uid), orderBy("createdAt", "desc")) : null,
    [user?.uid]
  );
  const [filter, setFilter] = useState<Filter>("open");
  const now = useNow(60_000);
  const [err, setErr] = useState("");

  const isOpen = (t: TaskDoc) => t.status !== "completed" && t.status !== "cancelled";
  const shown =
    filter === "all" ? tasks : filter === "open" ? tasks.filter(isOpen) : tasks.filter((t) => t.status === "completed");

  async function setStatus(id: string, status: TaskDoc["status"]) {
    try {
      await updateDoc(doc(db, "tasks", id), { status });
    } catch {
      setErr("อัปเดตสถานะไม่สำเร็จ");
    }
  }

  return (
    <div>
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      <ChipBar
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={[
          { key: "open", label: "ค้างอยู่", count: tasks.filter(isOpen).length },
          { key: "completed", label: "เสร็จแล้ว", count: tasks.filter((t) => t.status === "completed").length },
          { key: "all", label: "ทั้งหมด", count: tasks.length },
        ]}
      />

      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState icon="warning" text="โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้า" />
      ) : shown.length === 0 ? (
        <EmptyState icon="success" text="ไม่มีงานในหมวดนี้" />
      ) : (
        <div className="stagger space-y-3">
          {shown.map((t, i) => {
            const overdue = t.dueDate && isOpen(t) && t.dueDate.toMillis() < now;
            return (
              <Card key={t.id} style={{ ["--i" as string]: Math.min(i, 12) }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-[var(--ink)]">{t.title}</p>
                    {t.description && (
                      <p className="mt-1 whitespace-pre-line text-sm text-[var(--ink)]/75">{t.description}</p>
                    )}
                    <p className="mt-1.5 text-xs text-[var(--muted-ink)]">
                      มอบโดย {t.assignedByName}
                      {t.dueDate && ` · กำหนด ${fmtDate(t.dueDate)} (${fmtRelative(t.dueDate)})`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge className={TASK_STATUS[t.status].cls}>{TASK_STATUS[t.status].label}</Badge>
                    {overdue && <Badge className="bg-red-100 text-red-700 border border-red-200">เลยกำหนด</Badge>}
                  </div>
                </div>

                {isOpen(t) && (
                  <div className="mt-3 flex gap-2 border-t border-black/6 pt-3">
                    {t.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => setStatus(t.id, "in_progress")}>
                        เริ่มทำ
                      </Button>
                    )}
                    <Button size="sm" onClick={() => setStatus(t.id, "completed")}>
                      ทำเสร็จแล้ว
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
