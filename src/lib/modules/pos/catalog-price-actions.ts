"use server";
// catalog-price-actions.ts — server action ราคาตามช่องทาง/สาขา ของจอ 06 (POS P2.2U ▸ มติ 9) · เปลือกบาง: session → CatalogCtx → catalog.*
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดผลลัพธ์เขียนในลายเซ็น (จอใช้ Awaited<ReturnType<…>>) · ชนิดแถวอยู่ที่ price-shared.ts
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message, field?} (Next ปิดข้อความของ error ที่โยนออกจาก action ใน production) · จอแสดงผ่านคีย์ ไม่แสดง message
// 🔴 ร้าน + ผู้ใช้มาจาก SESSION เท่านั้น (actorUserId = ผู้ใช้จริง · catalog.ts อ่าน membership จาก DB แล้วตรวจ pos.product.setPrice ตามขอบเขตแถว)
//    systemId / productId / unitId จากคำขอถูกตรวจซ้ำใน catalog.ts (ร้านอื่น/ระบบอื่น = NOT_FOUND แบบ 404)
// POS P2.2U ▸ มติ 9: ไฟล์ใหม่ไฟล์เดียวฝั่งเซิร์ฟเวอร์ — ไม่มีตรรกะราคาเอง (ผู้เขียนเดียว = catalog.ts) ◂

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, evaluate } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { CatalogError, bulkChannelMarkup, setChannelPrices, type CatalogCtx, type CatalogErrorCode } from "./catalog";
import { copyUnitPrices, unitPriceMatrix, type UnitPriceMatrix } from "./catalog"; // POS P2.11 ▸ คัดลอก/เทียบราคาสาขา ◂
import type { ChannelPriceInputRow, ChannelPriceView } from "./price-shared";

// POS P2.11 ▸ l-price: + reason (PRICE_REFUSAL_REASONS · คีย์ pos.price.errors.<camelCase>) · field ส่งต่อจาก CatalogError ◂
type PriceActionRefusal = { ok: false; code: CatalogErrorCode | "INTERNAL"; message: string; field?: string; reason?: string };

