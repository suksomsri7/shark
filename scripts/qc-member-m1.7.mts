// QC — ระบบสมาชิก v2 WO M1.7: consent/privacy — นโยบายเวอร์ชัน · consent ต่อช่องทาง (D19) · sensitive policy CRUD (D8+D17) · access log · คำขอ PDPA (export/erase + approval) · auto-erase · หน้า settings/privacy (ภาพ 14)
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M1.7 · พิมพ์เขียว §4.3 §5.10 (privacy) §6.3 §7.1 §7.5 §11.8 · ภาพ 14
// requires: member-seed
//
// สัญญาฟังก์ชัน (src/lib/modules/member/privacy.ts — ต่อยอด canViewSensitive/logAccess ของ M1.4)
//   listPolicyVersions(ctx) → [{version, bodyHtml, effectiveAt, isCurrent}] เรียง version desc · createPolicyVersion(ctx, actor, { bodyHtml, effectiveAt? }) → {version} (privacy.manage · version = max+1 · effectiveAt null = ร่าง)
//   publishPolicyVersion(ctx, actor, version, { effectiveAt? }) → ตั้ง effectiveAt (ปริยาย now) · currentPolicy(ctx, now?) → เวอร์ชันล่าสุดที่ effectiveAt ≤ now | null · acceptPolicy(ctx, customerId, version, via) → Customer.privacyVersion + MemberActivity (version ไม่มี/ยังไม่เผยแพร่ → throw)
//   getConsents(ctx, customerId) → [{ channel, label, granted: boolean|null, source, policyVersion, grantedAt, revokedAt }] ทุกช่องทางที่ canConsent (ยังไม่เคยตั้ง = granted null)
//   setConsent(ctx, actor, customerId, { channel, granted, source, policyVersion? }) → แถว (upsert · grantedAt/revokedAt · byUserId จาก actor.userId หรือ null เมื่อ CUSTOMER) · channel ต้อง canConsent (ไม่ใช่ → throw ไทย) · event member.consent.changed {customerId, channel, granted} · sync legacy Customer.marketingConsent = OR(LINE,EMAIL,SMS) · actor CUSTOMER แก้ได้เฉพาะ customerId ตนเอง (source CUSTOMER_SELF)
//   listSensitivePolicies(ctx) → [{ id, targetType, targetId, targetLabel, roles, hrPositions, hrDepartments, sameUnitOnly, logAccess }] · setSensitivePolicy(ctx, actor, { targetType, targetId, roles, hrPositions?, hrDepartments?, sameUnitOnly?, logAccess? }) → upsert (privacy.manage) · deleteSensitivePolicy(ctx, actor, id) · hrPositionsSummary(ctx) → { positions: string[], departments: string[], unlinkedCount, unlinked: [{id,name}] } (HrEmployee active ในร้าน)
//   listAccessLog(ctx, actor, { customerId?, userId?, from?, to?, take? }) → [{ id, at, userId, userName, hrPosition, targetType, targetId, targetLabel, page, customerId, customerName }] (privacy.manage)
//   exportBundle(ctx, customerId) → { exportedAt, profile (ทุกฟิลด์รวมอ่อนไหว), addresses[], consents[], identities[], attribution, tierHistory[], activities[], points: { balance, ledger[] }, sales[] (PosSale ของ memberId), appointments[], chat: { contacts[], conversations }, account: { documents[] }, kanban: { cards[] } } — ผ่าน facade ของโมดูลอื่น (party/point/chat/account/kanban) เท่านั้น
//   requestExport(ctx, actor, customerId, via) → { requestId, bundle } · MemberPrivacyRequest {type EXPORT, status DONE, doneAt, requestedVia} + MemberAccessLog targetType EXPORT + AuditLog · สิทธิ์ privacy.manage หรือ CUSTOMER ตนเอง
//   requestErase(ctx, actor, customerId, via) → { requestId, approvalRequestId? , status } · MemberPrivacyRequest DELETE PENDING + approval.submitForApproval({ entityType: "member.erase", entityId: requestId }) (ไม่มีนโยบาย = autoApproved → erase ทันที) · ซ้ำขณะ PENDING → คืนคำขอเดิม · สิทธิ์ member.customer.delete หรือ CUSTOMER ตนเอง
//   eraseMember(ctx, customerId, { requestId? }) → anonymize: name "ลูกค้าที่ถูกลบ" · firstName/lastName/nickname/phone/phone2/email/birthDate/avatarFileId/lineUserId/facebook null · tags [] · status CLOSED · MemberFieldValue/Address/ChannelIdentity ลบ · consents revoked · Party (ถ้าไม่มีโมดูลอื่นชี้) name "ลูกค้าที่ถูกลบ" phone/email null · PosSale/PointLedger/PointBalance/MemberTierHistory/MemberActivity คงไว้ · request DONE doneAt · AuditLog · event member.updated {changedKeys:["erased"]} · ซ้ำ → no-op
//   approval-effects.ts: entityType "member.erase" approved → eraseMember · rejected → request REJECTED
//   sweepAutoErase(ctx?, now) → { created } — ทุกระบบ MEMBER ที่ AppSystem.settings.member.privacy.autoEraseYears > 0: สมาชิก lastActivityAt < now − N ปี (และไม่มีคำขอ DELETE ค้าง/เสร็จ) → requestErase via API · cron รายวัน
//   UI: src/app/app/sys/[id]/member/settings/privacy/page.tsx + components/member/PrivacySettings.tsx + privacy-actions.ts (gate member.privacy.manage) · testid privacy-page privacy-policies privacy-consent-channels privacy-sensitive privacy-sensitive-unlinked privacy-access-log privacy-requests privacy-auto-erase
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/member/privacy.ts") || !/exportBundle/.test(readFileSync("src/lib/modules/member/privacy.ts", "utf8"))) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/member/privacy.ts#exportBundle)");
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
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const P = prisma as Any;
let tid = ""; let SYS = "";
const tag = Date.now().toString(36);
const num = String(Date.now() % 1_000_000).padStart(6, "0");
const made = { customers: [] as string[], policies: [] as string[], sensitive: [] as string[], approvalPolicies: [] as string[], requests: [] as string[], sales: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const PV = (await import("@/lib/modules/member/privacy" as string)) as Record<string, (...a: Any[]) => Any>;
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const approval = (await import("@/lib/modules/approval/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const pos = (await import("@/lib/modules/pos/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const U = { owner: E.users.owner.userId as string, manager: E.users.manager.userId as string, thana: E.users.staff.thana.userId as string, nurse: E.users.staff.nurse.userId as string };
  const owner = await actorOf(U.owner); const manager = await actorOf(U.manager); const thana = await actorOf(U.thana); const nurse = await actorOf(U.nurse);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: U.owner }; const ctxM = { ...ctxO, actorUserId: U.manager }; const ctxT = { ...ctxO, actorUserId: U.thana }; const ctxN = { ...ctxO, actorUserId: U.nurse }; const ctxNone = { ...ctxO, actorUserId: null as string | null };
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const units = E.units as Record<string, string>;
  const healthSec = await P.memberSection.findFirst({ where: { systemId: SYS, key: "health" } });
  const outbox = (type: string, pred: (p: Any) => boolean) => P.outboxEvent.findMany({ where: { tenantId: tid, type }, orderBy: { createdAt: "desc" }, take: 30 }).then((rows: Any[]) => rows.find((r) => pred(r.payload)));
  const custActor = (customerId: string) => ({ userId: "", role: "CUSTOMER", unitAccess: [] as string[], permissions: {}, customerId });
  const health = (v: Any) => v?.sections?.find((s: Any) => s.key === "health");

  // ═══ S1 นโยบายเวอร์ชัน ═══
  const v1 = await PV.createPolicyVersion(ctxO, owner, { bodyHtml: "<p>นโยบายความเป็นส่วนตัว v1</p>", effectiveAt: new Date(Date.now() + 7 * 86400_000) });
  const cur0 = await PV.currentPolicy(ctxO);
  await PV.publishPolicyVersion(ctxO, owner, v1.version, {});
  const cur1 = await PV.currentPolicy(ctxO);
  const v2 = await PV.createPolicyVersion(ctxO, owner, { bodyHtml: "<p>v2 ร่าง</p>" });
  const list: Any[] = await PV.listPolicyVersions(ctxO);
  chk("M1.7-S1.1", "createPolicyVersion (effectiveAt อนาคต) → version 1 · currentPolicy = null (ยังไม่ถึงวัน) · publish → current v1 (effectiveAt ≤ now) · สร้าง v2 ร่าง (effectiveAt null) → list [v2, v1] (desc · isCurrent เฉพาะ v1) · bodyHtml ผ่าน sanitize (ไม่มี <script>)", v1?.version === 1 && cur0 === null && cur1?.version === 1 && v2?.version === 2 && list.length === 2 && list[0].version === 2 && list[0].isCurrent === false && list[1].isCurrent === true && !/<script/.test(String((await PV.createPolicyVersion(ctxO, owner, { bodyHtml: "<p>x</p><script>alert(1)</script>" }))?.bodyHtml ?? "")), "v1 current · v2 draft", JSON.stringify({ v1, cur0, cur1: cur1?.version, v2: v2?.version, list: list.map((l) => [l.version, l.isCurrent]) }));
  await PV.acceptPolicy(ctxO, m(1).id, 1, "LIFF");
  const c1 = (await prisma.customer.findUnique({ where: { id: m(1).id } })) as Any;
  restore.push(() => prisma.customer.update({ where: { id: m(1).id }, data: { privacyVersion: null } as Any }));
  const eAccDraft = await fails(() => PV.acceptPolicy(ctxO, m(1).id, 2, "LIFF"));
  const eAccGhost = await fails(() => PV.acceptPolicy(ctxO, m(1).id, 99, "LIFF"));
  chk("M1.7-S1.2", "acceptPolicy(สมาชิก 1, v1, LIFF) → Customer.privacyVersion 1 + MemberActivity (module member · type มี POLICY) · ยอมรับร่าง (v2 ยังไม่เผยแพร่)/เวอร์ชันไม่มี → throw ไทย", c1.privacyVersion === 1 && (await prisma.memberActivity.count({ where: { customerId: m(1).id, module: "member", type: { contains: "POLICY" } } })) >= 1 && thai(eAccDraft) && thai(eAccGhost), "1 · throw ×2", `pv=${c1.privacyVersion} draft=${!!eAccDraft} ghost=${!!eAccGhost}`);
  const ePolStaff = await fails(() => PV.createPolicyVersion(ctxT, thana, { bodyHtml: "<p>x</p>" }));
  const ePolMgr = await fails(() => PV.createPolicyVersion(ctxM, manager, { bodyHtml: "<p>x</p>" }));
  chk("M1.7-S1.3", "สิทธิ์ member.privacy.manage: STAFF → throw · MANAGER (ไม่มีคีย์โดยปริยาย §6.1) → throw · OWNER ผ่าน", thai(ePolStaff) && thai(ePolMgr), "throw ×2", `${!!ePolStaff}/${!!ePolMgr}`);

  // ═══ S2 consent ต่อช่องทาง ═══
  const c7 = (await prisma.customer.findUnique({ where: { id: m(7).id } })) as Any;
  const consBefore: Any[] = await P.memberConsent.findMany({ where: { customerId: m(7).id } });
  restore.push(async () => { await P.memberConsent.deleteMany({ where: { customerId: m(7).id } }); for (const c of consBefore) await P.memberConsent.create({ data: { tenantId: c.tenantId, customerId: c.customerId, channel: c.channel, granted: c.granted, source: c.source, policyVersion: c.policyVersion, grantedAt: c.grantedAt, revokedAt: c.revokedAt, byUserId: c.byUserId } }); await prisma.customer.update({ where: { id: m(7).id }, data: { marketingConsent: c7.marketingConsent } }); });
  const s1 = await PV.setConsent(ctxO, owner, m(7).id, { channel: "WHATSAPP", granted: true, source: "STAFF", policyVersion: 1 });
  const evC = await outbox("member.consent.changed", (p) => p.customerId === m(7).id && p.channel === "WHATSAPP");
  chk("M1.7-S2.1", "setConsent(WHATSAPP granted true source STAFF policyVersion 1) → แถว {granted true, grantedAt, revokedAt null, byUserId owner, source STAFF, policyVersion 1} · event member.consent.changed {customerId, channel, granted}", s1?.granted === true && !!s1.grantedAt && s1.revokedAt === null && s1.byUserId === U.owner && s1.source === "STAFF" && s1.policyVersion === 1 && !!evC && evC.payload.granted === true, "ครบ", JSON.stringify({ s1, ev: !!evC }).slice(0, 200));
  for (const ch of ["LINE", "EMAIL", "SMS"]) await PV.setConsent(ctxO, owner, m(7).id, { channel: ch, granted: false, source: "STAFF" });
  const c7a = (await prisma.customer.findUnique({ where: { id: m(7).id } })) as Any;
  const rev: Any = await P.memberConsent.findFirst({ where: { customerId: m(7).id, channel: "LINE" } });
  await PV.setConsent(ctxO, owner, m(7).id, { channel: "EMAIL", granted: true, source: "STAFF" });
  const c7b = (await prisma.customer.findUnique({ where: { id: m(7).id } })) as Any;
  chk("M1.7-S2.2", "ถอน LINE/EMAIL/SMS → granted false + revokedAt · legacy sync: Customer.marketingConsent = false เมื่อทั้ง 3 ไม่ยินยอม · ให้ EMAIL กลับ → marketingConsent true (§4.5)", rev?.granted === false && !!rev.revokedAt && c7a.marketingConsent === false && c7b.marketingConsent === true, "sync", `rev=${rev?.granted}/${!!rev?.revokedAt} mk=${c7a?.marketingConsent}→${c7b?.marketingConsent}`);
  const eNoConsent = await fails(() => PV.setConsent(ctxO, owner, m(7).id, { channel: "WEBCHAT", granted: true, source: "STAFF" }));
  const eUnknown = await fails(() => PV.setConsent(ctxO, owner, m(7).id, { channel: "TELEGRAM", granted: true, source: "STAFF" }));
  const eSrc = await fails(() => PV.setConsent(ctxO, owner, m(7).id, { channel: "LINE", granted: true, source: "MOON" }));
  chk("M1.7-S2.3", "channel ที่ canConsent=false (WEBCHAT) → throw ไทย · นอกทะเบียน (TELEGRAM) → throw · source นอก enum → throw", thai(eNoConsent) && thai(eUnknown) && !!eSrc, "throw ×3", `${[eNoConsent, eUnknown, eSrc].map((e) => !!e).join("/")}`);
  const okSelf = await fails(() => PV.setConsent(ctxNone, custActor(m(7).id), m(7).id, { channel: "SMS", granted: true, source: "CUSTOMER_SELF" }));
  const eOther = await fails(() => PV.setConsent(ctxNone, custActor(m(7).id), m(8).id, { channel: "SMS", granted: true, source: "CUSTOMER_SELF" }));
  const eStaffSrc = await fails(() => PV.setConsent(ctxNone, custActor(m(7).id), m(7).id, { channel: "SMS", granted: true, source: "STAFF" }));
  const all: Any[] = await PV.getConsents(ctxO, m(7).id);
  const ch = (await import("@/lib/core/channels" as string)) as Any;
  const nConsentable = ch.consentChannels().length;
  chk("M1.7-S2.4", "actor CUSTOMER: ตั้ง consent ของตนเอง (source CUSTOMER_SELF · byUserId null) ได้ · ของคนอื่น → throw · source ไม่ใช่ CUSTOMER_SELF → throw · getConsents คืนทุกช่องทาง canConsent (label ไทย · ยังไม่ตั้ง = granted null · ตั้งแล้ว = boolean)", okSelf === null && ((await P.memberConsent.findFirst({ where: { customerId: m(7).id, channel: "SMS" } })) as Any)?.byUserId === null && !!eOther && !!eStaffSrc && all.length === nConsentable && all.every((c) => /[ก-๙]/.test(c.label)) && all.find((c) => c.channel === "SMS")?.granted === true && all.some((c) => c.granted === null), `${nConsentable} ช่อง`, `self=${okSelf?.message ?? "ok"} other=${!!eOther} src=${!!eStaffSrc} n=${all?.length} nulls=${all?.filter((c) => c.granted === null).length}`);

  // ═══ S3 sensitive policy (D8 + D17) ═══
  const ePolT = await fails(() => PV.setSensitivePolicy(ctxT, thana, { targetType: "SECTION", targetId: healthSec.id, roles: ["OWNER"] }));
  const ePolM = await fails(() => PV.setSensitivePolicy(ctxM, manager, { targetType: "SECTION", targetId: healthSec.id, roles: ["OWNER"] }));
  const pol = await PV.setSensitivePolicy(ctxO, owner, { targetType: "SECTION", targetId: healthSec.id, roles: ["OWNER"], hrPositions: [], hrDepartments: [], sameUnitOnly: false, logAccess: true });
  made.sensitive.push(pol.id);
  const vM = await PR.getMember360(ctxM, manager, m(1).id);
  chk("M1.7-S3.1", "setSensitivePolicy: STAFF/MANAGER → throw (privacy.manage) · OWNER ตั้ง health = roles [OWNER] เท่านั้น → manager ดู 360 แล้ว health visible=false (ค่าปริยาย OWNER+MANAGER ถูกทับ)", thai(ePolT) && thai(ePolM) && pol?.id && health(vM)?.visible === false, "manager ✗", `t=${!!ePolT} m=${!!ePolM} vis=${health(vM)?.visible}`);
  await PV.setSensitivePolicy(ctxO, owner, { targetType: "SECTION", targetId: healthSec.id, roles: ["OWNER"], hrPositions: ["พยาบาล"], sameUnitOnly: false, logAccess: true });
  const vN1 = await PR.getMember360(ctxN, nurse, m(1).id);
  await PV.setSensitivePolicy(ctxO, owner, { targetType: "SECTION", targetId: healthSec.id, roles: ["OWNER"], hrPositions: [], hrDepartments: ["คลินิก"], sameUnitOnly: false, logAccess: true });
  const vN2 = await PR.getMember360(ctxN, nurse, m(1).id);
  await PV.setSensitivePolicy(ctxO, owner, { targetType: "SECTION", targetId: healthSec.id, roles: ["OWNER"], hrPositions: ["แคชเชียร์"], hrDepartments: ["ครัว"], sameUnitOnly: false, logAccess: true });
  const vN3 = await PR.getMember360(ctxN, nurse, m(1).id);
  chk("M1.7-S3.2", "upsert เดิม (targetType,targetId) 1 แถว · hrPositions ['พยาบาล'] → nurse เห็น · hrDepartments ['คลินิก'] (ตำแหน่งว่าง) → nurse เห็น (แผนกตรง) · ตำแหน่ง/แผนกอื่น → nurse ไม่เห็น", (await P.memberSensitivePolicy.count({ where: { systemId: SYS, targetType: "SECTION", targetId: healthSec.id } })) === 1 && health(vN1)?.visible === true && health(vN2)?.visible === true && health(vN3)?.visible === false, "1 แถว · ✓ ✓ ✗", `rows=${await P.memberSensitivePolicy.count({ where: { systemId: SYS, targetType: "SECTION", targetId: healthSec.id } })} ${health(vN1)?.visible}/${health(vN2)?.visible}/${health(vN3)?.visible}`);
  const certField = await P.memberField.findUnique({ where: { id: E.fields.dive.certNo ?? E.fields.dive.certLevel } });
  const fp = await PV.setSensitivePolicy(ctxO, owner, { targetType: "FIELD", targetId: certField.id, roles: ["OWNER"] });
  made.sensitive.push(fp.id);
  await P.memberField.update({ where: { id: certField.id }, data: { sensitive: true } });
  restore.push(() => P.memberField.update({ where: { id: certField.id }, data: { sensitive: false } }));
  const vMF = await PR.getMember360(ctxM, manager, m(1).id);
  const diveM = vMF?.sections?.find((s: Any) => s.key === "dive");
  const fld = diveM?.fields?.find((f: Any) => f.id === certField.id || f.key === certField.key);
  const lst: Any[] = await PV.listSensitivePolicies(ctxO);
  chk("M1.7-S3.3", "policy ระดับ FIELD (ฟิลด์ certLevel/certNo sensitive=true · roles [OWNER]): manager เห็นส่วน dive แต่ฟิลด์นั้น hidden=true ไม่มี value · listSensitivePolicies → รายการ 2 (targetLabel ไทย 'สุขภาพ'/ป้ายฟิลด์ · roles · hrPositions/hrDepartments)", diveM?.visible === true && !!fld && fld.hidden === true && (fld.value === undefined || fld.value === null) && lst.length >= 2 && lst.every((p) => typeof p.targetLabel === "string" && Array.isArray(p.roles)) && lst.some((p) => p.targetType === "FIELD" && p.targetId === certField.id), "field hidden", JSON.stringify({ dive: diveM?.visible, fld: fld && [fld.hidden, fld.value], n: lst?.length }));
  const sum = await PV.hrPositionsSummary(ctxO);
  const unlinkedDb = await P.hrEmployee.count({ where: { tenantId: tid, active: true, linkedUserId: null } });
  chk("M1.7-S3.4", "hrPositionsSummary → positions มี 'พยาบาล' + 'พนักงานขาย' · departments มี 'คลินิก' · unlinkedCount = HrEmployee active ที่ยังไม่ผูกบัญชี (จาก DB) · unlinked[{id,name}] (สำหรับคำเตือน 'n คนยังไม่ผูก')", sum?.positions?.includes("พยาบาล") && sum.positions.includes("พนักงานขาย") && sum.departments?.includes("คลินิก") && sum.unlinkedCount === unlinkedDb && Array.isArray(sum.unlinked) && sum.unlinked.length === unlinkedDb, `unlinked ${unlinkedDb}`, JSON.stringify(sum).slice(0, 200));
  await PV.deleteSensitivePolicy(ctxO, owner, pol.id); made.sensitive.splice(made.sensitive.indexOf(pol.id), 1);
  const vM2 = await PR.getMember360(ctxM, manager, m(1).id);
  const eDelGhost = await fails(() => PV.deleteSensitivePolicy(ctxO, owner, "ไม่มี"));
  chk("M1.7-S3.5", "deleteSensitivePolicy → กลับค่าปริยาย (manager เห็น health อีกครั้ง) · ลบ id ไม่มี → throw ไทย · AuditLog member.privacy.* ≥ 3", health(vM2)?.visible === true && thai(eDelGhost) && (await prisma.auditLog.count({ where: { tenantId: tid, action: { startsWith: "member.privacy" } } })) >= 3, "กลับปริยาย", `vis=${health(vM2)?.visible} ghost=${!!eDelGhost} audit=${await prisma.auditLog.count({ where: { tenantId: tid, action: { startsWith: "member.privacy" } } })}`);

  // ═══ S4 access log ═══
  const pol2 = await PV.setSensitivePolicy(ctxO, owner, { targetType: "SECTION", targetId: healthSec.id, roles: ["OWNER", "MANAGER"], hrPositions: ["พยาบาล"], logAccess: true });
  made.sensitive.push(pol2.id);
  await PR.getMember360(ctxN, nurse, m(2).id);
  const logs: Any[] = await PV.listAccessLog(ctxO, owner, { customerId: m(2).id, take: 20 });
  const row = logs.find((l) => l.userId === U.nurse && l.targetType === "SECTION");
  chk("M1.7-S4.1", "listAccessLog({customerId}) → แถว {at, userId, userName 'นภา…', hrPosition 'พยาบาล', targetType SECTION, targetLabel 'สุขภาพ', customerName} เรียงใหม่→เก่า", !!row && /นภา/.test(row.userName) && row.hrPosition === "พยาบาล" && row.targetLabel === "สุขภาพ" && typeof row.customerName === "string" && logs.every((l, i, a) => i === 0 || new Date(a[i - 1].at) >= new Date(l.at)), "มีแถว", JSON.stringify(row ?? logs.slice(0, 2)).slice(0, 200));
  const eLogT = await fails(() => PV.listAccessLog(ctxT, thana, {}));
  const byUser: Any[] = await PV.listAccessLog(ctxO, owner, { userId: U.nurse, from: new Date(Date.now() - 3600_000), to: new Date(Date.now() + 60_000) });
  const none: Any[] = await PV.listAccessLog(ctxO, owner, { userId: U.nurse, to: new Date(Date.now() - 86400_000 * 30) });
  chk("M1.7-S4.2", "STAFF listAccessLog → throw · ตัวกรอง userId+from/to → เฉพาะของ nurse ในช่วง · ช่วงเก่า → ว่าง", thai(eLogT) && byUser.length >= 1 && byUser.every((l) => l.userId === U.nurse) && none.length === 0, "กรองได้", `t=${!!eLogT} n=${byUser?.length} none=${none?.length}`);

  // ═══ S5 export ═══
  const b = await PV.exportBundle(ctxO, m(1).id);
  const salesDb = await prisma.posSale.count({ where: { tenantId: tid, memberId: m(1).id } });
  const apptDb = await prisma.appointment.count({ where: { tenantId: tid, customerId: m(1).id } });
  const KEYS = ["exportedAt", "profile", "addresses", "consents", "identities", "attribution", "tierHistory", "activities", "points", "sales", "appointments", "chat", "account", "kanban"];
  chk("M1.7-S5.1", `exportBundle(สมาชิก 1) → คีย์ครบ 14 · profile มีค่าอ่อนไหว (โรคประจำตัว) · sales ${salesDb} · appointments ${apptDb} · chat.contacts ≥ 1 (seed) · points {balance, ledger[]} · ไม่มีข้อมูลคนอื่น (ไม่มีเบอร์สมาชิก 2)`, KEYS.every((k) => k in (b ?? {})) && b.profile?.fields?.conditions && b.sales.length === salesDb && b.appointments.length === apptDb && b.chat?.contacts?.length >= 1 && typeof b.points?.balance === "number" && Array.isArray(b.points.ledger) && !JSON.stringify(b).includes(m(2).phone), "ครบ", `missing=${KEYS.filter((k) => !(k in (b ?? {}))).join(",")} sales=${b?.sales?.length}/${salesDb} appt=${b?.appointments?.length}/${apptDb} chat=${b?.chat?.contacts?.length}`);
  const rx = await PV.requestExport(ctxO, owner, m(1).id, "STAFF");
  if (rx?.requestId) made.requests.push(rx.requestId);
  const rxRow = await P.memberPrivacyRequest.findUnique({ where: { id: rx?.requestId ?? "x" } });
  const rxSelf = await PV.requestExport(ctxNone, custActor(m(1).id), m(1).id, "CUSTOMER_SELF");
  if (rxSelf?.requestId) made.requests.push(rxSelf.requestId);
  const eRxOther = await fails(() => PV.requestExport(ctxNone, custActor(m(1).id), m(2).id, "CUSTOMER_SELF"));
  chk("M1.7-S5.2", "requestExport(owner) → {requestId, bundle} · MemberPrivacyRequest {type EXPORT, status DONE, doneAt, requestedVia STAFF} · AccessLog targetType EXPORT · AuditLog member.privacy.export · ลูกค้าขอของตนเอง (via CUSTOMER_SELF) ได้ · ของคนอื่น → throw", rx?.requestId && rx.bundle?.profile && rxRow?.type === "EXPORT" && rxRow.status === "DONE" && !!rxRow.doneAt && rxRow.requestedVia === "STAFF" && (await P.memberAccessLog.count({ where: { customerId: m(1).id, targetType: "EXPORT" } })) >= 1 && (await prisma.auditLog.count({ where: { tenantId: tid, action: { contains: "privacy.export" } } })) >= 1 && rxSelf?.requestId && !!eRxOther, "DONE", JSON.stringify({ rx: !!rx?.requestId, row: rxRow && [rxRow.type, rxRow.status, rxRow.requestedVia], self: !!rxSelf?.requestId, other: !!eRxOther }));
  const eRxT = await fails(() => PV.requestExport(ctxT, thana, m(1).id, "STAFF"));
  const eBundleT = await fails(() => PV.exportBundle(ctxT, m(1).id));
  chk("M1.7-S5.3", "thana (ไม่มี privacy.manage) requestExport → throw · exportBundle เป็น internal (ไม่ตรวจสิทธิ์เอง — ผู้เรียกตรวจ) หรือ throw ก็ได้", thai(eRxT) && (eBundleT === null || thai(eBundleT)), "throw", `${!!eRxT}`);

  // ═══ S6 erase (approval) ═══
  const apPol = await approval.createPolicy({ tenantId: tid }, { name: "QC M1.7 ลบข้อมูล PDPA", entityType: "member.erase", steps: [{ order: 1, approverRole: "OWNER" }] });
  made.approvalPolicies.push(apPol.id);
  const mkMember = async (key: string) => { const r = await PR.createMember(ctxO, owner, { phone: `0896${num}`.slice(0, 10).replace(/\d$/, key), email: `erase-${key}-${tag}@example.com`, firstName: `ลบ${key}`, lastName: "ทดสอบ", nickname: "นิค", birthDate: "1990-01-01", source: "POS", homeUnitId: units.patong, consents: [{ channel: "LINE", granted: true }], fields: { certLevel: "Open Water" }, tags: ["erase"] }); made.customers.push(r.customerId); return r.customerId as string; };
  const X = await mkMember("1"); const Y = await mkMember("2");
  const sale = await pos.createSale({ tenantId: tid, unitId: units.patong, systemId: scope.systems.POS, pointSystemId: scope.systems.POINT, memberId: X, idempotencyKey: `qc17-${tag}-x`, lines: [{ name: "คอร์ส QC ลบ", qty: 1, unitPriceSatang: 250_000 }], payMethods: [{ type: "CASH", amountSatang: 250_000 }] });
  made.sales.push(sale.saleId);
  await PR.linkIdentity(ctxO, { channel: "LINE", externalId: `U-qc17-${tag}`, phone: ((await prisma.customer.findUnique({ where: { id: X } })) as Any).phone });
  const eEraseT = await fails(() => PV.requestErase(ctxT, thana, X, "STAFF"));
  const re1 = await PV.requestErase(ctxO, owner, X, "STAFF");
  const re2 = await PV.requestErase(ctxO, owner, X, "STAFF");
  if (re1?.requestId) made.requests.push(re1.requestId);
  const reRow = await P.memberPrivacyRequest.findUnique({ where: { id: re1?.requestId ?? "x" } });
  chk("M1.7-S6.1", "requestErase: STAFF (ไม่มี member.customer.delete) → throw · OWNER → {requestId, approvalRequestId, status PENDING} · MemberPrivacyRequest DELETE PENDING approvalRequestId · ApprovalRequest entityType member.erase PENDING · ขอซ้ำขณะ PENDING → requestId เดิม · ลูกค้ายังไม่ถูกลบ", thai(eEraseT) && re1?.requestId && re1.approvalRequestId && re1.status === "PENDING" && reRow?.type === "DELETE" && reRow.status === "PENDING" && reRow.approvalRequestId === re1.approvalRequestId && (await prisma.approvalRequest.count({ where: { id: re1.approvalRequestId, entityType: "member.erase", status: "PENDING" as Any } })) === 1 && re2?.requestId === re1.requestId && ((await prisma.customer.findUnique({ where: { id: X } })) as Any).status === "ACTIVE", "PENDING", JSON.stringify({ t: !!eEraseT, re1, same: re2?.requestId === re1?.requestId }).slice(0, 200));
  const dec = await approval.decide({ userId: U.owner, role: "OWNER", unitAccess: ["*"], permissions: {} } as Any, { tenantId: tid }, re1.approvalRequestId, { decision: "APPROVED", note: "QC" });
  const { drainOutbox } = await import("@/lib/core/outbox");
  const { consumers: C } = (await import("@/lib/outbox-consumers" as string)) as Any;
  await drainOutbox(C, { limit: 300 });
  const cX = (await prisma.customer.findUnique({ where: { id: X } })) as Any;
  const partyX = cX?.partyId ? await prisma.party.findUnique({ where: { id: cX.partyId } }) as Any : null;
  const reRow2 = await P.memberPrivacyRequest.findUnique({ where: { id: re1.requestId } });
  const evErased = await outbox("member.updated", (p) => p.customerId === X && (p.changedKeys ?? []).includes("erased"));
  chk("M1.7-S6.2", "🔴 approve → consumer approval.request.approved → approval-effects member.erase → eraseMember: name 'ลูกค้าที่ถูกลบ' · firstName/lastName/nickname/phone/email/birthDate null · tags [] · status CLOSED · ค่าฟิลด์ 0 · identities 0 · consents ทั้งหมด granted false · Party anonymize (name เดียวกัน · phone/email null) · PosSale 1 บิลคง (memberId คง) · PointLedger คง · request DONE doneAt · event member.updated changedKeys ['erased']", dec?.ok === true && cX.name === "ลูกค้าที่ถูกลบ" && cX.firstName === null && cX.phone === null && cX.email === null && cX.birthDate === null && cX.nickname === null && JSON.stringify(cX.tags) === "[]" && cX.status === "CLOSED" && (await P.memberFieldValue.count({ where: { customerId: X } })) === 0 && (await P.memberChannelIdentity.count({ where: { customerId: X } })) === 0 && (await P.memberConsent.count({ where: { customerId: X, granted: true } })) === 0 && partyX?.name === "ลูกค้าที่ถูกลบ" && partyX.phone === null && partyX.email === null && (await prisma.posSale.count({ where: { id: sale.saleId, memberId: X } })) === 1 && (await prisma.pointLedger.count({ where: { tenantId: tid, customerId: X } })) >= 1 && reRow2?.status === "DONE" && !!reRow2.doneAt && !!evErased, "anonymized", JSON.stringify({ dec, name: cX?.name, st: cX?.status, phone: cX?.phone, fv: await P.memberFieldValue.count({ where: { customerId: X } }), party: partyX && [partyX.name, partyX.phone], req: reRow2?.status, ev: !!evErased }).slice(0, 260));
  const reY = await PV.requestErase(ctxO, owner, Y, "STAFF");
  if (reY?.requestId) made.requests.push(reY.requestId);
  await approval.decide({ userId: U.owner, role: "OWNER", unitAccess: ["*"], permissions: {} } as Any, { tenantId: tid }, reY.approvalRequestId, { decision: "REJECTED", note: "ไม่ลบ" });
  await drainOutbox(C, { limit: 300 });
  const cY = (await prisma.customer.findUnique({ where: { id: Y } })) as Any;
  const reYRow = await P.memberPrivacyRequest.findUnique({ where: { id: reY.requestId } });
  const reY2 = await PV.requestErase(ctxO, owner, Y, "STAFF");
  if (reY2?.requestId && reY2.requestId !== reY.requestId) made.requests.push(reY2.requestId);
  chk("M1.7-S6.3", "reject → request REJECTED · ลูกค้า Y ยังครบ (name/phone/status ACTIVE) · ขอใหม่หลังถูกปฏิเสธ → requestId ใหม่ PENDING", reYRow?.status === "REJECTED" && cY.status === "ACTIVE" && cY.phone && cY.name !== "ลูกค้าที่ถูกลบ" && reY2?.requestId && reY2.requestId !== reY.requestId && reY2.status === "PENDING", "REJECTED · ใหม่", JSON.stringify({ st: reYRow?.status, cy: [cY?.status, !!cY?.phone], again: reY2?.requestId !== reY?.requestId }));
  const again = await fails(() => PV.eraseMember(ctxO, X, {}));
  const v360 = await PR.getMember360(ctxO, owner, X);
  const lst2 = await (await import("@/lib/modules/member/list" as string).catch(() => null) as Any)?.listMembers?.(ctxO, owner, { status: "CLOSED" });
  chk("M1.7-S6.4", "eraseMember ซ้ำ → no-op (ไม่ throw · ไม่เปลี่ยน) · 360 ของคนที่ถูกลบ → profile.status CLOSED · name 'ลูกค้าที่ถูกลบ' · sections ค่าว่าง · listMembers({status:'CLOSED'}) มี X (ถ้า M1.5 มีแล้ว)", again === null && v360?.profile?.status === "CLOSED" && v360.profile.name === "ลูกค้าที่ถูกลบ" && (lst2 === undefined || lst2?.items?.some((i: Any) => i.id === X)), "no-op · CLOSED", `again=${again?.message ?? "ok"} st=${v360?.profile?.status}`);
  const sysRow = await prisma.appSystem.findUnique({ where: { id: SYS } });
  restore.push(() => prisma.appSystem.update({ where: { id: SYS }, data: { settings: sysRow!.settings as Any } }));
  const st = (sysRow!.settings ?? {}) as Record<string, Any>;
  await prisma.appSystem.update({ where: { id: SYS }, data: { settings: { ...st, member: { ...(st.member ?? {}), privacy: { ...(st.member?.privacy ?? {}), autoEraseYears: 1 } } } as Any } });
  const Z = await mkMember("3");
  await prisma.customer.update({ where: { id: Z }, data: { lastActivityAt: new Date(Date.now() - 2 * 365 * 86400_000) } as Any });
  const sw1 = await PV.sweepAutoErase(undefined, new Date());
  const sw2 = await PV.sweepAutoErase(undefined, new Date());
  const zReq: Any[] = await P.memberPrivacyRequest.findMany({ where: { customerId: Z, type: "DELETE" } });
  for (const r of zReq) made.requests.push(r.id);
  chk("M1.7-S6.5", "sweepAutoErase (settings.member.privacy.autoEraseYears = 1): Z (lastActivityAt 2 ปีก่อน) → คำขอ DELETE PENDING requestedVia API + approval (ไม่ลบเอง — รออนุมัติ) · รันซ้ำ → ไม่สร้างซ้ำ (created 0) · Z ยัง ACTIVE", sw1?.created >= 1 && sw2?.created === 0 && zReq.length === 1 && zReq[0].status === "PENDING" && zReq[0].requestedVia === "API" && !!zReq[0].approvalRequestId && ((await prisma.customer.findUnique({ where: { id: Z } })) as Any).status === "ACTIVE", "1 คำขอ", JSON.stringify({ sw1, sw2, z: zReq.map((r) => [r.status, r.requestedVia]) }));

  // ═══ S7 UI (ภาพ 14) ═══
  const page = read("src/app/app/sys/[id]/member/settings/privacy/page.tsx"); const act = read("src/lib/modules/member/privacy-actions.ts");
  const uiAll = existsSync("src/components/member") ? readdirSync("src/components/member").filter((f) => f.endsWith(".tsx")).map((f) => read(`src/components/member/${f}`)).join("\n") : "";
  const TIDS = ["privacy-page", "privacy-policies", "privacy-consent-channels", "privacy-sensitive", "privacy-sensitive-unlinked", "privacy-access-log", "privacy-requests", "privacy-auto-erase"];
  chk("M1.7-S7.1", "หน้า settings/privacy: requireTenant · canManagePrivacy (ไม่มี = notFound) · testid 8 · ช่องทางยินยอมวนจาก channels.ts consentChannels() (ไม่ฮาร์ดโค้ด) · ชิปตำแหน่ง/แผนกจาก hrPositionsSummary + คำเตือน 'ยังไม่ผูก' ลิงก์ไป HR · privacy-actions.ts 'use server' gate member.privacy.manage · ไม่มีอีโมจิ · MemberTabs/PageHeader", /requireTenant/.test(page) && /notFound/.test(page) && /privacy\.manage|canManagePrivacy/.test(page) && TIDS.every((t) => (page + uiAll).includes(t)) && /consentChannels/.test(page + uiAll) && /hrPositionsSummary/.test(page) && /ยังไม่ผูก/.test(uiAll) && /^\s*"use server"/m.test(act) && /member\.privacy\.manage/.test(act) && !EMOJI.test(uiAll.replace(/\/\/.*$/gm, "")) && /MemberTabs/.test(page) && /PageHeader/.test(page), "ครบ", `missing=${TIDS.filter((t) => !(page + uiAll).includes(t)).join(",")} chan=${/consentChannels/.test(page + uiAll)} hr=${/hrPositionsSummary/.test(page)} act=${/member\.privacy\.manage/.test(act)}`);
  const dir = `${mq.MQC.shotsDir}/1.7`;
  const shots = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".png")) : [];
  const sumOf = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const rO = sumOf("owner")?.results?.find((x: Any) => x.name === "settings-privacy-owner" && x.device === "desktop");
  const rT = sumOf("thana")?.results?.find((x: Any) => x.name === "settings-privacy-thana" && x.device === "desktop");
  chk("M1.7-S7.2", "ภาพ 14: settings-privacy-owner desktop+mobile 200 ไม่มี console error · thana 404 · PARITY: ผ่าน ใน wo-notes/member-M1.7.md", shots.includes("settings-privacy-owner-desktop.png") && shots.includes("settings-privacy-owner-mobile.png") && rO?.status === 200 && rO.missing.length === 0 && rO.errors.length === 0 && rT?.status === 404 && /PARITY:\s*ผ่าน/.test(read("ledger/wo-notes/member-M1.7.md")), "200/404/PARITY", `shots=${shots.join(",")} o=${rO?.status} t=${rT?.status}`, "MAJOR");

  // ═══ S8 events / โครง ═══
  const consumers = read("src/lib/outbox-consumers.ts"); const A2 = (await import("@/lib/automation/labels" as string)) as Any; const W2 = (await import("@/lib/webhooks/labels" as string)) as Any;
  chk("M1.7-S8.1", "member.consent.changed ลง 3 ทะเบียน (consumer · AUTOMATION_EVENTS ป้ายไทย · WEBHOOK 1 ครั้ง) · cron.ts รายวันเรียก sweepAutoErase", /"member\.consent\.changed":/.test(consumers) && A2.AUTOMATION_EVENTS.some((x: Any) => x.value === "member.consent.changed" && /[ก-๙]/.test(x.label)) && W2.WEBHOOK_EVENTS.filter((x: Any) => x.value === "member.consent.changed").length === 1 && /sweepAutoErase/.test(read("src/lib/platform/cron.ts")), "ครบ", "ขาด");
  const src = read("src/lib/modules/member/privacy.ts"); const eff = read("src/lib/approval-effects.ts");
  chk("M1.7-S8.2", "privacy.ts ไม่ import โมดูลอื่นตรงนอก facade (party/point/chat/account/kanban ผ่าน index · approval ผ่าน service = เส้น member→approval ใน fitness) · approval-effects.ts มีเคส member.erase · ไม่มี any · sanitize HTML ผ่าน @/lib/core/sanitize หรือ util เดิม", !/@\/lib\/modules\/(chat|account|kanban|pos|booking)\/(?!index)[a-z-]+"/.test(src) && /member\.erase/.test(eff) && !/\bany\b/.test(src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")) && /sanitize/i.test(src), "สะอาด", `cross=${/@\/lib\/modules\/(chat|account|kanban|pos|booking)\/(?!index)[a-z-]+"/.test(src)} eff=${/member\.erase/.test(eff)}`, "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M1.7-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  for (const id of made.sensitive) await d(() => P.memberSensitivePolicy.delete({ where: { id } }));
  await d(() => P.memberPrivacyPolicy.deleteMany({ where: { systemId: SYS } }));
  for (const id of made.requests) await d(() => P.memberPrivacyRequest.delete({ where: { id } }));
  for (const id of made.approvalPolicies) { await d(() => prisma.approvalRequest.deleteMany({ where: { policyId: id } })); await d(() => P.approvalStep.deleteMany({ where: { policyId: id } })); await d(() => P.approvalPolicy.delete({ where: { id } })); }
  if (made.sales.length) { await d(() => prisma.pointLedger.deleteMany({ where: { tenantId: tid, refId: { in: made.sales } } })); await d(() => prisma.posSale.deleteMany({ where: { id: { in: made.sales } } })); }
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberFieldValueHistory", "memberChannelIdentity", "memberAccessLog", "memberActivity", "memberPrivacyRequest", "memberAddress", "pointLedger", "pointBalance"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } }));
  }
  await d(() => P.memberAccessLog.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 3600_000) } } }));
  await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: "member." }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M1.7: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
