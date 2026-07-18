// QC — Hotel public booking: ลูกค้าจองห้องออนไลน์ (resolve slug → availability → จอง → publicToken → จ่ายมัดจำ)
// standalone-typesafe: dynamic import + wide cast (ไม่ผูก type ตอน compile)
//
// สัญญา src/lib/modules/hotel/service.ts:
//   resolveHotelUnit(tenantSlug, unitSlug) — public resolve (ACTIVE + type=HOTEL) · ผิด → null
//   listPublicAvailability(tenantId, unitId, from, to) — ห้องว่างน้อยสุดตลอดช่วง ต่อประเภท
//   createReservation(...) — availability guard อะตอมมิก + snapshot มัดจำ + คืน publicToken
//   getPublicReservation(unitId, publicToken) — สถานะการจอง (กัน cross-tenant PII)
//   recordDeposit(tenantId, unitId, reservationId) — บิล POS DEPOSIT (Dr 2110) + depositPaidAt · idempotent
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");
const wiring = await import("@/lib/outbox-consumers");
const svc = (await import("@/lib/modules/hotel/service" as string)) as { [k: string]: (...a: any[]) => Promise<any> };

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};

const IN = "2031-06-10", OUT = "2031-06-11"; // อนาคตไกล (กัน filter อดีต) · 1 คืน
const RATE = 107000; // ฿1,070/คืน
const DEP = 50000;   // มัดจำ ฿500

