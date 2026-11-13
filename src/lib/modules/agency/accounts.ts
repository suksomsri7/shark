// ─────────────────────────────────────────────────────────────
// agency/accounts.ts — ทะเบียนเอเจนซี่ต่อร้าน: ฝั่งร้าน (§7) + ฝั่งเอเจนซี่ที่แตะตาราง tenant (§6) · RUN TRIPS A1.2a
//   ใบสั่ง ledger/trips-briefs/A1.2.md (มติผู้คุม R1–R5)
//
// 🔴 ตาราง tenant ผ่าน tenantDb เท่านั้น · ไม่ import prisma (F5 คง 52) · ตาราง global อ่าน/เขียนผ่านตัวช่วยของ ./entry เท่านั้น (F17.1)
// 🔴 ไม่มี DB connection ที่สองใน tx: ค่าตั้ง · Party · CRM · rate limit · อีเมล เรียกนอก tx · audit/outbox เขียนใน tx (tx.auditLog / tx.outboxEvent)
// 🔴 ทุกการเปลี่ยนสถานะ = CAS (updateMany where status = from) ต้องได้ 1 แถว ไม่งั้นอ่านใหม่ → ปลายทางตรง = replayed · อื่น = BAD_STATE
// 🔴 ฝั่งเอเจนซี่ (applyToShop · acceptShopInvite · withdrawApplication) ส่งออกทาง agent-side.ts เท่านั้น (ไม่อยู่บน facade)
// 🔴 ร้านไม่เห็นค่าใดของร้านอื่น · DTO มีเฉพาะคีย์ใน SHOP_AGENT_*_KEYS · ไม่มี agentUserId/identityId/ค่าลับ
// 🔴 ไม่มีอีเมล/token/รหัส/ชื่อ ใน audit · event (payload {agentAccountId}) · ops log · ข้อความ error
// ─────────────────────────────────────────────────────────────
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma, PartyKind } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { resolveSettingsMany } from "@/lib/core/settings";
import { integrationSecretKeyConfigured, sealIntegrationSecret } from "@/lib/core/integrations/secret-box";
import { sendEmailRich } from "@/lib/core/email";
import { env } from "@/lib/env";
import { AGENT_PUBLIC_CODE_ALPHABET, normalizeAgentLogin, normalizeJuristicTaxId, type AgentRole } from "./identity-core";
import {
  AGENCY_APPLY_PRIVACY_NOTICE_VERSION,
  AGENT_AUTH_LIMITS,
  agencyFail,
  agentAccountTransition,
  agentShopInviteMail,
  bucketOpts,
  cleanAgencyText,
  isRealYmd,
  isStickyCloseReason,
  licenceWarnings,
  type AgencyFail,
  type AgencyErrorCode,
  type AgentAccountAction,
  type AgentAccountStatus,
} from "./accounts-core";
import { AgentKeyMissing, agentAuthHash, agentAuthKeyReady, newAgentRowId, safeEqualStr, shopInviteToken, SHOP_INVITE_TOKEN_RE } from "./tokens";
import {
  agentActorInTx,
  agentActorNow,
  agentEmailTagsInTx,
  agentUserDisplayNames,
  countOpenCodeInvitesOfIdentity,
  findAgentIdentityByCode,
  identityOwnerIdsInTx,
  identityPublicByIds,
  lockAgencyKeyInTx,
  type AgentActorRow,
} from "./entry";

// ═══════════════ ชนิด ═══════════════
export type AgencyMail = { to: string; kind: "LOGIN_CODE" | "SHOP_INVITE" | "TEAMMATE_INVITE"; code?: string; token?: string; url?: string };
export type AgencyRateLimiter = (key: string, opts: { limit: number; windowMs: number }, nowMs: number) => Promise<{ ok: boolean; retryAfterSec?: number; count?: number }>;
/** จุดต่อของข้อสอบเท่านั้น — ตัวห่อของ A1.2b ไม่รับ now/deps จากผู้ใช้ */
export type AgencyDeps = { sendAgentMail?: (m: AgencyMail) => Promise<void>; rateLimit?: AgencyRateLimiter };
export type AgencyOpts = { now?: Date; deps?: AgencyDeps };
export type ShopCtx = { tenantId: string; actorUserId: string };
export type AgentActor = { agentUserId: string };
export type AgentPayeeType = "TH_JURISTIC" | "TH_FOUNDATION" | "TH_PERSON" | "FOREIGN";
export type AgentApplication = {
  legalName: string;
  payeeType: AgentPayeeType;
  taxId?: string;
  branchCode?: string;
  country?: string;
  vatRegistered?: boolean;
  contact: { name: string; phone?: string; email?: string; lineId?: string };
  licenceNo?: string;
  licenceExpiry?: string;
  consentVersion: string;
};
export type AccountWriteResult = { ok: true; agentAccountId: string; status: AgentAccountStatus; replayed: boolean } | AgencyFail;
export type ShopAgentContact = { name: string | null; phone: string | null; email: string | null; lineId: string | null; consentVersion: string | null; consentAt: string | null; source: string | null };
export type ShopAgentAccountDTO = {
  id: string;
  code: string;
  kind: string;
  status: AgentAccountStatus;
  closeReason: string | null;
  legalName: string;
  payeeType: string;
  country: string;
  branchCode: string | null;
  vatRegistered: boolean;
  treaty: boolean | null;
  taxIdLast4: string | null;
  bankLast4: string | null;
  contact: ShopAgentContact;
  licence: { no: string | null; expiry: string | null; warnings: string[] };
  unitIds: string[];
  tierId: string | null;
  partyId: string;
  crm: { companyId: string; name: string | null; live: boolean } | null;
  identity: { publicCode: string; displayName: string; status: string } | null;
  members: { memberId: string; displayName: string; role: string; active: boolean }[];
  invite: { mode: "EMAIL" | "CODE"; expiresAt: string | null; expired: boolean } | null;
  approvedAt: string | null;
  suspendedAt: string | null;
  createdAt: string;
  updatedAt: string;
  warnings: string[];
};
export type ShopAgentListItem = {
  id: string;
  code: string;
  legalName: string;
  status: AgentAccountStatus;
  closeReason: string | null;
  payeeType: string;
  publicCode: string | null;
  licenceWarnings: string[];
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

type Tx = Prisma.TransactionClient;
type Db = ReturnType<typeof tenantDb>;
type CrmMod = typeof import("@/lib/modules/crm");

// ═══════════════ ค่าคงที่ของรูปแบบ (ไม่ใช่ค่าธุรกิจ) ═══════════════
const TX_OPTS = { maxWait: 10_000, timeout: 30_000 } as const;
const PAYEE_TYPES = ["TH_JURISTIC", "TH_FOUNDATION", "TH_PERSON", "FOREIGN"] as const;
const SELLING_UNIT_TYPES = ["TRIPS", "TICKET"] as const;
const REQ_KEY = "agency.signup.requireApproval";
const TIER_KEY = "agency.tier.newAgentTier";
const DAY_MS = 86_400_000;
const IDEM_WINDOW_MS = DAY_MS; // ย้อนหาแถว audit กันซ้ำ 24 ชม. (§7.4)
const ID = z.string().min(1).max(64);
const IDEM = z.string().regex(/^[A-Za-z0-9_-]{8,90}$/);
const SHOP_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{1,15}$/;
const UNIT_IDS = z.array(ID).max(50);
const ACTOR = z.object({ agentUserId: ID }).strict();
const CTX = z.object({ tenantId: ID, actorUserId: ID }).strict();

// ═══════════════ ตัวช่วยทั่วไป ═══════════════
class Abort extends Error {
  constructor(readonly fail: AgencyFail) {
    super(fail.code);
  }
}
const stop = (code: AgencyErrorCode, reason?: string): never => {
  throw new Abort(agencyFail(code, reason ? { reason } : {}));
};
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const iso = (d: Date | null | undefined): string | null => (d instanceof Date ? d.toISOString() : null);
const ymdOfDate = (d: Date | null | undefined): string | null => (d instanceof Date ? d.toISOString().slice(0, 10) : null);
/** วันที่ไทย (Asia/Bangkok) ของ now — ใช้ตัดสินใบอนุญาตหมดอายุ */
const thaiToday = (now: Date): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const canonical = (v: unknown): unknown => (Array.isArray(v) ? v.map(canonical) : isRec(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v);
const randomShopCode = (): string => [...randomBytes(6)].map((b) => AGENT_PUBLIC_CODE_ALPHABET[b % AGENT_PUBLIC_CODE_ALPHABET.length]).join("");
const partyKindOf = (payeeType: string): PartyKind => (payeeType === "TH_PERSON" ? "PERSON" : "COMPANY");
const asStatus = (s: string): AgentAccountStatus => s as AgentAccountStatus;
const platformOrigin = (): string => new URL(env.APP_URL).origin;

const pgCodeOf = (e: unknown): string | null => {
  const seen = new Set<unknown>();
  const stack: unknown[] = [e];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    const o = cur as Record<string, unknown>;
    if (o.code === "P2002") return "23505";
    if (o.code === "P2034") return "40001";
    if (o.code === "P2028") return "TX_TIMEOUT";
    for (const k of ["code", "originalCode"]) if (typeof o[k] === "string" && /^[0-9A-Z]{5}$/.test(o[k] as string)) return o[k] as string;
    for (const v of Object.values(o)) if (v && typeof v === "object") stack.push(v);
  }
  return null;
};
/** ชื่อ unique constraint ที่ชน (ไม่มีค่าของแถว) */
const uniqueNameOf = (e: unknown): string => {
  const out: string[] = [];
  const seen = new Set<unknown>();
  const stack: unknown[] = [e];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    for (const v of Object.values(cur as Record<string, unknown>)) {
      if (typeof v === "string") for (const m of v.matchAll(/(AgentAccount_[A-Za-z_]+_key|tenantId,code|tenantId,identityId|inviteTokenHash)/g)) out.push(m[1]);
      else if (Array.isArray(v)) out.push(v.filter((x) => typeof x === "string").join(","));
      else if (v && typeof v === "object") stack.push(v);
    }
  }
  return out.join("|");
};

