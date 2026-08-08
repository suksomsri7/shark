// QC M3 — DNA Wizard: facts → compile → blueprint → apply → ระบบประกอบเสร็จจริง
// ⚠️ Oracle ภายใต้ change control — Fable (Auditor) เป็นเจ้าของ · Builder ห้ามแตะ
//
// ส่วน compile = Fable เขียนเอง → golden checks ต้องเขียวตั้งแต่ต้น
// ส่วน apply   = Builder ทำ → fail-before: APPLY-* ต้องแดงจนกว่า src/lib/dna/apply.ts จะเสร็จ
//
// รัน: pnpm exec tsx scripts/qc-dna.mts

try { process.loadEnvFile(".env"); } catch { /* CI ใช้ env จาก secrets */ }

const { prisma } = await import("@/lib/core/db");
const { compile } = await import("@/lib/dna/compile");
const { planHash, ZBlueprintPlan, ZDnaFacts } = await import("@/lib/dna/schema");
const { nextQuestion, finalizeFacts, QUESTIONS } = await import("@/lib/dna/questions");
import type { DnaFacts } from "@/lib/dna/schema";

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev; fix?: string };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL", fix?: string) {
  checks.push({ id, name, ok, expected, actual, sev, fix });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}

const F = (over: Partial<DnaFacts>): DnaFacts =>
  ZDnaFacts.parse({
    industryHint: "OTHER", branchCount: 1, appointment: false, tables: false, rooms: false,
    walkinQueue: false, sellsGoods: false, membership: false, rewardRedeem: false,
    staffCount: 1, vatRegistered: false, wantsAccounting: false, usesLineOA: false,
    ...over,
  });

// ─────────────────── ส่วนที่ 1: compile (golden archetypes — pure logic ไม่แตะ DB) ───────────────────
console.log("── COMPILE: archetype ร้านตัดผม (ตามวิชันเจ้าของ) ──");
const salon = F({ industryHint: "SALON", appointment: true, sellsGoods: true, membership: true, rewardRedeem: true, staffCount: 5, vatRegistered: true, wantsAccounting: true, usesLineOA: true });
const p1 = compile(salon, "QC DNA ร้านผมสวย");
ZBlueprintPlan.parse(p1);
const types = (t: string) => p1.steps.filter((s) => s.type === t);
chk("CMP-1.1", "compile pure (facts เดิม → hash เดิม)", planHash(p1) === planHash(compile(salon, "QC DNA ร้านผมสวย")), "hash ตรง", "ไม่ตรง");
chk("CMP-1.2", "ร้านตัดผม: มีหน่วยจองคิว 1", types("CREATE_UNIT").length === 1 && (types("CREATE_UNIT")[0] as { unitType: string }).unitType === "BOOKING", "BOOKING ×1", JSON.stringify(types("CREATE_UNIT").map((s) => (s as { unitType: string }).unitType)));
chk("CMP-1.3", "ร้านตัดผม: feature ครบ POS/INVENTORY/HR/MEMBER/POINT/REWARD/CHAT/ACCOUNT (กติกาใหม่ 24 ก.ค.: ขายของ→คลัง · พนักงาน≥2→HR)", ["POS", "INVENTORY", "HR", "MEMBER", "POINT", "REWARD", "CHAT", "ACCOUNT"].every((t) => types("CREATE_SYSTEM").some((s) => (s as { systemType: string }).systemType === t)), "ครบ 6", JSON.stringify(types("CREATE_SYSTEM").map((s) => (s as { systemType: string }).systemType)));
chk("CMP-1.4", "ต่อสาย POS→Account อัตโนมัติ (ท่อ M1)", types("LINK_ACCOUNT_POS").length === 1, "1", String(types("LINK_ACCOUNT_POS").length));
chk("CMP-1.5", "ตั้งค่าบัญชี vatRegistered=true", types("ACCOUNT_SETTINGS").length === 1 && (types("ACCOUNT_SETTINGS")[0] as { settings: { vatRegistered: boolean } }).settings.vatRegistered === true, "true", "ดูข้างบน");
chk("CMP-1.6", "ทุก step มี because ไม่ว่าง", p1.steps.every((s) => s.because.trim().length > 0), "ครบ", "มีตัวว่าง");

