// /b/[slug]/invoices/[id] — ใบแจ้งหนี้ 1 ใบ: ยอดคงค้าง · ชำระ PromptPay (`/pay/<token>` ของบัญชี) · แนบสลิป (ไฟล์ส่วนตัว) · ใบ C3.5
// 🔴 id ของบริษัทอื่น/ร้านอื่น = notFound() · ไม่มีหน้า/ทางจ่ายเงินใหม่ใต้ /b (ลิงก์ชำระคือหน้าเดิมของบัญชี)
import { notFound } from "next/navigation";
import { portal, portalBaht, portalDate } from "@/lib/modules/crm";
import { PortalBadge, PortalFrame } from "@/components/crm/portal/PortalFrame";
import { PortalPayActions } from "@/components/crm/portal/PortalClientBits";
import { portalLogoutAction, portalPayLinkAction, portalSwitchCompanyAction, portalUploadSlipAction } from "../../actions";
import { orPage } from "../../_page";

export const dynamic = "force-dynamic";

export default async function PortalInvoicePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { token } = await portal.requirePortal(slug);
  const inv = await portal.getInvoice(token, id).catch((e: unknown) => ((e as { code?: unknown })?.code === "NOT_FOUND" ? null : Promise.reject(e)));
  if (!inv) notFound();
  const f = await orPage(slug, portal.frameData(token));
  return (
    <PortalFrame slug={slug} active="invoices" companyName={f.companyName} shopName={f.shopName} meName={f.meName} companies={f.companies} currentCompanyId={f.currentCompanyId} switchAction={portalSwitchCompanyAction} logoutAction={portalLogoutAction}>
      <div className="flex flex-col gap-3 rounded-xl border p-4" style={{ borderColor: "var(--color-line)" }} data-testid="portal-invoice-detail">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs" style={{ color: "var(--color-muted)" }}>ใบแจ้งหนี้</div>
            <div className="text-[15px] font-semibold">{inv.docNo ?? "—"}</div>
            <div className="text-xs" style={{ color: "var(--color-muted)" }}>
              ออกเมื่อ {portalDate(inv.issueDate, true)}
              {inv.dueDate ? ` · ครบกำหนด ${portalDate(inv.dueDate, true)}` : ""}
            </div>
          </div>
          <PortalBadge status={inv.status} label={inv.statusLabel} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-[12.5px]">
          <div>
            <div className="text-xs" style={{ color: "var(--color-muted)" }}>ยอดตามใบ</div>
            <div className="font-semibold">{portalBaht(inv.grandTotalSatang)}</div>
          </div>
          <div>
            <div className="text-xs" style={{ color: "var(--color-muted)" }}>คงค้าง</div>
            <div className="font-semibold">{portalBaht(inv.outstandingSatang)}</div>
          </div>
        </div>
        <PortalPayActions invoiceId={inv.id} canPay={inv.canPay} payAction={portalPayLinkAction} slipAction={portalUploadSlipAction} />
      </div>
    </PortalFrame>
  );
}
