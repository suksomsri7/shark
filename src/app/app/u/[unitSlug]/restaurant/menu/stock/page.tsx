import { requireUnit } from "@/lib/core/context";
import { listItems } from "@/lib/modules/restaurant/menu";
import { setItemStockAction, resetDailyStockAction } from "@/lib/actions/restaurant";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatBaht } from "@/lib/ui/money";

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
      <PageHeader title="ของหมด และสต็อก" back={{ href: `/app/u/${unitSlug}/restaurant/menu`, label: "เมนู" }} />

      <form action={resetDailyStockAction.bind(null, unitSlug)}>
        <button className="btn btn-ghost text-sm">รีเซ็ตสต็อกรายวัน (เปิดร้านใหม่)</button>
      </form>

      {items.length === 0 ? (
        <EmptyState text="ยังไม่มีเมนู — เพิ่มเมนูก่อนจึงตั้งสต็อกได้" />
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((it) => (
            <div key={it.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm ${it.isOutOfStock ? "opacity-60" : ""}`}>
              <div>
                <span className="font-medium">{it.name}</span>{" "}
                <span className="text-xs text-[color:var(--color-muted)]">
                  {formatBaht(it.basePrice)} · {it.category.name}
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
                    className="w-20 rounded-lg border px-2 py-2 text-right text-sm"
                  />
                  <button className="btn-sm">ตั้งสต็อก</button>
                </form>
                <form action={setItemStockAction.bind(null, unitSlug)}>
                  <input type="hidden" name="id" value={it.id} />
                  <input type="hidden" name="isOutOfStock" value={it.isOutOfStock ? "false" : "true"} />
                  <button className="btn-sm">
                    {it.isOutOfStock ? "ปลดหมด" : "แจ้งหมด"}
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
