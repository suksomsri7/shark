// ตัวช่วย render หน้า route ฝั่งรายจ่าย (list + create + detail) — ใช้ร่วมทุก slug
// (purchase/expense/po/asset-buy) เพื่อไม่ซ้ำโค้ด. service+actions+components เสร็จแล้ว
import type { AccountDocType } from "@prisma/client";
import { loadAccountSystem } from "./guard";
import { getSettings, listContacts, computeListTabCounts, sumOutstandingForFilter, DOC_LABEL, parseDocSort } from "./service";
import {
  listExpenseDocsPaged,
  listExpenseAccounts,
  listAssetAccounts,
  listDeductiblePaidDeposits,
  EXP_DOC_LABEL,
  EXP_ROUTE,
} from "./expense";
import { LIST_TABS, tabToFilter, activeTabKey, presetRangeBkk } from "./list-tabs";
import {
  docNoCol,
  vendorCol,
  issueDateCol,
  dueDateExpenseCol,
  netCol,
  payableCol,
  vatCol,
  invoiceReceivedCol,
  statusCol,
  dateLineNode,
  StatusCell,
  type ListRow,
} from "./list-columns";
import ExpenseEditor from "./ExpenseEditor";
import { canCreateDirect, editorDetailPath, editorEditPath, editorNewPath, isAdjustType } from "./doc-editor-config";
import { isGroupDocType } from "./group";
import { accountCan } from "./access";
import type { AccountPermFlags } from "./guard";
import { issueExpenseDocAction, voidExpenseDocAction, submitApprovalAction, approvePOAction, convertPOAction } from "./expense-actions";
import { cancelDraftFormAction } from "./undo-stack";
import { readPageSize, readSortDir } from "@/components/account-v2/url";
import { DocListPage } from "@/components/account-v2/DocListPage";
import { DocDetailPage } from "@/components/account-v2/DocDetailPage";
import { MoneyText } from "@/components/ui/MoneyText";
import type { RowActionItem, RowActionsDangerItem } from "@/components/account-v2/RowActions";
import type { DocColumn } from "@/components/account-v2/DocTable";
import type { DateRangePreset } from "@/components/account-v2/ListFilters";

type Variant = "purchase" | "expense" | "po" | "asset";

// docType ฝั่งจ่ายที่มีความหมาย "ค้างจ่าย" (บรรทัดสรุปมือถือ f13) — PO/APO/PTX ไม่มี (ยังไม่ตั้งเป็นเจ้าหนี้)
const DOC_TYPES_WITH_PAYABLE: readonly AccountDocType[] = ["PURCHASE", "EXPENSE", "ASSET_PURCHASE", "COMBINED_PAYMENT"];

// docType → slug ของ route — WO 1.2: มาจากทะเบียนกลาง EXPENSE_LIST_TYPES (expense.ts) ที่เดียว
const SLUG_OF = EXP_ROUTE;

function labelOf(docType: AccountDocType): string {
  return EXP_DOC_LABEL[docType] ?? DOC_LABEL[docType] ?? docType;
}

async function optionsFor(variant: Variant, systemId: string) {
  if (variant === "expense") return listExpenseAccounts(systemId);
  if (variant === "asset") return listAssetAccounts(systemId);
  return [];
}

// §5.1 คอลัมน์ฝั่งจ่าย ("PUR/EXP/AP/DP/CP" / "PO" / "PTX")
function columnsFor(docType: AccountDocType, base: string, slug: string): DocColumn<ListRow>[] {
  const doc = docNoCol((r) => `${base}/${slug}/${r.id}`, "list");
  switch (docType) {
    case "PURCHASE_ORDER":
    case "ASSET_PURCHASE_ORDER":
      return [doc, vendorCol, issueDateCol, netCol, statusCol];
    case "PURCHASE_TAX_INVOICE":
      return [doc, vendorCol, issueDateCol, netCol, vatCol, statusCol];
    case "ASSET_PURCHASE":
      return [doc, vendorCol, issueDateCol, dueDateExpenseCol, netCol, payableCol, statusCol, invoiceReceivedCol];
    default: // PURCHASE / EXPENSE
      return [doc, vendorCol, issueDateCol, dueDateExpenseCol, netCol, payableCol, statusCol];
  }
}

