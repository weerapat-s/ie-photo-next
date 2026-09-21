// scripts/test-pb-rules.mjs — ทดสอบกติกาความปลอดภัยของ PocketBase บน NAS
//
// รันผ่าน: bash nas/test-rules.sh   (สร้าง PocketBase ชั่วคราวแยกพอร์ต ทดสอบแล้วลบทิ้ง)
//
// ทดสอบกับของจริง (migrations + hooks ชุดเดียวกับที่ขึ้น production) ไม่ใช่ mock
// แต่ละข้อแปลตรงจาก firestore.rules — ถ้าข้อไหนผ่านบน Firestore เดิม ต้องผ่านที่นี่ด้วย
import PocketBase from "pocketbase";

const URL = process.env.PB_URL;
const SU_EMAIL = process.env.PB_SU_EMAIL;
const SU_PASS = process.env.PB_SU_PASS;
if (!URL || !SU_EMAIL || !SU_PASS) throw new Error("ต้องตั้ง PB_URL, PB_SU_EMAIL, PB_SU_PASS");

/** serverTimestamp() — ต้องตรงกับ SERVER_TIME_MARK ใน nas/pb_hooks/ie_lib.js */
const NOW = "1111-11-11T11:11:11.111Z";
const H = 3600e3;
const iso = (ms) => new Date(ms).toISOString();

let pass = 0;
let fail = 0;
async function expectOk(name, fn) {
  try {
    await fn();
    console.log("  ✓", name);
    pass++;
  } catch (e) {
    console.log("  ✗", name, "→ ถูกปฏิเสธ:", e?.status, e?.response?.message || e?.message);
    fail++;
  }
}
async function expectDenied(name, fn) {
  try {
    await fn();
    console.log("  ✗", name, "→ ผ่านทั้งที่ควรถูกปฏิเสธ");
    fail++;
  } catch (e) {
    if (e?.status >= 400 && e?.status < 500) {
      console.log("  ✓", name, `(${e.status})`);
      pass++;
    } else {
      console.log("  ✗", name, "→ error แปลก:", e?.status, e?.message);
      fail++;
    }
  }
}
function client() {
  const pb = new PocketBase(URL);
  pb.autoCancellation(false);
  return pb;
}

const su = client();
await su.collection("_superusers").authWithPassword(SU_EMAIL, SU_PASS);

// ── ตั้งฉาก ───────────────────────────────────────────────────
const PW = "Test-" + Math.random().toString(36).slice(2) + "-Aa1";
async function mkUser(id, role, extra = {}) {
  await su.collection("users").create({
    id, email: `${id}@test.invalid`, emailVisibility: true, password: PW, passwordConfirm: PW,
    role, studentId: id.slice(0, 8), firstName: id, lastName: "t", nickname: id, phone: "0900000000",
    profileCompleted: true, createdAt: iso(Date.now()), ...extra,
  });
  const c = client();
  await c.collection("users").authWithPassword(`${id}@test.invalid`, PW);
  return c;
}
const superC = await mkUser("superAAAAAAAAAAAAAAAAAAAAAAA", "super_admin");
const adminC = await mkUser("adminAAAAAAAAAAAAAAAAAAAAAAA", "admin");
const memA = await mkUser("memberAAAAAAAAAAAAAAAAAAAAAA", "member");
const memB = await mkUser("memberBBBBBBBBBBBBBBBBBBBBBB", "member");
const crewC = await mkUser("crewCCCCCCCCCCCCCCCCCCCCCCCC", "member");
const guest = client();
const A = memA.authStore.record.id;
const B = memB.authStore.record.id;
const C = crewC.authStore.record.id;

await su.collection("crew").create({ id: C, photographerId: "phot00000000000000001", addedAt: iso(Date.now()) });
await su.collection("studios").create({ id: "studio00000000000001", name: "S", status: "open", subtitle: "", tags: [], features: [], openHours: "", contactPhone: "", theme: "dark" });
await su.collection("photographers").create({ id: "phot00000000000000001", name: "P", uid: C, role: "x", bio: "", skills: [], avatarUrl: "", status: "open", sortOrder: 1 });
await su.collection("forms").create({ id: "formGuestOK000000001", title: "F", description: "", fields: [], binding: "none", active: true, allowGuest: true, successMessage: "", createdById: "x", createdAt: iso(Date.now()), responseCount: 0 });
await su.collection("forms").create({ id: "formMembersOnly00001", title: "F2", description: "", fields: [], binding: "none", active: true, allowGuest: false, successMessage: "", createdById: "x", createdAt: iso(Date.now()), responseCount: 0 });

