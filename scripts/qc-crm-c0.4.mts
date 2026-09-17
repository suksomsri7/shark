// QC — CRM v2 WO C0.4: private files (decision C17)
// Fable-style oracle (oracle writer) · the C0.4 builder must NOT touch this file · QC database only (.env.qc)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c0.4.mts
// requires: crm-seed
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE PROVES
//   Contract: ledger/crm-briefs/crm-brief-C0.4.md + its "Controller addendum 2026-09-17" (which
//   CORRECTS the brief and RESOLUTIONS R-E 2: `FileAsset.kind` is an ENUM, so privacy is carried by
//   the PATH `t/<tenantId>/private/<unguessable>.<ext>` and `cdnUrl` holds a NON-URL sentinel) ·
//   MASTER-PLAN §4 X7 (rate limit through `checkRateLimitDb`) and X10 (no permanent URL in a DTO).
//
//   S1  REGRESSION GUARD — a PUBLIC upload is byte-identical to today. Frozen golden projection
//       (result keys · path shape · cdnUrl · every FileAsset column · the exact `put` arguments),
//       hand-computed from `src/lib/storage/service.ts` on session/crm @ C0.3. LOGO uploads, chat
//       attachments, accounting attachments and kanban card attachments all ride on this shape.
//   S2  a PRIVATE upload leaks no fetchable URL — asserted POSITIVELY by walking every string in the
//       returned object and every column of the stored row, with the public upload as the positive
//       control for the walker · `private/` path segment · CSPRNG ≥128 bits · no schema change.
//   S3  the signed route: fresh link works · expired → 403 · tampered → 403 · minted-for-A-used-by-B
//       → 403 in BOTH directions (staff↔staff and staff↔customer) · other tenant → 404 · traversal
//       → 404 · the HMAC binds all three parts (`id` swap and `exp` swap both fail).
//   S4  `Content-Disposition: attachment` for non-inline mimes · `Cache-Control: private, no-store`
//       on every response the route produces (200 / 403 / 404 / 429).
//   S5  delete removes BOTH the DB row and the stored object — proved with an injected fake `del`
//       that records the path it was asked to remove (the REAL storage path, not the sentinel).
//   X7  the route is rate-limited per viewer through `checkRateLimitDb` and the limit really BITES
//       (a 429 appears, a second viewer is unaffected, the bucket row exists in `ChatRateBucket`).
//   X10 no permanent URL in any DTO (incl. `listAssets`) · the signature is never stored or logged ·
//       an expired link cannot be revived by re-signing with a client-supplied secret ·
//       `SESSION_SECRET` and the storage AccessKey never reach the client.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// HOUSE RULES HONOURED (crm-brief-COMMON.md §"Oracle house style")
//   1) SKIP guard — nothing of C0.4 exists yet ⇒ print SKIPPED + JSON_SUMMARY {skipped:true} +
//      exit 0 WITHOUT opening a database connection.
//   2) chk(id, title, ok, expected, actual, sev) with ids `C0.4-S<n>.<m>` / `C0.4-X<k>.<n>`.
//   3) 🔴 DATA SAFETY: two THROWAWAY TENANTS (`qc-c04-<rand>` / `…-b`) created here and swept in
//      `finally` (every table with a `tenantId` column + the Users/Sessions/rate buckets that have
//      none). C0.4-CLEAN proves nothing is left behind. The shared QC books are never touched.
//   4) 🔴 BUNNY IS NEVER CONTACTED: `deps.put` / `deps.del` are always injected AND `globalThis.fetch`
//      is stubbed for the whole run, so even a forgotten injection cannot reach the real storage
//      zone. The `SHARK_BUNNY_*` values of `.env.qc` are replaced by QC fakes before anything loads.
//   5) last line = `JSON_SUMMARY {...}` · modules that may not exist are imported `as string`.
//   6) A route handler is exercised by IMPORTING it and passing a `Request` — no QC server needed.
//      `cookies()` / `headers()` from `next/headers` are made to work by running the handler inside
//      a real Next request scope (see `withRequestScope`), so the builder may read the session
//      either from the Request or from `next/headers`; both are accepted.
// ─────────────────────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHmac, randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard (rule 1) — the deliverables of C0.4. No DB connection is opened above this line.
//   · the new route file                       · `visibility` on the upload input
//   · the `privateFileUrl` helper the DTO builders will use
// ═══════════════════════════════════════════════════════════════════════════════════
const ROUTE_FILE = "src/app/api/files/[id]/route.ts";
const STORAGE_DIR = "src/lib/storage";
const storageFiles = existsSync(STORAGE_DIR)
  ? readdirSync(STORAGE_DIR).filter((f) => f.endsWith(".ts")).map((f) => `${STORAGE_DIR}/${f}`)
  : [];
const storageSrc = storageFiles.map((f) => readFileSync(f, "utf8")).join("\n");
const MISSING: string[] = [];
if (!existsSync(ROUTE_FILE)) MISSING.push(ROUTE_FILE);
if (!/\bvisibility\b/.test(storageSrc)) MISSING.push("storage: upload input `visibility`");
if (!/\bprivateFileUrl\b/.test(storageSrc)) MISSING.push("storage: privateFileUrl()");
if (MISSING.length > 0) {
  console.log(`⚠️  SKIPPED — WO C0.4 not built yet (${MISSING.join(" · ")})`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

// ═══════════════════════════════════════════════════════════════════════════════════
// 🔴 QC storage identity — set BEFORE any module reads it. `.env.qc` carries the real
//    SHARK_BUNNY_* values; this oracle must never sign, upload to or delete from the real zone.
// ═══════════════════════════════════════════════════════════════════════════════════
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, "q");
const TAG = `qc-c04-${rand}`;
const CDN = "https://qc-c04-cdn.invalid";
const BUNNY_STORAGE_HOST = "sg.storage.bunnycdn.com";
const FAKE_ACCESS_KEY = `qc-c04-access-key-${randomBytes(12).toString("hex")}`;
process.env.SHARK_BUNNY_CDN = CDN;
process.env.SHARK_BUNNY_ZONE = `${TAG}-zone`;
process.env.SHARK_BUNNY_KEY = FAKE_ACCESS_KEY;
delete process.env.BUNNY_ACCOUNT_KEY;

// ═══════════════════════════════════════════════════════════════════════════════════
// fetch stub (rule 4) — every outgoing request is recorded; anything that looks like object
// storage is answered from the in-memory object table that the injected `put` filled.
// ═══════════════════════════════════════════════════════════════════════════════════
type StoredObject = { bytes: Uint8Array; contentType: string };
const OBJECTS = new Map<string, StoredObject>();
type FetchRec = { url: string; method: string; headers: Record<string, string>; served: boolean };
const FETCHES: FetchRec[] = [];
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  const method = String(init?.method ?? input?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  const hsrc: Any = init?.headers ?? input?.headers;
  if (hsrc && typeof hsrc.forEach === "function") hsrc.forEach((v: string, k: string) => { headers[k.toLowerCase()] = v; });
  else if (hsrc && typeof hsrc === "object") for (const [k, v] of Object.entries(hsrc)) headers[String(k).toLowerCase()] = String(v);
  const rec: FetchRec = { url, method, headers, served: false };
  FETCHES.push(rec);
  for (const [path, obj] of OBJECTS) {
    if (url.includes(path)) {
      rec.served = true;
      return new Response(obj.bytes.slice().buffer as ArrayBuffer, {
        status: 200,
        headers: { "content-type": obj.contentType, "content-length": String(obj.bytes.length) },
      });
    }
  }
  if (url.includes(BUNNY_STORAGE_HOST) || url.startsWith(CDN) || url.includes("bunny.net")) {
    rec.served = true;
    return new Response("not found", { status: 404 });
  }
  return realFetch(input, init);
}) as typeof fetch;

// ═══════════════════════════════════════════════════════════════════════════════════
// A real Next request scope, so a handler that calls `cookies()`/`headers()` works here.
// (Next only installs `globalThis.AsyncLocalStorage` inside its own server runtime.)
// ═══════════════════════════════════════════════════════════════════════════════════
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
let SCOPE_OK = false;
async function withRequestScope<T>(req: Request, fn: () => Promise<T>): Promise<T> {
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) return fn();
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = { route: "/api/files/[id]", forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null };
  const unit = {
    type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar,
    userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {},
    url: { pathname: new URL(req.url).pathname, search: new URL(req.url).search },
  };
  try {
    const out = await nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
    SCOPE_OK = true;
    return out;
  } catch (e) {
    if (/AsyncLocalStorage accessed in runtime/.test(String((e as Error)?.message ?? ""))) return fn();
    throw e;
  }
}

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

