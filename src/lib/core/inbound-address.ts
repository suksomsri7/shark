// inbound-address.ts — ตัวจับ "ที่อยู่กล่องขาเข้าของ CRM" แบบบริสุทธิ์ (ใบ C2.5 · รอบแก้ 2 · มติผู้คุมงาน F12)
//
// 🔴 ทำไมไฟล์นี้อยู่ใน `core` ไม่ใช่ในโมดูล CRM:
//    route `src/app/api/email/inbound/route.ts` เป็นเส้นของ **บอร์ดงาน** (ใบ K3.9) ที่ใบ C2.5 ขอแยกทางจดหมาย
//    ของ CRM ออกไปก่อน ⇒ มันต้องตอบคำถาม "ที่อยู่นี้ของ CRM ไหม" ให้ได้โดย **ไม่ import โมดูล CRM เลย**
//      • ด้านความทนทาน: เดิม route `await import("@/lib/modules/crm")` เพื่อถามคำถามนี้ ⇒ โมดูล CRM พังตอนโหลด
//        = จดหมายเข้าบอร์ดงานของทุกร้านหายทั้งสาย (route จับ throw แล้วตอบ `{ok:false}` เงียบ ๆ)
//      • ด้านกติกา: ด่าน fitness F2.3 ห้ามโค้ดนอกโฟลเดอร์ CRM import ไฟล์ภายในของโมดูล (รวม `*-shared`)
//        และ "ห้ามขยายรายการยกเว้น" ⇒ ที่อยู่เดียวที่ทั้งสองฝั่งแตะได้คือ `core`
// 🔴 ไฟล์บริสุทธิ์: ไม่ import อะไรเลย (ไม่มี prisma · ไม่มี env · ไม่มี next) — `emails-shared.ts` ของ CRM
//    re-export ตัวในไฟล์นี้ต่อ ⇒ มีตัวจับ **ชุดเดียว** ในระบบ ไม่มีสำเนาที่วันหนึ่งจะไม่ตรงกัน

/** โดเมนกลางของ SHARK — ที่อยู่ขาเข้า/ผู้ส่งสำรองอยู่ใต้โดเมนนี้เสมอ */
export const CRM_EMAIL_SHARK_DOMAIN = "shark.in.th";
/** คำนำหน้าที่อยู่ขาเข้าของ CRM (`crm+<key>@shark.in.th`) — บอร์ดงานใช้ `งาน+`/`tasks+` (ไม่มีทางทับกัน) */
export const CRM_INBOUND_PREFIX = "crm";
/** กุญแจกล่องขาเข้า 8 ตัวอักษร base32 ตัวเล็ก (แบบเดียวกับกุญแจบอร์ด) */
export const CRM_INBOUND_KEY_RE = /^[a-z2-7]{8}$/;

/**
 * ความยาว "รหัสย่อของเธรด" ในที่อยู่ตอบกลับสำรอง `crm+<key>+t<short>@shark.in.th` (มติ C31)
 * 🔴 ความยาว **คงที่** และถูกเทียบแบบเท่ากันเท่านั้น (ห้ามเทียบแบบคำนำหน้า): เดิม `+t<1–32 ตัว>` ถูกเทียบด้วย
 *    `threadKey startsWith` ⇒ คนนอกที่ส่งถึง `crm+<key>+ta@` ได้เข้าเธรดล่าสุดที่ขึ้นต้นด้วย "a" ของลูกค้าคนอื่น
 *    (อ่านจดหมายเก่าไม่ได้ แต่ **แทรกจดหมายของตัวเองเข้าเธรดของลูกค้ารายอื่น**ได้ = ข้อมูลปนคน)
 *    12 ตัวอักษรฐาน 16 = 48 บิต ต้องรู้ครบทุกตัวจึงจะระบุเธรดได้
 */
export const CRM_THREAD_SHORT_LEN = 12;

/**
 * ส่วนหน้า @ ของกล่องขาเข้า CRM — `crm+<key8>` ตามด้วยแท็กท้าย (ไม่บังคับ)
 * 🔴 จงใจใจกว้างกับแท็กท้าย (≤ 64 ตัว) เพื่อให้จดหมายที่จ่าที่อยู่เพี้ยนยัง **เข้า CRM** (แล้วเปิดเธรดใหม่)
 *    ไม่ใช่หลุดไปหาตัวเก็บของบอร์ดงาน · การ "ระบุเธรด" ใช้ `CRM_THREAD_TAG_RE` ที่บังคับความยาวเป๊ะ ๆ เท่านั้น
 */
