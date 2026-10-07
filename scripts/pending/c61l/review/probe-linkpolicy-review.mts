// C6.1-LINKPOLICY — INDEPENDENT REVIEW probe (reviewer, not the builder). QC2 only (ep-cool-shadow) · throwaway tenants `qc-c61r-*`.
// Run: bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c61l/review/probe-linkpolicy-review.mts
//
// Each check states the EXPECTED secure behaviour. A ❌ is a finding (not a probe bug) unless the line says INFO.
//   R.A  adversarial pure verdict (scheme · userinfo · IP notations · local names · IDN · ports · boundary · long hosts)
//   R.B  hostile settings JSON + 50 cap + public-suffix guard (incl. the second list: web-tracking domains)
//   R.C  platform host exemption (APP_URL unset / www / IP) and the /t/c chain through the platform host
//   R.D  DB: re-activation with a truthy non-boolean `active` · /l byte-identical to unknown code · no rate bucket consumed
//   R.E  DB: tenant binding of save/preview (system of another tenant)
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
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
const TAG = `qc-c61r-${rand}`;
const res: { id: string; ok: boolean; msg: string; info?: boolean }[] = [];
const chk = (id: string, ok: boolean, msg: string) => {
  res.push({ id, ok, msg });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${msg}`);
};
const j = (v: Any) => JSON.stringify(v);
const call = async (f: () => Promise<Any>): Promise<Any> => {
  try {
    return { ok: true, v: await f() };
  } catch (err) {
    return { ok: false, err, code: (err as Any)?.code, msg: String((err as Any)?.message ?? err) };
  }
};
const sub = async (id: string, fn: () => Promise<void> | void) => {
  try {
    await fn();
  } catch (e) {
    chk(`${id}-ERR`, false, String((e as Error)?.stack ?? e).slice(0, 700));
  }
};
const withAppUrl = <T,>(v: string | undefined, fn: () => T): T => {
  const prev = process.env.APP_URL;
  try {
    if (v === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = v;
    return fn();
  } finally {
    if (prev === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prev;
  }
};
const V = (url: unknown, settings: unknown) => TR.linkDestinationCheck(url, settings);
const reasons = (urls: unknown[], settings: unknown) => urls.map((u) => V(u, settings)).map((v: Any) => (v.ok ? "OK" : v.reason));

const USERS: string[] = [];
const TENANTS: string[] = [];
const RATE_KEYS: string[] = [];

console.log(`\n═══ C6.1-LINKPOLICY REVIEW probe · ${TAG} ═══`);

// ═════════ R.A · adversarial pure verdict ═════════
await sub("R.A", () =>
  withAppUrl(undefined, () => {
    const S = { crm: { tracking: { linkHosts: ["a.com", "*.w.com", "ร้าน.com"] } } };
    // scheme tricks
    const sch = reasons(["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "vbscript:x", "blob:https://a.com/x", "ftp://a.com/", "file:///etc/passwd", "a.com/x", "//a.com/x", ""], S);
    chk("R.A1", sch.every((r) => r === "SCHEME" || r === "PARSE"), `non-http(s) schemes / scheme-relative / empty refused → ${sch.join(",")}`);
    const up = reasons(["HTTPS://A.COM/x", "HtTp://a.CoM./x", "https:\\\\a.com\\x", "https:/a.com/x"], S);
    chk("R.A2", up.every((r) => r === "OK"), `upper-case scheme/host, trailing dot, WHATWG slash forms of an ALLOWED host = allowed (browser lands on a.com too) → ${up.join(",")}`);
    const bsl = reasons(["https:\\\\evil.com\\@a.com", "https://evil.com\\@a.com/", "https://evil.com#@a.com", "https://evil.com?@a.com", "https://evil.com%2f@a.com/", "https://a.com%2eevil.test/", "https://a.com%40evil.test/"], S);
    chk("R.A3", bsl.every((r) => r !== "OK"), `backslash/fragment/query/percent tricks that LOOK like a.com but land elsewhere refused → ${bsl.join(",")}`);
    // userinfo
    const ui = V("https://a.com@evil.test/", S);
    const ui2 = V("https://u:p@a.com/", S);
    const ui3 = V("https://:p@a.com/", S);
    const ui4 = V("https://@a.com/", S);
    chk("R.A4", !ui.ok && !ui2.ok && ui2.reason === "USERINFO" && !ui3.ok && ui3.reason === "USERINFO", `userinfo refused (a.com@evil → ${ui.reason}/${ui.host} · u:p@ → ${ui2.reason} · :p@ → ${ui3.reason}) · INFO empty "@a.com" → ${ui4.ok ? "OK (no userinfo left after parse — harmless)" : ui4.reason}`);
    // IP literals in every notation
    const ipUrls = [
      "http://127.0.0.1/", "http://127.1/", "http://0177.0.0.1/", "http://017700000001/", "http://0x7f000001/", "http://0x7f.0.0.1/", "http://2130706433/",
      "http://127.0.0.1./", "http://0/", "http://169.254.169.254/latest/", "http://[::1]/", "http://[0:0:0:0:0:0:0:1]/", "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:7f00:1]/", "http://[fe80::1]/", "http://１２７.０.０.１/", "http://127。0。0。1/", "https://8.8.8.8:443/",
    ];
    const ip = ipUrls.map((u) => V(u, { crm: { tracking: { linkHosts: ["8.8.8.8", "127.0.0.1"] } } }));
    chk("R.A5", ip.every((v: Any) => !v.ok && (v.reason === "IP" || v.reason === "PARSE")), `IP literals in decimal/octal/hex/short/dword/IPv6/IPv4-mapped/full-width/ideographic-dot forms refused even when "declared" → ${ip.map((v: Any, i: number) => `${ipUrls[i]!.slice(7, 26)}=${v.ok ? "OK" : v.reason}`).join(" ")}`);
    // local names
    const loc = reasons(["http://localhost/", "http://LOCALHOST./", "http://localhost.:8080/", "http://a.b.localhost/", "https://x.local/", "https://x.internal/", "https://router.home.arpa/"], { crm: { tracking: { linkHosts: ["*.localhost", "x.local"] } } });
    chk("R.A6", loc.every((r) => r === "LOCAL"), `localhost (incl. trailing dot / upper case / port) · *.localhost · .local · .internal · home.arpa refused → ${loc.join(",")}`);
    const locInfo = reasons(["http://localhost.localdomain/", "http://intranet.lan/", "http://127.0.0.1.nip.io/"], { crm: { tracking: { linkHosts: ["localhost.localdomain", "intranet.lan", "*.nip.io"] } } });
    console.log(`  ℹ️  [R.A6-INFO] other private-looking names a shop can declare (not refused — browser-side redirect, no SSRF): ${locInfo.join(",")}`);
    // IDN / homograph
    const hg = reasons(["https://аpple.com/", "https://xn--pple-43d.com/"], { crm: { tracking: { linkHosts: ["apple.com"] } } });
    const idn = reasons([`https://ร้าน.com/x`, `https://${new URL("http://ร้าน.com").hostname}/x`, "https://ｗ.com/", "https://x.ｗ.com/", "https://x.w。com/"], S);
    chk("R.A7", hg.every((r) => r === "HOST_NOT_ALLOWED") && idn.every((r) => r === "OK"), `Cyrillic homograph of apple.com (+ its punycode) refused · Thai IDN entry matches both unicode and punycode url · full-width/ideographic-dot forms fold to the same host → ${hg.join(",")} | ${idn.join(",")}`);
    // ports + boundary
    const port = reasons(["https://a.com:8443/x", "http://a.com:80/", "https://a.com:0/"], S);
    console.log(`  ℹ️  [R.A8-INFO] any port on an allowed host is allowed → ${port.join(",")}`);
    const bnd = reasons(["https://xa.com/", "https://a.com.evil/", "https://a.comevil/", "https://www.a.com/", "https://w.com.evil/", "https://xw.com/", "https://w.com/", "https://deep.x.w.com/"], S);
    chk("R.A9", j(bnd) === j(["HOST_NOT_ALLOWED", "HOST_NOT_ALLOWED", "HOST_NOT_ALLOWED", "HOST_NOT_ALLOWED", "HOST_NOT_ALLOWED", "HOST_NOT_ALLOWED", "OK", "OK"]), `exact vs *. dot-boundary: xa.com · a.com.evil · a.comevil · www.a.com(exact entry) · w.com.evil · xw.com refused; w.com + deep.x.w.com allowed → ${bnd.join(",")}`);
    // over-long host
    const lbl = "a".repeat(63);
    const longHost = `${lbl}.${lbl}.${lbl}.${lbl}.w.com`;
    const lg = V(`https://${longHost}/`, S);
    const lgEntry = SH.normalizeLinkHost(`${"b".repeat(250)}.com`);
    chk("R.A10", lgEntry === null && (lg.ok || lg.reason !== "PARSE"), `entry > 253 chars refused (${lgEntry}) · a ${longHost.length}-char url host under *.w.com judged without crash → ${lg.ok ? "OK" : lg.reason}`);
    // non-string / garbage input
    const garbage = [null, undefined, 42, {}, ["https://a.com"], { toString: () => "https://a.com" }].map((u) => V(u, S));
    chk("R.A11", garbage.every((v: Any) => !v.ok && v.reason === "PARSE"), `non-string url input (null/number/object/array/toString-object) → PARSE, never OK → ${garbage.map((v: Any) => v.reason).join(",")}`);
    // empty list
    const emp = reasons(["https://a.com/", "https://shark.in.th/"], {});
    chk("R.A12", emp.every((r) => r === "HOST_NOT_ALLOWED"), `empty settings + APP_URL unset = everything refused (no accidental allow-all) → ${emp.join(",")}`);
  }),
);

