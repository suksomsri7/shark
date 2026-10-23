// QC — Rental public storefront: ลูกค้าจองเช่าเอง (resolve slug → assets/available → จอง → publicToken → จ่ายมัดจำ)
// standalone-typesafe: dynamic import + wide cast (ไม่ผูก type ตอน compile)
//
// สัญญา src/lib/modules/rental/service.ts:
//   resolveRentalUnit(tenantSlug, unitSlug) — public resolve (ACTIVE + type=RENTAL) · ผิด → null
//   listPublicRentalAssets(ctx, {from,to}) — สินทรัพย์ + available ต่อช่วง
//   createBooking(ctx, ...) — FOR UPDATE lock กันจองซ้อน + snapshot depositSatang + คืน publicToken
//   getPublicBooking(unitId, publicToken) — สถานะการจอง (กัน cross-tenant PII)
//   recordRentalDeposit(ctx, bookingId) — บิล POS DEPOSIT (Dr 2110) + depositPaidAt · idempotent
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-rental-public"); // 🔴 กัน prod: .env ดิบ = production · export env ของ .env.qc มาก่อน หรือ QC_ENV_FILE=.env.qc
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");
const wiring = await import("@/lib/outbox-consumers");
const svc = (await import("@/lib/modules/rental/service" as string)) as { [k: string]: (...a: any[]) => Promise<any> };

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const FROM = "2031-06-10", TO = "2031-06-13"; // อนาคตไกล · 3 วัน
const RATE = 30000; // ฿300/วัน
const DEP = 50000;  // มัดจำ ฿500

