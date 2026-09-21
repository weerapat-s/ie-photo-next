// scripts/deploy-all.mjs — เอาขึ้นเว็บจริง (NAS) ตามลำดับที่ปลอดภัย
//
// รัน:  npm run deploy         (ทำจริง)
//       npm run deploy:check   (ตรวจอย่างเดียว ไม่แตะอะไร)
//
// ย้ายจาก Firebase มา NAS แล้ว (ก.ย. 2026 — ดู MIGRATION_NAS.md) เว็บ ข้อมูล ล็อกอิน อยู่บน
// PocketBase ที่ NAS ทั้งหมด เหลือบน Cloudflare แค่ Worker ส่งอีเมล (iephoto-nas)
//
// ลำดับ:
//   1. git สะอาดและตรงกับ origin/master (เคยมีคน deploy โค้ดที่ไม่ได้ push จนงานทับกันหาย)
//   2. เทสต์ผ่าน
//   3-4. Worker ส่งอีเมลขึ้นก่อน แล้วยิงตรวจว่าบังคับตรวจตัวตนจริง
//   5-6. build แล้วส่ง PocketBase (migrations/hooks) + หน้าเว็บขึ้น NAS (nas/deploy.sh --site)
//   7. ยิงตรวจเว็บจริง
//
// สคริปต์หยุดทันทีถ้าขั้นไหนไม่ผ่าน
import { execSync } from "node:child_process";

// Worker ส่งอีเมล — บัญชี Cloudflare ส่วนตัว (รายละเอียดดูหัวไฟล์ workers/nas-entry.js)
const NAS_WORKER = "https://iephoto-nas.vaumgasem.workers.dev";
const SITE = "https://iephoto.ienas.site";
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

/* ═══ 3. Worker ส่งอีเมล ═════════════════════════════════════════ */
head("เอา Worker ส่งอีเมล (iephoto-nas) ขึ้น");
try {
  run("npx wrangler deploy --config workers/wrangler.nas.toml");
} catch {
  die(
    "deploy Worker ไม่สำเร็จ",
    "    iephoto-nas อยู่บัญชี vaumgasem@gmail.com (account_id c120ec1f… ใน workers/wrangler.nas.toml)\n" +
      "    เช็คว่า wrangler ล็อกอินบัญชีนี้อยู่:  npx wrangler whoami"
  );
}

/* ═══ 4. ยิงเข้า Worker จริง — ไม่มี token ต้องโดนปฏิเสธ 401 ═══════
 * 404 = โค้ดยังไม่ขึ้น · 200/อื่น ๆ = ด่านตรวจตัวตนหาย (อันตราย — ใครก็ส่งอีเมลในนามชุมนุมได้)
 * ส่ง body ว่าง ไม่มีทางเผลอส่งอีเมลจริงออกไป
 */
head("ตรวจว่า Worker บังคับตรวจตัวตน");
if (!checkOnly) {
  const res = await fetch(`${NAS_WORKER}/mail`, {
    method: "POST",
    headers: { ...ORIGIN, "Content-Type": "application/json" },
    body: "{}",
  });
  if (res.status !== 401) die(`/mail ตอบ ${res.status} ทั้งที่ไม่ได้ส่ง token (ต้องเป็น 401)`, `    ${(await res.text()).slice(0, 200)}`);
  ok("/mail พร้อม และบังคับตรวจตัวตนอยู่");
} else {
  log("  [ตรวจอย่างเดียว] ข้าม");
}

/* ═══ 5-6. build แล้วเอาขึ้น NAS (PocketBase + หน้าเว็บ) ═══════════ */
head("build");
run("npm run build");
ok("build ผ่าน");

head("เอาขึ้น NAS");
run("bash nas/deploy.sh --site");

/* ═══ 7. ยืนยันว่าเว็บจริงตอบ ═════════════════════════════════════ */
head("ตรวจเว็บจริง");
if (!checkOnly) {
  for (const path of ["/api/health", "/login/", "/my-bookings/"]) {
    const res = await fetch(`${SITE}${path}`);
    if (res.status !== 200) die(`${SITE}${path} ตอบ ${res.status}`, "    ดู log: ssh nas@100.116.118.109 sudo docker logs --tail 50 iephoto-pb");
    ok(`${path} ตอบ 200`);
  }
} else {
  log("  [ตรวจอย่างเดียว] ข้าม");
}

log(`\n${"═".repeat(60)}`);
log(checkOnly ? "ตรวจครบแล้ว (ยังไม่ได้ deploy อะไร)" : "✅ ขึ้นครบแล้ว: Worker · PocketBase · หน้าเว็บ");
log("═".repeat(60));

if (!checkOnly) {
  log("\nควรเช็คด้วยมืออีกรอบ:");
  log("  • เข้า /borrow-equipment แนบเอกสารแล้วกดส่งคำขอ — ต้องขึ้น QR ไม่ error");
  log("  • เข้า /scan สแกน QR — ต้องบังคับถ่ายรูปตอนส่งมอบ");
}
