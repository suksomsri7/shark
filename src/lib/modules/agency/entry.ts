// ─────────────────────────────────────────────────────────────
// agency/entry.ts — ทางเข้าตาราง global ของตัวตนเอเจนซี่ (AgentIdentity · AgentUser · AgentLogin · AgentSession · AgentLoginCode)
//   RUN TRIPS A1.1 (ใบสั่ง §5.2 · CC TC3 · §J.3.1 · OQ16) — ฟังก์ชันพื้นฐานเท่านั้น (route/คุกกี้/OTP/อีเมล = A1.2)
//
// 🔴 ไฟล์เดียวของโมดูล agency ที่ import `prisma` ดิบ (ตารางเหล่านี้ไม่มี tenantId — tenantDb ไม่กรองแกน global)
//    ไฟล์อื่นนอก agency/entry.ts + platform/agent-auth.ts อ้างโมเดล global = fitness F17.1 แดง
// 🔴 ความเป็นส่วนตัว: ตัวตนมีแค่ชื่อแสดง/รหัสสาธารณะ/แฮชเลขภาษีนิติบุคคล · ไม่มีฟังก์ชันค้นด้วยชื่อ/เลขภาษี/อีเมล ·
//    ไม่มีผลใดคืน taxIdHash · ไม่บันทึกเลขภาษี/รหัส/โทเคนลง log (log เฉพาะชื่อ error + รหัส + stack frame)
// 🔴 ผู้กระทำ: AgentUser ต้อง ACTIVE + ตัวตน ACTIVE ไม่งั้น FORBIDDEN · อินพุตผิด ⇒ VALIDATION (zod strict · ไม่โยน) · ฐานล้มไม่คาด ⇒ BUSY
// ─────────────────────────────────────────────────────────────
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { INTEGRATIONS_CREDENTIALS_ENV, INTEGRATIONS_CREDENTIALS_KEY_MIN } from "@/lib/core/integrations/secret-box";
import { AGENT_ROLES, isAgentPublicCode, makeAgentPublicCode, normalizeAgentLogin, normalizeJuristicTaxId, type AgentRole } from "./identity-core";

export type AgentIdentityPublic = { id: string; displayName: string; publicCode: string; status: string };
export type AgentEntryFail = { ok: false; code: "VALIDATION" | "FORBIDDEN" | "NOT_FOUND" | "LOGIN_TAKEN" | "BUSY"; reason?: string };
export type AgentLoginInput = { kind: string; providerId: string; subject: string };

const ACTIVE = "ACTIVE";
const PUBLIC_SELECT = { id: true, displayName: true, publicCode: true, status: true } as const;
const fail = (code: AgentEntryFail["code"], reason?: string): AgentEntryFail => (reason ? { ok: false, code, reason } : { ok: false, code });
const toPublic = (r: { id: string; displayName: string; publicCode: string; status: string }): AgentIdentityPublic => ({
  id: r.id,
  displayName: r.displayName,
  publicCode: r.publicCode,
  status: r.status,
});
const isRole = (r: string): r is AgentRole => (AGENT_ROLES as readonly string[]).includes(r);

// ─────────────────── อินพุต (zod strict) ───────────────────
const NAME = z.string().trim().min(1).max(120);
const LOGIN = z.object({ kind: z.string().max(16), providerId: z.string().max(64), subject: z.string().max(320) }).strict();
const ACTOR = z.object({ agentUserId: z.string().min(1).max(64) }).strict();
const CREATE = z.object({ displayName: NAME, owner: z.object({ displayName: NAME, login: LOGIN }).strict() }).strict();
const PATCH = z.object({ displayName: NAME }).strict();
const TAX_RAW = z.string().max(32);

// ─────────────────── แฮชเลขภาษีนิติบุคคล (ใบสั่ง §5.2 · มติ R1) ───────────────────
const TAX_KEY_LABEL = "shark:agent-taxid:v1";
const TAX_DATA_PREFIX = "TH-JURISTIC:";
const NOT_CONFIGURED = "NOT_CONFIGURED";

/**
 * "v1:" + hex(HMAC-SHA256(K, "TH-JURISTIC:" + เลข)) · K = HMAC-SHA256(key = INTEGRATIONS_CREDENTIALS_KEY ดิบ, "shark:agent-taxid:v1")
 * อ่าน env ทุกครั้งที่เรียก · ไม่มี/สั้นกว่า 32 ตัว (หลัง trim · ตาม secret-box.ts) ⇒ โยน "NOT_CONFIGURED" · ไม่มีกุญแจสำรอง
 * รับเฉพาะเลขนิติบุคคลที่ normalize แล้ว (13 หลัก ขึ้นต้น 0 checksum ถูก) — อย่างอื่นโยน "INVALID_TAX_ID"
 */
export function agentTaxIdHash(juristicTaxId13: string): string {
  const raw = process.env[INTEGRATIONS_CREDENTIALS_ENV];
  if (typeof raw !== "string" || raw.trim().length < INTEGRATIONS_CREDENTIALS_KEY_MIN) throw new Error(NOT_CONFIGURED);
  const id = normalizeJuristicTaxId(juristicTaxId13);
  if (id === null || id !== juristicTaxId13) throw new Error("INVALID_TAX_ID");
  const k = createHmac("sha256", raw).update(TAX_KEY_LABEL).digest();
  return `v1:${createHmac("sha256", k).update(`${TAX_DATA_PREFIX}${id}`).digest("hex")}`;
}
const hashOrKeyFail = (id13: string): { hash: string } | AgentEntryFail => {
  try {
    return { hash: agentTaxIdHash(id13) };
  } catch (e) {
    if (e instanceof Error && e.message === NOT_CONFIGURED) return fail("BUSY", "KEY_NOT_CONFIGURED");
    throw e;
  }
};

// ─────────────────── บันทึกข้อผิดพลาด (ไม่มีอินพุตของผู้เรียก) ───────────────────
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
async function logUnexpected(where: string, e: unknown): Promise<void> {
  const err = e instanceof Error ? e : null;
  const o: Record<string, unknown> = err ? { ...err } : {};
  const frames = err?.stack ? err.stack.split("\n").filter((l) => /^\s+at\s/.test(l)).slice(0, 8).map((l) => l.trim().slice(0, 200)) : [];
  const detail = { where, name: err ? err.name || "Error" : typeof e, code: typeof o.code === "string" ? o.code.slice(0, 16) : null, frames };
  await logOps("ERROR", "agency.entry", `ข้อผิดพลาดที่ไม่คาดคิดใน ${where}`, { detail: JSON.stringify(detail) }).catch(() => undefined);
}
async function guarded<T>(where: string, fn: () => Promise<T | AgentEntryFail>): Promise<T | AgentEntryFail> {
  try {
    return await fn();
  } catch (e) {
    await logUnexpected(where, e);
    return fail("BUSY", "DB");
  }
}

// ─────────────────── ผู้กระทำ ───────────────────
type ActorRow = { id: string; identityId: string; role: AgentRole };
/** AgentUser ACTIVE + ตัวตน ACTIVE (+ บทบาทที่อนุญาต) ไม่งั้น null ⇒ FORBIDDEN */
async function loadActor(agentUserId: string, roles: readonly AgentRole[] = AGENT_ROLES): Promise<ActorRow | null> {
  const u = await prisma.agentUser.findUnique({ where: { id: agentUserId }, select: { id: true, identityId: true, role: true, status: true } });
  if (!u || u.status !== ACTIVE || !isRole(u.role) || !roles.includes(u.role)) return null;
  const i = await prisma.agentIdentity.findUnique({ where: { id: u.identityId }, select: { status: true } });
  if (!i || i.status !== ACTIVE) return null;
  return { id: u.id, identityId: u.identityId, role: u.role };
}

