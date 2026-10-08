// qc-crm-c51fix-equiv.mts — ข้อสอบความเท่ากันของใบ C5.1-fix: "ผลเดิม" (โค้ดก่อนแก้) เทียบ "ผลใหม่" (โค้ดหลังแก้) บนฐานเดียวกัน
//
// วิธี: สคริปต์นี้ใช้เฉพาะฟังก์ชันสาธารณะที่มีทั้งในโค้ดเก่าและใหม่ → รันสองครั้งบนข้อมูลชุดเดียวกัน (โค้ดเก่า = git HEAD ของใบ,
//   โค้ดใหม่ = worktree หลังแก้) แล้วเทียบไฟล์ผลด้วย `--compare old.json new.json` — ทุกฉาก × ทุกบทบาท ต้องได้ผลเหมือนกันทุกไบต์
//   (ยกเว้นความต่างที่ตั้งใจ ซึ่งเขียนไว้ใน KNOWN ข้างล่าง) · ฉากที่โค้ดเก่า "ล้ม" (P2029 ที่ขนาดจริง) ⇒ โค้ดใหม่ต้องไม่ล้ม
//   และต้องตรงกับ "ผลอ้างอิงอิสระ" (SQL ที่สคริปต์เขียนเอง ∩ ชุด id ที่ visibleWhere เดิมให้เห็น) ที่คำนวณในรอบใหม่
//   รอบโค้ดใหม่ยังเทียบ `visibleSql` (ใหม่) กับ `visibleWhere` (เดิม) ของผู้ติดต่อ/บริษัท/ดีล ทุกบทบาท (ชุด id เต็ม)
// Run: bash scripts/qc2.sh pnpm exec tsx scripts/qc-crm-c51fix-equiv.mts --tenant qc|perf --out <file.json>
//      pnpm exec tsx scripts/qc-crm-c51fix-equiv.mts --compare <old.json> <new.json>
// อ่านอย่างเดียว (ไม่มีการเขียนฐานเลย — ไม่เรียก export/งานที่เขียน audit)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { readFileSync, writeFileSync } from "node:fs";

const ARGV = process.argv.slice(2);
const argVal = (k: string) => {
  const i = ARGV.indexOf(k);
  return i >= 0 ? ARGV[i + 1] : undefined;
};

// ═══════════════════ โหมดเทียบ ═══════════════════
if (ARGV[0] === "--compare") {
  const a = JSON.parse(readFileSync(ARGV[1]!, "utf8")) as { scenes: Record<string, Any>; checks?: Record<string, Any> };
  const b = JSON.parse(readFileSync(ARGV[2]!, "utf8")) as { scenes: Record<string, Any>; checks?: Record<string, Any> };
  let same = 0;
  let diff = 0;
  let oldErrNewOk = 0;
  const bad: string[] = [];
  // ORACLE-EDIT (controller ruling C5.4-E SF-7, 1 Oct): since C5.4-E (L6-m3) contacts sorted by name use the Thai ICU collation
  //   (`COLLATE "th-TH-x-icu"`) — the order differs from the old C-collation run BY DESIGN. For the `contacts.sortName[.p2].<actor>`
  //   family only: page 1 + page 2 must hold the SAME rows (same ids, same count) in both runs; the order itself is pinned by C5.3-L6-m3.
  //   Every other scene is still compared byte for byte.
  const SORT_NAME = /^contacts\.sortName\.(?:p2\.)?(.+)$/;
  const sortNameIds = (sc: Record<string, Any>, actor: string) =>
    [sc[`contacts.sortName.${actor}`], sc[`contacts.sortName.p2.${actor}`]].flatMap((v) => ((v?.value?.items ?? []) as Any[]).map((it) => String(it.id))).sort();
  const sortNameDone = new Set<string>();
  for (const k of Object.keys(a.scenes)) {
    const sn = SORT_NAME.exec(k);
    if (sn) {
      const actor = sn[1]!;
      if (sortNameDone.has(actor)) continue;
      sortNameDone.add(actor);
      const n = [`contacts.sortName.${actor}`, `contacts.sortName.p2.${actor}`].filter((x) => x in a.scenes).length;
      const ia = sortNameIds(a.scenes, actor);
      const ib = sortNameIds(b.scenes, actor);
      const errA = [a.scenes[`contacts.sortName.${actor}`]?.error, a.scenes[`contacts.sortName.p2.${actor}`]?.error].filter(Boolean).join("|");
      const errB = [b.scenes[`contacts.sortName.${actor}`]?.error, b.scenes[`contacts.sortName.p2.${actor}`]?.error].filter(Boolean).join("|");
      if (errA === errB && JSON.stringify(ia) === JSON.stringify(ib)) same += n;
      else {
        diff += n;
        bad.push(`DIFF-SET contacts.sortName(+p2).${actor} old=${ia.length} new=${ib.length} errOld=${errA || "-"} errNew=${errB || "-"}`);
      }
      continue;
    }
    const x = a.scenes[k];
    const y = b.scenes[k];
    if (y === undefined) {
      bad.push(`MISSING ${k}`);
      diff += 1;
      continue;
    }
    if (x?.error && !y?.error && /P2029|parameter limit|Expected zero or one element/i.test(String(x.error))) {
      // โค้ดเก่าล้มเพราะเพดาน bind — ผลใหม่ต้องผ่านผลอ้างอิง (ตรวจในรอบใหม่: checks[`ref:${k}`])
      const ref = b.checks?.[`ref:${k}`];
      if (ref?.ok) oldErrNewOk += 1;
      else {
        bad.push(`OLD-P2029 ${k} · ไม่มี/ไม่ผ่านผลอ้างอิง ${JSON.stringify(ref ?? null).slice(0, 200)}`);
        diff += 1;
      }
      continue;
    }
    if (JSON.stringify(x) === JSON.stringify(y)) same += 1;
    else {
      diff += 1;
      bad.push(`DIFF ${k}\n   old ${JSON.stringify(x).slice(0, 400)}\n   new ${JSON.stringify(y).slice(0, 400)}`);
    }
  }
  for (const k of Object.keys(b.scenes)) {
    if (k in a.scenes) continue;
    // ฉากต่อเนื่อง (หน้า 2) ที่รอบเก่าไม่มีเพราะหน้า 1 ล้ม — ต้องผ่านผลอ้างอิงของรอบใหม่
    if (b.checks?.[`ref:${k}`]?.ok) oldErrNewOk += 1;
    else {
      bad.push(`EXTRA ${k} · ไม่มี/ไม่ผ่านผลอ้างอิง`);
      diff += 1;
    }
  }
  const checks = Object.entries(b.checks ?? {});
  const checkFail = checks.filter(([, v]) => !v?.ok);
  for (const [k, v] of checkFail) bad.push(`CHECK-FAIL ${k} ${JSON.stringify(v).slice(0, 300)}`);
  for (const l of bad) console.log(l);
  const summary = { scenes: Object.keys(a.scenes).length, same, diff, oldP2029NewOkVsReference: oldErrNewOk, checks: checks.length, checkFail: checkFail.length };
  console.log(`JSON_SUMMARY ${JSON.stringify(summary)}`);
  process.exit(diff === 0 && checkFail.length === 0 ? 0 : 1);
}

