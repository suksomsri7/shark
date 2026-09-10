// QC — ระบบสมาชิก v2 WO M2.3: สแตมป์การ์ด — StampCard/Progress/Event · addStamp กฎ 5 ชนิด (PER_SALE_MIN PER_ITEM PER_VISIT PER_DAY MANUAL) · perDayMax · tier/unit · PIN/QR/auto · completeCycle → รางวัล (POINTS จริง · VOUCHER/REWARD/DISCOUNT_NEXT stub → M2.5/M2.4/M2.7) · autoRestart · void · expire · merge hook · auto จากบิล/นัด (consumer) · editor + การ์ดจริง + สถิติ (ภาพ 17)
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M2.3 · พิมพ์เขียว §4.2 (enum) §4.3 (StampCard/StampCardProgress/StampEvent) §5.6 §7.1 (stamp.added/completed) §7.5 (stamp.expireDue) §9.1 (สแตมป์หลัง pos.sale.paid · void → VOID) §9.2 (booking.completed → PER_VISIT) §11.9 (เพดาน 20 ใบ) · MEMBER-API §2.7 · ภาพ 17
// requires: member-seed
//
// สัญญา (โมดูลใหม่ src/lib/modules/stamp/{service.ts, index.ts (facade), stamp-actions.ts} · migration `member_v2_d` · prisma/schema/stamp.prisma หรือ member.prisma)
//   ctx = { tenantId, systemId (= ระบบ MEMBER), actorUserId } · actor = MemberActor (toMemberActor) — สิทธิ์: จัดการการ์ด = member.loyalty.manage · ประทับ = member.loyalty.stamp · อ่าน = member.loyalty.read (read-โดยนัย)
//   createCard(ctx, actor, { name, description?, slots(3–30), ruleKind, ruleConfig{minSatang?, itemIds[]?, serviceIds[]?, perDayMax(≥1 · ปริยาย 1), allowStaffScan(ปริยาย true), allowAutoFromSale(ปริยาย true), staffPin?}, rewardKind, rewardConfig, autoRestart(ปริยาย true), validMonths?, tierDefIds[], unitIds[] }) → StampCard · เพดาน MEMBER_LIMITS.stampCards (20) · updateCard/toggleCard/listCards(ctx) (+stats ต่อใบ {active, completed, rewardsPaid})
//   addStamp(ctx, actor, { cardId, customerId, count=1, refType?("MANUAL"|"QR"|"SALE"|"VISIT"|"MERGE"), refId?, unitId?, byPin?, idempotencyKey }) → { progressId, stamps, cycle, completed, rewardKind?, rewardVoucherId?: null, eventId }
//     กติกา: การ์ด active · ลูกค้าอยู่ระบบเดียวกัน (ไม่งั้น throw ไทย) · tierDefIds ไม่ว่าง → tierDefId ของลูกค้าต้องอยู่ในรายการ · unitIds ไม่ว่าง → unitId ที่ส่งมาต้องอยู่ในรายการ · STAFF unitAccess ต้องครอบ homeUnit ของลูกค้า (404-not-403 → throw ไม่พบ)
//       ผู้ประทับ: staff ต้องมี member.loyalty.stamp + card.allowStaffScan (false → throw) · actor CUSTOMER (LIFF ใส่ PIN): ต้องมี card.staffPin และ byPin ตรง (ไม่ตรง/ไม่มี PIN/การ์ดไม่ตั้ง PIN → throw ไทย)
//       perDayMax: จำนวน ADD (นับ count) ของ progress นี้ในวันไทยเดียวกัน + count ต้อง ≤ perDayMax ไม่งั้น throw (ไม่ประทับบางส่วน) · PER_DAY = สูงสุด 1 ตรา/วันไทย ไม่ว่า count
//       idempotencyKey ซ้ำ (unique tenantId+idempotencyKey) → คืนผลเดิม ไม่สร้าง event ใหม่
//       ครบ (stamps ≥ slots) → completeCycle: progress.completedAt · StampEvent USE count=slots · รางวัลตาม rewardKind: POINTS {points} → point facade earnWithLot (refType "STAMP" refId progressId · idempotencyKey `stamp:${progressId}`) · VOUCHER {templateId?}/REWARD {rewardId?}/DISCOUNT_NEXT {pct|satang} = stub (บันทึกใน payload event · rewardVoucherId null · ไม่ throw) · event stamp.completed {customerId, cardId, stamps, cycle, rewardKind, rewardConfig} · autoRestart → progress cycle+1 (stamps = ส่วนเกิน) · ไม่ restart → addStamp ครั้งถัดไป throw ไทย "ครบแล้ว"
//     event stamp.added {customerId, cardId, stamps, cycle, count, eventId} ทุกครั้งที่ประทับ
//   voidStampEvent(ctx, actor, { eventId }) → สิทธิ์ loyalty.manage · เฉพาะ ADD ที่ยังไม่ถูก void และ progress ยังไม่ครบ · StampEvent VOID (count = ของเดิม · refId = eventId เดิม) · progress.stamps −count (ไม่ต่ำกว่า 0) · void ซ้ำ → throw ไทย
//   voidStampsForSale(ctx, { saleId }) → void ทุก event ที่ refType SALE refId saleId (ใช้ตอน pos.sale.voided) · idempotent
//   progressFor(ctx, customerId) → [{ cardId, name, slots, stamps, cycle, expiresAt, completedCycles, rewardKind }] เฉพาะการ์ด active ที่ลูกค้าเข้าเกณฑ์ (tier) — ใบที่ยังไม่เคยประทับก็แสดง stamps 0
//   cardStats(ctx, cardId) → { active, completed, rewardsPaid }
//   autoStampFromSale(ctx, { saleId }) → { events: [{cardId, eventId, stamps}] } — ทุกการ์ด active ที่ allowAutoFromSale และ ruleKind ∈ PER_SALE_MIN(minSatang ≤ net) · PER_ITEM (1 ตรา/qty ของ line ที่ itemId ∈ itemIds หรือ serviceId ∈ serviceIds · รวมแล้วไม่เกิน perDayMax — เกิน = ตัดที่ perDayMax ไม่ throw) · PER_DAY · ลูกค้า = PosSale.memberId (ไม่มี → 0) · unitId = sale.unitId · idempotencyKey `sale:${saleId}:${cardId}` · เขียน PosSale.stampEventIds · ไม่เข้าเกณฑ์/ไม่มีสมาชิก → ข้าม ไม่ throw
//   autoStampFromVisit(ctx, { appointmentId }) → { events } — การ์ด PER_VISIT (serviceIds ว่าง = ทุกบริการ) · นัดต้อง status DONE + customerId · idempotencyKey `visit:${appointmentId}:${cardId}` · เขียน Appointment.stampEventId (ใบแรก)
//   expireDue(now?) → { expired, cards } ทุกร้าน: progress ที่ completedAt null + expiresAt ≤ now + stamps > 0 → StampEvent EXPIRE (count = stamps) · stamps 0 · startedAt = now · expiresAt = now + validMonths · cron.ts runDailyCron step stampExpire (summary คีย์ stampExpired)
//   merge hook (profile.ts#mergeMembers → facade stamp.mergeProgress(ctx, { keepId, mergeId })): ใบ active ของคนที่ถูกรวม → บวกเข้าใบ active ของคนที่เก็บ (StampEvent MERGE refType MERGE refId mergeId · ครบ = completeCycle ตามปกติ) · ไม่มีใบ → ย้าย customerId · หลังรวม คนที่ถูกรวมไม่มี progress เหลือ
//   consumer: outbox-consumers.ts `pos.sale.paid` → stamp.autoStampFromSale · `pos.sale.voided` → stamp.voidStampsForSale · booking/service.ts#setAppointmentStatus → DONE ยิง event `booking.completed` {appointmentId, tenantId, unitId, customerId} (3 ทะเบียน) → consumer stamp.autoStampFromVisit · event stamp.added/stamp.completed ลง 3 ทะเบียน + consumer (no-op/บันทึก MemberActivity)
//   UI: หน้า /member/stamps (ภาพ 17 ล่าง: ตาราง ชื่อ/คำอธิบาย · ช่อง · ใบที่ใช้อยู่ · ครบแล้ว · สถานะ toggle · ปุ่ม stamps-add) · /member/stamps/new + /member/stamps/[cardId] (ภาพ 17: ฟอร์มตั้งค่าการ์ด ชื่อ/จำนวนช่อง/ได้ตราเมื่อ(+เงื่อนไข)/สูงสุด ตรา/วัน/ใครประทับได้ 3 ช่อง/รางวัลเมื่อครบ/เริ่มใบใหม่/อายุใบ/จำกัดระดับ/สาขา · ตัวอย่างการ์ดจริง วงกลม = slots (✓ ที่ประทับแล้ว) · สถิติ 3 ตัว)
//   testid: stamps-page stamps-table stamps-add stamps-row-<id> stamps-editor stamps-editor-form stamps-preview stamps-stats stamps-save stamps-rule-kind stamps-reward-kind
//   actions: src/lib/modules/stamp/stamp-actions.ts "use server" · gate loyalty.manage (การ์ด) / loyalty.stamp (ประทับ) · nav.ts stamps → ready
//   facade stamp/index.ts export: listCards createCard updateCard toggleCard addStamp voidStampEvent voidStampsForSale progressFor cardStats autoStampFromSale autoStampFromVisit expireDue mergeProgress · service.ts ห้าม import @/lib/modules/(pos|booking|chat|kanban) (อ่าน prisma PosSale/Appointment ตรงได้พร้อมคอมเมนต์)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const migDir = existsSync("prisma/migrations") ? readdirSync("prisma/migrations").find((d) => /_member_v2_d$/.test(d)) : undefined;
if (!migDir || !existsSync("src/lib/modules/stamp/service.ts") || !existsSync("src/app/app/sys/[id]/member/stamps/page.tsx")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (migration member_v2_d · stamp/service.ts · member/stamps/page.tsx)");
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
const made = { cards: [] as string[], customers: [] as string[], appts: [] as string[], sales: [] as string[], ledgerKeys: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId; PT = scope.systems.POINT as string;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const ST = (await import("@/lib/modules/stamp" as string)) as Record<string, (...a: Any[]) => Any>;
  const PS = (await import("@/lib/modules/point" as string)) as Record<string, (...a: Any[]) => Any>;
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const { MEMBER_LIMITS } = (await import("@/lib/modules/member/limits" as string)) as Any;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId);
  const thana0 = await actorOf(E.users.staff.thana.userId);
  const thana = { ...thana0, permissions: { ...thana0.permissions, "member.loyalty.stamp": true } }; // พนักงานป่าตองที่ได้สิทธิ์ประทับ (seed ไม่ให้ — เติมใน actor)
  const noPerm = await actorOf(E.users.noPerm.userId);
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const outbox = (type: string, pred: (p: Any) => boolean) => P.outboxEvent.findMany({ where: { tenantId: tid, type }, orderBy: { createdAt: "desc" }, take: 40 }).then((rows: Any[]) => rows.find((r) => pred(r.payload)));
  const events = (progressId: string) => P.stampEvent.findMany({ where: { progressId }, orderBy: { createdAt: "asc" } });
  const prog = (cardId: string, customerId: string) => P.stampCardProgress.findMany({ where: { cardId, customerId }, orderBy: { cycle: "asc" } });
  const gold = await P.memberTierDef.findFirst({ where: { systemId: SYS, key: "gold" } });
  // seed: gold ทุกคนอยู่กะตะ (ป่าตอง 0) — ใช้ gold กะตะเป็นทั้งคนผ่าน (unit ตรง) และคนไม่ผ่าน (unit ผิด)
  const goldKata = (await prisma.customer.findFirst({ where: { memberSystemId: SYS, tierDefId: gold.id, homeUnitId: E.units.kata, status: "ACTIVE" as Any } }))!;
  const mk = async (input: Any) => { const c = await ST.createCard(ctx, owner, { slots: 5, ruleKind: "MANUAL", ruleConfig: {}, rewardKind: "POINTS", rewardConfig: { points: 50 }, autoRestart: true, tierDefIds: [], unitIds: [], ...input, name: `${input.name} ${tag}` }); made.cards.push(c.id); return c; };
  const key = (s: string) => `qc23-${tag}-${s}`;

  // ═══ S1 schema + การ์ด ═══
  const sc = await cols("StampCard"); const sp = await cols("StampCardProgress"); const se = await cols("StampEvent");
  const sql = read(`prisma/migrations/${migDir}/migration.sql`);
  const destructive = sql.split("\n").filter((l) => /^\s*(ALTER TABLE .*\b(DROP COLUMN|ALTER COLUMN [^;]*\bTYPE)|DROP TABLE|DROP TYPE)\b/i.test(l));
  const applied = await q<{ finished_at: Date | null }>(`select finished_at from "_prisma_migrations" where migration_name='${migDir}'`);
  const diff = spawnSync("pnpm", ["exec", "prisma", "migrate", "diff", "--from-config-datasource", "prisma.config.ts", "--to-schema", "prisma/schema", "--script"], { encoding: "utf8", env: process.env, timeout: 300_000 });
  const ruleKinds = await enumVals("StampRuleKind"); const evTypes = await enumVals("StampEventType"); const rwKinds = await enumVals("StampRewardKind");
  chk("M2.3-S1.1", "migration member_v2_d: StampCard {systemId name description slots ruleKind ruleConfig rewardKind rewardConfig autoRestart validMonths tierDefIds unitIds active sortOrder} index(systemId,active) · StampCardProgress {cardId customerId cycle stamps startedAt completedAt expiresAt rewardVoucherId} unique(cardId,customerId,cycle) · StampEvent {progressId type count refType refId byUserId unitId idempotencyKey} unique(tenantId,idempotencyKey) index(progressId,createdAt) · enum StampRuleKind 5 · StampEventType 5 · StampRewardKind 4 · additive · applied · migrate diff = empty",
    ["systemId", "name", "description", "slots", "ruleKind", "ruleConfig", "rewardKind", "rewardConfig", "autoRestart", "validMonths", "tierDefIds", "unitIds", "active", "sortOrder"].every((c) => sc.has(c)) && ["cardId", "customerId", "cycle", "stamps", "startedAt", "completedAt", "expiresAt", "rewardVoucherId"].every((c) => sp.has(c)) && ["progressId", "type", "count", "refType", "refId", "byUserId", "unitId", "idempotencyKey"].every((c) => se.has(c))
      && (await hasIdx("StampCard", ["systemId", "active"])) && (await hasIdx("StampCardProgress", ["cardId", "customerId", "cycle"], true)) && (await hasIdx("StampEvent", ["tenantId", "idempotencyKey"], true)) && (await hasIdx("StampEvent", ["progressId", "createdAt"]))
      && ["PER_SALE_MIN", "PER_ITEM", "PER_VISIT", "PER_DAY", "MANUAL"].every((v) => ruleKinds.includes(v)) && ["ADD", "USE", "EXPIRE", "VOID", "MERGE"].every((v) => evTypes.includes(v)) && ["VOUCHER", "REWARD", "POINTS", "DISCOUNT_NEXT"].every((v) => rwKinds.includes(v))
      && destructive.length === 0 && !!applied[0]?.finished_at && /empty migration/i.test(diff.stdout + diff.stderr),
    "ครบ", `card=${[...sc].length} prog=${[...sp].length} ev=${[...se].length} rule=${ruleKinds.length} evT=${evTypes.length} rw=${rwKinds.length} destructive=${destructive.length} applied=${!!applied[0]?.finished_at} diff=${/empty migration/i.test(diff.stdout + diff.stderr)}`);

  const eSlotsLo = await fails(() => ST.createCard(ctx, owner, { name: "x", slots: 2, ruleKind: "MANUAL", ruleConfig: {}, rewardKind: "POINTS", rewardConfig: { points: 10 } }));
  const eSlotsHi = await fails(() => ST.createCard(ctx, owner, { name: "x", slots: 31, ruleKind: "MANUAL", ruleConfig: {}, rewardKind: "POINTS", rewardConfig: { points: 10 } }));
  const eName = await fails(() => ST.createCard(ctx, owner, { name: "  ", slots: 5, ruleKind: "MANUAL", ruleConfig: {}, rewardKind: "POINTS", rewardConfig: { points: 10 } }));
  const eKind = await fails(() => ST.createCard(ctx, owner, { name: "x", slots: 5, ruleKind: "WEIRD", ruleConfig: {}, rewardKind: "POINTS", rewardConfig: { points: 10 } }));
  const ePerm = await fails(() => ST.createCard(ctx, thana, { name: "x", slots: 5, ruleKind: "MANUAL", ruleConfig: {}, rewardKind: "POINTS", rewardConfig: { points: 10 } }));
  const A = await mk({ name: "การ์ด A manual", slots: 5, ruleConfig: { perDayMax: 2 } });
  await ST.updateCard(ctx, owner, A.id, { description: "แก้แล้ว" });
  const list1 = await ST.listCards(ctx);
  const rowA = list1.find((c: Any) => c.id === A.id);
  await ST.toggleCard(ctx, owner, A.id, false);
  const offA = await P.stampCard.findUnique({ where: { id: A.id } });
  await ST.toggleCard(ctx, owner, A.id, true);
  const svcSrc = read("src/lib/modules/stamp/service.ts");
  chk("M2.3-S1.2", "createCard: slots 2/31 → throw ไทย · ชื่อว่าง → throw · ruleKind นอก enum → throw · thana (ไม่มี loyalty.manage) → throw · เพดานอ่าน MEMBER_LIMITS.stampCards (20) · updateCard description · listCards มีใบ + stats {active, completed, rewardsPaid} · toggleCard off → active false",
    thai(eSlotsLo) && thai(eSlotsHi) && thai(eName) && !!eKind && !!ePerm && MEMBER_LIMITS.stampCards === 20 && /stampCards/.test(svcSrc) && rowA?.description === "แก้แล้ว" && rowA?.stats && typeof rowA.stats.active === "number" && typeof rowA.stats.completed === "number" && typeof rowA.stats.rewardsPaid === "number" && offA?.active === false,
    "ตามสัญญา", `lo=${thai(eSlotsLo)} hi=${thai(eSlotsHi)} name=${thai(eName)} kind=${!!eKind} perm=${!!ePerm} limit=${/stampCards/.test(svcSrc)} desc=${rowA?.description} stats=${JSON.stringify(rowA?.stats)} off=${offA?.active}`);

  // ═══ S2 addStamp ═══
  const r1 = await ST.addStamp(ctx, owner, { cardId: A.id, customerId: m(1).id, refType: "MANUAL", idempotencyKey: key("a1") });
  const p1 = (await prog(A.id, m(1).id))[0];
  const ev1 = p1 ? await events(p1.id) : [];
  const ob1 = await outbox("stamp.added", (p) => p.customerId === m(1).id && p.cardId === A.id);
  chk("M2.3-S2.1", "MANUAL: addStamp สมาชิก 1 → {stamps 1, cycle 1, completed false, progressId, eventId} · progress cycle 1 stamps 1 startedAt · StampEvent ADD count 1 byUserId owner refType MANUAL · event stamp.added {customerId, cardId, stamps 1, cycle 1}",
    r1?.stamps === 1 && r1.cycle === 1 && r1.completed === false && !!r1.progressId && !!r1.eventId && p1?.stamps === 1 && p1.cycle === 1 && !!p1.startedAt && ev1.length === 1 && ev1[0].type === "ADD" && ev1[0].count === 1 && ev1[0].byUserId === owner.userId && ev1[0].refType === "MANUAL" && !!ob1 && ob1.payload.stamps === 1 && ob1.payload.cycle === 1,
    "1 ตรา + event", `r=${JSON.stringify(r1)} p=${p1?.stamps} ev=${ev1.length}/${ev1[0]?.type} ob=${!!ob1}`);

  const r2 = await ST.addStamp(ctx, owner, { cardId: A.id, customerId: m(1).id, refType: "MANUAL", idempotencyKey: key("a2") });
  const e3 = await fails(() => ST.addStamp(ctx, owner, { cardId: A.id, customerId: m(1).id, refType: "MANUAL", idempotencyKey: key("a3") }));
  const eBig = await fails(() => ST.addStamp(ctx, owner, { cardId: A.id, customerId: m(2).id, count: 3, refType: "MANUAL", idempotencyKey: key("b3") }));
  const p1b = (await prog(A.id, m(1).id))[0]; const p2 = await prog(A.id, m(2).id);
  chk("M2.3-S2.2", "perDayMax 2: ตราที่ 2 วันเดียวกันได้ (2) · ตราที่ 3 → throw ไทย (stamps คง 2 · ไม่มี event เพิ่ม) · count 3 ทีเดียว (สมาชิก 2 · วันนี้ 0) → throw ไม่ประทับบางส่วน (ไม่มี progress/stamps 0)",
    r2?.stamps === 2 && thai(e3) && p1b?.stamps === 2 && (await events(p1b.id)).length === 2 && thai(eBig) && (p2.length === 0 || p2[0].stamps === 0),
    "2 แล้วหยุด", `r2=${r2?.stamps} e3=${e3?.message?.slice(0, 50)} p=${p1b?.stamps} big=${eBig?.message?.slice(0, 50)} p2=${p2[0]?.stamps ?? "none"}`);

  const r2again = await ST.addStamp(ctx, owner, { cardId: A.id, customerId: m(1).id, refType: "MANUAL", idempotencyKey: key("a2") });
  const evAfter = await events(p1b.id);
  chk("M2.3-S2.3", "idempotencyKey เดิม (a2) ยิงซ้ำ → คืนผลเดิม {stamps 2, eventId เดิม} · ไม่สร้าง StampEvent ใหม่ (ยัง 2) · stamps ยัง 2",
    r2again?.stamps === 2 && r2again.eventId === r2?.eventId && evAfter.length === 2 && (await prog(A.id, m(1).id))[0].stamps === 2,
    "ผลเดิม", `again=${JSON.stringify(r2again)} ev=${evAfter.length}`);

  const B = await mk({ name: "การ์ด B gold กะตะ", slots: 5, ruleConfig: { perDayMax: 5 }, tierDefIds: [gold.id], unitIds: [E.units.kata] });
  const eTier = await fails(() => ST.addStamp(ctx, owner, { cardId: B.id, customerId: m(1).id, unitId: E.units.patong, idempotencyKey: key("t1") }));
  const rGold = await ST.addStamp(ctx, owner, { cardId: B.id, customerId: goldKata.id, unitId: E.units.kata, idempotencyKey: key("t2") });
  const eUnit = await fails(() => ST.addStamp(ctx, owner, { cardId: B.id, customerId: goldKata.id, unitId: E.units.patong, idempotencyKey: key("t3") }));
  const pf1 = await ST.progressFor(ctx, m(1).id);
  chk("M2.3-S2.4", "tier/unit: การ์ด B tierDefIds [gold] unitIds [ป่าตอง] — สมาชิก 1 (ระดับ member) → throw ไทย · gold ป่าตอง → 1 · gold + unitId กะตะ → throw ไทย · progressFor(สมาชิก 1) ไม่แสดงการ์ด B (ไม่เข้าเกณฑ์) แต่แสดง A stamps 2 slots 5 cycle 1",
    thai(eTier) && rGold?.stamps === 1 && thai(eUnit) && Array.isArray(pf1) && !pf1.some((x: Any) => x.cardId === B.id) && pf1.some((x: Any) => x.cardId === A.id && x.stamps === 2 && x.slots === 5 && x.cycle === 1),
    "กรองตามเกณฑ์", `tier=${eTier?.message?.slice(0, 40)} gold=${rGold?.stamps} unit=${eUnit?.message?.slice(0, 40)} pf=${JSON.stringify(pf1?.map((x: Any) => [x.cardId === A.id ? "A" : x.cardId === B.id ? "B" : "?", x.stamps]))}`);

  const Cpin = await mk({ name: "การ์ด C PIN", slots: 5, ruleConfig: { perDayMax: 5, allowStaffScan: false, staffPin: "1234" } });
  const eScan = await fails(() => ST.addStamp(ctx, owner, { cardId: Cpin.id, customerId: m(3).id, idempotencyKey: key("c1") }));
  const cust3 = { role: "CUSTOMER", customerId: m(3).id, userId: null, unitAccess: [], permissions: {} };
  const ePinWrong = await fails(() => ST.addStamp(ctx, cust3, { cardId: Cpin.id, customerId: m(3).id, byPin: "0000", idempotencyKey: key("c2") }));
  const ePinNone = await fails(() => ST.addStamp(ctx, cust3, { cardId: Cpin.id, customerId: m(3).id, idempotencyKey: key("c3") }));
  const rPin = await ST.addStamp(ctx, cust3, { cardId: Cpin.id, customerId: m(3).id, byPin: "1234", idempotencyKey: key("c4") });
  const eOther = await fails(() => ST.addStamp(ctx, cust3, { cardId: Cpin.id, customerId: m(4).id, byPin: "1234", idempotencyKey: key("c5") }));
  const ePinCardA = await fails(() => ST.addStamp(ctx, cust3, { cardId: A.id, customerId: m(3).id, byPin: "1234", idempotencyKey: key("c6") }));
  chk("M2.3-S2.5", "ใครประทับได้: allowStaffScan false → owner ประทับ → throw ไทย · ลูกค้า (CUSTOMER) ใส่ PIN ผิด → throw · ไม่ใส่ PIN → throw · PIN ถูก → 1 ตรา (byUserId null · refType QR/PIN) · ลูกค้าประทับให้คนอื่น → throw · การ์ด A ไม่ตั้ง PIN + ลูกค้า → throw",
    thai(eScan) && thai(ePinWrong) && thai(ePinNone) && rPin?.stamps === 1 && !!eOther && !!ePinCardA,
    "PIN เท่านั้น", `scan=${thai(eScan)} wrong=${thai(ePinWrong)} none=${thai(ePinNone)} ok=${rPin?.stamps} other=${!!eOther} cardA=${!!ePinCardA}`);

  const D = await mk({ name: "การ์ด D PER_DAY", slots: 5, ruleKind: "PER_DAY", ruleConfig: { perDayMax: 5 } });
  const rd1 = await ST.addStamp(ctx, owner, { cardId: D.id, customerId: m(5).id, idempotencyKey: key("d1") });
  const eD2 = await fails(() => ST.addStamp(ctx, owner, { cardId: D.id, customerId: m(5).id, idempotencyKey: key("d2") }));
  const eD3 = await fails(() => ST.addStamp(ctx, owner, { cardId: D.id, customerId: m(6).id, count: 2, idempotencyKey: key("d3") }));
  chk("M2.3-S2.6", "PER_DAY: ตราแรกของวันได้ (1) · ตราที่ 2 วันไทยเดียวกัน → throw ไทย แม้ perDayMax 5 · count 2 ทีเดียว → throw",
    rd1?.stamps === 1 && thai(eD2) && thai(eD3), "1 ตรา/วัน", `d1=${rd1?.stamps} d2=${eD2?.message?.slice(0, 40)} d3=${eD3?.message?.slice(0, 40)}`);

  const rTh = await ST.addStamp(ctx, thana, { cardId: A.id, customerId: m(3).id, refType: "QR", idempotencyKey: key("th1") });
  const eThKata = await fails(() => ST.addStamp(ctx, thana, { cardId: A.id, customerId: m(45).id, refType: "QR", idempotencyKey: key("th2") }));
  const eNoPerm = await fails(() => ST.addStamp(ctx, noPerm, { cardId: A.id, customerId: m(3).id, idempotencyKey: key("np1") }));
  const eGhost = await fails(() => ST.addStamp(ctx, owner, { cardId: A.id, customerId: "no-such-customer", idempotencyKey: key("g1") }));
  await ST.toggleCard(ctx, owner, D.id, false);
  const eInactive = await fails(() => ST.addStamp(ctx, owner, { cardId: D.id, customerId: m(7).id, idempotencyKey: key("in1") }));
  chk("M2.3-S2.7", "สิทธิ์/ขอบเขต: thana (STAFF ป่าตอง + loyalty.stamp) ประทับสมาชิก 3 (ป่าตอง) ได้ · สมาชิก 45 (กะตะ) → throw ไทย (ไม่พบ · 404-not-403) · noPerm → throw · customerId ไม่มี → throw ไทย · การ์ดปิดใช้งาน → throw ไทย",
    rTh?.stamps === 1 && thai(eThKata) && !!eNoPerm && thai(eGhost) && thai(eInactive),
    "ตามสิทธิ์", `th=${rTh?.stamps} kata=${eThKata?.message?.slice(0, 40)} np=${!!eNoPerm} ghost=${eGhost?.message?.slice(0, 40)} inactive=${eInactive?.message?.slice(0, 40)}`);

  // ═══ S3 ครบ → รางวัล · restart ═══
  const Ecard = await mk({ name: "การ์ด E ครบ 3 ได้แต้ม", slots: 3, ruleConfig: { perDayMax: 10 }, rewardKind: "POINTS", rewardConfig: { points: 50 }, autoRestart: true });
  const bal0 = await PS.getBalance(PT, m(8).id);
  const rc = await ST.addStamp(ctx, owner, { cardId: Ecard.id, customerId: m(8).id, count: 3, idempotencyKey: key("e1") });
  made.ledgerKeys.push(`stamp:${rc?.progressId}`);
  const pe = await prog(Ecard.id, m(8).id);
  const evE = pe[0] ? await events(pe[0].id) : [];
  const bal1 = await PS.getBalance(PT, m(8).id);
  const led = await prisma.pointLedger.findFirst({ where: { customerId: m(8).id, refType: "STAMP" as Any, refId: pe[0]?.id } });
  const obC = await outbox("stamp.completed", (p) => p.customerId === m(8).id && p.cardId === Ecard.id);
  chk("M2.3-S3.1", "ครบ: การ์ด E slots 3 POINTS 50 autoRestart — addStamp count 3 สมาชิก 8 → {completed true, cycle 1, rewardKind POINTS} · progress cycle 1 completedAt + StampEvent ADD 3 + USE 3 · progress cycle 2 stamps 0 · แต้ม +50 (ledger EARN refType STAMP refId progressId) · event stamp.completed {customerId, cardId, stamps 3, cycle 1, rewardKind POINTS}",
    rc?.completed === true && rc.cycle === 1 && rc.rewardKind === "POINTS" && pe.length === 2 && !!pe[0].completedAt && pe[1].cycle === 2 && pe[1].stamps === 0 && evE.some((e: Any) => e.type === "USE" && e.count === 3) && evE.some((e: Any) => e.type === "ADD" && e.count === 3) && bal1 - bal0 === 50 && !!led && obC?.payload?.stamps === 3 && obC.payload.cycle === 1 && obC.payload.rewardKind === "POINTS",
    "ครบ + 50 แต้ม + cycle 2", `rc=${JSON.stringify(rc)} pe=${pe.map((p: Any) => `${p.cycle}:${p.stamps}:${!!p.completedAt}`).join(",")} ev=${evE.map((e: Any) => e.type).join(",")} bal=${bal1 - bal0} led=${!!led} ob=${JSON.stringify(obC?.payload)}`);

  await ST.addStamp(ctx, owner, { cardId: Ecard.id, customerId: m(8).id, count: 2, idempotencyKey: key("e2") });
  const rc2 = await ST.addStamp(ctx, owner, { cardId: Ecard.id, customerId: m(8).id, count: 2, idempotencyKey: key("e3") });
  made.ledgerKeys.push(`stamp:${rc2?.progressId}`);
  const pe2 = await prog(Ecard.id, m(8).id);
  const bal2 = await PS.getBalance(PT, m(8).id);
  chk("M2.3-S3.2", "ส่วนเกิน: cycle 2 ประทับ 2 แล้ว 2 → ครบ (3) เหลือ 1 → cycle 3 stamps 1 · แต้มอีก +50 (รวม +100) · progressFor แสดง cycle 3 stamps 1 completedCycles 2",
    rc2?.completed === true && rc2.cycle === 2 && pe2.length === 3 && pe2[2].cycle === 3 && pe2[2].stamps === 1 && bal2 - bal0 === 100 && (await ST.progressFor(ctx, m(8).id)).some((x: Any) => x.cardId === Ecard.id && x.cycle === 3 && x.stamps === 1 && x.completedCycles === 2),
    "cycle 3 stamps 1", `rc2=${JSON.stringify(rc2)} pe=${pe2.map((p: Any) => `${p.cycle}:${p.stamps}`).join(",")} bal=${bal2 - bal0}`);

  const F = await mk({ name: "การ์ด F voucher ไม่ restart", slots: 3, ruleConfig: { perDayMax: 10 }, rewardKind: "VOUCHER", rewardConfig: { templateId: null, note: "ดำน้ำฟรี 1 ไดฟ์" }, autoRestart: false });
  const rf = await ST.addStamp(ctx, owner, { cardId: F.id, customerId: m(9).id, count: 3, idempotencyKey: key("f1") });
  const pf = await prog(F.id, m(9).id);
  const eFull = await fails(() => ST.addStamp(ctx, owner, { cardId: F.id, customerId: m(9).id, idempotencyKey: key("f2") }));
  const obF = await outbox("stamp.completed", (p) => p.customerId === m(9).id && p.cardId === F.id);
  const G2 = await mk({ name: "การ์ด G reward stub", slots: 3, ruleConfig: { perDayMax: 10 }, rewardKind: "REWARD", rewardConfig: { rewardId: null }, autoRestart: true });
  const H2 = await mk({ name: "การ์ด H ส่วนลดครั้งหน้า", slots: 3, ruleConfig: { perDayMax: 10 }, rewardKind: "DISCOUNT_NEXT", rewardConfig: { pct: 10 }, autoRestart: true });
  const rg = await ST.addStamp(ctx, owner, { cardId: G2.id, customerId: m(10).id, count: 3, idempotencyKey: key("g2") });
  const rh = await ST.addStamp(ctx, owner, { cardId: H2.id, customerId: m(10).id, count: 3, idempotencyKey: key("h2") });
  const obG = await outbox("stamp.completed", (p) => p.customerId === m(10).id && p.cardId === G2.id);
  const stF = await ST.cardStats(ctx, F.id); const stE = await ST.cardStats(ctx, Ecard.id);
  chk("M2.3-S3.3", "VOUCHER stub (autoRestart false): ครบ → completedAt · rewardVoucherId null · event payload rewardKind VOUCHER + rewardConfig · ไม่มี cycle 2 · ประทับต่อ → throw ไทย 'ครบแล้ว' · REWARD/DISCOUNT_NEXT stub ครบได้ไม่ throw (payload rewardKind) · cardStats F {active 0, completed 1} · E {active 1, completed 2, rewardsPaid 2}",
    rf?.completed === true && rf.rewardVoucherId === null && pf.length === 1 && !!pf[0].completedAt && thai(eFull) && obF?.payload?.rewardKind === "VOUCHER" && obF.payload.rewardConfig?.note === "ดำน้ำฟรี 1 ไดฟ์" && rg?.completed === true && rh?.completed === true && obG?.payload?.rewardKind === "REWARD" && stF?.active === 0 && stF.completed === 1 && stE?.active === 1 && stE.completed === 2 && stE.rewardsPaid === 2,
    "stub + หยุด", `rf=${JSON.stringify(rf)} pf=${pf.length} full=${eFull?.message?.slice(0, 40)} obF=${JSON.stringify(obF?.payload)} rg=${rg?.completed} rh=${rh?.completed} stF=${JSON.stringify(stF)} stE=${JSON.stringify(stE)}`);

  // ═══ S4 void / expire / merge ═══
  const pA1 = (await prog(A.id, m(1).id))[0];
  const evA = await events(pA1.id);
  const firstAdd = evA.find((e: Any) => e.type === "ADD");
  const eVoidPerm = await fails(() => ST.voidStampEvent(ctx, thana, { eventId: firstAdd.id }));
  const rv = await ST.voidStampEvent(ctx, owner, { eventId: firstAdd.id });
  const pA2 = (await prog(A.id, m(1).id))[0];
  const evA2 = await events(pA1.id);
  const eVoidAgain = await fails(() => ST.voidStampEvent(ctx, owner, { eventId: firstAdd.id }));
  const useE = (await events(pe[0].id)).find((e: Any) => e.type === "ADD");
  const eVoidDone = await fails(() => ST.voidStampEvent(ctx, owner, { eventId: useE.id }));
  chk("M2.3-S4.1", "void: thana (ไม่มี loyalty.manage) → throw · owner void ADD แรกของสมาชิก 1 → StampEvent VOID (count 1 · refId = event เดิม) · stamps 2 → 1 · void ซ้ำ → throw ไทย · void ตราของใบที่ครบแล้ว → throw ไทย",
    !!eVoidPerm && rv && pA2?.stamps === 1 && evA2.some((e: Any) => e.type === "VOID" && e.count === 1 && e.refId === firstAdd.id) && thai(eVoidAgain) && thai(eVoidDone),
    "VOID 1", `perm=${!!eVoidPerm} stamps=${pA2?.stamps} void=${evA2.filter((e: Any) => e.type === "VOID").length} again=${eVoidAgain?.message?.slice(0, 40)} done=${eVoidDone?.message?.slice(0, 40)}`);

  const G = await mk({ name: "การ์ด G อายุ 1 เดือน", slots: 5, ruleConfig: { perDayMax: 5 }, validMonths: 1 });
  await ST.addStamp(ctx, owner, { cardId: G.id, customerId: m(11).id, count: 2, idempotencyKey: key("x1") });
  await ST.addStamp(ctx, owner, { cardId: G.id, customerId: m(12).id, count: 1, idempotencyKey: key("x2") });
  const pg11 = (await prog(G.id, m(11).id))[0];
  const exp0 = pg11?.expiresAt ? new Date(pg11.expiresAt).getTime() - new Date(pg11.startedAt).getTime() : 0;
  await P.stampCardProgress.update({ where: { id: pg11.id }, data: { expiresAt: new Date(Date.now() - 86_400_000) } });
  const ex = await ST.expireDue();
  const pg11b = await P.stampCardProgress.findUnique({ where: { id: pg11.id } });
  const pg12 = (await prog(G.id, m(12).id))[0];
  const evG = await events(pg11.id);
  const cron = read("src/lib/platform/cron.ts");
  chk("M2.3-S4.2", "expire: validMonths 1 → expiresAt ≈ startedAt+1 เดือน (28–31 วัน) · ตั้ง expiresAt ย้อนหลัง → expireDue() → {expired ≥ 1} · StampEvent EXPIRE count 2 · stamps 0 · startedAt ใหม่ · expiresAt อนาคต · ใบสมาชิก 12 ไม่แตะ (1) · cron.ts step stampExpire + summary stampExpired",
    exp0 >= 27 * 86_400_000 && exp0 <= 32 * 86_400_000 && typeof ex?.expired === "number" && ex.expired >= 1 && evG.some((e: Any) => e.type === "EXPIRE" && e.count === 2) && pg11b?.stamps === 0 && new Date(pg11b.startedAt).getTime() > Date.now() - 600_000 && new Date(pg11b.expiresAt).getTime() > Date.now() && pg12?.stamps === 1 && /stampExpire/.test(cron) && /stampExpired/.test(cron),
    "หมดอายุ → เริ่มใหม่", `span=${Math.round(exp0 / 86_400_000)}d ex=${JSON.stringify(ex)} ev=${evG.map((e: Any) => e.type).join(",")} stamps=${pg11b?.stamps} exp=${pg11b?.expiresAt} m12=${pg12?.stamps} cron=${/stampExpire/.test(cron)}`);

  const mkCust = async (nm: string) => { const c = await PR.createMember(ctx as Any, owner, { phone: `0893${String((Date.now() + Math.floor(Math.random() * 1000)) % 1_000_000).padStart(6, "0")}`, firstName: nm, lastName: "สแตมป์", source: "WALK_IN", homeUnitId: E.units.patong }); made.customers.push(c.customerId); return c.customerId as string; };
  const X = await mkCust("เก็บ"); const Y = await mkCust("ถูกรวม");
  await ST.addStamp(ctx, owner, { cardId: A.id, customerId: X, count: 1, idempotencyKey: key("mx") });
  await ST.addStamp(ctx, owner, { cardId: A.id, customerId: Y, count: 2, idempotencyKey: key("my") });
  await ST.addStamp(ctx, owner, { cardId: B.id, customerId: Y, count: 1, idempotencyKey: key("my2"), unitId: E.units.patong }).catch(() => null); // Y ไม่ใช่ gold → ไม่ได้ (ตามเกณฑ์)
  await ST.addStamp(ctx, owner, { cardId: Cpin.id, customerId: Y, count: 1, idempotencyKey: key("my3"), byPin: "1234" }).catch(() => null);
  const mg = await PR.mergeMembers(ctx as Any, owner, { keepId: X, mergeId: Y, fieldChoices: {}, confirm: "MERGE" });
  const pX = await prog(A.id, X); const pY = await P.stampCardProgress.findMany({ where: { customerId: Y } });
  const evX = pX[0] ? await events(pX[0].id) : [];
  chk("M2.3-S4.3", "merge hook: X (A:1) + Y (A:2) → mergeMembers(keep X) → X ใบ A stamps 3 · StampEvent MERGE count 2 refType MERGE refId Y · Y ไม่มี progress เหลือ · ผลรวมตราไม่หาย",
    !!mg && pX[0]?.stamps === 3 && evX.some((e: Any) => e.type === "MERGE" && e.count === 2 && e.refId === Y) && pY.length === 0,
    "3 ตราที่ X", `mg=${!!mg} x=${pX[0]?.stamps} merge=${evX.filter((e: Any) => e.type === "MERGE").length} y=${pY.length}`);

  // ═══ S5 auto จากบิล/นัด ═══
  const Hs = await mk({ name: "การ์ด H บิล ≥ ฿1,000", slots: 10, ruleKind: "PER_SALE_MIN", ruleConfig: { minSatang: 100_000, perDayMax: 3, allowAutoFromSale: true } });
  const Hoff = await mk({ name: "การ์ด H2 ปิด auto", slots: 10, ruleKind: "PER_SALE_MIN", ruleConfig: { minSatang: 1, perDayMax: 3, allowAutoFromSale: false } });
  const saleSmall = await prisma.posSale.findFirst({ where: { tenantId: tid, memberId: m(6).id, status: "PAID" as Any }, orderBy: { createdAt: "asc" } });
  const saleBig = await prisma.posSale.findFirst({ where: { tenantId: tid, memberId: m(20).id, status: "PAID" as Any }, orderBy: { createdAt: "asc" } });
  const as1 = await ST.autoStampFromSale(ctx, { saleId: saleSmall!.id });
  const as2 = await ST.autoStampFromSale(ctx, { saleId: saleBig!.id });
  const as2b = await ST.autoStampFromSale(ctx, { saleId: saleBig!.id });
  const saleBig2 = await prisma.posSale.findUnique({ where: { id: saleBig!.id } }) as Any;
  const pH20 = (await prog(Hs.id, m(20).id))[0];
  const evH = pH20 ? await events(pH20.id) : [];
  const consumers = read("src/lib/outbox-consumers.ts");
  chk("M2.3-S5.1", "autoStampFromSale: บิลสมาชิก 6 (฿600 < ฿1,000) → events 0 · บิลสมาชิก 20 (฿2,000) → 1 ตรา (refType SALE refId saleId · unitId = บิล · idempotencyKey sale:<id>:<card>) · PosSale.stampEventIds มี id · ยิงซ้ำ → 0 ใหม่ (ยัง 1 event) · การ์ดปิด auto ไม่ได้ตรา · consumer pos.sale.paid → autoStampFromSale · pos.sale.voided → voidStampsForSale",
    as1?.events?.length === 0 && as2?.events?.length === 1 && as2.events[0].cardId === Hs.id && evH.length === 1 && evH[0].refType === "SALE" && evH[0].refId === saleBig!.id && evH[0].unitId === saleBig!.unitId && evH[0].idempotencyKey === `sale:${saleBig!.id}:${Hs.id}` && (saleBig2.stampEventIds as string[]).includes(evH[0].id) && as2b?.events?.length === 0 && (await prog(Hoff.id, m(20).id)).length === 0 && /autoStampFromSale/.test(consumers) && /voidStampsForSale/.test(consumers),
    "1 ตราจากบิลใหญ่", `small=${as1?.events?.length} big=${JSON.stringify(as2)} ev=${evH.length}/${evH[0]?.refType}/${evH[0]?.idempotencyKey} ids=${JSON.stringify(saleBig2?.stampEventIds)} again=${as2b?.events?.length} off=${(await prog(Hoff.id, m(20).id)).length} consumer=${/autoStampFromSale/.test(consumers)}/${/voidStampsForSale/.test(consumers)}`);

  const pos = (await import("@/lib/modules/pos/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const svcPatong = await prisma.bookingService.findFirst({ where: { tenantId: tid, unitId: E.units.patong } });
  const I = await mk({ name: "การ์ด I ต่อชิ้น", slots: 10, ruleKind: "PER_ITEM", ruleConfig: { serviceIds: [svcPatong!.id], perDayMax: 2, allowAutoFromSale: true } });
  const sale = (await prisma.$transaction((tx) => pos.createSale({ tenantId: tid, unitId: E.units.patong, systemId: scope.systems.POS, pointSystemId: PT, memberId: m(21).id, idempotencyKey: key("sale-i"), lines: [{ name: "ทริปดำน้ำครึ่งวัน", qty: 3, unitPriceSatang: 250_000, serviceId: svcPatong!.id }, { name: "ของที่ระลึก", qty: 1, unitPriceSatang: 10_000 }], payMethods: [{ type: "CASH", amountSatang: 760_000 }] }, tx))) as Any;
  made.sales.push(sale.saleId);
  const asI = await ST.autoStampFromSale(ctx, { saleId: sale.saleId });
  const pI = (await prog(I.id, m(21).id))[0];
  const pHs21 = (await prog(Hs.id, m(21).id))[0];
  const vs = await ST.voidStampsForSale(ctx, { saleId: sale.saleId });
  const vs2 = await ST.voidStampsForSale(ctx, { saleId: sale.saleId });
  const pI2 = (await prog(I.id, m(21).id))[0]; const pHs21b = (await prog(Hs.id, m(21).id))[0];
  const evI = pI ? await events(pI.id) : [];
  chk("M2.3-S5.2", "PER_ITEM: บิลใหม่สมาชิก 21 (บริการป่าตอง qty 3 + ของอื่น 1) → การ์ด I ได้ 2 ตรา (qty 3 แต่ perDayMax 2 → ตัดที่ 2 ไม่ throw) · การ์ด H (≥ ฿1,000) ได้ 1 ด้วย (บิลเดียวหลายใบ) · voidStampsForSale → VOID ทั้ง 2 ใบ (I 0 · H 0) · ซ้ำ → voided 0",
    asI?.events?.length === 2 && pI?.stamps === 2 && pHs21?.stamps === 1 && typeof vs?.voided === "number" && vs.voided >= 2 && pI2?.stamps === 0 && pHs21b?.stamps === 0 && vs2?.voided === 0 && evI.some((e: Any) => e.type === "VOID"),
    "2+1 แล้ว void หมด", `asI=${JSON.stringify(asI)} I=${pI?.stamps} H=${pHs21?.stamps} vs=${JSON.stringify(vs)} after=${pI2?.stamps}/${pHs21b?.stamps} vs2=${JSON.stringify(vs2)}`);

  const J = await mk({ name: "การ์ด J มาตามนัด", slots: 10, ruleKind: "PER_VISIT", ruleConfig: { serviceIds: [], perDayMax: 1 } });
  const doneAppt = await prisma.appointment.findFirst({ where: { tenantId: tid, status: "DONE" as Any, customerId: { not: null } }, orderBy: { startAt: "asc" } });
  const futureAppt = await prisma.appointment.findFirst({ where: { tenantId: tid, status: "CONFIRMED" as Any, customerId: { not: null } } });
  const av1 = await ST.autoStampFromVisit(ctx, { appointmentId: doneAppt!.id });
  const av1b = await ST.autoStampFromVisit(ctx, { appointmentId: doneAppt!.id });
  const av2 = await ST.autoStampFromVisit(ctx, { appointmentId: futureAppt!.id });
  const doneAppt2 = await prisma.appointment.findUnique({ where: { id: doneAppt!.id } }) as Any;
  const pJ = (await prog(J.id, doneAppt!.customerId!))[0];
  // dynamic: นัดใหม่ของลูกค้า X → DONE → event booking.completed → consumer → ตรา
  const booking = (await import("@/lib/modules/booking/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const staffP = await prisma.bookingStaff.findFirst({ where: { tenantId: tid, unitId: E.units.patong } });
  const xc = await prisma.customer.findUnique({ where: { id: X } });
  const d = new Date(Date.now() + 7 * 3600_000 + 3 * 86_400_000);
  const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const ap = await booking.createAppointment({ tenantId: tid, unitId: E.units.patong, serviceId: svcPatong!.id, staffId: staffP!.id, dateStr, startMin: 600, customerName: "เก็บ สแตมป์", customerPhone: xc!.phone, source: "STAFF", idempotencyKey: key("appt") });
  if (ap?.id) made.appts.push(ap.id);
  await booking.setAppointmentStatus(tid, E.units.patong, ap.id, "DONE");
  const obB = await outbox("booking.completed", (p) => p.appointmentId === ap.id);
  const { drainOutbox } = await import("@/lib/core/outbox");
  const { consumers: CONS } = (await import("@/lib/outbox-consumers" as string)) as Any;
  await drainOutbox(CONS, { limit: 200 });
  const pJX = (await prog(J.id, X))[0];
  const A2 = (await import("@/lib/automation/labels" as string)) as Any; const W2 = (await import("@/lib/webhooks/labels" as string)) as Any;
  const in3 = (e: string) => new RegExp(`"${e.replace(/\./g, "\\.")}":`).test(consumers) && A2.AUTOMATION_EVENTS.some((x: Any) => x.value === e && /[ก-๙]/.test(x.label)) && W2.WEBHOOK_EVENTS.filter((x: Any) => x.value === e).length === 1;
  chk("M2.3-S5.3", "PER_VISIT: นัด DONE จาก seed → 1 ตรา (refType VISIT · Appointment.stampEventId) · ซ้ำ → 0 · นัด CONFIRMED → 0 · setAppointmentStatus(DONE) ยิง event booking.completed {appointmentId, customerId} → drainOutbox → consumer ประทับให้ลูกค้า X (1) · booking.completed ลง 3 ทะเบียน",
    av1?.events?.length === 1 && av1b?.events?.length === 0 && av2?.events?.length === 0 && pJ?.stamps === 1 && doneAppt2?.stampEventId === av1.events[0].eventId && !!obB && obB.payload.customerId === X && pJX?.stamps === 1 && in3("booking.completed"),
    "ตราจากนัด + consumer", `av1=${JSON.stringify(av1)} again=${av1b?.events?.length} future=${av2?.events?.length} pJ=${pJ?.stamps} apptEv=${doneAppt2?.stampEventId === av1?.events?.[0]?.eventId} ob=${!!obB} pJX=${pJX?.stamps} reg=${in3("booking.completed")}`);

  // ═══ S6 UI / facade / events ═══
  const pages = { list: read("src/app/app/sys/[id]/member/stamps/page.tsx"), editor: read("src/app/app/sys/[id]/member/stamps/[cardId]/page.tsx"), neu: read("src/app/app/sys/[id]/member/stamps/new/page.tsx") };
  const act = read("src/lib/modules/stamp/stamp-actions.ts");
  const facade = read("src/lib/modules/stamp/index.ts");
  const nav = read("src/lib/modules/member/nav.ts");
  const compDir = "src/components/member";
  const comps = existsSync(compDir) ? readdirSync(compDir).filter((f) => /stamp/i.test(f)).map((f) => read(`${compDir}/${f}`)).join("\n") : "";
  const all = Object.values(pages).join("\n") + comps;
  const TIDS = ["stamps-page", "stamps-table", "stamps-add", "stamps-row-", "stamps-editor", "stamps-editor-form", "stamps-preview", "stamps-stats", "stamps-save", "stamps-rule-kind", "stamps-reward-kind"];
  const missingT = TIDS.filter((t) => !all.includes(t));
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(all.replace(/\/\/.*$/gm, ""));
  const hex = /#[0-9a-fA-F]{6}\b/.test(all.replace(/\/\/.*$/gm, ""));
  const FAC = ["listCards", "createCard", "updateCard", "toggleCard", "addStamp", "voidStampEvent", "voidStampsForSale", "progressFor", "cardStats", "autoStampFromSale", "autoStampFromVisit", "expireDue", "mergeProgress"];
  const missingF = FAC.filter((f) => !new RegExp(`\\b${f}\\b`).test(facade));
  chk("M2.3-S6.1", "หน้า stamps + stamps/[cardId] (+new) requireTenant + สิทธิ์ (list = loyalty.read/read-โดยนัย · editor = loyalty.manage) · actions 'use server' gate loyalty.manage/stamp · testid 11 · nav stamps → ready · ไม่มีอีโมจิ/hex · facade export 13 · service.ts ไม่ import pos/booking/chat/kanban ตรง · ไม่มี any",
    pages.list.length > 0 && pages.editor.length > 0 && /requireTenant/.test(pages.list) && /requireTenant/.test(pages.editor) && /loyalty\.manage/.test(pages.editor + act) && /["']use server["']/.test(act) && /loyalty\.(manage|stamp)/.test(act) && missingT.length === 0 && /key:\s*"stamps"[^\n]*status:\s*"ready"/.test(nav) && !emoji && !hex && missingF.length === 0 && !/@\/lib\/modules\/(pos|booking|chat|kanban)\b/.test(svcSrc) && !/:\s*any\b/.test(svcSrc + act),
    "ครบ", `pages=${!!pages.list}/${!!pages.editor} tid-missing=${missingT.join(",") || "-"} nav=${/key:\s*"stamps"[^\n]*status:\s*"ready"/.test(nav)} emoji=${emoji} hex=${hex} facade-missing=${missingF.join(",") || "-"} import=${/@\/lib\/modules\/(pos|booking|chat|kanban)\b/.test(svcSrc)} any=${/:\s*any\b/.test(svcSrc + act)}`);

  const LABELS = ["จำนวนช่อง", "ได้ตราเมื่อ", "ตรา/วัน", "ใครประทับได้", "พนักงานสแกน QR ลูกค้า", "อัตโนมัติจากบิล", "PIN พนักงาน", "รางวัลเมื่อครบ", "เริ่มใบใหม่", "อายุใบ", "จำกัดระดับ", "สาขา", "ตัวอย่างการ์ดจริง", "ใบที่ใช้อยู่", "ครบแล้ว", "รางวัลที่จ่าย", "สแตมป์การ์ดทั้งหมด"];
  const missingL = LABELS.filter((l) => !all.includes(l));
  const RULE_TH = ["จองที่มาจริง", "ต่อชิ้น", "ยอดบิล", "ต่อวัน", "ประทับเอง"].filter((l) => !all.includes(l));
  chk("M2.3-S6.2", "editor (ภาพ 17): ป้ายฟอร์มครบ (จำนวนช่อง 3–30 · ได้ตราเมื่อ + เงื่อนไข · สูงสุด ตรา/วัน · ใครประทับได้ 3 ช่อง · รางวัลเมื่อครบ · เริ่มใบใหม่ · อายุใบ เดือน · จำกัดระดับ · สาขา) · ตัวอย่างการ์ดจริง (วงกลม = slots · ✓ ที่ประทับแล้ว · 'n/slots ประทับแล้ว') · สถิติ 3 · ตาราง 'สแตมป์การ์ดทั้งหมด' (ช่อง/ใบที่ใช้อยู่/ครบแล้ว/สถานะ toggle) · ป้ายกฎ 5 ชนิดเป็นไทย · ป้ายจาก registry ไม่ฮาร์ดโค้ดใน JSX ซ้ำ",
    missingL.length === 0 && RULE_TH.length <= 1 && /ประทับแล้ว/.test(all) && /slots/.test(all),
    "ครบ", `missing=${missingL.join(",") || "-"} rule-missing=${RULE_TH.join(",") || "-"}`, "MAJOR");

  const dir = `${mq.MQC.shotsDir}/2.3`;
  const sum = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sum(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  const ok = (u: string, n: string, d: string) => r(u, n, d)?.status === 200 && r(u, n, d)?.missing?.length === 0 && r(u, n, d)?.errors?.length === 0 && !r(u, n, d)?.overflow;
  chk("M2.3-S6.3", "ภาพ 17: stamps-owner desktop+mobile 200 ไม่ล้น · stamps-editor-owner desktop 200 · stamps-new-owner 200 · thana (read-โดยนัย) 200 อ่านอย่างเดียว (ไม่มี stamps-add) · noperm 404",
    ok("owner", "stamps-owner", "desktop") && ok("owner", "stamps-owner", "mobile") && ok("owner", "stamps-editor-owner", "desktop") && ok("owner", "stamps-new-owner", "desktop") && ok("thana", "stamps-thana", "desktop") && r("noperm", "stamps-noperm", "desktop")?.status === 404,
    "200/200/200/200/200/404", `${["stamps-owner", "stamps-editor-owner", "stamps-new-owner"].map((n) => r("owner", n, "desktop")?.status).join("/")} mobile=${r("owner", "stamps-owner", "mobile")?.status}/ovf=${r("owner", "stamps-owner", "mobile")?.overflow} thana=${r("thana", "stamps-thana", "desktop")?.status} noperm=${r("noperm", "stamps-noperm", "desktop")?.status}`);
  chk("M2.3-S6.4", "🔴 parity ภาพ 17 — Fable ตรวจด้วยตา · wo-notes/member-M2.3.md มี 'PARITY: ผ่าน' · stamp.added/stamp.completed ลง 3 ทะเบียน · drain แล้ว event stamp.* DONE ทั้งหมด",
    /^\s*-?\s*\*\*PARITY:\s*ผ่าน\*\*/m.test(read("ledger/wo-notes/member-M2.3.md")) && in3("stamp.added") && in3("stamp.completed") && (await P.outboxEvent.count({ where: { tenantId: tid, type: { startsWith: "stamp." }, status: { not: "DONE" } } })) === 0,
    "PARITY + 3 ทะเบียน", `parity=${/^\s*-?\s*\*\*PARITY:\s*ผ่าน\*\*/m.test(read("ledger/wo-notes/member-M2.3.md"))} reg=${in3("stamp.added")}/${in3("stamp.completed")} stuck=${await P.outboxEvent.count({ where: { tenantId: tid, type: { startsWith: "stamp." }, status: { not: "DONE" } } })}`, "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M2.3-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  // ล้าง progress/event ของการ์ดทดสอบ (ครอบคลุมสมาชิก seed ที่ถูกประทับด้วย)
  if (made.cards.length) {
    const progs = await P.stampCardProgress.findMany({ where: { cardId: { in: made.cards } }, select: { id: true } }).catch(() => []);
    const pids = progs.map((p: Any) => p.id);
    if (pids.length) {
      const evs = await P.stampEvent.findMany({ where: { progressId: { in: pids } }, select: { id: true } }).catch(() => []);
      const eids = evs.map((e: Any) => e.id);
      if (eids.length) {
        await d(() => prisma.$executeRawUnsafe(`update "PosSale" set "stampEventIds" = array(select x from unnest("stampEventIds") x where x <> all($1::text[])) where "tenantId" = $2 and "stampEventIds" && $1::text[]`, eids, tid));
        await d(() => P.appointment.updateMany({ where: { stampEventId: { in: eids } }, data: { stampEventId: null } }));
      }
      await d(() => P.stampEvent.deleteMany({ where: { progressId: { in: pids } } }));
      await d(() => P.stampCardProgress.deleteMany({ where: { id: { in: pids } } }));
    }
    await d(() => P.stampCard.deleteMany({ where: { id: { in: made.cards } } }));
  }
  if (made.ledgerKeys.length) { const leds = await prisma.pointLedger.findMany({ where: { tenantId: tid, idempotencyKey: { in: made.ledgerKeys } }, select: { id: true, customerId: true, delta: true } }).catch(() => [] as Any[]); await d(() => P.pointLot.deleteMany({ where: { ledgerId: { in: leds.map((l: Any) => l.id) } } })); await d(() => prisma.pointLedger.deleteMany({ where: { id: { in: leds.map((l: Any) => l.id) } } })); for (const l of leds) await d(() => P.pointBalance.updateMany({ where: { customerId: l.customerId }, data: { balance: { decrement: l.delta } } })); }
  if (made.appts.length) await d(() => prisma.appointment.deleteMany({ where: { id: { in: made.appts } } }));
  if (made.sales.length) { await d(() => P.posPayment.deleteMany({ where: { saleId: { in: made.sales } } })); await d(() => P.posSaleLine.deleteMany({ where: { saleId: { in: made.sales } } })); await d(() => prisma.posSale.deleteMany({ where: { id: { in: made.sales } } })); }
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["stampCardProgress", "pointLot", "pointLedger", "pointBalance", "memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberAccessLog", "memberActivity"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.appointment.deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) { await d(() => prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } })); await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } })); }
  }
  for (const t of ["stamp.", "booking.completed", "point.", "member."]) await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: t }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M2.3: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