// ─────────────────── ฟังก์ชัน ───────────────────
const CODE_TRIES = 5;

/** สร้างตัวตน + ผู้ใช้ OWNER + วิธีล็อกอิน (verifiedAt = ตอนนี้ · ผู้เรียกยืนยันแล้ว) ใน tx เดียว · ล็อกอินมีเจ้าของ ⇒ LOGIN_TAKEN ไม่มีแถวใหม่ */
export async function createAgentIdentity(input: {
  displayName: string;
  owner: { displayName: string; login: AgentLoginInput };
}): Promise<{ ok: true; identity: AgentIdentityPublic; agentUserId: string } | AgentEntryFail> {
  const p = CREATE.safeParse(input);
  if (!p.success) return fail("VALIDATION");
  const login = normalizeAgentLogin(p.data.owner.login);
  if (!login) return fail("VALIDATION", "LOGIN");
  const displayName = p.data.displayName;
  const ownerName = p.data.owner.displayName;
  return guarded("createAgentIdentity", async () => {
    for (let attempt = 0; attempt < CODE_TRIES; attempt++) {
      try {
        const r = await prisma.$transaction(async (tx) => {
          const taken = await tx.agentLogin.findUnique({
            where: { kind_providerId_subject: { kind: login.kind, providerId: login.providerId, subject: login.subject } },
            select: { id: true },
          });
          if (taken) return null;
          const identity = await tx.agentIdentity.create({
            data: { displayName, publicCode: makeAgentPublicCode(randomBytes(6)), status: ACTIVE },
            select: PUBLIC_SELECT,
          });
          const user = await tx.agentUser.create({ data: { identityId: identity.id, displayName: ownerName, role: "OWNER", status: ACTIVE }, select: { id: true } });
          await tx.agentLogin.create({ data: { agentUserId: user.id, kind: login.kind, providerId: login.providerId, subject: login.subject, verifiedAt: new Date() } });
          return { identity, agentUserId: user.id };
        });
        if (!r) return fail("LOGIN_TAKEN");
        return { ok: true as const, identity: toPublic(r.identity), agentUserId: r.agentUserId };
      } catch (e) {
        if (!isUnique(e)) throw e;
        // ชน unique: ล็อกอินถูกจองพร้อมกัน ⇒ LOGIN_TAKEN · ไม่งั้น = รหัสสาธารณะซ้ำ ⇒ สุ่มใหม่
        const taken = await prisma.agentLogin.findUnique({
          where: { kind_providerId_subject: { kind: login.kind, providerId: login.providerId, subject: login.subject } },
          select: { id: true },
        });
        if (taken) return fail("LOGIN_TAKEN");
      }
    }
    return fail("BUSY", "PUBLIC_CODE_EXHAUSTED");
  });
}

/** ทางเดียวที่ฝั่งร้านหาตัวตน (A1.2 ใส่ rate limit) · รหัสผิดรูป/ไม่มี ⇒ null · คืน 4 ช่องสาธารณะ */
export async function findAgentIdentityByCode(publicCode: string): Promise<AgentIdentityPublic | null> {
  if (!isAgentPublicCode(publicCode)) return null;
  const r = await prisma.agentIdentity.findUnique({ where: { publicCode }, select: PUBLIC_SELECT });
  return r ? toPublic(r) : null;
}

/**
 * หาผู้ใช้ที่ล็อกอินได้จากวิธีล็อกอิน (normalize ก่อน · อีเมลตัวใหญ่ = ตัวเดิม)
 * r1 (ผลตรวจ m8) ▸ คืนเฉพาะผู้ใช้ ACTIVE ที่ตัวตน ACTIVE (status = "ACTIVE" เสมอ) — DISABLED/ERASED/ตัวตนไม่ ACTIVE/ไม่พบ/ผิดรูป ⇒ null
 *   (ผู้เรียกลืมตรวจสถานะไม่ได้) ◂
 */
export async function agentUserByLogin(login: AgentLoginInput): Promise<{ agentUserId: string; identityId: string; role: AgentRole; status: string } | null> {
  const n = normalizeAgentLogin(login);
  if (!n) return null;
  const l = await prisma.agentLogin.findUnique({ where: { kind_providerId_subject: { kind: n.kind, providerId: n.providerId, subject: n.subject } }, select: { agentUserId: true } });
  if (!l) return null;
  const who = await loadActor(l.agentUserId);
  if (!who) return null;
  return { agentUserId: who.id, identityId: who.identityId, role: who.role, status: ACTIVE };
}

/** แก้ชื่อแสดงของตัวตน — OWNER เท่านั้น */
export async function updateAgentIdentity(actor: { agentUserId: string }, patch: { displayName: string }): Promise<{ ok: true; identity: AgentIdentityPublic } | AgentEntryFail> {
  const a = ACTOR.safeParse(actor);
  const p = PATCH.safeParse(patch);
  if (!a.success || !p.success) return fail("VALIDATION");
  const displayName = p.data.displayName;
  return guarded("updateAgentIdentity", async () => {
    const who = await loadActor(a.data.agentUserId, ["OWNER"]);
    if (!who) return fail("FORBIDDEN");
    const r = await prisma.agentIdentity.update({ where: { id: who.identityId }, data: { displayName }, select: PUBLIC_SELECT });
    return { ok: true as const, identity: toPublic(r) };
  });
}

/** ตั้ง/ล้างเลขภาษีนิติบุคคลของตัวตน (เก็บแฮชเท่านั้น) — OWNER · เลขบุคคล/checksum ผิด ⇒ VALIDATION · ไม่ตรวจซ้ำข้ามตัวตน (มติ R1 · A1.2 ยืนยันความเป็นเจ้าของ) */
export async function setAgentIdentityTaxId(actor: { agentUserId: string }, taxId: string | null): Promise<{ ok: true } | AgentEntryFail> {
  const a = ACTOR.safeParse(actor);
  if (!a.success) return fail("VALIDATION");
  let hash: string | null = null;
  if (taxId !== null) {
    const raw = TAX_RAW.safeParse(taxId);
    const id = raw.success ? normalizeJuristicTaxId(raw.data) : null;
    if (id === null) return fail("VALIDATION", "TAX_ID");
    const h = hashOrKeyFail(id);
    if ("ok" in h) return h;
    hash = h.hash;
  }
  return guarded("setAgentIdentityTaxId", async () => {
    const who = await loadActor(a.data.agentUserId, ["OWNER"]);
    if (!who) return fail("FORBIDDEN");
    await prisma.agentIdentity.update({ where: { id: who.identityId }, data: { taxIdHash: hash }, select: { id: true } });
    return { ok: true as const };
  });
}

