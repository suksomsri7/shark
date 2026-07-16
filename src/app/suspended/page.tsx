import type { Metadata } from "next";

// หน้าแจ้งเมื่อร้านถูกระงับ/ปิดโดยแพลตฟอร์ม (WO-0021)
// requireTenant redirect มาที่นี่เมื่อ tenant.status = SUSPENDED/CLOSED
// เรียบ ๆ ไม่มี AppShell (ผู้ใช้เข้าแอปไม่ได้)

export const metadata: Metadata = {
  title: "ร้านถูกระงับการใช้งาน",
  robots: { index: false, follow: false },
};

export default function SuspendedPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">ร้านถูกระงับการใช้งานชั่วคราว</h1>
      <p className="text-sm text-[color:var(--color-muted)]">
        บัญชีร้านของคุณถูกระงับการใช้งานชั่วคราว หากมีข้อสงสัยหรือต้องการเปิดใช้งานอีกครั้ง
        กรุณาติดต่อทีมงานที่{" "}
        <a
          href="mailto:support@shark.in.th"
          className="text-[color:var(--color-accent)] underline"
        >
          support@shark.in.th
        </a>
      </p>
    </div>
  );
}
