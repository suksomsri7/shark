// QC env loader + seed contract of the RUN "AI TEAM" (SHARK HUB v2) — every AI-team oracle / seed / probe loads env through here.
//
// 🔴 Why this file exists: the AI-team seed tenants live on the QC4 database only (Neon branch host `ep-frosty-lab…`), shared with the
//    POS and HR lanes. A script that reaches production, QC1 or a CI shard must stop BEFORE it opens a connection.
//    ⇒ `loadAiTeamQcEnv()` checks the HOSTNAME of DATABASE_URL and DIRECT_URL (exported values first, then the values of the QC env
//      file) before it calls the house loader `scripts/acc-v2-env.mts#loadQcEnv()`, and exits 4 on anything that is not QC4.
// 🔴 Importing this module has NO side effect (no env load, no DB connection, no output). Nothing here ever prints a URL, a user,
//    a password or a database name.
//
// Contract (scripts/qc-ai-t0.2.mts header [1]):
//   loadAiTeamQcEnv()  → { databaseUrl, host, source }      (async)
//   atIds()            → the 7 ids of the seed, resolved from the database by STABLE keys (tenant slug · user e-mail)
//   withInjectedNow()  → fixed clock for date-independent oracles (never patches the global Date)
// Extra (same stable keys): AT (slugs · e-mails · names) · atSystemIds() · bkkTime()
//
// Seed: scripts/seed-ai-team-qc.mts (find-or-create · writes only under slug prefix `qc-ai-team-` and e-mail domain `@qc.shark`).

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

/** hostname prefix of the QC4 Neon branch — a host label, not a URL (no credential in the repo) */
export const QC4_HOST_MARK = "ep-frosty-lab";

/** every tenant of this seed carries this slug prefix; every user of this seed this e-mail domain */
export const AT_SLUG_PREFIX = "qc-ai-team-";
export const AT_EMAIL_DOMAIN = "@qc.shark";

/** the seed contract — stable keys only (ids are resolved at run time by `atIds()`) */
export const AT = {
  tenants: {
    at1: { slug: `${AT_SLUG_PREFIX}at1`, name: "AT-1 The Bean Café (QC ทีม AI)" },
    at2: { slug: `${AT_SLUG_PREFIX}at2`, name: "AT-2 Sweet Studio (QC ทีม AI)" },
    atx: { slug: `${AT_SLUG_PREFIX}atx`, name: "AT-X ร้านเจ้าของอื่น (QC ทีม AI)" },
  },
  users: {
    owner: { email: `at-owner${AT_EMAIL_DOMAIN}`, name: "คุณสุข (เจ้าของ · QC ทีม AI)" },
    approver: { email: `at-nid${AT_EMAIL_DOMAIN}`, name: "คุณนิด (ผู้อนุมัติ · QC ทีม AI)" },
    staff: { email: `at-staff${AT_EMAIL_DOMAIN}`, name: "คุณบอม (พนักงาน · QC ทีม AI)" },
    otherOwner: { email: `ax-owner${AT_EMAIL_DOMAIN}`, name: "คุณเอ็กซ์ (เจ้าของร้านอื่น · QC ทีม AI)" },
  },
  /** one active AppSystem of each type per tenant */
  systemTypes: ["ACCOUNT", "CRM", "CHAT", "MEMBER", "KANBAN"],
  /** ApprovalPolicy of AT-1: entityType AccountDocument · 2,000,000 satang = 20,000 baht */
  approvalThresholdSatang: 2_000_000,
} as const;

export type AtSystemType = (typeof AT.systemTypes)[number];
export type AtTenantKey = keyof typeof AT.tenants;

export type AtIds = {
  /** Tenant.id */
  at1: string;
  at2: string;
  atx: string;
  /** User.id */
  ownerUserId: string;
  approverUserId: string;
  staffUserId: string;
  otherOwnerUserId: string;
};

export type AiTeamQcEnv = { databaseUrl: string; host: string; source: string };