/** เทียบเลขภาษีที่กรอกกับแฮชของตัวตนตัวเอง — OWNER/ADMIN · ไม่มีแฮช ⇒ match false */
export async function verifyAgentIdentityTaxId(actor: { agentUserId: string }, taxId: string): Promise<{ ok: true; match: boolean } | AgentEntryFail> {
  const a = ACTOR.safeParse(actor);
  const raw = TAX_RAW.safeParse(taxId);
  if (!a.success || !raw.success) return fail("VALIDATION");
  const id = normalizeJuristicTaxId(raw.data);
  if (id === null) return fail("VALIDATION", "TAX_ID");
  const h = hashOrKeyFail(id);
  if ("ok" in h) return h;
  return guarded("verifyAgentIdentityTaxId", async () => {
    const who = await loadActor(a.data.agentUserId, ["OWNER", "ADMIN"]);
    if (!who) return fail("FORBIDDEN");
    const r = await prisma.agentIdentity.findUnique({ where: { id: who.identityId }, select: { taxIdHash: true } });
    const stored = r?.taxIdHash ?? null;
    const match = stored !== null && stored.length === h.hash.length && timingSafeEqual(Buffer.from(stored), Buffer.from(h.hash));
    return { ok: true as const, match };
  });
}

/** เพิ่มวิธีล็อกอินให้ตัวเอง (ผู้เรียกยืนยันวิธีใหม่แล้ว · A1.2) · มีเจ้าของอื่น ⇒ LOGIN_TAKEN · เป็นของตัวเองอยู่แล้ว ⇒ ok (id เดิม) */
export async function addAgentLogin(actor: { agentUserId: string }, login: AgentLoginInput): Promise<{ ok: true; loginId: string } | AgentEntryFail> {
  const a = ACTOR.safeParse(actor);
  const l = LOGIN.safeParse(login);
  if (!a.success || !l.success) return fail("VALIDATION");
  const n = normalizeAgentLogin(l.data);
  if (!n) return fail("VALIDATION", "LOGIN");
  const where = { kind_providerId_subject: { kind: n.kind, providerId: n.providerId, subject: n.subject } };
  return guarded("addAgentLogin", async () => {
    const who = await loadActor(a.data.agentUserId);
    if (!who) return fail("FORBIDDEN");
    const existing = await prisma.agentLogin.findUnique({ where, select: { id: true, agentUserId: true } });
    if (existing) return existing.agentUserId === who.id ? { ok: true as const, loginId: existing.id } : fail("LOGIN_TAKEN");
    try {
      const r = await prisma.agentLogin.create({ data: { agentUserId: who.id, kind: n.kind, providerId: n.providerId, subject: n.subject, verifiedAt: new Date() }, select: { id: true } });
      return { ok: true as const, loginId: r.id };
    } catch (e) {
      if (isUnique(e)) return fail("LOGIN_TAKEN");
      throw e;
    }
  });
}

/**
 * บัญชีเอเจนซี่ของผู้ใช้ข้ามร้าน — สมาชิก active ที่บัญชีเป็นของตัวตนของผู้ใช้ · 4 ช่องเท่านั้น
 * 🔴 เรียกได้จาก session ของเอเจนซี่เองเท่านั้น (A1.2) · ผู้ใช้/ตัวตนไม่ ACTIVE ⇒ []
 */
