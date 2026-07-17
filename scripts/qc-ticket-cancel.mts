// QC — Ticket cancel refund (WO Wave2-C) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/modules/ticket/service.ts:
//   cancelOrder(ctx {tenantId, unitId}, orderId) → void
//     · order PAID → คืนโควตา + void ตั๋ว + set CANCELLED + กลับเส้นเงิน (pos.voidSale บิล `ticket-sale-<orderId>`)
//     · claim อะตอมมิก (status→CANCELLED guard) · idempotent: cancel ซ้ำ ไม่คืนโควตา/ไม่ void บัญชีเบิ้ล
//     · order PENDING → คืนโควตาปกติ ไม่มี posSale ให้ void (ไม่ error)
//     · cross-tenant: ctx tenant อื่น → order เดิมไม่ถูกแตะ (guard tenantDb → throw ORDER_NOT_FOUND)
try { process.loadEnvFile(".env"); } catch { /* CI */ }
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");
const ticket = await import("@/lib/modules/ticket/service");
const wiring = await import("@/lib/outbox-consumers");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

// helper: net (credit-debit) ต่อ code จาก journal ทั้ง entry ของ PosSale (original + reversal)
async function netByCode(systemId: string, code: string): Promise<number> {
  const es = await prisma.accountJournalEntry.findMany({ where: { systemId, refType: "PosSale" }, include: { lines: { include: { account: { select: { code: true } } } } } });
  return es.flatMap((e) => e.lines).filter((l) => l.account.code === code).reduce((a, l) => a + (l.credit - l.debit), 0);
}

