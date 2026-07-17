// QC — Hotel refund หลังเช็คเอาท์ (WO Wave2-D): เช็คเอาท์ (เก็บเงินผ่าน POS) → refundStay → void bill คืนบัญชี
// ⚠️ Oracle ของ Fable — Builder ห้ามแตะหลังเขียว · fail-before: ไม่มี refundStay → RF-* แดง
// happy: create→checkIn→checkOut (posSale PAID+journal) → refundStay → posSale VOIDED + reservation REFUNDED + บัญชี net=0
// idempotency: refund ซ้ำ → ไม่กลับบัญชีเบิ้ล · guard: refund reservation ที่ยังไม่เช็คเอาท์ → ok:false · cross-tenant ปฏิเสธ
try { process.loadEnvFile(".env"); } catch { /* CI */ }
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");
const hotel = await import("@/lib/modules/hotel/service");
const wiring = await import("@/lib/outbox-consumers");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const checks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, name: string, ok: boolean, exp: string, act: string, sev: Sev = "CRITICAL") => {
  checks.push({ id, ok, exp, act, sev }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — exp ${exp} | act ${act}`}`);
};

let tenantId = "";
try {
  const t = await prisma.tenant.create({ data: { name: "QC โรงแรม refund", slug: `qc-htr-${Date.now()}` } }); tenantId = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId, type: "HOTEL", name: "รีสอร์ต", slug: "rs" } });
  const posSys = await sys.createSystem(tenantId, "POS", "POS โรงแรม"); await sys.linkUnit(tenantId, posSys.id, unit.id);
  const accSys = await sys.createSystem(tenantId, "ACCOUNT", "บัญชี");
  await acc.saveSettings(tenantId, accSys.id, { orgName: "รีสอร์ต จำกัด", taxId: "0105561177639", vatRegistered: true } as never);
  await gl.ensureAccounting({ tenantId, systemId: accSys.id });
  await prisma.accountSystemLink.create({ data: { tenantId, systemId: accSys.id, linkedKind: "POS", linkedId: posSys.id } });
  const rt = await hotel.createRoomType({ tenantId, unitId: unit.id, name: "ดีลักซ์", baseRateSatang: 107000, capacity: 2, totalRooms: 1 } as never);
  const rtId = (rt as { id?: string }).id ?? "";
  let roomId = (await hotel.listRooms(tenantId, unit.id))[0]?.id;
  if (!roomId) { const rm = await hotel.createRoom({ tenantId, unitId: unit.id, roomTypeId: rtId, number: "101" } as never); roomId = (rm as { id?: string }).id ?? ""; }

  // ── happy path: จอง → เช็คอิน → เช็คเอาท์ (เก็บเงิน POS) ─────────────────────
  const rvA = await hotel.createReservation({ tenantId, unitId: unit.id, roomTypeId: rtId, checkInDate: "2026-08-01", checkOutDate: "2026-08-02", guestName: "สมหญิง" } as never);
  const rvAId = (rvA as { id?: string }).id ?? "";
  const rowA = await prisma.hotelReservation.findUnique({ where: { id: rvAId } });
  await hotel.checkIn(tenantId, unit.id, rvAId, rowA?.roomId ?? roomId);
  const coA = await hotel.checkOut(tenantId, unit.id, rvAId);
  chk("RF-1.1", "จอง→เช็คอิน→เช็คเอาท์สำเร็จ", (coA as { ok?: boolean }).ok === true, "ok", JSON.stringify(coA));
  await wiring.drainAll();
  const saleBefore = await prisma.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: `hotel-sale-${rvAId}` } } });
  chk("RF-1.2", "เช็คเอาท์ → posSale PAID (เก็บค่าห้อง)", saleBefore?.status === "PAID" && saleBefore.grandTotalSatang > 0, "PAID>0", `${saleBefore?.status}/${saleBefore?.grandTotalSatang}`);
  const net4000 = async () => {
    const es = await prisma.accountJournalEntry.findMany({ where: { systemId: accSys.id, refType: "PosSale" }, include: { lines: { include: { account: { select: { code: true } } } } } });
    const cr = es.flatMap((e) => e.lines).filter((l) => l.account.code === "4000").reduce((a, l) => a + l.credit, 0);
    const dr = es.flatMap((e) => e.lines).filter((l) => l.account.code === "4000").reduce((a, l) => a + l.debit, 0);
    const allDr = es.flatMap((e) => e.lines).reduce((a, l) => a + l.debit, 0), allCr = es.flatMap((e) => e.lines).reduce((a, l) => a + l.credit, 0);
    return { revNet: cr - dr, allDr, allCr, entries: es.length };
  };
  const acctPaid = await net4000();
  chk("RF-1.3", "หลังเช็คเอาท์ รายได้ 4000 คงค้าง (net>0)", acctPaid.revNet === Math.round(107000 / 1.07), String(Math.round(107000 / 1.07)), String(acctPaid.revNet));

  // ── cross-tenant ปฏิเสธ: tenantId ผิด → ไม่พบ → ok:false, rvA ยัง CHECKED_OUT ──────
  const cross = await hotel.refundStay("tenant-ปลอม-cross", unit.id, rvAId);
  chk("RF-2.1", "cross-tenant refund ปฏิเสธ (ไม่พบการจอง)", (cross as { ok: boolean }).ok === false, "ok:false", JSON.stringify(cross));
  const rowXcheck = await prisma.hotelReservation.findUnique({ where: { id: rvAId } });
  chk("RF-2.2", "หลัง cross-tenant การจองยังไม่ถูกแตะ (CHECKED_OUT)", rowXcheck?.status === "CHECKED_OUT", "CHECKED_OUT", String(rowXcheck?.status));

  // ── refund จริง ─────────────────────────────────────────────────────────────
  const rf = await hotel.refundStay(tenantId, unit.id, rvAId);
  chk("RF-3.1", "refundStay สำเร็จ (saleVoided)", (rf as { ok: boolean; saleVoided?: boolean }).ok === true && (rf as { saleVoided?: boolean }).saleVoided === true, "ok+voided", JSON.stringify(rf));
  await wiring.drainAll();
  const saleAfter = await prisma.posSale.findUnique({ where: { id: saleBefore!.id } });
  chk("RF-3.2", "posSale → VOIDED", saleAfter?.status === "VOIDED", "VOIDED", String(saleAfter?.status));
  const rowRef = await prisma.hotelReservation.findUnique({ where: { id: rvAId } });
  chk("RF-3.3", "reservation → REFUNDED + refundedAt", rowRef?.status === "REFUNDED" && !!rowRef?.refundedAt, "REFUNDED+ts", `${rowRef?.status}/${rowRef?.refundedAt ? "ts" : "null"}`);
  const acctRef = await net4000();
  chk("RF-3.4", "หลัง refund บัญชีรายได้ 4000 net=0 (คืนครบ)", acctRef.revNet === 0, "0", String(acctRef.revNet));
  chk("RF-3.5", "Σdr=Σcr ตลอด (บัญชีสมดุล)", acctRef.allDr === acctRef.allCr && acctRef.allDr > 0, String(acctRef.allDr), String(acctRef.allCr));

  // ── idempotency: refund ซ้ำ → ไม่กลับบัญชีเบิ้ล ───────────────────────────────
  const entriesBeforeDup = acctRef.entries;
  const rfDup = await hotel.refundStay(tenantId, unit.id, rvAId);
  chk("RF-4.1", "refund ซ้ำ → ok:false (idempotent)", (rfDup as { ok: boolean }).ok === false, "ok:false", JSON.stringify(rfDup));
  await wiring.drainAll();
  const acctDup = await net4000();
  chk("RF-4.2", "refund ซ้ำ → ไม่เกิด journal ใหม่ (net ยัง 0)", acctDup.revNet === 0 && acctDup.entries === entriesBeforeDup, `0/${entriesBeforeDup} entries`, `${acctDup.revNet}/${acctDup.entries} entries`);
  const voidedCount = await prisma.posSale.count({ where: { tenantId, unitId: unit.id, status: "VOIDED" } });
  chk("RF-4.3", "refund ซ้ำ → posSale VOIDED ยังมีใบเดียว", voidedCount === 1, "1", String(voidedCount));

  // ── guard: refund reservation ที่ยังไม่เช็คเอาท์ (CHECKED_IN) → ok:false ───────
  const rvB = await hotel.createReservation({ tenantId, unitId: unit.id, roomTypeId: rtId, checkInDate: "2026-08-10", checkOutDate: "2026-08-11", guestName: "สมชาย" } as never);
  const rvBId = (rvB as { id?: string }).id ?? "";
  await hotel.checkIn(tenantId, unit.id, rvBId, roomId);
  const rfGuard = await hotel.refundStay(tenantId, unit.id, rvBId);
  chk("RF-5.1", "refund การจองที่ยังไม่เช็คเอาท์ → ok:false", (rfGuard as { ok: boolean }).ok === false, "ok:false", JSON.stringify(rfGuard));
  const rowB = await prisma.hotelReservation.findUnique({ where: { id: rvBId } });
  chk("RF-5.2", "การจอง CHECKED_IN ไม่ถูกเปลี่ยนเป็น REFUNDED", rowB?.status === "CHECKED_IN", "CHECKED_IN", String(rowB?.status));
} catch (e) { chk("CRASH", "harness จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  if (tenantId) { const del = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
    await del(() => prisma.accountJournalLine.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId } }));
    for (const m of ["accountSystemLink","accountMapping","accountLedger","accountPeriod","accountDocSequence","accountSettings","outboxEvent","posPayment","posSaleLine","posSale","posReceiptCounter","hotelReservation","hotelRoom","hotelRoomType","appSystemUnit","appSystem"])
      await del(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId } }));
    await del(() => prisma.businessUnit.deleteMany({ where: { tenantId } })); await del(() => prisma.tenant.delete({ where: { id: tenantId } }));
    console.log("[cleanup] ok"); }
  await prisma.$disconnect();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n===== QC Hotel Refund =====\nผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => c.id) }));
process.exit(failed.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
