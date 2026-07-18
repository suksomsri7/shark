import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { assertCan } from "@/lib/core/rbac";
import { systemDef } from "@/lib/systems";
import { closeDaySummary, closeDayBills, bkkToday } from "@/lib/modules/pos/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { MoneyText } from "@/components/ui/MoneyText";
import { ModuleTabs } from "@/components/module-tabs";
import { CloseDayTools } from "./CloseDayTools";

const fmtTime = (d: Date) =>
  new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(d);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// หน้า "ปิดวัน" — สรุปยอดสิ้นวันของระบบ POS (read-only) + export CSV + กระทบยอดเงินสด
export default async function PosCloseDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { id } = await params;
  const { date: dateParam } = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } });
  if (!sys) notFound();
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "pos", action: "pos.sale.create" },
  );
  const def = systemDef(sys.type);

  const today = bkkToday();
  const businessDate = dateParam && isDate(dateParam) ? dateParam : today;
  const [summary, bills] = await Promise.all([
    closeDaySummary({ tenantId, systemId: id }, businessDate),
    closeDayBills({ tenantId, systemId: id }, businessDate),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="ปิดวัน — สรุปยอดสิ้นวัน" />
      <ModuleTabs
        items={[
          { href: `/app/sys/${id}`, label: "ภาพรวม" },
          { href: `/app/sys/${id}/pos/register`, label: "ขาย" },
          { href: `/app/sys/${id}/pos/products`, label: "สินค้า/ราคา" },
          { href: `/app/sys/${id}/pos/sales`, label: "ประวัติบิล" },
          { href: `/app/sys/${id}/pos/close`, label: "ปิดวัน" },
        ]}
      />

      {/* เลือกวัน */}
      <form method="get" className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-[color:var(--color-muted)]">เลือกวัน</span>
          <input type="date" name="date" defaultValue={businessDate} max={today} className="input min-h-[44px]" />
        </label>
        <button type="submit" className="btn btn-ghost min-h-[44px] text-sm">
          ดูสรุป
        </button>
      </form>

      {/* การ์ดยอด */}
      <Section title={`สรุปวันที่ ${businessDate}${businessDate === today ? " (วันนี้)" : ""}`}>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border p-3">
            <div className="text-xs text-[color:var(--color-muted)]">ยอดขายสุทธิ</div>
            <div className="text-lg font-semibold">
              <MoneyText satang={summary.netSalesSatang} decimals />
            </div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-[color:var(--color-muted)]">จำนวนบิล</div>
            <div className="text-lg font-semibold tabular-nums">{summary.billCount}</div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-[color:var(--color-muted)]">บิลยกเลิก</div>
            <div className="text-lg font-semibold tabular-nums">{summary.voidCount}</div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-[color:var(--color-muted)]">ยอดที่ยกเลิก</div>
            <div className="text-lg font-semibold">
              <MoneyText satang={summary.voidTotalSatang} decimals />
            </div>
          </div>
        </div>
      </Section>

      {/* แยกตามวิธีจ่าย */}
      <Section title="แยกตามวิธีจ่าย">
        {summary.byMethod.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีการขายในวันนี้</p>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-[color:var(--color-surface-2)] text-left text-xs text-[color:var(--color-muted)]">
                  <th className="px-3 py-2 font-medium">วิธีจ่าย</th>
                  <th className="px-3 py-2 text-right font-medium">จำนวน</th>
                  <th className="px-3 py-2 text-right font-medium">ยอด</th>
                </tr>
              </thead>
              <tbody>
                {summary.byMethod.map((m) => (
                  <tr key={m.type} className="border-b last:border-0">
                    <td className="px-3 py-2">{m.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.count}</td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText satang={m.amountSatang} decimals />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* กระทบยอดเงินสด + ดาวน์โหลด CSV */}
      <Section title="ปิดวัน / กระทบยอดเงินสด">
        <CloseDayTools systemId={id} businessDate={businessDate} cashInDrawerSatang={summary.cashInDrawerSatang} />
      </Section>

      {/* รายการบิลของวัน */}
      <Section title={`รายการบิล (${bills.length})`}>
        {bills.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีบิลในวันนี้</p>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-[color:var(--color-surface-2)] text-left text-xs text-[color:var(--color-muted)]">
                  <th className="px-3 py-2 font-medium">ใบเสร็จ</th>
                  <th className="px-3 py-2 font-medium">เวลา</th>
                  <th className="px-3 py-2 text-right font-medium">ยอด</th>
                  <th className="px-3 py-2 font-medium">วิธีจ่าย</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b, i) => (
                  <tr key={`${b.receiptNo ?? "x"}-${i}`} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      {b.receiptNo ?? "—"}
                      {b.status === "VOIDED" && (
                        <span className="ml-1 text-xs text-[color:var(--color-danger)]">(ยกเลิก)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{fmtTime(b.createdAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText satang={b.grandTotalSatang} decimals />
                    </td>
                    <td className="px-3 py-2">{b.methodLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
