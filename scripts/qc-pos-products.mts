// QC — POS หน้า "สินค้า/ราคา" (WO ส่วน B): ตั้งราคาขายต่อสินค้าในคลังที่ผูก POS
// persona: ร้านของชำตั้งราคาขายหน้าร้าน · ราคาขายเก็บที่ AccountProduct.salePrice (master data)
// รัน: pnpm exec tsx scripts/qc-pos-products.mts
//
// ตรวจ:
//   - listPosProducts คืนสินค้าในคลัง + ราคาขายปัจจุบัน + resolve inventory/account system
//   - setItemSalePrice (item ยังไม่ผูก AccountProduct) → สร้าง AccountProduct + ผูก InvItem + set salePrice
//   - register.posCatalog เห็นราคาใหม่ (ยืนยันว่าราคาไหลเข้าหน้าขาย)
//   - setItemSalePrice ซ้ำ (ผูกแล้ว) → update ตัวเดิม ไม่สร้างใหม่
//   - ไม่มีระบบบัญชี (ไม่มี AccountSystemLink) + item ยังไม่ผูก → ปฏิเสธสุภาพ (ok:false)
//   - แก้ราคาสินค้าที่ผูก AccountProduct ไว้แล้ว ได้แม้ POS ไม่ผูกบัญชี (รู้ productId ตรง)
//   - cross-tenant: ร้านอื่นตั้งราคา item ร้าน A ไม่ได้ / listPosProducts ไม่รั่ว

