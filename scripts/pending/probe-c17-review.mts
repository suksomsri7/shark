// probe-c17-review.mts — หลักฐานของการแก้ตามรีวิว C1.7 (B1 + ข้อ 1, 2, 4, 5, 6, 7, 8) · ทุกข้อมีกรณีบวก/ลบ
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c17-review.mts
// ฐาน QC เท่านั้น (.env.qc) · ร้านทิ้ง `qc-c17rv-<rand>` กวาดทิ้งใน finally · ไม่แตะข้อมูลที่ seed ไว้ · บรรทัดสุดท้าย JSON_SUMMARY
// นับคิวรีด้วย PrismaClient ของตัวเอง (log event "query") ที่ตั้งเป็น globalThis.prisma ก่อนโหลด @/lib/core/db
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const { PrismaClient } = (await import("@prisma/client")) as Any;
const { PrismaPg } = (await import("@prisma/adapter-pg" as string)) as Any;
let QN = 0;
let MAXP = 0;
const pc = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }), log: [{ emit: "event", level: "query" }], transactionOptions: { timeout: 60_000, maxWait: 20_000 } });
pc.$on("query", (e: Any) => {
  QN += 1;
  try {
    const n = (JSON.parse(String(e.params ?? "[]")) as unknown[]).length;
    if (n > MAXP) MAXP = n;
  } catch {
    /* params ที่อ่านไม่ออก — ไม่นับ */
  }
});
(globalThis as Any).prisma = pc;

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const V = (await import("@/lib/modules/crm/visibility" as string)) as Any;
const D = (await import("@/lib/modules/crm/deals" as string)) as Any;
const A = (await import("@/lib/modules/crm/activities" as string)) as Any;
const OB = (await import("@/lib/modules/crm/objects" as string)) as Any;
const PL = (await import("@/lib/modules/crm/pipelines" as string)) as Any;
const KL = (await import("@/lib/modules/kanban/links" as string)) as Any;
const KR = (await import("@/lib/modules/kanban/link-resolvers" as string)) as Any;
const ST = (await import("@/lib/staff/service" as string)) as Any;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c17rv-${rand}`;
const out: { id: string; ok: boolean; detail: string }[] = [];
const chk = (id: string, ok: unknown, detail: string) => {
  out.push({ id, ok: !!ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${detail}`);
};
const call = async (fn: Any, ...args: Any[]) => {
  try {
    return { ok: true, v: await fn(...args), code: "", msg: "" };
  } catch (e) {
    return { ok: false, v: undefined as Any, code: String((e as Any)?.code ?? ""), msg: e instanceof Error ? e.message : String(e) };
  }
};
const ids = (r: Any): Set<string> => new Set(((Array.isArray(r) ? r : r?.items ?? []) as Any[]).map((x) => String(x?.id ?? "")));
const measure = async <T,>(f: () => Promise<T>): Promise<{ v: T; q: number; p: number }> => {
  const q0 = QN;
  MAXP = 0;
  const v = await f();
  return { v, q: QN - q0, p: MAXP };
};