/** บันทึก ops ของ error ที่ไม่คาด: ชื่อ · รหัส Prisma/PG · constraint · stack frame — ไม่มีข้อความ/อินพุต (อาจมีอีเมล/ชื่อ) */
async function logUnexpected(where: string, e: unknown, tenantId: string | null): Promise<void> {
  const err = e instanceof Error ? e : null;
  const o = err ? (err as unknown as Record<string, unknown>) : {};
  const meta = isRec(o.meta) ? o.meta : {};
  const frames = err?.stack ? err.stack.split("\n").filter((l) => /^\s+at\s/.test(l)).slice(0, 8).map((l) => l.trim().slice(0, 200)) : [];
  const detail = { where, name: err ? err.name || "Error" : typeof e, code: typeof o.code === "string" ? o.code.slice(0, 16) : null, constraint: typeof meta.constraint === "string" ? meta.constraint : null, frames };
  await logOps("ERROR", "agency.accounts", `ข้อผิดพลาดที่ไม่คาดคิดใน ${where}`, { tenantId: tenantId ?? undefined, detail: JSON.stringify(detail) }).catch(() => undefined);
}
/** ห่อบริการ: ไม่ throw · Abort ⇒ ผลมีชื่อ · ไม่มีกุญแจ ⇒ BUSY SERVER_KEY_MISSING · ชน unique ⇒ แปลงตามชื่อ · อื่น ⇒ ops + BUSY */
async function safely<T>(where: string, tenantId: string | null, fn: () => Promise<T | AgencyFail>, onUnique?: (name: string) => AgencyFail | null): Promise<T | AgencyFail> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Abort) return e.fail;
    if (e instanceof AgentKeyMissing) return agencyFail("BUSY", { reason: "SERVER_KEY_MISSING" });
    const code = pgCodeOf(e);
    if (code === "23505" && onUnique) {
      const f = onUnique(uniqueNameOf(e));
      if (f) return f;
    }
    if (code === "40P01" || code === "40001" || code === "55P03" || code === "TX_TIMEOUT") return agencyFail("BUSY", { reason: "LOCK" });
    await logUnexpected(where, e, tenantId);
    return agencyFail("BUSY", { reason: "UNEXPECTED" });
  }
}
/** tx ของร้าน (tenantDb) + ลองใหม่ 1 ครั้งเมื่อ deadlock/serialization */
async function runTx<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await tenantDb({ tenantId }).$transaction((t) => fn(t as unknown as Tx), TX_OPTS);
    } catch (e) {
      const code = pgCodeOf(e);
      if ((code === "40P01" || code === "40001") && attempt === 0 && !(e instanceof Abort)) continue;
      throw e;
    }
  }
}

// ═══════════════ rate limit · จดหมาย ═══════════════
const limiterOf = (deps?: AgencyDeps): AgencyRateLimiter => deps?.rateLimit ?? ((key, o, nowMs) => checkRateLimitDb(key, o, nowMs));
/** ถังเดียว: คีย์ = prefix + agentAuthHash("rate", ค่า) · failClosed: ผลที่ไม่มี count (ตัวจำกัดล้ม) ⇒ RATE_LIMITED 60 */
async function bucket(deps: AgencyDeps | undefined, prefix: string, raw: string, b: { limit: number; windowMin: number }, now: Date, failClosed = false): Promise<AgencyFail | null> {
  const v = await limiterOf(deps)(`${prefix}${agentAuthHash("rate", raw)}`, bucketOpts(b), now.getTime());
  if (failClosed && typeof v.count !== "number") return agencyFail("RATE_LIMITED", { retryAfterSec: 60 });
  if (!v.ok) return agencyFail("RATE_LIMITED", { retryAfterSec: Math.max(1, Math.ceil(v.retryAfterSec ?? 60)) });
  return null;
}
/** ส่งนอกเส้นทางคำขอ (แบบ sendOtpMailOffPath) · ไม่เคยโยน · ล้ม ⇒ ops { kind, ref } เท่านั้น */
async function deliverShopInvite(deps: AgencyDeps | undefined, m: AgencyMail & { kind: "SHOP_INVITE"; token: string; url: string }, mail: { subject: string; text: string; html: string }, ref: string, tenantId: string): Promise<void> {
  const fail = () => logOps("WARN", "agency.mail", "ส่งจดหมายเอเจนซี่ไม่สำเร็จ", { tenantId, detail: JSON.stringify({ kind: m.kind, ref }) }).catch(() => undefined);
  if (deps?.sendAgentMail) {
    try {
      await deps.sendAgentMail(m);
    } catch {
      await fail();
    }
    return;
  }
  const deliver = async (): Promise<void> => {
    try {
      const r = await sendEmailRich({ to: [m.to], subject: mail.subject, html: mail.html, text: mail.text });
      if (!r.ok) await fail();
    } catch {
      await fail();
    }
  };
  let scheduled = false;
  try {
    const { after } = await import("next/server");
    after(deliver);
    scheduled = true;
  } catch {
    // นอกขอบเขตคำขอ — ยิงทิ้งพร้อม catch
  }
  if (!scheduled) void deliver();
}

