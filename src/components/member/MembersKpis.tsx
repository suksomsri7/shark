// MembersKpis.tsx — KPI 6 ช่องของหน้ารวมสมาชิก (M1.5 · ภาพ 01 · testid `members-kpi`)
import type { MemberKpis } from "@/lib/modules/member/list";

function thaiInt(n: number): string {
  return n.toLocaleString("th-TH");
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card flex flex-col gap-1 p-4" style={{ minWidth: 0 }}>
      <span className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
        {label}
      </span>
      <span className="text-xl font-semibold" style={{ color: "var(--color-ink)" }}>
        {value}
      </span>
      {hint && (
        <span className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function MembersKpis({ kpis }: { kpis: MemberKpis }) {
  return (
    <div data-testid="members-kpi" className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
      <Tile label="สมาชิกทั้งหมด" value={thaiInt(kpis.total)} />
      <Tile label="ใหม่เดือนนี้" value={`+${thaiInt(kpis.newThisMonth)}`} />
      <Tile label="ใช้งาน 90 วัน" value={thaiInt(kpis.active90d)} />
      <Tile label="แต้มคงค้าง" value={thaiInt(kpis.pointsOutstanding)} />
      <Tile label="voucher ยังไม่ใช้" value={thaiInt(kpis.vouchersUnused)} />
      <Tile label="รีวิวเฉลี่ย" value={kpis.reviewAvg === null ? "—" : kpis.reviewAvg.toFixed(1)} />
    </div>
  );
}

export default MembersKpis;
