import Link from "next/link";
import { prisma } from "@/lib/core/db";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { listLedgers } from "@/lib/modules/account/coa";
import { baht } from "@/lib/modules/account/service";

const inputCls = "rounded-lg border px-2 py-1.5 text-sm";

// แยกประเภท: ยอดยกมา + movement รายบรรทัด + ยอดยกไป
export default async function LedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ account?: string; from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { auth, tenantId, systemId } = await loadAccountSystem(id);
  assertAccountCan(auth, "account.journal.view");

  const base = `/app/sys/${id}/account`;
  const ledgers = await listLedgers({ tenantId, systemId });

  // ช่วงเวลา default = เดือนปัจจุบัน (เวลาไทย)
  const now = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const from = sp.from || `${now.slice(0, 7)}-01`;
  const to = sp.to || now;
  const accountId = sp.account || "";

  const fromDate = new Date(`${from}T00:00:00.000+07:00`);
  const toDate = new Date(`${to}T23:59:59.999+07:00`);

  let opening = 0;
  let rows: {
    id: string;
    entryId: string;
    date: Date;
    docNo: string;
    journal: string;
    memo: string | null;
    debit: number;
    credit: number;
  }[] = [];

  if (accountId) {
    const openAgg = await prisma.accountJournalLine.aggregate({
      where: {
        systemId,
        accountId,
        entry: { status: "POSTED", date: { lt: fromDate } },
      },
      _sum: { debit: true, credit: true },
    });
    opening = (openAgg._sum.debit ?? 0) - (openAgg._sum.credit ?? 0);

    const lines = await prisma.accountJournalLine.findMany({
      where: {
        systemId,
        accountId,
        entry: { status: "POSTED", date: { gte: fromDate, lte: toDate } },
      },
      include: { entry: { select: { id: true, date: true, docNo: true, journal: true, memo: true } } },
      orderBy: [{ entry: { date: "asc" } }, { entry: { createdAt: "asc" } }],
    });
    rows = lines.map((l) => ({
      id: l.id,
      entryId: l.entry.id,
      date: l.entry.date,
      docNo: l.entry.docNo,
      journal: l.entry.journal,
      memo: l.entry.memo,
      debit: l.debit,
      credit: l.credit,
    }));
  }

  const movementDr = rows.reduce((s, r) => s + r.debit, 0);
  const movementCr = rows.reduce((s, r) => s + r.credit, 0);
  const closing = opening + movementDr - movementCr;
  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium" }).format(d);

  // running balance
  let run = opening;

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <Link href={base} className="text-sm text-[color:var(--color-muted)]">← ระบบบัญชี</Link>
        <h1 className="mt-1 text-2xl font-semibold">บัญชีแยกประเภท</h1>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          บัญชี
          <select name="account" defaultValue={accountId} className={`${inputCls} min-w-[16rem]`}>
            <option value="">— เลือกบัญชี —</option>
            {ledgers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ตั้งแต่
          <input type="date" name="from" defaultValue={from} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ถึง
          <input type="date" name="to" defaultValue={to} className={inputCls} />
        </label>
        <button className="btn btn-primary text-sm">แสดง</button>
      </form>

      {!accountId ? (
        <p className="text-sm text-[color:var(--color-muted)]">เลือกบัญชีเพื่อดูการเคลื่อนไหว</p>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-surface-2)] text-xs text-[color:var(--color-muted)]">
              <tr>
                <th className="px-3 py-2 text-left">วันที่</th>
                <th className="px-3 py-2 text-left">ใบสำคัญ</th>
                <th className="px-3 py-2 text-right">เดบิต</th>
                <th className="px-3 py-2 text-right">เครดิต</th>
                <th className="px-3 py-2 text-right">คงเหลือ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr className="text-[color:var(--color-muted)]">
                <td className="px-3 py-2" colSpan={4}>ยอดยกมา</td>
                <td className="px-3 py-2 text-right">{baht(opening)}</td>
              </tr>
              {rows.map((r) => {
                run += r.debit - r.credit;
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-3 py-2">
                      <Link href={`${base}/journal/${r.entryId}`} className="hover:underline">
                        {r.docNo}
                      </Link>
                      {r.memo && <span className="ml-1 text-xs text-[color:var(--color-muted)]">— {r.memo}</span>}
                    </td>
                    <td className="px-3 py-2 text-right">{r.debit > 0 ? baht(r.debit) : ""}</td>
                    <td className="px-3 py-2 text-right">{r.credit > 0 ? baht(r.credit) : ""}</td>
                    <td className="px-3 py-2 text-right">{baht(run)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t font-medium">
              <tr>
                <td className="px-3 py-2" colSpan={2}>เคลื่อนไหวในงวด</td>
                <td className="px-3 py-2 text-right">฿{baht(movementDr)}</td>
                <td className="px-3 py-2 text-right">฿{baht(movementCr)}</td>
                <td className="px-3 py-2 text-right">ยกไป {baht(closing)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