const start = Date.now() + H;
const baseBooking = (over = {}) => ({
  bookingType: "equipment", itemId: "equip1", itemName: "กล้อง", userId: A, userName: "A", userPhone: "0900000000",
  startAt: iso(start), endAt: iso(start + 3 * H), usageReason: "ทดสอบ", status: "pending",
  requestId: "REQTEST1", createdAt: NOW, liabilityAcceptedAt: NOW, ...over,
});

// ── users ─────────────────────────────────────────────────────
console.log("— users —");
await expectDenied("สมัครเองเป็น admin", () =>
  guest.collection("users").create({ email: "x1@test.invalid", password: PW, passwordConfirm: PW, role: "admin" }));
await expectOk("สมัครเองเป็นสมาชิก", async () => {
  const r = await guest.collection("users").create({ email: "x2@kmitl.ac.th", password: PW, passwordConfirm: PW, studentId: "x2" });
  if (r.role !== "member") throw new Error("role ไม่ใช่ member: " + r.role);
  if ("legacyAuth" in r) throw new Error("legacyAuth หลุดออกมาทาง API");
});
await expectDenied("สมัครด้วยอีเมลนอกสถาบัน", () =>
  guest.collection("users").create({ email: "x3@test.invalid", password: PW, passwordConfirm: PW }));
await expectOk("รหัสผ่าน 6 ตัวใช้ได้ (เท่า Firebase)", () =>
  guest.collection("users").create({ email: "x4@kmitl.ac.th", password: "Ab1234", passwordConfirm: "Ab1234" }));
await expectDenied("legacy-login กับบัญชีที่ไม่ใช่บัญชีย้ายมา", () =>
  guest.send("/api/ie/legacy-login", { method: "POST", body: { email: "x2@kmitl.ac.th", password: PW } }));
await su.collection("users").create({
  id: "legacyLLLLLLLLLLLLLLLLLLLLLLL", email: "legacy@kmitl.ac.th", password: PW, passwordConfirm: PW,
  legacyAuth: true, role: "member",
});
await expectDenied("legacy-login รหัสผิด (Firebase ปฏิเสธ)", () =>
  guest.send("/api/ie/legacy-login", { method: "POST", body: { email: "legacy@kmitl.ac.th", password: "wrong-pass" } }));
await expectDenied("สมาชิกยกตัวเองเป็น admin", () => memA.collection("users").update(A, { role: "admin" }));
await expectOk("สมาชิกแก้ชื่อตัวเอง", () => memA.collection("users").update(A, { firstName: "ใหม่" }));
await expectDenied("สมาชิกแก้ชื่อคนอื่น", () => memA.collection("users").update(B, { firstName: "x" }));
await expectDenied("สมาชิกอ่านรายชื่อคนอื่น", async () => {
  const r = await memA.collection("users").getFullList();
  if (r.some((u) => u.id !== A)) return; // เห็นคนอื่น = ผ่าน (ผิด)
  throw Object.assign(new Error("hidden"), { status: 403 });
});
await expectOk("ตั้ง memberCode ครั้งแรก", () => memA.collection("users").update(A, { memberCode: "ABCDEF12" }));
await expectDenied("เปลี่ยน memberCode ครั้งที่สอง", () => memA.collection("users").update(A, { memberCode: "ZZZZZZ99" }));
await expectDenied("admin ธรรมดายก B เป็น super_admin", () => adminC.collection("users").update(B, { role: "super_admin" }));
await expectDenied("admin ธรรมดาแก้ role ของประธาน", () =>
  adminC.collection("users").update(superC.authStore.record.id, { role: "member" }));
await expectOk("admin แก้ชื่อประธานได้ (ไม่ใช่ช่องสิทธิ์)", () =>
  adminC.collection("users").update(superC.authStore.record.id, { nickname: "ประธาน" }));
await expectOk("ประธานยก B เป็น admin", () => superC.collection("users").update(B, { role: "admin" }));
await superC.collection("users").update(B, { role: "member" });

// ── bookings ──────────────────────────────────────────────────
console.log("— bookings —");
let bookingA;
await expectOk("สมาชิกยืมของ (ติ๊กรับทราบเงื่อนไข)", async () => {
  bookingA = await memA.collection("bookings").create(baseBooking());
});
await expectDenied("ยืมของไม่ติ๊กรับทราบเงื่อนไข", () =>
  memA.collection("bookings").create(baseBooking({ liabilityAcceptedAt: undefined })));
await expectDenied("ปลอมเวลารับทราบเงื่อนไขย้อนหลัง", () =>
  memA.collection("bookings").create(baseBooking({ liabilityAcceptedAt: iso(Date.now() - 86400e3) })));
await expectDenied("ยืมข้ามคืน (>12 ชม.) ไม่บอกที่เก็บ", () =>
  memA.collection("bookings").create(baseBooking({ endAt: iso(start + 13 * H) })));
