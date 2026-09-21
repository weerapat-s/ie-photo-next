// nas/pb_hooks/ie_cron.js — แจ้งเตือนตามเวลา (แทน GitHub Actions + cron ของ okmd-proxy เดิม)
//
// เดิมกระจายอยู่สองที่ และทั้งคู่อ่าน Firestore ซึ่งเลิกใช้แล้ว:
//   • scripts/send-notifications.cjs (GitHub Actions ทุก 30 นาที) — push + Discord
//   • workers/cron-reminders.js (okmd-proxy ทุกเช้า) — อีเมลเตือน
// ตอนนี้ NAS อ่านฐานข้อมูลตัวเองตรง ๆ แล้วส่งเอง (ตั้งเวลาไว้ใน ie_cron.pb.js)
//
// ส่งอะไร:
//   everyHalfHour  push: งานย่อยใกล้กำหนด 24 ชม. / การจองจะเริ่มใน 3 ชม.
//                  Discord: คำขอจองใหม่ที่ยังไม่เคยแจ้ง
//   morning        อีเมลเตือน (ของใกล้ครบกำหนดคืน/เลยกำหนด งานถ่าย งานย่อย ไฟล์งาน)
//                  Discord: สรุปของค้างเลยกำหนดคืน
//
// ปลายทาง:
//   อีเมล → Worker iephoto-nas (ie_mail.js)   push → container iephoto-push (nas/push)
//   Discord → webhook ใน secrets/ai.discordWebhookUrl (กรรมการตั้งในหน้าแอดมินของ PocketBase)

const SITE = "https://iephoto.ienas.site";
const PUSH_URL = "http://iephoto-push:8097/push";
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const TZ = 7 * HOUR; // เวลาไทย UTC+7 ไม่มี DST
const LEAD = { borrowHours: 24, jobHours: 24, taskDays: 2, deliveryDays: 2 }; // ตรงกับ lib/reminders.ts
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// ── ตัวช่วย ────────────────────────────────────────────────────

function ms(rec, f) {
  const s = rec.getString(f);
  if (!s) return null;
  const t = Date.parse(s.replace(" ", "T"));
  return isNaN(t) ? null : t;
}
function arr(rec, f) {
  try {
    const v = JSON.parse(rec.getString(f) || "null");
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
}
const pad = (n) => (n < 10 ? "0" : "") + n;
/** "22 ก.ย. 14:00" เวลาไทย (JSVM ไม่มี Intl ต้องจัดรูปเอง) */
function thWhen(t) {
  const d = new Date(t + TZ);
  return d.getUTCDate() + " " + TH_MONTH[d.getUTCMonth()] + " " + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes());
}
function thTime(t) {
  const d = new Date(t + TZ);
  return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes());
}
/** YYYY-MM-DD HH:MM เวลาไทย — รูปแบบเดียวกับอีเมลเตือนเดิม */
function fmtWhen(t) {
  return new Date(t + TZ).toISOString().replace("T", " ").slice(0, 16);
}
function bkkDay(t) {
  return new Date(t + TZ).toISOString().slice(0, 10);
}
function list(app, collection, filter) {
  return app.findRecordsByFilter(collection, filter || "id != ''", "", 0, 0);
}
function setting(app) {
  try {
    return app.findRecordById("settings", "app");
  } catch (_) {
    return null;
  }
}
function discordUrl(app) {
  try {
    return app.findRecordById("secrets", "ai").getString("discordWebhookUrl").trim();
  } catch (_) {
    return "";
  }
}
function stampNow(app, rec, field) {
  rec.set(field, new DateTime());
  app.save(rec);
}

function postDiscord(url, content) {
  const res = $http.send({
    url: url,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: content }),
    timeout: 20,
  });
  if (res.statusCode !== 200 && res.statusCode !== 204) throw new Error("Discord HTTP " + res.statusCode);
}

// ── push ───────────────────────────────────────────────────────

/** ส่ง push ถึงทุกเครื่องของคนนี้ — คืน true ถ้าถึงอย่างน้อยหนึ่งเครื่อง */
function pushTo(app, uid, payload) {
  let user;
  try {
    user = app.findRecordById("users", uid);
  } catch (_) {
    return false;
  }
  let subs = arr(user, "pushSubscriptions");
  if (!subs.length) {
    try {
      const legacy = JSON.parse(user.getString("pushSubscription") || "null");
      if (legacy && legacy.endpoint) subs = [legacy];
    } catch (_) {}
  }
  if (!subs.length) return false;

  let ok = 0;
  const keep = [];
  for (const sub of subs) {
    let status = "error";
    try {
      const res = $http.send({
        url: PUSH_URL,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub, payload: payload }),
        timeout: 20,
      });
      status = (res.json && res.json.status) || "error";
    } catch (err) {
      app.logger().warn("push: ติดต่อ iephoto-push ไม่ได้", "error", String(err));
    }
    if (status === "sent") ok++;
    // เครื่องที่ยกเลิกรับแจ้งเตือนแล้ว — ลบทิ้ง ไม่ต้องลองอีก
    if (status !== "gone") keep.push(sub);
  }
  if (keep.length !== subs.length) {
    user.set("pushSubscriptions", keep);
    app.save(user);
  }
  return ok > 0;
}

