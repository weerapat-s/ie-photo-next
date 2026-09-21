// scripts/deploy-all.mjs — เอาขึ้นเว็บจริงตามลำดับที่ปลอดภัย
//
// รัน:  npm run deploy         (ทำจริง)
//       npm run deploy:check   (ตรวจอย่างเดียว ไม่แตะอะไร)
//
// ═══ ทำไมต้องมีสคริปต์นี้ ═══════════════════════════════════════
//
// ลำดับ deploy ผิด = เว็บจริงพัง และเคยเกือบพังมาแล้ว:
//
//   1. Worker ต้องขึ้นก่อน hosting
//      โค้ดใหม่ยิง /nas/upload ไปหา Worker ถ้า Worker ยังไม่มีเส้นทางนั้นจะได้ 404
//      แนบเอกสารตอนยืมล้มทั้งหมด และ requireBorrowDocument เปิดอยู่
//      แปลว่า "ยืมของไม่ได้เลย" ไม่ใช่แค่แนบไม่ได้
//
//   2. NAS_SHARE_TOKEN ต้องตั้งก่อน hosting
//      Worker ขึ้นแล้วแต่ไม่มี token ก็ตอบ 503 ผลเหมือนข้อ 1
//
//   3. rules ต้องขึ้นหลัง hosting
//      rules ใหม่จำกัด formImageUrl ไว้ 500 ตัวอักษร ถ้าขึ้นก่อน
//      client รุ่นเก่าที่ยังเสิร์ฟอยู่จะเขียน base64 ไม่ผ่าน = ยืมไม่ได้อีกแบบ
//
// สคริปต์นี้จึงตรวจของจริงระหว่างทาง (ยิงเข้า Worker เช็คว่าขึ้นแล้วจริง)
// และหยุดทันทีถ้ายังไม่พร้อม — ดีกว่าปล่อยให้ hosting ขึ้นไปแล้วต้องรีบ rollback
import { execSync } from "node:child_process";

// /nas อยู่ Worker แยกในบัญชีส่วนตัว — okmd-proxy อยู่บัญชีชุมนุมที่ตอนนี้ไม่มีใครเข้าได้
// (รายละเอียดดูหัวไฟล์ workers/nas-entry.js)
const NAS_WORKER = "https://iephoto-nas.vaumgasem.workers.dev";
// AI + /send + cron ยังอยู่ okmd-proxy ตัวเดิม deploy จากที่นี่ไม่ได้ ตรวจได้อย่างเดียว
const MAIL_WORKER = "https://okmd-proxy.wooden-date.workers.dev";
const SITE = "https://iephoto.web.app";
const ORIGIN = { Origin: SITE };

const checkOnly = process.argv.includes("--check");

let step = 0;
const log = (m) => console.log(m);
const head = (m) => log(`\n${"─".repeat(60)}\n${++step}. ${m}\n${"─".repeat(60)}`);
const ok = (m) => log(`  ✓ ${m}`);

function die(msg, hint) {
  console.error(`\n✗ หยุดที่ขั้นที่ ${step}: ${msg}`);
  if (hint) console.error(`\n  ทำต่อยังไง:\n${hint}`);
  process.exit(1);
}

function run(cmd, { capture = false } = {}) {
  if (checkOnly) {
    log(`  [ตรวจอย่างเดียว] ข้าม: ${cmd}`);
    return "";
  }
  return execSync(cmd, {
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
  });
}

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/* ═══ 1. git ต้องสะอาดและตรงกับ origin/master ════════════════════
 * เคยเกิดแล้ว: 2 คน deploy จากเครื่องตัวเองด้วยโค้ดที่ไม่ได้ push
 * งานทับกันหายทั้งสองฝั่งหลายรอบ (ดู PROJECT_MAP.md §8)
 */
