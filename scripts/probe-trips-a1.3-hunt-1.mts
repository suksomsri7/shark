// hunt-1 — A1.3a concurrency (≥ 20-way): ensure tiers · create cards vs cardsPerOwner · ACTIVATE overlapping cards · CAS on rates · overlap race · set tier
// run: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-trips-a1.3-hunt-1.mts
import { huntSetup, NOW, type Rec } from "./probe-trips-a1.3-hunt-lib.mts";

const H = await huntSetup("probe-a1.3-hunt-1");
const { call, check, fmt, q, R } = H;
const N = 20;
const tally = (rs: Rec[]) => { const m: Record<string, number> = {}; for (const r of rs) { const k = r.ok === true ? (r.replayed === true ? "ok-replayed" : "ok") : `${String(r.code ?? r.ok)}:${String(r.reason ?? r.e ?? "")}`; m[k] = (m[k] ?? 0) + 1; } return m; };
const timed = async <T,>(p: Promise<T>) => { const t = Date.now(); const v = await p; return { v, ms: Date.now() - t }; };
const ver = async (cardId: string) => Number((await q<{ v: number }>(`SELECT version v FROM "AgentRateCard" WHERE id = $1`, [cardId]))[0]?.v ?? -1);
/** retry on STALE/BUSY with fresh version (what a UI retrying would do) */
const withRetry = async (fn: (v: number) => Promise<Rec>, cardId: string): Promise<Rec> => {
  for (let i = 0; i < 80; i++) {
    const r = await fn(await ver(cardId));
    if (r.ok === true || (r.code !== "STALE" && r.code !== "BUSY")) return r;
  }
  return { ok: false, code: "GAVE_UP" };
};

