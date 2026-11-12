// qc-trips-p0.1.mts — ข้อสอบใบ P0.1 ของ RUN TRIPS: ฟิกซ์เจอร์ · ด่าน host · seed รันซ้ำ · แยกร้าน
//
// ใช้: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-p0.1.mts
//   (ข้อสอบนี้เรียก seed-trips-qc.mts ซ้ำเองในหมวด C — ต้องรัน seed มาก่อนอย่างน้อย 1 ครั้ง)
//
// หมวด:
//   A ฟิกซ์เจอร์ (ไม่แตะฐาน): assertFixtureArithmetic ผ่าน + จับค่าที่แก้ผิดได้ (positive control) + ตัวเลข README ตรงตัว
//   B ด่าน host (process ลูก + DATABASE_URL ปลอม · ไม่ต่อฐานใด ๆ): prod / RUN อื่น / host อื่น / .env / APP_ENV ⇒ exit 4 · host เลนที่ถูก ⇒ ผ่าน
//   C seed: ร้าน 2 ร้าน slug ตามฟิกซ์เจอร์ · ตั๋ว 350/200 · รันซ้ำแล้วจำนวน + updatedAt เท่าเดิม และไม่มีการเขียน
//   D แยกร้าน: tenantDb ของร้านหนึ่งมองไม่เห็น Party/ตั๋วของอีกร้าน
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTripsQcEnv, OTHER_RUN_QC_HOST_MARKS } from "./trips-qc-env.mjs";
import { TRIPS_QC_HOSTS, TRIPS_QC_MAIN_HOST } from "./trips-qc-hosts.mjs";
import * as FX from "./trips-fixture.mjs";
import type { TripsFixture } from "./trips-fixture.mjs";

const LABEL = "qc-trips-p0.1";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
loadTripsQcEnv(LABEL);

type Res = "PASS" | "FAIL";
const cks: { id: string; name: string; res: Res; why: string }[] = [];
function record(id: string, name: string, ok: boolean, why = "") {
  cks.push({ id, name, res: ok ? "PASS" : "FAIL", why: ok ? "" : why });
  console.log(`${ok ? "✅" : "❌"} ${id} ${name}${ok ? "" : ` — ${why}`}`);
}
const eqv = (id: string, name: string, got: unknown, want: unknown) => record(id, name, JSON.stringify(got) === JSON.stringify(want), `ได้ ${JSON.stringify(got)} ต้องการ ${JSON.stringify(want)}`);
const throws = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

