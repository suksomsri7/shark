// WO 5.4 — หน้า "ภาษีหัก ณ ที่จ่าย" V2 ทั้ง 2 ขา (DESIGN-SPEC-V2 §10.5 · เฟรม g11-wht-deduct.png)
// route เดิม (`?tab=credit|deduct`) — คงไว้ตามที่ financeSubTabs/nav.ts ผูกไว้แล้วตั้งแต่ WO 5.1 (ดู wo-notes/5.4.md ขั้น 3)
import Link from "next/link";
import type { AccountDocType } from "@prisma/client";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { financeSubTabs } from "@/lib/modules/account/finance-ui";
import { chequeSummary } from "@/lib/modules/account/cheque";
import {
  listWhtCertsV2,
  whtCreditYearTotal,
  validateMarkFiledSelection,
  periodKeyLabel,
  periodKeyMonthShort,
  type WhtCertRow,
} from "@/lib/modules/account/wht";
import { editorDetailPath } from "@/lib/modules/account/doc-editor-config";
import { PageHeader } from "@/components/ui/PageHeader";
import { FinanceSubTabsBar } from "@/components/account-v2/FinanceSubTabsBar";
import { StatusTabs, type StatusTabDef } from "@/components/account-v2/StatusTabs";
import { DocTable, type DocColumn } from "@/components/account-v2/DocTable";
import { PrintButton } from "@/components/account-v2/PrintButton";
import { MarkFiledModal } from "@/components/account-v2/MarkFiledModal";
import { WhtFilterBar } from "@/components/account-v2/WhtFilterBar";
import { buildHref } from "@/components/account-v2/url";
import { formatBaht } from "@/lib/ui/money";
import { formatThaiDate } from "@/lib/ui/date";

const pct = (bp: number | null) => (bp != null ? `${(bp / 100).toFixed(bp % 100 ? 2 : 0)}%` : "—");

type SP = {
  tab?: string;
  range?: string;
  from?: string;
  to?: string;
  status?: string;
  q?: string;
  page?: string;
  markFiled?: string;
  ids?: string;
};

