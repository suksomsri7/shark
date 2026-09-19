// serialize.ts — DTO ของบริการ CRM → JSON ที่ผู้เชื่อมต่อภายนอก/ผู้ช่วย AI เห็น (ใบ C1.10)
//
// กติกา (ทุก op ผ่าน `present()` ใน `defineCrmOp` — ไม่มี op ไหนคืนของดิบ):
//   1. ไม่มี `tenantId` ในคำตอบ (systemId คงไว้ — คีย์ผูกระบบเดียว แถวทุกแถวเป็นของระบบนั้นอยู่แล้ว) · `Date` → ISO-8601 · `undefined` → ตัดทิ้ง
//   2. AUDIT-CLASS X8: คีย์ชุด **readonly** เห็นเบอร์โทร/อีเมลแบบปิดบังเสมอ (CRM-API §3 ContactBrief · มติผู้คุมงาน C1.10 ข้อ 6)
//      — ปิดทั้งช่องที่ชื่อบอกว่าเป็นเบอร์/อีเมล และค่าเดียวกันที่โผล่ในช่องอื่น (เช่น ฟิลด์ระบบใน 360)
//   3. AUDIT-CLASS X8: ค่าในส่วน/ฟิลด์ที่ร้านตั้งเป็น "อ่อนไหว" ไม่ออกจากระบบทางคีย์ readonly/operate และทางผู้ช่วย AI เลย
//      (คีย์ admin = ตามนโยบาย D8 ของร้านที่ engine ฟิลด์ตัดสินแล้ว)

import type { ApiActor } from "@/lib/api/actor";

const HIDDEN_KEYS = new Set(["tenantId"]);
/** ชื่อช่องที่เป็นข้อมูลติดต่อโดยตรง */
const PII_KEY = /^(phone|email|mobile|lineUserId|previousEmails|contactPhone|contactEmail)$/i;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);

/** Date → ISO · ตัดคีย์ขอบเขตร้าน/ระบบ · undefined ทิ้ง (เรียกซ้ำได้ผลเท่าเดิม) */
export function jsonSafe(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (!isObj(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (HIDDEN_KEYS.has(k) || v === undefined) continue;
    out[k] = jsonSafe(v);
  }
  return out;
}

/** ปิดบังเบอร์ (เหลือ 3 หลักท้าย) / อีเมล (เหลืออักษรแรก + โดเมน) */
export function maskContactValue(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  const at = s.indexOf("@");
  if (at > 0) return `${s[0]}***${s.slice(at)}`;
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 5) return `${"x".repeat(Math.max(0, digits.length - 3))}${digits.slice(-3)}`;
  return "x".repeat(s.length);
}

/** เก็บค่าติดต่อจริงทุกตัวในคำตอบ (ช่องชื่อ phone/email · ฟิลด์ระบบ `{ key: "phone", value }` ของหน้า 360) */
function collectPii(v: unknown, out: Set<string>): void {
  if (Array.isArray(v)) {
    for (const x of v) collectPii(x, out);
    return;
  }
  if (!isObj(v)) return;
  const fieldKey = typeof v.key === "string" ? v.key : null;
  for (const [k, x] of Object.entries(v)) {
    const piiField = PII_KEY.test(k) || (fieldKey !== null && PII_KEY.test(fieldKey) && (k === "value" || k === "display"));
    if (piiField) {
      if (typeof x === "string" && x.trim().length >= 5) out.add(x.trim());
      if (Array.isArray(x)) for (const y of x) if (typeof y === "string" && y.trim().length >= 5) out.add(y.trim());
      continue;
    }
    collectPii(x, out);
  }
}

// มติผู้คุมงาน C1.10 S4: นอกจากช่องที่ชื่อบอกว่าเป็นเบอร์/อีเมล ต้องปิดรูปแบบเบอร์ไทย/อีเมลที่โผล่ใน **ข้อความใดก็ได้**
//   (ฟิลด์ TEXT ที่ร้านสร้างเอง · หัวข้อ/โน้ตของกิจกรรม · ไทม์ไลน์) — เบอร์ไทย 0XXXXXXXX(X) หรือ +66 มีขีด/เว้นวรรคคั่นได้ · อีเมลทุกรูป
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const TH_PHONE_IN_TEXT = /(?<![\w+])(?:\+66[\s-]?|0)\d(?:[\s.-]?\d){7,8}(?!\w)/g;

/** ปิดรูปแบบเบอร์ไทย/อีเมลในข้อความ 1 ก้อน */
export function maskPiiPatterns(text: string): string {
  return text.replace(EMAIL_IN_TEXT, (m) => maskContactValue(m)).replace(TH_PHONE_IN_TEXT, (m) => maskContactValue(m));
}

