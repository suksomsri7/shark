// scripts/crm-journeys/lib.mts — shared harness for CRM v2 user-journey oracles (WO C4.4)
//
// Owned entirely by C4.4 (oracle/runner writer). Not imported by anything the builder touches.
// Journeys are driven from `scripts/visual-crm.mts --journey USn|all [--dry] [--clean]` (see the small dispatch block
// added there). This file is deliberately self-contained and does NOT read `scripts/crm-expected.json` — that file is
// per-QC-branch and the worktree that seeded it may not be the one whose DATABASE_URL is active right now (house
// rule: `CRM_EXPECTED_PATH` exists for exactly this reason, see visual-crm.mts header). Instead every id a journey
// needs is resolved LIVE against whichever DB is active (QC2 today via `scripts/qc2.sh`, QC1 later when the
// controller runs Phase 2) — same fallback-by-email pattern `mintSession()` in visual-crm.mts already uses for users.
//
// 🔴 house rules this file must keep even though it is not itself `qc-*.mts`:
//   - QC DB only, never `.env` (loaded by the caller before this module runs).
//   - Every row a journey creates gets a `qc-jrn-<story>` marker in its name/title/note field where the model has one
//     (requirement #2 of the brief) AND its id is recorded in `ctx.own(model, id)` so `--clean` can delete precisely
//     by id (name-matching alone is not reliable across every model — e.g. PortalSession/Session have no free-text
//     field at all).
//   - Session rows minted for login are ALWAYS deleted in `finally`, even on a thrown error (same discipline as
//     visual-crm.mts `mintSession`/`restoreSeed`).
//   - Chromium profile dirs are removed after every run (snap chromium private /tmp — see memory note).

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Any = any;

export const JOURNEY_STORIES = ["US1", "US2", "US3", "US4", "US5", "US6", "US7", "US8", "US9", "US10"] as const;
export type StoryId = (typeof JOURNEY_STORIES)[number];

export const SHOTS_ROOT = ".qc-shots/crm/journeys";
/** Tag prefix stamped into every free-text field a journey writes (name/title/note/description) — requirement #2. */
export const TAG_PREFIX = "qc-jrn-";

// ───────────────────────── env resolution (live — no expected.json) ─────────────────────────

export type StageDto = { id: string; name: string; kind: "OPEN" | "WON" | "LOST"; sortOrder: number };
export type PipelineDto = { id: string; name: string; stages: StageDto[] };
export type Role = "owner" | "manager" | "thana" | "nok";

export type Env = {
  tenantId: string;
  tenantSlug: string;
  SYS: string; // CRM AppSystem id
  accountSysId: string; // ACCOUNT AppSystem id — see ensureCrmAccountLink()
  users: Record<Role, { userId: string; email: string; name: string; membershipId: string | null }>;
  teams: { phuket: string; krabi: string };
  pipelines: { b2b: PipelineDto; retail: PipelineDto };
  objects: { contract: { id: string; key: string } };
};

const FALLBACK_EMAIL: Record<Role, string> = {
  owner: "mb-owner@shark.local",
  manager: "mb-manager-patong@shark.local",
  thana: "mb-thana@shark.local",
  nok: "mb-nok@shark.local",
};

export class Fatal extends Error {}

async function resolveUser(prisma: Any, tenantId: string, role: Role): Promise<Env["users"][Role]> {
  const email = FALLBACK_EMAIL[role];
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!u) throw new Fatal(`resolveEnv: user "${role}" (${email}) not found on the active DB — run seed-member-qc + seed-crm-qc first`);
  const mem = await prisma.membership.findFirst({ where: { tenantId, userId: u.id }, select: { id: true } });
  return { userId: u.id, email, name: u.name ?? role, membershipId: mem?.id ?? null };
}

function pipelineOf(rows: Any[], name: string): PipelineDto {
  const row = rows.find((r) => r.name === name);
  if (!row) throw new Fatal(`resolveEnv: pipeline "${name}" not found — seed-crm-qc.mts should have created it`);
  return { id: row.id, name: row.name, stages: (row.stages as Any[]).map((s) => ({ id: s.id, name: s.name, kind: s.kind, sortOrder: s.sortOrder })).sort((a, b) => a.sortOrder - b.sortOrder) };
}

export async function resolveEnv(prisma: Any): Promise<Env> {
  const tenantSlug = "siam-dive-member-qc"; // CQC.tenantSlug (crm-qc-env.mts) — same shop the QC seeds use
  const tenant = await prisma.tenant.findFirst({ where: { slug: tenantSlug }, select: { id: true } });
  if (!tenant) throw new Fatal(`resolveEnv: tenant "${tenantSlug}" not found on the active DB (QC_ENV_FILE/DATABASE_URL points at the wrong branch?)`);
  const tenantId = tenant.id as string;
  const sys = await prisma.appSystem.findFirst({ where: { tenantId, type: "CRM" }, select: { id: true } });
  if (!sys) throw new Fatal(`resolveEnv: no CRM AppSystem for tenant ${tenantId} — run seed-crm-qc.mts on this DB first`);
  const SYS = sys.id as string;

  const [owner, manager, thana, nok] = await Promise.all([
    resolveUser(prisma, tenantId, "owner"),
    resolveUser(prisma, tenantId, "manager"),
    resolveUser(prisma, tenantId, "thana"),
    resolveUser(prisma, tenantId, "nok"),
  ]);

  const teamRows = await prisma.team.findMany({ where: { tenantId }, select: { id: true, name: true } });
  const phuket = teamRows.find((t: Any) => String(t.name).includes("ภูเก็ต"))?.id;
  const krabi = teamRows.find((t: Any) => String(t.name).includes("กระบี่"))?.id;
  if (!phuket || !krabi) throw new Fatal(`resolveEnv: expected teams "...ภูเก็ต" and "...กระบี่" — got ${JSON.stringify(teamRows)}`);

  const pipelineRows = await prisma.crmPipeline.findMany({
    where: { systemId: SYS },
    select: { id: true, name: true, stages: { select: { id: true, name: true, kind: true, sortOrder: true } } },
  });
  const b2b = pipelineOf(pipelineRows, "ขายองค์กร (B2B)");
  const retail = pipelineOf(pipelineRows, "ขายปลีก");

  const contractObj = await prisma.customObject.findFirst({ where: { systemId: SYS, key: "contract" }, select: { id: true, key: true } });
  if (!contractObj) throw new Fatal(`resolveEnv: custom object "contract" not found under CRM system ${SYS} — expected from seed-crm-qc.mts (C1.9)`);

  const accountSys = await prisma.appSystem.findFirst({ where: { tenantId, type: "ACCOUNT" }, select: { id: true } });
  if (!accountSys) throw new Fatal(`resolveEnv: no ACCOUNT AppSystem for tenant ${tenantId}`);

  return {
    tenantId,
    tenantSlug,
    SYS,
    accountSysId: accountSys.id as string,
    users: { owner, manager, thana, nok },
    teams: { phuket, krabi },
    pipelines: { b2b, retail },
    objects: { contract: { id: contractObj.id as string, key: "contract" } },
  };
}

