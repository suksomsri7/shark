// SVC H.7 ▸ กราฟ SVG เอง (ไม่มีไลบรารีกราฟ · ใบสั่ง h.7 §4) — เส้นอัตราเข้าพักรายวัน / แท่งพยากรณ์ล่วงหน้า 30 วัน
//   ข้อมูล = แถว {label, bps} · แกน 0–100% · ป้ายทุก ๆ ไม่กี่จุด · ไม่มีสีเกินโทนระบบ
import { fmtPct } from "./reports-shared";

export type ChartPoint = { key: string; label: string; bps: number };
export type ForecastChartProps = { title: string; points: ChartPoint[]; mode: "line" | "bar" };

const W = 720;
const H = 200;
const PAD_L = 36;
const PAD_B = 24;
const PAD_T = 12;

export default function ForecastChart({ title, points, mode }: ForecastChartProps) {
  const innerW = W - PAD_L - 8;
  const innerH = H - PAD_B - PAD_T;
  const nPts = Math.max(1, points.length);
  const step = innerW / nPts;
  const y = (bps: number) => PAD_T + innerH - (Math.max(0, Math.min(10_000, bps)) / 10_000) * innerH;
  const xMid = (i: number) => PAD_L + step * i + step / 2;
  const every = Math.max(1, Math.ceil(nPts / 8));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${xMid(i).toFixed(1)},${y(p.bps).toFixed(1)}`).join(" ");
  return (
    <figure data-hotel-chart={mode} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5">
      <figcaption className="text-base font-bold">{title}</figcaption>
      <div data-scroll-hint="" className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="h-[200px] w-full min-w-[480px]">
          {[0, 2500, 5000, 7500, 10_000].map((g) => (
            <g key={g}>
              <line x1={PAD_L} x2={W - 8} y1={y(g)} y2={y(g)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={PAD_L - 6} y={y(g) + 4} textAnchor="end" fontSize={10} fill="var(--color-ink-soft)">
                {fmtPct(g)}
              </text>
            </g>
          ))}
          {mode === "bar"
            ? points.map((p, i) => (
                <rect key={p.key} x={PAD_L + step * i + step * 0.15} width={step * 0.7} y={y(p.bps)} height={Math.max(0, PAD_T + innerH - y(p.bps))} rx={2} fill="var(--color-ink)">
                  <title>{`${p.label} · ${fmtPct(p.bps)}`}</title>
                </rect>
              ))
            : (
                <>
                  <path d={path} fill="none" stroke="var(--color-ink)" strokeWidth={2} />
                  {points.map((p, i) => (
                    <circle key={p.key} cx={xMid(i)} cy={y(p.bps)} r={3} fill="var(--color-ink)">
                      <title>{`${p.label} · ${fmtPct(p.bps)}`}</title>
                    </circle>
                  ))}
                </>
              )}
          {points.map((p, i) => {
            return i % every === 0 ? (
              <text key={`l-${p.key}`} x={xMid(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--color-ink-soft)">
                {p.label}
              </text>
            ) : null;
          })}
        </svg>
      </div>
    </figure>
  );
}
