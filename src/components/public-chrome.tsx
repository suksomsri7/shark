import Link from "next/link";

// Header/Footer ของหน้าสาธารณะ (landing + หน้ากฎหมาย + ศูนย์ช่วยเหลือ)
//
// ทำไมต้องมี: ผู้ตรวจของ App Store / Google Play / Meta เปิดหน้าใดหน้าหนึ่งแล้วต้อง
// เดินไปหา "นโยบายความเป็นส่วนตัว · ข้อกำหนด · วิธีลบบัญชี · ช่องทางติดต่อ" ได้ใน 1 คลิก
// เดิมหน้าเหล่านี้ลอยเดี่ยว ๆ ไม่มีทางเดินถึงกัน — ผู้ตรวจต้องเดา URL เอง
// เป็น server component ล้วน (ไม่มี JS ฝั่ง client) → ไม่ถ่วงหน้า landing

export const SUPPORT_EMAIL = "support@shark.in.th";

const FOOTER_LINKS: { href: string; label: string }[] = [
  { href: "/support", label: "ศูนย์ช่วยเหลือ" },
  { href: "/privacy", label: "ความเป็นส่วนตัว" },
  { href: "/terms", label: "ข้อกำหนดการใช้บริการ" },
  { href: "/account-deletion", label: "ลบบัญชี/ข้อมูล" },
];

export function PublicHeader() {
  return (
    <header className="border-b border-[color:var(--color-line)]">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-6 py-4">
        <Link href="/" className="text-sm font-semibold tracking-widest">
          SHARK
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/support" className="btn-sm min-h-[40px] rounded-lg px-3">
            ช่วยเหลือ
          </Link>
          <Link href="/login" className="btn-sm min-h-[40px] rounded-lg px-3">
            เข้าสู่ระบบ
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="mt-auto border-t border-[color:var(--color-line)]">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-8 text-sm">
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          {FOOTER_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="underline underline-offset-4">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-1 text-[color:var(--color-muted)]">
          <p>
            ติดต่อ:{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-4">
              {SUPPORT_EMAIL}
            </a>
          </p>
          <p>SHARK — ระบบบริหารจัดการกิจการสำหรับธุรกิจไทย · shark.in.th</p>
        </div>
      </div>
    </footer>
  );
}