export const CRM_RECIPIENT_RE = new RegExp(`^${CRM_INBOUND_PREFIX}\\+([a-z2-7]{8})(?:\\+([a-z0-9]{1,64}))?$`, "i");
/** แท็กเธรดที่ "นับ" — `t` + รหัสย่อยาวเป๊ะ `CRM_THREAD_SHORT_LEN` ตัว (อย่างอื่น = ไม่มีแท็ก) */
export const CRM_THREAD_TAG_RE = new RegExp(`^t([a-z0-9]{${CRM_THREAD_SHORT_LEN}})$`, "i");

// ───────────────────────── ตัวแกะวงเล็บมุมแบบเชิงเส้น (CRM C5.5-fix5 · รีวิว RV-2) ─────────────────────────
// 🔴 เดิมใช้ regex `<([^>]*)>\s*$` / `<([^>]+)>` ซึ่งเป็น n² เมื่อมี `<` เยอะแต่ไม่มี `>` (หัว From 40,000 ตัว ≈ 1.3 วินาที
//    ต่อการเรียกหนึ่งครั้ง และ ingestInbound เรียกก่อนถังจำกัดอัตรา) ⇒ ตัวข้างล่าง "ผลตรงทุกไบต์กับ regex เดิม" แต่เดินรอบเดียว
//    (ข้อสอบ `scripts/pending/cf6/probe-cf6-linear.mts` เทียบกับ regex เดิมบนที่อยู่จริง/แปลก/สุ่มหลายพันแบบ) · fitness F16 ห้าม regex แบบเดิม

/** ≡ `s.match(/<([^>]*)>\s*$/)?.[1] ?? null` — ส่วนในวงเล็บมุมคู่ **สุดท้าย** ที่ปิดท้ายสตริง (หลัง `>` มีได้แต่ช่องว่าง) */
export function trailingAngleAddr(s: string): string | null {
  const t = s.trimEnd(); // ชุดอักขระที่ trimEnd ตัด = `\s` ของ regex (WhiteSpace + LineTerminator)
  const e = t.length - 1;
  if (e < 1 || t.charCodeAt(e) !== 62 /* > */) return null;
  const q = t.lastIndexOf(">", e - 1);
  const lt = t.indexOf("<", q + 1); // `<` ซ้ายสุดที่ระหว่างมันกับ `>` ตัวท้ายไม่มี `>` คั่น
  return lt < 0 || lt >= e ? null : t.slice(lt + 1, e);
}

/** ≡ `s.match(/<([^>]+)>/)?.[1] ?? null` — ส่วนในวงเล็บมุมคู่ **แรก** ที่ข้างในไม่ว่าง */
export function firstAngleAddr(s: string): string | null {
  let from = 0;
  for (;;) {
    const lt = s.indexOf("<", from);
    if (lt < 0) return null;
    const gt = s.indexOf(">", lt + 1);
    if (gt < 0) return null;
    if (gt > lt + 1) return s.slice(lt + 1, gt);
    from = lt + 1;
  }
}

/** ≡ `[...s.matchAll(/<([^>]+)>/g)].map((m) => m[1])` — ทุกคู่วงเล็บมุมที่ข้างในไม่ว่าง (Message-ID ใน In-Reply-To/References) */
export function angleIds(s: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const lt = s.indexOf("<", from);
    if (lt < 0) return out;
    const gt = s.indexOf(">", lt + 1);
    if (gt < 0) return out;
    if (gt > lt + 1) {
      out.push(s.slice(lt + 1, gt));
      from = gt + 1;
    } else from = lt + 1;
  }
}

/** ที่อยู่ล้วนจาก `"ชื่อ" <addr>` / `<addr>` / `addr` (ตัวเล็กทั้งหมด) — ตัวเดียวของทั้งระบบอีเมล CRM */
export function bareEmail(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return (trailingAngleAddr(s) ?? s).trim().toLowerCase();
}

// ───────────────────────── เพดานหัวจดหมายขาเข้า (CRM C5.5-fix5 · รีวิว RV-2) ─────────────────────────
// route `/api/email/inbound` ยอม body ได้ 10 MB และเดิมไม่จำกัดความยาวหัวใด ๆ ⇒ หัว From/To/References ยาวเป็นเมกะไบต์วิ่งเข้าตัวแกะทุกตัว
// ใช้ที่ route (ทั้งทางบอร์ดงานและทาง CRM) และซ้ำที่ต้น `ingestInbound` / `ingestInboundEmail` (ผู้เรียกทางอื่น) — ทำซ้ำได้ ผลเท่าเดิม
// 🔴 ที่อยู่ / Message-ID / หัวทั่วไปที่ยาวเกิน = **ทิ้ง** (ถือว่าไม่มี) ไม่ใช่ตัด: ตัดที่อยู่อาจได้ที่อยู่อื่นที่ใช้ได้จริง
//    (`crm+key@shark.in.th.x…` → `crm+key@shark.in.th`) และตัดหัว Authentication-Results อาจตัดหัวจริงของ MTA ทิ้งเหลือหัวปลอมของผู้ส่ง
//    · หัวข้อ = ตัด (ปลายทางตัดเหลือ 120/300 ตัวอักษรอยู่แล้ว)

