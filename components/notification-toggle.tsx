"use client";
// components/notification-toggle.tsx — เปิด/ปิดการแจ้งเตือน push (ทำงานแม้ปิดแอพ)
import { useCallback, useEffect, useState } from "react";
import { isPushSupported, getNotificationPermission, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { useAuth } from "@/lib/firebase/auth-context";
import { useBrowserValue } from "@/lib/hooks";
import { Card, Switch } from "@/components/ui";
import Icon from "@/components/icon";

export default function NotificationToggle() {
  const { user, profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [endpoint, setEndpoint] = useState<string | null>(null);

  // ความสามารถของเบราว์เซอร์ — อ่านตอน render ไม่ได้ตรง ๆ เลยอ่านผ่าน store ภายนอก
  const readSupported = useCallback(() => isPushSupported(), []);
  const readPermission = useCallback(() => getNotificationPermission(), []);
  const supported = useBrowserValue(readSupported, true);
  const permission = useBrowserValue<NotificationPermission | "unsupported">(readPermission, "default");

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((r) => r.pushManager.getSubscription())
      .then((s) => setEndpoint(s?.endpoint ?? null))
      .catch(() => {});
  }, []);

  // เช็คว่า endpoint เครื่องนี้ลงทะเบียนอยู่แล้วใน pushSubscriptions array หรือ pushSubscription แบบเดี่ยว (legacy)
  const subscribed =
    !!endpoint &&
    ((profile?.pushSubscriptions?.some((s) => s.endpoint === endpoint) ?? false) ||
      profile?.pushSubscription?.endpoint === endpoint);

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
      else if (typeof window !== "undefined" && "serviceWorker" in navigator) {
        const r = await navigator.serviceWorker.ready;
        const s = await r.pushManager.getSubscription();
        setEndpoint(s?.endpoint ?? null);
      }
    }
    setBusy(false);
  }

  if (!supported) {
    return (
      <Card>
        <h3 className="t-heading mb-1 flex items-center gap-2 text-[var(--ink)]"><Icon name="notify" size={18} /> การแจ้งเตือน</h3>
        <p className="text-sm text-[var(--muted-ink)]">เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="t-heading flex items-center gap-2 text-[var(--ink)]"><Icon name="notify" size={18} /> การแจ้งเตือน</h3>
          <p className="text-sm text-[var(--muted-ink)]">
            {subscribed
              ? "เปิดอยู่ — เตือนงานและการจองใกล้ถึงกำหนด แม้ปิดแอพ"
              : "รับแจ้งเตือนงานที่ได้รับมอบหมายและการจองใกล้ถึงเวลา"}
          </p>
          {permission === "denied" && !subscribed && (
            <p className="mt-1 text-xs text-red-600">
              ถูกบล็อกไว้ในเบราว์เซอร์ — เปิดสิทธิ์แจ้งเตือนในตั้งค่าเบราว์เซอร์ก่อน
            </p>
          )}
        </div>
        <Switch
          checked={!!subscribed}
          onChange={toggle}
          disabled={busy || (!subscribed && permission === "denied")}
          label="เปิด/ปิดการแจ้งเตือน"
        />
      </div>
      {err && <p className="mt-2 flex items-center gap-1 text-xs text-[var(--tone-bad-ink)]"><Icon name="warning" size={16} /> {err}</p>}
    </Card>
  );
}
