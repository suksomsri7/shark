// E-commerce storefront (WO-0053) — catalog ต่อ unit · ออเดอร์ → เส้นเงินผ่าน pos.createSale (chokepoint C-2)
// นโยบายจ่ายเงิน v1: PromptPay QR (PaymentProfile ของร้าน) — ร้านกดยืนยันรับเงินเอง (ไม่มี bank API)
//
// ctx = { tenantId, unitId } — ทุก query ผ่าน tenantDb(ctx) (defense-in-depth ชั้น 2)
// เงินต้องเข้าเสมอ: ยืนยันรับเงิน = ปิดบิลผ่าน POS (บังคับ) → ตัดสต็อกผ่าน inventory (best-effort ข้ามเงียบถ้าไม่มี)
import { Prisma } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import * as pos from "@/lib/modules/pos/service";
import * as inventory from "@/lib/modules/inventory/service";
import { listSystems } from "@/lib/modules/system/service";
import { promptpayPayload } from "@/lib/payment/promptpay";

export type ShopCtx = { tenantId: string; unitId: string };

// resolve unit จาก slug (public/no-auth) → tenant+unit (ต้อง ACTIVE + type SHOP)
export async function resolveUnit(tenantSlug: string, unitSlug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant || tenant.status !== "ACTIVE") return null;
  const unit = await prisma.businessUnit.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug: unitSlug } },
  });
  if (!unit || unit.status !== "ACTIVE" || unit.type !== "SHOP") return null;
  return { tenant, unit };
}

// รายการสินค้าคลัง (สำหรับ dropdown ผูก invItemId ในหน้าจัดการ) — ไม่มีระบบคลัง → []
export async function listInventoryItems(tenantId: string): Promise<{ id: string; name: string; sku: string }[]> {
  const invSystems = await listSystems(tenantId, "INVENTORY");
  const invSys = invSystems[0];
  if (!invSys) return [];
  const items = await inventory.listItems({ tenantId, systemId: invSys.id });
  return items.map((i) => ({ id: i.id, name: i.name, sku: i.sku }));
}

// ── สินค้า (catalog) ─────────────────────────────────────────
export type CreateProductInput = {
  name: string;
  priceSatang: number;
  description?: string | null;
  imageUrl?: string | null;
  invItemId?: string | null;
  sortOrder?: number;
};

