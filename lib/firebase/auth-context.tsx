"use client";
// lib/firebase/auth-context.tsx — สถานะ auth ทั่วทั้งแอป
// เร็ว: user doc ใช้ onSnapshot → snapshot แรกมาจาก IndexedDB cache แทบทันที
// แล้วค่อย sync จากเซิร์ฟเวอร์เบื้องหลัง (role เปลี่ยนก็อัปเดตสดโดยไม่ต้อง refresh)
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./client";
import type { Role, UserDoc, WithId } from "@/lib/types";

interface AuthState {
  user: User | null;
  profile: WithId<UserDoc> | null;
  role: Role | null;
  loading: boolean;
  /** เซิร์ฟเวอร์ยืนยัน role นี้แล้ว (ไม่ใช่ค่าจาก cache ที่อาจเก่า)
   *  ใช้กันเด้งออกจากหน้าแอดมินเพราะ cache ยังไม่รู้ว่าเพิ่งได้สิทธิ์ */
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<WithId<UserDoc> | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleConfirmed, setRoleConfirmed] = useState(false);
  // กัน heal ซ้ำ: จำ uid ที่พยายามสร้าง doc ซ่อมไปแล้ว
  const healedRef = useRef<Set<string>>(new Set());
  /**
   * เคยรู้สิทธิ์จริงของคนนี้แล้วหรือยัง
   *
   * สำคัญมาก: ห้ามลดสิทธิ์เป็น "member" เพราะเหตุชั่วคราว
   * (listener สะดุด หรือ snapshot แรกจาก cache ที่ยังไม่มี doc)
   * ไม่งั้นแอดมินจะกลายเป็นสมาชิกแวบหนึ่ง → RequireAdmin เด้งออกจากหน้าแอดมิน
   * → พอ snapshot จริงมาก็กลับเป็นแอดมิน = สิทธิ์สลับไปมา
   */
  const roleKnownRef = useRef(false);
  // กัน alert ซ้ำเมื่อ banned
  const bannedNotifiedRef = useRef(false);

  useEffect(() => {
    let unsubDoc: (() => void) | null = null;
    let unsubBanned: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      // เลิก subscribe doc ของ user คนก่อน
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

      // ตรวจการถูกระงับ: subscribe banned/{uid} → force sign-out ถ้ามี doc
      unsubBanned = onSnapshot(doc(db, "banned", u.uid), (snap) => {
        if (!snap.exists() || bannedNotifiedRef.current) return;
        bannedNotifiedRef.current = true;
        fbSignOut(auth);
        alert("บัญชีของคุณถูกระงับ กรุณาติดต่อแอดมิน");
      }, () => {});

      // realtime + cache-first: snapshot แรกมาจาก cache (เร็ว) แล้วตามด้วย server
      unsubDoc = onSnapshot(
        doc(db, "users", u.uid),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as UserDoc;
            roleKnownRef.current = true;
            setProfile({ id: u.uid, ...data });
            setRole(data.role ?? "member");
            // มาจากเซิร์ฟเวอร์ = สิทธิ์นี้เชื่อถือได้แล้ว (cache อาจเก่ากว่าความจริง)
            if (!snap.metadata.fromCache) setRoleConfirmed(true);
            setLoading(false);
            return;
          }

          // ไม่มี doc — ต้องแยกให้ออกว่า "cache ยังไม่มี" กับ "ไม่มีจริงบนเซิร์ฟเวอร์"
          if (snap.metadata.fromCache) {
            // cache ยังไม่มีข้อมูล ≠ บัญชีไม่มีสิทธิ์ — ห้ามสรุปว่าเป็น member
            // เคยรู้สิทธิ์แล้ว: คงไว้เหมือนเดิม · ยังไม่เคยรู้: รอ snapshot จากเซิร์ฟเวอร์
            if (roleKnownRef.current) setLoading(false);
            return;
          }

          // เซิร์ฟเวอร์ยืนยันว่าไม่มี doc จริง
          roleKnownRef.current = true;
          setProfile(null);
          setRole("member");
          setRoleConfirmed(true);
          setLoading(false);
          // ซ่อมบัญชีค้าง: auth มีแต่ user doc หาย (สมัครค้าง/โดนลบ doc)
          // → สร้าง doc member ให้ใหม่ ไม่งั้นหน้าโปรไฟล์บันทึกไม่ได้ตลอดไป
          // ถ้าถูกแบน rules จะปฏิเสธ create อัตโนมัติ (banned/{uid} เช็คที่ rules)
          if (!healedRef.current.has(u.uid)) {
            healedRef.current.add(u.uid);
            setDoc(doc(db, "users", u.uid), {
              studentId: (u.email || "").split("@")[0],
              firstName: "",
              lastName: "",
              email: u.email || "",
              phone: "",
              role: "member",
              profileImageUrl: null,
              profileCompleted: false,
              createdAt: serverTimestamp(),
            }).catch(() => {});
          }
        },
        () => {
          // listener สะดุด (เน็ตหลุด / rules เพิ่ง deploy / โควตา)
          // ห้ามลดสิทธิ์คนที่โหลดสำเร็จไปแล้ว — เคยทำให้แอดมินโดนเด้งออกจากหน้าแอดมิน
          // แล้วเด้งกลับเมื่อ listener ฟื้น = สิทธิ์สลับไปมา
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

    return () => {
      unsubAuth();
      if (unsubDoc) unsubDoc();
      if (unsubBanned) unsubBanned();
    };
  }, []);

  const value: AuthState = {
    user,
    profile,
    role,
    loading,
    roleConfirmed,
    // onSnapshot อัปเดตเองอยู่แล้ว — คงไว้เพื่อ backward compat
    refresh: async () => {},
    signOut: async () => {
      await fbSignOut(auth);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
