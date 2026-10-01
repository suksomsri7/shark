// C5.5-fix3b probe — RED/GREEN for the small leftovers of the C5.5 hunt:
//   F5    at-risk PIPELINE_LATE_MONTH by Thai day key (fix3a review F5)
//   H24   custom.record.field_due on a DATETIME field fires on the right Thai day (hunt 2b H2b-4) · dedupe key = Thai day
//   H25   portal shows DATETIME custom values in Thai time, like the staff record page (hunt 2b H2b-5)
//   R23   EMAIL activity of an unverified inbound mail carries the flag + the timeline row renders the badge (fix2 review R2b-3)
//   F4    webhook guard fails closed PER FAMILY (not only when the registry is empty) · one prefix list (fix3a review F4)
// QC2 only (ep-cool-shadow) · throwaway tenants `qc-cf5-*` (swept in done()) · network blocked (fetch) · own env tweaks restored.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf5/probe-cf5.mts [--only=F5,H24,H25,R23,F4]
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
const { fixture } = (await import("./_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean).map((s) => s.toUpperCase());
const want = (s: string) => ONLY.length === 0 || ONLY.includes(s);
const fx = await fixture("p");
const { P, chk, mkShop, setCrm, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const cut = (v: unknown, n = 160) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
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
const OLD_SECRET = process.env.SESSION_SECRET;
const OLD_AUTHSERV = process.env.CRM_INBOUND_AUTHSERV_ID;

/** custom object + a section + fields (raw rows, the same shape the field engine writes) */
async function mkObject(shop: Any, key: string, parentType: "CONTACT" | "COMPANY", fields: { key: string; type: string }[], extra: Record<string, unknown> = {}) {
  const obj = await P.customObject.create({ data: { tenantId: shop.tid, systemId: shop.S, key, label: `วัตถุ ${key}`, labelPlural: `วัตถุ ${key}`, titleFieldKey: "title", parentType, ...extra } });
  const sec = await P.memberSection.create({ data: { tenantId: shop.tid, systemId: shop.S, key: `sec${key}`, label: "ทดสอบ", objectKey: key } });
  const ids: Record<string, string> = {};
  for (const f of fields) {
    ids[f.key] = (await P.memberField.create({ data: { tenantId: shop.tid, systemId: shop.S, sectionId: sec.id, key: f.key, label: `ช่อง ${f.key}`, type: f.type, objectKey: key, ...(extra.portalVisible ? { portalVisible: true } : {}) } })).id as string;
  }
  return { obj, ids };
}
async function mkRecord(shop: Any, objectId: string, parentType: string, parentId: string, title: string, values: { fieldId: string; valueDate: Date }[]) {
  const rec = await P.customRecord.create({ data: { tenantId: shop.tid, systemId: shop.S, objectId, parentType, parentId, title } });
  for (const v of values) await P.customRecordValue.create({ data: { tenantId: shop.tid, recordType: "CUSTOM", recordId: rec.id, fieldId: v.fieldId, valueDate: v.valueDate } });
  return rec.id as string;
}
async function mkContact(shop: Any, label: string, email: string | null = null) {
  const party = await P.party.create({ data: { tenantId: shop.tid, name: `${label} ${TAG}`, kind: "PERSON" } });
  return P.crmContact.create({ data: { tenantId: shop.tid, systemId: shop.S, name: `${label} ${TAG}`, firstName: label, partyId: party.id, ownerUserId: shop.uid, email } });
}

try {
  // ═══════════════════════ F5 · PIPELINE_LATE_MONTH = Thai day of the close date ≤ Thai today + 7 (no flip at 07:00) ═══════════════════════
  await sub("F5", async () => {
    const shop = await mkShop("f5");
    const bridges = (await import("@/lib/modules/crm/ai-bridges" as string)) as Any;
    const deals = (await import("@/lib/modules/crm/deals" as string)) as Any;
    const contacts = (await import("@/lib/modules/crm/contacts" as string)) as Any;
    const c = await contacts.createContact(shop.ctx, shop.owner, { firstName: "ลูกค้า", lastName: rand });
    const contactId = c.contact?.id ?? c.id;
    const mkDeal = async (title: string, day: string, forecastCategory = "PIPELINE") => {
      const d = await deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, stageId: shop.stages[0].id, title, contactId, expectedCloseAt: day, forecastCategory });
      await P.crmDeal.update({ where: { id: d.id }, data: { nextActivityAt: new Date("2027-06-01T03:00:00Z"), stalledAt: null } });
      return d.id as string;
    };
    const d8 = await mkDeal(`ปิด 8 ต.ค. ${TAG}`, "2026-10-08"); // Thai today (1 Oct) + 7 ⇒ late all day
    const d9 = await mkDeal(`ปิด 9 ต.ค. ${TAG}`, "2026-10-09"); // + 8 ⇒ never late on 1 Oct
    const dC = await mkDeal(`COMMIT 8 ต.ค. ${TAG}`, "2026-10-08", "COMMIT"); // control: not PIPELINE ⇒ never this reason
    const nows: [string, string][] = [["00:30 TH 1 Oct", "2026-09-30T17:30:00Z"], ["06:59 TH", "2026-09-30T23:59:00Z"], ["07:01 TH", "2026-10-01T00:01:00Z"], ["23:59 TH", "2026-10-01T16:59:00Z"]];
    const out: string[] = [];
    let good = true;
    for (const [label, iso] of nows) {
      const r = await bridges.atRiskDeals({ tenantId: shop.tid, systemId: shop.S }, shop.owner, { now: new Date(iso) });
      const late = (id: string) => !!r.items.find((x: Any) => x.dealId === id)?.reasons.includes("PIPELINE_LATE_MONTH");
      const ok = late(d8) && !late(d9) && !late(dC);
      good = good && ok;
      out.push(`${label}: 8 Oct ${late(d8) ? "LATE" : "-"} · 9 Oct ${late(d9) ? "LATE" : "-"} · COMMIT ${late(dC) ? "LATE" : "-"}${ok ? "" : " ❌"}`);
    }
    chk("F5-fixed-clock", good, `PIPELINE deals closing 8 Oct (= Thai today + 7) / 9 Oct, COMMIT 8 Oct, through 1 Oct Thai: ${out.join(" | ")} (want 8 Oct late all day, 9 Oct never, COMMIT never)`);
    // next Thai day at 00:30 the 9 Oct deal enters the window (day + 7), not at 07:00
    const r2 = await bridges.atRiskDeals({ tenantId: shop.tid, systemId: shop.S }, shop.owner, { now: new Date("2026-10-01T17:30:00Z") });
    const late9 = !!r2.items.find((x: Any) => x.dealId === d9)?.reasons.includes("PIPELINE_LATE_MONTH");
    chk("F5-next-day-00:30", late9, `00:30 TH 2 Oct: 9 Oct deal PIPELINE_LATE_MONTH=${late9} (want true — Thai 2 Oct + 7 = 9 Oct)`);
    const src = readFileSync("src/lib/modules/crm/ai-bridges.ts", "utf8");
    chk("F5-no-instant-compare", !/expectedCloseAt\.getTime\(\)\s*<=\s*lateCut/.test(src) && (src.match(/reasons\.push\("PIPELINE_LATE_MONTH"\)/g) ?? []).length === 1,
      `instant compare left: ${/expectedCloseAt\.getTime\(\)\s*<=\s*lateCut/.test(src)} · PIPELINE_LATE_MONTH pushed at ${(src.match(/reasons\.push\("PIPELINE_LATE_MONTH"\)/g) ?? []).length} place(s)`);
  });

  // ═══════════════════════ H24 · field_due on DATETIME: window and dedupe key by Thai day ═══════════════════════
  await sub("H24", async () => {
    const shop = await mkShop("h4");
    const AUTO = (await import("@/lib/modules/crm/automation" as string)) as Any;
    const k = await mkContact(shop, "เจ้าของสัญญา");
    const { obj, ids } = await mkObject(shop, "contract", "CONTACT", [{ key: "endsAt", type: "DATETIME" }, { key: "dueOn", type: "DATE" }]);
    const dt = (iso: string) => [{ fieldId: ids.endsAt!, valueDate: new Date(iso) }];
    const dd = (ymd: string) => [{ fieldId: ids.dueOn!, valueDate: new Date(`${ymd}T00:00:00.000Z`) }];
    const recs: Record<string, string> = {
      dt9mid: await mkRecord(shop, obj.id, "CONTACT", k.id, "DT 9 Oct 00:30", dt("2026-10-09T00:30:00+07:00")), // Thai 9 Oct = today+8 ⇒ NOT due at d=7
      dt8mid: await mkRecord(shop, obj.id, "CONTACT", k.id, "DT 8 Oct 00:30", dt("2026-10-08T00:30:00+07:00")), // Thai 8 Oct = today+7 ⇒ due
      dt8eve: await mkRecord(shop, obj.id, "CONTACT", k.id, "DT 8 Oct 23:30", dt("2026-10-08T23:30:00+07:00")), // Thai 8 Oct ⇒ due
      dt2mid: await mkRecord(shop, obj.id, "CONTACT", k.id, "DT 2 Oct 00:30", dt("2026-10-02T00:30:00+07:00")), // tomorrow ⇒ NOT "on the day" (d=0) today
      dt1ear: await mkRecord(shop, obj.id, "CONTACT", k.id, "DT 1 Oct 03:00", dt("2026-10-01T03:00:00+07:00")), // today 03:00 ⇒ d=0 today
    };
    const drecs: Record<string, string> = {
      d8: await mkRecord(shop, obj.id, "CONTACT", k.id, "DATE 8 Oct", dd("2026-10-08")),
      d9: await mkRecord(shop, obj.id, "CONTACT", k.id, "DATE 9 Oct", dd("2026-10-09")),
    };
    const now = new Date("2026-10-01T03:00:00Z"); // 10:00 TH 1 Oct
    const rule = (fieldKey: string, daysBefore: number) => ({ name: `กฎ ${TAG} ${fieldKey} ${daysBefore}`, enabled: true, trigger: { event: "custom.record.field_due", params: { objectKey: "contract", fieldKey, daysBefore } }, actions: [{ type: "ADD_TAG", params: { tag: `t-${rand}` } }] });
    const hits = async (fieldKey: string, d: number) => new Set(((await AUTO.dryRun(shop.ctx, shop.owner, rule(fieldKey, d), { now })).matched as Any[]).map((m) => m.recordId));
    const h7 = await hits("endsAt", 7);
    const h0 = await hits("endsAt", 0);
    const name = (m: Record<string, string>, s: Set<string>) => Object.entries(m).filter(([, id]) => s.has(id)).map(([n]) => n).join(",") || "none";
    chk("H24-datetime-d7", !h7.has(recs.dt9mid!) && h7.has(recs.dt8mid!) && h7.has(recs.dt8eve!),
      `dry run 10:00 TH 1 Oct, DATETIME endsAt, 7 days before → matched [${name(recs, h7)}] (want dt8mid,dt8eve — NOT dt9mid: 9 Oct 00:30 Thai is 8 Thai days away)`);
    chk("H24-datetime-d0", !h0.has(recs.dt2mid!) && h0.has(recs.dt1ear!),
      `same, "on the day" (0) → matched [${name(recs, h0)}] (want dt1ear — NOT dt2mid: 2 Oct 00:30 Thai is tomorrow)`);
    const hd = await hits("dueOn", 7);
    chk("H24-date-unchanged", hd.has(drecs.d8!) && !hd.has(drecs.d9!), `DATE dueOn, 7 days before → matched [${name(drecs, hd)}] (want d8 only — as before)`);
    // the cron run itself: dedupe key carries the Thai day of the value (DATE keys unchanged)
    const r7 = await AUTO.createRule(shop.ctx, shop.owner, rule("endsAt", 7));
    const rD = await AUTO.createRule(shop.ctx, shop.owner, rule("dueOn", 7));
    const cr = await AUTO.runCronTriggers({ now, tenantId: shop.tid });
    const runs = (await P.automationRun.findMany({ where: { ruleId: { in: [r7.id, rD.id] } }, select: { ruleId: true, eventKey: true } })) as Any[];
    const keyOf = (ruleId: string, recId: string) => runs.find((r) => r.ruleId === ruleId && String(r.eventKey).includes(`#${recId}#`))?.eventKey as string | undefined;
    const kMid = keyOf(r7.id, recs.dt8mid!);
    const kEve = keyOf(r7.id, recs.dt8eve!);
    const kNo = keyOf(r7.id, recs.dt9mid!);
    const kDate = keyOf(rD.id, drecs.d8!);
    chk("H24-cron-keys", !!kMid?.endsWith("#2026-10-08") && !!kEve?.endsWith("#2026-10-08") && !kNo && !!kDate?.endsWith("#2026-10-08") && kDate === `custom.record.field_due#contract.dueOn#7#${drecs.d8}#2026-10-08`,
      `runCronTriggers(10:00 TH 1 Oct) → ${j(cr)} · keys: dt8mid …${cut(kMid?.slice(-12), 20)} · dt8eve …${cut(kEve?.slice(-12), 20)} · dt9mid ${kNo ? `FIRED …${kNo.slice(-12)}` : "none"} · DATE d8 …${cut(kDate?.slice(-12), 20)} (want both DATETIME on #2026-10-08, dt9mid none, DATE key unchanged format)`);
  });

  // ═══════════════════════ H25 · portal record: DATETIME in Thai time (= staff record page) · DATE unchanged ═══════════════════════
  await sub("H25", async () => {
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) process.env.SESSION_SECRET = `qc-cf5-probe-only-${randomBytes(16).toString("hex")}`;
    const shop = await mkShop("h5", { portal: true });
    const CS = (await import("@/lib/modules/member/customer-session" as string)) as Any;
    const portal = (await import("@/lib/modules/crm/portal" as string)) as Any;
    const types = (await import("@/components/crm/objects/types" as string)) as Any;
    const party = await P.party.create({ data: { tenantId: shop.tid, name: `Co ${TAG}`, kind: "COMPANY" } });
    const co = await P.crmCompany.create({ data: { tenantId: shop.tid, systemId: shop.S, partyId: party.id, name: `Co ${TAG}`, ownerUserId: shop.uid } });
    const k = await mkContact(shop, "ผู้ติดต่อพอร์ทัล", `${TAG}-portal@qc.invalid`);
    await P.crmCompanyContact.create({ data: { tenantId: shop.tid, companyId: co.id, contactId: k.id, isPrimary: true } });
    const access = await P.crmPortalAccess.create({ data: { tenantId: shop.tid, systemId: shop.S, companyId: co.id, contactId: k.id, role: "VIEW", invitedById: shop.uid, acceptedAt: new Date(), loginMethods: ["EMAIL_OTP"] } });
    const { obj, ids } = await mkObject(shop, "handover", "COMPANY", [{ key: "at", type: "DATETIME" }, { key: "at2", type: "DATETIME" }, { key: "signed", type: "DATE" }], { portalVisible: true });
    const isoMid = "2026-10-09T00:30:00+07:00";
    const isoDay = "2026-10-09T09:30:00+07:00";
    const rec = await mkRecord(shop, obj.id, "COMPANY", co.id, `ส่งมอบ ${TAG}`, [
      { fieldId: ids.at!, valueDate: new Date(isoMid) },
      { fieldId: ids.at2!, valueDate: new Date(isoDay) },
      { fieldId: ids.signed!, valueDate: new Date("2026-10-09T00:00:00.000Z") },
    ]);
    const s = await CS.mintPortalSession(access.id, {});
    const r = await portal.getRecord(s.token, rec);
    const v = (key: string) => (r.fields as Any[]).find((f) => f.key === key)?.value as string | undefined;
    const staff = (iso: string) => types.displayValue(new Date(iso).toISOString(), [], "DATETIME") as string;
    chk("H25-datetime-thai", v("at") === staff(isoMid) && v("at2") === staff(isoDay) && /9 ต\.ค\. 2569/.test(String(v("at"))) && /00:30/.test(String(v("at"))),
      `portal getRecord: DATETIME 9 Oct 00:30 Thai → "${v("at")}" (staff page "${staff(isoMid)}") · 9 Oct 09:30 → "${v("at2")}" (staff "${staff(isoDay)}")`);
    chk("H25-date-unchanged", v("signed") === "2026-10-09", `DATE 2026-10-09 → "${v("signed")}" (want 2026-10-09 as before)`);
    await P.portalSession.deleteMany({ where: { portalAccessId: access.id } }).catch(() => undefined);
  });

  // ═══════════════════════ R23 · timeline: EMAIL activity of an unverified inbound mail is flagged + rendered with the badge ═══════════════════════
  await sub("R23", async () => {
    const shop = await mkShop("r3");
    const KEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
    await setCrm(shop.S, { email: { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null } });
    const EM = (await import("@/lib/modules/crm/emails" as string)) as Any;
    const ACT = (await import("@/lib/modules/crm/activities" as string)) as Any;
    const dom = `cust-${rand}.test`;
    const K = await mkContact(shop, "ลูกค้าอีเมล", `buyer@${dom}`);
    const INBOX = `crm+${KEY}@shark.in.th`;
    let n = 0;
    const mail = (o: Record<string, unknown>) => ({ messageId: `<${TAG}-${++n}@probe.test>`, from: K.email, to: [INBOX], cc: [], subject: `เรื่อง ${TAG} ${n}`, text: "สวัสดี", html: "<p>สวัสดี</p>", headers: {}, attachments: [], ...o });
    const deps = { transport: async () => ({ ok: true, id: "copy" }) };
    const forged = await EM.ingestInbound(mail({ subject: `ปลอม ${TAG}`, text: "โอนเข้าบัญชีใหม่" }), deps);
    const AUTHSERV = "mx.qc-cf5.test";
    process.env.CRM_INBOUND_AUTHSERV_ID = AUTHSERV;
    let real: Any;
    try {
      real = await EM.ingestInbound(mail({ subject: `จริง ${TAG}`, headers: { "authentication-results": `${AUTHSERV}; spf=pass smtp.mailfrom=${dom}; dkim=pass header.d=${dom}; dmarc=pass header.from=${dom}` } }), deps);
    } finally {
      if (OLD_AUTHSERV === undefined) delete process.env.CRM_INBOUND_AUTHSERV_ID; else process.env.CRM_INBOUND_AUTHSERV_ID = OLD_AUTHSERV;
    }
    const fRow = forged.emailId ? await P.crmEmailMessage.findUnique({ where: { id: forged.emailId }, select: { routing: true } }) : null;
    const rRow = real?.emailId ? await P.crmEmailMessage.findUnique({ where: { id: real.emailId }, select: { routing: true } }) : null;
    chk("R23-premise", (fRow?.routing as Any)?.unverifiedFrom === true && !(rRow?.routing as Any)?.unverifiedFrom,
      `stored routing: forged ${j(fRow?.routing)} · authenticated ${j(rRow?.routing)} (positive control for the flag source)`);
    const list = await ACT.listActivities(shop.ctx, shop.owner, { contactId: K.id, pageSize: 30 });
    const fa = (list.items as Any[]).find((i) => i.source === "EMAIL" && i.title === `ปลอม ${TAG}`);
    const ra = (list.items as Any[]).find((i) => i.source === "EMAIL" && i.title === `จริง ${TAG}`);
    chk("R23-dto", !!fa && fa.unverifiedFrom === true && !!ra && ra.unverifiedFrom !== true,
      `contact timeline listActivities: forged EMAIL row unverifiedFrom=${fa?.unverifiedFrom} · authenticated row unverifiedFrom=${ra?.unverifiedFrom} (rows found: ${!!fa}/${!!ra})`);
    // render the real timeline row (client component) with a stub app router
    const React = (await import("react" as string)) as Any;
    const RDS = (await import("react-dom/server" as string)) as Any;
    const ctxMod = (await import("next/dist/shared/lib/app-router-context.shared-runtime.js" as string)) as Any;
    const AI = (await import("@/app/app/sys/[id]/crm/activities/_components/ActivityItems" as string)) as Any;
    const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
    const render = (item: Any) =>
      RDS.renderToStaticMarkup(React.createElement(ctxMod.AppRouterContext.Provider, { value: router }, React.createElement("ul", null, React.createElement(AI.ActivityRow, { systemId: shop.S, item, currentUserId: shop.uid, canManage: true, nowMs: Date.now() }))));
    const hf = fa ? (render(fa) as string) : "";
    const hr = ra ? (render(ra) as string) : "";
    chk("R23-render", /ไม่ยืนยันผู้ส่ง/.test(hf) && !/ไม่ยืนยันผู้ส่ง/.test(hr) && hf.includes(`ปลอม ${TAG}`),
      `ActivityRow HTML: forged row badge=${/ไม่ยืนยันผู้ส่ง/.test(hf)} · authenticated row badge=${/ไม่ยืนยันผู้ส่ง/.test(hr)} (want true / false)`);
  });

  // ═══════════════════════ F4 · guard fails closed per family · one prefix list ═══════════════════════
  await sub("F4", async () => {
    const shop = await mkShop("f4");
    const child = (mode: string, epId: string) => {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/pending/cf5/guard-child.mts", mode, shop.tid, epId], { encoding: "utf8", env: process.env, timeout: 180_000 });
      const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith("CHILD_JSON "));
      return line ? (JSON.parse(line.slice(11)) as Any) : { error: cut(`${r.status} ${r.stderr}`, 400) };
    };
    const closed = (x: unknown) => /^WebhookGuardError: .*ยังไม่พร้อม/.test(String(x));
    const e1 = await P.webhookEndpoint.create({ data: { tenantId: shop.tid, url: "https://example.com/qc-cf5-g1", secret: "x".repeat(48), eventsJson: [], active: false } });
    const a = child("other", e1.id);
    const created = await P.webhookEndpoint.findFirst({ where: { tenantId: shop.tid, url: "https://example.com/qc-cf5-other" } });
    chk("F4-other-guard-only-fails-closed", !a.error && closed(a.toggleOnAll) && closed(a.allEvents) && closed(a.crm) && closed(a.customRecord) && closed(a.team) && closed(a.mixed) && closed(a.createAll) && !created,
      `registry = {member guard} only (CRM registration lost): toggle-on all-events → ${cut(a.toggleOnAll ?? a.error, 50)} · set [] → ${cut(a.allEvents, 30)} · [crm.*] → ${cut(a.crm, 30)} · [custom.record.*] → ${cut(a.customRecord, 30)} · [team.*] → ${cut(a.team, 30)} · [member+crm] → ${cut(a.mixed, 30)} · create [] → ${cut(a.createAll, 30)} (row created: ${!!created})`);
    const aRow = await P.webhookEndpoint.findUnique({ where: { id: e1.id }, select: { eventsJson: true, active: true } });
    chk("F4-other-guard-others-pass", a.toggleOff === "ok" && a.member === "ok" && a.noBy === "ok" && aRow?.active === false && j(aRow?.eventsJson) === j(["member.created"]),
      `same child: toggle-off → ${cut(a.toggleOff, 30)} · [member.created] → ${cut(a.member, 30)} · author-less → ${cut(a.noBy, 30)} · stored ${j(aRow?.eventsJson)} active=${aRow?.active}`);
    const e2 = await P.webhookEndpoint.create({ data: { tenantId: shop.tid, url: "https://example.com/qc-cf5-g2", secret: "x".repeat(48), eventsJson: [], active: false } });
    const b = child("crm", e2.id);
    const created2 = await P.webhookEndpoint.findFirst({ where: { tenantId: shop.tid, url: "https://example.com/qc-cf5-crm" } });
    chk("F4-crm-guard-present-passes", !b.error && b.toggleOnAll === "ok" && b.allEvents === "ok" && b.crm === "ok" && b.customRecord === "ok" && b.team === "ok" && b.mixed === "ok" && b.createAll === "ok" && !!created2 && b.guardCalls >= 7,
      `positive control — registry = {crm guard (passes)}: toggle-on ${cut(b.toggleOnAll ?? b.error, 40)} · [] ${cut(b.allEvents, 20)} · crm ${cut(b.crm, 20)} · custom.record ${cut(b.customRecord, 20)} · team ${cut(b.team, 20)} · mixed ${cut(b.mixed, 20)} · create ${cut(b.createAll, 20)} · guard ran ${b.guardCalls}×`);
    const svcSrc = readFileSync("src/lib/webhooks/service.ts", "utf8");
    const crmSrc = readFileSync("src/lib/modules/crm/api/webhook-events.ts", "utf8");
    const lists = (s: string) => (s.match(/\[\s*"crm\.",\s*"custom\.record\.",\s*"team\."\s*\]/g) ?? []).length;
    const labels = readFileSync("src/lib/webhooks/labels.ts", "utf8");
    const svc = (await import("@/lib/webhooks/service" as string)) as Any;
    const crmEv = (await import("@/lib/modules/crm/api/webhook-events" as string)) as Any;
    const lab = (await import("@/lib/webhooks/labels" as string)) as Any;
    const same = !!lab.WEBHOOK_GUARDED_FAMILIES && crmEv.CRM_EVENT_PREFIXES === lab.WEBHOOK_GUARDED_FAMILIES.crm;
    chk("F4-one-prefix-list", lists(svcSrc) === 0 && lists(crmSrc) === 0 && lists(labels) === 1 && same && j(svc.WEBHOOK_GUARDED_EVENT_PREFIXES) === j(crmEv.CRM_EVENT_PREFIXES),
      `literal prefix lists: service.ts ${lists(svcSrc)} · crm webhook-events.ts ${lists(crmSrc)} · webhooks/labels.ts ${lists(labels)} · CRM_EVENT_PREFIXES is the platform family list (same object): ${same} (want 0/0/1/true)`);
    const root = readFileSync("src/lib/webhook-guards.ts", "utf8");
    const svcImports = [...svcSrc.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    chk("F4-no-cycle", !svcImports.some((s) => /modules\//.test(String(s))) && !/from\s+"@\/lib\/modules/.test(labels) && /registerWebhookEventGuard\("crm",/.test(root),
      `service.ts imports [${svcImports.join(", ")}] (no module) · labels.ts imports no module · root registers the "crm" family: ${/registerWebhookEventGuard\("crm",/.test(root)}`);
  });
} catch (e) {
  chk("PROBE-ERR", false, String((e as Error)?.stack ?? e).slice(0, 800));
} finally {
  if (OLD_SECRET === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = OLD_SECRET;
  await done("probe-cf5");
}
