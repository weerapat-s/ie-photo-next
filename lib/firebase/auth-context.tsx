"use client";
// lib/firebase/auth-context.tsx — สถานะ auth ทั่วทั้งแอป
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
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

  async function load(u: User | null) {
    if (!u) {
      setUser(null);
      setProfile(null);
      setRole(null);
      setLoading(false);
      return;
    }
    // role เก็บใน Firestore user doc (ไม่ใช้ custom claim — static app)
    try {
      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) {
        const data = snap.data() as UserDoc;
        setProfile({ id: u.uid, ...data });
        setRole(data.role ?? "member");
      } else {
        setProfile(null);
        setRole("member");
      }
    } catch {
      setProfile(null);
      setRole("member");
    }
    setUser(u);
    setLoading(false);
  }

  useEffect(() => onAuthStateChanged(auth, (u) => load(u)), []);

  const value: AuthState = {
    user,
    profile,
    role,
    loading,
    refresh: async () => {
      if (auth.currentUser) await load(auth.currentUser);
    },
    signOut: async () => {
      await fbSignOut(auth);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
