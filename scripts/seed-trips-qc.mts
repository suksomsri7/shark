// seed-trips-qc.mts — ร้านตัวอย่างของ RUN TRIPS (ใบ P0.1) บนฐาน qc-trips
//
// ใช้ (ผู้เรียกครอบล็อกคิวเอง — seed ไม่ถือล็อก):
//   bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-trips-qc.mts
//
// สร้างอะไร (ค่าทั้งหมดอยู่ที่ `scripts/trips-fixture.mts` — แก้ที่นั่นที่เดียว):
//   • ร้าน "อันดามันไดฟ์" (andaman-dive) หน่วย BOOKING 1 · เจ้าของ + ไกด์ · Party: เอเจนซี่ PTD + Blue Planet + ลูกค้า 7 คนจากภาพ
//   • ร้าน "อควาเรียมอันดามัน" (andaman-aquarium) หน่วย TICKET 1 · เจ้าของ + พนักงานประตู · Party: ภัทรา (ชื่อซ้ำข้ามร้านโดยตั้งใจ)
//     + TicketEvent รอบ 13:00 · TicketType ผู้ใหญ่ 350 / เด็ก 200 / ผู้สูงอายุ 200 ผ่าน `ticket/service` ของจริง
//   • ตาราง trips/agency ยังไม่มี (ใบ T0.1) ⇒ ใบนี้ไม่สร้างรอบ/การจอง/สัญญาเอเจนซี่
//   • TRIPS T0.2 ▸ หน่วยที่สองของอันดามันไดฟ์ ชนิด TRIPS (andaman-dive-trips) + แม่แบบค่าตั้ง trips DIVE_SHOP (KEEP_CUSTOM)
//     + สินค้า 4 ตัวของจอ 16 (`TRIPS_SEED_PRODUCTS`) **ผ่าน facade `@/lib/modules/trips`** ด้วยเจ้าของร้าน · รันซ้ำ = อ่านเทียบแล้วแก้เฉพาะที่ต่าง ◂
//
// กติกา:
//   🔴 รันซ้ำ = ไม่มีแถวเพิ่ม และไม่มีการเขียน — อ่านมาเทียบก่อน ต่างเท่านั้นถึงเขียน
//   🔴 ไม่แตะแถวของร้านอื่น · ไม่ลบอะไรเลย (แถวนอกฟิกซ์เจอร์ = แจ้งเตือนเฉย ๆ)
//   ผลท้ายไฟล์: `scripts/trips-expected.json` (id ที่ข้อสอบใช้) · บรรทัด `SEED_SUMMARY {...}` · `JSON_SUMMARY {...}`
import { writeFileSync } from "node:fs";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import {
  AQUARIUM_PARTIES,
  AQUARIUM_PRODUCT,
  DIVE_PARTIES,
  SEED_TICKET_EVENT,
  SHOP_AQUARIUM,
  SHOP_DIVE,
  TRIPS_ACCEPTED_AT,
  TRIPS_EMAILS,
  TRIPS_SEED_PRODUCTS,
  assertFixtureArithmetic,
  // ── T0.5 pricing ──
  PRODUCT_RACHA,
  RACHA_DEPARTURE_PRICE_1231,
  RACHA_SEASONS,
  // ── /T0.5 pricing ──
  type SeedProduct,
  type FixtureParty,
  type FixtureUnit,
  type FixtureUser,
  // ── T0.3 departures ──
  CALENDAR_WEEK_1111,
  TRIPS_AS_OF,
  TRIPS_SEED_CANCEL_REASON,
  TRIPS_SEED_COUNTER_CUTOFF,
  TRIPS_SEED_MATERIALIZE_AT,
  TRIPS_SEED_RESOURCES,
  TRIPS_SEED_SCHEDULES,
  TRIPS_SEED_SIMILAN,
  // ── /T0.3 departures ──
} from "./trips-fixture.mjs";

const TRIPS_EXPECTED_PATH = "scripts/trips-expected.json";

// ด่านฐาน: ไม่ใช่ qc-trips (prod / QC ของ RUN อื่น / host อื่น / QC_ENV_FILE=.env) ⇒ exit 4 ก่อนแตะฐาน
loadTripsQcEnv("seed-trips-qc");
// เลขในฟิกซ์เจอร์ผิด ⇒ ไม่ seed
assertFixtureArithmetic();

const { prisma } = await import("@/lib/core/db");
const ticket = await import("@/lib/modules/ticket/service");
const trips = await import("@/lib/modules/trips"); // TRIPS T0.2 ▸ สินค้าผ่าน facade เท่านั้น ◂
const settings = await import("@/lib/core/settings");

const t0 = Date.now();
const created: Record<string, number> = {};
const updated: Record<string, number> = {};
const bump = (m: Record<string, number>, k: string, n = 1) => (m[k] = (m[k] ?? 0) + n);

const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : x,
  );
function diff<W extends Record<string, unknown>>(cur: Record<string, unknown>, want: W): Partial<W> {
  const out: Partial<W> = {};
  for (const k of Object.keys(want) as (keyof W & string)[]) if (canon(cur[k]) !== canon(want[k])) out[k] = want[k];
  return out;
}
const has = (o: object) => Object.keys(o).length > 0;

