// E-commerce storefront (WO-0053) — catalog ต่อ unit · ออเดอร์ → เส้นเงินผ่าน pos.createSale (chokepoint C-2)
// นโยบายจ่ายเงิน v1: PromptPay QR (PaymentProfile ของร้าน) — ร้านกดยืนยันรับเงินเอง (ไม่มี bank API)
//
// ctx = { tenantId, unitId } — ทุก query ผ่าน tenantDb(ctx) (defense-in-depth ชั้น 2)
// เงินต้องเข้าเสมอ: ยืนยันรับเงิน = ปิดบิลผ่าน POS (บังคับ) → ตัดสต็อกผ่าน inventory (best-effort ข้ามเงียบถ้าไม่มี)
import { Prisma } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import * as pos from "@/lib/modules/pos/service";
import { normalizePartyPhone, safeFindOrCreate } from "@/lib/modules/party";
import * as inventory from "@/lib/modules/inventory/service";
import { listSystems } from "@/lib/modules/system/service";
import { promptpayPayload } from "@/lib/payment/promptpay";
import { resolvePublicUnit } from "@/lib/core/storefront";
// POS P1.1b ▸ G2: คำสั่งเขียน ShopProduct ย้ายไป catalog-legacy (ตารางเดิม + แคตตาล็อก POS ในธุรกรรมเดียว) — ตรวจ/ข้อความ/รูปผลลัพธ์อยู่ที่นี่ตามเดิม
import * as legacy from "@/lib/modules/pos/catalog-legacy";
// POS P2.8 ▸ ออเดอร์เว็บเข้าจอออเดอร์ของ POS (orders.ingestInTx ในธุรกรรมของ createOrder · ยกเลิก = orders.sourceCancelledInTx) +
//   ราคาหน้าเว็บอ่านสองทาง (catalog.webPricesForShop) — ผ่าน facade `@/lib/modules/pos` เท่านั้น (เส้น shop→pos · ไม่มี pos→shop) · เจ้าของ = เว็บร้าน (POS-OWNER-PENDING) ◂
import { catalog as posCatalog, orders } from "@/lib/modules/pos";

/** POS P1.1b R2 F9: actorUserId (ไม่บังคับ) = ผู้กระทำจริง → audit ของแคตตาล็อก */
export type ShopCtx = { tenantId: string; unitId: string; actorUserId?: string };

// resolve unit จาก slug (public/no-auth) → tenant+unit (ต้อง ACTIVE + type SHOP)
export async function resolveUnit(tenantSlug: string, unitSlug: string) {
  // คิวรีเดียว (เดิมยิง tenant แล้ว unit เรียงกัน = 2 round-trip ไปสิงคโปร์)
  return resolvePublicUnit(tenantSlug, unitSlug, "SHOP");
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

  const p = await prisma.$transaction((tx) =>
    legacy.createShopProduct(tx, {
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      name,
      priceSatang,
      description: input.description?.trim() || null,
      imageUrl: input.imageUrl?.trim() || null,
      invItemId: input.invItemId?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
    }, ctx.actorUserId),
  );
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

  await prisma.$transaction((tx) => legacy.updateShopProduct(tx, { tenantId: ctx.tenantId, unitId: ctx.unitId }, id, data, ctx.actorUserId));
  return { id };
}