await expectOk("ยืมข้ามคืน บอกที่เก็บ", () =>
  memA.collection("bookings").create(baseBooking({ endAt: iso(start + 13 * H), overnight: true, overnightStorage: "หอ" })));
await expectDenied("สมาชิกยืมในชื่อคนอื่น", () => memA.collection("bookings").create(baseBooking({ userId: B })));
await expectDenied("สมาชิกสร้างคำขอที่อนุมัติแล้ว", () => memA.collection("bookings").create(baseBooking({ status: "approved" })));
await expectDenied("สมาชิกยืมนานเกิน 7 วัน", () =>
  memA.collection("bookings").create(baseBooking({ endAt: iso(start + 8 * 24 * H), overnight: true, overnightStorage: "x" })));
await expectDenied("ฝังรูป base64 ยาว ๆ ลงคำขอ", () =>
  memA.collection("bookings").create(baseBooking({ formImageUrl: "data:image/jpeg;base64," + "A".repeat(2000) })));
await expectOk("คนนอกจองสตูดิโอ", () =>
  guest.collection("bookings").create(baseBooking({
    bookingType: "studio", itemId: "studio00000000000001", userId: "", guestName: "นอก", guestEmail: "g@test.invalid",
    userName: "นอก", userPhone: "0911111111", liabilityAcceptedAt: undefined,
  })));
await expectDenied("คนนอกยืมอุปกรณ์", () =>
  guest.collection("bookings").create(baseBooking({ userId: "", guestName: "นอก", guestEmail: "g@test.invalid", liabilityAcceptedAt: undefined })));
await expectOk("สมาชิกเห็นคำขอตัวเอง", async () => {
  const r = await memA.collection("bookings").getFullList();
  if (!r.some((b) => b.id === bookingA.id)) throw new Error("ไม่เห็น");
});
await expectDenied("สมาชิก B เห็นคำขอของ A", async () => {
  const r = await memB.collection("bookings").getFullList();
  if (r.some((b) => b.userId === A)) return;
  throw Object.assign(new Error("hidden"), { status: 403 });
});
await expectDenied("เจ้าของแก้ชื่อของในคำขอ", () => memA.collection("bookings").update(bookingA.id, { itemName: "แอบแก้" }));
await expectOk("เจ้าของยกเลิกคำขอที่รออนุมัติ", () => memA.collection("bookings").update(bookingA.id, { status: "cancelled" }));
await expectDenied("สมาชิกอนุมัติคำขอตัวเอง", async () => {
  const b = await memA.collection("bookings").create(baseBooking({ requestId: "REQTEST2" }));
  await memA.collection("bookings").update(b.id, { status: "approved" });
});
await expectOk("admin อนุมัติคำขอ", async () => {
  const b = await memA.collection("bookings").create(baseBooking({ requestId: "REQTEST3" }));
  await adminC.collection("bookings").update(b.id, { status: "approved", pickedUpAt: NOW });
});

// ── งานตากล้อง: ทีมงานกดรับเอง ──────────────────────────────────
console.log("— claimJob —");
const job = await su.collection("bookings").create(baseBooking({
  bookingType: "photographer", itemId: "phot00000000000000001", status: "approved", assigneeIds: [B],
}));
await expectOk("ทีมงานกดรับงาน (เพิ่มตัวเอง)", () => crewC.collection("bookings").update(job.id, { assigneeIds: [B, C] }));
await expectDenied("ทีมงานถอดคนอื่นออก", () => crewC.collection("bookings").update(job.id, { assigneeIds: [C] }));
await expectOk("ทีมงานถอนตัว", () => crewC.collection("bookings").update(job.id, { assigneeIds: [B] }));
await expectDenied("ไม่ใช่ทีมงานกดรับงาน", () => memB.collection("bookings").update(job.id, { assigneeIds: [B, "memberBBBBBBBBBBBBBBBBBBBBBB"] }));

// ── feeds ─────────────────────────────────────────────────────
console.log("— feeds —");
const feed = await su.collection("feeds").create({ message: "m", likedBy: [], likeCount: 0, createdAt: iso(Date.now()) });
await expectOk("ไลก์", () => memA.collection("feeds").update(feed.id, { likedBy: [A], likeCount: 1 }));
await expectDenied("ไลก์ทีเดียวบวก 2", () => memB.collection("feeds").update(feed.id, { likedBy: [A, B], likeCount: 3 }));
await expectDenied("ไลก์แทนคนอื่น", () => memB.collection("feeds").update(feed.id, { likedBy: [A, "someoneElse"], likeCount: 2 }));
await expectOk("เลิกไลก์", () => memA.collection("feeds").update(feed.id, { likedBy: [], likeCount: 0 }));
await expectDenied("สมาชิกแก้ข้อความโพสต์", () => memA.collection("feeds").update(feed.id, { message: "x" }));

