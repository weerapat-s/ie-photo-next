// scripts/check-project.cjs — เช็คสถานะโปรเจกต์ใดๆ (Firestore db, Storage, Auth) จาก service account path
// รัน: node scripts/check-project.cjs "C:\path\to\serviceAccount.json"
const { GoogleAuth } = require("google-auth-library");
const sa = require(process.argv[2]);

(async () => {
  const auth = new GoogleAuth({
    credentials: { client_email: sa.client_email, private_key: sa.private_key },
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const pid = sa.project_id;

  console.log(`=== โปรเจกต์: ${pid} ===`);

  // Firestore databases
  try {
    const r = await client.request({ url: `https://firestore.googleapis.com/v1/projects/${pid}/databases` });
    const dbs = r.data.databases || [];
    if (!dbs.length) console.log("Firestore: ❌ ยังไม่มี database");
    else dbs.forEach((d) => console.log(`Firestore: ✅ "${d.name.split('/databases/')[1]}" @ ${d.locationId} (${d.type})`));
  } catch (e) { console.log("Firestore: เช็คไม่ได้ —", e.response?.data?.error?.message || e.message); }

  // Email/Password
  try {
    const cfg = await client.request({ url: `https://identitytoolkit.googleapis.com/admin/v2/projects/${pid}/config` });
    console.log("Email/Password:", cfg.data?.signIn?.email?.enabled ? "✅ เปิดแล้ว" : "❌ ยังไม่เปิด");
  } catch (e) { console.log("Auth config: เช็คไม่ได้ —", e.response?.data?.error?.message || e.message); }

  // Storage bucket (ชื่อ default pattern)
  const bucket = `${pid}.firebasestorage.app`;
  try {
    await client.request({ url: `https://storage.googleapis.com/storage/v1/b/${bucket}` });
    console.log(`Storage: ✅ มีแล้ว (${bucket})`);
  } catch (e) { console.log(`Storage: ❌ ไม่มี (${bucket}) —`, e.response?.data?.error?.message || e.message); }
})();
