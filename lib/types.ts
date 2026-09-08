// lib/types.ts
// TypeScript types ของ Firestore collections
import type { Timestamp } from "firebase/firestore";

export type Role = "member" | "admin" | "super_admin";

export type EquipmentType = "camera" | "lens" | "memory" | "accessory";
export type EquipmentStatus = "available" | "borrowed" | "maintenance";

export type StudioStatus = "open" | "closed";
export type StudioTheme = "dark" | "light";

/** photographer = จองตากล้อง (ทีมงานไปถ่ายให้ตามงาน) */
export type BookingType = "equipment" | "studio" | "photographer";
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
  /** ชื่อเล่น — บังคับกรอก ใช้เรียกกันจริงในชุมนุมมากกว่าชื่อจริง */
  nickname?: string;
  email: string;
  phone: string;
  role: Role;
  /** ความถนัด เช่น ["Portrait","Video","ตัดต่อ"] — AI ใช้จับคู่คนกับงาน */
  skills?: string[];
  /** ระดับความสำคัญ/ประสบการณ์ 1–5 — AI ใช้ถ่วงน้ำหนักตอนจัดทีม */
  seniority?: number;
  /** โน้ตของกรรมการเกี่ยวกับคนนี้ เช่น "ถนัดงานกลางคืน" */
  note?: string | null;
  /** ยศในชุมนุม เช่น "ประธานชุมนุม" "เลขานุการ" — คนละเรื่องกับ role (สิทธิ์ในระบบ)
   *  แก้ได้จากหน้า /users · ตัวเลือกตั้งได้ในหน้า /settings */
  title?: string | null;
  profileImageUrl: string | null;
  profileCompleted: boolean;
  disabled?: boolean;                                  // UI indicator (security ตัดจริงอยู่ที่ banned/{uid})
  createdAt: Timestamp;
  pushSubscription?: PushSubscriptionData | null;      // legacy — คงไว้ช่วง migrate
  pushSubscriptions?: PushSubscriptionData[] | null;   // multi-device
}

// ── equipments/{id} ───────────────────────────────────────────
/** ตั้งค่าผู้ช่วย AI — เก็บที่ secrets/ai อ่านได้เฉพาะกรรมการ */
export interface AiConfigDoc {
  /** ปลายทางที่เข้ากันได้กับ OpenAI API เช่น https://<worker>.workers.dev/v1 */
  baseUrl: string;
  /** ว่างได้ถ้า proxy ถือคีย์ไว้เอง */
  apiKey: string;
  /** โมเดลหลัก */
  model: string;
  /** ลำดับสำรองเมื่อโควตาหมด — เว้นว่าง = ใช้ DEFAULT_CHAIN */
  models?: string[];
  /** ปิดผู้ช่วยชั่วคราวโดยไม่ต้องลบค่าตั้งค่า */
  enabled: boolean;
}

/** กลุ่มของที่ต้องเบิกคู่กัน — เช่น กล้องตัวหนึ่งต้องมีเลนส์ 1 ตัว และเมม 1 ใบเสมอ
 *  เลือก "อย่างน้อย 1 ชิ้น" ในกลุ่มถึงจะจองได้ (ไม่ใช่ต้องเอาทุกชิ้น) */
export interface PairGroup {
  /** ชื่อกลุ่มที่ผู้ใช้เห็น เช่น "เลนส์" "เมมโมรี่การ์ด" */
  label: string;
  /** อุปกรณ์ที่เลือกได้ในกลุ่มนี้ */
  itemIds: string[];
  /** true = ไม่เลือกแล้วจองไม่ได้ · false = แค่แนะนำ */
  required: boolean;
}

