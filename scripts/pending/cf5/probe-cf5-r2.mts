// C5.5-fix3b ROUND 2 probe — review findings:
//   RV1  the contact 360 "🕒 ไทม์ไลน์" card and the company 360 "ไทม์ไลน์รวม" card flag inbound EMAIL rows of unverified senders
//        (getContact360().timeline / getCompany360().timeline · REST contacts.get360 / companies.get360) — same single reader, one batched query
//   RV5  authored webhook writes (`by` given): event names trimmed; names that are not exact known events refused (422) AFTER the family guard;
//        author-less script calls unchanged
// QC2 only · throwaway tenants `qc-cf5-*` (swept in done()) · network blocked.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf5/probe-cf5-r2.mts [--only=RV1,RV5]
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
const { fixture } = (await import("./_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean).map((s) => s.toUpperCase());
const want = (s: string) => ONLY.length === 0 || ONLY.includes(s);
const fx = await fixture("q");
const { P, chk, mkShop, setCrm, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (x instanceof Date ? x.toISOString() : x));
const cut = (v: unknown, n = 120) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const sub = async (id: string, fn: () => Promise<void>) => {
  if (!want(id)) return;
  console.log(`\n── ${id} ──`);
  try {
    await fn();
  } catch (e) {
    chk(`${id}-ERR`, false, String((e as Error)?.stack ?? e).slice(0, 700));
  }
};
const rand = TAG.slice(-8);
const OLD_AUTHSERV = process.env.CRM_INBOUND_AUTHSERV_ID;

try {
  // ═══════════════════════ RV1 · 360 timeline cards carry the unverified-sender flag ═══════════════════════
  await sub("RV1", async () => {
    const shop = await mkShop("v1");
    const KEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
    await setCrm(shop.S, { email: { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null } });
    const EM = (await import("@/lib/modules/crm/emails" as string)) as Any;
    const CON = (await import("@/lib/modules/crm/contacts" as string)) as Any;
    const COS = (await import("@/lib/modules/crm/companies" as string)) as Any;
    const dom = `cust-${rand}.test`;
    const coParty = await P.party.create({ data: { tenantId: shop.tid, name: `Co ${TAG}`, kind: "COMPANY" } });
    const co = await P.crmCompany.create({ data: { tenantId: shop.tid, systemId: shop.S, partyId: coParty.id, name: `Co ${TAG}`, ownerUserId: shop.uid } });
    const party = await P.party.create({ data: { tenantId: shop.tid, name: `ลูกค้า ${TAG}`, kind: "PERSON" } });
    const K = await P.crmContact.create({ data: { tenantId: shop.tid, systemId: shop.S, name: `ลูกค้า ${TAG}`, firstName: "ลูกค้า", partyId: party.id, ownerUserId: shop.uid, email: `buyer@${dom}`, companyId: co.id } });
    await P.crmCompanyContact.create({ data: { tenantId: shop.tid, companyId: co.id, contactId: K.id, isPrimary: true } });
    const INBOX = `crm+${KEY}@shark.in.th`;
    let n = 0;
    const mail = (o: Record<string, unknown>) => ({ messageId: `<${TAG}-${++n}@probe.test>`, from: K.email, to: [INBOX], cc: [], subject: `เรื่อง ${n}`, text: "สวัสดี", html: "<p>สวัสดี</p>", headers: {}, attachments: [], ...o });
    const deps = { transport: async () => ({ ok: true, id: "copy" }) };
    const forged = await EM.ingestInbound(mail({ subject: `ปลอม ${TAG}`, text: "โอนเข้าบัญชีใหม่" }), deps);
    const AUTHSERV = "mx.qc-cf5r2.test";
    process.env.CRM_INBOUND_AUTHSERV_ID = AUTHSERV;
    let real: Any;
    try {
      real = await EM.ingestInbound(mail({ subject: `จริง ${TAG}`, headers: { "authentication-results": `${AUTHSERV}; spf=pass smtp.mailfrom=${dom}; dkim=pass header.d=${dom}; dmarc=pass header.from=${dom}` } }), deps);
    } finally {
      if (OLD_AUTHSERV === undefined) delete process.env.CRM_INBOUND_AUTHSERV_ID; else process.env.CRM_INBOUND_AUTHSERV_ID = OLD_AUTHSERV;
    }
    // a staff-logged NOTE whose sourceRef happens to equal the forged mail id must NOT be flagged (only inbound EMAIL rows are looked up)
    await P.crmActivity.create({ data: { tenantId: shop.tid, systemId: shop.S, contactId: K.id, companyId: co.id, type: "NOTE", title: `โน้ต ${TAG}`, source: "MANUAL", sourceRef: forged.emailId, doneAt: new Date() } });
    const acts = await P.crmActivity.findMany({ where: { tenantId: shop.tid, contactId: K.id }, select: { title: true, companyId: true, source: true, direction: true } });
    chk("RV1-premise", !!forged.emailId && !!real?.emailId && acts.filter((a: Any) => a.source === "EMAIL").length === 2 && acts.every((a: Any) => a.companyId === co.id),
      `inbound EMAIL activities on the contact: ${acts.filter((a: Any) => a.source === "EMAIL").length} (want 2) · all carry the company: ${acts.every((a: Any) => a.companyId === co.id)} · ${j(acts.map((a: Any) => `${a.source}/${a.direction ?? "-"}`))}`);
    const c360 = await CON.getContact360(shop.ctx, shop.owner, K.id);
    const ct = (title: string) => (c360.timeline as Any[]).find((x) => x.title === title);
    chk("RV1-contact-360", ct(`ปลอม ${TAG}`)?.unverifiedFrom === true && !!ct(`จริง ${TAG}`) && ct(`จริง ${TAG}`).unverifiedFrom === undefined && !!ct(`โน้ต ${TAG}`) && ct(`โน้ต ${TAG}`).unverifiedFrom === undefined,
      `getContact360().timeline: forged ${ct(`ปลอม ${TAG}`)?.unverifiedFrom} · authenticated ${ct(`จริง ${TAG}`)?.unverifiedFrom} · NOTE with the same sourceRef ${ct(`โน้ต ${TAG}`)?.unverifiedFrom} (want true / undefined / undefined)`);
    // the activity block (round 1, activities.enrich) — the same rule: only the inbound EMAIL row is flagged, not a NOTE sharing its sourceRef
    const ACT = (await import("@/lib/modules/crm/activities" as string)) as Any;
    const al = (await ACT.listActivities(shop.ctx, shop.owner, { contactId: K.id, pageSize: 30 })).items as Any[];
    const at = (title: string) => al.find((x) => x.title === title);
    chk("RV1-activity-block-note", at(`ปลอม ${TAG}`)?.unverifiedFrom === true && !!at(`โน้ต ${TAG}`) && at(`โน้ต ${TAG}`).unverifiedFrom === undefined,
      `listActivities: forged ${at(`ปลอม ${TAG}`)?.unverifiedFrom} · NOTE with the same sourceRef ${at(`โน้ต ${TAG}`)?.unverifiedFrom} (want true / undefined)`);
    const k360 = await COS.getCompany360(shop.ctx, shop.owner, co.id);
    const kt = (title: string) => (k360.timeline as Any[]).find((x) => x.title === title);
    chk("RV1-company-360", kt(`ปลอม ${TAG}`)?.unverifiedFrom === true && !!kt(`จริง ${TAG}`) && kt(`จริง ${TAG}`).unverifiedFrom === undefined && kt(`โน้ต ${TAG}`)?.unverifiedFrom === undefined,
      `getCompany360().timeline: forged ${kt(`ปลอม ${TAG}`)?.unverifiedFrom} · authenticated ${kt(`จริง ${TAG}`)?.unverifiedFrom} · NOTE ${kt(`โน้ต ${TAG}`)?.unverifiedFrom}`);
    // REST doors return the same objects
    const AK = (await import("@/lib/api-keys/service" as string)) as Any;
    const ROUTE = (await import("@/app/api/v1/crm/[...path]/route" as string)) as Any;
    const key = (await AK.createApiKey({ tenantId: shop.tid }, `${TAG} crm`, { scopes: ["crm.contact.read", "crm.company.read", "crm.activity.read"], systemId: shop.S, createdById: shop.uid })).rawKey as string;
    const get = async (path: string) => {
      const res: Response = await ROUTE.GET(new Request(`http://qc.invalid/api/v1/crm${path}`, { headers: { authorization: `Bearer ${key}` } }), { params: Promise.resolve({ path: path.split("/").filter(Boolean) }) });
      return { status: res.status, body: (await res.json().catch(() => null)) as Any };
    };
    const rc = await get(`/contacts/${K.id}`);
    const rk = await get(`/companies/${co.id}`);
    const fl = (r: Any) => ((r.body?.data?.timeline ?? []) as Any[]).find((x) => x.title === `ปลอม ${TAG}`)?.unverifiedFrom;
    const shape = (r: Any) => `keys=${Object.keys(r.body?.data ?? r.body ?? {}).slice(0, 12).join(",")} timeline=${j(((r.body?.data?.timeline ?? []) as Any[]).map((x) => `${x.type}:${cut(x.title, 14)}:${x.unverifiedFrom}`))}`;
    chk("RV1-rest", rc.status === 200 && fl(rc) === true && rk.status === 200 && fl(rk) === true, `GET /contacts/{id} → ${rc.status} flag ${fl(rc)} · GET /companies/{id} → ${rk.status} flag ${fl(rk)} ${fl(rc) === true ? "" : cut(shape(rc), 300)} ${fl(rk) === true ? "" : cut(shape(rk), 300)}`);
    // pages render the badge from the flag; the lookup is one batched, scoped query
    const cp = readFileSync("src/app/app/sys/[id]/crm/contacts/[contactId]/page.tsx", "utf8");
    const kp = readFileSync("src/app/app/sys/[id]/crm/companies/[companyId]/page.tsx", "utf8");
    const badge = (s: string) => /\{t\.unverifiedFrom && \(\s*<span[^>]*border-amber-500[^>]*>\s*ไม่ยืนยันผู้ส่ง/.test(s);
    chk("RV1-pages-render", badge(cp) && badge(kp), `contact page badge on t.unverifiedFrom: ${badge(cp)} · company page: ${badge(kp)}`);
    const ef = readFileSync("src/lib/modules/crm/email-flags.ts", "utf8");
    const cs = readFileSync("src/lib/modules/crm/contacts.ts", "utf8");
    const ks = readFileSync("src/lib/modules/crm/companies.ts", "utf8");
    const efImports = [...ef.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    chk("RV1-one-reader", (ef.match(/crmEmailMessage\.findMany/g) ?? []).length === 1 && /tenantId: ctx\.tenantId, systemId: ctx\.systemId, id: \{ in: emailIds \}/.test(ef) && /emailRoutingUnverified\(/.test(ef)
      && (cs.match(/unverifiedEmailRefs\(/g) ?? []).length === 1 && (ks.match(/unverifiedEmailRefs\(/g) ?? []).length === 1 && !/crmEmailMessage\.findMany/.test(cs) && !/crmEmailMessage\.findMany/.test(ks) && efImports.every((s) => s === "./db" || s === "./emails-shared"),
      `email-flags.ts: 1 scoped findMany + the single reader · imports [${efImports.join(", ")}] (leaf) · contacts.ts / companies.ts call it once each, no own mail query`);
  });

  // ═══════════════════════ RV5 · authored writes: trimmed, unknown names refused (after the family guard) ═══════════════════════
  await sub("RV5", async () => {
    const shop = await mkShop("v5");
    const svc = (await import("@/lib/webhooks/service" as string)) as Any;
    const lookup = async () => "93.184.216.34";
    const by = { actor: shop.owner };
    const ep = await P.webhookEndpoint.create({ data: { tenantId: shop.tid, url: "https://example.com/qc-cf5r2-e", secret: "x".repeat(48), eventsJson: ["member.created"], active: false } });
    const stored = async () => (await P.webhookEndpoint.findUnique({ where: { id: ep.id }, select: { eventsJson: true } }))?.eventsJson;
    const err = async (f: () => Promise<unknown>) => { try { await f(); return "ok"; } catch (e) { return `${(e as Any)?.name}:${(e as Any)?.status ?? ""}: ${String((e as Any)?.message ?? e).slice(0, 80)}`; } };
    const lead = await err(() => svc.setEndpointEvents({ tenantId: shop.tid }, ep.id, [" crm.deal.won", "\tmember.created", "crm.deal.won"], by));
    const s1 = await stored();
    chk("RV5-trimmed", lead === "ok" && j(s1) === j(["crm.deal.won", "member.created"]), `OWNER, [" crm.deal.won", "\\tmember.created", "crm.deal.won"] → ${lead} · stored ${j(s1)} (want trimmed + deduped)`);
    const upper = await err(() => svc.setEndpointEvents({ tenantId: shop.tid }, ep.id, ["CRM.deal.won"], by));
    const bogus = await err(() => svc.setEndpointEvents({ tenantId: shop.tid }, ep.id, ["member.created", "member.nope"], by));
    const s2 = await stored();
    chk("RV5-unknown-refused", /^WebhookEventNameError:422: ไม่รู้จักเหตุการณ์/.test(upper) && /^WebhookEventNameError:422: /.test(bogus) && j(s2) === j(s1),
      `["CRM.deal.won"] → ${cut(upper, 70)} · [member.created, member.nope] → ${cut(bogus, 50)} · stored unchanged ${j(s2)}`);
    const created = await err(() => svc.createEndpoint({ tenantId: shop.tid }, { url: "https://example.com/qc-cf5r2-c", events: ["CRM.deal.won"], by }, { lookup }));
    const createdRow = await P.webhookEndpoint.findFirst({ where: { tenantId: shop.tid, url: "https://example.com/qc-cf5r2-c" } });
    const created2 = await err(() => svc.createEndpoint({ tenantId: shop.tid }, { url: "https://example.com/qc-cf5r2-d", events: [" crm.deal.won "], by }, { lookup }));
    const row2 = await P.webhookEndpoint.findFirst({ where: { tenantId: shop.tid, url: "https://example.com/qc-cf5r2-d" }, select: { eventsJson: true } });
    chk("RV5-create", /^WebhookEventNameError:422/.test(created) && !createdRow && created2 === "ok" && j(row2?.eventsJson) === j(["crm.deal.won"]),
      `create ["CRM.deal.won"] → ${cut(created, 40)} (row: ${!!createdRow}) · create [" crm.deal.won "] → ${created2} stored ${j(row2?.eventsJson)}`);
    // the family guard still decides first: a MANAGER without CRM whole-shop rights on a v2 shop → the CRM guard's refusal, not the name error
    const mid = await fx.mkUser("-v5m");
    await P.membership.create({ data: { userId: mid, tenantId: shop.tid, role: "MANAGER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    const mgr = await err(() => svc.setEndpointEvents({ tenantId: shop.tid }, ep.id, [" crm.deal.won"], { userId: mid }));
    chk("RV5-guard-first", /^WebhookGuardError:403/.test(mgr), `MANAGER (no crm.api.manage), [" crm.deal.won"] → ${cut(mgr, 80)} (the trimmed name reaches the CRM guard)`);
    const legacy = await err(() => svc.setEndpointEvents({ tenantId: shop.tid }, ep.id, [" legacy.script.event"]));
    const s3 = await stored();
    chk("RV5-authorless-unchanged", legacy === "ok" && j(s3) === j([" legacy.script.event"]), `author-less script call [" legacy.script.event"] → ${legacy} · stored ${j(s3)} (byte-for-byte as before)`);
  });
} catch (e) {
  chk("PROBE-ERR", false, String((e as Error)?.stack ?? e).slice(0, 800));
} finally {
  await done("probe-cf5-r2");
}
