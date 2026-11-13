// ─────────────────────────────────────────────────────────────
// agency/identity-core.ts — ฟังก์ชันบริสุทธิ์ของตัวตนเอเจนซี่ระดับแพลตฟอร์ม · RUN TRIPS A1.1 (ใบสั่ง §5.1 · CC TC3 · §J.3.1)
// 🔴 บริสุทธิ์: ไม่มี import ค่าใด ๆ (ข้อสอบ S-4) · ไม่แตะฐาน · ไม่อ่าน env
// ─────────────────────────────────────────────────────────────

export const AGENT_ROLES = ["OWNER", "ADMIN", "SALES", "ACCOUNTING"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];
export const AGENT_LOGIN_KINDS = ["EMAIL", "LINE"] as const;
export type AgentLoginKind = (typeof AGENT_LOGIN_KINDS)[number];

/** ตัวอักษรของรหัสสาธารณะ — 30 ตัว (ตัด 0 1 I L O U ที่อ่านสับสน) · ตรงกับ CHECK AgentIdentity_publicCode_format_check */
export const AGENT_PUBLIC_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const AGENT_PUBLIC_CODE_RE: RegExp = /^AG-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/;
const CODE_LEN = 6;

/** รหัสสาธารณะ "AG-XXXXXX" จาก 6 ไบต์แรก (ไบต์ % 30) · น้อยกว่า 6 ไบต์ ⇒ โยน */
export function makeAgentPublicCode(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array) || bytes.length < CODE_LEN) throw new Error("makeAgentPublicCode: ต้องมีอย่างน้อย 6 ไบต์");
  let out = "AG-";
  for (let i = 0; i < CODE_LEN; i++) out += AGENT_PUBLIC_CODE_ALPHABET[bytes[i] % AGENT_PUBLIC_CODE_ALPHABET.length];
  return out;
}

export function isAgentPublicCode(s: unknown): boolean {
  return typeof s === "string" && AGENT_PUBLIC_CODE_RE.test(s);
}

const EMAIL_MAX = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const LINE_PROVIDER_RE = /^[0-9]{6,20}$/;
const LINE_SUBJECT_RE = /^U[0-9a-f]{32}$/;

/**
 * วิธีล็อกอินรูปมาตรฐาน (ตรงกับ CHECK AgentLogin_email_norm_check) · ผิดรูป ⇒ null
 *   EMAIL: providerId "email" · subject trim + ตัวเล็ก · ≤ 254 · local@domain.tld
 *   LINE: providerId = ตัวเลข 6–20 หลัก (provider/channel id) · subject = LINE userId `U` + hex 32
 */
export function normalizeAgentLogin(x: { kind: unknown; providerId: unknown; subject: unknown }): { kind: AgentLoginKind; providerId: string; subject: string } | null {
  if (typeof x !== "object" || x === null) return null;
  const { kind, providerId, subject } = x;
  if (typeof providerId !== "string" || typeof subject !== "string") return null;
  const pid = providerId.trim();
  if (kind === "EMAIL") {
    if (pid !== "email") return null;
    const s = subject.trim().toLowerCase();
    if (s.length === 0 || s.length > EMAIL_MAX || !EMAIL_RE.test(s)) return null;
    return { kind: "EMAIL", providerId: "email", subject: s };
  }
  if (kind === "LINE") {
    const s = subject.trim();
    if (!LINE_PROVIDER_RE.test(pid) || !LINE_SUBJECT_RE.test(s)) return null;
    return { kind: "LINE", providerId: pid, subject: s };
  }
  return null;
}

/**
 * เลขประจำตัวผู้เสียภาษีของนิติบุคคล (13 หลัก ขึ้นต้น 0 · checksum mod 11) · ตัดช่องว่าง/ขีดก่อน
 * เลขบัตรบุคคล (ไม่ขึ้นต้น 0) / checksum ผิด / รูปผิด ⇒ null (CC: ห้ามเก็บเลขบัตรบุคคล · มติ R1)
 */
export function normalizeJuristicTaxId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\s-]/g, "");
  if (!/^[0-9]{13}$/.test(s) || s[0] !== "0") return null;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(s[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(s[12]) ? s : null;
}

/** ช่องของตัวตนที่คืนได้ (ไม่มี taxIdHash · ไม่มีเวลา) */
export const AGENT_IDENTITY_PUBLIC_FIELDS = ["id", "displayName", "publicCode", "status"] as const;
