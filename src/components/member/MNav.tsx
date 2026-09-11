"use client";

// MNav.tsx — แถบล่าง 4 ปุ่มของหน้าลูกค้า (ภาพ 09: บัตร · กระเป๋า · โปรไฟล์ · ประวัติ)
//
// 🔴 เป็น client component เพราะต้องรู้ว่าตอนนี้อยู่หน้าไหน (เน้นปุ่มที่เปิดอยู่)
//    และต้อง **ซ่อนตัวเอง** ที่หน้าเข้าสู่ระบบ/สมัคร — คนที่ยังไม่ล็อกอินกดไปหน้าอื่นไม่ได้อยู่แล้ว
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MemberIcon } from "./MemberIcon";

const TABS = [
  { key: "card", label: "บัตร", icon: "qr" },
  { key: "wallet", label: "กระเป๋า", icon: "wallet" },
  { key: "profile", label: "โปรไฟล์", icon: "users" },
  { key: "history", label: "ประวัติ", icon: "clock" },
] as const;

export function MNav({ slug }: { slug: string }) {
  const pathname = usePathname() ?? "";
  const base = `/m/${slug}`;
  if (pathname.startsWith(`${base}/login`) || pathname.startsWith(`${base}/join`)) return null;
  const current = TABS.find((t) => pathname.startsWith(`${base}/${t.key}`))?.key ?? "card";

  return (
    <nav
      data-testid="m-nav"
      className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-[430px] items-stretch border-t"
      style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
    >
      {TABS.map((t) => {
        const on = t.key === current;
        return (
          <Link
            key={t.key}
            href={`${base}/${t.key}`}
            data-testid={`m-nav-${t.key}`}
            className="flex flex-1 flex-col items-center gap-1 py-2"
            style={{
              fontSize: 10.5,
              fontWeight: on ? 600 : 400,
              color: on ? "var(--color-ink)" : "var(--color-muted)",
            }}
          >
            <MemberIcon name={t.icon} size="sm" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default MNav;