/**
 * Real quotes/invoices need `AccountSystemLink{linkedKind:"CRM", linkedId:SYS}` — an opt-in link created via the
 * ACCOUNT module's own "connections" settings page (no `data-testid`s, same out-of-registry class as
 * `/app/forms/new`/`/app/settings/staff`). Calls the real facade function that page's button calls
 * (`connections.connect`), not a raw prisma write. NOT undone afterward — unlike the per-journey test fixtures,
 * "this shop's CRM books to its own Account system" is genuine, desirable, persistent shop configuration (matches
 * the blueprint's C2.7 accounting bridge design), not a temporary override — and other journeys (US7) need it too.
 * Idempotent (`connect()` re-enables an existing link rather than duplicating).
 */
export async function ensureCrmAccountLink(prisma: Any, env: Env, actorUserId: string): Promise<void> {
  const connections = await import("@/lib/modules/account/connections");
  const r = await connections.connect({ tenantId: env.tenantId, systemId: env.accountSysId }, "CRM" as Any, env.SYS, actorUserId);
  if (!(r as Any).ok) throw new Fatal(`ensureCrmAccountLink: connections.connect failed — ${(r as Any).reason}`);
}

/**
 * Facade-call actor/ctx for a given role — same shape `c37Owner()` in visual-crm.mts builds, used ONLY for the parts
 * of a journey's SETUP that have no real UI yet (e.g. no `/settings/forms` "create form" button exists — see
 * crm-brief-C4.4.md DECISIONs). The story's actual scripted action always goes through the real browser afterwards.
 */
export async function actorFor(prisma: Any, env: Env, role: Role): Promise<{ ctx: { tenantId: string; systemId: string; actorUserId: string }; actor: Any }> {
  const userId = env.users[role].userId;
  const mem = await prisma.membership.findFirst({ where: { tenantId: env.tenantId, userId }, select: { role: true, unitAccess: true, permissions: true } });
  const actor = {
    userId,
    role: (mem?.role ?? (role === "owner" ? "OWNER" : "STAFF")) as Any,
    unitAccess: (Array.isArray(mem?.unitAccess) ? mem.unitAccess : []) as string[],
    permissions: (mem?.permissions ?? {}) as Record<string, unknown>,
  };
  return { ctx: { tenantId: env.tenantId, systemId: env.SYS, actorUserId: userId }, actor };
}

/**
 * SHOULD-FIX (28 Sep, controller review): several journeys flip a SHARED, PERSISTENT shop setting via real UI
 * (US9 `settings.crm.tracking.web.*`, US3 the customer-portal-enabled flag, US7
 * `settings.crm.commission.payrollLink`) that was previously left changed on the shared QC1 tenant after the run.
 * Snapshots the whole `AppSystem.settings` JSON for one system before the mutating step; the returned function
 * writes the EXACT original value back (not a merge — whatever the shop had before, byte for byte).
 */
/**
 * ROUND 3 (controller review, reviewer round 2): the earlier whole-blob version of this helper (`data: {settings:
 * before}`) risks a lost-update against any OTHER lane concurrently writing a DIFFERENT part of the SAME
 * `AppSystem.settings` JSON on shared QC1 — exactly the anti-pattern `writeMemberSettingsKey` (member/reviews.ts)
 * exists to avoid (COMMON brief line 30). Snapshots and restores ONLY the JSON value at `path` (e.g.
 * `["crm","tracking"]`), via a single `jsonb_set`/`#-` statement — every sibling key a concurrent writer touched in
 * the meantime is left alone.
 */
export async function snapshotSettingsPath(prisma: Any, systemId: string, path: readonly string[]): Promise<() => Promise<void>> {
  const row = await prisma.appSystem.findFirst({ where: { id: systemId }, select: { settings: true } });
  let node: Any = row?.settings ?? {};
  for (const k of path) node = node && typeof node === "object" ? node[k] : undefined;
  const hadKey = node !== undefined;
  const before = hadKey ? node : null;
  return async () => {
    try {
      if (hadKey) {
        await prisma.$executeRaw`UPDATE "AppSystem" SET settings = jsonb_set(settings, ${path as Any}::text[], ${JSON.stringify(before)}::jsonb, true) WHERE id = ${systemId}`;
      } else {
        await prisma.$executeRaw`UPDATE "AppSystem" SET settings = settings #- ${path as Any}::text[] WHERE id = ${systemId}`;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`🔴🔴 snapshotSettingsPath RESTORE FAILED for system ${systemId} path ${path.join(".")} — STILL mutated on shared QC1: ${e instanceof Error ? e.message : e}. Manual fix: jsonb_set/#- path ${JSON.stringify(path)} back to ${JSON.stringify(before)}.`);
    }
  };
}

