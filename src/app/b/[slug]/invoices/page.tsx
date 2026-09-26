// /b/[slug]/invoices — ใบแจ้งหนี้ของบริษัท + การ์ดใบที่ค้างชำระ (ชำระ PromptPay · แนบสลิป) · ใบ C3.5 · ภาพ 12 (ค)
import Link from "next/link";
import { portal, portalBaht, portalDate, portalPath } from "@/lib/modules/crm";
import { PortalBadge, PortalEmpty, PortalFrame, PortalSection } from "@/components/crm/portal/PortalFrame";
import { PortalPayActions } from "@/components/crm/portal/PortalClientBits";
import { portalLogoutAction, portalPayLinkAction, portalSwitchCompanyAction, portalUploadSlipAction } from "../actions";
import { orPage } from "../_page";

export const dynamic = "force-dynamic";

export default async function PortalInvoicesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { token } = await portal.requirePortal(slug);
  const [list, f] = await Promise.all([orPage(slug, portal.listInvoices(token)), orPage(slug, portal.frameData(token))]);
  const due = list.items.find((i) => i.outstandingSatang > 0);
  return (
    <PortalFrame slug={slug} active="invoices" companyName={f.companyName} shopName={f.shopName} meName={f.meName} companies={f.companies} currentCompanyId={f.currentCompanyId} switchAction={portalSwitchCompanyAction} logoutAction={portalLogoutAction}>
      {due && (
        <div className="flex flex-col gap-3 rounded-xl border p-4 lg:flex-row lg:items-center" style={{ borderColor: "var(--color-line)" }} data-testid="portal-invoice-due">
          <div className="min-w-0 flex-1">
            <div className="text-xs" style={{ color: "var(--color-muted)" }}>
              {due.docNo ?? "ใบแจ้งหนี้"} · {due.statusLabel}
              {due.dueDate ? ` · กำหนด ${portalDate(due.dueDate, true)}` : ""}
            </div>
            <div className="text-2xl font-semibold">{portalBaht(due.outstandingSatang)}</div>
          </div>
          <div className="w-full lg:w-56">
            <PortalPayActions invoiceId={due.id} canPay={due.canPay} payAction={portalPayLinkAction} slipAction={portalUploadSlipAction} />
          </div>
        </div>
      )}
      <PortalSection title="ใบแจ้งหนี้ทั้งหมด">
        {list.items.length === 0 ? (
          <PortalEmpty text="ยังไม่มีใบแจ้งหนี้" />
        ) : (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--color-line)" }}>
            <table className="w-full text-[12.5px]">
              <thead className="hidden text-left text-xs lg:table-header-group" style={{ color: "var(--color-muted)", background: "var(--color-surface-2)" }}>
                <tr>
                  <th className="px-3 py-2 font-medium">เลขที่</th>
                  <th className="px-3 py-2 font-medium">จำนวนเงิน</th>
                  <th className="px-3 py-2 font-medium">ครบกำหนด</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((i) => (
                  <tr key={i.id} className="border-t first:border-t-0" style={{ borderColor: "var(--color-line)" }}>
                    <td className="px-3 py-2.5">
                      <Link href={portalPath(slug, "invoices", i.id)} data-testid="portal-invoice-row" className="font-medium">
                        {i.docNo ?? "ใบแจ้งหนี้"}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">{portalBaht(i.grandTotalSatang)}</td>
                    <td className="hidden px-3 py-2.5 lg:table-cell">{i.dueDate ? portalDate(i.dueDate) : "—"}</td>
                    <td className="px-3 py-2.5 text-right lg:text-left">
                      <PortalBadge status={i.status} label={i.statusLabel} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PortalSection>
    </PortalFrame>
  );
}
