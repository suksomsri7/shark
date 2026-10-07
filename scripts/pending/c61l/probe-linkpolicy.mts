// C6.1-LINKPOLICY probe — owner decision P11/Q15 option (ข) "destination policy" for tracked short links `/l/<code>`.
// QC2 only (ep-cool-shadow) · throwaway tenants `qc-c61l-*` (swept in done(), CLEAN checks prove it) · network blocked.
// Run: bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c61l/probe-linkpolicy.mts
//
// Covers: pure verdict (exact host · `*.` subdomain rule · boundary tricks · IP literal incl. 0x7f.1 / 2130706433 / [::1] · localhost/.local/
//   .internal · userinfo · javascript:) · always-allowed (web-tracking domains + APP_URL host) · settings save validation (lowercase · dedupe ·
//   max 50 · bad entries refused with a Thai message naming the entry · nothing written on refusal · sibling keys survive) · create/update
//   refusal texts (name the host + "ตั้งค่า › ลิงก์ติดตาม") · update of name/active=false still allowed · host removed later ⇒ `/l/<code>` answers
//   the unknown-code fallback and counts nothing · "would break N links" (preview = no write · save · page read · inactive/expired not counted)
//   · permission (STAFF without crm.tracking.manage cannot preview/save; MANAGER can) · audit row · Safe Browsing hook present and inert.
//   INFO (not a check): how many active links on the whole QC2 database fail the policy after this change.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.log(`QC2 only — got ${host}`);
  process.exit(1);
}
globalThis.fetch = (async () => {
  throw new Error("network blocked");
}) as typeof fetch;

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TR = (await import("@/lib/modules/crm/tracking" as string)) as Any;
const SH = (await import("@/lib/modules/crm/tracking-shared" as string)) as Any;
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
const RT = (await import(pathToFileURL(resolve("src/app/l/[code]/route.ts")).href)) as Any;

const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-c61l-${rand}`;
const res: { id: string; ok: boolean; msg: string }[] = [];
const chk = (id: string, ok: boolean, msg: string) => {
  res.push({ id, ok, msg });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${msg}`);
};
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const call = async (f: () => Promise<Any>): Promise<Any> => {
  try {
    return { ok: true, v: await f() };
  } catch (err) {
    return { ok: false, err, code: (err as Any)?.code, msg: String((err as Any)?.message ?? err) };
  }
};
const sub = async (id: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    chk(`${id}-ERR`, false, String((e as Error)?.stack ?? e).slice(0, 700));
  }
};
const USERS: string[] = [];
const TENANTS: string[] = [];
const RATE_KEYS: string[] = [];
const setCrm = (sysId: string, obj: Record<string, unknown>) =>
  P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
      (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify(obj),
    sysId,
  );
const crmOf = async (sysId: string) => ((await P.appSystem.findFirst({ where: { id: sysId } }))?.settings?.crm ?? {}) as Any;
const mkUser = async (suffix: string) => {
  const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix} ${TAG}` } });
  USERS.push(u.id);
  return u.id as string;
};
const isThai = (s: unknown) => /[฀-๿]/.test(String(s ?? ""));
const WHERE = "ตั้งค่า › ลิงก์ติดตาม";
const IP = `203.0.113.${(Number.parseInt(rand.slice(0, 2), 36) % 200) + 20}`;

// ── one shop: OWNER + MANAGER + STAFF (no tracking key) · CRM v2 · web-tracking domain DOM_W ──
const uO = await mkUser("-o");
const uM = await mkUser("-m");
const uS = await mkUser("-s");
const t = await P.tenant.create({ data: { name: `${TAG}`, slug: `${TAG}` } });
TENANTS.push(t.id);
const T = t.id as string;
for (const [uid, role, perms] of [
  [uO, "OWNER", {}],
  [uM, "MANAGER", {}],
  [uS, "STAFF", { "crm.contact.read": true, "crm.contact.create": true }],
] as const) {
  await P.membership.create({ data: { userId: uid, tenantId: T, role, unitAccess: ["*"], permissions: perms, acceptedAt: new Date() } });
}
const S = (await sysSvc.createSystem(T, "CRM", `CRM ${TAG}`)).id as string;
const DOM_W = `web-${rand}.example.com`; // the shop's web-tracking domain (always allowed)
const DOM_L = `dest-${rand}.example.org`; // a declared destination
const DOM_X = `other-${rand}.example.net`; // never declared
await setCrm(S, { uiVersion: 2, bridgesEnabled: true, tracking: { web: { enabled: false, domains: [DOM_W] } } });
const ctx = { tenantId: T, systemId: S, actorUserId: uO };
const owner = { userId: uO, role: "OWNER", unitAccess: ["*"], permissions: {} };
const manager = { userId: uM, role: "MANAGER", unitAccess: ["*"], permissions: {} };
const staff = { userId: uS, role: "STAFF", unitAccess: ["*"], permissions: { "crm.contact.read": true, "crm.contact.create": true } };

const hit = async (code: string) => {
  const r: Response = await RT.GET(new Request(`http://qc.invalid/l/${code}`, { headers: { "x-forwarded-for": IP, "user-agent": "Mozilla/5.0 qc-c61l" } }), { params: Promise.resolve({ code }) });
  return { status: r.status, loc: r.headers.get("location") ?? "", cookie: r.headers.get("set-cookie") ?? "" };
};
RATE_KEYS.push(`crm:l:${String(TR.ipHashFor(IP, new Date())).slice(0, 32)}`);