export async function listAgentAccountsOfUser(agentUserId: string): Promise<{ agentAccountId: string; tenantId: string; status: string; role: AgentRole }[]> {
  if (typeof agentUserId !== "string" || agentUserId.length === 0 || agentUserId.length > 64) return [];
  const who = await loadActor(agentUserId);
  if (!who) return [];
  const members = await prisma.agentAccountMember.findMany({ where: { agentUserId: who.id, active: true }, select: { agentAccountId: true, role: true } });
  if (members.length === 0) return [];
  const accounts = await prisma.agentAccount.findMany({
    where: { id: { in: members.map((m) => m.agentAccountId) }, identityId: who.identityId },
    select: { id: true, tenantId: true, status: true },
    orderBy: { id: "asc" },
  });
  const roleOf = new Map(members.map((m) => [m.agentAccountId, m.role]));
  const out: { agentAccountId: string; tenantId: string; status: string; role: AgentRole }[] = [];
  for (const acc of accounts) {
    const role = roleOf.get(acc.id);
    if (role && isRole(role)) out.push({ agentAccountId: acc.id, tenantId: acc.tenantId, status: acc.status, role });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// TRIPS A1.2a ▸ ตัวช่วยตาราง global ที่ใบสั่ง §5 §6 §9 ต้องใช้ (ต่อท้าย · ฟังก์ชันของ A1.1 ข้างบนไม่เปลี่ยน)
//   ใบสั่ง ledger/trips-briefs/A1.2.md · มติผู้คุม R1–R5
// 🔴 ฟังก์ชันฝั่งเอเจนซี่ (§9) รับ actor { agentUserId } ที่มาจาก session ที่ resolve แล้วเท่านั้น — ส่งออกทาง agency/agent-side.ts
//    (ไม่อยู่บน facade index.ts) · agent-side.ts import ได้เฉพาะจาก platform/agent-auth.ts
// 🔴 ตัวช่วย *InTx รับ tx ของผู้เรียก (tenantDb หรือ prisma) ⇒ ไม่มี DB connection ที่สองใน tx · SQL ของตาราง global อยู่ในไฟล์นี้เท่านั้น
// 🔴 ลำดับล็อก (สองอาร์กิวเมนต์ hashtext(ns), hashtext(key)): agency.identity.v1 → agency.account.v1 → agency.invite.v1 → แถว AgentAccount เรียง id
// 🔴 audit ฝั่งเอเจนซี่: actorType SYSTEM · actorId = AgentAccountMember.id ของผู้กระทำในบัญชีนั้น (หรือ null) · after ⊂ {from to reason actorKind fields}
// ═══════════════════════════════════════════════════════════════════════════════════════════
import {
  AGENCY_ID_RE,
  agencyFail,
  canManageAgentRole,
  cascadeMemberRole,
  closeReasonKeepingSticky,
  agentRoleRank,
  isPgRetryable,
  pgErrorCode,
  type AgencyFail,
} from "./accounts-core";
import { AgentKeyMissing, agentAuthHash, teammateJtiRow } from "./tokens";

type A12Tx = Prisma.TransactionClient;
// r2 (มติ §10 ข้อ 6 ข้อ 18) ▸ "agency.login.v1" (คีย์ = แฮช login-target ของอีเมล) ถือ **ก่อน** agency.identity.v1 เสมอ — ใช้ที่ verifyAgentLoginCode เท่านั้น
//   ลำดับเต็ม: agency.login.v1 → agency.identity.v1 → agency.account.v1 → agency.invite.v1 → แถว AgentAccount เรียง id → แถว AgentLoginCode
export type AgencyLockNs = "agency.login.v1" | "agency.identity.v1" | "agency.account.v1" | "agency.invite.v1";
const A12_TX_OPTS = { maxWait: 10_000, timeout: 30_000 } as const;
const ERASED_USER_NAME = "ผู้ใช้ที่ถูกลบ";
const CLOSED_IDENTITY_NAME = "เอเจนซี่ที่ปิดแล้ว";

/** advisory lock แบบสองอาร์กิวเมนต์ (ไม่ชนคีย์ bigint ของโมดูลอื่น) — อยู่ถึงจบ tx */
export async function lockAgencyKeyInTx(tx: A12Tx, ns: AgencyLockNs, key: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtext(${ns}), hashtext(${key}))`;
}

export type AgentActorRow = { id: string; identityId: string; role: AgentRole };
/** ผู้กระทำ ACTIVE + ตัวตน ACTIVE (อ่านใน tx ของผู้เรียก — "อ่านซ้ำใต้ล็อก") · ไม่ผ่าน ⇒ null */
export async function agentActorInTx(tx: A12Tx, agentUserId: string): Promise<AgentActorRow | null> {
  if (typeof agentUserId !== "string" || !agentUserId || agentUserId.length > 64) return null;
  const rows = await tx.$queryRaw<{ id: string; identityId: string; role: string }[]>`
    SELECT u.id, u."identityId", u.role FROM "AgentUser" u JOIN "AgentIdentity" i ON i.id = u."identityId"
    WHERE u.id = ${agentUserId} AND u.status = 'ACTIVE' AND i.status = 'ACTIVE'`;
  const r = rows[0];
  return r && isRole(r.role) ? { id: r.id, identityId: r.identityId, role: r.role } : null;
}
/** ผู้กระทำนอก tx (ก่อนทำ rate limit/Party) — ต้องอ่านซ้ำใต้ล็อกอีกครั้งเสมอ */
export async function agentActorNow(agentUserId: string): Promise<AgentActorRow | null> {
  return agentActorInTx(prisma, agentUserId);
}
/** id ของ AgentUser ACTIVE role OWNER ทั้งหมดของตัวตน (เรียง id) */
export async function identityOwnerIdsInTx(tx: A12Tx, identityId: string): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "AgentUser" WHERE "identityId" = ${identityId} AND role = 'OWNER' AND status = 'ACTIVE' ORDER BY id`;
  return rows.map((r) => r.id);
}
/** แท็กอีเมล (agentAuthHash "email-tag") ของทุกล็อกอิน EMAIL ของผู้ใช้ — ไม่คืนอีเมล · ไม่มีกุญแจ ⇒ โยน AgentKeyMissing */
export async function agentEmailTagsInTx(tx: A12Tx, agentUserId: string): Promise<string[]> {
  const rows = await tx.$queryRaw<{ subject: string }[]>`SELECT subject FROM "AgentLogin" WHERE "agentUserId" = ${agentUserId} AND kind = 'EMAIL'`;
  return rows.map((r) => agentAuthHash("email-tag", r.subject));
}
/**
 * r3 (มติ §11 ข้อ 3) ▸ แท็กผู้สมัคร **ผูกร้าน**: agentAuthHash("applicant-tag", tenantId + ":" + อีเมลล็อกอิน normalize) — ค่าทึบที่ส่งให้บริการฝั่งร้าน
 * (accounts.ts ไม่เห็นอีเมลและไม่อ่านตาราง global เอง) · tenantId อยู่ในข้อมูลที่แฮช ⇒ แท็กของอีเมลเดียวกันที่สองร้านไม่เท่ากัน เทียบข้ามร้านไม่ได้
 *  - own    = ล็อกอิน EMAIL ของผู้กระทำเอง (เรียงตามเวลาสร้าง · ตัวแรก = แท็กหลักที่เก็บ)
 *  - owners = ล็อกอิน EMAIL ของ OWNER คนอื่นที่ ACTIVE ในตัวตนเดียวกัน (เก็บคู่กับแท็กหลัก)
 *  - team   = ล็อกอิน EMAIL ของผู้ใช้ ACTIVE ที่เหลือของตัวตน (ใช้ "เทียบ" เท่านั้น ไม่เก็บ)
 * ไม่คืนอีเมล · ไม่มีกุญแจ ⇒ โยน AgentKeyMissing (ผู้เรียกตอบ BUSY SERVER_KEY_MISSING) · ไม่มีกุญแจสำรอง · ผู้ใช้ที่มีแต่ล็อกอิน LINE ⇒ ไม่มีแท็ก
 */
export type AgentApplicantTags = { own: string[]; owners: string[]; team: string[] };
export async function agentApplicantTagsInTx(tx: A12Tx, tenantId: string, actor: AgentActorRow): Promise<AgentApplicantTags> {
  const rows = await tx.$queryRaw<{ agentUserId: string; role: string; subject: string }[]>`
    SELECT l."agentUserId", u.role, l.subject FROM "AgentLogin" l JOIN "AgentUser" u ON u.id = l."agentUserId"
    WHERE u."identityId" = ${actor.identityId} AND u.status = 'ACTIVE' AND l.kind = 'EMAIL'
    ORDER BY l."createdAt", l.id LIMIT 200`;
  const out: AgentApplicantTags = { own: [], owners: [], team: [] };
  const seen = new Set<string>();
  for (const r of rows) {
    const tag = agentAuthHash("applicant-tag", `${tenantId}:${r.subject}`);
    if (seen.has(tag)) continue;
    seen.add(tag);
    (r.agentUserId === actor.id ? out.own : r.role === "OWNER" ? out.owners : out.team).push(tag);
  }
  return out;
}
/** แถว INVITED (เชิญด้วยรหัส) ที่ยังไม่หมดอายุของตัวตน ข้ามทุกร้าน — นับอย่างเดียว (มติ R1 ข้อ 11) */
export async function countOpenCodeInvitesOfIdentity(identityId: string, now: Date): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "AgentAccount"
    WHERE "identityId" = ${identityId} AND status = 'INVITED' AND ("inviteExpiresAt" IS NULL OR "inviteExpiresAt" > ${now})`;
  return rows[0]?.n ?? 0;
}
/** r2 (มติ §10 ข้อ 10) ▸ นับคำเชิญด้วยรหัสที่ค้างของตัวตน **ใน tx ของผู้เรียก** (ผู้เรียกถือ agency.identity.v1 ของตัวตนนี้ ⇒ นับ+แทรกไม่แข่งกันข้ามร้าน) */
export async function countOpenCodeInvitesOfIdentityInTx(tx: A12Tx, identityId: string, now: Date): Promise<number> {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "AgentAccount"
    WHERE "identityId" = ${identityId} AND status = 'INVITED' AND ("inviteExpiresAt" IS NULL OR "inviteExpiresAt" > ${now})`;
  return rows[0]?.n ?? 0;
}
/** ตัวตนยัง ACTIVE ไหม (อ่านใน tx ของผู้เรียก ใต้ agency.identity.v1 — กันเชิญด้วยรหัสแข่งกับการปิดตัวตน · N8) */
export async function agentIdentityActiveInTx(tx: A12Tx, identityId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "AgentIdentity" WHERE id = ${identityId} AND status = 'ACTIVE'`;
  return rows.length === 1;
}
/**
 * r2 (มติ §10 ข้อ 12) ▸ ผู้ใช้ที่ "ใช้งานได้" (AgentUser ACTIVE) ในชุด id — DTO ฝั่งร้านใช้ตอบ active ของสมาชิกเท่านั้น
 * (ใช้ได้/ไม่ได้ · ไม่เผยว่า DISABLED หรือ ERASED · ไม่เผยอะไรข้ามร้าน)
 */
export async function usableAgentUserIds(ids: readonly string[]): Promise<Set<string>> {
  const list = [...new Set(ids.filter((x) => typeof x === "string" && x.length > 0))].slice(0, 5000);
  if (!list.length) return new Set();
  const rows = await prisma.agentUser.findMany({ where: { id: { in: list }, status: ACTIVE }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}
/** ช่องสาธารณะของตัวตน (DTO ฝั่งร้าน: ไม่มี id) */
export async function identityPublicByIds(ids: readonly string[]): Promise<Map<string, { publicCode: string; displayName: string; status: string }>> {
  const list = [...new Set(ids.filter((x) => typeof x === "string" && x.length > 0))].slice(0, 500);
  if (!list.length) return new Map();
  const rows = await prisma.agentIdentity.findMany({ where: { id: { in: list } }, select: { id: true, publicCode: true, displayName: true, status: true } });
  return new Map(rows.map((r) => [r.id, { publicCode: r.publicCode, displayName: r.displayName, status: r.status }]));
}
/** ชื่อแสดงของผู้ใช้ (DTO สมาชิกฝั่งร้าน: ชื่อเท่านั้น) */
export async function agentUserDisplayNames(ids: readonly string[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((x) => typeof x === "string" && x.length > 0))].slice(0, 2000);
  if (!list.length) return new Map();
  const rows = await prisma.agentUser.findMany({ where: { id: { in: list } }, select: { id: true, displayName: true } });
  return new Map(rows.map((r) => [r.id, r.displayName]));
}

/** สร้างตัวตน + OWNER + ล็อกอิน EMAIL ใน tx ของผู้เรียก (ยืนยันรหัสแล้ว) — ชน unique (ล็อกอิน/รหัสสาธารณะ) ⇒ โยน (ผู้เรียกจัดการ) */
export async function createAgentIdentityInTx(tx: A12Tx, p: { displayName: string; ownerName: string; emailNorm: string; now: Date }): Promise<{ agentUserId: string; identityId: string }> {
  // r2 (มติ §10 ข้อ 13) ▸ เลือกรหัสสาธารณะที่ยังว่างก่อนแทรก (ชนตอนแทรกเหลือแค่กรณีแข่งกันจริง — ผู้เรียกลองทั้ง tx ใหม่ ไม่ตอบ LOGIN_UNAVAILABLE)
  let publicCode = makeAgentPublicCode(randomBytes(6));
  for (let i = 0; i < CODE_TRIES; i++) {
    const taken = await tx.agentIdentity.findUnique({ where: { publicCode }, select: { id: true } });
    if (!taken) break;
    publicCode = makeAgentPublicCode(randomBytes(6));
  }
  const identity = await tx.agentIdentity.create({ data: { displayName: p.displayName, publicCode, status: ACTIVE }, select: { id: true } });
  const user = await tx.agentUser.create({ data: { identityId: identity.id, displayName: p.ownerName, role: "OWNER", status: ACTIVE }, select: { id: true } });
  await tx.agentLogin.create({ data: { agentUserId: user.id, kind: "EMAIL", providerId: "email", subject: p.emailNorm, verifiedAt: p.now } });
  return { agentUserId: user.id, identityId: identity.id };
}
/** เพื่อนร่วมทีมใหม่ (token ผ่านแล้ว) ใน tx ของผู้เรียก */
export async function createTeammateUserInTx(tx: A12Tx, p: { identityId: string; role: AgentRole; displayName: string; emailNorm: string; now: Date }): Promise<string> {
  const user = await tx.agentUser.create({ data: { identityId: p.identityId, displayName: p.displayName, role: p.role, status: ACTIVE }, select: { id: true } });
  await tx.agentLogin.create({ data: { agentUserId: user.id, kind: "EMAIL", providerId: "email", subject: p.emailNorm, verifiedAt: p.now } });
  return user.id;
}
/** ผู้ใช้ของล็อกอิน EMAIL (normalize แล้ว): login มีไหม + ผู้ใช้ ACTIVE ที่ตัวตน ACTIVE (หรือ null) */
export async function agentUserOfEmailLoginInTx(tx: A12Tx, emailNorm: string): Promise<{ loginExists: boolean; user: AgentActorRow | null }> {
  const l = await tx.agentLogin.findUnique({ where: { kind_providerId_subject: { kind: "EMAIL", providerId: "email", subject: emailNorm } }, select: { agentUserId: true } });
  if (!l) return { loginExists: false, user: null };
  return { loginExists: true, user: await agentActorInTx(tx, l.agentUserId) };
}
/**
 * r2 (มติ §10 ข้อ 2) ▸ บันทึกว่า jti ของ token เชิญเพื่อนถูกใช้แล้ว (ใน tx ของการรับ · ใต้ agency.identity.v1) — แถวในตารางรหัสเข้าระบบ:
 * id กำหนดจาก jti (PK ⇒ ใช้ซ้ำไม่ได้แม้แข่งกัน) · usedAt = now · expiresAt = อายุ token (งานกวาดเดิมเก็บหลังหมดอายุ 1 วัน — token หมดอายุไปแล้ว)
 * คืน false = jti นี้ใช้ไปแล้ว (ผู้เรียกตอบ INVITE_INVALID) · แถวไม่ผูกกับผู้ใช้/อีเมล ⇒ การลบ/ปิดผู้ใช้ไม่ลบแถวนี้
 */
export async function consumeTeammateJtiInTx(tx: A12Tx, p: { jti: string; expiresAt: Date; now: Date }): Promise<boolean> {
  const row = teammateJtiRow(p.jti);
  const n = await tx.$executeRaw`
    INSERT INTO "AgentLoginCode" (id, target, "codeHash", attempts, "expiresAt", "usedAt", "createdAt")
    VALUES (${row.id}, ${row.target}, ${row.target}, 0, ${p.expiresAt}, ${p.now}, ${p.now})
    ON CONFLICT (id) DO NOTHING`;
  return n === 1;
}
/** ผู้เชิญ (b) ยัง ACTIVE + ตัวตนเดียวกับ token (i) + บทบาทปัจจุบันให้ r ได้ (มติ R1 ข้อ 9) */
export async function teammateInviterValidInTx(tx: A12Tx, p: { inviterId: string; identityId: string; role: AgentRole }): Promise<boolean> {
  const who = await agentActorInTx(tx, p.inviterId);
  if (!who || who.identityId !== p.identityId) return false;
  if (who.role !== "OWNER" && who.role !== "ADMIN") return false;
  return p.role === "OWNER" ? who.role === "OWNER" : true;
}

// ─────────────────── §9 ผู้ใช้และบทบาท (ฝั่งเอเจนซี่ · ส่งออกผ่าน agent-side.ts) ───────────────────
type TeamResult<T> = ({ ok: true } & T) | AgencyFail;
const A12_ID = z.string().regex(AGENCY_ID_RE); // r2 (มติ §10 ข้อ 17): ไม่มีอักขระควบคุม/NUL ไปถึงฐาน
const A12_ACTOR = z.object({ agentUserId: A12_ID }).strict();
const A12_ROLE = z.enum(AGENT_ROLES);
class TeamAbort extends Error {
  constructor(readonly fail: AgencyFail) {
    super(fail.code);
  }
}
const TEAM_TX_TRIES = 3;
/**
 * tx + ลองใหม่เมื่อ deadlock/serialization (r2 · มติ §10 ข้อ 18: อ่าน SQLSTATE จริงใต้ P2010 ผ่าน pgErrorCode) ·
 * ลองครบแล้วยังชน/รอล็อกนาน ⇒ BUSY LOCK (ไม่ใช่ ERROR) · TeamAbort ⇒ ผลล้ม · อื่น ⇒ log (ไม่มีอินพุต) + BUSY
 */
async function teamTx<T>(where: string, fn: (tx: A12Tx) => Promise<TeamResult<T>>): Promise<TeamResult<T>> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction((tx) => fn(tx), A12_TX_OPTS);
    } catch (e) {
      if (e instanceof TeamAbort) return e.fail;
      if (e instanceof AgentKeyMissing) return agencyFail("BUSY", { reason: "SERVER_KEY_MISSING" });
      const code = pgErrorCode(e);
      if (isPgRetryable(code) && attempt < TEAM_TX_TRIES) continue;
      if (isPgRetryable(code) || code === "55P03" || code === "TX_TIMEOUT") return agencyFail("BUSY", { reason: "LOCK" });
      await logUnexpected(where, e);
      return agencyFail("BUSY", { reason: "UNEXPECTED" });
    }
  }
}
const abort = (code: Parameters<typeof agencyFail>[0], reason?: string): never => {
  throw new TeamAbort(agencyFail(code, reason ? { reason } : {}));
};
async function auditAgentInTx(tx: A12Tx, a: { tenantId: string; actorMemberId: string | null; action: string; targetType: string; targetId: string; after: Record<string, unknown> }): Promise<void> {
  await tx.auditLog.create({
    data: { tenantId: a.tenantId, actorType: "SYSTEM", actorId: a.actorMemberId, action: a.action, targetType: a.targetType, targetId: a.targetId, after: { ...a.after, actorKind: "AGENT" } as Prisma.InputJsonValue },
  });
}
type MemberRow = { id: string; tenantId: string; agentAccountId: string; agentUserId: string; role: string; active: boolean };
type AccRow = { id: string; tenantId: string; status: string; identityId: string | null; statusReason: string | null };
/** ล็อกแถวบัญชี (FOR UPDATE · เรียง id) */
async function lockAccountsInTx(tx: A12Tx, ids: readonly string[]): Promise<AccRow[]> {
  const list = [...new Set(ids)].sort();
  if (!list.length) return [];
  return tx.$queryRaw<AccRow[]>`SELECT id, "tenantId", status, "identityId", "statusReason" FROM "AgentAccount" WHERE id = ANY(${list}::text[]) ORDER BY id FOR UPDATE`;
}
const OWNER_REQUIRED = new Set(["PENDING", "ACTIVE", "SUSPENDED"]);
/** บัญชีนี้ยังมีสมาชิก active role OWNER ที่ AgentUser ACTIVE นอกจาก exclude ไหม */
async function otherActiveOwnerMember(tx: A12Tx, agentAccountId: string, excludeUserId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "AgentAccountMember" m JOIN "AgentUser" u ON u.id = m."agentUserId"
    WHERE m."agentAccountId" = ${agentAccountId} AND m.active AND m.role = 'OWNER' AND u.status = 'ACTIVE' AND m."agentUserId" <> ${excludeUserId}`;
  return (rows[0]?.n ?? 0) > 0;
}
async function otherActiveIdentityOwner(tx: A12Tx, identityId: string, excludeUserId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "AgentUser" WHERE "identityId" = ${identityId} AND role = 'OWNER' AND status = 'ACTIVE' AND id <> ${excludeUserId}`;
  return (rows[0]?.n ?? 0) > 0;
}
async function memberRowsOfUser(tx: A12Tx, agentUserId: string): Promise<MemberRow[]> {
  return tx.$queryRaw<MemberRow[]>`SELECT id, "tenantId", "agentAccountId", "agentUserId", role, active FROM "AgentAccountMember" WHERE "agentUserId" = ${agentUserId} ORDER BY id`;
}
async function actorMemberIdOf(tx: A12Tx, agentAccountId: string, agentUserId: string): Promise<string | null> {
  const r = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "AgentAccountMember" WHERE "agentAccountId" = ${agentAccountId} AND "agentUserId" = ${agentUserId}`;
  return r[0]?.id ?? null;
}
/** ผู้ใช้เป้าหมายของตัวตนเดียวกัน (อ่านใต้ล็อกตัวตน) */
async function targetUserInTx(tx: A12Tx, identityId: string, targetUserId: string): Promise<{ id: string; role: AgentRole; status: string } | null> {
  const r = await tx.$queryRaw<{ id: string; role: string; status: string }[]>`SELECT id, role, status FROM "AgentUser" WHERE id = ${targetUserId} AND "identityId" = ${identityId}`;
  const u = r[0];
  return u && isRole(u.role) ? { id: u.id, role: u.role, status: u.status } : null;
}
/**
 * เจ้าของคนสุดท้าย (LAST_OWNER) เมื่อผู้ใช้ target จะไม่เป็น OWNER ที่ใช้งานได้อีก:
 *  ตัวตนต้องเหลือ AgentUser ACTIVE OWNER ≥ 1 · ทุกบัญชีที่ไม่ CLOSED/INVITED ที่ target เป็นสมาชิก active OWNER ต้องเหลือสมาชิก OWNER ที่ใช้งานได้ ≥ 1
 *  `losesMemberOwner(row)` = แถวสมาชิกนี้จะเสียความเป็น OWNER ไหม (ปิด/ลบผู้ใช้ = ทุกแถว)
 */
