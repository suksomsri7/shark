import { requireAccountPage } from "@/lib/modules/account/guard";
import { bookTaxView } from "@/lib/modules/account/legal-values";
import { saveLegalRowsAction } from "@/lib/modules/account/tax-settings-actions";
import { SettingsNav } from "@/components/account-v2/SettingsNav";
import { LegalValuesPanel } from "@/components/account-v2/LegalValuesPanel";

// หน้า "ตั้งค่า › ข้อมูลกิจการ › อัตราภาษีและกำหนดยื่น" (ACC T0.2)
// ตารางค่ากฎหมายมีวันที่มีผล: แถวของระบบ (จาก skill shark-thai-law · ที่มา + ป้าย + วันที่ตรวจ) + แถวที่ร้านเพิ่ม/ทับ
// ร้านตั้งค่าที่ต่างจากค่าเริ่มต้นได้เสมอ — ระบบเตือน ไม่บล็อก
export const dynamic = "force-dynamic";

export default async function AccountTaxSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, systemId } = await requireAccountPage(id, "account.settings.manage");
  const base = `/app/sys/${id}/account`;
  const view = await bookTaxView({ tenantId, systemId }, new Date());

  return (
    <div className="flex max-w-[1200px] flex-col gap-4">
      <div className="sticky top-0 z-20 -mx-1 flex items-center justify-between gap-3 bg-[color:var(--color-surface)] px-1 py-2">
        <h1 className="text-2xl font-semibold">ตั้งค่า</h1>
      </div>
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <SettingsNav base={base} activeGroup="org" activeSub="tax" />
        <div className="min-w-0 flex-1">
          <LegalValuesPanel systemId={systemId} orgSettingsHref={`${base}/settings`} view={view} save={saveLegalRowsAction} />
        </div>
      </div>
    </div>
  );
}
