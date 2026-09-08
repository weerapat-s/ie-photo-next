"use client";
// components/ai/overview-ask.tsx — ช่องสั่งงาน AI บนหน้าภาพรวม
//
// วางไว้บนสุดเพราะหน้าภาพรวมคือหน้าแรกที่กรรมการเปิด — สั่งงานได้ทันทีโดยไม่ต้องหาเมนู
// พิมพ์แล้วกดส่ง แผงผู้ช่วยจะเด้งขึ้นพร้อมยิงคำสั่งนั้นให้เลย ไม่ต้องพิมพ์ซ้ำ
import { useState } from "react";
import { collection, orderBy, query, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useCollection } from "@/lib/hooks";
import { fmtRelative } from "@/lib/format";
import Icon, { type IconName } from "@/components/icon";
import RadiantPromptInput from "./radiant-prompt";
import GenerateButton from "./generate-button";
import { useAssistant } from "./assistant-context";
import type { AiChatDoc } from "@/lib/types";

/** ทางลัดที่ใช้บ่อย — สั้นพอให้อ่านจบในแวบเดียว */
const SHORTCUTS: { icon: IconName; label: string; prompt: string }[] = [
  {
    icon: "assign",
    label: "จ่ายงานที่ค้าง",
    prompt: "วางแผนมอบหมายงานที่ยังไม่มีคนรับให้หน่อย เลือกคนที่ว่างและภาระงานน้อยก่อน",
  },
  {
    icon: "members",
    label: "ดูภาระทีม",
    prompt: "ตอนนี้ใครงานล้นบ้าง ใครยังว่าง ควรย้ายงานไปให้ใคร",
  },
  {
    icon: "calendar",
    label: "แผนสัปดาห์หน้า",
    prompt: "สัปดาห์หน้ามีงานอะไรบ้าง ใครว่างรับได้ และควรจัดทีมยังไง",
  },
];

const TEMPLATES = SHORTCUTS.map((s) => s.prompt);

export default function OverviewAsk() {
  const { open, openChat } = useAssistant();
  const [value, setValue] = useState("");

  // ประวัติแชทล่าสุด — เห็นตั้งแต่หน้าแรก กดกลับไปคุยต่อได้เลย ไม่ต้องเปิดแผงก่อน
  const { data: chats } = useCollection<AiChatDoc>(
    () => query(collection(db, "aiChats"), orderBy("updatedAt", "desc"), limit(5)),
    []
  );

  function send(text: string) {
    open(text);
    setValue("");
  }

  return (
    <section className="mb-7">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--faculty)] text-white">
          <Icon name="empty" size={16} />
        </span>
        <div className="min-w-0">
          <h2 className="t-heading text-[var(--ink)]">สั่งงานชุมนุมได้เลย</h2>
          <p className="t-caption">
            ผู้ช่วยเห็นภาระงานทุกคน วันที่แต่ละคนกันไว้ และงานที่ยังไม่มีคนรับ — ถ้าข้อมูลไม่พอจะถามกลับก่อน
          </p>
        </div>
      </div>

      <RadiantPromptInput
        value={value}
        onChange={setValue}
        onSubmit={send}
        templates={TEMPLATES}
        placeholder="เช่น จัดทีม 3 คนให้งานถ่ายวันที่ 12 บ่ายโมง"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {SHORTCUTS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => send(s.prompt)}
            className="press surface-flat inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--ink)]/80 ring-1 ring-[var(--hairline)] transition hover:text-[var(--ink)]"
          >
            <Icon name={s.icon} size={16} className="text-[var(--faculty)]" />
            {s.label}
          </button>
        ))}
        <GenerateButton className="ml-auto" onClick={() => send(SHORTCUTS[0].prompt)} />
      </div>

      {/* ── บทสนทนาล่าสุด ── */}
      {chats.length > 0 && (
        <div className="mt-4">
          <p className="t-caption mb-2 flex items-center gap-1.5 font-semibold">
            <Icon name="time" size={16} /> คุยกับผู้ช่วยล่าสุด
          </p>
          <ul className="surface-flat divide-y divide-[var(--hairline)] overflow-hidden rounded-2xl">
            {chats.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => openChat(c.id)}
                  className="press flex w-full items-center gap-3 p-3 text-left transition hover:bg-black/[0.02]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--faculty)]/10 text-[var(--faculty)]">
                    <Icon name="empty" size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-label block truncate text-[var(--ink)]">{c.title}</span>
                    <span className="t-caption block truncate">
                      {c.turnCount} ข้อความ{c.updatedAt ? ` · ${fmtRelative(c.updatedAt)}` : ""}
                    </span>
                  </span>
                  <Icon name="chevronRight" size={18} className="shrink-0 text-[var(--muted-ink)]" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
