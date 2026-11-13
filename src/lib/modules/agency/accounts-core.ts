// ─────────────────────────────────────────────────────────────
// agency/accounts-core.ts — ส่วนบริสุทธิ์ของทะเบียนเอเจนซี่ต่อร้าน + ล็อกอินเอเจนซี่ · RUN TRIPS A1.2a
//   ใบสั่ง ledger/trips-briefs/A1.2.md §3 §5.0 §5.6 §7.2 (มติผู้คุม R1–R5)
//
// 🔴 บริสุทธิ์: import ได้เฉพาะ zod + import type · ไม่แตะฐาน · ไม่อ่าน env · ไม่อ่านนาฬิกา (ผู้เรียกส่ง today/now)
// 🔴 AGENT_AUTH_LIMITS อยู่ที่นี่ "ชุดเดียว" (มติ R2) เพราะทั้ง platform/agent-auth.ts (re-export ตามลายเซ็น §5.1)
//    และ agency/accounts.ts (โมดูล import platform ไม่ได้) ต้องใช้ค่าเดียวกัน · ห้ามมีค่าคงที่ของการล็อกอิน/เพดานนอกตารางนี้
// ─────────────────────────────────────────────────────────────
import type { AgentRole } from "./identity-core";

// ═══════════════ สถานะ · การกระทำ · เหตุปิด (§3 · §3.1) ═══════════════
export const AGENT_ACCOUNT_STATUSES = ["INVITED", "PENDING", "ACTIVE", "SUSPENDED", "CLOSED"] as const;
export type AgentAccountStatus = (typeof AGENT_ACCOUNT_STATUSES)[number];
export const AGENT_ACCOUNT_ACTIONS = [
  "INVITE",
  "APPLY",
  "AUTO_APPROVE",
  "ACCEPT_INVITE",
  "ACCEPT_INVITE_UNVERIFIED",
  "REVOKE_INVITE",
  "APPROVE",
  "REJECT",
  "WITHDRAW",
  "SUSPEND",
  "REINSTATE",
  "CLOSE",
  "REAPPLY",
  "REAPPLY_AUTO",
  "IDENTITY_CLOSED",
] as const;
export type AgentAccountAction = (typeof AGENT_ACCOUNT_ACTIONS)[number];
/** = statusReason เมื่อ CLOSED (รหัสเท่านั้น) */
export const AGENT_CLOSE_REASONS = ["REJECTED", "WITHDRAWN", "INVITE_REVOKED", "CLOSED_BY_SHOP", "IDENTITY_CLOSED"] as const;
export type AgentCloseReason = (typeof AGENT_CLOSE_REASONS)[number];
/** สมัครซ้ำ ⇒ PENDING เสมอ + รอ reapplyCooldownDays (§6 ข้อ 5 · มติ R1 ข้อ 6) */
export const STICKY_CLOSE_REASONS = ["REJECTED", "CLOSED_BY_SHOP"] as const;
export type AgentTransitionActor = "SHOP" | "AGENT" | "SYSTEM";
export type AgentTransition = { to: AgentAccountStatus; reason: AgentCloseReason | null; actor: AgentTransitionActor };

