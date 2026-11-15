import { requireAccountPage } from "@/lib/modules/account/guard";
import { bookTaxView, upcomingDeadlines, complianceViewFrom, loadBookLegal, tipTreatmentWarning } from "@/lib/modules/account/legal-values";
import { ComplianceValuesSection } from "@/components/account-v2/ComplianceValuesSection"; // ACC T4.5 T4.7 T4.8 ◂
import { saveLegalRowsAction, saveWhtSettingsAction } from "@/lib/modules/account/tax-settings-actions";
import { SettingsNav } from "@/components/account-v2/SettingsNav";
import { LegalValuesPanel } from "@/components/account-v2/LegalValuesPanel";
import { EtaxSettingsCard } from "@/components/account-v2/EtaxTsBlocks"; // ACC T5.4 ◂

// หน้า "ตั้งค่า › ข้อมูลกิจการ › อัตราภาษีและกำหนดยื่น" (ACC T0.2)
// ตารางค่ากฎหมายมีวันที่มีผล: แถวของระบบ (จาก skill shark-thai-law · ที่มา + ป้าย + วันที่ตรวจ) + แถวที่ร้านเพิ่ม/ทับ
// ร้านตั้งค่าที่ต่างจากค่าเริ่มต้นได้เสมอ — ระบบเตือน ไม่บล็อก
export const dynamic = "force-dynamic";

export default async function AccountTaxSettingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ msg?: string; err?: string }> }) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const { tenantId, systemId } = await requireAccountPage(id, "account.settings.manage");
  const base = `/app/sys/${id}/account`;
  const [view, deadlines, legal] = await Promise.all([bookTaxView({ tenantId, systemId }, new Date()), upcomingDeadlines({ tenantId, systemId }, new Date()), loadBookLegal({ tenantId, systemId })]);
  const tip = legal.tipTreatment ?? "LIABILITY";

  return (
    <div className="flex max-w-[1200px] flex-col gap-4">
      <div className="sticky top-0 z-20 -mx-1 flex items-center justify-between gap-3 bg-[color:var(--color-surface)] px-1 py-2">
        <h1 className="text-2xl font-semibold">ตั้งค่า</h1>
      </div>
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <SettingsNav base={base} activeGroup="org" activeSub="tax" />
        <div className="min-w-0 flex-1">
          <LegalValuesPanel systemId={systemId} orgSettingsHref={`${base}/settings`} view={view} save={saveLegalRowsAction} saveWht={saveWhtSettingsAction} deadlines={deadlines} calendarHref={`${base}/tax/calendar`} />
          <div className="mt-4">
            <ComplianceValuesSection systemId={systemId} view={complianceViewFrom(legal, new Date())} tip={tip} tipWarning={tipTreatmentWarning(tip)} msg={sp.msg} err={sp.err} />
          </div>
          <div className="mt-4">
            <EtaxSettingsCard tenantId={tenantId} systemId={systemId} />
          </div>
        </div>
      </div>
    </div>
  );
}
