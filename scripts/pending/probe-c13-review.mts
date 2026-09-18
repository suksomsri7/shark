// probe-c13-review.mts — หลักฐานรอบแก้รีวิว C1.3 (B1 · SF1 · SF2 · SF3 · SF4 · SF6 · SF7) · positive + negative ต่อข้อ
// QC DB เท่านั้น (.env.qc) · tenant ทิ้งได้ `qc-c13rv-<rand>` ลบใน finally · ไม่ drain outbox
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c13-review.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { readFileSync } from "node:fs";

const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const CO = (await import("@/lib/modules/crm/companies" as string)) as Any;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c13rv-${rand}`;
const out: { id: string; ok: boolean; detail: string }[] = [];
const chk = (id: string, ok: unknown, detail: string) => {
  out.push({ id, ok: !!ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} ${id} — ${detail}`);
};
const call = async (fn: Any, ...args: Any[]) => {
  try {
    return { ok: true, v: await fn(...args), code: "", msg: "" };
  } catch (e) {
    const x = e as Any;
    return { ok: false, v: undefined as Any, code: String(x?.code ?? ""), msg: e instanceof Error ? e.message : String(e) };
  }
};
const taxOf = (): string => {
  const d = Array.from({ length: 12 }, (_x, i) => (i === 0 ? 1 + Math.floor(Math.random() * 8) : Math.floor(Math.random() * 10)));
  const s = d.reduce((a, v, i) => a + v * (13 - i), 0);
  return `${d.join("")}${(11 - (s % 11)) % 10}`;
};

