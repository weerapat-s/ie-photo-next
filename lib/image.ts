// lib/image.ts — ย่อ+บีบอัดรูปฝั่ง client (เร็ว ไม่ต้องพึ่ง Storage)
"use client";

const MAX_BYTES = 800_000; // Firestore doc limit 1 MiB — เผื่อฟิลด์อื่น

function approxBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(",");
  return Math.floor((dataUrl.length - i - 1) * 0.75);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => resolve(img);
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function drawToDataUrl(img: HTMLImageElement, maxSize: number, quality: number): string {
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas ctx");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * ย่อรูปและบีบอัดเป็น JPEG data URL
 * ถ้าขนาดเกิน MAX_BYTES จะวนลดทั้งความกว้าง/ยาว และ quality
 */
export async function compressImageToDataUrl(file: File, maxSize = 256, quality = 0.82): Promise<string> {
  const img = await loadImage(file);
  let curSize = maxSize;
  let curQuality = quality;

  for (let i = 0; i < 4; i++) {
    const url = drawToDataUrl(img, curSize, curQuality);
    if (approxBytes(url) <= MAX_BYTES) return url;
    curSize = Math.round(curSize * 0.8);
    curQuality = Math.max(0.4, curQuality - 0.12);
  }

  throw new Error("IMAGE_TOO_LARGE");
}
