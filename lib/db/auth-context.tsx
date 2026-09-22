"use client";
// lib/db/auth-context.tsx — สถานะล็อกอินทั่วทั้งแอป (PocketBase บน NAS)
//
// เร็ว: token + ข้อมูลบัญชีเก็บในเครื่อง (localStorage) — เปิดเว็บมารู้ทันทีว่าใครล็อกอิน
// แล้วค่อยฟังข้อมูลสดจากเซิร์ฟเวอร์ (role เปลี่ยนก็อัปเดตทันทีโดยไม่ต้องรีเฟรช)
//
// ต่างจากสมัย Firebase: บัญชีกับข้อมูลสมาชิกเป็นเรคคอร์ดเดียวกัน (users เป็นตาราง auth)
// จึงไม่มีกรณี "ล็อกอินได้แต่ไม่มี user doc" ที่ต้องคอยซ่อมอีกแล้ว
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "./firestore";
import { db } from "./client";
import { onAuthStateChanged, refreshSession, signOut as dbSignOut, type AppUser } from "./auth";
import type { Role, UserDoc, WithId } from "@/lib/types";

interface AuthState {
  user: AppUser | null;
  profile: WithId<UserDoc> | null;
  role: Role | null;
  loading: boolean;
  /** เซิร์ฟเวอร์ยืนยัน role นี้แล้ว (ไม่ใช่ค่าที่จำไว้ในเครื่องซึ่งอาจเก่า)
   *  ใช้กันเด้งออกจากหน้าแอดมินเพราะเครื่องยังไม่รู้ว่าเพิ่งได้สิทธิ์ */
  roleConfirmed: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  user: null,
  profile: null,
  role: null,
  loading: true,
  roleConfirmed: false,
  refresh: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(Ctx);

/** ต่ออายุ token อย่างมากชั่วโมงละครั้ง (ตอนเปิดเว็บ/กลับมาที่แท็บ) */
const REFRESH_EVERY_MS = 60 * 60 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<WithId<UserDoc> | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleConfirmed, setRoleConfirmed] = useState(false);
  /**
   * เคยรู้สิทธิ์จริงของคนนี้แล้วหรือยัง
   *
   * ห้ามลดสิทธิ์เป็น "member" เพราะเหตุชั่วคราว (listener สะดุด)
   * ไม่งั้นแอดมินจะกลายเป็นสมาชิกแวบหนึ่ง → RequireAdmin เด้งออกจากหน้าแอดมิน
   */
  const roleKnownRef = useRef(false);
  const bannedNotifiedRef = useRef(false);
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    let unsubDoc: (() => void) | null = null;
    let unsubBanned: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged((u) => {
      if (unsubDoc) { unsubDoc(); unsubDoc = null; }
      if (unsubBanned) { unsubBanned(); unsubBanned = null; }
      bannedNotifiedRef.current = false;
      // คนละบัญชีแล้ว — ต้องลืมสิทธิ์ของคนก่อน ไม่งั้นสิทธิ์เก่าค้างข้ามบัญชี
      roleKnownRef.current = false;
      setRoleConfirmed(false);

      if (!u) {
        setUser(null);
        setProfile(null);
        setRole(null);
        setLoading(false);
        return;
      }

      setUser(u);

      // ถูกระงับระหว่างใช้งาน → ออกจากระบบทันที (ล็อกอินใหม่ก็ไม่ได้ — hook บน NAS กันไว้)
      unsubBanned = onSnapshot(doc(db, "banned", u.uid), (snap) => {
        if (!snap.exists() || bannedNotifiedRef.current) return;
        bannedNotifiedRef.current = true;
        void dbSignOut();
        alert("บัญชีของคุณถูกระงับ กรุณาติดต่อแอดมิน");
      }, () => {});

      unsubDoc = onSnapshot(
        doc(db, "users", u.uid),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as UserDoc;
            roleKnownRef.current = true;
            setProfile({ id: u.uid, ...data, email: data.email || u.email });
            setRole(data.role ?? "member");
            setRoleConfirmed(true);
            setLoading(false);
            return;
          }
          // บัญชีถูกลบไปแล้ว — token ที่ค้างในเครื่องใช้ต่อไม่ได้
          void dbSignOut();
        },
        () => {
          // listener สะดุด (เน็ตหลุด / NAS รีสตาร์ต) — ห้ามลดสิทธิ์คนที่โหลดสำเร็จไปแล้ว
          if (!roleKnownRef.current) {
            setProfile(null);
            setRole("member");
          }
          // ต่อเซิร์ฟเวอร์ไม่ได้แล้ว — เลิกรอ ไม่งั้นค้างหน้าโหลดถาวร
          setRoleConfirmed(true);
          setLoading(false);
        }
      );
    });

    // ต่ออายุ token ตอนเปิดเว็บและตอนกลับมาที่แท็บ — token หมดอายุ 30 วันถ้าไม่ได้เปิดเลย
    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefreshRef.current < REFRESH_EVERY_MS) return;
      lastRefreshRef.current = Date.now();
      void refreshSession();
    };
    maybeRefresh();
    document.addEventListener("visibilitychange", maybeRefresh);

    return () => {
      unsubAuth();
      if (unsubDoc) unsubDoc();
      if (unsubBanned) unsubBanned();
      document.removeEventListener("visibilitychange", maybeRefresh);
    };
  }, []);

  const value: AuthState = {
    user,
    profile,
    role,
    loading,
    roleConfirmed,
    // ข้อมูลอัปเดตสดอยู่แล้ว — คงไว้เพื่อ backward compat
    refresh: async () => {},
    signOut: dbSignOut,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
