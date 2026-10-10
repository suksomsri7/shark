// crm/api/index.ts — ทางเข้าของ REST/AI ของ CRM สำหรับโค้ดนอกโมดูล (ใบ C1.10)
//
// โค้ดนอกโมดูล CRM แตะได้เฉพาะ facade `@/lib/modules/crm` (fitness F2.3) ⇒ facade re-export ไฟล์นี้เป็น namespace `crmApi`
// ผู้ใช้: route `/api/v1/crm/*` · `/api/v1/crm/openapi.json` · `/api/v1/teams/*` · `src/lib/ai/{tools-crm,skills,proposals}.ts`
// (ไฟล์นี้ re-export ล้วน ไม่มีตรรกะ)
export { dispatch, dispatchTeams } from "./dispatch";
export { buildOpenApi, CRM_DOC_INFO } from "./openapi";
// CRM C3.8 ▸ เอกสารต่อผู้เรียก (openapi.json + path จริงของวัตถุเมื่อมีคีย์) · manifest ทั้งสัญญา ◂
export { buildOpenApiForRequest } from "./openapi";
export { crmManifest } from "./manifest";
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
// CRM C5.5-G1 ▸ ตัวปิดบังเบอร์/อีเมลของผู้ช่วย (กติกาเดียวกับ present() ของ REST) — เครื่องมือรุ่นแรก `recent_leads` (ai/tools.ts) ใช้ตัวเดียวกัน ◂
export { maskPiiDeep } from "./serialize";
export { crmWebhookEvents, isCrmWebhookEndpoint, CRM_INTERNAL_EVENTS } from "./webhook-events";
