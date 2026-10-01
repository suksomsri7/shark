// C5.5-fix3b REVIEW round 2 probe — attacks the r2 claims (RV-1 360 flag via email-flags.ts · "only the inbound EMAIL row" · RV-5 422 names).
// QC2 only (ep-cool-shadow, via ../_fx.mts) · throwaway tenants `qc-cf5-rv2-*` swept in done() · network blocked.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf5/review/rv-cf5-r2.mts [--only=FLAG,RV5]
// Checks named INFO-* always pass: they record an observed fact for the review note.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
const { fixture } = (await import("../_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean).map((s) => s.toUpperCase());
const want = (s: string) => ONLY.length === 0 || ONLY.includes(s);
const fx = await fixture("rv2");
const { P, chk, mkShop, setCrm, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (x instanceof Date ? x.toISOString() : x));
const sub = async (id: string, fn: () => Promise<void>) => {
  if (!want(id)) return;
  console.log(`\n── ${id} ──`);
  try {
    await fn();
  } catch (e) {
    chk(`${id}-ERR`, false, String((e as Error)?.stack ?? e).slice(0, 900));
  }
};
const rand = TAG.slice(-8);
const TENANT_IDS: string[] = [];
const shopOf = async (s: string, o: Record<string, unknown> = {}) => {
  const shop = await mkShop(s, o);
  TENANT_IDS.push(shop.tid);
  return shop;
};
async function mkContact(shop: Any, label: string, email: string | null = null, systemId: string = shop.S) {
  const party = await P.party.create({ data: { tenantId: shop.tid, name: `${label} ${TAG}`, kind: "PERSON" } });
  return P.crmContact.create({ data: { tenantId: shop.tid, systemId, name: `${label} ${TAG}`, firstName: label, partyId: party.id, ownerUserId: shop.uid, email } });
}
const keyGen = () => Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
const inbox = (shop: Any, S: string, key: string) => setCrm(S, { uiVersion: 2, email: { inboundEnabled: true, inboundKey: key, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null } });

try {
  // ═══════════════════════ FLAG · 360 cards + activity block: scoping, only-inbound-EMAIL rule, attach, merge, company roll-up ═══════════════════════
  await sub("FLAG", async () => {
    const shop = await shopOf("fl");
    const EM = (await import("@/lib/modules/crm/emails" as string)) as Any;
    const ACT = (await import("@/lib/modules/crm/activities" as string)) as Any;
    const CON = (await import("@/lib/modules/crm/contacts" as string)) as Any;
    const COS = (await import("@/lib/modules/crm/companies" as string)) as Any;
    const deps = { transport: async () => ({ ok: true, id: "copy" }) };
    const KEY = keyGen();
    await inbox(shop, shop.S, KEY);
    const dom = `cust-${rand}.test`;
    const party = await P.party.create({ data: { tenantId: shop.tid, name: `Co ${TAG}`, kind: "COMPANY" } });
    const co = await P.crmCompany.create({ data: { tenantId: shop.tid, systemId: shop.S, partyId: party.id, name: `Co ${TAG}`, ownerUserId: shop.uid } });
    const K = await mkContact(shop, "ลูกค้า", `buyer@${dom}`);
    await P.crmContact.update({ where: { id: K.id }, data: { companyId: co.id } });
    await P.crmCompanyContact.create({ data: { tenantId: shop.tid, companyId: co.id, contactId: K.id, isPrimary: true } });
    let n = 0;
    const mail = (to: string, from: string, subject: string) => ({ messageId: `<${TAG}-${++n}@rv2.test>`, from, to: [to], cc: [], subject, text: "โอนเข้าบัญชีใหม่", html: "<p>x</p>", headers: {}, attachments: [] });
    const forged = await EM.ingestInbound(mail(`crm+${KEY}@shark.in.th`, K.email, `ปลอม ${TAG}`), deps);
    const fRow = (await P.crmEmailMessage.findUnique({ where: { id: forged.emailId }, select: { routing: true, companyId: true } })) as Any;
    const fAct = (await P.crmActivity.findFirst({ where: { sourceRef: forged.emailId, source: "EMAIL" } })) as Any;
    chk("R2-premise", fRow?.routing?.unverifiedFrom === true && !!fAct && fAct.direction === "IN", `forged mail routing ${j(fRow?.routing)} · activity direction ${fAct?.direction} companyId ${fAct?.companyId ?? "-"}`);
    if (!fAct?.companyId) await P.crmActivity.update({ where: { id: fAct.id }, data: { companyId: co.id } }); // company roll-up via companyId

    // decoys on the same contact: NOTE with the flagged mail id as sourceRef · EMAIL OUT with it · EMAIL IN pointing at another system's flagged mail
    const S2 = (await (await import("@/lib/modules/system/service" as string)).createSystem(shop.tid, "CRM", `CRM2 ${TAG}`)).id as string;
    const KEY2 = keyGen();
    await inbox(shop, S2, KEY2);
    const K2 = await mkContact(shop, "S2", `x@${dom}`, S2);
    const f2 = await EM.ingestInbound(mail(`crm+${KEY2}@shark.in.th`, K2.email, `ปลอม2 ${TAG}`), deps);
    const base = { tenantId: shop.tid, systemId: shop.S, contactId: K.id, companyId: co.id, ownerUserId: shop.uid, doneAt: new Date() };
    const note = await P.crmActivity.create({ data: { ...base, type: "NOTE", source: "MANUAL", title: `note ${TAG}`, sourceRef: forged.emailId } });
    const out = await P.crmActivity.create({ data: { ...base, type: "EMAIL", source: "EMAIL", direction: "OUT", title: `out ${TAG}`, sourceRef: forged.emailId } });
    const cross = await P.crmActivity.create({ data: { ...base, type: "EMAIL", source: "EMAIL", direction: "IN", title: `cross ${TAG}`, sourceRef: f2.emailId } });

    // attach path: a forged mail from an unknown sender (stored unattributed) attached to K later
    const stray = await EM.ingestInbound(mail(`crm+${KEY}@shark.in.th`, `nobody-${rand}@elsewhere.test`, `หลง ${TAG}`), deps);
    const strayRow = (await P.crmEmailMessage.findUnique({ where: { id: stray.emailId }, select: { contactId: true, routing: true } })) as Any;
    let attachRes = "skipped";
    if (stray.emailId && !strayRow?.contactId) {
      try {
        await EM.attachToContact(shop.ctx, shop.owner, stray.emailId, K.id);
        attachRes = "attached";
      } catch (e) {
        attachRes = `attach failed: ${String((e as Error)?.message).slice(0, 80)}`;
      }
    }
    const attAct = (await P.crmActivity.findFirst({ where: { sourceRef: stray.emailId, source: "EMAIL", contactId: K.id } })) as Any;

    const c360 = await CON.getContact360(shop.ctx, shop.owner, K.id);
    const ct = (id: string | undefined) => (c360.timeline as Any[]).find((x) => x.id === id);
    const cmp = await COS.getCompany360(shop.ctx, shop.owner, co.id);
    const mt = (id: string | undefined) => (cmp.timeline as Any[]).find((x) => x.id === id);
    const list = await ACT.listActivities(shop.ctx, shop.owner, { contactId: K.id, pageSize: 50 });
    const lt = (id: string | undefined) => (list.items as Any[]).find((x) => x.id === id);
    const row = (name: string, f: (id: string | undefined) => Any) =>
      `${name}: forged=${f(fAct?.id)?.unverifiedFrom} note=${f(note.id)?.unverifiedFrom} out=${f(out.id)?.unverifiedFrom} cross=${f(cross.id)?.unverifiedFrom} attached=${f(attAct?.id)?.unverifiedFrom}`;
    const good = (f: (id: string | undefined) => Any, needAttach: boolean) =>
      f(fAct?.id)?.unverifiedFrom === true && !!f(note.id) && f(note.id).unverifiedFrom === undefined && !!f(out.id) && f(out.id).unverifiedFrom === undefined && !!f(cross.id) && f(cross.id).unverifiedFrom === undefined && (!needAttach || f(attAct?.id)?.unverifiedFrom === true);
    chk("R2-contact-360", good(ct, false), row("contact 360", ct));
    chk("R2-company-360", good(mt, false), row("company 360 (companyId roll-up)", mt));
    chk("R2-activity-block", good(lt, false), row("activity block", lt));
    chk("INFO-R2-attach-path", true, `pre-existing fix2 rule (emails.ts:2502 flags only mail matched to a contact/company at ingest): ` +   `unknown-sender forged mail stored contactId=${strayRow?.contactId ?? "null"} flag=${strayRow?.routing?.unverifiedFrom} → ${attachRes} → 360 flag ${ct(attAct?.id)?.unverifiedFrom}`);

    // merge: K (loser) into a new winner W — the forged row moves and stays flagged on W's 360
    const W = await mkContact(shop, "ผู้ชนะ", `winner-${rand}@other.test`);
    let mergeRes = "";
    try {
      const r = await CON.mergeContacts(shop.ctx, shop.owner, { keepId: W.id, mergeId: K.id, confirm: true, reason: "qc review" });
      mergeRes = `moved activities ${r.moved?.activities}`;
    } catch (e) {
      mergeRes = `merge failed: ${String((e as Error)?.message).slice(0, 100)}`;
    }
    const w360 = await CON.getContact360(shop.ctx, shop.owner, W.id);
    const wf = (w360.timeline as Any[]).find((x) => x.id === fAct?.id);
    chk("R2-merge", wf?.unverifiedFrom === true, `${mergeRes} · winner 360 forged row flag=${wf?.unverifiedFrom}`);

    // N+1 / scope: the helper is one batched, scoped query (static)
    const src = readFileSync("src/lib/modules/crm/email-flags.ts", "utf8");
    chk("R2-helper-shape", (src.match(/crmEmailMessage\.findMany/g) ?? []).length === 1 && /tenantId: ctx\.tenantId, systemId: ctx\.systemId, id: \{ in: emailIds \}/.test(src) && [...src.matchAll(/^import[^;]*from\s+"([^"]+)"/gm)].map((m) => m[1]).join(",") === "./db,./emails-shared",
      `email-flags.ts: one batched findMany scoped tenantId+systemId · imports ${[...src.matchAll(/^import[^;]*from\s+"([^"]+)"/gm)].map((m) => m[1]).join(",")}`);
    const clientImp = spawnSync("grep", ["-rln", "email-flags", "src", "--include=*.tsx"], { encoding: "utf8" }).stdout.trim();
    chk("R2-not-in-client", clientImp === "", `.tsx files importing email-flags: ${clientImp || "none"}`);
  });

  // ═══════════════════════ RV5 · 422 names: doors, existing invalid rows, ordering, empty list, author-less ═══════════════════════
  await sub("RV5", async () => {
    const shop = await shopOf("r5");
    const svc = (await import("@/lib/webhooks/service" as string)) as Any;
    const lookup = async () => "93.184.216.34";
    const owner = { actor: shop.owner };
    const nobody = { userId: null };
    const res = async (f: () => Promise<Any>) => {
      try {
        const v = await f();
        return { ok: true, v };
      } catch (e) {
        return { ok: false, name: (e as Any)?.name, status: (e as Any)?.status, msg: String((e as Error)?.message).slice(0, 70) };
      }
    };
    const create = (events: Any, by: Any, tag: string) => res(() => svc.createEndpoint({ tenantId: shop.tid }, { url: `https://example.com/qc-cf5-rv2-${tag}`, ...(events === undefined ? {} : { events }), ...(by === undefined ? {} : { by }) }, { lookup }));
    // existing row that already stores now-invalid names (written before RV-5)
    const legacy = await P.webhookEndpoint.create({ data: { tenantId: shop.tid, url: "https://example.com/qc-cf5-rv2-legacy", secret: "x".repeat(48), eventsJson: [" member.created", "member.gone.legacy"], active: false } });
    const on = await res(() => svc.setEndpointActive({ tenantId: shop.tid }, legacy.id, true, owner));
    const off = await res(() => svc.setEndpointActive({ tenantId: shop.tid }, legacy.id, false, owner));
    const keepStale = await res(() => svc.setEndpointEvents({ tenantId: shop.tid }, legacy.id, [" member.created", "member.gone.legacy"], owner));
    const fixUp = await res(() => svc.setEndpointEvents({ tenantId: shop.tid }, legacy.id, ["member.created"], owner));
    const del = await res(() => svc.deleteEndpoint({ tenantId: shop.tid }, legacy.id));
    chk("RV5r-existing-invalid-row", on.ok && off.ok && !keepStale.ok && keepStale.status === 422 && fixUp.ok && del.ok,
      `row storing [" member.created","member.gone.legacy"]: enable ${on.ok ? "ok" : on.msg} · disable ${off.ok ? "ok" : off.msg} · re-save same names → ${keepStale.ok ? "ok" : `${keepStale.name} ${keepStale.status}`} · save known name → ${fixUp.ok ? "ok" : fixUp.msg} · delete ${del.ok ? "ok" : del.msg}`);
    // trimming / de-dup / empty
    const t = await create([" member.created ", "member.created", "\tmember.updated"], owner, "trim");
    const stored = t.ok ? ((await P.webhookEndpoint.findUnique({ where: { id: t.v.id }, select: { eventsJson: true } })) as Any).eventsJson : null;
    const empty = await create([], owner, "empty");
    const blanks = await create(["  ", ""], owner, "blanks");
    const blankStored = blanks.ok ? ((await P.webhookEndpoint.findUnique({ where: { id: blanks.v.id }, select: { eventsJson: true } })) as Any).eventsJson : null;
    chk("RV5r-trim-empty", t.ok && j(stored) === j(["member.created", "member.updated"]) && empty.ok && blanks.ok,
      `[" member.created ","member.created","\\tmember.updated"] → ${t.ok ? j(stored) : t.msg} · [] → ${empty.ok ? "ok (all events)" : empty.msg} · ["  ",""] → ${blanks.ok ? `stored ${j(blankStored)} (= all events, guard ran on [])` : blanks.msg}`);
    // unknown name refused, nothing written
    const before = (await P.webhookEndpoint.count({ where: { tenantId: shop.tid } })) as number;
    const unk = await create(["member.created", "nope.unknown"], owner, "unk");
    const caseV = await create(["Member.Created"], owner, "case");
    const after = (await P.webhookEndpoint.count({ where: { tenantId: shop.tid } })) as number;
    chk("RV5r-unknown-422", !unk.ok && unk.status === 422 && unk.name === "WebhookEventNameError" && !caseV.ok && caseV.status === 422 && after === before,
      `[member.created, nope.unknown] → ${unk.name} ${unk.status} "${unk.msg}" · ["Member.Created"] → ${caseV.name} ${caseV.status} · rows ${before}→${after}`);
    // ordering: on a v2 shop, an unknown CRM-family name by an author the CRM guard refuses → guard (403) wins, not 422
    const g = await create(["crm.nope.unknown"], nobody, "guard");
    const g2 = await create(["crm.deal.won", "nope.unknown"], nobody, "guard2");
    chk("RV5r-guard-first", !g.ok && g.status === 403 && !g2.ok && g2.status === 403, `actor null, v2 shop: [crm.nope.unknown] → ${g.name} ${g.status} · [crm.deal.won, nope.unknown] → ${g2.name} ${g2.status}`);
    // author-less: unchanged (raw names kept) — and nobody in src/ calls without an author
    const al = await create([" junk.event"], undefined, "authorless");
    const alStored = al.ok ? ((await P.webhookEndpoint.findUnique({ where: { id: al.v.id }, select: { eventsJson: true } })) as Any).eventsJson : null;
    const calls = spawnSync("grep", ["-rnE", "(createEndpoint|setEndpointEvents|setEndpointActive)\\(", "src", "--include=*.ts", "--include=*.tsx"], { encoding: "utf8" }).stdout.split("\n").filter((l) => l && !/src\/lib\/webhooks\/service\.ts/.test(l) && !/^[^:]+:\d+:\s*(\/\/|\*)/.test(l) && !/import /.test(l));
    const noBy = calls.filter((l) => !/\bby\b|authorOf\(|webhookAuthorOfApi\(|\{ userId \}|\{ actor: /.test(l));
    chk("RV5r-authorless", al.ok && j(alStored) === j([" junk.event"]) && noBy.length === 0, `author-less create stored ${j(alStored)} (unchanged) · src call sites ${calls.length}, without an author: ${noBy.length ? noBy.join(" | ") : "none"}`);
    // REST error mapping of the 422 class (member + account http errors read `status`)
    const he = readFileSync("src/lib/modules/member/api/http-errors.ts", "utf8");
    chk("INFO-RV5r-doors-prevalidate", true, `UI/REST doors filter or 4xx before the service (platform actions filter to WEBHOOK_EVENTS · account REST EVENT_VALUES 422 · member REST memberWebhookEventsCheck · CRM crmWebhookEventsCheck) ⇒ the service 422 is a backstop · member http-errors reads e.status: ${/status/.test(he)}`);
  });
} catch (e) {
  chk("PROBE-ERR", false, String((e as Error)?.stack ?? e).slice(0, 900));
} finally {
  await done("rv-cf5-r2", async () => {
    for (const t of TENANT_IDS) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${t}%`);
  });
}
