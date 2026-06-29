import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export", // static export → Firebase Hosting (Spark/ฟรี)
  trailingSlash: true, // ให้ Firebase เสิร์ฟ /feed/ → /feed/index.html
  images: { unoptimized: true }, // ไม่มี image optimizer บน static host
};

export default nextConfig;
