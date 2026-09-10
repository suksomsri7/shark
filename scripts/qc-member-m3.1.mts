// QC — ระบบสมาชิก v2 WO M3.1: segments — evaluateSegment (ฟิลด์ระบบ · f.{key} filterable · tier · points · lastActivity/ไม่ซื้อ N วัน · spent12m · visits12m · voucherCount · consent · source · unit · tags · birthdayMonth · lifecycle CRM) · AND ในกลุ่ม / OR ระหว่างกลุ่ม · count/sample/save/scope · หน้า segment builder ประโยคไทย (ภาพ 21 ขั้น 1)
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M3.1 · พิมพ์เขียว §4.3 (MemberSegment) §5.9 (segments.ts) §3.8 · MEMBER-API §2.13 (segments.*) · ภาพ 21 (ขั้น 1)
// requires: member-seed
//
// สัญญา (migration `member_v2_g` = MemberSegment {systemId name definition Json lastCount? lastCountAt? ownerUserId? scope("TEAM"|"PRIVATE") createdAt updatedAt} index(systemId) · engine ที่ src/lib/modules/member/segments.ts (เจ้าของข้อมูลสมาชิก) · facade member/index.ts export · src/lib/modules/marketing/segments.ts = re-export ผ่าน facade member (เส้น marketing→member Fable อนุมัติ) · หน้า /member/segments · segments-actions.ts)
//   SEGMENT_FIELDS (ทะเบียน · export listSegmentFields(ctx) → [{ key, label(ไทย), kind, ops[], options?[] }]): ฟิลด์ระบบที่ filterable (gender homeUnitId source status createdAt birthDate …) · `f.<key>` ทุกฟิลด์กำหนดเองที่ filterable (label จาก FieldDef · SELECT มี options) · `tier` (options = TierDef) · `points` · `lastActivityAt` · `inactiveDays` (ไม่ซื้อ/ไม่จอง มากกว่า N วัน = lastActivityAt < now−N หรือ null) · `spent12m` (สตางค์ · จาก Customer.spent12mSatang cache) · `visits12m` · `voucherCount` (ใบ ACTIVE) · `consent.<channel>` (15 ช่องทาง canConsent) · `source` · `unit` (homeUnitId) · `tags` · `birthdayMonth` · `lifecycle` (CrmContact.lifecycleStage ผ่าน partyId · ไม่มี CRM = ไม่ตรง)
//   ops: eq neq in nin gt gte lt lte contains isNull notNull before after hasAny hasAll · Definition = { groups: [{ conditions: [{ field, op, value }] }] } · เงื่อนไขในกลุ่ม AND · กลุ่ม OR · groups ว่าง = สมาชิกทุกคน (ยกเว้น MERGED)
//   evaluateSegment(ctx, definition) → Prisma.CustomerWhereInput (ผสม unit scope ของ actor เมื่อเรียกผ่าน count/sample) · field/op ไม่รู้จัก → throw ไทย · ฟิลด์กำหนดเองไม่ filterable → throw ไทย
//   countSegment(ctx, actor, definition) → { count, avgSpend12mSatang, sample: MemberBrief[≤5] } · sampleSegment(ctx, actor, definition, { take ≤ 50, cursor? }) → { items, nextCursor } · saveSegment(ctx, actor, { id?, name, definition, scope }) → MemberSegment (+lastCount/lastCountAt) · listSegments(ctx, actor) (TEAM ทุกคน · PRIVATE เฉพาะเจ้าของ) · deleteSegment (เจ้าของหรือ promo.manage) · segmentMembers(ctx, actor, id, { take, cursor }) · เพดาน MEMBER_LIMITS.segments (100)
//   สิทธิ์: อ่าน/นับ = member.promo.read (read-โดยนัย) · บันทึก/ลบ = member.promo.manage · STAFF unit scope: นับเฉพาะสมาชิกใน unitAccess
//   UI (ภาพ 21 ขั้น 1): /member/segments — รายการ segment (ชื่อ · เงื่อนไขย่อ · จำนวนล่าสุด · scope · ผู้สร้าง) + ปุ่มสร้าง · builder: แถวเงื่อนไขเป็นประโยค [สมาชิกที่][ฟิลด์ ▾][ตัวเลือก op ▾][ค่า] · "และ" ในกลุ่ม · "หรือ" เพิ่มกลุ่ม · ปุ่ม + เพิ่มเงื่อนไข · กล่องฟ้า "n คน เข้าเงื่อนไข · ยอดซื้อ 12 เดือนเฉลี่ย ฿x/คน · ตัวอย่าง: ชื่อ ×5" (อัปเดตสด debounce) · ปุ่ม "บันทึกเป็น Segment" (ชื่อ + scope)
//   testid: segments-page segments-list segment-row-<id> segments-add segments-builder segment-group segment-condition segment-add-condition segment-add-group segment-count segment-sample segments-save
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
const migDir = existsSync("prisma/migrations") ? readdirSync("prisma/migrations").find((d) => /_member_v2_g$/.test(d)) : undefined;
if (!migDir || !existsSync("src/lib/modules/member/segments.ts") || !existsSync("src/app/app/sys/[id]/member/segments/page.tsx")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (migration member_v2_g · member/segments.ts · member/segments/page.tsx)");
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
const P = prisma as Any;
let tid = ""; let SYS = "";
const tag = Date.now().toString(36);
const made = { segments: [] as string[], vouchers: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const S = (await import("@/lib/modules/member/segments" as string)) as Record<string, (...a: Any[]) => Any>;
  const M = (await import("@/lib/modules/member" as string)) as Record<string, (...a: Any[]) => Any>;
  const { MEMBER_LIMITS } = (await import("@/lib/modules/member/limits" as string)) as Any;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId);
  const thana = await actorOf(E.users.staff.thana.userId);
  const pook = await actorOf(E.users.staff.pook.userId);
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const base = { memberSystemId: SYS, status: { not: "MERGED" as Any } };
  const total = await prisma.customer.count({ where: base });
  const def = (...conds: Any[]) => ({ groups: [{ conditions: conds }] });
  const cnt = async (d: Any, actor: Any = owner) => (await S.countSegment(ctx, actor, d)).count as number;
  const gold = await P.memberTierDef.findFirst({ where: { systemId: SYS, key: "gold" } });
  const platinum = await P.memberTierDef.findFirst({ where: { systemId: SYS, key: "platinum" } });
  // เตรียม cache spent12m/visits12m/lastActivityAt ให้มีค่าจริงบางคน (cron refresh ยังไม่มาในใบนี้)
  const cacheIds = [m(1).id, m(2).id, m(3).id, m(46).id, m(47).id];
  const cache0 = await prisma.customer.findMany({ where: { id: { in: cacheIds } }, select: { id: true, spent12mSatang: true, visits12m: true, lastActivityAt: true } });
  restore.push(async () => { for (const c of cache0) await P.customer.update({ where: { id: c.id }, data: { spent12mSatang: c.spent12mSatang, visits12m: c.visits12m, lastActivityAt: c.lastActivityAt } }); });
  const old = new Date(Date.now() - 45 * 86_400_000); const recent = new Date(Date.now() - 3 * 86_400_000);
  for (const [i, id] of cacheIds.entries()) await P.customer.update({ where: { id }, data: { spent12mSatang: BigInt(3_500_000 + i * 100_000), visits12m: 8 + i, lastActivityAt: i < 3 ? old : recent } });

  // ═══ S1 schema + ทะเบียน ═══
  const sc = await cols("MemberSegment");
  const fields = await S.listSegmentFields(ctx);
  const keys: string[] = fields.map((f: Any) => f.key);
  const KINDS = ["tier", "points", "inactiveDays", "lastActivityAt", "spent12m", "visits12m", "voucherCount", "source", "unit", "tags", "birthdayMonth", "lifecycle"];
  chk("M3.1-S1.1", "migration member_v2_g: MemberSegment {systemId name definition lastCount lastCountAt ownerUserId scope} · listSegmentFields ≥ 25 (ฟิลด์ระบบ filterable + f.certLevel/f.diveCount กำหนดเอง + tier/points/inactiveDays/lastActivityAt/spent12m/visits12m/voucherCount/consent.LINE/source/unit/tags/birthdayMonth/lifecycle) · ทุกตัว label ไทย + ops[] · tier มี options 4 · f.certLevel มี options · MEMBER_LIMITS.segments 100",
    ["systemId", "name", "definition", "lastCount", "lastCountAt", "ownerUserId", "scope"].every((c) => sc.has(c)) && fields.length >= 25 && KINDS.every((k) => keys.includes(k)) && keys.includes("f.certLevel") && keys.includes("f.diveCount") && keys.includes("consent.LINE") && fields.every((f: Any) => /[ก-๙]/.test(f.label) && Array.isArray(f.ops) && f.ops.length > 0) && fields.find((f: Any) => f.key === "tier")?.options?.length === 4 && (fields.find((f: Any) => f.key === "f.certLevel")?.options?.length ?? 0) >= 3 && MEMBER_LIMITS.segments === 100,
    "ครบ", `cols=${[...sc].length} n=${fields.length} missing=${[...KINDS, "f.certLevel", "f.diveCount", "consent.LINE"].filter((k) => !keys.includes(k)).join(",") || "-"} tierOpts=${fields.find((f: Any) => f.key === "tier")?.options?.length} limit=${MEMBER_LIMITS.segments}`);

  // ═══ S2 เงื่อนไข 12 ชนิด (คาดหวังนับอิสระด้วย prisma) ═══
  const expTier = await prisma.customer.count({ where: { ...base, tierDefId: { in: [gold.id, platinum.id] } } });
  const r1 = await S.countSegment(ctx, owner, def({ field: "tier", op: "in", value: ["gold", "platinum"] }));
  chk("M3.1-S2.1", `tier in [gold, platinum] → ${expTier} (สมาชิก 10+5) · sample ≤ 5 MemberBrief (ไม่มีเบอร์เต็ม) · avgSpend12mSatang เป็นตัวเลข`, r1?.count === expTier && r1.sample?.length === 5 && r1.sample.every((s: Any) => !!s.memberCode && !/^0\d{9}$/.test(s.phone ?? "")) && typeof r1.avgSpend12mSatang === "number", `${expTier}`, `${JSON.stringify({ c: r1?.count, s: r1?.sample?.length, avg: r1?.avgSpend12mSatang })}`);

  const expInactive = await prisma.customer.count({ where: { ...base, OR: [{ lastActivityAt: { lt: new Date(Date.now() - 30 * 86_400_000) } }, { lastActivityAt: null }] } });
  const expActive = await prisma.customer.count({ where: { ...base, lastActivityAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } });
  chk("M3.1-S2.2", `inactiveDays gt 30 (ไม่ซื้อ/ไม่จอง > 30 วัน · รวมคนไม่เคยมี) → ${expInactive} · lastActivityAt after now−30d → ${expActive} · รวมกัน = ทั้งหมด ${total}`, (await cnt(def({ field: "inactiveDays", op: "gt", value: 30 }))) === expInactive && (await cnt(def({ field: "lastActivityAt", op: "after", value: new Date(Date.now() - 30 * 86_400_000).toISOString() }))) === expActive && expInactive + expActive === total, `${expInactive}/${expActive}`, `${await cnt(def({ field: "inactiveDays", op: "gt", value: 30 }))}/${await cnt(def({ field: "lastActivityAt", op: "after", value: new Date(Date.now() - 30 * 86_400_000).toISOString() }))}`);

  const F = (await import("@/lib/modules/member/fields" as string)) as Record<string, (...a: Any[]) => Any>;
  const fw = await F.fieldFilterWhere({ tenantId: tid, systemId: SYS }, { certLevel: "Advanced" }).catch(() => null);
  const expCert = fw ? await prisma.customer.count({ where: { ...base, ...fw } }) : -1;
  const certAdv = await cnt(def({ field: "f.certLevel", op: "in", value: ["Advanced"] }));
  const certAny = await cnt(def({ field: "f.certLevel", op: "in", value: ["Advanced", "Rescue"] }));
  const eNotFilterable = await fails(() => S.countSegment(ctx, owner, def({ field: "f.certNo", op: "eq", value: "x" })));
  chk("M3.1-S2.3", `f.certLevel in [Advanced] → ${expCert} (ตรง fieldFilterWhere ของ M1.2) · in [Advanced, Rescue] ≥ นั้น · ฟิลด์ที่ไม่ filterable (f.certNo) → throw ไทย`, certAdv === expCert && certAdv > 0 && certAny >= certAdv && thai(eNotFilterable), `${expCert}`, `${certAdv}/${certAny} e=${eNotFilterable?.message?.slice(0, 40)}`);

  const dcRows = await P.memberFieldValue.findMany({ where: { customer: base, field: { systemId: SYS, key: "diveCount" } }, select: { valueNumber: true, valueText: true } });
  const expDive = dcRows.filter((r: Any) => Number(r.valueNumber ?? r.valueText) >= 50).length;
  chk("M3.1-S2.4", `f.diveCount gte 50 (ตัวเลข) → ${expDive} · lt 50 + gte 50 = คนที่มีค่า ${dcRows.length}`, (await cnt(def({ field: "f.diveCount", op: "gte", value: 50 }))) === expDive && (await cnt(def({ field: "f.diveCount", op: "lt", value: 50 }))) === dcRows.length - expDive, `${expDive}`, `${await cnt(def({ field: "f.diveCount", op: "gte", value: 50 }))}/${await cnt(def({ field: "f.diveCount", op: "lt", value: 50 }))}`);

  const PS = (await import("@/lib/modules/point" as string)) as Record<string, (...a: Any[]) => Any>;
  const PT = scope.systems.POINT as string;
  const balRows = await P.pointBalance.findMany({ where: { systemId: PT, customer: base }, select: { balance: true } }).catch(() => [] as Any[]);
  const expPts = balRows.filter((r: Any) => r.balance >= 100).length;
  chk("M3.1-S2.5", `points gte 100 → ${expPts} (จาก PointBalance ระบบแต้มของร้าน) · points gte 0 = ทุกคน ${total} (ไม่มีแถว balance = 0)`, (await cnt(def({ field: "points", op: "gte", value: 100 }))) === expPts && (await cnt(def({ field: "points", op: "gte", value: 0 }))) === total, `${expPts}/${total}`, `${await cnt(def({ field: "points", op: "gte", value: 100 }))}/${await cnt(def({ field: "points", op: "gte", value: 0 }))} ps=${typeof PS.getBalance}`);

  chk("M3.1-S2.6", "spent12m gte 3,600,000 สตางค์ → 4 (cache ที่เตรียม: 3.5M+i·0.1M · i=1..4) · visits12m gte 10 → 3 (8+i · i≥2)", (await cnt(def({ field: "spent12m", op: "gte", value: 3_600_000 }))) === 4 && (await cnt(def({ field: "visits12m", op: "gte", value: 10 }))) === 3, "4/3", `${await cnt(def({ field: "spent12m", op: "gte", value: 3_600_000 }))}/${await cnt(def({ field: "visits12m", op: "gte", value: 10 }))}`);

  const V = (await import("@/lib/modules/voucher" as string)) as Record<string, (...a: Any[]) => Any>;
  const iss = await V.issue(ctx, owner, { customerIds: [m(5).id, m(6).id], adhoc: { kind: "FIXED", value: 1_000, config: {}, validDays: 7 }, origin: "MANUAL", originRef: { campaignId: `seg-${tag}` } });
  for (const v of iss?.vouchers ?? []) made.vouchers.push(v.id);
  const expV = (await P.voucher.groupBy({ by: ["customerId"], where: { tenantId: tid, status: "ACTIVE", customer: base } }).catch(async () => P.voucher.findMany({ where: { tenantId: tid, status: "ACTIVE" }, select: { customerId: true }, distinct: ["customerId"] }))).length;
  chk("M3.1-S2.7", `voucherCount gte 1 (ใบ ACTIVE) → ${expV} (≥ 2 หลังออกให้สมาชิก 5,6) · voucherCount eq 0 = ที่เหลือ`, (await cnt(def({ field: "voucherCount", op: "gte", value: 1 }))) === expV && expV >= 2 && (await cnt(def({ field: "voucherCount", op: "eq", value: 0 }))) === total - expV, `${expV}`, `${await cnt(def({ field: "voucherCount", op: "gte", value: 1 }))}/${await cnt(def({ field: "voucherCount", op: "eq", value: 0 }))}`);

  const expLine = (await P.memberConsent.findMany({ where: { tenantId: tid, channel: "LINE", granted: true, customer: base }, select: { customerId: true }, distinct: ["customerId"] }).catch(() => [] as Any[])).length;
  const eBadChannel = await fails(() => S.countSegment(ctx, owner, def({ field: "consent.PIGEON", op: "eq", value: true })));
  chk("M3.1-S2.8", `consent.LINE eq true → ${expLine} (seed 40) · consent.LINE eq false = ที่เหลือ (ไม่มีแถว = ไม่ยินยอม) · ช่องทางไม่รู้จัก → throw ไทย`, (await cnt(def({ field: "consent.LINE", op: "eq", value: true }))) === expLine && expLine > 0 && (await cnt(def({ field: "consent.LINE", op: "eq", value: false }))) === total - expLine && thai(eBadChannel), `${expLine}`, `${await cnt(def({ field: "consent.LINE", op: "eq", value: true }))}/${await cnt(def({ field: "consent.LINE", op: "eq", value: false }))} e=${thai(eBadChannel)}`);

  const expSrc = await prisma.customer.count({ where: { ...base, source: "STAFF" as Any } });
  const expUnit = await prisma.customer.count({ where: { ...base, homeUnitId: E.units.kata } });
  chk("M3.1-S2.9", `source in [STAFF] → ${expSrc} · unit in [กะตะ] → ${expUnit} (20) · unit nin [กะตะ] → ${total - expUnit}`, (await cnt(def({ field: "source", op: "in", value: ["STAFF"] }))) === expSrc && (await cnt(def({ field: "unit", op: "in", value: [E.units.kata] }))) === expUnit && (await cnt(def({ field: "unit", op: "nin", value: [E.units.kata] }))) === total - expUnit, `${expSrc}/${expUnit}`, `${await cnt(def({ field: "source", op: "in", value: ["STAFF"] }))}/${await cnt(def({ field: "unit", op: "in", value: [E.units.kata] }))}/${await cnt(def({ field: "unit", op: "nin", value: [E.units.kata] }))}`);

  const tag0 = await prisma.customer.findMany({ where: { id: { in: [m(7).id, m(8).id] } }, select: { id: true, tags: true } });
  restore.push(async () => { for (const c of tag0) await P.customer.update({ where: { id: c.id }, data: { tags: c.tags } }); });
  await prisma.customer.update({ where: { id: m(7).id }, data: { tags: ["vip", `seg-${tag}`] } });
  await prisma.customer.update({ where: { id: m(8).id }, data: { tags: [`seg-${tag}`] } });
  chk("M3.1-S2.10", "tags hasAny [vip, seg-<tag>] → 2 · hasAll [vip, seg-<tag>] → 1 · hasAny [ไม่มี] → 0", (await cnt(def({ field: "tags", op: "hasAny", value: ["vip", `seg-${tag}`] }))) === 2 && (await cnt(def({ field: "tags", op: "hasAll", value: ["vip", `seg-${tag}`] }))) === 1 && (await cnt(def({ field: "tags", op: "hasAny", value: ["no-such-tag-zz"] }))) === 0, "2/1/0", `${await cnt(def({ field: "tags", op: "hasAny", value: ["vip", `seg-${tag}`] }))}/${await cnt(def({ field: "tags", op: "hasAll", value: ["vip", `seg-${tag}`] }))}/${await cnt(def({ field: "tags", op: "hasAny", value: ["no-such-tag-zz"] }))}`);

  const bdRows = await prisma.customer.findMany({ where: { ...base, birthDate: { not: null } }, select: { birthDate: true } });
  const expOct = bdRows.filter((r) => r.birthDate!.getUTCMonth() === 9).length;
  const expFemale = await prisma.customer.count({ where: { ...base, gender: "FEMALE" as Any } });
  chk("M3.1-S2.11", `birthdayMonth eq 10 → ${expOct} (seed 12) · ฟิลด์ระบบ gender eq FEMALE → ${expFemale} · createdAt before วันนี้+1 = ทุกคน ${total}`, (await cnt(def({ field: "birthdayMonth", op: "eq", value: 10 }))) === expOct && expOct >= 12 && (await cnt(def({ field: "gender", op: "eq", value: "FEMALE" }))) === expFemale && (await cnt(def({ field: "createdAt", op: "before", value: new Date(Date.now() + 86_400_000).toISOString() }))) === total, `${expOct}/${expFemale}/${total}`, `${await cnt(def({ field: "birthdayMonth", op: "eq", value: 10 }))}/${await cnt(def({ field: "gender", op: "eq", value: "FEMALE" }))}/${await cnt(def({ field: "createdAt", op: "before", value: new Date(Date.now() + 86_400_000).toISOString() }))}`);

  const crmExists = !!(await P.crmContact?.count?.({ where: { tenantId: tid } }).catch(() => null));
  const lc = await S.countSegment(ctx, owner, def({ field: "lifecycle", op: "in", value: ["CUSTOMER"] }));
  const eBadOp = await fails(() => S.countSegment(ctx, owner, def({ field: "tier", op: "hasAll", value: ["gold"] })));
  const eBadField = await fails(() => S.countSegment(ctx, owner, def({ field: "salary", op: "gt", value: 1 })));
  chk("M3.1-S2.12", `lifecycle in [CUSTOMER] (CRM ผ่าน partyId · ร้านนี้${crmExists ? "มี" : "ไม่มี"} CRM) → นับได้ไม่ throw (0 เมื่อไม่มี) · op ไม่เข้ากับฟิลด์ (tier hasAll) → throw ไทย · ฟิลด์ไม่รู้จัก → throw ไทย`, typeof lc?.count === "number" && (crmExists || lc.count === 0) && thai(eBadOp) && thai(eBadField), "ไม่ throw + throw ×2", `lc=${lc?.count} op=${thai(eBadOp)} field=${thai(eBadField)}`);

  // ═══ S3 AND / OR ═══
  const expAnd = await prisma.customer.count({ where: { ...base, tierDefId: { in: [gold.id, platinum.id] }, homeUnitId: E.units.patong } });
  const expOr = await prisma.customer.count({ where: { ...base, OR: [{ tierDefId: { in: [gold.id, platinum.id] } }, { homeUnitId: E.units.kata }] } });
  chk("M3.1-S3.1", `AND ในกลุ่ม: tier in [gold,platinum] และ unit ป่าตอง → ${expAnd} (< ${expTier}) · OR สองกลุ่ม: [tier gold/platinum] หรือ [unit กะตะ] → ${expOr} (union ไม่นับซ้ำ)`, (await cnt(def({ field: "tier", op: "in", value: ["gold", "platinum"] }, { field: "unit", op: "in", value: [E.units.patong] }))) === expAnd && expAnd < expTier && (await cnt({ groups: [{ conditions: [{ field: "tier", op: "in", value: ["gold", "platinum"] }] }, { conditions: [{ field: "unit", op: "in", value: [E.units.kata] }] }] })) === expOr, `${expAnd}/${expOr}`, `${await cnt(def({ field: "tier", op: "in", value: ["gold", "platinum"] }, { field: "unit", op: "in", value: [E.units.patong] }))}/${await cnt({ groups: [{ conditions: [{ field: "tier", op: "in", value: ["gold", "platinum"] }] }, { conditions: [{ field: "unit", op: "in", value: [E.units.kata] }] }] })}`);
  const merged = await prisma.customer.count({ where: { memberSystemId: SYS, status: "MERGED" as Any } });
  chk("M3.1-S3.2", `groups ว่าง → ทุกคนยกเว้น MERGED (${total}) · กลุ่มว่าง 1 กลุ่ม = เหมือนกัน · definition รูปทรงผิด (ไม่มี groups) → throw ไทย`, (await cnt({ groups: [] })) === total && (await cnt({ groups: [{ conditions: [] }] })) === total && thai(await fails(() => S.countSegment(ctx, owner, { conditions: [] }))), `${total}`, `${await cnt({ groups: [] })}/${await cnt({ groups: [{ conditions: [] }] })} merged=${merged}`);

  // ═══ S4 perf ═══
  const big = def({ field: "tier", op: "in", value: ["silver", "gold", "platinum"] }, { field: "consent.LINE", op: "eq", value: true }, { field: "f.certLevel", op: "in", value: ["Advanced", "Rescue"] }, { field: "inactiveDays", op: "gt", value: 7 });
  await S.countSegment(ctx, owner, big);
  const t0 = Date.now(); await S.countSegment(ctx, owner, big); const ms = Date.now() - t0;
  chk("M3.1-S4.1", "perf: countSegment 4 เงื่อนไข (tier+consent+ฟิลด์กำหนดเอง+inactive) รอบที่ 2 ≤ 400ms บน seed 60 คน", ms <= 400, "≤400ms", `${ms}ms`, "MAJOR");

  // ═══ S5 save / scope ═══
  const seg = await S.saveSegment(ctx, owner, { name: `Gold ที่ไม่มา 30 วัน ${tag}`, definition: def({ field: "tier", op: "in", value: ["gold"] }, { field: "inactiveDays", op: "gt", value: 30 }), scope: "TEAM" });
  made.segments.push(seg.id);
  const priv = await S.saveSegment(ctx, pook, { name: `ส่วนตัวปุ๊ก ${tag}`, definition: def({ field: "unit", op: "in", value: [E.units.kata] }), scope: "PRIVATE" });
  made.segments.push(priv.id);
  const expSeg = await prisma.customer.count({ where: { ...base, tierDefId: gold.id, OR: [{ lastActivityAt: { lt: new Date(Date.now() - 30 * 86_400_000) } }, { lastActivityAt: null }] } });
  const listOwner = await S.listSegments(ctx, owner); const listThana = await S.listSegments(ctx, thana); const listPook = await S.listSegments(ctx, pook);
  const eSaveThana = await fails(() => S.saveSegment(ctx, thana, { name: "x", definition: def(), scope: "TEAM" }));
  const eName = await fails(() => S.saveSegment(ctx, owner, { name: " ", definition: def(), scope: "TEAM" }));
  const mem = await S.segmentMembers(ctx, owner, seg.id, { take: 3 });
  chk("M3.1-S5.1", `saveSegment TEAM → row lastCount ${expSeg} lastCountAt ownerUserId · PRIVATE ของปุ๊ก: owner เห็น TEAM ไม่เห็น PRIVATE ของคนอื่น · thana เห็น TEAM · ปุ๊กเห็นทั้ง 2 · thana (ไม่มี promo.manage) บันทึก → throw · ชื่อว่าง → throw · segmentMembers take 3 → items 3 + nextCursor`, seg?.lastCount === expSeg && !!seg.lastCountAt && seg.ownerUserId === owner.userId && listOwner.some((s: Any) => s.id === seg.id) && !listOwner.some((s: Any) => s.id === priv.id) && listThana.some((s: Any) => s.id === seg.id) && !listThana.some((s: Any) => s.id === priv.id) && listPook.some((s: Any) => s.id === priv.id) && listPook.some((s: Any) => s.id === seg.id) && !!eSaveThana && thai(eName) && mem?.items?.length === Math.min(3, expSeg) && (expSeg <= 3 || !!mem.nextCursor), "บันทึก+มองเห็นตาม scope", `seg=${JSON.stringify({ c: seg?.lastCount, exp: expSeg, owner: seg?.ownerUserId === owner.userId })} lists=${listOwner?.length}/${listThana?.length}/${listPook?.length} th=${!!eSaveThana} name=${thai(eName)} mem=${mem?.items?.length}`);

  const expPatongGold = await prisma.customer.count({ where: { ...base, tierDefId: { in: [gold.id, platinum.id] }, homeUnitId: E.units.patong } });
  const thanaCount = await cnt(def({ field: "tier", op: "in", value: ["gold", "platinum"] }), thana);
  const del = await S.deleteSegment(ctx, pook, priv.id);
  const eDelThana = await fails(() => S.deleteSegment(ctx, thana, seg.id));
  const upd = await S.saveSegment(ctx, owner, { id: seg.id, name: `Gold ที่ไม่มา 45 วัน ${tag}`, definition: def({ field: "tier", op: "in", value: ["gold"] }, { field: "inactiveDays", op: "gt", value: 45 }), scope: "TEAM" });
  chk("M3.1-S5.2", `unit scope: thana (ป่าตอง) นับ tier gold/platinum → ${expPatongGold} (เฉพาะป่าตอง) · ปุ๊กลบ segment ส่วนตัวตัวเอง → ok · thana ลบของทีม → throw · saveSegment {id} = แก้ชื่อ/นิยาม (id เดิม · lastCount ใหม่)`, thanaCount === expPatongGold && del?.ok === true && (await P.memberSegment.findUnique({ where: { id: priv.id } })) === null && !!eDelThana && upd?.id === seg.id && /45/.test(upd.name) && typeof upd.lastCount === "number", `${expPatongGold}`, `thana=${thanaCount} del=${JSON.stringify(del)} delTh=${!!eDelThana} upd=${upd?.id === seg?.id}/${upd?.name}`);

  // ═══ S6 UI / ภาพ ═══
  const page = read("src/app/app/sys/[id]/member/segments/page.tsx");
  const act = read("src/lib/modules/member/segments-actions.ts");
  const nav = read("src/lib/modules/member/nav.ts");
  const compDir = "src/components/member";
  const comps = existsSync(compDir) ? readdirSync(compDir).filter((f) => /segment/i.test(f)).map((f) => read(`${compDir}/${f}`)).join("\n") : "";
  const all = page + comps;
  const TIDS = ["segments-page", "segments-list", "segment-row-", "segments-add", "segments-builder", "segment-group", "segment-condition", "segment-add-condition", "segment-add-group", "segment-count", "segment-sample", "segments-save"];
  const missingT = TIDS.filter((t) => !all.includes(t));
  const LABELS = ["สมาชิกที่", "และ", "หรือ", "เพิ่มเงื่อนไข", "เข้าเงื่อนไข", "ยอดซื้อ 12 เดือนเฉลี่ย", "ตัวอย่าง", "บันทึกเป็น Segment"];
  const missingL = LABELS.filter((l) => !all.includes(l));
  const facade = read("src/lib/modules/member/index.ts");
  chk("M3.1-S6.1", "หน้า /member/segments requireTenant + read-โดยนัย · actions 'use server' gate promo.manage (save/delete) · testid 12 · ป้ายภาพ 21 ขั้น 1 ครบ · nav มีทางเข้า segments (campaigns หมวด) · facade export evaluateSegment/countSegment/sampleSegment/saveSegment/listSegments/deleteSegment/segmentMembers/listSegmentFields · marketing/segments.ts re-export ผ่าน @/lib/modules/member · ไม่มี any/อีโมจิ/hex",
    page.length > 0 && /requireTenant/.test(page) && /["']use server["']/.test(act) && /promo\.manage/.test(act) && missingT.length === 0 && missingL.length === 0 && /segments/.test(nav) && ["evaluateSegment", "countSegment", "sampleSegment", "saveSegment", "listSegments", "deleteSegment", "segmentMembers", "listSegmentFields"].every((f) => new RegExp(`\\b${f}\\b`).test(facade)) && /@\/lib\/modules\/member"/.test(read("src/lib/modules/marketing/segments.ts")) && !/:\s*any\b/.test(read("src/lib/modules/member/segments.ts") + act) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(all.replace(/\/\/.*$/gm, "")) && !/#[0-9a-fA-F]{6}\b/.test(all.replace(/\/\/.*$/gm, "")),
    "ครบ", `page=${page.length > 0} tid-missing=${missingT.join(",") || "-"} labels-missing=${missingL.join(",") || "-"} nav=${/segments/.test(nav)} mkt=${/@\/lib\/modules\/member"/.test(read("src/lib/modules/marketing/segments.ts"))}`);
  const dir = `${mq.MQC.shotsDir}/3.1`;
  const sum = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sum(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  const ok = (u: string, n: string, d: string) => r(u, n, d)?.status === 200 && r(u, n, d)?.missing?.length === 0 && r(u, n, d)?.errors?.length === 0 && !r(u, n, d)?.overflow;
  chk("M3.1-S6.2", "ภาพ 21 ขั้น 1: segments-owner desktop+mobile 200 ไม่ล้น (รายการ + builder มีเงื่อนไข 3 แถว + กล่องนับ) · thana 200 อ่านอย่างเดียว · noperm 404 · 🔴 PARITY: ผ่าน ใน wo-notes/member-M3.1.md",
    ok("owner", "segments-owner", "desktop") && ok("owner", "segments-owner", "mobile") && ok("owner", "segments-builder-owner", "desktop") && ok("thana", "segments-thana", "desktop") && r("noperm", "segments-noperm", "desktop")?.status === 404 && /^\s*-?\s*\*\*PARITY:\s*ผ่าน\*\*/m.test(read("ledger/wo-notes/member-M3.1.md")),
    "200 + PARITY", `${r("owner", "segments-owner", "desktop")?.status}/${r("owner", "segments-owner", "mobile")?.status}/${r("owner", "segments-builder-owner", "desktop")?.status} thana=${r("thana", "segments-thana", "desktop")?.status} noperm=${r("noperm", "segments-noperm", "desktop")?.status} parity=${/^\s*-?\s*\*\*PARITY:\s*ผ่าน\*\*/m.test(read("ledger/wo-notes/member-M3.1.md"))}`, "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M3.1-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  if (made.segments.length) await d(() => P.memberSegment.deleteMany({ where: { id: { in: made.segments } } }));
  if (made.vouchers.length) { await d(() => P.memberActivity.deleteMany({ where: { tenantId: tid, module: "voucher", refId: { in: made.vouchers } } })); await d(() => P.voucher.deleteMany({ where: { id: { in: made.vouchers } } })); }
  await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: "voucher." }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M3.1: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
