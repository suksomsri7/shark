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
  type SeedProduct,
  type FixtureParty,
  type FixtureUnit,
  type FixtureUser,
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
