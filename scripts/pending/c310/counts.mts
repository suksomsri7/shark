// C4.2 it4 (c42b) — READ-ONLY row counts of QC1 for the restore proof (every table the runner snapshots + its own
// leftovers: qc-btn- tagged rows · qc-btn sessions). Usage: pnpm exec tsx scripts/pending/c42b/counts.mts <out.json>
import { writeFileSync, readFileSync } from "node:fs";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const h = accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse(readFileSync(process.env.CRM_EXPECTED_PATH ?? "scripts/crm-expected.json", "utf8"));
const T = E.tenantId, S = E.systemId;
const MODELS = ["AppSystem", "Team", "TeamMember", "Party", "Customer", "MemberConsent", "MemberField", "CrmPipeline", "CrmStage", "CrmLostReason", "CrmCompany", "CrmContact", "CrmCompanyContact", "CrmDeal", "CrmDealContact", "CrmDealLine", "CrmDealStageHistory", "CrmDealPayment", "CrmActivity", "CrmVisibilityPolicy", "FileAsset", "CrmFileLink", "CrmContactConsent", "CustomObject", "CustomRecord", "CustomRecordValue", "CustomRecordValueHistory", "CrmScoreRule", "CrmScoreLog", "CrmAssignmentRule", "CrmSequence", "CrmSequenceStep", "CrmSequenceEnrollment", "CrmEmailTemplate", "CrmEmailUserSetting", "CrmMailProvider", "EmailDomain", "CrmEmailMessage", "CrmEmailEvent", "CrmTrackedLink", "CrmTrackedClick", "CrmWebSession", "CrmWebEvent", "CrmUserPref", "CrmImportJob", "CrmQuota", "CrmCommissionRule", "CrmCommission", "CrmPortalAccess", "CrmPortalRequest", "PortalSession", "MemberSavedView", "ApiKey", "WebhookEndpoint", "AutomationRule", "AutomationRun", "FormDef", "KanbanCard", "AiProposal",
  // it5 (RV-9): chat tables the CRM panel / N9 fixture touch (leaked qc-btn rooms were invisible to this proof before)
  "ChatContact", "ChatConversation", "ChatMessage", "ChatReadState", "ChatConversationPref", "ChatConversationEvent", "OutboxEvent"];
const out: Record<string, number | string> = {};
for (const m of MODELS) {
  const d = P[m.charAt(0).toLowerCase() + m.slice(1)];
  out[m] = d ? await d.count({ where: { tenantId: T } }).catch((e: any) => `ERR ${String(e).slice(0, 60)}`) : "n/a";
}
// it5 (RV-9): CONTENT checksums, not only counts — md5 of every row (all scalar columns, sorted by id) per table of this tenant
//   (OutboxEvent excluded: its status/attempts legitimately move while the server drains it)
{
  const { createHash } = await import("node:crypto");
  const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x && typeof x === "object" && (x as any).constructor?.name === "Decimal" ? `D${String(x)}` : x));
  for (const m of MODELS) {
    if (m === "OutboxEvent") continue;
    const d = P[m.charAt(0).toLowerCase() + m.slice(1)];
    if (!d) { out[`sum:${m}`] = "n/a"; continue; }
    const rows = await d.findMany({ where: { tenantId: T }, orderBy: { id: "asc" } }).catch((e: any) => null);
    out[`sum:${m}`] = rows ? createHash("md5").update(rows.map((r: any) => stable(r)).join("\n")).digest("hex").slice(0, 16) : "ERR";
  }
}
out["tag:CrmDeal qc-btn-"] = await P.crmDeal.count({ where: { systemId: S, title: { contains: "qc-btn-" } } });
out["tag:CrmContact qc-btn-"] = await P.crmContact.count({ where: { systemId: S, name: { contains: "qc-btn-" } } });
out["tag:CrmCompany qc-btn-"] = await P.crmCompany.count({ where: { systemId: S, name: { contains: "qc-btn-" } } });
out["tag:CrmActivity qc-btn-"] = await P.crmActivity.count({ where: { systemId: S, title: { contains: "qc-btn-" } } });
out["Session qc-btn (live)"] = await P.session.count({ where: { userAgent: "qc-btn", expiresAt: { gt: new Date() } } });
const sys = await P.appSystem.findUnique({ where: { id: S }, select: { settings: true } });
out["settings.crm.portal"] = JSON.stringify(sys?.settings?.crm?.portal ?? null);
const co = await P.crmCompany.findUnique({ where: { id: E.companyIds[0] }, select: { taxId: true } });
out["company0.taxId"] = String(co?.taxId);
out["_at"] = new Date().toISOString(); out["_host"] = h.host.split(".")[0]!;
writeFileSync(process.argv[2] ?? "/dev/stdout", JSON.stringify(out, null, 1) + "\n");
await prisma.$disconnect();