console.log(`\n═══ probe C1.3 review · DB ${host} · ${TAG} ═══`);
const users: string[] = [];
let tid = "";
try {
  const t = await P.tenant.create({ data: { name: TAG, slug: TAG } });
  tid = t.id;
  const owner = (await P.user.create({ data: { email: `${TAG}@qc.invalid`, name: TAG } })).id as string;
  const staff = (await P.user.create({ data: { email: `${TAG}-s@qc.invalid`, name: `${TAG} s` } })).id as string;
  users.push(owner, staff);
  await P.membership.create({ data: { userId: owner, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  await P.membership.create({ data: { userId: staff, tenantId: tid, role: "STAFF", unitAccess: ["*"], permissions: { "crm.*": true }, acceptedAt: new Date() } });
  const crm = (await sysSvc.createSystem(tid, "CRM", `CRM ${TAG}`)).id as string;
  const crm2 = (await sysSvc.createSystem(tid, "CRM", `CRM2 ${TAG}`)).id as string;
  const acc = (await sysSvc.createSystem(tid, "ACCOUNT", `ACC ${TAG}`)).id as string;
  await P.accountSystemLink.create({ data: { tenantId: tid, systemId: acc, linkedKind: "CRM", linkedId: crm } });
  const cx = { tenantId: tid, systemId: crm, actorUserId: owner };
  const cx2 = { tenantId: tid, systemId: crm2, actorUserId: owner };
  const cxS = { tenantId: tid, systemId: crm, actorUserId: staff };
  const OWN = { userId: owner, role: "OWNER", unitAccess: [], permissions: {} };
  const STF = { userId: staff, role: "STAFF", unitAccess: ["*"], permissions: { "crm.*": true } };
  const row = (id: string) => P.crmCompany.findFirst({ where: { id } });
  const partyOf = (id: string | null | undefined) => P.party.findFirst({ where: { id: id ?? "-" } });
  const mkCo = async (name: string, extra: Record<string, Any> = {}, c: Any = cx) => {
    const r = await CO.createCompany(c, OWN, { name, ...extra });
    return r.company.id as string;
  };

  // ── B1: บริษัทห้ามผูก Party ของคน ──
  console.log("── B1 ──");
  {
    const T = taxOf();
    const person = await P.party.create({ data: { tenantId: tid, kind: "PERSON", name: `นายเจ้าของร้าน ${rand}`, taxId: T } });
    const r = await CO.createCompany(cx, OWN, { name: `ร้านของนายเจ้าของ ${rand}`, taxId: T });
    const co = await row(r.company.id);
    const p = await partyOf(co?.partyId);
    chk("B1+ create: tax id of a PERSON Party ⇒ new COMPANY Party (person not adopted)", r.created && co.partyId !== person.id && p?.kind === "COMPANY", `party=${p?.kind} adoptedPerson=${co.partyId === person.id}`);
    await CO.updateCompany(cx, OWN, co.id, { name: `ร้านของนายเจ้าของ (ใหม่) ${rand}` });
    const personAfter = await partyOf(person.id);
    chk("B1+ rename of that company leaves the PERSON Party's name untouched", personAfter?.name === `นายเจ้าของร้าน ${rand}`, `person.name=${personAfter?.name}`);
    const T2 = taxOf();
    const cp = await P.party.create({ data: { tenantId: tid, kind: "COMPANY", name: `บจก. มีอยู่ ${rand}`, taxId: T2 } });
    const r2 = await CO.createCompany(cx, OWN, { name: `มีอยู่ ${rand}`, taxId: T2 });
    chk("B1− a COMPANY Party with that tax id IS reused (positive control)", (await row(r2.company.id))?.partyId === cp.id, "reused");
    // ข้อมูลเก่า: บริษัทที่ผูก Party ของคนไว้แล้ว (แทรกดิบ) → รวมกับบริษัทปกติ → Party ของคนต้องไม่ถูกรวม
    const person2 = await P.party.create({ data: { tenantId: tid, kind: "PERSON", name: `นางสาวเก่า ${rand}` } });
    const legacy = (await P.crmCompany.create({ data: { tenantId: tid, systemId: crm, name: `บริษัทเก่าผูกคน ${rand}`, partyId: person2.id } })).id as string;
    const normal = await mkCo(`บริษัทปกติ ${rand}`);
    const m = await call(CO.mergeCompanies, cx, OWN, { keepId: normal, mergeId: legacy, confirm: true, reason: "ทดสอบ B1 รวม" });
    const p2 = await partyOf(person2.id);
    chk("B1+ merge never merges a PERSON Party (legacy company bound to a person)", m.ok && !p2?.mergedIntoId, `merge=${m.ok ? "ok" : m.msg} person.mergedIntoId=${p2?.mergedIntoId ?? "-"}`);
    const n1 = await mkCo(`รวมบริษัทหนึ่ง ${rand}`);
    const n2 = await mkCo(`รวมบริษัทสอง ${rand}`);
    const m2 = await call(CO.mergeCompanies, cx, OWN, { keepId: n1, mergeId: n2, confirm: true, reason: "ทดสอบ B1 ปกติ" });
    const pn2 = await partyOf((await row(n2))?.partyId);
    chk("B1− two COMPANY Parties ARE merged (positive control)", m2.ok && pn2?.mergedIntoId === (await row(n1))?.partyId, `mergedInto=${pn2?.mergedIntoId ? "kept" : "-"}`);
  }

  // ── SF1: Party ที่แชร์ ──
  console.log("── SF1 ──");
  {
    const solo = await mkCo(`เดี่ยว ${rand}`, { taxId: taxOf() });
    await CO.updateCompany(cx, OWN, solo, { name: `เดี่ยว (ใหม่) ${rand}` });
    const sp = await partyOf((await row(solo))?.partyId);
    chk("SF1+ sole holder: rename writes the Party name", sp?.name === `เดี่ยว (ใหม่) ${rand}`, `party.name=${sp?.name}`);
    const T = taxOf();
    const a = await mkCo(`แชร์ ${rand}`, { taxId: T });
    const b = await mkCo(`แชร์ระบบสอง ${rand}`, { taxId: T }, cx2);
    const shared = (await row(a))?.partyId as string;
    chk("SF1 setup: the two systems' companies share one Party", (await row(b))?.partyId === shared, "shared");
    await CO.updateCompany(cx, OWN, a, { name: `แชร์ เปลี่ยนชื่อ ${rand}` });
    const ps = await partyOf(shared);
    chk("SF1− shared Party: rename of one holder does NOT rename the shared Party", ps?.name === `แชร์ ${rand}` && (await row(a))?.partyId === shared, `party.name=${ps?.name}`);
    await CO.updateCompany(cx, OWN, a, { taxId: null });
    chk("SF1− shared Party: clearing the tax id never nulls the shared Party's tax id", (await partyOf(shared))?.taxId === T, `party.taxId=${(await partyOf(shared))?.taxId}`);
    const NT = taxOf();
    await CO.updateCompany(cx, OWN, a, { taxId: NT });
    const ra = await row(a);
    const pa = await partyOf(ra?.partyId);
    chk("SF1+ shared Party: a new tax id re-points the company to a COMPANY Party of the new identity (shared Party untouched)", ra?.partyId !== shared && pa?.taxId === NT && pa?.kind === "COMPANY" && (await partyOf(shared))?.taxId === T, `repointed=${ra?.partyId !== shared} newParty.tax=${pa?.taxId === NT}`);
  }

  // ── SF2: เลขภาษีต่างกัน · สิทธิ์รวมเอกสารบัญชี ──
  console.log("── SF2 ──");
  {
    const x = await mkCo(`ต่างนิติ ก ${rand}`, { taxId: taxOf() });
    const y = await mkCo(`ต่างนิติ ข ${rand}`, { taxId: taxOf() });
    const r = await call(CO.mergeCompanies, cx, OWN, { keepId: x, mergeId: y, confirm: true, reason: "ทดสอบต่างนิติ" });
    chk("SF2+ both tax ids set and different ⇒ VALIDATION (Thai), nothing merged", !r.ok && r.code === "VALIDATION" && /นิติบุคคล/.test(r.msg) && !(await row(y))?.mergedIntoId, r.msg.slice(0, 60));
    const mkAc = async (co: string) => {
      const c = await row(co);
      const ac = await P.accountContact.create({ data: { tenantId: tid, systemId: acc, kind: "CUSTOMER", legalType: "COMPANY", name: c.name, partyId: c.partyId } });
      await P.crmCompany.update({ where: { id: co }, data: { accountContactId: ac.id } });
      return ac.id as string;
    };
    const k1 = await mkCo(`สิทธิ์ เก็บ ${rand}`, { taxId: taxOf() });
    const m1 = await mkCo(`สิทธิ์ รวม ${rand}`);
    await mkAc(k1);
    const acM1 = await mkAc(m1);
    const rs = await call(CO.mergeCompanies, cxS, STF, { keepId: k1, mergeId: m1, confirm: true, reason: "ทดสอบสิทธิ์บัญชี" });
    chk("SF2+ actor without account.contact.merge ⇒ CRM merge done, account merge skipped (NO_PERMISSION), account contact untouched", rs.ok && rs.v?.accountMergeSkipped === "NO_PERMISSION" && !(await P.accountContact.findFirst({ where: { id: acM1 } }))?.mergedIntoId && (await row(m1))?.mergedIntoId === k1, `skipped=${rs.v?.accountMergeSkipped} ${rs.msg}`);
    const k2 = await mkCo(`สิทธิ์ เก็บ 2 ${rand}`, { taxId: taxOf() });
    const m2 = await mkCo(`สิทธิ์ รวม 2 ${rand}`);
    const acK2 = await mkAc(k2);
    const acM2 = await mkAc(m2);
    const ro = await call(CO.mergeCompanies, cx, OWN, { keepId: k2, mergeId: m2, confirm: true, reason: "ทดสอบสิทธิ์บัญชี 2" });
    chk("SF2− OWNER (has the permission) ⇒ account contacts merged (positive control)", ro.ok && ro.v?.accountMergeSkipped === null && (await P.accountContact.findFirst({ where: { id: acM2 } }))?.mergedIntoId === acK2, `accountMerge=${JSON.stringify(ro.v?.accountMerge)}`);
  }

  // ── SF3: เติมเลขภาษีให้บริษัทที่เก็บไว้ ──
  console.log("── SF3 ──");
  {
    const T = taxOf();
    const keep = await mkCo(`เติมภาษี เก็บ ${rand}`);
    const drop = await mkCo(`เติมภาษี รวม ${rand}`, { taxId: T, branchCode: "00007" });
    await CO.mergeCompanies(cx, OWN, { keepId: keep, mergeId: drop, confirm: true, reason: "ทดสอบเติมภาษี" });
    const k = await row(keep);
    chk("SF3+ kept company without a tax id takes the merged company's tax id + branch", k?.taxId === T && k?.branchCode === "00007", `tax=${k?.taxId === T} branch=${k?.branchCode}`);
    const T2 = taxOf();
    const keep2 = await mkCo(`มีภาษี เก็บ ${rand}`, { taxId: T2 });
    const drop2 = await mkCo(`ไม่มีภาษี รวม ${rand}`);
    await CO.mergeCompanies(cx, OWN, { keepId: keep2, mergeId: drop2, confirm: true, reason: "ทดสอบมีภาษีอยู่แล้ว" });
    chk("SF3− kept company that already has a tax id keeps it", (await row(keep2))?.taxId === T2, `tax=${(await row(keep2))?.taxId === T2}`);
  }

  // ── SF4: วงวนหลังรวม ──
  console.log("── SF4 ──");
  {
    const M = await mkCo(`วง แม่ ${rand}`);
    const A = await mkCo(`วง ลูก ${rand}`);
    const K = await mkCo(`วง หลาน ${rand}`);
    await CO.setParent(cx, OWN, A, M);
    await CO.setParent(cx, OWN, K, A);
    const r = await call(CO.mergeCompanies, cx, OWN, { keepId: K, mergeId: M, confirm: true, reason: "ทดสอบวงวน" });
    chk("SF4+ merge that would create a parent cycle (K under A under M; keep K, merge M) ⇒ VALIDATION, tree unchanged", !r.ok && r.code === "VALIDATION" && (await row(A))?.parentCompanyId === M && !(await row(M))?.mergedIntoId, r.msg.slice(0, 70));
    const M2 = await mkCo(`ต้นไม้ แม่ ${rand}`);
    const C2 = await mkCo(`ต้นไม้ ลูก ${rand}`);
    const K2 = await mkCo(`ต้นไม้ เก็บ ${rand}`);
    await CO.setParent(cx, OWN, C2, M2);
    const r2 = await call(CO.mergeCompanies, cx, OWN, { keepId: K2, mergeId: M2, confirm: true, reason: "ทดสอบต้นไม้ปกติ" });
    chk("SF4− normal merge re-parents the merged company's subsidiaries to the kept company", r2.ok && (await row(C2))?.parentCompanyId === K2, `child.parent=${(await row(C2))?.parentCompanyId === K2 ? "kept" : "?"}`);
  }

  // ── SF6: บริษัทที่เก็บถาวรซ้ำ + กู้คืน ──
  console.log("── SF6 ──");
  {
    const T = taxOf();
    const old = await mkCo(`เก็บแล้ว ${rand}`, { taxId: T });
    await CO.archiveCompany(cx, OWN, old, { confirm: true, reason: "ทดสอบเก็บถาวร" });
    const r = await CO.createCompany(cx, OWN, { name: `เก็บแล้ว ใหม่ ${rand}`, taxId: T });
    chk("SF6+ same tax id as an ARCHIVED company ⇒ created:false · duplicateOf = it · duplicateArchived:true", r.created === false && r.duplicateOf === old && r.duplicateArchived === true, JSON.stringify({ c: r.created, a: r.duplicateArchived }));
    const noConfirm = await call(CO.restoreCompany, cx, OWN, old, { reason: "ลูกค้ากลับมาใช้" });
    const rs = await call(CO.restoreCompany, cx, OWN, old, { confirm: true, reason: "ลูกค้ากลับมาใช้" });
    const audit = await P.auditLog.count({ where: { tenantId: tid, targetId: old, action: "crm.company.restore" } });
    chk("SF6+ restoreCompany needs confirm + reason, then un-archives with an audit row", !noConfirm.ok && rs.ok && !(await row(old))?.archivedAt && audit === 1, `noConfirm=${noConfirm.code} audit=${audit}`);
    const T2 = taxOf();
    const live = await mkCo(`ใช้อยู่ ${rand}`, { taxId: T2 });
    const r2 = await CO.createCompany(cx, OWN, { name: `ใช้อยู่ ซ้ำ ${rand}`, taxId: T2 });
    chk("SF6− live duplicate ⇒ duplicateArchived:false", r2.created === false && r2.duplicateOf === live && r2.duplicateArchived === false, JSON.stringify({ a: r2.duplicateArchived }));
  }

  // ── SF7: ตรวจซ้ำด้วยขอบเขตตัวตน (ร้าน+ระบบ) ไม่ใช่การมองเห็น ──
  console.log("── SF7 ──");
  {
    const src = readFileSync("src/lib/modules/crm/companies.ts", "utf8");
    const scopedDup = /companyWhere\(ctx, (a|actor)\), \{ taxId/.test(src) || /companyWhere\(ctx, (a|actor)\), \{ partyId/.test(src) || /companyWhere\(ctx, (a|actor)\), \{ accountContactId/.test(src);
    const idDup = (src.match(/identityScope\(ctx\), (taxId|partyId|accountContactId)/g) ?? []).length;
    chk("SF7+ [static] no tax/party/accountContact uniqueness check goes through companyWhere; identityScope used at every site", !scopedDup && idDup >= 5, `companyWhere-dup=${scopedDup} identityScope-sites=${idDup}`);
    // แถวที่ "มองไม่เห็น" ในรายการปกติ (เก็บถาวร — companyWhere+live เคยข้าม) ยังถูกนับเป็นตัวซ้ำ
    const T = taxOf();
    const party0 = await P.party.create({ data: { tenantId: tid, kind: "COMPANY", name: `ซ่อน ${rand}`, taxId: T } });
    const hidden = (await P.crmCompany.create({ data: { tenantId: tid, systemId: crm, name: `ซ่อน ${rand}`, partyId: party0.id, taxId: T, archivedAt: new Date() } })).id as string;
    const r = await CO.createCompany(cx, OWN, { name: `ซ่อน ซ้ำ ${rand}`, taxId: T });
    chk("SF7+ a row outside the visible list (archived) is still a duplicate", r.created === false && r.duplicateOf === hidden, `dup=${r.duplicateOf === hidden}`);
    const r2 = await CO.createCompany(cx2, OWN, { name: `ซ่อน ระบบสอง ${rand}`, taxId: T });
    chk("SF7− the same tax id in ANOTHER CRM system is not a duplicate (scope stays tenant + system)", r2.created === true, `created=${r2.created}`);
  }
} catch (e) {
  chk("FATAL", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  if (/^[a-z0-9]+$/i.test(tid)) {
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => r.table_name as string);
    for (let pass = 0; pass < 4; pass += 1) for (const tb of tables) await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = '${tid}'`).catch(() => 0);
    await P.appSystemUnit.deleteMany({ where: { tenantId: tid } }).catch(() => 0);
    await P.appSystem.deleteMany({ where: { tenantId: tid } }).catch(() => 0);
    await P.tenant.delete({ where: { id: tid } }).catch(() => 0);
  }
  for (const u of users) await P.user.delete({ where: { id: u } }).catch(() => 0);
  const left = tid ? await P.tenant.count({ where: { id: tid } }) : 0;
  const leftU = await P.user.count({ where: { id: { in: users } } });
  chk("CLEAN", left === 0 && leftU === 0, `tenant=${left} users=${leftU}`);
  await P.$disconnect();
}
const passed = out.filter((c) => c.ok).length;
console.log(`\n${passed === out.length ? "🟢" : "🔴"} probe C1.3 review: ${passed}/${out.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: out.length, passed, findings: out.filter((c) => !c.ok).map((c) => c.id) })}`);
process.exit(passed === out.length ? 0 : 1);
