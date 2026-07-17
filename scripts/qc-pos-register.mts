// QC Wave1-B — POS หน้าขาย (register/cashier): ชั้น resolve/catalog + createSale ผ่าน flow หน้าขาย
// persona: ร้านของชำ เปิดบิล walk-in เงินสด/พร้อมเพย์ · แนบสมาชิก · คูปอง · หลายจุดขาย
// รัน: pnpm exec tsx scripts/qc-pos-register.mts
//
// ขอบเขต (ไม่ทับ qc-pos-account ที่ทดสอบ engine บัญชีแล้ว):
//   - happy เงินสด → PAID + receiptNo
//   - พร้อมเพย์ (payMethod PROMPTPAY) → PAID เหมือนกัน
//   - idempotency: key เดิม 2 ครั้ง → 1 บิล
//   - catalog resolve: INVENTORY ผูก unit → posCatalog คืนสินค้า (ราคาขาย/ต้นทุน) · ไม่ผูก → null/ว่าง
//   - member resolve: MEMBER ผูก unit → posMembers คืนสมาชิก + สะสมแต้ม
//   - coupon flow: quote คิดส่วนลด → createSale ยอดสุทธิ → PAID + คูปองถูก redeem
//   - cross-tenant: ร้านอื่นเรียกไม่เห็น/ปฏิเสธ (posUnitIsLinked / catalog ไม่รั่ว)

