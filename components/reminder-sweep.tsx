"use client";
// components/reminder-sweep.tsx — ตัวกวาดหาของที่ถึงกำหนดแล้วส่งอีเมลเตือน
//
// ทำไมไม่ใช้ cron: แอปเป็น static export บน Firebase Spark ไม่มีเซิร์ฟเวอร์ให้ตั้งเวลา
// (Cloud Functions ต้องอัปเป็น Blaze) จึงกวาดตอนกรรมการเปิดแอป ซึ่งเกิดขึ้นทุกวันอยู่แล้ว
//
// กันส่งซ้ำด้วยคีย์ kind:refId:uid:วันที่ — เปิดแอปกี่รอบต่อวันก็ได้อีเมลฉบับเดียว
// ตัวนี้เรนเดอร์ไม่มีอะไรเลย ทำงานเงียบ ๆ ข้างหลัง ล้มก็ไม่กระทบการใช้งาน
import { useEffect, useRef } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { useSettings } from "@/lib/settings-context";
import { useCollection } from "@/lib/hooks";
import { isAdminRole } from "@/lib/roles";
import { fmtDateTime } from "@/lib/format";
import {
  allReminders,
  dedupeKey,
  daysLate,
  type Reminder,
} from "@/lib/reminders";
import {
  sendMail,
  borrowDueSoon,
  borrowOverdue,
  jobSoon,
  taskDueSoon,
  deliveryDue,
  type MailTemplate,
} from "@/lib/mail";
import type {
  AiConfigDoc,
  AppSettings,
  BookingDoc,
  DeliveryDoc,
  TaskDoc,
  UserDoc,
  WithId,
} from "@/lib/types";

/** เว้นระยะก่อนกวาดซ้ำในเซสชันเดียวกัน — เปิดหน้าใหม่ไปมาไม่ต้องกวาดทุกครั้ง */
const SWEEP_EVERY_MS = 30 * 60_000;
const LAST_SWEEP_KEY = "iephoto:lastReminderSweep";

export default function ReminderSweep() {
  const { role, user } = useAuth();
  const { settings } = useSettings();
  const isAdmin = isAdminRole(role);
  const on = isAdmin && !!user && settings.notifyEmail !== false;

  const { data: bookings } = useCollection<BookingDoc>(() => (on ? collection(db, "bookings") : null), [on]);
  const { data: tasks } = useCollection<TaskDoc>(() => (on ? collection(db, "tasks") : null), [on]);
  const { data: deliveries } = useCollection<DeliveryDoc>(() => (on ? collection(db, "deliveries") : null), [on]);
  const { data: users } = useCollection<UserDoc>(() => (on ? collection(db, "users") : null), [on]);

  const ranRef = useRef(false);

  useEffect(() => {
    if (!on || ranRef.current) return;
    // ต้องมีข้อมูลครบก่อนถึงจะตัดสินได้ว่าอะไรถึงกำหนด — ยิงตอนลิสต์ยังว่างจะพลาดของจริง
    if (users.length === 0) return;

    let last = 0;
    try {
      last = Number(localStorage.getItem(LAST_SWEEP_KEY) ?? 0);
    } catch {
      // โหมดส่วนตัวอ่าน localStorage ไม่ได้ — ถือว่ายังไม่เคยกวาด
    }
    const now = Date.now();
    if (now - last < SWEEP_EVERY_MS) return;
    ranRef.current = true;

    void sweep({ bookings, tasks, deliveries, users, now, settings }).finally(() => {
      try {
        localStorage.setItem(LAST_SWEEP_KEY, String(now));
      } catch {
        /* เขียนไม่ได้ก็ปล่อย — อย่างมากคือกวาดซ้ำ ซึ่งมีคีย์กันส่งซ้ำอยู่แล้ว */
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, bookings, tasks, deliveries, users]);

  return null;
}

/** สร้างเนื้ออีเมลจากรายการเตือน 1 รายการ */
function templateFor(
  r: Reminder,
  name: string,
  siteName: string,
  uploadLink: string
): MailTemplate | null {
  const when = fmtDateTime({ toMillis: () => r.dueMs } as never);
  switch (r.kind) {
    case "borrow_due_soon":
      return borrowDueSoon({ name, siteName, items: r.title, until: when, hoursLeft: r.hoursLeft });
    case "borrow_overdue":
      return borrowOverdue({ name, siteName, items: r.title, until: when, daysLate: daysLate(r.hoursLeft) });
    case "job_soon":
      return jobSoon({ name, siteName, jobTitle: r.title, when, location: r.location, hoursLeft: r.hoursLeft });
    case "task_due_soon":
      return taskDueSoon({
        name,
        siteName,
        title: r.title,
        due: when,
        daysLeft: Math.max(0, Math.floor(r.hoursLeft / 24)),
      });
    case "delivery_due":
      return deliveryDue({
        name,
        siteName,
        jobTitle: r.title,
        due: when,
        daysLeft: Math.floor(r.hoursLeft / 24),
        uploadLink,
      });
    default:
      return null;
  }
}

async function sweep(input: {
  bookings: WithId<BookingDoc>[];
  tasks: WithId<TaskDoc>[];
  deliveries: WithId<DeliveryDoc>[];
  users: WithId<UserDoc>[];
  now: number;
  settings: AppSettings;
}) {
  const { bookings, tasks, deliveries, users, now, settings } = input;
  const due = allReminders({ bookings, tasks, deliveries, now });
  if (due.length === 0) return;

  // ดึงคีย์ที่ส่งไปแล้ววันนี้มาทีเดียว แทนที่จะถามทีละฉบับ
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const sentKeys = new Set<string>();
  try {
    const snap = await getDocs(
      query(collection(db, "mailQueue"), where("createdAt", ">=", dayStart))
    );
    for (const d of snap.docs) {
      const k = (d.data() as { dedupeKey?: string }).dedupeKey;
      if (k) sentKeys.add(k);
    }
  } catch {
    // อ่านคิวไม่ได้ = ไม่รู้ว่าเคยส่งอะไรไปแล้ว หยุดดีกว่าเสี่ยงสแปม
    return;
  }

  // ตั้งค่า AI ถือ baseUrl ของ Worker ที่เป็นตัวส่งอีเมลด้วย
  let aiBaseUrl: string | undefined;
  try {
    const { getDoc, doc } = await import("firebase/firestore");
    const cfg = await getDoc(doc(db, "secrets", "ai"));
    aiBaseUrl = (cfg.data() as AiConfigDoc | undefined)?.baseUrl;
  } catch {
    /* ไม่มีก็ใช้ค่าเริ่มต้น */
  }

  const userOf = new Map(users.map((u) => [u.id, u]));

  for (const r of due) {
    for (const uid of r.userIds) {
      const key = dedupeKey(r, uid, now);
      if (sentKeys.has(key)) continue;
      const u = userOf.get(uid);
      if (!u?.email) continue;

      const tpl = templateFor(
        r,
        u.nickname?.trim() || u.firstName || "ทีมงาน",
        settings.siteName,
        settings.uploadLinkUrl
      );
      if (!tpl) continue;

      sentKeys.add(key); // กันซ้ำในรอบเดียวกันด้วย
      await sendMail({ ...tpl, to: u.email, kind: r.kind, refId: r.refId, dedupeKey: key }, aiBaseUrl);
    }
  }
}
