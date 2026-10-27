// index.ts — facade ของศูนย์เชื่อมต่อ (SVC R0.5 · CC §2) — ฝั่งเซิร์ฟเวอร์เท่านั้น
// ผู้ใช้ตัวเชื่อม: getIntegration → callIntegration (null = ใช้ทางมือ) · หน้า/REST: save/test/disable/list
// 🔴 ไฟล์ 'use client' ห้าม import ไฟล์นี้ — ใช้ "./types" (type-only) หรือ "./registry" (แค็ตตาล็อกบริสุทธิ์) แทน
export {
  saveIntegration,
  testIntegration,
  disableIntegration,
  listIntegrations,
  getIntegration,
  callIntegration,
  purgeIntegrationCallLogs,
  canManageIntegrations,
  INTEGRATION_CALL_LOG_RETENTION_DAYS,
  INTEGRATION_FAILURE_THRESHOLD,
  INTEGRATIONS_MANAGE_KEY,
} from "./service";
export { integrationSecretKeyConfigured, INTEGRATIONS_CREDENTIALS_ENV } from "./secret-box";
export { integrationCatalog, providerDef, providersFor, INTEGRATION_KIND_META, INTEGRATION_GROUPS } from "./registry";
export type * from "./types";
