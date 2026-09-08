"use client";
// components/ai/assistant.tsx — ผู้ช่วยบริหารกำลังคน (กรรมการเท่านั้น)
//
// หลักที่ยึด: **AI เสนอ กรรมการเป็นคนตัดสิน**
// แผนที่ได้จะแสดงเป็นการ์ดพร้อมชื่อคนและวันที่ชนคิว กดยืนยันแล้วระบบถึงเขียนลง Firestore
// ไม่มีทางที่ AI จะแก้ข้อมูลเองโดยไม่ผ่านสายตาคน
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { collection, doc, setDoc, deleteDoc, orderBy, query, limit, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useCollection, useDocument, useNow, useBrowserValue } from "@/lib/hooks";
import { useAuth } from "@/lib/firebase/auth-context";
import { useSettings } from "@/lib/settings-context";
import { fmtRelative } from "@/lib/format";
import { crewLoad } from "@/lib/analytics";
import { chat, aiReady, AiError, type ChatMessage } from "@/lib/ai/client";
import { PROVIDER_OF } from "@/lib/ai/models";
import { buildClubSnapshot, SYSTEM_PROMPT } from "@/lib/ai/context";
import { parseAiReply, resolvePlan, type ResolvedAction } from "@/lib/ai/plan";
import { applyPlan, describeResult } from "@/lib/ai/apply";
import { Badge, Alert, Spinner, useToast } from "@/components/ui";
import Icon from "@/components/icon";
import RadiantPromptInput from "./radiant-prompt";
import GenerateButton from "./generate-button";
import PlanCard from "./plan-card";
import type {
  AiChatDoc,
  AiConfigDoc,
  AvailabilityDoc,
  BookingDoc,
  DeliveryDoc,
  EquipmentDoc,
  PhotographerDoc,
  TaskDoc,
  UserDoc,
} from "@/lib/types";

/** เก็บย้อนหลังแค่ไม่กี่ตา — โควตา 30k token/วัน ทั้งชุมนุมใช้ร่วมกัน */
const HISTORY_TURNS = 6;

const TEMPLATES = [
  "วางแผนมอบหมายงานที่ยังไม่มีคนรับให้หน่อย",
  "ตอนนี้ใครงานล้นบ้าง ควรย้ายงานไปให้ใคร",
  "สัปดาห์หน้ามีงานอะไรบ้าง ใครว่างรับได้",
  "งานกระจายกันดีไหม มีใครยังไม่เคยได้งานเลย",
];

interface Turn {
  role: "user" | "assistant";
  text: string;
  questions?: string[];
  actions?: ResolvedAction[];
  planSummary?: string;
  dropped?: number;
  /** กดยืนยันไปแล้ว — กันกดซ้ำ */
  applied?: boolean;
  /** โมเดลที่ตอบจริง — โชว์ให้รู้ว่าสลับค่ายไปแล้วหรือยัง */
  model?: string;
  /** โมเดลที่ข้ามเพราะโควตาหมด */
  switchedFrom?: string[];
}

