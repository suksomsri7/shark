import { prisma } from "@/lib/core/db";
import { listCoupons } from "./service";
import { toggleCouponAction } from "./actions";
import { CreateCouponForm, CouponTester } from "./forms";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { StatusChip } from "@/components/ui/StatusChip";
import { COUPON_STATUS_LABEL } from "@/lib/ui/status-labels";
import { formatBaht } from "@/lib/ui/money";

const baht = (s: number) => formatBaht(s);
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
    <Section title={`คูปอง (${coupons.length})`}>
      <DataList
        items={coupons.map((c) => {
          const value =
            c.type === "PERCENT"
              ? `ลด ${c.percent ?? 0}%${c.maxDiscountSatang != null ? ` (สูงสุด ${baht(c.maxDiscountSatang)})` : ""}`
              : `ลด ${baht(c.valueSatang ?? 0)}`;
          const conds: string[] = [];
          if (c.minSpendSatang != null) conds.push(`ขั้นต่ำ ${baht(c.minSpendSatang)}`);
          if (c.usageLimit != null) conds.push(`ใช้ ${c.usedCount}/${c.usageLimit}`);
          else conds.push(`ใช้แล้ว ${c.usedCount}`);
          if (c.perMemberLimit != null) conds.push(`${c.perMemberLimit}/คน`);
          if (c.endAt) conds.push(`ถึง ${fmt(c.endAt)}`);
          const unitLabel =
            c.applicableUnitIds.length === 0
              ? "ทุกหน่วย"
              : c.applicableUnitIds.map((id) => unitName.get(id) ?? id).join(", ");

          return {
            key: c.id,
            primary: (
              <span className="flex items-center gap-2">
                <span className="rounded bg-[color:var(--color-surface-2)] px-1.5 py-0.5 font-mono text-xs">
                  {c.code}
                </span>
                <span className="font-medium">{c.name}</span>
                <StatusChip
                  value={c.active ? "ACTIVE" : "INACTIVE"}
                  map={COUPON_STATUS_LABEL}
                  tone={c.active ? "strong" : "muted"}
                />
              </span>
            ),
            secondary: (
              <span className="flex flex-col gap-0.5">
                <span>
                  {value} · {conds.join(" · ")}
                </span>
                <span>ใช้ได้: {unitLabel}</span>
              </span>
            ),
            trailing: c.active ? (
              <ConfirmDialog
                triggerLabel="ปิด"
                triggerClassName="text-xs underline"
                title="ปิดใช้งานคูปองนี้?"
                detail="ลูกค้าจะใช้คูปองนี้ไม่ได้ จนกว่าจะเปิดใช้งานอีกครั้ง"
                confirmLabel="ยืนยันปิด"
                action={toggleCouponAction}
                fields={{ couponId: c.id, systemId }}
              />
            ) : (
              <form action={toggleCouponAction}>
                <input type="hidden" name="couponId" value={c.id} />
                <input type="hidden" name="systemId" value={systemId} />
                <button className="text-xs underline">เปิด</button>
              </form>
            ),
          };
        })}
        empty="ยังไม่มีคูปอง — สร้างโค้ดส่วนลดด้านล่างเพื่อแจกให้ลูกค้า"
      />

      <CreateCouponForm systemId={systemId} units={units} />
      <CouponTester systemId={systemId} units={units} />
    </Section>
  );
}