/** ที่อยู่ 1 รายการ (From / แต่ละตัวใน To·Cc) และ Message-ID — RFC 5322 §2.1.1 บรรทัดหัวจดหมาย ≤ 998 อักขระ */
export const INBOUND_ADDR_MAX = 998;
/** หัวอื่น ๆ ต่อ 1 ชื่อหัว (References · Authentication-Results · Reply-To …) และหัวข้อ — 16 KiB */
export const INBOUND_HEADER_MAX = 16 * 1024;

/** ที่อยู่/Message-ID: ไม่ใช่สตริง หรือยาวเกิน `INBOUND_ADDR_MAX` = `""` */
export function capInboundAddr(v: unknown): string {
  return typeof v === "string" && v.length <= INBOUND_ADDR_MAX ? v : "";
}

/** รายการที่อยู่: ทิ้งตัวที่ไม่ใช่สตริงหรือยาวเกิน (ตัวอื่นคงลำดับเดิม) */
export function capInboundAddrList(list: unknown): string[] {
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string" && x.length <= INBOUND_ADDR_MAX) : [];
}

/** หัวจดหมาย (คีย์ → ค่า): ทิ้งหัวที่ค่ายาวเกิน `INBOUND_HEADER_MAX` ทั้งหัว */
export function capInboundHeaders(h: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h || typeof h !== "object" || Array.isArray(h)) return out;
  for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
    if (typeof v === "string" && v.length <= INBOUND_HEADER_MAX && k.length <= INBOUND_ADDR_MAX) out[k] = v;
  }
  return out;
}

/** หัวข้อ: ตัดที่ `INBOUND_HEADER_MAX` (ไม่ใช่สตริง = คงค่าเดิม — ผู้เรียกจัดการ null/undefined เอง) */
export function capInboundSubject<T>(v: T): T | string {
  return typeof v === "string" && v.length > INBOUND_HEADER_MAX ? v.slice(0, INBOUND_HEADER_MAX) : v;
}

/**
 * ซองจดหมายขาเข้าที่ผ่านเพดานแล้ว (สำเนาตื้น · ช่องอื่น เช่น เนื้อความ/ไฟล์แนบ คงเดิม — มีเพดานของตัวเองที่ปลายทาง)
 * จดหมายปกติ (หัวทุกตัวสั้นกว่าเพดาน) ได้ค่ากลับมาเท่าเดิมทุกช่อง
 */
export function capInboundEnvelope<
  P extends { messageId?: unknown; from?: unknown; to?: unknown; cc?: unknown; subject?: unknown; headers?: unknown },
>(p: P): P {
  if (!p || typeof p !== "object") return p;
  const out: Record<string, unknown> = { ...p };
  if ("messageId" in p) out.messageId = capInboundAddr(p.messageId);
  if ("from" in p) out.from = capInboundAddr(p.from);
  if ("to" in p) out.to = capInboundAddrList(p.to);
  if ("cc" in p && p.cc !== undefined) out.cc = capInboundAddrList(p.cc);
  if ("subject" in p) out.subject = capInboundSubject(p.subject);
  if ("headers" in p && p.headers !== undefined) out.headers = capInboundHeaders(p.headers);
  return out as P;
}

/**
 * ผู้รับที่เป็นกล่อง CRM (`crm+<key>[+t<short>]@shark.in.th`) — ไม่สนตัวพิมพ์ · ไม่แตะฐานข้อมูล
 * คืน `threadShort` เฉพาะเมื่อแท็กท้ายยาวถูกต้องเป๊ะ ๆ · แท็กเพี้ยน/สั้น/ยาว ⇒ `null` (เปิดเธรดใหม่)
 */
export function parseCrmRecipient(addr: unknown): { key: string; threadShort: string | null } | null {
  const a = bareEmail(addr);
  if (!a.endsWith(`@${CRM_EMAIL_SHARK_DOMAIN}`)) return null;
  const local = a.slice(0, a.length - CRM_EMAIL_SHARK_DOMAIN.length - 1);
  const m = local.match(CRM_RECIPIENT_RE);
  if (!m) return null;
  const tag = m[2] ? m[2].toLowerCase() : "";
  const t = tag ? tag.match(CRM_THREAD_TAG_RE) : null;
  return { key: (m[1] ?? "").toLowerCase(), threadShort: t ? (t[1] ?? "").toLowerCase() : null };
}

/** ที่อยู่นี้ควรเข้าทาง CRM ไหม — route ของอีเมลขาเข้าและบริการ CRM ใช้ตัวเดียวกันตัวนี้ */
export function isCrmInboundAddress(addr: unknown): boolean {
  return parseCrmRecipient(addr) !== null;
}