// ═════════ R.B · hostile settings JSON + cap + public suffix ═════════
await sub("R.B", () =>
  withAppUrl(undefined, () => {
    const hostile: unknown[] = [
      null, "str", 42, [], { crm: [] }, { crm: "x" }, { crm: { tracking: "x" } }, { crm: { tracking: { linkHosts: "a.com" } } },
      { crm: { tracking: { linkHosts: { 0: "a.com", length: 1 } } } }, { crm: { tracking: { linkHosts: [1, 2, null, {}, ["a.com"], true] } } },
      { crm: { tracking: { linkHosts: ["*", "*.", "*.*", "**.a.com", "a.*.com", ".a.com", "a..com", "https://a.com", "a.com/x", "a.com:443", "u@a.com", "*.co.th", "*.com", "1.2.3.4", "[::1]", "localhost"] } } },
      JSON.parse('{"__proto__":{"crm":{"tracking":{"linkHosts":["a.com"]}}}}'),
    ];
    const out = hostile.map((s) => j(TR.linkHostsOf(s)));
    const verdicts = hostile.map((s) => V("https://a.com/", s).ok);
    chk("R.B1", out.every((o) => o === "[]") && verdicts.every((x) => x === false), `hostile settings JSON (null/string/number/array/non-array linkHosts/array-like object/numbers/objects/nested arrays/malformed entries/__proto__) → no entries, a.com refused, no throw → ${out.join(" ")}`);
    const sixty = Array.from({ length: 60 }, (_, i) => `h${i}.example.com`);
    const capped = TR.linkHostsOf({ crm: { tracking: { linkHosts: sixty } } });
    const h55 = V("https://h55.example.com/", { crm: { tracking: { linkHosts: sixty } } });
    chk("R.B2", capped.length === 50 && !h55.ok, `a raw DB list of 60 (bypassing the save) is cut to the first 50 everywhere (hit/create/preview share linkHostsOf) → ${capped.length} · h55 → ${h55.ok ? "OK" : h55.reason}`);
    let threw = false;
    try {
      TR.cleanLinkHostsInput(Array.from({ length: 51 }, (_, i) => `x${i}.example.com`));
    } catch {
      threw = true;
    }
    chk("R.B3", threw, `save input of 51 distinct hosts refused`);
    const psl = ["*.com", "*.co.th", "*.in.th", "*.ac.th", "*.go.th", "*.or.th", "*.co.uk", "*.com.au", "*.co.jp"].map((h) => SH.normalizeLinkHost(h));
    chk("R.B4", psl.every((x) => x === null), `*. on public suffixes in the builder's list refused → ${j(psl)}`);
    const shared = ["*.github.io", "*.vercel.app", "*.blogspot.com", "*.netlify.app", "*.pages.dev", "*.web.app", "*.herokuapp.com", "*.me.uk", "*.id.au", "*.net.th", "*.s3.amazonaws.com", "*.workers.dev"].map((h) => `${h}=${SH.normalizeLinkHost(h) ? "accepted" : "refused"}`);
    console.log(`  ℹ️  [R.B5-INFO] shared hosting / PSL entries outside the 17-word list: ${shared.join(" ")}`);
    // the SECOND list — web-tracking domains are always allowed with all subdomains, but are validated only by normalizeDomain
    const viaWeb = V("https://anyshop.co.th/x", { crm: { tracking: { web: { domains: ["co.th"] } } } });
    const viaWeb2 = V("https://attacker.github.io/x", { crm: { tracking: { web: { domains: ["github.io"] } } } });
    chk("R.B6", !viaWeb.ok && !viaWeb2.ok, `public-suffix guard also holds for the always-allowed web-tracking domains (web.domains ["co.th"] must NOT allow every *.co.th) → co.th:${viaWeb.ok ? "OK (bypass)" : viaWeb.reason} github.io:${viaWeb2.ok ? "OK" : viaWeb2.reason}`);
  }),
);

