// QC — Shop refund (WO Wave2-A) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/modules/shop/service.ts:
//   refundOrder(ctx {tenantId, unitId}, orderId) → { ok, reason? }
//     · guard: เฉพาะ order สถานะ PAID (อื่น → ok:false + reason) · idempotent (refund ซ้ำไม่เบิ้ล)
//     · claim อะตอมมิก PAID→REFUNDED + refundedAt (ห้ามลบ order)
//     · กลับเส้นเงิน: pos.voidSale(posSaleId) → posSale VOIDED + outbox pos.sale.voided
//     · คืนสต็อก: วน line ที่ผูก invItem → inventory.receive (idempotencyKey `ecom-refund-<orderId>-<lineId>`)
//       ที่ต้นทุนปัจจุบัน → ต้นทุนถัวเฉลี่ยไม่เพี้ยน · เฉพาะ line ที่ผูก invItem จริง
//     · cross-tenant: ctx tenant อื่น → ok:false (guard tenantDb)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = ""; let tid2 = "";
try {
  const shop = (await import("@/lib/modules/shop/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null; // any จงใจ
  if (!shop || typeof shop.refundOrder !== "function") { chk("RF-0", "มี refundOrder ใน shop/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    // ── setup tenant 1 ──
    const t = await prisma.tenant.create({ data: { name: "QC RF", slug: `qc-rf-${Date.now()}` } }); tid = t.id;
    const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "ร้าน RF", slug: `rf-${Date.now()}` } });
    const posSys = await sys.createSystem(tid, "POS", "ขาย"); void posSys;
    const invSys = await sys.createSystem(tid, "INVENTORY", "คลัง");
    await prisma.paymentProfile.create({ data: { tenantId: tid, promptpayId: "0812345678", displayName: "ร้าน RF" } });
    const inv = (await import("@/lib/modules/inventory/service")) as unknown as { createItem: (c: unknown, i: unknown) => Promise<{ id: string }>; receive: (c: unknown, i: unknown) => Promise<unknown> };
    const invCtx = { tenantId: tid, systemId: invSys.id };
    const item = await inv.createItem(invCtx, { sku: "RF-01", name: "เสื้อยืด" });
    await inv.receive(invCtx, { itemId: item.id, qty: 50, costSatang: 8000, idempotencyKey: "rf-rc" });
    const ctx = { tenantId: tid, unitId: unit.id };
    const p1 = await shop.createProduct(ctx, { name: "เสื้อยืดดำ", priceSatang: 25000, invItemId: item.id });
    const p2 = await shop.createProduct(ctx, { name: "หมวก (ไม่ผูกคลัง)", priceSatang: 15000 });

    // ── happy: order → PAID → refund ──
    const od = await shop.createOrder(ctx, { customerName: "ลูกค้า", customerPhone: "0899999999", lines: [{ productId: p1.id, qty: 2 }, { productId: p2.id, qty: 1 }] });
    const cf = await shop.confirmOrderPaid(ctx, od.id);
    const saleId = cf.posSaleId as string;
    const stockAfterPaid = (await prisma.invItem.findUnique({ where: { id: item.id } }))?.onHand;
    chk("RF-1.0", "ก่อน refund: PAID + posSale + สต็อก 50→48", cf.ok === true && !!saleId && stockAfterPaid === 48, "PAID/48", `${cf.ok}/${stockAfterPaid}`);

    const rf = await shop.refundOrder(ctx, od.id);
    const afterRf = await prisma.shopOrder.findUnique({ where: { id: od.id as string } });
    const saleRf = await prisma.posSale.findUnique({ where: { id: saleId } });
    const stockRf = (await prisma.invItem.findUnique({ where: { id: item.id } }))?.onHand;
    const costRf = (await prisma.invItem.findUnique({ where: { id: item.id } }))?.costSatang;
    chk("RF-1.1", "refund ok:true", rf.ok === true, "true", JSON.stringify(rf));
    chk("RF-1.2", "order → REFUNDED + refundedAt ตั้ง (ไม่ลบ record)", afterRf?.status === "REFUNDED" && !!afterRf?.refundedAt, "REFUNDED+refundedAt", `${afterRf?.status}/${!!afterRf?.refundedAt}`);
    chk("RF-1.3", "posSale → VOIDED (กลับเส้นเงิน)", saleRf?.status === "VOIDED", "VOIDED", String(saleRf?.status));
    chk("RF-1.4", "outbox pos.sale.voided ≥1", (await prisma.outboxEvent.count({ where: { tenantId: tid, type: "pos.sale.voided" } })) >= 1, "≥1", "?");
    chk("RF-1.5", "คืนสต็อกกลับ 48→50 (เฉพาะ line ผูกคลัง)", stockRf === 50, "50", String(stockRf));
    chk("RF-1.6", "ต้นทุนถัวเฉลี่ยไม่เพี้ยน (8000)", costRf === 8000, "8000", String(costRf));
    chk("RF-1.7", "movement คืนสต็อก type IN idempotencyKey ผูก order+line (1 รายการ)", (await prisma.invMovement.count({ where: { tenantId: tid, type: "IN", idempotencyKey: { startsWith: `ecom-refund-${od.id}-` } } })) === 1, "1", "?");

    // ── idempotency: refund ซ้ำ ──
    const rf2 = await shop.refundOrder(ctx, od.id);
    const stock2 = (await prisma.invItem.findUnique({ where: { id: item.id } }))?.onHand;
    const voidCount = await prisma.outboxEvent.count({ where: { tenantId: tid, type: "pos.sale.voided" } });
    const inMoveCount = await prisma.invMovement.count({ where: { tenantId: tid, type: "IN", idempotencyKey: { startsWith: `ecom-refund-${od.id}-` } } });
    chk("RF-2.1", "refund ซ้ำ → ok:false (ไม่ทำซ้ำ)", rf2.ok === false, "false", JSON.stringify(rf2));
    chk("RF-2.2", "สต็อกไม่เบิ้ล (ยัง 50) + void outbox ไม่เพิ่ม + IN movement ยัง 1", stock2 === 50 && voidCount === 1 && inMoveCount === 1, "50/1/1", `${stock2}/${voidCount}/${inMoveCount}`);

    // ── guard: refund order ที่ยัง PENDING_PAYMENT ──
    const odP = await shop.createOrder(ctx, { customerName: "ยังไม่จ่าย", customerPhone: "0800000000", lines: [{ productId: p2.id, qty: 1 }] });
    const rfP = await shop.refundOrder(ctx, odP.id);
    const stillPending = (await prisma.shopOrder.findUnique({ where: { id: odP.id as string } }))?.status;
    chk("RF-3.1", "refund PENDING_PAYMENT → ok:false + order ยัง PENDING", rfP.ok === false && !!rfP.reason && stillPending === "PENDING_PAYMENT", "false+PENDING", `${rfP.ok}/${stillPending}`);

    // ── cross-tenant: refund order t1 ด้วย ctx t2 ──
    const t2 = await prisma.tenant.create({ data: { name: "QC RF2", slug: `qc-rf2-${Date.now()}` } }); tid2 = t2.id;
    const unit2 = await prisma.businessUnit.create({ data: { tenantId: tid2, type: "SHOP", name: "ร้านอื่น", slug: `rf2-${Date.now()}` } });
    await sys.createSystem(tid2, "POS", "ขาย");
    await prisma.paymentProfile.create({ data: { tenantId: tid2, promptpayId: "0899999999", displayName: "ร้านอื่น" } });
    const ctx2 = { tenantId: tid2, unitId: unit2.id };
    // order PAID ใน t1 (ก้อนใหม่) สำหรับทดสอบข้ามร้าน
    const odX = await shop.createOrder(ctx, { customerName: "ก", customerPhone: "0811111111", lines: [{ productId: p2.id, qty: 1 }] });
    await shop.confirmOrderPaid(ctx, odX.id);
    const rfCross = await shop.refundOrder(ctx2, odX.id); // ctx t2 บน order t1
    const odXStatus = (await prisma.shopOrder.findUnique({ where: { id: odX.id as string } }))?.status;
    chk("RF-4.1", "cross-tenant refund → ok:false + order t1 ยัง PAID (ไม่ถูกคืน)", rfCross.ok === false && odXStatus === "PAID", "false+PAID", `${rfCross.ok}/${odXStatus}`);
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 200) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: id }, data: { reversalOfId: null } }));
    for (const m of ["shopOrderLine", "shopOrder", "shopProduct", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "invMovement", "invLot", "invLocationStock", "invLocation", "invItem", "paymentProfile", "appNotification", "outboxEvent", "accountJournalLine", "accountJournalEntry", "couponRedemption", "pointLedger", "pointBalance", "pointSettings", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Shop Refund =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
