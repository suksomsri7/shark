import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { listContacts, computeListTabCounts } from "@/lib/modules/account/service";
import {
  listProducts,
  listGoodsMovements,
  listGoodsIssuePaged,
  qtyText,
} from "@/lib/modules/account/product";
import { LIST_TABS, tabToFilter, activeTabKey, presetRangeBkk } from "@/lib/modules/account/list-tabs";
import GoodsIssueEditor from "@/lib/modules/account/GoodsIssueEditor";
import { DocListPage } from "@/components/account-v2/DocListPage";
import { DateText } from "@/lib/ui/DateText";
import { StatusChip } from "@/components/ui/StatusChip";
import Section from "@/components/ui/Section";
import EmptyState from "@/components/ui/EmptyState";
import type { DateRangePreset } from "@/components/account-v2/ListFilters";

// ใบเบิกสินค้า PRR — WO 1.1 §5.1 คอลัมน์: เลขที่ · วันที่ · สาเหตุการเบิก · จำนวนที่เบิก · สถานะ
// ⚠️ "สาเหตุการเบิก" ยังไม่มีฟิลด์เฉพาะในโมเดล (ยังไม่ทำ select ตาม §8.4) — ใช้ `note` เป็นตัวแทนไปก่อน (จดใน wo-notes)
// ⚠️ สถานะ: การสร้างวันนี้ตั้งเป็น ISSUED ทันทีเสมอ (ยังไม่มี workflow ร่าง/อนุมัติจริง) — แท็บร่าง/รออนุมัติจึงว่างเสมอ

function PrrStatusChip({ status }: { status: string }) {
  return (
    <StatusChip
      value={status}
      map={{ ISSUED: "อนุมัติแล้ว", DRAFT: "ร่าง", CANCELLED: "ยกเลิก", VOIDED: "ยกเลิก" }}
      toneOf={(v) => (v === "ISSUED" ? "strong" : v === "CANCELLED" || v === "VOIDED" ? "danger" : "muted")}
    />
  );
}

const fmt = (d: Date) =>
  d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" });

type Row = {
  id: string;
  docNo: string | null;
  issueDate: Date;
  status: string;
  note: string | null;
  contact: { id: string; name: string } | null;
  lines: { qty: unknown }[];
};