// §3 "ทำรายการ ▾" ฝั่งรายจ่าย — ACCOUNT-FIX A4: ทุกข้อทำงานจริง · ข้อที่ไม่มีระบบรองรับเอาออก (ไม่มี "เร็ว ๆ นี้")
//   50 ทวิ ออกตอนบันทึกจ่ายที่มีหัก ณ ที่จ่าย (ไม่ใช่ปุ่มแยก) · รับใบกำกับภาษีซื้อทำที่แผงภาษีซื้อของหน้าเอกสาร
const EXP_PAYABLE: readonly AccountDocType[] = ["PURCHASE", "EXPENSE", "ASSET_PURCHASE", "DEPOSIT_PAYMENT", "DEBIT_NOTE_RECEIVED"];
const EXP_CLOSED = new Set(["DRAFT", "VOIDED", "CANCELLED", "REJECTED"]);
function rowActionsFor(docType: AccountDocType, base: string, systemId: string, r: ListRow, perm: AccountPermFlags): RowActionItem[] {
  const detail = editorDetailPath(base, docType, r.id);
  const f = { systemId, docType, id: r.id };
  const isPO = docType === "PURCHASE_ORDER" || docType === "ASSET_PURCHASE_ORDER";
  const items: RowActionItem[] = [{ label: "เปิดเอกสาร", href: detail }];
  if (r.status === "DRAFT") {
    if (perm.create && docType !== "COMBINED_PAYMENT") items.push({ label: "แก้ไข", href: editorEditPath(base, docType, r.id) });
    if (isPO) items.push({ label: "ส่งอนุมัติ", submit: { action: submitApprovalAction, fields: f } });
    else if (perm.issue) items.push({ label: "บันทึก/ตั้งเจ้าหนี้", submit: { action: issueExpenseDocAction, fields: f } });
  }
  if (isPO && r.status === "AWAITING_APPROVAL" && perm.approve) {
    items.push({ label: "อนุมัติ", submit: { action: approvePOAction, fields: f } }, { label: "ไม่อนุมัติ (ใส่เหตุผลที่หน้าเอกสาร)", href: detail });
  }
  if (isPO && r.status === "APPROVED") {
    items.push({ label: docType === "ASSET_PURCHASE_ORDER" ? "แปลงเป็นซื้อสินทรัพย์" : "แปลงเป็นบันทึกซื้อ", submit: { action: convertPOAction, fields: f } });
  }
  const open = r.status === "AWAITING_PAYMENT" || r.status === "PARTIAL";
  if (perm.recordPayment && EXP_PAYABLE.includes(docType) && open) items.push({ label: "บันทึกจ่าย", href: `${detail}?pay=1` });
  if (docType === "COMBINED_PAYMENT" && open && perm.recordPayment) items.push({ label: "บันทึกจ่าย (กระจายให้บิลลูก)", href: detail });
  if (docType === "PURCHASE_TAX_INVOICE" && r.status === "AWAITING_RECEIVE") items.push({ label: "บันทึกรับใบกำกับ", href: `${detail}#input-vat-panel` });
  if (!EXP_CLOSED.has(r.status) && (docType === "PURCHASE" || docType === "EXPENSE")) {
    items.push(
      { label: "บันทึกรับใบลดหนี้", href: `${editorNewPath(base, "CREDIT_NOTE_RECEIVED")}?ref=${r.id}` },
      { label: "บันทึกรับใบเพิ่มหนี้", href: `${editorNewPath(base, "DEBIT_NOTE_RECEIVED")}?ref=${r.id}` },
    );
  }
  items.push({ label: docType === "COMBINED_PAYMENT" ? "พิมพ์ใบสำคัญจ่าย" : "พิมพ์", href: `${base}/print/${r.id}`, sepBefore: true });
  if (canCreateDirect(docType) && !isGroupDocType(docType) && !isAdjustType(docType) && perm.create) {
    items.push({ label: "คัดลอกเป็นร่างใหม่", href: `${editorNewPath(base, docType)}?copy=${r.id}` });
  }
  return items;
}

function rowDangerFor(docType: AccountDocType, systemId: string, r: ListRow, perm: AccountPermFlags): RowActionsDangerItem | undefined {
  const fields = { systemId, docType, id: r.id };
  if (r.status === "DRAFT" && perm.create) {
    return { triggerLabel: "ยกเลิกร่าง", title: "ยกเลิกร่างนี้?", detail: "ร่างจะถูกยกเลิก — เลิกทำได้ภายใน 5 นาทีที่หน้าเอกสาร", confirmLabel: "ยืนยันยกเลิก", action: cancelDraftFormAction, fields };
  }
  if (!EXP_CLOSED.has(r.status) && perm.void) {
    return {
      triggerLabel: "ยกเลิกเอกสาร",
      title: `ยกเลิก ${r.docNo ?? "เอกสารนี้"}?`,
      detail: "เอกสารจะถูกยกเลิก แก้ไขไม่ได้ และต้องออกใหม่เท่านั้น",
      confirmLabel: "ยืนยันยกเลิก",
      action: voidExpenseDocAction,
      fields,
      reasonField: { name: "reason", label: "เหตุผลการยกเลิก", required: true },
    };
  }
  return undefined;
}

