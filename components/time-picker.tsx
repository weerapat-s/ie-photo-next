"use client";
// components/time-picker.tsx — เลือกช่วงเวลาด้วยปฏิทิน + ตารางชั่วโมง
//
// แทน <input type="datetime-local"> ที่มองไม่เห็นว่าช่วงไหนว่างจริง
// ผู้ใช้ต้องเดาแล้วกดส่ง ถึงจะรู้ว่าชนคิว — เสียเวลาและน่าหงุดหงิด
//
// ที่นี่เห็นก่อนเลือก:
//   • ปฏิทินรายเดือน — แต่ละวันมีแถบบอกว่าคิวแน่นแค่ไหน
//   • ตารางชั่วโมง — ช่องที่มีคนจองแล้วกดไม่ได้ ทาสีทึบไว้
//   • เลือกเป็น 2 จังหวะ: "เริ่ม" แล้ว "คืน/จบ" — ข้ามวันได้ถ้าเปิด maxDays
//   • แอดมินเห็นละเอียดกว่า: จำนวนงานรวมทั้งชุมนุมต่อวัน + เตือนวันที่งานแน่นเกิน
import { useMemo, useState } from "react";
import { useNow } from "@/lib/hooks";
import { Badge } from "@/components/ui";
import Icon from "@/components/icon";
import { dateKey } from "@/lib/availability";
import type { SlotDoc, WithId } from "@/lib/types";

/** ชั่วโมงที่เปิดให้เลือก — นอกช่วงนี้ชุมนุมไม่มีคนอยู่ */
const START_HOUR = 6;
const END_HOUR = 24;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

export interface TimeRange {
  /** ms — null = ยังไม่ได้เลือก */
  start: number | null;
  end: number | null;
}

interface DayLoad {
  /** จำนวนงานของ "ของที่เลือกอยู่" ในวันนั้น (ชนกับเราได้) */
  own: number;
  /** จำนวนงานทั้งชุมนุมในวันนั้น — ใช้ดูภาระรวม (แอดมินเท่านั้น) */
  total: number;
}

/** ms ของต้นวันตาม key "YYYY-MM-DD" (เวลาท้องถิ่น) */
function dayStartMs(key: string): number {
  const [y, mo, d] = key.split("-").map(Number);
  return new Date(y, mo - 1, d).getTime();
}

