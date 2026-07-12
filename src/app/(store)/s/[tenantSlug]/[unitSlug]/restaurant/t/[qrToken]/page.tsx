import { notFound } from "next/navigation";
import { resolveUnit, resolveTableSession } from "@/lib/modules/restaurant/storefront";
import { orderingMenu, getSetting } from "@/lib/modules/restaurant/menu";
import { kitchenOpenNow } from "@/lib/modules/restaurant/scope";
import { RestaurantQr } from "@/components/restaurant-qr";

// QR โต๊ะ — เมนู + สั่ง (public, ไม่ต้อง login)
export default async function StoreQrPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string; qrToken: string }>;
}) {
  const { tenantSlug, unitSlug, qrToken } = await params;
  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) notFound();
  const { tenant, unit } = resolved;

  const sess = await resolveTableSession(tenant.id, unit.id, qrToken);
  const [menu, setting] = await Promise.all([
    orderingMenu(tenant.id, unit.id, { forPublic: true }),
    getSetting(tenant.id, unit.id),
  ]);
  const kitchen = kitchenOpenNow(setting);

  if (!sess.ok) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">{unit.name}</div>
        <p className="mt-2 text-sm text-[color:var(--color-danger)]">{sess.reason}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-6">
      <div className="mb-2 text-xs font-semibold tracking-widest text-[color:var(--color-muted)]">{unit.name}</div>
      <RestaurantQr
        tenantSlug={tenantSlug}
        unitSlug={unitSlug}
        qrToken={qrToken}
        tableName={sess.tableName}
        menu={menu}
        kitchen={kitchen}
      />
    </main>
  );
}