export interface EquipmentDoc {
  name: string;
  type: EquipmentType;
  status: EquipmentStatus;
  note?: string | null;
  imageUrl?: string | null;
  /** ผู้ดูแลของชิ้นนี้ — กรรมการสั่งมอบหมายได้ ใครถือ/ใครรับผิดชอบตอนนี้ */
  responsibleUserId?: string | null;
  responsibleUserName?: string | null;
  /** เวลาที่มอบหมายล่าสุด ใช้ไล่ประวัติคร่าว ๆ */
  assignedAt?: Timestamp | null;
  /** ของที่ต้องเบิกคู่กับชิ้นนี้ — ตั้งค่าโดยกรรมการที่หน้า /resources */
  pairGroups?: PairGroup[];
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

// ── photographers/{id} — ทีมตากล้องที่เปิดให้จอง ──────────────
// อ่านสาธารณะได้ (ให้บุคคลภายนอกเลือกทีมก่อนส่งคำขอ) จึงห้ามมีเบอร์/อีเมลส่วนตัว
export interface PhotographerDoc {
  name: string;
  /** ผูกกับบัญชีสมาชิก (ถ้ามี) — ใช้ส่งงาน/แจ้งเตือนเข้าบัญชีนั้น */
  uid: string | null;
  role: string;                 // เช่น "ช่างภาพหลัก", "ตากล้องวิดีโอ", "ผู้ช่วย"
  bio: string;
  skills: string[];             // เช่น ["Portrait","Event","Video"]
  avatarUrl: string | null;     // data URL ย่อแล้ว
  /** เปิด/ปิดรับงาน */
  status: StudioStatus;         // open | closed — ใช้ชนิดเดียวกับสตูดิโอ
  /** ลำดับแสดงผล น้อยขึ้นก่อน */
  sortOrder: number;
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
  /**
   * ผู้รับผิดชอบงานนี้ — เก็บเป็น uid หลายคนได้ (1 งานหลายคน / 1 คนหลายงาน)
   * เป็นแหล่งความจริงเดียว: ทั้งกรรมการสั่งมอบหมาย และตากล้องกดรับเอง เขียนฟิลด์นี้
   * ชื่อไม่เก็บซ้ำไว้ที่นี่ — resolve จาก users ตอนแสดงผล กันข้อมูลเพี้ยนกันเอง
   */
  assigneeIds?: string[];
  /** @deprecated ของเดิมสมัยมอบหมายได้คนเดียว — คงไว้เพราะ rules ตอนสร้างยังตรวจอยู่ */
  responsibleUserId: string | null;
  /** @deprecated ดู assigneeIds แทน */
  responsibleUserName: string | null;
  consentToken: string | null;
  createdAt: Timestamp;
  reminderSentAt?: Timestamp | null; // กันแจ้งเตือนซ้ำ — ตั้งโดย scripts/send-notifications.cjs
  /** งานตากล้อง: สถานที่ถ่าย */
  location?: string | null;
  /** งานตากล้อง: จำนวนตากล้องที่ขอ */
  crewSize?: number | null;
  /** คำตอบจากฟอร์มที่แนบกับ flow นี้ (formId + values) */
  formId?: string | null;
  formResponseId?: string | null;
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

// ── aiChats/{id} — ประวัติคุยกับผู้ช่วย (กรรมการเท่านั้น) ───────
export interface AiChatDoc {
  title: string;
  /** uid ของคนที่เริ่มบทสนทนา */
  ownerId: string;
  ownerName: string;
  /** เก็บเป็น JSON string เพื่อไม่ให้ nested array ชน limit ของ Firestore */
  turnsJson: string;
  turnCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ── mailQueue/{id} — คิวอีเมลรอส่ง (Worker เป็นคนส่งจริง) ────────
export type MailStatus = "queued" | "sent" | "failed";

export interface MailDoc {
  to: string;
  subject: string;
  /** ข้อความล้วน — ไม่ใช้ HTML เพื่อกันการฝังลิงก์หลอก */
  body: string;
  status: MailStatus;
  /** เหตุที่ส่ง เช่น "assigned" "due_soon" — ใช้กันส่งซ้ำ */
  kind: string;
  /** id ของสิ่งที่อ้างถึง (bookingId / taskId) — คู่กับ kind ใช้กันซ้ำ */
  refId: string | null;
  /** คีย์กันส่งซ้ำรายวัน kind:refId:uid:วันที่ */
  dedupeKey?: string | null;
  error?: string | null;
  createdAt: Timestamp;
  sentAt?: Timestamp | null;
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

// ═══ ฟอร์มที่สร้างเองได้ ═══════════════════════════════════════
export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "email"
  | "tel"
  | "date"
  | "time"
  | "datetime"
  | "select"
  | "radio"
  | "checkbox"
  | "image"
  | "heading";

export interface FormField {
  id: string;              // key ที่ใช้เก็บค่าใน values
  type: FieldType;
  label: string;
  placeholder?: string;
  help?: string;
  required: boolean;
  /** select | radio | checkbox */
  options?: string[];
  /** text/textarea: ความยาวสูงสุด · number: ค่าต่ำสุด/สูงสุด (null = ไม่กำหนด) */
  maxLength?: number | null;
  min?: number | null;
  max?: number | null;
}

/** ฟอร์มผูกกับ flow ไหน — "none" = ฟอร์มอิสระ (แชร์ลิงก์ได้เลย) */
export type FormBinding = "none" | "equipment" | "studio" | "photographer";

// ── forms/{id} ────────────────────────────────────────────────
export interface FormDoc {
  title: string;
  description: string;
  fields: FormField[];
  binding: FormBinding;
  /** true = เปิดรับคำตอบ */
  active: boolean;
  /** true = คนนอกที่ไม่ล็อกอินก็ส่งได้ */
  allowGuest: boolean;
  /** ข้อความที่ขึ้นหลังส่งสำเร็จ */
  successMessage: string;
  createdById: string;
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
  responseCount: number;
}

export type FormValue = string | number | boolean | string[] | null;

// ── formResponses/{id} ────────────────────────────────────────
export interface FormResponseDoc {
  formId: string;
  formTitle: string;          // denormalized — กันฟอร์มถูกลบแล้วอ่านไม่รู้เรื่อง
  values: Record<string, FormValue>;
  userId: string | null;
  submitterName: string;
  submitterContact: string;   // เบอร์หรืออีเมลที่ติดต่อกลับได้
  bookingId: string | null;
  createdAt: Timestamp;
}

// ═══ ระบบส่งงาน / ลิงก์ NAS ═══════════════════════════════════
export type DeliveryStatus =
  | "awaiting_upload"   // รอทีมงานอัปไฟล์ขึ้น NAS
  | "uploaded"          // อัปแล้ว รอตรวจ
  | "delivered"         // ส่งให้ลูกค้าแล้ว
  | "archived";         // ปิดงาน/หมดอายุลิงก์

// ── deliveries/{id} ───────────────────────────────────────────
// เก็บลิงก์ NAS 2 เส้น: uploadUrl (ให้ทีมงานอัปขึ้น) / downloadUrl (ให้ลูกค้าโหลด)
export interface DeliveryDoc {
  title: string;
  bookingId: string | null;
  /** ผู้รับงาน (ลูกค้า) — uid ถ้าเป็นสมาชิก */
  customerUserId: string | null;
  customerName: string;
  customerContact: string;
  /** ทีมงานที่รับผิดชอบอัปไฟล์ — หลายคนได้ */
  assigneeIds?: string[];
  /** @deprecated ของเดิมสมัยมอบหมายได้คนเดียว — ยังเขียนไว้เป็นคนแรกเพื่อความเข้ากันได้ */
  assignedToId: string | null;
  /** @deprecated ดู assigneeIds แทน */
  assignedToName: string | null;
  uploadUrl: string | null;
  downloadUrl: string | null;
  /** รหัสผ่านของลิงก์แชร์ (ถ้าตั้งไว้ใน Nextcloud) */
  passcode: string | null;
  note: string;
  status: DeliveryStatus;
  dueAt: Timestamp | null;
  expiresAt: Timestamp | null;
  createdById: string;
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
}

// ── availability/{uid} — วันที่ทีมงานแจ้งว่าไม่ว่าง ────────────
// ตากล้องแก้ของตัวเองได้ กรรมการอ่านได้ทุกคนเพื่อดูก่อนสั่งงาน
// "ไม่ระบุ = ว่าง" — ระบบจึงสั่งงานได้ทันทีถ้าไม่ได้กันวันไว้
export interface AvailabilityDoc {
  /** วันที่ไม่ว่าง รูปแบบ YYYY-MM-DD (เวลาท้องถิ่น) */
  busyDates: string[];
  /** เหตุผลสั้น ๆ ต่อวัน — ไม่บังคับ ใช้ให้กรรมการเข้าใจบริบท */
  notes?: Record<string, string>;
  updatedAt?: Timestamp | null;
}

// ═══ settings/app — ปรับได้ทั้งหมดจากหน้าเว็บ ══════════════════
export interface AppSettings {
  // แบรนด์ / ข้อมูลติดต่อ
  siteName: string;
  tagline: string;
  contactPhone: string;
  contactEmail: string;
  galleryUrl: string;        // ลิงก์อัลบั้มกิจกรรม
  accentColor: string;       // hex — ใช้เป็นสีหลักทั้งระบบ

