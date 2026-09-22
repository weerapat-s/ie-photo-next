"use client";
// lib/nas.ts — รูปเอกสารการยืม / รูปตอนคืน / รูปส่งมอบ เก็บเป็นไฟล์บน NAS (PocketBase)
//
// ค่าที่เก็บใน booking (formImageUrl / returnImageUrl / handoverImageUrl) เป็นแค่ที่อยู่ไฟล์
//   "files/<id>/<ชื่อไฟล์>"  ไฟล์ในตาราง files ของ PocketBase
// ไม่ฝังรูปลงเรคคอร์ด — เคยฝัง base64 สมัย Firestore จนโควตาอ่านหมดทั้งวัน
//
// ไฟล์เป็นเอกสารส่วนตัว (บัตร นศ. ใบขออนุญาต) ตั้ง protected ไว้:
// เปิดได้ต้องมี file token อายุสั้นของคนที่มีสิทธิ์ (แอดมิน หรือเจ้าของไฟล์) — ลิงก์หลุดไปก็เปิดไม่ได้
//
// ค่าเก่าแบบ data: URL หรือลิงก์ภายนอก ยังแสดงได้ตามเดิม (คืนค่ากลับไปตรง ๆ)
import { useEffect, useState } from "react";
import { pb, PB_URL } from "@/lib/db/client";
import { compressImageToBlob } from "@/lib/image";

/** ที่อยู่ไฟล์บน NAS — ที่เหลือ (data: URL เดิม, ลิงก์ภายนอก) ให้ใช้ src ตรง ๆ */
export function isNasPath(value: string | null | undefined): value is string {
  return !!value && value.startsWith("files/");
}

export type BorrowImageKind = "form" | "return" | "handover";

/**
 * ย่อรูปแล้วอัปขึ้น NAS — คืนที่อยู่ไฟล์ที่เอาไปเก็บใน booking
 * โยน Error พร้อมข้อความภาษาไทยถ้าไม่สำเร็จ เพื่อให้ฝั่ง UI เอาไปแสดงได้เลย
 */
export async function uploadBorrowImage(file: File, kind: BorrowImageKind): Promise<string> {
  if (!pb.authStore.isValid) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  const blob = await compressImageToBlob(file, kind === "return" ? 1400 : 1600, 0.8);
  const form = new FormData();
  form.append("file", blob, `${kind}.jpg`);
  form.append("kind", kind);
  try {
    const rec = await pb.collection("files").create(form);
    return `files/${rec.id}/${rec.file}`;
  } catch (e) {
    const msg = (e as { response?: { message?: string } })?.response?.message;
    throw new Error(msg ? `อัปโหลดรูปไม่สำเร็จ: ${msg}` : "อัปโหลดรูปขึ้น NAS ไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่");
  }
}

// file token อายุราว 3 นาที — ใช้ร่วมกันทั้งหน้า ไม่ขอใหม่ทุกรูป
let tokenCache: { token: string; at: number; uid: string } | null = null;
const TOKEN_REUSE_MS = 90_000;

async function fileToken(): Promise<string> {
  const uid = pb.authStore.record?.id ?? "";
  if (tokenCache && tokenCache.uid === uid && Date.now() - tokenCache.at < TOKEN_REUSE_MS) return tokenCache.token;
  const token = await pb.files.getToken();
  tokenCache = { token, at: Date.now(), uid };
  return token;
}

/** ที่อยู่รูปที่ใส่ <img src> ได้ตรง ๆ (แนบ file token) */
export async function nasFileUrl(path: string): Promise<string> {
  const [, id, name] = path.split("/");
  const base = PB_URL.replace(/\/+$/, "");
  const token = await fileToken();
  return `${base}/api/files/files/${encodeURIComponent(id)}/${encodeURIComponent(name)}?token=${encodeURIComponent(token)}`;
}

/**
 * แปลงค่าที่เก็บใน booking ให้เป็น src ที่เอาไปใส่ <img> / <a href> ได้
 *   • ที่อยู่ไฟล์บน NAS → ลิงก์พร้อม file token
 *   • data: URL หรือลิงก์นอก (ของเก่า) → คืนกลับไปตรง ๆ
 */
export function useNasSrc(value: string | null | undefined) {
  // ผลลัพธ์ผูกกับค่าที่ขอไว้เสมอ — พอ value เปลี่ยน ของรอบก่อนจะไม่ถูกนับทันที
  const [done, setDone] = useState<{ key: string; url: string } | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    if (!isNasPath(value)) return;
    let cancelled = false;
    nasFileUrl(value)
      .then((url) => !cancelled && setDone({ key: value, url }))
      .catch((e: unknown) => {
        if (cancelled) return;
        setFailed({ key: value, message: e instanceof Error ? e.message : "โหลดรูปไม่สำเร็จ" });
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!isNasPath(value)) return { src: value ?? null, error: "", loading: false };

  const src = done?.key === value ? done.url : null;
  const error = failed?.key === value ? failed.message : "";
  return { src, error, loading: !src && !error };
}
