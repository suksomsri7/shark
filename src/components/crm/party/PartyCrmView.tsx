// PartyCrmView.tsx — บล็อก "CRM" บนหน้าโปรไฟล์ผู้ติดต่อกลาง `/app/party/[partyId]` (ใบ C1.11 · RESOLUTIONS R-A) — แสดงผลล้วน (server · ไม่มี hook)
// ข้อมูลมาจาก `crm/party-block.tsx` (ผ่านการมองเห็นของ CRM แล้ว · ระบบ uiVersion 1 ไม่มีในรายการ) · ไม่มีเบอร์/อีเมล · ไม่มีข้อมูลคลินิก
import Link from "next/link";

const muted = "text-[color:var(--color-muted)]";
const baht = (satang: number) => `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;
const LIFECYCLE: Record<string, string> = { LEAD: "ผู้สนใจ", PROSPECT: "มีโอกาส", CUSTOMER: "ลูกค้าแล้ว", LOST: "ไม่ไปต่อ", CHURNED: "เลิกเป็นลูกค้า" };

export type PartyCrmRow = {
  systemId: string;
  systemName: string;
  contact: { id: string; name: string; lifecycleStage: string };
  company: { id: string; name: string } | null;
  openDeals: { id: string; title: string; valueSatang: number; stageName: string }[];
};

export function PartyCrmView({ rows }: { rows: PartyCrmRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="card flex min-w-0 flex-col gap-3 p-4" data-testid="party-crm">
      <h2 className="text-sm font-semibold">CRM</h2>
      {rows.map((r) => (
        <div key={r.systemId} className="flex min-w-0 flex-col gap-2">
          {rows.length > 1 && <span className={`text-xs ${muted}`}>{r.systemName}</span>}
          <Link href={`/app/sys/${r.systemId}/crm/contacts/${r.contact.id}`} className="flex min-w-0 flex-col" data-testid="party-crm-contact">
            <span className="truncate text-sm font-medium">{r.contact.name}</span>
            <span className={`text-xs ${muted}`}>
              {LIFECYCLE[r.contact.lifecycleStage] ?? r.contact.lifecycleStage}
              {r.company ? ` · ${r.company.name}` : ""}
            </span>
          </Link>
          {r.openDeals.length > 0 && (
            <ul className="flex min-w-0 flex-col gap-1">
              {r.openDeals.map((d) => (
                <li key={d.id}>
                  <Link href={`/app/sys/${r.systemId}/crm/deals/${d.id}`} className="flex min-w-0 items-center justify-between gap-2 text-sm" data-testid="party-crm-deal">
                    <span className="min-w-0 truncate">{d.title}</span>
                    <span className={`shrink-0 text-xs ${muted}`}>
                      {d.stageName} · {baht(d.valueSatang)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
