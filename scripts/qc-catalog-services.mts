// QC — สินค้า/บริการ = แหล่งข้อมูลเดียว + หมวดหมู่/SKU/รูป (เจ้าของสั่งข้อ 12-17 · 13 ส.ค. 2026)
// ⚠️ Oracle ภายใต้ change control — Fable (Auditor) เป็นเจ้าของ
//
// สัญญาที่ต้องจริงเสมอ:
// [1] บริการอยู่ในแคตตาล็อกกลาง (InvItem kind=SERVICE) · หน้าสต็อกไม่เห็นบริการ (ไม่มีของให้นับ)
// [2] 🔴 บริการไม่มีสต็อก — รับเข้า/ตัด/ปรับ ต้องถูกปฏิเสธ (กันเผลอนับ "ค่าตัดผม" เป็นชิ้น)
// [3] จองคิวดึงบริการจากแคตตาล็อก: ติ๊กเปิด/ปิดรับจองต่อสาขา · แก้ราคาที่แคตตาล็อก → หน้าจองเห็นตาม
// [4] POS ดึงบริการจากแคตตาล็อกเดียวกัน (ไม่ใช่ของใครของมัน)
// [5] ย้ายบริการเก่าเข้าแคตตาล็อกได้ (idempotent) · 🔴 นัด/บิลเก่าไม่ถูกแตะ
// [6] แก้/เพิ่ม/ลบ ได้ที่ระบบสินค้า/บริการเท่านั้น — action ที่หน้าจอง/POS ถูกถอดออกจริง
// [7] SKU อัตโนมัติตามรูปแบบ + หมวดหมู่ (คำนำหน้าของหมวดชนะค่าระบบ) · ลบหมวดไม่ลบของ
// [8] รูป: ผูก/ลบ/ตั้งรูปหลักได้ · รับเฉพาะลิงก์ http(s) · ไม่รั่วข้ามร้าน
//
// รัน: pnpm exec tsx scripts/qc-catalog-services.mts
try { process.loadEnvFile(".env"); } catch { /* CI ใช้ secrets */ }

const { prisma } = await import("@/lib/core/db");
const { existsSync, readFileSync } = await import("node:fs");
const sys = await import("@/lib/modules/system/service");
const inv = await import("@/lib/modules/inventory/service");
const booking = await import("@/lib/modules/booking/service");
const register = await import("@/lib/modules/pos/register");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}
const dPlus = (n: number) => new Date(Date.now() + 7 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);