async function assertNotLastOwner(tx: A12Tx, identityId: string, target: { id: string; role: AgentRole; status: string }, losesIdentityOwner: boolean, members: MemberRow[], losesMemberOwner: (m: MemberRow) => boolean): Promise<AccRow[]> {
  if (losesIdentityOwner && target.role === "OWNER" && target.status === ACTIVE && !(await otherActiveIdentityOwner(tx, identityId, target.id))) abort("LAST_OWNER");
  const accs = await lockAccountsInTx(tx, members.map((m) => m.agentAccountId));
  const statusOf = new Map(accs.map((a) => [a.id, a.status]));
  for (const m of members) {
    if (!m.active || m.role !== "OWNER" || !losesMemberOwner(m)) continue;
    if (!OWNER_REQUIRED.has(statusOf.get(m.agentAccountId) ?? "")) continue;
    if (!(await otherActiveOwnerMember(tx, m.agentAccountId, target.id))) abort("LAST_OWNER");
  }
  return accs;
}

/** เปลี่ยนบทบาทของผู้ใช้ในตัวตน · OWNER ให้/ถอด OWNER ได้คนเดียว · ADMIN แก้ได้เฉพาะ SALES/ACCOUNTING · ลดบทบาทไหลลงแถวสมาชิก (min) */
export async function setAgentUserRole(actor: { agentUserId: string }, input: { targetUserId: string; role: AgentRole }): Promise<TeamResult<{ agentUserId: string; role: AgentRole; replayed: boolean }>> {
  const a = A12_ACTOR.safeParse(actor);
  const p = z.object({ targetUserId: A12_ID, role: A12_ROLE }).strict().safeParse(input);
  if (!a.success || !p.success) return agencyFail("VALIDATION");
  const newRole = p.data.role;
  return teamTx("setAgentUserRole", async (tx) => {
    const pre = await agentActorInTx(tx, a.data.agentUserId);
    if (!pre) return agencyFail("FORBIDDEN");
    await lockAgencyKeyInTx(tx, "agency.identity.v1", pre.identityId);
    const who = await agentActorInTx(tx, a.data.agentUserId);
    if (!who || !canManageAgentRole(who.role, newRole)) return agencyFail("FORBIDDEN");
    const target = await targetUserInTx(tx, who.identityId, p.data.targetUserId);
    if (!target || target.status !== ACTIVE) return agencyFail("NOT_FOUND");
    if (!canManageAgentRole(who.role, target.role)) return agencyFail("FORBIDDEN");
    if (target.role === newRole) return { ok: true as const, agentUserId: target.id, role: newRole, replayed: true };
    const members = await memberRowsOfUser(tx, target.id);
    const nextRole = (m: MemberRow): AgentRole => (isRole(m.role) ? cascadeMemberRole(m.role, newRole) : newRole);
    await assertNotLastOwner(tx, who.identityId, target, newRole !== "OWNER", members, (m) => nextRole(m) !== "OWNER");
    await tx.agentUser.update({ where: { id: target.id }, data: { role: newRole }, select: { id: true } });
    for (const m of members) {
      const to = nextRole(m);
      if (to === m.role) continue;
      await tx.agentAccountMember.update({ where: { id: m.id }, data: { role: to }, select: { id: true } });
      if (m.active) {
        await auditAgentInTx(tx, { tenantId: m.tenantId, actorMemberId: await actorMemberIdOf(tx, m.agentAccountId, who.id), action: "agency.member.set", targetType: "AgentAccountMember", targetId: m.id, after: { from: m.role, to } });
      }
    }
    return { ok: true as const, agentUserId: target.id, role: newRole, replayed: false };
  });
}