let tid = ""; let tid2 = "";
try {
  // ── setup tenant 1 (TICKET + POS + ACCOUNT vat) ──
  const t = await prisma.tenant.create({ data: { name: "QC TC", slug: `qc-tc-${Date.now()}` } }); tid = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "TICKET", name: "อีเวนต์ TC", slug: `tc-${Date.now()}` } });
  const posSys = await sys.createSystem(tid, "POS", "POS ตั๋ว"); await sys.linkUnit(tid, posSys.id, unit.id);
  const accSys = await sys.createSystem(tid, "ACCOUNT", "บัญชี");
  await acc.saveSettings(tid, accSys.id, { orgName: "อีเวนต์ จำกัด", taxId: "0105561177639", vatRegistered: true } as never);
  await gl.ensureAccounting({ tenantId: tid, systemId: accSys.id });
  await prisma.accountSystemLink.create({ data: { tenantId: tid, systemId: accSys.id, linkedKind: "POS", linkedId: posSys.id } });
  const ctx = { tenantId: tid, unitId: unit.id };
  const ev = await ticket.createEvent(ctx as never, { name: "คอนเสิร์ต", startAt: new Date(Date.now() + 86400000) } as never);
  const evId = (ev as { id: string }).id;
  const tt = await ticket.addTicketType(ctx as never, evId, { name: "บัตรทั่วไป", priceSatang: 10700, quota: 100 } as never);
  const ttId = (tt as { id: string }).id;

  // ── happy: order (2 ใบ) → markPaid → posSale PAID + บัญชีลง ──
  const ord = await ticket.createOrder(ctx as never, { eventId: evId, lines: [{ ticketTypeId: ttId, qty: 2 }], buyerName: "สมชาย" } as never);
  if (!(ord as { ok?: boolean }).ok) throw new Error("createOrder: " + JSON.stringify(ord));
  const orderId = (ord as { orderId: string }).orderId;
  await ticket.markPaid(ctx as never, orderId); await wiring.drainAll();
  const saleBefore = await prisma.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId: tid, idempotencyKey: `ticket-sale-${orderId}` } } });
  const soldBefore = (await prisma.ticketType.findUnique({ where: { id: ttId } }))?.sold;
  const netRevBefore = await netByCode(accSys.id, "4000");
  chk("TC-1.0", "ก่อนยกเลิก: posSale PAID + sold=2 + รายได้ลงบัญชี (net cr>0)", saleBefore?.status === "PAID" && soldBefore === 2 && netRevBefore > 0, "PAID/2/>0", `${saleBefore?.status}/${soldBefore}/${netRevBefore}`);

  // ── cancelOrder → คืนบัญชี ──
  await ticket.cancelOrder(ctx as never, orderId); await wiring.drainAll();
  const ordAfter = await prisma.ticketOrder.findUnique({ where: { id: orderId } });
  const saleAfter = await prisma.posSale.findUnique({ where: { id: saleBefore!.id } });
  const admStatuses = await prisma.ticketAdmission.findMany({ where: { orderId }, select: { status: true } });
  const soldAfter = (await prisma.ticketType.findUnique({ where: { id: ttId } }))?.sold;
  const voidedCount = await prisma.outboxEvent.count({ where: { tenantId: tid, type: "pos.sale.voided" } });
  const netRev = await netByCode(accSys.id, "4000");
  const netVat = await netByCode(accSys.id, "2200");
  chk("TC-1.1", "order → CANCELLED + cancelledAt", ordAfter?.status === "CANCELLED" && !!ordAfter?.cancelledAt, "CANCELLED+cancelledAt", `${ordAfter?.status}/${!!ordAfter?.cancelledAt}`);
  chk("TC-1.2", "posSale → VOIDED (กลับเส้นเงิน)", saleAfter?.status === "VOIDED", "VOIDED", String(saleAfter?.status));
  chk("TC-1.3", "ตั๋วทุกใบ VOID (2/2)", admStatuses.length === 2 && admStatuses.every((a) => a.status === "VOID"), "2×VOID", JSON.stringify(admStatuses.map((a) => a.status)));
  chk("TC-1.4", "คืนโควตา sold 2→0", soldAfter === 0, "0", String(soldAfter));
  chk("TC-1.5", "outbox pos.sale.voided ≥1", voidedCount >= 1, "≥1", String(voidedCount));
  chk("TC-1.6", "บัญชี net=0 (รายได้ 4000 + VAT 2200 กลับหมด)", netRev === 0 && netVat === 0, "0/0", `${netRev}/${netVat}`);

  // ── idempotency: cancel ซ้ำ → ไม่กลับบัญชี/โควตาเบิ้ล ──
  await ticket.cancelOrder(ctx as never, orderId); await wiring.drainAll();
  const saleAfter2 = await prisma.posSale.findUnique({ where: { id: saleBefore!.id } });
  const soldAfter2 = (await prisma.ticketType.findUnique({ where: { id: ttId } }))?.sold;
  const voidedCount2 = await prisma.outboxEvent.count({ where: { tenantId: tid, type: "pos.sale.voided" } });
  const netRev2 = await netByCode(accSys.id, "4000");
  chk("TC-2.1", "cancel ซ้ำ → posSale ยัง VOIDED + sold ยัง 0 + void outbox ไม่เพิ่ม + net ยัง 0", saleAfter2?.status === "VOIDED" && soldAfter2 === 0 && voidedCount2 === voidedCount && netRev2 === 0, "VOIDED/0/=/0", `${saleAfter2?.status}/${soldAfter2}/${voidedCount2}/${netRev2}`);

  // ── PENDING cancel: ไม่มี posSale → คืนโควตาปกติ ไม่ error ──
  const ordP = await ticket.createOrder(ctx as never, { eventId: evId, lines: [{ ticketTypeId: ttId, qty: 1 }], buyerName: "ยังไม่จ่าย" } as never);
  const orderPId = (ordP as { orderId: string }).orderId;
  const soldPBefore = (await prisma.ticketType.findUnique({ where: { id: ttId } }))?.sold; // 1
  let pendingErr = "";
  try { await ticket.cancelOrder(ctx as never, orderPId); } catch (e) { pendingErr = e instanceof Error ? e.message : String(e); }
  await wiring.drainAll();
  const ordPAfter = await prisma.ticketOrder.findUnique({ where: { id: orderPId } });
  const soldPAfter = (await prisma.ticketType.findUnique({ where: { id: ttId } }))?.sold; // 0
  const posP = await prisma.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId: tid, idempotencyKey: `ticket-sale-${orderPId}` } } });
  chk("TC-3.1", "PENDING cancel: ไม่ error + CANCELLED + sold คืน (1→0) + ไม่มี posSale", pendingErr === "" && ordPAfter?.status === "CANCELLED" && soldPBefore === 1 && soldPAfter === 0 && !posP, "no-err/CANCELLED/0/null", `${pendingErr || "ok"}/${ordPAfter?.status}/${soldPAfter}/${posP ? "มี" : "null"}`);

  // ── cross-tenant: cancel order t1 ด้วย ctx t2 → order t1 ไม่ถูกแตะ ──
  const t2 = await prisma.tenant.create({ data: { name: "QC TC2", slug: `qc-tc2-${Date.now()}` } }); tid2 = t2.id;
  const unit2 = await prisma.businessUnit.create({ data: { tenantId: tid2, type: "TICKET", name: "อีเวนต์อื่น", slug: `tc2-${Date.now()}` } });
  await sys.createSystem(tid2, "POS", "POS อื่น");
  const ctx2 = { tenantId: tid2, unitId: unit2.id };
  // order PAID ใหม่ใน t1 สำหรับทดสอบข้ามร้าน
  const ordX = await ticket.createOrder(ctx as never, { eventId: evId, lines: [{ ticketTypeId: ttId, qty: 1 }], buyerName: "ก" } as never);
  const orderXId = (ordX as { orderId: string }).orderId;
  await ticket.markPaid(ctx as never, orderXId); await wiring.drainAll();
  let crossErr = false;
  try { await ticket.cancelOrder(ctx2 as never, orderXId); } catch { crossErr = true; }
  const ordXAfter = await prisma.ticketOrder.findUnique({ where: { id: orderXId } });
  const saleX = await prisma.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId: tid, idempotencyKey: `ticket-sale-${orderXId}` } } });
  chk("TC-4.1", "cross-tenant → order t1 ยัง PAID + posSale ยัง PAID (ไม่ถูกยกเลิก)", ordXAfter?.status === "PAID" && saleX?.status === "PAID", "PAID/PAID", `${ordXAfter?.status}/${saleX?.status}${crossErr ? " (throw)" : ""}`);
} catch (e) { chk("CRASH", "harness จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 200) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: id }, data: { reversalOfId: null } }));
    for (const m of ["accountJournalLine", "accountJournalEntry", "accountSystemLink", "accountMapping", "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings", "outboxEvent", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "ticketAdmission", "ticketOrder", "ticketType", "ticketEvent", "appSystemUnit", "appSystem"])
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Ticket Cancel =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
