import { notFound } from "next/navigation";
import { resolveUnit, listProducts } from "@/lib/modules/shop/service";
import { ShopStorefront } from "@/components/shop-storefront";

// หน้าร้านค้าสาธารณะ (SHOP) — /s/[tenantSlug]/[unitSlug]/shop
export default async function StoreShopPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string }>;
}) {
  const { tenantSlug, unitSlug } = await params;
  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) notFound();
  const products = await listProducts({ tenantId: resolved.tenant.id, unitId: resolved.unit.id }, { activeOnly: true });

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-8">
      <div className="mb-6">
        <div className="text-xs font-semibold tracking-widest text-[color:var(--color-muted)]">
          {resolved.tenant.name}
        </div>
        <h1 className="text-2xl font-semibold">{resolved.unit.name}</h1>
        <p className="text-sm text-[color:var(--color-muted)]">เลือกสินค้าแล้วสั่งซื้อ ชำระด้วย PromptPay</p>
      </div>
      <ShopStorefront
        tenantSlug={tenantSlug}
        unitSlug={unitSlug}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          priceSatang: p.priceSatang,
          imageUrl: p.imageUrl,
        }))}
      />
    </main>
  );
}
