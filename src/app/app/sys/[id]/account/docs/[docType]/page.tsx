import { notFound } from "next/navigation";
import type { AccountDocType } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import {
  listDocumentsPaged,
  listContacts,
  getSettings,
  computeListTabCounts,
  sumOutstandingForFilter,
  DOC_LABEL,
  isVisibleDocType,
  visibleConvertTargets,
  parseDocSort,
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
  dateLineNode,
  StatusCell,
  type ListRow,
} from "@/lib/modules/account/list-columns";
import DocEditor from "@/lib/modules/account/DocEditor";
import { canCreateDirect, editorDetailPath, editorEditPath, editorNewPath, isAdjustType } from "@/lib/modules/account/doc-editor-config";
import { isGroupDocType } from "@/lib/modules/account/group";
import { accountCan } from "@/lib/modules/account/access";
import type { AccountPermFlags } from "@/lib/modules/account/guard";
import { convertDocumentAction, issueDocumentAction, quotationResponseAction, voidDocumentAction } from "@/lib/modules/account/actions";
import { cancelDraftFormAction } from "@/lib/modules/account/undo-stack";
import { readPageSize, readSortDir } from "@/components/account-v2/url";
import { DocListPage } from "@/components/account-v2/DocListPage";
import { MoneyText } from "@/components/ui/MoneyText";
import type { RowActionItem, RowActionsDangerItem } from "@/components/account-v2/RowActions";
import type { DocColumn } from "@/components/account-v2/DocTable";
import type { DateRangePreset } from "@/components/account-v2/ListFilters";

// docType ที่มีความหมาย "ค้างชำระ" ตาม §5.1 (IV/BN/DR + CN/DN ที่ใช้ชุดคอลัมน์ฐาน+ค้างชำระ)
const DOC_TYPES_WITH_OUTSTANDING: readonly AccountDocType[] = [
  "INVOICE",
  "BILLING_NOTE",
  "DEPOSIT_RECEIPT",
  "CREDIT_NOTE",
  "DEBIT_NOTE",
];

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

// §3 "ทำรายการ ▾" ต่อแถว — ACCOUNT-FIX A4: ทุกข้อทำงานจริง (ส่งฟอร์มไป action เดียวกับหน้าเอกสาร หรือพาไปหน้าที่ทำต่อได้ทันที)
//   ข้อที่ไม่มีระบบรองรับเอาออก (ไม่มี "เร็ว ๆ นี้") · ยกเลิกอยู่ท้ายเมนูพร้อมกล่องยืนยัน+เหตุผล (rowDangerFor)
const PAYABLE: readonly AccountDocType[] = ["INVOICE", "DEPOSIT_RECEIPT", "DEBIT_NOTE"];
const CN_DN_SOURCE: readonly AccountDocType[] = ["INVOICE", "RECEIPT", "TAX_INVOICE"];
const CLOSED = new Set(["DRAFT", "VOIDED", "CANCELLED", "REJECTED"]);
function rowActionsFor(
  dt: AccountDocType,
  base: string,
  systemId: string,
  r: ListRow,
  ctx: { perm: AccountPermFlags; vatRegistered: boolean },
): RowActionItem[] {
  const detail = editorDetailPath(base, dt, r.id);
  const f = { systemId, docType: dt, id: r.id };
  const items: RowActionItem[] = [{ label: "เปิดเอกสาร", href: detail }];
  if (r.status === "DRAFT") {
    if (ctx.perm.create) items.push({ label: "แก้ไข", href: editorEditPath(base, dt, r.id) });
    if (ctx.perm.issue) items.push({ label: "ออกเอกสาร", submit: { action: issueDocumentAction, fields: f } });
    items.push({ label: "พิมพ์ร่าง", href: `${base}/print/${r.id}` });
    return items;
  }
  if (dt === "QUOTATION" && r.status === "AWAITING_ACCEPT") {
    items.push(
      { label: "ลูกค้ายอมรับ", submit: { action: quotationResponseAction, fields: { ...f, accepted: "1" } } },
      { label: "ลูกค้าปฏิเสธ", submit: { action: quotationResponseAction, fields: { ...f, accepted: "0" } } },
    );
  }
  if (!CLOSED.has(r.status)) {
    const open = r.status === "AWAITING_PAYMENT" || r.status === "PARTIAL";
    if (ctx.perm.recordPayment && PAYABLE.includes(dt) && open) items.push({ label: "รับชำระ", href: `${detail}?pay=1` });
    if (ctx.perm.recordPayment && dt === "BILLING_NOTE" && open) items.push({ label: "รับชำระ (กระจายเข้าใบแจ้งหนี้)", href: detail });
    if (dt !== "QUOTATION" || r.status === "ACCEPTED") {
      for (const t of visibleConvertTargets(dt, ctx.vatRegistered)) {
        if (t === "CREDIT_NOTE" || t === "DEBIT_NOTE") continue;
        items.push({
          label: t === "TAX_INVOICE" ? "ออกใบกำกับภาษี" : `แปลงเป็น${DOC_LABEL[t] ?? t}`,
          submit: { action: convertDocumentAction, fields: { ...f, toDocType: t } },
        });
      }
    }
    if (CN_DN_SOURCE.includes(dt)) {
      items.push(
        { label: "ออกใบลดหนี้", href: `${editorNewPath(base, "CREDIT_NOTE")}?ref=${r.id}` },
        { label: "ออกใบเพิ่มหนี้", href: `${editorNewPath(base, "DEBIT_NOTE")}?ref=${r.id}` },
      );
    }
    if (dt === "INVOICE" && open) items.push({ label: "ใส่ในใบวางบิล", href: `${editorNewPath(base, "BILLING_NOTE")}?ids=${r.id}` });
  }
  items.push({ label: "พิมพ์", href: `${base}/print/${r.id}`, sepBefore: true });
  if (canCreateDirect(dt) && !isGroupDocType(dt) && !isAdjustType(dt) && ctx.perm.create) {
    items.push({ label: "คัดลอกเป็นร่างใหม่", href: `${editorNewPath(base, dt)}?copy=${r.id}` });
  }
  return items;
}

