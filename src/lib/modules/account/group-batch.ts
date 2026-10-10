import type { Prisma } from "@prisma/client";
import { likeStartsWith } from "@/lib/core/ci-equals"; // CRM C5.5-fix8 ▸ คำค้นไม่มี wildcard รั่ว ◂

// ─────────────────────────────────────────────────────────────
// group-batch.ts — "ชุด" ของการชำระที่กระจายจากเอกสารกลุ่ม (ใบวางบิล / ใบรวมจ่าย)
//
// CRM C5.4-C ▸ (round 8b · R8-1 · มติผู้คุมงาน option a — ไม่มี migration)
//   รับ/จ่าย 1 ครั้งที่เอกสารกลุ่ม = การชำระ 1 งวดต่อใบลูก · คีย์กันซ้ำของงวด = `GRP#<groupId>#<clientKey>#<childId>`
//   ถ้าจ่ายด้วยเช็คใบเดียว เช็คผูกได้แค่ **งวดแรก** (AccountDocumentPayment.chequeId เป็น UNIQUE) ⇒ งวดอื่นของชุดเดียวกัน
//   หาได้จากคีย์เท่านั้น — ทุกที่ที่ต้องรู้ว่า "เช็คใบนี้จ่ายงวดไหนบ้าง" (เด้ง/ยกเลิกเช็ค) หรือ "งวดนี้จ่ายด้วยเช็คใบไหน"
//   (ยกเลิกการชำระ · ยกเลิกทั้งครั้งของกลุ่ม) ต้องผ่านไฟล์นี้ ◂
//
//   • คีย์ของชุดต่างกันเสมอ: idempotencyKey เป็น UNIQUE ทั้งตาราง และ recordGroupPayment ที่ได้คีย์ชุดซ้ำ (ส่ง clientKey ซ้ำ/ถูกตัดจนชน)
//     คืนผลของชุดเดิมโดยไม่เขียนอะไร ⇒ 1 คีย์ชุด = การชำระครั้งเดียว = เช็คไม่เกิน 1 ใบ
//   • จับคู่แบบตรงตัว: กรองด้วย `startsWith` แล้วเทียบคีย์เต็ม `<batchKey>#<documentId ของงวดนั้นเอง>` ใน JS อีกชั้น
//     (ไม่พึ่ง LIKE — clientKey อาจมี `_`/`%`) · คีย์รูปอื่น (เช่น `<keyBase>:<n>` ของฟอร์มรับชำระ) ไม่นับเป็นชุด
//   • leaf module (import แค่ type) — service.ts · expense.ts · cheque.ts · group.ts ใช้ร่วมกันโดยไม่ import วนกัน
// ─────────────────────────────────────────────────────────────

type Db = Prisma.TransactionClient;

export const GROUP_KEY_SEP = "#";
const GROUP_KEY_HEAD = "GRP";

/** `GRP#<groupId>#` — ทุกงวดของทุกครั้งของกลุ่มนี้ */
export function groupKeyPrefix(groupId: string): string {
  return `${GROUP_KEY_HEAD}${GROUP_KEY_SEP}${groupId}${GROUP_KEY_SEP}`;
}
/** `GRP#<groupId>#<clientKey>` — การชำระ 1 ครั้ง (`#` ใน clientKey ถูกแทนด้วย `-` · ยาวไม่เกิน 60) */
export function groupBatchKey(groupId: string, clientKey: string): string {
  return `${groupKeyPrefix(groupId)}${clientKey.replace(/#/g, "-").slice(0, 60)}`;
}
/** `GRP#<groupId>#<clientKey>#<childId>` — งวดของใบลูก 1 ใบในครั้งนั้น */
export function groupChildKey(batchKey: string, childId: string): string {
  return `${batchKey}${GROUP_KEY_SEP}${childId}`;
}

/**
 * คีย์ชุดของงวดนี้ — เฉพาะเมื่อคีย์ = `GRP#<groupId>#<clientKey>#<documentId ของงวดนี้>` ครบ 4 ท่อนพอดี · อย่างอื่น (คีย์ฟอร์ม/REST/ไม่มีคีย์) = null
 */
export function groupBatchKeyOfPayment(idempotencyKey: string | null | undefined, documentId: string): string | null {
  if (!idempotencyKey || !documentId) return null;
  const parts = idempotencyKey.split(GROUP_KEY_SEP);
  if (parts.length !== 4 || parts[0] !== GROUP_KEY_HEAD || !parts[1] || parts[3] !== documentId) return null;
  return parts.slice(0, 3).join(GROUP_KEY_SEP);
}

export type GroupBatchPayment = { id: string; documentId: string; chequeId: string | null; voidedAt: Date | null };