// ═══════════════ ร้าน · หน่วย · ผู้ใช้ ═══════════════
async function ensureTenant(t: { id: string; slug: string; name: string }) {
  const bySlug = await prisma.tenant.findUnique({ where: { slug: t.slug } });
  if (bySlug && bySlug.id !== t.id) throw new Error(`slug ${t.slug} ถูกร้านอื่นใช้อยู่ (id ${bySlug.id}) — ไม่แตะ หยุด`);
  const row = bySlug ?? (await prisma.tenant.findUnique({ where: { id: t.id } }));
  if (!row) {
    bump(created, "tenant");
    await prisma.tenant.create({ data: { id: t.id, slug: t.slug, name: t.name } });
    return;
  }
  const d = diff(row, { slug: t.slug, name: t.name, status: "ACTIVE" as const });
  if (has(d)) {
    bump(updated, "tenant");
    await prisma.tenant.update({ where: { id: t.id }, data: d });
  }
}

async function ensureUnit(tenantId: string, u: FixtureUnit) {
  const row = await prisma.businessUnit.findUnique({ where: { id: u.id } });
  if (row && row.tenantId !== tenantId) throw new Error(`หน่วย ${u.id} เป็นของร้านอื่น (${row.tenantId}) — หยุด`);
  if (!row) {
    const clash = await prisma.businessUnit.findFirst({ where: { tenantId, slug: u.slug } });
    if (clash) throw new Error(`slug ${u.slug} ในร้าน ${tenantId} ถูกหน่วย ${clash.id} ใช้อยู่ — หยุด`);
    bump(created, "businessUnit");
    await prisma.businessUnit.create({ data: { id: u.id, tenantId, type: u.type, slug: u.slug, name: u.name } });
    return;
  }
  const d = diff(row, { type: u.type, slug: u.slug, name: u.name, status: "ACTIVE" as const });
  if (has(d)) {
    bump(updated, "businessUnit");
    await prisma.businessUnit.update({ where: { id: u.id }, data: d });
  }
}

async function ensureUser(tenantId: string, u: FixtureUser) {
  const byEmail = await prisma.user.findUnique({ where: { email: u.email } });
  if (byEmail && byEmail.id !== u.userId) throw new Error(`อีเมล ${u.email} เป็นของผู้ใช้อื่น (id ${byEmail.id}) — ไม่แตะ หยุด`);
  if (!byEmail) {
    bump(created, "user");
    await prisma.user.create({ data: { id: u.userId, email: u.email, name: u.name } });
  } else if (byEmail.name !== u.name) {
    bump(updated, "user");
    await prisma.user.update({ where: { id: u.userId }, data: { name: u.name } });
  }
  const acceptedAt = new Date(TRIPS_ACCEPTED_AT);
  const unitAccess: string[] = [...u.unitAccess];
  const permissions: Record<string, boolean> = { ...u.permissions };
  const m = await prisma.membership.findUnique({ where: { userId_tenantId: { userId: u.userId, tenantId } } });
  if (!m) {
    bump(created, "membership");
    await prisma.membership.create({ data: { id: u.membershipId, userId: u.userId, tenantId, role: u.role, unitAccess, permissions, invitedAt: acceptedAt, acceptedAt } });
  } else {
    const d: Record<string, unknown> = diff(m, { role: u.role, unitAccess, permissions });
    if (!m.acceptedAt) d.acceptedAt = acceptedAt;
    if (has(d)) {
      bump(updated, "membership");
      await prisma.membership.update({ where: { id: m.id }, data: d });
    }
  }
  const stray = await prisma.membership.count({ where: { userId: u.userId, tenantId: { not: tenantId } } });
  if (stray) throw new Error(`ผู้ใช้ ${u.email} มี membership ในร้านอื่น ${stray} แถว — ผิดฟิกซ์เจอร์ หยุด`);
}

// ═══════════════ Party (id ตายตัว — findOrCreate ไม่ idempotent เมื่อไม่มีเบอร์/อีเมล/เลขภาษี) ═══════════════
async function ensureParties(tenantId: string, list: readonly FixtureParty[]) {
  for (const p of list) {
    const row = await prisma.party.findUnique({ where: { id: p.id } });
    if (row && row.tenantId !== tenantId) throw new Error(`Party ${p.id} เป็นของร้านอื่น (${row.tenantId}) — หยุด`);
    const want = { kind: p.kind, name: p.name, mergedIntoId: null };
    if (!row) {
      bump(created, "party");
      await prisma.party.create({ data: { id: p.id, tenantId, ...want } });
      continue;
    }
    const d = diff(row, want);
    if (has(d)) {
      bump(updated, "party");
      await prisma.party.update({ where: { id: p.id }, data: d });
    }
  }
  const extra = await prisma.party.count({ where: { tenantId, id: { notIn: list.map((p) => p.id) } } });
  if (extra) console.log(`⚠️ ร้าน ${tenantId} มี Party นอกฟิกซ์เจอร์ ${extra} แถว (ไม่ลบ — ข้อสอบใบอื่นอาจสร้าง)`);
}

