// qc-svc-h.9-e2e.mts — ใบ H.9 §0 ข้อ 3 · e2e ปลายทางเดียวของโรงแรม V2 (ร้านชั่วคราว 1 ร้าน · หน่วยโรงแรม + ร้านอาหาร · POS · บัญชี VAT 7%)
//   ราคา/แผน (H.1) → ค้นหา+จองเว็บ (H.8) → HOLD → แนบสลิป → อนุมัติสลิป (consumer) → CONFIRMED + ใบรับมัดจำ →
//   เช็กอิน + ทะเบียนผู้พักต่างชาติ + ร.ร.3 ลงชื่อ (H.4) → ตม.30 แจ้ง → บิลร้านอาหารลงห้อง ROOM_CHARGE (H.5 chargeToRoom ผ่าน consumer) →
//   แม่บ้าน DIRTY→CLEAN + มินิบาร์ (H.6) → ปิดวัน (H.7 · นาฬิกาพรุ่งนี้ 10:00) ค่าห้องโพสต์ครั้งเดียว + KPI →
//   เช็กเอาต์ (H.5) บิล POS PAID · มัดจำหัก · GL (รายได้ − VAT = GL 4xxx) · revenueReport = บิล →
//   OTA FAKE (H.10) แม็ป → inbound 1 ฉบับคืนอื่น → APPLIED → งาน ARI ส่งค่าห้องว่างที่ลดลง · ทุกขั้นเช็กยอดสตางค์+สถานะ
// แบบ "ข้อละบรรทัด ✅/❌ + JSON_SUMMARY {suite,total,passed,failed,skipped}" · ร้าน/ผู้ใช้ prefix h9e2e- ลบใน finally · ไม่แตะฉาก svcqc
// นาฬิกา: ปิดวัน/เช็กเอาต์ต้องเกิด "หลังเที่ยงคืน" ของคืนที่พัก (closeNightAudit ปฏิเสธวันนี้ = TOO_EARLY · จองเว็บย้อนหลังไม่ได้)
//   ⇒ ช่วง F (ปิดวัน + เช็กเอาต์ + รายงาน) ครอบ Date ด้วย proxy ให้ "ตอนนี้" = พรุ่งนี้ 10:00 น. ไทย (เวลาเครื่องจริงไม่ถูกแก้)
// รัน (cwd ทรี): bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-h.9-e2e.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomBytes } from "node:crypto";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
type Any = any;
const SUITE = "qc-svc-h.9-e2e";
const SLUG = "h9e2e-";
loadSvcQcEnv(SUITE);
if (process.env.CI || process.env.APP_ENV === "production") { console.error(`🔴 ${SUITE}: env ต้องห้าม`); process.exit(4); }
delete process.env.SVC_QC_CLOCK;
delete process.env.ABLY_API_KEY;
process.env.INTEGRATIONS_FAKE = "1";
if ((process.env.INTEGRATIONS_CREDENTIALS_KEY ?? "").trim().length < 32) process.env.INTEGRATIONS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
const T_START = Date.now();

// ── fetch: เฉพาะ Neon/localhost ผ่าน · อื่นบล็อก (ไม่มีเน็ตออกจริง) ──
const REAL_FETCH = globalThis.fetch;
globalThis.fetch = (async (input: Any, init?: Any) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = ""; try { host = new URL(url).hostname; } catch { /* */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  return new Response("{}", { status: 503 });
}) as typeof fetch;

// ── นาฬิกาเลื่อน (proxy Date: new Date() ไม่มีอาร์กิวเมนต์ + Date.now เลื่อน · instanceof ใช้ได้ทั้งของเดิม/ใหม่) ──
const RealDate = Date;
let SHIFT_MS = 0;
globalThis.Date = new Proxy(RealDate, {
  construct(t, args, nt) { return args.length === 0 ? new t(t.now() + SHIFT_MS) : Reflect.construct(t, args, nt === globalThis.Date ? t : nt); },
  apply(t, _this, args) { return args.length === 0 ? new t(t.now() + SHIFT_MS).toString() : t(...(args as [])); },
  get(t, p, r) { if (p === "now") return () => t.now() + SHIFT_MS; return Reflect.get(t, p, r); },
}) as DateConstructor;

// ── harness ──
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; why: string }[] = [];
class AF extends Error {}
class SK extends Error {}
const J = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
const ok = (c: unknown, why: string) => { if (!c) throw new AF(why); };
const eq = (a: unknown, b: unknown, what: string) => ok(J(a) === J(b), `${what}: ได้ ${J(a)} ต้อง ${J(b)}`);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
let ABORT = "";
const st = async (id: string, name: string, fn: () => Promise<unknown>) => {
  if (ABORT) { cks.push({ id, res: "SKIP", why: ABORT }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${ABORT}`); return; }
  try { await fn(); cks.push({ id, res: "PASS", why: "" }); console.log(`  ✅ [${id}] ${name}`); }
  catch (e) {
    if (e instanceof SK) { cks.push({ id, res: "SKIP", why: e.message }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${e.message}`); return; }
    const why = e instanceof AF ? e.message : `throw: ${errMsg(e)}`; cks.push({ id, res: "FAIL", why }); console.log(`  ❌ [${id}] ${name} — ${why}`);
  }
};
/** ขั้นที่ขั้นหลังต้องพึ่ง: แดง ⇒ ข้อที่เหลือ SKIP (ไม่ไล่ผลพวง) */
const must = async (id: string, name: string, fn: () => Promise<unknown>) => { await st(id, name, fn); if (cks.at(-1)?.res === "FAIL") ABORT = `ขั้นก่อนหน้า ${id} แดง`; };
const call = async (f: () => Any): Promise<Any> => { try { return await f(); } catch (e) { return { ok: false, code: "THROW", reason: errMsg(e) }; } };
const okRes = (r: Any, what: string) => { ok(r?.ok === true, `${what}: ${r?.code ?? J(r).slice(0, 200)} ${r?.reason ?? ""}`); return r; };
const DAY = 86_400_000;
const dayNo = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
const addDays = (ymd: string, n: number) => new RealDate((dayNo(ymd) + n) * DAY).toISOString().slice(0, 10);
const T0 = new RealDate(RealDate.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const W = (n: number) => addDays(T0, n);
const dbDate = (ymd: string) => new RealDate(`${ymd}T00:00:00.000Z`);
const ymdOf = (d: Date) => new RealDate(d).toISOString().slice(0, 10);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const uid = () => `${RealDate.now().toString(36)}${randomBytes(3).toString("hex")}`;
const RUN = uid();

const R = new URL("../src/lib", import.meta.url).pathname;
const { prisma } = (await import(`${R}/core/db`)) as Any;
const SET = (await import(`${R}/core/settings`)) as Any;
const HOTEL = (await import(`${R}/modules/hotel`)) as Any;
const WEB = (await import(`${R}/platform/hotel-web`)) as Any;
const SV = (await import(`${R}/payment/slip-verify`)) as Any;
const SYS = (await import(`${R}/modules/system/service`)) as Any;
const ACC = (await import(`${R}/modules/account/service`)) as Any;
const GL = (await import(`${R}/modules/account/gl`)) as Any;
const POS = (await import(`${R}/modules/pos/service`)) as Any;
const INT = (await import(`${R}/core/integrations`)) as Any;
const VAT = (await import(`${R}/money/vat`)) as Any;
const OC = (await import(`${R}/outbox-consumers`)) as Any;

const tenantIds: string[] = [];
async function cleanup() {
  const stale = (await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } })).map((t: Any) => t.id as string);
  const ids = [...new Set([...tenantIds, ...stale])];
  if (ids.length) {
    for (const t of ["RoomOccupancy", "HotelBookingNight", "PaymentSlip", "ChannelRoomMap", "ChannelRateMap", "ChannelInventoryBuffer", "ChannelAriJob", "ChannelReservationInbox", "IntegrationCallLog"]) {
      try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, ids); } catch { /* FK */ }
    }
    const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
    let pending = rows.map((r) => r.t).filter((t) => t !== "Tenant");
    for (let pass = 0; pass < 16 && pending.length; pass++) {
      const next: string[] = [];
      for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, ids); } catch { next.push(t); } }
      pending = next;
    }
    if (pending.length) console.log(`  ⚠️ cleanup ลบไม่หมด ${pending.join(", ")}`);
    try { await prisma.tenant.deleteMany({ where: { id: { in: ids } } }); } catch (e) { console.log(`  ⚠️ ลบ tenant ${errMsg(e)}`); }
  }
  try { await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `hw:%:${createHash("sha256").update(`${SLUG}${RUN}/${SLUG}u-${RUN}`).digest("hex").slice(0, 12)}:%`); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { email: { startsWith: SLUG } } }); } catch (e) { console.log(`  ⚠️ ลบ user ${errMsg(e)}`); }
}

