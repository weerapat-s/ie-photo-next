// lib/image.ts — ย่อ+บีบอัดรูปฝั่ง client (เร็ว ไม่ต้องพึ่ง Storage)
"use client";

/**
 * ย่อรูปให้ด้านยาวสุดไม่เกิน maxSize px แล้วบีบอัดเป็น JPEG data URL
 * รูปโปรไฟล์ 256px ≈ 10-25KB → เก็บใน Firestore doc ได้เลย อัปทันที
 */
export function compressImageToDataUrl(file: File, maxSize = 256, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas ctx"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