// ═══════════════ ตั๋ว (ผ่าน ticket/service ของจริง) ═══════════════
async function ensureTickets(tenantId: string, unitId: string) {
  const ctx = { tenantId, unitId };
  const startAt = new Date(SEED_TICKET_EVENT.startAt);
  const events = await prisma.ticketEvent.findMany({ where: { tenantId, unitId, name: SEED_TICKET_EVENT.name }, orderBy: { createdAt: "asc" } });
  if (events.length > 1) throw new Error(`อีเวนต์ "${SEED_TICKET_EVENT.name}" ซ้ำ ${events.length} แถว — ตรวจเอง หยุด`);
  let ev = events[0];
  if (!ev) {
    bump(created, "ticketEvent");
    ev = await ticket.createEvent(ctx, { name: SEED_TICKET_EVENT.name, startAt });
  } else {
    const d = diff({ startAt: ev.startAt.toISOString(), endAt: ev.endAt, archivedAt: ev.archivedAt }, { startAt: startAt.toISOString(), endAt: null, archivedAt: null });
    if (has(d)) {
      bump(updated, "ticketEvent");
      await ticket.updateEvent(ctx, ev.id, { startAt, endAt: null });
      if (ev.archivedAt) await prisma.ticketEvent.update({ where: { id: ev.id }, data: { archivedAt: null } }); // service ไม่มีทางเลิกเก็บถาวร
    }
  }
  if (ev.status !== "PUBLISHED") {
    bump(updated, "ticketEventStatus");
    await ticket.setEventStatus(ctx, ev.id, "PUBLISHED");
  }
  const typeIds: Record<string, string> = {};
  for (const t of AQUARIUM_PRODUCT.types) {
    const rows = await prisma.ticketType.findMany({ where: { tenantId, unitId, eventId: ev.id, name: t.name }, orderBy: { createdAt: "asc" } });
    if (rows.length > 1) throw new Error(`ประเภทตั๋ว "${t.name}" ซ้ำ ${rows.length} แถว — หยุด`);
    const description = "description" in t ? t.description : null;
    let row = rows[0];
    if (!row) {
      bump(created, "ticketType");
      row = await ticket.addTicketType(ctx, ev.id, { name: t.name, priceSatang: t.priceSatang, quota: SEED_TICKET_EVENT.quota, description: description ?? undefined, sortOrder: t.sortOrder });
    } else {
      const d = diff(row, { priceSatang: t.priceSatang, quota: SEED_TICKET_EVENT.quota, description, active: true });
      if (has(d)) {
        bump(updated, "ticketType");
        await ticket.updateTicketType(ctx, row.id, d);
      }
      if (row.sortOrder !== t.sortOrder) {
        bump(updated, "ticketTypeSort");
        await prisma.ticketType.update({ where: { id: row.id }, data: { sortOrder: t.sortOrder } }); // updateTicketType ไม่รับ sortOrder
      }
    }
    typeIds[t.key] = row.id;
  }
  return { eventId: ev.id, typeIds };
}

// ═══════════════ TRIPS T0.2 ▸ หน่วย TRIPS + แม่แบบ + สินค้าจอ 16 (ผ่าน facade trips) ═══════════════
type TripsResult = { ok: true } | { ok: false; code: string; message: string };
function must<R extends TripsResult>(r: R, what: string): Extract<R, { ok: true }> {
  if (!r.ok) throw new Error(`${what}: ${r.code} ${r.message}`);
  return r as Extract<R, { ok: true }>;
}

async function ensureTripsTemplate(tenantId: string, unitId: string, owner: FixtureUser, templateKey: string) {
  const prof = await prisma.settingProfile.findFirst({ where: { tenantId, unitId, domain: "trips" }, select: { templateKey: true } });
  if (prof?.templateKey === templateKey) return;
  bump(prof ? updated : created, "settingProfileTrips");
  const r = await settings.applyTemplate(
    { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: owner.userId },
    { tenantId },
    { unitId, domain: "trips", templateKey, overwrite: "KEEP_CUSTOM" },
  );
  if (!r.ok) throw new Error(`applyTemplate trips ${templateKey}: ${JSON.stringify(r)}`);
}