head("ตรวจ git");
{
  const branch = sh("git rev-parse --abbrev-ref HEAD");
  if (branch !== "master") {
    die(`อยู่บนสาขา "${branch}" ไม่ใช่ master`, "    git checkout master");
  }
  ok("อยู่บน master");

  const dirty = sh("git status --porcelain");
  if (dirty) {
    die(
      "ยังมีไฟล์ที่แก้แล้วไม่ได้ commit",
      "    commit แล้ว push ก่อน — ห้าม deploy โค้ดที่ไม่ได้อยู่ใน git\n" + dirty
    );
  }
  ok("ไม่มีไฟล์ค้าง");

  sh("git fetch origin master");
  const [behind, ahead] = sh("git rev-list --left-right --count HEAD...origin/master").split(/\s+/);
  if (ahead !== "0") die(`ตามหลัง origin/master อยู่ ${ahead} คอมมิต`, "    git pull");
  if (behind !== "0") die(`มี ${behind} คอมมิตที่ยังไม่ push`, "    git push");
  ok("ตรงกับ origin/master");
}

/* ═══ 2. เทสต์ต้องผ่านก่อนแตะเว็บจริง ══════════════════════════ */
head("รันเทสต์");
run("npm test");
ok("เทสต์ผ่าน");

/* ═══ 3. Worker ของ NAS (ต้องก่อน hosting — เหตุผลอยู่หัวไฟล์) ═══ */
head("เอา Worker ของ NAS ขึ้น");
try {
  run("npx wrangler deploy --config workers/wrangler.nas.toml");
} catch {
  die(
    "deploy Worker ไม่สำเร็จ",
    "    iephoto-nas อยู่บัญชี vaumgasem@gmail.com (account_id c120ec1f… ใน workers/wrangler.nas.toml)\n" +
      "    เช็คว่า wrangler ล็อกอินบัญชีนี้อยู่:  npx wrangler whoami"
  );
}

/* ═══ 4. ยิงเข้า Worker จริง — ไม่เชื่อว่า deploy สำเร็จเฉย ๆ ════
 * เส้นทาง /nas ตรวจ NAS_SHARE_TOKEN ก่อนตรวจตัวตน จึงแยกได้ว่า
 * 404 = โค้ดยังไม่ขึ้น · 503 = ขึ้นแล้วแต่ยังไม่ตั้ง token · 401 = พร้อม
 */
head("ตรวจว่า Worker ของ NAS พร้อมจริง");
{
  const res = await fetch(`${NAS_WORKER}/nas/upload`, { method: "POST", headers: ORIGIN });
  const body = await res.text();

  if (res.status === 404) {
    die("Worker ยังไม่มีเส้นทาง /nas (ตอบ 404)", "    โค้ด Worker ยังไม่ขึ้น — ดูข้อความ error ของขั้นที่แล้ว");
  }
  if (res.status === 503) {
    die(
      "Worker ขึ้นแล้ว แต่ยังไม่ได้ตั้ง NAS_SHARE_TOKEN (ตอบ 503)",
      "    npm run worker:nas   แล้ววาง token ของ share (ส่วนหลัง /s/ ในลิงก์)\n" +
        "    แล้วรัน npm run deploy อีกครั้ง"
    );
  }
  if (res.status !== 401) {
    die(`Worker ตอบ ${res.status} ซึ่งไม่คาดไว้`, `    ${body.slice(0, 200)}`);
  }
  // 401 = ตรวจตัวตนแล้วไม่ผ่านเพราะเราไม่ได้ส่ง token มา = ถูกต้องตามที่ควรเป็น
  ok("/nas พร้อม และบังคับตรวจตัวตนอยู่");
}

/* ═══ 5. /send — เตือนอย่างเดียว ไม่หยุด ═══════════════════════
 * /send รุ่นใหม่ตรวจสิทธิ์กรรมการด้วย ID token แต่อยู่ใน okmd-proxy ซึ่ง deploy
 * จากที่นี่ไม่ได้ (บัญชีชุมนุมเข้าไม่ได้) ตัวที่รันอยู่ยังกันด้วยหัว Origin อย่างเดียว
 * ซึ่งปลอมได้ถ้ายิงจากนอกเบราว์เซอร์
 *
 * ไม่หยุด deploy เพราะ client ใหม่ยังคุยกับ /send ตัวเก่าได้ปกติ
 * (หัว Authorization ที่ส่งเพิ่มไปถูกเมินเฉย ๆ) แค่รูรั่วยังไม่ปิด
 *
 * ส่ง body ว่างให้ตกที่ด่านตรวจฟิลด์ จะได้ไม่เผลอส่งอีเมลจริงออกไป
 */
