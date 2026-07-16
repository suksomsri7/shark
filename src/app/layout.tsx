import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./globals.css";

// ฟอนต์รองรับไทย+อังกฤษ คลีน minimal
const appSans = IBM_Plex_Sans_Thai({
  variable: "--font-app-sans",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SHARK — ระบบบริหารจัดการร้านค้า",
  description: "จัดการโรงแรม ร้านอาหาร จองคิว สมาชิก แต้ม ครบในที่เดียว",
  appleWebApp: {
    title: "SHARK",
    capable: true,
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

// PWA — theme color (Next 16: themeColor อยู่ใน viewport export ไม่ใช่ metadata)
export const viewport: Viewport = {
  themeColor: "#0B132B",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${appSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
