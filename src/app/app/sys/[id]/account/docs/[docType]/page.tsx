import { notFound } from "next/navigation";
import type { AccountDocType } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import {
  listDocumentsPaged,
  listContacts,
  getSettings,
  computeListTabCounts,
  DOC_LABEL,
  isVisibleDocType,
} from "@/lib/modules/account/service";
import { LIST_TABS, tabToFilter, activeTabKey, presetRangeBkk } from "@/lib/modules/account/list-tabs";
import {
  docNoCol,
  contactCol,
  issueDateCol,
  dueDateCol,
  validUntilCol,
  netCol,
  outstandingCol,
  subTotalCol,
  vatCol,
  paymentChannelCol,
  statusCol,
  type ListRow,
} from "@/lib/modules/account/list-columns";
import DocEditor from "@/lib/modules/account/DocEditor";
import { DocListPage } from "@/components/account-v2/DocListPage";
import type { RowActionItem } from "@/components/account-v2/RowActions";
import type { DocColumn } from "@/components/account-v2/DocTable";
import type { DateRangePreset } from "@/components/account-v2/ListFilters";

// หน้ารายการเอกสารฝั่งรายรับทั้ง 8 ชนิด (QT/IV/RE/TX/DR/CN/DN/BN) — WO 1.1 ผ่าน DocListPage กลาง
// mockup อ้างอิง: f3-invoice-list.png (เดสก์ท็อป) + f3-invoice-list-menu.png (เมนู "ทำรายการ ▾") +
// f13-m-invoice-list.png (มือถือ) — ground truth ของ INVOICE เท่านั้น (ชนิดอื่นยึด DESIGN-SPEC-V2.md §5.1/§3)

// §5.1 คอลัมน์เฉพาะชนิด
function columnsFor(dt: AccountDocType, base: string, refDocNo: Map<string, string | null>): DocColumn<ListRow>[] {
  const doc = docNoCol((r) => `${base}/docs/${dt}/${r.id}`, "list");
  switch (dt) {
    case "QUOTATION":
      return [doc, contactCol, issueDateCol, validUntilCol, netCol, statusCol];
    case "RECEIPT":
      return [
        doc,
        contactCol,
        issueDateCol,
        netCol,
        paymentChannelCol,
        {
          key: "taxInvoice",
          header: "ใบกำกับ",
          render: (r) => refDocNo.get(r.id) ?? "—",
        },
        statusCol,
      ];
    case "TAX_INVOICE":
      return [
        doc,
        contactCol,
        issueDateCol,
        {
          key: "ref",
          header: "อ้างอิง",
          render: (r) => (r.sourceDocId ? (refDocNo.get(r.sourceDocId) ?? "—") : "—"),
        },
        subTotalCol,
        vatCol,
        statusCol,
      ];
    case "INVOICE":
    case "BILLING_NOTE":
    case "DEPOSIT_RECEIPT":
      return [doc, contactCol, issueDateCol, dueDateCol, netCol, outstandingCol, statusCol];
    default: // CREDIT_NOTE / DEBIT_NOTE — ไม่ได้ระบุคอลัมน์เฉพาะใน §5.1 ใช้ชุดฐาน + ค้างชำระ
      return [doc, contactCol, issueDateCol, netCol, outstandingCol, statusCol];
  }
}

// §3 "ทำรายการ ▾" ต่อชนิด — ลิงก์ที่ยังไม่มีปลายทางจริง → หน้ารายละเอียด + ป้าย "เร็ว ๆ นี้" (ห้ามลิงก์ตาย)
function rowActionsFor(dt: AccountDocType, base: string, r: ListRow): RowActionItem[] {
  const detail = `${base}/docs/${dt}/${r.id}`;
  const soon = (label: string): RowActionItem => ({ label: `${label} (เร็ว ๆ นี้)`, href: detail });
  const common: RowActionItem[] = [{ label: "พิมพ์ PDF", href: `${base}/print/${r.id}` }];
  switch (dt) {
    case "QUOTATION":
      return [soon("ลูกค้ายอมรับ"), soon("ปฏิเสธ"), soon("ออกใบแจ้งหนี้"), ...common, soon("แก้ไข"), soon("ยกเลิก")];
    case "INVOICE":
      return [soon("รับชำระ"), soon("ออกใบเสร็จ"), soon("ออกใบกำกับ"), soon("ใส่ในใบวางบิล"), ...common, soon("ยกเลิก")];
    case "RECEIPT":
      return [soon("ออกใบกำกับ"), ...common, soon("ยกเลิก(กลับรายการ)")];
    case "TAX_INVOICE":
      return [{ label: "พิมพ์ต้นฉบับ", href: `${base}/print/${r.id}` }, { label: "พิมพ์สำเนา", href: `${base}/print/${r.id}?copy=1` }, soon("ออกใบลดหนี้"), soon("ยกเลิก")];
    case "DEPOSIT_RECEIPT":
      return [soon("รับชำระ"), soon("ออกใบกำกับ"), soon("หักในใบแจ้งหนี้"), ...common, soon("ยกเลิก")];
    case "BILLING_NOTE":
      return [soon("รับชำระ (กระจายเข้าใบแจ้งหนี้ลูก)"), ...common, soon("ยกเลิก")];
    default: // CREDIT_NOTE / DEBIT_NOTE
      return [soon("คืนเงิน/รับชำระ"), ...common, soon("ยกเลิก")];
  }
}