// ── tasks ─────────────────────────────────────────────────────
console.log("— tasks —");
const task = await su.collection("tasks").create({
  title: "t", assignedById: "adminAAAAAAAAAAAAAAAAAAAAAAA", assignedByName: "a", assignedToId: A, assignedToName: "A",
  status: "pending", createdAt: iso(Date.now()),
});
await expectOk("ผู้รับงานเปลี่ยนสถานะ", () => memA.collection("tasks").update(task.id, { status: "in_progress" }));
await expectDenied("ผู้รับงานแก้ชื่องาน", () => memA.collection("tasks").update(task.id, { title: "x" }));
await expectDenied("คนอื่นแก้งานที่ไม่ใช่ของตัวเอง", () => memB.collection("tasks").update(task.id, { status: "completed" }));

// ── deliveries ────────────────────────────────────────────────
console.log("— deliveries —");
const del = await su.collection("deliveries").create({
  title: "d", customerName: "c", customerContact: "", assigneeIds: [C], note: "", status: "awaiting_upload",
  createdById: "x", createdAt: iso(Date.now()), uploadUrl: "https://example.invalid/u",
});
await expectOk("ทีมงานแจ้งอัปไฟล์แล้ว", () => crewC.collection("deliveries").update(del.id, { status: "uploaded", updatedAt: NOW }));
await expectDenied("ทีมงานแก้ลิงก์", () => crewC.collection("deliveries").update(del.id, { uploadUrl: "https://evil.invalid" }));
await expectOk("ทีมงานเห็นงานของตัวเอง (assigneeIds)", async () => {
  const r = await crewC.collection("deliveries").getFullList();
  if (!r.some((d) => d.id === del.id)) throw new Error("ไม่เห็น");
});
await expectDenied("คนที่ไม่เกี่ยวเห็นงานส่ง", async () => {
  const r = await memB.collection("deliveries").getFullList();
  if (r.some((d) => d.id === del.id)) return;
  throw Object.assign(new Error("hidden"), { status: 403 });
});

// ── อื่น ๆ ─────────────────────────────────────────────────────
console.log("— อื่น ๆ —");
await expectOk("คนนอกจองช่องเวลา (pending)", () =>
  guest.collection("slots").create({ bookingId: "b1", itemId: "i", itemName: "n", bookingType: "studio", startAt: iso(start), endAt: iso(start + H), status: "pending" }));
await expectDenied("คนนอกสร้างช่องเวลาที่อนุมัติแล้ว", () =>
  guest.collection("slots").create({ bookingId: "b2", itemId: "i", itemName: "n", bookingType: "studio", startAt: iso(start), endAt: iso(start + H), status: "approved" }));
await expectOk("คนนอกตอบฟอร์มที่เปิดให้คนนอก", () =>
  guest.collection("formResponses").create({ formId: "formGuestOK000000001", formTitle: "F", values: { a: "1" }, userId: "", submitterName: "g", submitterContact: "", createdAt: NOW }));
await expectDenied("คนนอกตอบฟอร์มเฉพาะสมาชิก", () =>
  guest.collection("formResponses").create({ formId: "formMembersOnly00001", formTitle: "F2", values: {}, userId: "", submitterName: "g", submitterContact: "", createdAt: NOW }));
await expectDenied("ใส่ชื่อคนอื่นเป็นคนสั่งส่งเมล", () =>
  memA.collection("mailQueue").create({ to: "a@test.invalid", subject: "s", body: "b", status: "queued", kind: "k", sentById: B, createdAt: NOW }));
await expectOk("แก้วันไม่ว่างของตัวเอง", () => memA.collection("availability").create({ id: A, busyDates: ["2026-10-01"] }));
await expectDenied("แก้วันไม่ว่างของคนอื่น", () => memA.collection("availability").create({ id: B, busyDates: [] }));
await expectDenied("สมาชิกอ่านคีย์ AI", () => memA.collection("secrets").getFullList().then((r) => { if (!r.length) throw Object.assign(new Error(), { status: 403 }); }));

// ── บัญชีที่ถูกระงับ ────────────────────────────────────────────
console.log("— banned —");
await expectDenied("admin ธรรมดาระงับประธาน", () =>
  adminC.collection("banned").create({ id: superC.authStore.record.id, bannedAt: NOW }));
await expectOk("admin ระงับสมาชิก B", () => adminC.collection("banned").create({ id: B, bannedAt: NOW, by: adminC.authStore.record.id }));
await expectDenied("B ที่ถูกระงับแก้โปรไฟล์ตัวเอง", () => memB.collection("users").update(B, { firstName: "x" }));
await expectDenied("B ที่ถูกระงับล็อกอินใหม่", () => client().collection("users").authWithPassword(`${B}@test.invalid`, PW));

console.log(`\nPB rules: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
