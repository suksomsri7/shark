// probe-h5-a.mts — ผู้ตรวจรอบ 1 (เงิน) ใบ H.5 · ร้านชั่วคราว h5rv-* (ลบใน finally) · อ่าน/เขียนเฉพาะร้านของตัวเอง · ไม่แก้ src
// รัน: cd <ทรี> && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-h5-review-a.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from "node:crypto";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
type Any = any;
const LABEL = "probe-h5-a";
const SLUG = "h5rv-";
loadSvcQcEnv(LABEL);
if (process.env.CI || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: env ต้องห้าม`); process.exit(4); }
delete process.env.SVC_QC_CLOCK;
const R = new URL("../src/lib", import.meta.url).pathname; // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h5-review-probe): ย้าย probe ผู้ตรวจเงินเข้าทรีเป็น regression ถาวร (path ตามทรี)
const { prisma } = (await import(`${R}/core/db`)) as Any;
const bk = (await import(`${R}/modules/hotel/booking.ts`)) as Any;
const rates = (await import(`${R}/modules/hotel/rates.ts`)) as Any;
const pricing = (await import(`${R}/modules/hotel/pricing.ts`)) as Any;
const svc = (await import(`${R}/modules/hotel/service.ts`)) as Any;
const fo = (await import(`${R}/modules/hotel/folio.ts`)) as Any;
const co = (await import(`${R}/modules/hotel/checkout.ts`)) as Any;
const sys = (await import(`${R}/modules/system/service`)) as Any;
const acc = (await import(`${R}/modules/account/service`)) as Any;
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

  // ───── ร้านชั่วคราว: โรงแรม UH + ร้านอาหาร UR + โรงแรม UX (EXCLUSIVE) · POS เดียว · บัญชี VAT 7% ─────
  const t = await prisma.tenant.create({ data: { name: "QC H5 review-a", slug: `${SLUG}${uid()}` } });
  tenantIds.push(t.id);
  const tid = t.id as string;
  const ctx = { tenantId: tid };
  const mkUnit = async (type: string, name: string) => { // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h4-legacy-checkin-probe): H.4 ทำให้ checkIn เดิมต้องมีผู้พักเมื่อ rooms.hotel.guest.requireRegistration เปิด — probe เงินใช้ checkIn เดิม ⇒ ปิดที่หน่วยโรงแรมชั่วคราวทุกหน่วย
    const id = (await prisma.businessUnit.create({ data: { tenantId: tid, type, name, slug: `u-${uid()}` } })).id as string;
    if (type === "HOTEL") await prisma.settingValue.create({ data: { tenantId: tid, key: "rooms.hotel.guest.requireRegistration", scope: "UNIT", scopeId: id, value: false } }).catch(() => null);
    return id;
  };
  const UH = await mkUnit("HOTEL", "โรงแรม rv-a");
  const UR = await mkUnit("RESTAURANT", "ห้องอาหาร rv-a");
  const UX = await mkUnit("HOTEL", "โรงแรม EXCLUSIVE rv-a");
  const POS_A = (await sys.createSystem(tid, "POS", "POS rv-a")).id as string;
  for (const u of [UH, UR, UX]) await sys.linkUnit(tid, POS_A, u);
  const ACC_A = (await sys.createSystem(tid, "ACCOUNT", "บัญชี rv-a")).id as string;
  await acc.saveSettings(tid, ACC_A, { orgName: "rv-a จำกัด", taxId: "0105561177639", vatRegistered: true, vatRateBp: 700 });
  await gl.ensureAccounting({ tenantId: tid, systemId: ACC_A });
  await prisma.accountSystemLink.create({ data: { tenantId: tid, systemId: ACC_A, linkedKind: "POS", linkedId: POS_A } });
  const PRICE = 129_000;
  const mkType = async (unitId: string, name: string, base: number) => (await prisma.hotelRoomType.create({ data: { tenantId: tid, unitId, name, rentMode: "NIGHTLY", baseRateSatang: base, capacity: 3, baseOccupancy: 2, maxOccupancy: 3 } })).id as string;
  const DLX = await mkType(UH, "ดีลักซ์", PRICE);
  for (let i = 1; i <= 8; i++) await prisma.hotelRoom.create({ data: { tenantId: tid, unitId: UH, number: `D${String(i).padStart(2, "0")}`, roomTypeId: DLX, hkStatus: "CLEAN" } });
  const XPRICE = 123_457; // 1,234.57 (เศษสตางค์ · EXCLUSIVE)
  const XT = await mkType(UX, "ดีลักซ์ X", XPRICE);
  for (let i = 1; i <= 4; i++) await prisma.hotelRoom.create({ data: { tenantId: tid, unitId: UX, number: `X${i}`, roomTypeId: XT, hkStatus: "CLEAN" } });
  const mkMember = async (tag: string, role: string, unitAccess: string[], permissions: Record<string, unknown> = {}) => {
    const id = `${SLUG}${tag}-${uid()}`;
    await prisma.user.create({ data: { id, email: `${SLUG}${tag}-${uid()}@shark.local`, name: `QC rv-a ${tag}` } });
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
  const GUEST = { name: "ผู้เข้าพัก rv-a", phone: "0891112222", email: "h5rv-guest@qc.invalid" };
  const setUnit = async (unitId: string, key: string, value: unknown) => okRes(await settings.setSettings(OWNER, ctx, [{ key, scope: "UNIT", scopeId: unitId, value }]), `ตั้ง ${key}`);
  const book = (over: Record<string, unknown>, unitId = UH) => bk.createBooking(FRONT, ctx, { unitId, rooms: [{ roomTypeId: DLX, adults: 2, children: 0 }], ratePlanId: STD, source: "PHONE", guest: GUEST, checkIn: W(0), checkOut: W(1), ...over });
  const takeDep = (id: string, unitId = UH) => bk.takeBookingDeposit(FRONT, ctx, { unitId, reservationId: id, payType: "PROMPTPAY" });
  const rvOf = (id: string) => prisma.hotelReservation.findUnique({ where: { id } }) as Promise<Any>;
  const folioOf = (id: string) => prisma.hotelFolio.findUnique({ where: { reservationId: id } }) as Promise<Any>;
  const itemsOf = async (id: string, type?: string) => (await prisma.hotelFolioItem.findMany({ where: { folio: { reservationId: id }, ...(type ? { type } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })) as Any[];
  const live = (xs: Any[]) => xs.filter((i) => !i.voidedAt && i.type !== "VOID_REVERSAL");
  const nightsOf = (id: string) => prisma.hotelBookingNight.findMany({ where: { reservationId: id }, orderBy: { date: "asc" } }) as Promise<Any[]>;
  const occOf = (id: string) => prisma.roomOccupancy.findMany({ where: { refType: "HotelReservation", refId: id, active: true } }) as Promise<Any[]>;
  const saleByKey = (key: string) => prisma.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId: tid, idempotencyKey: key } } }) as Promise<Any>;
  const payOf = (saleId: string) => prisma.posPayment.findMany({ where: { saleId } }) as Promise<Any[]>;
  const depOf = (receipt: string) => prisma.posDeposit.findUnique({ where: { receiptSaleId: receipt } }) as Promise<Any>;
  const refundsOf = (receipt: string) => prisma.posSale.findMany({ where: { tenantId: tid, docType: "REFUND", refSaleId: receipt } }) as Promise<Any[]>;
  const checkIn = async (id: string, unitId = UH) => { const rv = await rvOf(id); const occ = (await occOf(id))[0]; okRes(await svc.checkIn(tid, unitId, id, rv.roomId ?? occ.roomId), "checkIn"); return rvOf(id); };
  const inhouse = async (over: Record<string, unknown> = {}, deposit = true, unitId = UH) => {
    const r = okRes(await book(over, unitId), "book");
    const id = r.reservations[0].id as string;
    if (deposit) okRes(await takeDep(id, unitId), "takeDeposit");
    const rv = await checkIn(id, unitId);
    const room = await prisma.hotelRoom.findUnique({ where: { id: rv.roomId } });
    return { id, rv, roomNo: room.number as string, groupId: r.groupId as string | null, reservations: r.reservations as Any[] };
  };
  const settle = (actor: Any, over: Record<string, unknown>) => call(() => co.settleAndCheckOut(actor, ctx, { shiftId: null, securityDeposit: "REFUND", ...over }));
  const prepare = (actor: Any, over: Record<string, unknown>) => call(() => co.prepareCheckout(actor, ctx, over));
  const posSale = (over: Record<string, unknown>) => pos.createSale({ tenantId: tid, unitId: UR, systemId: POS_A, sourceModule: "POS", idempotencyKey: `h5rv-sale-${uid()}`, lines: [{ name: "ต้มยำกุ้ง", qty: 1, unitPriceSatang: 32_000 }, { name: "ข้าวผัดปู", qty: 1, unitPriceSatang: 32_000 }], payMethods: [{ type: "CASH", amountSatang: 64_000 }], ...over });
  const drain = async () => { for (let i = 0; i < 3; i++) await wiring.drainAll(); };
  type Line = { code: string; debit: number; credit: number; refId: string; entryId: string; reversalOfId: string | null; status: string };
  const glLines = async (refIds: string[]): Promise<Line[]> => {
    const es = (await prisma.accountJournalEntry.findMany({ where: { systemId: ACC_A, refType: "PosSale", refId: { in: refIds } }, include: { lines: { include: { account: { select: { code: true } } } } } })) as Any[];
    return es.flatMap((e) => e.lines.map((l: Any) => ({ code: l.account.code, debit: l.debit, credit: l.credit, refId: e.refId, entryId: e.id, reversalOfId: e.reversalOfId ?? null, status: e.status })));
  };
  const net = (ls: Line[], pred: (c: string) => boolean) => sum(ls.filter((l) => pred(l.code)).map((l) => l.credit - l.debit)); // Cr − Dr
  const drNet = (ls: Line[], code: string) => -net(ls, (c) => c === code);
  const balanced = (ls: Line[]) => ls.length > 0 && sum(ls.map((l) => l.debit)) === sum(ls.map((l) => l.credit));
  const fmt = (ls: Line[]) => { const m: Record<string, { dr: number; cr: number }> = {}; for (const l of ls) { const c = (m[l.code] ??= { dr: 0, cr: 0 }); c.dr += l.debit; c.cr += l.credit; } return Object.entries(m).map(([c, v]) => `${c}:dr${v.dr}/cr${v.cr}`).join(" "); };

  // ═══════════ A. บิลร้านจ่ายผสม (CASH 24,000 + ROOM_CHARGE 40,000) → ลงห้อง → settle → GL ═══════════
  console.log("\n── A. บิลร้านอาหารจ่ายผสม เงินสด + ลงห้อง แล้วเช็กเอาต์ ──");
  {
    const g = await inhouse();
    let s: Any = null;
    try { s = await posSale({ payMethods: [{ type: "CASH", amountSatang: 24_000 }, { type: "ROOM_CHARGE", amountSatang: 40_000, reference: g.roomNo }] }); } catch (e) { info("A0", "POS ไม่รับจ่ายผสม CASH+ROOM_CHARGE", errMsg(e)); }
    if (s) {
      await drain();
      const pc = live(await itemsOf(g.id, "POS_CHARGE"));
      chk("A1", "ลงห้องเฉพาะส่วน ROOM_CHARGE 40,000 (บรรทัดเดียว)", pc.length === 1 && pc[0].amountSatang === 40_000, J(pc.map((i) => [i.amountSatang, i.description])));
      const grand = night(W(0)) + 40_000;
      const dep = g.rv.depositSatang as number;
      const payable = grand - dep;
      const r = okRes(await settle(FRONT, { reservationId: g.id, payMethods: [{ type: "CASH", amountSatang: payable }] }), "settle A");
      const hs = await saleByKey(`hotel-sale-${g.id}`);
      chk("A2", "บิลโรงแรม grand = ค่าห้อง + 40,000 · PAID", hs?.status === "PAID" && hs.grandTotalSatang === grand, `${hs?.grandTotalSatang} warnings=${J(r.warnings)}`);
      await drain();
      const ls = await glLines([g.rv.depositSaleId, s.saleId, hs.id]);
      const rest = ls.filter((l) => l.refId === s.saleId);
      const cash = drNet(ls, "1000"), bank = drNet(ls, "1010"), ar = drNet(ls, "1100"), rev = net(ls, (c) => c.startsWith("4"));
      const expCash = payable + 24_000, expRev = BASE(grand) + BASE(24_000);
      chk("A3", "GL สมดุล · 1100 ลูกหนี้สุทธิ 0", balanced(ls) && ar === 0, `${fmt(ls)}`);
      chk("A4", `เงินสด 1000 สุทธิ = เงินรับจริง (${expCash} = payable ${payable} + เงินสดที่ร้าน 24,000)`, cash === expCash, `ได้ ${cash} · ธนาคาร ${bank} (มัดจำ ${dep})`);
      chk("A5", `รายได้ 4xxx สุทธิ = ฐาน(บิลโรงแรม) + ฐาน(ส่วนเงินสดที่ร้าน 24,000) ≈ ${expRev}`, Math.abs(rev - expRev) <= 2, `ได้ ${rev} (ต่าง ${rev - expRev}) · JV บิลร้าน: ${fmt(rest)} สถานะ ${J([...new Set(rest.map((l) => l.status))])}`);
      info("A6", "JV บิลร้านถูกกลับทั้งใบ (รวมขาเงินสด 24,000)?", `reversal entries=${new Set(rest.filter((l) => l.reversalOfId).map((l) => l.entryId)).size} · เงินสดของบิลร้านสุทธิ=${drNet(rest, "1000")}`);
    }
  }

  // ═══════════ B. settle ล้มที่ POS (SHIFT_REQUIRED) → folio ยัง OPEN → ย่นวันออก → เช็กเอาต์ ═══════════
  console.log("\n── B. settle ล้มกลางทาง (POS ปฏิเสธ) แล้วย่นวันออก ──");
  {
    const g = await inhouse({ checkOut: W(3) });
    const dep = g.rv.depositSatang as number;
    const n0 = await nightsOf(g.id);
    const occ0 = (await occOf(g.id)).length;
    const grand3 = sum(n0.filter((n) => n.counted).map((n) => n.priceSatang));
    const f1 = await settle(FRONT, { reservationId: g.id, payMethods: [{ type: "CASH", amountSatang: grand3 - dep }], shiftId: "h5rv-no-such-shift" });
    const f = await folioOf(g.id);
    const rv1 = await rvOf(g.id);
    const n1 = await nightsOf(g.id);
    chk("B1", "POS ปฏิเสธ (SHIFT_REQUIRED) ⇒ ok:false รหัสไทย · folio OPEN · CHECKED_IN · ไม่มีบิล · occupancy/คืน counted ไม่เปลี่ยน", f1?.ok === false && f1.code !== "THROW" && f.status === "OPEN" && rv1.status === "CHECKED_IN" && !(await saleByKey(`hotel-sale-${g.id}`)) && (await occOf(g.id)).length === occ0 && n1.filter((n) => n.counted).length === 3, `code=${f1?.code} reason=${String(f1?.reason).slice(0, 80)}`);
    const roomItems = live(await itemsOf(g.id, "ROOM"));
    info("B2", "หลัง settle ล้ม: ROOM items ที่ tx A โพสต์ค้างไว้", `${roomItems.length} แถว (คืน folioItemId ≠ null = ${n1.filter((n) => n.folioItemId).length})`);
    const sh = await call(() => bk.shortenBooking(MGR, ctx, { unitId: UH, reservationId: g.id, newCheckOut: W(1) }));
    const n2 = await nightsOf(g.id);
    chk("B3", "ย่นวันออกเป็น +1 สำเร็จ · คืน counted = 1", sh?.ok === true && n2.filter((n) => n.counted).length === 1, `${J(sh).slice(0, 120)}`);
    const p = await prepare(FRONT, { reservationId: g.id });
    const exp1 = night(W(0));
    chk("B4", `prepareCheckout หลังย่น: grand = ค่าห้อง 1 คืน (${exp1}) — ไม่ใช่ 3 คืน (${grand3})`, p?.ok === true && p.grandTotalSatang === exp1, `ได้ ${p?.grandTotalSatang} · ROOM items ที่ยังมีผล ${live(await itemsOf(g.id, "ROOM")).length}`);
    const r2 = await settle(FRONT, { reservationId: g.id, payMethods: [{ type: "CASH", amountSatang: (p?.payableSatang ?? 0) }] });
    const hs = await saleByKey(`hotel-sale-${g.id}`);
    chk("B5", "เช็กเอาต์หลังย่น: แขกถูกเก็บเงิน = 1 คืน", r2?.ok === true && hs?.grandTotalSatang === exp1, `บิล ${hs?.grandTotalSatang} (3 คืน = ${grand3})`);
  }

  // ═══════════ C. มัดจำกลุ่ม: หัวกลุ่ม settle รายห้อง แล้วห้องที่ 2 settle รายห้อง ═══════════
  console.log("\n── C. มัดจำกลุ่ม · settle รายห้องทั้งสองห้อง ──");
  {
    const r = okRes(await book({ rooms: [1, 2].map(() => ({ roomTypeId: DLX, adults: 2, children: 0 })) }), "book group");
    const gid = r.groupId as string;
    const [h, r2] = r.reservations.map((x: Any) => x.id as string);
    okRes(await takeDep(h), "deposit head");
    const hrv = await rvOf(h);
    const dep = hrv.depositSatang as number;
    const n1 = night(W(0));
    chk("C0", "มัดจำหัวกลุ่ม = 2 × คืนแรก", dep === 2 * n1, `${dep}`);
    await checkIn(h); await checkIn(r2);
    const s1 = await settle(FRONT, { reservationId: h, payMethods: [] });
    chk("C1", "settle หัวกลุ่มรายห้อง payMethods [] ⇒ ok (มัดจำพอ)", s1?.ok === true, J(s1).slice(0, 160));
    const d1 = await depOf(hrv.depositSaleId);
    chk("C2", "หลังหัวกลุ่มออก: มัดจำคงเหลือ = 1 คืน ยัง OPEN (ห้อง 2 ยังพัก) · ยังไม่คืน", d1.status === "OPEN" && d1.amountSatang - d1.usedSatang - d1.refundedSatang === n1 && (await refundsOf(hrv.depositSaleId)).length === 0, `${d1.status} used=${d1.usedSatang} refunded=${d1.refundedSatang}`);
    const p2 = await prepare(FRONT, { reservationId: r2 });
    chk("C3", "prepareCheckout ห้อง 2 (รายห้อง): depositSatang = มัดจำคงเหลือของกลุ่ม (1 คืน) · payable 0", p2?.ok === true && p2.depositSatang === n1 && p2.payableSatang === 0, `deposit=${p2?.depositSatang} payable=${p2?.payableSatang}`);
    const s2 = await settle(FRONT, { reservationId: r2, payMethods: p2?.payableSatang > 0 ? [{ type: "CASH", amountSatang: p2.payableSatang }] : [] });
    const d2 = await depOf(hrv.depositSaleId);
    const left = d2.amountSatang - d2.usedSatang - d2.refundedSatang;
    const rf = await refundsOf(hrv.depositSaleId);
    chk("C4", "หลังทั้งกลุ่มออกหมด: มัดจำไม่ค้าง (ใช้หรือคืนครบ · PosDeposit ไม่ OPEN)", s2?.ok === true && left === 0 && d2.status !== "OPEN", `settle2=${s2?.ok} (${s2?.code ?? ""}) · คงเหลือ ${left} · ${d2.status} · ใบคืน ${rf.length} · แขกจ่ายเงินสดห้อง 2 = ${p2?.payableSatang}`);
    const hs2 = await saleByKey(`hotel-sale-${r2}`);
    info("C5", "บิลห้อง 2 วิธีจ่าย", J((await payOf(hs2?.id ?? "")).map((p) => [p.type, p.amountSatang])));
    void gid;
  }

  // ═══════════ D. มัดจำกลุ่ม: หัวกลุ่มออกรายห้อง แล้วปิดที่เหลือด้วย groupId ═══════════
  console.log("\n── D. หัวกลุ่มออกก่อน · ห้องที่เหลือ settle({groupId}) ──");
  {
    const r = okRes(await book({ rooms: [1, 2].map(() => ({ roomTypeId: DLX, adults: 2, children: 0 })) }), "book group D");
    const gid = r.groupId as string;
    const [h, r2] = r.reservations.map((x: Any) => x.id as string);
    okRes(await takeDep(h), "deposit head D");
    const hrv = await rvOf(h);
    const n1 = night(W(0));
    await checkIn(h); await checkIn(r2);
    okRes(await settle(FRONT, { reservationId: h, payMethods: [] }), "settle head D");
    const headFolioBefore = await folioOf(h);
    const sg = await settle(FRONT, { groupId: gid, payMethods: [] });
    const gs = await saleByKey(`hotel-sale-${gid}`);
    const d = await depOf(hrv.depositSaleId);
    chk("D1", "settle({groupId}) หลังหัวออก: ok · บิลกลุ่ม = ค่าห้อง 2 จ่ายด้วยมัดจำคงเหลือ · มัดจำปิด", sg?.ok === true && gs?.grandTotalSatang === n1 && d.status !== "OPEN" && d.usedSatang === 2 * n1, `${J(sg).slice(0, 120)} · used=${d?.usedSatang} ${d?.status}`);
    const headItemsAfter = await itemsOf(h);
    const newOnSettled = headItemsAfter.filter((i) => i.createdAt > headFolioBefore.settledAt);
    chk("D2", "folio หัวกลุ่มที่ SETTLED แล้ว ไม่ถูกเขียนเพิ่ม (บิลโรงแรมที่ปิดแล้วห้ามแตะ)", newOnSettled.length === 0, `แถวใหม่บน folio SETTLED: ${J(newOnSettled.map((i) => [i.type, i.amountSatang, i.refId === gs?.id ? "ref=บิลกลุ่ม" : i.refId]))} · balance หัว ${(await folioOf(h)).balanceSatang}`);
    chk("D3", "ห้อง 2 CHECKED_OUT · folio SETTLED · balance 0", (await rvOf(r2)).status === "CHECKED_OUT" && (await folioOf(r2)).status === "SETTLED" && (await folioOf(r2)).balanceSatang === 0, "");
  }

  // ═══════════ E. ชนกัน: settle หัวกลุ่มรายห้อง พร้อมกับ settle ทั้งกลุ่ม ═══════════
  console.log("\n── E. settle หัวรายห้อง ∥ settle กลุ่ม (พร้อมกัน) ──");
  {
    const r = okRes(await book({ rooms: [1, 2].map(() => ({ roomTypeId: DLX, adults: 2, children: 0 })) }), "book group E");
    const gid = r.groupId as string;
    const [h, r2] = r.reservations.map((x: Any) => x.id as string);
    okRes(await takeDep(h), "deposit head E");
    const hrv = await rvOf(h);
    await checkIn(h); await checkIn(r2);
    const [a, b] = await Promise.all([settle(FRONT, { reservationId: h, payMethods: [] }), settle(FRONT, { groupId: gid, payMethods: [] })]);
    const sales = (await prisma.posSale.findMany({ where: { tenantId: tid, sourceModule: "HOTEL", OR: [{ idempotencyKey: { startsWith: `hotel-sale-${h}` } }, { idempotencyKey: { startsWith: `hotel-sale-${gid}` } }] } })) as Any[];
    const paid = sales.filter((s) => s.status === "PAID");
    const settledSaleIds = new Set((await prisma.hotelFolio.findMany({ where: { reservationId: { in: [h, r2] } } })).map((f: Any) => f.settledSaleId));
    const orphan = paid.filter((s) => !settledSaleIds.has(s.id));
    const d = await depOf(hrv.depositSaleId);
    chk("E1", "ไม่มี throw ดิบ · ok ≥ 1", a?.code !== "THROW" && b?.code !== "THROW" && (a?.ok || b?.ok), `head=${a?.ok ? "ok" : a?.code} group=${b?.ok ? "ok" : b?.code}`);
    chk("E2", "ไม่มีบิล PAID ค้างที่ไม่มี folio อ้าง (orphan) · มัดจำใช้ไม่เกินยอด", orphan.length === 0 && d.usedSatang <= hrv.depositSatang, `บิล PAID ${paid.length} orphan ${orphan.length} (${J(orphan.map((s) => [s.idempotencyKey, s.grandTotalSatang]))}) · มัดจำ used=${d.usedSatang}/${hrv.depositSatang} ${d.status}`);
    info("E3", "สถานะห้อง", `${(await rvOf(h)).status}/${(await rvOf(r2)).status} · folio ${(await folioOf(h)).status}/${(await folioOf(r2)).status}`);
  }

  // ═══════════ F. EXCLUSIVE + ค่าบริการ 10% + ราคาเศษสตางค์ · ปัดเศษ ═══════════
  console.log("\n── F. EXCLUSIVE · SC 10% · เศษสตางค์ ──");
  {
    await setUnit(UX, "rooms.hotel.tax.mode", "EXCLUSIVE");
    await setUnit(UX, "rooms.hotel.tax.serviceChargeBp", 1000);
    const bookX = (over: Record<string, unknown>) => bk.createBooking(FRONT, ctx, { unitId: UX, rooms: [{ roomTypeId: XT, adults: 2, children: 0 }], ratePlanId: STDX, source: "PHONE", guest: GUEST, checkIn: W(0), checkOut: W(3), ...over });
    const r = okRes(await bookX({}), "book X");
    const id = r.reservations[0].id as string;
    await checkIn(id, UX);
    okRes(await fo.postFolioItem(FRONT, ctx, { reservationId: id, type: "MINIBAR", description: "น้ำ 3 ขวด", qty: 3, unitAmountSatang: 3_333 }), "minibar");
    okRes(await fo.postFolioItem(FRONT, ctx, { reservationId: id, type: "SERVICE", description: "ซักรีด", qty: 1, unitAmountSatang: 10_001 }), "service");
    const sub = 3 * XPRICE + 9_999 + 10_001;
    const tl = pricing.taxLines(sub, { mode: "EXCLUSIVE", vatBp: 700, serviceChargeBp: 1000 }, "SATANG");
    const p = await prepare(FRONT, { reservationId: id });
    const lsum = p?.ok ? sum(p.lines.map((l: Any) => l.qty * l.unitPriceSatang - (l.discountSatang ?? 0))) - p.billDiscountSatang + p.serviceChargeSatang : -1;
    chk("F1", `prepare: grand = taxLines.total (${tl.totalSatang}) · Σบรรทัด − ส่วนลด + SC = grand`, p?.ok === true && p.grandTotalSatang === tl.totalSatang && lsum === p.grandTotalSatang, `grand=${p?.grandTotalSatang} Σ=${lsum} sc=${p?.serviceChargeSatang} lines=${J(p?.lines?.map((l: Any) => [l.qty, l.unitPriceSatang]))}`);
    const s = await settle(FRONT, { reservationId: id, payMethods: [{ type: "CASH", amountSatang: p?.payableSatang ?? 0 }] });
    const hs = await saleByKey(`hotel-sale-${id}`);
    chk("F2", "settle ok · POS grand = folio total · POS vatSatang = VAT ในยอด (splitIncludedVat)", s?.ok === true && hs?.grandTotalSatang === tl.totalSatang && hs?.vatSatang === VAT(tl.totalSatang), `pos grand=${hs?.grandTotalSatang} vat=${hs?.vatSatang} · folio TAX=${J(live(await itemsOf(id, "TAX")).map((i) => i.amountSatang))} SC=${J(live(await itemsOf(id, "SERVICE_CHARGE")).map((i) => i.amountSatang))}`);
    await drain();
    const ls = await glLines([hs.id]);
    chk("F3", "GL บิล EXCLUSIVE สมดุล · รายได้ = ฐาน(grand) · 2200 = VAT(grand)", balanced(ls) && net(ls, (c) => c.startsWith("4")) === BASE(tl.totalSatang) && net(ls, (c) => c === "2200") === VAT(tl.totalSatang), fmt(ls));
    // F4: ไม่มี SC · ปัดเป็นบาท · มีแต่บรรทัด qty > 1 ⇒ ส่วนต่างปัดเศษไม่มีที่ลง?
    await setUnit(UX, "rooms.hotel.tax.serviceChargeBp", 0);
    await setUnit(UX, "rooms.money.rounding", "BAHT_HALF_UP");
    const r4 = okRes(await bookX({}), "book X4");
    const id4 = r4.reservations[0].id as string;
    await checkIn(id4, UX);
    okRes(await fo.postFolioItem(FRONT, ctx, { reservationId: id4, type: "MINIBAR", description: "น้ำ 3 ขวด", qty: 3, unitAmountSatang: 3_333 }), "minibar4");
    const p4 = await prepare(FRONT, { reservationId: id4 });
    info("F4", "EXCLUSIVE · ปัดบาท · บรรทัด qty>1 ล้วน (ห้อง 3 คืน @1,234.57 + มินิบาร์ 3×33.33)", p4?.ok ? `ok grand=${p4.grandTotalSatang} lines=${J(p4.lines.map((l: Any) => [l.qty, l.unitPriceSatang]))} disc=${p4.billDiscountSatang}` : `${p4?.code}: ${String(p4?.reason).slice(0, 100)}`);
    if (p4?.ok) {
      const s4 = await settle(FRONT, { reservationId: id4, payMethods: [{ type: "CASH", amountSatang: p4.payableSatang }] });
      const hs4 = await saleByKey(`hotel-sale-${id4}`);
      chk("F5", "ปัดบาท: settle ok · ยอด POS = folio", s4?.ok === true && hs4?.grandTotalSatang === p4.grandTotalSatang, `${J(s4).slice(0, 100)} pos=${hs4?.grandTotalSatang}`);
    } else chk("F5", "ปัดบาท + บรรทัด qty>1 ล้วน: เช็กเอาต์ได้", false, `${p4?.code} — เช็กเอาต์ถูกบล็อกเพราะส่วนต่างปัดเศษไม่มีบรรทัด qty 1 ให้ลง`);
  }

  // ═══════════ G. void บิลร้านที่ลงห้องแล้ว (ก่อน settle) → settle ⇒ ไม่กลับรายการซ้ำ ═══════════
  console.log("\n── G. void บิลร้านก่อน settle ──");
  {
    const g = await inhouse();
    const s = await posSale({ payMethods: [{ type: "ROOM_CHARGE", amountSatang: 64_000, reference: g.roomNo }] });
    await drain();
    await pos.voidSale(tid, UR, s.saleId);
    await drain();
    const pc = await itemsOf(g.id, "POS_CHARGE");
    const rev = (await itemsOf(g.id, "VOID_REVERSAL")).filter((i) => i.refId === s.saleId);
    chk("G1", "void บิลร้าน ⇒ POS_CHARGE ทุกแถว void + VOID_REVERSAL คู่ · balance = Σ", pc.length === 2 && pc.every((i) => i.voidedAt) && rev.length === 2 && (await folioOf(g.id)).balanceSatang === sum((await itemsOf(g.id)).map((i) => i.amountSatang)), `void=${pc.filter((i) => i.voidedAt).length}/${pc.length} rev=${rev.length}`);
    const grand = night(W(0));
    const r = okRes(await settle(FRONT, { reservationId: g.id, payMethods: [{ type: "CASH", amountSatang: grand - g.rv.depositSatang }] }), "settle G");
    const hs = await saleByKey(`hotel-sale-${g.id}`);
    await drain();
    const ls = await glLines([s.saleId]);
    const entries = [...new Set(ls.map((l) => l.entryId))].length;
    chk("G2", "บิลโรงแรมไม่รวมอาหารที่ void · JV บิลร้าน: ขาย + กลับ (void) เท่านั้น ไม่มีกลับซ้ำจาก settle · 1100 สุทธิ 0 · 4xxx สุทธิ 0", hs?.grandTotalSatang === grand && entries === 2 && drNet(ls, "1100") === 0 && net(ls, (c) => c.startsWith("4")) === 0, `entries=${entries} ${fmt(ls)} warnings=${J(r.warnings)}`);
  }

  // ═══════════ J. settle พร้อมกัน 2 คน วิธีจ่ายต่างกัน (CASH vs CARD) ═══════════
  console.log("\n── J. settle ซ้อน 2 คน วิธีจ่ายต่างกัน ──");
  {
    const g = await inhouse();
    const payable = night(W(0)) - g.rv.depositSatang;
    const [a, b] = await Promise.all([settle(FRONT, { reservationId: g.id, payMethods: [{ type: "CASH", amountSatang: payable }] }), settle(FRONT, { reservationId: g.id, payMethods: [{ type: "CARD", amountSatang: payable }] })]);
    const bills = (await prisma.posSale.findMany({ where: { tenantId: tid, idempotencyKey: { startsWith: `hotel-sale-${g.id}` } } })) as Any[];
    const pay = live(await itemsOf(g.id, "PAYMENT"));
    chk("J1", "ไม่มี throw ดิบ · บิล PAID 1 ใบ · PAYMENT 1 แถว · folio SETTLED · อีกคนได้ ok:false รหัสสถานะ", a?.code !== "THROW" && b?.code !== "THROW" && (a?.ok ? 1 : 0) + (b?.ok ? 1 : 0) === 1 && bills.filter((s) => s.status === "PAID").length === 1 && pay.length === 1 && (await folioOf(g.id)).status === "SETTLED", `a=${a?.ok ? "ok" : a?.code} b=${b?.ok ? "ok" : b?.code} bills=${bills.length} วิธีจ่ายของบิล=${J((await payOf(bills[0]?.id ?? "")).map((p) => p.type))}`);
  }

  // ═══════════ K. ข้อมูลอ่อนไหวใน outbox/audit ของเส้นเงิน ═══════════
  {
    const PII = /ผู้เข้าพัก rv-a|0891112222|h5rv-guest/;
    const ob = await prisma.outboxEvent.findMany({ where: { tenantId: tid, type: { startsWith: "hotel." } } });
    const au = await prisma.auditLog.findMany({ where: { tenantId: tid, action: { startsWith: "hotel.folio" } } });
    chk("K1", "payload event hotel.* และ AuditLog hotel.folio* ไม่มีชื่อ/เบอร์/อีเมลแขก", !PII.test(J(ob.map((e: Any) => e.payload))) && !PII.test(J(au.map((a: Any) => [a.before, a.after]))), `events ${ob.length} audits ${au.length}`);
  }
} catch (e) {
  console.log(`\n🔴 probe ล้ม: ${errMsg(e)}`);
  checks.push({ id: "X", ok: false, note: errMsg(e) });
} finally {
  try { await cleanup(); console.log("\n(ล้างร้าน h5rv-* แล้ว)"); } catch (e) { console.log(`⚠️ cleanup: ${errMsg(e)}`); }
  const failed = checks.filter((c) => !c.ok);
  console.log(`\nJSON_SUMMARY ${J({ total: checks.length, passed: checks.length - failed.length, failed: failed.map((c) => c.id) })}`);
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}
