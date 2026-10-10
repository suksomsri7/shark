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
import { assertCan } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { CatalogError, bulkChannelMarkup, setChannelPrices, type CatalogCtx, type CatalogErrorCode } from "./catalog";
import type { ChannelPriceInputRow, ChannelPriceView } from "./price-shared";

type PriceActionRefusal = { ok: false; code: CatalogErrorCode | "INTERNAL"; message: string; field?: string };

function refusalOf(where: string, e: unknown): PriceActionRefusal {
  if (e instanceof CatalogError) return { ok: false, code: e.code, message: e.message };
  console.error(`[pos/catalog-price-actions] ${where}`, e);
  return { ok: false, code: "INTERNAL", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
}

/** session → CatalogCtx · ด่านแรกระดับบทบาท (pos.product.setPrice) — ขอบเขตต่อแถวตรวจซ้ำใน catalog.ts กับ DB */
async function sessionCtx(args: unknown): Promise<CatalogCtx | PriceActionRefusal> {
  const auth = await requireTenant();
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  if (!systemId) return { ok: false, code: "NOT_FOUND", message: "ไม่พบรายการนี้ในระบบขาย" };
  const m = posMembership(auth.active);
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
}): Promise<{ ok: true; productId: string; rows: Omit<ChannelPriceView, "channelId">[]; changed: boolean } | PriceActionRefusal> {
  try {
    const ctx = await sessionCtx(args);
    if ("ok" in ctx) return ctx;
    const r = await setChannelPrices(ctx, { productId: args?.productId, rows: args?.rows });
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