const T = (to: AgentAccountStatus, actor: AgentTransitionActor, reason: AgentCloseReason | null = null): AgentTransition => ({ to, reason, actor });
/** ผังสถานะ §3.1 — คีย์ `${from ?? "-"}|${action}` · คู่อื่นทั้งหมด = ห้าม */
const TRANSITIONS: Readonly<Record<string, AgentTransition>> = {
  "-|INVITE": T("INVITED", "SHOP"),
  "-|APPLY": T("PENDING", "AGENT"),
  "-|AUTO_APPROVE": T("ACTIVE", "AGENT"),
  "INVITED|ACCEPT_INVITE": T("ACTIVE", "AGENT"),
  "INVITED|ACCEPT_INVITE_UNVERIFIED": T("PENDING", "AGENT"),
  "INVITED|REVOKE_INVITE": T("CLOSED", "SHOP", "INVITE_REVOKED"),
  "PENDING|APPROVE": T("ACTIVE", "SHOP"),
  "PENDING|REJECT": T("CLOSED", "SHOP", "REJECTED"),
  "PENDING|WITHDRAW": T("CLOSED", "AGENT", "WITHDRAWN"),
  "PENDING|SUSPEND": T("SUSPENDED", "SHOP"),
  "ACTIVE|SUSPEND": T("SUSPENDED", "SHOP"),
  "SUSPENDED|REINSTATE": T("ACTIVE", "SHOP"),
  "ACTIVE|CLOSE": T("CLOSED", "SHOP", "CLOSED_BY_SHOP"),
  "SUSPENDED|CLOSE": T("CLOSED", "SHOP", "CLOSED_BY_SHOP"),
  "CLOSED|REAPPLY": T("PENDING", "AGENT"),
  "CLOSED|REAPPLY_AUTO": T("ACTIVE", "AGENT"),
  "INVITED|IDENTITY_CLOSED": T("CLOSED", "SYSTEM", "IDENTITY_CLOSED"),
  "PENDING|IDENTITY_CLOSED": T("CLOSED", "SYSTEM", "IDENTITY_CLOSED"),
  "ACTIVE|IDENTITY_CLOSED": T("CLOSED", "SYSTEM", "IDENTITY_CLOSED"),
  "SUSPENDED|IDENTITY_CLOSED": T("CLOSED", "SYSTEM", "IDENTITY_CLOSED"),
};

/**
 * ผังสถานะของ AgentAccount (§3.1) — null = ห้าม · ผลเป็นอ็อบเจกต์ใหม่ทุกครั้ง
 * เงื่อนไขเสริมที่ผังไม่ถือ (ผู้เรียกตรวจเอง): REINSTATE เฉพาะแถวที่ approvedAt ไม่ null · REAPPLY* เฉพาะแถวที่มี identityId ·
 * REAPPLY_AUTO ห้ามเมื่อ statusReason ∈ STICKY_CLOSE_REASONS
 */
export function agentAccountTransition(from: AgentAccountStatus | null, action: AgentAccountAction): AgentTransition | null {
  if (from !== null && !(AGENT_ACCOUNT_STATUSES as readonly unknown[]).includes(from)) return null;
  if (!(AGENT_ACCOUNT_ACTIONS as readonly unknown[]).includes(action)) return null;
  const t = TRANSITIONS[`${from ?? "-"}|${action}`];
  return t ? { to: t.to, reason: t.reason, actor: t.actor } : null;
}
export const isStickyCloseReason = (r: unknown): boolean => (STICKY_CLOSE_REASONS as readonly unknown[]).includes(r);