export default async function WhtPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.wht.manage" });
  const base = `/app/sys/${id}/account`;
  const pathname = `${base}/wht`;

  const direction = sp.tab === "credit" ? "OUT" : "IN";
  const tab = direction === "OUT" ? "credit" : "deduct";

  const now = new Date();
  const range = sp.range === "all" || sp.range === "custom" ? sp.range : "this_year";
  let from: Date | undefined;
  let to: Date | undefined;
  if (range === "this_year") {
    const y = now.getFullYear();
    from = new Date(Date.UTC(y, 0, 1, -7));
    to = new Date(Date.UTC(y + 1, 0, 1, -7));
  } else if (range === "custom") {
    if (sp.from) from = new Date(sp.from);
    if (sp.to) to = new Date(new Date(sp.to).getTime() + 86400000);
  }

  const status = sp.status === "NORMAL" || sp.status === "CANCELLED" ? sp.status : "ALL";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 20;

  const [chq, listRes, creditYearTotal] = await Promise.all([
    chequeSummary(tenantId, systemId),
    listWhtCertsV2(tenantId, systemId, { direction, from, to, status, q: sp.q, page, pageSize }),
    whtCreditYearTotal(tenantId, systemId, now.getFullYear()),
  ]);
  const { rows, total, totalBase, totalWht, tabCounts } = listRes;

  const subTabs = financeSubTabs(base, direction === "IN" ? "wht-deduct" : "wht-credit", chq);
  const heading = direction === "IN" ? "ภาษีหัก ณ ที่จ่ายที่หักไว้ (จ่ายผู้ขาย)" : "ภาษีถูกหักไว้ที่ได้รับมา (จากลูกค้า)";

  const spForHref: Record<string, string | undefined> = {
    tab,
    range: sp.range,
    from: sp.from,
    to: sp.to,
    status: sp.status,
    q: sp.q,
    page: sp.page,
  };

  const cols: DocColumn<WhtCertRow>[] = [
    {
      key: "certNo",
      header: "เอกสารลำดับที่",
      render: (r) => (
        <Link
          href={`${base}/wht/${r.certId}/print`}
          className="whitespace-nowrap"
          style={{ color: "var(--color-accent)" }}
          data-testid={`wht-cert-${r.certId}`}
        >
          {r.certNo ?? "—"}
        </Link>
      ),
    },
    { key: "contact", header: direction === "IN" ? "ชื่อผู้ขาย" : "ชื่อผู้ซื้อ (ลูกค้า)", render: (r) => r.contactName },
    {
      key: "source",
      header: "อ้างอิงเอกสาร",
      render: (r) =>
        r.sourceDocId && r.sourceDocType ? (
          <Link
            href={editorDetailPath(base, r.sourceDocType as AccountDocType, r.sourceDocId)}
            className="whitespace-nowrap"
            style={{ color: "var(--color-accent)" }}
          >
            {r.sourceDocNo ?? "—"}
          </Link>
        ) : (
          <span className="whitespace-nowrap">{r.sourceDocNo ?? "—"}</span>
        ),
    },
    { key: "paidAt", header: "วันที่ชำระ", render: (r) => <span className="whitespace-nowrap">{formatThaiDate(r.paidAt)}</span> },
    // g11: ป้ายสั้น ๆ อยู่บรรทัดเดียว — ให้กว้างพอด้วย min-w (ห้าม nowrap เด็ดขาด เผื่อป้ายยาวเช่น
    // "40(3) ค่าแห่งลิขสิทธิ์/goodwill" ที่ยังต้องขึ้นบรรทัดใหม่ได้แทนดันตารางล้นแนวนอน)
    { key: "income", header: "ประเภทเงินได้", render: (r) => <span className="inline-block min-w-[110px]">{r.incomeLabel}</span> },
    { key: "rate", header: "อัตรา", align: "right", render: (r) => pct(r.whtRateBp) },
    { key: "base", header: "จำนวนเงิน", align: "right", render: (r) => formatBaht(r.base, { decimals: true }) },
    { key: "wht", header: "มูลค่าภาษี", align: "right", render: (r) => formatBaht(r.whtAmount, { decimals: true }) },
  ];
  if (direction === "IN") {
    cols.push({
      key: "filed",
      header: "การนำส่ง",
      render: (r) =>
        r.cancelled ? (
          <span className="text-xs text-[color:var(--color-muted)]">—</span>
        ) : r.filedPeriodKey ? (
          <span
            className="whitespace-nowrap rounded-full border px-2 py-0.5 text-xs"
            style={{ borderColor: "var(--color-ink)" }}
            data-testid={`wht-filed-${r.certId}`}
          >
            ยื่นแล้ว {periodKeyMonthShort(r.filedPeriodKey.split(":")[1] ?? "")}
          </span>
        ) : (
          <span
            className="whitespace-nowrap rounded-full border px-2 py-0.5 text-xs text-[color:var(--color-muted)]"
            style={{ borderColor: "var(--color-line)" }}
          >
            ยังไม่ยื่น
          </span>
        ),
    });
  }

  // g11: ลำดับ ทั้งหมด · ปกติ · e-WHT (เร็ว ๆ นี้ — จาง คั่นกลาง) · ยกเลิก (ตัวหนังสือปกติ ไม่ใช่สีแดง)
  // ⇒ แยก StatusTabs เป็น 2 กลุ่ม share paramKey เดียวกัน คั่นด้วย span จาง (StatusTabs ไม่รองรับ tab แบบ disabled)
  const statusTabsLeft: StatusTabDef[] = [
    { key: "ALL", label: "ทั้งหมด" },
    { key: "NORMAL", label: "ปกติ" },
  ];
  const statusTabsRight: StatusTabDef[] = [{ key: "CANCELLED", label: "ยกเลิก" }];

  const resetHref = `${pathname}?tab=${tab}`;
  const markFiledHrefTemplate = `${buildHref(pathname, spForHref, { markFiled: "1" })}&ids={ids}`;

  let markFiledModal: React.ReactNode = null;
  if (sp.markFiled === "1" && direction === "IN") {
    const ids = (sp.ids ?? "").split(",").filter(Boolean);
    const summary = await validateMarkFiledSelection(tenantId, systemId, ids);
    const closeHref = buildHref(pathname, spForHref, { markFiled: undefined, ids: undefined });
    markFiledModal = (
      <MarkFiledModal
        systemId={systemId}
        closeHref={closeHref}
        summary={summary.ok ? { ...summary, periodLabel: `ภ.ง.ด.${summary.form} · ${periodKeyLabel(summary.periodKey)}` } : summary}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-24" data-testid="wht-page">
      <FinanceSubTabsBar subTabs={subTabs} />

      <PageHeader
        title={heading}
        actions={
          <>
            <div className="text-right" data-testid="wht-credit-year-tile">
              <div className="text-xs text-[color:var(--color-muted)]">เครดิตภาษีถูกหักสะสมปีนี้</div>
              <div className="text-lg font-semibold tabular-nums" data-testid="wht-credit-year-amount">
                {formatBaht(creditYearTotal, { decimals: true })}
              </div>
            </div>
            <PrintButton testId="wht-print" />
            {direction === "IN" && (
              <Link href={`${base}/tax`} className="btn btn-primary" data-testid="wht-export-pnd">
                ⬇ ส่งออก ภ.ง.ด.3/53 (CSV)
              </Link>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <StatusTabs tabs={statusTabsLeft} counts={tabCounts} active={status} paramKey="status" testId="wht-status-tabs" />
        <span
          className="pb-2 text-sm opacity-40"
          style={{ cursor: "not-allowed" }}
          title="e-WHT เชื่อมสรรพากรโดยตรง — เร็ว ๆ นี้"
          data-testid="wht-tab-ewht-soon"
        >
          e-WHT (เร็ว ๆ นี้)
        </span>
        <StatusTabs tabs={statusTabsRight} counts={tabCounts} active={status} paramKey="status" testId="wht-status-tabs-2" />
      </div>

      <WhtFilterBar
        pathname={pathname}
        tab={tab}
        status={status}
        range={range}
        q={sp.q}
        searchPlaceholder={`ค้นหาด้วยชื่อ${direction === "IN" ? "ผู้ขาย" : "ผู้ซื้อ"}, เลขที่`}
        resetHref={resetHref}
      />

      <DocTable
        testId="wht-table"
        cols={cols}
        rows={rows}
        pathname={pathname}
        searchParams={spForHref}
        selectable={direction === "IN"}
        rowEligible={(r) => !r.cancelled}
        bulkBarTint
        selectionActions={
          direction === "IN"
            ? [
                {
                  label: "✓ ทำเครื่องหมายนำส่งแล้ว",
                  hrefTemplate: markFiledHrefTemplate,
                  requireEligible: true,
                  eligibleHint: "เลือกได้เฉพาะรายการที่ยังไม่ยกเลิก",
                  variant: "primary",
                },
              ]
            : undefined
        }
        mobileTitle={(r) => r.certNo ?? "—"}
        mobileSubtitle={(r) => r.contactName}
        mobileTrailing={(r) => formatBaht(r.whtAmount, { decimals: true })}
        mobileStatus={(r) =>
          direction === "IN" ? (
            r.cancelled ? (
              <span className="text-xs text-[color:var(--color-muted)]">ยกเลิก</span>
            ) : r.filedPeriodKey ? (
              <span className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: "var(--color-ink)" }}>
                ยื่นแล้ว
              </span>
            ) : (
              <span className="rounded-full border px-2 py-0.5 text-xs text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
                ยังไม่ยื่น
              </span>
            )
          ) : null
        }
        mobileDateLine={(r) => `${formatThaiDate(r.paidAt)}${r.sourceDocNo ? ` · ${r.sourceDocNo}` : ""}`}
        // g11: แถบท้าย "ผลรวม N รายการ" ซ้าย / "จำนวนเงิน · มูลค่าภาษี" ขวา (ตัวหนา) — อยู่กรอบเดียวกับ Pagination
        footerLeft={
          <span className="text-[color:var(--color-muted)]" data-testid="wht-footer-count">
            ผลรวม {total} รายการ
          </span>
        }
        footerRight={
          <span className="text-[color:var(--color-muted)]" data-testid="wht-footer-sums">
            จำนวนเงิน <span className="font-semibold text-[color:var(--color-ink)]">{formatBaht(totalBase, { decimals: true })}</span> · มูลค่าภาษี{" "}
            <span className="font-semibold text-[color:var(--color-ink)]">{formatBaht(totalWht, { decimals: true })}</span>
          </span>
        }
        page={page}
        pageCount={Math.max(1, Math.ceil(total / pageSize))}
        pageSize={pageSize}
        total={total}
        emptyText={`ไม่มีรายการในช่วงที่เลือก`}
        rowTestId={(r) => `wht-row-${r.certId}`}
      />

      {markFiledModal}
    </div>
  );
}