try {
  console.log(`\n═══ C6.1-LINKPOLICY probe · ${TAG} ═══`);

  // ═════════ A · pure verdict ═════════
  await sub("A", async () => {
    chk("A.0", typeof TR.linkDestinationAllowed === "function" && typeof TR.linkDestinationCheck === "function" && typeof SH.linkDestinationVerdict === "function", "linkDestinationAllowed / linkDestinationCheck / linkDestinationVerdict exported (sync)");
    const settings = { crm: { tracking: { linkHosts: [DOM_L, "*.wild-" + rand + ".example.com"], web: { domains: [DOM_W] } } } };
    const r0 = TR.linkDestinationAllowed(`https://${DOM_L}/x`, settings);
    chk("A.1", r0 === true && !(r0 instanceof Promise), `exact host allowed (sync boolean) → ${r0}`);
    const exact = [`https://www.${DOM_L}/`, `https://x${DOM_L}/`, `https://${DOM_L}.evil.test/`].map((u) => TR.linkDestinationCheck(u, settings));
    chk("A.2", exact.every((v: Any) => !v.ok && v.reason === "HOST_NOT_ALLOWED"), `exact entry does NOT cover www./prefix/suffix tricks → ${exact.map((v: Any) => v.reason).join(",")}`);
    const W = `wild-${rand}.example.com`;
    const wild = [`https://${W}/`, `https://a.${W}/`, `https://a.b.${W}/p?q=1`, `http://${W}./`].map((u) => TR.linkDestinationAllowed(u, settings));
    const wildBad = [`https://x${W}/`, `https://${W}.evil.test/`].map((u) => TR.linkDestinationAllowed(u, settings));
    chk("A.3", wild.every(Boolean) && wildBad.every((x) => !x), `*.${W} = apex + any subdomain (incl. trailing-dot) · boundary tricks refused → ${wild}|${wildBad}`);
    const web = [`https://${DOM_W}/`, `https://shop.${DOM_W}/promo`].map((u) => TR.linkDestinationAllowed(u, settings));
    chk("A.4", web.every(Boolean), `web-tracking domain (settings.crm.tracking.web.domains) + subdomains allowed without configuration → ${web}`);
    const ips = ["http://127.0.0.1/", "http://2130706433/", "http://0x7f.1/", "http://[::1]/", "https://10.0.0.5/x", "https://8.8.8.8/"].map((u) => TR.linkDestinationCheck(u, { crm: { tracking: { linkHosts: ["8.8.8.8"] } } }));
    chk("A.5", ips.every((v: Any) => !v.ok && v.reason === "IP"), `IP literals refused (also hex/decimal forms, IPv6) → ${ips.map((v: Any) => `${v.host}:${v.reason}`).join(" ")}`);
    const loc = ["http://localhost:3000/", "https://printer.local/", "https://db.internal/", "https://a.localhost/"].map((u) => TR.linkDestinationCheck(u, settings));
    chk("A.6", loc.every((v: Any) => !v.ok && v.reason === "LOCAL"), `localhost / *.local / *.internal refused → ${loc.map((v: Any) => v.reason).join(",")}`);
    const ui = [`https://${DOM_L}@evil.test/`, `https://user:pw@${DOM_L}/`, `https://user@${DOM_L}/`].map((u) => TR.linkDestinationCheck(u, settings));
    chk("A.7", ui.every((v: Any) => !v.ok && (v.reason === "USERINFO" || v.reason === "HOST_NOT_ALLOWED")) && ui.slice(1).every((v: Any) => v.reason === "USERINFO"), `userinfo refused → ${ui.map((v: Any) => `${v.host}:${v.reason}`).join(" ")}`);
    const js = ["javascript:alert(1)", "data:text/html,x", "ftp://" + DOM_L + "/"].map((u) => TR.linkDestinationCheck(u, settings));
    chk("A.8", js.every((v: Any) => !v.ok && (v.reason === "SCHEME" || v.reason === "PARSE")), `javascript:/data:/ftp: refused → ${js.map((v: Any) => v.reason).join(",")}`);
    const prev = process.env.APP_URL;
    try {
      process.env.APP_URL = "https://shark.in.th";
      const pf = ["https://shark.in.th/f/abc", "https://shop1.shark.in.th/"].map((u) => TR.linkDestinationAllowed(u, {}));
      const pfBad = TR.linkDestinationAllowed("https://shark.in.th.evil.test/", {});
      process.env.APP_URL = "http://127.0.0.1:3215";
      const qcIp = TR.linkDestinationCheck("http://127.0.0.1:3215/x", {});
      chk("A.9", pf.every(Boolean) && pfBad === false && !qcIp.ok && qcIp.reason === "IP", `platform host (APP_URL) + subdomains always allowed · lookalike refused · APP_URL=IP gives no exemption → ${pf}|${pfBad}|${qcIp.reason}`);
    } finally {
      if (prev === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = prev;
    }
    chk("A.10", typeof TR.isDestinationBlocklisted === "function" && TR.isDestinationBlocklisted("example.com") === false, "Safe Browsing hook isDestinationBlocklisted(host) exists and is inert (returns false) — no external call");
    const empty = TR.linkDestinationCheck(`https://${DOM_X}/`, {});
    chk("A.11", !empty.ok && empty.reason === "HOST_NOT_ALLOWED", `default (no linkHosts, no web domains) = refused → ${empty.reason}`);
  });

  // ═════════ B · settings save validation ═════════
  await sub("B", async () => {
    const before = j(await crmOf(S));
    const bad = ["https://a.example.com/x", "1.2.3.4", "localhost", "printer.local", "*.co.th", "*.com", "a*.example.com", "shop.example.com:8080", "*.*.example.com", "x"];
    const rs = [] as Any[];
    for (const b of bad) rs.push(await call(() => TR.saveLinkHosts(ctx, owner, { hosts: `${DOM_L}\n${b}` })));
    const after = j(await crmOf(S));
    const okAll = rs.every((r, i) => !r.ok && r.code === "VALIDATION" && isThai(r.msg) && r.msg.includes(bad[i]!.slice(0, 40)));
    chk("B.1", okAll && before === after, `bad entries refused (VALIDATION · Thai · names the entry) and NOTHING written → ${rs.map((r, i) => (r.ok || r.code !== "VALIDATION" || !r.msg.includes(bad[i]!.slice(0, 40)) ? `#${i}:${r.ok ? "ok" : r.code}` : "")).filter(Boolean).join(" ") || "all refused"} · unchanged=${before === after}`);
    console.log(`     sample: ${rs[0]?.msg}`);
    const many = Array.from({ length: 51 }, (_, i) => `h${i}-${rand}.example.com`);
    const r51 = await call(() => TR.saveLinkHosts(ctx, owner, { hosts: many }));
    const r50 = await call(() => TR.saveLinkHosts(ctx, owner, { hosts: [...many.slice(0, 50), many[0]!.toUpperCase()] }));
    chk("B.2", !r51.ok && r51.code === "VALIDATION" && isThai(r51.msg) && /50/.test(r51.msg) && r50.ok && r50.v.linkHosts.length === 50, `max 50 after dedupe: 51 refused (${r51.msg?.slice(0, 60)}) · 50 + an upper-case duplicate accepted → ${r50.ok ? r50.v.linkHosts.length : r50.msg}`);
    const mixed = await call(() => TR.saveLinkHosts(ctx, owner, { hosts: `  ${DOM_L.toUpperCase()}\n*.Wild-${rand}.Example.COM, ${DOM_L} ;\n\nร้าน${rand}.com` }));
    const stored = (await crmOf(S))?.tracking?.linkHosts;
    chk("B.3", mixed.ok && j(stored) === j([DOM_L, `*.wild-${rand}.example.com`, new URL(`http://ร้าน${rand}.com`).hostname]) && j(mixed.v.linkHosts) === j(stored),
      `lowercase · trimmed · deduped · separators newline/comma/semicolon · Thai IDN → punycode → stored ${j(stored)}`);
    const crm = await crmOf(S);
    chk("B.4", crm.uiVersion === 2 && crm.bridgesEnabled === true && j(crm.tracking?.web?.domains) === j([DOM_W]), `one jsonb_set: sibling keys survive (uiVersion · bridgesEnabled · tracking.web.domains) → ${j({ ui: crm.uiVersion, web: crm.tracking?.web?.domains })}`);
    const w = await call(() => TR.saveWebSettings(ctx, owner, { retentionDays: 90 }));
    const crm2 = await crmOf(S);
    chk("B.5", w.ok && j(crm2.tracking?.linkHosts) === j(stored), `saving web settings afterwards keeps linkHosts → ${j(crm2.tracking?.linkHosts)}`);
    const aud = await P.auditLog.findMany({ where: { tenantId: T, action: "crm.tracking.link.hosts" } });
    chk("B.6", aud.length >= 2, `AuditLog crm.tracking.link.hosts per save → ${aud.length}`);
    const empty = await call(() => TR.saveLinkHosts(ctx, owner, { hosts: "" }));
    chk("B.7", empty.ok && j((await crmOf(S)).tracking?.linkHosts) === "[]", `empty list saves (= only always-allowed hosts) → ${empty.ok ? "ok" : empty.msg}`);
  });

  // ═════════ C · create / update refusal texts ═════════
  let linkL: Any = null;
  let linkW: Any = null;
  let codeL = "";
  await sub("C", async () => {
    await TR.saveLinkHosts(ctx, owner, { hosts: "" });
    const before = await P.crmTrackedLink.count({ where: { tenantId: T } });
    const r = await call(() => TR.createLink(ctx, owner, { url: `https://${DOM_X}/promo`, name: "x" }));
    const rIp = await call(() => TR.createLink(ctx, owner, { url: "http://192.168.1.10/admin", name: "ip" }));
    const rUi = await call(() => TR.createLink(ctx, owner, { url: `https://user@${DOM_W}/`, name: "ui" }));
    const rJs = await call(() => TR.createLink(ctx, owner, { url: "javascript:alert(1)", name: "js" }));
    const after = await P.crmTrackedLink.count({ where: { tenantId: T } });
    console.log(`     create refusal: ${r.msg}`);
    chk("C.1", !r.ok && r.code === "VALIDATION" && r.msg.includes(DOM_X) && r.msg.includes(WHERE) && !/คุณ(ใส่|กรอก)ผิด/.test(r.msg), `createLink to an undeclared host → VALIDATION naming the host + "${WHERE}"`);
    chk("C.2", !rIp.ok && rIp.code === "VALIDATION" && isThai(rIp.msg) && !rUi.ok && rUi.code === "VALIDATION" && isThai(rUi.msg) && !rJs.ok && rJs.code === "VALIDATION" && after === before,
      `IP / userinfo / javascript: refused at create, nothing written → ${[rIp, rUi, rJs].map((x) => (x.ok ? "ok" : x.code)).join(",")} rows ${before}→${after}`);
    codeL = `c61l${rand}`;
    await TR.saveLinkHosts(ctx, owner, { hosts: DOM_L });
    const okL = await call(() => TR.createLink(ctx, owner, { url: `https://${DOM_L}/promo?utm_source=line`, name: "L", code: codeL }));
    const okW = await call(() => TR.createLink(ctx, owner, { url: `https://shop.${DOM_W}/x`, name: "W" }));
    linkL = okL.v;
    linkW = okW.v;
    chk("C.3", okL.ok && okW.ok, `declared host + web-tracking subdomain accepted → ${okL.ok ? "ok" : okL.msg} | ${okW.ok ? "ok" : okW.msg}`);
    const up = await call(() => TR.updateLink(ctx, owner, linkL?.id, { url: `https://${DOM_X}/moved` }));
    const row = await P.crmTrackedLink.findFirst({ where: { id: linkL?.id } });
    chk("C.4", !up.ok && up.code === "VALIDATION" && up.msg.includes(DOM_X) && up.msg.includes(WHERE) && row?.url === `https://${DOM_L}/promo?utm_source=line`, `updateLink url → undeclared host refused with the same text, stored url unchanged → ${up.ok ? "ok" : up.msg.slice(0, 50)}`);
  });

  // ═════════ D · host removed later ⇒ /l/<code> = unknown-code answer ═════════
  await sub("D", async () => {
    if (!linkL) throw new Error("fixture link missing");
    const on = await hit(codeL);
    const c0 = (await P.crmTrackedLink.findFirst({ where: { id: linkL.id } }))?.clicks;
    chk("D.1", on.status === 302 && on.loc === `https://${DOM_L}/promo?utm_source=line`, `while declared: /l/<code> → 302 to the stored url → ${on.status} ${on.loc}`);
    const pv = await call(() => TR.previewLinkHosts(ctx, owner, { hosts: `other-${rand}.example.com` }));
    const unchanged = j((await crmOf(S)).tracking?.linkHosts) === j([DOM_L]);
    chk("E.1", pv.ok && pv.v.blockedActiveLinks === 1 && pv.v.blockedHosts.includes(DOM_L) && unchanged, `preview of a list without ${DOM_L}: would break 1 active link (the web-domain link survives) · NOTHING written → ${pv.ok ? j({ n: pv.v.blockedActiveLinks, h: pv.v.blockedHosts }) : pv.msg} unchanged=${unchanged}`);
    const sv = await call(() => TR.saveLinkHosts(ctx, owner, { hosts: `other-${rand}.example.com` }));
    chk("E.2", sv.ok && sv.v.blockedActiveLinks === 1 && j(sv.v.blockedLinkIds) === j([linkL.id]), `save returns the same count + ids → ${sv.ok ? j({ n: sv.v.blockedActiveLinks, ids: sv.v.blockedLinkIds.length }) : sv.msg}`);
    const off = await hit(codeL);
    const unknown = await hit(`zz${rand}nope`);
    const c1 = (await P.crmTrackedLink.findFirst({ where: { id: linkL.id } }))?.clicks;
    chk("D.2", off.status === unknown.status && off.loc === unknown.loc && off.loc === SH.LINK_FALLBACK_URL && off.cookie === unknown.cookie && c1 === c0,
      `host removed ⇒ /l/<code> answers exactly like an unknown code (${off.status} ${off.loc} · no cookie) and counts nothing (clicks ${c0}→${c1})`);
    const wHit = linkW ? await hit(linkW.code) : { status: 0, loc: "" };
    chk("D.3", wHit.status === 302 && wHit.loc === `https://shop.${DOM_W}/x`, `link to the web-tracking domain keeps redirecting → ${wHit.status} ${wHit.loc}`);
    const ren = await call(() => TR.updateLink(ctx, owner, linkL.id, { name: "renamed", channel: "LINE" }));
    const offT = await call(() => TR.updateLink(ctx, owner, linkL.id, { active: false }));
    const onT = await call(() => TR.updateLink(ctx, owner, linkL.id, { active: true }));
    chk("C.5", ren.ok && offT.ok && !onT.ok && onT.code === "VALIDATION" && onT.msg.includes(DOM_L) && onT.msg.includes(WHERE),
      `blocked link: rename/channel + switch off allowed · switching back ON refused with the host + where to add it → ${[ren, offT, onT].map((x) => (x.ok ? "ok" : x.code)).join(",")}`);
    // inactive + expired links are not counted
    const exp = await P.crmTrackedLink.create({ data: { tenantId: T, systemId: S, code: `c61e${rand}`, url: `https://${DOM_X}/old`, name: "expired", active: true, expiresAt: new Date(Date.now() - 86_400_000) } });
    const pol = await TR.getLinkPolicy(ctx, owner);
    chk("E.3", pol.blockedActiveLinks === 0 && !pol.blockedLinkIds.includes(exp.id), `page read: inactive (switched off) and expired links are not counted → ${pol.blockedActiveLinks}`);
    const legacy = await P.crmTrackedLink.create({ data: { tenantId: T, systemId: S, code: `c61g${rand}`, url: `http://10.1.2.3/legacy`, name: "pre-policy row", active: true } });
    const pol2 = await TR.getLinkPolicy(ctx, owner);
    const lHit = await hit(legacy.code);
    chk("E.4", pol2.blockedActiveLinks === 1 && pol2.blockedLinkIds.includes(legacy.id) && lHit.loc === SH.LINK_FALLBACK_URL, `a pre-policy row (no migration) to an IP is counted as broken and does not redirect → ${pol2.blockedActiveLinks} ${lHit.loc}`);
    const back = await call(() => TR.saveLinkHosts(ctx, owner, { hosts: DOM_L }));
    const onAgain = await call(() => TR.updateLink(ctx, owner, linkL.id, { active: true }));
    const again = await hit(codeL);
    chk("D.4", back.ok && onAgain.ok && again.status === 302 && again.loc === `https://${DOM_L}/promo?utm_source=line`, `host added back ⇒ the link can be switched on and redirects again → ${again.status} ${again.loc}`);
  });

  // ═════════ F · permission ═════════
  await sub("F", async () => {
    const before = j(await crmOf(S));
    const s1 = await call(() => TR.saveLinkHosts({ ...ctx, actorUserId: uS }, staff, { hosts: `evil-${rand}.example.com` }));
    const s2 = await call(() => TR.previewLinkHosts({ ...ctx, actorUserId: uS }, staff, { hosts: "" }));
    const s3 = await call(() => TR.getLinkPolicy({ ...ctx, actorUserId: uS }, staff));
    const after = j(await crmOf(S));
    chk("F.1", !s1.ok && !s2.ok && !s3.ok && [s1, s2, s3].every((x) => x.code === "FORBIDDEN" || /Forbidden/i.test(String(x.err?.name))) && before === after,
      `STAFF without crm.tracking.manage cannot save / preview / read the policy, nothing written → ${[s1, s2, s3].map((x) => x.err?.name ?? x.code).join(",")}`);
    const m = await call(() => TR.saveLinkHosts({ ...ctx, actorUserId: uM }, manager, { hosts: `${DOM_L}\nmgr-${rand}.example.com` }));
    chk("F.2", m.ok && m.v.linkHosts.length === 2, `MANAGER (same key as the other tracking settings) can save → ${m.ok ? j(m.v.linkHosts) : m.msg}`);
    const v1 = (await sysSvc.createSystem(T, "CRM", `CRM v1 ${TAG}`)).id as string; // settings ว่าง = uiVersion 1
    const r = await call(() => TR.saveLinkHosts({ tenantId: T, systemId: v1, actorUserId: uO }, owner, { hosts: DOM_L }));
    const v1crm = await crmOf(v1);
    chk("F.3", !r.ok && /CrmV2Disabled/.test(String(r.err?.name ?? "")) && v1crm?.tracking?.linkHosts === undefined, `uiVersion-1 system refuses (CrmV2DisabledError), nothing written → ${r.err?.name ?? r.code}`);
  });

  // ═════════ INFO · QC2-wide count of active links failing the policy (informational, not a check) ═════════
  await sub("INFO", async () => {
    const rows = (await P.$queryRawUnsafe(
      `SELECT l."id", l."url", l."tenantId", s."settings" FROM "CrmTrackedLink" l
         LEFT JOIN "AppSystem" s ON s."id" = l."systemId" AND s."tenantId" = l."tenantId" AND s."type" = 'CRM'
        WHERE l."active" = true AND (l."expiresAt" IS NULL OR l."expiresAt" > now()) AND l."tenantId" <> $1`,
      T,
    )) as Any[];
    const failing = rows.filter((r) => !TR.linkDestinationAllowed(r.url, r.settings));
    const reasons: Record<string, number> = {};
    for (const r of failing) {
      const v = TR.linkDestinationCheck(r.url, r.settings);
      reasons[v.reason] = (reasons[v.reason] ?? 0) + 1;
    }
    console.log(`  ℹ️  [INFO] QC2 active links (other tenants): ${rows.length} · failing the policy now: ${failing.length} ${j(reasons)} · tenants affected: ${new Set(failing.map((r) => r.tenantId)).size}`);
  });
} finally {
  for (const k of RATE_KEYS) await P.chatRateBucket.deleteMany({ where: { key: k } }).catch(() => undefined);
  for (const T0 of TENANTS) {
    const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (let pass = 0; pass < 4; pass += 1) for (const tb of tbs) await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, T0).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T0 } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T0 } }).catch(() => undefined);
    let left = 0;
    for (const tb of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, T0).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
    chk(`CLEAN-${T0.slice(-6)}`, left === 0 && (await P.tenant.count({ where: { id: T0 } })) === 0, `tenant rows left=${left}`);
  }
  for (const id of USERS) {
    await P.session.deleteMany({ where: { userId: id } }).catch(() => undefined);
    await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined);
    await P.appNotification.deleteMany({ where: { recipientUserId: id } }).catch(() => undefined);
    await P.user.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
  const passed = res.filter((r) => r.ok).length;
  console.log(`\n${passed === res.length ? "🟢" : "🔴"} C6.1-LINKPOLICY probe: ${passed}/${res.length}`);
  process.exit(passed === res.length ? 0 : 1);
}
