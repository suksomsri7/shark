// trips-qc-lane-clean.mts — ล้างของค้างในร้าน seed (อันดามันไดฟ์) บนฐาน QC ต่อเลนของ RUN TRIPS · ผู้เขียนข้อสอบ W1.3a (19 พ.ย. 2569 · ผู้คุมสั่ง)
//
// ใช้ (ต้องผ่าน wrapper เท่านั้น · ฐานต่อเลนเท่านั้น — ฐานหลัก wo-trips-qc ปฏิเสธ):
//   bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/trips-qc-lane-clean.mts            # dry-run (ทำในธุรกรรมแล้ว ROLLBACK · พิมพ์จำนวนต่อตาราง)
//   bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/trips-qc-lane-clean.mts --apply    # ลงจริง (ธุรกรรมเดียว)
//
// ของที่ "seed สร้าง" (scripts/seed-trips-qc.mts §T0.6): การจองตรง 3 รายการของรอบราชา 14 พ.ย. ผ่าน bookTripsNow คีย์ `seed-tr-<เลขท้าย>`
//   ⇒ ตะกร้า `st:<เจ้าของ>:seed-tr-NNNN[@หน่วย]` + การจองของตะกร้านั้น + hold ที่แปลงเป็นการจองนั้น + รายการ/งวด/ผู้เดินทางของการจองนั้น · Party = DIVE_PARTIES
// ของที่ลบ (ร้าน seed เท่านั้น · ตาราง Trip*/Sell* ที่ผูกการจอง/ตะกร้า/hold): การจอง · ตะกร้า · hold · รายการ · งวด · เงิน (TripMoneyEvent) · คำขอคืนเงิน ·
//   ผู้เดินทาง/ลิงก์ · โค้ดส่วนลดที่ใช้ · Party นอกฟิกซ์เจอร์ที่ไม่มีแถวไหนอ้างแล้ว · audit/outbox ที่อ้าง id ที่ลบ — แล้วคืนตัวนับรอบ (sold/held) ให้ตรงแถวที่เหลือ
// ไม่แตะ: ร้านอื่นทุกร้าน · สินค้า/รอบ/ราคา/ค่าตั้ง/ผู้ใช้ของ seed · audit/outbox ที่ไม่อ้าง id ที่ลบ · ถังอัตรา · TripLinkStat · SellCounter
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import { TRIPS_QC_HOSTS, TRIPS_QC_MAIN_HOST } from "./trips-qc-hosts.mjs";
import { DEPARTURE_RACHA_1114, DIVE_PARTIES, SHOP_DIVE } from "./trips-fixture.mjs";

const LABEL = "trips-qc-lane-clean";
const APPLY = process.argv.includes("--apply");

// ── ด่าน: ต้องมาทาง scripts/qc-trips.sh (ตั้ง QC_BRANCH + TRIPS_QC_HOST หลังตรวจ host จริง) · ฐานต่อเลนเท่านั้น ──
const mark = process.env.TRIPS_QC_HOST ?? "";
if (process.env.QC_BRANCH !== "qc-trips" || !mark) {
  console.error(`🔴 ${LABEL}: ต้องรันผ่าน scripts/qc-trips.sh (ไม่มี QC_BRANCH/TRIPS_QC_HOST) — หยุด`);
  process.exit(4);
}
if (!(TRIPS_QC_HOSTS as readonly string[]).includes(mark) || mark === TRIPS_QC_MAIN_HOST) {
  console.error(`🔴 ${LABEL}: ${mark} ไม่ใช่ฐาน QC ต่อเลนของ TRIPS (ฐานหลัก ${TRIPS_QC_MAIN_HOST} ห้ามล้างด้วยสคริปต์นี้) — หยุด`);
  process.exit(4);
}
loadTripsQcEnv(LABEL); // ด่าน host ซ้ำ (prod / RUN อื่น / host อื่น ⇒ exit 4)
const host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
if (!host.startsWith(mark)) {
  console.error(`🔴 ${LABEL}: DATABASE_URL (${host}) ไม่ตรง TRIPS_QC_HOST ${mark} — หยุด`);
  process.exit(4);
}

const T = SHOP_DIVE.tenant.id;
const SEED_KEYS = DEPARTURE_RACHA_1114.bookings.filter((b) => b.agency === null).map((b) => `seed-tr-${b.ref.slice(-4)}`);
const KEEP_PARTIES = DIVE_PARTIES.map((p) => p.id);

pg.defaults.parseInputDatesAsUTC = true;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const client = await pool.connect();
const q = async <R extends pg.QueryResultRow = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await client.query<R>(sql, params)).rows;
const counts: Record<string, number> = {};
const add = (k: string, n: number) => { if (n) counts[k] = (counts[k] ?? 0) + n; };
const deleted = new Set<string>();

