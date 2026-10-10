import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { systemDef } from "@/lib/systems";
import { posTabs } from "@/lib/modules/pos/tabs";
import { posMembership } from "@/lib/modules/pos/access";
import { posUnits } from "@/lib/modules/pos/register";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { loadProductsData } from "../products-data";
import { PriceRulesClient } from "./PriceRulesClient";

// POS P2.2U ▸ มติ 4 — จอ "โปรราคา / Happy hour" ใต้แท็บสินค้า (/pos/products/price-rules · ลิงก์จากปุ่มบนตาราง 06 และการ์ดการตลาดของภาพ 10)
//   รายการโหลดฝั่ง client (listPriceRulesAction) · หน้านี้เลือกสาขาที่เข้าได้ + ส่งรายการสินค้า/หมวด/ช่องทาง/สาขาให้ตัวเลือกในลิ้นชักแก้
// 🔴 ดูรายการ = pos.product.manage ที่สาขา (ไม่มี = การ์ดปฏิเสธ หน้า 200) · แก้ = pos.price.rule ที่สาขา (ไม่มี = อ่านอย่างเดียว) — action/บริการตรวจซ้ำทุกครั้ง
//   ?unit=<สาขา> · ?rule=<id> = เปิดลิ้นชักของโปรนั้น (ลิงก์จากลิ้นชัก 06)
export default async function PosPriceRulesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ unit?: string; rule?: string }> }) {
  const { id } = await params;
  const { unit, rule } = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } });
  if (!sys) notFound();
  const m = posMembership(auth.active);
  const units = (await posUnits(tenantId, id)).filter((u) => canAccessUnit(m, u.id)).map((u) => ({ id: u.id, name: u.name }));
  if (units.length === 0) notFound();
  const unitId = units.some((u) => u.id === unit) ? unit! : units[0]!.id;
  const canView = evaluate(m, { module: "pos", action: "pos.product.manage", unitId });
  const canEdit = evaluate(m, { module: "pos", action: "pos.price.rule", unitId });
  const def = systemDef(sys.type);
  const t = await getTranslations("pos.price.rule");
  const tProducts = await getTranslations("pos.products");
  const data = canView ? await loadProductsData({ tenantId, systemId: id }, { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions }, units, { rules: false }) : null;
  const back = (
    <Link href={`/app/sys/${id}/pos/products`} data-testid="pos-price-rules-back" className="btn btn-ghost min-h-11">
      {tProducts("title")}
    </Link>
  );
  return (
    <div className="flex w-full min-w-0 max-w-[1600px] flex-col gap-5">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        desc={t("desc")}
        actions={back}
      />
      <ModuleTabs items={posTabs(id, await getTranslations("pos"))} data-testid="pos-price-rules-module-tabs" />
      {!data ? (
        <div data-testid="pos-price-rules-refusal" className="card text-sm text-[color:var(--color-muted)]">
          {t("refusal")}
        </div>
      ) : (
        <PriceRulesClient key={unitId} systemId={id} unitId={unitId} data={data} canEdit={canEdit} initialRuleId={rule ?? null} />
      )}
    </div>
  );
}
