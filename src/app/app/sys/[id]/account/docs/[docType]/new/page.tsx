// WO 1.3 — ฟอร์มเอกสาร V2 (DESIGN-SPEC-V2 §5.2 · ภาพ g1/g17)
// WO 1.6 — CN/DN เข้าทาง wizard 2 ขั้น (§5.2 J · ภาพ g3): ขั้น ① เลือกเอกสารอ้างอิง → ขั้น ② ฟอร์มเดิม
// ด่านสิทธิ์เรียกซ้ำที่นี่ด้วย (ไม่ใช่พึ่ง DocEditorPage อย่างเดียว) — ทะเบียน guard.ts ตรวจไฟล์นี้ตรง ๆ
import { notFound } from "next/navigation";
import type { AccountDocType } from "@prisma/client";
import { requireAccountPage } from "@/lib/modules/account/guard";
import { DocEditorPage } from "@/lib/modules/account/DocEditorPage";
import {
  editorDefOf,
  isAdjustType,
  adjustRefDocTypesFor,
} from "@/lib/modules/account/doc-editor-config";
import { listContacts, DOC_LABEL } from "@/lib/modules/account/service";
import { buildAdjustCandidatePage } from "@/lib/modules/account/editor-actions";
import { presetRangeBkk } from "@/lib/modules/account/list-tabs";
import { GroupNewPage } from "@/lib/modules/account/group-page";
import { isGroupDocType } from "@/lib/modules/account/group";
import { AdjustWizardStep1 } from "@/components/account-v2/AdjustWizardStep1";
import type { DateRangePreset } from "@/components/account-v2/ListFilters";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docType: string }>;
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
    ids?: string;
  }>;
}) {
  const { id, docType } = await params;
  const sp = await searchParams;
  const def = editorDefOf(docType);
  if (!def || def.side !== "revenue") notFound();
  const dt = docType as AccountDocType;
  const { tenantId, systemId } = await requireAccountPage(id, "account.doc.create");

  // WO 1.7 §5.2 K — ใบวางบิลรวม ใช้ "ฟอร์มพิเศษ" (เลือกลูกค้า → ติ๊กใบแจ้งหนี้ค้างชำระ) ไม่ใช่ DocEditorV2
  if (isGroupDocType(dt)) {
    return <GroupNewPage tenantId={tenantId} systemId={systemId} docType={dt} ids={sp.ids} />;
  }

  const adjust = isAdjustType(dt);
  const showStep1 = adjust && !sp.ref && !sp.noref;

  if (showStep1) {
    const base = `/app/sys/${id}/account`;
    const pathname = `${base}/docs/${dt}/new`;
    const refTypes = adjustRefDocTypesFor(dt);
    const refDocType = refTypes.includes(sp.reftype as AccountDocType) ? (sp.reftype as AccountDocType) : refTypes[0];
    const preset = (sp.preset as DateRangePreset | undefined) ?? "this_year";
    const range = preset === "custom" ? { from: sp.from, to: sp.to } : presetRangeBkk(preset);
    const [contacts, candidates] = await Promise.all([
      listContacts(tenantId, systemId),
      buildAdjustCandidatePage(tenantId, systemId, dt, refDocType, {
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
        docLabel={def.label}
        refTypeOptions={refTypes.map((t) => ({ value: t, label: DOC_LABEL[t] ?? t }))}
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
        dueColLabel="กำหนดรับชำระ"
        cancelHref={`${base}/docs/${dt}`}
      />
    );
  }

  return <DocEditorPage systemId={id} docType={dt} refId={adjust && sp.ref ? sp.ref : undefined} />;
}