// ═════════ R.C · platform host exemption ═════════
await sub("R.C", () => {
  const prod = withAppUrl("https://shark.in.th", () => reasons(["https://shark.in.th/x", "https://shop.shark.in.th/", "https://shark.in.th.evil.test/", "https://xshark.in.th/"], {}));
  chk("R.C1", j(prod) === j(["OK", "OK", "HOST_NOT_ALLOWED", "HOST_NOT_ALLOWED"]), `APP_URL=https://shark.in.th → apex + subdomains only → ${prod.join(",")}`);
  const unset = withAppUrl(undefined, () => [reasons(["https://shark.in.th/x"], {}), reasons(["https://a.com/"], { crm: { tracking: { linkHosts: ["a.com"] } } })]);
  chk("R.C2", unset[0]![0] === "HOST_NOT_ALLOWED" && unset[1]![0] === "OK", `APP_URL unset → platform host NOT exempt, declared hosts still work (neither allow-all nor refuse-all) → ${unset.flat().join(",")}`);
  const www = withAppUrl("https://www.shark.in.th", () => reasons(["https://shark.in.th/x"], {}));
  console.log(`  ℹ️  [R.C3-INFO] APP_URL with www. → apex shark.in.th: ${www.join(",")}`);
  const ipApp = withAppUrl("http://127.0.0.1:3215", () => TR.linkDestinationCheck("http://127.0.0.1:3215/x", {}));
  chk("R.C4", !ipApp.ok && ipApp.reason === "IP", `APP_URL=IP gives no exemption → ${ipApp.reason}`);
  // chain: the platform host carries redirectors (/t/c/<token> = shop e-mail click redirect with NO destination policy · /l/<code> of the same shop)
  const chain = withAppUrl("https://shark.in.th", () => reasons(["https://shark.in.th/t/c/someEmailId~token", "https://shark.in.th/l/othercode"], {}));
  chk("R.C5", chain.every((r) => r !== "OK"), `platform redirectors are NOT always-allowed destinations (a /l link → shark.in.th/t/c/<own e-mail token> → any host would bypass the list) → /t/c:${chain[0]} /l:${chain[1]}`);
});

