// WO 1.3 — ฟอร์มเอกสาร V2 (DESIGN-SPEC-V2 §5.2 · ภาพ g1/g17)
// WO 1.6 — CNR เข้าทาง wizard 2 ขั้น (§5.2 J · ภาพ g3): ขั้น ① เลือกเอกสารอ้างอิง (PUR/EXP) → ขั้น ② ฟอร์มเดิม
import { requireAccountPage } from "@/lib/modules/account/guard";
import { DocEditorPage } from "@/lib/modules/account/DocEditorPage";
import { adjustRefDocTypesFor } from "@/lib/modules/account/doc-editor-config";
import { listContacts } from "@/lib/modules/account/service";
import { EXP_DOC_LABEL } from "@/lib/modules/account/expense";
import { buildAdjustCandidatePage } from "@/lib/modules/account/editor-actions";
import { presetRangeBkk } from "@/lib/modules/account/list-tabs";
import { AdjustWizardStep1 } from "@/components/account-v2/AdjustWizardStep1";
import type { AccountDocType } from "@prisma/client";
import type { DateRangePreset } from "@/components/account-v2/ListFilters";

const DOC_TYPE = "CREDIT_NOTE_RECEIVED" as const;
const DOC_LABEL = "รับใบลดหนี้";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    ref?: string;
    noref?: string;
    reftype?: string;
    preset?: string;
    from?: string;
    to?: string;
    contactId?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await requireAccountPage(id, "account.doc.create");

  const showStep1 = !sp.ref && !sp.noref;
  if (showStep1) {
    const base = `/app/sys/${id}/account`;
    const pathname = `${base}/credit-note-received/new`;
    const refTypes = adjustRefDocTypesFor(DOC_TYPE);
    const refDocType = refTypes.includes(sp.reftype as AccountDocType) ? (sp.reftype as AccountDocType) : refTypes[0];
    const preset = (sp.preset as DateRangePreset | undefined) ?? "this_year";
    const range = preset === "custom" ? { from: sp.from, to: sp.to } : presetRangeBkk(preset);
    const [contacts, candidates] = await Promise.all([
      listContacts(tenantId, systemId),
      buildAdjustCandidatePage(tenantId, systemId, DOC_TYPE, refDocType, {
        contactId: sp.contactId,
        from: range.from,
        to: range.to,
        q: sp.q,
        page: sp.page ? Number.parseInt(sp.page, 10) || 1 : 1,
      }),
    ]);
    return (
      <AdjustWizardStep1
        pathname={pathname}
        docLabel={DOC_LABEL}
        refTypeOptions={refTypes.map((t) => ({ value: t, label: EXP_DOC_LABEL[t] ?? t }))}
        refDocType={refDocType}
        contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
        filters={{
          contactId: sp.contactId,
          preset,
          from: sp.from,
          to: sp.to,
          q: sp.q,
        }}
        rows={candidates.rows.map((r) => ({
          id: r.id,
          docNo: r.docNo,
          issueDate: r.issueDate,
          dueDate: r.dueDate,
          amountSatang: r.grandTotalSatang,
          outstandingSatang: r.outstandingSatang,
          statusLabel: r.statusLabel,
        }))}
        page={candidates.page}
        pageCount={candidates.pageCount}
        total={candidates.total}
        amountColLabel="มูลค่าสุทธิ"
        showOutstanding
        dueColLabel="กำหนดชำระ"
        cancelHref={`${base}/credit-note-received`}
      />
    );
  }

  return <DocEditorPage systemId={id} docType={DOC_TYPE} refId={sp.ref} />;
}
