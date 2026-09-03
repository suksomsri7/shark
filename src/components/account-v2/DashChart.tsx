"use client";

import { useState } from "react";
import { chartGeometry, CHART_VB, type ChartPoint } from "@/lib/modules/account/dashboard-format";
import { formatBaht } from "@/lib/ui/money";

// กราฟแท่งคู่ (รายได้ accent / ค่าใช้จ่าย เทา) + เส้นกำไรสีดำ (§4 ข้อ 3) — คัดลอกโครง SVG จาก
// docs/design/account-v2/mockup.html ส่วน f1 (viewBox 0 0 660 200 · rx 2.5 · เส้นกริด 3 เส้น)
// ผ่าน dashboard-format.chartGeometry (ฟังก์ชันบริสุทธิ์ — unit test แยกใน qc-acc-v2-home.mts)
// แถบ hover ต่อเดือน (client island ตาม DESIGN-SPEC §4 ข้อ 3) — ผ่าน tooltip ลอย + <title> สำรอง
// จานสีล็อกตาม token: accent #1d4ed8 (รายได้) · #a3a3a3 (ค่าใช้จ่าย) · #0a0a0a (เส้นกำไร) · #b91c1c (ป้ายขาดทุน — ใช้ตัวหนา ไม่ใช้สี)
export function DashChart({ points }: { points: ChartPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const geo = chartGeometry(points);
  const worstLossIdx = points.reduce(
    (worst, p, i) => (p.profit < 0 && (worst === -1 || p.profit < points[worst].profit) ? i : worst),
    -1,
  );

  return (
    <div className="relative" data-testid="dash-chart">
      <svg
        viewBox={`0 0 ${CHART_VB.w} ${CHART_VB.h}`}
        className="w-full"
        style={{ height: 200 }}
        role="img"
        aria-label={`กราฟแท่งรายได้และค่าใช้จ่ายรายเดือน พร้อมเส้นกำไร ${points.map((p) => p.label).join(" ")}`}
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
        <g fill="#1d4ed8">
          {geo.bars.map((b) => (
            <rect
              key={`rev-${b.key}`}
              data-testid={`bar-revenue-${b.key}`}
              x={b.revenue.x}
              y={b.revenue.y}
              width={b.revenue.w}
              height={Math.max(b.revenue.h, 0.5)}
              rx={2.5}
              opacity={hover === null || hover === geo.bars.indexOf(b) ? 1 : 0.55}
            />
          ))}
        </g>
        <g fill="#a3a3a3">
          {geo.bars.map((b) => (
            <rect
              key={`exp-${b.key}`}
              data-testid={`bar-expense-${b.key}`}
              x={b.expense.x}
              y={b.expense.y}
              width={b.expense.w}
              height={Math.max(b.expense.h, 0.5)}
              rx={2.5}
              opacity={hover === null || hover === geo.bars.indexOf(b) ? 1 : 0.55}
            />
          ))}
        </g>
        <line x1={42} y1={geo.baselineY} x2={652} y2={geo.baselineY} stroke="#d4d4d4" strokeWidth={1.2} />
        <polyline fill="none" stroke="#0a0a0a" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={geo.profitPolyline} />
        <g fill="#ffffff" stroke="#0a0a0a" strokeWidth={1.6}>
          {geo.bars.map((b) => (
            <circle key={`dot-${b.key}`} cx={b.profitPoint.x} cy={b.profitPoint.y} r={3} />
          ))}
        </g>
        {worstLossIdx >= 0 && (
          <text
            x={geo.bars[worstLossIdx].cx}
            y={Math.min(CHART_VB.h - 6, geo.bars[worstLossIdx].profitPoint.y + 20)}
            fontSize={10}
            fontWeight={700}
            fill="#0a0a0a"
            textAnchor="middle"
            fontFamily="'Noto Sans Thai'"
          >
            {`ขาดทุน −${formatBaht(Math.abs(points[worstLossIdx].profit), { decimals: true })}`}
          </text>
        )}
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
              aria-label={`${points[i].label}: รายได้ ${formatBaht(points[i].revenue, { decimals: true })} · ค่าใช้จ่าย ${formatBaht(points[i].expense, { decimals: true })} · กำไร ${formatBaht(points[i].profit, { decimals: true })}`}
            />
          ))}
        </g>
      </svg>

      {hover !== null && (
        <div
          data-testid="chart-tooltip"
          className="pointer-events-none absolute z-10 flex -translate-x-1/2 flex-col gap-0.5 rounded-lg border bg-[color:var(--color-surface)] px-3 py-2 text-xs shadow-[0_8px_24px_rgba(10,10,10,.12)]"
          style={{ left: `${(geo.bars[hover].cx / CHART_VB.w) * 100}%`, top: 4 }}
        >
          <div className="font-medium">{points[hover].label}</div>
          <div>
            รายได้ <span className="font-medium">{formatBaht(points[hover].revenue, { decimals: true })}</span>
          </div>
          <div>
            ค่าใช้จ่าย <span className="font-medium">{formatBaht(points[hover].expense, { decimals: true })}</span>
          </div>
          <div>
            กำไร/ขาดทุน <span className="font-medium">{formatBaht(points[hover].profit, { decimals: true })}</span>
          </div>
        </div>
      )}

      {/* ตารางสำรองสำหรับ screen reader (กราฟ SVG อ่านลำบาก) */}
      <table className="sr-only">
        <caption>รายได้ ค่าใช้จ่าย และกำไรรายเดือน</caption>
        <thead>
          <tr>
            <th>เดือน</th>
            <th>รายได้</th>
            <th>ค่าใช้จ่าย</th>
            <th>กำไร/ขาดทุน</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}>
              <td>{p.label}</td>
              <td>{formatBaht(p.revenue, { decimals: true })}</td>
              <td>{formatBaht(p.expense, { decimals: true })}</td>
              <td>{formatBaht(p.profit, { decimals: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DashChart;