/** ปิดผู้ใช้ (DISABLED) + เพิกถอนทุก session · แถวสมาชิกคงไว้ (ประตูอ่านสถานะผู้ใช้) */
export async function disableAgentUser(actor: { agentUserId: string }, input: { targetUserId: string }, opts: { now?: Date } = {}): Promise<TeamResult<{ agentUserId: string; replayed: boolean }>> {
  const a = A12_ACTOR.safeParse(actor);
  const p = z.object({ targetUserId: A12_ID }).strict().safeParse(input);
  if (!a.success || !p.success) return agencyFail("VALIDATION");
  const now = opts.now ?? new Date();
  return teamTx("disableAgentUser", async (tx) => {
    const pre = await agentActorInTx(tx, a.data.agentUserId);
    if (!pre) return agencyFail("FORBIDDEN");
    await lockAgencyKeyInTx(tx, "agency.identity.v1", pre.identityId);
    const who = await agentActorInTx(tx, a.data.agentUserId);
    if (!who || (who.role !== "OWNER" && who.role !== "ADMIN")) return agencyFail("FORBIDDEN");
    const target = await targetUserInTx(tx, who.identityId, p.data.targetUserId);
    if (!target || target.status === "ERASED") return agencyFail("NOT_FOUND");
    if (!canManageAgentRole(who.role, target.role)) return agencyFail("FORBIDDEN");
    if (target.status === "DISABLED") return { ok: true as const, agentUserId: target.id, replayed: true };
    const members = await memberRowsOfUser(tx, target.id);
    await assertNotLastOwner(tx, who.identityId, target, true, members, () => true);
    await tx.agentUser.update({ where: { id: target.id }, data: { status: "DISABLED" }, select: { id: true } });
    await tx.agentSession.updateMany({ where: { agentUserId: target.id, revokedAt: null }, data: { revokedAt: now } });
    return { ok: true as const, agentUserId: target.id, replayed: false };
  });
}