// §3 bulk ต่อชนิด — ยังไม่ทำจริง (WO 1.1 = โครง UI) → disabled + title อธิบาย ไม่ผูก action จริง
function bulkFor(dt: AccountDocType) {
  const soon = { disabled: true, disabledTitle: "เร็ว ๆ นี้" };
  if (dt === "INVOICE") return [{ label: "ออกใบวางบิลรวม", ...soon }, { label: "พิมพ์", ...soon }, { label: "ส่งอีเมล", ...soon }];
  if (dt === "QUOTATION") return [{ label: "พิมพ์", ...soon }, { label: "ส่งอีเมล", ...soon }, { label: "ยกเลิก", danger: true, ...soon }];
  return [{ label: "พิมพ์", ...soon }, { label: "ส่งอีเมล", ...soon }];
}

export default async function DocTypeListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docType: string }>;
  searchParams: Promise<{
    tab?: string;
    q?: string;
    page?: string;
    size?: string;
    contact?: string;
    preset?: string;
    from?: string;
    to?: string;
    sort?: string;
    dir?: string;
    err?: string;
  }>;
}) {
  const { id, docType } = await params;
  const sp = await searchParams;
  if (!(docType in DOC_LABEL)) notFound();
  const dt = docType as AccountDocType;
  if (!isVisibleDocType(dt)) notFound();
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.doc.view" });

  const tabDefs = LIST_TABS[dt] ?? [];
  const tab = activeTabKey(dt, sp.tab);
  const filter = tabToFilter(dt, tab);
  const preset = (sp.preset as DateRangePreset | undefined) ?? "this_year";
  const range = preset === "custom" ? { from: sp.from, to: sp.to } : presetRangeBkk(preset);
  const page = Math.max(Number.parseInt(sp.page ?? "1", 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(sp.size ?? "20", 10) || 20, 1), 100);
  const q = (sp.q ?? "").trim();

  const [result, tabCounts, contacts, settings] = await Promise.all([
    listDocumentsPaged(tenantId, systemId, {
      docType: dt,
      ...filter,
      contactId: sp.contact || undefined,
      from: range.from,
      to: range.to,
      q: q || undefined,
      page,
      pageSize,
      sort: sp.sort === "docNo" || sp.sort === "amount" || sp.sort === "issueDate" ? sp.sort : "issueDate",
    }),
    computeListTabCounts(tenantId, systemId, dt, tabDefs, {
      q: q || undefined,
      contactId: sp.contact || undefined,
      from: range.from,
      to: range.to,
    }),
    listContacts(tenantId, systemId),
    getSettings(tenantId, systemId),
  ]);

  if (dt === "TAX_INVOICE" && !settings.vatRegistered) notFound();

  const base = `/app/sys/${id}/account`;
  const pathname = `${base}/docs/${dt}`;
  const label = DOC_LABEL[dt] ?? dt;
  const canCreate = dt !== "RECEIPT" && dt !== "TAX_INVOICE"; // เกิดจากการแปลงเท่านั้น (§5.1)

  // อ้างอิงข้าม docType (RE↔TX) — ดึงเฉพาะ docNo ของแถวหน้านี้ (bounded ด้วย pageSize) ไม่ใช่ N+1 ต่อแถว
  const refDocNo = new Map<string, string | null>();
  if (dt === "RECEIPT" && result.rows.length) {
    const tx = await prisma.accountDocument.findMany({
      where: { tenantId, systemId, docType: "TAX_INVOICE", sourceDocId: { in: result.rows.map((r) => r.id) } },
      select: { sourceDocId: true, docNo: true },
    });
    for (const t of tx) if (t.sourceDocId) refDocNo.set(t.sourceDocId, t.docNo);
  }
  if (dt === "TAX_INVOICE" && result.rows.length) {
    const srcIds = result.rows.map((r) => r.sourceDocId).filter((v): v is string => !!v);
    if (srcIds.length) {
      const src = await prisma.accountDocument.findMany({ where: { id: { in: srcIds } }, select: { id: true, docNo: true } });
      for (const s of src) refDocNo.set(s.id, s.docNo);
    }
  }

  return (
    <DocListPage<ListRow>
      testId="list-docs"
      base={base}
      pathname={pathname}
      title={label}
      searchParams={sp}
      tabs={tabDefs}
      tabCounts={tabCounts}
      activeTab={tab}
      filters={{ preset, from: sp.from, to: sp.to, contactId: sp.contact, q }}
      contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
      cols={columnsFor(dt, base, refDocNo)}
      rows={result.rows}
      rowActionsFor={(r) => rowActionsFor(dt, base, r)}
      bulkActions={bulkFor(dt)}
      mobileTitle={(r) => r.docNo ?? "(ร่าง)"}
      mobileSubtitle={(r) => r.contact?.name}
      mobileTrailing={(r) => (
        <span className="tabular-nums">
          {(r.grandTotal / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
        </span>
      )}
      rowTestId={(r) => `row-${r.docNo ?? r.id}`}
      footerTotalSatang={result.rows.reduce((s, r) => s + r.grandTotal, 0)}
      page={result.page}
      pageCount={result.pageCount}
      pageSize={result.pageSize}
      total={result.total}
      emptyText={`ไม่พบ${label}ในช่วงวันที่ที่เลือก`}
      errorText={sp.err === "empty" ? "ต้องมีรายการอย่างน้อย 1 รายการ" : sp.err}
      createLabel={canCreate ? label : undefined}
      createForm={
        canCreate ? (
          <DocEditor
            systemId={systemId}
            docType={dt}
            docLabel={label}
            contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
            vatRateBp={settings.vatRateBp}
            vatRegistered={settings.vatRegistered}
            defaultVatTiming={settings.taxPointBasis}
          />
        ) : undefined
      }
    />
  );
}