// ═══════════════ A. ฟิกซ์เจอร์ ═══════════════
console.log("\n── A: ฟิกซ์เจอร์ (เลขคณิต + ตัวเลข README) ──");
{
  let n = 0;
  const err = throws(() => (n = FX.assertFixtureArithmetic().checks));
  record("A-1", `assertFixtureArithmetic ผ่าน (${n} จุด ≥ 100)`, err === null && n >= 100, err ?? `ตรวจแค่ ${n} จุด`);

  // positive control: แก้ค่าในสำเนาแล้วต้อง throw (ตัวตรวจไม่ใช่ no-op)
  const mut = (edit: (f: TripsFixture) => void): string | null => {
    const f = structuredClone(FX.TRIPS_FIXTURE) as TripsFixture;
    edit(f);
    return throws(() => FX.assertFixtureArithmetic(f));
  };
  const e1 = mut((f) => (f.booking0142.totalSatang = 1_145_100));
  record("A-2", "positive control: แก้ยอด TR-6911-0142 +1 บาท ⇒ ตัวตรวจ throw", !!e1 && e1.includes("TR-6911-0142"), e1 ?? "ไม่ throw");
  const e2 = mut((f) => (f.deckV2.cabins[0].paidSatang = 7_779_999));
  record("A-3", "positive control: แก้ยอดรับ M1 ⇒ ตัวตรวจ throw (ผังเรือ)", !!e2 && e2.includes("รับแล้ว"), e2 ?? "ไม่ throw");
  const e3 = mut((f) => (f.statement.whtSatang = 45_766));
  record("A-4", "positive control: แก้ภาษีหัก ณ ที่จ่ายใบแจ้งยอด ⇒ throw", !!e3 && e3.includes("ST-PTD-1"), e3 ?? "ไม่ throw");

  eqv("A-5", "TR-6911-0142 = ฿11,450", FX.BOOKING_TR_0142.totalSatang, 1_145_000);
  eqv("A-6", "เอเจนซี่ 2 ผู้ใหญ่: 8,200 − 1,050 = 7,150 · หัก 3% ⇒ 7,181.50", [FX.AGENCY_CASE_2ADULTS.collectSatang, FX.AGENCY_CASE_2ADULTS.commissionSatang, FX.AGENCY_CASE_2ADULTS.toShopNoWhtSatang, FX.AGENCY_CASE_2ADULTS.toShopSatang], [820_000, 105_000, 715_000, 718_150]);
  eqv("A-7", "ใบแจ้งยอด ST-6911-PTD-1 = ฿86,121.15 · ชุดเดิม ฿86,300 ติดป้าย legacy", [FX.STATEMENT_ST_PTD_1.ref, FX.STATEMENT_ST_PTD_1.totalSatang, FX.STATEMENT_LEGACY_EXAMPLE_ONLY.totalSatang, FX.STATEMENT_LEGACY_EXAMPLE_ONLY.legacy], ["ST-6911-PTD-1", 8_612_115, 8_630_000, true]);
  eqv("A-8", "Liveaboard D1: 69,400 · มัดจำ 19,740 · งวด 2 49,660 ภายใน 16 ธ.ค. 2569", [FX.BOOKING_LB_0031.totalSatang, FX.BOOKING_LB_0031.depositSatang, FX.BOOKING_LB_0031.balanceSatang, FX.BOOKING_LB_0031.balanceDue], [6_940_000, 1_974_000, 4_966_000, "2026-12-16"]);
  eqv("A-9", "ผังเรือ v2: 3 ดาดฟ้า 10 เคบิน 20 เตียง · 293,100 / 188,450 / 104,650", [Object.keys(FX.DECKPLAN_V2.decks).length, FX.DECKPLAN_V2.cabins.length, FX.DECKPLAN_V2_TOTALS.berths, FX.DECKPLAN_V2_TOTALS.bookedSatang, FX.DECKPLAN_V2_TOTALS.paidSatang, FX.DECKPLAN_V2_TOTALS.outstandingSatang], [3, 10, 20, 29_310_000, 18_845_000, 10_465_000]);
  eqv("A-10", "ผังเรือ v3: 12 เคบิน 24 เตียง เต็มลำ 753,600 เริ่ม 1 พ.ค. 2570", [FX.DECKPLAN_V3.cabins, FX.DECKPLAN_V3.berths, FX.DECKPLAN_V3.fullBoatSatang, FX.DECKPLAN_V3.effectiveFrom], [12, 24, 75_360_000, "2027-05-01"]);
  eqv("A-11", "ส. 14 ราชา: 15/24 · 6 การจอง · 50,400 + 8,400 · คอมฯ 4,095 · ต้นทุน 21,500 · กำไร 24,805", [FX.DEPARTURE_RACHA_1114.sold, FX.DEPARTURE_RACHA_1114.capacity, FX.DEPARTURE_RACHA_1114.bookings.length, FX.DEPARTURE_RACHA_1114.revenueSatang, FX.DEPARTURE_RACHA_1114.parkSatang, FX.DEPARTURE_RACHA_1114.commission.totalSatang, FX.DEPARTURE_RACHA_1114.costSatang, FX.DEPARTURE_RACHA_1114.grossProfitSatang], [15, 24, 6, 5_040_000, 840_000, 409_500, 2_150_000, 2_480_500]);
  eqv("A-12", "ตั๋ว TK-6911-0318 = ฿900 (2×350 + 1×200)", [FX.TICKET_ORDER_TK_0318.totalSatang, FX.TICKET_ORDER_TK_0318.lines.map((l) => [l.qty, l.unitSatang])], [90_000, [[2, 35_000], [1, 20_000]]]);
  eqv("A-13", "RC-6911-0588: 9,299.07 + 650.93 + 1,500 = 11,450", [FX.RECEIPT_RC_0588.preVatSatang, FX.RECEIPT_RC_0588.vatSatang, FX.RECEIPT_RC_0588.parkPassThroughSatang, FX.RECEIPT_RC_0588.totalSatang], [929_907, 65_093, 150_000, 1_145_000]);
  eqv("A-14", "คืนเงิน TR-6912-0188: 23 วัน · 50% · คืน 6,475 · ร้านเก็บ 4,975", [FX.REFUND_TR_0188.daysBefore, FX.REFUND_TR_0188.refundBp, FX.REFUND_TR_0188.refundSatang, FX.REFUND_TR_0188.keptSatang], [23, 5_000, 647_500, 497_500]);
  eqv("A-15", "ระดับ A 20 / B 15 / C 10 · PTD ระดับ B 15% วงเงิน 150,000 เทอม 15 วัน · Blue Planet ระดับ C 10%", [FX.AGENCY_TIERS.A.tourBp, FX.AGENCY_TIERS.B.tourBp, FX.AGENCY_TIERS.C.tourBp, FX.AGENCY_PTD.code, FX.AGENCY_PTD.tier, FX.AGENCY_PTD.commissionBp, FX.AGENCY_PTD.creditLimitSatang, FX.AGENCY_PTD.termDays, FX.AGENCY_BLUE_PLANET.tier, FX.AGENCY_BLUE_PLANET.commissionBp], [2000, 1500, 1000, "PTD", "B", 1500, 15_000_000, 15, "C", 1000]);
  eqv("A-16", "ราคาราชา: ผู้ใหญ่ 3,500 · เด็ก 2,450 · อุทยาน 600/300 · กล้อง 500", [FX.PRODUCT_RACHA.adultSatang, FX.PRODUCT_RACHA.childSatang, FX.PRODUCT_RACHA.parkAdultSatang, FX.PRODUCT_RACHA.parkChildSatang, FX.PRODUCT_RACHA.extras.camera.satang], [350_000, 245_000, 60_000, 30_000, 50_000]);
  eqv("A-17", "ร้าน: อันดามันไดฟ์ DIVE_SHOP (ทัวร์+Liveaboard) · อควาเรียมอันดามัน ATTRACTION (ตั๋ว)", [FX.SHOP_DIVE.tenant.name, FX.SHOP_DIVE.template, [...FX.SHOP_DIVE.sells], FX.SHOP_AQUARIUM.tenant.name, FX.SHOP_AQUARIUM.template, [...FX.SHOP_AQUARIUM.sells]], ["อันดามันไดฟ์", "DIVE_SHOP", ["TOUR", "LIVEABOARD"], "อควาเรียมอันดามัน", "ATTRACTION", ["TICKET"]]);

  // ไฟล์ฟิกซ์เจอร์ต้องเป็นค่าล้วน: ไม่มี import ใด ๆ · เงินไม่มีทศนิยม
  const src = readFileSync(join(ROOT, "scripts/trips-fixture.mts"), "utf8");
  const imports = src.split("\n").filter((l) => /^\s*import\s/.test(l));
  record("A-18", "trips-fixture.mts ไม่ import อะไรเลย (ไม่มี prisma / @/)", imports.length === 0, imports.join(" | "));
  const nonInt: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "number" && /Satang$/.test(path) && !Number.isInteger(v)) nonInt.push(path);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(FX.TRIPS_FIXTURE, "");
  record("A-19", "ทุกฟิลด์ *Satang เป็นจำนวนเต็ม", nonInt.length === 0, nonInt.slice(0, 5).join(", "));
  record("A-20", "ส่งออกรายการ TODO + DISCREPANCIES (ไม่แต่งตัวเลขที่หาไม่พบ)", FX.TRIPS_FIXTURE_TODO.length > 0 && FX.TRIPS_FIXTURE_DISCREPANCIES.length > 0, "ว่าง");
}

