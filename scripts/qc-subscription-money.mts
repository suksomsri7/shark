// QC — Subscription→POS→บัญชี (WO-Wave4-D): สมัครสมาชิก "มีราคา" → เก็บเงินจริง + ลงบัญชี
// ⚠️ Oracle ของ Fable — Builder ห้ามแตะ · fail-before: subscribe เดิมสร้าง MemberSubscription เฉย ๆ
//   ไม่เก็บเงิน → SM-2.* แดง (ไม่มี posSale/journal)
//
// สัญญา (mirror school/ticket/hotel — ปิดเงินผ่าน pos.createSale chokepoint C-2):
//   subscribe(ctx{tenantId,systemId=MEMBER}, {customerId, planId, startAt?, payMethod?})
//     → สร้าง MemberSubscription ACTIVE
//     → ถ้า plan.priceSatang > 0 และระบบ MEMBER ผูก unit ที่มี POS → pos.createSale
//        (sourceModule "MEMBER", idempotencyKey `subscription-<subId>`) → ลงบัญชีอัตโนมัติ
//     → ไม่ผูก POS = standalone: สมัครได้ ไม่เก็บเงิน · ราคา 0 = ฟรี ไม่ออกบิล
try { process.loadEnvFile(".env"); } catch { /* CI */ }
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");
const wiring = await import("@/lib/outbox-consumers");
const sub = await import("@/lib/modules/member/subscription");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};

