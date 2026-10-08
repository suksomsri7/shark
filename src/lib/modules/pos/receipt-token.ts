// receipt-token.ts — โทเคนใบเสร็จออนไลน์ /r/<token> ของบิล POS (P1.11 · R1)
//
// 🔴 12 ตัว Crockford base32 ตัวใหญ่ (0-9 A-Z ไม่มี I L O U) จาก crypto.randomBytes เท่านั้น — 60 บิต เดาไม่ได้ · ห้าม Math.random
// 🔴 บิลใหม่ได้โทเคนใน tx ของ createSale / refundSale (newReceiptToken) · บิลเก่าได้แบบขี้เกียจผ่าน ensureReceiptToken
//    (UPDATE เดียวแบบมีเงื่อนไข "publicToken IS NULL" ⇒ เรียกซ้ำ/พร้อมกันได้ตัวเดียวกัน) · โทเคนไม่เปลี่ยนตลอดอายุบิล
// 🔴 ค้นบิลจากโทเคนด้วย unique index เท่านั้น (R9 — ไม่มีทางไล่รายการ)
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

type Db = typeof prisma | Prisma.TransactionClient;

/** ตัวอักษร Crockford base32 (32 ตัว · ไม่มี I L O U) */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const RECEIPT_TOKEN_LENGTH = 12;
export const RECEIPT_TOKEN_RE = /^[0-9A-HJKMNP-TV-Z]{12}$/;

/** โทเคนใหม่ 12 ตัว — 1 ไบต์สุ่มต่อ 1 ตัว (256 หาร 32 ลงตัว ⇒ ทุกตัวอักษรโอกาสเท่ากัน) */
export function newReceiptToken(): string {
  const bytes = randomBytes(RECEIPT_TOKEN_LENGTH);
  let out = "";
  for (let i = 0; i < RECEIPT_TOKEN_LENGTH; i++) out += CROCKFORD[bytes[i]! & 31];
  return out;
}

/** รูปแบบโทเคนถูกไหม (ตรวจก่อนแตะ DB — ค่าผิดรูปไม่ต้องค้น) */
export const isReceiptToken = (v: unknown): v is string => typeof v === "string" && RECEIPT_TOKEN_RE.test(v);

const isUniqueClash = (e: unknown) => !!e && typeof e === "object" && (e as { code?: unknown }).code === "P2002";

/**
 * โทเคนของบิล (R1) — มีแล้วคืนตัวเดิม · ยังไม่มี (บิลก่อน P1.11) = สร้างแล้วเขียนครั้งเดียว
 * null = ไม่มีบิลนี้ในร้านนี้ (ไม่เขียนอะไร) · ใช้ client ของผู้เรียกได้ (tx เดียวกับ receiptPayload)
 */
export async function ensureReceiptToken(tenantId: string, saleId: string, client?: Db): Promise<string | null> {
  if (typeof tenantId !== "string" || !tenantId || typeof saleId !== "string" || !saleId || saleId.length > 200) return null;
  const db = client ?? prisma;
  const read = () => db.posSale.findFirst({ where: { id: saleId, tenantId }, select: { publicToken: true } });
  const row = await read();
  if (!row) return null;
  if (row.publicToken) return row.publicToken;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // เงื่อนไข publicToken IS NULL ⇒ สองคำขอพร้อมกัน ตัวแรกชนะ ตัวหลังอ่านค่าของตัวแรก
      await db.posSale.updateMany({ where: { id: saleId, tenantId, publicToken: null }, data: { publicToken: newReceiptToken() } });
      break;
    } catch (e) {
      if (!isUniqueClash(e) || attempt === 2) throw e; // ชนโทเคนของบิลอื่น (โอกาส ~2⁻⁶⁰) = สุ่มใหม่
    }
  }
  return (await read())?.publicToken ?? null;
}

/** แถวบิลที่หน้าใบเสร็จออนไลน์ใช้ (ไม่มีข้อมูลส่วนตัว — memberId ใช้ภายในเท่านั้น ไม่ออกไปถึงหน้า) */
const TOKEN_SALE_SELECT = {
  id: true,
  tenantId: true,
  unitId: true,
  systemId: true,
  docType: true,
  refSaleId: true,
  status: true,
  receiptNo: true,
  memberId: true,
  grandTotalSatang: true,
  refundedSatang: true,
  paidAt: true,
  createdAt: true,
} as const;
export type TokenSale = Prisma.PosSaleGetPayload<{ select: typeof TOKEN_SALE_SELECT }>;

/**
 * บิลของโทเคน (R1 · R9) — ค้นด้วย unique index ของ publicToken เท่านั้น · ใบ REFUND = บิล SALE ต้นทาง (ร้านเดียวกัน)
 * null = รูปแบบผิด / ไม่มีโทเคนนี้ / ใบคืนที่หาบิลต้นทางไม่เจอ (ผู้เรียกตอบ TOKEN_NOT_FOUND เหมือนกันทุกกรณี)
 */
export async function saleForToken(token: unknown, client?: Db): Promise<TokenSale | null> {
  if (!isReceiptToken(token)) return null;
  const db = client ?? prisma;
  const row = await db.posSale.findUnique({ where: { publicToken: token }, select: TOKEN_SALE_SELECT });
  if (!row) return null;
  if (row.docType === "SALE") return row;
  if (!row.refSaleId) return null;
  return db.posSale.findFirst({ where: { id: row.refSaleId, tenantId: row.tenantId, docType: "SALE" }, select: TOKEN_SALE_SELECT });
}
