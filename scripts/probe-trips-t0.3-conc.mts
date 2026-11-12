// probe-trips-t0.3-conc.mts — hunter T0.3: (1) ผสม 30 ทางพร้อมกันบนรอบเดียว (4) ทรัพยากรกันชน (5) ผังสถานะ fuzz
import { boot, call, brief, rawLeak, out, fmt, q, pool, mkShop, mkProd, mkUnit, mkTenant, mkUser, insertRow, rid, cleanup, endPool, depRow, mods, type Rec, type Ctx } from "./probe-trips-t0.3-lib.mjs";

boot("probe-t0.3-conc");
const only = process.argv[2] ?? "all";
const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]): T => a[rnd(a.length)];
let exit = 0;
try {
  const { T } = await mods();
  const TRANS = T.DEPARTURE_TRANSITIONS as { from: string; to: string; actors: string[] }[];
  const legal = (f: string, t: string, a: string) => TRANS.some((x) => x.from === f && x.to === t && x.actors.includes(a));
  const A = await mkShop("a");
  const P1 = await mkProd(A.tenantId, A.unitId, "เรือทดสอบ ก");
  const P2 = await mkProd(A.tenantId, A.unitId, "เรือทดสอบ ข");
  const res = async (name: string, unitId = A.unitId, ctx: Ctx = A.ctx) => { const r = await call("createResource", ctx, { unitId, kind: "BOAT", name }); if (r.ok !== true) throw new Error(`createResource ${fmt(r)}`); return String(r.id); };
  const mkDep = async (p: { id: string; opt: string }, localDate: string, min: number, extra: Rec = {}) => {
    const r = await call("createDeparture", A.ctx, { unitId: A.unitId, productId: p.id, optionId: p.opt, localDate, departTimeMin: min, capacity: 20, ...extra });
    if (r.ok !== true) throw new Error(`createDeparture ${localDate} ${min} ${fmt(r)}`);
    return String(r.id);
  };

  // ═════════ 1. ผสม 30 ทางพร้อมกัน ═════════
  if (only === "all" || only === "mix") {
    const R1 = await res("เรือหนึ่ง"), R2 = await res("เรือสอง");
    const D = await mkDep(P1, "2027-08-10", 540, { minPax: 5 });
    const E = await mkDep(P2, "2027-08-10", 780, { resourceIds: [R2] });
    const U = { tenantId: A.tenantId, unitId: A.unitId, departureId: D };
    const rawClient = async (sql: string, params: unknown[]) => {
      const c = await pool().connect();
      try { await c.query("SET lock_timeout = '10s'; SET statement_timeout = '20s'"); return (await c.query(sql, params)).rowCount ?? 0; }
      catch (e) { return `RAWERR ${(e as { code?: string }).code ?? ""} ${(e as Error).message}`; } finally { c.release(); }
    };
    const evalNow = new Date("2027-08-09T12:00:00Z");
    const ops: Record<string, () => Promise<Rec>> = {
      cap: () => call("setDepartureCapacity", A.ctx, { unitId: A.unitId, departureId: D, capacity: rnd(31) }),
      status: () => call("setDepartureStatus", A.ctx, { unitId: A.unitId, departureId: D, status: pick(["OPEN", "GUARANTEED", "CLOSED"]) }),
      stop: () => call("setDepartureStopSell", A.ctx, { unitId: A.unitId, departureId: D, stopSell: Math.random() < 0.5 ? null : { channels: ["WEB"], reason: "x" } }),
      time: () => call("updateDeparture", A.ctx, { unitId: A.unitId, departureId: D, departTimeMin: 480 + 30 * rnd(7), confirm: true }),
      assign: () => call("assignResource", A.ctx, { unitId: A.unitId, departureId: D, resourceId: pick([R1, R2]) }),
      unassign: () => call("unassignResource", A.ctx, { unitId: A.unitId, departureId: D, resourceId: pick([R1, R2]) }),
      minpax: () => call("evaluateMinPax", A.ctx, { unitId: A.unitId }, { now: evalNow }),
      get: () => call("getDeparture", A.ctx, { unitId: A.unitId, departureId: D }),
      hold: async () => { const n = 1 + rnd(4); return { raw: await rawClient(`UPDATE "TripDeparture" SET held = held + $2, version = version + 1, status = CASE WHEN sold+held+reserved+$2 = capacity THEN 'FULL' ELSE status END WHERE id = $1 AND "tenantId" = $3 AND status IN ('OPEN','GUARANTEED') AND sold+held+reserved+$2 <= capacity`, [D, n, A.tenantId]) }; },
      sell: async () => { const n = 1 + rnd(3); return { raw: await rawClient(`UPDATE "TripDeparture" SET held = held - $2, sold = sold + $2, version = version + 1 WHERE id = $1 AND held >= $2`, [D, n]) }; },
      release: async () => { const n = 1 + rnd(3); return { raw: await rawClient(`UPDATE "TripDeparture" SET held = held - $2, version = version + 1, status = CASE WHEN status = 'FULL' THEN (CASE WHEN "minPax" IS NOT NULL AND sold >= "minPax" THEN 'GUARANTEED' ELSE 'OPEN' END) ELSE status END WHERE id = $1 AND held >= $2`, [D, n]) }; },
    };
    const names = Object.keys(ops);
    let lastVersion = -1;
    const tally: Record<string, Record<string, number>> = {};
    const leaks: string[] = [];
    let maxMs = 0;
    for (let round = 1; round <= 6; round++) {
      const plan = Array.from({ length: 30 }, (_, i) => names[(i + round) % names.length] === "get" && Math.random() < 0.5 ? pick(names) : names[(i * 7 + round) % names.length]);
      const t0 = Date.now();
      const rs = await Promise.all(plan.map(async (n) => { const s = Date.now(); const r = await ops[n](); return { n, r, ms: Date.now() - s }; }));
      for (const { n, r, ms } of rs) {
        maxMs = Math.max(maxMs, ms);
        const k = "raw" in r ? (typeof r.raw === "string" ? `RAWERR` : `rows=${r.raw}`) : brief(r).replace(/\(.*$/, "");
        (tally[n] ??= {})[k] = (tally[n][k] ?? 0) + 1;
        if (rawLeak(r) || (typeof r.raw === "string")) leaks.push(`${n}: ${brief(r)} ${typeof r.raw === "string" ? r.raw : ""}`);
      }
      const d = await depRow(D) as Rec;
      const used = Number(d.sold) + Number(d.held) + Number(d.reserved);
      const uses = await q(`SELECT "resourceId", "startsAt", "endsAt" FROM "TripResourceUse" WHERE "departureId" = $1 AND active`, [D]);
      const usesOk = uses.every((u) => (u.startsAt as Date).getTime() === (d.startsAt as Date).getTime() && (u.endsAt as Date).getTime() === (d.endsAt as Date).getTime());
      const g = await call("getDeparture", A.ctx, { unitId: A.unitId, departureId: D });
      const cut = asMax(asRecs(g).cutoffs);
      out(`mix r${round}`, { ms: Date.now() - t0, status: d.status, cap: d.capacity, sold: d.sold, held: d.held, used, version: d.version, uses: uses.map((u) => u.resourceId === R1 ? "R1" : "R2"), usesTimeOk: usesOk,
        cutoffColOk: d.cutoffAt ? (d.cutoffAt as Date).toISOString() === cut : null, versionMonotonic: Number(d.version) >= lastVersion, invariant: used <= Number(d.capacity) });
      lastVersion = Number(d.version);
    }
    function asRecs(r: Rec): Rec { return (r.departure ?? {}) as Rec; }
    function asMax(c: unknown): string { const v = Object.values((c ?? {}) as Record<string, string>); return v.length ? new Date(Math.max(...v.map((x) => Date.parse(x)))).toISOString() : ""; }
    out("mix tally", tally);
    out("mix maxLatencyMs", maxMs);
    out("mix leaks", leaks.slice(0, 20), `total=${leaks.length}`);
    // ประวัติสถานะจาก audit (STAFF = trips.departure.status · SYSTEM ผ่าน capacity) + event
    const aud = await q(`SELECT action, "actorType", before, after FROM "AuditLog" WHERE "tenantId" = $1 AND "targetId" = $2 AND action IN ('trips.departure.status','trips.departure.capacity') ORDER BY "createdAt", id`, [A.tenantId, D]);
    const bad: string[] = [];
    let statusChanges = 0;
    for (const a of aud) {
      const f = String((a.before as Rec)?.status), t = String((a.after as Rec)?.status);
      if (f === t) continue;
      statusChanges++;
      const actor = a.action === "trips.departure.capacity" ? "SYSTEM" : "STAFF";
      if (!legal(f, t, actor)) bad.push(`${a.action} ${f}->${t} as ${actor}`);
    }
    const ev = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'trips.departure.status_changed' AND payload->>'departureId' = $2`, [A.tenantId, D]);
    out("mix status audit", { statusChanges, illegal: bad, outboxStatusChanged: ev[0]?.n });
    const ov = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripResourceUse" a JOIN "TripResourceUse" b ON a."resourceId" = b."resourceId" AND a.id < b.id AND a.active AND b.active AND a."startsAt" < b."endsAt" AND b."startsAt" < a."endsAt" WHERE a."tenantId" = $1`, [A.tenantId]);
    out("mix overlapping active uses", ov[0]?.n, "E row", await depRow(E).then((r) => ({ status: r?.status, version: r?.version })));
  }

  // ═════════ 4. ทรัพยากร ═════════
  if (only === "all" || only === "res") {
    const B1 = await res("เรือบี1");
    const X = await mkDep(P1, "2027-09-01", 540, { resourceIds: [B1] }); // 09:00–13:00
    const tryDep = (p: { id: string; opt: string }, min: number, extra: Rec = {}) => call("createDeparture", A.ctx, { unitId: A.unitId, productId: p.id, optionId: p.opt, localDate: "2027-09-01", departTimeMin: min, capacity: 10, resourceIds: [B1], ...extra });
    const m: Record<string, string> = {};
    m.overlap_11 = brief(await tryDep(P2, 660));
    m.touch_after_13 = brief(await tryDep(P2, 780));
    m.contained_10_60m = brief(await tryDep(P2, 600, { durationMin: 60 }));
    m.identical_0900 = brief(await tryDep(P2, 540));
    m.touch_before_0500 = brief(await tryDep(P2, 300));
    m.containing_0800_8h = brief(await tryDep(P2, 480, { durationMin: 480 }));
    m.sameProduct_0901 = brief(await tryDep(P1, 541));
    out("res matrix", m);
    const r = await tryDep(P2, 660);
    out("res clash detail", { message: r.message, conflict: r.conflict, hasTitle: String(r.message).includes("เรือทดสอบ ก"), hasDate: String(r.message).includes("1/9/2027"), hasTime: String(r.message).includes("09:00") });
    // ถอนแล้วไม่ชน · มอบคืนชน
    out("res unassign X", brief(await call("unassignResource", A.ctx, { unitId: A.unitId, departureId: X, resourceId: B1 })));
    const Z = await tryDep(P2, 600);
    out("res after unassign create 10:00", brief(Z));
    const re = await call("assignResource", A.ctx, { unitId: A.unitId, departureId: X, resourceId: B1 });
    out("res reassign X", brief(re), re.conflict);
    // ทรัพยากรหน่วยอื่น / ร้านอื่น / ปิดใช้
    const uA2 = await mkUnit(A.tenantId, "a2");
    const other = await res("หน่วยอื่น", uA2);
    const B = await mkShop("b");
    const otherT = await call("createResource", B.ctx, { unitId: B.unitId, kind: "VAN", name: "ร้านบี" });
    const off = await res("ปิด");
    out("res deactivate idle", brief(await call("setResourceActive", A.ctx, { unitId: A.unitId, resourceId: off, active: false })));
    out("res foreign", {
      otherUnit: brief(await tryDep(P2, 1200, { resourceIds: [other] })),
      otherTenant: brief(await tryDep(P2, 1200, { resourceIds: [String(otherT.id)] })),
      inactive: brief(await tryDep(P2, 1200, { resourceIds: [off] })),
      assignOtherUnit: brief(await call("assignResource", A.ctx, { unitId: A.unitId, departureId: X, resourceId: other })),
      assignOtherTenant: brief(await call("assignResource", A.ctx, { unitId: A.unitId, departureId: X, resourceId: String(otherT.id) })),
      assignInactive: brief(await call("assignResource", A.ctx, { unitId: A.unitId, departureId: X, resourceId: off })),
      deactivateInUse: brief(await call("setResourceActive", A.ctx, { unitId: A.unitId, resourceId: B1, active: false })),
    });
    // ย้ายเวลาเข้าช่วงชน ⇒ ไม่เปลี่ยนอะไรเลย
    const B2 = await res("เรือบี2");
    const Y1 = await mkDep(P1, "2027-09-02", 540, { resourceIds: [B2] });
    const Y2 = await mkDep(P2, "2027-09-02", 780, { resourceIds: [B2] });
    const before = await depRow(Y2);
    const mv = await call("updateDeparture", A.ctx, { unitId: A.unitId, departureId: Y2, departTimeMin: 720, minPax: 3 });
    const after = await depRow(Y2);
    out("res move into clash", brief(mv), { unchanged: fmt(before) === fmt(after), minPaxAfter: after?.minPax });
    // ยกเลิก ⇒ ปล่อยทรัพยากร
    out("res cancel Y1", brief(await call("cancelDeparture", A.ctx, { unitId: A.unitId, departureId: Y1, reason: "ทดสอบยกเลิก" })));
    out("res after cancel move Y2 to 09:00", brief(await call("updateDeparture", A.ctx, { unitId: A.unitId, departureId: Y2, departTimeMin: 540 })));
    // 10 ทางพร้อมกัน: createDeparture ทับกันใช้เรือเดียว
    const B3 = await res("เรือบี3");
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => call("createDeparture", A.ctx, { unitId: A.unitId, productId: P1.id, optionId: P1.opt, localDate: "2027-09-03", departTimeMin: 540 + i * 10, capacity: 10, resourceIds: [B3] })));
    const cnt: Record<string, number> = {};
    for (const x of rs) cnt[brief(x).replace(/\(.*$/, "")] = (cnt[brief(x).replace(/\(.*$/, "")] ?? 0) + 1;
    const loser = rs.find((x) => x.ok !== true);
    const madeRows = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripDeparture" WHERE "tenantId" = $1 AND "localDate" = '2027-09-03'`, [A.tenantId]);
    out("res 10x create same boat", cnt, { departureRows: madeRows[0]?.n, loserMsg: loser?.message, loserConflict: !!loser?.conflict });
    // 10 ทางพร้อมกัน: ย้ายเวลา 10 รอบ (เรือเดียว ช่องไม่ทับ) เข้าช่องเดียวกัน
    const B4 = await res("เรือบี4");
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) ids.push(await mkDep(P2, "2027-09-04", i * 120, { resourceIds: [B4], durationMin: 60 }));
    const mvs = await Promise.all(ids.map((id) => call("updateDeparture", A.ctx, { unitId: A.unitId, departureId: id, departTimeMin: 1380 - 0, durationMin: 30 })));
    const c2: Record<string, number> = {};
    for (const x of mvs) c2[brief(x).replace(/\(.*$/, "")] = (c2[brief(x).replace(/\(.*$/, "")] ?? 0) + 1;
    const ov = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripResourceUse" a JOIN "TripResourceUse" b ON a."resourceId" = b."resourceId" AND a.id < b.id AND a.active AND b.active AND a."startsAt" < b."endsAt" AND b."startsAt" < a."endsAt" WHERE a."tenantId" = $1`, [A.tenantId]);
    const mism = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripResourceUse" u JOIN "TripDeparture" d ON d.id = u."departureId" WHERE u."tenantId" = $1 AND u.active AND (u."startsAt" <> d."startsAt" OR u."endsAt" <> d."endsAt")`, [A.tenantId]);
    out("res 10x move into one slot", c2, { overlappingActiveUses: ov[0]?.n, useTimeMismatch: mism[0]?.n });
    // กฎที่อ้างทรัพยากรซึ่งถูกปิดใช้ภายหลัง ⇒ materialize?
    const B5 = await res("เรือบี5");
    const s = await call("createSchedule", A.ctx, { unitId: A.unitId, productId: P1.id, optionId: P1.opt, rule: { kind: "DAILY" }, departTimeMin: 600, capacity: 10, resourceIds: [B5], dateFrom: "2027-10-01", dateTo: "2027-10-03" });
    out("res schedule w/ B5", brief(s), "deactivate B5:", brief(await call("setResourceActive", A.ctx, { unitId: A.unitId, resourceId: B5, active: false })));
    const mat = await call("materializeSchedule", A.ctx, { unitId: A.unitId, scheduleId: s.id }, { now: new Date("2027-10-01T00:00:00+07:00") });
    const usesB5 = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripResourceUse" WHERE "resourceId" = $1 AND active`, [B5]);
    out("res materialize with inactive resource", brief(mat), { created: Array.isArray(mat.created) ? mat.created.length : null, activeUsesOfInactiveB5: usesB5[0]?.n });
  }

  // ═════════ 5. ผังสถานะ fuzz ═════════
  if (only === "all" || only === "sm") {
    const st = await mkUser(A.tenantId, "ss", "STAFF", [A.unitId], ["trips.departure.view", "trips.departure.status"]);
    const se = await mkUser(A.tenantId, "se", "STAFF", [A.unitId], ["trips.departure.view", "trips.departure.edit"]);
    const sv = await mkUser(A.tenantId, "sv", "STAFF", [A.unitId], ["trips.departure.view"]);
    const actors: [string, Ctx, boolean][] = [["owner", A.ctx, true], ["staffStatus", { tenantId: A.tenantId, actorUserId: st.userId }, true], ["staffEdit", { tenantId: A.tenantId, actorUserId: se.userId }, false], ["staffView", { tenantId: A.tenantId, actorUserId: sv.userId }, false]];
    const SS = ["OPEN", "GUARANTEED", "FULL", "CLOSED", "CANCELLED"];
    const mism: string[] = [];
    let n = 0;
    const D = await mkDep(P1, "2027-11-20", 540);
    const Dp = await mkDep(P1, "2027-11-21", 540);
    const pastNow = new Date("2027-11-21T05:00:00Z"); // หลังรอบ Dp เริ่ม
    for (const [an, ctx, can] of actors) {
      for (const from of SS) {
        for (const to of SS) {
          for (const [dep, now, past] of [[D, undefined, false], [Dp, pastNow, true]] as const) {
            await q(`UPDATE "TripDeparture" SET status = $2 WHERE id = $1`, [dep, from]);
            const r = await call("setDepartureStatus", ctx, { unitId: A.unitId, departureId: dep, status: to }, now ? { now } : undefined);
            let exp: string;
            if (!can) exp = "FORBIDDEN";
            else if (to === "FULL" || to === "CANCELLED") exp = "FORBIDDEN_TRANSITION";
            else if (from === to) exp = "BAD_STATE";
            else if (!legal(from, to, "STAFF")) exp = "FORBIDDEN_TRANSITION";
            else if (past && ((from === "OPEN" && to === "GUARANTEED") || (from === "GUARANTEED" && to === "OPEN") || (from === "CLOSED" && to === "OPEN"))) exp = "PAST_DEPARTURE";
            else exp = "ok";
            const got = r.ok === true ? "ok" : String(r.code ?? brief(r));
            const row = await depRow(dep);
            const stOk = got === "ok" ? row?.status === to : row?.status === from;
            n++;
            if (got !== exp || !stOk) mism.push(`${an} ${from}->${to}${past ? " (past)" : ""}: exp ${exp} got ${got} row=${row?.status}`);
          }
        }
        // ยกเลิก
        await q(`UPDATE "TripDeparture" SET status = $2 WHERE id = $1`, [D, from]);
        const c = await call("cancelDeparture", ctx, { unitId: A.unitId, departureId: D, reason: "ทดสอบ" });
        const exp = !can ? "FORBIDDEN" : from === "CANCELLED" ? "FORBIDDEN_TRANSITION" : "ok";
        const got = c.ok === true ? "ok" : String(c.code ?? brief(c));
        if (got !== exp) mism.push(`${an} cancel from ${from}: exp ${exp} got ${got}`);
        n++;
      }
    }
    out("sm fuzz", { calls: n, mismatches: mism });
    // ยกเลิกรอบที่เริ่มไปแล้ว (ผ่านไปแล้ว) — ผังไม่มีเงื่อนไข
    await q(`UPDATE "TripDeparture" SET status = 'OPEN' WHERE id = $1`, [Dp]);
    out("sm cancel past departure", brief(await call("cancelDeparture", A.ctx, { unitId: A.unitId, departureId: Dp, reason: "ทดสอบ" }, { now: new Date("2028-01-01T00:00:00Z") })));
    // ขั้นต่ำ: ยืนยันครั้งเดียว · event เดียว · GUARANTEED ไม่ย้อน
    const M = await mkDep(P1, "2027-12-10", 540, { minPax: 4 });
    const M2 = await mkDep(P2, "2027-12-10", 540, { minPax: 4 });
    await q(`UPDATE "TripDeparture" SET sold = 4 WHERE id = $1`, [M]);
    await q(`UPDATE "TripDeparture" SET sold = 1 WHERE id = $1`, [M2]);
    const now = new Date("2027-12-09T12:00:00Z");
    const pr = await Promise.all([
      ...Array.from({ length: 6 }, () => call("evaluateMinPax", A.ctx, { unitId: A.unitId }, { now })),
      ...Array.from({ length: 3 }, async () => { try { return { ok: true, job: await (T.runMinPaxCheck as (n: Date, o: Rec) => Promise<unknown>)(now, { tenantIds: [A.tenantId] }) } as Rec; } catch (e) { return { THROW: String(e) } as Rec; } }),
    ]);
    out("sm minpax parallel", pr.map((x) => (x.job ? `job ${fmt(x.job)}` : brief(x))));
    const evs = await q(`SELECT type, payload->>'departureId' AS d, count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND payload->>'departureId' = ANY($2) AND type IN ('trips.departure.status_changed','trips.departure.below_min') GROUP BY 1,2`, [A.tenantId, [M, M2]]);
    out("sm minpax events", evs.map((e) => `${e.d === M ? "M" : "M2"} ${e.type} x${e.n}`), "M status", (await depRow(M))?.status);
    const auds = await q(`SELECT "actorType", "actorId" FROM "AuditLog" WHERE "targetId" = $1 AND action = 'trips.departure.status'`, [M]);
    out("sm minpax audit actor", auds);
    await q(`UPDATE "TripDeparture" SET sold = 0 WHERE id = $1`, [M]);
    await call("evaluateMinPax", A.ctx, { unitId: A.unitId }, { now: new Date("2027-12-10T01:00:00Z") });
    out("sm guaranteed stays after sold drop", (await depRow(M))?.status);
    // หลังถึงขั้นต่ำภายหลัง M2 ⇒ GUARANTEED ในรอบถัดไป
    await q(`UPDATE "TripDeparture" SET sold = 4 WHERE id = $1`, [M2]);
    await call("evaluateMinPax", A.ctx, { unitId: A.unitId }, { now: new Date("2027-12-09T13:00:00Z") });
    out("sm M2 later reaches min", (await depRow(M2))?.status);
  }
} catch (e) {
  exit = 1;
  console.error("PROBE ERROR", e);
} finally {
  await cleanup().catch((e) => console.log("cleanup err", e));
  await endPool();
  process.exit(exit);
}
void rid; void mkTenant; void insertRow;
