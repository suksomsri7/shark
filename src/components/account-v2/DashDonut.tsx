import { donutArcs, DONUT_VB, type DonutSlice } from "@/lib/modules/account/dashboard-format";
import { formatBaht } from "@/lib/ui/money";

// โดนัทศูนย์กลางมียอดรวม (§4 ข้อ 5) — คัดลอกโครงจาก mockup.html f1 (viewBox 0 0 110 110 · r=40 ·
// stroke-width 17 · หมุน -90deg เริ่มจากบน) · server component ล้วน (ไม่มี interactivity ต้องใช้)
// จานสี: ระดับ 1 = accent (โดนัทรายได้) / ink (โดนัทค่าใช้จ่าย) แล้วไล่เทาเข้ม→อ่อนตามอันดับ (ramp เดียว ไม่ใช่ categorical)
export function DashDonut({ title, total, slices }: { title: string; total: number; slices: DonutSlice[] }) {
  const arcs = donutArcs(slices);
  return (
    <svg
      viewBox={`0 0 ${DONUT_VB.w} ${DONUT_VB.h}`}
      style={{ width: 110, height: 110, flex: "none" }}
      role="img"
      aria-label={`${title} รวม ${formatBaht(total)} แบ่งเป็น ${slices.map((s) => `${s.name} ${formatBaht(s.amount)}`).join(" · ")}`}
    >
      <g transform={`rotate(-90 ${DONUT_VB.cx} ${DONUT_VB.cy})`} fill="none" strokeWidth={17}>
        {arcs.map((a, i) => (
          <circle
            key={i}
            cx={DONUT_VB.cx}
            cy={DONUT_VB.cy}
            r={DONUT_VB.r}
            stroke={a.color}
            strokeDasharray={a.dasharray}
            strokeDashoffset={a.dashoffset}
            data-testid={i === 0 ? "donut-slice-top" : undefined}
          />
        ))}
      </g>
      <text x={DONUT_VB.cx} y={DONUT_VB.cy - 3} textAnchor="middle" fontSize={9.5} fill="#737373" fontFamily="'Noto Sans Thai'">
        ยอดรวม
      </text>
      <text
        x={DONUT_VB.cx}
        y={DONUT_VB.cy + 11}
        textAnchor="middle"
        fontSize={13}
        fontWeight={700}
        fill="#0a0a0a"
        fontFamily="'Noto Sans Thai'"
        data-testid="donut-center"
      >
        {formatBaht(total)}
      </text>
    </svg>
  );
}

export default DashDonut;
