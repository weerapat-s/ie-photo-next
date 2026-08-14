"use client";
// components/notification-toggle.tsx — เปิด/ปิดการแจ้งเตือน push (ทำงานแม้ปิดแอพ)
import { useEffect, useState, useSyncExternalStore } from "react";
import { isPushSupported, getNotificationPermission, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { useAuth } from "@/lib/firebase/auth-context";

const subscribeToCapabilities = () => () => {};
const getServerPushSupport = () => true;
const getServerPermission = (): NotificationPermission | "unsupported" => "default";

export default function NotificationToggle() {
  const { user, profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const supported = useSyncExternalStore(subscribeToCapabilities, isPushSupported, getServerPushSupport);
  const permission = useSyncExternalStore(subscribeToCapabilities, getNotificationPermission, getServerPermission);

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then((r) => r.pushManager.getSubscription())
        .then((s) => setEndpoint(s?.endpoint ?? null))
        .catch(() => {});
    }
  }, []);

  // เช็คว่า endpoint เครื่องนี้ลงทะเบียนอยู่แล้วใน pushSubscriptions array หรือ pushSubscription แบบเดี่ยว (legacy)
  const subscribed = !!endpoint && (
    (profile?.pushSubscriptions?.some((s) => s.endpoint === endpoint) ?? false) ||
    (profile?.pushSubscription?.endpoint === endpoint)
  );

  async function toggle() {
    if (!user) return;
    setErr("");
    setBusy(true);
    if (subscribed) {
      await unsubscribeFromPush(user.uid);
      setEndpoint(null);
    } else {
      const res = await subscribeToPush(user.uid);
      if (!res.ok) setErr(res.error || "เปิดการแจ้งเตือนไม่สำเร็จ");
      else {
        if (typeof window !== "undefined" && "serviceWorker" in navigator) {
          const r = await navigator.serviceWorker.ready;
          const s = await r.pushManager.getSubscription();
          setEndpoint(s?.endpoint ?? null);
        }
      }
    }
    setBusy(false);
  }

  if (!supported) {
    return (
      <div className="glass-card rounded-3xl p-5">
        <h3 className="mb-1 font-medium text-slate-100">🔔 การแจ้งเตือน</h3>
        <p className="text-sm text-slate-400">เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-3xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium text-slate-100">🔔 การแจ้งเตือน</h3>
          <p className="text-sm text-slate-400">
            {subscribed
              ? "เปิดอยู่ — แจ้งเตือนงานและการจองใกล้ถึงกำหนด แม้ปิดแอพ"
              : "รับแจ้งเตือนงานที่ได้รับมอบหมายและการจองใกล้ถึงเวลา"}
          </p>
          {permission === "denied" && !subscribed && (
            <p className="mt-1 text-xs text-red-400">
              ถูกบล็อกไว้ในเบราว์เซอร์ — ไปเปิดสิทธิ์แจ้งเตือนในตั้งค่าเบราว์เซอร์ก่อน
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy || (!subscribed && permission === "denied")}
          role="switch"
          aria-checked={subscribed}
          aria-label="เปิดหรือปิดการแจ้งเตือน"
          className={`relative h-7 w-12 flex-shrink-0 rounded-full transition disabled:opacity-40 ${
            subscribed ? "bg-orange-500 shadow-[0_0_12px_rgba(255,91,31,0.4)]" : "bg-slate-700"
          }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
              subscribed ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-red-400">⚠️ {err}</p>}
    </div>
  );
}