  // กติกาการจอง
  maxAdvanceDays: number;    // จองล่วงหน้าได้ไม่เกินกี่วัน
  maxBorrowDays: number;     // ยืมอุปกรณ์ได้นานสุดกี่วัน
  maxStudioHours: number;    // จองสตูดิโอต่อครั้งได้กี่ชั่วโมง
  requireBorrowDocument: boolean;  // บังคับแนบเอกสารตอนยืม
  allowGuestStudioBooking: boolean;
  allowGuestPhotographerBooking: boolean;

  // งานตากล้อง
  photographerJobTypes: string[];   // ประเภทงานให้เลือกในฟอร์ม
  maxCrewSize: number;

  // ยศในชุมนุม — ตัวเลือกที่แอดมินกำหนดให้สมาชิกได้
  /** เปิด/ปิดการแจ้งเตือนทางอีเมล */
  notifyEmail: boolean;
  /** อีเมลกลางของชุมนุม — สำเนาการแจ้งเตือนสำคัญ */
  notifyEmailAddress: string;
  memberTitles: string[];

  // ส่งงาน / NAS
  nasBaseUrl: string;               // โดเมน NAS ที่ใช้ เช่น https://nextcloud.ienas.site
  nasUploadHint: string;            // คำอธิบายวิธีอัปไฟล์ที่โชว์ให้ทีมงาน
  /** ลิงก์อัปโหลดกลาง (NextCloud share) — ใช้เมื่อไม่ได้แนบลิงก์เฉพาะงาน */
  uploadLinkUrl: string;
  deliveryDefaultDays: number;      // กำหนดส่งงานเริ่มต้น (วัน)

