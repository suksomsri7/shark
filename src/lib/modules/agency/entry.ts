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

/** หาผู้ใช้จากวิธีล็อกอิน (normalize ก่อน · อีเมลตัวใหญ่ = ตัวเดิม) · ไม่พบ/ผิดรูป ⇒ null */
export async function agentUserByLogin(login: AgentLoginInput): Promise<{ agentUserId: string; identityId: string; role: AgentRole; status: string } | null> {
  const n = normalizeAgentLogin(login);
  if (!n) return null;
  const l = await prisma.agentLogin.findUnique({ where: { kind_providerId_subject: { kind: n.kind, providerId: n.providerId, subject: n.subject } }, select: { agentUserId: true } });
  if (!l) return null;
  const u = await prisma.agentUser.findUnique({ where: { id: l.agentUserId }, select: { id: true, identityId: true, role: true, status: true } });
  if (!u || !isRole(u.role)) return null;
  return { agentUserId: u.id, identityId: u.identityId, role: u.role, status: u.status };
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
