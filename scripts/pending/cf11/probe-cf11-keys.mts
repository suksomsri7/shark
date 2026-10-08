// probe — CRM C5.5-fix8 (authz-sweep review F2 · F3 · F4 · F5): API-key minting/rotation doors and the account REST webhook test
//   K1 (F2) account page createApiKeyAction — a crafted form with no scope and no bundle minted a scope-less ("legacy") key
//   K2 (F3) account page rotateApiKeyAction — rotation copied ANY scopes of an account-bound key (crm.* / member.* minted before S1,
//           scope-less, malformed) ⇒ renewable forever · must re-validate against the create allow-list and refuse (no silent drop)
//   K3 (F4) kanban page createKanbanApiKeyAction — accepted any bundle (crm.admin · member-admin · account bundles)
//   K4 mirror check (expected green at base): CRM page / member page refuse foreign bundles
//   W1 (F5) account REST webhooks.test — sent crm.* / member.* test events to any endpoint · must accept only registered account.* events
//   W2 positive: every account event's test (page button = Thai label, and the raw value) and REST test still deliver
// QC3 ONLY · throwaway tenants `qc-cf11-k-*` · network blocked (deliveries fail; a WebhookDelivery row = dispatched)
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//        bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf11/probe-cf11-keys.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const { ctx } = (await import("./_ctx.mts" as string)) as { ctx: (l: string) => Promise<Any> };
const X = await ctx("k");
const { P, TAG, chk, j, cut, sysSvc, setCrm, mkUser, member, mkTenant, inScope, sessionCookie, fdx, call, errText, sub, done } = X;
const THAI = /[ก-๙]/;
const SC = (await import("@/lib/api-keys/scopes" as string)) as Any;
const LB = (await import("@/lib/webhooks/labels" as string)) as Any;
const KS = (await import("@/lib/api-keys/service" as string)) as Any;

