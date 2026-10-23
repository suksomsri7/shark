import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { resolveUnit, resolveTableSession } from "@/lib/modules/restaurant/storefront";
import { orderingMenu, getSetting } from "@/lib/modules/restaurant/menu";
import { kitchenOpenNow } from "@/lib/modules/restaurant/scope";
import { RestaurantQr } from "@/components/restaurant-qr";
import { getLocaleFromCookie, makeT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
// POS P2.7 ▸ มติ 1 CD7: สาขาที่ผูก POS ใช้ประตู POS /q/t/<qrToken> (ไม่เปิด session ผีตอนเปิดหน้า)
import { legacyTableQrRedirect } from "@/lib/modules/pos/qr-order";
import { legacyQrDoor, posLinkedLegacyDoor } from "@/lib/modules/pos/legacy-door"; // P5.2 fix F (F8)
// ◂

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
  // POS P2.7 ▸ มติ 1 CD7: redirect ก่อน resolveTableSession (ประตูเดิมสร้าง session ตอนเปิดหน้า) — ไม่ผูก POS = หน้าเดิมทุกไบต์
  // P5.2 fix F (F8): สาขาที่ผูก POS (write = DB ล้มถือว่าผูก) ⇒ redirect ไปประตู POS เสมอ ไม่ค้นโทเคน (ไม่เป็นตัวทายโทเคน · ไม่ถึง resolveTableSession)
  if (await posLinkedLegacyDoor(tenant.id, unit.id, { write: true })) redirect(legacyQrDoor(qrToken));
  const qrDoor = await legacyTableQrRedirect(tenant.id, unit.id, qrToken);
  if (qrDoor) redirect(qrDoor);
  // ◂

  const sess = await resolveTableSession(tenant.id, unit.id, qrToken);
  const [menu, setting] = await Promise.all([
    orderingMenu(tenant.id, unit.id, { forPublic: true }),
    getSetting(tenant.id, unit.id),
  ]);
  const kitchen = kitchenOpenNow(setting);

  const locale = getLocaleFromCookie((await cookies()).get("lang")?.value);
  const t = makeT(locale);

  if (!sess.ok) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">{unit.name}</div>
        <p className="mt-2 text-sm text-[color:var(--color-danger)]">{sess.reason || t("err.notFound")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold tracking-widest text-[color:var(--color-muted)]">{unit.name}</span>
        <LanguageSwitcher locale={locale} />
      </div>
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