try { process.loadEnvFile(".env"); } catch { /* CI ใช้ secrets ตรง ๆ */ }

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const reg = await import("@/lib/modules/pos/register");
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
  console.log("── setup: ร้านของชำ (POS + คลัง + บัญชี ผูกกัน) ──");
  const t = await prisma.tenant.create({ data: { name: "QC POS-PROD ร้านของชำ", slug: `qc-posprod-${Date.now()}` } });
  tenantId = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId, type: "BOOKING", name: "หน้าร้าน", slug: `front-${Date.now()}` } });

  const posSys = await sys.createSystem(tenantId, "POS", "POS ร้านของชำ");
  const invSys = await sys.createSystem(tenantId, "INVENTORY", "คลังของชำ");
  const accSys = await sys.createSystem(tenantId, "ACCOUNT", "บัญชีร้าน");
  for (const s of [posSys.id, invSys.id]) await sys.linkUnit(tenantId, s, unit.id);
  // เชื่อม POS ↔ บัญชี (AccountSystemLink) → posAccountSystemId resolve ได้
  await prisma.accountSystemLink.create({
    data: { tenantId, systemId: accSys.id, linkedKind: "POS", linkedId: posSys.id },
  });

  // สินค้าในคลัง (ยังไม่ผูก AccountProduct)
  const it1 = await inventory.createItem({ tenantId, systemId: invSys.id }, { sku: "SKU-1", name: "น้ำเปล่า", costSatang: 700 });
  const it2 = await inventory.createItem({ tenantId, systemId: invSys.id }, { sku: "SKU-2", name: "ขนมปัง", costSatang: 1500 });

  // ── listPosProducts ──
  console.log("\n── listPosProducts ──");
  const l1 = await reg.listPosProducts(tenantId, posSys.id);
  chk("LIST-1", "resolve inventorySystemId ผูก POS", l1.inventorySystemId === invSys.id, invSys.id, String(l1.inventorySystemId), "CRITICAL");
  chk("LIST-2", "resolve accountSystemId (POS↔บัญชี)", l1.accountSystemId === accSys.id, accSys.id, String(l1.accountSystemId), "CRITICAL");
  chk("LIST-3", "คืนสินค้าครบ 2 รายการ", l1.items.length === 2, "2", String(l1.items.length), "CRITICAL");
  const r1 = l1.items.find((i) => i.sku === "SKU-1");
  chk("LIST-4", "สินค้ายังไม่ตั้งราคา → salePriceSatang=null", r1?.salePriceSatang === null, "null", String(r1?.salePriceSatang));
  chk("LIST-5", "มีต้นทุนติดมา (น้ำเปล่า=700)", r1?.costSatang === 700, "700", String(r1?.costSatang));

  // ── setItemSalePrice: item ยังไม่ผูก → สร้าง AccountProduct + ผูก + set ราคา ──
  console.log("\n── ตั้งราคาขาย (สร้าง AccountProduct ใหม่) ──");
  const set1 = await reg.setItemSalePrice(tenantId, posSys.id, it1.id, 1200);
  chk("SET-1", "ตั้งราคาสำเร็จ", set1.ok === true, "ok", JSON.stringify(set1), "CRITICAL");
  const item1 = await prisma.invItem.findUnique({ where: { id: it1.id }, select: { accountProductId: true } });
  chk("SET-2", "InvItem ถูกผูก accountProductId", !!item1?.accountProductId, "มี id", String(item1?.accountProductId), "CRITICAL");
  const ap1 = item1?.accountProductId ? await prisma.accountProduct.findUnique({ where: { id: item1.accountProductId } }) : null;
  chk("SET-3", "AccountProduct.salePrice = 1200", ap1?.salePrice === 1200, "1200", String(ap1?.salePrice), "CRITICAL");
  chk("SET-4", "AccountProduct.systemId = ระบบบัญชี", ap1?.systemId === accSys.id, accSys.id, String(ap1?.systemId));
  chk("SET-5", "AccountProduct ชื่อ = ชื่อสินค้าในคลัง", ap1?.name === "น้ำเปล่า", "น้ำเปล่า", String(ap1?.name));

  // ── register.posCatalog เห็นราคาใหม่ ──
  const cat = await reg.posCatalog(tenantId, invSys.id);
  const cWater = cat.find((c) => c.sku === "SKU-1");
  chk("CAT-1", "posCatalog เห็นราคาขายใหม่ (น้ำเปล่า=1200 ไม่ใช่ต้นทุน 700)", cWater?.priceSatang === 1200, "1200", String(cWater?.priceSatang), "CRITICAL");

  // ── setItemSalePrice ซ้ำ (ผูกแล้ว) → update ตัวเดิม ไม่สร้างใหม่ ──
  console.log("\n── แก้ราคาซ้ำ (update ตัวเดิม) ──");
  const before = await prisma.accountProduct.count({ where: { tenantId } });
  const set2 = await reg.setItemSalePrice(tenantId, posSys.id, it1.id, 1500);
  const after = await prisma.accountProduct.count({ where: { tenantId } });
  chk("SET-6", "แก้ราคาสำเร็จ", set2.ok === true, "ok", JSON.stringify(set2));
  chk("SET-7", "ไม่สร้าง AccountProduct ใหม่ (count เท่าเดิม)", before === after, String(before), String(after), "CRITICAL");
  const ap1b = item1?.accountProductId ? await prisma.accountProduct.findUnique({ where: { id: item1.accountProductId } }) : null;
  chk("SET-8", "salePrice อัปเดตเป็น 1500", ap1b?.salePrice === 1500, "1500", String(ap1b?.salePrice), "CRITICAL");
  chk("SET-9", "productId เดิม (ไม่เปลี่ยนตัว)", set2.ok && set2.productId === item1?.accountProductId, "เดิม", set2.ok ? set2.productId : "n/a");

  // ── ราคาติดลบ → ปฏิเสธ ──
  const setNeg = await reg.setItemSalePrice(tenantId, posSys.id, it2.id, -5);
  chk("NEG-1", "ราคาติดลบ → ok:false", setNeg.ok === false, "false", String(setNeg.ok));

  // ── ไม่มีระบบบัญชี + item ยังไม่ผูก → ปฏิเสธสุภาพ ──
  console.log("\n── POS ไม่เชื่อมบัญชี → ตั้งราคาสินค้าใหม่ไม่ได้ ──");
  const unit2 = await prisma.businessUnit.create({ data: { tenantId, type: "BOOKING", name: "สาขา 2", slug: `br2-${Date.now()}` } });
  const posSys2 = await sys.createSystem(tenantId, "POS", "POS สาขา 2 (ไม่เชื่อมบัญชี)");
  const invSys2 = await sys.createSystem(tenantId, "INVENTORY", "คลังสาขา 2");
  for (const s of [posSys2.id, invSys2.id]) await sys.linkUnit(tenantId, s, unit2.id);
  const it3 = await inventory.createItem({ tenantId, systemId: invSys2.id }, { sku: "SKU-3", name: "นม", costSatang: 2000 });
  const l2 = await reg.listPosProducts(tenantId, posSys2.id);
  chk("NOACC-1", "listPosProducts: accountSystemId=null (ไม่เชื่อมบัญชี)", l2.accountSystemId === null, "null", String(l2.accountSystemId));
  const set3 = await reg.setItemSalePrice(tenantId, posSys2.id, it3.id, 3000);
  chk("NOACC-2", "ตั้งราคาสินค้าใหม่โดยไม่มีบัญชี → ok:false", set3.ok === false, "false", String(set3.ok), "CRITICAL");
  chk("NOACC-3", "มีเหตุผลชี้ให้เปิดบัญชี", !set3.ok && /บัญชี/.test(set3.reason), "พูดถึงบัญชี", set3.ok ? "ok" : set3.reason);

  // ── แก้ราคาสินค้าที่ผูก AccountProduct ไว้แล้ว ได้แม้ POS ไม่ผูกบัญชี ──
  const apPre = await prisma.accountProduct.create({ data: { tenantId, systemId: accSys.id, name: "นม", salePrice: 2500 } });
  await inventory.linkAccountProduct({ tenantId, systemId: invSys2.id }, it3.id, apPre.id);
  const set4 = await reg.setItemSalePrice(tenantId, posSys2.id, it3.id, 2800);
  chk("NOACC-4", "แก้ราคาสินค้าที่ผูกไว้แล้ว → ok แม้ POS ไม่ผูกบัญชี", set4.ok === true, "ok", JSON.stringify(set4));
  const apPreAfter = await prisma.accountProduct.findUnique({ where: { id: apPre.id } });
  chk("NOACC-5", "salePrice อัปเดตเป็น 2800", apPreAfter?.salePrice === 2800, "2800", String(apPreAfter?.salePrice));

  // ── cross-tenant guard ──
  console.log("\n── cross-tenant guard ──");
  const tb = await prisma.tenant.create({ data: { name: "QC POS-PROD ร้านคู่แข่ง", slug: `qc-posprod-b-${Date.now()}` } });
  tenantBId = tb.id;
  const unitB = await prisma.businessUnit.create({ data: { tenantId: tenantBId, type: "BOOKING", name: "ร้าน B", slug: `b-${Date.now()}` } });
  const posSysB = await sys.createSystem(tenantBId, "POS", "POS ร้าน B");
  const invSysB = await sys.createSystem(tenantBId, "INVENTORY", "คลัง B");
  for (const s of [posSysB.id, invSysB.id]) await sys.linkUnit(tenantBId, s, unitB.id);

  // ร้าน B ตั้งราคา item ของร้าน A (it1) ผ่าน posSysB → ไม่พบสินค้า (scope กันข้าม)
  const xt = await reg.setItemSalePrice(tenantBId, posSysB.id, it1.id, 9999);
  chk("XT-1", "ร้าน B ตั้งราคา item ร้าน A → ok:false (ไม่พบ)", xt.ok === false, "false", String(xt.ok), "CRITICAL");
  const ap1c = await prisma.accountProduct.findUnique({ where: { id: item1!.accountProductId! } });
  chk("XT-2", "ราคาสินค้าร้าน A ไม่ถูกร้าน B แก้ (ยัง 1500)", ap1c?.salePrice === 1500, "1500", String(ap1c?.salePrice), "CRITICAL");
  const lB = await reg.listPosProducts(tenantBId, posSysB.id);
  chk("XT-3", "listPosProducts ร้าน B ไม่เห็นสินค้าร้าน A", lB.items.length === 0, "0", String(lB.items.length), "CRITICAL");
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? e.message.slice(0, 160) : String(e), "CRITICAL");
} finally {
  for (const tid of [tenantId, tenantBId].filter(Boolean)) {
    const del = async (name: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (err) { console.log(`  ⚠ cleanup ${name}: ${err instanceof Error ? err.message.slice(0, 80) : err}`); }
    };
    await del("accountSystemLink", () => prisma.accountSystemLink.deleteMany({ where: { tenantId: tid } }));
    await del("invMovement", () => prisma.invMovement.deleteMany({ where: { tenantId: tid } }));
    await del("invLocationStock", () => prisma.invLocationStock.deleteMany({ where: { tenantId: tid } }));
    await del("invLot", () => prisma.invLot.deleteMany({ where: { tenantId: tid } }));
    await del("invLocation", () => prisma.invLocation.deleteMany({ where: { tenantId: tid } }));
    await del("invItem", () => prisma.invItem.deleteMany({ where: { tenantId: tid } }));
    await del("accountProduct", () => prisma.accountProduct.deleteMany({ where: { tenantId: tid } }));
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
console.log("\n===== QC: POS สินค้า/ราคา =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
