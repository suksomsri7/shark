// QC — POS หน้าขายตัดสต็อก + COGS + void คืนสต็อก (perpetual สำหรับช่องขายหลัก)
// persona: ร้านของชำเชื่อมคลัง + บัญชี — ขายสินค้าจาก catalog (ผูก InvItem) แล้วต้องตัดสต็อก + ลงต้นทุนขาย
// รัน: pnpm exec tsx scripts/qc-pos-inventory.mts
//
// สัญญาที่ตรวจ (pos.createSale / pos.voidSale + inventory bridge · perpetual):
//   - ขายสินค้าที่ line มี itemId → inventory.consume(POS) → onHand ลด + bridge ลง Dr5000/Cr1200 (COGS)
//   - รายการเพิ่มเอง (ไม่มี itemId) → ไม่ตัดสต็อก ไม่มี COGS
//   - void บิล → inventory.receive(POS, key มี refund) → onHand คืน + bridge ลง Dr1200/Cr5000 (กลับ COGS)
//   - trial balance สมดุลตลอด (ทุก entry Dr=Cr)
//   - idempotent: void ซ้ำ → ไม่คืนสต็อก/COGS เบิ้ล
//   - ไม่มีระบบ INVENTORY/ACCOUNT → ขายได้ปกติ ไม่ error ไม่โพสต์ GL