let tid = "";
let otherTid = "";
try {
  // ── [6] static: action สร้าง/แก้บริการที่หน้าอื่นถูกถอดออกจริง ──
  console.log("── แก้ได้ที่เดียว (static) ──");
  const posActions = readFileSync("src/lib/actions/pos.ts", "utf8");
  const bkActions = readFileSync("src/lib/actions/booking.ts", "utf8");
  chk("SS-1", "POS ไม่มี action เพิ่ม/แก้ราคา/ลบบริการแล้ว",
    !/export async function (addPosServiceAction|setPosServicePriceAction|removePosServiceAction)/.test(posActions),
    "ถอดออกแล้ว", "ยังมีอยู่");
  chk("SS-2", "จองคิวไม่มี action สร้าง/แก้/ลบบริการแล้ว",
    !/export async function (addServiceAction|editServiceAction|removeServiceAction)/.test(bkActions),
    "ถอดออกแล้ว", "ยังมีอยู่");
  chk("SS-3", "มีหน้าบริการ + หน้าตั้งค่าในระบบสินค้า/บริการ",
    existsSync("src/app/app/sys/[id]/inventory/services/page.tsx") &&
      existsSync("src/app/app/sys/[id]/inventory/settings/page.tsx"), "มีทั้งคู่", "ขาด");
  chk("SS-4", "หน้าจองคิวอ้าง serviceRoster + setServiceOfferedAction (ไม่มีฟอร์มสร้างบริการ)",
    /serviceRoster/.test(readFileSync("src/app/app/u/[unitSlug]/booking/services/page.tsx", "utf8")) &&
      /setServiceOfferedAction/.test(readFileSync("src/app/app/u/[unitSlug]/booking/services/page.tsx", "utf8")),
    "อ้างครบ", "ขาด", "MAJOR");
  chk("SS-5", "มีตัวแก้รูปในเบราว์เซอร์ (ครอป/สี/ข้อความ/ย่อขยาย)",
    existsSync("src/lib/modules/inventory/ImageEditor.tsx") &&
      /crop|ครอป/.test(readFileSync("src/lib/modules/inventory/ImageEditor.tsx", "utf8")),
    "มี", "ไม่มี", "MAJOR");

  // ── setup ร้าน ──
  const t = await prisma.tenant.create({ data: { name: "QC แคตตาล็อก", slug: `qc-cat-${Date.now()}` } });
  tid = t.id;
  const unit = await prisma.businessUnit.create({
    data: { tenantId: tid, type: "BOOKING", name: "ร้านตัดผม", slug: `cat-${Date.now()}` },
  });
  const invSys = await sys.createSystem(tid, "INVENTORY", "สินค้า/บริการ");
  await sys.linkUnit(tid, invSys.id, unit.id);
  const posSys = await sys.createSystem(tid, "POS", "ขายหน้าร้าน POS");
  await sys.linkUnit(tid, posSys.id, unit.id);
  const invCtx = { tenantId: tid, systemId: invSys.id };
  const bkCtx = { tenantId: tid, unitId: unit.id };
  await prisma.bookingHours.createMany({
    data: Array.from({ length: 7 }, (_, wd) => ({ tenantId: tid, unitId: unit.id, weekday: wd, openMin: 540, closeMin: 1080, closed: false })),
  });

  // ── [7] ตั้งค่า SKU + หมวดหมู่ ──
  console.log("── SKU / หมวดหมู่ ──");
  await inv.saveSettings(invCtx, { skuPrefix: "SHOP", skuPadding: 3 });
  const sku1 = await inv.nextSku(invCtx);
  chk("SK-1", "SKU อัตโนมัติตามรูปแบบระบบ (SHOP-001)", sku1 === "SHOP-001", "SHOP-001", sku1);
  const cat = await inv.saveCategory(invCtx, { name: "ตัดผม", kind: "SERVICE", skuPrefix: "HAIR", defaultDurationMin: 45 });
  chk("SK-2", "สร้างหมวดบริการได้", cat.ok === true, "ok", JSON.stringify(cat));
  const sku2 = await inv.nextSku(invCtx, cat.id);
  chk("SK-3", "หมวดที่ตั้งคำนำหน้าเอง ชนะค่าของระบบ (HAIR-002)", sku2 === "HAIR-002", "HAIR-002", sku2);
  const dupCat = await inv.saveCategory(invCtx, { name: "ตัดผม", kind: "SERVICE" });
  chk("SK-4", "หมวดชื่อซ้ำ → ปฏิเสธ", dupCat.ok === false, "false", JSON.stringify(dupCat));
  const badPrefix = await inv.saveSettings(invCtx, { skuPrefix: "ตัดผม" });
  chk("SK-5", "คำนำหน้า SKU ที่ไม่ใช่ A-Z0-9 → ปฏิเสธ", badPrefix.ok === false, "false", JSON.stringify(badPrefix));

  // ── [1] บริการในแคตตาล็อก + สต็อกไม่เห็น ──
  console.log("── บริการในแคตตาล็อก ──");
  const svc = await inv.createItem(invCtx, {
    sku: await inv.nextSku(invCtx, cat.id), name: "ตัดผมชาย", kind: "SERVICE", unitLabel: "ครั้ง",
    priceSatang: 15_000, durationMin: 45, depositSatang: 5_000, bookable: true, categoryId: cat.id,
  });
  const prod = await inv.createItem(invCtx, { sku: await inv.nextSku(invCtx), name: "แชมพู", costSatang: 8_000 });
  chk("CT-1", "บริการอยู่ใน listServices ไม่อยู่ใน listItems (หน้าสต็อก)",
    (await inv.listServices(invCtx)).some((x) => x.id === svc.id) &&
      !(await inv.listItems(invCtx)).some((x) => x.id === svc.id) &&
      (await inv.listItems(invCtx)).some((x) => x.id === prod.id),
    "แยกกันถูก", "ปนกัน");
  chk("CT-2", "บริการไม่โผล่ในรายการ 'ใกล้หมด'", !(await inv.lowStock(invCtx)).some((x) => x.id === svc.id), "ไม่มี", "มี");

  // ── [2] บริการไม่มีสต็อก ──
  let recvErr = "";
  try {
    await inv.receive(invCtx, { itemId: svc.id, qty: 5, costSatang: 100, idempotencyKey: `qc-${Date.now()}` });
  } catch (e) {
    recvErr = e instanceof Error ? e.message : String(e);
  }
  chk("CT-3", "🔴 รับเข้าสต็อกให้บริการ → ปฏิเสธ + บอกเหตุผลเป็นภาษาคน",
    /เป็นบริการ/.test(recvErr), "มีคำว่า 'เป็นบริการ'", recvErr || "(ไม่ throw)");

  // ── [3] จองคิวดึงจากแคตตาล็อก ──
  console.log("── จองคิวดึงจากแคตตาล็อก ──");
  const r1 = await booking.serviceRoster(bkCtx);
  chk("BK-1", "บริการในแคตตาล็อกโผล่ในหน้าจอง (ยังไม่เปิดรับจอง)",
    r1.rows.length === 1 && r1.rows[0]!.itemId === svc.id && r1.rows[0]!.offered === false,
    "1 รายการ/ไม่เปิด", JSON.stringify(r1.rows));
  chk("BK-2", "ยังไม่เปิดรับจอง → ลูกค้าไม่เห็นบริการในหน้าจอง",
    (await booking.getBookingData(tid, unit.id)).services.length === 0, "0", "-");
  const on = await booking.setServiceOffered(bkCtx, svc.id, true);
  chk("BK-3", "เปิดรับจองได้ + สร้าง projection ผูกกับต้นฉบับ",
    on.ok === true && (await prisma.bookingService.count({ where: { tenantId: tid, itemId: svc.id } })) === 1,
    "ok/1", JSON.stringify(on));
  const pub = await booking.getBookingData(tid, unit.id);
  chk("BK-4", "หน้าจองเห็นบริการ ราคา/เวลา/มัดจำ ตรงกับแคตตาล็อก",
    pub.services.length === 1 && pub.services[0]!.priceSatang === 15_000 &&
      pub.services[0]!.durationMin === 45 && pub.services[0]!.depositSatang === 5_000,
    "150/45/50", JSON.stringify(pub.services[0]));

  // แก้ราคาที่แคตตาล็อก → หน้าจองต้องเห็นตาม (sync ตอนเปิดหน้า roster)
  await inv.updateItem(invCtx, svc.id, { priceSatang: 18_000, durationMin: 60 });
  await booking.serviceRoster(bkCtx);
  const pub2 = await booking.getBookingData(tid, unit.id);
  chk("BK-5", "🔴 แก้ราคา/เวลาที่แคตตาล็อก → หน้าจองเห็นตาม (ไม่ต้องแก้ 2 ที่)",
    pub2.services[0]!.priceSatang === 18_000 && pub2.services[0]!.durationMin === 60, "180/60",
    JSON.stringify({ p: pub2.services[0]!.priceSatang, d: pub2.services[0]!.durationMin }));

  // จองจริง แล้วปิดรับจอง — นัดต้องอยู่
  const staff = await booking.createStaff({ tenantId: tid, unitId: unit.id, name: "ช่างเอ" });
  const appt = await booking.createAppointment({
    tenantId: tid, unitId: unit.id, serviceId: pub2.services[0]!.id, staffId: staff.id,
    dateStr: dPlus(2), startMin: 600, customerName: "ลูกค้า", customerPhone: "0800000001",
  });
  chk("BK-6", "จองบริการจากแคตตาล็อกได้", appt.ok === true, "ok", JSON.stringify(appt));
  await booking.setServiceOffered(bkCtx, svc.id, false);
  chk("BK-7", "ปิดรับจอง → ลูกค้าจองใหม่ไม่ได้ แต่นัดเดิมอยู่ครบ",
    (await booking.getBookingData(tid, unit.id)).services.length === 0 &&
      (await prisma.appointment.count({ where: { tenantId: tid, status: "CONFIRMED" } })) === 1,
    "0 บริการ/1 นัด", "-");
  await booking.setServiceOffered(bkCtx, svc.id, true);

  // ── [4] POS ดึงจากแคตตาล็อกเดียวกัน ──
  const posSvc = await register.posServices(tid, invSys.id);
  chk("PS-1", "POS เห็นบริการจากแคตตาล็อก (ต้นฉบับเดียวกับหน้าจอง)",
    posSvc.length === 1 && posSvc[0]!.id === svc.id && posSvc[0]!.priceSatang === 18_000,
    "1 รายการ/180 บาท", JSON.stringify(posSvc));
  chk("PS-2", "POS ไม่เห็นบริการถ้าไม่ได้เชื่อมระบบสินค้า/บริการ",
    (await register.posServices(tid, null)).length === 0, "0", "-");
  const posCat = await register.posCatalog(tid, invSys.id);
  chk("PS-3", "แคตตาล็อกสินค้าของ POS ไม่มีบริการปนมา (ไม่งั้นตัดสต็อกผิด)",
    posCat.every((x) => x.id !== svc.id) && posCat.some((x) => x.id === prod.id), "มีแต่สินค้า",
    JSON.stringify(posCat.map((x) => x.name)));

  // ── [5] ย้ายบริการเก่าเข้าแคตตาล็อก ──
  console.log("── ย้ายบริการเก่า ──");
  const legacy = await prisma.bookingService.create({
    data: { tenantId: tid, unitId: unit.id, name: "โกนหนวด", durationMin: 20, priceSatang: 8_000, itemId: null },
  });
  const legacyAppt = await booking.createAppointment({
    tenantId: tid, unitId: unit.id, serviceId: legacy.id, staffId: staff.id,
    dateStr: dPlus(3), startMin: 660, customerName: "ลูกค้าเก่า", customerPhone: "0800000002",
  });
  const moved = await booking.importServicesToCatalog(bkCtx);
  chk("MG-1", "ย้ายบริการเก่าเข้าแคตตาล็อกได้", moved.moved === 1, "1", JSON.stringify(moved));
  const legacyAfter = await prisma.bookingService.findUnique({ where: { id: legacy.id } });
  chk("MG-2", "🔴 นัดเก่ายังชี้บริการเดิมและไม่ถูกแตะ (ประวัติต้องนิ่ง)",
    (await prisma.appointment.findUnique({ where: { id: (legacyAppt as { id: string }).id } }))?.serviceId === legacy.id &&
      legacyAfter?.itemId != null,
    "นัดเดิม/ผูกต้นฉบับแล้ว", JSON.stringify({ item: legacyAfter?.itemId }));
  const again = await booking.importServicesToCatalog(bkCtx);
  chk("MG-3", "กดย้ายซ้ำไม่สร้างซ้ำ", again.moved === 0 && again.linked === 0, "0/0", JSON.stringify(again));
  chk("MG-4", "แคตตาล็อกมีบริการ 2 รายการ (ตัดผมชาย + โกนหนวด)",
    (await inv.listServices(invCtx)).length === 2, "2", String((await inv.listServices(invCtx)).length));

  // ── [8] รูป ──
  console.log("── รูปสินค้า/บริการ ──");
  const bad = await inv.addItemImage(invCtx, svc.id, { url: "javascript:alert(1)" });
  chk("IM-1", "🔴 ลิงก์รูปที่ไม่ใช่ http(s) → ปฏิเสธ (กัน XSS)", bad.ok === false, "false", JSON.stringify(bad));
  const i1 = await inv.addItemImage(invCtx, svc.id, { url: "https://cdn.example.com/a.jpg" });
  const i2 = await inv.addItemImage(invCtx, svc.id, { url: "https://cdn.example.com/b.jpg" });
  chk("IM-2", "เพิ่มรูปได้ 2 รูป", i1.ok && i2.ok && (await inv.listItemImages(invCtx, svc.id)).length === 2, "2", "-");
  await inv.setPrimaryImage(invCtx, svc.id, i2.id!);
  chk("IM-3", "ตั้งรูปหลักได้ (รูปแรกในลำดับ)",
    (await inv.listItemImages(invCtx, svc.id))[0]!.id === i2.id, "รูปที่ 2 มาก่อน", "-");
  await inv.removeItemImage(invCtx, i1.id!);
  chk("IM-4", "ลบรูปได้", (await inv.listItemImages(invCtx, svc.id)).length === 1, "1", "-");

  // ── ลบหมวด ไม่ลบของ ──
  const rm = await inv.removeCategory(invCtx, cat.id!);
  chk("SK-6", "ลบหมวด → ของยังอยู่ แค่หลุดหมวด",
    rm.moved >= 1 && (await inv.listServices(invCtx)).length === 2, "ของอยู่ครบ", JSON.stringify(rm));

  // ── ไม่รั่วข้ามร้าน ──
  const t2 = await prisma.tenant.create({ data: { name: "QC ร้านอื่น", slug: `qc-cat2-${Date.now()}` } });
  otherTid = t2.id;
  const inv2 = await sys.createSystem(otherTid, "INVENTORY", "สินค้า/บริการ");
  const crossCtx = { tenantId: otherTid, systemId: inv2.id };
  chk("XT-1", "ร้านอื่นไม่เห็นบริการของเรา", (await inv.listServices(crossCtx)).length === 0, "0", "-");
  const crossImg = await inv.addItemImage(crossCtx, svc.id, { url: "https://cdn.example.com/x.jpg" });
  chk("XT-2", "🔴 ร้านอื่นแนบรูปให้ของเราไม่ได้", crossImg.ok === false, "false", JSON.stringify(crossImg));
  const crossOffer = await booking.setServiceOffered({ tenantId: otherTid, unitId: unit.id }, svc.id, true);
  chk("XT-3", "🔴 ร้านอื่นเปิดรับจองบริการของเราไม่ได้", crossOffer.ok === false, "false", JSON.stringify(crossOffer));
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e));
} finally {
  for (const id of [tid, otherTid].filter(Boolean)) {
    const del = async (n: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (err) { console.log(`  ⚠ cleanup ${n}: ${err instanceof Error ? err.message.slice(0, 60) : err}`); }
    };
    for (const [n, fn] of [
      ["appointment", () => prisma.appointment.deleteMany({ where: { tenantId: id } })],
      ["bookingHours", () => prisma.bookingHours.deleteMany({ where: { tenantId: id } })],
      ["bookingStaff", () => prisma.bookingStaff.deleteMany({ where: { tenantId: id } })],
      ["bookingService", () => prisma.bookingService.deleteMany({ where: { tenantId: id } })],
      ["invItemImage", () => prisma.invItemImage.deleteMany({ where: { tenantId: id } })],
      ["invMovement", () => prisma.invMovement.deleteMany({ where: { tenantId: id } })],
      ["invLocationStock", () => prisma.invLocationStock.deleteMany({ where: { tenantId: id } })],
      ["invLot", () => prisma.invLot.deleteMany({ where: { tenantId: id } })],
      ["invItem", () => prisma.invItem.deleteMany({ where: { tenantId: id } })],
      ["invCategory", () => prisma.invCategory.deleteMany({ where: { tenantId: id } })],
      ["invSettings", () => prisma.invSettings.deleteMany({ where: { tenantId: id } })],
      ["invLocation", () => prisma.invLocation.deleteMany({ where: { tenantId: id } })],
      ["hrEmployee", () => prisma.hrEmployee.deleteMany({ where: { tenantId: id } })],
      ["customer", () => prisma.customer.deleteMany({ where: { tenantId: id } })],
      ["appSystemUnit", () => prisma.appSystemUnit.deleteMany({ where: { tenantId: id } })],
      ["appSystem", () => prisma.appSystem.deleteMany({ where: { tenantId: id } })],
      ["unit", () => prisma.businessUnit.deleteMany({ where: { tenantId: id } })],
      ["tenant", () => prisma.tenant.delete({ where: { id } })],
    ] as [string, () => Promise<unknown>][]) await del(n, fn);
  }
  console.log("\n[cleanup] ลบ test tenant เรียบร้อย");
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: สินค้า/บริการ แหล่งเดียว + หมวดหมู่/SKU/รูป =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
