// QC — ระบบสมาชิก v2 WO M2.4: รางวัล v2 — Reward +cols (kind/stampCardId/stampsCost/tierDefIds/perMemberMonthly/startAt/endAt/unitIds/pickupDays/showToCustomer/imageFileId) · RewardRedemption +cols (qrCode/expiresAt/fulfilledById/fulfilledUnitId/cancelReason) · redeem ด้วยแต้ม (burnFifo M2.1) และ/หรือสแตมป์ (M2.3) · เงื่อนไข 5 (ระดับ/ช่วงเวลา/สาขา/ต่อคนต่อเดือน/สต็อก) · QR + expiresAt รับของ · fulfil/cancel (คืนแต้ม/สแตมป์/สต็อก) · expireDue · lookup · แคตตาล็อก LIFF · หน้า 05 (catalog+รอรับ) · 18 (editor + รับของหน้าร้าน + ประวัติ)
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M2.4 · พิมพ์เขียว §4.1 (Reward/RewardRedemption +cols) §4.2 (RewardKind ITEM SERVICE VOUCHER DISCOUNT) §7.1 (reward.redeemed/fulfilled) §11.9 (เพดาน 200) · MEMBER-API §2.8 · ภาพ 05 · 18
// requires: member-seed
//
// สัญญา (ต่อยอด src/lib/modules/reward/{service.ts (v1 คงเดิม — ห้ามลบ), v2.ts (ใหม่), index.ts (facade), reward-actions.ts} · migration `member_v2_d2` (additive · ไม่มี default ที่ทำลาย v1))
//   ctx = { tenantId, systemId (= ระบบ REWARD), memberSystemId (= ระบบ MEMBER), pointSystemId (= ระบบ POINT), actorUserId } · actor = MemberActor · สิทธิ์: จัดการ = member.loyalty.manage · แลกให้ลูกค้า = member.loyalty.read (พนักงาน) หรือ CUSTOMER ตนเอง · ส่งมอบ/ยกเลิก = member.loyalty.fulfil
//   createRewardV2(ctx, actor, { name, description?, kind(ITEM|SERVICE|VOUCHER|DISCOUNT), pointsCost(≥0), stampCardId?, stampsCost?(≥1 เมื่อมี stampCardId), stock?(null=ไม่จำกัด), tierDefIds[], perMemberMonthly?, startAt?, endAt?, unitIds[], pickupDays(ปริยาย 14), showToCustomer(ปริยาย true), imageFileId? }) → Reward
//     ตรวจ: ชื่อว่าง/kind นอก enum → throw ไทย · pointsCost 0 และไม่มี stampsCost → throw (ต้องมีราคาอย่างน้อยหนึ่งอย่าง) · stampsCost โดยไม่มี stampCardId → throw · เพดาน MEMBER_LIMITS.rewards (200) · updateRewardV2 · toggleReward · listRewardsV2(ctx) (+ stats {pending, fulfilled})
//   redeemV2(ctx, actor, { rewardId, customerId, unitId?, idempotencyKey }) → { redemptionId, qrCode, code, expiresAt, pointsCost, stampsCost }
//     เงื่อนไข (throw ไทย ทุกข้อ · ไม่เขียนอะไรถ้าไม่ผ่าน): active · startAt ≤ now ≤ endAt · stock > 0 (null = ไม่จำกัด) · tierDefIds ไม่ว่าง → tierDefId ลูกค้าอยู่ในรายการ · unitIds ไม่ว่าง → unitId (ที่ส่ง หรือ homeUnitId ลูกค้า) อยู่ในรายการ · perMemberMonthly → จำนวน redemption ของลูกค้าคนนี้กับรางวัลนี้ในเดือนไทยนี้ (ไม่นับ CANCELLED) < perMemberMonthly · แต้มพอ (point facade burnFifo refType "RewardRedemption" refId redemptionId · idempotencyKey `reward:${redemptionId}`) · สแตมป์พอ (stamp facade useStamps(ctx, { cardId, customerId, count, refType: "REWARD", refId: redemptionId, idempotencyKey }) → StampEvent USE · progress.stamps −count — M2.4 เพิ่มฟังก์ชันนี้ใน stamp/ ได้)
//     ผล: RewardRedemption PENDING · qrCode (crypto random ≥ 12 ตัว · unique) · code (v1 6 ตัว คงไว้) · expiresAt = now + pickupDays วัน · pointsCost snapshot · stock −1 · event reward.redeemed {customerId, rewardId, redemptionId} · idempotencyKey ซ้ำ → คืนผลเดิม
//   fulfilV2(ctx, actor, { redemptionId, unitId }) → { ok } · สิทธิ์ loyalty.fulfil · PENDING เท่านั้น (FULFILLED → idempotent ok ไม่ยิง event ซ้ำ · CANCELLED → throw) · expiresAt < now → throw ไทย 'หมดอายุรับ' · reward.unitIds ไม่ว่าง → unitId ต้องอยู่ในรายการ · เขียน fulfilledById = actor.userId · fulfilledUnitId · event reward.fulfilled
//   cancelV2(ctx, actor, { redemptionId, reason }) → { ok, refundedPoints, refundedStamps } · สิทธิ์ loyalty.fulfil · PENDING → CANCELLED + cancelReason · คืนแต้ม (point facade reverseWithLots ของ BURN นั้น) · คืนสแตมป์ (stamp addStamp refType "REWARD_CANCEL" refId redemptionId · ไม่ติด perDayMax) · stock +1 · ซ้ำ → idempotent (refunded 0) · FULFILLED → throw ไทย 'ส่งมอบแล้ว'
//   expireDue(now?) → { expired } ทุกร้าน: PENDING + expiresAt ≤ now → CANCELLED cancelReason "EXPIRED" + คืนแต้ม/สแตมป์/สต็อก · cron.ts runDailyCron step rewardExpire (summary รหัส rewardExpired)
//   lookupRedemption(ctx, { code }) → null | { redemption{ id, status, expiresAt, createdAt, pointsCost, stampsCost }, reward{ id, name, kind }, member{ customerId, name, memberCode, tierName? }, fulfilledBy?: { name } } — หาได้ทั้ง qrCode และ code (v1) · ต่างร้าน → null
//   listRedemptionsV2(ctx, { status?, unitId?, take? }) → rows[{ id, code, qrCode, rewardName, memberName, status, unitName?, fulfilledByName?, createdAt, expiresAt }]
//   catalogFor(ctx, customerId) → [{ rewardId, name, kind, pointsCost, stampsCost?, stampCardName?, stock, eligible: boolean, affordable: boolean, reason?: string }] เฉพาะ active + showToCustomer + ในช่วงเวลา (ระดับไม่ตรง → eligible false + reason ไทย · ไม่ตัดออก) — M2.9 LIFF ใช้
//   UI (ภาพ 05 + 18): /member/rewards (แคตตาล็อกการ์ดรูป/ชื่อ/ราคา แต้ม·สต็อก·ระดับ + ตาราง 'รอรับ' + ปุ่ม เพิ่มรางวัล) · /member/rewards/new + /member/rewards/[rewardId] (ฟอร์ม ภาพ 18 ซ้าย: อัปโหลดรูป · ชื่อ · ชนิด · ราคา แต้ม และ/หรือ สแตมป์ (+เลือกการ์ด) · สต็อก · จำกัดระดับ · จำกัด ชิ้น/คน/เดือน · ช่วงเวลา · สาขาที่รับได้ · รับของภายใน n วัน · แสดงบน LINE) · /member/rewards/fulfil (ภาพ 18 ขวา: ช่องสแกน QR/พิมพ์รหัส → ผลการสแกน (ของรางวัล/สมาชิก+ระดับ/แลกเมื่อ/หมดอายุรับ) → ส่งมอบแล้ว / ยกเลิก (คืนแต้ม)) · /member/rewards/redemptions (ประวัติการแลก: รหัส · ของรางวัล · สมาชิก · สถานะ ชิป · สาขา · พนักงานที่ส่งมอบ)
//   testid: rewards-page rewards-catalog rewards-card-<id> rewards-pending rewards-add · rewards-editor rewards-editor-form rewards-kind rewards-cost rewards-save · rewards-fulfil rewards-fulfil-input rewards-fulfil-result rewards-fulfil-confirm rewards-fulfil-cancel · rewards-redemptions rewards-redemptions-table
//   actions: reward/reward-actions.ts "use server" gate loyalty.manage / loyalty.read (redeem) / loyalty.fulfil · nav.ts rewards → ready · facade reward/index.ts export createRewardV2 updateRewardV2 toggleReward listRewardsV2 redeemV2 fulfilV2 cancelV2 expireDue lookupRedemption listRedemptionsV2 catalogFor · v2.ts ไม่ import โมดูลอื่นตรงนอก facade (point/stamp/member ผ่าน @/lib/modules/<x>) · ไม่มี any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const migDir = existsSync("prisma/migrations") ? readdirSync("prisma/migrations").find((d) => /_member_v2_d2$/.test(d)) : undefined;
if (!migDir || !existsSync("src/lib/modules/reward/v2.ts") || !existsSync("src/app/app/sys/[id]/member/rewards/page.tsx")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (migration member_v2_d2 · reward/v2.ts · member/rewards/page.tsx)");
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
const P = prisma as Any;
let tid = ""; let SYS = ""; let PT = ""; let RW = "";
const tag = Date.now().toString(36);
const made = { rewards: [] as string[], cards: [] as string[], customers: [] as string[], ledgerKeys: [] as string[], redemptions: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId; PT = scope.systems.POINT as string; RW = scope.systems.REWARD as string;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const RV = (await import("@/lib/modules/reward" as string)) as Record<string, (...a: Any[]) => Any>;
  const PS = (await import("@/lib/modules/point" as string)) as Record<string, (...a: Any[]) => Any>;
  const ST = (await import("@/lib/modules/stamp" as string)) as Record<string, (...a: Any[]) => Any>;
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const { MEMBER_LIMITS } = (await import("@/lib/modules/member/limits" as string)) as Any;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId);
  const thana0 = await actorOf(E.users.staff.thana.userId);
  const thanaF = { ...thana0, permissions: { ...thana0.permissions, "member.loyalty.fulfil": true, "member.loyalty.read": true } };
  const noPerm = await actorOf(E.users.noPerm.userId);
  const ctx = { tenantId: tid, systemId: RW, memberSystemId: SYS, pointSystemId: PT, actorUserId: E.users.owner.userId as string };
  const sctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const pctx = { tenantId: tid, systemId: PT, memberSystemId: SYS, actorUserId: E.users.owner.userId as string };
  const outbox = (type: string, pred: (p: Any) => boolean) => P.outboxEvent.findMany({ where: { tenantId: tid, type }, orderBy: { createdAt: "desc" }, take: 40 }).then((rows: Any[]) => rows.find((r) => pred(r.payload)));
  const bal = (cid: string) => PS.getBalance(PT, cid);
  const key = (s: string) => `qc24-${tag}-${s}`;
  const gold = await P.memberTierDef.findFirst({ where: { systemId: SYS, key: "gold" } });
  const mkCust = async (nm: string, unit: string) => { const c = await PR.createMember(sctx as Any, owner, { phone: `0894${String((Date.now() + Math.floor(Math.random() * 1000)) % 1_000_000).padStart(6, "0")}`, firstName: nm, lastName: "รางวัล", source: "STAFF", homeUnitId: unit }); made.customers.push(c.customerId); return c.customerId as string; };
  const give = async (cid: string, pts: number, k: string) => { made.ledgerKeys.push(key(k)); return PS.earnWithLot(pctx, { customerId: cid, points: pts, refType: "QC", refId: key(k), idempotencyKey: key(k) }); };
  const mk = async (input: Any) => { const r = await RV.createRewardV2(ctx, owner, { kind: "ITEM", pointsCost: 100, stock: 5, tierDefIds: [], unitIds: [], pickupDays: 14, showToCustomer: true, ...input, name: `${input.name} ${tag}` }); made.rewards.push(r.id); return r; };
  const red = (id: string) => P.rewardRedemption.findUnique({ where: { id } });

  // ═══ S1 schema + แคตตาล็อก ═══
  const rc = await cols("Reward"); const rr = await cols("RewardRedemption");
  const sql = read(`prisma/migrations/${migDir}/migration.sql`);
  const destructive = sql.split("\n").filter((l) => /^\s*(ALTER TABLE .*\b(DROP COLUMN|ALTER COLUMN [^;]*\bTYPE)|DROP TABLE|DROP TYPE)\b/i.test(l));
  const applied = await q<{ finished_at: Date | null }>(`select finished_at from "_prisma_migrations" where migration_name='${migDir}'`);
  const diff = spawnSync("pnpm", ["exec", "prisma", "migrate", "diff", "--from-config-datasource", "prisma.config.ts", "--to-schema", "prisma/schema", "--script"], { encoding: "utf8", env: process.env, timeout: 300_000 });
  const kinds = await enumVals("RewardKind");
  chk("M2.4-S1.1", "migration member_v2_d2: Reward +{kind imageFileId stampCardId stampsCost tierDefIds perMemberMonthly startAt endAt unitIds pickupDays showToCustomer} · RewardRedemption +{qrCode expiresAt fulfilledById fulfilledUnitId cancelReason} · enum RewardKind {ITEM SERVICE VOUCHER DISCOUNT} · additive · applied · migrate diff = empty · v1 service.ts ยัง export redeem/fulfillRedemption/cancelRedemption",
    ["kind", "imageFileId", "stampCardId", "stampsCost", "tierDefIds", "perMemberMonthly", "startAt", "endAt", "unitIds", "pickupDays", "showToCustomer"].every((c) => rc.has(c)) && ["qrCode", "expiresAt", "fulfilledById", "fulfilledUnitId", "cancelReason"].every((c) => rr.has(c)) && ["ITEM", "SERVICE", "VOUCHER", "DISCOUNT"].every((k) => kinds.includes(k)) && destructive.length === 0 && !!applied[0]?.finished_at && /empty migration/i.test(diff.stdout + diff.stderr) && /export async function (redeem|fulfillRedemption|cancelRedemption)\b/.test(read("src/lib/modules/reward/service.ts")),
    "ครบ", `reward=${["kind", "stampsCost", "pickupDays", "showToCustomer"].map((c) => rc.has(c)).join("/")} red=${["qrCode", "expiresAt", "cancelReason"].map((c) => rr.has(c)).join("/")} kinds=${kinds.length} destructive=${destructive.length} applied=${!!applied[0]?.finished_at} diff=${/empty migration/i.test(diff.stdout + diff.stderr)}`);

  const eName = await fails(() => RV.createRewardV2(ctx, owner, { name: " ", kind: "ITEM", pointsCost: 10 }));
  const eKind = await fails(() => RV.createRewardV2(ctx, owner, { name: "x", kind: "GOLD", pointsCost: 10 }));
  const eNoCost = await fails(() => RV.createRewardV2(ctx, owner, { name: "x", kind: "ITEM", pointsCost: 0 }));
  const eStampNoCard = await fails(() => RV.createRewardV2(ctx, owner, { name: "x", kind: "ITEM", pointsCost: 0, stampsCost: 2 }));
  const ePerm = await fails(() => RV.createRewardV2(ctx, thanaF, { name: "x", kind: "ITEM", pointsCost: 10 }));
  const shirt = await mk({ name: "เสื้อยืด SHARK", kind: "ITEM", pointsCost: 800, stock: 12 });
  await RV.updateRewardV2(ctx, owner, shirt.id, { description: "ไซซ์ M", pickupDays: 7 });
  const list = await RV.listRewardsV2(ctx);
  const rowS = list.find((r: Any) => r.id === shirt.id);
  await RV.toggleReward(ctx, owner, shirt.id, false);
  const off = await prisma.reward.findUnique({ where: { id: shirt.id } });
  await RV.toggleReward(ctx, owner, shirt.id, true);
  const v2src = read("src/lib/modules/reward/v2.ts");
  chk("M2.4-S1.2", "createRewardV2: ชื่อว่าง/kind นอก enum/ไม่มีราคาเลย/stampsCost ไม่มีการ์ด → throw ไทย · thana (ไม่มี manage) → throw · สร้าง 'เสื้อยืด' 800 แต้ม สต็อก 12 (pickupDays ปริยาย 14 · showToCustomer true) · update description+pickupDays 7 · listRewardsV2 มี stats {pending, fulfilled} · toggle off → active false · เพดาน MEMBER_LIMITS.rewards 200 อ้างในโค้ด",
    thai(eName) && thai(eKind) && thai(eNoCost) && thai(eStampNoCard) && !!ePerm && shirt.pickupDays === 14 && shirt.showToCustomer === true && rowS?.description === "ไซซ์ M" && rowS.pickupDays === 7 && rowS.stats && typeof rowS.stats.pending === "number" && off?.active === false && MEMBER_LIMITS.rewards === 200 && /rewards/.test(v2src),
    "ตามสัญญา", `name=${thai(eName)} kind=${thai(eKind)} nocost=${thai(eNoCost)} stamp=${thai(eStampNoCard)} perm=${!!ePerm} pd=${shirt?.pickupDays} show=${shirt?.showToCustomer} row=${JSON.stringify(rowS?.stats)} off=${off?.active}`);

  // ═══ S2 redeem ═══
  const X = await mkCust("แลก", E.units.patong);
  await give(X, 1000, "x1");
  const b0 = await bal(X);
  const r1 = await RV.redeemV2(ctx, owner, { rewardId: shirt.id, customerId: X, idempotencyKey: key("r1") });
  made.redemptions.push(r1?.redemptionId);
  const rd1 = await red(r1?.redemptionId);
  const sh1 = await prisma.reward.findUnique({ where: { id: shirt.id } });
  const led1 = await prisma.pointLedger.findFirst({ where: { customerId: X, refId: r1?.redemptionId } });
  const ob1 = await outbox("reward.redeemed", (p) => p.redemptionId === r1?.redemptionId);
  const r1b = await RV.redeemV2(ctx, owner, { rewardId: shirt.id, customerId: X, idempotencyKey: key("r1") });
  const b1 = await bal(X);
  chk("M2.4-S2.1", "redeem ด้วยแต้ม: X (1,000 แต้ม) แลกเสื้อ 800 → {redemptionId, qrCode ≥ 12 ตัว, code, expiresAt ≈ now+7 วัน (pickupDays 7), pointsCost 800} · RewardRedemption PENDING pointsCost 800 qrCode expiresAt · แต้ม 200 (ledger BURN refType RewardRedemption refId redemptionId) · สต็อก 11 · event reward.redeemed {customerId, rewardId, redemptionId} · idempotencyKey ซ้ำ → redemptionId เดิม แต้มไม่ลดซ้ำ",
    !!r1?.redemptionId && typeof r1.qrCode === "string" && r1.qrCode.length >= 12 && !!r1.code && r1.pointsCost === 800 && rd1?.status === "PENDING" && rd1.pointsCost === 800 && rd1.qrCode === r1.qrCode && Math.abs(new Date(rd1.expiresAt).getTime() - (Date.now() + 7 * 86_400_000)) < 600_000 && b0 - b1 === 800 && !!led1 && led1.delta === -800 && sh1?.stock === 11 && !!ob1 && ob1.payload.customerId === X && ob1.payload.rewardId === shirt.id && r1b?.redemptionId === r1.redemptionId,
    "แลกสำเร็จ 800", `r1=${JSON.stringify(r1)} rd=${rd1?.status}/${rd1?.pointsCost} bal=${b0}->${b1} led=${led1?.delta} stock=${sh1?.stock} ob=${!!ob1} again=${r1b?.redemptionId === r1?.redemptionId}`);

  const eNoPts = await fails(() => RV.redeemV2(ctx, owner, { rewardId: shirt.id, customerId: X, idempotencyKey: key("r2") }));
  const zero = await mk({ name: "ของหมด", pointsCost: 10, stock: 0 });
  const eStock = await fails(() => RV.redeemV2(ctx, owner, { rewardId: zero.id, customerId: X, idempotencyKey: key("r3") }));
  await RV.toggleReward(ctx, owner, zero.id, false);
  const eOff = await fails(() => RV.redeemV2(ctx, owner, { rewardId: zero.id, customerId: X, idempotencyKey: key("r4") }));
  const eNoPerm = await fails(() => RV.redeemV2(ctx, noPerm, { rewardId: shirt.id, customerId: X, idempotencyKey: key("r5") }));
  const custX = { role: "CUSTOMER", customerId: X, userId: null, unitAccess: [], permissions: {} };
  const eSelfOther = await fails(() => RV.redeemV2(ctx, custX, { rewardId: shirt.id, customerId: m(1).id, idempotencyKey: key("r6") }));
  const b2 = await bal(X); const sh2 = await prisma.reward.findUnique({ where: { id: shirt.id } });
  chk("M2.4-S2.2", "ไม่ผ่าน = ไม่เขียน: แต้มไม่พอ (200 < 800) → throw ไทย · สต็อก 0 → throw ไทย · ปิดใช้งาน → throw · noPerm → throw · ลูกค้าแลกให้คนอื่น → throw · แต้ม/สต็อกเท่าเดิม (200 · 11) · ไม่มี redemption เพิ่ม",
    thai(eNoPts) && thai(eStock) && !!eOff && !!eNoPerm && !!eSelfOther && b2 === 200 && sh2?.stock === 11 && (await P.rewardRedemption.count({ where: { customerId: X } })) === 1,
    "throw ทุกข้อ", `pts=${eNoPts?.message?.slice(0, 40)} stock=${eStock?.message?.slice(0, 40)} off=${!!eOff} np=${!!eNoPerm} self=${!!eSelfOther} bal=${b2} stock=${sh2?.stock} n=${await P.rewardRedemption.count({ where: { customerId: X } })}`);

  const goldOnly = await mk({ name: "ดำน้ำฟรี Gold+", kind: "SERVICE", pointsCost: 50, tierDefIds: [gold.id], stock: null });
  const goldCust = (await prisma.customer.findFirst({ where: { memberSystemId: SYS, tierDefId: gold.id, homeUnitId: E.units.patong, status: "ACTIVE" as Any } }))!;
  const gb0 = await bal(goldCust.id);
  await give(goldCust.id, 200, "g1");
  const eTier = await fails(() => RV.redeemV2(ctx, owner, { rewardId: goldOnly.id, customerId: X, idempotencyKey: key("t1") }));
  const rg = await RV.redeemV2(ctx, owner, { rewardId: goldOnly.id, customerId: goldCust.id, idempotencyKey: key("t2") });
  made.redemptions.push(rg?.redemptionId);
  const future = await mk({ name: "ยังไม่เริ่ม", pointsCost: 10, startAt: new Date(Date.now() + 5 * 86_400_000) });
  const past = await mk({ name: "จบแล้ว", pointsCost: 10, endAt: new Date(Date.now() - 86_400_000) });
  const eFuture = await fails(() => RV.redeemV2(ctx, owner, { rewardId: future.id, customerId: X, idempotencyKey: key("t3") }));
  const ePast = await fails(() => RV.redeemV2(ctx, owner, { rewardId: past.id, customerId: X, idempotencyKey: key("t4") }));
  chk("M2.4-S2.3", "ระดับ/ช่วงเวลา: รางวัล Gold+ — X (member) → throw ไทย · สมาชิก gold → แลกได้ (สต็อก null ไม่จำกัด) · startAt อนาคต → throw ไทย · endAt ผ่านแล้ว → throw ไทย",
    thai(eTier) && !!rg?.redemptionId && (await bal(goldCust.id)) === gb0 + 150 && thai(eFuture) && thai(ePast),
    "กรองตามเกณฑ์", `tier=${eTier?.message?.slice(0, 40)} gold=${!!rg?.redemptionId} bal=${await bal(goldCust.id)}/${gb0 + 150} future=${eFuture?.message?.slice(0, 40)} past=${ePast?.message?.slice(0, 40)}`);

  const monthly = await mk({ name: "จำกัด 1/เดือน ป่าตอง", pointsCost: 10, perMemberMonthly: 1, unitIds: [E.units.patong] });
  const rm1 = await RV.redeemV2(ctx, owner, { rewardId: monthly.id, customerId: X, idempotencyKey: key("m1") });
  made.redemptions.push(rm1?.redemptionId);
  const eMonthly = await fails(() => RV.redeemV2(ctx, owner, { rewardId: monthly.id, customerId: X, idempotencyKey: key("m2") }));
  await RV.cancelV2(ctx, owner, { redemptionId: rm1.redemptionId, reason: "ทดสอบ" });
  const rm2 = await RV.redeemV2(ctx, owner, { rewardId: monthly.id, customerId: X, idempotencyKey: key("m3") });
  made.redemptions.push(rm2?.redemptionId);
  const Yk = await mkCust("กะตะ", E.units.kata);
  await give(Yk, 100, "y1");
  const eUnit = await fails(() => RV.redeemV2(ctx, owner, { rewardId: monthly.id, customerId: Yk, idempotencyKey: key("m4") }));
  const rmUnit = await RV.redeemV2(ctx, owner, { rewardId: monthly.id, customerId: Yk, unitId: E.units.patong, idempotencyKey: key("m5") });
  made.redemptions.push(rmUnit?.redemptionId);
  chk("M2.4-S2.4", "ต่อคนต่อเดือน 1: แลกครั้งแรกได้ · ครั้งที่ 2 เดือนเดียวกัน → throw ไทย · ยกเลิกครั้งแรก (CANCELLED ไม่นับ) → แลกใหม่ได้ · สาขา: unitIds [ป่าตอง] — ลูกค้า homeUnit กะตะ ไม่ส่ง unitId → throw ไทย · ส่ง unitId ป่าตอง → ได้",
    !!rm1?.redemptionId && thai(eMonthly) && !!rm2?.redemptionId && thai(eUnit) && !!rmUnit?.redemptionId,
    "จำกัดตามกติกา", `m1=${!!rm1?.redemptionId} m2=${eMonthly?.message?.slice(0, 40)} m3=${!!rm2?.redemptionId} unit=${eUnit?.message?.slice(0, 40)} unitOk=${!!rmUnit?.redemptionId}`);

  const card = await ST.createCard(sctx, owner, { name: `การ์ดล้างอุปกรณ์ ${tag}`, slots: 5, ruleKind: "MANUAL", ruleConfig: { perDayMax: 10 }, rewardKind: "POINTS", rewardConfig: { points: 10 }, autoRestart: true, tierDefIds: [], unitIds: [] });
  made.cards.push(card.id);
  await ST.addStamp(sctx, owner, { cardId: card.id, customerId: X, count: 3, idempotencyKey: key("s1") });
  const hat = await mk({ name: "หมวก SHARK", pointsCost: 0, stampCardId: card.id, stampsCost: 2, stock: 3 });
  const rs = await RV.redeemV2(ctx, owner, { rewardId: hat.id, customerId: X, idempotencyKey: key("s2") });
  made.redemptions.push(rs?.redemptionId);
  const prg = await P.stampCardProgress.findFirst({ where: { cardId: card.id, customerId: X, completedAt: null } });
  const useEv = prg ? await P.stampEvent.findFirst({ where: { progressId: prg.id, type: "USE", refId: rs?.redemptionId } }) : null;
  const eStamps = await fails(() => RV.redeemV2(ctx, owner, { rewardId: hat.id, customerId: X, idempotencyKey: key("s3") }));
  const b3 = await bal(X);
  chk("M2.4-S2.5", "แลกด้วยสแตมป์: X มี 3 ตรา → แลกหมวก (2 ตรา · 0 แต้ม) → progress 1 · StampEvent USE count 2 refType REWARD refId redemptionId · redemption stampsCost 2 pointsCost 0 · แต้มไม่ลด · แลกอีก (เหลือ 1) → throw ไทย",
    !!rs?.redemptionId && rs.stampsCost === 2 && rs.pointsCost === 0 && prg?.stamps === 1 && !!useEv && useEv.count === 2 && useEv.refType === "REWARD" && b3 === 190 && thai(eStamps),
    "USE 2 ตรา", `rs=${JSON.stringify(rs)} stamps=${prg?.stamps} use=${useEv?.count}/${useEv?.refType} bal=${b3} again=${eStamps?.message?.slice(0, 40)}`);

  // ═══ S3 fulfil / cancel / expire ═══
  const eFulPerm = await fails(() => RV.fulfilV2(ctx, noPerm, { redemptionId: r1.redemptionId, unitId: E.units.patong }));
  const f1 = await RV.fulfilV2(ctx, thanaF, { redemptionId: r1.redemptionId, unitId: E.units.patong });
  const rdF = await red(r1.redemptionId);
  const obF = await outbox("reward.fulfilled", (p) => p.redemptionId === r1.redemptionId);
  const f1b = await RV.fulfilV2(ctx, thanaF, { redemptionId: r1.redemptionId, unitId: E.units.patong });
  const nF = await P.outboxEvent.count({ where: { tenantId: tid, type: "reward.fulfilled", payload: { path: ["redemptionId"], equals: r1.redemptionId } } });
  const eFulUnit = await fails(() => RV.fulfilV2(ctx, owner, { redemptionId: rm2.redemptionId, unitId: E.units.kata }));
  chk("M2.4-S3.1", "fulfil: noPerm → throw · thana (loyalty.fulfil · ป่าตอง) ส่งมอบเสื้อ → FULFILLED fulfilledById=thana fulfilledUnitId=ป่าตอง · event reward.fulfilled · ส่งมอบซ้ำ → ok idempotent ไม่ยิง event ซ้ำ (1) · รางวัล unitIds [ป่าตอง] ส่งมอบที่กะตะ → throw ไทย",
    !!eFulPerm && f1?.ok === true && rdF?.status === "FULFILLED" && rdF.fulfilledById === thanaF.userId && rdF.fulfilledUnitId === E.units.patong && !!obF && f1b?.ok === true && nF === 1 && thai(eFulUnit),
    "ส่งมอบ 1 ครั้ง", `perm=${!!eFulPerm} f1=${JSON.stringify(f1)} st=${rdF?.status}/${rdF?.fulfilledById === thanaF.userId}/${rdF?.fulfilledUnitId === E.units.patong} ob=${!!obF} n=${nF} unit=${eFulUnit?.message?.slice(0, 40)}`);

  const eCancelDone = await fails(() => RV.cancelV2(ctx, owner, { redemptionId: r1.redemptionId, reason: "x" }));
  const gb1 = await bal(goldCust.id);
  const stockBefore = (await prisma.reward.findUnique({ where: { id: goldOnly.id } }))?.stock;
  const c1 = await RV.cancelV2(ctx, thanaF, { redemptionId: rg.redemptionId, reason: "ลูกค้าเปลี่ยนใจ" });
  const rdC = await red(rg.redemptionId);
  const c1b = await RV.cancelV2(ctx, thanaF, { redemptionId: rg.redemptionId, reason: "ซ้ำ" });
  const gb2 = await bal(goldCust.id);
  chk("M2.4-S3.2", "cancel: ยกเลิกรายการที่ส่งมอบแล้ว → throw ไทย · ยกเลิก PENDING (ดำน้ำฟรี 50 แต้ม) → CANCELLED cancelReason · {refundedPoints 50} · แต้มคืน +50 · สต็อก null คงเดิม · ยกเลิกซ้ำ → idempotent refunded 0 แต้มไม่คืนซ้ำ",
    thai(eCancelDone) && c1?.ok === true && c1.refundedPoints === 50 && rdC?.status === "CANCELLED" && rdC.cancelReason === "ลูกค้าเปลี่ยนใจ" && gb2 - gb1 === 50 && (await prisma.reward.findUnique({ where: { id: goldOnly.id } }))?.stock === stockBefore && c1b?.refundedPoints === 0 && (await bal(goldCust.id)) === gb2,
    "คืน 50 ครั้งเดียว", `done=${eCancelDone?.message?.slice(0, 40)} c1=${JSON.stringify(c1)} st=${rdC?.status}/${rdC?.cancelReason} bal=${gb2 - gb1} again=${JSON.stringify(c1b)}`);

  const hatStock0 = (await prisma.reward.findUnique({ where: { id: hat.id } }))?.stock;
  const c2 = await RV.cancelV2(ctx, owner, { redemptionId: rs.redemptionId, reason: "คืนสแตมป์" });
  const prg2 = await P.stampCardProgress.findFirst({ where: { cardId: card.id, customerId: X, completedAt: null } });
  const backEv = prg2 ? await P.stampEvent.findFirst({ where: { progressId: prg2.id, refType: "REWARD_CANCEL", refId: rs.redemptionId } }) : null;
  chk("M2.4-S3.3", "cancel รายการสแตมป์: {refundedStamps 2} · progress กลับเป็น 3 · StampEvent ADD refType REWARD_CANCEL refId redemptionId (ไม่ติด perDayMax) · สต็อกหมวก +1 (3)",
    c2?.ok === true && c2.refundedStamps === 2 && prg2?.stamps === 3 && !!backEv && backEv.count === 2 && (await prisma.reward.findUnique({ where: { id: hat.id } }))?.stock === (hatStock0 ?? 0) + 1,
    "คืน 2 ตรา", `c2=${JSON.stringify(c2)} stamps=${prg2?.stamps} ev=${backEv?.count}/${backEv?.refType} stock=${(await prisma.reward.findUnique({ where: { id: hat.id } }))?.stock}/${(hatStock0 ?? 0) + 1}`);

  const bX0 = await bal(X);
  const rx = await RV.redeemV2(ctx, owner, { rewardId: monthly.id, customerId: Yk, unitId: E.units.patong, idempotencyKey: key("e1") }).catch(() => null);
  const target = rx?.redemptionId ?? rmUnit.redemptionId;
  made.redemptions.push(target);
  await P.rewardRedemption.update({ where: { id: target }, data: { expiresAt: new Date(Date.now() - 3600_000) } });
  const eFulExpired = await fails(() => RV.fulfilV2(ctx, owner, { redemptionId: target, unitId: E.units.patong }));
  const yb0 = await bal(Yk);
  const ex = await RV.expireDue();
  const rdX = await red(target);
  const yb1 = await bal(Yk);
  const cron = read("src/lib/platform/cron.ts");
  chk("M2.4-S3.4", "หมดอายุรับ: expiresAt ผ่านแล้ว → fulfil throw ไทย 'หมดอายุ' · expireDue() → {expired ≥ 1} · รายการ → CANCELLED cancelReason EXPIRED · คืนแต้ม (+10) · X ไม่โดน · cron.ts step rewardExpire + summary rewardExpired",
    thai(eFulExpired) && typeof ex?.expired === "number" && ex.expired >= 1 && rdX?.status === "CANCELLED" && rdX.cancelReason === "EXPIRED" && yb1 - yb0 === 10 && (await bal(X)) === bX0 && /rewardExpire/.test(cron) && /rewardExpired/.test(cron),
    "หมดอายุ → คืน", `ful=${eFulExpired?.message?.slice(0, 40)} ex=${JSON.stringify(ex)} st=${rdX?.status}/${rdX?.cancelReason} y=${yb1 - yb0} cron=${/rewardExpire/.test(cron)}`);

  // ═══ S4 lookup / list / catalog ═══
  const lk1 = await RV.lookupRedemption(ctx, { code: r1.qrCode });
  const lk2 = await RV.lookupRedemption(ctx, { code: r1.code });
  const lk3 = await RV.lookupRedemption(ctx, { code: "NOPE-000000" });
  const other = await prisma.tenant.findFirst({ where: { id: { not: tid } } });
  const lk4 = other ? await RV.lookupRedemption({ ...ctx, tenantId: other.id }, { code: r1.qrCode }) : null;
  chk("M2.4-S4.1", "lookupRedemption: ด้วย qrCode → {redemption{id,status FULFILLED,expiresAt,pointsCost 800}, reward{name เสื้อยืด,kind ITEM}, member{customerId X, name, memberCode}, fulfilledBy{name thana}} · ด้วย code v1 → รายการเดียวกัน · ไม่พบ → null · ต่างร้าน → null",
    lk1?.redemption?.id === r1.redemptionId && lk1.redemption.status === "FULFILLED" && lk1.redemption.pointsCost === 800 && /เสื้อยืด/.test(lk1.reward?.name ?? "") && lk1.reward.kind === "ITEM" && lk1.member?.customerId === X && !!lk1.member.memberCode && !!lk1.fulfilledBy?.name && lk2?.redemption?.id === r1.redemptionId && lk3 === null && lk4 === null,
    "พบ/ไม่พบตามสัญญา", `lk1=${JSON.stringify({ id: lk1?.redemption?.id === r1?.redemptionId, st: lk1?.redemption?.status, rw: lk1?.reward?.name, mem: lk1?.member?.customerId === X, fb: lk1?.fulfilledBy?.name })} lk2=${lk2?.redemption?.id === r1?.redemptionId} lk3=${lk3} lk4=${lk4}`);

  const rows = await RV.listRedemptionsV2(ctx, { status: "FULFILLED", take: 50 });
  const rowsUnit = await RV.listRedemptionsV2(ctx, { unitId: E.units.patong, take: 50 });
  const hidden = await mk({ name: "ลับ", pointsCost: 5, showToCustomer: false });
  const cat = await RV.catalogFor(ctx, X);
  const cShirt = cat.find((c: Any) => c.rewardId === shirt.id); const cGold = cat.find((c: Any) => c.rewardId === goldOnly.id); const cHat = cat.find((c: Any) => c.rewardId === hat.id);
  chk("M2.4-S4.2", "listRedemptionsV2 status FULFILLED มีเสื้อ (rewardName · memberName · fulfilledByName · unitName ป่าตอง) · กรอง unitId ป่าตอง มีรายการที่ส่งมอบที่ป่าตอง · catalogFor(X): เสื้อ affordable false (190 < 800) eligible true · Gold+ eligible false + reason ไทย · หมวก (สแตมป์ 2 · X มี 3) affordable true stampCardName · ไม่มี 'ลับ' (showToCustomer false) · ไม่มีรางวัลที่ปิด/นอกช่วงเวลา",
    rows.some((r: Any) => r.id === r1.redemptionId && /เสื้อยืด/.test(r.rewardName) && !!r.memberName && !!r.fulfilledByName && /ป่าตอง/.test(r.unitName ?? "")) && rowsUnit.some((r: Any) => r.id === r1.redemptionId) && cShirt && cShirt.affordable === false && cShirt.eligible === true && cGold && cGold.eligible === false && /[ก-๙]/.test(cGold.reason ?? "") && cHat && cHat.affordable === true && !!cHat.stampCardName && !cat.some((c: Any) => c.rewardId === hidden.id) && !cat.some((c: Any) => c.rewardId === zero.id || c.rewardId === future.id || c.rewardId === past.id),
    "รายการ + แคตตาล็อกตามเกณฑ์", `rows=${rows.length} unit=${rowsUnit.length} shirt=${JSON.stringify(cShirt)} gold=${JSON.stringify(cGold)} hat=${JSON.stringify(cHat)} hidden=${cat.some((c: Any) => c.rewardId === hidden.id)}`);

  // ═══ S5 หน้า ═══
  const pages = { home: read("src/app/app/sys/[id]/member/rewards/page.tsx"), editor: read("src/app/app/sys/[id]/member/rewards/[rewardId]/page.tsx"), neu: read("src/app/app/sys/[id]/member/rewards/new/page.tsx"), fulfil: read("src/app/app/sys/[id]/member/rewards/fulfil/page.tsx"), history: read("src/app/app/sys/[id]/member/rewards/redemptions/page.tsx") };
  const act = read("src/lib/modules/reward/reward-actions.ts");
  const facade = read("src/lib/modules/reward/index.ts");
  const nav = read("src/lib/modules/member/nav.ts");
  const compDir = "src/components/member";
  const comps = existsSync(compDir) ? readdirSync(compDir).filter((f) => /reward/i.test(f)).map((f) => read(`${compDir}/${f}`)).join("\n") : "";
  const all = Object.values(pages).join("\n") + comps;
  const TIDS = ["rewards-page", "rewards-catalog", "rewards-card-", "rewards-pending", "rewards-add", "rewards-editor", "rewards-editor-form", "rewards-kind", "rewards-cost", "rewards-save", "rewards-fulfil", "rewards-fulfil-input", "rewards-fulfil-result", "rewards-fulfil-confirm", "rewards-fulfil-cancel", "rewards-redemptions", "rewards-redemptions-table"];
  const missingT = TIDS.filter((t) => !all.includes(t));
  const FAC = ["createRewardV2", "updateRewardV2", "toggleReward", "listRewardsV2", "redeemV2", "fulfilV2", "cancelV2", "expireDue", "lookupRedemption", "listRedemptionsV2", "catalogFor"];
  const missingF = FAC.filter((f) => !new RegExp(`\\b${f}\\b`).test(facade));
  const clean = all.replace(/\/\/.*$/gm, "");
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(clean); const hex = /#[0-9a-fA-F]{6}\b/.test(clean);
  chk("M2.4-S5.1", "หน้า 5 หน้า (rewards · new · [rewardId] · fulfil · redemptions) requireTenant + สิทธิ์ (อ่าน/manage/fulfil) · actions 'use server' gate · testid 17 · nav rewards → ready · facade export 11 · v2.ts ไม่ import โมดูลอื่นตรงนอก facade · ไม่มี any/อีโมจิ/hex",
    Object.values(pages).every((p) => p.length > 0 && /requireTenant/.test(p)) && /loyalty\.manage/.test(pages.editor + act) && /loyalty\.fulfil/.test(pages.fulfil + act) && /["']use server["']/.test(act) && missingT.length === 0 && /key:\s*"rewards"[^\n]*status:\s*"ready"/.test(nav) && missingF.length === 0 && !/@\/lib\/modules\/(point|stamp|member|pos|booking)\/(?!index)[a-z-]+"/.test(v2src) && !/:\s*any\b/.test(v2src + act) && !emoji && !hex,
    "ครบ", `pages=${Object.values(pages).map((p) => p.length > 0).join("/")} tid-missing=${missingT.join(",") || "-"} nav=${/key:\s*"rewards"[^\n]*status:\s*"ready"/.test(nav)} facade-missing=${missingF.join(",") || "-"} deepImport=${/@\/lib\/modules\/(point|stamp|member|pos|booking)\/(?!index)[a-z-]+"/.test(v2src)} any=${/:\s*any\b/.test(v2src + act)} emoji=${emoji} hex=${hex}`);
  const LABELS = ["แคตตาล็อกของรางวัล", "รอรับ", "เพิ่มของรางวัล", "อัปโหลดรูป", "ชนิด", "ราคา", "และ/หรือ", "สแตมป์", "สต็อก", "จำกัดระดับ", "ชิ้น / คน / เดือน", "ช่วงเวลา", "สาขาที่รับได้", "รับของภายใน", "แสดงบน LINE", "รับของ", "สแกน QR", "ผลการสแกน", "ส่งมอบแล้ว", "ยกเลิก (คืนแต้ม)", "ประวัติการแลก", "พนักงานที่ส่งมอบ"];
  const missingL = LABELS.filter((l) => !all.includes(l));
  chk("M2.4-S5.2", "ภาพ 05/18: ป้ายครบ (แคตตาล็อก การ์ดรูป/ชื่อ/'n แต้ม · สต็อก n'/'เฉพาะ Gold+' · ตารางรอรับ · ฟอร์ม ภาพ 18 ทุกแถว · แผงรับของ สแกน QR/พิมพ์รหัส → ผลการสแกน → ส่งมอบแล้ว/ยกเลิก (คืนแต้ม) · ประวัติการแลก คอลัมน์ รหัส/ของรางวัล/สมาชิก/สถานะ/สาขา/พนักงานที่ส่งมอบ) · ชิปสถานะไทย รอรับ/รับแล้ว/ยกเลิก",
    missingL.length === 0 && /รับแล้ว/.test(all), "ครบ", `missing=${missingL.join(",") || "-"}`, "MAJOR");

  // ═══ S6 ภาพ ═══
  const dir = `${mq.MQC.shotsDir}/2.4`;
  const sum = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sum(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  const ok = (u: string, n: string, d: string) => r(u, n, d)?.status === 200 && r(u, n, d)?.missing?.length === 0 && r(u, n, d)?.errors?.length === 0 && !r(u, n, d)?.overflow;
  chk("M2.4-S6.1", "ภาพ 05: rewards-owner desktop+mobile 200 ไม่ล้น · ภาพ 18: rewards-editor-owner 200 · rewards-new-owner 200 · rewards-redemptions-owner 200 · thana (read-โดยนัย) 200 · noperm 404",
    ok("owner", "rewards-owner", "desktop") && ok("owner", "rewards-owner", "mobile") && ok("owner", "rewards-editor-owner", "desktop") && ok("owner", "rewards-new-owner", "desktop") && ok("owner", "rewards-redemptions-owner", "desktop") && ok("thana", "rewards-thana", "desktop") && r("noperm", "rewards-noperm", "desktop")?.status === 404,
    "200 ×6 · 404", `${["rewards-owner", "rewards-editor-owner", "rewards-new-owner", "rewards-redemptions-owner"].map((n) => r("owner", n, "desktop")?.status).join("/")} mobile=${r("owner", "rewards-owner", "mobile")?.status}/ovf=${r("owner", "rewards-owner", "mobile")?.overflow} thana=${r("thana", "rewards-thana", "desktop")?.status} noperm=${r("noperm", "rewards-noperm", "desktop")?.status}`);
  chk("M2.4-S6.2", "ภาพ 18 ขวา: rewards-fulfil-owner 200 (ช่องสแกน) · rewards-fulfil-result-owner 200 (พิมพ์รหัสของ TMP24 → ผลการสแกน + ปุ่มส่งมอบ/ยกเลิก)",
    ok("owner", "rewards-fulfil-owner", "desktop") && ok("owner", "rewards-fulfil-result-owner", "desktop"),
    "200 ×2", `${r("owner", "rewards-fulfil-owner", "desktop")?.status}/${r("owner", "rewards-fulfil-result-owner", "desktop")?.status} missing=${JSON.stringify(r("owner", "rewards-fulfil-result-owner", "desktop")?.missing)}`);
  const consumers = read("src/lib/outbox-consumers.ts");
  const A2 = (await import("@/lib/automation/labels" as string)) as Any; const W2 = (await import("@/lib/webhooks/labels" as string)) as Any;
  const in3 = (e: string) => new RegExp(`"${e.replace(/\./g, "\\.")}":`).test(consumers) && A2.AUTOMATION_EVENTS.some((x: Any) => x.value === e && /[ก-๙]/.test(x.label)) && W2.WEBHOOK_EVENTS.filter((x: Any) => x.value === e).length === 1;
  const { drainOutbox } = await import("@/lib/core/outbox");
  const { consumers: CONS } = (await import("@/lib/outbox-consumers" as string)) as Any;
  await drainOutbox(CONS, { limit: 200 });
  const stuck = await P.outboxEvent.count({ where: { tenantId: tid, type: { startsWith: "reward." }, status: { not: "DONE" } } });
  chk("M2.4-S6.3", "🔴 parity ภาพ 05 + 18 — Fable ตรวจด้วยตา · wo-notes/member-M2.4.md มี 'PARITY: ผ่าน' · reward.redeemed/reward.fulfilled ลง 3 ทะเบียน · drain แล้ว reward.* DONE ทั้งหมด",
    /PARITY:\s*ผ่าน/.test(read("ledger/wo-notes/member-M2.4.md")) && in3("reward.redeemed") && in3("reward.fulfilled") && stuck === 0,
    "PARITY + 3 ทะเบียน", `parity=${/PARITY:\s*ผ่าน/.test(read("ledger/wo-notes/member-M2.4.md"))} reg=${in3("reward.redeemed")}/${in3("reward.fulfilled")} stuck=${stuck}`, "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M2.4-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  const redIds = [...new Set(made.redemptions.filter(Boolean))];
  if (made.rewards.length) { const more = await P.rewardRedemption.findMany({ where: { rewardId: { in: made.rewards } }, select: { id: true } }).catch(() => []); for (const x of more) redIds.push(x.id); }
  if (redIds.length) {
    const leds = await prisma.pointLedger.findMany({ where: { tenantId: tid, refId: { in: redIds } }, select: { id: true, customerId: true, delta: true } }).catch(() => [] as Any[]);
    await d(() => P.pointLot.deleteMany({ where: { ledgerId: { in: leds.map((l: Any) => l.id) } } }));
    await d(() => prisma.pointLedger.deleteMany({ where: { id: { in: leds.map((l: Any) => l.id) } } }));
    for (const l of leds) if (!made.customers.includes(l.customerId)) await d(() => P.pointBalance.updateMany({ where: { customerId: l.customerId }, data: { balance: { decrement: l.delta } } }));
    await d(() => P.rewardRedemption.deleteMany({ where: { id: { in: redIds } } }));
  }
  if (made.rewards.length) await d(() => prisma.reward.deleteMany({ where: { id: { in: made.rewards } } }));
  if (made.cards.length) {
    const progs = await P.stampCardProgress.findMany({ where: { cardId: { in: made.cards } }, select: { id: true } }).catch(() => []);
    const pids = progs.map((p: Any) => p.id);
    if (pids.length) { await d(() => P.stampEvent.deleteMany({ where: { progressId: { in: pids } } })); await d(() => P.stampCardProgress.deleteMany({ where: { id: { in: pids } } })); }
    await d(() => P.stampCard.deleteMany({ where: { id: { in: made.cards } } }));
  }
  if (made.ledgerKeys.length) { const leds = await prisma.pointLedger.findMany({ where: { tenantId: tid, idempotencyKey: { in: made.ledgerKeys } }, select: { id: true, customerId: true, delta: true } }).catch(() => [] as Any[]); await d(() => P.pointLot.deleteMany({ where: { ledgerId: { in: leds.map((l: Any) => l.id) } } })); await d(() => prisma.pointLedger.deleteMany({ where: { id: { in: leds.map((l: Any) => l.id) } } })); for (const l of leds) if (!made.customers.includes(l.customerId)) await d(() => P.pointBalance.updateMany({ where: { customerId: l.customerId }, data: { balance: { decrement: l.delta } } })); }
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["rewardRedemption", "stampCardProgress", "pointLot", "pointLedger", "pointBalance", "memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberAccessLog", "memberActivity"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) { await d(() => prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } })); await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } })); }
  }
  for (const t of ["reward.", "stamp.", "point.", "member."]) await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: t }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M2.4: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