console.log("── COMPILE: ร้านอาหาร 2 สาขา ไม่จด VAT ไม่มีสมาชิก ──");
const resto = F({ industryHint: "RESTAURANT", branchCount: 2, tables: true, walkinQueue: true, sellsGoods: true });
const p2 = compile(resto, "ครัวคุณยาย");
const units2 = p2.steps.filter((s) => s.type === "CREATE_UNIT") as { unitType: string; slug: string }[];
chk("CMP-2.1", "2 สาขา → RESTAURANT ×2 + QUEUE ×2 (slug ไม่ชน)", units2.filter((u) => u.unitType === "RESTAURANT").length === 2 && units2.filter((u) => u.unitType === "QUEUE").length === 2 && new Set(units2.map((u) => u.slug)).size === units2.length, "2+2 slug unique", JSON.stringify(units2.map((u) => u.slug)));
chk("CMP-2.2", "ไม่ขอบัญชี → ไม่มี ACCOUNT step ใด ๆ", !p2.steps.some((s) => s.type === "ACCOUNT_SETTINGS" || s.type === "LINK_ACCOUNT_POS" || (s.type === "CREATE_SYSTEM" && (s as { systemType: string }).systemType === "ACCOUNT")), "0", "มี");

console.log("── COMPILE: ธุรกิจที่ตอบไม่ทุกข้อ → ไม่ยัดเยียดระบบ ──");
const minimal = compile(F({}), "เปล่า");
chk("CMP-3.1", "facts ว่าง → 0 steps (หลัก standalone ไม่บังคับ)", minimal.steps.length === 0, "0", String(minimal.steps.length));

console.log("── QUESTIONS: tree ครบ + skip ถูก ──");
chk("Q-1.1", "ทุกคำถาม map ลง DnaFacts field จริง", QUESTIONS.every((q) => q.id in salon), "ครบ", "มีหลุด");
const noMember: Partial<DnaFacts> = { membership: false };
chk("Q-1.2", "ไม่มีสมาชิก → ข้ามคำถามแลกของรางวัล", nextQuestion({ ...salon, rewardRedeem: undefined, membership: false } as Partial<DnaFacts>)?.id !== "rewardRedeem", "ข้าม", "ไม่ข้าม");
chk("Q-1.3", "ข้อที่ถูกข้ามได้ default", (finalizeFacts({ ...salon, rewardRedeem: undefined, membership: false } as Partial<DnaFacts>) as DnaFacts).rewardRedeem === false, "false", "undefined");

