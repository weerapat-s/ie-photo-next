"use client";
// components/panels/open-jobs-panel.tsx — งานถ่ายที่เปิดให้ทีมงานกดรับ
//
// เห็นเฉพาะคนที่ถูกเพิ่มเป็นทีมงานแล้ว (มี doc crew/{uid})
// firestore.rules ยอมให้แก้ได้แค่ assigneeIds และเฉพาะ uid ตัวเองเท่านั้น
// — เข้าร่วม/ถอนตัวเองได้ แต่ถอดคนอื่นหรือแตะข้อมูลการจองอื่นไม่ได้เลย
// 1 งานมีทีมงานได้หลายคน (ตามจำนวนที่ระบุ) · 1 คนรับได้หลายงาน
// ระบบนี้ไม่มีบัญชีลูกค้า — "ผู้ขอถ่าย" เป็นแค่ชื่อ+เบอร์ติดต่อ ไม่ใช่บัญชี
import { useMemo, useState } from "react";
import { collection, query, where, orderBy, doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection, useDocument, useNow } from "@/lib/hooks";
import { Spinner, EmptyState, Badge, Button, Alert, ChipBar, useToast } from "@/components/ui";
import Icon from "@/components/icon";
import { fmtRange, fmtRelative } from "@/lib/format";
import { busyDaysInRange, shortDay, buildBusyMap } from "@/lib/availability";
import type { AvailabilityDoc, BookingDoc, WithId } from "@/lib/types";

type Filter = "open" | "mine" | "all";

