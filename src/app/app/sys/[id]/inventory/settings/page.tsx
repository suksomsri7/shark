import { requireInventoryPage } from "@/lib/modules/inventory/guard";
import { systemDef } from "@/lib/systems";
import { InvSettingsSection, invTabs } from "@/lib/modules/inventory/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "ตั้งค่า" ของระบบสินค้า/บริการ — หมวดหมู่ + ค่าเริ่มต้น + SKU/บาร์โค้ด (เจ้าของสั่งข้อ 17)
export default async function InvSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // HF-INV-0: ระบบคลังของร้านนี้ + สิทธิ์อ่านคลัง ไม่ผ่าน = 404 (เดิมสมาชิกทุกคนเห็นต้นทุน/ผู้ขาย)
  const { sys } = await requireInventoryPage(id);
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="ตั้งค่า — หมวดหมู่ · SKU · บาร์โค้ด" />
      <ModuleTabs items={invTabs(id)} />
      <InvSettingsSection systemId={id} />
    </div>
  );
}
