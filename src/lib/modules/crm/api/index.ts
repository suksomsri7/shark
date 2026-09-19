// crm/api/index.ts — ทางเข้าของ REST/AI ของ CRM สำหรับโค้ดนอกโมดูล (ใบ C1.10)
//
// โค้ดนอกโมดูล CRM แตะได้เฉพาะ facade `@/lib/modules/crm` (fitness F2.3) ⇒ facade re-export ไฟล์นี้เป็น namespace `crmApi`
// ผู้ใช้: route `/api/v1/crm/*` · `/api/v1/crm/openapi.json` · `/api/v1/teams/*` · `src/lib/ai/{tools-crm,skills,proposals}.ts`
// (ไฟล์นี้ re-export ล้วน ไม่มีตรรกะ)
export { dispatch, dispatchTeams } from "./dispatch";
export { buildOpenApi, CRM_DOC_INFO } from "./openapi";
export { CRM_OPS } from "./registry";
export { CRM_API_CONFIG } from "./config";
export {
  crmDestructiveKinds,
  crmKindAccess,
  crmToolAllowedForScopes,
  crmToolInfos,
  crmToolNames,
  crmToolScope,
  crmLegacyLeadOpen,
  LEGACY_CRM_LEAD_TOOL_DEF,
  runCrmLeadTool,
  dispatchCrmKind,
  isCrmKind,
  runCrmTool,
} from "./tools";
export type { CrmToolCtx, CrmToolInfo, CrmToolOutcome } from "./tools";
export { crmWebhookEvents, isCrmWebhookEndpoint } from "./webhook-events";
