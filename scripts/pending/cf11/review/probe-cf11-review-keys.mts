// review probe — CRM C5.5-fix8 items 1-3 + 5 (key doors · LIKE escaping), adversarial
//   RK  account page: form-shape variants (case · whitespace · duplicates · bundle name as a scope · `*` · unknown bundle · scope + foreign
//       bundle) · revoke/rotate doors for keys this page should not manage · kanban revoke of a key of another system (builder: known gap)
//   RL  ciContains / likeContains / likeStartsWith on Postgres: literal `%` `_` `\` (incl. trailing `\`), case rules, Thai, empty term
// Checks assert the SAFE behaviour ⇒ ❌ = finding reproduces · INFO rows always pass (they record behaviour)
// QC3 ONLY · throwaway tenant `qc-cf11-rk-*` · network blocked
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//        bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf11/review/probe-cf11-review-keys.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const { ctx } = (await import("../_ctx.mts" as string)) as { ctx: (l: string) => Promise<Any> };
const X = await ctx("rk");
const { P, TAG, chk, j, cut, sysSvc, mkUser, member, mkTenant, inScope, sessionCookie, fdx, call, errText, sub, done } = X;
const SC = (await import("@/lib/api-keys/scopes" as string)) as Any;
const KS = (await import("@/lib/api-keys/service" as string)) as Any;
const CI = (await import("@/lib/core/ci-equals" as string)) as Any;

const tA = await mkTenant("a");
const owner = await mkUser("-owner");
await member(owner, tA, "OWNER");
const A = (await sysSvc.createSystem(tA, "ACCOUNT", `บัญชี ${TAG}`)).id as string;
const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
await accSvc.saveSettings(tA, A, { orgName: `QC ${TAG}`, taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
const K = (await sysSvc.createSystem(tA, "KANBAN", `บอร์ด ${TAG}`)).id as string;
const C = (await sysSvc.createSystem(tA, "CRM", `CRM ${TAG}`)).id as string;
const oCookie = await sessionCookie(owner, tA);
const CONN = (await import("@/lib/modules/account/connections-actions" as string)) as Any;
const KA = (await import("@/lib/modules/kanban/settings-actions" as string)) as Any;
const cp = `/app/sys/${A}/account/settings/connections`;
const kp = `/app/sys/${K}/kanban/settings`;
const keysOf = (name: string) => P.apiKey.findMany({ where: { tenantId: tA, name }, select: { id: true, scopesJson: true, systemId: true, revokedAt: true } });
const mint = async (suffix: string, scopes: string[], systemId: string | null) =>
  (await KS.createApiKey({ tenantId: tA }, `${TAG}-${suffix}`, { scopes, systemId, expiresAt: new Date(Date.now() + 30 * 86_400_000), createdById: owner })).id as string;

await sub("RK account page — form-shape variants", async () => {
  const doc = (SC.ACCOUNT_SCOPE_KEYS as string[])[0];
  const variants: [string, Record<string, string | string[]>][] = [
    ["upper", { scope: [doc.toUpperCase()] }],
    ["bundle-as-scope", { scope: ["read-only"] }],
    ["star-bundle", { bundle: "*" }],
    ["unknown-bundle", { bundle: "no-such-bundle" }],
    ["crm-bundle", { bundle: "crm.admin" }],
    ["scope+foreign-bundle", { scope: [doc], bundle: "crm.admin" }],
    ["foreign+good", { scope: [doc, "crm.contact.read"] }],
    ["filter-pseudo", { scope: [doc, "crm.filter.team:abcdefgh12"] }],
  ];
  const out: string[] = [];
  let leaks = 0;
  for (const [name, f] of variants) {
    const r = await call(() => inScope(oCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-v-${name}`, ttlDays: "30", ...f }))));
    const rows = await keysOf(`${TAG}-v-${name}`);
    const bad = rows.some((k: Any) => !(k.scopesJson as string[]).every((s) => (SC.ACCOUNT_SCOPE_KEYS as string[]).includes(s)) || (k.scopesJson as string[]).length === 0);
    if (bad) leaks += 1;
    out.push(`${name}:${r.v?.ok ? `minted ${j(rows.map((k: Any) => k.scopesJson))}` : `refused «${cut(r.v?.reason ?? r.err?.message, 50)}»`}`);
  }
  chk("RK.1", leaks === 0, `no variant mints a non-account or empty key → ${out.join(" · ")}`);
  const dup = await call(() => inScope(oCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-v-dup`, ttlDays: "30", scope: [doc, ` ${doc} `, doc] }))));
  const dRow = (await keysOf(`${TAG}-v-dup`))[0];
  chk("RK.2", dup.v?.ok === true && j(dRow?.scopesJson) === j([doc]), `INFO-ish: duplicates + whitespace → ${errText(dup)} stored ${j(dRow?.scopesJson)} (want one copy)`);
});

