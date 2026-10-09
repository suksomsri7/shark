import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canAccessUnit } from "@/lib/core/rbac";
import { systemDef } from "@/lib/systems";
import { posTabs } from "@/lib/modules/pos/tabs";
import { posMembership } from "@/lib/modules/pos/access";
import { posUnits } from "@/lib/modules/pos/register";
import { stockCountMeta } from "@/lib/modules/pos/stock-count";
import { STOCK_COUNT_MESSAGES } from "@/lib/modules/pos/stock-count-shared";
import { weighedBarcodeSettings } from "@/lib/modules/pos/scan-shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { StockClient, type StockTab } from "./StockClient";

// POS P1.14 U — หน้าสต็อกของจุดขาย: ตรวจนับ (ภาพ 05ค · มือถือก่อน) + ทางลัดรับของ/โอน/ปรับ + ประวัติ (ภาพ 16 เฉพาะส่วนของ P1.14)
// 🔴 ข้อมูลตั้งต้นอ่านฝั่งเซิร์ฟเวอร์ครั้งเดียว (stockCountMeta — ไม่ใช้ action ตอนโหลดหน้า) · การกระทำทั้งหมดผ่าน stock-count-actions (คำปฏิเสธเป็นข้อมูล)
// 🔴 สิทธิ์จริงตัดสินใน stock-count.ts ต่อคำสั่ง · ไม่มีสิทธิ์ใดเลย/สาขาไม่มีคลัง = การ์ดปฏิเสธ (หน้า 200 · ไม่ throw · ไม่ redirect)
// สถานะอยู่ใน URL: ?tab=count|receive|transfer|adjust|history &unit= (ไม่ส่ง tab = มือถือเปิดตรวจนับ · md+ เปิดรับของเข้า ตามภาพ 16)
const TABS: readonly StockTab[] = ["count", "receive", "transfer", "adjust", "history"];
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function PosStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[]; unit?: string | string[] }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } });
  if (!sys) notFound();
  const m = posMembership(auth.active);
  const units = (await posUnits(tenantId, id)).filter((u) => canAccessUnit(m, u.id)).map((u) => ({ id: u.id, name: u.name }));
  if (units.length === 0) notFound();
  const unitRaw = one(sp.unit);
  const unitId = units.some((u) => u.id === unitRaw) ? unitRaw! : units[0]!.id;
  const tabRaw = one(sp.tab);
  const tab = (TABS as readonly string[]).includes(tabRaw ?? "") ? (tabRaw as StockTab) : null;

  const meta = await stockCountMeta(
    { tenantId, systemId: id, unitId },
    { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
  );
  const def = systemDef(sys.type);
  const t = await getTranslations("pos.stock");
  const locale = await getLocale();

  return (
    <div className="flex w-full min-w-0 max-w-7xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={t("desc")} />
      <ModuleTabs items={posTabs(id, await getTranslations("pos"))} data-testid="pos-stock-module-tabs" />
      {!meta.ok ? (
        <div role="alert" className="card flex max-w-2xl flex-col gap-1 text-sm" data-testid="pos-stock-refusal" data-code={meta.code}>
          <b className="text-[15px]">{t("title")}</b>
          <span className="text-[color:var(--color-muted)]">{STOCK_COUNT_MESSAGES[meta.code][locale.startsWith("en") ? "en" : "th"]}</span>
        </div>
      ) : (
        <StockClient
          systemId={id}
          units={units}
          unitId={unitId}
          meta={meta}
          initialTab={tab}
          me={{ id: auth.user.id, name: auth.user.name ?? null }}
          weighed={weighedBarcodeSettings(sys.settings)}
        />
      )}
    </div>
  );
}