/** ลบข้อมูลผู้ใช้ในตาราง global (tx เดียว) — ใช้ร่วมกันโดย eraseAgentUser และ closeAgentIdentity */
async function eraseUserInTx(tx: A12Tx, userId: string, actorId: string): Promise<void> {
  const logins = await tx.$queryRaw<{ subject: string }[]>`SELECT subject FROM "AgentLogin" WHERE "agentUserId" = ${userId} AND kind = 'EMAIL'`;
  const targets = logins.map((l) => agentAuthHash("login-target", l.subject));
  if (targets.length) await tx.agentLoginCode.deleteMany({ where: { target: { in: targets } } });
  await tx.agentLogin.deleteMany({ where: { agentUserId: userId } });
  await tx.agentSession.deleteMany({ where: { agentUserId: userId } });
  await tx.agentUser.update({ where: { id: userId }, data: { status: "ERASED", displayName: ERASED_USER_NAME, lastLoginAt: null }, select: { id: true } });
  const members = await memberRowsOfUser(tx, userId);
  for (const m of members) {
    if (!m.active) continue;
    await tx.agentAccountMember.update({ where: { id: m.id }, data: { active: false }, select: { id: true } });
    await auditAgentInTx(tx, { tenantId: m.tenantId, actorMemberId: await actorMemberIdOf(tx, m.agentAccountId, actorId), action: "agency.member.remove", targetType: "AgentAccountMember", targetId: m.id, after: { from: m.role, to: null, reason: "ERASED" } });
  }
}

/** ลบผู้ใช้ตาม PDPA (OWNER หรือตัวเอง) — ล็อกอิน · session · รหัสของทุกอีเมลล็อกอิน ถูกลบ · ผู้ใช้ ERASED + ชื่อแทน · สมาชิก inactive · ไม่แตะสมุด/บัญชีของร้าน */
export async function eraseAgentUser(actor: { agentUserId: string }, input: { targetUserId: string }): Promise<TeamResult<{ agentUserId: string; replayed: boolean }>> {
  const a = A12_ACTOR.safeParse(actor);
  const p = z.object({ targetUserId: A12_ID }).strict().safeParse(input);
  if (!a.success || !p.success) return agencyFail("VALIDATION");
  return teamTx("eraseAgentUser", async (tx) => {
    const pre = await agentActorInTx(tx, a.data.agentUserId);
    if (!pre) return agencyFail("FORBIDDEN");
    await lockAgencyKeyInTx(tx, "agency.identity.v1", pre.identityId);
    const who = await agentActorInTx(tx, a.data.agentUserId);
    if (!who) return agencyFail("FORBIDDEN");
    const target = await targetUserInTx(tx, who.identityId, p.data.targetUserId);
    if (!target) return agencyFail("NOT_FOUND");
    if (who.role !== "OWNER" && who.id !== target.id) return agencyFail("FORBIDDEN");
    if (target.status === "ERASED") return { ok: true as const, agentUserId: target.id, replayed: true };
    const members = await memberRowsOfUser(tx, target.id);
    await assertNotLastOwner(tx, who.identityId, target, true, members, () => true);
    await eraseUserInTx(tx, target.id, who.id);
    return { ok: true as const, agentUserId: target.id, replayed: false };
  });
}