/** @deprecated ROUND 3: whole-blob restore risks clobbering a concurrent lane's unrelated settings write — use
 *  `snapshotSettingsPath` with the exact key path instead. Kept only so nothing else silently breaks; not called
 *  by any journey as of this round. */
export async function snapshotAppSystemSettings(prisma: Any, systemId: string): Promise<() => Promise<void>> {
  const row = await prisma.appSystem.findFirst({ where: { id: systemId }, select: { settings: true } });
  const before = row?.settings ?? null;
  return async () => {
    await prisma.appSystem.update({ where: { id: systemId }, data: { settings: before } }).catch((e: unknown) => {
      // eslint-disable-next-line no-console
      console.log(`   ⚠️ snapshotAppSystemSettings restore FAILED for system ${systemId} — settings left mutated: ${e instanceof Error ? e.message : e}`);
    });
  };
}

/**
 * NOT a product-gap workaround — `crmCan()` (access.ts:70-80) checks ONLY the explicit `true` keys stored on
 * `Membership.permissions`; `CRM_ROLE_DEFAULTS.STAFF`/`STAFF_DEFAULT` (access.ts:20-27) is documented as
 * "ชุดแนะนำสำหรับหน้าตั้งสิทธิ์" (a suggested default for the permissions SETTINGS page) and is never auto-applied at
 * runtime. QC1's seeded `thana` (seed-crm-qc.mts:132-137) deliberately carries a NARROW hand-picked permission set
 * for OTHER work orders' visibility/boundary tests — it lacks `crm.deal.update`/`crm.deal.quote`/`crm.contact.convert`
 * etc. that THIS story's actions need. That's a test-fixture gap, not a `crmCan()` bug or a missing UI control (there
 * IS a real settings page for this, `/app/settings/staff/[membershipId]`, just with no `data-testid`s — same class
 * of out-of-registry module as `/app/forms/new` in US1). Elevates the given keys on `userId`'s membership for the
 * duration of `fn`, then restores the exact original `permissions` value.
 */
export async function withStaffPermissions<T>(prisma: Any, opts: { tenantId: string; userId: string; keys: readonly string[] }, fn: () => Promise<T>): Promise<T> {
  const mem = await prisma.membership.findFirst({ where: { tenantId: opts.tenantId, userId: opts.userId }, select: { id: true, permissions: true } });
  if (!mem) return fn();
  const before = (mem.permissions ?? {}) as Record<string, unknown>;
  const missing = opts.keys.filter((k) => before[k] !== true);
  if (missing.length) {
    const next = { ...before };
    for (const k of missing) next[k] = true;
    await prisma.membership.update({ where: { id: mem.id }, data: { permissions: next } });
  }
  try {
    return await fn();
  } finally {
    if (missing.length) {
      // SHOULD-FIX (controller review 28 Sep): a silent restore failure here leaves a shared seed user (thana)
      // permanently over-permissioned for every OTHER lane sharing QC1 — that must never fail quietly.
      await prisma.membership.update({ where: { id: mem.id }, data: { permissions: before } }).catch((e: unknown) => {
        // eslint-disable-next-line no-console
        console.error(`🔴🔴 withStaffPermissions RESTORE FAILED for membership ${mem.id} (userId ${opts.userId}) — keys [${missing.join(",")}] are STILL elevated on shared QC1 seed data: ${e instanceof Error ? e.message : e}. Manual fix: UPDATE "Membership" SET permissions = <original value logged below> WHERE id = '${mem.id}';`);
        console.error(`🔴🔴 original permissions to restore: ${JSON.stringify(before)}`);
      });
    }
  }
}

// ───────────────────────── browser bootstrap (mirrors visual-crm.mts conventions) ─────────────────────────

const PPTR_PATH = "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

/**
 * ROUND 4 (US9): the shop's own website host. Web tracking only accepts beacons whose Origin is **https** and whose
 * host is one of the shop's tracking domains (`originAllowed`, tracking-shared.ts:161-176), and a tracking domain
 * must be a real dotted hostname — no IP, no port, no `localhost` (`normalizeDomain`, tracking-shared.ts:146-156).
 * The plain-http QC server (http://127.0.0.1:3215) can therefore never be a tracked site. US9 stands up a local TLS
 * terminator for this host (see US9.mts) and the browser resolves it to 127.0.0.1 via `--host-resolver-rules`.
 * `.test` is an IANA-reserved TLD: without the resolver rule the name cannot resolve anywhere, so nothing can leak.
 */
export const SHOP_HOST = "qc-jrn-shop.shark-qc.test";

export async function launchBrowser(pid: number): Promise<Any> {
  const pptr = (await import(PPTR_PATH as string).catch((e: unknown) => {
    throw new Fatal(`puppeteer-core unavailable (${e instanceof Error ? e.message : e}) — need /root/dive3d/node_modules/puppeteer-core`);
  })) as Any;
  return pptr.default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      `--user-data-dir=/tmp/chr-crm-jrn-${pid}`,
      // ROUND 4 (US9): see SHOP_HOST — map ONLY the reserved shop host to loopback; the self-signed cert of the local
      // TLS terminator is accepted. Every other request is still subject to the B1 origin guard below.
      `--host-resolver-rules=MAP ${SHOP_HOST} 127.0.0.1`,
      "--ignore-certificate-errors",
    ],
  });
}

