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

// ── Web Push — แสดง notification แม้แอพปิดอยู่ ─────────────────────────────
self.addEventListener("push", (event) => {
  let data = { title: "IE-Photo", body: "มีการแจ้งเตือนใหม่", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* ใช้ default ถ้า parse ไม่ได้ */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url },
      tag: data.tag || undefined,
    })
  );
});

// คลิก notification → เปิด/โฟกัสแท็บแอป ไปที่ url ที่กำหนด
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
