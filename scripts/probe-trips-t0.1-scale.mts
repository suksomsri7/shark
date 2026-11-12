// probe-trips-t0.1-scale.mts — hunter T0.1: entitiesOfUnit / settingsDiff / ฟอร์ม / RESET_ALL กับรอบจำนวนมาก (20,000 → 40,000)
import { boot, cleanup, errMsg, mkProduct, mkTenant, mkUnit, mkUser, out, q, STAMP, type Rec } from "./probe-trips-t0.1-lib.mjs";
boot("probe-trips-t0.1-scale");
const S = (await import("@/lib/core/settings")) as unknown as Rec;
const SVC = (await import("@/lib/core/settings/service")) as unknown as Rec;
const DB = (await import("@/lib/core/db")) as unknown as Rec;
const call = (n: string, ...a: unknown[]) => ((S[n] ?? SVC[n]) as (...x: unknown[]) => Promise<unknown>)(...a);
const time = async (label: string, f: () => Promise<unknown>) => {
  const t0 = Date.now();
  try { const r = await f(); const sz = Array.isArray(r) ? `len ${r.length}` : (r && typeof r === "object" && "ok" in (r as Rec)) ? `ok=${String((r as Rec).ok)} ${String((r as Rec).code ?? "")} removed=${String((r as Rec).removed ?? "")}` : r && typeof r === "object" && "groups" in (r as Rec) ? `groups ${((r as Rec).groups as unknown[]).length}` : typeof r; out(label, `${Date.now() - t0}ms · ${sz}`); }
  catch (e) { out(label, `${Date.now() - t0}ms · THROW ${errMsg(e).slice(0, 220)}`); }
};
const addDeps = async (tid: string, uid: string, pid: string, from: number, n: number) => {
  const t0 = Date.now();
  await q(`INSERT INTO "TripDeparture" (id, "tenantId", "unitId", "productId", "localDate", "startsAt", "endsAt", status, capacity, "updatedAt")
    SELECT 'trips-hunt-dep-${STAMP}-' || g, $1, $2, $3, DATE '2027-06-01', TIMESTAMP '2027-06-01 00:00' + (g || ' minutes')::interval, TIMESTAMP '2027-06-01 08:00' + (g || ' minutes')::interval, 'OPEN', 20, now()
    FROM generate_series($4::int, $5::int) g`, [tid, uid, pid, from, from + n - 1]);
  out("insert", `${n} departures ${Date.now() - t0}ms`);
};
const addRows = async (tid: string, uid: string, uidUser: string, from: number) => {
  await q(`INSERT INTO "SettingValue" (id, "tenantId", key, scope, "scopeId", value, "effectiveFrom", "setById", "updatedAt")
    SELECT 'trips-hunt-sv-${STAMP}-' || $3::int || '-' || g, $1, 'trips.pay.balanceDueDaysBefore', 'DEPARTURE', 'trips-hunt-dep-${STAMP}-' || (g * 97 % 20000 + 1), to_jsonb(g % 30), TIMESTAMP '1970-01-01', $2, now() FROM generate_series(1, 50) g
    ON CONFLICT DO NOTHING`, [tid, uidUser, from]);
  await q(`INSERT INTO "SettingValue" (id, "tenantId", key, scope, "scopeId", value, "effectiveFrom", "setById", "updatedAt") VALUES ($1,$2,'trips.sell.holdMinutes','UNIT',$3,'45'::jsonb,TIMESTAMP '1970-01-01',$4,now()) ON CONFLICT DO NOTHING`, [`trips-hunt-svu-${STAMP}-${from}`, tid, uid, uidUser]);
};

try {
  const tA = await mkTenant("s");
  const ctx = { tenantId: tA };
  const uA = await mkUnit(tA, "s");
  const OWN = await mkUser(tA, "sown", "OWNER", ["*"], {});
  const p = await mkProduct(tA, uA);
  out("apply", await call("applyTemplate", OWN, ctx, { unitId: uA, domain: "trips", templateKey: "DAY_TOUR", overwrite: "KEEP_CUSTOM" }));
  for (const [round, n, from] of [[1, 20_000, 1], [2, 20_000, 20_001]] as const) {
    await addDeps(tA, uA, p, from, n);
    await addRows(tA, uA, OWN.userId, round);
    await time(`R${round} entitiesOfUnit`, () => call("entitiesOfUnit", DB.prisma, tA, uA));
    await time(`R${round} settingsDiff`, () => call("settingsDiff", ctx, { unitId: uA, domain: "trips" }));
    await time(`R${round} loadSettingsForm UNIT`, () => call("loadSettingsForm", OWN, ctx, { domains: ["trips"], unitId: uA, unitType: "TRIPS" }));
    await time(`R${round} loadSettingsForm PRODUCT`, () => call("loadSettingsForm", OWN, ctx, { domains: ["trips"], unitId: uA, unitType: "TRIPS", scope: "PRODUCT", scopeId: p }));
    await time(`R${round} setSettings ladder@UNIT`, () => call("setSettings", OWN, ctx, [{ key: "trips.cancel.ladder", scope: "UNIT", scopeId: uA, value: [{ fromDaysBefore: 60, refundPct: 100 }, { fromDaysBefore: 30, refundPct: 100 }, { fromDaysBefore: 15, refundPct: 50 }, { fromDaysBefore: 0, refundPct: 0 }] }]));
    await time(`R${round} applyTemplate RESET_ALL`, () => call("applyTemplate", OWN, ctx, { unitId: uA, domain: "trips", templateKey: "DAY_TOUR", overwrite: "RESET_ALL" }));
    const left = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "SettingValue" WHERE "tenantId"=$1`, [tA]);
    out(`R${round} SettingValue left after RESET_ALL`, left[0]?.n);
  }
} catch (e) {
  console.log("FATAL", errMsg(e));
} finally {
  await cleanup();
  process.exit(0);
}
