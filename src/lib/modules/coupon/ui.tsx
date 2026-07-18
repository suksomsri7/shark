import Link from "next/link";
import { prisma } from "@/lib/core/db";
import { listCoupons } from "./service";
import { toggleCouponAction } from "./actions";
import { CreateCouponForm, CouponTester } from "./forms";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { ModuleTabs } from "@/components/module-tabs";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { StatusChip } from "@/components/ui/StatusChip";
import { COUPON_STATUS_LABEL } from "@/lib/ui/status-labels";
import { formatBaht } from "@/lib/ui/money";

const muted = "text-[color:var(--color-muted)]";

const fmt = (d: Date) =>
  d.toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });

// แท็บฟังก์ชันย่อยของระบบคูปอง (ใช้ทั้งหน้า hub + ทุกหน้าย่อย ให้ตรงกันเสมอ)
// ⚠️ ต้องตรงกับ childrenFor("COUPON") ใน src/app/app/layout.tsx (ตรวจโดย qc-nav-functions.mts)
// หมายเหตุ: ระบบคูปองมีฟังก์ชันจริงเดียว (คูปอง = รายการ + สร้าง + ทดลอง) — ไม่ฝืนแตกเกินจริง
export function couponTabs(systemId: string): { href: string; label: string }[] {
  const s = `/app/sys/${systemId}`;
  return [
    { href: s, label: "ภาพรวม" },
    { href: `${s}/coupon/list`, label: "คูปอง" },
  ];
}

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
              ? `ลด ${c.percent ?? 0}%${c.maxDiscountSatang != null ? ` (สูงสุด ${formatBaht(c.maxDiscountSatang)})` : ""}`
              : `ลด ${formatBaht(c.valueSatang ?? 0)}`;
          const conds: string[] = [];
          if (c.minSpendSatang != null) conds.push(`ขั้นต่ำ ${formatBaht(c.minSpendSatang)}`);
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

// ───────────── CouponHub (หน้าภาพรวม ฝังใน /app/sys/[id]) ─────────────
// การ์ดสรุปสั้น + ลิงก์เข้าฟังก์ชันคูปอง (ระบบมีฟังก์ชันเดียว → hub + 1 หน้าย่อย)
export async function CouponHub({
  systemId,
  tenantId,
}: {
  systemId: string;
  tenantId: string;
}) {
  const coupons = await listCoupons(tenantId, systemId);
  const activeCount = coupons.filter((c) => c.active).length;

  const cards = [
    {
      href: `/app/sys/${systemId}/coupon/list`,
      label: "คูปอง",
      value: `${coupons.length} รายการ`,
      desc: `เปิดใช้ ${activeCount} · สร้างโค้ดส่วนลด + ทดลองเช็ค`,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ModuleTabs items={couponTabs(systemId)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card flex min-h-[76px] flex-col gap-1 p-4 transition-colors hover:bg-[color:var(--color-surface-2)]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{c.label}</span>
              {c.value && <span className="text-sm tabular-nums text-[color:var(--color-accent)]">{c.value}</span>}
            </div>
            <span className={`text-xs ${muted}`}>{c.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
