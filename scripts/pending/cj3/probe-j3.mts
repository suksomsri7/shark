// CRM C4.4-fix3 (J3) probe — web visitor → contact binding through the product's OWN embedded form (iframe /f/<token>)
//   service/route level, in-process (route handlers called with plain Requests · the real server action inside a Next
//   request scope, same technique as qc-crm-c2.6 S9.2) · throwaway tenants on QC3 · full cleanup at the end.
//
//   RED on the untouched tree (fb7b6b92) = the bug reproduced; GREEN after the fix. Every negative check carries its own
//   POSITIVE CONTROL (the same ticket/visitor binding somewhere it should), so "binds nothing" can never pass vacuously.
//
//   Checks: J3-a framed submit (no cookie) binds nothing today · binds via a /t/v ticket
//           J3-b declined visitor · J3-c revoked (no ticket · old sessions not bound after re-consent · no inheritance)
//           J3-d stale consent version · J3-e no enumeration (byte-identical 204s) · J3-f replay · J3-g cross-shop/system
//           J3-h expired · J3-i tampered · J3-j raw uuid (C2.6-S9.2 property) · J3-k rate gate · J3-l uiVersion 1 inert
//           J3-m same-host cookie path unchanged · J3-s static (served script listener · /f hand-over · NOOP byte-identical)
//
//   Run: bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cj3/probe-j3.mts
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
// Next's async-local-storage shim captures globalThis.AsyncLocalStorage at module load — install before any Next import
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;

