import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { listProducts, listInventoryItems } from "@/lib/modules/shop/service";
import { createProductAction, toggleProductAction } from "@/lib/modules/shop/actions";

const baht = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 0 });

// จัดการสินค้า (CRUD ย่อ: สร้าง + เปิด/ปิดขาย + ผูกสินค้าคลัง) — /app/u/[unitSlug]/shop
export default async function ShopManagePage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  const [products, invItems] = await Promise.all([listProducts(ctx, {}), listInventoryItems(auth.active.tenantId)]);
  const storeUrl = `/s/${auth.active.tenant.slug}/${unit.slug}/shop`;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-[color:var(--color-muted)]">🛍️ ร้านค้า</div>
          <h1 className="text-2xl font-semibold">{unit.name}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/app/u/${unitSlug}/shop/orders`} className="btn btn-ghost text-sm">
            ออเดอร์
          </Link>
          <Link href={storeUrl} target="_blank" className="btn btn-primary text-sm">
            เปิดหน้าร้าน →
          </Link>
        </div>
      </div>

      {/* เพิ่มสินค้า */}
      <form action={createProductAction.bind(null, unitSlug)} className="card flex flex-col gap-3">
        <h2 className="text-sm font-medium">เพิ่มสินค้า</h2>
        <input name="name" required maxLength={120} placeholder="ชื่อสินค้า" className="rounded-lg border px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <input name="priceBaht" required type="number" min={0} step="0.01" placeholder="ราคา (บาท)" className="w-32 rounded-lg border px-3 py-2 text-sm" />
          <input name="sortOrder" type="number" min={0} placeholder="ลำดับ" className="w-24 rounded-lg border px-3 py-2 text-sm" />
        </div>
        <input name="description" maxLength={500} placeholder="รายละเอียด (ถ้ามี)" className="rounded-lg border px-3 py-2 text-sm" />
        <input name="imageUrl" maxLength={500} placeholder="ลิงก์รูปสินค้า (ถ้ามี)" className="rounded-lg border px-3 py-2 text-sm" />
        {invItems.length > 0 && (
          <select name="invItemId" className="rounded-lg border px-3 py-2 text-sm">
            <option value="">— ไม่ผูกสต็อกคลัง —</option>
            {invItems.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name} ({it.sku})
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-primary text-sm">บันทึกสินค้า</button>
      </form>

      {/* รายการสินค้า */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">สินค้าทั้งหมด ({products.length})</h2>
        {products.length === 0 && <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีสินค้า</p>}
        {products.map((p) => (
          <div key={p.id} className="card flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-medium">
                {p.name} {!p.active && <span className="text-xs text-[color:var(--color-muted)]">(ปิดขาย)</span>}
              </div>
              <div className="text-sm text-[color:var(--color-muted)]">
                ฿{baht(p.priceSatang)}
                {p.invItemId && " · ผูกสต็อกคลัง"}
              </div>
            </div>
            <form action={toggleProductAction.bind(null, unitSlug, p.id, !p.active)}>
              <button className="rounded-full border px-3 py-1 text-xs hover:bg-[color:var(--color-surface-2)]">
                {p.active ? "ปิดขาย" : "เปิดขาย"}
              </button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
