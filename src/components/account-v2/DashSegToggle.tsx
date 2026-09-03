import Link from "next/link";

// สวิตช์ 2 ปุ่ม (ลูกหนี้|เจ้าหนี้ · รายเดือน|รายไตรมาส) — ลิงก์ธรรมดา (query string) ไม่ต้องใช้ client JS
// สไตล์เดียวกับ EasyModeToggle (ปุ่มดำเมื่อ active)
export function DashSegToggle({
  options,
  current,
  testIdPrefix,
  ariaLabel,
}: {
  options: { value: string; label: string; href: string }[];
  current: string;
  testIdPrefix: string;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex overflow-hidden rounded-lg border text-sm">
      {options.map((o) => (
        <Link
          key={o.value}
          href={o.href}
          role="radio"
          aria-checked={o.value === current}
          data-testid={`${testIdPrefix}-${o.value}`}
          className="px-3 py-1.5"
          style={o.value === current ? { background: "var(--color-ink)", color: "var(--color-surface)" } : undefined}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

export default DashSegToggle;
