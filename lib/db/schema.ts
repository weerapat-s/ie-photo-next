// lib/db/schema.ts — โครงตารางของฐานข้อมูลบน NAS (PocketBase) ที่เดียวจบ
//
// ใช้สองที่ ต้องตรงกันเสมอ:
//   1. scripts/gen-pb-migration.mjs อ่านไฟล์นี้แล้วสร้าง nas/pb_migrations/*_collections.js
//   2. ชั้นข้อมูล lib/db (แทน firebase/firestore) ใช้แปลงค่าไป-กลับ:
//      PocketBase ไม่มีค่า null สำหรับ text/date/number — ว่างคือ "" หรือ 0
//      ต้องรู้ว่าช่องไหน "ว่างได้" ถึงจะแปลงกลับเป็น null ให้โค้ดเดิมที่เช็ค === null ทำงานเหมือนเดิม
//      และต้องรู้ว่าช่องไหนเป็นวันที่ ถึงจะคืนเป็น Timestamp ที่มี .toMillis() เหมือน Firestore
//
// ชนิด:
//   text     ข้อความสั้น (เพดาน 5,000 ตัวอักษร)
//   longtext ข้อความยาว/รูป data URL เดิม (เพดาน 2 ล้านตัวอักษร)
//   number · bool · date · json (array/object/ค่าที่เป็น null ได้แท้ ๆ)
//
// id ทุกตารางรับ ID เดิมของ Firestore (20 ตัว) และ UID ของ Firebase (28 ตัว) ได้
// — ทดสอบบน NAS จริงแล้ว การย้ายข้อมูลจึงรักษา ID และการอ้างอิงข้ามตารางไว้ครบ

export type FieldKind = "text" | "longtext" | "number" | "bool" | "date" | "json";

export interface FieldDef {
  kind: FieldKind;
  /** ค่าว่างของ PocketBase ("" / 0) ให้คืนเป็น null — json เป็น null ได้เองอยู่แล้ว */
  nullable?: boolean;
}

export type CollectionDef = Record<string, FieldDef>;

const t: FieldDef = { kind: "text" };
const tn: FieldDef = { kind: "text", nullable: true };
const lt: FieldDef = { kind: "longtext" };
const ltn: FieldDef = { kind: "longtext", nullable: true };
const num: FieldDef = { kind: "number" };
const numn: FieldDef = { kind: "number", nullable: true };
const bool: FieldDef = { kind: "bool" };
const date: FieldDef = { kind: "date" };
const daten: FieldDef = { kind: "date", nullable: true };
const json: FieldDef = { kind: "json" };

