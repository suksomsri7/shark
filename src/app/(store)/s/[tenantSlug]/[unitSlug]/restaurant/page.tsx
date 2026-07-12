import { notFound } from "next/navigation";
import { resolveUnit, publicMenu } from "@/lib/modules/restaurant/storefront";

const baht = (s: number) => (s / 100).toLocaleString("th-TH");

// เมนูออนไลน์สาธารณะ (SSR) — /s/[tenantSlug]/[unitSlug]/restaurant
export default async function StoreRestaurantMenuPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string }>;
}) {
  const { tenantSlug, unitSlug } = await params;
  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) notFound();
  const menu = await publicMenu(resolved.tenant.id, resolved.unit.id);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-8">
      <div className="mb-4">
        <div className="text-xs font-semibold tracking-widest text-[color:var(--color-muted)]">{resolved.tenant.name}</div>
        <h1 className="text-2xl font-semibold">{resolved.unit.name}</h1>
        <p className={`text-sm ${menu.kitchen.open ? "text-[color:var(--color-muted)]" : "text-[color:var(--color-danger)]"}`}>
          {menu.kitchen.open ? "เปิดรับออเดอร์" : menu.kitchen.reason || "ครัวปิด"}
        </p>
      </div>

      {menu.categories.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีเมนู</p>
      ) : (
        <div className="flex flex-col gap-6">
          {menu.categories.map((cat) => (
            <div key={cat.id}>
              <div className="mb-2 font-medium">{cat.name}</div>
              <div className="flex flex-col gap-2">
                {cat.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between border-b pb-2">
                    <div>
                      <div className="text-sm font-medium">{it.name}</div>
                      {it.description && <div className="text-xs text-[color:var(--color-muted)]">{it.description}</div>}
                    </div>
                    <div className="text-sm">฿{baht(it.basePrice)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-8 text-center text-xs text-[color:var(--color-muted)]">สแกน QR ที่โต๊ะเพื่อสั่งอาหาร</p>
    </main>
  );
}