let tid = "";
try {
  const t = await prisma.tenant.create({ data: { name: "QC SUB MONEY", slug: `qc-sbm-${Date.now()}` } });
  tid = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "ฟิตเนส", slug: "gym" } });

  // ระบบ MEMBER + POS ผูก unit เดียวกัน (resolve ข้ามระบบผ่าน unit ร่วม)
  const memberSys = await sys.createSystem(tid, "MEMBER", "สมาชิก"); await sys.linkUnit(tid, memberSys.id, unit.id);
  const posSys = await sys.createSystem(tid, "POS", "POS ฟิตเนส"); await sys.linkUnit(tid, posSys.id, unit.id);

  // ระบบบัญชี + ผูก POS → ยอดขายลงบัญชีอัตโนมัติ (contract 2.4)
  const accSys = await sys.createSystem(tid, "ACCOUNT", "บัญชี");
  await acc.saveSettings(tid, accSys.id, { orgName: "ฟิตเนส จำกัด", taxId: "0105561177639", vatRegistered: true } as never);
  await gl.ensureAccounting({ tenantId: tid, systemId: accSys.id });
  await prisma.accountSystemLink.create({ data: { tenantId: tid, systemId: accSys.id, linkedKind: "POS", linkedId: posSys.id } });

  const ctx = { tenantId: tid, systemId: memberSys.id };
  const cust = await prisma.customer.create({ data: { tenantId: tid, memberSystemId: memberSys.id, name: "คุณสมาชิก" } });

  // ── happy: แพ็กเกจมีราคา → subscribe → เก็บเงิน + ลงบัญชี ──
  const plan = await sub.createPlan(ctx, { name: "รายเดือน", priceSatang: 59900, periodDays: 30 });
  const s1 = await sub.subscribe(ctx, { customerId: cust.id, planId: plan.id, payMethod: "PROMPTPAY" });
  const row = await prisma.memberSubscription.findUnique({ where: { id: s1.id } });
  chk("SM-1.1", "subscribe → MemberSubscription ACTIVE", row?.status === "ACTIVE", "ACTIVE", String(row?.status));

  await wiring.drainAll(); // เก็บตก outbox (createSale drain ในตัวแล้ว — เผื่อ)
  const sale = await prisma.posSale.findFirst({ where: { tenantId: tid, idempotencyKey: `subscription-${s1.id}` } });
  chk("SM-2.1", "เกิด posSale จากการสมัคร (idempotencyKey subscription-<id>)", !!sale, "posSale", sale ? "มี" : "ไม่มี");
  chk("SM-2.2", "posSale.status = PAID", sale?.status === "PAID", "PAID", String(sale?.status));
  chk("SM-2.3", "posSale.sourceModule = MEMBER", sale?.sourceModule === "MEMBER", "MEMBER", String(sale?.sourceModule));
  chk("SM-2.4", "posSale.grandTotal = ราคาแพ็กเกจ (59900)", sale?.grandTotalSatang === 59900, "59900", String(sale?.grandTotalSatang));
  chk("SM-2.5", "posSale.memberId = ลูกค้า", sale?.memberId === cust.id, cust.id.slice(0, 8), String(sale?.memberId).slice(0, 8));
  const pay = sale ? await prisma.posPayment.findFirst({ where: { saleId: sale.id } }) : null;
  chk("SM-2.6", "payMethod PROMPTPAY ถูกส่งต่อ", pay?.type === "PROMPTPAY", "PROMPTPAY", String(pay?.type));

  // ลงบัญชี (journal entry ผูก PosSale)
  const es = await prisma.accountJournalEntry.findMany({
    where: { systemId: accSys.id, refType: "PosSale" },
    include: { lines: true },
  });
  chk("SM-3.1", "ยอดค่าสมาชิก → journal entry อัตโนมัติ", es.length >= 1, "≥1", String(es.length));
  const dr = es.flatMap((e) => e.lines).reduce((a, l) => a + l.debit, 0);
  const cr = es.flatMap((e) => e.lines).reduce((a, l) => a + l.credit, 0);
  chk("SM-3.2", "Σdr = Σcr (บัญชีดุล)", dr === cr && dr > 0, String(dr), String(cr));

  // ── idempotency: createSale ด้วย key เดิมซ้ำ → ไม่เกิดบิลใหม่ ──
  const pos = await import("@/lib/modules/pos/service");
  const before = await prisma.posSale.count({ where: { tenantId: tid } });
  const dup = await pos.createSale({
    tenantId: tid, unitId: unit.id, systemId: posSys.id, memberId: cust.id,
    sourceModule: "MEMBER", sourceId: s1.id, idempotencyKey: `subscription-${s1.id}`,
    lines: [{ name: "ค่าสมาชิก รายเดือน", qty: 1, unitPriceSatang: 59900 }],
    payMethods: [{ type: "CASH", amountSatang: 59900 }],
  });
  const after = await prisma.posSale.count({ where: { tenantId: tid } });
  chk("SM-4.1", "createSale ซ้ำ key เดิม → ไม่เกิดบิลใหม่ (idempotent)", after === before && dup.saleId === sale?.id, String(before), String(after));

  // ── ราคา 0 = ฟรี → subscribe ได้ ไม่มี posSale ──
  const cust2 = await prisma.customer.create({ data: { tenantId: tid, memberSystemId: memberSys.id, name: "คุณฟรี" } });
  const freePlan = await sub.createPlan(ctx, { name: "ทดลองฟรี", priceSatang: 0, periodDays: 7 });
  const sFree = await sub.subscribe(ctx, { customerId: cust2.id, planId: freePlan.id });
  await wiring.drainAll();
  const freeSale = await prisma.posSale.findFirst({ where: { tenantId: tid, idempotencyKey: `subscription-${sFree.id}` } });
  const freeRow = await prisma.memberSubscription.findUnique({ where: { id: sFree.id } });
  chk("SM-5.1", "แพ็กเกจฟรี → subscribe ACTIVE ได้", freeRow?.status === "ACTIVE", "ACTIVE", String(freeRow?.status));
  chk("SM-5.2", "แพ็กเกจฟรี → ไม่มี posSale", !freeSale, "ไม่มี", freeSale ? "มี" : "ไม่มี");

  // ── ไม่ผูก POS = standalone → subscribe ได้ ไม่ error ไม่มี posSale ──
  const memberSys2 = await sys.createSystem(tid, "MEMBER", "สมาชิก standalone");
  const unit2 = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "สปา", slug: "spa" } });
  await sys.linkUnit(tid, memberSys2.id, unit2.id); // ผูกเฉพาะ MEMBER — ไม่มี POS บน unit นี้
  const ctx2 = { tenantId: tid, systemId: memberSys2.id };
  const cust3 = await prisma.customer.create({ data: { tenantId: tid, memberSystemId: memberSys2.id, name: "คุณสปา" } });
  const planSa = await sub.createPlan(ctx2, { name: "รายปี", priceSatang: 120000, periodDays: 365 });
  let sSa: { id: string } | null = null; let sErr = "";
  try { sSa = await sub.subscribe(ctx2, { customerId: cust3.id, planId: planSa.id }); } catch (e) { sErr = e instanceof Error ? e.message : String(e); }
  chk("SM-6.1", "ไม่ผูก POS → subscribe สำเร็จ ไม่ error", !!sSa && !sErr, "ได้", sErr || "ได้");
  const saSale = sSa ? await prisma.posSale.findFirst({ where: { tenantId: tid, idempotencyKey: `subscription-${sSa.id}` } }) : null;
  chk("SM-6.2", "ไม่ผูก POS → ไม่มี posSale (ข้ามการเก็บเงิน)", !saSale, "ไม่มี", saSale ? "มี" : "ไม่มี");
} catch (e) {
  chk("CRASH", "harness จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: tid } }));
    for (const m of ["accountSystemLink", "accountMapping", "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings", "outboxEvent", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "memberSubscription", "memberPlan", "memberActivity", "customer", "appSystemUnit", "appSystem"])
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
    console.log("[cleanup] ok");
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Subscription Money =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
