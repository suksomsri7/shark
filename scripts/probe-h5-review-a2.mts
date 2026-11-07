// probe-h5-a2.mts — ผู้ตรวจรอบ 1 (เงิน) ใบ H.5 · ส่วนเพิ่ม: EXCLUSIVE + บิลร้าน ROOM_CHARGE (ราคารวม VAT แล้ว) · ร้านชั่วคราว h5rv-x-* (ลบใน finally)
// รัน: cd <ทรี> && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-h5-review-a2.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from "node:crypto";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
type Any = any;
const LABEL = "probe-h5-a2";
const SLUG = "h5rv-x-";
loadSvcQcEnv(LABEL);
if (process.env.CI || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: env ต้องห้าม`); process.exit(4); }
delete process.env.SVC_QC_CLOCK;
const R = new URL("../src/lib", import.meta.url).pathname; // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h5-review-probe): ย้าย probe ผู้ตรวจเงินเข้าทรีเป็น regression ถาวร (path ตามทรี)
const { prisma } = (await import(`${R}/core/db`)) as Any;
const bk = (await import(`${R}/modules/hotel/booking.ts`)) as Any;
const rates = (await import(`${R}/modules/hotel/rates.ts`)) as Any;
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
const okRes = (r: Any, what: string) => { if (!r || r.ok !== true) throw new Error(`${what}: ${J(r).slice(0, 300)}`); return r; };
const call = async (f: () => Promise<Any>): Promise<Any> => { try { return await f(); } catch (e) { return { ok: false, code: "THROW", reason: errMsg(e) }; } };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const VAT = (x: number) => vat.splitIncludedVat(x, 700).vatSatang as number;
const tenantIds: string[] = [];
async function cleanup() {
  if (!tenantIds.length) return;
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  let pending = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  for (let pass = 0; pass < 14 && pending.length; pass++) { const next: string[] = []; for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); } catch { next.push(t); } } pending = next; }
  if (pending.length) console.log(`  ⚠️ cleanup ลบไม่หมด: ${pending.join(",")}`);
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: SLUG } } });
}
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) { tenantIds.push(...stale.map((t: Any) => t.id)); await cleanup(); tenantIds.length = 0; }
  const t = await prisma.tenant.create({ data: { name: "QC H5 review-a2", slug: `${SLUG}${uid()}` } });
  tenantIds.push(t.id);
  const tid = t.id as string;
  const ctx = { tenantId: tid };
  const mkUnit = async (type: string, name: string) => (await prisma.businessUnit.create({ data: { tenantId: tid, type, name, slug: `u-${uid()}` } })).id as string;
  const UX = await mkUnit("HOTEL", "โรงแรม EXCLUSIVE rv-a2");
  const UR = await mkUnit("RESTAURANT", "ห้องอาหาร rv-a2");
  const POS_A = (await sys.createSystem(tid, "POS", "POS rv-a2")).id as string;
  for (const u of [UX, UR]) await sys.linkUnit(tid, POS_A, u);
  const ACC_A = (await sys.createSystem(tid, "ACCOUNT", "บัญชี rv-a2")).id as string;
  await acc.saveSettings(tid, ACC_A, { orgName: "rv-a2 จำกัด", taxId: "0105561177639", vatRegistered: true, vatRateBp: 700 });
  await gl.ensureAccounting({ tenantId: tid, systemId: ACC_A });
  await prisma.accountSystemLink.create({ data: { tenantId: tid, systemId: ACC_A, linkedKind: "POS", linkedId: POS_A } });
  const PRICE = 100_000;
  const XT = (await prisma.hotelRoomType.create({ data: { tenantId: tid, unitId: UX, name: "ดีลักซ์ X", rentMode: "NIGHTLY", baseRateSatang: PRICE, capacity: 3, baseOccupancy: 2, maxOccupancy: 3 } })).id as string;
  for (let i = 1; i <= 3; i++) await prisma.hotelRoom.create({ data: { tenantId: tid, unitId: UX, number: `X${i}`, roomTypeId: XT, hkStatus: "CLEAN" } });
  const mkMember = async (tag: string, role: string, unitAccess: string[], permissions: Record<string, unknown> = {}) => {
    const id = `${SLUG}${tag}-${uid()}`;
    await prisma.user.create({ data: { id, email: `${SLUG}${tag}-${uid()}@shark.local`, name: `QC rv-a2 ${tag}` } });
    await prisma.membership.create({ data: { userId: id, tenantId: tid, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id };
  };
  const OWNER = await mkMember("owner", "OWNER", ["*"]);
  okRes(await rates.listRatePlans(OWNER, ctx, { unitId: UX }), "list X");
  const STDX = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tid, unitId: UX, code: "STANDARD" } })).id as string;
  okRes(await rates.saveRates(OWNER, ctx, { unitId: UX, ratePlanId: STDX, rows: [{ roomTypeId: XT, seasonId: null, priceWeekdaySatang: PRICE, priceWeekendSatang: PRICE, priceHolidaySatang: null }] }), "saveRates X");
  const setUnit = async (unitId: string, key: string, value: unknown) => okRes(await settings.setSettings(OWNER, ctx, [{ key, scope: "UNIT", scopeId: unitId, value }]), `ตั้ง ${key}`);
  await setUnit(UX, "rooms.hotel.tax.mode", "EXCLUSIVE");
  const GUEST = { name: "ผู้เข้าพัก rv-a2", phone: "0893334444", email: "h5rv-x-guest@qc.invalid" };
  const rvOf = (id: string) => prisma.hotelReservation.findUnique({ where: { id } }) as Promise<Any>;
  const itemsOf = async (id: string, type?: string) => (await prisma.hotelFolioItem.findMany({ where: { folio: { reservationId: id }, ...(type ? { type } : {}) } })) as Any[];
  const live = (xs: Any[]) => xs.filter((i) => !i.voidedAt && i.type !== "VOID_REVERSAL");
  const saleByKey = (key: string) => prisma.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId: tid, idempotencyKey: key } } }) as Promise<Any>;
  const drain = async () => { for (let i = 0; i < 3; i++) await wiring.drainAll(); };
  const r = okRes(await bk.createBooking(OWNER, ctx, { unitId: UX, rooms: [{ roomTypeId: XT, adults: 2, children: 0 }], ratePlanId: STDX, source: "PHONE", guest: GUEST, checkIn: W(0), checkOut: W(1) }), "book");
  const id = r.reservations[0].id as string;
  const rv0 = await rvOf(id);
  const occ = await prisma.roomOccupancy.findFirst({ where: { refType: "HotelReservation", refId: id, active: true } });
  okRes(await svc.checkIn(tid, UX, id, rv0.roomId ?? occ.roomId), "checkIn");
  const rv = await rvOf(id);
  const room = await prisma.hotelRoom.findUnique({ where: { id: rv.roomId } });
  // บิลร้าน 640 (รวม VAT แล้ว — POS ถือราคารวม VAT เสมอ) จ่าย ROOM_CHARGE
  const s = await pos.createSale({ tenantId: tid, unitId: UR, systemId: POS_A, sourceModule: "POS", idempotencyKey: `h5rv-x-sale-${uid()}`, lines: [{ name: "ต้มยำกุ้ง", qty: 1, unitPriceSatang: 32_000 }, { name: "ข้าวผัดปู", qty: 1, unitPriceSatang: 32_000 }], payMethods: [{ type: "ROOM_CHARGE", amountSatang: 64_000, reference: room.number }] });
  await drain();
  const pc = live(await itemsOf(id, "POS_CHARGE"));
  chk("X1", "ลงห้อง 2 บรรทัด 320+320", pc.length === 2 && sum(pc.map((i) => i.amountSatang)) === 64_000, J(pc.map((i) => i.amountSatang)));
  const p = await call(() => co.prepareCheckout(OWNER, ctx, { reservationId: id }));
  const food = p?.ok ? p.lines.filter((l: Any) => l.kind === "POS_CHARGE") : [];
  const foodGross = sum(food.map((l: Any) => l.qty * l.unitPriceSatang - (l.discountSatang ?? 0)));
  chk("X2", "EXCLUSIVE: บรรทัดอาหารในบิลโรงแรม = 640 (บิลร้านรวม VAT แล้ว · ห้ามบวก VAT ซ้ำ)", p?.ok === true && foodGross === 64_000, `ได้ ${foodGross} (= ${J(food.map((l: Any) => [l.qty, l.unitPriceSatang]))}) · grand ${p?.grandTotalSatang} · TAX บน folio ${J(live(await itemsOf(id, "TAX")).map((i) => i.amountSatang))}`);
  const expGrand = Math.round(PRICE * 1.07) + 64_000;
  chk("X3", `grand = ค่าห้อง+VAT (${Math.round(PRICE * 1.07)}) + อาหาร 640 = ${expGrand}`, p?.ok === true && p.grandTotalSatang === expGrand, `ได้ ${p?.grandTotalSatang} (เกิน ${(p?.grandTotalSatang ?? 0) - expGrand})`);
  const st = await call(() => co.settleAndCheckOut(OWNER, ctx, { reservationId: id, shiftId: null, securityDeposit: "REFUND", payMethods: [{ type: "CASH", amountSatang: p?.payableSatang ?? 0 }] }));
  const hs = await saleByKey(`hotel-sale-${id}`);
  await drain();
  const es = (await prisma.accountJournalEntry.findMany({ where: { systemId: ACC_A, refType: "PosSale", refId: { in: [s.saleId, hs?.id ?? ""] } }, include: { lines: { include: { account: { select: { code: true } } } } } })) as Any[];
  const ls = es.flatMap((e) => e.lines.map((l: Any) => ({ code: l.account.code as string, debit: l.debit as number, credit: l.credit as number })));
  const rev = sum(ls.filter((l) => l.code.startsWith("4")).map((l) => l.credit - l.debit));
  const vatN = sum(ls.filter((l) => l.code === "2200").map((l) => l.credit - l.debit));
  chk("X4", `GL หลัง settle: รายได้สุทธิ = ฐาน(ค่าห้อง 1,070) + ฐาน(640) = ${expGrand - VAT(expGrand)} · 2200 = VAT(${expGrand})`, st?.ok === true && Math.abs(rev - (expGrand - VAT(expGrand))) <= 2 && Math.abs(vatN - VAT(expGrand)) <= 2, `settle=${st?.ok ? "ok" : st?.code} รายได้ ${rev} VAT ${vatN} · บิลโรงแรม ${hs?.grandTotalSatang} vat ${hs?.vatSatang}`);
} catch (e) {
  console.log(`\n🔴 probe ล้ม: ${errMsg(e)}`);
  checks.push({ id: "X", ok: false, note: errMsg(e) });
} finally {
  try { await cleanup(); console.log("\n(ล้างร้าน h5rv-x-* แล้ว)"); } catch (e) { console.log(`⚠️ cleanup: ${errMsg(e)}`); }
  const failed = checks.filter((c) => !c.ok);
  console.log(`\nJSON_SUMMARY ${J({ total: checks.length, passed: checks.length - failed.length, failed: failed.map((c) => c.id) })}`);
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}
