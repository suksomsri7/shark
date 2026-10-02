// C5.5-fix12 REVIEW probe (independent reviewer) — attacks on e4869b2e
//   RL   the phone/e-mail rate limit: keyed per person per shop (other user / other shop unaffected) · counted for people incl. the AI
//        assistant actor · not for API keys / import (by design) · an unchanged phone on update is not counted · at the limit nothing
//        is written · REST mapping of the refusal
//   CS   card scan: a hidden duplicate → neutral refusal, proposal back to PENDING, retry gives the same, discard still works
//   IM   import (update / skip / candidate) with hidden-only matches: counts, neutral row text, nothing created for those rows
//   UP   updateContact mixed (new phone hits a hidden contact, new e-mail hits a visible one) → only the visible name comes back
//   WE   every mutate-style writer (assign · opt-out · archive · restore) returns the masked companyText
//   JB   getImportJob readable by another user who holds the job id (reported row #22) — measured
//   EX   exportDeals (now inside crmScope) lists exactly the deals listDeals shows, per persona
// QC2 only (ep-cool-shadow) · throwaway tenants `qc-cf16-rv-*` (swept in done()) + the rate buckets this probe touched.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf16/review/probe-cf16-review.mts
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

const { toMemberActor } = (await import("@/lib/modules/member" as string)) as Any;
const CON = (await import("@/lib/modules/crm/contacts" as string)) as Any;
const DEALS = (await import("@/lib/modules/crm/deals" as string)) as Any;
const CALLS = (await import("@/lib/modules/crm/calls" as string)) as Any;
const SHARED = (await import("@/lib/modules/crm/contacts-shared" as string)) as Any;
const { crmActorForKey } = (await import("@/lib/modules/crm/api/actor" as string)) as Any;
const { toCrmApiError } = (await import("@/lib/modules/crm/api/http-errors" as string)) as Any;
const HIDDEN = SHARED.CONTACT_DUPLICATE_HIDDEN_MSG as string;
const LIM = SHARED.CONTACT_IDENT_RATE.limit as number;
const BUCKETS = new Set<string>();
const bucketOf = (tid: string, uid: string) => { const k = `crm:contact:ident:${tid}:${uid}`; BUCKETS.add(k); return k; };
const count = async (k: string) => ((await P.chatRateBucket.findUnique({ where: { key: k } })) as Any)?.count ?? 0;
let seq = 0;
const newPhone = () => `08${String(Date.now() % 1e7).padStart(7, "0")}${(seq++ % 10)}`.slice(0, 10);

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
async function mkContact(shop: Any, first: string, ownerUserId: string, opts: { phone?: string | null; email?: string | null; companyId?: string | null; text?: string | null } = {}) {
  const name = `${first} ${TAG}`;
  const party = await P.party.create({ data: { tenantId: shop.tid, name, kind: "PERSON" } });
  const k = await P.crmContact.create({ data: { tenantId: shop.tid, systemId: shop.S, name, firstName: first, partyId: party.id, ownerUserId, phone: opts.phone ?? null, email: opts.email ?? null, companyId: opts.companyId ?? null, company: opts.text ?? null } });
  if (opts.companyId) await P.crmCompanyContact.create({ data: { tenantId: shop.tid, companyId: opts.companyId, contactId: k.id, isPrimary: true } });
  return k;
}
const TABLES = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[])
  .map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x)).sort();
async function snap(tid: string) {
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid)) as Any[])[0]?.n ?? 0);
    if (n) counts[t] = n;
  }
  return counts;
}
const diff = (a: Any, b: Any) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => (a[k] ?? 0) !== (b[k] ?? 0)).map((k) => `${k} ${a[k] ?? 0}→${b[k] ?? 0}`).join(" · ") || "none";

