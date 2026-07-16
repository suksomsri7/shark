// QC — Hotel→POS→บัญชี: เช็คเอาท์ → ค่าห้อง (nights×rate) เข้าบัญชีอัตโนมัติ
// ⚠️ Oracle ของ Fable — Builder (WO-0008) ห้ามแตะ · fail-before: hotel ไม่เคยเรียก POS → HT-2.* แดง
try { process.loadEnvFile(".env"); } catch { /* CI */ }
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");
const hotel = await import("@/lib/modules/hotel/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const checks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, name: string, ok: boolean, exp: string, act: string, sev: Sev = "CRITICAL") => {
  checks.push({ id, ok, exp, act, sev }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — exp ${exp} | act ${act}`}`);
};
let tenantId = "";
try {
  const t = await prisma.tenant.create({ data: { name: "QC โรงแรม", slug: `qc-ht-${Date.now()}` } }); tenantId = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId, type: "HOTEL", name: "รีสอร์ต", slug: "rs" } });
  const posSys = await sys.createSystem(tenantId, "POS", "POS โรงแรม"); await sys.linkUnit(tenantId, posSys.id, unit.id);
  const accSys = await sys.createSystem(tenantId, "ACCOUNT", "บัญชี");
  await acc.saveSettings(tenantId, accSys.id, { orgName: "รีสอร์ต จำกัด", taxId: "0105561177639", vatRegistered: true } as never);
  await gl.ensureAccounting({ tenantId, systemId: accSys.id });
  await prisma.accountSystemLink.create({ data: { tenantId, systemId: accSys.id, linkedKind: "POS", linkedId: posSys.id } });
  const rt = await hotel.createRoomType({ tenantId, unitId: unit.id, name: "ดีลักซ์", baseRateSatang: 107000, capacity: 2, totalRooms: 1 } as never);
  const rtId = (rt as { id?: string }).id ?? "";
  const rmList = await hotel.listRooms(tenantId, unit.id);
  let roomId = rmList[0]?.id;
  if (!roomId) { const rm = await hotel.createRoom({ tenantId, unitId: unit.id, roomTypeId: rtId, number: "101" } as never); roomId = (rm as { id?: string }).id ?? ""; }
  const inD = "2026-08-01", outD = "2026-08-02"; // 1 คืน ฿1,070
  const rv = await hotel.createReservation({ tenantId, unitId: unit.id, roomTypeId: rtId, checkInDate: inD, checkOutDate: outD, guestName: "สมหญิง" } as never);
  const rvId = (rv as { id?: string }).id ?? (rv as { reservationId?: string }).reservationId ?? "";
  chk("HT-1.1", "จองได้ (1 คืน ฿1,070)", !!rvId, "id", JSON.stringify(rv).slice(0, 60));
  const rvRow = await prisma.hotelReservation.findUnique({ where: { id: rvId } });
  const assignedRoom = rvRow?.roomId ?? roomId;
  await hotel.checkIn(tenantId, unit.id, rvId, assignedRoom);
  const co = await hotel.checkOut(tenantId, unit.id, rvId);
  chk("HT-1.2", "เช็คเอาท์สำเร็จ", (co as { ok?: boolean }).ok === true, "ok", JSON.stringify(co));
  const wiring = await import("@/lib/outbox-consumers"); await wiring.drainAll();
  const es = await prisma.accountJournalEntry.findMany({ where: { systemId: accSys.id, refType: "PosSale" }, include: { lines: { include: { account: { select: { code: true } } } } } });
  const side = (c: string, s: "dr" | "cr") => es.flatMap((e) => e.lines).filter((l) => l.account.code === c).reduce((a, l) => a + (s === "dr" ? l.debit : l.credit), 0);
  chk("HT-2.1", "เช็คเอาท์ → เกิด journal entry ค่าห้องอัตโนมัติ", es.length >= 1, "≥1", String(es.length));
  chk("HT-2.2", "Cr รายได้ 4000 = ฐานหลังถอด VAT (1000)", side("4000", "cr") === Math.round(107000 / 1.07), String(Math.round(107000 / 1.07)), String(side("4000", "cr")));
  const dr = es.flatMap((e) => e.lines).reduce((a, l) => a + l.debit, 0), cr = es.flatMap((e) => e.lines).reduce((a, l) => a + l.credit, 0);
  chk("HT-2.3", "Σdr=Σcr", dr === cr && dr > 0, String(dr), String(cr));
} catch (e) { chk("CRASH", "harness จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 120) : String(e)); }
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
console.log(`\n===== QC Hotel Money =====\nผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => c.id) }));
process.exit(failed.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
