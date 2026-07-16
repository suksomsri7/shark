// QC — Ticket→POS→บัญชี: ขายตั๋ว markPaid → รายได้เข้าบัญชีอัตโนมัติ
// ⚠️ Oracle ของ Fable — Builder (WO-0007) ห้ามแตะ · fail-before: ticket ไม่เคยเรียก POS → TK-2.* แดง
try { process.loadEnvFile(".env"); } catch { /* CI */ }
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");
const ticket = await import("@/lib/modules/ticket/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const checks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, name: string, ok: boolean, exp: string, act: string, sev: Sev = "CRITICAL") => {
  checks.push({ id, ok, exp, act, sev }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — exp ${exp} | act ${act}`}`);
};
let tenantId = "";
try {
  const t = await prisma.tenant.create({ data: { name: "QC ตั๋ว", slug: `qc-tk-${Date.now()}` } }); tenantId = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId, type: "TICKET", name: "อีเวนต์", slug: "ev" } });
  const posSys = await sys.createSystem(tenantId, "POS", "POS ตั๋ว"); await sys.linkUnit(tenantId, posSys.id, unit.id);
  const accSys = await sys.createSystem(tenantId, "ACCOUNT", "บัญชี");
  await acc.saveSettings(tenantId, accSys.id, { orgName: "อีเวนต์ จำกัด", taxId: "0105561177639", vatRegistered: true } as never);
  await gl.ensureAccounting({ tenantId, systemId: accSys.id });
  await prisma.accountSystemLink.create({ data: { tenantId, systemId: accSys.id, linkedKind: "POS", linkedId: posSys.id } });
  const ctx = { tenantId, unitId: unit.id };
  const ev = await ticket.createEvent(ctx as never, { name: "คอนเสิร์ต", startAt: new Date(Date.now() + 86400000) } as never);
  const evId = (ev as { id?: string }).id ?? (ev as { eventId?: string }).eventId ?? "";
  const tt = await ticket.addTicketType(ctx as never, evId, { name: "บัตรทั่วไป", priceSatang: 10700, quota: 100 } as never);
  const ttId = (tt as { id?: string }).id ?? (tt as { typeId?: string }).typeId ?? "";
  const ord = await ticket.createOrder(ctx as never, { eventId: evId, lines: [{ ticketTypeId: ttId, qty: 1 }], buyerName: "สมชาย" } as never);
  if (!(ord as { ok?: boolean }).ok) throw new Error("createOrder: " + JSON.stringify(ord));
  const orderId = (ord as { orderId?: string; order?: { id: string } }).orderId ?? (ord as { order?: { id: string } }).order?.id ?? "";
  chk("TK-1.1", "สร้างออเดอร์ตั๋วได้ (฿107)", !!orderId, "orderId", JSON.stringify(ord).slice(0, 60));
  await ticket.markPaid(ctx as never, orderId);
  const wiring = await import("@/lib/outbox-consumers"); await wiring.drainAll();
  const es = await prisma.accountJournalEntry.findMany({ where: { systemId: accSys.id, refType: "PosSale" }, include: { lines: { include: { account: { select: { code: true } } } } } });
  const side = (c: string, s: "dr" | "cr") => es.flatMap((e) => e.lines).filter((l) => l.account.code === c).reduce((a, l) => a + (s === "dr" ? l.debit : l.credit), 0);
  chk("TK-2.1", "markPaid → เกิด journal entry อัตโนมัติ", es.length >= 1, "≥1", String(es.length));
  chk("TK-2.2", "Cr รายได้ 4000 = ฐานหลังถอด VAT (100)", side("4000", "cr") === Math.round(10700 / 1.07), String(Math.round(10700 / 1.07)), String(side("4000", "cr")));
  chk("TK-2.3", "Cr ภาษีขาย 2200 = 7", side("2200", "cr") === 10700 - Math.round(10700 / 1.07), String(10700 - Math.round(10700 / 1.07)), String(side("2200", "cr")));
  const dr = es.flatMap((e) => e.lines).reduce((a, l) => a + l.debit, 0), cr = es.flatMap((e) => e.lines).reduce((a, l) => a + l.credit, 0);
  chk("TK-2.4", "Σdr=Σcr", dr === cr, String(dr), String(cr));
  await ticket.markPaid(ctx as never, orderId); await wiring.drainAll();
  const es2 = await prisma.accountJournalEntry.count({ where: { systemId: accSys.id, refType: "PosSale" } });
  chk("TK-3.1", "markPaid ซ้ำ idempotent (ไม่ post เบิ้ล)", es2 === es.length, String(es.length), String(es2));
} catch (e) { chk("CRASH", "harness จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 120) : String(e)); }
finally {
  if (tenantId) { const del = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
    await del(() => prisma.accountJournalLine.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId } }));
    for (const m of ["accountSystemLink","accountMapping","accountLedger","accountPeriod","accountDocSequence","accountSettings","outboxEvent","posPayment","posSaleLine","posSale","posReceiptCounter","ticketAdmission","ticketOrder","ticketType","ticketEvent","appSystemUnit","appSystem"])
      await del(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId } }));
    await del(() => prisma.businessUnit.deleteMany({ where: { tenantId } })); await del(() => prisma.tenant.delete({ where: { id: tenantId } }));
    console.log("[cleanup] ok"); }
  await prisma.$disconnect();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n===== QC Ticket Money =====\nผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => c.id) }));
process.exit(failed.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
