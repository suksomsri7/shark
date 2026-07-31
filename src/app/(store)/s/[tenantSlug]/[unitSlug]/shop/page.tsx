import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";
import { resolveUnit, listProducts } from "@/lib/modules/shop/service";
import { getPublicBranding } from "@/lib/branding/service";
import { ShopStorefront } from "@/components/shop-storefront";
import { getLocaleFromCookie, makeT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

// หน้าร้านค้าสาธารณะ (SHOP) — /s/[tenantSlug]/[unitSlug]/shop
export default async function StoreShopPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string }>;
}) {
  const { tenantSlug, unitSlug } = await params;
  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) notFound();
  const [products, branding] = await Promise.all([
    listProducts({ tenantId: resolved.tenant.id, unitId: resolved.unit.id }, { activeOnly: true }),
    getPublicBranding(resolved.tenant.id),
  ]);
  const accentStyle = branding.brandColor
    ? ({ ["--color-accent"]: branding.brandColor } as CSSProperties)
    : undefined;

  const locale = getLocaleFromCookie((await cookies()).get("lang")?.value);
  const t = makeT(locale);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-8" style={accentStyle}>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
        <div className="flex items-center gap-2">
          {branding.logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={branding.logoUrl}
              alt={branding.displayName}
              className="h-8 w-8 rounded object-contain"
            />
          )}
          <div className="text-xs font-semibold tracking-widest text-[color:var(--color-muted)]">
            {branding.displayName}
          </div>
        </div>
        <h1
          className="text-2xl font-semibold"
          style={branding.brandColor ? { color: branding.brandColor } : undefined}
        >
          {resolved.unit.name}
        </h1>
        <p className="text-sm text-[color:var(--color-muted)]">{t("shop.subtitle")}</p>
        </div>
        <LanguageSwitcher locale={locale} />
      </div>
      <ShopStorefront
        tenantSlug={tenantSlug}
        unitSlug={unitSlug}
        locale={locale}
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