export default async function GoodsIssuePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    q?: string;
    page?: string;
    size?: string;
    contact?: string;
    preset?: string;
    from?: string;
    to?: string;
    ok?: string;
    err?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.product.manage" });
  const base = `/app/sys/${id}/account`;
  const pathname = `${base}/goods-issue`;

  const docType = "GOODS_ISSUE" as const;
  const tabDefs = LIST_TABS[docType] ?? [];
  const tab = activeTabKey(docType, sp.tab);
  const filter = tabToFilter(docType, tab);
  const preset = (sp.preset as DateRangePreset | undefined) ?? "this_year";
  const range = preset === "custom" ? { from: sp.from, to: sp.to } : presetRangeBkk(preset);
  const page = Math.max(Number.parseInt(sp.page ?? "1", 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(sp.size ?? "20", 10) || 20, 1), 100);
  const q = (sp.q ?? "").trim();

  const [result, tabCounts, allProducts, contacts, movements] = await Promise.all([
    listGoodsIssuePaged(tenantId, systemId, {
      docType,
      ...filter,
      contactId: sp.contact || undefined,
      from: range.from,
      to: range.to,
      q: q || undefined,
      page,
      pageSize,
    }),
    computeListTabCounts(tenantId, systemId, docType, tabDefs, {
      q: q || undefined,
      contactId: sp.contact || undefined,
      from: range.from,
      to: range.to,
    }),
    listProducts(tenantId, systemId, { type: "GOODS" }),
    listContacts(tenantId, systemId),
    listGoodsMovements(tenantId, systemId, { take: 100 }),
  ]);

  const goods = allProducts.map((p) => ({ id: p.id, name: p.name, sku: p.sku, qtyOnHand: Number(p.qtyOnHand) }));

  type Move = { docNo: string | null; docType: string; issueDate: Date; delta: number };
  const perProduct = new Map<string, Move[]>();
  for (const d of movements) {
    for (const l of d.lines) {
      if (!l.productId) continue;
      const delta = (d.docType === "GOODS_ISSUE" ? -1 : 1) * Number(l.qty);
      const arr = perProduct.get(l.productId) ?? [];
      arr.push({ docNo: d.docNo, docType: d.docType, issueDate: d.issueDate, delta });
      perProduct.set(l.productId, arr);
    }
  }

  const qtySum = (r: Row) => r.lines.reduce((s, l) => s + Number(l.qty), 0);

  return (
    <DocListPage<Row>
      testId="list-goods-issue"
      base={base}
      pathname={pathname}
      title="ใบเบิกสินค้า"
      mobileSummary={<>{tabCounts.all ?? 0} ใบ</>}
      searchParams={sp}
      tabs={tabDefs}
      tabCounts={tabCounts}
      activeTab={tab}
      filters={{ preset, from: sp.from, to: sp.to, contactId: sp.contact, q }}
      contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
      cols={[
        {
          key: "docNo",
          header: "เลขที่",
          render: (r) => (
            <Link
              href={`${pathname}#new`}
              className={r.docNo ? "text-[color:var(--color-accent)] hover:underline" : "text-[color:var(--color-muted)] hover:underline"}
            >
              {r.docNo ?? "(ร่าง)"}
            </Link>
          ),
        },
        { key: "issueDate", header: "วันที่", render: (r) => <DateText value={r.issueDate} /> },
        { key: "reason", header: "สาเหตุการเบิก", render: (r) => r.note ?? "—" },
        { key: "qty", header: "จำนวนที่เบิก", align: "right", render: (r) => qtyText(qtySum(r)) },
        {
          key: "status",
          header: "สถานะ",
          render: (r) => <PrrStatusChip status={r.status} />,
        },
      ]}
      rows={result.rows}
      mobileTitle={(r) => (
        <Link
          href={`${pathname}#new`}
          className={r.docNo ? "text-[color:var(--color-accent)] hover:underline" : "text-[color:var(--color-muted)] hover:underline"}
        >
          {r.docNo ?? "(ร่าง)"}
        </Link>
      )}
      mobileStatus={(r) => <PrrStatusChip status={r.status} />}
      mobileSubtitle={(r) => r.contact?.name ?? r.note ?? "—"}
      mobileTrailing={(r) => <span className="tabular-nums">{qtyText(qtySum(r))}</span>}
      mobileDateLine={(r) => <>วันที่ออก <DateText value={r.issueDate} /></>}
      rowTestId={(r) => `row-${r.docNo ?? r.id}`}
      page={result.page}
      pageCount={result.pageCount}
      pageSize={result.pageSize}
      total={result.total}
      emptyText="ไม่พบใบเบิกสินค้าในช่วงวันที่ที่เลือก — บันทึกใบแรกด้วยปุ่ม + สร้างใบเบิกสินค้า"
      errorText={sp.err}
      createLabel="ใบเบิกสินค้า"
      createForm={
        <GoodsIssueEditor systemId={systemId} products={goods} contacts={contacts.map((c) => ({ id: c.id, name: c.name }))} />
      }
      belowTable={
        <Section title="สต็อกคงเหลือ (สินค้า)">
          {goods.length === 0 ? (
            <EmptyState text="ยังไม่มีสินค้าประเภท “สินค้า” — เพิ่มสินค้าในหน้าจัดการสินค้าก่อน" action={{ href: `${base}/products`, label: "จัดการสินค้า" }} />
          ) : (
            <div className="flex flex-col gap-2">
              {goods.map((p) => {
                const moves = perProduct.get(p.id) ?? [];
                return (
                  <details key={p.id} className="rounded-lg border px-3 py-2 text-sm">
                    <summary className="flex cursor-pointer items-center justify-between gap-2">
                      <span className="font-medium">
                        {p.name}
                        {p.sku && <span className="ml-1 text-xs text-[color:var(--color-muted)]">({p.sku})</span>}
                      </span>
                      <span>คงเหลือ {qtyText(p.qtyOnHand)}</span>
                    </summary>
                    <div className="mt-2 flex flex-col gap-1">
                      {moves.length === 0 ? (
                        <p className="text-xs text-[color:var(--color-muted)]">ยังไม่มีความเคลื่อนไหว</p>
                      ) : (
                        moves.map((m, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-[color:var(--color-muted)]">
                              {m.docNo ?? "—"} · {m.docType === "GOODS_ISSUE" ? "เบิกออก" : "ส่งคืน"} · {fmt(m.issueDate)}
                            </span>
                            <span style={{ color: m.delta < 0 ? "var(--color-danger)" : "var(--color-ink)" }}>
                              {m.delta > 0 ? "+" : ""}
                              {qtyText(m.delta)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </Section>
      }
    />
  );
}
