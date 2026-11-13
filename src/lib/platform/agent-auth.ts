// ─────────────────────────────────────────────────────────────
// platform/agent-auth.ts — ล็อกอินเอเจนซี่ด้วยรหัสทางอีเมล · session · ประตูต่อร้าน · ตัวห่อฝั่งเอเจนซี่ · งานกวาด · RUN TRIPS A1.2a
//   ใบสั่ง ledger/trips-briefs/A1.2.md §5 (มติผู้คุม R1–R5) · ผลตรวจความปลอดภัยของแบบ R1–R12
//
// 🔴 ไฟล์ที่สอง (คู่ agency/entry.ts) ที่ fitness F17.1 ยอมให้แตะตาราง global ของตัวตนเอเจนซี่
// 🔴 ไม่ตั้งคุกกี้ · ไม่มี route (A1.2b) — ที่นี่มีแค่ชื่อ/ตัวเลือกคุกกี้ที่ A1.2b ต้องใช้ (§5.5)
// 🔴 ขอรหัส: ไม่อ่าน AgentUser/AgentLogin/AgentIdentity เลย · ผลรูปเดียวกัน · จดหมายเหมือนกันทุกไบต์ ⇒ ไม่มี oracle ว่ามีบัญชี
// 🔴 รหัส/token เก็บเป็น agentAuthHash เท่านั้น · เทียบเวลาคงที่ · ไม่ขึ้น log/event/audit/error · ไม่มีกุญแจ ⇒ BUSY SERVER_KEY_MISSING
// 🔴 ถังต่ออีเมล + ต่อรหัส fail closed (ผลไม่มี count = RATE_LIMITED) · clientKey ตรวจรูป · ไม่มี IP ⇒ ปฏิเสธ (ไม่มีถัง "unknown")
// 🔴 agentScope = ประตูเดียวของบริการพอร์ทัล: คืน { agentAccountId, memberId, tenantId, role } — ไม่มี agentUserId/identityId
// 🔴 meta.now / meta.deps = จุดต่อของข้อสอบ · ตัวห่อ A1.2b สร้าง meta เองจากเซิร์ฟเวอร์ · ความใช้ได้ของ session ในตัวห่อตัดสินด้วยนาฬิกาจริงเสมอ
// ─────────────────────────────────────────────────────────────
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { sendEmailRich } from "@/lib/core/email";
import { env, secureCookies } from "@/lib/env";
import {
  AGENT_AUTH_LIMITS as LIMITS,
  AGENT_CLIENT_KEY_RE,
  AGENT_ROLES,
  AgentKeyMissing,
  acceptShopInvite,
  agencyFail,
  agentActorNow,
  agentAuthHash,
  agentAuthKeyReady,
  agentLoginCodeMail,
  agentTeammateInviteMail,
  agentUserOfEmailLoginInTx,
  applyToShop,
  bucketOpts,
  cleanAgencyText,
  closeAgentIdentity,
  createAgentIdentityInTx,
  createTeammateUserInTx,
  disableAgentUser,
  eraseAgentUser,
  isAgentLoginCodeShape,
  isAgentSessionTokenShape,
  listAgentTeam,
  lockAgencyKeyInTx,
  maskEmail,
  newAgentLoginCode,
  newAgentRowId,
  newAgentSessionToken,
  normalizeAgentLogin,
  openTeammateToken,
  safeEqualStr,
  setAgentAccountMember,
  setAgentUserRole,
  signTeammateToken,
  teammateInviterValidInTx,
  withdrawApplication,
  type AccountWriteResult,
  type AgencyFail,
  type AgentApplication,
  type AgentAuthLimits,
  type AgentIdentityPublic,
  type AgentRole,
} from "@/lib/modules/agency/agent-side";

// ═══════════════ ค่าคงที่ · คุกกี้ (§5.0 · §5.5) ═══════════════
/** ตาราง §5.0 ตรงตัว (ชุดเดียว — นิยามที่ agency/accounts-core.ts เพื่อให้บริการฝั่งร้านใช้ค่าเดียวกัน) */
export const AGENT_AUTH_LIMITS: AgentAuthLimits = LIMITS;
/** secureCookies ? "__Host-shark_agent" : "shark_agent" — กติกาเดียวกับ __Host-shark_session (core/session.ts) */
export function agentCookieName(): string {
  return secureCookies ? "__Host-shark_agent" : "shark_agent";
}
/** Path=/ · HttpOnly · SameSite=Lax · Secure ตามสภาพแวดล้อม · ไม่มีโดเมน · ไม่มี maxAge (ผู้ตั้งคุกกี้ใช้ expires = session.expiresAt) */
export function agentCookieOptions(): { name: string; path: "/"; httpOnly: true; secure: boolean; sameSite: "lax" } {
  return { name: agentCookieName(), path: "/", httpOnly: true, secure: secureCookies, sameSite: "lax" };
}

// ═══════════════ ชนิด ═══════════════
export type AgentAuthDeps = {
  sendAgentMail?: (m: { to: string; kind: "LOGIN_CODE" | "SHOP_INVITE" | "TEAMMATE_INVITE"; code?: string; token?: string; url?: string }) => Promise<void>;
  rateLimit?: (key: string, opts: { limit: number; windowMs: number }, nowMs: number) => Promise<{ ok: boolean; retryAfterSec?: number; count?: number }>;
};
export type AgentAuthMeta = { clientKey: string; ip?: string; userAgent?: string; now?: Date; deps?: AgentAuthDeps };
export type AgentSessionView = { agentUserId: string; role: AgentRole; displayName: string; identity: AgentIdentityPublic; activeAgentAccountId: string | null };
export type AgentScope = { agentAccountId: string; memberId: string; tenantId: string; role: AgentRole };