function pushTasks(app, now) {
  let sent = 0;
  const tasks = list(app, "tasks", "(status = 'pending' || status = 'in_progress') && reminderSentAt = ''");
  for (const t of tasks) {
    const due = ms(t, "dueDate");
    const uid = t.getString("assignedToId");
    // ครบกำหนดภายใน 24 ชม. หรือเลยมาแล้วไม่เกิน 7 วัน
    if (due === null || !uid || due > now + DAY || due < now - 7 * DAY) continue;
    const ok = pushTo(app, uid, {
      title: due < now ? "⏰ งานเลยกำหนดแล้ว" : "📋 งานใกล้ครบกำหนด",
      body: t.getString("title"),
      url: "/my-tasks",
      tag: "task-" + t.id,
    });
    if (ok) {
      stampNow(app, t, "reminderSentAt");
      sent++;
    }
  }
  return sent;
}

function pushBookings(app, now) {
  let sent = 0;
  const bookings = list(app, "bookings", "status = 'approved' && reminderSentAt = '' && userId != ''");
  for (const b of bookings) {
    const start = ms(b, "startAt");
    if (start === null || start < now || start > now + 3 * HOUR) continue;
    const ok = pushTo(app, b.getString("userId"), {
      title: "🎬 การจองใกล้ถึงเวลาแล้ว",
      body: b.getString("itemName") + " — เริ่ม " + thWhen(start),
      url: "/my-bookings",
      tag: "booking-" + b.id,
    });
    if (ok) {
      stampNow(app, b, "reminderSentAt");
      sent++;
    }
  }
  return sent;
}

// ── Discord ────────────────────────────────────────────────────

const TYPE_LABEL = { equipment: "📷 อุปกรณ์", studio: "🎬 สตูดิโอ", photographer: "📸 ตากล้อง" };

function discordNewBookings(app) {
  const url = discordUrl(app);
  if (!url) return 0;
  let sent = 0;
  for (const b of list(app, "bookings", "status = 'pending' && discordNotifiedAt = ''")) {
    const start = ms(b, "startAt");
    const end = ms(b, "endAt");
    const member = b.getString("userId") !== "";
    const who = member ? b.getString("userName") : (b.getString("guestName") || b.getString("userName")) + " (บุคคลภายนอก)";
    const phone = b.getString("userPhone");
    const overnight = b.getBool("overnight");
    const content =
      (overnight ? "🌙 **คำขอยืมข้ามคืน — ต้องให้กรรมการดู**\n" : "📥 **คำขอจองใหม่รอตรวจสอบ**\n") +
      (TYPE_LABEL[b.getString("bookingType")] || b.getString("bookingType")) + " — **" + b.getString("itemName") + "**\n" +
      (overnight ? "🏠 เก็บไว้ที่: " + (b.getString("overnightStorage") || "ไม่ระบุ") + "\n" : "") +
      "👤 " + who + (phone ? " · 📞 " + phone : "") + "\n" +
      "🕐 " + (start ? thWhen(start) : "?") + " → " + (end ? thTime(end) : "?") + "\n" +
      "🔗 " + SITE + "/bookings";
    try {
      postDiscord(url, content);
      stampNow(app, b, "discordNotifiedAt");
      sent++;
    } catch (err) {
      app.logger().warn("discord: แจ้งคำขอใหม่ไม่สำเร็จ", "booking", b.id, "error", String(err));
    }
  }
  return sent;
}

