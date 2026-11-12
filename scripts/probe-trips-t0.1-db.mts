// probe-trips-t0.1-db.mts — hunter T0.1: tenantDb 33 โมเดล · CHECK/unique/EXCLUDE ด้วย SQL ตรง · SellCounter 200 ทาง
import pg from "pg";
import { boot, cleanup, cols, checksOf, errMsg, fmt, insertRow, mkDeparture, mkProduct, mkTenant, mkUnit, out, pool, q, rid, tryCode, type Rec } from "./probe-trips-t0.1-lib.mjs";
boot("probe-trips-t0.1-db");
const DB = (await import("@/lib/core/db")) as unknown as Rec;
const tenantDb = DB.tenantDb as (c: Rec) => Rec;
const SCOPE = (await import("@/lib/core/scope")) as unknown as Rec;

const MODELS = ["SellBasket", "SellCounter", "TripProduct", "TripOption", "TripPaxType", "TripExtra", "TripPassThroughEvidence", "TripPickupZone", "TripSchedule", "TripDeparture", "TripResource", "TripResourceUse", "TripVehicleRun", "TripSeason", "TripPrice", "TripPriceRule", "TripHold", "TripBooking", "TripBookingItem", "TripPassenger", "TripPaymentDue", "TripMoneyEvent", "TripRefundRequest", "TripDocument", "TripDocView", "TripPdpaRequest", "TripCashClose", "TripCheckin", "TripWaitlist", "TripCost", "TripUnit", "TripImportBatch", "TripLinkStat"];
const lc = (s: string) => s[0].toLowerCase() + s.slice(1);
type Del = Record<string, (a?: unknown) => Promise<unknown>>;
const md = (c: Rec, m: string) => c[lc(m)] as Del;
const DAY = 86_400_000;