const DAY_MS = 86_400_000;
const SLIDE_EVERY_MS = 5 * 60_000; // เลื่อน idle ≤ 1 ครั้ง/5 นาที (§5.3)
const TX_OPTS = { maxWait: 10_000, timeout: 30_000 } as const;
const IP_RE = /^[0-9A-Fa-f:.]{2,64}$/;
const SLUG_RE = /^[A-Za-z0-9_-]{1,80}$/;
const DEFAULT_TEAMMATE_NAME = "สมาชิกทีม";
const isRole = (r: unknown): r is AgentRole => typeof r === "string" && (AGENT_ROLES as readonly string[]).includes(r);
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const keyMissing = (): AgencyFail => agencyFail("BUSY", { reason: "SERVER_KEY_MISSING" });
const relogin = (): AgencyFail => agencyFail("FORBIDDEN", { reason: "SESSION" });

class Abort extends Error {
  constructor(readonly fail: AgencyFail) {
    super(fail.code);
  }
}
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
    for (const k of ["code", "originalCode"]) if (typeof o[k] === "string" && /^[0-9A-Z]{5}$/.test(o[k] as string)) return o[k] as string;
    for (const v of Object.values(o)) if (v && typeof v === "object") stack.push(v);
  }
  return null;
};
/** ops ของ error ที่ไม่คาด: ชื่อ · รหัส · stack frame — ไม่มีข้อความ (อาจมีอีเมล) ไม่มีอินพุต */
async function logUnexpected(where: string, e: unknown): Promise<void> {
  const err = e instanceof Error ? e : null;
  const o = err ? (err as unknown as Record<string, unknown>) : {};
  const frames = err?.stack ? err.stack.split("\n").filter((l) => /^\s+at\s/.test(l)).slice(0, 8).map((l) => l.trim().slice(0, 200)) : [];
  const detail = { where, name: err ? err.name || "Error" : typeof e, code: typeof o.code === "string" ? o.code.slice(0, 16) : null, frames };
  await logOps("ERROR", "agency.auth", `ข้อผิดพลาดที่ไม่คาดคิดใน ${where}`, { detail: JSON.stringify(detail) }).catch(() => undefined);
}
async function guard<T>(where: string, fn: () => Promise<T | AgencyFail>, onUnique?: () => AgencyFail): Promise<T | AgencyFail> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Abort) return e.fail;
    if (e instanceof AgentKeyMissing) return keyMissing();
    const code = pgCodeOf(e);
    if (code === "23505" && onUnique) return onUnique();
    if (code === "40P01" || code === "40001" || code === "55P03") return agencyFail("BUSY", { reason: "LOCK" });
    await logUnexpected(where, e);
    return agencyFail("BUSY", { reason: "UNEXPECTED" });
  }
}

// ═══════════════ meta · rate limit · จดหมาย ═══════════════
type Meta = { clientKey: string; ip: string; ua: string | null; now: Date; deps: AgentAuthDeps | undefined };
/** §5.4: clientKey ตรวจรูป (VALIDATION) · ไม่มี IP ⇒ RATE_LIMITED NO_CLIENT (ไม่มีถัง "unknown" ร่วม) */
function metaOf(meta: unknown): Meta | AgencyFail {
  if (!isRec(meta) || typeof meta.clientKey !== "string" || !AGENT_CLIENT_KEY_RE.test(meta.clientKey)) return agencyFail("VALIDATION", { reason: "CLIENT_KEY" });
  if (typeof meta.ip !== "string" || !IP_RE.test(meta.ip)) return agencyFail("RATE_LIMITED", { reason: "NO_CLIENT", retryAfterSec: 60 });
  const now = meta.now instanceof Date && !Number.isNaN(meta.now.getTime()) ? meta.now : new Date();
  const ua = typeof meta.userAgent === "string" && meta.userAgent.length > 0 ? meta.userAgent.slice(0, 512) : null;
  return { clientKey: meta.clientKey, ip: meta.ip, ua, now, deps: isRec(meta.deps) ? (meta.deps as AgentAuthDeps) : undefined };
}
const isFail = (v: unknown): v is AgencyFail => isRec(v) && v.ok === false;
const limiter = (deps: AgentAuthDeps | undefined) => deps?.rateLimit ?? ((key: string, o: { limit: number; windowMs: number }, nowMs: number) => checkRateLimitDb(key, o, nowMs));
/** คีย์ = prefix + agentAuthHash("rate", ค่าดิบ) (ไม่มีอีเมล/IP/clientKey ดิบในคีย์) · failClosed: ผลไม่มี count ⇒ RATE_LIMITED 60 */
async function hit(m: Meta, prefix: string, raw: string, b: { limit: number; windowMin: number }, failClosed = false): Promise<AgencyFail | null> {
  const v = await limiter(m.deps)(`${prefix}${agentAuthHash("rate", raw)}`, bucketOpts(b), m.now.getTime());
  if (failClosed && typeof v.count !== "number") return agencyFail("RATE_LIMITED", { retryAfterSec: 60 });
  if (!v.ok) return agencyFail("RATE_LIMITED", { retryAfterSec: Math.max(1, Math.ceil(v.retryAfterSec ?? 60)) });
  return null;
}
type AgentMail = { to: string; kind: "LOGIN_CODE" | "TEAMMATE_INVITE"; code?: string; token?: string; url?: string };
/**
 * ส่งจดหมาย: deps (ข้อสอบ) รอผล · ไม่งั้น sendEmailRich (ไม่บันทึกที่อยู่/หัวเรื่อง/เนื้อหา) นอกเส้นทางคำขอแบบ sendOtpMailOffPath ·
 * ล้ม ⇒ ops { kind, ref } เท่านั้น · ไม่เคยโยน · ไม่พิมพ์รหัสในสภาพแวดล้อมใด
 */
