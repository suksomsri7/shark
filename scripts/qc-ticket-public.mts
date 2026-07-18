// QC — Ticket public storefront: ลูกค้าซื้อตั๋วเอง (resolve slug → list events → order PENDING → publicToken
//   → ร้าน markPaid → posSale PAID + ตั๋ว VALID → เช็คอิน → capacity race → cross-tenant)
// standalone-typesafe: dynamic import + wide cast (ไม่ผูก type ตอน compile)
//
// สัญญา src/lib/modules/ticket/service.ts:
//   resolveUnit(tenantSlug, unitSlug) — public resolve (ACTIVE + type=TICKET) · ผิด → null
//   listPublicEvents(tenantId, unitId) — งาน PUBLISHED + ประเภทตั๋ว active + ราคา + คงเหลือ
//   getPublicEvent(tenantId, unitId, eventId) — งานเดียวเฉพาะ PUBLISHED (gate ก่อนรับออเดอร์)
//   createOrder(ctx, {channel:"ONLINE"}) — PENDING + publicToken + capacity guard อะตอมมิก
//   getPublicOrder(unitId, publicToken) — สถานะ + ตั๋วรายใบ (กัน cross-tenant)
//   markPaid(ctx, orderId) — posSale PAID (ลงบัญชี) · idempotent
//   checkIn(ctx, code) — VALID→CHECKED_IN (กันซ้ำ)
//   promptpayForOrder(tenantId, unitId, orderId) — payload PromptPay ยอดตั๋ว
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");
const wiring = await import("@/lib/outbox-consumers");
const svc = (await import("@/lib/modules/ticket/service" as string)) as { [k: string]: (...a: any[]) => Promise<any> };

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};