const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/weathered-river/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.error("🔴 probe-j3: DATABASE_URL is not QC3 — stop");
  process.exit(4);
}
process.env.RESEND_API_KEY = "re_qc_cj3_fake";
delete process.env.TURNSTILE_SECRET_KEY;
for (const k of Object.keys(process.env)) if (/^(OPENROUTER|OPENAI|ANTHROPIC|SHARK_AI_KEY|AI_API_KEY)/.test(k)) delete process.env[k];
globalThis.fetch = (async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

const BASE = "https://shark.in.th";
const uaHuman = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const OLD_NOOP = `(function(){window.sd=window.sd||function(){};})();\n`;

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const out = (s: string) => process.stdout.write(`${s}\n`);
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  out(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const cut = (v: unknown, n = 200) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const j = (v: Any): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
type Res = { ok: boolean; v: Any; err: string };
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return { ok: false, v: undefined, err: "MISSING_FUNCTION" };
  try { return { ok: true, v: await fn(...args), err: "" }; } catch (e) { return { ok: false, v: undefined, err: cut(e instanceof Error ? `${e.name}: ${e.message}` : String(e), 160) }; }
};
const read = (p: string) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-cj3-${rand}`;
const RUN_START = new Date(Date.now() - 5_000);
out(`\n═══ probe J3 — sealed visitor ticket · /t/v · postMessage hand-over · consent-valid identify ═══`);
out(`[env] DB ${host} · tag ${TAG}\n`);

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TENANTS: string[] = [];
const USERS: string[] = [];
let seq = 0;
const nx = () => `${++seq}`;
let ipSeq = 0;
const ipNew = () => { ipSeq += 1; return `10.${77 + (ipSeq >> 16)}.${(ipSeq >> 8) & 255}.${ipSeq & 255}`; };
const DOM_A = `shop-${rand}.example.com`;
const DOM_A2 = `b2b-${rand}.example.com`;
const DOM_A3 = `ver-${rand}.example.com`;
const DOM_B = `other-${rand}.example.com`;
const DOM_V = `v1-${rand}.example.com`;
const OR_A = `https://${DOM_A}`;
const OR_A2 = `https://${DOM_A2}`;
const OR_A3 = `https://${DOM_A3}`;
const OR_B = `https://${DOM_B}`;
const OR_V = `https://${DOM_V}`;

try {
  const TR = (await import("@/lib/modules/crm/tracking" as string).catch(() => ({}))) as Any;
  const TSH = (await import("@/lib/modules/crm/tracking-shared" as string).catch(() => ({}))) as Any;
  const SG = (await import("@/lib/modules/forms/spam-guard" as string).catch(() => ({}))) as Any;
  const CSRC = (await import("@/lib/modules/forms/crm-source" as string).catch(() => ({}))) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
  const RE = (await import("@/app/t/e/route" as string).catch(() => ({}))) as Any;
  const RC = (await import("@/app/t/consent/route" as string).catch(() => ({}))) as Any;
  const RV = (await import("@/app/t/v/route" as string).catch(() => ({}))) as Any;
  const RS = (await import("@/app/t/s/[script]/route" as string).catch(() => ({}))) as Any;
  const ACT = (await import("@/app/(store)/f/[token]/actions" as string).catch(() => ({}))) as Any;
  const nw = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
  const nwu = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
  const nck = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
  const CONS: Any = OBX.consumers ?? {};

  // ─── fixtures: A (crmA · crmA2 · crmA3 web v2) · B (crmB web v2) · V (crmV uiVersion 1 with raw web settings) ───
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const u = await P.user.create({ data: { email: `${TAG}@qc.invalid`, name: `QC ${TAG}` } });
  USERS.push(u.id);
  const owner = { userId: u.id, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const mkTenant = async (suffix: string) => {
    const t = await P.tenant.create({ data: { name: `${TAG}-${suffix}`, slug: `${TAG}-${suffix}` } });
    TENANTS.push(t.id);
    await P.membership.create({ data: { userId: u.id, tenantId: t.id, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    return t.id as string;
  };
  const mk = async (tid: string, label: string) => (await sysSvc.createSystem(tid, "CRM", `${label} ${TAG}`)).id as string;
  const setCrm = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj), sysId);
  const tidA = await mkTenant("a");
  const crmA = await mk(tidA, "CRM");
  const crmA2 = await mk(tidA, "CRM B2B");
  const crmA3 = await mk(tidA, "CRM VER");
  const tidB = await mkTenant("b");
  const crmB = await mk(tidB, "CRM-B");
  const tidV = await mkTenant("v1");
  const crmV = await mk(tidV, "CRM-V1");
  for (const s of [crmA, crmA2, crmA3, crmB]) await setCrm(s, { uiVersion: 2, bridgesEnabled: true });
  await setCrm(crmV, { uiVersion: 1, bridgesEnabled: true });
  const SITE: Record<string, string> = {};
  const CV: Record<string, number> = {};
  const ctxOf: Record<string, Any> = {
    [crmA]: { tenantId: tidA, systemId: crmA, actorUserId: u.id },
    [crmA2]: { tenantId: tidA, systemId: crmA2, actorUserId: u.id },
    [crmA3]: { tenantId: tidA, systemId: crmA3, actorUserId: u.id },
    [crmB]: { tenantId: tidB, systemId: crmB, actorUserId: u.id },
  };
  for (const [sys, dom] of [[crmA, DOM_A], [crmA2, DOM_A2], [crmA3, DOM_A3], [crmB, DOM_B]] as const) {
    const r = await call(TR.saveWebSettings, ctxOf[sys], owner, { enabled: true, domains: [dom], retentionDays: 180 });
    if (!r.ok) throw new Error(`fixture saveWebSettings ${sys}: ${r.err}`);
    SITE[sys] = r.v.siteKey;
    CV[sys] = r.v.consentVersion;
  }
  SITE[crmV] = `${TAG}-v1key`;
  CV[crmV] = 1;
  await setCrm(crmV, { tracking: { web: { enabled: true, domains: [DOM_V], consentText: "คุกกี้", consentVersion: 1, retentionDays: 180, siteKey: SITE[crmV] } } });
  const TEN: Record<string, string> = { [crmA]: tidA, [crmA2]: tidA, [crmA3]: tidA, [crmB]: tidB, [crmV]: tidV };

  const FIELDS = [{ key: "name", label: "ชื่อ", type: "text", required: true }, { key: "email", label: "อีเมล", type: "email", required: false }];
  const mkForm = async (tid: string, label: string, sys: string) =>
    (await P.formDef.create({ data: { tenantId: tid, name: `${label} ${TAG}`, publicToken: `${TAG}-${label}-${nx()}`.replace(/[^A-Za-z0-9_-]/g, "x"), crmEnabled: true, fieldsJson: FIELDS, crmSystemId: sys } })) as Any;
  const fA = await mkForm(tidA, "fa", crmA);
  const fA2 = await mkForm(tidA, "fa2", crmA2);
  const fA3 = await mkForm(tidA, "fa3", crmA3);
  const fB = await mkForm(tidB, "fb", crmB);
  const fV = await mkForm(tidV, "fv", crmV);

  // ─── HTTP helpers ───
  type HttpRes = { status: number; h: Headers; text: string };
  const toRes = async (r: Any): Promise<HttpRes> => {
    if (!r || typeof r.status !== "number") return { status: -1, h: new Headers(), text: "NO_RESPONSE" };
    let text = ""; try { text = await r.text(); } catch { text = ""; }
    return { status: r.status, h: r.headers as Headers, text };
  };
  const hdrs = (o: { origin?: string | null; ip?: string; cookie?: string }) => {
    const h = new Headers({ "user-agent": uaHuman, "x-forwarded-for": o.ip ?? ipNew(), "content-type": "text/plain;charset=UTF-8" });
    if (o.origin) h.set("origin", o.origin);
    if (o.cookie) h.set("cookie", o.cookie);
    return h;
  };
  const postTo = async (mod: Any, path: string, body: unknown, o: { origin?: string | null; ip?: string } = {}): Promise<HttpRes> => {
    try {
      if (typeof mod?.POST !== "function") return { status: -1, h: new Headers(), text: "POST missing" };
      return await toRes(await mod.POST(new Request(`${BASE}${path}`, { method: "POST", headers: hdrs(o), body: JSON.stringify(body) })));
    } catch (e) { return { status: -2, h: new Headers(), text: `THROW ${e instanceof Error ? e.message : String(e)}` }; }
  };
  const postE = (b: unknown, o: { origin?: string | null; ip?: string } = {}) => postTo(RE, "/t/e", b, o);
  const postC = (b: unknown, o: { origin?: string | null; ip?: string } = {}) => postTo(RC, "/t/consent", b, o);
  const postV = (b: unknown, o: { origin?: string | null; ip?: string } = {}) => postTo(RV, "/t/v", b, o);
  const hdrSig = (r: HttpRes) => j([...r.h.entries()].sort());
  const is204Empty = (r: HttpRes) => r.status === 204 && r.text === "";
  const vid = () => randomUUID();
  const pageBody = (sys: string, v: string, url: string) => ({ k: SITE[sys], v, cv: CV[sys], t: "page", u: url, ti: "หน้า" });
  const consent = (sys: string, origin: string, v: string, d: string, cv?: number) => postC({ k: SITE[sys], v, cv: cv ?? CV[sys], d, u: `${origin}/` }, { origin });
  const acceptAndBrowse = async (sys: string, origin: string, v: string, pages: string[]) => {
    await consent(sys, origin, v, "accept");
    for (const p of pages) await postE(pageBody(sys, v, `${origin}${p}`), { origin });
  };
  const ticketBody = (sys: string, v: string, origin: string, cv?: number) => ({ k: SITE[sys], v, cv: cv ?? CV[sys], u: `${origin}/contact` });
  /** the tracker's call: returns the ticket (200 JSON) or "" */
  const mint = async (sys: string, v: string, origin: string, o: { ip?: string; cv?: number } = {}) => {
    const r = await postV(ticketBody(sys, v, origin, o.cv), { origin, ip: o.ip });
    let t = "";
    if (r.status === 200) { try { t = String(JSON.parse(r.text)?.t ?? ""); } catch { t = ""; } }
    return { r, t };
  };
  const sessionsOf = async (tid: string, v: string) => (await P.crmWebSession.findMany({ where: { tenantId: tid, visitorId: v }, orderBy: [{ startedAt: "asc" }, { id: "asc" }] })) as Any[];
  const subsOf = async (formId: string) => (await P.formSubmission.findMany({ where: { formId }, orderBy: { createdAt: "asc" } })) as Any[];
  const stTok = (formId: string) => String(SG.issueFormStartToken(formId, new Date(Date.now() - 10_000)));
  const pump = async (tids: string[]) => {
    for (let i = 0; i < 20; i += 1) {
      const rows = (await P.outboxEvent.findMany({ where: { tenantId: { in: tids }, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 200 })) as Any[];
      if (rows.length === 0) return;
      for (const row of rows) {
        await call(CONS?.[row.type], { id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, systemId: row.systemId, unitId: row.unitId, idempotencyKey: row.idempotencyKey });
        await P.outboxEvent.update({ where: { id: row.id }, data: { status: "DONE", processedAt: new Date() } }).catch(() => null);
      }
    }
  };
  // the real server action in a Next request scope (headers()/cookies() read from THIS request)
  let scopeOk = false;
  const inScope = async <T,>(req: Request, fn: () => Promise<T>): Promise<T> => {
    if (!nw?.workAsyncStorage || !nwu?.workUnitAsyncStorage || !nck?.RequestCookies) return fn();
    const jar = new nck.RequestCookies(req.headers);
    const store = { route: "/f/[token]", forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null };
    const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname: new URL(req.url).pathname, search: "" } };
    const r = await nw.workAsyncStorage.run(store, () => nwu.workUnitAsyncStorage.run(unit, fn));
    scopeOk = true;
    return r;
  };
  type Sub = { r: Res; row: Any; contactId: string | null };
  /** framed submit through the real action: optional first-party cookie (same-host case), optional ticket (field `vt`), optional raw uuid tricks */
  const submit = async (form: Any, label: string, o: { cookie?: string; vt?: string; rawV?: string } = {}): Promise<Sub> => {
    const name = `${label} ${TAG}-${nx()}`; // r2: the row is matched by its own answer (parallel submits must not read each other's row)
    const req = new Request(`${BASE}/f/${form.publicToken}${o.rawV ? `?v=${o.rawV}` : ""}`, { method: "POST", headers: hdrs({ cookie: o.cookie, ip: ipNew() }) });
    const r = await inScope(req, () => call(ACT.submitFormAction, form.publicToken, {
      answers: { name, email: `${TAG}-${nx()}@qc-crm.example` }, hp: "", st: stTok(form.id),
      ...(o.vt !== undefined ? { vt: o.vt } : {}),
      ...(o.rawV ? { visitorId: o.rawV, v: o.rawV } : {}),
    }));
    const rows = await subsOf(form.id);
    const row = rows.find((x) => (x.answersJson as Any)?.name === name) ?? null;
    await pump([form.tenantId]);
    const after = row ? await P.formSubmission.findFirst({ where: { id: row.id } }) : null;
    return { r, row: after, contactId: after?.crmContactId ?? null };
  };
  const latestId = (ss: Any[]) => [...ss].sort((a, b) => +new Date(b.lastSeenAt) - +new Date(a.lastSeenAt) || String(b.id).localeCompare(String(a.id)))[0]?.id ?? null;
  const unbound = (ss: Any[]) => ss.every((s) => s.contactId === null);
  const opsOf = async (tid: string) => (await P.opsEvent.findMany({ where: { tenantId: tid, createdAt: { gte: RUN_START } }, select: { level: true, message: true, detail: true } })) as Any[];
  const sealed = (sys: string, v: string, now?: Date, cv?: number) =>
    call(TR.visitorTicket, { tenantId: TEN[sys], systemId: sys, siteKey: SITE[sys], visitorId: v, consentVersion: cv ?? CV[sys] }, ...(now ? [now] : []));

  // ═══ J3-a — the bug, then the fix ═══
  out("── J3-a · framed form (iframe on the app origin, no sd_vid) ──");
  {
    const V = vid();
    await acceptAndBrowse(crmA, OR_A, V, ["/p1", "/p2", "/p3"]);
    const ss0 = await sessionsOf(tidA, V);
    const s0 = await submit(fA, "ไม่มีคุกกี้");
    const ssAfter0 = await sessionsOf(tidA, V);
    chk("J3-a1", "baseline (the bug's premise, stays true): a framed submit that carries neither cookie nor ticket stores the lead but binds nothing (webSessionId null, sessions unbound)",
      s0.r.ok && s0.r.v?.ok === true && !!s0.row && s0.row.webSessionId === null && !!s0.contactId && unbound(ssAfter0) && ss0.length >= 1 && ss0.reduce((n, s) => n + s.pageViews, 0) === 3,
      "stored · null · unbound", `scope=${scopeOk} r=${j(s0.r.v ?? s0.r.err)} ws=${s0.row?.webSessionId ?? "-"} ct=${!!s0.contactId} pv=${ss0.reduce((n, s) => n + s.pageViews, 0)}`);
    const m = await mint(crmA, V, OR_A);
    const s1 = await submit(fA, "ผ่านตั๋ว", { vt: m.t });
    const ss1 = await sessionsOf(tidA, V);
    const okMint = m.r.status === 200 && /^[A-Za-z0-9_-]{40,}$/.test(m.t) && m.r.h.get("access-control-allow-origin") === OR_A && !m.r.h.get("access-control-allow-credentials") && /no-store/.test(m.r.h.get("cache-control") ?? "");
    chk("J3-a2", "FIX: the tracker's POST /t/v (shop origin, consented visitor) ⇒ 200 {t} with ACAO = that origin, no credentials, no-store · the framed submit carrying the ticket (field vt) ⇒ webSessionId = the visitor's latest session and after the bridge every session of the visitor is bound to the new contact (by FORM)",
      okMint && s1.r.v?.ok === true && s1.row?.webSessionId === latestId(ss1) && !!s1.contactId && ss1.length >= 1 && ss1.every((s) => s.contactId === s1.contactId && s.identifiedBy === "FORM"),
      "200 + bound", `mint=${m.r.status}/${cut(m.r.text, 40)} acao=${m.r.h.get("access-control-allow-origin")} ws=${s1.row?.webSessionId ?? "-"} bound=${ss1.map((s) => (s.contactId === s1.contactId ? "CT" : s.contactId ? "other" : "-")).join(",")}`);
  }

  // ═══ J3-b — declined ═══
  out("── J3-b · declined visitor ──");
  {
    const VD = vid();
    await consent(crmA, OR_A, VD, "decline");
    await postE(pageBody(crmA, VD, `${OR_A}/d1`), { origin: OR_A });
    const VD2 = vid(); // accepted, browsed, then declined (sessions exist with consent null)
    await acceptAndBrowse(crmA, OR_A, VD2, ["/d2"]);
    await consent(crmA, OR_A, VD2, "decline");
    const r1 = await postV(ticketBody(crmA, VD, OR_A), { origin: OR_A });
    const r2 = await postV(ticketBody(crmA, VD2, OR_A), { origin: OR_A });
    const forged = await sealed(crmA, VD2); // even a correctly sealed ticket for a declined visitor binds nothing
    const sF = await submit(fA, "ปฏิเสธ-ตั๋ว", { vt: String(forged.v ?? "") });
    const sC = await submit(fA, "ปฏิเสธ-คุกกี้", { cookie: `sd_vid=${VD2}` });
    const ss = [...(await sessionsOf(tidA, VD)), ...(await sessionsOf(tidA, VD2))];
    const VP = vid(); // positive control: the same flow for a consenting visitor
    await acceptAndBrowse(crmA, OR_A, VP, ["/ok"]);
    const pos = await sealed(crmA, VP);
    const sP = await submit(fA, "ยอมรับ-ตั๋ว", { vt: String(pos.v ?? "") });
    chk("J3-b", "declined visitor (never accepted · accepted-then-declined): /t/v ⇒ 204 empty · even a correctly sealed ticket or the same-host cookie binds nothing (webSessionId null, zero sessions bound) · positive control: the same sealed-ticket submit for a consenting visitor binds",
      is204Empty(r1) && is204Empty(r2) && forged.ok && sF.r.v?.ok === true && sF.row?.webSessionId === null && sC.r.v?.ok === true && sC.row?.webSessionId === null && unbound(ss) &&
        pos.ok && !!sP.row?.webSessionId,
      "204 · null · control binds", `r=${r1.status}/${r2.status} forged=${forged.ok} ws=${sF.row?.webSessionId ?? "-"}/${sC.row?.webSessionId ?? "-"} sessions=${ss.map((s) => `${s.consentVersion}:${s.contactId ? "CT" : "-"}`).join(",")} control=${sP.row?.webSessionId ? "bound" : "none"}`);
  }

  // ═══ J3-c — revoked (finding c) ═══
  out("── J3-c · revoked consent ──");
  {
    const VR = vid();
    await acceptAndBrowse(crmA, OR_A, VR, ["/r1", "/r2"]);
    await consent(crmA, OR_A, VR, "revoke");
    const rv = await postV(ticketBody(crmA, VR, OR_A), { origin: OR_A });
    // the pre-revocation session is > 30 min idle ⇒ a later re-consent opens a NEW session
    const old = await sessionsOf(tidA, VR);
    for (const s of old) await P.crmWebSession.update({ where: { id: s.id }, data: { startedAt: new Date(Date.now() - 3 * 3_600_000), lastSeenAt: new Date(Date.now() - 2 * 3_600_000) } });
    await acceptAndBrowse(crmA, OR_A, VR, ["/r3"]);
    const m = await mint(crmA, VR, OR_A);
    const s = await submit(fA, "ถอนแล้วยอมใหม่", { vt: m.t });
    const ss = await sessionsOf(tidA, VR);
    const oldIds = new Set(old.map((x) => x.id));
    const oldNow = ss.filter((x) => oldIds.has(x.id));
    const fresh = ss.filter((x) => !oldIds.has(x.id));
    chk("J3-c1", "revoked visitor: /t/v ⇒ 204 empty (no ticket while consent is withdrawn)", is204Empty(rv), "204", `${rv.status}/${cut(rv.text, 40)}`);
    chk("J3-c2", "finding (c): after revoke → later re-consent, a ticket binds ONLY the post-consent session — the pre-revocation session(s) stay unbound (consent null)",
      m.r.status === 200 && s.r.v?.ok === true && !!s.contactId && fresh.length >= 1 && fresh.every((x) => x.contactId === s.contactId) && oldNow.length === old.length && oldNow.every((x) => x.contactId === null && x.consentVersion === null),
      "fresh bound · old untouched", `mint=${m.r.status} old=${oldNow.map((x) => `${x.consentVersion}:${x.contactId ? "CT" : "-"}`).join(",")} fresh=${fresh.map((x) => (x.contactId === s.contactId ? "CT" : x.contactId ? "other" : "-")).join(",")}`);
    // direct identify(): a visitor with a revoked session AND a current one — identify must leave the revoked one alone
    const VI = vid();
    await acceptAndBrowse(crmA, OR_A, VI, ["/i1"]);
    await consent(crmA, OR_A, VI, "revoke");
    for (const x of await sessionsOf(tidA, VI)) await P.crmWebSession.update({ where: { id: x.id }, data: { startedAt: new Date(Date.now() - 3 * 3_600_000), lastSeenAt: new Date(Date.now() - 2 * 3_600_000) } });
    const oldI = new Set((await sessionsOf(tidA, VI)).map((x) => x.id));
    await acceptAndBrowse(crmA, OR_A, VI, ["/i2"]);
    const ct = s.contactId ?? "-";
    const idr = await call(TR.identify, { tenantId: tidA, systemId: crmA }, { visitorId: VI, contactId: ct, by: "FORM" });
    const ssI = await sessionsOf(tidA, VI);
    chk("J3-c3", "finding (c) at the source: identify() on a visitor with a pre-revocation session + a current session binds the current one only (bound 1)",
      idr.ok && Number(idr.v?.bound) === 1 && ssI.filter((x) => oldI.has(x.id)).every((x) => x.contactId === null) && ssI.filter((x) => !oldI.has(x.id)).every((x) => x.contactId === ct),
      "bound 1", `${j(idr.v ?? idr.err)} rows=${ssI.map((x) => `${oldI.has(x.id) ? "old" : "new"}:${x.contactId ? "CT" : "-"}`).join(",")}`);
    // revoke → re-accept WITHIN the idle window: the revoked row must not be re-validated (its page views were revoked)
    const VW = vid();
    await acceptAndBrowse(crmA, OR_A, VW, ["/w1"]);
    await consent(crmA, OR_A, VW, "revoke");
    const oldW = new Set((await sessionsOf(tidA, VW)).map((x) => x.id));
    await acceptAndBrowse(crmA, OR_A, VW, ["/w2"]);
    const ssW = await sessionsOf(tidA, VW);
    chk("J3-c4", "re-accept within 30 min of a revoke opens a NEW session — the revoked row keeps consent null (its pre-revocation page views are never re-validated) · the new session collects (positive control)",
      ssW.filter((x) => oldW.has(x.id)).every((x) => x.consentVersion === null) && ssW.some((x) => !oldW.has(x.id) && x.consentVersion === CV[crmA] && x.pageViews === 1),
      "old null · new collects", ssW.map((x) => `${oldW.has(x.id) ? "old" : "new"}:${x.consentVersion}:${x.pageViews}`).join(","));
    // identified BEFORE a revoke ⇒ the post-re-consent session does not inherit the old identity
    const VH = vid();
    await acceptAndBrowse(crmA, OR_A, VH, ["/h1"]);
    await call(TR.identify, { tenantId: tidA, systemId: crmA }, { visitorId: VH, contactId: ct, by: "FORM" });
    await consent(crmA, OR_A, VH, "revoke");
    for (const x of await sessionsOf(tidA, VH)) await P.crmWebSession.update({ where: { id: x.id }, data: { lastSeenAt: new Date(Date.now() - 2 * 3_600_000) } });
    const oldH = new Set((await sessionsOf(tidA, VH)).map((x) => x.id));
    await acceptAndBrowse(crmA, OR_A, VH, ["/h2"]);
    const ssH = await sessionsOf(tidA, VH);
    const VH2 = vid(); // positive control: identified, NOT revoked, idle ⇒ the next session inherits
    await acceptAndBrowse(crmA, OR_A, VH2, ["/k1"]);
    await call(TR.identify, { tenantId: tidA, systemId: crmA }, { visitorId: VH2, contactId: ct, by: "FORM" });
    for (const x of await sessionsOf(tidA, VH2)) await P.crmWebSession.update({ where: { id: x.id }, data: { lastSeenAt: new Date(Date.now() - 2 * 3_600_000) } });
    await postE(pageBody(crmA, VH2, `${OR_A}/k2`), { origin: OR_A });
    const ssH2 = await sessionsOf(tidA, VH2);
    chk("J3-c5", "an identity made BEFORE a revoke is not inherited by the session opened after re-consent (contactId null) · positive control: without a revoke the next session inherits",
      ssH.filter((x) => !oldH.has(x.id)).length >= 1 && ssH.filter((x) => !oldH.has(x.id)).every((x) => x.contactId === null) && ssH2.length === 2 && ssH2.every((x) => x.contactId === ct),
      "no inheritance · control inherits", `after=${ssH.map((x) => `${oldH.has(x.id) ? "old" : "new"}:${x.contactId ? "CT" : "-"}`).join(",")} control=${ssH2.map((x) => (x.contactId ? "CT" : "-")).join(",")}`, "MAJOR");
  }

  // ═══ J3-d — stale consent version (dedicated system crmA3) ═══
  out("── J3-d · stale consent version ──");
  {
    const VS = vid();
    await acceptAndBrowse(crmA3, OR_A3, VS, ["/s1"]);
    const VSok = vid(); // positive control: consented before the bump AND re-accepted after it
    await acceptAndBrowse(crmA3, OR_A3, VSok, ["/s1"]);
    const oldCv = CV[crmA3];
    const bump = await call(TR.saveWebSettings, ctxOf[crmA3], owner, { bumpConsentVersion: true });
    CV[crmA3] = Number(bump.v?.consentVersion ?? oldCv);
    await acceptAndBrowse(crmA3, OR_A3, VSok, ["/s2"]);
    const rNew = await postV(ticketBody(crmA3, VS, OR_A3, CV[crmA3]), { origin: OR_A3 });
    const rOld = await postV(ticketBody(crmA3, VS, OR_A3, oldCv), { origin: OR_A3 });
    const stale = await sealed(crmA3, VS, undefined, oldCv); // sealed before the bump (old version inside)
    const sT = await submit(fA3, "เวอร์ชันเก่า-ตั๋ว", { vt: String(stale.v ?? "") });
    const sCk = await submit(fA3, "เวอร์ชันเก่า-คุกกี้", { cookie: `sd_vid=${VS}` });
    const ss = await sessionsOf(tidA, VS);
    const mOk = await mint(crmA3, VSok, OR_A3);
    const sOk = await submit(fA3, "เวอร์ชันใหม่", { vt: mOk.t });
    chk("J3-d", "stale consent version (shop bumped 1→2, visitor only accepted 1): /t/v ⇒ 204 with cv 2 and with cv 1 · a ticket sealed at the old version and the same-host cookie both bind nothing (latestConsentedSessionId requires the CURRENT version) · positive control: a visitor who re-accepted v2 gets a ticket that binds",
      bump.ok && CV[crmA3] === oldCv + 1 && is204Empty(rNew) && is204Empty(rOld) && sT.row?.webSessionId === null && sCk.r.v?.ok === true && sCk.row?.webSessionId === null && unbound(ss) &&
        mOk.r.status === 200 && !!sOk.row?.webSessionId,
      "204 · null · control binds", `cv ${oldCv}→${CV[crmA3]} r=${rNew.status}/${rOld.status} wsT=${sT.row?.webSessionId ?? "-"} wsCookie=${sCk.row?.webSessionId ?? "-"} control=${mOk.r.status}/${sOk.row?.webSessionId ? "bound" : "none"}`);
  }

  // ═══ J3-e — no enumeration ═══
  out("── J3-e · refusals are byte-identical ──");
  {
    const V = vid();
    await acceptAndBrowse(crmA, OR_A, V, ["/e1"]);
    const ip = ipNew;
    const unknownV = await postV(ticketBody(crmA, vid(), OR_A), { origin: OR_A, ip: ip() });
    const cases: [string, HttpRes][] = [
      ["foreign origin", await postV(ticketBody(crmA, V, OR_A), { origin: `https://evil-${rand}.test`, ip: ip() })],
      ["http origin", await postV(ticketBody(crmA, V, OR_A), { origin: `http://${DOM_A}`, ip: ip() })],
      ["no origin", await postV(ticketBody(crmA, V, OR_A), { origin: null, ip: ip() })],
      ["other shop's origin", await postV(ticketBody(crmA, V, OR_A), { origin: OR_B, ip: ip() })],
      ["wrong siteKey", await postV({ ...ticketBody(crmA, V, OR_A), k: `${SITE[crmA]}x` }, { origin: OR_A, ip: ip() })],
      ["foreign page url", await postV({ ...ticketBody(crmA, V, OR_A), u: `https://evil-${rand}.test/x` }, { origin: OR_A, ip: ip() })],
      ["not a uuid", await postV({ ...ticketBody(crmA, V, OR_A), v: "not-a-uuid" }, { origin: OR_A, ip: ip() })],
      ["garbage body", await postTo(RV, "/t/v", "}{", { origin: OR_A, ip: ip() })],
    ];
    const pos = await postV(ticketBody(crmA, V, OR_A), { origin: OR_A, ip: ip() });
    const sig = hdrSig(unknownV);
    const diff = cases.filter(([, r]) => !(is204Empty(r) && hdrSig(r) === sig)).map(([n, r]) => `${n}:${r.status}:${hdrSig(r)}`);
    chk("J3-e1", "every refusal (foreign / http / missing / other-shop origin · wrong siteKey · foreign page url · non-uuid · garbage) is 204 with an empty body and headers byte-identical to the unknown-visitor answer (no Access-Control-Allow-Origin in any) · positive control: the same visitor from the shop origin ⇒ 200",
      is204Empty(unknownV) && !unknownV.h.get("access-control-allow-origin") && diff.length === 0 && pos.status === 200,
      "all identical", `unknown=${unknownV.status}:${sig} diff=${diff.join(" | ") || "-"} pos=${pos.status}`);
    const opt = async (origin: string) => { try { return await toRes(await RV.OPTIONS(new Request(`${BASE}/t/v`, { method: "OPTIONS", headers: hdrs({ origin }) }))); } catch { return { status: -1, h: new Headers(), text: "" } as HttpRes; } };
    const oOk = await opt(OR_A);
    const oBad = await opt(`https://evil-${rand}.test`);
    chk("J3-e2", "OPTIONS /t/v reflects only a declared shop origin (no `*`, no credentials)",
      oOk.status === 204 && oOk.h.get("access-control-allow-origin") === OR_A && oBad.status === 204 && !oBad.h.get("access-control-allow-origin") && !oOk.h.get("access-control-allow-credentials"),
      "reflect own only", `ok=${oOk.status}:${oOk.h.get("access-control-allow-origin")} bad=${oBad.status}:${oBad.h.get("access-control-allow-origin")}`, "MAJOR");
  }

  // ═══ J3-f — replay ═══
  out("── J3-f · replay ──");
  {
    const V = vid();
    await acceptAndBrowse(crmA, OR_A, V, ["/f1"]);
    const m = await mint(crmA, V, OR_A);
    const s1 = await submit(fA, "ใช้ตั๋วครั้งแรก", { vt: m.t });
    const opsBefore = (await opsOf(tidA)).length;
    const s2 = await submit(fA, "ใช้ตั๋วซ้ำ", { vt: m.t });
    const ss = await sessionsOf(tidA, V);
    const ops = await opsOf(tidA);
    const newOps = ops.slice(opsBefore);
    const leaked = ops.some((o) => `${o.message} ${o.detail ?? ""}`.includes(m.t) || (m.t.length > 20 && `${o.message} ${o.detail ?? ""}`.includes(m.t.slice(0, 20))));
    chk("J3-f", "replay: the first submit binds (positive control) · the SAME ticket on a second submit ⇒ the form still submits (second lead stored, ok) but binds nothing (webSessionId null · sessions stay on the FIRST contact) · one WARN ops row, and no ops row anywhere contains the ticket",
      m.r.status === 200 && !!s1.row?.webSessionId && s2.r.v?.ok === true && !!s2.row && s2.row.webSessionId === null && !!s2.contactId && s2.contactId !== s1.contactId &&
        ss.every((x) => x.contactId === s1.contactId) && newOps.filter((o) => o.level === "WARN").length === 1 && !leaked,
      "1st binds · 2nd stored unbound · 1 WARN · no ticket in logs", `s1=${s1.row?.webSessionId ? "bound" : "none"} s2=${j(s2.r.v ?? s2.r.err)}/${s2.row?.webSessionId ?? "-"} ops+=${newOps.map((o) => o.level).join(",")} leaked=${leaked}`);
  }

  // ═══ J3-g — cross-shop / cross-system ═══
  out("── J3-g · wrong shop / wrong system ──");
  {
    const VB = vid();
    await acceptAndBrowse(crmB, OR_B, VB, ["/g1"]);
    const tB = await mint(crmB, VB, OR_B);
    const sOnA = await submit(fA, "ตั๋วร้าน B บนฟอร์ม A", { vt: tB.t });
    const VA = vid();
    await acceptAndBrowse(crmA, OR_A, VA, ["/g2"]);
    const tA = await mint(crmA, VA, OR_A);
    const sOnA2 = await submit(fA2, "ตั๋วระบบ A บนฟอร์มระบบ A2", { vt: tA.t });
    const ssB = await sessionsOf(tidB, VB);
    const ssA = await sessionsOf(tidA, VA);
    const unboundBefore = unbound(ssB) && unbound(ssA);
    // positive controls: each ticket still binds on its OWN shop/system form (a mismatch never burns it)
    const sOnB = await submit(fB, "ตั๋วร้าน B บนฟอร์ม B", { vt: tB.t });
    const sOnAok = await submit(fA, "ตั๋วระบบ A บนฟอร์ม A", { vt: tA.t });
    chk("J3-g", "a ticket from shop B's site on shop A's form, and a ticket from CRM system A on a form targeting system A2 of the SAME tenant ⇒ both submits stored, webSessionId null, nothing bound · positive controls: each ticket still binds on its own shop/system (a mismatch does not burn it)",
      tB.r.status === 200 && tA.r.status === 200 && sOnA.r.v?.ok === true && sOnA.row?.webSessionId === null && sOnA2.r.v?.ok === true && sOnA2.row?.webSessionId === null && unboundBefore &&
        !!sOnB.row?.webSessionId && !!sOnAok.row?.webSessionId,
      "no cross binding · controls bind", `mint=${tB.r.status}/${tA.r.status} BonA=${sOnA.row?.webSessionId ?? "null"} AonA2=${sOnA2.row?.webSessionId ?? "null"} unboundBefore=${unboundBefore} ctlB=${sOnB.row?.webSessionId ? "bound" : "none"} ctlA=${sOnAok.row?.webSessionId ? "bound" : "none"}`);
  }

  // ═══ J3-h — expired · J3-i — tampered ═══
  out("── J3-h/i · expired · tampered ──");
  {
    const V = vid();
    await acceptAndBrowse(crmA, OR_A, V, ["/h1"]);
    const old = await sealed(crmA, V, new Date(Date.now() - 16 * 60_000));
    const sOld = await submit(fA, "ตั๋วหมดอายุ", { vt: String(old.v ?? "") });
    const ssOld = await sessionsOf(tidA, V);
    const fresh = await sealed(crmA, V);
    const sFresh = await submit(fA, "ตั๋วใหม่", { vt: String(fresh.v ?? "") });
    chk("J3-h", "a ticket sealed 16 min ago (TTL 15 min) ⇒ submit stored, nothing bound · positive control: a fresh ticket for the same visitor binds",
      old.ok && sOld.r.v?.ok === true && sOld.row?.webSessionId === null && unbound(ssOld) && fresh.ok && !!sFresh.row?.webSessionId,
      "expired refused · fresh binds", `old=${old.ok} ws=${sOld.row?.webSessionId ?? "null"} fresh=${sFresh.row?.webSessionId ? "bound" : "none"}`);
    const V2 = vid();
    await acceptAndBrowse(crmA, OR_A, V2, ["/i1"]);
    const m = await mint(crmA, V2, OR_A);
    const t = m.t;
    const mid = Math.floor(t.length / 2);
    const tampered = t ? `${t.slice(0, mid)}${t[mid] === "A" ? "B" : "A"}${t.slice(mid + 1)}` : "";
    const sT = await submit(fA, "ตั๋วถูกแก้", { vt: tampered });
    const ssT = await sessionsOf(tidA, V2);
    const sGood = await submit(fA, "ตั๋วจริง", { vt: t });
    chk("J3-i", "a tampered ticket (one character flipped) ⇒ submit stored, nothing bound · positive control: the untampered original still binds afterwards (the tampered attempt burned nothing)",
      m.r.status === 200 && tampered !== t && sT.r.v?.ok === true && sT.row?.webSessionId === null && unbound(ssT) && !!sGood.row?.webSessionId,
      "tamper refused · original binds", `mint=${m.r.status} ws=${sT.row?.webSessionId ?? "null"} original=${sGood.row?.webSessionId ? "bound" : "none"}`);
  }

  // ═══ J3-j — raw visitor uuid (C2.6-S9.2 property) ═══
  out("── J3-j · raw uuid ──");
  {
    const V = vid();
    await acceptAndBrowse(crmA, OR_A, V, ["/j1"]);
    const sRaw = await submit(fA, "uuid ในช่องตั๋ว", { vt: V });
    const sQ = await submit(fA, "uuid ใน ?v=", { rawV: V });
    const ss = await sessionsOf(tidA, V);
    const sCk = await submit(fA, "คุกกี้ของเจ้าของ", { cookie: `sd_vid=${V}` });
    const noComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
    const actSrc = noComments(read("src/app/(store)/f/[token]/actions.ts"));
    const pageSrc = noComments([read("src/app/(store)/f/[token]/PublicForm.tsx"), read("src/app/(store)/f/[token]/page.tsx")].join("\n"));
    const staticOk = /sd_vid|VISITOR_COOKIE/.test(actSrc) && !/visitorId\s*:\s*[^,\n]*input/.test(actSrc) && !/[?&]v=|get\(\s*["']v["']\s*\)/.test(pageSrc);
    chk("J3-j", "a raw visitor uuid in the ticket field, or as visitorId / ?v= ⇒ binds nothing (the /f lane still never takes a caller-supplied visitor id) · the C2.6-S9.2 static rule still holds on the new action/page · positive control: the first-party cookie binds",
      sRaw.r.v?.ok === true && sRaw.row?.webSessionId === null && sQ.r.v?.ok === true && sQ.row?.webSessionId === null && unbound(ss) && staticOk && !!sCk.row?.webSessionId,
      "nothing · static ok · cookie binds", `raw=${sRaw.row?.webSessionId ?? "null"} q=${sQ.row?.webSessionId ?? "null"} static=${staticOk} cookie=${sCk.row?.webSessionId ? "bound" : "none"}`);
  }

  // ═══ J3-k — rate gate ═══
  out("── J3-k · rate gate on /t/v ──");
  {
    const lim = Number(TSH.TRACKING_RATE_LIMITS?.visitorTicketPerIp?.limit ?? 0);
    const V = vid();
    await acceptAndBrowse(crmA, OR_A, V, ["/k1"]);
    const ip = ipNew();
    const rs: HttpRes[] = [];
    for (let i = 0; i < Math.max(lim, 1) + 2; i += 1) rs.push(await postV(ticketBody(crmA, V, OR_A), { origin: OR_A, ip }));
    const okN = rs.filter((r) => r.status === 200).length;
    const tail = rs.slice(lim);
    const other = await postV(ticketBody(crmA, V, OR_A), { origin: OR_A, ip: ipNew() });
    chk("J3-k", "per-IP gate on /t/v: `visitorTicketPerIp` (10..60 /min) — exactly `limit` tickets from one IP within the window, then 204 empty (same refusal) · another IP is not affected (positive control)",
      lim >= 10 && lim <= 60 && okN === lim && tail.every((r) => is204Empty(r)) && other.status === 200,
      `${lim} ok then 204`, `lim=${lim} ok=${okN} tail=${tail.map((r) => r.status).join(",")} other=${other.status}`, "MAJOR");
  }

  // ═══ J3-l — uiVersion 1 inert ═══
  out("── J3-l · uiVersion-1 system ──");
  {
    const V = vid();
    const rs = [await consent(crmV, OR_V, V, "accept"), await postE(pageBody(crmV, V, `${OR_V}/l1`), { origin: OR_V })];
    const rv = await postV(ticketBody(crmV, V, OR_V), { origin: OR_V });
    const forged = await sealed(crmV, V);
    const sV = await submit(fV, "ร้าน v1", { vt: String(forged.v ?? "") });
    const sessions = await P.crmWebSession.count({ where: { tenantId: tidV } });
    const events = await P.crmWebEvent.count({ where: { tenantId: tidV } });
    let script = "";
    try { script = await (await RS.GET(new Request(`${BASE}/t/s/${SITE[crmV]}.js`), { params: Promise.resolve({ script: `${SITE[crmV]}.js` }) })).text(); } catch { script = "ERR"; }
    const handV = await call(CSRC.formVisitorHandover, { id: fV.id, tenantId: tidV });
    const handA = await call(CSRC.formVisitorHandover, { id: fA.id, tenantId: tidA });
    // r2 (N6): the page's hand-over decision now carries the allowed parent hosts (empty = off) instead of a boolean
    const handOff = (x: Res) => x.ok && Array.isArray(x.v) && x.v.length === 0;
    const handOn = (x: Res) => x.ok && Array.isArray(x.v) && x.v.includes(DOM_A);
    chk("J3-l", "uiVersion-1 system: /t/v ⇒ 204 empty · a sealed ticket for it binds nothing and nothing new is written (0 sessions/events) · its served script is still the NOOP tracker byte-for-byte · the /f page hand-over is OFF for a v1 form ([] hosts) and ON for a v2 web-tracked form (its tracking domains — positive control)",
      rs.every(is204Empty) && is204Empty(rv) && sV.r.v?.ok === true && sV.row?.webSessionId === null && sessions === 0 && events === 0 && script === OLD_NOOP && handOff(handV) && handOn(handA),
      "inert", `tv=${rv.status} ws=${sV.row?.webSessionId ?? "null"} rows=${sessions}/${events} noop=${script === OLD_NOOP} hand v1=${j(handV.v ?? handV.err)} v2=${j(handA.v ?? handA.err)}`);
  }

  // ═══ J3-m — same-host cookie path unchanged ═══
  out("── J3-m · same-host cookie path ──");
  {
    const V = vid();
    await acceptAndBrowse(crmA, OR_A, V, ["/m1", "/m2"]);
    const s = await submit(fA, "คุกกี้โฮสต์เดียวกัน", { cookie: `sd_vid=${V}` });
    const ss = await sessionsOf(tidA, V);
    chk("J3-m1", "same-host case (the form request carries the first-party sd_vid): binds exactly as before — webSessionId = latest session, sessions bound to the new contact",
      s.r.v?.ok === true && s.row?.webSessionId === latestId(ss) && ss.every((x) => x.contactId === s.contactId && !!x.contactId), "bound", `ws=${s.row?.webSessionId ?? "null"} bound=${ss.map((x) => (x.contactId ? "CT" : "-")).join(",")}`);
    const V2 = vid();
    const V3 = vid();
    await acceptAndBrowse(crmA, OR_A, V2, ["/m3"]);
    await acceptAndBrowse(crmA, OR_A, V3, ["/m4"]);
    const t3 = await mint(crmA, V3, OR_A);
    const sBoth = await submit(fA, "คุกกี้ชนะตั๋ว", { cookie: `sd_vid=${V2}`, vt: t3.t });
    const ss2 = await sessionsOf(tidA, V2);
    const ss3a = await sessionsOf(tidA, V3);
    const sLater = await submit(fA, "ตั๋วยังไม่ถูกเผา", { vt: t3.t });
    chk("J3-m2", "cookie + ticket together: the cookie path wins (today's behaviour) — the ticket is not consulted and not burned (it still binds its own visitor on a later submit)",
      t3.r.status === 200 && sBoth.row?.webSessionId === latestId(ss2) && unbound(ss3a) && ss2.every((x) => x.contactId === sBoth.contactId) && !!sLater.row?.webSessionId,
      "cookie wins · ticket intact", `ws=${sBoth.row?.webSessionId === latestId(ss2) ? "cookie" : sBoth.row?.webSessionId ?? "null"} v3=${ss3a.map((x) => (x.contactId ? "CT" : "-")).join(",")} later=${sLater.row?.webSessionId ? "bound" : "none"}`, "MAJOR");
  }

  // ═══ ROUND 2 (review a300d68d: S1 S2 N2 N6 N8 N12) ═══
  out("── J3-r · review round 2 ──");
  const idEvents = async (v: string) => (await P.crmWebEvent.findMany({ where: { kind: "IDENTIFY", session: { tenantId: tidA, visitorId: v } }, select: { sessionId: true, meta: true } })) as Any[];
  const idle = async (tid: string, v: string) => { for (const x of await sessionsOf(tid, v)) await P.crmWebSession.update({ where: { id: x.id }, data: { lastSeenAt: new Date(Date.now() - 2 * 3_600_000) } }); };
  const ctR = (await submit(fA, "ผู้ติดต่อรอบสอง")).contactId ?? "-";
  {
    // S1 — identified as C → revoke → re-accept → identified as C AGAIN ⇒ a new IDENTIFY on the new session · the next session inherits C
    const V = vid();
    await acceptAndBrowse(crmA, OR_A, V, ["/s1a"]);
    await call(TR.identify, { tenantId: tidA, systemId: crmA }, { visitorId: V, contactId: ctR, by: "FORM" });
    await consent(crmA, OR_A, V, "revoke");
    await idle(tidA, V);
    const before = new Set((await sessionsOf(tidA, V)).map((x) => x.id));
    await acceptAndBrowse(crmA, OR_A, V, ["/s1b"]);
    const s2 = (await sessionsOf(tidA, V)).find((x) => !before.has(x.id));
    const again = await call(TR.identify, { tenantId: tidA, systemId: crmA }, { visitorId: V, contactId: ctR, by: "FORM" });
    const evs = await idEvents(V);
    await idle(tidA, V);
    const before3 = new Set((await sessionsOf(tidA, V)).map((x) => x.id));
    await postE(pageBody(crmA, V, `${OR_A}/s1c`), { origin: OR_A });
    const s3 = (await sessionsOf(tidA, V)).find((x) => !before3.has(x.id));
    chk("J3-r1", "S1: identified as C → revoke → re-accept → identified as C again ⇒ a NEW IDENTIFY is written on the post-consent session (the one on the revoked session no longer counts) and the next session after idle inherits C",
      again.ok && Number(again.v?.bound) === 1 && !!s2 && evs.some((e) => e.sessionId === s2.id && e.meta?.contactId === ctR) && !!s3 && s3.contactId === ctR,
      "new IDENTIFY · inherits", `identify=${j(again.v ?? again.err)} ids=${evs.map((e) => (s2 && e.sessionId === s2.id ? "S2" : "old")).join(",")} s3=${s3 ? (s3.contactId === ctR ? "CT" : s3.contactId ?? "null") : "none"}`);
  }
  {
    // S2 (service level) — accept AFTER the form loaded: before consent /t/v says 204 (the form's early ping gets nothing), after accept it mints and the submit binds
    const V = vid();
    const early = await postV(ticketBody(crmA, V, OR_A), { origin: OR_A });
    await consent(crmA, OR_A, V, "accept");
    const m = await mint(crmA, V, OR_A);
    const s = await submit(fA, "ยอมรับหลังฟอร์มโหลด", { vt: m.t });
    const trk = String(TR.trackerScript?.({ siteKey: SITE[crmA], consentVersion: 1, consentText: "x" }, "https://app.example.com") ?? "");
    const trackerPush = /function afterAccept\(/.test(trk) && /afterAccept\(consent\("accept"\)\)/.test(trk) && /waiting\.push\(/.test(trk) && /function consent\(what\)\{[^}]*return post\(/.test(trk);
    const pf = read("src/app/(store)/f/[token]/PublicForm.tsx").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
    const formAsk = /async function currentTicket[\s\S]*?if \(!cur\) return askForTicket\(/.test(pf) && /TICKET_FALLBACK_MAX_MS/.test(pf) && /askForTicket\(\)\)\s*\?\?\s*\(/.test(pf);
    chk("J3-r2", "S2: accept AFTER the form loaded — /t/v 204 before consent, 200 after, the submit binds (service) · the served tracker remembers form frames that asked before consent and serves them right after the accept POST lands · the form asks again at submit when no ticket ever arrived and keeps a still-valid previous ticket as fallback on refresh [static; browser proof = browser-j3]",
      is204Empty(early) && m.r.status === 200 && !!s.row?.webSessionId && trackerPush && formAsk,
      "binds + push + ask", `early=${early.status} mint=${m.r.status} ws=${s.row?.webSessionId ? "bound" : "null"} trackerPush=${trackerPush} formAsk=${formAsk}`);
  }
  {
    // N2 — burn window = TTL + 2 min
    let spec: Any = null;
    await call(TR.consumeIdentifyTicket, `probe-${rand}-n2`, async (_k: string, sp: Any) => { spec = sp; return { ok: true }; });
    const ttl = Number(TSH.IDENTIFY_TICKET_MAX_AGE_MS ?? 0);
    chk("J3-r3", "N2: a burned jti stays burned for TTL + 2 min (clock skew between instances cannot reopen it)", spec?.limit === 1 && Number(spec?.windowMs) === ttl + 120_000, `${ttl + 120_000}`, j(spec), "MAJOR");
  }
  {
    // N6 — the form accepts a ticket only from a parent whose host is one of the target system's tracking domains [static here · browser proof = browser-j3]
    const pf = read("src/app/(store)/f/[token]/PublicForm.tsx").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
    const pg = read("src/app/(store)/f/[token]/page.tsx");
    // the form cannot import CRM's originAllowed (fitness F2.3) ⇒ its own pure copy must agree with it case by case
    const HS = (await import("@/lib/modules/forms/handover-shared" as string).catch(() => ({}))) as Any;
    const hosts = ["shop.example.com", "b2b.example.org"];
    const cases = ["https://shop.example.com", "https://shop.example.com:8443", "https://www.shop.example.com", "http://shop.example.com", "https://evil-shop.example.com",
      "https://shop.example.com.attacker.test", "https://xshop.example.com", "https://b2b.example.org", "https://SHOP.EXAMPLE.COM", "null", "", "javascript:alert(1)", "https://example.com", "https://a.b2b.example.org"];
    const parity = typeof HS.parentOriginAllowed === "function" && cases.every((o) => HS.parentOriginAllowed(o, hosts) === TSH.originAllowed(o, hosts)) &&
      HS.parentOriginAllowed("https://shop.example.com", hosts) === true && HS.parentOriginAllowed("https://evil-shop.example.com", hosts) === false && HS.parentOriginAllowed("https://shop.example.com", []) === false;
    const ok = /parentOriginAllowed\(\s*e\.origin/.test(pf) && /visitorHandover:\s*handover/.test(pg) && parity;
    chk("J3-r4", "N6: the form checks event.origin against the hosts the page passes (the target system's tracking domains) before taking a ticket [static] · its rule (forms/handover-shared) agrees with CRM's originAllowed on 14 edge cases (https-only · suffix tricks · port · case · subdomain)", ok, "origin check + parity", `ok=${ok} parity=${parity}`, "MAJOR");
  }
  {
    // N12 — two parallel redeems of ONE ticket: exactly one binds, the other WARN REPLAY
    const V = vid();
    await acceptAndBrowse(crmA, OR_A, V, ["/p1"]);
    const m = await mint(crmA, V, OR_A);
    const opsBefore = (await opsOf(tidA)).length;
    const [x1, x2] = await Promise.all([submit(fA, "พร้อมกัน-1", { vt: m.t }), submit(fA, "พร้อมกัน-2", { vt: m.t })]);
    const bound = [x1, x2].filter((x) => !!x.row?.webSessionId).length;
    const nulls = [x1, x2].filter((x) => x.row && x.row.webSessionId === null).length;
    const newOps = (await opsOf(tidA)).slice(opsBefore);
    chk("J3-r5", "N12: two PARALLEL submits carrying one ticket ⇒ both stored, exactly one binds, the other gets a WARN REPLAY", m.r.status === 200 && x1.r.v?.ok === true && x2.r.v?.ok === true && bound === 1 && nulls === 1 && newOps.some((o) => /REPLAY/.test(o.message)),
      "1 bound · 1 replay", `bound=${bound} nulls=${nulls} ops=${newOps.map((o) => cut(o.message, 60)).join(" | ")}`);
  }
  {
    // N12 — opt-out between mint and redeem
    const V = vid();
    await acceptAndBrowse(crmA, OR_A, V, ["/o1"]);
    const c1 = (await submit(fA, "จะขอหยุดติดตาม", { cookie: `sd_vid=${V}` })).contactId;
    const m = await mint(crmA, V, OR_A);
    if (c1) await P.crmContact.update({ where: { id: c1 }, data: { trackingOptOut: true } });
    const opsBefore = (await opsOf(tidA)).length;
    const s = await submit(fA, "หลังขอหยุดติดตาม", { vt: m.t });
    const newOps = (await opsOf(tidA)).slice(opsBefore);
    chk("J3-r6", "N12: the visitor's contact opts out of tracking AFTER the ticket was minted ⇒ the submit is stored but binds nothing (WARN OPT_OUT)", !!c1 && m.r.status === 200 && s.r.v?.ok === true && s.row?.webSessionId === null && newOps.some((o) => /OPT_OUT/.test(o.message)),
      "null · OPT_OUT", `c1=${!!c1} mint=${m.r.status} ws=${s.row?.webSessionId ?? "null"} ops=${newOps.map((o) => cut(o.message, 50)).join(" | ")}`);
  }
  {
    // N12 — revoke between mint and redeem
    const V = vid();
    await acceptAndBrowse(crmA, OR_A, V, ["/v1"]);
    const m = await mint(crmA, V, OR_A);
    await consent(crmA, OR_A, V, "revoke");
    const s = await submit(fA, "ถอนหลังได้ตั๋ว", { vt: m.t });
    const ss = await sessionsOf(tidA, V);
    chk("J3-r7", "N12: revoke AFTER the ticket was minted ⇒ stored, nothing bound", m.r.status === 200 && s.r.v?.ok === true && s.row?.webSessionId === null && unbound(ss), "null", `mint=${m.r.status} ws=${s.row?.webSessionId ?? "null"}`);
  }
  {
    // N12 — consent version bumped between mint and redeem (crmA3)
    const V = vid();
    await acceptAndBrowse(crmA3, OR_A3, V, ["/b1"]);
    const m = await mint(crmA3, V, OR_A3);
    const bump = await call(TR.saveWebSettings, ctxOf[crmA3], owner, { bumpConsentVersion: true });
    CV[crmA3] = Number(bump.v?.consentVersion ?? CV[crmA3]);
    const s = await submit(fA3, "เวอร์ชันเปลี่ยนหลังได้ตั๋ว", { vt: m.t });
    chk("J3-r8", "N12: the shop bumps its consent version AFTER the ticket was minted ⇒ stored, nothing bound (STALE)", m.r.status === 200 && bump.ok && s.r.v?.ok === true && s.row?.webSessionId === null, "null", `mint=${m.r.status} cv=${CV[crmA3]} ws=${s.row?.webSessionId ?? "null"}`);
  }
  {
    // N8 — re-accept within 30 min after a version bump opens a NEW session (the pre-bump row and its page views stay out)
    const V = vid();
    await acceptAndBrowse(crmA3, OR_A3, V, ["/n8a", "/n8b"]);
    const pre = new Set((await sessionsOf(tidA, V)).map((x) => x.id));
    const bump = await call(TR.saveWebSettings, ctxOf[crmA3], owner, { bumpConsentVersion: true });
    const oldCv = CV[crmA3];
    CV[crmA3] = Number(bump.v?.consentVersion ?? CV[crmA3]);
    await acceptAndBrowse(crmA3, OR_A3, V, ["/n8c"]);
    const m = await mint(crmA3, V, OR_A3);
    const s = await submit(fA3, "ยอมรับเวอร์ชันใหม่", { vt: m.t });
    const ss = await sessionsOf(tidA, V);
    const old = ss.filter((x) => pre.has(x.id));
    const fresh = ss.filter((x) => !pre.has(x.id));
    chk("J3-r9", "N8: re-accepting within 30 min after the shop bumped its consent version opens a NEW session — the pre-bump row keeps its old version and is never bound (pre-bump anonymous history stays out) · the new session binds (positive control)",
      bump.ok && old.length >= 1 && old.every((x) => x.consentVersion === oldCv && x.contactId === null) && fresh.length === 1 && fresh[0].contactId === s.contactId && !!s.contactId,
      "old unbound · new bound", `old=${old.map((x) => `${x.consentVersion}:${x.pageViews}:${x.contactId ? "CT" : "-"}`).join(",")} new=${fresh.map((x) => `${x.consentVersion}:${x.pageViews}:${x.contactId ? "CT" : "-"}`).join(",")}`);
  }

  // ═══ J3-s — static: served script, /f page, NOOP ═══
  out("── J3-s · static ──");
  {
    const src = String(typeof TR.trackerScript === "function" ? TR.trackerScript({ siteKey: SITE[crmA], consentVersion: 1, consentText: "x" }, "https://app.example.com") : "");
    const listener = /addEventListener\(\s*["']message["']/.test(src) && /\.origin\s*!==\s*AO/.test(src) && /contentWindow\s*===\s*/.test(src) &&
      /postMessage\(\s*\{\s*type\s*:\s*["']sd:visitor-ticket["']/.test(src) && /,\s*AO\s*\)/.test(src) && !/postMessage\([^)]*["']\*["']\s*\)/.test(src) &&
      src.includes('"https://app.example.com/t/v"') && /credentials\s*:\s*["']omit["']/.test(src);
    let syntaxOk = false;
    try { new Function(src); syntaxOk = true; } catch { syntaxOk = false; }
    chk("J3-s1", "served v2 tracker: listens for sd:form-ready only from the app origin (event.origin === AO) and only from one of the page's iframes (contentWindow), fetches /t/v (credentials omit), replies with postMessage(…, AO) — never `*` · valid JS",
      listener && syntaxOk && TR.NOOP_TRACKER === OLD_NOOP, "listener", `listener=${listener} syntax=${syntaxOk} noop=${TR.NOOP_TRACKER === OLD_NOOP}`);
    const pf = read("src/app/(store)/f/[token]/PublicForm.tsx");
    const pfCode = pf.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
    const handOk = /sd:form-ready/.test(pfCode) && /source\s*!==\s*window\.parent|source\s*===\s*window\.parent/.test(pfCode) && /sd:visitor-ticket/.test(pfCode) &&
      !/localStorage|sessionStorage|document\.cookie|history\.(push|replace)State|location\.(hash|search)\s*=/.test(pfCode);
    chk("J3-s2", "/f page: posts sd:form-ready to the parent, accepts sd:visitor-ticket only when event.source === window.parent, keeps the ticket in memory (no storage / cookie / URL write)",
      handOk, "hand-over", `handOk=${handOk}`);
  }
} catch (e) {
  chk("J3-FATAL", "the probe ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 800));
} finally {
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* retried next pass */ } };
  await del(() => P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE ("key" LIKE 'crm:%' OR "key" LIKE 'form:%') AND "createdAt" >= $1`, RUN_START));
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[])
      .map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
    for (const uid of USERS) await del(() => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
    for (const uid of USERS) await del(() => P.user.delete({ where: { id: uid } }));
    const left: string[] = [];
    for (const t of tables) {
      const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[];
      if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`);
    }
    const tenants = await P.tenant.count({ where: { id: { in: ids } } });
    chk("J3-CLEAN", "the probe gives QC3 back as found (throwaway tenants, rows, user, this run's limiter buckets)", left.length === 0 && tenants === 0, "0", `${left.join(" · ") || "-"} tenants=${tenants}`, "MINOR");
  }
  await prisma.$disconnect();
}
const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
out(`\n${passed === total ? "🟢" : "🔴"} probe J3: ${passed}/${total}`);
out(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings: cks.filter((c) => !c.ok).map((c) => c.id) })}`);
process.exit(passed === total ? 0 : 1);
