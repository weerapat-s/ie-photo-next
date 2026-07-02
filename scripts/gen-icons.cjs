// scripts/gen-icons.cjs — สร้างไอคอน PWA ทุกขนาดจาก SVG เดียว (theme: กล้อง + gradient ส้ม→ชมพู)
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(OUT, { recursive: true });

// ไอคอนกล้องแบบ vector (วาดเอง กันปัญหา emoji font ไม่ตรงกันข้ามเครื่อง)
function cameraIcon({ size, padding = 0, cornerRadius }) {
  const r = cornerRadius ?? size * 0.22;
  const cx = size / 2;
  const cy = size / 2;
  const camScale = (size - padding * 2) / size;
  const camSize = size * camScale;
  const ox = (size - camSize) / 2;
  const oy = (size - camSize) / 2;

  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff5b1f"/>
      <stop offset="100%" stop-color="#ff2f75"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>
  <g transform="translate(${ox} ${oy}) scale(${camScale})">
    <!-- ตัวกล้อง -->
    <rect x="${size * 0.18}" y="${size * 0.38}" width="${size * 0.64}" height="${size * 0.42}" rx="${size * 0.07}" fill="#ffffff"/>
    <!-- ปุ่มช่องมองภาพด้านบน -->
    <rect x="${size * 0.40}" y="${size * 0.28}" width="${size * 0.20}" height="${size * 0.12}" rx="${size * 0.025}" fill="#ffffff"/>
    <!-- เลนส์ -->
    <circle cx="${cx}" cy="${size * 0.59}" r="${size * 0.15}" fill="url(#bg)"/>
    <circle cx="${cx}" cy="${size * 0.59}" r="${size * 0.09}" fill="#ffffff" opacity="0.9"/>
    <circle cx="${cx}" cy="${size * 0.59}" r="${size * 0.09}" fill="none" stroke="#ffffff" stroke-width="${size * 0.012}"/>
  </g>
</svg>`;
}

async function main() {
  const targets = [
    { file: "icon-192.png", size: 192, padding: 0 },
    { file: "icon-512.png", size: 512, padding: 0 },
    { file: "maskable-192.png", size: 192, padding: 192 * 0.14, cornerRadius: 0 }, // full-bleed สำหรับ maskable
    { file: "maskable-512.png", size: 512, padding: 512 * 0.14, cornerRadius: 0 },
    { file: "apple-touch-icon.png", size: 180, padding: 0 }, // iOS ไม่ต้อง透明, ขอบมนเอง
  ];

  for (const t of targets) {
    const svg = cameraIcon(t);
    await sharp(Buffer.from(svg)).png().toFile(path.join(OUT, t.file));
    console.log(`✓ ${t.file}`);
  }

  // favicon 32x32 ไว้ที่ public root ด้วย
  const favSvg = cameraIcon({ size: 64, padding: 0 });
  await sharp(Buffer.from(favSvg)).resize(32, 32).png().toFile(path.join(__dirname, "..", "public", "icon-32.png"));
  console.log("✓ icon-32.png (favicon)");

  console.log("\n✅ สร้างไอคอนครบทุกขนาด");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
