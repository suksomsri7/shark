// QC — ระบบสมาชิก v2 WO M1.1: schema v2 (additive) + enum + ทะเบียนช่องทางกลาง (D19) + MemberChannelIdentity (D18)
//      + HrEmployee ผูกบัญชีผู้ใช้ (D17) + backfill 6 สคริปต์ + seed ชุดข้อมูล QC สมาชิก
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/MEMBER-RUN.md §2 M1.1 · พิมพ์เขียว docs/modules/06-member-v2.md §4
// requires: member-seed
//
// 🔴 มติทางเทคนิคของ Fable (บันทึกไว้ที่ ledger/MEMBER-RUN.md §4 · 10 ก.ย.):
//   - D17 `HrEmployee.userId` → **ใช้คอลัมน์เดิม `linkedUserId`** (ความหมายเดียวกัน · staff/service.ts เขียนอยู่แล้ว) ไม่เพิ่มคอลัมน์ซ้ำ
//   - D17 `hrDepartmentIds[]` → **`hrDepartments String[]`** (HR ไม่มีตาราง Department — `HrEmployee.department` เป็นข้อความ)
//   - backfill ข้อ 4 (points-lots) ย้ายไป M2.1 (ตาราง PointLot เกิดที่ migration member_v2_c) · M1.1 มี 6 สคริปต์ =
//     tiers · fields · consent · party-links · attribution · hr-users
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
const migDir = existsSync("prisma/migrations") ? readdirSync("prisma/migrations").find((d) => /_member_v2_a$/.test(d)) : undefined;
if (!migDir || !existsSync("src/lib/core/channels.ts") || !existsSync("scripts/seed-member-qc.mts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (prisma/migrations/*_member_v2_a · src/lib/core/channels.ts · scripts/seed-member-qc.mts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const mq = (await import("./member-qc-env.mts" as string)) as {
  MQC: Any;
  SYSTEM_FIELD_KEYS: readonly string[];
  CHANNEL_KEYS: readonly string[];
  resolveMemberScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null>;
};
const { MQC, SYSTEM_FIELD_KEYS, CHANNEL_KEYS } = mq;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const q = async <T = Any,>(sql: string): Promise<T[]> => (await prisma.$queryRawUnsafe(sql)) as T[];
const P = prisma as Any;
const cols = async (t: string) => new Set((await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='${t}'`)).map((c) => c.column_name));
const colType = async (t: string, c: string) => (await q<{ udt_name: string }>(`select udt_name from information_schema.columns where table_name='${t}' and column_name='${c}'`))[0]?.udt_name ?? "";
const enumVals = async (name: string) => (await q<{ enumlabel: string }>(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='${name}' order by e.enumsortorder`)).map((e) => e.enumlabel);
// 🔴 pg_get_indexdef ใส่เครื่องหมายคำพูดเฉพาะชื่อที่จำเป็น (camelCase) — คอลัมน์ตัวพิมพ์เล็กล้วน (key/name/code/...) พิมพ์แบบไม่มีคำพูด
//    (builder M1.1 แย้งถูก · กติกา KANBAN-RUN ข้อ 6 ก็เตือนไว้) ⇒ จับทั้ง "col" และ col เปล่าที่คั่นด้วย (, )
const hasIdx = async (t: string, colsIn: string[], unique = false) => {
  const rows = await q<{ indexdef: string }>(`select indexdef from pg_indexes where tablename='${t}' and indexdef ${unique ? "" : "not "}ilike '%unique%'`);
  return rows.some((r) => { const body = r.indexdef.slice(r.indexdef.indexOf("USING")); return colsIn.every((c) => body.includes(`"${c}"`) || new RegExp(`[(, ]${c}[,) ]`).test(body)); });
};
const hasAll = (set: Set<string>, arr: string[]) => arr.every((c) => set.has(c));
const missing = (set: Set<string>, arr: string[]) => arr.filter((c) => !set.has(c)).join(",");
const run = (script: string, args: string[] = []) => {
  const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${script}`, ...args], { encoding: "utf8", env: process.env, timeout: 600_000 });
  return { code: r.status ?? -1, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};
const BACKFILL = ["member-backfill-tiers.mts", "member-backfill-fields.mts", "member-backfill-consent.mts", "member-backfill-party-links.mts", "member-backfill-attribution.mts", "member-backfill-hr-users.mts"];

let tid = ""; let SYS = "";
const made = { customers: [] as string[], parties: [] as string[], chatContacts: [] as string[], chatConvs: [] as string[], crmContacts: [] as string[], crmSys: null as string | null, hrEmployees: [] as string[], users: [] as string[], otherTenant: null as string | null };
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed (scripts/seed-member-qc.mts)");
  tid = scope.tenantId; SYS = scope.systemId;
  const E = JSON.parse(readFileSync(MQC.expectedPath, "utf8"));

  // ═══ S1 schema (additive · พิมพ์เขียว §4.1–4.3) ═══
  const cust = await cols("Customer");
  const CUST_NEW = ["firstName", "lastName", "nickname", "titleTh", "birthDate", "gender", "nationality", "avatarFileId", "locale", "preferredChannel", "lineUserId", "status", "tierDefId", "tierPoints", "tierSince", "tierReviewAt", "source", "sourceDetail", "sourceChannel", "ownerUserId", "homeUnitId", "lastActivityAt", "spent12mSatang", "visits12m", "reviewAvg", "referralCode", "referredById", "mergedIntoId", "privacyVersion"];
  chk("M1.1-S1.1", "Customer เพิ่มคอลัมน์ 29 ตัว (§4.1) · คอลัมน์เดิมยังครบ (memberCode name phone email tier totalSpentSatang visitCount tags marketingConsent consentAt partyId)", hasAll(cust, CUST_NEW) && hasAll(cust, ["memberCode", "name", "phone", "email", "tier", "totalSpentSatang", "visitCount", "tags", "marketingConsent", "consentAt", "partyId"]) && (await colType("Customer", "status")) === "MemberStatus" && (await colType("Customer", "source")) === "MemberSource" && (await colType("Customer", "gender")) === "MemberGender", "ครบ", `ขาด ${missing(cust, CUST_NEW)}`);
  chk("M1.1-S1.2", "Customer index: unique(tenantId, referralCode) แบบ partial (WHERE referralCode IS NOT NULL) · index (tenantId,tierDefId) (tenantId,source) (tenantId,lastActivityAt) (tenantId,birthDate)", (await q(`select 1 from pg_indexes where tablename='Customer' and indexdef ilike '%unique%' and indexdef ilike '%"referralCode"%' and indexdef ilike '%where%'`)).length === 1 && (await hasIdx("Customer", ["tenantId", "tierDefId"])) && (await hasIdx("Customer", ["tenantId", "source"])) && (await hasIdx("Customer", ["tenantId", "lastActivityAt"])) && (await hasIdx("Customer", ["tenantId", "birthDate"])), "ครบ 5", "ขาด");
  const ENUMS: Record<string, string[]> = {
    MemberGender: ["MALE", "FEMALE", "OTHER", "UNSPECIFIED"],
    MemberStatus: ["ACTIVE", "SUSPENDED", "CLOSED", "MERGED"],
    MemberSource: ["WALK_IN", "POS", "BOOKING", "LINE_OA", "LIFF", "WEB_FORM", "CHAT", "REFERRAL", "IMPORT", "CRM", "CAMPAIGN", "API", "MARKETPLACE", "APP", "OTHER"],
    MemberLinkMethod: ["PHONE", "EMAIL", "CHANNEL_ID", "MANUAL", "MERGE", "ORDER"],
    MemberFieldType: ["TEXT", "LONG_TEXT", "NUMBER", "MONEY", "DATE", "DATETIME", "SELECT", "MULTI_SELECT", "BOOLEAN", "FILE", "LOOKUP"],
    MemberLookupTarget: ["PRODUCT", "SERVICE", "EMPLOYEE", "UNIT", "CUSTOMER"],
    MemberConsentSource: ["SIGNUP_FORM", "LIFF", "STAFF", "IMPORT", "API", "CUSTOMER_SELF"],
    TierChangeReason: ["RULE_UPGRADE", "RULE_DOWNGRADE", "RULE_KEEP", "MANUAL", "PAID_PLAN", "PLAN_EXPIRED", "MERGE", "INITIAL"],
    TierBenefitType: ["DISCOUNT_PCT", "DISCOUNT_FIXED", "POINT_MULTIPLIER", "WELCOME_VOUCHER", "BIRTHDAY_GIFT", "FREE_SERVICE", "PRIORITY_BOOKING", "NO_POINT_EXPIRY", "CANCEL_FEE_DISCOUNT", "EXCLUSIVE_ITEMS"],
    AutomationScope: ["KANBAN", "MEMBER_TIER", "MEMBER_JOURNEY"],
    PrivacyRequestType: ["EXPORT", "DELETE"],
    PrivacyRequestStatus: ["PENDING", "APPROVED", "DONE", "REJECTED"],
  };
  const enumMiss: string[] = [];
  for (const [name, vals] of Object.entries(ENUMS)) { const got = await enumVals(name); for (const v of vals) if (!got.includes(v)) enumMiss.push(`${name}.${v}`); }
  chk("M1.1-S1.3", "enum ใหม่ 12 ชุดครบทุกค่า (§4.2) · AiCreditSource มี MEMBER_ASSIST · MemberTier เดิมคง 4 ค่า", enumMiss.length === 0 && (await enumVals("AiCreditSource")).includes("MEMBER_ASSIST") && (await enumVals("MemberTier")).length === 4, "ครบ", enumMiss.join(",").slice(0, 200));
  chk("M1.1-S1.4", "🔴 D19 ไม่มี enum MemberChannel/MemberConsentChannel ใน DB · MemberConsent.channel · MemberChannelIdentity.channel · Customer.preferredChannel · Customer.sourceChannel เป็น text (key จากทะเบียน channels.ts)", (await enumVals("MemberChannel")).length === 0 && (await enumVals("MemberConsentChannel")).length === 0 && (await colType("MemberConsent", "channel")) === "text" && (await colType("MemberChannelIdentity", "channel")) === "text" && (await colType("Customer", "preferredChannel")) === "text" && (await colType("Customer", "sourceChannel")) === "text", "text ทั้งหมด", `${await colType("MemberConsent", "channel")}/${await colType("Customer", "preferredChannel")}`);
  const TABLES = ["MemberSection", "MemberField", "MemberFieldValue", "MemberFieldValueHistory", "MemberAddress", "MemberConsent", "MemberPrivacyPolicy", "MemberSensitivePolicy", "MemberAccessLog", "MemberPrivacyRequest", "MemberSavedView", "MemberTag", "MemberChannelIdentity", "AcquisitionLink", "MemberAttribution", "MemberTierDef", "MemberTierBenefit", "MemberTierHistory"];
  const MUTABLE = ["MemberSection", "MemberField", "MemberFieldValue", "MemberAddress", "MemberConsent", "MemberPrivacyPolicy", "MemberSensitivePolicy", "MemberPrivacyRequest", "MemberSavedView", "MemberTag", "MemberChannelIdentity", "AcquisitionLink", "MemberTierDef", "MemberTierBenefit"];
  const tblMiss: string[] = [];
  for (const t of TABLES) { const c = await cols(t); if (!hasAll(c, ["id", "tenantId", "createdAt"])) tblMiss.push(t); if (MUTABLE.includes(t) && !c.has("updatedAt")) tblMiss.push(`${t}.updatedAt`); }
  chk("M1.1-S1.5", "ตารางใหม่ M1 18 ตาราง (§4.3) มี id tenantId createdAt · ตารางที่แก้ได้มี updatedAt · ยังไม่มีตาราง M2/M3 (PointLot/Voucher/StampCard/GiftCard/MemberReview/MemberSegment เกิดที่ migration ของตัวเอง)", tblMiss.length === 0 && (await cols("PointLot")).size === 0 && (await cols("Voucher")).size === 0 && (await cols("StampCard")).size === 0, "ครบ 18 · M2/M3 ยังไม่มี", tblMiss.join(",") || "มีตาราง M2/M3 ก่อนเวลา");
  const mf = await cols("MemberField"); const ms = await cols("MemberSection");
  chk("M1.1-S1.6", "MemberSection {systemId key label description columns sortOrder isSystem sensitive collapsed} unique(systemId,key) · MemberField {systemId sectionId key label description type options required defaultValue unique filterable showInList showOnCard customerEditable sensitive trackHistory isSystem systemKey sortOrder archivedAt} unique(systemId,key) · type = MemberFieldType", hasAll(ms, ["systemId", "key", "label", "description", "columns", "sortOrder", "isSystem", "sensitive", "collapsed"]) && (await hasIdx("MemberSection", ["systemId", "key"], true)) && hasAll(mf, ["systemId", "sectionId", "key", "label", "description", "type", "options", "required", "defaultValue", "unique", "filterable", "showInList", "showOnCard", "customerEditable", "sensitive", "trackHistory", "isSystem", "systemKey", "sortOrder", "archivedAt"]) && (await hasIdx("MemberField", ["systemId", "key"], true)) && (await colType("MemberField", "type")) === "MemberFieldType", "ครบ", `section ขาด ${missing(ms, ["systemId", "key", "label", "columns", "sortOrder", "isSystem", "sensitive", "collapsed"])} · field ขาด ${missing(mf, ["sectionId", "key", "type", "options", "required", "unique", "filterable", "showInList", "showOnCard", "customerEditable", "sensitive", "trackHistory", "isSystem", "systemKey", "archivedAt"])}`);
  const mv = await cols("MemberFieldValue"); const mh = await cols("MemberFieldValueHistory");
  chk("M1.1-S1.7", "MemberFieldValue คอลัมน์แยกชนิด (D14) {customerId fieldId valueText valueNumber valueDate valueBool valueOptions valueRef valueFileId updatedById} unique(customerId,fieldId) · index (fieldId,valueText) (fieldId,valueNumber) (fieldId,valueDate) · History {customerId fieldId oldValue newValue changedById changedVia} index(customerId,fieldId,createdAt)", hasAll(mv, ["customerId", "fieldId", "valueText", "valueNumber", "valueDate", "valueBool", "valueOptions", "valueRef", "valueFileId", "updatedById"]) && (await hasIdx("MemberFieldValue", ["customerId", "fieldId"], true)) && (await hasIdx("MemberFieldValue", ["fieldId", "valueText"])) && (await hasIdx("MemberFieldValue", ["fieldId", "valueNumber"])) && (await hasIdx("MemberFieldValue", ["fieldId", "valueDate"])) && hasAll(mh, ["customerId", "fieldId", "oldValue", "newValue", "changedById", "changedVia"]) && (await hasIdx("MemberFieldValueHistory", ["customerId", "fieldId", "createdAt"])), "ครบ", `value ขาด ${missing(mv, ["valueText", "valueNumber", "valueDate", "valueBool", "valueOptions", "valueRef", "valueFileId", "updatedById"])} · history ขาด ${missing(mh, ["oldValue", "newValue", "changedById", "changedVia"])}`);
  const mc = await cols("MemberConsent"); const mi = await cols("MemberChannelIdentity"); const hr = await cols("HrEmployee");
  chk("M1.1-S1.8", "MemberConsent {customerId channel granted source policyVersion grantedAt revokedAt byUserId} unique(customerId,channel) · MemberChannelIdentity (D18) {customerId channel externalId displayName contactId verified linkedBy linkedAt lastSeenAt} unique(tenantId,channel,externalId) index(customerId) · HrEmployee.linkedUserId (D17 ใช้คอลัมน์เดิม)", hasAll(mc, ["customerId", "channel", "granted", "source", "policyVersion", "grantedAt", "revokedAt", "byUserId"]) && (await hasIdx("MemberConsent", ["customerId", "channel"], true)) && hasAll(mi, ["customerId", "channel", "externalId", "displayName", "contactId", "verified", "linkedBy", "linkedAt", "lastSeenAt"]) && (await hasIdx("MemberChannelIdentity", ["tenantId", "channel", "externalId"], true)) && (await hasIdx("MemberChannelIdentity", ["customerId"])) && hr.has("linkedUserId"), "ครบ", `consent ขาด ${missing(mc, ["channel", "granted", "source", "policyVersion", "grantedAt", "revokedAt", "byUserId"])} · identity ขาด ${missing(mi, ["channel", "externalId", "displayName", "contactId", "verified", "linkedBy", "linkedAt", "lastSeenAt"])}`);
  const sp = await cols("MemberSensitivePolicy"); const al = await cols("MemberAccessLog"); const pr = await cols("MemberPrivacyRequest"); const sv = await cols("MemberSavedView");
  chk("M1.1-S1.9", "MemberSensitivePolicy (D8+D17) {systemId targetType targetId roles Role[] hrPositions text[] hrDepartments text[] sameUnitOnly logAccess} unique(systemId,targetType,targetId) · MemberAccessLog {customerId userId hrEmployeeId hrPosition targetType targetId page} index(customerId,createdAt)+(userId,createdAt) · MemberPrivacyRequest {customerId type status requestedVia approvalRequestId fileId doneAt} index(tenantId,status) · MemberPrivacyPolicy unique(systemId,version) · MemberSavedView {systemId ownerUserId scope name filters columns sort sortOrder} · MemberTag unique(systemId,name)", hasAll(sp, ["systemId", "targetType", "targetId", "roles", "hrPositions", "hrDepartments", "sameUnitOnly", "logAccess"]) && (await colType("MemberSensitivePolicy", "roles")) === "_Role" && (await colType("MemberSensitivePolicy", "hrPositions")) === "_text" && (await hasIdx("MemberSensitivePolicy", ["systemId", "targetType", "targetId"], true)) && hasAll(al, ["customerId", "userId", "hrEmployeeId", "hrPosition", "targetType", "targetId", "page"]) && (await hasIdx("MemberAccessLog", ["customerId", "createdAt"])) && (await hasIdx("MemberAccessLog", ["userId", "createdAt"])) && hasAll(pr, ["customerId", "type", "status", "requestedVia", "approvalRequestId", "fileId", "doneAt"]) && (await hasIdx("MemberPrivacyRequest", ["tenantId", "status"])) && (await hasIdx("MemberPrivacyPolicy", ["systemId", "version"], true)) && hasAll(sv, ["systemId", "ownerUserId", "scope", "name", "filters", "columns", "sort", "sortOrder"]) && (await hasIdx("MemberTag", ["systemId", "name"], true)), "ครบ", `policy ขาด ${missing(sp, ["roles", "hrPositions", "hrDepartments", "sameUnitOnly", "logAccess"])} (roles=${await colType("MemberSensitivePolicy", "roles")}) · log ขาด ${missing(al, ["hrEmployeeId", "hrPosition", "targetType", "targetId", "page"])} · request ขาด ${missing(pr, ["type", "status", "requestedVia", "approvalRequestId", "fileId", "doneAt"])}`);
  const td = await cols("MemberTierDef"); const tb = await cols("MemberTierBenefit"); const th = await cols("MemberTierHistory"); const aq = await cols("AcquisitionLink"); const at = await cols("MemberAttribution");
  chk("M1.1-S1.10", "MemberTierDef (D1) {systemId key name color icon sortOrder description isDefault paidPlanId legacyTier keepRuleId upgradeRuleId reviewCron graceDays notifyBeforeDays archivedAt} unique(systemId,key) · MemberTierBenefit {tierDefId type config active} index · MemberTierHistory {customerId fromTierDefId toTierDefId reason ruleId evidence byUserId approvalRequestId notifiedAt} index(customerId,createdAt) · AcquisitionLink (D10) {systemId code name source campaignId unitId target utm qrFileId hits signups firstPurchases active} unique(tenantId,code) · MemberAttribution {customerId touch source linkId campaignId staffUserId referrerCustomerId unitId occurredAt} unique(customerId,touch)", hasAll(td, ["systemId", "key", "name", "color", "icon", "sortOrder", "description", "isDefault", "paidPlanId", "legacyTier", "keepRuleId", "upgradeRuleId", "reviewCron", "graceDays", "notifyBeforeDays", "archivedAt"]) && (await hasIdx("MemberTierDef", ["systemId", "key"], true)) && (await colType("MemberTierDef", "legacyTier")) === "MemberTier" && hasAll(tb, ["tierDefId", "type", "config", "active"]) && (await hasIdx("MemberTierBenefit", ["tierDefId"])) && hasAll(th, ["customerId", "fromTierDefId", "toTierDefId", "reason", "ruleId", "evidence", "byUserId", "approvalRequestId", "notifiedAt"]) && (await hasIdx("MemberTierHistory", ["customerId", "createdAt"])) && hasAll(aq, ["systemId", "code", "name", "source", "campaignId", "unitId", "target", "utm", "qrFileId", "hits", "signups", "firstPurchases", "active"]) && (await hasIdx("AcquisitionLink", ["tenantId", "code"], true)) && hasAll(at, ["customerId", "touch", "source", "linkId", "campaignId", "staffUserId", "referrerCustomerId", "unitId", "occurredAt"]) && (await hasIdx("MemberAttribution", ["customerId", "touch"], true)), "ครบ", `tierdef ขาด ${missing(td, ["key", "color", "isDefault", "legacyTier", "keepRuleId", "upgradeRuleId", "reviewCron", "graceDays", "notifyBeforeDays", "archivedAt"])} · history ขาด ${missing(th, ["reason", "ruleId", "evidence", "approvalRequestId", "notifiedAt"])} · link ขาด ${missing(aq, ["code", "source", "target", "utm", "hits", "signups", "firstPurchases"])} · attr ขาด ${missing(at, ["touch", "source", "linkId", "occurredAt"])}`);
  const ar = await cols("AutomationRule"); const ma = await cols("MemberActivity"); const ps = await cols("PosSale"); const ap = await cols("Appointment"); const cp = await cols("Coupon"); const mk = await cols("MktCampaign"); const mr = await cols("MktRecipient"); const cc = await cols("ChatContact");
  const arDefault = (await q<{ column_default: string | null }>(`select column_default from information_schema.columns where table_name='AutomationRule' and column_name='scope'`))[0]?.column_default ?? "";
  chk("M1.1-S1.11", "ตารางเดิมเพิ่มคอลัมน์ (§4.1): AutomationRule {scope AutomationScope default KANBAN · memberSystemId · tierDefId · journeyStats} · MemberActivity {data actorUserId} + index(customerId,module,createdAt) · PosSale {voucherUseIds giftCardTxnId tierDiscountSatang stampEventIds attributionId} · Appointment.stampEventId · Coupon {perMemberCode saveToWallet stackWithVoucher} · MktCampaign {segmentId journeyId holdoutPct variantB pushEnabled attachVoucherTemplateId stats} · MktRecipient {variant holdout openedAt usedAt saleSatang} · ChatContact {linkedBy MemberLinkMethod · linkedAt}", hasAll(ar, ["scope", "memberSystemId", "tierDefId", "journeyStats"]) && (await colType("AutomationRule", "scope")) === "AutomationScope" && /KANBAN/.test(arDefault) && hasAll(ma, ["data", "actorUserId", "unitId"]) && (await hasIdx("MemberActivity", ["customerId", "module", "createdAt"])) && hasAll(ps, ["voucherUseIds", "giftCardTxnId", "tierDiscountSatang", "stampEventIds", "attributionId"]) && ap.has("stampEventId") && hasAll(cp, ["perMemberCode", "saveToWallet", "stackWithVoucher"]) && hasAll(mk, ["segmentId", "journeyId", "holdoutPct", "variantB", "pushEnabled", "attachVoucherTemplateId", "stats"]) && hasAll(mr, ["variant", "holdout", "openedAt", "usedAt", "saleSatang"]) && hasAll(cc, ["linkedBy", "linkedAt"]) && (await colType("ChatContact", "linkedBy")) === "MemberLinkMethod", "ครบ", `rule ขาด ${missing(ar, ["scope", "memberSystemId", "tierDefId", "journeyStats"])} (default=${arDefault}) · activity ขาด ${missing(ma, ["data", "actorUserId"])} · sale ขาด ${missing(ps, ["voucherUseIds", "giftCardTxnId", "tierDiscountSatang", "stampEventIds", "attributionId"])} · coupon ขาด ${missing(cp, ["perMemberCode", "saveToWallet", "stackWithVoucher"])} · campaign ขาด ${missing(mk, ["segmentId", "journeyId", "holdoutPct", "variantB", "pushEnabled", "attachVoucherTemplateId", "stats"])} · recipient ขาด ${missing(mr, ["variant", "holdout", "openedAt", "usedAt", "saleSatang"])} · contact ขาด ${missing(cc, ["linkedBy", "linkedAt"])}`);
  const sql = read(`prisma/migrations/${migDir}/migration.sql`);
  const destructive = sql.split("\n").filter((l) => /^\s*(ALTER TABLE .*\b(DROP COLUMN|ALTER COLUMN [^;]*\b(TYPE|SET NOT NULL))|DROP TABLE|DROP TYPE)\b/i.test(l));
  const applied = await q<{ migration_name: string; finished_at: Date | null }>(`select migration_name, finished_at from "_prisma_migrations" where migration_name='${migDir}'`);
  const diff = spawnSync("pnpm", ["exec", "prisma", "migrate", "diff", "--from-config-datasource", "prisma.config.ts", "--to-schema", "prisma/schema", "--script"], { encoding: "utf8", env: process.env, timeout: 300_000 });
  const diffOut = `${diff.stdout ?? ""}${diff.stderr ?? ""}`;
  chk("M1.1-S1.12", "migration `*_member_v2_a` เป็น additive ล้วน (ไม่มี DROP TABLE/DROP COLUMN/DROP TYPE/ALTER COLUMN TYPE/SET NOT NULL) · applied บน QC (_prisma_migrations finished_at) · `prisma migrate diff` DB↔schema = empty migration (ไม่มี drift)", destructive.length === 0 && applied.length === 1 && applied[0]!.finished_at !== null && /empty migration/i.test(diffOut), "additive · applied · no drift", `destructive=${destructive.length} applied=${applied.length} diff=${diffOut.replace(/\s+/g, " ").slice(0, 160)}`);

  // ═══ S1b ทะเบียนช่องทางกลาง (D19 · src/lib/core/channels.ts) ═══
  const ch = (await import("@/lib/core/channels" as string)) as Any;
  const list: Any[] = Array.isArray(ch.CHANNELS) ? ch.CHANNELS : typeof ch.listChannels === "function" ? ch.listChannels() : [];
  const keys = list.map((c) => c.key);
  const KINDS = ["CHAT", "MESSAGING", "MARKETPLACE", "DIRECT"];
  chk("M1.1-S1b.1", "channels.ts export CHANNELS 15 รายการ {key label(ไทย) kind∈CHAT|MESSAGING|MARKETPLACE|DIRECT canConsent canNotify} ครบ 15 key (D19) · SHOPEE/LAZADA/TIKTOK_SHOP = MARKETPLACE · LINE/EMAIL/SMS/PUSH canConsent+canNotify · helpers isChannelKey(key) · getChannel(key) · consentChannels() · notifyChannels()", keys.length === 15 && CHANNEL_KEYS.every((k) => keys.includes(k)) && list.every((c) => typeof c.label === "string" && /[ก-๙]/.test(c.label) && KINDS.includes(c.kind) && typeof c.canConsent === "boolean" && typeof c.canNotify === "boolean") && ["SHOPEE", "LAZADA", "TIKTOK_SHOP"].every((k) => list.find((c) => c.key === k)?.kind === "MARKETPLACE") && ["LINE", "EMAIL", "SMS", "PUSH"].every((k) => list.find((c) => c.key === k)?.canConsent === true && list.find((c) => c.key === k)?.canNotify === true) && typeof ch.isChannelKey === "function" && ch.isChannelKey("LINE") === true && ch.isChannelKey("TELEGRAM") === false && typeof ch.getChannel === "function" && ch.getChannel("LINE")?.key === "LINE" && typeof ch.consentChannels === "function" && ch.consentChannels().every((c: Any) => c.canConsent) && typeof ch.notifyChannels === "function" && ch.notifyChannels().every((c: Any) => c.canNotify), "15 key · helpers", `${keys.length} key: ${keys.join(",")} · missing ${CHANNEL_KEYS.filter((k) => !keys.includes(k)).join(",")} · helpers ${[ch.isChannelKey, ch.getChannel, ch.consentChannels, ch.notifyChannels].map((f) => typeof f).join("/")}`);
  const chatEnum = await enumVals("ChatChannelType");
  const chanSrc = read("src/lib/core/channels.ts");
  const mapOk = typeof ch.chatChannelToKey === "function" && chatEnum.every((v) => keys.includes(ch.chatChannelToKey(v)));
  chk("M1.1-S1b.2", `chatChannelToKey(ChatChannelType) map ทุกค่าใน enum แชท (${chatEnum.join(",")}) เข้า key ทะเบียน · channels.ts บริสุทธิ์ (ไม่ import prisma/โมดูล/next) · ไม่มี 'as any'`, mapOk && !/from "@\/lib\/(core\/db|modules|platform)|from "next|@prisma\/client/.test(chanSrc) && !/as any\b/.test(chanSrc), "map ครบ · pure", `map=${mapOk} (${chatEnum.map((v) => `${v}→${ch.chatChannelToKey?.(v)}`).join(" ")})`);

  // ═══ S2 backfill 6 สคริปต์ (idempotent · --tenant · --dry-run) — สถานการณ์จำลองบนร้าน QC ═══
  const units = E.units as Record<string, string>;
  const patong = units.patong!;
  const mkLegacy = async (code: string, data: Record<string, unknown>) => {
    const c = await prisma.customer.create({ data: { tenantId: tid, memberSystemId: SYS, memberCode: code, name: `ลูกค้า backfill ${code}`, ...data } as Any });
    made.customers.push(c.id); return c;
  };
  const bf1 = await mkLegacy("BF-1", { phone: "0899000001", tier: "GOLD", marketingConsent: true, consentAt: new Date(), totalSpentSatang: 3_500_000 });
  const bf2 = await mkLegacy("BF-2", { email: "bf2@example.com", tier: "MEMBER", marketingConsent: false });
  // BF-2 มี attribution FIRST อยู่ก่อน (LINE_OA) — backfill ต้องไม่ทับ
  await P.memberAttribution.create({ data: { tenantId: tid, customerId: bf2.id, touch: "FIRST", source: "LINE_OA", occurredAt: new Date("2026-01-01T05:00:00Z") } });
  await prisma.customer.update({ where: { id: bf2.id }, data: { source: "LINE_OA" } as Any });
  const chatSysId = scope.systems.CHAT as string;
  const bfContact = await prisma.chatContact.create({ data: { tenantId: tid, systemId: chatSysId, channel: "WEBCHAT", externalUserId: `bf-web-${Date.now()}`, displayName: "ลูกค้า BF1 ทางเว็บ", phone: "0899000001" } });
  made.chatContacts.push(bfContact.id);
  let bfCrmId: string | null = null;
  if (scope.systems.CRM || (await P.crmContact?.count?.({ where: { tenantId: tid } }).catch(() => null)) !== null) {
    try {
      const crmSys: string = scope.systems.CRM ?? (made.crmSys = (await prisma.appSystem.create({ data: { tenantId: tid, type: "CRM" as Any, name: "CRM QC BF" } })).id);
      const crm = await P.crmContact.create({ data: { tenantId: tid, systemId: crmSys, name: "ลูกค้า BF1 ใน CRM", phone: "0899000001" } });
      bfCrmId = crm.id; made.crmContacts.push(crm.id);
    } catch { /* โมดูล CRM อาจต้องการฟิลด์เพิ่ม — ข้ามส่วน CRM */ }
  }
  const bfUser = await prisma.user.create({ data: { email: "mb-bf-hr@shark.local", name: "พนักงาน BF HR" } }); made.users.push(bfUser.id);
  await prisma.membership.create({ data: { userId: bfUser.id, tenantId: tid, role: "STAFF", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const hrSys = scope.systems.HR as string;
  const bfHr = await P.hrEmployee.create({ data: { tenantId: tid, systemId: hrSys, name: "พนักงาน BF HR", email: "MB-BF-HR@shark.local", position: "แคชเชียร์" } }); made.hrEmployees.push(bfHr.id);
  const bfHrNoEmail = await P.hrEmployee.create({ data: { tenantId: tid, systemId: hrSys, name: "พนักงาน BF ไม่มีอีเมล", position: "แม่บ้าน" } }); made.hrEmployees.push(bfHrNoEmail.id);
  // ร้านอื่น (ต้องไม่ถูกแตะเมื่อ --tenant ระบุร้าน QC)
  const other = await prisma.tenant.create({ data: { name: "MEMBER BF OTHER", slug: `member-bf-other-${Date.now()}` } }); made.otherTenant = other.id;
  const otherSys = await prisma.appSystem.create({ data: { tenantId: other.id, type: "MEMBER" as Any, name: "สมาชิกร้านอื่น" } });
  const bfx = await prisma.customer.create({ data: { tenantId: other.id, memberSystemId: otherSys.id, memberCode: "BFX-1", name: "ลูกค้าร้านอื่น", phone: "0899000009", tier: "SILVER", marketingConsent: true } as Any });
  const countsBefore = { tierDef: await P.memberTierDef.count({ where: { tenantId: tid } }), field: await P.memberField.count({ where: { tenantId: tid } }), party: await prisma.party.count({ where: { tenantId: tid } }) };
  const results = BACKFILL.map((s) => ({ s, ...run(s, ["--tenant", MQC.tenantSlug]) }));
  const allOk = results.every((r) => r.code === 0);
  if (!allOk) console.log(results.filter((r) => r.code !== 0).map((r) => `--- ${r.s} (exit ${r.code})\n${r.out.slice(-1500)}`).join("\n"));
  const tiers: Any[] = await P.memberTierDef.findMany({ where: { systemId: SYS } });
  const gold = tiers.find((t) => t.legacyTier === "GOLD"); const def = tiers.find((t) => t.isDefault);
  const bf1a = (await prisma.customer.findUnique({ where: { id: bf1.id } })) as Any; const bf2a = (await prisma.customer.findUnique({ where: { id: bf2.id } })) as Any;
  const tierRules: Any[] = await prisma.automationRule.findMany({ where: { tenantId: tid, scope: "MEMBER_TIER" } as Any });
  chk("M1.1-S2.1", "backfill-tiers: TierDef 4 แถว/ระบบ (key member/silver/gold/platinum · legacyTier ครบ 4 · isDefault = MEMBER) · Customer.tierDefId ตาม enum เดิม (GOLD→gold · MEMBER→default) · tierSince · TierHistory INITIAL 1 แถว/คน (evidence มี totalSpentSatang) · MemberTierConfig เดิม → AutomationRule scope MEMBER_TIER (upgrade · tierDefId · conditions spent12m ≥ minSpendSatang) ≥ 3 ใบ + TierDef.upgradeRuleId ชี้กลับ", allOk && tiers.length === 4 && ["member", "silver", "gold", "platinum"].every((k) => tiers.some((t) => t.key === k)) && ["MEMBER", "SILVER", "GOLD", "PLATINUM"].every((k) => tiers.some((t) => t.legacyTier === k)) && def?.legacyTier === "MEMBER" && bf1a.tierDefId === gold?.id && !!bf1a.tierSince && bf2a.tierDefId === def?.id && (await P.memberTierHistory.count({ where: { customerId: bf1.id, reason: "INITIAL" } })) === 1 && (await P.memberTierHistory.count({ where: { customerId: bf2.id, reason: "INITIAL" } })) === 1 && tierRules.length >= 3 && tierRules.every((r) => !!r.tierDefId && JSON.stringify(r.conditions).includes("spent")) && tiers.filter((t) => t.legacyTier !== "MEMBER").every((t) => !!t.upgradeRuleId && tierRules.some((r) => r.id === t.upgradeRuleId)), "4 tier · map · history · rules", `ok=${allOk} tiers=${tiers.map((t) => `${t.key}/${t.legacyTier}/${t.isDefault}`).join(",")} bf1=${bf1a.tierDefId === gold?.id} bf2=${bf2a.tierDefId === def?.id} rules=${tierRules.length}`);
  const sysFields: Any[] = await P.memberField.findMany({ where: { systemId: SYS, isSystem: true } });
  const sysSections: Any[] = await P.memberSection.findMany({ where: { systemId: SYS, isSystem: true } });
  chk("M1.1-S2.2", `backfill-fields: ฟิลด์ระบบ ${SYSTEM_FIELD_KEYS.length} ตัว (isSystem · systemKey ตาม §11.2) ในส่วนระบบ (isSystem) ของทุกระบบ MEMBER ของร้าน · label ไทย · phone/email unique · ไม่ซ้ำหลังรันซ้ำ`, allOk && SYSTEM_FIELD_KEYS.every((k) => sysFields.some((f) => f.systemKey === k)) && sysFields.length === SYSTEM_FIELD_KEYS.length && sysSections.length >= 1 && sysFields.every((f) => /[ก-๙]/.test(f.label) && sysSections.some((s) => s.id === f.sectionId)) && sysFields.find((f) => f.systemKey === "phone")?.unique === true, `${SYSTEM_FIELD_KEYS.length} ฟิลด์`, `${sysFields.length} · ขาด ${SYSTEM_FIELD_KEYS.filter((k) => !sysFields.some((f) => f.systemKey === k)).join(",")}`);
  const c1: Any[] = await P.memberConsent.findMany({ where: { customerId: bf1.id } }); const c2: Any[] = await P.memberConsent.findMany({ where: { customerId: bf2.id } });
  chk("M1.1-S2.3", "backfill-consent: marketingConsent=true → MemberConsent LINE/EMAIL/SMS granted=true source IMPORT grantedAt=consentAt · false → 3 แถว granted=false (บันทึกสถานะ) · channel เป็น key ทะเบียน", allOk && c1.length === 3 && ["LINE", "EMAIL", "SMS"].every((k) => c1.some((c) => c.channel === k && c.granted === true && c.source === "IMPORT" && !!c.grantedAt)) && c2.length === 3 && c2.every((c) => c.granted === false && c.source === "IMPORT"), "3+3", `${c1.length}/${c2.length} ${JSON.stringify(c1.map((c) => [c.channel, c.granted, c.source]))}`);
  const bf1b = (await prisma.customer.findUnique({ where: { id: bf1.id } })) as Any; const bf2b = (await prisma.customer.findUnique({ where: { id: bf2.id } })) as Any;
  const ctc = (await prisma.chatContact.findUnique({ where: { id: bfContact.id } })) as Any;
  const crmRow = bfCrmId ? await P.crmContact.findUnique({ where: { id: bfCrmId } }) : null;
  chk("M1.1-S2.4", "backfill-party-links: Customer ที่ partyId ว่าง → Party (เบอร์/อีเมล ผ่าน facade party) · ChatContact เบอร์ตรง → partyId เดียวกับสมาชิก + customerId + linkedBy PHONE + linkedAt · CrmContact เบอร์ตรง → partyId (ถ้ามีโมดูล) · ลูกค้าที่มีแค่อีเมล → partyId ผ่านอีเมล", allOk && !!bf1b.partyId && !!bf2b.partyId && ctc.partyId === bf1b.partyId && ctc.customerId === bf1.id && ctc.linkedBy === "PHONE" && !!ctc.linkedAt && (!bfCrmId || crmRow?.partyId === bf1b.partyId), "ผูกครบ", `bf1.party=${!!bf1b.partyId} bf2.party=${!!bf2b.partyId} chat=${ctc.partyId === bf1b.partyId}/${ctc.customerId === bf1.id}/${ctc.linkedBy} crm=${bfCrmId ? crmRow?.partyId === bf1b.partyId : "n/a"}`);
  const at1: Any = await P.memberAttribution.findFirst({ where: { customerId: bf1.id, touch: "FIRST" } }); const at2: Any = await P.memberAttribution.findFirst({ where: { customerId: bf2.id, touch: "FIRST" } });
  chk("M1.1-S2.5", "backfill-attribution: Customer ไม่มี source → WALK_IN + MemberAttribution FIRST (occurredAt = createdAt · unitId = homeUnitId ถ้ามี) · คนที่มี source/FIRST อยู่แล้ว (LINE_OA) ไม่ถูกทับ", allOk && bf1b.source === "WALK_IN" && at1?.source === "WALK_IN" && Math.abs(new Date(at1.occurredAt).getTime() - new Date(bf1b.createdAt).getTime()) < 1000 && bf2b.source === "LINE_OA" && at2?.source === "LINE_OA" && (await P.memberAttribution.count({ where: { customerId: bf2.id } })) === 1, "WALK_IN · ไม่ทับ", `bf1=${bf1b.source}/${at1?.source} bf2=${bf2b.source}/${at2?.source}`);
  const hrA: Any = await P.hrEmployee.findUnique({ where: { id: bfHr.id } }); const hrB: Any = await P.hrEmployee.findUnique({ where: { id: bfHrNoEmail.id } });
  const nurseHr: Any = await P.hrEmployee.findFirst({ where: { tenantId: tid, email: MQC.staff.find((s: Any) => s.key === "nurse").email } });
  chk("M1.1-S2.6", "backfill-hr-users (D17): HrEmployee.email ตรงกับ User ที่มี Membership ในร้าน (เทียบแบบไม่สนตัวพิมพ์) → linkedUserId · ไม่มีอีเมล = ไม่แตะ · ที่ผูกอยู่แล้วไม่เปลี่ยน (พยาบาลจาก seed ยังชี้ user เดิม)", allOk && hrA?.linkedUserId === bfUser.id && hrB?.linkedUserId === null && nurseHr?.linkedUserId === E.users.staff.nurse.userId, "ผูกจากอีเมล", `A=${hrA?.linkedUserId === bfUser.id} B=${hrB?.linkedUserId} nurse=${nurseHr?.linkedUserId === E.users.staff.nurse.userId}`);
  const snap = async () => ({ tierDef: await P.memberTierDef.count({ where: { tenantId: tid } }), history: await P.memberTierHistory.count({ where: { tenantId: tid } }), field: await P.memberField.count({ where: { tenantId: tid } }), section: await P.memberSection.count({ where: { tenantId: tid } }), consent: await P.memberConsent.count({ where: { tenantId: tid } }), attr: await P.memberAttribution.count({ where: { tenantId: tid } }), party: await prisma.party.count({ where: { tenantId: tid } }), rules: await prisma.automationRule.count({ where: { tenantId: tid, scope: "MEMBER_TIER" } as Any }) });
  const s1 = await snap();
  const again = BACKFILL.map((s) => ({ s, ...run(s, ["--tenant", MQC.tenantSlug]) }));
  const s2 = await snap();
  chk("M1.1-S2.7", "🔴 idempotent: รันทั้ง 6 สคริปต์ซ้ำ → exit 0 ทุกตัว · จำนวน TierDef/TierHistory/Field/Section/Consent/Attribution/Party/กฎระดับ เท่าเดิมทุกตัว · TierDef ไม่ซ้ำ (4 ใบเท่าเดิม)", again.every((r) => r.code === 0) && JSON.stringify(s1) === JSON.stringify(s2) && s2.tierDef === countsBefore.tierDef + 0 && s2.tierDef === 4, "เท่าเดิม", `${JSON.stringify(s1)} → ${JSON.stringify(s2)} exit=${again.map((r) => r.code).join(",")}`);
  const bf3 = await mkLegacy("BF-3", { phone: "0899000003", tier: "SILVER", marketingConsent: true });
  const dry = BACKFILL.map((s) => ({ s, ...run(s, ["--tenant", MQC.tenantSlug, "--dry-run"]) }));
  const bf3a = (await prisma.customer.findUnique({ where: { id: bf3.id } })) as Any;
  const bfxA = (await prisma.customer.findUnique({ where: { id: bfx.id } })) as Any;
  chk("M1.1-S2.8", "--dry-run: exit 0 · พิมพ์คำว่า dry-run/ทดลอง · **ไม่เขียน** (BF-3 ยัง tierDefId/partyId/source ว่าง · ไม่มี consent/attribution) · --tenant จำกัดร้าน: ลูกค้าร้านอื่น (BFX) ไม่ถูกแตะหลังรันจริง 2 รอบ (tierDefId/partyId ว่าง · ร้านอื่นไม่มี TierDef)", dry.every((r) => r.code === 0 && /dry[- ]?run|ทดลอง/i.test(r.out)) && bf3a.tierDefId === null && bf3a.partyId === null && bf3a.source === null && (await P.memberConsent.count({ where: { customerId: bf3.id } })) === 0 && (await P.memberAttribution.count({ where: { customerId: bf3.id } })) === 0 && bfxA.tierDefId === null && bfxA.partyId === null && (await P.memberTierDef.count({ where: { tenantId: other.id } })) === 0, "ไม่เขียน · ร้านอื่นไม่แตะ", `dry=${dry.map((r) => r.code).join(",")} bf3=${bf3a.tierDefId}/${bf3a.partyId}/${bf3a.source} bfx=${bfxA.tierDefId}/${bfxA.partyId} otherTier=${await P.memberTierDef.count({ where: { tenantId: other.id } })}`);

  // ═══ S3 seed ชุดข้อมูล QC สมาชิก (ตัวเลขตรง MQC + เฉลย) ═══
  const bfIds = made.customers;
  const cw = { tenantId: tid, memberSystemId: SYS, id: { notIn: bfIds } };
  const byTier: Record<string, number> = {};
  for (const t of ["MEMBER", "SILVER", "GOLD", "PLATINUM"]) byTier[t] = await prisma.customer.count({ where: { ...cw, tier: t as Any } });
  const byUnit = { patong: await prisma.customer.count({ where: { ...cw, homeUnitId: patong } as Any }), kata: await prisma.customer.count({ where: { ...cw, homeUnitId: units.kata } as Any }) };
  const sysTypes = (await prisma.appSystem.findMany({ where: { tenantId: tid }, select: { type: true } })).map((s) => s.type as string);
  const sales = { total: await prisma.posSale.count({ where: { tenantId: tid, status: "PAID" as Any } }), patong: await prisma.posSale.count({ where: { tenantId: tid, status: "PAID" as Any, unitId: patong } }), kata: await prisma.posSale.count({ where: { tenantId: tid, status: "PAID" as Any, unitId: units.kata } }) };
  const appts = await prisma.appointment.count({ where: { tenantId: tid } });
  const convs = await prisma.chatConversation.count({ where: { tenantId: tid, id: { notIn: made.chatConvs } } });
  const memberships = await prisma.membership.count({ where: { tenantId: tid, userId: { notIn: made.users } } });
  chk("M1.1-S3.1", `seed ตัวเลขตรง MQC: สมาชิก ${MQC.members.total} (MEMBER 30 · SILVER 15 · GOLD 10 · PLATINUM 5 · ป่าตอง 40 · กะตะ 20) · ระบบ 8 ประเภท (${MQC.systems.join("/")}) · คน 7 (owner · manager · staff 4 · noPerm) · บิล PAID 120 (80/40) · นัด 40 · ห้องแชท 10 · HrEmployee ≥ 3 · พยาบาล linkedUserId = user nurse`, await prisma.customer.count({ where: cw }) === 60 && byTier.MEMBER === 30 && byTier.SILVER === 15 && byTier.GOLD === 10 && byTier.PLATINUM === 5 && byUnit.patong === 40 && byUnit.kata === 20 && MQC.systems.every((t: string) => sysTypes.includes(t)) && memberships === 7 && sales.total === 120 && sales.patong === 80 && sales.kata === 40 && appts === 40 && convs === 10 && (await P.hrEmployee.count({ where: { tenantId: tid, id: { notIn: made.hrEmployees } } })) >= 3 && nurseHr?.linkedUserId === E.users.staff.nurse.userId, "ตรงทุกตัว", `members=${await prisma.customer.count({ where: cw })} tier=${JSON.stringify(byTier)} unit=${JSON.stringify(byUnit)} sys=${sysTypes.join(",")} people=${memberships} sales=${JSON.stringify(sales)} appts=${appts} convs=${convs}`);
  const members: Any[] = Array.isArray(E.members) ? E.members : Object.values(E.members ?? {});
  const sample = members.filter((_, i) => i % 12 === 0);
  const sampleOk = (await Promise.all(sample.map(async (m) => { const c = await prisma.customer.findUnique({ where: { id: m.id } }) as Any; return !!c && c.memberCode === m.memberCode && c.partyId === m.partyId && c.phone === m.phone && c.tier === m.tier && !!c.tierDefId; }))).every(Boolean);
  chk("M1.1-S3.2", "เฉลย member-expected.json: {tenantId systemId systems{8} units{patong,kata} users{owner,manager,staff{thana,pook,nurse,kata},noPerm} members[60]{id memberCode partyId phone email tier unit index} tierDefs{member,silver,gold,platinum} fields{dive:{certLevel certAgency certNo diveCount lastDiveAt} health:{conditions emergencyContact}} today oracleValidUntil} · id ตัวอย่างมีจริงใน DB และตรงค่า · สมาชิกทุกคน partyId ไม่ว่าง", E.tenantId === tid && E.systemId === SYS && Object.keys(E.systems ?? {}).length >= 8 && !!E.units?.patong && !!E.units?.kata && !!E.users?.owner?.userId && !!E.users?.manager?.userId && ["thana", "pook", "nurse", "kata"].every((k) => !!E.users?.staff?.[k]?.userId) && !!E.users?.noPerm?.userId && members.length === 60 && members.every((m) => m.id && m.memberCode && m.partyId && m.phone && m.tier && m.unit && typeof m.index === "number") && ["member", "silver", "gold", "platinum"].every((k) => !!E.tierDefs?.[k]) && ["certLevel", "certAgency", "certNo", "diveCount", "lastDiveAt"].every((k) => !!E.fields?.dive?.[k]) && ["conditions", "emergencyContact"].every((k) => !!E.fields?.health?.[k]) && E.today === MQC.today && sampleOk && (await prisma.customer.count({ where: { ...cw, partyId: null } })) === 0, "ครบ · ตรง DB", `members=${members.length} sample=${sampleOk} nullParty=${await prisma.customer.count({ where: { ...cw, partyId: null } })} keys=${Object.keys(E).join(",")}`);
  const lineIds = await P.memberChannelIdentity.count({ where: { tenantId: tid, channel: "LINE", linkedBy: "CHANNEL_ID" } });
  const consentLine = await P.memberConsent.count({ where: { tenantId: tid, channel: "LINE", granted: true, customerId: { notIn: bfIds } } });
  const certVals = E.fields?.dive?.certLevel ? await P.memberFieldValue.count({ where: { fieldId: E.fields.dive.certLevel, valueOptions: { isEmpty: false } } }).catch(() => P.memberFieldValue.count({ where: { fieldId: E.fields.dive.certLevel } })) : 0;
  const healthVals = E.fields?.health?.conditions ? await P.memberFieldValue.count({ where: { fieldId: E.fields.health.conditions } }) : 0;
  const healthSection: Any = E.fields?.health?.conditions ? await P.memberSection.findFirst({ where: { id: ((await P.memberField.findUnique({ where: { id: E.fields.health.conditions } })) as Any)?.sectionId ?? "x" } }) : null;
  const codes = await prisma.customer.findMany({ where: cw, select: { memberCode: true, phone: true } });
  // วันเกิด = เดือน 10 ปีใดก็ได้ (ปีเกิดจริง 19xx — builder แย้งถูก: ปี 2026 = วันเกิดในอนาคต)
  const birthdays = Number((await q<{ n: bigint }>(`select count(*)::bigint as n from "Customer" where "memberSystemId"='${SYS}' and "birthDate" is not null and extract(month from "birthDate") = 10 and extract(year from "birthDate") < 2020${bfIds.length ? ` and id not in (${bfIds.map((x) => `'${x}'`).join(",")})` : ""}`))[0]!.n);
  chk("M1.1-S3.3", `ข้อมูลในร้าน: LINE identity ${MQC.members.lineIdentityCount} (channel LINE · linkedBy CHANNEL_ID) · consent LINE granted ${MQC.members.consentCount} · ค่าฟิลด์ระดับใบรับรอง ${MQC.members.diveFieldsCount} คน · โรคประจำตัว ${MQC.members.healthFieldsCount} คน (ส่วน "สุขภาพ" sensitive=true) · memberCode/เบอร์ไม่ซ้ำ 60 · tierDefId ครบ 60 · TierHistory INITIAL 60 · MemberAttribution FIRST 60 · MemberTierConfig 3 แถว · วันเกิดเดือน ต.ค. (ปีเกิดจริง) = 12 คน`, lineIds === MQC.members.lineIdentityCount && consentLine === MQC.members.consentCount && certVals === MQC.members.diveFieldsCount && healthVals === MQC.members.healthFieldsCount && healthSection?.sensitive === true && new Set(codes.map((c) => c.memberCode)).size === 60 && new Set(codes.map((c) => c.phone)).size === 60 && (await prisma.customer.count({ where: { ...cw, tierDefId: null } as Any })) === 0 && (await P.memberTierHistory.count({ where: { tenantId: tid, reason: "INITIAL", customerId: { notIn: bfIds } } })) === 60 && (await P.memberAttribution.count({ where: { tenantId: tid, touch: "FIRST", customerId: { notIn: bfIds } } })) === 60 && (await P.memberTierConfig.count({ where: { tenantId: tid } })) === 3 && birthdays === 12, "ตรง", `line=${lineIds} consent=${consentLine} cert=${certVals} health=${healthVals}/${healthSection?.sensitive} codes=${new Set(codes.map((c) => c.memberCode)).size} tierNull=${await prisma.customer.count({ where: { ...cw, tierDefId: null } as Any })} hist=${await P.memberTierHistory.count({ where: { tenantId: tid, reason: "INITIAL", customerId: { notIn: bfIds } } })} attr=${await P.memberAttribution.count({ where: { tenantId: tid, touch: "FIRST", customerId: { notIn: bfIds } } })} birthdays=${birthdays}`);

  // ═══ S4 scope.ts + fitness ═══
  const scopeSrc = read("src/lib/core/scope.ts");
  const scopeMiss = TABLES.filter((t) => !new RegExp(`^\\s*${t}:\\s*(tenant|sys\\()`, "m").test(scopeSrc));
  chk("M1.1-S4.1", "scope.ts ลงทะเบียนตารางใหม่ครบ 18 (tenant หรือ sys()) — fail-closed guard ไม่โยนตอน boot", scopeMiss.length === 0, "ครบ", `ขาด ${scopeMiss.join(",")}`);
  const envNo = { ...process.env }; delete envNo.DATABASE_URL; delete envNo.DIRECT_URL;
  const fitNo = spawnSync("pnpm", ["exec", "tsx", "scripts/fitness.mts"], { encoding: "utf8", env: envNo, timeout: 300_000 });
  const fitYes = spawnSync("pnpm", ["exec", "tsx", "scripts/fitness.mts"], { encoding: "utf8", env: process.env, timeout: 300_000 });
  chk("M1.1-S4.2", "fitness ผ่านทั้งแบบไม่มี env (ไม่มี DATABASE_URL/DIRECT_URL) และแบบมี env (exit 0 ทั้งคู่)", fitNo.status === 0 && fitYes.status === 0, "0/0", `${fitNo.status}/${fitYes.status} ${(fitNo.stdout ?? "").split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ")}`);

  // ═══ S3.4 seed ซ้ำ = idempotent (ทำท้ายสุด — เฉลย/ id เปลี่ยนหลังจากนี้) ═══
  await cleanup();
  const mtime0 = statSync(MQC.expectedPath).mtimeMs;
  const reseed = run("seed-member-qc.mts");
  const scope2 = await mq.resolveMemberScope(prisma);
  const tenants = await prisma.tenant.count({ where: { slug: MQC.tenantSlug } });
  const E2 = existsSync(MQC.expectedPath) ? JSON.parse(readFileSync(MQC.expectedPath, "utf8")) : {};
  const n2 = scope2 ? await prisma.customer.count({ where: { tenantId: scope2.tenantId } }) : -1;
  chk("M1.1-S3.4", "🔴 seed idempotent: รัน seed-member-qc.mts ซ้ำ → exit 0 · ร้าน slug เดิมมี 1 ร้าน (ลบเก่าสร้างใหม่) · tenantId ใหม่ · สมาชิก 60 · เฉลยเขียนใหม่ (mtime ใหม่ · tenantId ตรง DB) · ผู้ใช้ QC อีเมลเดิมไม่ซ้ำ", reseed.code === 0 && tenants === 1 && !!scope2 && scope2.tenantId !== tid && n2 === 60 && statSync(MQC.expectedPath).mtimeMs > mtime0 && E2.tenantId === scope2?.tenantId && (await prisma.user.count({ where: { email: MQC.ownerEmail } })) === 1, "1 ร้าน · 60 · เฉลยใหม่", `exit=${reseed.code} tenants=${tenants} new=${scope2?.tenantId !== tid} n=${n2} ${reseed.code !== 0 ? reseed.out.slice(-600) : ""}`);
  tid = scope2?.tenantId ?? tid;
} catch (e) {
  console.error("💥", e);
  chk("M1.1-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  await cleanup();
  await prisma.$disconnect();
}
async function cleanup() {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ตารางอาจยังไม่มี */ } };
  for (const id of made.customers) {
    for (const m of ["memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberActivity"]) await d(() => P[m].deleteMany({ where: { customerId: id } }));
    await d(() => prisma.customer.delete({ where: { id } }));
  }
  for (const id of made.chatConvs) await d(() => prisma.chatConversation.delete({ where: { id } }));
  for (const id of made.chatContacts) await d(() => prisma.chatContact.delete({ where: { id } }));
  for (const id of made.crmContacts) await d(() => P.crmContact.delete({ where: { id } }));
  if (made.crmSys) await d(() => prisma.appSystem.delete({ where: { id: made.crmSys! } }));
  for (const id of made.hrEmployees) await d(() => P.hrEmployee.delete({ where: { id } }));
  await d(() => prisma.party.deleteMany({ where: { tenantId: tid, OR: [{ phoneNorm: { in: ["0899000001", "0899000003"] } }, { email: "bf2@example.com" }] } }));
  for (const id of made.users) { await d(() => prisma.membership.deleteMany({ where: { userId: id } })); await d(() => prisma.user.delete({ where: { id } })); }
  if (made.otherTenant) {
    const o = made.otherTenant;
    for (const m of ["memberTierHistory", "memberAttribution", "memberConsent", "memberTierDef", "memberField", "memberSection", "customer", "party", "automationRule", "appSystem"]) await d(() => P[m].deleteMany({ where: { tenantId: o } }));
    await d(() => prisma.tenant.delete({ where: { id: o } }));
  }
  made.customers = []; made.chatConvs = []; made.chatContacts = []; made.crmContacts = []; made.crmSys = null; made.hrEmployees = []; made.users = []; made.otherTenant = null;
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M1.1: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