try { process.loadEnvFile(".env"); } catch { /* CI ใช้ secrets ตรง ๆ */ }

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const pos = await import("@/lib/modules/pos/service");
const reg = await import("@/lib/modules/pos/register");
const coupon = await import("@/lib/modules/coupon/service");
const inventory = await import("@/lib/modules/inventory/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "MAJOR") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}

let tenantId = "";
let tenantBId = "";
try {
  console.log("── setup: ร้านของชำ (POS + คลัง + สมาชิก + คูปอง) ──");
  const t = await prisma.tenant.create({ data: { name: "QC POS-REG ร้านของชำ", slug: `qc-posreg-${Date.now()}` } });
  tenantId = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId, type: "BOOKING", name: "หน้าร้าน", slug: `front-${Date.now()}` } });
  const unit2 = await prisma.businessUnit.create({ data: { tenantId, type: "BOOKING", name: "สาขา 2 (ไม่มีคลัง)", slug: `br2-${Date.now()}` } });

  const posSys = await sys.createSystem(tenantId, "POS", "POS ร้านของชำ");
  const invSys = await sys.createSystem(tenantId, "INVENTORY", "คลังของชำ");
  const memSys = await sys.createSystem(tenantId, "MEMBER", "สมาชิกร้าน");
  const pointSys = await sys.createSystem(tenantId, "POINT", "แต้มร้าน");
  const cpnSys = await sys.createSystem(tenantId, "COUPON", "คูปองร้าน");
  const accSys = await sys.createSystem(tenantId, "ACCOUNT", "บัญชี (แค่ให้มี AccountProduct)");

  // ผูกทุกระบบเข้า unit เดียว (หน้าร้าน) · unit2 ผูกแค่ POS
  for (const s of [posSys.id, invSys.id, memSys.id, pointSys.id, cpnSys.id]) await sys.linkUnit(tenantId, s, unit.id);
  await sys.linkUnit(tenantId, posSys.id, unit2.id);

  // สินค้าในคลัง: 1 ตัวราคาจากต้นทุน · 1 ตัวราคาจาก AccountProduct.salePrice
  const it1 = await inventory.createItem({ tenantId, systemId: invSys.id }, { sku: "SKU-1", name: "น้ำเปล่า", costSatang: 700 });
  const it2 = await inventory.createItem({ tenantId, systemId: invSys.id }, { sku: "SKU-2", name: "ขนมปัง", costSatang: 1500, barcode: "8850001" });
  const ap = await prisma.accountProduct.create({ data: { tenantId, systemId: accSys.id, name: "ขนมปัง", salePrice: 2500 } });
  await prisma.invItem.update({ where: { id: it2.id }, data: { accountProductId: ap.id } });

  // ── catalog resolve ──
  console.log("\n── catalog / links resolve ──");
  const links = await reg.resolvePosLinks(tenantId, unit.id);
  chk("CAT-1", "resolve inventorySystemId ผูก unit", links.inventorySystemId === invSys.id, invSys.id, String(links.inventorySystemId), "CRITICAL");
  chk("CAT-2", "resolve pointSystemId ผูก unit", links.pointSystemId === pointSys.id, pointSys.id, String(links.pointSystemId));
  chk("CAT-3", "resolve couponSystemId ผูก unit", links.couponSystemId === cpnSys.id, cpnSys.id, String(links.couponSystemId));
  chk("CAT-4", "resolve memberSystemId ผูก unit", links.memberSystemId === memSys.id, memSys.id, String(links.memberSystemId));

  const cat = await reg.posCatalog(tenantId, invSys.id);
  chk("CAT-5", "posCatalog คืนสินค้าครบ 2 รายการ", cat.length === 2, "2", String(cat.length), "CRITICAL");
  const cNam = cat.find((c) => c.sku === "SKU-1");
  const cBread = cat.find((c) => c.sku === "SKU-2");
  chk("CAT-6", "ราคา fallback ต้นทุน (น้ำเปล่า=700)", cNam?.priceSatang === 700, "700", String(cNam?.priceSatang));
  chk("CAT-7", "ราคาจาก AccountProduct.salePrice (ขนมปัง=2500 ไม่ใช่ต้นทุน 1500)", cBread?.priceSatang === 2500, "2500", String(cBread?.priceSatang));

  const links2 = await reg.resolvePosLinks(tenantId, unit2.id);
  chk("CAT-8", "จุดขายไม่มีคลัง → inventorySystemId=null (catalog ว่าง)", links2.inventorySystemId === null, "null", String(links2.inventorySystemId));

  // ── member resolve ──
  const cust = await prisma.customer.create({ data: { tenantId, memberSystemId: memSys.id, name: "ลูกค้าประจำ", memberCode: `M-${Date.now()}` } });
  const mem = await reg.posMembers(tenantId, memSys.id);
  chk("MEM-1", "posMembers คืนสมาชิกในระบบที่ผูก unit", mem.some((m) => m.id === cust.id), "มี cust", String(mem.length));

  // ── happy เงินสด ──
  console.log("\n── ขายเงินสด ──");
  const key1 = `posreg-cash-${t.slug}`;
  const s1 = await pos.createSale({
    tenantId, unitId: unit.id, systemId: posSys.id, pointSystemId: links.pointSystemId ?? undefined,
    idempotencyKey: key1,
    lines: [{ name: cNam!.name, qty: 2, unitPriceSatang: cNam!.priceSatang }, { name: cBread!.name, qty: 1, unitPriceSatang: cBread!.priceSatang }],
    payMethods: [{ type: "CASH", amountSatang: 700 * 2 + 2500 }],
  });
  const db1 = await prisma.posSale.findUnique({ where: { id: s1.saleId } });
  chk("CASH-1", "บิลเงินสด status=PAID", db1?.status === "PAID", "PAID", String(db1?.status), "CRITICAL");
  chk("CASH-2", "มีเลขใบเสร็จ (receiptNo)", !!s1.receiptNo, "มีเลข", String(s1.receiptNo), "CRITICAL");
  chk("CASH-3", "grandTotal = 3900 สตางค์", s1.grandTotalSatang === 3900, "3900", String(s1.grandTotalSatang), "CRITICAL");

  // ── idempotency: key เดิม 2 ครั้ง → 1 บิล ──
  console.log("\n── idempotency ──");
  const s1b = await pos.createSale({
    tenantId, unitId: unit.id, systemId: posSys.id, idempotencyKey: key1,
    lines: [{ name: cNam!.name, qty: 2, unitPriceSatang: 700 }, { name: cBread!.name, qty: 1, unitPriceSatang: 2500 }],
    payMethods: [{ type: "CASH", amountSatang: 3900 }],
  });
  const cnt1 = await prisma.posSale.count({ where: { tenantId, idempotencyKey: key1 } });
  chk("IDEM-1", "key เดิม 2 ครั้ง → 1 บิล", cnt1 === 1 && s1b.saleId === s1.saleId, "1 บิล/id เดิม", `${cnt1} บิล`, "CRITICAL");

  // ── พร้อมเพย์ (PROMPTPAY) ──
  console.log("\n── ขายพร้อมเพย์ ──");
  const s2 = await pos.createSale({
    tenantId, unitId: unit.id, systemId: posSys.id, idempotencyKey: `posreg-pp-${t.slug}`,
    lines: [{ name: "รวมของ", qty: 1, unitPriceSatang: 5000 }],
    payMethods: [{ type: "PROMPTPAY", amountSatang: 5000 }],
  });
  const db2 = await prisma.posSale.findUnique({ where: { id: s2.saleId }, include: { payments: true } });
  chk("PP-1", "บิลพร้อมเพย์ status=PAID", db2?.status === "PAID", "PAID", String(db2?.status), "CRITICAL");
  chk("PP-2", "payment type=PROMPTPAY บันทึกถูก", db2?.payments[0]?.type === "PROMPTPAY", "PROMPTPAY", String(db2?.payments[0]?.type));

  // ── member สะสมแต้ม ──
  console.log("\n── ขายแนบสมาชิก → สะสมแต้ม ──");
  const s3 = await pos.createSale({
    tenantId, unitId: unit.id, systemId: posSys.id, pointSystemId: pointSys.id, memberId: cust.id,
    idempotencyKey: `posreg-mem-${t.slug}`,
    lines: [{ name: "ตะกร้าใหญ่", qty: 1, unitPriceSatang: 10000 }],
    payMethods: [{ type: "CASH", amountSatang: 10000 }],
  });
  chk("MEM-2", "ขายแนบสมาชิกได้แต้ม (>0)", s3.pointEarned > 0, ">0", String(s3.pointEarned));

  // ── coupon flow (mirror register: validate → createSale ยอดสุทธิ) ──
  console.log("\n── ขายพร้อมคูปอง ──");
  const cc = await coupon.createCoupon({ tenantId, systemId: cpnSys.id, code: "SAVE20", name: "ลด 20 บาท", type: "FIXED", valueSatang: 2000 });
  chk("CPN-0", "สร้างคูปองสำเร็จ", cc.ok, "ok", JSON.stringify(cc));
  const base = 8000; // subtotal
  const v = await coupon.validate({ code: "SAVE20", tenantId, systemId: cpnSys.id, memberId: null, amountSatang: base, unitId: unit.id });
  chk("CPN-1", "validate คูปองคืนส่วนลด 2000", v.ok && v.discountSatang === 2000, "2000", v.ok ? String(v.discountSatang) : "invalid");
  const grand = base - (v.ok ? v.discountSatang : 0);
  const s4 = await pos.createSale({
    tenantId, unitId: unit.id, systemId: posSys.id, idempotencyKey: `posreg-cpn-${t.slug}`,
    lines: [{ name: "สินค้ารวม", qty: 1, unitPriceSatang: base }],
    couponSystemId: cpnSys.id, couponCode: "SAVE20",
    payMethods: [{ type: "CASH", amountSatang: grand }],
  });
  chk("CPN-2", "ขายคูปอง grandTotal=6000 (8000-2000)", s4.grandTotalSatang === 6000, "6000", String(s4.grandTotalSatang), "CRITICAL");
  const redeemed = await prisma.couponRedemption.count({ where: { tenantId, systemId: cpnSys.id, refId: s4.saleId, status: "REDEEMED" } });
  chk("CPN-3", "คูปองถูก redeem ผูกกับบิล", redeemed === 1, "1", String(redeemed));

  // ── cross-tenant ──
  console.log("\n── cross-tenant guard ──");
  const tb = await prisma.tenant.create({ data: { name: "QC POS-REG ร้านคู่แข่ง", slug: `qc-posreg-b-${Date.now()}` } });
  tenantBId = tb.id;
  const unitB = await prisma.businessUnit.create({ data: { tenantId: tenantBId, type: "BOOKING", name: "ร้าน B", slug: `b-${Date.now()}` } });
  const posSysB = await sys.createSystem(tenantBId, "POS", "POS ร้าน B");
  await sys.linkUnit(tenantBId, posSysB.id, unitB.id);

  const okLinked = await reg.posUnitIsLinked(tenantId, posSys.id, unit.id);
  chk("XT-1", "posUnitIsLinked ของตัวเอง = true", okLinked === true, "true", String(okLinked), "CRITICAL");
  const crossUnit = await reg.posUnitIsLinked(tenantId, posSys.id, unitB.id);
  chk("XT-2", "unit ร้านอื่น → posUnitIsLinked=false", crossUnit === false, "false", String(crossUnit), "CRITICAL");
  const crossSys = await reg.posUnitIsLinked(tenantBId, posSys.id, unit.id);
  chk("XT-3", "ร้าน B ยิง posSystem ร้าน A → false", crossSys === false, "false", String(crossSys), "CRITICAL");
  const leak = await reg.posCatalog(tenantBId, invSys.id);
  chk("XT-4", "posCatalog ข้ามร้านไม่รั่ว (0 รายการ)", leak.length === 0, "0", String(leak.length), "CRITICAL");
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? e.message.slice(0, 160) : String(e), "CRITICAL");
} finally {
  for (const tid of [tenantId, tenantBId].filter(Boolean)) {
    const del = async (name: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (err) { console.log(`  ⚠ cleanup ${name}: ${err instanceof Error ? err.message.slice(0, 80) : err}`); }
    };
    await del("outbox", () => (prisma as never as { outboxEvent?: { deleteMany: (a: unknown) => Promise<unknown> } }).outboxEvent?.deleteMany({ where: { tenantId: tid } }) ?? Promise.resolve());
    await del("pointLedger", () => prisma.pointLedger.deleteMany({ where: { tenantId: tid } }));
    await del("memberActivity", () => prisma.memberActivity.deleteMany({ where: { tenantId: tid } }));
    await del("couponRedemption", () => prisma.couponRedemption.deleteMany({ where: { tenantId: tid } }));
    await del("coupon", () => prisma.coupon.deleteMany({ where: { tenantId: tid } }));
    await del("posPayment", () => prisma.posPayment.deleteMany({ where: { tenantId: tid } }));
    await del("posLine", () => prisma.posSaleLine.deleteMany({ where: { tenantId: tid } }));
    await del("posSale", () => prisma.posSale.deleteMany({ where: { tenantId: tid } }));
    await del("posCounter", () => prisma.posReceiptCounter.deleteMany({ where: { tenantId: tid } }));
    await del("invMovement", () => prisma.invMovement.deleteMany({ where: { tenantId: tid } }));
    await del("invLocationStock", () => prisma.invLocationStock.deleteMany({ where: { tenantId: tid } }));
    await del("invLot", () => prisma.invLot.deleteMany({ where: { tenantId: tid } }));
    await del("invLocation", () => prisma.invLocation.deleteMany({ where: { tenantId: tid } }));
    await del("invItem", () => prisma.invItem.deleteMany({ where: { tenantId: tid } }));
    await del("accountProduct", () => prisma.accountProduct.deleteMany({ where: { tenantId: tid } }));
    await del("customer", () => prisma.customer.deleteMany({ where: { tenantId: tid } }));
    await del("appSystemUnit", () => prisma.appSystemUnit.deleteMany({ where: { tenantId: tid } }));
    await del("appSystem", () => prisma.appSystem.deleteMany({ where: { tenantId: tid } }));
    await del("unit", () => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await del("tenant", () => prisma.tenant.delete({ where: { id: tid } }));
  }
  console.log("\n[cleanup] ลบ test tenant เรียบร้อย");
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC Wave1-B: POS หน้าขาย =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
