// contacts-overview-ui.tsx — หน้า "ดูภาพรวมผู้ติดต่อ" (WO 3.2 · §7.4)
// ภาษาภาพเดียวกับหน้าภาพรวมรายรับ/รายจ่าย (WO 2.3 overview-ui.tsx) — การ์ด TopListCard/TopRow ชุดเดียวกัน
// ไม่มี mockup เฉพาะของหน้านี้ (SPEC มีแค่บรรทัดเดียว §7.4) ⇒ ยึดโครง+โทเคนของ overview-ui.tsx ที่มี mockup แล้ว

import Link from "next/link";
import { loadContactsOverview } from "./contacts-overview";
import { TopListCard, TopRow } from "./ui";
import { PrintButton } from "@/components/account-v2/PrintButton";

export async function ContactsOverviewPage({ tenantId, systemId, id }: { tenantId: string; systemId: string; id: string }) {
  const base = `/app/sys/${id}/account`;
  const data = await loadContactsOverview({ tenantId, systemId });

  return (
    <section className="flex flex-col gap-4" data-testid="contacts-overview">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">ดูภาพรวมผู้ติดต่อ</h1>
          <p className="text-sm text-[color:var(--color-muted)]">สรุปพฤติกรรมลูกค้า/ผู้ขายทั้งหมด</p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton />
          <Link href={`${base}/contacts`} className="btn-sm">
            ← ผู้ติดต่อ
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card flex flex-col gap-1" data-testid="ov-new-customers">
          <span className="text-sm text-[color:var(--color-muted)]">ลูกค้าใหม่เดือนนี้</span>
          <span className="text-2xl font-semibold tabular-nums">{data.newCustomersThisMonth}</span>
        </div>
        <div className="card flex flex-col gap-1" data-testid="ov-returning-customers">
          <span className="text-sm text-[color:var(--color-muted)]">ลูกค้าที่กลับมาซื้อ</span>
          <span className="text-2xl font-semibold tabular-nums">{data.returningCustomers}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TopListCard testId="ov-top-purchases" title="10 อันดับยอดซื้อ" empty="ยังไม่มีข้อมูลการซื้อ">
          {data.topCustomersByPurchases.map((r) => (
            <TopRow key={r.contactId} name={`${r.code} · ${r.name}`} sub={r.count ? `${r.count} ใบ` : undefined} amount={r.amountSatang} max={data.topCustomersByPurchases[0]?.amountSatang ?? 1} />
          ))}
        </TopListCard>
        <TopListCard testId="ov-top-outstanding" title="10 อันดับค้างชำระ" empty="ไม่มีลูกหนี้ค้างชำระ">
          {data.topOutstanding.map((r) => (
            <TopRow key={r.contactId} name={`${r.code} · ${r.name}`} amount={r.amountSatang} max={data.topOutstanding[0]?.amountSatang ?? 1} />
          ))}
        </TopListCard>
        <TopListCard testId="ov-top-vendors" title="ผู้ขาย 10 อันดับยอดจ่าย" empty="ยังไม่มีข้อมูลการจ่าย">
          {data.topVendorsByPayments.map((r) => (
            <TopRow key={r.contactId} name={`${r.code} · ${r.name}`} amount={r.amountSatang} max={data.topVendorsByPayments[0]?.amountSatang ?? 1} />
          ))}
        </TopListCard>
      </div>
    </section>
  );
}

export default ContactsOverviewPage;
