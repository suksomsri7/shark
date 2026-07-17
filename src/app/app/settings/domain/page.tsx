import { requireTenant } from "@/lib/core/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { DomainSettings } from "@/components/domain-settings";

// ตั้งค่าโดเมนของร้าน (Custom Domain) — ต่อโดเมนตัวเองเข้าหน้าร้าน (WO-0025)
export default async function DomainSettingsPage() {
  const auth = await requireTenant();
  const tenant = auth.active.tenant;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="โดเมนของร้าน"
        desc="ใช้โดเมนของคุณเอง (เช่น shop.example.com) เปิดหน้าร้านแทนที่อยู่ shark.in.th"
      />
      <DomainSettings
        customDomain={tenant.customDomain}
        domainStatus={tenant.domainStatus}
        isOwner={auth.active.role === "OWNER"}
      />
    </div>
  );
}
