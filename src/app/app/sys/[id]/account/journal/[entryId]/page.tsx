import { notFound } from "next/navigation";
import { prisma } from "@/lib/core/db";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataList";
import { MoneyText } from "@/components/ui/MoneyText";

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

  type LineRow = (typeof entry.lines)[number];
  type Row = ({ kind: "line" } & LineRow) | { kind: "total" };
  const tableRows: Row[] = [
    ...entry.lines.map((l) => ({ kind: "line" as const, ...l })),
    { kind: "total" },
  ];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={entry.docNo}
        back={{ href: `${base}/journal`, label: "สมุดรายวัน" }}
        desc={`${fmtDate(entry.date)} · ${
          entry.source === "MANUAL" ? "บันทึกด้วยมือ" : "อัตโนมัติ"
        }${entry.status === "REVERSED" ? " · กลับรายการแล้ว" : ""}`}
      />
      {entry.memo && <p className="text-sm">{entry.memo}</p>}

      <DataTable<Row>
        minWidth={480}
        empty="ไม่มีรายการบัญชี"
        rows={tableRows}
        rowKey={(r, i) => (r.kind === "line" ? r.id : `total-${i}`)}
        cols={[
          {
            key: "account",
            header: "บัญชี",
            render: (r) =>
              r.kind === "total" ? (
                <span className="font-medium">รวม</span>
              ) : (
                <span>
                  <span className="text-[color:var(--color-muted)]">{r.account.code}</span> {r.account.name}
                  {r.note && (
                    <span className="ml-1 text-xs text-[color:var(--color-muted)]">— {r.note}</span>
                  )}
                </span>
              ),
          },
          {
            key: "debit",
            header: "เดบิต",
            align: "right",
            render: (r) =>
              r.kind === "total" ? (
                <span className="font-medium">
                  <MoneyText satang={totalDr} decimals />
                </span>
              ) : r.debit > 0 ? (
                <MoneyText satang={r.debit} decimals />
              ) : (
                ""
              ),
          },
          {
            key: "credit",
            header: "เครดิต",
            align: "right",
            render: (r) =>
              r.kind === "total" ? (
                <span className="font-medium">
                  <MoneyText satang={totalCr} decimals />
                </span>
              ) : r.credit > 0 ? (
                <MoneyText satang={r.credit} decimals />
              ) : (
                ""
              ),
          },
        ]}
      />
    </div>
  );
}
