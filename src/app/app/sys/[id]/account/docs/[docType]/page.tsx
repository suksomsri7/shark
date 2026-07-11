import Link from "next/link";
import { notFound } from "next/navigation";
import type { AccountDocType } from "@prisma/client";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import {
  listDocuments,
  listContacts,
  getSettings,
  DOC_LABEL,
  baht,
  isOverdue,
  type DocTab,
} from "@/lib/modules/account/service";
import { StatusBadge } from "@/lib/modules/account/ui";
import DocEditor from "@/lib/modules/account/DocEditor";

const TABS: { key: DocTab; label: string }[] = [
  { key: "recent", label: "ล่าสุด" },
  { key: "awaiting", label: "รอดำเนินการ" },
  { key: "paid", label: "เสร็จสิ้น" },
  { key: "overdue", label: "พ้นกำหนด" },
  { key: "all", label: "ทั้งหมด" },
];

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
  const { tenantId, systemId } = await loadAccountSystem(id);

  const tab = (TABS.find((t) => t.key === tabParam)?.key ?? "recent") as DocTab;
  const [docs, contacts, settings] = await Promise.all([
    listDocuments(tenantId, systemId, dt, { tab }),
    listContacts(tenantId, systemId),
    getSettings(tenantId, systemId),
  ]);

  const base = `/app/sys/${id}/account`;
  const canCreate = dt !== "RECEIPT" && dt !== "TAX_INVOICE"; // เกิดจากการแปลงเท่านั้น

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Link href={base} className="text-sm text-[color:var(--color-muted)]">← ระบบบัญชี</Link>
        <h1 className="mt-1 text-2xl font-semibold">{DOC_LABEL[dt]}</h1>
      </div>

      {err === "empty" && (
        <p className="text-sm text-[color:var(--color-danger)]">ต้องมีรายการอย่างน้อย 1 รายการ</p>
      )}

      {/* แท็บ */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${base}/docs/${dt}?tab=${t.key}`}
            className="rounded-full border px-3 py-1 text-xs"
            style={
              t.key === tab
                ? { background: "var(--color-ink)", color: "var(--color-surface)" }
                : undefined
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* รายการ */}
      <div className="flex flex-col gap-2">
        {docs.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีเอกสารในหมวดนี้</p>
        ) : (
          docs.map((d) => (
            <Link
              key={d.id}
              href={`${base}/docs/${dt}/${d.id}`}
              className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-[color:var(--color-surface-2)]"
            >
              <span>
                {d.docNo ?? "(ร่าง)"} ·{" "}
                {d.issueDate.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}
              </span>
              <span className="flex items-center gap-2">
                ฿{baht(d.grandTotal)}
                <StatusBadge status={d.status} overdue={isOverdue(d)} />
              </span>
            </Link>
          ))
        )}
      </div>

      {/* สร้างใหม่ */}
      {canCreate && (
        <DocEditor
          systemId={systemId}
          docType={dt}
          docLabel={DOC_LABEL[dt]}
          contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
          vatRateBp={settings.vatRateBp}
          vatRegistered={settings.vatRegistered}
        />
      )}
      {!canCreate && (
        <p className="rounded-lg border border-dashed p-4 text-sm text-[color:var(--color-muted)]">
          {DOC_LABEL[dt]}สร้างได้จากการแปลงเอกสารต้นทาง (ใบแจ้งหนี้/ใบเสร็จ) เท่านั้น
        </p>
      )}
    </div>
  );
}
