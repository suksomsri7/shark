// PointExpiringTable.tsx — ตารางแต้มใกล้หมดอายุ (M2.2 · พิมพ์เขียว §5.5 §11.4)
// server component ล้วน — ตัวกรอง "ภายในกี่วัน" ส่งผ่าน query string

import { DataTable } from "@/components/ui/DataList";
import type { ExpiringLotRow } from "@/lib/modules/point";

const fmtDate = (d: Date) =>
  new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" });

export function PointExpiringTable({ rows, days }: { rows: ExpiringLotRow[]; days: number }) {
  return (
    <div className="flex flex-col gap-4">
      <form method="get" className="flex flex-wrap items-end gap-2 rounded-xl border p-3">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ภายใน
          <select name="days" defaultValue={String(days)} className="input min-h-[40px]">
            <option value="7">7 วัน</option>
            <option value="30">30 วัน</option>
            <option value="90">90 วัน</option>
          </select>
        </label>
        <button className="btn btn-primary min-h-[40px] text-sm">กรอง</button>
      </form>

      <div data-testid="points-expiring-table">
        <DataTable
          rows={rows}
          rowKey={(r) => r.lotId}
          empty={`ไม่มีแต้มที่จะหมดอายุภายใน ${days} วันข้างหน้า`}
          cols={[
            { key: "member", header: "สมาชิก", render: (r) => `${r.customerName}${r.memberCode ? ` · ${r.memberCode}` : ""}` },
            { key: "points", header: "แต้ม", align: "right", render: (r) => r.points.toLocaleString("th-TH") },
            { key: "expiresAt", header: "หมดอายุ", render: (r) => fmtDate(r.expiresAt) },
            { key: "daysLeft", header: "เหลือ", align: "right", render: (r) => `${r.daysLeft} วัน` },
          ]}
        />
      </div>
    </div>
  );
}

export default PointExpiringTable;