export async function createProduct(ctx: ShopCtx, input: CreateProductInput): Promise<{ id: string }> {
  const name = input.name?.trim();
  if (!name) throw new Error("กรุณาระบุชื่อสินค้า");
  const priceSatang = Math.round(input.priceSatang);
  if (!Number.isFinite(priceSatang) || priceSatang < 0) throw new Error("ราคาสินค้าต้องไม่ติดลบ");

  const p = await tenantDb(ctx).shopProduct.create({
    data: {
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      name,
      priceSatang,
      description: input.description?.trim() || null,
      imageUrl: input.imageUrl?.trim() || null,
      invItemId: input.invItemId?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  return { id: p.id };
}

export type UpdateProductPatch = Partial<{
  name: string;
  priceSatang: number;
  description: string | null;
  imageUrl: string | null;
  invItemId: string | null;
  active: boolean;
  sortOrder: number;
}>;

export async function updateProduct(ctx: ShopCtx, id: string, patch: UpdateProductPatch): Promise<{ id: string }> {
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name?.trim();
    if (!name) throw new Error("กรุณาระบุชื่อสินค้า");
    data.name = name;
  }
  if (patch.priceSatang !== undefined) {
    const priceSatang = Math.round(patch.priceSatang);
    if (!Number.isFinite(priceSatang) || priceSatang < 0) throw new Error("ราคาสินค้าต้องไม่ติดลบ");
    data.priceSatang = priceSatang;
  }
  if (patch.description !== undefined) data.description = patch.description?.trim() || null;
  if (patch.imageUrl !== undefined) data.imageUrl = patch.imageUrl?.trim() || null;
  if (patch.invItemId !== undefined) data.invItemId = patch.invItemId?.trim() || null;
  if (patch.active !== undefined) data.active = patch.active;
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;

  await tenantDb(ctx).shopProduct.updateMany({ where: { id }, data });
  return { id };
}

export async function listProducts(ctx: ShopCtx, opts: { activeOnly?: boolean } = {}) {
  return tenantDb(ctx).shopProduct.findMany({
    where: opts.activeOnly ? { active: true } : {},
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

// ── ออเดอร์ ─────────────────────────────────────────────────
export type OrderLineInput = { productId: string; qty: number };
export type CreateOrderInput = {
  customerName: string;
  customerPhone: string;
  note?: string | null;
  lines: OrderLineInput[];
};

export async function createOrder(ctx: ShopCtx, input: CreateOrderInput): Promise<{ id: string; code: string; totalSatang: number }> {
  const rawLines = input.lines ?? [];
  if (rawLines.length === 0) throw new Error("ต้องมีสินค้าอย่างน้อย 1 รายการ");
  const customerName = input.customerName?.trim();
  if (!customerName) throw new Error("กรุณาระบุชื่อผู้สั่ง");
  const customerPhone = input.customerPhone?.trim();
  if (!customerPhone) throw new Error("กรุณาระบุเบอร์โทร");

  const db = tenantDb(ctx);

  // validate + snapshot ชื่อ/ราคา ณ ตอนสั่ง
  const snap: { productId: string; name: string; qty: number; unitPriceSatang: number; lineTotalSatang: number }[] = [];
  for (const l of rawLines) {
    const qty = Math.round(l.qty);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error("จำนวนสินค้าต้องมากกว่า 0");
    const product = await db.shopProduct.findFirst({ where: { id: l.productId } });
    if (!product || !product.active) throw new Error("ไม่พบสินค้า หรือสินค้าปิดการขายแล้ว");
    snap.push({
      productId: product.id,
      name: product.name,
      qty,
      unitPriceSatang: product.priceSatang,
      lineTotalSatang: product.priceSatang * qty,
    });
  }
  const totalSatang = snap.reduce((s, l) => s + l.lineTotalSatang, 0);
  const note = input.note?.trim() || null;

  // running code SO-0001 ต่อ unit — race: recount + retry เมื่อชน unique[unitId, code] (แบบ createPo)
  for (let attempt = 0; attempt < 6; attempt++) {
    const count = await db.shopOrder.count();
    const code = `SO-${String(count + 1).padStart(4, "0")}`;
    try {
      const order = await db.$transaction(async (tx) => {
        const created = await tx.shopOrder.create({
          data: {
            tenantId: ctx.tenantId,
            unitId: ctx.unitId,
            code,
            status: "PENDING_PAYMENT",
            customerName,
            customerPhone,
            note,
            totalSatang,
          },
        });
        await tx.shopOrderLine.createMany({
          data: snap.map((l) => ({
            tenantId: ctx.tenantId,
            orderId: created.id,
            productId: l.productId,
            name: l.name,
            qty: l.qty,
            unitPriceSatang: l.unitPriceSatang,
            lineTotalSatang: l.lineTotalSatang,
          })),
        });
        return created;
      });
      return { id: order.id, code: order.code, totalSatang };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new Error("สร้างออเดอร์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
}

export async function getOrderByCode(ctx: ShopCtx, code: string) {
  return tenantDb(ctx).shopOrder.findFirst({ where: { code }, include: { lines: true } });
}

// ── PromptPay ────────────────────────────────────────────────
export async function promptpayForOrder(ctx: ShopCtx, orderId: string): Promise<{ payload: string; displayName: string } | null> {
  const db = tenantDb(ctx);
  const order = await db.shopOrder.findFirst({ where: { id: orderId } });
  if (!order) return null;
  const profile = await db.paymentProfile.findFirst({ where: {} });
  if (!profile?.promptpayId) return null;
  const payload = promptpayPayload({ id: profile.promptpayId, amountSatang: order.totalSatang });
  return { payload, displayName: profile.displayName ?? "" };
}

// ── ยืนยันรับเงิน (หัวใจ) — ปิดบิลผ่าน POS + ตัดสต็อก ──────────
export async function confirmOrderPaid(ctx: ShopCtx, orderId: string, _actorUserId?: string): Promise<{ ok: boolean; posSaleId?: string }> {
  const db = tenantDb(ctx);

  // 1) claim อะตอมมิก: PENDING_PAYMENT → PAID (แพ้แข่ง/สถานะอื่น → ok:false, ไม่ทำเส้นเงินซ้ำ)
  const claim = await db.shopOrder.updateMany({
    where: { id: orderId, status: "PENDING_PAYMENT" },
    data: { status: "PAID", paidAt: new Date() },
  });
  if (claim.count === 0) return { ok: false };

  const order = await db.shopOrder.findFirst({ where: { id: orderId } });
  const lines = await db.shopOrderLine.findMany({ where: { orderId } });
  if (!order) return { ok: false };

  // 2) หา AppSystem type POS ตัวแรกของ tenant — ไม่มี = revert แล้วโยน (เงินเข้าไม่ได้ถ้าไม่มีจุดตัดเงิน)
  const posSystems = await listSystems(ctx.tenantId, "POS");
  const posSys = posSystems[0];
  if (!posSys) {
    await db.shopOrder.updateMany({
      where: { id: orderId, status: "PAID", posSaleId: null },
      data: { status: "PENDING_PAYMENT", paidAt: null },
    });
    throw new Error("เปิดระบบขาย (POS) ก่อนยืนยันรับเงิน");
  }

  // 3) เส้นเงิน C-2 — pos.createSale (idempotent ต่อ `ecom-<orderId>`)
  const sale = await pos.createSale({
    tenantId: ctx.tenantId,
    unitId: ctx.unitId,
    systemId: posSys.id,
    sourceModule: "ECOM",
    sourceId: orderId,
    idempotencyKey: `ecom-${orderId}`,
    lines: lines.map((l) => ({ name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang })),
    payMethods: [{ type: "PROMPTPAY", amountSatang: order.totalSatang }],
  });

  await db.shopOrder.updateMany({ where: { id: orderId }, data: { posSaleId: sale.saleId } });

  // 4) ตัดสต็อก — เฉพาะ line ที่ product ผูก invItemId · ไม่มีระบบ INVENTORY/ไม่ผูก → ข้ามเงียบ
  const invSystems = await listSystems(ctx.tenantId, "INVENTORY");
  const invSys = invSystems[0];
  if (invSys) {
    const invCtx = { tenantId: ctx.tenantId, systemId: invSys.id };
    for (const l of lines) {
      const product = await db.shopProduct.findFirst({ where: { id: l.productId } });
      if (!product?.invItemId) continue;
      await inventory.consume(invCtx, {
        itemId: product.invItemId,
        qty: l.qty,
        idempotencyKey: `ecom-${orderId}-${l.id}`,
        sourceModule: "ECOM",
        refType: "ShopOrder",
        refId: orderId,
      });
    }
  }

  return { ok: true, posSaleId: sale.saleId };
}

// ── ยกเลิก ──────────────────────────────────────────────────
export async function cancelOrder(ctx: ShopCtx, orderId: string): Promise<boolean> {
  const res = await tenantDb(ctx).shopOrder.updateMany({
    where: { id: orderId, status: "PENDING_PAYMENT" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  return res.count > 0;
}

export async function listOrders(ctx: ShopCtx, opts: { status?: "PENDING_PAYMENT" | "PAID" | "CANCELLED" } = {}) {
  return tenantDb(ctx).shopOrder.findMany({
    where: opts.status ? { status: opts.status } : {},
    orderBy: { createdAt: "desc" },
    include: { lines: true },
    take: 200,
  });
}