// ═══════════════ อินพุต: ใบสมัคร · ข้อมูลภาษี ═══════════════
const thaiId13Ok = (s: string): boolean => {
  if (!/^[0-9]{13}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(s[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(s[12]);
};
/** เลขภาษีตามชนิดผู้รับเงิน (§6 ข้อ 1) — null = ไม่ส่ง · undefined = ผิด */
function normTaxId(payeeType: string, raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string" || raw.length > 40) return undefined;
  if (payeeType === "TH_JURISTIC" || payeeType === "TH_FOUNDATION") return normalizeJuristicTaxId(raw) ?? undefined;
  if (payeeType === "TH_PERSON") {
    const s = raw.replace(/[\s-]/g, "");
    return /^[1-9]/.test(s) && thaiId13Ok(s) ? s : undefined;
  }
  const s = cleanAgencyText(raw, 32);
  return s && /^[A-Za-z0-9-]{1,32}$/.test(s) ? s.toUpperCase() : undefined;
}
const last4Of = (v: string | null): string | null => {
  if (!v) return null;
  const s = v.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return s.length >= 4 ? s.slice(-4) : null;
};
const normEmail = (raw: unknown): string | null | undefined => {
  if (raw === undefined || raw === null) return null;
  const s = cleanAgencyText(raw, 254);
  if (!s) return undefined;
  return normalizeAgentLogin({ kind: "EMAIL", providerId: "email", subject: s })?.subject ?? undefined;
};
const optText = (raw: unknown, max: number): string | null | undefined => (raw === undefined || raw === null ? null : (cleanAgencyText(raw, max) ?? undefined));
const normBranch = (raw: unknown): string | null | undefined => (raw === undefined || raw === null ? null : typeof raw === "string" && /^[0-9]{5}$/.test(raw.trim()) ? raw.trim() : undefined);
const normCountry = (raw: unknown): string | undefined => (typeof raw === "string" && /^[A-Z]{2}$/.test(raw) ? raw : undefined);
const sealTax = (tenantId: string, accountId: string, field: "taxId" | "bank", v: string): string => sealIntegrationSecret({ v }, `agency.${field}:${tenantId}:${accountId}`);

const APPLICATION = z
  .object({
    legalName: z.string().max(400),
    payeeType: z.enum(PAYEE_TYPES),
    taxId: z.string().max(40).optional(),
    branchCode: z.string().max(10).optional(),
    country: z.string().max(4).optional(),
    vatRegistered: z.boolean().optional(),
    contact: z.object({ name: z.string().max(400), phone: z.string().max(80).optional(), email: z.string().max(400).optional(), lineId: z.string().max(128).optional() }).strict(),
    licenceNo: z.string().max(80).optional(),
    licenceExpiry: z.string().max(10).optional(),
    consentVersion: z.string().max(40),
  })
  .strict();
type NormApplication = {
  legalName: string;
  payeeType: AgentPayeeType;
  taxId: string | null;
  branchCode: string | null;
  country: string;
  vatRegistered: boolean;
  contact: { name: string; phone: string | null; email: string | null; lineId: string | null };
  licenceNo: string | null;
  licenceExpiry: string | null;
};
function normApplication(raw: unknown): NormApplication | null {
  const p = APPLICATION.safeParse(raw);
  if (!p.success) return null;
  const a = p.data;
  if (a.consentVersion !== AGENCY_APPLY_PRIVACY_NOTICE_VERSION) return null;
  const legalName = cleanAgencyText(a.legalName, 200);
  const name = cleanAgencyText(a.contact.name, 120);
  const phone = optText(a.contact.phone, 40);
  const email = normEmail(a.contact.email);
  const lineId = optText(a.contact.lineId, 64);
  const licenceNo = optText(a.licenceNo, 40);
  const taxId = normTaxId(a.payeeType, a.taxId);
  const branchCode = normBranch(a.branchCode);
  const country = a.country === undefined ? "TH" : normCountry(a.country);
  if (!legalName || !name || phone === undefined || email === undefined || lineId === undefined || licenceNo === undefined || taxId === undefined || branchCode === undefined || country === undefined) return null;
  if (a.licenceExpiry !== undefined && !isRealYmd(a.licenceExpiry)) return null;
  return { legalName, payeeType: a.payeeType, taxId, branchCode, country, vatRegistered: a.vatRegistered === true, contact: { name, phone, email, lineId }, licenceNo, licenceExpiry: a.licenceExpiry ?? null };
}

// ═══════════════ ร้าน · หน่วย · ค่าตั้ง (นอก tx) ═══════════════
type ShopInfo = { tenantId: string; slug: string; name: string; unitIds: string[] };
/** ร้านที่ขายทริป/ตั๋วได้ (Tenant ACTIVE + หน่วย TRIPS/TICKET ACTIVE เรียง createdAt,id) — ไม่ใช่ ⇒ null (NOT_FOUND ข้อความเดียวกับร้านที่ไม่มีจริง) */
async function sellingShop(tenantId: string): Promise<ShopInfo | null> {
  const db = tenantDb({ tenantId });
  const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true, slug: true, name: true, status: true } });
  if (!t || t.status !== "ACTIVE") return null;
  const units = await db.businessUnit.findMany({ where: { tenantId, type: { in: [...SELLING_UNIT_TYPES] }, status: "ACTIVE" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
  return units.length ? { tenantId: t.id, slug: t.slug, name: t.name, unitIds: units.map((u) => u.id) } : null;
}
/** A36 (ต้องอนุมัติ ถ้าหน่วยใดตั้ง true · มติ R3) + A2 (ระดับของหน่วยแรก → AgentTier.id ของร้าน · ไม่มีแถวระดับ ⇒ null) */
async function signupPolicy(shop: ShopInfo, now: Date): Promise<{ requireApproval: boolean; tierId: string | null }> {
  const outs = await resolveSettingsMany({ tenantId: shop.tenantId }, [REQ_KEY, TIER_KEY], shop.unitIds.map((unitId) => ({ unitId })), now);
  const requireApproval = outs.length === 0 || outs.some((o) => o[REQ_KEY]?.value !== false);
  const tierCode = outs[0]?.[TIER_KEY]?.value;
  let tierId: string | null = null;
  if (typeof tierCode === "string") {
    const t = await tenantDb({ tenantId: shop.tenantId }).agentTier.findFirst({ where: { tenantId: shop.tenantId, code: tierCode, active: true }, select: { id: true } });
    tierId = t?.id ?? null;
  }
  return { requireApproval, tierId };
}
async function unitsValid(db: Db, tenantId: string, unitIds: readonly string[]): Promise<boolean> {
  const uniq = [...new Set(unitIds)];
  if (!uniq.length) return true;
  const n = await db.businessUnit.count({ where: { tenantId, id: { in: uniq }, type: { in: [...SELLING_UNIT_TYPES] } } });
  return n === uniq.length;
}

// ═══════════════ ในธุรกรรม ═══════════════
async function auditInTx(tx: Tx, a: { tenantId: string; actorType: "USER" | "SYSTEM"; actorId: string | null; action: string; targetId: string; after: Record<string, unknown> }): Promise<void> {
  await tx.auditLog.create({ data: { tenantId: a.tenantId, actorType: a.actorType, actorId: a.actorId, action: a.action, targetType: "AgentAccount", targetId: a.targetId, after: a.after as Prisma.InputJsonValue } });
}
type AgencyEvent = "agency.account.applied" | "agency.account.approved" | "agency.account.suspended";
/** outbox ใน tx · payload { agentAccountId } เท่านั้น · คีย์ agency.account.<ชนิด>:<id>:<ms> · createdAt ระบุเอง (ลำดับ applied → approved) */
async function emitInTx(tx: Tx, tenantId: string, type: AgencyEvent, agentAccountId: string, at: Date): Promise<void> {
  const idempotencyKey = `${type}:${agentAccountId}:${at.getTime()}`;
  const ex = await tx.outboxEvent.findFirst({ where: { tenantId, idempotencyKey }, select: { id: true } });
  if (ex) return;
  await tx.outboxEvent.create({ data: { tenantId, type, idempotencyKey, payload: { agentAccountId }, createdAt: at, availableAt: at } });
}
async function ensureBalanceInTx(tx: Tx, tenantId: string, agentAccountId: string): Promise<void> {
  await tx.agentBalance.createMany({ data: [{ agentAccountId, tenantId }], skipDuplicates: true });
}
async function uniqueShopCodeInTx(tx: Tx, tenantId: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const c = randomShopCode();
    if (!(await tx.agentAccount.findFirst({ where: { tenantId, code: c }, select: { id: true } }))) return c;
  }
  return stop("BUSY", "CODE_EXHAUSTED");
}
/**
 * สมาชิกตามมติ R1 ข้อ 7: ผู้กระทำ (บทบาทของตน) + AgentUser ACTIVE role OWNER ทุกคนของตัวตน (role OWNER) · แถวเดิม ⇒ active + บทบาทตามนี้
 * คืน id ของแถวสมาชิกของผู้กระทำ (= actorId ของ audit ฝั่งเอเจนซี่ · §8 ข้อ 7)
 */
async function seatMembersInTx(tx: Tx, tenantId: string, agentAccountId: string, actor: AgentActorRow): Promise<string> {
  const owners = await identityOwnerIdsInTx(tx, actor.identityId);
  const want = new Map<string, AgentRole>(owners.map((id) => [id, "OWNER" as AgentRole]));
  if (!want.has(actor.id)) want.set(actor.id, actor.role);
  let actorMemberId = "";
  for (const [userId, role] of [...want.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const cur = await tx.agentAccountMember.findFirst({ where: { tenantId, agentAccountId, agentUserId: userId }, select: { id: true } });
    const id = cur
      ? (await tx.agentAccountMember.update({ where: { id: cur.id }, data: { role, active: true }, select: { id: true } })).id
      : (await tx.agentAccountMember.create({ data: { tenantId, agentAccountId, agentUserId: userId, role, active: true, addedByAgentUserId: actor.id }, select: { id: true } })).id;
    if (userId === actor.id) actorMemberId = id;
  }
  return actorMemberId;
}
const reloadStatus = async (tx: Tx, tenantId: string, id: string) => tx.agentAccount.findFirst({ where: { tenantId, id }, select: { status: true, statusReason: true } });

// ═══════════════════════════════════════════════════════════════
// §6 ฝั่งเอเจนซี่ที่แตะตาราง tenant (ส่งออกทาง agent-side.ts เท่านั้น)
// ═══════════════════════════════════════════════════════════════
const APPLY_INPUT = z.object({ tenantId: ID, application: z.unknown() }).strict();
const isAgentWriter = (a: AgentActorRow | null): a is AgentActorRow => !!a && (a.role === "OWNER" || a.role === "ADMIN");
const lockAccountPair = async (tx: Tx, identityId: string, tenantId: string): Promise<void> => {
  await lockAgencyKeyInTx(tx, "agency.identity.v1", identityId);
  await lockAgencyKeyInTx(tx, "agency.account.v1", `${tenantId}:${identityId}`);
};

/**
 * สมัครกับร้าน (§6) — OWNER/ADMIN · zod + cleanAgencyText → rate limit ตัวตน → ร้าน → ร้าน (ไม่ผ่านไม่นับ) → ร้านขายทริป/ตั๋ว → A36/A2 →
 * แถวเดิม (PENDING replayed · ACTIVE ALREADY_REGISTERED · SUSPENDED/INVITED BAD_STATE · CLOSED: STICKY ช่วงรอ ⇒ BAD_STATE / หลังนั้น PENDING เสมอ) →
 * Party ชื่ออย่างเดียว (ครั้งแรก) → ล็อกตัวตน → ล็อกบัญชี → อ่านผู้กระทำซ้ำ → INSERT/CAS + สมาชิก + balance + audit + event
 */
export async function applyToShop(actor: AgentActor, input: { tenantId: string; application: AgentApplication }, opts: AgencyOpts = {}): Promise<AccountWriteResult> {
  const a = ACTOR.safeParse(actor);
  const p = APPLY_INPUT.safeParse(input);
  const app = p.success ? normApplication(p.data.application) : null;
  if (!a.success || !p.success || !app) return agencyFail("VALIDATION");
  const tenantId = p.data.tenantId;
  const now = opts.now ?? new Date();
  return safely("applyToShop", tenantId, async () => {
    if (!agentAuthKeyReady()) return agencyFail("BUSY", { reason: "SERVER_KEY_MISSING" });
    if (app.taxId && !integrationSecretKeyConfigured()) return agencyFail("BUSY", { reason: "KEY_NOT_CONFIGURED" });
    const pre = await agentActorNow(a.data.agentUserId);
    if (!isAgentWriter(pre)) return agencyFail("FORBIDDEN");
    const rl = (await bucket(opts.deps, "agent:apply:i:", pre.identityId, AGENT_AUTH_LIMITS.applyPerIdentity, now)) ?? (await bucket(opts.deps, "agent:apply:s:", tenantId, AGENT_AUTH_LIMITS.applyPerShop, now));
    if (rl) return rl;
    const shop = await sellingShop(tenantId);
    if (!shop) return agencyFail("NOT_FOUND");
    const policy = await signupPolicy(shop, now);
    const db = tenantDb({ tenantId });
    const existing = await db.agentAccount.findFirst({ where: { tenantId, identityId: pre.identityId }, select: { id: true, status: true, statusReason: true, updatedAt: true, partyId: true } });
    const cooldownOver = (r: { updatedAt: Date }) => now.getTime() >= r.updatedAt.getTime() + AGENT_AUTH_LIMITS.reapplyCooldownDays * DAY_MS;
    if (existing) {
      if (existing.status === "PENDING") return { ok: true as const, agentAccountId: existing.id, status: "PENDING" as const, replayed: true };
      if (existing.status === "ACTIVE") return agencyFail("ALREADY_REGISTERED");
      if (existing.status !== "CLOSED") return agencyFail("BAD_STATE");
      if (isStickyCloseReason(existing.statusReason) && !cooldownOver(existing)) return agencyFail("BAD_STATE");
    } else if ((await db.agentAccount.count({ where: { tenantId, status: "PENDING" } })) >= AGENT_AUTH_LIMITS.openPendingPerShop) {
      return agencyFail("RATE_LIMITED", { retryAfterSec: 3600 });
    }
    // Party ชื่ออย่างเดียว (นอก tx · ครั้งแรกเท่านั้น · ไม่มีเลขภาษี/อีเมล/เบอร์ — มติ R3 Q5)
    let partyId = existing?.partyId ?? null;
    if (!partyId) {
      const party = await import("@/lib/modules/party");
      partyId = (await party.findOrCreate(tenantId, { name: app.legalName, kind: partyKindOf(app.payeeType) })).id;
    }
    const newId = newAgentRowId("aa_");
    return runTx(tenantId, async (tx) => {
      await lockAccountPair(tx, pre.identityId, tenantId);
      const who = await agentActorInTx(tx, a.data.agentUserId);
      if (!isAgentWriter(who) || who.identityId !== pre.identityId) return agencyFail("FORBIDDEN");
      const row = await tx.agentAccount.findFirst({ where: { tenantId, identityId: who.identityId }, select: { id: true, status: true, statusReason: true, updatedAt: true, partyId: true } });
      let action: AgentAccountAction;
      if (!row) action = policy.requireApproval ? "APPLY" : "AUTO_APPROVE";
      else if (row.status === "PENDING") return { ok: true as const, agentAccountId: row.id, status: "PENDING" as const, replayed: true };
      else if (row.status === "ACTIVE") return agencyFail("ALREADY_REGISTERED");
      else if (row.status !== "CLOSED") return agencyFail("BAD_STATE");
      else if (isStickyCloseReason(row.statusReason)) {
        if (!cooldownOver(row)) return agencyFail("BAD_STATE");
        action = "REAPPLY";
      } else action = policy.requireApproval ? "REAPPLY" : "REAPPLY_AUTO";
      const t = agentAccountTransition(row ? asStatus(row.status) : null, action);
      if (!t) return agencyFail("BAD_STATE");
      const id = row?.id ?? newId;
      const active = t.to === "ACTIVE";
      const fields = {
        legalName: app.legalName,
        payeeType: app.payeeType,
        taxIdEnc: app.taxId ? sealTax(tenantId, id, "taxId", app.taxId) : null,
        taxIdLast4: last4Of(app.taxId),
        branchCode: app.branchCode,
        country: app.country,
        vatRegistered: app.vatRegistered,
        contact: { ...app.contact, consentVersion: AGENCY_APPLY_PRIVACY_NOTICE_VERSION, consentAt: now.toISOString(), source: "APPLY" },
        licenceNo: app.licenceNo,
        licenceExpiry: app.licenceExpiry ? new Date(`${app.licenceExpiry}T00:00:00.000Z`) : null,
        approvedAt: active ? now : null,
        approvedById: null,
        suspendedAt: null,
        statusReason: null,
        ...(active && policy.tierId ? { tierId: policy.tierId } : {}),
      };
      if (!row) {
        if ((await tx.agentAccount.count({ where: { tenantId, status: "PENDING" } })) >= AGENT_AUTH_LIMITS.openPendingPerShop) return agencyFail("RATE_LIMITED", { retryAfterSec: 3600 });
        const code = await uniqueShopCodeInTx(tx, tenantId);
        await tx.agentAccount.create({ data: { id, tenantId, identityId: who.identityId, kind: "AGENT", code, status: t.to, partyId: partyId as string, unitIds: [], ...fields } });
      } else {
        const n = await tx.agentAccount.updateMany({ where: { tenantId, id: row.id, status: "CLOSED", updatedAt: row.updatedAt }, data: { status: t.to, ...fields } });
        if (n.count !== 1) return stop("BUSY", "RACE");
      }
      const memberId = await seatMembersInTx(tx, tenantId, id, who);
      if (active) await ensureBalanceInTx(tx, tenantId, id);
      await auditInTx(tx, { tenantId, actorType: "SYSTEM", actorId: memberId, action: row ? "agency.account.reapply" : "agency.account.apply", targetId: id, after: { from: row?.status ?? null, to: t.to, actorKind: "AGENT" } });
      await emitInTx(tx, tenantId, "agency.account.applied", id, now);
      if (active) await emitInTx(tx, tenantId, "agency.account.approved", id, new Date(now.getTime() + 1));
      return { ok: true as const, agentAccountId: id, status: t.to, replayed: false };
    });
  }, (name) => (/identityId/.test(name) ? agencyFail("ALREADY_REGISTERED") : null));
}

const ACCEPT_INPUT = z.object({ tenantId: ID, inviteToken: z.string().max(128).optional() }).strict();
/**
 * รับคำเชิญของร้าน (§6) — OWNER/ADMIN · มี token ⇒ แถว INVITED ของร้านนี้ที่ token ตรง + ยังไม่หมด (อื่น/ร้านอื่น = INVITE_INVALID) ·
 * ไม่มี token ⇒ แถว INVITED ที่เชิญตัวตนนี้ด้วยรหัส · ตัวตนมีแถวอื่นที่ร้านนี้ ⇒ ALREADY_LINKED (token ไม่ถูกใช้) ·
 * คำเชิญอีเมล: อีเมลล็อกอินของผู้กระทำตรงอีเมลที่เชิญ (แท็ก HMAC) ⇒ ACTIVE · ไม่ตรง ⇒ PENDING (มติ R1 ข้อ 8)
 */
export async function acceptShopInvite(actor: AgentActor, input: { tenantId: string; inviteToken?: string }, opts: AgencyOpts = {}): Promise<AccountWriteResult> {
  const a = ACTOR.safeParse(actor);
  const p = ACCEPT_INPUT.safeParse(input);
  if (!a.success || !p.success) return agencyFail("VALIDATION");
  const { tenantId, inviteToken } = p.data;
  if (inviteToken !== undefined && !SHOP_INVITE_TOKEN_RE.test(inviteToken)) return agencyFail("INVITE_INVALID");
  const now = opts.now ?? new Date();
  return safely("acceptShopInvite", tenantId, async () => {
    if (!agentAuthKeyReady()) return agencyFail("BUSY", { reason: "SERVER_KEY_MISSING" });
    const pre = await agentActorNow(a.data.agentUserId);
    if (!isAgentWriter(pre)) return agencyFail("FORBIDDEN");
    const shop = await sellingShop(tenantId);
    if (!shop) return agencyFail("NOT_FOUND");
    const policy = await signupPolicy(shop, now);
    const tokenHash = inviteToken !== undefined ? agentAuthHash("invite", inviteToken) : null;
    return runTx(tenantId, async (tx) => {
      await lockAccountPair(tx, pre.identityId, tenantId);
      const who = await agentActorInTx(tx, a.data.agentUserId);
      if (!isAgentWriter(who) || who.identityId !== pre.identityId) return agencyFail("FORBIDDEN");
      const sel = { id: true, status: true, identityId: true, inviteTokenHash: true, inviteExpiresAt: true, contact: true } as const;
      const inv = tokenHash
        ? await tx.agentAccount.findFirst({ where: { tenantId, status: "INVITED", inviteTokenHash: tokenHash }, select: sel })
        : await tx.agentAccount.findFirst({ where: { tenantId, status: "INVITED", identityId: who.identityId }, select: sel });
      const live = !!inv && (inv.inviteExpiresAt === null || inv.inviteExpiresAt.getTime() > now.getTime());
      if (!inv || !live) return agencyFail("INVITE_INVALID");
      if (inviteToken !== undefined) {
        // token ต้องเป็นของแถวนี้จริง (สูตร HMAC ของร้าน+บัญชี+เวลาหมด) — เทียบเวลาคงที่
        if (inv.identityId !== null || !inv.inviteExpiresAt || !safeEqualStr(inviteToken, shopInviteToken(tenantId, inv.id, inv.inviteExpiresAt))) return agencyFail("INVITE_INVALID");
      }
      const other = await tx.agentAccount.findFirst({ where: { tenantId, identityId: who.identityId, id: { not: inv.id } }, select: { id: true } });
      if (other) return agencyFail("ALREADY_LINKED");
      let action: AgentAccountAction = "ACCEPT_INVITE";
      if (inv.identityId === null) {
        const invited = isRec(inv.contact) && typeof inv.contact.email === "string" ? agentAuthHash("email-tag", inv.contact.email) : null;
        const mine = await agentEmailTagsInTx(tx, who.id);
        action = invited && mine.some((t) => safeEqualStr(t, invited)) ? "ACCEPT_INVITE" : "ACCEPT_INVITE_UNVERIFIED";
      } else if (inv.identityId !== who.identityId) return agencyFail("INVITE_INVALID");
      const t = agentAccountTransition("INVITED", action);
      if (!t) return agencyFail("BAD_STATE");
      const active = t.to === "ACTIVE";
      const n = await tx.agentAccount.updateMany({
        where: { tenantId, id: inv.id, status: "INVITED", inviteTokenHash: inv.inviteTokenHash },
        data: { status: t.to, identityId: who.identityId, inviteTokenHash: null, ...(active ? { approvedAt: now, ...(policy.tierId ? { tierId: policy.tierId } : {}) } : {}) },
      });
      if (n.count !== 1) return agencyFail("INVITE_INVALID");
      const memberId = await seatMembersInTx(tx, tenantId, inv.id, who);
      if (active) await ensureBalanceInTx(tx, tenantId, inv.id);
      await auditInTx(tx, { tenantId, actorType: "SYSTEM", actorId: memberId, action: "agency.account.accept", targetId: inv.id, after: { from: "INVITED", to: t.to, actorKind: "AGENT" } });
      await emitInTx(tx, tenantId, active ? "agency.account.approved" : "agency.account.applied", inv.id, now);
      return { ok: true as const, agentAccountId: inv.id, status: t.to, replayed: false };
    });
  }, () => agencyFail("ALREADY_LINKED"));
}

/** ถอนใบสมัคร (PENDING → CLOSED WITHDRAWN · ไม่มีช่วงรอ) — OWNER/ADMIN · ซ้ำ ⇒ replayed */
export async function withdrawApplication(actor: AgentActor, input: { tenantId: string }, opts: AgencyOpts = {}): Promise<AccountWriteResult> {
  const a = ACTOR.safeParse(actor);
  const p = z.object({ tenantId: ID }).strict().safeParse(input);
  if (!a.success || !p.success) return agencyFail("VALIDATION");
  const tenantId = p.data.tenantId;
  void opts;
  return safely("withdrawApplication", tenantId, async () => {
    const pre = await agentActorNow(a.data.agentUserId);
    if (!isAgentWriter(pre)) return agencyFail("FORBIDDEN");
    return runTx(tenantId, async (tx) => {
      await lockAccountPair(tx, pre.identityId, tenantId);
      const who = await agentActorInTx(tx, a.data.agentUserId);
      if (!isAgentWriter(who) || who.identityId !== pre.identityId) return agencyFail("FORBIDDEN");
      const row = await tx.agentAccount.findFirst({ where: { tenantId, identityId: who.identityId }, select: { id: true, status: true, statusReason: true } });
      if (!row) return agencyFail("NOT_FOUND");
      if (row.status === "CLOSED" && row.statusReason === "WITHDRAWN") return { ok: true as const, agentAccountId: row.id, status: "CLOSED" as const, replayed: true };
      const t = agentAccountTransition(asStatus(row.status), "WITHDRAW");
      if (!t) return agencyFail("BAD_STATE");
      const n = await tx.agentAccount.updateMany({ where: { tenantId, id: row.id, status: row.status }, data: { status: t.to, statusReason: t.reason } });
      if (n.count !== 1) return agencyFail("BAD_STATE");
      const member = await tx.agentAccountMember.findFirst({ where: { tenantId, agentAccountId: row.id, agentUserId: who.id }, select: { id: true } });
      await auditInTx(tx, { tenantId, actorType: "SYSTEM", actorId: member?.id ?? null, action: "agency.account.withdraw", targetId: row.id, after: { from: row.status, to: t.to, reason: t.reason, actorKind: "AGENT" } });
      return { ok: true as const, agentAccountId: row.id, status: t.to, replayed: false };
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// §7 ฝั่งร้าน (ส่งออกทาง facade)
// ═══════════════════════════════════════════════════════════════
type Gate = { tenantId: string; userId: string; member: MembershipCtx; unrestricted: boolean; can(action: string): boolean; db: Db };
const VIEW_ANY = ["agency.account.view", "agency.account.invite", "agency.account.approve", "agency.account.suspend", "agency.account.edit", "agency.account.money"] as const;
/** สมาชิกภาพของผู้กระทำ (acceptedAt ไม่ null) อ่านเอง — ไม่มี ⇒ null (FORBIDDEN) */
async function shopGate(ctx: unknown): Promise<Gate | null> {
  const c = CTX.safeParse(ctx);
  if (!c.success) return null;
  const { tenantId, actorUserId } = c.data;
  const db = tenantDb({ tenantId });
  const mem = await db.membership.findFirst({ where: { tenantId, userId: actorUserId, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } });
  if (!mem) return null;
  const member: MembershipCtx = {
    role: mem.role,
    unitAccess: Array.isArray(mem.unitAccess) ? mem.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: isRec(mem.permissions) ? mem.permissions : {},
  };
  return {
    tenantId,
    userId: actorUserId,
    member,
    unrestricted: member.role === "OWNER" || member.unitAccess.includes("*"),
    can: (action: string) => evaluate(member, { module: "agency", action }),
    db,
  };
}
const canView = (g: Gate) => VIEW_ANY.some((k) => g.can(k));
const canWrite = (g: Gate, action: string) => g.unrestricted && g.can(action);
/** มองเห็นแถวนี้ไหม (§7.1): ไม่จำกัดสาขา หรือ unitIds ว่าง หรือ ซ้อน unitAccess */
const visible = (g: Gate, unitIds: readonly string[]) => g.unrestricted || unitIds.length === 0 || unitIds.some((u) => g.member.unitAccess.includes(u));

const ROW_SELECT = {
  id: true, tenantId: true, identityId: true, kind: true, code: true, status: true, tierId: true, partyId: true, crmCompanyId: true, unitIds: true, legalName: true, payeeType: true,
  taxIdLast4: true, branchCode: true, country: true, treaty: true, vatRegistered: true, bankLast4: true, contact: true, licenceNo: true, licenceExpiry: true,
  inviteExpiresAt: true, approvedAt: true, suspendedAt: true, statusReason: true, createdAt: true, updatedAt: true,
} as const;
type AccountRow = Prisma.AgentAccountGetPayload<{ select: typeof ROW_SELECT }>;

const contactOf = (c: unknown): ShopAgentContact => {
  const r = isRec(c) ? c : {};
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : null);
  return { name: s("name"), phone: s("phone"), email: s("email"), lineId: s("lineId"), consentVersion: s("consentVersion"), consentAt: s("consentAt"), source: s("source") };
};
/** DTO รายละเอียด (§7.2) — คีย์ตรง SHOP_AGENT_ACCOUNT_KEYS · ไม่มีคีย์ NEVER_SHOW ทุกชั้น */
async function detailOf(g: Gate, row: AccountRow, now: Date): Promise<ShopAgentAccountDTO> {
  const members = await g.db.agentAccountMember.findMany({ where: { tenantId: g.tenantId, agentAccountId: row.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, agentUserId: true, role: true, active: true } });
  const [names, idents] = await Promise.all([agentUserDisplayNames(members.map((m) => m.agentUserId)), identityPublicByIds(row.identityId ? [row.identityId] : [])]);
  const ident = row.identityId ? idents.get(row.identityId) ?? null : null;
  const expiry = ymdOfDate(row.licenceExpiry);
  const lw = licenceWarnings({ no: row.licenceNo, expiry }, thaiToday(now));
  let crm: ShopAgentAccountDTO["crm"] = null;
  if (row.crmCompanyId) {
    crm = { companyId: row.crmCompanyId, name: null, live: false };
    try {
      const mod: CrmMod = await import("@/lib/modules/crm");
      const target = await mod.crmPanelTarget(g.tenantId);
      if (target) {
        const st = (await mod.companies.visibleCompanyStates({ tenantId: g.tenantId, systemId: target.systemId }, crmActorOf(g), [row.crmCompanyId])).get(row.crmCompanyId);
        if (st) crm = { companyId: row.crmCompanyId, name: st.name, live: st.live };
      }
    } catch {
      // อ่าน CRM ไม่ได้ = แสดงว่าไม่ live (ไม่ล้มทั้ง DTO)
    }
  }
  const warnings: string[] = [...lw, ...(crm && !crm.live ? ["CRM_COMPANY_INACTIVE"] : [])];
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    status: asStatus(row.status),
    closeReason: row.status === "CLOSED" ? row.statusReason : null,
    legalName: row.legalName,
    payeeType: row.payeeType,
    country: row.country,
    branchCode: row.branchCode,
    vatRegistered: row.vatRegistered,
    treaty: row.treaty,
    taxIdLast4: row.taxIdLast4,
    bankLast4: row.bankLast4,
    contact: contactOf(row.contact),
    licence: { no: row.licenceNo, expiry, warnings: lw },
    unitIds: [...row.unitIds],
    tierId: row.tierId,
    partyId: row.partyId,
    crm,
    identity: ident ? { publicCode: ident.publicCode, displayName: ident.displayName, status: ident.status } : null,
    members: members.map((m) => ({ memberId: m.id, displayName: names.get(m.agentUserId) ?? "", role: m.role, active: m.active })),
    invite: row.status === "INVITED" ? { mode: row.identityId ? "CODE" : "EMAIL", expiresAt: iso(row.inviteExpiresAt), expired: !!row.inviteExpiresAt && row.inviteExpiresAt.getTime() <= now.getTime() } : null,
    approvedAt: iso(row.approvedAt),
    suspendedAt: iso(row.suspendedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    warnings,
  };
}
const crmActorOf = (g: Gate): Parameters<CrmMod["companies"]["getCompany360"]>[1] => ({ userId: g.userId, role: g.member.role, unitAccess: g.member.unitAccess, permissions: g.member.permissions });
async function rowOf(g: Gate, id: string): Promise<AccountRow | null> {
  const r = await g.db.agentAccount.findFirst({ where: { tenantId: g.tenantId, id }, select: ROW_SELECT });
  return r && visible(g, r.unitIds) ? r : null;
}

const LIST_INPUT = z
  .object({ status: z.enum(["INVITED", "PENDING", "ACTIVE", "SUSPENDED", "CLOSED"]).optional(), q: z.string().max(200).optional(), limit: z.number().int().min(1).max(100).optional(), cursor: ID.optional() })
  .strict();
/** รายการบัญชีเอเจนซี่ของร้าน (§7 · คีย์ตรง SHOP_AGENT_LIST_KEYS) */
export async function listAgentAccounts(ctx: ShopCtx, input: { status?: AgentAccountStatus; q?: string; limit?: number; cursor?: string } = {}, opts: AgencyOpts = {}): Promise<{ ok: true; items: ShopAgentListItem[]; nextCursor: string | null } | AgencyFail> {
  const p = LIST_INPUT.safeParse(input ?? {});
  if (!p.success) return agencyFail("VALIDATION");
  const now = opts.now ?? new Date();
  return safely("listAgentAccounts", null, async () => {
    const g = await shopGate(ctx);
    if (!g || !canView(g)) return agencyFail("FORBIDDEN");
    const q = p.data.q === undefined ? null : cleanAgencyText(p.data.q, 100);
    if (p.data.q !== undefined && q === null) return agencyFail("VALIDATION");
    const limit = p.data.limit ?? 50;
    const where: Prisma.AgentAccountWhereInput = {
      tenantId: g.tenantId,
      ...(p.data.status ? { status: p.data.status } : {}),
      ...(q ? { OR: [{ legalName: { contains: q, mode: "insensitive" } }, { code: q.toUpperCase() }] } : {}),
      ...(g.unrestricted ? {} : { AND: [{ OR: [{ unitIds: { isEmpty: true } }, { unitIds: { hasSome: g.member.unitAccess } }] }] }),
    };
    const rows = await g.db.agentAccount.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(p.data.cursor ? { cursor: { id: p.data.cursor }, skip: 1 } : {}),
      select: { id: true, code: true, legalName: true, status: true, statusReason: true, payeeType: true, identityId: true, licenceNo: true, licenceExpiry: true, createdAt: true, updatedAt: true },
    });
    const page = rows.slice(0, limit);
    const ids = page.map((r) => r.id);
    const counts = ids.length ? await g.db.agentAccountMember.groupBy({ by: ["agentAccountId"], where: { tenantId: g.tenantId, agentAccountId: { in: ids }, active: true }, _count: { _all: true } }) : [];
    const countOf = new Map(counts.map((c) => [c.agentAccountId, c._count._all]));
    const idents = await identityPublicByIds(page.map((r) => r.identityId ?? "").filter(Boolean));
    const today = thaiToday(now);
    const items: ShopAgentListItem[] = page.map((r) => ({
      id: r.id,
      code: r.code,
      legalName: r.legalName,
      status: asStatus(r.status),
      closeReason: r.status === "CLOSED" ? r.statusReason : null,
      payeeType: r.payeeType,
      publicCode: r.identityId ? idents.get(r.identityId)?.publicCode ?? null : null,
      licenceWarnings: licenceWarnings({ no: r.licenceNo, expiry: ymdOfDate(r.licenceExpiry) }, today),
      memberCount: countOf.get(r.id) ?? 0,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
    return { ok: true as const, items, nextCursor: rows.length > limit ? page[page.length - 1]?.id ?? null : null };
  });
}

/** รายละเอียดบัญชีเอเจนซี่ (§7.2) — มองไม่เห็น/ร้านอื่น = NOT_FOUND เดียวกัน */
export async function getAgentAccount(ctx: ShopCtx, input: { agentAccountId: string }, opts: AgencyOpts = {}): Promise<{ ok: true; account: ShopAgentAccountDTO } | AgencyFail> {
  const p = z.object({ agentAccountId: ID }).strict().safeParse(input);
  if (!p.success) return agencyFail("VALIDATION");
  const now = opts.now ?? new Date();
  return safely("getAgentAccount", null, async () => {
    const g = await shopGate(ctx);
    if (!g || !canView(g)) return agencyFail("FORBIDDEN");
    const row = await rowOf(g, p.data.agentAccountId);
    if (!row) return agencyFail("NOT_FOUND");
    return { ok: true as const, account: await detailOf(g, row, now) };
  });
}

// ─────────────────── ผังสถานะฝั่งร้าน (§7.3) ───────────────────
const SHOP_CODE = z.string().max(32);
type TransitionExtra = { code?: string; unitIds?: string[] };
/** ปลายทางของการกระทำฝั่งร้าน (ตรงผังสถานะ §3.1) — ใช้ตัดสิน replayed เมื่อแถวอยู่ที่ปลายทางแล้ว + ชื่อ audit */
const SHOP_GOAL: Partial<Record<AgentAccountAction, { to: AgentAccountStatus; reason: string | null; verb: string }>> = {
  APPROVE: { to: "ACTIVE", reason: null, verb: "approve" },
  REJECT: { to: "CLOSED", reason: "REJECTED", verb: "reject" },
  SUSPEND: { to: "SUSPENDED", reason: null, verb: "suspend" },
  REINSTATE: { to: "ACTIVE", reason: null, verb: "reinstate" },
  CLOSE: { to: "CLOSED", reason: "CLOSED_BY_SHOP", verb: "close" },
  REVOKE_INVITE: { to: "CLOSED", reason: "INVITE_REVOKED", verb: "revoke" },
};
async function shopTransition(where: string, ctx: ShopCtx, input: unknown, opts: AgencyOpts, action: AgentAccountAction, perm: string, allowExtra: boolean): Promise<AccountWriteResult> {
  const schema = allowExtra ? z.object({ agentAccountId: ID, code: SHOP_CODE.optional(), unitIds: UNIT_IDS.optional() }).strict() : z.object({ agentAccountId: ID }).strict();
  const p = schema.safeParse(input);
  if (!p.success) return agencyFail("VALIDATION");
  const data = p.data as { agentAccountId: string } & TransitionExtra;
  const code = data.code === undefined ? undefined : data.code.trim().toUpperCase();
  if (code !== undefined && !SHOP_CODE_RE.test(code)) return agencyFail("VALIDATION");
  const now = opts.now ?? new Date();
  return safely(where, null, async () => {
    const g = await shopGate(ctx);
    if (!g || !canWrite(g, perm)) return agencyFail("FORBIDDEN");
    const row = await rowOf(g, data.agentAccountId);
    if (!row) return agencyFail("NOT_FOUND");
    const t0 = agentAccountTransition(asStatus(row.status), action);
    const goal = SHOP_GOAL[action];
    const replay = (s: string, r: string | null) => !!goal && s === goal.to && (goal.reason === null || r === goal.reason);
    if (!t0) return replay(row.status, row.statusReason) ? { ok: true as const, agentAccountId: row.id, status: asStatus(row.status), replayed: true } : agencyFail("BAD_STATE");
    if (action === "REINSTATE" && row.approvedAt === null) return agencyFail("BAD_STATE");
    let tierId: string | null = null;
    if (action === "APPROVE") {
      if (data.unitIds && !(await unitsValid(g.db, g.tenantId, data.unitIds))) return agencyFail("VALIDATION");
      if (code && code !== row.code && (await g.db.agentAccount.findFirst({ where: { tenantId: g.tenantId, code }, select: { id: true } }))) return agencyFail("CODE_TAKEN");
      if (!row.tierId) {
        const shop = await sellingShop(g.tenantId);
        tierId = shop ? (await signupPolicy(shop, now)).tierId : null;
      }
    }
    return runTx(g.tenantId, async (tx) => {
      const upd: Prisma.AgentAccountUpdateManyMutationInput = { status: t0.to };
      if (t0.reason) upd.statusReason = t0.reason;
      if (action === "APPROVE") {
        upd.approvedAt = now;
        upd.approvedById = g.userId;
        if (code) upd.code = code;
        if (data.unitIds) upd.unitIds = [...new Set(data.unitIds)];
        if (tierId) upd.tierId = tierId;
      }
      if (action === "SUSPEND") upd.suspendedAt = now;
      if (action === "REINSTATE") upd.suspendedAt = null;
      if (action === "REVOKE_INVITE" || action === "CLOSE" || action === "REJECT") upd.inviteTokenHash = null;
      const n = await tx.agentAccount.updateMany({ where: { tenantId: g.tenantId, id: row.id, status: row.status }, data: upd });
      if (n.count !== 1) {
        const cur = await reloadStatus(tx, g.tenantId, row.id);
        return cur && replay(cur.status, cur.statusReason) ? { ok: true as const, agentAccountId: row.id, status: asStatus(cur.status), replayed: true } : agencyFail("BAD_STATE");
      }
      if (action === "APPROVE") await ensureBalanceInTx(tx, g.tenantId, row.id);
      await auditInTx(tx, { tenantId: g.tenantId, actorType: "USER", actorId: g.userId, action: `agency.account.${goal?.verb ?? "edit"}`, targetId: row.id, after: { from: row.status, to: t0.to, ...(t0.reason ? { reason: t0.reason } : {}), actorKind: "SHOP" } });
      if (action === "APPROVE") await emitInTx(tx, g.tenantId, "agency.account.approved", row.id, now);
      if (action === "SUSPEND" && row.status === "ACTIVE") await emitInTx(tx, g.tenantId, "agency.account.suspended", row.id, now);
      return { ok: true as const, agentAccountId: row.id, status: t0.to, replayed: false };
    });
  }, (name) => (/code/.test(name) ? agencyFail("CODE_TAKEN") : null));
}
/** อนุมัติ (PENDING → ACTIVE · code/unitIds ไม่บังคับ · ใบอนุญาตหมดอายุไม่บล็อก) */
export const approveAgentAccount = (ctx: ShopCtx, input: { agentAccountId: string; code?: string; unitIds?: string[] }, opts: AgencyOpts = {}) => shopTransition("approveAgentAccount", ctx, input, opts, "APPROVE", "agency.account.approve", true);
/** ปฏิเสธ (PENDING → CLOSED REJECTED · สมัครซ้ำได้หลังช่วงรอ และต้องอนุมัติใหม่เสมอ) */
export const rejectAgentAccount = (ctx: ShopCtx, input: { agentAccountId: string }, opts: AgencyOpts = {}) => shopTransition("rejectAgentAccount", ctx, input, opts, "REJECT", "agency.account.approve", false);
/** ระงับ (ACTIVE → SUSPENDED) หรือบล็อกผู้สมัคร (PENDING → SUSPENDED) */
export const suspendAgentAccount = (ctx: ShopCtx, input: { agentAccountId: string }, opts: AgencyOpts = {}) => shopTransition("suspendAgentAccount", ctx, input, opts, "SUSPEND", "agency.account.suspend", false);
/** คืนสิทธิ์ (SUSPENDED → ACTIVE · เฉพาะแถวที่เคยอนุมัติ) */
export const reinstateAgentAccount = (ctx: ShopCtx, input: { agentAccountId: string }, opts: AgencyOpts = {}) => shopTransition("reinstateAgentAccount", ctx, input, opts, "REINSTATE", "agency.account.suspend", false);
/** ปิดบัญชี (ACTIVE/SUSPENDED → CLOSED CLOSED_BY_SHOP) */
export const closeAgentAccount = (ctx: ShopCtx, input: { agentAccountId: string }, opts: AgencyOpts = {}) => shopTransition("closeAgentAccount", ctx, input, opts, "CLOSE", "agency.account.suspend", false);
/** ถอนคำเชิญ (INVITED → CLOSED INVITE_REVOKED · token ใช้ไม่ได้ทันที) */
export const revokeAgentInvite = (ctx: ShopCtx, input: { agentAccountId: string }, opts: AgencyOpts = {}) => shopTransition("revokeAgentInvite", ctx, input, opts, "REVOKE_INVITE", "agency.account.invite", false);

// ─────────────────── เชิญ (§7.4) ───────────────────
const INVITE_COMMON = { legalName: z.string().max(400), payeeType: z.enum(PAYEE_TYPES), code: SHOP_CODE.optional(), unitIds: UNIT_IDS.optional(), idempotencyKey: IDEM };
const INVITE_INPUT = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("EMAIL"), email: z.string().max(400), ...INVITE_COMMON }).strict(),
  z.object({ mode: z.literal("CODE"), publicCode: z.string().max(32), ...INVITE_COMMON }).strict(),
]);
export type InviteAgentInput =
  | { mode: "EMAIL"; email: string; legalName: string; payeeType: AgentPayeeType; code?: string; unitIds?: string[]; idempotencyKey: string }
  | { mode: "CODE"; publicCode: string; legalName: string; payeeType: AgentPayeeType; code?: string; unitIds?: string[]; idempotencyKey: string };
export type InviteResult = { ok: true; agentAccountId: string; status: AgentAccountStatus; inviteToken: string | null; inviteExpiresAt: string | null; replayed: boolean } | AgencyFail;

/** token ของแถวคำเชิญอีเมลที่ยังเปิด (สูตรกำหนดได้ ⇒ คืนซ้ำได้โดยไม่เก็บ token ดิบ) */
const tokenOfRow = (tenantId: string, r: { id: string; status: string; identityId: string | null; inviteExpiresAt: Date | null }): string | null =>
  r.status === "INVITED" && r.identityId === null && r.inviteExpiresAt ? shopInviteToken(tenantId, r.id, r.inviteExpiresAt) : null;
async function inviteReplay(db: Db | Tx, tenantId: string, key: string, bodyHash: string, now: Date): Promise<InviteResult | null> {
  const hit = await db.auditLog.findFirst({
    where: { tenantId, action: "agency.account.invite", createdAt: { gte: new Date(now.getTime() - IDEM_WINDOW_MS) }, after: { path: ["idem"], equals: key } },
    orderBy: { createdAt: "desc" },
    select: { targetId: true, after: true },
  });
  if (!hit) return null;
  if (!isRec(hit.after) || hit.after.body !== bodyHash || !hit.targetId) return agencyFail("IDEMPOTENCY_CONFLICT");
  const r = await db.agentAccount.findFirst({ where: { tenantId, id: hit.targetId }, select: { id: true, status: true, identityId: true, inviteExpiresAt: true } });
  if (!r) return agencyFail("IDEMPOTENCY_CONFLICT");
  return { ok: true, agentAccountId: r.id, status: asStatus(r.status), inviteToken: tokenOfRow(tenantId, r), inviteExpiresAt: r.status === "INVITED" ? iso(r.inviteExpiresAt) : null, replayed: true };
}

/**
 * เชิญเอเจนซี่ (§7.4) — EMAIL: INVITED identityId null + token (HMAC) + จดหมายลิงก์จาก origin แพลตฟอร์มคงที่ · ไม่อ่านตาราง global ·
 * CODE: rate limit (ผู้กระทำ) → หาตัวตนจากรหัสสาธารณะ (ไม่พบ/ไม่ ACTIVE = NOT_FOUND) → มีแถวที่ร้านนี้ = ALREADY_REGISTERED → คำเชิญค้างของตัวตน ≥ เพดาน = RATE_LIMITED ·
 * กันซ้ำด้วย idempotencyKey (ล็อก agency.invite.v1 · audit after.idem/body ย้อน 24 ชม.)
 */
export async function inviteAgent(ctx: ShopCtx, input: InviteAgentInput, opts: AgencyOpts = {}): Promise<InviteResult> {
  const p = INVITE_INPUT.safeParse(input);
  if (!p.success) return agencyFail("VALIDATION");
  const v = p.data;
  const legalName = cleanAgencyText(v.legalName, 200);
  const code = v.code === undefined ? undefined : v.code.trim().toUpperCase();
  const email = v.mode === "EMAIL" ? normEmail(v.email) : null;
  if (!legalName || (code !== undefined && !SHOP_CODE_RE.test(code)) || (v.mode === "EMAIL" && !email)) return agencyFail("VALIDATION");
  const unitIds = [...new Set(v.unitIds ?? [])].sort();
  const now = opts.now ?? new Date();
  const bodyHash = sha256(JSON.stringify(canonical({ op: "agency.invite.v1", mode: v.mode, target: v.mode === "EMAIL" ? email : v.publicCode, legalName, payeeType: v.payeeType, code: code ?? null, unitIds })));
  const key = v.idempotencyKey;
  return safely("inviteAgent", null, async () => {
    const g = await shopGate(ctx);
    if (!g || !canWrite(g, "agency.account.invite")) return agencyFail("FORBIDDEN");
    const tenantId = g.tenantId;
    if (!agentAuthKeyReady()) return agencyFail("BUSY", { reason: "SERVER_KEY_MISSING" });
    const shop = await sellingShop(tenantId);
    if (!shop) return agencyFail("NOT_FOUND");
    const early = await inviteReplay(g.db, tenantId, key, bodyHash, now);
    if (early) return early;
    let identityId: string | null = null;
    if (v.mode === "CODE") {
      const rl = await bucket(opts.deps, "agent:lookup:", `${tenantId}:${g.userId}`, AGENT_AUTH_LIMITS.lookupByCodePerActor, now);
      if (rl) return rl;
      const ident = await findAgentIdentityByCode(v.publicCode);
      if (!ident || ident.status !== "ACTIVE") return agencyFail("NOT_FOUND");
      identityId = ident.id;
      if (await g.db.agentAccount.findFirst({ where: { tenantId, identityId }, select: { id: true } })) return agencyFail("ALREADY_REGISTERED");
      if ((await countOpenCodeInvitesOfIdentity(identityId, now)) >= AGENT_AUTH_LIMITS.openCodeInvitesPerIdentity) return agencyFail("RATE_LIMITED", { retryAfterSec: 3600 });
    }
    if (!(await unitsValid(g.db, tenantId, unitIds))) return agencyFail("VALIDATION");
    if (code && (await g.db.agentAccount.findFirst({ where: { tenantId, code }, select: { id: true } }))) return agencyFail("CODE_TAKEN");
    const party = await import("@/lib/modules/party");
    const partyId = (await party.findOrCreate(tenantId, { name: legalName, kind: partyKindOf(v.payeeType) })).id;
    const id = newAgentRowId("aa_");
    const inviteExpiresAt = new Date(now.getTime() + AGENT_AUTH_LIMITS.shopInviteTtlDays * DAY_MS);
    const token = v.mode === "EMAIL" ? shopInviteToken(tenantId, id, inviteExpiresAt) : null;
    const out = await runTx(tenantId, async (tx): Promise<InviteResult> => {
      if (identityId) await lockAgencyKeyInTx(tx, "agency.account.v1", `${tenantId}:${identityId}`);
      await lockAgencyKeyInTx(tx, "agency.invite.v1", `${tenantId}:${key}`);
      const again = await inviteReplay(tx, tenantId, key, bodyHash, now);
      if (again) return again;
      if (identityId && (await tx.agentAccount.findFirst({ where: { tenantId, identityId }, select: { id: true } }))) return agencyFail("ALREADY_REGISTERED");
      const shopCode = code ?? (await uniqueShopCodeInTx(tx, tenantId));
      await tx.agentAccount.create({
        data: {
          id, tenantId, identityId, kind: "AGENT", code: shopCode, status: "INVITED", partyId, unitIds, legalName, payeeType: v.payeeType,
          contact: { email: email ?? null, source: "SHOP" }, inviteExpiresAt, inviteTokenHash: token ? agentAuthHash("invite", token) : null,
        },
      });
      await auditInTx(tx, { tenantId, actorType: "USER", actorId: g.userId, action: "agency.account.invite", targetId: id, after: { to: "INVITED", actorKind: "SHOP", idem: key, body: bodyHash } });
      return { ok: true, agentAccountId: id, status: "INVITED", inviteToken: token, inviteExpiresAt: inviteExpiresAt.toISOString(), replayed: false };
    });
    if (out.ok && !out.replayed && token && email) {
      const url = `${platformOrigin()}/agent/${encodeURIComponent(shop.slug)}/invite#${token}`;
      await deliverShopInvite(opts.deps, { to: email, kind: "SHOP_INVITE", token, url }, agentShopInviteMail(shop.name, url, thaiToday(inviteExpiresAt)), id, tenantId);
    }
    return out;
  }, (name) => (/code/.test(name) ? agencyFail("CODE_TAKEN") : /identityId/.test(name) ? agencyFail("ALREADY_REGISTERED") : null));
}

/** ออกคำเชิญใหม่ (INVITED เท่านั้น) — เวลาหมดใหม่ ⇒ token ใหม่ · token เก่าใช้ไม่ได้ · คำเชิญอีเมลส่งจดหมายใหม่ */
export async function reissueAgentInvite(ctx: ShopCtx, input: { agentAccountId: string }, opts: AgencyOpts = {}): Promise<InviteResult> {
  const p = z.object({ agentAccountId: ID }).strict().safeParse(input);
  if (!p.success) return agencyFail("VALIDATION");
  const now = opts.now ?? new Date();
  return safely("reissueAgentInvite", null, async () => {
    const g = await shopGate(ctx);
    if (!g || !canWrite(g, "agency.account.invite")) return agencyFail("FORBIDDEN");
    if (!agentAuthKeyReady()) return agencyFail("BUSY", { reason: "SERVER_KEY_MISSING" });
    const row = await rowOf(g, p.data.agentAccountId);
    if (!row) return agencyFail("NOT_FOUND");
    if (row.status !== "INVITED") return agencyFail("BAD_STATE");
    const shop = await sellingShop(g.tenantId);
    if (!shop) return agencyFail("NOT_FOUND");
    const inviteExpiresAt = new Date(now.getTime() + AGENT_AUTH_LIMITS.shopInviteTtlDays * DAY_MS);
    const token = row.identityId === null ? shopInviteToken(g.tenantId, row.id, inviteExpiresAt) : null;
    const out = await runTx(g.tenantId, async (tx): Promise<InviteResult> => {
      const n = await tx.agentAccount.updateMany({
        where: { tenantId: g.tenantId, id: row.id, status: "INVITED", inviteExpiresAt: row.inviteExpiresAt },
        data: { inviteExpiresAt, inviteTokenHash: token ? agentAuthHash("invite", token) : null },
      });
      if (n.count !== 1) return agencyFail("BAD_STATE");
      await auditInTx(tx, { tenantId: g.tenantId, actorType: "USER", actorId: g.userId, action: "agency.account.reissue", targetId: row.id, after: { from: "INVITED", to: "INVITED", actorKind: "SHOP" } });
      return { ok: true, agentAccountId: row.id, status: "INVITED", inviteToken: token, inviteExpiresAt: inviteExpiresAt.toISOString(), replayed: false };
    });
    const email = contactOf(row.contact).email;
    if (out.ok && token && email) {
      const url = `${platformOrigin()}/agent/${encodeURIComponent(shop.slug)}/invite#${token}`;
      await deliverShopInvite(opts.deps, { to: email, kind: "SHOP_INVITE", token, url }, agentShopInviteMail(shop.name, url, thaiToday(inviteExpiresAt)), row.id, g.tenantId);
    }
    return out;
  });
}

// ─────────────────── แก้โปรไฟล์ (§7.3 · CAS updatedAt) ───────────────────
const NULLABLE_TEXT = (max: number) => z.string().max(max).nullable().optional();
const PATCH = z
  .object({
    legalName: z.string().max(400).optional(),
    code: SHOP_CODE.optional(),
    payeeType: z.enum(PAYEE_TYPES).optional(),
    taxId: NULLABLE_TEXT(40),
    branchCode: NULLABLE_TEXT(10),
    country: z.string().max(4).optional(),
    vatRegistered: z.boolean().optional(),
    treaty: z.boolean().nullable().optional(),
    bankAccount: NULLABLE_TEXT(40),
    contact: z.object({ name: NULLABLE_TEXT(400), phone: NULLABLE_TEXT(80), email: NULLABLE_TEXT(400), lineId: NULLABLE_TEXT(128) }).strict().optional(),
    licenceNo: NULLABLE_TEXT(80),
    licenceExpiry: z.string().max(10).nullable().optional(),
    unitIds: UNIT_IDS.optional(),
  })
  .strict();
const MONEY_FIELDS = ["taxId", "bankAccount", "payeeType", "vatRegistered", "treaty"] as const;
export type AgentProfilePatch = z.infer<typeof PATCH>;
/** แก้ข้อมูลบัญชี — edit (ไม่จำกัดสาขา) · ช่องเงิน/ภาษีต้อง money (ไม่งั้น FORBIDDEN ทั้ง patch) · updatedAt เก่า ⇒ STALE · audit เก็บชื่อช่องเท่านั้น */
export async function updateAgentAccountProfile(ctx: ShopCtx, input: { agentAccountId: string; expectedUpdatedAt: string; patch: AgentProfilePatch }, opts: AgencyOpts = {}): Promise<{ ok: true; account: ShopAgentAccountDTO } | AgencyFail> {
  const p = z.object({ agentAccountId: ID, expectedUpdatedAt: z.string().max(40), patch: PATCH }).strict().safeParse(input);
  if (!p.success) return agencyFail("VALIDATION");
  const expected = new Date(p.data.expectedUpdatedAt);
  const patch = p.data.patch;
  const keys = Object.keys(patch) as (keyof AgentProfilePatch)[];
  if (Number.isNaN(expected.getTime()) || keys.length === 0) return agencyFail("VALIDATION");
  const now = opts.now ?? new Date();
  return safely("updateAgentAccountProfile", null, async () => {
    const g = await shopGate(ctx);
    if (!g || !canWrite(g, "agency.account.edit")) return agencyFail("FORBIDDEN");
    if (keys.some((k) => (MONEY_FIELDS as readonly string[]).includes(k)) && !canWrite(g, "agency.account.money")) return agencyFail("FORBIDDEN");
    const row = await rowOf(g, p.data.agentAccountId);
    if (!row) return agencyFail("NOT_FOUND");
    if (row.status === "CLOSED") return agencyFail("BAD_STATE");
    const data: Prisma.AgentAccountUpdateManyMutationInput = {};
    const payeeType = patch.payeeType ?? row.payeeType;
    if (patch.legalName !== undefined) {
      const s = cleanAgencyText(patch.legalName, 200);
      if (!s) return agencyFail("VALIDATION");
      data.legalName = s;
    }
    if (patch.code !== undefined) {
      const c = patch.code.trim().toUpperCase();
      if (!SHOP_CODE_RE.test(c)) return agencyFail("VALIDATION");
      if (c !== row.code && (await g.db.agentAccount.findFirst({ where: { tenantId: g.tenantId, code: c }, select: { id: true } }))) return agencyFail("CODE_TAKEN");
      data.code = c;
    }
    if (patch.payeeType !== undefined) data.payeeType = patch.payeeType;
    if (patch.taxId !== undefined) {
      const t = normTaxId(payeeType, patch.taxId);
      if (t === undefined) return agencyFail("VALIDATION");
      if (t && !integrationSecretKeyConfigured()) return agencyFail("BUSY", { reason: "KEY_NOT_CONFIGURED" });
      data.taxIdEnc = t ? sealTax(g.tenantId, row.id, "taxId", t) : null;
      data.taxIdLast4 = last4Of(t);
    }
    if (patch.bankAccount !== undefined) {
      const b = patch.bankAccount === null ? null : patch.bankAccount.replace(/[\s-]/g, "");
      if (b !== null && !/^[0-9]{6,20}$/.test(b)) return agencyFail("VALIDATION");
      if (b && !integrationSecretKeyConfigured()) return agencyFail("BUSY", { reason: "KEY_NOT_CONFIGURED" });
      data.bankAccountEnc = b ? sealTax(g.tenantId, row.id, "bank", b) : null;
      data.bankLast4 = b ? b.slice(-4) : null;
    }
    if (patch.branchCode !== undefined) {
      const b = normBranch(patch.branchCode);
      if (b === undefined) return agencyFail("VALIDATION");
      data.branchCode = b;
    }
    if (patch.country !== undefined) {
      const c = normCountry(patch.country);
      if (!c) return agencyFail("VALIDATION");
      data.country = c;
    }
    if (patch.vatRegistered !== undefined) data.vatRegistered = patch.vatRegistered;
    if (patch.treaty !== undefined) data.treaty = patch.treaty;
    if (patch.contact !== undefined) {
      const cur = contactOf(row.contact);
      const c = patch.contact;
      const name = c.name === undefined ? cur.name : optText(c.name, 120);
      const phone = c.phone === undefined ? cur.phone : optText(c.phone, 40);
      const email = c.email === undefined ? cur.email : normEmail(c.email);
      const lineId = c.lineId === undefined ? cur.lineId : optText(c.lineId, 64);
      if (name === undefined || phone === undefined || email === undefined || lineId === undefined) return agencyFail("VALIDATION");
      data.contact = { ...cur, name, phone, email, lineId };
    }
    if (patch.licenceNo !== undefined) {
      const l = optText(patch.licenceNo, 40);
      if (l === undefined) return agencyFail("VALIDATION");
      data.licenceNo = l;
    }
    if (patch.licenceExpiry !== undefined) {
      if (patch.licenceExpiry !== null && !isRealYmd(patch.licenceExpiry)) return agencyFail("VALIDATION");
      data.licenceExpiry = patch.licenceExpiry === null ? null : new Date(`${patch.licenceExpiry}T00:00:00.000Z`);
    }
    if (patch.unitIds !== undefined) {
      if (!(await unitsValid(g.db, g.tenantId, patch.unitIds))) return agencyFail("VALIDATION");
      data.unitIds = [...new Set(patch.unitIds)];
    }
    const r = await runTx(g.tenantId, async (tx) => {
      const n = await tx.agentAccount.updateMany({ where: { tenantId: g.tenantId, id: row.id, updatedAt: expected, status: { not: "CLOSED" } }, data });
      if (n.count !== 1) return agencyFail("STALE");
      await auditInTx(tx, { tenantId: g.tenantId, actorType: "USER", actorId: g.userId, action: "agency.account.edit", targetId: row.id, after: { fields: [...keys].sort(), actorKind: "SHOP" } });
      return { ok: true as const };
    });
    if (!r.ok) return r;
    const fresh = await rowOf(g, row.id);
    if (!fresh) return agencyFail("NOT_FOUND");
    return { ok: true as const, account: await detailOf(g, fresh, now) };
  }, (name) => (/code/.test(name) ? agencyFail("CODE_TAKEN") : null));
}

/** ค้นตัวตนด้วยรหัสสาธารณะ (ทางเดียวที่ร้านหาตัวตน) — สิทธิ์ invite · นับทุกครั้ง · ผล 3 ช่อง · ผิดรูป/ไม่พบ ⇒ identity null */
export async function lookupAgentIdentityByCode(ctx: ShopCtx, input: { publicCode: string }, opts: AgencyOpts = {}): Promise<{ ok: true; identity: { publicCode: string; displayName: string; status: string } | null } | AgencyFail> {
  const p = z.object({ publicCode: z.string().max(32) }).strict().safeParse(input);
  if (!p.success) return agencyFail("VALIDATION");
  const now = opts.now ?? new Date();
  return safely("lookupAgentIdentityByCode", null, async () => {
    const g = await shopGate(ctx);
    if (!g || !g.can("agency.account.invite")) return agencyFail("FORBIDDEN");
    if (!agentAuthKeyReady()) return agencyFail("BUSY", { reason: "SERVER_KEY_MISSING" });
    const rl = await bucket(opts.deps, "agent:lookup:", `${g.tenantId}:${g.userId}`, AGENT_AUTH_LIMITS.lookupByCodePerActor, now);
    if (rl) return rl;
    const ident = await findAgentIdentityByCode(p.data.publicCode.trim().toUpperCase());
    return { ok: true as const, identity: ident ? { publicCode: ident.publicCode, displayName: ident.displayName, status: ident.status } : null };
  });
}

// ─────────────────── CRM (§10 · facade · lazy · นอก tx) ───────────────────
/** ผูกบริษัท CRM — edit (ไม่จำกัดสาขา) · ร้านไม่มี CRM ⇒ CRM_NOT_AVAILABLE · Party ไม่ตรง: INVITED/PENDING ⇒ ใช้ Party ของบริษัท · อื่น ⇒ CRM_PARTY_MISMATCH */
export async function linkAgentCrmCompany(ctx: ShopCtx, input: { agentAccountId: string; crmCompanyId: string }, opts: AgencyOpts = {}): Promise<{ ok: true; account: ShopAgentAccountDTO; replayed: boolean } | AgencyFail> {
  const p = z.object({ agentAccountId: ID, crmCompanyId: ID }).strict().safeParse(input);
  if (!p.success) return agencyFail("VALIDATION");
  const now = opts.now ?? new Date();
  return safely("linkAgentCrmCompany", null, async () => {
    const g = await shopGate(ctx);
    if (!g || !canWrite(g, "agency.account.edit")) return agencyFail("FORBIDDEN");
    const row = await rowOf(g, p.data.agentAccountId);
    if (!row) return agencyFail("NOT_FOUND");
    if (row.status === "CLOSED") return agencyFail("BAD_STATE");
    const crm: CrmMod = await import("@/lib/modules/crm");
    const target = await crm.crmPanelTarget(g.tenantId);
    if (!target) return agencyFail("CRM_NOT_AVAILABLE");
    if (row.crmCompanyId === p.data.crmCompanyId) return { ok: true as const, account: await detailOf(g, row, now), replayed: true };
    let companyPartyId: string;
    try {
      const c360 = await crm.companies.getCompany360({ tenantId: g.tenantId, systemId: target.systemId, actorUserId: g.userId }, crmActorOf(g), p.data.crmCompanyId);
      companyPartyId = c360.company.partyId;
    } catch {
      return agencyFail("NOT_FOUND");
    }
    let newPartyId: string | null = null;
    if (companyPartyId !== row.partyId) {
      if (row.status !== "INVITED" && row.status !== "PENDING") return agencyFail("CRM_PARTY_MISMATCH");
      newPartyId = companyPartyId;
    }
    const r = await runTx(g.tenantId, async (tx) => {
      const n = await tx.agentAccount.updateMany({ where: { tenantId: g.tenantId, id: row.id, updatedAt: row.updatedAt }, data: { crmCompanyId: p.data.crmCompanyId, ...(newPartyId ? { partyId: newPartyId } : {}) } });
      if (n.count !== 1) return agencyFail("STALE");
      await auditInTx(tx, { tenantId: g.tenantId, actorType: "USER", actorId: g.userId, action: "agency.account.crm_link", targetId: row.id, after: { fields: newPartyId ? ["crmCompanyId", "partyId"] : ["crmCompanyId"], actorKind: "SHOP" } });
      return { ok: true as const };
    });
    if (!r.ok) return r;
    const fresh = await rowOf(g, row.id);
    if (!fresh) return agencyFail("NOT_FOUND");
    return { ok: true as const, account: await detailOf(g, fresh, now), replayed: false };
  });
}
/** เลิกผูกบริษัท CRM — edit · ไม่ได้ผูก ⇒ replayed */
export async function unlinkAgentCrmCompany(ctx: ShopCtx, input: { agentAccountId: string }, opts: AgencyOpts = {}): Promise<{ ok: true; account: ShopAgentAccountDTO; replayed: boolean } | AgencyFail> {
  const p = z.object({ agentAccountId: ID }).strict().safeParse(input);
  if (!p.success) return agencyFail("VALIDATION");
  const now = opts.now ?? new Date();
  return safely("unlinkAgentCrmCompany", null, async () => {
    const g = await shopGate(ctx);
    if (!g || !canWrite(g, "agency.account.edit")) return agencyFail("FORBIDDEN");
    const row = await rowOf(g, p.data.agentAccountId);
    if (!row) return agencyFail("NOT_FOUND");
    if (!row.crmCompanyId) return { ok: true as const, account: await detailOf(g, row, now), replayed: true };
    const r = await runTx(g.tenantId, async (tx) => {
      const n = await tx.agentAccount.updateMany({ where: { tenantId: g.tenantId, id: row.id, crmCompanyId: row.crmCompanyId }, data: { crmCompanyId: null } });
      if (n.count !== 1) return agencyFail("STALE");
      await auditInTx(tx, { tenantId: g.tenantId, actorType: "USER", actorId: g.userId, action: "agency.account.crm_unlink", targetId: row.id, after: { fields: ["crmCompanyId"], actorKind: "SHOP" } });
      return { ok: true as const };
    });
    if (!r.ok) return r;
    const fresh = await rowOf(g, row.id);
    if (!fresh) return agencyFail("NOT_FOUND");
    return { ok: true as const, account: await detailOf(g, fresh, now), replayed: false };
  });
}
