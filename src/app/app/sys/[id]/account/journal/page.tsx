import Link from "next/link";
import type { AccountJournalBook } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { baht } from "@/lib/modules/account/service";

const BOOK_TABS: { key: string; label: string }[] = [
  { key: "ALL", label: "ทั้งหมด" },
  { key: "SALES", label: "ขาย" },
  { key: "PURCHASES", label: "ซื้อ" },
  { key: "RECEIPTS", label: "รับเงิน" },
  { key: "PAYMENTS", label: "จ่ายเงิน" },
  { key: "GENERAL", label: "ทั่วไป" },
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

  const entries = await prisma.accountJournalEntry.findMany({
    where: {
      tenantId,
      systemId,
      ...(book === "ALL" ? {} : { book: book as AccountJournalBook }),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={base} className="text-sm text-[color:var(--color-muted)]">← ระบบบัญชี</Link>
          <h1 className="mt-1 text-2xl font-semibold">บัญชีรายวัน</h1>
        </div>
        <Link href={`${base}/journal/new`} className="btn btn-primary text-sm whitespace-nowrap">
          + บันทึกด้วยมือ (JV)
        </Link>
      </div>

      {posted === "1" && <p className="text-sm text-[color:var(--color-ink)]">บันทึก JV แล้ว ✓</p>}

      <div className="flex flex-wrap gap-1.5">
        {BOOK_TABS.map((t) => (
          <Link
            key={t.key}
            href={`${base}/journal?book=${t.key}`}
            className="rounded-full border px-3 py-1 text-xs"
            style={
              t.key === book
                ? { background: "var(--color-ink)", color: "var(--color-surface)" }
                : undefined
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีรายการในสมุดนี้</p>
      ) : (
        <div className="flex flex-col divide-y rounded-xl border">
          {entries.map((e) => {
            const total = e.lines.reduce((s, l) => s + l.debit, 0);
            const dt = e.refId ? docTypeById.get(e.refId) : undefined;
            const href =
              e.refType === "AccountDocument" && dt
                ? `${base}/docs/${dt}/${e.refId}`
                : `${base}/journal/${e.id}`;
            return (
              <Link
                key={e.id}
                href={href}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-[color:var(--color-surface-2)]"
              >
                <div className="flex flex-col">
                  <span className="font-medium">
                    {e.docNo} · {JOURNAL_LABEL[e.journal] ?? e.journal}
                    {e.status === "REVERSED" && (
                      <span className="ml-1 text-xs text-[color:var(--color-danger)]">(กลับรายการแล้ว)</span>
                    )}
                    {e.needsReview && (
                      <span className="ml-1 text-xs text-[color:var(--color-danger)]">⚑ ตรวจสอบ</span>
                    )}
                  </span>
                  <span className="text-xs text-[color:var(--color-muted)]">
                    {fmtDate(e.date)} · {e.memo ?? "—"}
                  </span>
                </div>
                <span className="whitespace-nowrap">฿{baht(total)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