type ProductDTO = Extract<Awaited<ReturnType<typeof trips.getProduct>>, { ok: true }>["product"];
async function ensureTripProduct(ctx: { tenantId: string; actorUserId: string }, unitId: string, sp: SeedProduct): Promise<string> {
  const read = async (): Promise<ProductDTO | null> => {
    const r = await trips.getProductBySlug(ctx, { unitId, slug: sp.slug });
    if (r.ok) return r.product;
    if (r.code === "NOT_FOUND") return null;
    throw new Error(`getProductBySlug ${sp.slug}: ${r.code} ${r.message}`);
  };
  const want = {
    title: sp.title,
    body: sp.body,
    meetingPoint: { text: sp.meeting },
    disclosure: sp.disclosure,
    deepDive: sp.deepDive,
    crossBorder: false,
  };
  let p = await read();
  if (!p) {
    bump(created, "tripProduct");
    must(await trips.createProduct(ctx, { unitId, slug: sp.slug, productType: sp.productType, currency: sp.currency, ...want }), `createProduct ${sp.slug}`);
    p = await read();
    if (!p) throw new Error(`สร้างสินค้า ${sp.slug} แล้วอ่านไม่เจอ`);
  } else {
    if (p.productType !== sp.productType || p.currency !== sp.currency) throw new Error(`สินค้า ${sp.slug} ชนิด/สกุลไม่ตรงฟิกซ์เจอร์ (${p.productType}/${p.currency}) — ตรวจเอง หยุด`);
    const d = diff(p as unknown as Record<string, unknown>, want);
    if (has(d)) {
      bump(updated, "tripProduct");
      must(await trips.updateProduct(ctx, { unitId, productId: p.id, ...d }), `updateProduct ${sp.slug}`);
    }
  }
  const productId = p.id;
  // ตัวเลือก (จับคู่ด้วยชื่อไทย)
  for (const o of sp.options) {
    const cur = p.options.find((x) => x.name.th === o.name.th);
    if (!cur) {
      bump(created, "tripOption");
      must(await trips.createOption(ctx, { unitId, productId, name: o.name, durationMin: o.durationMin, nights: o.nights, active: o.active }), `createOption ${o.name.th}`);
      continue;
    }
    const d = diff(cur as unknown as Record<string, unknown>, { name: o.name, durationMin: o.durationMin, nights: o.nights });
    if (has(d)) {
      bump(updated, "tripOption");
      must(await trips.updateOption(ctx, { unitId, optionId: cur.id, ...d }), `updateOption ${o.name.th}`);
    }
    if (cur.active !== o.active) {
      bump(updated, "tripOptionActive");
      must(await trips.setOptionActive(ctx, { unitId, optionId: cur.id, active: o.active }), `setOptionActive ${o.name.th}`);
    }
  }
  // รายการเสริม (จับคู่ด้วยชนิด + ชื่อไทย · ธงไม่ส่ง = จาก T44)
  for (const e of sp.extras) {
    const cur = p.extras.find((x) => x.kind === e.kind && x.name.th === e.name.th);
    if (!cur) {
      bump(created, "tripExtra");
      must(
        await trips.createExtra(ctx, { unitId, productId, kind: e.kind, basis: e.basis, mandatory: e.mandatory, priceMinor: e.priceMinor, paxPrices: e.paxPrices, name: e.name, note: e.note }),
        `createExtra ${e.name.th}`,
      );
      continue;
    }
    const d = diff(cur as unknown as Record<string, unknown>, { basis: e.basis, mandatory: e.mandatory, priceMinor: e.priceMinor, paxPrices: e.paxPrices, name: e.name, note: e.note });
    if (has(d)) {
      bump(updated, "tripExtra");
      must(await trips.updateExtra(ctx, { unitId, extraId: cur.id, ...d }), `updateExtra ${e.name.th}`);
    }
    if (!cur.active) {
      bump(updated, "tripExtraActive");
      must(await trips.setExtraActive(ctx, { unitId, extraId: cur.id, active: true }), `setExtraActive ${e.name.th}`);
    }
  }
  // สถานะ: ทุกตัว ACTIVE
  if (p.status === "ARCHIVED") {
    bump(updated, "tripProductStatus");
    must(await trips.restoreProduct(ctx, { unitId, productId }), `restoreProduct ${sp.slug}`);
  }
  if (p.status !== "ACTIVE") {
    bump(p.status === "DRAFT" && !p.publishedAt ? created : updated, "tripProductPublish");
    must(await trips.publishProduct(ctx, { unitId, productId }), `publishProduct ${sp.slug}`);
  }
  return productId;
}
// ◂ TRIPS T0.2

// ═══════════════════════════ ลงมือ ═══════════════════════════
const D = SHOP_DIVE;
const A = SHOP_AQUARIUM;

await ensureTenant(D.tenant);
await ensureUnit(D.tenant.id, D.units.main);
for (const u of D.users) await ensureUser(D.tenant.id, u);
await ensureParties(D.tenant.id, DIVE_PARTIES);

await ensureTenant(A.tenant);
await ensureUnit(A.tenant.id, A.units.main);
for (const u of A.users) await ensureUser(A.tenant.id, u);
await ensureParties(A.tenant.id, AQUARIUM_PARTIES);
const tickets = await ensureTickets(A.tenant.id, A.units.main.id);

// TRIPS T0.2 ▸ หน่วย TRIPS ของอันดามันไดฟ์ → แม่แบบ trips DIVE_SHOP → สินค้า 4 ตัว (เจ้าของร้าน · ผ่าน facade) ◂
await ensureUnit(D.tenant.id, D.units.trips);
const diveOwner = D.users[0];
await ensureTripsTemplate(D.tenant.id, D.units.trips.id, diveOwner, D.template);
const tripProductIds: Record<string, string> = {};
for (const sp of TRIPS_SEED_PRODUCTS) tripProductIds[sp.key] = await ensureTripProduct({ tenantId: D.tenant.id, actorUserId: diveOwner.userId }, D.units.trips.id, sp);
// r2 ▸ id ลูกของสินค้า seed ให้ seed ของ T0.3/T0.5 หาได้: dive.products.<slug>.{productId, options{ชื่อไทย}, paxTypes{code}, extras{kind}} ◂
type SeedProductIds = { productId: string; options: Record<string, string>; paxTypes: Record<string, string>; extras: Record<string, string> };
const tripProducts: Record<string, SeedProductIds> = {};
for (const sp of TRIPS_SEED_PRODUCTS) {
  const r = await trips.getProductBySlug({ tenantId: D.tenant.id, actorUserId: diveOwner.userId }, { unitId: D.units.trips.id, slug: sp.slug });
  if (!r.ok) throw new Error(`อ่านสินค้า ${sp.slug} หลัง seed ไม่ได้: ${r.code}`);
  const extras: Record<string, string> = {};
  for (const e of r.product.extras) extras[e.kind in extras ? `${e.kind}:${e.name.th}` : e.kind] = e.id;
  tripProducts[sp.slug] = {
    productId: r.product.id,
    options: Object.fromEntries(r.product.options.map((o) => [o.name.th, o.id])),
    paxTypes: Object.fromEntries(r.product.paxTypes.map((x) => [x.code, x.id])),
    extras,
  };
}

