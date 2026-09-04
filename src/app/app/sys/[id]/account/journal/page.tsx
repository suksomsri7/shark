import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, accountCan } from "@/lib/modules/account/access";
import {
  listJournalPaged,
  jvAccountOptions,
  jvContactOptions,
  journalRangeOf,
  journalRangeKeyOf,
  JOURNAL_RANGE_PRESETS,
  JOURNAL_TABS,
  JOURNAL_PAGE_SIZE,
  type JournalRangeKey,
} from "@/lib/modules/account/journal-v2";
import { nextJournalNo } from "@/lib/modules/account/gl";
import { AccountIcon } from "@/components/account-v2/AccountIcon";
import { StatusTabs } from "@/components/account-v2/StatusTabs";
import { Pagination } from "@/components/account-v2/Pagination";
import { JournalFilterBar } from "@/components/account-v2/JournalFilterBar";
import { JournalTable } from "@/components/account-v2/JournalTable";
import { ManualJvModal } from "@/components/account-v2/ManualJvModal";
import { createJvAction } from "./actions";

// บัญชีรายวัน V2 — DESIGN-SPEC-V2 §11.2 · เฟรม g16-journal.png
// โครงตามเฟรม: breadcrumb → H1 + [พิมพ์รายงาน] [+ สร้างสมุดรายวัน] → แท็บตาม book (มีตัวนับ)
//              → ตัวกรอง 3 ช่อง (ช่วงวันที่ · สมุด · ค้นหา) → ตาราง 9 คอลัมน์ + แถวสรุปท้าย
// ตัวกรอง/ค้นหา/หน้า ทำ **ฝั่ง server ทั้งหมด** (journal-v2.listJournalPaged) — ไม่ take ทั้งก้อนมากรองในหน้า

export default async function JournalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    range?: string;
    from?: string;
    to?: string;
    q?: string;
    review?: string;
    page?: string;
    size?: string;
    new?: string;
    err?: string;
    ok?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { auth, tenantId, systemId } = await loadAccountSystem(id);
  assertAccountCan(auth, "account.journal.view");
  const ctx = { tenantId, systemId };
  const base = `/app/sys/${id}/account`;
  const journalPath = `${base}/journal`;
  const canAdjust = accountCan(auth, "account.journal.adjust");

  const now = new Date();
  // ช่วงวันที่: `?range=` (preset) ชนะ `?from/?to` · ไม่ส่งอะไรมาเลย = "เดือนนี้" (ทั้งเดือน) ตามเฟรม
  // ลิงก์เก่าที่ส่ง from/to ตรง ๆ ยังใช้ได้เหมือนเดิม (จะถูกอ่านเป็น "กำหนดเอง" ถ้าไม่ตรง preset ตัวไหน)
  const presetKey = JOURNAL_RANGE_PRESETS.find((p) => p.key === sp.range)?.key;
  const preset = presetKey ? journalRangeOf(presetKey, now) : null;
  const from = preset?.from ?? sp.from ?? journalRangeOf("this_month", now).from;
  const to = preset?.to ?? sp.to ?? journalRangeOf("this_month", now).to;
  const rangeKey: JournalRangeKey | "custom" = presetKey ?? journalRangeKeyOf(from, to, now);
  const tab = JOURNAL_TABS.find((t) => t.key === sp.tab)?.key ?? "ALL";
  const q = (sp.q ?? "").trim();
  const review = sp.review === "1";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const pageSize = Number(sp.size ?? "") || JOURNAL_PAGE_SIZE;

  const list = await listJournalPaged(ctx, { book: tab, from, to, q, needsReview: review, page, pageSize });

  // แถวแรกที่มีบัญชีพัก 9999 กางไว้ตั้งแต่โหลด — สถานะเดียวกับ g16 (ผู้ใช้เห็นทันทีว่าทำไมถึงติดธง)
  const expandedFirst = list.rows.find((r) => r.lines.some((l) => l.suspense))?.id;

  const openModal = sp.new === "1" && canAdjust;
  const [accounts, contacts] = openModal
    ? await Promise.all([jvAccountOptions(ctx), jvContactOptions(ctx)])
    : [[], []];
  const nextDocNo = openModal ? await nextJournalNo(ctx, "GENERAL", now) : "";

  return (
    <div className="flex flex-col gap-5">
      {/* breadcrumb "บัญชี › บัญชีรายวัน" มาจาก layout (AccountBreadcrumb อ่าน pathname เอง) — ไม่ซ้อนที่นี่ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">บัญชีรายวัน</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`${journalPath}/print?tab=${tab}&from=${from}&to=${to}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className="btn btn-ghost text-sm"
            data-testid="journal-print"
          >
            <AccountIcon name="printer" className="h-4 w-4" /> พิมพ์รายงาน
          </Link>
          {canAdjust && (
            <Link href={`${journalPath}?new=1`} className="btn btn-primary text-sm" data-testid="journal-new">
              <AccountIcon name="plus" className="h-4 w-4" /> สร้างสมุดรายวัน
            </Link>
          )}
        </div>
      </div>

      {sp.err && (
        <p className="text-sm text-[color:var(--color-danger)]" data-testid="journal-err">
          {sp.err}
        </p>
      )}
      {sp.ok && (
        <p className="text-sm font-medium" data-testid="journal-ok">
          {sp.ok}
        </p>
      )}

      <StatusTabs
        tabs={JOURNAL_TABS.map((t) => ({ key: t.key, label: t.label }))}
        counts={list.tabCounts}
        active={tab}
        paramKey="tab"
        testId="journal-tabs"
      />

      {/* ตัวกรองแถวเดียวตาม g16 — preset ช่วงวันที่ · สมุด · ค้นหา · เฉพาะที่ต้องตรวจ (ยิงฟอร์มเองเมื่อเปลี่ยนค่า) */}
      <JournalFilterBar
        pathname={journalPath}
        range={rangeKey}
        presets={JOURNAL_RANGE_PRESETS}
        from={from}
        to={to}
        tab={tab}
        books={JOURNAL_TABS}
        q={q}
        review={review}
        pageSize={sp.size}
      />

      <JournalTable
        base={base}
        rows={list.rows.map((r) => ({
          id: r.id,
          docNo: r.docNo,
          dateIso: r.date.toISOString(),
          bookLabel: r.bookLabel,
          memo: r.memo,
          refLabel: r.ref?.label ?? null,
          refHref: r.ref?.href ?? null,
          totalDebit: r.totalDebit,
          totalCredit: r.totalCredit,
          postedByName: r.postedByName,
          needsReview: r.needsReview,
          flagNote: r.flagNote,
          reversed: r.reversed,
          isReversal: r.isReversal,
          lines: r.lines,
        }))}
        sumDebit={list.sumDebit}
        sumCredit={list.sumCredit}
        total={list.total}
        expandedFirst={expandedFirst}
        // แถบแบ่งหน้าอยู่ "ในการ์ดเดียวกับตาราง" ต่อจากแถวสรุป (แบบเดียวกับ footerInsideCard ของ WO 5.4)
        footer={
          <Pagination
            pathname={journalPath}
            searchParams={new URLSearchParams(
              Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][],
            )}
            page={list.page}
            pageCount={list.pageCount}
            pageSize={list.pageSize}
            total={list.total}
            testId="journal-pagination"
          />
        }
      />

      {openModal && (
        <ManualJvModal
          journalPath={journalPath}
          systemId={systemId}
          accounts={accounts}
          contacts={contacts}
          defaultDate={new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(now)}
          nextDocNo={nextDocNo}
          action={createJvAction}
          error={sp.err}
        />
      )}
    </div>
  );
}