/** ระบายคิว: ใช้ drainAll ของจริง (ฐานเลน l6 ใช้คนเดียว) · event ที่เกิดใต้นาฬิกาเลื่อน (availableAt อนาคต) ดึงกลับมาก่อน */
async function drain() {
  for (let i = 0; i < 4; i++) {
    await prisma.outboxEvent.updateMany({ where: { tenantId: { in: tenantIds }, status: "PENDING", availableAt: { gt: new RealDate() } }, data: { availableAt: new RealDate(RealDate.now() - 1000) } });
    await OC.drainAll();
    const left = await prisma.outboxEvent.count({ where: { tenantId: { in: tenantIds }, status: "PENDING", availableAt: { lte: new RealDate() } } });
    if (!left) break;
  }
}

let exitCode = 0;
try {
  await cleanup();
  console.log(`(ฐาน ${process.env.SVC_QC_HOST} · วันนี้ไทย ${T0} · run ${RUN})`);

  // ═══ S ตั้งร้าน ═══
  const tA = (await prisma.tenant.create({ data: { name: "H9 e2e โรงแรม", slug: `${SLUG}${RUN}` } })).id as string;
  tenantIds.push(tA);
  const ctx = { tenantId: tA };
  const US = `${SLUG}u-${RUN}`;
  const UH = (await prisma.businessUnit.create({ data: { tenantId: tA, type: "HOTEL", name: "โรงแรม H9 e2e", slug: US } })).id as string;
  const UR = (await prisma.businessUnit.create({ data: { tenantId: tA, type: "RESTAURANT", name: "ห้องอาหาร H9 e2e", slug: `${SLUG}r-${RUN}` } })).id as string;
  const mkType = async (name: string, base: number) => (await prisma.hotelRoomType.create({ data: { tenantId: tA, unitId: UH, name, rentMode: "NIGHTLY", baseRateSatang: base, capacity: 3, baseOccupancy: 2, maxOccupancy: 3, extraBedAllowed: false, extraBedPriceSatang: 0 } })).id as string;
  const RT = { dlx: await mkType("ดีลักซ์", 129_000), sup: await mkType("ซูพีเรีย", 99_000) };
  const ROOM: Record<string, string> = {};
  for (const n of ["D1", "D2", "D3"]) ROOM[n] = (await prisma.hotelRoom.create({ data: { tenantId: tA, unitId: UH, number: n, roomTypeId: RT.dlx, hkStatus: "CLEAN" } })).id;
  for (const n of ["S1", "S2"]) ROOM[n] = (await prisma.hotelRoom.create({ data: { tenantId: tA, unitId: UH, number: n, roomTypeId: RT.sup, hkStatus: "CLEAN" } })).id;
  const TOTAL_ROOMS = 5;
  const POSS = (await SYS.createSystem(tA, "POS", "POS H9 e2e")).id as string;
  for (const u of [UH, UR]) await SYS.linkUnit(tA, POSS, u);
  const ACCS = (await SYS.createSystem(tA, "ACCOUNT", "บัญชี H9 e2e")).id as string;
  await ACC.saveSettings(tA, ACCS, { orgName: "โรงแรม H9 จำกัด", taxId: "0105561177639", vatRegistered: true, vatRateBp: 700 } as never);
  await GL.ensureAccounting({ tenantId: tA, systemId: ACCS });
  await prisma.accountSystemLink.create({ data: { tenantId: tA, systemId: ACCS, linkedKind: "POS", linkedId: POSS } });
  await prisma.paymentProfile.create({ data: { tenantId: tA, promptpayId: "0812345678", displayName: "โรงแรม H9 e2e" } });
  const mkMember = async (tag: string, role: string, unitAccess: string[], permissions: Record<string, unknown> = {}) => {
    const id = `${SLUG}${tag}-${RUN}`;
    await prisma.user.create({ data: { id, email: `${SLUG}${tag}-${RUN}@shark.local`, name: `H9 e2e ${tag}` } });
    await prisma.membership.create({ data: { userId: id, tenantId: tA, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id };
  };
  const OWNER = await mkMember("owner", "OWNER", ["*"]);
  const MGR = await mkMember("mgr", "MANAGER", [UH, UR], { "hotel.audit.run": true, "hotel.reports.read": true, "hotel.booking.manage": true, "hotel.folio.post": true, "hotel.folio.void": true, "hotel.reservation.checkOut": true, "hotel.reservation.checkIn": true, "hotel.reservation.create": true, "hotel.guest.register": true });
  const FRONT = await mkMember("front", "STAFF", [UH], { "hotel.reservation.create": true, "hotel.reservation.cancel": true, "hotel.booking.manage": true, "hotel.reservation.checkIn": true, "hotel.rates.read": true, "hotel.folio.post": true, "hotel.reservation.checkOut": true, "hotel.guest.register": true });
  const MAID = await mkMember("maid", "STAFF", [UH], { "hotel.housekeeping": true });
  const rctx = { tenantId: tA, actorUserId: MGR.userId };
  const setUnit = async (key: string, value: unknown) => okRes(await SET.setSettings(OWNER, ctx, [{ key, scope: "UNIT", scopeId: UH, value }]), `ตั้ง ${key}`);
  await setUnit("rooms.hotel.audit.autoClose", false);
  await setUnit("rooms.hotel.holdMinutesOnline", 120);
  const MINIBAR = [{ key: "water", name: "น้ำดื่ม", priceSatang: 2_000 }, { key: "snack", name: "ขนมมันฝรั่ง", priceSatang: 3_500 }];
  await setUnit("rooms.hotel.minibar", MINIBAR);

  const PRICE = { dlxWd: 129_000, dlxWe: 149_000, supWd: 99_000, supWe: 119_000, override: 155_000 };
  const isWe = (ymd: string) => [5, 6].includes(new RealDate(`${ymd}T00:00:00Z`).getUTCDay());
  const dlxPrice = (ymd: string) => (ymd === T0 ? PRICE.override : isWe(ymd) ? PRICE.dlxWe : PRICE.dlxWd);
  const GUEST = { name: "แขกเว็บ H9 e2e", phone: "0891239900", email: `${SLUG}guest-${RUN}@qc.invalid` };
  const base = { tenantSlug: `${SLUG}${RUN}`, unitSlug: US };
  const ip = () => `${SLUG}ip-${uid()}`;
  const png = () => Uint8Array.from(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(96)]));
  const rvOf = (id: string) => prisma.hotelReservation.findUnique({ where: { id } }) as Promise<Any>;
  const itemsOf = (id: string, type?: string) => prisma.hotelFolioItem.findMany({ where: { folio: { reservationId: id }, ...(type ? { type } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }) as Promise<Any[]>;
  const live = (xs: Any[]) => xs.filter((i) => !i.voidedAt && i.type !== "VOID_REVERSAL");
  const glLines = async () => {
    const es = (await prisma.accountJournalEntry.findMany({ where: { systemId: ACCS }, include: { lines: { include: { account: { select: { code: true } } } } } })) as Any[];
    return es.flatMap((e) => e.lines.map((l: Any) => ({ code: String(l.account.code), debit: Number(l.debit), credit: Number(l.credit), refType: e.refType, refId: e.refId, entryId: e.id })));
  };
  const crNet = (ls: Any[], pred: (c: string) => boolean) => sum(ls.filter((l) => pred(l.code)).map((l) => l.credit - l.debit));
  const vatOf = (gross: number) => VAT.splitIncludedVat(gross, 700).vatSatang as number;
  const S: Record<string, Any> = {};

  // ═══ 1 ราคา/แผน (H.1) ═══
  console.log("\n── 1 ราคา/แผน (H.1) ──");
  await must("E-1", "listRatePlans สร้าง STANDARD · saveRatePlan เปิด WEB/LINE/COUNTER/OTA · saveRates ดีลักซ์ 1,290/1,490 ซูพีเรีย 990/1,190 · กฎยกเลิก 3 ขั้น · setOverride ดีลักซ์วันนี้ 1,550 ⇒ ราคาคืนวันนี้ 155,000 สตางค์ · คืน W+6 ตามตาราง", async () => {
    okRes(await HOTEL.listRatePlans(OWNER, ctx, { unitId: UH }), "listRatePlans");
    S.STD = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: UH, code: "STANDARD" } }))?.id;
    ok(S.STD, "ไม่มีแผน STANDARD");
    okRes(await HOTEL.saveRatePlan(OWNER, ctx, { unitId: UH, id: S.STD, code: "STANDARD", name: "ราคามาตรฐาน", visibility: ["WEB", "LINE", "COUNTER", "OTA"] }), "saveRatePlan");
    okRes(await HOTEL.saveRates(OWNER, ctx, { unitId: UH, ratePlanId: S.STD, rows: [{ roomTypeId: RT.dlx, seasonId: null, priceWeekdaySatang: PRICE.dlxWd, priceWeekendSatang: PRICE.dlxWe, priceHolidaySatang: null }, { roomTypeId: RT.sup, seasonId: null, priceWeekdaySatang: PRICE.supWd, priceWeekendSatang: PRICE.supWe, priceHolidaySatang: null }] }), "saveRates");
    okRes(await HOTEL.saveCancelRules(OWNER, ctx, { unitId: UH, ratePlanId: S.STD, rules: [{ daysBefore: 7, refundBp: 10_000 }, { daysBefore: 3, refundBp: 5_000 }, { daysBefore: 0, refundBp: 0 }] }), "saveCancelRules");
    okRes(await HOTEL.setOverride(OWNER, ctx, { unitId: UH, roomTypeId: RT.dlx, ratePlanId: S.STD, date: T0, priceSatang: PRICE.override, reason: "ราคาพิเศษ e2e H.9" }), "setOverride");
    const pc = await HOTEL.loadPricingContext(ctx, UH, { from: T0, to: W(7) });
    ok(pc, "loadPricingContext null");
    const p0 = HOTEL.resolveNightPrice(pc, { roomTypeId: RT.dlx, ratePlanId: S.STD, date: T0 });
    const p6 = HOTEL.resolveNightPrice(pc, { roomTypeId: RT.dlx, ratePlanId: S.STD, date: W(6) });
    eq([p0?.priceSatang, p6?.priceSatang], [PRICE.override, dlxPrice(W(6))], "ราคาคืน (วันนี้ override · W+6 ตาราง)");
  });

  // ═══ 2 จองเว็บ (H.8) ═══
  console.log("\n── 2 จองเว็บ → HOLD → สลิป → อนุมัติ (H.8) ──");
  await must("E-2", "publicSearch (วันนี้ 1 คืน) ⇒ ดีลักซ์ remaining 3 · แผน STANDARD total 155,000 · มัดจำคืนแรก 155,000 · ซูพีเรีย remaining 2", async () => {
    const r = okRes(await WEB.publicSearch({ ...base, checkIn: T0, checkOut: W(1), adults: 2, children: 0, rooms: 1 }, { clientKey: ip() }), "publicSearch");
    const dlx = r.roomTypes.find((t: Any) => t.id === RT.dlx);
    const sup = r.roomTypes.find((t: Any) => t.id === RT.sup);
    const plan = dlx?.plans?.find((p: Any) => p.id === S.STD);
    eq([dlx?.remaining, plan?.totalSatang, plan?.depositSatang, sup?.remaining, r.nights], [3, PRICE.override, PRICE.override, 2, 1], "ผลค้นหา");
  });
  await must("E-3", "publicCreateHold ไม่มีอีเมล/เบอร์ ⇒ CONTACT_REQUIRED · มีครบ ⇒ HOLD · depositRequired 155,000 · total 155,000 · snapshot แผน/ราคาคืน = 155,000 · nights counted 1", async () => {
    const tick = () => WEB.holdFormStart(UH, new RealDate(RealDate.now() - 10_000));
    const bad = await call(() => WEB.publicCreateHold({ ...base, checkIn: T0, checkOut: W(1), adults: 2, children: 0, rooms: [{ roomTypeId: RT.dlx, qty: 1, ratePlanId: S.STD }], guest: { name: "ไม่มีช่องทางติดต่อ" }, locale: "th", spam: { hp: "", st: tick() }, idempotencyKey: `${SLUG}idem-${uid()}` }, { clientKey: ip() }));
    eq(bad?.code, "CONTACT_REQUIRED", "ไม่มีช่องทางติดต่อ");
    const h = okRes(await call(() => WEB.publicCreateHold({ ...base, checkIn: T0, checkOut: W(1), adults: 2, children: 0, rooms: [{ roomTypeId: RT.dlx, qty: 1, ratePlanId: S.STD }], guest: GUEST, locale: "th", spam: { hp: "", st: tick() }, idempotencyKey: `${SLUG}idem-${uid()}` }, { clientKey: ip() })), "publicCreateHold");
    S.hold = h;
    const rv = await prisma.hotelReservation.findUnique({ where: { publicToken: h.publicToken } });
    ok(rv, "ไม่พบการจองจาก token");
    S.rid = rv.id;
    const nights = await prisma.hotelBookingNight.findMany({ where: { reservationId: rv.id } });
    eq([h.status, rv.status, rv.source, h.depositRequiredSatang, h.totalSatang, rv.depositSatang, nights.length, nights[0]?.priceSatang, nights[0]?.counted, rv.ratePlanId === S.STD], ["HOLD", "HOLD", "WEB", PRICE.override, PRICE.override, PRICE.override, 1, PRICE.override, true, true], "HOLD");
  });
  await must("E-4", "publicStatus ⇒ state HOLD · QR ยอด 155,000 · ยอดคืน 0 (ยังไม่จ่าย) · ไม่มีอีเมล/เบอร์เต็มใน DTO", async () => {
    const s = okRes(await WEB.publicStatus({ ...base, publicToken: S.hold.publicToken }, { clientKey: ip() }), "publicStatus");
    eq([s.state, s.pay?.amountSatang, s.deposit?.requiredSatang, s.deposit?.paid, s.refund?.refundSatang ?? 0, s.refund?.paidSatang ?? 0], ["HOLD", PRICE.override, PRICE.override, false, 0, 0], "สถานะ");
    ok(!J(s).includes(GUEST.email) && !J(s).includes(GUEST.phone), "DTO มีอีเมล/เบอร์เต็ม");
  });
  await must("E-5", "publicAttachSlip (PNG) ⇒ PaymentSlip HOTEL_DEPOSIT expected 155,000 รอตรวจ · การจองยัง HOLD · ไม่มีใบรับ", async () => {
    const sl = okRes(await call(() => WEB.publicAttachSlip({ ...base, publicToken: S.hold.publicToken, file: { data: png(), contentType: "image/png" }, idempotencyKey: `${SLUG}slip-${uid()}` }, { clientKey: ip(), deps: { put: async () => {}, del: async () => 200 } })), "attach");
    S.slipId = sl.slipId;
    const slip = await prisma.paymentSlip.findUnique({ where: { id: sl.slipId } });
    eq([slip?.refType, slip?.refId === S.rid, slip?.expectedSatang, ["PENDING", "NEEDS_REVIEW"].includes(slip?.status), (await rvOf(S.rid)).status], ["HOTEL_DEPOSIT", true, PRICE.override, true, "HOLD"], "สลิป");
  });
  await must("E-6", "decideSlip APPROVE → drain (consumer payment.slip.approved) ⇒ CONFIRMED · depositPaidAt · ใบรับมัดจำ POS 1 ใบ PAID = 155,000 · PosDeposit ยอด 155,000 · หน้าสถานะ paid 155,000 · ยอดคืน (≥7 วัน? วันนี้ ⇒ 0%) = กฎ", async () => {
    okRes(await call(() => SV.decideSlip({ userId: MGR.userId }, ctx, S.slipId, { decision: "APPROVE", reason: "ตรวจกับแอปธนาคารแล้ว", transRef: `H9E2E${uid()}`.toUpperCase() })), "decideSlip");
    await drain();
    const rv = await rvOf(S.rid);
    const rec = (await prisma.posSale.findMany({ where: { tenantId: tA, idempotencyKey: { startsWith: `hotel-deposit-${S.rid}` } } })) as Any[];
    const dep = rv.depositSaleId ? await prisma.posDeposit.findUnique({ where: { receiptSaleId: rv.depositSaleId } }) : null;
    const s = okRes(await WEB.publicStatus({ ...base, publicToken: S.hold.publicToken }, { clientKey: ip() }), "publicStatus");
    S.depositSaleId = rv.depositSaleId;
    eq([rv.status, !!rv.depositPaidAt, rv.depositSatang, rec.length, rec[0]?.status, rec[0]?.grandTotalSatang, rec[0]?.id === rv.depositSaleId, dep?.amountSatang ?? dep?.balanceSatang, s.state, s.deposit?.paidSatang, s.refund?.refundSatang],
      ["CONFIRMED", true, PRICE.override, 1, "PAID", PRICE.override, true, PRICE.override, "CONFIRMED", PRICE.override, 0], "หลังอนุมัติ");
  });

  // ═══ 3 เช็กอิน + ทะเบียน + ร.ร.3 + ตม.30 (H.4) ═══
  console.log("\n── 3 เช็กอิน · ทะเบียนผู้พัก · ร.ร.3 · ตม.30 (H.4) ──");
  const GDEU = { fullName: "H9E2E MUELLER HANS", nationality: "DEU", idType: "PASSPORT", idNumber: "H9E2EP771", dob: "1979-06-21", sex: "M", occupation: "Engineer", address: "Berlin H9", visaType: "TR", visaNo: "H9VISA01", arrivalDate: T0, portOfEntry: "BKK", tm6No: "H9TM6-01" };
  await must("E-7", "assignableRooms ⇒ ดีลักซ์ 3 ห้อง sellable · checkInV2 (frontdesk · แขกเยอรมัน 1) ⇒ ok · CHECKED_IN · roomId · tm30DueAt ≈ +24 ชม. · needsDeposit false · occupancy STAY active 1 · nights.roomId ตั้ง · ไม่มีเลขพาสปอร์ตดิบในแถว", async () => {
    const ar = await HOTEL.assignableRooms(ctx, { reservationId: S.rid });
    ok(Array.isArray(ar), `assignableRooms ${J(ar).slice(0, 200)}`);
    const sell = ar.filter((r: Any) => r.sellable);
    eq(sell.length, 3, `ห้องขายได้ ${J(ar.map((r: Any) => [r.number, r.sellable]))}`);
    S.roomId = sell[0].roomId; S.roomNo = sell[0].number;
    const r = okRes(await call(() => HOTEL.checkInV2(FRONT, ctx, { reservationId: S.rid, roomId: S.roomId, guests: [GDEU] })), "checkInV2");
    S.guestId = r.guestIds?.[0];
    const rv = await rvOf(S.rid);
    const occ = await prisma.roomOccupancy.findMany({ where: { tenantId: tA, refType: "HotelReservation", refId: S.rid, active: true } });
    const nights = await prisma.hotelBookingNight.findMany({ where: { reservationId: S.rid } });
    const g = await prisma.hotelGuestRecord.findUnique({ where: { id: S.guestId } });
    const due = r.tm30DueAt ? Date.parse(r.tm30DueAt) - Date.parse(r.checkedInAt) : -1;
    eq([rv.status, rv.roomId === S.roomId, r.guestIds?.length, r.needsDeposit, Math.abs(due - DAY) < 120_000, occ.length, occ[0]?.kind, nights.every((n: Any) => n.roomId === S.roomId), g?.tm30Status, g?.idNumberLast4], ["CHECKED_IN", true, 1, false, true, 1, "STAY", true, "PENDING", "P771"], "เช็กอิน");
    ok(!J(g).includes(GDEU.idNumber), "เลขพาสปอร์ตดิบในแถว HotelGuestRecord");
  });
  await st("E-8", "ร.ร.3: signRr3 (PAPER) ⇒ rr3SignedAt · rr3Card แสดงเลขห้อง/สัญชาติ/ลงชื่อแล้ว · ไม่มีเลขเต็ม", async () => {
    const r = okRes(await call(() => HOTEL.signRr3(FRONT, ctx, { guestId: S.guestId, method: "PAPER", note: "แขกลงชื่อบนกระดาษแล้ว" })), "signRr3");
    const g = await prisma.hotelGuestRecord.findUnique({ where: { id: S.guestId } });
    const card = await call(() => HOTEL.rr3Card({ tenantId: tA, userId: FRONT.userId }, { guestId: S.guestId }));
    ok(card?.ok !== false, `rr3Card ${J(card).slice(0, 200)}`);
    const cj = J(card);
    eq([r.method, !!g?.rr3SignedAt, cj.includes(S.roomNo), /DEU|เยอรมัน/.test(cj), cj.includes(GDEU.idNumber)], ["PAPER", true, true, true, false], "ร.ร.3");
  });
  await st("E-9", "ตม.30: tm30Queue pending 1 (แขกนี้) → markTm30Filed เลขรับแจ้ง 1 เลข ⇒ filed 1 · FILED · tm30Ref · คิวเหลือ 0 · แจ้งซ้ำ idempotent (filed 0)", async () => {
    const q0 = okRes(await HOTEL.tm30Queue(ctx, { unitId: UH }), "tm30Queue");
    ok(q0.pending === 1 && q0.items.some((i: Any) => i.guestId === S.guestId), `คิวก่อน ${J({ p: q0.pending, n: q0.items.length })}`);
    const ref = `TM30-H9-${RUN}`.slice(0, 40);
    const f = okRes(await call(() => HOTEL.markTm30Filed(FRONT, ctx, { guestIds: [S.guestId], tm30Ref: ref })), "markTm30Filed");
    const g = await prisma.hotelGuestRecord.findUnique({ where: { id: S.guestId } });
    const q1 = okRes(await HOTEL.tm30Queue(ctx, { unitId: UH }), "tm30Queue หลัง");
    const again = await call(() => HOTEL.markTm30Filed(FRONT, ctx, { guestIds: [S.guestId], tm30Ref: ref }));
    eq([f.filed, g?.tm30Status, g?.tm30Ref, q1.pending, again?.ok === true ? again.filed : `ok:false ${again?.code}`, (await prisma.hotelGuestRecord.findUnique({ where: { id: S.guestId } }))?.tm30Ref], [1, "FILED", ref, 0, 0, ref], "ตม.30");
  });

  // ═══ 4 ลงห้องจาก POS (H.5) ═══
  console.log("\n── 4 บิลร้านอาหารลงห้อง (H.5 chargeToRoom) ──");
  await must("E-10", "บิลร้านอาหาร (หน่วย RESTAURANT · POS เดียวกัน) ต้มยำ 320 + ข้าวผัด 320 จ่าย ROOM_CHARGE 640 อ้างเลขห้อง → drain pos.sale.paid ⇒ POS_CHARGE 2 แถว Σ 64,000 refId = บิล · chargeToRoom ซ้ำบิลเดิม ⇒ DUPLICATE · folio balance = 64,000 − มัดจำ 155,000", async () => {
    const s = await POS.createSale({ tenantId: tA, unitId: UR, systemId: POSS, sourceModule: "POS", idempotencyKey: `${SLUG}rc-${uid()}`, lines: [{ name: "ต้มยำกุ้ง", qty: 1, unitPriceSatang: 32_000 }, { name: "ข้าวผัดปู", qty: 1, unitPriceSatang: 32_000 }], payMethods: [{ type: "ROOM_CHARGE", amountSatang: 64_000, reference: S.roomNo }] });
    S.rcSaleId = s?.saleId ?? s?.id ?? s?.sale?.id;
    ok(S.rcSaleId, `createSale ${J(s).slice(0, 200)}`);
    await drain();
    const pc = live(await itemsOf(S.rid, "POS_CHARGE"));
    const dup = await call(() => HOTEL.chargeToRoom({ tenantId: tA, folioRef: { roomNumber: S.roomNo }, lines: [{ name: "ซ้ำ", qty: 1, unitAmountSatang: 64_000 }], sourceSaleId: S.rcSaleId }));
    const f = await prisma.hotelFolio.findUnique({ where: { reservationId: S.rid } });
    const sale = await prisma.posSale.findUnique({ where: { id: S.rcSaleId } });
    eq([sale?.status, pc.length, sum(pc.map((i) => i.amountSatang)), pc.every((i) => i.refType === "PosSale" && i.refId === S.rcSaleId), dup?.code, f?.status, f?.balanceSatang], ["PAID", 2, 64_000, true, "DUPLICATE", "OPEN", 64_000 - PRICE.override], "ลงห้อง");
  });

  // ═══ 5 แม่บ้าน (H.6) ═══
  console.log("\n── 5 แม่บ้าน DIRTY→CLEAN + มินิบาร์ (H.6) ──");
  await must("E-11", "แม่บ้าน: hkSetStatus CLEAN→DIRTY · hkStart · hkFinish (เช็กลิสต์ครบ · มินิบาร์ น้ำ×2 + ขนม×1) ⇒ CLEAN · มินิบาร์ posted ยอด 7,500 · folio MINIBAR Σ 7,500 · log DIRTY→CLEAN durationSec · ห้องยังมีแขก (inHouse)", async () => {
    okRes(await call(() => HOTEL.hkSetStatus(MAID, ctx, { roomId: S.roomId, to: "DIRTY", idempotencyKey: `${SLUG}hk1-${uid()}` })), "hkSetStatus DIRTY");
    okRes(await call(() => HOTEL.hkStart(MAID, ctx, { roomId: S.roomId })), "hkStart");
    const view = okRes(await HOTEL.hkRoom(ctx, { unitId: UH, roomId: S.roomId }), "hkRoom");
    const fin = okRes(await call(() => HOTEL.hkFinish(MAID, ctx, { roomId: S.roomId, checklist: (view.checklist as string[]).map((k) => ({ key: k, done: true })), minibar: [{ key: "water", qty: 2 }, { key: "snack", qty: 1 }], idempotencyKey: `${SLUG}hk2-${uid()}` })), "hkFinish");
    const room = await prisma.hotelRoom.findUnique({ where: { id: S.roomId } });
    const mb = live(await itemsOf(S.rid, "MINIBAR"));
    const logs = (await prisma.hotelHousekeepingLog.findMany({ where: { roomId: S.roomId }, orderBy: { createdAt: "asc" } })) as Any[];
    const f = await prisma.hotelFolio.findUnique({ where: { reservationId: S.rid } });
    eq([fin.to, room?.hkStatus, view.inHouse, fin.minibar?.amountSatang, sum(mb.map((i) => i.amountSatang)), logs.some((l) => l.fromStatus === "DIRTY" && l.toStatus === "CLEAN"), f?.balanceSatang], ["CLEAN", "CLEAN", true, 7_500, 7_500, true, 64_000 + 7_500 - PRICE.override], "แม่บ้าน");
  });

  // ═══ 6 ปิดวัน + เช็กเอาต์ + บัญชี + รายงาน (นาฬิกา = พรุ่งนี้ 10:00 ไทย) ═══
  console.log("\n── 6 ปิดวัน (H.7) · เช็กเอาต์ (H.5) · GL · รายงาน — นาฬิกาเลื่อนเป็น พรุ่งนี้ 10:00 น. ──");
  SHIFT_MS = Date.parse(`${W(1)}T10:00:00+07:00`) - RealDate.now();
  try {
    await must("E-12", `auditPreview(${T0}) ⇒ คืนที่จะโพสต์ 1 · 155,000 · closeNightAudit ⇒ ok · roomNightsPosted 1 · KPI occupied 1/${TOTAL_ROOMS} · bps 2000 · รายได้ 155,000 · ADR 155,000 · RevPAR 31,000 · ROOM บน folio 1 แถว = 155,000 · ปิดซ้ำ ALREADY_CLOSED ไม่โพสต์ซ้ำ`, async () => {
      const pv = okRes(await call(() => HOTEL.auditPreview(MGR, ctx, { unitId: UH, businessDate: T0 })), "auditPreview");
      eq([pv.roomNightsToPost, pv.revenueSatang, pv.tooEarly], [1, PRICE.override, false], "preview");
      const c = okRes(await call(() => HOTEL.closeNightAudit(MGR, ctx, { unitId: UH, businessDate: T0 })), "closeNightAudit");
      S.auditKpi = c.kpi;
      const k = c.kpi;
      eq([c.roomNightsPosted, k.roomsOccupied, k.roomsAvailable, k.occupancyBps, k.roomRevenueSatang, k.adrSatang, k.revparSatang], [1, 1, TOTAL_ROOMS, 2000, PRICE.override, PRICE.override, PRICE.override / TOTAL_ROOMS], "KPI");
      const again = await call(() => HOTEL.closeNightAudit(MGR, ctx, { unitId: UH, businessDate: T0 }));
      const rooms = live(await itemsOf(S.rid, "ROOM"));
      eq([again?.code, rooms.length, rooms[0]?.amountSatang, rooms[0] ? ymdOf(rooms[0].businessDate) : null], ["ALREADY_CLOSED", 1, PRICE.override, T0], "ค่าห้องโพสต์ครั้งเดียว");
    });
    await st("E-13", "หลังปิด: occupancyReport(วันนั้น) closed = KPI แถว freeze · auditHistory 1 แถว · getUnitKpi.roomRevenueYesterdaySatang = 155,000", async () => {
      const occ = okRes(await HOTEL.occupancyReport(rctx, { unitId: UH, from: T0, to: T0 }), "occupancyReport");
      const hist = okRes(await HOTEL.auditHistory(ctx, { unitId: UH, from: T0, to: T0 }), "auditHistory");
      const kpi = await HOTEL.getUnitKpi(UH);
      const row = occ.rows?.[0];
      eq([row?.closed, row?.occupied ?? row?.roomsOccupied, row?.revenueSatang, row?.adrSatang, hist.rows?.length, kpi?.roomRevenueYesterdaySatang], [true, 1, PRICE.override, PRICE.override, 1, PRICE.override], "รายงานหลังปิด");
    });
    const GRAND = PRICE.override + 64_000 + 7_500;
    await must("E-14", `prepareCheckout ⇒ grand ${GRAND} (ห้อง 155,000 + ร้านอาหาร 64,000 + มินิบาร์ 7,500) · มัดจำ 155,000 · payable ${GRAND - PRICE.override} · taxOk · ROOM ยังไม่เพิ่ม`, async () => {
      const pr = okRes(await call(() => HOTEL.prepareCheckout(FRONT, ctx, { reservationId: S.rid })), "prepareCheckout");
      S.payable = pr.payableSatang;
      eq([pr.grandTotalSatang, pr.depositSatang, pr.payableSatang, pr.taxOk, live(await itemsOf(S.rid, "ROOM")).length], [GRAND, PRICE.override, GRAND - PRICE.override, true, 1], "prepare");
    });
    await must("E-15", "settleAndCheckOut (เงินสด = payable) ⇒ บิล POS ใบเดียว PAID grand = ยอด folio · จ่าย DEPOSIT 155,000 อ้างใบรับมัดจำ + CASH ส่วนที่เหลือ · CHECKED_OUT · folio ปิด · ห้อง DIRTY · occupancy ปล่อย · PosDeposit ใช้หมด", async () => {
      const r = okRes(await call(() => HOTEL.settleAndCheckOut(FRONT, ctx, { reservationId: S.rid, shiftId: null, securityDeposit: "REFUND", payMethods: [{ type: "CASH", amountSatang: S.payable }] })), "settleAndCheckOut");
      S.settleSaleId = r.saleId;
      await drain();
      const sale = await prisma.posSale.findUnique({ where: { id: r.saleId } });
      const pays = (await prisma.posPayment.findMany({ where: { saleId: r.saleId } })) as Any[];
      const depPay = pays.filter((p) => p.type === "DEPOSIT");
      const cash = pays.filter((p) => p.type === "CASH");
      const rv = await rvOf(S.rid);
      const f = await prisma.hotelFolio.findUnique({ where: { reservationId: S.rid } });
      const room = await prisma.hotelRoom.findUnique({ where: { id: S.roomId } });
      const occ = await prisma.roomOccupancy.count({ where: { tenantId: tA, refType: "HotelReservation", refId: S.rid, active: true } });
      const dep = await prisma.posDeposit.findUnique({ where: { receiptSaleId: S.depositSaleId } });
      S.depStatus = dep?.status;
      eq([sale?.status, sale?.grandTotalSatang, sale?.sourceModule, sum(depPay.map((p) => p.amountSatang)), depPay[0]?.refSaleId === S.depositSaleId, sum(cash.map((p) => p.amountSatang)), rv.status, f?.status !== "OPEN", room?.hkStatus, occ, (dep?.amountSatang ?? -1) - (dep?.usedSatang ?? 0) - (dep?.refundedSatang ?? 0), dep?.usedSatang, dep?.status === "OPEN"],
        ["PAID", GRAND, "HOTEL", PRICE.override, true, GRAND - PRICE.override, "CHECKED_OUT", true, "DIRTY", 0, 0, PRICE.override, false], `เช็กเอาต์ (PosDeposit ${J(dep && { status: dep.status, amount: dep.amountSatang })})`);
    });
    await st("E-16", "GL ทั้งสมุดของร้าน: ทุก JV Σdr = Σcr · 4xxx สุทธิ = รายได้ไม่รวม VAT ของยอดเข้าพัก (grand − VAT(grand)) · 2110 มัดจำ สุทธิ 0 · 1100 ลูกหนี้ลงห้อง สุทธิ 0 · 2200 VAT ขาย = VAT(grand) — ร้านอาหารไม่ถูกนับรายได้ซ้ำ", async () => {
      await drain();
      const ls = await glLines();
      ok(ls.length > 0, "ไม่มี JV");
      const byEntry = new Map<string, { d: number; c: number }>();
      for (const l of ls) { const e = byEntry.get(l.entryId) ?? { d: 0, c: 0 }; e.d += l.debit; e.c += l.credit; byEntry.set(l.entryId, e); }
      const unbalanced = [...byEntry.entries()].filter(([, v]) => v.d !== v.c);
      const rev = crNet(ls, (c) => c.startsWith("4"));
      const vat = crNet(ls, (c) => c === "2200" || c.startsWith("22"));
      const s2110 = crNet(ls, (c) => c === "2110");
      const s1100 = crNet(ls, (c) => c === "1100");
      S.glRev = rev;
      const exp = GRAND - vatOf(GRAND);
      const codes: Record<string, number> = {};
      for (const l of ls) codes[l.code] = (codes[l.code] ?? 0) + l.credit - l.debit;
      eq([unbalanced.length, rev, s2110, s1100, vat], [0, exp, 0, 0, vatOf(GRAND)], `GL (Cr−Dr ต่อบัญชี ${J(codes)})`);
    });
    await st("E-17", `revenueReport(${T0}..${W(1)}) รวม = บิลเช็กเอาต์ ${GRAND} · ห้อง 155,000 · อื่น 71,500 · vatSatang = VAT(grand) · รวม − VAT = GL 4xxx · depositsReport ไม่มีริบ`, async () => {
      const rep = okRes(await HOTEL.revenueReport(rctx, { unitId: UH, from: T0, to: W(1), groupBy: "source" }), "revenueReport");
      const t = rep.total;
      const dep = await call(() => HOTEL.depositsReport(rctx, { unitId: UH, from: T0, to: W(1) }));
      eq([t.totalSatang, t.roomRevenueSatang, t.otherRevenueSatang, t.vatSatang, t.totalSatang - t.vatSatang, rep.rows.map((r: Any) => r.key), dep?.forfeitedSatang ?? `ERR ${dep?.code}`], [GRAND, PRICE.override, 64_000 + 7_500, vatOf(GRAND), S.glRev, ["WEB"], 0], "รายงานรายได้");
    });
    await st("E-18", "แม่บ้านหลังแขกออก: ห้อง DIRTY → hkFinish ⇒ CLEAN · ไม่มี MINIBAR ใหม่บนบิลที่ปิดแล้ว", async () => {
      const view = okRes(await HOTEL.hkRoom(ctx, { unitId: UH, roomId: S.roomId }), "hkRoom");
      const fin = okRes(await call(() => HOTEL.hkFinish(MAID, ctx, { roomId: S.roomId, checklist: (view.checklist as string[]).map((k) => ({ key: k, done: true })), idempotencyKey: `${SLUG}hk3-${uid()}` })), "hkFinish");
      eq([fin.to, view.inHouse, live(await itemsOf(S.rid, "MINIBAR")).length], ["CLEAN", false, 2], "ทำห้องหลังออก");
    });
  } finally {
    SHIFT_MS = 0;
  }

  // ═══ 7 OTA FAKE (H.10) ═══
  console.log("\n── 7 ช่องทาง OTA (FAKE · H.10) ──");
  const D = W(6);
  await must("E-19", "saveIntegration CHANNEL_MANAGER FAKE (หน่วยโรงแรม) · testIntegration · แม็ปห้อง DLX/SUP · แม็ปแผน STD ⇒ buildAri คืน W+6 ดีลักซ์ available 3 ราคา = ตาราง × markup", async () => {
    const sv = okRes(await INT.saveIntegration(ctx, OWNER, { create: true, kind: "CHANNEL_MANAGER", provider: "FAKE", label: "OTA H9 e2e", unitIds: [UH], fields: { apiKey: `h9e2e-key-${RUN}`, accountId: `h9e2e-acc-${RUN}`, mode: "OK" } }), "saveIntegration");
    S.conn = sv.integration.id;
    okRes(await INT.testIntegration(ctx, OWNER, { id: S.conn }), "testIntegration");
    okRes(await HOTEL.saveRoomMap(OWNER, ctx, { unitId: UH, connectionId: S.conn, roomTypeId: RT.dlx, externalRoomId: "DLX" }), "map DLX");
    okRes(await HOTEL.saveRoomMap(OWNER, ctx, { unitId: UH, connectionId: S.conn, roomTypeId: RT.sup, externalRoomId: "SUP" }), "map SUP");
    okRes(await HOTEL.saveRateMap(OWNER, ctx, { unitId: UH, connectionId: S.conn, ratePlanId: S.STD, externalRateId: "STD", markupBp: 0 }), "map STD");
    const a = await HOTEL.buildAri(S.conn, D, D, UH);
    const cell = a?.byDate?.[D]?.DLX;
    S.ari0 = cell?.available;
    eq([cell?.available, cell?.rates?.STD?.priceSatang, cell?.stopSell], [3, dlxPrice(D), false], `ARI ก่อน ${J(cell)}`);
  });
  await must("E-20", "ingestInbound ฉบับ NEW (DLX 1 ห้อง W+6 · gross 2,300 · ค่าคอม 345) ⇒ received 1 · applyInbound ⇒ APPLIED · การจอง OTA CONFIRMED gross/commission ตรง · nights 1 · ส่งซ้ำฉบับเดิม ⇒ duplicates 1 ไม่มีการจองเพิ่ม", async () => {
    const row = { externalId: `H9E2E-${RUN}`, version: 1, status: "NEW", externalRoomId: "DLX", externalRateId: "STD", checkIn: D, checkOut: addDays(D, 1), rooms: 1, adults: 2, children: 0, guest: { name: "แขก OTA H9", phone: "0890000000", email: `${SLUG}ota@qc.invalid` }, grossSatang: 230_000, commissionSatang: 34_500, netSatang: 195_500, prepaid: false };
    const ing = okRes(await HOTEL.ingestInbound(S.conn, [row]), "ingestInbound");
    eq(ing.received, 1, "received");
    const ib = await prisma.channelReservationInbox.findFirst({ where: { connectionId: S.conn, externalId: row.externalId, version: 1 } });
    const ap = await call(() => HOTEL.applyInbound(ib.id));
    const rvs = (await prisma.hotelReservation.findMany({ where: { tenantId: tA, channelConnectionId: S.conn, channelRef: row.externalId } })) as Any[];
    const nights = rvs.length ? await prisma.hotelBookingNight.count({ where: { reservationId: rvs[0].id, counted: true } }) : -1;
    const dup = okRes(await HOTEL.ingestInbound(S.conn, [row]), "ingest ซ้ำ");
    const rvs2 = await prisma.hotelReservation.count({ where: { tenantId: tA, channelConnectionId: S.conn, channelRef: row.externalId } });
    eq([ap?.ok, ap?.status, rvs.length, rvs[0]?.source, rvs[0]?.status, rvs[0]?.grossSatang, rvs[0]?.commissionSatang, rvs[0]?.roomTypeId === RT.dlx, nights, dup.duplicates, rvs2], [true, "APPLIED", 1, "OTA", "CONFIRMED", 230_000, 34_500, true, 1, 1, 1], `inbound ${J(ap).slice(0, 160)}`);
  });
  await st("E-21", "drain ⇒ งาน ARI PENDING ครอบ W+6 · ค่า ARI ใหม่ ดีลักซ์ available 3 → 2 · pushAriJobs (FAKE) ⇒ งานนั้น SENT · payloadHash = ariHash(ARI ของช่วงงาน) ที่ available = 2", async () => {
    await drain();
    const jobs = (await prisma.channelAriJob.findMany({ where: { connectionId: S.conn, status: "PENDING", dateFrom: { lte: dbDate(D) }, dateTo: { gte: dbDate(D) } } })) as Any[];
    ok(jobs.length >= 1, `ไม่มีงาน ARI PENDING ครอบ ${D} (${J((await prisma.channelAriJob.findMany({ where: { connectionId: S.conn } })).map((j: Any) => [ymdOf(j.dateFrom), ymdOf(j.dateTo), j.status]))})`);
    const a1 = (await HOTEL.buildAri(S.conn, D, D, UH))?.byDate?.[D]?.DLX?.available;
    await HOTEL.pushAriJobs(new Date(), 20_000);
    const after = (await prisma.channelAriJob.findMany({ where: { id: { in: jobs.map((j) => j.id) } } })) as Any[];
    const sent = after.filter((j) => j.status === "SENT");
    ok(sent.length >= 1, `งานไม่ถูกส่ง ${J(after.map((j) => [j.status, j.lastError]))}`);
    const j = sent[0];
    const payload = await HOTEL.buildAri(S.conn, ymdOf(j.dateFrom), ymdOf(j.dateTo), UH);
    eq([S.ari0, a1, payload?.byDate?.[D]?.DLX?.available, j.payloadHash === HOTEL.ariHash(payload)], [3, 2, 2, true], "ARI ส่งค่าใหม่");
  });
} catch (e) {
  console.log(`🔴 สคริปต์ล้มนอกข้อ: ${errMsg(e)}`);
  cks.push({ id: "Z-0", res: "FAIL", why: errMsg(e) });
  exitCode = 3;
} finally {
  SHIFT_MS = 0;
  await cleanup();
  const left = await prisma.tenant.count({ where: { slug: { startsWith: SLUG } } });
  const leftU = await prisma.user.count({ where: { email: { startsWith: SLUG } } });
  if (left || leftU) cks.push({ id: "Z-1", res: "FAIL", why: `เหลือร้าน ${left} ผู้ใช้ ${leftU}` });
  else cks.push({ id: "Z-1", res: "PASS", why: "" });
  console.log(`  ${left || leftU ? "❌" : "✅"} [Z-1] ล้างร้าน/ผู้ใช้ ${SLUG}* (เหลือ ${left}/${leftU})`);
}
const total = cks.length, passed = cks.filter((c) => c.res === "PASS").length, failed = cks.filter((c) => c.res === "FAIL").length, skipped = cks.filter((c) => c.res === "SKIP").length;
console.log(`\nJSON_SUMMARY ${J({ suite: SUITE, total, passed, failed, skipped, failedIds: cks.filter((c) => c.res === "FAIL").map((c) => c.id), sec: Math.round((RealDate.now() - T_START) / 1000) })}`);
await prisma.$disconnect?.();
process.exit(exitCode || (failed ? 1 : 0));
