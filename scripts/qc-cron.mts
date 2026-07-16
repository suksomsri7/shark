// QC — Cron kernel (WO-0029) · Fable oracle, Builder ห้ามแตะ
//
// สัญญา src/lib/platform/cron.ts (platform-level — prisma ตรง กวาดข้ามร้านได้):
//   sweepExpiredSubscriptions(now?: Date): Promise<number>  // MemberSubscription ACTIVE ที่ endAt < now → EXPIRED (ทุกร้าน) — idempotent
//   sweepExpiredProposals(now?: Date): Promise<number>      // AiProposal PENDING ที่ expiresAt < now → EXPIRED — idempotent
//   runDailyCron(now?: Date): Promise<{ subsExpired: number; proposalsExpired: number; outboxDrained: number }>
//     — เรียก 2 sweep + drainAll() จาก src/lib/outbox-consumers (เก็บตก event PENDING) · ห้าม throw (ตัวใดพังให้เก็บเลขเป็น -1 แล้วไปต่อ)
// route: src/app/api/cron/tick/route.ts — GET · ตรวจ header authorization = `Bearer ${SHARK_CRON_SECRET}` (ไม่ตรง → 401 ไม่บอกรายละเอียด) → runDailyCron → JSON
// vercel.json: crons เรียก /api/cron/tick ทุกวัน 03:00 BKK (20 UTC)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = "";
try {
  const cron = await import("@/lib/platform/cron" as string).catch(() => null);
  if (!cron) { chk("CR-0", "มี src/lib/platform/cron.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC CRON", slug: `qc-cr-${Date.now()}` } }); tid = t.id;
    const member = await sys.createSystem(tid, "MEMBER", "สมาชิก");
    const cust = await prisma.customer.create({ data: { tenantId: tid, memberSystemId: member.id, name: "ค" } });
    const plan = await prisma.memberPlan.create({ data: { tenantId: tid, systemId: member.id, name: "เดือน", priceSatang: 100, periodDays: 30 } });
    // sub หมดอายุแล้ว 1 + ยังไม่หมด 1
    await prisma.memberSubscription.createMany({ data: [
      { tenantId: tid, systemId: member.id, customerId: cust.id, planId: plan.id, status: "ACTIVE", startAt: new Date("2026-06-01"), endAt: new Date("2026-07-01") },
      { tenantId: tid, systemId: member.id, customerId: cust.id, planId: plan.id, status: "ACTIVE", startAt: new Date("2026-07-10"), endAt: new Date("2026-12-31") },
    ] });
    const conv = await prisma.aiConversation.create({ data: { tenantId: tid, title: "qc" } });
    await prisma.aiProposal.createMany({ data: [
      { tenantId: tid, conversationId: conv.id, kind: "inventory_receive", summary: "เก่า", payload: {}, status: "PENDING", expiresAt: new Date("2026-07-01") },
      { tenantId: tid, conversationId: conv.id, kind: "inventory_receive", summary: "ใหม่", payload: {}, status: "PENDING", expiresAt: new Date("2026-12-31") },
    ] });

    const NOW = new Date("2026-07-16T00:00:00Z");
    const n1 = await cron.sweepExpiredSubscriptions(NOW);
    chk("CR-1.1", "sweep subs: หมดอายุ 1 → EXPIRED · ตัวยังไม่หมดคงเดิม", n1 >= 1 && (await prisma.memberSubscription.count({ where: { tenantId: tid, status: "EXPIRED" } })) === 1 && (await prisma.memberSubscription.count({ where: { tenantId: tid, status: "ACTIVE" } })) === 1, "1/1", `${n1}`);
    chk("CR-1.2", "sweep subs ซ้ำ → 0 (idempotent)", (await cron.sweepExpiredSubscriptions(NOW)) === 0, "0", "?");
    const n2 = await cron.sweepExpiredProposals(NOW);
    chk("CR-2.1", "sweep proposals: เก่า→EXPIRED ใหม่คง PENDING", n2 >= 1 && (await prisma.aiProposal.count({ where: { tenantId: tid, status: "PENDING" } })) === 1, "1 เหลือ", `${n2}`);
    const r = await cron.runDailyCron(NOW);
    chk("CR-3.1", "runDailyCron คืนครบ 3 ตัวเลข ไม่ throw", typeof r.subsExpired === "number" && typeof r.proposalsExpired === "number" && typeof r.outboxDrained === "number", "ครบ", JSON.stringify(r));
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) { for (const m of ["aiProposal", "aiConversation", "memberSubscription", "memberPlan", "customer", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Cron =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
