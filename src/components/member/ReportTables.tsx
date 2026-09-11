// ReportTables.tsx — แท็บ "ช่องทางที่มา" และ "Cohort" ของหน้ารายงานสมาชิก (M3.8 · testid `reports-sources` · `reports-cohort`)
// server component ล้วน · ช่อง % ของ cohort ระบายด้วยโทเคน `--color-accent` ผสมขาวตามค่า (ไม่มี hex)
import { baht, int, thaiMonthLabel, type ReportCohort, type ReportSources } from "@/lib/modules/member/reports-shared";

const MUTED = "var(--color-muted)";
const TH = "px-3 py-2 font-medium";

export function ReportSourcesTable({ data }: { data: ReportSources }) {
  const max = Math.max(1, ...data.rows.map((r) => r.count));
  return (
    <section data-testid="reports-sources" className="card flex min-w-0 flex-col gap-3 p-4">
      <header className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-sm font-bold">ช่องทางที่มา</h2>
        <span className="text-xs" style={{ color: MUTED }}>
          สมาชิกที่สมัครใน {int(data.days)} วันล่าสุด {int(data.total)} คน · นับตามช่องทางที่บันทึกตอนสมัคร
        </span>
      </header>
      <div className="-mx-4 min-w-0 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: MUTED, background: "var(--color-surface-2)" }}>
              <th className={TH}>ช่องทาง</th>
              <th className={`${TH} text-right`}>สมาชิกใหม่</th>
              <th className={`${TH} text-right`}>ซื้อครั้งแรกแล้ว</th>
              <th className={`${TH} text-right`}>ค่าใช้จ่ายช่องทาง</th>
              <th className={`${TH} text-right`}>ต้นทุน/คน</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.source ?? "none"} className="border-t">
                <td className="px-3 py-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="break-words">{r.label}</span>
                    <span className="block h-1.5 rounded-full" style={{ width: `${Math.max(4, Math.round((r.count / max) * 100))}%`, background: "var(--color-ink)" }} />
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{int(r.count)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {int(r.firstPurchases)}
                  <span className="ml-1 text-xs" style={{ color: MUTED }}>
                    ({r.count ? Math.round((r.firstPurchases / r.count) * 100) : 0}%)
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{r.costSatang ? baht(r.costSatang) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{r.costSatang ? baht(r.costPerMemberSatang) : "—"}</td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-xs" style={{ color: MUTED }}>
                  ยังไม่มีสมาชิกสมัครใหม่ใน {int(data.days)} วันล่าสุด
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs" style={{ color: MUTED }}>
        ค่าใช้จ่ายช่องทาง = ค่าใช้จ่ายของลิงก์/QR ที่มาที่สร้างในช่วงนี้ (ตั้งได้ที่ ตั้งค่า › ช่องทางที่มา)
      </p>
    </section>
  );
}

function cellStyle(pct: number): { background: string; color: string } {
  const mix = Math.round(Math.min(100, Math.max(0, pct)) * 0.85);
  return {
    background: `color-mix(in srgb, var(--color-accent) ${mix}%, white)`,
    color: mix >= 45 ? "var(--color-accent-fg)" : "var(--color-ink)",
  };
}

export function ReportCohortTable({ data }: { data: ReportCohort }) {
  return (
    <section data-testid="reports-cohort" className="card flex min-w-0 flex-col gap-3 p-4">
      <header className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-sm font-bold">Cohort รายเดือน</h2>
        <span className="text-xs" style={{ color: MUTED }}>
          % ของสมาชิกที่สมัครในเดือนนั้น ที่กลับมามีบิลในเดือนถัด ๆ ไป
        </span>
      </header>
      <div className="-mx-4 min-w-0 overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: MUTED, background: "var(--color-surface-2)" }}>
              <th className={TH}>เดือนที่สมัคร</th>
              <th className={`${TH} text-right`}>สมาชิก</th>
              {Array.from({ length: data.months }, (_, k) => (
                <th key={k} className={`${TH} text-center`}>
                  {k === 0 ? "เดือนแรก" : `+${k} เดือน`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.month} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">{thaiMonthLabel(r.month)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{int(r.size)}</td>
                {Array.from({ length: data.months }, (_, k) => {
                  const v = r.retained[k];
                  if (v === undefined) return <td key={k} className="px-1 py-1" />;
                  const st = r.size ? cellStyle(v) : { background: "var(--color-surface-2)", color: MUTED };
                  return (
                    <td key={k} className="px-1 py-1">
                      <span className="block rounded-md px-2 py-1.5 text-center text-xs font-semibold tabular-nums" style={st}>
                        {r.size ? `${v}%` : "—"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs" style={{ color: MUTED }}>
        ช่องว่าง = เดือนที่ยังมาไม่ถึง · นับเฉพาะบิลที่ชำระแล้ว
      </p>
    </section>
  );
}