// the whole hostname must be a QC4 Neon endpoint: <mark>[-<id>…][-pooler].<region…>.neon.tech — case-insensitive, no trailing dot
const QC4_HOSTNAME_RE = new RegExp(`^${QC4_HOST_MARK}(-[a-z0-9]+)*(-pooler)?\\.[a-z0-9.-]*neon\\.tech$`, "i");
/**
 * true only when the URL can reach nothing but QC4:
 *  • hostname — not a substring of the whole URL (the mark as user / database / option is refused) — matches QC4_HOSTNAME_RE;
 *  • no comma in the authority (libpq multi-host lists: `good-host,other-host`);
 *  • no `host` / `hostaddr` query parameter (libpq lets them override the host of the authority).
 */
const isQc4 = (url: string | undefined): boolean => {
  if (!url) return false;
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(url)?.[1] ?? "";
  if (!authority || authority.includes(",")) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  for (const key of parsed.searchParams.keys()) {
    const k = key.toLowerCase();
    if (k === "host" || k === "hostaddr") return false;
  }
  return QC4_HOSTNAME_RE.test(parsed.hostname);
};

/** exit 4 · names the variable only — never the value, the user, the password, the database or the host */
function refuse(variable: string, where: string): never {
  console.error(
    `🔴 ai-team-qc-env: ${variable} (${where}) does not point at the QC4 database (the host must be a ${QC4_HOST_MARK}… Neon endpoint, with no host/hostaddr override and no host list) — refusing to continue.\n` +
      `   Run through the wrapper: bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/<file>.mts`,
  );
  process.exit(4);
}

type HouseLoader = { ENV_FILE: string; loadQcEnv: () => { databaseUrl: string; host: string; source: string } };

let loaded: AiTeamQcEnv | null = null;

/**
 * The only way an AI-team script gets its database env.
 * Order: (1) host check of the EXPORTED DATABASE_URL / DIRECT_URL — exported values win over the env file, as in the house loader —
 * and, for a variable that is not exported, of the value the QC env file would supply; (2) the house loader; (3) host check again on
 * what the process ended up with. Any non-QC4 or unreadable host ⇒ `process.exit(4)`.
 */
export async function loadAiTeamQcEnv(): Promise<AiTeamQcEnv> {
  if (loaded && isQc4(process.env.DATABASE_URL) && isQc4(process.env.DIRECT_URL)) return loaded;

  const house = (await import("./acc-v2-env.mts" as string)) as HouseLoader;

  // (1) BEFORE the house loader runs (it would exit 1 on a production host and load the file otherwise)
  let fileValues: NodeJS.Dict<string> = {};
  const filePath = resolve(process.cwd(), house.ENV_FILE);
  if (existsSync(filePath)) {
    try {
      fileValues = parseEnv(readFileSync(filePath, "utf8"));
    } catch {
      fileValues = {};
    }
  }
  for (const variable of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const exported = process.env[variable];
    if (exported) {
      if (!isQc4(exported)) refuse(variable, "exported");
    } else if (!isQc4(fileValues[variable])) {
      refuse(variable, "QC env file");
    }
  }

  // (2) the house loader (production guard · APP_ENV guard · loads the QC env file without overriding exported values)
  const env = house.loadQcEnv();

  // (3) what the process really uses now
  for (const variable of ["DATABASE_URL", "DIRECT_URL"] as const) {
    if (!isQc4(process.env[variable])) refuse(variable, "after load");
  }
  if (!isQc4(env.databaseUrl)) refuse("DATABASE_URL", "after load");

  loaded = { databaseUrl: env.databaseUrl, host: env.host, source: env.source };
  return loaded;
}

type Db = {
  tenant: { findUnique: (a: { where: { slug: string }; select: { id: true } }) => Promise<{ id: string } | null> };
  user: { findUnique: (a: { where: { email: string }; select: { id: true } }) => Promise<{ id: string } | null> };
  appSystem: {
    findMany: (a: {
      where: { tenantId: string; active: true };
      select: { id: true; type: true };
      orderBy: { createdAt: "asc" };
    }) => Promise<{ id: string; type: string }[]>;
  };
};

async function db(): Promise<Db> {
  await loadAiTeamQcEnv(); // the gate always runs before a connection is opened
  const mod = (await import("@/lib/core/db")) as { prisma: unknown };
  return mod.prisma as Db;
}

const SEED_HINT = "run the seed first: bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-ai-team-qc.mts";

/**
 * Ids of the seed, resolved from the QC4 database by stable keys (tenant slug · user e-mail) on every call — never cached,
 * never read from a file. Throws (with the seed command) when a row is missing.
 */
