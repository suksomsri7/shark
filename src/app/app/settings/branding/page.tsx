import { requireTenant } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { getBrandingTokens } from "@/lib/branding/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandingSettings } from "@/components/branding/BrandingSettings";

// ตราสินค้าและธีมกิจการ (ledger/BRANDING-RUN.md §สัญญา B2 — แทนหน้าตั้งค่าแบรนด์ยุคเดิม White label WO-0064)
// โลโก้ / ชื่อที่แสดง / สีหลัก / โทนแถบเมนู / สวิตช์ขอบเขต — ตั้งครั้งเดียวใช้ทั้งระบบ SHARK ·
// แอปมือถือ · หน้าร้านออนไลน์ · ใบเสนอราคา/อีเมล (ledger/DESIGN-BRANDING.md §4)
//
// สิทธิ์: เฉพาะผู้มี `branding.setting.update` (OWNER เสมอ) แก้ได้ — คนอื่นเห็นหน้าเดียวกันแบบอ่านอย่างเดียว
export default async function BrandingSettingsPage() {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const canWrite = evaluate(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "branding", action: "branding.setting.update" },
  );

  // getBrandingTokens = ที่เดียวที่คำนวณโทเคนธีม (ค่าปริยายของแพลตฟอร์มเมื่อร้านยังไม่ตั้งอะไรเลย)
  const tokens = await getBrandingTokens(tenantId);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="ตราสินค้าและธีมกิจการ"
        desc="โลโก้ สีหลัก และแถบเมนูซ้าย — ใช้ทั้งในระบบ SHARK · แอปมือถือ · หน้าร้านออนไลน์ · ใบเสนอราคา/อีเมล"
      />
      {!canWrite && (
        <p className="rounded-lg border border-dashed p-3 text-sm text-[color:var(--color-muted)]">
          หน้านี้แก้ไขได้เฉพาะเจ้าของ/ผู้ดูแลร้าน — คุณดูค่าปัจจุบันได้แต่บันทึกการเปลี่ยนแปลงไม่ได้
        </p>
      )}
      <BrandingSettings
        tenantName={auth.active.tenant.name}
        canWrite={canWrite}
        initial={{
          displayName: tokens.displayName,
          logoUrl: tokens.logoUrl ?? "",
          brandColor: tokens.accent,
          navTone: tokens.navTone,
          applyStorefront: tokens.applyStorefront,
          applyMobile: tokens.applyMobile,
        }}
      />
    </div>
  );
}
