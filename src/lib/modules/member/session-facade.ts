// session-facade.ts — facade ที่สอง (ชัดเจน · แคบ) ของโมดูลสมาชิก: ผิว "session ลูกค้า/พอร์ทัล" เท่านั้น (ใบ CRM v2 C3.5 · มติผู้คุมงาน)
//
// ทำไมไม่ใช้ `@/lib/modules/member` (index.ts): facade หลักลาก wallet → giftcard → pos → outbox-consumers → บัญชี เข้ากราฟ
//   ⇒ เมื่อ `crm/api` (ทะเบียน REST/AI ที่บัญชีโหลดผ่าน crm facade) import มันแบบค่า จะเกิดวงโหลดของบัญชี (TDZ `VISIBLE_DOC_TYPES`
//   — fitness F10.1 แดงจริงตอนทำใบ C3.5) · ไฟล์นี้ส่งต่อเฉพาะ `customer-session.ts` + `customer-cookie.ts` (hash · limiter · prisma)
//   ซึ่งไม่ import โมดูลใดเลย ⇒ ไม่มีวง
// 🔴 re-export ล้วน ไม่มีตรรกะ · โมดูลอื่นแตะผิว session ของสมาชิกได้ผ่านไฟล์นี้หรือ index.ts เท่านั้น (fitness F2.4 — ผู้เรียกฝั่ง CRM/พอร์ทัล)
// 🔴 ห้ามเพิ่มของที่ลากโมดูลอื่นเข้ากราฟ (ถ้าจำเป็นต้องใช้ ให้ไปทาง index.ts)
export {
  PORTAL_TOKEN_PREFIX,
  isPortalToken,
  portalCookieName,
  mintPortalSession,
  getPortalSession,
  revokePortalSession,
  revokeAllPortalSessions,
  requestPortalOtp,
  verifyPortalOtp,
  hitPortalInviteLimit,
  requirePortalSession,
  portalTokenFromCookies,
  sweepPortalSessions,
  portalSecretReady,
  portalIpHash,
  CustomerAuthError,
  CustomerRateLimitError,
} from "./customer-session";
export type { PortalSessionInfo, PortalSessionToken, PortalPageSession, RequestOtpResult } from "./customer-session";
export { customerCookieOptions, appRequiresSecureCookies } from "./customer-cookie";