function replacePii(v: unknown, pii: readonly string[]): unknown {
  if (typeof v === "string") {
    let s = v;
    for (const p of pii) if (s.includes(p)) s = s.split(p).join(maskContactValue(p));
    return maskPiiPatterns(s);
  }
  if (Array.isArray(v)) return v.map((x) => replacePii(x, pii));
  if (!isObj(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) out[k] = replacePii(x, pii);
  return out;
}

/** AUDIT-CLASS X8: ปิดบังเบอร์/อีเมลทุกจุดของคำตอบ (คีย์ readonly) */
export function maskPiiDeep(value: unknown): unknown {
  const found = new Set<string>();
  collectPii(value, found);
  // ไม่มีค่าในช่องเบอร์/อีเมลก็ยังต้องเดินปิดรูปแบบในข้อความทุกก้อน (S4)
  // ค่ายาวก่อน — กันค่าสั้นที่เป็นส่วนหนึ่งของค่ายาวถูกแทนก่อนแล้วค่ายาวหาไม่เจอ
  return replacePii(value, [...found].sort((a, b) => b.length - a.length));
}

/** AUDIT-CLASS X8: ตัดค่าของส่วน/ฟิลด์ที่ตั้งเป็นอ่อนไหว (หน้าตา 360: `{ sensitive, fields: [{ value, display, hidden }] }`) */
export function stripSensitive(value: unknown, inSensitive = false): unknown {
  if (Array.isArray(value)) return value.map((x) => stripSensitive(x, inSensitive));
  if (!isObj(value)) return value;
  const here = inSensitive || value.sensitive === true;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(value)) {
    if (here && (k === "value" || k === "display" || k === "values")) {
      out[k] = null;
      continue;
    }
    out[k] = stripSensitive(x, here);
  }
  if (here && "hidden" in out) out.hidden = true;
  return out;
}

/** บทบาทของคีย์ API ของ actor นี้ (null = ไม่ใช่คีย์) — ตัวพิมพ์ใหญ่ */
export function apiRoleOfActor(actor: ApiActor): "READONLY" | "OPERATE" | "ADMIN" | null {
  if (actor.kind !== "apikey") return null;
  const scopes = actor.scopes;
  return crmApiRoleOf(scopes);
}

/** ชุดสิทธิ์ของคีย์ → apiRole (ตรรกะเดียวกับ `actor.ts#crmApiRoleForScopes` — ย้ายมาไว้ที่นี่กันวงกลม) */
export function crmApiRoleOf(scopes: readonly string[]): "READONLY" | "OPERATE" | "ADMIN" {
  const has = (s: string) => scopes.includes(s) || scopes.includes("crm.*");
  if (CRM_ADMIN_MARKERS.some(has)) return "ADMIN";
  if (scopes.some((s) => s.startsWith("crm.") && !s.startsWith("crm.filter.") && CRM_WRITE_VERB.test(s)) || scopes.includes("crm.*")) return "OPERATE";
  return "READONLY";
}

/**
 * scope ที่ทำให้คีย์เป็น "ผู้ดูแล" (apiRole ADMIN) — คีย์ตั้งค่า 5 ตัวของ §6.1 (มีเฉพาะชุด crm.admin)
 * 🔴 มติผู้คุมงาน C1.10 S1: การส่งออกต้องใช้ ADMIN ⇒ คีย์ที่ติ๊ก export/merge/delete เองแต่ไม่มีคีย์ตั้งค่า = OPERATE (ส่งออกไม่ได้)
 */
export const CRM_ADMIN_MARKERS: readonly string[] = ["crm.settings.manage", "crm.api.manage", "crm.team.manage", "crm.visibility.manage", "crm.object.manage"];
const CRM_WRITE_VERB = /\.(create|update|delete|convert|import|merge|move|quote|reassign|lines|complete|send|enroll|manage|approve|export|forecast)$/;

/**
 * คำตอบของ op 1 ครั้ง → สิ่งที่ออกจากระบบได้จริง
 * คีย์ readonly = ปิดบังเบอร์/อีเมล + ตัดค่าอ่อนไหว · operate = ตัดค่าอ่อนไหว · ผู้ช่วย AI = ตัดค่าอ่อนไหวเสมอ (แม้เจ้าของร้านถาม)
 */
export function present(actor: ApiActor, data: unknown): unknown {
  let out = jsonSafe(data);
  const role = apiRoleOfActor(actor);
  if (actor.kind === "assistant" || role === "READONLY" || role === "OPERATE") out = stripSensitive(out);
  if (role === "READONLY") out = maskPiiDeep(out);
  return out;
}
