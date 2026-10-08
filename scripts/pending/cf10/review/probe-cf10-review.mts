// C5.5-fix7 REVIEW probe (independent reviewer) — attacks on 8ac89741
//   R1   isCurrentCompanyHidden ⇔ the server refusal, per persona (owner · unit-scoped manager · OWN-scoped staff linker) × contact shape
//        (primary visible · primary hidden · hidden+archived · hidden+merged · visible+archived · no primary but hidden secondary) ·
//        what the user already sees (contact DTO companyId) · same refusal text for move / clear / live / archived / merged
//   R2   clear of an archived / merged VISIBLE current company: zero writes · move-off OK · restore → clear OK · company archive/merge flows
//   F5   echo variants (padded · null / "" / omitted · + moveOpenDeals) for every persona · a real change is never treated as an echo
//   F6   deal list / board / CSV name the deal's company to a creator who cannot see it (pre-existing — measured)
//   DT   DATETIME: old export cells still import (and to which instant, per server TZ) · edge instants · ms precision · byte-identity of the
//        shared formatter with the two old implementations · empty cells · DATE untouched
//   IM   import entry kinds: failures first at the 500 cap (513-row file) · getImportJob 50 · legacy audit rows without kind
// QC2 only (ep-cool-shadow) · throwaway tenants `qc-cf10-rv-*` (swept in done()) · network blocked.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf10/review/probe-cf10-review.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
const { fixture } = (await import("../_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const fx = await fixture("rv");
const { P, chk, call, mkShop, mkUser, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const cut = (v: unknown, n = 140) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const codeOf = (r: Any) => (r.ok ? "OK" : String(r.err?.code ?? r.err?.name ?? "ERR"));
const rand = TAG.slice(-8);
const info = (id: string, msg: string) => console.log(`  ℹ️  [${id}] ${msg}`);

const MEM = (await import("@/lib/modules/member" as string)) as Any;
const { toMemberActor } = MEM;
const CON = (await import("@/lib/modules/crm/contacts" as string)) as Any;
const CO = (await import("@/lib/modules/crm/companies" as string)) as Any;
const DEALS = (await import("@/lib/modules/crm/deals" as string)) as Any;
const SHARED = (await import("@/lib/modules/crm/contacts-shared" as string)) as Any;
const UID = (await import("@/lib/ui/date" as string)) as Any;
const { crmCanLinkCompany } = (await import("@/lib/modules/crm/access" as string)) as Any;
const HIDDEN = SHARED.CONTACT_PRIMARY_COMPANY_HIDDEN_MSG as string;

async function member(shop: Any, suffix: string, role: "STAFF" | "MANAGER", unitAccess: string[], keys: string[]) {
  const uid = await mkUser(`-${suffix}`);
  const permissions = Object.fromEntries(keys.map((k) => [k, true]));
  const m = await P.membership.create({ data: { userId: uid, tenantId: shop.tid, role, unitAccess, permissions, acceptedAt: new Date() } });
  return { uid, actor: toMemberActor(uid, m), ctx: { tenantId: shop.tid, systemId: shop.S, actorUserId: uid } };
}
async function mkCompany(shop: Any, name: string, ownerUserId: string, teamId: string | null = null) {
  const party = await P.party.create({ data: { tenantId: shop.tid, name, kind: "COMPANY" } });
  return P.crmCompany.create({ data: { tenantId: shop.tid, systemId: shop.S, partyId: party.id, name, ownerUserId, teamId } });
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
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]!;
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\r") { /* skip */ }
    else if (ch === "\n") { row.push(cell); out.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

try {
  const shop = await mkShop("a");
  const owner = { actor: shop.owner, ctx: shop.ctx, uid: shop.uid };
  // unit-scoped manager: sees companies with no team or a team of unit u-a; team TB (unit u-b) is outside
  const TA = await P.team.create({ data: { tenantId: shop.tid, name: `TA ${TAG}`, unitIds: ["u-a"] } });
  const TB = await P.team.create({ data: { tenantId: shop.tid, name: `TB ${TAG}`, unitIds: ["u-b"] } });
  const mgr = await member(shop, "mgr", "MANAGER", ["u-a"], []);
  const BASE = ["crm.contact.read", "crm.contact.create", "crm.contact.update", "crm.contact.import", "crm.deal.read", "crm.deal.create", "crm.activity.read"];
  const linker = await member(shop, "link", "STAFF", ["*"], [...BASE, "crm.company.read", "crm.company.update"]);
  const ro = await member(shop, "ro", "STAFF", ["*"], [...BASE, "crm.company.read"]);
  const noCo = await member(shop, "noco", "STAFF", ["*"], BASE);
  // companies
  const coLinkV = await mkCompany(shop, `ลิงก์เห็น ${rand}`, linker.uid, TA.id); // linker (own) + mgr (TA) + owner
  const coLinkT = await mkCompany(shop, `ลิงก์ปลายทาง ${rand}`, linker.uid, TA.id);
  const coB = await mkCompany(shop, `ทีมบี ${rand}`, shop.uid, TB.id); // owner only (mgr: TB outside unit · staff: not own)
  const vis = async (who: Any, id: string) => !!(await P.crmCompany.findFirst({ where: { AND: [await (await import("@/lib/modules/crm/where" as string)).companyWhere(who.ctx, who.actor), { id }] } }));
  chk("P-premise", (await vis(mgr, coLinkV.id)) && !(await vis(mgr, coB.id)) && (await vis(linker, coLinkV.id)) && !(await vis(linker, coB.id)) && (await vis(owner, coB.id)) && crmCanLinkCompany(mgr.actor),
    `visibility: mgr sees TA not TB · linker sees own not TB · owner all · mgr can link=${crmCanLinkCompany(mgr.actor)}`);

  // ═══════════ R1 · predicate parity per persona × shape ═══════════
  console.log("\n── R1 ──");
  const shapes = async (who: Any, tag: string) => {
    const hidden = await mkCompany(shop, `ซ่อน ${tag} ${rand}`, shop.uid, TB.id);
    const hiddenArch = await mkCompany(shop, `ซ่อนเก็บ ${tag} ${rand}`, shop.uid, TB.id);
    const hiddenMerged = await mkCompany(shop, `ซ่อนรวม ${tag} ${rand}`, shop.uid, TB.id);
    const visArch = await mkCompany(shop, `เห็นเก็บ ${tag} ${rand}`, who.uid, TA.id);
    await P.crmCompany.update({ where: { id: hiddenArch.id }, data: { archivedAt: new Date() } });
    await P.crmCompany.update({ where: { id: hiddenMerged.id }, data: { mergedIntoId: coB.id } });
    await P.crmCompany.update({ where: { id: visArch.id }, data: { archivedAt: new Date() } });
    return [
      ["primary-visible", { companyId: coLinkV.id }],
      ["primary-hidden", { companyId: hidden.id }],
      ["hidden-archived", { companyId: hiddenArch.id }],
      ["hidden-merged", { companyId: hiddenMerged.id }],
      ["visible-archived", { companyId: visArch.id }],
      ["no-primary-hidden-secondary", { companyId: null, extra: [hidden.id] }],
    ] as const;
  };
  const texts = new Set<string>();
  for (const [label, who] of [["owner", owner], ["mgr-unit", mgr], ["linker-own", linker]] as const) {
    let agree = 0;
    const lines: string[] = [];
    const list = await shapes(who, label);
    for (const [shape, opts] of list) {
      const k = await mkContact(shop, `${label}-${shape}`, (who as Any).uid, opts as Any);
      const hid = await CON.isCurrentCompanyHidden((who as Any).ctx, (who as Any).actor, k.companyId);
      const s0 = await snap(shop.tid, k.id);
      const r = await call(() => CON.updateContact((who as Any).ctx, (who as Any).actor, k.id, { companyId: coLinkT.id }));
      const s1 = await snap(shop.tid, k.id);
      const refusedHidden = codeOf(r) === "NOT_FOUND" && r.err?.message === HIDDEN;
      if (refusedHidden) texts.add(r.err.message);
      const ok = hid ? refusedHidden && diff(s0, s1) === "none" : r.ok;
      if (ok) agree += 1;
      lines.push(`${shape}: hidden=${hid} move→${codeOf(r)}${r.ok ? "" : `(${r.err?.message === HIDDEN ? "HIDDEN_MSG" : cut(r.err?.message, 30)})`}`);
    }
    chk(`R1-parity-${label}`, agree === list.length, `${label}: UI predicate ⇔ server (hidden ⇒ NOT_FOUND own text + no writes · visible ⇒ move OK) ${agree}/${list.length} · ${lines.join(" · ")}`);
  }
  {
    // clear variants by the linker: hidden live / hidden archived / hidden merged → same text, zero writes
    const out: string[] = [];
    let allSame = true;
    for (const st of ["live", "archived", "merged"]) {
      const c = await mkCompany(shop, `ล้างซ่อน ${st} ${rand}`, shop.uid, TB.id);
      if (st === "archived") await P.crmCompany.update({ where: { id: c.id }, data: { archivedAt: new Date() } });
      if (st === "merged") await P.crmCompany.update({ where: { id: c.id }, data: { mergedIntoId: coB.id } });
      const k = await mkContact(shop, `ล้าง ${st}`, linker.uid, { companyId: c.id });
      const s0 = await snap(shop.tid, k.id);
      const r = await call(() => CON.updateContact(linker.ctx, linker.actor, k.id, { firstName: `x ${rand}`, companyId: null }));
      const s1 = await snap(shop.tid, k.id);
      allSame = allSame && codeOf(r) === "NOT_FOUND" && r.err?.message === HIDDEN && diff(s0, s1) === "none";
      out.push(`${st}: ${codeOf(r)} ${r.err?.message === HIDDEN ? "HIDDEN_MSG" : cut(r.err?.message, 40)} writes ${diff(s0, s1)}`);
    }
    chk("R1-clear-same-text", allSame && texts.size === 1, `linker clears a hidden live/archived/merged company → ${out.join(" · ")} (want one text, no writes — no liveness oracle)`);
  }
  {
    // what the linker already sees without the new line: the contact DTO's raw companyId, and no hidden name anywhere
    const hidden = await mkCompany(shop, `ซ่อนดีทีโอ ${rand}`, shop.uid, TB.id);
    const k = await mkContact(shop, "ดีทีโอ", linker.uid, { companyId: hidden.id });
    const kNone = await mkContact(shop, "ดีทีโอว่าง", linker.uid);
    const d = (await CON.getContact360(linker.ctx, linker.actor, k.id)) as Any;
    const dn = (await CON.getContact360(linker.ctx, linker.actor, kNone.id)) as Any;
    const dRo = (await CON.getContact360(ro.ctx, ro.actor, (await mkContact(shop, "ดีทีโออาร์โอ", ro.uid, { companyId: hidden.id })).id)) as Any;
    chk("R1-oracle-preexisting", d.contact.companyId === hidden.id && dn.contact.companyId === null && d.company === null && !j(d).includes(hidden.name) && dRo.contact.companyId === hidden.id,
      `contacts.get DTO already exposes companyId=${d.contact.companyId === hidden.id ? "<hidden id>" : d.contact.companyId} (vs null for a contact without company) to the linker and to a read-only role · 360 company=${j(d.company)} · hidden name present=${j(d).includes(hidden.name)} ⇒ "has a hidden company" was already distinguishable; the locked line adds no id/name`);
  }

  // ═══════════ R2 · clear of archived / merged visible company ═══════════
  console.log("\n── R2 ──");
  {
    const res: string[] = [];
    let ok = true;
    for (const st of ["archived", "merged"]) {
      const c = await mkCompany(shop, `เห็น${st} ${rand}`, linker.uid, TA.id);
      const k = await mkContact(shop, `เห็น${st}`, linker.uid, { companyId: c.id });
      await P.crmCompany.update({ where: { id: c.id }, data: st === "archived" ? { archivedAt: new Date() } : { mergedIntoId: coLinkV.id } });
      const s0 = await snap(shop.tid, k.id);
      const r = await call(() => CON.updateContact(linker.ctx, linker.actor, k.id, { firstName: `y ${rand}`, jobTitle: "z", companyId: null }));
      const s1 = await snap(shop.tid, k.id);
      ok = ok && codeOf(r) === "VALIDATION" && diff(s0, s1) === "none";
      res.push(`${st}: ${codeOf(r)} "${cut(r.err?.message, 40)}" writes ${diff(s0, s1)}`);
      const m = await call(() => CON.updateContact(linker.ctx, linker.actor, k.id, { companyId: coLinkT.id }));
      const row = await P.crmContact.findUnique({ where: { id: k.id } });
      ok = ok && m.ok && row.companyId === coLinkT.id;
      res.push(`${st} move-off: ${codeOf(m)} now T=${row.companyId === coLinkT.id}`);
    }
    chk("R2-archived-merged", ok, res.join(" · "));
  }
  {
    // the real company flows: archive (service) and merge (service) never go through updateContact's clear path
    const c = await mkCompany(shop, `เก็บจริง ${rand}`, shop.uid);
    const k = await mkContact(shop, "เก็บจริง", shop.uid, { companyId: c.id });
    const ra = await call(() => CO.archiveCompany(owner.ctx, owner.actor, c.id, { confirm: true, reason: "ทดสอบเก็บถาวรรีวิว" }));
    const row = await P.crmContact.findUnique({ where: { id: k.id } });
    const c1 = await mkCompany(shop, `รวมจาก ${rand}`, shop.uid);
    const c2 = await mkCompany(shop, `รวมเข้า ${rand}`, shop.uid);
    const k2 = await mkContact(shop, "รวมจริง", shop.uid, { companyId: c1.id });
    const rm = await call(() => CO.mergeCompanies(owner.ctx, owner.actor, { keepId: c2.id, mergeId: c1.id, confirm: true, reason: "ทดสอบรวมรีวิว" }));
    const row2 = await P.crmContact.findUnique({ where: { id: k2.id } });
    info("R2-real-flows", `archiveCompany → ${codeOf(ra)} "${cut(ra.err?.message, 60)}" contact cache=${row.companyId === null ? "null" : row.companyId === c.id ? "still archived co" : row.companyId} · mergeCompanies → ${codeOf(rm)} "${cut(rm.err?.message, 60)}" contact cache=${row2.companyId === c2.id ? "keep" : row2.companyId === c1.id ? "drop" : row2.companyId}`);
    chk("R2-archive-flow", ra.ok, `archiveCompany with linked contacts still works → ${codeOf(ra)}`);
  }

  // ═══════════ F5 · echo variants ═══════════
  console.log("\n── F5 ──");
  {
    const rows: string[] = [];
    let ok = true;
    for (const [label, who] of [["owner", owner], ["mgr", mgr], ["linker", linker], ["ro", ro], ["noco", noCo]] as const) {
      const w = who as Any;
      const hid = await mkCompany(shop, `เอคโค ${label} ${rand}`, shop.uid, TB.id);
      const k = await mkContact(shop, `เอคโค ${label}`, w.uid, { companyId: hid.id });
      const d = await DEALS.createDeal(owner.ctx, owner.actor, { pipelineId: shop.pipe.id, title: `เอคโคดีล ${label} ${rand}`, contactId: k.id, companyId: hid.id, ownerUserId: shop.uid });
      const variants: [string, Any][] = [["padded", ` ${hid.id}\t`], ["exact", hid.id]];
      for (const [vn, val] of variants) {
        const r = await call(() => CON.updateContact(w.ctx, w.actor, k.id, { jobTitle: `${vn} ${label}`, companyId: val, moveOpenDeals: true }));
        const row = await P.crmContact.findUnique({ where: { id: k.id } });
        const dd = await P.crmDeal.findUnique({ where: { id: d.id }, select: { companyId: true } });
        const au = (await P.auditLog.findMany({ where: { tenantId: shop.tid, targetId: k.id, action: "crm.contact.update" }, orderBy: { createdAt: "desc" }, take: 1 })) as Any[];
        const keys = (au[0]?.after as Any)?.changedKeys ?? [];
        const good = r.ok && row.companyId === hid.id && dd.companyId === hid.id && !keys.includes("companyId") && row.jobTitle === `${vn} ${label}`;
        ok = ok && good;
        if (!good) rows.push(`${label}/${vn}: ${codeOf(r)} ${cut(r.err?.message, 40)} keys=${j(keys)}`);
      }
      // no company: null / "" / omitted
      const k0 = await mkContact(shop, `ว่าง ${label}`, w.uid);
      for (const v of [null, "", undefined]) {
        const r = await call(() => CON.updateContact(w.ctx, w.actor, k0.id, { jobTitle: `v${String(v)}`, ...(v === undefined ? {} : { companyId: v }) }));
        ok = ok && r.ok;
        if (!r.ok) rows.push(`${label}/none ${j(v)}: ${codeOf(r)}`);
      }
    }
    chk("F5-echo-all-personas", ok, `echo (exact · padded) + jobTitle + moveOpenDeals on a HIDDEN current company, and null/""/omitted on no company, for owner·mgr·linker·ro·noco → OK, company + deal kept, no companyId audit key ${rows.length ? `· failures: ${rows.join(" · ")}` : ""}`);
  }
  {
    // a real change is never an echo: linker moves visible V → T with padding; read-only real change refused
    const k = await mkContact(shop, "เปลี่ยนจริง", linker.uid, { companyId: coLinkV.id });
    const r = await call(() => CON.updateContact(linker.ctx, linker.actor, k.id, { companyId: `  ${coLinkT.id} ` }));
    const row = await P.crmContact.findUnique({ where: { id: k.id } });
    const kc = await mkContact(shop, "ถอดจริง", linker.uid, { companyId: coLinkV.id });
    const rc = await call(() => CON.updateContact(linker.ctx, linker.actor, kc.id, { companyId: "" }));
    const rowc = await P.crmContact.findUnique({ where: { id: kc.id } });
    const kr = await mkContact(shop, "อาร์โอจริง", ro.uid, { companyId: coLinkV.id });
    const s0 = await snap(shop.tid, kr.id);
    const rr = await call(() => CON.updateContact(ro.ctx, ro.actor, kr.id, { jobTitle: "q", companyId: coLinkT.id }));
    const s1 = await snap(shop.tid, kr.id);
    chk("F5-real-change", r.ok && row.companyId === coLinkT.id && rc.ok && rowc.companyId === null && codeOf(rr) === "FORBIDDEN" && diff(s0, s1) === "none",
      `linker padded move V→T → ${codeOf(r)} now T=${row.companyId === coLinkT.id} · linker "" clear → ${codeOf(rc)} now null=${rowc.companyId === null} · read-only real change → ${codeOf(rr)} writes ${diff(s0, s1)}`);
  }

  // ═══════════ F6 · deal card / board / CSV company name for a creator who cannot see it ═══════════
  console.log("\n── F6 ──");
  {
    const hid = await mkCompany(shop, `ชื่อลับดีล ${rand}`, shop.uid, TB.id);
    const k = await mkContact(shop, "ดีลชื่อลับ", noCo.uid, { companyId: hid.id });
    const d = await DEALS.createDeal(noCo.ctx, noCo.actor, { pipelineId: shop.pipe.id, title: `ดีลชื่อลับ ${rand}`, contactId: k.id });
    const lst = await call(() => DEALS.listDeals(noCo.ctx, noCo.actor, {}));
    const card = (lst.v?.items ?? []).find((x: Any) => x.id === d.id);
    const board = await call(() => DEALS.getBoard(noCo.ctx, noCo.actor, { pipelineId: shop.pipe.id }));
    const csv = await call(() => DEALS.exportDeals(noCo.ctx, noCo.actor, {}));
    const d360 = await call(() => DEALS.getDeal360 ? DEALS.getDeal360(noCo.ctx, noCo.actor, d.id) : Promise.resolve(null));
    info("F6-names", `creator without company read: deal.companyId=${d.companyId === hid.id ? "<hidden>" : d.companyId} · list card name=${j(card?.companyName ?? null)} · board has name=${j(board.v ?? null).includes(hid.name)} · CSV has name=${String(csv.v ?? "").includes(hid.name)} (${codeOf(csv)}) · deal 360 has name=${j(d360.v ?? null).includes(hid.name)} (${codeOf(d360)})`);
    chk("F6-default-kept", d.companyId === hid.id, "server default still the contact's company (behaviour unchanged)");
  }

  // ═══════════ DT · DATETIME ═══════════
  console.log("\n── DT ──");
  {
    const F = MEM.fields;
    const fctx = { ...owner.ctx, objectKey: "contact", actor: owner.actor };
    const sec = await F.createSection(fctx, { key: `qcR${rand.replace(/[^a-z]/g, "")}`.slice(0, 30), label: "เวลารีวิว" });
    await F.createField(fctx, { sectionId: sec.id, key: "rvAt", label: "เวลารีวิว", type: "DATETIME" });
    await F.createField(fctx, { sectionId: sec.id, key: "rvOn", label: "วันรีวิว", type: "DATE" });
    const cases: [string, string][] = [
      ["midnight", "2026-10-08T17:00:00.000Z"],
      ["ms", "2026-10-08T17:30:45.678Z"],
      ["year-end", "2026-12-31T17:59:00.000Z"],
      ["pre-1970", "1965-03-01T03:00:00.000Z"],
    ];
    const made: Any[] = [];
    for (const [n, iso] of cases) {
      const k = await mkContact(shop, `เวลา-${n}`, shop.uid);
      await CON.updateContact(owner.ctx, owner.actor, k.id, { fields: { rvAt: iso, rvOn: "2026-10-09" } });
      made.push({ n, iso, k });
    }
    const kEmpty = await mkContact(shop, "เวลา-ว่าง", shop.uid);
    const csv = await CON.exportContacts(owner.ctx, owner.actor, { confirm: true, reason: "รีวิวรูปแบบวันเวลา" });
    const rows = parseCsv(csv);
    const hdr = rows[0] ?? [];
    const iAt = hdr.indexOf("เวลารีวิว");
    const iOn = hdr.indexOf("วันรีวิว");
    const cellOf = (first: string) => (rows.find((r) => r[0] === first) ?? [])[iAt] ?? "<missing>";
    const out: string[] = [];
    let rt = true;
    for (const m of made) {
      const cell = cellOf(`เวลา-${m.n}`);
      const back = new Date(cell).toISOString();
      const same = back === m.iso;
      const sameSec = back.slice(0, 19) === m.iso.slice(0, 19);
      rt = rt && sameSec;
      out.push(`${m.n}: ${cell} → ${same ? "exact" : sameSec ? "same second (ms dropped)" : `DIFFERENT ${back}`}`);
    }
    const emptyCell = cellOf("เวลา-ว่าง");
    chk("DT-export-edges", rt && emptyCell === "" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/.test(cellOf("เวลา-midnight")) && cellOf("เวลา-midnight").startsWith("2026-10-09T00:00:00"),
      `${out.join(" · ")} · empty="${emptyCell}"`);
    info("DT-export-date", `DATE column for those rows = ${j(rows.filter((r) => String(r[0]).startsWith("เวลา-")).map((r) => r[iOn]))}`);
    // byte identity of the shared formatter with the two old implementations
    const oldTypes = (iso: string) => { const t = Date.parse(iso); if (Number.isNaN(t)) return iso; return new Date(t).toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }); };
    const oldPortal = (d: Date) => d.toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
    const inputs = [...cases.map((c) => c[1]), "2026-10-09T00:30:00+07:00", "2026-02-29T00:00:00Z", "not a date", "", "2026-10-08"];
    const mism: string[] = [];
    for (const s of inputs) if (UID.formatThaiDateTimeFull(s) !== oldTypes(s)) mism.push(`types "${s}": ${UID.formatThaiDateTimeFull(s)} vs ${oldTypes(s)}`);
    for (const s of cases.map((c) => c[1])) if (UID.formatThaiDateTimeFull(new Date(s)) !== oldPortal(new Date(s))) mism.push(`portal ${s}`);
    chk("DT-byte-identical", mism.length === 0, `formatThaiDateTimeFull == old thaiDateTimeText (strings incl. invalid/empty/date-only) and == old portal format (Dates) · mismatches ${j(mism)}`);
    // importing an OLD export cell ("YYYY-MM-DD HH:mm", UTC wall time) after this change, per server TZ
    const prevTz = process.env.TZ;
    const imported: string[] = [];
    for (const tz of ["UTC", "Asia/Bangkok"]) {
      process.env.TZ = tz;
      const nm = `เก่า-${tz.replace("/", "")}-${rand}`;
      const imp = await call(() => CON.importContacts(owner.ctx, owner.actor, { rows: [{ ชื่อ: nm, เวลา: "2026-10-08 17:30" }], mapping: { ชื่อ: "firstName", เวลา: "f.rvAt" }, options: { onDuplicate: "skip", source: "IMPORT" } }));
      const c = await P.crmContact.findFirst({ where: { tenantId: shop.tid, firstName: nm } });
      const v = c ? await P.customRecordValue.findFirst({ where: { tenantId: shop.tid, recordId: c.id, field: { key: "rvAt" } } }).catch(() => null) : null;
      imported.push(`${tz}: ${codeOf(imp)} failed=${imp.v?.result?.failed} stored=${v?.valueDate ? new Date(v.valueDate).toISOString() : null}`);
    }
    if (prevTz === undefined) delete process.env.TZ; else process.env.TZ = prevTz;
    info("DT-old-cell-import", `old export cell "2026-10-08 17:30" (meant 17:30Z) imported now → ${imported.join(" · ")} (importer unchanged: zone-less = server-local)`);
    chk("DT-old-cell-still-accepted", imported.every((x) => / OK failed=0 /.test(x)), "files exported before the change still import (no rejection)");
  }

  // ═══════════ IM · import entry kinds at the caps ═══════════
  console.log("\n── IM ──");
  {
    // 510 rows that each need a new company (the linker cannot create companies → 510 notes) + 3 empty rows at the END (real failures)
    const rows: Any[] = [];
    for (let i = 1; i <= 510; i += 1) rows.push({ ชื่อ: `ใหญ่${i} ${rand}`, บริษัท: `ใหม่ใหญ่ ${i} ${rand}` });
    for (let i = 0; i < 3; i += 1) rows.push({ ชื่อ: "", บริษัท: "" });
    const t0 = Date.now();
    const r = await call(() => CON.importContacts(linker.ctx, linker.actor, { rows, mapping: { ชื่อ: "firstName", บริษัท: "company" }, options: { onDuplicate: "skip", source: "IMPORT" } }));
    const ms = Date.now() - t0;
    const e = (r.v?.result?.errors ?? []) as Any[];
    const firstErr = e.slice(0, 3).every((x) => x.kind === "error" && x.row >= 511);
    const job = r.ok ? ((await CON.getImportJob(linker.ctx, linker.actor, r.v.jobId)) as Any).result : null;
    chk("IM-cap-failures-first", r.ok && r.v.result.failed === 3 && r.v.result.created === 510 && e.length === 500 && firstErr && e.slice(3).every((x) => x.kind === "note") && job?.errors?.length === 50 && job.errors.slice(0, 3).every((x: Any) => x.kind === "error"),
      `513-row file (510 notes + 3 failures last) → ${codeOf(r)} created=${r.v?.result?.created} failed=${r.v?.result?.failed} entries=${e.length} first3=${j(e.slice(0, 3).map((x) => [x.row, x.kind]))} · job entries=${job?.errors?.length} job first3 kinds=${j(job?.errors?.slice(0, 3).map((x: Any) => x.kind))} · ${ms} ms`);
    // a legacy audit row (no kind) is read as errors
    const jobId = `legacy-${rand}`;
    await P.auditLog.create({ data: { tenantId: shop.tid, actorType: "USER", actorId: shop.uid, action: "crm.contact.import", targetType: "CrmSystem", targetId: shop.S, after: { jobId, status: "DONE", created: 1, updated: 0, skipped: 0, candidates: 0, failed: 1, errors: [{ row: 2, message: "แถวนี้ว่าง" }] } } });
    const lj = (await CON.getImportJob(owner.ctx, owner.actor, jobId)) as Any;
    chk("IM-legacy", lj.result.errors.length === 1 && lj.result.errors[0].kind === "error" && lj.result.errors[0].row === 2, `legacy audit row without kind → ${j(lj.result.errors)}`);
    const { readFileSync } = await import("node:fs");
    const p1 = readFileSync("src/app/app/sys/[id]/crm/contacts/_components/ContactImportPanel.tsx", "utf8");
    const p2 = readFileSync("src/app/app/sys/[id]/crm/contacts/_components/ContactListTools.tsx", "utf8");
    const lab = (t: string) => /e\.kind === "note" \? " \(หมายเหตุ\)" : ""/.test(t);
    chk("IM-ui-both-screens", lab(p1) && lab(p2), "both import result lists label notes '(หมายเหตุ)'");
  }
} catch (e) {
  chk("FATAL", false, String((e as Error)?.stack ?? e).slice(0, 900));
}
await done("probe-cf10-review");
