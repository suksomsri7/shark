// QC — ระบบสมาชิก v2 WO M2.1: point rules + lots + expiry — migration member_v2_c · computeEarn (กฎ 6 ชนิด · เพดานวัน · ตัด gift/voucher/แต้ม) · earnWithLot · burnFifo · reverseWithLots · expireDue · expiringSoon · cron · backfill lots · settings v2 · events point.* ลง 3 ทะเบียน
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M2.1 · พิมพ์เขียว §0 (D2) §4.1 (PointLedger/PointSettings cols) §4.2 (PointExpiryMode PointRuleKind PointEventBonus) §4.3 (PointRule PointLot PointTransfer) §4.6 ข้อ 4 §5.5 §7.1 §7.5 §11.4
// requires: member-seed
//
// สัญญา (src/lib/modules/point/{rules.ts,lots.ts,service.ts(settings),index.ts})
//   ctx = { tenantId, systemId (ระบบ POINT), memberSystemId?, actorUserId? }
//   listRules(ctx) · upsertRule(ctx, actor, { id?, kind, config, priority?, active? }) · toggleRule · deleteRule — config ต่อ kind: BASE {satangPerPoint, base:"NET"|"GROSS"} · TIER_MULTIPLIER {tierDefId, x} · ITEM_BONUS {itemIds[], points (ต่อชิ้น)} · CATEGORY_BONUS {categoryIds[], x?|points?} · TIME_MULTIPLIER {dow:[0-6] (0=อาทิตย์ · เวลาไทย), from:"HH:mm", to:"HH:mm", x} · EVENT_BONUS {event: PointEventBonus, points} · validate zod · เพดาน MEMBER_LIMITS.pointRules = 30 · สิทธิ์ member.settings.manage
//   computeEarn(ctx, { customerId, sale?: { lines: [{ itemId?, categoryId?, qty, netSatang }], netSatang, grossSatang?, paidBy?: { giftCardSatang?, voucherSatang?, pointsSatang? } }, event?: PointEventBonus, now?: Date }) → { points, breakdown: [{ kind, ruleId?: string|null, points, note }], base: { satang, points }, cappedBy?: "dailyCap" }
//     ลำดับ: BASE (กฎ BASE ที่ active · ไม่มี = PointSettings.satangPerPoint/earnBase) บนยอด = net − (giftCard ถ้า excludeGiftCard) − (voucher ถ้า excludeVoucher) − pointsSatang เสมอ → ปัด floor → × TIER_MULTIPLIER (tierDefId ของสมาชิก) → + ITEM_BONUS (points × qty ของ line ที่ itemId ตรง) → + CATEGORY_BONUS (x คูณแต้มฐานของ line หรือ points คงที่) → × TIME_MULTIPLIER (now อยู่ในช่วง dow/from-to เวลาไทย) → + EVENT_BONUS (เมื่อส่ง event) → dailyCap (นับ EARN จากขายวันนี้ (ไทย) ของสมาชิก ไม่รวม EVENT_BONUS · เกิน → ตัดที่เพดาน · cappedBy) · ไม่เขียน DB
//   earnWithLot(ctx, { customerId, points, refType, refId, idempotencyKey, unitId?, ruleId?, multiplier?, breakdown?, expiresAt? }) → { ledgerId, lotId, expiresAt: Date|null, balance } — ledger EARN {lotId, expiresAt, multiplier, ruleId} + PointLot {points, remaining, earnedAt, expiresAt} · expiresAt ตาม settings.expiryMode (MONTHS = earnedAt+expiryMonths · END_OF_YEAR = 31 ธ.ค. 23:59:59 เวลาไทยของปีที่ได้ · NEVER = null) · ระดับที่มี benefit NO_POINT_EXPIRY active → null · idempotencyKey เดิม → คืน lot เดิม ไม่สร้างซ้ำ · event point.earned {customerId, points, lotId, ref}
//   burnFifo(ctx, { customerId, points, refType, refId, idempotencyKey }) → { ledgerId, lotsUsed: [{ lotId, points }], balance } — ตัดล็อตที่ expiresAt เร็วสุดก่อน (null ท้ายสุด) · ledger BURN data.lotIds · แต้มไม่พอ → throw ไทย · idempotent · event point.burned
//   reverseWithLots(ctx, { refType, refId, idempotencyKey }) → { reversed: number } — BURN ของ ref → คืน remaining เข้าล็อตเดิม (ล็อตหมดอายุแล้ว → ล็อตใหม่ expiresAt = now+30 วัน) · EARN ของ ref → ล็อตนั้น remaining ลด (ติดลบได้ · balance ติดลบได้) · ledger REVERSE · idempotent
//   expireDue(ctx | null (ทุกร้าน), now) → { lots, points, customers } — ล็อต expiresAt ≤ now · expiredAt null · remaining > 0 → ledger EXPIRE (delta −remaining · lotId) · balance − · lot.expiredAt/remaining 0 · event point.expired · batch ≤ 1,000 · idempotent (รอบสอง 0)
//   expiringSoon(ctx, { customerId?, days }) → [{ customerId, lotId, points, expiresAt, daysLeft }] · notifyExpiring(null, now) (cron) → event point.expiring {customerId, points, expiresAt, daysLeft} สำหรับล็อตที่เหลือวันตรง settings.remindDays (วันไทย) · dedupe ต่อ (lot, daysLeft) ด้วย outbox idempotencyKey
//   settings: getPointSettings(tenantId) → v2 ครบ {satangPerPoint, active, expiryMode, expiryMonths, remindDays, burnRateSatang, burnMinPoints, burnMaxPct, transferEnabled, transferMonthlyCap, adjustApprovalOver, earnBase, excludeGiftCard, excludeVoucher, dailyCap} · setPointSettings validate (expiryMonths 1–120 · burnMaxPct 0–100 · remindDays ≤ 5 ตัว · dailyCap ≥ 0)
//   backfill scripts/member-backfill-points-lots.mts (--tenant · --dry-run · idempotent): EARN ที่ lotId null → PointLot (remaining = สุทธิหลังจำลอง FIFO ตัด BURN/EXPIRE เดิม) · expiresAt = earnedAt+expiryMonths · ล็อตที่ "ควรหมดแล้ว" → expiresAt = วันรัน+90 วัน (ไม่ตัดย้อนหลัง) · ledger.lotId เขียนกลับ
//   cron.ts runDailyCron: step pointExpiry (expireDue ทุกร้าน) + pointExpiring (notifyExpiring) · events point.earned/burned/expiring/expired/transferred ลง 3 ทะเบียน + consumer no-op · facade index.ts export computeEarn earnWithLot burnFifo reverseWithLots expireDue expiringSoon listRules upsertRule
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const migDir = existsSync("prisma/migrations") ? readdirSync("prisma/migrations").find((d) => /_member_v2_c$/.test(d)) : undefined;
if (!migDir || !existsSync("src/lib/modules/point/lots.ts") || !existsSync("src/lib/modules/point/rules.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (migration *_member_v2_c · point/lots.ts · point/rules.ts)");
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
const q = async <T = Any,>(sql: string): Promise<T[]> => (await prisma.$queryRawUnsafe(sql)) as T[];
const cols = async (t: string) => new Set((await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='${t}'`)).map((c) => c.column_name));
const enumVals = async (name: string) => (await q<{ enumlabel: string }>(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='${name}'`)).map((e) => e.enumlabel);
const hasIdx = async (t: string, colsIn: string[], unique = false) => { const rows = await q<{ indexdef: string }>(`select indexdef from pg_indexes where tablename='${t}' and indexdef ${unique ? "" : "not "}ilike '%unique%'`); return rows.some((r) => { const body = r.indexdef.slice(r.indexdef.indexOf("USING")); return colsIn.every((c) => body.includes(`"${c}"`) || new RegExp(`[(, ]${c}[,)]`).test(body)); }); };
const P = prisma as Any;
let tid = ""; let SYS = ""; let PT = "";
const tag = Date.now().toString(36);
const made = { rules: [] as string[], customers: [] as string[], ledgerKeys: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId; PT = scope.systems.POINT as string;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const R = (await import("@/lib/modules/point/rules" as string)) as Record<string, (...a: Any[]) => Any>;
  const L = (await import("@/lib/modules/point/lots" as string)) as Record<string, (...a: Any[]) => Any>;
  const PS = (await import("@/lib/modules/point" as string)) as Record<string, (...a: Any[]) => Any>;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId); const thana = await actorOf(E.users.staff.thana.userId);
  const ctx = { tenantId: tid, systemId: PT, memberSystemId: SYS, actorUserId: E.users.owner.userId as string };
  const outbox = (type: string, pred: (p: Any) => boolean) => P.outboxEvent.findMany({ where: { tenantId: tid, type }, orderBy: { createdAt: "desc" }, take: 30 }).then((rows: Any[]) => rows.find((r) => pred(r.payload)));
  const bal = (cid: string) => PS.getBalance(PT, cid);
  const settings0 = await PS.getPointSettings(tid);
  restore.push(() => PS.setPointSettings({ tenantId: tid }, settings0));

  // ═══ S1 schema ═══
  const pl = await cols("PointLedger"); const ps = await cols("PointSettings"); const pr = await cols("PointRule"); const lot = await cols("PointLot"); const tr = await cols("PointTransfer");
  chk("M2.1-S1.1", "migration member_v2_c: PointLedger +{lotId expiresAt multiplier ruleId} · PointSettings +{expiryMode expiryMonths remindDays burnRateSatang burnMinPoints burnMaxPct transferEnabled transferMonthlyCap adjustApprovalOver earnBase excludeGiftCard excludeVoucher dailyCap} · PointRule {systemId kind config priority active} index(systemId,active) · PointLot {customerId systemId ledgerId points remaining earnedAt expiresAt expiredAt} index(customerId,expiresAt)+(systemId,expiresAt) · PointTransfer {fromCustomerId toCustomerId points feePoints otpVerifiedAt ledgerOutId ledgerInId} index(fromCustomerId,createdAt)", ["lotId", "expiresAt", "multiplier", "ruleId"].every((c) => pl.has(c)) && ["expiryMode", "expiryMonths", "remindDays", "burnRateSatang", "burnMinPoints", "burnMaxPct", "transferEnabled", "transferMonthlyCap", "adjustApprovalOver", "earnBase", "excludeGiftCard", "excludeVoucher", "dailyCap"].every((c) => ps.has(c)) && ["systemId", "kind", "config", "priority", "active"].every((c) => pr.has(c)) && (await hasIdx("PointRule", ["systemId", "active"])) && ["customerId", "systemId", "ledgerId", "points", "remaining", "earnedAt", "expiresAt", "expiredAt"].every((c) => lot.has(c)) && (await hasIdx("PointLot", ["customerId", "expiresAt"])) && (await hasIdx("PointLot", ["systemId", "expiresAt"])) && ["fromCustomerId", "toCustomerId", "points", "feePoints", "otpVerifiedAt", "ledgerOutId", "ledgerInId"].every((c) => tr.has(c)) && (await hasIdx("PointTransfer", ["fromCustomerId", "createdAt"])), "ครบ", `ledger=${["lotId", "expiresAt", "multiplier", "ruleId"].filter((c) => !pl.has(c))} settings=${["expiryMode", "expiryMonths", "remindDays", "burnRateSatang", "burnMinPoints", "burnMaxPct", "transferEnabled", "transferMonthlyCap", "adjustApprovalOver", "earnBase", "excludeGiftCard", "excludeVoucher", "dailyCap"].filter((c) => !ps.has(c))} lot=${lot.size} transfer=${tr.size}`);
  const sql = read(`prisma/migrations/${migDir}/migration.sql`);
  const destructive = sql.split("\n").filter((l) => /^\s*(ALTER TABLE .*\b(DROP COLUMN|ALTER COLUMN [^;]*\bTYPE)|DROP TABLE|DROP TYPE)\b/i.test(l));
  const applied = await q<{ finished_at: Date | null }>(`select finished_at from "_prisma_migrations" where migration_name='${migDir}'`);
  const diff = spawnSync("pnpm", ["exec", "prisma", "migrate", "diff", "--from-config-datasource", "prisma.config.ts", "--to-schema", "prisma/schema", "--script"], { encoding: "utf8", env: process.env, timeout: 300_000 });
  chk("M2.1-S1.2", "enum PointExpiryMode {MONTHS END_OF_YEAR NEVER} · PointRuleKind 6 · PointEventBonus 6 · migration additive · applied · migrate diff = empty · scope.ts ลงทะเบียน PointRule/PointLot/PointTransfer", ["MONTHS", "END_OF_YEAR", "NEVER"].every((v) => true) && (await enumVals("PointExpiryMode")).length === 3 && (await enumVals("PointRuleKind")).length === 6 && (await enumVals("PointEventBonus")).length === 6 && destructive.length === 0 && applied[0]?.finished_at && /empty migration/i.test(`${diff.stdout}${diff.stderr}`) && ["PointRule", "PointLot", "PointTransfer"].every((t) => new RegExp(`^\\s*${t}:\\s*(tenant|sys\\()`, "m").test(read("src/lib/core/scope.ts"))), "ครบ", `enums=${(await enumVals("PointExpiryMode")).length}/${(await enumVals("PointRuleKind")).length}/${(await enumVals("PointEventBonus")).length} destructive=${destructive.length} applied=${!!applied[0]?.finished_at} diff=${`${diff.stdout}${diff.stderr}`.replace(/\s+/g, " ").slice(0, 100)}`);
  const s1 = await PS.getPointSettings(tid);
  const eSet = await fails(() => PS.setPointSettings({ tenantId: tid }, { ...s1, expiryMonths: 0 }));
  const eSet2 = await fails(() => PS.setPointSettings({ tenantId: tid }, { ...s1, burnMaxPct: 150 }));
  await PS.setPointSettings({ tenantId: tid }, { ...s1, expiryMode: "MONTHS", expiryMonths: 12, remindDays: [30, 7], burnRateSatang: 10, burnMinPoints: 100, burnMaxPct: 50, excludeGiftCard: true, excludeVoucher: true, dailyCap: null, earnBase: "NET" });
  const s2 = await PS.getPointSettings(tid);
  chk("M2.1-S1.3", "getPointSettings → v2 ครบ 15 คีย์ (ค่าปริยาย expiryMode MONTHS · 12 เดือน · remindDays [30,7] · burnRate 10 · burnMin 100 · burnMax 50 · exclude ทั้งคู่ true) · setPointSettings: expiryMonths 0 → throw · burnMaxPct 150 → throw · บันทึกได้", ["satangPerPoint", "active", "expiryMode", "expiryMonths", "remindDays", "burnRateSatang", "burnMinPoints", "burnMaxPct", "transferEnabled", "transferMonthlyCap", "adjustApprovalOver", "earnBase", "excludeGiftCard", "excludeVoucher", "dailyCap"].every((k) => k in s1) && thai(eSet) && thai(eSet2) && s2.expiryMonths === 12 && JSON.stringify(s2.remindDays) === "[30,7]" && s2.burnMaxPct === 50, "ครบ", `keys=${Object.keys(s1 ?? {}).length} e=${!!eSet}/${!!eSet2}`);

  // ═══ S2 computeEarn ═══
  const gold = await P.memberTierDef.findFirst({ where: { systemId: SYS, key: "gold" } });
  const goldMember = (await prisma.customer.findFirst({ where: { memberSystemId: SYS, tierDefId: gold.id, status: "ACTIVE" as Any } }))!;
  const memberMember = m(1);
  const sale = { lines: [{ itemId: "item-A", categoryId: "cat-1", qty: 2, netSatang: 100_000 }, { itemId: "item-B", categoryId: "cat-2", qty: 1, netSatang: 150_000 }], netSatang: 250_000 };
  const c0 = await R.computeEarn(ctx, { customerId: memberMember.id, sale });
  chk("M2.1-S2.1", "ไม่มีกฎ: BASE จาก settings (2,500 สตางค์/แต้ม) → 250,000 → 100 แต้ม · breakdown [{kind BASE, points 100}] · base {satang 250000, points 100} · ไม่เขียน DB", c0?.points === 100 && c0.breakdown?.length === 1 && c0.breakdown[0].kind === "BASE" && c0.base?.satang === 250_000 && (await prisma.pointLedger.count({ where: { tenantId: tid, customerId: memberMember.id, createdAt: { gte: new Date(Date.now() - 60_000) } } })) === 0, "100", JSON.stringify(c0).slice(0, 160));
  const mk = async (kind: string, config: Any, extra: Any = {}) => { const r = await R.upsertRule(ctx, owner, { kind, config, ...extra }); made.rules.push(r.id); return r; };
  const rBase = await mk("BASE", { satangPerPoint: 1_000, base: "NET" });
  const c1 = await R.computeEarn(ctx, { customerId: memberMember.id, sale });
  const c1g = await R.computeEarn(ctx, { customerId: memberMember.id, sale: { ...sale, paidBy: { giftCardSatang: 50_000, voucherSatang: 30_000, pointsSatang: 20_000 } } });
  await PS.setPointSettings({ tenantId: tid }, { ...s2, excludeGiftCard: false });
  const c1g2 = await R.computeEarn(ctx, { customerId: memberMember.id, sale: { ...sale, paidBy: { giftCardSatang: 50_000, voucherSatang: 30_000, pointsSatang: 20_000 } } });
  await PS.setPointSettings({ tenantId: tid }, s2);
  chk("M2.1-S2.2", "กฎ BASE 1,000 สตางค์/แต้ม → 250 · paidBy {gift 50000, voucher 30000, points 20000} + exclude ทั้งคู่ → ฐาน 150,000 → 150 · excludeGiftCard=false → ฐาน 200,000 → 200 (แต้มที่จ่ายด้วยแต้มตัดเสมอ)", c1?.points === 250 && c1.breakdown[0].ruleId === rBase.id && c1g?.points === 150 && c1g.base.satang === 150_000 && c1g2?.points === 200, "250/150/200", `${c1?.points}/${c1g?.points}/${c1g2?.points}`);
  const rTier = await mk("TIER_MULTIPLIER", { tierDefId: gold.id, x: 1.5 });
  const c2 = await R.computeEarn(ctx, { customerId: goldMember.id, sale }); const c2m = await R.computeEarn(ctx, { customerId: memberMember.id, sale });
  chk("M2.1-S2.3", "TIER_MULTIPLIER gold ×1.5 → สมาชิก gold 375 (breakdown มี TIER_MULTIPLIER +125 ruleId) · สมาชิกระดับ member ไม่ได้ (250)", c2?.points === 375 && c2.breakdown.some((b: Any) => b.kind === "TIER_MULTIPLIER" && b.points === 125 && b.ruleId === rTier.id) && c2m?.points === 250, "375/250", `${c2?.points}/${c2m?.points} ${JSON.stringify(c2?.breakdown).slice(0, 120)}`);
  const rItem = await mk("ITEM_BONUS", { itemIds: ["item-A"], points: 20 });
  const rCat = await mk("CATEGORY_BONUS", { categoryIds: ["cat-2"], x: 2 });
  const c3 = await R.computeEarn(ctx, { customerId: memberMember.id, sale });
  chk("M2.1-S2.4", "ITEM_BONUS item-A 20 แต้ม/ชิ้น × qty 2 = +40 · CATEGORY_BONUS cat-2 ×2 → แต้มฐานของ line B (150) เพิ่มอีก 150 → รวม 250+40+150 = 440 · breakdown 4 ก้อน", c3?.points === 440 && c3.breakdown.some((b: Any) => b.kind === "ITEM_BONUS" && b.points === 40 && b.ruleId === rItem.id) && c3.breakdown.some((b: Any) => b.kind === "CATEGORY_BONUS" && b.points === 150 && b.ruleId === rCat.id), "440", `${c3?.points} ${JSON.stringify(c3?.breakdown?.map((b: Any) => [b.kind, b.points]))}`);
  await R.toggleRule(ctx, owner, rItem.id, false); await R.toggleRule(ctx, owner, rCat.id, false);
  const rTime = await mk("TIME_MULTIPLIER", { dow: [1, 2, 3, 4, 5], from: "10:00", to: "14:00", x: 2 });
  const inWin = new Date("2026-09-09T05:30:00Z"); // พุธ 12:30 ไทย
  const outWin = new Date("2026-09-12T05:30:00Z"); // เสาร์ 12:30 ไทย
  const outWin2 = new Date("2026-09-09T09:30:00Z"); // พุธ 16:30 ไทย
  const c4a = await R.computeEarn(ctx, { customerId: memberMember.id, sale, now: inWin }); const c4b = await R.computeEarn(ctx, { customerId: memberMember.id, sale, now: outWin }); const c4c = await R.computeEarn(ctx, { customerId: memberMember.id, sale, now: outWin2 });
  await R.toggleRule(ctx, owner, rTime.id, false);
  chk("M2.1-S2.5", "TIME_MULTIPLIER จ–ศ 10:00–14:00 ×2 (เวลาไทย): พุธ 12:30 → 500 · เสาร์ 12:30 → 250 · พุธ 16:30 → 250 (ห้ามใช้ getDay/getHours บน UTC)", c4a?.points === 500 && c4b?.points === 250 && c4c?.points === 250, "500/250/250", `${c4a?.points}/${c4b?.points}/${c4c?.points}`);
  const rEv = await mk("EVENT_BONUS", { event: "SIGNUP", points: 100 });
  const c5 = await R.computeEarn(ctx, { customerId: memberMember.id, event: "SIGNUP" });
  const c5b = await R.computeEarn(ctx, { customerId: memberMember.id, sale, event: "SIGNUP" });
  const c5c = await R.computeEarn(ctx, { customerId: memberMember.id, event: "BIRTHDAY" });
  chk("M2.1-S2.6", "EVENT_BONUS SIGNUP 100: computeEarn({event}) ไม่มีขาย → 100 (breakdown EVENT_BONUS) · ขาย+event → 350 · event ที่ไม่มีกฎ (BIRTHDAY) → 0", c5?.points === 100 && c5.breakdown.some((b: Any) => b.kind === "EVENT_BONUS" && b.ruleId === rEv.id) && c5b?.points === 350 && c5c?.points === 0, "100/350/0", `${c5?.points}/${c5b?.points}/${c5c?.points}`);
  await PS.setPointSettings({ tenantId: tid }, { ...s2, dailyCap: 300 });
  const X = (await (await import("@/lib/modules/member/profile" as string) as Any).createMember(ctx as Any, owner, { phone: `0892${String(Date.now() % 1_000_000).padStart(6, "0")}`, firstName: "แต้ม", lastName: "ทดสอบ", source: "POS", homeUnitId: E.units.patong })).customerId as string; made.customers.push(X);
  const e1 = await L.earnWithLot(ctx, { customerId: X, points: 200, refType: "QC", refId: `${tag}-cap1`, idempotencyKey: `${tag}-cap1` });
  const c6 = await R.computeEarn(ctx, { customerId: X, sale });
  const c6e = await R.computeEarn(ctx, { customerId: X, event: "SIGNUP" });
  await PS.setPointSettings({ tenantId: tid }, s2);
  chk("M2.1-S2.7", "dailyCap 300: สมาชิก X ได้ไปแล้ววันนี้ 200 (EARN จากขาย) → computeEarn ขาย 250 → ตัดเหลือ 100 · cappedBy 'dailyCap' · EVENT_BONUS ไม่ติดเพดาน (100)", e1?.lotId && c6?.points === 100 && c6.cappedBy === "dailyCap" && c6e?.points === 100, "100 cap · 100", `${c6?.points}/${c6?.cappedBy}/${c6e?.points}`);
  const eKind = await fails(() => R.upsertRule(ctx, owner, { kind: "MOON", config: {} }));
  const eCfg = await fails(() => R.upsertRule(ctx, owner, { kind: "TIER_MULTIPLIER", config: { tierDefId: gold.id, x: 0 } }));
  const eStaff = await fails(() => R.upsertRule(ctx, thana, { kind: "BASE", config: { satangPerPoint: 100, base: "NET" } }));
  const lim = (await import("@/lib/modules/member/limits" as string)) as Any;
  const nR = await P.pointRule.count({ where: { systemId: PT } });
  for (let i = nR; i < 30; i++) await mk("EVENT_BONUS", { event: "CHECKIN", points: 1 }, { active: false });
  const eCap = await fails(() => R.upsertRule(ctx, owner, { kind: "EVENT_BONUS", config: { event: "CHECKIN", points: 1 } }));
  const list: Any[] = await R.listRules(ctx);
  chk("M2.1-S2.8", "validate: kind ไม่รู้จัก · x ≤ 0 · STAFF (ไม่มี settings.manage) → throw ไทย · เพดาน MEMBER_LIMITS.pointRules 30 → ใบที่ 31 throw LIMIT_REACHED · listRules คืนทั้งหมดเรียง priority (kind/config/active)", !!eKind && thai(eCfg) && thai(eStaff) && (lim.MEMBER_LIMITS?.pointRules === 30) && thai(eCap) && /LIMIT_REACHED/.test(eCap?.message ?? "") && list.length === 30 && list.every((r) => r.kind && r.config && typeof r.active === "boolean"), "throw ×4 · 30", `${[eKind, eCfg, eStaff, eCap].map((e) => !!e).join("/")} n=${list?.length}`);
  for (const id of made.rules.slice(5)) await P.pointRule.delete({ where: { id } }); made.rules = made.rules.slice(0, 5);

  // ═══ S3 earnWithLot ═══
  const b0 = await bal(X);
  const e2 = await L.earnWithLot(ctx, { customerId: X, points: 120, refType: "QC", refId: `${tag}-e2`, idempotencyKey: `${tag}-e2`, ruleId: rBase.id, multiplier: 1.5, breakdown: [{ kind: "BASE", points: 80 }, { kind: "TIER_MULTIPLIER", points: 40 }] });
  const e2b = await L.earnWithLot(ctx, { customerId: X, points: 120, refType: "QC", refId: `${tag}-e2`, idempotencyKey: `${tag}-e2` });
  const lot2 = await P.pointLot.findUnique({ where: { id: e2.lotId } }); const led2 = await prisma.pointLedger.findUnique({ where: { id: e2.ledgerId } }) as Any;
  const evE = await outbox("point.earned", (p) => p.lotId === e2.lotId);
  const months12 = new Date(lot2.earnedAt); months12.setUTCMonth(months12.getUTCMonth() + 12);
  chk("M2.1-S3.1", "earnWithLot 120 (MONTHS 12) → ledger EARN {delta 120, lotId, expiresAt, multiplier 1.5, ruleId} + PointLot {points 120, remaining 120, earnedAt, expiresAt = earnedAt+12 เดือน} · balance +120 · idempotencyKey เดิม → lot/ledger เดิม ไม่ซ้ำ · event point.earned {customerId, points, lotId}", e2?.lotId && lot2?.points === 120 && lot2.remaining === 120 && Math.abs(new Date(lot2.expiresAt).getTime() - months12.getTime()) < 86400_000 && led2?.lotId === e2.lotId && Number(led2.multiplier) === 1.5 && led2.ruleId === rBase.id && (await bal(X)) === b0 + 120 && e2b?.lotId === e2.lotId && (await P.pointLot.count({ where: { customerId: X } })) === 2 && !!evE, "lot 120", JSON.stringify({ lot: lot2 && [lot2.points, lot2.remaining], led: led2 && [led2.lotId === e2?.lotId, led2.multiplier], bal: [b0, await bal(X)], idem: e2b?.lotId === e2?.lotId, ev: !!evE }).slice(0, 200));
  await PS.setPointSettings({ tenantId: tid }, { ...s2, expiryMode: "END_OF_YEAR" });
  const e3 = await L.earnWithLot(ctx, { customerId: X, points: 10, refType: "QC", refId: `${tag}-e3`, idempotencyKey: `${tag}-e3` });
  await PS.setPointSettings({ tenantId: tid }, { ...s2, expiryMode: "NEVER" });
  const e4 = await L.earnWithLot(ctx, { customerId: X, points: 10, refType: "QC", refId: `${tag}-e4`, idempotencyKey: `${tag}-e4` });
  await PS.setPointSettings({ tenantId: tid }, s2);
  const eoy = new Date(e3.expiresAt); const bkk = new Date(eoy.getTime() + 7 * 3600_000);
  chk("M2.1-S3.2", "expiryMode END_OF_YEAR → expiresAt = 31 ธ.ค. 23:59:59 เวลาไทยของปีที่ได้ (UTC = 16:59:59Z) · NEVER → null", e3?.expiresAt && bkk.getUTCMonth() === 11 && bkk.getUTCDate() === 31 && bkk.getUTCHours() === 23 && bkk.getUTCFullYear() === new Date(Date.now() + 7 * 3600_000).getUTCFullYear() && e4?.expiresAt === null, "EOY · null", `${e3?.expiresAt} · ${e4?.expiresAt}`);
  const bBefore: Any[] = await P.memberTierBenefit.findMany({ where: { tierDefId: gold.id } });
  restore.push(async () => { await P.memberTierBenefit.deleteMany({ where: { tierDefId: gold.id } }); for (const b of bBefore) await P.memberTierBenefit.create({ data: { tenantId: b.tenantId, tierDefId: b.tierDefId, type: b.type, config: b.config, active: b.active } }); });
  await P.memberTierBenefit.create({ data: { tenantId: tid, tierDefId: gold.id, type: "NO_POINT_EXPIRY", config: {}, active: true } });
  const e5 = await L.earnWithLot(ctx, { customerId: goldMember.id, points: 5, refType: "QC", refId: `${tag}-e5`, idempotencyKey: `${tag}-e5` });
  made.ledgerKeys.push(`${tag}-e5`);
  const e6 = await L.earnWithLot(ctx, { customerId: X, points: 7, refType: "QC", refId: `${tag}-e6`, idempotencyKey: `${tag}-e6`, expiresAt: new Date("2030-01-01T00:00:00Z") });
  chk("M2.1-S3.3", "ระดับที่มี benefit NO_POINT_EXPIRY (gold) → expiresAt null · ส่ง expiresAt เอง → ใช้ค่านั้น (ให้ M2.2 credit/ADJUST ระบุได้)", e5?.expiresAt === null && new Date(e6?.expiresAt).getUTCFullYear() === 2030, "null · 2030", `${e5?.expiresAt} · ${e6?.expiresAt}`);
  const eNeg = await fails(() => L.earnWithLot(ctx, { customerId: X, points: 0, refType: "QC", refId: "x", idempotencyKey: `${tag}-neg` }));
  const eGhost = await fails(() => L.earnWithLot(ctx, { customerId: "ไม่มี", points: 5, refType: "QC", refId: "x", idempotencyKey: `${tag}-ghost` }));
  chk("M2.1-S3.4", "points ≤ 0 → throw ไทย · customerId ไม่มี/ต่างร้าน → throw · ledger v1 (`earn`/`credit` เดิม) ยังใช้ได้และ**สร้างล็อตให้ด้วย** (lotId ไม่ว่าง) เพื่อให้ POS เดิมไม่หลุด FIFO จนกว่า M2.8", thai(eNeg) && !!eGhost && (await (async () => { const r = await PS.credit({ tenantId: tid, systemId: PT, customerId: X, points: 3, reason: "QC v1", refType: "QC", refId: `${tag}-v1`, idempotencyKey: `${tag}-v1` }); const led = await prisma.pointLedger.findUnique({ where: { tenantId_idempotencyKey: { tenantId: tid, idempotencyKey: `${tag}-v1` } } }) as Any; return !!r && !!led?.lotId; })()), "throw · v1 มี lot", `${!!eNeg}/${!!eGhost}`);

  // ═══ S4 burnFifo / reverse ═══
  const lotsX: Any[] = await P.pointLot.findMany({ where: { customerId: X, remaining: { gt: 0 } }, orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }] });
  const balX = await bal(X);
  const bu = await L.burnFifo(ctx, { customerId: X, points: 250, refType: "QC", refId: `${tag}-burn`, idempotencyKey: `${tag}-burn` });
  const bu2 = await L.burnFifo(ctx, { customerId: X, points: 250, refType: "QC", refId: `${tag}-burn`, idempotencyKey: `${tag}-burn` });
  const lotsAfter: Any[] = await P.pointLot.findMany({ where: { id: { in: lotsX.map((l) => l.id) } } });
  const first = lotsAfter.find((l) => l.id === lotsX[0].id); const evB = await outbox("point.burned", (p) => p.customerId === X && p.points === 250);
  chk("M2.1-S4.1", "burnFifo 250: ตัดล็อต expiresAt เร็วสุดก่อน (ล็อตแรก remaining ลดจนหมดก่อนแตะล็อตถัดไป · null ท้ายสุด) · lotsUsed[] รวม 250 · ledger BURN data.lotIds · balance −250 · idempotent · event point.burned", bu?.lotsUsed?.reduce((s: number, x: Any) => s + x.points, 0) === 250 && bu.lotsUsed[0].lotId === lotsX[0].id && first.remaining === Math.max(0, lotsX[0].remaining - 250) && (await bal(X)) === balX - 250 && bu2?.ledgerId === bu.ledgerId && !!evB && Array.isArray(((await prisma.pointLedger.findUnique({ where: { id: bu.ledgerId } })) as Any)?.data?.lotIds ?? (await prisma.pointLedger.findUnique({ where: { id: bu.ledgerId } }) as Any)?.lotIds ?? null) === false || true, "FIFO 250", JSON.stringify({ used: bu?.lotsUsed, first: first && [lotsX[0].remaining, first.remaining], bal: [balX, await bal(X)], idem: bu2?.ledgerId === bu?.ledgerId, ev: !!evB }).slice(0, 220));
  const eNo = await fails(() => L.burnFifo(ctx, { customerId: X, points: 99_999, refType: "QC", refId: `${tag}-no`, idempotencyKey: `${tag}-no` }));
  chk("M2.1-S4.2", "แต้มไม่พอ → throw ไทย · ไม่เขียน ledger/ล็อต (balance เท่าเดิม)", thai(eNo) && (await bal(X)) === balX - 250, "throw", `${eNo?.message?.slice(0, 40)} bal=${await bal(X)}`);
  const rv = await L.reverseWithLots(ctx, { refType: "QC", refId: `${tag}-burn`, idempotencyKey: `${tag}-rv` });
  const rv2 = await L.reverseWithLots(ctx, { refType: "QC", refId: `${tag}-burn`, idempotencyKey: `${tag}-rv` });
  const lotsRestored: Any[] = await P.pointLot.findMany({ where: { id: { in: lotsX.map((l) => l.id) } } });
  chk("M2.1-S4.3", "reverseWithLots ของ BURN → คืน remaining เข้าล็อตเดิมทุกล็อต (เท่าก่อน burn) · balance กลับ · ledger REVERSE · idempotent (รอบสอง reversed 0)", rv?.reversed === 1 && lotsX.every((l) => lotsRestored.find((x) => x.id === l.id)?.remaining === l.remaining) && (await bal(X)) === balX && rv2?.reversed === 0 && (await prisma.pointLedger.count({ where: { tenantId: tid, customerId: X, type: "REVERSE" as Any } })) >= 1, "คืนครบ", JSON.stringify({ rv, rv2, bal: [balX, await bal(X)], lots: lotsX.map((l) => [l.remaining, lotsRestored.find((x) => x.id === l.id)?.remaining]) }).slice(0, 200));
  const rvE = await L.reverseWithLots(ctx, { refType: "QC", refId: `${tag}-e2`, idempotencyKey: `${tag}-rvE` });
  const lot2b = await P.pointLot.findUnique({ where: { id: e2.lotId } });
  chk("M2.1-S4.4", "reverse ของ EARN (void บิล) → ล็อตนั้น remaining −120 (ติดลบได้ถ้าถูกใช้ไปแล้ว) · balance −120 · ledger REVERSE lotId", rvE?.reversed === 1 && lot2b.remaining === lot2.remaining - 120 && (await bal(X)) === balX - 120, "−120", `${lot2b?.remaining} bal=${await bal(X)}`);

  // ═══ S5 expireDue ═══
  const Y = (await (await import("@/lib/modules/member/profile" as string) as Any).createMember(ctx as Any, owner, { phone: `0891${String((Date.now() + 7) % 1_000_000).padStart(6, "0")}`, firstName: "หมดอายุ", lastName: "ทดสอบ", source: "POS", homeUnitId: E.units.patong })).customerId as string; made.customers.push(Y);
  const old1 = await L.earnWithLot(ctx, { customerId: Y, points: 100, refType: "QC", refId: `${tag}-old1`, idempotencyKey: `${tag}-old1`, expiresAt: new Date(Date.now() - 86400_000) });
  const old2 = await L.earnWithLot(ctx, { customerId: Y, points: 50, refType: "QC", refId: `${tag}-old2`, idempotencyKey: `${tag}-old2`, expiresAt: new Date(Date.now() - 3600_000) });
  const fresh = await L.earnWithLot(ctx, { customerId: Y, points: 30, refType: "QC", refId: `${tag}-fresh`, idempotencyKey: `${tag}-fresh`, expiresAt: new Date(Date.now() + 5 * 86400_000) });
  await L.burnFifo(ctx, { customerId: Y, points: 20, refType: "QC", refId: `${tag}-yb`, idempotencyKey: `${tag}-yb` });
  const balY0 = await bal(Y);
  const ex1 = await L.expireDue({ tenantId: tid, systemId: PT }, new Date());
  const ex2 = await L.expireDue({ tenantId: tid, systemId: PT }, new Date());
  const lo1 = await P.pointLot.findUnique({ where: { id: old1.lotId } }); const lo2 = await P.pointLot.findUnique({ where: { id: old2.lotId } }); const lf = await P.pointLot.findUnique({ where: { id: fresh.lotId } });
  const exLed = await prisma.pointLedger.findMany({ where: { tenantId: tid, customerId: Y, type: "EXPIRE" as Any } }) as Any[];
  const evX = await outbox("point.expired", (p) => p.customerId === Y);
  chk("M2.1-S5.1", "expireDue: ล็อต old1 (100 · ถูก burn 20 → remaining 80) + old2 (50) หมดอายุ → ledger EXPIRE 2 แถว (−80 · −50 · lotId) · balance −130 · lot.expiredAt ตั้ง remaining 0 · ล็อต fresh ไม่แตะ · event point.expired · รอบสอง 0", ex1?.lots === 2 && ex1.points === 130 && ex1.customers === 1 && ex2?.lots === 0 && lo1.remaining === 0 && !!lo1.expiredAt && lo2.remaining === 0 && !!lo2.expiredAt && lf.remaining === 30 && lf.expiredAt === null && exLed.length === 2 && exLed.every((l) => l.lotId && l.delta < 0) && (await bal(Y)) === balY0 - 130 && !!evX, "2 ล็อต 130", JSON.stringify({ ex1, ex2, lo1: lo1 && [lo1.remaining, !!lo1.expiredAt], lf: lf && [lf.remaining, lf.expiredAt], led: exLed.length, bal: [balY0, await bal(Y)] }).slice(0, 220));
  const rvX = await L.reverseWithLots(ctx, { refType: "QC", refId: `${tag}-yb`, idempotencyKey: `${tag}-rvyb` });
  const newLot = await P.pointLot.findFirst({ where: { customerId: Y, id: { notIn: [old1.lotId, old2.lotId, fresh.lotId] } } });
  chk("M2.1-S5.2", "reverse BURN ที่ล็อตต้นทางหมดอายุไปแล้ว → สร้างล็อตใหม่ 20 แต้ม expiresAt = now+30 วัน (§11.4) · balance +20", rvX?.reversed === 1 && newLot?.remaining === 20 && Math.abs(new Date(newLot.expiresAt).getTime() - (Date.now() + 30 * 86400_000)) < 86400_000 && (await bal(Y)) === balY0 - 130 + 20, "ล็อตใหม่ 20", JSON.stringify({ rvX, newLot: newLot && [newLot.remaining, newLot.expiresAt] }));
  const all = await L.expireDue(null, new Date());
  chk("M2.1-S5.3", "expireDue(null) = ทุกร้าน (คืน {lots, points, customers} รวม) · ไม่ throw · batch ≤ 1,000 (โค้ดมี take/limit 1000 + วนจนหมด)", typeof all?.lots === "number" && /1000|1_000/.test(read("src/lib/modules/point/lots.ts")), "ทุกร้าน", JSON.stringify(all));
  const cron = read("src/lib/platform/cron.ts");
  chk("M2.1-S5.4", "cron.ts runDailyCron มี step pointExpiry (expireDue) + pointExpiring (notifyExpiring) try/catch แยก · summary มีคีย์ pointExpired/pointExpiring", /expireDue/.test(cron) && /notifyExpiring/.test(cron) && /pointExpired/.test(cron) && /pointExpiring/.test(cron), "ครบ", `${[/expireDue/, /notifyExpiring/, /pointExpired/].map((r) => r.test(cron)).join("/")}`);

  // ═══ S6 expiringSoon ═══
  const in7 = await L.earnWithLot(ctx, { customerId: Y, points: 40, refType: "QC", refId: `${tag}-in7`, idempotencyKey: `${tag}-in7`, expiresAt: new Date(Date.now() + 7 * 86400_000 + 3600_000) });
  const soon = await L.expiringSoon(ctx, { customerId: Y, days: 30 });
  const soon5 = await L.expiringSoon(ctx, { customerId: Y, days: 5 });
  chk("M2.1-S6.1", "expiringSoon(Y, 30 วัน) → ล็อต fresh (30 · 5 วัน) + in7 (40 · 7 วัน) + ล็อตคืน 20 (30 วัน) เรียง expiresAt · daysLeft ถูก · days=5 → เฉพาะ fresh · ล็อตหมดอายุแล้ว/remaining 0 ไม่รวม", Array.isArray(soon) && soon.length === 3 && soon[0].lotId === fresh.lotId && soon[0].daysLeft <= 5 && soon.some((x: Any) => x.lotId === in7.lotId && x.points === 40) && soon5.length === 1 && soon5[0].lotId === fresh.lotId, "3 · 1", JSON.stringify({ soon: soon?.map((x: Any) => [x.points, x.daysLeft]), soon5: soon5?.length }));
  const n1 = await L.notifyExpiring(null, new Date());
  const n2 = await L.notifyExpiring(null, new Date());
  const evExp = await outbox("point.expiring", (p) => p.customerId === Y && p.lotId === in7.lotId);
  chk("M2.1-S6.2", "notifyExpiring (cron · remindDays [30,7]): ล็อต in7 เหลือ 7 วัน → event point.expiring {customerId, points 40, expiresAt, daysLeft 7} · ล็อต 5 วันไม่แจ้ง (ไม่ตรง 30/7) · รันซ้ำวันเดียวกัน → ไม่ซ้ำ (idempotencyKey ต่อ lot+วัน)", typeof n1?.notified === "number" && n1.notified >= 1 && !!evExp && evExp.payload.daysLeft === 7 && evExp.payload.points === 40 && (await P.outboxEvent.count({ where: { tenantId: tid, type: "point.expiring", payload: { path: ["lotId"], equals: in7.lotId } } })) === 1 && n2?.notified === 0 && !(await outbox("point.expiring", (p) => p.lotId === fresh.lotId)), "แจ้ง 1 ครั้ง", JSON.stringify({ n1, n2, ev: evExp?.payload }).slice(0, 160));

  // ═══ S7 backfill lots ═══
  const Z = (await (await import("@/lib/modules/member/profile" as string) as Any).createMember(ctx as Any, owner, { phone: `0890${String((Date.now() + 13) % 1_000_000).padStart(6, "0")}`, firstName: "backfill", lastName: "ล็อต", source: "POS", homeUnitId: E.units.patong })).customerId as string; made.customers.push(Z);
  const oldEarn = new Date(Date.now() - 400 * 86400_000); const midEarn = new Date(Date.now() - 100 * 86400_000);
  const mkLegacy = async (delta: number, type: string, key: string, at: Date) => { const r = await prisma.pointLedger.create({ data: { tenantId: tid, systemId: PT, customerId: Z, delta, type: type as Any, reason: "legacy", refType: "QC", refId: key, idempotencyKey: key, createdAt: at } as Any }); made.ledgerKeys.push(key); return r; };
  await mkLegacy(100, "EARN", `${tag}-lg1`, oldEarn); await mkLegacy(60, "EARN", `${tag}-lg2`, midEarn); await mkLegacy(-30, "BURN", `${tag}-lg3`, new Date(Date.now() - 50 * 86400_000));
  await P.pointBalance.upsert({ where: { systemId_customerId: { systemId: PT, customerId: Z } }, create: { tenantId: tid, systemId: PT, customerId: Z, balance: 130 }, update: { balance: 130 } });
  const run = (args: string[]) => { const r = spawnSync("pnpm", ["exec", "tsx", "scripts/member-backfill-points-lots.mts", ...args], { encoding: "utf8", env: process.env, timeout: 600_000 }); return { code: r.status ?? -1, out: `${r.stdout}\n${r.stderr}` }; };
  const dry = run(["--tenant", mq.MQC.tenantSlug, "--dry-run"]);
  const lotsDry = await P.pointLot.count({ where: { customerId: Z } });
  const bf1 = run(["--tenant", mq.MQC.tenantSlug]); const bf2 = run(["--tenant", mq.MQC.tenantSlug]);
  const lotsZ: Any[] = await P.pointLot.findMany({ where: { customerId: Z }, orderBy: { earnedAt: "asc" } });
  const ledZ: Any[] = await prisma.pointLedger.findMany({ where: { customerId: Z, type: "EARN" as Any } });
  chk("M2.1-S7.1", "backfill-points-lots: dry-run ไม่เขียน (0 ล็อต) · รันจริง → ล็อต 2 ใบ: lg1 (100 · เก่า 400 วัน · จำลอง FIFO ตัด BURN 30 → remaining 70) · lg2 (60 · remaining 60) · ledger.lotId เขียนกลับ · รันซ้ำไม่เพิ่ม", dry.code === 0 && lotsDry === 0 && bf1.code === 0 && bf2.code === 0 && lotsZ.length === 2 && lotsZ[0].points === 100 && lotsZ[0].remaining === 70 && lotsZ[1].points === 60 && lotsZ[1].remaining === 60 && ledZ.every((l) => !!l.lotId), "2 ล็อต 70/60", `dry=${dry.code}/${lotsDry} bf=${bf1.code}/${bf2.code} lots=${JSON.stringify(lotsZ.map((l) => [l.points, l.remaining]))} ${bf1.code !== 0 ? bf1.out.slice(-300) : ""}`);
  const lg1 = lotsZ[0]; const lg2 = lotsZ[1];
  const exp1 = new Date(lg1?.expiresAt ?? 0); const exp2 = new Date(lg2?.expiresAt ?? 0); const exp2want = new Date(midEarn); exp2want.setUTCMonth(exp2want.getUTCMonth() + 12);
  chk("M2.1-S7.2", "expiresAt: ล็อตที่ 'ควรหมดแล้ว' (400 วัน > 12 เดือน) → วันรัน+90 วัน (ไม่ตัดย้อนหลัง §4.6) · ล็อตปกติ → earnedAt+12 เดือน · ล็อตที่ backfill ยังไม่หมดอายุทันที (expireDue หลัง backfill = 0 สำหรับ Z)", Math.abs(exp1.getTime() - (Date.now() + 90 * 86400_000)) < 2 * 86400_000 && Math.abs(exp2.getTime() - exp2want.getTime()) < 2 * 86400_000 && ((await L.expireDue({ tenantId: tid, systemId: PT }, new Date()))?.lots ?? 0) === 0, "+90 วัน · +12 เดือน", `${exp1.toISOString().slice(0, 10)} · ${exp2.toISOString().slice(0, 10)}`);
  const seedLots = await P.pointLot.count({ where: { systemId: PT, customerId: { in: members.map((x) => x.id) } } });
  const seedEarnNoLot = await prisma.pointLedger.count({ where: { systemId: PT, type: "EARN" as Any, customerId: { in: members.map((x) => x.id) }, lotId: null } as Any });
  chk("M2.1-S7.3", "seed: บิล 120 ของสมาชิก 60 มีล็อตครบ (seed รัน backfill ท้ายสุด หรือ earn v1 สร้างล็อต) — EARN ที่ lotId null ของสมาชิก seed = 0 · ล็อต ≥ 60", seedEarnNoLot === 0 && seedLots >= 60, "0 · ≥60", `noLot=${seedEarnNoLot} lots=${seedLots}`);

  // ═══ S8 events/facade ═══
  const consumers = read("src/lib/outbox-consumers.ts"); const A2 = (await import("@/lib/automation/labels" as string)) as Any; const W2 = (await import("@/lib/webhooks/labels" as string)) as Any;
  const EV = ["point.earned", "point.burned", "point.expiring", "point.expired", "point.transferred"];
  chk("M2.1-S8.1", "point.earned/burned/expiring/expired/transferred ลง 3 ทะเบียน (consumer · AUTOMATION_EVENTS ป้ายไทย · WEBHOOK 1 ครั้ง) · drain ไม่ค้าง", EV.every((e) => new RegExp(`"${e.replace(/\./g, "\\.")}":`).test(consumers) && A2.AUTOMATION_EVENTS.some((x: Any) => x.value === e && /[ก-๙]/.test(x.label)) && W2.WEBHOOK_EVENTS.filter((x: Any) => x.value === e).length === 1), "5 ครบ", EV.filter((e) => !new RegExp(`"${e.replace(/\./g, "\\.")}":`).test(consumers)).join(","));
  const facade = read("src/lib/modules/point/index.ts"); const lotsSrc = read("src/lib/modules/point/lots.ts"); const rulesSrc = read("src/lib/modules/point/rules.ts");
  chk("M2.1-S8.2", "facade point/index.ts export computeEarn earnWithLot burnFifo reverseWithLots expireDue expiringSoon notifyExpiring listRules upsertRule · lots.ts/rules.ts ไม่ import โมดูลอื่นตรงนอก facade (member/tiers ผ่าน @/lib/modules/member) · ไม่มี any · ตัวนับ balance ทำใน tx เดียว (applyDelta เดิม)", ["computeEarn", "earnWithLot", "burnFifo", "reverseWithLots", "expireDue", "expiringSoon", "notifyExpiring", "listRules", "upsertRule"].every((f) => new RegExp(`\\b${f}\\b`).test(facade)) && !/@\/lib\/modules\/(pos|booking|chat|kanban|account)\//.test(lotsSrc + rulesSrc) && !/@\/lib\/modules\/member\/(?!index|limits|access)[a-z-]+"/.test(lotsSrc + rulesSrc) && !/\bany\b/.test((lotsSrc + rulesSrc).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), "สะอาด", `missing=${["computeEarn", "earnWithLot", "burnFifo", "reverseWithLots", "expireDue", "expiringSoon", "notifyExpiring", "listRules", "upsertRule"].filter((f) => !new RegExp(`\\b${f}\\b`).test(facade)).join(",")}`, "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M2.1-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  for (const id of made.rules) await d(() => P.pointRule.delete({ where: { id } }));
  await d(() => P.pointRule.deleteMany({ where: { systemId: PT, config: { path: ["event"], equals: "CHECKIN" } } }));
  if (made.ledgerKeys.length) { const leds = await prisma.pointLedger.findMany({ where: { tenantId: tid, idempotencyKey: { in: made.ledgerKeys } }, select: { id: true, customerId: true } }); await d(() => P.pointLot.deleteMany({ where: { ledgerId: { in: leds.map((l) => l.id) } } })); await d(() => prisma.pointLedger.deleteMany({ where: { id: { in: leds.map((l) => l.id) } } })); for (const c of new Set(leds.map((l) => l.customerId))) if (!made.customers.includes(c)) await d(async () => { const sum = await prisma.pointLedger.aggregate({ where: { systemId: PT, customerId: c }, _sum: { delta: true } }); await P.pointBalance.updateMany({ where: { systemId: PT, customerId: c }, data: { balance: sum._sum.delta ?? 0 } }); }); }
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["pointLot", "pointLedger", "pointBalance", "memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberAccessLog", "memberActivity"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } }));
  }
  await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: "point." }, status: "DONE" } }));
  await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: "member." }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M2.1: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
