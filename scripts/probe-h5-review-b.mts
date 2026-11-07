// probe-h5-b.mts — ผู้ตรวจรอบ 2 (เงิน) ใบ H.5 · GL/VAT/มัดจำ/ประกัน/กันรายได้ซ้ำ · ร้านชั่วคราว h5rv-b-* (ลบใน finally) · อ่าน/เขียนเฉพาะร้านของตัวเอง · ไม่แก้ src
// รัน: cd /root/projects/shark-svc-l2 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-h5-review-b.mts
// ไม่ซ้ำกับ probe รอบ 1 (scripts/probe-h5-review-a/a2) และข้อสอบ qc-svc-h.5 (ST/GL/SD) — เน้นขอบที่ยังไม่มีใครแตะ:
//   A มัดจำเกิน: GL 2110/2200/4xxx/1010 ครบสาย ใบรับ→บิล→ใบคืน (R5) · B มัดจำกลุ่มใช้ 2 บิล: 2110 สุทธิ 0 · C บิลค้างหลัง tx B ล้ม → void → -r1 → refundStay (m4)
//   D void บิลร้านหลังบิลห้องปิด (ห้ามกลับซ้ำ/ห้ามแตะบิลห้อง) · E ลงห้อง+settle แข่งกับคิวบัญชีของบิลร้าน (invariant) · F บิลผสม refundStay + สาย RCADJ idempotent
//   G ประกันริบ + PENALTY ส่วนเกิน + มัดจำเกิน ในการเช็กเอาต์เดียว (invariant แขกจ่าย = ค่าใช้จ่าย + ประกันที่ริบ) · H EXCLUSIVE+SC+DISCOUNT+POS_CHARGE · I บิลร้านมีส่วนลดท้ายบิล · Z Σdr=Σcr ทั้งสมุด
/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from "node:crypto";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
type Any = any;
const LABEL = "probe-h5-b";
const SLUG = "h5rv-b-";
loadSvcQcEnv(LABEL);
if (process.env.CI || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: env ต้องห้าม`); process.exit(4); }
delete process.env.SVC_QC_CLOCK;
const R = new URL("../src/lib", import.meta.url).pathname; // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h5-review-probe-b): probe ผู้ตรวจเงินรอบ 2 เข้าทรี
const { prisma } = (await import(`${R}/core/db`)) as Any;
const bk = (await import(`${R}/modules/hotel/booking.ts`)) as Any;
const rates = (await import(`${R}/modules/hotel/rates.ts`)) as Any;
const pricing = (await import(`${R}/modules/hotel/pricing.ts`)) as Any;
const svc = (await import(`${R}/modules/hotel/service.ts`)) as Any;
const fo = (await import(`${R}/modules/hotel/folio.ts`)) as Any;
const co = (await import(`${R}/modules/hotel/checkout.ts`)) as Any;
const rc = (await import(`${R}/modules/hotel/room-charge.ts`)) as Any;
const sys = (await import(`${R}/modules/system/service`)) as Any;
const acc = (await import(`${R}/modules/account/service`)) as Any;
const accIdx = (await import(`${R}/modules/account/index.ts`)) as Any;
const gl = (await import(`${R}/modules/account/gl`)) as Any;
const pos = (await import(`${R}/modules/pos/service`)) as Any;
const settings = (await import(`${R}/core/settings/service`)) as Any;
const wiring = (await import(`${R}/outbox-consumers`)) as Any;
const vat = (await import(`${R}/money/vat`)) as Any;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const J = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const DAY = 86_400_000;
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const W = (n: number) => addDays(today, n);
const checks: { id: string; ok: boolean; note: string }[] = [];
const chk = (id: string, name: string, ok: boolean, note = "") => { checks.push({ id, ok, note }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${note ? ` — ${note}` : ""}`); };
const info = (id: string, name: string, note = "") => console.log(`  ℹ️  [${id}] ${name}${note ? ` — ${note}` : ""}`);
const okRes = (r: Any, what: string) => { if (!r || r.ok !== true) throw new Error(`${what}: ${J(r).slice(0, 300)}`); return r; };
const call = async (f: () => Promise<Any>): Promise<Any> => { try { return await f(); } catch (e) { return { ok: false, code: "THROW", reason: errMsg(e) }; } };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const VAT = (x: number) => vat.splitIncludedVat(x, 700).vatSatang as number;
const BASE = (x: number) => x - VAT(x);
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

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
  if (pending.length) console.log(`  ⚠️ cleanup ลบไม่หมด: ${pending.join(",")}`);
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: SLUG } } });
}

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) { tenantIds.push(...stale.map((t: Any) => t.id)); await cleanup(); tenantIds.length = 0; }

  // ───── ร้านชั่วคราว: โรงแรม UH (INCLUSIVE) + ร้านอาหาร UR + โรงแรม UX (EXCLUSIVE+SC) · POS เดียว · บัญชี VAT 7% ─────
  const t = await prisma.tenant.create({ data: { name: "QC H5 review-b", slug: `${SLUG}${uid()}` } });
  tenantIds.push(t.id);
  const tid = t.id as string;
  const ctx = { tenantId: tid };
  const mkUnit = async (type: string, name: string) => (await prisma.businessUnit.create({ data: { tenantId: tid, type, name, slug: `u-${uid()}` } })).id as string;
  const UH = await mkUnit("HOTEL", "โรงแรม rv-b");
  const UR = await mkUnit("RESTAURANT", "ห้องอาหาร rv-b");
  const UX = await mkUnit("HOTEL", "โรงแรม EXCLUSIVE rv-b");
  const POS_A = (await sys.createSystem(tid, "POS", "POS rv-b")).id as string;
  for (const u of [UH, UR, UX]) await sys.linkUnit(tid, POS_A, u);
  const ACC_A = (await sys.createSystem(tid, "ACCOUNT", "บัญชี rv-b")).id as string;
  await acc.saveSettings(tid, ACC_A, { orgName: "rv-b จำกัด", taxId: "0105561177639", vatRegistered: true, vatRateBp: 700 });
  await gl.ensureAccounting({ tenantId: tid, systemId: ACC_A });
  await prisma.accountSystemLink.create({ data: { tenantId: tid, systemId: ACC_A, linkedKind: "POS", linkedId: POS_A } });
  const PRICE = 129_000;
  const mkType = async (unitId: string, name: string, base: number) => (await prisma.hotelRoomType.create({ data: { tenantId: tid, unitId, name, rentMode: "NIGHTLY", baseRateSatang: base, capacity: 3, baseOccupancy: 2, maxOccupancy: 3 } })).id as string;
  const DLX = await mkType(UH, "ดีลักซ์", PRICE);
  for (let i = 1; i <= 10; i++) await prisma.hotelRoom.create({ data: { tenantId: tid, unitId: UH, number: `D${String(i).padStart(2, "0")}`, roomTypeId: DLX, hkStatus: "CLEAN" } });
  const XPRICE = 100_000;
  const XT = await mkType(UX, "ดีลักซ์ X", XPRICE);
  for (let i = 1; i <= 3; i++) await prisma.hotelRoom.create({ data: { tenantId: tid, unitId: UX, number: `X${i}`, roomTypeId: XT, hkStatus: "CLEAN" } });
  const mkMember = async (tag: string, role: string, unitAccess: string[], permissions: Record<string, unknown> = {}) => {
    const id = `${SLUG}${tag}-${uid()}`;
    await prisma.user.create({ data: { id, email: `${SLUG}${tag}-${uid()}@shark.local`, name: `QC rv-b ${tag}` } });
    await prisma.membership.create({ data: { userId: id, tenantId: tid, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id };
  };
  const OWNER = await mkMember("owner", "OWNER", ["*"]);
  const MGR = await mkMember("mgr", "MANAGER", [UH, UR, UX]);
  const FRONT = await mkMember("front", "STAFF", [UH, UX], { "hotel.reservation.create": true, "hotel.reservation.cancel": true, "hotel.booking.manage": true, "hotel.reservation.checkIn": true, "hotel.rates.read": true, "hotel.folio.post": true, "hotel.reservation.checkOut": true });
  const CELL = { weekday: PRICE, weekend: 149_000 };
  const dow = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
  const night = (ymd: string) => ([5, 6].includes(dow(ymd)) ? CELL.weekend : CELL.weekday);
  okRes(await rates.listRatePlans(OWNER, ctx, { unitId: UH }), "list");
  const STD = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tid, unitId: UH, code: "STANDARD" } })).id as string;
  okRes(await rates.saveRates(OWNER, ctx, { unitId: UH, ratePlanId: STD, rows: [{ roomTypeId: DLX, seasonId: null, priceWeekdaySatang: CELL.weekday, priceWeekendSatang: CELL.weekend, priceHolidaySatang: null }] }), "saveRates");
  okRes(await rates.listRatePlans(OWNER, ctx, { unitId: UX }), "list X");
  const STDX = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tid, unitId: UX, code: "STANDARD" } })).id as string;
  okRes(await rates.saveRates(OWNER, ctx, { unitId: UX, ratePlanId: STDX, rows: [{ roomTypeId: XT, seasonId: null, priceWeekdaySatang: XPRICE, priceWeekendSatang: XPRICE, priceHolidaySatang: null }] }), "saveRates X");
  const GUEST = { name: "ผู้เข้าพัก rv-b", phone: "0895556666", email: "h5rv-b-guest@qc.invalid" };
  const setUnit = async (unitId: string, key: string, value: unknown) => okRes(await settings.setSettings(OWNER, ctx, [{ key, scope: "UNIT", scopeId: unitId, value }]), `ตั้ง ${key}`);
  const book = (over: Record<string, unknown>, unitId = UH) => bk.createBooking(FRONT, ctx, { unitId, rooms: [{ roomTypeId: DLX, adults: 2, children: 0 }], ratePlanId: STD, source: "PHONE", guest: GUEST, checkIn: W(0), checkOut: W(1), ...over });
  const takeDep = (id: string, over: Record<string, unknown> = {}, unitId = UH) => bk.takeBookingDeposit(FRONT, ctx, { unitId, reservationId: id, payType: "PROMPTPAY", ...over });
  const rvOf = (id: string) => prisma.hotelReservation.findUnique({ where: { id } }) as Promise<Any>;
  const folioOf = (id: string) => prisma.hotelFolio.findUnique({ where: { reservationId: id } }) as Promise<Any>;
  const itemsOf = async (id: string, type?: string) => (await prisma.hotelFolioItem.findMany({ where: { folio: { reservationId: id }, ...(type ? { type } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })) as Any[];
  const live = (xs: Any[]) => xs.filter((i) => !i.voidedAt && i.type !== "VOID_REVERSAL");
  const nightsOf = (id: string) => prisma.hotelBookingNight.findMany({ where: { reservationId: id }, orderBy: { date: "asc" } }) as Promise<Any[]>;
  const occOf = (id: string) => prisma.roomOccupancy.findMany({ where: { refType: "HotelReservation", refId: id, active: true } }) as Promise<Any[]>;
  const saleByKey = (key: string) => prisma.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId: tid, idempotencyKey: key } } }) as Promise<Any>;
  const saleById = (id: string) => prisma.posSale.findUnique({ where: { id } }) as Promise<Any>;
  const payOf = (saleId: string) => prisma.posPayment.findMany({ where: { saleId } }) as Promise<Any[]>;
  const depOf = (receipt: string) => prisma.posDeposit.findUnique({ where: { receiptSaleId: receipt } }) as Promise<Any>;
  const refundsOf = (receipt: string) => prisma.posSale.findMany({ where: { tenantId: tid, docType: "REFUND", refSaleId: receipt } }) as Promise<Any[]>;
  const checkIn = async (id: string, unitId = UH) => { const rv = await rvOf(id); const occ = (await occOf(id))[0]; okRes(await svc.checkIn(tid, unitId, id, rv.roomId ?? occ.roomId), "checkIn"); return rvOf(id); };
  const inhouse = async (over: Record<string, unknown> = {}, deposit: Record<string, unknown> | false = {}, unitId = UH) => {
    const r = okRes(await book(over, unitId), "book");
    const id = r.reservations[0].id as string;
    if (deposit !== false) okRes(await takeDep(id, deposit, unitId), "takeDeposit");
    const rv = await checkIn(id, unitId);
    const room = await prisma.hotelRoom.findUnique({ where: { id: rv.roomId } });
    return { id, rv, roomNo: room.number as string, groupId: r.groupId as string | null, reservations: r.reservations as Any[] };
  };
  const settle = (actor: Any, over: Record<string, unknown>) => call(() => co.settleAndCheckOut(actor, ctx, { shiftId: null, securityDeposit: "REFUND", ...over }));
  const prepare = (actor: Any, over: Record<string, unknown>) => call(() => co.prepareCheckout(actor, ctx, over));
  const posSale = (over: Record<string, unknown>) => pos.createSale({ tenantId: tid, unitId: UR, systemId: POS_A, sourceModule: "POS", idempotencyKey: `h5rv-b-sale-${uid()}`, lines: [{ name: "ต้มยำกุ้ง", qty: 1, unitPriceSatang: 32_000 }, { name: "ข้าวผัดปู", qty: 1, unitPriceSatang: 32_000 }], payMethods: [{ type: "CASH", amountSatang: 64_000 }], ...over });
  const drain = async () => { for (let i = 0; i < 3; i++) await wiring.drainAll(); };
  type Line = { code: string; debit: number; credit: number; refId: string; entryId: string; reversalOfId: string | null; status: string; key: string };
  const glLines = async (refIds?: string[]): Promise<Line[]> => {
    const es = (await prisma.accountJournalEntry.findMany({ where: { systemId: ACC_A, refType: "PosSale", ...(refIds ? { refId: { in: refIds } } : {}) }, include: { lines: { include: { account: { select: { code: true } } } } } })) as Any[];
    return es.flatMap((e) => e.lines.map((l: Any) => ({ code: l.account.code, debit: l.debit, credit: l.credit, refId: e.refId, entryId: e.id, reversalOfId: e.reversalOfId ?? null, status: e.status, key: e.idempotencyKey ?? "" })));
  };
  const net = (ls: Line[], pred: (c: string) => boolean) => sum(ls.filter((l) => pred(l.code)).map((l) => l.credit - l.debit)); // Cr − Dr
  const drNet = (ls: Line[], code: string) => -net(ls, (c) => c === code);
  const crNet = (ls: Line[], code: string) => net(ls, (c) => c === code);
  const rev = (ls: Line[]) => net(ls, (c) => c.startsWith("4"));
  const balanced = (ls: Line[]) => ls.length > 0 && sum(ls.map((l) => l.debit)) === sum(ls.map((l) => l.credit));
  const entriesOf = (ls: Line[]) => new Set(ls.map((l) => l.entryId)).size;
  const fmt = (ls: Line[]) => { const m: Record<string, { dr: number; cr: number }> = {}; for (const l of ls) { const c = (m[l.code] ??= { dr: 0, cr: 0 }); c.dr += l.debit; c.cr += l.credit; } return Object.entries(m).map(([c, v]) => `${c}:dr${v.dr}/cr${v.cr}`).join(" "); };
  const allZero = (ls: Line[]) => { const m: Record<string, number> = {}; for (const l of ls) m[l.code] = (m[l.code] ?? 0) + l.credit - l.debit; return Object.values(m).every((v) => v === 0); };

  // ═══════════ A. มัดจำเกินยอด (300,000 > ค่าห้อง) — GL ครบสาย ใบรับ → บิล settle (DEPOSIT บางส่วน · R5) → ใบคืนส่วนเกิน ═══════════
  console.log("\n── A. มัดจำเกิน: GL ใบรับ/บิล/ใบคืน (2110 · 2200 · 4xxx · 1010) ──");
  {
    const DEP = 300_000;
    const g = await inhouse({}, { amountSatang: DEP });
    const grand = night(W(0));
    const p = await prepare(FRONT, { reservationId: g.id });
    chk("A0", `prepare: deposit = ยอดบิล (ใช้บางส่วน ${grand}) · payable 0`, p?.ok === true && p.depositSatang === grand && p.payableSatang === 0, `dep=${p?.depositSatang} payable=${p?.payableSatang} grand=${p?.grandTotalSatang}`);
    const s = await settle(FRONT, { reservationId: g.id, payMethods: [] });
    const hs = await saleByKey(`hotel-sale-${g.id}`);
    const d = await depOf(g.rv.depositSaleId);
    const rf = await refundsOf(g.rv.depositSaleId);
    chk("A1", `settle ok · บิล PAID ${grand} จ่าย DEPOSIT=${grand} เท่านั้น · ใบคืน 1 ใบ = ${DEP - grand} · PosDeposit ไม่ OPEN`, s?.ok === true && hs?.status === "PAID" && hs.grandTotalSatang === grand && (await payOf(hs.id)).every((x: Any) => x.type === "DEPOSIT" && x.amountSatang === grand) && rf.length === 1 && Math.abs(rf[0].grandTotalSatang) === DEP - grand && d.status !== "OPEN", `${J(s).slice(0, 120)} refunds=${J(rf.map((x: Any) => x.grandTotalSatang))} dep=${d?.status} used=${d?.usedSatang} refunded=${d?.refundedSatang}`);
    await drain();
    const ls = await glLines([g.rv.depositSaleId, hs.id, ...rf.map((x: Any) => x.id)]);
    chk("A2", "GL 3 ใบ สมดุล · 2110 สุทธิ 0 (รับ − ใช้ − คืน)", balanced(ls) && crNet(ls, "2110") === 0, fmt(ls));
    chk("A3", `2200 สุทธิ = VAT(grand) ${VAT(grand)} (±1) · 4xxx = ฐาน(grand) ${BASE(grand)} (±1) · ไม่มีรายได้จากส่วนที่คืน`, near(crNet(ls, "2200"), VAT(grand)) && near(rev(ls), BASE(grand)), `2200=${crNet(ls, "2200")} rev=${rev(ls)}`);
    chk("A4", `1010 ธนาคาร สุทธิ = grand ${grand} (รับ 300,000 − คืน ${DEP - grand}) · 1000 เงินสด 0`, drNet(ls, "1010") === grand && drNet(ls, "1000") === 0, `1010=${drNet(ls, "1010")} 1000=${drNet(ls, "1000")}`);
    const items = await itemsOf(g.id);
    chk("A5", "folio: DEPOSIT −300,000 · DEPOSIT +grand (ใช้) · PAYMENT −grand · REFUND +ส่วนเกิน · Σ ทุกแถว = 0 = balance cache", sum(items.map((i) => i.amountSatang)) === 0 && (await folioOf(g.id)).balanceSatang === 0 && live(items).some((i) => i.type === "REFUND" && i.amountSatang === DEP - grand), J(items.map((i) => [i.type, i.amountSatang])));
  }

  // ═══════════ B. มัดจำกลุ่มถูกใช้ใน 2 บิล (settle รายห้อง 2 ครั้ง) — 2110 สุทธิ 0 · VAT ไม่ซ้ำ ═══════════
  console.log("\n── B. มัดจำกลุ่มแบ่งใช้ 2 บิล: GL ──");
  {
    const r = okRes(await book({ rooms: [1, 2].map(() => ({ roomTypeId: DLX, adults: 2, children: 0 })) }), "book group B");
    const [h, r2] = r.reservations.map((x: Any) => x.id as string);
    okRes(await takeDep(h), "deposit head B");
    const hrv = await rvOf(h);
    const n1 = night(W(0));
    await checkIn(h); await checkIn(r2);
    const s1 = await settle(FRONT, { reservationId: h, payMethods: [] });
    const s2 = await settle(FRONT, { reservationId: r2, payMethods: [] });
    const b1 = await saleByKey(`hotel-sale-${h}`);
    const b2 = await saleByKey(`hotel-sale-${r2}`);
    chk("B1", "settle รายห้อง 2 ครั้ง ok · บิล 2 ใบ ใบละ 1 คืน จ่ายด้วยมัดจำกลุ่มทั้งคู่", s1?.ok === true && s2?.ok === true && b1?.grandTotalSatang === n1 && b2?.grandTotalSatang === n1, `${s1?.ok ? "ok" : s1?.code} ${s2?.ok ? "ok" : s2?.code} b1=${b1?.grandTotalSatang} b2=${b2?.grandTotalSatang}`);
    await drain();
    const ls = await glLines([hrv.depositSaleId, b1?.id ?? "", b2?.id ?? ""]);
    const d = await depOf(hrv.depositSaleId);
    chk("B2", "GL ใบรับ + 2 บิล สมดุล · 2110 สุทธิ 0 (±1 เศษ VAT มัดจำ) · PosDeposit ปิด used = 2 คืน", balanced(ls) && near(crNet(ls, "2110"), 0) && d.status !== "OPEN" && d.usedSatang === 2 * n1, `${fmt(ls)} · dep ${d.status} used=${d.usedSatang}`);
    chk("B3", `2200 = VAT(2 บิล) ${VAT(n1) * 2} (±2) · 4xxx = ฐาน 2 บิล ${BASE(n1) * 2} (±2) · 1010 = มัดจำ ${2 * n1}`, near(crNet(ls, "2200"), 2 * VAT(n1), 2) && near(rev(ls), 2 * BASE(n1), 2) && drNet(ls, "1010") === 2 * n1, `2200=${crNet(ls, "2200")} rev=${rev(ls)} 1010=${drNet(ls, "1010")}`);
    if (crNet(ls, "2110") !== 0) info("B2x", "2110 เศษค้าง (สตางค์)", `${crNet(ls, "2110")}`);
  }

  // ═══════════ C. บิลค้างหลัง tx B ล้ม (บิล PAID ของคีย์ ≠ ยอดห้อง) → PAY_MISMATCH ไม่เปลี่ยนสถานะ → ผู้จัดการ void → เช็กเอาต์ใหม่ -r1 → refundStay (m4) ═══════════
  console.log("\n── C. บิล POS ค้าง (tx B ล้ม) → void → -r1 → refundStay ──");
  {
    const g = await inhouse();
    const grand = night(W(0));
    const dep = g.rv.depositSatang as number;
    const stuck = await pos.createSale({ tenantId: tid, unitId: UH, systemId: POS_A, sourceModule: "HOTEL", sourceId: g.id, idempotencyKey: `hotel-sale-${g.id}`, lines: [{ name: "บิลค้าง (จำลอง tx B ล้ม)", qty: 1, unitPriceSatang: 1_000 }], payMethods: [{ type: "CASH", amountSatang: 1_000 }] });
    const occ0 = (await occOf(g.id)).length;
    const s1 = await settle(FRONT, { reservationId: g.id, payMethods: [{ type: "CASH", amountSatang: grand - dep }] });
    const f1 = await folioOf(g.id);
    const rv1 = await rvOf(g.id);
    chk("C1", "settle เจอบิลคีย์เดิมที่ยอดไม่ตรง ⇒ PAY_MISMATCH (ไม่ throw) · folio OPEN · CHECKED_IN · occupancy/คืนไม่เปลี่ยน · ไม่มี PAYMENT · ไม่สร้างบิลใบ 2", s1?.ok === false && s1.code === "PAY_MISMATCH" && f1.status === "OPEN" && rv1.status === "CHECKED_IN" && (await occOf(g.id)).length === occ0 && (await nightsOf(g.id)).every((n) => n.counted) && live(await itemsOf(g.id, "PAYMENT")).length === 0 && !(await saleByKey(`hotel-sale-${g.id}-r1`)), `code=${s1?.code} reason=${String(s1?.reason).slice(0, 90)}`);
    await pos.voidSale(tid, UH, stuck.saleId);
    const s2 = await settle(FRONT, { reservationId: g.id, payMethods: [{ type: "CASH", amountSatang: grand - dep }] });
    const r1 = await saleByKey(`hotel-sale-${g.id}-r1`);
    const f2 = await folioOf(g.id);
    const d = await depOf(g.rv.depositSaleId);
    chk("C2", `หลัง void บิลค้าง: settle ok · บิลใหม่คีย์ -r1 PAID grand ${grand} · folio SETTLED settledSaleId = -r1 · มัดจำใช้ครั้งเดียว (${dep})`, s2?.ok === true && r1?.status === "PAID" && r1.grandTotalSatang === grand && s2.saleId === r1.id && f2.status === "SETTLED" && f2.settledSaleId === r1.id && d.usedSatang === dep, `${J(s2).slice(0, 100)} r1=${r1?.grandTotalSatang} used=${d?.usedSatang}`);
    const rs = await call(() => svc.refundStay(tid, UH, g.id));
    await drain();
    const ls = await glLines([stuck.saleId, r1?.id ?? ""]);
    chk("C3", "refundStay หาบิล -r1 (m4) ⇒ ok saleVoided · -r1 VOIDED · folio VOID · reservation REFUNDED · GL บิลค้าง + -r1 สุทธิ 0 ทุกบัญชี", rs?.ok === true && rs.saleVoided === true && (await saleById(r1.id)).status === "VOIDED" && (await folioOf(g.id)).status === "VOID" && (await rvOf(g.id)).status === "REFUNDED" && allZero(ls), `${J(rs).slice(0, 100)} ${fmt(ls)}`);
  }

  // ═══════════ D. void บิลร้าน (ลงห้องเต็มใบ) หลังบิลห้องปิดแล้ว — ห้ามกลับรายการซ้ำ · บิลห้องไม่ถูกแตะ ═══════════
  console.log("\n── D. void บิลร้านหลัง settle ──");
  {
    const g = await inhouse();
    const s = await posSale({ payMethods: [{ type: "ROOM_CHARGE", amountSatang: 64_000, reference: g.roomNo }] });
    await drain();
    const grand = night(W(0)) + 64_000;
    okRes(await settle(FRONT, { reservationId: g.id, payMethods: [{ type: "CASH", amountSatang: grand - g.rv.depositSatang }] }), "settle D");
    const hs = await saleByKey(`hotel-sale-${g.id}`);
    await drain();
    const before = await glLines([s.saleId]);
    const itemsBefore = (await itemsOf(g.id)).length;
    const v = await call(async () => { await pos.voidSale(tid, UR, s.saleId); return { ok: true }; });
    await drain();
    const after = await glLines([s.saleId]);
    const hotel = await glLines([hs.id]);
    chk("D1", "บิลร้าน VOIDED · JV บิลร้านยัง 2 ใบ (ขาย + กลับจาก settle) ไม่มีกลับซ้ำ · 1100/4xxx ของบิลร้านสุทธิ 0 · JV บิลห้อง POSTED ไม่ถูกแตะ", v?.ok === true && (await saleById(s.saleId)).status === "VOIDED" && entriesOf(before) === 2 && entriesOf(after) === 2 && drNet(after, "1100") === 0 && rev(after) === 0 && hotel.every((l) => l.status === "POSTED") && near(rev(hotel), BASE(grand)), `entries ${entriesOf(before)}→${entriesOf(after)} ${fmt(after)} · hotel rev=${rev(hotel)}`);
    const um = await call(() => rc.listUnmatchedRoomCharges(FRONT, ctx, { unitId: UH }));
    chk("D2", "folio ยัง SETTLED · ไม่มีแถวใหม่ (ไม่แตะบิลห้องที่ปิด) · บิลที่ void ไม่โผล่ในคิว unmatched", (await folioOf(g.id)).status === "SETTLED" && (await itemsOf(g.id)).length === itemsBefore && um?.ok === true && !um.rows.some((r: Any) => r.saleId === s.saleId), `items ${itemsBefore}→${(await itemsOf(g.id)).length} unmatched=${um?.rows?.length}`);
  }

  // ═══════════ E. ลงห้อง + settle แข่งกับคิวบัญชีของบิลร้าน (JV อาจลงหลังบิลห้องปิด) — invariant: รายได้ครั้งเดียว · 1100 = 0 ═══════════
  console.log("\n── E. settle ก่อน/ระหว่างคิวบัญชีของบิลร้าน (invariant) ──");
  {
    const g = await inhouse();
    const s = await posSale({ payMethods: [{ type: "ROOM_CHARGE", amountSatang: 64_000, reference: g.roomNo }] });
    // ไม่ drain เอง — ผูกมือทันที (ถ้าคิวลงให้ก่อน = DUPLICATE ก็ได้) แล้ว settle ทันที
    const at = await call(() => rc.attachRoomCharge(FRONT, ctx, { saleId: s.saleId, reservationId: g.id }));
    const jvBefore = entriesOf(await glLines([s.saleId]));
    const grand = night(W(0)) + 64_000;
    const st = await settle(FRONT, { reservationId: g.id, payMethods: [{ type: "CASH", amountSatang: grand - g.rv.depositSatang }] });
    const hs = await saleByKey(`hotel-sale-${g.id}`);
    info("E0", "ลำดับที่เกิดจริง", `attach=${at?.ok ? "ok" : at?.code} · JV บิลร้านก่อน settle=${jvBefore} · settle=${st?.ok ? "ok" : st?.code} warnings=${J(st?.warnings)}`);
    await drain();
    const ls = await glLines([s.saleId, hs?.id ?? "", g.rv.depositSaleId]);
    const rest = ls.filter((l) => l.refId === s.saleId);
    chk("E1", `หลัง drain: บิลห้องรวมอาหาร (grand ${grand}) · JV บิลร้าน = ขาย+กลับ (2 ใบ) · 1100 สุทธิ 0 · รายได้รวม = ฐาน(grand) ครั้งเดียว (±1) · 2200 (รวมใบรับมัดจำ) = VAT(grand) (±1) · 2110 สุทธิ 0`, st?.ok === true && hs?.grandTotalSatang === grand && entriesOf(rest) === 2 && drNet(ls, "1100") === 0 && near(rev(ls), BASE(grand)) && near(crNet(ls, "2200"), VAT(grand)) && near(crNet(ls, "2110"), 0), `${fmt(ls)} · entries บิลร้าน=${entriesOf(rest)}`);
    chk("E2", "POS_CHARGE บน folio 2 แถว ไม่ซ้ำ (attach ∥ consumer)", live(await itemsOf(g.id, "POS_CHARGE")).length === 2, `${live(await itemsOf(g.id, "POS_CHARGE")).length}`);
  }

  // ═══════════ F. บิลผสม (CASH 24,000 + ROOM_CHARGE 40,000) → settle → refundStay ⇒ บิลร้านคืนสภาพ · สาย RCADJ reverse→restore→reverse idempotent ═══════════
  console.log("\n── F. บิลผสม refundStay + สาย RCADJ ──");
  {
    const g = await inhouse();
    const s = await posSale({ payMethods: [{ type: "CASH", amountSatang: 24_000 }, { type: "ROOM_CHARGE", amountSatang: 40_000, reference: g.roomNo }] });
    await drain();
    const grand = night(W(0)) + 40_000;
    okRes(await settle(FRONT, { reservationId: g.id, payMethods: [{ type: "CASH", amountSatang: grand - g.rv.depositSatang }] }), "settle F");
    const hs = await saleByKey(`hotel-sale-${g.id}`);
    await drain();
    const mid = await glLines([s.saleId]);
    chk("F1", "หลัง settle: บิลร้านมี JV ขาย + JV ปรับ RCADJ (2 ใบ) · 1100 = 0 · เงินสดร้าน 24,000 คง · รายได้บิลร้านเหลือ ≈ ฐาน(24,000) (±2)", entriesOf(mid) === 2 && mid.some((l) => l.key.includes("#RCADJ#")) && drNet(mid, "1100") === 0 && drNet(mid, "1000") === 24_000 && near(rev(mid), BASE(24_000), 2), fmt(mid));
    const rs = await call(() => svc.refundStay(tid, UH, g.id));
    await drain();
    const ls = await glLines([s.saleId, hs.id]);
    const rest = ls.filter((l) => l.refId === s.saleId);
    const hotel = ls.filter((l) => l.refId === hs.id);
    chk("F2", "refundStay ok · บิลห้องสุทธิ 0 ทุกบัญชี · บิลร้านคืนสภาพ: 1100 Dr 40,000 · 1000 Dr 24,000 · 4xxx = ฐาน(64,000) (±1) · 2200 = VAT(64,000) (±1) · JV 3 ใบ (ขาย/ปรับ/กลับปรับ)", rs?.ok === true && allZero(hotel) && drNet(rest, "1100") === 40_000 && drNet(rest, "1000") === 24_000 && near(rev(rest), BASE(64_000)) && near(crNet(rest, "2200"), VAT(64_000)) && entriesOf(rest) === 3, `${J(rs).slice(0, 80)} rest: ${fmt(rest)} entries=${entriesOf(rest)} · hotel: ${fmt(hotel)}`);
    const inp = { tenantId: tid, posSystemId: POS_A, saleId: s.saleId, settleSaleId: hs.id, roomChargeSatang: 40_000, grossSatang: 64_000, reason: "probe" };
    const r1 = await call(() => accIdx.reverseRoomChargePosting(inp));
    const a1 = await glLines([s.saleId]);
    const r2 = await call(() => accIdx.reverseRoomChargePosting(inp));
    const a2 = await glLines([s.saleId]);
    chk("F3", "reverse (ผสม) รอบใหม่หลัง restore ⇒ JV ปรับ #2 (4 ใบ) 1100 = 0 · เรียกซ้ำ ⇒ ไม่เพิ่ม (4 ใบ) · ไม่ throw", r1?.posted === true && entriesOf(a1) === 4 && drNet(a1, "1100") === 0 && r2?.posted === true && r2.changed === 0 && entriesOf(a2) === 4, `r1=${J(r1)} r2=${J(r2)} entries ${entriesOf(a1)}/${entriesOf(a2)} ${fmt(a2)}`);
    const r3 = await call(() => accIdx.restoreRoomChargePosting(inp));
    const a3 = await glLines([s.saleId]);
    const r4 = await call(() => accIdx.restoreRoomChargePosting(inp));
    const a4 = await glLines([s.saleId]);
    chk("F4", "restore ⇒ 5 ใบ · 1100 กลับเป็น 40,000 · restore ซ้ำ ⇒ ไม่เพิ่ม · สมดุล", r3?.posted === true && entriesOf(a3) === 5 && drNet(a3, "1100") === 40_000 && r4?.changed === 0 && entriesOf(a4) === 5 && balanced(a4), `r3=${J(r3)} r4=${J(r4)} ${fmt(a4)}`);
  }

  // ═══════════ G. ประกันริบ + PENALTY ส่วนเกิน + มัดจำเกิน ในการเช็กเอาต์เดียว — invariant แขกจ่าย = ค่าใช้จ่าย + ประกันที่ริบ ═══════════
  console.log("\n── G. ประกันริบ + ค่าเสียหายส่วนเกิน + มัดจำเกิน ──");
  {
    await setUnit(UH, "rooms.hotel.securityDeposit.enabled", true);
    const DEP = 300_000, SEC = 100_000, PEN = 50_000;
    const g = await inhouse({}, { amountSatang: DEP });
    const sd = okRes(await call(() => co.takeSecurityDeposit(FRONT, ctx, { reservationId: g.id, amountSatang: SEC, payType: "CASH" })), "takeSecurityDeposit");
    okRes(await fo.postFolioItem(FRONT, ctx, { reservationId: g.id, type: "PENALTY", description: "ค่าเสียหายส่วนเกินประกัน", qty: 1, unitAmountSatang: PEN }), "penalty");
    const grand = night(W(0)) + PEN;
    const p = await prepare(FRONT, { reservationId: g.id });
    chk("G0", `prepare: grand = ค่าห้อง + PENALTY ${grand} · deposit ใช้ = grand · payable 0 · security HELD ${SEC}`, p?.ok === true && p.grandTotalSatang === grand && p.depositSatang === grand && p.payableSatang === 0 && p.security?.state === "HELD" && p.security.heldSatang === SEC, `${J({ grand: p?.grandTotalSatang, dep: p?.depositSatang, pay: p?.payableSatang, sec: p?.security })}`);
    const s = await settle(MGR, { reservationId: g.id, payMethods: [], securityDeposit: "FORFEIT", forfeitReason: "ทำกระจกแตก" });
    const hs = await saleByKey(`hotel-sale-${g.id}`);
    const rf = await refundsOf(g.rv.depositSaleId);
    const forfeit = (await prisma.posSale.findMany({ where: { tenantId: tid, idempotencyKey: { startsWith: "dep-forfeit:" }, sourceId: g.id } })) as Any[];
    const secDep = await depOf(sd.saleId);
    chk("G1", `settle FORFEIT ok · บิล ${grand} จ่าย DEPOSIT อย่างเดียว · ใบคืนมัดจำส่วนเกิน ${DEP - grand} · บิลริบ ${SEC} จ่าย DEPOSIT อ้างใบรับประกัน · ประกันไม่ OPEN`, s?.ok === true && hs?.grandTotalSatang === grand && (await payOf(hs.id)).every((x: Any) => x.type === "DEPOSIT") && rf.length === 1 && Math.abs(rf[0].grandTotalSatang) === DEP - grand && forfeit.length === 1 && forfeit[0].grandTotalSatang === SEC && (await payOf(forfeit[0].id)).every((x: Any) => x.type === "DEPOSIT" && x.refSaleId === sd.saleId) && secDep.status !== "OPEN" && secDep.usedSatang === SEC, `${J(s).slice(0, 140)} forfeit=${J(forfeit.map((x) => [x.idempotencyKey, x.grandTotalSatang]))} sec=${secDep?.status}/${secDep?.usedSatang}`);
    const items = await itemsOf(g.id);
    const penInfo = live(items).filter((i) => i.type === "PENALTY" && i.amountSatang === 0 && i.refId === forfeit[0]?.id);
    chk("G2", "folio: PENALTY ข้อมูล amount 0 อ้างบิลริบ · PENALTY 50,000 มีผล · SECURITY_DEPOSIT amount 0 · Σ ทุกแถว = 0 · SETTLED", penInfo.length === 1 && live(items).some((i) => i.type === "PENALTY" && i.amountSatang === PEN) && live(items).some((i) => i.type === "SECURITY_DEPOSIT" && i.amountSatang === 0) && sum(items.map((i) => i.amountSatang)) === 0 && (await folioOf(g.id)).status === "SETTLED", J(items.map((i) => [i.type, i.amountSatang])));
    await drain();
    const ls = await glLines([g.rv.depositSaleId, sd.saleId, hs.id, forfeit[0]?.id ?? "", ...rf.map((x: Any) => x.id)]);
    const cashIn = drNet(ls, "1000") + drNet(ls, "1010");
    chk("G3", `invariant เงินเข้าสุทธิ (1000+1010) = ค่าใช้จ่าย ${grand} + ประกันที่ริบ ${SEC} = ${grand + SEC}`, cashIn === grand + SEC, `เงินเข้า ${cashIn} (1000=${drNet(ls, "1000")} 1010=${drNet(ls, "1010")})`);
    chk("G4", `GL 5 ใบ สมดุล · 2110 สุทธิ 0 (มัดจำ+ประกันปิดหมด) · 2200 = VAT(grand)+VAT(100,000) (±2) · 4xxx = ฐาน(grand)+ฐาน(100,000) (±2) · 1100 = 0`, balanced(ls) && near(crNet(ls, "2110"), 0) && near(crNet(ls, "2200"), VAT(grand) + VAT(SEC), 2) && near(rev(ls), BASE(grand) + BASE(SEC), 2) && drNet(ls, "1100") === 0, fmt(ls));
    // ริบซ้ำ/คืนซ้ำหลังปิด — ห้ามมีใบที่ 2
    const again = await call(() => co.forfeitSecurityDeposit(MGR, ctx, { reservationId: g.id, reason: "ซ้ำ" }));
    const rfd = await call(() => co.refundSecurityDeposit(MGR, ctx, { reservationId: g.id }));
    chk("G5", "ริบซ้ำ ⇒ ok:false NO_SECURITY (ไม่มีบิลริบใบ 2) · คืนหลังริบ ⇒ ok:false · ไม่มีใบคืนของใบรับประกัน", again?.ok === false && again.code === "NO_SECURITY" && rfd?.ok === false && (await refundsOf(sd.saleId)).length === 0 && (await prisma.posSale.count({ where: { tenantId: tid, idempotencyKey: { startsWith: "dep-forfeit:" }, sourceId: g.id } })) === 1, `again=${again?.code} refund=${rfd?.code}`);
  }

  // ═══════════ H. EXCLUSIVE 7% + ค่าบริการ 10% + DISCOUNT + POS_CHARGE (ร้านรวม VAT แล้ว) — Σ บรรทัด = grand · VAT ครั้งเดียว · GL ═══════════
  console.log("\n── H. EXCLUSIVE + SC + DISCOUNT + POS_CHARGE ──");
  {
    await setUnit(UX, "rooms.hotel.tax.mode", "EXCLUSIVE");
    await setUnit(UX, "rooms.hotel.tax.serviceChargeBp", 1000);
    const r = okRes(await bk.createBooking(FRONT, ctx, { unitId: UX, rooms: [{ roomTypeId: XT, adults: 2, children: 0 }], ratePlanId: STDX, source: "PHONE", guest: GUEST, checkIn: W(0), checkOut: W(1) }), "book X");
    const id = r.reservations[0].id as string;
    const rv = await checkIn(id, UX);
    const room = await prisma.hotelRoom.findUnique({ where: { id: rv.roomId } });
    okRes(await fo.postFolioItem(FRONT, ctx, { reservationId: id, type: "DISCOUNT", description: "ส่วนลดพิเศษ", qty: 1, unitAmountSatang: -10_000 }), "discount X");
    const s = await posSale({ payMethods: [{ type: "ROOM_CHARGE", amountSatang: 64_000, reference: room.number }] });
    await drain();
    const base = XPRICE - 10_000;
    const tl = pricing.taxLines(base, { mode: "EXCLUSIVE", vatBp: 700, serviceChargeBp: 1000 }, "SATANG");
    const grand = tl.totalSatang + 64_000;
    const p = await prepare(FRONT, { reservationId: id });
    const lsum = p?.ok ? sum(p.lines.map((l: Any) => l.qty * l.unitPriceSatang - (l.discountSatang ?? 0))) - p.billDiscountSatang + p.serviceChargeSatang : -1;
    chk("H1", `prepare: grand = taxLines(90,000).total ${tl.totalSatang} + อาหาร 64,000 = ${grand} · Σ บรรทัด − ส่วนลด + SC = grand · ส่วนลดบิล = 10,000×1.07 · อาหารไม่ถูกบวก VAT ซ้ำ`, p?.ok === true && p.grandTotalSatang === grand && lsum === grand && p.billDiscountSatang === 10_700 && p.lines.find((l: Any) => l.kind === "POS_CHARGE")?.unitPriceSatang === 32_000, `grand=${p?.grandTotalSatang} Σ=${lsum} disc=${p?.billDiscountSatang} sc=${p?.serviceChargeSatang} lines=${J(p?.lines?.map((l: Any) => [l.kind, l.qty, l.unitPriceSatang]))}`);
    const st = await settle(FRONT, { reservationId: id, payMethods: [{ type: "CARD", amountSatang: p?.payableSatang ?? 0 }] });
    const hs = await saleByKey(`hotel-sale-${id}`);
    const folioVat = live(await itemsOf(id, "TAX")).reduce((a, i) => a + i.amountSatang, 0);
    chk("H2", `settle ok · POS grand = ${grand} · discount/serviceCharge บน PosSale ตรง · POS vatSatang = VAT(grand) และ ≈ TAX บน folio ${tl.lines.find((l: Any) => l.type === "TAX")?.amountSatang} + VAT(64,000) ${VAT(64_000)} (±1)`, st?.ok === true && hs?.grandTotalSatang === grand && hs.discountSatang === 10_700 && hs.serviceChargeSatang === p.serviceChargeSatang && hs.vatSatang === VAT(grand) && near(hs.vatSatang, folioVat + VAT(64_000)), `${J(st).slice(0, 80)} pos=${hs?.grandTotalSatang} vat=${hs?.vatSatang} folioTAX=${folioVat} disc=${hs?.discountSatang} sc=${hs?.serviceChargeSatang}`);
    await drain();
    const ls = await glLines([s.saleId, hs?.id ?? ""]);
    chk("H3", `GL: 4xxx สุทธิ = ฐาน(grand) ${BASE(grand)} ครั้งเดียว (±1) · 2200 = VAT(grand) (±1) · 1100 = 0 · 1010 บัตร = grand`, balanced(ls) && near(rev(ls), BASE(grand)) && near(crNet(ls, "2200"), VAT(grand)) && drNet(ls, "1100") === 0 && drNet(ls, "1010") === grand, fmt(ls));
  }

  // ═══════════ I. บิลร้านมีส่วนลดท้ายบิล (2×32,000 − 4,000 = 60,000 ลงห้อง) ⇒ POS_CHARGE บรรทัดเดียว 60,000 · settle · GL ═══════════
  console.log("\n── I. บิลร้านส่วนลดท้ายบิล ลงห้อง ──");
  {
    const g = await inhouse();
    const s = await posSale({ billDiscountSatang: 4_000, payMethods: [{ type: "ROOM_CHARGE", amountSatang: 60_000, reference: g.roomNo }] });
    await drain();
    const pc = live(await itemsOf(g.id, "POS_CHARGE"));
    chk("I1", "ลงห้องบรรทัดเดียว 60,000 (= เงินที่ลงห้องจริง ไม่ใช่ 64,000)", pc.length === 1 && pc[0].amountSatang === 60_000, J(pc.map((i) => [i.amountSatang, i.description])));
    const grand = night(W(0)) + 60_000;
    const st = await settle(FRONT, { reservationId: g.id, payMethods: [{ type: "PROMPTPAY", amountSatang: grand - g.rv.depositSatang }] });
    const hs = await saleByKey(`hotel-sale-${g.id}`);
    await drain();
    const ls = await glLines([s.saleId, hs?.id ?? "", g.rv.depositSaleId]);
    chk("I2", `settle ok grand ${grand} · GL: 1100 = 0 · 4xxx = ฐาน(grand) (±1) · 2200 = VAT(grand) (±1) · 2110 = 0`, st?.ok === true && hs?.grandTotalSatang === grand && drNet(ls, "1100") === 0 && near(rev(ls), BASE(grand)) && near(crNet(ls, "2200"), VAT(grand)) && near(crNet(ls, "2110"), 0), fmt(ls));
  }

  // ═══════════ Z. ทั้งสมุด ═══════════
  {
    await drain();
    const all = await glLines();
    const pend = await prisma.outboxEvent.count({ where: { tenantId: tid, status: { in: ["PENDING", "FAILED"] } } });
    chk("Z1", "Σdr = Σcr ทั้งสมุด · ไม่มี event ค้าง PENDING/FAILED ของร้าน", balanced(all) && pend === 0, `entries=${entriesOf(all)} pending=${pend}`);
    const PII = /ผู้เข้าพัก rv-b|0895556666|h5rv-b-guest/;
    const ob = await prisma.outboxEvent.findMany({ where: { tenantId: tid, type: { startsWith: "hotel." } } });
    const au = await prisma.auditLog.findMany({ where: { tenantId: tid, action: { startsWith: "hotel." } } });
    chk("Z2", "payload event hotel.* และ AuditLog hotel.* (รวมประกัน/คืนเงิน) ไม่มีชื่อ/เบอร์/อีเมลแขก", !PII.test(J(ob.map((e: Any) => e.payload))) && !PII.test(J(au.map((a: Any) => [a.before, a.after]))), `events ${ob.length} audits ${au.length}`);
  }
} catch (e) {
  console.log(`\n🔴 probe ล้ม: ${errMsg(e)}`);
  checks.push({ id: "X", ok: false, note: errMsg(e) });
} finally {
  try { await cleanup(); console.log("\n(ล้างร้าน h5rv-b-* แล้ว)"); } catch (e) { console.log(`⚠️ cleanup: ${errMsg(e)}`); }
  const failed = checks.filter((c) => !c.ok);
  console.log(`\nJSON_SUMMARY ${J({ total: checks.length, passed: checks.length - failed.length, failed: failed.map((c) => c.id) })}`);
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}
