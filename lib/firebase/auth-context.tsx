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
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  user: null,
  profile: null,
  role: null,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<WithId<UserDoc> | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  // กัน heal ซ้ำ: จำ uid ที่พยายามสร้าง doc ซ่อมไปแล้ว
  const healedRef = useRef<Set<string>>(new Set());
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
            setProfile({ id: u.uid, ...data });
            setRole(data.role ?? "member");
          } else {
            setProfile(null);
            setRole("member");
            // ซ่อมบัญชีค้าง: auth มีแต่ user doc หาย (สมัครค้าง/โดนลบ doc)
            // → สร้าง doc member ให้ใหม่ ไม่งั้นหน้าโปรไฟล์บันทึกไม่ได้ตลอดไป
            // ถ้าถูกแบน rules จะปฏิเสธ create อัตโนมัติ (banned/{uid} เช็คที่ rules)
            // (เช็ค fromCache กันเคส snapshot แรกจาก cache ยังไม่เห็น doc บนเซิร์ฟเวอร์)
            if (!snap.metadata.fromCache && !healedRef.current.has(u.uid)) {
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
          }
          setLoading(false);
        },
        () => {
          setProfile(null);
          setRole("member");
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
    // onSnapshot อัปเดตเองอยู่แล้ว — คงไว้เพื่อ backward compat
    refresh: async () => {},
    signOut: async () => {
      await fbSignOut(auth);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
