// C5.5-fix6 REVIEW round 2 probe (independent reviewer) — attacks on the r2 changes (901a94d2):
//   IMP   import accounting for every combination (existing/new/repeated/invisible/over-long company name · linker/read-only/no-read/
//         no-create importer) + re-import idempotency + no orphan companies + every unlinked company row visibly noted
//   F61   create WITH a company is now refused for read-without-update: API key parity · card-scan accept parity for each confirmer
//   VIS   assertCompanyVisible: archived / merged current company · primary-invisible + secondary-visible · error texts (oracle)
//   F64   the read-only line wording per persona (real component render)
// Measured rows that describe behaviour (not a pass/fail claim) are printed as ℹ️ INFO lines.
// QC2 only (ep-cool-shadow) · throwaway tenants `qc-cf7-rw-*` (swept in done()) · network blocked.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf7/review/probe-cf7-review-r2.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
const { fixture } = (await import("../_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const fx = await fixture("rw");
const { P, chk, call, mkShop, mkUser, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const cut = (v: unknown, n = 140) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const codeOf = (r: Any) => (r.ok ? "OK" : String(r.err?.code ?? r.err?.name ?? "ERR"));
const rand = TAG.slice(-8);
const info = (id: string, msg: string) => console.log(`  ℹ️  [${id}] ${msg}`);

const { toMemberActor } = (await import("@/lib/modules/member" as string)) as Any;
const CON = (await import("@/lib/modules/crm/contacts" as string)) as Any;
const CALLS = (await import("@/lib/modules/crm/calls" as string)) as Any;
const { crmActorForKey } = (await import("@/lib/modules/crm/api/actor" as string)) as Any;
const { crmCanLinkCompany, crmCan } = (await import("@/lib/modules/crm/access" as string)) as Any;

async function staff(shop: Any, suffix: string, keys: string[]) {
  const uid = await mkUser(`-${suffix}`);
  const permissions = Object.fromEntries(keys.map((k) => [k, true]));
  const m = await P.membership.create({ data: { userId: uid, tenantId: shop.tid, role: "STAFF", unitAccess: ["*"], permissions, acceptedAt: new Date() } });
  return { uid, actor: toMemberActor(uid, m), ctx: { tenantId: shop.tid, systemId: shop.S, actorUserId: uid } };
}
async function mkCompany(shop: Any, name: string, ownerUserId: string) {
  const party = await P.party.create({ data: { tenantId: shop.tid, name, kind: "COMPANY" } });
  return P.crmCompany.create({ data: { tenantId: shop.tid, systemId: shop.S, partyId: party.id, name, ownerUserId } });
}
async function mkContact(shop: Any, first: string, ownerUserId: string, opts: { companyId?: string | null; extra?: string[] } = {}) {
  const name = `${first} ${TAG}`;
  const party = await P.party.create({ data: { tenantId: shop.tid, name, kind: "PERSON" } });
  const k = await P.crmContact.create({ data: { tenantId: shop.tid, systemId: shop.S, name, firstName: first, partyId: party.id, ownerUserId, companyId: opts.companyId ?? null } });
  if (opts.companyId) await P.crmCompanyContact.create({ data: { tenantId: shop.tid, companyId: opts.companyId, contactId: k.id, isPrimary: true } });
  for (const c of opts.extra ?? []) await P.crmCompanyContact.create({ data: { tenantId: shop.tid, companyId: c, contactId: k.id, isPrimary: false } });
  return k;
}
const TABLES = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[])
  .map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x)).sort();
async function snap(tid: string, contactId: string | null) {
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid)) as Any[])[0]?.n ?? 0);
    if (n) counts[t] = n;
  }
  const row = contactId ? await P.crmContact.findUnique({ where: { id: contactId } }) : null;
  const links = contactId ? await P.crmCompanyContact.findMany({ where: { contactId }, orderBy: { companyId: "asc" } }) : [];
  return { counts, row: j(row), links: j(links) };
}
function diff(a: Any, b: Any): string {
  const out: string[] = [];
  for (const k of new Set([...Object.keys(a.counts), ...Object.keys(b.counts)])) if ((a.counts[k] ?? 0) !== (b.counts[k] ?? 0)) out.push(`${k} ${a.counts[k] ?? 0}→${b.counts[k] ?? 0}`);
  if (a.row !== b.row) out.push("contact row changed");
  if (a.links !== b.links) out.push("company links changed");
  return out.join(" · ") || "none";
}