const PRICE = 10700; // ฿107 (รวม VAT)
let tid = ""; let tid2 = "";
try {
  const stamp = Date.now();
  const tSlug = `qc-tkpub-${stamp}`;
  const uSlug = `tkpub-${stamp}`;
  const t = await prisma.tenant.create({ data: { name: "QC TK PUB", slug: tSlug } }); tid = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "TICKET", name: "อีเวนต์ริมเล", slug: uSlug } });
  const posSys = await sys.createSystem(tid, "POS", "ขายตั๋ว"); await sys.linkUnit(tid, posSys.id, unit.id);
  const accSys = await sys.createSystem(tid, "ACCOUNT", "บัญชี");
  await acc.saveSettings(tid, accSys.id, { orgName: "อีเวนต์ จำกัด", taxId: "0105561177639", vatRegistered: true } as never);
  await gl.ensureAccounting({ tenantId: tid, systemId: accSys.id });
  await prisma.accountSystemLink.create({ data: { tenantId: tid, systemId: accSys.id, linkedKind: "POS", linkedId: posSys.id } });
  await prisma.paymentProfile.create({ data: { tenantId: tid, promptpayId: "0812345678", displayName: "อีเวนต์ริมเล" } });

  const ctx = { tenantId: tid, unitId: unit.id };
  const startAt = new Date(Date.now() + 7 * 86400000);

  // งาน A (PUBLISHED) — ประเภททั่วไป quota 3 · งาน B (DRAFT) — ต้องไม่โผล่ใน public
  const evA = await svc.createEvent(ctx, { name: "คอนเสิร์ตริมเล", venue: "ลานหน้าหาด", startAt });
  const evAId = evA.id as string;
  const ttA = await svc.addTicketType(ctx, evAId, { name: "บัตรทั่วไป", priceSatang: PRICE, quota: 3 });
  const ttAId = ttA.id as string;
  await svc.publishEvent(ctx, evAId);
  const evB = await svc.createEvent(ctx, { name: "งานร่าง (ยังไม่เปิด)", startAt });
  await svc.addTicketType(ctx, (evB.id as string), { name: "ร่าง", priceSatang: 5000, quota: 10 });

  const acctSide = async (code: string) => {
    const es = await prisma.accountJournalEntry.findMany({ where: { systemId: accSys.id, refType: "PosSale" }, include: { lines: { include: { account: { select: { code: true } } } } } });
    const dr = es.flatMap((e) => e.lines).filter((l) => l.account.code === code).reduce((a, l) => a + l.debit, 0);
    const cr = es.flatMap((e) => e.lines).filter((l) => l.account.code === code).reduce((a, l) => a + l.credit, 0);
    return { dr, cr, net: dr - cr };
  };

  // ── TP-1: resolveUnit ──
  const r1 = await svc.resolveUnit(tSlug, uSlug);
  chk("TP-1.1", "resolveUnit slug ถูก → tenant+unit", !!r1 && r1.unit?.id === unit.id, "unit.id", `${r1?.unit?.id === unit.id}`);
  const r1b = await svc.resolveUnit(tSlug, "ไม่มีสาขานี้");
  chk("TP-1.2", "resolveUnit slug ผิด → null", r1b === null, "null", JSON.stringify(r1b));

  // ── TP-2: list public events → เฉพาะ PUBLISHED + ราคา/คงเหลือ ──
  const evs = await svc.listPublicEvents(tid, unit.id);
  const evPub = evs.find((x: any) => x.id === evAId);
  chk("TP-2.1", "listPublicEvents → คืนงาน PUBLISHED เท่านั้น (1 งาน)", evs.length === 1 && !!evPub, "1", String(evs.length));
  const typ = evPub?.types?.find((x: any) => x.id === ttAId);
  chk("TP-2.2", "ประเภทตั๋ว: ราคา 10700 + คงเหลือ 3", typ?.priceSatang === PRICE && typ?.remaining === 3, "107/3", `${typ?.priceSatang}/${typ?.remaining}`);
  const gpDraft = await svc.getPublicEvent(tid, unit.id, (evB.id as string));
  chk("TP-2.3", "getPublicEvent(DRAFT) → null (public ห้ามซื้อ DRAFT)", gpDraft === null, "null", JSON.stringify(gpDraft));

  // ── TP-3: createOrder (public ONLINE) → PENDING + publicToken ──
  const ord = await svc.createOrder(ctx, { eventId: evAId, buyerName: "สมหญิง", buyerPhone: "0891112222", lines: [{ ticketTypeId: ttAId, qty: 2 }], channel: "ONLINE" });
  chk("TP-3.1", "createOrder ok + publicToken + 2 ใบ", ord.ok === true && !!ord.publicToken && ord.admissionCount === 2, "ok+token+2", `${ord.ok}/${!!ord.publicToken}/${ord.admissionCount}`);
  const token = ord.publicToken as string;
  const orderId = ord.orderId as string;
  const ordRow = await prisma.ticketOrder.findUnique({ where: { id: orderId } });
  chk("TP-3.2", "ออเดอร์ PENDING + channel ONLINE + total 21400", ordRow?.status === "PENDING" && ordRow?.channel === "ONLINE" && ordRow?.totalSatang === PRICE * 2, "PENDING/ONLINE/21400", `${ordRow?.status}/${ordRow?.channel}/${ordRow?.totalSatang}`);
  const pub0 = await svc.getPublicOrder(unit.id, token);
  chk("TP-3.3", "getPublicOrder(token) → ออเดอร์ถูกใบ + ชื่อผู้ซื้อ + 2 ตั๋ว", pub0?.id === orderId && pub0?.buyerName === "สมหญิง" && pub0?.admissions?.length === 2, "orderId+สมหญิง+2", `${pub0?.id === orderId}/${pub0?.buyerName}/${pub0?.admissions?.length}`);
  chk("TP-3.4", "ก่อนจ่าย: ตั๋วยัง VALID (ยังไม่โชว์เช็คอิน)", pub0?.admissions?.every((a: any) => a.status === "VALID"), "VALID", `${pub0?.admissions?.map((a: any) => a.status).join(",")}`);
  const pp = await svc.promptpayForOrder(tid, unit.id, orderId);
  chk("TP-3.5", "promptpayForOrder → payload PromptPay (ยอดตั๋ว)", !!pp?.payload && pp.payload.length > 20, "payload", `${!!pp?.payload}`);
  const evAfter = await svc.listPublicEvents(tid, unit.id);
  chk("TP-3.6", "จองแล้ว → คงเหลือ 1 (3-2)", evAfter[0]?.types?.find((x: any) => x.id === ttAId)?.remaining === 1, "1", `${evAfter[0]?.types?.find((x: any) => x.id === ttAId)?.remaining}`);

  // ── TP-4: ร้าน markPaid → posSale PAID + ลงบัญชี + ตั๋วโผล่ ──
  await svc.markPaid(ctx, orderId);
  await wiring.drainAll();
  const sale = await prisma.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId: tid, idempotencyKey: `ticket-sale-${orderId}` } } });
  const es = await prisma.accountJournalEntry.findMany({ where: { systemId: accSys.id, refType: "PosSale" }, include: { lines: true } });
  chk("TP-4.1", "markPaid → posSale PAID (ลงบัญชี)", sale?.status === "PAID" && es.length >= 1, "PAID+≥1", `${sale?.status}/${es.length}`);
  const rev4000 = await acctSide("4000");
  chk("TP-4.2", "Cr รายได้ 4000 = ฐานหลังถอด VAT", rev4000.cr === Math.round((PRICE * 2) / 1.07), String(Math.round((PRICE * 2) / 1.07)), String(rev4000.cr));
  const dr = es.flatMap((e) => e.lines).reduce((a, l) => a + l.debit, 0);
  const cr = es.flatMap((e) => e.lines).reduce((a, l) => a + l.credit, 0);
  chk("TP-4.3", "งบสมดุล Σdr=Σcr", dr === cr && dr > 0, String(dr), String(cr));
  const ordRow2 = await prisma.ticketOrder.findUnique({ where: { id: orderId } });
  chk("TP-4.4", "ออเดอร์ → PAID", ordRow2?.status === "PAID", "PAID", `${ordRow2?.status}`);
  const pub1 = await svc.getPublicOrder(unit.id, token);
  const code0 = pub1?.admissions?.[0]?.code as string;
  chk("TP-4.5", "ตั๋ว code โผล่ในหน้า public (สำหรับ QR)", !!code0 && pub1?.admissions?.every((a: any) => a.status === "VALID"), "code+VALID", `${!!code0}`);
  // idempotent
  await svc.markPaid(ctx, orderId); await wiring.drainAll();
  const es2 = await prisma.accountJournalEntry.count({ where: { systemId: accSys.id, refType: "PosSale" } });
  chk("TP-4.6", "markPaid ซ้ำ idempotent (ไม่ post เบิ้ล)", es2 === es.length, String(es.length), String(es2));

  // ── TP-5: เช็คอินตั๋ว (กันซ้ำ) ──
  const ci1 = await svc.checkIn(ctx, code0);
  chk("TP-5.1", "checkIn ตั๋วแรก → ok", ci1.ok === true, "ok", JSON.stringify(ci1).slice(0, 60));
  const admRow = await prisma.ticketAdmission.findFirst({ where: { tenantId: tid, unitId: unit.id, code: code0 } });
  chk("TP-5.2", "ตั๋ว → CHECKED_IN", admRow?.status === "CHECKED_IN", "CHECKED_IN", `${admRow?.status}`);
  const ci2 = await svc.checkIn(ctx, code0);
  chk("TP-5.3", "checkIn ซ้ำ → ปฏิเสธ (ALREADY)", ci2.ok === false && ci2.code === "ALREADY", "false/ALREADY", `${ci2.ok}/${ci2.code}`);

  // ── TP-6: capacity race — ตั๋วใบสุดท้าย (เหลือ 1) ยิง 2 พร้อมกัน → สำเร็จ 1 ──
  const race = await Promise.all([
    svc.createOrder(ctx, { eventId: evAId, buyerName: "แข่ง A", buyerPhone: "0810000001", lines: [{ ticketTypeId: ttAId, qty: 1 }], channel: "ONLINE" }),
    svc.createOrder(ctx, { eventId: evAId, buyerName: "แข่ง B", buyerPhone: "0810000002", lines: [{ ticketTypeId: ttAId, qty: 1 }], channel: "ONLINE" }),
  ]);
  const okCount = race.filter((r: any) => r.ok === true).length;
  const soldRow = await prisma.ticketType.findUnique({ where: { id: ttAId } });
  chk("TP-6.1", "ตั๋วใบสุดท้าย (2 พร้อมกัน) → สำเร็จ 1 · sold=quota=3 (ไม่เกิน)", okCount === 1 && soldRow?.sold === 3, "1+3", `ok=${okCount}/sold=${soldRow?.sold}`);
  const failMsg = race.find((r: any) => r.ok === false);
  chk("TP-6.2", "อีก 1 → ตั๋วเต็ม (ไม่ oversell)", !!failMsg && typeof failMsg.reason === "string", "reason", JSON.stringify(failMsg));
  const evFull = await svc.listPublicEvents(tid, unit.id);
  chk("TP-6.3", "เต็ม → คงเหลือ 0", evFull[0]?.types?.find((x: any) => x.id === ttAId)?.remaining === 0, "0", `${evFull[0]?.types?.find((x: any) => x.id === ttAId)?.remaining}`);

  // ── TP-7: cross-tenant guard (กัน leak ตั๋ว/PII ร้านอื่น) ──
  const t2 = await prisma.tenant.create({ data: { name: "QC TK PUB2", slug: `qc-tkpub2-${stamp}` } }); tid2 = t2.id;
  const unitX = await prisma.businessUnit.create({ data: { tenantId: tid2, type: "TICKET", name: "ร้านอื่น", slug: `tkpub2-${stamp}` } });
  const cross = await svc.getPublicOrder(unitX.id, token); // token ร้าน A + unit ร้าน B
  chk("TP-7.1", "publicToken ร้าน A + unit ร้าน B → null (ไม่ leak)", cross === null, "null", JSON.stringify(cross));
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 200) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: id } }));
    for (const m of ["accountSystemLink", "accountMapping", "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings", "ticketAdmission", "ticketOrder", "ticketType", "ticketEvent", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "paymentProfile", "customer", "outboxEvent", "appNotification", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Ticket Public =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
