// ReportRfmGrid.tsx — ตาราง RFM 3×3 (M3.8 · ภาพ 25 ขวาบน · testid `reports-rfm-grid` · `reports-rfm-cell-<key>`)
// server component ล้วน · สีเฉดของช่อง = หมึก `--color-ink` ผสมขาวตาม `tone` ของกลุ่ม (ทะเบียนใน reports-shared — ห้าม hex)
import { int, type ReportRfm, type RfmSegmentKey } from "@/lib/modules/member/reports-shared";

const MUTED = "var(--color-muted)";

/**
 * ผัง 3×3 ตามภาพ 25 (อ่านจากซ้ายบน = ซื้อบ่อย/มูลค่าสูง → ขวาล่าง = ห่างหายนาน)
 * `tone` = % ของหมึก `--color-ink` ที่ผสมขาวเป็นพื้นช่อง (เข้ม = กลุ่มที่มีค่าที่สุด)
 */
const CELLS: readonly { key: RfmSegmentKey; label: string; tone: number }[] = [
  { key: "champions", label: "Champions", tone: 100 },
  { key: "loyal", label: "Loyal", tone: 72 },
  { key: "promising", label: "Promising", tone: 17 },
  { key: "potential", label: "Potential", tone: 55 },
  { key: "need_attention", label: "Need Attention", tone: 22 },
  { key: "new", label: "New", tone: 17 },
  { key: "at_risk", label: "At risk", tone: 25 },
  { key: "hibernating", label: "Hibernating", tone: 17 },
  { key: "lost", label: "Lost", tone: 4 },
];

function toneStyle(tone: number): { background: string; color: string } {
  const background = tone >= 100 ? "var(--color-ink)" : `color-mix(in srgb, var(--color-ink) ${tone}%, white)`;
  const color = tone >= 50 ? "var(--color-surface)" : tone <= 5 ? MUTED : "var(--color-ink)";
  return { background, color };
}

export function ReportRfmGrid({ data, detailed = false }: { data: ReportRfm; detailed?: boolean }) {
  const byKey = new Map(data.segments.map((s) => [s.key, s]));
  return (
    <section className="card flex min-w-0 flex-col gap-2 p-4">
      <header className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-sm font-bold">RFM</h2>
        <span className="text-xs" style={{ color: MUTED }}>
          Recency × Frequency/Monetary · สมาชิกที่ซื้อใน {int(data.days)} วัน {int(data.total)} คน
        </span>
      </header>
      <div className="flex min-w-0 justify-between gap-2 text-[10px]" style={{ color: MUTED }}>
        <span>ซื้อบ่อย/มูลค่าสูง</span>
        <span>ซื้อล่าสุดนาน</span>
      </div>
      <div data-testid="reports-rfm-grid" className="grid min-w-0 grid-cols-3 gap-1.5">
        {CELLS.map((g) => {
          const s = byKey.get(g.key);
          const st = toneStyle(g.tone);
          return (
            <div
              key={g.key}
              data-testid={`reports-rfm-cell-${g.key}`}
              title={s?.description}
              className={`flex min-w-0 flex-col justify-between gap-1 rounded-lg p-2.5 ${detailed ? "min-h-[96px]" : "min-h-[72px]"}`}
              style={{ background: st.background, color: st.color, border: g.tone <= 5 ? "1px solid var(--color-line)" : undefined }}
            >
              <span className="truncate text-[11px] font-bold">{g.label}</span>
              <span className="text-lg font-bold tabular-nums">{int(s?.count ?? 0)}</span>
              {detailed && s && (
                <span className="text-[11px] leading-snug break-words" style={{ opacity: 0.85 }}>
                  {s.description}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** แท็บ RFM: ตารางสรุป 9 กลุ่ม (จำนวน · สัดส่วน · ควรทำอะไร) */
export function ReportRfmTable({ data }: { data: ReportRfm }) {
  return (
    <section className="card flex min-w-0 flex-col gap-3 p-4">
      <h2 className="text-sm font-bold">สรุปตามกลุ่ม</h2>
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: MUTED, background: "var(--color-surface-2)" }}>
              <th className="px-3 py-2 font-medium">กลุ่ม</th>
              <th className="px-3 py-2 text-right font-medium">สมาชิก</th>
              <th className="px-3 py-2 text-right font-medium">สัดส่วน</th>
              <th className="px-3 py-2 font-medium">ความหมาย</th>
            </tr>
          </thead>
          <tbody>
            {data.segments.map((s) => (
              <tr key={s.key} className="border-t">
                <td className="px-3 py-2 font-semibold whitespace-nowrap">{s.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{int(s.count)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{data.total ? `${Math.round((s.count / data.total) * 100)}%` : "—"}</td>
                <td className="px-3 py-2 text-xs" style={{ color: MUTED }}>
                  {s.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs" style={{ color: MUTED }}>
        คะแนน R/F/M แบ่ง 5 ระดับตามลำดับของสมาชิกที่ซื้อในช่วงนี้ (ควินไทล์) — ซื้อล่าสุด ซื้อบ่อย และยอดสูง ได้คะแนนสูง
      </p>
    </section>
  );
}
