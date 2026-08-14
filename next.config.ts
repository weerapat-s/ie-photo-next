import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "export", // static export → Firebase Hosting (Spark/ฟรี)
  trailingSlash: true, // ให้ Firebase เสิร์ฟ /feed/ → /feed/index.html
  images: { unoptimized: true }, // ไม่มี image optimizer บน static host
  // This project is not a monorepo. Pin the root so a lockfile elsewhere on
  // the workstation cannot make Turbopack watch or resolve outside this repo.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
