// probe-c21-builder.mts — builder probe (ไม่ใช่ oracle) ของใบ C2.1 · addendum 6 ของผู้คุมงาน:
//   event ที่ "ไม่มีผู้ติดต่อ" (crm.company.* · รายการกำหนดเองที่ผูกบริษัท) ต้องกันซ้ำด้วย — partial UNIQUE ของ C2.0 ครอบเฉพาะแถวที่มี
//   crmContactId ⇒ เส้นนี้ใช้ advisory lock (กฎ, eventKey) + หาก่อนเขียน ใน tx เดียว (`insertMainRun` ใน src/lib/modules/crm/automation.ts)
//   P1 ส่งซ้ำตามลำดับ 3 ครั้ง → 1 แถวหลัก · 1 webhook
//   P2 ส่งพร้อมกัน 10 ทาง × 2 รอบ (คนละ connection) → 1 แถวหลักต่อรอบ · 1 webhook ต่อรอบ
//   P3 ผ่านเอนจินกลาง (engine.runForEvent) พร้อมกัน 5 ทาง ด้วย event เดิมของรอบ P1 → ไม่เพิ่มแถว
//   P4 กรณีบวก: event ใบใหม่ของบริษัทเดิม → ทำงานอีก 1 ครั้ง (กันซ้ำต่อ eventKey ไม่ใช่ต่อกฎ)
//   P5 รายการกำหนดเองที่ผูกบริษัท (custom.record.created · ไม่มีผู้ติดต่อ) 8 ทางพร้อมกัน → 1 แถวหลัก
//   P6 แถวหลักของเส้นไม่มีผู้ติดต่อ: crmContactId = NULL · customerId = NULL · สถานะ OK (ไม่ถูกกันวนผิด ๆ)
//   SF1.a/b ดีลนิ่ง 2 ใบ · งานค้าง 3 งาน ของผู้ติดต่อเดียวกันทำงานครบ (cron ไม่ผ่านตัวกันวน) · SF1.c วนจริงยังหยุด (แถว loop#…) · SF1.c2 กุญแจเดิมว่าง
//   SF2.1 เกิน 500 รายการ + ตัดงบกลางทาง → รอบถัดไปตามเก็บครบไม่ซ้ำ · SF3.1 แถวรอของระบบ uiVersion 1 ไม่บังระบบ 2
// QC database only · tenant ทิ้ง `qc-p21-<rand>-*` ลบใน finally · ตัวส่ง (post) ฉีดเอง — ไม่มี request ออกนอกเครื่อง
// Run: CRM_V2_SWITCH=all bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c21-builder.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const env = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
console.log(`[env] DB ${env.loadQcEnv().host}`);
delete process.env.WEBHOOK_ALLOW_PRIVATE;

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const AUTO = (await import("@/lib/modules/crm/automation" as string)) as Any;
const ENG = (await import("@/lib/automation/engine" as string)) as Any;
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-p21-${rand}`;
const results: { id: string; ok: boolean }[] = [];
const chk = (id: string, name: string, ok: unknown, detail: string) => {
  results.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — ${detail}`}`);
};
const TENANTS: string[] = [];
const USERS: string[] = [];
const POSTS: { url: string; body: Any }[] = [];
const deps = { post: async (url: string, body: Any) => { POSTS.push({ url, body }); } };
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;

try {
  const u = await P.user.create({ data: { email: `${TAG}@qc.invalid`, name: `QC ${TAG}` } });
  USERS.push(u.id);
  const t = await P.tenant.create({ data: { name: `${TAG}-a`, slug: `${TAG}-a` } });
  TENANTS.push(t.id);
  await P.membership.create({ data: { userId: u.id, tenantId: t.id, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const sys = (await sysSvc.createSystem(t.id, "CRM", `CRM ${TAG}`)).id as string;
  await P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', '{"uiVersion":2,"bridgesEnabled":true}'::jsonb, true) WHERE "id" = $1`,
    sys,
  );
  const ctx = { tenantId: t.id, systemId: sys, actorUserId: u.id };
  const owner = { userId: u.id, role: "OWNER", unitAccess: [] as string[], permissions: {} };
  const party = await P.party.create({ data: { tenantId: t.id, name: `บริษัท ${TAG}`, kind: "PERSON" } });
  const co = (await P.crmCompany.create({ data: { tenantId: t.id, systemId: sys, partyId: party.id, name: `บริษัท ${TAG}` } })).id as string;
  const URL = "https://hooks.example.com/qc-c21-probe";
  const { id: rule } = await AUTO.createRule(ctx, owner, { name: `บริษัทใหม่ ${TAG}`, trigger: { event: "crm.company.created" }, actions: [{ type: "WEBHOOK", params: { url: URL } }] });
  const mains = async (ruleId: string) => (await P.automationRun.findMany({ where: { ruleId, stepIndex: null } })) as Any[];
  const ev = (key: string, payload: Record<string, unknown> = { companyId: co }) => ({ tenantId: t.id, systemId: sys, type: "crm.company.created", payload, idempotencyKey: key });
  const run = (e: Any) => AUTO.runForCrmEvent(e, { deps });

  // P1 ตามลำดับ
  const e1 = ev(`crm.company.created#${co}#${TAG}-1`);
  const s1 = [await run(e1), await run(e1), await run(e1)];
  chk("P1", "event ไม่มีผู้ติดต่อ ส่งซ้ำตามลำดับ 3 ครั้ง → 1 แถวหลัก · 1 webhook · ครั้งหลังคืน runs 0",
    (await mains(rule)).length === 1 && POSTS.length === 1 && s1[0].runs === 1 && s1[1].runs === 0 && s1[2].runs === 0,
    `rows=${(await mains(rule)).length} posts=${POSTS.length} runs=${s1.map((x: Any) => x.runs).join(",")}`);

  // P2 พร้อมกัน 10 ทาง × 2 รอบ
  const rounds: string[] = [];
  let ok2 = true;
  for (const r of [2, 3]) {
    const before = { rows: (await mains(rule)).length, posts: POSTS.length };
    const e = ev(`crm.company.created#${co}#${TAG}-${r}`);
    const par = await Promise.all(Array.from({ length: 10 }, () => run(e)));
    const rows = (await mains(rule)).length - before.rows;
    const posts = POSTS.length - before.posts;
    const fired = par.reduce((n: number, x: Any) => n + (x?.runs ?? 0), 0);
    rounds.push(`${rows}/${posts}/${fired}`);
    ok2 = ok2 && rows === 1 && posts === 1 && fired === 1;
  }
  chk("P2", "10 ทางพร้อมกัน × 2 รอบ (event ไม่มีผู้ติดต่อ) → 1 แถวหลัก · 1 webhook · รวม runs = 1 ต่อรอบ", ok2, rounds.join(" "));

  // P3 ผ่านเอนจินกลาง ด้วย event เดิมของ P1
  const before3 = (await mains(rule)).length;
  await Promise.all(Array.from({ length: 5 }, () => ENG.runForEvent(e1, { post: deps.post })));
  chk("P3", "เอนจินกลาง (engine.runForEvent) 5 ทางพร้อมกันด้วย event เดิม → ไม่เพิ่มแถว", (await mains(rule)).length === before3, `rows ${before3}→${(await mains(rule)).length}`);

  // P4 กรณีบวก
  await run(ev(`crm.company.updated-like#${co}#${TAG}-new`));
  chk("P4", "กรณีบวก: event ใบใหม่ของบริษัทเดิม → ทำงานอีก 1 ครั้ง (กันซ้ำต่อ eventKey)", (await mains(rule)).length === before3 + 1, `rows=${(await mains(rule)).length}`);

  // P5 รายการกำหนดเองที่ผูกบริษัท
  const obj = await P.customObject.create({ data: { tenantId: t.id, systemId: sys, key: "asset", label: "ทรัพย์สิน", labelPlural: "ทรัพย์สิน", parentType: "COMPANY", titleFieldKey: "name" } });
  const rec = await P.customRecord.create({ data: { tenantId: t.id, systemId: sys, objectId: obj.id, parentType: "COMPANY", parentId: co, title: `ทรัพย์สิน ${TAG}` } });
  const { id: rule2 } = await AUTO.createRule(ctx, owner, { name: `รายการใหม่ ${TAG}`, trigger: { event: "custom.record.created" }, actions: [{ type: "WEBHOOK", params: { url: URL } }] });
  const e5 = { tenantId: t.id, systemId: sys, type: "custom.record.created", payload: { recordId: rec.id, objectKey: "asset", parentType: "COMPANY", parentId: co }, idempotencyKey: `custom.record.created#${rec.id}#${TAG}` };
  const p5 = POSTS.length;
  await Promise.all(Array.from({ length: 8 }, () => run(e5)));
  chk("P5", "custom.record.created ของรายการที่ผูกบริษัท (ไม่มีผู้ติดต่อ) 8 ทางพร้อมกัน → 1 แถวหลัก · 1 webhook", (await mains(rule2)).length === 1 && POSTS.length - p5 === 1, `rows=${(await mains(rule2)).length} posts=${POSTS.length - p5}`);

  // P6 รูปของแถว
  const all = [...(await mains(rule)), ...(await mains(rule2))];
  chk("P6", "แถวหลักของเส้นไม่มีผู้ติดต่อ: crmContactId NULL · customerId NULL · สถานะ OK ทุกแถว (ไม่ถูกกันวนผิด ๆ) · webhook มีแต่ id",
    all.length > 0 && all.every((r) => r.crmContactId === null && r.customerId === null && r.status === "OK") && POSTS.every((p) => !JSON.stringify(p.body).includes(`บริษัท ${TAG}`)),
    all.map((r) => `${r.status}:${r.crmContactId}`).join(","));

  // ═══ SF-1 · กันวนต้องไม่กินงานจริง ═══
  const contact = async (label: string) => {
    const pt = await P.party.create({ data: { tenantId: t.id, name: `${label} ${TAG}`, kind: "PERSON" } });
    return (await P.crmContact.create({ data: { tenantId: t.id, systemId: sys, name: `${label} ${TAG}`, partyId: pt.id, ownerUserId: u.id } })).id as string;
  };
  const pipe = await P.crmPipeline.create({ data: { tenantId: t.id, systemId: sys, name: `ขาย ${TAG}`, stages: { create: [{ tenantId: t.id, systemId: sys, name: "ใหม่", kind: "OPEN", sortOrder: 0 }, { tenantId: t.id, systemId: sys, name: "ชนะ", kind: "WON", sortOrder: 1 }] } }, include: { stages: true } });
  const st0 = (pipe.stages as Any[]).find((x) => x.sortOrder === 0).id as string;
  const old = new Date(Date.now() - 30 * 86_400_000);
  const cStale = await contact("นิ่งสองดีล");
  const dA = (await P.crmDeal.create({ data: { tenantId: t.id, systemId: sys, contactId: cStale, pipelineId: pipe.id, stageId: st0, title: `ก ${TAG}`, stageEnteredAt: old, ownerUserId: u.id } })).id as string;
  const dB = (await P.crmDeal.create({ data: { tenantId: t.id, systemId: sys, contactId: cStale, pipelineId: pipe.id, stageId: st0, title: `ข ${TAG}`, stageEnteredAt: old, ownerUserId: u.id } })).id as string;
  const { id: rStale } = await AUTO.createRule(ctx, owner, { name: `นิ่ง ${TAG}`, trigger: { event: "crm.deal.stale", params: { days: 14 } }, actions: [{ type: "WEBHOOK", params: { url: URL } }] });
  const cOver = await contact("งานค้างสามงาน");
  for (let i = 0; i < 3; i += 1) await P.crmActivity.create({ data: { tenantId: t.id, systemId: sys, contactId: cOver, type: "TASK", title: `ค้าง ${i} ${TAG}`, dueAt: new Date(Date.now() - 3_600_000), ownerUserId: u.id } });
  const { id: rOver } = await AUTO.createRule(ctx, owner, { name: `ค้าง ${TAG}`, trigger: { event: "crm.activity.overdue" }, actions: [{ type: "CREATE_ACTIVITY", params: { type: "TASK", title: "ตามงานค้าง {ชื่อ}" } }] });
  const pBefore = POSTS.length;
  const cr1 = await AUTO.runCronTriggers({ tenantId: t.id, deps });
  const staleDeals = new Set(POSTS.slice(pBefore).map((x) => x.body?.dealId));
  chk("SF1.a", "ผู้ติดต่อเดียวกันมีดีลนิ่ง 2 ใบ → กฎดีลนิ่งทำงานครบทั้ง 2 ใบ (cron ไม่ผ่านตัวกันวน)", (await mains(rStale)).filter((r) => r.status === "OK").length === 2 && staleDeals.has(dA) && staleDeals.has(dB), `runs=${(await mains(rStale)).map((r) => r.status).join(",")} posts=${[...staleDeals].join(",")} cron=${JSON.stringify(cr1)}`);
  chk("SF1.b", "ผู้ติดต่อเดียวกันมีงานค้าง 3 งาน → กฎงานค้างทำงานครบ 3 ครั้ง", (await mains(rOver)).filter((r) => r.status === "OK").length === 3, `runs=${(await mains(rOver)).map((r) => r.status).join(",")}`);
  const cr2 = await AUTO.runCronTriggers({ tenantId: t.id, deps });
  chk("SF1.a2", "รอบ cron ซ้ำวันเดียวกัน → ไม่เพิ่มแถว (กุญแจกันซ้ำ)", (await mains(rStale)).length === 2 && (await mains(rOver)).length === 3 && cr2.runs === 0, `cron2=${JSON.stringify(cr2)}`);

  // วนจริง: บันทึกกิจกรรม → กฎสร้างกิจกรรม → event ใหม่ → … ต้องหยุดเอง (ปั๊ม outbox ของร้านนี้เอง ผ่านเอนจินกลาง)
  const ACT = (await import("@/lib/modules/crm/activities" as string)) as Any;
  const cLoop = await contact("วนตัวเอง");
  const { id: rLoop } = await AUTO.createRule(ctx, owner, { name: `วน ${TAG}`, trigger: { event: "crm.activity.logged" }, actions: [{ type: "CREATE_ACTIVITY", params: { type: "TASK", title: "ตามต่อ {ชื่อ}" } }] });
  await ACT.logActivity(ctx, owner, { type: "NOTE", title: `เริ่ม ${TAG}`, contactId: cLoop });
  let quiet = false;
  for (let round = 0; round < 15 && !quiet; round += 1) {
    const rows = (await P.outboxEvent.findMany({ where: { tenantId: t.id, status: "PENDING" }, orderBy: { createdAt: "asc" } })) as Any[];
    if (rows.length === 0) { quiet = true; break; }
    for (const r of rows) {
      await ENG.runForEvent({ id: r.id, tenantId: r.tenantId, type: r.type, payload: r.payload, systemId: r.systemId }, { post: deps.post });
      await P.outboxEvent.update({ where: { id: r.id }, data: { status: "DONE", processedAt: new Date() } });
    }
  }
  const loopRuns = (await P.automationRun.findMany({ where: { ruleId: rLoop } })) as Any[];
  const loopRow = loopRuns.find((r) => r.status === "SKIPPED" && String(r.eventKey).startsWith("loop#"));
  const acts = await P.crmActivity.count({ where: { contactId: cLoop } });
  chk("SF1.c", "วนจริง (กฎสร้างกิจกรรมเมื่อมีกิจกรรม) ยังหยุดเอง: ปั๊มเงียบ · กิจกรรม ≤ 3 · มีแถวข้าม (กันวน) ภาษาไทย ใต้กุญแจ loop#…",
    quiet && acts >= 2 && acts <= 3 && !!loopRow && /[ก-๙]/.test(String(loopRow.detail)), `quiet=${quiet} acts=${acts} rows=${loopRuns.map((r) => `${r.status}:${String(r.eventKey).slice(0, 12)}`).join(",")}`);
  const origKey = loopRow ? String(loopRow.eventKey).slice(5) : "";
  chk("SF1.c2", "แถวกันวนไม่ยึดกุญแจของ event เดิม (event ใบนั้นยังทำงานได้ภายหลัง)", !!origKey && !loopRuns.some((r) => r.eventKey === origKey), `orig=${origKey}`);

  // ═══ SF-2 · cron ไม่อดตาย: เกิน 500 รายการ + ตัดงบกลางทางแล้วรอบถัดไปตามเก็บ ═══
  const cMany = await contact("งานค้างเยอะ");
  const N = 520;
  await P.crmActivity.createMany({ data: Array.from({ length: N }, (_, i) => ({ tenantId: t.id, systemId: sys, contactId: cMany, type: "TASK", title: `ค้างเยอะ ${i} ${TAG}`, dueAt: new Date(Date.now() - 7_200_000), ownerUserId: u.id })) });
  await AUTO.toggleRule(ctx, owner, rOver, false);
  const { id: rMany } = await AUTO.createRule(ctx, owner, { name: `ค้างเยอะ ${TAG}`, trigger: { event: "crm.activity.overdue" }, actions: [{ type: "ENROLL_SEQUENCE", params: { sequenceKey: "x" } }] });
  const cut = await AUTO.runCronTriggers({ tenantId: t.id, deps, deadline: Date.now() + 4_000 });
  const afterCut = (await mains(rMany)).length;
  const rest = await AUTO.runCronTriggers({ tenantId: t.id, deps });
  const total = (await mains(rMany)).length;
  const keys = new Set(((await mains(rMany)) as Any[]).map((r) => r.eventKey));
  chk("SF2.1", `งานค้าง ${N + 3} งาน (เกินหน้า 500) · รอบแรกถูกตัดงบกลางทาง → รอบถัดไปตามเก็บจนครบทุกงาน ไม่ซ้ำ`,
    cut.cutOff === true && afterCut < N + 3 && total === N + 3 && keys.size === total, `cut=${JSON.stringify(cut)} afterCut=${afterCut} rest=${JSON.stringify(rest)} total=${total} unique=${keys.size}`);

  // ═══ SF-3 · ขั้นที่รอของระบบ uiVersion 1 ไม่แย่งที่ระบบ 2 ═══
  const sysV1 = (await sysSvc.createSystem(t.id, "CRM", `CRM-V1 ${TAG}`)).id as string;
  const ruleV1 = await P.automationRule.create({ data: { tenantId: t.id, name: `v1 รอ ${TAG}`, event: "crm.contact.created", enabled: true, actionType: "NOTIFY", actionConfig: {}, scope: "CRM", crmSystemId: sysV1, kind: "RULE", trigger: { event: "crm.contact.created" }, actions: [] } });
  const past = new Date(Date.now() - 5 * 86_400_000);
  await P.automationRun.createMany({ data: Array.from({ length: 60 }, () => ({ tenantId: t.id, ruleId: ruleV1.id, journeyId: ruleV1.id, status: "WAITING", stepIndex: 0, scheduledAt: past, payload: { thenActions: [] } })) });
  const cW = await contact("รอระบบสอง");
  const { id: rWait } = await AUTO.createRule(ctx, owner, { name: `รอ ${TAG}`, trigger: { event: "crm.contact.assigned" }, actions: [{ type: "WAIT_THEN", params: { days: 1, thenActions: [{ type: "WEBHOOK", params: { url: URL } }] } }] });
  await run({ tenantId: t.id, systemId: sys, type: "crm.contact.assigned", payload: { contactId: cW }, idempotencyKey: `assigned#${cW}#${TAG}` });
  const w = await AUTO.runDueWaits({ tenantId: t.id, deps, limit: 20, now: new Date(Date.now() + 2 * 86_400_000) });
  const wRow = ((await P.automationRun.findMany({ where: { ruleId: rWait, stepIndex: { not: null } } })) as Any[])[0];
  const v1Rows = (await P.automationRun.findMany({ where: { ruleId: ruleV1.id } })) as Any[];
  chk("SF3.1", "ขั้นที่รอ 60 แถวของระบบ uiVersion 1 (เก่ากว่า) ไม่บังแถวของระบบ 2 (limit 20) — แถวระบบ 2 ทำงาน · แถวระบบ 1 คง WAITING และ scheduledAt ไม่ถูกเลื่อน (ไม่ถูกจอง)",
    wRow?.status === "OK" && v1Rows.every((r) => r.status === "WAITING" && new Date(r.scheduledAt).getTime() === past.getTime()), `ran=${JSON.stringify(w)} v2=${wRow?.status} v1=${v1Rows.filter((r) => r.status !== "WAITING" || new Date(r.scheduledAt).getTime() !== past.getTime()).length} changed`);
} catch (e) {
  chk("FATAL", "probe ran to the end", false, e instanceof Error ? `${e.message}\n${e.stack ?? ""}`.slice(0, 600) : String(e));
} finally {
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  if (ids.length) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => r.table_name as string).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (let pass = 0; pass < 4; pass += 1) for (const tb of tables) await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" IN (${inList})`).catch(() => null);
    for (const id of ids) {
      await P.appSystem.deleteMany({ where: { tenantId: id } }).catch(() => null);
      await P.tenant.delete({ where: { id } }).catch(() => null);
    }
  }
  for (const uid of USERS) await P.user.delete({ where: { id: uid } }).catch(() => null);
  const left = ids.length ? await P.tenant.count({ where: { id: { in: ids } } }) : 0;
  chk("CLEAN", "tenant/ผู้ใช้ทิ้งถูกลบหมด", left === 0 && (USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0) === 0, `tenants=${left}`);
  await prisma.$disconnect();
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed === results.length ? "🟢" : "🔴"} probe C2.1: ${passed}/${results.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: results.length, passed, findings: results.filter((r) => !r.ok).map((r) => r.id) })}`);
process.exit(passed === results.length ? 0 : 1);
