// lib/db/auth.ts — ล็อกอิน/สมัคร/ลืมรหัส กับ PocketBase บน NAS (แทน firebase/auth)
//
// error ที่โยนออกไปมี .code ชุดเดียวกับ Firebase ("auth/invalid-credential" ฯลฯ)
// หน้าเว็บเดิมที่แปลง code เป็นข้อความภาษาไทยจึงใช้ต่อได้เลย
import { ClientResponseError } from "pocketbase";
import { pb } from "./client";
import { SERVER_TIME_MARK } from "./firestore";

/** ผู้ใช้ที่ล็อกอินอยู่ — หน้าตาเท่าที่แอปใช้จาก User ของ Firebase */
export interface AppUser {
  uid: string;
  email: string;
  /** token ส่งให้บริการฝั่งเซิร์ฟเวอร์ตรวจว่าเป็นใคร (แทน ID token ของ Firebase) */
  getIdToken(): Promise<string>;
}

export class AuthError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function currentUser(): AppUser | null {
  const r = pb.authStore.record;
  if (!pb.authStore.isValid || !r || r.collectionName !== "users") return null;
  return {
    uid: r.id,
    email: (r.email as string) || "",
    getIdToken: async () => pb.authStore.token,
  };
}

function authError(e: unknown, fallback = "auth/internal-error"): AuthError {
  if (e instanceof AuthError) return e;
  if (e instanceof ClientResponseError) {
    const data = (e.response?.data ?? {}) as Record<string, { code?: string }>;
    const msg = (e.response?.message as string) || e.message;
    if (e.isAbort || e.status === 0) return new AuthError("auth/network-request-failed", msg);
    if (e.status === 429) return new AuthError("auth/too-many-requests", msg);
    if (data.email?.code === "validation_not_unique") return new AuthError("auth/email-already-in-use", msg);
    if (data.email) return new AuthError("auth/invalid-email", msg);
    if (data.password) return new AuthError("auth/weak-password", msg);
    // hook ปฏิเสธพร้อมเหตุผลภาษาไทย (เช่น บัญชีถูกระงับ / อีเมลนอกสถาบัน)
    if (e.status === 403 || (e.status === 400 && /[฀-๿]/.test(msg))) return new AuthError("auth/rejected", msg);
    if (e.status === 400) return new AuthError("auth/invalid-credential", msg);
    if (e.status >= 500) return new AuthError("auth/unavailable", msg);
  }
  return new AuthError(fallback, e instanceof Error ? e.message : String(e));
}

/**
 * ล็อกอินด้วยอีเมล + รหัสผ่าน
 * ไม่ผ่านกับ NAS → ลองเส้นบัญชีที่ย้ายมาจาก Firebase (ใช้รหัสเดิมได้ครั้งแรก — ดู nas/pb_hooks/ie_auth.js)
 */
export async function signInWithEmailAndPassword(email: string, password: string): Promise<AppUser> {
  try {
    await pb.collection("users").authWithPassword(email, password);
  } catch (e) {
    const first = authError(e);
    if (first.code !== "auth/invalid-credential") throw first;
    try {
      const res = await pb.send<{ token: string; record: Record<string, unknown> }>("/api/ie/legacy-login", {
        method: "POST",
        body: { email, password },
      });
      pb.authStore.save(res.token, res.record as never);
    } catch (e2) {
      throw authError(e2);
    }
  }
  return currentUser()!;
}

/** สมัครสมาชิก — hook บน NAS บังคับ role = member และอีเมล @kmitl.ac.th */
export async function createUserWithEmailAndPassword(email: string, password: string): Promise<AppUser> {
  try {
    await pb.collection("users").create({
      email,
      password,
      passwordConfirm: password,
      emailVisibility: true,
      studentId: email.split("@")[0],
      firstName: "",
      lastName: "",
      phone: "",
      role: "member",
      profileCompleted: false,
      createdAt: SERVER_TIME_MARK,
    });
    await pb.collection("users").authWithPassword(email, password);
  } catch (e) {
    throw authError(e);
  }
  return currentUser()!;
}

/** ส่งลิงก์ตั้งรหัสใหม่ — NAS ตอบสำเร็จเสมอไม่ว่าอีเมลจะมีในระบบหรือไม่ (กันเดาว่าใครเป็นสมาชิก) */
export async function sendPasswordResetEmail(email: string): Promise<void> {
  try {
    await pb.collection("users").requestPasswordReset(email);
  } catch (e) {
    throw authError(e);
  }
}

/** ตั้งรหัสใหม่จากลิงก์ในอีเมล */
export async function confirmPasswordReset(token: string, password: string): Promise<void> {
  try {
    await pb.collection("users").confirmPasswordReset(token, password, password);
  } catch (e) {
    const err = authError(e);
    if (err.code === "auth/invalid-credential") throw new AuthError("auth/invalid-action-code", err.message);
    throw err;
  }
}

export async function signOut(): Promise<void> {
  pb.authStore.clear();
}

/**
 * ต่ออายุ token + เช็คว่าบัญชียังอยู่ (ถูกลบ/ระงับ = หลุดออก)
 * คืน false เมื่อ token ใช้ไม่ได้แล้ว
 */
export async function refreshSession(): Promise<boolean> {
  if (!pb.authStore.isValid) return false;
  try {
    await pb.collection("users").authRefresh();
    return true;
  } catch (e) {
    // เน็ตหลุด/เซิร์ฟเวอร์ล่ม ≠ token เสีย — อย่าเตะผู้ใช้ออกเพราะเหตุชั่วคราว
    if (e instanceof ClientResponseError && (e.status === 401 || e.status === 403 || e.status === 404)) {
      pb.authStore.clear();
      return false;
    }
    return true;
  }
}

/** ฟังการล็อกอิน/ออก — เรียกทันทีหนึ่งครั้งด้วยสถานะปัจจุบัน (แบบ onAuthStateChanged) */
export function onAuthStateChanged(cb: (user: AppUser | null) => void): () => void {
  let last: string | null | undefined = undefined;
  const fire = () => {
    const u = currentUser();
    const id = u?.uid ?? null;
    if (id === last) return; // แค่ต่ออายุ token ไม่ต้องแจ้ง
    last = id;
    cb(u);
  };
  const unsub = pb.authStore.onChange(fire);
  queueMicrotask(fire);
  return unsub;
}
