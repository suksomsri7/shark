// QC — Inventory → บัญชีอัตโนมัติ (perpetual inventory · WO Inventory→Account) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/modules/inventory/service.ts (receive/consume) + account-bridge + account/gl.postInventoryGl:
//   ทุก movement โพสต์ต้นทุนอัตโนมัติเข้าบัญชี (perpetual) ผ่าน account facade — Dr=Cr เป๊ะเสมอ
//   value = |qtyDelta| × costSatang ของ movement · idempotent ต่อ (InvMovement#id#event)
//   | movement          | เงื่อนไข                    | Dr / Cr                       |
//   | consume (OUT)      | ทุกกรณี (ขาย)               | Dr 5000 ต้นทุนขาย / Cr 1200   |
//   | receive procurement| sourceModule=procurement    | Dr 1200 / Cr 2100 เจ้าหนี้    |
//   | receive refund     | ECOM/CLINIC หรือ key มี refund| Dr 1200 / Cr 5000 (กลับ COGS)|
//   | receive manual     | อื่น ๆ                       | Dr 1200 / Cr 3000 ทุนเจ้าของ  |
//   | adjust/transfer    | —                            | ข้าม (out of scope)           |
//   ไม่มีระบบ ACCOUNT → รับ/ตัดได้ปกติ ไม่ error ไม่โพสต์ GL
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const gl = await import("@/lib/modules/account/gl");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = ""; let tid2 = "";
try {
  const inv = (await import("@/lib/modules/inventory/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null; // any จงใจ
  if (!inv || typeof inv.receive !== "function" || typeof inv.consume !== "function") { chk("IA-0", "มี receive/consume ใน inventory/service.ts", false, "มี", "ยังไม่ครบ"); }
  else {
    // ── setup: tenant + ACCOUNT (seed ผัง) + INVENTORY ──
    const t = await prisma.tenant.create({ data: { name: "QC INV-ACC", slug: `qc-invacc-${Date.now()}` } }); tid = t.id;
    const accSys = await sys.createSystem(tid, "ACCOUNT", "บัญชี");
    const invSys = await sys.createSystem(tid, "INVENTORY", "คลัง");
    await gl.ensureAccounting({ tenantId: tid, systemId: accSys.id });
    const invCtx = { tenantId: tid, systemId: invSys.id };

    // helpers บัญชี (scope = ระบบ ACCOUNT)
    const glFor = async (mvId: string) => {
      const es = await prisma.accountJournalEntry.findMany({ where: { systemId: accSys.id, refType: "InvMovement", refId: mvId }, include: { lines: { include: { account: { select: { code: true } } } } } });
      const lines = es.flatMap((e) => e.lines).map((l) => ({ code: l.account.code, debit: l.debit, credit: l.credit }));
      const dr = lines.find((l) => l.debit > 0);
      const cr = lines.find((l) => l.credit > 0);
      const sumDr = lines.reduce((a, l) => a + l.debit, 0);
      const sumCr = lines.reduce((a, l) => a + l.credit, 0);
      return { entryCount: es.length, dr, cr, sumDr, sumCr, balanced: sumDr === sumCr };
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

    const itemA = await inv.createItem(invCtx, { sku: "IA-A", name: "สินค้า A" });
    const itemB = await inv.createItem(invCtx, { sku: "IA-B", name: "สินค้า B" });

    // ── 1) รับของซื้อ (procurement) 10 ชิ้น @50 สตางค์ → Dr 1200 =500 / Cr 2100 =500 ──
    const rc = await inv.receive(invCtx, { itemId: itemA.id, qty: 10, costSatang: 50, idempotencyKey: "po-a1", sourceModule: "procurement", refType: "PurchaseOrder" });
    const gRc = await glFor(rc.id);
    chk("IA-1.1", "receive procurement → 1 entry สมดุล", gRc.entryCount === 1 && gRc.balanced, "1/balanced", `${gRc.entryCount}/${gRc.balanced}`);
    chk("IA-1.2", "Dr 1200 =500 (สินค้าคงเหลือ)", gRc.dr?.code === "1200" && gRc.dr?.debit === 500, "1200/500", `${gRc.dr?.code}/${gRc.dr?.debit}`);
    chk("IA-1.3", "Cr 2100 =500 (เจ้าหนี้การค้า)", gRc.cr?.code === "2100" && gRc.cr?.credit === 500, "2100/500", `${gRc.cr?.code}/${gRc.cr?.credit}`);

    // ── 2) ขายตัดสต็อก (consume) 3 @50 → Dr 5000 =150 / Cr 1200 =150 ──
    const sale = await inv.consume(invCtx, { itemId: itemA.id, qty: 3, idempotencyKey: "sale-a1", sourceModule: "ECOM", refType: "ShopOrder" });
    const gSale = await glFor(sale.id);
    chk("IA-2.1", "consume → 1 entry สมดุล", gSale.entryCount === 1 && gSale.balanced, "1/balanced", `${gSale.entryCount}/${gSale.balanced}`);
    chk("IA-2.2", "Dr 5000 =150 (ต้นทุนขาย)", gSale.dr?.code === "5000" && gSale.dr?.debit === 150, "5000/150", `${gSale.dr?.code}/${gSale.dr?.debit}`);
    chk("IA-2.3", "Cr 1200 =150 (ลดสินค้าคงเหลือ)", gSale.cr?.code === "1200" && gSale.cr?.credit === 150, "1200/150", `${gSale.cr?.code}/${gSale.cr?.credit}`);

    // ── 3) refund คืนสต็อก (receive refund) 3 @50 → Dr 1200 =150 / Cr 5000 =150 (กลับ COGS) ──
    const refund = await inv.receive(invCtx, { itemId: itemA.id, qty: 3, costSatang: 50, idempotencyKey: "ecom-refund-a1", sourceModule: "ECOM" });
    const gRef = await glFor(refund.id);
    chk("IA-3.1", "refund receive → 1 entry สมดุล", gRef.entryCount === 1 && gRef.balanced, "1/balanced", `${gRef.entryCount}/${gRef.balanced}`);
    chk("IA-3.2", "Dr 1200 =150 (คืนเข้าคลัง)", gRef.dr?.code === "1200" && gRef.dr?.debit === 150, "1200/150", `${gRef.dr?.code}/${gRef.dr?.debit}`);
    chk("IA-3.3", "Cr 5000 =150 (กลับต้นทุนขาย)", gRef.cr?.code === "5000" && gRef.cr?.credit === 150, "5000/150", `${gRef.cr?.code}/${gRef.cr?.credit}`);

    // ── 4) manual receive (ไม่มี sourceModule) 4 @25 → Dr 1200 =100 / Cr 3000 =100 ──
    const man = await inv.receive(invCtx, { itemId: itemB.id, qty: 4, costSatang: 25, idempotencyKey: "man-b1" });
    const gMan = await glFor(man.id);
    chk("IA-4.1", "manual receive → 1 entry สมดุล", gMan.entryCount === 1 && gMan.balanced, "1/balanced", `${gMan.entryCount}/${gMan.balanced}`);
    chk("IA-4.2", "Dr 1200 =100", gMan.dr?.code === "1200" && gMan.dr?.debit === 100, "1200/100", `${gMan.dr?.code}/${gMan.dr?.debit}`);
    chk("IA-4.3", "Cr 3000 =100 (ทุนเจ้าของ)", gMan.cr?.code === "3000" && gMan.cr?.credit === 100, "3000/100", `${gMan.cr?.code}/${gMan.cr?.credit}`);

    // ── 5) หลังวงจร buy→sell→refund + manual: ยอดบัญชีตรงคาด + Σdebit=Σcredit ทั้ง ledger ──
    const tb = await trial();
    const n1200 = await netOf("1200"); const n5000 = await netOf("5000"); const n2100 = await netOf("2100"); const n3000 = await netOf("3000");
    chk("IA-5.1", "trial balance สมดุล (Σdebit=Σcredit)", tb.dr === tb.cr && tb.dr === 900, "dr=cr=900", `${tb.dr}/${tb.cr}`);
    chk("IA-5.2", "1200 สินค้าคงเหลือ net = 600 (A 10×50 + B 4×25)", n1200 === 600, "600", String(n1200));
    chk("IA-5.3", "5000 ต้นทุนขาย net = 0 (ขาย 150 แล้ว refund กลับ 150)", n5000 === 0, "0", String(n5000));
    chk("IA-5.4", "2100 เจ้าหนี้ net = -500 (เครดิต 500)", n2100 === -500, "-500", String(n2100));
    chk("IA-5.5", "3000 ทุนเจ้าของ net = -100 (เครดิต 100)", n3000 === -100, "-100", String(n3000));

    // ── 6) idempotent: receive/consume ซ้ำ key เดิม → ไม่โพสต์ GL เบิ้ล ──
    const rc2 = await inv.receive(invCtx, { itemId: itemA.id, qty: 10, costSatang: 50, idempotencyKey: "po-a1", sourceModule: "procurement" });
    const sale2 = await inv.consume(invCtx, { itemId: itemA.id, qty: 3, idempotencyKey: "sale-a1", sourceModule: "ECOM" });
    const gRc2 = await glFor(rc2.id); const gSale2 = await glFor(sale2.id);
    const tb2 = await trial();
    chk("IA-6.1", "receive ซ้ำ → คืน movement เดิม + GL entry ยัง 1 (ไม่เบิ้ล)", rc2.id === rc.id && gRc2.entryCount === 1, "same+1", `${rc2.id === rc.id}/${gRc2.entryCount}`);
    chk("IA-6.2", "consume ซ้ำ → คืน movement เดิม + GL entry ยัง 1 (ไม่เบิ้ล)", sale2.id === sale.id && gSale2.entryCount === 1, "same+1", `${sale2.id === sale.id}/${gSale2.entryCount}`);
    chk("IA-6.3", "trial balance ไม่เปลี่ยน (ยัง 900/900)", tb2.dr === 900 && tb2.cr === 900, "900/900", `${tb2.dr}/${tb2.cr}`);

    // ── 7) ไม่มีระบบ ACCOUNT → receive/consume ทำได้ ไม่ error ไม่โพสต์ ──
    const t2 = await prisma.tenant.create({ data: { name: "QC INV noACC", slug: `qc-invnoacc-${Date.now()}` } }); tid2 = t2.id;
    const invSys2 = await sys.createSystem(tid2, "INVENTORY", "คลัง");
    const invCtx2 = { tenantId: tid2, systemId: invSys2.id };
    let noErr = true; let mvN: any = null; let mvC: any = null;
    try {
      const itemN = await inv.createItem(invCtx2, { sku: "N-1", name: "ไม่มีบัญชี" });
      mvN = await inv.receive(invCtx2, { itemId: itemN.id, qty: 5, costSatang: 10, idempotencyKey: "n-rc", sourceModule: "procurement" });
      mvC = await inv.consume(invCtx2, { itemId: itemN.id, qty: 2, idempotencyKey: "n-sale", sourceModule: "ECOM" });
    } catch { noErr = false; }
    const noAccEntries = await prisma.accountJournalEntry.count({ where: { tenantId: tid2 } });
    const noAccMoves = await prisma.invMovement.count({ where: { tenantId: tid2 } });
    chk("IA-7.1", "ไม่มี ACCOUNT → receive/consume ไม่ error + movement ถูกบันทึก (2)", noErr && !!mvN?.id && !!mvC?.id && noAccMoves === 2, "ok/2moves", `${noErr}/${noAccMoves}`);
    chk("IA-7.2", "ไม่มี ACCOUNT → ไม่มี GL entry เลย (0)", noAccEntries === 0, "0", String(noAccEntries));

    // ── 8) adjust ข้าม GL (out of scope — ต้องไม่โพสต์) ──
    if (typeof inv.adjust === "function") {
      const adj = await inv.adjust(invCtx, { itemId: itemB.id, newQty: 10, idempotencyKey: "adj-b1" });
      const gAdj = await glFor(adj.id);
      chk("IA-8.1", "adjust → ไม่โพสต์ GL (out of scope)", gAdj.entryCount === 0, "0", String(gAdj.entryCount), "MAJOR");
    }
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 200) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: id }, data: { reversalOfId: null } }));
    await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: id } }));
    for (const m of ["accountMapping", "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings", "invMovement", "invLot", "invLocationStock", "invLocation", "invItem", "appNotification", "outboxEvent", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Inventory → Account (perpetual) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
