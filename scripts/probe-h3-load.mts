// probe-h3-load.mts — SVC H.3 · load test ด่านพร้อมกัน (ใบ §2 ข้อ 10 · §7): 20 คำขอ createBooking พร้อมกันบนประเภทห้องที่เหลือ 1 ห้อง ⇒ สำเร็จ 1 · ที่เหลือ AVAILABILITY_CHANGED ·
//   ไม่มี nights/occupancy ส่วนเกิน · ไม่มี 40P01/deadlock ดิบ · รัน 3 รอบ + รอบลำดับล็อกสลับ (2 ประเภท [A,B]/[B,A] อย่างละ 10) · พิมพ์ JSON_SUMMARY บรรทัดท้าย
//   ร้านชั่วคราว slug `svc-h3-load-*` · อีเมล `svc-h3-load-*` · ล้างใน finally · ไม่แก้ src · ข้อสอบ qc-svc-h.3 K-15 เรียกสคริปต์นี้
// รัน: cd /root/projects/shark-svc-l2 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-h3-load.mts
// JSON_SUMMARY {"passed":bool,"rounds":[{"name","total","ok","changed","other":[],"threw":[],"nights","occ","deadlock"}],"why":[]}
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

type Any = any;
const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "probe-h3-load";
const SLUG = "svc-h3-load-";
const BOOKING = "src/lib/modules/hotel/booking.ts";
loadSvcQcEnv(LABEL);
if (process.env.CI || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: env ต้องห้าม`); process.exit(4); }
delete process.env.SVC_QC_CLOCK;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 240);
const J = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const DAY = 86_400_000;
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const W = (n: number) => addDays(today, n);

const { prisma } = (await import("@/lib/core/db")) as Any;
type Round = { name: string; total: number; ok: number; changed: number; other: string[]; threw: string[]; nights: number; occ: number; deadlock: boolean };
const rounds: Round[] = [];
const why: string[] = [];
const tenantIds: string[] = [];
let tables: string[] = [];
async function cleanup() {
  if (!tenantIds.length) return;
  if (!tables.length) {
    const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
    tables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  }
  let pending = [...tables];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); } catch { next.push(t); } }
    pending = next;
  }
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: SLUG } } });
}

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) { tenantIds.push(...stale.map((t: Any) => t.id)); await cleanup(); tenantIds.length = 0; }
  if (!existsSync(join(ROOT, BOOKING))) throw new Error(`ยังไม่มี ${BOOKING}`);
  const bk = (await import(pathToFileURL(join(ROOT, BOOKING)).href)) as Any;
  if (typeof bk.createBooking !== "function") throw new Error(`${BOOKING} ยังไม่มี export createBooking`);
  const rates = (await import("@/lib/modules/hotel/rates")) as Any;

  const t = await prisma.tenant.create({ data: { name: "QC H3 load", slug: `${SLUG}${uid()}` } });
  tenantIds.push(t.id);
  const ctx = { tenantId: t.id };
  const unit = await prisma.businessUnit.create({ data: { tenantId: t.id, type: "HOTEL", name: "โรงแรม load", slug: `u-${uid()}` } });
  const mkType = async (name: string) => (await prisma.hotelRoomType.create({ data: { tenantId: t.id, unitId: unit.id, name, rentMode: "NIGHTLY", baseRateSatang: 100_000, capacity: 2, baseOccupancy: 2, maxOccupancy: 2 } })).id as string;
  const RT: Record<string, string> = { one: await mkType("ห้องเดียว"), a: await mkType("ประเภท ก"), b: await mkType("ประเภท ข") };
  for (const [k, id] of Object.entries(RT)) await prisma.hotelRoom.create({ data: { tenantId: t.id, unitId: unit.id, number: `${k.toUpperCase()}1`, roomTypeId: id } });
  const userId = `${SLUG}owner-${uid()}`;
  await prisma.user.create({ data: { id: userId, email: `${SLUG}owner-${uid()}@shark.local`, name: "QC load owner" } });
  await prisma.membership.create({ data: { userId, tenantId: t.id, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const OWNER = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId };
  const lr = await rates.listRatePlans(OWNER, ctx, { unitId: unit.id });
  if (!lr?.ok) throw new Error(`listRatePlans: ${J(lr)}`);
  const std = await prisma.hotelRatePlan.findFirst({ where: { tenantId: t.id, unitId: unit.id, code: "STANDARD" } });
  const sr = await rates.saveRates(OWNER, ctx, { unitId: unit.id, ratePlanId: std.id, rows: Object.values(RT).map((id) => ({ roomTypeId: id, seasonId: null, priceWeekdaySatang: 100_000, priceWeekendSatang: 120_000, priceHolidaySatang: null })) });
  if (!sr?.ok) throw new Error(`saveRates: ${J(sr)}`);

  const fire = async (name: string, inputs: Record<string, unknown>[], nightsWhere: Record<string, unknown>, roomNumber: string, date: string) => {
    const rs = await Promise.all(inputs.map((i) => bk.createBooking(OWNER, ctx, { unitId: unit.id, ratePlanId: std.id, source: "PHONE", guest: { name: "ผู้เข้าพัก load", phone: "0800000000" }, ...i }).then((r: Any) => ({ r }), (e: unknown) => ({ threw: errMsg(e) }))));
    const txt = J(rs);
    const r: Round = {
      name, total: inputs.length,
      ok: rs.filter((x: Any) => x.r?.ok === true).length,
      changed: rs.filter((x: Any) => x.r?.ok === false && x.r.code === "AVAILABILITY_CHANGED").length,
      other: rs.filter((x: Any) => x.r && x.r.ok === false && x.r.code !== "AVAILABILITY_CHANGED").map((x: Any) => `${x.r.code}:${x.r.reason ?? ""}`).slice(0, 3),
      threw: rs.filter((x: Any) => x.threw).map((x: Any) => x.threw).slice(0, 3),
      nights: await prisma.hotelBookingNight.count({ where: { tenantId: t.id, counted: true, ...nightsWhere } }),
      occ: await prisma.roomOccupancy.count({ where: { tenantId: t.id, active: true, room: { number: roomNumber }, startDate: { lte: new Date(`${date}T00:00:00.000Z`) }, endDate: { gt: new Date(`${date}T00:00:00.000Z`) } } }),
      deadlock: /40P01|deadlock/i.test(txt),
    };
    rounds.push(r);
    console.log(`  ${r.ok === 1 && r.changed === r.total - 1 && r.nights === 1 && r.occ === 1 && !r.deadlock && !r.other.length && !r.threw.length ? "✅" : "❌"} ${name}: ok ${r.ok} · changed ${r.changed} · other ${r.other.length} · threw ${r.threw.length} · nights ${r.nights} · occ ${r.occ} · deadlock ${r.deadlock}`);
    if (r.other.length) console.log(`     other: ${r.other.join(" | ")}`);
    if (r.threw.length) console.log(`     threw: ${r.threw.join(" | ")}`);
  };
  for (let round = 0; round < 3; round++) {
    const ci = W(10 + round * 2), co = W(11 + round * 2);
    await fire(`รอบ ${round + 1} ห้องเดียว ${ci}`, Array.from({ length: 20 }, () => ({ rooms: [{ roomTypeId: RT.one, adults: 1, children: 0 }], checkIn: ci, checkOut: co })), { roomTypeId: RT.one, date: new Date(`${ci}T00:00:00.000Z`) }, "ONE1", ci);
  }
  {
    const ci = W(20), co = W(21);
    await fire(`รอบ 4 สลับลำดับล็อก [ก,ข]/[ข,ก] ${ci}`, Array.from({ length: 20 }, (_, i) => ({ rooms: i % 2 ? [{ roomTypeId: RT.a, adults: 1, children: 0 }, { roomTypeId: RT.b, adults: 1, children: 0 }] : [{ roomTypeId: RT.b, adults: 1, children: 0 }, { roomTypeId: RT.a, adults: 1, children: 0 }], checkIn: ci, checkOut: co })), { roomTypeId: RT.a, date: new Date(`${ci}T00:00:00.000Z`) }, "A1", ci);
  }
} catch (e) {
  why.push(errMsg(e));
  console.log(`  ❌ ${LABEL}: ${errMsg(e)}`);
} finally {
  try { await cleanup(); } catch (e) { why.push(`cleanup: ${errMsg(e)}`); }
  try { await prisma.$disconnect(); } catch { /* */ }
}
const passed = rounds.length === 4 && rounds.every((r) => r.ok === 1 && r.changed === r.total - 1 && r.nights === 1 && r.occ === 1 && !r.deadlock && !r.other.length && !r.threw.length) && !why.length;
console.log(`JSON_SUMMARY ${JSON.stringify({ passed, rounds, why })}`);
process.exit(passed ? 0 : 1);
