// probe lib — A1.3a bug hunt (adversarial probes · QC DB only · NOT an oracle)
// Setup patterns copied from scripts/qc-trips-a1.3.mts (temporary tenants / units / products / departures / agent accounts via createAgentIdentity).
// Own marks (never collide with the oracle's sweep): slug / e-mail / displayName prefix `trips-a13h-` · ids `a13h_*`.
import { randomBytes } from "node:crypto";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";

export type Rec = Record<string, unknown>;
type F = (...a: unknown[]) => Promise<unknown>;
export const PFX = "trips-a13h-";
export const ADULT = 350_000, CHILD = 245_000, PARK_ADULT = 60_000, PARK_CHILD = 30_000;
export const NOW = new Date("2026-11-12T18:00:00+07:00");
export const TODAY = "2026-11-12";

export async function huntSetup(label: string) {
  loadTripsQcEnv(label);
  if (process.env.CI) { console.error("no CI"); process.exit(4); }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) process.env.SESSION_SECRET = `qc-a13h-session-${"s".repeat(40)}`;
  if (!process.env.INTEGRATIONS_CREDENTIALS_KEY || process.env.INTEGRATIONS_CREDENTIALS_KEY.trim().length < 32) process.env.INTEGRATIONS_CREDENTIALS_KEY = `qc-a13h-${"k".repeat(40)}`;
  process.env.RESEND_API_KEY = "";
  pg.defaults.parseInputDatesAsUTC = true;
  const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
  const hex = (n: number) => randomBytes(n).toString("hex");
  const rid = (p: string) => `a13h_${p}_${Date.now().toString(36)}${hex(3)}`;
  const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
  const R = (v: unknown): Rec => asRec(v) ?? {};
  const A = (v: unknown): Rec[] => (Array.isArray(v) ? v.map((x) => R(x)) : []);
  const fmt = (v: unknown): string => { try { return (JSON.stringify(v) ?? String(v)).slice(0, 500); } catch { return String(v); } };

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
  type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
  const colCache = new Map<string, ColRow[]>();
  const cols = async (table: string): Promise<ColRow[]> => {
    const c = colCache.get(table);
    if (c) return c;
    const r = await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]);
    if (r.length) colCache.set(table, r);
    return r;
  };
  const ins = async (table: string, vals: Rec): Promise<string> => {
    const cs = await cols(table);
    if (!cs.length) throw new Error(`no table ${table}`);
    const names = new Set(cs.map((c) => c.column_name));
    const v: Rec = {};
    for (const [k, x] of Object.entries(vals)) if (names.has(k)) v[k] = x;
    for (const c of cs) {
      if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
      const t = c.data_type;
      if (c.column_name === "id") { v.id = rid("id"); continue; }
      v[c.column_name] = t === "text" || t.startsWith("character") ? `qc${hex(3)}` : ["integer", "bigint"].includes(t) ? 0 : t === "boolean" ? false : t === "jsonb" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "ARRAY" ? [] : null;
    }
    const keys = Object.keys(v);
    await pool.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => { const x = v[k]; return x !== null && typeof x === "object" && !(x instanceof Date) && !Array.isArray(x) ? JSON.stringify(x) : x; }));
    return String(v.id ?? "");
  };

  const AGM = (await import("@/lib/modules/agency")) as unknown as Rec;
  const TRM = (await import("@/lib/modules/trips")) as unknown as Rec;
  const SETM = (await import("@/lib/core/settings")) as unknown as Rec;
  const AG = (n: string): F => { const f = AGM[n]; if (typeof f !== "function") throw new Error(`agency facade has no ${n}`); return f as F; };
  const TR = (n: string): F => { const f = TRM[n]; if (typeof f !== "function") throw new Error(`trips facade has no ${n}`); return f as F; };
  const S = (n: string): F => { const f = SETM[n]; if (typeof f !== "function") throw new Error(`settings has no ${n}`); return f as F; };

  const tenantIds: string[] = [];
  const userIds: string[] = [];
  const identityIds: string[] = [];
  const agentUserIds: string[] = [];

  type Staff = { userId: string; role: string; unitAccess: string[]; permissions: Rec };
  type Prod = { id: string; opt: string; opt2: string; unit: string; tenant: string; pt: Record<string, string> };
  type Shop = { id: string; units: Record<string, string>; staff: Record<string, Staff>; prod: Record<string, Prod>; ctx: (who?: string) => { tenantId: string; actorUserId: string } };

  const mkStaff = async (tenantId: string, tag: string, role: string, unitAccess: string[], permissions: Rec): Promise<Staff> => {
    const id = rid(`u${tag}`);
    await ins("User", { id, email: `${PFX}${tag}-${STAMP}@shark.local`, name: `hunt ${tag}`, updatedAt: new Date() });
    userIds.push(id);
    await ins("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(permissions), acceptedAt: new Date(), updatedAt: new Date() });
    return { userId: id, role, unitAccess, permissions };
  };
  const setV = async (shop: Shop, changes: Rec[]) => {
    const r = R(await S("setSettings")({ ...shop.staff.OWNER }, { tenantId: shop.id }, changes, { ackLegalWarn: true }));
    if (r.ok !== true) throw new Error(`setSettings: ${fmt(r)}`);
  };
  /** shop with units: key → tz (null = default Bangkok) */
  const mkShop = async (tag: string, units: Record<string, string | null>): Promise<Shop> => {
    const id = rid(`t${tag}`);
    await ins("Tenant", { id, name: `${PFX}shop ${tag}`, slug: `${PFX}${STAMP}-${tag}`, updatedAt: new Date() });
    tenantIds.push(id);
    const u: Record<string, string> = {};
    for (const [k, tz] of Object.entries(units)) {
      u[k] = rid(`un${k}`);
      await ins("BusinessUnit", { id: u[k], tenantId: id, type: "TRIPS", name: `unit ${k}`, slug: `${PFX}${tag}${k}-${STAMP}`.toLowerCase(), settings: tz ? { timezone: tz } : {}, updatedAt: new Date() });
    }
    const staff: Record<string, Staff> = {};
    staff.OWNER = await mkStaff(id, `${tag}own`, "OWNER", ["*"], {});
    const shop: Shop = { id, units: u, staff, prod: {}, ctx: (who = "OWNER") => ({ tenantId: id, actorUserId: staff[who].userId }) };
    for (const unitId of Object.values(u)) {
      const park = R(R(await S("resolveSetting")({ tenantId: id }, "trips.parkFee.table", { unitId })).value);
      await setV(shop, [
        { key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: unitId, value: { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 } },
        { key: "trips.parkFee.table", scope: "UNIT", scopeId: unitId, value: { ...park, shopRates: [{ label: "เกาะราชา", adultSatang: PARK_ADULT, childSatang: PARK_CHILD, diverSatang: null, effectiveFrom: "2026-11-01" }] } },
      ]);
    }
    return shop;
  };
  const mkProd = async (shop: Shop, key: string, unitKey: string, o: { currency?: string; productType?: string } = {}): Promise<Prod> => {
    const unitId = shop.units[unitKey];
    const id = rid(`p${key}`), op = rid(`o${key}`), op2 = rid(`o2${key}`);
    const cur = o.currency ?? "THB";
    await ins("TripProduct", { id, tenantId: shop.id, unitId, slug: `a13h-${key}-${STAMP}`.toLowerCase().replace(/[^a-z0-9-]/g, ""), productType: o.productType ?? "TOUR", sourceKind: "OWN", status: "ACTIVE", title: { th: `hunt ${key}` }, body: {}, currency: cur, deepDive: false, crossBorder: false, updatedAt: new Date() });
    await ins("TripOption", { id: op, tenantId: shop.id, unitId, productId: id, name: { th: "ร่วม" }, durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
    await ins("TripOption", { id: op2, tenantId: shop.id, unitId, productId: id, name: { th: "ส่วนตัว" }, durationMin: 480, sortOrder: 2, active: true, updatedAt: new Date() });
    const pt: Record<string, string> = {};
    for (const [i, code] of ["ADULT", "CHILD", "INFANT"].entries()) pt[code] = await ins("TripPaxType", { id: rid(`pt${code}`), tenantId: shop.id, unitId, productId: id, code, label: { th: code }, countsCapacity: code !== "INFANT", active: true, sortOrder: i, updatedAt: new Date() });
    if (cur === "THB") await ins("TripExtra", { id: rid("xpark"), tenantId: shop.id, unitId, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: PARK_ADULT, currency: "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE", name: { th: "ค่าอุทยาน" }, paxPrices: { ADULT: PARK_ADULT, CHILD: PARK_CHILD }, active: true, updatedAt: new Date() });
    for (const [code, amt] of [["ADULT", ADULT], ["CHILD", CHILD]] as const) await ins("TripPrice", { id: rid("pr"), tenantId: shop.id, unitId, productId: id, optionId: null, paxTypeId: pt[code], cabinTypeId: null, seasonId: null, departureId: null, currency: cur, amountMinor: amt, weekdayMask: null, priority: 0, updatedAt: new Date() });
    const p = { id, opt: op, opt2: op2, unit: unitId, tenant: shop.id, pt };
    shop.prod[key] = p;
    return p;
  };
  let seq = 0;
  /** departure on a local date; startsAt 08:00 Bangkok by default (hm/offset overridable) */
  const mkDep = async (p: Prod, date: string, o: { opt?: "opt" | "opt2"; startsAt?: Date } = {}): Promise<string> => {
    const startsAt = o.startsAt ?? new Date(new Date(`${date}T08:00:00+07:00`).getTime() + (seq++ % 500) * 60_000);
    const id = rid("d");
    await ins("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p[o.opt ?? "opt"], scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8 * 3_600_000),
      status: "OPEN", capacity: 500, sold: 0, held: 0, reserved: 0, minPax: 1, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
    return id;
  };
  const mkIdentity = async (tag: string): Promise<string> => {
    const r = R(await AG("createAgentIdentity")({ displayName: `${PFX}${tag} ${STAMP}`, owner: { displayName: `${PFX}owner ${tag}`, login: { kind: "EMAIL", providerId: "email", subject: `${PFX}${tag}-${STAMP}@example.test` } } }));
    if (r.ok !== true) throw new Error(`createAgentIdentity: ${fmt(r)}`);
    const id = String(R(r.identity).id); identityIds.push(id); agentUserIds.push(String(r.agentUserId));
    return id;
  };
  const mkAccount = async (shop: Shop, key: string, o: { status?: string; vatRegistered?: boolean; payeeType?: string; unitIds?: string[]; tierId?: string | null } = {}): Promise<string> => {
    const status = o.status ?? "ACTIVE";
    const identityId = status === "CLOSED" || status === "INVITED" ? null : await mkIdentity(`${key.toLowerCase()}${hex(2)}`);
    const id = rid(`acc${key}`);
    await ins("AgentAccount", { id, tenantId: shop.id, identityId, kind: "AGENT", code: `H${key}${hex(2)}`.toUpperCase().slice(0, 12), status, tierId: o.tierId ?? null, partyId: rid("party"), unitIds: o.unitIds ?? [], legalName: `${PFX}legal ${key}`,
      payeeType: o.payeeType ?? "TH_JURISTIC", country: "TH", vatRegistered: o.vatRegistered ?? false, ...(status === "ACTIVE" ? { approvedAt: new Date() } : {}), ...(status === "CLOSED" ? { statusReason: "CLOSED_BY_SHOP" } : {}), updatedAt: new Date() });
    return id;
  };
  const call = async (fn: string, ...a: unknown[]): Promise<Rec> => { try { return R(await AG(fn)(...a)); } catch (e) { return { ok: "THROW", e: String(e).slice(0, 300) }; } };
  const callTr = async (fn: string, ...a: unknown[]): Promise<Rec> => { try { return R(await TR(fn)(...a)); } catch (e) { return { ok: "THROW", e: String(e).slice(0, 300) }; } };
  const tiersOf = async (shop: Shop): Promise<Record<string, string>> => {
    const r = await call("ensureAgentTiers", shop.ctx(), {}, { now: NOW });
    if (r.ok !== true) throw new Error(`ensureAgentTiers: ${fmt(r)}`);
    const m: Record<string, string> = {};
    for (const t of A(r.tiers)) m[String(t.code)] = String(t.id);
    return m;
  };
  const agentCtx = (shop: Shop, accountId: string, unitId: string, now: Date = NOW): Rec => ({ tenantId: shop.id, unitId, channel: "AGENT_PORTAL", actor: { kind: "AGENT", agentAccountId: accountId, agentUserId: "agu_hunt" }, now, locale: "th" });
  const line = (p: Prod, depId: string, adults = 2, children = 0): Rec => ({ productKind: "TRIP", unitId: p.unit, productId: p.id, slotId: depId, pax: [{ paxTypeId: p.pt.ADULT, qty: adults }, ...(children > 0 ? [{ paxTypeId: p.pt.CHILD, qty: children }] : [])], extras: [] });
  const quote = async (shop: Shop, accountId: string, p: Prod, depId: string, o: { now?: Date; adults?: number; children?: number; unitId?: string } = {}) => {
    await AG("installAgencyPricingPort")();
    return callTr("quoteTripLine", agentCtx(shop, accountId, o.unitId ?? p.unit, o.now), line(p, depId, o.adults, o.children));
  };
  /** create card + rates (+activate) — returns id, version, rateIds */
  const mkCard = async (shop: Shop, owner: Rec, rates: Rec[], o: { activate?: boolean; validFrom?: string; validTo?: string; priority?: number; who?: string } = {}) => {
    const ctx = shop.ctx(o.who);
    const c = await call("createAgentRateCard", ctx, { owner, name: `card ${hex(3)}`, ...(o.validFrom ? { validFrom: o.validFrom } : {}), ...(o.validTo ? { validTo: o.validTo } : {}), ...(o.priority !== undefined ? { priority: o.priority } : {}) }, { now: NOW });
    if (c.ok !== true) throw new Error(`createAgentRateCard: ${fmt(c)}`);
    const id = String(R(c.card).id); let version = Number(R(c.card).version); const rateIds: string[] = [];
    for (const rate of rates) {
      const u = await call("upsertAgentRate", ctx, { cardId: id, expectedVersion: version, rate }, { now: NOW });
      if (u.ok !== true) throw new Error(`upsertAgentRate: ${fmt(u)} rate=${fmt(rate)}`);
      version = Number(R(u.card).version); rateIds.push(String(R(u.rate).id));
    }
    if (o.activate !== false) {
      const s = await call("setAgentRateCardStatus", ctx, { cardId: id, expectedVersion: version, action: "ACTIVATE" }, { now: NOW });
      if (s.ok !== true) throw new Error(`ACTIVATE: ${fmt(s)}`);
      version = Number(R(s.card).version);
    }
    return { id, version, rateIds };
  };
  const auditCount = async (tenantId: string, like = "agency.%") => Number((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = $1 AND action LIKE $2`, [tenantId, like]))[0]?.n ?? 0);
  const dbFingerprint = async (tids: string[]) => {
    const r = await q<{ k: string; v: string }>(`
      SELECT 'audit' k, count(*)::text v FROM "AuditLog" WHERE "tenantId" = ANY($1::text[])
      UNION ALL SELECT 'outbox', count(*)::text FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[])
      UNION ALL SELECT 'cards', COALESCE(md5(string_agg(id || ':' || version || ':' || status || ':' || "updatedAt"::text, ',' ORDER BY id)), '') FROM "AgentRateCard" WHERE "tenantId" = ANY($1::text[])
      UNION ALL SELECT 'rates', COALESCE(md5(string_agg(id || ':' || "updatedAt"::text || ':' || active::text, ',' ORDER BY id)), '') FROM "AgentRate" WHERE "tenantId" = ANY($1::text[])
      UNION ALL SELECT 'acc', COALESCE(md5(string_agg(id || ':' || "updatedAt"::text, ',' ORDER BY id)), '') FROM "AgentAccount" WHERE "tenantId" = ANY($1::text[])
      UNION ALL SELECT 'settings', count(*)::text FROM "Setting" WHERE "tenantId" = ANY($1::text[])
      UNION ALL SELECT 'deps', COALESCE(md5(string_agg(id || ':' || held || ':' || sold || ':' || version, ',' ORDER BY id)), '') FROM "TripDeparture" WHERE "tenantId" = ANY($1::text[])`, [tids]).catch(async () =>
      q<{ k: string; v: string }>(`
      SELECT 'audit' k, count(*)::text v FROM "AuditLog" WHERE "tenantId" = ANY($1::text[])
      UNION ALL SELECT 'cards', COALESCE(md5(string_agg(id || ':' || version || ':' || status || ':' || "updatedAt"::text, ',' ORDER BY id)), '') FROM "AgentRateCard" WHERE "tenantId" = ANY($1::text[])
      UNION ALL SELECT 'rates', COALESCE(md5(string_agg(id || ':' || "updatedAt"::text || ':' || active::text, ',' ORDER BY id)), '') FROM "AgentRate" WHERE "tenantId" = ANY($1::text[])
      UNION ALL SELECT 'acc', COALESCE(md5(string_agg(id || ':' || "updatedAt"::text, ',' ORDER BY id)), '') FROM "AgentAccount" WHERE "tenantId" = ANY($1::text[])
      UNION ALL SELECT 'deps', COALESCE(md5(string_agg(id || ':' || held || ':' || sold || ':' || version, ',' ORDER BY id)), '') FROM "TripDeparture" WHERE "tenantId" = ANY($1::text[])`, [tids]));
    return Object.fromEntries(r.map((x) => [x.k, x.v]));
  };

  // ── result lines ──
  let held = 0, found = 0;
  const findings: string[] = [];
  const check = (name: string, pass: boolean, expected: string, got: string) => {
    if (pass) { held++; console.log(`HELD [${name}] expected ${expected} | got ${got.slice(0, 300)}`); }
    else { found++; findings.push(name); console.log(`FOUND [${name}] expected ${expected} | got ${got.slice(0, 900)}`); }
  };
  const summary = (lbl: string) => console.log(`\n== SUMMARY ${lbl}: HELD ${held} · FOUND ${found}${findings.length ? ` → ${findings.join(" ; ")}` : ""}`);

  const cleanup = async (): Promise<void> => {
    const left: string[] = [];
    try {
      if (tenantIds.length) {
        const rows = await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
        let pending = rows.map((r) => r.t).filter((t) => t !== "Tenant");
        for (let pass = 0; pass < 14 && pending.length; pass++) {
          const next: string[] = [];
          for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tenantIds]); } catch { next.push(t); } }
          pending = next;
        }
        if (pending.length) left.push(`tenant tables: ${pending.join(",")}`);
        try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tenantIds]); } catch (e) { left.push(`Tenant: ${String(e).slice(0, 80)}`); }
      }
      const us = (await q<{ id: string }>(`SELECT id FROM "User" WHERE email LIKE $1 OR id = ANY($2::text[])`, [`${PFX}%`, userIds])).map((r) => r.id);
      if (us.length) {
        for (const t of ["Membership", "Session"]) { try { await pool.query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [us]); } catch { /* ignore */ } }
        try { await pool.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [us]); } catch (e) { left.push(`User: ${String(e).slice(0, 80)}`); }
      }
      const au = (await q<{ id: string }>(`SELECT u.id FROM "AgentUser" u LEFT JOIN "AgentIdentity" i ON i.id = u."identityId" WHERE u."displayName" LIKE $1 OR i."displayName" LIKE $1 OR u.id = ANY($2::text[]) OR u."identityId" = ANY($3::text[])`, [`${PFX}%`, agentUserIds, identityIds])).map((r) => r.id);
      if (au.length) {
        await pool.query(`DELETE FROM "AgentLogin" WHERE "agentUserId" = ANY($1::text[])`, [au]);
        await pool.query(`DELETE FROM "AgentSession" WHERE "agentUserId" = ANY($1::text[])`, [au]);
        await pool.query(`DELETE FROM "AgentUser" WHERE id = ANY($1::text[])`, [au]);
      }
      await pool.query(`DELETE FROM "AgentLogin" WHERE subject LIKE $1`, [`${PFX}%`]);
      await pool.query(`DELETE FROM "AgentIdentity" WHERE "displayName" LIKE $1 OR id = ANY($2::text[])`, [`${PFX}%`, identityIds]);
      const chk = await q<{ what: string; n: number }>(
        `SELECT 'Tenant' AS what, count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1
         UNION ALL SELECT 'User', count(*)::int FROM "User" WHERE email LIKE $1
         UNION ALL SELECT 'AgentAccount', count(*)::int FROM "AgentAccount" WHERE "legalName" LIKE $1 OR "tenantId" = ANY($2::text[])
         UNION ALL SELECT 'AgentRateCard', count(*)::int FROM "AgentRateCard" WHERE "tenantId" = ANY($2::text[]) OR name LIKE $1
         UNION ALL SELECT 'AgentRate', count(*)::int FROM "AgentRate" WHERE "tenantId" = ANY($2::text[])
         UNION ALL SELECT 'AgentTier', count(*)::int FROM "AgentTier" WHERE "tenantId" = ANY($2::text[])
         UNION ALL SELECT 'AgentIdentity', count(*)::int FROM "AgentIdentity" WHERE "displayName" LIKE $1
         UNION ALL SELECT 'AgentUser', count(*)::int FROM "AgentUser" WHERE "displayName" LIKE $1
         UNION ALL SELECT 'AgentLogin', count(*)::int FROM "AgentLogin" WHERE subject LIKE $1`,
        [`${PFX}%`, tenantIds],
      );
      const rem = chk.filter((r) => r.n > 0).map((r) => `${r.what}=${r.n}`);
      console.log(`CLEANUP ${rem.length || left.length ? `LEFT: ${[...rem, ...left].join(" · ")}` : `ok — 0 rows left with prefix ${PFX} (Tenant · User · AgentAccount · AgentRateCard · AgentRate · AgentTier · AgentIdentity · AgentUser · AgentLogin)`}`);
    } catch (e) {
      console.log(`CLEANUP error: ${String(e).slice(0, 200)}`);
    }
    try { const dbm = (await import("@/lib/core/db")) as unknown as Rec; const p = asRec(dbm.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as (...a: unknown[]) => unknown).call(p); } catch { /* ignore */ }
    await pool.end().catch(() => undefined);
  };

  return { STAMP, hex, rid, R, A, fmt, pool, q, ins, AG, TR, S, call, callTr, mkShop, mkProd, mkDep, mkAccount, mkStaff, setV, tiersOf, agentCtx, line, quote, mkCard, auditCount, dbFingerprint, check, summary, cleanup, tenantIds };
}
