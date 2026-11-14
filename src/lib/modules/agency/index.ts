// ─────────────────────────────────────────────────────────────
// agency — facade ของโมดูลเอเจนซี่ (โมดูลอื่นเรียกผ่านไฟล์นี้เท่านั้น) · RUN TRIPS A1.1
// ใบนี้: ฟังก์ชันพื้นฐานของตัวตนเอเจนซี่ระดับแพลตฟอร์ม (ใบสั่ง §5) — บัญชีต่อร้าน/ราคา/โควตา/สมุด = A1.2–A2.5
// 🔴 ไม่มี `export *` · ผู้กระทำ AGENT ในเส้นทางขาย/จอง/คืนเงินของ trips ยังคง FORBIDDEN AGENCY_NOT_ENABLED จน A1.4
// ─────────────────────────────────────────────────────────────
export {
  AGENT_ROLES,
  AGENT_LOGIN_KINDS,
  AGENT_PUBLIC_CODE_ALPHABET,
  AGENT_PUBLIC_CODE_RE,
  AGENT_IDENTITY_PUBLIC_FIELDS,
  makeAgentPublicCode,
  isAgentPublicCode,
  normalizeAgentLogin,
  normalizeJuristicTaxId,
} from "./identity-core";
export type { AgentRole, AgentLoginKind } from "./identity-core";
export {
  agentTaxIdHash,
  createAgentIdentity,
  findAgentIdentityByCode,
  agentUserByLogin,
  updateAgentIdentity,
  setAgentIdentityTaxId,
  verifyAgentIdentityTaxId,
  addAgentLogin,
  listAgentAccountsOfUser,
} from "./entry";
export type { AgentIdentityPublic, AgentEntryFail, AgentLoginInput } from "./entry";
// TRIPS A1.2a ▸ ทะเบียนเอเจนซี่ต่อร้าน (ใบสั่ง §3 + §7) — ฝั่งร้าน + ส่วนบริสุทธิ์ · ฟังก์ชันฝั่งเอเจนซี่ (รับ actor { agentUserId }) ไม่อยู่ที่นี่
//   (อยู่ใน agency/agent-side.ts ซึ่ง import ได้เฉพาะจาก platform/agent-auth.ts · มติ R1 ข้อ 10)
export {
  AGENT_ACCOUNT_STATUSES,
  AGENT_ACCOUNT_ACTIONS,
  AGENT_CLOSE_REASONS,
  STICKY_CLOSE_REASONS,
  AGENCY_ERROR_CODES,
  AGENCY_FAIL_MESSAGES,
  AGENCY_APPLY_PRIVACY_NOTICE_VERSION,
  AGENT_CLIENT_KEY_RE,
  AGENT_SESSION_TOKEN_RE,
  SHOP_AGENT_ACCOUNT_KEYS,
  SHOP_AGENT_LIST_KEYS,
  NEVER_SHOW_TO_SHOP_KEYS,
  agentAccountTransition,
  cleanAgencyText,
  licenceWarnings,
  maskEmail,
  agentLoginCodeMail,
} from "./accounts-core";
export type { AgentAccountStatus, AgentAccountAction, AgentCloseReason, AgencyErrorCode, AgencyFail, AgentTransition, LicenceWarning } from "./accounts-core";
export {
  listAgentAccounts,
  getAgentAccount,
  inviteAgent,
  reissueAgentInvite,
  revokeAgentInvite,
  approveAgentAccount,
  rejectAgentAccount,
  suspendAgentAccount,
  reinstateAgentAccount,
  closeAgentAccount,
  updateAgentAccountProfile,
  lookupAgentIdentityByCode,
  linkAgentCrmCompany,
  unlinkAgentCrmCompany,
  removeAgentAccountMember, // r2 (มติ §10 ข้อ 12)
} from "./accounts";
export type { ShopCtx, AgencyOpts, AgencyDeps, AccountWriteResult, ShopAgentAccountDTO, ShopAgentListItem, InviteAgentInput, InviteResult, AgentProfilePatch, AgentPayeeType } from "./accounts";
// ◂ TRIPS A1.2a
// TRIPS A1.3a ▸ ระดับ A/B/C · rate card · แถวราคา 3 แบบ + คอมฯ บาทต่อที่นั่ง · ช่วงพิเศษ · ตัวเลือกชั้นเอเจนซี่ · port ราคาเอเจนซี่ · เครื่องลองคิด (ใบสั่ง §3 §6–§9)
//   ฝั่งร้านเท่านั้น — ไม่มีฟังก์ชันฝั่งเอเจนซี่ · port ลงทะเบียนเข้า trips ผ่าน installAgencyPricingPort (จุดติดตั้ง platform/sellables.ts)
export {
  AGENT_TIER_CODES,
  AGENT_RATE_MODES,
  AGENT_RATE_CARD_STATUSES,
  AGENT_RATE_CARD_ACTIONS,
  AGENT_RATE_LIMITS,
  AGENT_RATE_REASONS,
  SHOP_RATE_CARD_KEYS,
  SHOP_RATE_KEYS,
  AGENT_RATE_AUDIT_KEYS,
  rateCardTransition,
  normalizeAgentRate,
  dateRangesOverlap,
  rateRowsConflict,
  resolveAgentLayer,
  decideCommissionVatMode,
  buildAgencyPricingInput,
} from "./rates-core";
export type {
  AgentTierCode,
  AgentRateMode,
  AgentRateCardStatus,
  AgentRateCardAction,
  AgentRateReason,
  RateRow,
  RateCardRow,
  RateFacts,
  LayerTrace,
  RateTrace,
  AgencyPricingBuilt,
} from "./rates-core";
export {
  ensureAgentTiers,
  listAgentTiers,
  setAgentAccountTier,
  listAgentRateCards,
  getAgentRateCard,
  createAgentRateCard,
  updateAgentRateCard,
  setAgentRateCardStatus,
  upsertAgentRate,
  setAgentRateActive,
  agencyPricingPort,
  installAgencyPricingPort,
  tryAgentPrice,
} from "./rates";
export type { RatesCtx, RatesOpts, AgentTierDTO, ShopRateDTO, ShopRateCardDTO, ShopRateCardListItem, TryAgentPriceResult } from "./rates";
// ◂ TRIPS A1.3a
