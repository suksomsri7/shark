// QC — ระบบสมาชิก v2 WO M1.9: tiers engine (D1) — TierDef/benefits/rules (AutomationRule scope MEMBER_TIER) · evaluate · applyTierChange · runTierReview · dry-run · manual+approval · archive · benefitsFor · events · cron
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M1.9 · พิมพ์เขียว §4.3 (MemberTierDef/Benefit/History) §5.4 §7.3 §11.3
// requires: member-seed
//
// สัญญาฟังก์ชัน (src/lib/modules/member/tiers.ts) — ctx/actor เหมือน profile.ts
//   listTierDefs(ctx, { includeArchived? }) → [{ id key name color icon sortOrder description isDefault paidPlanId legacyTier keepRuleId upgradeRuleId reviewCron graceDays notifyBeforeDays archivedAt memberCount benefits[] }] เรียง sortOrder
//   createTierDef(ctx, actor, { key name color icon? description? isDefault? paidPlanId? legacyTier? }) · updateTierDef(ctx, actor, id, patch) · reorderTierDefs(ctx, actor, ids[]) · archiveTierDef(ctx, actor, id, { moveToTierId }) (ย้ายสมาชิก + history · ห้าม archive tier ปริยาย · ต้องมี moveToTierId)
//   setBenefits(ctx, actor, tierDefId, [{ type, config, active? }]) → แทนที่ทั้งชุด · validate config ต่อชนิด (§4.3)
//   RuleInput = { match: "ALL"|"ANY", conditions: [{ field: "spent12m"|"spent"|"visits12m"|"visits"|"tierPoints"|"memberDays"|"paidPlan"|"referrals", op: "gte"|"gt"|"lte"|"lt"|"eq", value: number|boolean, windowMonths?: number }] }
//   setTierRules(ctx, actor, tierDefId, { upgrade?: RuleInput|null, keep?: RuleInput|null, reviewCron?, graceDays?, notifyBeforeDays? }) → เก็บเป็น AutomationRule scope MEMBER_TIER (kind RULE · event "" · tierDefId · memberSystemId · conditions/actions) + TierDef.upgradeRuleId/keepRuleId · getTierRules(ctx, tierDefId) → { upgrade, keep, reviewCron, graceDays, notifyBeforeDays }
//   evaluateMember(ctx, customerId, { now?, evidenceOverride? }) → { current: {id,key}, next: {id,key}|null, evidence: { spent12m, visits12m, tierPoints, memberDays, referrals, paidPlan, spentByWindow? }, wouldUpgradeTo: {id,key}|null (ระดับสูงสุดที่กฎ upgrade ผ่าน), wouldDowngradeTo: {id,key}|null (กฎ keep ของระดับปัจจุบันไม่ผ่าน → ระดับต่ำกว่าถัดไป), progressToNext: { field, current, target, pct }|null }
//     evidence คิดสดจาก PosSale (status PAID · memberId · paidAt ≥ now−12 เดือน · หัก void) + Appointment/MemberActivity (visits) + Customer.tierPoints/createdAt + MemberSubscription ACTIVE (paidPlan) · อัปเดตแคช Customer.spent12mSatang/visits12m ด้วย
//   applyTierChange(ctx, customerId, toTierDefId, reason, evidence, { byUserId?, ruleId?, approvalRequestId?, manualUntil?, tx? }) → history + Customer.tierDefId/tier(legacy sync)/tierSince/tierReviewAt + event member.tier.changed {customerId, from, to, reason} + hook onTierChanged (welcome voucher stub → M2.5)
//   evaluateAndApply(ctx, customerId) → { changed: boolean, from?, to? } (เลื่อนขึ้นทันทีเท่านั้น — ไม่ลด)
//   runTierReview(ctx, systemId, now, { dryRun?, customerIds? }) → { evaluated, upgraded[], kept[], atRisk[], downgraded[], notified[], skipped[] } — สมาชิกที่ tierReviewAt ≤ now (หรือ customerIds): keep ผ่าน → kept + tierReviewAt = รอบถัดไป · ไม่ผ่านครั้งแรก → atRisk (tierReviewAt = now + graceDays · event member.tier.at_risk {shortfall}) · ไม่ผ่านหลังผ่อนผัน → downgraded (RULE_DOWNGRADE) · แบบเสียเงินยัง ACTIVE / manualUntil > now → skipped · notifyBeforeDays: คนที่ tierReviewAt อยู่ใน (now, now+notifyBeforeDays] และกฎ keep ไม่ผ่าน → notified (at_risk 1 ครั้งต่อรอบ)
//   setManualTier(ctx, actor, customerId, { tierDefId, reason, until? }) → OWNER: apply MANUAL (evidence.manualUntil · tierReviewAt = until) · MANAGER: approval.submitForApproval({ entityType: "member.tier.manual", entityId: customerId }) → { pending: true, approvalRequestId } (ไม่มีนโยบาย = autoApproved ใช้ทันที · effect เมื่ออนุมัติที่ src/lib/approval-effects.ts) · STAFF: throw · reason ว่าง → throw
//   benefitsFor(ctx, customerId) → { tier{key,name}, discountPct, discountMaxSatang, discountFixedSatang, pointMultiplier, priorityBookingDays, freeServices[], noPointExpiry, cancelFeeDiscountPct, exclusiveItemIds[], welcomeVoucherTemplateId, birthdayGift } (เฉพาะ active)
//   facade member/index.ts: benefitsFor · evaluateAndApply · cron.ts รายวัน: runTierReview ทุกระบบ MEMBER · events member.tier.changed/at_risk ลง 3 ทะเบียน · เพดาน MEMBER_LIMITS.tiers = 10
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("src/lib/modules/member/tiers.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/member/tiers.ts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const mq = (await import("./member-qc-env.mts" as string)) as { MQC: Any; resolveMemberScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null>; dayFromToday: (n: number, h?: number) => Date };
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
let tid = ""; let SYS = "";
const tag = Date.now().toString(36);
const made = { customers: [] as string[], sales: [] as string[], tiers: [] as string[], rules: [] as string[], subs: [] as string[], approvalPolicies: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const T = (await import("@/lib/modules/member/tiers" as string)) as Record<string, (...a: Any[]) => Any>;
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const M = (await import("@/lib/modules/member" as string)) as Record<string, (...a: Any[]) => Any>;
  const pos = (await import("@/lib/modules/pos/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const U = { owner: E.users.owner.userId as string, manager: E.users.manager.userId as string, thana: E.users.staff.thana.userId as string };
  const owner = await actorOf(U.owner); const manager = await actorOf(U.manager); const thana = await actorOf(U.thana);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: U.owner }; const ctxM = { ...ctxO, actorUserId: U.manager }; const ctxT = { ...ctxO, actorUserId: U.thana };
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const units = E.units as Record<string, string>;
  const tierByKey = async (k: string) => P.memberTierDef.findFirst({ where: { systemId: SYS, key: k } });
  const outbox = (type: string, pred: (p: Any) => boolean) => P.outboxEvent.findMany({ where: { tenantId: tid, type }, orderBy: { createdAt: "desc" }, take: 30 }).then((rows: Any[]) => rows.find((r) => pred(r.payload)));
  const now = new Date();
  const since12 = new Date(now.getTime()); since12.setUTCMonth(since12.getUTCMonth() - 12);
  const sumSales = async (customerId: string) => Number((await prisma.posSale.aggregate({ where: { tenantId: tid, memberId: customerId, status: "PAID" as Any, paidAt: { gte: since12 } }, _sum: { grandTotalSatang: true } }))._sum.grandTotalSatang ?? 0);
  const mkSale = async (customerId: string, satang: number, key: string) => { const s = await pos.createSale({ tenantId: tid, unitId: units.patong, systemId: scope.systems.POS, pointSystemId: scope.systems.POINT, memberId: customerId, idempotencyKey: `qc19-${tag}-${key}`, lines: [{ name: "คอร์ส QC ระดับ", qty: 1, unitPriceSatang: satang }], payMethods: [{ type: "CASH", amountSatang: satang }] }); made.sales.push(s.saleId); return s; };
  const mkMember = async (key: string, extra: Record<string, unknown> = {}) => { const r = await PR.createMember(ctxO, owner, { phone: `0897${String(Date.now() % 1_000_000).padStart(6, "0")}`.slice(0, 10), firstName: `ระดับ${key}`, lastName: "ทดสอบ", source: "POS", homeUnitId: units.patong, ...extra }); made.customers.push(r.customerId); await new Promise((r2) => setTimeout(r2, 2)); return r.customerId as string; };

  // ═══ S1 evaluate ═══
  const defs: Any[] = await T.listTierDefs(ctxO, {});
  const gold = await tierByKey("gold"); const silver = await tierByKey("silver"); const platinum = await tierByKey("platinum"); const member = await tierByKey("member");
  const rulesGold = await T.getTierRules(ctxO, gold.id);
  chk("M1.9-S1.1", "listTierDefs → 4 ระดับเรียง sortOrder (member/silver/gold/platinum) · memberCount 30/15/10/5 · benefits[] · upgradeRuleId ของ silver/gold/platinum ชี้ AutomationRule scope MEMBER_TIER (จาก backfill) · getTierRules(gold).upgrade = {match ALL, conditions [{field spent12m, op gte, value 3000000}]} · keep null · graceDays 30 · notifyBeforeDays 30 · reviewCron '0 3 1 * *'", defs.length === 4 && defs.map((d) => d.key).join(",") === "member,silver,gold,platinum" && defs.map((d) => d.memberCount).join(",") === "30,15,10,5" && defs.every((d) => Array.isArray(d.benefits)) && ["silver", "gold", "platinum"].every((k) => !!defs.find((d) => d.key === k)?.upgradeRuleId) && rulesGold?.upgrade?.conditions?.[0]?.field === "spent12m" && rulesGold.upgrade.conditions[0].op === "gte" && rulesGold.upgrade.conditions[0].value === 3_000_000 && rulesGold.keep === null && rulesGold.graceDays === 30 && rulesGold.notifyBeforeDays === 30 && rulesGold.reviewCron === "0 3 1 * *", "4 ระดับ · กฎ", JSON.stringify({ keys: defs.map((d) => `${d.key}:${d.memberCount}`), rules: rulesGold }).slice(0, 240));
  const ev1 = await T.evaluateMember(ctxO, m(1).id, {});
  const exp1 = await sumSales(m(1).id);
  const c1 = (await prisma.customer.findUnique({ where: { id: m(1).id } })) as Any;
  const days1 = Math.floor((Date.now() - new Date(c1.createdAt).getTime()) / 86400_000);
  chk("M1.9-S1.2", "evaluateMember(สมาชิก 1 · MEMBER): current member · next silver · evidence.spent12m = Σ PosSale PAID 12 เดือน (จาก DB) · visits12m เป็นจำนวนเต็ม ≥ 0 · memberDays = วันตั้งแต่ createdAt (±1) · referrals 0 · paidPlan false · progressToNext {field spent12m, target 1,000,000, pct} · แคช Customer.spent12mSatang อัปเดตตรง", ev1?.current?.key === "member" && ev1.next?.key === "silver" && ev1.evidence?.spent12m === exp1 && Number.isInteger(ev1.evidence.visits12m) && Math.abs(ev1.evidence.memberDays - days1) <= 1 && ev1.evidence.referrals === 0 && ev1.evidence.paidPlan === false && ev1.progressToNext?.field === "spent12m" && ev1.progressToNext.target === 1_000_000 && typeof ev1.progressToNext.pct === "number" && Number(((await prisma.customer.findUnique({ where: { id: m(1).id } })) as Any).spent12mSatang) === exp1, "ครบ", JSON.stringify({ cur: ev1?.current?.key, next: ev1?.next?.key, spent: [ev1?.evidence?.spent12m, exp1], days: [ev1?.evidence?.memberDays, days1], prog: ev1?.progressToNext }).slice(0, 220));
  const X = await mkMember("X");
  await mkSale(X, 3_500_000, "x1");
  const evX = await T.evaluateMember(ctxO, X, {});
  chk("M1.9-S1.3", "สมาชิกใหม่ X ซื้อ 35,000 บาท → evaluate: wouldUpgradeTo = gold (ระดับสูงสุดที่ผ่าน · ไม่หยุดที่ silver) · wouldDowngradeTo null · current ยัง member (evaluate ไม่เขียนระดับ)", evX?.wouldUpgradeTo?.key === "gold" && evX.wouldDowngradeTo === null && evX.current?.key === "member" && ((await prisma.customer.findUnique({ where: { id: X } })) as Any).tierDefId === member.id, "gold", JSON.stringify({ up: evX?.wouldUpgradeTo, down: evX?.wouldDowngradeTo, cur: evX?.current }));
  const platRulesBefore = await T.getTierRules(ctxO, platinum.id);
  restore.push(() => T.setTierRules(ctxO, owner, platinum.id, { upgrade: platRulesBefore.upgrade, keep: platRulesBefore.keep }));
  await T.setTierRules(ctxO, owner, platinum.id, { upgrade: { match: "ANY", conditions: [{ field: "spent12m", op: "gte", value: 10_000_000 }, { field: "visits12m", op: "gte", value: 12 }, { field: "referrals", op: "gte", value: 5 }] } });
  const evAny = await T.evaluateMember(ctxO, X, { evidenceOverride: { visits12m: 12 } });
  await T.setTierRules(ctxO, owner, platinum.id, { upgrade: { match: "ALL", conditions: [{ field: "spent12m", op: "gte", value: 10_000_000 }, { field: "visits12m", op: "gte", value: 12 }] } });
  const evAll = await T.evaluateMember(ctxO, X, { evidenceOverride: { visits12m: 12 } });
  const evWin = await T.evaluateMember(ctxO, X, { evidenceOverride: { spentByWindow: { 3: 200_000 } } });
  await T.setTierRules(ctxO, owner, silver.id, { upgrade: { match: "ALL", conditions: [{ field: "spent", op: "gte", value: 100_000, windowMonths: 3 }] } });
  const evWin2 = await T.evaluateMember(ctxO, m(2).id, { evidenceOverride: { spentByWindow: { 3: 200_000 } } });
  const silverBefore = defs.find((d) => d.key === "silver");
  restore.push(() => T.setTierRules(ctxO, owner, silver.id, { upgrade: { match: "ALL", conditions: [{ field: "spent12m", op: "gte", value: mq.MQC.tierConfig.SILVER }] } }));
  chk("M1.9-S1.4", "match ANY: [spent ≥ 10M | visits12m ≥ 12 | referrals ≥ 5] + evidenceOverride {visits12m 12} → platinum · match ALL เดียวกัน → gold (platinum ไม่ผ่าน) · field 'spent' + windowMonths 3 (ยอด 3 เดือน) อ่าน evidence.spentByWindow[3] → silver ผ่านสำหรับสมาชิก 2 · setTierRules เขียน AutomationRule (conditions เก็บ field/op/value/windowMonths) + TierDef.upgradeRuleId เปลี่ยนตาม", evAny?.wouldUpgradeTo?.key === "platinum" && evAll?.wouldUpgradeTo?.key === "gold" && evWin2?.wouldUpgradeTo?.key === "silver" && (await prisma.automationRule.count({ where: { tenantId: tid, scope: "MEMBER_TIER", tierDefId: platinum.id } as Any })) >= 1 && JSON.stringify((await prisma.automationRule.findUnique({ where: { id: ((await tierByKey("silver")).upgradeRuleId) } }) as Any)?.conditions).includes("windowMonths") && !!silverBefore, "platinum/gold/silver", JSON.stringify({ any: evAny?.wouldUpgradeTo?.key, all: evAll?.wouldUpgradeTo?.key, win: evWin?.wouldUpgradeTo?.key, win2: evWin2?.wouldUpgradeTo?.key }));
  await T.setTierRules(ctxO, owner, platinum.id, { upgrade: { match: "ANY", conditions: [{ field: "memberDays", op: "gte", value: 365 }, { field: "tierPoints", op: "gte", value: 500 }, { field: "paidPlan", op: "eq", value: true }] } });
  const evDays = await T.evaluateMember(ctxO, X, { evidenceOverride: { memberDays: 400 } });
  await prisma.customer.update({ where: { id: X }, data: { tierPoints: 600 } as Any });
  const evPts = await T.evaluateMember(ctxO, X, {});
  await prisma.customer.update({ where: { id: X }, data: { tierPoints: 0 } as Any });
  const plan = await P.memberPlan.findFirst({ where: { tenantId: tid } }) ?? await P.memberPlan.create({ data: { tenantId: tid, systemId: SYS, name: "แพ็กเกจ QC", priceSatang: 100000, durationDays: 30 } }).catch(() => null);
  let evPlan: Any = null;
  if (plan) { const sub = await P.memberSubscription.create({ data: { tenantId: tid, systemId: SYS, customerId: X, planId: plan.id, status: "ACTIVE", startAt: new Date(Date.now() - 86400_000), endAt: new Date(Date.now() + 30 * 86400_000) } }); made.subs.push(sub.id); evPlan = await T.evaluateMember(ctxO, X, {}); await P.memberSubscription.update({ where: { id: sub.id }, data: { status: "EXPIRED" } }).catch(() => null); }
  const evNone = await T.evaluateMember(ctxO, X, {});
  chk("M1.9-S1.5", "เงื่อนไข memberDays ≥ 365 (override 400) → platinum · tierPoints ≥ 500 (Customer.tierPoints 600 จริง) → platinum · paidPlan (MemberSubscription ACTIVE จริง) → platinum + evidence.paidPlan true · ไม่มีเงื่อนไขไหนผ่าน → gold (จาก spent)", evDays?.wouldUpgradeTo?.key === "platinum" && evPts?.wouldUpgradeTo?.key === "platinum" && evPts.evidence.tierPoints === 600 && (!plan || (evPlan?.wouldUpgradeTo?.key === "platinum" && evPlan.evidence.paidPlan === true)) && evNone?.wouldUpgradeTo?.key === "gold", "platinum ×3 · gold", JSON.stringify({ days: evDays?.wouldUpgradeTo?.key, pts: evPts?.wouldUpgradeTo?.key, plan: plan ? evPlan?.wouldUpgradeTo?.key : "n/a", none: evNone?.wouldUpgradeTo?.key }));
  const eField = await fails(() => T.setTierRules(ctxO, owner, gold.id, { upgrade: { match: "ALL", conditions: [{ field: "moon", op: "gte", value: 1 }] } }));
  const eOp = await fails(() => T.setTierRules(ctxO, owner, gold.id, { upgrade: { match: "ALL", conditions: [{ field: "spent12m", op: "like", value: 1 }] } }));
  const eNeg = await fails(() => T.setTierRules(ctxO, owner, gold.id, { upgrade: { match: "ALL", conditions: [{ field: "spent12m", op: "gte", value: -5 }] } }));
  const eStaff = await fails(() => T.setTierRules(ctxT, thana, gold.id, { upgrade: null }));
  const lim = (await import("@/lib/modules/member/limits" as string)) as Any;
  const nT = await P.memberTierDef.count({ where: { systemId: SYS, archivedAt: null } });
  for (let i = nT; i < 10; i++) { const t = await T.createTierDef(ctxO, owner, { key: `qc19_${tag}_${i}`, name: `ระดับทดสอบ ${i}`, color: "BLUE" }); made.tiers.push(t.id); }
  const eCap = await fails(() => T.createTierDef(ctxO, owner, { key: `qc19_${tag}_over`, name: "เกิน", color: "BLUE" }));
  const eKey = await fails(() => T.createTierDef(ctxO, owner, { key: "Bad Key", name: "x", color: "BLUE" }));
  chk("M1.9-S1.6", "validate: field/op ไม่รู้จัก · value ติดลบ → throw ไทย · STAFF ตั้งกฎ (ไม่มี member.tier.manage) → throw · เพดาน MEMBER_LIMITS.tiers = 10 → ใบที่ 11 throw LIMIT_REACHED · key ผิดรูป → throw", thai(eField) && thai(eOp) && thai(eNeg) && thai(eStaff) && (lim.MEMBER_LIMITS ?? lim.default)?.tiers === 10 && thai(eCap) && /LIMIT_REACHED/.test(eCap?.message ?? "") && thai(eKey), "throw ทั้งหมด", `${[eField, eOp, eNeg, eStaff, eCap, eKey].map((e) => !!e).join("/")} cap=${eCap?.message?.slice(0, 50)}`);
  for (const id of made.tiers) await P.memberTierDef.delete({ where: { id } }); made.tiers = [];
  await T.setTierRules(ctxO, owner, platinum.id, { upgrade: platRulesBefore.upgrade, keep: platRulesBefore.keep });

  // ═══ S2 เลื่อนทันทีหลังขาย ═══
  const ap1 = await T.evaluateAndApply(ctxO, X);
  const cX = (await prisma.customer.findUnique({ where: { id: X } })) as Any;
  const hX: Any = await P.memberTierHistory.findFirst({ where: { customerId: X, reason: "RULE_UPGRADE" }, orderBy: { createdAt: "desc" } });
  const evUp = await outbox("member.tier.changed", (p) => p.customerId === X && p.reason === "RULE_UPGRADE");
  chk("M1.9-S2.1", "evaluateAndApply(X) → {changed true, from member, to gold} · Customer.tierDefId gold · tier (enum เดิม) = GOLD (sync legacy) · tierSince ใหม่ · tierReviewAt ตั้ง (รอบถัดไป) · TierHistory RULE_UPGRADE {fromTierDefId member · toTierDefId gold · ruleId = gold.upgradeRuleId · evidence.spent12m 3,500,000} · event member.tier.changed {from, to, reason}", ap1?.changed === true && ap1.from?.key === "member" && ap1.to?.key === "gold" && cX.tierDefId === gold.id && cX.tier === "GOLD" && !!cX.tierSince && new Date(cX.tierSince).getTime() > Date.now() - 60_000 && !!cX.tierReviewAt && hX?.fromTierDefId === member.id && hX.toTierDefId === gold.id && hX.ruleId === gold.upgradeRuleId && hX.evidence?.spent12m === 3_500_000 && !!evUp && evUp.payload.from === "member" && evUp.payload.to === "gold", "ครบ", JSON.stringify({ ap1, tier: cX?.tier, def: cX?.tierDefId === gold?.id, hist: hX && [hX.fromTierDefId === member.id, hX.ruleId === gold.upgradeRuleId, hX.evidence?.spent12m], ev: !!evUp }).slice(0, 240));
  const nH = await P.memberTierHistory.count({ where: { customerId: X } });
  const ap2 = await T.evaluateAndApply(ctxO, X);
  await prisma.posSale.updateMany({ where: { id: { in: made.sales } }, data: { status: "VOIDED" as Any } });
  const evVoid = await T.evaluateMember(ctxO, X, {});
  const ap3 = await T.evaluateAndApply(ctxO, X);
  await prisma.posSale.updateMany({ where: { id: { in: made.sales } }, data: { status: "PAID" as Any } });
  chk("M1.9-S2.2", "evaluateAndApply ซ้ำ → changed false · ไม่มี history เพิ่ม · บิล VOIDED → evaluate: spent12m 0 · wouldDowngradeTo = member (ต่ำกว่าถัดไปที่ผ่าน) · evaluateAndApply **ไม่ลดระดับ** (changed false · ยัง gold — ลดเฉพาะรอบประเมิน §11.3)", ap2?.changed === false && (await P.memberTierHistory.count({ where: { customerId: X } })) === nH && evVoid?.evidence?.spent12m === 0 && evVoid.wouldDowngradeTo?.key === "member" && ap3?.changed === false && ((await prisma.customer.findUnique({ where: { id: X } })) as Any).tierDefId === gold.id, "ไม่ลด", JSON.stringify({ ap2, spent: evVoid?.evidence?.spent12m, down: evVoid?.wouldDowngradeTo?.key, ap3 }));

  // ═══ S3 รอบประเมิน (runTierReview) ═══
  const goldRulesBefore = await T.getTierRules(ctxO, gold.id);
  restore.push(() => T.setTierRules(ctxO, owner, gold.id, { upgrade: goldRulesBefore.upgrade, keep: goldRulesBefore.keep, graceDays: goldRulesBefore.graceDays, notifyBeforeDays: goldRulesBefore.notifyBeforeDays }));
  await T.setTierRules(ctxO, owner, gold.id, { keep: { match: "ALL", conditions: [{ field: "spent12m", op: "gte", value: 3_000_000 }] }, graceDays: 30, notifyBeforeDays: 30 });
  await prisma.customer.update({ where: { id: X }, data: { tierReviewAt: new Date(Date.now() - 3600_000) } as Any });
  const hBefore = await P.memberTierHistory.count({ where: { customerId: X } });
  const dry1 = await T.runTierReview(ctxO, SYS, now, { dryRun: true, customerIds: [X] });
  chk("M1.9-S3.1", "runTierReview dryRun {customerIds:[X]}: X ผ่านกฎ keep (35,000 ≥ 30,000) → kept [X] · evaluated 1 · ไม่เขียน (history เท่าเดิม · tierReviewAt ยังเป็นอดีต)", dry1?.evaluated === 1 && dry1.kept?.some((k: Any) => (k.customerId ?? k) === X) && (await P.memberTierHistory.count({ where: { customerId: X } })) === hBefore && new Date(((await prisma.customer.findUnique({ where: { id: X } })) as Any).tierReviewAt).getTime() < Date.now(), "kept · ไม่เขียน", JSON.stringify({ dry1 }).slice(0, 200));
  await T.setTierRules(ctxO, owner, gold.id, { keep: { match: "ALL", conditions: [{ field: "spent12m", op: "gte", value: 99_000_000 }] } });
  const r1 = await T.runTierReview(ctxO, SYS, now, { customerIds: [X] });
  const cX2 = (await prisma.customer.findUnique({ where: { id: X } })) as Any;
  const evRisk = await outbox("member.tier.at_risk", (p) => p.customerId === X);
  chk("M1.9-S3.2", "กฎ keep ไม่ผ่านครั้งแรก → atRisk [X] · ยัง gold · tierReviewAt = now + graceDays (30 วัน ±1) · event member.tier.at_risk {customerId, tier gold, shortfall > 0} · history RULE_KEEP (evidence.atRisk true · notifiedAt) 1 แถว", r1?.atRisk?.some((k: Any) => (k.customerId ?? k) === X) && !r1.downgraded?.some((k: Any) => (k.customerId ?? k) === X) && cX2.tierDefId === gold.id && Math.abs(new Date(cX2.tierReviewAt).getTime() - (now.getTime() + 30 * 86400_000)) < 86400_000 && !!evRisk && evRisk.payload.tier === "gold" && evRisk.payload.shortfall > 0 && (await P.memberTierHistory.count({ where: { customerId: X, reason: "RULE_KEEP" } })) === 1, "atRisk", JSON.stringify({ r1: { atRisk: r1?.atRisk?.length, down: r1?.downgraded?.length }, tier: cX2?.tierDefId === gold?.id, review: cX2?.tierReviewAt, ev: evRisk?.payload }).slice(0, 220));
  const later = new Date(now.getTime() + 31 * 86400_000);
  const dry2 = await T.runTierReview(ctxO, SYS, later, { dryRun: true, customerIds: [X] });
  const r2 = await T.runTierReview(ctxO, SYS, later, { customerIds: [X] });
  const cX3 = (await prisma.customer.findUnique({ where: { id: X } })) as Any;
  const hDown: Any = await P.memberTierHistory.findFirst({ where: { customerId: X, reason: "RULE_DOWNGRADE" } });
  const evDown = await outbox("member.tier.changed", (p) => p.customerId === X && p.reason === "RULE_DOWNGRADE");
  chk("M1.9-S3.3", "หลังผ่อนผัน (now+31 วัน): dryRun → downgraded [X] แต่ไม่เขียน · รันจริง → downgraded [X] · tierDefId silver (ต่ำกว่าถัดไป) · tier SILVER · history RULE_DOWNGRADE {from gold, to silver, evidence} · event tier.changed reason RULE_DOWNGRADE · tierReviewAt ≥ later", dry2?.downgraded?.some((k: Any) => (k.customerId ?? k) === X) && r2?.downgraded?.some((k: Any) => (k.customerId ?? k) === X) && cX3.tierDefId === silver.id && cX3.tier === "SILVER" && hDown?.fromTierDefId === gold.id && hDown.toTierDefId === silver.id && !!evDown && new Date(cX3.tierReviewAt).getTime() >= later.getTime(), "silver", JSON.stringify({ dry: dry2?.downgraded?.length, r2: r2?.downgraded?.length, tier: cX3?.tier, def: cX3?.tierDefId === silver?.id, hist: !!hDown, ev: !!evDown }));
  const Y = await mkMember("Y");
  await T.applyTierChange(ctxO, Y, gold.id, "MANUAL", { note: "QC" }, { byUserId: U.owner });
  await prisma.customer.update({ where: { id: Y }, data: { tierReviewAt: new Date(now.getTime() + 20 * 86400_000) } as Any });
  const r3 = await T.runTierReview(ctxO, SYS, now, { customerIds: [Y] });
  const r3b = await T.runTierReview(ctxO, SYS, now, { customerIds: [Y] });
  const cY = (await prisma.customer.findUnique({ where: { id: Y } })) as Any;
  chk("M1.9-S3.4", "notifyBeforeDays 30: Y (gold · tierReviewAt อีก 20 วัน · ยอด 0 ไม่ผ่าน keep) → notified [Y] · event at_risk 1 ครั้ง · ยัง gold · tierReviewAt ไม่ขยับ · รันซ้ำวันเดียวกัน → ไม่แจ้งซ้ำ (notified ว่าง · event ยัง 1)", r3?.notified?.some((k: Any) => (k.customerId ?? k) === Y) && !r3b?.notified?.some((k: Any) => (k.customerId ?? k) === Y) && (await P.outboxEvent.count({ where: { tenantId: tid, type: "member.tier.at_risk", payload: { path: ["customerId"], equals: Y } } })) === 1 && cY.tierDefId === gold.id && Math.abs(new Date(cY.tierReviewAt).getTime() - (now.getTime() + 20 * 86400_000)) < 60_000, "แจ้ง 1 ครั้ง", JSON.stringify({ n1: r3?.notified?.length, n2: r3b?.notified?.length, ev: await P.outboxEvent.count({ where: { tenantId: tid, type: "member.tier.at_risk", payload: { path: ["customerId"], equals: Y } } }), tier: cY?.tierDefId === gold?.id }));
  let r4: Any = null;
  if (plan) { const sub = await P.memberSubscription.create({ data: { tenantId: tid, systemId: SYS, customerId: Y, planId: plan.id, status: "ACTIVE", startAt: new Date(Date.now() - 86400_000), endAt: new Date(Date.now() + 60 * 86400_000) } }); made.subs.push(sub.id); await prisma.customer.update({ where: { id: Y }, data: { tierReviewAt: new Date(now.getTime() - 3600_000) } as Any }); r4 = await T.runTierReview(ctxO, SYS, later, { customerIds: [Y] }); }
  const cY2 = (await prisma.customer.findUnique({ where: { id: Y } })) as Any;
  chk("M1.9-S3.5", "แบบเสียเงิน: Y มี MemberSubscription ACTIVE (endAt อนาคต) · tierReviewAt อดีต · keep ไม่ผ่าน → skipped [Y] (ห้ามลดระดับ §11.3) · ยัง gold", !plan || (r4?.skipped?.some((k: Any) => (k.customerId ?? k) === Y) && !r4.downgraded?.some((k: Any) => (k.customerId ?? k) === Y) && cY2.tierDefId === gold.id), "skipped", JSON.stringify({ plan: !!plan, skipped: r4?.skipped?.length, down: r4?.downgraded?.length, tier: cY2?.tierDefId === gold?.id }));
  const all = await T.runTierReview(ctxO, SYS, now, { dryRun: true });
  chk("M1.9-S3.6", "runTierReview ทั้งระบบ (dryRun · ไม่ส่ง customerIds) → evaluated = จำนวนสมาชิกที่ tierReviewAt ≤ now (ไม่แตะคนที่ยังไม่ถึงรอบ) · ผลรวม kept+atRisk+downgraded+skipped+upgraded ≤ evaluated · ไม่เขียน history (นับเท่าเดิม)", typeof all?.evaluated === "number" && all.evaluated === (await prisma.customer.count({ where: { memberSystemId: SYS, status: "ACTIVE" as Any, tierReviewAt: { lte: now } } as Any })) && (all.kept.length + all.atRisk.length + all.downgraded.length + all.skipped.length + (all.upgraded?.length ?? 0)) <= all.evaluated, "ตรง DB", JSON.stringify({ evaluated: all?.evaluated, db: await prisma.customer.count({ where: { memberSystemId: SYS, status: "ACTIVE" as Any, tierReviewAt: { lte: now } } as Any }) }));

  // ═══ S4 manual + approval ═══
  const eManStaff = await fails(() => T.setManualTier(ctxT, thana, X, { tierDefId: platinum.id, reason: "ลูกค้า VIP" }));
  const eNoReason = await fails(() => T.setManualTier(ctxO, owner, X, { tierDefId: platinum.id, reason: " " }));
  const until = new Date(now.getTime() + 90 * 86400_000);
  const man = await T.setManualTier(ctxO, owner, X, { tierDefId: platinum.id, reason: "ลูกค้า VIP ของเจ้าของ", until });
  const cX4 = (await prisma.customer.findUnique({ where: { id: X } })) as Any;
  const hMan: Any = await P.memberTierHistory.findFirst({ where: { customerId: X, reason: "MANUAL" }, orderBy: { createdAt: "desc" } });
  chk("M1.9-S4.1", "setManualTier: STAFF → throw · reason ว่าง → throw · OWNER → ใช้ทันที {applied true} · tierDefId platinum · tier PLATINUM · history MANUAL {byUserId owner · evidence.reason · evidence.manualUntil} · tierReviewAt = until", thai(eManStaff) && thai(eNoReason) && man?.applied === true && cX4.tierDefId === platinum.id && cX4.tier === "PLATINUM" && hMan?.byUserId === U.owner && hMan.evidence?.reason === "ลูกค้า VIP ของเจ้าของ" && !!hMan.evidence?.manualUntil && Math.abs(new Date(cX4.tierReviewAt).getTime() - until.getTime()) < 60_000, "MANUAL", JSON.stringify({ staff: !!eManStaff, reason: !!eNoReason, man, tier: cX4?.tier, hist: hMan && [hMan.byUserId === U.owner, hMan.evidence] }).slice(0, 220));
  const r5 = await T.runTierReview(ctxO, SYS, new Date(now.getTime() + 10 * 86400_000), { customerIds: [X] });
  const r6 = await T.runTierReview(ctxO, SYS, new Date(until.getTime() + 86400_000), { dryRun: true, customerIds: [X] });
  chk("M1.9-S4.2", "ล็อกมือ: รอบประเมินก่อน until → skipped [X] (ยัง platinum แม้กฎไม่ผ่าน) · หลัง until (dryRun) → ประเมินตามกฎ (downgraded หรือ atRisk มี X)", r5?.skipped?.some((k: Any) => (k.customerId ?? k) === X) && ((await prisma.customer.findUnique({ where: { id: X } })) as Any).tierDefId === platinum.id && (r6?.downgraded?.some((k: Any) => (k.customerId ?? k) === X) || r6?.atRisk?.some((k: Any) => (k.customerId ?? k) === X)), "skip → ประเมิน", JSON.stringify({ r5: r5?.skipped?.length, r6: { d: r6?.downgraded?.length, a: r6?.atRisk?.length } }));
  const approval = (await import("@/lib/modules/approval/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const apPol = await approval.createPolicy({ tenantId: tid }, { name: "QC M1.9 ตั้งระดับมือ", entityType: "member.tier.manual", steps: [{ order: 1, approverRole: "OWNER" }] });
  made.approvalPolicies.push(apPol.id);
  const manM = await fails(async () => { const r = await T.setManualTier(ctxM, manager, Y, { tierDefId: platinum.id, reason: "ขอเลื่อนให้ลูกค้า" }); if (!r?.pending || !r.approvalRequestId) throw new Error(`no-approval ${JSON.stringify(r)}`); });
  const cY3 = (await prisma.customer.findUnique({ where: { id: Y } })) as Any;
  chk("M1.9-S4.3", "MANAGER ตั้งระดับมือ → {pending true, approvalRequestId} (submitForApproval entityType member.tier.manual · entityId customerId · ApprovalRequest PENDING) · ยังไม่ใช้ (Y ยัง gold) · ไม่มีนโยบาย = autoApproved ใช้ทันที", manM === null && (await prisma.approvalRequest.count({ where: { tenantId: tid, entityType: "member.tier.manual", status: "PENDING" as Any } })) >= 1 && cY3.tierDefId === gold.id, "pending", `${manM?.message?.slice(0, 80) ?? "pending ok"} tier=${cY3?.tierDefId === gold?.id}`);
  const ghost = await fails(() => T.setManualTier(ctxO, owner, X, { tierDefId: "ไม่มี", reason: "x" }));
  const eSame = await fails(() => T.setManualTier(ctxO, owner, X, { tierDefId: platinum.id, reason: "ซ้ำระดับเดิม" }));
  chk("M1.9-S4.4", "tierDefId ไม่มี/ของระบบอื่น → throw ไทย · ตั้งระดับเดิมซ้ำ → throw หรือ {applied false} (ไม่เขียน history เพิ่ม)", thai(ghost) && (eSame !== null || (await P.memberTierHistory.count({ where: { customerId: X, reason: "MANUAL" } })) === 1), "throw", `${!!ghost} same=${eSame?.message?.slice(0, 40) ?? "no-throw"} hist=${await P.memberTierHistory.count({ where: { customerId: X, reason: "MANUAL" } })}`);

  // ═══ S5 archive ═══
  const tmpTier = await T.createTierDef(ctxO, owner, { key: `qc19_${tag}_arch`, name: "ระดับชั่วคราว", color: "PURPLE", legacyTier: "GOLD" });
  made.tiers.push(tmpTier.id);
  const Z = await mkMember("Z");
  await T.applyTierChange(ctxO, Z, tmpTier.id, "MANUAL", { note: "QC archive" }, { byUserId: U.owner });
  const eNoMove = await fails(() => T.archiveTierDef(ctxO, owner, tmpTier.id, {}));
  const eDef = await fails(() => T.archiveTierDef(ctxO, owner, member.id, { moveToTierId: silver.id }));
  await T.archiveTierDef(ctxO, owner, tmpTier.id, { moveToTierId: silver.id });
  const cZ = (await prisma.customer.findUnique({ where: { id: Z } })) as Any;
  const listA: Any[] = await T.listTierDefs(ctxO, {}); const listB: Any[] = await T.listTierDefs(ctxO, { includeArchived: true });
  chk("M1.9-S5.1", "archiveTierDef: ไม่ส่ง moveToTierId → throw · archive ระดับปริยาย → throw · archive ระดับชั่วคราว (มีคน 1) → สมาชิกย้ายไป silver + history (fromTierDefId ชั่วคราว → silver) + tier SILVER · archivedAt ตั้ง · listTierDefs ซ่อน (เห็นเมื่อ includeArchived)", thai(eNoMove) && thai(eDef) && cZ.tierDefId === silver.id && cZ.tier === "SILVER" && (await P.memberTierHistory.count({ where: { customerId: Z, fromTierDefId: tmpTier.id, toTierDefId: silver.id } })) === 1 && !!((await P.memberTierDef.findUnique({ where: { id: tmpTier.id } })) as Any).archivedAt && !listA.some((t) => t.id === tmpTier.id) && listB.some((t) => t.id === tmpTier.id), "ย้าย + ซ่อน", JSON.stringify({ noMove: !!eNoMove, def: !!eDef, z: cZ?.tier, hidden: !listA.some((t) => t.id === tmpTier.id) }));
  const eKeyDup = await fails(() => T.createTierDef(ctxO, owner, { key: `qc19_${tag}_arch`, name: "ซ้ำ", color: "BLUE" }));
  const eApplyArch = await fails(() => T.applyTierChange(ctxO, Z, tmpTier.id, "MANUAL", {}, { byUserId: U.owner }));
  chk("M1.9-S5.2", "key ซ้ำกับระดับที่ archive แล้ว → throw · applyTierChange ไปยังระดับที่ archive → throw · reorderTierDefs(ids) → sortOrder ใหม่ (สลับ silver/gold แล้วสลับกลับ)", thai(eKeyDup) && thai(eApplyArch) && (await (async () => { const ids = listA.map((t) => t.id); const i1 = ids.indexOf(silver.id), i2 = ids.indexOf(gold.id); const sw = [...ids]; sw[i1] = gold.id; sw[i2] = silver.id; await T.reorderTierDefs(ctxO, owner, sw); const after = (await T.listTierDefs(ctxO, {})).map((t: Any) => t.id); const ok = after.indexOf(gold.id) === i1 && after.indexOf(silver.id) === i2; await T.reorderTierDefs(ctxO, owner, ids); return ok; })()), "throw ×2 · reorder", `${!!eKeyDup}/${!!eApplyArch}`);

  // ═══ S6 benefits ═══
  const bBefore: Any[] = await P.memberTierBenefit.findMany({ where: { tierDefId: gold.id } });
  restore.push(async () => { await P.memberTierBenefit.deleteMany({ where: { tierDefId: gold.id } }); for (const b of bBefore) await P.memberTierBenefit.create({ data: { tenantId: b.tenantId, tierDefId: b.tierDefId, type: b.type, config: b.config, active: b.active } }); });
  const set = await T.setBenefits(ctxO, owner, gold.id, [{ type: "DISCOUNT_PCT", config: { pct: 5, maxSatang: 50_000 } }, { type: "POINT_MULTIPLIER", config: { x: 1.5 } }, { type: "PRIORITY_BOOKING", config: { daysAhead: 7 } }, { type: "NO_POINT_EXPIRY", config: {}, active: false }]);
  const eBadType = await fails(() => T.setBenefits(ctxO, owner, gold.id, [{ type: "FREE_COFFEE", config: {} }]));
  const eBadCfg = await fails(() => T.setBenefits(ctxO, owner, gold.id, [{ type: "DISCOUNT_PCT", config: { pct: 150 } }]));
  const eStaffB = await fails(() => T.setBenefits(ctxT, thana, gold.id, []));
  chk("M1.9-S6.1", "setBenefits(gold, 4 รายการ) → แทนที่ทั้งชุด (4 แถว · active ตามที่ส่ง · ปริยาย true) · type นอก enum → throw ไทย · config ผิด (pct 150) → throw · STAFF → throw", Array.isArray(set) && set.length === 4 && (await P.memberTierBenefit.count({ where: { tierDefId: gold.id } })) === 4 && (await P.memberTierBenefit.count({ where: { tierDefId: gold.id, active: false } })) === 1 && thai(eBadType) && thai(eBadCfg) && thai(eStaffB), "4 · throw ×3", `${set?.length} · ${[eBadType, eBadCfg, eStaffB].map((e) => !!e).join("/")}`);
  await T.applyTierChange(ctxO, Y, gold.id, "MANUAL", {}, { byUserId: U.owner }).catch(() => null);
  const bf = await T.benefitsFor(ctxO, Y);
  const bfDefault = await T.benefitsFor(ctxO, m(1).id);
  chk("M1.9-S6.2", "benefitsFor(Y · gold) → {tier{key gold}, discountPct 5, discountMaxSatang 50000, pointMultiplier 1.5, priorityBookingDays 7, noPointExpiry false (inactive ไม่นับ), freeServices [], exclusiveItemIds []} · สมาชิกระดับปริยาย → discountPct 0 · pointMultiplier 1 · priorityBookingDays 0", bf?.tier?.key === "gold" && bf.discountPct === 5 && bf.discountMaxSatang === 50_000 && bf.pointMultiplier === 1.5 && bf.priorityBookingDays === 7 && bf.noPointExpiry === false && Array.isArray(bf.freeServices) && Array.isArray(bf.exclusiveItemIds) && bfDefault?.discountPct === 0 && bfDefault.pointMultiplier === 1 && bfDefault.priorityBookingDays === 0, "ครบ", JSON.stringify({ bf, def: bfDefault }).slice(0, 240));
  const facade = read("src/lib/modules/member/index.ts"); const src = read("src/lib/modules/member/tiers.ts");
  chk("M1.9-S6.3", "facade member/index.ts export benefitsFor + evaluateAndApply + runTierReview · tiers.ts ไม่ import โมดูลอื่นตรง (pos/booking/subscription อ่าน prisma ตรงเฉพาะ evidence พร้อมคอมเมนต์ · ห้าม @/lib/modules/(pos|booking|chat|kanban)) · ไม่มี any", /\bbenefitsFor\b/.test(facade) && /\bevaluateAndApply\b/.test(facade) && /\brunTierReview\b/.test(facade) && !/@\/lib\/modules\/(pos|booking|chat|kanban|account)\//.test(src) && !/\bany\b/.test(src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), "สะอาด", `facade=${[/\bbenefitsFor\b/, /\bevaluateAndApply\b/, /\brunTierReview\b/].map((r) => r.test(facade)).join("/")} cross=${/@\/lib\/modules\/(pos|booking|chat|kanban|account)\//.test(src)}`, "MAJOR");

  // ═══ S7 events / cron / legacy sync ═══
  const consumers = read("src/lib/outbox-consumers.ts");
  const A2 = (await import("@/lib/automation/labels" as string)) as Any; const W2 = (await import("@/lib/webhooks/labels" as string)) as Any;
  const EVENTS = ["member.tier.changed", "member.tier.at_risk"];
  chk("M1.9-S7.1", "member.tier.changed / member.tier.at_risk ลง 3 ทะเบียน (consumer · AUTOMATION_EVENTS ป้ายไทย · WEBHOOK_EVENTS 1 ครั้ง)", EVENTS.every((e) => new RegExp(`"${e.replace(/\./g, "\\.")}":`).test(consumers) && A2.AUTOMATION_EVENTS.some((x: Any) => x.value === e && /[ก-๙]/.test(x.label)) && W2.WEBHOOK_EVENTS.filter((x: Any) => x.value === e).length === 1), "ครบ", EVENTS.map((e) => `${e}:${new RegExp(`"${e.replace(/\./g, "\\.")}":`).test(consumers)}/${A2.AUTOMATION_EVENTS.some((x: Any) => x.value === e)}/${W2.WEBHOOK_EVENTS.filter((x: Any) => x.value === e).length}`).join(" "));
  const cron = read("src/lib/platform/cron.ts");
  const { drainOutbox } = await import("@/lib/core/outbox");
  const { consumers: C } = (await import("@/lib/outbox-consumers" as string)) as Any;
  await drainOutbox(C, { limit: 200 });
  const stuck = await P.outboxEvent.count({ where: { tenantId: tid, type: { startsWith: "member.tier" }, status: { not: "DONE" } } });
  chk("M1.9-S7.2", "cron.ts runDailyCron เรียก runTierReview ทุกระบบ MEMBER (ผลนับ tierReviews ใน summary · try/catch แยก) · drainOutbox → event member.tier.* DONE ทั้งหมด (consumer ไม่ล้ม)", /runTierReview/.test(cron) && /tierReviews/.test(cron) && stuck === 0, "cron + DONE", `cron=${/runTierReview/.test(cron)} stuck=${stuck}`);
  const legacyOk = (await prisma.$queryRawUnsafe(`select count(*)::int as n from "Customer" c join "MemberTierDef" t on t.id = c."tierDefId" where c."memberSystemId" = '${SYS}' and c.tier <> t."legacyTier"`) as Any[])[0]?.n === 0;
  chk("M1.9-S7.3", "legacy sync: ทุกสมาชิกในระบบ Customer.tier (enum เดิม) = tierDef.legacyTier (โค้ดเก่า marketing/rules ยังอ่านได้) · MemberTierConfig เดิม 3 แถวไม่ถูกแตะ", legacyOk && (await P.memberTierConfig.count({ where: { tenantId: tid } })) === 3, "ตรงทุกคน", `legacy=${legacyOk}`);
} catch (e) {
  console.error("💥", e);
  chk("M1.9-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  for (const id of made.subs) await d(() => P.memberSubscription.delete({ where: { id } }));
  for (const id of made.approvalPolicies) { await d(() => prisma.approvalRequest.deleteMany({ where: { policyId: id } })); await d(() => P.approvalStep.deleteMany({ where: { policyId: id } })); await d(() => P.approvalPolicy.delete({ where: { id } })); }
  if (made.sales.length) { for (const mdl of ["posSaleLine", "posPayment"]) await d(() => P[mdl].deleteMany({ where: { saleId: { in: made.sales } } })); await d(() => prisma.pointLedger.deleteMany({ where: { tenantId: tid, refId: { in: made.sales } } })); await d(() => prisma.posSale.deleteMany({ where: { id: { in: made.sales } } })); }
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberFieldValueHistory", "memberChannelIdentity", "memberAccessLog", "memberActivity", "pointLedger", "pointBalance"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } }));
  }
  for (const id of made.tiers) { await d(() => P.memberTierBenefit.deleteMany({ where: { tierDefId: id } })); await d(() => prisma.automationRule.deleteMany({ where: { tenantId: tid, tierDefId: id } as Any })); await d(() => P.memberTierDef.delete({ where: { id } })); }
  await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: "member." }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M1.9: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