head("ตรวจ /send (เตือนอย่างเดียว)");
{
  const res = await fetch(`${MAIL_WORKER}/send`, {
    method: "POST",
    headers: { ...ORIGIN, "Content-Type": "application/json" },
    body: "{}",
  });
  if (res.status === 401) {
    ok("/send บังคับตรวจสิทธิ์กรรมการแล้ว");
  } else {
    log(`  ⚠ /send ตอบ ${res.status} ทั้งที่ไม่ได้ส่ง token มา — ยังเป็นรุ่นที่ไม่ตรวจสิทธิ์`);
    log("    ใครรู้ URL ก็ส่งอีเมลในนามชุมนุมได้ โค้ดแก้แล้วแต่ขึ้นไม่ได้จนกว่าจะเข้าบัญชีชุมนุมได้");
    log("    ไปต่อได้ — client ใหม่ยังส่งอีเมลผ่านตัวเก่าได้ปกติ");
  }
}

/* ═══ 6-7. build แล้วเอา hosting ขึ้น ═══════════════════════════ */
head("build");
run("npm run build");
ok("build ผ่าน");

head("เอา hosting ขึ้น");
run("npx firebase deploy --only hosting --project iephoto");

/* ═══ 8. ยืนยันว่าเว็บจริงเป็นโค้ดใหม่แล้ว ══════════════════════
 * /mail เพิ่งมีในรุ่นนี้ ใช้เป็นตัวชี้ว่า hosting อัปเดตจริง
 */
head("ตรวจว่าเว็บจริงเป็นโค้ดใหม่");
if (!checkOnly) {
  const res = await fetch(`${SITE}/mail/`);
  if (res.status !== 200) {
    die(
      `${SITE}/mail/ ตอบ ${res.status} — hosting ยังไม่เป็นโค้ดใหม่`,
      "    ยังไม่ต้อง deploy rules ต่อ เพราะ rules ใหม่จะปฏิเสธ base64 ของ client รุ่นเก่า"
    );
  }
  ok("/mail ขึ้นแล้ว = hosting เป็นโค้ดใหม่");
} else {
  log("  [ตรวจอย่างเดียว] ข้าม");
}

/* ═══ 9. rules ปิดท้าย ═════════════════════════════════════════ */
head("เอา firestore rules ขึ้น");
run("npx firebase deploy --only firestore:rules --project iephoto");

log(`\n${"═".repeat(60)}`);
log(checkOnly ? "ตรวจครบแล้ว (ยังไม่ได้ deploy อะไร)" : "✅ ขึ้นครบแล้ว: Worker · hosting · rules");
log("═".repeat(60));

if (!checkOnly) {
  log("\nควรเช็คด้วยมืออีกรอบ:");
  log("  • เข้า /borrow-equipment แนบเอกสารแล้วกดส่งคำขอ — ต้องขึ้น QR ไม่ error");
  log("  • เข้า /scan สแกน QR — ต้องบังคับถ่ายรูปตอนส่งมอบ");
  log("  • เข้า /mail — ผู้ส่งต้องขึ้นชื่อคนรหัส 68030271 ไม่ใช่คำเตือนหาไม่เจอ");
  log("\nหมายเหตุ: เมลที่ส่งจะยังเข้ากล่องกลางของชุมนุม ไม่ถึงตัวสมาชิก");
  log("จนกว่าจะยืนยันโดเมนกับ Resend แล้วเปลี่ยน MAIL_FROM (หน้าเว็บขึ้นป้าย \"เข้ากล่องกลาง\" ให้เห็น)");
}
