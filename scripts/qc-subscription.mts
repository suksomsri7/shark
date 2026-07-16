// QC — Subscription (WO-0027) · Fable oracle, Builder ห้ามแตะ
//
// สัญญา src/lib/modules/member/subscription.ts (โมดูล member — ctx: {tenantId, systemId} ระบบ MEMBER):
//   createPlan(ctx, { name, priceSatang, periodDays }): Promise<{id}>          // periodDays ≥ 1 ไม่งั้น throw ไทย
//   listPlans(ctx, activeOnly=true)
//   setPlanActive(ctx, planId, active)
//   subscribe(ctx, { customerId, planId, startAt?: Date }): Promise<{id}>      // endAt = start + periodDays · ลูกค้ามี ACTIVE plan เดิมซ้อน → throw ไทย
//   cancelSubscription(ctx, subId): Promise<boolean>                            // ACTIVE→CANCELLED + cancelledAt · อื่น → false
//   isSubscriptionActive(ctx, customerId, at?: Date): Promise<boolean>          // มี ACTIVE ที่ at อยู่ในช่วง start..end
//   expireDue(ctx, now?: Date): Promise<number>                                 // ACTIVE ที่ endAt < now → EXPIRED (คืนจำนวน) — cron-ready idempotent
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const D = (iso: string) => new Date(iso);

let tid = "";
try {
  const sub = await import("@/lib/modules/member/subscription" as string).catch(() => null);
  if (!sub) { chk("SB-0", "มี member/subscription.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC SUB", slug: `qc-sb-${Date.now()}` } }); tid = t.id;
    const member = await sys.createSystem(tid, "MEMBER", "สมาชิก");
    const ctx = { tenantId: tid, systemId: member.id };
    const cust = await prisma.customer.create({ data: { tenantId: tid, memberSystemId: member.id, name: "คุณสมาชิก" } });

    const plan = await sub.createPlan(ctx, { name: "รายเดือน", priceSatang: 59900, periodDays: 30 });
    chk("SB-1.1", "createPlan + listPlans", (await sub.listPlans(ctx)).length === 1, "1", "?");
    let threw = false; try { await sub.createPlan(ctx, { name: "พัง", priceSatang: 100, periodDays: 0 }); } catch { threw = true; }
    chk("SB-1.2", "periodDays 0 → throw ไทย", threw, "throw", String(threw));

    const s1 = await sub.subscribe(ctx, { customerId: cust.id, planId: plan.id, startAt: D("2026-07-01T00:00:00Z") });
    const row = await prisma.memberSubscription.findUnique({ where: { id: s1.id } });
    chk("SB-2.1", "subscribe → ACTIVE + endAt = start+30 วัน", row?.status === "ACTIVE" && row?.endAt.toISOString().startsWith("2026-07-31"), "31 ก.ค.", String(row?.endAt.toISOString().slice(0, 10)));
    let threw2 = false; try { await sub.subscribe(ctx, { customerId: cust.id, planId: plan.id }); } catch { threw2 = true; }
    chk("SB-2.2", "สมัครซ้อนตอนยัง ACTIVE → throw ไทย", threw2, "throw", String(threw2));
    chk("SB-2.3", "isActive ณ กลางช่วง = true", (await sub.isSubscriptionActive(ctx, cust.id, D("2026-07-15T00:00:00Z"))) === true, "true", "?");
    chk("SB-2.4", "isActive หลังหมดอายุ = false", (await sub.isSubscriptionActive(ctx, cust.id, D("2026-09-01T00:00:00Z"))) === false, "false", "?");

    const n = await sub.expireDue(ctx, D("2026-08-05T00:00:00Z"));
    chk("SB-3.1", "expireDue → 1 + สถานะ EXPIRED", n === 1 && (await prisma.memberSubscription.findUnique({ where: { id: s1.id } }))?.status === "EXPIRED", "1", String(n));
    chk("SB-3.2", "expireDue ซ้ำ → 0 (idempotent)", (await sub.expireDue(ctx, D("2026-08-05T00:00:00Z"))) === 0, "0", "?");

    const s2 = await sub.subscribe(ctx, { customerId: cust.id, planId: plan.id, startAt: D("2026-08-10T00:00:00Z") });
    chk("SB-4.1", "หมดอายุแล้วสมัครใหม่ได้", !!s2.id, "ได้", "?");
    chk("SB-4.2", "cancel → CANCELLED + cancelledAt", (await sub.cancelSubscription(ctx, s2.id)) === true && (await prisma.memberSubscription.findUnique({ where: { id: s2.id } }))?.status === "CANCELLED", "CANCELLED", "?");
    chk("SB-4.3", "cancel ซ้ำ → false", (await sub.cancelSubscription(ctx, s2.id)) === false, "false", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) { for (const m of ["memberSubscription", "memberPlan", "memberActivity", "customer", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Subscription =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
