// probe lib — A1.2a bug hunt (adversarial probes · QC DB only · NOT an oracle)
// Setup patterns copied from scripts/qc-trips-a1.2.mts (temporary tenants / staff / deps.sendAgentMail / meta.now).
// Own marks (never collide with the oracle's sweep): slug `hunt-a12-*` · names `HUNTA12…` · e-mails `hunta12-*@example.test`.
import { randomBytes } from "node:crypto";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";

export type Rec = Record<string, unknown>;
type F = (...a: unknown[]) => Promise<unknown>;

export async function huntSetup(label: string) {
  loadTripsQcEnv(label);
  if (process.env.CI) { console.error("no CI"); process.exit(4); }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) process.env.SESSION_SECRET = `qc-a12-session-${"s".repeat(40)}`;
  if (!process.env.INTEGRATIONS_CREDENTIALS_KEY || process.env.INTEGRATIONS_CREDENTIALS_KEY.trim().length < 32) process.env.INTEGRATIONS_CREDENTIALS_KEY = `qc-a12-${"k".repeat(40)}`;
  const RUN_START = new Date();
  const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
  const hex = (n: number) => randomBytes(n).toString("hex");
  const rid = (p: string) => `a12hunt_${p}_${Date.now().toString(36)}${hex(3)}`;
  const MARK = "HUNTA12";
  const SLUG = "hunt-a12-";
  const mail = (tag: string) => `hunta12-${tag}-${STAMP}@example.test`;
  const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
  const R = (v: unknown): Rec => asRec(v) ?? {};
  const fmt = (v: unknown): string => { try { return (JSON.stringify(v) ?? String(v)).slice(0, 400); } catch { return String(v); } };

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
  const ins = async (table: string, vals: Rec): Promise<void> => {
    const cs = await cols(table);
    if (!cs.length) throw new Error(`no table ${table}`);
    const v: Rec = { ...vals };
    for (const c of cs) {
      if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
      const t = c.data_type;
      if (c.column_name === "id") { v.id = rid("id"); continue; }
      v[c.column_name] = t === "text" || t.startsWith("character") ? `qc${hex(3)}` : ["integer", "bigint"].includes(t) ? 0 : t === "boolean" ? false : t === "jsonb" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "ARRAY" ? [] : null;
    }
    const keys = Object.keys(v);
    await pool.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => { const x = v[k]; return x !== null && typeof x === "object" && !(x instanceof Date) && !Array.isArray(x) ? JSON.stringify(x) : x; }));
  };

  const AUM = (await import("@/lib/platform/agent-auth")) as unknown as Rec;
  const AGM = (await import("@/lib/modules/agency")) as unknown as Rec;
  const SETM = (await import("@/lib/core/settings")) as unknown as Rec;
  const AU = (n: string): F => { const f = AUM[n]; if (typeof f !== "function") throw new Error(`agent-auth has no ${n}`); return f as F; };
  const AG = (n: string): F => { const f = AGM[n]; if (typeof f !== "function") throw new Error(`agency facade has no ${n}`); return f as F; };

  // ── created things (for cleanup) ──
  const tenantIds: string[] = [];
  const staffUserIds: string[] = [];
  const agentUserIds = new Set<string>();
  const identityIds = new Set<string>();
  const codeIds: string[] = [];

  const mails: { to: string; kind: string; code?: string; token?: string; url?: string }[] = [];
  const deps: Rec = { sendAgentMail: async (m: unknown) => { const r = R(m); mails.push({ to: String(r.to ?? ""), kind: String(r.kind ?? ""), code: typeof r.code === "string" ? r.code : undefined, token: typeof r.token === "string" ? r.token : undefined, url: typeof r.url === "string" ? r.url : undefined }); } };
  /** limiter that always passes (with a count) — used where a probe needs many codes for one e-mail */
  const openRate = async () => ({ ok: true, count: 1 });
  const depsOpen: Rec = { ...deps, rateLimit: openRate };
  const lastMail = (to: string, kind: string) => [...mails].reverse().find((m) => m.to === to && m.kind === kind);
  const rip = () => `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
  const meta = (o: { now?: Date; ck?: string; ip?: string; deps?: Rec } = {}): Rec => ({ clientKey: o.ck ?? `hunt-${hex(6)}`, ip: o.ip ?? rip(), userAgent: "hunta12", ...(o.now ? { now: o.now } : {}), deps: o.deps ?? deps });

  type Staff = { userId: string };
  const mkTenant = async (tag: string, unitType: "TRIPS" | "SHOP" = "TRIPS"): Promise<{ id: string; slug: string; unitId: string; owner: Staff; ctx: { tenantId: string; actorUserId: string } }> => {
    const id = rid(`t${tag}`), slug = `${SLUG}${STAMP}-${tag}`, unitId = rid(`u${tag}`);
    await ins("Tenant", { id, name: `${MARK} shop ${tag}`, slug });
    tenantIds.push(id);
    await ins("BusinessUnit", { id: unitId, tenantId: id, type: unitType, name: `unit ${tag}`, slug: `${SLUG}${tag}-${STAMP}` });
    const uid = rid(`su${tag}`);
    await ins("User", { id: uid, email: `${SLUG}${tag}-${STAMP}@shark.local`, name: `hunt ${tag}` });
    staffUserIds.push(uid);
    await ins("Membership", { id: rid(`mb${tag}`), userId: uid, tenantId: id, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: JSON.stringify({}), acceptedAt: new Date() });
    return { id, slug, unitId, owner: { userId: uid }, ctx: { tenantId: id, actorUserId: uid } };
  };
  /** A36 requireApproval = false at the tenant's single unit (same call as the oracle's PC-3) */
  const setAutoApprove = async (t: { id: string; unitId: string; owner: Staff }): Promise<Rec> => {
    const f = SETM.setSettings as F;
    return R(await f({ userId: t.owner.userId, role: "OWNER", unitAccess: ["*"], permissions: {} }, { tenantId: t.id }, [{ key: "agency.signup.requireApproval", scope: "UNIT", scopeId: t.unitId, value: false }], {}));
  };

  type Who = { email: string; token: string; agentUserId: string; identityId: string; publicCode: string };
  const track = async (token: string): Promise<Rec> => {
    const s = R(await AU("resolveAgentSession")(token));
    if (typeof s.agentUserId === "string") agentUserIds.add(s.agentUserId);
    const ident = R(s.identity);
    if (typeof ident.id === "string") identityIds.add(ident.id);
    return s;
  };
  const reqCode = async (email: string, m: Rec = meta()): Promise<Rec> => { const r = R(await AU("requestAgentLoginCode")({ email }, m)); if (r.ok === true) codeIds.push(String(r.codeId)); return r; };
  const verify = async (input: Rec, m: Rec = meta()): Promise<Rec> => { const r = R(await AU("verifyAgentLoginCode")(input, m)); if (r.ok === true) await track(String(r.token)); return r; };
  /** request + verify (limiter open so repeated logins of one e-mail are not throttled) */
  const login = async (email: string, extra: Rec = {}, now?: Date): Promise<Who & { raw: Rec }> => {
    const r1 = await reqCode(email, meta({ deps: depsOpen, now }));
    if (r1.ok !== true) throw new Error(`reqCode ${email}: ${fmt(r1)}`);
    const code = lastMail(email, "LOGIN_CODE")?.code;
    const r2 = await verify({ email, codeId: r1.codeId, code, ...extra }, meta({ deps: depsOpen, now }));
    if (r2.ok !== true) return { email, token: "", agentUserId: "", identityId: "", publicCode: "", raw: r2 };
    const s = await track(String(r2.token));
    const ident = R(s.identity);
    return { email, token: String(r2.token), agentUserId: String(s.agentUserId ?? ""), identityId: String(ident.id ?? ""), publicCode: String(ident.publicCode ?? ""), raw: r2 };
  };
  const signup = async (tag: string, email = mail(tag)) => {
    const w = await login(email, { signup: { agencyName: `${MARK} ${tag} ${STAMP}`, ownerName: `${MARK} owner ${tag}` } });
    if (!w.token) throw new Error(`signup ${tag}: ${fmt(w.raw)}`);
    return w;
  };
  const teammate = async (inviter: Who, email: string, role: string, tag: string): Promise<{ who: Who & { raw: Rec }; token: string }> => {
    const ti = R(await AU("createTeammateInvite")(inviter.token, { email, role }, meta()));
    if (ti.ok !== true) throw new Error(`createTeammateInvite: ${fmt(ti)}`);
    const who = await login(email, { teammateInvite: ti.teammateToken, teammateName: `${MARK} mate ${tag}` });
    return { who, token: String(ti.teammateToken) };
  };
  const app = (o: Rec = {}): Rec => ({ legalName: `${MARK} legal ${hex(3)}`, payeeType: "TH_JURISTIC", contact: { name: `${MARK} contact` }, consentVersion: "agency-apply-v1", ...o });
  /**
   * r2 (ruling §10 item 5): approve / reject must carry `expectedUpdatedAt` — the shop screen always has it. When a probe does not pass one,
   * send the row's CURRENT stamp (read by id, whatever shop owns it — the strongest form of a cross-shop attempt), so the call is judged on what it attacks, not on a missing field.
   */
  const withExpected = async (fn: string, input: Rec): Promise<Rec> => {
    if ((fn !== "approveAgentAccount" && fn !== "rejectAgentAccount") || "expectedUpdatedAt" in input) return input;
    const u = (await q<{ u: string }>(`SELECT to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS u FROM "AgentAccount" WHERE id = $1`, [String(input.agentAccountId)]))[0]?.u;
    return { ...input, expectedUpdatedAt: u ?? "1970-01-01T00:00:00.000Z" };
  };
  const shop = async (fn: string, ctx: { tenantId: string; actorUserId: string }, input: Rec, opts: Rec = {}): Promise<Rec> => R(await AG(fn)(ctx, await withExpected(fn, input), { deps, ...opts }));

  // ── cleanup (same approach as the oracle: tenant tables by tenantId · global rows by tracked ids / marks) ──
  const cleanup = async (): Promise<void> => {
    const left: string[] = [];
    try {
      if (tenantIds.length) {
        try {
          const c = await pool.connect();
          try { await c.query("BEGIN"); await c.query(`SET LOCAL shark.ledger_purge = 'on'`); await c.query(`DELETE FROM "AgentLedgerEntry" WHERE "tenantId" = ANY($1::text[])`, [tenantIds]); await c.query("COMMIT"); } catch { try { await c.query("ROLLBACK"); } catch { /* ignore */ } } finally { c.release(); }
        } catch { /* ignore */ }
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
      if (staffUserIds.length) {
        for (const t of ["Membership", "Session"]) { try { await pool.query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [staffUserIds]); } catch { /* ignore */ } }
        try { await pool.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [staffUserIds]); } catch (e) { left.push(`User: ${String(e).slice(0, 80)}`); }
      }
      const ids = [...identityIds];
      const us = (await q<{ id: string }>(`SELECT u.id FROM "AgentUser" u LEFT JOIN "AgentIdentity" i ON i.id = u."identityId" WHERE u."displayName" LIKE $1 OR i."displayName" LIKE $1 OR u.id = ANY($2::text[]) OR u."identityId" = ANY($3::text[])`, [`${MARK}%`, [...agentUserIds], ids])).map((r) => r.id);
      if (us.length) {
        await pool.query(`DELETE FROM "AgentLogin" WHERE "agentUserId" = ANY($1::text[])`, [us]);
        await pool.query(`DELETE FROM "AgentSession" WHERE "agentUserId" = ANY($1::text[])`, [us]);
        await pool.query(`DELETE FROM "AgentUser" WHERE id = ANY($1::text[])`, [us]);
      }
      await pool.query(`DELETE FROM "AgentLogin" WHERE subject LIKE 'hunta12-%'`);
      await pool.query(`DELETE FROM "AgentLoginCode" WHERE id = ANY($1::text[])`, [codeIds]);
      // r2: "teammate token used" marker rows (tmj_*) written by this run (we hold the QC gate lock for this DB ⇒ only this process writes them now)
      await pool.query(`DELETE FROM "AgentLoginCode" WHERE id LIKE 'tmj\\_%' AND "createdAt" >= $1`, [RUN_START]);
      await pool.query(`DELETE FROM "AgentIdentity" WHERE "displayName" LIKE $1 OR id = ANY($2::text[])`, [`${MARK}%`, ids]);
      // rate buckets written by this run (we hold the QC gate lock for this DB ⇒ only this process writes agent:* buckets now)
      await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'agent:%' AND "createdAt" >= $1`, [RUN_START]);
      const chk = await q<{ what: string; n: number }>(
        `SELECT 'Tenant' AS what, count(*)::int AS n FROM "Tenant" WHERE id = ANY($1::text[])
         UNION ALL SELECT 'AgentAccount', count(*)::int FROM "AgentAccount" WHERE "tenantId" = ANY($1::text[])
         UNION ALL SELECT 'AgentUser', count(*)::int FROM "AgentUser" WHERE id = ANY($2::text[]) OR "identityId" = ANY($3::text[])
         UNION ALL SELECT 'AgentIdentity', count(*)::int FROM "AgentIdentity" WHERE id = ANY($3::text[])
         UNION ALL SELECT 'AgentLoginCode', count(*)::int FROM "AgentLoginCode" WHERE id = ANY($4::text[])
         UNION ALL SELECT 'AgentLogin(hunta12)', count(*)::int FROM "AgentLogin" WHERE subject LIKE 'hunta12-%'`,
        [tenantIds, [...agentUserIds], ids, codeIds],
      );
      const rem = chk.filter((r) => r.n > 0).map((r) => `${r.what}=${r.n}`);
      console.log(`CLEANUP ${rem.length || left.length ? `LEFT: ${[...rem, ...left].join(" · ")}` : "ok — 0 rows left (tenants · agent users/identities/codes/logins · rate buckets)"}`);
    } catch (e) {
      console.log(`CLEANUP error: ${String(e).slice(0, 200)}`);
    }
    try { const dbm = (await import("@/lib/core/db")) as unknown as Rec; const p = asRec(dbm.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as (...a: unknown[]) => unknown).call(p); } catch { /* ignore */ }
    await pool.end().catch(() => undefined);
  };

  /** print one probe line: HELD / BUG with expected vs got */
  const report = (id: string, title: string, bug: boolean, expected: string, got: string) => console.log(`${bug ? "🐞 BUG " : "🛡  HELD"} [${id}] ${title}\n      expected: ${expected}\n      got:      ${got}`);

  return { RUN_START, STAMP, MARK, hex, rid, mail, R, fmt, pool, q, ins, AU, AG, mails, deps, depsOpen, lastMail, meta, mkTenant, setAutoApprove, reqCode, verify, login, signup, teammate, app, shop, cleanup, report, agentUserIds, identityIds, codeIds };
}
