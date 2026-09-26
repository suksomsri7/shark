// /b/[slug]/documents/[id] — เอกสาร/สัญญา 1 รายการ: เฉพาะช่องที่ร้านเปิดให้เห็น · ไฟล์แนบ (ลิงก์ชั่วคราว) · ขอแก้ช่องที่เปิดให้แก้ · ใบ C3.5
// 🔴 รายการของบริษัทอื่น/วัตถุที่ไม่ได้เปิดพอร์ทัล = notFound()
import { notFound } from "next/navigation";
import { portal, portalDate } from "@/lib/modules/crm";
import { PortalFrame, PortalSection } from "@/components/crm/portal/PortalFrame";
import { PortalRecordChange } from "@/components/crm/portal/PortalClientBits";
import { portalLogoutAction, portalRecordChangeAction, portalSwitchCompanyAction } from "../../actions";
import { orPage } from "../../_page";

export const dynamic = "force-dynamic";

export default async function PortalDocumentPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { token } = await portal.requirePortal(slug);
  const rec = await portal.getRecord(token, id).catch((e: unknown) => ((e as { code?: unknown })?.code === "NOT_FOUND" ? null : Promise.reject(e)));
  if (!rec) notFound();
  const f = await orPage(slug, portal.frameData(token));
  const editable = rec.fields.filter((x) => x.editable).map((x) => ({ key: x.key, label: x.label, value: x.value }));
  return (
    <PortalFrame slug={slug} active="documents" companyName={f.companyName} shopName={f.shopName} meName={f.meName} companies={f.companies} currentCompanyId={f.currentCompanyId} switchAction={portalSwitchCompanyAction} logoutAction={portalLogoutAction}>
      <div className="flex flex-col gap-3 rounded-xl border p-4" style={{ borderColor: "var(--color-line)" }} data-testid="portal-record-detail">
        <div>
          <div className="text-xs" style={{ color: "var(--color-muted)" }}>{rec.objectLabel}</div>
          <div className="text-[15px] font-semibold">{rec.title}</div>
          <div className="text-xs" style={{ color: "var(--color-muted)" }}>ปรับปรุงล่าสุด {portalDate(rec.updatedAt, true)}</div>
        </div>
        <dl className="grid grid-cols-1 gap-2 text-[12.5px] sm:grid-cols-2">
          {rec.fields.map((x) => (
            <div key={x.key}>
              <dt className="text-xs" style={{ color: "var(--color-muted)" }}>{x.label}</dt>
              <dd className="break-words">{x.value || "—"}</dd>
            </div>
          ))}
        </dl>
        {rec.files.length > 0 && (
          <PortalSection title="ไฟล์">
            <div className="flex flex-col gap-1">
              {rec.files.map((x) => (
                <a key={x.id} href={x.url} target="_blank" rel="noreferrer" data-testid="portal-record-file" className="truncate text-[12.5px] underline" style={{ color: "var(--color-accent)" }}>
                  {x.name}
                </a>
              ))}
            </div>
          </PortalSection>
        )}
        <PortalRecordChange recordId={rec.id} fields={editable} action={portalRecordChangeAction} />
      </div>
    </PortalFrame>
  );
}
