import type { Metadata, Viewport } from "next";
import { Kanit, Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/firebase/auth-context";
import { SettingsProvider } from "@/lib/settings-context";
import SwRegister from "@/components/sw-register";
import ClickSpark from "@/components/reactbits/ClickSpark";

// Inter คุมตัวเลข/อังกฤษ · Kanit คุมภาษาไทย — ชุดเดียวกับหน้าเว็บหลัก
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap", // แสดงข้อความทันทีด้วยฟอนต์สำรอง ระหว่างรอ Kanit โหลด
});

export const metadata: Metadata = {
  title: "IE-Photo · ระบบจองอุปกรณ์ สตูดิโอ และตากล้อง",
  description: "ระบบจองอุปกรณ์ถ่ายภาพ สตูดิโอ และตากล้อง IE-Photo KMITL",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-32.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "IE-Photo",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5f5f7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // ให้ซูมได้ — บังคับ 1 เท่าตัดคนสายตาไม่ดีออก
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${kanit.variable} ${inter.variable} h-full antialiased`}>
      <head>
        {/* เปิด TLS connection ล่วงหน้า — API call แรกไปถึง Firebase เร็วขึ้น */}
        <link rel="preconnect" href="https://firestore.googleapis.com" />
        <link rel="preconnect" href="https://identitytoolkit.googleapis.com" />
        <link rel="preconnect" href="https://securetoken.googleapis.com" />
        {/* iOS Safari รุ่นเก่าต้องการ tag นี้แบบมี apple- prefix โดยเฉพาะ
            (metadata API ของ Next.js เรนเดอร์แค่ mobile-web-app-capable เฉยๆ) */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body
        className="flex min-h-full flex-col text-[var(--ink)]"
        style={{ fontFamily: "var(--font-inter), var(--font-kanit), system-ui, sans-serif" }}
      >
        <SwRegister />
        <ClickSpark />
        <SettingsProvider>
          <AuthProvider>{children}</AuthProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
