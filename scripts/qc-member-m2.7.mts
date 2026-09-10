// QC — ระบบสมาชิก v2 WO M2.7: wallet facade — getWallet (DTO รวมทุกสิทธิ์) · quoteApply (ลำดับตายตัว ระดับ → voucher → คูปอง → แต้ม → gift card · กันซ้อน · เพดาน · pointsToEarn/stampsToAdd preview · conflicts ไทย) · applyOnSale ใน tx ของ POS (redeem ทุกชนิด atomic) · releaseOnVoid · แท็บ "กระเป๋าสิทธิ์" ใน 360 (ภาพ 02) · unit scope
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M2.7 · พิมพ์เขียว §5.8 §9.1 §11.4 (แต้ม) §11.5 (ลำดับ/กันซ้อน/void) · MEMBER-API §2.9 (wallet.get/quote) · ภาพ 02 (แท็บกระเป๋า) · 06 (ลำดับสิทธิ์ที่ POS — M2.8 ใช้ต่อ)
// requires: member-seed
//
// สัญญา (src/lib/modules/member/wallet.ts · facade member/index.ts export getWallet quoteApply applyOnSale releaseOnVoid · MEMBER_LIMITS.vouchersPerSale = 1 (Edit limits.ts))
//   ctx = MemberCtx { tenantId, systemId (MEMBER), actorUserId } · actor = MemberActor · ระบบ POINT/COUPON/POS ของสาขา resolve ผ่าน system.systemForUnit(cart.unitId ?? homeUnitId) · เส้น member→point/stamp/voucher/giftcard/reward/coupon/system ผ่าน facade เท่านั้น
//   Cart = { unitId, lines: [{ name, qty, unitPriceSatang, discountSatang?, itemId?, serviceId?, categoryId? }], couponCode? } · subtotal = Σ qty×price − discount
//   Choices = { voucherIds?: string[], points?: number, giftCard?: { number, pin?, satang }, couponCode?: string }
//   getWallet(ctx, actor, customerId, { cart? }) → { points: { balance, expiringSoon: [{ points, expiresAt }] }, vouchers: [{ id, code, name, kind, value, expiresAt, status, applicable?: boolean, discountSatang?: number, reason?: string }], coupons: [], giftCards: [{ id, numberMasked, balanceSatang, expiresAt, status }], rewardsPending: [{ redemptionId, rewardName, qrCode, expiresAt }], stamps: [{ cardId, name, stamps, slots, cycle }], tierBenefits: TierBenefitsView, paidPlan: null }
//     ห้ามมี pinHash/pin/เบอร์เต็มของคนอื่นใน DTO · ใช้ Promise.all ยิงขนาน (≤ ~1.5 วิ บน QC) · customerId ไม่อยู่ระบบ/ต่างร้าน → throw ไทย · CUSTOMER ดูได้เฉพาะตัวเอง · STAFF ต้องครอบ homeUnit (404-not-403)
//   quoteApply(ctx, actor, customerId, cart, choices) → { order: ["TIER","VOUCHER","COUPON","POINTS","GIFTCARD"], lines: [{ kind, ref, label, discountSatang, note? }], subtotalSatang, totalDiscountSatang, netSatang, pointsToEarn, stampsToAdd: [{ cardId, name, count }], conflicts: [{ kind, ref?, message }] } — อ่านอย่างเดียว ไม่เขียนอะไร ไม่ตรวจ PIN gift card (แค่ยอด/สถานะ)
//     ขั้นละยอด "คงเหลือหลังขั้นก่อน": TIER = benefitsFor.discountPct/discountFixedSatang ของยอด subtotal (cap discountMaxSatang ถ้า > 0) ใช้อัตโนมัติ · VOUCHER = voucher.validate ต่อใบบนยอดคงเหลือ (ใช้ได้ MEMBER_LIMITS.vouchersPerSale ใบ · ใบเกิน/ใช้ไม่ได้ → conflicts ไม่หยุดทั้ง quote) · COUPON = coupon.validate (memberId · amountSatang = คงเหลือ · unitId) · ถ้ามี voucher ที่ใช้อยู่และ voucher.config.stackWithCoupon ≠ true → conflict COUPON ไม่ใช้ · POINTS = points × settings.burnRateSatang · points < burnMinPoints → conflict ไม่ใช้ · > balance → conflict ไม่ใช้ · เกิน burnMaxPct% ของยอดคงเหลือ → ตัดลงเหลือแต้มที่พอดี (line มี note ไทย + conflict kind POINTS) · GIFTCARD = min(satang, balance, คงเหลือ) (satang > balance → conflict + ใช้เท่า balance) · บัตรไม่ ACTIVE/หมดอายุ → conflict ไม่ใช้
//     pointsToEarn = point.computeEarn(customer, { lines, netSatang: net, paidBy: { voucherSatang, pointsSatang, giftCardSatang } }).points (กติกา settings exclude*) · stampsToAdd = stamp.previewForCart(customerId, cart) (การ์ด PER_SALE_MIN/PER_ITEM/PER_DAY ที่เข้าเกณฑ์ · ไม่เขียน)
//   applyOnSale(ctx, { saleId, customerId, unitId, choices }, tx) → { tierDiscountSatang, voucherUseIds[], pointsBurned, pointsLedgerId|null, giftCardTxnId|null, giftCardSatang, lines[], totalDiscountSatang } — ทำใน tx ที่ POS ส่งมา: voucher.redeem(tx) ทุกใบ · point.burnFifo(tx) refType "PosSale" refId saleId idempotencyKey `pos-burn-${saleId}` · giftcard.use(tx) (ตรวจ PIN จริง) · ผิดพลาดข้อใด → throw (tx ทั้งก้อน rollback · ไม่เขียนบางส่วน) · คูปองไม่ทำที่นี่ (POS ทำเองอยู่แล้ว)
//   releaseOnVoid(ctx, { saleId }) → { vouchersReleased, pointsReversed, giftCardRefunded } — voucher.release ทุกใบที่ usedRef.saleId · point.reverseWithLots refType PosSale refId saleId · giftcard.refundUse txn ที่ refId saleId · idempotent
//   UI: แท็บ "กระเป๋าสิทธิ์" ใน Member360.tsx (?tab=wallet) แทน ComingSoon — การ์ด แต้ม (คงเหลือ + ใกล้หมดอายุ) · voucher (ชื่อ · มูลค่า · หมดอายุ · สถานะ) · คูปองที่เก็บไว้ · gift card (เลขปิดบัง · คงเหลือ · หมดอายุ) · รางวัลรอรับ (ชื่อ · QR/รหัส · หมดอายุรับ) · สแตมป์ (การ์ด · n/slots วงกลม) · สิทธิ์ระดับ (รายการจาก benefitsFor) · ว่าง = ข้อความไทย
//   testid: member-wallet member-wallet-points member-wallet-vouchers member-wallet-coupons member-wallet-giftcards member-wallet-rewards member-wallet-stamps member-wallet-benefits
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("src/lib/modules/member/wallet.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/member/wallet.ts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const mq = (await import("./member-qc-env.mts" as string)) as { MQC: Any; resolveMemberScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null> };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const thai = (e: Error | null) => !!e && /[ก-๙]/.test(e.message);
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const P = prisma as Any;
let tid = ""; let SYS = ""; let PT = ""; let CP = ""; let RW = "";
const tag = Date.now().toString(36);
const before = { vouchers: new Set<string>(), templates: new Set<string>(), cards: new Set<string>(), gcards: new Set<string>() };
const made = { customers: [] as string[], coupons: [] as string[], rewards: [] as string[], redemptions: [] as string[], ledgerKeys: [] as string[], sales: [] as string[], benefitIds: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId; PT = scope.systems.POINT as string; CP = scope.systems.COUPON as string; RW = scope.systems.REWARD as string;
  for (const v of await P.voucher.findMany({ where: { tenantId: tid }, select: { id: true } })) before.vouchers.add(v.id);
  for (const t of await P.voucherTemplate.findMany({ where: { tenantId: tid }, select: { id: true } })) before.templates.add(t.id);
  for (const c of await P.stampCard.findMany({ where: { tenantId: tid }, select: { id: true } })) before.cards.add(c.id);
  for (const g of await P.giftCard.findMany({ where: { tenantId: tid }, select: { id: true } })) before.gcards.add(g.id);
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const M = (await import("@/lib/modules/member" as string)) as Record<string, (...a: Any[]) => Any>;
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const T = (await import("@/lib/modules/member/tiers" as string)) as Record<string, (...a: Any[]) => Any>;
  const PS = (await import("@/lib/modules/point" as string)) as Record<string, (...a: Any[]) => Any>;
  const V = (await import("@/lib/modules/voucher" as string)) as Record<string, (...a: Any[]) => Any>;
  const G = (await import("@/lib/modules/giftcard" as string)) as Record<string, (...a: Any[]) => Any>;
  const ST = (await import("@/lib/modules/stamp" as string)) as Record<string, (...a: Any[]) => Any>;
  const RV = (await import("@/lib/modules/reward" as string)) as Record<string, (...a: Any[]) => Any>;
  const coupon = (await import("@/lib/modules/coupon/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const { MEMBER_LIMITS } = (await import("@/lib/modules/member/limits" as string)) as Any;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId);
  const thana = await actorOf(E.users.staff.thana.userId);
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const pctx = { tenantId: tid, systemId: PT, memberSystemId: SYS, actorUserId: E.users.owner.userId as string };
  const gctx = { tenantId: tid, systemId: SYS, posSystemId: scope.systems.POS as string, actorUserId: E.users.owner.userId as string };
  const rctx = { tenantId: tid, systemId: RW, memberSystemId: SYS, pointSystemId: PT, actorUserId: E.users.owner.userId as string };
  const key = (s: string) => `qc27-${tag}-${s}`;
  const bal = (cid: string) => PS.getBalance(PT, cid);
  const vrow = (id: string) => P.voucher.findUnique({ where: { id } });
  const gold = await P.memberTierDef.findFirst({ where: { systemId: SYS, key: "gold" } });
  // ── เตรียม: ระดับ gold ส่วนลด 10% · settings แต้ม · ลูกค้าทดสอบ 2 คน (ป่าตอง gold · กะตะ) ──
  const benOld = await P.memberTierBenefit.findMany({ where: { tierDefId: gold.id, type: "DISCOUNT_PCT" } });
  restore.push(async () => { await P.memberTierBenefit.deleteMany({ where: { tierDefId: gold.id, type: "DISCOUNT_PCT" } }); for (const b of benOld) await P.memberTierBenefit.create({ data: b }).catch(() => null); });
  await P.memberTierBenefit.deleteMany({ where: { tierDefId: gold.id, type: "DISCOUNT_PCT" } });
  await P.memberTierBenefit.create({ data: { tenantId: tid, tierDefId: gold.id, type: "DISCOUNT_PCT", config: { pct: 10, maxSatang: 0 }, active: true } });
  const set0 = await PS.getPointSettings(tid);
  restore.push(() => PS.setPointSettings({ tenantId: tid }, set0));
  await PS.setPointSettings({ tenantId: tid }, { ...set0, burnRateSatang: 10, burnMinPoints: 100, burnMaxPct: 50, excludeGiftCard: true, excludeVoucher: true, earnBase: "NET" });
  const gs0 = await G.getSettings(gctx);
  restore.push(() => G.setSettings(gctx, owner, gs0));
  await G.setSettings(gctx, owner, { enabled: true, accountingLink: false, reloadable: true, transferable: true });
  const mkCust = async (nm: string, unit: string) => { const c = await PR.createMember(ctx as Any, owner, { phone: `0897${String((Date.now() + Math.floor(Math.random() * 1000)) % 1_000_000).padStart(6, "0")}`, firstName: nm, lastName: "กระเป๋า", source: "WALK_IN", homeUnitId: unit }); made.customers.push(c.customerId); return c.customerId as string; };
  const X = await mkCust("ทอง", E.units.patong);
  const K = await mkCust("กะตะ", E.units.kata);
  await T.applyTierChange(ctx as Any, X, gold.id, "MANUAL", { qc: tag }, { byUserId: owner.userId });
  const give = async (cid: string, pts: number, k: string) => { made.ledgerKeys.push(key(k)); return PS.earnWithLot(pctx, { customerId: cid, points: pts, refType: "QC", refId: key(k), idempotencyKey: key(k) }); };
  await give(X, 1000, "p1");
  const T300 = await V.createTemplate(ctx, owner, { name: `ส่วนลด ฿300 ${tag}`, kind: "FIXED", value: 30_000, config: { minSatang: 100_000, stackWithCoupon: false, unitIds: [] }, validDays: 30, origin: "MANUAL" });
  const T200 = await V.createTemplate(ctx, owner, { name: `ต้อนรับ ฿200 ${tag}`, kind: "FIXED", value: 20_000, config: { stackWithCoupon: true, unitIds: [] }, validDays: 30, origin: "TIER" });
  const Tpat = await V.createTemplate(ctx, owner, { name: `เฉพาะป่าตอง ${tag}`, kind: "FIXED", value: 10_000, config: { unitIds: [E.units.patong] }, validDays: 30, origin: "MANUAL" });
  const v1 = (await V.issue(ctx, owner, { customerIds: [X], templateId: T300.id, origin: "MANUAL" })).vouchers[0];
  const v2 = (await V.issue(ctx, owner, { customerIds: [X], templateId: T200.id, origin: "MANUAL" })).vouchers[0];
  const vPat = (await V.issue(ctx, owner, { customerIds: [X], templateId: Tpat.id, origin: "MANUAL" })).vouchers[0];
  const vExp = (await V.issue(ctx, owner, { customerIds: [X], templateId: T200.id, origin: "COMPENSATION" })).vouchers[0];
  await P.voucher.update({ where: { id: vExp.id }, data: { expiresAt: new Date(Date.now() - 3600_000) } });
  const vOther = (await V.issue(ctx, owner, { customerIds: [K], templateId: T200.id, origin: "MANUAL" })).vouchers[0];
  const cpn = await coupon.createCoupon({ tenantId: tid, systemId: CP, code: `WL${tag}`.toUpperCase(), name: "คูปอง 5%", type: "PERCENT", percent: 5, maxDiscountSatang: 20_000 });
  if (cpn?.ok) made.coupons.push(cpn.couponId);
  const gc = await G.sell(gctx, owner, { satang: 100_000, payMethods: [{ type: "CASH", amountSatang: 100_000 }], unitId: E.units.patong, buyerCustomerId: X, recipient: { customerId: X }, idempotencyKey: key("gc1") });
  if (gc?.saleId) made.sales.push(gc.saleId);
  const card = await ST.createCard(ctx, owner, { name: `ดำน้ำครบ 5 ${tag}`, slots: 5, ruleKind: "PER_SALE_MIN", ruleConfig: { minSatang: 100_000, perDayMax: 1, allowAutoFromSale: true }, rewardKind: "POINTS", rewardConfig: { points: 10 }, autoRestart: true, tierDefIds: [], unitIds: [] });
  await ST.addStamp(ctx, owner, { cardId: card.id, customerId: X, count: 2, refType: "MANUAL", idempotencyKey: key("st") }).catch(async () => { await P.stampCardProgress.create({ data: { tenantId: tid, cardId: card.id, customerId: X, cycle: 1, stamps: 2, startedAt: new Date() } }); });
  const rw = await RV.createRewardV2(rctx, owner, { name: `หมวก ${tag}`, kind: "ITEM", pointsCost: 50, stock: 5, tierDefIds: [], unitIds: [], pickupDays: 14, showToCustomer: true });
  made.rewards.push(rw.id);
  const rd = await RV.redeemV2(rctx, owner, { rewardId: rw.id, customerId: X, idempotencyKey: key("rd") });
  made.redemptions.push(rd.redemptionId);
  await give(X, 50, "p2"); // คืนให้ครบ 1,000 หลังแลกหมวก 50
  const CAT = "cat-course";
  const cart = { unitId: E.units.patong, lines: [{ name: "คอร์ส Fun Dive 2 ไดฟ์", qty: 1, unitPriceSatang: 350_000, categoryId: CAT, serviceId: "svc-fun" }, { name: "เช่าอุปกรณ์ครบชุด", qty: 1, unitPriceSatang: 60_000, categoryId: "cat-rent" }, { name: "เสื้อยืด", qty: 1, unitPriceSatang: 45_000, itemId: "item-shirt" }] };
  const earnExpect = async (net: number, paidBy: Any) => (await PS.computeEarn(pctx, { customerId: X, sale: { lines: cart.lines.map((l) => ({ itemId: l.itemId, categoryId: l.categoryId, qty: l.qty, netSatang: l.qty * l.unitPriceSatang })), netSatang: net, paidBy } })).points as number;
  const lineOf = (qres: Any, kind: string) => qres?.lines?.find((l: Any) => l.kind === kind);
  const conf = (qres: Any, kind: string) => qres?.conflicts?.find((c: Any) => c.kind === kind);

  // ═══ S1 getWallet ═══
  const t0 = Date.now();
  const w = await M.getWallet(ctx, owner, X, {});
  const ms = Date.now() - t0;
  chk("M2.7-S1.1", "getWallet(X): points {balance 1000, expiringSoon[]} · vouchers 4 ใบของ X (ไม่มีของ K) · coupons [] · giftCards 1 (numberMasked GC-**** · balance 100000 · ACTIVE) · rewardsPending 1 (หมวก · qrCode · expiresAt) · stamps 1 (2/5 cycle 1) · tierBenefits.discountPct 10 · paidPlan null",
    w?.points?.balance === 1000 && Array.isArray(w.points.expiringSoon) && Array.isArray(w.vouchers) && w.vouchers.length === 4 && !w.vouchers.some((v: Any) => v.id === vOther.id) && Array.isArray(w.coupons) && w.giftCards?.length === 1 && /^GC-\*{4}\d{4}$/.test(w.giftCards[0].numberMasked ?? "") && w.giftCards[0].balanceSatang === 100_000 && w.giftCards[0].status === "ACTIVE" && w.rewardsPending?.length === 1 && /หมวก/.test(w.rewardsPending[0].rewardName) && !!w.rewardsPending[0].qrCode && !!w.rewardsPending[0].expiresAt && w.stamps?.length === 1 && w.stamps[0].stamps === 2 && w.stamps[0].slots === 5 && w.tierBenefits?.discountPct === 10 && w.paidPlan === null,
    "DTO ครบ", `w=${JSON.stringify({ pts: w?.points?.balance, v: w?.vouchers?.length, gc: w?.giftCards?.[0], rp: w?.rewardsPending?.length, st: w?.stamps?.[0], tb: w?.tierBenefits?.discountPct, plan: w?.paidPlan })}`);

  const wc = await M.getWallet(ctx, owner, X, { cart });
  const wv1 = wc?.vouchers?.find((v: Any) => v.id === v1.id); const wvExp = wc?.vouchers?.find((v: Any) => v.id === vExp.id);
  const json = JSON.stringify(wc ?? {});
  chk("M2.7-S1.2", "getWallet + cart: voucher ฿300 applicable true discountSatang 30000 · ใบหมดอายุ applicable false reason ไทย · vouchers ใช้ได้เรียงก่อน · DTO ไม่มี pinHash/pin/phone เต็ม",
    wv1?.applicable === true && wv1.discountSatang === 30_000 && wvExp?.applicable === false && /[ก-๙]/.test(wvExp.reason ?? "") && wc.vouchers[0].applicable === true && !/pinHash|"pin"/.test(json) && !/08\d{8}/.test(json),
    "applicable ถูก", `v1=${JSON.stringify(wv1)} exp=${JSON.stringify(wvExp)} first=${wc?.vouchers?.[0]?.applicable} leak=${/pinHash|"pin"/.test(json)}/${/08\d{8}/.test(json)}`);

  const walletSrc = read("src/lib/modules/member/wallet.ts");
  chk("M2.7-S1.3", "perf: getWallet ≤ 1500ms บน QC (ยิงขนาน Promise.all) · wallet.ts import โมดูลอื่นผ่าน facade เท่านั้น (point/stamp/voucher/giftcard/reward/coupon) · ไม่มี any",
    ms <= 1500 && /Promise\.all/.test(walletSrc) && !/@\/lib\/modules\/(point|stamp|voucher|giftcard|reward|coupon|pos|system)\/(?!index)[a-z-]+"/.test(walletSrc) && !/:\s*any\b/.test(walletSrc), "≤1500ms · facade", `ms=${ms} all=${/Promise\.all/.test(walletSrc)} deep=${/@\/lib\/modules\/(point|stamp|voucher|giftcard|reward|coupon|pos|system)\/(?!index)[a-z-]+"/.test(walletSrc)} any=${/:\s*any\b/.test(walletSrc)}`, "MAJOR");

  const eGhost = await fails(() => M.getWallet(ctx, owner, "no-such", {}));
  const custX = { role: "CUSTOMER", customerId: X, userId: null, unitAccess: [], permissions: {} };
  const custK = { role: "CUSTOMER", customerId: K, userId: null, unitAccess: [], permissions: {} };
  const wSelf = await M.getWallet(ctx, custX, X, {});
  const eCustOther = await fails(() => M.getWallet(ctx, custK, X, {}));
  const eThanaKata = await fails(() => M.getWallet(ctx, thana, K, {}));
  const wThana = await M.getWallet(ctx, thana, X, {});
  chk("M2.7-S1.4", "scope: customerId ไม่มี → throw ไทย · CUSTOMER ดูของตัวเองได้ · ดูของคนอื่น → throw · thana (ป่าตอง) ดูสมาชิกกะตะ → throw ไม่พบ · ดูสมาชิกป่าตอง → ได้",
    thai(eGhost) && wSelf?.points?.balance === 1000 && !!eCustOther && thai(eThanaKata) && wThana?.points?.balance === 1000, "ตามขอบเขต", `ghost=${thai(eGhost)} self=${wSelf?.points?.balance} other=${!!eCustOther} kata=${eThanaKata?.message?.slice(0, 40)} thana=${wThana?.points?.balance}`);

  // ═══ S2 quoteApply ═══
  const q0 = await M.quoteApply(ctx, owner, X, cart, {});
  const e0 = await earnExpect(409_500, {});
  chk("M2.7-S2.1", "quote ไม่มี choices: ระดับ gold 10% ของ 455,000 = 45,500 (line TIER อัตโนมัติ) · net 409,500 · order 5 ขั้นตายตัว · pointsToEarn = computeEarn บนยอดสุทธิ · conflicts [] · ไม่เขียน",
    lineOf(q0, "TIER")?.discountSatang === 45_500 && q0.subtotalSatang === 455_000 && q0.netSatang === 409_500 && q0.totalDiscountSatang === 45_500 && JSON.stringify(q0.order) === JSON.stringify(["TIER", "VOUCHER", "COUPON", "POINTS", "GIFTCARD"]) && q0.pointsToEarn === e0 && q0.conflicts?.length === 0 && (await bal(X)) === 1000,
    "TIER 45500 · net 409500", `q=${JSON.stringify({ tier: lineOf(q0, "TIER"), sub: q0?.subtotalSatang, net: q0?.netSatang, order: q0?.order, pte: q0?.pointsToEarn, exp: e0, conf: q0?.conflicts })}`);

  const q1 = await M.quoteApply(ctx, owner, X, cart, { voucherIds: [v1.id] });
  chk("M2.7-S2.2", "voucher ฿300: หลังระดับ 409,500 → VOUCHER 30,000 (ref v1) → net 379,500 · totalDiscount 75,500 · ลำดับ line TIER ก่อน VOUCHER",
    lineOf(q1, "VOUCHER")?.discountSatang === 30_000 && lineOf(q1, "VOUCHER").ref === v1.id && q1.netSatang === 379_500 && q1.totalDiscountSatang === 75_500 && q1.lines.findIndex((l: Any) => l.kind === "TIER") < q1.lines.findIndex((l: Any) => l.kind === "VOUCHER"),
    "net 379500", `q=${JSON.stringify({ lines: q1?.lines, net: q1?.netSatang })}`);

  const q2 = await M.quoteApply(ctx, owner, X, cart, { voucherIds: [v1.id, v2.id] });
  chk("M2.7-S2.3", "voucher 2 ใบ (เพดาน MEMBER_LIMITS.vouchersPerSale 1): ใช้ใบแรก · ใบที่ 2 → conflict kind VOUCHER ref v2 message ไทย · net เท่า 1 ใบ",
    MEMBER_LIMITS.vouchersPerSale === 1 && q2.lines.filter((l: Any) => l.kind === "VOUCHER").length === 1 && conf(q2, "VOUCHER")?.ref === v2.id && /[ก-๙]/.test(conf(q2, "VOUCHER")?.message ?? "") && q2.netSatang === 379_500,
    "1 ใบ + conflict", `q=${JSON.stringify({ v: q2?.lines?.filter((l: Any) => l.kind === "VOUCHER").length, conf: q2?.conflicts, net: q2?.netSatang })}`);

  const q3 = await M.quoteApply(ctx, owner, X, cart, { voucherIds: [v1.id], couponCode: `WL${tag}`.toUpperCase() });
  const q3b = await M.quoteApply(ctx, owner, X, cart, { couponCode: `WL${tag}`.toUpperCase() });
  const q3c = await M.quoteApply(ctx, owner, X, cart, { voucherIds: [v2.id], couponCode: `WL${tag}`.toUpperCase() });
  chk("M2.7-S2.4", "คูปอง 5% (cap ฿200): มี voucher ฿300 (stackWithCoupon false) → conflict COUPON ไม่ใช้ · ไม่มี voucher → COUPON 20,000 (5% ของ 409,500 = 20,475 → cap) net 389,500 · voucher ฿200 (stackWithCoupon true) + คูปอง → ใช้ทั้งคู่ (5% ของ 389,500 = 19,475)",
    !lineOf(q3, "COUPON") && !!conf(q3, "COUPON") && /[ก-๙]/.test(conf(q3, "COUPON")?.message ?? "") && lineOf(q3b, "COUPON")?.discountSatang === 20_000 && q3b.netSatang === 389_500 && lineOf(q3c, "VOUCHER")?.discountSatang === 20_000 && lineOf(q3c, "COUPON")?.discountSatang === 19_475,
    "กันซ้อนตาม stackWithCoupon", `q3=${JSON.stringify({ c: lineOf(q3, "COUPON"), conf: q3?.conflicts })} q3b=${JSON.stringify({ c: lineOf(q3b, "COUPON"), net: q3b?.netSatang })} q3c=${JSON.stringify({ v: lineOf(q3c, "VOUCHER"), c: lineOf(q3c, "COUPON") })}`);

  const q4 = await M.quoteApply(ctx, owner, X, cart, { points: 1000 });
  const q4b = await M.quoteApply(ctx, owner, X, cart, { points: 50 });
  const q4c = await M.quoteApply(ctx, owner, X, cart, { points: 5000 });
  chk("M2.7-S2.5", "แต้ม: 1,000 แต้ม × 10 สตางค์ = 10,000 (line POINTS) net 399,500 · 50 แต้ม < burnMinPoints 100 → conflict ไม่ใช้ · 5,000 > balance 1,000 → conflict ไม่ใช้",
    lineOf(q4, "POINTS")?.discountSatang === 10_000 && q4.netSatang === 399_500 && !lineOf(q4b, "POINTS") && !!conf(q4b, "POINTS") && !lineOf(q4c, "POINTS") && !!conf(q4c, "POINTS") && /[ก-๙]/.test(conf(q4c, "POINTS")?.message ?? ""),
    "10000 · conflict ×2", `q4=${JSON.stringify(lineOf(q4, "POINTS"))} q4b=${JSON.stringify(q4b?.conflicts)} q4c=${JSON.stringify(q4c?.conflicts)}`);

  const small = { unitId: E.units.patong, lines: [{ name: "เติมอากาศ", qty: 1, unitPriceSatang: 20_000 }] };
  const q5 = await M.quoteApply(ctx, owner, X, small, { points: 1000 });
  chk("M2.7-S2.6", "burnMaxPct 50: บิล 20,000 → ระดับ −2,000 → เหลือ 18,000 → แต้ม 1,000 (10,000) เกิน 50% (9,000) → ตัดเหลือ 900 แต้ม = 9,000 · line POINTS 9000 note ไทย · conflict POINTS แจ้ง · net 9,000",
    lineOf(q5, "POINTS")?.discountSatang === 9_000 && /[ก-๙]/.test(lineOf(q5, "POINTS")?.note ?? "") && !!conf(q5, "POINTS") && q5.netSatang === 9_000,
    "clamp 900 แต้ม", `q5=${JSON.stringify({ p: lineOf(q5, "POINTS"), conf: q5?.conflicts, net: q5?.netSatang })}`);

  const q6 = await M.quoteApply(ctx, owner, X, cart, { giftCard: { number: gc.number, satang: 100_000 } });
  const q6b = await M.quoteApply(ctx, owner, X, cart, { giftCard: { number: gc.number, satang: 150_000 } });
  const q6c = await M.quoteApply(ctx, owner, X, small, { giftCard: { number: gc.number, satang: 100_000 } });
  const q6d = await M.quoteApply(ctx, owner, X, cart, { giftCard: { number: "GC-00000000", satang: 1_000 } });
  chk("M2.7-S2.7", "gift card ฿1,000: ใช้ 100,000 → line GIFTCARD 100000 net 309,500 · ขอ 150,000 > balance → ใช้ 100,000 + conflict GIFTCARD · บิลเล็ก (เหลือ 18,000) → ใช้แค่ 18,000 net 0 · เลขไม่มี → conflict ไม่ใช้ · quote ไม่แตะยอดบัตร (ยัง 100000)",
    lineOf(q6, "GIFTCARD")?.discountSatang === 100_000 && q6.netSatang === 309_500 && lineOf(q6b, "GIFTCARD")?.discountSatang === 100_000 && !!conf(q6b, "GIFTCARD") && lineOf(q6c, "GIFTCARD")?.discountSatang === 18_000 && q6c.netSatang === 0 && !lineOf(q6d, "GIFTCARD") && !!conf(q6d, "GIFTCARD") && (await G.balance(gctx, { number: gc.number }))?.balanceSatang === 100_000,
    "clamp + conflict", `q6=${JSON.stringify(lineOf(q6, "GIFTCARD"))} q6b=${JSON.stringify({ g: lineOf(q6b, "GIFTCARD"), conf: q6b?.conflicts })} q6c=${JSON.stringify({ g: lineOf(q6c, "GIFTCARD"), net: q6c?.netSatang })} q6d=${JSON.stringify(q6d?.conflicts)} bal=${(await G.balance(gctx, { number: gc.number }))?.balanceSatang}`);

  const qAll = await M.quoteApply(ctx, owner, X, cart, { voucherIds: [v1.id], points: 1000, giftCard: { number: gc.number, satang: 100_000 } });
  const eAll = await earnExpect(269_500, { voucherSatang: 30_000, pointsSatang: 10_000, giftCardSatang: 100_000 });
  chk("M2.7-S2.8", "ครบทุกขั้น: 455,000 − ระดับ 45,500 − voucher 30,000 − แต้ม 10,000 − gift 100,000 = net 269,500 · totalDiscount 185,500 · lines เรียง TIER VOUCHER POINTS GIFTCARD · pointsToEarn = computeEarn(net, paidBy{voucher 30000, points 10000, giftCard 100000}) (ไม่ให้แต้มกับส่วนที่จ่ายด้วย voucher/แต้ม/gift ตาม settings)",
    qAll.netSatang === 269_500 && qAll.totalDiscountSatang === 185_500 && JSON.stringify(qAll.lines.map((l: Any) => l.kind)) === JSON.stringify(["TIER", "VOUCHER", "POINTS", "GIFTCARD"]) && qAll.pointsToEarn === eAll && qAll.conflicts.length === 0,
    "net 269500", `q=${JSON.stringify({ net: qAll?.netSatang, td: qAll?.totalDiscountSatang, kinds: qAll?.lines?.map((l: Any) => l.kind), pte: qAll?.pointsToEarn, exp: eAll, conf: qAll?.conflicts })}`);

  const q7 = await M.quoteApply(ctx, owner, X, cart, { voucherIds: [vExp.id] });
  const q7b = await M.quoteApply(ctx, owner, X, small, { voucherIds: [v1.id] });
  const q7c = await M.quoteApply(ctx, owner, X, cart, { voucherIds: [vOther.id] });
  chk("M2.7-S2.9", "voucher ใช้ไม่ได้ → conflict มี message ไทยจาก voucher.validate: หมดอายุ · ยอดต่ำกว่าขั้นต่ำ ฿1,000 (บิลเล็ก) · ใบของคนอื่น (K) → conflict/ไม่พบ · ทั้ง 3 ไม่ throw ไม่มี line VOUCHER",
    !lineOf(q7, "VOUCHER") && /หมดอายุ/.test(conf(q7, "VOUCHER")?.message ?? "") && !lineOf(q7b, "VOUCHER") && /[ก-๙]/.test(conf(q7b, "VOUCHER")?.message ?? "") && !lineOf(q7c, "VOUCHER") && !!conf(q7c, "VOUCHER"),
    "conflict ×3", `exp=${JSON.stringify(q7?.conflicts)} min=${JSON.stringify(q7b?.conflicts)} other=${JSON.stringify(q7c?.conflicts)}`);

  const q8 = await M.quoteApply(ctx, owner, X, cart, {});
  const q8b = await M.quoteApply(ctx, owner, X, small, {});
  const kataCart = { ...cart, unitId: E.units.kata };
  const q8c = await M.quoteApply(ctx, owner, X, kataCart, { voucherIds: [vPat.id] });
  const q8d = await M.quoteApply(ctx, owner, X, cart, { voucherIds: [vPat.id] });
  chk("M2.7-S2.10", "stampsToAdd preview: การ์ด PER_SALE_MIN ฿1,000 → บิลใหญ่ [{cardId, name, count 1}] · บิลเล็ก [] · ไม่เขียน progress (ยัง 2) · unit: voucher เฉพาะป่าตอง + cart สาขากะตะ → conflict · cart ป่าตอง → ใช้ได้ 10,000",
    q8.stampsToAdd?.some((s: Any) => s.cardId === card.id && s.count === 1 && !!s.name) && q8b.stampsToAdd?.length === 0 && (await P.stampCardProgress.findFirst({ where: { cardId: card.id, customerId: X } }))?.stamps === 2 && !lineOf(q8c, "VOUCHER") && !!conf(q8c, "VOUCHER") && lineOf(q8d, "VOUCHER")?.discountSatang === 10_000,
    "preview + unit", `big=${JSON.stringify(q8?.stampsToAdd)} small=${JSON.stringify(q8b?.stampsToAdd)} kata=${JSON.stringify(q8c?.conflicts)} pat=${JSON.stringify(lineOf(q8d, "VOUCHER"))}`);

  // ═══ S3 applyOnSale / releaseOnVoid ═══
  const saleId = `qc27-sale-${tag}`;
  const ap = (await prisma.$transaction((tx) => M.applyOnSale(ctx, { saleId, customerId: X, unitId: E.units.patong, choices: { voucherIds: [v1.id], points: 1000, giftCard: { number: gc.number, pin: gc.pin, satang: 100_000 } } }, tx))) as Any;
  const v1a = await vrow(v1.id);
  const led = await prisma.pointLedger.findFirst({ where: { customerId: X, refType: "PosSale" as Any, refId: saleId } });
  const gcb = await G.balance(gctx, { number: gc.number });
  const gtx = await P.giftCardTxn.findFirst({ where: { giftCardId: gc.giftCardId, type: "USE", refId: saleId } });
  chk("M2.7-S3.1", "applyOnSale ใน tx: {tierDiscountSatang 45500, voucherUseIds [v1], pointsBurned 1000, pointsLedgerId, giftCardTxnId, giftCardSatang 100000, totalDiscountSatang 185500} · หลัง commit: v1 USED usedRef.saleId · ledger BURN −1000 refType PosSale refId saleId (balance 0) · gift card balance 0 DEPLETED · GiftCardTxn USE refId saleId",
    ap?.tierDiscountSatang === 45_500 && JSON.stringify(ap.voucherUseIds) === JSON.stringify([v1.id]) && ap.pointsBurned === 1000 && !!ap.pointsLedgerId && !!ap.giftCardTxnId && ap.giftCardSatang === 100_000 && ap.totalDiscountSatang === 185_500 && v1a?.status === "USED" && v1a.usedRef?.saleId === saleId && led?.delta === -1000 && (await bal(X)) === 0 && gcb?.balanceSatang === 0 && gcb.status === "DEPLETED" && gtx?.id === ap.giftCardTxnId,
    "ใช้ครบทุกชนิด", `ap=${JSON.stringify(ap)} v1=${v1a?.status}/${v1a?.usedRef?.saleId === saleId} led=${led?.delta} bal=${await bal(X)} gc=${JSON.stringify(gcb)} gtx=${gtx?.id === ap?.giftCardTxnId}`);

  await give(X, 500, "p3");
  const gc2 = await G.sell(gctx, owner, { satang: 50_000, payMethods: [{ type: "CASH", amountSatang: 50_000 }], unitId: E.units.patong, buyerCustomerId: X, recipient: { customerId: X }, idempotencyKey: key("gc2") });
  if (gc2?.saleId) made.sales.push(gc2.saleId);
  const rb = await fails(() => prisma.$transaction(async (tx) => { await M.applyOnSale(ctx, { saleId: `${saleId}-rb`, customerId: X, unitId: E.units.patong, choices: { voucherIds: [v2.id], points: 500, giftCard: { number: gc2.number, pin: gc2.pin, satang: 50_000 } } }, tx); throw new Error("ROLLBACK-QC"); }));
  chk("M2.7-S3.2", "rollback: applyOnSale แล้ว tx โยน error → ไม่มีอะไรเขียน (v2 ยัง ACTIVE · แต้มยัง 500 · gift card 2 ยัง 50000 ACTIVE · ไม่มี ledger/txn ของ saleId-rb)",
    /ROLLBACK-QC/.test(rb?.message ?? "") && (await vrow(v2.id))?.status === "ACTIVE" && (await bal(X)) === 500 && (await G.balance(gctx, { number: gc2.number }))?.balanceSatang === 50_000 && (await prisma.pointLedger.count({ where: { refId: `${saleId}-rb` } })) === 0 && (await P.giftCardTxn.count({ where: { refId: `${saleId}-rb` } })) === 0,
    "ไม่เขียน", `rb=${rb?.message?.slice(0, 30)} v2=${(await vrow(v2.id))?.status} bal=${await bal(X)} gc2=${(await G.balance(gctx, { number: gc2.number }))?.balanceSatang} led=${await prisma.pointLedger.count({ where: { refId: `${saleId}-rb` } })}`);

  const eUsed = await fails(() => prisma.$transaction((tx) => M.applyOnSale(ctx, { saleId: `${saleId}-x1`, customerId: X, unitId: E.units.patong, choices: { voucherIds: [v1.id] } }, tx)));
  const ePin = await fails(() => prisma.$transaction((tx) => M.applyOnSale(ctx, { saleId: `${saleId}-x2`, customerId: X, unitId: E.units.patong, choices: { voucherIds: [v2.id], giftCard: { number: gc2.number, pin: "000000", satang: 10_000 } } }, tx)));
  const ePts = await fails(() => prisma.$transaction((tx) => M.applyOnSale(ctx, { saleId: `${saleId}-x3`, customerId: X, unitId: E.units.patong, choices: { points: 5000 } }, tx)));
  chk("M2.7-S3.3", "apply ล้ม = ไม่เขียนบางส่วน: voucher ที่ USED แล้ว → throw ไทย · gift PIN ผิด (หลัง voucher v2 ในชุดเดียวกัน) → throw และ v2 ยัง ACTIVE · แต้มเกิน balance → throw · balance ยัง 500",
    thai(eUsed) && !!ePin && (await vrow(v2.id))?.status === "ACTIVE" && thai(ePts) && (await bal(X)) === 500,
    "throw + คงเดิม", `used=${eUsed?.message?.slice(0, 40)} pin=${!!ePin} v2=${(await vrow(v2.id))?.status} pts=${ePts?.message?.slice(0, 40)} bal=${await bal(X)}`);

  const rv = await M.releaseOnVoid(ctx, { saleId });
  const rv2 = await M.releaseOnVoid(ctx, { saleId });
  chk("M2.7-S3.4", "releaseOnVoid(saleId): {vouchersReleased 1, pointsReversed 1, giftCardRefunded 1} · v1 กลับ ACTIVE · แต้มคืน +1000 (1,500) · gift card 1 กลับ 100000 ACTIVE (Txn REFUND) · ซ้ำ → ทั้งหมด 0 ไม่คืนซ้ำ",
    rv?.vouchersReleased === 1 && rv.pointsReversed === 1 && rv.giftCardRefunded === 1 && (await vrow(v1.id))?.status === "ACTIVE" && (await bal(X)) === 1500 && (await G.balance(gctx, { number: gc.number }))?.balanceSatang === 100_000 && (await G.balance(gctx, { number: gc.number }))?.status === "ACTIVE" && rv2?.vouchersReleased === 0 && rv2.pointsReversed === 0 && rv2.giftCardRefunded === 0 && (await bal(X)) === 1500,
    "ย้อนครบ ครั้งเดียว", `rv=${JSON.stringify(rv)} v1=${(await vrow(v1.id))?.status} bal=${await bal(X)} gc=${JSON.stringify(await G.balance(gctx, { number: gc.number }))} rv2=${JSON.stringify(rv2)}`);

  const qSelf = await M.quoteApply(ctx, custX, X, cart, { voucherIds: [v1.id] });
  const eQOther = await fails(() => M.quoteApply(ctx, custK, X, cart, {}));
  const eQThana = await fails(() => M.quoteApply(ctx, thana, K, kataCart, {}));
  chk("M2.7-S3.5", "scope quote: CUSTOMER quote ของตัวเองได้ (voucher ใช้ได้) · quote ให้คนอื่น → throw · thana quote สมาชิกกะตะ → throw ไม่พบ",
    lineOf(qSelf, "VOUCHER")?.discountSatang === 30_000 && !!eQOther && thai(eQThana), "ตามขอบเขต", `self=${JSON.stringify(lineOf(qSelf, "VOUCHER"))} other=${!!eQOther} thana=${eQThana?.message?.slice(0, 40)}`);

  // ═══ S4 UI / ภาพ ═══
  const comp = read("src/components/member/Member360.tsx");
  const compDir = "src/components/member";
  const walletComps = existsSync(compDir) ? (await import("node:fs")).readdirSync(compDir).filter((f) => /wallet/i.test(f)).map((f) => read(`${compDir}/${f}`)).join("\n") : "";
  const all = comp + walletComps;
  const TIDS = ["member-wallet", "member-wallet-points", "member-wallet-vouchers", "member-wallet-coupons", "member-wallet-giftcards", "member-wallet-rewards", "member-wallet-stamps", "member-wallet-benefits"];
  const missingT = TIDS.filter((t) => !all.includes(t));
  const clean = all.replace(/\/\/.*$/gm, "");
  const facade = read("src/lib/modules/member/index.ts");
  chk("M2.7-S4.1", "แท็บกระเป๋าสิทธิ์: Member360 ไม่ใช้ ComingSoon สำหรับ wallet · testid 8 · ป้ายไทย (แต้มคงเหลือ · ใกล้หมดอายุ · voucher · คูปอง · gift card · รางวัลรอรับ · สแตมป์ · สิทธิ์ระดับ) · facade export getWallet/quoteApply/applyOnSale/releaseOnVoid · MEMBER_LIMITS.vouchersPerSale · ไม่มีอีโมจิ/hex",
    !/tab === "wallet"[^\n]*ComingSoon|ComingSoon[^\n]*wallet/.test(comp) && missingT.length === 0 && ["แต้ม", "ใกล้หมดอายุ", "voucher", "คูปอง", "Gift Card", "รางวัล", "สแตมป์", "สิทธิ์"].every((l) => new RegExp(l, "i").test(all)) && ["getWallet", "quoteApply", "applyOnSale", "releaseOnVoid"].every((f) => new RegExp(`\\b${f}\\b`).test(facade)) && typeof MEMBER_LIMITS.vouchersPerSale === "number" && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(clean) && !/#[0-9a-fA-F]{6}\b/.test(clean),
    "ครบ", `tid-missing=${missingT.join(",") || "-"} facade=${["getWallet", "quoteApply", "applyOnSale", "releaseOnVoid"].map((f) => new RegExp(`\\b${f}\\b`).test(facade)).join("/")} limit=${MEMBER_LIMITS.vouchersPerSale}`);

  const dir = `${mq.MQC.shotsDir}/2.7`;
  const sum = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sum(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  const ok = (u: string, n: string, d: string) => r(u, n, d)?.status === 200 && r(u, n, d)?.missing?.length === 0 && r(u, n, d)?.errors?.length === 0 && !r(u, n, d)?.overflow;
  chk("M2.7-S4.2", "ภาพ 02 แท็บกระเป๋า: member-wallet-owner desktop+mobile 200 ไม่ล้น (สมาชิก 1 มีแต้ม/voucher/สแตมป์จาก TMP27) · member-wallet-thana 200",
    ok("owner", "member-wallet-owner", "desktop") && ok("owner", "member-wallet-owner", "mobile") && ok("thana", "member-wallet-thana", "desktop"),
    "200 ×3", `${r("owner", "member-wallet-owner", "desktop")?.status}/${r("owner", "member-wallet-owner", "mobile")?.status}/ovf=${r("owner", "member-wallet-owner", "mobile")?.overflow} thana=${r("thana", "member-wallet-thana", "desktop")?.status} missing=${JSON.stringify(r("owner", "member-wallet-owner", "desktop")?.missing)}`);
  chk("M2.7-S4.3", "🔴 parity ภาพ 02 (แท็บกระเป๋า) — Fable ตรวจด้วยตา · wo-notes/member-M2.7.md มี 'PARITY: ผ่าน'", /^\s*-?\s*\*\*PARITY:\s*ผ่าน\*\*/m.test(read("ledger/wo-notes/member-M2.7.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M2.7-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  const redIds = [...made.redemptions];
  if (made.rewards.length) { for (const x of await P.rewardRedemption.findMany({ where: { rewardId: { in: made.rewards } }, select: { id: true } }).catch(() => [])) redIds.push(x.id); }
  if (redIds.length) { const leds = await prisma.pointLedger.findMany({ where: { tenantId: tid, refId: { in: redIds } }, select: { id: true } }).catch(() => [] as Any[]); await d(() => P.pointLot.deleteMany({ where: { ledgerId: { in: leds.map((l: Any) => l.id) } } })); await d(() => prisma.pointLedger.deleteMany({ where: { id: { in: leds.map((l: Any) => l.id) } } })); await d(() => P.rewardRedemption.deleteMany({ where: { id: { in: redIds } } })); }
  if (made.rewards.length) await d(() => prisma.reward.deleteMany({ where: { id: { in: made.rewards } } }));
  if (made.coupons.length) { await d(() => P.couponRedemption.deleteMany({ where: { couponId: { in: made.coupons } } })); await d(() => P.coupon.deleteMany({ where: { id: { in: made.coupons } } })); }
  const newCards = await P.stampCard.findMany({ where: { tenantId: tid, id: { notIn: [...before.cards] } }, select: { id: true } }).catch(() => [] as Any[]);
  if (newCards.length) { const progs = await P.stampCardProgress.findMany({ where: { cardId: { in: newCards.map((c: Any) => c.id) } }, select: { id: true } }).catch(() => []); const pids = progs.map((p: Any) => p.id); if (pids.length) { await d(() => P.stampEvent.deleteMany({ where: { progressId: { in: pids } } })); await d(() => P.stampCardProgress.deleteMany({ where: { id: { in: pids } } })); } await d(() => P.stampCard.deleteMany({ where: { id: { in: newCards.map((c: Any) => c.id) } } })); }
  const newG = await P.giftCard.findMany({ where: { tenantId: tid, id: { notIn: [...before.gcards] } }, select: { id: true, saleId: true } }).catch(() => [] as Any[]);
  if (newG.length) { const gids = newG.map((g: Any) => g.id); await d(() => P.giftCardTxn.deleteMany({ where: { giftCardId: { in: gids } } })); await d(() => P.giftCard.deleteMany({ where: { id: { in: gids } } })); for (const g of newG) if (g.saleId) made.sales.push(g.saleId); }
  if (made.sales.length) { await d(() => P.posPayment.deleteMany({ where: { saleId: { in: made.sales } } })); await d(() => P.posSaleLine.deleteMany({ where: { saleId: { in: made.sales } } })); await d(() => prisma.posSale.deleteMany({ where: { id: { in: made.sales } } })); }
  await d(() => P.memberActivity.deleteMany({ where: { tenantId: tid, module: { in: ["voucher", "giftcard"] }, customerId: { in: made.customers } } }));
  await d(() => P.voucher.deleteMany({ where: { tenantId: tid, id: { notIn: [...before.vouchers] } } }));
  await d(() => P.voucherTemplate.deleteMany({ where: { tenantId: tid, id: { notIn: [...before.templates] } } }));
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["voucher", "rewardRedemption", "stampCardProgress", "pointLot", "pointLedger", "pointBalance", "memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberAccessLog", "memberActivity"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) { await d(() => prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } })); await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } })); }
  }
  for (const t of ["voucher.", "giftcard.", "stamp.", "reward.", "point.", "member."]) await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: t }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M2.7: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