try {
  const shop = await mkShop("a");
  const BASE = ["crm.contact.read", "crm.contact.create", "crm.contact.update", "crm.contact.import", "crm.deal.read", "crm.activity.read"];
  const full = await staff(shop, "full", [...BASE, "crm.company.read", "crm.company.update", "crm.company.create"]);
  const linker = await staff(shop, "link", [...BASE, "crm.company.read", "crm.company.update"]); // no company.create
  const ro = await staff(shop, "ro", [...BASE, "crm.company.read", "crm.company.create"]); // read+create, no update
  const noCo = await staff(shop, "noco", BASE);
  const owner = { actor: shop.owner, ctx: shop.ctx, uid: shop.uid };
  const coFull = await mkCompany(shop, `บริษัทฟูล ${rand}`, full.uid);
  const coLink = await mkCompany(shop, `บริษัทลิงก์ ${rand}`, linker.uid);
  const coRo = await mkCompany(shop, `บริษัทอาร์โอ ${rand}`, ro.uid);
  const coHidden = await mkCompany(shop, `บริษัทลับ ${rand}`, shop.uid); // owner's: invisible to every STAFF
  chk("P-premise", crmCanLinkCompany(full.actor) && crmCanLinkCompany(linker.actor) && !crmCanLinkCompany(ro.actor) && crmCan(ro.actor, "crm.company.create") && !crmCanLinkCompany(noCo.actor),
    "keys: full/linker can link · ro (read+create) cannot · noCo cannot");

  // ═══════════ IMP · import accounting ═══════════
  console.log("\n── IMP ──");
  const mapping = { ชื่อ: "firstName", อีเมล: "email", บริษัท: "company" };
  const coCount = async () => (await P.crmCompany.count({ where: { tenantId: shop.tid } })) as number;
  const linkCount = async () => (await P.crmCompanyContact.count({ where: { tenantId: shop.tid, endedAt: null } })) as number;
  const runImport = async (who: Any, tag: string, rows: Any[], onDuplicate = "skip") => {
    const c0 = await coCount();
    const l0 = await linkCount();
    const r = await call(() => CON.importContacts(who.ctx, who.actor, { rows, mapping, options: { onDuplicate, source: "IMPORT" } }));
    const res = r.v?.result ?? {};
    const c1 = await coCount();
    const l1 = await linkCount();
    const job = r.ok ? ((await CON.getImportJob(who.ctx, who.actor, r.v.jobId)) as Any).result : null;
    return { r, res, coPlus: c1 - c0, linkPlus: l1 - l0, job, tag };
  };
  const show = (x: Any) => `${codeOf(x.r)} created=${x.res.created} updated=${x.res.updated} skipped=${x.res.skipped} failed=${x.res.failed} · companies +${x.coPlus} links +${x.linkPlus} · notes ${cut(j(x.res.errors), 400)}`;
  const longName = "ก".repeat(400);
  const rowsFor = (p: string, visibleName: string) => [
    { ชื่อ: `${p}1 ${rand}`, อีเมล: `${p}1-${rand}@imp.test`, บริษัท: visibleName }, // existing, visible to importer
    { ชื่อ: `${p}2 ${rand}`, อีเมล: `${p}2-${rand}@imp.test`, บริษัท: `ใหม่ ${p} ${rand}` }, // new name
    { ชื่อ: `${p}3 ${rand}`, อีเมล: `${p}3-${rand}@imp.test`, บริษัท: `ใหม่ ${p} ${rand}` }, // same new name again
    { ชื่อ: `${p}4 ${rand}`, อีเมล: `${p}4-${rand}@imp.test`, บริษัท: coHidden.name }, // existing name the importer cannot see
    { ชื่อ: `${p}5 ${rand}`, อีเมล: `${p}5-${rand}@imp.test`, บริษัท: longName }, // company create throws (too long)
    { ชื่อ: `${p}6 ${rand}`, อีเมล: `${p}6-${rand}@imp.test` }, // no company
    { ชื่อ: "", อีเมล: "", บริษัท: `ใหม่ ${p} ${rand}` }, // empty row = real failure
  ];
  // full importer
  const f1 = await runImport(full, "full", rowsFor("f", coFull.name));
  const notedRows = new Set(((f1.res.errors ?? []) as Any[]).map((e) => e.row));
  const unlinked: number[] = [];
  for (let i = 1; i <= 5; i += 1) {
    const k = await P.crmContact.findFirst({ where: { tenantId: shop.tid, email: `f${i}-${rand}@imp.test` }, select: { id: true } });
    const n = k ? await P.crmCompanyContact.count({ where: { contactId: k.id, endedAt: null } }) : -1;
    if (n === 0) unlinked.push(i);
  }
  const silentlyUnlinked = unlinked.filter((i) => !notedRows.has(i));
  info("IMP-full", show(f1));
  chk("IMP-full-accounting", f1.r.ok && f1.res.created === 6 && f1.res.failed === 1 && silentlyUnlinked.length === 0 && f1.coPlus <= 2,
    `full importer (7 rows: visible · new · new again · hidden name · 400-char name · none · empty) → created=${f1.res.created} failed=${f1.res.failed} (want 6 · 1 = the empty row) · unlinked rows ${j(unlinked)} · unlinked WITHOUT a note ${j(silentlyUnlinked)} (want []) · companies +${f1.coPlus}`);
  chk("IMP-job-parity", !!f1.job && f1.job.failed === f1.res.failed && j(f1.job.errors) === j(f1.res.errors), `getImportJob result = inline result (failed ${f1.job?.failed}/${f1.res.failed} · errors equal ${j(f1.job?.errors) === j(f1.res.errors)})`);
  // re-import the same file in update mode: idempotent
  const f2 = await runImport(full, "full-again", rowsFor("f", coFull.name), "update");
  info("IMP-full-reimport", show(f2));
  chk("IMP-reimport-idempotent", f2.r.ok && f2.res.created === 0 && f2.res.updated === 6 && f2.coPlus === 0 && f2.linkPlus === 0,
    `same file again, onDuplicate=update → created=${f2.res.created} updated=${f2.res.updated} failed=${f2.res.failed} · companies +${f2.coPlus} links +${f2.linkPlus} (want 0 · 6 · +0 · +0)`);
  // read+create without update: no search, no company creation, one note
  const r1 = await runImport(ro, "ro", rowsFor("r", coRo.name));
  info("IMP-ro", show(r1));
  const roNotes = ((r1.res.errors ?? []) as Any[]).filter((e) => /ผูกบริษัท/.test(e.message)).length;
  chk("IMP-ro-no-orphans", r1.r.ok && r1.res.created === 6 && r1.res.failed === 1 && r1.coPlus === 0 && r1.linkPlus === 0 && roNotes === 1,
    `read+create without update → created=${r1.res.created} failed=${r1.res.failed} companies +${r1.coPlus} links +${r1.linkPlus} company notes=${roNotes} (want 6 · 1 · +0 · +0 · 1 — before r2 this importer created orphan companies)`);
  const n1 = await runImport(noCo, "noco", rowsFor("n", coRo.name));
  info("IMP-noread", show(n1));
  chk("IMP-noread", n1.r.ok && n1.res.created === 6 && n1.res.failed === 1 && n1.coPlus === 0 && n1.linkPlus === 0, `no company keys → created=${n1.res.created} failed=${n1.res.failed} companies +${n1.coPlus} links +${n1.linkPlus}`);
  const l1 = await runImport(linker, "linker", rowsFor("l", coLink.name));
  info("IMP-linker", show(l1));
  const lNoted = new Set(((l1.res.errors ?? []) as Any[]).map((e) => e.row));
  chk("IMP-linker", l1.r.ok && l1.res.created === 6 && l1.res.failed === 1 && l1.coPlus === 0 && [2, 3, 4, 5].every((r) => lNoted.has(r)),
    `read+update without create → created=${l1.res.created} failed=${l1.res.failed} companies +${l1.coPlus} links +${l1.linkPlus} · rows 2-5 noted=${[2, 3, 4, 5].every((r) => lNoted.has(r))}`);

  // ═══════════ F61 · create-with-company tightening ═══════════
  console.log("\n── F61 ──");
  {
    const key = crmActorForKey({ keyId: `k-${rand}`, scopes: ["crm.contact.read", "crm.contact.create", "crm.company.read"], createdById: shop.uid });
    const s0 = await snap(shop.tid, null);
    const r = await call(() => CON.createContact({ tenantId: shop.tid, systemId: shop.S, actorUserId: null }, key, { firstName: `คีย์ ${rand}`, companyId: coFull.id }));
    const s1 = await snap(shop.tid, null);
    info("F61-api-key", `API key {contact.create, company.read} createContact({companyId}) → ${codeOf(r)} "${cut(r.err?.message, 80)}" · writes: ${diff(s0, s1)} (round 1: created + warning; now a hard refusal — REST behaviour change)`);
    chk("F61-api-atomic", codeOf(r) === "FORBIDDEN" && diff(s0, s1) === "none", `API key read-only company → FORBIDDEN with no writes`);
  }
  // card scan accept: payload with a matched company, confirmers with different keys
  const proposal = async (companyId: string) =>
    P.aiProposal.create({ data: { tenantId: shop.tid, conversationId: `conv-${rand}`, kind: CALLS.LEAD_PROPOSAL_KIND, summary: "card", payload: { systemId: shop.S, name: `นามบัตร ${Math.random().toString(36).slice(2, 7)} ${rand}`, companyId }, expiresAt: new Date(Date.now() + 86_400_000) } });
  for (const [label, who, co] of [["linker", linker, coLink], ["ro", ro, coRo], ["noread", noCo, coFull], ["owner", owner, coHidden]] as const) {
    const p = await proposal(co.id);
    const r = await call(() => CALLS.acceptLeadProposal((who as Any).ctx, (who as Any).actor, p.id));
    const k = r.ok ? await P.crmContact.findUnique({ where: { id: r.v.contactId }, select: { companyId: true } }) : null;
    const pr = await P.aiProposal.findUnique({ where: { id: p.id }, select: { status: true, resultNote: true } });
    info(`F61-card-${label}`, `accept card with matched company by ${label} → ${codeOf(r)} "${cut(r.err?.message, 60)}" · contact company linked=${k?.companyId === co.id} · proposal ${pr.status} note "${cut(pr.resultNote, 70)}"`);
    if (label === "linker" || label === "owner") chk(`F61-card-${label}`, r.ok && k?.companyId === co.id, `${label} accepts a card with a matched company → linked`);
    else chk(`F61-card-${label}`, r.ok && k?.companyId === null, `${label} accepts a card with a matched company → contact created without the company (not refused)`);
  }

  // ═══════════ VIS · assertCompanyVisible ═══════════
  console.log("\n── VIS ──");
  {
    // archived current company (visible to its owner-staff): move off it / clear it
    const coArch = await mkCompany(shop, `บริษัทเก็บ ${rand}`, full.uid);
    const kA = await mkContact(shop, "บริษัทเก็บถาวร", full.uid, { companyId: coArch.id });
    await P.crmCompany.update({ where: { id: coArch.id }, data: { archivedAt: new Date() } });
    const r = await call(() => CON.updateContact(full.ctx, full.actor, kA.id, { firstName: `ย้ายจากเก็บ ${rand}`, companyId: coFull.id }));
    const row = await P.crmContact.findUnique({ where: { id: kA.id } });
    chk("VIS-archived-move", r.ok && row.companyId === coFull.id, `move a contact off its ARCHIVED (visible) company → ${codeOf(r)} "${cut(r.err?.message, 70)}" · now coFull=${row.companyId === coFull.id} (want OK — not blocked by the new check)`);
    const kA2 = await mkContact(shop, "บริษัทเก็บถาวร2", full.uid, { companyId: coArch.id });
    const s0 = await snap(shop.tid, kA2.id);
    const r2 = await call(() => CON.updateContact(full.ctx, full.actor, kA2.id, { firstName: `ล้างเก็บ ${rand}`, companyId: null }));
    const s1 = await snap(shop.tid, kA2.id);
    info("VIS-archived-clear", `clear an ARCHIVED (visible) current company → ${codeOf(r2)} "${cut(r2.err?.message, 70)}" · writes: ${diff(s0, s1)}`);
    // merged current company (stale cache) — owner moves off it
    const coM = await mkCompany(shop, `บริษัทถูกรวม ${rand}`, shop.uid);
    const kM = await mkContact(shop, "บริษัทถูกรวม", shop.uid, { companyId: coM.id });
    await P.crmCompany.update({ where: { id: coM.id }, data: { mergedIntoId: coHidden.id } });
    const r3 = await call(() => CON.updateContact(owner.ctx, owner.actor, kM.id, { companyId: coFull.id }));
    const rowM = await P.crmContact.findUnique({ where: { id: kM.id } });
    chk("VIS-merged-move-owner", r3.ok && rowM.companyId === coFull.id, `owner moves a contact off a MERGED company → ${codeOf(r3)} "${cut(r3.err?.message, 70)}" · moved=${rowM.companyId === coFull.id}`);
  }
  {
    // primary invisible + secondary visible: the linker can no longer pick anything (dead control on the sheet?)
    const kP = await mkContact(shop, "หลักลับรอง", linker.uid, { companyId: coHidden.id, extra: [coLink.id] });
    const s0 = await snap(shop.tid, kP.id);
    const r = await call(() => CON.updateContact(linker.ctx, linker.actor, kP.id, { companyId: coLink.id }));
    const s1 = await snap(shop.tid, kP.id);
    const d360 = (await CON.getContact360(linker.ctx, linker.actor, kP.id)) as Any;
    info("VIS-primary-hidden", `linker (can.company=true ⇒ picker shown) promotes its own visible secondary company → ${codeOf(r)} "${cut(r.err?.message, 80)}" · writes: ${diff(s0, s1)} · 360 company=${d360.company?.id === coLink.id ? "secondary (visible)" : j(d360.company)}`);
    chk("VIS-primary-hidden-atomic", diff(s0, s1) === "none", "refusal (if any) writes nothing");
    // oracle: same text whether the hidden current company is live, archived or merged
    const kQ = await mkContact(shop, "ลับเก็บ", linker.uid, { companyId: (await mkCompany(shop, `ลับเก็บ ${rand}`, shop.uid)).id });
    await P.crmCompany.update({ where: { id: kQ.companyId }, data: { archivedAt: new Date() } });
    const rq = await call(() => CON.updateContact(linker.ctx, linker.actor, kQ.id, { companyId: coLink.id }));
    chk("VIS-oracle-same-text", codeOf(r) === codeOf(rq) && r.err?.message === rq.err?.message,
      `hidden live vs hidden archived current company → ${codeOf(r)} / ${codeOf(rq)} · same text=${r.err?.message === rq.err?.message} (no extra signal)`);
  }

  // ═══════════ F64 · read-only line wording (real component) ═══════════
  console.log("\n── F64 ──");
  {
    const React = (await import("react" as string)) as Any;
    const R = (React.default ?? React) as Any;
    const RDS = (await import("react-dom/server" as string)) as Any;
    const ctxMod = (await import("next/dist/shared/lib/app-router-context.shared-runtime.js" as string)) as Any;
    const C3 = (await import("@/app/app/sys/[id]/crm/contacts/_components/Contact360Actions" as string)) as Any;
    const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
    const orig = R.useState;
    let calls = 0;
    R.useState = (init: unknown) => { calls += 1; const p = orig(init); return calls === 2 ? ["edit", p[1]] : p; };
    // mirror of the page wiring (page.tsx:190-193)
    const sheet = async (who: Any, k: Any) => {
      const d = (await CON.getContact360(who.ctx, who.actor, k.id)) as Any;
      const c = await P.crmContact.findUnique({ where: { id: k.id } });
      calls = 0;
      return String(RDS.renderToStaticMarkup(R.createElement(ctxMod.AppRouterContext.Provider, { value: router }, R.createElement(C3.ContactMenu, {
        systemId: shop.S, owners: [],
        can: { update: true, assign: true, merge: false, archive: false, company: crmCanLinkCompany(who.actor) },
        contact: { id: c.id, firstName: c.firstName, lastName: "", phone: "", email: "", jobTitle: "", ownerUserId: c.ownerUserId, lifecycleStage: "LEAD", leadStatus: "NEW", tags: [], archived: false,
          companyId: crmCanLinkCompany(who.actor) ? c.companyId : null, companyName: d.company?.name ?? null, companyIsPrimary: !!d.company && d.company.id === c.companyId },
      }))));
    };
    try {
      const kPrim = await mkContact(shop, "หลักเห็น", ro.uid, { companyId: coRo.id });
      const kSec = await mkContact(shop, "หลักไม่เห็น", ro.uid, { companyId: coHidden.id, extra: [coRo.id] });
      const kNo = await mkContact(shop, "ไม่มีสิทธิ์อ่าน", noCo.uid, { companyId: coRo.id });
      const hP = await sheet(ro, kPrim);
      const hS = await sheet(ro, kSec);
      const hN = await sheet(noCo, kNo);
      const hL = await sheet(linker, await mkContact(shop, "ลิงก์เกอร์", linker.uid, { companyId: coLink.id }));
      chk("F64-ro-primary", hP.includes(`บริษัทหลัก: ${coRo.name}`), "read-only role, primary visible → 'บริษัทหลัก: <name>'");
      chk("F64-ro-secondary", hS.includes(`บริษัท: ${coRo.name}`) && !hS.includes("บริษัทหลัก:") && !hS.includes(coHidden.name), "read-only role, primary hidden → 'บริษัท: <visible secondary>', no hidden name");
      chk("F64-noread", !hN.includes("contact-edit-company-readonly") && !hN.includes(coRo.name), "no company read → no line, no name");
      chk("F64-linker", hL.includes("contact-pick-edit-company-q") && !hL.includes("contact-edit-company-readonly"), "linker → picker, no read-only line");
    } finally {
      R.useState = orig;
    }
  }
} catch (e) {
  chk("FATAL", false, String((e as Error)?.stack ?? e).slice(0, 900));
}
await done("probe-cf7-review-r2");