let tid = ""; let tid2 = "";
try {
  const stamp = Date.now();
  const t = await prisma.tenant.create({ data: { name: "QC RT PUB", slug: `qc-rtpub-${stamp}` } }); tid = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RENTAL", name: "เช่ารถริมเล", slug: `rtpub-${stamp}` } });
  const posSys = await sys.createSystem(tid, "POS", "ขาย"); await sys.linkUnit(tid, posSys.id, unit.id);
  const accSys = await sys.createSystem(tid, "ACCOUNT", "บัญชี");
  await acc.saveSettings(tid, accSys.id, { orgName: "เช่ารถ จำกัด", taxId: "0105561177639", vatRegistered: true } as never);
  await gl.ensureAccounting({ tenantId: tid, systemId: accSys.id });
  await prisma.accountSystemLink.create({ data: { tenantId: tid, systemId: accSys.id, linkedKind: "POS", linkedId: posSys.id } });
  await prisma.paymentProfile.create({ data: { tenantId: tid, promptpayId: "0812345678", displayName: "เช่ารถริมเล" } });

  const ctx = { tenantId: tid, unitId: unit.id };
  const a1 = await svc.createAsset(ctx, { name: "มอเตอร์ไซค์ A", dailyRateSatang: RATE, depositSatang: DEP });

  const acctSide = async (code: string) => {
    const es = await prisma.accountJournalEntry.findMany({ where: { systemId: accSys.id, refType: "PosSale" }, include: { lines: { include: { account: { select: { code: true } } } } } });
    const dr = es.flatMap((e) => e.lines).filter((l) => l.account.code === code).reduce((a, l) => a + l.debit, 0);
    const cr = es.flatMap((e) => e.lines).filter((l) => l.account.code === code).reduce((a, l) => a + l.credit, 0);
    return { dr, cr, net: dr - cr };
  };

  // ── RP-1: resolveRentalUnit ──
  const r1 = await svc.resolveRentalUnit(`qc-rtpub-${stamp}`, `rtpub-${stamp}`);
  chk("RP-1.1", "resolveRentalUnit slug ถูก → คืน tenant+unit", !!r1 && r1.unit?.id === unit.id, "unit.id", `${r1?.unit?.id === unit.id}`);
  const r1b = await svc.resolveRentalUnit(`qc-rtpub-${stamp}`, "ไม่มีสาขานี้");
  chk("RP-1.2", "resolveRentalUnit slug ผิด → null", r1b === null, "null", JSON.stringify(r1b));

  // ── RP-2: listPublicRentalAssets ก่อนจอง = ว่าง ──
  const av0 = await svc.listPublicRentalAssets(ctx, { from: D(FROM), to: D(TO) });
  const avA0 = av0.find((x: any) => x.id === a1.id);
  chk("RP-2.1", "listPublicRentalAssets → asset ว่าง + มัดจำ 50000", avA0?.available === true && avA0?.depositSatang === DEP, "avail+dep50000", `avail=${avA0?.available}/dep=${avA0?.depositSatang}`);

  // ── RP-3: createBooking (public) → publicToken + snapshot มัดจำ ──
  const cr1 = await svc.createBooking(ctx, { assetId: a1.id, customerName: "สมชาย", customerPhone: "0891112222", startDate: D(FROM), endDate: D(TO) });
  const bkId = cr1.id as string;
  const token = cr1.publicToken as string;
  chk("RP-3.1", "createBooking ok + มี publicToken + 3 วัน + quote 900", !!bkId && !!token && cr1.days === 3 && cr1.quoteSatang === 90000, "id+token+3+90000", `${!!bkId}/${!!token}/${cr1.days}/${cr1.quoteSatang}`);
  const bkRow = await prisma.rentalBooking.findUnique({ where: { id: bkId } });
  chk("RP-3.2", "snapshot มัดจำ 50000 + ยังไม่จ่าย", bkRow?.depositSatang === DEP && bkRow?.depositPaidAt === null, "50000+null", `${bkRow?.depositSatang}/${bkRow?.depositPaidAt}`);
  const pub = await svc.getPublicBooking(unit.id, token);
  chk("RP-3.3", "getPublicBooking(token) → คืนการจองถูกใบ + ชื่อลูกค้า", pub?.id === bkId && pub?.customerName === "สมชาย", "bkId+สมชาย", `${pub?.id === bkId}/${pub?.customerName}`);
  const av1 = await svc.listPublicRentalAssets(ctx, { from: D(FROM), to: D(TO) });
  chk("RP-3.4", "จองแล้ว → asset ช่วงเดิม available=false", av1.find((x: any) => x.id === a1.id)?.available === false, "false", `${av1.find((x: any) => x.id === a1.id)?.available}`);
  const av1b = await svc.listPublicRentalAssets(ctx, { from: D("2031-07-01"), to: D("2031-07-03") });
  chk("RP-3.5", "ช่วงอื่นที่ไม่ชน → available=true", av1b.find((x: any) => x.id === a1.id)?.available === true, "true", `${av1b.find((x: any) => x.id === a1.id)?.available}`);

  // ── RP-4: recordRentalDeposit → บิล DEPOSIT PAID + Dr 2110 + idempotent ──
  const rd = await svc.recordRentalDeposit(ctx, bkId);
  await wiring.drainAll();
  const saleId = rd.saleId as string;
  const sale = saleId ? await prisma.posSale.findUnique({ where: { id: saleId }, include: { payments: true } }) : null;
  const bkAfter = await prisma.rentalBooking.findUnique({ where: { id: bkId } });
  const dep2110 = await acctSide("2110");
  // ORACLE-EDIT CD-P51-O9 (POS P5.1 fix batch C · 23 Oct): ใบรับจ่ายด้วยวิธีจริง — ฟอร์มไม่มีช่องวิธีรับ = TRANSFER (เดิม DEPOSIT) ◂
  chk("RP-4.1", "[CD-P51-O9] recordRentalDeposit ok + saleId + PAID + TRANSFER amount=50000", rd.ok === true && sale?.status === "PAID" && sale?.payments?.some((p: any) => p.type === "TRANSFER" && p.amountSatang === DEP), "PAID+TRANSFER", `${rd.ok}/${sale?.status}`);
  chk("RP-4.2", "depositPaidAt ตั้ง + depositSaleId ผูกบิล", !!bkAfter?.depositPaidAt && bkAfter?.depositSaleId === saleId, "paidAt+saleId", `${!!bkAfter?.depositPaidAt}/${bkAfter?.depositSaleId === saleId}`);
  // ORACLE-EDIT CD-P51-O6b (POS P5.1 batch B · 23 Oct): มัดจำ = ใบรับ POS_DEPOSIT 1 ใบ (sourceId = PosDeposit.id) PAID ·
  //   JV Cr 2110 ฐาน 46729 + Cr 2200 VAT 3271 (= 50000 · VAT 7% รวม) · ไม่มี Dr 2110 · ไม่มีบรรทัด 4xxx (เดิม: บิล RENTAL Dr 2110 / Cr รายได้ = hunt M-A F2) ◂
  const DEP_BASE = 46_729, DEP_VAT = 3_271;
  const dep2200 = await acctSide("2200");
  const depRow = saleId ? await prisma.posDeposit.findUnique({ where: { receiptSaleId: saleId } }) : null;
  const rcptJv = saleId ? await prisma.accountJournalEntry.findMany({ where: { systemId: accSys.id, refType: "PosSale", refId: saleId }, include: { lines: { include: { account: { select: { code: true } } } } } }) : [];
  const rcpt4 = rcptJv.flatMap((e) => e.lines).filter((l) => l.account.code.startsWith("4")).length;
  const rcptOk = sale?.sourceModule === "POS_DEPOSIT" && sale?.status === "PAID" && !!depRow && sale?.sourceId === depRow.id;
  chk("RP-4.3", "[CD-P51-O6b] ใบรับ POS_DEPOSIT (sourceId = PosDeposit) PAID · Cr 2110 46729 + Cr 2200 3271 · ไม่มี Dr 2110 · ไม่มี 4xxx", rcptOk && dep2110.cr === DEP_BASE && dep2110.dr === 0 && dep2200.cr === DEP_VAT && rcptJv.length > 0 && rcpt4 === 0, `POS_DEPOSIT+cr2110=${DEP_BASE}+cr2200=${DEP_VAT}+no4xxx`, `${sale?.sourceModule}/${sale?.status}/dep=${!!depRow} dr2110=${dep2110.dr} cr2110=${dep2110.cr} cr2200=${dep2200.cr} 4xxx=${rcpt4}`);
  const rd2 = await svc.recordRentalDeposit(ctx, bkId);
  await wiring.drainAll();
  const depCount = await prisma.posSale.count({ where: { tenantId: tid, sourceModule: "POS_DEPOSIT", docType: "SALE", status: "PAID" } }); // ORACLE-EDIT CD-P51-O6b: นับใบรับ POS_DEPOSIT (เดิม RENTAL) ◂
  const dep2110b = await acctSide("2110");
  const dep2200b = await acctSide("2200");
  chk("RP-4.4", "[CD-P51-O6b] recordRentalDeposit ซ้ำ → no-op (ใบรับ POS_DEPOSIT 1 ใบ) + Cr 2110/2200 ไม่เบิ้ล", rd2.ok === true && depCount === 1 && dep2110b.cr === DEP_BASE && dep2110b.dr === 0 && dep2200b.cr === DEP_VAT, `1+cr2110=${DEP_BASE}+cr2200=${DEP_VAT}`, `${depCount}/dr2110=${dep2110b.dr} cr2110=${dep2110b.cr} cr2200=${dep2200b.cr}`); // ORACLE-EDIT CD-P51-O6b (POS P5.1 batch B · 23 Oct) ◂

  // ── RP-5: กันจองซ้อน (2 request พร้อมกัน asset เดียว ช่วงชนกัน) → สำเร็จ 1 ──
  const a2 = await svc.createAsset(ctx, { name: "จักรยาน B", dailyRateSatang: RATE, depositSatang: 0 });
  const race = await Promise.all([
    svc.createBooking(ctx, { assetId: a2.id, customerName: "แข่ง A", customerPhone: "0810000001", startDate: D("2031-08-01"), endDate: D("2031-08-03") }).then((r: any) => ({ ok: true, r })).catch(() => ({ ok: false })),
    svc.createBooking(ctx, { assetId: a2.id, customerName: "แข่ง B", customerPhone: "0810000002", startDate: D("2031-08-01"), endDate: D("2031-08-03") }).then((r: any) => ({ ok: true, r })).catch(() => ({ ok: false })),
  ]);
  const okCount = race.filter((r: any) => r.ok === true).length;
  const activeCount = await prisma.rentalBooking.count({ where: { tenantId: tid, unitId: unit.id, assetId: a2.id, status: { in: ["BOOKED", "PICKED_UP"] } } });
  chk("RP-5.1", "จองซ้อน asset เดียว (2 พร้อมกัน) → สำเร็จ 1 · booking active=1", okCount === 1 && activeCount === 1, "1+1", `ok=${okCount}/active=${activeCount}`);
  const av2 = await svc.listPublicRentalAssets(ctx, { from: D("2031-08-01"), to: D("2031-08-03") });
  chk("RP-5.2", "ช่วงถูกจอง → available=false (จองต่อไม่ได้)", av2.find((x: any) => x.id === a2.id)?.available === false, "false", `${av2.find((x: any) => x.id === a2.id)?.available}`);

  // ── RP-6: cross-tenant guard (กัน leak PII ลูกค้าร้านอื่น) ──
  const t2 = await prisma.tenant.create({ data: { name: "QC RT PUB2", slug: `qc-rtpub2-${stamp}` } }); tid2 = t2.id;
  const unitX = await prisma.businessUnit.create({ data: { tenantId: tid2, type: "RENTAL", name: "ร้านอื่น", slug: `rtpub2-${stamp}` } });
  const cross = await svc.getPublicBooking(unitX.id, token); // token ร้าน A + unit ร้าน B
  chk("RP-6.1", "publicToken ร้าน A + unit ร้าน B → null (ไม่ leak)", cross === null, "null", JSON.stringify(cross));

  // ── RP-7: งบดุลบิลมัดจำ (Σdr=Σcr) ──
  const allEs = await prisma.accountJournalEntry.findMany({ where: { systemId: accSys.id, refType: "PosSale" }, include: { lines: true } });
  const sdr = allEs.flatMap((e) => e.lines).reduce((a, l) => a + l.debit, 0);
  const scr = allEs.flatMap((e) => e.lines).reduce((a, l) => a + l.credit, 0);
  chk("RP-7.1", "ทุก journal entry สมดุล Σdr=Σcr", sdr === scr && sdr > 0, String(sdr), String(scr));
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 200) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: id } }));
    for (const m of ["accountSystemLink", "accountMapping", "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings", "rentalBooking", "rentalAsset", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "paymentProfile", "customer", "outboxEvent", "appNotification", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Rental Public =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
