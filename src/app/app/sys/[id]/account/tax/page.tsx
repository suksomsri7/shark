import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { baht } from "@/lib/modules/account/service";
import { pnd, listWhtCredits } from "@/lib/modules/account/wht";

const fmtDate = (d: Date) => d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
const pct = (bp: number | null) => (bp != null ? `${(bp / 100).toFixed(bp % 100 ? 2 : 0)}%` : "—");

function defaultPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function TaxPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string; type?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const period = sp.period || defaultPeriod();
  const type = sp.type === "3" ? 3 : sp.type === "53" ? 53 : 53;
  const year = period.slice(0, 4);
  const { tenantId, systemId } = await loadAccountSystem(id);
  const base = `/app/sys/${id}/account`;

  const [report, creditYear] = await Promise.all([
    pnd(tenantId, systemId, { type, period }),
    listWhtCredits(tenantId, systemId, { year }),
  ]);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <Link href={`${base}/wht`} className="text-sm text-[color:var(--color-muted)]">← WHT</Link>
        <h1 className="mt-1 text-2xl font-semibold">ภาษี — ภ.ง.ด.3 / 53 · เครดิตภาษีถูกหัก</h1>
      </div>

      {/* ตัวกรอง */}
      <form className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col">
          <span className="text-xs text-[color:var(--color-muted)]">แบบ</span>
          <select name="type" defaultValue={String(type)} className="rounded-lg border px-2 py-1.5">
            <option value="3">ภ.ง.ด.3 (บุคคลธรรมดา)</option>
            <option value="53">ภ.ง.ด.53 (นิติบุคคล)</option>
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-[color:var(--color-muted)]">งวด</span>
          <input name="period" type="month" defaultValue={period} className="rounded-lg border px-2 py-1.5" />
        </label>
        <button className="btn btn-primary text-sm">ดู</button>
        <a href={`${base}/tax/export?type=${type}&period=${period}`} className="btn btn-ghost text-sm">Export CSV</a>
      </form>

      {/* สรุปตามประเภทเงินได้ */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">ภ.ง.ด.{type} — งวด {period} · สรุปตามประเภทเงินได้</h2>
        {report.byIncomeType.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ไม่มี 50 ทวิ ในงวดนี้</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-y text-[color:var(--color-muted)]">
                <th className="py-1.5 text-left">ประเภทเงินได้</th>
                <th className="py-1.5 text-right">ราย</th>
                <th className="py-1.5 text-right">ฐานเงินได้</th>
                <th className="py-1.5 text-right">ภาษีที่หัก</th>
              </tr>
            </thead>
            <tbody>
              {report.byIncomeType.map((b) => (
                <tr key={b.incomeType} className="border-b">
                  <td className="py-1.5">{b.label}</td>
                  <td className="py-1.5 text-right">{b.count}</td>
                  <td className="py-1.5 text-right">{baht(b.base)}</td>
                  <td className="py-1.5 text-right font-medium">{baht(b.wht)}</td>
                </tr>
              ))}
              <tr className="border-b font-semibold">
                <td className="py-1.5">รวม</td>
                <td className="py-1.5 text-right">{report.rows.length}</td>
                <td className="py-1.5 text-right">{baht(report.grandBase)}</td>
                <td className="py-1.5 text-right">{baht(report.grandWht)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* รายตัว 50 ทวิ */}
      {report.rows.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">รายการ 50 ทวิ (รายใบ)</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-y text-[color:var(--color-muted)]">
                  <th className="py-1.5 text-left">#</th>
                  <th className="py-1.5 text-left">เลขที่</th>
                  <th className="py-1.5 text-left">ผู้รับเงิน</th>
                  <th className="py-1.5 text-left">เลขภาษี</th>
                  <th className="py-1.5 text-left">ประเภท</th>
                  <th className="py-1.5 text-right">ฐาน</th>
                  <th className="py-1.5 text-right">อัตรา</th>
                  <th className="py-1.5 text-right">ภาษี</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.certId} className="border-b">
                    <td className="py-1.5">{r.seq}</td>
                    <td className="py-1.5"><Link href={`${base}/wht/${r.certId}/print`} className="underline">{r.certNo}</Link></td>
                    <td className="py-1.5">{r.recipientName}</td>
                    <td className="py-1.5">{r.recipientTaxId ?? "—"}</td>
                    <td className="py-1.5">{r.incomeLabel}</td>
                    <td className="py-1.5 text-right">{baht(r.base)}</td>
                    <td className="py-1.5 text-right">{pct(r.whtRateBp)}</td>
                    <td className="py-1.5 text-right font-medium">{baht(r.whtAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* เครดิตภาษีถูกหัก สะสมทั้งปี */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <h2 className="font-medium">เครดิตภาษีถูกหัก (สะสม 1160) — ปี {year}</h2>
          <span className="text-[color:var(--color-muted)]">รวม {baht(creditYear.totalWht)} ฿</span>
        </div>
        {creditYear.rows.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ไม่มีรายการถูกหักในปีนี้</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-y text-[color:var(--color-muted)]">
                  <th className="py-1.5 text-left">วันที่</th>
                  <th className="py-1.5 text-left">เอกสาร</th>
                  <th className="py-1.5 text-left">ผู้หัก</th>
                  <th className="py-1.5 text-right">ภาษีถูกหัก</th>
                  <th className="py-1.5 text-center">สำเนา</th>
                </tr>
              </thead>
              <tbody>
                {creditYear.rows.map((r) => (
                  <tr key={r.paymentId} className="border-b">
                    <td className="py-1.5">{fmtDate(r.paidAt)}</td>
                    <td className="py-1.5">{r.docNo ?? "—"}</td>
                    <td className="py-1.5">{r.contactName}</td>
                    <td className="py-1.5 text-right font-medium">{baht(r.whtAmount)}</td>
                    <td className="py-1.5 text-center">{r.hasCertCopy ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
