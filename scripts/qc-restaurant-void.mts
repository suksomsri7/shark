// QC — Restaurant void/คืนเงินบิลหลังชำระ (WO Wave2-B) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/modules/restaurant/order.ts:
//   voidCheckout(tenantId, unitId, sessionId) → { ok, ... } | { ok:false, reason }
//     · guard: ต้องมีรายการที่ชำระแล้ว (item ผูก saleId) → ถ้าไม่มี ok:false
//     · กลับเส้นเงิน: pos.voidSale(saleId) → posSale VOIDED + outbox pos.sale.voided + บัญชีกลับ (net = 0)
//     · reset item.saleId=null, settledAt=null · เปิดโต๊ะกลับ OPEN (ถ้าปิดและโต๊ะว่าง)
//     · idempotent: void ซ้ำ → ไม่มี item ผูก saleId แล้ว → ok:false ไม่กลับบัญชีเบิ้ล
//     · cross-tenant: tenant อื่น → ok:false (guard tenantDb/scoped where)
try { process.loadEnvFile(".env"); } catch { /* CI */ }

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");
const menu = await import("@/lib/modules/restaurant/menu");
const table = await import("@/lib/modules/restaurant/table");
const order = await import("@/lib/modules/restaurant/order");
const wiring = await import("@/lib/outbox-consumers");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};

