// /b/[slug]/quotations — ใบเสนอราคาของบริษัท (ใบ C3.5) · ตอบรับ/ปฏิเสธที่หน้ารายละเอียด
import Link from "next/link";
import { portal, portalBaht, portalDate, portalPath } from "@/lib/modules/crm";
import { PortalBadge, PortalEmpty, PortalFrame, PortalSection } from "@/components/crm/portal/PortalFrame";
import { portalLogoutAction, portalSwitchCompanyAction } from "../actions";
import { orPage } from "../_page";

export const dynamic = "force-dynamic";

export default async function PortalQuotationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { token } = await portal.requirePortal(slug);
  const [list, f] = await Promise.all([orPage(slug, portal.listQuotations(token)), orPage(slug, portal.frameData(token))]);
  return (
    <PortalFrame slug={slug} active="quotations" companyName={f.companyName} shopName={f.shopName} meName={f.meName} companies={f.companies} currentCompanyId={f.currentCompanyId} switchAction={portalSwitchCompanyAction} logoutAction={portalLogoutAction}>
      <PortalSection title="ใบเสนอราคาทั้งหมด">
        {list.items.length === 0 ? (
          <PortalEmpty text="ยังไม่มีใบเสนอราคา" />
        ) : (
          <div className="flex flex-col gap-2">
            {list.items.map((q) => (
              <Link key={q.id} href={portalPath(slug, "quotations", q.id)} data-testid="portal-quote-row" className="flex items-center gap-2 rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--color-line)" }}>
                <span className="min-w-0 flex-1 text-[13px]">
                  <b>{q.docNo ?? "ใบเสนอราคา"}</b>
                  <span className="block text-xs" style={{ color: "var(--color-muted)" }}>
                    {portalDate(q.issueDate)}
                    {q.validUntil ? ` · ตอบได้ถึง ${portalDate(q.validUntil)}` : ""}
                  </span>
                </span>
                <PortalBadge status={q.status} label={q.statusLabel} />
                <b className="text-[13.5px]">{portalBaht(q.grandTotalSatang)}</b>
              </Link>
            ))}
          </div>
        )}
      </PortalSection>
    </PortalFrame>
  );
}
