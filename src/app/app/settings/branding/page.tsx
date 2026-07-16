import { requireTenant } from "@/lib/core/context";
import { getBranding } from "@/lib/branding/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandingForm } from "@/components/branding-form";

// ตั้งค่าแบรนด์ร้าน (White label v1) — ชื่อที่โชว์ / โลโก้ / สีหลัก บนหน้าร้านสาธารณะ
export default async function BrandingSettingsPage() {
  const auth = await requireTenant();
  const branding = await getBranding({ tenantId: auth.active.tenantId });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="แบรนด์ร้าน"
        back={{ href: "/app", label: "หน้าหลัก" }}
        desc="ตั้งชื่อที่แสดง โลโก้ และสีหลักของร้าน เพื่อใช้บนหน้าร้านค้าและฟอร์มสาธารณะ"
      />
      <BrandingForm
        fallbackName={auth.active.tenant.name}
        defaultDisplayName={branding?.displayName ?? ""}
        defaultLogoUrl={branding?.logoUrl ?? ""}
        defaultBrandColor={branding?.brandColor ?? ""}
      />
    </div>
  );
}
