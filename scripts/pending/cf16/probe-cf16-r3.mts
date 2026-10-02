// C5.5-fix12 ROUND 3 probe (builder) — RV12r-1 (web card-scan accept) · RV12r-2 (mobile mobileErrorOf)
//   A scanned card whose phone belongs to a contact the scanner cannot see: `calls.acceptLeadProposal` throws the neutral
//   DUPLICATE (round 1). The plan cap throws LIMIT. Both must reach the person as the service's Thai text — web action via
//   `contactRefusalOf` (pure helper the action's failOf uses), mobile via `mobileErrorOf` → 409 — not "try again" / 500.
//   No hidden name / phone / e-mail / company / id in what the person gets. Controls: a card whose match the scanner CAN see
//   is still accepted (force, as before) · the owner (sees the match) still accepts · RATE_LIMITED unchanged (429).
// QC2 only (ep-cool-shadow) · throwaway tenant `qc-cf16-r3-*` (swept in done()) + its rate buckets.
// Run: bash scripts/pending/cf16/run-r2.sh <logname> pending/cf16/probe-cf16-r3
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
const { fixture } = (await import("./_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const fx = await fixture("r3");
const { P, chk, call, mkShop, mkUser, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const cut = (v: unknown, n = 90) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const codeOf = (r: Any) => (r.ok ? "OK" : String(r.err?.code ?? r.err?.name ?? "ERR"));
const rand = TAG.slice(-8);

const { toMemberActor } = (await import("@/lib/modules/member" as string)) as Any;
const CALLS = (await import("@/lib/modules/crm/calls" as string)) as Any;
const SHARED = (await import("@/lib/modules/crm/contacts-shared" as string)) as Any;
const MOBILE = (await import("@/lib/modules/crm/mobile" as string)) as Any;
const HIDDEN = SHARED.CONTACT_DUPLICATE_HIDDEN_MSG as string;
const LIM = SHARED.CONTACT_IDENT_RATE.limit as number;
const GENERIC_WEB = "บันทึกไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว";
const refusal = (e: unknown) => (typeof SHARED.contactRefusalOf === "function" ? SHARED.contactRefusalOf(e) : null);
let seq = Math.floor(Math.random() * 1e6);
const newPhone = () => `08${String(10_000_000 + (seq++ % 89_999_999)).slice(0, 8)}`;
const PREFIXES: string[] = [];

try {
  const shop = await mkShop("a");
  PREFIXES.push(`crm:contact:ident:${shop.tid}:`);
  const owner = { uid: shop.uid, actor: shop.owner, ctx: shop.ctx };
  const uid = await mkUser("-s1");
  const m = await P.membership.create({ data: { userId: uid, tenantId: shop.tid, role: "STAFF", unitAccess: ["*"], permissions: { "crm.contact.read": true, "crm.contact.create": true, "crm.contact.update": true }, acceptedAt: new Date() } });
  const s1 = { uid, actor: toMemberActor(uid, m), ctx: { tenantId: shop.tid, systemId: shop.S, actorUserId: uid } };
  const mkContact = async (first: string, ownerUserId: string, o: { phone?: string; email?: string; companyId?: string; text?: string } = {}) => {
    const name = `${first} ${TAG}`;
    const party = await P.party.create({ data: { tenantId: shop.tid, name, kind: "PERSON" } });
    return P.crmContact.create({ data: { tenantId: shop.tid, systemId: shop.S, name, firstName: first, partyId: party.id, ownerUserId, phone: o.phone ?? null, email: o.email ?? null, companyId: o.companyId ?? null, company: o.text ?? null } });
  };
  const proposal = (name: string, phone: string) => P.aiProposal.create({ data: { tenantId: shop.tid, conversationId: `crm:card:${rand}:${seq++}`, kind: CALLS.LEAD_PROPOSAL_KIND, summary: "นามบัตร", payload: { systemId: shop.S, name: `${name} ${rand}`, phone }, expiresAt: new Date(Date.now() + 3_600_000) } });
  const rows = (p: string) => P.crmContact.count({ where: { tenantId: shop.tid, phone: p } });

  // hidden: the owner's contact (s1 = own records only) with phone + e-mail + company
  const coParty = await P.party.create({ data: { tenantId: shop.tid, name: `บริษัทลับสแกน ${rand}`, kind: "COMPANY" } });
  const coH = await P.crmCompany.create({ data: { tenantId: shop.tid, systemId: shop.S, partyId: coParty.id, name: `บริษัทลับสแกน ${rand}`, ownerUserId: shop.uid } });
  const pH = newPhone();
  const eH = `scan-hid-${rand}@qc.invalid`;
  const kH = await mkContact("ลับสแกน", shop.uid, { phone: pH, email: eH, companyId: coH.id, text: coH.name });
  const secrets = [kH.id, kH.name, "ลับสแกน", pH, eH, coH.name, coH.id];
  const leaks = (v: unknown) => secrets.filter((x) => j(v).includes(x));

  // static: the web action's failOf routes service refusals through the helper (the action itself needs a request session)
  {
    const src = readFileSync("src/lib/modules/crm/calls-actions.ts", "utf8");
    const body = src.slice(src.indexOf("function failOf("), src.indexOf("\n}\n", src.indexOf("function failOf(")));
    chk("R3-WEB-wired", /contactRefusalOf\(e\)/.test(body) && body.indexOf("contactRefusalOf(e)") < body.indexOf(GENERIC_WEB), "calls-actions failOf calls contactRefusalOf(e) before the generic text");
  }

  // ── hidden duplicate (RV12r-1 web · RV12r-2 mobile) ──
  console.log("\n── DUP ──");
  {
    const p = await proposal("สแกนชนลับ", pH);
    const r = await call(() => CALLS.acceptLeadProposal(s1.ctx, s1.actor, p.id));
    const web = refusal(r.err);
    const mob = MOBILE.mobileErrorOf(r.err);
    const pr = await P.aiProposal.findUnique({ where: { id: p.id }, select: { status: true } });
    const l = leaks({ web, mob });
    chk("R3-WEB-dup-hidden", !r.ok && codeOf(r) === "DUPLICATE" && web?.code === "DUPLICATE" && web?.status === 409 && web?.message === HIDDEN && !("duplicates" in (web ?? {})) && l.length === 0,
      `STAFF accepts a card whose phone is a hidden contact's → service ${codeOf(r)} · web action gets ${j(web ? { code: web.code, status: web.status } : null)} "${cut(web?.message)}" · leaks ${j(l)}`);
    chk("R3-MOB-dup-hidden", mob.status === 409 && mob.error === "duplicate" && mob.message === HIDDEN && l.length === 0 && pr.status === "PENDING" && (await rows(pH)) === 1,
      `mobileErrorOf → ${mob.status} ${mob.error} "${cut(mob.message)}" · proposal ${pr.status} · rows with that phone ${await rows(pH)}`);
    await call(() => CALLS.rejectLeadProposal(s1.ctx, s1.actor, p.id));
  }

  // ── controls: visible match still accepted (force, as before) · owner (sees the hidden one) still accepted ──
  console.log("\n── CONTROL ──");
  {
    const pV = newPhone();
    await mkContact("เห็นสแกน", s1.uid, { phone: pV });
    const pv = await proposal("สแกนชนที่เห็น", pV);
    const rv = await call(() => CALLS.acceptLeadProposal(s1.ctx, s1.actor, pv.id));
    const po = await proposal("เจ้าของสแกน", pH);
    const ro = await call(() => CALLS.acceptLeadProposal(owner.ctx, owner.actor, po.id));
    chk("R3-visible-control", rv.ok && typeof rv.v?.contactId === "string" && (await rows(pV)) === 2 && ro.ok && (await rows(pH)) === 2,
      `visible match (STAFF) → ${codeOf(rv)} rows ${await rows(pV)} (duplicate created, as before) · owner on the hidden one → ${codeOf(ro)} rows ${await rows(pH)}`);
  }

  // ── plan cap (LIMIT) on the same paths ──
  console.log("\n── CAP ──");
  {
    const before = await P.tenant.findUnique({ where: { id: shop.tid }, select: { limits: true } });
    await P.tenant.update({ where: { id: shop.tid }, data: { limits: { crm: { contacts: 1 } } } });
    const pc = newPhone();
    const p = await proposal("สแกนเต็มเพดาน", pc);
    const r = await call(() => CALLS.acceptLeadProposal(s1.ctx, s1.actor, p.id));
    await P.tenant.update({ where: { id: shop.tid }, data: { limits: before?.limits ?? undefined } });
    const web = refusal(r.err);
    const mob = MOBILE.mobileErrorOf(r.err);
    const th = /[ก-๙]/.test(String(r.err?.message ?? ""));
    chk("R3-cap", !r.ok && codeOf(r) === "LIMIT" && th && web?.code === "LIMIT" && web?.status === 409 && web?.message === r.err.message && mob.status === 409 && mob.error === "limit" && mob.message === r.err.message && (await rows(pc)) === 0,
      `plan cap 1 contact → service ${codeOf(r)} "${cut(r.err?.message, 70)}" · web ${j(web ? { code: web.code, status: web.status } : null)} · mobile ${mob.status} ${mob.error} · rows ${await rows(pc)}`);
    await call(() => CALLS.rejectLeadProposal(s1.ctx, s1.actor, p.id));
  }

  // ── RATE_LIMITED unchanged (429) ──
  {
    const k = `crm:contact:ident:${shop.tid}:${s1.uid}`;
    await P.chatRateBucket.upsert({ where: { key: k }, create: { key: k, count: LIM, windowStart: new Date() }, update: { count: LIM, windowStart: new Date() } });
    const p = await proposal("สแกนถี่", newPhone());
    const r = await call(() => CALLS.acceptLeadProposal(s1.ctx, s1.actor, p.id));
    await P.chatRateBucket.deleteMany({ where: { key: k } });
    const web = refusal(r.err);
    const mob = MOBILE.mobileErrorOf(r.err);
    chk("R3-rate-limited", codeOf(r) === "RATE_LIMITED" && web?.status === 429 && web?.message === r.err.message && mob.status === 429 && mob.error === "rate_limited",
      `bucket full → service ${codeOf(r)} · web ${j(web ? { code: web.code, status: web.status } : null)} · mobile ${mob.status} ${mob.error}`);
    // other ContactsError codes keep their old paths (helper returns null)
    const other = refusal(new SHARED.ContactsError("VALIDATION", "เบอร์โทรไม่ถูกต้อง"));
    const oMob = MOBILE.mobileErrorOf(new SHARED.ContactsError("VALIDATION", "เบอร์โทรไม่ถูกต้อง"));
    chk("R3-scope", typeof SHARED.contactRefusalOf === "function" && other === null && oMob.status === 500, `helper ignores other codes (VALIDATION → ${j(other)}) · mobile keeps its old answer for them (${oMob.status})`);
  }
} catch (e) {
  chk("FATAL", false, String((e as Error)?.stack ?? e).slice(0, 900));
}
await done("probe-cf16-r3", async () => {
  for (const pre of PREFIXES) await P.chatRateBucket.deleteMany({ where: { key: { startsWith: pre } } }).catch(() => undefined);
});
