// QC — DNA ต่อเนื่อง M4.5 (WO-0048) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/ai/dna-review.ts (deterministic — ห้ามใช้ LLM):
//   gatherDnaDrift(ctx: {tenantId}) → { drifts: [{ key, factValue, liveValue, message }] }
//     · เทียบ DnaProfile.facts (active ล่าสุด) กับข้อมูลจริง — กติกา v1 (อย่างน้อย 5 ข้อนี้):
//       staffDrift: |staffCount - HrEmployee active จริง| ≥ 3 และต่างเกิน 50%
//       membershipDrift: facts.membership=false แต่ Customer > 20
//       sellsGoodsDrift: facts.sellsGoods=false แต่ PosSale PAID > 10
//       vatDrift: facts.vatRegistered=false แต่มี AccountDocument vatAmount > 0
//       branchDrift: |facts.branchCount - BusinessUnit จริง| ≥ 2
//     · message = ไทยอ่านรู้เรื่อง (มีตัวเลขจริง) · ไม่มี DnaProfile → { drifts: [] } ห้าม throw
//   sweepDnaReview(now?: Date) → number — tenant ACTIVE ที่มี DnaProfile (cap 50):
//     drift ≥ 1 → AppNotification { title: "ธุรกิจคุณเปลี่ยนไปจากตอนตั้งค่า" } body รวม drift + ชวนคุยกับ AI (M4)
//     · กันสแปม: มี noti title นี้ใน 7 วันล่าสุด → ข้าม · ร้านพัง catch แล้วไปต่อ
//   ⚠️ ห้ามแตะ src/lib/platform/cron.ts (Builder 0072 ถืออยู่ — Fable wire เอง)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const FACTS = { industryHint: "RETAIL", branchCount: 1, appointment: false, tables: false, rooms: false, walkinQueue: false, sellsGoods: false, membership: false, rewardRedeem: false, staffCount: 2, vatRegistered: false, wantsAccounting: false, usesLineOA: false };

let tid = ""; let tid2 = "";
try {
  const dr = (await import("@/lib/ai/dna-review" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null; // any จงใจ: oracle ล้ำหน้าโค้ด
  if (!dr) { chk("DR-0", "มี ai/dna-review.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC DRIFT", slug: `qc-drift-${Date.now()}` } }); tid = t.id;
    await prisma.dnaProfile.create({ data: { tenantId: tid, facts: FACTS } as never }); // ไม่มีคอลัมน์ active — tenantId unique (oracle เคยเขียนผิด Builder ชี้ถูก)
    const hr = await sys.createSystem(tid, "HR", "คน");
    for (let i = 0; i < 6; i++) await prisma.hrEmployee.create({ data: { tenantId: tid, systemId: hr.id, name: `พนง ${i}` } });
    const member = await sys.createSystem(tid, "MEMBER", "สมาชิก");
    await prisma.customer.createMany({ data: Array.from({ length: 25 }, (_, i) => ({ tenantId: tid, memberSystemId: member.id, name: `ล ${i}` })) });
    const pos = await sys.createSystem(tid, "POS", "ขาย");
    const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "ส1", slug: `dr-${Date.now()}` } });
    await prisma.posSale.createMany({ data: Array.from({ length: 12 }, (_, i) => ({ tenantId: tid, unitId: unit.id, systemId: pos.id, idempotencyKey: `dr${i}`, status: "PAID", subtotalSatang: 1000, grandTotalSatang: 1000 })) });

    const d = await dr.gatherDnaDrift({ tenantId: tid });
    const keys = (d.drifts as { key: string; message: string }[]).map((x) => x.key);
    chk("DR-1.1", "drift ≥3 (staff/membership/sellsGoods) + message ไทยมีตัวเลข", (d.drifts as unknown[]).length >= 3 && ["staff", "membership", "sellsGoods"].every((k) => keys.some((x) => x.toLowerCase().includes(k.toLowerCase()))) && (d.drifts as { message: string }[]).every((x) => /[ก-๙]/.test(x.message) && /\d/.test(x.message)), "≥3", JSON.stringify(keys));
    const t2r = await prisma.tenant.create({ data: { name: "QC DRIFT2", slug: `qc-drift2-${Date.now()}` } }); tid2 = t2r.id;
    chk("DR-1.2", "ไม่มี DnaProfile → drifts [] ไม่ throw", ((await dr.gatherDnaDrift({ tenantId: tid2 })).drifts as unknown[]).length === 0, "[]", "?");

    const n1 = await dr.sweepDnaReview();
    const notiCount = () => prisma.appNotification.count({ where: { tenantId: tid, title: "ธุรกิจคุณเปลี่ยนไปจากตอนตั้งค่า" } });
    chk("DR-2.1", "sweep → noti 1 ฉบับ (นับรวม ≥1)", n1 >= 1 && (await notiCount()) === 1, "1", `${n1}/${await notiCount()}`);
    await dr.sweepDnaReview();
    chk("DR-2.2", "sweep ซ้ำใน 7 วัน → ไม่ส่งซ้ำ (ยัง 1)", (await notiCount()) === 1, "1", String(await notiCount()));
    chk("DR-2.3", "tenant ไม่มี drift → ไม่มี noti", (await prisma.appNotification.count({ where: { tenantId: tid2 } })) === 0, "0", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    for (const m of ["appNotification", "posSale", "customer", "hrEmployee", "dnaProfile", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC DNA Review =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
