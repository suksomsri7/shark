import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/core/db";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { baht } from "@/lib/modules/account/service";

export default async function JournalEntryPage({
  params,
}: {
  params: Promise<{ id: string; entryId: string }>;
}) {
  const { id, entryId } = await params;
  const { auth, tenantId, systemId } = await loadAccountSystem(id);
  assertAccountCan(auth, "account.journal.view");

  const entry = await prisma.accountJournalEntry.findFirst({
    where: { id: entryId, tenantId, systemId },
    include: {
      lines: { include: { account: { select: { code: true, name: true } } } },
    },
  });
  if (!entry) notFound();

  const base = `/app/sys/${id}/account`;
  const totalDr = entry.lines.reduce((s, l) => s + l.debit, 0);
  const totalCr = entry.lines.reduce((s, l) => s + l.credit, 0);
  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "long" }).format(d);

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Link href={`${base}/journal`} className="text-sm text-[color:var(--color-muted)]">← บัญชีรายวัน</Link>
        <h1 className="mt-1 text-2xl font-semibold">{entry.docNo}</h1>
        <p className="text-sm text-[color:var(--color-muted)]">
          {fmtDate(entry.date)} · {entry.journal} · {entry.source === "MANUAL" ? "บันทึกด้วยมือ" : "อัตโนมัติ"}
          {entry.status === "REVERSED" && " · กลับรายการแล้ว"}
        </p>
        {entry.memo && <p className="mt-1 text-sm">{entry.memo}</p>}
      </div>

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--color-surface-2)] text-xs text-[color:var(--color-muted)]">
            <tr>
              <th className="px-3 py-2 text-left">บัญชี</th>
              <th className="px-3 py-2 text-right">เดบิต</th>
              <th className="px-3 py-2 text-right">เครดิต</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entry.lines.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2">
                  <span className="text-[color:var(--color-muted)]">{l.account.code}</span> {l.account.name}
                  {l.note && <span className="ml-1 text-xs text-[color:var(--color-muted)]">— {l.note}</span>}
                </td>
                <td className="px-3 py-2 text-right">{l.debit > 0 ? baht(l.debit) : ""}</td>
                <td className="px-3 py-2 text-right">{l.credit > 0 ? baht(l.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t font-medium">
            <tr>
              <td className="px-3 py-2 text-right">รวม</td>
              <td className="px-3 py-2 text-right">฿{baht(totalDr)}</td>
              <td className="px-3 py-2 text-right">฿{baht(totalCr)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
