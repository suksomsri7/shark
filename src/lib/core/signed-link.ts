// ─────────────────────────────────────────────────────────────
// core/signed-link.ts — ลิงก์ส่วนตัวของลูกค้า (มีลายเซ็น · หมดอายุ · ผูกร้าน+จุดประสงค์) · SVC R0.7 · CC §4 · ใบสั่ง §3.7
//
// token = P + "." + S
//   P = base64url(JSON {"v":1,"t":tenantId,"u":purpose,"s":subjectId,"e":expUnixSec,"n":base64url(16 ไบต์สุ่ม)})
//   S = base64url(HMAC-SHA256(key = "signed-link:v1:" + SESSION_SECRET, P))
//
// 🔴 ทำไมไม่ใช้ `storage/private-links.ts` (CRM C0.4): เพดาน 15 นาที + ผูกผู้ดูเป็นพนักงาน/session — ลิงก์ของลูกค้า
//    ที่ส่งทาง LINE/SMS ต้องอยู่ได้หลายวันและไม่มี session ⇒ สูตรแยก แต่ใช้แบบแผนเดียวกัน:
//    กุญแจติดป้าย (ลายเซ็นของงานหนึ่งเอาไปใช้กับอีกงานไม่ได้) · ไม่มีกุญแจสำรอง · เทียบแบบ timing-safe
// 🔴 อ่าน SESSION_SECRET ตอนเรียก (ไม่ใช่ตอน import) — fitness รันแบบไม่มี env
// 🔴 verify คืน `null` ตัวเดียวกันทุกกรณีล้ม (X7) และไม่ throw · sign throw เมื่อ input ผิด/ไม่มีกุญแจ (บั๊กของผู้เรียก)
// 🔴 ชั้น core: ห้าม import modules/platform
// ─────────────────────────────────────────────────────────────
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** อายุสูงสุดของลิงก์ (นาที) = 90 วัน — บังคับทั้งตอนออกและตอนตรวจ */
export const SIGNED_LINK_MAX_MIN = 129_600;

const KEY_LABEL = "signed-link:v1:";
const PURPOSE_RE = /^[a-z][a-z0-9._-]*$/;
const B64U_RE = /^[A-Za-z0-9_-]+$/;
const MAX_FIELD = 100;

/** กุญแจติดป้าย · ไม่มี/สั้นกว่า 32 ⇒ null (ไม่มีค่าสำรอง) */
function signingKey(): string | null {
  const secret = process.env.SESSION_SECRET;
  if (typeof secret !== "string" || secret.length < 32) return null;
  return `${KEY_LABEL}${secret}`;
}

const field = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_FIELD;

export type SignLinkInput = { tenantId: string; purpose: string; subjectId: string; expMin: number };

/** ออก token · input ผิด/ไม่มีกุญแจ ⇒ throw · expMin เกินเพดาน ⇒ ตัดเหลือ 90 วัน */
export function signLink(input: SignLinkInput): string {
  const { tenantId, purpose, subjectId, expMin } = input ?? ({} as SignLinkInput);
  if (!field(tenantId) || !field(subjectId)) throw new Error("[signed-link] tenantId/subjectId ต้องไม่ว่างและยาวไม่เกิน 100");
  if (!field(purpose) || !PURPOSE_RE.test(purpose)) throw new Error("[signed-link] purpose ผิดรูป");
  if (typeof expMin !== "number" || !Number.isInteger(expMin) || expMin < 1) throw new Error("[signed-link] expMin ต้องเป็นจำนวนเต็ม ≥ 1");
  const key = signingKey();
  if (!key) throw new Error("[signed-link] ไม่ได้ตั้งค่า SESSION_SECRET — ออกลิงก์ไม่ได้");
  const minutes = Math.min(expMin, SIGNED_LINK_MAX_MIN);
  const e = Math.floor(Date.now() / 1000) + minutes * 60;
  const json = JSON.stringify({ v: 1, t: tenantId, u: purpose, s: subjectId, e, n: randomBytes(16).toString("base64url") });
  const p = Buffer.from(json, "utf8").toString("base64url");
  const s = createHmac("sha256", key).update(p).digest("base64url");
  return `${p}.${s}`;
}

/** ตรวจ token กับจุดประสงค์ · ล้มทุกกรณี ⇒ null (ไม่ throw · ไม่บอกเหตุผล) */
export function verifyLink(token: unknown, purpose: string): { tenantId: string; subjectId: string } | null {
  try {
    if (typeof token !== "string" || token.length > 4096 || typeof purpose !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [p, s] = parts;
    if (!p || !s || !B64U_RE.test(p) || !B64U_RE.test(s)) return null;
    const key = signingKey();
    if (!key) return null;
    const want = createHmac("sha256", key).update(p).digest();
    const got = Buffer.from(s, "base64url");
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    const pl: unknown = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    if (!pl || typeof pl !== "object" || Array.isArray(pl)) return null;
    const o = pl as Record<string, unknown>;
    if (o.v !== 1 || !field(o.t) || !field(o.s) || o.u !== purpose) return null;
    if (typeof o.e !== "number" || !Number.isFinite(o.e)) return null;
    const nowS = Math.floor(Date.now() / 1000);
    if (o.e <= nowS || o.e - nowS > SIGNED_LINK_MAX_MIN * 60) return null;
    return { tenantId: o.t, subjectId: o.s };
  } catch {
    return null;
  }
}
