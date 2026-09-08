"use client";
// components/ai/assistant-context.tsx — เปิดผู้ช่วยจากที่ไหนก็ได้ในฝั่งกรรมการ
//
// หน้าภาพรวมมีช่องสั่งงานของตัวเอง พิมพ์แล้วกดส่งต้องเด้งแผงผู้ช่วยขึ้นมา
// พร้อมยิงคำสั่งนั้นทันที — ไม่ใช่ให้ผู้ใช้พิมพ์ซ้ำอีกรอบ
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/icon";
import Assistant from "./assistant";

interface AssistantApi {
  /** เปิดแผง · ใส่ prompt มาด้วยจะส่งให้เลย */
  open: (prompt?: string) => void;
  /** เปิดแผงแล้วโหลดบทสนทนาเก่าที่บันทึกไว้ (จากหน้าภาพรวม) */
  openChat: (chatId: string) => void;
}

const Ctx = createContext<AssistantApi>({ open: () => {}, openChat: () => {} });

export function useAssistant(): AssistantApi {
  return useContext(Ctx);
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  /** nonce ทำให้ Assistant remount ทุกครั้งที่สั่งจากภายนอก จะได้ยิงคำสั่งใหม่เสมอ */
  const [seed, setSeed] = useState<{ text?: string; chatId?: string; nonce: number } | null>(null);

  const api = useMemo<AssistantApi>(
    () => ({
      open: (prompt?: string) => {
        if (prompt?.trim()) setSeed({ text: prompt.trim(), nonce: Date.now() });
        else setSeed(null);
        setOpen(true);
      },
      openChat: (chatId: string) => {
        setSeed({ chatId, nonce: Date.now() });
        setOpen(true);
      },
    }),
    []
  );

  // ซ่อนพร้อม dock ตอนเลื่อนลง — ปุ่มลอยที่ค้างอยู่ตลอดจะบังเนื้อหาการ์ดใบล่างสุด
  const [tucked, setTucked] = useState(false);
  const lastY = useRef(0);
  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY.current;
      if (Math.abs(dy) < 24) return;
      // เกณฑ์เดียวกับ dock เป๊ะ ๆ ไม่งั้นอยู่ท้ายหน้าแล้ว dock โผล่แต่ปุ่มนี้หาย
      const atBottom = y + window.innerHeight >= document.body.scrollHeight - 120;
      setTucked(dy > 0 && y > 160 && !atBottom);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setSeed(null);
  }, []);

  return (
    <Ctx.Provider value={api}>
      {children}

      {!open && (
        <button
          type="button"
          onClick={() => api.open()}
          aria-label="เปิดผู้ช่วยกรรมการ"
          className="press fixed right-4 z-[94] grid h-14 w-14 place-items-center rounded-full bg-[var(--ink)] text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] hover:scale-105"
          style={{
            // ลอยเหนือ dock พอดี — ค่านี้คู่กับ .pb-dock ที่เว้นที่ไว้ให้แล้ว
            bottom: "calc(var(--dock-h, 0px) + 0.75rem)",
            transform: tucked ? "translateY(160%)" : "translateY(0)",
            transition: "transform .32s cubic-bezier(0.16, 1, 0.3, 1), scale .2s",
            pointerEvents: tucked ? "none" : "auto",
          }}
        >
          <Icon name="empty" size={28} />
        </button>
      )}

      <Assistant
        key={seed?.nonce ?? "idle"}
        open={open}
        onClose={close}
        initialPrompt={seed?.text}
        initialChatId={seed?.chatId}
      />
    </Ctx.Provider>
  );
}