// ═══════════════ ผลล้ม ═══════════════
export const AGENCY_ERROR_CODES = [
  "VALIDATION",
  "NOT_FOUND",
  "FORBIDDEN",
  "BAD_STATE",
  "STALE",
  "RATE_LIMITED",
  "BUSY",
  "INVALID_CODE",
  "LOGIN_UNAVAILABLE",
  "INVITE_INVALID",
  "ALREADY_LINKED",
  "ALREADY_REGISTERED",
  "LAST_OWNER",
  "CODE_TAKEN",
  "IDEMPOTENCY_CONFLICT",
  "CRM_NOT_AVAILABLE",
  "CRM_PARTY_MISMATCH",
] as const;
export type AgencyErrorCode = (typeof AGENCY_ERROR_CODES)[number];
export type AgencyFail = { ok: false; code: AgencyErrorCode; message: string; reason?: string; retryAfterSec?: number };
/** ข้อความต่อรหัส (เหมือนกันทุกไบต์ไม่ว่าสาเหตุจริงเป็นอะไร · ไม่มีค่าของผู้เรียก/ร้านอื่น · §8 ข้อ 3) */
export const AGENCY_FAIL_MESSAGES: Readonly<Record<AgencyErrorCode, string>> = {
  VALIDATION: "ข้อมูลไม่ถูกต้อง — ตรวจช่องที่กรอกแล้วลองใหม่",
  NOT_FOUND: "ไม่พบรายการนี้",
  FORBIDDEN: "ไม่มีสิทธิ์ทำรายการนี้",
  BAD_STATE: "สถานะปัจจุบันทำรายการนี้ไม่ได้",
  STALE: "ข้อมูลถูกแก้โดยคนอื่นแล้ว — โหลดใหม่แล้วลองอีกครั้ง",
  RATE_LIMITED: "ทำรายการถี่เกินไป — รอสักครู่แล้วลองใหม่",
  BUSY: "ระบบไม่ว่างชั่วคราว — ลองใหม่อีกครั้ง",
  INVALID_CODE: "รหัสไม่ถูกต้องหรือหมดอายุ — ขอรหัสใหม่แล้วลองอีกครั้ง",
  LOGIN_UNAVAILABLE: "เข้าสู่ระบบด้วยอีเมลนี้ไม่ได้",
  INVITE_INVALID: "คำเชิญนี้ใช้ไม่ได้หรือหมดอายุแล้ว",
  ALREADY_LINKED: "เอเจนซี่นี้มีบัญชีกับร้านนี้อยู่แล้ว",
  ALREADY_REGISTERED: "เอเจนซี่นี้ลงทะเบียนกับร้านนี้แล้ว",
  LAST_OWNER: "ต้องมีเจ้าของอย่างน้อยหนึ่งคนเสมอ",
  CODE_TAKEN: "รหัสเอเจนซี่นี้ถูกใช้แล้วในร้านนี้",
  IDEMPOTENCY_CONFLICT: "คีย์กันซ้ำนี้ถูกใช้กับคำขออื่นแล้ว",
  CRM_NOT_AVAILABLE: "ร้านนี้ยังไม่มีระบบ CRM",
  CRM_PARTY_MISMATCH: "บริษัทใน CRM นี้เป็นคนละรายกับเอเจนซี่",
};
export function agencyFail(code: AgencyErrorCode, extra: { reason?: string; retryAfterSec?: number } = {}): AgencyFail {
  const f: AgencyFail = { ok: false, code, message: AGENCY_FAIL_MESSAGES[code] };
  if (extra.reason !== undefined) f.reason = extra.reason;
  if (extra.retryAfterSec !== undefined) f.retryAfterSec = extra.retryAfterSec;
  return f;
}

// ═══════════════ ค่าคงที่ของแพลตฟอร์ม (§5.0 · มติ R2 — ชุดเดียวที่อนุญาต) ═══════════════
type Bucket = { limit: number; windowMin: number };
export type AgentAuthLimits = {
  codeTtlMin: number;
  codeMaxAttempts: number;
  codePerTarget: Bucket;
  codePerTargetDay: Bucket;
  codePerClient: Bucket;
  codePerIp: Bucket;
  verifyPerClient: Bucket;
  verifyPerCode: Bucket;
  sessionTtlDays: number;
  sessionIdleHours: number;
  maxSessionsPerUser: number;
  shopInviteTtlDays: number;
  teammateInviteTtlMin: number;
  applyPerClient: Bucket;
  applyPerIdentity: Bucket;
  applyPerShop: Bucket;
  openPendingPerShop: number;
  openCodeInvitesPerIdentity: number;
  inviteAcceptPerClient: Bucket;
  lookupByCodePerActor: Bucket;
  reapplyCooldownDays: number;
  sweepBatch: number;
};
export const AGENT_AUTH_LIMITS: AgentAuthLimits = {
  codeTtlMin: 10,
  codeMaxAttempts: 5,
  codePerTarget: { limit: 3, windowMin: 15 },
  codePerTargetDay: { limit: 10, windowMin: 1440 },
  codePerClient: { limit: 30, windowMin: 15 },
  codePerIp: { limit: 60, windowMin: 60 },
  verifyPerClient: { limit: 60, windowMin: 15 },
  verifyPerCode: { limit: 10, windowMin: 15 },
  sessionTtlDays: 30,
  sessionIdleHours: 72,
  maxSessionsPerUser: 20,
  shopInviteTtlDays: 14,
  teammateInviteTtlMin: 2880,
  applyPerClient: { limit: 20, windowMin: 60 },
  applyPerIdentity: { limit: 10, windowMin: 1440 },
  applyPerShop: { limit: 30, windowMin: 60 },
  openPendingPerShop: 200,
  openCodeInvitesPerIdentity: 20,
  inviteAcceptPerClient: { limit: 20, windowMin: 15 },
  lookupByCodePerActor: { limit: 30, windowMin: 60 },
  reapplyCooldownDays: 7,
  sweepBatch: 5000,
};
/** ถัง → ตัวเลือกของ checkRateLimitDb */
export const bucketOpts = (b: Bucket): { limit: number; windowMs: number } => ({ limit: b.limit, windowMs: b.windowMin * 60_000 });

