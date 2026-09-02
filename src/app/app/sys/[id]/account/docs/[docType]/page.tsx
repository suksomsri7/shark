import Link from "next/link";
import { notFound } from "next/navigation";
import type { AccountDocType } from "@prisma/client";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import {
  listDocumentsPaged,
  listContacts,
  getSettings,
  DOC_LABEL,
  isOverdue,
  isVisibleDocType,
  type ListDocumentsInput,
} from "@/lib/modules/account/service";
import { StatusBadge } from "@/lib/modules/account/ui";
import DocEditor from "@/lib/modules/account/DocEditor";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormField } from "@/components/ui/FormField";
import { TabPills } from "@/components/ui/TabPills";
import { DataList } from "@/components/ui/DataList";
import { MoneyText } from "@/components/ui/MoneyText";

// ตัวกรองต่อแท็บ = คำสั่งที่ส่งให้ service (กรองฝั่ง server ทั้งหมด — ไม่มี take 500 + filter ใน UI แล้ว)
type TabDef = { key: string; label: string; filter: Partial<ListDocumentsInput> };

// แท็บ/filter ต่อ docType — ตรงตาม docs/modules/12-account.md §3.0.3 เป๊ะ
function tabsFor(docType: AccountDocType): TabDef[] {
  const all: TabDef = { key: "all", label: "ทั้งหมด", filter: {} };
  const recent: TabDef = { key: "recent", label: "ล่าสุด", filter: { sort: "recent" } };
  const overdue: TabDef = { key: "overdue", label: "พ้นกำหนด", filter: { status: "OVERDUE" } };
  switch (docType) {
    case "QUOTATION":
      return [
        { key: "accepted", label: "ยอมรับ", filter: { status: "ACCEPTED" } },
        {
          key: "awaiting",
          label: "รอตอบรับ",
          filter: { status: "AWAITING_ACCEPT", excludeOverdue: true },
        },
        overdue,
        all,
        recent,
      ];
    case "INVOICE":
      return [
        {
          key: "awaiting",
          label: "รอชำระเงิน",
          filter: { status: ["AWAITING_PAYMENT", "PARTIAL"], excludeOverdue: true },
        },
        { key: "paid", label: "ชำระเงินแล้ว", filter: { status: "PAID" } },
        overdue,
        all,
        recent,
      ];
    case "RECEIPT":
      return [{ key: "paid", label: "ชำระเงินแล้ว", filter: { status: "PAID" } }, all, recent];
    case "TAX_INVOICE":
      return [{ key: "issued", label: "ออกแล้ว", filter: { status: "ISSUED" } }, all, recent];
    case "DEPOSIT_RECEIPT":
      return [
        {
          key: "awaiting",
          label: "รอชำระเงิน",
          filter: { status: "AWAITING_PAYMENT", excludeOverdue: true },
        },
        overdue,
        { key: "deduct", label: "รอหักมัดจำ", filter: { status: "AWAITING_DEDUCT" } },
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
  searchParams: Promise<{ tab?: string; q?: string; page?: string; err?: string }>;
}) {
  const { id, docType } = await params;
  const { tab: tabParam, q: qParam, page: pageParam, err } = await searchParams;
  if (!(docType in DOC_LABEL)) notFound();
  const dt = docType as AccountDocType;
  if (!isVisibleDocType(dt)) notFound();
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.doc.create" });

  const tabs = tabsFor(dt);
  const active = tabs.find((t) => t.key === tabParam) ?? tabs[0];
  const q = (qParam ?? "").trim();
  const page = Math.max(Number.parseInt(pageParam ?? "1", 10) || 1, 1);

  const [result, contacts, settings] = await Promise.all([
    listDocumentsPaged(tenantId, systemId, {
      docType: dt,
      sort: "issueDate",
      ...active.filter,
      q: q || undefined,
      page,
    }),
    listContacts(tenantId, systemId),
    getSettings(tenantId, systemId),
  ]);

  if (dt === "TAX_INVOICE" && !settings.vatRegistered) notFound();

  const base = `/app/sys/${id}/account`;
  const label = DOC_LABEL[dt] ?? dt;
  const canCreate = dt !== "RECEIPT" && dt !== "TAX_INVOICE"; // เกิดจากการแปลงเท่านั้น
  const listUrl = (opts: { tab?: string; page?: number }) => {
    const sp = new URLSearchParams();
    sp.set("tab", opts.tab ?? active.key);
    if (q) sp.set("q", q);
    if (opts.page && opts.page > 1) sp.set("page", String(opts.page));
    return `${base}/docs/${dt}?${sp.toString()}`;
  };

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader title={label} back={{ href: base, label: "ระบบบัญชี" }} />

      {err === "empty" && (
        <p className="text-sm text-[color:var(--color-danger)]">ต้องมีรายการอย่างน้อย 1 รายการ</p>
      )}

      <TabPills
        active={active.key}
        tabs={tabs.map((t) => ({ key: t.key, label: t.label, href: listUrl({ tab: t.key, page: 1 }) }))}
      />

      <form className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value={active.key} />
        <FormField label="ค้นหา">
          <input name="q" defaultValue={q} className="input" placeholder="เลขที่เอกสาร หรือ ชื่อผู้ติดต่อ" />
        </FormField>
        <button className="btn btn-ghost text-sm">ค้นหา</button>
      </form>

      <DataList
        items={result.rows.map((d) => ({
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
        empty={q ? `ไม่พบ${label}ที่ตรงกับคำค้น` : `ยังไม่มี${label}ในหมวดนี้`}
      />

      {result.pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={listUrl({ page: page - 1 })} className="underline">
              ← ก่อนหน้า
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[color:var(--color-muted)]">
            หน้า {page} จาก {result.pageCount} (ทั้งหมด {result.total} รายการ)
          </span>
          {page < result.pageCount ? (
            <Link href={listUrl({ page: page + 1 })} className="underline">
              ถัดไป →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}

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
