import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { listOptionGroups } from "@/lib/modules/restaurant/menu";
import { baht } from "@/lib/modules/restaurant/scope";
import { createOptionGroupAction, archiveOptionGroupAction, setChoiceStockAction } from "@/lib/actions/restaurant";

export default async function OptionsPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const groups = await listOptionGroups(auth.active.tenantId, unit.id);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">กลุ่มตัวเลือก</h1>
        <Link href={`/app/u/${unitSlug}/restaurant/menu`} className="btn btn-ghost text-sm">
          ← เมนู
        </Link>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">
          ยังไม่มีกลุ่มตัวเลือก เช่น &quot;ขนาด&quot; &quot;ความหวาน&quot; &quot;Topping&quot;
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.id} className="card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="font-medium">
                {g.name}{" "}
                <span className="text-xs text-[color:var(--color-muted)]">
                  (เลือก {g.minSelect}-{g.maxSelect} · ใช้ {g._count.items} เมนู)
                </span>
              </div>
              <form action={archiveOptionGroupAction.bind(null, unitSlug)}>
                <input type="hidden" name="id" value={g.id} />
                <button className="text-xs text-[color:var(--color-danger)] underline">ลบ</button>
              </form>
            </div>
            <div className="flex flex-col gap-1">
              {g.choices.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className={c.isOutOfStock ? "opacity-50" : ""}>
                    {c.name} {c.priceDelta !== 0 ? `(${c.priceDelta > 0 ? "+" : ""}฿${baht(c.priceDelta)})` : ""}
                    {c.isDefault ? " · ค่าเริ่มต้น" : ""}
                  </span>
                  <form action={setChoiceStockAction.bind(null, unitSlug)}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="out" value={c.isOutOfStock ? "false" : "true"} />
                    <button className="text-xs underline text-[color:var(--color-muted)]">
                      {c.isOutOfStock ? "ปลด 86" : "86"}
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* เพิ่มกลุ่ม */}
      <section className="card flex flex-col gap-2">
        <h2 className="text-sm font-medium">เพิ่มกลุ่มตัวเลือก</h2>
        <form action={createOptionGroupAction.bind(null, unitSlug)} className="flex flex-col gap-2">
          <input name="name" placeholder="ชื่อกลุ่ม เช่น ความหวาน" required className="rounded-lg border px-2 py-1.5 text-sm" />
          <div className="flex gap-2">
            <label className="flex items-center gap-1 text-xs">
              เลือกอย่างน้อย
              <input name="minSelect" type="number" min="0" defaultValue={0} className="w-16 rounded-lg border px-2 py-1 text-sm" />
            </label>
            <label className="flex items-center gap-1 text-xs">
              เลือกได้สูงสุด
              <input name="maxSelect" type="number" min="1" defaultValue={1} className="w-16 rounded-lg border px-2 py-1 text-sm" />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[color:var(--color-muted)]">ตัวเลือก (บรรทัดละ 1 · รูปแบบ &quot;ชื่อ|ราคาเพิ่มบาท&quot; เช่น พิเศษ|10)</span>
            <textarea name="choices" rows={3} placeholder={"ธรรมดา|0\nพิเศษ|10"} className="rounded-lg border px-2 py-1.5 font-mono text-xs" />
          </label>
          <button className="btn btn-primary self-start text-sm">เพิ่มกลุ่ม</button>
        </form>
      </section>
    </div>
  );
}
