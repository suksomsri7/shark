import Link from "next/link";
import type { AccountJournalBook, Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { TabPills } from "@/components/ui/TabPills";
import { DataList } from "@/components/ui/DataList";
import { MoneyText } from "@/components/ui/MoneyText";

// แท็บสมุดรายวัน — ตรงตาม §3.0.3: ทั้งหมด · ซื้อ · ขาย · จ่าย · รับ · ทั่วไป · ล่าสุด
const BOOK_TABS: { key: string; label: string }[] = [
  { key: "ALL", label: "ทั้งหมด" },
  { key: "PURCHASES", label: "ซื้อ" },
  { key: "SALES", label: "ขาย" },
  { key: "PAYMENTS", label: "จ่าย" },
  { key: "RECEIPTS", label: "รับ" },
  { key: "GENERAL", label: "ทั่วไป" },
  { key: "recent", label: "ล่าสุด" },
];

const JOURNAL_LABEL: Record<string, string> = {
  DOC: "เอกสาร",
  PAYMENT: "ชำระเงิน",
  ADJUST: "ปรับปรุง",
  REVERSAL: "กลับรายการ",
  DEPRECIATION: "ค่าเสื่อม",
  OPENING: "ยอดยกมา",
};

// map refType → path segment ของเอกสาร (คลิกทะลุ)
async function docLinks(systemId: string, refIds: string[]) {
  if (refIds.length === 0) return new Map<string, string>();
  const docs = await prisma.accountDocument.findMany({
    where: { systemId, id: { in: refIds } },
    select: { id: true, docType: true },
  });
  return new Map(docs.map((d) => [d.id, d.docType]));
}

export default async function JournalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ book?: string; posted?: string }>;
}) {
  const { id } = await params;
  const { book: bookParam, posted } = await searchParams;
  const { auth, tenantId, systemId } = await loadAccountSystem(id);
  assertAccountCan(auth, "account.journal.view");

  const book = BOOK_TABS.find((b) => b.key === bookParam)?.key ?? "ALL";
  const base = `/app/sys/${id}/account`;
  const isBookFilter = book !== "ALL" && book !== "recent";

  const where: Prisma.AccountJournalEntryWhereInput = {
    tenantId,
    systemId,
    ...(isBookFilter ? { book: book as AccountJournalBook } : {}),
  };
  const entries = await prisma.accountJournalEntry.findMany({
    where,
    orderBy:
      book === "recent"
        ? [{ createdAt: "desc" }]
        : [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: { lines: { select: { debit: true } } },
  });

  const docRefIds = entries
    .filter((e) => e.refType === "AccountDocument" && e.refId)
    .map((e) => e.refId!) as string[];
  const docTypeById = await docLinks(systemId, docRefIds);

  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium" }).format(d);

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PageHeader
        title="สมุดรายวัน"
        back={{ href: base, label: "ระบบบัญชี" }}
        actions={
          <Link href={`${base}/journal/new`} className="btn btn-primary text-sm whitespace-nowrap">
            + บันทึกด้วยมือ
          </Link>
        }
      />

      {posted === "1" && (
        <p className="text-sm text-[color:var(--color-ink)]">บันทึกรายการด้วยมือแล้ว ✓</p>
      )}

      <TabPills
        active={book}
        tabs={BOOK_TABS.map((t) => ({ key: t.key, label: t.label, href: `${base}/journal?book=${t.key}` }))}
      />

      <DataList
        items={entries.map((e) => {
          const total = e.lines.reduce((s, l) => s + l.debit, 0);
          const dt = e.refId ? docTypeById.get(e.refId) : undefined;
          const href =
            e.refType === "AccountDocument" && dt
              ? `${base}/docs/${dt}/${e.refId}`
              : `${base}/journal/${e.id}`;
          return {
            key: e.id,
            href,
            primary: (
              <span>
                {e.docNo} · {JOURNAL_LABEL[e.journal] ?? e.journal}
                {e.status === "REVERSED" && (
                  <span className="ml-1 text-xs text-[color:var(--color-danger)]">(กลับรายการแล้ว)</span>
                )}
                {e.needsReview && (
                  <span className="ml-1 text-xs text-[color:var(--color-danger)]">⚑ ตรวจสอบ</span>
                )}
              </span>
            ),
            secondary: `${fmtDate(e.date)} · ${e.memo ?? "—"}`,
            trailing: <MoneyText satang={total} decimals />,
          };
        })}
        empty="ยังไม่มีรายการในสมุดนี้ — รายการจะถูกบันทึกอัตโนมัติเมื่อออกเอกสาร"
      />
    </div>
  );
}