// ═══════════════════ โหมดเก็บผล ═══════════════════
const TENANT = argVal("--tenant") ?? "qc";
const OUT = argVal("--out") ?? `.qc-shots/c51fix/equiv-${TENANT}.json`;
for (const u of [process.env.DATABASE_URL ?? "", process.env.DIRECT_URL ?? ""]) {
  if (!u.includes("ep-cool-shadow") || process.env.QC_BRANCH !== "qc2") {
    console.error("🔴 equiv: ต้องรันผ่าน scripts/qc2.sh (QC2) เท่านั้น");
    process.exit(4);
  }
}
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();

const { prisma } = (await import("@/lib/core/db")) as Any;
const { toMemberActor } = (await import("@/lib/modules/member")) as Any;
const C = (await import("@/lib/modules/crm/contacts")) as Any;
const CO = (await import("@/lib/modules/crm/companies")) as Any;
const D = (await import("@/lib/modules/crm/deals")) as Any;
const R = (await import("@/lib/modules/crm/reports")) as Any;
const EM = (await import("@/lib/modules/crm/emails")) as Any;
const OB = (await import("@/lib/modules/crm/objects")) as Any;
const V = (await import("@/lib/modules/crm/visibility")) as Any;
const NEW = typeof V.visibleSql === "function";

