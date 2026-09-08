"use client";
// app/(member)/deliveries/page.tsx — ระบบส่งงาน + ลิงก์ NAS
// แอดมิน: สร้าง/แก้งาน วางลิงก์อัปโหลดกับลิงก์ดาวน์โหลด
// สมาชิก: เห็นงานที่ตัวเองเป็นลูกค้า (ลิงก์ดาวน์โหลด) หรือเป็นทีมงาน (ลิงก์อัปโหลด)
import { useMemo, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { describeWriteError } from "@/lib/errors";
import { useAuth } from "@/lib/firebase/auth-context";
import { useSettings } from "@/lib/settings-context";
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
  CopyLink,
  Row,
  useToast,
} from "@/components/ui";
import Icon from "@/components/icon";
import Folder from "@/components/reactbits/Folder";
import AssignPicker from "@/components/assign-picker";
import { displayName } from "@/lib/roles";
import { DELIVERY_STATUS, fmtDate, fmtDateTime, fmtRelative } from "@/lib/format";
import type {
  BookingDoc,
  DeliveryDoc,
  DeliveryStatus,
  UserDoc,
  WithId,
} from "@/lib/types";

const STATUS_FLOW: DeliveryStatus[] = ["awaiting_upload", "uploaded", "delivered", "archived"];

