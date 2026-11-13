// ─────────────────────────────────────────────────────────────
// agency/tokens.ts — กุญแจ · แฮช · token ของล็อกอินเอเจนซี่ · RUN TRIPS A1.2a (ใบสั่ง §4)
//
// 🔴 กุญแจ = SESSION_SECRET อ่าน "ตอนเรียก" ทุกครั้ง · ไม่มี/สั้นกว่า 32 ⇒ AgentKeyMissing (ผู้เรียกตอบ BUSY SERVER_KEY_MISSING)
//    ทุกสภาพแวดล้อม · ไม่มีกุญแจสำรอง · ไม่มีแฮชไร้กุญแจ (sha256 ตรง ๆ) ของ token/รหัส/อีเมลที่ใดเลย
// 🔴 ไม่ import prisma · ไม่บันทึกอะไร · ค่าลับ (รหัส/token/อีเมล) ไม่ขึ้นข้อความ error
// 🔴 เทียบค่าลับด้วย timingSafeEqual เสมอ (ความยาวต่าง ⇒ false ก่อนเทียบ)
// ─────────────────────────────────────────────────────────────
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { AGENT_ROLES, type AgentRole } from "./identity-core";
import { AGENT_LOGIN_CODE_RE, AGENT_SESSION_TOKEN_RE } from "./accounts-core";

const SECRET_ENV = "SESSION_SECRET";
const SECRET_MIN = 32;
const KEY_PREFIX = "shark:agent-auth:v1:";
/** ป้ายของ agentAuthHash (ตาราง §4) */
export type AgentHashLabel = "login-target" | "login-code" | "session" | "invite" | "ip" | "ua" | "rate" | "email-tag" | "tm-jti" | "idem" | "applicant-tag";
/** ป้ายของ token ที่ได้จาก HMAC โดยตรง (§4) */
type AgentTokenLabel = "invite-token" | "teammate-token";

/** โยนเมื่อไม่มีกุญแจเซิร์ฟเวอร์ — ข้อความคงที่ (ไม่มีค่าใด ๆ) */
export class AgentKeyMissing extends Error {
  constructor() {
    super("SERVER_KEY_MISSING");
    this.name = "AgentKeyMissing";
  }
}

function secret(): string {
  const s = process.env[SECRET_ENV];
  if (typeof s !== "string" || s.length < SECRET_MIN) throw new AgentKeyMissing();
  return s;
}
/** กุญแจพร้อมไหม (ไม่โยน) */
export function agentAuthKeyReady(): boolean {
  const s = process.env[SECRET_ENV];
  return typeof s === "string" && s.length >= SECRET_MIN;
}
/** K_label = HMAC-SHA256(SESSION_SECRET ดิบ, "shark:agent-auth:v1:" + label) */
const labelKey = (label: AgentHashLabel | AgentTokenLabel): Buffer => createHmac("sha256", secret()).update(`${KEY_PREFIX}${label}`).digest();

/** "v1:" + hex(HMAC-SHA256(K_label, data)) · ไม่มีกุญแจ ⇒ โยน AgentKeyMissing */
export function agentAuthHash(label: AgentHashLabel, data: string): string {
  return `v1:${createHmac("sha256", labelKey(label)).update(String(data)).digest("hex")}`;
}

/** เทียบสตริงแบบเวลาคงที่ (ความยาวต่าง ⇒ false) */
export function safeEqualStr(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a, "utf8"), y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

// ═══════════════ รหัสเข้าระบบ · session ═══════════════
/** รหัส 6 หลัก จาก CSPRNG (randomInt สม่ำเสมอ) */
export function newAgentLoginCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
export const isAgentLoginCodeShape = (s: unknown): s is string => typeof s === "string" && AGENT_LOGIN_CODE_RE.test(s);

/** token session = "ag_" + base64url(32 ไบต์สุ่ม) (256 บิต · 46 ตัว) */
export function newAgentSessionToken(): string {
  return `ag_${randomBytes(32).toString("base64url")}`;
}
export const isAgentSessionTokenShape = (s: unknown): s is string => typeof s === "string" && AGENT_SESSION_TOKEN_RE.test(s);

/** id ของแถวที่ต้องรู้ก่อน INSERT (codeId ใช้ในแฮชรหัส · agentAccountId ใช้ใน token เชิญ) — 96 บิตสุ่ม */
export function newAgentRowId(prefix: string): string {
  return `${prefix}${randomBytes(12).toString("hex")}`;
}