// ═══════════════ B. ด่าน host (process ลูก · URL ปลอม · ไม่ต่อฐาน) ═══════════════
console.log("\n── B: ด่าน host ของ loadTripsQcEnv ──");
{
  const TSX = join(ROOT, "node_modules/.bin/tsx");
  const envMod = join(ROOT, "scripts/trips-qc-env.mts");
  const probe = `import(${JSON.stringify(envMod)}).then((m) => { m.loadTripsQcEnv("probe"); console.log("GUARD_PASSED"); });`;
  const url = (host: string, q = "") => `postgresql://qc:fake@${host}.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require${q}`;
  const run = (env: Record<string, string>): { code: number | null; out: string } => {
    // env ใหม่ทั้งชุด — ไม่สืบ DATABASE_URL จริงของข้อสอบนี้ · QC_ENV_FILE ชี้ไฟล์ที่ไม่มี (ไม่อ่าน .env ใด ๆ)
    const r = spawnSync(TSX, ["-e", probe], { cwd: ROOT, encoding: "utf8", timeout: 60_000, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", QC_ENV_FILE: "/nonexistent/.env.qc-trips-probe", ...env } as unknown as NodeJS.ProcessEnv }); // ORACLE-EDIT (ผู้คุม 12 พ.ย.): cast — typecheck TS2769 (NODE_ENV)
    return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
  };
  const L1 = TRIPS_QC_HOSTS[1];
  const L2 = TRIPS_QC_HOSTS[2];
  const refused = (id: string, name: string, env: Record<string, string>) => {
    const r = run(env);
    record(id, `${name} ⇒ exit 4`, r.code === 4 && !r.out.includes("GUARD_PASSED"), `exit=${r.code} · ${r.out.split("\n").filter(Boolean).slice(-1)[0] ?? ""}`);
  };
  {
    const r = run({ DATABASE_URL: url(`${L1}-pooler`), DIRECT_URL: url(L1), TRIPS_QC_HOST: L1 });
    record("B-1", "positive control: host เลน l1 + TRIPS_QC_HOST=l1 ⇒ ผ่านด่าน (exit 0)", r.code === 0 && r.out.includes("GUARD_PASSED"), `exit=${r.code} · ${r.out.slice(-200)}`);
  }
  refused("B-2", "DATABASE_URL production (ep-royal-night)", { DATABASE_URL: url("ep-royal-night-12345-pooler"), DIRECT_URL: url("ep-royal-night-12345") });
  refused("B-3", "DIRECT_URL production ขณะ DATABASE_URL เป็นเลน", { DATABASE_URL: url(`${L1}-pooler`), DIRECT_URL: url("ep-royal-night-12345"), TRIPS_QC_HOST: L1 });
  refused("B-4", "prod ซ่อนใน query string ของ host เลน", { DATABASE_URL: url(`${L1}-pooler`, "&options=ep-royal-night"), DIRECT_URL: url(L1), TRIPS_QC_HOST: L1 });
  {
    const bad = OTHER_RUN_QC_HOST_MARKS.map((m) => ({ m, r: run({ DATABASE_URL: url(`${m}-abc123-pooler`), DIRECT_URL: url(`${m}-abc123`), TRIPS_QC_HOST: L1 }) })).filter((x) => x.r.code !== 4);
    record("B-5", `host QC ของ RUN อื่นทั้ง ${OTHER_RUN_QC_HOST_MARKS.length} ตัว (SVC/HR/POS/CRM/ACC) ⇒ exit 4 ทุกตัว`, bad.length === 0, bad.map((x) => `${x.m}=${x.r.code}`).join(", "));
  }
  refused("B-6", "DIRECT_URL ชี้ QC ของ SVC (ep-mute-scene) ขณะ DATABASE_URL เป็นเลน", { DATABASE_URL: url(`${L1}-pooler`), DIRECT_URL: url("ep-mute-scene-abc123"), TRIPS_QC_HOST: L1 });
  refused("B-7", "host ที่ไม่รู้จัก", { DATABASE_URL: url("ep-unknown-host-999"), DIRECT_URL: url("ep-unknown-host-999") });
  refused("B-8", "URL อ่าน host ไม่ได้", { DATABASE_URL: "not a url", DIRECT_URL: "not a url" });
  refused("B-9", "QC_ENV_FILE=.env (production)", { QC_ENV_FILE: ".env", DATABASE_URL: url(`${L1}-pooler`), DIRECT_URL: url(L1), TRIPS_QC_HOST: L1 });
  refused("B-10", "APP_ENV=production บน host เลน", { APP_ENV: "production", DATABASE_URL: url(`${L1}-pooler`), DIRECT_URL: url(L1), TRIPS_QC_HOST: L1 });
  refused("B-11", "host เลน l1 แต่ไม่ตั้ง TRIPS_QC_HOST (ค่าเริ่ม = ฐานหลัก)", { DATABASE_URL: url(`${L1}-pooler`), DIRECT_URL: url(L1) });
  refused("B-12", "host เลน l2 ขณะ TRIPS_QC_HOST=l1", { DATABASE_URL: url(`${L2}-pooler`), DIRECT_URL: url(L2), TRIPS_QC_HOST: L1 });
  refused("B-13", "ไม่มี DATABASE_URL", { DIRECT_URL: url(L1), TRIPS_QC_HOST: L1 });
  {
    const sh = readFileSync(join(ROOT, "scripts/qc-trips.sh"), "utf8");
    const inSh = [...sh.matchAll(/^\s*(ep-[a-z0-9-]+)\*\)/gm)].map((m) => m[1]).sort();
    eqv("B-14", "รายการ host ใน qc-trips.sh = trips-qc-hosts.mts", inSh, [...TRIPS_QC_HOSTS].sort());
    record("B-15", "ฐานหลัก TRIPS ไม่อยู่ในรายการ RUN อื่น", !OTHER_RUN_QC_HOST_MARKS.some((m) => TRIPS_QC_HOSTS.some((h) => h.startsWith(m))) && TRIPS_QC_HOSTS[0] === TRIPS_QC_MAIN_HOST, "ชนกัน");
  }
}

// ═══════════════ C. seed ═══════════════
console.log("\n── C: seed ร้านตัวอย่าง ──");
const { prisma, tenantDb } = await import("@/lib/core/db");
const D = FX.SHOP_DIVE;
const A = FX.SHOP_AQUARIUM;
{
  const tenants = await prisma.tenant.findMany({ where: { id: { in: [D.tenant.id, A.tenant.id] } }, orderBy: { id: "asc" } });
  eqv("C-1", "ร้าน 2 ร้าน slug andaman-dive · andaman-aquarium", tenants.map((t) => [t.id, t.slug, t.name, t.status]), [
    [A.tenant.id, "andaman-aquarium", "อควาเรียมอันดามัน", "ACTIVE"],
    [D.tenant.id, "andaman-dive", "อันดามันไดฟ์", "ACTIVE"],
  ]);
  const units = await prisma.businessUnit.findMany({ where: { tenantId: { in: [D.tenant.id, A.tenant.id] } }, orderBy: { id: "asc" } });
  eqv("C-2", "หน่วย: อันดามันไดฟ์ BOOKING · อควาเรียม TICKET (ร้านละ 1)", units.map((u) => [u.tenantId, u.type, u.slug]), [
    [A.tenant.id, "TICKET", "andaman-aquarium"],
    [D.tenant.id, "BOOKING", "andaman-dive"],
  ]);
  const ms = await prisma.membership.findMany({ where: { tenantId: { in: [D.tenant.id, A.tenant.id] } }, orderBy: { id: "asc" }, select: { userId: true, tenantId: true, role: true, permissions: true, acceptedAt: true } });
  eqv("C-3", "ผู้ใช้ร้านละ 2 (เจ้าของ OWNER + พนักงาน STAFF) · ยอมรับแล้ว", ms.map((m) => [m.userId, m.role, !!m.acceptedAt]), [...A.users, ...D.users].sort((x, y) => x.membershipId.localeCompare(y.membershipId)).map((u) => [u.userId, u.role, true]));
  const gate = ms.find((m) => m.userId === A.users[1].userId);
  eqv("C-4", "พนักงานประตูมีสิทธิ์ ticket.checkin.scan", gate?.permissions, { "ticket.checkin.scan": true });
  const parties = await prisma.party.findMany({ where: { tenantId: D.tenant.id }, orderBy: { id: "asc" }, select: { id: true, kind: true, name: true } });
  eqv("C-5", "Party อันดามันไดฟ์ 9 (เอเจนซี่ 2 + ลูกค้า 7)", parties.length, FX.DIVE_PARTIES.length);
  eqv("C-6", "เอเจนซี่เป็น COMPANY: บจก. ภูเก็ตทราเวลเดสก์ · Blue Planet Travel", parties.filter((p) => p.kind === "COMPANY").map((p) => p.name).sort(), ["Blue Planet Travel", "บจก. ภูเก็ตทราเวลเดสก์"].sort());
  const ev = await prisma.ticketEvent.findMany({ where: { tenantId: A.tenant.id }, include: { ticketTypes: { orderBy: { sortOrder: "asc" } } } });
  eqv("C-7", "อีเวนต์ตั๋ว 1 รายการ เปิดขาย (PUBLISHED) รอบ 11 พ.ย. 13:00", ev.map((e) => [e.name, e.status, e.startAt.toISOString(), e.unitId]), [[FX.SEED_TICKET_EVENT.name, "PUBLISHED", "2026-11-11T06:00:00.000Z", A.units.main.id]]);
  eqv("C-8", "ประเภทตั๋ว ผู้ใหญ่ 350 · เด็ก 200 · ผู้สูงอายุ 200 (สตางค์)", ev[0]?.ticketTypes.map((t) => [t.name, t.priceSatang, t.active]), FX.AQUARIUM_PRODUCT.types.map((t) => [t.name, t.priceSatang, true]));
  type Expected = { dive: { tenantId: string; partyIds: string[] }; aquarium: { tenantId: string; ticketEventId: string; ticketTypeIds: Record<string, string> } };
  let exp: Expected | null = null;
  try {
    exp = JSON.parse(readFileSync(join(ROOT, "scripts/trips-expected.json"), "utf8")) as Expected;
  } catch {
    exp = null;
  }
  eqv("C-9", "trips-expected.json ตรงกับฐาน (id อีเวนต์/ประเภทตั๋ว/Party)", exp && [exp.dive.tenantId, exp.dive.partyIds.length, exp.aquarium.ticketEventId, Object.values(exp.aquarium.ticketTypeIds).sort()], [D.tenant.id, FX.DIVE_PARTIES.length, ev[0]?.id, (ev[0]?.ticketTypes ?? []).map((t) => t.id).sort()]);

  // รันซ้ำ: จำนวน + updatedAt ต้องเท่าเดิม และ seed ต้องรายงานว่าไม่มีการเขียน
  const snap = async () => {
    const w = { tenantId: { in: [D.tenant.id, A.tenant.id] } };
    const maxU = async (rows: { updatedAt: Date }[]) => rows.map((r) => r.updatedAt.toISOString()).sort().join(",");
    return {
      tenants: await maxU(await prisma.tenant.findMany({ where: { id: { in: [D.tenant.id, A.tenant.id] } }, select: { updatedAt: true } })),
      units: await maxU(await prisma.businessUnit.findMany({ where: w, select: { updatedAt: true } })),
      memberships: await maxU(await prisma.membership.findMany({ where: w, select: { updatedAt: true } })),
      parties: await maxU(await prisma.party.findMany({ where: w, select: { updatedAt: true } })),
      events: await maxU(await prisma.ticketEvent.findMany({ where: w, select: { updatedAt: true } })),
      types: await maxU(await prisma.ticketType.findMany({ where: w, select: { updatedAt: true } })),
      users: await prisma.user.count({ where: { email: { in: FX.TRIPS_EMAILS } } }),
    };
  };
  const before = await snap();
  const r = spawnSync(join(ROOT, "node_modules/.bin/tsx"), ["scripts/seed-trips-qc.mts"], { cwd: ROOT, env: process.env, encoding: "utf8", timeout: 10 * 60_000, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  record("C-10", "seed รันซ้ำ exit 0", r.status === 0, `exit=${r.status} · ${out.split("\n").filter(Boolean).slice(-2).join(" ¦ ")}`);
  record("C-11", "seed รันซ้ำรายงาน 'ไม่มีการเขียน' + created/updated ว่าง", out.includes("ไม่มีการเขียน") && out.includes(`"created":{},"updated":{}`), out.split("\n").filter((l) => l.includes("JSON_SUMMARY") || l.includes("เขียน")).join(" ¦ "));
  const after = await snap();
  eqv("C-12", "หลังรันซ้ำ: จำนวนแถว + updatedAt ทุกตารางเท่าเดิม", after, before);
  eqv("C-13", "ผู้ใช้ TRIPS 4 คน (อีเมล trips-qc-*@shark.local)", after.users, 4);
}

// ═══════════════ D. แยกร้าน ═══════════════
console.log("\n── D: แยกร้าน (tenantDb) ──");
{
  const dbD = tenantDb({ tenantId: D.tenant.id });
  const dbA = tenantDb({ tenantId: A.tenant.id });
  const diveIds = FX.DIVE_PARTIES.map((p) => p.id);
  const aqIds = FX.AQUARIUM_PARTIES.map((p) => p.id);
  eqv("D-1", "ขอบเขตร้านอควาเรียมมองไม่เห็น Party ของอันดามันไดฟ์", (await dbA.party.findMany({ where: { id: { in: diveIds } } })).length, 0);
  eqv("D-2", "ขอบเขตร้านอันดามันไดฟ์มองไม่เห็น Party ของอควาเรียม", (await dbD.party.findMany({ where: { id: { in: aqIds } } })).length, 0);
  eqv("D-3", "ขอบเขตอันดามันไดฟ์เห็น Party ของตัวเองครบ 9", await dbD.party.count({ where: { id: { in: diveIds } } }), diveIds.length);
  const pattra = await prisma.party.findMany({ where: { name: "ภัทรา สายใจ", tenantId: { in: [D.tenant.id, A.tenant.id] } }, select: { id: true, tenantId: true } });
  eqv("D-4", "ภัทรา สายใจ อยู่ร้านละแถว (ชื่อซ้ำข้ามร้าน ไม่รวมกัน)", pattra.map((p) => p.tenantId).sort(), [A.tenant.id, D.tenant.id].sort());
  const byNameA = await dbA.party.findMany({ where: { name: "ภัทรา สายใจ" }, select: { id: true } });
  eqv("D-5", "ค้นชื่อในขอบเขตอควาเรียม ได้เฉพาะแถวของอควาเรียม", byNameA.map((p) => p.id), aqIds);
  const crossUnit = tenantDb({ tenantId: D.tenant.id, unitId: A.units.main.id });
  eqv("D-6", "ขอบเขตร้านอันดามันไดฟ์ + หน่วยอควาเรียม มองไม่เห็นอีเวนต์/ประเภทตั๋ว", [await crossUnit.ticketEvent.count(), await crossUnit.ticketType.count()], [0, 0]);
  const ownUnit = tenantDb({ tenantId: A.tenant.id, unitId: A.units.main.id });
  eqv("D-7", "ขอบเขตอควาเรียม + หน่วยตัวเอง เห็นอีเวนต์ 1 · ประเภทตั๋ว 3", [await ownUnit.ticketEvent.count(), await ownUnit.ticketType.count()], [1, 3]);
  const diveUsersInAq = await prisma.membership.count({ where: { tenantId: A.tenant.id, userId: { in: D.users.map((u) => u.userId) } } });
  eqv("D-8", "ผู้ใช้อันดามันไดฟ์ไม่มีสิทธิ์ในร้านอควาเรียม", diveUsersInAq, 0);
}
await prisma.$disconnect();

const failed = cks.filter((c) => c.res === "FAIL");
const passed = cks.length - failed.length;
console.log(`\n===== QC TRIPS P0.1 · ฟิกซ์เจอร์ + seed + ด่าน host =====\nผ่าน ${passed}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id) })}`);
process.exit(failed.length > 0 ? 1 : 0);