let tid = ""; let tid2 = "";
try {
  // ── setup: ร้านอาหารจด VAT — unit ผูก POS · POS ผูกบัญชี ──
  const t = await prisma.tenant.create({ data: { name: "QC RV", slug: `qc-rv-${Date.now()}` } });
  tid = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RESTAURANT", name: "ครัว", slug: `rv-${Date.now()}` } });
  const posSys = await sys.createSystem(tid, "POS", "POS ครัว");
  await sys.linkUnit(tid, posSys.id, unit.id);
  const accSys = await sys.createSystem(tid, "ACCOUNT", "บัญชีครัว");
  await acc.saveSettings(tid, accSys.id, { orgName: "ครัว จำกัด", taxId: "0105561177639", vatRegistered: true } as never);
  await gl.ensureAccounting({ tenantId: tid, systemId: accSys.id });
  await prisma.accountSystemLink.create({ data: { tenantId: tid, systemId: accSys.id, linkedKind: "POS", linkedId: posSys.id } });

  await menu.ensureDefaultStations(tid, unit.id);
  const stations = await menu.listStations(tid, unit.id);
  const cat = await menu.createCategory(tid, unit.id, { name: "จานเดียว" });
  if (!cat.ok) throw new Error("cat");
  const it = await menu.createItem(tid, unit.id, { categoryId: cat.id, stationId: stations[0].id, name: "ข้าวกะเพรา", basePrice: 6000 });
  if (!it.ok) throw new Error("item");
  const zone = await table.createZone(tid, unit.id, "หน้าร้าน");
  if (!zone.ok) throw new Error("zone");
  const tb = await table.createTable(tid, unit.id, { zoneId: zone.id, name: "A1", seats: 4 });
  if (!tb.ok) throw new Error("table");

  // net ยอด (debit-credit) ของบัญชีเงินสด 1000 — หลัง post/void ควรกลับเป็น 0
  const cashNet = async (): Promise<number> => {
    const lines = await prisma.accountJournalLine.findMany({
      where: { tenantId: tid, account: { code: "1000" } },
      select: { debit: true, credit: true },
    });
    return lines.reduce((a, l) => a + l.debit - l.credit, 0);
  };
  const voidedOutbox = () => prisma.outboxEvent.count({ where: { tenantId: tid, type: "pos.sale.voided" } });

  // ── happy: เปิดโต๊ะ → สั่ง ฿60×2 → เช็คบิลเงินสด (PAID) → voidCheckout ──
  console.log("\n── happy: checkout PAID → voidCheckout ──");
  const sess = await table.openSession(tid, unit.id, tb.id, { guestCount: 2 });
  if (!sess.ok) throw new Error("session");
  const ord = await order.createOrder({ tenantId: tid, unitId: unit.id, type: "DINE_IN", sessionId: sess.id, cart: [{ menuItemId: it.id, qty: 2, choiceIds: [] }], placedByUserId: "staff-qc" });
  if (!ord.ok) throw new Error("order");
  const co = await order.checkout({ tenantId: tid, unitId: unit.id, sessionId: sess.id, payMethod: "CASH" });
  const saleId = (co as { saleId?: string }).saleId as string;
  await wiring.drainAll();
  const sessAfterCheckout = await prisma.tableSession.findUnique({ where: { id: sess.id } });
  chk("RV-1.0", "ก่อน void: เช็คบิล PAID + session CLOSED + เงินสดบัญชี +12000", co.ok === true && !!saleId && sessAfterCheckout?.status === "CLOSED" && (await cashNet()) === 12000, "PAID/CLOSED/12000", `${co.ok}/${sessAfterCheckout?.status}/${await cashNet()}`);

  const vc = await order.voidCheckout(tid, unit.id, sess.id);
  await wiring.drainAll();
  const saleAfter = await prisma.posSale.findUnique({ where: { id: saleId } });
  const paidItemsAfter = await prisma.restaurantOrderItem.count({ where: { tenantId: tid, order: { sessionId: sess.id }, saleId: { not: null } } });
  const sessAfter = await prisma.tableSession.findUnique({ where: { id: sess.id } });
  const revEntries = await prisma.accountJournalEntry.count({ where: { tenantId: tid, refType: "PosSale", refId: saleId } });
  chk("RV-1.1", "voidCheckout ok:true + saleVoided", vc.ok === true && (vc as { saleVoided?: boolean }).saleVoided === true, "ok+saleVoided", JSON.stringify(vc).slice(0, 90));
  chk("RV-1.2", "posSale → VOIDED", saleAfter?.status === "VOIDED", "VOIDED", String(saleAfter?.status));
  chk("RV-1.3", "รายการชำระแล้วใน session = 0 (saleId reset null)", paidItemsAfter === 0, "0", String(paidItemsAfter));
  chk("RV-1.4", "session เปิดกลับ OPEN (โต๊ะว่าง)", sessAfter?.status === "OPEN" && (vc as { sessionReopened?: boolean }).sessionReopened === true, "OPEN", `${sessAfter?.status}`);
  chk("RV-1.5", "outbox pos.sale.voided ≥1", (await voidedOutbox()) >= 1, "≥1", String(await voidedOutbox()));
  chk("RV-1.6", "บัญชีกลับ: เงินสด net = 0 + มี reversal entry (original+reversal ≥2)", (await cashNet()) === 0 && revEntries >= 2, "0/≥2", `${await cashNet()}/${revEntries}`);

  // ── idempotency: void ซ้ำ session เดิม ──
  console.log("\n── idempotency: void ซ้ำ ──");
  const voidCountBefore = await voidedOutbox();
  const vc2 = await order.voidCheckout(tid, unit.id, sess.id);
  await wiring.drainAll();
  chk("RV-2.1", "void ซ้ำ → ok:false (ไม่มีบิลชำระให้ยกเลิก)", vc2.ok === false, "false", JSON.stringify(vc2));
  chk("RV-2.2", "ไม่กลับบัญชีเบิ้ล: net เงินสดยัง 0 + void outbox ไม่เพิ่ม + posSale ยัง VOIDED", (await cashNet()) === 0 && (await voidedOutbox()) === voidCountBefore && (await prisma.posSale.findUnique({ where: { id: saleId } }))?.status === "VOIDED", "0/เท่าเดิม/VOIDED", `${await cashNet()}/${await voidedOutbox()}=${voidCountBefore}`);

  // ── guard: void session ที่ยังไม่จ่าย ──
  console.log("\n── guard: session ยังไม่จ่าย ──");
  const tb2 = await table.createTable(tid, unit.id, { zoneId: zone.id, name: "A2", seats: 2 });
  if (!tb2.ok) throw new Error("table2");
  const sessU = await table.openSession(tid, unit.id, tb2.id, {});
  if (!sessU.ok) throw new Error("sessionU");
  await order.createOrder({ tenantId: tid, unitId: unit.id, type: "DINE_IN", sessionId: sessU.id, cart: [{ menuItemId: it.id, qty: 1, choiceIds: [] }], placedByUserId: "staff-qc" });
  const vcU = await order.voidCheckout(tid, unit.id, sessU.id);
  const sessUAfter = await prisma.tableSession.findUnique({ where: { id: sessU.id } });
  chk("RV-3.1", "void session ยังไม่จ่าย → ok:false + session ยัง OPEN", vcU.ok === false && !!(vcU as { reason?: string }).reason && sessUAfter?.status === "OPEN", "false+OPEN", `${vcU.ok}/${sessUAfter?.status}`);

  // ── cross-tenant: void บิล t1 ด้วย tenant t2 ──
  console.log("\n── cross-tenant ──");
  const t2 = await prisma.tenant.create({ data: { name: "QC RV2", slug: `qc-rv2-${Date.now()}` } });
  tid2 = t2.id;
  const unit2 = await prisma.businessUnit.create({ data: { tenantId: tid2, type: "RESTAURANT", name: "ครัวอื่น", slug: `rv2-${Date.now()}` } });
  const posSys2 = await sys.createSystem(tid2, "POS", "POS อื่น");
  await sys.linkUnit(tid2, posSys2.id, unit2.id);
  // บิล PAID ก้อนใหม่ใน t1 (โต๊ะ A2 มีของค้าง → เช็คบิลเลย)
  const coX = await order.checkout({ tenantId: tid, unitId: unit.id, sessionId: sessU.id, payMethod: "CASH" });
  const saleX = (coX as { saleId?: string }).saleId as string;
  await wiring.drainAll();
  const vcCross = await order.voidCheckout(tid2, unit2.id, sessU.id); // tenant t2 บน session t1
  const saleXAfter = await prisma.posSale.findUnique({ where: { id: saleX } });
  chk("RV-4.1", "cross-tenant void → ok:false + posSale t1 ยัง PAID (ไม่ถูกกลับ)", vcCross.ok === false && saleXAfter?.status === "PAID", "false+PAID", `${vcCross.ok}/${saleXAfter?.status}`);
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? (e.stack ?? e.message).slice(0, 200) : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ข้าม */ } };
  for (const id of [tid, tid2].filter(Boolean)) {
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: id }, data: { reversalOfId: null } }));
    await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: id } }));
    for (const m of ["accountSystemLink", "accountMapping", "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings", "outboxEvent", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "restaurantOrderItemOption", "restaurantOrderItem", "restaurantOrder", "restaurantServiceRequest", "tableSession", "restaurantTable", "restaurantZone", "menuItemOptionGroup", "menuOptionChoice", "menuOptionGroup", "menuItem", "menuCategory", "kdsStation", "restaurantDailyCounter", "restaurantSetting", "pointLedger", "pointBalance", "pointSettings", "appSystemUnit", "appSystem"])
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  console.log("\n[cleanup] เรียบร้อย");
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Restaurant Void =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
