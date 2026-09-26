// /b/[slug]/quotations/[id] — ใบเสนอราคา 1 ใบ + ตอบรับ/ปฏิเสธ (ชื่อผู้ลงนาม · เหตุผลเมื่อปฏิเสธ) · ใบ C3.5
// 🔴 id ของบริษัทอื่น/ร้านอื่น = notFound() (บริการตอบ NOT_FOUND — ไม่บอกว่ามีอยู่)
import { notFound } from "next/navigation";
import { portal, portalBaht, portalDate } from "@/lib/modules/crm";
import { PortalBadge, PortalFrame } from "@/components/crm/portal/PortalFrame";
import { PortalQuoteActions } from "@/components/crm/portal/PortalClientBits";
import { portalLogoutAction, portalRespondQuotationAction, portalSwitchCompanyAction } from "../../actions";
import { orPage } from "../../_page";

export const dynamic = "force-dynamic";

export default async function PortalQuotationPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { token } = await portal.requirePortal(slug);
  const q = await portal.getQuotation(token, id).catch((e: unknown) => ((e as { code?: unknown })?.code === "NOT_FOUND" ? null : Promise.reject(e)));
  if (!q) notFound();
  const f = await orPage(slug, portal.frameData(token));
  return (
    <PortalFrame slug={slug} active="quotations" companyName={f.companyName} shopName={f.shopName} meName={f.meName} companies={f.companies} currentCompanyId={f.currentCompanyId} switchAction={portalSwitchCompanyAction} logoutAction={portalLogoutAction}>
      <div className="flex flex-col gap-3 rounded-xl border p-4" style={{ borderColor: "var(--color-line)" }} data-testid="portal-quote-detail">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs" style={{ color: "var(--color-muted)" }}>ใบเสนอราคา</div>
            <div className="text-[15px] font-semibold">{q.docNo ?? "—"}</div>
            <div className="text-xs" style={{ color: "var(--color-muted)" }}>
              ออกเมื่อ {portalDate(q.issueDate, true)}
              {q.validUntil ? ` · ตอบได้ถึง ${portalDate(q.validUntil, true)}` : ""}
            </div>
          </div>
          <PortalBadge status={q.status} label={q.statusLabel} />
        </div>
        <div className="text-2xl font-semibold">{portalBaht(q.grandTotalSatang)}</div>
        {q.canRespond ? (
          <PortalQuoteActions docId={q.id} canRespond signerDefault={f.meName} action={portalRespondQuotationAction} />
        ) : q.status === "AWAITING_ACCEPT" ? (
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>ใบนี้ตอบผ่านพอร์ทัลไม่ได้ (หมดอายุแล้ว หรือสิทธิ์ของบัญชีนี้ดูได้อย่างเดียว) — ติดต่อร้านได้โดยตรง</p>
        ) : null}
      </div>
    </PortalFrame>
  );
}
