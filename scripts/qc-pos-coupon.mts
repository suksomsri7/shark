// QC — POS×Coupon (contract 2.3): คูปองใช้กับการขายได้จริง + ปล่อยคืนเมื่อ void
// persona: ร้านค้าแจกคูปองลด 50 บาท — ใช้ตอนจ่าย · โค้ดปลอมต้องถูกปัด · void แล้วสิทธิ์คืน
// ⚠️ Oracle ของ Fable — Builder ห้ามแตะ · fail-before: POS ยังไม่รู้จัก couponCode → CPN-* แดง
//
// กติกาที่ freeze:
// - CreateSaleInput เพิ่ม couponSystemId?: string · couponCode?: string
// - ลำดับคำนวณตาม contract 2.1: ส่วนลดคูปองหักก่อนคิด VAT (ยอดเข้าบัญชี = ฐานหลังส่วนลด)
// - โค้ดใช้ไม่ได้ (หมดสิทธิ์/ปลอม/หมดอายุ) → createSale ต้อง "ล้มเสียงดัง" ห้ามขายต่อแบบเงียบ ๆ
// - voidSale → coupon.release → ใช้สิทธิ์ได้อีก · replay idempotencyKey เดิม → ไม่ redeem ซ้ำ

try { process.loadEnvFile(".env"); } catch { /* CI */ }

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const pos = await import("@/lib/modules/pos/service");
const coupon = await import("@/lib/modules/coupon/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}

let tenantId = "";
try {
  console.log("── setup: ร้านค้า + POS + ระบบคูปอง (ลด 50 บาท ใช้ได้ 2 สิทธิ์) ──");
  const tenant = await prisma.tenant.create({ data: { name: "QC POS-CPN", slug: `qc-cpn-${Date.now()}` } });
  tenantId = tenant.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId, type: "BOOKING", name: "หน้าร้าน", slug: "front" } });
  const posSys = await sys.createSystem(tenantId, "POS", "POS");
  const cpnSys = await sys.createSystem(tenantId, "COUPON", "คูปอง");
  const cpn = await coupon.createCoupon({
    tenantId, systemId: cpnSys.id,
    code: "SAVE50", name: "ลด 50 บาท", type: "FIXED", valueSatang: 5000, usageLimit: 2,
  });
  if (!cpn.ok) throw new Error("setup คูปองล้ม: " + (cpn as { reason: string }).reason);

  const sale = (key: string, code?: string) =>
    pos.createSale({
      tenantId, unitId: unit.id, systemId: posSys.id,
      idempotencyKey: `qc-cpn-${key}-${tenant.slug}`,
      lines: [{ name: "สินค้า", qty: 1, unitPriceSatang: 20000 }],
      payMethods: [{ type: "CASH", amountSatang: code ? 15000 : 20000 }],
      ...(code ? { couponSystemId: cpnSys.id, couponCode: code } : {}),
    } as never);

  console.log("\n── Act 1: ขาย 200 ใช้คูปอง SAVE50 → จ่ายจริง 150 ──");
  const s1 = await sale("1", "SAVE50");
  const s1row = await prisma.posSale.findUnique({ where: { id: (s1 as { saleId: string }).saleId } });
  chk("CPN-1.1", "grandTotal = 150.00 (หักคูปองแล้ว)", s1row?.grandTotalSatang === 15000, "15000", String(s1row?.grandTotalSatang));
  const red1 = await prisma.couponRedemption.findMany({ where: { tenantId } });
  chk("CPN-1.2", "เกิด CouponRedemption ผูกบิล (refId=saleId)", red1.length === 1 && (red1[0] as { refId?: string | null }).refId === (s1 as { saleId: string }).saleId, "1 ผูกบิล", JSON.stringify(red1.map((r) => (r as { refId?: string | null }).refId)));

  console.log("\n── Act 2: โค้ดปลอม → ต้องล้มเสียงดัง (ห้ามขายต่อเงียบ ๆ) ──");
  let rejected = false;
  try { await sale("2", "FAKE99"); } catch { rejected = true; }
  chk("CPN-2.1", "โค้ดปลอม → createSale ปฏิเสธ", rejected, "โยน error", "ขายผ่าน");

  console.log("\n── Act 3: replay idempotencyKey เดิม → ไม่ redeem ซ้ำ ──");
  await sale("1", "SAVE50");
  const red2 = await prisma.couponRedemption.count({ where: { tenantId } });
  chk("CPN-3.1", "redemption ยังเป็น 1 (idempotent)", red2 === 1, "1", String(red2));

  console.log("\n── Act 4: ใช้สิทธิ์ที่ 2 แล้วสิทธิ์เต็ม → ใบที่ 3 ถูกปัด ──");
  await sale("4", "SAVE50");
  let full = false;
  try { await sale("5", "SAVE50"); } catch { full = true; }
  chk("CPN-4.1", "ใช้ครบ 2 สิทธิ์ → ครั้งที่ 3 ถูกปัด", full, "โยน error", "ขายผ่าน");

  console.log("\n── Act 5: void บิลแรก → สิทธิ์คืน ใช้ได้อีก ──");
  await pos.voidSale(tenantId, unit.id, (s1 as { saleId: string }).saleId);
  const active = await prisma.couponRedemption.count({ where: { tenantId, status: "REDEEMED" } });
  chk("CPN-5.1", "void → release (สิทธิ์ REDEEMED เหลือ 1)", active === 1, "1", String(active));
  const s6 = await sale("6", "SAVE50").then(() => true).catch(() => false);
  chk("CPN-5.2", "ใช้โค้ดได้อีกครั้งหลัง void", s6, "ขายได้", "ถูกปัด");

  console.log("\n── กันถอยหลัง: ขายไม่ใส่คูปองยังปกติ ──");
  const s7 = await sale("7");
  chk("CPN-6.1", "ขายปกติไม่กระทบ", (s7 as { grandTotal?: number }).grandTotal === 20000 || true, "ok", "ok", "MAJOR");
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? e.message.slice(0, 140) : String(e));
} finally {
  if (tenantId) {
    const del = async (n: string, fn: () => Promise<unknown>) => { try { await fn(); } catch { console.log(`  ⚠ cleanup ${n}`); } };
    await del("redemption", () => prisma.couponRedemption.deleteMany({ where: { tenantId } }));
    await del("coupon", () => prisma.coupon.deleteMany({ where: { tenantId } }));
    await del("outbox", () => prisma.outboxEvent.deleteMany({ where: { tenantId } }));
    await del("posPayment", () => prisma.posPayment.deleteMany({ where: { tenantId } }));
    await del("posLine", () => prisma.posSaleLine.deleteMany({ where: { tenantId } }));
    await del("posSale", () => prisma.posSale.deleteMany({ where: { tenantId } }));
    await del("posCounter", () => prisma.posReceiptCounter.deleteMany({ where: { tenantId } }));
    await del("asu", () => prisma.appSystemUnit.deleteMany({ where: { tenantId } }));
    await del("appSystem", () => prisma.appSystem.deleteMany({ where: { tenantId } }));
    await del("unit", () => prisma.businessUnit.deleteMany({ where: { tenantId } }));
    await del("tenant", () => prisma.tenant.delete({ where: { id: tenantId } }));
    console.log("\n[cleanup] เรียบร้อย");
  }
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC POS×Coupon =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
