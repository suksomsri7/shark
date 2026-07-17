import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { listTemplates, listInstalled } from "@/lib/marketplace/service";
import { MarketplaceGrid, type TemplateCard } from "./MarketplaceGrid";

// ตลาดเทมเพลต (WO-0063) — เลือกเทมเพลตธุรกิจสำเร็จรูป ติดตั้งคลิกเดียว
// ติดตั้ง = เดิน pipeline DNA เดิม (facts → blueprint → ประกอบระบบจริง)
export default async function MarketplacePage() {
  const auth = await requireTenant();
  const ctx = { tenantId: auth.active.tenantId };

  const templates: TemplateCard[] = listTemplates();
  const [installed, dna] = await Promise.all([
    listInstalled(ctx),
    prisma.dnaProfile.findUnique({ where: { tenantId: ctx.tenantId } }),
  ]);
  const installedKeys = installed.map((i) => i.itemKey);
  const hasDna = Boolean(dna);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="ตลาดเทมเพลต"
        desc="เลือกเทมเพลตธุรกิจสำเร็จรูป ติดตั้งคลิกเดียว ระบบจะประกอบหน่วยธุรกิจและฟีเจอร์ที่เหมาะกับร้านให้อัตโนมัติ"
      />
      {hasDna && installedKeys.length === 0 && (
        <p className="rounded-lg border bg-[color:var(--color-surface-2)] px-3 py-2 text-xs text-[color:var(--color-muted)]">
          ร้านนี้ตั้งค่าธุรกิจไว้แล้ว จึงติดตั้งเทมเพลตทับไม่ได้ — ปรับได้ที่การตั้งค่าธุรกิจโดยตรง
        </p>
      )}
      <MarketplaceGrid templates={templates} installedKeys={installedKeys} hasDna={hasDna} />
    </div>
  );
}
