// QC — ระบบสมาชิก v2 WO M2.5: voucher — VoucherTemplate/Voucher/VoucherIssueBatch · issue (รายคน · idempotent ต่อ (customer, originRef) · เพดาน STAFF ต่อใบ · มูลค่ารวม > เพดาน → approval → ออกเมื่ออนุมัติ) · validate 6 เงื่อนไข · redeem ATOMIC ACTIVE→USED · release/cancel · expireDue/expiring · merge hook · tier welcome hook (M1.9 onTierChanged) · stamp reward hook (M2.3 rewardKind VOUCHER) · หน้า voucher + โมดัลออก (ภาพ 19)
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M2.5 · พิมพ์เขียว §4.2 (VoucherKind/Origin/Status) §4.3 (VoucherTemplate/Voucher) §5.7 §6.2 (ออก voucher STAFF ≤ ฿500/ใบ · MANAGER ≤ เพดาน · OWNER ✓) §7.1 (voucher.issued/used/expiring/expired) §7.5 §11.5 (release หมดอายุ → +7 วัน) §11.6 (เพดาน ฿10,000 → approval · journey ≤ 3 ใบ/คน/วัน) §11.9 · MEMBER-API §2.10 · ภาพ 19
// requires: member-seed
//
// สัญญา (โมดูลใหม่ src/lib/modules/voucher/{service.ts, index.ts (facade), voucher-actions.ts} · migration `member_v2_e` · composition root src/lib/member-hooks.ts)
//   ctx = { tenantId, systemId (= ระบบ MEMBER), actorUserId } · actor = MemberActor · สิทธิ์: เทมเพลต/ยกเลิก = member.promo.manage · ออก/redeem/release = member.promo.issue · อ่าน = member.promo.read (read-โดยนัย)
//   MEMBER_LIMITS (limits.ts · Edit เพิ่มคีย์): voucherTemplates 100 (มีแล้ว) · vouchersPerCustomerPerDay 3 (มีแล้ว · ใช้กับ origin JOURNEY เท่านั้น) · voucherIssueApprovalOverSatang 1_000_000 (฿10,000) · voucherStaffMaxSatang 50_000 (฿500/ใบ สำหรับ STAFF)
//   createTemplate(ctx, actor, { name, kind(FIXED|PERCENT|FREE_SERVICE|FREE_ITEM), value(FIXED=สตางค์ · PERCENT=1–100 · FREE_*=0 + config.serviceId/itemId), config{ minSatang?, categoryIds[]?, itemIds[]?, serviceIds[]?, stackWithCoupon(ปริยาย false), maxDiscountSatang?, unitIds[] }, validDays(≥1), origin, active }) → VoucherTemplate · updateTemplate · toggleTemplate · listTemplates(ctx)
//   issue(ctx, actor, { customerIds[], templateId? | adhoc?{kind,value,config,validDays}, origin, originRef?, reason?, notify? }) → { issued: n, vouchers: [{ id, code, customerId, kind, value, expiresAt, status }], skipped: n } | { pending: true, approvalRequestId, batchId }
//     ทุกใบ: code `V-` + 6+ ตัว (crypto · unique tenant) · expiresAt = now + validDays · status ACTIVE · kind/value/config snapshot จากเทมเพลต · idempotencyKey = `${origin}:${hash(originRef)}:${customerId}` (unique tenantId+idempotencyKey) → ใบซ้ำต่อ (customer, originRef) ไม่ออกซ้ำ (นับใน skipped) · originRef ไม่ส่ง → ใช้ key สุ่มต่อครั้ง (ออกซ้ำได้)
//     ตรวจ (throw ไทย · ไม่ออกให้ใครเลย = atomic): customerIds ว่าง · ลูกค้าไม่มี/ต่างร้าน · ไม่มีทั้ง templateId และ adhoc · adhoc ผิด (PERCENT > 100 · FIXED ≤ 0 · validDays < 1) · เทมเพลตปิดใช้งาน · origin JOURNEY เกิน vouchersPerCustomerPerDay ต่อคนต่อวันไทย · STAFF ออกใบมูลค่า (FIXED value | PERCENT maxDiscountSatang) > voucherStaffMaxSatang
//     มูลค่ารวม (FIXED value×n · PERCENT maxDiscountSatang×n · FREE 0) > voucherIssueApprovalOverSatang และ actor ไม่ใช่ OWNER → สร้าง VoucherIssueBatch {status PENDING, input Json, requestedById} + approval.submitForApproval({ entityType: "member.voucher.issue", entityId: batchId, amountSatang, systemId, requestedById }) → ถ้า autoApproved (ไม่มี policy) ออกทันที ไม่งั้นคืน { pending, approvalRequestId, batchId } · OWNER ออกทันทีเสมอ
//     approval-effects.ts: approved → voucher.issueApprovedBatch(tenantId, batchId) (idempotent · batch → ISSUED · voucher originRef {batchId, ...}) · rejected → batch REJECTED
//     event voucher.issued {customerId, voucherId, origin, code} ต่อใบ · MemberActivity module voucher type VOUCHER_ISSUED
//   validate(ctx, { customerId, code? | voucherId?, cart: { lines[{ itemId?, serviceId?, categoryId?, qty, netSatang }], netSatang, unitId?, couponApplied? } }) → { ok, discountSatang, voucherId?, reason? } (อ่านอย่างเดียว ไม่เขียน)
//     ลำดับตรวจ: ไม่พบ/ไม่ใช่ของลูกค้าคนนี้ → ok false · status ≠ ACTIVE → false · expiresAt < now → false · unitIds ไม่ว่าง + cart.unitId ไม่อยู่ → false · minSatang > cart.netSatang → false · เงื่อนไขหมวด/สินค้า/บริการ ไม่มี line เข้าเกณฑ์ → false · stackWithCoupon false + couponApplied → false · ทุก reason ภาษาไทย
//     ส่วนลด: FIXED = min(value, ยอด line ที่เข้าเกณฑ์ (ไม่มีเงื่อนไข = ทั้งบิล)) · PERCENT = floor(ยอดเข้าเกณฑ์ × value / 100) แล้ว cap ที่ maxDiscountSatang · FREE_SERVICE = ราคาต่อหน่วยของ line serviceId ตรง (1 หน่วย) · FREE_ITEM = ราคาต่อหน่วย line itemId ตรง (1 หน่วย)
//   redeem(ctx, { voucherId, customerId, saleId? | appointmentId?, discountSatang? }, tx?) → { ok: true, voucherId } — updateMany where {id, customerId, status ACTIVE} → USED usedAt usedRef{saleId|appointmentId, discountSatang} · 0 แถว → throw MemberConflictError/ไทย ("ถูกใช้แล้ว/ไม่พร้อมใช้") · ยิงพร้อมกัน 2 → สำเร็จ 1 · event voucher.used {customerId, voucherId, origin, saleId?}
//   release(ctx, { voucherId, reason? }) → USED → ACTIVE (usedAt/usedRef ล้าง) · ถ้า expiresAt < now → expiresAt = now + 7 วัน (§11.5) · ไม่ใช่ USED → no-op {ok true, changed false}
//   cancel(ctx, actor, { voucherId, reason }) → สิทธิ์ promo.manage · ACTIVE → CANCELLED cancelledAt · USED → throw ไทย · ซ้ำ → idempotent
//   expireDue(now?) → { expired } ทุกร้าน: ACTIVE + expiresAt ≤ now → EXPIRED + event voucher.expired · notifyExpiring(now?) → ACTIVE ที่เหลือ 7 หรือ 1 วัน (วันไทย) → event voucher.expiring {customerId, voucherId, expiresAt, daysLeft} · วันเดียวกันซ้ำไม่ยิงซ้ำ · cron.ts runDailyCron steps voucherExpire + voucherExpiring (summary voucherExpired/voucherExpiring)
//   listForCustomer(ctx, customerId, { status? }) → ใบ ACTIVE ก่อน (expiresAt ใกล้สุดก่อน) · ปริยายไม่รวม CANCELLED · listVouchers(ctx, { status?, origin?, customerId?, q?, take? }) → { rows[{ id, code, name(เทมเพลต/adhoc), customerName, kind, value, origin, status, expiresAt, usedAt }], kpi{ activeCount, activeValueSatang, usedThisMonth, usageRatePct } }
//   mergeVouchers(ctx, { keepId, mergeId }) (profile.ts#mergeMembers เรียกผ่าน facade) → ย้าย customerId ทุกใบ
//   hooks (src/lib/member-hooks.ts export registerMemberHooks() idempotent · import จาก outbox-consumers.ts + cron.ts + voucher-actions.ts/tiers-actions.ts):
//     tiers.onTierChanged → ระดับใหม่มี benefit WELCOME_VOUCHER {templateId} → issue origin TIER originRef {tierDefId} (idempotent ต่อ customer+tier)
//     stamp completeCycle rewardKind VOUCHER {templateId} → issue origin STAMP originRef {stampProgressId} → StampCardProgress.rewardVoucherId (M2.5 แก้ stamp/service.ts ให้เรียก facade voucher — เส้น stamp→voucher อนุมัติแล้วใน fitness)
//   UI (ภาพ 19): /member/promotions (hub: แท็บ voucher · คูปอง · gift card (soon M2.6) · journey (soon M3.3)) · /member/promotions/vouchers (KPI ใช้ได้ n + มูลค่ารวม · ใช้แล้วเดือนนี้ n + อัตราการใช้ % · ค้นหา รหัส/ชื่อ/ผู้รับ · ตาราง รหัส/ชื่อ voucher/ผู้รับ/มูลค่า/ต้นทาง/หมดอายุ/สถานะ · ปุ่ม 'ออก voucher' → โมดัล: ให้ใคร (รายคน ค้นสมาชิก | กลุ่ม segment (M3.1 · ปิดไว้ + ป้าย)) · แบบ (เทมเพลต หรือ adhoc: ส่วนลดบาท/เปอร์เซ็นต์/บริการฟรี/สินค้าฟรี) · มูลค่า · เงื่อนไข (ขั้นต่ำบิล · ใช้กับหมวด · ใช้ร่วมกับคูปอง) · อายุ n วันหลังออก · ต้นทาง/เหตุผล · แจ้งทาง LINE · กล่องแดง 'ต้องอนุมัติ: มูลค่ารวม ฿x (n คน × ฿y) มากกว่าเพดาน ฿10,000 → ระบบจะส่งคำขออนุมัติแทนออกทันที' เมื่อเกิน · แถบล่าง ผู้อนุมัติ + ยกเลิก/ออก voucher) · /member/promotions/vouchers/templates (ตารางเทมเพลต + ฟอร์ม)
//   testid: vouchers-page vouchers-kpi vouchers-search vouchers-table vouchers-row-<id> vouchers-issue vouchers-issue-modal vouchers-issue-target vouchers-issue-kind vouchers-issue-value vouchers-issue-approval-hint vouchers-issue-submit vouchers-templates vouchers-template-add vouchers-template-form promotions-page
//   actions: voucher/voucher-actions.ts "use server" gate promo.manage/promo.issue/promo.read · nav.ts promotions → ready · facade voucher/index.ts export createTemplate updateTemplate toggleTemplate listTemplates issue issueApprovedBatch validate redeem release cancel expireDue notifyExpiring listForCustomer listVouchers mergeVouchers · service.ts ไม่ import โมดูลอื่นตรงนอก facade (member/approval ผ่าน index) · ไม่มี any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const migDir = existsSync("prisma/migrations") ? readdirSync("prisma/migrations").find((d) => /_member_v2_e$/.test(d)) : undefined;
if (!migDir || !existsSync("src/lib/modules/voucher/service.ts") || !existsSync("src/app/app/sys/[id]/member/promotions/vouchers/page.tsx")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (migration member_v2_e · voucher/service.ts · member/promotions/vouchers/page.tsx)");
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
const hasIdx = async (t: string, colsIn: string[], unique = false) => { const rows = await q<{ indexdef: string }>(`select indexdef from pg_indexes where tablename='${t}' and indexdef ${unique ? "" : "not "}ilike '%unique%'`); return rows.some((r) => { const body = r.indexdef.slice(r.indexdef.indexOf("(") + 1).replace(/"/g, "").toLowerCase(); return colsIn.every((c) => body.includes(c.toLowerCase())); }); };
const P = prisma as Any;
let tid = ""; let SYS = ""; let PT = "";
const tag = Date.now().toString(36);
const before = { vouchers: new Set<string>(), templates: new Set<string>(), batches: new Set<string>() };
const made = { customers: [] as string[], approvalPolicies: [] as string[], cards: [] as string[], ledgerKeys: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId; PT = scope.systems.POINT as string;
  for (const v of await P.voucher.findMany({ where: { tenantId: tid }, select: { id: true } })) before.vouchers.add(v.id);
  for (const t of await P.voucherTemplate.findMany({ where: { tenantId: tid }, select: { id: true } })) before.templates.add(t.id);
  for (const b of await P.voucherIssueBatch.findMany({ where: { tenantId: tid }, select: { id: true } }).catch(() => [])) before.batches.add(b.id);
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const V = (await import("@/lib/modules/voucher" as string)) as Record<string, (...a: Any[]) => Any>;
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const T = (await import("@/lib/modules/member/tiers" as string)) as Record<string, (...a: Any[]) => Any>;
  const ST = (await import("@/lib/modules/stamp" as string)) as Record<string, (...a: Any[]) => Any>;
  const approval = (await import("@/lib/modules/approval/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const { MEMBER_LIMITS } = (await import("@/lib/modules/member/limits" as string)) as Any;
  const hooks = (await import("@/lib/member-hooks" as string)) as Record<string, (...a: Any[]) => Any>;
  hooks.registerMemberHooks(); hooks.registerMemberHooks();
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId);
  const manager = await actorOf(E.users.manager.userId);
  const thana0 = await actorOf(E.users.staff.thana.userId);
  const thana = { ...thana0, permissions: { ...thana0.permissions, "member.promo.issue": true } };
  const noPerm = await actorOf(E.users.noPerm.userId);
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const outbox = (type: string, pred: (p: Any) => boolean) => P.outboxEvent.findMany({ where: { tenantId: tid, type }, orderBy: { createdAt: "desc" }, take: 60 }).then((rows: Any[]) => rows.find((r) => pred(r.payload)));
  const vrow = (id: string) => P.voucher.findUnique({ where: { id } });
  const { drainOutbox } = await import("@/lib/core/outbox");
  const { consumers: CONS } = (await import("@/lib/outbox-consumers" as string)) as Any;
  const drain = async () => { await drainOutbox(CONS, { limit: 300 }); await drainOutbox(CONS, { limit: 300 }); };
  const CAT = "cat-course"; const GEAR = "cat-gear";
  const cart = (lines: Any[], extra: Any = {}) => ({ lines, netSatang: lines.reduce((n, l) => n + l.netSatang, 0), ...extra });

  // ═══ S1 schema + เทมเพลต ═══
  const vt = await cols("VoucherTemplate"); const vc = await cols("Voucher"); const vb = await cols("VoucherIssueBatch");
  const sql = read(`prisma/migrations/${migDir}/migration.sql`);
  const destructive = sql.split("\n").filter((l) => /^\s*(ALTER TABLE .*\b(DROP COLUMN|ALTER COLUMN [^;]*\bTYPE)|DROP TABLE|DROP TYPE)\b/i.test(l));
  const applied = await q<{ finished_at: Date | null }>(`select finished_at from "_prisma_migrations" where migration_name='${migDir}'`);
  const diff = spawnSync("pnpm", ["exec", "prisma", "migrate", "diff", "--from-config-datasource", "prisma.config.ts", "--to-schema", "prisma/schema", "--script"], { encoding: "utf8", env: process.env, timeout: 300_000 });
  const kinds = await enumVals("VoucherKind"); const origins = await enumVals("VoucherOrigin"); const statuses = await enumVals("VoucherStatus");
  chk("M2.5-S1.1", "migration member_v2_e: VoucherTemplate {systemId name kind value config validDays origin active} index(systemId) · Voucher {templateId customerId code kind value config origin originRef issuedAt expiresAt status usedAt usedRef cancelledAt approvalRequestId idempotencyKey} unique(tenantId,code) unique(tenantId,idempotencyKey) index(customerId,status) index(systemId,expiresAt) · VoucherIssueBatch {systemId status input requestedById approvalRequestId} · enum VoucherKind 4 · VoucherOrigin 10 · VoucherStatus 4 · additive · applied · migrate diff = empty · MEMBER_LIMITS.voucherIssueApprovalOverSatang 1,000,000 · voucherStaffMaxSatang 50,000",
    ["systemId", "name", "kind", "value", "config", "validDays", "origin", "active"].every((c) => vt.has(c)) && ["templateId", "customerId", "code", "kind", "value", "config", "origin", "originRef", "issuedAt", "expiresAt", "status", "usedAt", "usedRef", "cancelledAt", "approvalRequestId", "idempotencyKey"].every((c) => vc.has(c)) && ["systemId", "status", "input", "requestedById", "approvalRequestId"].every((c) => vb.has(c))
      && (await hasIdx("Voucher", ["tenantId", "code"], true)) && (await hasIdx("Voucher", ["tenantId", "idempotencyKey"], true)) && (await hasIdx("Voucher", ["customerId", "status"])) && (await hasIdx("Voucher", ["systemId", "expiresAt"])) && (await hasIdx("VoucherTemplate", ["systemId"]))
      && ["FIXED", "PERCENT", "FREE_SERVICE", "FREE_ITEM"].every((k) => kinds.includes(k)) && ["TIER", "BIRTHDAY", "JOURNEY", "CAMPAIGN", "REDEEM", "COMPENSATION", "REFERRAL", "STAMP", "MANUAL", "API"].every((k) => origins.includes(k)) && ["ACTIVE", "USED", "EXPIRED", "CANCELLED"].every((k) => statuses.includes(k))
      && destructive.length === 0 && !!applied[0]?.finished_at && /empty migration/i.test(diff.stdout + diff.stderr) && MEMBER_LIMITS.voucherIssueApprovalOverSatang === 1_000_000 && MEMBER_LIMITS.voucherStaffMaxSatang === 50_000,
    "ครบ", `vt=${[...vt].length} vc=${[...vc].length} vb=${[...vb].length} kinds=${kinds.length} origins=${origins.length} st=${statuses.length} destructive=${destructive.length} applied=${!!applied[0]?.finished_at} diff=${/empty migration/i.test(diff.stdout + diff.stderr)} limits=${MEMBER_LIMITS.voucherIssueApprovalOverSatang}/${MEMBER_LIMITS.voucherStaffMaxSatang}`);

  const eName = await fails(() => V.createTemplate(ctx, owner, { name: " ", kind: "FIXED", value: 100, config: {}, validDays: 30, origin: "MANUAL" }));
  const eKind = await fails(() => V.createTemplate(ctx, owner, { name: "x", kind: "GOLD", value: 100, config: {}, validDays: 30, origin: "MANUAL" }));
  const ePct = await fails(() => V.createTemplate(ctx, owner, { name: "x", kind: "PERCENT", value: 150, config: {}, validDays: 30, origin: "MANUAL" }));
  const eFixed0 = await fails(() => V.createTemplate(ctx, owner, { name: "x", kind: "FIXED", value: 0, config: {}, validDays: 30, origin: "MANUAL" }));
  const eDays = await fails(() => V.createTemplate(ctx, owner, { name: "x", kind: "FIXED", value: 100, config: {}, validDays: 0, origin: "MANUAL" }));
  const ePerm = await fails(() => V.createTemplate(ctx, thana, { name: "x", kind: "FIXED", value: 100, config: {}, validDays: 30, origin: "MANUAL" }));
  const T300 = await V.createTemplate(ctx, owner, { name: `ส่วนลด ฿300 คอร์ส ${tag}`, kind: "FIXED", value: 30_000, config: { minSatang: 100_000, categoryIds: [CAT], stackWithCoupon: false, unitIds: [] }, validDays: 30, origin: "MANUAL" });
  await V.updateTemplate(ctx, owner, T300.id, { name: `ส่วนลด ฿300 คอร์ส (แก้) ${tag}` });
  const tl = await V.listTemplates(ctx);
  await V.toggleTemplate(ctx, owner, T300.id, false);
  const tOff = await P.voucherTemplate.findUnique({ where: { id: T300.id } });
  await V.toggleTemplate(ctx, owner, T300.id, true);
  const svcSrc = read("src/lib/modules/voucher/service.ts");
  chk("M2.5-S1.2", "createTemplate: ชื่อว่าง/kind นอก enum/PERCENT 150/FIXED 0/validDays 0 → throw ไทย · thana (ไม่มี promo.manage) → throw · สร้าง 'ส่วนลด ฿300 คอร์ส' (minSatang ฿1,000 · หมวดคอร์ส · ไม่ซ้อนคูปอง · 30 วัน) · update ชื่อ · listTemplates มี · toggle off → active false · เพดาน MEMBER_LIMITS.voucherTemplates อ้างในโค้ด",
    thai(eName) && thai(eKind) && thai(ePct) && thai(eFixed0) && thai(eDays) && !!ePerm && !!T300?.id && tl.some((t: Any) => t.id === T300.id && /แก้/.test(t.name)) && tOff?.active === false && /voucherTemplates/.test(svcSrc),
    "ตามสัญญา", `name=${thai(eName)} kind=${thai(eKind)} pct=${thai(ePct)} f0=${thai(eFixed0)} days=${thai(eDays)} perm=${!!ePerm} tpl=${!!T300?.id} list=${tl.some((t: Any) => t.id === T300.id)} off=${tOff?.active} limit=${/voucherTemplates/.test(svcSrc)}`);

  // ═══ S2 issue · idempotent · approval ═══
  const i1 = await V.issue(ctx, owner, { customerIds: [m(1).id, m(2).id], templateId: T300.id, origin: "MANUAL", originRef: { campaignId: `${tag}-c1` }, reason: "ชดเชยความล่าช้า" });
  const v1 = i1?.vouchers?.find((v: Any) => v.customerId === m(1).id);
  const v1row = v1 ? await vrow(v1.id) : null;
  const ob1 = await outbox("voucher.issued", (p) => p.voucherId === v1?.id);
  const i1b = await V.issue(ctx, owner, { customerIds: [m(1).id, m(2).id], templateId: T300.id, origin: "MANUAL", originRef: { campaignId: `${tag}-c1` }, reason: "ซ้ำ" });
  const i1c = await V.issue(ctx, owner, { customerIds: [m(3).id], templateId: T300.id, origin: "MANUAL", originRef: { campaignId: `${tag}-c1` } });
  const n1 = await P.voucher.count({ where: { tenantId: tid, templateId: T300.id, customerId: { in: [m(1).id, m(2).id] } } });
  const act1 = await P.memberActivity.findFirst({ where: { customerId: m(1).id, module: "voucher", type: "VOUCHER_ISSUED", refId: v1?.id } });
  chk("M2.5-S2.1", "issue เทมเพลตให้ 2 คน → {issued 2, vouchers[2]{code V-xxxxxx, kind FIXED, value 30000, status ACTIVE, expiresAt ≈ +30 วัน}} · Voucher row templateId/customerId/origin MANUAL/originRef/config snapshot/idempotencyKey · event voucher.issued {customerId, voucherId, origin, code} · MemberActivity VOUCHER_ISSUED · ออกซ้ำ originRef เดิม → issued 0 skipped 2 (ยัง 2 ใบ) · คนใหม่ originRef เดิม → ออกได้ 1",
    i1?.issued === 2 && i1.vouchers?.length === 2 && /^V-[A-Z0-9]{6,}$/.test(v1?.code ?? "") && v1.kind === "FIXED" && v1.value === 30_000 && v1.status === "ACTIVE" && Math.abs(new Date(v1.expiresAt).getTime() - (Date.now() + 30 * 86_400_000)) < 600_000 && v1row?.templateId === T300.id && v1row.origin === "MANUAL" && v1row.originRef?.campaignId === `${tag}-c1` && v1row.config?.minSatang === 100_000 && !!v1row.idempotencyKey && !!ob1 && ob1.payload.customerId === m(1).id && ob1.payload.code === v1.code && !!act1 && i1b?.issued === 0 && i1b.skipped === 2 && n1 === 2 && i1c?.issued === 1,
    "2 ใบ · ซ้ำไม่ออก", `i1=${JSON.stringify({ issued: i1?.issued, n: i1?.vouchers?.length, code: v1?.code, kind: v1?.kind, value: v1?.value })} row=${JSON.stringify({ tpl: v1row?.templateId === T300.id, origin: v1row?.origin, ref: v1row?.originRef, key: !!v1row?.idempotencyKey })} ob=${!!ob1} act=${!!act1} again=${JSON.stringify(i1b)} n=${n1} new=${i1c?.issued}`);

  const i2 = await V.issue(ctx, owner, { customerIds: [m(4).id], adhoc: { kind: "PERCENT", value: 10, config: { maxDiscountSatang: 50_000, stackWithCoupon: true }, validDays: 7 }, origin: "COMPENSATION", reason: "ชดเชย" });
  const v2 = i2?.vouchers?.[0];
  const eAdhocPct = await fails(() => V.issue(ctx, owner, { customerIds: [m(4).id], adhoc: { kind: "PERCENT", value: 150, config: {}, validDays: 7 }, origin: "MANUAL" }));
  const eEmpty = await fails(() => V.issue(ctx, owner, { customerIds: [], templateId: T300.id, origin: "MANUAL" }));
  const eNoShape = await fails(() => V.issue(ctx, owner, { customerIds: [m(4).id], origin: "MANUAL" }));
  const before4 = await P.voucher.count({ where: { customerId: m(5).id } });
  const eGhost = await fails(() => V.issue(ctx, owner, { customerIds: [m(5).id, "no-such-customer"], templateId: T300.id, origin: "MANUAL" }));
  await V.toggleTemplate(ctx, owner, T300.id, false);
  const eTplOff = await fails(() => V.issue(ctx, owner, { customerIds: [m(5).id], templateId: T300.id, origin: "MANUAL" }));
  await V.toggleTemplate(ctx, owner, T300.id, true);
  chk("M2.5-S2.2", "adhoc PERCENT 10% (cap ฿500 · 7 วัน · COMPENSATION) → 1 ใบ templateId null · adhoc PERCENT 150 → throw ไทย · customerIds ว่าง → throw · ไม่มี template/adhoc → throw · ลูกค้าไม่มีปนอยู่ → throw ไม่ออกให้ใครเลย (สมาชิก 5 ยังเท่าเดิม) · เทมเพลตปิดใช้งาน → throw",
    i2?.issued === 1 && v2?.kind === "PERCENT" && v2.value === 10 && (await vrow(v2.id))?.templateId === null && Math.abs(new Date(v2.expiresAt).getTime() - (Date.now() + 7 * 86_400_000)) < 600_000 && thai(eAdhocPct) && thai(eEmpty) && thai(eNoShape) && thai(eGhost) && (await P.voucher.count({ where: { customerId: m(5).id } })) === before4 && thai(eTplOff),
    "adhoc + atomic", `i2=${JSON.stringify({ issued: i2?.issued, kind: v2?.kind, value: v2?.value })} pct=${thai(eAdhocPct)} empty=${thai(eEmpty)} shape=${thai(eNoShape)} ghost=${eGhost?.message?.slice(0, 40)} n5=${await P.voucher.count({ where: { customerId: m(5).id } })}/${before4} off=${thai(eTplOff)}`);

  const jr = [] as Any[];
  for (let k = 1; k <= 3; k += 1) jr.push(await V.issue(ctx, owner, { customerIds: [m(6).id], adhoc: { kind: "FIXED", value: 10_000, config: {}, validDays: 3 }, origin: "JOURNEY", originRef: { journeyId: `${tag}-j${k}` } }));
  const eJourney = await fails(() => V.issue(ctx, owner, { customerIds: [m(6).id], adhoc: { kind: "FIXED", value: 10_000, config: {}, validDays: 3 }, origin: "JOURNEY", originRef: { journeyId: `${tag}-j4` } }));
  const manualOk = await V.issue(ctx, owner, { customerIds: [m(6).id], adhoc: { kind: "FIXED", value: 10_000, config: {}, validDays: 3 }, origin: "MANUAL" });
  chk("M2.5-S2.3", "journey ≤ 3 ใบ/คน/วัน: JOURNEY ×3 ออกได้ · ใบที่ 4 วันเดียวกัน → throw ไทย · MANUAL ใบที่ 4 ยังออกได้ (เพดานเฉพาะ journey)",
    jr.every((r) => r?.issued === 1) && thai(eJourney) && manualOk?.issued === 1, "3 แล้วหยุด", `jr=${jr.map((r) => r?.issued).join(",")} e=${eJourney?.message?.slice(0, 40)} manual=${manualOk?.issued}`);

  const eStaffBig = await fails(() => V.issue(ctx, thana, { customerIds: [m(7).id], adhoc: { kind: "FIXED", value: 60_000, config: {}, validDays: 7 }, origin: "MANUAL" }));
  const staffOk = await V.issue(ctx, thana, { customerIds: [m(7).id], adhoc: { kind: "FIXED", value: 30_000, config: {}, validDays: 7 }, origin: "MANUAL" });
  const eStaffPct = await fails(() => V.issue(ctx, thana, { customerIds: [m(7).id], adhoc: { kind: "PERCENT", value: 10, config: { maxDiscountSatang: 80_000 }, validDays: 7 }, origin: "MANUAL" }));
  const eStaffKata = await fails(() => V.issue(ctx, thana, { customerIds: [m(45).id], adhoc: { kind: "FIXED", value: 10_000, config: {}, validDays: 7 }, origin: "MANUAL" }));
  const eNoPerm = await fails(() => V.issue(ctx, noPerm, { customerIds: [m(7).id], adhoc: { kind: "FIXED", value: 10_000, config: {}, validDays: 7 }, origin: "MANUAL" }));
  chk("M2.5-S2.4", "STAFF (promo.issue · ป่าตอง): ใบ ฿600 > เพดาน ฿500/ใบ → throw ไทย · ฿300 → ออกได้ · PERCENT cap ฿800 → throw · สมาชิกกะตะ (นอก unitAccess) → throw ไม่พบ · noPerm → throw",
    thai(eStaffBig) && staffOk?.issued === 1 && thai(eStaffPct) && thai(eStaffKata) && !!eNoPerm, "เพดานพนักงาน", `big=${eStaffBig?.message?.slice(0, 40)} ok=${staffOk?.issued} pct=${thai(eStaffPct)} kata=${eStaffKata?.message?.slice(0, 40)} np=${!!eNoPerm}`);

  const pol = await approval.createPolicy({ tenantId: tid }, { name: `QC M2.5 voucher ${tag}`, entityType: "member.voucher.issue", steps: [{ order: 1, approverRole: "OWNER" }] });
  made.approvalPolicies.push(pol.id);
  const many = members.slice(6, 40).map((x: Any) => x.id); // สมาชิก 7–40 (ป่าตองทั้งหมด · ในขอบเขตผู้จัดการป่าตอง) 34 คน × ฿300 = ฿10,200 > ฿10,000
  const mctx = { ...ctx, actorUserId: manager.userId };
  const pend = await V.issue(mctx, manager, { customerIds: many, templateId: T300.id, origin: "CAMPAIGN", originRef: { campaignId: `${tag}-big` }, reason: "แคมเปญใหญ่" });
  const batch = pend?.batchId ? await P.voucherIssueBatch.findUnique({ where: { id: pend.batchId } }) : null;
  const req = pend?.approvalRequestId ? await prisma.approvalRequest.findUnique({ where: { id: pend.approvalRequestId } }) : null;
  const nBig0 = await P.voucher.count({ where: { tenantId: tid, templateId: T300.id, customerId: { in: many } } });
  chk("M2.5-S2.5", "MANAGER ออก 34 คน × ฿300 = ฿10,200 > เพดาน ฿10,000 → {pending true, approvalRequestId, batchId} · VoucherIssueBatch PENDING (input มี customerIds 34) · ApprovalRequest entityType member.voucher.issue amountSatang 1,020,000 PENDING · ยังไม่ออกใบเลย (0)",
    pend?.pending === true && !!pend.approvalRequestId && !!pend.batchId && batch?.status === "PENDING" && batch.input?.customerIds?.length === 34 && req?.entityType === "member.voucher.issue" && req.amountSatang === 1_020_000 && req.status === "PENDING" && nBig0 === 0,
    "pending", `pend=${JSON.stringify(pend)} batch=${batch?.status}/${batch?.input?.customerIds?.length} req=${req?.entityType}/${req?.amountSatang}/${req?.status} n=${nBig0}`);

  await approval.decide({ userId: E.users.owner.userId, role: "OWNER", unitAccess: ["*"], permissions: {} } as Any, { tenantId: tid }, pend.approvalRequestId, { decision: "APPROVED", note: "QC" });
  await drain();
  const batch2 = await P.voucherIssueBatch.findUnique({ where: { id: pend.batchId } });
  const nBig1 = await P.voucher.count({ where: { tenantId: tid, templateId: T300.id, customerId: { in: many } } });
  const oneBig = await P.voucher.findFirst({ where: { tenantId: tid, templateId: T300.id, customerId: many[0] } });
  await drain();
  const nBig2 = await P.voucher.count({ where: { tenantId: tid, templateId: T300.id, customerId: { in: many } } });
  const ownerBig = await V.issue(ctx, owner, { customerIds: many, adhoc: { kind: "FIXED", value: 30_000, config: {}, validDays: 7 }, origin: "MANUAL", originRef: { campaignId: `${tag}-ownerbig` } });
  chk("M2.5-S2.6", "อนุมัติ → approval-effects member.voucher.issue → issueApprovedBatch → batch ISSUED · ออก 34 ใบ (origin CAMPAIGN · originRef มี batchId+campaignId · approvalRequestId) · drain ซ้ำไม่ออกซ้ำ (34) · OWNER ออก 34 × ฿300 → ทันที issued 34 (ไม่ต้องอนุมัติ)",
    batch2?.status === "ISSUED" && nBig1 === 34 && oneBig?.origin === "CAMPAIGN" && oneBig.originRef?.batchId === pend.batchId && oneBig.approvalRequestId === pend.approvalRequestId && nBig2 === 34 && ownerBig?.issued === 34,
    "34 ใบหลังอนุมัติ", `batch=${batch2?.status} n=${nBig1}/${nBig2} one=${oneBig?.origin}/${oneBig?.originRef?.batchId === pend?.batchId}/${oneBig?.approvalRequestId === pend?.approvalRequestId} owner=${ownerBig?.issued}`);

  const pend2 = await V.issue(mctx, manager, { customerIds: many, adhoc: { kind: "FIXED", value: 30_000, config: {}, validDays: 7 }, origin: "MANUAL", originRef: { campaignId: `${tag}-rej` } });
  await approval.decide({ userId: E.users.owner.userId, role: "OWNER", unitAccess: ["*"], permissions: {} } as Any, { tenantId: tid }, pend2.approvalRequestId, { decision: "REJECTED", note: "QC" });
  await drain();
  const batchR = await P.voucherIssueBatch.findUnique({ where: { id: pend2.batchId } });
  const nRej = await P.voucher.count({ where: { tenantId: tid, originRef: { path: ["campaignId"], equals: `${tag}-rej` } } });
  await approval.setPolicyActive({ tenantId: tid }, pol.id, false);
  const auto = await V.issue(mctx, manager, { customerIds: many, adhoc: { kind: "FIXED", value: 30_000, config: {}, validDays: 7 }, origin: "MANUAL", originRef: { campaignId: `${tag}-auto` } });
  chk("M2.5-S2.7", "ปฏิเสธ → batch REJECTED · ไม่ออกใบ (0) · ปิด policy → ไม่มีสายอนุมัติ = autoApproved → MANAGER เกินเพดานออกได้ทันที issued 34",
    pend2?.pending === true && batchR?.status === "REJECTED" && nRej === 0 && auto?.issued === 34, "REJECTED · auto", `pend2=${pend2?.pending} batch=${batchR?.status} n=${nRej} auto=${JSON.stringify({ issued: auto?.issued, pending: auto?.pending })}`);

  // ═══ S3 validate ═══
  const okCart = cart([{ categoryId: CAT, qty: 1, netSatang: 150_000 }, { categoryId: GEAR, qty: 1, netSatang: 50_000 }]);
  const va = await V.validate(ctx, { customerId: m(1).id, code: v1.code, cart: okCart });
  const vb2 = await V.validate(ctx, { customerId: m(1).id, voucherId: v1.id, cart: okCart });
  chk("M2.5-S3.1", "validate ok: ใบ ฿300 (ขั้นต่ำ ฿1,000 · หมวดคอร์ส) กับตะกร้า คอร์ส ฿1,500 + อุปกรณ์ ฿500 → {ok true, discountSatang 30000, voucherId} ทั้งด้วย code และ voucherId · ไม่เขียน (ยัง ACTIVE)",
    va?.ok === true && va.discountSatang === 30_000 && va.voucherId === v1.id && vb2?.ok === true && vb2.discountSatang === 30_000 && (await vrow(v1.id))?.status === "ACTIVE",
    "ok 30000", `va=${JSON.stringify(va)} vb=${JSON.stringify(vb2)} st=${(await vrow(v1.id))?.status}`);

  const vOther = await V.validate(ctx, { customerId: m(2).id, code: v1.code, cart: okCart });
  const vNone = await V.validate(ctx, { customerId: m(1).id, code: "V-NOPE00", cart: okCart });
  const cancelled = (await V.issue(ctx, owner, { customerIds: [m(1).id], adhoc: { kind: "FIXED", value: 5_000, config: {}, validDays: 7 }, origin: "MANUAL" })).vouchers[0];
  await V.cancel(ctx, owner, { voucherId: cancelled.id, reason: "ทดสอบ" });
  const vCancelled = await V.validate(ctx, { customerId: m(1).id, voucherId: cancelled.id, cart: okCart });
  chk("M2.5-S3.2", "ไม่ใช่ของลูกค้าคนนี้ → ok false reason ไทย · รหัสไม่มี → false · ใบ CANCELLED → false reason ไทย (ทั้ง 3 ไม่ throw)",
    vOther?.ok === false && /[ก-๙]/.test(vOther.reason ?? "") && vNone?.ok === false && vCancelled?.ok === false && /[ก-๙]/.test(vCancelled.reason ?? ""), "false ×3", `other=${JSON.stringify(vOther)} none=${JSON.stringify(vNone)} cancelled=${JSON.stringify(vCancelled)}`);

  const vExp = (await V.issue(ctx, owner, { customerIds: [m(1).id], templateId: T300.id, origin: "MANUAL" })).vouchers[0];
  await P.voucher.update({ where: { id: vExp.id }, data: { expiresAt: new Date(Date.now() - 3600_000) } });
  const vExpired = await V.validate(ctx, { customerId: m(1).id, voucherId: vExp.id, cart: okCart });
  const vMin = await V.validate(ctx, { customerId: m(1).id, voucherId: v1.id, cart: cart([{ categoryId: CAT, qty: 1, netSatang: 80_000 }]) });
  const vNoLine = await V.validate(ctx, { customerId: m(1).id, voucherId: v1.id, cart: cart([{ categoryId: GEAR, qty: 1, netSatang: 200_000 }]) });
  chk("M2.5-S3.3", "หมดอายุ (expiresAt ผ่าน) → false 'หมดอายุ' · ยอด ฿800 < ขั้นต่ำ ฿1,000 → false · ตะกร้ามีแต่อุปกรณ์ (ไม่มีหมวดคอร์ส) → false 'ไม่มีรายการที่เข้าเงื่อนไข'",
    vExpired?.ok === false && /หมดอายุ/.test(vExpired.reason ?? "") && vMin?.ok === false && /[ก-๙]/.test(vMin.reason ?? "") && vNoLine?.ok === false && /[ก-๙]/.test(vNoLine.reason ?? ""), "false ×3", `exp=${JSON.stringify(vExpired)} min=${JSON.stringify(vMin)} noline=${JSON.stringify(vNoLine)}`);

  const vStack = await V.validate(ctx, { customerId: m(1).id, voucherId: v1.id, cart: cart(okCart.lines, { couponApplied: true }) });
  const vStackOk = await V.validate(ctx, { customerId: m(4).id, voucherId: v2.id, cart: cart([{ categoryId: CAT, qty: 1, netSatang: 200_000 }], { couponApplied: true }) });
  const Tunit = await V.createTemplate(ctx, owner, { name: `เฉพาะป่าตอง ${tag}`, kind: "FIXED", value: 10_000, config: { unitIds: [E.units.patong] }, validDays: 30, origin: "MANUAL" });
  const vU = (await V.issue(ctx, owner, { customerIds: [m(1).id], templateId: Tunit.id, origin: "MANUAL" })).vouchers[0];
  const vUnitBad = await V.validate(ctx, { customerId: m(1).id, voucherId: vU.id, cart: cart(okCart.lines, { unitId: E.units.kata }) });
  const vUnitOk = await V.validate(ctx, { customerId: m(1).id, voucherId: vU.id, cart: cart(okCart.lines, { unitId: E.units.patong }) });
  chk("M2.5-S3.4", "ซ้อนคูปอง: ใบ stackWithCoupon false + couponApplied → false ไทย · ใบ adhoc stackWithCoupon true + couponApplied → ok (10% ของ ฿2,000 = 20000) · unitIds [ป่าตอง]: cart unit กะตะ → false · ป่าตอง → ok 10000",
    vStack?.ok === false && /[ก-๙]/.test(vStack.reason ?? "") && vStackOk?.ok === true && vStackOk.discountSatang === 20_000 && vUnitBad?.ok === false && vUnitOk?.ok === true && vUnitOk.discountSatang === 10_000,
    "ตามเงื่อนไข", `stack=${JSON.stringify(vStack)} stackOk=${JSON.stringify(vStackOk)} unitBad=${JSON.stringify(vUnitBad)} unitOk=${JSON.stringify(vUnitOk)}`);

  const vPctCap = await V.validate(ctx, { customerId: m(4).id, voucherId: v2.id, cart: cart([{ categoryId: CAT, qty: 1, netSatang: 700_000 }]) });
  const vPct = await V.validate(ctx, { customerId: m(4).id, voucherId: v2.id, cart: cart([{ categoryId: CAT, qty: 1, netSatang: 123_450 }]) });
  const vFixedCap = await V.validate(ctx, { customerId: m(1).id, voucherId: v1.id, cart: cart([{ categoryId: CAT, qty: 1, netSatang: 20_000 }, { categoryId: GEAR, qty: 1, netSatang: 100_000 }]) });
  chk("M2.5-S3.5", "PERCENT 10% cap ฿500: ยอด ฿7,000 → 50000 (ชน cap) · ยอด ฿1,234.50 → 12345 (floor) · FIXED ฿300 กับหมวดคอร์สแค่ ฿200 (ยอดรวม ฿1,200 ผ่านขั้นต่ำ) → ส่วนลด 20000 (ไม่เกินยอดที่เข้าเกณฑ์)",
    vPctCap?.ok === true && vPctCap.discountSatang === 50_000 && vPct?.ok === true && vPct.discountSatang === 12_345 && vFixedCap?.ok === true && vFixedCap.discountSatang === 20_000,
    "50000 · 12345 · 20000", `cap=${JSON.stringify(vPctCap)} pct=${JSON.stringify(vPct)} fixed=${JSON.stringify(vFixedCap)}`);

  const svc = await prisma.bookingService.findFirst({ where: { tenantId: tid, unitId: E.units.patong } });
  const Tfree = await V.createTemplate(ctx, owner, { name: `ดำน้ำฟรี 1 ไดฟ์ ${tag}`, kind: "FREE_SERVICE", value: 0, config: { serviceId: svc!.id }, validDays: 60, origin: "REDEEM" });
  const vF = (await V.issue(ctx, owner, { customerIds: [m(1).id], templateId: Tfree.id, origin: "REDEEM" })).vouchers[0];
  const vFreeOk = await V.validate(ctx, { customerId: m(1).id, voucherId: vF.id, cart: cart([{ serviceId: svc!.id, qty: 2, netSatang: 500_000 }, { categoryId: GEAR, qty: 1, netSatang: 30_000 }]) });
  const vFreeNo = await V.validate(ctx, { customerId: m(1).id, voucherId: vF.id, cart: cart([{ categoryId: GEAR, qty: 1, netSatang: 30_000 }]) });
  const vItem = (await V.issue(ctx, owner, { customerIds: [m(1).id], adhoc: { kind: "FREE_ITEM", value: 0, config: { itemId: "item-mask" }, validDays: 10 }, origin: "MANUAL" })).vouchers[0];
  const vItemOk = await V.validate(ctx, { customerId: m(1).id, voucherId: vItem.id, cart: cart([{ itemId: "item-mask", qty: 3, netSatang: 90_000 }]) });
  chk("M2.5-S3.6", "FREE_SERVICE (บริการป่าตอง): ตะกร้ามี line บริการนั้น qty 2 ฿5,000 → ส่วนลด 250000 (1 หน่วย) · ไม่มี line บริการ → false · FREE_ITEM item-mask qty 3 ฿900 → 30000 (1 หน่วย)",
    vFreeOk?.ok === true && vFreeOk.discountSatang === 250_000 && vFreeNo?.ok === false && vItemOk?.ok === true && vItemOk.discountSatang === 30_000,
    "250000 · false · 30000", `free=${JSON.stringify(vFreeOk)} no=${JSON.stringify(vFreeNo)} item=${JSON.stringify(vItemOk)}`);

  // ═══ S4 redeem / release / cancel / list ═══
  const rd = await V.redeem(ctx, { voucherId: v1.id, customerId: m(1).id, saleId: `${tag}-sale1`, discountSatang: 30_000 });
  const v1u = await vrow(v1.id);
  const obU = await outbox("voucher.used", (p) => p.voucherId === v1.id);
  const eTwice = await fails(() => V.redeem(ctx, { voucherId: v1.id, customerId: m(1).id, saleId: `${tag}-sale2` }));
  const vr = (await V.issue(ctx, owner, { customerIds: [m(2).id], adhoc: { kind: "FIXED", value: 5_000, config: {}, validDays: 7 }, origin: "MANUAL" })).vouchers[0];
  const race = await Promise.allSettled([V.redeem(ctx, { voucherId: vr.id, customerId: m(2).id, saleId: `${tag}-r1` }), V.redeem(ctx, { voucherId: vr.id, customerId: m(2).id, saleId: `${tag}-r2` })]);
  const eWrongCust = await fails(() => V.redeem(ctx, { voucherId: vU.id, customerId: m(2).id, saleId: `${tag}-x` }));
  const eCancelledRd = await fails(() => V.redeem(ctx, { voucherId: cancelled.id, customerId: m(1).id, saleId: `${tag}-x2` }));
  const inTx = (await prisma.$transaction((tx) => V.redeem(ctx, { voucherId: vU.id, customerId: m(1).id, saleId: `${tag}-tx` }, tx))) as Any;
  chk("M2.5-S4.1", "redeem ATOMIC: ใบ ฿300 → USED usedAt usedRef {saleId, discountSatang 30000} · event voucher.used {customerId, voucherId, origin, saleId} · ใช้ซ้ำ → throw ไทย (conflict) · ยิงพร้อมกัน 2 ครั้งบนใบใหม่ → สำเร็จ 1 ล้ม 1 · customerId ผิด → throw · ใบ CANCELLED → throw · เรียกใน tx ได้",
    rd?.ok === true && v1u?.status === "USED" && !!v1u.usedAt && v1u.usedRef?.saleId === `${tag}-sale1` && v1u.usedRef?.discountSatang === 30_000 && !!obU && obU.payload.saleId === `${tag}-sale1` && obU.payload.customerId === m(1).id && thai(eTwice) && race.filter((r) => r.status === "fulfilled").length === 1 && !!eWrongCust && !!eCancelledRd && inTx?.ok === true && (await vrow(vU.id))?.status === "USED",
    "USED ครั้งเดียว", `rd=${JSON.stringify(rd)} st=${v1u?.status} ref=${JSON.stringify(v1u?.usedRef)} ob=${!!obU} twice=${eTwice?.message?.slice(0, 40)} race=${race.map((r) => r.status).join(",")} wrong=${!!eWrongCust} cancelled=${!!eCancelledRd} tx=${JSON.stringify(inTx)}`);

  const rl = await V.release(ctx, { voucherId: v1.id, reason: "void บิล" });
  const v1r = await vrow(v1.id);
  const rl2 = await V.release(ctx, { voucherId: v1.id });
  await P.voucher.update({ where: { id: vU.id }, data: { expiresAt: new Date(Date.now() - 86_400_000) } });
  const rlExp = await V.release(ctx, { voucherId: vU.id, reason: "void" });
  const vUr = await vrow(vU.id);
  chk("M2.5-S4.2", "release: USED → ACTIVE (usedAt/usedRef ล้าง) {ok, changed true} · release ซ้ำ → {changed false} · ใบที่หมดอายุระหว่างใช้ → ACTIVE + expiresAt = now + 7 วัน (§11.5)",
    rl?.ok === true && rl.changed === true && v1r?.status === "ACTIVE" && v1r.usedAt === null && rl2?.changed === false && rlExp?.ok === true && vUr?.status === "ACTIVE" && Math.abs(new Date(vUr.expiresAt).getTime() - (Date.now() + 7 * 86_400_000)) < 600_000,
    "กลับ ACTIVE", `rl=${JSON.stringify(rl)} st=${v1r?.status}/${v1r?.usedAt} rl2=${JSON.stringify(rl2)} exp=${vUr?.status}/${vUr?.expiresAt}`);

  await V.redeem(ctx, { voucherId: vU.id, customerId: m(1).id, saleId: `${tag}-s3` });
  const eCancelUsed = await fails(() => V.cancel(ctx, owner, { voucherId: vU.id, reason: "x" }));
  const eCancelPerm = await fails(() => V.cancel(ctx, thana, { voucherId: v1.id, reason: "x" }));
  const cn = await V.cancel(ctx, owner, { voucherId: v1.id, reason: "ออกผิดคน" });
  const v1c = await vrow(v1.id);
  const cn2 = await V.cancel(ctx, owner, { voucherId: v1.id, reason: "ซ้ำ" });
  chk("M2.5-S4.3", "cancel: ใบ USED → throw ไทย · thana (ไม่มี promo.manage) → throw · ACTIVE → CANCELLED cancelledAt · ซ้ำ → idempotent ok",
    thai(eCancelUsed) && !!eCancelPerm && cn?.ok === true && v1c?.status === "CANCELLED" && !!v1c.cancelledAt && cn2?.ok === true, "CANCELLED", `used=${eCancelUsed?.message?.slice(0, 40)} perm=${!!eCancelPerm} cn=${JSON.stringify(cn)} st=${v1c?.status} cn2=${JSON.stringify(cn2)}`);

  const lc = await V.listForCustomer(ctx, m(1).id, {});
  const lcAll = await V.listForCustomer(ctx, m(1).id, { status: "CANCELLED" });
  const lv = await V.listVouchers(ctx, { status: "ACTIVE", take: 200 });
  const lvQ = await V.listVouchers(ctx, { q: vF.code, take: 10 });
  const lvO = await V.listVouchers(ctx, { origin: "REDEEM", take: 50 });
  chk("M2.5-S4.4", "listForCustomer(สมาชิก 1): ใบ ACTIVE ก่อน (expiresAt ใกล้สุดก่อน) · ไม่มี CANCELLED โดยปริยาย · status CANCELLED → มีใบที่ยกเลิก · listVouchers {status ACTIVE} rows มี name/customerName/origin/expiresAt + kpi {activeCount, activeValueSatang, usedThisMonth, usageRatePct} · q=code → 1 แถว · origin REDEEM → มีใบดำน้ำฟรี",
    Array.isArray(lc) && lc.length > 0 && lc[0].status === "ACTIVE" && !lc.some((v: Any) => v.status === "CANCELLED") && lc.filter((v: Any) => v.status === "ACTIVE").every((v: Any, i: number, arr: Any[]) => i === 0 || new Date(arr[i - 1].expiresAt) <= new Date(v.expiresAt)) && lcAll.some((v: Any) => v.id === v1.id) && lv?.rows?.length > 0 && lv.rows.every((r: Any) => r.status === "ACTIVE" && !!r.customerName && !!r.origin) && typeof lv.kpi?.activeCount === "number" && typeof lv.kpi.activeValueSatang === "number" && typeof lv.kpi.usedThisMonth === "number" && typeof lv.kpi.usageRatePct === "number" && lvQ?.rows?.length === 1 && lvQ.rows[0].code === vF.code && lvO?.rows?.some((r: Any) => r.id === vF.id),
    "รายการ + kpi", `lc=${lc?.length}/${lc?.[0]?.status} all=${lcAll?.some((v: Any) => v.id === v1.id)} lv=${lv?.rows?.length} kpi=${JSON.stringify(lv?.kpi)} q=${lvQ?.rows?.length} o=${lvO?.rows?.some((r: Any) => r.id === vF.id)}`);

  // ═══ S5 expire / expiring / cron ═══
  const vE1 = (await V.issue(ctx, owner, { customerIds: [m(8).id], adhoc: { kind: "FIXED", value: 1_000, config: {}, validDays: 5 }, origin: "MANUAL" })).vouchers[0];
  const vE2 = (await V.issue(ctx, owner, { customerIds: [m(8).id], adhoc: { kind: "FIXED", value: 1_000, config: {}, validDays: 5 }, origin: "MANUAL" })).vouchers[0];
  await P.voucher.update({ where: { id: vE1.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  const ex = await V.expireDue();
  const obX = await outbox("voucher.expired", (p) => p.voucherId === vE1.id);
  chk("M2.5-S5.1", "expireDue: ใบ expiresAt ผ่าน → EXPIRED + event voucher.expired {customerId, voucherId} · ใบสด (5 วัน) ยัง ACTIVE · คืน {expired ≥ 1}",
    typeof ex?.expired === "number" && ex.expired >= 1 && (await vrow(vE1.id))?.status === "EXPIRED" && !!obX && obX.payload.customerId === m(8).id && (await vrow(vE2.id))?.status === "ACTIVE", "EXPIRED 1", `ex=${JSON.stringify(ex)} st=${(await vrow(vE1.id))?.status}/${(await vrow(vE2.id))?.status} ob=${!!obX}`);

  const bkkMidnightIn = (days: number) => { const d = new Date(Date.now() + 7 * 3600_000 + days * 86_400_000); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 16, 59, 59)); }; // 23:59:59 ไทยของวันนั้น
  await P.voucher.update({ where: { id: vE2.id }, data: { expiresAt: bkkMidnightIn(7) } });
  const vE3 = (await V.issue(ctx, owner, { customerIds: [m(9).id], adhoc: { kind: "FIXED", value: 1_000, config: {}, validDays: 30 }, origin: "MANUAL" })).vouchers[0];
  await P.voucher.update({ where: { id: vE3.id }, data: { expiresAt: bkkMidnightIn(3) } });
  const nt = await V.notifyExpiring();
  const obN = await outbox("voucher.expiring", (p) => p.voucherId === vE2.id);
  const obN3 = await outbox("voucher.expiring", (p) => p.voucherId === vE3.id);
  await V.notifyExpiring();
  const nN = await P.outboxEvent.count({ where: { tenantId: tid, type: "voucher.expiring", payload: { path: ["voucherId"], equals: vE2.id } } });
  const cron = read("src/lib/platform/cron.ts");
  chk("M2.5-S5.2", "notifyExpiring: ใบเหลือ 7 วัน (วันไทย) → event voucher.expiring {customerId, voucherId, expiresAt, daysLeft 7} · ใบเหลือ 3 วัน ไม่แจ้ง · รันซ้ำวันเดียวกัน → ไม่ยิงซ้ำ (1) · cron.ts steps voucherExpire + voucherExpiring · summary voucherExpired/voucherExpiring",
    typeof nt?.notified === "number" && !!obN && obN.payload.daysLeft === 7 && obN.payload.customerId === m(8).id && !obN3 && nN === 1 && /voucherExpire\b/.test(cron) && /voucherExpiring/.test(cron) && /voucherExpired/.test(cron),
    "แจ้ง 7 วัน ครั้งเดียว", `nt=${JSON.stringify(nt)} ob=${JSON.stringify(obN?.payload)} ob3=${!!obN3} n=${nN} cron=${/voucherExpire\b/.test(cron)}/${/voucherExpiring/.test(cron)}`);

  // ═══ S6 hooks · merge · events ═══
  const mkCust = async (nm: string) => { const c = await PR.createMember(ctx as Any, owner, { phone: `0895${String((Date.now() + Math.floor(Math.random() * 1000)) % 1_000_000).padStart(6, "0")}`, firstName: nm, lastName: "voucher", source: "STAFF", homeUnitId: E.units.patong }); made.customers.push(c.customerId); return c.customerId as string; };
  const X = await mkCust("เก็บ"); const Y = await mkCust("ถูกรวม");
  await V.issue(ctx, owner, { customerIds: [Y], templateId: T300.id, origin: "MANUAL" });
  await V.issue(ctx, owner, { customerIds: [X], templateId: T300.id, origin: "MANUAL" });
  await PR.mergeMembers(ctx as Any, owner, { keepId: X, mergeId: Y, fieldChoices: {} });
  const nX = await P.voucher.count({ where: { customerId: X } }); const nY = await P.voucher.count({ where: { customerId: Y } });
  const gold = await P.memberTierDef.findFirst({ where: { systemId: SYS, key: "gold" } });
  const ben0 = await P.memberTierBenefit.findMany({ where: { tierDefId: gold.id } });
  restore.push(async () => { await P.memberTierBenefit.deleteMany({ where: { tierDefId: gold.id, type: "WELCOME_VOUCHER" } }); for (const b of ben0) await P.memberTierBenefit.upsert({ where: { id: b.id }, update: { config: b.config, active: b.active }, create: { ...b } }).catch(() => null); });
  await P.memberTierBenefit.deleteMany({ where: { tierDefId: gold.id, type: "WELCOME_VOUCHER" } });
  await P.memberTierBenefit.create({ data: { tenantId: tid, tierDefId: gold.id, type: "WELCOME_VOUCHER", config: { templateId: T300.id }, active: true } });
  const Z = await mkCust("เลื่อนระดับ");
  await T.applyTierChange(ctx as Any, Z, gold.id, "MANUAL", { qc: tag }, { byUserId: owner.userId });
  await drain();
  const welcome = await P.voucher.findMany({ where: { customerId: Z, origin: "TIER" } });
  await T.applyTierChange(ctx as Any, Z, gold.id, "MANUAL", { qc: `${tag}-2` }, { byUserId: owner.userId }).catch(() => null);
  await drain();
  const welcome2 = await P.voucher.count({ where: { customerId: Z, origin: "TIER" } });
  const card = await ST.createCard(ctx, owner, { name: `การ์ด voucher ${tag}`, slots: 2, ruleKind: "MANUAL", ruleConfig: { perDayMax: 10 }, rewardKind: "VOUCHER", rewardConfig: { templateId: Tfree.id }, autoRestart: true, tierDefIds: [], unitIds: [] });
  made.cards.push(card.id);
  const sc = await ST.addStamp(ctx, owner, { cardId: card.id, customerId: X, count: 2, idempotencyKey: `qc25-${tag}-stamp` });
  const prog = await P.stampCardProgress.findFirst({ where: { cardId: card.id, customerId: X, cycle: 1 } });
  const stampV = prog?.rewardVoucherId ? await vrow(prog.rewardVoucherId) : null;
  chk("M2.5-S6.1", "merge hook: Y (1 ใบ) รวมเข้า X (1 ใบ) → X 2 ใบ · Y 0 · tier welcome hook (registerMemberHooks): gold มี WELCOME_VOUCHER {templateId} → applyTierChange(Z → gold) → 1 ใบ origin TIER originRef {tierDefId} · เปลี่ยนซ้ำ → ยัง 1 (idempotent) · stamp hook: การ์ด rewardKind VOUCHER ครบ → ใบ origin STAMP originRef {stampProgressId} + progress.rewardVoucherId + ผล addStamp มี rewardVoucherId",
    nX === 2 && nY === 0 && welcome.length === 1 && welcome[0].originRef?.tierDefId === gold.id && welcome[0].templateId === T300.id && welcome2 === 1 && sc?.completed === true && !!sc.rewardVoucherId && !!stampV && stampV.origin === "STAMP" && stampV.originRef?.stampProgressId === prog.id && stampV.templateId === Tfree.id,
    "hooks ทำงาน", `merge=${nX}/${nY} welcome=${welcome.length}/${welcome[0]?.originRef?.tierDefId === gold?.id}/${welcome2} stamp=${JSON.stringify({ completed: sc?.completed, rv: !!sc?.rewardVoucherId, origin: stampV?.origin, ref: stampV?.originRef })}`);

  const consumers = read("src/lib/outbox-consumers.ts");
  const A2 = (await import("@/lib/automation/labels" as string)) as Any; const W2 = (await import("@/lib/webhooks/labels" as string)) as Any;
  const in3 = (e: string) => new RegExp(`"${e.replace(/\./g, "\\.")}":`).test(consumers) && A2.AUTOMATION_EVENTS.some((x: Any) => x.value === e && /[ก-๙]/.test(x.label)) && W2.WEBHOOK_EVENTS.filter((x: Any) => x.value === e).length === 1;
  const EV = ["voucher.issued", "voucher.used", "voucher.expiring", "voucher.expired"];
  await drain();
  const stuck = await P.outboxEvent.count({ where: { tenantId: tid, type: { startsWith: "voucher." }, status: { not: "DONE" } } });
  const effects = read("src/lib/approval-effects.ts"); const hooksSrc = read("src/lib/member-hooks.ts");
  chk("M2.5-S6.2", "voucher.issued/used/expiring/expired ลง 3 ทะเบียน + consumer · drain แล้ว DONE ทั้งหมด · approval-effects.ts มี member.voucher.issue → issueApprovedBatch · member-hooks.ts registerMemberHooks (idempotent · import จาก outbox-consumers.ts + cron.ts)",
    EV.every(in3) && stuck === 0 && /member\.voucher\.issue/.test(effects) && /issueApprovedBatch/.test(effects) && /registerMemberHooks/.test(hooksSrc) && /member-hooks/.test(consumers) && /member-hooks/.test(cron),
    "ครบ", `reg=${EV.map((e) => in3(e)).join("/")} stuck=${stuck} effects=${/issueApprovedBatch/.test(effects)} hooks=${/registerMemberHooks/.test(hooksSrc)} imports=${/member-hooks/.test(consumers)}/${/member-hooks/.test(cron)}`);

  // ═══ S7 UI / ภาพ ═══
  const pages = { hub: read("src/app/app/sys/[id]/member/promotions/page.tsx"), list: read("src/app/app/sys/[id]/member/promotions/vouchers/page.tsx"), templates: read("src/app/app/sys/[id]/member/promotions/vouchers/templates/page.tsx") };
  const act = read("src/lib/modules/voucher/voucher-actions.ts");
  const facade = read("src/lib/modules/voucher/index.ts");
  const nav = read("src/lib/modules/member/nav.ts");
  const compDir = "src/components/member";
  const comps = existsSync(compDir) ? readdirSync(compDir).filter((f) => /voucher|promotion/i.test(f)).map((f) => read(`${compDir}/${f}`)).join("\n") : "";
  const all = Object.values(pages).join("\n") + comps;
  const TIDS = ["promotions-page", "vouchers-page", "vouchers-kpi", "vouchers-search", "vouchers-table", "vouchers-row-", "vouchers-issue", "vouchers-issue-modal", "vouchers-issue-target", "vouchers-issue-kind", "vouchers-issue-value", "vouchers-issue-approval-hint", "vouchers-issue-submit", "vouchers-templates", "vouchers-template-add", "vouchers-template-form"];
  const missingT = TIDS.filter((t) => !all.includes(t));
  const FAC = ["createTemplate", "updateTemplate", "toggleTemplate", "listTemplates", "issue", "issueApprovedBatch", "validate", "redeem", "release", "cancel", "expireDue", "notifyExpiring", "listForCustomer", "listVouchers", "mergeVouchers"];
  const missingF = FAC.filter((f) => !new RegExp(`\\b${f}\\b`).test(facade));
  const clean = all.replace(/\/\/.*$/gm, "");
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(clean); const hex = /#[0-9a-fA-F]{6}\b/.test(clean);
  const LABELS = ["ออก voucher", "ให้ใคร", "รายคน", "กลุ่ม (segment)", "แบบ", "มูลค่า", "เงื่อนไข", "ขั้นต่ำบิล", "ใช้กับหมวด", "ใช้ร่วมกับคูปอง", "อายุ", "วัน หลังออก", "ต้นทาง/เหตุผล", "แจ้งทาง LINE", "ต้องอนุมัติ", "มากกว่าเพดาน", "ผู้อนุมัติ", "ใช้ได้", "มูลค่ารวม", "ใช้แล้วเดือนนี้", "อัตราการใช้", "ค้นหา รหัส / ชื่อ / ผู้รับ", "ผู้รับ", "หมดอายุ"];
  const missingL = LABELS.filter((l) => !all.includes(l));
  chk("M2.5-S7.1", "หน้า promotions (hub) + vouchers + templates requireTenant + สิทธิ์ (read-โดยนัย · issue · manage) · actions 'use server' gate · testid 16 · nav promotions → ready · facade export 15 · service.ts ไม่ import โมดูลอื่นตรงนอก facade · ไม่มี any/อีโมจิ/hex · ป้ายภาพ 19 ครบ (โมดัล + KPI + ตาราง)",
    Object.values(pages).every((p) => p.length > 0 && /requireTenant/.test(p)) && /promo\.(issue|manage)/.test(act) && /["']use server["']/.test(act) && missingT.length === 0 && /key:\s*"promotions"[^\n]*status:\s*"ready"/.test(nav) && missingF.length === 0 && !/@\/lib\/modules\/(member|approval|point|stamp|pos|booking)\/(?!index)[a-z-]+"/.test(svcSrc) && !/:\s*any\b/.test(svcSrc + act) && !emoji && !hex && missingL.length === 0,
    "ครบ", `pages=${Object.values(pages).map((p) => p.length > 0).join("/")} tid-missing=${missingT.join(",") || "-"} nav=${/key:\s*"promotions"[^\n]*status:\s*"ready"/.test(nav)} facade-missing=${missingF.join(",") || "-"} deep=${/@\/lib\/modules\/(member|approval|point|stamp|pos|booking)\/(?!index)[a-z-]+"/.test(svcSrc)} any=${/:\s*any\b/.test(svcSrc + act)} emoji=${emoji} hex=${hex} labels-missing=${missingL.join(",") || "-"}`);

  const dir = `${mq.MQC.shotsDir}/2.5`;
  const sum = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sum(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  const ok = (u: string, n: string, d: string) => r(u, n, d)?.status === 200 && r(u, n, d)?.missing?.length === 0 && r(u, n, d)?.errors?.length === 0 && !r(u, n, d)?.overflow;
  chk("M2.5-S7.2", "ภาพ 19: vouchers-owner desktop+mobile 200 ไม่ล้น · vouchers-issue-modal-owner 200 (กดออก voucher → โมดัล · เลือกกลุ่ม → กล่องต้องอนุมัติ) · vouchers-templates-owner 200 · promotions-owner 200 · thana (read-โดยนัย) 200 ไม่มีปุ่มออก · noperm 404",
    ok("owner", "vouchers-owner", "desktop") && ok("owner", "vouchers-owner", "mobile") && ok("owner", "vouchers-issue-modal-owner", "desktop") && ok("owner", "vouchers-templates-owner", "desktop") && ok("owner", "promotions-owner", "desktop") && ok("thana", "vouchers-thana", "desktop") && r("noperm", "vouchers-noperm", "desktop")?.status === 404,
    "200 ×6 · 404", `${["vouchers-owner", "vouchers-issue-modal-owner", "vouchers-templates-owner", "promotions-owner"].map((n) => r("owner", n, "desktop")?.status).join("/")} mobile=${r("owner", "vouchers-owner", "mobile")?.status}/ovf=${r("owner", "vouchers-owner", "mobile")?.overflow} thana=${r("thana", "vouchers-thana", "desktop")?.status} noperm=${r("noperm", "vouchers-noperm", "desktop")?.status}`);
  chk("M2.5-S7.3", "🔴 parity ภาพ 19 — Fable ตรวจด้วยตา · wo-notes/member-M2.5.md มี 'PARITY: ผ่าน'", /PARITY:\s*ผ่าน/.test(read("ledger/wo-notes/member-M2.5.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M2.5-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  for (const id of made.approvalPolicies) { await d(() => prisma.approvalRequest.deleteMany({ where: { policyId: id } })); await d(() => P.approvalStep.deleteMany({ where: { policyId: id } })); await d(() => P.approvalPolicy.delete({ where: { id } })); }
  if (made.cards.length) {
    const progs = await P.stampCardProgress.findMany({ where: { cardId: { in: made.cards } }, select: { id: true } }).catch(() => []);
    const pids = progs.map((p: Any) => p.id);
    if (pids.length) { await d(() => P.stampEvent.deleteMany({ where: { progressId: { in: pids } } })); await d(() => P.stampCardProgress.deleteMany({ where: { id: { in: pids } } })); }
    await d(() => P.stampCard.deleteMany({ where: { id: { in: made.cards } } }));
  }
  // ใบ/เทมเพลต/batch ที่เกิดระหว่างข้อสอบ = ทุกแถวของร้าน QC ที่ไม่มีอยู่ก่อนเริ่ม
  await d(() => P.memberActivity.deleteMany({ where: { tenantId: tid, module: "voucher", refId: { notIn: [...before.vouchers] } } }));
  await d(() => P.voucher.deleteMany({ where: { tenantId: tid, id: { notIn: [...before.vouchers] } } }));
  await d(() => P.voucherIssueBatch.deleteMany({ where: { tenantId: tid, id: { notIn: [...before.batches] } } }));
  await d(() => P.voucherTemplate.deleteMany({ where: { tenantId: tid, id: { notIn: [...before.templates] } } }));
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["voucher", "stampCardProgress", "pointLot", "pointLedger", "pointBalance", "memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberAccessLog", "memberActivity"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) { await d(() => prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } })); await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } })); }
  }
  for (const t of ["voucher.", "stamp.", "approval.", "member.", "point."]) await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: t }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M2.5: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
