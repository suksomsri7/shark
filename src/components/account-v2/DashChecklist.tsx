import Link from "next/link";
import type { ChecklistResult } from "@/lib/modules/account/dashboard-home";

// เช็กลิสต์เริ่มต้น 5 ขั้น (BLUEPRINT §0.3 ข้อ 2) — โผล่เฉพาะยังไม่ครบ (หรือถูกบังคับด้วย ?checklist=1
// สำหรับถ่ายภาพ QC — ดู forceChecklist ใน dashboard-home.ts) · server component ล้วน
export function DashChecklist({ checklist }: { checklist: ChecklistResult }) {
  return (
    <div className="card flex flex-col gap-3" data-testid="dash-checklist">
      <h2 className="text-sm font-medium">เริ่มต้นใช้งานบัญชี</h2>
      <ol className="flex flex-col gap-2">
        {checklist.steps.map((s, i) => (
          <li key={s.key}>
            <Link
              href={s.href}
              data-testid={`checklist-step-${s.key}`}
              data-done={s.done ? "1" : "0"}
              className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-[color:var(--color-surface-2)]"
            >
              <span
                aria-hidden
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs"
                style={
                  s.done
                    ? { background: "var(--color-ink)", color: "var(--color-surface)" }
                    : { border: "1px solid var(--color-line)", color: "var(--color-muted)" }
                }
              >
                {s.done ? "✓" : i + 1}
              </span>
              <span className={s.done ? "text-[color:var(--color-muted)] line-through" : undefined}>{s.label}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default DashChecklist;
