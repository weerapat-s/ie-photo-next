// scripts/lib-admin.cjs
// Shared Firebase Admin init สำหรับ scripts (seed / migration)
// รันด้วย: node --env-file=.env.local scripts/<name>.cjs
const { initializeApp, cert, getApps, getApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

// ชื่อ database จริงใน project (เป็น named database "default" ไม่ใช่ "(default)")
const DB_ID = process.env.FIREBASE_DATABASE_ID || "default";

function ensureApp() {
  if (!getApps().length) {
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
      throw new Error("Missing Firebase Admin env — รันด้วย: node --env-file=.env.local scripts/<name>.cjs");
    }
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
  }
  return getApp();
}

function getDb() {
  return getFirestore(ensureApp(), DB_ID);
}

function getAuthAdmin() {
  return getAuth(ensureApp());
}

module.exports = { getDb, getAuthAdmin };
