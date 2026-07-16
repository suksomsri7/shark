import Link from "next/link";
import type { Metadata } from "next";

// layout หลังบ้านแพลตฟอร์ม — เรียบ ๆ ของตัวเอง (ห้ามใช้ AppShell/AiDock ของฝั่งร้าน)
// ไม่ตรวจ auth ที่นี่ (ครอบหน้า login ด้วย) — แต่ละหน้าเรียก requireBackoffice เอง
export const metadata: Metadata = {
  title: "หลังบ้าน SHARK",
  robots: { index: false, follow: false },
};

export default function BackofficeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full">
      <header className="border-b border-[color:var(--color-line)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/backoffice" className="text-sm font-semibold">
            SHARK · หลังบ้านแพลตฟอร์ม
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
