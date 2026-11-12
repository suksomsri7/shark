// probe-trips-t0.3-edge.mts — hunter T0.3: (3) เขตเวลา/DST (6) แยกร้าน/หน่วย (9) input ร้าย
import { createHash } from "node:crypto";
import { boot, call, brief, rawLeak, out, fmt, q, mkShop, mkProd, mkUnit, mkUser, cleanup, endPool, mods, type Rec, type Ctx } from "./probe-trips-t0.3-lib.mjs";

boot("probe-t0.3-edge");
const sel = (process.argv[2] ?? "all").split(",");
const want = (k: string) => sel.includes("all") || sel.includes(k);
let exit = 0;
try {
  const { T } = await mods();
  const L2U = T.localToUtc as (tz: string, ymd: string, m: number) => Date;
  const U2L = T.utcToLocal as (tz: string, d: Date) => { ymd: string; minutes: number };
  const addD = T.addDaysYmd as (ymd: string, n: number) => string;

  // ═════════ 3. เขตเวลา ═════════
  if (want("tz")) {
    const zones = ["Asia/Bangkok", "Europe/Berlin", "America/New_York", "America/Havana", "Australia/Lord_Howe", "America/Santiago", "Pacific/Chatham", "Asia/Tehran", "Africa/Casablanca"];
    const summary: Rec = {};
    for (const tz of zones) {
      const off = (ms: number) => { const l = U2L(tz, new Date(ms)); return Date.UTC(+l.ymd.slice(0, 4), +l.ymd.slice(5, 7) - 1, +l.ymd.slice(8, 10)) + l.minutes * 60000 - Math.floor(ms / 60000) * 60000; };
      const trans: string[] = [];
      for (let d = "2027-01-01"; d < "2028-01-01"; d = addD(d, 1)) {
        const a = Date.parse(`${d}T00:00:00Z`);
        if (off(a - 86400000) !== off(a + 86400000) || off(a) !== off(a + 2 * 86400000)) trans.push(d);
      }
      const bad: string[] = [];
      let gapShift = 0, foldFirst = 0, foldSecond = 0;
      const days = [...new Set(trans.flatMap((d) => [addD(d, -1), d, addD(d, 1)]))];
      for (const ymd of days) {
        let prev = -Infinity;
        for (let m = 0; m < 1440; m++) {
          const u = L2U(tz, ymd, m);
          const b = U2L(tz, u);
          if (u.getTime() < prev) bad.push(`${ymd} ${m} non-monotonic`);
          prev = u.getTime();
          if (b.ymd === ymd && b.minutes === m) {
            // fold: เวลาเดียวกันเกิดสองครั้ง ⇒ ต้องเป็นตัวแรก
            const earlier = new Date(u.getTime() - 3600000), e2 = new Date(u.getTime() - 1800000);
            const dup = [earlier, e2].some((x) => { const y = U2L(tz, x); return y.ymd === ymd && y.minutes === m; });
            if (dup) foldSecond++; else if ([new Date(u.getTime() + 3600000), new Date(u.getTime() + 1800000)].some((x) => { const y = U2L(tz, x); return y.ymd === ymd && y.minutes === m; })) foldFirst++;
          } else if (b.ymd === ymd && b.minutes > m && b.minutes - m <= 60) gapShift++;
          else if (b.ymd !== ymd && m < 60 && b.minutes >= 0) { // เที่ยงคืนไม่มีจริง: เลื่อนไปข้างหน้า
            if (b.ymd === addD(ymd, 1) || b.ymd > ymd) gapShift++; else bad.push(`${ymd} ${m} -> ${b.ymd} ${b.minutes}`);
          } else bad.push(`${ymd} ${m} -> ${b.ymd} ${b.minutes}`);
        }
      }
      summary[tz] = { transitions: trans.length, daysChecked: days.length, gapShift, foldFirst, foldSecond, bad: bad.slice(0, 5), badN: bad.length };
    }
    out("tz pure round-trip", summary);

    // ฐาน: ร้านเบอร์ลิน + นิวยอร์ก
    const BE = await mkShop("be", { timezone: "Europe/Berlin" });
    const NY = await mkShop("ny", { timezone: "America/New_York" });
    const pB = await mkProd(BE.tenantId, BE.unitId, "เบอร์ลิน", "ACTIVE", { durationMin: 60 });
    const pN = await mkProd(NY.tenantId, NY.unitId, "นิวยอร์ก", "ACTIVE", { durationMin: 60 });
    const NOW = new Date("2027-01-01T00:00:00Z");
    const cases: [typeof BE, typeof pB, string, number][] = [
      [BE, pB, "2027-03-28", 150], [BE, pB, "2027-03-28", 0], [BE, pB, "2027-03-28", 30], [BE, pB, "2027-03-28", 1439], [BE, pB, "2027-03-29", 30],
      [BE, pB, "2027-10-31", 150], [BE, pB, "2027-10-31", 0], [BE, pB, "2027-10-31", 1439], [BE, pB, "2027-11-01", 30],
      [NY, pN, "2027-03-14", 150], [NY, pN, "2027-03-14", 1439], [NY, pN, "2027-11-07", 90], [NY, pN, "2027-11-07", 0], [NY, pN, "2027-11-07", 1439], [NY, pN, "2027-11-08", 30],
    ];
    const res: string[] = [];
    for (const [s, p, ymd, m] of cases) {
      const r = await call("createDeparture", s.ctx, { unitId: s.unitId, productId: p.id, optionId: p.opt, localDate: ymd, departTimeMin: m, capacity: 5 }, { now: NOW });
      if (r.ok !== true) { res.push(`${ymd} ${m}: ${brief(r)}`); continue; }
      const g = (await call("getDeparture", s.ctx, { unitId: s.unitId, departureId: r.id }, { now: NOW })).departure as Rec;
      const cut = (g.cutoffs as Rec).WEB;
      const back = U2L(s === BE ? "Europe/Berlin" : "America/New_York", new Date(String(g.startsAt)));
      res.push(`${s === BE ? "BER" : "NYC"} ${ymd} ${m}m → localDate ${g.localDate} startsAt ${g.startsAt} (local ${back.ymd} ${back.minutes}m) WEB-cutoff ${cut} cutoffAt ${g.cutoffAt}`);
    }
    console.log("[tz db departures]\n" + res.join("\n"));
    // เปลี่ยนเวลาข้ามเที่ยงคืนของวันเดิม ⇒ localDate ไม่เปลี่ยน
    const d1 = await call("createDeparture", NY.ctx, { unitId: NY.unitId, productId: pN.id, optionId: pN.opt, localDate: "2027-06-10", departTimeMin: 1439, capacity: 5 }, { now: NOW });
    const u1 = await call("updateDeparture", NY.ctx, { unitId: NY.unitId, departureId: d1.id, departTimeMin: 0 }, { now: NOW });
    const g1 = (await call("getDeparture", NY.ctx, { unitId: NY.unitId, departureId: d1.id })).departure as Rec;
    out("tz update 23:59→00:00", brief(u1), { localDate: g1.localDate, startsAt: g1.startsAt, list10: ((await call("listDepartures", NY.ctx, { unitId: NY.unitId, from: "2027-06-10", to: "2027-06-10" })).items as Rec[] | undefined)?.length });
    // WEEKLY อาทิตย์ข้าม DST เบอร์ลิน 02:30
    const sw = await call("createSchedule", BE.ctx, { unitId: BE.unitId, productId: pB.id, optionId: pB.opt, rule: { kind: "WEEKLY", weekdays: [0] }, departTimeMin: 150, capacity: 5, dateFrom: "2027-03-20", dateTo: "2027-04-05" });
    const mw = await call("materializeSchedule", BE.ctx, { unitId: BE.unitId, scheduleId: sw.id }, { now: new Date("2027-03-20T00:00:00Z") });
    const rw = await q(`SELECT to_char("localDate",'YYYY-MM-DD') AS d, extract(dow from "localDate")::int AS dow, "startsAt" FROM "TripDeparture" WHERE "scheduleId" = $1 ORDER BY 1`, [sw.id]);
    out("tz weekly sunday 02:30 Berlin", brief(mw), rw.map((x) => `${x.d} dow${x.dow} ${(x.startsAt as Date).toISOString()}`));
    // opts.now ขอบ
    const BK = await mkShop("bk");
    const pK = await mkProd(BK.tenantId, BK.unitId, "กรุงเทพ");
    const at = new Date("2027-07-01T02:00:00Z"); // 09:00 ไทย
    const nb = (now: Date, m = 540) => call("createDeparture", BK.ctx, { unitId: BK.unitId, productId: pK.id, optionId: pK.opt, localDate: "2027-07-01", departTimeMin: m, capacity: 5 }, { now }).then(brief);
    out("tz now boundary createDeparture", { nowEqStart: await nb(at), nowMinus1ms: await nb(new Date(at.getTime() - 1)) });
    const ss = await call("createSchedule", BK.ctx, { unitId: BK.unitId, productId: pK.id, optionId: pK.opt, rule: { kind: "DAILY" }, departTimeMin: 0, capacity: 5, dateFrom: "2027-07-01", dateTo: "2027-07-05" });
    const m1 = await call("materializeSchedule", BK.ctx, { unitId: BK.unitId, scheduleId: ss.id }, { now: new Date("2027-06-30T16:59:59.999Z") });
    const m2 = await call("materializeSchedule", BK.ctx, { unitId: BK.unitId, scheduleId: ss.id }, { now: new Date("2027-06-30T17:00:00.000Z") });
    out("tz materialize 00:00 departures at now=23:59:59.999 / 00:00:00", { first: (m1.created as unknown[] | undefined)?.length, windowEnd1: m1.windowEnd, second: (m2.created as unknown[] | undefined)?.length, windowEnd2: m2.windowEnd });
  }

  // ═════════ 6. แยกร้าน/หน่วย ═════════
  if (want("iso")) {
    const A = await mkShop("ia");
    const B = await mkShop("ib");
    const uA2 = await mkUnit(A.tenantId, "ia2");
    const uBk = await mkUnit(A.tenantId, "iabk", {}, "BOOKING");
    const s2 = await mkUser(A.tenantId, "is2", "STAFF", [uA2], ["trips.departure.view", "trips.departure.edit", "trips.departure.status", "trips.resource.edit"]);
    const pA = await mkProd(A.tenantId, A.unitId, "เอ");
    const pB = await mkProd(B.tenantId, B.unitId, "บี");
    const NOW = new Date("2027-01-01T00:00:00Z");
    const S = String((await call("createSchedule", A.ctx, { unitId: A.unitId, productId: pA.id, optionId: pA.opt, rule: { kind: "DAILY" }, departTimeMin: 540, capacity: 5, minPax: 2, dateFrom: "2027-02-01", dateTo: "2027-02-03" })).id);
    const R = String((await call("createResource", A.ctx, { unitId: A.unitId, kind: "BOAT", name: "เรือเอ" })).id);
    const D = String((await call("createDeparture", A.ctx, { unitId: A.unitId, productId: pA.id, optionId: pA.opt, localDate: "2027-02-10", departTimeMin: 540, capacity: 5, minPax: 2, resourceIds: [R] }, { now: NOW })).id);
    const SB = String((await call("createSchedule", B.ctx, { unitId: B.unitId, productId: pB.id, optionId: pB.opt, rule: { kind: "DAILY" }, departTimeMin: 540, capacity: 5, dateFrom: "2027-02-01", dateTo: "2027-02-03" })).id);
    const RB = String((await call("createResource", B.ctx, { unitId: B.unitId, kind: "BOAT", name: "เรือบี" })).id);
    const DB = String((await call("createDeparture", B.ctx, { unitId: B.unitId, productId: pB.id, optionId: pB.opt, localDate: "2027-02-10", departTimeMin: 540, capacity: 5 }, { now: NOW })).id);
    const snap = async () => {
      const parts: unknown[] = [];
      for (const t of ["TripSchedule", "TripDeparture", "TripResource", "TripResourceUse"]) parts.push(await q(`SELECT * FROM "${t}" WHERE "tenantId" = $1 AND "unitId" = $2 ORDER BY id`, [A.tenantId, A.unitId]));
      parts.push(await q(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND "unitId" = $2`, [A.tenantId, A.unitId]));
      parts.push(await q(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = $1 AND "unitId" = $2`, [A.tenantId, A.unitId]));
      return createHash("sha1").update(fmt(parts) + JSON.stringify(parts)).digest("hex");
    };
    const h0 = await snap();
    const calls = (unitId: string, ids: { S: string; D: string; R: string; p: { id: string; opt: string } }): [string, Rec][] => [
      ["createSchedule", { unitId, productId: ids.p.id, optionId: ids.p.opt, rule: { kind: "DAILY" }, departTimeMin: 540, capacity: 5, dateFrom: "2027-03-01", dateTo: "2027-03-02" }],
      ["updateSchedule", { unitId, scheduleId: ids.S, capacity: 9 }], ["pauseSchedule", { unitId, scheduleId: ids.S }], ["resumeSchedule", { unitId, scheduleId: ids.S }],
      ["materializeSchedule", { unitId, scheduleId: ids.S }], ["listSchedules", { unitId, productId: ids.p.id }],
      ["createDeparture", { unitId, productId: ids.p.id, optionId: ids.p.opt, localDate: "2027-03-10", departTimeMin: 540, capacity: 5 }],
      ["updateDeparture", { unitId, departureId: ids.D, departTimeMin: 600 }], ["setDepartureCapacity", { unitId, departureId: ids.D, capacity: 9 }],
      ["setDepartureStatus", { unitId, departureId: ids.D, status: "CLOSED" }], ["cancelDeparture", { unitId, departureId: ids.D, reason: "ข้ามร้าน" }],
      ["getDeparture", { unitId, departureId: ids.D }], ["listDepartures", { unitId, from: "2027-02-01", to: "2027-02-28", productId: ids.p.id }],
      ["refreshDeparturePolicy", { unitId, productId: ids.p.id }], ["setDepartureStopSell", { unitId, departureId: ids.D, stopSell: { channels: [], reason: "x" } }],
      ["evaluateMinPax", { unitId }], ["createResource", { unitId, kind: "BOAT", name: "x" }], ["updateResource", { unitId, resourceId: ids.R, name: "ชื่อใหม่" }],
      ["setResourceActive", { unitId, resourceId: ids.R, active: false }], ["listResources", { unitId, includeInactive: true }],
      ["assignResource", { unitId, departureId: ids.D, resourceId: ids.R }], ["unassignResource", { unitId, departureId: ids.D, resourceId: ids.R }],
    ];
    const idsA = { S, D, R, p: pA };
    const nf = new Map<string, string>();
    for (const [f, inp] of calls("nope-unit", { S: "nope", D: "nope", R: "nope", p: { id: "nope", opt: "nope" } })) nf.set(f, brief(await call(f, A.ctx, inp, { now: new Date("2027-02-05T00:00:00Z") })));
    out("iso nonexistent-unit messages distinct", [...new Set(nf.values())]);
    const scen: [string, Ctx, string, typeof idsA][] = [
      ["B ctx + A unit + A ids", B.ctx, A.unitId, idsA],
      ["B ctx + B unit + A ids", B.ctx, B.unitId, idsA],
      ["A owner + A unit2 + unitA ids", A.ctx, uA2, idsA],
      ["A staff(unit2 only) + A unit + A ids", { tenantId: A.tenantId, actorUserId: s2.userId }, A.unitId, idsA],
      ["A user ctx w/ tenantId B + A unit", { tenantId: B.tenantId, actorUserId: A.owner.userId }, A.unitId, idsA],
      ["B ctx + B unit + mixed (B dep, A res)", B.ctx, B.unitId, { S: SB, D: DB, R, p: pB }],
      ["B ctx + B unit + mixed (A dep, B res)", B.ctx, B.unitId, { S, D, R: RB, p: pB }],
    ];
    const rep: Rec = {};
    for (const [name, ctx, unitId, ids] of scen) {
      const lines: string[] = [];
      for (const [f, inp] of calls(unitId, ids)) {
        const r = await call(f, ctx, inp, { now: new Date("2027-02-05T00:00:00Z") });
        const b = brief(r);
        const items = Array.isArray(r.items) ? (r.items as Rec[]).length : null;
        const leak = r.ok === true && (items ? (r.items as Rec[]).some((x) => [S, D, R].includes(String(x.id))) : f !== "createSchedule" && f !== "createDeparture" && f !== "createResource" && f !== "listSchedules" && f !== "listDepartures" && f !== "listResources" && f !== "refreshDeparturePolicy" && f !== "evaluateMinPax");
        if (!b.startsWith("NOT_FOUND") || leak) lines.push(`${f}: ${b}${items !== null ? ` items=${items}` : ""}${leak ? " ⚠LEAK" : ""}`);
      }
      rep[name] = lines;
    }
    rep["B schedule w/ A resourceIds"] = brief(await call("updateSchedule", B.ctx, { unitId: B.unitId, scheduleId: SB, resourceIds: [R] }));
    rep["B createSchedule w/ A resourceIds"] = brief(await call("createSchedule", B.ctx, { unitId: B.unitId, productId: pB.id, optionId: pB.opt, rule: { kind: "DAILY" }, departTimeMin: 600, capacity: 5, dateFrom: "2027-03-01", dateTo: "2027-03-02", resourceIds: [R] }));
    rep["BOOKING unit (own tenant)"] = brief(await call("listDepartures", A.ctx, { unitId: uBk, from: "2027-02-01", to: "2027-02-02" }));
    rep["BOOKING unit (B ctx)"] = brief(await call("listDepartures", B.ctx, { unitId: uBk, from: "2027-02-01", to: "2027-02-02" }));
    for (const [k, v] of Object.entries(rep)) console.log(`[iso] ${k}: ${fmt(v)}`);
    out("iso tenant A rows unchanged", h0 === (await snap()));
  }

  // ═════════ 9. input ร้าย ═════════
  if (want("adv")) {
    const A = await mkShop("adv");
    const p = await mkProd(A.tenantId, A.unitId, "ร้าย");
    const NOW = new Date("2027-01-01T00:00:00Z");
    const base = { unitId: A.unitId, productId: p.id, optionId: p.opt, localDate: "2027-04-01", departTimeMin: 540, capacity: 5 };
    let n = 0;
    const cd = (x: Rec, opts: Rec = { now: NOW }) => call("createDeparture", A.ctx, { ...base, departTimeMin: 600 + (n++ % 800), ...x }, opts);
    const D = String((await cd({ localDate: "2027-04-02" })).id);
    const rs: [string, Rec][] = [];
    const t = async (name: string, r: Promise<Rec>) => rs.push([name, await r]);
    await t("cap NaN", cd({ capacity: NaN }));
    await t("cap -1", cd({ capacity: -1 }));
    await t("cap 0", cd({ capacity: 0 }));
    await t("cap '5'", cd({ capacity: "5" }));
    await t("cap Infinity", cd({ capacity: Infinity }));
    await t("cap 2^31", cd({ capacity: 2147483648 }));
    await t("cap 1e20", cd({ capacity: 1e20 }));
    await t("minPax 2^31", cd({ minPax: 2147483648 }));
    await t("minPax 50 > cap 5", cd({ minPax: 50 }));
    await t("minPax 0", cd({ minPax: 0 }));
    await t("dur 0", cd({ durationMin: 0 }));
    await t("dur -5", cd({ durationMin: -5 }));
    await t("dur 2^31", cd({ durationMin: 2147483648 }));
    await t("dur 1e12", cd({ durationMin: 1e12 }));
    await t("dur 1e15", cd({ durationMin: 1e15 }));
    await t("time 1440", cd({ departTimeMin: 1440 }));
    await t("time 1.5", cd({ departTimeMin: 1.5 }));
    await t("date 2027-02-30", cd({ localDate: "2027-02-30" }));
    await t("date 0001-01-01", cd({ localDate: "0001-01-01" }));
    await t("date 9999-12-31 23:59 dur 2d", cd({ localDate: "9999-12-31", departTimeMin: 1439, durationMin: 2880 }));
    await t("date +275760-09-13", cd({ localDate: "275760-09-13" }));
    await t("extra key", cd({ evil: 1 }));
    await t("__proto__ key (JSON)", call("createDeparture", A.ctx, JSON.parse(JSON.stringify({ ...base, localDate: "2027-04-03" }).replace(/^\{/, '{"__proto__":{"capacity":999},')), { now: NOW }));
    await t("constructor key", cd({ constructor: { prototype: {} } }));
    await t("input null", call("createDeparture", A.ctx, null));
    await t("input array", call("createDeparture", A.ctx, [base]));
    await t("input string", call("createDeparture", A.ctx, "x"));
    await t("unitId object", call("createDeparture", A.ctx, { ...base, unitId: { id: A.unitId } }));
    await t("unitId 200 chars", call("createDeparture", A.ctx, { ...base, unitId: "u".repeat(200) }));
    await t("ctx null", call("createDeparture", null, base));
    await t("ctx {tenantId:1}", call("createDeparture", { tenantId: 1, actorUserId: A.owner.userId }, base));
    await t("opts.now Invalid Date", call("createDeparture", A.ctx, { ...base, localDate: "2027-04-04" }, { now: new Date("x") }));
    await t("opts.now string", call("createDeparture", A.ctx, { ...base, localDate: "2027-04-05" }, { now: "2027-01-01" }));
    await t("setCap 2^31", call("setDepartureCapacity", A.ctx, { unitId: A.unitId, departureId: D, capacity: 2147483648 }));
    await t("setCap 1e300", call("setDepartureCapacity", A.ctx, { unitId: A.unitId, departureId: D, capacity: 1e300 }));
    await t("setCap 0 (empty)", call("setDepartureCapacity", A.ctx, { unitId: A.unitId, departureId: D, capacity: 0 }));
    await t("update dur 1e13", call("updateDeparture", A.ctx, { unitId: A.unitId, departureId: D, durationMin: 1e13 }, { now: NOW }));
    await t("update minPax 2^31", call("updateDeparture", A.ctx, { unitId: A.unitId, departureId: D, minPax: 2147483648 }, { now: NOW }));
    await t("update nothing", call("updateDeparture", A.ctx, { unitId: A.unitId, departureId: D }, { now: NOW }));
    await t("status 'open'", call("setDepartureStatus", A.ctx, { unitId: A.unitId, departureId: D, status: "open" }));
    await t("cancel reason '  ab  '", call("cancelDeparture", A.ctx, { unitId: A.unitId, departureId: D, reason: "  ab  " }));
    await t("stopSell until garbage", call("setDepartureStopSell", A.ctx, { unitId: A.unitId, departureId: D, stopSell: { channels: [], reason: "x", until: "garbage" } }));
    await t("stopSell until past", call("setDepartureStopSell", A.ctx, { unitId: A.unitId, departureId: D, stopSell: { channels: [], reason: "x", until: "2001-01-01" } }));
    await t("stopSell channel 'XX'", call("setDepartureStopSell", A.ctx, { unitId: A.unitId, departureId: D, stopSell: { channels: ["XX"], reason: "x" } }));
    await t("stopSell agentIds []", call("setDepartureStopSell", A.ctx, { unitId: A.unitId, departureId: D, stopSell: { channels: [], reason: "x", agentAccountIds: [] } }));
    await t("stopSell missing", call("setDepartureStopSell", A.ctx, { unitId: A.unitId, departureId: D }));
    await t("list 63 days", call("listDepartures", A.ctx, { unitId: A.unitId, from: "2027-01-01", to: "2027-03-04" }));
    await t("list 62 days", call("listDepartures", A.ctx, { unitId: A.unitId, from: "2027-01-01", to: "2027-03-03" }));
    await t("resource name spaces", call("createResource", A.ctx, { unitId: A.unitId, kind: "BOAT", name: "   " }));
    await t("resource seats 0", call("createResource", A.ctx, { unitId: A.unitId, kind: "BOAT", name: "x", seats: 0 }));
    await t("resource seats 2^31", call("createResource", A.ctx, { unitId: A.unitId, kind: "BOAT", name: "x", seats: 2147483648 }));
    await t("resource kind 'boat'", call("createResource", A.ctx, { unitId: A.unitId, kind: "boat", name: "x" }));
    const sch = (x: Rec) => call("createSchedule", A.ctx, { unitId: A.unitId, productId: p.id, optionId: p.opt, rule: { kind: "DAILY" }, departTimeMin: 540, capacity: 5, dateFrom: "2027-05-01", dateTo: "2027-05-03", ...x });
    await t("sched cap 2^31", sch({ capacity: 2147483648 }));
    await t("sched minPax 2^31", sch({ minPax: 2147483648 }));
    await t("sched dateFrom > dateTo", sch({ dateFrom: "2027-05-04" }));
    await t("sched weekdays [7]", sch({ rule: { kind: "WEEKLY", weekdays: [7] } }));
    await t("sched dup exception dates", sch({ exceptions: [{ date: "2027-05-01", action: "SKIP" }, { date: "2027-05-01", action: "SKIP" }] }));
    // OVERRIDE ความจุ 0 / ใหญ่เกิน int4 ⇒ materialize
    const sO0 = await sch({ exceptions: [{ date: "2027-05-01", action: "OVERRIDE", capacity: 0 }] });
    rs.push(["sched OVERRIDE cap 0 create", sO0]);
    const m0 = await call("materializeSchedule", A.ctx, { unitId: A.unitId, scheduleId: sO0.id }, { now: NOW });
    const capRows = await q(`SELECT to_char("localDate",'YYYY-MM-DD') AS d, capacity FROM "TripDeparture" WHERE "scheduleId" = $1 ORDER BY 1`, [sO0.id]);
    rs.push(["sched OVERRIDE cap 0 materialize", { ...m0, rows: capRows.map((x) => `${x.d}:${x.capacity}`) }]);
    const p2 = await mkProd(A.tenantId, A.unitId, "ร้ายสอง");
    const sOb = await call("createSchedule", A.ctx, { unitId: A.unitId, productId: p2.id, optionId: p2.opt, rule: { kind: "DAILY" }, departTimeMin: 540, capacity: 5, dateFrom: "2027-05-01", dateTo: "2027-05-03", exceptions: [{ date: "2027-05-02", action: "OVERRIDE", capacity: 2147483648 }] });
    rs.push(["sched OVERRIDE cap 2^31 create", sOb]);
    const mb = await call("materializeSchedule", A.ctx, { unitId: A.unitId, scheduleId: sOb.id }, { now: NOW });
    rs.push(["sched OVERRIDE cap 2^31 materialize", { ...mb, rows: (await q(`SELECT count(*)::int AS n FROM "TripDeparture" WHERE "scheduleId" = $1`, [sOb.id]))[0] }]);
    let jobRes: Rec;
    try { jobRes = asR(await (T.runGenerateDepartures as (n: Date, o: Rec) => Promise<unknown>)(NOW, { tenantIds: [A.tenantId] })); } catch (e) { jobRes = { THROW: (e as Error).message.slice(0, 200) }; }
    rs.push(["job with OVERRIDE cap 2^31 schedule", jobRes]);
    const sBig = await sch({ rule: { kind: "DATES", dates: Array.from({ length: 20000 }, (_, i) => (T.addDaysYmd as (y: string, n: number) => string)("2027-01-01", i % 3000)) } });
    rs.push(["sched DATES 20000 (dups)", sBig]);
    // ตัวเลือกระยะเวลาแปลก (ตั้งดิบ)
    for (const [label, o] of [["opt dur 0", { durationMin: 0 }], ["opt nights 0", { durationMin: null, nights: 0 }], ["opt dur 2^31-1", { durationMin: 2147483647 }]] as const) {
      const po = await mkProd(A.tenantId, A.unitId, label, "ACTIVE", o as Rec);
      await t(`${label} createDeparture`, call("createDeparture", A.ctx, { ...base, productId: po.id, optionId: po.opt }, { now: NOW }));
      await t(`${label} createSchedule`, call("createSchedule", A.ctx, { unitId: A.unitId, productId: po.id, optionId: po.opt, rule: { kind: "DAILY" }, departTimeMin: 540, capacity: 5, dateFrom: "2027-05-01", dateTo: "2027-05-02" }));
    }
    const lines = rs.map(([k, r]) => `${rawLeak(r) ? "⚠ " : "  "}${k}: ${brief(r)}${Array.isArray(r.rows) || r.rows ? ` rows=${fmt(r.rows)}` : ""}${r.created ? ` created=${(r.created as unknown[]).length}` : ""}${r.schedules !== undefined ? ` ${fmt(r)}` : ""}`);
    console.log(lines.join("\n"));
    const created = await q(`SELECT capacity, "minPax", "startsAt", "endsAt", to_char("localDate",'YYYY-MM-DD') AS d FROM "TripDeparture" WHERE "tenantId" = $1 AND ("minPax" > capacity OR capacity = 0 OR "endsAt" > '9000-01-01') ORDER BY 1`, [A.tenantId]);
    out("adv odd rows created", created.map((x) => `${x.d} cap=${x.capacity} minPax=${x.minPax} ends=${(x.endsAt as Date).toISOString?.() ?? x.endsAt}`));
  }
} catch (e) {
  exit = 1;
  console.error("PROBE ERROR", e);
} finally {
  await cleanup().catch((e) => console.log("cleanup err", e));
  await endPool();
  process.exit(exit);
}
function asR(v: unknown): Rec { return v && typeof v === "object" ? (v as Rec) : {}; }
