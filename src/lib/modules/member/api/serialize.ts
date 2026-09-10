// serialize.ts — DTO ภายในของโมดูลสมาชิก → JSON ที่ผู้เชื่อมต่อภายนอกเห็น (M1.11)
//
// 🔴 กติกา 4 ข้อ (ทุก op ต้องผ่านที่นี่ ห้ามคืนแถวดิบ):
//   1. ไม่มี `Date` หลุดออกไป — เวลาเป็น ISO-8601 (UTC) เสมอ · null คงเป็น null
//   2. ไม่มี `tenantId`/`systemId` ในคำตอบ (คีย์รู้อยู่แล้วว่าตัวเองอยู่ร้าน/ระบบไหน · ลดข้อมูลรั่ว)
//   3. **ตัวระบุตัวตนของช่องทางภายนอกต้องปิดบัง** — `MemberChannelIdentity.externalId` คือ id ไลน์/
//      เบอร์วอทส์แอปของลูกค้า ซึ่งเอาไปทักหาลูกค้าตรงได้โดยไม่ผ่านร้าน ⇒ ส่งออกเป็นค่าปิดบังเสมอ
//      (คีย์ที่ต้องใช้ id เต็มคือคีย์ที่ "รู้ id นั้นอยู่แล้ว" เพราะเป็นคนส่งเข้ามาผูกเอง)
//   4. รูปร่างของแถวเปลี่ยนได้ยาก = สัญญาของ API ⇒ เพิ่มฟิลด์ได้ ลบ/เปลี่ยนความหมายไม่ได้
//
// ทำไมมี `jsonSafe()` แบบทั่วไป แทนตัวแปลงรายชนิด: DTO ของโมดูลนี้ซ้อนลึกและยาว (Member360 มี
// วันที่อยู่ 6 ชั้น) — ตัวแปลงรายชนิด 20 ตัวคือ 20 ที่ที่ลืมได้ ⇒ กติกาข้อ 1–2 บังคับที่เดียว

/** `Date | null` → ISO string | null (ไม่มี `undefined` ในคำตอบ — ผู้เรียกจะได้ไม่ต้องเดา) */
export function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/** คีย์ที่ห้ามหลุดออกไปกับคำตอบใด ๆ (กติกาข้อ 2) */
const HIDDEN_KEYS = new Set(["tenantId", "systemId", "memberSystemId"]);

/**
 * แปลงค่าใด ๆ ให้ปลอดภัยต่อการส่งออก: Date → ISO · ตัดคีย์ขอบเขตร้าน/ระบบทิ้ง · undefined → ตัดทิ้ง
 * (เรียกซ้ำได้ผลเท่าเดิม · ไม่แตะค่าที่เป็น primitive)
 */
export function jsonSafe(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (HIDDEN_KEYS.has(k) || v === undefined) continue;
    out[k] = jsonSafe(v);
  }
  return out;
}

/**
 * ปิดบัง id ของช่องทางภายนอก — เก็บหัว 2 ตัวและท้าย 2 ตัวไว้พอให้คนเทียบได้ว่า "ใช่อันเดียวกันไหม"
 * สั้นกว่า 6 ตัว = ปิดทั้งหมด (โชว์หัว-ท้ายแล้วแทบไม่เหลืออะไรให้ปิด)
 */
export function maskExternalId(raw: string): string {
  const s = String(raw ?? "");
  if (s.length === 0) return "";
  if (s.length < 6) return "x".repeat(s.length);
  return `${s.slice(0, 2)}${"x".repeat(Math.min(8, s.length - 4))}${s.slice(-2)}`;
}

export type ApiIdentityRow = {
  id: string;
  channel: string;
  channelLabel: string;
  /** ปิดบังเสมอ (กติกาข้อ 3) */
  externalId: string;
  displayName: string | null;
  verified: boolean;
  linkedBy: string;
  linkedAt: string | null;
  lastSeenAt: string | null;
};

type IdentityInput = {
  id: string;
  channel: string;
  channelLabel: string;
  externalId: string;
  displayName: string | null;
  verified: boolean;
  linkedBy: string;
  linkedAt: Date;
  lastSeenAt: Date | null;
};

export function identityRow(i: IdentityInput): ApiIdentityRow {
  return {
    id: i.id,
    channel: i.channel,
    channelLabel: i.channelLabel,
    externalId: maskExternalId(i.externalId),
    displayName: i.displayName,
    verified: i.verified,
    linkedBy: i.linkedBy,
    linkedAt: iso(i.linkedAt),
    lastSeenAt: iso(i.lastSeenAt),
  };
}
