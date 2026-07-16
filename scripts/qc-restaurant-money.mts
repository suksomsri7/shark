// QC — สายเงินร้านอาหารครบวงจร: เปิดโต๊ะ → สั่ง → เช็คบิล → POS → บัญชี
// Audit ล้วน (ไม่มี Builder): พิสูจน์ว่าท่อ M1 ทำให้ "ร้านอาหารเลิกเป็นเกาะ" โดยอัตโนมัติหรือยัง
// persona: ร้านอาหารจด VAT — ลูกค้านั่งโต๊ะ สั่งข้าวกะเพรา 2 จาน จ่ายสด ฿120
// คาดหวัง: เช็คบิลแล้วเงินविّิ่งเข้าสมุดบัญชีเอง (Dr 1000 12000 / Cr 4000 ฐาน / Cr 2200 VAT)

try { process.loadEnvFile(".env"); } catch { /* CI */ }

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");
const menu = await import("@/lib/modules/restaurant/menu");
const table = await import("@/lib/modules/restaurant/table");
const order = await import("@/lib/modules/restaurant/order");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}

let tenantId = "";
try {
  console.log("── setup: ร้านอาหารจด VAT — unit ผูก POS · POS ผูกบัญชี (เหมือน DNA Wizard ประกอบให้) ──");
  const t = await prisma.tenant.create({ data: { name: "QC ครัวเงินไหล", slug: `qc-rmoney-${Date.now()}` } });
  tenantId = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId, type: "RESTAURANT", name: "ครัว", slug: "kq" } });
  const posSys = await sys.createSystem(tenantId, "POS", "POS ครัว");
  await sys.linkUnit(tenantId, posSys.id, unit.id);
  const accSys = await sys.createSystem(tenantId, "ACCOUNT", "บัญชีครัว");
  await acc.saveSettings(tenantId, accSys.id, { orgName: "ครัวเงินไหล จำกัด", taxId: "0105561177639", vatRegistered: true } as never);
  await gl.ensureAccounting({ tenantId, systemId: accSys.id });
  await prisma.accountSystemLink.create({ data: { tenantId, systemId: accSys.id, linkedKind: "POS", linkedId: posSys.id } });

  console.log("\n── dine-in: เปิดโต๊ะ → สั่งข้าวกะเพรา ฿60 ×2 → เช็คบิลเงินสด ──");
  await menu.ensureDefaultStations(tenantId, unit.id);
  const stations = await menu.listStations(tenantId, unit.id);
  const cat = await menu.createCategory(tenantId, unit.id, { name: "จานเดียว" });
  if (!cat.ok) throw new Error("cat");
  const it = await menu.createItem(tenantId, unit.id, { categoryId: cat.id, stationId: stations[0].id, name: "ข้าวกะเพรา", basePrice: 6000 });
  if (!it.ok) throw new Error("item");
  const zone = await table.createZone(tenantId, unit.id, "หน้าร้าน");
  if (!zone.ok) throw new Error("zone");
  const tb = await table.createTable(tenantId, unit.id, { zoneId: zone.id, name: "A1", seats: 4 });
  if (!tb.ok) throw new Error("table");
  const sess = await table.openSession(tenantId, unit.id, tb.id, { guestCount: 2 });
  if (!sess.ok) throw new Error("session");
  const ord = await order.createOrder({ tenantId, unitId: unit.id, type: "DINE_IN", sessionId: sess.id, cart: [{ menuItemId: it.id, qty: 2, choiceIds: [] }], placedByUserId: "staff-qc" });
  if (!ord.ok) throw new Error("order");
  const co = await order.checkout({ tenantId, unitId: unit.id, sessionId: sess.id, payMethod: "CASH" });
  chk("RM-1.1", "เช็คบิลผ่าน POS สำเร็จ (unit ผูก POS แล้ว)", co.ok === true && !!(co as { saleId?: string }).saleId, "ok+saleId", JSON.stringify(co).slice(0, 80));
  const saleId = (co as { saleId: string }).saleId;

  // รอ outbox drain (checkout → createSale → emit → drain best-effort)
  const wiring = await import("@/lib/outbox-consumers");
  await wiring.drainAll();

  console.log("\n── เงินถึงสมุดบัญชีไหม (ท่อ M1 อัตโนมัติ) ──");
  const entries = await prisma.accountJournalEntry.findMany({
    where: { systemId: accSys.id, refType: "PosSale", refId: saleId },
    include: { lines: { include: { account: { select: { code: true } } } } },
  });
  chk("RM-2.1", "เช็คบิลโต๊ะ → เกิด journal entry อัตโนมัติ", entries.length >= 1, "≥1", String(entries.length));
  const side = (code: string, s: "dr" | "cr") =>
    entries.flatMap((e) => e.lines).filter((l) => l.account.code === code).reduce((a, l) => a + (s === "dr" ? l.debit : l.credit), 0);
  chk("RM-2.2", "Dr เงินสด 1000 = 120.00", side("1000", "dr") === 12000, "12000", String(side("1000", "dr")));
  chk("RM-2.3", "Cr รายได้ 4000 = 112.15 (ฐานหลังถอด VAT 7%)", side("4000", "cr") === Math.round(12000 / 1.07), String(Math.round(12000 / 1.07)), String(side("4000", "cr")));
  chk("RM-2.4", "Cr ภาษีขาย 2200 = ส่วน VAT", side("2200", "cr") === 12000 - Math.round(12000 / 1.07), String(12000 - Math.round(12000 / 1.07)), String(side("2200", "cr")));
  const dr = entries.flatMap((e) => e.lines).reduce((a, l) => a + l.debit, 0);
  const cr = entries.flatMap((e) => e.lines).reduce((a, l) => a + l.credit, 0);
  chk("RM-2.5", "Σdr = Σcr", dr === cr, String(dr), String(cr));
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? e.message.slice(0, 140) : String(e));
} finally {
  if (tenantId) {
    const del = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ข้าม */ } };
    await del(() => prisma.accountJournalLine.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountJournalEntry.updateMany({ where: { tenantId }, data: { reversalOfId: null } }));
    await del(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId } }));
    for (const m of ["accountSystemLink", "accountMapping", "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings", "outboxEvent", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "restaurantOrderItemOption", "restaurantOrderItem", "restaurantOrder", "restaurantServiceRequest", "tableSession", "restaurantTable", "restaurantZone", "menuItemOptionGroup", "menuOptionChoice", "menuOptionGroup", "menuItem", "menuCategory", "kdsStation", "restaurantDailyCounter", "restaurantSetting", "pointLedger", "pointBalance", "pointSettings", "appSystemUnit", "appSystem"])
      await del(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId } }));
    await del(() => prisma.businessUnit.deleteMany({ where: { tenantId } }));
    await del(() => prisma.tenant.delete({ where: { id: tenantId } }));
    console.log("\n[cleanup] เรียบร้อย");
  }
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
console.log("\n===== QC Restaurant Money Chain =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id })) }));
process.exit(failed.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