  // ฟีเจอร์เปิด/ปิด
  featureFeed: boolean;
  featureTasks: boolean;
  featureBorrow: boolean;
  featureStudio: boolean;
  featurePhotographer: boolean;
  featureForms: boolean;
  featureDeliveries: boolean;

  // ข้อความประกาศบนหัวเว็บ ("" = ไม่แสดง)
  announcement: string;

  updatedAt?: Timestamp | null;
  updatedBy?: string | null;
}

/** ค่าเริ่มต้น — ใช้เมื่อยังไม่มี doc settings/app ในฐานข้อมูล */
export const DEFAULT_SETTINGS: AppSettings = {
  siteName: "IE-Photo",
  tagline: "ระบบจองอุปกรณ์ สตูดิโอ และตากล้อง",
  contactPhone: "062-148-1739",
  contactEmail: "ie_photo@kmitl.ac.th",
  galleryUrl: "https://nextcloud.ienas.site/s/z6gZY5wcSiCoXBg",
  accentColor: "#ef3961",

  maxAdvanceDays: 90,
  maxBorrowDays: 7,
  maxStudioHours: 24,
  requireBorrowDocument: true,
  allowGuestStudioBooking: true,
  allowGuestPhotographerBooking: true,

  photographerJobTypes: [
    "งานอีเวนต์ / กิจกรรม",
    "ถ่ายภาพบุคคล / Portrait",
    "ถ่ายภาพสินค้า",
    "ถ่ายวิดีโอ / MV",
    "ไลฟ์สตรีม",
    "ถ่ายภาพหมู่ / รับปริญญา",
  ],
  maxCrewSize: 6,

  notifyEmail: true,
  notifyEmailAddress: "ietechphoto@gmail.com",
  memberTitles: [
    "ประธานชุมนุม",
    "รองประธาน",
    "เลขานุการ",
    "เหรัญญิก",
    "หัวหน้าฝ่ายภาพนิ่ง",
    "หัวหน้าฝ่ายวิดีโอ",
    "ฝ่ายอุปกรณ์",
    "ฝ่ายประชาสัมพันธ์",
  ],

  nasBaseUrl: "https://nextcloud.ienas.site",
  nasUploadHint: "อัปไฟล์ต้นฉบับทั้งหมดขึ้นโฟลเดอร์ที่ลิงก์ไว้ ห้ามลบไฟล์ของคนอื่น",
  uploadLinkUrl: "https://nextcloud.ienas.site/s/z6gZY5wcSiCoXBg",
  deliveryDefaultDays: 7,

  featureFeed: true,
  featureTasks: true,
  featureBorrow: true,
  featureStudio: true,
  featurePhotographer: true,
  featureForms: true,
  featureDeliveries: true,

  announcement: "",
};
