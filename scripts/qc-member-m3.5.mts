// QC — ระบบสมาชิก v2 WO M3.5: แนะนำเพื่อน — ReferralProgram (D6 · ร้านตั้งค่าได้) · โค้ด/ลิงก์/QR ต่อสมาชิก · attach ตอนสมัคร (source REFERRAL) · consumer member.created / pos.sale.paid → convert (SIGNUP | FIRST_PURCHASE ≥ min) · รางวัลสองฝั่ง (แต้ม/voucher ตาม program · idempotent) · กันโกง (เบอร์/device fingerprint) · reject · cap รายเดือน · leaderboard · UI ภาพ 24 + การ์ดใน 360 (ภาพ 08 ขวา) + LIFF แชร์
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M3.5 · พิมพ์เขียว §4.2 (ReferralStatus/ReferralRewardKind) §4.3 (ReferralProgram/Referral) §5.10 referrals §7.1 (referral.joined/converted) §11.7 · ภาพ 24 · 08 (ขวา)
// requires: member-seed
//
// สัญญา (ไม่มี migration ใหม่ — ตาราง ReferralProgram/Referral มาจาก member_v2 (M1.1) · src/lib/modules/member/{referrals.ts, referrals-actions.ts} · facade member/index.ts · หน้า /member/referrals · การ์ดแนะนำเพื่อนใน 360 ?tab=referrals · LIFF /m/[slug]/referral (แชร์) · /r/[code] (ทางเข้าเพื่อน → LIFF join ?ref=<code>))
//   getProgram(ctx) → ค่าปริยายเมื่อยังไม่มีแถว: { enabled false, referrerRewardKind "POINTS", referrerRewardValue { points: 300 }, refereeRewardKind "VOUCHER", refereeRewardValue { kind: "FIXED", value: 100, validDays: 30 }, convertOn "FIRST_PURCHASE", minFirstPurchaseSatang 50_000, monthlyCap 10, fraudPhoneDevice true, shareText (ไทย มี {link}) } · setProgram(ctx, actor, partial) → member.referral.manage · upsert · convertOn ต้อง SIGNUP|FIRST_PURCHASE · monthlyCap ≥ 0/null · rewardValue ตาม kind (POINTS → {points ≥ 0} · VOUCHER → {kind FIXED|PERCENT, value > 0, validDays}) ผิด → throw ไทย
//   codeFor(ctx, customerId) → { code, link: "/r/<code>", shareText (แทน {link} เป็น URL เต็มจาก origin) } · code = Customer.referralCode (M1.4 สร้างให้แล้ว · ว่าง → สร้าง unique 8 ตัว)
//   attach(ctx, { refereeCustomerId, code, device?: { fingerprint?, phone? } }) → { referralId, status: "PENDING" | "REJECTED", rejectReason? } — เรียกจาก consumer member.created (payload.referrerId · หรือ sourceDetail.referralCode) และ LIFF join · กติกา §11.7: code ไม่มี → throw ไทย · referee = referrer (แนะนำตัวเอง) → REJECTED "แนะนำตัวเองไม่ได้" · referee เป็นสมาชิกอยู่ก่อน (createdAt < now-24h หรือ มี PosSale PAID ก่อน attach) → REJECTED "ไม่ใช่สมาชิกใหม่" · unique (tenantId, refereeCustomerId) → เรียกซ้ำคืน referral เดิม (idempotent) · fraudPhoneDevice: device.fingerprint ซ้ำกับผู้แนะนำ (Customer.deviceFingerprint หรือ Referral.refereeContact.fingerprint ของ referrer) หรือเบอร์ referee ซ้ำเบอร์ referrer (normalize) → REJECTED "เบอร์/อุปกรณ์ซ้ำ" · program ปิด (enabled false) → ยังบันทึก PENDING (นับต่อ 30 วัน §11.7) แต่ไม่ convert · event referral.joined {referrerId, refereeId, referralId}
//   evaluateConversion(ctx, { refereeCustomerId, trigger: "SIGNUP" | "PURCHASE", saleId?, netSatang? }) → { converted: boolean, rewarded: boolean, referralId?, reason? } — consumer: member.created → SIGNUP · pos.sale.paid (สมาชิก) → PURCHASE · ตาม program.convertOn: SIGNUP → ทันที · FIRST_PURCHASE → ต้อง PosSale PAID ใบแรกของ referee netSatang ≥ minFirstPurchaseSatang (ต่ำกว่า → converted false reason ไทย · ยัง PENDING · บิลถัดไปที่ถึงขั้นต่ำก็นับ) · PENDING เกิน 30 วันหลังโปรแกรมปิด → ไม่นับ · status CONVERTED convertedAt conversionRef {saleId?, netSatang?} แล้ว rewardBoth ทันที → REWARDED
//   rewardBoth(ctx, referralId) → { referrer: { kind, ref }, referee: { kind, ref }, capped: boolean } — POINTS → point facade earnWithLot refType "REFERRAL" refId referralId idempotencyKey `referral:${referralId}:referrer|referee` · VOUCHER → voucher facade issue adhoc {kind, value, validDays} origin "REFERRAL" originRef {referralId} (idempotent ผ่าน originRef+customerId) · referrerRewardRef/refereeRewardRef = { ledgerId | voucherId } · rewardedAt · monthlyCap: ผู้แนะนำได้รางวัลแล้ว ≥ cap ในเดือนไทยนี้ → เพื่อนยังได้ ผู้แนะนำไม่ได้ (capped true · referrerRewardRef { capped: true }) · เรียกซ้ำ → ไม่จ่ายซ้ำ (ledger/voucher เดิม) · event referral.converted {referrerId, refereeId, referralId, rewards}
//   reject(ctx, actor, referralId, { reason }) → member.referral.manage · PENDING/CONVERTED (ยังไม่ REWARDED) → REJECTED rejectReason · REWARDED → throw ไทย ("จ่ายรางวัลแล้ว")
//   listReferrals(ctx, actor, { status?, referrerCustomerId?, take?, cursor? }) → { items[{ id, referrer{ id, name, memberCode }, referee{ id, name, memberCode } | null, refereeContact, status, createdAt, convertedAt, rewardedAt, conversionRef, rejectReason, rewards { referrer?, referee? } }], nextCursor } · unit scope ตาม referrer.homeUnitId
//   leaderboard(ctx, actor, { days = 90, take = 5 }) → [{ customerId, name, memberCode, referred, converted, pointsEarned }] เรียง converted desc
//   stats(ctx, actor, { days = 90 }) → { referredMembers, conversionPct, costPerMemberSatang, first90dSpendSatang, vsAvgPct } (ภาพ 24 KPI 4 ช่อง) · costPerMember = (แต้มที่จ่าย × 1 บาท/แต้ม ตาม point valuation + voucher value) / converted
//   referralsForMember(ctx, actor, customerId) → { code, link, referred, converted, pointsEarned, tree: [{ refereeId, name, status, convertedAt }] } (การ์ดภาพ 08 ขวา · โค้ด SOMCHAI-42 style = referralCode)
//   consumer: outbox-consumers member.created → referrals.attach (ถ้า payload.referrerId) + evaluateConversion(SIGNUP) · pos.sale.paid → evaluateConversion(PURCHASE) (ผ่าน member-bridges) · 360 tab=referrals · MemberActivity REFERRAL_JOINED / REFERRAL_CONVERTED (referrer) · history M3.7 อ่านต่อ
//   UI (ภาพ 24): /member/referrals — ซ้าย ตั้งค่า (สวิตช์เปิดใช้งาน · รางวัลผู้แนะนำ แต้ม 300 · รางวัลเพื่อน voucher ฿100 · ให้เมื่อเพื่อนซื้อครั้งแรก ≥ ฿500 · จำกัด 10 ครั้ง/เดือน · กันโกง เบอร์ซ้ำ + device fingerprint · ข้อความแชร์ LINE · ลิงก์ shark.in.th/r/{โค้ด}) · ขวา KPI 4 (สมาชิกจากการแนะนำ · อัตราแปลง · ต้นทุน/คน · ยอด 90 วันแรก สูงกว่าเฉลี่ย n%) · ตาราง ผู้แนะนำสูงสุด 5 (ชื่อ/แนะนำ/สำเร็จ/รางวัลที่ได้) · ตาราง การแนะนำล่าสุด (ผู้แนะนำ→เพื่อน/สมัคร/ซื้อครั้งแรก/สถานะ รอ-สำเร็จ-ถูกปฏิเสธ(เบอร์ซ้ำ)/รางวัลจ่ายแล้ว) · ภาพ 08 ขวา: การ์ดแนะนำเพื่อน (โค้ด · ลิงก์ LINE · แนะนำแล้ว n/สำเร็จ n/แต้มที่ได้ n · ต้นไม้ผู้แนะนำ) · LIFF /m/[slug]/referral: โค้ด+QR+ปุ่มแชร์ LINE (liff.shareTargetPicker fallback line://msg/text) + สถิติของฉัน
//   testid: referrals-page referrals-settings referrals-enabled referrals-kpi referrals-leaderboard referrals-recent referral-row-<id> · member-referrals-tab member-referral-card member-referral-code member-referral-tree · m-referral m-referral-code m-referral-share m-referral-stats · r-landing (หน้า /r/[code] → redirect LIFF join ?ref=)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/member/referrals.ts") || !existsSync("src/app/app/sys/[id]/member/referrals/page.tsx")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (member/referrals.ts · member/referrals/page.tsx)");
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
let tid = ""; let SYS = ""; let PT = ""; let POS = "";
const tag = Date.now().toString(36);
const made = { customers: [] as string[], referrals: [] as string[], sales: [] as string[], ledgerKeys: [] as string[], vouchers: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId; PT = scope.systems.POINT as string; POS = scope.systems.POS as string;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const R = (await import("@/lib/modules/member/referrals" as string)) as Record<string, (...a: Any[]) => Any>;
  const M = (await import("@/lib/modules/member" as string)) as Record<string, (...a: Any[]) => Any>;
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const PS = (await import("@/lib/modules/point" as string)) as Record<string, (...a: Any[]) => Any>;
  const pos = (await import("@/lib/modules/pos/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId);
  const thana = await actorOf(E.users.staff.thana.userId);
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const bal = (cid: string) => PS.getBalance(PT, cid);
  const rf = (id: string) => P.referral.findUnique({ where: { id } });
  const phoneN = () => `0877${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`;
  const mkCust = async (nm: string, extra: Any = {}) => { const c = await PR.createMember(ctx as Any, owner, { phone: phoneN(), firstName: nm, lastName: "แนะนำ", source: "WALK_IN", homeUnitId: E.units.patong, ...extra }); made.customers.push(c.customerId); return c; };
  const buy = async (cid: string, satang: number) => { const s = await pos.createSale({ tenantId: tid, unitId: E.units.patong, systemId: POS, pointSystemId: PT, memberSystemId: SYS, memberId: cid, idempotencyKey: `rf-${tag}-${cid.slice(-6)}-${satang}`, lines: [{ name: "คอร์สทดลอง", qty: 1, unitPriceSatang: satang }], payMethods: [{ type: "CASH", amountSatang: satang }] }); made.sales.push(s.saleId ?? s.id); return s; };
  const prog0 = await P.referralProgram.findUnique({ where: { systemId: SYS } }).catch(() => null);
  restore.push(async () => { if (prog0) await P.referralProgram.update({ where: { systemId: SYS }, data: { enabled: prog0.enabled, referrerRewardKind: prog0.referrerRewardKind, referrerRewardValue: prog0.referrerRewardValue, refereeRewardKind: prog0.refereeRewardKind, refereeRewardValue: prog0.refereeRewardValue, convertOn: prog0.convertOn, minFirstPurchaseSatang: prog0.minFirstPurchaseSatang, monthlyCap: prog0.monthlyCap, fraudPhoneDevice: prog0.fraudPhoneDevice, shareText: prog0.shareText } }); else await P.referralProgram.deleteMany({ where: { systemId: SYS } }); });

  // ═══ S1 schema · program ═══
  const rp = await cols("ReferralProgram"); const rc = await cols("Referral");
  const st = await enumVals("ReferralStatus"); const kd = await enumVals("ReferralRewardKind");
  const pg0 = await R.getProgram(ctx);
  const eOn = await fails(() => R.setProgram(ctx, owner, { convertOn: "NEVER" }));
  const eVal = await fails(() => R.setProgram(ctx, owner, { referrerRewardKind: "POINTS", referrerRewardValue: { points: -5 } }));
  const ePerm = await fails(() => R.setProgram(ctx, thana, { enabled: true }));
  await R.setProgram(ctx, owner, { enabled: true, referrerRewardKind: "POINTS", referrerRewardValue: { points: 300 }, refereeRewardKind: "VOUCHER", refereeRewardValue: { kind: "FIXED", value: 100, validDays: 30 }, convertOn: "FIRST_PURCHASE", minFirstPurchaseSatang: 50_000, monthlyCap: 10, fraudPhoneDevice: true });
  const pg1 = await R.getProgram(ctx);
  chk("M3.5-S1.1", "ตาราง ReferralProgram {enabled referrerRewardKind referrerRewardValue refereeRewardKind refereeRewardValue convertOn minFirstPurchaseSatang monthlyCap fraudPhoneDevice shareText} · Referral {referrerCustomerId refereeCustomerId refereeContact code status convertedAt conversionRef rewardedAt referrerRewardRef refereeRewardRef rejectReason} · enum 4/2 · getProgram ปริยาย (enabled false · 300 แต้ม · voucher ฿100 · FIRST_PURCHASE ≥ 50000 · cap 10 · fraud true · shareText มี {link}) · convertOn ผิด → throw ไทย · points -5 → throw · thana → throw · set แล้วอ่านกลับ enabled true",
    ["enabled", "referrerRewardKind", "referrerRewardValue", "refereeRewardKind", "refereeRewardValue", "convertOn", "minFirstPurchaseSatang", "monthlyCap", "fraudPhoneDevice", "shareText"].every((c) => rp.has(c)) && ["referrerCustomerId", "refereeCustomerId", "refereeContact", "code", "status", "convertedAt", "conversionRef", "rewardedAt", "referrerRewardRef", "refereeRewardRef", "rejectReason"].every((c) => rc.has(c)) && ["PENDING", "CONVERTED", "REWARDED", "REJECTED"].every((v) => st.includes(v)) && kd.includes("POINTS") && kd.includes("VOUCHER") && pg0?.enabled === false && pg0.referrerRewardValue?.points === 300 && pg0.refereeRewardValue?.value === 100 && pg0.convertOn === "FIRST_PURCHASE" && pg0.minFirstPurchaseSatang === 50_000 && pg0.monthlyCap === 10 && pg0.fraudPhoneDevice === true && /\{link\}/.test(pg0.shareText ?? "") && thai(eOn) && thai(eVal) && !!ePerm && pg1?.enabled === true,
    "ครบ", `cols=${rp.size}/${rc.size} st=${st.join(",")} pg0=${JSON.stringify(pg0)} on=${thai(eOn)} val=${thai(eVal)} perm=${!!ePerm} pg1=${pg1?.enabled}`);
  const cf = await R.codeFor(ctx, m(1).id);
  const c1 = await prisma.customer.findUnique({ where: { id: m(1).id }, select: { referralCode: true } });
  chk("M3.5-S1.2", "codeFor(สมาชิก 1) → { code = Customer.referralCode, link /r/<code>, shareText แทน {link} ด้วย URL เต็ม (http) ไม่เหลือ {link} }", !!cf?.code && cf.code === c1?.referralCode && cf.link === `/r/${cf.code}` && /https?:\/\/\S+\/r\//.test(cf.shareText ?? "") && !/\{link\}/.test(cf.shareText ?? ""), "code ตรง", JSON.stringify(cf));

  // ═══ S2 attach: ปกติ / ตัวเอง / ซ้ำ / ไม่ใช่สมาชิกใหม่ ═══
  const A = await mkCust("ผู้แนะนำ");
  const codeA = (await R.codeFor(ctx, A.customerId)).code;
  const B = await mkCust("เพื่อนบี", { referralCode: codeA });
  const rB = await P.referral.findFirst({ where: { tenantId: tid, refereeCustomerId: B.customerId } });
  if (rB) made.referrals.push(rB.id);
  const custB = await prisma.customer.findUnique({ where: { id: B.customerId }, select: { source: true, referredById: true } });
  const actA = await P.memberActivity.findFirst({ where: { customerId: A.customerId, type: "REFERRAL_JOINED" } });
  chk("M3.5-S2.1", "createMember(referralCode A) → consumer member.created → Referral PENDING {referrerCustomerId A, refereeCustomerId B, code} (attach อัตโนมัติผ่าน outbox หรือ sync) · Customer B source REFERRAL referredById A · MemberActivity REFERRAL_JOINED ของ A · event referral.joined", !!rB && rB.status === "PENDING" && rB.referrerCustomerId === A.customerId && rB.code === codeA && custB?.source === "REFERRAL" && custB.referredById === A.customerId && !!actA && !!(await P.outboxEvent.findFirst({ where: { tenantId: tid, type: "referral.joined", payload: { path: ["referralId"], equals: rB?.id ?? "-" } } })), "PENDING", `rB=${JSON.stringify({ st: rB?.status, ref: rB?.referrerCustomerId === A.customerId })} B=${JSON.stringify(custB)} act=${!!actA}`);
  const again = await R.attach(ctx, { refereeCustomerId: B.customerId, code: codeA });
  const selfR = await R.attach(ctx, { refereeCustomerId: A.customerId, code: codeA });
  if (selfR?.referralId) made.referrals.push(selfR.referralId);
  const eCode = await fails(() => R.attach(ctx, { refereeCustomerId: B.customerId, code: "ZZZZ0000" }));
  chk("M3.5-S2.2", "attach ซ้ำ (B) → referral เดิม PENDING (unique refereeCustomerId) · แนะนำตัวเอง (A→A) → REJECTED rejectReason ไทย · code ไม่มี → throw ไทย", again?.referralId === rB?.id && again.status === "PENDING" && selfR?.status === "REJECTED" && /[ก-๙]/.test(selfR.rejectReason ?? "") && thai(eCode), "กติกา §11.7", `again=${JSON.stringify(again)} self=${JSON.stringify(selfR)} code=${thai(eCode)}`);
  const oldR = await R.attach(ctx, { refereeCustomerId: m(5).id, code: codeA });
  if (oldR?.referralId) made.referrals.push(oldR.referralId);
  const Cc = await mkCust("เบอร์ซ้ำ", { phone: undefined });
  const phoneA = (await prisma.customer.findUnique({ where: { id: A.customerId }, select: { phone: true } }))?.phone;
  const dupR = await R.attach(ctx, { refereeCustomerId: Cc.customerId, code: codeA, device: { phone: phoneA } });
  if (dupR?.referralId) made.referrals.push(dupR.referralId);
  const D = await mkCust("ดีไวซ์ซ้ำ");
  await R.attach(ctx, { refereeCustomerId: D.customerId, code: codeA, device: { fingerprint: `fp-${tag}` } }).then((r: Any) => r?.referralId && made.referrals.push(r.referralId));
  const D2 = await mkCust("ดีไวซ์ซ้ำสอง");
  const fpR = await R.attach(ctx, { refereeCustomerId: D2.customerId, code: codeA, device: { fingerprint: `fp-${tag}` } });
  if (fpR?.referralId) made.referrals.push(fpR.referralId);
  chk("M3.5-S2.3", "สมาชิกเก่า (สมาชิก 5 · มีบิลก่อน) → REJECTED 'ไม่ใช่สมาชิกใหม่' · เบอร์ referee ซ้ำเบอร์ผู้แนะนำ → REJECTED · device fingerprint ซ้ำกับ referee คนก่อนของผู้แนะนำเดียวกัน → REJECTED (fraudPhoneDevice true)", oldR?.status === "REJECTED" && /ใหม่/.test(oldR.rejectReason ?? "") && dupR?.status === "REJECTED" && fpR?.status === "REJECTED" && /ซ้ำ/.test(fpR.rejectReason ?? ""), "REJECTED ×3", `old=${JSON.stringify(oldR)} dup=${JSON.stringify(dupR)} fp=${JSON.stringify(fpR)}`);
  await R.setProgram(ctx, owner, { fraudPhoneDevice: false });
  const D3 = await mkCust("ดีไวซ์ปิดกันโกง");
  const fpOff = await R.attach(ctx, { refereeCustomerId: D3.customerId, code: codeA, device: { fingerprint: `fp-${tag}` } });
  if (fpOff?.referralId) made.referrals.push(fpOff.referralId);
  await R.setProgram(ctx, owner, { fraudPhoneDevice: true });
  chk("M3.5-S2.4", "fraudPhoneDevice false → fingerprint ซ้ำผ่านเป็น PENDING (สวิตช์ทำงานจริง)", fpOff?.status === "PENDING", "PENDING", JSON.stringify(fpOff));

  // ═══ S3 convert: FIRST_PURCHASE ≥ min / SIGNUP ═══
  const balA0 = await bal(A.customerId);
  const low = await R.evaluateConversion(ctx, { refereeCustomerId: B.customerId, trigger: "PURCHASE", netSatang: 30_000 });
  const rB1 = await rf(rB.id);
  chk("M3.5-S3.1", "FIRST_PURCHASE: บิล ฿300 < ขั้นต่ำ ฿500 → converted false reason ไทย · ยัง PENDING · ผู้แนะนำแต้มไม่เพิ่ม", low?.converted === false && /[ก-๙]/.test(low.reason ?? "") && rB1?.status === "PENDING" && (await bal(A.customerId)) === balA0, "ยังไม่แปลง", `low=${JSON.stringify(low)} st=${rB1?.status}`);
  const sB = await buy(B.customerId, 60_000);
  const rB2 = await rf(rB.id);
  const vB = await P.voucher.findFirst({ where: { tenantId: tid, customerId: B.customerId, origin: "REFERRAL" } });
  if (vB) made.vouchers.push(vB.id);
  made.ledgerKeys.push(`referral:${rB.id}:referrer`, `referral:${rB.id}:referee`);
  const ledA = await prisma.pointLedger.findFirst({ where: { customerId: A.customerId, refType: "REFERRAL" as Any, refId: rB.id } });
  const obC = await P.outboxEvent.findFirst({ where: { tenantId: tid, type: "referral.converted", payload: { path: ["referralId"], equals: rB.id } } });
  chk("M3.5-S3.2", "บิล PAID ฿600 ≥ ขั้นต่ำ (consumer pos.sale.paid → evaluateConversion PURCHASE) → status REWARDED convertedAt conversionRef {saleId, netSatang} rewardedAt · ผู้แนะนำ +300 แต้ม (ledger EARN refType REFERRAL refId referralId) · เพื่อนได้ voucher FIXED 100 origin REFERRAL originRef {referralId} หมดอายุ +30 วัน · referrerRewardRef {ledgerId} refereeRewardRef {voucherId} · event referral.converted · MemberActivity REFERRAL_CONVERTED ของ A",
    rB2?.status === "REWARDED" && !!rB2.convertedAt && rB2.conversionRef?.saleId === (sB.saleId ?? sB.id) && !!rB2.rewardedAt && (await bal(A.customerId)) - balA0 === 300 && !!ledA && !!vB && vB.kind === "FIXED" && Number(vB.value) === 100 && vB.originRef?.referralId === rB.id && Math.abs((new Date(vB.expiresAt).getTime() - Date.now()) / 86_400_000 - 30) < 1.5 && rB2.referrerRewardRef?.ledgerId === ledA?.id && rB2.refereeRewardRef?.voucherId === vB.id && !!obC && !!(await P.memberActivity.findFirst({ where: { customerId: A.customerId, type: "REFERRAL_CONVERTED", refId: rB.id } })),
    "REWARDED สองฝั่ง", `st=${rB2?.status} conv=${JSON.stringify(rB2?.conversionRef)} balΔ=${(await bal(A.customerId)) - balA0} led=${!!ledA} v=${JSON.stringify({ k: vB?.kind, v: vB?.value, ref: vB?.originRef })} refs=${JSON.stringify({ a: rB2?.referrerRewardRef, b: rB2?.refereeRewardRef })} ob=${!!obC}`);
  const rw2 = await R.rewardBoth(ctx, rB.id);
  const ev2 = await R.evaluateConversion(ctx, { refereeCustomerId: B.customerId, trigger: "PURCHASE", saleId: sB.saleId ?? sB.id, netSatang: 60_000 });
  await buy(B.customerId, 70_000);
  chk("M3.5-S3.3", "idempotent: rewardBoth ซ้ำ / evaluateConversion ซ้ำ / บิลที่สอง → ไม่จ่ายซ้ำ (แต้ม A ยัง +300 · voucher REFERRAL ของ B 1 ใบ · ledger REFERRAL 1)", (await bal(A.customerId)) - balA0 === 300 && (await P.voucher.count({ where: { customerId: B.customerId, origin: "REFERRAL" } })) === 1 && (await prisma.pointLedger.count({ where: { customerId: A.customerId, refType: "REFERRAL" as Any } })) === 1 && ev2?.rewarded === false && !!rw2, "จ่ายครั้งเดียว", `balΔ=${(await bal(A.customerId)) - balA0} v=${await P.voucher.count({ where: { customerId: B.customerId, origin: "REFERRAL" } })} ev2=${JSON.stringify(ev2)}`);
  await R.setProgram(ctx, owner, { convertOn: "SIGNUP", referrerRewardKind: "VOUCHER", referrerRewardValue: { kind: "PERCENT", value: 10, validDays: 14 }, refereeRewardKind: "POINTS", refereeRewardValue: { points: 50 } });
  const G = await mkCust("เพื่อนจี", { referralCode: codeA });
  const rG = await P.referral.findFirst({ where: { tenantId: tid, refereeCustomerId: G.customerId } });
  if (rG) { made.referrals.push(rG.id); made.ledgerKeys.push(`referral:${rG.id}:referrer`, `referral:${rG.id}:referee`); }
  const vA = await P.voucher.findFirst({ where: { tenantId: tid, customerId: A.customerId, origin: "REFERRAL", originRef: { path: ["referralId"], equals: rG?.id ?? "-" } } });
  if (vA) made.vouchers.push(vA.id);
  chk("M3.5-S3.4", "convertOn SIGNUP + สลับชนิดรางวัล (ผู้แนะนำ voucher 10% 14 วัน · เพื่อน 50 แต้ม): สมัครด้วยโค้ด → REWARDED ทันทีไม่ต้องซื้อ · A ได้ voucher PERCENT 10 · G ได้ 50 แต้ม", rG?.status === "REWARDED" && !!vA && vA.kind === "PERCENT" && Number(vA.value) === 10 && (await bal(G.customerId)) === 50, "SIGNUP → รางวัลทันที", `rG=${rG?.status} vA=${JSON.stringify({ k: vA?.kind, v: vA?.value })} balG=${await bal(G.customerId)}`);

  // ═══ S4 cap / โปรแกรมปิด / reject ═══
  await R.setProgram(ctx, owner, { convertOn: "SIGNUP", referrerRewardKind: "POINTS", referrerRewardValue: { points: 10 }, refereeRewardKind: "POINTS", refereeRewardValue: { points: 5 }, monthlyCap: 2 });
  const balA1 = await bal(A.customerId);
  const H1 = await mkCust("แคปหนึ่ง", { referralCode: codeA });
  const H2 = await mkCust("แคปสอง", { referralCode: codeA });
  const H3 = await mkCust("แคปสาม", { referralCode: codeA });
  const rH = await P.referral.findMany({ where: { tenantId: tid, refereeCustomerId: { in: [H1.customerId, H2.customerId, H3.customerId] } }, orderBy: { createdAt: "asc" } });
  for (const r of rH) { made.referrals.push(r.id); made.ledgerKeys.push(`referral:${r.id}:referrer`, `referral:${r.id}:referee`); }
  const rH3 = rH.find((r: Any) => r.refereeCustomerId === H3.customerId);
  chk("M3.5-S4.1", "monthlyCap 2: A มีรางวัลเดือนนี้แล้ว 2 (B, G) → H1..H3 REWARDED แต่ผู้แนะนำไม่ได้แต้มเพิ่ม (referrerRewardRef {capped true}) · เพื่อน H3 ยังได้ 5 แต้ม", rH.length === 3 && rH.every((r: Any) => r.status === "REWARDED") && (await bal(A.customerId)) === balA1 && rH3?.referrerRewardRef?.capped === true && (await bal(H3.customerId)) === 5, "cap ทำงาน", `n=${rH.length} st=${rH.map((r: Any) => r.status).join(",")} balA=${await bal(A.customerId)}/${balA1} h3ref=${JSON.stringify(rH3?.referrerRewardRef)} balH3=${await bal(H3.customerId)}`);
  await R.setProgram(ctx, owner, { enabled: false, monthlyCap: 10 });
  const K = await mkCust("โปรแกรมปิด", { referralCode: codeA });
  const rK = await P.referral.findFirst({ where: { tenantId: tid, refereeCustomerId: K.customerId } });
  if (rK) made.referrals.push(rK.id);
  await R.setProgram(ctx, owner, { enabled: true });
  const eRej = await fails(() => R.reject(ctx, owner, rB.id, { reason: "ทดสอบ" }));
  const rj = await R.reject(ctx, owner, rK?.id ?? "-", { reason: "สงสัยโกง" });
  const eRjPerm = await fails(() => R.reject(ctx, thana, rH[0].id, { reason: "x" }));
  chk("M3.5-S4.2", "โปรแกรมปิด: สมัครด้วยโค้ด → ยังบันทึก PENDING (นับต่อ 30 วัน) ไม่จ่ายรางวัล · reject(REWARDED) → throw ไทย 'จ่ายรางวัลแล้ว' · reject(PENDING) → REJECTED rejectReason · thana → throw", rK?.status === "PENDING" && thai(eRej) && rj?.ok === true && (await rf(rK.id))?.status === "REJECTED" && (await rf(rK.id))?.rejectReason === "สงสัยโกง" && !!eRjPerm, "ตามกติกา", `rK=${rK?.status} eRej=${thai(eRej)} rj=${JSON.stringify(rj)} after=${(await rf(rK?.id ?? "-"))?.status} perm=${!!eRjPerm}`);

  // ═══ S5 list / leaderboard / stats / 360 ═══
  const list = await R.listReferrals(ctx, owner, { take: 50 });
  const listRej = await R.listReferrals(ctx, owner, { status: "REJECTED", take: 50 });
  const listA = await R.listReferrals(ctx, owner, { referrerCustomerId: A.customerId, take: 50 });
  const rowB = list?.items?.find((x: Any) => x.id === rB.id);
  chk("M3.5-S5.1", "listReferrals: items มี referrer{name, memberCode} referee{name} status createdAt convertedAt rewards · กรอง status REJECTED ≥ 5 (self · เก่า · เบอร์ซ้ำ · fp ซ้ำ · K) · กรอง referrerCustomerId A = ทั้งหมดของ A · แถว B status REWARDED rewards.referrer.kind POINTS rewards.referee.kind VOUCHER", !!rowB && rowB.referrer?.name && rowB.referrer?.memberCode && rowB.referee?.name && rowB.status === "REWARDED" && rowB.rewards?.referrer?.kind === "POINTS" && rowB.rewards?.referee?.kind === "VOUCHER" && (listRej?.items?.length ?? 0) >= 5 && listRej.items.every((x: Any) => x.status === "REJECTED") && listA?.items?.length === made.referrals.length && listA.items.every((x: Any) => x.referrer?.id === A.customerId), "list ถูก", `rowB=${JSON.stringify(rowB).slice(0, 200)} rej=${listRej?.items?.length} A=${listA?.items?.length}/${made.referrals.length}`);
  const lb = await R.leaderboard(ctx, owner, { days: 90, take: 5 });
  const top = lb?.[0];
  const stt = await R.stats(ctx, owner, { days: 90 });
  chk("M3.5-S5.2", "leaderboard 90 วัน: อันดับ 1 = A {referred ≥ 6 (ไม่นับ REJECTED), converted 6 (B,G,H1,H2,H3 + …), pointsEarned 300+10+10 = 320} · stats {referredMembers ≥ 6, conversionPct 0–100, costPerMemberSatang ≥ 0, first90dSpendSatang ≥ 0, vsAvgPct number}", top?.customerId === A.customerId && top.converted >= 5 && top.referred >= top.converted && top.pointsEarned === 320 && (stt?.referredMembers ?? 0) >= 6 && stt.conversionPct >= 0 && stt.conversionPct <= 100 && stt.costPerMemberSatang >= 0 && stt.first90dSpendSatang >= 0 && typeof stt.vsAvgPct === "number", "A นำ", `top=${JSON.stringify(top)} stats=${JSON.stringify(stt)}`);
  const fm = await R.referralsForMember(ctx, owner, A.customerId);
  const m360 = await M.getMember360(ctx, owner, A.customerId);
  chk("M3.5-S5.3", "referralsForMember(A) → { code = codeA, link, referred, converted ≥ 5, pointsEarned 320, tree[{refereeId, name, status, convertedAt}] มี B (REWARDED) } · getMember360(A) มี referrals summary (counters.referrals หรือ referral block) · thana (ป่าตอง) เห็นรายการ (A home ป่าตอง) · unit scope ทำงาน", fm?.code === codeA && fm.converted >= 5 && fm.pointsEarned === 320 && Array.isArray(fm.tree) && fm.tree.some((t: Any) => t.refereeId === B.customerId && t.status === "REWARDED") && (m360?.counters?.referrals != null || m360?.referrals != null) && ((await R.listReferrals(ctx, thana, { referrerCustomerId: A.customerId, take: 5 }))?.items?.length ?? 0) > 0, "การ์ด 360", `fm=${JSON.stringify({ code: fm?.code === codeA, conv: fm?.converted, pts: fm?.pointsEarned, tree: fm?.tree?.length })} c360=${JSON.stringify(m360?.counters?.referrals ?? m360?.referrals)?.slice(0, 80)}`);

  // ═══ S6 events / consumers / facade ═══
  const consumers = read("src/lib/outbox-consumers.ts"); const bridges = read("src/lib/member-bridges.ts"); const rsrc = read("src/lib/modules/member/referrals.ts");
  const A2 = (await import("@/lib/automation/labels" as string)) as Any; const W2 = (await import("@/lib/webhooks/labels" as string)) as Any;
  const in3 = (e: string) => new RegExp(`"${e.replace(/\./g, "\\.")}":`).test(consumers) && A2.AUTOMATION_EVENTS.some((x: Any) => x.value === e && /[ก-๙]/.test(x.label)) && W2.WEBHOOK_EVENTS.filter((x: Any) => x.value === e).length === 1;
  const { drainOutbox } = await import("@/lib/core/outbox");
  const { consumers: CONS } = (await import("@/lib/outbox-consumers" as string)) as Any;
  await drainOutbox(CONS, { limit: 300 }); await drainOutbox(CONS, { limit: 300 });
  const stuck = await P.outboxEvent.count({ where: { tenantId: tid, type: { startsWith: "referral." }, status: { not: "DONE" } } });
  chk("M3.5-S6.1", "referral.joined / referral.converted ลง 3 ทะเบียน + consumer · drain แล้ว DONE · consumer member.created เรียก referrals (attach/evaluate) ไม่ใช่ no-op · pos.sale.paid → evaluateConversion ผ่าน member-bridges", in3("referral.joined") && in3("referral.converted") && stuck === 0 && /referral/i.test(consumers.split('"member.created"')[1]?.slice(0, 400) ?? "") && /evaluateConversion|referral/i.test(bridges), "ครบ", `reg=${in3("referral.joined")}/${in3("referral.converted")} stuck=${stuck} mc=${/referral/i.test(consumers.split('"member.created"')[1]?.slice(0, 400) ?? "")} bridge=${/evaluateConversion|referral/i.test(bridges)}`);
  chk("M3.5-S6.2", "facade member/index.ts export getProgram/setProgram/codeFor/attach/evaluateConversion/rewardBoth/reject/listReferrals/leaderboard/stats(referralStats)/referralsForMember · referrals.ts ไม่ import point/voucher ภายใน (ผ่าน facade index) · ไม่มี any · ปรับ perm 'member.referral.manage' อยู่ในทะเบียนสิทธิ์", ["getProgram", "setProgram", "codeFor", "attach", "evaluateConversion", "rewardBoth", "listReferrals", "leaderboard", "referralsForMember"].every((f) => new RegExp(`\\b${f}\\b`).test(read("src/lib/modules/member/index.ts"))) && !/@\/lib\/modules\/(point|voucher)\/(?!index)[a-z-]+"/.test(rsrc) && !/:\s*any\b/.test(rsrc) && /member\.referral\.manage/.test(read("src/lib/core/permissions.ts") + read("src/lib/modules/member/permissions.ts")), "ต่อครบ", `idx=${["getProgram", "setProgram", "codeFor", "attach", "evaluateConversion", "rewardBoth", "listReferrals", "leaderboard", "referralsForMember"].filter((f) => !new RegExp(`\\b${f}\\b`).test(read("src/lib/modules/member/index.ts"))).join(",") || "-"}`);

  // ═══ S7 UI / ภาพ ═══
  const pages = { page: read("src/app/app/sys/[id]/member/referrals/page.tsx"), liff: read("src/app/m/[slug]/referral/page.tsx"), r: read("src/app/r/[code]/page.tsx") + read("src/app/r/[code]/route.ts") };
  const actSrc = read("src/lib/modules/member/referrals-actions.ts");
  const compDir = "src/components/member";
  const comps = existsSync(compDir) ? readdirSync(compDir).filter((f) => /referral|Member360/i.test(f)).map((f) => read(`${compDir}/${f}`)).join("\n") : "";
  const all = Object.values(pages).join("\n") + comps;
  const TIDS = ["referrals-page", "referrals-settings", "referrals-enabled", "referrals-kpi", "referrals-leaderboard", "referrals-recent", "referral-row-", "member-referrals-tab", "member-referral-card", "member-referral-code", "member-referral-tree", "m-referral", "m-referral-code", "m-referral-share", "m-referral-stats"];
  const missingT = TIDS.filter((t) => !all.includes(t));
  const LABELS = ["เปิดใช้งาน", "รางวัลผู้แนะนำ", "รางวัลเพื่อน", "ซื้อครั้งแรก", "ครั้ง/เดือน", "กันโกง", "เบอร์ซ้ำ", "device fingerprint", "ข้อความแชร์", "/r/", "สมาชิกจากการแนะนำ", "อัตราแปลง", "ต้นทุน/คน", "ยอด 90 วันแรก", "ผู้แนะนำสูงสุด", "การแนะนำล่าสุด", "สำเร็จ", "ถูกปฏิเสธ", "รางวัลจ่ายแล้ว", "แนะนำเพื่อน", "แนะนำแล้ว", "แต้มที่ได้"];
  const missingL = LABELS.filter((l) => !all.includes(l));
  const nav = read("src/lib/modules/member/nav.ts");
  chk("M3.5-S7.1", "หน้า /member/referrals + LIFF /m/[slug]/referral + /r/[code] (redirect → LIFF join ?ref=) มีจริง · หน้า admin requireTenant · actions 'use server' + member.referral.manage · testid 15 · ป้ายภาพ 24/08 ครบ · nav มีทางเข้า referrals · ไม่มีอีโมจิ/hex", Object.values(pages).every((p) => p.length > 0) && /requireTenant/.test(pages.page) && /["']use server["']/.test(actSrc) && /member\.referral\.manage/.test(actSrc) && /join|redirect/.test(pages.r) && missingT.length === 0 && missingL.length === 0 && /referrals/.test(nav) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(all.replace(/\/\/.*$/gm, "")) && !/#[0-9a-fA-F]{6}\b/.test(all.replace(/\/\/.*$/gm, "")), "ครบ", `pages=${Object.values(pages).map((p) => p.length > 0).join("/")} tid-missing=${missingT.join(",") || "-"} labels-missing=${missingL.join(",") || "-"}`);
  const dir = `${mq.MQC.shotsDir}/3.5`;
  const sum = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sum(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  const ok = (u: string, n: string, d: string) => r(u, n, d)?.status === 200 && r(u, n, d)?.missing?.length === 0 && r(u, n, d)?.errors?.length === 0 && !r(u, n, d)?.overflow;
  chk("M3.5-S7.2", "ภาพ 24: referrals-owner desktop+mobile 200 ไม่ล้น (ตั้งค่าซ้าย · KPI 4 · ผู้แนะนำสูงสุด · การแนะนำล่าสุด มีแถว รอ/สำเร็จ/ถูกปฏิเสธ) · ภาพ 08 ขวา: member-referrals-owner desktop 200 (การ์ดแนะนำเพื่อน โค้ด/ลิงก์/สถิติ/ต้นไม้)", ok("owner", "referrals-owner", "desktop") && ok("owner", "referrals-owner", "mobile") && ok("owner", "member-referrals-owner", "desktop"), "200 ×3", `${r("owner", "referrals-owner", "desktop")?.status}/${r("owner", "referrals-owner", "mobile")?.status}/${r("owner", "member-referrals-owner", "desktop")?.status} missing=${JSON.stringify(r("owner", "referrals-owner", "desktop")?.missing)}`);
  const custKey = `customer:${m(1).memberCode}`;
  chk("M3.5-S7.3", "LIFF: m-referral (--user customer:<สมาชิก 1>) mobile 200 (โค้ด · QR · ปุ่มแชร์ LINE · สถิติของฉัน) · r-landing (/r/<code ของสมาชิก 1>) → ไปหน้า join/login พร้อม ?ref= (status 200 หลัง redirect)", ok(custKey, "m-referral", "mobile") && (r("owner", "r-landing", "mobile")?.status === 200), "200 ×2", `${r(custKey, "m-referral", "mobile")?.status}/${r("owner", "r-landing", "mobile")?.status} missing=${JSON.stringify(r(custKey, "m-referral", "mobile")?.missing)}`);
  chk("M3.5-S7.4", "🔴 parity ภาพ 24 + 08 (ขวา) — Fable ตรวจด้วยตา · wo-notes/member-M3.5.md มี 'PARITY: ผ่าน'", /^\s*-?\s*\*\*PARITY:\s*ผ่าน\*\*/m.test(read("ledger/wo-notes/member-M3.5.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M3.5-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  if (made.sales.length) { for (const mdl of ["posSalePayment", "posSaleLine", "posSaleItem"]) await d(() => P[mdl].deleteMany({ where: { saleId: { in: made.sales } } })); await d(() => P.stampEvent?.deleteMany?.({ where: { refId: { in: made.sales } } })); await d(() => prisma.posSale.deleteMany({ where: { id: { in: made.sales } } })); }
  if (made.vouchers.length) await d(() => P.voucher.deleteMany({ where: { id: { in: made.vouchers } } }));
  if (made.referrals.length) { await d(() => P.memberActivity.deleteMany({ where: { tenantId: tid, refId: { in: made.referrals } } })); await d(() => P.referral.deleteMany({ where: { id: { in: made.referrals } } })); }
  if (made.customers.length) {
    await d(() => P.referral.deleteMany({ where: { OR: [{ refereeCustomerId: { in: made.customers } }, { referrerCustomerId: { in: made.customers } }] } }));
    await d(() => P.voucher.deleteMany({ where: { customerId: { in: made.customers } } }));
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["pointLot", "pointLedger", "pointBalance", "memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberAccessLog", "memberActivity", "stampProgress", "memberSegmentMember"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.updateMany({ where: { referredById: { in: made.customers } }, data: { referredById: null } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) { await d(() => prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } })); await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } })); }
  }
  for (const t of ["referral.", "point.", "member.", "pos.", "voucher."]) await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: t }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M3.5: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
