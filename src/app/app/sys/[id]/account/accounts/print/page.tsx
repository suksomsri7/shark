// WO 6.1 §11.1 — หน้าพิมพ์ผังบัญชี (ปุ่ม "พิมพ์" ของ f8) — ตารางแบนเรียงตามรหัส พร้อมหมวด/หมวดรอง/หมวดย่อย
import Link from "next/link";
import { requireAccountPage } from "@/lib/modules/account/guard";
import { chartTree } from "@/lib/modules/account/coa";
import { flattenChart } from "@/lib/modules/account/coa-v2";
import { formatBaht } from "@/lib/ui/money";
import { formatDateTh } from "@/lib/ui/date";
import { PrintButton } from "@/components/account-v2/PrintButton";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, systemId } = await requireAccountPage(id, "account.chart.manage");
  const base = `/app/sys/${id}/account`;
  const tree = await chartTree({ tenantId, systemId }, {});
  const rows = flattenChart(tree);

  return (
    <div className="flex flex-col gap-4 pb-16">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={`${base}/accounts`} className="text-sm text-[color:var(--color-muted)]">
          ← กลับไปผังบัญชี
        </Link>
        <PrintButton testId="coa-print-now" />
      </div>

      <div>
        <h1 className="text-2xl font-semibold">ผังบัญชี</h1>
        <p className="text-sm text-[color:var(--color-muted)]">
          {tree.grandTotal} บัญชี · ยอดคงเหลือ ณ {formatDateTh(new Date())}
        </p>
      </div>

      <table className="w-full text-sm" data-testid="coa-print-table">
        <thead>
          <tr className="border-b text-left text-xs text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
            <th className="py-2 font-normal">รหัส</th>
            <th className="py-2 font-normal">ชื่อบัญชี</th>
            <th className="py-2 font-normal">หมวด</th>
            <th className="py-2 font-normal">หมวดรอง</th>
            <th className="py-2 font-normal">หมวดย่อย</th>
            <th className="py-2 text-right font-normal">ยอดคงเหลือ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ group, account }) => (
            <tr key={account.id} className="border-b last:border-b-0" style={{ borderColor: "var(--color-line)" }}>
              <td className="whitespace-nowrap py-2">{account.code}</td>
              <td className="py-2">
                {account.name}
                {account.archived && <span className="text-[color:var(--color-muted)]"> · ปิดใช้งาน</span>}
              </td>
              <td className="py-2 text-[color:var(--color-muted)]">{group[0].name}</td>
              <td className="py-2 text-[color:var(--color-muted)]">{group[1].name}</td>
              <td className="py-2 text-[color:var(--color-muted)]">{group[2].name}</td>
              <td className="whitespace-nowrap py-2 text-right">{formatBaht(account.balanceSatang, { decimals: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
