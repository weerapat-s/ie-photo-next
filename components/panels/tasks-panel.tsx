"use client";
// components/panels/tasks-panel.tsx — มอบหมาย/ติดตามงานของทีม
// (เดิมเป็นหน้า /tasks — ย้ายมาเป็นแท็บใน /team)
import { useState } from "react";
import {
  collection,
  query,
  orderBy,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  Timestamp,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { describeWriteError } from "@/lib/errors";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection, useNow } from "@/lib/hooks";
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
  useToast,
} from "@/components/ui";
import { fmtDate, fmtRelative, TASK_STATUS } from "@/lib/format";
import type { BookingDoc, TaskDoc, TaskStatus, UserDoc, WithId } from "@/lib/types";


export default function TasksPanel() {
  const { user, profile } = useAuth();
  const { show, node: toastNode } = useToast();
  const now = useNow(60_000);

  const { data: tasks, loading } = useCollection<TaskDoc>(
    () => query(collection(db, "tasks"), orderBy("createdAt", "desc")),
    []
  );
  const { data: users } = useCollection<UserDoc>(() => query(collection(db, "users"), orderBy("studentId")), []);
  const { data: bookings } = useCollection<BookingDoc>(
    () => query(collection(db, "bookings"), orderBy("createdAt", "desc")),
    []
  );

  const [creating, setCreating] = useState(false);
  // เดิมเป็นชิป 5 อันให้กดสลับดูทีละสถานะ — งานที่ค้างอยู่เลยถูกซ่อนจากสายตา
  // ตอนนี้งานที่ยังไม่เสร็จโชว์หมดในลิสต์เดียว ส่วนงานที่ปิดแล้วพับเก็บไว้ท้ายสุด
  const [showDone, setShowDone] = useState(false);
  const [err, setErr] = useState("");

  const isOpen = (t: TaskDoc) => t.status !== "completed" && t.status !== "cancelled";
  const done = tasks.filter((t) => !isOpen(t));
  // เรียงตามความด่วน: มีกำหนดส่งขึ้นก่อน ใกล้ครบกำหนดอยู่บนสุด
  const openTasks = tasks.filter(isOpen).sort((a, b) => {
    const da = a.dueDate?.toMillis() ?? Infinity;
    const db_ = b.dueDate?.toMillis() ?? Infinity;
    return da - db_;
  });
  const shown = showDone ? [...openTasks, ...done] : openTasks;

  async function setStatus(id: string, status: TaskStatus) {
    try {
      await updateDoc(doc(db, "tasks", id), { status });
    } catch (e) {
      setErr(describeWriteError(e, "อัปเดตสถานะ"));
    }
  }

  async function remove(t: WithId<TaskDoc>) {
    if (!confirm(`ลบงาน "${t.title}"?`)) return;
    try {
      await deleteDoc(doc(db, "tasks", t.id));
      show("ลบงานแล้ว");
    } catch (e) {
      setErr(describeWriteError(e, "ลบ"));
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="t-body text-[var(--muted-ink)]">
          <b className="t-num text-[var(--ink)]">{tasks.filter(isOpen).length}</b> งานค้าง จากทั้งหมด{" "}
          <b className="t-num text-[var(--ink)]">{tasks.length}</b>
        </p>
        <Button onClick={() => setCreating(true)} icon="add">
          มอบหมายงาน
        </Button>
      </div>

      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      {/* สรุปแทนชิปกรอง — เห็นภาพรวมโดยไม่ต้องกดสลับ */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge className="tone-brand" icon="task">
          ค้างอยู่ {openTasks.length}
        </Badge>
        <Badge className="tone-mute">
          กำลังทำ {tasks.filter((t) => t.status === "in_progress").length}
        </Badge>
        {done.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "ซ่อนงานที่ปิดแล้ว" : `ดูงานที่ปิดแล้ว (${done.length})`}
          </Button>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState icon="success" text="ไม่มีงานค้าง" action={<Button onClick={() => setCreating(true)}>มอบหมายงานใหม่</Button>} />
      ) : (
        <div className="stagger space-y-2.5">
          {shown.map((t, i) => {
            const overdue = t.dueDate && isOpen(t) && t.dueDate.toMillis() < now;
            return (
              <Card key={t.id} style={{ ["--i" as string]: Math.min(i, 12) }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[var(--ink)]">{t.title}</p>
                    {t.description && (
                      <p className="mt-1 whitespace-pre-line text-sm text-[var(--ink)]/75">{t.description}</p>
                    )}
                    <p className="mt-1.5 text-xs text-[var(--muted-ink)]">
                      → {t.assignedToName || "ไม่ระบุ"}
                      {t.dueDate && ` · กำหนด ${fmtDate(t.dueDate)} (${fmtRelative(t.dueDate)})`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge className={TASK_STATUS[t.status].cls}>{TASK_STATUS[t.status].label}</Badge>
                    {overdue && <Badge className="bg-red-100 text-red-700 border border-red-200">เลยกำหนด</Badge>}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-black/6 pt-3">
                  {t.status !== "completed" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(t.id, "completed")}>
                      ปิดงาน
                    </Button>
                  )}
                  {t.status !== "cancelled" && t.status !== "completed" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(t.id, "cancelled")}>
                      ยกเลิก
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(t)} className="ml-auto text-red-600">
                    
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {creating && user && (
        <TaskModal
          users={users}
          bookings={bookings}
          createdBy={{
            uid: user.uid,
            name: `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() || "แอดมิน",
          }}
          onClose={() => setCreating(false)}
          onSaved={() => show("สร้างงานแล้ว")}
        />
      )}

      {toastNode}
    </div>
  );
}

function TaskModal({
  users,
  bookings,
  createdBy,
  onClose,
  onSaved,
}: {
  users: WithId<UserDoc>[];
  bookings: WithId<BookingDoc>[];
  createdBy: { uid: string; name: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignee, setAssignee] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function create() {
    if (!title.trim()) return setErr("กรุณาตั้งชื่องาน");
    if (!assignee) return setErr("กรุณาเลือกผู้รับผิดชอบ");
    setBusy(true);
    setErr("");
    try {
      const target = users.find((u) => u.id === assignee);
      await addDoc(collection(db, "tasks"), {
        title: title.trim(),
        description: desc.trim() || null,
        assignedById: createdBy.uid,
        assignedByName: createdBy.name,
        assignedToId: assignee,
        assignedToName: target ? `${target.firstName} ${target.lastName}`.trim() || target.studentId : "",
        bookingId: bookingId || null,
        status: "pending",
        dueDate: due ? Timestamp.fromDate(new Date(due)) : null,
        createdAt: serverTimestamp(),
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(describeWriteError(e, "สร้างงาน"));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="มอบหมายงานใหม่">
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}
      <Field label="ชื่องาน" required>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} maxLength={140} placeholder="เช่น ถ่ายงานปฐมนิเทศ" />
      </Field>
      <Field label="รายละเอียด">
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className={inputClass} maxLength={800} />
      </Field>
      <Field label="มอบหมายให้" required>
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inputClass}>
          <option value="">— เลือกสมาชิก —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {`${u.firstName} ${u.lastName}`.trim() || u.studentId}
            </option>
          ))}
        </select>
      </Field>
      <Field label="ผูกกับการจอง" help="ไม่บังคับ — ช่วยอ้างอิงงานที่เกี่ยวข้อง">
        <select value={bookingId} onChange={(e) => setBookingId(e.target.value)} className={inputClass}>
          <option value="">— ไม่ผูก —</option>
          {bookings.slice(0, 100).map((b) => (
            <option key={b.id} value={b.id}>
              {b.itemName} · {b.userName} · {fmtDate(b.startAt)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="กำหนดส่ง">
        <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={inputClass} />
      </Field>
      <Button onClick={create} loading={busy} fullWidth size="lg" className="mt-2">
        สร้างงาน
      </Button>
    </Modal>
  );
}
