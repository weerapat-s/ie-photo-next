// lib/types.ts
// TypeScript types ของ Firestore collections — ตรงกับ MIGRATION_PLAN.md §1
import type { Timestamp } from "firebase/firestore";

export type Role = "member" | "admin" | "super_admin";

export type EquipmentType = "camera" | "lens" | "accessory";
export type EquipmentStatus = "available" | "borrowed" | "maintenance";

export type StudioStatus = "open" | "closed";
export type StudioTheme = "dark" | "light";

export type BookingType = "equipment" | "studio";
export type BookingStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "returned"
  | "cancelled"
  | "pending_return";

export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";

// เก็บ subscription object ที่ browser คืนมาจาก PushManager.subscribe().toJSON()
export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// ── users/{uid} ───────────────────────────────────────────────
export interface UserDoc {
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: Role;
  profileImageUrl: string | null;
  profileCompleted: boolean;
  disabled?: boolean;                                  // UI indicator (security ตัดจริงอยู่ที่ banned/{uid})
  createdAt: Timestamp;
  pushSubscription?: PushSubscriptionData | null;      // legacy — คงไว้ช่วง migrate
  pushSubscriptions?: PushSubscriptionData[] | null;   // multi-device
}

// ── equipments/{id} ───────────────────────────────────────────
export interface EquipmentDoc {
  name: string;
  type: EquipmentType;
  status: EquipmentStatus;
}

// ── studios/{id} ──────────────────────────────────────────────
export interface StudioDoc {
  name: string;
  status: StudioStatus;
  subtitle: string;
  tags: string[];
  features: string[];
  openHours: string;
  contactPhone: string;
  theme: StudioTheme;
}

// ── bookings/{id} ─────────────────────────────────────────────
export interface BookingDoc {
  bookingType: BookingType;
  itemId: string;
  itemName: string; // denormalized
  userId: string | null;
  userName: string; // denormalized
  userPhone: string; // denormalized
  guestName: string | null;
  guestEmail: string | null;
  startAt: Timestamp;
  endAt: Timestamp;
  formImageUrl: string | null;
  returnImageUrl: string | null;
  usageReason: string;
  usageType: string | null;
  status: BookingStatus;
  responsibleUserId: string | null;
  responsibleUserName: string | null; // denormalized
  consentToken: string | null;
  createdAt: Timestamp;
  reminderSentAt?: Timestamp | null; // กันแจ้งเตือนซ้ำ — ตั้งโดย scripts/send-notifications.cjs
}

// ── tasks/{id} ────────────────────────────────────────────────
export interface TaskDoc {
  title: string;
  description: string | null;
  assignedById: string;
  assignedByName: string; // denormalized
  assignedToId: string;
  assignedToName: string; // denormalized
  bookingId: string | null;
  status: TaskStatus;
  dueDate: Timestamp | null;
  createdAt: Timestamp;
  reminderSentAt?: Timestamp | null; // กันแจ้งเตือนซ้ำ — ตั้งโดย scripts/send-notifications.cjs
}

// ── feeds/{id} (รวม feed_likes ด้วย likedBy[]) ─────────────────
export interface FeedDoc {
  message: string;
  bookingId: string | null;
  userId: string | null;
  formImageUrl: string | null;
  bookingStatus: BookingStatus | null; // denormalized
  likedBy: string[]; // array ของ uid (แทนตาราง feed_likes)
  likeCount: number;
  createdAt: Timestamp;
}

// helper: doc พร้อม id
export type WithId<T> = T & { id: string };

export type SlotStatus = "pending" | "approved";

// ── slots/{id} — id เดียวกับ bookings/{id} เสมอ ──────────────
// ข้อมูลตารางล้วน อ่านสาธารณะ ห้ามมีชื่อ/เบอร์/อีเมล/รูป
export interface SlotDoc {
  bookingId: string;
  itemId: string;
  itemName: string;
  bookingType: BookingType;
  startAt: Timestamp;
  endAt: Timestamp;
  status: SlotStatus;
}
