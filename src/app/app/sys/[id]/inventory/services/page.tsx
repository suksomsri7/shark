import { requireInventoryPage } from "@/lib/modules/inventory/guard";
import { systemDef } from "@/lib/systems";
import { InvServicesSection, invTabs } from "@/lib/modules/inventory/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "บริการ" ของระบบสินค้า/บริการ — ต้นฉบับเดียวของบริการทั้งระบบ (เจ้าของสั่งข้อ 12-15)
export default async function InvServicesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // HF-INV-0: ระบบคลังของร้านนี้ + สิทธิ์อ่านคลัง ไม่ผ่าน = 404 (เดิมสมาชิกทุกคนเห็นต้นทุน/ผู้ขาย)
  const { sys } = await requireInventoryPage(id);
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="บริการ — ราคา เวลา มัดจำ รูป (ที่เดียว)" />
      <ModuleTabs items={invTabs(id)} />
      <InvServicesSection systemId={id} />
    </div>
  );
}
