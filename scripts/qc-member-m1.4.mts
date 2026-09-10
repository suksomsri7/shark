// QC — ระบบสมาชิก v2 WO M1.4: profile service (create/update/360/duplicates/merge) + policy อ่อนไหว (D8+D17) + access log + linkIdentity (D18)
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M1.4 · พิมพ์เขียว §5.2 §6.1–6.4 §11.1 §11.8
// requires: member-seed
//
// สัญญาฟังก์ชัน (src/lib/modules/member/profile.ts · privacy.ts (ส่วน canView/logAccess) · index.ts facade)
//   ctx = { tenantId, systemId, actorUserId: string|null } · actor = { userId, role: OWNER|MANAGER|STAFF|CUSTOMER, unitAccess: string[], permissions: Record<string, unknown>, apiRole?: "READONLY"|"OPERATE"|"ADMIN", customerId? }
//   createMember(ctx, actor, { phone?, email?, firstName?, lastName?, name?, nickname?, birthDate?, gender?, fields?, consents?: [{channel, granted, source?}], source, sourceDetail?, sourceChannel?, referralCode?, homeUnitId?, tags?, idempotencyKey? })
//     → { created: boolean, customerId, memberCode, partyId, duplicate?: MemberBrief }  (ซ้ำเบอร์/อีเมลในระบบเดียวกัน = created false + duplicate · ไม่สร้างแถวใหม่)
//   updateMember(ctx, actor, id, { fields?, tags?, status?, ownerUserId?, homeUnitId? }) → MemberBrief · setStatus(ctx, actor, id, status, reason?) · setOwner(ctx, actor, id, userId|null) · setTags(ctx, actor, id, {add[], remove[]})
//   getMember360(ctx, actor, id) → { profile, sections[{key,label,sensitive,visible,fields[{key,label,type,value,display}]}], stats, tier{current,next}, identities[], consents[], attribution{first,last}, connections{chat,crm,account,kanbanCards}, mergedIntoId? }
//     ส่วนอ่อนไหวที่ดูไม่ได้ = visible false + fields [] (ค่าไม่ส่งลง client) · ดูได้ + logAccess → MemberAccessLog + event member.sensitive.viewed
//   linkIdentity(ctx, { channel, externalId, phone?, email?, displayName?, contactId?, verified? }) → { customerId: string|null, matchedBy: "PHONE"|"EMAIL"|"CHANNEL_ID"|null, identityId?: string, candidates: MemberBrief[] }
//     กติกาตายตัว เบอร์ → อีเมล → id เคยผูก → ไม่ตรง = candidates (ชื่อคล้าย) · externalId เป็นของคนอื่นแต่เบอร์ชี้อีกคน → throw CONFLICT + PartyMergeCandidate
//   listIdentities(ctx, customerId) · unlinkIdentity(ctx, actor, identityId) (MANAGER+)
//   findDuplicates(ctx, actor, { status? }) → [{ id, a: MemberBrief, b: MemberBrief, reason, score }] · dismissDuplicate(ctx, actor, pairId) · mergeMembers(ctx, actor, { keepId, mergeId, fieldChoices?, confirm: "MERGE" }) → { keptId } | { pending: true, approvalRequestId }
//     MANAGER → approval.submitForApproval({ entityType: "member.merge", entityId: `${keepId}:${mergeId}`, systemId }) · ไม่มีนโยบาย = autoApproved → รวมทันที · effect เมื่ออนุมัติอยู่ที่ src/lib/approval-effects.ts (composition root) เรียก member facade · fitness เพิ่มเส้น member→approval
//   briefFor(ctx, actor, customerIds[]) → MemberBrief[] (กรอง unit scope · phoneMasked) · privacy.canViewSensitive(ctx, actor, { targetType, targetId, customerId }) → boolean
//   migration `member_v2_b` (ใบนี้): Customer.phone2/facebook String? · MemberLookupTarget + USER · backfill-fields ตั้ง ownerUserId target USER (idempotent) · SYSTEM_FIELD_TARGETS ใน fields.ts เพิ่ม phone2/facebook
//   ข้อผิดพลาด: ไม่มีสิทธิ์ = ForbiddenError/ข้อความไทย · มองไม่เห็น (unit scope) = throw ที่ message มี "ไม่พบ" (404-not-403) · CONFLICT = error.code === "CONFLICT" หรือ message มี "ซ้ำ"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/member/profile.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/member/profile.ts)");
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
const notFoundish = (e: Error | null) => !!e && (/ไม่พบ/.test(e.message) || (e as Any).code === "NOT_FOUND" || /NotFound/.test(e.name));
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const P = prisma as Any;
let tid = ""; let SYS = "";
const tag = Date.now().toString(36);
const num = String(Date.now() % 1_000_000).padStart(6, "0");
const made = { approvalPolicies: [] as string[], customers: [] as string[], identities: [] as string[], policies: [] as string[], activities: [] as string[], candidates: [] as string[], contacts: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const PV = (await import("@/lib/modules/member/privacy" as string)) as Record<string, (...a: Any[]) => Any>;
  const M = (await import("@/lib/modules/member" as string)) as Record<string, (...a: Any[]) => Any>;
  const actorOf = async (userId: string, over: Record<string, unknown> = {}) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role as string, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown>, ...over }; };
  const U = { owner: E.users.owner.userId as string, manager: E.users.manager.userId as string, thana: E.users.staff.thana.userId as string, nurse: E.users.staff.nurse.userId as string, kata: E.users.staff.kata.userId as string, pook: E.users.staff.pook.userId as string, noPerm: E.users.noPerm.userId as string };
  const owner = await actorOf(U.owner); const manager = await actorOf(U.manager); const thana = await actorOf(U.thana); const nurse = await actorOf(U.nurse); const kata = await actorOf(U.kata); const noPerm = await actorOf(U.noPerm);
  const ctxOf = (userId: string | null) => ({ tenantId: tid, systemId: SYS, actorUserId: userId });
  const ctxO = ctxOf(U.owner); const ctxT = ctxOf(U.thana); const ctxN = ctxOf(U.nurse); const ctxK = ctxOf(U.kata); const ctxM = ctxOf(U.manager);
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const units = E.units as Record<string, string>;
  const healthSec = await P.memberSection.findFirst({ where: { systemId: SYS, key: "health" } });
  const outbox = (type: string, pred: (p: Any) => boolean) => P.outboxEvent.findMany({ where: { tenantId: tid, type }, orderBy: { createdAt: "desc" }, take: 20 }).then((rows: Any[]) => rows.find((r) => pred(r.payload)));
  // สมาชิกที่มองเห็นได้เฉพาะสาขาตน (ไม่มีกิจกรรมข้ามสาขา) — เลือกจาก DB จริง ไม่เดาจาก index
  const pOnly = (await prisma.customer.findFirst({ where: { memberSystemId: SYS, homeUnitId: units.patong, status: "ACTIVE" as Any, activities: { none: { unitId: units.kata } } } as Any, orderBy: { memberCode: "asc" } }))!;
  const kOnly = (await prisma.customer.findFirst({ where: { memberSystemId: SYS, homeUnitId: units.kata, status: "ACTIVE" as Any, activities: { none: { unitId: units.patong } } } as Any, orderBy: { memberCode: "desc" } }))!;

  // ═══ S0.0 migration member_v2_b (หนี้จาก M1.2): phone2/facebook + MemberLookupTarget.USER ═══
  const custCols = new Set(((await prisma.$queryRawUnsafe(`select column_name from information_schema.columns where table_name='Customer'`)) as { column_name: string }[]).map((c) => c.column_name));
  const lookupVals = ((await prisma.$queryRawUnsafe(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='MemberLookupTarget'`)) as { enumlabel: string }[]).map((e) => e.enumlabel);
  const migB = existsSync("prisma/migrations") ? readdirSync("prisma/migrations").find((d) => /_member_v2_b$/.test(d)) : undefined;
  const appliedB = migB ? await prisma.$queryRawUnsafe(`select 1 from "_prisma_migrations" where migration_name='${migB}' and finished_at is not null`) as unknown[] : [];
  const ownerField = await P.memberField.findFirst({ where: { systemId: SYS, systemKey: "ownerUserId" } });
  const FX = (await import("@/lib/modules/member/fields" as string)) as Any;
  const okP2 = await fails(() => FX.setFieldValues(ctxO, m(3).id, { phone2: "0866666666", facebook: "fb.com/qc" }, { via: "STAFF" }));
  const c3p = (await prisma.customer.findUnique({ where: { id: m(3).id } })) as Any;
  restore.push(() => prisma.customer.update({ where: { id: m(3).id }, data: { phone2: null, facebook: null } as Any }));
  chk("M1.4-S0.0", "migration `member_v2_b` (additive · applied บน QC): Customer.phone2 + Customer.facebook · enum MemberLookupTarget เพิ่ม USER · ฟิลด์ระบบ ownerUserId เปลี่ยน options.target = USER (backfill-fields idempotent ปรับให้) · setFieldValues(phone2/facebook) เขียนคอลัมน์ได้แล้ว", custCols.has("phone2") && custCols.has("facebook") && lookupVals.includes("USER") && !!migB && appliedB.length === 1 && ownerField?.options?.target === "USER" && okP2 === null && c3p.phone2 === "0866666666" && c3p.facebook === "fb.com/qc", "ครบ", `cols=${custCols.has("phone2")}/${custCols.has("facebook")} enum=${lookupVals.join(",")} mig=${migB}/${appliedB.length} owner=${ownerField?.options?.target} set=${okP2?.message ?? "ok"}`);

  // ═══ S0 linkIdentity (D18) ═══
  const l1 = await PR.linkIdentity(ctxO, { channel: "WHATSAPP", externalId: `wa-${tag}-1`, phone: m(7).phone, displayName: "ลูกค้า WA" });
  if (l1?.identityId) made.identities.push(l1.identityId);
  const idRow = await P.memberChannelIdentity.findFirst({ where: { tenantId: tid, channel: "WHATSAPP", externalId: `wa-${tag}-1` } });
  const evLink = await outbox("member.identity.linked", (p) => p.customerId === m(7).id && p.channel === "WHATSAPP");
  chk("M1.4-S0.1", "linkIdentity เบอร์ตรง → {customerId = สมาชิก 7, matchedBy PHONE, identityId} · แถว MemberChannelIdentity {channel WHATSAPP · externalId · displayName · linkedBy PHONE · verified false · linkedAt} · event member.identity.linked {customerId, channel, externalId, method}", l1?.customerId === m(7).id && l1.matchedBy === "PHONE" && !!l1.identityId && idRow?.customerId === m(7).id && idRow.linkedBy === "PHONE" && idRow.verified === false && !!idRow.linkedAt && idRow.displayName === "ลูกค้า WA" && !!evLink, "PHONE", JSON.stringify({ l1, row: idRow && [idRow.linkedBy, idRow.verified], ev: !!evLink }).slice(0, 200));
  const l2 = await PR.linkIdentity(ctxO, { channel: "MESSENGER", externalId: `fb-${tag}-2`, email: m(8).email, phone: "0800000000" });
  if (l2?.identityId) made.identities.push(l2.identityId);
  chk("M1.4-S0.2", "เบอร์ไม่ตรงแต่อีเมลตรง → สมาชิก 8 · matchedBy EMAIL · linkedBy EMAIL", l2?.customerId === m(8).id && l2.matchedBy === "EMAIL" && ((await P.memberChannelIdentity.findUnique({ where: { id: l2.identityId } }))).linkedBy === "EMAIL", "EMAIL", JSON.stringify(l2).slice(0, 160));
  const before = await P.memberChannelIdentity.findUnique({ where: { id: l1.identityId } });
  await new Promise((r) => setTimeout(r, 30));
  const l3 = await PR.linkIdentity(ctxO, { channel: "WHATSAPP", externalId: `wa-${tag}-1` });
  const after = await P.memberChannelIdentity.findUnique({ where: { id: l1.identityId } });
  chk("M1.4-S0.3", "externalId ที่เคยผูกแล้ว (ไม่ส่งเบอร์/อีเมล) → matchedBy CHANNEL_ID · ไม่สร้างแถวใหม่ (identityId เดิม) · lastSeenAt ขยับ", l3?.customerId === m(7).id && l3.matchedBy === "CHANNEL_ID" && l3.identityId === l1.identityId && (await P.memberChannelIdentity.count({ where: { tenantId: tid, channel: "WHATSAPP", externalId: `wa-${tag}-1` } })) === 1 && new Date(after.lastSeenAt ?? 0).getTime() > new Date(before.lastSeenAt ?? 0).getTime(), "CHANNEL_ID · แถวเดิม", JSON.stringify({ l3, n: await P.memberChannelIdentity.count({ where: { tenantId: tid, channel: "WHATSAPP", externalId: `wa-${tag}-1` } }) }).slice(0, 160));
  const c9 = await prisma.customer.findUnique({ where: { id: m(9).id } }) as Any;
  const l4 = await PR.linkIdentity(ctxO, { channel: "FACEBOOK", externalId: `fb-${tag}-4`, displayName: c9.firstName ?? c9.name ?? "", phone: "0855555555" });
  chk("M1.4-S0.4", "ไม่ตรงอะไรเลย → customerId null · matchedBy null · candidates = สมาชิกชื่อคล้าย (มีสมาชิก 9) ≤ 5 · **ไม่สร้าง** identity", l4?.customerId === null && l4.matchedBy === null && Array.isArray(l4.candidates) && l4.candidates.some((c: Any) => c.id === m(9).id) && l4.candidates.length <= 5 && (await P.memberChannelIdentity.count({ where: { tenantId: tid, externalId: `fb-${tag}-4` } })) === 0, "candidates", JSON.stringify({ cid: l4?.customerId, n: l4?.candidates?.length, has9: l4?.candidates?.some((c: Any) => c.id === m(9).id) }));
  const eConf = await fails(() => PR.linkIdentity(ctxO, { channel: "WHATSAPP", externalId: `wa-${tag}-1`, phone: m(10).phone }));
  const cand = await prisma.partyMergeCandidate.findFirst({ where: { tenantId: tid, OR: [{ partyAId: m(7).partyId, partyBId: m(10).partyId }, { partyAId: m(10).partyId, partyBId: m(7).partyId }] } });
  if (cand) made.candidates.push(cand.id);
  chk("M1.4-S0.5", "🔴 CONFLICT: externalId ผูกกับสมาชิก 7 แต่เบอร์ชี้สมาชิก 10 → throw (code CONFLICT / ข้อความไทยมี 'ซ้ำ'/'ขัดแย้ง') · สร้าง PartyMergeCandidate (party 7 ↔ party 10 · reason PHONE · OPEN) · identity เดิมไม่เปลี่ยน", !!eConf && ((eConf as Any).code === "CONFLICT" || /ซ้ำ|ขัดแย้ง|คนละคน/.test(eConf.message)) && thai(eConf) && !!cand && cand.status === "OPEN" && ((await P.memberChannelIdentity.findUnique({ where: { id: l1.identityId } }))).customerId === m(7).id, "throw + candidate", `e=${eConf?.message?.slice(0, 80)} cand=${!!cand}`);
  const eUnlinkStaff = await fails(() => PR.unlinkIdentity(ctxT, thana, l2.identityId));
  const okUnlink = await fails(() => PR.unlinkIdentity(ctxM, manager, l2.identityId));
  const eBadChan = await fails(() => PR.linkIdentity(ctxO, { channel: "TELEGRAM", externalId: "x", phone: m(7).phone }));
  const li7 = await PR.listIdentities(ctxO, m(7).id);
  chk("M1.4-S0.6", "unlinkIdentity: STAFF → throw · MANAGER → ลบแถว · listIdentities(7) มี LINE (seed) + WHATSAPP · channel นอกทะเบียน (TELEGRAM) → throw ไทย (D19)", thai(eUnlinkStaff) && okUnlink === null && (await P.memberChannelIdentity.count({ where: { id: l2.identityId } })) === 0 && Array.isArray(li7) && li7.some((i: Any) => i.channel === "LINE") && li7.some((i: Any) => i.channel === "WHATSAPP") && thai(eBadChan), "ครบ", `staff=${!!eUnlinkStaff} mgr=${okUnlink?.message ?? "ok"} list=${li7?.map((i: Any) => i.channel).join(",")} bad=${!!eBadChan}`);

  // ═══ S1 createMember ═══
  const inNew = { phone: `0899${num}`, email: `new-${tag}@example.com`, firstName: "ปิยะ", lastName: "ทดสอบสร้าง", nickname: "ปี", birthDate: "1992-05-20", gender: "MALE", fields: { certLevel: "Open Water", diveCount: 3 }, consents: [{ channel: "LINE", granted: true }, { channel: "SMS", granted: false }], source: "LIFF", sourceDetail: { linkCode: "qc-link", note: "จาก QR" }, homeUnitId: units.patong, tags: ["vip"], idempotencyKey: `qc14-create-${tag}` };
  const r1 = await PR.createMember(ctxO, owner, inNew);
  if (r1?.customerId) made.customers.push(r1.customerId);
  const c1 = (await prisma.customer.findUnique({ where: { id: r1?.customerId ?? "x" } })) as Any;
  const party1 = c1?.partyId ? await prisma.party.findUnique({ where: { id: c1.partyId } }) : null;
  chk("M1.4-S1.1", "createMember → {created true, customerId, memberCode (ไม่ว่าง · unique ต่อระบบ), partyId} · Customer {name 'ปิยะ ทดสอบสร้าง' firstName lastName nickname birthDate gender phone email status ACTIVE homeUnitId source LIFF sourceDetail tags ['vip'] referralCode ไม่ว่าง} · Party phoneNorm ตรงเบอร์", r1?.created === true && !!c1 && /^[A-Z0-9-]{4,16}$/.test(r1.memberCode) && c1.memberCode === r1.memberCode && c1.name === "ปิยะ ทดสอบสร้าง" && c1.firstName === "ปิยะ" && c1.nickname === "ปี" && c1.gender === "MALE" && c1.birthDate && new Date(c1.birthDate).toISOString().startsWith("1992-05-20") && c1.phone === inNew.phone && c1.email === inNew.email && c1.status === "ACTIVE" && c1.homeUnitId === units.patong && c1.source === "LIFF" && (c1.sourceDetail as Any)?.note === "จาก QR" && JSON.stringify(c1.tags) === JSON.stringify(["vip"]) && !!c1.referralCode && !!party1 && (party1 as Any).phoneNorm === inNew.phone, "ครบ", JSON.stringify({ r1, c1: c1 && { name: c1.name, status: c1.status, source: c1.source, tags: c1.tags, ref: !!c1.referralCode }, party: !!party1 }).slice(0, 260));
  const attrs: Any[] = c1 ? await P.memberAttribution.findMany({ where: { customerId: c1.id } }) : [];
  const cons: Any[] = c1 ? await P.memberConsent.findMany({ where: { customerId: c1.id } }) : [];
  const fv = c1 ? await (await import("@/lib/modules/member/fields" as string) as Any).getFieldValues(ctxO, [c1.id]) : {};
  const defTier = await P.memberTierDef.findFirst({ where: { systemId: SYS, isDefault: true } });
  chk("M1.4-S1.2", "แถวประกอบ: MemberAttribution FIRST+LAST (source LIFF · unitId patong) · MemberConsent LINE granted true + SMS false (source SIGNUP_FORM/LIFF · policyVersion?) · Customer.marketingConsent = true (sync legacy §4.5) · tierDefId = default + tierSince + TierHistory INITIAL · ค่าฟิลด์ certLevel/diveCount เขียนผ่าน fields engine", attrs.length === 2 && attrs.every((a) => a.source === "LIFF" && a.unitId === units.patong) && attrs.some((a) => a.touch === "FIRST") && attrs.some((a) => a.touch === "LAST") && cons.length === 2 && cons.find((c) => c.channel === "LINE")?.granted === true && cons.find((c) => c.channel === "SMS")?.granted === false && ["SIGNUP_FORM", "LIFF"].includes(cons[0]!.source) && c1?.marketingConsent === true && c1.tierDefId === defTier?.id && !!c1.tierSince && (await P.memberTierHistory.count({ where: { customerId: c1.id, reason: "INITIAL" } })) === 1 && fv?.[c1.id]?.certLevel === "Open Water" && fv[c1.id].diveCount === 3, "ครบ", JSON.stringify({ attrs: attrs.map((a) => [a.touch, a.source]), cons: cons.map((c) => [c.channel, c.granted, c.source]), mk: c1?.marketingConsent, tier: c1?.tierDefId === defTier?.id, fv: fv?.[c1?.id] }).slice(0, 260));
  const r2 = await PR.createMember(ctxO, owner, { phone: inNew.phone, firstName: "ซ้ำ", source: "POS" });
  const r3 = await PR.createMember(ctxO, owner, { email: inNew.email.toUpperCase(), firstName: "ซ้ำอีเมล", source: "POS" });
  chk("M1.4-S1.3", "ซ้ำเบอร์ → {created false, customerId = คนเดิม, duplicate: MemberBrief{id, memberCode, name}} ไม่สร้างแถว · ซ้ำอีเมล (ตัวพิมพ์ต่าง) → เหมือนกัน", r2?.created === false && r2.customerId === c1.id && r2.duplicate?.id === c1.id && !!r2.duplicate.memberCode && r3?.created === false && r3.customerId === c1.id && (await prisma.customer.count({ where: { memberSystemId: SYS, phone: inNew.phone } })) === 1, "ซ้ำ = คนเดิม", JSON.stringify({ r2, r3 }).slice(0, 200));
  const evCreated = await outbox("member.created", (p) => p.customerId === c1?.id);
  const act = c1 ? await prisma.memberActivity.findFirst({ where: { customerId: c1.id, module: "member" } }) : null;
  const audit = c1 ? await prisma.auditLog.findFirst({ where: { tenantId: tid, targetId: c1.id, action: { contains: "member" } } }) : null;
  chk("M1.4-S1.4", "event member.created {customerId, partyId, source, referrerId?} (outbox) · MemberActivity module 'member' (สมัคร · unitId) · AuditLog action member.* targetId=customerId actorId=owner", !!evCreated && evCreated.payload.partyId === c1.partyId && evCreated.payload.source === "LIFF" && !!act && act.unitId === units.patong && !!audit && audit.actorId === U.owner, "ครบ", `ev=${!!evCreated} act=${!!act} audit=${!!audit}`);
  const eNone = await fails(() => PR.createMember(ctxO, owner, { firstName: "ไม่มีช่องทาง", source: "POS" }));
  const ePhone = await fails(() => PR.createMember(ctxO, owner, { phone: "12", firstName: "เบอร์ผิด", source: "POS" }));
  const eChan = await fails(() => PR.createMember(ctxO, owner, { phone: "0899000777", firstName: "x", source: "POS", consents: [{ channel: "TELEGRAM", granted: true }] }));
  const eSrc = await fails(() => PR.createMember(ctxO, owner, { phone: "0899000778", firstName: "x", source: "MOON" }));
  const eField = await fails(() => PR.createMember(ctxO, owner, { phone: "0899000779", firstName: "x", source: "POS", fields: { certLevel: "ไม่มีในตัวเลือก" } }));
  chk("M1.4-S1.5", "validate: ไม่มีเบอร์/อีเมล/identity → throw ไทย · เบอร์ '12' → throw · consent channel นอกทะเบียน → throw · source นอก enum → throw · ค่าฟิลด์ผิด → throw (ไม่สร้างแถวค้าง — ทั้งหมดใน tx)", thai(eNone) && thai(ePhone) && thai(eChan) && !!eSrc && thai(eField) && (await prisma.customer.count({ where: { memberSystemId: SYS, phone: { in: ["0899000777", "0899000778", "0899000779"] } } })) === 0, "throw 5 · ไม่มีแถวค้าง", `${[eNone, ePhone, eChan, eSrc, eField].map((e) => !!e).join("/")} leftover=${await prisma.customer.count({ where: { memberSystemId: SYS, phone: { in: ["0899000777", "0899000778", "0899000779"] } } })}`);
  const rT = await PR.createMember(ctxT, thana, { phone: `0898${num}`, firstName: "ธนาสร้าง", source: "POS", homeUnitId: units.patong });
  if (rT?.customerId) made.customers.push(rT.customerId);
  const eNoPerm = await fails(() => PR.createMember(ctxOf(U.noPerm), noPerm, { phone: "0899000780", firstName: "x", source: "POS" }));
  const eKataUnit = await fails(() => PR.createMember(ctxK, kata, { phone: "0899000781", firstName: "x", source: "POS", homeUnitId: units.patong }));
  const cT = rT?.customerId ? await prisma.customer.findUnique({ where: { id: rT.customerId } }) as Any : null;
  chk("M1.4-S1.6", "สิทธิ์: thana (STAFF member.customer.create) สร้างได้ · sourceDetail.staffUserId = thana · STAFF ไม่มีคีย์ member.* → throw · STAFF สาขากะตะ ตั้ง homeUnitId ป่าตอง → throw (unit scope)", rT?.created === true && (cT?.sourceDetail as Any)?.staffUserId === U.thana && thai(eNoPerm) && thai(eKataUnit), "ครบ", `thana=${rT?.created} staff=${(cT?.sourceDetail as Any)?.staffUserId === U.thana} noperm=${!!eNoPerm} kata=${!!eKataUnit}`);
  const rIdem = await PR.createMember(ctxO, owner, { ...inNew, phone: "0899000790", email: undefined, idempotencyKey: `qc14-idem-${tag}` });
  const rIdem2 = await PR.createMember(ctxO, owner, { ...inNew, phone: "0899000790", email: undefined, idempotencyKey: `qc14-idem-${tag}` });
  if (rIdem?.customerId) made.customers.push(rIdem.customerId);
  chk("M1.4-S1.7", "idempotencyKey เดิม 2 ครั้ง → customerId เดียว · แถวเดียว · ครั้งที่ 2 created false", rIdem?.created === true && rIdem2?.customerId === rIdem.customerId && rIdem2.created === false && (await prisma.customer.count({ where: { memberSystemId: SYS, phone: "0899000790" } })) === 1, "1 แถว", JSON.stringify({ rIdem, rIdem2 }).slice(0, 160));
  const refCode = ((await prisma.customer.findUnique({ where: { id: m(1).id } })) as Any).referralCode as string;
  const rRef = await PR.createMember(ctxO, owner, { phone: "0899000791", firstName: "เพื่อนแนะนำ", source: "LIFF", referralCode: refCode });
  if (rRef?.customerId) made.customers.push(rRef.customerId);
  const cRef = rRef?.customerId ? await prisma.customer.findUnique({ where: { id: rRef.customerId } }) as Any : null;
  const evRef = await outbox("member.created", (p) => p.customerId === rRef?.customerId);
  const eSelfRef = await fails(() => PR.createMember(ctxO, owner, { phone: m(1).phone, firstName: "x", source: "LIFF", referralCode: refCode }));
  chk("M1.4-S1.8", "referralCode ของสมาชิก 1 → referredById = สมาชิก 1 · source REFERRAL (ทับ LIFF) · sourceDetail.referrerCustomerId · event payload referrerId · สมาชิกใหม่มี referralCode ของตัวเอง (ไม่ซ้ำ) · โค้ดไม่มีจริง → throw ไทย", cRef?.referredById === m(1).id && cRef.source === "REFERRAL" && (cRef.sourceDetail as Any)?.referrerCustomerId === m(1).id && evRef?.payload?.referrerId === m(1).id && !!cRef.referralCode && cRef.referralCode !== refCode && thai(await fails(() => PR.createMember(ctxO, owner, { phone: "0899000792", firstName: "x", source: "LIFF", referralCode: "NOPE-0000" }))) && (eSelfRef === null || thai(eSelfRef)), "REFERRAL", JSON.stringify({ ref: cRef?.referredById === m(1).id, src: cRef?.source, ev: evRef?.payload?.referrerId === m(1).id }));

  // ═══ S2 updateMember ═══
  const up = await PR.updateMember(ctxO, owner, c1.id, { fields: { nickname: "นิคใหม่", certLevel: "Advanced", diveCount: 12 }, tags: ["vip", "new"] });
  const c1b = (await prisma.customer.findUnique({ where: { id: c1.id } })) as Any;
  const fv2 = await (await import("@/lib/modules/member/fields" as string) as Any).getFieldValues(ctxO, [c1.id]);
  const evUp = await outbox("member.updated", (p) => p.customerId === c1.id);
  chk("M1.4-S2.1", "updateMember(fields{nickname(ระบบ) certLevel diveCount} + tags) → Customer.nickname · ค่าฟิลด์ · tags · คืน MemberBrief · event member.updated {customerId, changedKeys ⊇ [nickname, certLevel, diveCount, tags]} · AuditLog", up?.id === c1.id && c1b.nickname === "นิคใหม่" && fv2[c1.id].certLevel === "Advanced" && fv2[c1.id].diveCount === 12 && JSON.stringify(c1b.tags) === JSON.stringify(["vip", "new"]) && !!evUp && ["nickname", "certLevel", "diveCount"].every((k) => evUp.payload.changedKeys?.includes(k)) && (await prisma.auditLog.count({ where: { tenantId: tid, targetId: c1.id } })) >= 2, "ครบ", JSON.stringify({ nick: c1b.nickname, cert: fv2[c1.id]?.certLevel, tags: c1b.tags, ev: evUp?.payload?.changedKeys }).slice(0, 200));
  const certField = await P.memberField.findUnique({ where: { id: E.fields.dive.certLevel } });
  await P.memberField.update({ where: { id: certField.id }, data: { trackHistory: true } });
  restore.push(() => P.memberField.update({ where: { id: certField.id }, data: { trackHistory: false } }));
  await PR.updateMember(ctxT, thana, c1.id, { fields: { certLevel: "Rescue" } });
  const hist = await P.memberFieldValueHistory.findFirst({ where: { customerId: c1.id, fieldId: certField.id }, orderBy: { createdAt: "desc" } });
  chk("M1.4-S2.2", "trackHistory → MemberFieldValueHistory {old 'Advanced' → new 'Rescue' · changedById thana · changedVia STAFF} · thana (STAFF สาขาป่าตอง) แก้สมาชิกป่าตองได้", hist?.oldValue === "Advanced" && hist.newValue === "Rescue" && hist.changedById === U.thana && hist.changedVia === "STAFF", "history", JSON.stringify(hist && [hist.oldValue, hist.newValue, hist.changedBy, hist.changedVia]));
  const nickField = await P.memberField.findFirst({ where: { systemId: SYS, systemKey: "nickname" } });
  await P.memberField.update({ where: { id: nickField.id }, data: { customerEditable: true } });
  restore.push(() => P.memberField.update({ where: { id: nickField.id }, data: { customerEditable: false } }));
  const custActor = { userId: "", role: "CUSTOMER", unitAccess: [], permissions: {}, customerId: c1.id };
  const okCust = await fails(() => PR.updateMember(ctxOf(null), custActor, c1.id, { fields: { nickname: "ลูกค้าแก้เอง" } }));
  const eCust = await fails(() => PR.updateMember(ctxOf(null), custActor, c1.id, { fields: { certLevel: "Divemaster" } }));
  const eCustOther = await fails(() => PR.updateMember(ctxOf(null), custActor, m(2).id, { fields: { nickname: "แฮก" } }));
  const eCustTags = await fails(() => PR.updateMember(ctxOf(null), custActor, c1.id, { tags: ["vip"] }));
  chk("M1.4-S2.3", "actor CUSTOMER (customerId ตนเอง): แก้ได้เฉพาะฟิลด์ customerEditable (nickname) · certLevel → throw · แก้คนอื่น → throw ไม่พบ/ไม่มีสิทธิ์ · tags/status → throw · history changedVia CUSTOMER_SELF", okCust === null && ((await prisma.customer.findUnique({ where: { id: c1.id } })) as Any).nickname === "ลูกค้าแก้เอง" && thai(eCust) && !!eCustOther && !!eCustTags, "เฉพาะ editable", `ok=${okCust?.message ?? "ok"} cert=${!!eCust} other=${!!eCustOther} tags=${!!eCustTags}`);
  await PR.setStatus(ctxO, owner, c1.id, "SUSPENDED", "ทดสอบระงับ");
  await PR.setOwner(ctxO, owner, c1.id, U.pook);
  await PR.setTags(ctxO, owner, c1.id, { add: ["diver"], remove: ["new"] });
  const c1c = (await prisma.customer.findUnique({ where: { id: c1.id } })) as Any;
  const eBadStatus = await fails(() => PR.setStatus(ctxO, owner, c1.id, "MERGED"));
  const eOwnerGhost = await fails(() => PR.setOwner(ctxO, owner, c1.id, "ไม่มีผู้ใช้"));
  await PR.setStatus(ctxO, owner, c1.id, "ACTIVE");
  chk("M1.4-S2.4", "setStatus(SUSPENDED, reason) → status + activity · setOwner(pook) → ownerUserId (ต้องเป็นสมาชิกร้าน · ไม่มี → throw) · setTags {add, remove} → ['vip','diver'] · ตั้ง MERGED ด้วยมือ → throw (เฉพาะ merge)", c1c.status === "SUSPENDED" && c1c.ownerUserId === U.pook && JSON.stringify(c1c.tags) === JSON.stringify(["vip", "diver"]) && thai(eBadStatus) && thai(eOwnerGhost) && (await prisma.memberActivity.count({ where: { customerId: c1.id, module: "member" } })) >= 2, "ครบ", JSON.stringify({ st: c1c.status, owner: c1c.ownerUserId === U.pook, tags: c1c.tags, bad: !!eBadStatus, ghost: !!eOwnerGhost }));

  // ═══ S3 getMember360 + policy อ่อนไหว (D8 + D17) ═══
  const v1 = await PR.getMember360(ctxO, owner, m(1).id);
  const health = (v: Any) => v?.sections?.find((s: Any) => s.key === "health");
  const dive = (v: Any) => v?.sections?.find((s: Any) => s.key === "dive");
  const condVal = ((await P.memberFieldValue.findFirst({ where: { customerId: m(1).id, fieldId: E.fields.health.conditions } })) as Any)?.valueText as string;
  chk("M1.4-S3.1", "owner: 360 ของสมาชิก 1 → profile {id memberCode name phone tier{key,name}} · sections มี dive (visible · certLevel display 'Open Water'…) + health visible=true มีค่าโรคประจำตัว · stats {spent12mSatang visits12m points lastActivityAt} · identities มี LINE · consents ≥ 3 · attribution.first.source · connections.chat ≥ 1 (seed ห้องแชทเบอร์ตรง 1–6) · tier.next", v1?.profile?.id === m(1).id && v1.profile.memberCode === m(1).memberCode && v1.profile.tier?.key && dive(v1)?.visible === true && dive(v1).fields.some((f: Any) => f.key === "certLevel" && f.value) && health(v1)?.visible === true && health(v1).fields.some((f: Any) => f.key === "conditions" && f.value === condVal) && v1.stats && typeof v1.stats.spent12mSatang === "number" && typeof v1.stats.visits12m === "number" && typeof v1.stats.points === "number" && v1.identities?.some((i: Any) => i.channel === "LINE") && v1.consents?.length >= 3 && v1.attribution?.first?.source && v1.connections?.chat >= 1 && "next" in (v1.tier ?? {}), "ครบ", JSON.stringify({ prof: !!v1?.profile, dive: dive(v1)?.visible, health: health(v1)?.visible, stats: v1?.stats && Object.keys(v1.stats), ids: v1?.identities?.length, cons: v1?.consents?.length, attr: v1?.attribution?.first?.source, chat: v1?.connections?.chat, tier: v1?.tier && Object.keys(v1.tier) }).slice(0, 300));
  const vT = await PR.getMember360(ctxT, thana, m(1).id);
  chk("M1.4-S3.2", "🔴 thana (STAFF · ไม่มี policy): health visible=false · fields [] · JSON ทั้งก้อน**ไม่มี**ค่าโรคประจำตัว (ไม่ส่งลง client) · dive ยังเห็น · ไม่มี AccessLog ของ thana", health(vT)?.visible === false && health(vT).fields.length === 0 && !JSON.stringify(vT).includes(condVal) && dive(vT)?.visible === true && (await P.memberAccessLog.count({ where: { customerId: m(1).id, userId: U.thana } })) === 0, "ซ่อน", JSON.stringify({ visible: health(vT)?.visible, n: health(vT)?.fields?.length, leak: JSON.stringify(vT).includes(condVal) }));
  const vM = await PR.getMember360(ctxM, manager, m(1).id);
  const vN0 = await PR.getMember360(ctxN, nurse, m(1).id);
  chk("M1.4-S3.3", "ค่าปริยาย (ไม่มีแถว policy) = OWNER+MANAGER: manager (ป่าตอง) เห็น health · nurse (STAFF · HR พยาบาล) **ยังไม่เห็น** เพราะยังไม่มี policy ตำแหน่ง · manager ดู → AccessLog {userId manager · targetType SECTION · targetId health} + event member.sensitive.viewed", health(vM)?.visible === true && health(vM).fields.some((f: Any) => f.value === condVal) && health(vN0)?.visible === false && (await P.memberAccessLog.count({ where: { customerId: m(1).id, userId: U.manager, targetType: "SECTION", targetId: healthSec.id } })) >= 1 && !!(await outbox("member.sensitive.viewed", (p) => p.customerId === m(1).id && p.userId === U.manager)), "manager ✓ nurse ✗", JSON.stringify({ mgr: health(vM)?.visible, nurse: health(vN0)?.visible, log: await P.memberAccessLog.count({ where: { customerId: m(1).id, userId: U.manager } }) }));
  const pol = await P.memberSensitivePolicy.create({ data: { tenantId: tid, systemId: SYS, targetType: "SECTION", targetId: healthSec.id, roles: ["OWNER", "MANAGER"], hrPositions: ["พยาบาล"], hrDepartments: [], sameUnitOnly: true, logAccess: true } });
  made.policies.push(pol.id);
  const vN1 = await PR.getMember360(ctxN, nurse, m(1).id);
  const nurseHr = await P.hrEmployee.findFirst({ where: { tenantId: tid, linkedUserId: U.nurse } });
  const logN = await P.memberAccessLog.findFirst({ where: { customerId: m(1).id, userId: U.nurse, targetType: "SECTION", targetId: healthSec.id }, orderBy: { createdAt: "desc" } });
  chk("M1.4-S3.4", "🔴 D17: policy {hrPositions ['พยาบาล'] · sameUnitOnly} → nurse (STAFF · HrEmployee.linkedUserId · position พยาบาล · สาขาป่าตอง) เห็น health ของสมาชิก 1 (ป่าตอง) · AccessLog {hrEmployeeId = HrEmployee พยาบาล · hrPosition 'พยาบาล'} · thana ยังไม่เห็น", health(vN1)?.visible === true && health(vN1).fields.some((f: Any) => f.value === condVal) && !!logN && logN.hrEmployeeId === nurseHr?.id && logN.hrPosition === "พยาบาล" && health(await PR.getMember360(ctxT, thana, m(1).id))?.visible === false, "nurse ✓", JSON.stringify({ visible: health(vN1)?.visible, log: logN && [logN.hrEmployeeId === nurseHr?.id, logN.hrPosition] }));
  const actK = await prisma.memberActivity.create({ data: { tenantId: tid, customerId: m(41).id, unitId: units.patong, module: "pos", type: "VISIT", summary: "ซื้อที่ป่าตอง (QC sameUnit)" } });
  made.activities.push(actK.id);
  const vN41 = await PR.getMember360(ctxN, nurse, m(41).id);
  const eK41 = await fails(() => PR.getMember360(ctxT, thana, kOnly.id));
  chk("M1.4-S3.5", "sameUnitOnly: สมาชิก 41 (บ้านกะตะ · เคยซื้อที่ป่าตอง → nurse มองเห็นโปรไฟล์ได้ตาม §6.1) แต่ health visible=false (homeUnit ไม่อยู่ใน unitAccess) · สมาชิก 60 (กะตะ ไม่เคยมาป่าตอง) → thana 404", vN41?.profile?.id === m(41).id && health(vN41)?.visible === false && notFoundish(eK41), "ซ่อน · 404", JSON.stringify({ seen: vN41?.profile?.id === m(41).id, health: health(vN41)?.visible, e: eK41?.message?.slice(0, 60) }));
  await P.memberSensitivePolicy.update({ where: { id: pol.id }, data: { logAccess: false } });
  const nLog0 = await P.memberAccessLog.count({ where: { customerId: m(1).id, userId: U.nurse } });
  await PR.getMember360(ctxN, nurse, m(1).id);
  const nLog1 = await P.memberAccessLog.count({ where: { customerId: m(1).id, userId: U.nurse } });
  const vApi = await PR.getMember360(ctxO, { ...owner, apiRole: "READONLY" }, m(1).id);
  const canO = await PV.canViewSensitive(ctxO, owner, { targetType: "SECTION", targetId: healthSec.id, customerId: m(1).id });
  const canT = await PV.canViewSensitive(ctxT, thana, { targetType: "SECTION", targetId: healthSec.id, customerId: m(1).id });
  chk("M1.4-S3.6", "logAccess=false → ไม่เขียน AccessLog เพิ่ม · actor apiRole READONLY (คีย์ API) → health ซ่อนเสมอแม้เป็น OWNER (§6.3) · privacy.canViewSensitive(ctx, actor, {targetType, targetId, customerId}) → owner true · thana false", nLog1 === nLog0 && health(vApi)?.visible === false && canO === true && canT === false, "ครบ", `log ${nLog0}→${nLog1} api=${health(vApi)?.visible} can=${canO}/${canT}`);
  const vPook = await PR.getMember360(ctxOf(U.pook), await actorOf(U.pook), c1.id);
  chk("M1.4-S3.7", "360 ของสมาชิกที่สร้างใหม่ (c1): profile.status ACTIVE · ownerUserId pook (+ ownerName) · tags · attribution first/last LIFF · consents 2 · stats.points 0 · connections ทุกคีย์เป็นตัวเลข (chat/crm/account/kanbanCards) · sections ครบทุกส่วนที่ไม่ archive (รวมส่วนระบบ) เรียง sortOrder", vPook?.profile?.status === "ACTIVE" && vPook.profile.ownerUserId === U.pook && Array.isArray(vPook.profile.tags) && vPook.attribution?.first?.source === "LIFF" && vPook.consents?.length === 2 && vPook.stats?.points === 0 && ["chat", "crm", "account", "kanbanCards"].every((k) => typeof vPook.connections?.[k] === "number") && vPook.sections.length >= 5 && vPook.sections.some((s: Any) => s.isSystem), "ครบ", JSON.stringify({ st: vPook?.profile?.status, owner: vPook?.profile?.ownerUserId === U.pook, attr: vPook?.attribution?.first?.source, cons: vPook?.consents?.length, conn: vPook?.connections, n: vPook?.sections?.length }).slice(0, 200));

  // ═══ S4 duplicates / merge ═══
  const rA = await PR.createMember(ctxO, owner, { phone: "0899000801", firstName: "สมชาย", lastName: "ทดสอบรวม", source: "POS", homeUnitId: units.patong });
  const rB = await PR.createMember(ctxO, owner, { email: `somchai-${tag}@example.com`, firstName: "สมชาย", lastName: "ทดสอบรวม", nickname: "ชาย B", source: "IMPORT", homeUnitId: units.patong });
  for (const r of [rA, rB]) if (r?.customerId) made.customers.push(r.customerId);
  const point = (await import("@/lib/modules/point" as string).catch(() => import("@/lib/modules/point/service" as string))) as Any;
  await point.credit({ tenantId: tid, systemId: scope.systems.POINT, customerId: rB.customerId, points: 50, reason: "QC merge", refType: "QC", refId: `qc14-${tag}`, idempotencyKey: `qc14-credit-${tag}` });
  const idB = await PR.linkIdentity(ctxO, { channel: "LINE", externalId: `U-qc14-${tag}`, email: `somchai-${tag}@example.com` });
  if (idB?.identityId) made.identities.push(idB.identityId);
  await P.memberConsent.upsert({ where: { customerId_channel: { customerId: rB.customerId, channel: "EMAIL" } }, create: { tenantId: tid, customerId: rB.customerId, channel: "EMAIL", granted: true, source: "IMPORT", grantedAt: new Date() }, update: { granted: true } });
  const dups: Any[] = await PR.findDuplicates(ctxO, owner, {});
  const pair = dups.find((d) => [d.a?.id, d.b?.id].includes(rA.customerId) && [d.a?.id, d.b?.id].includes(rB.customerId));
  chk("M1.4-S4.1", "findDuplicates(ctx, owner) → คู่ A/B (ชื่อเหมือน · party.findDuplicateCandidates + recordMergeCandidates) [{id, a: MemberBrief, b: MemberBrief, reason NAME_SIMILAR, score}] · STAFF ไม่มี merge → throw", !!pair && pair.reason && typeof pair.score === "number" && pair.a?.memberCode && pair.b?.memberCode && thai(await fails(() => PR.findDuplicates(ctxT, thana, {}))), "มีคู่", JSON.stringify({ n: dups?.length, pair: pair && [pair.reason, pair.score] }));
  // นโยบายอนุมัติของร้าน QC สำหรับ "รวมคน" (entityType member.merge · OWNER อนุมัติ) — ไม่มีนโยบาย = autoApproved ตามกติกาโมดูลอนุมัติ
  const approval = (await import("@/lib/modules/approval/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const apPol = await approval.createPolicy({ tenantId: tid }, { name: "QC M1.4 รวมคน", entityType: "member.merge", steps: [{ order: 1, approverRole: "OWNER" }] });
  made.approvalPolicies.push(apPol.id);
  const eMergeStaff = await fails(() => PR.mergeMembers(ctxT, thana, { keepId: rA.customerId, mergeId: rB.customerId, confirm: "MERGE" }));
  const rMgr = await fails(async () => { const r = await PR.mergeMembers(ctxM, manager, { keepId: rA.customerId, mergeId: rB.customerId, confirm: "MERGE" }); if (!r?.pending || !r.approvalRequestId) throw new Error(`no-approval:${JSON.stringify(r)}`); });
  const eNoConfirm = await fails(() => PR.mergeMembers(ctxO, owner, { keepId: rA.customerId, mergeId: rB.customerId }));
  chk("M1.4-S4.2", "mergeMembers: STAFF → throw · MANAGER → {pending true, approvalRequestId} (approval) หรือ throw ไทย 'อนุมัติ' · ไม่มี confirm:'MERGE' → throw · ยังไม่รวมจริง (B ยัง ACTIVE)", thai(eMergeStaff) && (rMgr === null || /อนุมัติ/.test(rMgr.message)) && thai(eNoConfirm) && ((await prisma.customer.findUnique({ where: { id: rB.customerId } })) as Any).status === "ACTIVE", "ด่าน 3", `staff=${!!eMergeStaff} mgr=${rMgr?.message?.slice(0, 60) ?? "pending"} confirm=${!!eNoConfirm}`);
  const balA0 = await point.getBalance(scope.systems.POINT, rA.customerId);
  const mg = await PR.mergeMembers(ctxO, owner, { keepId: rA.customerId, mergeId: rB.customerId, fieldChoices: { nickname: "B" }, confirm: "MERGE" });
  const A = (await prisma.customer.findUnique({ where: { id: rA.customerId } })) as Any; const B = (await prisma.customer.findUnique({ where: { id: rB.customerId } })) as Any;
  const balA = await point.getBalance(scope.systems.POINT, rA.customerId); const balB = await point.getBalance(scope.systems.POINT, rB.customerId);
  const mergeLedger = await prisma.pointLedger.count({ where: { tenantId: tid, customerId: { in: [rA.customerId, rB.customerId] }, reason: { contains: "MERGE" } } });
  const identB = await P.memberChannelIdentity.findFirst({ where: { externalId: `U-qc14-${tag}` } });
  const consA = await P.memberConsent.findFirst({ where: { customerId: rA.customerId, channel: "EMAIL" } });
  const partyB = B?.partyId ? await prisma.party.findUnique({ where: { id: B.partyId } }) : null;
  const candRow = await prisma.partyMergeCandidate.findFirst({ where: { tenantId: tid, OR: [{ partyAId: A?.partyId, partyBId: B?.partyId }, { partyAId: B?.partyId, partyBId: A?.partyId }] } });
  chk("M1.4-S4.3", "🔴 owner merge {fieldChoices nickname:B}: คืน {keptId A} · B status MERGED + mergedIntoId A · A.nickname = 'ชาย B' · A.email = ของ B (ช่องว่างเติมจาก B) · แต้ม: A +50 · B 0 · ledger reason MERGE 2 แถว · identity LINE ของ B → customerId A · consent EMAIL ของ B → A · Party B mergedIntoId = Party A · PartyMergeCandidate → MERGED · MemberActivity ของ A มีรายการ MERGE", mg?.keptId === rA.customerId && B.status === "MERGED" && B.mergedIntoId === rA.customerId && A.nickname === "ชาย B" && A.email === `somchai-${tag}@example.com` && balA === balA0 + 50 && balB === 0 && mergeLedger >= 2 && identB?.customerId === rA.customerId && consA?.granted === true && (partyB as Any)?.mergedIntoId === A.partyId && (candRow?.status === "MERGED" || !candRow) && (await prisma.memberActivity.count({ where: { customerId: rA.customerId, module: "member", type: { contains: "MERGE" } } })) >= 1, "รวมครบ", JSON.stringify({ kept: mg?.keptId === rA.customerId, st: B?.status, into: B?.mergedIntoId === rA.customerId, nick: A?.nickname, email: A?.email === `somchai-${tag}@example.com`, bal: [balA0, balA, balB], ledger: mergeLedger, ident: identB?.customerId === rA.customerId, cons: consA?.granted, party: (partyB as Any)?.mergedIntoId === A?.partyId, cand: candRow?.status, actA: await prisma.memberActivity.count({ where: { customerId: rA.customerId, module: "member", type: { contains: "MERGE" } } }) }).slice(0, 320));
  const evMerged = await outbox("member.merged", (p) => p.keepId === rA.customerId && p.mergedId === rB.customerId);
  const eAgain = await fails(() => PR.mergeMembers(ctxO, owner, { keepId: rA.customerId, mergeId: rB.customerId, confirm: "MERGE" }));
  const vB = await fails(async () => { const v = await PR.getMember360(ctxO, owner, rB.customerId); if (v?.mergedIntoId !== rA.customerId) throw new Error(`no mergedIntoId: ${JSON.stringify(v?.profile?.status)}`); });
  const eSelf = await fails(() => PR.mergeMembers(ctxO, owner, { keepId: rA.customerId, mergeId: rA.customerId, confirm: "MERGE" }));
  chk("M1.4-S4.4", "event member.merged {keepId, mergedId} · รวมซ้ำคู่เดิม → throw ไทย · 360 ของ B → {mergedIntoId: A} (ชี้ไปคนที่เก็บไว้) · รวมตัวเอง → throw · A ยังหาเจอด้วยเบอร์ของ A และอีเมลของ B (createMember ซ้ำอีเมล B → duplicate = A)", !!evMerged && thai(eAgain) && vB === null && thai(eSelf) && (await PR.createMember(ctxO, owner, { email: `somchai-${tag}@example.com`, firstName: "x", source: "POS" }))?.customerId === rA.customerId, "ครบ", `ev=${!!evMerged} again=${!!eAgain} vB=${vB?.message ?? "ok"} self=${!!eSelf}`);
  const rC = await PR.createMember(ctxO, owner, { phone: "0899000802", firstName: "สมหญิง", lastName: "ทดสอบไม่รวม", source: "POS" });
  const rD = await PR.createMember(ctxO, owner, { phone: "0899000803", firstName: "สมหญิง", lastName: "ทดสอบไม่รวม", source: "POS" });
  for (const r of [rC, rD]) if (r?.customerId) made.customers.push(r.customerId);
  const dups2: Any[] = await PR.findDuplicates(ctxO, owner, {});
  const pairCD = dups2.find((d) => [d.a?.id, d.b?.id].includes(rC.customerId) && [d.a?.id, d.b?.id].includes(rD.customerId));
  if (pairCD) await PR.dismissDuplicate(ctxO, owner, pairCD.id);
  const dups3: Any[] = await PR.findDuplicates(ctxO, owner, {});
  chk("M1.4-S4.5", "dismissDuplicate(pairId) → คู่ C/D หายจาก findDuplicates (PartyMergeCandidate DISMISSED) · findDuplicates({status:'DISMISSED'}) ยังเห็น", !!pairCD && !dups3.some((d) => d.id === pairCD.id) && ((await PR.findDuplicates(ctxO, owner, { status: "DISMISSED" })) as Any[]).some((d) => d.id === pairCD.id), "หาย", `pair=${!!pairCD} after=${dups3.some((d) => d.id === pairCD?.id)}`);

  // ═══ S5 unit scope ═══
  const eK1 = await fails(() => PR.getMember360(ctxK, kata, pOnly.id));
  const eT60 = await fails(() => PR.getMember360(ctxT, thana, kOnly.id));
  const okT1 = await fails(() => PR.getMember360(ctxT, thana, pOnly.id));
  const okK41 = await fails(() => PR.getMember360(ctxK, kata, kOnly.id));
  const eTUp = await fails(() => PR.updateMember(ctxT, thana, kOnly.id, { tags: ["x"] }));
  chk("M1.4-S5.1", "unit scope 404-not-403: STAFF กะตะ ดูสมาชิก 1 (ป่าตอง) → 'ไม่พบ' · thana ดู 60 (กะตะ) → ไม่พบ · thana ดู 1 ✓ · กะตะ ดู 41 ✓ · thana แก้ 60 → ไม่พบ (ไม่ใช่ Forbidden)", notFoundish(eK1) && notFoundish(eT60) && okT1 === null && okK41 === null && notFoundish(eTUp), "404 ทุกทาง", `${[eK1, eT60, eTUp].map((e) => e?.message?.slice(0, 30)).join(" | ")} ok=${okT1?.message ?? "✓"}/${okK41?.message ?? "✓"}`);
  const briefK = await M.briefFor(ctxK, kata, [pOnly.id, kOnly.id, m(41).id]);
  const briefO = await M.briefFor(ctxO, owner, [pOnly.id, kOnly.id]);
  chk("M1.4-S5.2", "facade briefFor(ctx, actor, ids[]) → [{id, memberCode, name, tier{key,name,color}, points, phoneMasked}] กรอง unit scope (กะตะได้ 2 จาก 3 · owner 2/2) · เบอร์ปิดบัง (081-xxx-1234 ไม่ใช่เบอร์เต็ม)", Array.isArray(briefK) && briefK.length === 2 && !briefK.some((b: Any) => b.id === pOnly.id) && briefO.length === 2 && briefO.every((b: Any) => b.memberCode && b.tier?.key && typeof b.points === "number" && typeof b.phoneMasked === "string" && /[x*]/.test(b.phoneMasked) && b.phoneMasked.length >= 8), "กรอง + ปิดบัง", JSON.stringify({ k: briefK?.map((b: Any) => b.id === pOnly.id), o: briefO?.[0] }).slice(0, 200));

  // ═══ S6 events ลง 3 ทะเบียน + consumer + facade ═══
  const consumers = read("src/lib/outbox-consumers.ts"); const auto = read("src/lib/automation/labels.ts"); const wh = read("src/lib/webhooks/labels.ts");
  const EVENTS = ["member.created", "member.updated", "member.merged", "member.identity.linked", "member.sensitive.viewed"];
  chk("M1.4-S6.1", "outbox-consumers.ts มี consumer ทุก event ใหม่ 5 ตัว (member.created/updated/merged/identity.linked/sensitive.viewed)", EVENTS.every((e) => new RegExp(`"${e.replace(/\./g, "\\.")}":`).test(consumers)), "5", EVENTS.filter((e) => !new RegExp(`"${e.replace(/\./g, "\\.")}":`).test(consumers)).join(","));
  const inAuto = EVENTS.filter((e) => new RegExp(`value:\\s*"${e.replace(/\./g, "\\.")}"`).test(auto));
  const inWh = EVENTS.filter((e) => new RegExp(`value:\\s*"${e.replace(/\./g, "\\.")}"`).test(wh));
  const A2 = (await import("@/lib/automation/labels" as string)) as Any; const W2 = (await import("@/lib/webhooks/labels" as string)) as Any;
  chk("M1.4-S6.2", "AUTOMATION_EVENTS มี member.created/updated/merged/identity.linked (ป้ายไทย) · WEBHOOK_EVENTS มีครบ 5 (ผ่าน spread + sensitive.viewed) · ไม่ประกาศซ้ำ 2 ที่ (ช่องติ๊กซ้ำ)", ["member.created", "member.updated", "member.merged", "member.identity.linked"].every((e) => A2.AUTOMATION_EVENTS.some((x: Any) => x.value === e && /[ก-๙]/.test(x.label))) && EVENTS.every((e) => W2.WEBHOOK_EVENTS.filter((x: Any) => x.value === e).length === 1), "ครบ · ไม่ซ้ำ", `auto=${inAuto.join(",")} wh=${inWh.join(",")} dupes=${EVENTS.filter((e) => W2.WEBHOOK_EVENTS.filter((x: Any) => x.value === e).length !== 1).join(",")}`);
  const { drainOutbox } = await import("@/lib/core/outbox");
  const { consumers: C } = (await import("@/lib/outbox-consumers" as string)) as Any;
  const dr = await drainOutbox(C, { limit: 200 });
  const stuck = await P.outboxEvent.count({ where: { tenantId: tid, type: { startsWith: "member." }, status: { not: "DONE" } } });
  const errored = await P.outboxEvent.findFirst({ where: { tenantId: tid, type: { startsWith: "member." }, lastError: { not: null } }, orderBy: { createdAt: "desc" } });
  chk("M1.4-S6.3", "drainOutbox กับ consumers จริง → event member.* ทั้งหมดของร้าน DONE (ไม่ค้าง PENDING · ไม่มี lastError) — consumer เป็น no-op/บันทึกกิจกรรม ห้ามล้ม", stuck === 0 && !errored, "DONE ทั้งหมด", `processed=${dr?.processed} failed=${dr?.failed} stuck=${stuck} err=${errored?.lastError?.slice(0, 80)}`);
  const facade = read("src/lib/modules/member/index.ts"); const profileSrc = read("src/lib/modules/member/profile.ts");
  const FACADE = ["createMember", "getMember360", "linkIdentity", "briefFor", "findOrCreate", "logActivity", "recordSpend", "linkContact"];
  chk("M1.4-S6.4", "facade member/index.ts export: createMember getMember360 linkIdentity briefFor + ของเดิม (findOrCreate logActivity recordSpend) + linkContact(partyId|phone|lineUserId) · profile.ts ไม่ import โมดูลอื่นตรง (party/point ผ่าน facade เท่านั้น · ไม่แตะ chat/pos/kanban) · ไม่มี any", FACADE.every((f) => new RegExp(`\\b${f}\\b`).test(facade)) && !/@\/lib\/modules\/(chat|pos|kanban|booking|account|crm|hr)\//.test(profileSrc) && /@\/lib\/modules\/party"/.test(profileSrc + facade) && !/\bany\b/.test(profileSrc.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), "สะอาด", `missing=${FACADE.filter((f) => !new RegExp(`\\b${f}\\b`).test(facade)).join(",")} cross=${/@\/lib\/modules\/(chat|pos|kanban|booking|account|crm|hr)\//.test(profileSrc)}`, "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M1.4-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  for (const id of made.policies) await d(() => P.memberSensitivePolicy.delete({ where: { id } }));
  for (const id of made.approvalPolicies) { await d(() => prisma.approvalRequest.deleteMany({ where: { policyId: id } })); await d(() => P.approvalStep.deleteMany({ where: { policyId: id } })); await d(() => P.approvalPolicy.delete({ where: { id } })); }
  for (const id of made.activities) await d(() => prisma.memberActivity.delete({ where: { id } }));
  for (const id of made.identities) await d(() => P.memberChannelIdentity.delete({ where: { id } }));
  await d(() => P.memberChannelIdentity.deleteMany({ where: { tenantId: tid, externalId: { contains: tag } } }));
  for (const id of made.candidates) await d(() => prisma.partyMergeCandidate.delete({ where: { id } }));
  const custIds = made.customers;
  if (custIds.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: custIds } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberFieldValueHistory", "memberChannelIdentity", "memberAccessLog", "memberActivity", "pointLedger", "pointBalance"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: custIds } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: custIds } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: custIds } } }));
    if (parties.length) { await d(() => prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } })); await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } })); }
  }
  await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: "member." }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M1.4: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
