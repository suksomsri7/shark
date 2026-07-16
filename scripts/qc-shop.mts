// QC — E-commerce storefront (WO-0053) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/modules/shop/service.ts (ctx {tenantId, unitId} — tenantDb ทุก query):
//   createProduct(ctx, { name, priceSatang, description?, imageUrl?, invItemId?, sortOrder? }) → {id}
//     · name ว่าง/priceSatang < 0 → throw ไทย
//   updateProduct(ctx, id, patch) · listProducts(ctx, { activeOnly?: boolean })
//   createOrder(ctx, { customerName, customerPhone, note?, lines: [{productId, qty}] }) → { id, code, totalSatang }
//     · lines ว่าง/qty ≤ 0/product ไม่มีหรือ inactive → throw ไทย
//     · snapshot ชื่อ+ราคาลง ShopOrderLine · code SO-0001 running ต่อ unit (กัน race: P2002 → recount เหมือน PO)
//     · status PENDING_PAYMENT
//   getOrderByCode(ctx, code) → order + lines | null   (หน้า public ใช้)
//   promptpayForOrder(ctx, orderId) → { payload, displayName } | null
//     · อ่าน PaymentProfile ของ tenant → ไม่มี promptpayId → null (ห้าม throw)
//     · payload = promptpayPayload({ id, amountSatang: totalSatang }) จาก src/lib/payment/promptpay.ts เดิม
//   confirmOrderPaid(ctx, orderId, actorUserId?) → { ok, posSaleId? }
//     · claim อะตอมมิก updateMany PENDING_PAYMENT→PAID + paidAt (แพ้แข่ง/สถานะอื่น → ok:false)
//     · เส้นเงิน C-2: เรียก pos.createSale (facade เดิม) — systemId = AppSystem type POS ตัวแรกของ tenant
//       idempotencyKey `ecom-<orderId>` · sourceModule "ECOM" · sourceId orderId · payMethods [{type:"PROMPTPAY", amountSatang: total}]
//       lines snapshot จาก order · เก็บ posSaleId ลง order
//     · ไม่มีระบบ POS → throw ไทย ("เปิดระบบขาย (POS) ก่อน...") — order ต้องยังเป็น PENDING_PAYMENT (revert)
//     · ตัดสต็อก: line ที่ product ผูก invItemId → inventory.consume (systemId = ระบบ INVENTORY ของ tenant ·
//       idempotencyKey `ecom-<orderId>-<lineId>` · sourceModule "ECOM" · refType "ShopOrder" refId orderId)
//       — ไม่มีระบบ INVENTORY หรือ product ไม่ผูก → ข้ามเงียบ ๆ (เงินต้องเข้าเสมอ)
//   cancelOrder(ctx, orderId) → boolean (PENDING_PAYMENT→CANCELLED เท่านั้น)
// public API: /api/store/[tenantSlug]/[unitSlug]/shop/order (POST สร้างออเดอร์ — rate limit ด้วย core checkRateLimit)
// public UI: /s/[tenantSlug]/[unitSlug]/shop (catalog+ตะกร้า+checkout) + /shop/order/[code] (สถานะ+QR)
// app UI: จัดการสินค้า+ออเดอร์+ปุ่มยืนยันรับเงิน (actions มี assertCan shop.*)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = ""; let tid2 = "";
try {
  const shop = (await import("@/lib/modules/shop/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null; // any จงใจ: oracle ล้ำหน้าโค้ด
  if (!shop) { chk("SH-0", "มี shop/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC SHOP", slug: `qc-shop-${Date.now()}` } }); tid = t.id;
    const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "ร้าน QC", slug: `shop-${Date.now()}` } });
    const posSys = await sys.createSystem(tid, "POS", "ขาย");
    const invSys = await sys.createSystem(tid, "INVENTORY", "คลัง");
    await prisma.paymentProfile.create({ data: { tenantId: tid, promptpayId: "0812345678", displayName: "ร้าน QC" } });
    const inv = (await import("@/lib/modules/inventory/service")) as unknown as { createItem: (c: unknown, i: unknown) => Promise<{ id: string }>; receive: (c: unknown, i: unknown) => Promise<unknown> };
    const invCtx = { tenantId: tid, systemId: invSys.id };
    const item = await inv.createItem(invCtx, { sku: "EC-01", name: "เสื้อยืด" });
    await inv.receive(invCtx, { itemId: item.id, qty: 50, costSatang: 8000, idempotencyKey: "ec-rc" });
    const ctx = { tenantId: tid, unitId: unit.id };

    // 1) catalog
    const p1 = await shop.createProduct(ctx, { name: "เสื้อยืดดำ", priceSatang: 25000, invItemId: item.id });
    const p2 = await shop.createProduct(ctx, { name: "หมวก", priceSatang: 15000 });
    const pOff = await shop.createProduct(ctx, { name: "ของเลิกขาย", priceSatang: 100 });
    await shop.updateProduct(ctx, pOff.id, { active: false });
    let threw = false; try { await shop.createProduct(ctx, { name: "", priceSatang: 100 }); } catch { threw = true; }
    chk("SH-1.1", "ชื่อว่าง → throw", threw, "throw", "?");
    chk("SH-1.2", "listProducts activeOnly เห็น 2 (ตัด inactive)", ((await shop.listProducts(ctx, { activeOnly: true })) as unknown[]).length === 2, "2", "?");

    // 2) order
    const od = await shop.createOrder(ctx, { customerName: "คุณลูกค้า", customerPhone: "0899999999", lines: [{ productId: p1.id, qty: 2 }, { productId: p2.id, qty: 1 }] });
    chk("SH-2.1", "createOrder: total 650 บาท + code SO- + PENDING_PAYMENT", od.totalSatang === 65000 && /^SO-\d{4}$/.test(od.code) && (await prisma.shopOrder.findUnique({ where: { id: od.id as string } }))?.status === "PENDING_PAYMENT", "65000/SO-xxxx", JSON.stringify(od).slice(0, 60));
    chk("SH-2.2", "line snapshot ชื่อ+ราคา 2 แถว", (await prisma.shopOrderLine.count({ where: { orderId: od.id as string } })) === 2 && (await prisma.shopOrderLine.findFirst({ where: { orderId: od.id as string, productId: p1.id as string } }))?.unitPriceSatang === 25000, "2 แถว/25000", "?");
    let th2 = false; try { await shop.createOrder(ctx, { customerName: "x", customerPhone: "1", lines: [{ productId: pOff.id, qty: 1 }] }); } catch { th2 = true; }
    let th3 = false; try { await shop.createOrder(ctx, { customerName: "x", customerPhone: "1", lines: [{ productId: p1.id, qty: 0 }] }); } catch { th3 = true; }
    chk("SH-2.3", "สินค้า inactive / qty 0 → throw ทั้งคู่", th2 && th3, "throw", `${th2}/${th3}`);
    const byCode = await shop.getOrderByCode(ctx, od.code);
    chk("SH-2.4", "getOrderByCode ได้ order+lines · code ปลอม → null", (byCode as { id?: string })?.id === od.id && Array.isArray((byCode as { lines?: unknown[] })?.lines) && (await shop.getOrderByCode(ctx, "SO-9999")) === null, "เจอ/null", "?");

    // 3) PromptPay
    const pp = await shop.promptpayForOrder(ctx, od.id);
    chk("SH-3.1", "promptpayForOrder: payload EMVCo (000201 + โอนแล้วห้ามแก้ยอด → มียอด 650.00)", typeof pp?.payload === "string" && pp.payload.startsWith("000201") && pp.payload.includes("650.00"), "000201+650.00", String(pp?.payload).slice(0, 40));

    // 4) ยืนยันรับเงิน → เส้นเงิน + ตัดสต็อก
    const cf = await shop.confirmOrderPaid(ctx, od.id);
    const after = await prisma.shopOrder.findUnique({ where: { id: od.id as string } });
    const sale = await prisma.posSale.findFirst({ where: { tenantId: tid, idempotencyKey: `ecom-${od.id}` } });
    chk("SH-4.1", "PAID + paidAt + PosSale เกิด (650 บาท PAID) + posSaleId เก็บ", cf.ok === true && after?.status === "PAID" && !!after?.paidAt && sale?.grandTotalSatang === 65000 && sale?.status === "PAID" && after?.posSaleId === sale?.id, "PAID/65000", `${after?.status}/${sale?.grandTotalSatang}`);
    chk("SH-4.2", "outbox pos.sale.paid ≥1 (เส้นเงิน C-2 เดิน)", (await prisma.outboxEvent.count({ where: { tenantId: tid, type: "pos.sale.paid" } })) >= 1, "≥1", "?");
    chk("SH-4.3", "สต็อกตัดเฉพาะ line ที่ผูก inv: เสื้อ 50→48", (await prisma.invItem.findUnique({ where: { id: item.id } }))?.onHand === 48, "48", String((await prisma.invItem.findUnique({ where: { id: item.id } }))?.onHand));
    chk("SH-4.4", "ยืนยันซ้ำ → ok:false + PosSale ไม่ซ้ำ (1 ใบ)", ((await shop.confirmOrderPaid(ctx, od.id)) as { ok: boolean }).ok === false && (await prisma.posSale.count({ where: { tenantId: tid, idempotencyKey: `ecom-${od.id}` } })) === 1, "false/1", "?");

    // 5) cancel + ไม่มีระบบ POS
    const od2 = await shop.createOrder(ctx, { customerName: "ข", customerPhone: "2", lines: [{ productId: p2.id, qty: 1 }] });
    chk("SH-5.1", "cancelOrder PENDING→CANCELLED · ยืนยันหลัง cancel → false", (await shop.cancelOrder(ctx, od2.id)) === true && ((await shop.confirmOrderPaid(ctx, od2.id)) as { ok: boolean }).ok === false, "true/false", "?");
    const t2 = await prisma.tenant.create({ data: { name: "QC SHOP2", slug: `qc-shop2-${Date.now()}` } }); tid2 = t2.id;
    const unit2 = await prisma.businessUnit.create({ data: { tenantId: tid2, type: "SHOP", name: "ร้านไม่มี POS", slug: `shop2-${Date.now()}` } });
    const ctx2 = { tenantId: tid2, unitId: unit2.id };
    const p3 = await shop.createProduct(ctx2, { name: "ของ", priceSatang: 1000 });
    const od3 = await shop.createOrder(ctx2, { customerName: "ค", customerPhone: "3", lines: [{ productId: p3.id, qty: 1 }] });
    let posThrew = false; try { await shop.confirmOrderPaid(ctx2, od3.id); } catch (e) { posThrew = /POS|ระบบขาย/.test(e instanceof Error ? e.message : ""); }
    chk("SH-5.2", "ไม่มีระบบ POS → throw ไทย + order ยัง PENDING_PAYMENT", posThrew && (await prisma.shopOrder.findUnique({ where: { id: od3.id as string } }))?.status === "PENDING_PAYMENT", "throw+PENDING", "?");
    chk("SH-5.3", "ไม่มี PaymentProfile → promptpayForOrder null ไม่ throw", (await shop.promptpayForOrder(ctx2, od3.id)) === null, "null", "?");

    // 6) isolation
    chk("SH-6.1", "tenant อื่นไม่เห็นสินค้า (guard)", ((await shop.listProducts(ctx2, {})) as unknown[]).length === 1, "1 (ของตัวเอง)", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    for (const m of ["shopOrderLine", "shopOrder", "shopProduct", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "invMovement", "invLot", "invLocationStock", "invLocation", "invItem", "paymentProfile", "appNotification", "outboxEvent", "accountJournalLine", "accountJournalEntry", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC E-commerce =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
