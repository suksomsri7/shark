"use client";

import { useState } from "react";
import { stackChartGeometry, CHART_VB, type StackPoint } from "@/lib/modules/account/dashboard-format";
import { formatBaht } from "@/lib/ui/money";

// กราฟแท่งซ้อน 3 โทน (§6 WO 2.3 — ชำระแล้ว ดำ · รอชำระ เทา · พ้นกำหนด แดง) — คัดลอกโครง SVG จาก DashChart.tsx
// (WO 2.2) แต่แท่งเดียวต่อเดือน (ซ้อนกัน) แทนแท่งคู่+เส้นกำไร ตาม f4 mockup (ค่าใช้จ่ายรายเดือน/รายรับรายเดือน)
// จานสีล็อกตาม token: #0a0a0a (ชำระแล้ว) · #a3a3a3 (รอชำระ) · #b91c1c (พ้นกำหนด — danger)
export function DashStackChart({ points }: { points: StackPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const geo = stackChartGeometry(points);

  return (
    <div className="relative" data-testid="dash-stack-chart">
      <svg
        viewBox={`0 0 ${CHART_VB.w} ${CHART_VB.h}`}
        className="w-full"
        style={{ height: 200 }}
        role="img"
        aria-label={`กราฟแท่งซ้อนชำระแล้ว/รอชำระ/พ้นกำหนดรายเดือน ${points.map((p) => p.label).join(" ")}`}
      >
        <g stroke="#e5e5e5" strokeWidth={1}>
          {geo.gridLines.map((g, i) => (
            <line key={i} x1={42} y1={g.y} x2={652} y2={g.y} />
          ))}
        </g>
        <g fill="#a3a3a3" fontSize={9.5} textAnchor="end" fontFamily="'Noto Sans Thai'">
          {geo.gridLines.map((g, i) => (
            <text key={i} x={36} y={g.y + 3}>
              {g.label}
            </text>
          ))}
        </g>
        <line x1={42} y1={geo.baselineY} x2={652} y2={geo.baselineY} stroke="#d4d4d4" strokeWidth={1.2} />
        {geo.bars.map((b, i) => (
          <g key={b.key} opacity={hover === null || hover === i ? 1 : 0.55}>
            <rect data-testid={`stack-paid-${b.key}`} x={b.x} y={b.paid.y} width={b.w} height={Math.max(b.paid.h, 0.5)} fill="#0a0a0a" rx={1.5} />
            <rect
              data-testid={`stack-awaiting-${b.key}`}
              x={b.x}
              y={b.awaiting.y}
              width={b.w}
              height={Math.max(b.awaiting.h, 0.5)}
              fill="#a3a3a3"
              rx={1.5}
            />
            <rect
              data-testid={`stack-overdue-${b.key}`}
              x={b.x}
              y={b.overdue.y}
              width={b.w}
              height={Math.max(b.overdue.h, 0.5)}
              fill="#b91c1c"
              rx={1.5}
            />
          </g>
        ))}
        <g fill="#737373" fontSize={10} textAnchor="middle" fontFamily="'Noto Sans Thai'">
          {geo.bars.map((b) => (
            <text key={`lbl-${b.key}`} x={b.cx} y={CHART_VB.h - 3}>
              {b.label}
            </text>
          ))}
        </g>
        {/* พื้นที่ hover — โปร่งใส ครอบทั้งช่องของแต่ละจุด */}
        <g>
          {geo.bars.map((b, i) => (
            <rect
              key={`hit-${b.key}`}
              x={b.cx - geo.slot / 2}
              y={0}
              width={geo.slot}
              height={CHART_VB.h}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((h) => (h === i ? null : h))}
              tabIndex={0}
              aria-label={`${points[i].label}: ชำระแล้ว ${formatBaht(points[i].paid, { decimals: true })} · รอชำระ ${formatBaht(points[i].awaiting, { decimals: true })} · พ้นกำหนด ${formatBaht(points[i].overdue, { decimals: true })}`}
            />
          ))}
        </g>
      </svg>

      {hover !== null && (
        <div
          data-testid="stack-chart-tooltip"
          className="pointer-events-none absolute z-10 flex -translate-x-1/2 flex-col gap-0.5 rounded-lg border bg-[color:var(--color-surface)] px-3 py-2 text-xs shadow-[0_8px_24px_rgba(10,10,10,.12)]"
          style={{ left: `${(geo.bars[hover].cx / CHART_VB.w) * 100}%`, top: 4 }}
        >
          <div className="font-medium">{points[hover].label}</div>
          <div>
            ชำระแล้ว <span className="font-medium">{formatBaht(points[hover].paid, { decimals: true })}</span>
          </div>
          <div>
            รอชำระ <span className="font-medium">{formatBaht(points[hover].awaiting, { decimals: true })}</span>
          </div>
          <div style={points[hover].overdue > 0 ? { color: "var(--color-danger)" } : undefined}>
            พ้นกำหนด <span className="font-medium">{formatBaht(points[hover].overdue, { decimals: true })}</span>
          </div>
        </div>
      )}

      {/* ตารางสำรองสำหรับ screen reader (กราฟ SVG อ่านลำบาก) */}
      <table className="sr-only">
        <caption>ชำระแล้ว รอชำระ และพ้นกำหนดรายเดือน</caption>
        <thead>
          <tr>
            <th>เดือน</th>
            <th>ชำระแล้ว</th>
            <th>รอชำระ</th>
            <th>พ้นกำหนด</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}>
              <td>{p.label}</td>
              <td>{formatBaht(p.paid, { decimals: true })}</td>
              <td>{formatBaht(p.awaiting, { decimals: true })}</td>
              <td>{formatBaht(p.overdue, { decimals: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DashStackChart;
