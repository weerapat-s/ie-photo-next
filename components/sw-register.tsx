"use client";
// components/sw-register.tsx — ลงทะเบียน service worker สำหรับ PWA
import { useEffect } from "react";

export default function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // ไม่ critical — แอปยังใช้งานได้ปกติแม้ SW ลงทะเบียนไม่สำเร็จ
      });
    }
  }, []);
  return null;
}