// ═══════════════ รูปแบบ ═══════════════
export const AGENCY_APPLY_PRIVACY_NOTICE_VERSION = "agency-apply-v1";
/** §5.4 — สร้างที่เซิร์ฟเวอร์ (A1.2b) · บริการตรวจรูปเท่านั้น ไม่ถือเป็นตัวตนที่เชื่อถือ */
export const AGENT_CLIENT_KEY_RE = /^[A-Za-z0-9_:.-]{8,128}$/;
/** §4 — "ag_" + base64url(32 ไบต์) · ไม่ตรงรูป ⇒ ปฏิเสธก่อนแฮช */
export const AGENT_SESSION_TOKEN_RE = /^ag_[A-Za-z0-9_-]{43}$/;
export const AGENT_LOGIN_CODE_RE = /^[0-9]{6}$/;

// ═══════════════ DTO ฝั่งร้าน (§7.2 ตรงตัว) ═══════════════
export const SHOP_AGENT_ACCOUNT_KEYS: readonly string[] = [
  "id", "code", "kind", "status", "closeReason", "legalName", "payeeType", "country", "branchCode", "vatRegistered", "treaty", "taxIdLast4", "bankLast4",
  "contact", "licence", "unitIds", "tierId", "partyId", "crm", "identity", "members", "invite", "approvedAt", "suspendedAt", "createdAt", "updatedAt", "warnings",
];
export const SHOP_AGENT_LIST_KEYS: readonly string[] = ["id", "code", "legalName", "status", "closeReason", "payeeType", "publicCode", "licenceWarnings", "memberCount", "createdAt", "updatedAt"];
export const NEVER_SHOW_TO_SHOP_KEYS = [
  "identityId", "agentUserId", "lastLoginAt", "providerId", "subject", "activeAgentAccountId", "taxIdHash", "taxIdEnc", "bankAccountEnc", "inviteTokenHash", "tokenHash", "codeHash", "target", "tenantIds", "otherAccounts",
] as const;

// ═══════════════ ข้อความอิสระ (§3.2 — สูตรเดียวกับ trips/booking-core.ts:24–28 + T0.6 §17) ═══════════════
const BAD_CHARS = /[\u0000-\u001f\u007f-\u009f\u061c\u200b\u200e\u200f\u2028-\u202e\u2066-\u2069\ufeff]/;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const STRIP_SOFT = /[\u200b\ufeff]/g;
/** ตัด ZWSP/BOM → NFC → trim · ว่าง/เกิน max/อักขระควบคุม (C0 รวม TAB/LF/CR · C1 · DEL · ตัวกลับทิศ · U+2028/9 · surrogate เดี่ยว) ⇒ null */
export function cleanAgencyText(raw: unknown, max: number): string | null {
  if (typeof raw !== "string" || !Number.isInteger(max) || max < 1) return null;
  if (LONE_SURROGATE.test(raw)) return null;
  const s = raw.replace(STRIP_SOFT, "").normalize("NFC").trim();
  if (s.length === 0 || s.length > max) return null;
  if (BAD_CHARS.test(s) || LONE_SURROGATE.test(s)) return null;
  return s;
}

