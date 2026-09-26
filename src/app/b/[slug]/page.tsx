// /b/[slug] — หน้าแรกของบริษัทในพอร์ทัล (ใบ C3.5 · ภาพ 12 ข): ค้างชำระ · ตัวเลข 2–3 ช่อง · ใบเสนอราคารอตอบ (ตอบรับ/ปฏิเสธ) · กิจกรรมล่าสุด
// 🔴 ทุกข้อมูลมาจาก `portal.home(token)` (บริษัทปัจจุบันของ session เท่านั้น) · ไทล์ "ดีลที่กำลังคุย" มีเฉพาะร้านที่ตั้ง showDeals
import Link from "next/link";
import { portal, portalBaht, portalDate, portalPath } from "@/lib/modules/crm";
import { PortalEmpty, PortalFrame, PortalSection } from "@/components/crm/portal/PortalFrame";
import { PortalQuoteActions } from "@/components/crm/portal/PortalClientBits";
import { portalLogoutAction, portalRespondQuotationAction, portalSwitchCompanyAction } from "./actions";
import { orPage } from "./_page";

export const dynamic = "force-dynamic";

export default async function PortalHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { token } = await portal.requirePortal(slug);
  const [h, f] = await Promise.all([orPage(slug, portal.home(token)), orPage(slug, portal.frameData(token))]);
  return (
    <PortalFrame slug={slug} active="home" companyName={f.companyName} shopName={f.shopName} meName={f.meName} companies={f.companies} currentCompanyId={f.currentCompanyId} switchAction={portalSwitchCompanyAction} logoutAction={portalLogoutAction}>
      {h.outstandingSatang > 0 ? (
        <Link href={portalPath(slug, "invoices")} data-testid="portal-home-outstanding" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px]" style={{ background: "var(--color-surface-2)" }}>
          <span aria-hidden>⚠</span>
          <span>
            ค้างชำระ <b>{portalBaht(h.outstandingSatang)}</b>
            {h.nextDueDate ? ` · ครบกำหนด ${portalDate(h.nextDueDate)}` : ""}
          </span>
        </Link>
      ) : (
        <div className="rounded-xl px-3 py-2.5 text-[13px]" style={{ background: "var(--color-surface-2)", color: "var(--color-muted)" }}>ไม่มียอดค้างชำระ</div>
      )}

      <div className="flex gap-5 py-1" data-testid="portal-home-stats">
        <div className="flex flex-col">
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>ใบเสนอราคารอตอบ</span>
          <span className="text-lg font-semibold">{h.quotesAwaiting}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>ใบแจ้งหนี้ค้าง</span>
          <span className="text-lg font-semibold">{h.openInvoices}</span>
        </div>
        {typeof h.openDealCount === "number" && (
          <div className="flex flex-col">
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>ดีลที่กำลังคุย</span>
            <span className="text-lg font-semibold">{h.openDealCount}</span>
          </div>
        )}
      </div>

      <PortalSection title="ใบเสนอราคารอตอบ">
        {h.awaiting.length === 0 ? (
          <PortalEmpty text="ไม่มีใบเสนอราคาที่รอคำตอบ" />
        ) : (
          h.awaiting.map((q, i) => (
            <div key={q.id} className="flex flex-col gap-2 rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--color-line)" }}>
              <div className="flex items-center gap-2">
                <Link href={portalPath(slug, "quotations", q.id)} data-testid="portal-home-quote-link" className="min-w-0 flex-1 text-[13px]">
                  <b>{q.docNo ?? "ใบเสนอราคา"}</b>
                  <div className="text-xs" style={{ color: "var(--color-muted)" }}>ออกเมื่อ {portalDate(q.issueDate)}{q.validUntil ? ` · ตอบได้ถึง ${portalDate(q.validUntil)}` : ""}</div>
                </Link>
                <b className="text-[14px]">{portalBaht(q.grandTotalSatang)}</b>
              </div>
              {i === 0 && <PortalQuoteActions docId={q.id} canRespond={q.canRespond} signerDefault={f.meName} action={portalRespondQuotationAction} compact />}
            </div>
          ))
        )}
      </PortalSection>

      <PortalSection title="กิจกรรมล่าสุด">
        {h.recent.length === 0 ? (
          <PortalEmpty text="ยังไม่มีความเคลื่อนไหว" />
        ) : (
          <div className="rounded-xl border px-3.5" style={{ borderColor: "var(--color-line)" }}>
            {h.recent.map((r, i) => (
              <div key={`${r.kind}-${i}`} className="flex items-center gap-2 border-b py-2.5 text-[12.5px] last:border-b-0" style={{ borderColor: "var(--color-line)" }}>
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>{portalDate(r.at)}</span>
              </div>
            ))}
          </div>
        )}
      </PortalSection>
    </PortalFrame>
  );
}
