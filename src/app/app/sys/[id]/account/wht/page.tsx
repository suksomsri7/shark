import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { baht } from "@/lib/modules/account/service";
import { listWhtCredits, listWhtDeductions, WHT_INCOME_LABEL } from "@/lib/modules/account/wht";
import { issueWhtCertAction } from "./actions";

const inputCls = "rounded-lg border px-2 py-1 text-xs";
const fmtDate = (d: Date) => d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
const pct = (bp: number | null) => (bp != null ? `${(bp / 100).toFixed(bp % 100 ? 2 : 0)}%` : "—");

const INCOME_TYPES = Object.entries(WHT_INCOME_LABEL) as [keyof typeof WHT_INCOME_LABEL, string][];

function defaultPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function WhtPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string; err?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { period: periodQ, err, tab } = await searchParams;
  const period = periodQ || defaultPeriod();
  const { tenantId, systemId } = await loadAccountSystem(id);
  const base = `/app/sys/${id}/account`;

  const [credits, deductions] = await Promise.all([
    listWhtCredits(tenantId, systemId, { period }),
    listWhtDeductions(tenantId, systemId, { period }),
  ]);
  const view = tab === "credit" ? "credit" : "deduct";

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <Link href={base} className="text-sm text-[color:var(--color-muted)]">← ระบบบัญชี</Link>
        <h1 className="mt-1 text-2xl font-semibold">ภาษีหัก ณ ที่จ่าย (WHT)</h1>
      </div>

      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}

      {/* งวด + ลิงก์ ภ.ง.ด. */}
      <form className="flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="tab" value={view} />
        <label className="flex flex-col">
          <span className="text-xs text-[color:var(--color-muted)]">งวด (เดือน)</span>
          <input name="period" type="month" defaultValue={period} className="rounded-lg border px-2 py-1.5" />
        </label>
        <button className="btn btn-primary text-sm">ดู</button>
        <Link href={`${base}/tax?period=${period}`} className="btn btn-ghost text-sm">ภ.ง.ด.3/53 ›</Link>
      </form>

      {/* แท็บ */}
      <div className="flex gap-2 text-sm">
        <Link
          href={`${base}/wht?tab=deduct&period=${period}`}
          className={`rounded-lg px-3 py-1.5 ${view === "deduct" ? "bg-black text-white" : "border"}`}
        >
          เราหัก vendor (ออก 50 ทวิ)
        </Link>
        <Link
          href={`${base}/wht?tab=credit&period=${period}`}
          className={`rounded-lg px-3 py-1.5 ${view === "credit" ? "bg-black text-white" : "border"}`}
        >
          ถูกหัก (เครดิตภาษี)
        </Link>
      </div>

      {view === "deduct" ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <h2 className="font-medium">ภาษีที่เราหัก vendor</h2>
            <span className="text-[color:var(--color-muted)]">รวม {baht(deductions.totalWht)} ฿</span>
          </div>
          {deductions.rows.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">ไม่มีรายการในงวดนี้</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-y text-[color:var(--color-muted)]">
                    <th className="py-1.5 text-left">วันที่</th>
                    <th className="py-1.5 text-left">ผู้รับเงิน</th>
                    <th className="py-1.5 text-right">ฐาน</th>
                    <th className="py-1.5 text-right">อัตรา</th>
                    <th className="py-1.5 text-right">ภาษีหัก</th>
                    <th className="py-1.5 text-left">50 ทวิ</th>
                  </tr>
                </thead>
                <tbody>
                  {deductions.rows.map((r) => (
                    <tr key={r.paymentId} className="border-b align-top">
                      <td className="py-1.5">{fmtDate(r.paidAt)}</td>
                      <td className="py-1.5">
                        <div>{r.contactName}</div>
                        {r.contactTaxId && <div className="text-[color:var(--color-muted)]">{r.contactTaxId}</div>}
                      </td>
                      <td className="py-1.5 text-right">{r.base != null ? baht(r.base) : "—"}</td>
                      <td className="py-1.5 text-right">{pct(r.whtRateBp)}</td>
                      <td className="py-1.5 text-right font-medium">{baht(r.whtAmount)}</td>
                      <td className="py-1.5">
                        {r.certDocId ? (
                          <Link href={`${base}/wht/${r.certDocId}/print`} className="underline">
                            {r.certNo ?? "พิมพ์"}
                          </Link>
                        ) : (
                          <form action={issueWhtCertAction} className="flex flex-wrap items-center gap-1">
                            <input type="hidden" name="systemId" value={systemId} />
                            <input type="hidden" name="paymentId" value={r.paymentId} />
                            <select name="whtIncomeType" defaultValue="M40_8" className={inputCls}>
                              {INCOME_TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                            </select>
                            {r.whtRateBp == null && (
                              <input name="whtRateBp" type="number" placeholder="อัตรา bp" className={`${inputCls} w-20`} />
                            )}
                            <button className="btn btn-primary text-xs">ออก 50 ทวิ</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <h2 className="font-medium">ภาษีถูกหัก (เครดิตภาษี — สะสม 1160)</h2>
            <span className="text-[color:var(--color-muted)]">รวม {baht(credits.totalWht)} ฿</span>
          </div>
          {credits.rows.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">ไม่มีรายการในงวดนี้</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-y text-[color:var(--color-muted)]">
                    <th className="py-1.5 text-left">วันที่</th>
                    <th className="py-1.5 text-left">เอกสาร</th>
                    <th className="py-1.5 text-left">ผู้หัก (ลูกค้า)</th>
                    <th className="py-1.5 text-right">ฐาน</th>
                    <th className="py-1.5 text-right">อัตรา</th>
                    <th className="py-1.5 text-right">ภาษีถูกหัก</th>
                    <th className="py-1.5 text-center">สำเนา 50 ทวิ</th>
                  </tr>
                </thead>
                <tbody>
                  {credits.rows.map((r) => (
                    <tr key={r.paymentId} className="border-b">
                      <td className="py-1.5">{fmtDate(r.paidAt)}</td>
                      <td className="py-1.5">{r.docNo ?? "—"}</td>
                      <td className="py-1.5">
                        <div>{r.contactName}</div>
                        {r.contactTaxId && <div className="text-[color:var(--color-muted)]">{r.contactTaxId}</div>}
                      </td>
                      <td className="py-1.5 text-right">{r.base != null ? baht(r.base) : "—"}</td>
                      <td className="py-1.5 text-right">{pct(r.whtRateBp)}</td>
                      <td className="py-1.5 text-right font-medium">{baht(r.whtAmount)}</td>
                      <td className="py-1.5 text-center">{r.hasCertCopy ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
