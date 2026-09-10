// QC — ระบบสมาชิก v2 WO M1.5: หน้ารวมสมาชิก (KPI 6 · ตัวกรองทุกฟิลด์ · มุมมองบันทึก · ตาราง · bulk · ส่งออก) + หน้า 360 แท็บโปรไฟล์ + แถบขวา
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M1.5 · พิมพ์เขียว §2.3 §3.1 §3.2 §6.1 (unit scope) §12 · ภาพ 01 · 02
// requires: member-seed
//
// สัญญาฟังก์ชัน (src/lib/modules/member/list.ts · views.ts · profile.ts ของ M1.4)
//   listMembers(ctx, actor, { q?, tier?(key|id), unit?, tag?, source?, status?, f?: Record<key,string>, viewId?, sort?, page?, take? })
//     → { items: MemberListRow[], total, page, take }  · MemberListRow = { id memberCode name phoneMasked tier{key,name,color} spent12mSatang visits12m lastActivityAt points tags[] homeUnit{id,name}|null listFields: Record<key, display> }
//     sort: "-lastActivityAt" (ปริยาย · null ท้าย) | "name" | "-spent12m" | "-points" | "memberCode" | "-createdAt" · take ≤ 100 · unit scope ตาม §6.1 (homeUnitId ในสาขาที่เข้าถึง หรือมี MemberActivity.unitId ในสาขานั้น) · f.* ผ่าน fields.fieldFilterWhere
//   getMemberKpis(ctx, actor) → { total, newThisMonth, active90d, pointsOutstanding, vouchersUnused, reviewAvg: number|null } (นับตาม unit scope ของ actor · เดือน/วันไทย +07:00)
//   bulkSetTags(ctx, actor, ids[], { add[], remove[] }) → { updated, skipped } (skipped = มองไม่เห็น/ไม่ใช่ของระบบ)
//   exportMembers(ctx, actor, { filters, columns[] }) → { csv: string, rows: number } (ต้อง member.customer.export · UTF-8 BOM · header ป้ายไทย · ≤ MEMBER_LIMITS.exportRows) · AuditLog member.export
//   views.ts: listSavedViews(ctx, actor) → [{id,name,scope,filters,columns,sort,ownerUserId}] · createSavedView(ctx, actor, {name, scope: "PRIVATE"|"TEAM", filters, columns, sort?}) · updateSavedView · deleteSavedView (เจ้าของ/OWNER · TEAM ต้อง MANAGER+)
//   UI: src/app/app/sys/[id]/member/members/page.tsx (+ [id]/page.tsx) · components/member/{MembersTable,MembersFilterBar,MembersKpis,SavedViewsMenu,BulkBar,Member360}.tsx — testid ตามข้อ S4
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
const PAGE = "src/app/app/sys/[id]/member/members/page.tsx";
if (!existsSync("src/lib/modules/member/list.ts") || !existsSync(PAGE)) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/member/list.ts · member/members/page.tsx)");
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
const stripComments = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const P = prisma as Any;
let tid = ""; let SYS = "";
const restore: (() => Promise<unknown>)[] = [];
const made = { views: [] as string[] };
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const L = (await import("@/lib/modules/member/list" as string)) as Record<string, (...a: Any[]) => Any>;
  const V = (await import("@/lib/modules/member/views" as string)) as Record<string, (...a: Any[]) => Any>;
  const F = (await import("@/lib/modules/member/fields" as string)) as Record<string, (...a: Any[]) => Any>;
  const actorOf = async (userId: string) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role as string, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> }; };
  const U = { owner: E.users.owner.userId as string, manager: E.users.manager.userId as string, thana: E.users.staff.thana.userId as string, kata: E.users.staff.kata.userId as string };
  const owner = await actorOf(U.owner); const thana = await actorOf(U.thana); const kata = await actorOf(U.kata);
  const ctxOf = (u: string) => ({ tenantId: tid, systemId: SYS, actorUserId: u });
  const ctxO = ctxOf(U.owner); const ctxT = ctxOf(U.thana); const ctxK = ctxOf(U.kata);
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const units = E.units as Record<string, string>;
  const cw = { memberSystemId: SYS, status: { not: "MERGED" } as Any }; // นับ SUSPENDED ด้วย (เหมือน listMembers ปริยาย) · ไม่นับ MERGED

  // ═══ S1 listMembers ═══
  const r0 = await L.listMembers(ctxO, owner, {});
  const row = r0?.items?.[0];
  const ROW_KEYS = ["id", "memberCode", "name", "phoneMasked", "tier", "spent12mSatang", "visits12m", "lastActivityAt", "points", "tags", "homeUnit", "listFields"];
  const sortedOk = (r0?.items ?? []).every((it: Any, i: number, arr: Any[]) => i === 0 || !it.lastActivityAt || !arr[i - 1].lastActivityAt || new Date(arr[i - 1].lastActivityAt) >= new Date(it.lastActivityAt));
  chk("M1.5-S1.1", "listMembers ปริยาย → {items 50 (take ปริยาย 50), total 60, page 1, take 50} · แถวมีคีย์ครบ 12 · tier {key,name,color} · points เป็น number (จาก PointBalance) · เรียง -lastActivityAt (null ท้าย) · ไม่มีเบอร์เต็ม (phoneMasked มี x/*)", r0?.total === 60 && r0.items.length === 50 && r0.page === 1 && r0.take === 50 && ROW_KEYS.every((k) => k in row) && row.tier?.key && row.tier.name && typeof row.points === "number" && sortedOk && /[x*]/.test(row.phoneMasked) && !/08100000\d\d/.test(JSON.stringify(r0.items)), "ครบ", JSON.stringify({ total: r0?.total, n: r0?.items?.length, keys: row && ROW_KEYS.filter((k) => !(k in row)), sorted: sortedOk }).slice(0, 200));
  const c5 = (await prisma.customer.findUnique({ where: { id: m(5).id } })) as Any;
  const qName = await L.listMembers(ctxO, owner, { q: (c5.firstName ?? c5.name).slice(0, 3) });
  const qPhone = await L.listMembers(ctxO, owner, { q: m(7).phone });
  const qCode = await L.listMembers(ctxO, owner, { q: m(9).memberCode });
  const qPhonePart = await L.listMembers(ctxO, owner, { q: m(7).phone.slice(-4) });
  chk("M1.5-S1.2", "q: ชื่อบางส่วน → มีสมาชิก 5 · เบอร์เต็ม → 1 (สมาชิก 7) · รหัสสมาชิก → 1 · เลขท้ายเบอร์ 4 หลัก → มีสมาชิก 7 (ค้นด้วยเบอร์บางส่วนได้)", qName.items.some((i: Any) => i.id === m(5).id) && qPhone.total === 1 && qPhone.items[0].id === m(7).id && qCode.total === 1 && qCode.items[0].id === m(9).id && qPhonePart.items.some((i: Any) => i.id === m(7).id), "ครบ", `name=${qName?.total} phone=${qPhone?.total} code=${qCode?.total} part=${qPhonePart?.total}`);
  const gold = await P.memberTierDef.findFirst({ where: { systemId: SYS, key: "gold" } });
  const tKey = await L.listMembers(ctxO, owner, { tier: "gold" }); const tId = await L.listMembers(ctxO, owner, { tier: gold.id });
  const st0 = await L.listMembers(ctxO, owner, { status: "SUSPENDED" });
  await prisma.customer.update({ where: { id: m(20).id }, data: { status: "SUSPENDED" } as Any });
  restore.push(() => prisma.customer.update({ where: { id: m(20).id }, data: { status: "ACTIVE" } as Any }));
  const st1 = await L.listMembers(ctxO, owner, { status: "SUSPENDED" }); const stAll = await L.listMembers(ctxO, owner, {});
  chk("M1.5-S1.3", "tier=gold (key) → 10 · tier=<tierDefId> → 10 · status=SUSPENDED → 0 → ระงับ 1 คน → 1 · รายการปริยาย (ไม่ส่ง status) ยังนับคนที่ระงับ (total 60) แต่ไม่นับ MERGED", tKey?.total === 10 && tId?.total === 10 && st0?.total === 0 && st1?.total === 1 && st1.items[0].id === m(20).id && stAll?.total === 60, "10/10/0→1/60", `${tKey?.total}/${tId?.total}/${st0?.total}→${st1?.total}/${stAll?.total}`);
  const uP = await L.listMembers(ctxO, owner, { unit: units.patong }); const uK = await L.listMembers(ctxO, owner, { unit: units.kata });
  const visibleT = await prisma.customer.count({ where: { ...cw, OR: [{ homeUnitId: units.patong }, { activities: { some: { unitId: units.patong } } }] } as Any });
  const lT = await L.listMembers(ctxO, thana, {}); const lK = await L.listMembers(ctxK, kata, { unit: units.patong });
  chk("M1.5-S1.4", "unit=patong → 40 · kata → 20 · unit scope: thana (STAFF ป่าตอง) เห็น total = สมาชิกบ้านป่าตอง ∪ เคยมีกิจกรรมที่ป่าตอง (นับจาก DB) · STAFF กะตะ ส่ง unit=patong → 0 (ไม่ใช่ error · ไม่รั่ว)", uP?.total === 40 && uK?.total === 20 && lT?.total === visibleT && lK?.total === 0, `40/20/${visibleT}/0`, `${uP?.total}/${uK?.total}/${lT?.total}/${lK?.total}`);
  for (const i of [11, 12, 13]) { const c = (await prisma.customer.findUnique({ where: { id: m(i).id } })) as Any; restore.push(() => prisma.customer.update({ where: { id: m(i).id }, data: { tags: c.tags } })); await prisma.customer.update({ where: { id: m(i).id }, data: { tags: [...((c.tags as string[]) ?? []), "vipqc"] } }); }
  const tg = await L.listMembers(ctxO, owner, { tag: "vipqc" }); const src = await L.listMembers(ctxO, owner, { source: "WALK_IN" });
  chk("M1.5-S1.5", "tag=vipqc → 3 (Customer.tags Json) · source=WALK_IN → 60 (seed backfill) · source=LIFF → 0 · tag ไม่มี → 0", tg?.total === 3 && src?.total === 60 && (await L.listMembers(ctxO, owner, { source: "LIFF" }))?.total === 0 && (await L.listMembers(ctxO, owner, { tag: "ไม่มีแท็กนี้" }))?.total === 0, "3/60/0/0", `${tg?.total}/${src?.total}`);
  const nOW = await P.memberFieldValue.count({ where: { fieldId: E.fields.dive.certLevel, valueOptions: { has: "Open Water" } } });
  const fOW = await L.listMembers(ctxO, owner, { f: { certLevel: "Open Water" } });
  const dcRows: Any[] = await P.memberFieldValue.findMany({ where: { fieldId: E.fields.dive.diveCount }, select: { customerId: true, valueNumber: true } });
  const nDC = dcRows.filter((r) => Number(r.valueNumber) >= 10 && Number(r.valueNumber) <= 20).length;
  const fDC = await L.listMembers(ctxO, owner, { f: { diveCount: "10..20" } });
  const fAnd = await L.listMembers(ctxO, owner, { f: { certLevel: "Open Water" }, tier: "gold" });
  const nAnd = await prisma.customer.count({ where: { ...cw, tierDefId: gold.id, id: { in: (await P.memberFieldValue.findMany({ where: { fieldId: E.fields.dive.certLevel, valueOptions: { has: "Open Water" } }, select: { customerId: true } })).map((r: Any) => r.customerId) } } as Any });
  const eNF = await fails(() => L.listMembers(ctxO, owner, { f: { certNo: "x" } }));
  chk("M1.5-S1.6", `f.certLevel=Open Water → ${nOW} (ตรง DB) · f.diveCount=10..20 → ${nDC} · f + tier = AND (${nAnd}) · ฟิลด์ไม่ filterable (certNo) → throw ไทย`, fOW?.total === nOW && fDC?.total === nDC && fAnd?.total === nAnd && thai(eNF), `${nOW}/${nDC}/${nAnd}`, `${fOW?.total}/${fDC?.total}/${fAnd?.total} nf=${!!eNF}`);
  const sSpent = await L.listMembers(ctxO, owner, { sort: "-spent12m", take: 5 });
  const maxSpent = Number(((await prisma.customer.findFirst({ where: cw, orderBy: { spent12mSatang: "desc" } as Any })) as Any)?.spent12mSatang ?? 0);
  const sName = await L.listMembers(ctxO, owner, { sort: "name", take: 100 });
  const namesSorted = sName.items.map((i: Any) => i.name as string); const namesExp = [...namesSorted].sort((a, b) => a.localeCompare(b, "th"));
  const p1 = await L.listMembers(ctxO, owner, { sort: "memberCode", take: 10, page: 1 }); const p2 = await L.listMembers(ctxO, owner, { sort: "memberCode", take: 10, page: 2 });
  const eTake = await fails(() => L.listMembers(ctxO, owner, { take: 101 }));
  chk("M1.5-S1.7", "sort=-spent12m → แถวแรก = ยอดสูงสุด · sort=name เรียงไทย (localeCompare th) · take=10 page 1/2 ไม่ซ้อนกัน (memberCode ต่อเนื่อง) · take > 100 → throw", Number(sSpent?.items?.[0]?.spent12mSatang) === maxSpent && JSON.stringify(namesSorted) === JSON.stringify(namesExp) && p1?.items?.length === 10 && p2?.items?.length === 10 && !p1.items.some((a: Any) => p2.items.some((b: Any) => b.id === a.id)) && p1.items[9].memberCode < p2.items[0].memberCode && thai(eTake), "ครบ", `spent=${sSpent?.items?.[0]?.spent12mSatang}/${maxSpent} nameSorted=${JSON.stringify(namesSorted) === JSON.stringify(namesExp)} pages=${p1?.items?.length}/${p2?.items?.length}`);
  const listField = (await F.listLayout(ctxO, {})).sections.flatMap((s: Any) => s.fields).find((f: Any) => f.key === "certLevel");
  const withVal = r0.items.find((i: Any) => i.listFields?.certLevel);
  const view = await V.createSavedView(ctxO, owner, { name: "Gold ที่ดำน้ำ Open Water", scope: "TEAM", filters: { tier: "gold", f: { certLevel: "Open Water" } }, columns: ["memberCode", "name", "tier", "spent12m", "certLevel"], sort: "-spent12m" });
  made.views.push(view.id);
  const byView = await L.listMembers(ctxO, owner, { viewId: view.id });
  chk("M1.5-S1.8", "listFields: ฟิลด์ที่ showInList (certLevel) มีค่า display ในแถว (ป้าย label ไม่ใช่ value ดิบก็ได้) · viewId → ใช้ filters/sort ของมุมมองที่บันทึก (= tier gold ∧ certLevel Open Water)", listField?.showInList === true && !!withVal && typeof withVal.listFields.certLevel === "string" && byView?.total === nAnd, "ครบ", `showInList=${listField?.showInList} withVal=${!!withVal} view=${byView?.total}/${nAnd}`);

  // ═══ S2 bulk / export / saved views ═══
  for (const i of [31, 32, 33, 34, 35, 41]) { const c = (await prisma.customer.findUnique({ where: { id: m(i).id } })) as Any; restore.push(() => prisma.customer.update({ where: { id: m(i).id }, data: { tags: c.tags } })); }
  const bulk = await L.bulkSetTags(ctxO, owner, [m(31).id, m(32).id, m(33).id, m(34).id, m(35).id], { add: ["bulkqc"], remove: [] });
  const bulkK = await L.bulkSetTags(ctxK, kata, [m(1).id, m(2).id, m(41).id], { add: ["kataqc"], remove: [] });
  const c1tags = ((await prisma.customer.findUnique({ where: { id: m(1).id } })) as Any).tags as string[];
  chk("M1.5-S2.1", "bulkSetTags 5 คน → {updated 5, skipped 0} · tag=bulkqc → 5 · STAFF กะตะ bulk รวมสมาชิกป่าตอง 2 คน → updated 1 skipped 2 (มองไม่เห็น = ข้าม ไม่แตะ ไม่ throw) · AuditLog 1 แถวต่อ bulk (ไม่ใช่ต่อคน)", bulk?.updated === 5 && bulk.skipped === 0 && (await L.listMembers(ctxO, owner, { tag: "bulkqc" }))?.total === 5 && bulkK?.updated === 1 && bulkK.skipped === 2 && !c1tags.includes("kataqc") && (await prisma.auditLog.count({ where: { tenantId: tid, action: { contains: "member.bulk" } } })) >= 1, "5/0 · 1/2", JSON.stringify({ bulk, bulkK, leak: c1tags.includes("kataqc") }));
  const ex = await L.exportMembers(ctxO, owner, { filters: { tier: "gold" }, columns: ["memberCode", "name", "phone", "certLevel", "spent12m"] });
  const lines = (ex?.csv ?? "").replace(/^﻿/, "").split(/\r?\n/).filter((l: string) => l.length);
  const eExT = await fails(() => L.exportMembers(ctxT, thana, { filters: {}, columns: ["memberCode"] }));
  chk("M1.5-S2.2", "exportMembers(tier gold, 5 คอลัมน์) → csv มี BOM · header ป้ายไทย 5 ช่อง · 10 แถว · เบอร์เต็ม (ส่งออกได้เพราะมีสิทธิ์ export) · rows 10 · thana (ไม่มี member.customer.export) → throw · AuditLog member.export", (ex?.csv ?? "").startsWith("﻿") && lines.length === 11 && /[ก-๙]/.test(lines[0]!) && lines[0]!.split(",").length === 5 && ex.rows === 10 && lines.slice(1).some((l: string) => /08100000\d\d/.test(l)) && thai(eExT) && (await prisma.auditLog.count({ where: { tenantId: tid, action: { contains: "member.export" } } })) >= 1, "csv 10 แถว", `bom=${(ex?.csv ?? "").startsWith("﻿")} lines=${lines.length} header=${lines[0]?.slice(0, 60)} rows=${ex?.rows} thana=${!!eExT}`);
  const pv = await V.createSavedView(ctxT, thana, { name: "ของธนา", scope: "PRIVATE", filters: { unit: units.patong }, columns: ["memberCode", "name"] });
  made.views.push(pv.id);
  const eTeamStaff = await fails(() => V.createSavedView(ctxT, thana, { name: "ทีม", scope: "TEAM", filters: {}, columns: [] }));
  const listO: Any[] = await V.listSavedViews(ctxO, owner); const listT: Any[] = await V.listSavedViews(ctxT, thana);
  await V.updateSavedView(ctxT, thana, pv.id, { name: "ของธนา (แก้)" });
  const eUpdOther = await fails(() => V.updateSavedView(ctxK, kata, pv.id, { name: "แฮก" }));
  await V.deleteSavedView(ctxT, thana, pv.id); made.views.splice(made.views.indexOf(pv.id), 1);
  chk("M1.5-S2.3", "มุมมองบันทึก: PRIVATE ของธนา — owner ไม่เห็น · ธนาเห็นทั้ง PRIVATE ของตน + TEAM · STAFF สร้าง TEAM → throw (MANAGER+) · update โดยคนอื่น → throw · delete ของตัวเองได้", listO.some((v) => v.id === view.id) && !listO.some((v) => v.id === pv.id) && listT.some((v) => v.id === pv.id) && listT.some((v) => v.id === view.id) && thai(eTeamStaff) && !!eUpdOther && (await P.memberSavedView.count({ where: { id: pv.id } })) === 0, "ครบ", `o=${listO.map((v) => v.name).join("|")} t=${listT.map((v) => v.name).join("|")} team=${!!eTeamStaff} upd=${!!eUpdOther}`);

  // ═══ S3 KPI + 360 DTO + nav ═══
  const k = await L.getMemberKpis(ctxO, owner);
  const nowBkk = new Date(Date.now() + 7 * 3600_000); const monthStart = new Date(Date.UTC(nowBkk.getUTCFullYear(), nowBkk.getUTCMonth(), 1) - 7 * 3600_000);
  const expNew = await prisma.customer.count({ where: { ...cw, createdAt: { gte: monthStart } } as Any });
  const expActive = await prisma.customer.count({ where: { ...cw, lastActivityAt: { gte: new Date(Date.now() - 90 * 86400_000) } } as Any });
  const expPoints = Number((await prisma.pointBalance.aggregate({ where: { tenantId: tid }, _sum: { balance: true } }))._sum.balance ?? 0);
  const kT = await L.getMemberKpis(ctxT, thana);
  chk("M1.5-S3.1", "getMemberKpis(owner) → {total 60 (ไม่นับ MERGED · นับ SUSPENDED), newThisMonth (เดือนไทยปัจจุบัน), active90d (lastActivityAt ≥ 90 วัน), pointsOutstanding (Σ PointBalance), vouchersUnused 0 (ยังไม่มีตาราง), reviewAvg null} · thana → total ตาม unit scope", k?.total === 60 && k.newThisMonth === expNew && k.active90d === expActive && k.pointsOutstanding === expPoints && k.vouchersUnused === 0 && k.reviewAvg === null && kT?.total === visibleT, JSON.stringify({ total: 60, expNew, expActive, expPoints, vis: visibleT }), JSON.stringify({ k, kT: kT?.total }));
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const v = await PR.getMember360(ctxO, owner, m(1).id);
  chk("M1.5-S3.2", "360 DTO ครบสำหรับหน้า: stats 6 ตัว {spent12mSatang visits12m points vouchers lastActivityAt reviewAvg} · tier {current{key,name,color}, next: null|{key,name,shortfall}} · connections {chat crm account kanbanCards} · profile.homeUnit{name} · profile.owner{name}|null · createdAt", ["spent12mSatang", "visits12m", "points", "vouchers", "lastActivityAt", "reviewAvg"].every((s) => s in (v?.stats ?? {})) && v.tier?.current?.key && v.tier.current.color && "next" in v.tier && ["chat", "crm", "account", "kanbanCards"].every((c) => typeof v.connections?.[c] === "number") && v.profile?.homeUnit?.name && "owner" in v.profile && v.profile.createdAt, "ครบ", JSON.stringify({ stats: Object.keys(v?.stats ?? {}), tier: v?.tier && Object.keys(v.tier), conn: v?.connections, home: v?.profile?.homeUnit }).slice(0, 200));
  const N = (await import("@/lib/modules/member/nav" as string)) as Any;
  const navMembers = (N.MEMBER_NAV as Any[]).find((e) => e.key === "members");
  const oldCustomers = read("src/app/app/sys/[id]/member/customers/page.tsx");
  chk("M1.5-S3.3", "nav.ts: members status ready · path /member/members · หน้าเดิม /member/customers → redirect ไปหน้าใหม่ (ไม่ทิ้ง 2 หน้ารายชื่อ) · /member/members/[memberId] มีจริง (Next ห้ามใช้ชื่อ segment [id] ซ้ำใน route เดียว — builder M1.5 แย้งถูก)", navMembers?.status === "ready" && navMembers.path === "/member/members" && /redirect\(/.test(oldCustomers) && existsSync("src/app/app/sys/[id]/member/members/[memberId]/page.tsx") && existsSync("src/app/app/sys/[id]/member/members/page.tsx"), "ready + redirect", `nav=${JSON.stringify(navMembers)} redirect=${/redirect\(/.test(oldCustomers)}`);
  const perf = async () => { const t0 = Date.now(); await L.listMembers(ctxO, owner, { q: "ป", tier: "gold", f: { certLevel: "Open Water", diveCount: "1..50" }, tag: "vipqc" }); return Date.now() - t0; };
  const ms = Math.min(await perf(), await perf());
  chk("M1.5-S3.4", "ประสิทธิภาพ: listMembers 5 ตัวกรอง (รวมกำหนดเอง 2) ≤ 800 ms บน seed (§12 ตั้ง 400 ms p95 บน 50,000 — QC ยอม 800 บน Neon ไกล)", ms <= 800, "≤ 800", `${ms} ms`, "MAJOR");

  // ═══ S4 static / testid / ภาพ ═══
  const page = read(PAGE); const page360 = read("src/app/app/sys/[id]/member/members/[memberId]/page.tsx");
  const uiAll = readdirSync("src/components/member").filter((f) => f.endsWith(".tsx")).map((f) => read(`src/components/member/${f}`)).join("\n");
  const T1 = ["members-page", "members-kpi", "members-filter", "members-table", "members-row-", "members-bulk", "members-views", "members-export"];
  chk("M1.5-S4.1", "หน้ารวม page.tsx: requireTenant · canReadMember (ไม่มี = notFound) · listMembers + getMemberKpis + listSavedViews จาก URL state (?q=&tier=&unit=&tag=&f.{key}=&view=&sort=&page=) · testid ครบ 8 · ตัวกรองฟิลด์ filterable วนจาก layout (ไม่ฮาร์ดโค้ด certLevel) · ไม่มีอีโมจิ · MemberTabs + PageHeader", /requireTenant/.test(page) && /canReadMember/.test(page) && /notFound/.test(page) && /listMembers/.test(page) && /getMemberKpis/.test(page) && /listSavedViews/.test(page) && /searchParams/.test(page) && T1.every((t) => (page + uiAll).includes(t)) && !/certLevel/.test(stripComments(page + uiAll)) && !EMOJI.test(stripComments(uiAll)) && /MemberTabs/.test(page) && /PageHeader/.test(page), "ครบ", `missing=${T1.filter((t) => !(page + uiAll).includes(t)).join(",")} hard=${/certLevel/.test(stripComments(page + uiAll))} emoji=${EMOJI.test(stripComments(uiAll))}`);
  const T2 = ["member-360", "member-360-header", "member-360-tabs", "member-360-section-", "member-360-side", "member-360-section-hidden", "member-360-stats"];
  chk("M1.5-S4.2", "หน้า 360 [memberId]/page.tsx: getMember360 (404 เมื่อ throw ไม่พบ) · แท็บ 5 (profile/wallet/history/reviews/referrals — แท็บอื่นเป็น placeholder 'เร็ว ๆ นี้') · ส่วนอ่อนไหวที่ซ่อน render testid member-360-section-hidden + คำว่า 'ซ่อน' (ไม่ render ค่า) · แถบขวา AI(stub)/การเชื่อมต่อ/PDPA/ระดับถัดไป · testid ครบ 7", /getMember360/.test(page360) && /notFound/.test(page360) && T2.every((t) => (page360 + uiAll).includes(t)) && /ซ่อน/.test(uiAll) && /wallet|history|reviews|referrals/.test(page360 + uiAll) && /เร็ว ๆ นี้/.test(uiAll) && /PDPA|ความเป็นส่วนตัว/.test(uiAll) && /ระดับถัดไป/.test(uiAll), "ครบ", `missing=${T2.filter((t) => !(page360 + uiAll).includes(t)).join(",")}`);
  const dir = `${mq.MQC.shotsDir}/1.5`;
  const shots = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".png")) : [];
  const sum = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sum(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  chk("M1.5-S4.3", "ภาพ owner: members-home-owner (desktop+mobile) · member-360-owner (desktop+mobile) · HTTP 200 · testid ครบ · ไม่มี console error", ["members-home-owner-desktop.png", "members-home-owner-mobile.png", "member-360-owner-desktop.png", "member-360-owner-mobile.png"].every((f) => shots.includes(f)) && ["members-home-owner", "member-360-owner"].every((n) => ["desktop", "mobile"].every((d) => r("owner", n, d)?.status === 200 && r("owner", n, d)?.missing?.length === 0 && r("owner", n, d)?.errors?.length === 0)), "4 ใบ · 200", `shots=${shots.join(",")}`, "MAJOR");
  chk("M1.5-S4.4", "ภาพ thana: members-home-thana 200 (เห็นเฉพาะสาขาป่าตอง) · member-360-thana 200 + มี [data-testid=member-360-section-hidden] (ส่วนสุขภาพ 'ซ่อน') · noperm → 404", r("thana", "members-home-thana", "desktop")?.status === 200 && r("thana", "member-360-thana", "desktop")?.status === 200 && r("thana", "member-360-thana", "desktop")?.missing?.length === 0 && r("noperm", "members-home-noperm", "desktop")?.status === 404, "200/200/404", `${r("thana", "members-home-thana", "desktop")?.status}/${r("thana", "member-360-thana", "desktop")?.status}/${r("noperm", "members-home-noperm", "desktop")?.status}`, "MAJOR");
  chk("M1.5-S4.5", "🔴 parity ภาพ 01 + 02 — Fable ตรวจด้วยตา · wo-notes/member-M1.5.md มี 'PARITY: ผ่าน'", /PARITY:\s*ผ่าน/.test(read("ledger/wo-notes/member-M1.5.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M1.5-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  for (const id of made.views) await d(() => P.memberSavedView.delete({ where: { id } }));
  await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, action: { in: ["member.bulk.tags", "member.export"] } } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M1.5: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