export function cleanupChromiumProfile(pid: number): void {
  for (const d of [`/tmp/chr-crm-jrn-${pid}`, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-crm-jrn-${pid}`]) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* not present / no permission — fine */
    }
  }
}

// ───────────────────────── session minting (staff + portal) ─────────────────────────

export type MintedCookie = { name: string; value: string; url?: string; domain?: string; path: string; secure?: boolean };

export class SessionMinter {
  private readonly prisma: Any;
  private readonly sha256: (s: string) => string;
  private readonly BASE: string;
  private readonly UA: string;
  readonly sessionIds: string[] = [];
  readonly tokenHashes: string[] = [];

  constructor(prisma: Any, sha256: (s: string) => string, BASE: string, ua: string) {
    this.prisma = prisma;
    this.sha256 = sha256;
    this.BASE = BASE;
    this.UA = ua;
  }

  private https(): boolean {
    return this.BASE.startsWith("https:");
  }
  private host(): string {
    return new URL(this.BASE).hostname;
  }

  /** Staff login (owner/manager/thana/nok) — same `Session` row shape as visual-crm.mts `mintSession`. */
  async staff(userId: string): Promise<MintedCookie[]> {
    const token = "jrn" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const ttl = new Date(Date.now() + 60 * 60 * 1000);
    const row = await this.prisma.session.create({
      data: { userId, tokenHash: this.sha256(token), userAgent: this.UA, idleExpiresAt: ttl, expiresAt: ttl },
      select: { id: true },
    });
    this.sessionIds.push(row.id);
    return this.https()
      ? [
          { name: "__Host-shark_session", value: token, url: this.BASE, path: "/", secure: true },
          { name: "shark_tenant", value: "", url: this.BASE, path: "/", secure: true }, // filled by caller (needs tenantId)
        ]
      : [
          { name: "shark_session", value: token, domain: this.host(), path: "/" },
          { name: "shark_tenant", value: "", domain: this.host(), path: "/" },
        ];
  }

  /** Sets the actual tenant id on the cookie pair `staff()` just returned (kept separate — `staff()` doesn't take tenantId). */
  withTenant(cookies: MintedCookie[], tenantId: string): MintedCookie[] {
    return cookies.map((c) => (c.name === "shark_tenant" ? { ...c, value: tenantId } : c));
  }

  /** Records a portal/customer token minted OUTSIDE this class (e.g. by clicking through `/b/[slug]/invite/[token]`
   *  in the real browser) so `finally` cleanup still sweeps it — call after any UI flow that sets a portal cookie. */
  trackPortalToken(token: string): void {
    this.tokenHashes.push(this.sha256(token));
  }

  async cleanup(): Promise<number> {
    let count = 0;
    if (this.sessionIds.length) count += (await this.prisma.session.deleteMany({ where: { id: { in: this.sessionIds } } })).count;
    if (this.tokenHashes.length) {
      for (const mdl of ["portalSession", "customerSession"]) {
        try {
          count += ((await this.prisma[mdl]?.deleteMany?.({ where: { tokenHash: { in: this.tokenHashes } } })) as Any)?.count ?? 0;
        } catch {
          /* table not present yet */
        }
      }
    }
    return count;
  }
}

// ───────────────────────── per-story context ─────────────────────────

export type CheckRow = { id: string; story: string; step: string; ok: boolean; expected: unknown; actual: unknown; gap: boolean };

/** Structural deep equal (key-order insensitive) — used by `JourneyCtx.check`. `NaN === NaN` on purpose (never needed here). */
/** A mod-11-valid Thai tax id (13 digits) from a 12-digit prefix — same formula scripts/qc-crm-c1.10.mts and
 *  scripts/qc-crm-c3.4.mts already use. A made-up 13-digit string almost always fails companies.ts's checksum
 *  guard (`cleanPatch` → `fail("VALIDATION", "เลขประจำตัวผู้เสียภาษีนี้หลักสุดท้ายไม่ตรงกับเลขตรวจสอบ")`). */
export function validTaxId(prefix12: string): string {
  const d = prefix12.slice(0, 12).padEnd(12, "0");
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(d[i]) * (13 - i);
  return d + String((11 - (sum % 11)) % 10);
}

/** `JSON.stringify` throws on BigInt (Prisma returns BigInt for the CRM money columns the C28 decision made BigInt —
 *  `CrmDeal.paidSatang`/`wonValueSatang`, `CrmCommission.*` — docs/modules/20-crm-v2.md §15 C28). Found running
 *  US7 for real on QC1, 28 Sep: crashed BOTH the failing check's own log line AND the final summary.json write (the
 *  latter took the whole batch's results down, not just US7's). Converts BigInt → Number for logging/serializing
 *  only — safe for satang amounts (always far under Number.MAX_SAFE_INTEGER). */
function jsonSafe(v: unknown, space?: number): string {
  return JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? Number(val) : val), space);
}

/** Normalizes BigInt → Number before comparing/recursing, so `deepEqual(10000, 10000n)` is true instead of false
 *  (BigInt !== Number by `typeof`, which made every real money-field check silently wrong before this fixed it —
 *  same root cause as the JSON.stringify crash above, found on the same US7 run). */
function unwrapBigInt(v: unknown): unknown {
  return typeof v === "bigint" ? Number(v) : v;
}

export function deepEqual(aIn: unknown, bIn: unknown): boolean {
  const a = unwrapBigInt(aIn);
  const b = unwrapBigInt(bIn);
  if (a === b) return true;
  if (a instanceof Date || b instanceof Date) return new Date(a as Any).getTime() === new Date(b as Any).getTime();
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).sort();
  const bk = Object.keys(bo).sort();
  if (ak.length !== bk.length || ak.some((k, i) => k !== bk[i])) return false;
  return ak.every((k) => deepEqual(ao[k], bo[k]));
}

export class JourneyCtx {
  readonly dry: boolean;
  readonly prisma: Any;
  readonly env: Env;
  readonly BASE: string;
  readonly story: string;
  readonly tag: string; // e.g. "qc-jrn-us1" — stamped into every free-text field this story writes
  readonly outDir: string;
  readonly browser: Any | null;
  readonly minter: SessionMinter;
  stepN = 0;
  readonly checks: CheckRow[] = [];
  readonly created: Record<string, string[]> = {};
  /** ROUND 4: extra origins the B1 guard lets through — ONLY a local TLS terminator that itself forwards solely to
   *  the QC BASE (US9's shop host). Add right before use, remove in `finally`. */
  readonly extraAllowedOrigins = new Set<string>();

  constructor(opts: { dry: boolean; prisma: Any; env: Env; BASE: string; story: string; browser: Any | null; minter: SessionMinter }) {
    this.dry = opts.dry;
    this.prisma = opts.prisma;
    this.env = opts.env;
    this.BASE = opts.BASE;
    this.story = opts.story;
    this.tag = `${TAG_PREFIX}${opts.story.toLowerCase()}`;
    this.outDir = `${SHOTS_ROOT}/${opts.story}`;
    this.browser = opts.browser;
    this.minter = opts.minter;
    mkdirSync(this.outDir, { recursive: true });
  }

  log(msg: string): void {
    console.log(`   [${this.story}] ${msg}`);
  }

  /** Narrative step marker — ALWAYS printed (dry and real) so `--dry` output is a readable plan. */
  plan(msg: string): void {
    this.stepN += 1;
    this.log(`${String(this.stepN).padStart(2, "0")}) ${msg}`);
  }

  /** Records an id this story created so `--clean` can delete it precisely (requirement #2). */
  own(model: string, id: string | null | undefined): void {
    if (!id) return;
    (this.created[model] ??= []).push(id);
  }

  async shot(page: Any, label: string): Promise<void> {
    if (this.dry || !page) return;
    const file = `${this.outDir}/${String(this.stepN).padStart(2, "0")}-${label}.png`;
    try {
      await page.screenshot({ path: file, fullPage: true });
      this.log(`   screenshot -> ${file}`);
    } catch (e) {
      this.log(`   ⚠️ screenshot failed (${e instanceof Error ? e.message.slice(0, 120) : e})`);
    }
  }

  /** `expected`/`actual` are compared with a key-order-insensitive deep equal — pass the same literal on both sides for a pure informational/always-pass note (e.g. documenting a product gap). */
  /** `gap=true` — Controller ruling (crm-brief-C4.4.md, 27 Sep): a product gap must report red-for-gap, never a
   *  weakened/always-passing "documented" note. Pass the story's ACTUAL expectation as `expected` (not a
   *  description of the gap) so the check genuinely fails until the product gains the capability. */
  check(id: string, step: string, expected: unknown, actual: unknown, gap = false): void {
    const ok = deepEqual(expected, actual);
    this.checks.push({ id, story: this.story, step, ok, expected, actual, gap });
    this.log(`   ${ok ? "✅" : gap ? "🟧" : "❌"} ${id}${gap ? " [GAP]" : ""} — ${step}${ok ? "" : ` (expected ${jsonSafe(expected)}, got ${jsonSafe(actual)})`}`);
  }

  /** Opens a fresh page authenticated as the given staff role (owner/manager/thana/nok). DRY-mode callers must not call this. */
  async loginStaff(role: Role): Promise<Any> {
    if (this.dry || !this.browser) throw new Fatal("loginStaff() called in --dry mode — guard with `if (!ctx.dry)`");
    const cookies = this.minter.withTenant(await this.minter.staff(this.env.users[role].userId), this.env.tenantId);
    const page = await this.browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument("window.__name = function (f) { return f; };"); // tsx keepNames shim (see qc-crm-buttons.mts)
    await page.setCookie(...cookies);
    await installOriginGuard(page, this, new URL(this.BASE).origin);
    installConsoleCapture(page, this);
    return page;
  }

  /** Anonymous page (no login) — public form / tracking pixel / portal invite link. */
  async newAnonPage(opts: { isolated?: boolean } = {}): Promise<Any> {
    if (this.dry || !this.browser) throw new Fatal("newAnonPage() called in --dry mode — guard with `if (!ctx.dry)`");
    // ROUND 4: `isolated` = a separate browser context (own cookie jar) — a DIFFERENT person. Without it every anon
    // page shares the default context's cookies (US9's "declining visitor" silently inherited the accepting visitor's
    // sd_consent=a cookie and was tracked — it never even saw the banner).
    let page: Any;
    if (opts.isolated) {
      const bc = await this.browser.createBrowserContext();
      page = await bc.newPage();
      page.once("close", () => { bc.close().catch(() => {}); });
    } else {
      page = await this.browser.newPage();
    }
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument("window.__name = function (f) { return f; };");
    await installOriginGuard(page, this, new URL(this.BASE).origin);
    installConsoleCapture(page, this);
    return page;
  }
}

function installConsoleCapture(page: Any, ctx: JourneyCtx): void {
  page.on("pageerror", (e: Error) => ctx.log(`   ⚠️ page error: ${e.message.slice(0, 160)}`));
  page.on("console", (m: Any) => {
    if (m.type() === "error") ctx.log(`   ⚠️ console error: ${String(m.text()).slice(0, 160)}`);
  });
  page.on("response", (r: Any) => {
    try {
      if (r.status() >= 400) ctx.log(`   ⚠️ HTTP ${r.status()} ${String(r.url()).slice(0, 160)}`);
    } catch {
      /* ignore */
    }
  });
}

/**
 * B1 (controller review, 28 Sep — BLOCKER, real incident risk not theoretical): US9 makes a real browser load and
 * run the actual tracker script (`page.addScriptTag`) and click a real consent banner — nothing in Puppeteer stops
 * that script, or ANY other page this harness opens, from firing a request at a real domain (production
 * `shark.in.th`, or any third party) if a selector/URL is ever wrong. Every page this harness opens — staff-login
 * and anonymous alike — intercepts every request and ABORTS anything whose origin isn't the QC server's own origin,
 * logging each abort so a controller reviewing the log can see immediately whether anything tried to leave QC.
 * `about:blank`/`data:`/`chrome-error:` navigations are allowed through (not real network traffic).
 */
async function installOriginGuard(page: Any, ctx: JourneyCtx, baseOrigin: string): Promise<void> {
  await page.setRequestInterception(true);
  page.on("request", (req: Any) => {
    let url: URL;
    try {
      url = new URL(req.url());
    } catch {
      req.abort().catch(() => {});
      return;
    }
    if (url.protocol === "about:" || url.protocol === "data:" || url.protocol === "blob:") {
      req.continue().catch(() => {});
      return;
    }
    if (url.origin !== baseOrigin && !ctx.extraAllowedOrigins.has(url.origin)) {
      ctx.log(`   🛑 B1 origin guard ABORTED request to ${url.origin} (not QC BASE ${baseOrigin}) — ${req.method()} ${url.pathname}`);
      req.abort().catch(() => {});
      return;
    }
    req.continue().catch(() => {});
  });
}

// ───────────────────────── outbox drain-until-quiet (house pattern — see qc-all.mts) ─────────────────────────

/**
 * Drains until quiet, but tolerates the ONE real race this harness hits constantly against the live QC1 server:
 * an action just performed via the browser (form submit, staff click that calls a server action) returns its HTTP
 * response the instant the action's own DB write commits — the OutboxEvent row it emits, and the SERVER's own
 * `scheduleDrain()`/`after()` background drain of it, can both still be in flight a beat later. A single
 * `drainAll()` call right after `page.close()` can legitimately see 0 PENDING rows because the event hasn't been
 * INSERTed yet, not because there's nothing to do. Confirmed real (not theoretical) 27 Sep against QC1: US1's
 * `forms.submission.received` event was `status: DONE` and the CrmContact existed ~1s after a bare `drainQuiet()`
 * had already returned and the assertion had already read (and missed) it. Round 0 always drains immediately
 * (cheap, catches the common case); if it found nothing, wait `settleMs` once for the row to land, then keep going.
 */
export async function drainQuiet(maxRounds = 5, settleMs = 800): Promise<number> {
  const { drainAll } = (await import("@/lib/outbox-consumers")) as Any;
  let total = 0;
  let waited = false;
  for (let i = 0; i < maxRounds; i += 1) {
    const { processed } = await drainAll();
    total += processed;
    if (processed === 0) {
      if (!waited) {
        waited = true;
        await new Promise((r) => setTimeout(r, settleMs));
        continue;
      }
      break;
    }
  }
  return total;
}

/**
 * Polls `fn` (a DB read) until it returns a truthy value or `timeoutMs` elapses, calling `drainQuiet()` between
 * tries so any outbox event that lands mid-poll gets processed before the next read. Use this instead of a single
 * `await drainQuiet(); const row = await prisma.x.findFirst(...)` for any assertion that depends on an outbox
 * consumer having run — see the `drainQuiet` doc comment for why a single immediate read is not reliable here.
 */
export async function pollUntil<T>(fn: () => Promise<T>, opts: { timeoutMs?: number; intervalMs?: number } = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const intervalMs = opts.intervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;
  let last: T = (await fn()) as T;
  while (!last && Date.now() < deadline) {
    await drainQuiet(2, 0);
    await new Promise((r) => setTimeout(r, intervalMs));
    last = await fn();
  }
  return last;
}

// ───────────────────────── journey module contract ─────────────────────────

export type JourneyModule = { run(ctx: JourneyCtx): Promise<void> };

// ───────────────────────── CLI entry (called from visual-crm.mts `--journey`) ─────────────────────────

/** Delete order for `--clean` — children before parents. Ids come from each story's `created.json` manifest. */
const CLEAN_ORDER: readonly string[] = [
  "crmCommission",
  "crmCommissionRule",
  "hrPayAdjustment",
  "hrSalaryProfile",
  "crmDealPayment",
  "crmDealLine",
  "crmSequenceEnrollment",
  "crmSequence",
  "automationRun",
  "automationRule",
  "aiProposal",
  "crmAssignmentRule",
  "customRecordValue",
  "customRecord",
  "crmEmailMessage",
  "crmTrackedLink",
  "crmWebEvent",
  "crmWebSession",
  "portalSession",
  "crmPortalAccess",
  "formSubmission",
  "formDef",
  "appNotification",
  "crmActivity",
  "fileAsset", // ROUND 4 (US4): call-recording FileAsset — normally removed by the product's own removeRecording() in US4's cleanup; this is the fallback (no FK from crmActivity.recordingFileId)
  "crmCompanyContact",
  "crmDeal",
  "crmContact",
  "customer",
  "crmCompany",
  "accountDocumentPayment",
  "accountDocument",
  "accountContact",
  "webhookDelivery",
  "webhookEndpoint",
  "apiKey",
];

async function cleanAll(prisma: Any, log: (s: string) => void): Promise<void> {
  if (!existsSync(SHOTS_ROOT)) {
    log("nothing to clean — no .qc-shots/crm/journeys directory yet");
    return;
  }
  const byStory: Record<string, Record<string, string[]>> = {};
  const manifest: Record<string, Set<string>> = {};
  for (const story of readdirSync(SHOTS_ROOT)) {
    const f = `${SHOTS_ROOT}/${story}/created.json`;
    if (!existsSync(f)) continue;
    const created = JSON.parse(readFileSync(f, "utf8")) as Record<string, string[]>;
    byStory[story] = created;
    for (const [model, ids] of Object.entries(created)) {
      const set = (manifest[model] ??= new Set<string>());
      for (const id of ids) set.add(id);
    }
  }
  // ROUND 3 (controller): `clean-failures.json` was written but never READ — ids that failed once stayed
  // permanently stuck (never retried unless still also present in some story's live created.json). Read it back and
  // fold every id straight into `manifest` (flat: `model -> ids`, no `.failed.` nesting to unwrap) so this run
  // retries them too.
  const failuresFile = `${SHOTS_ROOT}/clean-failures.json`;
  let priorFailures: Record<string, string[]> = {};
  if (existsSync(failuresFile)) {
    const raw = JSON.parse(readFileSync(failuresFile, "utf8")) as Any;
    // tolerate the OLD nested shape ({at, failed:{...}}) this file may already contain on disk from before this
    // fix, as well as the new flat shape ({_at, ...modelKeys}) — either way, every model key below is a plain array.
    const flat: Record<string, Any> = raw && typeof raw === "object" && raw.failed && typeof raw.failed === "object" ? raw.failed : raw;
    for (const [model, ids] of Object.entries(flat)) {
      if (model === "_at" || model === "at" || !Array.isArray(ids)) continue;
      priorFailures[model] = ids as string[];
      const set = (manifest[model] ??= new Set<string>());
      for (const id of ids as string[]) set.add(id);
    }
    const n = Object.values(priorFailures).reduce((a, v) => a + v.length, 0);
    if (n) log(`clean: retrying ${n} id(s) carried over from a previous failed --clean (${failuresFile})`);
  }
  let totalDeleted = 0;
  // SHOULD-FIX (28 Sep, controller review): a deleteMany() that throws must NOT be treated as "handled" — the ids
  // it covered stay in `failed`, get written to a standing manifest file, and are KEPT in each story's created.json
  // (not wiped) so the next --clean retries them instead of silently losing track of still-live rows.
  const failed: Record<string, string[]> = {};
  const succeeded: Record<string, Set<string>> = {};
  for (const model of CLEAN_ORDER) {
    const ids = manifest[model];
    if (!ids || ids.size === 0) continue;
    try {
      const r = await prisma[model].deleteMany({ where: { id: { in: [...ids] } } });
      totalDeleted += r.count;
      (succeeded[model] ??= new Set()).clear();
      for (const id of ids) succeeded[model]!.add(id); // deleteMany doesn't tell us WHICH ids matched — treat the whole batch as gone (idempotent: a missing id is a no-op match, not an error)
      log(`clean: ${model} -${r.count}`);
    } catch (e) {
      failed[model] = [...ids];
      log(`clean: ${model} FAILED (${ids.size} id(s) kept in the retry manifest) — ${e instanceof Error ? e.message.slice(0, 160) : e}`);
    }
  }
  // anything in the manifest under a model name CLEAN_ORDER forgot — surface it instead of silently leaving rows behind
  for (const model of Object.keys(manifest)) {
    if (!CLEAN_ORDER.includes(model) && manifest[model]!.size > 0) {
      failed[model] = [...manifest[model]!];
      log(`⚠️ clean: model "${model}" not in CLEAN_ORDER — ${manifest[model]!.size} row(s) NOT deleted, kept in the retry manifest`);
    }
  }
  // rewrite each story's created.json keeping ONLY the ids that are still in `failed` — successfully deleted ids
  // are dropped (they're gone); ids for models we never attempted (still in manifest, not in CLEAN_ORDER, already
  // logged above) are also kept so they aren't silently forgotten either.
  for (const [story, created] of Object.entries(byStory)) {
    const remaining: Record<string, string[]> = {};
    for (const [model, ids] of Object.entries(created)) {
      const keep = ids.filter((id) => failed[model]?.includes(id));
      if (keep.length) remaining[model] = keep;
    }
    writeFileSync(`${SHOTS_ROOT}/${story}/created.json`, JSON.stringify(remaining, null, 2));
  }
  // standing record of everything --clean could NOT remove (flat: model -> ids, no nesting) — `failed` here is
  // ALREADY complete for this round: ids carried over from `clean-failures.json` were folded into `manifest` above,
  // so if they deleted successfully this time they're simply absent from `failed` below (the file shrinks); if they
  // failed again they're back in `failed` (the file keeps them). No second disk read/merge needed or wanted — that
  // was the earlier bug (re-reading + unioning on every run meant a since-fixed id could never leave the file).
  if (Object.keys(failed).length) {
    writeFileSync(failuresFile, JSON.stringify({ _at: new Date().toISOString(), ...failed }, null, 2));
  } else if (existsSync(failuresFile)) {
    writeFileSync(failuresFile, JSON.stringify({ _at: new Date().toISOString() }, null, 2));
  }
  log(`clean: total rows deleted ${totalDeleted}${Object.keys(failed).length ? ` · ${Object.values(failed).reduce((a, v) => a + v.length, 0)} row(s) still outstanding (see ${failuresFile})` : ""}`);
}

export type CliOpts = { prisma: Any; BASE: string };

/**
 * Controller rule (27 Sep 23:19, after a real incident — an unlocked `--clean` + an unlocked diag script both ran
 * while C4.2's locked chunk had a QC1 snapshot in flight; its restore silently resurrected 10 of this WO's rows as
 * orphans because they were written between the snapshot and the restore, outside any lock C4.2 could see):
 * EVERY command that touches QC1 — a journey run, `--clean`, or any throwaway diag/probe script — MUST run inside
 * `bash scripts/with-gate-lock.sh …`.
 * SHOULD-FIX (28 Sep, controller review): the original version of this check only proved "SOMEONE currently holds
 * /tmp/shark-gate.lock" — if an UNRELATED lane (e.g. C4.2's own locked run) happened to hold it at the same moment,
 * an unlocked script here would wrongly read that as "I'm inside a locked run" and proceed. Fixed:
 * `scripts/with-gate-lock.sh` now exports `SHARK_GATE_LOCK_MARKER=1` into the environment it hands off to the
 * wrapped command (via `env` before `exec flock`) — since env vars are inherited by the process flock execs into,
 * this positively proves THIS process descends from THIS worktree's with-gate-lock.sh invocation, not merely that
 * the global lock happens to be busy. The old non-blocking-flock probe is kept as a second, redundant check.
 */
async function assertGateLockHeld(): Promise<void> {
  if (process.env.SHARK_GATE_LOCK_MARKER !== "1") {
    throw new Fatal(
      `refusing to run: SHARK_GATE_LOCK_MARKER is not set — this process was not launched via ` +
        `'bash scripts/with-gate-lock.sh …' (house rule, tightened 27 Sep after a real QC1 data-loss incident, ` +
        `hardened 28 Sep so a lock merely held by an UNRELATED lane can't be mistaken for our own). Every command ` +
        `that touches QC1 — journey runs, --clean, diag scripts — needs the lock, no exceptions.`,
    );
  }
  const { execFileSync } = await import("node:child_process");
  const lockFile = process.env.GATE_LOCK_FILE || "/tmp/shark-gate.lock";
  try {
    // redundant secondary check: succeeds (we got the lock) ⇒ nobody holds it right now ⇒ contradicts the marker ⇒ refuse
    execFileSync("flock", ["-n", lockFile, "-c", "true"], { stdio: "pipe" });
  } catch {
    return; // flock failed to acquire ⇒ someone (should be our own ancestor, per the marker above) holds it ⇒ OK
  }
  throw new Fatal(`refusing to run: SHARK_GATE_LOCK_MARKER was set but ${lockFile} is NOT currently held by anyone — inconsistent state, refusing out of caution.`);
}

