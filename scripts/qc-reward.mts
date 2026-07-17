// QC — ระบบ Reward "แลกจริง" (WO Wave1-A)
// persona: ร้านกาแฟมีระบบแต้ม+รางวัล — สมาชิกสะสมแต้ม แล้วเอาแต้มแลกของรางวัล
// พิสูจน์: แลกจริง (burn แต้ม + PENDING + ตัดสต็อก) · ยกเลิกคืนแต้ม+สต็อก · แต้มไม่พอปฏิเสธ · fulfill idempotent · กันข้ามร้าน
// standalone-typesafe: dynamic import + wide cast (ไม่พึ่ง typed literal)

try { process.loadEnvFile(".env"); } catch { /* CI */ }

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const member = await import("@/lib/modules/member/service");
const point = await import("@/lib/modules/point/service");
const reward = await import("@/lib/modules/reward/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}

let tenantId = "";
let tenant2Id = "";
try {
  console.log("── setup: ร้านกาแฟ 1 กิจการ ผูก MEMBER/POINT/REWARD (ensureUnitSystems) ──");
  const t = await prisma.tenant.create({ data: { name: "QC แลกรางวัล", slug: `qc-reward-${Date.now()}` } });
  tenantId = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId, type: "RESTAURANT", name: "คาเฟ่", slug: `cf-${Date.now()}` } });
  const systems = await sys.ensureUnitSystems(tenantId, unit.id, "คาเฟ่");
  const memberSystemId = systems.MEMBER;
  const rewardSystemId = systems.REWARD;

  // สมาชิก 1 คน + เติมแต้ม 100 (25 บาท = 1 แต้ม → 250000 สตางค์)
  const customer = await member.findOrCreate({ tenantId, memberSystemId, name: "คุณสมชาย", phone: "0810000001", source: "STAFF" });
  const resolvedPoint = await reward.resolvePointSystemId(tenantId, rewardSystemId);
  chk("RW-0.1", "resolvePointSystemId เจอระบบแต้มที่ผูก unit เดียวกัน", resolvedPoint === systems.POINT, systems.POINT, String(resolvedPoint));
  const pointSystemId = (resolvedPoint ?? systems.POINT) as string;
  await point.earn({ tenantId, systemId: pointSystemId, customerId: customer.id, amountSatang: 250000, sourceModule: "qc", refType: "QC", refId: "seed", idempotencyKey: `qc-earn-${customer.id}` });
  const startBal = await point.getBalance(pointSystemId, customer.id);
  chk("RW-0.2", "สมาชิกมีแต้มเริ่มต้น 100", startBal === 100, "100", String(startBal));

  // รางวัล A (30 แต้ม, สต็อก 3) + รางวัล B แพง (999 แต้ม)
  const rewardA = await reward.createReward({ tenantId, systemId: rewardSystemId, name: "กาแฟฟรี 1 แก้ว", pointsCost: 30, stock: 3 });
  const rewardB = await reward.createReward({ tenantId, systemId: rewardSystemId, name: "เครื่องชงกาแฟ", pointsCost: 999, stock: null });

  console.log("\n── happy: แลกรางวัล A → burn แต้ม + PENDING + ตัดสต็อก ──");
  const r1 = await reward.redeem({ tenantId, rewardSystemId, pointSystemId, rewardId: rewardA.id, customerId: customer.id });
  chk("RW-1.1", "redeem สำเร็จ ได้ code", r1.ok === true && typeof (r1 as { code?: string }).code === "string" && (r1 as { code: string }).code.length === 6, "ok+code6", JSON.stringify(r1).slice(0, 60));
  const balAfter1 = await point.getBalance(pointSystemId, customer.id);
  chk("RW-1.2", "แต้มลดลง 30 (100→70)", balAfter1 === 70, "70", String(balAfter1));
  const redemptions1 = await reward.listRedemptions(tenantId, rewardSystemId, 10);
  const red1 = redemptions1[0];
  chk("RW-1.3", "เกิด redemption PENDING พร้อมชื่อรางวัล+ลูกค้า", !!red1 && red1.status === "PENDING" && red1.rewardName === "กาแฟฟรี 1 แก้ว" && red1.customerName === "คุณสมชาย", "PENDING+ชื่อครบ", JSON.stringify(red1 ?? {}).slice(0, 90));
  const stockA1 = (await prisma.reward.findUnique({ where: { id: rewardA.id } }))?.stock;
  chk("RW-1.4", "สต็อกรางวัลลดลง (3→2)", stockA1 === 2, "2", String(stockA1));

  console.log("\n── idempotency: fulfill ซ้ำไม่ error/ไม่เบิ้ล ──");
  const f1 = await reward.fulfillRedemption(tenantId, rewardSystemId, red1.id);
  const f2 = await reward.fulfillRedemption(tenantId, rewardSystemId, red1.id);
  const red1After = await prisma.rewardRedemption.findUnique({ where: { id: red1.id } });
  chk("RW-2.1", "fulfill ครั้งแรก ok → FULFILLED", f1.ok === true && red1After?.status === "FULFILLED", "ok+FULFILLED", `${f1.ok}/${red1After?.status}`);
  chk("RW-2.2", "fulfill ซ้ำ ok (idempotent) ไม่เปลี่ยนสถานะ/ไม่ error", f2.ok === true && red1After?.status === "FULFILLED", "ok+FULFILLED", `${f2.ok}/${red1After?.status}`);
  const balAfterFulfill = await point.getBalance(pointSystemId, customer.id);
  chk("RW-2.3", "fulfill ไม่แตะแต้ม (ยัง 70)", balAfterFulfill === 70, "70", String(balAfterFulfill));

  console.log("\n── refund: แลก A อีกครั้ง → cancel → คืนแต้ม+สต็อก+CANCELLED ──");
  const r2 = await reward.redeem({ tenantId, rewardSystemId, pointSystemId, rewardId: rewardA.id, customerId: customer.id });
  chk("RW-3.0", "redeem รอบ 2 สำเร็จ (70→40)", r2.ok === true && (await point.getBalance(pointSystemId, customer.id)) === 40, "40", JSON.stringify(r2).slice(0, 40));
  const red2 = (await reward.listRedemptions(tenantId, rewardSystemId, 10)).find((x) => x.status === "PENDING");
  const c1 = await reward.cancelRedemption(tenantId, rewardSystemId, (red2 as { id: string }).id);
  const balAfterCancel = await point.getBalance(pointSystemId, customer.id);
  const red2After = await prisma.rewardRedemption.findUnique({ where: { id: (red2 as { id: string }).id } });
  const stockA2 = (await prisma.reward.findUnique({ where: { id: rewardA.id } }))?.stock;
  chk("RW-3.1", "cancel สำเร็จ → status CANCELLED", c1.ok === true && red2After?.status === "CANCELLED", "ok+CANCELLED", `${c1.ok}/${red2After?.status}`);
  chk("RW-3.2", "คืนแต้มกลับเท่าเดิม (40→70)", balAfterCancel === 70, "70", String(balAfterCancel));
  chk("RW-3.3", "คืนสต็อกกลับ (1→2)", stockA2 === 2, "2", String(stockA2));

  console.log("\n── cancel idempotent: ยกเลิกซ้ำไม่คืนแต้ม/สต็อกเบิ้ล ──");
  const c2 = await reward.cancelRedemption(tenantId, rewardSystemId, (red2 as { id: string }).id);
  const balAfterCancel2 = await point.getBalance(pointSystemId, customer.id);
  const stockA3 = (await prisma.reward.findUnique({ where: { id: rewardA.id } }))?.stock;
  chk("RW-4.1", "cancel ซ้ำ ok (idempotent) ไม่คืนแต้มเบิ้ล (ยัง 70)", c2.ok === true && balAfterCancel2 === 70, "ok+70", `${c2.ok}/${balAfterCancel2}`);
  chk("RW-4.2", "cancel ซ้ำ ไม่คืนสต็อกเบิ้ล (ยัง 2)", stockA3 === 2, "2", String(stockA3));

  console.log("\n── แต้มไม่พอ: แลกรางวัล B (999 แต้ม) → ปฏิเสธ ไม่แตะแต้ม ──");
  const balBefore = await point.getBalance(pointSystemId, customer.id);
  const rBad = await reward.redeem({ tenantId, rewardSystemId, pointSystemId, rewardId: rewardB.id, customerId: customer.id });
  const balAfterBad = await point.getBalance(pointSystemId, customer.id);
  chk("RW-5.1", "redeem แต้มไม่พอ → ok:false + reason", rBad.ok === false && typeof (rBad as { reason?: string }).reason === "string", "ok:false+reason", JSON.stringify(rBad).slice(0, 60));
  chk("RW-5.2", "แต้มไม่ถูกหักเมื่อแลกไม่สำเร็จ", balAfterBad === balBefore, String(balBefore), String(balAfterBad));

  console.log("\n── cross-tenant: ร้านอื่นเรียกด้วย tenantId ตัวเอง → มองไม่เห็น/ปฏิเสธ ──");
  const t2 = await prisma.tenant.create({ data: { name: "QC ร้านอื่น", slug: `qc-reward2-${Date.now()}` } });
  tenant2Id = t2.id;
  const foreignList = await reward.listRedemptions(t2.id, rewardSystemId, 10);
  chk("RW-6.1", "ร้านอื่น listRedemptions ไม่เห็นของร้านนี้", foreignList.length === 0, "0", String(foreignList.length));
  const foreignFulfill = await reward.fulfillRedemption(t2.id, rewardSystemId, red1.id);
  chk("RW-6.2", "ร้านอื่น fulfill ถูกปฏิเสธ (ไม่พบรายการ)", foreignFulfill.ok === false, "ok:false", JSON.stringify(foreignFulfill).slice(0, 50));
  const foreignCancel = await reward.cancelRedemption(t2.id, rewardSystemId, red1.id);
  const red1StillFulfilled = (await prisma.rewardRedemption.findUnique({ where: { id: red1.id } }))?.status;
  chk("RW-6.3", "ร้านอื่น cancel ถูกปฏิเสธ ไม่แตะรายการเดิม (ยัง FULFILLED)", foreignCancel.ok === false && red1StillFulfilled === "FULFILLED", "ok:false+FULFILLED", `${foreignCancel.ok}/${red1StillFulfilled}`);
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? e.message.slice(0, 160) : String(e));
} finally {
  const del = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ข้าม */ } };
  if (tenantId) {
    for (const m of ["rewardRedemption", "reward", "pointLedger", "pointBalance", "pointSettings", "memberActivity", "customer", "appSystemUnit", "appSystem"])
      await del(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId } }));
    await del(() => prisma.businessUnit.deleteMany({ where: { tenantId } }));
    await del(() => prisma.tenant.delete({ where: { id: tenantId } }));
  }
  if (tenant2Id) await del(() => prisma.tenant.delete({ where: { id: tenant2Id } }));
  console.log("\n[cleanup] เรียบร้อย");
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
console.log("\n===== QC Reward (แลกจริง) =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id })) }));
process.exit(failed.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