const tA = await mkTenant("a");
const owner = await mkUser("-owner");
await member(owner, tA, "OWNER");
const mgr = await mkUser("-mgr");
await member(mgr, tA, "MANAGER", ["qc-branch-only"]);
const A = (await sysSvc.createSystem(tA, "ACCOUNT", `บัญชี ${TAG}`)).id as string;
const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
await accSvc.saveSettings(tA, A, { orgName: `QC ${TAG}`, taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
const oCookie = await sessionCookie(owner, tA);
const mCookie = await sessionCookie(mgr, tA);
const CONN = (await import("@/lib/modules/account/connections-actions" as string)) as Any;
const cp = `/app/sys/${A}/account/settings/connections`;
const keysOf = (name: string) => P.apiKey.findMany({ where: { tenantId: tA, name }, select: { id: true, scopesJson: true, systemId: true, revokedAt: true, rotatedFromId: true }, orderBy: { createdAt: "asc" } });

await sub("K1 account page — scope-less key (F2)", async () => {
  const none = await call(() => inScope(mCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-k1-none`, ttlDays: "30" }))));
  const blank = await call(() => inScope(mCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-k1-blank`, ttlDays: "30", scope: ["", "   "] }))));
  const ownerNone = await call(() => inScope(oCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-k1-onone`, ttlDays: "0" }))));
  const rows = [...(await keysOf(`${TAG}-k1-none`)), ...(await keysOf(`${TAG}-k1-blank`)), ...(await keysOf(`${TAG}-k1-onone`))];
  const refused = (r: Any) => r.ok && r.v?.ok === false && THAI.test(String(r.v?.reason));
  chk("K1.1", refused(none) && refused(blank) && refused(ownerNone) && rows.length === 0,
    `crafted form, no scope + no bundle: MANAGER → ${errText(none)} · blank scopes → ${errText(blank)} · OWNER → ${errText(ownerNone)} · keys minted=${rows.length} ${j(rows.map((k: Any) => k.scopesJson))} (want refused, 0)`);
  const def = await call(() => inScope(mCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-k1-def`, ttlDays: "30", bundle: "issue-and-collect" }))));
  const tick = await call(() => inScope(mCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-k1-tick`, ttlDays: "30", scope: ["account.doc.view"] }))));
  const full = await call(() => inScope(oCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-k1-full`, ttlDays: "0", scope: [...(SC.ACCOUNT_SCOPE_KEYS as string[])] }))));
  const bundles = ["read-only", "issue-and-collect", "accountant", "danger", "settings"];
  const bOut: string[] = [];
  for (const b of bundles) {
    const r = await call(() => inScope(oCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-k1-b-${b}`, ttlDays: "30", bundle: b }))));
    const k = (await keysOf(`${TAG}-k1-b-${b}`))[0];
    bOut.push(`${b}:${r.v?.ok === true && k && (k.scopesJson as string[]).length > 0 ? "ok" : errText(r)}`);
  }
  const fullRow = (await keysOf(`${TAG}-k1-full`))[0];
  chk("K1.2", def.v?.ok === true && tick.v?.ok === true && full.v?.ok === true && (fullRow?.scopesJson as string[] | undefined)?.length === (SC.ACCOUNT_SCOPE_KEYS as string[]).length && bOut.every((x) => x.endsWith(":ok")),
    `positive: MANAGER bundle issue-and-collect → ${def.v?.ok ? "ok" : errText(def)} · MANAGER ticked [account.doc.view] → ${tick.v?.ok ? "ok" : errText(tick)} · OWNER whole ACCOUNT_SCOPE_KEYS (${(SC.ACCOUNT_SCOPE_KEYS as string[]).length}) → ${full.v?.ok ? "ok" : errText(full)} · every account bundle by OWNER: ${bOut.join(" ")}`);
});

await sub("K2 account page — rotation re-validates scopes (F3)", async () => {
  // keys as they could exist in a shop today: minted before S1/F2 (account page accepted anything) or hand-edited rows
  const mk = async (suffix: string, scopes: string[], systemId: string | null) =>
    (await KS.createApiKey({ tenantId: tA }, `${TAG}-k2-${suffix}`, { scopes, systemId, expiresAt: new Date(Date.now() + 30 * 86_400_000), createdById: owner })).id as string;
  const bad: [string, string[] | null, string | null][] = [
    ["crm", ["account.doc.view", "crm.contact.read"], A],
    ["member", ["member.customer.read"], A],
    ["empty", [], A],
    ["filter", ["account.doc.view", "crm.filter.team:abcdefgh12"], A],
    ["malformed", null, A],
    ["unbound-crm", ["account.doc.view", "pos.sale.create"], null],
  ];
  const out: string[] = [];
  let leaks = 0;
  let hfWording = false;
  for (const [suffix, scopes, sys] of bad) {
    let id: string;
    if (scopes === null) {
      id = await mk(suffix, ["account.doc.view"], sys);
      await P.$executeRawUnsafe(`UPDATE "ApiKey" SET "scopesJson" = '{"x":1}'::jsonb WHERE "id" = $1`, id);
    } else {
      id = await mk(suffix, ["account.doc.view"], sys);
      // write the exact raw list (a crm filter pseudo-scope / unregistered key cannot pass createApiKey) — the row an old door or a hand edit left
      await P.$executeRawUnsafe(`UPDATE "ApiKey" SET "scopesJson" = $1::jsonb WHERE "id" = $2`, JSON.stringify(scopes), id);
    }
    const r = await call(() => inScope(oCookie, cp, () => CONN.rotateApiKeyAction(fdx({ systemId: A, id }))));
    const rows = await keysOf(`${TAG}-k2-${suffix}`);
    const old = rows.find((k: Any) => k.id === id);
    const children = rows.filter((k: Any) => k.rotatedFromId === id);
    const refused = r.ok && r.v?.ok === false && THAI.test(String(r.v?.reason)) && !old?.revokedAt && children.length === 0;
    if (!refused) leaks += 1;
    if (suffix === "malformed" && r.v?.reason === "ข้อมูลสิทธิ์ของคีย์นี้ในระบบไม่สมบูรณ์ จึงหมุนคีย์ให้ไม่ได้ — เพิกถอนคีย์นี้แล้วสร้างคีย์ใหม่แทน") hfWording = true;
    out.push(`${suffix}:${refused ? `refused «${cut(r.v?.reason, 70)}»` : `${errText(r)} old.revoked=${!!old?.revokedAt} new=${children.length} ${j(children.map((k: Any) => k.scopesJson))}`}`);
  }
  chk("K2.1", leaks === 0, `OWNER rotates account-page keys whose scopes the create door would refuse → ${out.join(" · ")} (want refused, old key untouched, no new key)`);
  chk("K2.2", hfWording, `malformed scopesJson → the same Thai sentence as hotfix/apiv1-scope's rotateApiKey (merge-compatible)`);
  const okCases: [string, string[], string | null][] = [
    ["acc", ["account.doc.view", "account.contact.manage"], A],
  ];
  const pos: string[] = [];
  let posBad = 0;
  for (const [suffix, scopes, sys] of okCases) {
    const id = await mk(suffix, scopes, sys);
    const r = await call(() => inScope(oCookie, cp, () => CONN.rotateApiKeyAction(fdx({ systemId: A, id }))));
    const rows = await keysOf(`${TAG}-k2-${suffix}`);
    const old = rows.find((k: Any) => k.id === id);
    const child = rows.find((k: Any) => k.rotatedFromId === id);
    const good = r.v?.ok === true && typeof r.v?.rawKey === "string" && !!old?.revokedAt && !!child && j(child.scopesJson) === j(scopes) && child.systemId === sys;
    if (!good) posBad += 1;
    pos.push(`${suffix}:${good ? "rotated" : `${errText(r)} old.revoked=${!!old?.revokedAt} child=${j(child?.scopesJson)}`}`);
  }
  // a key of another system (CRM) is still "not here" (C5.4-B H2, unchanged)
  const C = (await sysSvc.createSystem(tA, "CRM", `CRM ${TAG}`)).id as string;
  const crmKey = await mk("crmbound", ["crm.contact.read"], C);
  const r = await call(() => inScope(oCookie, cp, () => CONN.rotateApiKeyAction(fdx({ systemId: A, id: crmKey }))));
  // r2 (RV-5 · Q2 ruling): unbound keys — the shop's general key `[]` and an unbound account-scoped key — are managed only on
  //   /app/settings/api ⇒ the account page answers "not here" for rotate AND revoke, and the keys stay untouched
  const unb: string[] = [];
  let unbBad = 0;
  for (const [suffix, scopes] of [["general", []], ["unbound-acc", ["account.doc.view"]]] as [string, string[]][]) {
    const id = await mk(suffix, scopes, null);
    const rr = await call(() => inScope(oCookie, cp, () => CONN.rotateApiKeyAction(fdx({ systemId: A, id }))));
    const rv = await call(() => inScope(oCookie, cp, () => CONN.revokeApiKeyAction(fdx({ systemId: A, id }))));
    const rows = await keysOf(`${TAG}-k2-${suffix}`);
    const good = String(rr.v?.reason).startsWith("ไม่พบคีย์นี้ในหน้าการเชื่อมต่อของบัญชี") && String(rv.v?.reason).startsWith("ไม่พบคีย์นี้ในหน้าการเชื่อมต่อของบัญชี") && rows.length === 1 && !rows[0].revokedAt;
    if (!good) unbBad += 1;
    unb.push(`${suffix}:${good ? "not here (rotate+revoke)" : `rotate ${errText(rr)} · revoke ${errText(rv)} rows=${rows.length} revoked=${!!rows[0]?.revokedAt}`}`);
  }
  chk("K2.3", posBad === 0 && unbBad === 0 && r.v?.ok === false && String(r.v?.reason).startsWith("ไม่พบคีย์นี้ในหน้าการเชื่อมต่อของบัญชี"),
    `positive: ${pos.join(" · ")} · r2 unbound keys: ${unb.join(" · ")} · control: CRM-bound key → ${errText(r)}`);
});

await sub("K3 kanban page — bundles limited to kanban (F4)", async () => {
  const K = (await sysSvc.createSystem(tA, "KANBAN", `บอร์ด ${TAG}`)).id as string;
  const KA = (await import("@/lib/modules/kanban/settings-actions" as string)) as Any;
  const kp = `/app/sys/${K}/kanban/settings`;
  const foreign = ["crm.admin", "crm.readonly", "member-admin", "member-read", "accountant", "read-only", "settings", "qc-nope"];
  const out: string[] = [];
  let leaks = 0;
  for (const b of foreign) {
    const r = await call(() => inScope(oCookie, kp, () => KA.createKanbanApiKeyAction(fdx({ systemId: K, name: `${TAG}-k3-${b}`, bundle: b, ttlDays: "30" }))));
    const rows = await keysOf(`${TAG}-k3-${b}`);
    const refused = r.ok && r.v?.ok === false && rows.length === 0;
    if (!refused) leaks += 1;
    out.push(`${b}:${refused ? "refused" : `${errText(r)} rows=${rows.length} ${j(rows.map((k: Any) => k.scopesJson))}`}`);
  }
  chk("K3.1", leaks === 0, `OWNER on the kanban key page with foreign bundles → ${out.join(" · ")} (want refused, no key)`);
  const pos: string[] = [];
  let posBad = 0;
  for (const b of ["kanban-read", "kanban-edit", "kanban-admin", ""]) {
    const r = await call(() => inScope(oCookie, kp, () => KA.createKanbanApiKeyAction(fdx({ systemId: K, name: `${TAG}-k3-ok-${b || "default"}`, ...(b ? { bundle: b } : {}), ttlDays: "30" }))));
    const k = (await keysOf(`${TAG}-k3-ok-${b || "default"}`))[0];
    const sc = (k?.scopesJson ?? []) as string[];
    const good = r.v?.ok === true && !!k && k.systemId === K && sc.length > 0 && sc.every((s) => (SC.KANBAN_SCOPE_KEYS as string[]).includes(s)) && j(sc) === j(SC.expandBundles([b || "kanban-read"]));
    if (!good) posBad += 1;
    pos.push(`${b || "(none→kanban-read)"}:${good ? `ok(${sc.length})` : errText(r)}`);
  }
  chk("K3.2", posBad === 0, `positive: ${pos.join(" · ")}`);
});

await sub("K4 mirror — CRM / member key pages refuse foreign bundles (control)", async () => {
  const C2 = (await sysSvc.createSystem(tA, "CRM", `CRM v2 ${TAG}`)).id as string;
  await setCrm(C2, { uiVersion: 2 });
  const M = (await sysSvc.createSystem(tA, "MEMBER", `สมาชิก ${TAG}`)).id as string;
  const CA = (await import("../../../src/app/app/sys/[id]/crm/settings/api/actions.ts" as string)) as Any;
  const MA = (await import("@/lib/modules/member/api-actions" as string)) as Any;
  const out: string[] = [];
  let leaks = 0;
  for (const b of ["kanban-admin", "member-admin", "accountant", "settings"]) {
    const r = await call(() => inScope(oCookie, `/app/sys/${C2}/crm/settings/api`, () => CA.createCrmApiKeyAction(fdx({ systemId: C2, name: `${TAG}-k4c-${b}`, bundle: b }))));
    const rows = await keysOf(`${TAG}-k4c-${b}`);
    if (!(r.v?.ok === false && rows.length === 0)) leaks += 1;
    out.push(`crm:${b}:${r.v?.ok === false && rows.length === 0 ? "refused" : errText(r)}`);
  }
  for (const b of ["crm.admin", "kanban-admin", "accountant", "settings"]) {
    const r = await call(() => inScope(oCookie, `/app/sys/${M}/member/settings/api`, () => MA.createMemberApiKeyAction(fdx({ systemId: M, name: `${TAG}-k4m-${b}`, bundle: b }))));
    const rows = await keysOf(`${TAG}-k4m-${b}`);
    if (!(r.v?.ok === false && rows.length === 0)) leaks += 1;
    out.push(`member:${b}:${r.v?.ok === false && rows.length === 0 ? "refused" : errText(r)}`);
  }
  const cOk = await call(() => inScope(oCookie, `/app/sys/${C2}/crm/settings/api`, () => CA.createCrmApiKeyAction(fdx({ systemId: C2, name: `${TAG}-k4c-ok`, bundle: "crm.readonly" }))));
  const mOk = await call(() => inScope(oCookie, `/app/sys/${M}/member/settings/api`, () => MA.createMemberApiKeyAction(fdx({ systemId: M, name: `${TAG}-k4m-ok`, bundle: "member-read" }))));
  chk("K4.1", leaks === 0 && cOk.v?.ok === true && mOk.v?.ok === true, `${out.join(" · ")} · positive crm.readonly → ${cOk.v?.ok ? "ok" : errText(cOk)} · member-read → ${mOk.v?.ok ? "ok" : errText(mOk)}`);
});

await sub("W account REST webhooks.test (F5) + every account event's test (page + REST)", async () => {
  const allEp = await P.webhookEndpoint.create({ data: { tenantId: tA, url: "https://example.com/qc-cf11-all", secret: "x".repeat(48), eventsJson: [], active: true } });
  const crmEp = await P.webhookEndpoint.create({ data: { tenantId: tA, url: "https://example.com/qc-cf11-crm", secret: "y".repeat(48), eventsJson: ["crm.deal.won"], active: true } });
  const restKey = await call(() => inScope(oCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-w-key`, ttlDays: "30", scope: ["account.settings.manage"] }))));
  const raw = restKey.v?.rawKey as string;
  const ACC = (await import("../../../src/app/api/v1/account/[...path]/route.ts" as string)) as Any;
  let n = 0;
  const restTest = async (epId: string, event: string) => {
    const r = await ACC.POST(
      new Request(`http://qc.invalid/api/v1/account/webhooks/${epId}/test`, {
        method: "POST",
        headers: { authorization: `Bearer ${raw}`, "content-type": "application/json", "idempotency-key": `${TAG}-w-${++n}` },
        body: j({ event }),
      }),
      { params: Promise.resolve({ path: ["webhooks", epId, "test"] }) },
    );
    return { status: r.status as number, body: await r.text() };
  };
  const rowsOf = (epId: string, type: string) => P.webhookDelivery.count({ where: { tenantId: tA, endpointId: epId, eventType: type } });
  const foreign = ["crm.deal.won", "member.created", "chat.message.received"].filter((e) => (LB.WEBHOOK_EVENTS as Any[]).some((w) => w.value === e));
  const out: string[] = [];
  let leaks = 0;
  for (const ev of foreign) {
    for (const ep of [crmEp.id, allEp.id]) {
      const r = await restTest(ep, ev);
      const rows = await rowsOf(ep, ev);
      const refused = r.status === 422 && rows === 0 && THAI.test(r.body);
      if (!refused) leaks += 1;
      out.push(`${ev}@${ep === crmEp.id ? "crmEp" : "allEp"}:${r.status} rows=${rows}${refused ? "" : ` ${cut(r.body, 80)}`}`);
    }
  }
  chk("W1.1", leaks === 0 && foreign.length >= 2, `REST webhooks.test with non-account registered events → ${out.join(" · ")} (want 422 + Thai, 0 rows)`);
  const unk = await restTest(allEp.id, "account.qc.fake");
  chk("W1.2", unk.status === 422 && (await rowsOf(allEp.id, "account.qc.fake")) === 0, `unknown event → ${unk.status} ${cut(unk.body, 90)} (unchanged: 422)`);
  const accEv = (LB.WEBHOOK_EVENTS as Any[]).filter((w) => String(w.value).startsWith("account."));
  const restBad: string[] = [];
  for (const w of accEv) {
    const r = await restTest(allEp.id, w.value);
    if (!(r.status === 200 && (await rowsOf(allEp.id, w.value)) === 1)) restBad.push(`${w.value}:${r.status} ${cut(r.body, 60)}`);
  }
  chk("W2.1", accEv.length >= 15 && restBad.length === 0, `positive: REST test of every account event (${accEv.length}) on one endpoint → 200 + 1 delivery row each · failures: ${restBad.join(" · ") || "none"}`);
  const pageBad: string[] = [];
  for (const w of accEv) {
    for (const t of [w.label as string, w.value as string]) {
      const before = await P.webhookDelivery.count({ where: { tenantId: tA, eventType: w.value } });
      const r = await call(() => inScope(oCookie, cp, () => CONN.testWebhookAction(fdx({ systemId: A, type: t }))));
      const after = await P.webhookDelivery.count({ where: { tenantId: tA, eventType: w.value } });
      if (!(r.ok && after > before)) pageBad.push(`${t}:${errText(r)} rows ${before}→${after}`);
    }
  }
  chk("W2.2", pageBad.length === 0, `positive: page test button of every account event (Thai label as the panel sends, and the raw value) dispatches · failures: ${pageBad.join(" · ") || "none"}`);
});

await done("probe-cf11-keys");