/** ปิดตัวตน (OWNER · confirm) — ตัวตน CLOSED + ชื่อแทน + taxIdHash null · ทุกผู้ใช้ ERASED · ทุกบัญชีไม่ CLOSED ⇒ CLOSED IDENTITY_CLOSED + audit ทุกร้าน (ไม่มี event · มติ R3 Q4) · publicCode คงไว้ */
export async function closeAgentIdentity(actor: { agentUserId: string }, input: { confirm: true }): Promise<TeamResult<{ closedAccounts: number }>> {
  const a = A12_ACTOR.safeParse(actor);
  const p = z.object({ confirm: z.literal(true) }).strict().safeParse(input);
  if (!a.success || !p.success) return agencyFail("VALIDATION");
  return teamTx("closeAgentIdentity", async (tx) => {
    const pre = await agentActorInTx(tx, a.data.agentUserId);
    if (!pre) return agencyFail("FORBIDDEN");
    await lockAgencyKeyInTx(tx, "agency.identity.v1", pre.identityId);
    const who = await agentActorInTx(tx, a.data.agentUserId);
    if (!who || who.role !== "OWNER") return agencyFail("FORBIDDEN");
    const ids = (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "AgentAccount" WHERE "identityId" = ${who.identityId} AND status <> 'CLOSED'`).map((r) => r.id);
    const accs = await lockAccountsInTx(tx, ids);
    let closed = 0;
    for (const acc of accs) {
      if (acc.status === "CLOSED") continue;
      // r2 (มติ §10 ข้อ 1) ▸ แถวที่มีเหตุปิดถาวรค้างอยู่ (ใบสมัครซ้ำหลังร้านปิด/ปฏิเสธ) กลับไปเหตุเดิม — การปิดตัวตนไม่ล้างข้อเท็จจริงของร้าน
      //   suspendedAt ของแถว SUSPENDED คงไว้ (accounts.ts ใช้ตัดสิน "เคยถูกพักตอนปิดตัวตน" · ข้อ 14)
      const reason = closeReasonKeepingSticky(acc.statusReason, "IDENTITY_CLOSED");
      const n = await tx.agentAccount.updateMany({ where: { id: acc.id, tenantId: acc.tenantId, status: acc.status }, data: { status: "CLOSED", statusReason: reason, inviteTokenHash: null } });
      if (n.count !== 1) continue;
      closed++;
      await auditAgentInTx(tx, { tenantId: acc.tenantId, actorMemberId: await actorMemberIdOf(tx, acc.id, who.id), action: "agency.account.identity_closed", targetType: "AgentAccount", targetId: acc.id, after: { from: acc.status, to: "CLOSED", reason } });
    }
    const users = await tx.$queryRaw<{ id: string; status: string }[]>`SELECT id, status FROM "AgentUser" WHERE "identityId" = ${who.identityId} ORDER BY id`;
    for (const u of users) if (u.status !== "ERASED") await eraseUserInTx(tx, u.id, who.id);
    await tx.agentIdentity.update({ where: { id: who.identityId }, data: { status: "CLOSED", displayName: CLOSED_IDENTITY_NAME, taxIdHash: null }, select: { id: true } });
    return { ok: true as const, closedAccounts: closed };
  });
}

/**
 * เพิ่ม/แก้/ถอดสมาชิกของบัญชีร้าน (role null = ถอด) — OWNER/ADMIN · ADMIN ให้/แก้/ถอดได้เฉพาะ SALES/ACCOUNTING ·
 * บทบาทสมาชิกต้องไม่สูงกว่าบทบาทของผู้ใช้ในตัวตน · ถอด ⇒ ล้าง activeAgentAccountId ที่ชี้บัญชีนี้ · เจ้าของคนสุดท้าย ⇒ LAST_OWNER
 */
export async function setAgentAccountMember(actor: { agentUserId: string }, input: { agentAccountId: string; agentUserId: string; role: AgentRole | null }): Promise<TeamResult<{ agentAccountId: string; memberId: string | null; role: AgentRole | null; replayed: boolean }>> {
  const a = A12_ACTOR.safeParse(actor);
  const p = z.object({ agentAccountId: A12_ID, agentUserId: A12_ID, role: A12_ROLE.nullable() }).strict().safeParse(input);
  if (!a.success || !p.success) return agencyFail("VALIDATION");
  const role = p.data.role;
  return teamTx("setAgentAccountMember", async (tx) => {
    const pre = await agentActorInTx(tx, a.data.agentUserId);
    if (!pre) return agencyFail("FORBIDDEN");
    await lockAgencyKeyInTx(tx, "agency.identity.v1", pre.identityId);
    const who = await agentActorInTx(tx, a.data.agentUserId);
    if (!who || (who.role !== "OWNER" && who.role !== "ADMIN")) return agencyFail("FORBIDDEN");
    if (role !== null && !canManageAgentRole(who.role, role)) return agencyFail("FORBIDDEN");
    const [acc] = await lockAccountsInTx(tx, [p.data.agentAccountId]);
    if (!acc || acc.identityId !== who.identityId) return agencyFail("NOT_FOUND");
    if (!OWNER_REQUIRED.has(acc.status)) return agencyFail("BAD_STATE");
    const target = await targetUserInTx(tx, who.identityId, p.data.agentUserId);
    // r2 (มติ §10 ข้อ 12) ▸ ถอดสมาชิก (role null) ของผู้ใช้ที่ถูกปิด (DISABLED) ได้ — ให้/แก้บทบาทยังต้อง ACTIVE · ERASED = ไม่พบ (แถวสมาชิกถูกปิดไปแล้วตอนลบ)
    if (!target || target.status === "ERASED" || (target.status !== ACTIVE && role !== null)) return agencyFail("NOT_FOUND");
    if (role !== null && agentRoleRank(role) < agentRoleRank(target.role)) return agencyFail("VALIDATION", { reason: "ROLE_ABOVE_USER" });
    const cur = (await tx.$queryRaw<MemberRow[]>`SELECT id, "tenantId", "agentAccountId", "agentUserId", role, active FROM "AgentAccountMember" WHERE "agentAccountId" = ${acc.id} AND "agentUserId" = ${target.id}`)[0] ?? null;
    if (cur && cur.active && isRole(cur.role) && !canManageAgentRole(who.role, cur.role)) return agencyFail("FORBIDDEN");
    const curRole = cur && cur.active ? cur.role : null;
    if (curRole === role) return { ok: true as const, agentAccountId: acc.id, memberId: cur?.id ?? null, role, replayed: true };
    if (curRole === "OWNER" && role !== "OWNER" && !(await otherActiveOwnerMember(tx, acc.id, target.id))) return agencyFail("LAST_OWNER");
    const actorMemberId = await actorMemberIdOf(tx, acc.id, who.id);
    let memberId: string | null = cur?.id ?? null;
    if (role === null) {
      if (cur) await tx.agentAccountMember.update({ where: { id: cur.id }, data: { active: false }, select: { id: true } });
      await tx.agentSession.updateMany({ where: { agentUserId: target.id, activeAgentAccountId: acc.id }, data: { activeAgentAccountId: null } });
    } else if (cur) {
      await tx.agentAccountMember.update({ where: { id: cur.id }, data: { role, active: true }, select: { id: true } });
    } else {
      memberId = (await tx.agentAccountMember.create({ data: { tenantId: acc.tenantId, agentAccountId: acc.id, agentUserId: target.id, role, active: true, addedByAgentUserId: who.id }, select: { id: true } })).id;
    }
    if (memberId) {
      await auditAgentInTx(tx, { tenantId: acc.tenantId, actorMemberId, action: role === null ? "agency.member.remove" : "agency.member.set", targetType: "AgentAccountMember", targetId: memberId, after: { from: curRole, to: role } });
    }
    return { ok: true as const, agentAccountId: acc.id, memberId, role, replayed: false };
  });
}

/** รายชื่อทีมของตัวตนของผู้กระทำ (มุมมองเอเจนซี่เอง · ไม่รวม ERASED) */
export async function listAgentTeam(actor: { agentUserId: string }): Promise<TeamResult<{ items: { agentUserId: string; displayName: string; role: AgentRole; status: string; me: boolean }[] }>> {
  const a = A12_ACTOR.safeParse(actor);
  if (!a.success) return agencyFail("VALIDATION");
  return teamTx("listAgentTeam", async (tx) => {
    const who = await agentActorInTx(tx, a.data.agentUserId);
    if (!who) return agencyFail("FORBIDDEN");
    const rows = await tx.$queryRaw<{ id: string; displayName: string; role: string; status: string }[]>`
      SELECT id, "displayName", role, status FROM "AgentUser" WHERE "identityId" = ${who.identityId} AND status <> 'ERASED' ORDER BY "createdAt", id LIMIT 500`;
    return { ok: true as const, items: rows.filter((r) => isRole(r.role)).map((r) => ({ agentUserId: r.id, displayName: r.displayName, role: r.role as AgentRole, status: r.status, me: r.id === who.id })) };
  });
}
// ◂ TRIPS A1.2a
