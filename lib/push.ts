"use client";
// lib/push.ts — Web Push subscription helpers (ทำงานได้แม้ปิดแอพ ผ่าน service worker)
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { PushSubscriptionData } from "@/lib/types";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** ขอสิทธิ์ + subscribe push + บันทึกลง Firestore user doc */
export async function subscribeToPush(uid: string): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: "เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน" };
  if (!VAPID_PUBLIC_KEY) return { ok: false, error: "ยังไม่ได้ตั้งค่า VAPID key" };

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, error: "ไม่ได้รับอนุญาตแจ้งเตือน" };

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    const json = sub.toJSON();
    const data: PushSubscriptionData = {
      endpoint: json.endpoint!,
      keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
    };
    await updateDoc(doc(db, "users", uid), { pushSubscription: data });
    return { ok: true };
  } catch {
    return { ok: false, error: "เปิดการแจ้งเตือนไม่สำเร็จ" };
  }
}

/** ยกเลิก subscribe + ล้างค่าใน Firestore */
export async function unsubscribeFromPush(uid: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch {
    // ไม่ critical
  }
  await updateDoc(doc(db, "users", uid), { pushSubscription: null });
}
