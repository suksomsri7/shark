// CampaignsTable.tsx — ตารางแคมเปญของร้าน (M3.2 · ภาพ 07 ครึ่งล่าง)
//
// คอลัมน์ตามภาพ: ชื่อ (+ กลุ่มเป้าหมาย/ช่องทางบรรทัดล่าง) · ส่งเดือนนี้ · ใช้สิทธิ์ · ยอดที่เกิด · ต้นทุน · ROI · สถานะ
// 🔴 เป็น server component ล้วน (ไม่มี "use client") — ตารางอ่านอย่างเดียวไม่ต้องพา JS ลงเครื่องผู้ใช้
// 🔴 ไม่มีอีโมจิ/สีฮาร์ดโค้ด: ไอคอนผ่าน MemberIcon · สีผ่านโทเคนของธีม
import Link from "next/link";

export type CampaignRowView = {
  id: string;
  name: string;
  statusLabel: string;
  segmentName: string | null;
  channelsLabel: string;
  sent: number;
  opened: number;
  used: number;
  usePctLabel: string;
  saleBaht: string;
  costBaht: string;
  roiLabel: string;
};

export function CampaignsTable({ systemId, rows }: { systemId: string; rows: CampaignRowView[] }) {
  return (
    <div className="card p-0">
      <div data-testid="campaigns-table" className="flex flex-col">
        <div
          className="hidden gap-3 border-b px-4 py-2 text-xs sm:grid"
          style={{ gridTemplateColumns: "2.4fr repeat(5, 1fr) 0.9fr", borderColor: "var(--color-line)", color: "var(--color-muted)" }}
        >
          <span>แคมเปญ</span>
          <span className="text-right">ส่งเดือนนี้</span>
          <span className="text-right">ใช้สิทธิ์</span>
          <span className="text-right">ยอดที่เกิด</span>
          <span className="text-right">ต้นทุน</span>
          <span className="text-right">ROI</span>
          <span className="text-right">สถานะ</span>
        </div>

        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--color-muted)" }}>
            ยังไม่มีแคมเปญในร้านนี้ — กด &ldquo;สร้างแคมเปญ&rdquo; เพื่อส่งข้อความหากลุ่มลูกค้ากลุ่มแรก
          </p>
        )}

        {rows.map((r) => (
          <Link
            key={r.id}
            data-testid={`campaign-row-${r.id}`}
            href={`/app/sys/${systemId}/member/campaigns/${r.id}`}
            className="grid gap-1 border-t px-4 py-3 text-sm first:border-t-0 sm:gap-3"
            style={{ gridTemplateColumns: "2.4fr repeat(5, 1fr) 0.9fr", borderColor: "var(--color-line)" }}
          >
            <span className="col-span-full flex min-w-0 flex-col sm:col-span-1">
              <span className="truncate font-medium">{r.name}</span>
              <span className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
                {[r.segmentName ?? "กลุ่มเฉพาะกิจ", r.channelsLabel].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="text-right tabular-nums">{r.sent.toLocaleString("th-TH")}</span>
            <span className="text-right tabular-nums">
              {r.used.toLocaleString("th-TH")}
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                {" "}
                {r.usePctLabel}
              </span>
            </span>
            <span className="text-right tabular-nums">{r.saleBaht}</span>
            <span className="text-right tabular-nums">{r.costBaht}</span>
            <span className="text-right tabular-nums">{r.roiLabel}</span>
            <span className="text-right text-xs" style={{ color: "var(--color-muted)" }}>
              {r.statusLabel}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default CampaignsTable;
