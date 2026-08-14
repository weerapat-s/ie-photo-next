import type { Metadata, Viewport } from "next";
import { Kanit } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/firebase/auth-context";
import SwRegister from "@/components/sw-register";

const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600", "700"],
  display: "swap", // แสดงข้อความทันทีด้วยฟอนต์สำรอง ระหว่างรอ Kanit โหลด
});

export const metadata: Metadata = {
  title: "IE-Photo Booking System",
  description: "ระบบจองอุปกรณ์ถ่ายภาพและสตูดิโอ IE-Photo KMITL",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-32.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "IE-Photo",
  },
};

export const viewport: Viewport = {
  themeColor: "#fcf9fb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${kanit.variable} h-full antialiased`} data-scroll-behavior="smooth">
      <head>
        {/* เปิด TLS connection ล่วงหน้า — API call แรกไปถึง Firebase เร็วขึ้น */}
        <link rel="preconnect" href="https://firestore.googleapis.com" />
        <link rel="preconnect" href="https://identitytoolkit.googleapis.com" />
        <link rel="preconnect" href="https://securetoken.googleapis.com" />
        {/* iOS Safari รุ่นเก่าต้องการ tag นี้แบบมี apple- prefix โดยเฉพาะ
            (metadata API ของ Next.js เรนเดอร์แค่ mobile-web-app-capable เฉยๆ) */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-full flex flex-col bg-background font-[family-name:var(--font-kanit)] text-foreground">
        <SwRegister />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