let tenantId: string;
let systemId: string;
const actors: Record<string, { userId: string; actor: Any }> = {};
if (TENANT === "perf") {
  const t = await prisma.tenant.findFirst({ where: { slug: "crm-perf-qc" }, select: { id: true } });
  const s = await prisma.appSystem.findFirst({ where: { tenantId: t.id, type: "CRM" }, select: { id: true } });
  tenantId = t.id;
  systemId = s.id;
  const ms = (await prisma.membership.findMany({ where: { tenantId }, include: { user: { select: { email: true } } } })) as Any[];
  const by = (n: number) => ms.find((m) => m.user.email === `crm-perf-qc+u${String(n).padStart(2, "0")}@example.test`);
  for (const [k, n] of Object.entries({ owner: 1, manager: 2, mgrHkt: 3, lead: 4, staff: 5, staff2: 11 })) {
    const m = by(n);
    if (m) actors[k] = { userId: m.userId, actor: toMemberActor(m.userId, m) };
  }
} else {
  // ร้าน QC ปกติของ CRM บน QC2 (seed-member-qc + seed-crm-qc · slug ของ MQC) — หาจาก slug (เฉลยใน worktree อาจเป็นของ QC อื่น)
  const t = await prisma.tenant.findFirst({ where: { slug: argVal("--slug") ?? "siam-dive-member-qc" }, select: { id: true } });
  const s = t ? await prisma.appSystem.findFirst({ where: { tenantId: t.id, type: "CRM" }, orderBy: { createdAt: "asc" }, select: { id: true } }) : null;
  if (!t || !s) {
    console.error("🔴 equiv: ไม่พบร้าน QC ของ CRM บน QC2");
    process.exit(2);
  }
  tenantId = t.id;
  systemId = s.id;
  const ms = (await prisma.membership.findMany({ where: { tenantId, acceptedAt: { not: null } }, include: { user: { select: { email: true } } }, orderBy: { createdAt: "asc" } })) as Any[];
  for (const m of ms) {
    const k = m.role === "OWNER" && !actors.owner ? "owner" : String(m.user?.email ?? m.userId).split("@")[0]!.replace(/[^A-Za-z0-9]+/g, "_");
    actors[k] = { userId: m.userId, actor: toMemberActor(m.userId, m) };
  }
}
const ctxOf = (k: string) => ({ tenantId, systemId, actorUserId: actors[k]!.userId });
// ═══════════════════ --prep (ร้าน perf เท่านั้น · ก่อนรอบเก่า/ใหม่ · รันซ้ำได้) ═══════════════════
// ร้าน perf มีฟิลด์กรองได้เฉพาะผู้ติดต่อ/วัตถุ ⇒ เติม (1) ฟิลด์ระบบของผู้ติดต่อ/บริษัท/ดีล ผ่าน engine จริง (applyTemplate "system")
// (2) ฟิลด์กำหนดเองกรองได้ของบริษัท (ค่ากว้าง 70% ของ 50,000 = เกินเพดาน bind) และดีล พร้อมค่า — ทุกอย่างอยู่ในร้าน perf (ลบทิ้งด้วย --drop)
if (ARGV.includes("--prep")) {
  if (TENANT !== "perf") {
    console.error("🔴 --prep ใช้กับร้าน perf เท่านั้น");
    process.exit(2);
  }
  const FS = (await import("@/lib/modules/member/fields")) as Any;
  for (const objectKey of ["contact", "company", "deal"]) {
    const r = await FS.applyTemplate({ tenantId, systemId, actorUserId: null, objectKey }, "system", {});
    console.log(`system template ${objectKey}: +${r.added.fields} ฟิลด์`);
  }
  const defs = [
    { objectKey: "company", key: "tier_pref", type: "SELECT", choices: ["gold", "silver", "bronze"], table: "CrmCompany", rt: "COMPANY", pct: 0.7 },
    { objectKey: "company", key: "headcount", type: "NUMBER", table: "CrmCompany", rt: "COMPANY", pct: 0.7 },
    { objectKey: "deal", key: "priority_tag", type: "SELECT", choices: ["p1", "p2", "p3"], table: "CrmDeal", rt: "DEAL", pct: 0.8 },
    { objectKey: "deal", key: "signed_on", type: "DATE", table: "CrmDeal", rt: "DEAL", pct: 0.5 },
  ];
  for (const d of defs) {
    const sec =
      (await prisma.memberSection.findFirst({ where: { systemId, objectKey: d.objectKey, key: "c51fix" }, select: { id: true } })) ??
      (await prisma.memberSection.create({ data: { tenantId, systemId, objectKey: d.objectKey, key: "c51fix", label: "C5.1-fix", columns: 2, sortOrder: 9 }, select: { id: true } }));
    const fld =
      (await prisma.memberField.findFirst({ where: { systemId, objectKey: d.objectKey, key: d.key }, select: { id: true } })) ??
      (await prisma.memberField.create({
        data: { tenantId, systemId, sectionId: sec.id, objectKey: d.objectKey, key: d.key, label: d.key, type: d.type, options: d.choices ? { choices: d.choices.map((c) => ({ value: c, label: c })) } : {}, filterable: true, sortOrder: 9 },
        select: { id: true },
      }));
    const val =
      d.type === "SELECT"
        ? `"valueOptions", ARRAY[(ARRAY[${d.choices!.map((c) => `'${c}'`).join(",")}])[1 + (('x' || substr(md5(r."id" || 'v'), 1, 6))::bit(24)::int % ${d.choices!.length})]]`
        : d.type === "NUMBER"
          ? `"valueNumber", (('x' || substr(md5(r."id" || 'n'), 1, 6))::bit(24)::int % 5000)`
          : `"valueDate", date_trunc('day', now()) - ((('x' || substr(md5(r."id" || 'd'), 1, 6))::bit(24)::int % 700) * interval '1 day')`;
    const col = val.split(",")[0]!;
    const n = await prisma.$executeRawUnsafe(
      `INSERT INTO "CustomRecordValue" ("id","tenantId","recordType","recordId","fieldId",${col},"updatedAt")
       SELECT 'c51f_' || $3 || '_' || r."id", r."tenantId", '${d.rt}'::"CustomRecordType", r."id", $3, ${val.slice(col.length + 2)}, now()
         FROM "${d.table}" r
        WHERE r."systemId" = $1 AND r."tenantId" = $2 AND (('x' || substr(md5(r."id" || 'p'), 1, 6))::bit(24)::int % 1000) < ${Math.round(d.pct * 1000)}
       ON CONFLICT DO NOTHING`,
      systemId,
      tenantId,
      fld.id,
    );
    console.log(`field ${d.objectKey}.${d.key}: +${n} ค่า`);
  }
  await prisma.$executeRawUnsafe(`ANALYZE "CustomRecordValue"`);
  console.log("PREP_DONE");
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`equiv ${TENANT} · code ${NEW ? "NEW" : "OLD"} · tenant ${tenantId} · system ${systemId} · actors ${Object.keys(actors).join(",")}`);