try {
  const tA = await mkTenant("a"), tB = await mkTenant("b");
  const uA = await mkUnit(tA, "a"), uA2 = await mkUnit(tA, "a2"), uB = await mkUnit(tB, "b");
  const pA = await mkProduct(tA, uA);
  const dA = await mkDeparture(tA, uA, pA, 30);
  const scopeMap = (SCOPE.SCOPE ?? SCOPE.MODEL_SCOPE ?? SCOPE.scopeOf ?? null) as unknown;
  out("0 scope exports", Object.keys(SCOPE).join(","), typeof scopeMap);

  // ── 1. tenantDb ทุกโมเดล: แถวของ A (SQL ตรง) ผ่าน client ของ B / A-หน่วยอื่น ──
  const res: string[] = [];
  const overrides: Record<string, Rec> = {
    TripProduct: { productType: "TOUR", sourceKind: "OWN", currency: "THB", status: "DRAFT" },
    TripExtra: { passThrough: false, currency: "THB", taxKind: "NONE" },
    TripResourceUse: { startsAt: new Date(Date.now() + 90 * DAY), endsAt: new Date(Date.now() + 90 * DAY + 3_600_000), active: false },
    TripDeparture: { productId: rid("px"), startsAt: new Date(Date.now() + 77 * DAY), endsAt: new Date(Date.now() + 77 * DAY + 3_600_000), localDate: "2027-09-09" },
  };
  for (const m of MODELS) {
    const names = new Set((await cols(m)).map((c) => c.column_name));
    const id = rid(m.slice(0, 6));
    let insErr = "";
    try { await insertRow(m, { id, tenantId: tA, ...(names.has("unitId") ? { unitId: uA } : {}), updatedAt: new Date(), ...(overrides[m] ?? {}) }); } catch (e) { insErr = errMsg(e); }
    if (insErr) { res.push(`${m}: insert ล้ม ${insErr.slice(0, 120)}`); continue; }
    const hasUnit = names.has("unitId") && m !== "SellBasket" && m !== "SellCounter";
    const clients: [string, Rec][] = [["B", tenantDb({ tenantId: tB, unitId: uB })], ...(hasUnit ? [["A2", tenantDb({ tenantId: tA, unitId: uA2 })] as [string, Rec]] : [])];
    const snap = async () => JSON.stringify((await q(`SELECT row_to_json(x) AS j FROM "${m}" x WHERE id=$1`, [id]))[0]?.j ?? null);
    const before = await snap();
    const UPD = names.has("updatedAt") ? { updatedAt: new Date(0) } : { tenantId: tA };
    for (const [tag, c] of clients) {
      const d = md(c, m);
      const leaks: string[] = [];
      try {
        if (Number(await d.count({ where: { id } })) !== 0) leaks.push("count");
        if (((await d.findMany({ where: { id } })) as unknown[]).length) leaks.push("findMany");
        if (await d.findFirst({ where: { id } })) leaks.push("findFirst");
        if (await d.findUnique({ where: { id } })) leaks.push("findUnique");
        if (await d.findUnique({ where: { id }, select: { id: true } })) leaks.push("findUnique(select id)");
        const ag = (await d.aggregate({ where: { id }, _count: { _all: true } })) as Rec;
        if (Number((ag._count as Rec)?._all) !== 0) leaks.push("aggregate");
        if (Number(((await d.updateMany({ where: { id }, data: UPD })) as Rec).count) !== 0) leaks.push("updateMany");
        if (Number(((await d.deleteMany({ where: { id } })) as Rec).count) !== 0) leaks.push("deleteMany");
        try { await d.update({ where: { id }, data: UPD }); leaks.push("update"); } catch { /* ok */ }
        try { await d.delete({ where: { id } }); leaks.push("delete"); } catch { /* ok */ }
        try { await d.upsert({ where: { id }, create: { id: rid("ups") }, update: UPD }); leaks.push("upsert-no-throw"); } catch { /* ok */ }
      } catch (e) { leaks.push(`THROW ${errMsg(e).slice(0, 100)}`); }
      if ((await snap()) !== before) leaks.push("row changed");
      if (leaks.length) res.push(`${m}/${tag}: ${leaks.join(",")}`);
    }
    // ไม่ส่ง unitId สำหรับโมเดล unit ⇒ ต้องโยน
    if (hasUnit) { try { await md(tenantDb({ tenantId: tA }), m).count(); res.push(`${m}: ไม่ส่ง unitId แต่ไม่โยน`); } catch { /* ok */ } }
  }
  out("1 tenantDb 33 models", res.length ? res : "ไม่รั่ว (ทุกโมเดล · ทุก operation)");
  // create ผ่าน B โดยยัด tenantId/unitId ของ A
  const cid = rid("pdpa");
  try { await md(tenantDb({ tenantId: tB, unitId: uB }), "TripPdpaRequest").create({ data: { id: cid, tenantId: tA, unitId: uA, kind: "ERASE", status: "RECEIVED", dueAt: new Date() } }); } catch (e) { out("1b create", errMsg(e)); }
  out("1b create via B with data.tenantId=A", await q(`SELECT "tenantId"=$2 AS is_b, "unitId"=$3 AS is_ub FROM "TripPdpaRequest" WHERE id=$1`, [cid, tB, uB]));
  // update ของแถวตัวเองย้ายไปร้าน A (data ไม่ถูกกรอง)
  const mv = rid("pdpa");
  await md(tenantDb({ tenantId: tB, unitId: uB }), "TripPdpaRequest").create({ data: { id: mv, kind: "ERASE", status: "RECEIVED", dueAt: new Date() } });
  let mvErr = "";
  try { await md(tenantDb({ tenantId: tB, unitId: uB }), "TripPdpaRequest").update({ where: { id: mv }, data: { tenantId: tA, unitId: uA } }); } catch (e) { mvErr = errMsg(e); }
  out("1c B updates own row data.tenantId=A", mvErr || "no error", await q(`SELECT "tenantId"=$2 AS now_in_a FROM "TripPdpaRequest" WHERE id=$1`, [mv, tA]));

  // ── 2. CHECK ≥ 0 ทุกคอลัมน์จำนวนเต็ม (ยกเว้นที่ใบสั่งยกเว้น) + ข้อความสถานะ/ชนิดที่ไม่มี CHECK ──
  const intNoCheck: string[] = [], textNoCheck: string[] = [];
  for (const m of MODELS) {
    const defs = (await checksOf(m)).join(" | ");
    for (const c of await cols(m)) {
      const has = new RegExp(`"?${c.column_name}"?\\s*>=\\s*0`).test(defs);
      if (["integer", "bigint"].includes(c.data_type) && !has && !/^(manualDeltaSatang|varianceSatang)$/.test(c.column_name)) intNoCheck.push(`${m}.${c.column_name}`);
      if (c.data_type === "text" && /(status|kind|type|channel|basis|mode|result|^by$|role|source|action|currency|method|reason|scope)$/i.test(c.column_name) && !new RegExp(`"?${c.column_name}"?[^|]*ANY|"?${c.column_name}"?\\s*=\\s*'`).test(defs)) textNoCheck.push(`${m}.${c.column_name}`);
    }
  }
  out("2a int cols without >=0 CHECK", intNoCheck);
  out("2b status-like text cols without CHECK", textNoCheck);

  // ── 3. เวลา/ช่วง ──
  const h = (n: number) => new Date(Date.now() + 120 * DAY + n * 3_600_000);
  const res1 = rid("res");
  const ru = (tid: string, uid: string, rsc: string, s: Date, e: Date, active = true) => () => insertRow("TripResourceUse", { tenantId: tid, unitId: uid, resourceId: rsc, departureId: dA, startsAt: s, endsAt: e, active, updatedAt: new Date() });
  out("3a EXCLUDE", {
    base: await tryCode(ru(tA, uA, res1, h(0), h(4))),
    overlap: await tryCode(ru(tA, uA, res1, h(3), h(5))),
    touching: await tryCode(ru(tA, uA, res1, h(4), h(6))),
    contained: await tryCode(ru(tA, uA, res1, h(1), h(2))),
    emptyRangeInside: await tryCode(ru(tA, uA, res1, h(2), h(2))),
    inverted: await tryCode(ru(tA, uA, res1, h(10), h(9))),
    otherTenantSameResource: await tryCode(ru(tB, uB, res1, h(1), h(3))),
  });
  const inact = rid("ru");
  await insertRow("TripResourceUse", { id: inact, tenantId: tA, unitId: uA, resourceId: res1, departureId: dA, startsAt: h(1), endsAt: h(3), active: false, updatedAt: new Date() });
  out("3b activate overlapping inactive", await tryCode(() => q(`UPDATE "TripResourceUse" SET active=true WHERE id=$1`, [inact])));
  const dep = (extra: Rec) => () => insertRow("TripDeparture", { tenantId: tA, unitId: uA, productId: pA, localDate: "2027-10-01", startsAt: new Date("2027-10-01T02:00:00Z"), endsAt: new Date("2027-10-01T08:00:00Z"), status: "OPEN", capacity: 10, updatedAt: new Date(), ...extra });
  out("3c TripDeparture", {
    endsBeforeStart: await tryCode(dep({ startsAt: new Date("2027-10-02T08:00:00Z"), endsAt: new Date("2027-10-02T02:00:00Z"), localDate: "2027-10-02" })),
    soldGtCapacity: await tryCode(dep({ startsAt: new Date("2027-10-03T02:00:00Z"), localDate: "2027-10-03", capacity: 1, sold: 5 })),
    capacity0: await tryCode(dep({ startsAt: new Date("2027-10-04T02:00:00Z"), localDate: "2027-10-04", capacity: 0 })),
    capacityNeg: await tryCode(dep({ startsAt: new Date("2027-10-05T02:00:00Z"), localDate: "2027-10-05", capacity: -1 })),
    localDateMismatch: await tryCode(dep({ startsAt: new Date("2027-10-06T02:00:00Z"), localDate: "1999-01-01" })),
    sameStartOptX: await tryCode(dep({ startsAt: new Date("2027-10-07T02:00:00Z"), localDate: "2027-10-07", optionId: "optX" })),
    sameStartOptY: await tryCode(dep({ startsAt: new Date("2027-10-07T02:00:00Z"), localDate: "2027-10-07", optionId: "optY" })),
    sameStartNull1: await tryCode(dep({ startsAt: new Date("2027-10-07T02:00:00Z"), localDate: "2027-10-07" })),
    sameStartNull2: await tryCode(dep({ startsAt: new Date("2027-10-07T02:00:00Z"), localDate: "2027-10-07" })),
    schedSameDay1: await tryCode(dep({ scheduleId: "schX", startsAt: new Date("2027-10-08T01:00:00Z"), localDate: "2027-10-08" })),
    schedSameDay2_otherTime: await tryCode(dep({ scheduleId: "schX", startsAt: new Date("2027-10-08T06:00:00Z"), localDate: "2027-10-08" })),
  });
  // NND อื่น
  const price = (extra: Rec) => () => insertRow("TripPrice", { tenantId: tA, unitId: uA, productId: pA, currency: "THB", amountMinor: 0, updatedAt: new Date(), ...extra });
  const link = (extra: Rec) => () => insertRow("TripLinkStat", { tenantId: tA, unitId: uA, day: "2027-01-01", channel: "WEB", updatedAt: new Date(), ...extra });
  out("3d NND", {
    priceAllNull1_zero: await tryCode(price({})), priceAllNull2: await tryCode(price({})), priceUSD: await tryCode(price({ currency: "USD" })), priceNeg: await tryCode(price({ currency: "EUR", amountMinor: -1 })),
    linkNull1: await tryCode(link({})), linkNull2: await tryCode(link({})), linkSame: await tryCode(link({ linkId: "L1" })), linkSame2: await tryCode(link({ linkId: "L1" })), linkBadChannel: await tryCode(link({ channel: "web", day: "2027-01-02" })),
  });

  // ── 4. SellCounter 200 ทาง: 2 ร้าน × 3 ชุด × 2 งวด (งวดใหม่แข่งกันสร้างแถวแรก) ──
  const big = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 40 });
  const jobs: { t: string; s: string; p: string }[] = [];
  for (let i = 0; i < 200; i++) jobs.push({ t: i % 2 ? tA : tB, s: ["TR", "TK", "LB"][i % 3], p: i % 5 < 2 ? "6911" : "6912" });
  const t0 = Date.now();
  const got = await Promise.allSettled(jobs.map(async (j) => {
    const c = await big.connect();
    try {
      await c.query("BEGIN");
      const r = await c.query<{ seq: number }>(`INSERT INTO "SellCounter" ("id","tenantId","series","period","seq") VALUES ($1,$2,$3,$4,1) ON CONFLICT ("tenantId","series","period") DO UPDATE SET "seq" = "SellCounter"."seq" + 1 RETURNING "seq"`, [rid("sc"), j.t, j.s, j.p]);
      await c.query("COMMIT");
      return { ...j, seq: r.rows[0].seq };
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
  }));
  await big.end();
  const fails = got.filter((g) => g.status === "rejected").map((g) => errMsg((g as PromiseRejectedResult).reason));
  const per = new Map<string, number[]>();
  for (const g of got) if (g.status === "fulfilled") { const k = `${g.value.t === tA ? "A" : "B"}|${g.value.s}|${g.value.p}`; per.set(k, [...(per.get(k) ?? []), g.value.seq]); }
  const bad: string[] = [];
  for (const [k, v] of per) { const s = [...v].sort((a, b) => a - b); if (!s.every((x, i) => x === i + 1)) bad.push(`${k}: ${s.join(",")}`); }
  const rows = await q<{ tenantId: string; series: string; period: string; seq: number }>(`SELECT "tenantId", series, period, seq FROM "SellCounter" WHERE "tenantId" = ANY($1::text[])`, [[tA, tB]]);
  const rowBad = rows.filter((r) => r.seq !== per.get(`${r.tenantId === tA ? "A" : "B"}|${r.series}|${r.period}`)?.length);
  out("4 SellCounter 200", `${Date.now() - t0}ms · fail ${fails.length} ${fmt(fails.slice(0, 2))} · keys ${per.size} · gaps/dups ${bad.length} ${fmt(bad.slice(0, 3))} · rows ${rows.length} mismatched ${rowBad.length}`);
  out("4b seq overflow / negative", {
    neg: await tryCode(() => q(`INSERT INTO "SellCounter" ("id","tenantId","series","period","seq") VALUES ($1,$2,'NEG','6911',-1)`, [rid("sc"), tA])),
    max: await tryCode(() => q(`INSERT INTO "SellCounter" ("id","tenantId","series","period","seq") VALUES ($1,$2,'MAX','6911',2147483647) ON CONFLICT ("tenantId","series","period") DO UPDATE SET seq = "SellCounter".seq + 1`, [rid("sc"), tA])),
    maxPlus: await tryCode(() => q(`INSERT INTO "SellCounter" ("id","tenantId","series","period","seq") VALUES ($1,$2,'MAX','6911',1) ON CONFLICT ("tenantId","series","period") DO UPDATE SET seq = "SellCounter".seq + 1`, [rid("sc"), tA])),
  });
  void pool;
} catch (e) {
  console.log("FATAL", errMsg(e), e instanceof Error ? e.stack?.split("\n").slice(0, 4).join(" | ") : "");
} finally {
  await cleanup();
  process.exit(0);
}
