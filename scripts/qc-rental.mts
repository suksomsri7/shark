// QC — Rental (WO-0050) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/modules/rental/service.ts (ctx {tenantId, unitId} — tenantDb ทุก query · unit type RENTAL):
//   createAsset(ctx, { name, dailyRateSatang, depositSatang?, code? }) → {id} — name ว่าง/rate<0 throw ไทย
//   updateAsset · listAssets(ctx, {activeOnly?})
//   isAvailable(ctx, assetId, { from: Date, to: Date }) → boolean — ชนกับ booking BOOKED/PICKED_UP ที่ overlap [from,to) → false
//   createBooking(ctx, { assetId, customerName, customerPhone, startDate, endDate, note? }) → { id, days, quoteSatang }
//     · endDate exclusive · endDate ≤ startDate → throw ไทย · ช่วงซ้อนกับ BOOKED/PICKED_UP เดิม → throw ไทย
//     · days = จำนวนวัน · quoteSatang = days × dailyRateSatang · depositHeldSatang = asset.depositSatang
//   pickUp(ctx, bookingId) → boolean — BOOKED→PICKED_UP + pickedUpAt (สถานะอื่น false)
//   returnAsset(ctx, bookingId, { lateFeeSatang? }) → { ok, totalSatang, posSaleId? }
//     · PICKED_UP เท่านั้น (อื่น ok:false) · totalSatang = quote(days×rate) + lateFee
//     · เส้นเงิน C-2: pos.createSale (systemId = AppSystem type POS ตัวแรก · idempotencyKey `rental-<bookingId>` ·
//       sourceModule "RENTAL" · payMethods [{type:"CASH", amountSatang: total}]) → เก็บ posSaleId + RETURNED + returnedAt
//     · ไม่มีระบบ POS → throw ไทย + สถานะคง PICKED_UP (revert)
//     · มัดจำ: คืนลูกค้านอกระบบ v1 (ไม่เข้า GL — บันทึกใน booking แล้ว follow-up 0050b)
//   cancelBooking(ctx, bookingId) → boolean (BOOKED เท่านั้น)
//   UI: unit type RENTAL ใน UNIT_NAV + SYSTEM_DEFS (business "RENTAL" available — enum มีแล้ว) + หน้า /app/u/[unitSlug]/rental (สินทรัพย์+จอง+รับ/คืน) ไทยล้วน
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const D = (s: string) => new Date(s);

let tid = "";
try {
  const rt = (await import("@/lib/modules/rental/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null; // any จงใจ: oracle ล้ำหน้าโค้ด
  if (!rt) { chk("RT-0", "มี rental/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC RENT", slug: `qc-rent-${Date.now()}` } }); tid = t.id;
    const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RENTAL", name: "เช่ารถ QC", slug: `rent-${Date.now()}` } });
    await sys.createSystem(tid, "POS", "ขาย");
    const ctx = { tenantId: tid, unitId: unit.id };

    const a1 = await rt.createAsset(ctx, { name: "มอเตอร์ไซค์ A", dailyRateSatang: 30000, depositSatang: 100000 });
    let th0 = false; try { await rt.createAsset(ctx, { name: "", dailyRateSatang: 1 }); } catch { th0 = true; }
    chk("RT-1.1", "สร้างสินทรัพย์ + name ว่าง throw", !!a1.id && th0, "id+throw", "?");

    const bk = await rt.createBooking(ctx, { assetId: a1.id, customerName: "คุณเช่า", customerPhone: "0810000000", startDate: D("2026-08-01"), endDate: D("2026-08-04") });
    chk("RT-2.1", "จอง 1-4 ส.ค. → 3 วัน quote 900 บาท + ถือมัดจำ 1000", bk.days === 3 && bk.quoteSatang === 90000 && (await prisma.rentalBooking.findUnique({ where: { id: bk.id as string } }))?.depositHeldSatang === 100000, "3/90000/100000", JSON.stringify(bk));
    chk("RT-2.2", "ช่วงชน (2-3 ส.ค.) → isAvailable false + จองซ้อน throw", (await rt.isAvailable(ctx, a1.id, { from: D("2026-08-02"), to: D("2026-08-03") })) === false && (await (async () => { try { await rt.createBooking(ctx, { assetId: a1.id, customerName: "ข", customerPhone: "1", startDate: D("2026-08-03"), endDate: D("2026-08-05") }); return false; } catch { return true; } })()), "false+throw", "?");
    chk("RT-2.3", "ช่วงว่าง (4-6 ส.ค. — endDate exclusive) → true", (await rt.isAvailable(ctx, a1.id, { from: D("2026-08-04"), to: D("2026-08-06") })) === true, "true", "?");
    let thDate = false; try { await rt.createBooking(ctx, { assetId: a1.id, customerName: "ค", customerPhone: "2", startDate: D("2026-08-10"), endDate: D("2026-08-10") }); } catch { thDate = true; }
    chk("RT-2.4", "endDate ≤ startDate → throw", thDate, "throw", "?");

    chk("RT-3.1", "pickUp: BOOKED→PICKED_UP · ซ้ำ false", (await rt.pickUp(ctx, bk.id)) === true && (await rt.pickUp(ctx, bk.id)) === false, "true/false", "?");
    const ret = await rt.returnAsset(ctx, bk.id, { lateFeeSatang: 5000 });
    const sale = await prisma.posSale.findFirst({ where: { tenantId: tid, idempotencyKey: `rental-${bk.id}` } });
    chk("RT-3.2", "คืน + ค่าปรับ 50 → total 950 บาท + PosSale PAID + RETURNED", ret.ok === true && ret.totalSatang === 95000 && sale?.grandTotalSatang === 95000 && sale?.status === "PAID" && (await prisma.rentalBooking.findUnique({ where: { id: bk.id as string } }))?.status === "RETURNED", "95000/PAID", JSON.stringify({ t: ret.totalSatang, s: sale?.status }));
    chk("RT-3.3", "outbox pos.sale.paid ≥1 (เส้นเงินเดิน)", (await prisma.outboxEvent.count({ where: { tenantId: tid, type: "pos.sale.paid" } })) >= 1, "≥1", "?");
    chk("RT-3.4", "คืนซ้ำ → ok:false + PosSale ไม่ซ้ำ", ((await rt.returnAsset(ctx, bk.id, {})) as { ok: boolean }).ok === false && (await prisma.posSale.count({ where: { tenantId: tid, idempotencyKey: `rental-${bk.id}` } })) === 1, "false/1", "?");

    const bk2 = await rt.createBooking(ctx, { assetId: a1.id, customerName: "ง", customerPhone: "3", startDate: D("2026-09-01"), endDate: D("2026-09-02") });
    chk("RT-4.1", "cancel: BOOKED→CANCELLED · pickUp หลัง cancel → false", (await rt.cancelBooking(ctx, bk2.id)) === true && (await rt.pickUp(ctx, bk2.id)) === false, "true/false", "?");
    chk("RT-4.2", "ช่วงของ booking ที่ cancel → ว่าง (จองได้)", (await rt.isAvailable(ctx, a1.id, { from: D("2026-09-01"), to: D("2026-09-02") })) === true, "true", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of ["rentalBooking", "rentalAsset", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "outboxEvent", "appNotification", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Rental =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
