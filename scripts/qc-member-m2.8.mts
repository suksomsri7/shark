// QC — ระบบสมาชิก v2 WO M2.8: POS integration + consumer — แผงสิทธิ์ที่หน้าขาย (ภาพ 06) · createSale รับ memberChoices → member.applyOnSale ใน tx · **ย้าย** point.earn/member.recordSpend/logActivity ออกจาก tx → consumer `pos.sale.paid` ที่ composition root `src/lib/member-bridges.ts` (recordSpend · computeEarn→earnWithLot · สแตมป์ · attribution first purchase · tier evaluate · activity) · `pos.sale.voided` ย้อนครบ · บิล gift card ข้าม · consumer พังห้ามล้มบิล · POS เดิมยังทำงาน · regressions 8 ชุด
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §0 ข้อ 2 (ห้ามแตะ tx POS โดยไม่มี regressions เขียว) §2 M2.8 · พิมพ์เขียว §9.1 §11.5 · ภาพ 06
// requires: member-seed
//
// สัญญา
//   pos/service.ts#createSale: CreateSaleInput + { memberSystemId?: string; memberChoices?: { voucherIds?: string[]; points?: number; giftCard?: { number: string; pin: string; satang: number } } }
//     ใน tx: memberId + memberChoices → member.applyOnSale(ctx{tenantId, systemId: memberSystemId, actorUserId?}, { saleId, customerId, unitId, choices }, tx) → ส่วนลดสมาชิก = tierDiscount + voucher + points + giftCard (ลำดับ/กันซ้อนตาม wallet) · grandTotal = subtotal − billDiscount − coupon − ส่วนลดสมาชิก · Σ payMethods ต้อง = grandTotal (ไม่ตรง → throw PAYMENT_MISMATCH) · เขียน PosSale.tierDiscountSatang/voucherUseIds/giftCardTxnId · discountSatang รวมทุกส่วนลด · pointEarned = 0 ตอน commit
//     **ไม่มี** point.earn / member.recordSpend / member.logActivity ใน tx อีกต่อไป (ย้ายไป consumer) · คูปองยังทำใน tx เหมือนเดิม · ยังยิง pos.sale.paid เหมือนเดิม · ไม่มี memberId → เส้นทางเดิมทุกประการ
//   src/lib/member-bridges.ts (composition root · import facade member/point/stamp/voucher/giftcard ได้): onPosSalePaid(sale) → บิลที่มี giftCardId → return · memberId ไม่มี → return · ทำตามลำดับ (ทุกขั้น idempotent): recordSpend(grandTotal) · earn = point.computeEarn(customer, { lines, netSatang: grandTotal, paidBy: { voucherSatang, pointsSatang, giftCardSatang } }) → earnWithLot(refType "PosSale" refId saleId idempotencyKey `pos-earn-${saleId}`) + PosSale.pointEarned · stamp.autoStampFromSale · sources.recordFirstPurchase · tiers.evaluateAndApply(customerId) · logActivity {module "pos", type "PURCHASE", refType "PosSale", refId saleId} (ไม่ซ้ำ: มีแล้วไม่เขียนซ้ำ)
//     onPosSaleVoided(sale) → member.releaseOnVoid(saleId) (voucher/points burn/gift) · point.reverseWithLots(refType "PosSale" refId saleId) (EARN) · stamp.voidStampsForSale · recordSpend(−grandTotal) · tiers.evaluateAndApply · logActivity type "VOID" · idempotent (ครั้งที่ 2 ไม่ย้อนซ้ำ · ใช้ MemberActivity VOID ของ saleId เป็นธง หรือ ledger/txn idempotencyKey)
//     outbox-consumers.ts: pos.sale.paid = account bridge (เดิม) + member bridge ครอบ try/catch → logOps("WARN", "member", …) (บิล/บัญชีไม่ล้ม · event DONE) · pos.sale.voided เช่นกัน
//   actions/pos.ts: posQuoteAction รับ memberChoices → คืน member?: { lines, conflicts, pointsToEarn, stampsToAdd, netSatang } (จาก member.quoteApply) · registerSaleAction ส่ง memberChoices + memberSystemId เข้า createSale · pos/register-ui.tsx: เลือกสมาชิก → แผงขวา "สิทธิ์ของ <ชื่อ>" (ภาพ 06): ระดับ+รหัส · ส่วนลดระดับอัตโนมัติ · voucher เลือกได้ 1 ใบ (ใบที่ใช้ไม่ได้ = จาง + เหตุผล) · ใช้แต้มแลกส่วนลด toggle (แสดง มี n แต้ม · ใช้ n = ฿x) · gift card (เลข+PIN+ยอด) · สแตมป์ preview +n · ลำดับที่ใช้ ชิป 4 · หมายเหตุกันซ้อน + แต้มที่จะได้ · สรุป ส่วนลดที่ใช้สิทธิ์ + ยอดที่ต้องชำระ · ปุ่ม "ใช้สิทธิ์และรับชำระ ฿x"
//   testid (register-ui.tsx): pos-register pos-member-select pos-catalog-item pos-member-panel pos-panel-tier pos-panel-vouchers pos-panel-points pos-panel-giftcard pos-panel-stamps pos-panel-order pos-panel-earn pos-pay-button
//   regressions (builder รัน `pnpm exec tsx scripts/qc-all.mts acc-v2-pos-lines kanban-k3.3 point reward chat-member-autolink member-m1.5 member-m2.1 member-m2.7` → log ที่ /tmp/claude-0/qc-all/qc-<name>.log ต้องเขียวและใหม่กว่า 24 ชม.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, statSync } from "node:fs";
if (!existsSync("src/lib/member-bridges.ts") || !/memberChoices/.test(readFileSync("src/lib/modules/pos/service.ts", "utf8"))) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/member-bridges.ts · pos/service.ts#memberChoices)");
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
let tid = ""; let SYS = ""; let PT = ""; let POS = ""; let CP = "";
const tag = Date.now().toString(36);
const before = { vouchers: new Set<string>(), templates: new Set<string>(), cards: new Set<string>(), gcards: new Set<string>() };
const made = { customers: [] as string[], sales: [] as string[], coupons: [] as string[], ledgerKeys: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId; PT = scope.systems.POINT as string; POS = scope.systems.POS as string; CP = scope.systems.COUPON as string;
  for (const v of await P.voucher.findMany({ where: { tenantId: tid }, select: { id: true } })) before.vouchers.add(v.id);
  for (const t of await P.voucherTemplate.findMany({ where: { tenantId: tid }, select: { id: true } })) before.templates.add(t.id);
  for (const c of await P.stampCard.findMany({ where: { tenantId: tid }, select: { id: true } })) before.cards.add(c.id);
  for (const g of await P.giftCard.findMany({ where: { tenantId: tid }, select: { id: true } })) before.gcards.add(g.id);
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const pos = (await import("@/lib/modules/pos/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const T = (await import("@/lib/modules/member/tiers" as string)) as Record<string, (...a: Any[]) => Any>;
  const PS = (await import("@/lib/modules/point" as string)) as Record<string, (...a: Any[]) => Any>;
  const V = (await import("@/lib/modules/voucher" as string)) as Record<string, (...a: Any[]) => Any>;
  const G = (await import("@/lib/modules/giftcard" as string)) as Record<string, (...a: Any[]) => Any>;
  const ST = (await import("@/lib/modules/stamp" as string)) as Record<string, (...a: Any[]) => Any>;
  const coupon = (await import("@/lib/modules/coupon/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId);
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const pctx = { tenantId: tid, systemId: PT, memberSystemId: SYS, actorUserId: E.users.owner.userId as string };
  const gctx = { tenantId: tid, systemId: SYS, posSystemId: POS, actorUserId: E.users.owner.userId as string };
  const key = (s: string) => `qc28-${tag}-${s}`;
  const bal = (cid: string) => PS.getBalance(PT, cid);
  const vrow = (id: string) => P.voucher.findUnique({ where: { id } });
  const saleRow = (id: string) => prisma.posSale.findUnique({ where: { id }, include: { payments: true, lines: true } }) as Any;
  const { drainOutbox } = await import("@/lib/core/outbox");
  const { consumers: CONS } = (await import("@/lib/outbox-consumers" as string)) as Any;
  const drain = async (n = 2) => { for (let k = 0; k < n; k += 1) await drainOutbox(CONS, { limit: 300 }); };
  const gold = await P.memberTierDef.findFirst({ where: { systemId: SYS, key: "gold" } });
  const benOld = await P.memberTierBenefit.findMany({ where: { tierDefId: gold.id, type: "DISCOUNT_PCT" } });
  restore.push(async () => { await P.memberTierBenefit.deleteMany({ where: { tierDefId: gold.id, type: "DISCOUNT_PCT" } }); for (const b of benOld) await P.memberTierBenefit.create({ data: b }).catch(() => null); });
  await P.memberTierBenefit.deleteMany({ where: { tierDefId: gold.id, type: "DISCOUNT_PCT" } });
  await P.memberTierBenefit.create({ data: { tenantId: tid, tierDefId: gold.id, type: "DISCOUNT_PCT", config: { pct: 10, maxSatang: 0 }, active: true } });
  const set0 = await PS.getPointSettings(tid);
  restore.push(() => PS.setPointSettings({ tenantId: tid }, set0));
  await PS.setPointSettings({ tenantId: tid }, { ...set0, burnRateSatang: 10, burnMinPoints: 100, burnMaxPct: 50, excludeGiftCard: true, excludeVoucher: true, earnBase: "NET" });
  const gs0 = await G.getSettings(gctx);
  restore.push(() => G.setSettings(gctx, owner, gs0));
  await G.setSettings(gctx, owner, { enabled: true, accountingLink: false });
  const mkCust = async (nm: string) => { const c = await PR.createMember(ctx as Any, owner, { phone: `0898${String((Date.now() + Math.floor(Math.random() * 1000)) % 1_000_000).padStart(6, "0")}`, firstName: nm, lastName: "หน้าร้าน", source: "WALK_IN", homeUnitId: E.units.patong }); made.customers.push(c.customerId); return c.customerId as string; };
  const X = await mkCust("ทอง");
  await T.applyTierChange(ctx as Any, X, gold.id, "MANUAL", { qc: tag }, { byUserId: owner.userId });
  const give = async (cid: string, pts: number, k: string) => { made.ledgerKeys.push(key(k)); return PS.earnWithLot(pctx, { customerId: cid, points: pts, refType: "QC", refId: key(k), idempotencyKey: key(k) }); };
  await give(X, 1000, "p1");
  const T300 = await V.createTemplate(ctx, owner, { name: `ส่วนลด ฿300 ${tag}`, kind: "FIXED", value: 30_000, config: { minSatang: 100_000, stackWithCoupon: false, unitIds: [] }, validDays: 30, origin: "MANUAL" });
  const v1 = (await V.issue(ctx, owner, { customerIds: [X], templateId: T300.id, origin: "MANUAL" })).vouchers[0];
  const gc = await G.sell(gctx, owner, { satang: 100_000, payMethods: [{ type: "CASH", amountSatang: 100_000 }], unitId: E.units.patong, buyerCustomerId: X, recipient: { customerId: X }, idempotencyKey: key("gc1") });
  if (gc?.saleId) made.sales.push(gc.saleId);
  const card = await ST.createCard(ctx, owner, { name: `ดำน้ำครบ 5 ${tag}`, slots: 5, ruleKind: "PER_SALE_MIN", ruleConfig: { minSatang: 100_000, perDayMax: 3, allowAutoFromSale: true }, rewardKind: "POINTS", rewardConfig: { points: 10 }, autoRestart: true, tierDefIds: [], unitIds: [] });
  const cpn = await coupon.createCoupon({ tenantId: tid, systemId: CP, code: `PS${tag}`.toUpperCase(), name: "คูปอง 5%", type: "PERCENT", percent: 5, maxDiscountSatang: 20_000 });
  if (cpn?.ok) made.coupons.push(cpn.couponId);
  const svc = await prisma.bookingService.findFirst({ where: { tenantId: tid, unitId: E.units.patong } });
  const lines = [{ name: "คอร์ส Fun Dive 2 ไดฟ์", qty: 1, unitPriceSatang: 350_000, serviceId: svc!.id }, { name: "เช่าอุปกรณ์ครบชุด", qty: 1, unitPriceSatang: 60_000 }, { name: "เสื้อยืด", qty: 1, unitPriceSatang: 45_000 }];
  const earnExpect = async (cid: string, net: number, paidBy: Any) => (await PS.computeEarn(pctx, { customerId: cid, sale: { lines: lines.map((l) => ({ serviceId: (l as Any).serviceId, qty: l.qty, netSatang: l.qty * l.unitPriceSatang })), netSatang: net, paidBy } })).points as number;
  const mkSale = (extra: Any) => pos.createSale({ tenantId: tid, unitId: E.units.patong, systemId: POS, pointSystemId: PT, memberSystemId: SYS, lines, payMethods: [{ type: "CASH", amountSatang: 455_000 }], ...extra });
  const activities = (cid: string, type: string) => P.memberActivity.findMany({ where: { customerId: cid, module: "pos", type } });

  // ═══ S1 บิลครบทุกสิทธิ์ ═══
  const spent0 = (await prisma.customer.findUnique({ where: { id: X } }))!.totalSpentSatang;
  const s1 = await mkSale({ memberId: X, idempotencyKey: key("s1"), memberChoices: { voucherIds: [v1.id], points: 1000, giftCard: { number: gc.number, pin: gc.pin, satang: 100_000 } }, payMethods: [{ type: "CASH", amountSatang: 269_500 }] });
  made.sales.push(s1.saleId);
  const r1 = await saleRow(s1.saleId);
  const earnBefore = await prisma.pointLedger.count({ where: { customerId: X, refType: "PosSale" as Any, refId: s1.saleId, delta: { gt: 0 } } });
  chk("M2.8-S1.1", "createSale + memberChoices (voucher ฿300 · 1,000 แต้ม · gift ฿1,000): grandTotal 269,500 (455,000 − ระดับ 45,500 − 30,000 − 10,000 − 100,000) · discountSatang 185,500 · tierDiscountSatang 45,500 · voucherUseIds [v1] · giftCardTxnId · payment CASH 269,500 · pointEarned 0 ตอน commit · ยังไม่มี ledger EARN (ก่อน drain)",
    s1?.grandTotalSatang === 269_500 && r1?.discountSatang === 185_500 && r1.tierDiscountSatang === 45_500 && JSON.stringify(r1.voucherUseIds) === JSON.stringify([v1.id]) && !!r1.giftCardTxnId && r1.payments?.[0]?.amountSatang === 269_500 && r1.pointEarned === 0 && s1.pointEarned === 0 && earnBefore === 0,
    "ยอดสุทธิ 269,500", `res=${JSON.stringify(s1)} row=${JSON.stringify({ disc: r1?.discountSatang, tier: r1?.tierDiscountSatang, v: r1?.voucherUseIds, g: !!r1?.giftCardTxnId, pay: r1?.payments?.[0]?.amountSatang, pe: r1?.pointEarned })} earnBefore=${earnBefore}`);

  const v1r = await vrow(v1.id);
  const burn = await prisma.pointLedger.findFirst({ where: { customerId: X, refType: "PosSale" as Any, refId: s1.saleId, delta: { lt: 0 } } });
  const gcb = await G.balance(gctx, { number: gc.number });
  chk("M2.8-S1.2", "ใน tx เดียวกัน: voucher USED usedRef.saleId · ledger BURN −1000 refType PosSale refId saleId (balance 0) · gift card balance 0 (DEPLETED) · GiftCardTxn = PosSale.giftCardTxnId",
    v1r?.status === "USED" && v1r.usedRef?.saleId === s1.saleId && burn?.delta === -1000 && (await bal(X)) === 0 && gcb?.balanceSatang === 0 && (await P.giftCardTxn.findUnique({ where: { id: r1.giftCardTxnId } }))?.refId === s1.saleId,
    "ตัดครบ", `v=${v1r?.status} burn=${burn?.delta} bal=${await bal(X)} gc=${JSON.stringify(gcb)}`);

  await drain();
  const r1b = await saleRow(s1.saleId);
  const earn = await prisma.pointLedger.findFirst({ where: { customerId: X, refType: "PosSale" as Any, refId: s1.saleId, delta: { gt: 0 } } });
  const expEarn = await earnExpect(X, 269_500, { voucherSatang: 30_000, pointsSatang: 10_000, giftCardSatang: 100_000 });
  const lot = earn ? await P.pointLot.findFirst({ where: { ledgerId: earn.id } }) : null;
  chk("M2.8-S1.3", "หลัง drain (consumer member-bridges): ledger EARN refType PosSale refId saleId idempotencyKey pos-earn-<saleId> = computeEarn(net 269,500 · ไม่นับส่วนที่จ่ายด้วย voucher/แต้ม/gift) · PointLot สร้าง · PosSale.pointEarned = แต้มนั้น · balance = แต้มที่ได้",
    !!earn && earn.delta === expEarn && expEarn > 0 && earn.idempotencyKey === `pos-earn-${s1.saleId}` && !!lot && r1b?.pointEarned === expEarn && (await bal(X)) === expEarn,
    `EARN ${expEarn}`, `earn=${earn?.delta}/${earn?.idempotencyKey} exp=${expEarn} lot=${!!lot} pe=${r1b?.pointEarned} bal=${await bal(X)}`);

  const r1c = await saleRow(s1.saleId);
  const prog = await P.stampCardProgress.findFirst({ where: { cardId: card.id, customerId: X } });
  const stEv = prog ? await P.stampEvent.findFirst({ where: { progressId: prog.id, refType: "SALE", refId: s1.saleId } }) : null;
  const act = await activities(X, "PURCHASE");
  const spent1 = (await prisma.customer.findUnique({ where: { id: X } }))!.totalSpentSatang;
  const custX = await prisma.customer.findUnique({ where: { id: X } }) as Any;
  chk("M2.8-S1.4", "consumer: สแตมป์ +1 (StampEvent refType SALE refId saleId · PosSale.stampEventIds) · MemberActivity PURCHASE 1 แถว (module pos · refId saleId · summary ไทย) · recordSpend: totalSpentSatang +269,500 · attribution first purchase (sourceDetail.firstPurchaseSaleId = saleId)",
    prog?.stamps === 1 && !!stEv && (r1c.stampEventIds as string[]).includes(stEv.id) && act.length === 1 && act[0].refId === s1.saleId && /[ก-๙]/.test(act[0].summary) && spent1 - spent0 === 269_500 && custX?.sourceDetail?.firstPurchaseSaleId === s1.saleId,
    "สแตมป์/กิจกรรม/ยอดสะสม", `stamps=${prog?.stamps} ev=${!!stEv} ids=${JSON.stringify(r1c?.stampEventIds)} act=${act.length} spent=${spent1 - spent0} first=${custX?.sourceDetail?.firstPurchaseSaleId === s1.saleId}`);

  const Y = await mkCust("เลื่อน");
  const tierBefore = (await prisma.customer.findUnique({ where: { id: Y } }))!.tierDefId;
  const sY = await pos.createSale({ tenantId: tid, unitId: E.units.patong, systemId: POS, pointSystemId: PT, memberSystemId: SYS, memberId: Y, idempotencyKey: key("sy"), lines: [{ name: "คอร์ส Divemaster", qty: 1, unitPriceSatang: 3_100_000 }], payMethods: [{ type: "CASH", amountSatang: 3_100_000 }] });
  made.sales.push(sY.saleId);
  await drain(3);
  const yAfter = await prisma.customer.findUnique({ where: { id: Y } }) as Any;
  const yHist = await P.memberTierHistory.findFirst({ where: { customerId: Y, toTierDefId: gold.id } });
  chk("M2.8-S1.5", "tier evaluate ใน consumer: สมาชิกใหม่ Y ซื้อ ฿31,000 (≥ เกณฑ์ gold ฿30,000) → หลัง drain tierDefId = gold · MemberTierHistory → gold · Customer.tier (legacy) = GOLD",
    tierBefore !== gold.id && yAfter?.tierDefId === gold.id && !!yHist && yAfter.tier === "GOLD", "เลื่อนเป็น gold", `before=${tierBefore === gold?.id} after=${yAfter?.tierDefId === gold?.id} hist=${!!yHist} legacy=${yAfter?.tier}`);

  const eMismatch = await fails(() => mkSale({ memberId: X, idempotencyKey: key("mm"), memberChoices: { voucherIds: [] }, payMethods: [{ type: "CASH", amountSatang: 455_000 }] }));
  const vOther = (await V.issue(ctx, owner, { customerIds: [Y], templateId: T300.id, origin: "MANUAL" })).vouchers[0];
  const eOtherV = await fails(() => mkSale({ memberId: X, idempotencyKey: key("ov"), memberChoices: { voucherIds: [vOther.id] }, payMethods: [{ type: "CASH", amountSatang: 379_500 }] }));
  const eOverPts = await fails(() => mkSale({ memberId: X, idempotencyKey: key("op"), memberChoices: { points: 99_999 }, payMethods: [{ type: "CASH", amountSatang: 1 }] }));
  chk("M2.8-S1.6", "ล้ม = ไม่สร้างบิล: ส่วนลดระดับทำให้ยอด 409,500 แต่จ่าย 455,000 → throw PAYMENT_MISMATCH · voucher ของคนอื่น → throw ไทย · แต้มเกิน balance → throw · ไม่มี PosSale ของ idempotencyKey เหล่านั้น · voucher ของ Y ยัง ACTIVE",
    /PAYMENT_MISMATCH/.test(eMismatch?.message ?? "") && thai(eOtherV) && !!eOverPts && (await prisma.posSale.count({ where: { tenantId: tid, idempotencyKey: { in: [key("mm"), key("ov"), key("op")] } } })) === 0 && (await vrow(vOther.id))?.status === "ACTIVE",
    "throw ×3 ไม่มีบิล", `mm=${eMismatch?.message?.slice(0, 40)} ov=${eOtherV?.message?.slice(0, 40)} op=${eOverPts?.message?.slice(0, 40)} n=${await prisma.posSale.count({ where: { tenantId: tid, idempotencyKey: { in: [key("mm"), key("ov"), key("op")] } } })}`);

  const sN = await pos.createSale({ tenantId: tid, unitId: E.units.patong, systemId: POS, pointSystemId: PT, lines: [{ name: "เติมอากาศ 1 ถัง", qty: 1, unitPriceSatang: 20_000 }], payMethods: [{ type: "CASH", amountSatang: 20_000 }], idempotencyKey: key("sn") });
  made.sales.push(sN.saleId);
  await drain();
  const evN = await P.outboxEvent.findFirst({ where: { tenantId: tid, type: "pos.sale.paid", payload: { path: ["saleId"], equals: sN.saleId } } });
  chk("M2.8-S1.7", "บิลไม่มีสมาชิก (walk-in): สร้างได้ grandTotal 20,000 · ไม่มี member columns (tierDiscount 0 · voucherUseIds [] · giftCardTxnId null · pointEarned 0) · ไม่มี ledger/activity · event pos.sale.paid DONE (consumer ไม่ล้ม)",
    sN?.grandTotalSatang === 20_000 && (await saleRow(sN.saleId))?.tierDiscountSatang === 0 && (await saleRow(sN.saleId))?.voucherUseIds?.length === 0 && (await saleRow(sN.saleId))?.giftCardTxnId === null && (await prisma.pointLedger.count({ where: { refId: sN.saleId } })) === 0 && evN?.status === "DONE",
    "walk-in ปกติ", `total=${sN?.grandTotalSatang} ev=${evN?.status}`);

  await give(X, 100, "p2");
  const v3 = (await V.issue(ctx, owner, { customerIds: [X], templateId: T300.id, origin: "MANUAL" })).vouchers[0];
  const eStack = await fails(() => mkSale({ memberId: X, idempotencyKey: key("st"), couponSystemId: CP, couponCode: `PS${tag}`.toUpperCase(), memberChoices: { voucherIds: [v3.id] }, payMethods: [{ type: "CASH", amountSatang: 359_500 }] }));
  const sC = await mkSale({ memberId: X, idempotencyKey: key("sc"), couponSystemId: CP, couponCode: `PS${tag}`.toUpperCase(), payMethods: [{ type: "CASH", amountSatang: 389_500 }] });
  made.sales.push(sC.saleId);
  await drain();
  const rC = await saleRow(sC.saleId);
  const earnC = await prisma.pointLedger.findFirst({ where: { customerId: X, refType: "PosSale" as Any, refId: sC.saleId, delta: { gt: 0 } } });
  chk("M2.8-S1.8", "คูปอง: voucher (stackWithCoupon false) + คูปอง → throw ไทย ไม่สร้างบิล (v3 ยัง ACTIVE) · คูปองอย่างเดียว → ระดับ 45,500 + คูปอง 5% ของ 409,500 = 20,000 (cap) → grandTotal 389,500 · CouponRedemption REDEEMED · แต้มจาก consumer = computeEarn(389,500)",
    thai(eStack) && (await vrow(v3.id))?.status === "ACTIVE" && sC?.grandTotalSatang === 389_500 && rC?.tierDiscountSatang === 45_500 && (await P.couponRedemption.count({ where: { saleId: sC.saleId, status: "REDEEMED" } })) === 1 && earnC?.delta === (await earnExpect(X, 389_500, {})),
    "กันซ้อน + คูปอง", `stack=${eStack?.message?.slice(0, 40)} v3=${(await vrow(v3.id))?.status} total=${sC?.grandTotalSatang} tier=${rC?.tierDiscountSatang} cr=${await P.couponRedemption.count({ where: { saleId: sC.saleId, status: "REDEEMED" } })} earn=${earnC?.delta}/${await earnExpect(X, 389_500, {})}`);

  // ═══ S2 void ═══
  const balBeforeVoid = await bal(X);
  const spentBeforeVoid = (await prisma.customer.findUnique({ where: { id: X } }))!.totalSpentSatang;
  await pos.voidSale(tid, E.units.patong, s1.saleId);
  await drain();
  const r1v = await saleRow(s1.saleId);
  const v1v = await vrow(v1.id);
  const gcv = await G.balance(gctx, { number: gc.number });
  chk("M2.8-S2.1", "voidSale บิล s1: status VOIDED · voucher v1 กลับ ACTIVE · gift card คืน 100,000 ACTIVE (Txn REFUND) · แต้มที่เผา 1,000 คืน (ledger REVERSE ของ BURN)",
    r1v?.status === "VOIDED" && v1v?.status === "ACTIVE" && gcv?.balanceSatang === 100_000 && gcv.status === "ACTIVE" && (await P.giftCardTxn.count({ where: { giftCardId: gc.giftCardId, type: "REFUND" } })) === 1 && (await prisma.pointLedger.count({ where: { customerId: X, refType: "PosSale" as Any, refId: s1.saleId, delta: 1000 } })) >= 1,
    "ย้อน voucher/gift/แต้มเผา", `st=${r1v?.status} v=${v1v?.status} gc=${JSON.stringify(gcv)} refund=${await P.giftCardTxn.count({ where: { giftCardId: gc.giftCardId, type: "REFUND" } })} rev=${await prisma.pointLedger.count({ where: { customerId: X, refType: "PosSale" as Any, refId: s1.saleId, delta: 1000 } })}`);

  const lotAfter = earn ? await P.pointLot.findFirst({ where: { ledgerId: earn.id } }) : null;
  const balAfterVoid = await bal(X);
  chk("M2.8-S2.2", "void ย้อนแต้มที่ได้: ledger REVERSE −แต้มที่ได้ (refType PosSale refId s1) · ล็อต remaining −แต้ม · balance = ก่อน void + 1,000 (เผาคืน) − แต้มที่ได้",
    (await prisma.pointLedger.count({ where: { customerId: X, refType: "PosSale" as Any, refId: s1.saleId, delta: -expEarn } })) === 1 && lotAfter?.remaining === 0 && balAfterVoid === balBeforeVoid + 1000 - expEarn,
    "ย้อน EARN", `rev=${await prisma.pointLedger.count({ where: { customerId: X, refType: "PosSale" as Any, refId: s1.saleId, delta: -expEarn } })} lot=${lotAfter?.remaining} bal=${balBeforeVoid}+1000-${expEarn}=${balAfterVoid}`);

  const progV = await P.stampCardProgress.findFirst({ where: { cardId: card.id, customerId: X } });
  const spentAfterVoid = (await prisma.customer.findUnique({ where: { id: X } }))!.totalSpentSatang;
  const actV = await activities(X, "VOID");
  chk("M2.8-S2.3", "void ย้อนสแตมป์ (VOID event · progress 2 → 1 — X มีบิลเข้าเกณฑ์ 2 ใบ s1+sC · void s1 เหลือ 1) · recordSpend −269,500 · MemberActivity VOID 1 แถว refId saleId",
    progV?.stamps === 1 && (await P.stampEvent.count({ where: { progressId: progV?.id ?? "-", type: "VOID" } })) === 1 && spentBeforeVoid - spentAfterVoid === 269_500 && actV.length === 1 && actV[0].refId === s1.saleId,
    "ย้อนสแตมป์/ยอด", `stamps=${progV?.stamps} void=${await P.stampEvent.count({ where: { progressId: progV?.id ?? "-", type: "VOID" } })} spent=${spentBeforeVoid - spentAfterVoid} act=${actV.length}`);

  await drain(3);
  chk("M2.8-S2.4", "void idempotent: drain ซ้ำ 3 รอบ → ยัง REVERSE 1 · REFUND 1 · VOID activity 1 · balance เท่าเดิม",
    (await prisma.pointLedger.count({ where: { customerId: X, refType: "PosSale" as Any, refId: s1.saleId, delta: -expEarn } })) === 1 && (await P.giftCardTxn.count({ where: { giftCardId: gc.giftCardId, type: "REFUND" } })) === 1 && (await activities(X, "VOID")).length === 1 && (await bal(X)) === balAfterVoid,
    "ไม่ย้อนซ้ำ", `rev=${await prisma.pointLedger.count({ where: { customerId: X, refType: "PosSale" as Any, refId: s1.saleId, delta: -expEarn } })} refund=${await P.giftCardTxn.count({ where: { giftCardId: gc.giftCardId, type: "REFUND" } })} act=${(await activities(X, "VOID")).length} bal=${await bal(X)}`);

  await pos.voidSale(tid, E.units.patong, sN.saleId);
  await pos.voidSale(tid, E.units.patong, sC.saleId);
  await drain();
  chk("M2.8-S2.5", "void บิล walk-in และบิลคูปอง: สถานะ VOIDED · คูปอง RELEASED (usedCount คืน) · event pos.sale.voided DONE ทั้งคู่ · ไม่มี error",
    (await saleRow(sN.saleId))?.status === "VOIDED" && (await saleRow(sC.saleId))?.status === "VOIDED" && (await P.couponRedemption.count({ where: { saleId: sC.saleId, status: "RELEASED" } })) === 1 && (await P.outboxEvent.count({ where: { tenantId: tid, type: "pos.sale.voided", status: { not: "DONE" } } })) === 0,
    "void ปกติ", `sN=${(await saleRow(sN.saleId))?.status} sC=${(await saleRow(sC.saleId))?.status} released=${await P.couponRedemption.count({ where: { saleId: sC.saleId, status: "RELEASED" } })} stuck=${await P.outboxEvent.count({ where: { tenantId: tid, type: "pos.sale.voided", status: { not: "DONE" } } })}`);

  const spentY0 = (await prisma.customer.findUnique({ where: { id: Y } }))!.totalSpentSatang;
  await pos.voidSale(tid, E.units.patong, sY.saleId);
  await drain(3);
  const spentY1 = (await prisma.customer.findUnique({ where: { id: Y } }))!.totalSpentSatang;
  const bridges = read("src/lib/member-bridges.ts");
  chk("M2.8-S2.6", "void บิลใหญ่ของ Y: totalSpentSatang −3,100,000 · consumer เรียก evaluateAndApply อีกครั้ง (โค้ด) · Y ไม่ถูกลดระดับทันที (grace/keep ตามกฎ M1.9 — ยัง gold หรือมี history เท่านั้น ไม่ throw)",
    spentY0 - spentY1 === 3_100_000 && /evaluateAndApply/.test(bridges) && !!(await prisma.customer.findUnique({ where: { id: Y } })),
    "ยอดคืน", `spent=${spentY0 - spentY1} code=${/evaluateAndApply/.test(bridges)}`);

  // ═══ S3 consumer idempotent ═══
  const s3 = await mkSale({ memberId: X, idempotencyKey: key("s3"), payMethods: [{ type: "CASH", amountSatang: 409_500 }] });
  made.sales.push(s3.saleId);
  await drain(3);
  const nEarn3 = await prisma.pointLedger.count({ where: { customerId: X, refType: "PosSale" as Any, refId: s3.saleId, delta: { gt: 0 } } });
  const prog3 = await P.stampCardProgress.findFirst({ where: { cardId: card.id, customerId: X } });
  const nStamp3 = await P.stampEvent.count({ where: { progressId: prog3?.id ?? "-", refType: "SALE", refId: s3.saleId } });
  const nAct3 = (await activities(X, "PURCHASE")).filter((a: Any) => a.refId === s3.saleId).length;
  chk("M2.8-S3.1", "drain ×3 บิล s3: EARN 1 · StampEvent SALE 1 · PURCHASE activity 1 · pointEarned = แต้ม",
    nEarn3 === 1 && nStamp3 === 1 && nAct3 === 1 && (await saleRow(s3.saleId))?.pointEarned > 0, "1/1/1", `earn=${nEarn3} stamp=${nStamp3} act=${nAct3} pe=${(await saleRow(s3.saleId))?.pointEarned}`);

  const { emitOutboxOutsideTx } = await import("@/lib/core/outbox");
  await emitOutboxOutsideTx({ tenantId: tid, type: "pos.sale.paid", idempotencyKey: `qc28-replay-${s3.saleId}`, payload: { saleId: s3.saleId }, systemId: POS, unitId: E.units.patong });
  await drain(2);
  chk("M2.8-S3.2", "ยิง event pos.sale.paid ซ้ำ (idempotencyKey ใหม่) → consumer ไม่ให้แต้ม/สแตมป์/กิจกรรมซ้ำ (ยัง 1/1/1) · event DONE",
    (await prisma.pointLedger.count({ where: { customerId: X, refType: "PosSale" as Any, refId: s3.saleId, delta: { gt: 0 } } })) === 1 && (await P.stampEvent.count({ where: { progressId: prog3?.id ?? "-", refType: "SALE", refId: s3.saleId } })) === 1 && (await activities(X, "PURCHASE")).filter((a: Any) => a.refId === s3.saleId).length === 1 && (await P.outboxEvent.findFirst({ where: { tenantId: tid, idempotencyKey: `qc28-replay-${s3.saleId}` } }))?.status === "DONE",
    "ยัง 1/1/1", `earn=${await prisma.pointLedger.count({ where: { customerId: X, refType: "PosSale" as Any, refId: s3.saleId, delta: { gt: 0 } } })} ev=${(await P.outboxEvent.findFirst({ where: { tenantId: tid, idempotencyKey: `qc28-replay-${s3.saleId}` } }))?.status}`);

  // ═══ S4 consumer พังห้ามล้มบิล ═══
  const Z = await mkCust("หาย");
  const sZ = await mkSale({ memberId: Z, idempotencyKey: key("sz"), payMethods: [{ type: "CASH", amountSatang: 455_000 }] });
  made.sales.push(sZ.saleId);
  // ทำให้ member bridge พัง: ลบสมาชิก Z ก่อน drain (FK ของ ledger/activity จะล้ม) → บิล/บัญชีต้องไม่ล้ม · event DONE
  await P.memberActivity.deleteMany({ where: { customerId: Z } }); await P.memberAttribution.deleteMany({ where: { customerId: Z } }); await P.memberTierHistory.deleteMany({ where: { customerId: Z } }); await P.memberConsent.deleteMany({ where: { customerId: Z } }); await P.memberFieldValue.deleteMany({ where: { customerId: Z } }); await P.memberChannelIdentity.deleteMany({ where: { customerId: Z } }); await P.memberAccessLog.deleteMany({ where: { customerId: Z } });
  await prisma.posSale.update({ where: { id: sZ.saleId }, data: { memberId: null } }).catch(() => null);
  await prisma.customer.delete({ where: { id: Z } }).catch(() => null);
  await prisma.posSale.update({ where: { id: sZ.saleId }, data: { memberId: "ghost-customer-id" } as Any }).catch(() => null);
  made.customers.splice(made.customers.indexOf(Z), 1);
  const opsBefore = await P.opsLog?.count?.({ where: { tenantId: tid } }).catch(() => 0);
  await drain(2);
  const evZ = await P.outboxEvent.findFirst({ where: { tenantId: tid, type: "pos.sale.paid", payload: { path: ["saleId"], equals: sZ.saleId } } });
  const opsAfter = await P.opsLog?.count?.({ where: { tenantId: tid } }).catch(() => 0);
  chk("M2.8-S4.1", "member bridge พัง (memberId ชี้ลูกค้าที่ไม่มี) → event pos.sale.paid ยัง DONE (บิล/บัญชีไม่ล้ม) · ไม่มี ledger ของบิลนั้น · มี log WARN เพิ่ม (OpsLog) หรือโค้ดครอบ try/catch + logOps",
    evZ?.status === "DONE" && (await prisma.pointLedger.count({ where: { refId: sZ.saleId } })) === 0 && ((typeof opsAfter === "number" && typeof opsBefore === "number" && opsAfter > opsBefore) || /logOps\(\s*"WARN"/.test(read("src/lib/outbox-consumers.ts") + bridges)),
    "DONE + WARN", `ev=${evZ?.status} led=${await prisma.pointLedger.count({ where: { refId: sZ.saleId } })} ops=${opsBefore}->${opsAfter} code=${/logOps\(\s*"WARN"/.test(read("src/lib/outbox-consumers.ts") + bridges)}`);

  const posSrc = read("src/lib/modules/pos/service.ts"); const consumers = read("src/lib/outbox-consumers.ts");
  const createSaleBody = posSrc.slice(posSrc.indexOf("export async function createSale"), posSrc.indexOf("async function consumeSaleInventory"));
  chk("M2.8-S4.2", "โค้ด: createSale ไม่มี point.earn( / recordSpend( / logActivity( ใน tx อีก · ยังยิง pos.sale.paid · เรียก applyOnSale ผ่าน facade member · consumer pos.sale.paid/voided ครอบ member bridge ด้วย try/catch + logOps WARN · member-bridges.ts import เฉพาะ facade (index) · ไม่มี any",
    !/point\.earn\(/.test(createSaleBody) && !/recordSpend\(/.test(createSaleBody) && !/logActivity\(/.test(createSaleBody) && /pos\.sale\.paid/.test(createSaleBody) && /applyOnSale/.test(createSaleBody) && /member-bridges/.test(consumers) && /logOps\(\s*"WARN"/.test(consumers + bridges) && !/@\/lib\/modules\/(member|point|stamp|voucher|giftcard|reward)\/(?!index)[a-z-]+"/.test(bridges) && !/:\s*any\b/.test(bridges),
    "ย้ายออกจาก tx", `earn=${/point\.earn\(/.test(createSaleBody)} spend=${/recordSpend\(/.test(createSaleBody)} act=${/logActivity\(/.test(createSaleBody)} emit=${/pos\.sale\.paid/.test(createSaleBody)} apply=${/applyOnSale/.test(createSaleBody)} bridge=${/member-bridges/.test(consumers)} warn=${/logOps\(\s*"WARN"/.test(consumers + bridges)}`);

  // ═══ S5 POS เดิม ═══
  await give(X, 0, "noop").catch(() => null);
  const sL = await pos.createSale({ tenantId: tid, unitId: E.units.patong, systemId: POS, pointSystemId: PT, memberId: X, idempotencyKey: key("legacy"), lines: [{ name: "เติมอากาศ 10 ถัง", qty: 1, unitPriceSatang: 250_000 }], payMethods: [{ type: "CASH", amountSatang: 225_000 }] });
  made.sales.push(sL.saleId);
  await drain();
  const rL = await saleRow(sL.saleId);
  chk("M2.8-S5.1", "input เดิม (memberId · ไม่มี memberChoices/memberSystemId): ระบบ resolve ระบบสมาชิกจาก unit เอง → ส่วนลดระดับ 10% ใช้อัตโนมัติ (225,000) · pointEarned 0 ตอน commit → หลัง drain = computeEarn(225,000) · เส้นทางเดิมไม่พัง",
    sL?.grandTotalSatang === 225_000 && sL.pointEarned === 0 && rL?.pointEarned === (await earnExpect(X, 225_000, {})) && rL.pointEarned > 0,
    "legacy ok", `total=${sL?.grandTotalSatang} pe0=${sL?.pointEarned} pe=${rL?.pointEarned}/${await earnExpect(X, 225_000, {})}`);

  const actSrc = read("src/lib/actions/pos.ts"); const ui = read("src/lib/modules/pos/register-ui.tsx");
  const TIDS = ["pos-register", "pos-member-select", "pos-catalog-item", "pos-member-panel", "pos-panel-tier", "pos-panel-vouchers", "pos-panel-points", "pos-panel-giftcard", "pos-panel-stamps", "pos-panel-order", "pos-panel-earn", "pos-pay-button"];
  const missingT = TIDS.filter((t) => !ui.includes(t));
  const LABELS = ["สิทธิ์ของ", "ส่วนลดระดับ", "ใช้อัตโนมัติทุกบิล", "Voucher", "เลือกได้ 1 ใบ", "ใช้แต้มแลกส่วนลด", "Gift Card", "คงเหลือ", "สแตมป์", "บิลนี้ได้", "ลำดับที่ใช้", "ระดับ", "แต้ม", "gift card", "ห้ามใช้ voucher 2 ใบซ้อน", "แต้มที่จะได้รับบิลนี้", "ส่วนลดที่ใช้สิทธิ์", "ยอดที่ต้องชำระ", "ใช้สิทธิ์และรับชำระ"];
  const missingL = LABELS.filter((l) => !ui.includes(l));
  chk("M2.8-S5.2", "UI/actions: posQuoteAction รับ memberChoices และคืน member {lines, conflicts, pointsToEarn, stampsToAdd, netSatang} (ผ่าน member.quoteApply) · registerSaleAction ส่ง memberChoices+memberSystemId เข้า createSale · register-ui testid 12 · ป้ายภาพ 06 ครบ · ไม่มีอีโมจิ/hex",
    /memberChoices/.test(actSrc) && /quoteApply/.test(actSrc) && /pointsToEarn/.test(actSrc) && /memberSystemId/.test(actSrc) && missingT.length === 0 && missingL.length === 0 && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(ui.replace(/\/\/.*$/gm, "")) && !/#[0-9a-fA-F]{6}\b/.test(ui.replace(/\/\/.*$/gm, "")),
    "ครบ", `act=${/memberChoices/.test(actSrc)}/${/quoteApply/.test(actSrc)}/${/pointsToEarn/.test(actSrc)}/${/memberSystemId/.test(actSrc)} tid-missing=${missingT.join(",") || "-"} labels-missing=${missingL.join(",") || "-"}`);

  // ═══ S6 ภาพ ═══
  const dir = `${mq.MQC.shotsDir}/2.8`;
  const sum = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sum(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  const ok = (u: string, n: string, d: string) => r(u, n, d)?.status === 200 && r(u, n, d)?.missing?.length === 0 && r(u, n, d)?.errors?.length === 0 && !r(u, n, d)?.overflow;
  chk("M2.8-S6.1", "ภาพ 06: pos-register-member-owner desktop+mobile 200 ไม่ล้น (เลือกสมาชิก 1 + หยิบสินค้า → แผงสิทธิ์ครบ testid) · pos-register-owner (ไม่เลือกสมาชิก) 200",
    ok("owner", "pos-register-member-owner", "desktop") && ok("owner", "pos-register-member-owner", "mobile") && ok("owner", "pos-register-owner", "desktop"),
    "200 ×3", `${r("owner", "pos-register-member-owner", "desktop")?.status}/${r("owner", "pos-register-member-owner", "mobile")?.status}/ovf=${r("owner", "pos-register-member-owner", "mobile")?.overflow} plain=${r("owner", "pos-register-owner", "desktop")?.status} missing=${JSON.stringify(r("owner", "pos-register-member-owner", "desktop")?.missing)}`);
  chk("M2.8-S6.2", "🔴 parity ภาพ 06 — Fable ตรวจด้วยตา · wo-notes/member-M2.8.md มี 'PARITY: ผ่าน'", /^\s*-?\s*\*\*PARITY:\s*ผ่าน\*\*/m.test(read("ledger/wo-notes/member-M2.8.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");

  // ═══ S7 regressions ═══
  const REG = ["acc-v2-pos-lines", "kanban-k3.3", "point", "reward", "chat-member-autolink", "member-m1.5", "member-m2.1", "member-m2.7"];
  REG.forEach((name, i) => {
    const f = `/tmp/claude-0/qc-all/qc-${name}.log`;
    const exists = existsSync(f);
    const fresh = exists && Date.now() - statSync(f).mtimeMs < 24 * 3600_000;
    const log = exists ? readFileSync(f, "utf8") : "";
    const mm = [...log.matchAll(/JSON_SUMMARY (\{.*\})/g)];
    let ok2 = false; let detail = "ไม่มี log";
    if (mm.length) { try { const j = JSON.parse(mm[mm.length - 1]![1]!); const imgOnly = name === "kanban-k3.3" && j.total - j.passed === 1 && String((j.findings ?? [])[0]?.id ?? (j.findings ?? [])[0]) === "K3.3-S9.2"; /* ภาพบอร์ดงานอยู่ worktree shark-kanban */ ok2 = j.total > 0 && (j.passed === j.total || imgOnly); detail = `${j.passed}/${j.total}${imgOnly ? " (ยกเว้นภาพ K3.3-S9.2)" : ""}`; } catch { detail = "parse ไม่ได้"; } }
    chk(`M2.8-S7.${i + 1}`, `regression qc-${name}: log /tmp/claude-0/qc-all/qc-${name}.log ใหม่กว่า 24 ชม. + เขียวเต็ม (builder รัน qc-all กับชุดนี้หลังแก้ POS)`, exists && fresh && ok2, "เขียว + ใหม่", `exists=${exists} fresh=${fresh} ${detail}`);
  });
} catch (e) {
  console.error("💥", e);
  chk("M2.8-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  if (made.coupons.length) { await d(() => P.couponRedemption.deleteMany({ where: { couponId: { in: made.coupons } } })); await d(() => P.coupon.deleteMany({ where: { id: { in: made.coupons } } })); }
  const newCards = await P.stampCard.findMany({ where: { tenantId: tid, id: { notIn: [...before.cards] } }, select: { id: true } }).catch(() => [] as Any[]);
  if (newCards.length) { const progs = await P.stampCardProgress.findMany({ where: { cardId: { in: newCards.map((c: Any) => c.id) } }, select: { id: true } }).catch(() => []); const pids = progs.map((p: Any) => p.id); if (pids.length) { await d(() => P.stampEvent.deleteMany({ where: { progressId: { in: pids } } })); await d(() => P.stampCardProgress.deleteMany({ where: { id: { in: pids } } })); } await d(() => P.stampCard.deleteMany({ where: { id: { in: newCards.map((c: Any) => c.id) } } })); }
  const newG = await P.giftCard.findMany({ where: { tenantId: tid, id: { notIn: [...before.gcards] } }, select: { id: true, saleId: true } }).catch(() => [] as Any[]);
  if (newG.length) { const gids = newG.map((g: Any) => g.id); await d(() => P.giftCardTxn.deleteMany({ where: { giftCardId: { in: gids } } })); await d(() => P.giftCard.deleteMany({ where: { id: { in: gids } } })); for (const g of newG) if (g.saleId) made.sales.push(g.saleId); }
  const saleIds = [...new Set(made.sales)];
  if (saleIds.length) {
    const leds = await prisma.pointLedger.findMany({ where: { tenantId: tid, refId: { in: saleIds } }, select: { id: true } }).catch(() => [] as Any[]);
    await d(() => P.pointLot.deleteMany({ where: { ledgerId: { in: leds.map((l: Any) => l.id) } } }));
    await d(() => prisma.pointLedger.deleteMany({ where: { id: { in: leds.map((l: Any) => l.id) } } }));
    await d(() => P.accountJournalLine.deleteMany({ where: { entry: { refType: "PosSale", refId: { in: saleIds } } } }));
    await d(() => P.accountJournalEntry.deleteMany({ where: { tenantId: tid, refType: "PosSale", refId: { in: saleIds } } }));
    await d(() => P.accountDocument.deleteMany({ where: { tenantId: tid, refType: "PosSale", refId: { in: saleIds } } }));
    await d(() => P.memberActivity.deleteMany({ where: { tenantId: tid, refType: "PosSale", refId: { in: saleIds } } }));
    await d(() => P.posPayment.deleteMany({ where: { saleId: { in: saleIds } } })); await d(() => P.posSaleLine.deleteMany({ where: { saleId: { in: saleIds } } })); await d(() => prisma.posSale.deleteMany({ where: { id: { in: saleIds } } }));
  }
  await d(() => P.voucher.deleteMany({ where: { tenantId: tid, id: { notIn: [...before.vouchers] } } }));
  await d(() => P.voucherTemplate.deleteMany({ where: { tenantId: tid, id: { notIn: [...before.templates] } } }));
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["voucher", "stampCardProgress", "pointLot", "pointLedger", "pointBalance", "memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberAccessLog", "memberActivity"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) { await d(() => prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } })); await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } })); }
  }
  for (const t of ["pos.sale.", "voucher.", "giftcard.", "stamp.", "point.", "member."]) await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: t }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M2.8: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