// ═══════════════ ใบอนุญาต (§3.3 · WARN เท่านั้น) ═══════════════
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** วันจริงรูป YYYY-MM-DD (2026-02-30 ⇒ false) — ไม่อ่านนาฬิกา */
export function isRealYmd(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = YMD_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}
export type LicenceWarning = "LICENCE_EXPIRED" | "LICENCE_EXPIRY_TOO_FAR";
/** expiry < today ⇒ LICENCE_EXPIRED · > today + 2 ปี ⇒ LICENCE_EXPIRY_TOO_FAR (ม.22/1 [V]) · ไม่ตรวจรูปแบบเลข [U] · ไม่บล็อก */
export function licenceWarnings(l: { no: string | null; expiry: string | null }, today: string): LicenceWarning[] {
  const exp = l?.expiry ?? null;
  if (!isRealYmd(exp) || !isRealYmd(today)) return [];
  if (exp < today) return ["LICENCE_EXPIRED"];
  const limit = `${String(Number(today.slice(0, 4)) + 2).padStart(4, "0")}${today.slice(4)}`;
  return exp > limit ? ["LICENCE_EXPIRY_TOO_FAR"] : [];
}

// ═══════════════ อีเมล ═══════════════
/** "s•••@e•••.com" — ไม่มีส่วน local/โดเมนเต็ม */
export function maskEmail(email: string): string {
  const s = typeof email === "string" ? email.trim() : "";
  const at = s.lastIndexOf("@");
  if (at < 1) return "•••";
  const local = s.slice(0, at), domain = s.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${local.slice(0, 1)}•••@${host.slice(0, 1)}•••${tld}`;
}

/**
 * จดหมายรหัสเข้าระบบ (§5.6 · มติ R1 ข้อ 3) — รับรหัสอย่างเดียว ⇒ เหมือนกันทุกไบต์ไม่ว่าผู้รับมี/ไม่มีบัญชี
 * มีแค่รหัส + อายุ + "ถ้าไม่ได้ขอ ไม่ต้องทำอะไร" · ไม่มีชื่อร้าน/เอเจนซี่ · ไม่มีลิงก์กดได้
 */
export function agentLoginCodeMail(code: string): { subject: string; text: string; html: string } {
  const c = String(code).replace(/[^0-9]/g, "").slice(0, 6);
  const ttl = AGENT_AUTH_LIMITS.codeTtlMin;
  const subject = `รหัสเข้าระบบเอเจนซี่ SHARK: ${c}`;
  const text = [
    `รหัสเข้าระบบเอเจนซี่ของคุณคือ ${c}`,
    `รหัสนี้ใช้ได้ ${ttl} นาที และใช้ได้ครั้งเดียว`,
    "ถ้าคุณไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร — ไม่มีใครเข้าระบบได้หากไม่มีรหัสนี้",
    "อย่าบอกรหัสนี้กับใคร พนักงาน SHARK และร้านค้าจะไม่ขอรหัสนี้จากคุณ",
  ].join("\n");
  const html = [
    `<p>รหัสเข้าระบบเอเจนซี่ของคุณคือ</p>`,
    `<p style="font-size:28px;font-weight:700;letter-spacing:6px">${c}</p>`,
    `<p>รหัสนี้ใช้ได้ ${ttl} นาที และใช้ได้ครั้งเดียว</p>`,
    `<p>ถ้าคุณไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร — ไม่มีใครเข้าระบบได้หากไม่มีรหัสนี้</p>`,
    `<p>อย่าบอกรหัสนี้กับใคร พนักงาน SHARK และร้านค้าจะไม่ขอรหัสนี้จากคุณ</p>`,
  ].join("");
  return { subject, text, html };
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** จดหมายคำเชิญของร้าน (ร่างของ A1.2a — แม่แบบจริง = A1.2b §5.6) · ลิงก์ต้องมาจาก origin แพลตฟอร์มคงที่ (ผู้เรียกสร้าง) */
export function agentShopInviteMail(shopName: string, url: string, expiresYmd: string): { subject: string; text: string; html: string } {
  const name = cleanAgencyText(shopName, 200) ?? "ร้านค้า";
  const subject = `${name} เชิญคุณเป็นเอเจนซี่บน SHARK`;
  const text = [`${name} เชิญบริษัทของคุณเป็นเอเจนซี่`, `เปิดลิงก์นี้เพื่อตอบรับ (ใช้ได้ถึง ${expiresYmd}): ${url}`, "ถ้าคุณไม่รู้จักร้านนี้ ไม่ต้องทำอะไร"].join("\n");
  const html = `<p>${escHtml(name)} เชิญบริษัทของคุณเป็นเอเจนซี่</p><p><a href="${escHtml(url)}">ตอบรับคำเชิญ</a> (ใช้ได้ถึง ${escHtml(expiresYmd)})</p><p>ถ้าคุณไม่รู้จักร้านนี้ ไม่ต้องทำอะไร</p>`;
  return { subject, text, html };
}
/** จดหมายเชิญเพื่อนร่วมทีม (ร่างของ A1.2a) — ไม่มีชื่อผู้เชิญ/ชื่อเอเจนซี่ (ผู้รับเห็นหลังเข้าระบบเท่านั้น) */
export function agentTeammateInviteMail(url: string): { subject: string; text: string; html: string } {
  const subject = "คำเชิญเข้าทีมเอเจนซี่บน SHARK";
  const text = ["มีผู้เชิญคุณเข้าทีมเอเจนซี่บน SHARK", `เปิดลิงก์นี้แล้วเข้าระบบด้วยอีเมลนี้เพื่อตอบรับ (ใช้ได้ ${Math.round(AGENT_AUTH_LIMITS.teammateInviteTtlMin / 60)} ชั่วโมง): ${url}`, "ถ้าคุณไม่ได้คาดว่าจะได้คำเชิญนี้ ไม่ต้องทำอะไร"].join("\n");
  const html = `<p>มีผู้เชิญคุณเข้าทีมเอเจนซี่บน SHARK</p><p><a href="${escHtml(url)}">ตอบรับคำเชิญ</a> (เข้าระบบด้วยอีเมลนี้)</p><p>ถ้าคุณไม่ได้คาดว่าจะได้คำเชิญนี้ ไม่ต้องทำอะไร</p>`;
  return { subject, text, html };
}

// ═══════════════ บทบาท ═══════════════
const ROLE_RANK: Readonly<Record<AgentRole, number>> = { OWNER: 0, ADMIN: 1, SALES: 2, ACCOUNTING: 2 };
export const agentRoleRank = (r: AgentRole): number => ROLE_RANK[r];
/** ลดบทบาทไหลลง (§9 · มติ R1 ข้อ 7): min(เดิม, ใหม่) · ระดับเท่ากัน (SALES↔ACCOUNTING) = ใหม่ */
export function cascadeMemberRole(memberRole: AgentRole, newUserRole: AgentRole): AgentRole {
  return ROLE_RANK[newUserRole] >= ROLE_RANK[memberRole] ? newUserRole : memberRole;
}
/** ผู้กระทำบทบาท actor ให้/ถอด/แก้บทบาท target ได้ไหม: OWNER ทุกบทบาท · ADMIN เฉพาะ SALES/ACCOUNTING · อื่นไม่ได้ */
export function canManageAgentRole(actor: AgentRole, target: AgentRole): boolean {
  if (actor === "OWNER") return true;
  if (actor === "ADMIN") return target === "SALES" || target === "ACCOUNTING";
  return false;
}
