"use client";
// components/notification-toggle.tsx — เปิด/ปิดการแจ้งเตือน push (ทำงานแม้ปิดแอพ)
import { useEffect, useState } from "react";
import { isPushSupported, getNotificationPermission, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { useAuth } from "@/lib/firebase/auth-context";

export default function NotificationToggle() {
  const { user, profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(isPushSupported());
  }, []);

  const subscribed = !!profile?.pushSubscription;
  const permission = getNotificationPermission();

  async function toggle() {
    if (!user) return;
    setErr("");
    setBusy(true);
    if (subscribed) {
      await unsubscribeFromPush(user.uid);
    } else {
      const res = await subscribeToPush(user.uid);
      if (!res.ok) setErr(res.error || "เปิดการแจ้งเตือนไม่สำเร็จ");
    }
    setBusy(false);
  }

  if (!supported) {
    return (
      <div className="glass-card rounded-3xl p-5">
        <h3 className="mb-1 font-medium">🔔 การแจ้งเตือน</h3>
        <p className="text-sm text-neutral-500">เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-3xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">🔔 การแจ้งเตือน</h3>
          <p className="text-sm text-neutral-500">
            {subscribed
              ? "เปิดอยู่ — แจ้งเตือนงานและการจองใกล้ถึงกำหนด แม้ปิดแอพ"
              : "รับแจ้งเตือนงานที่ได้รับมอบหมายและการจองใกล้ถึงเวลา"}
          </p>
          {permission === "denied" && !subscribed && (
            <p className="mt-1 text-xs text-red-500">
              ถูกบล็อกไว้ในเบราว์เซอร์ — ไปเปิดสิทธิ์แจ้งเตือนในตั้งค่าเบราว์เซอร์ก่อน
            </p>
          )}
        </div>
        <button
          onClick={toggle}
          disabled={busy || permission === "denied"}
          className={`relative h-7 w-12 flex-shrink-0 rounded-full transition disabled:opacity-40 ${
            subscribed ? "bg-orange-500" : "bg-neutral-300"
          }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
              subscribed ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-red-500">⚠️ {err}</p>}
    </div>
  );
}
