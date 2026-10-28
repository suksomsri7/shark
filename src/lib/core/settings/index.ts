// ─────────────────────────────────────────────────────────────
// core/settings — facade เดียวที่โมดูลอื่น import (CC §1.1) · SVC R0.3
// import defs ร่วม (payments · messaging) เพื่อให้ลงทะเบียนตอนโหลด · defs ของโดเมน (rooms · booking) ลงในใบของตัวเอง
// 🔴 ห้าม import ./defs/_fixture (ฟิกซ์เจอร์ QC เท่านั้น — ข้อสอบ S-3)
// ─────────────────────────────────────────────────────────────
import "./defs/payments";
import "./defs/messaging";
import "./defs/rooms";
import "./defs/booking"; // SVC B.0

export type * from "./types";
export { SCOPE_KINDS } from "./types";
export {
  defineSettings,
  getDef,
  listDefs,
  getTemplate,
  TEMPLATES,
  SNAPSHOT_KEYS,
  validateGroup,
  legalInputsOf,
  legalDependentsOf,
  defaultFor,
  isOwnerOnly,
  isScopeKind,
  groupLabelTh,
} from "./registry";
export { renderTemplate, checkTemplate } from "./template";
export { loadSettingsForm, legalOverrideSummaries } from "./form";
export type { SettingsFormQuery, LegalOverrideSummary } from "./form";
export {
  resolveSetting,
  resolveSettings,
  resolveSettingsMany,
  refsFor,
  settingsDiff,
  setSettings,
  resetSetting,
  applyTemplate,
  settingHistory,
  snapshotPolicy,
  fromSnapshot,
  applyLegalOverrideApproval,
  LEGAL_OVERRIDE_ENTITY,
} from "./service";
