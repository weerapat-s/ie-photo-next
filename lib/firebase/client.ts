// lib/firebase/client.ts
// Firebase Client SDK — ใช้ในฝั่ง browser (React components)
// คุมสิทธิ์ด้วย Firestore Security Rules
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// กัน re-initialize ตอน hot-reload (Next.js dev)
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// database จริงเป็น named database "default" — ต้องระบุ id ให้ตรง
const databaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "default";

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app, databaseId);
export const storage: FirebaseStorage = getStorage(app);
export default app;
