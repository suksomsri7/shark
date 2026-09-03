// รายการใบปรับต้นทุนสินค้า CA (WO 4.3 · DESIGN-SPEC-V2 §8.4) — ใช้ DocListPage เหมือนเอกสารชนิดอื่น
import { requireAccountPage } from "@/lib/modules/account/guard";
import { listContacts, computeListTabCounts } from "@/lib/modules/account/service";
import { listGoodsIssuePaged, qtyText, baht } from "@/lib/modules/account/product";
import { LIST_TABS, tabToFilter, activeTabKey, presetRangeBkk } from "@/lib/modules/account/list-tabs";
import { DocListPage } from "@/components/account-v2/DocListPage";
import { DateText } from "@/lib/ui/DateText";
import { StatusChip } from "@/components/ui/StatusChip";
import type { DateRangePreset } from "@/components/account-v2/ListFilters";

type Row = {
  id: string;
  docNo: string | null;
  issueDate: Date;
  status: string;
  note: string | null;
  adjustReason?: string | null;
  grandTotal?: number;
  contact: { id: string; name: string } | null;
  lines: { qty: unknown }[];
};

function CaStatusChip({ status }: { status: string }) {
  return (
    <StatusChip
      value={status}
      map={{ ISSUED: "อนุมัติแล้ว", DRAFT: "ร่าง", CANCELLED: "ยกเลิก", VOIDED: "ยกเลิก" }}
      toneOf={(v) => (v === "ISSUED" ? "strong" : v === "CANCELLED" || v === "VOIDED" ? "danger" : "muted")}
    />
  );
}

export default async function CostAdjustmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; q?: string; page?: string; size?: string; preset?: string; from?: string; to?: string; ok?: string; err?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await requireAccountPage(id, "account.product.manage");
  const base = `/app/sys/${id}/account`;
  const pathname = `${base}/cost-adjustment`;

  const docType = "COST_ADJUSTMENT" as const;
  const tabDefs = LIST_TABS[docType] ?? [];
  const tab = activeTabKey(docType, sp.tab);
  const filter = tabToFilter(docType, tab);
  const preset = (sp.preset as DateRangePreset | undefined) ?? "this_year";
  const range = preset === "custom" ? { from: sp.from, to: sp.to } : presetRangeBkk(preset);
  const page = Math.max(Number.parseInt(sp.page ?? "1", 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(sp.size ?? "20", 10) || 20, 1), 100);
  const q = (sp.q ?? "").trim();

  const [result, tabCounts, contacts] = await Promise.all([
    listGoodsIssuePaged(tenantId, systemId, {
      docType,
      ...filter,
      from: range.from,
      to: range.to,
      q: q || undefined,
      page,
      pageSize,
    }),
    computeListTabCounts(tenantId, systemId, docType, tabDefs, { q: q || undefined, from: range.from, to: range.to }),
    listContacts(tenantId, systemId),
  ]);

  return (
    <DocListPage<Row>
      testId="list-cost-adjustment"
      base={base}
      pathname={pathname}
      title="ใบปรับต้นทุนสินค้า"
      mobileSummary={<>{tabCounts.all ?? 0} ใบ</>}
      searchParams={sp}
      tabs={tabDefs}
      tabCounts={tabCounts}
      activeTab={tab}
      filters={{ preset, from: sp.from, to: sp.to, q }}
      contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
      cols={[
        { key: "docNo", header: "เลขที่", render: (r) => r.docNo ?? "(ร่าง)" },
        { key: "issueDate", header: "วันที่", render: (r) => <DateText value={r.issueDate} /> },
        { key: "reason", header: "เหตุผลการปรับ", render: (r) => r.adjustReason ?? r.note ?? "—" },
        { key: "qty", header: "จำนวนที่กระทบ", align: "right", render: (r) => qtyText(r.lines.reduce((s, l) => s + Number(l.qty), 0)) },
        { key: "amount", header: "ผลต่าง", align: "right", render: (r) => `฿${baht(r.grandTotal ?? 0)}` },
        { key: "status", header: "สถานะ", render: (r) => <CaStatusChip status={r.status} /> },
      ]}
      rows={result.rows as unknown as Row[]}
      mobileTitle={(r) => r.docNo ?? "(ร่าง)"}
      mobileStatus={(r) => <CaStatusChip status={r.status} />}
      mobileSubtitle={(r) => r.adjustReason ?? r.note ?? "—"}
      mobileTrailing={(r) => <span className="tabular-nums">฿{baht(r.grandTotal ?? 0)}</span>}
      mobileDateLine={(r) => <>วันที่ <DateText value={r.issueDate} /></>}
      rowTestId={(r) => `row-${r.docNo ?? r.id}`}
      page={result.page}
      pageCount={result.pageCount}
      pageSize={result.pageSize}
      total={result.total}
      emptyText="ยังไม่มีใบปรับต้นทุนสินค้าในช่วงที่เลือก — กด “+ สร้างใบปรับต้นทุนสินค้า” เพื่อเริ่ม"
      errorText={sp.err}
      createLabel="ใบปรับต้นทุนสินค้า"
      createHref={`${pathname}/new`}
    />
  );
}
