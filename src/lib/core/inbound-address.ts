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

/** ที่อยู่ล้วนจาก `"ชื่อ" <addr>` / `<addr>` / `addr` (ตัวเล็กทั้งหมด) — ตัวเดียวของทั้งระบบอีเมล CRM */
export function bareEmail(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  const m = s.match(/<([^>]*)>\s*$/);
  return (m ? (m[1] ?? "") : s).trim().toLowerCase();
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