try {
  const A = await H.mkShop("c1", { u: null });
  const p = await H.mkProd(A, "P", "u");
  const p2 = await H.mkProd(A, "P2", "u");

  // ── 1. ensureAgentTiers × 20 on a shop with no tiers ──
  {
    const rs = await Promise.all(Array.from({ length: N }, () => timed(call("ensureAgentTiers", A.ctx(), {}, { now: NOW }))));
    const tiers = await q<{ code: string }>(`SELECT code FROM "AgentTier" WHERE "tenantId" = $1 ORDER BY code`, [A.id]);
    const created = rs.reduce((s, x) => s + Number(R(x.v).created ?? 0), 0);
    const aud = await H.auditCount(A.id, "agency.tier.ensure");
    check("C1 ensureAgentTiers ×20 → 3 rows · Σcreated=3 · 1 audit · all ok", tiers.map((t) => t.code).join() === "A,B,C" && created === 3 && aud === 1 && rs.every((x) => R(x.v).ok === true),
      "tiers A,B,C created 3 audit 1 all ok", `tiers ${tiers.map((t) => t.code).join()} created ${created} audit ${aud} tally ${fmt(tally(rs.map((x) => R(x.v))))} maxMs ${Math.max(...rs.map((x) => x.ms))}`);
  }
  const X = await H.mkAccount(A, "X");
  const Y = await H.mkAccount(A, "Y");
  const Z = await H.mkAccount(A, "Z");

  // ── 2. createAgentRateCard × 30 for one owner (cardsPerOwner = 20) ──
  let xCards: string[] = [];
  {
    const a0 = await H.auditCount(A.id, "agency.rate_card.create");
    const rs = (await Promise.all(Array.from({ length: 30 }, (_, i) => call("createAgentRateCard", A.ctx(), { owner: { kind: "AGENT", agentAccountId: X }, name: `c${i}` }, { now: NOW }))));
    const n = Number((await q<{ n: number }>(`SELECT count(*)::int n FROM "AgentRateCard" WHERE "agentAccountId" = $1 AND status <> 'ARCHIVED'`, [X]))[0].n);
    const a1 = await H.auditCount(A.id, "agency.rate_card.create");
    const t = tally(rs);
    xCards = rs.filter((r) => r.ok === true).map((r) => String(R(r.card).id));
    check("C2 create ×30 same owner → exactly 20 cards · 10 LIMIT_REACHED · audit = 20", n === 20 && t.ok === 20 && t["VALIDATION:LIMIT_REACHED"] === 10 && a1 - a0 === 20, "20 / 10 / 20", `rows ${n} tally ${fmt(t)} audit +${a1 - a0}`);
  }

  // ── 3. ACTIVATE × 20 cards with overlapping (open) validity, same priority ──
  {
    const a0 = await H.auditCount(A.id, "agency.rate_card.activate");
    const rs = await Promise.all(xCards.map((id) => timed(call("setAgentRateCardStatus", A.ctx(), { cardId: id, expectedVersion: 1, action: "ACTIVATE" }, { now: NOW }))));
    const act = Number((await q<{ n: number }>(`SELECT count(*)::int n FROM "AgentRateCard" WHERE "agentAccountId" = $1 AND status = 'ACTIVE'`, [X]))[0].n);
    const a1 = await H.auditCount(A.id, "agency.rate_card.activate");
    const t = tally(rs.map((x) => R(x.v)));
    const vers = await q<{ v: number; status: string }>(`SELECT version v, status FROM "AgentRateCard" WHERE "agentAccountId" = $1`, [X]);
    const vOk = vers.every((r) => (r.status === "ACTIVE" ? r.v === 2 : r.v === 1));
    check("C3 ACTIVATE ×20 overlapping → 1 ACTIVE · 19 CARD_OVERLAP · audit 1 · versions 2/1", act === 1 && t.ok === 1 && t["VALIDATION:CARD_OVERLAP"] === 19 && a1 - a0 === 1 && vOk,
      "1 / 19 / 1 / ok", `active ${act} tally ${fmt(t)} audit +${a1 - a0} versions ${fmt(vers.map((r) => `${r.status}:${r.v}`))} maxMs ${Math.max(...rs.map((x) => x.ms))}`);
  }

  // ── 4. two ACTIVE cards of Y race to stretch into each other (each × 10, retrying) ──
  {
    const P = await H.mkCard(A, { kind: "AGENT", agentAccountId: Y }, [], { validFrom: "2027-01-01", validTo: "2027-01-31" });
    const Q = await H.mkCard(A, { kind: "AGENT", agentAccountId: Y }, [], { validFrom: "2027-03-01", validTo: "2027-03-31" });
    const jobs: Promise<Rec>[] = [];
    for (let i = 0; i < 10; i++) {
      jobs.push(withRetry((v) => call("updateAgentRateCard", A.ctx(), { cardId: P.id, expectedVersion: v, patch: { validTo: "2027-02-20" } }, { now: NOW }), P.id));
      jobs.push(withRetry((v) => call("updateAgentRateCard", A.ctx(), { cardId: Q.id, expectedVersion: v, patch: { validFrom: "2027-02-10" } }, { now: NOW }), Q.id));
    }
    const rs = await Promise.all(jobs);
    const rows = await q<{ f: string | null; t: string | null }>(`SELECT to_char("validFrom",'YYYY-MM-DD') f, to_char("validTo",'YYYY-MM-DD') t FROM "AgentRateCard" WHERE "agentAccountId" = $1 AND status='ACTIVE' AND priority = 0`, [Y]);
    const ov = rows.length === 2 && (rows[0].f ?? "0000") <= (rows[1].t ?? "9999") && (rows[1].f ?? "0000") <= (rows[0].t ?? "9999");
    check("C4 cross-card range race (20 retrying updates) → no two ACTIVE same-priority cards overlap", !ov, "no overlap", `rows ${fmt(rows)} tally ${fmt(tally(rs))}`);
  }

  // ── 5. upsertAgentRate × 20 with the SAME expectedVersion ──
  let cardZ = { id: "", version: 0 };
  {
    const c = await H.mkCard(A, { kind: "AGENT", agentAccountId: Z }, [], { activate: false });
    cardZ = c;
    const a0 = await H.auditCount(A.id, "agency.rate.%");
    const rs = await Promise.all(Array.from({ length: N }, (_, i) => call("upsertAgentRate", A.ctx(), { cardId: c.id, expectedVersion: c.version, rate: { productKind: "TRIP", productId: p.id, mode: "COMMISSION_PCT", valueBp: 100 + i, travelFrom: `2027-01-${String(i + 1).padStart(2, "0")}`, travelTo: "2027-12-31" } }, { now: NOW })));
    const rows = Number((await q<{ n: number }>(`SELECT count(*)::int n FROM "AgentRate" WHERE "rateCardId" = $1`, [c.id]))[0].n);
    const a1 = await H.auditCount(A.id, "agency.rate.%");
    const t = tally(rs);
    check("C5 upsert ×20 same expectedVersion → 1 ok · 19 STALE · 1 row · version+1 · 1 audit", t.ok === 1 && t["STALE:"] === 19 && rows === 1 && (await ver(c.id)) === c.version + 1 && a1 - a0 === 1,
      "1/19/1/v+1/1", `tally ${fmt(t)} rows ${rows} version ${await ver(c.id)} (from ${c.version}) audit +${a1 - a0}`);
  }

  // ── 6. upsert × 20 retrying (fresh version) — special-period rows of the SAME dims+priority whose ranges all overlap ──
  {
    const c = await H.mkCard(A, { kind: "AGENT", agentAccountId: Z }, [], { activate: false });
    const v0 = await ver(c.id);
    const a0 = await H.auditCount(A.id, "agency.rate.upsert");
    const rs = await Promise.all(Array.from({ length: N }, (_, i) => withRetry((v) => call("upsertAgentRate", A.ctx(), { cardId: c.id, expectedVersion: v, rate: { productKind: "TRIP", productId: p2.id, mode: "COMMISSION_PCT", valueBp: 500 + i, bookFrom: `2026-11-${String(i + 1).padStart(2, "0")}`, bookTo: "2026-12-31" } }, { now: NOW }), c.id)));
    const t = tally(rs);
    const rows = await q<{ n: number }>(`SELECT count(*)::int n FROM "AgentRate" WHERE "rateCardId" = $1 AND active`, [c.id]);
    const v1 = await ver(c.id);
    const a1 = await H.auditCount(A.id, "agency.rate.upsert");
    check("C6 overlap race ×20 (retrying) → 1 row · 19 RATE_OVERLAP · version steps = successes · audit = successes", rows[0].n === 1 && t.ok === 1 && t["VALIDATION:RATE_OVERLAP"] === 19 && v1 - v0 === 1 && a1 - a0 === 1,
      "1 row / 1 ok / 19 overlap / +1 / +1", `rows ${rows[0].n} tally ${fmt(t)} version +${v1 - v0} audit +${a1 - a0}`);
  }

  // ── 7. reactivate race: two overlapping special rows, both inactive, reactivated concurrently (10 each, retrying) ──
  {
    const c = await H.mkCard(A, { kind: "AGENT", agentAccountId: Z }, [
      { productKind: "TRIP", productId: p.id, mode: "COMMISSION_PCT", valueBp: 700, travelFrom: "2027-05-01", travelTo: "2027-05-31", active: false },
      { productKind: "TRIP", productId: p.id, mode: "COMMISSION_PCT", valueBp: 800, travelFrom: "2027-05-10", travelTo: "2027-06-30", active: false },
    ], { activate: false });
    const jobs: Promise<Rec>[] = [];
    for (let i = 0; i < 10; i++) for (const rid of c.rateIds) jobs.push(withRetry((v) => call("setAgentRateActive", A.ctx(), { cardId: c.id, expectedVersion: v, rateId: rid, active: true }, { now: NOW }), c.id));
    const rs = await Promise.all(jobs);
    const act = Number((await q<{ n: number }>(`SELECT count(*)::int n FROM "AgentRate" WHERE "rateCardId" = $1 AND active`, [c.id]))[0].n);
    check("C7 reactivate overlapping rows ×20 → at most 1 active", act <= 1, "≤ 1 active", `active ${act} tally ${fmt(tally(rs))}`);
  }

  // ── 8. setAgentRateActive × 20 same version ──
  {
    const c = await H.mkCard(A, { kind: "AGENT", agentAccountId: Z }, [{ productKind: "TRIP", productId: p.id, mode: "COMMISSION_PCT", valueBp: 900, travelFrom: "2028-01-01" }], { activate: false });
    const a0 = await H.auditCount(A.id, "agency.rate.%activate");
    const rs = await Promise.all(Array.from({ length: N }, (_, i) => call("setAgentRateActive", A.ctx(), { cardId: c.id, expectedVersion: c.version, rateId: c.rateIds[0], active: i % 2 === 0 ? false : true }, { now: NOW })));
    const a1 = await H.auditCount(A.id, "agency.rate.%activate");
    const t = tally(rs);
    check("C8 setAgentRateActive ×20 same version → 1 ok · 19 STALE · audit 1 · version+1", t.ok === 1 && t["STALE:"] === 19 && a1 - a0 === 1 && (await ver(c.id)) === c.version + 1, "1/19/1/+1", `tally ${fmt(t)} audit +${a1 - a0} version ${await ver(c.id)} from ${c.version}`);
  }

  // ── 9. ARCHIVE vs upsert vs ACTIVATE on the same version ──
  {
    const c = await H.mkCard(A, { kind: "TIER", tierCode: "C" }, [], { activate: false, validFrom: "2030-01-01", validTo: "2030-01-02" });
    const rs = await Promise.all(Array.from({ length: N }, (_, i) => i % 3 === 0 ? call("setAgentRateCardStatus", A.ctx(), { cardId: c.id, expectedVersion: c.version, action: "ARCHIVE" }, { now: NOW })
      : i % 3 === 1 ? call("setAgentRateCardStatus", A.ctx(), { cardId: c.id, expectedVersion: c.version, action: "ACTIVATE" }, { now: NOW })
        : call("upsertAgentRate", A.ctx(), { cardId: c.id, expectedVersion: c.version, rate: { productKind: "TRIP", productId: p.id, mode: "COMMISSION_PCT", valueBp: 1 } }, { now: NOW })));
    const t = tally(rs);
    const okN = rs.filter((r) => r.ok === true && r.replayed !== true).length;
    const v = await ver(c.id);
    const auds = Number((await q<{ n: number }>(`SELECT count(*)::int n FROM "AuditLog" WHERE "tenantId" = $1 AND "targetId" = $2 AND action <> 'agency.rate_card.create'`, [A.id, c.id]))[0].n);
    check("C9 ARCHIVE/ACTIVATE/upsert ×20 on one version → exactly 1 real winner · version+1 · audit 1", okN === 1 && v === c.version + 1 && auds === 1, "1 / +1 / 1", `tally ${fmt(tally(rs))} winners ${okN} version ${v} from ${c.version} audit ${auds} ${fmt(t)}`);
  }

  // ── 10. setAgentAccountTier × 20 with one expectedUpdatedAt (A/B/C/null mixed) ──
  {
    const T = await H.mkAccount(A, "T");
    const u0 = (await q<{ u: string }>(`SELECT to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') u FROM "AgentAccount" WHERE id = $1`, [T]))[0].u;
    const a0 = await H.auditCount(A.id, "agency.tier.assign");
    const codes = ["A", "B", "C", null] as const;
    const rs = await Promise.all(Array.from({ length: N }, (_, i) => call("setAgentAccountTier", A.ctx(), { agentAccountId: T, tierCode: codes[i % 4], expectedUpdatedAt: u0 }, { now: NOW })));
    const t = tally(rs);
    const a1 = await H.auditCount(A.id, "agency.tier.assign");
    const real = rs.filter((r) => r.ok === true && r.replayed === false).length;
    check("C10 setAgentAccountTier ×20 one expectedUpdatedAt → 1 real write · audit 1 · rest STALE/replayed", real === 1 && a1 - a0 === 1, "1 / 1", `real ${real} audit +${a1 - a0} tally ${fmt(t)}`);
    // same code ×20 — idempotent replays, still 1 audit
    const u1 = (await q<{ u: string; tier: string | null }>(`SELECT to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') u, "tierId" tier FROM "AgentAccount" WHERE id = $1`, [T]))[0];
    const b0 = await H.auditCount(A.id, "agency.tier.assign");
    const rs2 = await Promise.all(Array.from({ length: N }, () => call("setAgentAccountTier", A.ctx(), { agentAccountId: T, tierCode: "B", expectedUpdatedAt: u1.u }, { now: NOW })));
    const b1 = await H.auditCount(A.id, "agency.tier.assign");
    const real2 = rs2.filter((r) => r.ok === true && r.replayed === false).length;
    check("C11 setAgentAccountTier ×20 same target → 1 write + 19 replayed · audit 1", real2 === 1 && rs2.filter((r) => r.replayed === true).length === 19 && b1 - b0 === 1, "1 + 19 replayed / 1", `real ${real2} tally ${fmt(tally(rs2))} audit +${b1 - b0}`);
  }

  // ── 12. mixed storm on one owner (TIER B): 20 creates+activates+range edits+upserts at once → no BUSY:UNEXPECTED, no hang, no ACTIVE overlap ──
  {
    const t0 = Date.now();
    const jobs: Promise<Rec>[] = [];
    for (let i = 0; i < 8; i++) jobs.push((async () => { try { const c = await H.mkCard(A, { kind: "TIER", tierCode: "B" }, [{ productKind: "TRIP", productId: p.id, mode: "COMMISSION_PCT", valueBp: 1000 + i }], { validFrom: `2027-0${(i % 8) + 1}-01`, priority: i % 2 }); return { ok: true, id: c.id }; } catch (e) { return { ok: false, code: "SETUP", e: String(e).slice(0, 160) }; } })());
    const rs = await Promise.all(jobs);
    const ids = rs.filter((r) => r.ok === true).map((r) => String(r.id));
    const more: Promise<Rec>[] = [];
    for (const id of ids) for (let k = 0; k < 3; k++) more.push(withRetry((v) => call("updateAgentRateCard", A.ctx(), { cardId: id, expectedVersion: v, patch: { validTo: k === 0 ? null : `2027-1${k}-01`, priority: k % 2 } }, { now: NOW }), id));
    const rs2 = await Promise.all(more);
    const ms = Date.now() - t0;
    const unexpected = [...rs, ...rs2].filter((r) => r.code === "BUSY" || r.ok === "THROW" || r.code === "GAVE_UP");
    const act = await q<{ f: string | null; t: string | null; p: number }>(`SELECT to_char("validFrom",'YYYY-MM-DD') f, to_char("validTo",'YYYY-MM-DD') t, priority p FROM "AgentRateCard" c JOIN "AgentTier" t ON t.id = c."tierId" WHERE c."tenantId" = $1 AND t.code = 'B' AND c.status = 'ACTIVE'`, [A.id]);
    let ov = 0;
    for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) if (act[i].p === act[j].p && (act[i].f ?? "0000") <= (act[j].t ?? "9999") && (act[j].f ?? "0000") <= (act[i].t ?? "9999")) ov++;
    check("C12 mixed storm on one owner → no overlapping ACTIVE pair · no BUSY/THROW/give-up · finishes", ov === 0 && unexpected.length === 0, "0 overlap / 0 unexpected", `overlapPairs ${ov} unexpected ${fmt(unexpected.slice(0, 3))} create ${fmt(tally(rs))} edits ${fmt(tally(rs2))} ms ${ms}`);
  }
  void cardZ;
} catch (e) {
  console.log(`PROBE ERROR ${String(e instanceof Error ? e.stack : e).slice(0, 800)}`);
} finally {
  H.summary("hunt-1");
  await H.cleanup();
}