await sub("RK revoke/rotate doors", async () => {
  // unbound key with a non-crm/member/kanban foreign scope (e.g. pos.*) — accountManagedKey lets the account page manage it
  const posKey = await mint("unbound-pos", [(SC.ACCOUNT_SCOPE_KEYS as string[])[0], "pos.sale.create"].filter((s) => SC.isApiScope(s)), null);
  const rot = await call(() => inScope(oCookie, cp, () => CONN.rotateApiKeyAction(fdx({ systemId: A, id: posKey }))));
  chk("RK.3", rot.v?.ok === false, `control: rotate unbound key with a non-account scope from the account page → ${errText(rot)} (F3 refuses)`);
  const rev = await call(() => inScope(oCookie, cp, () => CONN.revokeApiKeyAction(fdx({ systemId: A, id: posKey }))));
  const posRow = (await P.apiKey.findUnique({ where: { id: posKey }, select: { revokedAt: true, scopesJson: true } })) as Any;
  chk("INFO-RK.4", true, `account page REVOKE of the same unbound key (scopes ${j(posRow?.scopesJson)}) → ${errText(rev)} revoked=${!!posRow?.revokedAt} (accountManagedKey only excludes crm|member|kanban — rotate refuses what revoke accepts)`);
  const general = await mint("general", [], null);
  const gRot = await call(() => inScope(oCookie, cp, () => CONN.rotateApiKeyAction(fdx({ systemId: A, id: general }))));
  chk("INFO-RK.5", true, `Q2: unbound general key [] rotated from the account page → ${gRot.v?.ok ? "rotated" : errText(gRot)}`);
  // kanban page revoke: a CRM-bound key of the same shop
  const crmKey = await mint("crm-bound", ["crm.contact.read"].filter((s) => SC.isApiScope(s)), C);
  const kr = await call(() => inScope(oCookie, kp, () => KA.revokeKanbanApiKeyAction(fdx({ systemId: K, keyId: crmKey }))));
  const crmRow = (await P.apiKey.findUnique({ where: { id: crmKey }, select: { revokedAt: true } })) as Any;
  chk("RK.6", !crmRow?.revokedAt, `kanban key page revokes a CRM-bound key of the shop → ${errText(kr)} revoked=${!!crmRow?.revokedAt} (want refused — builder: left to hotfix/apiv1-scope)`);
});

await sub("RL LIKE escaping on Postgres", async () => {
  const names = ["a%b", "axb", "a_b", "a\\b", "aXb", "A%B", "ร้าน%ไทย", "ร้านกไทย", "x\\", "plain"];
  const pre = `${TAG}-L-`;
  for (const nm of names) await P.party.create({ data: { tenantId: tA, name: `${pre}${nm}`, kind: "PERSON" } });
  const q = async (filter: Any) => ((await P.party.findMany({ where: { tenantId: tA, AND: [{ name: { startsWith: pre } }, { name: filter }] }, select: { name: true } })) as Any[]).map((r) => String(r.name).slice(pre.length)).sort();
  const cases: [string, Any, string[]][] = [
    ["ci %", CI.ciContains("%"), ["A%B", "a%b", "ร้าน%ไทย"]],
    ["ci _", CI.ciContains("_"), ["a_b"]],
    ["ci \\", CI.ciContains("\\"), ["a\\b", "x\\"]],
    ["ci trailing x\\", CI.ciContains("x\\"), ["x\\"]],
    ["ci A%b (case)", CI.ciContains("A%b"), ["A%B", "a%b"]],
    ["cs A%B (case)", CI.likeContains("A%B"), ["A%B"]],
    ["ci Thai %", CI.ciContains("ร้าน%"), ["ร้าน%ไทย"]],
    ["sw a_", CI.likeStartsWith(`${pre}a_`), ["a_b"]],
    ["sw a\\", CI.likeStartsWith(`${pre}a\\`), ["a\\b"]],
    ["ci empty", CI.ciContains(""), [...names].sort()],
  ];
  const out: string[] = [];
  let bad = 0;
  for (const [label, f, want] of cases) {
    const got = await q(f);
    const ok = j(got) === j([...want].sort());
    if (!ok) bad += 1;
    out.push(`${label}:${ok ? "ok" : `got ${j(got)} want ${j(want)}`}`);
  }
  const rawPct = await q({ contains: "%", mode: "insensitive" });
  chk("RL.1", bad === 0, `${out.join(" · ")} · premise raw contains "%" → ${rawPct.length} rows`);
});

await done("probe-cf11-review-keys");
