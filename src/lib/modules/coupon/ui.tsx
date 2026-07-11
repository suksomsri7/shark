import { prisma } from "@/lib/core/db";
import { listCoupons } from "./service";
import { toggleCouponAction } from "./actions";
import { CreateCouponForm, CouponTester } from "./forms";

const baht = (s: number) => (s / 100).toLocaleString("th-TH");
const fmt = (d: Date) =>
  d.toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });

// เนื้อหาระบบคูปอง — list + สร้าง + เปิด/ปิด + เลือกหน่วย + ทดลองเช็คส่วนลด
export async function CouponContent({
  systemId,
  tenantId,
}: {
  systemId: string;
  tenantId: string;
}) {
  const [coupons, units] = await Promise.all([
    listCoupons(tenantId, systemId),
    prisma.businessUnit.findMany({
      where: { tenantId, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const unitName = new Map(units.map((u) => [u.id, u.name]));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">คูปอง ({coupons.length})</h2>

      {coupons.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">
          ยังไม่มีคูปอง — สร้างโค้ดส่วนลดด้านล่างเพื่อแจกให้ลูกค้า
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {coupons.map((c) => {
            const value =
              c.type === "PERCENT"
                ? `ลด ${c.percent ?? 0}%${c.maxDiscountSatang != null ? ` (สูงสุด ฿${baht(c.maxDiscountSatang)})` : ""}`
                : `ลด ฿${baht(c.valueSatang ?? 0)}`;
            const conds: string[] = [];
            if (c.minSpendSatang != null) conds.push(`ขั้นต่ำ ฿${baht(c.minSpendSatang)}`);
            if (c.usageLimit != null) conds.push(`ใช้ ${c.usedCount}/${c.usageLimit}`);
            else conds.push(`ใช้แล้ว ${c.usedCount}`);
            if (c.perMemberLimit != null) conds.push(`${c.perMemberLimit}/คน`);
            if (c.endAt) conds.push(`ถึง ${fmt(c.endAt)}`);
            const unitLabel =
              c.applicableUnitIds.length === 0
                ? "ทุกหน่วย"
                : c.applicableUnitIds.map((id) => unitName.get(id) ?? id).join(", ");

            return (
              <div key={c.id} className="flex items-start justify-between gap-2 rounded-lg border px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="rounded bg-[color:var(--color-surface-2)] px-1.5 py-0.5 font-mono text-xs">
                      {c.code}
                    </span>
                    <span className="font-medium">{c.name}</span>
                    {!c.active && (
                      <span className="text-xs text-[color:var(--color-muted)]">(ปิดอยู่)</span>
                    )}
                  </div>
                  <div className="text-xs text-[color:var(--color-muted)]">
                    {value} · {conds.join(" · ")}
                  </div>
                  <div className="text-xs text-[color:var(--color-muted)]">ใช้ได้: {unitLabel}</div>
                </div>
                <form action={toggleCouponAction}>
                  <input type="hidden" name="couponId" value={c.id} />
                  <input type="hidden" name="systemId" value={systemId} />
                  <button className="text-xs underline">{c.active ? "ปิด" : "เปิด"}</button>
                </form>
              </div>
            );
          })}
        </div>
      )}

      <CreateCouponForm systemId={systemId} units={units} />
      <CouponTester systemId={systemId} units={units} />
    </section>
  );
}