export default function TimePicker({
  slots,
  itemId,
  value,
  onChange,
  maxAdvanceDays,
  maxHours,
  /** ถ้าใส่มา = ยืมข้ามวันได้ไม่เกินกี่วัน (ทับ maxHours) */
  maxDays,
  /** true = โหมดแอดมิน เห็นภาระงานรวมของทั้งชุมนุม */
  detailed = false,
  /** เตือนเมื่อวันนั้นมีงานเกินจำนวนนี้ (เฉพาะโหมดละเอียด) */
  busyDayThreshold = 4,
  /** วันที่เจ้าของคิวแจ้งว่าไม่ว่าง (YYYY-MM-DD) — เลือกไม่ได้ */
  blockedDays,
}: {
  slots: WithId<SlotDoc>[];
  /** ของชิ้นเดียว หรือหลายชิ้น (ยืมพร้อมกัน) — ชนชิ้นไหนก็ถือว่าชน */
  itemId: string | string[];
  value: TimeRange;
  onChange: (v: TimeRange) => void;
  maxAdvanceDays: number;
  maxHours: number;
  maxDays?: number;
  detailed?: boolean;
  busyDayThreshold?: number;
  blockedDays?: Set<string>;
}) {
  // เวลาปัจจุบันต้องมาจาก store ภายนอก — เรียก Date.now() ตอน render ไม่ได้
  const now = useNow(60_000);
  const today = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [now]);

  const [monthOffset, setMonthOffset] = useState(0);
  /** จังหวะที่กำลังเลือกอยู่ — start ก่อน แล้วค่อย end */
  const [phase, setPhase] = useState<"start" | "end">("start");
  /** วันที่ตารางชั่วโมงกำลังแสดง (แยกตามจังหวะ) */
  const [startDay, setStartDay] = useState<string | null>(value.start ? dateKey(value.start) : null);
  const [endDay, setEndDay] = useState<string | null>(value.end ? dateKey(value.end - 1) : null);

  const day = phase === "start" ? startDay : (endDay ?? startDay);

  const todayKey = dateKey(today);
  const lastKey = dateKey(new Date(today.getTime() + maxAdvanceDays * DAY));
  const capMs = (maxDays ? maxDays * 24 : maxHours) * HOUR;

  const itemIds = useMemo(
    () => new Set(Array.isArray(itemId) ? itemId : [itemId]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Array.isArray(itemId) ? itemId.join(",") : itemId]
  );

  /** ช่วงที่ถูกจองไปแล้วของ "ของที่เลือกอยู่" — [เริ่ม, จบ] เป็น ms */
  const taken = useMemo(
    () =>
      slots
        .filter((s) => itemIds.has(s.itemId))
        .map((s) => [s.startAt.toMillis(), s.endAt.toMillis()] as const),
    [slots, itemIds]
  );

  /** ชั่วโมงนั้นชนคิวไหม */
  const hourTaken = (ms: number) => taken.some(([a, b]) => a < ms + HOUR && b > ms);

  /** วัน → ภาระงาน (นับทั้งของที่เลือกและทั้งชุมนุม) */
  const load = useMemo(() => {
    const m = new Map<string, DayLoad>();
    for (const s of slots) {
      const startMs = s.startAt.toMillis();
      const endMs = s.endAt.toMillis();
      // งานข้ามคืนต้องนับทุกวันที่คาบเกี่ยว ไม่ใช่แค่วันเริ่ม
      const cur = new Date(startMs);
      cur.setHours(0, 0, 0, 0);
      for (let i = 0; i < 14 && cur.getTime() <= endMs; i++) {
        const k = dateKey(cur);
        const cell = m.get(k) ?? { own: 0, total: 0 };
        cell.total += 1;
        if (itemIds.has(s.itemId)) cell.own += 1;
        m.set(k, cell);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return m;
  }, [slots, itemIds]);

  const grid = useMemo(() => {
    const base = new Date(today);
    base.setDate(1);
    base.setMonth(base.getMonth() + monthOffset);
    const year = base.getFullYear();
    const month = base.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const lead = new Date(year, month, 1).getDay();
    const cells: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= days; d++) cells.push(dateKey(new Date(year, month, d)));
    return {
      label: new Date(year, month, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" }),
      cells,
    };
  }, [today, monthOffset]);

  /** เพดานเวลาจบ — ทั้งจากโควตาและจากคิวที่จองไว้ถัดไป (จองคร่อมคิวคนอื่นไม่ได้) */
  const limitMs = useMemo(() => {
    if (value.start === null) return null;
    let lim = value.start + capMs;
    for (const [a] of taken) if (a > value.start && a < lim) lim = a;
    return lim;
  }, [value.start, capMs, taken]);

  function pickDay(key: string) {
    if (phase === "start") {
      setStartDay(key);
      setEndDay(null);
      onChange({ start: null, end: null });
    } else {
      setEndDay(key);
      onChange({ start: value.start, end: null });
    }
  }

  function pickHour(h: number) {
    if (!day) return;
    const ms = dayStartMs(day) + h * HOUR;
    if (phase === "start") {
      onChange({ start: ms, end: null });
      setEndDay(day);
      setPhase("end");
      return;
    }
    // จังหวะ "จบ" — ช่องที่กดถือว่าใช้จนจบชั่วโมงนั้น
    onChange({ start: value.start, end: ms + HOUR });
  }

  const selectedDayLoad = day ? load.get(day) : undefined;
  const startDayKey = value.start !== null ? dateKey(value.start) : null;

  return (
    <div className="surface-sunken rounded-3xl p-3">
      {/* ── สลับจังหวะ เริ่ม / จบ ── */}
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-black/4 p-1">
        <PhaseTab
          active={phase === "start"}
          label="เริ่ม"
          detail={value.start === null ? "ยังไม่เลือก" : fmtShort(value.start)}
          onClick={() => setPhase("start")}
        />
        <PhaseTab
          active={phase === "end"}
          label={maxDays ? "คืน" : "จบ"}
          detail={value.end === null ? "ยังไม่เลือก" : fmtShort(value.end)}
          disabled={value.start === null}
          onClick={() => setPhase("end")}
        />
      </div>

      {/* ── หัวเดือน ── */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMonthOffset((m) => m - 1)}
          disabled={monthOffset <= 0}
          aria-label="เดือนก่อนหน้า"
          className="tap grid place-items-center rounded-xl text-[var(--muted-ink)] disabled:opacity-30"
        >
          <Icon name="chevronRight" size={18} className="rotate-180" />
        </button>
        <p className="t-label text-[var(--ink)]">{grid.label}</p>
        <button
          type="button"
          onClick={() => setMonthOffset((m) => m + 1)}
          disabled={monthOffset >= Math.ceil(maxAdvanceDays / 30)}
          aria-label="เดือนถัดไป"
          className="tap grid place-items-center rounded-xl text-[var(--muted-ink)] disabled:opacity-30"
        >
          <Icon name="chevronRight" size={18} />
        </button>
      </div>

      {/* ── ปฏิทิน ── */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="t-caption py-0.5 text-center font-semibold">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {grid.cells.map((key, i) => {
          if (!key) return <div key={`pad-${i}`} />;
          const n = Number(key.slice(-2));
          // จังหวะ "จบ" เลือกได้เฉพาะตั้งแต่วันเริ่มไปจนถึงเพดานเวลา
          // เจ้าตัวแจ้งว่าติดธุระวันนี้ — กดเลือกไม่ได้ ไม่ใช่แค่เตือน
          const blocked = blockedDays?.has(key) ?? false;
          const outOfRange =
            blocked ||
            key < todayKey ||
            key > lastKey ||
            (phase === "end" &&
              startDayKey !== null &&
              (key < startDayKey || (limitMs !== null && dayStartMs(key) >= limitMs)));
          const active = key === day;
          const inSpan =
            startDayKey !== null &&
            value.end !== null &&
            key >= startDayKey &&
            dayStartMs(key) < value.end;
          const l = load.get(key);
          const heavy = detailed && (l?.total ?? 0) >= busyDayThreshold;
          return (
            <button
              key={key}
              type="button"
              disabled={outOfRange}
              onClick={() => pickDay(key)}
              aria-label={`วันที่ ${n}${blocked ? " — เจ้าตัวแจ้งว่าไม่ว่าง" : ""}`}
              className={`
                press relative grid aspect-square place-items-center rounded-xl text-sm font-semibold transition
                ${blocked ? "cursor-not-allowed bg-[var(--tone-bad-bg)] text-[var(--tone-bad-ink)]/60 line-through" : ""}
                ${outOfRange && !blocked ? "cursor-not-allowed text-[var(--muted-ink)]/35" : ""}
                ${!outOfRange ? "bg-white text-[var(--ink)]" : ""}
                ${inSpan && !active ? "!bg-[var(--tone-brand-bg)] !text-[var(--faculty)]" : ""}
                ${active ? "!bg-[var(--faculty)] !text-white" : ""}
                ${heavy && !active ? "ring-1 ring-[var(--tone-warn-line)]" : ""}
              `}
            >
              <span className="t-num">{n}</span>
              {/* แถบบอกความแน่นของคิว — เห็นก่อนกดว่าวันไหนคนจองเยอะ */}
              {!outOfRange && (l?.own ?? 0) > 0 && (
                <span
                  aria-hidden
                  className={`absolute bottom-1 h-1 rounded-full ${active ? "bg-white/80" : "bg-[var(--faculty)]"}`}
                  style={{ width: `${Math.min(l!.own, 4) * 5 + 4}px` }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ── ตารางชั่วโมง ── */}
      {day ? (
        <div className="mt-3 border-t border-[var(--hairline)] pt-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="t-label text-[var(--ink)]">
              {phase === "start" ? "เวลาเริ่ม" : maxDays ? "เวลาคืน" : "เวลาจบ"}
            </p>
            <span className="t-caption">
              {phase === "start" ? "แตะชั่วโมงที่เริ่มใช้งาน" : "แตะชั่วโมงสุดท้ายที่ใช้งาน"}
            </span>
            {detailed && selectedDayLoad && (
              <Badge className={selectedDayLoad.total >= busyDayThreshold ? "tone-warn" : "tone-mute"}>
                วันนี้ทั้งชุมนุม {selectedDayLoad.total} งาน
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">
            {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i).map((h) => {
              const ms = dayStartMs(day) + h * HOUR;
              const busySlot = hourTaken(ms);
              const past = ms < now;
              const inRange =
                value.start !== null && value.end !== null && ms >= value.start && ms < value.end;
              const isStart = value.start === ms;
              const disabled =
                past ||
                (phase === "start"
                  ? busySlot
                  : // จังหวะ "จบ": ต้องอยู่หลังเวลาเริ่ม และไม่เกินเพดาน
                    value.start === null ||
                    ms < value.start ||
                    (limitMs !== null && ms + HOUR > limitMs));
              return (
                <button
                  key={h}
                  type="button"
                  disabled={disabled}
                  onClick={() => pickHour(h)}
                  aria-label={`${String(h).padStart(2, "0")}:00${busySlot ? " มีคนจองแล้ว" : ""}`}
                  className={`
                    press t-num rounded-xl py-2 text-[0.8125rem] font-semibold transition
                    ${disabled ? "cursor-not-allowed bg-[var(--tone-mute-bg)] text-[var(--muted-ink)]/50" : "bg-white text-[var(--ink)]"}
                    ${busySlot ? "line-through" : ""}
                    ${inRange || isStart ? "!bg-[var(--faculty)] !text-white !no-underline" : ""}
                  `}
                >
                  {String(h).padStart(2, "0")}:00
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <LegendDot className="bg-white ring-1 ring-[var(--hairline-strong)]" label="ว่าง" />
            <LegendDot className="bg-[var(--tone-mute-bg)]" label="มีคนจองแล้ว" />
            <LegendDot className="bg-[var(--faculty)]" label="ที่เลือกไว้" />
            {blockedDays && blockedDays.size > 0 && (
              <LegendDot className="bg-[var(--tone-bad-bg)]" label="เจ้าตัวแจ้งว่าไม่ว่าง" />
            )}
          </div>
        </div>
      ) : (
        <p className="t-caption mt-3 border-t border-[var(--hairline)] pt-3 text-center">
          แตะวันที่ในปฏิทินเพื่อดูตารางชั่วโมง
        </p>
      )}

      {/* ── สรุปช่วงที่เลือก ── */}
      {value.start !== null && (
        <div className="mt-3 rounded-2xl bg-white px-3.5 py-2.5">
          <p className="t-label text-[var(--ink)]">
            {fmtShort(value.start)}
            {value.end !== null && (
              <>
                {" – "}
                {fmtShort(value.end)}
                <span className="t-caption ml-2 font-normal">
                  ({fmtSpan(value.end - value.start)})
                </span>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function fmtShort(ms: number) {
  return new Date(ms).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtSpan(ms: number) {
  const hours = Math.round(ms / HOUR);
  if (hours < 24) return `${hours} ชม.`;
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return h ? `${d} วัน ${h} ชม.` : `${d} วัน`;
}

function PhaseTab({
  active,
  label,
  detail,
  disabled,
  onClick,
}: {
  active: boolean;
  label: string;
  detail: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`press rounded-xl px-3 py-1.5 text-left transition disabled:opacity-40 ${
        active ? "bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)]" : ""
      }`}
    >
      <span className="t-caption block font-semibold text-[var(--muted-ink)]">{label}</span>
      <span className={`t-label block truncate ${active ? "text-[var(--faculty)]" : "text-[var(--ink)]"}`}>
        {detail}
      </span>
    </button>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="t-caption inline-flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded ${className}`} aria-hidden />
      {label}
    </span>
  );
}
