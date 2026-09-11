// /m/[slug]/* — เปลือกหน้าลูกค้า (LIFF ในไลน์ · WebView ในแอป · เบราว์เซอร์ทั่วไป ใช้ URL เดียวกัน — D4)
//
// 🔴 กรอบมือถือ 390–430px จัดกลางจอ: เปิดบนเดสก์ท็อปก็ยังอ่านได้ ไม่ยืดเต็มจอจนเลย์เอาต์เพี้ยน
// 🔴 แถบล่าง 4 ปุ่ม (บัตร · กระเป๋า · โปรไฟล์ · ประวัติ) ติดขอบล่างเสมอ — ซ่อนเองที่หน้าเข้าสู่ระบบ
// 🔴 ไม่มีแถบเมนูของหลังร้านที่นี่เลย: หน้านี้เป็นของ "ลูกค้า" ไม่ใช่พนักงาน
import type { Viewport } from "next";
import { MNav } from "@/components/member/MNav";
// M3.11 — สะพาน push (data-testid m-push-bridge): ในแอปลูกค้า (UA SharkCustomer/ หรือมี ReactNativeWebView)
// รับ {type:"push-token", expoToken, platform} แล้วลงทะเบียนเครื่องให้ลูกค้าที่ล็อกอินอยู่ (= /api/v1/member/me/push-devices)
import { MPushBridge } from "@/components/member/MPushBridge";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function MemberFacingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col"
      style={{ background: "var(--color-surface)" }}
    >
      <main className="flex-1 pb-16">{children}</main>
      <MNav slug={slug} />
      <MPushBridge slug={slug} />
    </div>
  );
}
