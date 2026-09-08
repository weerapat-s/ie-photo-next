"use client";
// lib/settings-context.tsx — ค่าตั้งทั้งระบบอ่านจาก settings/app แบบ realtime
// ยังไม่มี doc ก็ใช้ DEFAULT_SETTINGS ไปก่อน แอปไม่พัง
// สีหลัก (accentColor) ถูกยิงกลับเข้า CSS variable → เปลี่ยนสีทั้งเว็บได้จากหน้า /settings
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase/client";
import { DEFAULT_SETTINGS, type AppSettings } from "./types";

interface SettingsState {
  settings: AppSettings;
  loading: boolean;
  /** true = อ่าน doc จริงจากเซิร์ฟเวอร์แล้ว (ไม่ใช่ค่า default) */
  loaded: boolean;
}

const Ctx = createContext<SettingsState>({
  settings: DEFAULT_SETTINGS,
  loading: true,
  loaded: false,
});

export const useSettings = () => useContext(Ctx);

/** แปลง hex → "r g b" สำหรับ color-mix/rgba ใน CSS */
function hexToRgbTriplet(hex: string): string | null {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [raw, setRaw] = useState<Partial<AppSettings> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "settings", "app"),
      (snap) => {
        if (snap.exists()) {
          setRaw(snap.data() as Partial<AppSettings>);
          setLoaded(true);
        }
        setLoading(false);
      },
      () => setLoading(false)   // อ่านไม่ได้ (ออฟไลน์/rules) → ใช้ค่า default
    );
    return unsub;
  }, []);

  // merge ทีละคีย์ — เพิ่มฟิลด์ใหม่ในโค้ดแล้ว doc เก่ายังใช้ได้
  const settings = useMemo<AppSettings>(
    () => ({ ...DEFAULT_SETTINGS, ...(raw ?? {}) }),
    [raw]
  );

  // ยิงสีหลักเข้า CSS variable ให้ทั้งเว็บเปลี่ยนตาม
  useEffect(() => {
    const root = document.documentElement;
    const accent = settings.accentColor || DEFAULT_SETTINGS.accentColor;
    root.style.setProperty("--faculty", accent);
    root.style.setProperty("--primary", accent);
    root.style.setProperty("--ring", accent);
    const triplet = hexToRgbTriplet(accent);
    if (triplet) root.style.setProperty("--faculty-rgb", triplet);
  }, [settings.accentColor]);

  return <Ctx.Provider value={{ settings, loading, loaded }}>{children}</Ctx.Provider>;
}
