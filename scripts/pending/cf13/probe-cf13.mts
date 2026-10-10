// C5.5-fix10 probe (builder) — FX7-1 · FX7-3 · owner question 5
//   NM   deal surfaces name a company / contact only when the VIEWER can see it (one rule = companyWhere / contactWhere, the deal 360 rule):
//        list · board · CSV (UI + REST op) · deal 360 parity · per persona (owner · unit-limited manager · own-records staff ·
//        read-only-company staff · staff without company read) · no hidden name anywhere in the payload · roll-ups unchanged ·
//        batched (company reads per page) · positive controls: owner + viewers WITH visibility see what they saw before (normalised DTO
//        dump compared byte-for-byte with the RED run's dump when CF13_BASELINE is set)
//   SW   the sweep sites fixed in this card (see ledger/wo-notes/crm-C5.5-fix10.md)
//   DT   DATETIME export keeps milliseconds when the stored value has them (export → import exact) · whole-second cells byte-identical
//   DA   DATE on contact 360 = the record-page formatter ("9 ต.ค. 2569") · value + export unchanged ("2026-10-09")
// QC2 only (ep-cool-shadow) · throwaway tenants `qc-cf13-*` (swept in done()) · network blocked.
// Run: bash scripts/pending/cf13/run-probe.sh <logname> [baseline-json]
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
const { fixture } = (await import("./_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const fx = await fixture("p");
const { P, chk, call, mkShop, mkUser, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const codeOf = (r: Any) => (r.ok ? "OK" : String(r.err?.code ?? r.err?.name ?? "ERR"));
const rand = TAG.slice(-8);
const info = (id: string, msg: string) => console.log(`  ℹ️  [${id}] ${msg}`);
const HIDDEN_CONTACT = "ผู้ติดต่อที่มองไม่เห็น";

const MEM = (await import("@/lib/modules/member" as string)) as Any;
const { toMemberActor } = MEM;
const CON = (await import("@/lib/modules/crm/contacts" as string)) as Any;
const DEALS = (await import("@/lib/modules/crm/deals" as string)) as Any;
const WHERE = (await import("@/lib/modules/crm/where" as string)) as Any;
const UID = (await import("@/lib/ui/date" as string)) as Any;
const fmtDate = (v: string): string => (typeof UID.formatThaiDateFull === "function" ? UID.formatThaiDateFull(v) : "<formatThaiDateFull missing>");
const TYPES = (await import("@/components/crm/objects/types" as string)) as Any;
const extra = (await import("./probe-cf13-sweep.mts" as string)) as Any;

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
async function mkContact(shop: Any, first: string, ownerUserId: string, opts: { companyId?: string | null; teamId?: string | null; score?: number } = {}) {
  const name = `${first} ${TAG}`;
  const party = await P.party.create({ data: { tenantId: shop.tid, name, kind: "PERSON" } });
  const k = await P.crmContact.create({ data: { tenantId: shop.tid, systemId: shop.S, name, firstName: first, partyId: party.id, ownerUserId, teamId: opts.teamId ?? null, companyId: opts.companyId ?? null, score: opts.score ?? 0 } });
  if (opts.companyId) await P.crmCompanyContact.create({ data: { tenantId: shop.tid, companyId: opts.companyId, contactId: k.id, isPrimary: true } });
  return k;
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
  const TA = await P.team.create({ data: { tenantId: shop.tid, name: `TA ${TAG}`, unitIds: ["u-a"] } });
  const TB = await P.team.create({ data: { tenantId: shop.tid, name: `TB ${TAG}`, unitIds: ["u-b"] } });
  const BASE = ["crm.contact.read", "crm.contact.export", "crm.sequence.enroll", "crm.deal.read", "crm.deal.create", "crm.deal.update", "crm.deal.export", "crm.activity.read", "crm.report.view"];
  const mgr = await member(shop, "mgr", "MANAGER", ["u-a"], []); // unit-limited manager (ALL within unit u-a)
  const staff = await member(shop, "own", "STAFF", ["*"], [...BASE, "crm.company.read"]); // own-records staff (no team ⇒ TEAM = own)
  const ro = await member(shop, "ro", "STAFF", ["*"], [...BASE, "crm.company.read"]); // read-only-company role (company read, no company write)
  const noCo = await member(shop, "noco", "STAFF", ["*"], BASE); // no company read key at all
  const personas = [["owner", owner], ["mgr", mgr], ["staff", staff], ["ro", ro], ["noco", noCo]] as const;

  // companies: hidden (TB · owner) · visible-to-team-A (TA · owned by staff) · owned by ro
  const coHid = await mkCompany(shop, `บริษัทลับ ${rand}`, shop.uid, TB.id);
  const coA = await mkCompany(shop, `บริษัทเอ ${rand}`, staff.uid, TA.id);
  const coRo = await mkCompany(shop, `บริษัทอาร์โอ ${rand}`, ro.uid, null);
  // contacts: owned by owner (no team · hidden from the staff personas) · owned by staff · owned by ro · team B (hidden from mgr)
  const kOwner = await mkContact(shop, "เจ้าของถือ", shop.uid, { companyId: coHid.id, score: 77 });
  const kStaff = await mkContact(shop, "สตาฟถือ", staff.uid, { companyId: coA.id, score: 12 });
  const kRo = await mkContact(shop, "อาร์โอถือ", ro.uid, { companyId: coRo.id, score: 5 });
  const kTB = await mkContact(shop, "ทีมบีถือ", shop.uid, { teamId: TB.id, score: 40 });
  // deals: every persona sees every deal (owned by staff · collaborators = ro + noco · no team ⇒ mgr ALL-in-unit sees teamless rows)
  const mkDeal = async (title: string, contactId: string, companyId: string | null, stage = 0, value = 100_00) =>
    P.crmDeal.create({ data: { tenantId: shop.tid, systemId: shop.S, pipelineId: shop.pipe.id, stageId: shop.stages[stage].id, title: `${title} ${rand}`, contactId, companyId, ownerUserId: staff.uid, collaboratorUserIds: [ro.uid, noCo.uid], valueSatang: value, kind: "OPEN" } });
  const dHid = await mkDeal("ดีลหนึ่ง", kOwner.id, coHid.id, 0, 300_00);
  const dA = await mkDeal("ดีลสอง", kStaff.id, coA.id, 1, 200_00);
  const dRo = await mkDeal("ดีลสาม", kRo.id, coRo.id, 2, 150_00);
  const dNone = await mkDeal("ดีลสี่", kTB.id, null, 0, 50_00);
  const DEALS_ALL = [dHid, dA, dRo, dNone];
  const companyOf = new Map<string, Any>([[coHid.id, coHid], [coA.id, coA], [coRo.id, coRo]]);
  const contactOf = new Map<string, Any>([[kOwner.id, kOwner], [kStaff.id, kStaff], [kRo.id, kRo], [kTB.id, kTB]]);
  const rollBefore = j(await P.crmCompany.findMany({ where: { tenantId: shop.tid }, orderBy: { id: "asc" }, select: { id: true, openDealCount: true, wonValueSatang: true, outstandingSatang: true } }));

  // ground truth = the viewer's own company / contact visibility (companyWhere / contactWhere — the deal 360 rule)
  const visCo = async (who: Any) => new Set((await P.crmCompany.findMany({ where: { AND: [await WHERE.companyWhere(who.ctx, who.actor), { tenantId: shop.tid }] }, select: { id: true } })).map((r: Any) => r.id));
  const visK = async (who: Any) => new Set((await P.crmContact.findMany({ where: { AND: [await WHERE.contactWhere(who.ctx, who.actor), { tenantId: shop.tid }] }, select: { id: true } })).map((r: Any) => r.id));

  console.log("\n── NM · deal list / board / CSV / 360 per persona ──");
  const dump: Record<string, Any> = {};
  const norm = (v: Any) => {
    let s = j(v);
    for (const [id, lbl] of [[shop.tid, "<tenant>"], [shop.S, "<sys>"], [shop.pipe.id, "<pipe>"], ...shop.stages.map((st: Any, i: number) => [st.id, `<stage${i}>`]), [coHid.id, "<coHid>"], [coA.id, "<coA>"], [coRo.id, "<coRo>"], [kOwner.id, "<kOwner>"], [kStaff.id, "<kStaff>"], [kRo.id, "<kRo>"], [kTB.id, "<kTB>"], [dHid.id, "<dHid>"], [dA.id, "<dA>"], [dRo.id, "<dRo>"], [dNone.id, "<dNone>"], [shop.uid, "<owner>"], [mgr.uid, "<mgr>"], [staff.uid, "<staff>"], [ro.uid, "<ro>"], [noCo.uid, "<noco>"], [TA.id, "<TA>"], [TB.id, "<TB>"], [TAG, "<TAG>"], [rand, "<rand>"]] as [string, string][]) s = s.split(id).join(lbl);
    return s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "<ts>").replace(/"\d{4}-\d{2}-\d{2}"/g, '"<day>"');
  };
  for (const [label, who] of personas) {
    const cos = await visCo(who);
    const ks = await visK(who);
    const lst = await call(() => DEALS.listDeals(who.ctx, who.actor, { pageSize: 50 }));
    const board = await call(() => DEALS.getBoard(who.ctx, who.actor, { pipelineId: shop.pipe.id }));
    const csv = await call(() => DEALS.exportDeals(who.ctx, who.actor, {}));
    const items: Any[] = lst.v?.items ?? [];
    const bcards: Any[] = (board.v?.columns ?? []).flatMap((c: Any) => c.cards);
    const rows = parseCsv(String(csv.v ?? ""));
    const hdr = rows[0] ?? [];
    const iCo = hdr.indexOf("บริษัท");
    const iK = hdr.indexOf("ผู้ติดต่อ");
    const bad: string[] = [];
    const seenIds = new Set(items.map((x) => x.id));
    for (const d of DEALS_ALL) {
      if (!seenIds.has(d.id)) bad.push(`list misses ${d.title}`);
      const wantCo = d.companyId && cos.has(d.companyId) ? companyOf.get(d.companyId).name : null;
      const k = contactOf.get(d.contactId);
      const wantK = ks.has(d.contactId) ? k.name : HIDDEN_CONTACT;
      const wantScore = ks.has(d.contactId) ? k.score : 0;
      const card = items.find((x) => x.id === d.id);
      const bc = bcards.find((x) => x.id === d.id);
      const row = rows.find((r) => r[0] === d.title);
      for (const [where, c] of [["list", card], ["board", bc]] as const) {
        if (!c) { bad.push(`${where} missing ${d.title}`); continue; }
        if (c.companyName !== wantCo) bad.push(`${where} ${d.title} company=${j(c.companyName)} want ${j(wantCo)}`);
        if (c.contactName !== wantK) bad.push(`${where} ${d.title} contact=${j(c.contactName)} want ${j(wantK)}`);
        if (c.score !== wantScore) bad.push(`${where} ${d.title} score=${c.score} want ${wantScore}`);
        if (c.companyId !== d.companyId) bad.push(`${where} ${d.title} companyId changed`);
      }
      if (!row) bad.push(`csv missing ${d.title}`);
      else {
        if (row[iCo] !== (wantCo ?? "")) bad.push(`csv ${d.title} company=${j(row[iCo])} want ${j(wantCo ?? "")}`);
        if (row[iK] !== wantK) bad.push(`csv ${d.title} contact=${j(row[iK])} want ${j(wantK)}`);
      }
      // deal 360 parity (the reference rule)
      const d360 = await call(() => DEALS.getDeal360(who.ctx, who.actor, d.id));
      if (!d360.ok) bad.push(`360 ${d.title} ${codeOf(d360)}`);
      else {
        if ((d360.v.company?.name ?? null) !== (card?.companyName ?? null)) bad.push(`360≠card company ${d.title}`);
        if (d360.v.contact.name !== card?.contactName) bad.push(`360≠card contact ${d.title}`);
      }
    }
    // no hidden name anywhere in what this viewer receives
    const blob = `${j(lst.v)}\n${j(board.v)}\n${String(csv.v ?? "")}`;
    for (const [id, c] of companyOf) if (!cos.has(id) && blob.includes(c.name)) bad.push(`hidden company name "${c.name}" in payload`);
    for (const [id, k] of contactOf) if (!ks.has(id) && blob.includes(k.name)) bad.push(`hidden contact name "${k.name}" in payload`);
    // board totals (roll-up per column) are unchanged by visibility of names: every deal counted
    const cnt = (board.v?.columns ?? []).reduce((s: number, c: Any) => s + c.count, 0);
    const sum = (board.v?.columns ?? []).reduce((s: number, c: Any) => s + c.sumSatang, 0);
    if (cnt !== 4 || sum !== 700_00) bad.push(`board totals ${cnt}/${sum}`);
    const hiddenCos = [...companyOf.keys()].filter((id) => !cos.has(id)).length;
    const hiddenKs = [...contactOf.keys()].filter((id) => !ks.has(id)).length;
    chk(`NM-${label}`, lst.ok && board.ok && csv.ok && bad.length === 0, `${codeOf(lst)}/${codeOf(board)}/${codeOf(csv)} · sees ${3 - hiddenCos}/3 companies, ${4 - hiddenKs}/4 contacts · ${bad.length ? bad.join(" · ") : "names = viewer visibility on list/board/CSV, = deal 360, no hidden name in payload, totals 4 deals / ฿700"}`);
    dump[label] = { list: norm(lst.v), board: norm(board.v), csv: norm(String(csv.v ?? "").split("\n").sort()), hiddenCos, hiddenKs };
  }
  // persona shapes the brief asks for actually occur (otherwise the NM checks prove nothing)
  chk("NM-shapes", dump.owner.hiddenCos === 0 && dump.owner.hiddenKs === 0 && dump.mgr.hiddenCos >= 1 && dump.staff.hiddenCos >= 1 && dump.staff.hiddenKs >= 1 && dump.noco.hiddenCos === 3,
    `hidden companies/contacts: ${personas.map(([l]) => `${l} ${dump[l].hiddenCos}/${dump[l].hiddenKs}`).join(" · ")}`);
  const rollAfter = j(await P.crmCompany.findMany({ where: { tenantId: shop.tid }, orderBy: { id: "asc" }, select: { id: true, openDealCount: true, wonValueSatang: true, outstandingSatang: true } }));
  const dealsAfter = await P.crmDeal.findMany({ where: { tenantId: shop.tid }, select: { id: true, companyId: true } });
  chk("NM-rollups", rollBefore === rollAfter && DEALS_ALL.every((d) => dealsAfter.find((x: Any) => x.id === d.id)?.companyId === d.companyId), "company roll-up columns and every deal.companyId unchanged by reading");

  // REST op deals.export / deals.list (same service) — the API path a key user takes
  {
    const ops = (await import("@/lib/modules/crm/api/ops/deals" as string).catch(() => null)) as Any;
    info("NM-rest", ops ? `REST deal ops module loaded (${Object.keys(ops).slice(0, 6).join(",")}) — they call listDeals/getBoard/exportDeals (see SW)` : "REST deal ops module not found at api/ops/deals");
  }

  // batched: company reads on one page do not grow with the number of companies
  {
    let nCo = 0;
    let nK = 0;
    const origCo = P.crmCompany.findMany;
    const origK = P.crmContact.findMany;
    let patched = true;
    try {
      P.crmCompany.findMany = (...args: Any[]) => { nCo += 1; return origCo.apply(P.crmCompany, args); };
      P.crmContact.findMany = (...args: Any[]) => { nK += 1; return origK.apply(P.crmContact, args); };
    } catch { patched = false; }
    if (patched && P.crmCompany.findMany !== origCo) {
      const more: Any[] = [];
      for (let i = 0; i < 6; i += 1) {
        const c = await mkCompany(shop, `บริษัทชุด${i} ${rand}`, shop.uid, i % 2 ? TB.id : TA.id);
        more.push(await mkDeal(`ดีลชุด${i}`, kStaff.id, c.id));
      }
      nCo = 0; nK = 0;
      const r = await call(() => DEALS.listDeals(mgr.ctx, mgr.actor, { pageSize: 50 }));
      const a1 = [nCo, nK];
      nCo = 0; nK = 0;
      const b = await call(() => DEALS.getBoard(mgr.ctx, mgr.actor, { pipelineId: shop.pipe.id }));
      const a2 = [nCo, nK];
      nCo = 0; nK = 0;
      const e = await call(() => DEALS.exportDeals(mgr.ctx, mgr.actor, {}));
      const a3 = [nCo, nK];
      P.crmCompany.findMany = origCo;
      P.crmContact.findMany = origK;
      chk("NM-batched", r.ok && b.ok && e.ok && [a1, a2, a3].every(([c, k]) => c! <= 1 && k! <= 1), `10 deals / 9 companies on the page → company reads list=${a1[0]} board=${a2[0]} csv=${a3[0]} · contact reads ${a1[1]}/${a2[1]}/${a3[1]} (≤ 1 each = one visibility query per page)`);
      for (const d of more) await P.crmDeal.delete({ where: { id: d.id } });
    } else info("NM-batched", "could not wrap the prisma delegate — not measured");
  }

  // positive control: owner + viewers WITH visibility get what they got before (RED dump vs GREEN dump)
  {
    const out = process.env.CF13_DUMP;
    const base = process.env.CF13_BASELINE;
    const sig = Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, createHash("sha256").update(j(v)).digest("hex").slice(0, 16)]));
    if (out) { mkdirSync(out.replace(/\/[^/]+$/, ""), { recursive: true }); writeFileSync(out, j(dump)); }
    if (base && existsSync(base)) {
      const old = JSON.parse(readFileSync(base, "utf8"));
      const same = (l: string) => j(old[l]) === j(dump[l]);
      // owner sees everything ⇒ byte-identical · personas: only rows whose company/contact they cannot see may differ
      const diffs: string[] = [];
      for (const [l] of personas) {
        if (same(l)) continue;
        const a = old[l];
        const b = dump[l];
        diffs.push(`${l}: list ${a.list === b.list ? "=" : "≠"} board ${a.board === b.board ? "=" : "≠"} csv ${j(a.csv) === j(b.csv) ? "=" : "≠"}`);
      }
      chk("NM-control-owner-identical", same("owner"), `owner DTOs (list · board · CSV, ids/timestamps normalised) byte-identical to the RED run: ${same("owner")} · personas that changed: ${diffs.join(" · ") || "none"}`);
      // a viewer WITH visibility of a deal's company + contact gets that card byte-identical (per card)
      const cardDiffs: string[] = [];
      for (const [l] of personas) {
        const a = JSON.parse(old[l].list)?.items ?? [];
        const b = JSON.parse(dump[l].list)?.items ?? [];
        for (const cb of b) {
          const ca = a.find((x: Any) => x.id === cb.id);
          const hiddenBefore = !ca;
          if (hiddenBefore) continue;
          const sees = cb.companyName === ca.companyName && cb.contactName === ca.contactName;
          if (sees && j(ca) !== j(cb)) cardDiffs.push(`${l} ${cb.id}`);
          if (!sees && cb.companyName !== null && cb.companyName !== ca.companyName) cardDiffs.push(`${l} ${cb.id} visible name changed`);
        }
      }
      chk("NM-control-visible-cards-identical", cardDiffs.length === 0, `every card whose company + contact the viewer can see is byte-identical to the RED run · ${cardDiffs.join(" · ") || "0 differences"}`);
    } else info("NM-control", `no baseline (${base ?? "unset"}) — signatures ${j(sig)}`);
  }

  // ═══════════ SW · sweep sites fixed in this card ═══════════
  if (extra?.run) await extra.run({ fx, shop, owner, mgr, staff, ro, noCo, personas, coHid, coA, coRo, kOwner, kStaff, kRo, kTB, dHid, dA, dRo, dNone, visCo, visK, info, j, codeOf, member, mkCompany, mkContact, parseCsv, HIDDEN_CONTACT });

  // ═══════════ DT · DATETIME export precision ═══════════
  console.log("\n── DT ──");
  {
    const F = MEM.fields;
    const fctx = { ...owner.ctx, objectKey: "contact", actor: owner.actor };
    const sec = await F.createSection(fctx, { key: `qcP${rand.replace(/[^a-z]/g, "")}`.slice(0, 30), label: "เวลาทดสอบ" });
    await F.createField(fctx, { sectionId: sec.id, key: "pAt", label: "เวลาทดสอบ", type: "DATETIME" });
    await F.createField(fctx, { sectionId: sec.id, key: "pOn", label: "วันทดสอบ", type: "DATE" });
    // what the UI sends (thaiInputToIso of a datetime-local value) vs what API / import may send
    const uiValue = TYPES.thaiInputToIso("2026-10-09T00:30");
    const cases: [string, string][] = [["ui", uiValue], ["ms", "2026-10-08T17:30:45.678Z"], ["ms1", "2026-10-08T17:30:45.001Z"], ["sec", "2026-10-08T17:30:45.000Z"], ["pre1970ms", "1965-03-01T03:00:00.250Z"]];
    const made: Any[] = [];
    for (const [n, v] of cases) {
      const k = await mkContact(shop, `เวลา-${n}`, shop.uid);
      const r = await call(() => CON.updateContact(owner.ctx, owner.actor, k.id, { fields: { pAt: v, pOn: "2026-10-09" } }));
      const stored = await P.customRecordValue.findFirst({ where: { tenantId: shop.tid, recordId: k.id, field: { key: "pAt" } } });
      made.push({ n, v, k, ok: r.ok, stored: stored?.valueDate ? new Date(stored.valueDate).toISOString() : null });
    }
    info("DT-stored", made.map((m) => `${m.n}: sent ${m.v} → stored ${m.stored}`).join(" · "));
    chk("DT-ui-whole-seconds", made[0].stored?.endsWith(":00.000Z"), `the UI path (datetime-local → thaiInputToIso "${uiValue}") stores whole seconds (${made[0].stored}) · API/import can store ms (${made[1].stored})`);
    const csv = await CON.exportContacts(owner.ctx, owner.actor, { confirm: true, reason: "ตรวจความละเอียดเวลา" });
    const rows = parseCsv(csv);
    const hdr = rows[0] ?? [];
    const iAt = hdr.indexOf("เวลาทดสอบ");
    const iOn = hdr.indexOf("วันทดสอบ");
    const cellOf = (n: string) => (rows.find((r) => r[0] === `เวลา-${n}`) ?? [])[iAt] ?? "<missing>";
    const oldCell = (iso: string) => `${new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 19)}+07:00`; // fix7 format
    const cells = made.map((m) => ({ ...m, cell: cellOf(m.n) }));
    info("DT-cells", cells.map((c) => `${c.n}=${c.cell}`).join(" · "));
    const wholeSame = cells.filter((c) => c.stored?.endsWith(".000Z")).every((c) => c.cell === oldCell(c.stored));
    const exact = cells.every((c) => c.stored && new Date(c.cell).toISOString() === c.stored);
    chk("DT-export-exact", exact && wholeSame, `every cell parses back to the stored instant exactly (ms included) · whole-second cells byte-identical to the fix7 form: ${wholeSame}`);
    // export → import round trip through the real importer (TZ UTC and Asia/Bangkok)
    const prevTz = process.env.TZ;
    const back: string[] = [];
    let rtOk = true;
    for (const tz of ["UTC", "Asia/Bangkok"]) {
      process.env.TZ = tz;
      for (const c of cells) {
        const nm = `กลับ-${c.n}-${tz.replace("/", "")}-${rand}`;
        const imp = await call(() => CON.importContacts(owner.ctx, owner.actor, { rows: [{ ชื่อ: nm, เวลา: c.cell }], mapping: { ชื่อ: "firstName", เวลา: "f.pAt" }, options: { onDuplicate: "skip", source: "IMPORT" } }));
        const k = await P.crmContact.findFirst({ where: { tenantId: shop.tid, firstName: nm } });
        const v = k ? await P.customRecordValue.findFirst({ where: { tenantId: shop.tid, recordId: k.id, field: { key: "pAt" } } }) : null;
        const got = v?.valueDate ? new Date(v.valueDate).toISOString() : null;
        if (got !== c.stored) { rtOk = false; back.push(`${tz} ${c.n}: ${codeOf(imp)} got ${got} want ${c.stored}`); }
      }
    }
    if (prevTz === undefined) delete process.env.TZ; else process.env.TZ = prevTz;
    chk("DT-roundtrip", rtOk, `export cell → importContacts → stored instant identical for ${cells.length} values × 2 server TZ · ${back.join(" · ") || "all exact"}`);
    // DATE column untouched by this card
    chk("DA-export-unchanged", cells.every((c) => (rows.find((r) => r[0] === `เวลา-${c.n}`) ?? [])[iOn] === "2026-10-09"), `DATE export cells = ${j(cells.map((c) => (rows.find((r) => r[0] === `เวลา-${c.n}`) ?? [])[iOn]))}`);
    // ═══════════ DA · DATE display on contact 360 ═══════════
    console.log("\n── DA ──");
    const c360 = await CON.getContact360(owner.ctx, owner.actor, made[0].k.id);
    const f = c360.fields.sections.flatMap((s: Any) => s.fields).find((x: Any) => x.key === "pOn");
    const rec = TYPES.displayValue("2026-10-09", [], "DATE");
    chk("DA-360-display", f?.display === rec && rec === "9 ต.ค. 2569" && f?.value === "2026-10-09", `contact 360 display=${j(f?.display)} · record page=${j(rec)} · value=${j(f?.value)}`);
    // the shared formatter is byte-identical to the record page's previous inline code for every day 1960–2040 + odd inputs
    const oldRec = (v: string) => new Date(`${v.slice(0, 10)}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    let mism = 0;
    let n = 0;
    for (let t = Date.UTC(1960, 0, 1); t <= Date.UTC(2040, 11, 31); t += 86_400_000) {
      const ymd = new Date(t).toISOString().slice(0, 10);
      n += 1;
      if (fmtDate(ymd) !== oldRec(ymd) || TYPES.displayValue(ymd, [], "DATE") !== oldRec(ymd)) mism += 1;
    }
    const odd = ["2026-10-09T00:00:00.000Z", "2024-02-29"].filter((s) => fmtDate(s) !== oldRec(s));
    chk("DA-byte-identical", mism === 0 && odd.length === 0, `${n} days 1960–2040 + 2 odd inputs: formatThaiDateFull == old record-page code, mismatches ${mism + odd.length} · non-date text kept: ${j(fmtDate("ไม่ใช่วันที่"))}`);
    // the empty DATE still renders "—" on the page (display "" → page fallback)
    const k0 = await mkContact(shop, "วันว่าง", shop.uid);
    const c0 = await CON.getContact360(owner.ctx, owner.actor, k0.id);
    const f0 = c0.fields.sections.flatMap((s: Any) => s.fields).find((x: Any) => x.key === "pOn");
    chk("DA-empty", f0 && f0.display === "" && f0.value === null, `empty DATE display=${j(f0?.display)} value=${j(f0?.value)}`);
  }
} catch (e) {
  chk("CRASH", false, String((e as Error)?.stack ?? e).slice(0, 600));
}
await done("probe-cf13");