function refusalOf(where: string, e: unknown): PriceActionRefusal {
  if (e instanceof CatalogError) return { ok: false, code: e.code, message: e.message, ...(e.field ? { field: e.field } : {}), ...(e.reason ? { reason: e.reason } : {}) };
  console.error(`[pos/catalog-price-actions] ${where}`, e);
  return { ok: false, code: "INTERNAL", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
}

/** session → CatalogCtx · ด่านแรกระดับบทบาท (pos.product.setPrice) — ขอบเขตต่อแถวตรวจซ้ำใน catalog.ts กับ DB */
const PRICE_READ_ACTIONS = ["pos.sale.read", "pos.sale.create", "pos.product.manage", "pos.product.setPrice"] as const; // POS P5.2 ▸ fix F (F9) ◂
async function sessionCtx(args: unknown, readOnly = false): Promise<CatalogCtx | PriceActionRefusal> {
  const auth = await requireTenant();
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  if (!systemId) return { ok: false, code: "NOT_FOUND", message: "ไม่พบรายการนี้ในระบบขาย" };
  const m = posMembership(auth.active);
  // POS P2.11 ▸ ตัวอ่าน (เทียบราคาสาขา) — สาขาที่เข้าได้ ตัดสินใน catalog.ts ◂
  // POS P5.2 ▸ fix F (F9): ต้องมีคีย์ POS ที่เห็นราคาอยู่แล้ว (ขาย/ดูบิล/จัดการสินค้า/ตั้งราคา) · ระดับบทบาท (MANAGER ผ่าน) — สมาชิกที่ไม่มีคีย์ POS = ปฏิเสธ ◂
  if (readOnly) {
    if (!PRICE_READ_ACTIONS.some((action) => evaluate(m, { module: "pos", action }))) {
      return { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ดูราคาในระบบขาย — ขอสิทธิ์จากเจ้าของร้าน" };
    }
    return { tenantId: auth.active.tenantId, systemId, actorUserId: auth.user.id };
  }
  try {
    // ระดับบทบาท (ไม่ระบุสาขา): MANAGER ผ่าน · STAFF ต้องมี pos.product.setPrice — ขอบเขตสาขาต่อแถวตัดสินใน catalog.ts
    assertCan(m, { module: "pos", action: "pos.product.setPrice" });
  } catch {
    return { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ตั้งราคา — ขอสิทธิ์จากเจ้าของร้าน" };
  }
  return { tenantId: auth.active.tenantId, systemId, actorUserId: auth.user.id };
}

/**
 * R2 — แทนแถวราคาตามช่องทาง/สาขาของสินค้า 1 รายการทั้งชุด (≤ 60 แถว · คีย์ตรงตัว) → แถวหลังบันทึก (เรียงคงที่)
 * ปฏิเสธ: VALIDATION · PERMISSION_DENIED · NOT_FOUND · BUSY · CONFLICT · INTERNAL
 */
export async function setChannelPricesAction(args: {
  systemId: string;
  productId: string;
  rows: ChannelPriceInputRow[];
  purgeDead?: boolean; // POS P2.11 ▸ fix1 มติ 2: ล้างแถวของช่องทาง/สาขาที่เลิกใช้ (ขอบเขตทั้งสินค้าเท่านั้น) ◂
  expectedRowsHash?: string; // POS HF-FU ▸ f3: ลายนิ้วมือของชุดที่โหลด (ไม่ตรง = CONFLICT) ◂
}): Promise<{ ok: true; productId: string; rows: Omit<ChannelPriceView, "channelId">[]; changed: boolean } | PriceActionRefusal> {
  try {
    const ctx = await sessionCtx(args);
    if ("ok" in ctx) return ctx;
    const r = await setChannelPrices(ctx, { productId: args?.productId, rows: args?.rows, ...(args?.purgeDead !== undefined ? { purgeDead: args.purgeDead } : {}), ...(args?.expectedRowsHash !== undefined ? { expectedRowsHash: args.expectedRowsHash } : {}) }); // POS HF-FU ▸ f3 ◂
    return { ok: true, productId: r.productId, rows: r.rows.map((x) => ({ channelCode: x.channelCode, unitId: x.unitId, priceSatang: x.priceSatang, notSold: x.notSold })), changed: r.changed };
  } catch (e) {
    unstable_rethrow(e);
    return refusalOf("setChannelPricesAction", e);
  }
}

/**
 * CD6 — ตั้งราคาช่องทาง = ฐาน × (1 + bp) ปัดครั้งเดียว ทีละสินค้า (productIds ≤ 500 หรือ categoryId อย่างใดอย่างหนึ่ง) →
 * {written, skipped, productIds} · แถว "ไม่ขาย" เดิมของ (ช่องทาง, สาขา) นั้นคงไว้และนับเป็น skipped
 */
export async function bulkChannelMarkupAction(args: {
  systemId: string;
  channelCode: string;
  unitId: string | null;
  markupBp: number;
  roundTo: 1 | 100;
  productIds?: string[];
  categoryId?: string;
}): Promise<{ ok: true; written: number; skipped: number; productIds: string[] } | PriceActionRefusal> {
  try {
    const ctx = await sessionCtx(args);
    if ("ok" in ctx) return ctx;
    const a = args ?? ({} as typeof args);
    const input: Parameters<typeof bulkChannelMarkup>[1] = { channelCode: a.channelCode, unitId: a.unitId ?? null, markupBp: a.markupBp, roundTo: a.roundTo };
    if (a.productIds !== undefined) input.productIds = a.productIds;
    if (a.categoryId !== undefined) input.categoryId = a.categoryId;
    const r = await bulkChannelMarkup(ctx, input);
    return { ok: true, written: r.written, skipped: r.skipped, productIds: r.productIds };
  } catch (e) {
    unstable_rethrow(e);
    return refusalOf("bulkChannelMarkupAction", e);
  }
}

// ═══════════ POS P2.11 ▸ คัดลอก/เทียบราคาสาขา (brief P2.11 §1 F5 · P2.11U จอ 06 "คัดลอกราคาจากสาขา" / "ขายที่ 2 สาขา") ◂ ═══════════

/**
 * F5 — คัดลอกแถวราคาของสาขาต้นทาง → ปลายทาง (overwrite false = ข้ามแถวที่ปลายทางมีอยู่แล้ว) → {changed, written, skipped, productIds}
 * ปฏิเสธ: VALIDATION (field fromUnitId/toUnitId/productIds · reason PRICE_ROW_DEAD/BULK_TOO_MANY) · PERMISSION_DENIED (ตั้งราคาที่ปลายทางไม่ได้) · NOT_FOUND · BUSY · INTERNAL
 */
export async function copyUnitPricesAction(args: {
  systemId: string;
  fromUnitId: string;
  toUnitId: string;
  overwrite: boolean;
  productIds?: string[];
}): Promise<{ ok: true; changed: boolean; written: number; skipped: number; productIds: string[] } | PriceActionRefusal> {
  try {
    const ctx = await sessionCtx(args);
    if ("ok" in ctx) return ctx;
    const a = args ?? ({} as typeof args);
    const input: Parameters<typeof copyUnitPrices>[1] = { fromUnitId: a.fromUnitId, toUnitId: a.toUnitId, overwrite: a.overwrite };
    if (a.productIds !== undefined) input.productIds = a.productIds;
    const r = await copyUnitPrices(ctx, input);
    return { ok: true, changed: r.changed, written: r.written, skipped: r.skipped, productIds: r.productIds };
  } catch (e) {
    unstable_rethrow(e);
    return refusalOf("copyUnitPricesAction", e);
  }
}

/**
 * เทียบราคาสาขา (อ่านอย่างเดียว) — ราคาจริงต่อ สินค้า × สาขา × ช่องทาง (ทางเดียวกับหน้าขาย) · สาขาปริยาย = สาขาที่ผู้ใช้เข้าได้
 * ปฏิเสธ: VALIDATION · NOT_FOUND (สินค้า/สาขานอกขอบเขต) · INTERNAL
 */
export async function unitPriceMatrixAction(args: {
  systemId: string;
  productIds: string[];
  unitIds?: string[];
  channelCodes?: string[];
}): Promise<({ ok: true } & UnitPriceMatrix) | PriceActionRefusal> {
  try {
    const ctx = await sessionCtx(args, true);
    if ("ok" in ctx) return ctx;
    const a = args ?? ({} as typeof args);
    const input: Parameters<typeof unitPriceMatrix>[1] = { productIds: a.productIds };
    if (a.unitIds !== undefined) input.unitIds = a.unitIds;
    if (a.channelCodes !== undefined) input.channelCodes = a.channelCodes;
    const r = await unitPriceMatrix(ctx, input);
    return { ok: true, units: r.units, channelCodes: r.channelCodes, cells: r.cells };
  } catch (e) {
    unstable_rethrow(e);
    return refusalOf("unitPriceMatrixAction", e);
  }
}
