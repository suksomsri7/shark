// /b/[slug]/documents — เอกสาร/สัญญา (รายการของวัตถุที่ร้านเปิดให้พอร์ทัลเห็น · แม่ = บริษัทปัจจุบัน) + ใบเสร็จ/ใบกำกับภาษี · ใบ C3.5
// 🔴 ไฟล์เปิดผ่านลิงก์ชั่วคราว `/api/files/<id>?exp&sig` ที่ผูก session นี้เท่านั้น (ไม่มี URL ถาวร)
import Link from "next/link";
import { portal, portalBaht, portalDate, portalPath } from "@/lib/modules/crm";
import { PortalBadge, PortalEmpty, PortalFrame, PortalSection } from "@/components/crm/portal/PortalFrame";
import { portalLogoutAction, portalSwitchCompanyAction } from "../actions";
import { orPage } from "../_page";

export const dynamic = "force-dynamic";

export default async function PortalDocumentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { token } = await portal.requirePortal(slug);
  const [docs, receipts, f] = await Promise.all([orPage(slug, portal.listDocuments(token)), orPage(slug, portal.listReceipts(token)), orPage(slug, portal.frameData(token))]);
  return (
    <PortalFrame slug={slug} active="documents" companyName={f.companyName} shopName={f.shopName} meName={f.meName} companies={f.companies} currentCompanyId={f.currentCompanyId} switchAction={portalSwitchCompanyAction} logoutAction={portalLogoutAction}>
      <PortalSection title="เอกสาร/สัญญา">
        {docs.items.length === 0 ? (
          <PortalEmpty text="ร้านยังไม่ได้แชร์เอกสารให้บริษัทนี้" />
        ) : (
          <div className="rounded-xl border px-3.5" style={{ borderColor: "var(--color-line)" }}>
            {docs.items.map((d) => (
              <Link key={d.id} href={portalPath(slug, "documents", d.id)} data-testid="portal-document-row" className="flex items-center gap-2 border-b py-2.5 text-[12.5px] last:border-b-0" style={{ borderColor: "var(--color-line)" }}>
                <span aria-hidden>🗎</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{d.title}</span>
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                    {d.objectLabel}
                    {d.files.length ? ` · ไฟล์ ${d.files.length}` : ""}
                  </span>
                </span>
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>{portalDate(d.updatedAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </PortalSection>
      <PortalSection title="ใบเสร็จ/ใบกำกับภาษี">
        {receipts.items.length === 0 ? (
          <PortalEmpty text="ยังไม่มีใบเสร็จ" />
        ) : (
          <div className="rounded-xl border px-3.5" style={{ borderColor: "var(--color-line)" }}>
            {receipts.items.map((r) => (
              <div key={r.id} className="flex items-center gap-2 border-b py-2.5 text-[12.5px] last:border-b-0" style={{ borderColor: "var(--color-line)" }}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {r.docLabel} {r.docNo ?? ""}
                  </span>
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>{portalDate(r.issueDate)}</span>
                </span>
                <PortalBadge status={r.status} label={r.statusLabel} />
                <b>{portalBaht(r.grandTotalSatang)}</b>
              </div>
            ))}
          </div>
        )}
      </PortalSection>
    </PortalFrame>
  );
}