let code = 1;
try {
  await q("BEGIN");
  const tn = (await q<{ slug: string }>(`SELECT slug FROM "Tenant" WHERE id = $1`, [T]))[0];
  if (!tn || tn.slug !== SHOP_DIVE.tenant.slug) throw new Error(`ไม่พบร้าน seed ${T} (${SHOP_DIVE.tenant.slug}) — หยุด`);

  // 1) ของ seed: ตะกร้าคีย์ seed → การจอง → hold
  const keepBaskets = (await q<{ id: string }>(
    `SELECT id FROM "SellBasket" WHERE "tenantId" = $1 AND EXISTS (SELECT 1 FROM unnest($2::text[]) k WHERE "idempotencyKey" LIKE 'st:%:' || k OR "idempotencyKey" LIKE 'st:%:' || k || '@%')`,
    [T, SEED_KEYS],
  )).map((r) => r.id);
  const keepBookings = (await q<{ id: string }>(`SELECT id FROM "TripBooking" WHERE "tenantId" = $1 AND "basketId" = ANY($2::text[])`, [T, keepBaskets])).map((r) => r.id);
  console.log(`[${LABEL}] ร้าน ${T} · ตะกร้า seed ${keepBaskets.length}/${SEED_KEYS.length} · การจอง seed ${keepBookings.length} · Party ฟิกซ์เจอร์ ${KEEP_PARTIES.length}`);
  if (keepBaskets.length !== SEED_KEYS.length || keepBookings.length !== SEED_KEYS.length) throw new Error("ไม่พบของ seed ครบ (รัน seed ก่อน) — ไม่ลบอะไร");

  // 2) ตารางลูกของการจอง (Trip*/Sell* ที่มี bookingId) — ลบแถวที่ผูกการจองที่ไม่ใช่ของ seed
  const del = async (table: string, where: string, params: unknown[]) => {
    const rows = await q<{ id: string }>(`DELETE FROM "${table}" WHERE "tenantId" = $1 AND ${where} RETURNING id`, [T, ...params]);
    add(table, rows.length);
    for (const r of rows) deleted.add(String(r.id));
    return rows.length;
  };
  const doomedBookings = (await q<{ id: string }>(`SELECT id FROM "TripBooking" WHERE "tenantId" = $1 AND NOT (id = ANY($2::text[]))`, [T, keepBookings])).map((r) => r.id);
  for (const id of doomedBookings) deleted.add(id);
  const childTables = (await q<{ t: string }>(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables x USING (table_schema, table_name)
     WHERE c.table_schema = current_schema() AND x.table_type = 'BASE TABLE' AND c.column_name = 'bookingId' AND (c.table_name LIKE 'Trip%' OR c.table_name LIKE 'Sell%')
       AND c.table_name NOT IN ('TripHold') AND EXISTS (SELECT 1 FROM information_schema.columns z WHERE z.table_schema = c.table_schema AND z.table_name = c.table_name AND z.column_name = 'tenantId')
     ORDER BY 1`,
  )).map((r) => r.t);
  for (const t of childTables) await del(t, `"bookingId" = ANY($2::text[])`, [doomedBookings]);
  // hold: ไม่ผูกตะกร้า/การจองของ seed ⇒ ลบ (ACTIVE/EXPIRED/RELEASED เหมือนกัน — seed ไม่สร้าง hold ลอย)
  await del("TripHold", `NOT (COALESCE("basketId", '') = ANY($2::text[]) OR COALESCE("bookingId", '') = ANY($3::text[]))`, [keepBaskets, keepBookings]);
  await del("TripBooking", `id = ANY($2::text[])`, [doomedBookings]);
  await del("SellBasket", `NOT (id = ANY($2::text[]))`, [keepBaskets]);

  // 3) Party นอกฟิกซ์เจอร์ที่ไม่มีแถวไหน (ทุกตาราง · ทุกร้าน) อ้างแล้ว
  const extraParties = (await q<{ id: string }>(`SELECT id FROM "Party" WHERE "tenantId" = $1 AND NOT (id = ANY($2::text[]))`, [T, KEEP_PARTIES])).map((r) => r.id);
  const refCols = await q<{ t: string; c: string }>(
    `SELECT c.table_name AS t, c.column_name AS c FROM information_schema.columns c JOIN information_schema.tables x USING (table_schema, table_name)
     WHERE c.table_schema = current_schema() AND x.table_type = 'BASE TABLE' AND c.column_name ILIKE '%partyid%' AND c.table_name <> 'Party' ORDER BY 1, 2`,
  );
  const kept: string[] = [];
  for (const p of extraParties) {
    let refs = 0;
    for (const { t, c } of refCols) refs += Number((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "${t}" WHERE "${c}" = $1`, [p]))[0]?.n ?? 0);
    if (refs) { kept.push(`${p} (${refs} แถวอ้าง)`); continue; }
    await del("Party", `id = $2`, [p]);
  }
  if (kept.length) console.log(`  ⚠️ Party นอกฟิกซ์เจอร์ที่ยังมีแถวอ้าง (ไม่ลบ): ${kept.join(", ")}`);

  // 4) audit / outbox ที่อ้าง id ที่ลบ (ร้าน seed เท่านั้น)
  const ids = [...deleted];
  if (ids.length) {
    add("AuditLog", (await q(`DELETE FROM "AuditLog" WHERE "tenantId" = $1 AND "targetId" = ANY($2::text[]) RETURNING id`, [T, ids])).length);
    add("OutboxEvent", (await q(
      `DELETE FROM "OutboxEvent" o WHERE o."tenantId" = $1 AND EXISTS (SELECT 1 FROM unnest($2::text[]) x WHERE o."payload"::text LIKE '%"' || x || '"%' OR o."idempotencyKey" LIKE '%' || x || '%') RETURNING o.id`,
      [T, ids],
    )).length);
  }

  // 5) ตัวนับรอบ = แถวที่เหลือ (สูตรเดียวกับค่าคงที่ D.3 ของข้อสอบ T0.6: sold = ที่นั่งของการจองที่ขายแล้ว · held = hold ACTIVE)
  const fixed = await q<{ id: string; localDate: string; sold0: number; sold: number; held0: number; held: number }>(
    `WITH s AS (
       SELECT d.id, d."localDate"::text AS "localDate", d.sold AS sold0, d.held AS held0,
         (SELECT COALESCE(sum(i.qty), 0)::int FROM "TripBookingItem" i JOIN "TripBooking" b ON b.id = i."bookingId" LEFT JOIN "TripPaxType" p ON p.id = i."paxTypeId"
           WHERE i."departureId" = d.id AND i.active AND i.kind IN ('SEAT','BERTH') AND COALESCE(p."countsCapacity", true)
             AND b.status IN ('CONFIRMED','PART_PAID','PAID','TRAVELLED','NO_SHOW')) AS sold,
         (SELECT COALESCE(sum(h."qtyPublic" + h."qtyAllot"), 0)::int FROM "TripHold" h WHERE h."departureId" = d.id AND h.status = 'ACTIVE') AS held
       FROM "TripDeparture" d WHERE d."tenantId" = $1)
     UPDATE "TripDeparture" d SET sold = s.sold, held = s.held, "updatedAt" = now() FROM s
     WHERE d.id = s.id AND d."tenantId" = $1 AND (d.sold <> s.sold OR d.held <> s.held)
     RETURNING d.id, s."localDate", s.sold0, s.sold, s.held0, s.held`,
    [T],
  );
  add("TripDeparture(ตัวนับ)", fixed.length);
  for (const f of fixed) console.log(`  รอบ ${f.localDate} …${f.id.slice(-6)}: sold ${f.sold0}→${f.sold} · held ${f.held0}→${f.held}`);

  // 6) ตรวจหลังล้าง (ในธุรกรรม)
  const after = (await q<{ h: number; p: number; b: number }>(
    `SELECT (SELECT count(*)::int FROM "TripHold" WHERE "tenantId" = $1 AND status = 'ACTIVE') AS h,
            (SELECT count(*)::int FROM "TripBooking" WHERE "tenantId" = $1 AND status IN ('HOLD','PENDING')) AS p,
            (SELECT count(*)::int FROM "TripBooking" WHERE "tenantId" = $1) AS b`,
    [T],
  ))[0];
  console.log(`[${LABEL}] ${APPLY ? "ลงจริง" : "dry-run (ROLLBACK)"} · ลบ/แก้ต่อตาราง: ${JSON.stringify(counts)}`);
  console.log(`[${LABEL}] หลังล้าง: hold ACTIVE ${after?.h} · การจอง HOLD/PENDING ${after?.p} · การจองทั้งหมด ${after?.b}`);
  await q(APPLY ? "COMMIT" : "ROLLBACK");
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, apply: APPLY, host: mark, tenantId: T, counts, after })}`);
  code = 0;
} catch (e) {
  await q("ROLLBACK").catch(() => undefined);
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)} — ROLLBACK ไม่มีการเขียน`);
} finally {
  client.release();
  await pool.end().catch(() => undefined);
}
process.exit(code);
