// QC — CRM v2 WO C1.1: schema crm_v2_a (additive) + enum + Team/TeamMember (core) + ตารางตัวตน/วัตถุ
//      + MemberSection/Field objectKey + partyId ทุกระบบ (C11) + core/teams.ts + backfill 6 สคริปต์ + seed ชุดข้อมูล QC CRM
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/CRM-RUN.md §2 C1.1 · พิมพ์เขียว docs/modules/20-crm-v2.md §4 §5.9
// requires: crm-seed
//
// ─── แก้/เพิ่มในใบ C0.1 (17 ก.ย. 2569) ───────────────────────────────────────────────────────
//  • S5 เดิมเดาชื่อตาราง (HotelBooking/ClinicPatient ไม่มีจริง) → ใช้ทะเบียน 2 กลุ่มจาก crm-qc-env.mts:
//    PARTY_LINK_NEW_COLUMN (5 ตาราง · crm_v2_a ต้อง ADD COLUMN) · PARTY_LINK_EXISTING_COLUMN (4 ตาราง · มีคอลัมน์แล้ว
//    แต่ไม่มีใครเขียน ⇒ ตรวจว่ามีค่าจริงหลัง backfill) · รวม 9 จุดเขียนตาม MASTER-PLAN §6 แถว C1.1
//  • เพิ่มข้อของสิ่งที่ใบ C1.1 เป็นหนี้แต่ไม่มีใครตรวจ: CrmVisibilityPolicy · CrmFileLink · CrmContactConsent ·
//    TeamMember.acceptingLeads · settings.crm.uiVersion=1 · สลับ unique ของ MemberSection/MemberField (ตรวจ "สภาพปลายทาง":
//    unique ใหม่ [systemId, objectKey, key] มี **และ** unique เก่า [systemId, key] หายไปแล้ว — MASTER-PLAN §6 สั่ง
//    ADD COLUMN → CREATE UNIQUE → DROP UNIQUE ในไฟล์เดียว) · คอลัมน์ RESOLUTIONS R-A (previousEmails ·
//    stageOnQuoteAccepted/RejectedId · autoWonOnPaid · pendingLines · pendingApprovalRequestId) · pinned/mentions (C19) ·
//    index ประกอบ §12 สองตัว · เงินเป็น BigInt ตามมติ C28
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
  PARTY_LINK_NEW_COLUMN: readonly string[]; PARTY_LINK_EXISTING_COLUMN: readonly string[];
  PARTY_LINK_IDENTITY: Record<string, { phoneColumn: string | null; phoneRequired: boolean; tagColumn: string; via?: string; note?: string }>;
  resolveCrmScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null>;
};
const { CQC, CRM_V2A_TABLES, CRM_BACKFILLS, PARTY_LINK_TABLES, PARTY_LINK_NEW_COLUMN, PARTY_LINK_EXISTING_COLUMN, PARTY_LINK_IDENTITY } = cq;
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
const cols = async (t: string) => new Set((await q<{ column_name: string }>(`select column_name from information_schema.columns where table_schema='public' and table_name='${t}'`)).map((c) => c.column_name));
const enumVals = async (name: string) => (await q<{ enumlabel: string }>(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='${name}'`)).map((r) => r.enumlabel);
// pg เขียนชื่อคอลัมน์ตัวพิมพ์เล็กโดยไม่ใส่คำพูด (บทเรียน M1.1) — จับทั้ง "col" และ col
const hasIdx = async (t: string, colsIn: string[], unique = false) => {
  const rows = await q<{ indexdef: string }>(`select indexdef from pg_indexes where schemaname='public' and tablename='${t}' and indexdef ${unique ? "" : "not "}ilike '%unique%'`);
  return rows.some((r) => { const body = r.indexdef.slice(r.indexdef.indexOf("USING")); return colsIn.every((c) => body.includes(`"${c}"`) || new RegExp(`[(, ]${c}[,) ]`).test(body)); });
};
const missing = (set: Set<string>, arr: string[]) => arr.filter((c) => !set.has(c)).join(",");
type ColInfo = { data_type: string; udt_name: string; column_default: string | null; is_nullable: string; numeric_precision: number | null; numeric_scale: number | null };
/** ข้อมูลชนิด/ค่าเริ่มต้นรายคอลัมน์ (ใช้ตรวจ BigInt · Json? · String[] · Decimal(18,4) · default false/true) */
const colInfo = async (t: string): Promise<Map<string, ColInfo>> => {
  const rows = await q<{ column_name: string } & ColInfo>(`select column_name, data_type, udt_name, column_default, is_nullable, numeric_precision, numeric_scale from information_schema.columns where table_schema='public' and table_name='${t}'`);
  return new Map(rows.map((r) => [r.column_name, { data_type: r.data_type, udt_name: r.udt_name, column_default: r.column_default, is_nullable: r.is_nullable, numeric_precision: r.numeric_precision === null ? null : Number(r.numeric_precision), numeric_scale: r.numeric_scale === null ? null : Number(r.numeric_scale) }]));
};
/** รายชื่อคอลัมน์ของแต่ละ index (เรียงตามลำดับจริง) — ใช้ตรวจแบบ "ชุดตรงเป๊ะ" ไม่ใช่แค่ "มีคอลัมน์นี้อยู่ด้วย" */
const idxSets = async (t: string, unique = false): Promise<string[][]> => {
  const rows = await q<{ indexdef: string }>(`select indexdef from pg_indexes where schemaname='public' and tablename='${t}' and indexdef ${unique ? "" : "not "}ilike '%unique%'`);
  return rows.map((r) => (/USING \w+ \(([^)]*)\)/.exec(r.indexdef)?.[1] ?? "").split(",").map((c) => c.trim().replace(/"/g, "").replace(/\s+.*$/, "")).filter(Boolean));
};
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const hasSet = (sets: string[][], want: string[]) => sets.some((x) => sameSet(x, want));
const n1 = async (sql: string) => Number((await q<{ n: number }>(sql))[0]?.n ?? -1);
const migSql = read(`prisma/migrations/${migDir}/migration.sql`);
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
const made = { teams: [] as string[], systems: [] as string[] };
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
    CrmVisibility: ["OWN", "TEAM", "ALL"],
    CustomParent: ["CUSTOMER", "CONTACT", "COMPANY", "DEAL", "NONE"], CustomRecordType: ["CONTACT", "COMPANY", "DEAL", "CUSTOM"],
    MemberAddressOwner: ["CUSTOMER", "CONTACT", "COMPANY"], TeamRole: ["LEAD", "MEMBER"], AutomationScope: ["KANBAN", "MEMBER_TIER", "MEMBER_JOURNEY", "CRM"],
    MemberLookupTarget: ["CONTACT", "COMPANY", "DEAL", "CUSTOM"], KanbanLinkType: ["DEAL", "COMPANY", "CUSTOM_RECORD"],
  };
  const enumMiss: string[] = [];
  for (const [name, vals] of Object.entries(ENUMS)) { const have = await enumVals(name); for (const v of vals) if (!have.includes(v)) enumMiss.push(`${name}.${v}`); }
  chk("C1.1-S1.3", `enum ใหม่/ขยาย ${Object.keys(ENUMS).length} ตัว ครบทุกค่า (§4.2)`, enumMiss.length === 0, "ครบ", enumMiss.join(",") || "-");
  const scopeSrc = read("src/lib/core/scope.ts");
  const scopeMiss = CRM_V2A_TABLES.filter((t) => !new RegExp(`\\b${t}\\b`).test(scopeSrc));
  const idxOk = (await hasIdx("CrmCompany", ["systemId", "partyId"], true)) && (await hasIdx("CrmCompanyContact", ["companyId", "contactId"], true)) && (await hasIdx("CustomRecordValue", ["recordId", "fieldId"], true)) && (await hasIdx("MemberSection", ["systemId", "objectKey", "key"], true)) && (await hasIdx("MemberField", ["systemId", "objectKey", "key"], true)) && (await hasIdx("Team", ["tenantId", "name"], true)) && (await hasIdx("CrmDealStageHistory", ["dealId", "enteredAt"])) && (await hasIdx("CrmDeal", ["systemId", "stalledAt"])) && (await hasIdx("CrmContact", ["systemId", "score"]));
  chk("C1.1-S1.4", "scope.ts ลงทะเบียนตารางใหม่ทุกตัว (F1) + unique/index สำคัญ (CrmCompany(systemId,partyId) · CompanyContact · RecordValue(recordId,fieldId) · MemberSection/Field(systemId,objectKey,key) · Team(tenantId,name) · StageHistory · Deal.stalledAt · Contact.score)", scopeMiss.length === 0 && idxOk, "ครบ", `scope ขาด: ${scopeMiss.join(",") || "-"} · idx ${idxOk ? "ok" : "ขาด"}`);

  // ─── คอลัมน์/ชนิด/index ที่ใบ C1.1 เป็นหนี้ตาม MASTER-PLAN §6 + RESOLUTIONS R-A (เพิ่มในใบ C0.1) ───
  const ciContact = await colInfo("CrmContact"); const ciDeal = await colInfo("CrmDeal"); const ciPipe = await colInfo("CrmPipeline"); const ciAct = await colInfo("CrmActivity");
  const isTextArray = (c?: ColInfo) => c?.data_type === "ARRAY" && c?.udt_name === "_text";
  const isZeroDefault = (c?: ColInfo) => /^0(\D|$)/.test((c?.column_default ?? "").replace(/'/g, "").trim());
  const hasEmptyArrayDefault = (c?: ColInfo) => !!c?.column_default && (/\{\}/.test(c.column_default) || /ARRAY\[\]/i.test(c.column_default));
  const prevEmails = ciContact.get("previousEmails");
  chk("C1.1-S1.5", "R-A: CrmContact.previousEmails String[] @default([]) (C1.4 เขียน · C2.5 ใช้จับคู่อีเมลขาเข้า)",
    isTextArray(prevEmails) && hasEmptyArrayDefault(prevEmails), "text[] default []", prevEmails ? `${prevEmails.data_type}/${prevEmails.udt_name}/${prevEmails.column_default ?? "no default"}` : "ไม่มีคอลัมน์");
  const autoWon = ciPipe.get("autoWonOnPaid");
  chk("C1.1-S1.6", "R-A: CrmPipeline.stageOnQuoteAcceptedId? · stageOnQuoteRejectedId? · autoWonOnPaid Boolean @default(false)",
    ciPipe.has("stageOnQuoteAcceptedId") && ciPipe.has("stageOnQuoteRejectedId") && autoWon?.data_type === "boolean" && /false/i.test(autoWon?.column_default ?? ""),
    "3 คอลัมน์ · autoWonOnPaid default false", `acc:${ciPipe.has("stageOnQuoteAcceptedId")} rej:${ciPipe.has("stageOnQuoteRejectedId")} autoWon:${autoWon?.data_type}/${autoWon?.column_default ?? "-"}`);
  const pendingLines = ciDeal.get("pendingLines");
  chk("C1.1-S1.7", "R-A: CrmDeal.pendingLines Json? + pendingApprovalRequestId? (ไลน์ที่เกินเพดานส่วนลดรออนุมัติ crm.discount)",
    (pendingLines?.data_type === "jsonb" || pendingLines?.data_type === "json") && pendingLines?.is_nullable === "YES" && ciDeal.has("pendingApprovalRequestId"),
    "jsonb nullable + pendingApprovalRequestId", `pendingLines:${pendingLines?.data_type ?? "-"}/${pendingLines?.is_nullable ?? "-"} req:${ciDeal.has("pendingApprovalRequestId")}`);
  const pinned = ciAct.get("pinned"); const mentions = ciAct.get("mentions");
  chk("C1.1-S1.8", "C19: CrmActivity.pinned Boolean @default(false) + mentions String[] @default([]) (โน้ตปักหมุด · คอมเมนต์ @mention ของ C1.6)",
    pinned?.data_type === "boolean" && /false/i.test(pinned?.column_default ?? "") && isTextArray(mentions) && hasEmptyArrayDefault(mentions),
    "pinned bool false + mentions text[] []", `pinned:${pinned?.data_type ?? "-"}/${pinned?.column_default ?? "-"} mentions:${mentions?.udt_name ?? "-"}/${mentions?.column_default ?? "-"}`);
  const paidC = ciDeal.get("paidSatang"); const wonC = ciDeal.get("wonValueSatang"); const valC = ciDeal.get("valueSatang");
  chk("C1.1-S1.9", "💰 มติ C28: คอลัมน์เงินใหม่เป็น BigInt (CrmDeal.paidSatang · wonValueSatang) · valueSatang เดิมยังเป็น Int (ห้ามเปลี่ยนชนิด — ไคลเอนต์เก่าพัง)",
    paidC?.data_type === "bigint" && wonC?.data_type === "bigint" && valC?.data_type === "integer",
    "bigint/bigint/integer", `paid:${paidC?.data_type ?? "-"} won:${wonC?.data_type ?? "-"} value:${valC?.data_type ?? "-"}`);
  const dealIdx = await idxSets("CrmDeal"); const crvIdx = await idxSets("CustomRecordValue");
  const idx12a = hasSet(dealIdx, ["systemId", "ownerUserId", "kind", "expectedCloseAt"]); const idx12b = hasSet(crvIdx, ["fieldId", "valueDate"]);
  chk("C1.1-S1.10", "R-A/§12: index ประกอบ CrmDeal(systemId, ownerUserId, kind, expectedCloseAt) + CustomRecordValue(fieldId, valueDate) (รายงาน/กฎ 'ฟิลด์วันที่ถึงกำหนด')",
    idx12a && idx12b, "มีทั้ง 2", `deal:${idx12a} recordValue:${idx12b}`);
  const vp = await cols("CrmVisibilityPolicy"); const vpUniq = await idxSets("CrmVisibilityPolicy", true);
  chk("C1.1-S1.11", "ตารางใหม่ CrmVisibilityPolicy (C9 · C1.7 ใช้): tenantId systemId role? teamId? pipelineId? entity visibility + unique(systemId, role, teamId, pipelineId, entity)",
    !missing(vp, ["tenantId", "systemId", "role", "teamId", "pipelineId", "entity", "visibility"]) && hasSet(vpUniq, ["systemId", "role", "teamId", "pipelineId", "entity"]),
    "คอลัมน์ครบ + unique 5 คอลัมน์", `ขาด: ${missing(vp, ["tenantId", "systemId", "role", "teamId", "pipelineId", "entity", "visibility"]) || "-"} · unique ${JSON.stringify(vpUniq)}`);
  const fl = await cols("CrmFileLink"); const flIdx = await idxSets("CrmFileLink");
  chk("C1.1-S1.12", "ตารางใหม่ CrmFileLink (C19 ไฟล์แนบ): tenantId systemId entityType entityId fileId name size mime uploadedById createdAt + index(systemId, entityType, entityId)",
    !missing(fl, ["tenantId", "systemId", "entityType", "entityId", "fileId", "name", "size", "mime", "uploadedById", "createdAt"]) && hasSet(flIdx, ["systemId", "entityType", "entityId"]),
    "คอลัมน์ครบ + index 3 คอลัมน์", `ขาด: ${missing(fl, ["tenantId", "systemId", "entityType", "entityId", "fileId", "name", "size", "mime", "uploadedById", "createdAt"]) || "-"} · idx ${JSON.stringify(flIdx)}`);
  const cons = await cols("CrmContactConsent"); const consIdx = await idxSets("CrmContactConsent"); const consInfo = await colInfo("CrmContactConsent");
  chk("C1.1-S1.13", "ตารางใหม่ CrmContactConsent (C20 · append-only · สถานะปัจจุบัน = แถวล่าสุดต่อช่องทาง): tenantId systemId contactId channel granted source policyVersion? note? createdAt createdById? + index(contactId, channel, createdAt) · ไม่มี unique ต่อ (contactId, channel) เพราะต้องเก็บได้หลายแถว",
    !missing(cons, ["tenantId", "systemId", "contactId", "channel", "granted", "source", "policyVersion", "note", "createdAt", "createdById"]) && consInfo.get("granted")?.data_type === "boolean" && hasSet(consIdx, ["contactId", "channel", "createdAt"]) && !hasSet(await idxSets("CrmContactConsent", true), ["contactId", "channel"]),
    "คอลัมน์ครบ + index(contactId,channel,createdAt) + ไม่มี unique(contactId,channel)", `ขาด: ${missing(cons, ["tenantId", "systemId", "contactId", "channel", "granted", "source", "policyVersion", "note", "createdAt", "createdById"]) || "-"} · idx ${JSON.stringify(consIdx)}`);

  // ─── รูปร่างของตารางที่ยังไม่มีใครตรึง (เพิ่มในใบ C0.1 ตามที่ผู้คุมงานสั่ง) — อ้างพิมพ์เขียว §4.3 ตรงตัว ───
  const coCols = await cols("CrmCompany"); const coInfo = await colInfo("CrmCompany");
  const CO_NEED = ["tenantId", "systemId", "partyId", "name", "legalName", "taxId", "branchCode", "industry", "size", "website", "emailDomain", "phone", "email", "lineOaId",
    "lifecycleStage", "score", "ownerUserId", "teamId", "parentCompanyId", "accountContactId", "memberCustomerId", "tags", "note", "logoFileId", "employeeCount", "foundedYear", "mergedIntoId", "archivedAt"];
  chk("C1.1-S1.14", "CrmCompany (§4.3) คอลัมน์ครบ · partyId เป็น NOT NULL (บังคับผูก Party kind=COMPANY) · accountContactId (สะพานบัญชี C1.3/C1.8) · memberCustomerId · mergedIntoId (รวมบริษัท)",
    !missing(coCols, CO_NEED) && coInfo.get("partyId")?.is_nullable === "NO",
    "ครบ + partyId NOT NULL", `ขาด: ${missing(coCols, CO_NEED) || "-"} · partyId nullable=${coInfo.get("partyId")?.is_nullable ?? "ไม่มีคอลัมน์"}`);
  const bigCo = ["annualRevenueSatang", "wonValueSatang", "outstandingSatang"].filter((c) => coInfo.get(c)?.data_type !== "bigint");
  const odc = coInfo.get("openDealCount");
  const cacheDefaults = isZeroDefault(coInfo.get("wonValueSatang")) && isZeroDefault(coInfo.get("outstandingSatang")) && isZeroDefault(odc);
  chk("C1.1-S1.15", "💰 C28 + §4.3: เงินของ CrmCompany เป็น BigInt (annualRevenueSatang? · wonValueSatang @default(0) · outstandingSatang @default(0)) + แคชที่ C1.3 ใช้: openDealCount Int @default(0) · lastActivityAt (X3 ต้องบวกแบบ atomic บนคอลัมน์พวกนี้)",
    bigCo.length === 0 && odc?.data_type === "integer" && coCols.has("lastActivityAt") && cacheDefaults,
    "bigint 3 ตัว + openDealCount int default 0 + lastActivityAt", `ไม่ใช่ bigint: ${bigCo.join(",") || "-"} · openDealCount=${odc?.data_type ?? "-"}/${odc?.column_default ?? "-"} · lastActivityAt=${coCols.has("lastActivityAt")}`);
  const objCols = await cols("CustomObject"); const objInfo = await colInfo("CustomObject");
  const OBJ_NEED = ["tenantId", "systemId", "key", "label", "labelPlural", "icon", "parentType", "relation", "titleFieldKey", "showAsTab", "portalVisible", "allowAttachments", "allowActivities", "unitScoped", "sortOrder", "templateKey", "recordCount", "archivedAt"];
  const recCount = objInfo.get("recordCount");
  chk("C1.1-S1.16", "CustomObject (§4.3) คอลัมน์ครบ (titleFieldKey · showAsTab → tabsFor ของ C1.2b · templateKey → เทมเพลตวัตถุ 8) + recordCount Int @default(0) (ตัวนับที่ C1.2b ต้องบวกแบบ atomic · X3) + unique(systemId, key)",
    !missing(objCols, OBJ_NEED) && recCount?.data_type === "integer" && isZeroDefault(recCount) && hasSet(await idxSets("CustomObject", true), ["systemId", "key"]),
    "ครบ + recordCount int default 0 + unique(systemId,key)", `ขาด: ${missing(objCols, OBJ_NEED) || "-"} · recordCount=${recCount?.data_type ?? "-"}/${recCount?.column_default ?? "-"}`);
  const recCols = await cols("CustomRecord"); const recIdx = await idxSets("CustomRecord");
  const REC_NEED = ["tenantId", "systemId", "objectId", "parentType", "parentId", "partyId", "title", "unitId", "ownerUserId", "createdById", "status", "archivedAt"];
  chk("C1.1-S1.17", "CustomRecord (§4.3) คอลัมน์ครบ (parentType/parentId = แม่ · partyId สำหรับไทม์ไลน์ 360 · status มาจากฟิลด์ SELECT) + index(objectId, parentId) + index(partyId)",
    !missing(recCols, REC_NEED) && hasSet(recIdx, ["objectId", "parentId"]) && hasSet(recIdx, ["partyId"]),
    "ครบ + 2 index", `ขาด: ${missing(recCols, REC_NEED) || "-"} · idx ${JSON.stringify(recIdx)}`);
  const crvCols = await cols("CustomRecordValue"); const crvInfo = await colInfo("CustomRecordValue"); const crvIdx2 = await idxSets("CustomRecordValue");
  const CRV_NEED = ["recordType", "recordId", "fieldId", "valueText", "valueNumber", "valueDate", "valueBool", "valueOptions", "valueRef", "valueFileId", "updatedById", "updatedAt"];
  const vNum = crvInfo.get("valueNumber");
  const crvFilterIdx = ["valueText", "valueNumber", "valueRef"].filter((c) => !hasSet(crvIdx2, ["fieldId", c]));
  chk("C1.1-S1.18", "CustomRecordValue (§4.3) ช่องค่าครบ 7 ชนิด + valueNumber Decimal(18,4) + unique(recordId, fieldId) + index ตัวกรอง (fieldId,valueText) (fieldId,valueNumber) (fieldId,valueRef) — `fieldFilterWhere` ของ C1.2a ใช้",
    !missing(crvCols, CRV_NEED) && vNum?.data_type === "numeric" && vNum?.numeric_precision === 18 && vNum?.numeric_scale === 4 && hasSet(await idxSets("CustomRecordValue", true), ["recordId", "fieldId"]) && crvFilterIdx.length === 0,
    "ครบ + numeric(18,4) + unique + 3 index", `ขาด: ${missing(crvCols, CRV_NEED) || "-"} · valueNumber=${vNum?.data_type ?? "-"}(${vNum?.numeric_precision ?? "-"},${vNum?.numeric_scale ?? "-"}) · index ขาด: ${crvFilterIdx.join(",") || "-"}`);
  const hisCols = await cols("CustomRecordValueHistory"); const mfTrack = (await colInfo("MemberField")).get("trackHistory");
  chk("C1.1-S1.19", "CustomRecordValueHistory (§4.3): recordId fieldId oldValue newValue changedById createdAt + index(recordId, fieldId, createdAt) · และ MemberField.trackHistory (คอลัมน์เดิมของสมาชิก) ยังอยู่ — C1.2a เขียนประวัติเฉพาะฟิลด์ที่เปิดธงนี้",
    !missing(hisCols, ["recordId", "fieldId", "oldValue", "newValue", "changedById", "createdAt"]) && hasSet(await idxSets("CustomRecordValueHistory"), ["recordId", "fieldId", "createdAt"]) && mfTrack?.data_type === "boolean",
    "ครบ + index 3 คอลัมน์ + MemberField.trackHistory boolean", `ขาด: ${missing(hisCols, ["recordId", "fieldId", "oldValue", "newValue", "changedById", "createdAt"]) || "-"} · trackHistory=${mfTrack?.data_type ?? "ไม่มี"}`);

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
  // สลับ unique สองขั้นใน migration เดียว (MASTER-PLAN §6 แถว C1.1 · ใบ C1.1 "Verified facts"):
  //   ADD COLUMN objectKey DEFAULT 'customer' → CREATE UNIQUE (systemId, objectKey, key) → DROP unique เก่า (systemId, key)
  // ข้อนี้ตรวจ "สภาพปลายทาง" หลัง crm_v2_a: unique ใหม่ต้องมี **และ** unique เก่าต้องหายไปแล้ว
  const msU = await idxSets("MemberSection", true); const mfU = await idxSets("MemberField", true);
  const newU = ["systemId", "objectKey", "key"]; const oldU = ["systemId", "key"];
  const swapOk = hasSet(msU, newU) && hasSet(mfU, newU) && !hasSet(msU, oldU) && !hasSet(mfU, oldU);
  chk("C1.1-S2.4", "🔴 สภาพปลายทางของ crm_v2_a: MemberSection/MemberField มี unique ใหม่ (systemId, objectKey, key) และ **ไม่มี** unique เก่า (systemId, key) เหลืออยู่ (ไม่งั้นวัตถุกำหนดเองที่ใช้ key ซ้ำกับของสมาชิกจะสร้างไม่ได้)",
    swapOk, "ใหม่มี · เก่าหาย", `section:${JSON.stringify(msU)} field:${JSON.stringify(mfU)}`);
  const orderOk = (t: string) => {
    const addCol = migSql.search(new RegExp(`ALTER TABLE\\s+"${t}"[^;]*ADD COLUMN[^;]*"objectKey"`, "i"));
    const createU = migSql.search(new RegExp(`CREATE UNIQUE INDEX[^;]*"${t}"[^;]*objectKey`, "i"));
    const dropU = migSql.search(new RegExp(`DROP INDEX[^;]*"${t}_systemId_key`, "i"));
    return addCol >= 0 && createU > addCol && dropU > createU;
  };
  chk("C1.1-S2.5", "ลำดับใน migration.sql ถูกต้อง (ADD COLUMN objectKey → CREATE UNIQUE ใหม่ → DROP unique เก่า) ทั้ง MemberSection และ MemberField — สลับลำดับ = ช่วง deploy เขียนชนกันได้",
    orderOk("MemberSection") && orderOk("MemberField"), "add → create → drop", `section:${orderOk("MemberSection")} field:${orderOk("MemberField")}`, "MAJOR");

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
  const plSrc = read("scripts/crm-backfill-party-links.mts");
  const plMiss = PARTY_LINK_TABLES.filter((t) => !new RegExp(`\\b${t}\\b`, "i").test(plSrc));
  const plGhost = ["HotelBooking", "ClinicPatient", "PosSale"].filter((t) => new RegExp(`\\b${t}\\b`, "i").test(plSrc));
  chk("C1.1-S3.7", `[static] crm-backfill-party-links ครอบทั้ง 9 ตารางจริง (${PARTY_LINK_TABLES.join(",")}) และไม่อ้างชื่อที่ไม่มีจริง/ไม่เกี่ยว (HotelBooking · ClinicPatient · PosSale)`,
    plSrc.length > 0 && plMiss.length === 0 && plGhost.length === 0, "9 ตาราง · ไม่มีชื่อผี", `ขาด: ${plMiss.join(",") || "-"} · ชื่อผี: ${plGhost.join(",") || "-"}`);

  // ═══ S4 companies-from-text ═══
  const textCo = await P.crmCompany.findMany({ where: { tenantId: tid, systemId: SYS, name: CQC.companies.textCompany }, include: { party: true } as Any }).catch(async () => P.crmCompany.findMany({ where: { tenantId: tid, systemId: SYS, name: CQC.companies.textCompany } }));
  chk("C1.1-S4.1", `"${CQC.companies.textCompany}" (ข้อความใน CrmContact.company ของผู้ติดต่อ 3 คน) → CrmCompany 1 แถวพอดี`, textCo.length === 1, "1", String(textCo.length));
  const tcId = textCo[0]?.id ?? "";
  const tcParty = textCo[0]?.partyId ? await P.party.findUnique({ where: { id: textCo[0].partyId } }) : null;
  const tcLinks = tcId ? await P.crmCompanyContact.count({ where: { companyId: tcId } }) : 0;
  chk("C1.1-S4.2", "บริษัทนั้นมี Party kind=COMPANY ชื่อเดียวกัน + CrmCompanyContact 3 แถว", tcParty?.kind === "COMPANY" && tcParty?.name === CQC.companies.textCompany && tcLinks === 3, "COMPANY/3", `${tcParty?.kind}/${tcLinks}`);
  const tcCached = tcId ? await P.crmContact.count({ where: { tenantId: tid, companyId: tcId } }) : 0;
  chk("C1.1-S4.3", "ผู้ติดต่อ 3 คนได้ companyId cache (isPrimary 1 คน + คนที่เหลืออยู่ในบริษัทเดียวกัน) และ company ข้อความเดิมยังอยู่ (ไม่ลบ)", tcCached === 3 && (await P.crmContact.count({ where: { tenantId: tid, company: CQC.companies.textCompany } })) === 3, "3/3", `${tcCached}/${await P.crmContact.count({ where: { tenantId: tid, company: CQC.companies.textCompany } })}`);

  // ═══ S5 partyId ทุกระบบ (C11) — 9 จุดเขียนจริง · 2 กลุ่ม (crm-qc-env.mts) ═══
  //   กลุ่ม A `PARTY_LINK_NEW_COLUMN` (5): crm_v2_a ต้อง ADD COLUMN + index · กลุ่ม B `PARTY_LINK_EXISTING_COLUMN` (4):
  //   คอลัมน์+index มีอยู่ก่อนแล้ว แต่ไม่เคยมีใครเขียน ⇒ ข้อที่มีความหมายคือ "แถวที่มีตัวตนลูกค้าได้ partyId แล้ว"
  const missTable = PARTY_LINK_TABLES.filter((t) => !T.has(t));
  const noParty = [] as string[];
  for (const t of PARTY_LINK_TABLES) if (T.has(t) && !(await cols(t)).has("partyId")) noParty.push(t);
  const ghostTables = ["HotelBooking", "ClinicPatient"].filter((t) => T.has(t));
  chk("C1.1-S5.1", `ตารางธุรกรรมทั้ง 9 (ใหม่ 5: ${PARTY_LINK_NEW_COLUMN.join(",")} · มีอยู่แล้ว 4: ${PARTY_LINK_EXISTING_COLUMN.join(",")}) มีจริงในสคีมาและมีคอลัมน์ partyId ครบ · ไม่มีตารางชื่อเดา HotelBooking/ClinicPatient · PosSale ไม่อยู่ในรายการ (ผูกผ่าน memberId)`,
    missTable.length === 0 && noParty.length === 0 && ghostTables.length === 0 && PARTY_LINK_TABLES.length === 9 && !PARTY_LINK_TABLES.includes("PosSale"),
    "9 ตาราง · partyId ครบ", `ไม่มีตาราง: ${missTable.join(",") || "-"} · ไม่มีคอลัมน์: ${noParty.join(",") || "-"} · ตารางผี: ${ghostTables.join(",") || "-"}`);
  const partyIdxMiss = [] as string[];
  for (const t of PARTY_LINK_TABLES) if (T.has(t) && !(await hasIdx(t, ["partyId"]))) partyIdxMiss.push(t);
  chk("C1.1-S5.2", "ทุกตารางทั้ง 9 มี index (partyId) (4 ตารางเดิมมีอยู่แล้ว · 5 ตารางใหม่ crm_v2_a ต้องสร้าง)", partyIdxMiss.length === 0, "ครบ 9", partyIdxMiss.join(",") || "-", "MAJOR");
  const cosWithTax = await P.crmCompany.count({ where: { tenantId: tid, systemId: SYS, taxId: { not: null } } });
  const partyCoWithTax = await P.party.count({ where: { tenantId: tid, kind: "COMPANY", taxId: { not: null } } });
  chk("C1.1-S5.3", `Party COMPANY ที่มีเลขภาษี = บริษัท QC ที่มีเลขภาษี (${CQC.companies.withTaxId}) — ไม่มี Party COMPANY ซ้ำ`, cosWithTax === CQC.companies.withTaxId && partyCoWithTax === CQC.companies.withTaxId, String(CQC.companies.withTaxId), `crm=${cosWithTax} party=${partyCoWithTax}`);
  const allCoHaveParty = (await P.crmCompany.count({ where: { tenantId: tid, partyId: null } })) === 0;
  const contactsNoParty = await P.crmContact.count({ where: { tenantId: tid, partyId: null } });
  chk("C1.1-S5.4", "CrmCompany ทุกแถวมี partyId (บังคับ) · CrmContact ทุกแถวมี partyId หลัง backfill party-links", allCoHaveParty && contactsNoParty === 0, "0/0", `coNull=${!allCoHaveParty} contactNull=${contactsNoParty}`);
  // กลุ่ม A: คอลัมน์ต้องมาจาก crm_v2_a จริง ๆ และต้อง nullable (กติกา §2 ข้อ 5 — ห้าม NOT NULL ที่ไม่มี default)
  const addedHere = [] as string[]; const notNullable = [] as string[];
  for (const t of PARTY_LINK_NEW_COLUMN) {
    if (new RegExp(`ALTER TABLE\\s+"${t}"[^;]*ADD COLUMN[^;]*"partyId"`, "i").test(migSql)) addedHere.push(t);
    const info = (await colInfo(t)).get("partyId");
    if (info && info.is_nullable !== "YES") notNullable.push(t);
  }
  chk("C1.1-S5.5", `กลุ่มใหม่ 5 ตาราง: migration ${migDir} เป็นคนเพิ่มคอลัมน์ partyId เอง และเพิ่มแบบ nullable (ไม่มี NOT NULL ที่ทำให้ deploy ล้ม)`,
    addedHere.length === PARTY_LINK_NEW_COLUMN.length && notNullable.length === 0, "5/5 · nullable", `ใน migration: ${addedHere.length}/${PARTY_LINK_NEW_COLUMN.length} · NOT NULL: ${notNullable.join(",") || "-"}`);
  // ─── ทั้ง 9 ตาราง: พิสูจน์ "มีคนเขียน partyId จริง" (ทุกคำสั่งผูกร้าน QC — ฐานนี้ใช้ร่วมหลาย session) ───
  //  • total/gap = ภาพรวมของร้าน QC (gap ใช้ phoneRequired เป็นตัวแบ่ง: ตารางที่เบอร์ NOT NULL ⇒ ทุกแถวต้องมี partyId
  //    ห้ามยกเว้นด้วยเงื่อนไข "เบอร์ไม่ว่าง" — ไม่งั้นแถวเบอร์ว่างกลายเป็นช่องหนี)
  //  • linked / matched = ข้อพิสูจน์เชิงบวก: แถวป้าย QC (CQC.businessRows.rowTagOf) ต้องมี partyId และต้องเป็น
  //    **Party ของผู้ติดต่อ QC คนที่สัญญากำหนด** (contactIndexOf) ⇒ "จับคู่ Party เดิมได้" ไม่ใช่ "มี partyId อะไรก็ได้"
  const digitsOf = (v: string) => v.replace(/\D/g, "").replace(/^66/, "0");
  // 🔴 เบอร์ซ้ำโดยตั้งใจ: ผู้ติดต่อ 77..80 ใช้เบอร์เดียวกับ 1..4 (CQC.contacts.duplicates) — แผนที่แบบ "คนสุดท้ายชนะ"
  //    จะได้ Party คนละตัวในแต่ละรอบ (findMany ไม่มีลำดับ) = ข้อสอบเดี๋ยวแดงเดี๋ยวเขียวโดยที่ไม่มีใครแก้ได้
  //    ⇒ เก็บเป็น "เซ็ตของ partyId ต่อหนึ่งเบอร์" แล้วตัดสินแบบเป็นสมาชิกของเซ็ต + แยกความผิดสองแบบออกจากกัน:
  //      (ก) เบอร์เดียวชี้ Party มากกว่า 1 ตัว = backfill รวมผู้ติดต่อเบอร์ซ้ำเป็นคนละ Party (บั๊กจริง ต้องแดง)
  //      (ข) แถวชี้ Party ที่ไม่ใช่ของเบอร์นั้น = เขียน partyId ผิดคน
  //    จงใจไม่เลี่ยงเบอร์ซ้ำ: คู่ซ้ำคือเคสที่ยากที่สุดของการจับคู่ Party — ถ้าเลี่ยง ข้อสอบจะไม่เคยทดสอบมันเลย
  const qcContacts = (await P.crmContact.findMany({ where: { tenantId: tid, systemId: SYS }, select: { phone: true, partyId: true }, orderBy: { createdAt: "asc" } })) as { phone: string | null; partyId: string | null }[];
  const partiesOfPhone = new Map<string, Set<string>>();
  for (const c of qcContacts) {
    const k = digitsOf(String(c.phone ?? ""));
    if (!k) continue;
    if (!partiesOfPhone.has(k)) partiesOfPhone.set(k, new Set<string>());
    if (c.partyId) partiesOfPhone.get(k)!.add(c.partyId);
  }
  const sqlStr = (v: string) => `'${v.replace(/'/g, "''")}'`;
  const linkRows: string[] = []; const linkMiss: string[] = []; const linkEmpty: string[] = []; const linkWrong: string[] = [];
  for (const t of PARTY_LINK_TABLES) {
    if (!T.has(t)) { linkEmpty.push(`${t}=ไม่มีตาราง`); linkMiss.push(`${t}=ไม่มีตาราง`); continue; }
    const idn = PARTY_LINK_IDENTITY[t]!;
    const W = `"tenantId" = ${sqlStr(tid)}`; // 🔴 ทุกข้อผูกร้าน QC เสมอ (ห้ามนับแถวของร้านอื่นในฐานร่วม)
    const total = await n1(`select count(*)::int as n from "${t}" where ${W}`);
    const linked = await n1(`select count(*)::int as n from "${t}" where ${W} and "partyId" is not null`);
    const gap = idn.phoneRequired || !idn.phoneColumn
      ? await n1(`select count(*)::int as n from "${t}" where ${W} and "partyId" is null`)
      : await n1(`select count(*)::int as n from "${t}" where ${W} and "partyId" is null and "${idn.phoneColumn}" is not null and "${idn.phoneColumn}" <> ''`);
    const tagged = (await q<{ tag: string | null; partyId: string | null }>(
      `select "${idn.tagColumn}" as tag, "partyId" as "partyId" from "${t}" where ${W} and "${idn.tagColumn}" like ${sqlStr(`%${CQC.businessRows.tag}%`)}`,
    ));
    let matched = 0;
    for (let j = 1; j <= CQC.businessRows.perTable; j += 1) {
      const rowTag = CQC.businessRows.rowTagOf(t, j);
      // เทียบแบบ "คำเต็ม" (ป้ายคั่นด้วยช่องว่าง) ไม่ใช่ substring — ไม่งั้น `…:1` จะไปเจอ `…:10` เมื่อ perTable โตขึ้น
      const row = tagged.find((r) => (r.tag ?? "").split(/\s+/).includes(rowTag));
      const phone = digitsOf(CQC.contacts.phoneOf(CQC.businessRows.contactIndexOf(t, j)));
      const want = partiesOfPhone.get(phone);
      if (!row) continue;
      if (!want || want.size === 0) { linkWrong.push(`${rowTag}(ไม่มีผู้ติดต่อ QC เบอร์นี้/ผู้ติดต่อยังไม่มี partyId — สัญญาเมล็ดข้อมูลผิด)`); continue; }
      if (want.size > 1) { linkWrong.push(`${rowTag}(เบอร์ซ้ำถูกผูกเป็น ${want.size} Party — backfill ต้องรวมเป็นตัวเดียว)`); continue; }
      if (row.partyId && want.has(row.partyId)) matched += 1;
      else linkWrong.push(`${rowTag}(${row.partyId ? "ชี้ Party ผิดคน" : "partyId ว่าง"})`);
    }
    linkRows.push(`${t}:${total}/${gap}/linked ${linked}/ตรงคน ${matched}`);
    if (gap !== 0 || linked < CQC.businessRows.perTable || matched < CQC.businessRows.perTable) linkMiss.push(`${t}=gap ${gap}·linked ${linked}·ตรงคน ${matched}`);
    if (tagged.length < CQC.businessRows.perTable) linkEmpty.push(`${t}=แถวป้าย QC ${tagged.length}`);
  }
  chk("C1.1-S5.6", `🔴 ทั้ง 9 ตาราง (เฉพาะร้าน QC): (1) ไม่มีแถวที่มีตัวตนลูกค้าแล้ว partyId ยังว่าง — ตารางที่เบอร์ NOT NULL คือทุกแถว · (2) แถวที่มี partyId ≥ ${CQC.businessRows.perTable} · (3) แถวป้าย ${CQC.businessRows.tag} ทั้ง ${CQC.businessRows.perTable} แถวชี้ไป Party ของผู้ติดต่อ QC ที่สัญญากำหนด (CQC.businessRows.contactIndexOf) — พิสูจน์ว่า "จับคู่ Party เดิมได้" ไม่ใช่แค่ "มีค่าอะไรก็ได้"`,
    linkMiss.length === 0 && linkWrong.length === 0, "gap 0 · linked ≥ 2 · ตรงคน 2 ทุกตาราง", `${linkRows.join(" · ")}${linkMiss.length ? ` · ผิด: ${linkMiss.join(",")}` : ""}${linkWrong.length ? ` · ชี้ผิด: ${linkWrong.join(",")}` : ""}`);
  // 🔴 กันข้อ S5.6 "เขียวเปล่า": ไม่มีแถวของเราเอง = ไม่ได้พิสูจน์อะไร (แถวของร้านอื่นนับไม่ได้)
  chk("C1.1-S5.7", `🔴 ทุกตารางต้องมี "แถวของ QC เอง" ≥ ${CQC.businessRows.perTable} แถว (ป้าย ${CQC.businessRows.tag} ในคอลัมน์ที่ระบุใน PARTY_LINK_IDENTITY · ร้าน QC เท่านั้น) — ใบ C1.1 เป็นคนสร้างตาม CQC.businessRows`,
    linkEmpty.length === 0, `ทุกตาราง ≥ ${CQC.businessRows.perTable} แถวป้าย QC`, `${linkEmpty.join(",") || "-"} · ${linkRows.join(" · ")}`);

  // ═══ S6 core/teams.ts ═══
  const teams = (await import("@/lib/core/teams" as string)) as Any; // as string: โมดูลยังไม่มีจนกว่า C1.1 จะสร้าง — next build ตรวจ type ไฟล์ .mts ด้วย (deploy 5cc4100 ล้มเพราะจุดนี้)
  const fnMiss = ["createTeam", "updateTeam", "archiveTeam", "addMember", "removeMember", "teamsOf", "membersOf", "unitIdsOf", "listTeams"].filter((f) => typeof teams[f] !== "function");
  chk("C1.1-S6.1", "src/lib/core/teams.ts export createTeam/updateTeam/archiveTeam/addMember/removeMember/teamsOf/membersOf/unitIdsOf/listTeams", fnMiss.length === 0, "ครบ", `ขาด: ${fnMiss.join(",") || "-"}`);
  let dupErr = false; let dupWhy = "ไม่ error"; let t1: Any = null;
  // ซ้ำต้องล้มเพราะ "ชื่อซ้ำ" จริง ๆ — ส่งพารามิเตอร์ชุดเดียวกับครั้งแรกทุกตัว (ต่างแค่ว่าเป็นครั้งที่สอง)
  // และต้องพิสูจน์ชนิดของ error (P2002 หรือข้อความไทยว่าซ้ำ) ไม่ใช่ catch เปล่า ๆ ที่กลืน error อะไรก็ได้
  const isDupErr = (e: unknown) => {
    const code = (e as { code?: string })?.code;
    const msg = String((e as Error)?.message ?? e);
    return code === "P2002" || /P2002|unique/i.test(msg) || /ซ้ำ|มีอยู่แล้ว|ใช้ชื่อนี้แล้ว/.test(msg);
  };
  try {
    const teamArgs = { name: "ทีมทดสอบ C1.1", leadUserId: E.users.manager.userId, unitIds: [E.units.patong] };
    t1 = await teams.createTeam({ tenantId: tid }, teamArgs);
    made.teams.push(t1.id);
    try {
      const t2 = await teams.createTeam({ tenantId: tid }, { ...teamArgs });
      if (t2?.id) { made.teams.push(t2.id); dupWhy = "สร้างซ้ำได้ (ไม่มี unique)"; }
    } catch (e) { dupErr = isDupErr(e); dupWhy = dupErr ? "error ซ้ำถูกชนิด" : `error คนละเรื่อง: ${String((e as Error)?.message ?? e).slice(0, 80)}`; }
  } catch (e) { console.log("   createTeam error:", (e as Error).message); }
  chk("C1.1-S6.2", "createTeam → แถว Team + ชื่อซ้ำในร้านเดียวกัน (พารามิเตอร์ชุดเดียวกัน) → error ที่เป็นการชน unique(tenantId,name) จริง (P2002 หรือข้อความไทยว่าชื่อซ้ำ) ไม่ใช่ error อะไรก็ได้", t1?.id && dupErr, "สร้างได้ + ซ้ำล้มด้วย P2002/ข้อความซ้ำ", `${t1?.id ? "ok" : "no"} · ${dupWhy}`);
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
  const tmInfo = await colInfo("TeamMember");
  const acceptingLeads = tmInfo.get("acceptingLeads");
  const teamFns = ["setLead", "setAcceptingLeads"].filter((f) => typeof teams[f] !== "function");
  chk("C1.1-S6.5", "TeamMember.acceptingLeads Boolean @default(true) (พิมพ์เขียว §15 · ตัวมอบหมาย round-robin ของ C2.3 ข้ามคนที่ปิดรับ) + teams.ts export setLead/setAcceptingLeads",
    acceptingLeads?.data_type === "boolean" && /true/i.test(acceptingLeads?.column_default ?? "") && teamFns.length === 0,
    "boolean default true + 2 ฟังก์ชัน", `col:${acceptingLeads?.data_type ?? "ไม่มี"}/${acceptingLeads?.column_default ?? "-"} · ขาดฟังก์ชัน: ${teamFns.join(",") || "-"}`);

  // ═══ S7 seed ตรงเฉลย + idempotent ═══
  const c = E.counts;
  const live = { companies: await P.crmCompany.count({ where: { tenantId: tid, systemId: SYS } }), contacts: await P.crmContact.count({ where: { tenantId: tid, systemId: SYS } }), deals: await P.crmDeal.count({ where: { tenantId: tid, systemId: SYS } }), won: await P.crmDeal.count({ where: { tenantId: tid, systemId: SYS, kind: "WON" } }), lost: await P.crmDeal.count({ where: { tenantId: tid, systemId: SYS, kind: "LOST" } }), activities: await P.crmActivity.count({ where: { tenantId: tid, systemId: SYS } }), records: await P.customRecord.count({ where: { tenantId: tid, systemId: SYS } }), teams: await P.team.count({ where: { tenantId: tid, archivedAt: null } }), history: await P.crmDealStageHistory.count({ where: { deal: { tenantId: tid } } }) };
  const expect = { companies: CQC.companies.total + 1, contacts: CQC.contacts.total, deals: CQC.deals.total, won: CQC.deals.won, lost: CQC.deals.lost, activities: CQC.activities.total, records: CQC.customObjects.contract.records, teams: CQC.teams.length };
  const okCounts = live.companies === expect.companies && live.contacts === expect.contacts && live.deals === expect.deals && live.won === expect.won && live.lost === expect.lost && live.activities === expect.activities && live.records === expect.records && live.teams === expect.teams && live.history >= CQC.deals.total && c.contacts === expect.contacts;
  chk("C1.1-S7.1", `seed ตรงสัญญา CQC: บริษัท ${expect.companies} (20 + บริษัทจากข้อความ 1) · ผู้ติดต่อ ${expect.contacts} · ดีล ${expect.deals} (WON ${expect.won}/LOST ${expect.lost}) · กิจกรรม ${expect.activities} · สัญญา ${expect.records} · ทีม ${expect.teams} · StageHistory ≥ ${CQC.deals.total} (backfill แถวแรก)`, okCounts, JSON.stringify(expect), JSON.stringify(live));
  const reseed = run("seed-crm-qc.mts");
  const live2 = { companies: await P.crmCompany.count({ where: { tenantId: tid, systemId: SYS } }), contacts: await P.crmContact.count({ where: { tenantId: tid, systemId: SYS } }), deals: await P.crmDeal.count({ where: { tenantId: tid, systemId: SYS } }), members: await P.customer.count({ where: { tenantId: tid } }) };
  chk("C1.1-S7.2", "🔴 seed idempotent: รันซ้ำ → exit 0 · จำนวน บริษัท/ผู้ติดต่อ/ดีล เท่าเดิม · สมาชิกของร้านไม่ถูกแตะ (จำนวนเท่า member-expected)", reseed.code === 0 && live2.companies === live.companies && live2.contacts === live.contacts && live2.deals === live.deals && live2.members === (ME.counts?.members ?? live2.members), JSON.stringify({ ...live, members: ME.counts?.members }), `exit ${reseed.code} ${JSON.stringify(live2)}`);

  // ═══ S8 ค่าเริ่มต้นของ settings.crm (มติ C23 · R-E ข้อ 14 · ทางถอยบน prod) ═══
  //  🔴 ต้องพิสูจน์ "พฤติกรรมของตัวอ่านค่า" ไม่ใช่ grep ข้อความในซอร์ส (คอมเมนต์ก็ผ่าน grep ได้)
  //  สัญญา: `src/lib/modules/crm/settings.ts` export `getCrmSettings(ctx: { tenantId, systemId })`
  //  → Promise ของอ็อบเจกต์ที่มีอย่างน้อย { uiVersion: number; bridgesEnabled: boolean } พร้อมค่าเริ่มต้นในตัว
  const settingsMod = (await import("@/lib/modules/crm/settings" as string).catch(() => null)) as Any;
  const getCrmSettings = settingsMod?.getCrmSettings as ((ctx: { tenantId: string; systemId: string }) => Promise<Any>) | undefined;
  const blank = typeof getCrmSettings === "function"
    ? await P.appSystem.create({ data: { tenantId: tid, type: "CRM", name: "qc-c01 settings ว่าง", settings: {} } })
    : null;
  if (blank?.id) made.systems.push(blank.id);
  const blankRead = blank?.id && getCrmSettings ? await getCrmSettings({ tenantId: tid, systemId: blank.id }).catch((e: Error) => ({ error: e.message })) : null;
  const liveRead = getCrmSettings ? await getCrmSettings({ tenantId: tid, systemId: SYS }).catch((e: Error) => ({ error: e.message })) : null;
  chk("C1.1-S8.1", "มติ C23 / R-E ข้อ 14: `crm/settings.ts` มี getCrmSettings({tenantId, systemId}) และคืน uiVersion = 1 สำหรับระบบที่ settings ว่างเปล่า (ค่าเริ่มต้นอยู่ในตัวอ่าน ไม่ใช่ในคอมเมนต์) · ระบบ CRM ของชุดข้อมูล QC ก็อ่านได้ 1",
    typeof getCrmSettings === "function" && blankRead?.uiVersion === 1 && liveRead?.uiVersion === 1,
    "getCrmSettings → uiVersion 1 (ทั้งระบบว่างและระบบ QC)", `มีฟังก์ชัน=${typeof getCrmSettings === "function"} · ว่าง=${JSON.stringify(blankRead)?.slice(0, 120)} · QC=${liveRead?.uiVersion ?? JSON.stringify(liveRead)?.slice(0, 80)}`);
  chk("C1.1-S8.2", "มติ C23: getCrmSettings คืน bridgesEnabled = true สำหรับระบบที่ settings ว่างเปล่า (สวิตช์ปิดสะพานเชื่อมโมดูลอื่นบน prod · ค่าเริ่มต้นคือเปิด)",
    blankRead?.bridgesEnabled === true, "true", `${JSON.stringify(blankRead?.bridgesEnabled) ?? "-"}`, "MAJOR");
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
  for (const id of made.systems) { await d(() => P.appSystemUnit.deleteMany({ where: { systemId: id } })); await d(() => P.appSystem.delete({ where: { id } })); }
  made.systems = [];
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C1.1: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