function rowDangerFor(dt: AccountDocType, systemId: string, r: ListRow, perm: AccountPermFlags): RowActionsDangerItem | undefined {
  const fields = { systemId, docType: dt, id: r.id };
  if (r.status === "DRAFT" && perm.create) {
    return { triggerLabel: "ยกเลิกร่าง", title: "ยกเลิกร่างนี้?", detail: "ร่างจะถูกยกเลิก — เลิกทำได้ภายใน 5 นาทีที่หน้าเอกสาร", confirmLabel: "ยืนยันยกเลิก", action: cancelDraftFormAction, fields };
  }
  if (!CLOSED.has(r.status) && perm.void) {
    return {
      triggerLabel: "ยกเลิกเอกสาร",
      title: `ยกเลิก ${r.docNo ?? "เอกสารนี้"}?`,
      detail: "เอกสารจะถูกยกเลิก แก้ไขไม่ได้ และต้องออกใหม่เท่านั้น",
      confirmLabel: "ยืนยันยกเลิก",
      action: voidDocumentAction,
      fields,
      reasonField: { name: "reason", label: "เหตุผลการยกเลิก", required: true },
    };
  }
  return undefined;
}

// §3 bulk — ACCOUNT-FIX A4: "พิมพ์ที่เลือก" = ทุกใบที่ติ๊กในหน้าเดียว (print/batch บันทึกประวัติพิมพ์ทีละใบ)
//   ส่งอีเมล/ยกเลิกหลายใบ ไม่มีระบบรองรับ ⇒ เอาออก (ไม่มีปุ่ม "เร็ว ๆ นี้" ค้าง)
function printSelectionAction(base: string) {
  return { label: "พิมพ์ที่เลือก", hrefTemplate: `${base}/print/batch?ids={ids}` };
}

// WO 1.7 §5.2 K + f3-invoice-list-menu.png — ปุ่ม bulk ที่ใช้ id ที่ติ๊กไว้จริง
// เปิดใช้เมื่อ: เลือกใบแจ้งหนี้ของ "ลูกค้ารายเดียวกัน" ทั้งหมด และทุกใบยังค้างชำระ (รอชำระ/ชำระบางส่วน)
function selectionActionsFor(dt: AccountDocType, base: string) {
  if (dt !== "INVOICE") return [printSelectionAction(base)];
  return [
    printSelectionAction(base),
    {
      label: "ออกใบวางบิลรวม",
      hrefTemplate: `${base}/docs/BILLING_NOTE/new?ids={ids}`,
      requireSameGroup: true,
      sameGroupHint: "ใบวางบิลรวม 1 ใบ = ลูกค้า 1 ราย — เลือกเฉพาะใบของลูกค้ารายเดียวกัน",
      requireEligible: true,
      eligibleHint: "เลือกได้เฉพาะใบแจ้งหนี้ที่ยังค้างชำระ (รอชำระ/ชำระบางส่วน)",
    },
  ];
}

