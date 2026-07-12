import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { listItems } from "@/lib/modules/restaurant/menu";
import { baht } from "@/lib/modules/restaurant/scope";
import { setItemStockAction, resetDailyStockAction } from "@/lib/actions/restaurant";

export default async function StockPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const items = await listItems(auth.active.tenantId, unit.id);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">ของหมด (86) & สต็อก</h1>
        <Link href={`/app/u/${unitSlug}/restaurant/menu`} className="btn btn-ghost text-sm">
          ← เมนู
        </Link>
      </div>

      <form action={resetDailyStockAction.bind(null, unitSlug)}>
        <button className="btn btn-ghost text-sm">รีเซ็ตสต็อกรายวัน (เปิดร้านใหม่)</button>
      </form>

      {items.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีเมนู</p>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((it) => (
            <div key={it.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm ${it.isOutOfStock ? "opacity-60" : ""}`}>
              <div>
                <span className="font-medium">{it.name}</span>{" "}
                <span className="text-xs text-[color:var(--color-muted)]">
                  ฿{baht(it.basePrice)} · {it.category.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <form action={setItemStockAction.bind(null, unitSlug)} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={it.id} />
                  <input
                    name="stockQty"
                    type="number"
                    min="0"
                    defaultValue={it.stockQty ?? ""}
                    placeholder="—"
                    className="w-20 rounded-lg border px-2 py-1 text-right text-xs"
                  />
                  <button className="rounded-lg border px-2 py-1 text-xs hover:bg-[color:var(--color-surface-2)]">ตั้งสต็อก</button>
                </form>
                <form action={setItemStockAction.bind(null, unitSlug)}>
                  <input type="hidden" name="id" value={it.id} />
                  <input type="hidden" name="isOutOfStock" value={it.isOutOfStock ? "false" : "true"} />
                  <button className="rounded-lg border px-2 py-1 text-xs hover:bg-[color:var(--color-surface-2)]">
                    {it.isOutOfStock ? "ปลด 86" : "86"}
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
