import { loadAccountSystem } from "@/lib/modules/account/guard";
import { getSettings, accountFlyoutCounts } from "@/lib/modules/account/service";
import { ACCOUNT_NAV } from "@/lib/modules/account/nav";
import { EDITOR_DOC_TYPES, canCreateDirect } from "@/lib/modules/account/doc-editor-config";
import { isGroupDocType } from "@/lib/modules/account/group";
import { AccountTabBar } from "@/components/account-v2/AccountTabBar";
import { AccountBreadcrumb } from "@/components/account-v2/AccountBreadcrumb";
import { BreadcrumbTailProvider } from "@/components/account-v2/breadcrumb-tail";
import { QuickCreate } from "@/components/account-v2/QuickCreate";
import { UndoToast } from "@/components/account-v2/UndoToast";

// Shell V2 (WO 0.4): แถบเมนูบัญชี 9 หมวด (แทน sidebar เดิม) + breadcrumb เหนือเนื้อหา
// เนื้อหาเต็มความกว้างแล้ว (ไม่มี sidebar แบ่งซ้าย) — เมนูอยู่ใน AccountTabBar ทั้งเดสก์ท็อป/มือถือ
export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { tenantId, systemId } = await loadAccountSystem(id);
  const base = `/app/sys/${id}/account`;
  const [settings, counts] = await Promise.all([
    getSettings(tenantId, systemId),
    accountFlyoutCounts(tenantId, systemId),
  ]);
  const groups = ACCOUNT_NAV(base, settings.vatRegistered);
  // WO 9.4 (§0.3 ข้อ 3) — ชนิดเอกสารที่ ⌘K "สร้างด่วน" พาไปสร้างตรงได้ (ไม่รวมที่แปลงมาเท่านั้น/เอกสารกลุ่ม
  // ซึ่งต้องเลือกใบลูกก่อนในฟอร์มพิเศษของตัวเอง — GroupNewPage) · คำนวณจากรายการ static (0 query เพิ่ม)
  const createDocTypes = EDITOR_DOC_TYPES.filter((d) => canCreateDirect(d.docType) && !isGroupDocType(d.docType)).map(
    (d) => ({ docType: d.docType, label: d.label, route: d.route, side: d.side }),
  );

  return (
    // WO 9.4 — UndoToast ครอบทั้งต้นไม้ (provider ของ useUndoToast) ให้ทุกปุ่ม/แผงในหน้าเรียก toast "เลิกทำ" ได้
    <UndoToast base={base} systemId={id}>
      <div className="flex flex-col gap-4">
        <AccountTabBar groups={groups} base={base} counts={counts} />
        {/* WO 3.4: provider ครอบทั้ง breadcrumb และเนื้อหา — หน้ารายละเอียดเติมชื่อแถวต่อท้าย breadcrumb ได้ */}
        <BreadcrumbTailProvider>
          <AccountBreadcrumb groups={groups} base={base} />
          <div className="min-w-0">{children}</div>
        </BreadcrumbTailProvider>
        {/* ⌘K ใช้ได้ทุกหน้าในโมดูลบัญชี — ทางเข้ารอง: ปุ่ม "+ สร้างเอกสาร" เดิม (DashCreateMenu) */}
        <QuickCreate base={base} systemId={id} vatRegistered={settings.vatRegistered} createDocTypes={createDocTypes} />
      </div>
    </UndoToast>
  );
}
