// app/page.tsx — Phase 0 landing / สถานะการตั้งค่า
// ตรวจว่า Firebase env ถูกตั้งค่าหรือยัง (เช็คแค่ว่ามีค่า ไม่ได้เชื่อมต่อจริง)

const firebaseEnv = [
  { key: "NEXT_PUBLIC_FIREBASE_API_KEY", val: process.env.NEXT_PUBLIC_FIREBASE_API_KEY },
  { key: "NEXT_PUBLIC_FIREBASE_PROJECT_ID", val: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID },
  { key: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", val: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET },
  { key: "NEXT_PUBLIC_FIREBASE_APP_ID", val: process.env.NEXT_PUBLIC_FIREBASE_APP_ID },
];

const adminEnv = [
  { key: "FIREBASE_PROJECT_ID", val: process.env.FIREBASE_PROJECT_ID },
  { key: "FIREBASE_CLIENT_EMAIL", val: process.env.FIREBASE_CLIENT_EMAIL },
  { key: "FIREBASE_PRIVATE_KEY", val: process.env.FIREBASE_PRIVATE_KEY },
];

function StatusRow({ name, ok }: { name: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={ok ? "text-green-500" : "text-amber-500"}>{ok ? "✓" : "○"}</span>
      <code className="text-xs text-neutral-500">{name}</code>
    </div>
  );
}

export default function Home() {
  const clientReady = firebaseEnv.every((e) => e.val);
  const adminReady = adminEnv.every((e) => e.val);

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-2xl text-white">
            📷
          </div>
          <h1 className="text-xl font-semibold">IE-Photo Booking</h1>
          <p className="text-sm text-neutral-500">Next.js + Firebase — Phase 0 ✅</p>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg bg-neutral-50 p-4 dark:bg-neutral-800/50">
            <p className="mb-2 text-sm font-medium">
              Firebase Client {clientReady ? "🟢 พร้อม" : "🟡 รอตั้งค่า"}
            </p>
            <div className="space-y-1">
              {firebaseEnv.map((e) => (
                <StatusRow key={e.key} name={e.key} ok={!!e.val} />
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-neutral-50 p-4 dark:bg-neutral-800/50">
            <p className="mb-2 text-sm font-medium">
              Firebase Admin {adminReady ? "🟢 พร้อม" : "🟡 รอตั้งค่า"}
            </p>
            <div className="space-y-1">
              {adminEnv.map((e) => (
                <StatusRow key={e.key} name={e.key} ok={!!e.val} />
              ))}
            </div>
          </div>

          {!clientReady && (
            <p className="text-center text-xs text-neutral-400">
              ใส่ค่า Firebase ใน <code>.env.local</code> แล้ว refresh เพื่อให้ครบ
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
