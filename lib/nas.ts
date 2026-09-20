"use client";
// lib/nas.ts — รูปเอกสารการยืม เก็บบน Nextcloud (NAS ชุมนุม) ไม่ใช่ใน Firestore
//
// เหตุผลย่อ (รายละเอียดเต็มอยู่ใน workers/nas-files.js):
//   รูป base64 ที่ฝังในเอกสาร booking ทำให้ Firestore คิดโควตาอ่านตามขนาดเอกสาร
//   booking ที่มีรูป 500KB = อ่านทีเดียวกินเท่าเอกสารเปล่าร้อยกว่าใบ
//
// ทุกอย่างวิ่งผ่าน Cloudflare Worker เพราะ:
//   • Nextcloud public share ไม่ส่งหัว CORS (preflight ตอบ 401) ยิงตรงไม่ได้
//   • token ของ share = สิทธิ์อ่าน/ไล่ดูไฟล์ทั้งโฟลเดอร์ ห้ามหลุดมาถึงเบราว์เซอร์เด็ดขาด
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase/client";
import { compressImageToBlob } from "@/lib/image";

/** ฐานของ Worker — ตัดท้าย /v1 ออก เพราะ /nas ไม่ได้อยู่ใต้ /v1 */
const WORKER_BASE = "https://okmd-proxy.wooden-date.workers.dev";

/** path บน NAS เท่านั้น ที่เหลือ (data: URL เดิม, ลิงก์ภายนอก) ให้ใช้ src ตรง ๆ */
export function isNasPath(value: string | null | undefined): value is string {
  return !!value && value.startsWith("borrow/");
}

async function idToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  return user.getIdToken();
}

/**
 * ย่อรูปแล้วอัปขึ้น NAS — คืน path ที่เอาไปเก็บใน booking
 * โยน Error พร้อมข้อความภาษาไทยถ้าไม่สำเร็จ เพื่อให้ฝั่ง UI เอาไปแสดงได้เลย
 */
export async function uploadBorrowImage(file: File, kind: "form" | "return"): Promise<string> {
  const blob = await compressImageToBlob(file, kind === "form" ? 1600 : 1400, 0.8);
  const token = await idToken();

  const res = await fetch(`${WORKER_BASE}/nas/upload?kind=${kind}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
    body: blob,
  });

  const data = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!res.ok || !data.path) {
    throw new Error(data.error || `อัปโหลดขึ้น NAS ไม่สำเร็จ (${res.status})`);
  }
  return data.path;
}

/**
 * ดึงรูปจาก NAS มาเป็น object URL
 * ต้อง fetch เองเพราะ <img src> ส่งหัว Authorization ไม่ได้
 * ผู้เรียกต้อง URL.revokeObjectURL() ตอนเลิกใช้ ไม่งั้น blob ค้างในหน่วยความจำ
 */
export async function fetchNasImage(path: string): Promise<string> {
  const token = await idToken();
  const res = await fetch(`${WORKER_BASE}/nas/file?p=${encodeURIComponent(path)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `โหลดรูปไม่สำเร็จ (${res.status})`);
  }
  return URL.createObjectURL(await res.blob());
}

/**
 * แปลงค่าที่เก็บใน booking ให้เป็น src ที่เอาไปใส่ <img> / <a href> ได้
 *
 * รับได้ทั้งสองแบบ เพราะของเก่ากับของใหม่ใช้ฟิลด์เดียวกัน:
 *   • path บน NAS (ของใหม่)   → ดึงผ่าน Worker แล้วคืน object URL
 *   • data: URL หรือลิงก์นอก (ของเก่า) → คืนกลับไปตรง ๆ
 */
export function useNasSrc(value: string | null | undefined) {
  const [src, setSrc] = useState<string | null>(() => (isNasPath(value) ? null : value ?? null));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isNasPath(value)) {
      setSrc(value ?? null);
      setError("");
      return;
    }

    let cancelled = false;
    let objectUrl = "";
    setSrc(null);
    setError("");

    fetchNasImage(value)
      .then((url) => {
        // unmount ก่อนโหลดเสร็จ — คืนหน่วยความจำทันที ไม่งั้น blob ค้าง
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setSrc(url);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "โหลดรูปไม่สำเร็จ");
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [value]);

  return { src, error, loading: isNasPath(value) && !src && !error };
}