try {
  const shop = await mkShop("a");
  const shop2 = await mkShop("b");
  const owner = { actor: shop.owner, ctx: shop.ctx, uid: shop.uid };
  const KEYS = ["crm.contact.read", "crm.contact.create", "crm.contact.update", "crm.contact.import", "crm.contact.delete", "crm.deal.read", "crm.deal.create", "crm.activity.read"];
  const s1 = await staff(shop, "s1", KEYS); // teamless STAFF: sees only own contacts
  const s2 = await staff(shop, "s2", KEYS);
  const s1in2 = await (async () => { const m = await P.membership.create({ data: { userId: s1.uid, tenantId: shop2.tid, role: "STAFF", unitAccess: ["*"], permissions: Object.fromEntries(KEYS.map((k) => [k, true])), acceptedAt: new Date() } }); return { uid: s1.uid, actor: toMemberActor(s1.uid, m), ctx: { tenantId: shop2.tid, systemId: shop2.S, actorUserId: s1.uid } }; })();

  // ═══════════ RL · rate limit ═══════════
  console.log("\n── RL ──");
  {
    const k1 = bucketOf(shop.tid, s1.uid);
    const k2 = bucketOf(shop.tid, s2.uid);
    const kOther = bucketOf(shop2.tid, s1.uid);
    const c0 = await count(k1);
    const r = await call(() => CON.createContact(s1.ctx, s1.actor, { firstName: `นับ ${rand}`, phone: newPhone() }));
    const c1 = await count(k1);
    const mine = r.v?.contact;
    const ru = await call(() => CON.updateContact(s1.ctx, s1.actor, mine.id, { jobTitle: "x", phone: mine.phone }));
    const c2 = await count(k1);
    const key = crmActorForKey({ keyId: `k-${rand}`, scopes: ["crm.contact.read", "crm.contact.create"], createdById: shop.uid });
    const rk = await call(() => CON.createContact({ tenantId: shop.tid, systemId: shop.S, actorUserId: null }, key, { firstName: `คีย์ ${rand}`, phone: newPhone() }));
    const kKey = bucketOf(shop.tid, shop.uid);
    const ri = await call(() => CON.importContacts(s1.ctx, s1.actor, { rows: [{ ชื่อ: `นำเข้า ${rand}`, เบอร์: newPhone() }], mapping: { ชื่อ: "firstName", เบอร์: "phone" }, options: { onDuplicate: "skip", source: "IMPORT" } }));
    const c3 = await count(k1);
    chk("RL-counting", r.ok && c1 === c0 + 1 && ru.ok && c2 === c1 && rk.ok && (await count(kKey)) === 0 && ri.ok && c3 === c2,
      `create +1 (${c0}→${c1}) · update with the same phone +0 (${c2}) · API key create not counted (owner bucket ${await count(kKey)}) · import not counted (${c3})`);
    // fill s1's bucket to the limit → next create refused, nothing written; s2 and s1 in another shop unaffected
    await P.chatRateBucket.upsert({ where: { key: k1 }, create: { key: k1, count: LIM, windowStart: new Date() }, update: { count: LIM, windowStart: new Date() } });
    const before = await snap(shop.tid);
    const rl = await call(() => CON.createContact(s1.ctx, s1.actor, { firstName: `เกิน ${rand}`, phone: newPhone() }));
    const after = await snap(shop.tid);
    const rNoPhone = await call(() => CON.createContact(s1.ctx, s1.actor, { firstName: `ไม่มีเบอร์ ${rand}` }));
    const rs2 = await call(() => CON.createContact(s2.ctx, s2.actor, { firstName: `อีกคน ${rand}`, phone: newPhone() }));
    const rOther = await call(() => CON.createContact(s1in2.ctx, s1in2.actor, { firstName: `อีกร้าน ${rand}`, phone: newPhone() }));
    const api = toCrmApiError(rl.err);
    chk("RL-limit", codeOf(rl) === "RATE_LIMITED" && diff(before, after) === "none" && rNoPhone.ok && rs2.ok && rOther.ok && (await count(k2)) === 1 && (await count(kOther)) === 1,
      `at ${LIM}: create with phone → ${codeOf(rl)} "${cut(rl.err?.message, 70)}" writes ${diff(before, after)} · without phone → ${codeOf(rNoPhone)} · other user → ${codeOf(rs2)} · same user other shop → ${codeOf(rOther)}`);
    info("RL-rest-shape", `REST mapping of the limit refusal: status ${api?.status} code ${api?.code} (round 1 was the plan-cap "LIMIT" → 409 state_conflict; fix12 r2 wants 429 rate_limited)`);
    // the AI assistant runs as the asking person's MemberActor (crmActorOf kind "assistant") ⇒ same bucket
    const { crmActorOf } = (await import("@/lib/modules/crm/api/actor" as string)) as Any;
    const asst = crmActorOf({ kind: "assistant", module: "crm", tenantId: shop.tid, systemId: shop.S, userId: s1.uid, membership: { role: "STAFF", unitAccess: ["*"], permissions: Object.fromEntries(KEYS.map((k) => [k, true])) } });
    const ra = await call(() => CON.createContact(s1.ctx, asst, { firstName: `ผู้ช่วย ${rand}`, phone: newPhone() }));
    chk("RL-assistant-counted", codeOf(ra) === "RATE_LIMITED", `AI assistant actor of the same person while the bucket is full → ${codeOf(ra)}`);
    await P.chatRateBucket.deleteMany({ where: { key: k1 } });
  }

  // ═══════════ CS · card scan ═══════════
  console.log("\n── CS ──");
  {
    const pH = newPhone();
    const kH = await mkContact(shop, "ลับนามบัตร", shop.uid, { phone: pH });
    const p = await P.aiProposal.create({ data: { tenantId: shop.tid, conversationId: `crm:card:${rand}`, kind: CALLS.LEAD_PROPOSAL_KIND, summary: "นามบัตร", payload: { systemId: shop.S, name: `จากนามบัตร ${rand}`, phone: pH }, expiresAt: new Date(Date.now() + 3_600_000) } });
    const outs: string[] = [];
    let ok = true;
    for (let i = 0; i < 2; i += 1) {
      const r = await call(() => CALLS.acceptLeadProposal(s1.ctx, s1.actor, p.id));
      const pr = await P.aiProposal.findUnique({ where: { id: p.id }, select: { status: true, resultNote: true } });
      ok = ok && !r.ok && r.err?.message === HIDDEN && pr.status === "PENDING" && pr.resultNote === HIDDEN && !String(pr.resultNote).includes("ลับนามบัตร");
      outs.push(`try ${i + 1}: ${codeOf(r)} · proposal ${pr.status} note=${pr.resultNote === HIDDEN ? "neutral" : cut(pr.resultNote, 40)}`);
    }
    const rj = await call(() => CALLS.rejectLeadProposal(s1.ctx, s1.actor, p.id));
    const prj = await P.aiProposal.findUnique({ where: { id: p.id }, select: { status: true } });
    const rows = await P.crmContact.count({ where: { tenantId: shop.tid, phone: pH } });
    chk("CS-loop", ok && rj.ok && prj.status !== "PENDING" && rows === 1 && !!kH, `${outs.join(" · ")} · discard → ${codeOf(rj)} status ${prj.status} · rows with that phone ${rows} (want 1)`);
    const p2 = await P.aiProposal.create({ data: { tenantId: shop.tid, conversationId: `crm:card2:${rand}`, kind: CALLS.LEAD_PROPOSAL_KIND, summary: "นามบัตร", payload: { systemId: shop.S, name: `เจ้าของสแกน ${rand}`, phone: pH }, expiresAt: new Date(Date.now() + 3_600_000) } });
    const ro = await call(() => CALLS.acceptLeadProposal(owner.ctx, owner.actor, p2.id));
    info("CS-owner", `owner (sees the match) accepts the same card → ${codeOf(ro)} (force:true path, owner sees it ⇒ a duplicate is created as before: rows now ${await P.crmContact.count({ where: { tenantId: shop.tid, phone: pH } })})`);
  }

  // ═══════════ IM · import modes, hidden-only matches ═══════════
  console.log("\n── IM ──");
  {
    const res: string[] = [];
    let ok = true;
    for (const mode of ["update", "skip", "candidate"]) {
      const pH = newPhone();
      const eV = `vis-${mode}-${rand}@qc.invalid`;
      await mkContact(shop, `ลับนำเข้า ${mode}`, shop.uid, { phone: pH });
      await mkContact(shop, `เห็นนำเข้า ${mode}`, s1.uid, { email: eV });
      const rows = [
        { ชื่อ: `แถวลับ ${mode} ${rand}`, เบอร์: pH, อีเมล: "" },
        { ชื่อ: `แถวเห็น ${mode} ${rand}`, เบอร์: "", อีเมล: eV },
        { ชื่อ: `แถวใหม่ ${mode} ${rand}`, เบอร์: newPhone(), อีเมล: "" },
      ];
      const before = await P.crmContact.count({ where: { tenantId: shop.tid, phone: pH } });
      const r = await call(() => CON.importContacts(s1.ctx, s1.actor, { rows, mapping: { ชื่อ: "firstName", เบอร์: "phone", อีเมล: "email" }, options: { onDuplicate: mode, source: "IMPORT" } }));
      const after = await P.crmContact.count({ where: { tenantId: shop.tid, phone: pH } });
      const e = (r.v?.result?.errors ?? []) as Any[];
      const row1 = e.find((x) => x.row === 1);
      const leak = j(r.v ?? r.err ?? null).includes(`ลับนำเข้า ${mode}`);
      const want = mode === "update" ? { created: 1, updated: 1, skipped: 0, candidates: 0 } : mode === "skip" ? { created: 1, updated: 0, skipped: 1, candidates: 0 } : { created: 2, updated: 0, skipped: 0, candidates: 1 };
      const R = r.v?.result ?? {};
      const good = r.ok && row1?.message === HIDDEN && row1?.kind === "error" && R.failed === 1 && R.created === want.created && R.updated === want.updated && R.skipped === want.skipped && after === before && !leak;
      ok = ok && good;
      res.push(`${mode}: ${j({ c: R.created, u: R.updated, s: R.skipped, cand: R.candidates, f: R.failed })} row1=${row1?.message === HIDDEN ? "neutral" : cut(row1?.message, 40)} hiddenPhoneRows ${before}→${after} leak=${leak}`);
    }
    chk("IM-modes", ok, res.join(" · "));
  }

  // ═══════════ UP · updateContact mixed ═══════════
  console.log("\n── UP ──");
  {
    const pH = newPhone();
    const eV = `upd-${rand}@qc.invalid`;
    const kH = await mkContact(shop, "ลับแก้", shop.uid, { phone: pH });
    const kV = await mkContact(shop, "เห็นแก้", s1.uid, { email: eV });
    const me = await mkContact(shop, "ตัวเอง", s1.uid);
    const r = await call(() => CON.updateContact(s1.ctx, s1.actor, me.id, { phone: pH, email: eV }));
    const blob = j({ m: r.err?.message, d: r.err?.duplicates ?? null });
    const r2 = await call(() => CON.updateContact(s1.ctx, s1.actor, me.id, { phone: pH }));
    chk("UP-mixed", codeOf(r) === "DUPLICATE" && blob.includes(kV.id) && !blob.includes(kH.id) && !blob.includes("ลับแก้") && codeOf(r2) === "DUPLICATE" && r2.err?.message === HIDDEN && !r2.err?.duplicates,
      `phone→hidden + e-mail→visible → ${codeOf(r)} duplicates=${j((r.err?.duplicates ?? []).map((d: Any) => d.name))} · phone→hidden only → ${codeOf(r2)} neutral=${r2.err?.message === HIDDEN}`);
  }

  // ═══════════ WE · mutate-style writers return masked companyText ═══════════
  console.log("\n── WE ──");
  {
    const coH = await mkCompany(shop, `บริษัทลับเขียน ${rand}`, shop.uid);
    const k = await mkContact(shop, "เขียนคืน", s1.uid, { companyId: coH.id, text: coH.name });
    const outs: [string, Any][] = [];
    outs.push(["assign", await call(() => CON.assignContact(s1.ctx, s1.actor, k.id, { userId: s1.uid }))]);
    outs.push(["optOut", await call(() => CON.setOptOut(s1.ctx, s1.actor, k.id, { optOut: true }))]);
    outs.push(["archive", await call(() => CON.archiveContact(s1.ctx, s1.actor, k.id, { confirm: true, reason: "ทดสอบรีวิวเขียน" }))]);
    outs.push(["restore", await call(() => CON.restoreContact(s1.ctx, s1.actor, k.id, { confirm: true, reason: "ทดสอบรีวิวเขียน" }))]);
    const bad = outs.filter(([, r]) => r.ok && j(r.v).includes(coH.name));
    chk("WE-mutate-masked", bad.length === 0 && outs.some(([, r]) => r.ok), outs.map(([n, r]) => `${n}: ${codeOf(r)}${r.ok ? ` companyText=${j(r.v?.companyText ?? r.v?.contact?.companyText ?? null)}` : ` ${cut(r.err?.message, 50)}`}`).join(" · "));
  }

  // ═══════════ JB · import job by id ═══════════
  console.log("\n── JB ──");
  {
    const r = await CON.importContacts(owner.ctx, owner.actor, { rows: [{ ชื่อ: "", เบอร์: "" }, { ชื่อ: `งานเจ้าของ ${rand}`, เบอร์: newPhone() }], mapping: { ชื่อ: "firstName", เบอร์: "phone" }, options: { onDuplicate: "skip", source: "IMPORT" } });
    const other = await call(() => CON.getImportJob(s2.ctx, s2.actor, r.jobId));
    info("JB-other-user", `owner's import job read by another STAFF who holds the job id → ${codeOf(other)} ${other.ok ? `result ${j(other.v.result).slice(0, 160)}` : cut(other.err?.message, 60)} (job id is a random UUID returned only to the importer)`);
  }

  // ═══════════ EX · exportDeals (crmScope) vs listDeals per persona ═══════════
  console.log("\n── EX ──");
  {
    const kS = await mkContact(shop, "ดีลสตาฟ", s1.uid);
    const kO = await mkContact(shop, "ดีลเจ้าของ", shop.uid);
    await DEALS.createDeal(owner.ctx, owner.actor, { pipelineId: shop.pipe.id, title: `ส่งออกสตาฟ ${rand}`, contactId: kS.id, ownerUserId: s1.uid });
    await DEALS.createDeal(owner.ctx, owner.actor, { pipelineId: shop.pipe.id, title: `ส่งออกเจ้าของ ${rand}`, contactId: kO.id, ownerUserId: shop.uid });
    const res: string[] = [];
    let ok = true;
    for (const [label, who] of [["owner", owner], ["s1", s1], ["s2", s2]] as const) {
      const w = who as Any;
      const lst = await DEALS.listDeals(w.ctx, w.actor, { pageSize: 200 });
      const csv = await call(() => DEALS.exportDeals(w.ctx, w.actor, {}));
      const listT = lst.items.map((x: Any) => x.title).filter((t: string) => t.includes(rand)).sort();
      const csvT = csv.ok ? listT.filter((t: string) => String(csv.v).includes(t)) : [];
      const extra = csv.ok ? [`ส่งออกสตาฟ ${rand}`, `ส่งออกเจ้าของ ${rand}`].filter((t) => String(csv.v).includes(t) && !listT.includes(t)) : [];
      const good = !csv.ok || (csvT.length === listT.length && extra.length === 0);
      ok = ok && good;
      res.push(`${label}: list ${listT.length} csv ${csv.ok ? `${csvT.length}+extra ${extra.length}` : codeOf(csv)}`);
    }
    chk("EX-scope", ok, res.join(" · "));
  }
} catch (e) {
  chk("FATAL", false, String((e as Error)?.stack ?? e).slice(0, 900));
}
for (const k of BUCKETS) await P.chatRateBucket.deleteMany({ where: { key: k } }).catch(() => undefined);
await done("probe-cf16-review");
