import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { listPosProducts, posUnits, posServices, posPriceUnitIds } from "@/lib/modules/pos/register";
import { setItemSalePriceAction } from "@/lib/actions/pos";
import { posTabs } from "@/lib/modules/pos/tabs";
import { posMembership, posCanSetTenantPrice } from "@/lib/modules/pos/access";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { EmptyState } from "@/components/ui/EmptyState";
import { MoneyText } from "@/components/ui/MoneyText";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ModuleTabs } from "@/components/module-tabs";
import { getTranslations } from "next-intl/server";
// POS P2.2U ▸ จอ 06 (มติ 1–3): ตาราง + ลิ้นชักราคาตามช่องทาง (ข้อมูลทุกสาขาโหลดฝั่งเซิร์ฟเวอร์ · ตัวเลือกสาขาอยู่ฝั่ง client) ◂
import { loadProductsData } from "./products-data";
import { ProductsClient } from "./ProductsClient";

// หน้า "สินค้า/ราคา" ของ POS — ตั้งราคาขายต่อสินค้าในคลังที่ผูกระบบขาย
// ราคาขายเก็บที่ AccountProduct.salePrice (master data) → register อ่านผ่าน posCatalog
// POS P1.18U ▸ มติ 9: ข้อความทั้งหมดผ่าน t (pos.stock.productsPage.*) · แท็บโมดูลตามภาษาจอ (posTabs(id, t)) ◂
// POS P2.2U ▸ มติ 1 (Q1 แบบย่อ): บนสุด = จอ 06 "สินค้าและเมนู" (ProductsClient — ราคาขาย/แพลตฟอร์ม · ชิปช่องทาง · ลิ้นชัก "ราคาตามช่องทาง" ·
//   "+X% ทั้งช่องทาง" · ลิงก์โปรราคา) · บริการ + ราคาขายในคลังเดิม (setItemSalePriceAction) ย้ายลงกล่องพับ "ราคาขายปกติ (คลังสินค้า)" — พฤติกรรมเดิมครบ
//   ?unit=<สาขา> = ตัวเลือกสาขาเริ่มต้น (ไม่มี = ทุกสาขา) ◂
export default async function PosProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; ok?: string; unit?: string }>;
}) {
  const { id } = await params;
  const { err, ok, unit } = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } });
  if (!sys) notFound();
  // HF-POS-PAGES: ราคาขายใช้ทั้งร้าน ⇒ ต้องเข้าได้ทุกสาขา (เดิม assertCan ไม่ส่ง unit ⇒ คนสาขาเดียวก็เข้าได้)
  // POS HF-P1CLOSE ▸ O13: เข้าสาขา POS ไม่ได้เลย = 404 (แบบหน้าสต็อก/รายงาน) · เข้าได้แต่ตั้งราคาทั้งร้านไม่ได้ = การ์ดปฏิเสธ (หน้า 200)
  //   การ์ดคืนก่อนอ่านข้อมูลสินค้า/บริการใด ๆ (listPosProducts/posServices) ⇒ ไม่รั่วข้อมูล ◂
  const m = posMembership(auth.active);
  if (!(await posUnits(tenantId, id)).some((u) => canAccessUnit(m, u.id))) notFound();
  const canPrice = posCanSetTenantPrice(m, await posPriceUnitIds(tenantId, id));
  const def = systemDef(sys.type);
  const tStock = await getTranslations("pos.stock");
  const t = await getTranslations("pos.stock.productsPage");
  const tPos = await getTranslations("pos");

  const tabs = posTabs(id, tPos);
  // หัวหน้า + แท็บโมดูล ชุดเดียวของทั้งสองทาง (การ์ดปฏิเสธ / หน้าปกติ)
  const head = (actions?: ReactNode) => (
    <>
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={t("desc")} actions={actions} />
      <ModuleTabs items={tabs} />
    </>
  );
  if (!canPrice)
    return (
      <div className="flex max-w-2xl flex-col gap-5">
        {head()}
        <div role="alert" className="card flex max-w-2xl flex-col gap-1 text-sm" data-testid="pos-products-refusal">
          <b className="text-[15px]">{tPos("nav.products")}</b>
          <span className="text-[color:var(--color-muted)]">{t("permissionDenied")}</span>
        </div>
      </div>
    );
  // POS P1.14 U ▸ ทางเข้าหน้าสต็อก (ตรวจนับ · รับ/โอน/ปรับ) ◂
  const stockLink = (
    <Link href={`/app/sys/${id}/pos/stock`} className="btn btn-ghost min-h-11" data-testid="pos-products-stock-link">
      {tStock("productsLink")}
    </Link>
  );

  // POS P2.2U ▸ ข้อมูลจอ 06: ทุกสาขาที่ผูก POS นี้ (ถึงตรงนี้ = ตั้งราคาได้ทุกสาขาแล้ว — การ์ดปฏิเสธของ HF-P1CLOSE คืนก่อน) ◂
  const units = (await posUnits(tenantId, id)).map((u) => ({ id: u.id, name: u.name }));
  const tProducts = await getTranslations("pos.products");
  const productsData = await loadProductsData({ tenantId, systemId: id }, { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions }, units);
  const canEditPrices = evaluate(m, { module: "pos", action: "pos.product.setPrice" });

  const { inventorySystemId, accountSystemId, items } = await listPosProducts(tenantId, id);
  // บริการมาจากแคตตาล็อกกลาง (ต้นฉบับเดียวกับหน้าจอง) — หน้านี้อ่านอย่างเดียว
  const services = await posServices(tenantId, inventorySystemId);

  return (
    <div className="flex w-full min-w-0 max-w-[1600px] flex-col gap-5">
      {head(stockLink)}

      <ProductsClient systemId={id} data={productsData} canEdit={canEditPrices} initialUnit={unit ?? null} />

      {/* POS P2.2U ▸ หน้าเดิม (บริการ + ราคาขายในคลัง) — พับไว้ · เปิดเองเมื่อมีผลจากฟอร์มเดิม (?err / ?ok) ◂ */}
      <details data-testid="pos-products-legacy" open={!!(err || ok)} className="max-w-2xl">
        <summary data-testid="pos-products-legacy-toggle" className="flex min-h-11 cursor-pointer items-center text-[14px] font-semibold">
          {tProducts("legacyTitle")}
        </summary>
        <div className="mt-3 flex flex-col gap-5">
      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}
      {ok && <p className="text-sm text-[color:var(--color-success)]">{ok}</p>}

      {/* ── บริการ ── อ่านอย่างเดียว: ต้นฉบับอยู่ระบบสินค้า/บริการ (เจ้าของสั่งข้อ 14-15) */}
      <Section title={t("servicesTitle")}>
        <p className="mb-2 text-xs text-[color:var(--color-muted)]">
          {t.rich("servicesIntro", { b: (c) => <b>{c}</b> })}
          {" · "}
          {t("servicesNoStock")}
        </p>
        {!inventorySystemId ? (
          <EmptyState
            text={t("servicesNoInventory")}
            action={{ href: `/app/sys/${id}`, label: t("servicesConnect") }}
          />
        ) : services.length === 0 ? (
          <EmptyState
            text={t("servicesEmpty")}
            action={{ href: `/app/sys/${inventorySystemId}/inventory/services`, label: t("servicesAdd") }}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {services.map((sv) => (
              <div key={sv.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{sv.name}</span>
                  <span className="block truncate text-xs text-[color:var(--color-muted)]">
                    {sv.bookable ? (sv.durationMin ? t("serviceBookableMin", { min: sv.durationMin }) : t("serviceBookable")) : t("serviceWalkInOnly")}
                  </span>
                </span>
                <MoneyText satang={sv.priceSatang} />
              </div>
            ))}
            <Link href={`/app/sys/${inventorySystemId}/inventory/services`} className="text-xs underline">
              {t("servicesEditLink")}
            </Link>
          </div>
        )}
      </Section>

      {!inventorySystemId ? (
        <EmptyState
          text={t("itemsNoInventory")}
          action={{ href: `/app/sys/${id}`, label: t("itemsConnect") }}
        />
      ) : items.length === 0 ? (
        <EmptyState
          text={t("itemsEmpty")}
          action={{ href: `/app/sys/${inventorySystemId}`, label: t("itemsAdd") }}
        />
      ) : (
        <>
          {!accountSystemId && (
            <p className="rounded-xl border border-dashed p-2.5 text-xs text-[color:var(--color-muted)]">
              {t("needAccount")}{" "}
              <Link href="/app/settings/systems" className="text-[color:var(--color-accent)] underline">
                {t("needAccountLink")}
              </Link>
            </p>
          )}
          <Section>
            <p className="mb-2 text-xs text-[color:var(--color-muted)]">
              {t("priceIntro")}
            </p>
            <div className="flex flex-col gap-2">
              {items.map((it) => (
                <form
                  key={it.id}
                  action={setItemSalePriceAction}
                  className="flex flex-wrap items-end gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <input type="hidden" name="systemId" value={id} />
                  <input type="hidden" name="itemId" value={it.id} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{it.name}</span>
                    <span className="text-xs text-[color:var(--color-muted)]">
                      {t("itemMeta", { sku: it.sku, unit: it.unitLabel })} <MoneyText satang={it.costSatang} />
                      {it.salePriceSatang == null && ` · ${t("noSalePrice")}`}
                    </span>
                  </div>
                  <label className="flex flex-col text-xs text-[color:var(--color-muted)]">
                    {t("salePrice")}
                    <input
                      name="salePrice"
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      defaultValue={it.salePriceSatang != null ? String(it.salePriceSatang / 100) : ""}
                      placeholder="0.00"
                      className="input w-28"
                    />
                  </label>
                  <SubmitButton variant="ghost">{t("save")}</SubmitButton>
                </form>
              ))}
            </div>
          </Section>
        </>
      )}
        </div>
      </details>
    </div>
  );
}
