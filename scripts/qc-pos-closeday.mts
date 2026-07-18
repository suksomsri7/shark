// QC — POS ปิดวัน/สรุปยอดสิ้นวัน (read-only): closeDaySummary / closeDayBills / closeDayCsv
// persona: ร้านกาแฟปิดร้าน อยากรู้ยอดวันนี้ · แยกวิธีจ่าย · เงินสดควรมีในลิ้นชัก · export CSV
// รัน: pnpm exec tsx scripts/qc-pos-closeday.mts
//
// ตรวจ:
//   - 3 บิลวันนี้ (CASH PAID + PROMPTPAY PAID + CASH VOIDED) → ยอดสุทธิ/แยกวิธีจ่าย/เงินสดควรมี/void ถูก
//   - บิลวันอื่น → ไม่รวมในสรุปวันนี้ (แต่รวมเมื่อระบุวันนั้น)
//   - ระบบ POS อื่น (tenant เดียวกัน) + tenant อื่น → ไม่รวม (scope tenantId+systemId)
//   - CSV มี BOM + แถวบิลครบ + บล็อกสรุป

try { process.loadEnvFile(".env"); } catch { /* CI ใช้ secrets ตรง ๆ */ }

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const pos = await import("@/lib/modules/pos/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "MAJOR") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}

// วันที่ BKK ของ (now + offsetDays)
const bkkDateOf = (offsetDays: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(Date.now() + offsetDays * 86400000));

let tenantId = "";
let tenantBId = "";
try {
  console.log("── setup: ร้านกาแฟ (POS หลัก + POS สาขา 2) ──");
  const t = await prisma.tenant.create({ data: { name: "QC POS-CLOSE ร้านกาแฟ", slug: `qc-posclose-${Date.now()}` } });
  tenantId = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId, type: "BOOKING", name: "หน้าร้าน", slug: `front-${Date.now()}` } });
  const posSys = await sys.createSystem(tenantId, "POS", "POS หน้าร้าน");
  const posSys2 = await sys.createSystem(tenantId, "POS", "POS สาขา 2");
  await sys.linkUnit(tenantId, posSys.id, unit.id);
  await sys.linkUnit(tenantId, posSys2.id, unit.id);

  const sale = (sysId: string, key: string, type: "CASH" | "PROMPTPAY", amount: number) =>
    pos.createSale({
      tenantId, unitId: unit.id, systemId: sysId, idempotencyKey: key,
      lines: [{ name: "กาแฟ", qty: 1, unitPriceSatang: amount }],
      payMethods: [{ type, amountSatang: amount }],
    });

  // ── บิลวันนี้: CASH 100 (PAID) + PROMPTPAY 50 (PAID) + CASH 30 (VOIDED) ──
  console.log("\n── seed บิลวันนี้ ──");
  const sCash = await sale(posSys.id, `close-cash-${t.slug}`, "CASH", 10000);
  const sPP = await sale(posSys.id, `close-pp-${t.slug}`, "PROMPTPAY", 5000);
  const sVoid = await sale(posSys.id, `close-void-${t.slug}`, "CASH", 3000);
  await pos.voidSale(tenantId, unit.id, sVoid.saleId);

  const ctx = { tenantId, systemId: posSys.id };
  const today = bkkDateOf(0);
  const sum = await pos.closeDaySummary(ctx); // default = วันนี้

  chk("SUM-1", "businessDate = วันนี้ (BKK)", sum.businessDate === today, today, sum.businessDate);
  chk("SUM-2", "ยอดขายสุทธิ = 150.00 (100+50, ไม่รวม void)", sum.netSalesSatang === 15000, "15000", String(sum.netSalesSatang), "CRITICAL");
  chk("SUM-3", "จำนวนบิล PAID = 2", sum.billCount === 2, "2", String(sum.billCount), "CRITICAL");
  chk("SUM-4", "จำนวนบิล void = 1", sum.voidCount === 1, "1", String(sum.voidCount), "CRITICAL");
  chk("SUM-5", "ยอด void = 30.00", sum.voidTotalSatang === 3000, "3000", String(sum.voidTotalSatang));

  const cash = sum.byMethod.find((m) => m.type === "CASH");
  const pp = sum.byMethod.find((m) => m.type === "PROMPTPAY");
  chk("PAY-1", "แยกวิธีจ่าย: เงินสด = 100.00 (ไม่รวม void)", cash?.amountSatang === 10000, "10000", String(cash?.amountSatang), "CRITICAL");
  chk("PAY-2", "แยกวิธีจ่าย: พร้อมเพย์ = 50.00", pp?.amountSatang === 5000, "5000", String(pp?.amountSatang), "CRITICAL");
  chk("PAY-3", "เงินสดควรมีในลิ้นชัก = ยอดเงินสด 100.00", sum.cashInDrawerSatang === 10000, "10000", String(sum.cashInDrawerSatang), "CRITICAL");
  chk("PAY-4", "byMethod เรียง CASH ก่อน PROMPTPAY", sum.byMethod[0]?.type === "CASH" && sum.byMethod[1]?.type === "PROMPTPAY", "CASH,PROMPTPAY", sum.byMethod.map((m) => m.type).join(","));
  chk("PAY-5", "วิธีจ่ายมีป้ายไทย (เงินสด)", cash?.label === "เงินสด", "เงินสด", String(cash?.label));

  // ── บิลวันอื่น (7 วันก่อน) → ไม่รวมวันนี้ แต่รวมเมื่อระบุวันนั้น ──
  console.log("\n── บิลวันอื่น ──");
  const sOld = await sale(posSys.id, `close-old-${t.slug}`, "CASH", 99900);
  const oldDate = bkkDateOf(-7);
  // ดันเวลาบิลไปเที่ยงวันนั้น (BKK 12:00 = 05:00Z) — อยู่กลางหน้าต่างวันนั้นแน่นอน
  await prisma.posSale.update({ where: { id: sOld.saleId }, data: { createdAt: new Date(oldDate + "T05:00:00Z") } });

  const sumToday2 = await pos.closeDaySummary(ctx);
  chk("DAY-1", "บิลวันอื่นไม่รวมยอดวันนี้ (ยัง 150.00)", sumToday2.netSalesSatang === 15000, "15000", String(sumToday2.netSalesSatang), "CRITICAL");
  const sumOld = await pos.closeDaySummary(ctx, oldDate);
  chk("DAY-2", `ระบุวันนั้น (${oldDate}) → ยอด 999.00`, sumOld.netSalesSatang === 99900, "99900", String(sumOld.netSalesSatang), "CRITICAL");
  chk("DAY-3", "ระบุวันนั้น → 1 บิล", sumOld.billCount === 1, "1", String(sumOld.billCount));

  // ── scope: ระบบ POS อื่น (tenant เดียวกัน) ไม่รวม ──
  console.log("\n── scope: ระบบ POS อื่น + tenant อื่น ──");
  await sale(posSys2.id, `close-sys2-${t.slug}`, "CASH", 77700);
  const sumAfterSys2 = await pos.closeDaySummary(ctx);
  chk("SCOPE-1", "ขายระบบ POS อื่นในร้านเดียวกัน → ไม่รวม (ยัง 150.00)", sumAfterSys2.netSalesSatang === 15000, "15000", String(sumAfterSys2.netSalesSatang), "CRITICAL");
  const sumSys2 = await pos.closeDaySummary({ tenantId, systemId: posSys2.id });
  chk("SCOPE-2", "ระบบ POS อื่นสรุปแยกได้เอง (777.00)", sumSys2.netSalesSatang === 77700, "77700", String(sumSys2.netSalesSatang));

  const tb = await prisma.tenant.create({ data: { name: "QC POS-CLOSE ร้านคู่แข่ง", slug: `qc-posclose-b-${Date.now()}` } });
  tenantBId = tb.id;
  const unitB = await prisma.businessUnit.create({ data: { tenantId: tenantBId, type: "BOOKING", name: "ร้าน B", slug: `b-${Date.now()}` } });
  const posSysB = await sys.createSystem(tenantBId, "POS", "POS ร้าน B");
  await sys.linkUnit(tenantBId, posSysB.id, unitB.id);
  await pos.createSale({
    tenantId: tenantBId, unitId: unitB.id, systemId: posSysB.id, idempotencyKey: `close-b-${tb.slug}`,
    lines: [{ name: "ของร้าน B", qty: 1, unitPriceSatang: 88800 }],
    payMethods: [{ type: "CASH", amountSatang: 88800 }],
  });
  // ยิง ctx ร้าน A ด้วย systemId ร้าน B (cross-tenant) → ต้องว่าง
  const crossSum = await pos.closeDaySummary({ tenantId, systemId: posSysB.id });
  chk("SCOPE-3", "cross-tenant (tenantA + systemB) → ยอด 0", crossSum.netSalesSatang === 0 && crossSum.billCount === 0, "0", `${crossSum.netSalesSatang}/${crossSum.billCount}`, "CRITICAL");

  // ── CSV ──
  console.log("\n── CSV ปิดวัน ──");
  const csv = await pos.closeDayCsv(ctx);
  chk("CSV-1", "CSV มี BOM (\\uFEFF) นำหน้า", csv.charCodeAt(0) === 0xfeff, "0xFEFF", "0x" + csv.charCodeAt(0).toString(16));
  const lines = csv.slice(1).split("\n");
  chk("CSV-2", "มี header ถูกต้อง", lines[0] === "เลขที่ใบเสร็จ,เวลา,ยอด (บาท),วิธีจ่าย,สถานะ", "header", lines[0]);
  // แถวบิลวันนี้ = 3 (CASH PAID + PROMPTPAY PAID + CASH VOIDED)
  const billRows = lines.slice(1).filter((l) => /^\d{6}-\d{4},/.test(l));
  chk("CSV-3", "แถวบิลครบ 3 (2 PAID + 1 VOIDED)", billRows.length === 3, "3", String(billRows.length), "CRITICAL");
  chk("CSV-4", "มีแถวยอดขายสุทธิในบล็อกสรุป (150.00)", csv.includes("ยอดขายสุทธิ (บาท),150.00"), "150.00", csv.includes("ยอดขายสุทธิ (บาท),150.00") ? "พบ" : "ไม่พบ");
  chk("CSV-5", "มีแถวเงินสดควรมีในลิ้นชัก (100.00)", csv.includes("เงินสดที่ควรมีในลิ้นชัก (บาท),100.00"), "100.00", csv.includes("เงินสดที่ควรมีในลิ้นชัก (บาท),100.00") ? "พบ" : "ไม่พบ");
  chk("CSV-6", "มีสถานะ 'ยกเลิก' สำหรับบิล void", billRows.some((l) => l.endsWith(",ยกเลิก")), "มี", billRows.some((l) => l.endsWith(",ยกเลิก")) ? "มี" : "ไม่มี");
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? e.message.slice(0, 160) : String(e), "CRITICAL");
} finally {
  for (const tid of [tenantId, tenantBId].filter(Boolean)) {
    const del = async (name: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (err) { console.log(`  ⚠ cleanup ${name}: ${err instanceof Error ? err.message.slice(0, 80) : err}`); }
    };
    await del("outbox", () => (prisma as never as { outboxEvent?: { deleteMany: (a: unknown) => Promise<unknown> } }).outboxEvent?.deleteMany({ where: { tenantId: tid } }) ?? Promise.resolve());
    await del("posPayment", () => prisma.posPayment.deleteMany({ where: { tenantId: tid } }));
    await del("posLine", () => prisma.posSaleLine.deleteMany({ where: { tenantId: tid } }));
    await del("posSale", () => prisma.posSale.deleteMany({ where: { tenantId: tid } }));
    await del("posCounter", () => prisma.posReceiptCounter.deleteMany({ where: { tenantId: tid } }));
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
console.log("\n===== QC: POS ปิดวัน =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