// ── ค่าตัวกรองจากข้อมูลจริง (ตัดสินจากฐาน — เหมือนกันทั้งสองรอบเพราะฐานเดียวกัน) ──
const fields = (await prisma.memberField.findMany({
  where: { tenantId, systemId, archivedAt: null, filterable: true },
  select: { id: true, key: true, type: true, isSystem: true, objectKey: true, options: true, sensitive: true },
  orderBy: [{ objectKey: "asc" }, { key: "asc" }],
})) as Any[];
async function sampleFilter(f: Any): Promise<string | null> {
  if (f.isSystem) {
    if (f.type === "SELECT") return ((f.options?.choices ?? []) as Any[]).slice(0, 2).map((c) => c.value).join(",") || null;
    if (f.type === "BOOLEAN") return "false";
    if (f.type === "LOOKUP") return actors.staff?.userId ?? Object.values(actors)[1]?.userId ?? null;
    if (f.type === "DATE") return "2026-01-01..2027-12-31";
    if (f.type === "TEXT") return "a";
    return null;
  }
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "valueText" t, "valueNumber"::float8 n, to_char("valueDate", 'YYYY-MM-DD') d, "valueBool" b, "valueOptions" o, "valueRef" r
       FROM "CustomRecordValue" WHERE "fieldId" = $1 AND "tenantId" = $2 LIMIT 200`,
    f.id,
    tenantId,
  )) as Any[];
  if (rows.length === 0) return null;
  const r = rows[Math.floor(rows.length / 2)]!;
  switch (f.type) {
    case "NUMBER":
    case "MONEY":
      return r.n === null ? null : `${Math.floor(r.n)}..`;
    case "DATE":
    case "DATETIME":
      return r.d ? `${r.d}..` : null;
    case "BOOLEAN":
      return r.b === null ? null : String(r.b);
    case "SELECT":
    case "MULTI_SELECT":
      return (r.o ?? [])[0] ?? null;
    case "LOOKUP":
      return r.r ?? null;
    default:
      return r.t ? `=${r.t}` : null;
  }
}
const filtersOf: Record<string, { key: string; value: string; system: boolean }[]> = {};
for (const f of fields) {
  if (f.sensitive) continue;
  const v = await sampleFilter(f);
  if (v === null) continue;
  (filtersOf[f.objectKey] ??= []).push({ key: f.key, value: v, system: f.isSystem });
}
console.log(`ตัวกรองฟิลด์ที่ใช้: ${Object.entries(filtersOf).map(([o, l]) => `${o}:${l.map((x) => `${x.key}${x.system ? "(sys)" : ""}=${x.value}`).join("|")}`).join(" · ")}`);

// ── ตัวเก็บผล ──
const scenes: Record<string, Any> = {};
const checks: Record<string, Any> = {};
const norm = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Map ? Object.fromEntries(x) : x)));
async function scene(id: string, fn: () => Promise<unknown>, post: (r: Any) => unknown = (r) => r) {
  try {
    scenes[id] = { value: norm(post(await fn())) };
  } catch (e) {
    scenes[id] = { error: `${(e as Any)?.code ?? (e as Any)?.name ?? ""} ${String((e as Error)?.message ?? e).split("\n").filter(Boolean).slice(-1)[0] ?? ""}`.slice(0, 300) };
  }
}
const fObj = (list: { key: string; value: string }[]) => Object.fromEntries(list.map((x) => [x.key, x.value]));

const pipes = (await prisma.crmPipeline.findMany({ where: { tenantId, systemId, archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true } })) as Any[];
const someCompany = (await prisma.crmCompany.findFirst({ where: { tenantId, systemId, mergedIntoId: null }, orderBy: { id: "asc" }, select: { id: true } }))?.id;
const contactsForAct = (await prisma.$queryRawUnsafe(
  `SELECT x.id FROM (SELECT "contactId" id, count(*) n FROM "CrmActivity" WHERE "systemId" = $1 AND "contactId" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 2) x
   UNION ALL SELECT id FROM (SELECT c."id" FROM "CrmContact" c WHERE c."systemId" = $1 AND EXISTS (SELECT 1 FROM "CrmDeal" d WHERE d."contactId" = c."id") ORDER BY c."id" LIMIT 2) y`,
  systemId,
)) as { id: string }[];
const companiesForAct = (await prisma.$queryRawUnsafe(
  `SELECT "companyId" id FROM "CrmDeal" WHERE "systemId" = $1 AND "companyId" IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 3`,
  systemId,
)) as { id: string }[];
const objs = (await prisma.customObject.findMany({ where: { tenantId, systemId, archivedAt: null }, select: { key: true } })) as Any[];
const today = new Date();
const ymd = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const from = ymd(new Date(today.getTime() - 365 * 86_400_000));
const to = ymd(new Date(today.getTime() + 365 * 86_400_000));

const contactF = filtersOf.contact ?? [];
const companyF = filtersOf.company ?? [];
const dealF = filtersOf.deal ?? [];
const customOnly = (l: { system: boolean }[]) => l.filter((x) => !x.system) as { key: string; value: string; system: boolean }[];
const sysOnly = (l: { system: boolean }[]) => l.filter((x) => x.system) as { key: string; value: string; system: boolean }[];

const actorKeys = Object.keys(actors);
for (const k of actorKeys) {
  const c = ctxOf(k);
  const a = actors[k]!.actor;
  // ── ผู้ติดต่อ ──
  const cInputs: Record<string, Any> = {
    all: {},
    ps200: { pageSize: 200 },
    q: { q: "a" },
    lead: { stage: "LEAD" },
    sortName: { sort: "name" },
    sortAct: { sort: "-lastActivityAt" },
    ...(someCompany ? { company: { companyId: someCompany } } : {}),
    ...(contactF.length ? { fAll: { f: fObj(contactF.slice(0, 3)) }, fSys: { f: fObj(sysOnly(contactF).slice(0, 2)) } } : {}),
    ...(customOnly(contactF).length ? { fCustom1: { f: fObj(customOnly(contactF).slice(0, 1)) }, fCustom2q: { q: "a", stage: "LEAD", f: fObj(customOnly(contactF).slice(1, 3)) }, fSortAct: { sort: "-lastActivityAt", f: fObj(customOnly(contactF).slice(0, 1)) } } : {}),
  };
  for (const [name, input] of Object.entries(cInputs)) {
    await scene(`contacts.${name}.${k}`, () => C.listContacts(c, a, { pageSize: 50, ...input }));
    const first = scenes[`contacts.${name}.${k}`]?.value;
    if (first?.nextCursor) await scene(`contacts.${name}.p2.${k}`, () => C.listContacts(c, a, { pageSize: 50, ...input, cursor: first.nextCursor }));
    if (input.f) await scene(`contacts.probe.${name}.${k}`, () => C.probeContactFilters(c, a, input).then(() => "ok"));
  }
  // ── บริษัท ──
  const coInputs: Record<string, Any> = {
    all: {},
    p2: { page: 2 },
    q: { q: "a" },
    sortDeals: { sort: "-openDealCount" },
    ...(companyF.length ? { fAll: { f: fObj(companyF.slice(0, 3)) } } : {}),
    ...(customOnly(companyF).length ? { fCustom: { f: fObj(customOnly(companyF).slice(0, 2)), page: 2 } } : {}),
  };
  for (const [name, input] of Object.entries(coInputs)) await scene(`companies.${name}.${k}`, () => CO.listCompanies(c, a, { pageSize: 50, ...input }));
  // ── ดีล ──
  const dInputs: Record<string, Any> = {
    all: {},
    open: { kind: "OPEN" },
    stale: { stale: true },
    close: { closeFrom: from, closeTo: to },
    sortClose: { sort: "expectedCloseAt" },
    q: { q: "a" },
    ...(dealF.length ? { fAll: { f: fObj(dealF.slice(0, 3)) }, fSortClose: { sort: "expectedCloseAt", f: fObj(dealF.slice(0, 1)) } } : {}),
  };
  for (const [name, input] of Object.entries(dInputs)) {
    await scene(`deals.${name}.${k}`, () => D.listDeals(c, a, { pageSize: 50, ...input }));
    const first = scenes[`deals.${name}.${k}`]?.value;
    if (first?.nextCursor) await scene(`deals.${name}.p2.${k}`, () => D.listDeals(c, a, { pageSize: 50, ...input, cursor: first.nextCursor }));
  }
  for (const p of pipes) {
    await scene(`board.${p.id}.${k}`, () => D.getBoard(c, a, { pipelineId: p.id }));
    await scene(`board.${p.id}.filtered.${k}`, () => D.getBoard(c, a, { pipelineId: p.id, closeFrom: from, closeTo: to, stale: true }));
    if (dealF.length) await scene(`board.${p.id}.f.${k}`, () => D.getBoard(c, a, { pipelineId: p.id, f: fObj(dealF.slice(0, 2)) }));
  }
  for (const g of ["month", "owner", "team"]) await scene(`dealsForecast.${g}.${k}`, () => D.forecast(c, a, { groupBy: g, from, to }));
  await scene(`dealsForecast.cat.${k}`, () => D.forecast(c, a, { groupBy: "month", category: "COMMIT", pipelineId: pipes[0]?.id }));
  // ── รายงาน ──
  for (const tab of ["overview", "forecast", "funnel", "reps", "activities", "lost", "sources", "scores"]) {
    await scene(`report.${tab}.${k}`, () => R.getReport(c, a, tab, { from, to }));
    if (pipes[0]) await scene(`report.${tab}.pipe.${k}`, () => R.getReport(c, a, tab, { from, to, pipelineId: pipes[0].id }));
  }
  // ── อีเมล ──
  await scene(`threads.all.${k}`, () => EM.listThreads(c, a, { pageSize: 100 }));
  await scene(`threads.q.${k}`, () => EM.listThreads(c, a, { q: "a", pageSize: 100 }));
  if (k === "owner") await scene(`threads.unmatched.${k}`, () => EM.listThreads(c, a, { unmatched: true, pageSize: 100 }));
  // ── 360 (กิจกรรม: เรียงใหม่ในกลุ่มเวลาเท่ากันก่อนเทียบ — ลำดับของเวลาที่ชนกันเดิมไม่กำหนด) ──
  const actsNorm = (list: Any[]) => norm([...list]).sort((x: Any, y: Any) => String(y.at).localeCompare(String(x.at)) || String(x.id).localeCompare(String(y.id)));
  for (const ct of contactsForAct) {
    await scene(`c360.${ct.id}.${k}`, () => C.getContact360(c, a, ct.id), (r: Any) => ({ timeline: actsNorm(r.timeline ?? []), deals: r.deals }));
  }
  for (const co of companiesForAct) {
    await scene(`co360.${co.id}.${k}`, () => CO.getCompany360(c, a, co.id), (r: Any) => ({ timeline: actsNorm(r.timeline ?? []), deals: r.deals, contacts: r.contacts }));
  }
  // ── วัตถุกำหนดเอง ──
  for (const o of objs) {
    await scene(`records.${o.key}.${k}`, () => OB.records.list(c, a, o.key, { pageSize: 50 }));
    const of = filtersOf[o.key] ?? [];
    if (of.length) {
      await scene(`records.${o.key}.f.${k}`, () => OB.records.list(c, a, o.key, { pageSize: 50, f: fObj(of.slice(0, 2)) }));
      await scene(`records.${o.key}.f1p2.${k}`, () => OB.records.list(c, a, o.key, { pageSize: 50, page: 2, f: fObj(of.slice(0, 1)) }));
    }
  }
}

// ═══════════════════ รอบใหม่เท่านั้น: visibleSql ↔ visibleWhere + ผลอ้างอิงอิสระของฉากที่โค้ดเก่าล้ม ═══════════════════
if (NEW) {
  const tbl: Record<string, string> = { CONTACT: "CrmContact", COMPANY: "CrmCompany", DEAL: "CrmDeal" };
  const model: Record<string, string> = { CONTACT: "crmContact", COMPANY: "crmCompany", DEAL: "crmDeal" };
  for (const k of actorKeys) {
    for (const E of ["CONTACT", "COMPANY", "DEAL"]) {
      const c = ctxOf(k);
      const a = actors[k]!.actor;
      const w = await V.visibleWhere(c, a, E);
      const oldIds = ((await prisma[model[E]!].findMany({ where: w, select: { id: true } })) as { id: string }[]).map((r) => r.id).sort();
      const sql = await V.visibleSql(c, a, E, "x");
      const { Prisma } = (await import("@prisma/client")) as Any;
      const newIds = ((await prisma.$queryRaw`SELECT x."id" FROM ${Prisma.raw(`"${tbl[E]}"`)} x WHERE ${sql}`) as { id: string }[]).map((r) => r.id).sort();
      const ok = oldIds.length === newIds.length && oldIds.every((v, i) => v === newIds[i]);
      checks[`visibleSql.${E}.${k}`] = { ok, prisma: oldIds.length, sql: newIds.length };
    }
  }
  // ผลอ้างอิงของรายการที่มีตัวกรองฟิลด์ (ตรวจเฉพาะฉากที่ต้องใช้ — ผู้เทียบดูเมื่อรอบเก่าล้ม P2029)
  // ผู้ติดต่อ: id ที่ตรงตัวกรองทั้งหมด (SQL อิสระ — ตัวกรองฟิลด์เป็น EXISTS ที่เขียนเองต่อชนิด) ∩ ชุดที่ visibleWhere เดิมให้เห็น → หน้าแรก 50
  const valueCond = (f: Any, v: string): { sql: string; args: unknown[] } => {
    if (f.type === "SELECT" || f.type === "MULTI_SELECT") return { sql: `v."valueOptions" && $X::text[]`, args: [v.split(",")] };
    if (f.type === "BOOLEAN") return { sql: `v."valueBool" = $X::boolean`, args: [v === "true"] };
    if (f.type === "NUMBER" || f.type === "MONEY") return { sql: `v."valueNumber" >= $X::numeric`, args: [v.replace("..", "")] };
    if (f.type === "DATE" || f.type === "DATETIME") return { sql: `v."valueDate" >= ($X::date)::timestamp - interval '7 hours'`, args: [v.replace("..", "")] };
    if (f.type === "LOOKUP") return { sql: `v."valueRef" = $X`, args: [v] };
    return { sql: `v."valueText" = $X`, args: [v.replace(/^=/, "")] };
  };
  // ตัวกรองฟิลด์กำหนดเอง → EXISTS ที่สคริปต์เขียนเอง (ฟิลด์ระบบ enum ⇒ ไม่มีผลอ้างอิง — ฉากนั้นเทียบกับโค้ดเก่าตรง ๆ)
  const existsConds = (objectKey: string, alias: string, f: Record<string, string>, args: unknown[]): string[] | null => {
    const byKey = new Map(fields.filter((x) => x.objectKey === objectKey).map((x) => [x.key, x]));
    const out: string[] = [];
    for (const [key, v] of Object.entries(f)) {
      const fd = byKey.get(key);
      if (!fd || fd.isSystem) return null;
      const vc = valueCond(fd, v);
      args.push(fd.id);
      const fid = args.length;
      args.push(...vc.args);
      out.push(`EXISTS (SELECT 1 FROM "CustomRecordValue" v WHERE v."recordId" = ${alias}."id" AND v."fieldId" = $${fid} AND ${vc.sql.replace("$X", `$${args.length}`)})`);
    }
    return out;
  };
  /** ผู้ติดต่อ: SQL อิสระ (ตัวกรอง + ลำดับของหน้า) ∩ ชุดที่ visibleWhere เดิมให้เห็น — คืนทั้งลำดับ */
  async function refContacts(k: string, input: Any): Promise<string[] | null> {
    const args: unknown[] = [systemId, tenantId];
    const conds: string[] = [`c."systemId" = $1`, `c."tenantId" = $2`, `c."mergedIntoId" IS NULL`, `c."archivedAt" IS NULL`];
    if (input.stage) {
      args.push(input.stage);
      conds.push(`c."lifecycleStage"::text = $${args.length}`);
    }
    if (input.q) {
      args.push(input.q);
      const n = args.length;
      conds.push(`(c."name" ILIKE '%' || $${n} || '%' OR c."firstName" ILIKE '%' || $${n} || '%' OR c."lastName" ILIKE '%' || $${n} || '%' OR c."email" ILIKE '%' || lower($${n}) || '%')`);
    }
    const ex = existsConds("contact", "c", input.f ?? {}, args);
    if (!ex) return null;
    conds.push(...ex);
    const order = input.sort === "-lastActivityAt" ? `c."lastActivityAt" DESC NULLS LAST, c."id" DESC` : `c."createdAt" DESC, c."id" DESC`;
    const all = ((await prisma.$queryRawUnsafe(`SELECT c."id" FROM "CrmContact" c WHERE ${conds.join(" AND ")} ORDER BY ${order}`, ...args)) as { id: string }[]).map((r) => r.id);
    const vis = new Set(((await prisma.crmContact.findMany({ where: await V.visibleWhere(ctxOf(k), actors[k]!.actor, "CONTACT"), select: { id: true } })) as { id: string }[]).map((r) => r.id));
    return all.filter((id) => vis.has(id));
  }
  const contactInputs: Record<string, Any> = {
    fAll: { f: fObj(contactF.slice(0, 3)) },
    fCustom1: { f: fObj(customOnly(contactF).slice(0, 1)) },
    fCustom2q: { q: "a", stage: "LEAD", f: fObj(customOnly(contactF).slice(1, 3)) },
    fSortAct: { sort: "-lastActivityAt", f: fObj(customOnly(contactF).slice(0, 1)) },
  };
  for (const k of actorKeys) {
    for (const [name, input] of Object.entries(contactInputs)) {
      const p1 = scenes[`contacts.${name}.${k}`];
      const ref = await refContacts(k, input);
      if (!ref || !p1) continue;
      const cmp = (key: string, from: number) => {
        const got = scenes[key]?.value;
        if (!got) return;
        const ids = (got.items as Any[]).map((x) => x.id);
        const want = ref.slice(from, from + 50);
        checks[`ref:${key}`] = { ok: JSON.stringify(ids) === JSON.stringify(want) && !!got.nextCursor === ref.length > from + 50, n: ids.length, refN: want.length };
      };
      cmp(`contacts.${name}.${k}`, 0);
      cmp(`contacts.${name}.p2.${k}`, 50);
      // ตรวจตัวกรองแบบไม่โหลดแถว: ใช้ได้ = ไม่ error (ตัวกรองชุดเดียวกับรายการที่ผ่านผลอ้างอิงแล้ว)
      const probe = scenes[`contacts.probe.${name}.${k}`];
      if (probe) checks[`ref:contacts.probe.${name}.${k}`] = { ok: probe.value === "ok" && checks[`ref:contacts.${name}.${k}`]?.ok === true };
    }
  }
  // บริษัท (ตัวกรองกำหนดเอง · หน้า 2 · total): ∩ visibleWhere(COMPANY) เดิม · ลำดับ name asc, id asc
  for (const k of actorKeys) {
    const key = `companies.fCustom.${k}`;
    const got = scenes[key]?.value;
    if (!got) continue;
    const args: unknown[] = [systemId, tenantId];
    const ex = existsConds("company", "co", fObj(customOnly(companyF).slice(0, 2)), args);
    if (!ex) continue;
    const all = ((await prisma.$queryRawUnsafe(
      `SELECT co."id" FROM "CrmCompany" co WHERE co."systemId" = $1 AND co."tenantId" = $2 AND co."mergedIntoId" IS NULL AND co."archivedAt" IS NULL AND ${ex.join(" AND ")} ORDER BY co."name" ASC, co."id" ASC`,
      ...args,
    )) as { id: string }[]).map((r) => r.id);
    const vis = new Set(((await prisma.crmCompany.findMany({ where: await V.visibleWhere(ctxOf(k), actors[k]!.actor, "COMPANY"), select: { id: true } })) as { id: string }[]).map((r) => r.id));
    const seen = all.filter((id) => vis.has(id));
    const ids = (got.items as Any[]).map((x) => x.id);
    checks[`ref:${key}`] = { ok: JSON.stringify(ids) === JSON.stringify(seen.slice(50, 100)) && got.total === seen.length, n: ids.length, total: got.total, refTotal: seen.length };
  }
  // วัตถุ: SQL อิสระของตัวกรอง ∩ การมองเห็นของรายการ (recordVisibilitySql — กติกาเดิมของ C1.7 ไม่ได้แก้ในใบนี้) · หน้า 1/2 + total
  for (const o of objs) {
    const of = filtersOf[o.key] ?? [];
    if (!of.length) continue;
    const obj = await prisma.customObject.findFirst({ where: { tenantId, systemId, key: o.key }, select: { id: true, unitScoped: true } });
    for (const k of actorKeys) {
      for (const [sfx, n, from] of [["f", 2, 0], ["f1p2", 1, 50]] as const) {
        const key = `records.${o.key}.${sfx}.${k}`;
        const got = scenes[key]?.value;
        if (!got) continue;
        const args: unknown[] = [obj.id];
        const ex = existsConds(o.key, "r", fObj(of.slice(0, n)), args);
        if (!ex) continue;
        const vis = await V.recordVisibilitySql(ctxOf(k), actors[k]!.actor);
        const { Prisma } = (await import("@prisma/client")) as Any;
        const base = ((await prisma.$queryRawUnsafe(`SELECT r."id" FROM "CustomRecord" r WHERE r."objectId" = $1 AND r."archivedAt" IS NULL AND ${ex.join(" AND ")} ORDER BY r."createdAt" DESC, r."id" DESC`, ...args)) as { id: string }[]).map((r) => r.id);
        let seen = base;
        if (vis) {
          const ok = new Set(((await prisma.$queryRaw`SELECT r."id" FROM "CustomRecord" r WHERE r."objectId" = ${obj.id} AND ${vis}`) as { id: string }[]).map((r) => r.id));
          seen = base.filter((id) => ok.has(id));
        }
        void Prisma;
        const a = actors[k]!.actor;
        const whole = a.role === "OWNER" || a.unitAccess.length === 0 || a.unitAccess.includes("*");
        if (obj.unitScoped && !whole) continue; // ขอบเขตสาขาของวัตถุ — ไม่มีวัตถุ unitScoped ในร้าน perf
        const ids = (got.items as Any[]).map((x) => x.id);
        checks[`ref:${key}`] = { ok: JSON.stringify(ids) === JSON.stringify(seen.slice(from, from + 50)) && got.total === seen.length, n: ids.length, total: got.total, refTotal: seen.length };
      }
    }
  }
  // อีเมล: เธรดที่เห็น (ไม่มีเพดาน 20,000) — ผู้ติดต่อ/บริษัทที่ visibleWhere เดิมให้เห็น ในหน่วยความจำ
  for (const [tk, key] of actorKeys.flatMap((k) => [[k, `threads.all.${k}`], [k, `threads.q.${k}`]] as [string, string][])) {
    const k = tk;
    const got = scenes[key]?.value;
    if (!got) continue;
    const c = ctxOf(k);
    const a = actors[k]!.actor;
    const cs = new Set(((await prisma.crmContact.findMany({ where: await V.visibleWhere(c, a, "CONTACT"), select: { id: true } })) as { id: string }[]).map((r) => r.id));
    const cos = new Set(((await prisma.crmCompany.findMany({ where: await V.visibleWhere(c, a, "COMPANY"), select: { id: true } })) as { id: string }[]).map((r) => r.id));
    const msgs = (await prisma.crmEmailMessage.findMany({
      where: { tenantId, systemId },
      select: { id: true, threadKey: true, subject: true, contactId: true, companyId: true, createdAt: true, sentAt: true, receivedAt: true },
    })) as Any[];
    const vis = msgs
      .filter((m) => (m.contactId ? cs.has(m.contactId) : m.companyId ? cos.has(m.companyId) : false))
      .filter((m) => !key.startsWith("threads.q.") || /a/i.test(String(m.subject ?? "")))
      .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime() || (y.id < x.id ? -1 : y.id > x.id ? 1 : 0))
      .slice(0, 2000);
    const thr = new Map<string, { n: number; at: number }>();
    for (const m of vis) {
      const at = (m.sentAt ?? m.receivedAt ?? m.createdAt).getTime();
      const cur = thr.get(m.threadKey);
      if (!cur) thr.set(m.threadKey, { n: 1, at });
      else {
        cur.n += 1;
        cur.at = Math.max(cur.at, at);
      }
    }
    const ordered = [...thr.entries()].sort((x, y) => y[1].at - x[1].at);
    const want = ordered.slice(0, 100).map(([t, v]) => `${t}#${v.n}`);
    const have = (got.items as Any[]).map((x) => `${x.threadKey}#${x.count}`);
    checks[`ref:${key}`] = { ok: JSON.stringify(want) === JSON.stringify(have) && got.total === ordered.length, total: got.total, refTotal: ordered.length };
  }
}

writeFileSync(OUT, JSON.stringify({ tenant: TENANT, code: NEW ? "NEW" : "OLD", at: new Date().toISOString(), scenes, checks }, null, 1));
const errs = Object.entries(scenes).filter(([, v]) => v.error);
console.log(`scenes ${Object.keys(scenes).length} · errors ${errs.length}${errs.length ? ` (${errs.slice(0, 5).map(([k, v]) => `${k}: ${v.error}`).join(" | ")})` : ""} · checks ${Object.keys(checks).length} fail ${Object.values(checks).filter((x: Any) => !x.ok).length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ tenant: TENANT, code: NEW ? "NEW" : "OLD", scenes: Object.keys(scenes).length, errors: errs.length, checks: Object.keys(checks).length, checkFail: Object.values(checks).filter((x: Any) => !x.ok).length })}`);
await prisma.$disconnect();
