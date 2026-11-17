import type { Metadata } from "next";

// หน้าแจ้งเมื่อเปิดหลังบ้านร้าน `/app/*` จากเบราว์เซอร์ (14 พ.ย. 2569 เจ้าของสั่งระงับการเข้าทางเว็บไปก่อน)
// src/proxy.ts rewrite มาที่นี่เมื่อ UA ไม่ใช่แอป SHARK HUB (เฉพาะ production) · เรียบ ๆ ไม่มี AppShell
// 17 พ.ย. (เจ้าของสั่ง): ชื่อแอป/ผู้ช่วยในข้อความไทย = "เลขา" · อังกฤษ = "Lekaa" · "SHARK" = แบรนด์แพลตฟอร์ม คงไว้

export const metadata: Metadata = {
  title: "ใช้งาน SHARK ผ่านแอป",
  robots: { index: false, follow: false },
};

export default function UseAppPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">ใช้งาน SHARK ผ่านแอปเลขา</h1>
      <p className="text-sm text-[color:var(--color-muted)]">
        ตอนนี้หลังบ้านร้านเปิดใช้งานได้ทางแอปเลขาบน iPhone และ iPad เท่านั้น
        เข้าสู่ระบบในแอปด้วยบัญชีเดิมได้เลย ข้อมูลร้านทั้งหมดยังอยู่ครบ
      </p>
      <p className="text-sm text-[color:var(--color-muted)]">
        มีข้อสงสัยติดต่อ{" "}
        <a href="mailto:support@shark.in.th" className="text-[color:var(--color-accent)] underline">
          support@shark.in.th
        </a>
      </p>
      <p className="text-xs text-[color:var(--color-muted)]">
        Store management is available in the Lekaa app for iPhone and iPad.
      </p>
    </div>
  );
}