async function deliver(deps: AgentAuthDeps | undefined, m: AgentMail, body: { subject: string; text: string; html: string }, ref: string): Promise<void> {
  const fail = () => logOps("WARN", "agency.mail", "ส่งจดหมายเอเจนซี่ไม่สำเร็จ", { detail: JSON.stringify({ kind: m.kind, ref }) }).catch(() => undefined);
  if (deps?.sendAgentMail) {
    try {
      await deps.sendAgentMail(m);
    } catch {
      await fail();
    }
    return;
  }
  const send = async (): Promise<void> => {
    try {
      const r = await sendEmailRich({ to: [m.to], subject: body.subject, html: body.html, text: body.text });
      if (!r.ok) await fail();
    } catch {
      await fail();
    }
  };
  let scheduled = false;
  try {
    const { after } = await import("next/server");
    after(send);
    scheduled = true;
  } catch {
    // นอกขอบเขตคำขอ — ยิงทิ้งพร้อม catch
  }
  if (!scheduled) void send();
}
const emailOf = (raw: unknown): string | null => {
  if (typeof raw !== "string" || raw.length > 320) return null;
  return normalizeAgentLogin({ kind: "EMAIL", providerId: "email", subject: raw })?.subject ?? null;
};
const platformOrigin = (): string => new URL(env.APP_URL).origin;

/** แถวรหัสใหม่ (แยกจากตัวฟังก์ชันขอรหัส — ข้อสอบ A-4 ตรวจซอร์สของฟังก์ชันนั้น) */
async function insertLoginCode(emailNorm: string, codeId: string, code: string, now: Date, expiresAt: Date): Promise<void> {
  await prisma.agentLoginCode.create({
    data: { id: codeId, target: agentAuthHash("login-target", emailNorm), codeHash: agentAuthHash("login-code", `${codeId}:${code}`), expiresAt, createdAt: now },
  });
}

// ═══════════════ §5.2 ขอรหัส ═══════════════
/**
 * ขอรหัสเข้าระบบ — ไม่มี oracle ว่ามีบัญชี: ไม่อ่านตารางตัวตน · ไม่ปิดรหัสที่ค้างอยู่ · สร้างแถวใหม่ · ส่งจดหมายเดียวกันทุกครั้ง · ผลรูปเดียวกัน
 * ถัง: เครื่อง → IP → อีเมล 15 นาที (fail closed) → อีเมลรายวัน (fail closed)
 */
export async function requestAgentLoginCode(input: { email: string }, meta: AgentAuthMeta): Promise<{ ok: true; codeId: string; expiresAt: string; maskedTo: string } | AgencyFail> {
  const m = metaOf(meta);
  if (isFail(m)) return m;
  const email = emailOf(isRec(input) ? input.email : null);
  if (!email) return agencyFail("VALIDATION", { reason: "EMAIL" });
  if (!agentAuthKeyReady()) return keyMissing();
  return guard("requestAgentLoginCode", async () => {
    const rl =
      (await hit(m, "agent:code:c:", m.clientKey, LIMITS.codePerClient)) ??
      (await hit(m, "agent:code:ip:", m.ip, LIMITS.codePerIp)) ??
      (await hit(m, "agent:code:t:", email, LIMITS.codePerTarget, true)) ??
      (await hit(m, "agent:code:td:", email, LIMITS.codePerTargetDay, true));
    if (rl) return rl;
    const codeId = newAgentRowId("alc_");
    const code = newAgentLoginCode();
    const expiresAt = new Date(m.now.getTime() + LIMITS.codeTtlMin * 60_000);
    await insertLoginCode(email, codeId, code, m.now, expiresAt);
    await deliver(m.deps, { to: email, kind: "LOGIN_CODE", code }, agentLoginCodeMail(code), codeId);
    return { ok: true as const, codeId, expiresAt: expiresAt.toISOString(), maskedTo: maskEmail(email) };
  });
}

