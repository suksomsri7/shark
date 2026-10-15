// units.ts — ด่านสาขาของ REST ระบบขายหน้าร้าน (ใบ P2.13 · brief §2.2 · มติ 2 · CD9 · drift 4)
//
// สาขาเดินทางเป็นฟิลด์ `unitId` (query ของ GET · body ของ method อื่น) — ไม่เชื่อ id จากผู้เรียก:
//   1) สาขาต้องผูกระบบ POS ของคีย์ (`posUnitIsLinked` · ข้ามร้าน/ข้ามระบบ = ไม่เจอ)
//   2) สาขาต้องอยู่ในตัวกรองของคีย์ (`pos.filter.unit:<id>`) / สิทธิ์สาขาของคน
//   ไม่ผ่าน = 404 not_found เสมอ (ไม่บอกว่าสาขานั้นมีอยู่) — facade บางตัวตอบ "หน้าว่าง" แทนการปฏิเสธ (billsPageData · drift 4) ⇒ ด่านต้องมาก่อน facade
// op ที่มี `{id}`: unitId ไม่บังคับ — ใช้สาขาของระเบียนนั้น (หลังผ่านด่าน) · ส่งมาแล้วไม่ตรงสาขาของระเบียน = 404
// 🔴 อ่านอย่างเดียว (หาสาขาของระเบียน) — ไม่มีตรรกะธุรกิจ/เงินที่นี่

import type { ApiActor } from "@/lib/api/actor";
import { ApiError } from "@/lib/api/respond";
import { prisma } from "../db";
import { posUnitIsLinked } from "../register";
import { posActorCanUseUnit } from "./actor";

const NOT_FOUND_EN: Record<string, string> = {
  unit: "The point of sale was not found in this POS system.",
  sale: "The bill was not found in this POS system.",
  shift: "The shift was not found in this POS system.",
  product: "The product was not found in this POS system.",
  channel: "The sales channel was not found in this POS system.",
  order: "The order was not found in this POS system.",
};
const NOT_FOUND_TH: Record<string, string> = {
  unit: "ไม่พบจุดขายนี้ในระบบขายหน้าร้านที่เชื่อมไว้",
  sale: "ไม่พบบิลนี้ในระบบขายหน้าร้าน",
  shift: "ไม่พบกะนี้ในระบบขายหน้าร้าน",
  product: "ไม่พบสินค้านี้ในระบบขายหน้าร้าน",
  channel: "ไม่พบช่องทางขายนี้ในระบบขายหน้าร้าน",
  order: "ไม่พบออเดอร์นี้ในระบบขายหน้าร้าน",
};
const notFound = (what: keyof typeof NOT_FOUND_EN) => new ApiError(404, "not_found", NOT_FOUND_TH[what]!, NOT_FOUND_EN[what]!);

/** สาขานี้ผู้กระทำใช้ได้ในระบบ POS ของคำขอไหม — ไม่ได้ = โยน 404 */
export async function requirePosUnit(actor: ApiActor, unitId: string): Promise<string> {
  if (!posActorCanUseUnit(actor, unitId) || !(await posUnitIsLinked(actor.tenantId, actor.systemId, unitId))) throw notFound("unit");
  return unitId;
}

/** สาขาของระเบียน (ผ่านด่านแล้ว) · `given` = unitId ที่ผู้เรียกส่งมา (ไม่ตรง = 404) */
async function unitOfRecord(actor: ApiActor, what: keyof typeof NOT_FOUND_EN, recordUnit: string | null | undefined, given: string | undefined): Promise<string> {
  if (!recordUnit) throw notFound(what);
  if (given !== undefined && given !== recordUnit) throw notFound(what);
  if (!posActorCanUseUnit(actor, recordUnit) || !(await posUnitIsLinked(actor.tenantId, actor.systemId, recordUnit))) throw notFound(what);
  return recordUnit;
}

/** บิล/ใบคืน ของระบบ POS ของคำขอ */
export async function posSaleUnit(actor: ApiActor, saleId: string, given?: string): Promise<string> {
  const row = await prisma.posSale.findFirst({ where: { id: saleId, tenantId: actor.tenantId, systemId: actor.systemId }, select: { unitId: true } });
  return unitOfRecord(actor, "sale", row?.unitId, given);
}

/** หัวบิลของระบบ POS ของคำขอ (ด่านของ sales.void — สาขา/ที่มา/สถานะ ตัดสินที่ op) · null = ไม่พบ */
export async function posSaleHead(actor: ApiActor, saleId: string): Promise<{ id: string; unitId: string; status: string; sourceModule: string | null } | null> {
  return prisma.posSale.findFirst({ where: { id: saleId, tenantId: actor.tenantId, systemId: actor.systemId }, select: { id: true, unitId: true, status: true, sourceModule: true } });
}

/** กะของระบบ POS ของคำขอ */
export async function posShiftUnit(actor: ApiActor, shiftId: string, given?: string): Promise<string> {
  const row = await prisma.posShift.findFirst({ where: { id: shiftId, tenantId: actor.tenantId, systemId: actor.systemId }, select: { unitId: true } });
  return unitOfRecord(actor, "shift", row?.unitId, given);
}

/** ช่องทางขายของระบบ POS ของคำขอ */
export async function posChannelUnit(actor: ApiActor, channelId: string, given?: string): Promise<string> {
  const row = await prisma.salesChannel.findFirst({ where: { id: channelId, tenantId: actor.tenantId, systemId: actor.systemId }, select: { unitId: true } });
  return unitOfRecord(actor, "channel", row?.unitId, given);
}

/** ออเดอร์ของระบบ POS ของคำขอ */
export async function posOrderUnit(actor: ApiActor, orderId: string, given?: string): Promise<string> {
  const row = await prisma.posOrder.findFirst({ where: { id: orderId, tenantId: actor.tenantId, systemId: actor.systemId }, select: { unitId: true } });
  return unitOfRecord(actor, "order", row?.unitId, given);
}

/**
 * สินค้าของระบบ POS ของคำขอ — สินค้าของสาขา = สาขานั้น · สินค้าทุกสาขา (unitId null) = สาขาที่ผู้เรียกส่งมา (ต้องผ่านด่าน) ·
 * `needUnit` = op ที่ต้องรู้สาขาเสมอ (ตัวเลือก · 86) — สินค้าทุกสาขาแต่ไม่ส่ง unitId = 422 ·
 * คืน null = op ไม่ต้องใช้สาขา (แก้แคตตาล็อก: catalog.ts ตัดสินสิทธิ์ตามขอบเขตของแถวเอง)
 */
export async function posProductUnit(actor: ApiActor, productId: string, given: string | undefined, needUnit: boolean): Promise<string | null> {
  const row = await prisma.posProduct.findFirst({ where: { id: productId, tenantId: actor.tenantId, systemId: actor.systemId }, select: { unitId: true } });
  if (!row) throw notFound("product");
  if (row.unitId) return unitOfRecord(actor, "product", row.unitId, given);
  if (given !== undefined) return requirePosUnit(actor, given);
  if (!needUnit) return null;
  throw new ApiError(422, "validation", "สินค้านี้ขายทุกสาขา — ระบุ unitId ของสาขาที่จะทำรายการ", "This product is sold at every branch: send the unitId of the branch.", undefined, [
    { path: "unitId", message: "ต้องระบุสาขา" },
  ]);
}
