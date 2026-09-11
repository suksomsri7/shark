// QC — CRM v2 WO C1.1: schema crm_v2_a (additive) + enum + Team/TeamMember (core) + ตารางตัวตน/วัตถุ
//      + MemberSection/Field objectKey + partyId ทุกระบบ (C11) + core/teams.ts + backfill 6 สคริปต์ + seed ชุดข้อมูล QC CRM
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/CRM-RUN.md §2 C1.1 · พิมพ์เขียว docs/modules/20-crm-v2.md §4 §5.9
// requires: crm-seed
//
// 🔴 กติกาข้อสอบ (ทุกไฟล์ qc-crm-*.mts ต้องมีครบ):
//   1) SKIP guard — ถ้าของที่ใบนี้ต้องสร้างยังไม่มี → พิมพ์ SKIPPED + JSON_SUMMARY skipped:true แล้ว exit 0
//   2) chk(id, ชื่อ, ok, expected, actual, sev) — id = "<WO>-S<กลุ่ม>.<ข้อ>" ตรงกับ CRM-RUN §2
//   3) ทุกแถวที่ข้อสอบสร้าง ต้องลบใน finally (คืนสภาพชุดข้อมูล) · ห้ามแก้ข้อมูล seed
//   4) จบด้วยบรรทัด JSON_SUMMARY {total, passed, findings[]} · exit 0 เมื่อผ่านหมด
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const migDir = existsSync("prisma/migrations") ? readdirSync("prisma/migrations").find((d) => /_crm_v2_a$/.test(d)) : undefined;
if (!migDir || !existsSync("src/lib/core/teams.ts") || !existsSync("scripts/seed-crm-qc.mts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (prisma/migrations/*_crm_v2_a · src/lib/core/teams.ts · scripts/seed-crm-qc.mts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const cq = (await import("./crm-qc-env.mts" as string)) as {
  CQC: Any; CRM_V2A_TABLES: readonly string[]; CRM_BACKFILLS: readonly string[]; PARTY_LINK_TABLES: readonly string[];
  resolveCrmScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null>;
};
const { CQC, CRM_V2A_TABLES, CRM_BACKFILLS, PARTY_LINK_TABLES } = cq;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const q = async <T = Any,>(sql: string): Promise<T[]> => (await prisma.$queryRawUnsafe(sql)) as T[];
const P = prisma as Any;
const tables = async () => new Set((await q<{ table_name: string }>(`select table_name from information_schema.tables where table_schema='public'`)).map((r) => r.table_name));
const cols = async (t: string) => new Set((await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='${t}'`)).map((c) => c.column_name));
const enumVals = async (name: string) => (await q<{ enumlabel: string }>(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='${name}'`)).map((r) => r.enumlabel);
// pg เขียนชื่อคอลัมน์ตัวพิมพ์เล็กโดยไม่ใส่คำพูด (บทเรียน M1.1) — จับทั้ง "col" และ col
const hasIdx = async (t: string, colsIn: string[], unique = false) => {
  const rows = await q<{ indexdef: string }>(`select indexdef from pg_indexes where tablename='${t}' and indexdef ${unique ? "" : "not "}ilike '%unique%'`);
  return rows.some((r) => { const body = r.indexdef.slice(r.indexdef.indexOf("USING")); return colsIn.every((c) => body.includes(`"${c}"`) || new RegExp(`[(, ]${c}[,) ]`).test(body)); });
};
const missing = (set: Set<string>, arr: string[]) => arr.filter((c) => !set.has(c)).join(",");
const run = (script: string, args: string[] = []) => {
  const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${script}`, ...args], { encoding: "utf8", env: process.env, timeout: 900_000 });
  return { code: r.status ?? -1, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};
const snapshot = async (tid: string) => {
  const n = async (m: string, w: Record<string, unknown>) => (typeof P[m]?.count === "function" ? P[m].count({ where: w }) : -1);
  return {
    companies: await n("crmCompany", { tenantId: tid }), companyContacts: await n("crmCompanyContact", { company: { tenantId: tid } }),
    history: await n("crmDealStageHistory", { deal: { tenantId: tid } }), lostReasons: await n("crmLostReason", { tenantId: tid }),
    visibility: await n("crmVisibilityPolicy", { tenantId: tid }), parties: await n("party", { tenantId: tid }),
    contactsNoFirst: await n("crmContact", { tenantId: tid, firstName: null }),
    apptNoParty: await n("appointment", { tenantId: tid, partyId: null, customerPhone: { not: null } }),
  };
};

let tid = ""; let SYS = "";
const made = { teams: [] as string[] };
try {
  const scope = await cq.resolveCrmScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed (scripts/seed-crm-qc.mts)");
  tid = scope.tenantId; SYS = scope.systemId;
  const E = JSON.parse(readFileSync(CQC.expectedPath, "utf8"));

  // ═══ S1 schema (พิมพ์เขียว §4.1–4.3) ═══
  const T = await tables();
  chk("C1.1-S1.1", `migration crm_v2_a มีจริง (${migDir}) + ตารางใหม่ ${CRM_V2A_TABLES.length} ตารางครบ`, migDir && CRM_V2A_TABLES.every((t) => T.has(t)), CRM_V2A_TABLES.join(","), `ขาด: ${CRM_V2A_TABLES.filter((t) => !T.has(t)).join(",") || "-"}`);
  const cc = await cols("CrmContact"); const cd = await cols("CrmDeal"); const ca = await cols("CrmActivity"); const cs = await cols("CrmStage"); const cp = await cols("CrmPipeline");
  const CC = ["firstName", "lastName", "companyId", "jobTitle", "leadStatus", "score", "scoreUpdatedAt", "scoreBand", "teamId", "lastActivityAt", "nextActivityAt", "emailOptOut", "emailBouncedAt", "marketingOptOut", "convertedAt", "assignedAt", "assignedBy", "sourceKind", "sourceChannel", "sourceDetail", "tags", "mergedIntoId"];
  const CD = ["companyId", "teamId", "stageEnteredAt", "stalledAt", "lastActivityAt", "nextStep", "forecastCategory", "lostReasonId", "sourceKind", "sourceDetail", "invoiceDocId", "wonValueSatang", "paidSatang", "collaboratorUserIds", "currency", "discountBp", "tags", "probabilityOverride", "reopenedCount", "kanbanCardId"];
  const CA = ["companyId", "direction", "channel", "startAt", "endAt", "durationSec", "outcome", "body", "recordingFileId", "transcript", "aiSummary", "aiNextStep", "attendees", "location", "remindAt", "source", "sourceRef", "completedById", "kanbanCardId", "customRecordId", "priority"];
  chk("C1.1-S1.2", "คอลัมน์ใหม่ CrmContact/CrmDeal/CrmActivity/CrmStage(staleDays,requireFields)/CrmPipeline(teamIds,autoInvoiceOnWon,kind) ครบ · คอลัมน์เดิมยังอยู่ (name,phone,email,company · title,valueSatang,kind,quotationDocId · type,title,dueAt,doneAt)",
    !missing(cc, [...CC, "name", "phone", "email", "company", "lifecycleStage", "memberCustomerId", "partyId"]) && !missing(cd, [...CD, "title", "valueSatang", "kind", "quotationDocId", "contactId", "stageId"]) && !missing(ca, [...CA, "type", "title", "dueAt", "doneAt"]) && !missing(cs, ["staleDays", "requireFields", "requireLines", "requireQuotation"]) && !missing(cp, ["teamIds", "autoInvoiceOnWon", "kind"]),
    "ครบ", `contact:${missing(cc, CC)} deal:${missing(cd, CD)} act:${missing(ca, CA)} stage:${missing(cs, ["staleDays", "requireFields", "requireLines", "requireQuotation"])} pipe:${missing(cp, ["teamIds", "autoInvoiceOnWon", "kind"])}`);
  const ENUMS: Record<string, string[]> = {
    CrmLeadStatus: ["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "NURTURE"], CrmLifecycleStage: ["LEAD", "PROSPECT", "CUSTOMER", "LOST", "CHURNED"],
    CrmScoreBand: ["HOT", "WARM", "COLD"], CrmContactRole: ["DECISION_MAKER", "INFLUENCER", "COORDINATOR", "BILLING", "TECHNICAL", "END_USER", "OTHER"],
    CrmForecastCategory: ["PIPELINE", "BEST_CASE", "COMMIT", "OMITTED"], CrmDirection: ["IN", "OUT"],
    CrmActivityType: ["CALL", "MEETING", "EMAIL", "LINE", "TASK", "NOTE", "CHAT", "SMS", "WHATSAPP", "VISIT", "WEB", "PORTAL"],
    CrmActivitySource: ["MANUAL", "AUTO", "EMAIL", "CHAT", "CALENDAR", "PORTAL", "WEB", "API", "RULE"], CrmPriority: ["LOW", "NORMAL", "HIGH"],
    CrmCompanySize: ["MICRO", "SMALL", "MEDIUM", "LARGE", "ENTERPRISE"], CrmPipelineKind: ["SALES", "RENEWAL", "SERVICE"],
    CustomParent: ["CUSTOMER", "CONTACT", "COMPANY", "DEAL", "NONE"], CustomRecordType: ["CONTACT", "COMPANY", "DEAL", "CUSTOM"],
    MemberAddressOwner: ["CUSTOMER", "CONTACT", "COMPANY"], TeamRole: ["LEAD", "MEMBER"], AutomationScope: ["KANBAN", "MEMBER_TIER", "MEMBER_JOURNEY", "CRM"],
  };
  const enumMiss: string[] = [];
  for (const [name, vals] of Object.entries(ENUMS)) { const have = await enumVals(name); for (const v of vals) if (!have.includes(v)) enumMiss.push(`${name}.${v}`); }
  chk("C1.1-S1.3", `enum ใหม่/ขยาย ${Object.keys(ENUMS).length} ตัว ครบทุกค่า (§4.2)`, enumMiss.length === 0, "ครบ", enumMiss.join(",") || "-");
  const scopeSrc = read("src/lib/core/scope.ts");
  const scopeMiss = CRM_V2A_TABLES.filter((t) => !new RegExp(`\\b${t}\\b`).test(scopeSrc));
  const idxOk = (await hasIdx("CrmCompany", ["systemId", "partyId"], true)) && (await hasIdx("CrmCompanyContact", ["companyId", "contactId"], true)) && (await hasIdx("CustomRecordValue", ["recordId", "fieldId"], true)) && (await hasIdx("MemberSection", ["systemId", "objectKey", "key"], true)) && (await hasIdx("MemberField", ["systemId", "objectKey", "key"], true)) && (await hasIdx("Team", ["tenantId", "name"], true)) && (await hasIdx("CrmDealStageHistory", ["dealId", "enteredAt"])) && (await hasIdx("CrmDeal", ["systemId", "stalledAt"])) && (await hasIdx("CrmContact", ["systemId", "score"]));
  chk("C1.1-S1.4", "scope.ts ลงทะเบียนตารางใหม่ทุกตัว (F1) + unique/index สำคัญ (CrmCompany(systemId,partyId) · CompanyContact · RecordValue(recordId,fieldId) · MemberSection/Field(systemId,objectKey,key) · Team(tenantId,name) · StageHistory · Deal.stalledAt · Contact.score)", scopeMiss.length === 0 && idxOk, "ครบ", `scope ขาด: ${scopeMiss.join(",") || "-"} · idx ${idxOk ? "ok" : "ขาด"}`);

  // ═══ S2 objectKey ไม่ชนของสมาชิก ═══
  const ms = await cols("MemberSection"); const mf = await cols("MemberField");
  const dflt = await q<{ column_default: string | null }>(`select column_default from information_schema.columns where table_name='MemberSection' and column_name='objectKey'`);
  chk("C1.1-S2.1", "MemberSection/MemberField มี objectKey default 'customer' + MemberSavedView.objectKey + MemberField.portalVisible/portalEditable", ms.has("objectKey") && mf.has("objectKey") && /customer/.test(dflt[0]?.column_default ?? "") && (await cols("MemberSavedView")).has("objectKey") && mf.has("portalVisible"), "มี", `sec:${ms.has("objectKey")} fld:${mf.has("objectKey")} dflt:${dflt[0]?.column_default}`);
  const ME = JSON.parse(read("scripts/member-expected.json") || "{}");
  const memberSecCount = await P.memberSection.count({ where: { tenantId: tid, systemId: ME.systemId ?? scope.systems.MEMBER, objectKey: "customer" } });
  const nonCustomerInMemberSys = await P.memberSection.count({ where: { tenantId: tid, systemId: ME.systemId ?? scope.systems.MEMBER, objectKey: { not: "customer" } } });
  chk("C1.1-S2.2", "ส่วน/ฟิลด์เดิมของสมาชิกทุกแถว objectKey=customer (ไม่มีแถว objectKey อื่นในระบบ MEMBER) · ยังมีส่วนของสมาชิก ≥ 2", memberSecCount >= 2 && nonCustomerInMemberSys === 0, "customer ทั้งหมด", `customer=${memberSecCount} อื่น=${nonCustomerInMemberSys}`);
  const m12 = run("qc-member-m1.2.mts");
  const m12sum = /JSON_SUMMARY (\{.*\})/.exec(m12.out)?.[1];
  const m12j = m12sum ? JSON.parse(m12sum) : { total: 0, passed: -1 };
  chk("C1.1-S2.3", "regression: qc-member-m1.2 (fields engine สมาชิก) ยังเขียวหลังเปลี่ยน unique", m12.code === 0 && m12j.passed === m12j.total && m12j.total > 0, "เขียว", `exit ${m12.code} ${m12j.passed}/${m12j.total}`);

  // ═══ S3 backfill 6 สคริปต์ (idempotent · dry-run ไม่เขียน) ═══
  const bfMissing = CRM_BACKFILLS.filter((s) => !existsSync(`scripts/${s}`));
  chk("C1.1-S3.1", `backfill 6 สคริปต์มีครบ (${CRM_BACKFILLS.join(", ")}) + ใช้ member-backfill-common (parseArgs/loadBackfillEnv)`, bfMissing.length === 0 && CRM_BACKFILLS.every((s) => /member-backfill-common/.test(read(`scripts/${s}`))), "ครบ", `ขาด: ${bfMissing.join(",") || "-"}`);
  const before = await snapshot(tid);
  const dry = CRM_BACKFILLS.map((s) => run(s, ["--tenant", CQC.tenantSlug, "--dry-run"]));
  const afterDry = await snapshot(tid);
  chk("C1.1-S3.2", "🔴 dry-run ทั้ง 6 ตัว exit 0 และไม่เขียนอะไรเลย (snapshot เท่าเดิม)", dry.every((r) => r.code === 0) && JSON.stringify(before) === JSON.stringify(afterDry), JSON.stringify(before), `exit ${dry.map((r) => r.code).join("/")} · ${JSON.stringify(afterDry)}`);
  const real = CRM_BACKFILLS.map((s) => run(s, ["--tenant", CQC.tenantSlug]));
  const afterReal = await snapshot(tid);
  chk("C1.1-S3.3", "🔴 รันจริงซ้ำ (seed รันไปแล้ว 1 รอบ) → exit 0 ทุกตัว และ snapshot เท่าเดิม (idempotent)", real.every((r) => r.code === 0) && JSON.stringify(afterReal) === JSON.stringify(before), JSON.stringify(before), `exit ${real.map((r) => r.code).join("/")} · ${JSON.stringify(afterReal)}`);
  chk("C1.1-S3.4", "backfill ทุกตัวพิมพ์ banner + สรุปต่อร้าน (มีคำว่า tenant/ร้าน และ slug ใน stdout)", real.every((r) => r.out.includes(CQC.tenantSlug)), "มี slug", real.map((r) => (r.out.includes(CQC.tenantSlug) ? "ok" : "no")).join("/"), "MAJOR");
  chk("C1.1-S3.5", "contact-names: CrmContact ทุกแถวของร้านมี firstName (แยกจาก name ที่ช่องว่างแรก)", afterReal.contactsNoFirst === 0, "0", String(afterReal.contactsNoFirst));
  chk("C1.1-S3.6", "party-links: Appointment ที่มีเบอร์ทุกแถวได้ partyId (จับคู่เบอร์ → Party)", afterReal.apptNoParty === 0, "0", String(afterReal.apptNoParty));

  // ═══ S4 companies-from-text ═══
  const textCo = await P.crmCompany.findMany({ where: { tenantId: tid, systemId: SYS, name: CQC.companies.textCompany }, include: { party: true } as Any }).catch(async () => P.crmCompany.findMany({ where: { tenantId: tid, systemId: SYS, name: CQC.companies.textCompany } }));
  chk("C1.1-S4.1", `"${CQC.companies.textCompany}" (ข้อความใน CrmContact.company ของผู้ติดต่อ 3 คน) → CrmCompany 1 แถวพอดี`, textCo.length === 1, "1", String(textCo.length));
  const tcId = textCo[0]?.id ?? "";
  const tcParty = textCo[0]?.partyId ? await P.party.findUnique({ where: { id: textCo[0].partyId } }) : null;
  const tcLinks = tcId ? await P.crmCompanyContact.count({ where: { companyId: tcId } }) : 0;
  chk("C1.1-S4.2", "บริษัทนั้นมี Party kind=COMPANY ชื่อเดียวกัน + CrmCompanyContact 3 แถว", tcParty?.kind === "COMPANY" && tcParty?.name === CQC.companies.textCompany && tcLinks === 3, "COMPANY/3", `${tcParty?.kind}/${tcLinks}`);
  const tcCached = tcId ? await P.crmContact.count({ where: { tenantId: tid, companyId: tcId } }) : 0;
  chk("C1.1-S4.3", "ผู้ติดต่อ 3 คนได้ companyId cache (isPrimary 1 คน + คนที่เหลืออยู่ในบริษัทเดียวกัน) และ company ข้อความเดิมยังอยู่ (ไม่ลบ)", tcCached === 3 && (await P.crmContact.count({ where: { tenantId: tid, company: CQC.companies.textCompany } })) === 3, "3/3", `${tcCached}/${await P.crmContact.count({ where: { tenantId: tid, company: CQC.companies.textCompany } })}`);

  // ═══ S5 partyId ทุกระบบ (C11) ═══
  const existing = PARTY_LINK_TABLES.filter((t) => T.has(t));
  const noParty = [] as string[];
  for (const t of existing) if (!(await cols(t)).has("partyId")) noParty.push(t);
  chk("C1.1-S5.1", `ตารางธุรกรรมที่มีในสคีมา (${existing.join(",")}) ทุกตัวมีคอลัมน์ partyId (ชื่อจริงตรวจแล้วใน wo-notes)`, existing.length >= 3 && noParty.length === 0, "ครบ", `ขาด: ${noParty.join(",") || "-"} (มี ${existing.length} ตาราง)`);
  const partyIdxMiss = [] as string[];
  for (const t of existing) if (!(await hasIdx(t, ["partyId"]))) partyIdxMiss.push(t);
  chk("C1.1-S5.2", "ทุกตารางที่เพิ่ม partyId มี index (partyId)", partyIdxMiss.length === 0, "ครบ", partyIdxMiss.join(",") || "-", "MAJOR");
  const cosWithTax = await P.crmCompany.count({ where: { tenantId: tid, systemId: SYS, taxId: { not: null } } });
  const partyCoWithTax = await P.party.count({ where: { tenantId: tid, kind: "COMPANY", taxId: { not: null } } });
  chk("C1.1-S5.3", `Party COMPANY ที่มีเลขภาษี = บริษัท QC ที่มีเลขภาษี (${CQC.companies.withTaxId}) — ไม่มี Party COMPANY ซ้ำ`, cosWithTax === CQC.companies.withTaxId && partyCoWithTax === CQC.companies.withTaxId, String(CQC.companies.withTaxId), `crm=${cosWithTax} party=${partyCoWithTax}`);
  const allCoHaveParty = (await P.crmCompany.count({ where: { tenantId: tid, partyId: null } })) === 0;
  const contactsNoParty = await P.crmContact.count({ where: { tenantId: tid, partyId: null } });
  chk("C1.1-S5.4", "CrmCompany ทุกแถวมี partyId (บังคับ) · CrmContact ทุกแถวมี partyId หลัง backfill party-links", allCoHaveParty && contactsNoParty === 0, "0/0", `coNull=${!allCoHaveParty} contactNull=${contactsNoParty}`);

  // ═══ S6 core/teams.ts ═══
  const teams = (await import("@/lib/core/teams")) as Any;
  const fnMiss = ["createTeam", "updateTeam", "archiveTeam", "addMember", "removeMember", "teamsOf", "membersOf", "unitIdsOf", "listTeams"].filter((f) => typeof teams[f] !== "function");
  chk("C1.1-S6.1", "src/lib/core/teams.ts export createTeam/updateTeam/archiveTeam/addMember/removeMember/teamsOf/membersOf/unitIdsOf/listTeams", fnMiss.length === 0, "ครบ", `ขาด: ${fnMiss.join(",") || "-"}`);
  let dupErr = false; let t1: Any = null;
  try {
    t1 = await teams.createTeam({ tenantId: tid }, { name: "ทีมทดสอบ C1.1", leadUserId: E.users.manager.userId, unitIds: [E.units.patong] });
    made.teams.push(t1.id);
    try { await teams.createTeam({ tenantId: tid }, { name: "ทีมทดสอบ C1.1", unitIds: [] }); } catch { dupErr = true; }
  } catch (e) { console.log("   createTeam error:", (e as Error).message); }
  chk("C1.1-S6.2", "createTeam → แถว Team + ชื่อซ้ำในร้านเดียวกัน → error (unique tenantId,name)", t1?.id && dupErr, "สร้างได้/ซ้ำ error", `${t1?.id ? "ok" : "no"}/${dupErr}`);
  let inTeams = false;
  if (t1?.id) {
    await teams.addMember({ tenantId: tid }, t1.id, { userId: E.users.thana.userId, role: "MEMBER" });
    const tof = await teams.teamsOf({ tenantId: tid }, E.users.thana.userId);
    inTeams = Array.isArray(tof) && tof.some((t: Any) => (t.id ?? t.teamId ?? t) === t1.id);
    const mof = await teams.membersOf({ tenantId: tid }, t1.id);
    inTeams = inTeams && Array.isArray(mof) && mof.some((m: Any) => (m.userId ?? m) === E.users.thana.userId);
  }
  chk("C1.1-S6.3", "addMember แล้ว teamsOf(user) มีทีมนี้ และ membersOf(team) มีคนนี้ · unitIdsOf คืน [patong]", inTeams && t1?.id && JSON.stringify(await teams.unitIdsOf({ tenantId: tid }, t1.id)) === JSON.stringify([E.units.patong]), "true", String(inTeams));
  let afterArchive = true;
  if (t1?.id) {
    await teams.archiveTeam({ tenantId: tid }, t1.id);
    const tof2 = await teams.teamsOf({ tenantId: tid }, E.users.thana.userId);
    afterArchive = !(Array.isArray(tof2) && tof2.some((t: Any) => (t.id ?? t.teamId ?? t) === t1.id));
  }
  chk("C1.1-S6.4", "archiveTeam → teamsOf ไม่คืนทีมที่เก็บถาวร (แถวยังอยู่ · archivedAt ไม่ null)", afterArchive && t1?.id && (await P.team.findUnique({ where: { id: t1.id } }))?.archivedAt, "ซ่อน+archivedAt", String(afterArchive));

  // ═══ S7 seed ตรงเฉลย + idempotent ═══
  const c = E.counts;
  const live = { companies: await P.crmCompany.count({ where: { tenantId: tid, systemId: SYS } }), contacts: await P.crmContact.count({ where: { tenantId: tid, systemId: SYS } }), deals: await P.crmDeal.count({ where: { tenantId: tid, systemId: SYS } }), won: await P.crmDeal.count({ where: { tenantId: tid, systemId: SYS, kind: "WON" } }), lost: await P.crmDeal.count({ where: { tenantId: tid, systemId: SYS, kind: "LOST" } }), activities: await P.crmActivity.count({ where: { tenantId: tid, systemId: SYS } }), records: await P.customRecord.count({ where: { tenantId: tid, systemId: SYS } }), teams: await P.team.count({ where: { tenantId: tid, archivedAt: null } }), history: await P.crmDealStageHistory.count({ where: { deal: { tenantId: tid } } }) };
  const expect = { companies: CQC.companies.total + 1, contacts: CQC.contacts.total, deals: CQC.deals.total, won: CQC.deals.won, lost: CQC.deals.lost, activities: CQC.activities.total, records: CQC.customObjects.contract.records, teams: CQC.teams.length };
  const okCounts = live.companies === expect.companies && live.contacts === expect.contacts && live.deals === expect.deals && live.won === expect.won && live.lost === expect.lost && live.activities === expect.activities && live.records === expect.records && live.teams === expect.teams && live.history >= CQC.deals.total && c.contacts === expect.contacts;
  chk("C1.1-S7.1", `seed ตรงสัญญา CQC: บริษัท ${expect.companies} (20 + บริษัทจากข้อความ 1) · ผู้ติดต่อ ${expect.contacts} · ดีล ${expect.deals} (WON ${expect.won}/LOST ${expect.lost}) · กิจกรรม ${expect.activities} · สัญญา ${expect.records} · ทีม ${expect.teams} · StageHistory ≥ ${CQC.deals.total} (backfill แถวแรก)`, okCounts, JSON.stringify(expect), JSON.stringify(live));
  const reseed = run("seed-crm-qc.mts");
  const live2 = { companies: await P.crmCompany.count({ where: { tenantId: tid, systemId: SYS } }), contacts: await P.crmContact.count({ where: { tenantId: tid, systemId: SYS } }), deals: await P.crmDeal.count({ where: { tenantId: tid, systemId: SYS } }), members: await P.customer.count({ where: { tenantId: tid } }) };
  chk("C1.1-S7.2", "🔴 seed idempotent: รันซ้ำ → exit 0 · จำนวน บริษัท/ผู้ติดต่อ/ดีล เท่าเดิม · สมาชิกของร้านไม่ถูกแตะ (จำนวนเท่า member-expected)", reseed.code === 0 && live2.companies === live.companies && live2.contacts === live.contacts && live2.deals === live.deals && live2.members === (ME.counts?.members ?? live2.members), JSON.stringify({ ...live, members: ME.counts?.members }), `exit ${reseed.code} ${JSON.stringify(live2)}`);
} catch (e) {
  console.error("💥", e);
  chk("C1.1-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  await cleanup();
  await prisma.$disconnect();
}
async function cleanup() {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ตารางอาจยังไม่มี */ } };
  for (const id of made.teams) { await d(() => P.teamMember.deleteMany({ where: { teamId: id } })); await d(() => P.team.delete({ where: { id } })); }
  made.teams = [];
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C1.1: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
