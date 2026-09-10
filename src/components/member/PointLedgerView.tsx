// PointLedgerView.tsx — ledger รวม + KPI ของหน้า "แต้ม" (M2.2 · ภาพ 16)
//
// server component ล้วน — ตัวกรองส่งผ่าน query string (`<form method="get">`) ไม่ต้อง client state
// 🔴 ตัวเลขทุกก้อนมาจาก `point/service.ts` (pointKpiForMemberSystem/listPointLedgerForMemberSystem) — ไม่คิดเลขเอง

import { formatBaht } from "@/lib/ui/money";
import { DataTable } from "@/components/ui/DataList";
import type { PointLedgerKpi, PointLedgerRow } from "@/lib/modules/point";

const TYPE_LABEL: Record<string, string> = {
  EARN: "ได้แต้ม",
  BURN: "ใช้แต้ม",
  ADJUST: "ปรับมือ",
  REVERSE: "กลับรายการ",
  EXPIRE: "หมดอายุ",
  TRANSFER: "โอนแต้ม",
};

const fmtDate = (d: Date) =>
  new Date(d).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

function KpiCard({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="card flex flex-col gap-1 p-3">
      <span className="text-xs text-[color:var(--color-muted)]">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${danger ? "text-[color:var(--color-danger)]" : ""}`}>{value}</span>
    </div>
  );
}

export function PointLedgerView({
  systemId,
  kpi,
  rows,
  total,
  units,
  filter,
}: {
  systemId: string;
  kpi: PointLedgerKpi;
  rows: PointLedgerRow[];
  total: number;
  units: { id: string; name: string }[];
  filter: { type: string; q: string; unitId: string };
}) {
  const base = `/app/sys/${systemId}/member/points`;
  return (
    <div className="flex flex-col gap-4">
      <div data-testid="points-kpi" className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <KpiCard label="ออกเดือนนี้" value={`${kpi.issuedThisMonth.toLocaleString("th-TH")} แต้ม`} />
        <KpiCard label="ใช้เดือนนี้" value={`${kpi.usedThisMonth.toLocaleString("th-TH")} แต้ม`} />
        <KpiCard label="หมดอายุเดือนนี้" value={`${kpi.expiredThisMonth.toLocaleString("th-TH")} แต้ม`} />
        <KpiCard label="คงค้าง" value={`${kpi.outstanding.toLocaleString("th-TH")} แต้ม`} />
        <KpiCard label="หนี้สินคงค้าง" value={formatBaht(kpi.liabilitySatang)} danger />
      </div>

      <form data-testid="points-ledger-filter" method="get" className="flex flex-wrap items-end gap-2 rounded-xl border p-3">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ชนิด
          <select name="type" defaultValue={filter.type} className="input min-h-[40px]">
            <option value="">ทั้งหมด</option>
            {Object.entries(TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          สาขา
          <select name="unitId" defaultValue={filter.unitId} className="input min-h-[40px]">
            <option value="">ทุกสาขา</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 min-w-[160px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ค้นสมาชิก
          <input name="q" defaultValue={filter.q} placeholder="ชื่อ/รหัส/เบอร์" className="input min-h-[40px]" />
        </label>
        <button className="btn btn-primary min-h-[40px] text-sm">กรอง</button>
      </form>

      <div data-testid="points-ledger">
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty="ยังไม่มีรายการแต้ม — จะบันทึกอัตโนมัติเมื่อสมาชิกสะสม/ใช้แต้ม"
          cols={[
            { key: "date", header: "วันที่", render: (r) => fmtDate(r.createdAt) },
            { key: "member", header: "สมาชิก", render: (r) => `${r.customerName}${r.memberCode ? ` · ${r.memberCode}` : ""}` },
            { key: "type", header: "ชนิด", render: (r) => TYPE_LABEL[r.type] ?? r.type },
            { key: "reason", header: "เหตุผล", render: (r) => r.reason ?? "—" },
            { key: "delta", header: "แต้ม", align: "right", render: (r) => `${r.delta > 0 ? "+" : ""}${r.delta.toLocaleString("th-TH")}` },
          ]}
        />
      </div>
      <p className="text-xs text-[color:var(--color-muted)]">
        แสดง {rows.length} จาก {total.toLocaleString("th-TH")} รายการ ·{" "}
        <a href={`${base}/expiring`} className="underline">
          ดูแต้มที่ใกล้หมดอายุ
        </a>
      </p>
    </div>
  );
}

export default PointLedgerView;
