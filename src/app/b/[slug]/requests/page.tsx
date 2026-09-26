// /b/[slug]/requests — แจ้งเรื่อง/คำขอของบริษัท + สถานะ (เปิด · กำลังทำ · เสร็จ จากคอลัมน์ของการ์ดบอร์ดงาน · หรือผลอนุมัติ) · ใบ C3.5
import { portal, portalCanChangeData, portalDate, PORTAL_REQUEST_KIND_LABEL } from "@/lib/modules/crm";
import { PortalBadge, PortalEmpty, PortalFrame, PortalSection } from "@/components/crm/portal/PortalFrame";
import { PortalRequestForm } from "@/components/crm/portal/PortalClientBits";
import { portalCreateRequestAction, portalLogoutAction, portalSwitchCompanyAction } from "../actions";
import { orPage } from "../_page";

export const dynamic = "force-dynamic";

export default async function PortalRequestsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { token } = await portal.requirePortal(slug);
  const [list, f] = await Promise.all([orPage(slug, portal.listRequests(token)), orPage(slug, portal.frameData(token))]);
  // ตารางสิทธิ์ (รอบ 4): แจ้งเรื่อง/ขอเอกสาร = ทุกบทบาท (ถ้าร้านเปิด) · ขอเปลี่ยนผู้ติดต่อ = APPROVE ขึ้นไป — บริการตรวจซ้ำ
  const kinds = [...(f.settings.allowIssue ? ["ISSUE", "DOCUMENT_REQUEST"] : []), ...(portalCanChangeData(f.role) ? ["CONTACT_CHANGE"] : [])].map((k) => ({ value: k, label: PORTAL_REQUEST_KIND_LABEL[k as keyof typeof PORTAL_REQUEST_KIND_LABEL] }));
  return (
    <PortalFrame slug={slug} active="requests" companyName={f.companyName} shopName={f.shopName} meName={f.meName} companies={f.companies} currentCompanyId={f.currentCompanyId} switchAction={portalSwitchCompanyAction} logoutAction={portalLogoutAction}>
      <PortalSection title="แจ้งเรื่อง" action={kinds.length > 0 ? <PortalRequestForm kinds={kinds} action={portalCreateRequestAction} /> : undefined}>
        {list.items.length === 0 ? (
          <PortalEmpty text="ยังไม่มีเรื่องที่แจ้ง" />
        ) : (
          <div className="rounded-xl border px-3.5" style={{ borderColor: "var(--color-line)" }}>
            {list.items.map((r) => (
              <div key={r.id} className="flex items-center gap-2 border-b py-2.5 text-[12.5px] last:border-b-0" style={{ borderColor: "var(--color-line)" }} data-testid="portal-request-row">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{r.title || r.kindLabel}</span>
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                    {r.kindLabel} · {portalDate(r.createdAt)}
                  </span>
                </span>
                <PortalBadge status={r.progress} label={r.progressLabel} />
              </div>
            ))}
          </div>
        )}
      </PortalSection>
    </PortalFrame>
  );
}