// ═════════ R.F · round 2: REDIRECTOR path matcher (adversarial) ═════════
await sub("R.F", () => {
  for (const app of ["https://shark.in.th", undefined, "http://127.0.0.1:3215"]) {
    withAppUrl(app, () => {
      const P0 = "https://shark.in.th";
      const red = [
        `${P0}/t/c/x`, `${P0}/T/c/x`, `${P0}/T/C/x`, `${P0}/%74/c/x`, `${P0}/%2574/c/x`, `${P0}/%252574/c/x`, `${P0}/t%2fc/x`, `${P0}/t%2Fc/x`, `${P0}/t%252fc/x`,
        `${P0}//t/c/x`, `${P0}///t//c/x`, `${P0}/x/../t/c/x`, `${P0}/x/%2e%2e/t/c/x`, `${P0}/x/..%2ft/c/x`, `${P0}/./t/c/x`, `${P0}/t/?q=1`, `${P0}/t/#f`, `${P0}/t?x`, `${P0}/t`,
        `${P0}/l/`, `${P0}/l/abc123`, `${P0}/L/abc123`, `${P0}/%6c/abc`, "https://shark.in.th:8443/t/c/x", "https://shark.in.th:443/l/x", "http://shark.in.th/t/c/x", "https://SHARK.IN.TH./t/c/x",
        "https://www.shark.in.th/t/c/x", "https://backoffice.shark.in.th/l/x", "https://a.b.shark.in.th/t/o/x",
      ];
      const rv = red.map((u) => V(u, { crm: { tracking: { linkHosts: ["*.shark.in.th", "shark.in.th"] } } }));
      const bad = rv.map((v: Any, i: number) => (v.ok || v.reason !== "REDIRECTOR" ? `${red[i]}=${v.ok ? "OK" : v.reason}` : "")).filter(Boolean);
      chk(`R.F1[${app ?? "unset"}]`, bad.length === 0, `/t/ and /l/ on shark.in.th (+ subdomains, any port/scheme/case/trailing dot, %-encoded ×1-3, %2f, //, ., .., query/fragment-only) = REDIRECTOR even when the host is declared → ${bad.join(" ") || `${red.length}/${red.length} REDIRECTOR`}`);
      const fine = [`${P0}/tracking`, `${P0}/tl/x`, `${P0}/lx`, `${P0}/f/abc`, `${P0}/p/shop`, `${P0}/s/t/c`, `${P0}/`, `${P0}/%74racking`];
      const fv = fine.map((u) => V(u, {}));
      const wrong = fv.map((v: Any, i: number) => (v.ok ? "" : `${fine[i]}=${v.reason}`)).filter(Boolean);
      const expectOk = app === "https://shark.in.th";
      chk(`R.F2[${app ?? "unset"}]`, expectOk ? wrong.length === 0 : fv.every((v: Any) => !v.ok && v.reason !== "REDIRECTOR"),
        `non-redirector paths on the platform host are not REDIRECTOR (allowed when APP_URL is the platform; otherwise HOST_NOT_ALLOWED as before) → ${expectOk ? wrong.join(" ") || "all OK" : fv.map((v: Any) => v.reason).join(",")}`);
      const ip6 = reasons(["http://[::ffff:1.2.3.4]/t/c/x", "http://[2001:db8::1]/l/x"], {});
      chk(`R.F3[${app ?? "unset"}]`, ip6.every((r) => r === "IP"), `IPv6 / IPv4-mapped host forms are refused before the path test → ${ip6.join(",")}`);
    });
  }
  // deep encoding the server will not decode into /t either (INFO) + residual hosts that also serve the same app routes
  const deep = withAppUrl("https://shark.in.th", () => V("https://shark.in.th/%25252574/c/x", {}));
  console.log(`  ℹ️  [R.F4-INFO] 4×-encoded /%25252574/c → ${deep.ok ? "OK" : deep.reason} (a server decodes at most once ⇒ never routes to /t/c)`);
  const alias = withAppUrl("https://shark.in.th", () => reasons(["https://shark-in-th.vercel.app/t/c/x", "https://shop.example.com/t/c/x"], { crm: { tracking: { linkHosts: ["shark-in-th.vercel.app"], web: { domains: ["shop.example.com"] } } } }));
  console.log(`  ℹ️  [R.F5-INFO] the same /t/c route on a host that is NOT shark.in.th but may serve the app (deployment alias declared exactly · a tenant custom domain in web.domains) → ${alias.join(",")}`);
});