let T = "";
const USERS: string[] = [];
console.log(`\n═══ probe C1.7 review — DB ${host} · ${TAG} ═══`);
try {
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const unitP = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `ภูเก็ต ${rand}`, slug: `${TAG}-p` } })).id;
  const unitK = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `กระบี่ ${rand}`, slug: `${TAG}-k` } })).id;
  const mkMember = async (k: string, role: string, unitAccess: string[], permissions: Record<string, unknown>) => {
    const u = await P.user.create({ data: { email: `${TAG}-${k}@qc.invalid`, name: `QC ${k} ${rand}` } });
    USERS.push(u.id);
    const m = await P.membership.create({ data: { userId: u.id, tenantId: T, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { userId: u.id as string, role, unitAccess, permissions, membershipId: m.id as string };
  };
  const owner = await mkMember("owner", "OWNER", [], {});
  const thana = await mkMember("thana", "STAFF", ["*"], { "crm.*": true, "kanban.*": true });
  const outsider = await mkMember("outsider", "STAFF", ["*"], { "crm.*": true, "kanban.*": true });
  const kai = await mkMember("kai", "STAFF", ["*"], { "crm.*": true });
  const two = await mkMember("two", "STAFF", ["*"], { "crm.*": true });
  const mgrP = await mkMember("mgrp", "MANAGER", [unitP], {});
  const mgrAll = await mkMember("mgrall", "MANAGER", [], {});
  const target8 = await mkMember("target8", "STAFF", ["*"], {});
  const S = (await sysSvc.createSystem(T, "CRM", `CRM v2 ${TAG}`)).id as string;
  const S1 = (await sysSvc.createSystem(T, "CRM", `CRM v1 ${TAG}`)).id as string;
  const KAN = (await sysSvc.createSystem(T, "KANBAN", `บอร์ด ${TAG}`)).id as string;
  await P.appSystem.update({ where: { id: S }, data: { settings: { crm: { uiVersion: 2 } } } });
  const teamP = (await P.team.create({ data: { tenantId: T, name: `ทีมภูเก็ต ${rand}`, unitIds: [unitP] } })).id as string;
  const teamK = (await P.team.create({ data: { tenantId: T, name: `ทีมกระบี่ ${rand}`, unitIds: [unitK] } })).id as string;
  const teamQ = (await P.team.create({ data: { tenantId: T, name: `ทีมเสริม ${rand}` } })).id as string;
  await P.teamMember.create({ data: { tenantId: T, teamId: teamP, userId: thana.userId } });
  await P.teamMember.create({ data: { tenantId: T, teamId: teamK, userId: kai.userId } });
  await P.teamMember.create({ data: { tenantId: T, teamId: teamP, userId: two.userId } });
  await P.teamMember.create({ data: { tenantId: T, teamId: teamQ, userId: two.userId } });
  const cx = (w: Any, sys = S) => ({ tenantId: T, systemId: sys, actorUserId: w.userId });

  const pipe = (await P.crmPipeline.create({
    data: { tenantId: T, systemId: S, name: `ขาย ${TAG}`, stages: { create: [{ tenantId: T, systemId: S, name: "ใหม่", kind: "OPEN", probability: 10, sortOrder: 0 }] } },
    include: { stages: true },
  })) as Any;
  const stage0 = pipe.stages[0].id as string;
  const contact = async (sys: string, name: string, extra: Record<string, Any> = {}) => (await P.crmContact.create({ data: { tenantId: T, systemId: sys, name, ...extra } })).id as string;
  const company = async (name: string, teamId: string | null) => {
    const partyId = (await P.party.create({ data: { tenantId: T, name, kind: "COMPANY" } })).id as string;
    return (await P.crmCompany.create({ data: { tenantId: T, systemId: S, name, teamId, partyId } })).id as string;
  };
  const deal = async (title: string, contactId: string, ownerUserId: string | null, teamId: string | null) =>
    (await P.crmDeal.create({ data: { tenantId: T, systemId: S, pipelineId: pipe.id, stageId: stage0, contactId, title, kind: "OPEN", ownerUserId, teamId } })).id as string;

  // ── B1: ระบบ v1 + STAFF ไม่มีทีม + ชิป CRM_CONTACT ของผู้ติดต่อที่ไม่มีเจ้าของ ⇒ ยังเห็นชื่อ · ระบบ v2 เดียวกัน ⇒ ซ่อน ──
  console.log("── B1 · uiVersion 1 ──");
  const kv1 = await contact(S1, `ลูกค้าระบบเดิม ${rand}`);
  const kv2 = await contact(S, `ลูกค้าระบบใหม่ ${rand}`);
  const board = await P.kanbanBoard.create({ data: { tenantId: T, systemId: KAN, name: `บอร์ด ${TAG}`, createdById: owner.userId } });
  for (const [i, n] of ["รอทำ", "เสร็จ"].entries()) await P.kanbanColumn.create({ data: { tenantId: T, systemId: KAN, boardId: board.id, name: n, sortOrder: i, position: `a${i}` } });
  await P.kanbanBoardMember.create({ data: { tenantId: T, boardId: board.id, userId: outsider.userId, role: "EDITOR" } });
  const card = await call(KL.createCardFromExternal, { tenantId: T, systemId: KAN, actorUserId: owner.userId }, {
    boardId: board.id, title: `การ์ด ${rand}`, sourceType: "MANUAL", sourceKey: `${TAG}:b1`,
    links: [{ linkType: "CRM_CONTACT", linkId: kv1, role: "RELATED" }, { linkType: "CRM_CONTACT", linkId: kv2, role: "RELATED" }],
  });
  const cardId = String(card.v?.cardId ?? card.v?.id ?? "");
  const kActor = { userId: outsider.userId, role: "STAFF", unitAccess: ["*"], permissions: outsider.permissions };
  const links = await call(KR.listCardLinks, { tenantId: T, systemId: KAN, actorUserId: outsider.userId }, kActor, cardId);
  const l1 = ((links.v ?? []) as Any[]).find((x) => x.linkId === kv1);
  const l2 = ((links.v ?? []) as Any[]).find((x) => x.linkId === kv2);
  chk("B1.pos", links.ok && l1?.canView === true && String(l1?.title) === `ลูกค้าระบบเดิม ${rand}` && !!l1?.href, `v1 chip (owner null, viewer in no team) canView=${l1?.canView} title=${l1?.title} ${links.msg}`);
  chk("B1.neg", links.ok && l2?.canView === false && l2?.href == null && !String(l2?.title).includes("ระบบใหม่"), `v2 chip hidden canView=${l2?.canView}`);
  const w1 = await call(V.visibleWhere, cx(outsider, S1), outsider, "CONTACT");
  const n1 = w1.ok ? await P.crmContact.count({ where: { AND: [w1.v, { id: kv1 }] } }) : -1;
  chk("B1.where", n1 === 1, `visibleWhere on v1 system = pre-C1.7 scope (sees ownerless contact) n=${n1}`);

  // ── ข้อ 1: visibleIdsAmong = คิวรีคงที่ ไม่ขึ้นกับจำนวน id ──
  console.log("── 1 · visibleIdsAmong ──");
  const mine: string[] = [];
  const foreign: string[] = [];
  for (let i = 0; i < 30; i += 1) mine.push(await contact(S, `ทีมพี ${i} ${rand}`, { teamId: teamP }));
  for (let i = 0; i < 30; i += 1) foreign.push(await contact(S, `ทีมเค ${i} ${rand}`, { teamId: teamK }));
  const small = await measure(() => V.visibleIdsAmong(T, thana, "CONTACT", [...mine.slice(0, 2), ...foreign.slice(0, 2)]));
  const big = await measure(() => V.visibleIdsAmong(T, thana, "CONTACT", [...mine, ...foreign]));
  const bigSet = big.v as Set<string>;
  chk("1.pos", mine.every((x) => bigSet.has(x)) && small.q === big.q && big.q <= 10, `visible 30/30 · queries 4 ids=${small.q} · 60 ids=${big.q} (same, ≤ 10)`);
  chk("1.neg", foreign.every((x) => !bigSet.has(x)), `foreign-team ids excluded: ${foreign.filter((x) => bigSet.has(x)).length} leaked`);

  // ── ข้อ 2: 40,000 ผู้ติดต่อที่เห็น · รายการ + GET รายการวัตถุ = คิวรีจำนวนจำกัด · ไม่มีพารามิเตอร์ยาว ──
  console.log("── 2 · 40,000 visible parents ──");
  await P.$executeRawUnsafe(
    `INSERT INTO "CrmContact" ("id","tenantId","systemId","name","teamId","updatedAt") SELECT '${TAG}-c-' || g, '${T}', '${S}', 'ผู้ติดต่อ ' || g, '${teamP}', now() FROM generate_series(1, 40000) g`,
  );
  const obj = await P.customObject.create({ data: { tenantId: T, systemId: S, key: `car${rand}`, label: "รถ", labelPlural: "รถ", parentType: "CONTACT", titleFieldKey: "plate" } });
  await P.$executeRawUnsafe(
    `INSERT INTO "CustomRecord" ("id","tenantId","systemId","objectId","parentType","parentId","title","updatedAt") SELECT '${TAG}-r-' || g, '${T}', '${S}', '${obj.id}', 'CONTACT', '${TAG}-c-' || g, 'ทะเบียน ' || g, now() FROM generate_series(1, 300) g`,
  );
  const recK = (await P.customRecord.create({ data: { tenantId: T, systemId: S, objectId: obj.id, parentType: "CONTACT", parentId: foreign[0], title: `ทะเบียนกระบี่ ${rand}` } })).id as string;
  const lst = await measure(() => call(OB.records.list, cx(thana), thana, obj.key, { pageSize: 50 }));
  const get = await measure(() => call(OB.records.get, cx(thana), thana, obj.key, `${TAG}-r-7`));
  chk("2.pos", lst.v.ok && lst.v.v.total === 300 && lst.v.v.items.length === 50 && get.v.ok && lst.q <= 25 && get.q <= 25 && lst.p < 1000 && get.p < 1000,
    `list total=${lst.v.v?.total} (queries ${lst.q}, max params ${lst.p}) · get ok=${get.v.ok} (queries ${get.q}, max params ${get.p}) ${lst.v.msg}${get.v.msg}`);
  const lo = await call(OB.records.list, cx(outsider), outsider, obj.key, { pageSize: 50 });
  const go = await call(OB.records.get, cx(thana), thana, obj.key, recK);
  chk("2.neg", lo.ok && lo.v.total === 0 && !go.ok && go.code === "NOT_FOUND", `outsider list total=${lo.v?.total} · thana GET krabi record ⇒ ${go.code}`);

  // ── ข้อ 4 + 5: MANAGER ถูกจำกัดสาขา — กิจกรรมที่มีแต่บริษัท/รายการ กรองตามแม่ · unitAccess [] = ทั้งร้าน ──
  console.log("── 4 · 5 · unit scope ──");
  const coP = await company(`บริษัทพี ${rand}`, teamP);
  const coK = await company(`บริษัทเค ${rand}`, teamK);
  const recP = `${TAG}-r-1`;
  const act = async (title: string, data: Record<string, Any>) => (await P.crmActivity.create({ data: { tenantId: T, systemId: S, type: "CALL", title, ownerUserId: owner.userId, ...data } })).id as string;
  const aCoP = await act(`โทรบริษัทพี ${rand}`, { companyId: coP });
  const aCoK = await act(`โทรบริษัทเค ${rand}`, { companyId: coK });
  const aRecP = await act(`งานรายการพี ${rand}`, { customRecordId: recP });
  const aRecK = await act(`งานรายการเค ${rand}`, { customRecordId: recK });
  const la = await call(A.listActivities, cx(mgrP), mgrP, { pageSize: 200 });
  const s4 = ids(la.v);
  chk("4.pos", la.ok && s4.has(aCoP) && s4.has(aRecP), `unit-P manager sees company-only/record-only activities of team P: ${s4.has(aCoP)}/${s4.has(aRecP)} ${la.msg}`);
  chk("4.neg", la.ok && !s4.has(aCoK) && !s4.has(aRecK), `…and not those of team K: ${s4.has(aCoK)}/${s4.has(aRecK)}`);
  const dK = await deal(`ดีลกระบี่ ${rand}`, foreign[1], kai.userId, teamK);
  const dAll = await call(D.listDeals, cx(mgrAll), mgrAll, { pageSize: 200 });
  const dP = await call(D.listDeals, cx(mgrP), mgrP, { pageSize: 200 });
  chk("5.pos", dAll.ok && ids(dAll.v).has(dK), `MANAGER unitAccess [] (= whole shop) sees krabi deal: ${ids(dAll.v).has(dK)} ${dAll.msg}`);
  chk("5.neg", dP.ok && !ids(dP.v).has(dK), `MANAGER unitAccess [unitP] does not: ${ids(dP.v).has(dK)}`);

  // ── ข้อ 6: listPipelines นับดีลที่เปิดเฉพาะที่ผู้ดูเห็น ──
  console.log("── 6 · listPipelines ──");
  const dP1 = await deal(`ดีลภูเก็ต ${rand}`, mine[0], thana.userId, teamP);
  const plT = await call(PL.listPipelines, cx(thana), thana);
  const plO = await call(PL.listPipelines, cx(owner), owner);
  const cntT = ((plT.v ?? []) as Any[]).find((p) => p.id === pipe.id)?.openDeals;
  const cntO = ((plO.v ?? []) as Any[]).find((p) => p.id === pipe.id)?.openDeals;
  chk("6.pos", plO.ok && cntO === 2, `owner openDeals=${cntO} (2)`);
  chk("6.neg", plT.ok && cntT === 1, `thana openDeals=${cntT} (1 — krabi deal not counted)`);
  void dP1;

  // ── ข้อ 7: โอนข้ามทีมไม่ระบุทีม ⇒ ทีมของผู้ดูแลใหม่ (ทีมเดียว) · หลายทีม ⇒ VALIDATION พร้อมรายชื่อทีม · bulk ส่ง teamId ได้ ──
  console.log("── 7 · reassign team ──");
  const d7a = await deal(`ดีลโอนหนึ่ง ${rand}`, foreign[2], kai.userId, teamK);
  const d7b = await deal(`ดีลโอนสอง ${rand}`, foreign[3], kai.userId, teamK);
  const d7c = await deal(`ดีลโอนสาม ${rand}`, foreign[4], kai.userId, teamK);
  const r1 = await call(D.reassignDeal, cx(owner), owner, d7a, { ownerUserId: thana.userId });
  const row1 = await P.crmDeal.findFirst({ where: { id: d7a } });
  chk("7.pos", r1.ok && row1?.ownerUserId === thana.userId && row1?.teamId === teamP, `no teamId + new owner in one team ⇒ teamId = that team (${row1?.teamId === teamP}) ${r1.msg}`);
  const r2 = await call(D.reassignDeal, cx(owner), owner, d7b, { ownerUserId: two.userId });
  const row2 = await P.crmDeal.findFirst({ where: { id: d7b } });
  chk("7.neg", !r2.ok && r2.code === "VALIDATION" && r2.msg.includes(`ทีมภูเก็ต ${rand}`) && r2.msg.includes(`ทีมเสริม ${rand}`) && row2?.ownerUserId === kai.userId && row2?.teamId === teamK,
    `owner in two teams ⇒ ${r2.code} listing both teams · deal unchanged (${row2?.teamId === teamK}) msg=${r2.msg.slice(0, 120)}`);
  const r3 = await call(D.bulkReassign, cx(owner), owner, { ids: [d7c], ownerUserId: two.userId, teamId: teamQ, confirm: true, reason: "ย้ายทีมตามลูกค้า" });
  const row3 = await P.crmDeal.findFirst({ where: { id: d7c } });
  chk("7.bulk", r3.ok && r3.v.ok === 1 && row3?.teamId === teamQ && row3?.ownerUserId === two.userId, `bulkReassign with the chosen team ⇒ teamId=${row3?.teamId === teamQ}`);

  // ── ข้อ 8: MANAGER แจกคีย์ตั้งค่า CRM 5 ตัว / crm.* ไม่ได้ · OWNER ได้ ──
  console.log("── 8 · grant ──");
  const g1 = await ST.updateStaffAccess({ tenantId: T, actorUserId: mgrAll.userId, membershipId: target8.membershipId, permissions: { "crm.visibility.manage": true } });
  const g2 = await ST.updateStaffAccess({ tenantId: T, actorUserId: mgrAll.userId, membershipId: target8.membershipId, permissions: { "crm.*": true } });
  const g3 = await ST.updateStaffAccess({ tenantId: T, actorUserId: mgrAll.userId, membershipId: target8.membershipId, permissions: { "crm.deal.read": true } });
  const g4 = await ST.updateStaffAccess({ tenantId: T, actorUserId: owner.userId, membershipId: target8.membershipId, permissions: { "crm.deal.read": true, "crm.visibility.manage": true } });
  const perm = ((await P.membership.findFirst({ where: { id: target8.membershipId } }))?.permissions ?? {}) as Any;
  chk("8.neg", !g1.ok && !g2.ok && /เจ้าของร้าน/.test(String(g1.reason)), `MANAGER grants crm.visibility.manage ⇒ ${g1.ok ? "accepted" : "refused"} · crm.* ⇒ ${g2.ok ? "accepted" : "refused"} (${String(g1.reason).slice(0, 80)})`);
  chk("8.pos", g3.ok && g4.ok && perm["crm.visibility.manage"] === true, `MANAGER grants crm.deal.read ok=${g3.ok} · OWNER grants crm.visibility.manage ok=${g4.ok}`);
} catch (e) {
  chk("FATAL", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  if (/^[a-z0-9]+$/i.test(T)) {
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[])
      .map((r) => r.table_name as string)
      .filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1)
      for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = '${T}'`).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.businessUnit.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    for (const u of USERS) await P.appNotification.deleteMany({ where: { recipientUserId: u } }).catch(() => undefined);
    for (const u of USERS) await P.user.delete({ where: { id: u } }).catch(() => undefined);
    let left = 0;
    for (const t of tables) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = '${T}'`).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
    const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
    chk("CLEAN", left === 0 && users === 0, `rows left=${left} users left=${users}`);
  }
  await pc.$disconnect();
}
const passed = out.filter((c) => c.ok).length;
console.log(`\n${passed === out.length ? "🟢" : "🔴"} probe-c17-review: ${passed}/${out.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: out.length, passed, findings: out.filter((c) => !c.ok).map((c) => c.id) })}`);
process.exit(passed === out.length ? 0 : 1);
