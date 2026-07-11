// ตัวช่วย render หน้า route ฝั่งรายจ่าย (list + create + detail) — ใช้ร่วมทุก slug
// (purchase/expense/po/asset-buy) เพื่อไม่ซ้ำโค้ด. service+actions+components เสร็จแล้ว
import { notFound } from "next/navigation";
import type { AccountDocType } from "@prisma/client";
import { loadAccountSystem } from "./guard";
import { getSettings, listContacts, DOC_LABEL } from "./service";
import {
  listExpenseDocs,
  getExpenseDoc,
  listExpenseAccounts,
  listAssetAccounts,
  tabsFor,
  EXP_DOC_LABEL,
  type ExpTab,
} from "./expense";
import { ExpenseList, ExpenseDetail } from "./expense-ui";
import ExpenseEditor from "./ExpenseEditor";

type Variant = "purchase" | "expense" | "po" | "asset";

// docType → slug ของ route (ตรงกับ ROUTE_FOR ใน expense-actions)
const SLUG_OF: Partial<Record<AccountDocType, string>> = {
  PURCHASE: "purchase",
  EXPENSE: "expense",
  PURCHASE_ORDER: "po",
  ASSET_PURCHASE_ORDER: "po",
  ASSET_PURCHASE: "asset-buy",
  PURCHASE_TAX_INVOICE: "asset-buy",
};

function labelOf(docType: AccountDocType): string {
  return EXP_DOC_LABEL[docType] ?? DOC_LABEL[docType] ?? docType;
}

async function optionsFor(variant: Variant, systemId: string) {
  if (variant === "expense") return listExpenseAccounts(systemId);
  if (variant === "asset") return listAssetAccounts(systemId);
  return [];
}

// หน้า list + ฟอร์มสร้าง
export async function ExpenseListPage(props: {
  systemId: string;
  docType: AccountDocType;
  variant: Variant;
  tab?: string;
  err?: string;
}) {
  const { systemId, docType, variant } = props;
  const { tenantId } = await loadAccountSystem(systemId);
  const base = `/app/sys/${systemId}/account`;
  const tabs = tabsFor(docType);
  const tab = (props.tab ?? tabs[0]?.key ?? "recent") as ExpTab;
  const [rows, settings, contacts, accountOptions] = await Promise.all([
    listExpenseDocs(tenantId, systemId, docType, { tab }),
    getSettings(tenantId, systemId),
    listContacts(tenantId, systemId),
    optionsFor(variant, systemId),
  ]);
  const label = labelOf(docType);
  const slug = SLUG_OF[docType] ?? "purchase";
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <a href={base} className="text-sm text-[color:var(--color-muted)]">← บัญชี</a>
        <h1 className="mt-1 text-2xl font-semibold">{label}</h1>
      </div>
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
      />
      <ExpenseList
        rows={rows}
        tabs={tabs}
        activeTab={tab}
        tabHref={(k) => `?tab=${k}`}
        itemHref={(id) => `${base}/${slug}/${id}`}
        emptyText={`ยังไม่มี${label}`}
      />
    </div>
  );
}

// หน้า detail
export async function ExpenseDetailPage(props: {
  systemId: string;
  docId: string;
  slug: string;
  err?: string;
}) {
  const { systemId, docId, slug } = props;
  const { tenantId } = await loadAccountSystem(systemId);
  const doc = await getExpenseDoc(tenantId, systemId, docId);
  if (!doc) notFound();
  const base = `/app/sys/${systemId}/account`;
  const label = labelOf(doc.docType);
  return (
    <div className="max-w-3xl">
      <ExpenseDetail
        doc={doc}
        systemId={systemId}
        label={label}
        editHref={`${base}/${slug}/${docId}?edit=1`}
        listHref={`${base}/${slug}`}
        err={props.err}
      />
    </div>
  );
}