/** ทุกงวดของการชำระครั้งเดียว (รวมที่ยกเลิกแล้ว) — เรียง documentId, id (ลำดับล็อกคงที่) */
export async function groupBatchPayments(db: Db, tenantId: string, systemId: string, batchKey: string): Promise<GroupBatchPayment[]> {
  const rows = await db.accountDocumentPayment.findMany({
    where: { tenantId, systemId, idempotencyKey: likeStartsWith(`${batchKey}${GROUP_KEY_SEP}`) }, // CRM C5.5-fix8 ▸ `%`/`_` ใน batchKey เป็นตัวอักษร ◂
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
    select: { id: true, documentId: true, chequeId: true, voidedAt: true, idempotencyKey: true },
  });
  return rows
    .filter((r) => groupBatchKeyOfPayment(r.idempotencyKey, r.documentId) === batchKey)
    .map((r) => ({ id: r.id, documentId: r.documentId, chequeId: r.chequeId, voidedAt: r.voidedAt }));
}

/**
 * เช็คที่ "ถือ" งวดเหล่านี้อยู่ = chequeId ของงวดเอง + (งวดของเอกสารกลุ่ม) เช็คของชุดเดียวกันที่ผูกไว้กับงวดแรก — เรียง id (ลำดับล็อกเช็ค)
 *   voidPayment / voidVendorPayment / ยกเลิกทั้งครั้งของกลุ่ม ล็อกเช็คเหล่านี้ก่อนเอกสาร แล้วใช้กติกา B2c (เช็คยังมีผล ⇒ ปฏิเสธ)
 */
export async function chequeIdsHoldingPayments(db: Db, tenantId: string, systemId: string, paymentIds: string[]): Promise<string[]> {
  if (paymentIds.length === 0) return [];
  const rows = await db.accountDocumentPayment.findMany({
    where: { id: { in: paymentIds }, tenantId, systemId },
    select: { documentId: true, chequeId: true, idempotencyKey: true },
  });
  const out = new Set<string>();
  const batches = new Set<string>();
  for (const r of rows) {
    if (r.chequeId) out.add(r.chequeId);
    const bk = groupBatchKeyOfPayment(r.idempotencyKey, r.documentId);
    if (bk) batches.add(bk);
  }
  for (const bk of batches) for (const s of await groupBatchPayments(db, tenantId, systemId, bk)) if (s.chequeId) out.add(s.chequeId);
  return [...out].sort();
}

/**
 * งวดที่เช็คใบนี้จ่าย = งวดที่ผูก chequeId ไว้ + งวดอื่นของชุดเดียวกัน (ที่ไม่ได้ผูกเช็คใบอื่น) — รวมที่ยกเลิกแล้ว · เรียง documentId, id
 *   เช็คเด้ง/ยกเลิกเช็คใช้ชุดนี้คืนหนี้ **ทุกใบลูก** (เดิมคืนเฉพาะใบแรก ใบอื่นค้าง PAID ด้วยเงินที่เด้ง)
 */
export async function paymentsOfCheque(db: Db, tenantId: string, systemId: string, chequeId: string): Promise<GroupBatchPayment[]> {
  const linked = await db.accountDocumentPayment.findMany({
    where: { chequeId, tenantId, systemId },
    select: { id: true, documentId: true, chequeId: true, voidedAt: true, idempotencyKey: true },
  });
  const byId = new Map<string, GroupBatchPayment>();
  for (const p of linked) {
    byId.set(p.id, { id: p.id, documentId: p.documentId, chequeId: p.chequeId, voidedAt: p.voidedAt });
    const bk = groupBatchKeyOfPayment(p.idempotencyKey, p.documentId);
    if (!bk) continue;
    for (const s of await groupBatchPayments(db, tenantId, systemId, bk)) if (!s.chequeId || s.chequeId === chequeId) byId.set(s.id, s);
  }
  return [...byId.values()].sort((a, b) => (a.documentId < b.documentId ? -1 : a.documentId > b.documentId ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * CRM C5.4-C ▸ (round 11 · R10-8) การชำระ 1 ครั้งของเอกสารกลุ่มเป็นธุรกรรมเดียว (round 10 มติ B) ⇒ มีเพดานเวลา (40 วินาที)
 *   ~0.4 วินาที/ใบลูกเมื่อมีภาษีหัก ณ ที่จ่าย + ใบกำกับอัตโนมัติ + เช็ค ⇒ รับได้ครั้งละไม่เกิน 40 ใบ — ปฏิเสธก่อนเขียนอะไร
 *   กติกา/ข้อความเดียวกันทุกทาง: แผงรับชำระ (GroupPaymentPanel) · server action · REST (ทั้งสองทางผ่าน recordGroupPayment) ◂
 */
export const GROUP_PAYMENT_MAX_CHILDREN = 40;
export function groupPaymentTooManyChildrenMsg(n: number): string {
  return `การชำระครั้งนี้กระจายลงเอกสาร ${n} ใบ — บันทึกได้ครั้งละไม่เกิน ${GROUP_PAYMENT_MAX_CHILDREN} ใบ กรุณาแบ่งจ่ายเป็นหลายครั้ง (ใส่ยอดให้ครอบคลุมไม่เกิน ${GROUP_PAYMENT_MAX_CHILDREN} ใบต่อครั้ง)`;
}