// ── T0.3 departures ──
// ═══════════════ รอบสัปดาห์ฟิกซ์เจอร์ (ใบ T0.3 §8) ═══════════════
// ผ่าน facade `@/lib/modules/trips` ด้วยเจ้าของร้าน (createResource · createSchedule · materializeSchedule · setDepartureStatus · cancelDeparture · createDeparture)
// ไม่เขียนตาราง Trip* ตรง (อ่านอย่างเดียว) · ทุกคำสั่งส่ง opts.now = TRIPS_AS_OF ยกเว้น materialize (TRIPS_SEED_MATERIALIZE_AT)
// ต่อจาก seed ของ T0.2 (หน่วย TRIPS + สินค้า 4 ตัว · id จาก `tripProducts` = dive.products ใน trips-expected.json) — ไม่มี ⇒ ล้ม (ไม่ข้ามเงียบ)
const tripsMod = await import("@/lib/modules/trips");
const settingsMod = await import("@/lib/core/settings");
const SEED_T6 = "trips.sell.cutoff";
const SEED_T7 = "trips.sell.minToDepart";
const seedStatusOf = (s: string) => (s.startsWith("ยกเลิก") ? "CANCELLED" : s === "เดินทางแล้ว" || s === "ออกเรือแล้ว" ? "CLOSED" : s === "ยืนยันออก" ? "GUARANTEED" : "OPEN");
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
function mustOk<T extends { ok: boolean }>(r: T, what: string): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`seed T0.3 ${what}: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

async function ensureTripsDepartures(): Promise<{ departureIds: Record<string, string>; resourceIds: Record<string, string> }> {
  const tenantId = D.tenant.id;
  const unitId = D.units.trips.id;
  const owner = D.users[0];
  const slugs = [...TRIPS_SEED_SCHEDULES.map((x) => x.slug), TRIPS_SEED_SIMILAN.slug];
  const prods: Record<string, { id: string; optionId: string }> = {};
  for (const slug of slugs) {
    const sp = TRIPS_SEED_PRODUCTS.find((x) => x.slug === slug);
    const ids = tripProducts[slug];
    const optName = sp?.options.find((o) => o.active)?.name.th;
    const optionId = optName ? ids?.options[optName] : undefined;
    if (!sp || !ids || !optionId) throw new Error(`seed T0.3: ไม่มีสินค้า/ตัวเลือก ${slug} จาก seed ของ T0.2`);
    const hasDuration = sp.options.find((o) => o.active)?.durationMin ?? sp.options.find((o) => o.active)?.nights;
    if (!hasDuration) throw new Error(`seed T0.3: ตัวเลือก ${slug} ในฟิกซ์เจอร์ T0.2 ไม่มีระยะเวลา`);
    prods[slug] = { id: ids.productId, optionId };
  }
  const ctx = { tenantId, actorUserId: owner.userId };
  const opts = { now: new Date(TRIPS_AS_OF) };

  // 1) ทรัพยากร (จับคู่ด้วย ชนิด + ชื่อ)
  const resList = mustOk(await tripsMod.listResources(ctx, { unitId, includeInactive: true }), "listResources").items;
  const resourceIds: Record<string, string> = {};
  for (const r of TRIPS_SEED_RESOURCES) {
    const cur = resList.find((x) => x.kind === r.kind && x.name === r.name);
    if (!cur) {
      bump(created, "tripResource");
      resourceIds[r.key] = mustOk(await tripsMod.createResource(ctx, { unitId, kind: r.kind, name: r.name, seats: r.seats }), `createResource ${r.name}`).id;
      continue;
    }
    resourceIds[r.key] = cur.id;
    if (cur.seats !== r.seats) {
      bump(updated, "tripResource");
      mustOk(await tripsMod.updateResource(ctx, { unitId, resourceId: cur.id, seats: r.seats }), `updateResource ${r.name}`);
    }
    if (!cur.active) {
      bump(updated, "tripResourceActive");
      mustOk(await tripsMod.setResourceActive(ctx, { unitId, resourceId: cur.id, active: true }, opts), `setResourceActive ${r.name}`);
    }
  }

  // 2) ค่าตั้ง (จอ 17): T6 ชั้น UNIT หน้าร้าน 0 วัน 07:00 · T7 ชั้น PRODUCT ขั้นต่ำ 8/10/4 (เวลาตัดสินตามแม่แบบ)
  const actor = { role: owner.role, unitAccess: [...owner.unitAccess], permissions: { ...owner.permissions }, userId: owner.userId };
  const changes: { key: string; scope: string; scopeId: string; value: unknown }[] = [];
  const t6 = asObj((await settingsMod.resolveSetting({ tenantId }, SEED_T6, { unitId })).value);
  const t6Want = { ...t6, perChannel: { ...asObj(t6.perChannel), COUNTER: { ...TRIPS_SEED_COUNTER_CUTOFF } } };
  if (canon(t6) !== canon(t6Want)) changes.push({ key: SEED_T6, scope: "UNIT", scopeId: unitId, value: t6Want });
  for (const s of TRIPS_SEED_SCHEDULES) {
    const productId = prods[s.slug].id;
    const t7 = asObj((await settingsMod.resolveSetting({ tenantId }, SEED_T7, { unitId, productId })).value);
    if (t7.minPax !== s.minPax) changes.push({ key: SEED_T7, scope: "PRODUCT", scopeId: productId, value: { ...t7, minPax: s.minPax } });
  }
  if (changes.length) {
    bump(updated, "tripSettings", changes.length);
    const r = await settingsMod.setSettings(actor, { tenantId }, changes, { ackLegalWarn: true });
    if (!r.ok) throw new Error(`seed T0.3 setSettings: ${JSON.stringify(r)}`);
  }

  // 4) กฎ DAILY + materialize (สัปดาห์ 11–17)
  const departureIds: Record<string, string> = {};
  for (const s of TRIPS_SEED_SCHEDULES) {
    const pr = prods[s.slug];
    const want = {
      rule: { kind: "DAILY" as const },
      exceptions: s.skip.map((date) => ({ date, action: "SKIP" as const })),
      departTimeMin: s.departTimeMin,
      capacity: s.capacity,
      minPax: null,
      resourceIds: s.resources.map((k) => resourceIds[k]),
      dateFrom: s.dateFrom,
      dateTo: s.dateTo,
    };
    const scheds = mustOk(await tripsMod.listSchedules(ctx, { unitId, productId: pr.id }), "listSchedules").items;
    let sched = scheds.find((x) => x.optionId === pr.optionId);
    if (!sched) {
      bump(created, "tripSchedule");
      const id = mustOk(await tripsMod.createSchedule(ctx, { unitId, productId: pr.id, optionId: pr.optionId, ...want }), `createSchedule ${s.slug}`).id;
      sched = mustOk(await tripsMod.listSchedules(ctx, { unitId, productId: pr.id }), "listSchedules").items.find((x) => x.id === id);
    } else {
      const cur = { rule: sched.rule, exceptions: sched.exceptions, departTimeMin: sched.departTimeMin, capacity: sched.capacity, minPax: sched.minPax, resourceIds: sched.resourceIds, dateFrom: sched.dateFrom, dateTo: sched.dateTo };
      if (canon(cur) !== canon(want)) {
        bump(updated, "tripSchedule");
        mustOk(await tripsMod.updateSchedule(ctx, { unitId, scheduleId: sched.id, ...want }, opts), `updateSchedule ${s.slug}`);
      }
      if (sched.paused) {
        bump(updated, "tripScheduleResume");
        mustOk(await tripsMod.resumeSchedule(ctx, { unitId, scheduleId: sched.id }, opts), `resumeSchedule ${s.slug}`);
      }
    }
    if (!sched) throw new Error(`seed T0.3: อ่านกฎ ${s.slug} กลับไม่ได้`);
    const week = CALENDAR_WEEK_1111.rows[s.key];
    const list = async () => mustOk(await tripsMod.listDepartures(ctx, { unitId, from: s.dateFrom, to: s.dateTo, productId: pr.id }, opts), "listDepartures").items.filter((d) => d.scheduleId === sched?.id);
    let deps = await list();
    if (week.some((c) => !deps.some((d) => d.localDate === c.date))) {
      const r = mustOk(await tripsMod.materializeSchedule(ctx, { unitId, scheduleId: sched.id }, { now: new Date(TRIPS_SEED_MATERIALIZE_AT) }), `materializeSchedule ${s.slug}`);
      bump(created, "tripDeparture", r.created.length);
      if (r.conflicts.length) throw new Error(`seed T0.3 materialize ${s.slug}: ทรัพยากรชน ${JSON.stringify(r.conflicts)}`);
      deps = await list();
    }
    // 5) สถานะตามจอ 11 (ตัวนับทุกรอบ = 0)
    for (const c of week) {
      const d = deps.find((x) => x.localDate === c.date);
      if (!d) throw new Error(`seed T0.3: ไม่มีรอบ ${s.key} ${c.date} หลัง materialize`);
      departureIds[`${s.key}:${c.date}`] = d.id;
      const target = seedStatusOf(c.status);
      if (d.status === target) continue;
      bump(updated, "tripDepartureStatus");
      if (target === "CANCELLED") mustOk(await tripsMod.cancelDeparture(ctx, { unitId, departureId: d.id, reason: TRIPS_SEED_CANCEL_REASON }, opts), `cancelDeparture ${s.key} ${c.date}`);
      else mustOk(await tripsMod.setDepartureStatus(ctx, { unitId, departureId: d.id, status: target }, opts), `setDepartureStatus ${s.key} ${c.date} → ${target}`);
    }
  }

  // 6) สิมิลัน: รอบเดี่ยว (ไม่มีกฎซ้ำ)
  const sim = prods[TRIPS_SEED_SIMILAN.slug];
  const simDeps = mustOk(await tripsMod.listDepartures(ctx, { unitId, from: TRIPS_SEED_SIMILAN.localDate, to: TRIPS_SEED_SIMILAN.localDate, productId: sim.id }, opts), "listDepartures similan").items;
  if (simDeps.length) departureIds[`similan:${TRIPS_SEED_SIMILAN.localDate}`] = simDeps[0].id;
  else {
    bump(created, "tripDeparture");
    departureIds[`similan:${TRIPS_SEED_SIMILAN.localDate}`] = mustOk(
      await tripsMod.createDeparture(
        ctx,
        { unitId, productId: sim.id, optionId: sim.optionId, localDate: TRIPS_SEED_SIMILAN.localDate, departTimeMin: TRIPS_SEED_SIMILAN.departTimeMin, durationMin: TRIPS_SEED_SIMILAN.durationMin, capacity: TRIPS_SEED_SIMILAN.capacity },
        opts,
      ),
      "createDeparture similan",
    ).id;
  }
  return { departureIds, resourceIds };
}
const tripsDepartures = await ensureTripsDepartures();
console.log(`T0.3: รอบ ${Object.keys(tripsDepartures.departureIds).length} · ทรัพยากร ${Object.keys(tripsDepartures.resourceIds).length}`);
// ── /T0.3 departures ──

// ── T0.5 pricing ──
// TRIPS T0.5 ▸ ราคาราชา (จอ 16 · ผ่านบริการราคา `@/lib/modules/trips` · now = TRIPS_AS_OF · รันซ้ำ = อ่านเทียบ ไม่เขียน) ◂
//   ราคาปลีกผู้ใหญ่ 3,500 · 3 ฤดูกาล + ราคาผู้ใหญ่ต่อฤดู · รอบ 31 ธ.ค. (createDeparture ของ T0.3) + ราคารอบผู้ใหญ่ 4,500
//   ไม่ตั้งราคาเด็ก (คิด 70% จาก T28 ตอน quote) · ไม่มีโค้ดส่วนลด (ไม่มีภาพใดแสดงโค้ดจริง)
{
  const unitId = D.units.trips.id;
  const racha = tripProducts["racha-yai-day-trip"];
  const adultPt = racha?.paxTypes.ADULT;
  const joinOpt = racha?.options["ร่วมกลุ่ม"];
  if (!racha || !adultPt || !joinOpt) throw new Error("seed T0.5: ไม่พบสินค้าราชา/ประเภทผู้ใหญ่/ตัวเลือกร่วมกลุ่ม (seed ของ T0.2 ยังไม่ลง)");
  const sctx = { tenantId: D.tenant.id, unitId, channel: "COUNTER" as const, actor: { kind: "STAFF" as const, userId: diveOwner.userId }, now: new Date(TRIPS_AS_OF), locale: "th" as const };
  type SR<T> = { ok: true; value: T } | { ok: false; code: string; messageTh: string };
  const ok = <T,>(r: SR<T>, what: string): T => {
    if (!r.ok) throw new Error(`seed T0.5 ${what}: ${r.code} ${r.messageTh}`);
    return r.value;
  };
  const prices = async () => ok(await trips.listPrices(sctx, { productId: racha.productId }), "listPrices");
  const ensurePrice = async (want: { seasonId?: string; departureId?: string; amountMinor: number }, what: string) => {
    const cur = (await prices()).find((p) => p.paxTypeId === adultPt && p.optionId === null && p.seasonId === (want.seasonId ?? null) && p.departureId === (want.departureId ?? null) && p.weekdayMask === null && p.bookFrom === null && p.travelFrom === null);
    if (cur && cur.amountMinor === want.amountMinor && cur.currency === "THB") return;
    bump(cur ? updated : created, "tripPrice");
    ok(await trips.setPrice(sctx, { productId: racha.productId, paxTypeId: adultPt, currency: "THB", amountMinor: want.amountMinor, ...(want.seasonId ? { seasonId: want.seasonId } : {}), ...(want.departureId ? { departureId: want.departureId } : {}) }), `setPrice ${what}`);
  };
  await ensurePrice({ amountMinor: PRODUCT_RACHA.adultSatang }, "ปลีก");
  for (const s of RACHA_SEASONS) {
    const list = ok(await trips.listSeasons(sctx, { includeArchived: false }), "listSeasons");
    let row = list.find((x) => x.name === s.name && x.dateStart === s.from && x.dateEnd === s.to);
    if (row && row.priority !== s.priority) {
      bump(updated, "tripSeason");
      ok(await trips.saveSeason(sctx, { id: row.id, name: s.name, dateStart: s.from, dateEnd: s.to, priority: s.priority }), `saveSeason ${s.key}`);
    }
    if (!row) {
      bump(created, "tripSeason");
      const id = ok(await trips.saveSeason(sctx, { name: s.name, dateStart: s.from, dateEnd: s.to, priority: s.priority }), `saveSeason ${s.key}`).id;
      row = { id, name: s.name, dateStart: s.from, dateEnd: s.to, priority: s.priority, status: "ACTIVE" };
    }
    await ensurePrice({ seasonId: row.id, amountMinor: s.adultSatang }, `ฤดู ${s.key}`);
  }
  // รอบราชา 31 ธ.ค. — ผ่านบริการรอบของ T0.3 (`createDeparture`) · มีอยู่แล้ว (รันซ้ำ) ⇒ ใช้ตัวนั้น ไม่เขียน
  const d31 = RACHA_DEPARTURE_PRICE_1231;
  const depCtx = { tenantId: D.tenant.id, actorUserId: diveOwner.userId };
  const depOpts = { now: new Date(TRIPS_AS_OF) };
  const findDep = async () => {
    const r = await trips.listDepartures(depCtx, { unitId, from: d31.date, to: d31.date, productId: racha.productId }, depOpts);
    if (!r.ok) throw new Error(`seed T0.5 listDepartures 31 ธ.ค.: ${JSON.stringify(r)}`);
    return r.items[0] ?? null;
  };
  let dep = await findDep();
  if (!dep) {
    bump(created, "tripDeparture");
    const hhmm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const r = await trips.createDeparture(
      depCtx,
      { unitId, productId: racha.productId, optionId: joinOpt, localDate: d31.date, departTimeMin: hhmm(PRODUCT_RACHA.time.start), durationMin: hhmm(PRODUCT_RACHA.time.end) - hhmm(PRODUCT_RACHA.time.start), capacity: PRODUCT_RACHA.capacity, minPax: PRODUCT_RACHA.minPax },
      depOpts,
    );
    if (!r.ok) throw new Error(`seed T0.5 createDeparture 31 ธ.ค.: ${JSON.stringify(r)}`);
    dep = await findDep();
    if (!dep) throw new Error("seed T0.5: สร้างรอบ 31 ธ.ค. แล้วอ่านไม่เจอ");
  }
  await ensurePrice({ departureId: dep.id, amountMinor: d31.adultSatang }, "รอบ 31 ธ.ค.");
}
// ── /T0.5 pricing ──

// ═══════════════ สรุป (ต้องเหมือนเดิมทุกตัวอักษรเมื่อรันซ้ำ) ═══════════════
async function countsOf(tenantId: string) {
  const w = { tenantId };
  return {
    units: await prisma.businessUnit.count({ where: w }),
    memberships: await prisma.membership.count({ where: w }),
    parties: await prisma.party.count({ where: w }),
    ticketEvents: await prisma.ticketEvent.count({ where: w }),
    ticketTypes: await prisma.ticketType.count({ where: w }),
  };
}
const summary = {
  dive: await countsOf(D.tenant.id),
  aquarium: await countsOf(A.tenant.id),
  users: await prisma.user.count({ where: { email: { in: TRIPS_EMAILS } } }),
  // TRIPS T0.2 ▸ ◂
  tripsDive: {
    products: await prisma.tripProduct.count({ where: { tenantId: D.tenant.id } }),
    options: await prisma.tripOption.count({ where: { tenantId: D.tenant.id } }),
    paxTypes: await prisma.tripPaxType.count({ where: { tenantId: D.tenant.id } }),
    extras: await prisma.tripExtra.count({ where: { tenantId: D.tenant.id } }),
  },
};
const expected = {
  note: "สร้างโดย scripts/seed-trips-qc.mts (ใบ P0.1 + T0.2) — ข้อสอบ TRIPS อ่าน id จากที่นี่ · ค่าเงินอยู่ที่ scripts/trips-fixture.mts",
  dive: {
    tenantId: D.tenant.id,
    slug: D.tenant.slug,
    unitId: D.units.main.id,
    userIds: D.users.map((u) => u.userId),
    partyIds: DIVE_PARTIES.map((p) => p.id),
    tripsUnitId: D.units.trips.id, // TRIPS T0.2
    productIds: tripProductIds, // TRIPS T0.2 (คงไว้เพื่อความเข้ากันได้)
    products: tripProducts, // TRIPS T0.2 r2 ▸ <slug> → { productId, options{ชื่อไทย: id}, paxTypes{code: id}, extras{kind: id} } ◂
  },
  aquarium: {
    tenantId: A.tenant.id,
    slug: A.tenant.slug,
    unitId: A.units.main.id,
    userIds: A.users.map((u) => u.userId),
    partyIds: AQUARIUM_PARTIES.map((p) => p.id),
    ticketEventId: tickets.eventId,
    ticketTypeIds: tickets.typeIds,
  },
  counts: summary,
};
// ── T0.3 departures ──
Object.assign(expected.dive, { departureIds: tripsDepartures.departureIds, resourceIds: tripsDepartures.resourceIds });
// ── /T0.3 departures ──
writeFileSync(TRIPS_EXPECTED_PATH, JSON.stringify(expected, null, 2) + "\n");

const wrote = has(created) || has(updated);
console.log(`อันดามันไดฟ์: ${JSON.stringify(summary.dive)}`);
console.log(`อควาเรียมอันดามัน: ${JSON.stringify(summary.aquarium)} · ผู้ใช้ TRIPS ${summary.users}`);
console.log(
  wrote
    ? `เขียนรอบนี้: สร้าง ${JSON.stringify(created)} · แก้ ${JSON.stringify(updated)} · เฉลย ${TRIPS_EXPECTED_PATH} · ${Math.round((Date.now() - t0) / 1000)} วิ`
    : `ไม่มีการเขียน (ตรงฟิกซ์เจอร์แล้ว) · เฉลย ${TRIPS_EXPECTED_PATH} · ${Math.round((Date.now() - t0) / 1000)} วิ`,
);
console.log(`SEED_SUMMARY ${JSON.stringify(summary)}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: "seed-trips-qc", ok: true, created, updated })}`);
await prisma.$disconnect();