// ─────────────────────────── harness ───────────────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const UNPROVEN: { id: string; why: string }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
/** a property this run could not put under experiment — never counted as green, never counted as red */
const unproven = (id: string, n: string, why: string) => {
  UNPROVEN.push({ id, why });
  console.log(`  ⚪ [${id}] ${n} — NOT PROVEN: ${why}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const cut = (s: string, n = 260) => (s.length > n ? `${s.slice(0, n)}…` : s);
const j = (v: Any): string =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const enc = new TextEncoder();

// console capture (X10) — everything the product prints while we drive it
const LOGS: string[] = [];
async function capture(fn: () => Promise<Any>): Promise<Any> {
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  const cap = (k: keyof typeof orig) => (...a: Any[]) => {
    LOGS.push(a.map((x) => (typeof x === "string" ? x : j(x))).join(" "));
    orig[k](...a);
  };
  console.log = cap("log"); console.warn = cap("warn"); console.error = cap("error"); console.info = cap("info");
  try { return await fn(); } finally {
    console.log = orig.log; console.warn = orig.warn; console.error = orig.error; console.info = orig.info;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// 🔒 THE GOLDEN PUBLIC PROJECTION (C0.4-S1.*) — frozen from `src/lib/storage/service.ts` @ C0.3
//
//   uploadFile({tenantId}, {kind, filename, contentType, data}) today:
//     ext        = ALLOWED_TYPES[normalizeUploadType(contentType)]        (service.ts:69/137)
//     id         = randomUUID() without dashes  ⇒ 32 lowercase hex chars   (service.ts:114 newId)
//     path       = `t/<tenantId>/<kind.toLowerCase()>/<id>.<ext>`          (service.ts:155)
//     cdnUrl     = `<SHARK_BUNNY_CDN without trailing />/<path>`           (service.ts:156)
//     put(path, data, contentType)  — the RAW contentType, parameters and all (service.ts:160)
//     FileAsset  = { tenantId, kind, path, cdnUrl, contentType (raw), bytes: data.length }
//     result     = { ok: true, cdnUrl, assetId }   ← EXACTLY these three keys
//   Failure results are EXACTLY { ok: false, error: <Thai> } and write no row (service.ts:139/147).
//   FileAsset has EXACTLY these columns and FileKind EXACTLY these values — C0.4 is not a
//   migration work order (MASTER-PLAN §2.5: migrations only in C1.1 · C2.0 · C3.0).
// ═══════════════════════════════════════════════════════════════════════════════════
const GOLDEN_RESULT_KEYS = ["assetId", "cdnUrl", "ok"];
const GOLDEN_FAIL_KEYS = ["error", "ok"];
const GOLDEN_COLUMNS = ["bytes", "cdnUrl", "contentType", "createdAt", "id", "kind", "path", "tenantId"];
const GOLDEN_FILEKIND = ["ATTACHMENT", "LOGO"];
const PUBLIC_ID_RE = /^[0-9a-f]{32}$/;

// ─────────────────────────── state ───────────────────────────
const MARKER = `QC-C04-SECRET-${randomBytes(8).toString("hex")}`;
const T0 = new Date(Date.now() - 1000);
let tidA = "";
let tidB = "";
const USER_IDS: string[] = [];
const RATE_KEY_NEEDLES: string[] = [];

console.log(`\n═══ QC CRM v2 · C0.4 — private files ═══`);
console.log(`[env] DB ${host} · tag ${TAG} · cdn ${CDN}\n`);

try {
  const ST = (await import("@/lib/storage/service")) as Any;
  const routeMod = (await import("@/app/api/files/[id]/route" as string).catch((e: Any) => ({ __err: String(e?.message ?? e) }))) as Any;
  const sysSvc = (await import("@/lib/modules/system/service")) as Any;
  const custSession = (await import("@/lib/modules/member/customer-session")) as Any;
  const coreHash = (await import("@/lib/core/hash")) as Any;

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — two throwaway tenants · a staff viewer each · a customer viewer in A
  // ═════════════════════════════════════════════════════════════════════════════
  const tA = await P.tenant.create({ data: { name: TAG, slug: TAG } });
  tidA = tA.id;
  const tB = await P.tenant.create({ data: { name: `${TAG}-b`, slug: `${TAG}-b` } });
  tidB = tB.id;
  const memSysA = (await sysSvc.createSystem(tidA, "MEMBER", `สมาชิก ${TAG}`)).id as string;
  await sysSvc.createSystem(tidA, "CRM", `CRM ${TAG}`);
  await sysSvc.createSystem(tidB, "CRM", `CRM ${TAG}-b`);

  const mkStaff = async (tid: string, label: string): Promise<{ id: string; cookie: string }> => {
    const u = await P.user.create({ data: { email: `${TAG}-${label}@qc.local`, name: `พนักงาน ${label}` } });
    USER_IDS.push(u.id);
    RATE_KEY_NEEDLES.push(u.id, coreHash.sha256(u.id) as string);
    await P.membership.create({ data: { userId: u.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
    const token = coreHash.randomToken(32) as string;
    await P.session.create({
      data: {
        userId: u.id, tokenHash: coreHash.sha256(token),
        idleExpiresAt: new Date(Date.now() + 30 * 864e5), expiresAt: new Date(Date.now() + 90 * 864e5),
      },
    });
    // both cookie names (the app picks one from APP_ENV — sending both is what a browser of either env would do)
    const cookie = `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${tid}`;
    return { id: u.id, cookie };
  };
  const staffA = await mkStaff(tidA, "a");
  const staffA2 = await mkStaff(tidA, "a2");
  const staffB = await mkStaff(tidB, "b");

  const customer = await P.customer.create({ data: { tenantId: tidA, memberSystemId: memSysA, name: `ลูกค้า ${TAG}` } });
  const custTok = (await custSession.mintCustomerSession(customer.id)) as { token: string; cookieName: string };
  RATE_KEY_NEEDLES.push(customer.id, coreHash.sha256(customer.id) as string);
  const custCookie = `${custTok.cookieName}=${custTok.token}; shark_customer=${custTok.token}; __Host-shark_customer=${custTok.token}`;

  // injected storage deps — the ONLY way bytes move in this oracle
  const PUTS: { path: string; bytes: Uint8Array; contentType: string }[] = [];
  const DELS: string[] = [];
  const deps = {
    put: async (path: string, data: Uint8Array, contentType: string) => {
      PUTS.push({ path, bytes: data.slice(), contentType });
      OBJECTS.set(path, { bytes: data.slice(), contentType });
    },
  };
  const delDeps = {
    del: async (path: string) => { DELS.push(path); OBJECTS.delete(path); return 200; },
    purge: async () => { /* never reaches Bunny */ },
  };

  const body = (n: string) => enc.encode(`${MARKER} ${n} ${"x".repeat(64)}`);

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ S1 — the PUBLIC path is byte-identical to today (regression guard) ▓▓
  //   Every existing caller depends on this: LOGO uploads, chat attachments, accounting
  //   attachments, kanban card attachments.
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S1 · public upload — frozen golden projection ──");
  const logoBytes = body("logo");
  const rLogo = await capture(() => ST.uploadFile({ tenantId: tidA }, { kind: "LOGO", filename: "โลโก้ร้าน.png", contentType: "image/png", data: logoBytes }, deps));
  {
    const keys = Object.keys(rLogo ?? {}).sort();
    chk("C0.4-S1.1", "a public upload still answers EXACTLY `{ ok, cdnUrl, assetId }` — the result object every caller destructures today (an extra `visibility`/`path`/`url` key means the shape drifted)",
      rLogo?.ok === true && j(keys) === j(GOLDEN_RESULT_KEYS), j(GOLDEN_RESULT_KEYS), j(keys));
  }
  const rowLogo = rLogo?.assetId ? await P.fileAsset.findUnique({ where: { id: rLogo.assetId } }) : null;
  {
    const path: string = rowLogo?.path ?? "";
    const seg = path.split("/");
    const okShape = seg.length === 4 && seg[0] === "t" && seg[1] === tidA && seg[2] === "logo" && PUBLIC_ID_RE.test(seg[3]?.replace(/\.png$/, "") ?? "") && seg[3]?.endsWith(".png") === true;
    chk("C0.4-S1.2", "the public path is unchanged: `t/<tenantId>/<kind lower-case>/<32 hex>.<ext>` — same folder, same random-name shape, no `private/` segment (a builder that routes every upload through the new naming breaks every URL already handed out)",
      okShape && !path.includes("/private/"), `t/${tidA}/logo/<32hex>.png`, path || "(no row)");
    chk("C0.4-S1.3", "`cdnUrl` is still exactly `<SHARK_BUNNY_CDN>/<path>` and it is what the caller got back — the public CDN URL must keep working for LOGO/chat/accounting/kanban",
      rowLogo?.cdnUrl === `${CDN}/${path}` && rLogo?.cdnUrl === rowLogo?.cdnUrl, `${CDN}/${path}`, `row=${rowLogo?.cdnUrl ?? "-"} result=${rLogo?.cdnUrl ?? "-"}`);
  }
  {
    const proj = rowLogo ? { kind: rowLogo.kind, contentType: rowLogo.contentType, bytes: rowLogo.bytes, path: rowLogo.path, cdnUrl: rowLogo.cdnUrl } : null;
    const want = { kind: "LOGO", contentType: "image/png", bytes: logoBytes.length, path: rowLogo?.path, cdnUrl: rowLogo?.cdnUrl };
    chk("C0.4-S1.4", "the FileAsset row of a public upload is written exactly as today (kind = the kind asked for, raw contentType, real byte count) — `kind` must NOT become a privacy marker (it is an enum; see the controller addendum)",
      j(proj) === j(want), j(want), j(proj));
  }
  {
    const p = PUTS.find((x) => x.path === rowLogo?.path);
    const same = p ? p.bytes.length === logoBytes.length && Buffer.from(p.bytes).equals(Buffer.from(logoBytes)) : false;
    chk("C0.4-S1.5", "the object is still handed to storage as `put(path, data, contentType)` with the SAME path that is stored in the row and the untouched bytes — the file really lands where `cdnUrl` points",
      !!p && same && p?.contentType === "image/png", `put(${rowLogo?.path}, ${logoBytes.length}B, image/png)`, p ? `put(${p.path}, ${p.bytes.length}B, ${p.contentType})` : "put not called");
  }
  const rAudio = await capture(() => ST.uploadFile({ tenantId: tidA }, { kind: "ATTACHMENT", filename: "เสียง.webm", contentType: "audio/webm;codecs=opus", data: body("audio"), maxBytes: ST.CHAT_ATTACHMENT_MAX_BYTES }, deps));
  const rowAudio = rAudio?.assetId ? await P.fileAsset.findUnique({ where: { id: rAudio.assetId } }) : null;
  {
    const ok = rowAudio?.path?.startsWith(`t/${tidA}/attachment/`) === true && rowAudio?.path?.endsWith(".webm") === true && rowAudio?.contentType === "audio/webm;codecs=opus";
    chk("C0.4-S1.6", "a chat voice attachment is unchanged: `audio/webm;codecs=opus` still normalises to the `.webm` extension while the RAW mime (codecs and all) is what gets stored — the rule that keeps iOS/Android voice bubbles playable",
      ok, `t/${tidA}/attachment/<32hex>.webm · contentType kept raw`, `${rowAudio?.path ?? "-"} · ${rowAudio?.contentType ?? "-"}`);
  }
  {
    const rExplicit = await capture(() => ST.uploadFile({ tenantId: tidA }, { kind: "ATTACHMENT", filename: "a.pdf", contentType: "application/pdf", data: body("pub-explicit"), visibility: "public" }, deps));
    const rowE = rExplicit?.assetId ? await P.fileAsset.findUnique({ where: { id: rExplicit.assetId } }) : null;
    chk("C0.4-S1.7", "`visibility:\"public\"` written out explicitly behaves exactly like leaving it out (same path folder, same working CDN URL) — the default must be public, so no existing caller changes behaviour by saying nothing",
      rExplicit?.ok === true && rowE?.path?.startsWith(`t/${tidA}/attachment/`) === true && rowE?.cdnUrl === `${CDN}/${rowE?.path}` && j(Object.keys(rExplicit).sort()) === j(GOLDEN_RESULT_KEYS),
      `t/${tidA}/attachment/… + cdnUrl`, `${rowE?.path ?? "-"} · ${rowE?.cdnUrl ?? "-"}`);
  }
  {
    const before = await P.fileAsset.count({ where: { tenantId: tidA } });
    const bad = await capture(() => ST.uploadFile({ tenantId: tidA }, { kind: "ATTACHMENT", filename: "x.exe", contentType: "application/x-msdownload", data: body("bad") }, deps));
    const big = await capture(() => ST.uploadFile({ tenantId: tidA }, { kind: "ATTACHMENT", filename: "big.pdf", contentType: "application/pdf", data: new Uint8Array(6 * 1024 * 1024), maxBytes: 5 * 1024 * 1024 }, deps));
    const after = await P.fileAsset.count({ where: { tenantId: tidA } });
    const shapes = j(Object.keys(bad ?? {}).sort()) === j(GOLDEN_FAIL_KEYS) && j(Object.keys(big ?? {}).sort()) === j(GOLDEN_FAIL_KEYS);
    const thai = typeof bad?.error === "string" && /[ก-๙]/.test(bad.error) && typeof big?.error === "string" && /[ก-๙]/.test(big.error);
    chk("C0.4-S1.8", "the refusals are unchanged: a mime outside the allowlist and an oversize file both come back `{ ok:false, error:<Thai> }` (never a throw), and neither writes a FileAsset row — the mime/size allowlist is the X6 door for CRM's inbound e-mail attachments too",
      bad?.ok === false && big?.ok === false && shapes && thai && after === before, "ok:false · Thai error · no row", `bad=${j(bad)} big=${j(big)} rows ${before}→${after}`);
  }
  {
    const p = ST.storagePathFromCdnUrl(rowLogo?.cdnUrl);
    const foreign = ST.storagePathFromCdnUrl("https://obs.line-scdn.net/abc.jpg");
    const trav = ST.storagePathFromCdnUrl(`${CDN}/t/${tidA}/../../etc/passwd`);
    const q = ST.storagePathFromCdnUrl(`${rowLogo?.cdnUrl}?v=2#x`);
    chk("C0.4-S1.9", "`storagePathFromCdnUrl` still maps a public CDN URL back to its path (query/hash stripped), still refuses a foreign provider's URL and still refuses `..` — the traversal guard that stops a delete from hitting the wrong object",
      p === rowLogo?.path && q === rowLogo?.path && foreign === null && trav === null,
      `${rowLogo?.path} · ${rowLogo?.path} · null · null`, `${p} · ${q} · ${foreign} · ${trav}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ S2 — a PRIVATE upload returns and stores NO fetchable URL ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · private upload — nothing fetchable comes back ──");
  /** every string leaf of a value (DTOs are nested; a URL hidden one level down is still a leak) */
  const strings = (v: unknown, out: string[] = [], depth = 0): string[] => {
    if (depth > 6 || v === null || v === undefined) return out;
    if (typeof v === "string") { out.push(v); return out; }
    if (Array.isArray(v)) { for (const x of v) strings(x, out, depth + 1); return out; }
    if (v instanceof Date) return out;
    if (typeof v === "object") { for (const x of Object.values(v as Record<string, unknown>)) strings(x, out, depth + 1); return out; }
    return out;
  };
  /** a string someone could paste into a browser and get the bytes */
  const fetchable = (s: string, objectPath?: string): boolean => {
    if (s.startsWith(CDN)) return true;
    if (!/^https?:\/\//i.test(s)) return false;
    if (s.includes(BUNNY_STORAGE_HOST)) return true;
    return objectPath ? s.includes(objectPath) : false;
  };
  const uploadPrivate = async (name: string, contentType: string, kind = "ATTACHMENT"): Promise<Any> => {
    const data = body(name);
    let r = await capture(() => ST.uploadFile({ tenantId: tidA }, { kind, filename: `${name}.bin`, contentType, data, visibility: "private" }, deps));
    let via = "uploadFile(visibility:private)";
    const pathOf = async (res: Any): Promise<string> => (res?.ok && res?.assetId ? ((await P.fileAsset.findUnique({ where: { id: res.assetId } }))?.path ?? "") : "");
    if (!(await pathOf(r)).includes("/private/") && typeof ST.uploadPrivateFile === "function") {
      r = await capture(() => ST.uploadPrivateFile({ tenantId: tidA }, { kind, filename: `${name}.bin`, contentType, data }, deps));
      via = "uploadPrivateFile()";
    }
    return { r, data, via };
  };
  const p1 = await uploadPrivate("rec-1", "audio/mpeg");
  const p2 = await uploadPrivate("rec-2", "application/pdf");
  const row1 = p1.r?.assetId ? await P.fileAsset.findUnique({ where: { id: p1.r.assetId } }) : null;
  const row2 = p2.r?.assetId ? await P.fileAsset.findUnique({ where: { id: p2.r.assetId } }) : null;
  chk("C0.4-S2.1", "a private upload succeeds and returns an asset id (this is the call CRM will make for call recordings, inbound e-mail attachments, contracts and payment slips)",
    p1.r?.ok === true && !!row1, "ok:true + row", `${j(p1.r)} · via ${p1.via}`);
  {
    const path: string = row1?.path ?? "";
    const m = /^t\/([^/]+)\/private\/([^/.]+)\.([a-z0-9]+)$/.exec(path);
    const okTenant = m?.[1] === tidA;
    const token = m?.[2] ?? "";
    chk("C0.4-S2.2", "the private object lives under its own `t/<tenantId>/private/<unguessable>.<ext>` segment (the controller addendum's marker — `kind` is an enum and cannot carry it), still tenant-scoped and still with a real extension",
      !!m && okTenant && token.length > 0, `t/${tidA}/private/<unguessable>.<ext>`, path || "(no row)");
    chk("C0.4-S2.3", "the unguessable part is NOT the row id (and does not contain it) — deriving the file name from the id makes every private object reachable by anyone who has ever seen an id",
      token.length > 0 && token !== row1?.id && !token.includes(String(row1?.id)) && !String(row1?.id).includes(token), "independent of FileAsset.id", `${token} vs id ${row1?.id}`);
  }
  {
    const leaks = strings(p1.r).filter((s) => fetchable(s, row1?.path));
    const control = strings(rLogo).filter((s) => fetchable(s, rowLogo?.path));
    chk("C0.4-S2.4", "NOTHING in the object returned by a private upload is a fetchable URL — every string leaf is checked, not just a key called `cdnUrl` (a DTO that hides the URL under `url`/`href`/`meta.src` is the same leak)",
      leaks.length === 0, "no fetchable string", leaks.map((s) => cut(s, 80)).join(" · ") || "-");
    chk("C0.4-S2.5", "[positive control] the same walker DOES find a fetchable URL in the PUBLIC upload result — otherwise S2.4 would be green for a walker that looks at nothing",
      control.length > 0, "≥1 fetchable string", String(control.length), "MAJOR");
  }
  {
    const cols = row1 ? Object.entries(row1).filter(([, v]) => typeof v === "string") : [];
    const leaks = cols.filter(([, v]) => fetchable(String(v), row1?.path)).map(([k]) => k);
    const cdn = String(row1?.cdnUrl ?? "");
    let parses = false;
    try { const u = new URL(cdn); parses = u.protocol === "http:" || u.protocol === "https:"; } catch { parses = false; }
    chk("C0.4-S2.6", "no COLUMN of the stored row holds a fetchable URL either, and `cdnUrl` holds a sentinel that is not an http(s) URL at all — a grep for the CDN base across the table must never hit a private row",
      leaks.length === 0 && cdn.length > 0 && !parses && !cdn.startsWith(CDN), "sentinel, not a URL", `cdnUrl=${cut(cdn, 90)} leaks=${leaks.join(",") || "-"}`);
  }
  {
    const n = await P.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM "FileAsset" WHERE "tenantId" = $1 AND "path" LIKE 't/%/private/%' AND "cdnUrl" LIKE $2`,
      tidA, `${CDN}%`,
    ) as Any[];
    chk("C0.4-S2.7", "asked of the database directly: zero rows are both private-by-path and public-by-URL — the two halves of the decision can never drift apart",
      Number(n?.[0]?.n ?? -1) === 0, "0 rows", String(n?.[0]?.n ?? "?"));
  }
  {
    // 64 private uploads: the unguessable part must be CSPRNG, ≥128 bits, and not time-ordered
    const toks: string[] = [];
    for (let i = 0; i < 64; i += 1) {
      const r = await capture(() => ST.uploadFile({ tenantId: tidA }, { kind: "ATTACHMENT", filename: `e${i}.txt`, contentType: "text/plain", data: enc.encode(`${MARKER} e${i}`), visibility: "private" }, deps));
      const row = r?.assetId ? await P.fileAsset.findUnique({ where: { id: r.assetId } }) : null;
      const m = /\/private\/([^/.]+)\./.exec(String(row?.path ?? ""));
      if (m?.[1]) toks.push(m[1]);
    }
    const uniq = new Set(toks).size;
    const alphabet = new Set(toks.join("").split("")).size;
    const minLen = toks.length ? Math.min(...toks.map((t) => t.length)) : 0;
    const bits = minLen * Math.log2(Math.max(alphabet, 2));
    const sorted = [...toks].sort();
    const monotonic = toks.length > 2 && j(sorted) === j(toks);
    chk("C0.4-S2.8", "over 64 private uploads every unguessable part is distinct and carries ≥128 bits for the observed alphabet — `Math.random()`, a short suffix or a counter all fall here (the whole protection of a private file is that its name cannot be guessed)",
      toks.length === 64 && uniq === 64 && bits >= 128, "64 distinct · ≥128 bits", `n=${toks.length} uniq=${uniq} len=${minLen} alphabet=${alphabet} bits=${bits.toFixed(0)}`);
    chk("C0.4-S2.9", "…and they are not time-ordered — a cuid/ULID/timestamp-prefixed name sorts in creation order, which tells an attacker who has one name roughly where the neighbours are",
      !monotonic, "not sorted in creation order", monotonic ? "creation order == sorted order" : "unordered", "MAJOR");
  }
  {
    const cols = (await P.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='FileAsset' ORDER BY column_name`) as Any[]).map((r) => String(r.column_name));
    const kinds = (await P.$queryRawUnsafe(`SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='FileKind' ORDER BY e.enumlabel`) as Any[]).map((r) => String(r.v));
    chk("C0.4-S2.10", "C0.4 ships NO schema change: `FileAsset` still has exactly its 8 columns and `FileKind` still has exactly LOGO/ATTACHMENT (migrations belong to C1.1/C2.0/C3.0 — MASTER-PLAN §2.5). This is also what makes the `kind`-prefix idea of RESOLUTIONS R-E 2 impossible",
      j(cols) === j(GOLDEN_COLUMNS) && j(kinds) === j(GOLDEN_FILEKIND), `${j(GOLDEN_COLUMNS)} · ${j(GOLDEN_FILEKIND)}`, `${j(cols)} · ${j(kinds)}`);
    chk("C0.4-S2.11", "the private row's `kind` is a legal enum value (ATTACHMENT) — proof that privacy is carried by the path and not by a string that the column cannot even hold",
      GOLDEN_FILEKIND.includes(String(row1?.kind)), "LOGO|ATTACHMENT", String(row1?.kind));
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ S3 — the signed route ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · GET /api/files/[id]?exp&sig ──");
  type Viewer = { kind: "STAFF" | "CUSTOMER"; id: string; cookie: string; label: string };
  const vStaffA: Viewer = { kind: "STAFF", id: staffA.id, cookie: staffA.cookie, label: "staff A" };
  const vStaffA2: Viewer = { kind: "STAFF", id: staffA2.id, cookie: staffA2.cookie, label: "staff A2" };
  const vStaffB: Viewer = { kind: "STAFF", id: staffB.id, cookie: staffB.cookie, label: "staff B (other tenant)" };
  const vCust: Viewer = { kind: "CUSTOMER", id: customer.id, cookie: custCookie, label: "customer" };

  // `privateFileUrl(fileId, viewer, ttlSec?)` — the brief does not fix the `viewer` shape, so the
  // oracle tries the plausible ones once and then uses whichever the builder implemented.
  const shapes = (v: Viewer): Any[] => [
    { kind: v.kind, id: v.id }, { type: v.kind, id: v.id }, { kind: v.kind.toLowerCase(), id: v.id },
    { role: v.kind, id: v.id }, `${v.kind.toLowerCase()}:${v.id}`, v.id,
  ];
  let shapeIdx = -1;
  const mint = async (fileId: string, v: Viewer, ttl?: number): Promise<string> => {
    if (typeof ST.privateFileUrl !== "function") return "";
    const tryOne = async (arg: Any): Promise<string> => {
      try {
        const out = await ST.privateFileUrl(fileId, arg, ttl);
        return typeof out === "string" && /[?&]exp=/.test(out) && /[?&]sig=/.test(out) ? out : "";
      } catch { return ""; }
    };
    if (shapeIdx >= 0) return tryOne(shapes(v)[shapeIdx]);
    const all = shapes(v);
    for (let i = 0; i < all.length; i += 1) {
      const u = await tryOne(all[i]);
      if (u) { shapeIdx = i; return u; }
    }
    return "";
  };
  // 🔴 the rate limiter (X7) must not poison the OTHER groups: every route call outside the X7
  //    block starts from an empty bucket, so S3/S4/S5/X10 measure the route and nothing else.
  let RL_CLEAR = true;
  const clearBuckets = async (): Promise<void> => {
    // only rows that carry OUR viewer ids — `ChatRateBucket` is shared with every other session
    for (const n of RATE_KEY_NEEDLES) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${n}%`);
  };
  // …and a fresh client IP per call outside the X7 block, so an IP-keyed bucket cannot spill
  // its verdict from one group of checks into the next (X7 keeps ONE ip on purpose).
  let ipn = 0;
  const nextIp = (): string => (RL_CLEAR ? `198.51.${Math.floor(ipn / 250) % 250}.${(ipn++ % 250) + 1}` : "203.0.113.9");
  type Res = { status: number; headers: Headers; text: string; bytes: number; threw: string };
  const callRoute = async (url: string, cookie: string, idOverride?: string): Promise<Res> => {
    if (RL_CLEAR) await clearBuckets();
    const u = new URL(url || "/api/files/x", "http://qc.local");
    const segs = u.pathname.split("/").filter(Boolean);
    const id = idOverride ?? decodeURIComponent(segs[segs.length - 1] ?? "");
    const req = new Request(u.href, { headers: { cookie, "user-agent": "qc-c04", "x-forwarded-for": nextIp() } });
    const handler = routeMod?.GET;
    if (typeof handler !== "function") return { status: 0, headers: new Headers(), text: "", bytes: 0, threw: `route has no GET export (${routeMod?.__err ?? "?"})` };
    try {
      const res = await capture(() => withRequestScope(req, () => handler(req, { params: Promise.resolve({ id }) })));
      const buf = new Uint8Array(await res.arrayBuffer());
      return { status: res.status, headers: res.headers, text: Buffer.from(buf).toString("utf8"), bytes: buf.length, threw: "" };
    } catch (e) {
      const digest = String((e as Any)?.digest ?? "");
      const m = /NEXT_HTTP_ERROR_FALLBACK;(\d+)/.exec(digest);
      if (m) return { status: Number(m[1]), headers: new Headers(), text: "", bytes: 0, threw: `thrown ${digest}` };
      return { status: -1, headers: new Headers(), text: "", bytes: 0, threw: cut(e instanceof Error ? `${e.name}: ${e.message}` : String(e), 200) };
    }
  };
  const fresh = await mint(String(row1?.id), vStaffA);
  chk("C0.4-S3.0", "[positive control] `privateFileUrl(fileId, viewer, ttlSec?)` exists and mints a link carrying `exp` and `sig` — without it nothing below can be tested",
    fresh.length > 0, "/api/files/<id>?exp=…&sig=…", fresh ? `${cut(fresh, 110)} (viewer arg shape #${shapeIdx})` : "no link minted", "MAJOR");
  const fetchesBefore = FETCHES.length;
  const okRes = await callRoute(fresh, staffA.cookie);
  {
    const served = FETCHES.slice(fetchesBefore).some((f) => f.served);
    chk("C0.4-S3.1", "a fresh link, presented by the viewer it was minted for, returns 200 with EXACTLY the stored bytes — the route streams the object server-side (the storage read really happened) instead of redirecting the browser to the CDN",
      okRes.status === 200 && okRes.text.includes(MARKER) && okRes.bytes === p1.data.length,
      `200 · ${p1.data.length} bytes`, `${okRes.status} · ${okRes.bytes} bytes · storageRead=${served} ${okRes.threw}`);
    const k = FETCHES.slice(fetchesBefore).find((f) => f.served);
    chk("C0.4-S3.2", "the bytes are pulled with the storage AccessKey from the server side — the client never talks to the storage zone itself",
      !k || Object.keys(k.headers).some((h) => h === "accesskey" || h === "authorization"), "server-side authenticated read", k ? j(Object.keys(k.headers)) : "no storage fetch recorded", "MINOR");
  }
  {
    const expired = fresh.replace(/([?&])exp=\d+/, `$1exp=${Math.floor(Date.now() / 1000) - 60}`);
    const r = await callRoute(expired, staffA.cookie);
    chk("C0.4-S3.3", "a link whose `exp` already passed is refused with 403 and hands over no bytes — a link that leaks into a chat log is worthless 15 minutes later",
      r.status === 403 && !r.text.includes(MARKER), "403 · no bytes", `${r.status} · bytes=${r.bytes} ${r.threw}`);
  }
  {
    const m = /[?&]sig=([^&]+)/.exec(fresh);
    const sig = m?.[1] ?? "";
    const flipped = sig ? `${sig.slice(0, -1)}${sig.slice(-1) === "a" ? "b" : "a"}` : "deadbeef";
    const r = await callRoute(fresh.replace(/([?&])sig=[^&]+/, `$1sig=${flipped}`), staffA.cookie);
    chk("C0.4-S3.4", "one flipped character in `sig` → 403 (and the comparison must not be sloppy: prefix/truncated comparisons pass a tampered signature)",
      r.status === 403 && !r.text.includes(MARKER), "403 · no bytes", `${r.status} · bytes=${r.bytes} ${r.threw}`);
    const r2 = await callRoute(fresh.replace(/[?&]sig=[^&]+/, ""), staffA.cookie);
    const r3 = await callRoute(fresh.replace(/[?&]exp=\d+/, ""), staffA.cookie);
    chk("C0.4-S3.5", "a link with `sig` or `exp` simply removed is refused too — a missing parameter must never be read as 'nothing to verify'",
      r2.status === 403 && r3.status === 403 && !r2.text.includes(MARKER) && !r3.text.includes(MARKER), "403 · 403", `${r2.status} · ${r3.status}`);
  }
  {
    const r = await callRoute(fresh, staffA2.cookie);
    chk("C0.4-S3.6", "the link minted for staff A is refused (403) when another staff member of the SAME shop presents it — the signature binds the viewer, so a leaked link is useless to anyone else",
      r.status === 403 && !r.text.includes(MARKER), "403 · no bytes", `${r.status} · bytes=${r.bytes} ${r.threw}`);
    const r2 = await callRoute(fresh, custCookie);
    chk("C0.4-S3.7", "…and refused (403) when a CUSTOMER session of the same shop presents it — the staff↔customer direction of the binding",
      r2.status === 403 && !r2.text.includes(MARKER), "403 · no bytes", `${r2.status} · bytes=${r2.bytes} ${r2.threw}`);
    const custLink = await mint(String(row1?.id), vCust);
    const r3 = custLink ? await callRoute(custLink, staffA.cookie) : { status: -2, text: "", bytes: 0, threw: "no customer link", headers: new Headers() };
    chk("C0.4-S3.8", "the opposite direction: a link minted for a customer session is refused (403) when a staff session presents it — neither side inherits the other's links",
      r3.status === 403 && !r3.text.includes(MARKER), "403 · no bytes", `${r3.status} · ${r3.threw}`);
    const r4 = custLink ? await callRoute(custLink, custCookie) : r3;
    chk("C0.4-S3.9", "[positive control] that same customer link DOES work for the customer it was minted for — otherwise S3.8 would be green just because customer links never work",
      r4.status === 200 && r4.text.includes(MARKER), "200 · bytes", `${r4.status} · bytes=${r4.bytes} ${r4.threw}`, "MAJOR");
  }
  {
    // the HMAC must bind all three parts: id, exp and viewerKey
    const link2 = await mint(String(row2?.id), vStaffA);
    const swapId = fresh.replace(/\/api\/files\/[^?]+/, `/api/files/${row2?.id}`);
    const r = await callRoute(swapId, staffA.cookie, String(row2?.id));
    chk("C0.4-S3.10", "taking the `exp`+`sig` of one file and pointing them at ANOTHER file of the SAME viewer fails — proof that `id` is inside the HMAC and not merely a path segment (otherwise one link opens every file the viewer owns)",
      (r.status === 403 || r.status === 404) && !r.text.includes(MARKER), "403/404 · no bytes", `${r.status} · bytes=${r.bytes} ${r.threw}`);
    const expNow = /[?&]exp=(\d+)/.exec(fresh)?.[1] ?? "0";
    const stretched = fresh.replace(/([?&])exp=\d+/, `$1exp=${Number(expNow) + 86_400}`);
    const r2 = await callRoute(stretched, staffA.cookie);
    chk("C0.4-S3.11", "keeping `sig` and pushing `exp` a day into the future fails — proof that `exp` is inside the HMAC and not just compared against the clock (this is the whole of 'a link expires')",
      r2.status === 403 && !r2.text.includes(MARKER), "403 · no bytes", `${r2.status} · bytes=${r2.bytes} ${r2.threw}`);
    chk("C0.4-S3.12", "[positive control] the second file's own link works for the same viewer — so S3.10 fails for the right reason (the swap), not because file 2 is unreadable",
      link2 ? (await callRoute(link2, staffA.cookie)).status === 200 : false, "200", link2 ? "minted" : "no link", "MAJOR");
  }
  {
    const linkForA = await mint(String(row1?.id), vStaffB); // tenant B's staff, tenant A's file — signature is valid, tenant is not
    const r = linkForA ? await callRoute(linkForA, staffB.cookie) : { status: -2, text: "", bytes: 0, threw: "no link", headers: new Headers() };
    const leaks = /[0-9a-f]{16,}|private\//.test(r.text) && r.text.includes(String(row1?.path ?? "@@"));
    chk("C0.4-S3.13", "a correctly signed link for a file of ANOTHER shop answers 404 (not 403) and says nothing about the file — 404 keeps an outsider from learning that an id exists at all (X1)",
      r.status === 404 && !r.text.includes(MARKER) && !leaks, "404 · no leak", `${r.status} · ${cut(r.text, 80)} ${r.threw}`);
  }
  {
    const hostile = ["../../../etc/passwd", "..%2F..%2Ft%2Fx%2Fprivate%2Fy.png", `../${tidB}/private/x.png`, "t/x/private/y.png"];
    const results: string[] = [];
    let worst = true;
    let touched = false;
    for (const h of hostile) {
      const before = FETCHES.length;
      const r = await callRoute(`/api/files/${encodeURIComponent(h)}?exp=${Math.floor(Date.now() / 1000) + 300}&sig=deadbeef`, staffA.cookie, h);
      if (r.status !== 404) worst = false;
      if (FETCHES.slice(before).some((f) => f.served)) touched = true;
      results.push(`${h} → ${r.status}`);
    }
    chk("C0.4-S3.14", "an `id` carrying path traversal answers 404 and never reaches storage — the id is a row id, never a file path (a route that concatenates it into a storage path can be walked out of the tenant folder)",
      worst && !touched, "404 each · no storage read", `${results.join(" · ")} · storageRead=${touched}`);
  }
  {
    const long = await mint(String(row1?.id), vStaffA, 3600);
    const exp = Number(/[?&]exp=(\d+)/.exec(long)?.[1] ?? 0);
    const ttl = exp - Math.floor(Date.now() / 1000);
    chk("C0.4-S3.15", "`privateFileUrl` caps the lifetime at 15 minutes even when the caller asks for an hour — the brief's `exp ≤ 15 min` must be enforced where the link is minted, not left to the caller",
      long.length > 0 && ttl > 0 && ttl <= 900, "exp ≤ now+900s", `ttl=${ttl}s`);
  }
  {
    // Recover the exact signature recipe from ONE valid sample so that a FORGED link can be tested.
    const id = String(row1?.id);
    const exp = /[?&]exp=(\d+)/.exec(fresh)?.[1] ?? "";
    const sig = /[?&]sig=([^&]+)/.exec(fresh)?.[1] ?? "";
    const secret = process.env.SESSION_SECRET ?? "";
    const vks = [staffA.id, `staff:${staffA.id}`, `STAFF:${staffA.id}`, `user:${staffA.id}`, `u:${staffA.id}`, `staff/${staffA.id}`,
      coreHash.sha256(staffA.id), `staff:${coreHash.sha256(staffA.id)}`];
    const encs: ("hex" | "base64url" | "base64")[] = ["hex", "base64url", "base64"];
    let recipe: { vk: string; e: "hex" | "base64url" | "base64" } | null = null;
    for (const vk of vks) for (const e of encs) {
      const got = createHmac("sha256", secret).update(`${id}.${exp}.${vk}`).digest(e);
      if (got === sig || encodeURIComponent(got) === sig) { recipe = { vk, e }; break; }
    }
    chk("C0.4-S3.16", "the signature is HMAC-SHA256 over `${id}.${exp}.${viewerKey}` keyed with SESSION_SECRET — recovered from a real link, so the documented construction is the one actually shipped",
      recipe !== null, "recipe recovered", recipe ? `viewerKey=${recipe.vk.slice(0, 12)}… enc=${recipe.e}` : "no candidate matched", "MINOR");
    if (recipe) {
      const farExp = Math.floor(Date.now() / 1000) + 3600;
      const forged = createHmac("sha256", secret).update(`${id}.${farExp}.${recipe.vk}`).digest(recipe.e);
      const r = await callRoute(`/api/files/${id}?exp=${farExp}&sig=${encodeURIComponent(forged)}`, staffA.cookie, id);
      chk("C0.4-S3.17", "a PERFECTLY signed link with a one-hour `exp` is still refused — the 15-minute ceiling is re-checked by the route, so anyone who can call the minting helper (a future bug, an AI tool) cannot mint an eternal link",
        r.status === 403 && !r.text.includes(MARKER), "403", `${r.status} · bytes=${r.bytes} ${r.threw}`, "MAJOR");
    } else {
      unproven("C0.4-S3.17", "the route re-checks the 15-minute ceiling on an otherwise valid signature", "the signature recipe could not be recovered, so no valid long-exp link can be forged here (S3.15 still proves the minting side)");
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ S4 — disposition and caching headers ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · headers ──");
  const noStore = (h: Headers): boolean => {
    const cc = (h.get("cache-control") ?? "").toLowerCase();
    return cc.includes("private") && cc.includes("no-store");
  };
  {
    const link = await mint(String(row2?.id), vStaffA); // application/pdf
    const r = await callRoute(link, staffA.cookie);
    const cd = r.headers.get("content-disposition") ?? "";
    chk("C0.4-S4.1", "a non-inline mime (application/pdf) comes back as `Content-Disposition: attachment` — a contract or a payment slip must download, never render inside our origin (X6: forced download for inbound attachments)",
      r.status === 200 && /(^|[^a-z])attachment/i.test(cd), "attachment", `${r.status} · ${cd || "(none)"}`);
    chk("C0.4-S4.2", "the disposition header carries no CR/LF — a header assembled from a file name is a response-splitting hole",
      !/[\r\n]/.test(cd), "no CR/LF", j(cd), "MAJOR");
    chk("C0.4-S4.3", "the response advertises the stored content type, so the browser is not left guessing (and cannot be talked into sniffing something executable)",
      (r.headers.get("content-type") ?? "").startsWith("application/pdf"), "application/pdf", r.headers.get("content-type") ?? "(none)", "MAJOR");
  }
  {
    const rTxt = await callRoute(await mint(String((await P.fileAsset.findFirst({ where: { tenantId: tidA, contentType: "text/plain" } }))?.id ?? ""), vStaffA), staffA.cookie);
    chk("C0.4-S4.4", "text/plain is also forced to download — HTML-ish text rendered on our own origin is the classic stored-XSS route for inbound e-mail attachments",
      rTxt.status === 200 && /(^|[^a-z])attachment/i.test(rTxt.headers.get("content-disposition") ?? ""), "200 · attachment", `${rTxt.status} · ${rTxt.headers.get("content-disposition") ?? "(none)"}`);
  }
  {
    const r = await callRoute(fresh, staffA.cookie); // audio/mpeg — inline allowlist
    const cd = (r.headers.get("content-disposition") ?? "").toLowerCase();
    chk("C0.4-S4.5", "an inline-allowlisted mime (image/png · image/jpeg · audio/*) may be shown in place — a call recording has to be playable without a download round-trip",
      r.status === 200 && (cd === "" || cd.startsWith("inline")), "inline (or unset)", `${r.status} · ${cd || "(none)"}`, "MAJOR");
    chk("C0.4-S4.6", "`Cache-Control: private, no-store` on the 200 — a private file must not be written to a shared proxy cache or to the browser's disk cache",
      noStore(r.headers), "private, no-store", r.headers.get("cache-control") ?? "(none)");
  }
  {
    const r403 = await callRoute(fresh.replace(/([?&])sig=[^&]+/, "$1sig=bad"), staffA.cookie);
    const r404 = await callRoute(`/api/files/${encodeURIComponent("../x")}?exp=1&sig=1`, staffA.cookie, "../x");
    chk("C0.4-S4.7", "the refusals carry `Cache-Control: private, no-store` too — a cached 403/404 for one viewer must never be replayed to another (and a cached 403 would hide a later legitimate 200)",
      r403.status === 403 && noStore(r403.headers) && r404.status === 404 && noStore(r404.headers),
      "403 + 404, both private, no-store", `${r403.status}:${r403.headers.get("cache-control") ?? "-"} · ${r404.status}:${r404.headers.get("cache-control") ?? "-"}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ S5 — delete removes the row AND the object ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · delete ──");
  const victim = await uploadPrivate("victim", "application/pdf");
  const rowV = victim.r?.assetId ? await P.fileAsset.findUnique({ where: { id: victim.r.assetId } }) : null;
  const victimLink = await mint(String(rowV?.id), vStaffA);
  /** the work order must expose ONE call that removes both halves; try the plausible names/orders */
  const deleteBoth = async (tenantId: string, assetId: string): Promise<{ called: string; out: Any }> => {
    const names = ["deletePrivateFile", "deleteFileAsset", "deleteAsset", "deleteFile", "removeFileAsset"];
    for (const n of names) {
      if (typeof ST[n] !== "function") continue;
      const argSets: [Any, Any, Any][] = [[{ tenantId }, assetId, delDeps], [{ tenantId }, { id: assetId }, delDeps], [tenantId, assetId, delDeps]];
      for (const [a, b, c] of argSets) {
        try {
          const out = await capture(() => ST[n](a, b, c));
          if (out !== undefined) return { called: n, out };
        } catch { /* wrong arity — try the next */ }
      }
    }
    return { called: "", out: undefined };
  };
  let DELETE_FN = "";
  {
    const before = DELS.length;
    const d = await deleteBoth(tidA, String(rowV?.id));
    DELETE_FN = d.called;
    const gone = (await P.fileAsset.count({ where: { id: String(rowV?.id) } })) === 0;
    const asked = DELS.slice(before);
    chk("C0.4-S5.1", "one call removes BOTH halves: the FileAsset row is gone AND the injected `del` was asked for the REAL storage path (not the sentinel, not the id) — a delete that forgets the object leaves a recording sitting in the bucket for ever, which is exactly the PDPA debt this work order is closing",
      d.called !== "" && gone && asked.includes(String(rowV?.path)), `row deleted · del("${rowV?.path}")`, `fn=${d.called || "none found"} rowGone=${gone} del=${j(asked)}`);
    chk("C0.4-S5.2", "no path handed to storage ever contains `..` — the sentinel goes through the same traversal guard as a CDN URL",
      DELS.every((p) => !p.includes("..")), "no `..`", j(DELS.filter((p) => p.includes("..")))); 
  }
  {
    const before = DELS.length;
    const again = await deleteBoth(tidA, String(rowV?.id));
    const stillGone = (await P.fileAsset.count({ where: { id: String(rowV?.id) } })) === 0;
    chk("C0.4-S5.3", "deleting the same asset twice is safe (no throw, row still gone) — erase jobs and retries run more than once by design",
      DELETE_FN !== "" && stillGone && again.called === DELETE_FN, "idempotent, no throw", `fn=${again.called || "none"} out=${j(again.out)} delsAfter=${DELS.length - before}`, "MAJOR");
  }
  {
    const r = await callRoute(victimLink, staffA.cookie);
    chk("C0.4-S5.4", "a link minted before the delete stops working afterwards (404/403) — the signature alone must never be enough once the row is gone",
      r.status === 404 || r.status === 403, "404/403", `${r.status} ${r.threw}`);
  }
  {
    const foreignVictim = await uploadPrivate("foreign-victim", "application/pdf");
    const rowF = foreignVictim.r?.assetId ? await P.fileAsset.findUnique({ where: { id: foreignVictim.r.assetId } }) : null;
    const before = DELS.length;
    await deleteBoth(tidB, String(rowF?.id)); // tenant B asking for tenant A's asset
    const stillThere = (await P.fileAsset.count({ where: { id: String(rowF?.id) } })) === 1;
    chk("C0.4-S5.5", "another shop cannot delete this shop's file: the row survives and `del` is not called — the tenant is re-resolved inside the delete, never taken from the caller (X1)",
      stillThere && DELS.slice(before).length === 0, "row intact · del not called", `intact=${stillThere} dels=${j(DELS.slice(before))}`);
  }
  {
    const before = DELS.length;
    const okPub = await capture(() => ST.deleteStoredFile(rowLogo?.cdnUrl, { tenantId: tidA }, delDeps));
    const foreign = await capture(() => ST.deleteStoredFile("https://obs.line-scdn.net/abc.jpg", { tenantId: tidA }, delDeps));
    const asked = DELS.slice(before);
    chk("C0.4-S5.6", "`deleteStoredFile` on a PUBLIC cdnUrl still deletes exactly that path, and still refuses a foreign provider's URL — the retention/erase jobs that already call it must keep working unchanged",
      okPub?.ok === true && asked.length === 1 && asked[0] === rowLogo?.path && foreign?.ok === false, `ok · del("${rowLogo?.path}") · foreign refused`, `${j(okPub)} ${j(asked)} ${j(foreign)}`);
  }
  {
    const p3 = await uploadPrivate("sentinel-del", "application/pdf");
    const row3 = p3.r?.assetId ? await P.fileAsset.findUnique({ where: { id: p3.r.assetId } }) : null;
    const before = DELS.length;
    const out = await capture(() => ST.deleteStoredFile(row3?.cdnUrl, { tenantId: tidA }, delDeps));
    const asked = DELS.slice(before);
    chk("C0.4-S5.7", "`deleteStoredFile` understands the private sentinel and removes the real object behind it — the erase path (C3.9) hands it whatever is in the `cdnUrl` column and must not silently skip private rows",
      out?.ok === true && asked.includes(String(row3?.path)), `ok · del("${row3?.path}")`, `${j(out)} ${j(asked)}`);
    // hostile sentinels: whatever the format, a traversal must never come out of it
    const sent = String(row3?.cdnUrl ?? "");
    const hostiles = [sent.includes(String(row3?.path)) ? sent.replace(String(row3?.path), `t/${tidA}/private/../../../evil.png`) : `${sent}/../../evil.png`, `${sent}/..`, `${sent}?x=../y`];
    const b2 = DELS.length;
    for (const h of hostiles) await capture(() => ST.deleteStoredFile(h, { tenantId: tidA }, delDeps));
    chk("C0.4-S5.8", "a sentinel carrying `..` never produces a delete outside its own folder — the guard that `storagePathFromCdnUrl` has for CDN URLs must cover the new format too",
      DELS.slice(b2).every((p) => !p.includes("..") && p.startsWith(`t/${tidA}/`)), "no traversal path", j(DELS.slice(b2)));
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ X7 — the route is rate-limited per viewer through `checkRateLimitDb` ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X7 · rate limit ──");
  const LIMIT_PROBE = 200;
  RL_CLEAR = false;
  await clearBuckets();
  {
    const target = String(row1?.id);
    let firstFail = -1;
    let status429 = 0;
    let retryAfter = "";
    const first10: number[] = [];
    for (let i = 0; i < LIMIT_PROBE; i += 1) {
      const link = await mint(target, vStaffA);
      const r = await callRoute(link, staffA.cookie);
      if (i < 10) first10.push(r.status);
      if (r.status === 429) { status429 = 429; firstFail = i; retryAfter = r.headers.get("retry-after") ?? ""; break; }
      if (r.status !== 200) { firstFail = i; break; }
    }
    chk("C0.4-X7.1", `the per-viewer limit really BITES: hammering the route with FRESH valid links answers 429 within ${LIMIT_PROBE} requests (importing the limiter without calling it, or calling it without acting on the verdict, leaves the route free to be used as a bulk exfiltration pipe)`,
      status429 === 429, `429 within ${LIMIT_PROBE}`, firstFail < 0 ? `no 429 in ${LIMIT_PROBE} requests` : `first non-200 at #${firstFail} = ${status429 || "?"}`);
    chk("C0.4-X7.2", "…and the 429 tells the caller when to come back (`Retry-After`), because a CRM page legitimately opens several attachments in a row",
      status429 !== 429 || retryAfter !== "", "Retry-After header", retryAfter || "(none)", "MAJOR");
    chk("C0.4-X7.3", "the limit is not set so low that an ordinary page breaks: the first 10 downloads of a viewer all succeed",
      first10.length === 10 && first10.every((s) => s === 200), "10 × 200", j(first10));
  }
  {
    // the bucket must live in ChatRateBucket — the one shared limiter (MASTER-PLAN §2.8, no second engine)
    const rows = await P.$queryRawUnsafe(
      `SELECT "key", "count" FROM "ChatRateBucket" WHERE "windowStart" >= $1 ORDER BY "count" DESC LIMIT 20`, T0,
    ) as Any[];
    const mine = rows.filter((r) => RATE_KEY_NEEDLES.some((n) => String(r.key).includes(n)));
    chk("C0.4-X7.4", "the counting really happens in `checkRateLimitDb` (a row in `ChatRateBucket` keyed by this viewer) — an in-process Map would pass X7.1 on one machine and count nothing across Vercel instances (bug B2)",
      mine.length > 0 && Number(mine[0]?.count ?? 0) > 1, "≥1 bucket row for this viewer", mine.length ? `${cut(String(mine[0].key), 70)} count=${mine[0].count}` : `no bucket carries the viewer id (rows seen: ${rows.length})`);
  }
  {
    const link = await mint(String(row1?.id), vStaffA2);
    const r = await callRoute(link, staffA2.cookie);
    chk("C0.4-X7.5", "a DIFFERENT viewer is unaffected while the first one is throttled — the bucket is per viewer, so one busy salesperson cannot lock the whole shop out of its own files",
      r.status === 200, "200", `${r.status} ${r.threw}`);
  }
  {
    for (const n of RATE_KEY_NEEDLES) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${n}%`);
    const link = await mint(String(row1?.id), vStaffA);
    const r = await callRoute(link, staffA.cookie);
    chk("C0.4-X7.6", "[positive control] with the bucket cleared the same viewer is served again — the 429 above came from the limiter, not from a broken link or a dead route",
      r.status === 200, "200", `${r.status} ${r.threw}`, "MAJOR");
  }
  {
    // brute-force lane: wrong signatures must be counted too
    let hit429 = false;
    for (let i = 0; i < LIMIT_PROBE && !hit429; i += 1) {
      const r = await callRoute(fresh.replace(/([?&])sig=[^&]+/, `$1sig=guess${i}`), staffA.cookie);
      if (r.status === 429) hit429 = true;
      else if (r.status !== 403) break;
    }
    chk("C0.4-X7.7", "requests that FAIL signature checking are counted as well — otherwise the only lane an attacker actually uses (guessing) is the one lane with no ceiling",
      hit429, `429 within ${LIMIT_PROBE} bad signatures`, hit429 ? "429" : "never throttled", "MAJOR");
    for (const n of RATE_KEY_NEEDLES) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${n}%`);
  }
  {
    const src = read(ROUTE_FILE) + storageSrc;
    const usesShared = /checkRateLimitDb/.test(src) && /rate-limit-db/.test(src);
    const secondEngine = /new Map\(\)[\s\S]{0,200}(rate|limit|bucket)/i.test(read(ROUTE_FILE));
    chk("C0.4-X7.8", "[static] the route uses the one shared limiter `@/lib/core/rate-limit-db` and starts no second counting engine of its own (MASTER-PLAN §2.8)",
      usesShared && !secondEngine, "checkRateLimitDb, no local Map", `shared=${usesShared} localMap=${secondEngine}`, "MINOR");
  }
  RL_CLEAR = true;
  await clearBuckets();

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ X10 — secrets and files ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X10 · secrets and files ──");
  {
    const listed = await ST.listAssets({ tenantId: tidA }, undefined, 100);
    const privRows = (listed as Any[]).filter((r) => String(r.path ?? "").includes("/private/"));
    const leaks = privRows.flatMap((r) => strings(r).filter((s) => fetchable(s, String(r.path))));
    chk("C0.4-X10.1", "the list that DTO builders read (`listAssets`) hands out no permanent URL for a private row — this is the surface where a 'just spread the row' DTO leaks the object (MASTER-PLAN §4 X10)",
      privRows.length > 0 && leaks.length === 0, "no fetchable URL", `${privRows.length} private rows · leaks=${leaks.map((s) => cut(s, 60)).join(",") || "-"}`);
  }
  {
    const sig = /[?&]sig=([^&]+)/.exec(fresh)?.[1] ?? "@@none@@";
    const rows = await P.fileAsset.findMany({ where: { tenantId: tidA } });
    const inRows = rows.some((r: Any) => j(r).includes(sig));
    const audits = await P.auditLog.findMany({ where: { tenantId: { in: [tidA, tidB] }, createdAt: { gte: T0 } } }).catch(() => []);
    const ops = await P.opsEvent.findMany({ where: { tenantId: { in: [tidA, tidB] }, createdAt: { gte: T0 } } }).catch(() => []);
    const outbox = await P.outboxEvent.findMany({ where: { tenantId: { in: [tidA, tidB] }, createdAt: { gte: T0 } } }).catch(() => []);
    const inEvidence = [...audits, ...ops, ...outbox].some((r: Any) => j(r).includes(sig));
    const inLogs = LOGS.some((l) => l.includes(sig));
    chk("C0.4-X10.2", "the signed link is a capability: it is never written into a row, an AuditLog, an OpsEvent, an outbox payload or the console — a link logged 'for debugging' is a file handed to whoever reads the logs",
      !inRows && !inEvidence && !inLogs, "signature nowhere in DB/logs", `rows=${inRows} evidence=${inEvidence} logs=${inLogs}`);
  }
  {
    const secret = process.env.SESSION_SECRET ?? "@@nosecret@@";
    const id = String(row1?.id);
    const farExp = Math.floor(Date.now() / 1000) + 3600;
    const attackerSecret = "attacker-chosen-secret-0123456789";
    const bodies = [`${id}.${farExp}.${staffA.id}`, `${id}.${farExp}.staff:${staffA.id}`];
    let served = false;
    const seen: number[] = [];
    for (const b of bodies) for (const e of ["hex", "base64url"] as const) {
      const sig = createHmac("sha256", attackerSecret).update(b).digest(e);
      const r = await callRoute(`/api/files/${id}?exp=${farExp}&sig=${encodeURIComponent(sig)}&secret=${attackerSecret}&key=${attackerSecret}`, staffA.cookie, id);
      seen.push(r.status);
      if (r.status === 200 || r.text.includes(MARKER)) served = true;
    }
    chk("C0.4-X10.3", "an expired/absent link cannot be revived by re-signing with a secret the CLIENT supplies (in the query string or anywhere else) — only `SESSION_SECRET`, which never leaves the server, can mint a link",
      !served, "403/404 every time", j(seen));
    const all = [okRes, await callRoute(fresh, staffA.cookie)];
    const hdrDump = all.map((r) => [...r.headers.entries()].map(([k, v]) => `${k}:${v}`).join(";")).join("|");
    const leaked = secret.length > 8 && (hdrDump.includes(secret) || all.some((r) => r.text.includes(secret)));
    const keyLeak = hdrDump.includes(FAKE_ACCESS_KEY) || all.some((r) => r.text.includes(FAKE_ACCESS_KEY));
    const pathLeak = hdrDump.includes(String(row1?.path)) || hdrDump.includes(CDN);
    chk("C0.4-X10.4", "no response carries `SESSION_SECRET`, the storage AccessKey, the CDN base or the object path in a header or body — the client learns nothing it could reuse without the route",
      !leaked && !keyLeak && !pathLeak, "no secret, no object location", `secret=${leaked} accessKey=${keyLeak} location=${pathLeak}`);
    chk("C0.4-X10.5", "nothing the route prints contains `SESSION_SECRET` or the storage AccessKey",
      !LOGS.some((l) => (secret.length > 8 && l.includes(secret)) || l.includes(FAKE_ACCESS_KEY)), "clean logs", String(LOGS.filter((l) => l.includes(FAKE_ACCESS_KEY)).length), "MAJOR");
    chk("C0.4-X10.6", "the file route sets no cookie — a download endpoint has no business touching the session (and a `Set-Cookie` on a cacheable-looking response is how sessions get swapped between users)",
      all.every((r) => !r.headers.has("set-cookie")), "no Set-Cookie", j(all.map((r) => r.headers.get("set-cookie"))), "MAJOR");
  }
  {
    const routeSrc = read(ROUTE_FILE);
    const src = routeSrc + storageSrc;
    const usesSecret = /SESSION_SECRET/.test(src);
    const fallback = /SESSION_SECRET\s*(\?\?|\|\|)/.test(src) || /SESSION_SECRET\s*\]\s*(\?\?|\|\|)/.test(src);
    const clientish = storageFiles.some((f) => /^\s*["']use client["']/.test(read(f)) && /privateFileUrl/.test(read(f)));
    chk("C0.4-X10.7", "[static] the HMAC is keyed with `SESSION_SECRET` and there is no `?? \"\"` / `|| \"dev\"` fallback anywhere near it — a default key means every deployment that forgot the env var signs links anybody can forge",
      usesSecret && !fallback, "SESSION_SECRET, no fallback", `uses=${usesSecret} fallback=${fallback}`, "MAJOR");
    chk("C0.4-X10.8", "[static] the minting helper is server-only — a `'use client'` module that can sign links ships the secret to the browser",
      !clientish, "server-only module", clientish ? "privateFileUrl lives in a 'use client' file" : "ok", "MINOR");
  }
  chk("C0.4-X10.9", "[positive control] the handler really ran inside a Next request scope during this file, so a builder who reads the session with `cookies()`/`headers()` was exercised for real rather than skipped",
    SCOPE_OK, "request scope active", String(SCOPE_OK), "MINOR");
  {
    const outside = FETCHES.filter((f) => !f.served && !f.url.startsWith("http://qc.local"));
    chk("C0.4-X10.10", "the route made no outbound call other than to object storage — no third party is told which file was opened",
      outside.length === 0, "none", cut(outside.map((f) => `${f.method} ${f.url}`).join(" · "), 200) || "-", "MINOR");
  }
} catch (e) {
  chk("C0.4-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 400));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — everything lives in two throwaway tenants; Users/Sessions/rate buckets have no
  // tenantId column, so they are removed by id/needle. C0.4-CLEAN proves nothing is left.
  // ═════════════════════════════════════════════════════════════════════════════
  globalThis.fetch = realFetch;
  const ids = [tidA, tidB].filter((x) => /^[a-z0-9]+$/i.test(x));
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  for (const n of RATE_KEY_NEEDLES) await del(() => P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${n}%`));
  if (USER_IDS.length > 0) {
    await del(() => P.session.deleteMany({ where: { userId: { in: USER_IDS } } }));
    await del(() => P.membership.deleteMany({ where: { userId: { in: USER_IDS } } }));
    await del(() => P.user.deleteMany({ where: { id: { in: USER_IDS } } }));
  }
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(
      `select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`,
    ).catch(() => [])) as Any[]).map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1)
      for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
    await del(() => P.user.deleteMany({ where: { id: { in: USER_IDS } } }));
    try {
      const left: string[] = [];
      for (const t of tables) {
        const rows = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[];
        const n = Number(rows?.[0]?.n ?? 0);
        if (n > 0) left.push(`${t}=${n}`);
      }
      const tenants = await P.tenant.count({ where: { id: { in: ids } } });
      const users = USER_IDS.length ? await P.user.count({ where: { id: { in: USER_IDS } } }) : 0;
      chk("C0.4-CLEAN", "the oracle gives the QC database back exactly as it found it — both throwaway tenants, their files, their users/sessions and their rate buckets are gone (the shared QC books were never touched, and Bunny was never contacted)",
        left.length === 0 && tenants === 0 && users === 0, "0 rows · 0 tenants · 0 users", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users}`, "MAJOR");
    } catch (e) {
      chk("C0.4-CLEAN", "the oracle gives the QC database back exactly as it found it", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C0.4: ${passed}/${total}${UNPROVEN.length ? ` · ${UNPROVEN.length} not proven` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings, unproven: UNPROVEN })}`);
process.exit(passed === total ? 0 : 1);
