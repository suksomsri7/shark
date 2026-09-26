// /b/[slug]/contacts — ผู้ติดต่อของบริษัทปัจจุบัน (เพื่อนร่วมงาน) · ขอเพิ่ม/เปลี่ยน = คำขอให้ร้านอนุมัติ · ใบ C3.5
// 🔴 เฉพาะคนในบริษัทนี้ (ไม่มีข้อมูลของบริษัทอื่น/พนักงานร้าน — X8)
import { portal, portalCanChangeData, PORTAL_REQUEST_KIND_LABEL } from "@/lib/modules/crm";
import { PortalEmpty, PortalFrame, PortalSection } from "@/components/crm/portal/PortalFrame";
import { PortalRequestForm } from "@/components/crm/portal/PortalClientBits";
import { portalCreateRequestAction, portalLogoutAction, portalSwitchCompanyAction } from "../actions";
import { orPage } from "../_page";

export const dynamic = "force-dynamic";

export default async function PortalContactsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { token } = await portal.requirePortal(slug);
  const [list, f] = await Promise.all([orPage(slug, portal.listContacts(token)), orPage(slug, portal.frameData(token))]);
  return (
    <PortalFrame slug={slug} active="contacts" companyName={f.companyName} shopName={f.shopName} meName={f.meName} companies={f.companies} currentCompanyId={f.currentCompanyId} switchAction={portalSwitchCompanyAction} logoutAction={portalLogoutAction}>
      <PortalSection
        title="ผู้ติดต่อบริษัท"
        action={portalCanChangeData(f.role) ? <PortalRequestForm kinds={[{ value: "CONTACT_CHANGE", label: PORTAL_REQUEST_KIND_LABEL.CONTACT_CHANGE }]} action={portalCreateRequestAction} /> : undefined}
      >
        {list.items.length === 0 ? (
          <PortalEmpty text="ยังไม่มีผู้ติดต่อ" />
        ) : (
          <div className="rounded-xl border px-3.5" style={{ borderColor: "var(--color-line)" }}>
            {list.items.map((c) => (
              <div key={c.id} className="flex flex-col border-b py-2.5 text-[12.5px] last:border-b-0" style={{ borderColor: "var(--color-line)" }}>
                <span className="font-medium">
                  {c.name}
                  {c.isMe ? " (คุณ)" : ""}
                  {c.isPrimary ? " · ผู้ติดต่อหลัก" : ""}
                </span>
                <span className="text-xs break-all" style={{ color: "var(--color-muted)" }}>
                  {[c.jobTitle, c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </PortalSection>
    </PortalFrame>
  );
}
