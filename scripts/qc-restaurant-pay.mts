// QC — ลูกค้าสแกนจ่ายเองจากลิงก์โต๊ะ (PromptPay) → ร้านยืนยันรับเงิน
// persona: ลูกค้านั่งโต๊ะ A1 สั่งข้าวกะเพรา ฿60 ×2 = ฿120 → เปิดบิลจากลิงก์โต๊ะ → สแกน PromptPay ร้าน → กด "แจ้งชำระแล้ว"
//          → ร้านเห็นคำขอ "ลูกค้าแจ้งชำระ (พร้อมเพย์)" → กด "ยืนยันรับเงิน" → checkout PROMPTPAY ปิดบิล+ปิดโต๊ะ
// พิสูจน์: guestBill/billPreview ยอดถูก · payload PromptPay ล็อกยอด · สัญญาณลูกค้า→ร้าน (PAY_PROMPTPAY) · posSale PAID · idempotent · cross-tenant กันรั่ว

try { process.loadEnvFile(".env"); } catch { /* CI */ }

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const menu = await import("@/lib/modules/restaurant/menu");
const table = await import("@/lib/modules/restaurant/table");
const order = await import("@/lib/modules/restaurant/order");
const storefront = await import("@/lib/modules/restaurant/storefront");
const payment = await import("@/lib/payment/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}

async function cleanupTenant(tid: string) {
  const del = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ข้าม */ } };
  await del(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: tid } }));
  await del(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: tid }, data: { reversalOfId: null } }));
  await del(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: tid } }));
  for (const m of ["accountSystemLink", "accountMapping", "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings", "outboxEvent", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "restaurantOrderItemOption", "restaurantOrderItem", "restaurantOrder", "restaurantServiceRequest", "tableSession", "restaurantTable", "restaurantZone", "menuItemOptionGroup", "menuOptionChoice", "menuOptionGroup", "menuItem", "menuCategory", "kdsStation", "restaurantDailyCounter", "restaurantSetting", "paymentProfile", "pointLedger", "pointBalance", "pointSettings", "appSystemUnit", "appSystem"])
    await del(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
  await del(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
  await del(() => prisma.tenant.delete({ where: { id: tid } }));
}

let tenantId = "";
let tenant2Id = "";
try {
  console.log("── setup: ร้าน RESTAURANT ผูก POS + ตั้งพร้อมเพย์ ──");
  const t = await prisma.tenant.create({ data: { name: "QC จ่ายเองพร้อมเพย์", slug: `qc-rpay-${Date.now()}` } });
  tenantId = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId, type: "RESTAURANT", name: "ครัว", slug: "kp" } });
  const posSys = await sys.createSystem(tenantId, "POS", "POS ครัว");
  await sys.linkUnit(tenantId, posSys.id, unit.id);
  await payment.savePaymentProfile({ tenantId }, { promptpayId: "0812345678", displayName: "ร้านจ่ายเอง" });

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
  const tbRow = await prisma.restaurantTable.findFirstOrThrow({ where: { id: tb.id } });
  const qrToken = tbRow.qrToken;

  console.log("\n── ลูกค้าเปิดโต๊ะจาก QR + สั่งข้าวกะเพรา ฿60 ×2 ──");
  const sess = await storefront.resolveTableSession(tenantId, unit.id, qrToken);
  chk("RP-1.1", "resolveTableSession จาก qrToken คืน session + ชื่อโต๊ะ", sess.ok === true && (sess as { tableName?: string }).tableName === "A1", "ok+A1", JSON.stringify(sess).slice(0, 80));
  if (!sess.ok) throw new Error("resolveTableSession");
  const ord = await order.createOrder({ tenantId, unitId: unit.id, type: "DINE_IN", sessionId: sess.sessionId, cart: [{ menuItemId: it.id, qty: 2, choiceIds: [] }], placedByUserId: "staff-qc" });
  if (!ord.ok) throw new Error("order");

  console.log("\n── billPreview + guestBill (ฝั่งลูกค้า) ──");
  const bill = await order.billPreview(tenantId, unit.id, sess.sessionId);
  chk("RP-2.1", "billPreview ยอดรวม = ฿120.00 (60×2)", bill.totalSatang === 12000, "12000", String(bill.totalSatang));
  const gb = await storefront.guestBill(tenantId, unit.id, qrToken);
  chk("RP-2.2", "guestBill คืน ok + ยอด 12000", gb.ok === true && (gb as { totalSatang?: number }).totalSatang === 12000, "ok+12000", JSON.stringify({ ok: gb.ok, total: (gb as { totalSatang?: number }).totalSatang }));
  const payload = gb.ok ? gb.promptpayPayload : null;
  chk("RP-2.3", "guestBill สร้าง payload PromptPay (ร้านตั้งพร้อมเพย์แล้ว)", typeof payload === "string" && payload!.length > 20, "string>20", String(payload).slice(0, 24));
  chk("RP-2.4", "payload ล็อกยอด 120.00 (dynamic amount tag 54)", !!payload && payload.includes("5406120.00"), "มี 5406120.00", String(payload).includes("5406120.00") ? "yes" : "no");

  console.log("\n── ลูกค้ากด 'แจ้งชำระแล้ว' → ร้านเห็นสัญญาณ ──");
  const notify = await storefront.notifyPromptpayPayment(tenantId, unit.id, qrToken);
  chk("RP-3.1", "notifyPromptpayPayment คืน ok", notify.ok === true, "ok", JSON.stringify(notify));
  const reqs = await order.listServiceRequests(tenantId, unit.id);
  const payReq = reqs.find((r) => r.type === "PAY_PROMPTPAY" && r.sessionId === sess.sessionId);
  chk("RP-3.2", "ร้านเห็นคำขอ PAY_PROMPTPAY (ผ่าน listServiceRequests)", !!payReq, "มี PAY_PROMPTPAY", payReq ? "yes" : "no");
  chk("RP-3.3", "note ระบุยอดที่ลูกค้าแจ้ง (฿120.00)", !!payReq?.note && payReq.note.includes("120.00"), "มี 120.00", payReq?.note ?? "—");
  const floor = await table.floorPlan(tenantId, unit.id);
  const tileA1 = floor.find((c) => c.name === "A1");
  chk("RP-3.4", "หน้าผังโต๊ะขึ้นธง hasPayNotified", tileA1?.hasPayNotified === true, "true", String(tileA1?.hasPayNotified));
  const dup = await storefront.notifyPromptpayPayment(tenantId, unit.id, qrToken);
  const reqs2 = await order.listServiceRequests(tenantId, unit.id);
  chk("RP-3.5", "กดแจ้งซ้ำภายใน 2 นาที → ไม่สร้างคำขอซ้ำ (dedup)", dup.ok === true && reqs2.filter((r) => r.type === "PAY_PROMPTPAY").length === 1, "1 คำขอ", String(reqs2.filter((r) => r.type === "PAY_PROMPTPAY").length));

  console.log("\n── ร้านกด 'ยืนยันรับเงิน' → checkout PROMPTPAY ──");
  const co = await order.checkout({ tenantId, unitId: unit.id, sessionId: sess.sessionId, payMethod: "PROMPTPAY" });
  chk("RP-4.1", "checkout PROMPTPAY สำเร็จ + saleId", co.ok === true && !!(co as { saleId?: string }).saleId, "ok+saleId", JSON.stringify(co).slice(0, 80));
  chk("RP-4.2", "ปิดโต๊ะอัตโนมัติเมื่อจ่ายครบ (sessionClosed)", co.ok === true && (co as { sessionClosed?: boolean }).sessionClosed === true, "true", String((co as { sessionClosed?: boolean }).sessionClosed));
  const wiring = await import("@/lib/outbox-consumers");
  await wiring.drainAll();

  const posSales = await prisma.posSale.findMany({ where: { tenantId, unitId: unit.id, sourceModule: "RESTAURANT", sourceId: sess.sessionId }, include: { payments: true } });
  chk("RP-4.3", "เกิด posSale 1 ใบ สถานะ PAID (ลงบัญชีการขาย)", posSales.length === 1 && posSales[0].status === "PAID", "1×PAID", `${posSales.length}×${posSales[0]?.status}`);
  chk("RP-4.4", "posPayment เป็น PROMPTPAY ยอด 12000", posSales[0]?.payments.some((p) => p.type === "PROMPTPAY" && p.amountSatang === 12000) === true, "PROMPTPAY 12000", JSON.stringify(posSales[0]?.payments.map((p) => ({ t: p.type, a: p.amountSatang }))));
  const sClosed = await prisma.tableSession.findFirstOrThrow({ where: { id: sess.sessionId } });
  chk("RP-4.5", "TableSession = CLOSED", sClosed.status === "CLOSED", "CLOSED", sClosed.status);

  console.log("\n── idempotency: กดยืนยันรับเงินซ้ำ → ไม่เกิดบิลซ้ำ ──");
  const co2 = await order.checkout({ tenantId, unitId: unit.id, sessionId: sess.sessionId, payMethod: "PROMPTPAY" });
  const posSales2 = await prisma.posSale.findMany({ where: { tenantId, unitId: unit.id, sourceModule: "RESTAURANT", sourceId: sess.sessionId } });
  chk("RP-5.1", "checkout ครั้งที่ 2 ไม่มีรายการค้าง (ok:false)", co2.ok === false, "ok:false", JSON.stringify(co2).slice(0, 60));
  chk("RP-5.2", "posSale ยังคง 1 ใบเดียว (ไม่เก็บเงินซ้ำ)", posSales2.length === 1, "1", String(posSales2.length));

  console.log("\n── cross-tenant: qrToken ร้านอื่น ไม่คืนบิล ──");
  const t2 = await prisma.tenant.create({ data: { name: "QC ร้านอื่น", slug: `qc-rpay2-${Date.now()}` } });
  tenant2Id = t2.id;
  const unit2 = await prisma.businessUnit.create({ data: { tenantId: tenant2Id, type: "RESTAURANT", name: "ครัว2", slug: "kp2" } });
  const zone2 = await table.createZone(tenant2Id, unit2.id, "โซน2");
  if (!zone2.ok) throw new Error("zone2");
  const tb2 = await table.createTable(tenant2Id, unit2.id, { zoneId: zone2.id, name: "B1", seats: 2 });
  if (!tb2.ok) throw new Error("table2");
  const tb2Row = await prisma.restaurantTable.findFirstOrThrow({ where: { id: tb2.id } });
  const crossA = await storefront.guestBill(tenantId, unit.id, tb2Row.qrToken);
  chk("RP-6.1", "guestBill(ร้าน1, qrToken ร้าน2) → ไม่คืน (กันข้ามร้าน)", crossA.ok === false, "ok:false", JSON.stringify(crossA).slice(0, 60));
  const crossB = await storefront.notifyPromptpayPayment(tenant2Id, unit2.id, qrToken);
  chk("RP-6.2", "notifyPromptpayPayment(ร้าน2, qrToken ร้าน1) → ไม่คืน", crossB.ok === false, "ok:false", JSON.stringify(crossB).slice(0, 60));
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? e.message.slice(0, 160) : String(e));
} finally {
  if (tenantId) await cleanupTenant(tenantId);
  if (tenant2Id) await cleanupTenant(tenant2Id);
  if (tenantId || tenant2Id) console.log("\n[cleanup] เรียบร้อย");
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
console.log("\n===== QC Restaurant Customer-Pay (PromptPay) =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id })) }));
process.exit(failed.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
