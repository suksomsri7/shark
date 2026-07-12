import { notFound } from "next/navigation";
import type { AccountDocType } from "@prisma/client";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import {
  listDocuments,
  listContacts,
  getSettings,
  DOC_LABEL,
  isOverdue,
  isVisibleDocType,
} from "@/lib/modules/account/service";
import { StatusBadge } from "@/lib/modules/account/ui";
import DocEditor from "@/lib/modules/account/DocEditor";
import { PageHeader } from "@/components/ui/PageHeader";
import { TabPills } from "@/components/ui/TabPills";
import { DataList } from "@/components/ui/DataList";
import { MoneyText } from "@/components/ui/MoneyText";

type Row = Awaited<ReturnType<typeof listDocuments>>[number];
type TabDef = { key: string; label: string; match?: (d: Row) => boolean };

// แท็บ/filter ต่อ docType — ตรงตาม docs/modules/12-account.md §3.0.3 เป๊ะ
function tabsFor(docType: AccountDocType): TabDef[] {
  const all: TabDef = { key: "all", label: "ทั้งหมด" };
  const recent: TabDef = { key: "recent", label: "ล่าสุด" };
  switch (docType) {
    case "QUOTATION":
      return [
        { key: "accepted", label: "ยอมรับ", match: (d) => d.status === "ACCEPTED" },
        {
          key: "awaiting",
          label: "รอตอบรับ",
          match: (d) => d.status === "AWAITING_ACCEPT" && !isOverdue(d),
        },
        { key: "overdue", label: "พ้นกำหนด", match: (d) => isOverdue(d) },
        all,
        recent,
      ];
    case "INVOICE":
      return [
        {
          key: "awaiting",
          label: "รอชำระเงิน",
          match: (d) =>
            (d.status === "AWAITING_PAYMENT" || d.status === "PARTIAL") && !isOverdue(d),
        },
        { key: "paid", label: "ชำระเงินแล้ว", match: (d) => d.status === "PAID" },
        { key: "overdue", label: "พ้นกำหนด", match: (d) => isOverdue(d) },
        all,
        recent,
      ];
    case "RECEIPT":
      return [
        { key: "paid", label: "ชำระเงินแล้ว", match: (d) => d.status === "PAID" },
        all,
        recent,
      ];
    case "TAX_INVOICE":
      return [
        { key: "issued", label: "ออกแล้ว", match: (d) => d.status === "ISSUED" },
        all,
        recent,
      ];
    case "DEPOSIT_RECEIPT":
      return [
        {
          key: "awaiting",
          label: "รอชำระเงิน",
          match: (d) => d.status === "AWAITING_PAYMENT" && !isOverdue(d),
        },
        { key: "overdue", label: "พ้นกำหนด", match: (d) => isOverdue(d) },
        { key: "deduct", label: "รอหักมัดจำ", match: (d) => d.status === "AWAITING_DEDUCT" },
        all,
        recent,
      ];
    default: // CREDIT_NOTE / DEBIT_NOTE / BILLING_NOTE
      return [all, recent];
  }
}

export default async function DocTypeListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docType: string }>;
  searchParams: Promise<{ tab?: string; err?: string }>;
}) {
  const { id, docType } = await params;
  const { tab: tabParam, err } = await searchParams;
  if (!(docType in DOC_LABEL)) notFound();
  const dt = docType as AccountDocType;
  if (!isVisibleDocType(dt)) notFound();
  const { tenantId, systemId } = await loadAccountSystem(id);

  const tabs = tabsFor(dt);
  const active = tabs.find((t) => t.key === tabParam) ?? tabs[0];

  const [rows, contacts, settings] = await Promise.all([
    listDocuments(tenantId, systemId, dt, { tab: "all", take: 500 }),
    listContacts(tenantId, systemId),
    getSettings(tenantId, systemId),
  ]);

  if (dt === "TAX_INVOICE" && !settings.vatRegistered) notFound();

  // filter/sort ตามแท็บที่เลือก (ระดับ UI — ไม่แตะ service)
  let docs = active.match ? rows.filter(active.match) : rows;
  if (active.key === "recent") {
    docs = [...docs].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  const base = `/app/sys/${id}/account`;
  const label = DOC_LABEL[dt] ?? dt;
  const canCreate = dt !== "RECEIPT" && dt !== "TAX_INVOICE"; // เกิดจากการแปลงเท่านั้น

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader title={label} back={{ href: base, label: "ระบบบัญชี" }} />

      {err === "empty" && (
        <p className="text-sm text-[color:var(--color-danger)]">ต้องมีรายการอย่างน้อย 1 รายการ</p>
      )}

      <TabPills
        active={active.key}
        tabs={tabs.map((t) => ({ key: t.key, label: t.label, href: `${base}/docs/${dt}?tab=${t.key}` }))}
      />

      <DataList
        items={docs.map((d) => ({
          key: d.id,
          href: `${base}/docs/${dt}/${d.id}`,
          primary: `${d.docNo ?? "(ร่าง)"} · ${d.issueDate.toLocaleDateString("th-TH", {
            day: "numeric",
            month: "short",
            year: "2-digit",
          })}`,
          trailing: (
            <>
              <MoneyText satang={d.grandTotal} decimals />
              <StatusBadge status={d.status} overdue={isOverdue(d)} />
            </>
          ),
        }))}
        empty={`ยังไม่มี${label}ในหมวดนี้`}
      />

      {canCreate ? (
        <DocEditor
          systemId={systemId}
          docType={dt}
          docLabel={label}
          contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
          vatRateBp={settings.vatRateBp}
          vatRegistered={settings.vatRegistered}
          defaultVatTiming={settings.taxPointBasis}
        />
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-sm text-[color:var(--color-muted)]">
          {label}สร้างได้จากการแปลงเอกสารต้นทาง (ใบแจ้งหนี้ / ใบเสร็จ) เท่านั้น
        </p>
      )}
    </div>
  );
}