function discordOverdue(app, now) {
  const url = discordUrl(app);
  if (!url) return 0;
  const rows = list(app, "bookings", "(status = 'approved' || status = 'pending_return') && bookingType = 'equipment'")
    .filter((b) => {
      const end = ms(b, "endAt");
      return end !== null && end < now;
    })
    .sort((a, z) => ms(a, "endAt") - ms(z, "endAt"));
  if (!rows.length) return 0;

  const shown = rows.slice(0, 25);
  const lines = shown.map((b) => {
    const late = Math.max(1, Math.floor((now - ms(b, "endAt")) / DAY));
    const phone = b.getString("userPhone");
    return (
      "• **" + b.getString("itemName") + "** — " + b.getString("userName") + " · เลยกำหนด " + late + " วัน" +
      (phone ? " · 📞 " + phone : "") + (b.getBool("overnight") ? " · 🌙 ยืมข้ามคืน" : "")
    );
  });
  const more = rows.length > shown.length ? "\n…และอีก " + (rows.length - shown.length) + " รายการ" : "";
  postDiscord(url, "⏰ **ของค้างเลยกำหนดคืน " + rows.length + " รายการ**\n" + lines.join("\n") + more + "\n🔗 " + SITE + "/borrow-log");
  return rows.length;
}

// ── อีเมลเตือน (พอร์ตจาก workers/cron-reminders.js — ตรรกะเดียวกับ lib/reminders.ts) ──

function computeReminders(app, now) {
  const out = [];
  const hoursLeft = (t) => Math.round((t - now) / HOUR);

  for (const b of list(app, "bookings", "status = 'approved'")) {
    const type = b.getString("bookingType");
    if (type === "equipment") {
      const due = ms(b, "endAt");
      if (due === null) continue;
      const base = { refId: b.id, userIds: b.getString("userId") ? [b.getString("userId")] : [], title: b.getString("itemName"), dueMs: due, hoursLeft: hoursLeft(due) };
      if (due < now) out.push(Object.assign({ kind: "borrow_overdue" }, base));
      else if (base.hoursLeft <= LEAD.borrowHours) out.push(Object.assign({ kind: "borrow_due_soon" }, base));
    } else if (type === "photographer") {
      const start = ms(b, "startAt");
      if (start === null || start < now || hoursLeft(start) > LEAD.jobHours) continue;
      const ids = arr(b, "assigneeIds");
      if (!ids.length) continue;
      out.push({ kind: "job_soon", refId: b.id, userIds: ids, title: b.getString("usageType") || b.getString("itemName"), dueMs: start, hoursLeft: hoursLeft(start), location: b.getString("location") });
    }
  }
  for (const t of list(app, "tasks", "status != 'completed' && status != 'cancelled'")) {
    const due = ms(t, "dueDate");
    if (due === null || hoursLeft(due) > LEAD.taskDays * 24) continue;
    out.push({ kind: "task_due_soon", refId: t.id, userIds: t.getString("assignedToId") ? [t.getString("assignedToId")] : [], title: t.getString("title"), dueMs: due, hoursLeft: hoursLeft(due) });
  }
  for (const d of list(app, "deliveries", "status != 'delivered' && status != 'archived'")) {
    const due = ms(d, "dueAt");
    if (due === null || hoursLeft(due) > LEAD.deliveryDays * 24) continue;
    let ids = arr(d, "assigneeIds");
    if (!ids.length && d.getString("assignedToId")) ids = [d.getString("assignedToId")];
    if (!ids.length) continue;
    out.push({ kind: "delivery_due", refId: d.id, userIds: ids, title: d.getString("title"), dueMs: due, hoursLeft: hoursLeft(due) });
  }
  return out.sort((a, b) => a.hoursLeft - b.hoursLeft);
}