export async function atIds(): Promise<AtIds> {
  const p = await db();
  const tenantId = async (key: AtTenantKey): Promise<string> => {
    const row = await p.tenant.findUnique({ where: { slug: AT.tenants[key].slug }, select: { id: true } });
    if (!row) throw new Error(`AI-team QC seed: tenant ${AT.tenants[key].slug} not found — ${SEED_HINT}`);
    return row.id;
  };
  const userId = async (key: keyof typeof AT.users): Promise<string> => {
    const row = await p.user.findUnique({ where: { email: AT.users[key].email }, select: { id: true } });
    if (!row) throw new Error(`AI-team QC seed: user ${AT.users[key].email} not found — ${SEED_HINT}`);
    return row.id;
  };
  return {
    at1: await tenantId("at1"),
    at2: await tenantId("at2"),
    atx: await tenantId("atx"),
    ownerUserId: await userId("owner"),
    approverUserId: await userId("approver"),
    staffUserId: await userId("staff"),
    otherOwnerUserId: await userId("otherOwner"),
  };
}

/** AppSystem.id per seed tenant and type (the oldest active system of each type) — same stable-key lookup as `atIds()` */
export async function atSystemIds(): Promise<Record<AtTenantKey, Record<AtSystemType, string>>> {
  const p = await db();
  const ids = await atIds();
  const out = {} as Record<AtTenantKey, Record<AtSystemType, string>>;
  for (const key of ["at1", "at2", "atx"] as const) {
    const rows = await p.appSystem.findMany({ where: { tenantId: ids[key], active: true }, select: { id: true, type: true }, orderBy: { createdAt: "asc" } });
    const map = {} as Record<AtSystemType, string>;
    for (const type of AT.systemTypes) {
      const hit = rows.find((r) => r.type === type);
      if (!hit) throw new Error(`AI-team QC seed: ${AT.tenants[key].slug} has no active ${type} system — ${SEED_HINT}`);
      map[type] = hit.id;
    }
    out[key] = map;
  }
  return out;
}

// ─────────────────────────── injected clock (COMMON §C11: scheduled / monthly logic takes an injectable `now`) ───────────────────────────

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Asia/Bangkok wall time → Date (fixed +07:00, no DST) · month is 1–12 */
export function bkkTime(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - BKK_OFFSET_MS);
}

export type InjectedClock = {
  /** the injected instant (a fresh Date object on every read, so a callee cannot mutate it) */
  readonly now: Date;
  /** the instant shifted by n milliseconds / minutes / hours / days (negative = earlier) */
  plusMs: (n: number) => Date;
  plusMinutes: (n: number) => Date;
  plusHours: (n: number) => Date;
  plusDays: (n: number) => Date;
  /** "YYYY-MM-DD" of the injected instant in Asia/Bangkok */
  dayKeyBkk: () => string;
  /** minute of the day (0–1439) of the injected instant in Asia/Bangkok */
  minuteOfDayBkk: () => number;
};

/**
 * Runs `fn` with a fixed clock. The oracle passes `clock.now` (or a shifted instant) to the function under test
 * (`runScheduledTasks(now)`, `ensureCycle(id, now)`, `remindStaleApprovals(now)` …) so no check depends on the calendar.
 * It does NOT patch `Date` — code that reads the wall clock instead of its `now` parameter is exactly what such an oracle must catch.
 */
export async function withInjectedNow<T>(at: Date | string | number, fn: (clock: InjectedClock) => Promise<T> | T): Promise<T> {
  const base = new Date(at).getTime();
  if (!Number.isFinite(base)) throw new Error("withInjectedNow: `at` is not a valid date");
  const shifted = (ms: number) => new Date(base + ms);
  const clock: InjectedClock = {
    get now() {
      return new Date(base);
    },
    plusMs: (n) => shifted(n),
    plusMinutes: (n) => shifted(n * 60_000),
    plusHours: (n) => shifted(n * 3_600_000),
    plusDays: (n) => shifted(n * 86_400_000),
    dayKeyBkk: () => new Date(base + BKK_OFFSET_MS).toISOString().slice(0, 10),
    minuteOfDayBkk: () => {
      const d = new Date(base + BKK_OFFSET_MS);
      return d.getUTCHours() * 60 + d.getUTCMinutes();
    },
  };
  return await fn(clock);
}
