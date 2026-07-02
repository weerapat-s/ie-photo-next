// public/sw.js — service worker ขั้นต่ำสำหรับ PWA
// กลยุทธ์:
//   - หน้าเว็บ (navigation): network-first แล้ว fallback เป็น cache (ได้ของใหม่เมื่อออนไลน์ เปิดได้เมื่อออฟไลน์)
//   - static asset ของ Next.js (_next/static, ไอคอน) — hash ชื่อไฟล์แล้ว: cache-first (ไม่มีวันเปลี่ยนแปลง)
//   - อย่างอื่นทั้งหมด (Firebase/Firestore/Google APIs ฯลฯ) — ปล่อยผ่านตามปกติ ไม่แตะ
const CACHE_VERSION = "iephoto-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // ปล่อย cross-origin (Firebase ฯลฯ) ผ่านตามปกติ

  // หน้าเว็บ (navigation) — network-first
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(CACHE_VERSION).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  // static asset ที่ hash ชื่อไฟล์แล้ว — cache-first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            caches.open(CACHE_VERSION).then((c) => c.put(request, res.clone()));
            return res;
          })
      )
    );
  }
});
