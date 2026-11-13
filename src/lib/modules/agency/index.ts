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
