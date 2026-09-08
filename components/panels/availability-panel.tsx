"use client";
// components/panels/availability-panel.tsx — ตากล้องกันวันที่ไม่ว่างเอง
//
// กติกา: **ไม่ระบุ = ว่าง** — กันเฉพาะวันที่ติดธุระ ไม่ต้องมาเช็กอินว่าว่างทุกวัน
// กรรมการเห็นวันที่กันไว้ตอนสั่งงาน ถ้าไม่ได้กัน ระบบสั่งงานได้ทันที
import { useMemo, useState } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { describeWriteError } from "@/lib/errors";
import { useAuth } from "@/lib/firebase/auth-context";
import { useDocument, useNow } from "@/lib/hooks";
import { Spinner, Alert, Button, Badge, useToast } from "@/components/ui";
import Icon from "@/components/icon";
import { dateKey, shortDay } from "@/lib/availability";
import type { AvailabilityDoc } from "@/lib/types";

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

export default function AvailabilityPanel() {
  const { user } = useAuth();
  const now = useNow(60 * 60_000); // ชั่วโมงละครั้งพอ — ใช้แค่ตัดสินว่าวันไหนผ่านไปแล้ว
  const { show, node: toastNode } = useToast();

  const { data: avail, loading } = useDocument<AvailabilityDoc>(
    () => (user ? doc(db, "availability", user.uid) : null),
    [user?.uid]
  );

  const [monthOffset, setMonthOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const busyDates = useMemo(() => new Set(avail?.busyDates ?? []), [avail]);

  const todayKey = dateKey(now);

  // ปฏิทินของเดือนที่กำลังดู — เริ่มจากวันอาทิตย์เพื่อให้ตรงหัวคอลัมน์
  const grid = useMemo(() => {
    const base = new Date(now);
    base.setDate(1);
    base.setMonth(base.getMonth() + monthOffset);
    const year = base.getFullYear();
    const month = base.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lead = first.getDay();
    const cells: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(dateKey(new Date(year, month, d)));
    return {
      label: first.toLocaleDateString("th-TH", { month: "long", year: "numeric" }),
      cells,
    };
  }, [now, monthOffset]);

  async function toggleDay(key: string) {
    if (!user || busy) return;
    if (key < todayKey) return; // วันที่ผ่านไปแล้วกันไม่ได้
    setBusy(true);
    setErr("");
    const next = new Set(busyDates);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    try {
      await setDoc(
        doc(db, "availability", user.uid),
        // เก็บเฉพาะวันตั้งแต่วันนี้เป็นต้นไป — ไม่ให้ลิสต์บวมด้วยของเก่าที่ไม่มีความหมาย
        {
          busyDates: [...next].filter((d) => d >= todayKey).sort(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      setErr(describeWriteError(e, "บันทึกวันไม่ว่าง"));
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!user) return;
    if (!confirm("ล้างวันที่กันไว้ทั้งหมด? (กลับไปเป็นว่างทุกวัน)")) return;
    setBusy(true);
    try {
      await setDoc(
        doc(db, "availability", user.uid),
        { busyDates: [], updatedAt: serverTimestamp() },
        { merge: true }
      );
      show("ล้างแล้ว — ตอนนี้ว่างทุกวัน");
    } catch (e) {
      setErr(describeWriteError(e, "ล้าง"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  const upcoming = [...busyDates].filter((d) => d >= todayKey).sort();

  return (
    <div>
      <Alert tone="info">
        แตะวันที่ติดธุระเพื่อ <b>ปิดรับงานวันนั้น</b> — การ์ดของคุณจะขึ้นว่าไม่ว่าง
        และกรรมการจะเลือกวันนั้นให้คุณไม่ได้ · <b>วันที่ไม่ได้กัน ถือว่าว่าง</b> สั่งงานได้เลย
      </Alert>

      {/* สถานะวันนี้ — บอกผลลัพธ์ตรง ๆ ว่าตอนนี้คนอื่นเห็นเราเป็นแบบไหน */}
      <div
        className={`mb-4 flex items-center gap-3 rounded-2xl p-3.5 ${
          busyDates.has(todayKey) ? "tone-bad" : "tone-ok"
        }`}
      >
        <Icon name={busyDates.has(todayKey) ? "ban" : "approved"} size={20} />
        <div className="min-w-0 flex-1">
          <p className="t-label">
            วันนี้: {busyDates.has(todayKey) ? "ปิดรับงาน" : "เปิดรับงาน"}
          </p>
          <p className="t-caption">
            {busyDates.has(todayKey)
              ? "กรรมการมอบหมายงานวันนี้ให้คุณไม่ได้ และคุณกดรับงานวันนี้ไม่ได้"
              : "กรรมการมอบหมายงานวันนี้ให้คุณได้"}
          </p>
        </div>
      </div>

      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      {/* ── หัวเดือน + ปุ่มเลื่อน ── */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setMonthOffset((m) => m - 1)}
          disabled={monthOffset <= 0}
          aria-label="เดือนก่อนหน้า"
        >
          <Icon name="chevronRight" size={16} className="rotate-180" />
        </Button>
        <p className="t-heading text-[var(--ink)]">{grid.label}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setMonthOffset((m) => m + 1)}
          disabled={monthOffset >= 5}
          aria-label="เดือนถัดไป"
        >
          <Icon name="chevronRight" size={16} />
        </Button>
      </div>

      {/* ── ตารางวัน ── */}
      <div className="surface-flat rounded-3xl p-3">
        <div className="mb-1 grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="t-caption py-1 text-center font-semibold">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.cells.map((key, i) => {
            if (!key) return <div key={`pad-${i}`} />;
            const day = Number(key.slice(-2));
            const isBusy = busyDates.has(key);
            const past = key < todayKey;
            const today = key === todayKey;
            return (
              <button
                key={key}
                onClick={() => toggleDay(key)}
                disabled={past || busy}
                aria-pressed={isBusy}
                aria-label={`${shortDay(key)} ${isBusy ? "ไม่ว่าง" : "ว่าง"}`}
                className={`
                  press t-num grid aspect-square place-items-center rounded-xl text-sm font-semibold transition
                  ${past ? "cursor-not-allowed text-[var(--muted-ink)]/40" : ""}
                  ${isBusy ? "bg-[var(--tone-bad-ink)] text-white" : past ? "" : "bg-white text-[var(--ink)]"}
                  ${today && !isBusy ? "ring-2 ring-[var(--faculty)]" : ""}
                `}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── สรุปวันที่กันไว้ ── */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="t-label text-[var(--muted-ink)]">วันที่กันไว้:</span>
        {upcoming.length === 0 ? (
          <Badge className="tone-ok" icon="approved">
            ว่างทุกวัน
          </Badge>
        ) : (
          <>
            {upcoming.slice(0, 8).map((d) => (
              <Badge key={d} className="tone-bad">
                {shortDay(d)}
              </Badge>
            ))}
            {upcoming.length > 8 && <span className="t-caption">+{upcoming.length - 8}</span>}
            <Button size="sm" variant="ghost" onClick={clearAll} className="ml-auto text-[var(--muted-ink)]">
              ล้างทั้งหมด
            </Button>
          </>
        )}
      </div>

      {toastNode}
    </div>
  );
}
