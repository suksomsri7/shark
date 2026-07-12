import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { listCategories, listItems, listStations, listOptionGroups, ensureDefaultStations } from "@/lib/modules/restaurant/menu";
import { baht } from "@/lib/modules/restaurant/scope";
import {
  createCategoryAction,
  createItemAction,
  setItemStockAction,
  duplicateItemAction,
  archiveItemAction,
} from "@/lib/actions/restaurant";

export default async function MenuPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const { tenantId } = auth.active;
  await ensureDefaultStations(tenantId, unit.id);
  const [categories, items, stations, optionGroups] = await Promise.all([
    listCategories(tenantId, unit.id),
    listItems(tenantId, unit.id),
    listStations(tenantId, unit.id),
    listOptionGroups(tenantId, unit.id),
  ]);
  const byCat = new Map<string, typeof items>();
  for (const it of items) {
    const arr = byCat.get(it.categoryId) ?? [];
    arr.push(it);
    byCat.set(it.categoryId, arr);
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm text-[color:var(--color-muted)]">{unit.name}</div>
          <h1 className="text-2xl font-semibold">เมนู</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/app/u/${unitSlug}/restaurant/menu/options`} className="btn btn-ghost text-sm">
            กลุ่มตัวเลือก
          </Link>
          <Link href={`/app/u/${unitSlug}/restaurant/menu/stock`} className="btn btn-ghost text-sm">
            ของหมด (86)
          </Link>
          <Link href={`/app/u/${unitSlug}/restaurant`} className="btn btn-ghost text-sm">
            ← หน้างาน
          </Link>
        </div>
      </div>

      {/* เพิ่มหมวด */}
      <section className="card flex flex-col gap-2">
        <h2 className="text-sm font-medium">เพิ่มหมวด</h2>
        <form action={createCategoryAction.bind(null, unitSlug)} className="flex flex-wrap gap-2">
          <input name="name" placeholder="ชื่อหมวด เช่น อาหารจานเดียว" className="flex-1 rounded-lg border px-2 py-1.5 text-sm" />
          <input name="nameEn" placeholder="EN (ไม่บังคับ)" className="w-32 rounded-lg border px-2 py-1.5 text-sm" />
          <button className="btn btn-ghost text-sm">เพิ่ม</button>
        </form>
      </section>

      {categories.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีหมวด — เพิ่มหมวดก่อนสร้างเมนู</p>
      ) : (
        categories.map((cat) => (
          <section key={cat.id} className="flex flex-col gap-2">
            <h2 className="font-medium">
              {cat.name} <span className="text-xs text-[color:var(--color-muted)]">({cat._count.items})</span>
            </h2>
            {(byCat.get(cat.id) ?? []).map((it) => (
              <div key={it.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 ${it.isOutOfStock ? "opacity-50" : ""}`}>
                <div>
                  <div className="text-sm font-medium">
                    {it.name}
                    {it.isOutOfStock && <span className="ml-2 text-xs text-[color:var(--color-danger)]">หมด (86)</span>}
                    {it.status === "HIDDEN" && <span className="ml-2 text-xs text-[color:var(--color-muted)]">ซ่อน</span>}
                  </div>
                  <div className="text-xs text-[color:var(--color-muted)]">
                    ฿{baht(it.basePrice)} · {it.station.name}
                    {it.stockQty != null ? ` · เหลือ ${it.stockQty}` : ""}
                    {it.optionGroups.length > 0 ? ` · ${it.optionGroups.length} กลุ่มตัวเลือก` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <form action={setItemStockAction.bind(null, unitSlug)}>
                    <input type="hidden" name="id" value={it.id} />
                    <input type="hidden" name="isOutOfStock" value={it.isOutOfStock ? "false" : "true"} />
                    <button className="rounded-lg border px-2 py-1 text-xs hover:bg-[color:var(--color-surface-2)]">
                      {it.isOutOfStock ? "ปลด 86" : "86"}
                    </button>
                  </form>
                  <form action={duplicateItemAction.bind(null, unitSlug)}>
                    <input type="hidden" name="id" value={it.id} />
                    <button className="text-xs text-[color:var(--color-muted)] underline">ทำสำเนา</button>
                  </form>
                  <form action={archiveItemAction.bind(null, unitSlug)}>
                    <input type="hidden" name="id" value={it.id} />
                    <button className="text-xs text-[color:var(--color-danger)] underline">ลบ</button>
                  </form>
                </div>
              </div>
            ))}
          </section>
        ))
      )}

      {/* เพิ่มเมนู */}
      {categories.length > 0 && stations.length > 0 && (
        <section className="card flex flex-col gap-3">
          <h2 className="text-sm font-medium">เพิ่มเมนู</h2>
          <form action={createItemAction.bind(null, unitSlug)} className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <input name="name" placeholder="ชื่อเมนู" required className="flex-1 rounded-lg border px-2 py-1.5 text-sm" />
              <input name="priceBaht" type="number" step="1" min="0" placeholder="ราคา (บาท)" required className="w-28 rounded-lg border px-2 py-1.5 text-sm" />
            </div>
            <div className="flex flex-wrap gap-2">
              <select name="categoryId" className="rounded-lg border px-2 py-1.5 text-sm">
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select name="stationId" className="rounded-lg border px-2 py-1.5 text-sm">
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input name="stockQty" type="number" min="0" placeholder="สต็อกวันนี้ (ไม่บังคับ)" className="w-40 rounded-lg border px-2 py-1.5 text-sm" />
            </div>
            {optionGroups.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-[color:var(--color-muted)]">กลุ่มตัวเลือก (เลือกได้หลายอัน)</span>
                <div className="flex flex-wrap gap-3">
                  {optionGroups.map((g) => (
                    <label key={g.id} className="flex items-center gap-1 text-xs">
                      <input type="checkbox" name="optionGroupIds" value={g.id} />
                      {g.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              {["SPICY", "VEGAN", "RECOMMENDED", "NEW"].map((t) => (
                <label key={t} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" name="tags" value={t} />
                  {t}
                </label>
              ))}
            </div>
            <button className="btn btn-primary self-start text-sm">เพิ่มเมนู</button>
          </form>
        </section>
      )}
    </div>
  );
}