export const SCHEMA = {
  // ตาราง auth — email/password เป็นช่องระบบของ PocketBase ไม่ต้องประกาศ
  users: {
    studentId: t,
    firstName: t,
    lastName: t,
    nickname: t,
    phone: t,
    role: t,
    skills: json,
    seniority: numn,
    note: tn,
    title: tn,
    profileImageUrl: ltn,
    profileCompleted: bool,
    disabled: bool,
    createdAt: date,
    pushSubscription: json,
    pushSubscriptions: json,
    memberCode: t,
  },
  // deletedAccount: ลบบัญชีทิ้งแล้วกันสมัครซ้ำ (members-panel)
  banned: { bannedAt: date, by: tn, deletedAccount: bool },
  crew: { photographerId: t, addedAt: daten },
  availability: { busyDates: json, notes: json, updatedAt: daten },
  equipments: {
    name: t,
    type: t,
    status: t,
    code: t,
    note: tn,
    imageUrl: ltn,
    responsibleUserId: tn,
    responsibleUserName: tn,
    assignedAt: daten,
    createdAt: daten,
    pairGroups: json,
  },
  studios: {
    name: t,
    status: t,
    subtitle: t,
    tags: json,
    features: json,
    openHours: t,
    contactPhone: t,
    theme: t,
  },
  photographers: {
    name: t,
    uid: tn,
    role: t,
    bio: lt,
    skills: json,
    avatarUrl: ltn,
    status: t,
    sortOrder: num,
  },
  slots: {
    bookingId: t,
    itemId: t,
    itemName: t,
    bookingType: t,
    startAt: date,
    endAt: date,
    status: t,
  },
  bookings: {
    bookingType: t,
    itemId: t,
    itemName: t,
    userId: tn,
    userName: t,
    userPhone: t,
    guestName: tn,
    guestEmail: tn,
    startAt: date,
    endAt: date,
    formImageUrl: ltn,
    returnImageUrl: ltn,
    usageReason: lt,
    usageType: tn,
    status: t,
    assigneeIds: json,
    responsibleUserId: tn,
    responsibleUserName: tn,
    consentToken: tn,
    createdAt: date,
    reminderSentAt: daten,
    location: tn,
    crewSize: numn,
    formId: tn,
    formResponseId: tn,
    discordNotifiedAt: daten,
    pickedUpAt: daten,
    liabilityAcceptedAt: daten,
    approvedById: tn,
    approvedByName: tn,
    approvedAt: daten,
    requestId: t,
    overnight: bool,
    overnightStorage: tn,
    handoverImageUrl: ltn,
    // กรรมการกดรับคืนเมื่อไร (borrowed-panel)
    returnedAt: daten,
  },
  tasks: {
    title: t,
    description: { kind: "longtext", nullable: true },
    assignedById: t,
    assignedByName: t,
    assignedToId: t,
    assignedToName: t,
    bookingId: tn,
    status: t,
    dueDate: daten,
    createdAt: date,
    reminderSentAt: daten,
  },
  aiChats: {
    title: t,
    ownerId: t,
    ownerName: t,
    turnsJson: lt,
    turnCount: num,
    createdAt: date,
    updatedAt: date,
  },
  mailQueue: {
    to: t,
    subject: t,
    body: lt,
    status: t,
    kind: t,
    refId: tn,
    dedupeKey: tn,
    replyTo: tn,
    sentById: tn,
    // true / false / null มีความหมายต่างกัน (ดู app/(admin)/mail) — bool ของ PocketBase เป็น null ไม่ได้
    forwarded: json,
    error: tn,
    createdAt: date,
    sentAt: daten,
  },
  feeds: {
    message: lt,
    bookingId: tn,
    userId: tn,
    formImageUrl: ltn,
    bookingStatus: tn,
    likedBy: json,
    likeCount: num,
    createdAt: date,
  },
  forms: {
    title: t,
    description: lt,
    fields: json,
    binding: t,
    active: bool,
    allowGuest: bool,
    successMessage: lt,
    createdById: t,
    createdAt: date,
    updatedAt: daten,
    responseCount: num,
  },
  formResponses: {
    formId: t,
    formTitle: t,
    values: json,
    userId: tn,
    submitterName: t,
    submitterContact: t,
    bookingId: tn,
    createdAt: date,
  },
  deliveries: {
    title: t,
    bookingId: tn,
    customerUserId: tn,
    customerName: t,
    customerContact: t,
    assigneeIds: json,
    assignedToId: tn,
    assignedToName: tn,
    uploadUrl: tn,
    downloadUrl: tn,
    passcode: tn,
    note: lt,
    status: t,
    dueAt: daten,
    expiresAt: daten,
    createdById: t,
    createdAt: date,
    updatedAt: daten,
  },
  // settings/app และ secrets/ai — record เดียว id ตายตัว
  settings: {
    siteName: t,
    tagline: t,
    contactPhone: t,
    contactEmail: t,
    galleryUrl: t,
    accentColor: t,
    maxAdvanceDays: num,
    maxBorrowDays: num,
    maxStudioHours: num,
    requireBorrowDocument: bool,
    allowGuestStudioBooking: bool,
    allowGuestPhotographerBooking: bool,
    photographerJobTypes: json,
    maxCrewSize: num,
    notifyEmail: bool,
    notifyEmailAddress: t,
    mailSenderStudentId: t,
    memberTitles: json,
    nasBaseUrl: t,
    nasUploadHint: lt,
    uploadLinkUrl: t,
    deliveryDefaultDays: num,
    featureFeed: bool,
    featureTasks: bool,
    featureBorrow: bool,
    featureStudio: bool,
    featurePhotographer: bool,
    featureForms: bool,
    featureDeliveries: bool,
    announcement: lt,
    updatedAt: daten,
    updatedBy: tn,
  },
  secrets: {
    baseUrl: t,
    apiKey: t,
    model: t,
    models: json,
    enabled: bool,
    // webhook ของ Discord สำหรับแจ้งเตือนจากเซิร์ฟเวอร์ — เดิมอยู่ใน GitHub Actions secret
    discordWebhookUrl: t,
    updatedAt: daten,
  },
} satisfies Record<string, CollectionDef>;

export type CollectionName = keyof typeof SCHEMA;

export function isCollection(name: string): name is CollectionName {
  return Object.prototype.hasOwnProperty.call(SCHEMA, name);
}
