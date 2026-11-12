// probe-trips-t0.3-scale.mts — hunter T0.3: (8) ปริมาณ — N กฎ × ระยะ 180 วัน · เวลา + จำนวนคำสั่ง SQL ของงาน · + OVERRIDE ความจุเกิน int4 ในงาน
// ใช้: … pnpm exec tsx scripts/probe-trips-t0.3-scale.mts <N กฎ>
import pg from "pg";
import { boot, call, brief, out, fmt, q, mkShop, mkProd, setV, cleanup, endPool, mods, type Rec } from "./probe-trips-t0.3-lib.mjs";

boot("probe-t0.3-scale");
const N = Number(process.argv[2] ?? "20");
let exit = 0;
// นับคำสั่ง SQL ทุก connection (Prisma adapter-pg ใช้ pg.Client ตัวเดียวกัน)
let queries = 0;
const orig = pg.Client.prototype.query as unknown as (...a: unknown[]) => unknown;
(pg.Client.prototype as unknown as { query: (...a: unknown[]) => unknown }).query = function (this: unknown, ...a: unknown[]) { queries++; return orig.apply(this, a); };
const measure = async <T,>(label: string, f: () => Promise<T>): Promise<T> => {
  const q0 = queries, t0 = Date.now();
  let r: T;
  try { r = await f(); } catch (e) { const msg = (e as Error).message; out(label, { THROW: `${msg.slice(0, 120)} … ${msg.slice(-400)}`, ms: Date.now() - t0, queries: queries - q0 }); return undefined as T; }
  out(label, { ms: Date.now() - t0, queries: queries - q0, result: fmt(r).slice(0, 300) });
  return r;
};
try {
  const { T } = await mods();
  const job = (name: string, now: Date, tenantIds: string[]) => (T[name] as (n: Date, o: Rec) => Promise<unknown>)(now, { tenantIds });
  if (process.argv[3] === "big") {
    // (i) กฎ DAILY เดียว · T8 = 730 (สูงสุดของค่าตั้ง) · มี/ไม่มีทรัพยากร 2 ตัว
    for (const withRes of process.argv[4] === "skip730" ? [] : [false, true]) {
      const H = await mkShop(withRes ? "h730r" : "h730");
      await setV(H, [{ key: "trips.sell.departureHorizonDays", scope: "UNIT", scopeId: H.unitId, value: 730 }]);
      const ph = await mkProd(H.tenantId, H.unitId, "ยาว");
      const rids: string[] = [];
      if (withRes) for (const n of ["เรือ", "รถ"]) rids.push(String((await call("createResource", H.ctx, { unitId: H.unitId, kind: "BOAT", name: n })).id));
      const sh = await call("createSchedule", H.ctx, { unitId: H.unitId, productId: ph.id, optionId: ph.opt, rule: { kind: "DAILY" }, departTimeMin: 540, capacity: 10, dateFrom: "2027-01-01", dateTo: null, resourceIds: rids });
      await measure(`big materialize DAILY T8=730 resources=${rids.length}`, async () => { const r = await call("materializeSchedule", H.ctx, { unitId: H.unitId, scheduleId: sh.id }, { now: new Date("2027-01-01T00:00:00+07:00") }); return { r: brief(r), created: Array.isArray(r.created) ? r.created.length : null }; });
      out("big rows", (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripDeparture" WHERE "tenantId" = $1`, [H.tenantId]))[0].n);
    }
    // (ii) 20,000 รอบ OPEN อนาคต (ใส่ดิบเป็นข้อมูลทดสอบ) ⇒ งาน/บริการที่อ่านทั้งหน่วย
    const B = await mkShop("b20k");
    const bp: { id: string; opt: string }[] = [];
    for (let i = 0; i < 10; i++) bp.push(await mkProd(B.tenantId, B.unitId, `p${i}`));
    await q(`INSERT INTO "TripDeparture" (id, "tenantId", "unitId", "productId", "optionId", "localDate", "startsAt", "endsAt", status, capacity, "minPax", "updatedAt")
      SELECT 'trips-hunt3-d20k-' || g, $1, $2, ($3::text[])[1 + g % 10], ($4::text[])[1 + g % 10],
             (timestamp '2027-01-02 02:00' + (g / 10) * interval '1 hour' + interval '7 hour')::date,
             timestamp '2027-01-02 02:00' + (g / 10) * interval '1 hour', timestamp '2027-01-02 06:00' + (g / 10) * interval '1 hour', 'OPEN', 10, 3, now()
      FROM generate_series(0, 19999) g`, [B.tenantId, B.unitId, bp.map((p) => p.id), bp.map((p) => p.opt)]);
    out("big 20k inserted", (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripDeparture" WHERE "tenantId" = $1`, [B.tenantId]))[0].n);
    const now2 = new Date("2027-01-01T12:00:00Z");
    await measure("big runMinPaxCheck 20k OPEN (few due)", () => job("runMinPaxCheck", now2, [B.tenantId]));
    await measure("big evaluateMinPax 20k", async () => { const r = await call("evaluateMinPax", B.ctx, { unitId: B.unitId }, { now: now2 }); return { r: brief(r), g: (r.guaranteed as unknown[] | undefined)?.length, b: (r.belowMin as unknown[] | undefined)?.length }; });
    await measure("big listDepartures 62 days", async () => { const r = await call("listDepartures", B.ctx, { unitId: B.unitId, from: "2027-01-02", to: "2027-03-04" }, { now: now2 }); return { r: brief(r), n: Array.isArray(r.items) ? r.items.length : null }; });
    await measure("big refreshDeparturePolicy 20k", async () => brief(await call("refreshDeparturePolicy", B.ctx, { unitId: B.unitId }, { now: now2 })));
    out("big rows with cutoffAt after refresh", (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripDeparture" WHERE "tenantId" = $1 AND "cutoffAt" IS NOT NULL`, [B.tenantId]))[0].n);
  }
  // ── OVERRIDE ความจุ 2^31 ในหน้าต่าง ⇒ materialize / งาน (ร้านแยก tenantId เรียงก่อนร้านดี)
  {
    const X = await mkShop("0ovr");
    const Y = await mkShop("zgood");
    const px = await mkProd(X.tenantId, X.unitId, "ovr");
    const py = await mkProd(Y.tenantId, Y.unitId, "good");
    const now = new Date("2027-01-01T00:00:00+07:00");
    const sx = await call("createSchedule", X.ctx, { unitId: X.unitId, productId: px.id, optionId: px.opt, rule: { kind: "DAILY" }, departTimeMin: 540, capacity: 5, dateFrom: "2027-01-01", dateTo: "2027-01-05", exceptions: [{ date: "2027-01-03", action: "OVERRIDE", capacity: 2147483648 }, { date: "2027-01-04", action: "OVERRIDE", capacity: 0 }] });
    await call("createSchedule", Y.ctx, { unitId: Y.unitId, productId: py.id, optionId: py.opt, rule: { kind: "DAILY" }, departTimeMin: 540, capacity: 5, dateFrom: "2027-01-01", dateTo: "2027-01-05" });
    const m = await call("materializeSchedule", X.ctx, { unitId: X.unitId, scheduleId: sx.id }, { now });
    const rows = await q(`SELECT to_char("localDate",'YYYY-MM-DD') AS d, capacity FROM "TripDeparture" WHERE "tenantId" = $1 ORDER BY 1`, [X.tenantId]);
    out("ovr createSchedule", brief(sx), "materialize", brief(m), "rows", rows.map((r) => `${r.d}:${r.capacity}`));
    let j: unknown;
    try { j = await job("runGenerateDepartures", now, [X.tenantId, Y.tenantId]); } catch (e) { j = { THROW: (e as Error).message.slice(0, 160) }; }
    const ny = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripDeparture" WHERE "tenantId" = $1`, [Y.tenantId]);
    out("ovr job", j, "good tenant rows", ny[0].n);
  }
  if (N > 0) {
    const A = await mkShop("scale");
    await setV(A, [{ key: "trips.sell.departureHorizonDays", scope: "UNIT", scopeId: A.unitId, value: 180 }, { key: "trips.sell.minToDepart", scope: "UNIT", scopeId: A.unitId, value: { minPax: 3, decideDaysBefore: 1, decideAtMin: 1080 } }]);
    const prods = [] as { id: string; opt: string }[];
    for (let i = 0; i < Math.ceil(N / 30); i++) prods.push(await mkProd(A.tenantId, A.unitId, `สินค้า ${i}`));
    const t0 = Date.now();
    for (let i = 0; i < N; i += 10) {
      await Promise.all(Array.from({ length: Math.min(10, N - i) }, async (_, k) => {
        const j = i + k;
        const p = prods[Math.floor(j / 30)];
        const r = await call("createSchedule", A.ctx, { unitId: A.unitId, productId: p.id, optionId: p.opt, rule: { kind: "WEEKLY", weekdays: [1, 3, 5] }, departTimeMin: 300 + (j % 30) * 30, capacity: 10, dateFrom: "2027-01-01", dateTo: null });
        if (r.ok !== true) throw new Error(fmt(r));
      }));
    }
    out("scale setup", { schedules: N, ms: Date.now() - t0 });
    const NOW = new Date("2027-01-01T00:00:00+07:00");
    await measure(`scale runGenerateDepartures (N=${N}, T8=180)`, () => job("runGenerateDepartures", NOW, [A.tenantId]));
    const cnt = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripDeparture" WHERE "tenantId" = $1`, [A.tenantId]))[0].n;
    out("scale departures", cnt);
    await measure("scale runGenerateDepartures again (idempotent)", () => job("runGenerateDepartures", NOW, [A.tenantId]));
    await measure("scale runMinPaxCheck (few due)", () => job("runMinPaxCheck", new Date("2027-01-03T12:00:00Z"), [A.tenantId]));
    await measure("scale listDepartures 62 days", async () => { const r = await call("listDepartures", A.ctx, { unitId: A.unitId, from: "2027-01-01", to: "2027-03-03" }, { now: NOW }); return { r: brief(r), n: Array.isArray(r.items) ? r.items.length : null }; });
    // เปลี่ยน T6 แล้ว refresh ทุกรอบอนาคต (ธุรกรรมเดียว timeout 60 วิ)
    await setV(A, [{ key: "trips.sell.cutoff", scope: "UNIT", scopeId: A.unitId, value: { daysBefore: 2, atMin: 1020 } }]);
    await measure("scale refreshDeparturePolicy (all future rows change)", async () => brief(await call("refreshDeparturePolicy", A.ctx, { unitId: A.unitId }, { now: NOW })));
    const ch = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripDeparture" WHERE "tenantId" = $1 AND "cutoffAt" = ("localDate" - 2) + time '10:00'`, [A.tenantId]))[0]?.n;
    out("scale refresh rows matching new cutoff (approx)", ch);
  }
} catch (e) {
  exit = 1;
  console.error("PROBE ERROR", e);
} finally {
  await cleanup().catch((e) => console.log("cleanup err", e));
  await endPool();
  process.exit(exit);
}
