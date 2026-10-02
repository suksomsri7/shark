// C5.5-fix7 probe (builder) — small LOW findings left by the fix6 / fix3b reviews (contacts · companies · deals)
//   F1  R2F-1  a linker on a contact whose PRIMARY company is outside their visibility: no dead picker (explanatory line instead) ·
//              the server refusal has its own clear text · same text for hidden live / hidden archived (no new oracle) · nothing written
//   F2  R2F-2  clearing an ARCHIVED (visible) current company: refused BEFORE any write (was: contact row + audit + outbox, then
//              VALIDATION from removeContact) · move-off still OK · the legitimate detach routes (restore → clear · real archive) work
//   F5  F6-5   an unchanged companyId is never a change, for any user (read users echoing an invisible current company) ·
//              the pre-read/tx race cannot record a false "companyId changed" audit/event
//   F6  F6-6   /deals/new default company: kept (roll-ups) · nothing new returned to a creator who cannot see the company ·
//              the empty option of the deal form says what it does
//   DT  RV-3   contact 360 shows DATETIME custom fields in Thai time (= staff record page) · the export is unambiguous ISO +07:00 that the
//              importer reads back to the same instant even on a Thai-time server · portal uses the same helper
//   IM  R2F-3  import result entries carry kind "error" | "note" · real failures listed first (never crowded out of the first 50)
// Rows that describe behaviour (not a pass/fail claim) print as ℹ️ INFO.
// QC2 only (ep-cool-shadow) · throwaway tenants `qc-cf10-*` (swept in done()) · network blocked.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf10/probe-cf10.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
const { fixture } = (await import("./_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const fx = await fixture("p");
const { P, chk, call, mkShop, mkUser, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const cut = (v: unknown, n = 140) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const codeOf = (r: Any) => (r.ok ? "OK" : String(r.err?.code ?? r.err?.name ?? "ERR"));
const rand = TAG.slice(-8);
const info = (id: string, msg: string) => console.log(`  ℹ️  [${id}] ${msg}`);
const src = (p: string) => readFileSync(p, "utf8").replace(/\s+/g, " ");

const { toMemberActor } = (await import("@/lib/modules/member" as string)) as Any;
const MEM = (await import("@/lib/modules/member" as string)) as Any;
const CON = (await import("@/lib/modules/crm/contacts" as string)) as Any;
const CO = (await import("@/lib/modules/crm/companies" as string)) as Any;
const DEALS = (await import("@/lib/modules/crm/deals" as string)) as Any;
const { crmCanLinkCompany } = (await import("@/lib/modules/crm/access" as string)) as Any;
const TYPES = (await import("@/components/crm/objects/types" as string)) as Any;

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
const lastUpdateKeys = async (tid: string, contactId: string): Promise<string[]> => {
  const a = await P.auditLog.findFirst({ where: { tenantId: tid, action: "crm.contact.update", targetId: contactId }, orderBy: { createdAt: "desc" } });
  return ((a?.after as Any)?.changedKeys ?? []) as string[];
};
/** minimal RFC-4180 CSV reader (quoted cells, "" escape, CRLF) */
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

// ── React SSR of the 360 menu with the page's own wiring ──
const React = (await import("react" as string)) as Any;
const R = (React.default ?? React) as Any;
const RDS = (await import("react-dom/server" as string)) as Any;
const ctxMod = (await import("next/dist/shared/lib/app-router-context.shared-runtime.js" as string)) as Any;
const C3 = (await import("@/app/app/sys/[id]/crm/contacts/_components/Contact360Actions" as string)) as Any;
const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
/** mirror of contacts/[contactId]/page.tsx ContactMenu wiring (fix7: primary-hidden lock via contacts.isCurrentCompanyHidden) */
async function sheet(shop: Any, who: Any, contactId: string): Promise<string> {
  const d = (await CON.getContact360(who.ctx, who.actor, contactId)) as Any;
  const c = await P.crmContact.findUnique({ where: { id: contactId } });
  const canLink = crmCanLinkCompany(who.actor);
  const hidden = canLink && typeof CON.isCurrentCompanyHidden === "function" ? await CON.isCurrentCompanyHidden(who.ctx, who.actor, c.companyId) : false;
  const canCompany = canLink && !hidden;
  const orig = R.useState;
  let calls = 0;
  R.useState = (init: unknown) => { calls += 1; const p = orig(init); return calls === 2 ? ["edit", p[1]] : p; };
  try {
    return String(RDS.renderToStaticMarkup(R.createElement(ctxMod.AppRouterContext.Provider, { value: router }, R.createElement(C3.ContactMenu, {
      systemId: shop.S, owners: [],
      can: { update: true, assign: true, merge: false, archive: false, company: canCompany },
      contact: { id: c.id, firstName: c.firstName, lastName: "", phone: "", email: "", jobTitle: "", ownerUserId: c.ownerUserId, lifecycleStage: "LEAD", leadStatus: "NEW", tags: [], archived: false,
        companyId: canCompany ? c.companyId : null, companyName: d.company?.name ?? null, companyIsPrimary: !!d.company && d.company.id === c.companyId, companyLocked: canLink && hidden },
    }))));
  } finally {
    R.useState = orig;
  }
}

try {
  const shop = await mkShop("a");
  const BASE = ["crm.contact.read", "crm.contact.create", "crm.contact.update", "crm.contact.import", "crm.deal.read", "crm.deal.create", "crm.activity.read"];
  const linker = await staff(shop, "link", [...BASE, "crm.company.read", "crm.company.update"]); // no company.create
  const full = await staff(shop, "full", [...BASE, "crm.company.read", "crm.company.update", "crm.company.create"]);
  const ro = await staff(shop, "ro", [...BASE, "crm.company.read"]);
  const noCo = await staff(shop, "noco", BASE);
  const owner = { actor: shop.owner, ctx: shop.ctx, uid: shop.uid };
  const coLink = await mkCompany(shop, `บริษัทลิงก์ ${rand}`, linker.uid);
  const coFull = await mkCompany(shop, `บริษัทฟูล ${rand}`, full.uid);
  const coRo = await mkCompany(shop, `บริษัทอาร์โอ ${rand}`, ro.uid);
  const coHidden = await mkCompany(shop, `บริษัทลับ ${rand}`, shop.uid); // owner's: invisible to every STAFF
  const vis = async (who: Any, id: string) => (await call(() => CO.assertCompanyVisible(CO_CTX(who), who.actor, id))).ok;
  const CO_CTX = (who: Any) => who.ctx;
  chk("P-premise", crmCanLinkCompany(linker.actor) && !crmCanLinkCompany(ro.actor) && !crmCanLinkCompany(noCo.actor) && (await vis(linker, coLink.id)) && !(await vis(linker, coHidden.id)) && (await vis(owner, coHidden.id)),
    "keys: linker can link · ro/noCo cannot · coHidden invisible to linker, visible to owner · coLink visible to linker");

  // ═══════════ F1 · R2F-1 primary company hidden from a linker ═══════════
  console.log("\n── F1 · R2F-1 ──");
  {
    const kP = await mkContact(shop, "หลักลับรอง", linker.uid, { companyId: coHidden.id, extra: [coLink.id] });
    const h = await sheet(shop, linker, kP.id);
    chk("F1-ui-no-dead-picker", h.includes("contact-edit-modal") || h.includes("contact-edit-firstName") ? !h.includes("contact-pick-edit-company-q") && h.includes("contact-edit-company-locked") && !h.includes(coHidden.name) : false,
      `linker, primary hidden: picker shown=${h.includes("contact-pick-edit-company-q")} · locked line=${h.includes("contact-edit-company-locked")} "${cut((/data-testid="contact-edit-company-locked"[^>]*>([^<]*)/.exec(h) ?? [])[1], 90)}" · hidden name in html=${h.includes(coHidden.name)} (want no picker · explanatory line · no hidden name)`);
    const s0 = await snap(shop.tid, kP.id);
    const r = await call(() => CON.updateContact(linker.ctx, linker.actor, kP.id, { companyId: coLink.id }));
    const s1 = await snap(shop.tid, kP.id);
    const msg = String(r.err?.message ?? "");
    chk("F1-srv-own-text", codeOf(r) === "NOT_FOUND" && /นอกขอบเขต/.test(msg) && !/รีเฟรช/.test(msg) && !msg.includes(coHidden.name) && diff(s0, s1) === "none",
      `linker promotes its visible secondary, primary hidden → ${codeOf(r)} "${cut(msg, 110)}" · writes: ${diff(s0, s1)} (want NOT_FOUND · own text about visibility, no "refresh" · no hidden name · none)`);
    // oracle: same refusal for a hidden live vs a hidden archived current company
    const coQ = await mkCompany(shop, `ลับเก็บ ${rand}`, shop.uid);
    const kQ = await mkContact(shop, "ลับเก็บ", linker.uid, { companyId: coQ.id });
    await P.crmCompany.update({ where: { id: coQ.id }, data: { archivedAt: new Date() } });
    const rq = await call(() => CON.updateContact(linker.ctx, linker.actor, kQ.id, { companyId: coLink.id }));
    const rc = await call(() => CON.updateContact(linker.ctx, linker.actor, kQ.id, { companyId: null }));
    chk("F1-oracle-same-text", codeOf(r) === codeOf(rq) && r.err?.message === rq.err?.message && r.err?.message === rc.err?.message,
      `hidden live (move) / hidden archived (move) / hidden archived (clear) → ${codeOf(r)} / ${codeOf(rq)} / ${codeOf(rc)} · same text=${r.err?.message === rq.err?.message && rq.err?.message === rc.err?.message}`);
    // controls: linker on a contact whose primary IS visible keeps the picker and can move; owner can move the hidden-primary contact
    const kV = await mkContact(shop, "หลักเห็น", linker.uid, { companyId: coLink.id });
    const hv = await sheet(shop, linker, kV.id);
    chk("F1-control-linker-visible", hv.includes("contact-pick-edit-company-q") && !hv.includes("contact-edit-company-locked"), "linker, primary visible → picker, no locked line");
    const ho = await sheet(shop, owner, kP.id);
    const ro2 = await call(() => CON.updateContact(owner.ctx, owner.actor, kP.id, { companyId: coLink.id }));
    const rowP = await P.crmContact.findUnique({ where: { id: kP.id } });
    chk("F1-control-owner", ho.includes("contact-pick-edit-company-q") && !ho.includes("contact-edit-company-locked") && ro2.ok && rowP.companyId === coLink.id,
      `owner on the same contact → picker=${ho.includes("contact-pick-edit-company-q")} · promote secondary ${codeOf(ro2)} → primary=${rowP.companyId === coLink.id ? "coLink" : rowP.companyId}`);
    const kR = await mkContact(shop, "อาร์โอหลักลับ", ro.uid, { companyId: coHidden.id, extra: [coRo.id] });
    const hr = await sheet(shop, ro, kR.id);
    chk("F1-control-readonly-line", hr.includes("contact-edit-company-readonly") && hr.includes(`บริษัท: ${coRo.name}`) && !hr.includes("contact-edit-company-locked") && !hr.includes(coHidden.name),
      "read-only role keeps the fix6 r2 read-only line ('บริษัท: <visible secondary>'), no locked line, no hidden name");
    const hn = await sheet(shop, noCo, (await mkContact(shop, "ไม่มีสิทธิ์อ่าน", noCo.uid, { companyId: coHidden.id })).id);
    chk("F1-control-noread", !hn.includes("contact-edit-company-locked") && !hn.includes("contact-edit-company-readonly") && !hn.includes("contact-pick-edit-company-q"), "no company read → no picker, no line (unchanged)");
    const p360 = src("src/app/app/sys/[id]/crm/contacts/[contactId]/page.tsx");
    chk("F1-wiring", /isCurrentCompanyHidden\(/.test(p360) && /company: crmCanLinkCompany\(actor\) && !primaryCompanyHidden/.test(p360) && /companyLocked:/.test(p360),
      "page computes primaryCompanyHidden via contacts.isCurrentCompanyHidden and passes can.company / companyLocked from it");
  }

  // ═══════════ F2 · R2F-2 clear an ARCHIVED visible current company ═══════════
  console.log("\n── F2 · R2F-2 ──");
  {
    const coArch = await mkCompany(shop, `บริษัทเก็บ ${rand}`, full.uid);
    const kA = await mkContact(shop, "ล้างเก็บถาวร", full.uid, { companyId: coArch.id });
    await P.crmCompany.update({ where: { id: coArch.id }, data: { archivedAt: new Date() } }); // stale cache, as in the review repro
    const s0 = await snap(shop.tid, kA.id);
    const r = await call(() => CON.updateContact(full.ctx, full.actor, kA.id, { firstName: `ล้าง ${rand}`, companyId: null }));
    const s1 = await snap(shop.tid, kA.id);
    chk("F2-archived-clear-atomic", codeOf(r) === "VALIDATION" && diff(s0, s1) === "none",
      `clear an ARCHIVED (visible) current company + firstName → ${codeOf(r)} "${cut(r.err?.message, 90)}" · writes: ${diff(s0, s1)} (want VALIDATION · none — refused before any write)`);
    const r2 = await call(() => CON.updateContact(full.ctx, full.actor, kA.id, { companyId: coFull.id }));
    const row2 = await P.crmContact.findUnique({ where: { id: kA.id } });
    chk("F2-control-move-off", r2.ok && row2.companyId === coFull.id, `move off the archived company → ${codeOf(r2)} · now coFull=${row2.companyId === coFull.id}`);
    // legitimate detach: owner restores the company, then the editor clears it
    const kB = await mkContact(shop, "กู้แล้วถอด", full.uid, { companyId: coArch.id });
    const rs = await call(() => CO.restoreCompany(owner.ctx, owner.actor, coArch.id, { confirm: true, reason: "กู้คืนเพื่อถอดผู้ติดต่อ" }));
    const rb = await call(() => CON.updateContact(full.ctx, full.actor, kB.id, { companyId: null }));
    const rowB = await P.crmContact.findUnique({ where: { id: kB.id } });
    const linkB = await P.crmCompanyContact.findFirst({ where: { contactId: kB.id, companyId: coArch.id } });
    chk("F2-control-restore-then-clear", rs.ok && rb.ok && rowB.companyId === null && !!linkB?.endedAt, `restore ${codeOf(rs)} → clear ${codeOf(rb)} · companyId=${rowB.companyId} · link ended=${!!linkB?.endedAt}`);
    // the real archive service never leaves the cache on an archived company ⇒ clearing afterwards is a no-op
    const coArch2 = await mkCompany(shop, `บริษัทเก็บจริง ${rand}`, full.uid);
    const kC = await mkContact(shop, "เก็บจริง", full.uid, { companyId: coArch2.id });
    const ra = await call(() => CO.archiveCompany(owner.ctx, owner.actor, coArch2.id, { confirm: true, reason: "ทดสอบเก็บถาวร" }));
    const rowC0 = await P.crmContact.findUnique({ where: { id: kC.id } });
    const rcl = await call(() => CON.updateContact(full.ctx, full.actor, kC.id, { companyId: null, jobTitle: `หลังเก็บ ${rand}` }));
    chk("F2-control-real-archive", ra.ok && rowC0.companyId === null && rcl.ok, `archiveCompany (service) → contact cache ${rowC0.companyId} (want null) · clear afterwards ${codeOf(rcl)}`);
    // plain clear of a live visible company
    const kD = await mkContact(shop, "ล้างปกติ", full.uid, { companyId: coFull.id });
    const rd = await call(() => CON.updateContact(full.ctx, full.actor, kD.id, { companyId: null }));
    const rowD = await P.crmContact.findUnique({ where: { id: kD.id } });
    chk("F2-control-live-clear", rd.ok && rowD.companyId === null, `clear a live visible company → ${codeOf(rd)} · companyId=${rowD.companyId}`);
  }

  // ═══════════ F5 · F6-5 echo is never a change ═══════════
  console.log("\n── F5 · F6-5 ──");
  {
    for (const [label, who] of [["ro", ro], ["linker", linker]] as const) {
      const k = await mkContact(shop, `เอคโค่ ${label}`, (who as Any).uid, { companyId: coHidden.id });
      const s0 = await snap(shop.tid, k.id);
      const r = await call(() => CON.updateContact((who as Any).ctx, (who as Any).actor, k.id, { jobTitle: `echo ${rand}`, companyId: coHidden.id, moveOpenDeals: true }));
      const s1 = await snap(shop.tid, k.id);
      const row = await P.crmContact.findUnique({ where: { id: k.id } });
      const keys = r.ok ? await lastUpdateKeys(shop.tid, k.id) : [];
      chk(`F5-echo-invisible-${label}`, r.ok && row.jobTitle === `echo ${rand}` && row.companyId === coHidden.id && j(keys) === j(["jobTitle"]) && s0.links === s1.links,
        `${label} (company read) echoes its contact's current INVISIBLE company + jobTitle → ${codeOf(r)} "${cut(r.err?.message, 60)}" · jobTitle saved=${row.jobTitle === `echo ${rand}`} · company kept=${row.companyId === coHidden.id} · audit keys ${j(keys)} (want OK · ["jobTitle"])`);
    }
    // race: someone moves the company between the service's pre-read and its transaction; a read user's echo of the OLD id must not be
    //   recorded as "companyId changed" (no link was touched)
    const kR = await mkContact(shop, "เรซ", ro.uid, { companyId: coRo.id });
    const origTx = P.$transaction;
    let armed = true;
    let patched = false;
    try {
      P.$transaction = async (...args: Any[]) => {
        if (armed) {
          armed = false;
          await P.$executeRawUnsafe(`UPDATE "CrmContact" SET "companyId" = $1 WHERE "id" = $2`, coHidden.id, kR.id);
        }
        return origTx.apply(P, args);
      };
      patched = P.$transaction !== origTx;
    } catch {
      patched = false;
    }
    if (patched) {
      const r = await call(() => CON.updateContact(ro.ctx, ro.actor, kR.id, { jobTitle: `race ${rand}`, companyId: coRo.id }));
      P.$transaction = origTx;
      const keys = r.ok ? await lastUpdateKeys(shop.tid, kR.id) : [];
      const ev = await P.outboxEvent.findMany({ where: { tenantId: shop.tid, type: "crm.contact.updated" }, orderBy: { createdAt: "desc" }, take: 5 });
      const evKeys = ((ev.find((e: Any) => (e.payload as Any)?.contactId === kR.id)?.payload as Any)?.changedKeys ?? []) as string[];
      chk("F5-race-no-false-audit", r.ok && !keys.includes("companyId") && !evKeys.includes("companyId"),
        `read user echoes the OLD company while another writer moved it in between → ${codeOf(r)} "${cut(r.err?.message, 60)}" · audit keys ${j(keys)} · event keys ${j(evKeys)} (want no "companyId")`);
    } else {
      info("F5-race-no-false-audit", "prisma.$transaction could not be wrapped in this process — race not simulated");
    }
    // control: an ACTUAL change by a read-only user is still refused before any write
    const kX = await mkContact(shop, "เปลี่ยนจริง", ro.uid, { companyId: coRo.id });
    const s0 = await snap(shop.tid, kX.id);
    const rx = await call(() => CON.updateContact(ro.ctx, ro.actor, kX.id, { jobTitle: `x ${rand}`, companyId: coFull.id }));
    const s1 = await snap(shop.tid, kX.id);
    chk("F5-control-real-change-refused", codeOf(rx) === "FORBIDDEN" && diff(s0, s1) === "none", `read-only user REALLY changes the company → ${codeOf(rx)} · writes: ${diff(s0, s1)}`);
    const kU = await mkContact(shop, "ตัวใหญ่", noCo.uid, { companyId: coRo.id });
    const ru = await call(() => CON.updateContact(noCo.ctx, noCo.actor, kU.id, { jobTitle: `u ${rand}`, companyId: coRo.id.toUpperCase() }));
    chk("F5-control-upper-not-echo", codeOf(ru) === "FORBIDDEN", `no-read user sends UPPER(current id) → ${codeOf(ru)} (not an echo)`);
  }

  // ═══════════ F6 · F6-6 /deals/new default company ═══════════
  console.log("\n── F6 · F6-6 ──");
  {
    const kD = await mkContact(shop, "ดีลบริษัทลับ", noCo.uid, { companyId: coHidden.id });
    const before = (await P.crmCompany.findUnique({ where: { id: coHidden.id } })).openDealCount;
    const r = await call(() => DEALS.createDeal(noCo.ctx, noCo.actor, { pipelineId: shop.pipe.id, title: `ดีล ${rand}`, contactId: kD.id, valueSatang: 1000 }));
    const after = (await P.crmCompany.findUnique({ where: { id: coHidden.id } })).openDealCount;
    chk("F6-default-kept", r.ok && r.v.companyId === coHidden.id && after === before + 1,
      `no-read creator, contact at a company they cannot see → ${codeOf(r)} · deal company = contact's (${r.v?.companyId === coHidden.id}) · company openDealCount ${before}→${after} (roll-up)`);
    const dto = r.v ?? {};
    const g = r.ok ? await call(() => DEALS.getDeal360(noCo.ctx, noCo.actor, dto.id)) : { ok: false };
    const txt = j(dto) + j(g.v?.company ?? null);
    chk("F6-no-name-back", r.ok && !("companyName" in dto) && g.ok && g.v.company === null && !txt.includes(coHidden.name),
      `create returns no company name (keys: ${cut(Object.keys(dto).filter((x) => /compan/i.test(x)).join(","), 60)}) · deal 360 company=${g.ok ? j(g.v.company) : `ERR ${codeOf(g)}`} · hidden name anywhere=${txt.includes(coHidden.name)}`);
    const lst = await call(() => DEALS.listDeals(noCo.ctx, noCo.actor, {}));
    const card = (lst.v?.items ?? lst.v?.cards ?? []).find((x: Any) => x.id === dto.id);
    info("F6-board-card", `listDeals card for the creator → companyName ${j(card?.companyName ?? null)} (pre-existing deal-wide rule: deal cards/CSV name the deal's company via system scope — owner question)`);
    const nd = src("src/app/app/sys/[id]/crm/deals/_components/NewDealForm.tsx");
    chk("F6-label", !/<option value="">ไม่ผูกบริษัท<\/option>/.test(nd) && /<option value="">[^<]*บริษัทหลักของผู้ติดต่อ[^<]*<\/option>/.test(nd),
      "deal form's empty company option says it uses the contact's primary company (it never meant 'no company')");
  }

  // ═══════════ DT · RV-3 DATETIME on the contact page and in the export ═══════════
  console.log("\n── DT · RV-3 ──");
  {
    const F = MEM.fields;
    const fctx = { ...owner.ctx, objectKey: "contact", actor: owner.actor };
    const sec = await F.createSection(fctx, { key: `qcT${rand.replace(/[^a-z]/g, "")}`.slice(0, 30), label: "เวลา" });
    await F.createField(fctx, { sectionId: sec.id, key: "qcAt", label: "นัดหมายเมื่อ", type: "DATETIME" });
    await F.createField(fctx, { sectionId: sec.id, key: "qcOn", label: "วันเริ่ม", type: "DATE" });
    const ISO = "2026-10-09T00:30:00+07:00"; // = 2026-10-08T17:30Z
    const k = await mkContact(shop, "วันเวลา", shop.uid);
    await CON.updateContact(owner.ctx, owner.actor, k.id, { fields: { qcAt: ISO, qcOn: "2026-10-09" } });
    const d = (await CON.getContact360(owner.ctx, owner.actor, k.id)) as Any;
    const f = d.fields.sections.flatMap((s: Any) => s.fields).find((x: Any) => x.key === "qcAt");
    const fd = d.fields.sections.flatMap((s: Any) => s.fields).find((x: Any) => x.key === "qcOn");
    const staffPage = TYPES.displayValue(new Date(ISO).toISOString(), [], "DATETIME");
    chk("DT-360-thai", f?.display === staffPage && /2569/.test(String(f?.display)) && /00:30/.test(String(f?.display)),
      `contact 360 DATETIME display "${f?.display}" · staff record page "${staffPage}" (want equal, Thai time)`);
    info("DT-360-date", `contact 360 DATE display "${fd?.display}" (unchanged; the staff page shows "${TYPES.displayValue("2026-10-09", [], "DATE")}")`);
    const csv = await CON.exportContacts(owner.ctx, owner.actor, { confirm: true, reason: "ตรวจรูปแบบวันเวลา" });
    const rows = parseCsv(csv);
    const hdr = rows[0] ?? [];
    const iAt = hdr.indexOf("นัดหมายเมื่อ");
    const iOn = hdr.indexOf("วันเริ่ม");
    const line = rows.find((rr) => rr[0] === "วันเวลา") ?? [];
    const cell = line[iAt] ?? "";
    chk("DT-export-iso-th", cell === ISO, `export DATETIME cell "${cell}" (want "${ISO}" — Thai wall time with its own offset)`);
    chk("DT-export-date-unchanged", (line[iOn] ?? "") === "2026-10-09", `export DATE cell "${line[iOn]}" (want "2026-10-09", unchanged)`);
    // round trip: import the exported cell back on a server running in Thai time
    const prevTz = process.env.TZ;
    process.env.TZ = "Asia/Bangkok";
    const tzOk = new Date("2026-10-08 17:30").toISOString() === "2026-10-08T10:30:00.000Z";
    const imp = await call(() => CON.importContacts(owner.ctx, owner.actor, { rows: [{ ชื่อ: `กลับเข้า ${rand}`, เวลา: cell }], mapping: { ชื่อ: "firstName", เวลา: "f.qcAt" }, options: { onDuplicate: "skip", source: "IMPORT" } }));
    if (prevTz === undefined) delete process.env.TZ; else process.env.TZ = prevTz;
    const back = await P.crmContact.findFirst({ where: { tenantId: shop.tid, firstName: `กลับเข้า ${rand}` } });
    const v = back ? await P.customRecordValue.findFirst({ where: { tenantId: shop.tid, recordId: back.id, field: { key: "qcAt" } } }).catch(() => null) : null;
    const got = v?.valueDate ? new Date(v.valueDate).toISOString() : null;
    chk("DT-roundtrip-thai-server", tzOk && imp.ok && got === new Date(ISO).toISOString(),
      `TZ premise ${tzOk} · import exported "${cell}" with TZ=Asia/Bangkok → ${codeOf(imp)} errors ${cut(j(imp.v?.result?.errors ?? []), 120)} · stored ${got} (want ${new Date(ISO).toISOString()})`);
    const portalSrc = src("src/lib/modules/crm/portal.ts");
    const typesSrc = src("src/components/crm/objects/types.ts");
    const conSrc = src("src/lib/modules/crm/contacts.ts");
    const one = (t: string) => /import \{[^}]*formatThaiDateTimeFull[^}]*\} from "@\/lib\/ui\/date"/.test(t);
    chk("DT-one-helper", one(portalSrc) && one(typesSrc) && one(conSrc) && !/PORTAL_DATETIME_FMT/.test(portalSrc) && !/hour: "2-digit"/.test(typesSrc + portalSrc),
      "portal.ts, contacts.ts and the staff record page take formatThaiDateTimeFull from lib/ui/date (no copied format options)");
    // equivalence of the portal's old format and the shared helper (control: same text)
    const fmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" };
    const samples = ["2026-10-08T17:30:00Z", "2026-01-01T00:00:00Z", "2026-12-31T16:59:00Z", "2027-02-28T23:15:00Z"];
    chk("DT-control-portal-equal", samples.every((s) => new Date(s).toLocaleString("th-TH", fmt) === TYPES.thaiDateTimeText(s)), "old portal format options = shared helper text on 4 instants");
  }

  // ═══════════ IM · R2F-3 notes vs failures ═══════════
  console.log("\n── IM · R2F-3 ──");
  {
    const rows: Any[] = [];
    for (let i = 1; i <= 55; i += 1) rows.push({ ชื่อ: `นำเข้า${i} ${rand}`, อีเมล: `im${i}-${rand}@imp.test`, บริษัท: `ใหม่ ${i} ${rand}` }); // linker cannot create ⇒ note per row
    for (let i = 56; i <= 60; i += 1) rows.push({ ชื่อ: "", อีเมล: "", บริษัท: `ว่าง ${i}` }); // real failures (empty row)
    const r = await call(() => CON.importContacts(linker.ctx, linker.actor, { rows, mapping: { ชื่อ: "firstName", อีเมล: "email", บริษัท: "company" }, options: { onDuplicate: "skip", source: "IMPORT" } }));
    const res = r.v?.result ?? {};
    const errs = (res.errors ?? []) as Any[];
    const first50 = errs.slice(0, 50);
    const failRows = [56, 57, 58, 59, 60];
    info("IM-shape", `${codeOf(r)} created=${res.created} failed=${res.failed} entries=${errs.length} · first entry ${cut(j(errs[0]), 120)} · kinds ${j([...new Set(errs.map((e) => e.kind))])}`);
    chk("IM-kind", r.ok && errs.length > 0 && errs.every((e) => e.kind === "error" || e.kind === "note") && errs.filter((e) => e.kind === "error").length === res.failed && errs.filter((e) => e.kind === "note").length === 55,
      `every entry has kind · errors=${errs.filter((e) => e.kind === "error").length} (=failed ${res.failed}) · notes=${errs.filter((e) => e.kind === "note").length} (want 55)`);
    chk("IM-failures-first", r.ok && res.failed === 5 && failRows.every((n) => first50.some((e) => e.row === n && /ว่าง/.test(e.message))),
      `all 5 real failures inside the first 50 entries the UI shows → rows ${j(first50.filter((e) => failRows.includes(e.row)).map((e) => e.row))} (positions ${j(errs.map((e, i) => (failRows.includes(e.row) ? i : -1)).filter((i) => i >= 0))})`);
    chk("IM-compat", errs.every((e) => typeof e.row === "number" && typeof e.message === "string"), "entries still carry row + message (additive change)");
    const job = r.ok ? ((await CON.getImportJob(linker.ctx, linker.actor, r.v.jobId)) as Any).result : null;
    chk("IM-job-failures-kept", !!job && job.failed === 5 && failRows.every((n) => (job.errors as Any[]).some((e) => e.row === n && e.kind === "error")),
      `getImportJob (audit keeps the first 50) still lists the 5 failures with kind "error" → ${j((job?.errors ?? []).filter((e: Any) => failRows.includes(e.row)).map((e: Any) => [e.row, e.kind]))}`);
    const ui = src("src/app/app/sys/[id]/crm/contacts/_components/ContactImportPanel.tsx") + src("src/app/app/sys/[id]/crm/contacts/_components/ContactListTools.tsx");
    chk("IM-ui-label", (ui.match(/e\.kind === "note"/g) ?? []).length >= 2, "both import result lists label notes apart from failures");
  }
} catch (e) {
  chk("FATAL", false, String((e as Error)?.stack ?? e).slice(0, 900));
}
await done("probe-cf10");