export async function runJourneyCli(argv: string[], opts: CliOpts): Promise<number> {
  const log = (s: string) => console.log(s);
  await assertGateLockHeld();
  if (argv.includes("--clean")) {
    await cleanAll(opts.prisma, log);
    return 0;
  }
  const dry = argv.includes("--dry");
  const jIdx = argv.indexOf("--journey");
  const which = jIdx >= 0 ? (argv[jIdx + 1] ?? "all") : "all";
  const stories: StoryId[] = which === "all" ? [...JOURNEY_STORIES] : which.split(",").map((s) => s.trim().toUpperCase()) as StoryId[];
  for (const s of stories) {
    if (!(JOURNEY_STORIES as readonly string[]).includes(s)) {
      console.error(`❌ unknown story "${s}" — use one of ${JOURNEY_STORIES.join(",")} or "all"`);
      return 2;
    }
  }

  mkdirSync(SHOTS_ROOT, { recursive: true });
  const { sha256 } = (await import("@/lib/core/hash")) as Any;
  const env = await resolveEnv(opts.prisma).catch((e: unknown) => {
    throw e instanceof Fatal ? e : new Fatal(`resolveEnv failed: ${e instanceof Error ? e.message : e}`);
  });
  log(`env resolved: tenant=${env.tenantId} sys=${env.SYS} teams=${env.teams.phuket}/${env.teams.krabi} pipelines=${env.pipelines.b2b.id}/${env.pipelines.retail.id}`);

  const minter = new SessionMinter(opts.prisma, sha256, opts.BASE, "qc-crm-journeys");
  let browser: Any = null;
  const pid = process.pid;
  let fatal: string | null = null;
  const allChecks: CheckRow[] = [];
  const storyResults: { story: string; steps: number; passed: number; failed: number }[] = [];

  try {
    if (!dry) {
      // health check the QC server before minting anything (house rule — die fast, never hang)
      const ping = await fetch(opts.BASE, { redirect: "manual" }).catch(() => null);
      if (!ping) throw new Fatal(`cannot reach QC server at ${opts.BASE} — start it first (scripts/acc-v2-serve.sh) or run with --dry`);
      browser = await launchBrowser(pid);
    }
    for (const story of stories) {
      log(`\n=== ${story} ${dry ? "(dry plan)" : ""} ===`);
      const mod = (await import(`./${story}.mts` as string)) as JourneyModule;
      const ctx = new JourneyCtx({ dry, prisma: opts.prisma, env, BASE: opts.BASE, story, browser, minter });
      try {
        await mod.run(ctx);
      } catch (e) {
        ctx.check(`${story}-FATAL`, "journey threw", "no exception", e instanceof Error ? e.message.slice(0, 300) : String(e));
        log(`❌ ${story} threw: ${e instanceof Error ? (e.stack ?? e.message).slice(0, 500) : e}`);
      }
      if (!dry) {
        // append-only (house rule, 27 Sep): never overwrite created.json — a prior run's ids that hadn't been
        // --clean'd yet must not be dropped from the manifest just because this run wrote fewer/different ones.
        const manifestPath = `${ctx.outDir}/created.json`;
        const prior: Record<string, string[]> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
        const merged: Record<string, string[]> = { ...prior };
        for (const [model, ids] of Object.entries(ctx.created)) {
          const set = new Set([...(merged[model] ?? []), ...ids]);
          merged[model] = [...set];
        }
        writeFileSync(manifestPath, JSON.stringify(merged, null, 2));
      }
      allChecks.push(...ctx.checks);
      storyResults.push({ story, steps: ctx.stepN, passed: ctx.checks.filter((c) => c.ok).length, failed: ctx.checks.filter((c) => !c.ok).length });
    }
  } catch (e) {
    fatal = e instanceof Fatal ? e.message : `unexpected — ${e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)}`;
    console.error(`❌ ${fatal}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    cleanupChromiumProfile(pid);
    const swept = await minter.cleanup().catch(() => 0);
    log(`session cleanup: ${swept} row(s)`);
  }

  const summary = {
    at: new Date().toISOString(),
    dry,
    stories: storyResults,
    total: allChecks.length,
    passed: allChecks.filter((c) => c.ok).length,
    failures: allChecks.filter((c) => !c.ok).map((c) => ({ story: c.story, step: c.step, expected: c.expected, actual: c.actual, gap: c.gap })),
    fatal,
  };
  writeFileSync(`${SHOTS_ROOT}/summary.json`, jsonSafe(summary, 2));
  log(`\nJSON_SUMMARY ${jsonSafe({ total: summary.total, passed: summary.passed, failures: summary.failures.length, gaps: summary.failures.filter((f) => f.gap).length, fatal })}`);
  return fatal ? 2 : summary.failures.length > 0 ? 1 : 0;
}