function mailTemplate(r, name, siteName, uploadLink) {
  const when = fmtWhen(r.dueMs);
  const foot = "\n\n— อีเมลเตือนอัตโนมัติ ไม่ต้องตอบกลับ\n" + siteName + " · ชุมนุมถ่ายภาพ IE-Photo สจล.";
  const late = Math.max(1, Math.ceil(-r.hoursLeft / 24));
  switch (r.kind) {
    case "borrow_due_soon":
      return { subject: "[" + siteName + "] ใกล้ครบกำหนดคืน: " + r.title, body: "สวัสดี " + name + "\n\nอุปกรณ์ \"" + r.title + "\" ใกล้ครบกำหนดคืน (" + when + ")\nเหลือประมาณ " + r.hoursLeft + " ชั่วโมง — ถ้ายังใช้ไม่เสร็จ ติดต่อกรรมการก่อนถึงกำหนด\n\nดูที่ " + SITE + "/my" + foot };
    case "borrow_overdue":
      return { subject: "[" + siteName + "] เลยกำหนดคืนแล้ว: " + r.title, body: "สวัสดี " + name + "\n\nอุปกรณ์ \"" + r.title + "\" เลยกำหนดคืนมาแล้ว " + late + " วัน\nกรุณาคืนโดยเร็ว หรือแจ้งกรรมการว่าติดปัญหาอะไร\n\nดูที่ " + SITE + "/my" + foot };
    case "job_soon":
      return { subject: "[" + siteName + "] เตือนงานถ่ายใกล้ถึง: " + r.title, body: "สวัสดี " + name + "\n\nคุณมีงานถ่าย \"" + r.title + "\" ในอีกประมาณ " + r.hoursLeft + " ชั่วโมง (" + when + ")" + (r.location ? "\nสถานที่: " + r.location : "") + "\nเช็กอุปกรณ์ให้พร้อม ถ้าไปไม่ได้แจ้งกรรมการทันที\n\nดูที่ " + SITE + "/calendar" + foot };
    case "task_due_soon":
      return { subject: "[" + siteName + "] งานย่อยใกล้กำหนดส่ง: " + r.title, body: "สวัสดี " + name + "\n\nงาน \"" + r.title + "\" ใกล้ถึงกำหนดส่ง (" + when + ")\nถ้าทำไม่ทัน แจ้งกรรมการตั้งแต่ตอนนี้\n\nดูที่ " + SITE + "/my" + foot };
    case "delivery_due":
      return { subject: "[" + siteName + "] ไฟล์งานใกล้กำหนดส่ง: " + r.title, body: "สวัสดี " + name + "\n\nไฟล์งาน \"" + r.title + "\" ใกล้ถึงกำหนดส่ง (" + when + ")\nอัปไฟล์ขึ้นที่เก็บกลาง: " + uploadLink + "\nแล้วกดยืนยันในระบบ\n\nดูที่ " + SITE + "/my" + foot };
  }
  return null;
}

function emailReminders(app, now) {
  const s = setting(app);
  if (s && s.getString("notifyEmail") === "false") return 0;
  const siteName = (s && s.getString("siteName")) || "IE-Photo";
  const uploadLink = (s && s.getString("uploadLinkUrl")) || SITE;
  const reminders = computeReminders(app, now);
  if (!reminders.length) return 0;

  // คีย์กันส่งซ้ำ kind:refId:uid:วันไทย — ตรงกับฝั่งเว็บ (lib/reminders.ts) ทั้งสองทางจึงไม่ส่งซ้ำกัน
  const sentKeys = {};
  const since = new Date(now - 36 * HOUR).toISOString().replace("T", " ");
  for (const m of list(app, "mailQueue", "dedupeKey != '' && createdAt >= {:since}".replace("{:since}", "'" + since + "'"))) {
    sentKeys[m.getString("dedupeKey")] = true;
  }
  const mail = require(`${__hooks}/ie_mail.js`);
  const mailCol = app.findCollectionByNameOrId("mailQueue");
  const day = bkkDay(now);
  let count = 0;

  for (const r of reminders) {
    for (const uid of r.userIds) {
      const key = r.kind + ":" + r.refId + ":" + uid + ":" + day;
      if (sentKeys[key]) continue;
      let u;
      try {
        u = app.findRecordById("users", uid);
      } catch (_) {
        continue;
      }
      const to = u.email();
      if (!to) continue;
      const t = mailTemplate(r, (u.getString("nickname") || u.getString("firstName") || "ทีมงาน").trim(), siteName, uploadLink);
      if (!t) continue;
      sentKeys[key] = true;

      const log = new Record(mailCol);
      log.set("to", to);
      log.set("subject", t.subject.slice(0, 200));
      log.set("body", t.body.slice(0, 4000));
      log.set("kind", r.kind);
      log.set("refId", r.refId);
      log.set("dedupeKey", key);
      log.set("createdAt", new DateTime());
      try {
        mail.send(app, { to: to, subject: t.subject, text: t.body });
        log.set("status", "sent");
        log.set("forwarded", false);
        log.set("sentAt", new DateTime());
        count++;
      } catch (err) {
        log.set("status", "failed");
        log.set("error", String(err).slice(0, 300));
      }
      app.save(log);
    }
  }
  return count;
}

// ── ทางเข้า (เรียกจาก ie_cron.pb.js) ───────────────────────────

function safe(app, label, fn) {
  try {
    const n = fn();
    if (n) app.logger().info("cron " + label, "count", n);
  } catch (err) {
    app.logger().error("cron " + label + " ล้ม", "error", String(err));
  }
}

function everyHalfHour(app) {
  const now = Date.now();
  safe(app, "push-tasks", () => pushTasks(app, now));
  safe(app, "push-bookings", () => pushBookings(app, now));
  safe(app, "discord-new", () => discordNewBookings(app));
}

function morning(app) {
  const now = Date.now();
  safe(app, "email-reminders", () => emailReminders(app, now));
  safe(app, "discord-overdue", () => discordOverdue(app, now));
}

module.exports = { everyHalfHour, morning };
