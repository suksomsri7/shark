import { formatBaht } from "@/lib/ui/money";

// แถบสัดส่วนแนวนอน (ใช้ร่วม: อายุหนี้ · เอกสารที่ออก · ขายอะไรดีสุด/ขายใคร/รายได้อะไร · เงินคุณอยู่ไหน)
// รูปแบบเดียวกับ mockup.html `.agerow` — ป้าย + แถบ + จำนวนเงิน ชิดขวา · server component ล้วน
export function DashShareBar({
  label,
  amountSatang,
  percent,
  color,
  danger,
  testId,
}: {
  label: string;
  amountSatang: number;
  /** 0–100 */
  percent: number;
  color: string;
  danger?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs" data-testid={testId}>
      <span className="w-28 shrink-0 truncate" style={danger ? { color: "var(--color-danger)" } : undefined}>
        {label}
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--color-surface-2)]">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.max(percent, percent > 0 ? 2 : 0)}%`, background: color }}
        />
      </span>
      <span
        className="w-24 shrink-0 text-right tabular-nums"
        style={danger ? { color: "var(--color-danger)" } : undefined}
      >
        {formatBaht(amountSatang)}
      </span>
    </div>
  );
}

export default DashShareBar;