// ═══════════════ §5.3 ยืนยันรหัส ═══════════════
type VerifyInput = { email: string; codeId: string; code: string; signup?: { agencyName: string; ownerName: string }; teammateInvite?: string; teammateName?: string };
const VERIFY_KEYS = new Set(["email", "codeId", "code", "signup", "teammateInvite", "teammateName"]);
type Created = "NONE" | "IDENTITY" | "TEAMMATE";
/** session ใหม่ใน tx: ปิดใบเก่าสุดจนเหลือ max−1 ก่อน · tokenHash · อายุสัมบูรณ์ + ไม่ใช้งาน · ipHash/uaHash */
async function openSessionInTx(tx: Prisma.TransactionClient, agentUserId: string, m: Meta): Promise<{ token: string; expiresAt: Date }> {
  const live = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "AgentSession" WHERE "agentUserId" = ${agentUserId} AND "revokedAt" IS NULL AND "expiresAt" > ${m.now}
    ORDER BY "createdAt" ASC, id ASC FOR UPDATE`;
  const over = live.length - (LIMITS.maxSessionsPerUser - 1);
  if (over > 0) {
    const ids = live.slice(0, over).map((r) => r.id);
    await tx.agentSession.updateMany({ where: { id: { in: ids }, revokedAt: null }, data: { revokedAt: m.now } });
  }
  const token = newAgentSessionToken();
  const expiresAt = new Date(m.now.getTime() + LIMITS.sessionTtlDays * DAY_MS);
  const idle = new Date(Math.min(m.now.getTime() + LIMITS.sessionIdleHours * 3_600_000, expiresAt.getTime()));
  await tx.agentSession.create({
    data: {
      id: newAgentRowId("ags_"),
      agentUserId,
      tokenHash: agentAuthHash("session", token),
      expiresAt,
      idleExpiresAt: idle,
      ipHash: agentAuthHash("ip", m.ip),
      uaHash: m.ua ? agentAuthHash("ua", m.ua) : null,
      createdAt: m.now,
      updatedAt: m.now,
    },
  });
  return { token, expiresAt };
}

/**
 * ยืนยันรหัส → session ใหม่ (ไม่คืน agentUserId) — ถัง: เครื่อง → ต่อรหัส (fail closed) · นับครั้งด้วยคำสั่งเดียว (attempts < max · ยังไม่ใช้ · ยังไม่หมด · target ตรง) ·
 * ถูก ⇒ tx เดียว: ใช้รหัส (ต้อง 1 แถว) + ปิดรหัสอื่นของอีเมลนี้ + หาเจ้าของ (เพื่อน → มีอยู่ → สมัครใหม่) + session · ล้มทุกแบบของรหัส = INVALID_CODE ข้อความเดียว
 */
export async function verifyAgentLoginCode(input: VerifyInput, meta: AgentAuthMeta): Promise<{ ok: true; token: string; expiresAt: string; created: Created } | AgencyFail> {
  const m = metaOf(meta);
  if (isFail(m)) return m;
  if (!isRec(input) || Object.keys(input).some((k) => !VERIFY_KEYS.has(k))) return agencyFail("VALIDATION");
  const email = emailOf(input.email);
  if (!email || typeof input.codeId !== "string" || input.codeId.length < 1 || input.codeId.length > 64) return agencyFail("VALIDATION");
  let signup: { agencyName: string; ownerName: string } | null = null;
  if (input.signup !== undefined) {
    const s = isRec(input.signup) && Object.keys(input.signup).every((k) => k === "agencyName" || k === "ownerName") ? input.signup : null;
    const agencyName = s ? cleanAgencyText(s.agencyName, 120) : null;
    const ownerName = s ? cleanAgencyText(s.ownerName, 120) : null;
    if (!agencyName || !ownerName) return agencyFail("VALIDATION");
    signup = { agencyName, ownerName };
  }
  const teammateName = input.teammateName === undefined ? null : cleanAgencyText(input.teammateName, 120);
  if (input.teammateName !== undefined && !teammateName) return agencyFail("VALIDATION");
  if (input.teammateInvite !== undefined && (typeof input.teammateInvite !== "string" || input.teammateInvite.length > 1024)) return agencyFail("VALIDATION");
  const codeId = input.codeId;
  const code = input.code;
  if (!agentAuthKeyReady()) return keyMissing();
  const invalid = () => agencyFail("INVALID_CODE");
  return guard(
    "verifyAgentLoginCode",
    async () => {
      const rl = await hit(m, "agent:verify:c:", m.clientKey, LIMITS.verifyPerClient);
      if (rl) return rl;
      // ถังต่อรหัส: ตัวจำกัดล้ม (ไม่มี count) ⇒ RATE_LIMITED (fail closed) · เกินเพดาน ⇒ รหัสใบนี้ใช้ไม่ได้แล้ว = INVALID_CODE (ล้มทุกแบบของรหัส = ข้อความเดียว §5.3)
      const perCode = await limiter(m.deps)(`agent:verify:k:${agentAuthHash("rate", codeId)}`, bucketOpts(LIMITS.verifyPerCode), m.now.getTime());
      if (typeof perCode.count !== "number") return agencyFail("RATE_LIMITED", { retryAfterSec: 60 });
      if (!perCode.ok) return invalid();
      if (!isAgentLoginCodeShape(code)) return invalid();
      const target = agentAuthHash("login-target", email);
      // 🔴 คำสั่งเดียว: นับครั้ง + ตรวจเงื่อนไข (กันเดาพร้อมกัน — ไม่มีช่วงอ่าน-แล้ว-เขียน)
      const rows = await prisma.$queryRaw<{ codeHash: string }[]>`
        UPDATE "AgentLoginCode" SET attempts = attempts + 1
        WHERE id = ${codeId} AND target = ${target} AND "usedAt" IS NULL AND attempts < ${LIMITS.codeMaxAttempts} AND "expiresAt" > ${m.now}
        RETURNING "codeHash"`;
      const stored = rows[0]?.codeHash;
      if (!stored || !safeEqualStr(stored, agentAuthHash("login-code", `${codeId}:${code}`))) return invalid();
      return prisma.$transaction(async (tx) => {
        const used = await tx.$executeRaw`UPDATE "AgentLoginCode" SET "usedAt" = ${m.now} WHERE id = ${codeId} AND "usedAt" IS NULL`;
        if (used !== 1) throw new Abort(invalid());
        await tx.$executeRaw`UPDATE "AgentLoginCode" SET "usedAt" = ${m.now} WHERE target = ${target} AND "usedAt" IS NULL AND id <> ${codeId}`;
        let agentUserId: string;
        let created: Created;
        if (input.teammateInvite !== undefined) {
          const t = openTeammateToken(input.teammateInvite, email, m.now);
          if (!t) throw new Abort(agencyFail("INVITE_INVALID"));
          await lockAgencyKeyInTx(tx, "agency.identity.v1", t.i);
          if (!(await teammateInviterValidInTx(tx, { inviterId: t.b, identityId: t.i, role: t.r }))) throw new Abort(agencyFail("INVITE_INVALID"));
          if ((await agentUserOfEmailLoginInTx(tx, email)).loginExists) throw new Abort(agencyFail("LOGIN_UNAVAILABLE"));
          agentUserId = await createTeammateUserInTx(tx, { identityId: t.i, role: t.r, displayName: teammateName ?? DEFAULT_TEAMMATE_NAME, emailNorm: email, now: m.now });
          created = "TEAMMATE";
        } else {
          const who = await agentUserOfEmailLoginInTx(tx, email);
          if (who.user) {
            agentUserId = who.user.id;
            created = "NONE";
          } else if (!who.loginExists && signup) {
            agentUserId = (await createAgentIdentityInTx(tx, { displayName: signup.agencyName, ownerName: signup.ownerName, emailNorm: email, now: m.now })).agentUserId;
            created = "IDENTITY";
          } else throw new Abort(agencyFail("LOGIN_UNAVAILABLE"));
        }
        const s = await openSessionInTx(tx, agentUserId, m);
        await tx.agentUser.update({ where: { id: agentUserId }, data: { lastLoginAt: m.now }, select: { id: true } });
        await tx.agentLogin.updateMany({ where: { agentUserId, kind: "EMAIL", providerId: "email", subject: email }, data: { lastUsedAt: m.now } });
        return { ok: true as const, token: s.token, expiresAt: s.expiresAt.toISOString(), created };
      }, TX_OPTS);
    },
    () => agencyFail("LOGIN_UNAVAILABLE"),
  );
}

// ═══════════════ session ═══════════════
type SessionRow = {
  id: string;
  agentUserId: string;
  activeAgentAccountId: string | null;
  expiresAt: Date;
  updatedAt: Date;
  role: string;
  displayName: string;
  identityId: string;
  identityName: string;
  publicCode: string;
  identityStatus: string;
};
/** session ที่ใช้ได้ ณ now (ไม่ revoke · ไม่หมดสัมบูรณ์/ไม่ใช้งาน · ผู้ใช้ ACTIVE + ตัวตน ACTIVE) · เลื่อน idle ≤ 1 ครั้ง/5 นาที */
async function liveSession(token: unknown, now: Date): Promise<SessionRow | null> {
  if (!isAgentSessionTokenShape(token) || !agentAuthKeyReady()) return null;
  const rows = await prisma.$queryRaw<SessionRow[]>`
    SELECT s.id, s."agentUserId", s."activeAgentAccountId", s."expiresAt", s."updatedAt", u.role, u."displayName",
           i.id AS "identityId", i."displayName" AS "identityName", i."publicCode", i.status AS "identityStatus"
    FROM "AgentSession" s JOIN "AgentUser" u ON u.id = s."agentUserId" JOIN "AgentIdentity" i ON i.id = u."identityId"
    WHERE s."tokenHash" = ${agentAuthHash("session", token)} AND s."revokedAt" IS NULL AND s."expiresAt" > ${now} AND s."idleExpiresAt" > ${now}
      AND u.status = 'ACTIVE' AND i.status = 'ACTIVE'`;
  const r = rows[0];
  if (!r || !isRole(r.role)) return null;
  if (now.getTime() - r.updatedAt.getTime() >= SLIDE_EVERY_MS) {
    const idle = new Date(Math.min(now.getTime() + LIMITS.sessionIdleHours * 3_600_000, r.expiresAt.getTime()));
    await prisma.$executeRaw`UPDATE "AgentSession" SET "idleExpiresAt" = ${idle}, "updatedAt" = ${now} WHERE id = ${r.id} AND "revokedAt" IS NULL AND "updatedAt" = ${r.updatedAt}`;
  }
  return r;
}
const viewOf = (r: SessionRow): AgentSessionView => ({
  agentUserId: r.agentUserId,
  role: r.role as AgentRole,
  displayName: r.displayName,
  identity: { id: r.identityId, displayName: r.identityName, publicCode: r.publicCode, status: r.identityStatus },
  activeAgentAccountId: r.activeAgentAccountId,
});
const nowOf = (meta: unknown): Date => (isRec(meta) && meta.now instanceof Date && !Number.isNaN(meta.now.getTime()) ? meta.now : new Date());

/** มุมมองของเอเจนซี่เอง (ห้ามส่งเข้าโค้ดฝั่งร้าน) · token ผิดรูป ⇒ null ก่อนแฮช · ไม่ผ่านทุกแบบ ⇒ null */
export async function resolveAgentSession(token: string, meta?: { now?: Date }): Promise<AgentSessionView | null> {
  try {
    const r = await liveSession(token, nowOf(meta));
    return r ? viewOf(r) : null;
  } catch (e) {
    await logUnexpected("resolveAgentSession", e);
    return null;
  }
}
/** ออกจากระบบเครื่องนี้ (เพิกถอน session ของ token) */
export async function logoutAgentSession(token: string): Promise<{ ok: true }> {
  try {
    if (isAgentSessionTokenShape(token) && agentAuthKeyReady()) {
      await prisma.agentSession.updateMany({ where: { tokenHash: agentAuthHash("session", token), revokedAt: null }, data: { revokedAt: new Date() } });
    }
  } catch (e) {
    await logUnexpected("logoutAgentSession", e);
  }
  return { ok: true };
}
/** "ออกจากระบบทุกเครื่อง" ของผู้ใช้เอง */
export async function logoutAllAgentSessions(token: string, meta?: { now?: Date }): Promise<{ ok: true; revoked: number } | AgencyFail> {
  return guard("logoutAllAgentSessions", async () => {
    const s = await liveSession(token, new Date());
    if (!s) return relogin();
    const n = await prisma.agentSession.updateMany({ where: { agentUserId: s.agentUserId, revokedAt: null }, data: { revokedAt: nowOf(meta) } });
    return { ok: true as const, revoked: n.count };
  });
}

// ═══════════════ ประตูต่อร้าน ═══════════════
type Shop = { tenantId: string; slug: string; name: string };
/** ร้านจาก slug ของ URL: Tenant ACTIVE ที่มีหน่วย TRIPS/TICKET ACTIVE — อื่น ⇒ null (ผลเดียวกับร้านที่ไม่มีจริง) */
async function shopBySlug(slug: unknown): Promise<Shop | null> {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) return null;
  const rows = await prisma.$queryRaw<{ id: string; slug: string; name: string }[]>`
    SELECT t.id, t.slug, t.name FROM "Tenant" t
    WHERE t.slug = ${slug} AND t.status = 'ACTIVE'
      AND EXISTS (SELECT 1 FROM "BusinessUnit" b WHERE b."tenantId" = t.id AND b.type IN ('TRIPS', 'TICKET') AND b.status = 'ACTIVE')`;
  const r = rows[0];
  return r ? { tenantId: r.id, slug: r.slug, name: r.name } : null;
}
type AccMember = { agentAccountId: string; status: string; memberId: string | null; memberRole: string | null; memberActive: boolean | null };
async function accountAtShop(s: SessionRow, tenantId: string): Promise<AccMember | null> {
  const rows = await prisma.$queryRaw<AccMember[]>`
    SELECT a.id AS "agentAccountId", a.status, m.id AS "memberId", m.role AS "memberRole", m.active AS "memberActive"
    FROM "AgentAccount" a LEFT JOIN "AgentAccountMember" m ON m."agentAccountId" = a.id AND m."agentUserId" = ${s.agentUserId} AND m."tenantId" = a."tenantId"
    WHERE a."tenantId" = ${tenantId} AND a."identityId" = ${s.identityId}`;
  return rows[0] ?? null;
}
const shopFromInput = (input: unknown): unknown => (isRec(input) ? input.shopSlug : null);

/**
 * ประตูเดียวของบริการพอร์ทัล (A2.x): ร้านจาก shopSlug ของ URL · บัญชีของร้านนั้นที่เป็นของตัวตนของผู้ใช้ · ACTIVE · สมาชิก active ·
 * อ่านใหม่ทุกครั้ง · ไม่ใช้ activeAgentAccountId · ไม่ผ่านทุกกรณี = null เดียวกัน · ผลไม่มี agentUserId/identityId
 */
export async function agentScope(token: string, input: { shopSlug: string }, meta?: { now?: Date }): Promise<AgentScope | null> {
  try {
    const s = await liveSession(token, nowOf(meta));
    if (!s) return null;
    const shop = await shopBySlug(shopFromInput(input));
    if (!shop) return null;
    const a = await accountAtShop(s, shop.tenantId);
    if (!a || a.status !== "ACTIVE" || !a.memberId || a.memberActive !== true || !isRole(a.memberRole)) return null;
    return { agentAccountId: a.agentAccountId, memberId: a.memberId, tenantId: shop.tenantId, role: a.memberRole };
  } catch (e) {
    await logUnexpected("agentScope", e);
    return null;
  }
}

/** ตั้ง activeAgentAccountId (คำใบ้ UI เท่านั้น) — ACTIVE/PENDING ที่เป็นสมาชิก active · INVITED ของตัวตน (OWNER/ADMIN) · อื่น ⇒ NOT_FOUND ข้อความเดียวกับร้านที่ไม่มีจริง */
export async function selectAgentAccount(token: string, input: { shopSlug: string }, meta?: { now?: Date }): Promise<{ ok: true; agentAccountId: string; status: string; role: AgentRole } | AgencyFail> {
  return guard("selectAgentAccount", async () => {
    const s = await liveSession(token, nowOf(meta));
    if (!s) return relogin();
    const shop = await shopBySlug(shopFromInput(input));
    if (!shop) return agencyFail("NOT_FOUND");
    const a = await accountAtShop(s, shop.tenantId);
    if (!a) return agencyFail("NOT_FOUND");
    let role: AgentRole | null = null;
    if ((a.status === "ACTIVE" || a.status === "PENDING") && a.memberActive === true && isRole(a.memberRole)) role = a.memberRole;
    else if (a.status === "INVITED" && (s.role === "OWNER" || s.role === "ADMIN")) role = s.role as AgentRole;
    if (!role) return agencyFail("NOT_FOUND");
    await prisma.agentSession.updateMany({ where: { id: s.id, revokedAt: null }, data: { activeAgentAccountId: a.agentAccountId } });
    return { ok: true as const, agentAccountId: a.agentAccountId, status: a.status, role };
  });
}

/** บัญชีของผู้ใช้ข้ามร้าน (มุมมองเอเจนซี่เอง): สมาชิก active + แถว INVITED ของตัวตน (OWNER/ADMIN) · ไม่มีคีย์ภายใน */
export async function myAgentAccounts(token: string, meta?: { now?: Date }): Promise<{ ok: true; items: { agentAccountId: string; shopSlug: string; shopName: string; status: string; role: AgentRole }[] } | AgencyFail> {
  return guard("myAgentAccounts", async () => {
    const s = await liveSession(token, nowOf(meta));
    if (!s) return relogin();
    const invitedToo = s.role === "OWNER" || s.role === "ADMIN";
    const rows = await prisma.$queryRaw<{ id: string; status: string; role: string; slug: string; name: string }[]>`
      SELECT a.id, a.status, m.role, t.slug, t.name FROM "AgentAccountMember" m
        JOIN "AgentAccount" a ON a.id = m."agentAccountId" AND a."tenantId" = m."tenantId" AND a."identityId" = ${s.identityId}
        JOIN "Tenant" t ON t.id = a."tenantId"
      WHERE m."agentUserId" = ${s.agentUserId} AND m.active
      UNION
      SELECT a.id, a.status, ${s.role}::text AS role, t.slug, t.name FROM "AgentAccount" a JOIN "Tenant" t ON t.id = a."tenantId"
      WHERE ${invitedToo} AND a."identityId" = ${s.identityId} AND a.status = 'INVITED'
      ORDER BY slug, id LIMIT 500`;
    return { ok: true as const, items: rows.filter((r) => isRole(r.role)).map((r) => ({ agentAccountId: r.id, shopSlug: r.slug, shopName: r.name, status: r.status, role: r.role as AgentRole })) };
  });
}

// ═══════════════ ตัวห่อฝั่งเอเจนซี่ (§6) ═══════════════
/** สมัครกับร้าน — ถังต่อเครื่องก่อน · ร้านจาก slug (ไม่มี/ไม่ขายทริป = NOT_FOUND เดียวกัน) */
export async function agentApply(token: string, input: { shopSlug: string; application: AgentApplication }, meta: AgentAuthMeta): Promise<AccountWriteResult> {
  const m = metaOf(meta);
  if (isFail(m)) return m;
  if (!agentAuthKeyReady()) return keyMissing();
  return guard("agentApply", async () => {
    const s = await liveSession(token, new Date());
    if (!s) return relogin();
    const rl = await hit(m, "agent:apply:c:", m.clientKey, LIMITS.applyPerClient);
    if (rl) return rl;
    const shop = await shopBySlug(shopFromInput(input));
    if (!shop) return agencyFail("NOT_FOUND");
    return applyToShop({ agentUserId: s.agentUserId }, { tenantId: shop.tenantId, application: isRec(input) ? (input.application as AgentApplication) : (null as unknown as AgentApplication) }, { now: m.now, deps: m.deps });
  });
}
/** รับคำเชิญของร้าน — ถังต่อเครื่อง (inviteAcceptPerClient) · token ของร้านอื่น = INVITE_INVALID */
export async function agentAcceptInvite(token: string, input: { shopSlug: string; inviteToken?: string }, meta: AgentAuthMeta): Promise<AccountWriteResult> {
  const m = metaOf(meta);
  if (isFail(m)) return m;
  if (!agentAuthKeyReady()) return keyMissing();
  return guard("agentAcceptInvite", async () => {
    const s = await liveSession(token, new Date());
    if (!s) return relogin();
    const rl = await hit(m, "agent:invite:c:", m.clientKey, LIMITS.inviteAcceptPerClient);
    if (rl) return rl;
    const shop = await shopBySlug(shopFromInput(input));
    if (!shop) return agencyFail("NOT_FOUND");
    const inviteToken = isRec(input) && input.inviteToken !== undefined ? input.inviteToken : undefined;
    return acceptShopInvite({ agentUserId: s.agentUserId }, { tenantId: shop.tenantId, ...(inviteToken !== undefined ? { inviteToken: inviteToken as string } : {}) }, { now: m.now, deps: m.deps });
  });
}
/** ถอนใบสมัคร */
export async function agentWithdraw(token: string, input: { shopSlug: string }, meta: AgentAuthMeta): Promise<AccountWriteResult> {
  const m = metaOf(meta);
  if (isFail(m)) return m;
  return guard("agentWithdraw", async () => {
    const s = await liveSession(token, new Date());
    if (!s) return relogin();
    const shop = await shopBySlug(shopFromInput(input));
    if (!shop) return agencyFail("NOT_FOUND");
    return withdrawApplication({ agentUserId: s.agentUserId }, { tenantId: shop.tenantId }, { now: m.now, deps: m.deps });
  });
}

// ═══════════════ เพื่อนร่วมทีม · ทีม (§9) ═══════════════
/** เชิญเพื่อน (OWNER/ADMIN · ADMIN เชิญ OWNER ไม่ได้) — token มีผู้เชิญในตัว · อายุ teammateInviteTtlMin · ไม่สร้างแถว · ไม่อ่าน AgentLogin */
export async function createTeammateInvite(token: string, input: { email: string; role: AgentRole }, meta: AgentAuthMeta): Promise<{ ok: true; teammateToken: string; expiresAt: string } | AgencyFail> {
  const m = metaOf(meta);
  if (isFail(m)) return m;
  if (!agentAuthKeyReady()) return keyMissing();
  return guard("createTeammateInvite", async () => {
    const s = await liveSession(token, new Date());
    if (!s) return relogin();
    const who = await agentActorNow(s.agentUserId);
    if (!who || (who.role !== "OWNER" && who.role !== "ADMIN")) return agencyFail("FORBIDDEN");
    const role = isRec(input) ? input.role : null;
    if (!isRole(role) || !isRec(input) || Object.keys(input).some((k) => k !== "email" && k !== "role")) return agencyFail("VALIDATION");
    if (role === "OWNER" && who.role !== "OWNER") return agencyFail("FORBIDDEN");
    const email = emailOf(input.email);
    if (!email) return agencyFail("VALIDATION");
    const expiresAt = new Date(m.now.getTime() + LIMITS.teammateInviteTtlMin * 60_000);
    const teammateToken = signTeammateToken({ identityId: who.identityId, role, inviterAgentUserId: who.id, emailNorm: email, expiresAtSec: Math.floor(expiresAt.getTime() / 1000) });
    const url = `${platformOrigin()}/agent/join#${teammateToken}`;
    await deliver(m.deps, { to: email, kind: "TEAMMATE_INVITE", token: teammateToken, url }, agentTeammateInviteMail(url), "teammate");
    return { ok: true as const, teammateToken, expiresAt: expiresAt.toISOString() };
  });
}
async function asActor<T>(where: string, token: string, fn: (actor: { agentUserId: string }) => Promise<T | AgencyFail>): Promise<T | AgencyFail> {
  return guard(where, async () => {
    const s = await liveSession(token, new Date());
    if (!s) return relogin();
    return fn({ agentUserId: s.agentUserId });
  });
}
export const agentTeam = (token: string, _meta?: { now?: Date }) => asActor("agentTeam", token, (a) => listAgentTeam(a));
export const setTeammateRole = (token: string, input: { targetUserId: string; role: AgentRole }, _meta?: { now?: Date }) => asActor("setTeammateRole", token, (a) => setAgentUserRole(a, input));
export const disableTeammate = (token: string, input: { targetUserId: string }) => asActor("disableTeammate", token, (a) => disableAgentUser(a, input));
export const eraseTeammate = (token: string, input: { targetUserId: string }) => asActor("eraseTeammate", token, (a) => eraseAgentUser(a, input));
export const closeMyIdentity = (token: string, input: { confirm: true }) => asActor("closeMyIdentity", token, (a) => closeAgentIdentity(a, input));
export const setAccountMember = (token: string, input: { agentAccountId: string; targetUserId: string; role: AgentRole | null }) =>
  asActor("setAccountMember", token, (a) => (isRec(input) ? setAgentAccountMember(a, { agentAccountId: input.agentAccountId, agentUserId: input.targetUserId, role: input.role }) : Promise.resolve(agencyFail("VALIDATION"))));

