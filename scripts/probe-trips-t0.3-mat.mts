// probe-trips-t0.3-mat.mts — hunter T0.3: (2) materialize แข่งกัน + แก้กฎ/พัก/ข้อยกเว้นระหว่างทาง (7) สินค้า ARCHIVED/ตัวเลือกปิด (6b) งานข้ามร้านเมื่อร้านหนึ่งข้อมูลเสีย
import { boot, call, brief, out, fmt, q, pool, mkShop, mkProd, insertRow, rid, cleanup, endPool, mods, type Rec } from "./probe-trips-t0.3-lib.mjs";

boot("probe-t0.3-mat");
let exit = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
try {
  const { T, S } = await mods();
  const job = async (name: string, now: Date, tenantIds: string[]) => { try { return { ok: true, r: await (T[name] as (n: Date, o: Rec) => Promise<unknown>)(now, { tenantIds }) }; } catch (e) { return { THROW: (e as Error).message.slice(0, 200) }; } };
  const A = await mkShop("a");
  const P = await mkProd(A.tenantId, A.unitId, "สินค้าเอ");
  const NOW = new Date("2027-03-01T00:00:00+07:00");
  const mkS = async (input: Rec, p = P) => { const r = await call("createSchedule", A.ctx, { unitId: A.unitId, productId: p.id, optionId: p.opt, rule: { kind: "DAILY" }, departTimeMin: 540, capacity: 10, dateFrom: "2027-03-01", dateTo: "2027-03-30", ...input }); if (r.ok !== true) throw new Error(fmt(r)); return String(r.id); };
  const rows = (sid: string) => q(`SELECT id, to_char("localDate",'YYYY-MM-DD') AS d, "startsAt", status, "createdAt" FROM "TripDeparture" WHERE "scheduleId" = $1 ORDER BY "localDate"`, [sid]);
  const mat = (sid: string, now = NOW) => call("materializeSchedule", A.ctx, { unitId: A.unitId, scheduleId: sid }, { now });

  // (a1) 10 ทาง + งาน 2 ครั้ง
  const S1 = await mkS({});
  const rs = await Promise.all([...Array.from({ length: 10 }, () => mat(S1)), job("runGenerateDepartures", NOW, [A.tenantId]) as Promise<Rec>, job("runGenerateDepartures", NOW, [A.tenantId]) as Promise<Rec>]);
  const r1 = await rows(S1);
  out("a1 10x+2jobs", rs.map((x) => (x.r ? `job ${fmt(x.r)}` : `${brief(x)} c=${Array.isArray(x.created) ? x.created.length : "-"}`)), { rows: r1.length, distinctDates: new Set(r1.map((x) => x.d)).size });

  // (a2) แข่งกับ "พักกฎ" / "เพิ่มข้อยกเว้น" / "เปลี่ยนเวลา" — งานอีกตัวถือ advisory lock ของกฎอยู่ (จำลองด้วย connection ของ probe)
  for (const kind of ["pause", "skipException", "timeChange", "archiveProduct"] as const) {
    const Pk = await mkProd(A.tenantId, A.unitId, `สินค้า ${kind}`);
    const sid = await mkS({ dateFrom: "2027-03-01", dateTo: "2027-03-05" }, Pk);
    const c = await pool().connect();
    await c.query("BEGIN");
    await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`trips-schedule:${sid}`]);
    const pending = mat(sid);
    await sleep(1500); // ให้ materialize อ่านกฎ (ยังไม่พัก) แล้วไปรอที่ advisory lock
    let edit: Rec;
    if (kind === "pause") edit = await call("pauseSchedule", A.ctx, { unitId: A.unitId, scheduleId: sid }, { now: NOW });
    else if (kind === "skipException") edit = await call("updateSchedule", A.ctx, { unitId: A.unitId, scheduleId: sid, exceptions: [{ date: "2027-03-03", action: "SKIP" }] }, { now: NOW });
    else if (kind === "timeChange") edit = await call("updateSchedule", A.ctx, { unitId: A.unitId, scheduleId: sid, departTimeMin: 600 }, { now: NOW });
    else { await q(`UPDATE "TripProduct" SET status = 'ARCHIVED' WHERE id = $1`, [Pk.id]); edit = { ok: true, raw: "archived" }; }
    await c.query("COMMIT"); c.release();
    const m = await pending;
    const rr = await rows(sid);
    const s = (await q(`SELECT "pausedAt", exceptions, "departTimeMin" FROM "TripSchedule" WHERE id = $1`, [sid]))[0];
    out(`a2 ${kind}`, { edit: brief(edit), mismatched: edit.mismatched, materialize: brief(m), created: Array.isArray(m.created) ? m.created.length : null,
      rowsAfter: rr.map((x) => `${x.d}@${(x.startsAt as Date).toISOString().slice(11, 16)}Z`), schedNow: { paused: !!s.pausedAt, exceptions: s.exceptions, departTimeMin: s.departTimeMin } });
    // positive control: เรียกอีกครั้งหลังแก้
    out(`a2 ${kind} control (after edit, fresh call)`, brief(await mat(sid)));
  }

  // (b) วันชนในชุด: NND วันที่ 3 · ทรัพยากรชนวันที่ 4
  const P2 = await mkProd(A.tenantId, A.unitId, "สินค้าบี");
  const R = await call("createResource", A.ctx, { unitId: A.unitId, kind: "BOAT", name: "เรืออาร์" });
  const single = await call("createDeparture", A.ctx, { unitId: A.unitId, productId: P.id, optionId: P.opt, localDate: "2027-04-03", departTimeMin: 540, capacity: 5 }, { now: NOW });
  const blocker = await call("createDeparture", A.ctx, { unitId: A.unitId, productId: P2.id, optionId: P2.opt, localDate: "2027-04-04", departTimeMin: 600, capacity: 5, resourceIds: [R.id] }, { now: NOW });
  const S4 = await mkS({ dateFrom: "2027-04-01", dateTo: "2027-04-05", resourceIds: [R.id] });
  const m4 = await mat(S4);
  out("b batch with collisions", brief(single), brief(blocker), { created: Array.isArray(m4.created) ? m4.created.length : brief(m4), conflicts: m4.conflicts, rows: (await rows(S4)).map((x) => x.d) });
  // (c) เปลี่ยนเวลากฎ + materialize ซ้ำ (บางรอบมีตัวนับ)
  const r4 = await rows(S4);
  await q(`UPDATE "TripDeparture" SET sold = 2 WHERE id = $1`, [r4[0].id]);
  const u = await call("updateSchedule", A.ctx, { unitId: A.unitId, scheduleId: S4, departTimeMin: 600, dateTo: "2027-04-07" }, { now: NOW });
  const m4b = await mat(S4);
  out("c time change", { update: brief(u), mismatched: Array.isArray(u.mismatched) ? (u.mismatched as string[]).length : null, rematerialize: brief(m4b), created: m4b.created, conflicts: m4b.conflicts,
    rows: (await rows(S4)).map((x) => `${x.d}@${(x.startsAt as Date).toISOString().slice(11, 16)}Z`) });

  // (7) สินค้า ARCHIVED / ตัวเลือกปิดใช้ / DRAFT
  const PA = await mkProd(A.tenantId, A.unitId, "เก็บแล้ว", "ARCHIVED");
  const PI = await mkProd(A.tenantId, A.unitId, "ตัวเลือกปิด", "ACTIVE", { durationMin: 240, active: false });
  const PD = await mkProd(A.tenantId, A.unitId, "ร่าง", "DRAFT");
  const PX = await mkProd(A.tenantId, A.unitId, "จะปิดตัวเลือก");
  const sx = await mkS({ dateFrom: "2027-05-01", dateTo: "2027-05-03" }, PX);
  await q(`UPDATE "TripOption" SET active = false WHERE id = $1`, [PX.opt]);
  const sa = await mkS({ dateFrom: "2027-05-01", dateTo: "2027-05-03" }, P2);
  await q(`UPDATE "TripProduct" SET status = 'ARCHIVED' WHERE id = $1`, [P2.id]);
  const cd = (p: { id: string; opt: string }) => call("createDeparture", A.ctx, { unitId: A.unitId, productId: p.id, optionId: p.opt, localDate: "2027-05-10", departTimeMin: 540, capacity: 5 }, { now: NOW });
  const cs = (p: { id: string; opt: string }) => call("createSchedule", A.ctx, { unitId: A.unitId, productId: p.id, optionId: p.opt, rule: { kind: "DAILY" }, departTimeMin: 540, capacity: 5, dateFrom: "2027-05-01", dateTo: "2027-05-02" });
  out("7 parents", {
    archived: { createSchedule: brief(await cs(PA)), createDeparture: brief(await cd(PA)), materializeExisting: brief(await mat(sa, new Date("2027-05-01T00:00:00+07:00"))) },
    optionInactive: { createSchedule: brief(await cs(PI)), createDeparture: brief(await cd(PI)), materializeExisting: (() => 0)() },
    draft: { createDeparture: brief(await cd(PD)) },
  });
  const mx = await mat(sx, new Date("2027-05-01T00:00:00+07:00"));
  out("7 option deactivated after schedule ⇒ materialize", brief(mx), Array.isArray(mx.created) ? mx.created.length : null);
  // ตัวเลือกของสินค้าอื่น
  out("7 option of other product", brief(await call("createDeparture", A.ctx, { unitId: A.unitId, productId: P.id, optionId: PD.opt, localDate: "2027-05-11", departTimeMin: 540, capacity: 5 }, { now: NOW })));

  // (6b) งานข้ามร้าน: ร้านข้อมูลเสีย 4 แบบ (tenantId เรียงก่อนร้านดี)
  const mk = async (tag: string, settings: Rec = {}) => { const s = await mkShop(tag, settings); const p = await mkProd(s.tenantId, s.unitId, `ร้าน ${tag}`); const r = await call("createSchedule", s.ctx, { unitId: s.unitId, productId: p.id, optionId: p.opt, rule: { kind: "DAILY" }, departTimeMin: 540, capacity: 5, minPax: 3, dateFrom: "2027-06-01", dateTo: "2027-06-03" }); return { s, p, sid: String(r.id) }; };
  const c1 = await mk("0rule"), c2 = await mk("0dur"), c3 = await mk("0set"), c4 = await mk("0tz", { timezone: "Mars/Olympus" }), ok = await mk("zok");
  await q(`UPDATE "TripSchedule" SET rule = '{"kind":"WEEKLY","weekdays":[9]}' WHERE id = $1`, [c1.sid]);
  await q(`UPDATE "TripOption" SET "durationMin" = NULL WHERE id = $1`, [c2.p.opt]);
  await insertRow("SettingValue", { id: rid("sv"), tenantId: c3.s.tenantId, key: "trips.sell.departureHorizonDays", scope: "UNIT", scopeId: c3.s.unitId, value: JSON.stringify("ไม่ใช่ตัวเลข"), updatedAt: new Date() });
  await insertRow("SettingValue", { id: rid("sv"), tenantId: c3.s.tenantId, key: "trips.sell.minToDepart", scope: "UNIT", scopeId: c3.s.unitId, value: JSON.stringify({ minPax: "x" }), updatedAt: new Date() });
  const ctl = asRec2(await (S.resolveSettings as (c: Rec, k: string[], r: Rec) => Promise<unknown>)({ tenantId: c3.s.tenantId }, ["trips.sell.departureHorizonDays"], { unitId: c3.s.unitId }));
  out("6b control: resolveSettings returns broken value", fmt(ctl).slice(0, 200));
  const tids = [c1, c2, c3, c4, ok].map((x) => x.s.tenantId);
  out("6b tenant order", tids.map((t) => t.slice(0, 18)).join(" < "), [...tids].sort().every((t, i) => t === tids[i]));
  const JNOW = new Date("2027-06-01T00:00:00+07:00");
  const g0 = await job("runGenerateDepartures", JNOW, tids.filter((t) => t !== c3.s.tenantId));
  out("6b control: job without broken tenant", g0);
  await q(`UPDATE "TripDeparture" SET status = 'CANCELLED' WHERE "tenantId" = ANY($1)`, [tids]); // ตัวควบคุมเสร็จ — ไม่ลบ แต่รอบรันจริงข้างล่างนับเฉพาะรอบใหม่
  const before = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripDeparture" WHERE "tenantId" = ANY($1)`, [tids]);
  await q(`DELETE FROM "TripDeparture" WHERE "tenantId" = ANY($1)`, [tids]); // ข้อมูลทดสอบของร้านชั่วคราว (ไม่ใช่พฤติกรรมสินค้า)
  out("6b reset test rows", before[0].n);
  const g = await job("runGenerateDepartures", JNOW, tids);
  const cnt = async (t: string) => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripDeparture" WHERE "tenantId" = $1`, [t]))[0].n;
  out("6b runGenerateDepartures", g, { rule: await cnt(c1.s.tenantId), dur: await cnt(c2.s.tenantId), set: await cnt(c3.s.tenantId), tz: await cnt(c4.s.tenantId), ok: await cnt(ok.s.tenantId) });
  // ให้ร้านเสีย c3 มีรอบ (raw) ที่ถึงเวลาตัดสิน แล้วรัน minPax
  await insertRow("TripDeparture", { id: rid("d"), tenantId: c3.s.tenantId, unitId: c3.s.unitId, productId: c3.p.id, optionId: c3.p.opt, localDate: "2027-06-05", startsAt: new Date("2027-06-05T02:00:00Z"), endsAt: new Date("2027-06-05T06:00:00Z"), status: "OPEN", capacity: 5, minPax: 2, sold: 3, updatedAt: new Date() });
  await q(`UPDATE "TripDeparture" SET sold = 3 WHERE "tenantId" = $1`, [ok.s.tenantId]);
  const mp = await job("runMinPaxCheck", new Date("2027-06-02T12:00:00Z"), tids);
  const okSt = await q(`SELECT to_char("localDate",'YYYY-MM-DD') AS d, status FROM "TripDeparture" WHERE "tenantId" = $1 ORDER BY 1`, [ok.s.tenantId]);
  out("6b runMinPaxCheck", mp, "ok tenant:", okSt.map((x) => `${x.d}:${x.status}`));
  // materialize ของร้าน c4 (tz ผิด ⇒ Bangkok)
  out("6b tz fallback rows", (await q(`SELECT to_char("localDate",'YYYY-MM-DD') AS d, "startsAt" FROM "TripDeparture" WHERE "tenantId" = $1 ORDER BY 1`, [c4.s.tenantId])).map((x) => `${x.d}@${(x.startsAt as Date).toISOString()}`));
} catch (e) {
  exit = 1;
  console.error("PROBE ERROR", e);
} finally {
  await cleanup().catch((e) => console.log("cleanup err", e));
  await endPool();
  process.exit(exit);
}
function asRec2(v: unknown): Rec { return v && typeof v === "object" ? (v as Rec) : {}; }