// bulk — ACCOUNT-FIX A4: "พิมพ์ที่เลือก" ทำงานจริง (print/batch) · "อนุมัติหลายใบ" ไม่มีระบบรองรับ ⇒ เอาออก
function printSelectionAction(base: string) {
  return { label: "พิมพ์ที่เลือก", hrefTemplate: `${base}/print/batch?ids={ids}` };
}

// WO 1.7 §3 (แถว PUR/EXP/DNR/DP: bulk "จ่ายรวม (→ใบรวมจ่าย)") — เปิดใช้เมื่อเลือกบิลของผู้ขายรายเดียวกัน
// ที่ยังค้างจ่ายทั้งหมด · ใบรวมจ่ายเองไม่มีปุ่มนี้ (กันซ้อนกลุ่มในกลุ่ม)
const COMBINABLE_TYPES: readonly AccountDocType[] = ["PURCHASE", "EXPENSE", "DEBIT_NOTE_RECEIVED", "DEPOSIT_PAYMENT"];
const OPEN_STATUSES = new Set(["AWAITING_PAYMENT", "PARTIAL"]);

function selectionActionsFor(docType: AccountDocType, base: string) {
  if (!COMBINABLE_TYPES.includes(docType)) return [printSelectionAction(base)];
  return [
    printSelectionAction(base),
    {
      label: "จ่ายรวม",
      hrefTemplate: `${base}/combined-payment/new?ids={ids}`,
      requireSameGroup: true,
      sameGroupHint: "ใบรวมจ่าย 1 ใบ = ผู้ขาย 1 ราย — เลือกเฉพาะบิลของผู้ขายรายเดียวกัน",
      requireEligible: true,
      eligibleHint: "เลือกได้เฉพาะบิลที่ยังค้างจ่าย (รอชำระ/ชำระบางส่วน)",
    },
  ];
}