export default function Assistant({
  open,
  onClose,
  /** คำสั่งที่ถูกส่งมาจากหน้าอื่น (เช่น ช่องสั่งงานบนหน้าภาพรวม) — ยิงให้ทันทีที่เปิด */
  initialPrompt,
  /** id บทสนทนาเก่าที่ให้เปิดขึ้นมาต่อ (จากรายการประวัติหน้าภาพรวม) */
  initialChatId,
}: {
  open: boolean;
  onClose: () => void;
  initialPrompt?: string;
  initialChatId?: string;
}) {
  const readMounted = useCallback(() => true, []);
  const mounted = useBrowserValue(readMounted, false);
  const now = useNow(60_000);
  const { show, node: toastNode } = useToast();

  // ── ข้อมูล — โหลดเฉพาะตอนเปิดแผง ไม่กิน read ตอนปิดอยู่ ──
  const on = open;
  const { data: cfg, loading: cfgLoading } = useDocument<AiConfigDoc>(
    () => (on ? doc(db, "secrets", "ai") : null),
    [on]
  );
  const { data: users } = useCollection<UserDoc>(() => (on ? collection(db, "users") : null), [on]);
  const { data: bookings } = useCollection<BookingDoc>(() => (on ? collection(db, "bookings") : null), [on]);
  const { data: availability } = useCollection<AvailabilityDoc>(
    () => (on ? collection(db, "availability") : null),
    [on]
  );
  const { data: equipments } = useCollection<EquipmentDoc>(() => (on ? collection(db, "equipments") : null), [on]);
  const { data: deliveries } = useCollection<DeliveryDoc>(() => (on ? collection(db, "deliveries") : null), [on]);
  const { data: tasks } = useCollection<TaskDoc>(() => (on ? collection(db, "tasks") : null), [on]);
  const { data: photographers } = useCollection<PhotographerDoc>(
    () => (on ? collection(db, "photographers") : null),
    [on]
  );
  const { data: crewMarks } = useCollection<{ photographerId: string }>(
    () => (on ? collection(db, "crew") : null),
    [on]
  );
  const { user, profile } = useAuth();
  const { settings } = useSettings();

  // ประวัติการคุย — เก็บไว้ให้ย้อนดูว่าเคยตัดสินใจอะไรไปแล้วบ้าง
  const { data: chats } = useCollection<AiChatDoc>(
    () => (on ? query(collection(db, "aiChats"), orderBy("updatedAt", "desc"), limit(20)) : null),
    [on]
  );
  // เปิดบทสนทนาเก่าต่อ = ใช้ id เดิม (บันทึกทับใบเดิม ไม่สร้างใหม่)
  const [chatId] = useState(() => initialChatId ?? doc(collection(db, "aiChats")).id);
  // โหลดบทสนทนาเก่าที่ถูกเลือกจากหน้าภาพรวม ครั้งเดียวตอนเปิด
  const loadedChatRef = useRef(false);
  const [showHistory, setShowHistory] = useState(false);
  /** โควตาที่เหลือของค่ายที่เพิ่งตอบ — ให้กรรมการรู้ว่าใกล้หมดหรือยัง */
  const [quota, setQuota] = useState<{ provider: string; left: number | null } | null>(null);

  // คำสั่งที่ส่งมาจากหน้าอื่นถูกวางเป็นข้อความแรกตั้งแต่ตอนสร้าง state
  // (ไม่ใช่ตั้งใน effect — จะกลายเป็น setState ระหว่าง effect ซึ่งทำให้ render ซ้อน)
  const [turns, setTurns] = useState<Turn[]>(() =>
    initialPrompt ? [{ role: "user", text: initialPrompt }] : []
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(!!initialPrompt);
  const [err, setErr] = useState("");

  const load = useMemo(
    () => crewLoad(photographers, bookings, deliveries, tasks, now),
    [photographers, bookings, deliveries, tasks, now]
  );

  // crewLoad คีย์ด้วย id ของ photographers — แปลงเป็น uid ให้ตรงกับ assigneeIds
  const loadByUid = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of load) {
      const uid = photographers.find((p) => p.id === l.id)?.uid;
      if (uid) m.set(uid, l.total);
    }
    return m;
  }, [load, photographers]);

  const crewUids = useMemo(() => new Set(crewMarks.map((c) => c.id)), [crewMarks]);

  // ความถนัดเก็บอยู่ที่การ์ดตากล้อง ซึ่งคีย์ด้วย id ของ photographers — แปลงเป็น uid
  const skillsByUid = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of photographers) if (p.uid && p.skills?.length) m.set(p.uid, p.skills);
    return m;
  }, [photographers]);

  const openTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.status !== "completed" && t.status !== "cancelled")
        .map((t) => ({ title: t.title, assignedToName: t.assignedToName })),
    [tasks]
  );

  const snapshot = useCallback(
    () =>
      buildClubSnapshot({
        now,
        users,
        bookings,
        availability,
        equipments,
        load,
        loadByUid,
        crewUids,
        skillsByUid,
        openTasks,
      }),
    [now, users, bookings, availability, equipments, load, loadByUid, crewUids, skillsByUid, openTasks]
  );

  /** ยิงคำถามจริง — ทุก setState เกิดหลัง await เท่านั้น เรียกจาก effect ได้ปลอดภัย */
  async function run(text: string, history: ChatMessage[], base: Turn[]) {
    if (!aiReady(cfg)) return;
    try {
      const res = await chat(cfg, [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: `สถานะชุมนุมตอนนี้:\n${snapshot()}` },
        ...history,
        { role: "user", content: text },
      ]);
      const parsed = parseAiReply(res.text);
      const resolved = parsed.plan ? resolvePlan(parsed.plan, bookings, users) : null;
      const next: Turn[] = [
        ...base,
        {
          role: "assistant",
          text: parsed.reply || "(ไม่มีคำตอบ)",
          questions: parsed.questions,
          actions: resolved?.actions,
          planSummary: parsed.plan?.summary,
          dropped: resolved?.dropped,
          model: res.model,
          switchedFrom: res.skipped.length ? res.skipped : undefined,
        },
      ];
      setTurns(next);
      setQuota({ provider: res.provider, left: res.quotaLeft });
      void saveChat(next);
    } catch (e) {
      setErr(e instanceof AiError ? e.message : "เรียก AI ไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  async function deleteChat(id: string) {
    if (!confirm("ลบบทสนทนานี้?")) return;
    try {
      await deleteDoc(doc(db, "aiChats", id));
    } catch {
      setErr("ลบไม่สำเร็จ");
    }
  }

  /**
   * บันทึกบทสนทนา — เก็บเป็น JSON string เพราะ Firestore ไม่รับ array ซ้อน array
   * และเก็บเฉพาะข้อความ ไม่เก็บ ResolvedAction (มี Timestamp ที่ serialize ไม่ตรง)
   */
  async function saveChat(all: Turn[]) {
    if (!user || all.length === 0) return;
    const firstUser = all.find((t) => t.role === "user");
    try {
      await setDoc(
        doc(db, "aiChats", chatId),
        {
          title: (firstUser?.text ?? "บทสนทนา").slice(0, 80),
          ownerId: user.uid,
          ownerName: `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() || user.email || "",
          turnsJson: JSON.stringify(
            all.map((t) => ({ role: t.role, text: t.text, model: t.model ?? null }))
          ).slice(0, 900_000),
          turnCount: all.length,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch {
      // บันทึกประวัติไม่สำเร็จไม่ควรทำให้แชตพัง — เงียบไว้พอ
    }
  }

  /** ผู้ใช้กดส่งเอง — วางข้อความของตัวเองก่อน แล้วค่อยยิง */
  function ask(text: string) {
    if (busy || !aiReady(cfg)) return;
    setErr("");
    setInput("");
    const history: ChatMessage[] = turns.slice(-HISTORY_TURNS).map((t) => ({
      role: t.role,
      content: t.text,
    }));
    const base: Turn[] = [...turns, { role: "user", text }];
    setTurns(base);
    setBusy(true);
    void run(text, history, base);
  }

  /** ลงมือทำตามแผน — เฉพาะตอนกรรมการกดยืนยันเท่านั้น */
  async function confirmPlan(turnIndex: number, actions: ResolvedAction[]) {
    if (busy || !user) return;
    setBusy(true);
    setErr("");
    try {
      const me = users.find((u) => u.id === user.uid) ?? null;
      const name = `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() || user.email || "";
      const result = await applyPlan(actions, { uid: user.uid, name }, me, {
        siteName: settings.siteName,
        aiBaseUrl: cfg?.baseUrl,
        emailOn: settings.notifyEmail !== false,
      });
      setTurns((prev) => prev.map((t, i) => (i === turnIndex ? { ...t, applied: true } : t)));
      show(describeResult(result));
      if (result.skipped.length) setErr(`ข้ามบางรายการ: ${result.skipped.join(" · ")}`);
    } catch {
      setErr("บันทึกแผนไม่สำเร็จ — ลองรีเฟรชหน้าแล้วกดใหม่");
    } finally {
      setBusy(false);
    }
  }

  /* eslint-disable react-hooks/set-state-in-effect --
     โหลดบทสนทนาเก่าครั้งเดียวตอนเปิด · ref กันโหลดซ้ำ
     setTurns ที่นี่คือการเติมข้อมูลเริ่มต้น ไม่ได้วนซ้ำ */
  useEffect(() => {
    if (!open || !initialChatId || loadedChatRef.current) return;
    const c = chats.find((x) => x.id === initialChatId);
    if (!c) return; // ยังโหลดรายการไม่เสร็จ รอ snapshot ถัดไป
    loadedChatRef.current = true;
    try {
      setTurns(JSON.parse(c.turnsJson) as Turn[]);
    } catch {
      /* อ่านไม่ได้ก็ปล่อยเป็นแชตว่าง */
    }
  }, [open, initialChatId, chats]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ยิงคำสั่งที่ส่งมาจากหน้าอื่นครั้งเดียวตอนเปิด — run() เป็น async
  // setState ทุกจุดอยู่หลัง await จึงไม่ทำให้เกิด render ซ้อน · ref กันยิงซ้ำ
  /* eslint-disable react-hooks/set-state-in-effect */
  const seededRef = useRef(false);
  useEffect(() => {
    if (!open || !initialPrompt || seededRef.current) return;
    if (!aiReady(cfg)) return; // รอ config โหลดเสร็จก่อนค่อยยิง
    seededRef.current = true;
    void run(initialPrompt, [], [{ role: "user", text: initialPrompt }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPrompt, cfg]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!mounted || !open) return null;

  const notConfigured = !cfgLoading && !aiReady(cfg);

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col">
      <button
        type="button"
        aria-label="ปิดผู้ช่วย"
        onClick={onClose}
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
      />

      <div className="relative mt-auto flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-[var(--app-bg)] shadow-[0_-20px_60px_rgba(0,0,0,0.2)] sm:mx-auto sm:mb-4 sm:h-[86dvh] sm:max-w-2xl sm:rounded-3xl">
        {/* ── หัวแผง ── */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--hairline)] px-4 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--faculty)] text-white">
            <Icon name="empty" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="t-label truncate text-[var(--ink)]">ผู้ช่วยกรรมการ</p>
            {quota ? (
              <p className="t-caption flex flex-wrap items-center gap-1">
                <span>{quota.provider}</span>
                {quota.left !== null && (
                  <>
                    <span>·</span>
                    <span
                      className={
                        quota.left < 3000 ? "font-semibold text-[var(--tone-bad-ink)]" : "text-[var(--ink)]/70"
                      }
                    >
                      โควตาเหลือ {quota.left.toLocaleString("th-TH")} token
                    </span>
                    {quota.left < 3000 && <span>· ใกล้หมด เดี๋ยวสลับค่ายให้เอง</span>}
                  </>
                )}
              </p>
            ) : (
              <p className="t-caption">วางแผนกำลังคน · มอบหมายงาน · ดูภาระทีม</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-label="ประวัติการคุย"
            aria-pressed={showHistory}
            aria-expanded={showHistory}
            className={`press inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition ${
              showHistory
                ? "bg-[var(--faculty)] text-white"
                : "surface-flat text-[var(--ink)] ring-1 ring-[var(--hairline)]"
            }`}
          >
            <Icon name="time" size={18} />
            ประวัติ
            {chats.length > 0 && (
              <span className={`t-num text-xs ${showHistory ? "text-white/75" : "text-[var(--muted-ink)]"}`}>
                {chats.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="tap grid place-items-center rounded-xl text-[var(--muted-ink)] hover:bg-black/5"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* ── ประวัติการคุย ── */}
        {showHistory && (
          <div className="max-h-[40vh] shrink-0 overflow-y-auto border-b border-[var(--hairline)] px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="t-caption font-semibold">บทสนทนาที่ผ่านมา</p>
              <button
                type="button"
                onClick={() => {
                  setTurns([]);
                  setShowHistory(false);
                }}
                className="press t-caption inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold text-[var(--faculty)]"
              >
                <Icon name="add" size={16} /> เริ่มบทสนทนาใหม่
              </button>
            </div>
            {chats.length === 0 ? (
              <p className="t-caption">ยังไม่มีประวัติ — คุยแล้วระบบจะเก็บให้เอง</p>
            ) : (
              <ul className="surface-flat divide-y divide-[var(--hairline)] overflow-hidden rounded-2xl">
                {chats.map((c) => (
                  <li key={c.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          setTurns(JSON.parse(c.turnsJson) as Turn[]);
                          setShowHistory(false);
                        } catch {
                          setErr("อ่านประวัติบทสนทนานี้ไม่ได้");
                        }
                      }}
                      className="press min-w-0 flex-1 px-3 py-2.5 text-left"
                    >
                      <span className="t-label block truncate text-[var(--ink)]">{c.title}</span>
                      <span className="t-caption block truncate">
                        {c.ownerName} · {c.turnCount} ข้อความ
                        {c.updatedAt ? ` · ${fmtRelative(c.updatedAt)}` : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteChat(c.id)}
                      aria-label={`ลบบทสนทนา ${c.title}`}
                      className="tap mr-1 grid shrink-0 place-items-center rounded-xl text-[var(--muted-ink)] transition hover:bg-[var(--tone-bad-bg)] hover:text-[var(--tone-bad-ink)]"
                    >
                      <Icon name="remove" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── บทสนทนา ── */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {notConfigured ? (
            <Alert tone="info">
              ยังไม่ได้ตั้งค่าผู้ช่วย AI — ไปที่ <b>ตั้งค่า → ผู้ช่วย AI</b> แล้วใส่ที่อยู่ปลายทางกับคีย์ก่อน
            </Alert>
          ) : turns.length === 0 ? (
            <div className="py-6 text-center">
              <p className="t-heading text-[var(--ink)]">สั่งงานได้เลย</p>
              <p className="t-caption mx-auto mt-1 max-w-sm">
                ผู้ช่วยเห็นภาระงานของทุกคน วันที่แต่ละคนกันไว้ และงานที่ยังไม่มีคนรับ
                ถ้าข้อมูลไม่พอจะถามกลับก่อนวางแผน
              </p>
              <div className="mt-4 grid gap-2 text-left">
                {TEMPLATES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => ask(t)}
                    className="press surface-flat rounded-2xl px-4 py-3 text-sm text-[var(--ink)]/85 ring-1 ring-[var(--hairline)]"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((t, i) =>
              t.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--faculty)] px-3.5 py-2.5 text-sm leading-relaxed text-white">
                    {t.text}
                  </p>
                </div>
              ) : (
                <div key={i} className="space-y-2">
                  <p className="surface-flat max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm leading-relaxed text-[var(--ink)]">
                    {t.text}
                  </p>

                  {/* คำถามกลับจากระบบ — กดเพื่อตอบได้เลย */}
                  {t.questions && t.questions.length > 0 && (
                    <div className="tone-warn rounded-2xl p-3">
                      <p className="t-label mb-1.5 flex items-center gap-1.5">
                        <Icon name="info" size={16} /> ขอข้อมูลเพิ่ม
                      </p>
                      <ul className="space-y-1.5">
                        {t.questions.map((q, qi) => (
                          <li key={qi} className="text-sm leading-relaxed">
                            • {q}
                          </li>
                        ))}
                      </ul>
                      <p className="t-caption mt-2">พิมพ์ตอบด้านล่างได้เลย</p>
                    </div>
                  )}

                  {/* แผนที่เสนอ — ต้องกดยืนยันเองถึงจะบันทึก */}
                  {t.actions && t.actions.length > 0 && (
                    <>
                      <PlanCard
                        summary={t.planSummary}
                        actions={t.actions}
                        availability={availability}
                        applied={t.applied}
                        busy={busy}
                        onApply={() => confirmPlan(i, t.actions!)}
                      />
                      {t.dropped ? (
                        <p className="t-caption text-[var(--tone-warn-ink)]">
                          ตัดออก {t.dropped} รายการ เพราะอ้างถึงงานหรือคนที่ไม่มีในระบบ
                        </p>
                      ) : null}
                    </>
                  )}

                  {/* บอกว่าใครเป็นคนตอบ — สำคัญตอนโควตาค่ายหลักหมดแล้วสลับ */}
                  {t.model && (
                    <p className="t-caption flex flex-wrap items-center gap-1.5">
                      <Badge className="tone-mute">{PROVIDER_OF.get(t.model) ?? t.model}</Badge>
                      <span>{t.model}</span>
                      {t.switchedFrom && (
                        <span className="text-[var(--tone-warn-ink)]">
                          · สลับมาเพราะ {t.switchedFrom.join(", ")} โควตาหมด
                        </span>
                      )}
                    </p>
                  )}
                </div>
              )
            )
          )}

          {busy && <Spinner label="กำลังคิด…" />}
          {err && <Alert onClose={() => setErr("")}>{err}</Alert>}
        </div>

        {/* ── ช่องสั่งงาน ── */}
        <div className="shrink-0 border-t border-[var(--hairline)] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3">
          <RadiantPromptInput
            value={input}
            onChange={setInput}
            onSubmit={ask}
            disabled={busy || notConfigured}
            templates={TEMPLATES}
            placeholder="เช่น มอบหมายงานถ่ายวันที่ 12 ให้คนที่ว่างและงานน้อย"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="t-caption">AI เสนอเท่านั้น · ระบบจะไม่บันทึกจนกว่าคุณจะกดยืนยัน</p>
            <GenerateButton
              onClick={() => ask(TEMPLATES[0])}
              loading={busy}
              disabled={notConfigured}
            />
          </div>
        </div>
      </div>

      {toastNode}
    </div>,
    document.body
  );
}
