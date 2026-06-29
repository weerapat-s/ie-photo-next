// scripts/preflight.cjs — เช็คว่า Email/Password + Storage เปิดหรือยัง
const { GoogleAuth } = require("google-auth-library");

(async () => {
  const pid = process.env.FIREBASE_PROJECT_ID;
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();

  // 1) Email/Password enabled?
  try {
    const cfg = await client.request({ url: `https://identitytoolkit.googleapis.com/admin/v2/projects/${pid}/config` });
    const ep = cfg.data?.signIn?.email;
    console.log("Email/Password:", ep?.enabled ? "✅ เปิดแล้ว" : "❌ ยังไม่เปิด");
  } catch (e) {
    console.log("Email/Password: เช็คไม่ได้ —", e.response?.data?.error?.message || e.message);
  }

  // 2) Storage bucket exists?
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  try {
    await client.request({ url: `https://storage.googleapis.com/storage/v1/b/${bucket}` });
    console.log("Storage bucket:", "✅ มีแล้ว", `(${bucket})`);
  } catch (e) {
    console.log("Storage bucket:", "❌ ยังไม่มี/เข้าไม่ได้ —", e.response?.data?.error?.message || e.message);
  }
})();
