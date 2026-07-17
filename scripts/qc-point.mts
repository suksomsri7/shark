// QC — ระบบแต้ม (WO Wave1-D): ตั้งอัตราสะสม + ปรับ/แจกแต้มมือ
// persona: ร้านตั้งอัตราสะสมเอง (ไม่ hardcode) + พนักงานปรับ/แจกแต้มให้สมาชิกได้
// พิสูจน์: setPointSettings เปลี่ยน rate → earn คิดตามใหม่ · ปิดสะสม→ไม่ได้แต้ม · validate rate
//         adjust แจก(+)/หัก(-) เข้า ledger+balance · หักเกิน balance กัน · idempotency คีย์เดิมไม่เบิ้ล · cross-tenant
// standalone-typesafe: dynamic import + wide cast

try { process.loadEnvFile(".env"); } catch { /* CI */ }

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const member = await import("@/lib/modules/member/service");
const point = await import("@/lib/modules/point/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; ok: boolean; exp: string; act: string; sev: Sev };
const checks: Check[] = [];
const chk = (id: string, name: string, ok: boolean, exp: string, act: string, sev: Sev = "CRITICAL") => {
  checks.push({ id, ok, exp, act, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — exp ${exp} | act ${act}`}`);
};

let tenantId = "";
let tenant2Id = "";
try {
  console.log("── setup: ร้าน 1 กิจการ ผูก MEMBER/POINT (ensureUnitSystems) ──");
  const t = await prisma.tenant.create({ data: { name: "QC แต้ม", slug: `qc-point-${Date.now()}` } });
  tenantId = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId, type: "RESTAURANT", name: "คาเฟ่", slug: `cf-${Date.now()}` } });
  const systems = await sys.ensureUnitSystems(tenantId, unit.id, "คาเฟ่");
  const memberSystemId = systems.MEMBER;
  const pointSystemId = systems.POINT;
  const customer = await member.findOrCreate({ tenantId, memberSystemId, name: "คุณสมชาย", phone: "0810000001", source: "STAFF" });

  console.log("\n── settings: อ่าน default + ตั้งอัตราสะสมเอง ──");
  const s0 = await point.getPointSettings(tenantId);
  chk("PT-1.1", "default satangPerPoint = 2500 (25 บาท=1แต้ม) + active", s0.satangPerPoint === 2500 && s0.active === true, "2500/true", `${s0.satangPerPoint}/${s0.active}`);

  await point.setPointSettings(tenantId, { satangPerPoint: 5000, active: true });
  const s1 = await point.getPointSettings(tenantId);
  chk("PT-1.2", "setPointSettings เปลี่ยน rate → 5000 (50 บาท=1แต้ม)", s1.satangPerPoint === 5000, "5000", String(s1.satangPerPoint));

  console.log("\n── earn ตาม rate ใหม่: 250000 สตางค์ / 5000 = 50 แต้ม ──");
  const e1 = await point.earn({ tenantId, systemId: pointSystemId, customerId: customer.id, amountSatang: 250000, sourceModule: "qc", refType: "QC", refId: "earn1", idempotencyKey: `qc-earn1-${customer.id}` });
  chk("PT-2.1", "earn คิดตาม rate ใหม่ = 50 แต้ม", e1.pointsEarned === 50, "50", String(e1.pointsEarned));

  console.log("\n── ปิดสะสม → earn ได้ 0 แต้ม ──");
  await point.setPointSettings(tenantId, { satangPerPoint: 5000, active: false });
  const e2 = await point.earn({ tenantId, systemId: pointSystemId, customerId: customer.id, amountSatang: 250000, sourceModule: "qc", refType: "QC", refId: "earn2", idempotencyKey: `qc-earn2-${customer.id}` });
  chk("PT-2.2", "ปิดสะสม → earn = 0 แต้ม", e2.pointsEarned === 0, "0", String(e2.pointsEarned));

  // กลับมาเปิด + rate มาตรฐาน 2500 สำหรับส่วน adjust
  await point.setPointSettings(tenantId, { satangPerPoint: 2500, active: true });

  console.log("\n── validate: rate < 1 สตางค์ ต้อง throw ──");
  let rateThrew = false;
  try { await point.setPointSettings(tenantId, { satangPerPoint: 0, active: true }); } catch { rateThrew = true; }
  chk("PT-3.1", "setPointSettings satangPerPoint=0 → throw", rateThrew, "throw", String(rateThrew));
  const sGuard = await point.getPointSettings(tenantId);
  chk("PT-3.2", "rate ไม่ถูกทำลายหลัง validate fail (ยัง 2500)", sGuard.satangPerPoint === 2500, "2500", String(sGuard.satangPerPoint));

  console.log("\n── adjust: แจกแต้ม (+) เข้า ledger+balance ──");
  const balStart = await point.getBalance(pointSystemId, customer.id);
  const a1 = await point.adjustPoints({ tenantId, systemId: pointSystemId, customerId: customer.id, delta: 30, reason: "แจกทดสอบ", idempotencyKey: `qc-adj-grant-${customer.id}` });
  chk("PT-4.1", `แจก +30 → balance ${balStart}→${balStart + 30}`, a1.balance === balStart + 30, String(balStart + 30), String(a1.balance));
  const ledgerGrant = await prisma.pointLedger.findFirst({ where: { systemId: pointSystemId, customerId: customer.id, type: "ADJUST", delta: 30 } });
  chk("PT-4.2", "เกิด ledger ADJUST delta +30 พร้อมเหตุผล", !!ledgerGrant && ledgerGrant.reason === "แจกทดสอบ", "ADJUST/+30/เหตุผล", `${ledgerGrant?.type}/${ledgerGrant?.delta}/${ledgerGrant?.reason}`);

  console.log("\n── adjust: หักแต้ม (-) ──");
  const balBeforeDeduct = await point.getBalance(pointSystemId, customer.id);
  const a2 = await point.adjustPoints({ tenantId, systemId: pointSystemId, customerId: customer.id, delta: -10, idempotencyKey: `qc-adj-deduct-${customer.id}` });
  chk("PT-4.3", `หัก -10 → balance ${balBeforeDeduct}→${balBeforeDeduct - 10}`, a2.balance === balBeforeDeduct - 10, String(balBeforeDeduct - 10), String(a2.balance));

  console.log("\n── หักเกิน balance → กัน (throw) ไม่แตะแต้ม ──");
  const balBeforeOver = await point.getBalance(pointSystemId, customer.id);
  let overThrew = false;
  try { await point.adjustPoints({ tenantId, systemId: pointSystemId, customerId: customer.id, delta: -(balBeforeOver + 1000), idempotencyKey: `qc-adj-over-${customer.id}` }); } catch { overThrew = true; }
  const balAfterOver = await point.getBalance(pointSystemId, customer.id);
  chk("PT-5.1", "หักเกิน balance → throw", overThrew, "throw", String(overThrew));
  chk("PT-5.2", "balance ไม่เปลี่ยนเมื่อหักไม่สำเร็จ", balAfterOver === balBeforeOver, String(balBeforeOver), String(balAfterOver));

  console.log("\n── idempotency: adjust คีย์เดิม ยิงซ้ำ ไม่เบิ้ล ──");
  const dupKey = `qc-adj-dup-${customer.id}`;
  const d1 = await point.adjustPoints({ tenantId, systemId: pointSystemId, customerId: customer.id, delta: 5, idempotencyKey: dupKey });
  const d2 = await point.adjustPoints({ tenantId, systemId: pointSystemId, customerId: customer.id, delta: 5, idempotencyKey: dupKey });
  chk("PT-6.1", "adjust คีย์เดิม 2 ครั้ง → balance เท่ากัน (ไม่เบิ้ล)", d1.balance === d2.balance, String(d1.balance), String(d2.balance));
  const dupCount = await prisma.pointLedger.count({ where: { tenantId, idempotencyKey: dupKey } });
  chk("PT-6.2", "ledger คีย์เดิมมีแค่ 1 รายการ", dupCount === 1, "1", String(dupCount));

  console.log("\n── validate: adjust delta=0 → throw ──");
  let zeroThrew = false;
  try { await point.adjustPoints({ tenantId, systemId: pointSystemId, customerId: customer.id, delta: 0, idempotencyKey: `qc-adj-zero-${customer.id}` }); } catch { zeroThrew = true; }
  chk("PT-7.1", "adjust delta=0 → throw", zeroThrew, "throw", String(zeroThrew));

  console.log("\n── listPointCustomers: คืนสมาชิกที่ผูก unit เดียวกับระบบแต้ม ──");
  const custs = await point.listPointCustomers(tenantId, pointSystemId);
  chk("PT-8.1", "listPointCustomers เจอสมาชิก 1 คน", custs.length === 1 && custs[0].id === customer.id, "1/สมชาย", `${custs.length}/${custs[0]?.id === customer.id}`);

  console.log("\n── cross-tenant: ร้านอื่นมองไม่เห็น ──");
  const t2 = await prisma.tenant.create({ data: { name: "QC ร้านอื่น", slug: `qc-point2-${Date.now()}` } });
  tenant2Id = t2.id;
  const foreignCusts = await point.listPointCustomers(t2.id, pointSystemId);
  chk("PT-9.1", "ร้านอื่น listPointCustomers ไม่เห็นสมาชิกร้านนี้", foreignCusts.length === 0, "0", String(foreignCusts.length));
  const s2 = await point.getPointSettings(t2.id);
  chk("PT-9.2", "settings แยกตาม tenant (ร้านอื่น = default 2500)", s2.satangPerPoint === 2500, "2500", String(s2.satangPerPoint));
  await point.setPointSettings(t2.id, { satangPerPoint: 9900, active: true });
  const sOwn = await point.getPointSettings(tenantId);
  chk("PT-9.3", "ร้านอื่นตั้ง rate ไม่กระทบร้านนี้ (ยัง 2500)", sOwn.satangPerPoint === 2500, "2500", String(sOwn.satangPerPoint));
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? e.message.slice(0, 160) : String(e));
} finally {
  const del = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ข้าม */ } };
  for (const tid of [tenantId, tenant2Id]) {
    if (!tid) continue;
    for (const m of ["pointLedger", "pointBalance", "pointSettings", "memberActivity", "customer", "appSystemUnit", "appSystem"])
      await del(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  console.log("\n[cleanup] เรียบร้อย");
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
console.log("\n===== QC Point (อัตราสะสม + ปรับ/แจกแต้ม) =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => c.id) }));
process.exit(failed.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