// ═════════ R.D / R.E · DB ═════════
const IP = `198.51.100.${(Number.parseInt(rand.slice(0, 2), 36) % 200) + 20}`;
RATE_KEYS.push(`crm:l:${String(TR.ipHashFor(IP, new Date())).slice(0, 32)}`);
const hit = async (code: string) => {
  const r: Response = await RT.GET(new Request(`http://qc.invalid/l/${code}`, { headers: { "x-forwarded-for": IP, "user-agent": "Mozilla/5.0 qc-c61r" } }), { params: Promise.resolve({ code }) });
  const h: Record<string, string> = {};
  r.headers.forEach((v, k) => (h[k] = v));
  return { status: r.status, headers: h, body: await r.text() };
};
const setCrm = (sysId: string, obj: Record<string, unknown>) =>
  P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
      (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify(obj),
    sysId,
  );
try {
  const mkUser = async (s: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${s}@qc.invalid`, name: `QC ${s} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  const uA = await mkUser("-a");
  const uB = await mkUser("-b");
  const mkTenant = async (suffix: string, uid: string) => {
    const t = await P.tenant.create({ data: { name: `${TAG}${suffix}`, slug: `${TAG}${suffix}` } });
    TENANTS.push(t.id);
    await P.membership.create({ data: { userId: uid, tenantId: t.id, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    const S = (await sysSvc.createSystem(t.id, "CRM", `CRM ${TAG}${suffix}`)).id as string;
    await setCrm(S, { uiVersion: 2, bridgesEnabled: true });
    return { T: t.id as string, S };
  };
  const A = await mkTenant("a", uA);
  const B = await mkTenant("b", uB);
  const ownerA = { userId: uA, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const ownerB = { userId: uB, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const ctxA = { tenantId: A.T, systemId: A.S, actorUserId: uA };
  const DOM = `ok-${rand}.example.org`;

  await sub("R.D", async () => {
    await TR.saveLinkHosts(ctxA, ownerA, { hosts: DOM });
    const code = `c61r${rand}`;
    const lk = await TR.createLink(ctxA, ownerA, { url: `https://${DOM}/p`, name: "r", code });
    await TR.saveLinkHosts(ctxA, ownerA, { hosts: "" }); // host removed ⇒ link blocked
    await TR.updateLink(ctxA, ownerA, lk.id, { active: false });
    const strict = await call(() => TR.updateLink(ctxA, ownerA, lk.id, { active: true }));
    const truthy: Any[] = [];
    for (const v of [1, "yes"]) {
      await P.crmTrackedLink.update({ where: { id: lk.id }, data: { active: false } });
      const r = await call(() => TR.updateLink(ctxA, ownerA, lk.id, { active: v as Any }));
      const row = await P.crmTrackedLink.findFirst({ where: { id: lk.id }, select: { active: true } });
      truthy.push({ v, ok: r.ok, code: r.code, active: row?.active });
    }
    chk("R.D1", !strict.ok && strict.code === "VALIDATION" && truthy.every((x) => !x.ok && x.active === false),
      `re-activation of a blocked link is refused for EVERY truthy active (server actions take client JSON) → true:${strict.ok ? "ok" : strict.code} · ${truthy.map((x) => `${j(x.v)}:${x.ok ? "ACCEPTED active=" + x.active : x.code}`).join(" · ")}`);
    // the hit-time check still holds even when the row was switched on through the gap
    await P.crmTrackedLink.update({ where: { id: lk.id }, data: { active: true } });
    const keys = RATE_KEYS;
    const b0 = await P.chatRateBucket.findMany({ where: { key: { in: keys } } });
    const c0 = (await P.crmTrackedLink.findFirst({ where: { id: lk.id } }))?.clicks;
    const blocked = await hit(code);
    const unknown = await hit(`zz${rand}nope`);
    const b1 = await P.chatRateBucket.findMany({ where: { key: { in: keys } } });
    const c1 = (await P.crmTrackedLink.findFirst({ where: { id: lk.id } }))?.clicks;
    const clicks = await P.crmTrackedClick.count({ where: { linkId: lk.id } });
    chk("R.D2", j(blocked) === j(unknown) && blocked.status === 302 && c0 === c1 && clicks === 0,
      `blocked-host /l answer is byte-identical to an unknown code (status+all headers+body) and counts nothing → ${blocked.status} ${blocked.headers.location} ${j(Object.keys(blocked.headers))} · clicks ${c0}→${c1} rows=${clicks}`);
    chk("R.D3", j(b0) === j(b1), `no rate-limit bucket row created/changed by a blocked-host hit (same as unknown code) → before=${b0.length} after=${b1.length}`);
    // positive control: declared again ⇒ counted and bucket touched
    await TR.saveLinkHosts(ctxA, ownerA, { hosts: DOM });
    const good = await hit(code);
    const b2 = await P.chatRateBucket.findMany({ where: { key: { in: keys } } });
    const c2 = (await P.crmTrackedLink.findFirst({ where: { id: lk.id } }))?.clicks;
    chk("R.D4", good.status === 302 && good.headers.location === `https://${DOM}/p` && c2 === (c1 ?? 0) + 1 && b2.length >= 1, `positive control: host declared again ⇒ redirect + 1 click + bucket row → ${good.headers.location} clicks=${c2} buckets=${b2.length}`);
  });

  await sub("R.E", async () => {
    // tenant B's owner aims at tenant A's system id (ctx.tenantId comes from the session in the action; here we forge the system id only)
    const before = j((await P.appSystem.findFirst({ where: { id: A.S } }))?.settings?.crm?.tracking?.linkHosts);
    const x1 = await call(() => TR.saveLinkHosts({ tenantId: B.T, systemId: A.S, actorUserId: uB }, ownerB, { hosts: `evil-${rand}.example.com` }));
    const x2 = await call(() => TR.previewLinkHosts({ tenantId: B.T, systemId: A.S, actorUserId: uB }, ownerB, { hosts: "" }));
    const x3 = await call(() => TR.getLinkPolicy({ tenantId: B.T, systemId: A.S, actorUserId: uB }, ownerB));
    const after = j((await P.appSystem.findFirst({ where: { id: A.S } }))?.settings?.crm?.tracking?.linkHosts);
    chk("R.E1", !x1.ok && !x2.ok && !x3.ok && before === after, `cross-tenant save/preview/read of another shop's system refused, nothing written → ${[x1, x2, x3].map((x) => x.code ?? x.err?.name).join(",")} · ${before}→${after}`);
    // preview count is system-bound: a blocked link in B does not show in A's count
    await TR.saveLinkHosts({ tenantId: B.T, systemId: B.S, actorUserId: uB }, ownerB, { hosts: `b-${rand}.example.com` });
    await TR.createLink({ tenantId: B.T, systemId: B.S, actorUserId: uB }, ownerB, { url: `https://b-${rand}.example.com/`, name: "b" });
    const pa = await TR.previewLinkHosts(ctxA, ownerA, { hosts: "" });
    const pb = await TR.previewLinkHosts({ tenantId: B.T, systemId: B.S, actorUserId: uB }, ownerB, { hosts: "" });
    chk("R.E2", pa.blockedActiveLinks === 1 && pb.blockedActiveLinks === 1, `preview counts only the caller's own system (A sees its 1 link, B its 1) → A=${pa.blockedActiveLinks} B=${pb.blockedActiveLinks}`);
    const aud = await P.auditLog.findMany({ where: { action: "crm.tracking.link.hosts", tenantId: { in: [A.T, B.T] } }, select: { tenantId: true } });
    chk("R.E3", aud.length >= 3 && aud.every((a: Any) => a.tenantId === A.T || a.tenantId === B.T), `audit rows written under the acting tenant only → ${aud.length}`);
  });

  // ═════════ R.G · round 2: e-mail wrap — unwrapped failing links render exactly as written · legacy-link count gap ═════════
  await sub("R.G", async () => {
    const EM = (await import("@/lib/modules/crm/emails" as string)) as Any;
    const RC = (await import(pathToFileURL(resolve("src/app/t/c/[token]/route.ts")).href)) as Any;
    await P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set("settings", '{crm,email}', (CASE WHEN jsonb_typeof("settings"->'crm'->'email') = 'object' THEN "settings"->'crm'->'email' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify({ trackOpens: false, trackClicks: true, fromMode: "SHARK", replyToMode: "SHARK", copyMode: "NONE" }),
      A.S,
    );
    const email = `c61r-${rand}@qc.invalid`;
    const party = await P.party.create({ data: { tenantId: A.T, name: `ลูกค้า ${TAG}`, kind: "PERSON", email } });
    const ct = await P.crmContact.create({ data: { tenantId: A.T, systemId: A.S, name: `ลูกค้า ${TAG}`, firstName: "ลูกค้า", email, partyId: party.id, ownerUserId: uA } });
    await P.crmContactConsent.create({ data: { tenantId: A.T, systemId: A.S, contactId: ct.id, channel: "EMAIL", granted: true, source: "STAFF" } });
    const SENT: Any[] = [];
    const transport = async (m: Any) => {
      SENT.push(m);
      return { ok: true, providerId: `re_qc_${TAG}_${SENT.length}` };
    };
    const D = `mail-${rand}.example.org`;
    const body =
      `<p>สวัสดี ${TAG}</p>` +
      `<p><a class="btn" href="http://10.0.0.1/a?x=1&amp;y=2" target="_blank" style="color:red">IP ลิงก์</a></p>` +
      `<p><a href="https://u:p@${D}/x?q=&quot;1&quot;" title="t">ผู้ใช้</a> · <a href="http://localhost:3000/z">local</a></p>` +
      `<p><a href="https://${D}/ok?a=1&amp;b=2" data-x="1">ปกติ</a> <a href="https://shark.in.th/l/abcdef">ลิงก์สั้น</a></p>` +
      `<table><tr><td><a href="http://0x7f.1/q">hex</a></td></tr></table>`;
    const r = await call(() => EM.sendEmail({ tenantId: A.T, systemId: A.S, actorUserId: uA }, ownerA, { contactId: ct.id, subject: `ทดสอบ ${TAG}`, bodyHtml: body }, { transport }));
    const html = String(SENT[0]?.html ?? "");
    const row = r.ok ? await P.crmEmailMessage.findFirst({ where: { id: r.v?.emailId } }) : null;
    // compare against the STORED (already sanitised by the pre-existing C2.5 sanitizer) body — the wrap step must change nothing but passing hrefs
    const stored = String(row?.bodyHtml ?? "");
    const PH = "__WRAPPED__";
    const normSent = html.replace(/href="[^"]*\/t\/c\/[^"]+"/g, `href="${PH}"`);
    const expected = stored.replace(`href="https://${D}/ok?a=1&amp;b=2"`, `href="${PH}"`).replace(`href="https://shark.in.th/l/abcdef"`, `href="${PH}"`);
    const wrappedN = (html.match(/\/t\/c\//g) ?? []).length;
    const failing = ["http://10.0.0.1/a?x=1&amp;y=2", `https://u:p@${D}/x?q=&quot;1&quot;`, "http://localhost:3000/z", "http://0x7f.1/q"].map((h) => stored.includes(`href="${h}"`) && html.includes(`href="${h}"`));
    chk("R.G1", r.ok && normSent.startsWith(expected) && wrappedN === 2 && failing.every(Boolean),
      `sent HTML = stored HTML byte for byte except the 2 passing hrefs (entities, link text, other attributes intact) · the 4 failing hrefs present in stored AND sent exactly as written (none dropped) · then the unsubscribe footer → send=${r.ok ? "ok" : r.msg} wrapped=${wrappedN} failingKept=${failing.join(",")} prefixMatch=${normSent.startsWith(expected)}`);
    if (!normSent.startsWith(expected)) console.log(`     expected: ${expected.slice(0, 600)}\n     got:      ${normSent.slice(0, 600)}`);
    console.log(`  ℹ️  [R.G1-INFO] pre-existing sanitizer (not this card) rewrote the input: class/style/title/data-* dropped, rel/target added, <table> unwrapped — stored=${stored.length}B input=${body.length}B`);
    // legacy (wrapped before r2) failing link: answer = unknown token, but is it counted / does it emit crm.email.clicked?
    const { createHash } = await import("node:crypto");
    const tk = `${row?.id}~legacyrv${rand}`;
    const links = ((row?.routing as Any)?.links ?? []) as Any[];
    await P.crmEmailMessage.update({ where: { id: row.id }, data: { routing: { ...(row.routing as Any), links: [...links, { h: createHash("sha256").update(`crm.email.c:${tk}`).digest("hex"), url: "http://10.9.8.7/x" }] } } });
    const before = await P.crmEmailMessage.findFirst({ where: { id: row.id }, select: { clickCount: true } });
    const evB = await P.crmEmailEvent.count({ where: { emailId: row.id, kind: "CLICK" } });
    const obB = await P.outboxEvent.count({ where: { tenantId: A.T, type: "crm.email.clicked" } });
    const get = async (t: string) => {
      const res: Response = await RC.GET(new Request(`http://qc.invalid/t/c/${encodeURIComponent(t)}`, { headers: { "x-forwarded-for": IP, "user-agent": "Mozilla/5.0 qc-c61r" } }), { params: Promise.resolve({ token: t }) });
      const h: Record<string, string> = {};
      res.headers.forEach((v, k) => (h[k] = v));
      return { status: res.status, headers: h };
    };
    for (const t of [tk, `${row?.id}~nosuch${rand}`]) for (const k of EM.trackRateKeys("c", { ip: IP, token: t })) RATE_KEYS.push(k);
    const leg = await get(tk);
    const unk = await get(`${row?.id}~nosuch${rand}`);
    const after = await P.crmEmailMessage.findFirst({ where: { id: row.id }, select: { clickCount: true } });
    const evA = await P.crmEmailEvent.count({ where: { emailId: row.id, kind: "CLICK" } });
    const obA = await P.outboxEvent.count({ where: { tenantId: A.T, type: "crm.email.clicked" } });
    chk("R.G2", j(leg) === j(unk) && !String(leg.headers.location).includes("10.9.8.7"), `legacy failing link → byte-identical unknown-token answer, never Location to it → ${leg.status} ${leg.headers.location}`);
    console.log(`  ℹ️  [R.G3-INFO] declared gap, measured: legacy failing click → clickCount ${before?.clickCount}→${after?.clickCount} · CLICK events ${evB}→${evA} · OutboxEvent crm.email.clicked ${obB}→${obA}`);
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
  console.log(`\n${passed === res.length ? "🟢" : "🔴"} C6.1-LINKPOLICY REVIEW probe: ${passed}/${res.length} · failing: ${res.filter((r) => !r.ok).map((r) => r.id).join(", ") || "none"}`);
  process.exit(passed === res.length ? 0 : 1);
}