export async function listProducts(ctx: ShopCtx, opts: { activeOnly?: boolean; storefront?: boolean } = {}) {
  const rows = await tenantDb(ctx).shopProduct.findMany({
    where: opts.activeOnly ? { active: true } : {},
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  // POS P2.8 ▸ R9 (CD 14): storefront = ราคาที่ลูกค้าเห็น/จ่ายจริง (แถว WEB ของแคตตาล็อก หรือราคา ShopProduct) · ไม่ส่ง = แถวดิบ (หน้าจัดการ + qc-shop เดิม)
  if (!opts.storefront || !rows.length) return rows;
  const web = await posCatalog.webPricesForShop({ tenantId: ctx.tenantId, unitId: ctx.unitId }, rows);
  return rows.map((r) => ({ ...r, priceSatang: web.get(r.id)?.priceSatang ?? r.priceSatang }));
  // ◂
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
  // ดึงสินค้าทั้งตะกร้าในคิวรีเดียว — เดิมยิงทีละชิ้นในลูป (ตะกร้า 20 ชิ้น = 20 round-trip ต่อ 1 ออเดอร์)
  const products = await db.shopProduct.findMany({
    where: { id: { in: [...new Set(rawLines.map((l) => l.productId))] } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  // POS P2.8 ▸ R9: ราคาที่ snapshot = ราคาหน้าเว็บ (อ่านสองทางเดียวกับ listProducts storefront) + ผูก ShopOrderLine.posProductId
  const webPrice = await posCatalog.webPricesForShop({ tenantId: ctx.tenantId, unitId: ctx.unitId }, products);
  // ◂
  const snap: { productId: string; posProductId: string | null; name: string; qty: number; unitPriceSatang: number; lineTotalSatang: number }[] = [];
  for (const l of rawLines) {
    const qty = Math.round(l.qty);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error("จำนวนสินค้าต้องมากกว่า 0");
    const product = byId.get(l.productId);
    if (!product || !product.active) throw new Error("ไม่พบสินค้า หรือสินค้าปิดการขายแล้ว");
    const unitPriceSatang = webPrice.get(product.id)?.priceSatang ?? product.priceSatang; // POS P2.8 ▸ R9 ◂
    snap.push({
      productId: product.id,
      posProductId: product.posProductId ?? null, // POS P2.8 ▸ R9 ◂
      name: product.name,
      qty,
      unitPriceSatang,
      lineTotalSatang: unitPriceSatang * qty,
    });
  }
  const totalSatang = snap.reduce((s, l) => s + l.lineTotalSatang, 0);
  const note = input.note?.trim() || null;

  // running code SO-0001 ต่อ unit — race: recount + retry เมื่อชน unique[unitId, code] (แบบ createPo)
  for (let attempt = 0; attempt < 6; attempt++) {
    const count = await db.shopOrder.count();
    const code = `SO-${String(count + 1).padStart(4, "0")}`;
    try {
      // POS P2.8 ▸ ธุรกรรมดิบ (ไม่ใช่ tenantDb): orders.ingestInTx อ่าน/เขียนตารางแกนระบบของ POS ในธุรกรรมเดียวกัน — tenantDb บังคับ systemId
      //   ที่บริบทเว็บร้านไม่มี · สองคำสั่งเดิมใส่ tenantId/unitId ใน data ตรง ๆ อยู่แล้ว (ผลเท่าเดิม) ◂
      const order = await prisma.$transaction(async (tx) => {
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
            posProductId: l.posProductId, // POS P2.8 ▸ R9 ◂
            name: l.name,
            qty: l.qty,
            unitPriceSatang: l.unitPriceSatang,
            lineTotalSatang: l.lineTotalSatang,
          })),
        });
        // POS P2.8 ▸ R4 WEB mirror: ออเดอร์เว็บเข้าจอออเดอร์ของ POS ในธุรกรรมเดียวกัน (ร้านไม่มี POS = ข้าม ไม่ throw) ·
        //   พักรับออเดอร์ออนไลน์ = ไม่สร้างอะไรเลย (มติ 12) · 86 = แจ้งลูกค้า · คำปฏิเสธอื่นก่อนเขียน = เว็บร้านยังรับออเดอร์ (ShopOrder เป็นต้นฉบับ · CD1) + log
        const mirrored = await orders.ingestInTx(tx, { tenantId: ctx.tenantId, unitId: ctx.unitId }, {
          channelCode: "WEB",
          externalRef: code,
          idempotencyKey: `web-${created.id}`,
          shopOrderId: created.id,
          // fix รอบ 3 (H5): ที่มาของราคา/รหัสกติกา/ราคาปกติจาก webPricesForShop ติดไปกับบรรทัด (รายงานโปรนับถูก)
          lines: snap.map((l) => (l.posProductId ? { productId: l.posProductId, name: l.name, unitPriceSatang: l.unitPriceSatang, qty: l.qty, ...webLineMeta(webPrice.get(l.productId)) } : { name: l.name, unitPriceSatang: l.unitPriceSatang, qty: l.qty })),
          customer: { name: customerName.slice(0, 100), phone: customerPhone.replace(/[^0-9+]/g, "").slice(0, 30) || null },
          fulfilment: "PICKUP",
          ...(note ? { note: note.slice(0, 500) } : {}),
          paymentState: "UNPAID",
        });
        if (mirrored.ok === false) {
          if (mirrored.code === "CHANNEL_PAUSED") throw new Error("ร้านปิดรับออเดอร์ออนไลน์ชั่วคราว");
          if (mirrored.code === "PRODUCT_UNAVAILABLE") throw new Error("สินค้าบางรายการหมดชั่วคราว — เอาออกแล้วสั่งใหม่");
          console.error(`[shop] createOrder: ไม่ได้ส่งออเดอร์เข้าจอ POS (${mirrored.code}) tenant=${ctx.tenantId}`);
        }
        // ◂
        return created;
      });
      await orders.afterCommit(); // POS P2.8 ▸ ระบายคิว pos.order.* ◂
      await linkPartyAfterCommit(ctx.tenantId, order.id, customerName, customerPhone); // CRM v2 C1.1 (C11)
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
/** POS P2.8 ▸ fix รอบ 3 (H1): ออเดอร์ในจอ POS ถูกร้านปฏิเสธ/ยกเลิกแล้ว — เว็บร้านไม่รับเงิน (rollback การ claim) ◂ */
class PosOrderClosedError extends Error {}
export async function confirmOrderPaid(ctx: ShopCtx, orderId: string, _actorUserId?: string): Promise<{ ok: boolean; posSaleId?: string; code?: "POS_ORDER_CLOSED" }> {
  const db = tenantDb(ctx);

  // POS P1.6 R2 F1 ▸ ด่าน POS ก่อน claim (O21): ไม่มี POS / ร้านมีหลาย POS แต่สาขานี้ไม่ผูก = โยนโดยไม่แตะออเดอร์ ◂
  const posGate = await pos.posSystemForSale(ctx.tenantId, ctx.unitId);
  if (!posGate.ok) throw new Error(posGate.code === "NO_POS" ? "เปิดระบบขาย (POS) ก่อนยืนยันรับเงิน" : posGate.message);

  // 1) claim อะตอมมิก: PENDING_PAYMENT → PAID (แพ้แข่ง/สถานะอื่น → ok:false, ไม่ทำเส้นเงินซ้ำ)
  // POS P2.8 ▸ fix รอบ 3 (H1): claim + สะท้อนการรับเงินเข้าออเดอร์ในจอ POS ในธุรกรรมเดียว (ไม่พึ่งคิว) — ร้านปฏิเสธ/ยกเลิกออเดอร์แล้ว
  //   ⇒ {ok:false, code "POS_ORDER_CLOSED"} ไม่มีอะไรถูกเขียน · ธุรกรรมดิบ (tenantDb บังคับ systemId ที่บริบทเว็บร้านไม่มี) กรองร้าน+สาขาเองแบบ tenantDb
  let claimed: "OK" | "LOST" | "POS_ORDER_CLOSED";
  try {
    claimed = await prisma.$transaction(async (tx) => {
      const c = await tx.shopOrder.updateMany({
        where: { id: orderId, tenantId: ctx.tenantId, unitId: ctx.unitId, status: "PENDING_PAYMENT" },
        data: { status: "PAID", paidAt: new Date() },
      });
      if (c.count === 0) return "LOST" as const;
      const m = await orders.webClaimInTx(tx, orderId, { tenantId: ctx.tenantId });
      if (m.ok === false) throw new PosOrderClosedError(m.code);
      return "OK" as const;
    });
  } catch (e) {
    if (!(e instanceof PosOrderClosedError)) throw e;
    claimed = "POS_ORDER_CLOSED";
  }
  if (claimed === "POS_ORDER_CLOSED") return { ok: false, code: "POS_ORDER_CLOSED" };
  if (claimed === "LOST") return { ok: false };
  // ◂

  const order = await db.shopOrder.findFirst({ where: { id: orderId } });
  const lines = await db.shopOrderLine.findMany({ where: { orderId } });
  if (!order) return { ok: false };

  // 2) POS ของบิล = ด่านก่อน claim ด้านบน (สาขาที่ผูก POS · หรือ POS ตัวเดียวของร้าน — P1.6 O21)
  const posSys = { id: posGate.systemId };
  const lineSrc = await orders.webLineSources(ctx.tenantId, orderId); // POS P2.8 ▸ ที่มาของราคาจากออเดอร์ในจอ POS (ไม่มี = CHANNEL) ◂
  // POS P2.8 ▸ fix รอบ 3 (H1): คืนการ claim = คืนออเดอร์ในจอ POS เป็นยังไม่จ่ายในธุรกรรมเดียวกัน (กรองร้าน+สาขาแบบ tenantDb)
  const revertClaim = () =>
    prisma.$transaction(async (tx) => {
      const r = await tx.shopOrder.updateMany({
        where: { id: orderId, tenantId: ctx.tenantId, unitId: ctx.unitId, status: "PAID", posSaleId: null },
        data: { status: "PENDING_PAYMENT", paidAt: null },
      });
      if (r.count > 0) await orders.webClaimRevertInTx(tx, orderId, { tenantId: ctx.tenantId });
    });
  // ◂

  // 3) เส้นเงิน C-2 — pos.createSale (idempotent ต่อ `ecom-<orderId>`)
  //   P1.6 R2 F1: createSale ปฏิเสธ (เช่น ยอด/คีย์/สต็อก) = ไม่มีบิล ⇒ คืนออเดอร์เป็นรอชำระเหมือนกรณีไม่มี POS แล้วโยนต่อ
  let sale: Awaited<ReturnType<typeof pos.createSale>>;
  try {
    sale = await pos.createSale({
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      systemId: posSys.id,
      sourceModule: "ECOM",
      sourceId: orderId,
      idempotencyKey: `ecom-${orderId}`,
      // POS P2.8 ▸ R9 (มติ 4): บรรทัดบอกสินค้าแคตตาล็อก + ที่มาของราคา — ไม่ส่ง itemId เด็ดขาด (สต็อกตัดที่ขั้น 4 ด้านล่างครั้งเดียว) ◂
      lines: lines.map((l) => ({ name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, ...saleLineSource(l, lineSrc) })),
      payMethods: [{ type: "PROMPTPAY", amountSatang: order.totalSatang }],
    });
  } catch (e) {
    // R4 H2: คืนออเดอร์เฉพาะเมื่อ "ไม่มีบิลของคีย์นี้จริง" — บิลที่ commit แล้ว (เช่น ล้มหลัง commit) ห้ามคืนเป็นรอชำระ
    if ((await pos.saleStatusByKey(ctx.tenantId, `ecom-${orderId}`)) === null) await revertClaim();
    throw e;
  }

  // M3.7 (ระบบสมาชิก v2 · §7.1 · D19) — ออเดอร์ชำระแล้ว → สมาชิก/แต้ม/ไทม์ไลน์ของลูกค้า (consumer ที่ composition root)
  // 🔴 ร้านค้าไม่รู้จักโมดูลสมาชิก — แค่ประกาศเหตุการณ์ · idempotencyKey ผูกออเดอร์ · ลง 3 ทะเบียนแล้ว
  //    `channel` = "SHOP" (หน้าร้านเว็บของร้านเอง) · ตัวเชื่อมตลาดออนไลน์ยิง SHOPEE/LAZADA/TIKTOK ด้วยรูปเดียวกัน
  // 🔴 AUDIT M12: event นี้ทำให้ลูกค้าได้ของมีค่า (สมาชิกใหม่ · แต้มของออเดอร์) ⇒ ต้องเขียนใน transaction
  //    เดียวกับการเปลี่ยนสถานะฝั่งออเดอร์ (ผูกบิล POS เข้าออเดอร์ = ขั้นที่ปิดงานจริง · core/outbox.ts:69-72)
  //    ของเดิมยิงหลังอัปเดตแบบแยกคำสั่ง: โปรเซสตายคั่นกลาง = เก็บเงินแล้วแต่ลูกค้าไม่เคยได้แต้ม
  await prisma.$transaction(async (tx) => {
    await tx.shopOrder.updateMany({ where: { id: orderId, tenantId: ctx.tenantId }, data: { posSaleId: sale.saleId } });
    await orders.webSaleBoundInTx(tx, orderId, sale.saleId, { tenantId: ctx.tenantId }); // POS P2.8 ▸ fix รอบ 3 (H1): ผูกบิล ECOM กับออเดอร์ในจอ POS ในธุรกรรมเดียวกัน ◂
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      systemId: posSys.id,
      type: "shop.order.paid",
      idempotencyKey: `shop.order.paid#${orderId}`,
      payload: {
        orderId,
        unitId: ctx.unitId,
        code: order.code,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        totalSatang: order.totalSatang,
        posSaleId: sale.saleId,
        channel: "SHOP",
      },
    });
  });

  // 4) ตัดสต็อก — เฉพาะ line ที่ product ผูก invItemId · ไม่มีระบบ INVENTORY/ไม่ผูก → ข้ามเงียบ
  const invSystems = await listSystems(ctx.tenantId, "INVENTORY");
  const invSys = invSystems[0];
  if (invSys) {
    const invCtx = { tenantId: ctx.tenantId, systemId: invSys.id };
    // ดึงสินค้าทุกบรรทัดครั้งเดียว (เดิมยิงต่อบรรทัดในลูป)
    const prods = await db.shopProduct.findMany({
      where: { id: { in: [...new Set(lines.map((l) => l.productId))] } },
      select: { id: true, invItemId: true },
    });
    const invItemOf = new Map(prods.map((p) => [p.id, p.invItemId]));
    for (const l of lines) {
      const invItemId = invItemOf.get(l.productId);
      if (!invItemId) continue;
      await inventory.consume(invCtx, {
        itemId: invItemId,
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

// POS P2.8 ▸ fix รอบ 3 (H5): ที่มาของราคาจาก webPricesForShop → บรรทัดออเดอร์ในจอ POS ◂
function webLineMeta(w: { priceSource: string; priceRuleId?: string | null; listPriceSatang?: number | null } | undefined): { priceSource?: string; priceRuleId?: string; listPriceSatang?: number } {
  if (!w) return {};
  return { priceSource: w.priceSource, ...(w.priceRuleId ? { priceRuleId: w.priceRuleId } : {}), ...(typeof w.listPriceSatang === "number" ? { listPriceSatang: w.listPriceSatang } : {}) };
}
// POS P2.8 ▸ R9 (มติ 4): สินค้าแคตตาล็อก + ที่มาของราคาของบรรทัดบิลเว็บร้าน — จับคู่กับบรรทัดของออเดอร์ในจอ POS (สินค้า + ราคาต่อหน่วย) ·
//   ไม่มีคู่ = CHANNEL (ราคาของช่องทางเว็บ ณ ตอนสั่ง) · ไม่มี posProductId (ออเดอร์ก่อน P2.8) = ไม่ส่ง (เหมือนเดิม) · ไม่มี itemId เสมอ
type WebLineSource = { productId: string; unitPriceSatang: number; priceSource: string | null; priceRuleId: string | null; listPriceSatang: number | null };
function saleLineSource(
  l: { posProductId: string | null; unitPriceSatang: number },
  src: WebLineSource[],
): { productId?: string; priceSource?: "BASE" | "BRANCH" | "CHANNEL" | "RULE" | "OPEN" | "CUSTOM" | "WEIGHED"; priceRuleId?: string; listPriceSatang?: number } {
  if (!l.posProductId) return {};
  const m = src.find((x) => x.productId === l.posProductId && x.unitPriceSatang === l.unitPriceSatang);
  const ps = (m?.priceSource ?? "CHANNEL") as "BASE" | "BRANCH" | "CHANNEL" | "RULE" | "OPEN" | "CUSTOM" | "WEIGHED";
  return { productId: l.posProductId, priceSource: ps, ...(m?.priceRuleId ? { priceRuleId: m.priceRuleId } : {}), ...(m && m.listPriceSatang !== null ? { listPriceSatang: m.listPriceSatang } : {}) };
}
// ◂

// ── คืนเงิน (คืนเงิน/ยกเลิกหลังชำระ) — void PosSale + คืนสต็อก (ห้ามลบ order) ──
// mirror ของ confirmOrderPaid: claim อะตอมมิก PAID→REFUNDED ก่อน แล้วกลับเส้นเงิน+คืนสต็อก (ทั้งคู่ idempotent)
// ไม่ห่อ $transaction เดียว: pos.voidSale / inventory.receive เปิด tx ของตัวเอง (แบบเดียวกับตอน confirm)
export async function refundOrder(ctx: ShopCtx, orderId: string): Promise<{ ok: boolean; reason?: string }> {
  const db = tenantDb(ctx);

  // 1) claim อะตอมมิก: PAID → REFUNDED (idempotent — refund ซ้ำ/สถานะอื่น → ok:false ไม่กลับเส้นเงินซ้ำ)
  const claim = await db.shopOrder.updateMany({
    where: { id: orderId, status: "PAID" },
    data: { status: "REFUNDED", refundedAt: new Date() },
  });
  if (claim.count === 0) {
    const cur = await db.shopOrder.findFirst({ where: { id: orderId } });
    if (!cur) return { ok: false, reason: "ไม่พบออเดอร์" };
    if (cur.status === "REFUNDED") return { ok: false, reason: "ออเดอร์นี้คืนเงินแล้ว" };
    if (cur.status === "PENDING_PAYMENT") return { ok: false, reason: "ออเดอร์นี้ยังไม่ได้รับเงิน (ใช้ปุ่มยกเลิกแทน)" };
    return { ok: false, reason: "คืนเงินได้เฉพาะออเดอร์ที่รับเงินแล้ว" };
  }

  const order = await db.shopOrder.findFirst({ where: { id: orderId } });
  const lines = await db.shopOrderLine.findMany({ where: { orderId } });
  if (!order) return { ok: false, reason: "ไม่พบออเดอร์" };

  // 2) กลับเส้นเงิน — void PosSale (บัญชี pos.sale.voided + คืนแต้ม + คูปอง + member spend)
  //    เฉพาะบิลที่ยัง PAID (กัน void ซ้ำ — เผื่อ retry หลัง crash กลางคัน)
  if (order.posSaleId) {
    const sale = await prisma.posSale.findFirst({ where: { id: order.posSaleId, tenantId: ctx.tenantId } });
    if (sale && sale.status === "PAID") {
      await pos.voidSale(ctx.tenantId, ctx.unitId, order.posSaleId);
    }
  }

  // 3) คืนสต็อก — mirror ของตอนตัด (consume) · idempotent ผ่าน receive idempotencyKey ผูก orderId+lineId
  //    คืนที่ "ต้นทุนปัจจุบัน" ของ item → ต้นทุนถัวเฉลี่ยไม่เพี้ยน (inCost = avg → avg คงเดิม)
  const invSystems = await listSystems(ctx.tenantId, "INVENTORY");
  const invSys = invSystems[0];
  if (invSys) {
    const invCtx = { tenantId: ctx.tenantId, systemId: invSys.id };
    const invDb = tenantDb(invCtx);
    // ดึงสินค้า + item ในคลังครั้งเดียว (เดิมยิง 2 คิวรีต่อบรรทัด)
    const prods = await db.shopProduct.findMany({
      where: { id: { in: [...new Set(lines.map((l) => l.productId))] } },
      select: { id: true, invItemId: true },
    });
    const invItemOf = new Map(prods.map((p) => [p.id, p.invItemId]));
    const items = await invDb.invItem.findMany({
      where: { id: { in: [...new Set([...invItemOf.values()].filter((v): v is string => !!v))] } },
      select: { id: true, costSatang: true },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));
    for (const l of lines) {
      const invItemId = invItemOf.get(l.productId);
      if (!invItemId) continue;
      const item = itemById.get(invItemId);
      if (!item) continue; // สินค้าในคลังถูกลบ → ไม่มีที่ให้คืน ข้ามเงียบ
      await inventory.receive(invCtx, {
        itemId: invItemId,
        qty: l.qty,
        costSatang: item.costSatang, // คืนที่ต้นทุนเดิม → ไม่กระทบต้นทุนถัวเฉลี่ย
        idempotencyKey: `ecom-refund-${orderId}-${l.id}`,
        sourceModule: "ECOM",
        refType: "ShopOrder",
        refId: orderId,
        note: `คืนสต็อกจากการคืนเงินออเดอร์ ${order.code}`,
      });
    }
  }

  // 4) แจ้งเตือนร้าน (best-effort — บัญชีกลับผ่าน pos.sale.voided แล้ว จึงไม่ให้ล้มการคืนเงิน)
  try {
    await db.appNotification.create({
      data: {
        tenantId: ctx.tenantId,
        title: "ออเดอร์ถูกคืนเงิน",
        body: `คืนเงินออเดอร์ ${order.code} (฿${(order.totalSatang / 100).toLocaleString("th-TH")}) เรียบร้อยแล้ว`,
      },
    });
  } catch {
    // แจ้งเตือนล้ม → ข้าม (เงินกลับเรียบร้อยแล้ว)
  }

  return { ok: true };
}

// ── ยกเลิก ──────────────────────────────────────────────────
export async function cancelOrder(ctx: ShopCtx, orderId: string): Promise<boolean> {
  // POS P2.8 ▸ R4: ยกเลิกออเดอร์รอชำระ + ออเดอร์ในจอ POS (ที่ยังไม่ปิด) → CANCELLED ในธุรกรรมเดียวกัน (คำสั่งเดิม: กรองร้าน+สาขาเหมือน tenantDb)
  const changed = await prisma.$transaction(async (tx) => {
    const res = await tx.shopOrder.updateMany({
      where: { id: orderId, tenantId: ctx.tenantId, unitId: ctx.unitId, status: "PENDING_PAYMENT" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (res.count > 0) await orders.sourceCancelledInTx(tx, { tenantId: ctx.tenantId, unitId: ctx.unitId }, { shopOrderId: orderId, reason: "เว็บร้านยกเลิกออเดอร์" });
    return res.count > 0;
  });
  if (changed) await orders.afterCommit();
  return changed;
  // ◂
}

export async function listOrders(ctx: ShopCtx, opts: { status?: "PENDING_PAYMENT" | "PAID" | "CANCELLED" | "REFUNDED" } = {}) {
  return tenantDb(ctx).shopOrder.findMany({
    where: opts.status ? { status: opts.status } : {},
    orderBy: { createdAt: "desc" },
    include: { lines: true },
    take: 200,
  });
}

// ───────── CRM v2 ใบ C1.1 (C11) — ผูก Party กลางให้ ShopOrder ─────────
// 🔴 เรียก "หลัง commit" เท่านั้น: รายการที่ล้ม (เต็ม/ชน/ไม่พบ) ต้องไม่ทิ้ง Party ของคนที่ไม่ได้เป็นลูกค้า (PDPA · เก็บเท่าที่จำเป็น)
//    และไม่ถือ connection ที่สองขณะ transaction ธุรกิจถือ lock อยู่
// 🔴 กุญแจต้องเชื่อถือได้: เบอร์ normalize ≥ 9 หลัก — ไม่งั้นไม่ผูก (party.findOrCreate สร้างใหม่ทุกครั้งเมื่อเบอร์ < 8 หลัก ⇒ Party ขยะ)
// 🔴 ไม่มีวัน throw เข้าหาผู้เรียก · ล้ม = ปล่อย partyId ว่างให้ backfill party-links เก็บตก
// AUDIT-CLASS X8: log แค่ชื่อตาราง + tenant ไม่มีเบอร์/อีเมล/ชื่อ
async function linkPartyAfterCommit(tenantId: string, id: string, name: string | null | undefined, phone: string | null | undefined): Promise<void> {
  try {
    const phoneOk = normalizePartyPhone(phone).length >= 9;
    if (!phoneOk) return;
    const partyId = await safeFindOrCreate(tenantId, { name: name?.trim() || "ลูกค้าไม่ระบุชื่อ", phone: phoneOk ? phone : null });
    if (partyId) await prisma.shopOrder.updateMany({ where: { id, tenantId, partyId: null }, data: { partyId } });
    else console.warn(`[party-link] ShopOrder tenant=${tenantId}: ไม่ได้ partyId — ปล่อยว่าง`);
  } catch {
    console.warn(`[party-link] ShopOrder tenant=${tenantId}: ผูก Party ไม่สำเร็จ — ปล่อยว่าง`);
  }
}
