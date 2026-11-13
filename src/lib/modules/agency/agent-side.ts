// ─────────────────────────────────────────────────────────────
// agency/agent-side.ts — ทางเข้าฝั่งเอเจนซี่ (ฟังก์ชันที่รับ actor { agentUserId }) · RUN TRIPS A1.2a (ใบสั่ง §2 §5.3 §6 §9 · มติ R1 ข้อ 10)
//
// 🔴 import ได้เฉพาะจาก src/lib/platform/agent-auth.ts (ข้อสอบ S-12) — actor ต้องมาจาก session ที่ resolve แล้วเท่านั้น
// 🔴 ไม่อยู่บน facade agency/index.ts · re-export รายการชัด (ไม่มี export *)
// ─────────────────────────────────────────────────────────────
export { applyToShop, acceptShopInvite, withdrawApplication } from "./accounts";
export type { AgentActor, AgentApplication, AccountWriteResult, AgencyDeps, AgencyMail, AgencyOpts, AgencyRateLimiter } from "./accounts";
export { setAgentUserRole, disableAgentUser, eraseAgentUser, closeAgentIdentity, setAgentAccountMember, listAgentTeam } from "./entry";
// ตัวช่วยของ platform/agent-auth.ts (กุญแจ/token · ตัวช่วยตาราง global ใน tx · ค่าคงที่ชุดเดียว)
export { AGENT_AUTH_LIMITS, AGENT_CLIENT_KEY_RE, agencyFail, agentLoginCodeMail, agentTeammateInviteMail, bucketOpts, cleanAgencyText, maskEmail } from "./accounts-core";
export type { AgencyFail, AgentAuthLimits } from "./accounts-core";
export {
  AgentKeyMissing,
  agentAuthHash,
  agentAuthKeyReady,
  isAgentLoginCodeShape,
  isAgentSessionTokenShape,
  newAgentLoginCode,
  newAgentRowId,
  newAgentSessionToken,
  openTeammateToken,
  safeEqualStr,
  signTeammateToken,
} from "./tokens";
export {
  agentActorNow,
  agentUserOfEmailLoginInTx,
  createAgentIdentityInTx,
  createTeammateUserInTx,
  lockAgencyKeyInTx,
  teammateInviterValidInTx,
} from "./entry";
export type { AgentIdentityPublic } from "./entry";
export { AGENT_ROLES, normalizeAgentLogin } from "./identity-core";
export type { AgentRole } from "./identity-core";