// ═══════════════ token เชิญของร้าน (§4 · เบี่ยงจาก CC J.3.2 "สุ่ม" ตามแบบ T0.6) ═══════════════
/** base64url(HMAC-SHA256(K_"invite-token", tenantId:agentAccountId:inviteExpiresAt ms)) — ออกซ้ำด้วยเวลาหมดเดิม = token เดิม · ออกใหม่ = token ใหม่ */
export function shopInviteToken(tenantId: string, agentAccountId: string, inviteExpiresAt: Date): string {
  return createHmac("sha256", labelKey("invite-token")).update(`${tenantId}:${agentAccountId}:${inviteExpiresAt.getTime()}`).digest("base64url");
}
export const SHOP_INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

// ═══════════════ token เพื่อนร่วมทีม (§4 · มติ R1 ข้อ 9) ═══════════════
// r2 (มติ §10 ข้อ 2) ▸ ใช้ครั้งเดียวตลอดกาล: `n` = jti · ตอนรับ ผู้เรียกบันทึกแถว "ใช้แล้ว" (teammateJtiRow → entry.consumeTeammateJtiInTx) ใต้ล็อกตัวตน
//   ลบ/ปิด/ลดสิทธิ์ผู้ถูกเชิญหรือผู้เชิญ ไม่ทำให้ token กลับมาใช้ได้ (แถว jti ไม่ผูกกับผู้ใช้/อีเมล)
/** แถว AgentLoginCode ที่แทน "jti นี้ใช้แล้ว": id กำหนดได้จาก jti (PK กันใช้ซ้ำ) · target/codeHash = แฮชมีกุญแจของ jti (ไม่ใช่รหัสเข้าระบบ) */
export function teammateJtiRow(jti: string): { id: string; target: string } {
  const h = agentAuthHash("tm-jti", jti);
  return { id: `tmj_${h.slice(3, 43)}`, target: h };
}
export type TeammatePayload = { v: 1; i: string; r: AgentRole; b: string; m: string; e: number; n: string };
const B64URL_RE = /^[A-Za-z0-9_-]+$/;
const TEAMMATE_MAX = 1024;
/** แท็กอีเมลในตัว token = ตัวที่ 3..27 ของ agentAuthHash("email-tag", อีเมล normalize) (96 บิต) */
export const teammateEmailTag = (emailNorm: string): string => agentAuthHash("email-tag", emailNorm).slice(3, 27);

/** P.S · P = base64url(JSON) · S = base64url(HMAC(K_"teammate-token", P)) */
export function signTeammateToken(p: { identityId: string; role: AgentRole; inviterAgentUserId: string; emailNorm: string; expiresAtSec: number }): string {
  const payload: TeammatePayload = { v: 1, i: p.identityId, r: p.role, b: p.inviterAgentUserId, m: teammateEmailTag(p.emailNorm), e: p.expiresAtSec, n: randomBytes(16).toString("base64url") };
  const P = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const S = createHmac("sha256", labelKey("teammate-token")).update(P).digest("base64url");
  return `${P}.${S}`;
}
/**
 * ตรวจลายเซ็น (เวลาคงที่) + รูป + อายุ (เทียบ now ของผู้เรียก) + แท็กอีเมล — ผ่าน ⇒ payload · ไม่ผ่านทุกแบบ ⇒ null
 * ⚠️ ไม่ตรวจผู้เชิญ/ตัวตน/บทบาทปัจจุบัน (ต้องอ่านฐาน — ผู้เรียกตรวจต่อใน tx)
 */
export function openTeammateToken(token: unknown, emailNorm: string, now: Date): TeammatePayload | null {
  if (typeof token !== "string" || token.length > TEAMMATE_MAX) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !B64URL_RE.test(parts[0]) || !B64URL_RE.test(parts[1])) return null;
  const [P, S] = parts;
  const expect = createHmac("sha256", labelKey("teammate-token")).update(P).digest("base64url");
  if (!safeEqualStr(S, expect)) return null;
  let o: unknown;
  try {
    o = JSON.parse(Buffer.from(P, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof o !== "object" || o === null || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  const keys = Object.keys(r).sort().join(",");
  if (keys !== "b,e,i,m,n,r,v" || r.v !== 1) return null;
  if (typeof r.i !== "string" || typeof r.b !== "string" || typeof r.m !== "string" || typeof r.n !== "string" || typeof r.e !== "number" || !Number.isInteger(r.e)) return null;
  if (typeof r.r !== "string" || !(AGENT_ROLES as readonly string[]).includes(r.r)) return null;
  if (r.i.length === 0 || r.i.length > 64 || r.b.length === 0 || r.b.length > 64) return null;
  if (r.n.length < 16 || r.n.length > 64 || !B64URL_RE.test(r.n)) return null;
  if (r.e * 1000 <= now.getTime()) return null;
  if (!safeEqualStr(r.m, teammateEmailTag(emailNorm))) return null;
  return { v: 1, i: r.i, r: r.r as AgentRole, b: r.b, m: r.m, e: r.e, n: r.n };
}
