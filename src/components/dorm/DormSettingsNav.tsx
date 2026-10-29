'use client';
// SVC D.7 ▸ เมนูซ้ายของหน้าตั้งค่าหอ 5 หมวด (ภาพ ledger/design-dorm/10-settings-law.png)
//   หมวดที่ยังไม่มีหน้าของตัวเอง ⇒ ลิงก์ /dorm/settings (D.13 ทำหน้าเมนูจริงต่อ) · ลิงก์ใช้ <a> (renderToStaticMarkup ได้ ไม่พึ่ง router)
type NavKey = "rooms" | "roomTypes" | "utility" | "policies" | "integrations";

export default function DormSettingsNav({ unitSlug, active }: { unitSlug: string; active: NavKey }) {
  const base = `/app/u/${unitSlug}/dorm/settings`;
  const items: { key: NavKey; labelTh: string; href: string }[] = [
    { key: "rooms", labelTh: "อาคาร · ชั้น · ห้อง", href: base },
    { key: "roomTypes", labelTh: "ประเภทห้อง · ค่าเช่า", href: base },
    { key: "utility", labelTh: "ค่าน้ำไฟ · กฎหมาย · VAT", href: `${base}/utility` },
    { key: "policies", labelTh: "นโยบาย · ข้อความ · สิทธิ์", href: base },
    { key: "integrations", labelTh: "ศูนย์เชื่อมต่อ ›", href: "/app/settings/integrations" },
  ];
  return (
    <nav data-dorm-settings-nav="" aria-label="หมวดตั้งค่าหอ" className="flex min-w-0 gap-1 overflow-x-auto lg:w-60 lg:flex-none lg:flex-col lg:overflow-visible">
      {items.map((it) => {
        const on = it.key === active;
        return (
          <a
            key={it.key}
            href={it.href}
            data-nav-active={on ? "true" : "false"}
            aria-current={on ? "page" : undefined}
            className={`whitespace-nowrap rounded-xl px-4 py-3 text-sm ${
              on ? "bg-[color:var(--color-surface-2)] font-bold text-[color:var(--color-ink)]" : "text-[color:var(--color-ink-soft)]"
            }`}
          >
            {it.labelTh}
          </a>
        );
      })}
    </nav>
  );
}
