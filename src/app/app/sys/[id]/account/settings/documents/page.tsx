import { requireAccountPage } from "@/lib/modules/account/guard";
import { DOC_LABEL, getSettings } from "@/lib/modules/account/service";
import { EXP_DOC_LABEL } from "@/lib/modules/account/expense";
import { listLedgers } from "@/lib/modules/account/coa";
import {
  docNumberingRows,
  documentPaymentChannels,
  getDocSettings,
  listDocTags,
  listDocTypeAccounts,
} from "@/lib/modules/account/doc-settings";
import { NUMBERED_DOC_TYPES } from "@/lib/modules/account/settings-schema";
import { DEFAULT_DOC_SUB, DOC_SETTINGS_SUBS, docSubLabel } from "@/lib/modules/account/settings-nav";
import { SettingsNav } from "@/components/account-v2/SettingsNav";
import { DocSettingsPanel } from "@/components/account-v2/DocSettingsPanel";
import {
  saveDocNumberingAction,
  saveDocNotesAction,
  saveDueDefaultsAction,
  saveChannelOrderAction,
  savePublicLinkAction,
  saveAutoTaxInvoiceAction,
  savePrintTemplateAction,
  saveDocTagAction,
  archiveDocTagAction,
  saveDocTypeAccountAction,
  resetDocSettingsAction,
} from "@/lib/modules/account/settings-actions";
import type { AccountDocType } from "@prisma/client";
import { prisma } from "@/lib/core/db";

// หน้า "ตั้งค่า › เอกสารและเลขที่" (SPEC §9.2 · เฟรม f10-settings.png)
// หัวข้อย่อยเลือกด้วย `?s=` — บนมือถือไม่มี `?s=` = เห็นรายการหัวข้อเต็มจอ (หน้าย่อยแยกหน้าตาม §13)
export const dynamic = "force-dynamic";

const labelOf = (dt: AccountDocType) => DOC_LABEL[dt] ?? EXP_DOC_LABEL[dt] ?? dt;

export default async function AccountDocSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { id } = await params;
  const { s: subRaw } = await searchParams;
  const { tenantId, systemId } = await requireAccountPage(id, "account.settings.manage");
  const base = `/app/sys/${id}/account`;
  const ctx = { tenantId, systemId };

  const hasSub = !!subRaw && DOC_SETTINGS_SUBS.some((x) => x.key === subRaw);
  const sub = hasSub ? subRaw! : DEFAULT_DOC_SUB;
  const now = new Date();

  const [settings, docSettings, rows, tags, channels, ledgers, accounts, sampleDoc] = await Promise.all([
    getSettings(tenantId, systemId),
    getDocSettings(ctx),
    docNumberingRows(ctx, labelOf, now),
    listDocTags(ctx, { withUsage: true }),
    documentPaymentChannels(ctx),
    listLedgers(ctx),
    listDocTypeAccounts(ctx),
    // เอกสารตัวอย่างของปุ่ม "ดูตัวอย่าง" — ใบล่าสุดที่ออกแล้ว (พรีวิวต้องเป็นกระดาษจริง ไม่ใช่ภาพที่วาดเอง)
    prisma.accountDocument.findFirst({
      where: { tenantId, systemId, docNo: { not: null } },
      orderBy: { issueDate: "desc" },
      select: { id: true },
    }),
  ]);

  const docLabels: Record<string, string> = {};
  for (const dt of NUMBERED_DOC_TYPES) docLabels[dt] = labelOf(dt);

  return (
    <DocSettingsPanel
      systemId={systemId}
      base={base}
      sub={sub}
      subLabel={docSubLabel(sub)}
      todayIso={now.toISOString()}
      branchCode={settings.branchCode || "00000"}
      settings={docSettings}
      rows={rows.map((r) => ({
        docType: r.docType,
        label: r.label,
        prefix: r.prefix,
        pattern: r.pattern,
        effectivePattern: r.effectivePattern,
        reset: r.reset,
        example: r.example,
        nextNo: r.nextNo,
      }))}
      docLabels={docLabels}
      tags={tags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        docTypes: t.docTypes,
        archivedAt: t.archivedAt ? t.archivedAt.toISOString() : null,
        usageCount: t.usageCount,
      }))}
      channels={channels.map((c) => ({
        id: c.id,
        name: c.name,
        detail:
          [c.bankName, c.accountNo, c.accountName].filter(Boolean).join(" · ") || c.promptpayId || "",
      }))}
      ledgers={ledgers.map((l) => ({ id: l.id, code: l.code, name: l.name }))}
      docTypeAccounts={accounts.map((a) => ({
        docType: a.docType,
        label: labelOf(a.docType),
        accountId: a.accountId,
      }))}
      printSampleDocId={sampleDoc?.id ?? null}
      nav={<SettingsNav base={base} activeGroup="doc" activeSub={sub} />}
      mobileNav={<SettingsNav base={base} activeGroup="doc" activeSub={hasSub ? sub : ""} />}
      showMobileNavOnly={!hasSub}
      actions={{
        numbering: saveDocNumberingAction,
        notes: saveDocNotesAction,
        due: saveDueDefaultsAction,
        channels: saveChannelOrderAction,
        publicLink: savePublicLinkAction,
        autoTax: saveAutoTaxInvoiceAction,
        print: savePrintTemplateAction,
        tag: saveDocTagAction,
        tagArchive: archiveDocTagAction,
        accounts: saveDocTypeAccountAction,
        reset: resetDocSettingsAction,
      }}
    />
  );
}