// ═══════════════ §5.7 งานกวาด (ตาราง global เท่านั้น) ═══════════════
/** ลบ AgentLoginCode ที่หมดอายุเกิน 1 วัน · AgentSession ที่หมดอายุ หรือถูกเพิกถอนเกิน 30 วัน · ต่อชนิด ≤ batch · idempotent · เคารพ signal */
export async function sweepAgentAuth(opts: { now?: Date; batch?: number; signal?: AbortSignal } = {}): Promise<{ codes: number; sessions: number }> {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const batch = Number.isInteger(opts.batch) && (opts.batch as number) > 0 ? Math.min(opts.batch as number, LIMITS.sweepBatch) : LIMITS.sweepBatch;
  const codeCut = new Date(now.getTime() - DAY_MS);
  const revokedCut = new Date(now.getTime() - 30 * DAY_MS);
  const codes = await prisma.$executeRaw`
    DELETE FROM "AgentLoginCode" WHERE id IN (SELECT id FROM "AgentLoginCode" WHERE "expiresAt" < ${codeCut} ORDER BY "expiresAt" LIMIT ${batch})`;
  if (opts.signal?.aborted) return { codes, sessions: 0 };
  const sessions = await prisma.$executeRaw`
    DELETE FROM "AgentSession" WHERE id IN (SELECT id FROM "AgentSession" WHERE "expiresAt" < ${now} OR "revokedAt" < ${revokedCut} ORDER BY "expiresAt" LIMIT ${batch})`;
  return { codes, sessions };
}