const OPEN_STATUSES = new Set(["AWAITING_PAYMENT", "PARTIAL"]);

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
    pageSize?: string;
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
  const { tenantId, systemId, auth } = await loadAccountSystem(id, { can: "account.doc.view" });
  // ACCOUNT-FIX A4 — ซ่อนข้อในเมนูที่ผู้ใช้ไม่มีสิทธิ์ (คิดจาก auth ที่โหลดแล้ว ไม่เพิ่ม query) · action ตรวจสิทธิ์ซ้ำเสมอ
  const perm: AccountPermFlags = {
    recordPayment: accountCan(auth, "account.payment.record"),
    approve: accountCan(auth, "account.doc.approve"),
    void: accountCan(auth, "account.doc.void"),
    issue: accountCan(auth, "account.doc.issue"),
    create: accountCan(auth, "account.doc.create"),
  };

  const tabDefs = LIST_TABS[dt] ?? [];
  const tab = activeTabKey(dt, sp.tab);
  const filter = tabToFilter(dt, tab);
  const preset = (sp.preset as DateRangePreset | undefined) ?? "this_year";
  const range = preset === "custom" ? { from: sp.from, to: sp.to } : presetRangeBkk(preset);
  const page = Math.max(Number.parseInt(sp.page ?? "1", 10) || 1, 1);
  // 🔴 10.1 (f3): ค่าเริ่มต้นเป็น 8 ตามเฟรม (ตัวเลือก 8/20/50 — DocListPage.tsx ส่ง pageSizeOptions ตรงกัน)
  const pageSize = readPageSize(sp, 8);
  const sort = parseDocSort(sp.sort);
  const sortDir = readSortDir(sp.dir);
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
      sort,
      sortDir,
      skipStatusCounts: true, // แท็บนับด้วย computeListTabCounts ด้านล่าง (ตัวกรองเดียวกัน)
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
  // WO 1.3: ปุ่ม "+ สร้าง…" ชี้ฟอร์มเต็มหน้า `<route>/new` (DocEditorV2)
  // ยกเว้นชนิดที่ยัง "สร้างตรง ๆ ไม่ได้" ตาม doc-editor-config (CN/DN → wizard 2 ขั้น WO 1.6)
  //   → ชนิดเหล่านั้นคงฟอร์มเดิมแบบซ่อนหลังปุ่ม (#new) ไว้ก่อน ไม่งั้นผู้ใช้จะสร้างไม่ได้เลย
  const createHref = canCreate && canCreateDirect(dt) ? `${base}/docs/${dt}/new` : undefined;

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

  // มือถือ (f13): บรรทัดสรุปใต้ h1 "N ใบ · ค้างรับ ฿…" — ค้างรับผูกกับตัวกรองวันที่/ผู้ติดต่อ/ค้นหาปัจจุบัน (ไม่ใช่ยอดรวมทั้งระบบ)
  const hasOutstanding = DOC_TYPES_WITH_OUTSTANDING.includes(dt);
  const outstandingSatang = hasOutstanding
    ? await sumOutstandingForFilter(tenantId, systemId, dt, {
        q: q || undefined,
        contactId: sp.contact || undefined,
        from: range.from,
        to: range.to,
      })
    : 0;
  const mobileSummary = (
    <>
      {tabCounts.all ?? 0} ใบ
      {hasOutstanding && (
        <>
          {" "}
          · ค้างรับ <MoneyText satang={outstandingSatang} decimals />
        </>
      )}
    </>
  );
  const mobileDocNo = docNoCol((r) => `${base}/docs/${dt}/${r.id}`);

  return (
    <DocListPage<ListRow>
      testId="list-docs"
      base={base}
      pathname={pathname}
      title={label}
      mobileSummary={mobileSummary}
      searchParams={sp}
      tabs={tabDefs}
      tabCounts={tabCounts}
      activeTab={tab}
      filters={{ preset, from: sp.from, to: sp.to, contactId: sp.contact, q }}
      contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
      cols={columnsFor(dt, base, refDocNo)}
      rows={result.rows}
      rowActionsFor={(r) => rowActionsFor(dt, base, systemId, r, { perm, vatRegistered: settings.vatRegistered })}
      rowDangerFor={(r) => rowDangerFor(dt, systemId, r, perm)}
      sort={sort}
      sortDir={sortDir}
      selectionActions={selectionActionsFor(dt, base)}
      rowGroupKey={(r) => r.contact?.id ?? ""}
      rowEligible={(r) => OPEN_STATUSES.has(r.status) && r.grandTotal - r.paidTotal > 0}
      mobileTitle={(r) => mobileDocNo.render(r)}
      mobileStatus={(r) => <StatusCell row={r} />}
      mobileSubtitle={(r) => r.contact?.name ?? "—"}
      mobileTrailing={(r) => <MoneyText satang={r.grandTotal} decimals />}
      mobileDateLine={(r) => dateLineNode(r)}
      rowTestId={(r) => `row-${r.docNo ?? r.id}`}
      footerTotalSatang={result.rows.reduce((s, r) => s + r.grandTotal, 0)}
      page={result.page}
      pageCount={result.pageCount}
      pageSize={result.pageSize}
      pageSizeOptions={[8, 20, 50]}
      total={result.total}
      emptyText={`ไม่พบ${label}ในช่วงวันที่ที่เลือก`}
      errorText={sp.err === "empty" ? "ต้องมีรายการอย่างน้อย 1 รายการ" : sp.err}
      createLabel={canCreate ? label : undefined}
      createHref={createHref}
      importHref={`${base}/import/documents?side=revenue`}
      createForm={
        canCreate && !createHref ? (
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
