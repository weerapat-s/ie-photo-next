import type { Metadata } from "next";
import { Kanit } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/firebase/auth-context";

const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600", "700"],
  display: "swap", // แสดงข้อความทันทีด้วยฟอนต์สำรอง ระหว่างรอ Kanit โหลด
});

export const metadata: Metadata = {
  title: "IE-Photo Booking System",
  description: "ระบบจองอุปกรณ์ถ่ายภาพและสตูดิโอ IE-Photo KMITL",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${kanit.variable} h-full antialiased`}>
      <head>
        {/* เปิด TLS connection ล่วงหน้า — API call แรกไปถึง Firebase เร็วขึ้น */}
        <link rel="preconnect" href="https://firestore.googleapis.com" />
        <link rel="preconnect" href="https://identitytoolkit.googleapis.com" />
        <link rel="preconnect" href="https://securetoken.googleapis.com" />
      </head>
      <body className="min-h-full flex flex-col bg-neutral-50 font-[family-name:var(--font-kanit)]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