let tid = ""; let tid2 = "";
try {
  const stamp = Date.now();
  const t = await prisma.tenant.create({ data: { name: "QC HT PUB", slug: `qc-htpub-${stamp}` } }); tid = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "HOTEL", name: "รีสอร์ตริมเล", slug: `htpub-${stamp}` } });
  const posSys = await sys.createSystem(tid, "POS", "ขาย"); await sys.linkUnit(tid, posSys.id, unit.id);
  const accSys = await sys.createSystem(tid, "ACCOUNT", "บัญชี");
  await acc.saveSettings(tid, accSys.id, { orgName: "รีสอร์ต จำกัด", taxId: "0105561177639", vatRegistered: true } as never);
  await gl.ensureAccounting({ tenantId: tid, systemId: accSys.id });
  await prisma.accountSystemLink.create({ data: { tenantId: tid, systemId: accSys.id, linkedKind: "POS", linkedId: posSys.id } });
  await prisma.paymentProfile.create({ data: { tenantId: tid, promptpayId: "0812345678", displayName: "รีสอร์ตริมเล" } });

  // ประเภทห้อง A: มัดจำ DEP, 2 ห้อง (สำหรับ availability + จอง + มัดจำ)
  const rtA = await svc.createRoomType({ tenantId: tid, unitId: unit.id, name: "ดีลักซ์", capacity: 2, baseRateSatang: RATE, depositSatang: DEP });
  await svc.createRoom({ tenantId: tid, unitId: unit.id, roomTypeId: rtA.id, number: "101" });
  await svc.createRoom({ tenantId: tid, unitId: unit.id, roomTypeId: rtA.id, number: "102" });

  const acctSide = async (code: string) => {
    const es = await prisma.accountJournalEntry.findMany({ where: { systemId: accSys.id, refType: "PosSale" }, include: { lines: { include: { account: { select: { code: true } } } } } });
    const dr = es.flatMap((e) => e.lines).filter((l) => l.account.code === code).reduce((a, l) => a + l.debit, 0);
    const cr = es.flatMap((e) => e.lines).filter((l) => l.account.code === code).reduce((a, l) => a + l.credit, 0);
    return { dr, cr, net: dr - cr };
  };

  // ── HP-1: resolveHotelUnit ──
  const r1 = await svc.resolveHotelUnit(`qc-htpub-${stamp}`, `htpub-${stamp}`);
  chk("HP-1.1", "resolveHotelUnit slug ถูก → คืน tenant+unit", !!r1 && r1.unit?.id === unit.id, "unit.id", `${r1?.unit?.id === unit.id}`);
  const r1b = await svc.resolveHotelUnit(`qc-htpub-${stamp}`, "ไม่มีสาขานี้");
  chk("HP-1.2", "resolveHotelUnit slug ผิด → null", r1b === null, "null", JSON.stringify(r1b));

  // ── HP-2: availability ก่อนจอง = 2 ว่าง ──
  const av0 = await svc.listPublicAvailability(tid, unit.id, IN, OUT);
  const avA0 = av0.find((x: any) => x.id === rtA.id);
  chk("HP-2.1", "listPublicAvailability → ดีลักซ์ ว่าง 2 ห้อง + มัดจำ 50000", avA0?.free === 2 && avA0?.depositSatang === DEP, "free2+dep50000", `free=${avA0?.free}/dep=${avA0?.depositSatang}`);

  // ── HP-3: createReservation (public) → publicToken + snapshot มัดจำ ──
  const cr1 = await svc.createReservation({ tenantId: tid, unitId: unit.id, roomTypeId: rtA.id, checkInDate: IN, checkOutDate: OUT, guestName: "สมชาย", guestPhone: "0891112222" });
  const rvId = cr1.id as string;
  const token = cr1.publicToken as string;
  chk("HP-3.1", "createReservation ok + มี publicToken", cr1.ok === true && !!token, "ok+token", `${cr1.ok}/${!!token}`);
  const rvRow = await prisma.hotelReservation.findUnique({ where: { id: rvId } });
  chk("HP-3.2", "snapshot มัดจำ 50000 + ยังไม่จ่าย", rvRow?.depositSatang === DEP && rvRow?.depositPaidAt === null, "50000+null", `${rvRow?.depositSatang}/${rvRow?.depositPaidAt}`);
  const pub = await svc.getPublicReservation(unit.id, token);
  chk("HP-3.3", "getPublicReservation(token) → คืนการจองถูกใบ + ชื่อแขก", pub?.id === rvId && pub?.guestName === "สมชาย", "rvId+สมชาย", `${pub?.id === rvId}/${pub?.guestName}`);
  const av1 = await svc.listPublicAvailability(tid, unit.id, IN, OUT);
  chk("HP-3.4", "จองแล้ว → availability เหลือ 1 ว่าง", av1.find((x: any) => x.id === rtA.id)?.free === 1, "1", `${av1.find((x: any) => x.id === rtA.id)?.free}`);

  // ── HP-4: recordDeposit → บิล DEPOSIT PAID + Dr 2110 + idempotent ──
  const rd = await svc.recordDeposit(tid, unit.id, rvId);
  await wiring.drainAll();
  const saleId = rd.saleId as string;
  const sale = saleId ? await prisma.posSale.findUnique({ where: { id: saleId }, include: { payments: true } }) : null;
  const rvAfter = await prisma.hotelReservation.findUnique({ where: { id: rvId } });
  const dep2110 = await acctSide("2110");
  chk("HP-4.1", "recordDeposit ok + saleId + PAID + DEPOSIT amount=50000", rd.ok === true && sale?.status === "PAID" && sale?.payments?.some((p: any) => p.type === "DEPOSIT" && p.amountSatang === DEP), "PAID+DEPOSIT", `${rd.ok}/${sale?.status}`);
  chk("HP-4.2", "depositPaidAt ตั้ง + depositSaleId ผูกบิล", !!rvAfter?.depositPaidAt && rvAfter?.depositSaleId === saleId, "paidAt+saleId", `${!!rvAfter?.depositPaidAt}/${rvAfter?.depositSaleId === saleId}`);
  chk("HP-4.3", "บัญชี Dr 2110 เงินมัดจำรับ = 50000", dep2110.dr === DEP, String(DEP), `dr=${dep2110.dr}`);
  const rd2 = await svc.recordDeposit(tid, unit.id, rvId);
  await wiring.drainAll();
  const depCount = await prisma.posSale.count({ where: { tenantId: tid, sourceModule: "HOTEL", sourceId: rvId, status: "PAID" } });
  const dep2110b = await acctSide("2110");
  chk("HP-4.4", "recordDeposit ซ้ำ → no-op (1 บิล) + Dr 2110 ไม่เบิ้ล", rd2.ok === true && depCount === 1 && dep2110b.dr === DEP, "1+50000", `${depCount}/${dep2110b.dr}`);

  // ── HP-5: กันจองซ้อน/เกิน capacity (ห้องสุดท้าย) ──
  // ประเภท B: 1 ห้องเดียว → ยิง 2 request พร้อมกัน ช่วงเดียวกัน → สำเร็จ 1
  const rtB = await svc.createRoomType({ tenantId: tid, unitId: unit.id, name: "สวีท (1 ห้อง)", capacity: 2, baseRateSatang: RATE, depositSatang: 0 });
  await svc.createRoom({ tenantId: tid, unitId: unit.id, roomTypeId: rtB.id, number: "201" });
  const race = await Promise.all([
    svc.createReservation({ tenantId: tid, unitId: unit.id, roomTypeId: rtB.id, checkInDate: IN, checkOutDate: OUT, guestName: "แข่ง A", guestPhone: "0810000001" }),
    svc.createReservation({ tenantId: tid, unitId: unit.id, roomTypeId: rtB.id, checkInDate: IN, checkOutDate: OUT, guestName: "แข่ง B", guestPhone: "0810000002" }),
  ]);
  const okCount = race.filter((r: any) => r.ok === true).length;
  const bCount = await prisma.hotelReservation.count({ where: { tenantId: tid, unitId: unit.id, roomTypeId: rtB.id, status: { in: ["BOOKED", "CHECKED_IN"] } } });
  chk("HP-5.1", "จองซ้อนห้องสุดท้าย (2 พร้อมกัน) → สำเร็จ 1 · การจอง active=1", okCount === 1 && bCount === 1, "1+1", `ok=${okCount}/active=${bCount}`);
  const av2 = await svc.listPublicAvailability(tid, unit.id, IN, OUT);
  chk("HP-5.2", "ประเภทเต็ม → availability free=0 (จองต่อไม่ได้)", av2.find((x: any) => x.id === rtB.id)?.free === 0, "0", `${av2.find((x: any) => x.id === rtB.id)?.free}`);

  // ── HP-6: cross-tenant guard (กัน leak PII แขกร้านอื่น) ──
  const t2 = await prisma.tenant.create({ data: { name: "QC HT PUB2", slug: `qc-htpub2-${stamp}` } }); tid2 = t2.id;
  const unitX = await prisma.businessUnit.create({ data: { tenantId: tid2, type: "HOTEL", name: "ร้านอื่น", slug: `htpub2-${stamp}` } });
  const cross = await svc.getPublicReservation(unitX.id, token); // token ร้าน A + unit ร้าน B
  chk("HP-6.1", "publicToken ร้าน A + unit ร้าน B → null (ไม่ leak)", cross === null, "null", JSON.stringify(cross));

  // ── HP-7: งบดุลบิลมัดจำ (Σdr=Σcr) ──
  const allEs = await prisma.accountJournalEntry.findMany({ where: { systemId: accSys.id, refType: "PosSale" }, include: { lines: true } });
  const sdr = allEs.flatMap((e) => e.lines).reduce((a, l) => a + l.debit, 0);
  const scr = allEs.flatMap((e) => e.lines).reduce((a, l) => a + l.credit, 0);
  chk("HP-7.1", "ทุก journal entry สมดุล Σdr=Σcr", sdr === scr && sdr > 0, String(sdr), String(scr));
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 200) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: id } }));
    for (const m of ["accountSystemLink", "accountMapping", "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings", "hotelReservation", "hotelRoom", "hotelRoomType", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "paymentProfile", "customer", "outboxEvent", "appNotification", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Hotel Public =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