try { process.loadEnvFile(".env"); } catch { /* CI ใช้ secrets ตรง ๆ */ }

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const pos = await import("@/lib/modules/pos/service");
const gl = await import("@/lib/modules/account/gl");
const inventory = await import("@/lib/modules/inventory/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}

let tenantId = "";
let tenantId2 = "";
try {
  // ── setup: ร้านของชำ (POS + คลัง + บัญชี ผูก unit เดียว) ──
  console.log("── setup: ร้านของชำ — POS + INVENTORY + ACCOUNT ผูกหน้าร้าน ──");
  const t = await prisma.tenant.create({ data: { name: "QC POS-INV ร้านของชำ", slug: `qc-posinv-${Date.now()}` } });
  tenantId = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId, type: "BOOKING", name: "หน้าร้าน", slug: `front-${Date.now()}` } });

  const posSys = await sys.createSystem(tenantId, "POS", "POS ร้านของชำ");
  const invSys = await sys.createSystem(tenantId, "INVENTORY", "คลังของชำ");
  const accSys = await sys.createSystem(tenantId, "ACCOUNT", "บัญชี");
  await sys.linkUnit(tenantId, posSys.id, unit.id);
  await sys.linkUnit(tenantId, invSys.id, unit.id); // systemForUnit(unit,"INVENTORY") ต้อง resolve ได้
  await gl.ensureAccounting({ tenantId, systemId: accSys.id });
  const invCtx = { tenantId, systemId: invSys.id };

  // ── helpers บัญชี (scope ระบบ ACCOUNT) ──
  const glOfMovement = async (mvId: string) => {
    const es = await prisma.accountJournalEntry.findMany({
      where: { systemId: accSys.id, refType: "InvMovement", refId: mvId },
      include: { lines: { include: { account: { select: { code: true } } } } },
    });
    const lines = es.flatMap((e) => e.lines).map((l) => ({ code: l.account.code, debit: l.debit, credit: l.credit }));
    const dr = lines.find((l) => l.debit > 0);
    const cr = lines.find((l) => l.credit > 0);
    const sumDr = lines.reduce((a, l) => a + l.debit, 0);
    const sumCr = lines.reduce((a, l) => a + l.credit, 0);
    return { entryCount: es.length, dr, cr, balanced: sumDr === sumCr && sumDr > 0 };
  };
  const trial = async () => {
    const agg = await prisma.accountJournalLine.aggregate({ where: { systemId: accSys.id, entry: { status: "POSTED" } }, _sum: { debit: true, credit: true } });
    return { dr: agg._sum.debit ?? 0, cr: agg._sum.credit ?? 0 };
  };
  const netOf = async (code: string) => {
    const led = await prisma.accountLedger.findFirst({ where: { systemId: accSys.id, code }, select: { id: true } });
    if (!led) return NaN;
    const agg = await prisma.accountJournalLine.aggregate({ where: { systemId: accSys.id, accountId: led.id, entry: { status: "POSTED" } }, _sum: { debit: true, credit: true } });
    return (agg._sum.debit ?? 0) - (agg._sum.credit ?? 0);
  };
  const onHandOf = async (itemId: string) => (await inventory.onHand(invCtx, [itemId]))[0]?.onHand ?? NaN;
  const outMovesOf = async (saleId: string) => prisma.invMovement.findMany({ where: { tenantId, type: "OUT", refType: "PosSale", refId: saleId, sourceModule: "POS" } });
  const inMovesOf = async (saleId: string) => prisma.invMovement.findMany({ where: { tenantId, type: "IN", refType: "PosSale", refId: saleId, sourceModule: "POS" } });

  // ── สินค้าคลัง: รับเข้า 10 ชิ้น @ ต้นทุน ฿50 (5000 สตางค์) ──
  const itemA = await inventory.createItem(invCtx, { sku: "PI-A", name: "น้ำอัดลม" });
  await inventory.receive(invCtx, { itemId: itemA.id, qty: 10, costSatang: 5000, idempotencyKey: "pi-recv-a", sourceModule: "procurement", refType: "PurchaseOrder" });
  chk("PI-1.1", "รับเข้าคลัง → onHand A = 10", (await onHandOf(itemA.id)) === 10, "10", String(await onHandOf(itemA.id)));

  // ── Act 1: ขายสินค้าผูกคลัง (2 ชิ้น) + รายการเพิ่มเอง (ไม่ผูก) ──
  console.log("\n── Act 1: ขาย — line ผูก itemId (ตัดสต็อก) + line เพิ่มเอง (ไม่ตัด) ──");
  const s1 = await pos.createSale({
    tenantId, unitId: unit.id, systemId: posSys.id,
    idempotencyKey: `pi-sale-1-${t.slug}`,
    lines: [
      { name: "น้ำอัดลม", qty: 2, unitPriceSatang: 10000, itemId: itemA.id }, // ขาย ฿100/ชิ้น · ต้นทุน ฿50
      { name: "ถุงหูหิ้ว (บริการ)", qty: 1, unitPriceSatang: 300 }, // ไม่ผูกคลัง
    ],
    payMethods: [{ type: "CASH", amountSatang: 20300 }],
  });
  const dbS1 = await prisma.posSale.findUnique({ where: { id: s1.saleId } });
  chk("PI-2.1", "บิล status=PAID", dbS1?.status === "PAID", "PAID", String(dbS1?.status));
  chk("PI-2.2", "ขายแล้ว onHand A ลดเหลือ 8 (ตัด 2)", (await onHandOf(itemA.id)) === 8, "8", String(await onHandOf(itemA.id)));
  const out1 = await outMovesOf(s1.saleId);
  chk("PI-2.3", "มี InvMovement OUT 1 รายการ (เฉพาะ line ผูก itemId)", out1.length === 1, "1", String(out1.length));
  chk("PI-2.4", "OUT ตัด 2 ชิ้น (qtyDelta=-2) itemId ตรง", out1[0]?.qtyDelta === -2 && out1[0]?.itemId === itemA.id, "-2/itemA", `${out1[0]?.qtyDelta}/${out1[0]?.itemId === itemA.id}`);
  // รายการเพิ่มเอง (บริการ) ต้องไม่มี movement → OUT ทั้งบิลมีแค่ 1 (ตรวจแล้วข้างบน)

  // ── Act 2: COGS จากการขาย → Dr 5000 =100 / Cr 1200 =100 (2 × ต้นทุน ฿50) ──
  console.log("\n── Act 2: COGS ต้นทุนขาย (perpetual) ──");
  const gCogs = await glOfMovement(out1[0].id);
  chk("PI-3.1", "consume → 1 journal entry สมดุล", gCogs.entryCount === 1 && gCogs.balanced, "1/balanced", `${gCogs.entryCount}/${gCogs.balanced}`);
  chk("PI-3.2", "Dr 5000 = 10000 สตางค์ (ต้นทุนขาย 2×50)", gCogs.dr?.code === "5000" && gCogs.dr?.debit === 10000, "5000/10000", `${gCogs.dr?.code}/${gCogs.dr?.debit}`);
  chk("PI-3.3", "Cr 1200 = 10000 สตางค์ (ลดสินค้าคงเหลือ)", gCogs.cr?.code === "1200" && gCogs.cr?.credit === 10000, "1200/10000", `${gCogs.cr?.code}/${gCogs.cr?.credit}`);
  const tbAfterSale = await trial();
  chk("PI-3.4", "trial balance สมดุล (Σdr=Σcr) หลังขาย", tbAfterSale.dr === tbAfterSale.cr, "dr=cr", `${tbAfterSale.dr}/${tbAfterSale.cr}`);

  // ── Act 3: void บิล → คืนสต็อก + กลับ COGS ──
  console.log("\n── Act 3: void บิล → คืนสต็อก + กลับ COGS ──");
  await pos.voidSale(tenantId, unit.id, s1.saleId);
  const dbS1v = await prisma.posSale.findUnique({ where: { id: s1.saleId } });
  chk("PI-4.1", "บิล status=VOIDED", dbS1v?.status === "VOIDED", "VOIDED", String(dbS1v?.status));
  chk("PI-4.2", "void แล้ว onHand A กลับเป็น 10 (คืน 2)", (await onHandOf(itemA.id)) === 10, "10", String(await onHandOf(itemA.id)));
  const in1 = await inMovesOf(s1.saleId);
  chk("PI-4.3", "มี InvMovement IN 1 รายการ (คืนสต็อก)", in1.length === 1 && in1[0]?.qtyDelta === 2, "1/+2", `${in1.length}/${in1[0]?.qtyDelta}`);
  const gRev = await glOfMovement(in1[0].id);
  chk("PI-4.4", "receive คืน → 1 journal entry สมดุล", gRev.entryCount === 1 && gRev.balanced, "1/balanced", `${gRev.entryCount}/${gRev.balanced}`);
  chk("PI-4.5", "Dr 1200 = 10000 (คืนเข้าคลัง)", gRev.dr?.code === "1200" && gRev.dr?.debit === 10000, "1200/10000", `${gRev.dr?.code}/${gRev.dr?.debit}`);
  chk("PI-4.6", "Cr 5000 = 10000 (กลับต้นทุนขาย)", gRev.cr?.code === "5000" && gRev.cr?.credit === 10000, "5000/10000", `${gRev.cr?.code}/${gRev.cr?.credit}`);
  chk("PI-4.7", "net 5000 ต้นทุนขาย = 0 (ขายแล้ว void กลับหมด)", (await netOf("5000")) === 0, "0", String(await netOf("5000")));
  chk("PI-4.8", "net 1200 สินค้าคงเหลือ = 50000 (10×50 ยังอยู่ครบ)", (await netOf("1200")) === 50000, "50000", String(await netOf("1200")));
  const tbAfterVoid = await trial();
  chk("PI-4.9", "trial balance สมดุลหลัง void", tbAfterVoid.dr === tbAfterVoid.cr, "dr=cr", `${tbAfterVoid.dr}/${tbAfterVoid.cr}`);

  // ── Act 4: idempotent — void ซ้ำ → ไม่คืนสต็อก/COGS เบิ้ล ──
  console.log("\n── Act 4: void ซ้ำ → idempotent ──");
  const onHandBefore = await onHandOf(itemA.id);
  const inCountBefore = (await inMovesOf(s1.saleId)).length;
  let voidTwiceRejected = false;
  try { await pos.voidSale(tenantId, unit.id, s1.saleId); } catch { voidTwiceRejected = true; }
  const inCountAfter = (await inMovesOf(s1.saleId)).length;
  chk("PI-5.1", "void ซ้ำ → ปฏิเสธ (บิล VOIDED แล้ว)", voidTwiceRejected, "rejected", String(voidTwiceRejected));
  chk("PI-5.2", "onHand ไม่คืนเบิ้ล (ยัง 10)", (await onHandOf(itemA.id)) === onHandBefore && onHandBefore === 10, "10", String(await onHandOf(itemA.id)));
  chk("PI-5.3", "ไม่มี IN movement เพิ่ม (ยัง 1)", inCountAfter === inCountBefore && inCountAfter === 1, "1", String(inCountAfter));
  chk("PI-5.4", "net 5000 ยัง = 0 (ไม่กลับ COGS เบิ้ล)", (await netOf("5000")) === 0, "0", String(await netOf("5000")));

  // ── Act 5: ไม่มีระบบ INVENTORY/ACCOUNT → ขายได้ปกติ ไม่ error ไม่โพสต์ GL ──
  console.log("\n── Act 5: ร้านไม่มีคลัง/บัญชี → ขายได้ปกติ ──");
  const t2 = await prisma.tenant.create({ data: { name: "QC POS-INV ร้านไม่มีคลัง", slug: `qc-posinv2-${Date.now()}` } });
  tenantId2 = t2.id;
  const unit2 = await prisma.businessUnit.create({ data: { tenantId: tenantId2, type: "BOOKING", name: "หน้าร้าน", slug: `front2-${Date.now()}` } });
  const posSys2 = await sys.createSystem(tenantId2, "POS", "POS ไม่มีคลัง");
  await sys.linkUnit(tenantId2, posSys2.id, unit2.id);
  let noInvErr = true;
  let s2Id = "";
  try {
    const s2 = await pos.createSale({
      tenantId: tenantId2, unitId: unit2.id, systemId: posSys2.id,
      idempotencyKey: `pi-noinv-${t2.slug}`,
      // line มี itemId (จำลอง catalog) แต่ไม่มีระบบ INVENTORY ผูก → ต้องข้ามเงียบ ไม่ error
      lines: [{ name: "สินค้า", qty: 1, unitPriceSatang: 5000, itemId: "ghost-item-id" }],
      payMethods: [{ type: "CASH", amountSatang: 5000 }],
    });
    s2Id = s2.saleId;
  } catch { noInvErr = false; }
  const noInvMoves = await prisma.invMovement.count({ where: { tenantId: tenantId2 } });
  const noInvEntries = await prisma.accountJournalEntry.count({ where: { tenantId: tenantId2 } });
  chk("PI-6.1", "ไม่มีคลัง → ขายผ่าน (PAID) ไม่ error", noInvErr && !!s2Id, "ok", `${noInvErr}/${!!s2Id}`);
  chk("PI-6.2", "ไม่มีคลัง → ไม่มี InvMovement (0)", noInvMoves === 0, "0", String(noInvMoves));
  chk("PI-6.3", "ไม่มีบัญชี → ไม่มี GL entry (0)", noInvEntries === 0, "0", String(noInvEntries));
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? e.message.slice(0, 160) : String(e), "CRITICAL");
} finally {
  for (const tid of [tenantId, tenantId2].filter(Boolean)) {
    const del = async (name: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (err) { console.log(`  ⚠ cleanup ${name}: ${err instanceof Error ? err.message.slice(0, 80) : err}`); }
    };
    await del("journalLine", () => prisma.accountJournalLine.deleteMany({ where: { tenantId: tid } }));
    await del("entry.unlink", () => prisma.accountJournalEntry.updateMany({ where: { tenantId: tid }, data: { reversalOfId: null } }));
    await del("journalEntry", () => prisma.accountJournalEntry.deleteMany({ where: { tenantId: tid } }));
    await del("mapping", () => prisma.accountMapping.deleteMany({ where: { tenantId: tid } }));
    await del("ledger", () => prisma.accountLedger.deleteMany({ where: { tenantId: tid } }));
    await del("period", () => prisma.accountPeriod.deleteMany({ where: { tenantId: tid } }));
    await del("docSeq", () => prisma.accountDocSequence.deleteMany({ where: { tenantId: tid } }));
    await del("settings", () => prisma.accountSettings.deleteMany({ where: { tenantId: tid } }));
    await del("outbox", () => (prisma as never as { outboxEvent?: { deleteMany: (a: unknown) => Promise<unknown> } }).outboxEvent?.deleteMany({ where: { tenantId: tid } }) ?? Promise.resolve());
    await del("posPayment", () => prisma.posPayment.deleteMany({ where: { tenantId: tid } }));
    await del("posLine", () => prisma.posSaleLine.deleteMany({ where: { tenantId: tid } }));
    await del("posSale", () => prisma.posSale.deleteMany({ where: { tenantId: tid } }));
    await del("posCounter", () => prisma.posReceiptCounter.deleteMany({ where: { tenantId: tid } }));
    await del("invMovement", () => prisma.invMovement.deleteMany({ where: { tenantId: tid } }));
    await del("invLocationStock", () => prisma.invLocationStock.deleteMany({ where: { tenantId: tid } }));
    await del("invLot", () => prisma.invLot.deleteMany({ where: { tenantId: tid } }));
    await del("invLocation", () => prisma.invLocation.deleteMany({ where: { tenantId: tid } }));
    await del("invItem", () => prisma.invItem.deleteMany({ where: { tenantId: tid } }));
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
console.log("\n===== QC: POS หน้าขายตัดสต็อก + COGS + void =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
