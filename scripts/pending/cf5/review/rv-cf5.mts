// C5.5-fix3b INDEPENDENT REVIEW probe — attacks the builder's claims (F5 · H24 · H25 · R23 · F4) with cases the builder did not run.
// QC2 only (ep-cool-shadow, via ../_fx.mts) · throwaway tenants `qc-cf5-rv-*` swept in done() · network blocked · own env tweaks restored.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf5/review/rv-cf5.mts [--only=F5,H24,H25,R23,F4]
// Checks named INFO-* always pass: they record an observed fact for the review note (e.g. a reproduced, known limitation).
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
const fx = await fixture("rv");
const { P, chk, mkShop, setCrm, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
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
const OLD_SECRET = process.env.SESSION_SECRET;
const OLD_AUTHSERV = process.env.CRM_INBOUND_AUTHSERV_ID;
const TENANT_IDS: string[] = [];
/** independent oracle: Thai calendar day of an instant via ICU (not the code's +7h arithmetic) */
const icuThaiDay = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

async function mkObject(shop: Any, key: string, parentType: "CONTACT" | "COMPANY", fields: { key: string; type: string; portalEditable?: boolean }[], extra: Record<string, unknown> = {}) {
  const obj = await P.customObject.create({ data: { tenantId: shop.tid, systemId: shop.S, key, label: `วัตถุ ${key}`, labelPlural: `วัตถุ ${key}`, titleFieldKey: "title", parentType, ...extra } });
  const sec = await P.memberSection.create({ data: { tenantId: shop.tid, systemId: shop.S, key: `sec${key}`, label: "ทดสอบ", objectKey: key } });
  const ids: Record<string, string> = {};
  for (const f of fields) {
    ids[f.key] = (await P.memberField.create({ data: { tenantId: shop.tid, systemId: shop.S, sectionId: sec.id, key: f.key, label: `ช่อง ${f.key}`, type: f.type, objectKey: key, ...(extra.portalVisible ? { portalVisible: true } : {}), ...(f.portalEditable ? { portalEditable: true } : {}) } })).id as string;
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
const shopOf = async (s: string, o: Record<string, unknown> = {}) => {
  const shop = await mkShop(s, o);
  TENANT_IDS.push(shop.tid);
  return shop;
};

try {
  // ═══════════════════════ F5 · boundaries (UTC+7 midnight ±1 ms), year rollover, oracle agreement ═══════════════════════
  await sub("F5", async () => {
    const AS = (await import("@/lib/modules/crm/activities-shared" as string)) as Any;
    const DS = (await import("@/lib/modules/crm/deals-shared" as string)) as Any;
    // pure: Thai today + 7 by the code vs ICU, 5000 random instants 2024-2030 + every Thai midnight ±1 ms of 2027-2028 (leap day)
    let bad = 0;
    let first = "";
    const probe = (ms: number) => {
      const code = AS.thaiDayKey(ms + 7 * 86_400_000);
      const icu = icuThaiDay(ms + 7 * 86_400_000);
      const today = DS.thaiToday(new Date(ms));
      if (code !== icu || today !== icuThaiDay(ms)) {
        bad++;
        if (!first) first = `${new Date(ms).toISOString()} code=${code} icu=${icu} today=${today}`;
      }
    };
    for (let i = 0; i < 5000; i++) probe(Date.UTC(2024, 0, 1) + Math.floor(Math.random() * 7 * 365 * 86_400_000));
    for (let d = Date.UTC(2026, 11, 31, 17); d < Date.UTC(2028, 11, 31, 17); d += 86_400_000) { probe(d); probe(d - 1); }
    chk("F5r-pure-oracle", bad === 0, `thaiDayKey(now+7d) and thaiToday vs ICU Asia/Bangkok over 5000 random + 1462 midnight±1ms instants: ${bad} mismatches ${first}`);

    const shop = await shopOf("f5");
    const bridges = (await import("@/lib/modules/crm/ai-bridges" as string)) as Any;
    const deals = (await import("@/lib/modules/crm/deals" as string)) as Any;
    const contacts = (await import("@/lib/modules/crm/contacts" as string)) as Any;
    const c = await contacts.createContact(shop.ctx, shop.owner, { firstName: "ลูกค้า", lastName: rand });
    const contactId = c.contact?.id ?? c.id;
    const mk = async (title: string, day: string) => {
      const d = await deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, stageId: shop.stages[0].id, title, contactId, expectedCloseAt: day, forecastCategory: "PIPELINE" });
      await P.crmDeal.update({ where: { id: d.id }, data: { nextActivityAt: new Date("2028-06-01T03:00:00Z"), stalledAt: null } });
      return d.id as string;
    };
    const ids: Record<string, string> = { "2026-12-24": await mk(`a ${TAG}`, "2026-12-24"), "2026-12-31": await mk(`b ${TAG}`, "2026-12-31"), "2027-01-01": await mk(`c ${TAG}`, "2027-01-01"), "2027-01-02": await mk(`d ${TAG}`, "2027-01-02") };
    // stored shape: UTC midnight of the Thai day (cleanClose)
    const stored = (await P.crmDeal.findMany({ where: { id: { in: Object.values(ids) } }, select: { id: true, expectedCloseAt: true } })) as Any[];
    chk("F5r-stored-shape", stored.every((s) => s.expectedCloseAt.toISOString().endsWith("T00:00:00.000Z")), `expectedCloseAt stored ${j(stored.map((s) => s.expectedCloseAt))}`);
    const cases: [string, string][] = [["TH 24 Dec 23:59:59.999", "2026-12-24T16:59:59.999Z"], ["TH 25 Dec 00:00:00.000", "2026-12-24T17:00:00.000Z"], ["TH 31 Dec 23:59:59.999", "2026-12-31T16:59:59.999Z"], ["TH 1 Jan 00:00", "2026-12-31T17:00:00.000Z"]];
    const lines: string[] = [];
    let ok = true;
    for (const [label, iso] of cases) {
      const now = new Date(iso);
      const r = await bridges.atRiskDeals({ tenantId: shop.tid, systemId: shop.S }, shop.owner, { now, month: "2027-01" });
      const parts: string[] = [];
      for (const [day, id] of Object.entries(ids)) {
        const reasons: string[] = r.items.find((x: Any) => x.dealId === id)?.reasons ?? [];
        const late = reasons.includes("PIPELINE_LATE_MONTH");
        const over = reasons.includes("CLOSE_OVERDUE");
        const wantLate = day <= icuThaiDay(now.getTime() + 7 * 86_400_000);
        const wantOver = day < icuThaiDay(now.getTime()); // DealBoard rule: card.expectedCloseAt < thaiToday()
        if (late !== wantLate || over !== wantOver) ok = false;
        parts.push(`${day.slice(5)}:${late ? "L" : "-"}${over ? "O" : "-"}${late !== wantLate || over !== wantOver ? "❌" : ""}`);
      }
      lines.push(`${label} → ${parts.join(" ")}`);
    }
    chk("F5r-boundaries-rollover", ok, `month=2027-01 (L=PIPELINE_LATE_MONTH, O=CLOSE_OVERDUE vs ICU oracle / DealBoard rule): ${lines.join(" | ")}`);
    // a null close date never crashes and never gets the reason
    const dn = await deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, stageId: shop.stages[0].id, title: `null ${TAG}`, contactId, forecastCategory: "PIPELINE" });
    const rn = await bridges.atRiskDeals({ tenantId: shop.tid, systemId: shop.S }, shop.owner, { now: new Date("2026-12-24T17:00:00Z"), month: "2027-01" });
    chk("F5r-null-close", !rn.items.some((x: Any) => x.dealId === dn.id && x.reasons.includes("PIPELINE_LATE_MONTH")), `deal without expectedCloseAt: ${j(rn.items.find((x: Any) => x.dealId === dn.id) ?? "not listed")}`);
  });

  // ═══════════════════════ H24 · DATE key byte-for-byte · DATETIME window edges · transition double fire ═══════════════════════
  await sub("H24", async () => {
    // pure: old DATE key formula vs new for every calendar day 1900-2100 as the engine stores it (parseYmd = Date.UTC(y,m-1,d))
    const BKK = 7 * 3_600_000;
    let diff = 0;
    let firstDiff = "";
    for (let t = Date.UTC(1900, 0, 1); t <= Date.UTC(2100, 11, 31); t += 86_400_000) {
      const v = new Date(t);
      const oldK = v.toISOString().slice(0, 10);
      const newK = new Date(v.getTime() + BKK).toISOString().slice(0, 10);
      if (oldK !== newK) { diff++; if (!firstDiff) firstDiff = oldK; }
    }
    chk("H24r-date-key-pure", diff === 0, `old key (UTC slice) vs new key (thaiYmd) for every engine-stored DATE 1900-01-01..2100-12-31: ${diff} differ ${firstDiff}`);

    const shop = await shopOf("h4");
    const AUTO = (await import("@/lib/modules/crm/automation" as string)) as Any;
    const M = (await import("@/lib/modules/member" as string)) as Any;
    const k = await mkContact(shop, "เจ้าของสัญญา");
    const { obj, ids } = await mkObject(shop, "lease", "CONTACT", [{ key: "endsAt", type: "DATETIME" }, { key: "dueOn", type: "DATE" }]);
    // DATE value through the REAL field engine writer (not a raw row)
    const recEng = await mkRecord(shop, obj.id, "CONTACT", k.id, "ENGINE", []);
    await M.fields.setFieldValues({ tenantId: shop.tid, systemId: shop.S, actorUserId: shop.uid, objectKey: "lease" }, recEng, { dueOn: "2026-10-08", endsAt: "2026-10-08T00:00:00+07:00" }, { via: "STAFF" });
    const engRows = (await P.customRecordValue.findMany({ where: { recordId: recEng }, select: { fieldId: true, valueDate: true } })) as Any[];
    const engDate = engRows.find((r) => r.fieldId === ids.dueOn)?.valueDate as Date | undefined;
    const engDt = engRows.find((r) => r.fieldId === ids.endsAt)?.valueDate as Date | undefined;
    chk("H24r-engine-shape", engDate?.toISOString() === "2026-10-08T00:00:00.000Z" && engDt?.toISOString() === "2026-10-07T17:00:00.000Z", `engine wrote DATE ${engDate?.toISOString()} · DATETIME 00:00 TH ${engDt?.toISOString()}`);

    const dt = (iso: string) => [{ fieldId: ids.endsAt!, valueDate: new Date(iso) }];
    // now = 10:00 TH 1 Oct · d=7 ⇒ window [TH 1 Oct 00:00, TH 9 Oct 00:00)
    const R: Record<string, string> = {
      in8start: await mkRecord(shop, obj.id, "CONTACT", k.id, "TH 8 Oct 00:00:00.000", dt("2026-10-07T17:00:00.000Z")),
      in8end: await mkRecord(shop, obj.id, "CONTACT", k.id, "TH 8 Oct 23:59:59.999", dt("2026-10-08T16:59:59.999Z")),
      out9start: await mkRecord(shop, obj.id, "CONTACT", k.id, "TH 9 Oct 00:00:00.000", dt("2026-10-08T17:00:00.000Z")),
      inToday0: await mkRecord(shop, obj.id, "CONTACT", k.id, "TH 1 Oct 00:00:00.000", dt("2026-09-30T17:00:00.000Z")),
      outYest: await mkRecord(shop, obj.id, "CONTACT", k.id, "TH 30 Sep 23:59:59.999", dt("2026-09-30T16:59:59.999Z")),
    };
    const rule = (fieldKey: string, d: number) => ({ name: `กฎ ${TAG} ${fieldKey} ${d}`, enabled: true, trigger: { event: "custom.record.field_due", params: { objectKey: "lease", fieldKey, daysBefore: d } }, actions: [{ type: "ADD_TAG", params: { tag: `t-${rand}` } }] });
    const names = (s: Set<string>) => Object.entries(R).filter(([, id]) => s.has(id)).map(([n]) => n).sort().join(",") || "none";
    const hits = async (d: number, now: Date) => new Set(((await AUTO.dryRun(shop.ctx, shop.owner, rule("endsAt", d), { now })).matched as Any[]).map((m) => m.recordId as string));
    const h7 = await hits(7, new Date("2026-10-01T03:00:00Z"));
    chk("H24r-d7-edges", names(h7) === "in8end,in8start,inToday0", `d=7 @10:00 TH 1 Oct → [${names(h7)}] (want in8end,in8start,inToday0 — catch-up floor = TH today 00:00; TH 9 Oct 00:00 and TH 30 Sep 23:59:59.999 out)`);
    // d=0 at the last ms of TH 1 Oct and first ms of TH 2 Oct
    const h0a = await hits(0, new Date("2026-10-01T16:59:59.999Z"));
    const h0b = await hits(0, new Date("2026-10-01T17:00:00.000Z"));
    chk("H24r-d0-edges", h0a.has(R.inToday0!) && !h0a.has(R.outYest!) && !h0b.has(R.inToday0!), `d=0 @TH 1 Oct 23:59:59.999 → [${names(h0a)}] · @TH 2 Oct 00:00 → [${names(h0b)}] (want inToday0 then not)`);
    // year rollover, d=7 at TH 25 Dec 00:00 ⇒ TH 1 Jan 2027 values are due, key #2027-01-01
    const ny0 = await mkRecord(shop, obj.id, "CONTACT", k.id, "TH 1 Jan 2027 00:00", dt("2026-12-31T17:00:00.000Z"));
    const ny2 = await mkRecord(shop, obj.id, "CONTACT", k.id, "TH 2 Jan 2027 00:00", dt("2027-01-01T17:00:00.000Z"));
    const hy = await hits(7, new Date("2026-12-24T17:00:00.000Z"));
    chk("H24r-year-rollover", hy.has(ny0) && !hy.has(ny2), `d=7 @TH 25 Dec 00:00 → 1 Jan 2027 00:00 ${hy.has(ny0)} · 2 Jan ${hy.has(ny2)} (want true/false)`);

    // cron keys: DATE key byte-equal to the OLD formula; DATETIME key = ICU Thai day of the value
    const rD = await AUTO.createRule(shop.ctx, shop.owner, rule("dueOn", 7));
    const rT = await AUTO.createRule(shop.ctx, shop.owner, rule("endsAt", 7));
    await AUTO.runCronTriggers({ now: new Date("2026-10-01T03:00:00Z"), tenantId: shop.tid });
    const runs = (await P.automationRun.findMany({ where: { ruleId: { in: [rD.id, rT.id] }, stepIndex: null }, select: { id: true, ruleId: true, eventKey: true } })) as Any[];
    const kd = runs.find((r) => r.ruleId === rD.id && String(r.eventKey).includes(`#${recEng}#`))?.eventKey;
    const oldFormulaDate = `custom.record.field_due#lease.dueOn#7#${recEng}#${engDate!.toISOString().slice(0, 10)}`;
    chk("H24r-date-key-bytes", kd === oldFormulaDate, `DATE key from cron ${j(kd)} vs old formula ${j(oldFormulaDate)} (byte-equal: ${kd === oldFormulaDate})`);
    const tk = runs.filter((r) => r.ruleId === rT.id).map((r) => String(r.eventKey));
    const keyOk = Object.entries({ in8start: "2026-10-08", in8end: "2026-10-08", inToday0: "2026-10-01" }).every(([n, day]) => tk.some((x) => x.includes(`#${R[n]}#`) && x.endsWith(`#${day}`))) && !tk.some((x) => x.includes(`#${R.out9start}#`));
    chk("H24r-datetime-keys", keyOk, `DATETIME keys: ${tk.map((x) => x.split("#").slice(-1)[0]).sort().join(",")} (want 2026-10-01, 2026-10-08 ×2; nothing for TH 9 Oct 00:00)`);

    // transition: a DATETIME value at TH 9 Oct 00:30 that the OLD code already fired on TH 1 Oct (old key = UTC slice "2026-10-08")
    const tr = await mkRecord(shop, obj.id, "CONTACT", k.id, "TRANSITION", dt("2026-10-08T17:30:00.000Z"));
    await AUTO.runCronTriggers({ now: new Date("2026-10-02T03:00:00Z"), tenantId: shop.tid }); // new code fires (key #2026-10-09)
    const first = (await P.automationRun.findFirst({ where: { ruleId: rT.id, stepIndex: null, eventKey: { contains: `#${tr}#` } }, select: { id: true, eventKey: true } })) as Any;
    if (first) await P.automationRun.update({ where: { id: first.id }, data: { eventKey: String(first.eventKey).replace(/#2026-10-09$/, "#2026-10-08") } }); // pretend it was the old code's run
    await AUTO.runCronTriggers({ now: new Date("2026-10-03T03:00:00Z"), tenantId: shop.tid });
    const all = (await P.automationRun.findMany({ where: { ruleId: rT.id, stepIndex: null, eventKey: { contains: `#${tr}#` } }, select: { eventKey: true } })) as Any[];
    chk("INFO-H24r-transition", true, `old-key run present (#2026-10-08) → next cron day created ${all.length - 1} more main run(s): ${all.map((r) => String(r.eventKey).slice(-11)).join(",")} (2 total = the admitted one-time double fire)`);
    // DATE value never re-fires across the same transition (same key)
    await AUTO.runCronTriggers({ now: new Date("2026-10-02T03:00:00Z"), tenantId: shop.tid });
    const dRuns = (await P.automationRun.count({ where: { ruleId: rD.id, stepIndex: null, eventKey: { contains: `#${recEng}#` } } })) as number;
    chk("H24r-date-no-refire", dRuns === 1, `DATE record main runs after 3 cron days: ${dRuns} (want 1)`);
  });

  // ═══════════════════════ H25 · portal text = staff text at edge times · edit flow before/after ═══════════════════════
  await sub("H25", async () => {
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) process.env.SESSION_SECRET = `qc-cf5-rv-only-${randomBytes(16).toString("hex")}`;
    const shop = await shopOf("h5", { portal: true });
    const CS = (await import("@/lib/modules/member/customer-session" as string)) as Any;
    const portal = (await import("@/lib/modules/crm/portal" as string)) as Any;
    const types = (await import("@/components/crm/objects/types" as string)) as Any;
    const party = await P.party.create({ data: { tenantId: shop.tid, name: `Co ${TAG}`, kind: "COMPANY" } });
    const co = await P.crmCompany.create({ data: { tenantId: shop.tid, systemId: shop.S, partyId: party.id, name: `Co ${TAG}`, ownerUserId: shop.uid } });
    const k = await mkContact(shop, "ผู้ติดต่อพอร์ทัล", `${TAG}-portal@qc.invalid`);
    await P.crmCompanyContact.create({ data: { tenantId: shop.tid, companyId: co.id, contactId: k.id, isPrimary: true } });
    const access = await P.crmPortalAccess.create({ data: { tenantId: shop.tid, systemId: shop.S, companyId: co.id, contactId: k.id, role: "ADMIN", invitedById: shop.uid, acceptedAt: new Date(), loginMethods: ["EMAIL_OTP"] } });
    const edges = ["2026-10-08T17:00:00.000Z", "2026-10-09T16:59:59.999Z", "2026-10-09T05:00:00.000Z", "2026-12-31T17:00:00.000Z", "2027-01-01T05:00:00.000Z"];
    const fields = edges.map((_, i) => ({ key: `t${i}`, type: "DATETIME", portalEditable: i === 0 }));
    const { obj, ids } = await mkObject(shop, "visit", "COMPANY", [...fields, { key: "d", type: "DATE", portalEditable: true }], { portalVisible: true });
    const rec = await mkRecord(shop, obj.id, "COMPANY", co.id, `เยี่ยม ${TAG}`, [...edges.map((iso, i) => ({ fieldId: ids[`t${i}`]!, valueDate: new Date(iso) })), { fieldId: ids.d!, valueDate: new Date("2026-10-09T00:00:00.000Z") }]);
    const s = await CS.mintPortalSession(access.id, {});
    const r = await portal.getRecord(s.token, rec);
    const v = (key: string) => (r.fields as Any[]).find((f) => f.key === key);
    const rows = edges.map((iso, i) => ({ iso, portal: v(`t${i}`)?.value, staff: types.displayValue(new Date(iso).toISOString(), [], "DATETIME") }));
    chk("H25r-equal-staff", rows.every((x) => x.portal === x.staff), rows.map((x) => `${x.iso} → "${x.portal}" | staff "${x.staff}"`).join(" · "));
    // edit flow: what the box is seeded with, then what the server does with it (old seed, new seed, a typed ISO)
    const seed = v("t0")?.value as string;
    const tryChange = async (value: string, fieldKey = "t0") => {
      try {
        return `ok ${(await portal.requestRecordChange(s.token, rec, { fieldKey, value })).requestId ? "request created" : ""}`;
      } catch (e) {
        return `refused: ${String((e as Error)?.message ?? e).slice(0, 90)}`;
      }
    };
    const newSeed = await tryChange(seed);
    const oldSeed = await tryChange("2026-10-08"); // what the box held before this card (UTC date of 9 Oct 00:00 TH)
    const typed = await tryChange("2026-10-09T09:30:00+07:00");
    const dateSeed = await tryChange(v("d")?.value as string, "d");
    chk("H25r-edit-flow", /^refused/.test(oldSeed) && /^refused/.test(newSeed) && /^ok/.test(typed) && /^ok/.test(dateSeed),
      `DATETIME editable=${v("t0")?.editable}: seed now "${seed}" → ${newSeed} · old seed "2026-10-08" → ${oldSeed} · typed ISO → ${typed} · DATE seed "${v("d")?.value}" → ${dateSeed} (no regression iff old seed was ALSO refused)`);
    await P.portalSession.deleteMany({ where: { portalAccessId: access.id } }).catch(() => undefined);
  });

  // ═══════════════════════ R23 · scoping of the flag lookup · surfaces that list EMAIL activities ═══════════════════════
  await sub("R23", async () => {
    const shop = await shopOf("r3");
    const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
    const EM = (await import("@/lib/modules/crm/emails" as string)) as Any;
    const ACT = (await import("@/lib/modules/crm/activities" as string)) as Any;
    const CON = (await import("@/lib/modules/crm/contacts" as string)) as Any;
    const deps = { transport: async () => ({ ok: true, id: "copy" }) };
    const keyGen = () => Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
    const KEY = keyGen();
    await setCrm(shop.S, { email: { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null } });
    const dom = `cust-${rand}.test`;
    const K = await mkContact(shop, "ลูกค้าอีเมล", `buyer@${dom}`);
    let n = 0;
    const mail = (to: string, from: string, o: Record<string, unknown> = {}) => ({ messageId: `<${TAG}-${++n}@rv.test>`, from, to: [to], cc: [], subject: `เรื่อง ${TAG} ${n}`, text: "สวัสดี", html: "<p>สวัสดี</p>", headers: {}, attachments: [], ...o });
    const forged = await EM.ingestInbound(mail(`crm+${KEY}@shark.in.th`, K.email, { subject: `ปลอม ${TAG}` }), deps);
    // a 2nd CRM system in the SAME tenant with its own forged mail
    const S2 = (await sysSvc.createSystem(shop.tid, "CRM", `CRM2 ${TAG}`)).id as string;
    const KEY2 = keyGen();
    await setCrm(S2, { uiVersion: 2, email: { inboundEnabled: true, inboundKey: KEY2, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null } });
    const party2 = await P.party.create({ data: { tenantId: shop.tid, name: `S2 ${TAG}`, kind: "PERSON" } });
    const K2 = await P.crmContact.create({ data: { tenantId: shop.tid, systemId: S2, name: `S2 ${TAG}`, firstName: "S2", partyId: party2.id, ownerUserId: shop.uid, email: `other@${dom}` } });
    const f2 = await EM.ingestInbound(mail(`crm+${KEY2}@shark.in.th`, K2.email, { subject: `ปลอม2 ${TAG}` }), deps);
    // and another TENANT's forged mail
    const shopB = await shopOf("r3b");
    const KEYB = keyGen();
    await setCrm(shopB.S, { email: { inboundEnabled: true, inboundKey: KEYB, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null } });
    const KB = await mkContact(shopB, "ลูกค้าร้าน B", `b@${dom}`);
    const fB = await EM.ingestInbound(mail(`crm+${KEYB}@shark.in.th`, KB.email, { subject: `ปลอมB ${TAG}` }), deps);
    const flagged = async (id: string | undefined) => (id ? (((await P.crmEmailMessage.findUnique({ where: { id }, select: { routing: true } })) as Any)?.routing?.unverifiedFrom === true) : false);
    chk("R23r-premise", !!forged.emailId && (await flagged(forged.emailId)) && (await flagged(f2.emailId)) && (await flagged(fB.emailId)), `forged mails stored flagged: A ${await flagged(forged.emailId)} · same-tenant S2 ${await flagged(f2.emailId)} · tenant B ${await flagged(fB.emailId)}`);
    // shop A system S: inbound EMAIL activities whose sourceRef points at the S2 message and at tenant B's message
    const base = { tenantId: shop.tid, systemId: shop.S, contactId: K.id, type: "EMAIL", source: "EMAIL", direction: "IN", doneAt: new Date(), ownerUserId: shop.uid };
    const xs = await P.crmActivity.create({ data: { ...base, title: `ข้ามระบบ ${TAG}`, sourceRef: f2.emailId } });
    const xt = await P.crmActivity.create({ data: { ...base, title: `ข้ามร้าน ${TAG}`, sourceRef: fB.emailId } });
    const list = await ACT.listActivities(shop.ctx, shop.owner, { contactId: K.id, pageSize: 50 });
    const it = (id: string) => (list.items as Any[]).find((i) => i.id === id);
    const own = (list.items as Any[]).find((i) => i.source === "EMAIL" && i.title === `ปลอม ${TAG}`);
    chk("R23r-scope", own?.unverifiedFrom === true && !!it(xs.id) && it(xs.id).unverifiedFrom === undefined && !!it(xt.id) && it(xt.id).unverifiedFrom === undefined,
      `own forged row flag=${own?.unverifiedFrom} · row → other system's flagged mail flag=${it(xs.id)?.unverifiedFrom} · row → other tenant's flagged mail flag=${it(xt.id)?.unverifiedFrom} (want true/undefined/undefined)`);
    // the contact 360 "🕒 ไทม์ไลน์" panel (same page, separate list from CrmActivityBlock)
    const c360 = await CON.getContact360(shop.ctx, shop.owner, K.id);
    const t = (c360.timeline as Any[]).find((x) => x.title === `ปลอม ${TAG}`);
    chk("R23r-360-timeline", !!t && (t as Any).unverifiedFrom === true,
      `getContact360().timeline row for the forged mail: ${j(t)} — keys ${t ? Object.keys(t).join(",") : "-"} (this list renders as the "🕒 ไทม์ไลน์" card on the contact page / "ไทม์ไลน์รวม" on the company page, and is returned by REST contacts.get360)`);
    // static: every list built from `enrich` is the only producer of ActivityListItem
    const src = readFileSync("src/lib/modules/crm/activities.ts", "utf8");
    chk("R23r-one-query", (src.match(/crmEmailMessage\.findMany/g) ?? []).length === 1 && /tenantId: ctx\.tenantId, systemId: ctx\.systemId, id: \{ in: emailIds \}/.test(src),
      `activities.ts crmEmailMessage.findMany sites: ${(src.match(/crmEmailMessage\.findMany/g) ?? []).length} (one batched query per page, scoped tenantId+systemId)`);
    const shared = readFileSync("src/lib/modules/crm/emails-shared.ts", "utf8");
    const imps = [...shared.matchAll(/^import[^;]*from\s+"([^"]+)"/gm)].map((m) => m[1]);
    chk("R23r-client-safe", !imps.some((s) => /prisma|core\/db|env|^next|server-only|\.\/db|\.\/emails$/.test(String(s))), `emails-shared imports: ${imps.join(", ")}`);
  });

  // ═══════════════════════ F4 · guard registry variants · names that dodge the prefix · dispatch reach ═══════════════════════
  await sub("F4", async () => {
    const shop = await shopOf("f4");
    const child = (mode: string, epId: string) => {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/pending/cf5/review/rv-guard-child.mts", mode, shop.tid, epId], { encoding: "utf8", env: process.env, timeout: 180_000 });
      const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith("CHILD_JSON "));
      return line ? (JSON.parse(line.slice(11)) as Any) : { error: `${r.status} ${String(r.stderr).slice(0, 400)}` };
    };
    const closed = (x: unknown) => /^WebhookGuardError: .*ยังไม่พร้อม/.test(String(x));
    const e1 = await P.webhookEndpoint.create({ data: { tenantId: shop.tid, url: "https://example.com/qc-cf5-rv1", secret: "x".repeat(48), eventsJson: [], active: false } });
    const a = child("CRM-upper", e1.id);
    chk("F4r-wrong-name-fails-closed", !a.error && closed(a.all) && closed(a.crm) && closed(a.unknownCrm) && closed(a.toggleOn) && closed(a.mixed) && a.guardCalls === 0,
      `guard registered (JS, bypassing the type) under "CRM" only: [] → ${a.all ?? a.error} · [crm.deal.won] → ${a.crm} · [crm.nope.unknown] → ${a.unknownCrm} · toggle-on [] → ${a.toggleOn} · [member.created, team.updated] → ${a.mixed} · guard ran ${a.guardCalls}×`);
    const b = child("two", e1.id);
    chk("F4r-crm-plus-other", !b.error && b.all === "ok" && b.crm === "ok" && b.guardCalls >= 2, `guards under "member" AND "crm": [] → ${b.all ?? b.error} · crm → ${b.crm} · guard ran ${b.guardCalls}× (both run)`);

    // real composition root, v2 shop, author with no membership (actor null ⇒ the CRM guard refuses CRM events)
    const svc = (await import("@/lib/webhooks/service" as string)) as Any;
    const lookup = async () => "93.184.216.34";
    const nobody = { userId: null };
    const tryCreate = async (events: string[] | undefined, tag: string) => {
      try {
        const r = await svc.createEndpoint({ tenantId: shop.tid }, { url: `https://example.com/qc-cf5-rv-${tag}`, ...(events ? { events } : {}), by: nobody }, { lookup });
        return { ok: true, id: r.id as string };
      } catch (e) {
        return { ok: false, err: String((e as Error)?.message ?? e).slice(0, 60) };
      }
    };
    const real = await tryCreate(["crm.deal.won"], "real");
    const undef = await tryCreate(undefined, "undef");
    const variants: Record<string, Any> = {};
    for (const [tag, ev] of Object.entries({ lead: " crm.deal.won", upper: "CRM.deal.won", trail: "crm.deal.won ", tab: "\tcrm.deal.won" })) variants[tag] = await tryCreate([ev], tag);
    chk("F4r-real-root-refuses", !real.ok && !undef.ok, `real root, actor null, v2 shop: [crm.deal.won] → ${real.ok ? "CREATED" : real.err} · events omitted (= all) → ${undef.ok ? "CREATED" : undef.err}`);
    // variants that dodge the prefix are stored — do they ever receive a CRM event?
    const okFetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;
    for (const v of Object.values(variants)) if (v.ok) await P.webhookEndpoint.update({ where: { id: v.id }, data: { active: true } });
    const sent = await svc.dispatchWebhooks({ tenantId: shop.tid, type: "crm.deal.won", payload: { dealId: "x" } }, { lookup, fetchFn: okFetch });
    const varIds = Object.values(variants).filter((v: Any) => v.ok).map((v: Any) => v.id as string);
    const reached = (await P.webhookDelivery.count({ where: { tenantId: shop.tid, endpointId: { in: varIds } } })) as number;
    chk("F4r-variants-never-delivered", reached === 0, `variants stored: ${Object.entries(variants).map(([k2, v]) => `${k2}=${v.ok ? "stored" : "refused"}`).join(" ")} · dispatch crm.deal.won delivered ${sent} · deliveries to the variant endpoints: ${reached} (want 0 — dispatch matches exact strings)`);
    // static: only the composition root registers, and only family names
    const rg = spawnSync("grep", ["-rn", "registerWebhookEventGuard(", "src"], { encoding: "utf8" }).stdout.trim().split("\n").filter((l) => !/service\.ts:.*export function/.test(l) && !/^[^:]+:\d+:\s*(\/\/|\*)/.test(l));
    chk("F4r-single-registrar", rg.length === 1 && /webhook-guards\.ts:.*registerWebhookEventGuard\("crm",/.test(rg[0] ?? ""), `register call sites: ${rg.join(" | ")}`);
    const lab = readFileSync("src/lib/webhooks/labels.ts", "utf8");
    const labImports = [...lab.matchAll(/^import[^;]*from\s+"([^"]+)"/gm)].map((m) => m[1]);
    const autoLab = readFileSync("src/lib/automation/labels.ts", "utf8");
    chk("F4r-labels-client-safe", labImports.every((s) => s === "@/lib/automation/labels") && !/^import /m.test(autoLab), `labels.ts imports [${labImports.join(", ")}] · automation/labels.ts imports: ${/^import /m.test(autoLab) ? "some" : "none"}`);
  });
} catch (e) {
  chk("PROBE-ERR", false, String((e as Error)?.stack ?? e).slice(0, 900));
} finally {
  if (OLD_SECRET === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = OLD_SECRET;
  if (OLD_AUTHSERV === undefined) delete process.env.CRM_INBOUND_AUTHSERV_ID; else process.env.CRM_INBOUND_AUTHSERV_ID = OLD_AUTHSERV;
  await done("rv-cf5", async () => {
    // rate-limit buckets carry the tenant id only inside the key (no tenantId column)
    for (const t of TENANT_IDS) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${t}%`);
  });
}
