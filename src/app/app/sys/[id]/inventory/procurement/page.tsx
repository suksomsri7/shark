import { INVENTORY_PROCUREMENT_KEYS, requireInventoryPage } from "@/lib/modules/inventory/guard";
import { systemDef } from "@/lib/systems";
import { InvProcurementSection, invTabs } from "@/lib/modules/inventory/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "จัดซื้อ" ของระบบคลัง — ซัพพลายเออร์ + ใบสั่งซื้อ (PO)
export default async function InvProcurementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // HF-INV-0: ระบบคลังของร้านนี้ + สิทธิ์จัดซื้อ/อ่านสินค้า (แคบกว่าหน้าอื่น — มีข้อมูลผู้ขาย/ยอด PO) ไม่ผ่าน = 404
  const { sys } = await requireInventoryPage(id, { anyOf: INVENTORY_PROCUREMENT_KEYS });
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="จัดซื้อ — ซัพพลายเออร์ + ใบสั่งซื้อ" />
      <ModuleTabs items={invTabs(id)} />
      <InvProcurementSection systemId={id} />
    </div>
  );
}