export default function DeliveriesPanel() {
  const { user, role } = useAuth();
  const { settings } = useSettings();
  const isAdmin = role === "admin" || role === "super_admin";
  const { show, node: toastNode } = useToast();
  const now = useNow(60_000);

  // แอดมินเห็นทุกงาน · สมาชิกเห็นเฉพาะงานของตัวเอง (2 query แล้วรวม)
  const { data: allDeliveries, loading: loadAll } = useCollection<DeliveryDoc>(
    () => (isAdmin ? query(collection(db, "deliveries"), orderBy("createdAt", "desc")) : null),
    [isAdmin]
  );
  const { data: asCustomer, loading: loadCustomer } = useCollection<DeliveryDoc>(
    () =>
      !isAdmin && user
        ? query(collection(db, "deliveries"), where("customerUserId", "==", user.uid))
        : null,
    [isAdmin, user?.uid]
  );
  const { data: asCrew, loading: loadCrew } = useCollection<DeliveryDoc>(
    () =>
      !isAdmin && user
        ? query(collection(db, "deliveries"), where("assignedToId", "==", user.uid))
        : null,
    [isAdmin, user?.uid]
  );

  const { data: users } = useCollection<UserDoc>(
    () => (isAdmin ? query(collection(db, "users"), orderBy("studentId")) : null),
    [isAdmin]
  );
  const { data: bookings } = useCollection<BookingDoc>(
    () => (isAdmin ? query(collection(db, "bookings"), orderBy("createdAt", "desc")) : null),
    [isAdmin]
  );

  const loading = isAdmin ? loadAll : loadCustomer || loadCrew;

  const deliveries = useMemo(() => {
    if (isAdmin) return allDeliveries;
    // รวม 2 ชุดแล้วตัดซ้ำ (คนเดียวเป็นทั้งลูกค้าและทีมงานได้)
    const map = new Map<string, WithId<DeliveryDoc>>();
    for (const d of [...asCustomer, ...asCrew]) map.set(d.id, d);
    return [...map.values()].sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
    );
  }, [isAdmin, allDeliveries, asCustomer, asCrew]);

  const [showClosed, setShowClosed] = useState(false);
  const [editing, setEditing] = useState<WithId<DeliveryDoc> | null>(null);
  const [creating, setCreating] = useState(false);
  /** งานส่งที่กำลังเลือกผู้รับผิดชอบ (กดมอบหมายจากการ์ดได้เลย) */
  const [assigning, setAssigning] = useState<WithId<DeliveryDoc> | null>(null);
  const [viewing, setViewing] = useState<WithId<DeliveryDoc> | null>(null);
  const [err, setErr] = useState("");

  // เดิมกรองทีละสถานะ ทำให้งานที่ยังไม่ปิดกระจายอยู่คนละชิป ต้องกดไล่ดู
  // ตอนนี้งานที่ยังไม่จบโชว์หมดในลิสต์เดียว เรียงตามกำหนดส่ง
  // ส่วนงานที่ส่งครบแล้วพับเก็บไว้ ไม่ต้องเห็นทุกวัน
  const closed = deliveries.filter((d) => d.status === "delivered" || d.status === "archived");
  const openList = deliveries
    .filter((d) => d.status !== "delivered" && d.status !== "archived")
    .sort((a, b) => (a.dueAt?.toMillis() ?? Infinity) - (b.dueAt?.toMillis() ?? Infinity));
  const shown = showClosed ? [...openList, ...closed] : openList;

  async function advance(d: WithId<DeliveryDoc>) {
    const i = STATUS_FLOW.indexOf(d.status);
    const next = STATUS_FLOW[Math.min(i + 1, STATUS_FLOW.length - 1)];
    if (next === d.status) return;
    try {
      await updateDoc(doc(db, "deliveries", d.id), { status: next, updatedAt: serverTimestamp() });
      show(`เปลี่ยนเป็น "${DELIVERY_STATUS[next].label}"`);
    } catch (e) {
      setErr(describeWriteError(e, "อัปเดตสถานะ"));
    }
  }

  /** ทีมงานกดยืนยันว่าอัปไฟล์เสร็จแล้ว */
  async function markUploaded(d: WithId<DeliveryDoc>) {
    try {
      await updateDoc(doc(db, "deliveries", d.id), { status: "uploaded", updatedAt: serverTimestamp() });
      show("แจ้งว่าอัปไฟล์แล้ว");
    } catch (e) {
      setErr(describeWriteError(e, "อัปเดต"));
    }
  }

  /** มอบหมายงานส่ง — หลายคนได้ กดจากการ์ดได้เลยไม่ต้องเปิดฟอร์มทั้งใบ
   *  assignedToId เขียนเป็นคนแรกไว้ให้ข้อมูล/กฎเดิมที่ยังอ้างถึงมันทำงานต่อได้ */
  async function assign(d: WithId<DeliveryDoc>, uids: string[]) {
    const lead = uids[0] ?? null;
    const leadUser = lead ? users.find((u) => u.id === lead) : undefined;
    try {
      await updateDoc(doc(db, "deliveries", d.id), {
        assigneeIds: uids,
        assignedToId: lead,
        assignedToName: leadUser ? displayName(leadUser) : null,
        updatedAt: serverTimestamp(),
      });
      show(uids.length ? `มอบหมาย ${uids.length} คน` : `ยกเลิกผู้รับผิดชอบ "${d.title}"`);
    } catch (e) {
      setErr(describeWriteError(e, "มอบหมาย"));
    }
  }

  async function remove(d: WithId<DeliveryDoc>) {
    if (!confirm(`ลบงานส่ง "${d.title}"?`)) return;
    try {
      await deleteDoc(doc(db, "deliveries", d.id));
      show("ลบแล้ว");
    } catch (e) {
      setErr(describeWriteError(e, "ลบ"));
    }
  }

  return (
    <div>
      {isAdmin && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="t-body text-[var(--muted-ink)]">
            <b className="t-num text-[var(--ink)]">{deliveries.length}</b> งานส่งทั้งหมด
          </p>
          <Button onClick={() => setCreating(true)} icon="add">
            สร้างงานส่ง
          </Button>
        </div>
      )}

      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      {/* สรุปแทนชิปกรอง — งานที่ยังไม่จบต้องเห็นพร้อมกันหมด */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge className="tone-brand" icon="delivery">
          ยังไม่จบ {openList.length}
        </Badge>
        {openList.filter((d) => d.dueAt && d.dueAt.toMillis() < now).length > 0 && (
          <Badge className="tone-bad" icon="overdue">
            เลยกำหนด {openList.filter((d) => d.dueAt && d.dueAt.toMillis() < now).length}
          </Badge>
        )}
        {closed.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? "ซ่อนงานที่ส่งแล้ว" : `ดูงานที่ส่งแล้ว (${closed.length})`}
          </Button>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="delivery"
          text={isAdmin ? "ยังไม่มีงานส่งในหมวดนี้" : "ยังไม่มีงานที่ส่งมอบให้คุณ"}
          action={isAdmin ? <Button onClick={() => setCreating(true)}>สร้างงานแรก</Button> : undefined}
        />
      ) : (
        <div className="stagger space-y-3">
          {shown.map((d, i) => {
            const iAmCrew =
              d.assignedToId === user?.uid || (d.assigneeIds ?? []).includes(user?.uid ?? "");
            const st = DELIVERY_STATUS[d.status];
            const overdue =
              d.dueAt && d.status !== "delivered" && d.status !== "archived" && d.dueAt.toMillis() < now;

            return (
              <Card key={d.id} style={{ ["--i" as string]: Math.min(i, 12) }}>
                <div className="flex items-start gap-4">
                  {/* โฟลเดอร์เปิดได้ — แตะแล้วกระดาษเด้งออก */}
                  <div className="hidden shrink-0 pt-1 sm:block">
                    <Folder
                      size={0.62}
                      color={d.status === "delivered" ? "#10b981" : settings.accentColor}
                      items={[
                        <span key="1" className="px-1 text-center text-[8px] leading-tight">
                          {d.customerName}
                        </span>,
                        <span key="2" className="text-[8px]">
                          {fmtDate(d.dueAt)}
                        </span>,
                        <span key="3">
                          <Icon name={d.downloadUrl ? "link" : "pending"} size={16} />
                        </span>,
                      ]}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-[var(--ink)]">{d.title}</h3>
                      <Badge className={st.cls}>{st.label}</Badge>
                      {iAmCrew && (
                        <Badge className="bg-[var(--faculty)]/10 text-[var(--faculty)] border border-[var(--faculty)]/20">
                          คุณรับผิดชอบ
                        </Badge>
                      )}
                      {overdue && <Badge className="bg-red-100 text-red-700 border border-red-200">เลยกำหนด</Badge>}
                    </div>

                    <p className="t-body mt-1 text-[var(--muted-ink)]">ผู้รับไฟล์: {d.customerName}</p>

                    {/* ผู้รับผิดชอบ — แอดมินกดเปลี่ยนได้ตรงนี้เลย ไม่ต้องเข้าโหมดแก้ไข */}
                    {isAdmin ? (
                      <button
                        onClick={() => setAssigning(d)}
                        className={`press mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          (d.assigneeIds?.length ?? (d.assignedToId ? 1 : 0)) > 0 ? "tone-ok" : "tone-warn"
                        }`}
                      >
                        <Icon name="user" size={16} />
                        {(() => {
                          const ids = d.assigneeIds ?? (d.assignedToId ? [d.assignedToId] : []);
                          if (ids.length === 0) return "ยังไม่มีผู้รับผิดชอบ — กดมอบหมาย";
                          const first = users.find((u) => u.id === ids[0]);
                          const name = first ? displayName(first) : (d.assignedToName ?? "ทีมงาน");
                          return ids.length > 1 ? `${name} +${ids.length - 1}` : name;
                        })()}
                        <Icon name="chevronDown" size={16} />
                      </button>
                    ) : (
                      d.assignedToName && (
                        <p className="t-caption mt-1 flex items-center gap-1.5">
                          <Icon name="user" size={16} /> ทีมงาน: {d.assignedToName}
                        </p>
                      )
                    )}
                    {d.dueAt && (
                      <p className="text-xs text-[var(--muted-ink)]">
                        กำหนดส่ง {fmtDate(d.dueAt)} ({fmtRelative(d.dueAt)})
                      </p>
                    )}
                    {d.note && <p className="mt-2 whitespace-pre-line text-sm text-[var(--ink)]/80">{d.note}</p>}

                    {/* ลิงก์อัปโหลด — เฉพาะแอดมินกับทีมงานที่รับผิดชอบ */}
                    {d.uploadUrl && (isAdmin || iAmCrew) && (
                      <div className="mt-3">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">
                          ลิงก์อัปไฟล์ขึ้น NAS
                        </p>
                        <CopyLink url={d.uploadUrl} label={d.uploadUrl.replace(/^https?:\/\//, "")} />
                        {settings.nasUploadHint && (
                          <p className="mt-1 text-xs text-[var(--muted-ink)]">{settings.nasUploadHint}</p>
                        )}
                      </div>
                    )}

                    {/* ลิงก์ดาวน์โหลด — โชว์เมื่อส่งงานแล้วเท่านั้น (ลูกค้า) */}
                    {d.downloadUrl && (isAdmin || d.status === "delivered" || iAmCrew) && (
                      <div className="mt-3">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">
                          ลิงก์รับไฟล์
                        </p>
                        <CopyLink url={d.downloadUrl} label={d.downloadUrl.replace(/^https?:\/\//, "")} />
                        {d.passcode && (
                          <p className="mt-1 text-xs text-[var(--muted-ink)]">
                            รหัสผ่านลิงก์: <span className="font-mono font-semibold text-[var(--ink)]">{d.passcode}</span>
                          </p>
                        )}
                        {d.expiresAt && (
                          <p className="text-xs text-[var(--muted-ink)]">ลิงก์หมดอายุ {fmtDate(d.expiresAt)}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-black/6 pt-3">
                  <Button size="sm" variant="outline" onClick={() => setViewing(d)}>
                    รายละเอียด
                  </Button>
                  {!isAdmin && iAmCrew && d.status === "awaiting_upload" && (
                    <Button size="sm" onClick={() => markUploaded(d)}>
                      อัปไฟล์เสร็จแล้ว
                    </Button>
                  )}
                  {isAdmin && (
                    <>
                      <Button size="sm" variant="outline" icon="edit" onClick={() => setEditing(d)}>
                        แก้ไข
                      </Button>
                      {d.status !== "archived" && (
                        <Button size="sm" onClick={() => advance(d)}>
                          → {DELIVERY_STATUS[STATUS_FLOW[STATUS_FLOW.indexOf(d.status) + 1]].label}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => remove(d)} className="ml-auto text-red-600">
                        
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={viewing.title}>
          <Row label="สถานะ">{DELIVERY_STATUS[viewing.status].label}</Row>
          <Row label="ผู้รับไฟล์">{viewing.customerName}</Row>
          <Row label="ติดต่อ">{viewing.customerContact || "—"}</Row>
          <Row label="ทีมงาน">{viewing.assignedToName || "—"}</Row>
          <Row label="กำหนดส่ง">{fmtDate(viewing.dueAt)}</Row>
          <Row label="ลิงก์หมดอายุ">{fmtDate(viewing.expiresAt)}</Row>
          <Row label="สร้างเมื่อ">{fmtDateTime(viewing.createdAt)}</Row>
          {viewing.note && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">บันทึก</p>
              <p className="mt-1 whitespace-pre-line text-sm">{viewing.note}</p>
            </div>
          )}
          <Button onClick={() => setViewing(null)} fullWidth className="mt-5">
            ปิด
          </Button>
        </Modal>
      )}

      {isAdmin && (creating || editing) && (
        <DeliveryEditor
          delivery={editing}
          users={users}
          bookings={bookings}
          now={now}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => show("บันทึกงานส่งแล้ว")}
        />
      )}

      {isAdmin && (
        <AssignPicker
          open={!!assigning}
          onClose={() => setAssigning(null)}
          users={users}
          title={assigning ? `ใครรับผิดชอบ "${assigning.title}"` : "มอบหมายให้"}
          selected={assigning?.assigneeIds ?? (assigning?.assignedToId ? [assigning.assignedToId] : [])}
          onSave={(uids) => assigning && assign(assigning, uids)}
        />
      )}

      {toastNode}
    </div>
  );
}

/* ═══ ฟอร์มสร้าง/แก้งานส่ง (แอดมิน) ═══════════════════════════ */
function DeliveryEditor({
  delivery,
  users,
  bookings,
  now,
  onClose,
  onSaved,
}: {
  delivery: WithId<DeliveryDoc> | null;
  users: WithId<UserDoc>[];
  bookings: WithId<BookingDoc>[];
  now: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const { settings } = useSettings();

  const toLocal = (ts: Timestamp | null | undefined) =>
    ts ? new Date(ts.toMillis() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) : "";

  // ค่ากำหนดส่งเริ่มต้น — คำนวณจาก now ที่ส่งมาจากหน้าแม่ (เรียก Date.now() ตอน render ไม่ได้)
  const defaultDue = () => {
    const d = new Date(now + settings.deliveryDefaultDays * 86_400_000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };

  const [title, setTitle] = useState(delivery?.title ?? "");
  const [bookingId, setBookingId] = useState(delivery?.bookingId ?? "");
  const [customerName, setCustomerName] = useState(delivery?.customerName ?? "");
  const [customerContact, setCustomerContact] = useState(delivery?.customerContact ?? "");
  const [customerUserId, setCustomerUserId] = useState(delivery?.customerUserId ?? "");
  const [assignedToId, setAssignedToId] = useState(delivery?.assignedToId ?? "");
  const [uploadUrl, setUploadUrl] = useState(delivery?.uploadUrl ?? "");
  const [downloadUrl, setDownloadUrl] = useState(delivery?.downloadUrl ?? "");
  const [passcode, setPasscode] = useState(delivery?.passcode ?? "");
  const [note, setNote] = useState(delivery?.note ?? "");
  const [status, setStatus] = useState<DeliveryStatus>(delivery?.status ?? "awaiting_upload");
  const [dueAt, setDueAt] = useState(delivery ? toLocal(delivery.dueAt) : defaultDue());
  const [expiresAt, setExpiresAt] = useState(delivery ? toLocal(delivery.expiresAt) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  /** เลือกการจอง → เติมชื่อ/เบอร์ลูกค้าให้อัตโนมัติ */
  function pickBooking(id: string) {
    setBookingId(id);
    const b = bookings.find((x) => x.id === id);
    if (!b) return;
    setTitle((t) => t || `${b.itemName} — ${b.userName}`);
    setCustomerName(b.userName);
    setCustomerContact(b.guestEmail || b.userPhone || "");
    setCustomerUserId(b.userId ?? "");
  }

  function urlLooksWrong(u: string) {
    if (!u) return false;
    if (!/^https?:\/\//i.test(u)) return true;
    if (!settings.nasBaseUrl) return false;
    try {
      return new URL(u).host !== new URL(settings.nasBaseUrl).host;
    } catch {
      return true;
    }
  }

  async function save() {
    if (!user) return;
    if (!title.trim()) return setErr("กรุณาตั้งชื่องาน");
    if (!customerName.trim()) return setErr("กรุณาระบุชื่อผู้รับไฟล์");
    if (uploadUrl && !/^https?:\/\//i.test(uploadUrl)) return setErr("ลิงก์อัปโหลดต้องขึ้นต้นด้วย http(s)://");
    if (downloadUrl && !/^https?:\/\//i.test(downloadUrl)) return setErr("ลิงก์ดาวน์โหลดต้องขึ้นต้นด้วย http(s)://");

    setBusy(true);
    setErr("");
    try {
      const assignee = users.find((u) => u.id === assignedToId);
      const payload = {
        title: title.trim(),
        bookingId: bookingId || null,
        customerUserId: customerUserId || null,
        customerName: customerName.trim(),
        customerContact: customerContact.trim(),
        assignedToId: assignedToId || null,
        assignedToName: assignee
          ? `${assignee.firstName} ${assignee.lastName}`.trim() || assignee.studentId
          : null,
        uploadUrl: uploadUrl.trim() || null,
        downloadUrl: downloadUrl.trim() || null,
        passcode: passcode.trim() || null,
        note: note.trim(),
        status,
        dueAt: dueAt ? Timestamp.fromDate(new Date(`${dueAt}T23:59:00`)) : null,
        expiresAt: expiresAt ? Timestamp.fromDate(new Date(`${expiresAt}T23:59:00`)) : null,
        updatedAt: serverTimestamp(),
      };

      if (delivery) {
        await updateDoc(doc(db, "deliveries", delivery.id), payload);
      } else {
        await addDoc(collection(db, "deliveries"), {
          ...payload,
          createdById: user.uid,
          createdAt: serverTimestamp(),
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(describeWriteError(e, "บันทึก"));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={delivery ? "แก้ไขงานส่ง" : "สร้างงานส่ง"} maxWidth="max-w-xl">
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      <Field label="ผูกกับการจอง" help="เลือกแล้วเติมชื่อผู้รับให้อัตโนมัติ">
        <select value={bookingId} onChange={(e) => pickBooking(e.target.value)} className={inputClass}>
          <option value="">— ไม่ผูก —</option>
          {bookings.slice(0, 100).map((b) => (
            <option key={b.id} value={b.id}>
              {b.itemName} · {b.userName} · {fmtDate(b.startAt)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="ชื่องาน" required>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} maxLength={140} placeholder="เช่น ภาพงานรับปริญญา รอบเช้า" />
      </Field>

      <div className="grid gap-0 sm:grid-cols-2 sm:gap-3">
        <Field label="ชื่อผู้รับไฟล์" required>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClass} maxLength={100} />
        </Field>
        <Field label="ช่องทางติดต่อ">
          <input value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} className={inputClass} maxLength={120} />
        </Field>
      </div>

      <Field label="ผูกกับสมาชิก (ถ้ามี)" help="ผูกแล้วสมาชิกคนนั้นเห็นงานนี้ในหน้า ของฉัน">
        <select value={customerUserId} onChange={(e) => setCustomerUserId(e.target.value)} className={inputClass}>
          <option value="">— ไม่ผูก —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {`${u.firstName} ${u.lastName}`.trim() || u.studentId}
            </option>
          ))}
        </select>
      </Field>

      <Field label="ทีมงานที่รับผิดชอบอัปไฟล์">
        <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className={inputClass}>
          <option value="">— ยังไม่มอบหมาย —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {`${u.firstName} ${u.lastName}`.trim() || u.studentId}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="ลิงก์อัปไฟล์ (NAS)"
        help={`สร้าง share link แบบอนุญาตอัปโหลดจาก ${settings.nasBaseUrl || "NAS"} แล้ววางที่นี่`}
        error={urlLooksWrong(uploadUrl) ? "ลิงก์ไม่ได้อยู่บนโดเมน NAS ที่ตั้งไว้ — ตรวจอีกครั้ง" : undefined}
      >
        <input value={uploadUrl} onChange={(e) => setUploadUrl(e.target.value)} className={inputClass} placeholder="https://nextcloud.ienas.site/s/xxxxxxxx" />
      </Field>

      <Field
        label="ลิงก์รับไฟล์ (ให้ผู้รับ)"
        error={urlLooksWrong(downloadUrl) ? "ลิงก์ไม่ได้อยู่บนโดเมน NAS ที่ตั้งไว้ — ตรวจอีกครั้ง" : undefined}
      >
        <input value={downloadUrl} onChange={(e) => setDownloadUrl(e.target.value)} className={inputClass} placeholder="https://nextcloud.ienas.site/s/yyyyyyyy" />
      </Field>

      <Field label="รหัสผ่านของลิงก์" help="ถ้าตั้งรหัสไว้ใน Nextcloud ให้ใส่ที่นี่เพื่อส่งต่อให้ผู้รับ">
        <input value={passcode} onChange={(e) => setPasscode(e.target.value)} className={inputClass} maxLength={60} />
      </Field>

      <div className="grid gap-0 sm:grid-cols-2 sm:gap-3">
        <Field label="กำหนดส่งงาน">
          <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={inputClass} />
        </Field>
        <Field label="ลิงก์หมดอายุ">
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <Field label="สถานะ">
        <select value={status} onChange={(e) => setStatus(e.target.value as DeliveryStatus)} className={inputClass}>
          {STATUS_FLOW.map((s) => (
            <option key={s} value={s}>
              {DELIVERY_STATUS[s].label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="บันทึก / คำสั่งเพิ่มเติม">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={inputClass} maxLength={800} />
      </Field>

      <Button onClick={save} loading={busy} fullWidth size="lg" className="mt-2">
        บันทึก
      </Button>
    </Modal>
  );
}