// ─────────────────── ส่วนที่ 2: APPLY (fail-before — Builder ทำให้เขียว) ───────────────────
let tenantId = "";
try {
  console.log("\n── APPLY: ประกอบระบบจริงจาก blueprint ──");
  const apply = await import("@/lib/dna/apply" as string).catch(() => null);
  const tenant = await prisma.tenant.create({ data: { name: "QC DNA ร้านผมสวย", slug: `qc-dna-${Date.now()}` } });
  tenantId = tenant.id;

  if (!apply) {
    chk("APPLY-0", "มี src/lib/dna/apply.ts", false, "มี", "ยังไม่ได้สร้าง (fail-before)", "CRITICAL", "Builder: สร้างตาม interface ใน WO-0005");
  } else {
    await apply.saveDnaFacts(tenantId, salon);
    const prop = await apply.proposeBlueprint(tenantId);
    chk("APPLY-1.1", "propose ได้ blueprint PROPOSED + hash ตรง compile", prop.plan && planHash(prop.plan) === planHash(p1), planHash(p1), prop.plan ? planHash(prop.plan) : "null");
    const prop2 = await apply.proposeBlueprint(tenantId);
    chk("APPLY-1.2", "propose ซ้ำ idempotent (ได้ใบเดิม ไม่งอกใหม่)", prop2.blueprintId === prop.blueprintId, prop.blueprintId, prop2.blueprintId);

    const res = await apply.applyBlueprint(tenantId, prop.blueprintId);
    chk("APPLY-2.1", "apply สำเร็จ", res.ok === true, "ok", JSON.stringify(res).slice(0, 80));
    const [units, systems, links, accLinks, settings] = await Promise.all([
      prisma.businessUnit.findMany({ where: { tenantId } }),
      prisma.appSystem.findMany({ where: { tenantId } }),
      prisma.appSystemUnit.findMany({ where: { tenantId } }),
      prisma.accountSystemLink.findMany({ where: { tenantId } }),
      prisma.accountSettings.findFirst({ where: { tenantId } }),
    ]);
    chk("APPLY-2.2", "BusinessUnit เกิดตามแผน (BOOKING ×1)", units.length === 1 && units[0].type === "BOOKING", "1 BOOKING", JSON.stringify(units.map((u) => u.type)));
    chk("APPLY-2.3", "AppSystem ครบ 8 (+INVENTORY+HR ตามกติกาใหม่)", systems.length === 8, "8", String(systems.length));
    chk("APPLY-2.4", "เชื่อม unit↔feature ครบ (POS/MEMBER/POINT/REWARD ×1 unit = 4)", links.length === 4, "4", String(links.length));
    chk("APPLY-2.5", "AccountSystemLink POS↔ACCOUNT เกิด (ท่อ M1 ต่อให้อัตโนมัติ)", accLinks.length === 1 && accLinks[0].linkedKind === "POS", "1 POS", JSON.stringify(accLinks.map((l) => l.linkedKind)));
    chk("APPLY-2.6", "AccountSettings.vatRegistered = true + orgName = ชื่อกิจการ", settings?.vatRegistered === true && settings?.orgName === "QC DNA ร้านผมสวย", "true/ชื่อตรง", JSON.stringify({ vat: settings?.vatRegistered, org: settings?.orgName }));

    const res2 = await apply.applyBlueprint(tenantId, prop.blueprintId);
    const systems2 = await prisma.appSystem.count({ where: { tenantId } });
    chk("APPLY-3.1", "apply ซ้ำ idempotent (ระบบไม่งอกเพิ่ม)", res2.ok === true && systems2 === 8, "8 คงเดิม", String(systems2));

    const bp = await prisma.dnaBlueprint.findUnique({ where: { id: prop.blueprintId } });
    chk("APPLY-3.2", "blueprint สถานะ APPLIED + มี stepResults ครบทุก step", bp?.status === "APPLIED" && Array.isArray(bp?.stepResults) && (bp!.stepResults as unknown[]).length === p1.steps.length, `APPLIED · ${p1.steps.length} results`, `${bp?.status} · ${(bp?.stepResults as unknown[])?.length ?? 0}`);

    // ── ประกอบ "ทีละขั้น" (แถบ progress บนหน้าพิมพ์เขียว) ──
    // สัญญา: applyBlueprintStep(tenantId, blueprintId) → { total, done, stepIndex, ok, finished, error? }
    // ทำทีละ 1 ขั้นต่อการเรียก · done เพิ่มทีละ 1 · เรียกซ้ำหลังจบต้องไม่งอกระบบเพิ่ม
    console.log("── APPLY (ทีละขั้น): แถบความคืบหน้าต้องเดินตามจริง ──");
    await apply.saveDnaFacts(tenantId, resto); // แผนใหม่ (ร้านอาหาร 2 สาขา) — เริ่มจากศูนย์ทุกขั้น
    const propS = await apply.proposeBlueprint(tenantId);
    const totalS = propS.plan.steps.length;
    const sysBefore = await prisma.appSystem.count({ where: { tenantId } });

    let prog = await apply.applyBlueprintStep(tenantId, propS.blueprintId);
    chk("APPLY-4.1", "ก้าวแรก = ทำ 1 ขั้น (done=1 · stepIndex=0 · total ตรงแผน)", prog.ok === true && prog.done === 1 && prog.stepIndex === 0 && prog.total === totalS, `1/${totalS} · index 0`, JSON.stringify({ ok: prog.ok, done: prog.done, i: prog.stepIndex, total: prog.total }));

    let rounds = 1;
    let monotonic = true;
    while (!prog.finished && prog.ok && rounds <= totalS + 2) {
      const prev = prog.done;
      prog = await apply.applyBlueprintStep(tenantId, propS.blueprintId);
      rounds++;
      if (prog.done !== prev + 1) monotonic = false;
    }
    chk("APPLY-4.2", "เดินจนจบ: จำนวนรอบ = จำนวนขั้น · done เพิ่มทีละ 1 ทุกรอบ", prog.finished === true && prog.ok === true && rounds === totalS && monotonic && prog.done === totalS, `${totalS} รอบ · done เพิ่มทีละ 1`, JSON.stringify({ rounds, done: prog.done, monotonic, finished: prog.finished }));

    const bpS = await prisma.dnaBlueprint.findUnique({ where: { id: propS.blueprintId } });
    chk("APPLY-4.3", "จบครบ → blueprint APPLIED + ระบบเกิดจริง (ไม่ใช่แค่ตัวเลขวิ่ง)", bpS?.status === "APPLIED" && (await prisma.appSystem.count({ where: { tenantId } })) > sysBefore && (await prisma.businessUnit.count({ where: { tenantId, type: "RESTAURANT" } })) === 2, "APPLIED · ระบบเพิ่ม · RESTAURANT ×2", `${bpS?.status} · units ${await prisma.businessUnit.count({ where: { tenantId, type: "RESTAURANT" } })}`);

    const sysAfter = await prisma.appSystem.count({ where: { tenantId } });
    const again = await apply.applyBlueprintStep(tenantId, propS.blueprintId);
    chk("APPLY-4.4", "เรียกซ้ำหลังจบ (กดปุ่มซ้ำ/รีเฟรช) → finished ทันที ระบบไม่งอก", again.finished === true && again.ok === true && again.stepIndex === -1 && (await prisma.appSystem.count({ where: { tenantId } })) === sysAfter, "finished · index -1 · ระบบเท่าเดิม", JSON.stringify({ f: again.finished, i: again.stepIndex, sys: await prisma.appSystem.count({ where: { tenantId } }), was: sysAfter }));

    chk("APPLY-4.5", "โหมดทีละขั้นกับรวดเดียวใช้ผลชุดเดียวกัน (applyBlueprint หลังจากนั้น = ok ไม่ทำซ้ำ)", (await apply.applyBlueprint(tenantId, propS.blueprintId)).ok === true && (await prisma.appSystem.count({ where: { tenantId } })) === sysAfter, "ok · ระบบเท่าเดิม", String(await prisma.appSystem.count({ where: { tenantId } })));
  }
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? e.message.slice(0, 140) : String(e));
} finally {
  if (tenantId) {
    const del = async (n: string, fn: () => Promise<unknown>) => { try { await fn(); } catch (err) { console.log(`  ⚠ cleanup ${n}: ${err instanceof Error ? err.message.slice(0, 60) : err}`); } };
    await del("accSettings", () => prisma.accountSettings.deleteMany({ where: { tenantId } }));
    await del("accLink", () => prisma.accountSystemLink.deleteMany({ where: { tenantId } }));
    await del("accMapping", () => prisma.accountMapping.deleteMany({ where: { tenantId } }));
    await del("accLedger", () => prisma.accountLedger.deleteMany({ where: { tenantId } }));
    await del("accPeriod", () => prisma.accountPeriod.deleteMany({ where: { tenantId } }));
    await del("accDocSeq", () => prisma.accountDocSequence.deleteMany({ where: { tenantId } }));
    await del("blueprint", () => prisma.dnaBlueprint.deleteMany({ where: { tenantId } }));
    await del("profile", () => prisma.dnaProfile.deleteMany({ where: { tenantId } }));
    await del("outbox", () => prisma.outboxEvent.deleteMany({ where: { tenantId } }));
    await del("asu", () => prisma.appSystemUnit.deleteMany({ where: { tenantId } }));
    await del("appSystem", () => prisma.appSystem.deleteMany({ where: { tenantId } }));
    await del("unit", () => prisma.businessUnit.deleteMany({ where: { tenantId } }));
    await del("tenant", () => prisma.tenant.delete({ where: { id: tenantId } }));
    console.log("\n[cleanup] ลบ test tenant เรียบร้อย");
  }
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC M3: DNA Wizard =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0); // จบครบทุกข้อแล้วค่อยบอกความจริง — CI ต้องแดงเมื่อเจอ CRITICAL