// หน้า list + ฟอร์มสร้าง
export async function ExpenseListPage(props: {
  systemId: string;
  docType: AccountDocType;
  variant: Variant;
  searchParams?: {
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
    pageSize?: string;
  };
  err?: string;
}) {
  const { systemId, docType, variant } = props;
  const sp = props.searchParams ?? {};
  const { tenantId, auth } = await loadAccountSystem(systemId);
  const perm: AccountPermFlags = {
    recordPayment: accountCan(auth, "account.payment.record"),
    approve: accountCan(auth, "account.doc.approve"),
    void: accountCan(auth, "account.doc.void"),
    issue: accountCan(auth, "account.doc.issue"),
    create: accountCan(auth, "account.doc.create"),
  };
  const base = `/app/sys/${systemId}/account`;

  const tabDefs = LIST_TABS[docType] ?? [];
  const tab = activeTabKey(docType, sp.tab);
  const filter = tabToFilter(docType, tab);
  const preset = (sp.preset as DateRangePreset | undefined) ?? "this_year";
  const range = preset === "custom" ? { from: sp.from, to: sp.to } : presetRangeBkk(preset);
  const page = Math.max(Number.parseInt(sp.page ?? "1", 10) || 1, 1);
  // 🔴 10.1 (f3): ค่าเริ่มต้นเป็น 8 ตามเฟรม (ตัวเลือก 8/20/50 — DocListPage.tsx ส่ง pageSizeOptions ตรงกัน)
  const pageSize = readPageSize(sp, 8);
  const sort = parseDocSort(sp.sort);
  const sortDir = readSortDir(sp.dir);
  const q = (sp.q ?? "").trim();

  const [result, tabCounts, settings, contacts, accountOptions, deposits] = await Promise.all([
    listExpenseDocsPaged(tenantId, systemId, {
      docType,
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
    computeListTabCounts(tenantId, systemId, docType, tabDefs, {
      q: q || undefined,
      contactId: sp.contact || undefined,
      from: range.from,
      to: range.to,
    }),
    getSettings(tenantId, systemId),
    listContacts(tenantId, systemId),
    optionsFor(variant, systemId),
    // §5.2 D — เงินมัดจำจ่ายที่ยังหักได้ (ทุกผู้ขาย · ฟอร์มกรองตามผู้ขายที่เลือกเอง)
    docType === "PURCHASE" || docType === "EXPENSE"
      ? listDeductiblePaidDeposits(tenantId, systemId)
      : Promise.resolve([]),
  ]);
  const label = labelOf(docType);
  const slug = SLUG_OF[docType] ?? "purchase";
  const pathname = `${base}/${slug}`;
  const canCreate = docType !== "PURCHASE_TAX_INVOICE"; // รับใบกำกับจากการแปลง/บันทึกรับเท่านั้น
  // WO 1.3: ปุ่ม "+ สร้าง…" ชี้ฟอร์มเต็มหน้า `<slug>/new` (DocEditorV2) — ยกเว้น CNR/DNR ที่ยังต้องอ้างอิงเอกสารต้นทาง (WO 1.6)
  const createHref = canCreate && canCreateDirect(docType) ? `${base}/${slug}/new` : undefined;

  // มือถือ (f13): บรรทัดสรุปใต้ h1 "N ใบ · ค้างจ่าย ฿…" ผูกกับตัวกรองปัจจุบัน
  const hasPayable = DOC_TYPES_WITH_PAYABLE.includes(docType);
  const outstandingSatang = hasPayable
    ? await sumOutstandingForFilter(tenantId, systemId, docType, {
        q: q || undefined,
        contactId: sp.contact || undefined,
        from: range.from,
        to: range.to,
      })
    : 0;
  const mobileSummary = (
    <>
      {tabCounts.all ?? 0} ใบ
      {hasPayable && (
        <>
          {" "}
          · ค้างจ่าย <MoneyText satang={outstandingSatang} decimals />
        </>
      )}
    </>
  );
  const mobileDocNo = docNoCol((r) => `${base}/${slug}/${r.id}`);

  return (
    <DocListPage<ListRow>
      testId="list-expense"
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
      cols={columnsFor(docType, base, slug)}
      rows={result.rows}
      rowActionsFor={(r) => rowActionsFor(docType, base, systemId, r, perm)}
      rowDangerFor={(r) => rowDangerFor(docType, systemId, r, perm)}
      sort={sort}
      sortDir={sortDir}
      selectionActions={selectionActionsFor(docType, base)}
      rowGroupKey={(r) => r.contact?.id ?? ""}
      rowEligible={(r) => OPEN_STATUSES.has(r.status) && r.grandTotal - r.paidTotal > 0}
      mobileTitle={(r) => mobileDocNo.render(r)}
      mobileStatus={(r) => <StatusCell row={r} />}
      mobileSubtitle={(r) => r.contact?.name ?? "—"}
      mobileTrailing={(r) => <MoneyText satang={r.grandTotal} decimals />}
      mobileDateLine={(r) => dateLineNode(r, { dueLabel: "กำหนดชำระ" })}
      rowTestId={(r) => `row-${r.docNo ?? r.id}`}
      footerTotalSatang={result.rows.reduce((s, r) => s + r.grandTotal, 0)}
      page={result.page}
      pageCount={result.pageCount}
      pageSize={result.pageSize}
      pageSizeOptions={[8, 20, 50]}
      total={result.total}
      emptyText={`ไม่พบ${label}ในช่วงวันที่ที่เลือก`}
      errorText={props.err === "empty" ? "ต้องมีรายการอย่างน้อย 1 รายการ" : props.err}
      createLabel={canCreate ? label : undefined}
      createHref={createHref}
      importHref={`${base}/import/documents?side=expense`}
      createForm={
        canCreate && !createHref ? (
          <ExpenseEditor
            systemId={systemId}
            docType={docType}
            docLabel={label}
            variant={variant}
            contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
            accountOptions={accountOptions}
            requireAccount={variant === "expense" || variant === "asset"}
            vatRateBp={settings.vatRateBp}
            vatRegistered={settings.vatRegistered}
            deposits={deposits}
          />
        ) : undefined
      }
    />
  );
}

// หน้า detail — WO 1.5: เนื้อหาจริงอยู่ที่ DocDetailPage (ใช้ร่วมกับฝั่งรายรับทั้งหมด — §5.3)
export async function ExpenseDetailPage(props: {
  systemId: string;
  docId: string;
  slug: string;
  err?: string;
  tab?: string;
  msg?: string;
}) {
  const { systemId, docId } = props;
  const { tenantId } = await loadAccountSystem(systemId);
  return (
    <DocDetailPage
      tenantId={tenantId}
      systemId={systemId}
      docId={docId}
      tab={props.tab}
      err={props.err}
      msg={props.msg}
    />
  );
}