export default function OpenJobsPanel() {
  const { user } = useAuth();
  const now = useNow(60_000);
  const { show, node: toastNode } = useToast();

  // เป็นทีมงานหรือไม่ — ถ้าไม่ใช่ Firestore จะปฏิเสธ query ด้านล่างอยู่แล้ว
  // แต่เช็คก่อนเพื่อขึ้นข้อความที่เข้าใจง่ายแทน error
  const { data: crewMark, loading: loadingMark } = useDocument<{ photographerId: string }>(
    () => (user ? doc(db, "crew", user.uid) : null),
    [user?.uid]
  );

  const { data: jobs, loading, error } = useCollection<BookingDoc>(
    () =>
      crewMark
        ? query(
            collection(db, "bookings"),
            where("bookingType", "==", "photographer"),
            where("status", "==", "approved"),
            orderBy("startAt")
          )
        : null,
    [crewMark?.id]
  );

  // วันที่ตัวเองกันไว้ — ใช้กันไม่ให้กดรับงานที่ชนกับธุระที่แจ้งไว้เอง
  const { data: availability } = useCollection<AvailabilityDoc>(
    () => (user ? collection(db, "availability") : null),
    [user?.uid]
  );
  const busyMap = useMemo(() => buildBusyMap(availability), [availability]);

  const clashOf = (j: BookingDoc) =>
    user ? busyDaysInRange(busyMap, user.uid, j.startAt.toMillis(), j.endAt.toMillis()) : [];

  const [filter, setFilter] = useState<Filter>("open");
  const mine = (j: BookingDoc) => (j.assigneeIds ?? []).includes(user?.uid ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const upcoming = useMemo(() => jobs.filter((j) => j.endAt.toMillis() > now), [jobs, now]);
  const shown = useMemo(() => {
    // "เปิดรับ" = ยังไม่ครบจำนวนที่ระบุ และเรายังไม่ได้อยู่ในงาน
    if (filter === "open")
      return upcoming.filter((j) => {
        const n = (j.assigneeIds ?? []).length;
        return !mine(j) && n < (j.crewSize ?? 1);
      });
    if (filter === "mine") return upcoming.filter(mine);
    return upcoming;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcoming, filter, user?.uid]);

  // arrayUnion/arrayRemove ให้เซิร์ฟเวอร์รวม array เอง — คนกดพร้อมกันจึงไม่ทับกัน
  async function joinJob(j: WithId<BookingDoc>) {
    if (!user || busy) return;
    // กันรับงานทับวันที่ตัวเองแจ้งว่าไม่ว่าง — ถ้าเปลี่ยนใจต้องไปแก้วันว่างก่อน
    // (เตือนเฉย ๆ ไม่พอ เคยมีคนกดรับแล้วลืมว่าติดธุระ กรรมการมารู้ตอนวันงาน)
    const clash = clashOf(j);
    if (clash.length > 0) {
      setErr(
        `รับงานนี้ไม่ได้ — คุณกันวันที่ ${clash.map(shortDay).join(", ")} ไว้ว่าไม่ว่าง ` +
          `ถ้าว่างแล้วให้ไปแก้ที่หน้า "วันว่าง" ก่อน`
      );
      return;
    }
    setBusy(j.id);
    setErr("");
    try {
      await updateDoc(doc(db, "bookings", j.id), { assigneeIds: arrayUnion(user.uid) });
      show("เข้าร่วมงานแล้ว");
    } catch {
      setErr("เข้าร่วมไม่สำเร็จ — ลองรีเฟรชหน้าแล้วกดใหม่");
    } finally {
      setBusy(null);
    }
  }

  async function leaveJob(j: WithId<BookingDoc>) {
    if (!user || busy) return;
    if (!confirm(`ถอนตัวจากงาน "${j.usageType || j.itemName}"?`)) return;
    setBusy(j.id);
    setErr("");
    try {
      await updateDoc(doc(db, "bookings", j.id), { assigneeIds: arrayRemove(user.uid) });
      show("ถอนตัวแล้ว");
    } catch {
      setErr("ถอนตัวไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  if (loadingMark) return <Spinner />;

  if (!crewMark) {
    return (
      <EmptyState
        icon="photographer"
        text="หน้านี้สำหรับทีมตากล้อง — ติดต่อกรรมการเพื่อเพิ่มคุณเข้าทีมก่อน"
      />
    );
  }

  return (
    <div>
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      <ChipBar
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={[
          {
            key: "open",
            label: "เปิดรับ",
            count: upcoming.filter((j) => !mine(j) && (j.assigneeIds ?? []).length < (j.crewSize ?? 1)).length,
          },
          { key: "mine", label: "งานที่ฉันรับ", count: upcoming.filter(mine).length },
          { key: "all", label: "ทั้งหมด", count: upcoming.length },
        ]}
      />

      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState icon="warning" text="โหลดงานไม่สำเร็จ — ต้อง deploy firestore.rules รุ่นใหม่ก่อน" />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="approved"
          text={filter === "open" ? "ยังไม่มีงานที่เปิดรับตอนนี้" : "ยังไม่มีงานในหมวดนี้"}
        />
      ) : (
        <ul className="surface-flat divide-y divide-[var(--hairline)] overflow-hidden rounded-3xl">
          {shown.map((j) => {
            const joined = mine(j);
            const count = (j.assigneeIds ?? []).length;
            const need = j.crewSize ?? 1;
            const full = count >= need;
            return (
              <li key={j.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="t-heading text-[var(--ink)]">{j.usageType || "งานถ่ายภาพ"}</p>
                    <p className="t-body text-[var(--muted-ink)]">{fmtRange(j.startAt, j.endAt)}</p>
                    {j.location && (
                      <p className="t-caption mt-0.5 flex items-center gap-1.5">
                        <Icon name="studio" size={16} /> {j.location}
                      </p>
                    )}
                    {(j.userName || j.crewSize) && (
                      <p className="t-caption mt-0.5">
                        {j.userName ? `ผู้ขอถ่าย: ${j.userName}` : ""}
                        {j.userName && j.crewSize ? " · " : ""}
                        {j.crewSize ? `ขอ ${j.crewSize} คน` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge className="tone-brand">{fmtRelative(j.startAt)}</Badge>
                    {joined && (
                      <Badge className="tone-ok" icon="approved">
                        คุณเข้าร่วมแล้ว
                      </Badge>
                    )}
                    <Badge className={full ? "tone-mute" : "tone-warn"}>
                      ทีม {count}/{need}
                    </Badge>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] pt-3">
                  {joined ? (
                    <>
                      {j.userPhone && (
                        <a
                          href={`tel:${j.userPhone}`}
                          className="btn-glass press inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-semibold"
                        >
                          <Icon name="phone" size={16} /> โทรหาผู้ประสานงาน
                        </a>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => leaveJob(j)}
                        loading={busy === j.id}
                        className="ml-auto text-[var(--muted-ink)]"
                      >
                        ถอนตัว
                      </Button>
                    </>
                  ) : full ? (
                    <p className="t-caption">ทีมครบแล้ว</p>
                  ) : clashOf(j).length > 0 ? (
                    <p className="t-caption flex items-center gap-1.5 text-[var(--tone-warn-ink)]">
                      <Icon name="warning" size={16} />
                      คุณกันวันนี้ไว้ว่าไม่ว่าง — แก้ที่หน้า “วันว่าง” ถ้าจะรับงาน
                    </p>
                  ) : (
                    <Button size="sm" icon="approved" onClick={() => joinJob(j)} loading={busy === j.id} fullWidth>
                      รับงานนี้ (ยังขาด {need - count} คน)
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {toastNode}
    </div>
  );
}
