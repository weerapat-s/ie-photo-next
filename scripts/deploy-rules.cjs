// scripts/deploy-rules.cjs — deploy firestore.rules + storage.rules ผ่าน Firebase Rules REST API
// (ใช้ service account — ไม่ต้อง firebase login)
// รัน: node --env-file=.env.local scripts/deploy-rules.cjs
//   หรือ: node scripts/deploy-rules.cjs <path/to/serviceAccount.json>  (ระบุโปรเจกต์เอง)
const { GoogleAuth } = require("google-auth-library");
const fs = require("fs");
const path = require("path");

const saPath = process.argv[2];
const sa = saPath ? require(saPath) : null;
const PROJECT = sa ? sa.project_id : process.env.FIREBASE_PROJECT_ID;
const CLIENT_EMAIL = sa ? sa.client_email : process.env.FIREBASE_CLIENT_EMAIL;
const PRIVATE_KEY = sa ? sa.private_key : (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

async function main() {
  const auth = new GoogleAuth({
    credentials: { client_email: CLIENT_EMAIL, private_key: PRIVATE_KEY },
    scopes: ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/firebase"],
  });
  const client = await auth.getClient();
  const base = `https://firebaserules.googleapis.com/v1/projects/${PROJECT}`;

  const rel = await client.request({ url: `${base}/releases` });
  const releases = rel.data.releases || [];
  console.log("releases ที่มี:", releases.map((r) => r.name.split("/releases/")[1]).join(", ") || "(none)");

  async function createRuleset(file, content) {
    const res = await client.request({
      url: `${base}/rulesets`,
      method: "POST",
      data: { source: { files: [{ name: file, content }] } },
    });
    return res.data.name;
  }

  async function setRelease(releaseName, rulesetName, exists) {
    if (exists) {
      await client.request({
        url: `https://firebaserules.googleapis.com/v1/${releaseName}`,
        method: "PATCH",
        data: { release: { name: releaseName, rulesetName }, updateMask: "rulesetName" },
      });
    } else {
      await client.request({
        url: `${base}/releases`,
        method: "POST",
        data: { name: releaseName, rulesetName },
      });
    }
  }

  // ── Firestore ──
  const fsContent = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");
  const fsRuleset = await createRuleset("firestore.rules", fsContent);
  const fsRelease = releases.find((r) => r.name.includes("cloud.firestore"));
  const fsName = fsRelease ? fsRelease.name : `projects/${PROJECT}/releases/cloud.firestore`;
  await setRelease(fsName, fsRuleset, !!fsRelease);
  console.log("✓ Firestore rules deployed →", fsName.split("/releases/")[1]);

  // ── Storage ──
  const stContent = fs.readFileSync(path.join(__dirname, "..", "storage.rules"), "utf8");
  const stRelease = releases.find((r) => r.name.includes("firebase.storage"));
  if (stRelease) {
    const stRuleset = await createRuleset("storage.rules", stContent);
    await setRelease(stRelease.name, stRuleset, true);
    console.log("✓ Storage rules deployed →", stRelease.name.split("/releases/")[1]);
  } else {
    console.log("! ไม่เจอ Storage release — ต้องเปิด Storage ใน Console ก่อน แล้วรันใหม่");
  }
}

main().catch((e) => {
  const msg = e.response?.data?.error?.message || e.message;
  console.error("✗ FAILED:", msg);
  process.exit(1);
});
