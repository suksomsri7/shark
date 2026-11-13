// QC — TRIPS A1.1 รอบ 2 · migration `agency` (+ TripSupplier* S1.1–S1.3 + หนี้ schema T0.x) · «AgentIdentity» ระดับแพลตฟอร์ม · ค่าตั้งโดเมน agency
// รอบ 2 (13 พ.ย.): ตามผลตรวจออกแบบ REVISE FIRST + มติผู้คุม R1–R8 (ใบสั่ง §9) · ตัวช่วยค่าคงที่ใช้ซ้ำ = scripts/trips-agency-invariants.mts
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ผู้คุมตัดสิน · ORACLE-EDIT เฉพาะผู้คุม)
// สัญญา: ledger/trips-briefs/A1.1.md (ใบสั่ง) · ledger/TRIPS-CORE-CONTRACT.md §B.0 §B.2 §E §I §J.3.1 §N.3 §N.4 · ledger/TRIPS-DEFAULTS.md §2 §4 §5 ภาคผนวก ก
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวตั้งแต่ก่อนมีงาน) · M migration (static + ลงฐาน) · T ตาราง/คอลัมน์/ชนิด/default/แกน/BIGINT
//   C CHECK: ชุดค่าตามชื่อ + **ทุก CHECK ตัวเลข/เครื่องหมาย/ช่วง/ข้ามคอลัมน์ มีแถวผิดจริง** (23514 + ชื่อ constraint จาก error · tx rollback)
//   U unique/NND/partial (pg_index + พฤติกรรม 23505) · L สมุดต่อท้ายอย่างเดียว (trigger 23001 · ล้างร้าน PENDING_DELETE · Prisma · VOID→ย้ายใบ · ค่าคงที่กลาง)
//   S scope.ts/client/ไฟล์/ขอบเขต/F17.1
//   R ทะเบียน agency: doc-sync กับ TRIPS-DEFAULTS (parse ตาราง md) · ชนิด ชั้น ค่าเริ่ม แม่แบบ snapshot ป้าย legal metadata การแสดงผล
//   RS ชั้น AGENT/AGENT_TIER บนฐานจริง · WS คำเตือน WARN ของ agency · X1 แยกร้านทุกตารางใหม่ผ่าน tenantDb · AI ตัวตนเอเจนซี่ (เอกลักษณ์ · ผูก · ความเป็นส่วนตัว)
//   F ฟอร์มค่าตั้ง agency · D drift (`prisma migrate diff` ฐาน→schema) · G regression (ลูกโพรเซส: qc-trips-t0.1 · qc-trips-p0.1 · fitness + positive control ของ F17.1)
//
// 🔴 ตัดสินโครงฐานด้วย `pg` ตรง · ค่าตั้ง/ตัวตนผ่านโค้ดจริง · แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-a11-*` + แถว global ติดป้าย "QCA11" / `qca11-*` ลบใน finally + กวาดค้างตอนเริ่ม
//    การทดสอบ CHECK/unique ส่วนใหญ่อยู่ใน tx ที่ ROLLBACK (ไม่ทิ้งแถว) · แถวสมุดที่ commit ลบด้วย `SET LOCAL shark.ledger_purge = 'on'` (ทางที่ใบสั่ง §3.3 เปิดไว้)
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-a1.1.mts [--no-regression]
//      (ห้าม timeout ครอบ · ห้าม kill กลางคัน · `--no-regression` = G เป็น SKIP — รับใบต้องไม่มี SKIP)
// ผลที่ถูกต้องก่อนมี A1.1: PC เขียว · ที่เหลือแดงด้วยเหตุผล "ยังไม่มี…" (M-7 S-9 S-10 S-11 R-1 เขียวได้ = ยังไม่แตะไฟล์ต้องห้าม/เอกสารตรงรายการฝัง)
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";

const LABEL = "qc-trips-a1.1";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NO_REG = process.argv.includes("--no-regression");
const BASE_SHA = "4db90ad9e"; // ปลาย wip/trips-a1.1 ตอนเขียนข้อสอบ (= session/trips: P0.1–T0.6 + T1.1 + T1.2)
const BASE_LAST_MIG = "20270201000100_trips";

loadTripsQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-trips ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
// คีย์ HMAC เลขภาษีอ่าน SESSION_SECRET ตอนเรียก (ใบสั่ง §5.2) — ฐาน QC อาจไม่มี ⇒ ตั้งค่าทดสอบเฉพาะโพรเซสนี้
// คีย์ HMAC เลขภาษีสืบจาก INTEGRATIONS_CREDENTIALS_KEY (ใบสั่ง §5.2) — ไม่มีในฐาน QC ⇒ ตั้งค่าทดสอบเฉพาะโพรเซสนี้ (≥ 32 ตัว)
if (!process.env.INTEGRATIONS_CREDENTIALS_KEY || process.env.INTEGRATIONS_CREDENTIALS_KEY.trim().length < 32) process.env.INTEGRATIONS_CREDENTIALS_KEY = `qc-a11-${"k".repeat(40)}`;

// ═══════════════ harness ═══════════════
type Res = "PASS" | "FAIL" | "SKIP";
type Rec = Record<string, unknown>;
const cks: { id: string; res: Res; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 280);
const fmt = (v: unknown): string => { try { return (JSON.stringify(v) ?? String(v)).slice(0, 200); } catch { return String(v); } };
const ok = (cond: unknown, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string) => {
  cks.push({ id, res, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); record(id, name, "PASS", ""); } catch (e) { record(id, name, "FAIL", e instanceof AssertFail ? e.message : `throw: ${errMsg(e)}`); }
};
const skip = (id: string, name: string, why: string) => record(id, name, "SKIP", why);
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const stripSqlComments = (s: string) => s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const THAI = /[฀-๿]/;
const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
type AnyFn = (...a: unknown[]) => unknown;
const fnOf = (mod: Rec | null, name: string, where: string): AnyFn => {
  const f = mod?.[name];
  if (typeof f !== "function") throw new AssertFail(`${where} ยังไม่มี ${name}`);
  return f as AnyFn;
};
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => {
  try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" });
const gitOk = (args: string[]) => spawnSync("git", ["-C", ROOT, ...args], { encoding: "utf8" }).status === 0;
const hasRef = (ref: string) => gitOk(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
/** ไฟล์ที่เปลี่ยนจาก BASE (รวม untracked) */
const changedSinceBase = (paths: string[]): string[] => {
  const a = git(["diff", "--name-only", BASE_SHA, "--", ...paths]).split("\n").filter(Boolean);
  const b = git(["ls-files", "--others", "--exclude-standard", "--", ...paths]).split("\n").filter(Boolean);
  return [...new Set([...a, ...b])];
};
/** ไฟล์ที่ตรงกับ session/trips (มาจากใบอื่นที่รับแล้ว) ไม่นับเป็นของใบนี้ */
const sameAsSession = (f: string) => hasRef("session/trips") && gitOk(["diff", "--quiet", "session/trips", "--", f]) && !git(["ls-files", "--others", "--exclude-standard", "--", f]).trim();
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const rid = (p: string) => `a11qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const SLUG = "trips-a11-";
const EMAIL_PREFIX = "trips-a11-";
const QC_MARK = "QCA11";
const pgCode = (e: unknown): string => (asRec(e) && "code" in (e as Rec) ? String((e as Rec).code) : "");
const ALPH = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const randCode = () => `AG-${[...randomBytes(6)].map((b) => ALPH[b % 30]).join("")}`;
const hex = (n: number) => randomBytes(n).toString("hex");
const lineSub = () => `U${hex(16)}`;
/** เลข 13 หลักที่ checksum ถูก (mod 11) · ขึ้นต้น 0 = นิติบุคคล */
const thaiTaxId = (prefix12: string): string => {
  const d = prefix12.split("").map(Number);
  const s = d.reduce((a, x, i) => a + x * (13 - i), 0);
  return `${prefix12}${(11 - (s % 11)) % 10}`;
};
/** แฮชเลขภาษีตามสเปก (คำนวณเองโดยไม่พึ่งโค้ดของผู้สร้าง · ใบสั่ง §5.2) */
const expectTaxHash = (id13: string): string => {
  const k = createHmac("sha256", String(process.env.INTEGRATIONS_CREDENTIALS_KEY)).update("shark:agent-taxid:v1").digest();
  return `v1:${createHmac("sha256", k).update(`TH-JURISTIC:${id13}`).digest("hex")}`;
};

// ═══════════════ สเปก — ตาราง ═══════════════
type Axis = "global" | "tenant" | "unit";
type ColT = "t" | "i" | "bi" | "b" | "j" | "ts" | "d" | "ta";
const PG_TYPE: Record<ColT, string> = { t: "text", i: "integer", bi: "bigint", b: "boolean", j: "jsonb", ts: "timestamp without time zone", d: "date", ta: "ARRAY" };
const TS = "createdAt:ts updatedAt:ts";
const TABLES: Record<string, { axis: Axis; cols: string }> = {
  AgentIdentity: { axis: "global", cols: `id:t displayName:t publicCode:t taxIdHash:t? status:t ${TS}` },
  AgentUser: { axis: "global", cols: `id:t identityId:t displayName:t role:t status:t lastLoginAt:ts? ${TS}` },
  AgentLogin: { axis: "global", cols: "id:t agentUserId:t kind:t providerId:t subject:t verifiedAt:ts lastUsedAt:ts? createdAt:ts" },
  AgentSession: { axis: "global", cols: `id:t agentUserId:t tokenHash:t activeAgentAccountId:t? expiresAt:ts idleExpiresAt:ts revokedAt:ts? ipHash:t? uaHash:t? ${TS}` },
  AgentLoginCode: { axis: "global", cols: "id:t target:t codeHash:t attempts:i expiresAt:ts usedAt:ts? createdAt:ts" },
  AgentTier: { axis: "tenant", cols: `id:t tenantId:t code:t name:t sortOrder:i active:b ${TS}` },
  AgentAccount: { axis: "tenant", cols: `id:t tenantId:t identityId:t? kind:t code:t status:t tierId:t? partyId:t crmCompanyId:t? accountContactId:t? unitIds:ta legalName:t payeeType:t taxIdEnc:t? taxIdLast4:t? branchCode:t? country:t treaty:b? vatRegistered:b bankAccountEnc:t? bankLast4:t? contact:j? licenceNo:t? licenceExpiry:d? logoFileId:t? inviteTokenHash:t? inviteExpiresAt:ts? approvedById:t? approvedAt:ts? suspendedAt:ts? statusReason:t? ${TS}` },
  AgentAccountMember: { axis: "tenant", cols: `id:t tenantId:t agentAccountId:t agentUserId:t role:t active:b addedByAgentUserId:t ${TS}` },
  AgentContract: { axis: "tenant", cols: `id:t tenantId:t agentAccountId:t version:i status:t validFrom:d validTo:d? fileId:t? signedAt:ts? signEvidence:j? termsSnapshot:j createdById:t? ${TS}` },
  AgentRateCard: { axis: "tenant", cols: `id:t tenantId:t ownerKind:t tierId:t? agentAccountId:t? name:t status:t validFrom:d? validTo:d? version:i priority:i label:j? conditions:j? ${TS}` },
  AgentRate: { axis: "tenant", cols: `id:t tenantId:t rateCardId:t productKind:t productId:t optionId:t? paxTypeId:t? cabinTypeId:t? mode:t valueBp:i? valueMinor:i? currency:t minSellMinor:i? markupCapBp:i? bookFrom:d? bookTo:d? travelFrom:d? travelTo:d? priority:i active:b ${TS}` },
  AgentRequest: { axis: "tenant", cols: `id:t tenantId:t agentAccountId:t requestedByAgentUserId:t? kind:t payload:j holdId:t? bookingId:t? productKind:t? productId:t? slotId:t? qty:i? status:t expiresAt:ts? approvalId:t? decidedById:t? decidedAt:ts? decisionNote:t? idempotencyKey:t? ${TS}` },
  AgentLink: { axis: "tenant", cols: `id:t tenantId:t agentAccountId:t code:t salesUserId:t? productKind:t? productId:t? showBrand:b discountBp:i? active:b ${TS}` },
  AgentApiKey: { axis: "tenant", cols: `id:t tenantId:t agentAccountId:t name:t keyHash:t last4:t scopes:ta createdByAgentUserId:t? lastUsedAt:ts? expiresAt:ts? revokedAt:ts? ${TS}` },
  AgentAllotmentBlock: { axis: "tenant", cols: `id:t tenantId:t agentAccountId:t productKind:t productId:t optionId:t? qtyPerSlot:i releaseDaysBefore:i? requestFirst:b? freeSale:b? holdHours:i? validFrom:d? validTo:d? active:b createdById:t? ${TS}` },
  AgentAllotment: { axis: "tenant", cols: `id:t tenantId:t agentAccountId:t productKind:t slotId:t unitId:t productId:t slotDate:d qty:i used:i held:i returnedToPublic:i releaseAt:ts? releasedAt:ts? releasedQty:i? blockId:t? ${TS}` },
  AgentStopSell: { axis: "tenant", cols: `id:t tenantId:t agentAccountId:t? productKind:t slotId:t? productId:t? channel:t? from:ts to:ts? reason:t createdById:t? liftedAt:ts? ${TS}` },
  AgentWebhook: { axis: "tenant", cols: `id:t tenantId:t agentAccountId:t url:t secretBox:t events:ta active:b failCount:i lastDeliveredAt:ts? disabledAt:ts? ${TS}` },
  AgentWebhookDelivery: { axis: "tenant", cols: `id:t tenantId:t webhookId:t eventId:t eventType:t status:t attempts:i nextAttemptAt:ts? lastError:t? responseCode:i? ${TS}` },
  AgentMediaAsset: { axis: "tenant", cols: `id:t tenantId:t productKind:t? productId:t? fileId:t title:j sortOrder:i active:b ${TS}` },
  AgentLedgerEntry: { axis: "tenant", cols: "id:t tenantId:t agentAccountId:t unitId:t? seq:i kind:t amountSatang:i currency:t bookingKind:t? bookingId:t? statementId:t? settlesStatementId:t? commissionId:t? entitledAt:ts? settledAt:ts? dueAt:ts? refEntryId:t? requestId:t? approvalId:t? accountDocId:t? slipId:t? runId:t? whtCertDocId:t? reason:t? idempotencyKey:t actorId:t createdAt:ts" },
  AgentBalance: { axis: "tenant", cols: `agentAccountId:t tenantId:t balanceSatang:bi lastSeq:i version:i ${TS}` },
  AgentStatement: { axis: "tenant", cols: `id:t tenantId:t agentAccountId:t code:t periodKey:t periodFrom:d periodTo:d status:t version:i openingSatang:bi salesSatang:bi passThroughSatang:bi commissionSatang:bi commissionVatSatang:bi whtSatang:bi cancelledSatang:bi adjustmentSatang:bi otherSatang:bi paidDuringPeriodSatang:bi totalSatang:bi paidSatang:bi whtCertSatang:bi? billingNoteDocId:t? whtCertDocId:t? receiveUnitId:t dueAt:ts issuedAt:ts? overdueAt:ts? voidedAt:ts? ${TS}` },
  AgentCommission: { axis: "tenant", cols: `id:t tenantId:t agentAccountId:t bookingKind:t bookingId:t bookingUnitId:t baseSatang:i rateBp:i? commissionSatang:i vatSatang:i whtMode:t whtRateBp:i whtSatang:i? clawbackSatang:i clawbackRunId:t? currency:t fxRateMicros:i? status:t earnedAt:ts? settledAt:ts? settleMode:t runId:t? whtCertDocId:t? ${TS}` },
  AgentCommissionRun: { axis: "tenant", cols: `id:t tenantId:t code:t cutoffAt:ts status:t totalCommissionSatang:bi totalVatSatang:bi totalWhtSatang:bi totalPaidSatang:bi paidAt:ts? idempotencyKey:t? createdById:t? ${TS}` },
  AgentCommissionPayout: { axis: "tenant", cols: `id:t tenantId:t runId:t agentAccountId:t unitId:t financeAccountId:t? commissionSatang:bi vatSatang:bi whtSatang:bi clawbackNettedSatang:bi paidSatang:bi whtMode:t whtRateBp:i accountDocId:t? whtCertDocId:t? status:t paidAt:ts? idempotencyKey:t ${TS}` },
  TripSupplier: { axis: "tenant", cols: `id:t tenantId:t code:t? name:t partyId:t accountContactId:t? payeeType:t peerLinkId:t? status:t defaultChannel:t? paymentTerms:j? ${TS}` },
  TripSupplierCost: { axis: "unit", cols: `id:t tenantId:t unitId:t supplierId:t productId:t optionId:t? paxTypeId:t? mode:t valueMinor:i? valueBp:i? currency:t travelFrom:d? travelTo:d? ${TS}` },
  TripSupplierRequest: { axis: "unit", cols: `id:t tenantId:t unitId:t bookingId:t supplierId:t channel:t status:t responseTokenHash:t sentAt:ts? respondBy:ts respondedAt:ts? confirmationRef:t? declineReason:t? attempts:i requestSnapshot:j idempotencyKey:t ${TS}` },
  TripSupplierPayable: { axis: "unit", cols: `id:t tenantId:t unitId:t supplierId:t bookingId:t amountSatang:i paidSatang:i dueAt:ts status:t accountDocId:t? paidAt:ts? idempotencyKey:t ${TS}` },
  TripPassengerLink: { axis: "unit", cols: "id:t tenantId:t unitId:t passengerId:t bookingId:t purpose:t tokenHash:t expiresAt:ts revokedAt:ts? issuedByKind:t issuedById:t? lastUsedAt:ts? createdAt:ts" },
};
const NEW_TABLES = Object.keys(TABLES);
const MOVED_OUT = ["TripSupplierPeerLink", "TripGroupQuoteRequest"]; // มติ R2 → L1.1 (ต้องไม่มีในฐาน/schema)
const ADDED_COLS: Record<string, string> = {
  TripPickupZone: "kind:t? nameEn:t? areas:j? windowMin:i? active:b? basis:t?",
  TripBooking: "agentRef:t? voucherOptions:j?",
  TripMoneyEvent: "reference:t? receivedAt:ts? refEventId:t?",
  SellBasket: "holdIdempotencyKey:t? holdRequestHash:t?",
};
type ColSpec = { name: string; t: ColT; nullable: boolean };
const parseCols = (s: string): ColSpec[] => s.split(/\s+/).filter(Boolean).map((tok) => {
  const [name, raw] = tok.split(":");
  const nullable = raw.endsWith("?");
  return { name, t: raw.replace("?", "") as ColT, nullable };
});
const DELEGATE = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const BIGINT_COLS = NEW_TABLES.flatMap((t) => parseCols(TABLES[t].cols).filter((c) => c.t === "bi").map((c) => `${t}.${c.name}`));

// ═══════════════ สเปก — CHECK ═══════════════
const SELL_CHANNELS = ["WEB", "LIFF", "EMBED", "COUNTER", "POS", "AGENT_PORTAL", "AGENT_LINK", "AGENT_API", "OTA", "API", "IMPORT", "CHAT_AI"];
const KINDS = ["TRIP", "TICKET", "HOTEL"];
const ROLES = ["OWNER", "ADMIN", "SALES", "ACCOUNTING"];
const PAYEE = ["TH_JURISTIC", "TH_FOUNDATION", "TH_PERSON", "FOREIGN"];
const LEDGER_POS = ["CHARGE", "CHARGE_PASS_THROUGH", "WHT_GROSSUP", "COMMISSION_PAID", "WHT_WITHHELD", "COMMISSION_CLAWBACK", "REFUND_TO_AGENT"];
const LEDGER_NEG = ["COMMISSION_NETTED", "COMMISSION_VAT", "PAYMENT", "WALLET_TOPUP", "COMMISSION_EARNED"];
const LEDGER_ANY = ["CANCELLATION", "ADJUSTMENT"];
const LEDGER_KINDS = ["CHARGE", "CHARGE_PASS_THROUGH", "COMMISSION_NETTED", "COMMISSION_VAT", "WHT_GROSSUP", "CANCELLATION", "PAYMENT", "WALLET_TOPUP", "COMMISSION_EARNED", "COMMISSION_PAID", "WHT_WITHHELD", "COMMISSION_CLAWBACK", "ADJUSTMENT", "REFUND_TO_AGENT"];
/** [กลุ่ม, ตาราง, คอลัมน์, ค่า] — ชื่อ CHECK = "<ตาราง>_<คอลัมน์>_check" (ใบสั่ง §3.1) */
const VALUE_SETS: [string, string, string, string[]][] = [
  ["identity", "AgentIdentity", "status", ["ACTIVE", "SUSPENDED", "CLOSED"]], ["identity", "AgentUser", "role", ROLES], ["identity", "AgentUser", "status", ["ACTIVE", "DISABLED", "ERASED"]],
  ["identity", "AgentLogin", "kind", ["EMAIL", "LINE"]], ["identity", "AgentTier", "code", ["A", "B", "C"]], ["identity", "AgentAccount", "kind", ["AGENT", "OTA", "PEER"]],
  ["identity", "AgentAccount", "status", ["INVITED", "PENDING", "ACTIVE", "SUSPENDED", "CLOSED"]], ["identity", "AgentAccount", "payeeType", PAYEE],
  ["identity", "AgentAccountMember", "role", ROLES], ["identity", "AgentContract", "status", ["DRAFT", "ACTIVE", "SUPERSEDED"]],
  ["pricing", "AgentRateCard", "ownerKind", ["TIER", "AGENT"]], ["pricing", "AgentRateCard", "status", ["DRAFT", "ACTIVE", "ARCHIVED"]],
  ["pricing", "AgentRate", "productKind", KINDS], ["pricing", "AgentRate", "mode", ["COMMISSION_PCT", "COMMISSION_FIXED", "NET", "MARKUP"]],
  ["pricing", "AgentRequest", "kind", ["BOOKING", "PRICE_OVERRIDE", "CREDIT_INCREASE", "ALLOTMENT"]], ["pricing", "AgentRequest", "status", ["PENDING", "APPROVED", "REJECTED", "EXPIRED", "CANCELLED"]],
  ["pricing", "AgentRequest", "productKind", KINDS], ["pricing", "AgentLink", "productKind", KINDS], ["pricing", "AgentAllotmentBlock", "productKind", KINDS], ["pricing", "AgentAllotment", "productKind", KINDS],
  ["pricing", "AgentStopSell", "productKind", KINDS], ["pricing", "AgentStopSell", "channel", SELL_CHANNELS], ["pricing", "AgentMediaAsset", "productKind", KINDS],
  ["pricing", "AgentWebhookDelivery", "status", ["PENDING", "OK", "FAILED", "DEAD"]],
  ["money", "AgentLedgerEntry", "kind", LEDGER_KINDS], ["money", "AgentLedgerEntry", "bookingKind", KINDS], ["money", "AgentStatement", "status", ["DRAFT", "ISSUED", "PARTIAL", "PAID", "VOID"]],
  ["money", "AgentCommission", "bookingKind", KINDS], ["money", "AgentCommission", "status", ["PENDING", "EARNED", "SETTLING", "SETTLED", "CLAWED_BACK", "VOID"]],
  ["money", "AgentCommission", "settleMode", ["PAYOUT", "NETTED"]], ["money", "AgentCommission", "whtMode", ["FLAT", "M50_1", "NONE"]],
  ["money", "AgentCommissionRun", "status", ["DRAFT", "SETTLING", "PAID", "VOID"]], ["money", "AgentCommissionPayout", "status", ["PENDING", "PAID", "FAILED", "VOID"]],
  ["money", "AgentCommissionPayout", "whtMode", ["FLAT", "M50_1", "NONE"]],
  ["supplier", "TripSupplier", "payeeType", PAYEE], ["supplier", "TripSupplier", "status", ["ACTIVE", "ARCHIVED"]], ["supplier", "TripSupplier", "defaultChannel", ["EMAIL", "LINE", "LINK", "PEER"]],
  ["supplier", "TripSupplierCost", "mode", ["NET", "PCT_OF_RETAIL"]],
  ["supplier", "TripSupplierRequest", "channel", ["EMAIL", "LINE", "LINK", "PEER"]], ["supplier", "TripSupplierRequest", "status", ["DRAFT", "SENT", "VIEWED", "CONFIRMED", "DECLINED", "EXPIRED", "CANCELLED"]],
  ["supplier", "TripSupplierPayable", "status", ["ACCRUED", "BILLED", "PAID", "VOID"]],
  ["supplier", "TripPassengerLink", "purpose", ["PAX_FORM"]], ["supplier", "TripPassengerLink", "issuedByKind", ["STAFF", "AGENT", "SYSTEM"]],
  ["supplier", "TripPickupZone", "kind", ["ZONE", "SELF"]], ["supplier", "TripPickupZone", "basis", ["PER_BOOKING"]],
];
/** CHECK ตัวเลข: [ตาราง, คอลัมน์, ค่าที่ผิด, แก้ช่องอื่นให้แถวผิดข้อเดียว?, ชื่อ constraint อื่นที่ยอมได้ (แถวผิดสองข้อโดยธรรมชาติ)?] — ชื่อ = "<ตาราง>_<คอลัมน์>_check" (ใบสั่ง §3.2) */
type NumCase = [string, string, unknown, Rec?, string[]?];
const NUM_CASES: NumCase[] = [
  ["AgentLoginCode", "attempts", -1], ["AgentTier", "sortOrder", -1], ["AgentContract", "version", 0], ["AgentRateCard", "version", 0], ["AgentRateCard", "priority", -1],
  ["AgentRate", "valueBp", -1], ["AgentRate", "valueBp", 10_001], ["AgentRate", "valueMinor", -1], ["AgentRate", "minSellMinor", -1], ["AgentRate", "markupCapBp", -1], ["AgentRate", "priority", -1],
  ["AgentRequest", "qty", 0], ["AgentLink", "discountBp", -1], ["AgentLink", "discountBp", 10_001],
  ["AgentAllotmentBlock", "qtyPerSlot", -1], ["AgentAllotmentBlock", "releaseDaysBefore", -1], ["AgentAllotmentBlock", "holdHours", 0],
  ["AgentAllotment", "qty", -1, {}, ["AgentAllotment_counters_check"]], ["AgentAllotment", "used", -1], ["AgentAllotment", "held", -1], ["AgentAllotment", "returnedToPublic", -1],
  ["AgentAllotment", "releasedQty", -1, { releasedAt: new Date() }],
  ["AgentLedgerEntry", "seq", 0], ["AgentBalance", "lastSeq", -1], ["AgentBalance", "version", -1],
  ["AgentStatement", "salesSatang", -1], ["AgentStatement", "passThroughSatang", -1], ["AgentStatement", "commissionSatang", -1], ["AgentStatement", "commissionVatSatang", -1],
  ["AgentStatement", "whtSatang", -1], ["AgentStatement", "paidDuringPeriodSatang", -1], ["AgentStatement", "paidSatang", -1], ["AgentStatement", "whtCertSatang", -1], ["AgentStatement", "version", -1],
  ["AgentCommission", "baseSatang", -1], ["AgentCommission", "rateBp", -1], ["AgentCommission", "rateBp", 10_001], ["AgentCommission", "commissionSatang", -1, { vatSatang: 1 }],
  ["AgentCommission", "vatSatang", -1], ["AgentCommission", "whtRateBp", 10_001], ["AgentCommission", "whtSatang", -1], ["AgentCommission", "fxRateMicros", 0],
  ["AgentCommission", "clawbackSatang", -1], ["AgentCommission", "clawbackSatang", 105_001],
  ["AgentCommissionRun", "totalCommissionSatang", -1], ["AgentCommissionRun", "totalVatSatang", -1], ["AgentCommissionRun", "totalWhtSatang", -1], ["AgentCommissionRun", "totalPaidSatang", -1],
  ["AgentCommissionPayout", "commissionSatang", -1], ["AgentCommissionPayout", "vatSatang", -1], ["AgentCommissionPayout", "whtSatang", -1], ["AgentCommissionPayout", "clawbackNettedSatang", -1],
  ["AgentCommissionPayout", "paidSatang", -1], ["AgentCommissionPayout", "whtRateBp", 10_001],
  ["AgentWebhook", "failCount", -1], ["AgentWebhookDelivery", "attempts", -1], ["AgentWebhookDelivery", "responseCode", 99], ["AgentWebhookDelivery", "responseCode", 600], ["AgentMediaAsset", "sortOrder", -1],
  ["TripSupplierCost", "valueMinor", -1], ["TripSupplierCost", "valueBp", 10_001, { mode: "PCT_OF_RETAIL", valueMinor: null }], ["TripSupplierRequest", "attempts", -1],
  ["TripSupplierPayable", "amountSatang", -1, {}, ["TripSupplierPayable_paid_check"]], ["TripSupplierPayable", "paidSatang", -1],
];
/** CHECK ข้ามคอลัมน์ (ชื่อตรงตัว · ใบสั่ง §3.3) — [ชื่อ, ตาราง, แก้ช่อง] · แถวผิดข้อเดียว */
const CROSS_CASES: [string, string, Rec][] = [
  ["AgentIdentity_publicCode_format_check", "AgentIdentity", { publicCode: "AG-0000I1" }], ["AgentIdentity_taxIdHash_format_check", "AgentIdentity", { taxIdHash: "a".repeat(64) }],
  ["AgentIdentity_displayName_len_check", "AgentIdentity", { displayName: "   " }], ["AgentUser_displayName_len_check", "AgentUser", { displayName: "" }],
  ["AgentLogin_email_norm_check", "AgentLogin", { subject: "QCA11-Upper@Shark.local" }], ["AgentLogin_email_norm_check", "AgentLogin", { providerId: "gmail" }],
  ["AgentSession_idle_check", "AgentSession", { idleExpiresAt: new Date(Date.now() + 2 * 86_400_000) }],
  ["AgentAccount_identity_check", "AgentAccount", { identityId: null }], ["AgentAccount_last4_check", "AgentAccount", { bankLast4: "12a4" }],
  ["AgentAccount_country_check", "AgentAccount", { country: "tha" }], ["AgentAccount_branchCode_check", "AgentAccount", { branchCode: "123" }],
  ["AgentContract_dates_check", "AgentContract", { validFrom: "2027-03-01", validTo: "2027-02-01" }], ["AgentRateCard_dates_check", "AgentRateCard", { validFrom: "2027-03-01", validTo: "2027-02-01" }],
  ["AgentAllotmentBlock_dates_check", "AgentAllotmentBlock", { validFrom: "2027-03-01", validTo: "2027-02-01" }], ["TripSupplierCost_dates_check", "TripSupplierCost", { travelFrom: "2027-03-01", travelTo: "2027-02-01" }],
  ["AgentRate_dates_check", "AgentRate", { travelFrom: "2027-03-10", travelTo: "2027-03-01" }], ["AgentRate_dates_check", "AgentRate", { bookFrom: "2027-03-10", bookTo: "2027-03-01" }],
  ["AgentRateCard_owner_check", "AgentRateCard", { agentAccountId: "a-both" }], ["AgentRateCard_owner_check", "AgentRateCard", { tierId: null }],
  ["AgentRate_value_check", "AgentRate", { valueBp: null }], ["AgentRate_value_check", "AgentRate", { mode: "NET", valueBp: null }], ["AgentRate_currency_check", "AgentRate", { currency: "thb" }],
  ["AgentRate_fixed_currency_check", "AgentRate", { mode: "COMMISSION_FIXED", valueBp: null, valueMinor: 5_000, currency: "USD" }],
  ["AgentRequest_hold_check", "AgentRequest", { holdId: null, expiresAt: new Date(Date.now() + 3_600_000) }], ["AgentRequest_hold_check", "AgentRequest", { kind: "ALLOTMENT" }],
  ["AgentRequest_expiry_check", "AgentRequest", { kind: "ALLOTMENT", holdId: null, expiresAt: null }],
  ["AgentLink_product_check", "AgentLink", { productKind: "TRIP" }], ["AgentLink_code_check", "AgentLink", { code: "a b" }], ["AgentMediaAsset_product_check", "AgentMediaAsset", { productId: "p1" }],
  ["AgentApiKey_last4_check", "AgentApiKey", { last4: "abc" }], ["AgentWebhook_url_check", "AgentWebhook", { url: "http://x.test" }],
  ["AgentStopSell_window_check", "AgentStopSell", { from: new Date("2027-01-02"), to: new Date("2027-01-01") }],
  ["AgentAllotment_counters_check", "AgentAllotment", { used: 6, held: 3, returnedToPublic: 2 }], ["AgentAllotment_released_check", "AgentAllotment", { releasedAt: new Date() }],
  ["AgentLedgerEntry_currency_check", "AgentLedgerEntry", { currency: "USD" }], ["AgentLedgerEntry_sign_check", "AgentLedgerEntry", { amountSatang: -100 }],
  ["AgentLedgerEntry_sign_check", "AgentLedgerEntry", { kind: "CANCELLATION", amountSatang: 0 }],
  ["AgentLedgerEntry_booking_check", "AgentLedgerEntry", { kind: "CANCELLATION", amountSatang: -100, bookingId: null }], ["AgentLedgerEntry_unit_check", "AgentLedgerEntry", { unitId: null }],
  ["AgentLedgerEntry_refs_check", "AgentLedgerEntry", { bookingKind: null, bookingId: null }], ["AgentLedgerEntry_refs_check", "AgentLedgerEntry", { kind: "ADJUSTMENT", amountSatang: -5, reason: "x" }],
  ["AgentLedgerEntry_settles_check", "AgentLedgerEntry", { settlesStatementId: "st-x" }],
  ["AgentStatement_total_check", "AgentStatement", { totalSatang: 8_612_116 }], ["AgentStatement_period_check", "AgentStatement", { periodTo: "2026-10-31" }],
  ["AgentCommission_wht_check", "AgentCommission", { whtSatang: null }], ["AgentCommission_currency_check", "AgentCommission", { currency: "USD" }],
  ["TripSupplierCost_value_check", "TripSupplierCost", { valueMinor: null }], ["TripSupplierCost_value_check", "TripSupplierCost", { mode: "PCT_OF_RETAIL", valueMinor: null }],
  ["TripSupplierPayable_paid_check", "TripSupplierPayable", { paidSatang: 250_001 }],
  ["SellBasket_holdKey_pair_check", "SellBasket", { holdRequestHash: null }], ["SellBasket_holdKey_pair_check", "SellBasket", { holdIdempotencyKey: null }],
];
/** CHECK บนตารางเดิมที่ทดสอบด้วย UPDATE แถว seed (tx rollback) */
const CROSS_SQL: [string, string, string][] = [
  ["TripPickupZone_v2_check", "TripPickupZone", `"kind" = 'ZONE'`], ["TripPickupZone_windowMin_check", "TripPickupZone", `"windowMin" = 721`],
  ["TripPickupZone_windowMin_check", "TripPickupZone", `"windowMin" = -1`], ["TripBooking_agentRef_check", "TripBooking", `"agentRef" = ''`],
];
const NND = { AgentRate_dims_key: ["rateCardId", "productKind", "productId", "optionId", "paxTypeId", "cabinTypeId", "bookFrom", "travelFrom"], TripSupplierCost_dims_key: ["supplierId", "productId", "optionId", "paxTypeId", "travelFrom"] } as const;
const DRIFT_OK = ["TripDeparture_productId_optionId_startsAt_key", "TripPrice_dims_key", "TripLinkStat_unitId_day_channel_linkId_key", "AgentRate_dims_key", "TripSupplierCost_dims_key"];
const HAND_SQL_NAMES = ["AgentRate_dims_key", "TripSupplierCost_dims_key", "SellBasket_tenantId_holdIdempotencyKey_key", "AgentStatement_agentAccountId_periodKey_key", "AgentRequest_expiresAt_pending_idx", "AgentAllotment_releaseAt_open_idx", "AgentWebhookDelivery_nextAttemptAt_open_idx", "AgentLedgerEntry_append_only"];
/** บรรทัดใบแจ้งยอด: บวก/ลบ ในสูตร (ใบสั่ง §2.3) */
const ST_PLUS = ["openingSatang", "salesSatang", "passThroughSatang", "whtSatang", "cancelledSatang", "adjustmentSatang", "otherSatang"];
const ST_MINUS = ["commissionSatang", "commissionVatSatang", "paidDuringPeriodSatang"];
const stTotal = (r: Rec) => ST_PLUS.reduce((a, k) => a + Number(r[k] ?? 0), 0) - ST_MINUS.reduce((a, k) => a + Number(r[k] ?? 0), 0);

// ═══════════════ สเปก — ค่าตั้ง agency ═══════════════
const U = "UNIT", P = "PRODUCT", AT = "AGENT_TIER", A = "AGENT";
type Exp = { code: string; key: string; type: string; chain: string[]; nullable?: boolean };
const E = (code: string, key: string, type: string, chain: string[], nullable = false): Exp => ({ code, key, type, chain, nullable });
const EXPECT: Exp[] = [
  E("A1", "agency.tier.table", "table", [U]), E("A2", "agency.tier.newAgentTier", "enum", [U]), E("A3", "agency.tier.autoPromote", "bool", [U]),
  E("A4", "agency.price.defaultModel", "enum", [U, AT, A]), E("A5", "agency.price.sellerOfRecord", "enum", [U, A, P]), E("A6", "agency.price.actualSalePriceField", "enum", [U, A]),
  E("A7", "agency.price.minResalePrice", "money", [A, P], true), E("A8", "agency.price.hidePriceOnVoucher", "bool", [A]), E("A9", "agency.cancel.policySource", "enum", [AT, A]),
  E("A10", "agency.money.collector", "enum", [U, AT, A]), E("A11", "agency.money.paymentMethod", "enum", [U, AT, A]), E("A12", "agency.money.creditTermDays", "enum", [AT, A]),
  E("A13", "agency.money.creditLimit", "money", [A]), E("A14", "agency.money.overLimitAction", "enum", [AT, A]), E("A15", "agency.money.statementCycle", "enum", [U, A]),
  E("A16", "agency.hold.duration", "table", [U, AT, A, P]), E("A17", "agency.hold.maxConcurrent", "table", [U, AT, A]), E("A18", "agency.quota.releaseDaysBefore", "days", [U, A, P]),
  E("A19", "agency.quota.requestResponseHours", "int", [U, A, P]), E("A20", "agency.quota.freeSale", "bool", [A, P]), E("A21", "agency.comm.earnedAt", "enum", [U, A]),
  E("A22", "agency.comm.currency", "enum", [U, A]), E("A23", "agency.comm.clawbackOnCancel", "bool", [U, A]), E("A24", "agency.comm.discountFromCommission", "table", [U, AT, A]),
  E("A25", "agency.wht.payerType", "enum", [U], true), E("A26", "agency.wht.ruleByPayee", "table", [U, A]), E("A27", "agency.wht.minPerContract", "table", [U, A]),
  E("A28", "agency.wht.eWht", "table", [U]), E("A29", "agency.wht.grossUpOnNetRemit", "bool", [U, A]), E("A30", "agency.wht.remitter", "enum", [U, A]),
  E("A31", "agency.crm.addToShopMarketing", "bool", [U, A]), E("A32", "agency.crm.whoMessagesCustomer", "enum", [AT, A]), E("A33", "agency.crm.customerContactRoute", "enum", [A]),
  E("A34", "agency.privacy.seeHealthForms", "bool", [U, A]), E("A35", "agency.privacy.customerSelfFillLink", "bool", [U, A]), E("A36", "agency.signup.requireApproval", "bool", [U]),
  E("A37", "agency.license.fields", "table", [U]),
  E("X24", "agency.quota.requestFirst", "bool", [U, AT, A, P]), E("X25", "agency.quota.returnCancelledToQuota", "bool", [U, AT, A]), E("X26", "agency.comm.vatMode", "enum", [U, AT, A]),
];
const KEY = (code: string) => EXPECT.find((e) => e.code === code)?.key ?? "";
const TPLS = ["DIVE_SHOP", "DAY_TOUR", "LIVEABOARD", "ATTRACTION"] as const;
const W = (mode: string, rateBp: number, form: string, cert: string) => ({ mode, rateBp, form, cert });
const NONE4 = W("NONE", 0, "NONE", "NONE");
const RULE_BY_PAYEE = {
  JURISTIC: { TH_JURISTIC: W("FLAT", 300, "PND53", "PER_PAYMENT"), TH_FOUNDATION: W("FLAT", 1000, "PND53", "PER_PAYMENT"), TH_PERSON: W("M50_1", 0, "PND1", "ANNUAL"), FOREIGN: NONE4 },
  INDIVIDUAL: { TH_JURISTIC: NONE4, TH_FOUNDATION: NONE4, TH_PERSON: W("M50_1", 0, "PND1", "ANNUAL"), FOREIGN: NONE4 },
};
const TIER_TABLE = {
  A: { tourPct: 20, laPct: 18, ticketNetDiscountPct: 25, payDefault: "CREDIT", promoteAt: 300_000_000 },
  B: { tourPct: 15, laPct: 15, ticketNetDiscountPct: 20, payDefault: "PAY_NOW", promoteAt: 100_000_000 },
  C: { tourPct: 10, laPct: 10, ticketNetDiscountPct: 15, payDefault: "PAY_NOW", promoteAt: null },
};
const all = (v: unknown): unknown[] => [v, v, v];
/** ค่าเริ่ม [DS, DT, LA] (+AT ถ้าต่างจาก DT) — ใบสั่ง §4.1 §4.2 */
const DEF: Record<string, { v: unknown[]; at?: unknown }> = {
  [KEY("A1")]: { v: all(TIER_TABLE) }, [KEY("A2")]: { v: all("C") }, [KEY("A3")]: { v: all(false) }, [KEY("A4")]: { v: all("COMMISSION") },
  [KEY("A5")]: { v: all("SHOP_PRINCIPAL") }, [KEY("A6")]: { v: all("OPTIONAL_WARN") }, [KEY("A7")]: { v: all(null) }, [KEY("A8")]: { v: all(false) },
  [KEY("A9")]: { v: all("PRODUCT_POLICY") }, [KEY("A10")]: { v: all("AGENT_COLLECTS") }, [KEY("A11")]: { v: all("PAY_NOW") }, [KEY("A12")]: { v: all("15") },
  [KEY("A13")]: { v: all(0) }, [KEY("A14")]: { v: all("BLOCK_NEW") }, [KEY("A15")]: { v: all("SEMI_MONTHLY_1_16") },
  [KEY("A16")]: { v: all({ tourHours: 24, liveaboardDays: 7, ticketMinutes: null }) }, [KEY("A17")]: { v: all({ tourSeats: 20, liveaboardCabins: 2 }) },
  [KEY("A18")]: { v: [2, 2, 60], at: 2 }, [KEY("A19")]: { v: all(2) }, [KEY("A20")]: { v: all(true) }, [KEY("A21")]: { v: all("AFTER_TRAVEL") },
  [KEY("A22")]: { v: all("THB_AT_BOOKING_RATE") }, [KEY("A23")]: { v: all(true) }, [KEY("A24")]: { v: all({ enabled: false, capPct: 5 }) },
  [KEY("A25")]: { v: all(null) }, [KEY("A26")]: { v: all(RULE_BY_PAYEE) },
  [KEY("A27")]: { v: all({ amountSatang: 100_000, appliesTo: { TH_JURISTIC: true, TH_FOUNDATION: false }, continuousContract: "EVERY_PAYMENT" }) },
  [KEY("A28")]: { v: all({ enabled: false, rateBp: 100, untilPaidOn: "2027-12-31" }) }, [KEY("A29")]: { v: all(true) }, [KEY("A30")]: { v: all("SHOP") },
  [KEY("A31")]: { v: all(false) }, [KEY("A32")]: { v: all("SHOP_OPS_ONLY") }, [KEY("A33")]: { v: all("VIA_AGENT") }, [KEY("A34")]: { v: all(false) },
  [KEY("A35")]: { v: all(true) }, [KEY("A36")]: { v: all(true) }, [KEY("A37")]: { v: all({ visible: true, expiryReminder: false }) },
  [KEY("X24")]: { v: all(false) }, [KEY("X25")]: { v: all(true) }, [KEY("X26")]: { v: all("NONE") },
};
/** ตัวเลือก enum ตาม schema (A5 A22 = เฉพาะค่าที่เปิดในรุ่นแรก · A12 = ข้อความ) */
const ENUM_OPTS: Record<string, string[]> = {
  A2: ["A", "B", "C"], A4: ["COMMISSION", "NET", "MARKUP"], A5: ["SHOP_PRINCIPAL"], A6: ["OPTIONAL_WARN", "HIDDEN"], A9: ["PRODUCT_POLICY", "CONTRACT"],
  A10: ["AGENT_COLLECTS", "SHOP_COLLECTS"], A11: ["PAY_NOW", "WALLET", "CREDIT"], A12: ["7", "15", "30"], A14: ["BLOCK_NEW", "WARN_ONLY"], A15: ["WEEKLY", "SEMI_MONTHLY_1_16", "MONTHLY"],
  A21: ["AFTER_TRAVEL", "ON_CONFIRM"], A22: ["THB_AT_BOOKING_RATE"], A25: ["JURISTIC", "INDIVIDUAL"], A30: ["SHOP", "AGENT_ON_BEHALF", "NONE"],
  A32: ["SHOP_FULL", "SHOP_OPS_ONLY", "AGENT_ONLY"], A33: ["VIA_AGENT", "DIRECT"], X26: ["NONE", "EXCLUSIVE", "INCLUSIVE"],
};
const SNAP_AGENCY = ["A1", "A4", "A5", "A7", "A8", "A9", "A10", "A11", "A12", "A21", "A22", "A23", "A24", "X26", "A25", "A26", "A27", "A28", "A29", "A30", "A31", "A32", "A33", "X25"].map(KEY);
const HIDDEN = [KEY("A3")];
const EFFECTIVE = ["A26", "A27", "A28"].map(KEY);
const ACCOUNTANT = ["A5", "A6", "A26", "A27", "A28", "A29", "A30", "X26"].map(KEY);
const LEGAL_MAP: Record<string, string[]> = { [KEY("A5")]: ["W13"], [KEY("A26")]: ["W07", "W09"], [KEY("A27")]: ["W43"], [KEY("A29")]: ["W44"], [KEY("A30")]: ["W44"], [KEY("A34")]: ["W34"] };
const GROUP_SENS: Record<string, string> = { price: "MONEY", money: "MONEY", hold: "MONEY", quota: "MONEY", comm: "MONEY", wht: "LEGAL", privacy: "PRIVACY" };
const GROUPS = ["tier", "price", "cancel", "money", "hold", "quota", "comm", "wht", "crm", "privacy", "signup", "license"];
const sensOf = (key: string) => (key === KEY("A1") ? "MONEY" : GROUP_SENS[key.split(".")[1]]);

// ═══════════════ pg ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null; udt_name: string };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default, udt_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [table]));
  return colCache.get(table) ?? [];
};
const needTable = async (t: string) => { if ((await cols(t)).length === 0) throw new AssertFail(`ยังไม่มีตาราง ${t} (migration agency ยังไม่ลง)`); };
const conDef = async (table: string, name: string): Promise<string | null> => (await q<{ def: string }>(
  `SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = current_schema() AND t.relname = $1 AND c.conname = $2`, [table, name]))[0]?.def ?? null;
const literalsOf = (def: string) => [...def.matchAll(/'((?:[^']|'')*)'::/g)].map((m) => m[1]);
type IxRow = { name: string; uniq: boolean; cols: string[]; pred: string | null; def: string; nnd: boolean };
const ixOf = (table: string) => q<IxRow>(
  `SELECT i.relname AS name, ix.indisunique AS uniq, ix.indnullsnotdistinct AS nnd, pg_get_indexdef(ix.indexrelid) AS def,
          ARRAY(SELECT a.attname::text FROM unnest(ix.indkey) WITH ORDINALITY k(n, o) JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.n ORDER BY k.o) AS cols,
          pg_get_expr(ix.indpred, ix.indrelid) AS pred
     FROM pg_index ix JOIN pg_class i ON i.oid = ix.indexrelid JOIN pg_class t ON t.oid = ix.indrelid JOIN pg_namespace ns ON ns.oid = t.relnamespace
    WHERE t.relname = $1 AND ns.nspname = current_schema()`, [table]);
const hasUniq = async (table: string, c: string[], partial = false) => (await ixOf(table)).some((r) => r.uniq && isDeepStrictEqual(r.cols, c) && (partial ? r.pred !== null : r.pred === null));
const hasIdx = async (table: string, c: string[]) => (await ixOf(table)).some((r) => isDeepStrictEqual(r.cols, c));
/** INSERT — คอลัมน์ NOT NULL ไม่มี default ที่ไม่ได้ส่ง เติมให้ (ตารางแพลตฟอร์ม Tenant/User/… · แถวของตารางใหม่ส่งเต็มเสมอ) */
async function ins(table: string, vals: Rec, client: pg.Pool | pg.PoolClient = pool): Promise<void> {
  await needTable(table);
  const v: Rec = { ...vals };
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    if (c.column_name === "id") { v.id = rid("id"); continue; }
    if (t === "text" || t.startsWith("character")) { const d = await conDef(table, `${table}_${c.column_name}_check`); v[c.column_name] = (d && literalsOf(d)[0]) || `qc${hex(3)}`; continue; }
    v[c.column_name] = ["integer", "bigint", "numeric", "double precision", "smallint"].includes(t) ? 0 : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}"
      : t.startsWith("timestamp") ? new Date() : t === "date" ? "2027-03-01" : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await client.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => { const x = v[k]; return x !== null && typeof x === "object" && !(x instanceof Date) && !Array.isArray(x) ? JSON.stringify(x) : x; }));
}
/** รันใน tx แล้ว ROLLBACK (หรือ COMMIT) */
async function inTx<T>(f: (c: pg.PoolClient) => Promise<T>, commit = false): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await f(c);
    await c.query(commit ? "COMMIT" : "ROLLBACK");
    return r;
  } catch (e) { try { await c.query("ROLLBACK"); } catch { /* ignore */ } throw e; } finally { c.release(); }
}
/** ลำดับคำสั่งใน tx เดียว (savepoint ต่อคำสั่ง) → รหัสผลแต่ละคำสั่ง ("" = ผ่าน) · ROLLBACK ทั้งหมด */
async function codes(steps: (string | [string, Rec])[], commit = false): Promise<string[]> {
  return inTx(async (c) => {
    const out: string[] = [];
    for (const s of steps) {
      await c.query("SAVEPOINT s");
      try { if (typeof s === "string") await c.query(s); else await ins(s[0], s[1], c); out.push(""); await c.query("RELEASE SAVEPOINT s"); }
      catch (e) { if (e instanceof AssertFail) throw e; out.push(pgCode(e) || errMsg(e)); await c.query("ROLLBACK TO SAVEPOINT s"); }
    }
    return out;
  }, commit);
}
/** เหมือน codes แต่คืน "<code>:<constraint>" (ตรวจว่า CHECK ตัวไหนปฏิเสธ) */
async function codesC(steps: (string | [string, Rec])[]): Promise<string[]> {
  return inTx(async (c) => {
    const out: string[] = [];
    for (const s of steps) {
      await c.query("SAVEPOINT s");
      try { if (typeof s === "string") await c.query(s); else await ins(s[0], s[1], c); out.push(""); await c.query("RELEASE SAVEPOINT s"); }
      catch (e) { if (e instanceof AssertFail) throw e; const r = asRec(e); out.push(`${pgCode(e) || errMsg(e)}:${String(r?.constraint ?? "")}`); await c.query("ROLLBACK TO SAVEPOINT s"); }
    }
    return out;
  });
}

// ═══════════════ ร้านชั่วคราว + กวาด ═══════════════
let tenantTables: string[] | null = null;
async function tablesWithTenant(): Promise<string[]> {
  if (tenantTables) return tenantTables;
  const rows = await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  tenantTables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  return tenantTables;
}
async function purgeLedger(tids: string[]) {
  if (!tids.length || (await cols("AgentLedgerEntry")).length === 0) return;
  try { await inTx(async (c) => { await c.query(`SET LOCAL shark.ledger_purge = 'on'`); await c.query(`DELETE FROM "AgentLedgerEntry" WHERE "tenantId" = ANY($1::text[])`, [tids]); }, true); }
  catch (e) { console.log(`  ⚠️ ลบสมุดทดสอบ: ${errMsg(e)}`); }
}
async function cleanupTenants(tids: string[]) {
  if (!tids.length) return;
  await purgeLedger(tids);
  let pending = [...(await tablesWithTenant())];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
async function cleanupGlobal() {
  const has = async (t: string) => (await cols(t)).length > 0;
  try {
    if (await has("AgentUser")) {
      const us = (await q<{ id: string }>(`SELECT u.id FROM "AgentUser" u LEFT JOIN "AgentIdentity" i ON i.id = u."identityId" WHERE u."displayName" LIKE $1 OR i."displayName" LIKE $1`, [`${QC_MARK}%`])).map((r) => r.id);
      if (us.length) {
        for (const t of ["AgentLogin", "AgentSession"]) if (await has(t)) await pool.query(`DELETE FROM "${t}" WHERE "agentUserId" = ANY($1::text[])`, [us]);
        await pool.query(`DELETE FROM "AgentUser" WHERE id = ANY($1::text[])`, [us]);
      }
    }
    if (await has("AgentLogin")) await pool.query(`DELETE FROM "AgentLogin" WHERE subject LIKE 'qca11-%'`);
    if (await has("AgentLoginCode")) await pool.query(`DELETE FROM "AgentLoginCode" WHERE target LIKE 'qca11-%'`);
    if (await has("AgentIdentity")) await pool.query(`DELETE FROM "AgentIdentity" WHERE "displayName" LIKE $1`, [`${QC_MARK}%`]);
  } catch (e) { console.log(`  ⚠️ cleanup global: ${errMsg(e)}`); }
}
async function cleanupUsers() {
  try {
    const us = (await q<{ id: string }>(`SELECT id FROM "User" WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])).map((r) => r.id);
    if (!us.length) return;
    for (const t of ["Membership", "Session"]) { try { await pool.query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [us]); } catch { /* ไม่มีคอลัมน์ */ } }
    await pool.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [us]);
  } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}
const tenantIds: string[] = [];
type Actor = { role: "OWNER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };

// ═══════════════ main ═══════════════
let exitCode = 1;
try {
  try {
    const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
    if (stale.length) { console.log(`  🧹 กวาดร้านค้าง ${stale.length}`); await cleanupTenants(stale); }
    await cleanupUsers(); await cleanupGlobal();
  } catch (e) { console.log(`  ⚠️ กวาดค้าง: ${errMsg(e)}`); }

  // ── โมดูล ──
  const SETI = await tryImport("@/lib/core/settings");
  const SET = SETI.mod;
  const TOUR = (await tryImport("@/lib/core/settings/legal/th-tour-2569")).mod;
  const SCOPE = (await tryImport("@/lib/core/scope")).mod;
  const PERM = (await tryImport("@/lib/core/permissions")).mod;
  const DB = (await tryImport("@/lib/core/db")).mod;
  const CLIENT = (await tryImport("@prisma/client")).mod;
  const AGI = await tryImport("@/lib/modules/agency");
  const AG = AGI.mod;
  const COREI = await tryImport("@/lib/modules/agency/identity-core");
  const FX = (await tryImport("./trips-fixture.mts")).mod;
  const INVI = await tryImport("./trips-agency-invariants.mts");
  const INV = INVI.mod;
  const needSet = (): Rec => { if (!SET) throw new AssertFail(`โหลด @/lib/core/settings ไม่ได้: ${SETI.err}`); return SET; };
  const getDef = (key: string): Rec | null => { try { return asRec(fnOf(needSet(), "getDef", "settings")(key)); } catch { return null; } };
  const needDef = (key: string): Rec => { const d = getDef(key); if (!d) throw new AssertFail(`ยังไม่มีคีย์ ${key}`); return d; };
  const needAg = (): Rec => { if (!AG) throw new AssertFail(`ยังไม่มี @/lib/modules/agency (${AGI.err.slice(0, 80)})`); return AG; };
  const agFn = <T,>(name: string) => fnOf(needAg(), name, "agency facade") as (...a: unknown[]) => Promise<T>;
  const parse = (key: string, v: unknown): boolean => { const sch = asRec(needDef(key).schema); const sp = sch?.safeParse; return typeof sp === "function" && asRec((sp as AnyFn).call(sch, v))?.success === true; };

  // ═══════════════ PC ═══════════════
  console.log("\n── PC: ตัวควบคุม (ต้องเขียวตั้งแต่ก่อนมีงาน) ──");
  await st("PC-1", `ฐาน QC ต่อได้ + migration ฐาน ${BASE_LAST_MIG} ลงแล้ว`, async () => {
    const r = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`, [BASE_LAST_MIG]);
    eq(r[0]?.n, 1, "migration ฐาน");
  });
  await st("PC-2", "ทะเบียนค่าตั้งเดิมโหลดได้ (trips.sell.holdMinutes · T0.1) + evaluateTourRule มี", () => {
    ok(getDef("trips.sell.holdMinutes"), `ไม่มี trips.sell.holdMinutes (${SETI.err.slice(0, 60)})`);
    ok(typeof TOUR?.evaluateTourRule === "function", "ไม่มี evaluateTourRule");
  });
  await st("PC-3", "ตัวอ่าน CHECK ตามชื่อ + literal อ่านของเดิมได้ (TripHold_status_check)", async () => {
    const d = await conDef("TripHold", "TripHold_status_check");
    ok(d && isDeepStrictEqual(literalsOf(d).sort(), ["ACTIVE", "CONVERTED", "EXPIRED", "RELEASED"]), `อ่านไม่ได้: ${fmt(d)}`);
  });
  await st("PC-4", "ตัวทดสอบ 23514/23505 ทำงาน (positive control บนตารางเดิม · tx rollback)", async () => {
    const t = rid("pc"), u = rid("pcu");
    const r = await codes([
      ["TripHold", { tenantId: t, unitId: u, departureId: "d", channel: "WEB", unitIds: [], purpose: "PAYMENT", capKeyHash: "x", requestHash: "x", idempotencyKey: "k", status: "NOPE", expiresAt: new Date() }],
      ["SellCounter", { tenantId: t, series: "TR", period: "6911", seq: 1 }], ["SellCounter", { tenantId: t, series: "TR", period: "6911", seq: 2 }],
    ]);
    eq(r, ["23514", "", "23505"], "รหัส");
  });

  // ═══════════════ ร้านชั่วคราว ═══════════════
  const now = () => new Date();
  const tA = rid("tA"), tB = rid("tB"), tP = rid("tP");
  const uA = rid("uA"), uA2 = rid("uA2"), uB = rid("uB"), uP = rid("uP");
  let setupErr = "";
  let OWNER_A: Actor | null = null, OWNER_B: Actor | null = null;
  try {
    for (const [id, tag] of [[tA, "a"], [tB, "b"], [tP, "p"]] as const) { await ins("Tenant", { id, name: `ทดสอบ A1.1 ${tag}`, slug: `${SLUG}${STAMP}-${tag}` }); tenantIds.push(id); }
    for (const [id, t, tag] of [[uA, tA, "a"], [uA2, tA, "a2"], [uB, tB, "b"], [uP, tP, "p"]] as const) await ins("BusinessUnit", { id, tenantId: t, type: "TRIPS", name: `หน่วยทริป ${tag}`, slug: `${SLUG}${tag}-${STAMP}` });
    const mkUser = async (tag: string, tenantId: string): Promise<Actor> => {
      const id = rid(`u${tag}`);
      await ins("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}` });
      await ins("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: JSON.stringify({}), acceptedAt: now() });
      return { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: id };
    };
    OWNER_A = await mkUser("oa", tA); OWNER_B = await mkUser("ob", tB);
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const needOwnerA = (): Actor => { if (!OWNER_A) throw new AssertFail(`ไม่มีร้านชั่วคราว (${setupErr})`); return OWNER_A; };
  const ctxA = { tenantId: tA }, ctxB = { tenantId: tB };

  /** แถวใบแจ้งยอดภาพ 13ง (บรรทัดยกเลิกมีเครื่องหมาย) · ยอดรวมคิดจากสูตร §2.3 */
  const D0 = "2027-03-01";
  const stRowOf = (o: Rec = {}, tenantId = tA, unitId = uA): Rec => {
    const r: Rec = { tenantId, agentAccountId: rid("a"), code: `ST-${hex(5)}`, periodKey: `P${hex(4)}`, periodFrom: "2026-11-01", periodTo: "2026-11-15", status: "ISSUED",
      openingSatang: 0, salesSatang: 10_170_000, passThroughSatang: 1_140_000, commissionSatang: 1_525_500, commissionVatSatang: 0, whtSatang: 45_765, cancelledSatang: -718_150,
      adjustmentSatang: 0, otherSatang: 0, paidDuringPeriodSatang: 500_000, receiveUnitId: unitId, dueAt: now(), ...o };
    if (!("totalSatang" in o)) r.totalSatang = stTotal(r);
    return r;
  };
  /** แถวถูกต้องเต็มของทุกตารางใหม่ + SellBasket (ใช้ทั้ง C · U · X1) */
  const valid = (t: string, tenantId: string, unitId: string): Rec => {
    const k = hex(6);
    switch (t) {
      case "AgentIdentity": return { displayName: `${QC_MARK} id ${k}`, publicCode: randCode(), status: "ACTIVE" };
      case "AgentUser": return { identityId: rid("i"), displayName: `${QC_MARK} u ${k}`, role: "OWNER", status: "ACTIVE" };
      case "AgentLogin": return { agentUserId: rid("u"), kind: "EMAIL", providerId: "email", subject: `qca11-${k}@shark.local`, verifiedAt: now() };
      case "AgentSession": return { agentUserId: rid("u"), tokenHash: hex(32), expiresAt: new Date(Date.now() + 86_400_000), idleExpiresAt: new Date(Date.now() + 3_600_000) };
      case "AgentLoginCode": return { target: `qca11-${k}`, codeHash: hex(32), expiresAt: new Date(Date.now() + 600_000) };
      case "AgentTier": return { tenantId, code: "C", name: "ระดับ C" };
      case "AgentAccount": return { tenantId, identityId: rid("i"), code: `C${k}`, status: "ACTIVE", partyId: rid("p"), unitIds: [unitId], legalName: "บจก. ทดสอบ", payeeType: "TH_JURISTIC" };
      case "AgentAccountMember": return { tenantId, agentAccountId: rid("a"), agentUserId: rid("u"), role: "OWNER", addedByAgentUserId: rid("u") };
      case "AgentContract": return { tenantId, agentAccountId: rid("a"), version: 1, validFrom: D0, termsSnapshot: {} };
      case "AgentRateCard": return { tenantId, ownerKind: "TIER", tierId: rid("t"), name: "บัตรราคา", status: "ACTIVE" };
      case "AgentRate": return { tenantId, rateCardId: rid("rc"), productKind: "TRIP", productId: rid("p"), mode: "COMMISSION_PCT", valueBp: 1500 };
      case "AgentRequest": return { tenantId, agentAccountId: rid("a"), kind: "BOOKING", payload: {}, holdId: rid("h"), bookingId: rid("b"), productKind: "TRIP", productId: rid("p"), slotId: rid("d"), qty: 2 };
      case "AgentLink": return { tenantId, agentAccountId: rid("a"), code: `L${k}` };
      case "AgentApiKey": return { tenantId, agentAccountId: rid("a"), name: "คีย์", keyHash: hex(32), last4: "ab12", scopes: ["read"] };
      case "AgentAllotmentBlock": return { tenantId, agentAccountId: rid("a"), productKind: "TRIP", productId: rid("p"), qtyPerSlot: 10 };
      case "AgentAllotment": return { tenantId, agentAccountId: rid("a"), productKind: "TRIP", slotId: rid("d"), unitId, productId: rid("p"), slotDate: D0, qty: 10 };
      case "AgentStopSell": return { tenantId, productKind: "TRIP", from: now(), reason: "ทดสอบ" };
      case "AgentWebhook": return { tenantId, agentAccountId: rid("a"), url: "https://example.test/h", secretBox: "box", events: ["trips.booking.confirmed"] };
      case "AgentWebhookDelivery": return { tenantId, webhookId: rid("wh"), eventId: rid("ev"), eventType: "trips.booking.confirmed" };
      case "AgentMediaAsset": return { tenantId, fileId: rid("f"), title: { th: "สื่อ" } };
      case "AgentLedgerEntry": return { tenantId, agentAccountId: rid("a"), unitId, seq: 1, kind: "CHARGE", amountSatang: 700_000, bookingKind: "TRIP", bookingId: rid("b"), idempotencyKey: `charge:${k}`, actorId: "qc" };
      case "AgentBalance": return { agentAccountId: rid("a"), tenantId };
      case "AgentStatement": return stRowOf({}, tenantId, unitId);
      case "AgentCommission": return { tenantId, agentAccountId: rid("a"), bookingKind: "TRIP", bookingId: rid("b"), bookingUnitId: unitId, baseSatang: 700_000, rateBp: 1500, commissionSatang: 105_000, whtMode: "FLAT", whtRateBp: 300, whtSatang: 3_150, settleMode: "NETTED" };
      case "AgentCommissionRun": return { tenantId, code: `CR-${k}`, cutoffAt: now() };
      case "AgentCommissionPayout": return { tenantId, runId: rid("run"), agentAccountId: rid("a"), unitId, commissionSatang: 105_000, vatSatang: 0, whtSatang: 3_150, clawbackNettedSatang: 0, paidSatang: 101_850, whtMode: "FLAT", whtRateBp: 300, idempotencyKey: `po:${k}` };
      case "TripSupplier": return { tenantId, name: "เรือทดสอบ", partyId: rid("p"), payeeType: "TH_JURISTIC" };
      case "TripSupplierCost": return { tenantId, unitId, supplierId: rid("s"), productId: rid("p"), mode: "NET", valueMinor: 250_000 };
      case "TripSupplierRequest": return { tenantId, unitId, bookingId: rid("b"), supplierId: rid("s"), channel: "LINK", responseTokenHash: hex(32), respondBy: new Date(Date.now() + 86_400_000), requestSnapshot: {}, idempotencyKey: `sr:${k}` };
      case "TripSupplierPayable": return { tenantId, unitId, supplierId: rid("s"), bookingId: rid("b"), amountSatang: 250_000, dueAt: now(), idempotencyKey: `sp:${k}` };
      case "TripPassengerLink": return { tenantId, unitId, passengerId: rid("px"), bookingId: rid("b"), tokenHash: hex(32), expiresAt: new Date(Date.now() + 86_400_000), issuedByKind: "STAFF" };
      case "SellBasket": return { tenantId, channel: "WEB", status: "OPEN", expiresAt: now(), idempotencyKey: `b:${k}`, unitIds: [], holdIdempotencyKey: `h:${k}`, holdRequestHash: hex(8) };
      default: throw new AssertFail(`ไม่มีแถวตัวอย่าง ${t}`);
    }
  };
  const V = (t: string, over: Rec = {}): [string, Rec] => [t, { ...valid(t, tA, uA), ...over }];

  // ═══════════════ M. migration ═══════════════
  console.log("\n── M: migration ──");
  const baseMigs = new Set(git(["ls-tree", "--name-only", `${BASE_SHA}:prisma/migrations`]).split("\n").filter(Boolean));
  const nowMigs = readdirSync(join(ROOT, "prisma/migrations")).filter((d) => !d.endsWith(".toml")).sort();
  const newMigs = nowMigs.filter((d) => !baseMigs.has(d));
  const migDir = newMigs.find((d) => /^\d{14}_agency$/.test(d));
  const migSql = migDir ? read(`prisma/migrations/${migDir}/migration.sql`) : "";
  const migCode = stripSqlComments(migSql);
  /** ตัวคั่นฟังก์ชันแบบใดก็ได้ ($$ / $fn$ …) */
  const DOLLAR = /\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g;
  const fnBodies = [...migCode.matchAll(DOLLAR)].map((m) => m[0]).join("\n");
  const migNoFn = migCode.replace(DOLLAR, "BODY");
  const stmts = migNoFn.split(";").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
  const EXISTING_ALTER = ["TripPickupZone", "TripBooking", "TripMoneyEvent", "SellBasket"];
  await st("M-1", "migration ใหม่ = 1 โฟลเดอร์ `<ts>_agency` · ts > 20270201000100 · คำสั่งแรก = `SET lock_timeout` (ไม่ใช่ SET LOCAL) · ปิดด้วย RESET", () => {
    ok(migDir, `ยังไม่มี (ใหม่: ${newMigs.join(", ") || "ไม่มี"})`);
    eq(newMigs, [migDir], "โฟลเดอร์ใหม่");
    ok((migDir ?? "") > BASE_LAST_MIG, `ลำดับ ${migDir}`);
    ok(/^SET lock_timeout\b/i.test(stmts[0] ?? ""), `คำสั่งแรก: ${(stmts[0] ?? "").slice(0, 60)}`);
    ok(stmts.some((s) => /^RESET lock_timeout$/i.test(s)), "ไม่มี RESET lock_timeout");
  });
  await st("M-2", "add-only: ทุกคำสั่งเป็น CREATE TABLE/INDEX/FUNCTION/TRIGGER · ALTER TABLE ADD COLUMN/CONSTRAINT · SET/RESET lock_timeout เท่านั้น", () => {
    ok(migSql, "ยังไม่มีไฟล์");
    const bad = stmts.filter((s) => {
      if (/^(CREATE TABLE|CREATE (UNIQUE )?INDEX|CREATE (OR REPLACE )?FUNCTION|CREATE TRIGGER|SET lock_timeout|RESET lock_timeout)\b/i.test(s)) return false;
      if (/^ALTER TABLE /i.test(s)) return !s.replace(/^ALTER TABLE "[^"]+" /i, "").split(/,(?![^()]*\))/).every((cl) => /^\s*ADD (COLUMN|CONSTRAINT)\b/i.test(cl));
      return true;
    });
    ok(bad.length === 0, `คำสั่งต้องห้าม: ${bad.slice(0, 3).map((s) => s.slice(0, 80)).join(" | ")}`);
    ok(!/\b(DROP|RENAME|TRUNCATE|ALTER TYPE|SET NOT NULL|DELETE FROM|UPDATE "|INSERT INTO)\b/i.test(migNoFn.replace(/BEFORE UPDATE OR DELETE/gi, "")), "มี DROP/RENAME/UPDATE/DELETE/INSERT นอกตัวฟังก์ชัน");
  });
  await st("M-3", `ตารางเดิมที่แตะ = ${EXISTING_ALTER.join("/")} (ADD COLUMN nullable + ADD CONSTRAINT) · ดัชนีบนตารางเดิมเฉพาะ TripMoneyEvent/SellBasket`, () => {
    ok(migSql, "ยังไม่มีไฟล์");
    const created = new Set([...migCode.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]));
    const altered = [...new Set([...migCode.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN/gi)].map((m) => m[1]))].filter((t) => !created.has(t)).sort();
    eq(altered, [...EXISTING_ALTER].sort(), "ตารางเดิมที่ ADD COLUMN");
    const notNull = [...migNoFn.matchAll(/ALTER TABLE "(\w+)" ([^;]+);/gi)].filter((m) => !created.has(m[1])).flatMap((m) => m[2].split(/,(?![^()]*\))/)).filter((cl) => /ADD COLUMN/i.test(cl) && /NOT NULL/i.test(cl));
    ok(notNull.length === 0, `คอลัมน์ NOT NULL บนตารางเดิม: ${notNull.join(" | ").slice(0, 160)}`);
    const idxOld = [...migCode.matchAll(/CREATE (?:UNIQUE )?INDEX "\w+" ON "(\w+)"/gi)].map((m) => m[1]).filter((t) => !created.has(t));
    ok(idxOld.every((t) => t === "TripMoneyEvent" || t === "SellBasket" || t === "TripHold" /* ORACLE-EDIT M-3 (ผู้คุม 13 พ.ย.): มติ R9 — ดัชนี O4 รวม TripHold_agentAccountId_active_idx */), `ดัชนีบนตารางเดิมอื่น: ${idxOld.join(", ")}`);
    const moved = MOVED_OUT.filter((t) => created.has(t));
    ok(moved.length === 0, `ตารางที่ย้ายไป L1.1 (มติ R2) ยังอยู่: ${moved.join(", ")}`);
  });
  await st("M-4", "ไม่มี FOREIGN KEY / REFERENCES ในไฟล์ (id หลวม · ไม่มี cascade ลงสมุด)", () => {
    ok(migSql, "ยังไม่มีไฟล์");
    ok(!/FOREIGN KEY|REFERENCES\s+"/i.test(migCode), "มี FK");
  });
  await st("M-5", "SQL มือครบ: NND ×2 · partial unique ×2 (ตะกร้า · ใบแจ้งยอดไม่นับ VOID) · partial index ×3 · ฟังก์ชัน+trigger สมุด (PENDING_DELETE · VOID · accountDocId)", () => {
    ok(migSql, "ยังไม่มีไฟล์");
    const need: [string, RegExp][] = [
      ["AgentRate_dims_key NND", /CREATE UNIQUE INDEX "AgentRate_dims_key"[^;]+NULLS NOT DISTINCT/i],
      ["TripSupplierCost_dims_key NND", /CREATE UNIQUE INDEX "TripSupplierCost_dims_key"[^;]+NULLS NOT DISTINCT/i],
      ["SellBasket_tenantId_holdIdempotencyKey_key partial", /CREATE UNIQUE INDEX "SellBasket_tenantId_holdIdempotencyKey_key"[^;]+WHERE/i],
      ["AgentStatement_agentAccountId_periodKey_key partial VOID", /CREATE UNIQUE INDEX "AgentStatement_agentAccountId_periodKey_key"[^;]+WHERE[^;]+'VOID'/i],
      ["AgentRequest_expiresAt_pending_idx (holdId IS NULL)", /CREATE INDEX "AgentRequest_expiresAt_pending_idx"[^;]+WHERE[^;]+"holdId" IS NULL/i],
      ["AgentAllotment_releaseAt_open_idx", /CREATE INDEX "AgentAllotment_releaseAt_open_idx"[^;]+WHERE/i],
      ["AgentWebhookDelivery_nextAttemptAt_open_idx", /CREATE INDEX "AgentWebhookDelivery_nextAttemptAt_open_idx"[^;]+WHERE/i],
      ["function agent_ledger_entry_guard", /CREATE (OR REPLACE )?FUNCTION "?agent_ledger_entry_guard"?/i],
      ["trigger AgentLedgerEntry_append_only", /CREATE TRIGGER "AgentLedgerEntry_append_only"\s+BEFORE UPDATE OR DELETE ON "AgentLedgerEntry"/i],
      ["ฟังก์ชัน: PENDING_DELETE", /PENDING_DELETE/], ["ฟังก์ชัน: VOID", /'VOID'/], ["ฟังก์ชัน: accountDocId", /accountDocId/], ["ฟังก์ชัน: shark.ledger_purge", /shark\.ledger_purge/],
    ];
    const miss = need.filter(([n, r]) => !(n.startsWith("ฟังก์ชัน") ? r.test(fnBodies) : r.test(migCode))).map(([n]) => n);
    ok(miss.length === 0, `ขาด: ${miss.join(", ")}`);
    ok(!/CREATE UNIQUE INDEX "AgentIdentity_taxIdHash/i.test(migCode), "taxIdHash ต้องไม่ unique (มติ R1)");
  });
  await st("M-6", "schema: agency.prisma + supplier.prisma ใหม่ · trips.prisma/sellable.prisma เพิ่มอย่างเดียว · ไม่แตะไฟล์ schema อื่น · ไม่ @@unique ซ้ำ SQL มือ", () => {
    const ch = changedSinceBase(["prisma/schema"]).sort();
    eq(ch, ["prisma/schema/agency.prisma", "prisma/schema/sellable.prisma", "prisma/schema/supplier.prisma", "prisma/schema/trips.prisma"], "ไฟล์ schema ที่เปลี่ยน");
    const del = git(["diff", "--numstat", BASE_SHA, "--", "prisma/schema/trips.prisma", "prisma/schema/sellable.prisma"]).trim().split("\n").filter(Boolean).filter((l) => Number(l.split("\t")[1]) > 0);
    ok(del.length === 0, `ลบบรรทัดในไฟล์เดิม: ${del.join(" · ")}`);
    const ag = stripComments(read("prisma/schema/agency.prisma")), sp = stripComments(read("prisma/schema/supplier.prisma"));
    ok(!/@@unique\(\[\s*rateCardId\s*,\s*productKind/.test(ag) && !/@@unique\(\[\s*agentAccountId\s*,\s*periodKey/.test(ag) && !/taxIdHash[^\n]*@unique/.test(ag) && !/@@unique\(\[\s*taxIdHash/.test(ag), "agency.prisma ประกาศ unique ซ้ำ SQL มือ / taxIdHash unique");
    ok(!/@@unique\(\[\s*supplierId\s*,\s*productId/.test(sp), "supplier.prisma ประกาศ unique ซ้ำ SQL มือ");
    ok(MOVED_OUT.every((t) => !new RegExp(`model ${t}\\b`).test(`${ag}\n${sp}`)), "ยังมีโมเดลที่ย้ายไป L1.1");
  });
  await st("M-7", "migration เก่าไม่ถูกแก้", () => {
    const touched = git(["diff", "--name-only", BASE_SHA, "--", "prisma/migrations"]).split("\n").filter(Boolean).filter((f) => baseMigs.has(f.split("/")[2] ?? ""));
    ok(touched.length === 0, `แก้ migration เก่า: ${touched.join(", ")}`);
  });
  await st("M-8", "โฟลเดอร์ใหม่ลงฐานนี้แล้ว (_prisma_migrations finished · ไม่ rollback · ไม่มีแถวค้างล้ม)", async () => {
    ok(migDir, "ยังไม่มีโฟลเดอร์ migration");
    const r = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`, [migDir]);
    eq(r[0]?.n, 1, "ลงฐาน");
    const f = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL`);
    eq(f[0]?.n, 0, "แถวค้าง/ล้ม");
  });

  // ═══════════════ T. ตาราง/คอลัมน์ ═══════════════
  console.log("\n── T: ตาราง · คอลัมน์ · ชนิด · default ──");
  const colDiff = async (table: string, spec: ColSpec[], exact: boolean): Promise<string[]> => {
    const got = await cols(table);
    if (!got.length) return [`${table}(ไม่มีตาราง)`];
    const bad: string[] = [];
    for (const s of spec) {
      const c = got.find((x) => x.column_name === s.name);
      if (!c) { bad.push(`${table}.${s.name}(ไม่มี)`); continue; }
      if (c.data_type !== PG_TYPE[s.t] || (s.t === "ta" && c.udt_name !== "_text")) bad.push(`${table}.${s.name}=${c.data_type}`);
      if (s.t !== "ta" && (c.is_nullable === "YES") !== s.nullable) bad.push(`${table}.${s.name} nullable=${c.is_nullable}`);
    }
    if (exact) for (const c of got) if (!spec.some((s) => s.name === c.column_name)) bad.push(`${table}.${c.column_name}(เกิน)`);
    return bad;
  };
  await st("T-1", `ตารางใหม่ครบ ${NEW_TABLES.length} ตัว · ตารางที่ย้ายไป L1.1 ไม่มี`, async () => {
    const miss: string[] = [];
    for (const t of NEW_TABLES) if ((await cols(t)).length === 0) miss.push(t);
    ok(miss.length === 0, `ยังไม่มี ${miss.length}/${NEW_TABLES.length}: ${miss.slice(0, 5).join(", ")}`);
    for (const t of MOVED_OUT) ok((await cols(t)).length === 0, `${t} ต้องไม่มี (มติ R2)`);
  });
  await st("T-2", "แกน: global ไม่มี tenantId · tenant มี tenantId NOT NULL · unit มี tenantId+unitId NOT NULL", async () => {
    const bad: string[] = [];
    for (const [t, s] of Object.entries(TABLES)) {
      const c = await cols(t);
      if (!c.length) { bad.push(`${t}(ไม่มี)`); continue; }
      const tid = c.find((x) => x.column_name === "tenantId"), uid = c.find((x) => x.column_name === "unitId");
      if (s.axis === "global" && tid) bad.push(`${t} มี tenantId`);
      if (s.axis !== "global" && (!tid || tid.is_nullable !== "NO")) bad.push(`${t}.tenantId`);
      if (s.axis === "unit" && (!uid || uid.is_nullable !== "NO")) bad.push(`${t}.unitId`);
    }
    ok(bad.length === 0, bad.slice(0, 6).join(", "));
  });
  const T_GROUPS: [string, string, string[]][] = [
    ["T-3", "ตัวตน global (5 ตาราง) · AgentIdentity ไม่มีคอลัมน์อื่นนอกสเปก", ["AgentIdentity", "AgentUser", "AgentLogin", "AgentSession", "AgentLoginCode"]],
    ["T-4", "เอเจนซี่ต่อร้าน (tier · account · member · contract · rate card · rate · request · link · api key)", ["AgentTier", "AgentAccount", "AgentAccountMember", "AgentContract", "AgentRateCard", "AgentRate", "AgentRequest", "AgentLink", "AgentApiKey"]],
    ["T-5", "โควตา · หยุดขาย · webhook + บันทึกการส่ง · สื่อ", ["AgentAllotmentBlock", "AgentAllotment", "AgentStopSell", "AgentWebhook", "AgentWebhookDelivery", "AgentMediaAsset"]],
    ["T-6", "เงิน: สมุด (unitId · settlesStatementId · ไม่มี updatedAt) · หัวสมุด · ใบแจ้งยอด (BIGINT · version · overdueAt · otherSatang) · คอมฯ (clawback) · รอบ · การจ่าย", ["AgentLedgerEntry", "AgentBalance", "AgentStatement", "AgentCommission", "AgentCommissionRun", "AgentCommissionPayout"]],
    ["T-7", "ผู้ให้บริการ TripSupplier* (4) + TripPassengerLink", ["TripSupplier", "TripSupplierCost", "TripSupplierRequest", "TripSupplierPayable", "TripPassengerLink"]],
  ];
  for (const [id, name, tables] of T_GROUPS) {
    await st(id, `ชุดคอลัมน์/ชนิด/null ตรงใบสั่ง §2 — ${name}`, async () => {
      const bad: string[] = [];
      for (const t of tables) bad.push(...(await colDiff(t, parseCols(TABLES[t].cols), true)));
      ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 6).join(", ")}`);
    });
  }
  await st("T-8", "คอลัมน์ที่เพิ่มบนตารางเดิม (§2.5) มีครบ ชนิดถูก และ nullable ทั้งหมด", async () => {
    const bad: string[] = [];
    for (const [t, s] of Object.entries(ADDED_COLS)) bad.push(...(await colDiff(t, parseCols(s), false)));
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 6).join(", ")}`);
  });
  await st("T-9", "default: สถานะเริ่ม · ตัวนับ 0 · THB · AGENT · TH · ธง", async () => {
    const want: [string, string, string][] = [
      ["AgentIdentity", "status", "'ACTIVE'"], ["AgentUser", "status", "'ACTIVE'"], ["AgentLoginCode", "attempts", "0"], ["AgentTier", "active", "true"],
      ["AgentAccount", "kind", "'AGENT'"], ["AgentAccount", "country", "'TH'"], ["AgentAccount", "vatRegistered", "false"], ["AgentAccountMember", "active", "true"],
      ["AgentContract", "status", "'DRAFT'"], ["AgentRateCard", "version", "1"], ["AgentRateCard", "priority", "0"], ["AgentRate", "currency", "'THB'"], ["AgentRate", "active", "true"],
      ["AgentRequest", "status", "'PENDING'"], ["AgentLink", "showBrand", "true"], ["AgentAllotment", "used", "0"], ["AgentAllotment", "held", "0"], ["AgentAllotment", "returnedToPublic", "0"],
      ["AgentWebhookDelivery", "status", "'PENDING'"], ["AgentWebhookDelivery", "attempts", "0"],
      ["AgentLedgerEntry", "currency", "'THB'"], ["AgentBalance", "balanceSatang", "0"], ["AgentBalance", "lastSeq", "0"], ["AgentBalance", "version", "0"],
      ["AgentStatement", "status", "'DRAFT'"], ["AgentStatement", "version", "0"], ["AgentStatement", "openingSatang", "0"], ["AgentStatement", "adjustmentSatang", "0"], ["AgentStatement", "otherSatang", "0"], ["AgentStatement", "paidSatang", "0"],
      ["AgentCommission", "vatSatang", "0"], ["AgentCommission", "whtMode", "'NONE'"], ["AgentCommission", "whtRateBp", "0"], ["AgentCommission", "clawbackSatang", "0"], ["AgentCommission", "currency", "'THB'"], ["AgentCommission", "status", "'PENDING'"],
      ["AgentCommissionRun", "status", "'DRAFT'"], ["AgentCommissionRun", "totalPaidSatang", "0"], ["AgentCommissionPayout", "status", "'PENDING'"], ["AgentWebhook", "failCount", "0"],
      ["TripSupplier", "status", "'ACTIVE'"], ["TripSupplierRequest", "status", "'DRAFT'"], ["TripSupplierRequest", "attempts", "0"], ["TripSupplierPayable", "paidSatang", "0"], ["TripSupplierPayable", "status", "'ACCRUED'"],
      ["TripSupplierCost", "currency", "'THB'"], ["TripPassengerLink", "purpose", "'PAX_FORM'"],
    ];
    const bad: string[] = [];
    for (const [t, c, d] of want) {
      const r = (await cols(t)).find((x) => x.column_name === c);
      if (!r || !(r.column_default ?? "").startsWith(d)) bad.push(`${t}.${c}=${r?.column_default ?? "ไม่มี"}`);
    }
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 6).join(", ")}`);
  });
  await st("T-10", "ไม่มี FK เข้า/ออกตารางใหม่และ 4 ตารางที่แตะ · ไม่มีคอลัมน์ USER-DEFINED · PK AgentBalance = agentAccountId · แถวเดิมของคอลัมน์ใหม่เป็น NULL", async () => {
    await needTable("AgentIdentity");
    const all = [...NEW_TABLES, ...EXISTING_ALTER];
    const fks = await q<{ src: string; dst: string }>(`SELECT t.relname AS src, r.relname AS dst FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_class r ON r.oid = c.confrelid JOIN pg_namespace ns ON ns.oid = t.relnamespace WHERE c.contype = 'f' AND ns.nspname = current_schema() AND (t.relname = ANY($1::text[]) OR r.relname = ANY($1::text[]))`, [all]);
    ok(fks.length === 0, `มี FK: ${fks.map((f) => `${f.src}→${f.dst}`).join(", ")}`);
    const ud = await q<{ t: string; c: string }>(`SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ANY($1::text[]) AND data_type = 'USER-DEFINED'`, [NEW_TABLES]);
    ok(ud.length === 0, `enum Prisma: ${ud.map((x) => `${x.t}.${x.c}`).join(", ")}`);
    const pk = await q<{ a: string }>(`SELECT a.attname AS a FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = '"AgentBalance"'::regclass AND i.indisprimary`);
    eq(pk.map((x) => x.a), ["agentAccountId"], "PK AgentBalance");
    const nn = await q<{ n: number }>(`SELECT (SELECT count(*) FROM "TripPickupZone" WHERE "kind" IS NOT NULL OR "nameEn" IS NOT NULL OR "areas" IS NOT NULL OR "windowMin" IS NOT NULL OR "active" IS NOT NULL OR "basis" IS NOT NULL)::int AS n`);
    eq(nn[0]?.n, 0, "แถวจุดรับส่งเดิมถูกเติมค่า (ห้าม backfill ใน migration)");
  });
  await st("T-11", `BIGINT (มติ R4): ${BIGINT_COLS.length} คอลัมน์ยอดรวมเก็บค่าเกิน int4 ได้ (3,000,000,000) · คอลัมน์ต่อรายการ int4 ปฏิเสธค่าเดียวกัน (22003 · positive control)`, async () => {
    await needTable("AgentStatement");
    const BIG = 3_000_000_000;
    const r = await codes([
      ["AgentStatement", stRowOf({ salesSatang: BIG, paidSatang: BIG, whtCertSatang: BIG })],
      ["AgentBalance", { agentAccountId: rid("bal"), tenantId: tA, balanceSatang: BIG }],
      ["AgentCommissionRun", { ...valid("AgentCommissionRun", tA, uA), totalCommissionSatang: BIG, totalVatSatang: BIG, totalWhtSatang: BIG, totalPaidSatang: BIG }],
      ["AgentCommissionPayout", { ...valid("AgentCommissionPayout", tA, uA), commissionSatang: BIG, vatSatang: BIG, whtSatang: BIG, clawbackNettedSatang: BIG, paidSatang: BIG }],
      ["AgentLedgerEntry", { ...valid("AgentLedgerEntry", tA, uA), amountSatang: BIG }],
    ]);
    eq(r, ["", "", "", "", "22003"], "รหัส (4 ตาราง BIGINT ผ่าน · สมุด int4 ล้น)");
  });

  // ═══════════════ C. CHECK ═══════════════
  console.log("\n── C: CHECK (ชุดค่าตามชื่อ · ปฏิเสธจริงทุกตัว · ชื่อ constraint จาก error) ──");
  let ci = 1;
  for (const g of ["identity", "pricing", "money", "supplier"]) {
    const list = VALUE_SETS.filter((x) => x[0] === g);
    await st(`C-${ci++}`, `ชุดค่า CHECK กลุ่ม ${g} (${list.length} คอลัมน์ · ชื่อ "<ตาราง>_<คอลัมน์>_check") ตรงใบสั่ง §3.1`, async () => {
      const bad: string[] = [];
      for (const [, t, c, vals] of list) {
        const d = await conDef(t, `${t}_${c}_check`);
        if (!d) { bad.push(`${t}_${c}_check(ไม่มี)`); continue; }
        const got = [...new Set(literalsOf(d))].sort();
        if (!isDeepStrictEqual(got, [...vals].sort())) bad.push(`${t}.${c}=${fmt(got)}`);
      }
      ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 4).join(" · ")}`);
    });
  }
  /** แถวผิดของกรณีตัวเลข: แถวถูก + ค่าผิด (+ แก้ช่องอื่น) · ใบแจ้งยอดคิดยอดรวมใหม่ให้ผิดข้อเดียว */
  const numRow = (t: string, c: string, bad: unknown, over: Rec = {}): Rec => {
    const r: Rec = { ...valid(t, tA, uA), ...over, [c]: bad };
    if (t === "AgentStatement") r.totalSatang = stTotal(r);
    return r;
  };
  await st("C-5", `ทุกชุดค่า (${VALUE_SETS.length}): ค่าแปลก 'ZZ_BOGUS' ⇒ 23514 จาก CHECK ของตารางนั้น (tx rollback)`, async () => {
    await needTable("AgentIdentity");
    const zone = (await q<{ id: string }>(`SELECT id FROM "TripPickupZone" LIMIT 1`))[0]?.id;
    ok(zone, "ฐานไม่มีแถว TripPickupZone ของ seed");
    const steps: (string | [string, Rec])[] = VALUE_SETS.map(([, t, c]) => t === "TripPickupZone"
      ? `UPDATE "TripPickupZone" SET "kind" = ${c === "kind" ? "'ZZ_BOGUS'" : "'ZONE'"}, "windowMin" = 0, "active" = true, "basis" = ${c === "basis" ? "'ZZ_BOGUS'" : "'PER_BOOKING'"} WHERE id = '${zone}'`
      : [t, { ...valid(t, tA, uA), [c]: "ZZ_BOGUS", ...(t === "AgentRequest" && c === "kind" ? { holdId: null, expiresAt: now() } : {}) }]);
    const r = await codesC(steps);
    const bad = VALUE_SETS.map(([, t, c], i) => [`${t}.${c}`, r[i], t] as const).filter(([, x, t]) => !x.startsWith(`23514:${t}_`)).map(([n, x]) => `${n}=${x || "ผ่าน"}`);
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 5).join(" · ")}`);
  });
  const NUM_GROUPS: [string, string, (t: string) => boolean][] = [
    ["C-6", "ตัวตน · ราคา · คำขอ · ลิงก์ · โควตา", (t) => /^Agent(LoginCode|Tier|Contract|RateCard|Rate|Request|Link|AllotmentBlock|Allotment)$/.test(t)],
    ["C-7", "สมุด · หัวสมุด · ใบแจ้งยอด · คอมฯ · รอบ · การจ่าย", (t) => /^Agent(LedgerEntry|Balance|Statement|Commission|CommissionRun|CommissionPayout)$/.test(t)],
    ["C-8", "webhook · สื่อ · ผู้ให้บริการ", (t) => /^(AgentWebhook|AgentWebhookDelivery|AgentMediaAsset|TripSupplier\w*)$/.test(t)],
  ];
  for (const [id, name, pick] of NUM_GROUPS) {
    const list = NUM_CASES.filter((x) => pick(x[0]));
    await st(id, `CHECK ตัวเลข ${list.length} กรณี (${name}): ค่าผิดขอบ ⇒ 23514 จาก "<ตาราง>_<คอลัมน์>_check" (ใบสั่ง §3.2)`, async () => {
      await needTable(list[0][0]);
      const r = await codesC(list.map(([t, c, bad, over]) => [t, numRow(t, c, bad, over)] as [string, Rec]));
      const badOut = list.map(([t, c, v, , alts], i) => ({ n: `${t}.${c}=${String(v)}`, got: r[i], ok: r[i] === `23514:${t}_${c}_check` || (alts ?? []).some((a) => r[i] === `23514:${a}`) })).filter((x) => !x.ok).map((x) => `${x.n}→${x.got || "ผ่าน"}`);
      ok(badOut.length === 0, `${badOut.length}: ${badOut.slice(0, 5).join(" · ")}`);
    });
  }
  await st("C-9", "CHECK ตัวเลขบนตารางเดิม: TripPickupZone.windowMin 721/−1 · CHECK ข้ามคอลัมน์บนตารางเดิม (v2 · agentRef) ⇒ ชื่อ constraint ตรง", async () => {
    await needTable("AgentIdentity");
    const zone = (await q<{ id: string }>(`SELECT id FROM "TripPickupZone" LIMIT 1`))[0]?.id, bk = (await q<{ id: string }>(`SELECT id FROM "TripBooking" LIMIT 1`))[0]?.id;
    ok(zone && bk, "ฐานไม่มีแถว seed");
    const r = await codesC(CROSS_SQL.map(([, t, set]) => `UPDATE "${t}" SET ${set} WHERE id = '${t === "TripBooking" ? bk : zone}'`));
    eq(r, CROSS_SQL.map(([n]) => `23514:${n}`), "รหัส");
    eq(await codesC([`UPDATE "TripPickupZone" SET "kind" = 'SELF', "windowMin" = 0, "active" = true, "basis" = 'PER_BOOKING' WHERE id = '${zone}'`, `UPDATE "TripBooking" SET "agentRef" = 'PTD-2291' WHERE id = '${bk}'`]), ["", ""], "ค่าถูกผ่าน (positive)");
  });
  await st("C-10", `CHECK ข้ามคอลัมน์ ${CROSS_CASES.length} กรณี (ช่วงวัน · เจ้าของ · ค่า · สกุล · hold · สมุด · ใบแจ้งยอด · คอมฯ · ผู้ให้บริการ · ตะกร้าคู่): แถวผิดข้อเดียว ⇒ 23514 ชื่อตรง`, async () => {
    await needTable("AgentIdentity");
    const r = await codesC(CROSS_CASES.map(([, t, o]) => [t, { ...valid(t, tA, uA), ...o }] as [string, Rec]));
    const bad = CROSS_CASES.map(([n, t, o], i) => ({ n: `${n} ${fmt(o).slice(0, 50)}`, got: r[i], ok: r[i] === `23514:${n}` })).filter((x) => !x.ok).map((x) => `${x.n}→${x.got || "ผ่าน"}`);
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 4).join(" · ")}`);
  });
  await st("C-11", `positive control: แถวถูกต้องเต็มของทั้ง ${NEW_TABLES.length} ตารางใหม่ + SellBasket ทั้งคู่/ไม่มีเลย insert ได้ · ค่าขอบที่ถูก (bp 10000 · responseCode 599 · clawback = commission+vat · INVITED/CLOSED ไม่มีตัวตน) ผ่าน`, async () => {
    await needTable("AgentIdentity");
    const steps: [string, Rec][] = [...NEW_TABLES.map((t) => V(t)), V("SellBasket"), V("SellBasket", { holdIdempotencyKey: null, holdRequestHash: null }),
      V("AgentRate", { valueBp: 10_000 }), ["AgentWebhookDelivery", { ...valid("AgentWebhookDelivery", tA, uA), responseCode: 599 }], V("AgentCommission", { clawbackSatang: 105_000 }),
      V("AgentAccount", { identityId: null, status: "INVITED" }), V("AgentAccount", { identityId: null, status: "CLOSED" }), V("AgentRequest", { kind: "ALLOTMENT", holdId: null, expiresAt: now() }),
      V("AgentRate", { mode: "COMMISSION_FIXED", valueBp: null, valueMinor: 50_000 }), V("AgentCommission", { currency: "USD", fxRateMicros: 36_500_000 }), V("AgentIdentity", { taxIdHash: `v1:${"a".repeat(64)}` })];
    const r = await codes(steps);
    const bad = steps.map(([t], i) => [t, r[i]]).filter(([, c]) => c !== "").map(([t, c]) => `${t}:${c}`);
    ok(bad.length === 0, `insert ไม่ผ่าน: ${bad.slice(0, 5).join(" · ")}`);
  });
  await st("C-12", "สมุด: เมทริกซ์เครื่องหมาย 14 ชนิด (บวก/ลบ/ไม่บังคับ) · ยอด 0 ทุกชนิดตก · อ้างอิงบังคับครบตามชนิด", async () => {
    await needTable("AgentLedgerEntry");
    const refsOf = (k: string): Rec => ({
      ...(["CHARGE", "CHARGE_PASS_THROUGH"].includes(k) ? {} : { bookingKind: null, bookingId: null, unitId: null }),
      ...(["COMMISSION_NETTED", "COMMISSION_VAT", "WHT_GROSSUP", "COMMISSION_EARNED", "COMMISSION_CLAWBACK"].includes(k) ? { commissionId: rid("c") } : {}),
      ...(["COMMISSION_PAID", "WHT_WITHHELD"].includes(k) ? { runId: rid("r") } : {}), ...(k === "ADJUSTMENT" ? { approvalId: rid("ap"), reason: "ปรับ" } : {}) });
    const steps: [string, Rec][] = [], want: string[] = [];
    for (const k of LEDGER_KINDS) for (const amt of [100, -100, 0]) {
      steps.push(["AgentLedgerEntry", { ...valid("AgentLedgerEntry", tA, uA), kind: k, amountSatang: amt, ...refsOf(k) }]);
      const okSign = amt !== 0 && (LEDGER_ANY.includes(k) || (LEDGER_POS.includes(k) ? amt > 0 : amt < 0));
      want.push(okSign ? "" : "23514:AgentLedgerEntry_sign_check");
    }
    eq(await codesC(steps), want, "ผล (ชนิด×{+100,−100,0})");
  });
  await st("C-13", "ใบแจ้งยอด: ภาพ 13ง (ยกเลิก −7,181.50 มีเครื่องหมาย) = 86,121.15 ผ่าน · ยกเลิกสุทธิบวก (ดึงคอมฯ คืน) ผ่าน · otherSatang ±(เอเจนซี่ผสม) ผ่าน · ยอดยกมาติดลบผ่าน", async () => {
    await needTable("AgentStatement");
    eq(stTotal(stRowOf()), 8_612_115, "สูตรของข้อสอบ (ภาพ 13ง)");
    const r = await codes([["AgentStatement", stRowOf()], ["AgentStatement", stRowOf({ cancelledSatang: 52_500 })], ["AgentStatement", stRowOf({ otherSatang: -1_222_200 })],
      ["AgentStatement", stRowOf({ otherSatang: 37_800, openingSatang: -10_000 })]]);
    eq(r, ["", "", "", ""], "รหัส");
  });
  await st("C-14", "โควตา: เต็มพอดี (used+held+returned = qty) ผ่าน · คืนแล้วมี releasedQty ผ่าน · คืน 0 ที่ผ่าน", async () => {
    await needTable("AgentAllotment");
    eq(await codes([V("AgentAllotment", { used: 6, held: 2, returnedToPublic: 2 }), V("AgentAllotment", { releasedAt: now(), releasedQty: 10 }), V("AgentAllotment", { releasedAt: now(), releasedQty: 0 })]), ["", "", ""], "รหัส");
  });

  // ═══════════════ U. unique ═══════════════
  console.log("\n── U: unique · NULLS NOT DISTINCT · partial ──");
  await st("U-1", "pg_index: AgentRate_dims_key / TripSupplierCost_dims_key = UNIQUE NULLS NOT DISTINCT ตรงคอลัมน์ ไม่มี WHERE", async () => {
    const bad: string[] = [];
    for (const [name, c] of Object.entries(NND)) {
      const t = name.startsWith("AgentRate") ? "AgentRate" : "TripSupplierCost";
      const r = (await ixOf(t)).find((x) => x.name === name);
      if (!r || !r.uniq || !r.nnd || r.pred !== null || !isDeepStrictEqual(r.cols, [...c])) bad.push(`${name}=${fmt(r?.cols)} nnd=${r?.nnd}`);
    }
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("U-2", "พฤติกรรม NND: AgentRate มิติเดียวกัน (มิติ NULL) ซ้ำ ⇒ 23505 · ต่าง travelFrom ผ่าน · ช่วงซ้อน (travelFrom อื่น) ผ่าน = ไม่ใช่ตัวกันช่วงซ้อน · TripSupplierCost ซ้ำ ⇒ 23505", async () => {
    const rc = rid("rc"), p = rid("p"), s = rid("s");
    const r = await codes([V("AgentRate", { rateCardId: rc, productId: p }), V("AgentRate", { rateCardId: rc, productId: p }), V("AgentRate", { rateCardId: rc, productId: p, travelFrom: D0 }),
      V("AgentRate", { rateCardId: rc, productId: p, travelFrom: "2027-03-02", travelTo: "2027-04-01" }), V("TripSupplierCost", { supplierId: s, productId: p }), V("TripSupplierCost", { supplierId: s, productId: p })]);
    eq(r, ["", "23505", "", "", "", "23505"], "รหัส");
  });
  await st("U-3", "AgentIdentity: publicCode ซ้ำ ⇒ 23505 · taxIdHash = ดัชนีธรรมดา **ไม่ unique** (มติ R1) · แฮชเดียวกันสองตัวตนผ่าน", async () => {
    const pc = randCode(), h = `v1:${hex(32)}`;
    const r = await codes([V("AgentIdentity", { publicCode: pc }), V("AgentIdentity", { publicCode: pc }), V("AgentIdentity", { taxIdHash: h }), V("AgentIdentity", { taxIdHash: h })]);
    eq(r, ["", "23505", "", ""], "รหัส");
    const ix = (await ixOf("AgentIdentity")).filter((x) => x.cols.includes("taxIdHash"));
    ok(ix.length >= 1 && ix.every((x) => !x.uniq), `ดัชนี taxIdHash: ${fmt(ix.map((x) => [x.name, x.uniq]))}`);
  });
  await st("U-4", "AgentLogin (kind, providerId, subject): ซ้ำ ⇒ 23505 · LINE userId เดียวกันคนละ provider ผ่าน", async () => {
    const sub = lineSub(), em0 = `qca11-${hex(4)}@shark.local`;
    const r = await codes([V("AgentLogin", { subject: em0 }), V("AgentLogin", { subject: em0 }), V("AgentLogin", { kind: "LINE", providerId: "1650000001", subject: sub }), V("AgentLogin", { kind: "LINE", providerId: "1650000002", subject: sub }), V("AgentLogin", { kind: "LINE", providerId: "1650000001", subject: sub })]);
    eq(r, ["", "23505", "", "", "23505"], "รหัส");
  });
  await st("U-5", "AgentAccount: ตัวตนเดียวในร้านเดียว ⇒ 23505 · คนละร้านผ่าน · INVITED ไม่มีตัวตน 2 แถวผ่าน · code ซ้ำ ⇒ 23505 · inviteTokenHash ซ้ำ ⇒ 23505", async () => {
    const i = rid("i"), it = hex(16);
    const r = await codes([V("AgentAccount", { identityId: i }), V("AgentAccount", { identityId: i }), ["AgentAccount", { ...valid("AgentAccount", tB, uB), identityId: i }],
      V("AgentAccount", { identityId: null, status: "INVITED", inviteTokenHash: it }), V("AgentAccount", { identityId: null, status: "INVITED" }), V("AgentAccount", { code: "SAMECODE" }), V("AgentAccount", { code: "SAMECODE" }),
      V("AgentAccount", { identityId: null, status: "INVITED", inviteTokenHash: it })]);
    eq(r, ["", "23505", "", "", "", "", "23505", "23505"], "รหัส");
  });
  await st("U-6", "สมาชิก (account, user) · สมุด (account, seq) + (tenant, idempotencyKey) · หัวสมุด PK · การจ่ายคอมฯ (run, agent, unit) + (tenant, idem) · บันทึก webhook (webhook, event) ⇒ 23505", async () => {
    const a = rid("a"), u = rid("u"), run = rid("run"), wh = rid("wh"), ev = rid("ev");
    const r = await codes([V("AgentAccountMember", { agentAccountId: a, agentUserId: u }), V("AgentAccountMember", { agentAccountId: a, agentUserId: u }),
      V("AgentLedgerEntry", { agentAccountId: a, seq: 1, idempotencyKey: "same" }), V("AgentLedgerEntry", { agentAccountId: a, seq: 1, idempotencyKey: "other" }), V("AgentLedgerEntry", { agentAccountId: a, seq: 2, idempotencyKey: "same" }),
      V("AgentBalance", { agentAccountId: a }), V("AgentBalance", { agentAccountId: a }),
      V("AgentCommissionPayout", { runId: run, agentAccountId: a }), V("AgentCommissionPayout", { runId: run, agentAccountId: a }), V("AgentCommissionPayout", { runId: run, agentAccountId: a, unitId: uA2 }),
      V("AgentCommissionPayout", { runId: rid("run2"), idempotencyKey: "po:same" }), V("AgentCommissionPayout", { runId: rid("run3"), idempotencyKey: "po:same" }),
      V("AgentWebhookDelivery", { webhookId: wh, eventId: ev }), V("AgentWebhookDelivery", { webhookId: wh, eventId: ev })]);
    eq(r, ["", "23505", "", "23505", "23505", "", "23505", "", "23505", "", "", "23505", "", "23505"], "รหัส");
  });
  await st("U-7", "AgentAllotment (agentAccountId, productKind, slotId) ซ้ำ ⇒ 23505 · ดัชนี (productKind, slotId) · partial (releaseAt) WHERE releasedAt IS NULL", async () => {
    const a = rid("a"), s = rid("d");
    eq(await codes([V("AgentAllotment", { agentAccountId: a, slotId: s }), V("AgentAllotment", { agentAccountId: a, slotId: s }), V("AgentAllotment", { agentAccountId: a, slotId: s, productKind: "TICKET" })]), ["", "23505", ""], "รหัส");
    ok(await hasIdx("AgentAllotment", ["productKind", "slotId"]), "ไม่มีดัชนี (productKind, slotId)");
    const p = (await ixOf("AgentAllotment")).find((x) => x.name === "AgentAllotment_releaseAt_open_idx");
    ok(p && /"releasedAt" IS NULL/.test(p.pred ?? "") && isDeepStrictEqual(p.cols, ["releaseAt"]), `partial index: ${fmt(p)}`);
  });
  await st("U-8", "ใบแจ้งยอด: unique (agent, periodKey) WHERE status <> 'VOID' — ใบซ้ำงวด ⇒ 23505 · VOID แล้วออกใบใหม่งวดเดิมได้ · ไม่มี unique เต็มตาราง", async () => {
    const ix = (await ixOf("AgentStatement")).filter((x) => isDeepStrictEqual(x.cols, ["agentAccountId", "periodKey"]));
    ok(ix.some((x) => x.uniq && /'VOID'/.test(x.pred ?? "")) && !ix.some((x) => x.uniq && x.pred === null), `ดัชนี: ${fmt(ix.map((x) => [x.name, x.uniq, x.pred]))}`);
    const a = rid("a");
    const r = await codes([["AgentStatement", stRowOf({ agentAccountId: a, periodKey: "6911-1" })], ["AgentStatement", stRowOf({ agentAccountId: a, periodKey: "6911-1" })],
      ["AgentStatement", stRowOf({ agentAccountId: a, periodKey: "6911-1", status: "VOID" })], `UPDATE "AgentStatement" SET status = 'VOID' WHERE "agentAccountId" = '${a}'`, ["AgentStatement", stRowOf({ agentAccountId: a, periodKey: "6911-1" })]]);
    eq(r, ["", "23505", "", "", ""], "รหัส");
  });
  await st("U-9", "unique/ดัชนีอื่นตาม §2 (pg_index · รวม AgentRequest holdId · สมุด unitId/settlesStatementId · webhook delivery partial)", async () => {
    const need: [string, string[], boolean][] = [
      ["AgentTier", ["tenantId", "code"], true], ["AgentAccount", ["tenantId", "code"], true], ["AgentAccount", ["tenantId", "identityId"], true], ["AgentAccount", ["identityId"], false],
      ["AgentAccountMember", ["agentUserId"], false], ["AgentContract", ["agentAccountId", "version"], true], ["AgentRequest", ["tenantId", "idempotencyKey"], true], ["AgentRequest", ["holdId"], false],
      ["AgentRequest", ["tenantId", "productKind", "slotId"], false], ["AgentLink", ["tenantId", "code"], true], ["AgentApiKey", ["keyHash"], true], ["AgentSession", ["tokenHash"], true],
      ["AgentLogin", ["kind", "providerId", "subject"], true], ["AgentIdentity", ["publicCode"], true], ["AgentLedgerEntry", ["agentAccountId", "statementId"], false],
      ["AgentLedgerEntry", ["agentAccountId", "unitId"], false], ["AgentLedgerEntry", ["settlesStatementId"], false], ["AgentStatement", ["tenantId", "code"], true],
      ["AgentCommission", ["bookingKind", "bookingId", "agentAccountId"], true], ["AgentCommissionRun", ["tenantId", "code"], true], ["AgentCommissionRun", ["tenantId", "idempotencyKey"], true],
      ["AgentCommissionPayout", ["runId", "agentAccountId", "unitId"], true], ["AgentCommissionPayout", ["tenantId", "idempotencyKey"], true], ["AgentWebhookDelivery", ["webhookId", "eventId"], true],
      ["AgentWebhookDelivery", ["tenantId", "status"], false], ["TripSupplier", ["tenantId", "code"], true], ["TripSupplierRequest", ["responseTokenHash"], true],
      ["TripSupplierRequest", ["tenantId", "idempotencyKey"], true], ["TripSupplierPayable", ["tenantId", "idempotencyKey"], true], ["TripPassengerLink", ["tokenHash"], true],
    ];
    const bad: string[] = [];
    for (const [t, c, u] of need) if (!(u ? await hasUniq(t, c) : await hasIdx(t, c))) bad.push(`${t}(${c.join(",")})${u ? " UNIQUE" : ""}`);
    const pend = (await ixOf("AgentRequest")).find((x) => x.name === "AgentRequest_expiresAt_pending_idx");
    if (!pend || !/'PENDING'/.test(pend.pred ?? "") || !/"holdId" IS NULL/.test(pend.pred ?? "")) bad.push("AgentRequest_expiresAt_pending_idx");
    const wd = (await ixOf("AgentWebhookDelivery")).find((x) => x.name === "AgentWebhookDelivery_nextAttemptAt_open_idx");
    if (!wd || !/'PENDING'/.test(wd.pred ?? "") || !/'FAILED'/.test(wd.pred ?? "")) bad.push("AgentWebhookDelivery_nextAttemptAt_open_idx");
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 5).join(" · ")}`);
  });
  await st("U-10", "SellBasket: partial unique (tenantId, holdIdempotencyKey) WHERE NOT NULL · ซ้ำ ⇒ 23505 · TripMoneyEvent ดัชนี (tenantId, unitId, createdAt)", async () => {
    const p = (await ixOf("SellBasket")).find((x) => x.name === "SellBasket_tenantId_holdIdempotencyKey_key");
    ok(p && p.uniq && /IS NOT NULL/.test(p.pred ?? "") && isDeepStrictEqual(p.cols, ["tenantId", "holdIdempotencyKey"]), `ดัชนี: ${fmt(p)}`);
    eq(await codes([V("SellBasket", { holdIdempotencyKey: "h1" }), V("SellBasket", { holdIdempotencyKey: "h1" })]), ["", "23505"], "รหัส");
    ok(await hasIdx("TripMoneyEvent", ["tenantId", "unitId", "createdAt"]), "ไม่มีดัชนี TripMoneyEvent");
  });

  // ═══════════════ L. สมุดต่อท้ายอย่างเดียว ═══════════════
  console.log("\n── L: AgentLedgerEntry ต่อท้ายอย่างเดียว · ล้างร้าน · VOID · Prisma · ค่าคงที่ ──");
  const ledgerId = rid("le");
  let ledgerErr = "";
  try { await ins("AgentLedgerEntry", { id: ledgerId, ...valid("AgentLedgerEntry", tA, uA), idempotencyKey: `L:${STAMP}` }); } catch (e) { ledgerErr = e instanceof AssertFail ? e.message : errMsg(e); }
  const needLedger = () => { if (ledgerErr) throw new AssertFail(`สร้างแถวสมุดไม่ได้: ${ledgerErr}`); };
  const upd = (set: string, id = ledgerId) => `UPDATE "AgentLedgerEntry" SET ${set} WHERE id = '${id}'`;
  await st("L-1", "trigger `AgentLedgerEntry_append_only` BEFORE UPDATE OR DELETE · FOR EACH ROW · เปิดใช้", async () => {
    const r = await q<{ tgtype: number; tgenabled: string }>(`SELECT tgtype, tgenabled FROM pg_trigger WHERE tgrelid = to_regclass('"AgentLedgerEntry"') AND tgname = 'AgentLedgerEntry_append_only' AND NOT tgisinternal`);
    ok(r.length === 1, "ไม่มี trigger");
    const t = r[0].tgtype;
    ok((t & 1) && (t & 2) && (t & 8) && (t & 16) && r[0].tgenabled === "O", `tgtype=${t} enabled=${r[0].tgenabled}`);
  });
  await st("L-2", "UPDATE ยอด/ชนิด/การจอง/unitId/settlesStatementId/createdAt ⇒ 23001 AGENT_LEDGER_APPEND_ONLY", async () => {
    needLedger();
    const r = await codes([upd(`"amountSatang" = 1`), upd(`"kind" = 'CHARGE_PASS_THROUGH'`), upd(`"bookingId" = 'x'`), upd(`"unitId" = 'u-x'`), upd(`"settlesStatementId" = 's'`), upd(`"createdAt" = now() - interval '1 day'`)]);
    eq(r, ["23001", "23001", "23001", "23001", "23001", "23001"], "รหัส");
    const msg = await inTx(async (c) => { try { await c.query(upd(`"amountSatang" = 1`)); return ""; } catch (e) { return errMsg(e); } });
    ok(/AGENT_LEDGER_APPEND_ONLY/.test(msg), `ข้อความ: ${msg}`);
  });
  await st("L-3", "DELETE ⇒ 23001 (ร้าน ACTIVE · ไม่มี GUC)", async () => {
    needLedger();
    eq(await codes([`DELETE FROM "AgentLedgerEntry" WHERE id = '${ledgerId}'`]), ["23001"], "รหัส");
  });
  await st("L-4", "statementId: null → ค่า ได้ · เปลี่ยน (ใบเดิมไม่ VOID) ⇒ 23001 · ค่าเดิมซ้ำได้ · กลับ null ⇒ 23001", async () => {
    needLedger();
    eq(await codes([upd(`"statementId" = 'st1'`), upd(`"statementId" = 'st2'`), upd(`"statementId" = 'st1'`), upd(`"statementId" = NULL`)]), ["", "23001", "", "23001"], "รหัส");
  });
  await st("L-5", "settledAt · whtCertDocId · accountDocId: null → ค่า ได้ครั้งเดียว · เปลี่ยนซ้ำ ⇒ 23001 · พ่วงคอลัมน์อื่น ⇒ 23001", async () => {
    needLedger();
    eq(await codes([upd(`"settledAt" = now(), "whtCertDocId" = 'w1'`), upd(`"accountDocId" = 'doc1'`), upd(`"whtCertDocId" = 'w2'`), upd(`"accountDocId" = 'doc2'`), upd(`"settledAt" = now() + interval '1 day'`), upd(`"statementId" = 's9', "reason" = 'x'`)]),
      ["", "", "23001", "23001", "23001", "23001"], "รหัส");
  });
  await st("L-6", "ลบได้ใน tx ที่ `SET LOCAL shark.ledger_purge = 'on'` · ค่าไม่ค้างข้าม tx", async () => {
    needLedger();
    eq(await codes([`SET LOCAL shark.ledger_purge = 'on'`, `DELETE FROM "AgentLedgerEntry" WHERE id = '${ledgerId}'`]), ["", ""], "ลบใน tx ที่เปิด GUC");
    eq(await codes([`DELETE FROM "AgentLedgerEntry" WHERE id = '${ledgerId}'`]), ["23001"], "tx ถัดไป");
  });
  const prismaC = (): Rec => { const p = asRec(DB?.prisma); if (!p) throw new AssertFail("ไม่มี prisma ใน core/db"); return p; };
  const pDlg = (t: string): Rec => { const d = asRec(prismaC()[DELEGATE(t)]); if (!d) throw new AssertFail(`client ไม่มี ${DELEGATE(t)}`); return d; };
  const pErr = async (f: () => Promise<unknown>): Promise<string> => { try { await f(); return ""; } catch (e) { return /AGENT_LEDGER_APPEND_ONLY/.test(errMsg(e)) ? "APPEND_ONLY" : `อื่น:${errMsg(e).slice(0, 80)}`; } };
  await st("L-7", "ล้างร้านของแพลตฟอร์ม (platform/pdpa.ts · Prisma deleteMany ตาม tenantId): ร้าน ACTIVE ⇒ ปฏิเสธ · ร้าน PENDING_DELETE ⇒ ลบได้ทุกแถว", async () => {
    await needTable("AgentLedgerEntry");
    for (const i of [1, 2]) await ins("AgentLedgerEntry", { ...valid("AgentLedgerEntry", tP, uP), seq: i, idempotencyKey: `purge:${i}:${STAMP}` });
    const dm = pDlg("AgentLedgerEntry").deleteMany as AnyFn;
    eq(await pErr(() => dm.call(pDlg("AgentLedgerEntry"), { where: { tenantId: tP } }) as Promise<unknown>), "APPEND_ONLY", "ร้าน ACTIVE");
    await pool.query(`UPDATE "Tenant" SET status = 'PENDING_DELETE' WHERE id = $1`, [tP]);
    const r = asRec(await (dm.call(pDlg("AgentLedgerEntry"), { where: { tenantId: tP } }) as Promise<unknown>));
    eq(r?.count, 2, "ลบแถวของร้าน PENDING_DELETE");
  });
  await st("L-8", "ผ่าน Prisma client: create ได้ · update ยอด ⇒ ปฏิเสธ · ตั้ง statementId/accountDocId ครั้งแรกได้ · ตั้งซ้ำค่าอื่น ⇒ ปฏิเสธ · update ค่าเดิม (no-op) ได้", async () => {
    await needTable("AgentLedgerEntry");
    const d = pDlg("AgentLedgerEntry");
    const id = rid("ple");
    await (d.create as AnyFn).call(d, { data: { id, ...valid("AgentLedgerEntry", tA, uA), idempotencyKey: `prisma:${STAMP}` } });
    const u = (data: Rec) => pErr(() => (d.update as AnyFn).call(d, { where: { id }, data }) as Promise<unknown>);
    eq([await u({ amountSatang: 1 }), await u({ statementId: "stP1" }), await u({ accountDocId: "docP1" }), await u({ statementId: "stP2" }), await u({ accountDocId: "docP2" }), await u({ statementId: "stP1" }), await u({ kind: "CHARGE" })],
      ["APPEND_ONLY", "", "", "APPEND_ONLY", "APPEND_ONLY", "", ""], "ผล");
  });
  await st("L-9", "ใบแจ้งยอด VOID → ย้ายรายการไปใบใหม่งวดเดิม: ใบซ้ำงวด ⇒ 23505 · VOID ใบเดิม · ออกใบใหม่ · ย้าย statementId ได้ · ย้ายออกจากใบที่ไม่ VOID ⇒ 23001", async () => {
    needLedger();
    const a = rid("a"), s1 = rid("st1"), s2 = rid("st2"), e = rid("e");
    const r = await codes([["AgentStatement", stRowOf({ id: s1, agentAccountId: a, periodKey: "6911-2" })], ["AgentLedgerEntry", { ...valid("AgentLedgerEntry", tA, uA), id: e, agentAccountId: a, statementId: s1 }],
      ["AgentStatement", stRowOf({ agentAccountId: a, periodKey: "6911-2" })], `UPDATE "AgentStatement" SET status = 'VOID' WHERE id = '${s1}'`, ["AgentStatement", stRowOf({ id: s2, agentAccountId: a, periodKey: "6911-2" })],
      upd(`"statementId" = '${s2}'`, e), upd(`"statementId" = 'st-other'`, e), upd(`"statementId" = NULL`, e)]);
    eq(r, ["", "", "23505", "", "", "", "23001", "23001"], "รหัส");
  });
  await st("L-10", "ค่าคงที่กลาง (scripts/trips-agency-invariants.mts · มติ R6): สมุด+หัวสมุดตรง ⇒ ว่าง · หัวสมุดผิด ⇒ B2 · seq ขาด ⇒ B3 · ไม่มีหัวสมุด ⇒ B1 · ใบแจ้งยอดตรง ⇒ ว่าง · ผิด ⇒ เจอ", async () => {
    await needTable("AgentLedgerEntry");
    ok(INV, `โหลด trips-agency-invariants ไม่ได้: ${INVI.err}`);
    const bal = fnOf(INV, "agencyBalanceDrift", "invariants"), sd = fnOf(INV, "agencyStatementDrift", "invariants");
    const out = await inTx(async (c) => {
      const qf = (sql: string, p?: unknown[]) => c.query(sql, p);
      const a = rid("a"), b = rid("b"), s = rid("st");
      // ORACLE-EDIT L-10 (ผู้คุม 13 พ.ย.): ข้อสอบข้ออื่นทิ้งแถวสมุดของ tA ที่ไม่มีหัวสมุดไว้ ⇒ นับเฉพาะแถวของบัญชี/ใบแจ้งยอดที่ข้อนี้สร้าง
      const mine = (rows: unknown): Rec[] => (rows as Rec[]).filter((x) => { const t = JSON.stringify(x); return t.includes(a) || t.includes(b) || t.includes(s); });
      await ins("AgentBalance", { agentAccountId: a, tenantId: tA, balanceSatang: 700_000, lastSeq: 1 }, c);
      await ins("AgentLedgerEntry", { ...valid("AgentLedgerEntry", tA, uA), agentAccountId: a, seq: 1, amountSatang: 700_000, statementId: s }, c);
      await ins("AgentStatement", stRowOf({ id: s, agentAccountId: a, salesSatang: 700_000, passThroughSatang: 0, commissionSatang: 0, whtSatang: 0, cancelledSatang: 0, paidDuringPeriodSatang: 0 }), c);
      const r0 = [mine(await bal(qf, [tA])).length, mine(await sd(qf, [tA])).length];
      await c.query(`UPDATE "AgentBalance" SET "balanceSatang" = 1 WHERE "agentAccountId" = $1`, [a]);
      const r1 = mine(await bal(qf, [tA])).map((x) => x.rule);
      await c.query(`UPDATE "AgentBalance" SET "balanceSatang" = 1400000, "lastSeq" = 3 WHERE "agentAccountId" = $1`, [a]);
      await ins("AgentLedgerEntry", { ...valid("AgentLedgerEntry", tA, uA), agentAccountId: a, seq: 3, amountSatang: 700_000, statementId: s }, c);
      const r2 = mine(await bal(qf, [tA])).map((x) => x.rule);
      await ins("AgentLedgerEntry", { ...valid("AgentLedgerEntry", tA, uA), agentAccountId: b, seq: 1 }, c);
      const r3 = mine(await bal(qf, [tA])).map((x) => x.rule).sort();
      const r4 = mine(await sd(qf, [tA])).length;
      return [r0, r1, r2, r3, r4];
    });
    eq(out, [[0, 0], ["B2_BALANCE_NE_SUM"], ["B3_SEQ"], ["B1_NO_BALANCE_ROW", "B3_SEQ"], 1], "ผล");
  });
  await st("L-11", "schema/ฟังก์ชัน: AgentLedgerEntry ไม่มี updatedAt และไม่มีคอลัมน์ json · ฟังก์ชันเทียบทั้งแถว (IS DISTINCT FROM OLD)", async () => {
    const ag = stripComments(read("prisma/schema/agency.prisma"));
    const m = /model AgentLedgerEntry \{([\s\S]*?)\n\}/.exec(ag);
    ok(m, "ไม่มี model AgentLedgerEntry");
    ok(!/updatedAt/.test(m?.[1] ?? "") && !/\bJson\b/.test(m?.[1] ?? ""), "มี updatedAt/Json");
    ok(/IS DISTINCT FROM OLD/i.test(fnBodies), "ฟังก์ชันไม่เทียบทั้งแถว");
  });

  // ═══════════════ S. scope · client · ไฟล์ · ขอบเขต ═══════════════
  console.log("\n── S: scope · client · ไฟล์ · ขอบเขต ──");
  const AG_DIR = "src/lib/modules/agency";
  await st("S-1", `scope.ts: ${NEW_TABLES.length} โมเดล · global 5 (มีเหตุผลไทย) · tenant 22 · unit 4 (ตรงใบสั่ง §2.6)`, () => {
    const scopeOf = fnOf(SCOPE, "scopeOf", "core/scope");
    const bad: string[] = [];
    for (const [t, s] of Object.entries(TABLES)) {
      let d: Rec | null = null;
      try { d = asRec(scopeOf(t)); } catch { d = null; }
      if (!d || d.axis !== s.axis) bad.push(`${t}=${String(d?.axis ?? "ไม่ลงทะเบียน")}`);
      else if (s.axis === "global" && !THAI.test(String(d.why ?? ""))) bad.push(`${t} ไม่มีเหตุผลไทย`);
    }
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 5).join(", ")}`);
  });
  await st("S-2", "Prisma client รู้จักโมเดลใหม่ทั้งหมด + คอลัมน์ที่เพิ่มบน TripBooking/TripMoneyEvent/TripPickupZone/SellBasket", () => {
    const pr = asRec(CLIENT?.Prisma);
    const names = asRec(pr?.ModelName) ?? {};
    const miss = NEW_TABLES.filter((t) => !(t in names));
    ok(miss.length === 0, `client ไม่มี ${miss.length}: ${miss.slice(0, 5).join(", ")}`);
    const fmiss = Object.entries(ADDED_COLS).flatMap(([t, s]) => parseCols(s).filter((c) => !(c.name in (asRec(pr?.[`${t}ScalarFieldEnum`]) ?? {}))).map((c) => `${t}.${c.name}`));
    ok(fmiss.length === 0, `client ไม่มี ${fmiss.join(", ")}`);
  });
  await st("S-3", "fitness F1 (static): ทุก model ใน prisma/schema ลงทะเบียน scope.ts · ไม่มีชื่อตกค้าง", () => {
    const models = new Set<string>();
    for (const f of readdirSync(join(ROOT, "prisma/schema")).filter((x) => x.endsWith(".prisma"))) for (const m of read(`prisma/schema/${f}`).matchAll(/^model\s+(\w+)\s*\{/gm)) models.add(m[1]);
    const reg = new Set([...read("src/lib/core/scope.ts").matchAll(/^\s{2}(\w+):\s*(?:g\(|tenant|unit|sys\(|\{)/gm)].map((m) => m[1]));
    const miss = [...models].filter((m) => !reg.has(m)), extra = [...reg].filter((m) => !models.has(m));
    ok(NEW_TABLES.every((t) => models.has(t)), "schema ยังไม่มีโมเดลใหม่");
    ok(miss.length === 0 && extra.length === 0, `ไม่ลงทะเบียน: ${miss.join(", ")} · ตกค้าง: ${extra.join(", ")}`);
  });
  await st("S-4", "agency/index.ts facade: ไม่มี `export *` · ส่งออกครบ §5 · identity-core.ts ไม่มี import ค่า", () => {
    const idx = read(`${AG_DIR}/index.ts`);
    ok(idx, "ยังไม่มี agency/index.ts");
    ok(!/export\s*\*/.test(stripComments(idx)), "มี export *");
    const want = ["AGENT_ROLES", "AGENT_LOGIN_KINDS", "AGENT_PUBLIC_CODE_ALPHABET", "AGENT_PUBLIC_CODE_RE", "makeAgentPublicCode", "isAgentPublicCode", "normalizeAgentLogin", "normalizeJuristicTaxId", "AGENT_IDENTITY_PUBLIC_FIELDS",
      "agentTaxIdHash", "createAgentIdentity", "findAgentIdentityByCode", "agentUserByLogin", "updateAgentIdentity", "setAgentIdentityTaxId", "verifyAgentIdentityTaxId", "addAgentLogin", "listAgentAccountsOfUser"];
    const miss = want.filter((n) => !(n in (AG ?? {})));
    ok(miss.length === 0, `facade ไม่มี: ${miss.join(", ")} (${AGI.err.slice(0, 60)})`);
    const core = stripComments(read(`${AG_DIR}/identity-core.ts`));
    ok(core, "ยังไม่มี identity-core.ts");
    const vals = [...core.matchAll(/^\s*import\s+(?!type\b)[^;]*from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
    ok(vals.length === 0, `import ค่า: ${vals.join(", ")}`);
  });
  await st("S-5", "โมดูล agency: `prisma` ดิบเฉพาะ entry.ts · ไม่ import โมดูลอื่น (`@/lib/modules/*`) · ไฟล์อื่นไม่แตะโมเดล global", () => {
    const files = existsSync(join(ROOT, AG_DIR)) ? readdirSync(join(ROOT, AG_DIR)).filter((f) => f.endsWith(".ts")) : [];
    ok(files.includes("entry.ts"), "ยังไม่มี entry.ts");
    const raw = files.filter((f) => /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(read(`${AG_DIR}/${f}`)));
    eq(raw, ["entry.ts"], "ไฟล์ที่ import prisma");
    const cross = files.filter((f) => /from\s+["']@\/lib\/modules\/(?!agency\b)/.test(stripComments(read(`${AG_DIR}/${f}`))));
    ok(cross.length === 0, `import ข้ามโมดูล: ${cross.join(", ")}`);
    const glob = files.filter((f) => f !== "entry.ts" && /\.(agentIdentity|agentUser|agentLogin|agentSession|agentLoginCode)\b/.test(stripComments(read(`${AG_DIR}/${f}`))));
    ok(glob.length === 0, `แตะตาราง global นอก entry.ts: ${glob.join(", ")}`);
  });
  await st("S-6", "ไม่มี `any` (ชนิด/แคสต์) ในไฟล์ src ที่ใบนี้เพิ่ม/แก้", () => {
    const src = changedSinceBase(["src"]).filter((f) => /\.(ts|tsx)$/.test(f) && !sameAsSession(f));
    ok(src.length > 0, "ยังไม่มีไฟล์ src ที่เปลี่ยน");
    const bad = src.filter((f) => /(:\s*any\b|\bas\s+any\b|<any>|any\[\])/.test(stripComments(read(f))));
    ok(bad.length === 0, `มี any: ${bad.join(", ")}`);
  });
  await st("S-7", "permissions: agency.settings.edit + agency.settings.money ป้ายไทย (โมดูล agency)", () => {
    const P0 = (PERM?.PERMISSIONS as Rec[] | undefined) ?? [];
    const want = ["agency.settings.edit", "agency.settings.money"];
    const bad = want.filter((k) => { const p = P0.find((x) => x.key === k || x.action === k); return !p || !THAI.test(String(p.label ?? p.labelTh ?? "")); });
    ok(bad.length === 0, `ไม่มี/ไม่มีป้ายไทย: ${bad.join(", ")} (${P0.length} สิทธิ์)`);
  });
  await st("S-8", "settings: index.ts import ./defs/agency · service.ts SUPPORTED_SCOPES มี AGENT_TIER AGENT (VESSEL ยังไม่มี) + locate AgentTier/AgentAccount · ลบบรรทัด ≤ 2", () => {
    ok(/import\s+["']\.\/defs\/agency["']/.test(read("src/lib/core/settings/index.ts")), "index.ts ยังไม่ import defs/agency");
    const svc = stripComments(read("src/lib/core/settings/service.ts"));
    const sup = /const SUPPORTED_SCOPES[^;]*;/.exec(svc)?.[0] ?? "";
    ok(/"AGENT_TIER"/.test(sup) && /"AGENT"/.test(sup) && !/"VESSEL"/.test(sup), `SUPPORTED_SCOPES: ${sup.slice(0, 160)}`);
    ok(/agentTier\.findMany/.test(svc) && /agentAccount\.findMany/.test(svc), "ยังไม่มี locate AgentTier/AgentAccount");
    const ns = git(["diff", "--numstat", BASE_SHA, "--", "src/lib/core/settings/service.ts"]).trim().split("\t");
    ok(Number(ns[1] ?? 0) <= 2, `service.ts ลบ ${ns[1]} บรรทัด`);
  });
  const ALLOWED = new Set(["prisma/schema/agency.prisma", "prisma/schema/supplier.prisma", "prisma/schema/trips.prisma", "prisma/schema/sellable.prisma", "src/lib/core/scope.ts", "src/lib/core/permissions.ts",
    "src/lib/core/settings/index.ts", "src/lib/core/settings/service.ts", "src/lib/core/settings/defs/agency.ts", `${AG_DIR}/index.ts`, `${AG_DIR}/entry.ts`, `${AG_DIR}/identity-core.ts`,
    "scripts/fitness.mts", "scripts/qc-trips-a1.1.mts", "scripts/trips-agency-invariants.mts"]);
  await st("S-9", `ขอบเขต (เทียบ BASE ${BASE_SHA} · ไม่นับไฟล์ที่ตรงกับ session/trips · ไม่นับ ledger/): แตะได้เฉพาะไฟล์ใบสั่ง §1 + โฟลเดอร์ migration ใหม่`, () => {
    const ch = changedSinceBase(["."]).filter((f) => !f.startsWith("ledger/") && !sameAsSession(f));
    const out = ch.filter((f) => !ALLOWED.has(f) && !(migDir && f === `prisma/migrations/${migDir}/migration.sql`));
    ok(out.length === 0, `นอกขอบเขต ${out.length}: ${out.slice(0, 6).join(", ")}`);
    for (const f of ["scripts/qc-trips-a1.1.mts", "scripts/trips-agency-invariants.mts"]) if (hasRef("session/trips") && git(["ls-tree", "--name-only", "session/trips", f]).trim()) ok(git(["show", `session/trips:${f}`]) === read(f), `ไฟล์ข้อสอบถูกแก้: ${f}`);
  });
  await st("S-10", "ไม่แตะไฟล์ต้องห้าม: โมดูล trips/ticket/pos/hotel/rooms/dorm/booking/queue/account/party/crm/member · settings types/registry/form/legal/defs อื่น · components · app · fitness · with-gate-lock · ข้อสอบเดิม", () => {
    const forb = ["src/lib/modules/trips", "src/lib/modules/ticket", "src/lib/modules/pos", "src/lib/modules/hotel", "src/lib/modules/rooms", "src/lib/modules/dorm", "src/lib/modules/booking", "src/lib/modules/queue",
      "src/lib/modules/account", "src/lib/modules/party", "src/lib/modules/crm", "src/lib/modules/member", "src/lib/core/settings/types.ts", "src/lib/core/settings/registry.ts", "src/lib/core/settings/form.ts",
      "src/lib/core/settings/template.ts", "src/lib/core/settings/actions.ts", "src/lib/core/settings/legal", "src/lib/core/settings/defs/trips.ts", "src/lib/core/settings/defs/rooms.ts", "src/lib/core/settings/defs/booking.ts",
      "src/components", "src/app", "src/lib/platform", "scripts/with-gate-lock.sh", "scripts/trips-fixture.mts", "scripts/seed-trips-qc.mts",
      ...readdirSync(join(ROOT, "scripts")).filter((f) => /^qc-trips-(?!a1\.1).*\.mts$/.test(f)).map((f) => `scripts/${f}`)];
    const t = changedSinceBase(forb).filter((f) => !sameAsSession(f));
    ok(t.length === 0, `แตะ: ${t.slice(0, 6).join(", ")}`);
  });
  await st("S-11", "ผู้กระทำ AGENT ยังถูกปิดในเส้นทางขาย/จอง (T0.4/T0.6): capacity.ts + state.ts คง `AGENCY_NOT_ENABLED` · โมดูล trips ไม่เปลี่ยน", () => {
    ok(/kind === "AGENT"\) return sellFail\("FORBIDDEN", \{ reason: "AGENCY_NOT_ENABLED" \}\)/.test(read("src/lib/modules/trips/capacity.ts")), "capacity.ts ไม่ปิด AGENT");
    ok(/actorKind === "AGENT"/.test(read("src/lib/modules/trips/state.ts")), "state.ts ไม่ปิด AGENT");
    eq(changedSinceBase(["src/lib/modules/trips"]).filter((f) => !sameAsSession(f)), [], "ไฟล์ trips ที่เปลี่ยน");
  });
  await st("S-12", "defs/agency.ts บริสุทธิ์: import ได้แค่ zod · ../registry · import type", () => {
    const s = stripComments(read("src/lib/core/settings/defs/agency.ts"));
    ok(s, "ยังไม่มี defs/agency.ts");
    const vals = [...s.matchAll(/^\s*import\s+(?!type\b)[^;]*from\s+["']([^"']+)["']/gm)].map((m) => m[1]).filter((x) => x !== "zod" && x !== "../registry");
    ok(vals.length === 0, `import ต้องห้าม: ${vals.join(", ")}`);
  });

  await st("S-13", "fitness F17.1 (มติ R5): บล็อกใหม่ใน scripts/fitness.mts ระบุทางเข้าที่อนุญาตตรงตัว 2 ไฟล์ + 5 โมเดล global · แก้ fitness.mts แบบเพิ่มอย่างเดียว (ลบ 0 บรรทัด)", () => {
    const f = read("scripts/fitness.mts");
    ok(/"F17\.1"/.test(f), "ยังไม่มี F17.1");
    const blk = f.slice(Math.max(0, f.indexOf('"F17.1"') - 3000), f.indexOf('"F17.1"') + 1500);
    const miss = ["src/lib/modules/agency/entry.ts", "src/lib/platform/agent-auth.ts", "agentIdentity", "agentUser", "agentLogin", "agentLoginCode", "agentSession", "AgentIdentity", "AgentSession"].filter((x) => !blk.includes(x));
    ok(miss.length === 0, `บล็อก F17.1 ไม่มี: ${miss.join(", ")}`);
    if (!sameAsSession("scripts/fitness.mts")) {
      const ns = git(["diff", "--numstat", BASE_SHA, "--", "scripts/fitness.mts"]).trim().split("\t");
      eq(Number(ns[1] ?? 0), 0, "บรรทัดที่ลบใน fitness.mts (BASELINE = ORACLE-EDIT ผู้คุม)");
    }
  });

  // ═══════════════ R. ทะเบียน agency ═══════════════
  console.log("\n── R: ทะเบียนค่าตั้ง agency ──");
  const typeWord = (s: string) => (/^\s*`?([a-z]+)/.exec(s.replace(/`/g, ""))?.[1] ?? "");
  await st("R-1", "doc-sync: ชุดคีย์ + ชั้น + ชนิด ที่ parse จาก TRIPS-DEFAULTS (§2 A1–A37 + ภาคผนวก ก agency.* ยกเว้น X27 agency.msg) = รายการฝัง", () => {
    const md = read("ledger/TRIPS-DEFAULTS.md");
    const got: Record<string, { chain: string[]; type: string }> = {};
    for (const line of md.split("\n")) {
      const m = /^\|\s*(A\d+|X\d+)\s*\|/.exec(line);
      if (!m) continue;
      const cells = line.split(/(?<!\\)\|/).map((c) => c.trim());
      const keys = [...(cells[2] ?? "").matchAll(/`(agency\.[^`]+)`/g)].map((x) => x[1]).filter((k) => !k.startsWith("agency.msg"));
      const chain = [...(cells[6] ?? "").replace(/\([^)]*\)/g, "").matchAll(/\b(SHOP|PRODUCT|DEPARTURE|AGENT_TIER|AGENT|VESSEL)\b/g)].map((x) => (x[1] === "SHOP" ? U : x[1]));
      for (const k of keys) got[k] = { chain, type: typeWord(cells[4] ?? "") };
    }
    ok(Object.keys(got).length >= 38, `parse ได้แค่ ${Object.keys(got).length} คีย์ (positive control ของ parser)`);
    const want: Record<string, { chain: string[]; type: string }> = Object.fromEntries(EXPECT.map((e) => [e.key, { chain: e.chain, type: e.type }]));
    const diff = [...new Set([...Object.keys(got), ...Object.keys(want)])].filter((k) => !isDeepStrictEqual(got[k], want[k])).map((k) => `${k}: doc ${fmt(got[k])} ข้อสอบ ${fmt(want[k])}`);
    ok(diff.length === 0, `ไม่ตรง ${diff.length}: ${diff.slice(0, 3).join(" · ")}`);
  });
  await st("R-2", `ทุกคีย์ที่คาด (${EXPECT.length}) ลงทะเบียน domain agency · ไม่มีคีย์ agency เกิน (ไม่มี agency.msg.* ในใบนี้)`, () => {
    const regs = ((fnOf(needSet(), "listDefs", "settings")("agency") as unknown[]) ?? []).map((d) => String(asRec(d)?.key));
    const miss = EXPECT.filter((e) => !regs.includes(e.key)).map((e) => e.key);
    const extra = regs.filter((k) => !EXPECT.some((e) => e.key === k));
    ok(miss.length === 0, `ขาด ${miss.length}/${EXPECT.length}: ${miss.slice(0, 4).join(", ")}`);
    ok(extra.length === 0, `เกิน: ${extra.join(", ")}`);
  });
  await st("R-3", "ชนิด (type) ตรงทุกคีย์ · A7 A25 รับ null · คีย์อื่นไม่รับ null", () => {
    const bad: string[] = [];
    for (const e of EXPECT) {
      const d = getDef(e.key);
      if (!d) { bad.push(`${e.key}(ไม่มี)`); continue; }
      if (d.type !== e.type) bad.push(`${e.key}=${String(d.type)}`);
      if (parse(e.key, null) !== !!e.nullable) bad.push(`${e.key} null=${!e.nullable}`);
    }
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 5).join(", ")}`);
  });
  await st("R-4", "ชั้น (chain) ตรง TRIPS-DEFAULTS ทุกคีย์ (SHOP = UNIT)", () => {
    const bad = EXPECT.filter((e) => !isDeepStrictEqual(getDef(e.key)?.chain, e.chain)).map((e) => `${e.key}=${fmt(getDef(e.key)?.chain)}`);
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 4).join(", ")}`);
  });
  await st("R-5", "ค่าเริ่มต่อแม่แบบ (DS/DT/LA/AT) ตรงรายการฝัง · _fallback = DIVE_SHOP", () => {
    const bad: string[] = [];
    for (const [key, x] of Object.entries(DEF)) {
      const d = getDef(key);
      if (!d) { bad.push(`${key}(ไม่มี)`); continue; }
      const dv = asRec(d.defaults) ?? {};
      const want: Record<string, unknown> = { DIVE_SHOP: x.v[0], DAY_TOUR: x.v[1], LIVEABOARD: x.v[2], ATTRACTION: "at" in x ? x.at : x.v[1], _fallback: x.v[0] };
      for (const [t, w] of Object.entries(want)) if (!isDeepStrictEqual(dv[t], w)) bad.push(`${key}.${t}=${fmt(dv[t])}`);
    }
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 4).join(" · ")}`);
  });
  await st("R-6", "schema: ตัวเลือก enum ทุกตัวผ่าน · ค่าแปลกตก · A12 '14' ตก · A13 −1 ตก · A18 366 ตก · ตารางมีช่องเกิน (strict) ตก", () => {
    const bad: string[] = [];
    for (const [code, opts] of Object.entries(ENUM_OPTS)) {
      for (const o of opts) if (!parse(KEY(code), o)) bad.push(`${code}:${o} ไม่ผ่าน`);
      if (parse(KEY(code), "NOPE_X")) bad.push(`${code}:NOPE_X ผ่าน`);
    }
    if (parse(KEY("A12"), "14") || parse(KEY("A12"), 15)) bad.push("A12 รับ 14/ตัวเลข");
    if (parse(KEY("A13"), -1)) bad.push("A13 รับ −1");
    if (!parse(KEY("A13"), 3_000_000_000) || parse(KEY("A13"), 100_000_000_001)) bad.push("A13 ต้องรับเกิน int4 (3,000,000,000) และไม่เกิน 100,000,000,000 (มติ R4)");
    if (parse(KEY("A18"), 366)) bad.push("A18 รับ 366");
    if (parse(KEY("A17"), { tourSeats: 20, liveaboardCabins: 2, extra: 1 })) bad.push("A17 ไม่ strict");
    if (parse(KEY("A26"), { ...RULE_BY_PAYEE, JURISTIC: { ...RULE_BY_PAYEE.JURISTIC, TH_JURISTIC: W("FLAT", 20_000, "PND53", "PER_PAYMENT") } })) bad.push("A26 รับ rateBp 20000");
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 5).join(", ")}`);
  });
  await st("R-7", "แม่แบบ agency: DIVE_SHOP DAY_TOUR LIVEABOARD ATTRACTION · version 1 · ป้ายไทย", () => {
    const T0 = (asRec(needSet().TEMPLATES)?.agency as Rec[] | undefined) ?? [];
    eq(T0.map((t) => t.key).sort(), [...TPLS].sort(), "แม่แบบ");
    ok(T0.every((t) => t.version === 1 && THAI.test(String(t.labelTh))), "version/ป้าย");
  });
  await st("R-8", "unitTypes ['TRIPS','TICKET'] ทุก def · group = ส่วนที่ 2 ของคีย์ · ป้ายกลุ่มไทยครบ 12 กลุ่ม", () => {
    const bad: string[] = [];
    for (const e of EXPECT) {
      const d = getDef(e.key);
      if (!d) { bad.push(`${e.key}(ไม่มี)`); continue; }
      if (!isDeepStrictEqual(d.unitTypes, ["TRIPS", "TICKET"])) bad.push(`${e.key}.unitTypes=${fmt(d.unitTypes)}`);
      if (d.group !== e.key.split(".")[1]) bad.push(`${e.key}.group`);
    }
    const gl = fnOf(needSet(), "groupLabelTh", "settings");
    for (const g of GROUPS) if (!THAI.test(String(gl("agency", g) ?? ""))) bad.push(`ป้ายกลุ่ม ${g}`);
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 5).join(", ")}`);
  });
  await st("R-9", "sensitivity ตามกลุ่ม (price/money/hold/quota/comm MONEY + A1 · wht LEGAL · privacy PRIVACY+ownerOnly) · editPermission (เงิน = agency.settings.money)", () => {
    const bad: string[] = [];
    for (const e of EXPECT) {
      const d = getDef(e.key);
      if (!d) { bad.push(`${e.key}(ไม่มี)`); continue; }
      const s = sensOf(e.key);
      if ((d.sensitivity ?? undefined) !== s) bad.push(`${e.key}.sens=${String(d.sensitivity)}`);
      const perm = s === "MONEY" ? "agency.settings.money" : "agency.settings.edit";
      if (s !== "LEGAL" && d.editPermission !== perm) bad.push(`${e.key}.perm=${String(d.editPermission)}`);
      if (s === "LEGAL" && !String(d.editPermission).startsWith("agency.settings.")) bad.push(`${e.key}.perm`);
      if (s === "PRIVACY" && d.ownerOnly !== true) bad.push(`${e.key}.ownerOnly`);
    }
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 5).join(", ")}`);
  });
  await st("R-10", "ซ่อน PHASE_2 = A3 เท่านั้น · effectiveDated = A26 A27 A28 เท่านั้น · ไม่มี percentScale", () => {
    const bad: string[] = [];
    for (const e of EXPECT) {
      const d = getDef(e.key);
      if (!d) { bad.push(`${e.key}(ไม่มี)`); continue; }
      if ((d.hiddenUntil === "PHASE_2") !== HIDDEN.includes(e.key)) bad.push(`${e.key}.hidden=${String(d.hiddenUntil)}`);
      if ((d.effectiveDated === true) !== EFFECTIVE.includes(e.key)) bad.push(`${e.key}.effectiveDated`);
      if (d.percentScale !== undefined) bad.push(`${e.key}.percentScale`);
    }
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 5).join(", ")}`);
  });
  await st("R-11", `snapshot "agency.booking" = CC §N.3 ตรงตัว (${SNAP_AGENCY.length} คีย์)`, () => {
    const got = ((asRec(needSet().SNAPSHOT_KEYS)?.["agency.booking"] as string[] | undefined) ?? []).slice().sort();
    eq(got, [...SNAP_AGENCY].sort(), "คีย์ snapshot");
  });
  await st("R-12", "reviewHint: ACCOUNTANT 8 คีย์ (A5 A6 A26–A30 X26) · AUTHORITY A37 'กรมการท่องเที่ยว' · คีย์อื่นไม่มีป้าย", () => {
    const bad: string[] = [];
    for (const e of EXPECT) {
      const d = getDef(e.key);
      if (!d) { bad.push(`${e.key}(ไม่มี)`); continue; }
      const want = ACCOUNTANT.includes(e.key) ? "ACCOUNTANT" : e.code === "A37" ? "AUTHORITY" : undefined;
      if (d.reviewHint !== want) bad.push(`${e.key}=${String(d.reviewHint)}`);
      if (e.code === "A37" && d.reviewAuthorityTh !== "กรมการท่องเที่ยว") bad.push(`A37.reviewAuthorityTh=${String(d.reviewAuthorityTh)}`);
    }
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 5).join(", ")}`);
  });
  await st("R-13", "legal ต่อคีย์ตรงใบสั่ง §4 (6 คีย์: A5 W13 · A26 W07 W09 · A27 W43 · A29/A30 W44 · A34 W34) · คีย์อื่นไม่มี legal", () => {
    const bad: string[] = [];
    for (const e of EXPECT) {
      const d = getDef(e.key);
      if (!d) { bad.push(`${e.key}(ไม่มี)`); continue; }
      const got = ((d.legal as string[] | undefined) ?? []).slice().sort();
      if (!isDeepStrictEqual(got, (LEGAL_MAP[e.key] ?? []).slice().sort())) bad.push(`${e.key}=${fmt(got)}`);
    }
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 5).join(", ")}`);
  });
  await st("R-14", "ป้ายแสดงผล: enum ทุกคีย์มี enumLabelsTh ไทยครบทุกตัวเลือก (ไม่ใช่ค่าดิบ) · ทุกคีย์ labelTh ไทย", () => {
    const bad: string[] = [];
    for (const e of EXPECT) {
      const d = getDef(e.key);
      if (!d) { bad.push(`${e.key}(ไม่มี)`); continue; }
      if (!THAI.test(String(d.labelTh))) bad.push(`${e.key}.labelTh`);
      if (e.type !== "enum") continue;
      const lab = asRec(d.enumLabelsTh) ?? {};
      for (const o of ENUM_OPTS[e.code] ?? []) if (!THAI.test(String(lab[o] ?? "")) && !/^\d+ วัน$/.test(String(lab[o] ?? ""))) bad.push(`${e.code}.${o}`);
    }
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 6).join(", ")}`);
  });
  await st("R-15", "ค่าที่ปิดในรุ่นแรก: A5 AGENT_RESELLS · A22 BOOKING_CURRENCY ไม่ผ่าน schema · helpTh บอก 'ยังไม่เปิดใช้ในรุ่นนี้'", () => {
    ok(!parse(KEY("A5"), "AGENT_RESELLS"), "A5 รับ AGENT_RESELLS");
    ok(!parse(KEY("A22"), "BOOKING_CURRENCY"), "A22 รับ BOOKING_CURRENCY");
    ok([KEY("A5"), KEY("A22")].every((k) => /ยังไม่เปิดใช้ในรุ่นนี้/.test(String(needDef(k).helpTh ?? ""))), "helpTh ของ A5/A22");
  });
  await st("R-16", "legal: ค่าเริ่มทุกคีย์ที่มี legal ⇒ OK · ค่าที่ควรเตือน ⇒ WARN รหัสตรง (W07 W09 W43 W44×2 W34) ไม่มี BLOCK", () => {
    const lio = fnOf(needSet(), "legalInputsOf", "settings");
    const evalT = fnOf(TOUR, "evaluateTourRule", "th-tour-2569");
    const get = (k: string) => asRec(getDef(k)?.defaults)?.DIVE_SHOP;
    const run = (key: string, v: unknown) => ((lio(needDef(key), v, get) as Rec[]) ?? []).map((x) => asRec(evalT(String(x.ruleId), x.input)) ?? {}).map((r) => `${String(r.level)}:${String(r.code)}`);
    const bad: string[] = [];
    for (const key of Object.keys(LEGAL_MAP)) { const r = run(key, get(key)); if (r.some((x) => !x.startsWith("OK"))) bad.push(`${key} ค่าเริ่ม ${r.join(",")}`); }
    const tp = (o: Rec) => ({ ...RULE_BY_PAYEE, JURISTIC: { ...RULE_BY_PAYEE.JURISTIC, TH_PERSON: o } });
    const cases: [string, unknown, string][] = [
      [KEY("A26"), tp(W("FLAT", 300, "PND3", "PER_PAYMENT")), "W07"], [KEY("A26"), { ...RULE_BY_PAYEE, INDIVIDUAL: { ...RULE_BY_PAYEE.INDIVIDUAL, TH_JURISTIC: W("FLAT", 300, "PND53", "PER_PAYMENT") } }, "W09"],
      [KEY("A27"), { amountSatang: 100_000, appliesTo: { TH_JURISTIC: true, TH_FOUNDATION: false }, continuousContract: "PER_CONTRACT_TOTAL" }, "W43"],
      [KEY("A29"), false, "W44"], [KEY("A30"), "AGENT_ON_BEHALF", "W44"], [KEY("A34"), true, "W34"],
    ];
    for (const [key, v, code] of cases) { const r = run(key, v); if (!r.includes(`WARN:${code}`) || r.some((x) => x.startsWith("BLOCK"))) bad.push(`${key}→${r.join(",")} ต้องมี WARN:${code}`); }
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 4).join(" · ")}`);
  });
  await st("R-17", "tableTh ครอบทุกช่องของค่าตาราง (ทุกชั้น): ป้ายไทย · ช่องข้อความแบบตัวเลือก = enum + options ไทยครบ · ช่อง null มี nullTh (ห้ามชื่อช่องดิบบนจอ · T1.1)", () => {
    const bad: string[] = [];
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    const walk = (key: string, v: unknown, spec: Rec | null, path: string) => {
      const o = asRec(v);
      if (!o) return;
      const fields = asRec(spec?.fields) ?? {};
      for (const [k, x] of Object.entries(o)) {
        const cs = asRec(fields[k]);
        if (!cs || !THAI.test(String(cs.labelTh ?? ""))) { bad.push(`${key}:${path}${k}(ไม่มีป้าย)`); continue; }
        if (asRec(x)) { walk(key, x, cs, `${path}${k}.`); continue; }
        if (typeof x === "string" && !ymd.test(x)) {
          const opts = asRec(cs.options) ?? {};
          if (cs.kind !== "enum" || !THAI.test(String(opts[x] ?? ""))) bad.push(`${key}:${path}${k}(enum ${x})`);
        }
        if (x === null && !THAI.test(String(cs.nullTh ?? ""))) bad.push(`${key}:${path}${k}(nullTh)`);
      }
    };
    for (const e of EXPECT.filter((x) => x.type === "table")) {
      const d = getDef(e.key);
      if (!d) { bad.push(`${e.key}(ไม่มี)`); continue; }
      const spec = asRec(d.tableTh);
      if (!spec) { bad.push(`${e.key}(ไม่มี tableTh)`); continue; }
      for (const t of TPLS) walk(e.code, asRec(d.defaults)?.[t], spec, "");
    }
    // ค่าที่ควรเตือนของ A26 ใช้ตัวเลือกที่ไม่อยู่ในค่าเริ่ม (PND3 · FLAT ของบุคคล) — ตัวเลือกต้องครบทั้ง schema ไม่ใช่แค่ค่าเริ่ม
    const tp = asRec(asRec(asRec(asRec(asRec(getDef(KEY("A26"))?.tableTh)?.fields)?.JURISTIC)?.fields)?.TH_PERSON);
    const fo = asRec(asRec(tp?.fields)?.form)?.options, mo = asRec(asRec(tp?.fields)?.mode)?.options;
    if (!asRec(fo) || !["PND53", "PND3", "PND1", "PND54", "NONE"].every((x) => THAI.test(String(asRec(fo)?.[x] ?? "")) || /ภ\.ง\.ด/.test(String(asRec(fo)?.[x] ?? "")))) bad.push("A26 form options ไม่ครบ");
    if (!asRec(mo) || !["FLAT", "M50_1", "NONE"].every((x) => THAI.test(String(asRec(mo)?.[x] ?? "")))) bad.push("A26 mode options ไม่ครบ");
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 6).join(", ")}`);
  });
  await st("R-18", "ค่าเริ่ม A1 ตรงฟิกซ์เจอร์จอ 10 (`AGENCY_TIERS` bp ÷ 100 · promoteAt12mSatang · payment CREDIT/IMMEDIATE) · ไม่มีช่อง creditTermDays (มติ R3)", () => {
    const T0 = asRec(FX?.AGENCY_TIERS);
    ok(T0, "โหลด scripts/trips-fixture.mts ไม่ได้");
    const d = asRec(asRec(needDef(KEY("A1")).defaults)?.DIVE_SHOP) ?? {};
    const bad: string[] = [];
    for (const t of ["A", "B", "C"]) {
      const f = asRec(T0?.[t]) ?? {}, v = asRec(d[t]) ?? {};
      if (v.tourPct !== Number(f.tourBp) / 100 || v.laPct !== Number(f.liveaboardBp) / 100 || v.ticketNetDiscountPct !== Number(f.ticketNetDiscountBp) / 100 || v.promoteAt !== f.promoteAt12mSatang
        || v.payDefault !== (f.payment === "CREDIT" ? "CREDIT" : "PAY_NOW") || "creditTermDays" in v) bad.push(`${t}=${fmt(v)}`);
    }
    ok(bad.length === 0, bad.join(" · "));
    ok(!parse(KEY("A1"), { ...TIER_TABLE, A: { ...TIER_TABLE.A, creditTermDays: 30 } }), "A1 ยังรับ creditTermDays (strict)");
  });
  await st("R-19", "เอกสารแก้ตามใบสั่ง §4.3 (มติ R3): TRIPS-DEFAULTS แถว A1 A12 A22 A25 A26 A27 X27 · สัญญามีชื่อ/กติกาใหม่", () => {
    const td = read("ledger/TRIPS-DEFAULTS.md"), cc = read("ledger/TRIPS-CORE-CONTRACT.md");
    const row = (code: string) => td.split("\n").find((l) => new RegExp(`^\\|\\s*${code}\\s*\\|`).test(l)) ?? "";
    const need: [string, string][] = [["A1", "A11/A12"], ["A12", '"15"'], ["A22", "รุ่นแรก"], ["A25", "null"], ["A26", "TH_FOUNDATION"], ["A27", "TH_FOUNDATION: bool"], ["X27", "A2.2"]];
    const miss = need.filter(([c, m]) => !row(c).includes(m)).map(([c, m]) => `TD ${c}∌${m}`);
    for (const m of ["TripSupplierCost", "AgentCommissionPayout", "AgentWebhookDelivery", "AgentAllotmentBlock", "INTEGRATIONS_CREDENTIALS_KEY", "otherSatang", "PENDING_DELETE", "L-58"]) if (!cc.includes(m)) miss.push(`CC∌${m}`);
    ok(miss.length === 0, `${miss.length}: ${miss.join(" · ")}`);
  });

  // ═══════════════ แถวเอเจนซี่สำหรับ RS/WS/X1/AI ═══════════════
  const tierA = rid("tier"), accA = rid("accA"), accB = rid("accB"), identA = rid("idA");
  let agRowsErr = "";
  try {
    await ins("AgentIdentity", { id: identA, displayName: `${QC_MARK} PTD ${STAMP}`, publicCode: randCode() });
    await ins("AgentTier", { id: tierA, tenantId: tA, code: "B", name: "ระดับ B" });
    await ins("AgentAccount", { ...valid("AgentAccount", tA, uA), id: accA, identityId: identA, tierId: tierA, code: "PTD" });
    await ins("AgentAccount", { ...valid("AgentAccount", tB, uB), id: accB, identityId: identA, code: "PTD" });
  } catch (e) { agRowsErr = e instanceof AssertFail ? e.message : errMsg(e); }
  const needAgRows = () => { needOwnerA(); if (agRowsErr) throw new AssertFail(`สร้างแถวเอเจนซี่ไม่ได้: ${agRowsErr}`); };
  const S = <T,>(name: string) => fnOf(needSet(), name, "settings") as (...a: unknown[]) => Promise<T>;
  const setV = async (actor: Actor, ctx: { tenantId: string }, changes: Rec[], opts?: Rec) => asRec(await S<unknown>("setSettings")(actor, ctx, changes, opts ?? {})) ?? {};
  const resolveV = async (ctx: { tenantId: string }, key: string, refs: Rec) => asRec(await S<unknown>("resolveSetting")(ctx, key, refs)) ?? {};
  const issueCode = (r: Rec) => String(asRec((r.issues as unknown[] | undefined)?.[0])?.code ?? "");
  const countVals = async (key: string, tid = tA) => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "SettingValue" WHERE "tenantId" = $1 AND key = $2`, [tid, key]))[0]?.n ?? 0;

  // ═══════════════ RS. ชั้น AGENT / AGENT_TIER ═══════════════
  console.log("\n── RS: ชั้น AGENT_TIER / AGENT บนฐานจริง ──");
  const refsA = { unitId: uA, agentTierId: tierA, agentId: accA };
  await st("RS-1", "แม่แบบ agency ต่อหน่วย: LIVEABOARD ⇒ A18 = 60 (TEMPLATE) · DIVE_SHOP ⇒ 2 · หน่วยไม่มีโปรไฟล์ agency ⇒ 2 (FALLBACK)", async () => {
    needAgRows(); needDef(KEY("A18"));
    ok(asRec(await S<unknown>("applyTemplate")(needOwnerA(), ctxA, { unitId: uA, domain: "agency", templateKey: "LIVEABOARD", overwrite: "RESET_ALL" }))?.ok === true, "LIVEABOARD uA");
    ok(asRec(await S<unknown>("applyTemplate")(needOwnerA(), ctxA, { unitId: uA2, domain: "agency", templateKey: "DIVE_SHOP", overwrite: "KEEP_CUSTOM" }))?.ok === true, "DIVE_SHOP uA2");
    const a = await resolveV(ctxA, KEY("A18"), { unitId: uA }), b = await resolveV(ctxA, KEY("A18"), { unitId: uA2 }), c = await resolveV(ctxB, KEY("A18"), { unitId: uB });
    eq([a.value, a.source, b.value, b.source, c.value, c.source], [60, "TEMPLATE", 2, "TEMPLATE", 2, "FALLBACK"], "resolve");
  });
  await st("RS-2", "ตั้ง A13 creditLimit ที่ชั้น AGENT (บัญชีของร้านเอง) ได้ · resolve ด้วย refs เต็ม ⇒ ค่า + source AGENT", async () => {
    needAgRows(); needDef(KEY("A13"));
    const r = await setV(needOwnerA(), ctxA, [{ key: KEY("A13"), scope: "AGENT", scopeId: accA, value: 15_000_000 }]);
    ok(r.ok === true, `บันทึกไม่ได้: ${String(r.code)} ${issueCode(r)}`);
    const v = await resolveV(ctxA, KEY("A13"), refsA);
    eq([v.value, v.source], [15_000_000, "AGENT"], "resolve");
  });
  await st("RS-3", "A12 ที่ AGENT_TIER ใช้กับเอเจนซี่ในระดับนั้น · AGENT ทับระดับ · ล้างไม่ได้ทำในข้อนี้", async () => {
    needAgRows(); needDef(KEY("A12"));
    ok((await setV(needOwnerA(), ctxA, [{ key: KEY("A12"), scope: "AGENT_TIER", scopeId: tierA, value: "30" }])).ok === true, "ตั้งระดับ");
    const a = await resolveV(ctxA, KEY("A12"), refsA);
    eq([a.value, a.source], ["30", "AGENT_TIER"], "จากระดับ");
    ok((await setV(needOwnerA(), ctxA, [{ key: KEY("A12"), scope: "AGENT", scopeId: accA, value: "7" }])).ok === true, "ตั้งเอเจนซี่");
    const b = await resolveV(ctxA, KEY("A12"), refsA);
    eq([b.value, b.source], ["7", "AGENT"], "เอเจนซี่ชนะระดับ");
  });
  await st("RS-4", "ร้าน A ตั้งที่บัญชีเอเจนซี่ของร้าน B / ระดับที่ไม่มี ⇒ NOT_FOUND ไม่มีแถว (ตัวตนเดียวกันสองร้านไม่ข้ามกัน)", async () => {
    needAgRows();
    const before = await countVals(KEY("A13"), tB);
    const r1 = await setV(needOwnerA(), ctxA, [{ key: KEY("A13"), scope: "AGENT", scopeId: accB, value: 1 }]);
    const r2 = await setV(needOwnerA(), ctxA, [{ key: KEY("A12"), scope: "AGENT_TIER", scopeId: rid("nope"), value: "7" }]);
    eq([r1.code, r2.code], ["NOT_FOUND", "NOT_FOUND"], "ผล");
    eq(await countVals(KEY("A13"), tB), before, "แถวร้าน B");
  });
  await st("RS-5", "VESSEL ยัง SCOPE_UNSUPPORTED · คีย์ที่ chain ไม่มี AGENT ตั้งที่ AGENT ⇒ SCOPE_NOT_ALLOWED", async () => {
    needAgRows();
    const r1 = await setV(needOwnerA(), ctxA, [{ key: "trips.pax.cabinSharing", scope: "VESSEL", scopeId: rid("v"), value: "ANY" }], { ackLegalWarn: true });
    const r2 = await setV(needOwnerA(), ctxA, [{ key: KEY("A36"), scope: "AGENT", scopeId: accA, value: false }]);
    eq([`${String(r1.code)}:${issueCode(r1)}`, `${String(r2.code)}:${issueCode(r2)}`], ["VALIDATION:SCOPE_UNSUPPORTED", "VALIDATION:SCOPE_NOT_ALLOWED"], "ผล");
  });
  await st("RS-6", `snapshotPolicy('agency.booking') ด้วย refs เต็ม ⇒ ${SNAP_AGENCY.length} คีย์ · A13 ไม่อยู่ใน snapshot · A12 = ค่าของเอเจนซี่`, async () => {
    needAgRows();
    const snap = asRec(await S<unknown>("snapshotPolicy")(ctxA, "agency.booking", refsA)) ?? {};
    const vals = asRec(snap.values) ?? {};
    eq([snap.domain, Object.keys(vals).sort(), vals[KEY("A12")]], ["agency", [...SNAP_AGENCY].sort(), "7"], "snapshot");
  });

  // ═══════════════ WS. คำเตือนของ agency ═══════════════
  console.log("\n── WS: คำเตือน WARN ของ agency (รับทราบ ไม่บังคับเหตุผล · ไม่มี BLOCK) ──");
  const W07_VAL = { ...RULE_BY_PAYEE, JURISTIC: { ...RULE_BY_PAYEE.JURISTIC, TH_PERSON: W("FLAT", 300, "PND3", "PER_PAYMENT") } };
  await st("WS-1", "A26 ที่เข้าเงื่อนไข W07 ชั้นร้าน ไม่รับทราบ ⇒ NEEDS_APPROVAL issue W07 · ไม่มีแถว", async () => {
    needAgRows(); needDef(KEY("A26"));
    const n0 = await countVals(KEY("A26"));
    const r = await setV(needOwnerA(), ctxA, [{ key: KEY("A26"), scope: "UNIT", scopeId: uA, value: W07_VAL }]);
    eq([r.code, issueCode(r)], ["NEEDS_APPROVAL", "W07"], "ผล");
    eq(await countVals(KEY("A26")), n0, "แถว");
  });
  await st("WS-2", "รับทราบโดยไม่มีเหตุผล ⇒ บันทึกได้ · SettingChange legalLevel WARN legalCode W07", async () => {
    needAgRows(); needDef(KEY("A26"));
    const r = await setV(needOwnerA(), ctxA, [{ key: KEY("A26"), scope: "UNIT", scopeId: uA, value: W07_VAL }], { ackLegalWarn: true });
    ok(r.ok === true, `บันทึกไม่ได้: ${String(r.code)} ${issueCode(r)}`);
    const ch = await q<{ legalLevel: string; legalCode: string | null }>(`SELECT "legalLevel", "legalCode" FROM "SettingChange" WHERE "tenantId" = $1 AND key = $2 ORDER BY at DESC LIMIT 1`, [tA, KEY("A26")]);
    eq([ch[0]?.legalLevel, ch[0]?.legalCode], ["WARN", "W07"], "SettingChange");
  });
  await st("WS-3", "ชั้น AGENT (unitId null): A26 เข้า W09 + รับทราบ ⇒ บันทึกได้ (ไม่มี LEGAL_BLOCK/STRICT) · A34 true ⇒ ต้องรับทราบ W34", async () => {
    needAgRows();
    const v = { ...RULE_BY_PAYEE, INDIVIDUAL: { ...RULE_BY_PAYEE.INDIVIDUAL, TH_JURISTIC: W("FLAT", 300, "PND53", "PER_PAYMENT") } };
    const r = await setV(needOwnerA(), ctxA, [{ key: KEY("A26"), scope: "AGENT", scopeId: accA, value: v }], { ackLegalWarn: true });
    ok(r.ok === true, `บันทึกไม่ได้: ${String(r.code)} ${issueCode(r)}`);
    const r2 = await setV(needOwnerA(), ctxA, [{ key: KEY("A34"), scope: "AGENT", scopeId: accA, value: true }]);
    eq([r2.code, issueCode(r2)], ["NEEDS_APPROVAL", "W34"], "A34");
  });
  await st("WS-4", "ค่าปิด: A5 AGENT_RESELLS / A22 BOOKING_CURRENCY ⇒ VALIDATION · A3 (PHASE_2) ⇒ VALIDATION NOT_YET_AVAILABLE", async () => {
    needAgRows();
    const r1 = await setV(needOwnerA(), ctxA, [{ key: KEY("A5"), scope: "UNIT", scopeId: uA, value: "AGENT_RESELLS" }], { ackLegalWarn: true });
    const r2 = await setV(needOwnerA(), ctxA, [{ key: KEY("A22"), scope: "UNIT", scopeId: uA, value: "BOOKING_CURRENCY" }]);
    const r3 = await setV(needOwnerA(), ctxA, [{ key: KEY("A3"), scope: "UNIT", scopeId: uA, value: true }]);
    eq([r1.code, r2.code, `${String(r3.code)}:${issueCode(r3)}`], ["VALIDATION", "VALIDATION", "VALIDATION:NOT_YET_AVAILABLE"], "ผล");
  });

  // ═══════════════ X1. แยกร้าน ═══════════════
  console.log("\n── X1: แยกร้าน/แยกหน่วยผ่าน tenantDb ──");
  const tdb = (ctx: Rec): Rec => { const f = fnOf(DB, "tenantDb", "core/db"); return asRec(f(ctx)) ?? {}; };
  const dlg = (db: Rec, t: string): Rec => { const d = asRec(db[DELEGATE(t)]); if (!d) throw new AssertFail(`client ไม่มี ${DELEGATE(t)}`); return d; };
  const scopedTables = NEW_TABLES.filter((t) => TABLES[t].axis !== "global");
  const xIds: Record<string, string> = {};
  let xErr = "";
  try {
    for (const t of scopedTables) { const row = { ...valid(t, tA, uA) }; if (t === "AgentLedgerEntry") row.idempotencyKey = `x1:${STAMP}`; const id = t === "AgentBalance" ? rid("bal") : rid("x1"); if (t === "AgentBalance") row.agentAccountId = id; else row.id = id; await ins(t, row); xIds[t] = id; }
  } catch (e) { xErr = e instanceof AssertFail ? e.message : errMsg(e); }
  const whereId = (t: string) => (t === "AgentBalance" ? { agentAccountId: xIds[t] } : { id: xIds[t] });
  await st("X1-1", `ทุกตารางใหม่แกน tenant/unit (${scopedTables.length}): tenantDb ร้าน B มองไม่เห็นแถวร้าน A · ร้าน A (หน่วยเดียวกัน) เห็น (positive control)`, async () => {
    if (xErr) throw new AssertFail(`สร้างแถวไม่ได้: ${xErr}`);
    const bad: string[] = [];
    for (const t of scopedTables) {
      const unit = TABLES[t].axis === "unit";
      const nB = ((await (dlg(tdb({ tenantId: tB, ...(unit ? { unitId: uB } : {}) }), t).findMany as AnyFn)({ where: whereId(t) })) as unknown[]).length;
      const nA = ((await (dlg(tdb({ tenantId: tA, ...(unit ? { unitId: uA } : {}) }), t).findMany as AnyFn)({ where: whereId(t) })) as unknown[]).length;
      if (nB !== 0 || nA !== 1) bad.push(`${t} B=${nB} A=${nA}`);
    }
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 5).join(", ")}`);
  });
  await st("X1-2", "tenantDb ร้าน B: updateMany บัญชีเอเจนซี่/สมุดคอมฯ ของ A = 0 แถว · ค่าเดิมไม่เปลี่ยน · tenantDb A create AgentTier เติม tenantId เอง", async () => {
    needAgRows();
    const r1 = asRec(await (dlg(tdb({ tenantId: tB }), "AgentAccount").updateMany as AnyFn)({ where: { id: accA }, data: { legalName: "ถูกแก้" } }));
    const r2 = asRec(await (dlg(tdb({ tenantId: tB }), "AgentCommission").updateMany as AnyFn)({ where: { id: xIds.AgentCommission ?? "x" }, data: { status: "VOID" } }));
    eq([r1?.count, r2?.count], [0, 0], "updateMany");
    eq((await q<{ legalName: string }>(`SELECT "legalName" FROM "AgentAccount" WHERE id = $1`, [accA]))[0]?.legalName, "บจก. ทดสอบ", "ค่าเดิม");
    const c = asRec(await (dlg(tdb({ tenantId: tA }), "AgentTier").create as AnyFn)({ data: { code: "A", name: "ระดับ A" } }));
    eq(c?.tenantId, tA, "tenantId ที่เติม");
  });
  await st("X1-3", "แกน unit: tenantDb ไม่มี unitId ⇒ โยน · หน่วยอื่นของร้านเดียวกันมองไม่เห็น (TripSupplierCost · TripPassengerLink)", async () => {
    if (xErr) throw new AssertFail(`สร้างแถวไม่ได้: ${xErr}`);
    const bad: string[] = [];
    for (const t of ["TripSupplierCost", "TripPassengerLink"]) {
      let threw = false;
      try { await (dlg(tdb({ tenantId: tA }), t).findMany as AnyFn)({ where: whereId(t) }); } catch { threw = true; }
      const n2 = ((await (dlg(tdb({ tenantId: tA, unitId: uA2 }), t).findMany as AnyFn)({ where: whereId(t) })) as unknown[]).length;
      if (!threw || n2 !== 0) bad.push(`${t} threw=${threw} uA2=${n2}`);
    }
    ok(bad.length === 0, bad.join(", "));
  });
  await st("X1-4", "ตาราง global ไม่ถูกเข้าถึงผ่าน tenantDb ในโค้ดของใบ (tenantDb ไม่กรองแกน global) — มีแค่ agency/entry.ts", () => {
    const files = changedSinceBase(["src"]).filter((f) => /\.(ts|tsx)$/.test(f) && f !== `${AG_DIR}/entry.ts` && !sameAsSession(f));
    ok(files.length > 0, "ยังไม่มีไฟล์ src ที่เปลี่ยน");
    const bad = files.filter((f) => /\b(agentIdentity|agentUser|agentLogin|agentSession|agentLoginCode)\s*\./.test(stripComments(read(f))) && f !== "src/lib/core/settings/service.ts");
    ok(bad.length === 0, `แตะตาราง global: ${bad.join(", ")}`);
  });

  // ═══════════════ AI. ตัวตนเอเจนซี่ ═══════════════
  console.log("\n── AI: AgentIdentity — เอกลักษณ์ · ผูก · ความเป็นส่วนตัว ──");
  const CORE = COREI.mod;
  const em = (tag: string) => `qca11-${tag}-${STAMP}@shark.local`;
  type IdRes = { ok?: boolean; code?: string; identity?: Rec; agentUserId?: string; match?: boolean; loginId?: string };
  const mk = async (tag: string, login?: Rec): Promise<IdRes> => (asRec(await agFn<unknown>("createAgentIdentity")({ displayName: `${QC_MARK} ${tag}`, owner: { displayName: `${QC_MARK} เจ้าของ ${tag}`, login: login ?? { kind: "EMAIL", providerId: "email", subject: em(tag) } } })) ?? {}) as IdRes;
  const TAX = thaiTaxId("010555900012"), TAX2 = thaiTaxId("010555900013"), PERSONAL = thaiTaxId("110370012345");
  await st("AI-1", "identity-core บริสุทธิ์: รหัสสาธารณะ AG-XXXXXX · normalizeAgentLogin · normalizeJuristicTaxId (13 หลัก **ขึ้นต้น 0** checksum · เลขบุคคล ⇒ null)", () => {
    const C0 = CORE ?? AG;
    ok(C0, `ยังไม่มี identity-core (${COREI.err.slice(0, 60)})`);
    const mkc = fnOf(C0, "makeAgentPublicCode", "identity-core"), isc = fnOf(C0, "isAgentPublicCode", "identity-core"), nl = fnOf(C0, "normalizeAgentLogin", "identity-core"), nt = fnOf(C0, "normalizeJuristicTaxId", "identity-core");
    const code = String(mkc(new Uint8Array([0, 1, 29, 30, 59, 255])));
    eq(code, `AG-${ALPH[0]}${ALPH[1]}${ALPH[29]}${ALPH[0]}${ALPH[29]}${ALPH[255 % 30]}`, "makeAgentPublicCode");
    eq([isc(code), isc("AG-0000I1"), isc("ag-7k3q9p"), isc("AG-7K3Q9P")], [true, false, false, true], "isAgentPublicCode");
    eq(nl({ kind: "EMAIL", providerId: "email", subject: "  Nan@PTD.co.th " }), { kind: "EMAIL", providerId: "email", subject: "nan@ptd.co.th" }, "อีเมล");
    eq([nl({ kind: "EMAIL", providerId: "gmail", subject: "a@b.co" }), nl({ kind: "EMAIL", providerId: "email", subject: "no-at" }), nl({ kind: "LINE", providerId: "1650000000", subject: "Uabc" }), nl({ kind: "SMS", providerId: "x", subject: "y" })], [null, null, null, null], "ผิดรูป");
    eq([nt(TAX), nt(`${TAX.slice(0, 1)}-${TAX.slice(1, 5)}-${TAX.slice(5, 10)}-${TAX.slice(10, 12)}-${TAX.slice(12)}`), nt(`${TAX.slice(0, 12)}${(Number(TAX[12]) + 1) % 10}`), nt("123"), nt(PERSONAL)], [TAX, TAX, null, null, null], "เลขภาษี (นิติบุคคลเท่านั้น)");
  });
  let I1: IdRes = {};
  await st("AI-2", "createAgentIdentity: ตัวตน + ผู้ใช้ OWNER + วิธีล็อกอิน (verifiedAt) ใน tx เดียว · publicCode ตรงรูป · ผลคืนเฉพาะ 4 ช่องสาธารณะ", async () => {
    I1 = await mk("one");
    ok(I1.ok === true, `สร้างไม่ได้: ${fmt(I1)}`);
    eq(Object.keys(I1.identity ?? {}).sort(), ["displayName", "id", "publicCode", "status"], "ช่องของตัวตน");
    const row = (await q<{ role: string; kind: string; subject: string; v: boolean }>(`SELECT u.role, l.kind, l.subject, l."verifiedAt" IS NOT NULL AS v FROM "AgentUser" u JOIN "AgentLogin" l ON l."agentUserId" = u.id WHERE u.id = $1`, [I1.agentUserId]))[0];
    eq([row?.role, row?.kind, row?.subject, row?.v], ["OWNER", "EMAIL", em("one"), true], "ผู้ใช้+ล็อกอิน");
    ok(/^AG-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/.test(String(I1.identity?.publicCode)), "publicCode");
  });
  await st("AI-3", "ล็อกอินซ้ำ (อีเมลตัวใหญ่ = ตัวเดิม) ⇒ LOGIN_TAKEN ไม่มีตัวตน/ผู้ใช้ใหม่เกิด · LINE userId เดียวกันคนละ provider สร้างได้", async () => {
    ok(I1.ok, "AI-2 ไม่ผ่าน");
    const c0 = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentIdentity" WHERE "displayName" LIKE $1`, [`${QC_MARK}%`]))[0]?.n;
    const r = await mk("dup", { kind: "EMAIL", providerId: "email", subject: em("one").toUpperCase() });
    eq(r.code, "LOGIN_TAKEN", "ผล");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentIdentity" WHERE "displayName" LIKE $1`, [`${QC_MARK}%`]))[0]?.n, c0, "ไม่มีแถวใหม่");
    const sub = lineSub();
    const a = await mk("la", { kind: "LINE", providerId: "1650000011", subject: sub }), b = await mk("lb", { kind: "LINE", providerId: "1650000012", subject: sub });
    eq([a.ok, b.ok], [true, true], "LINE คนละ provider");
  });
  await st("AI-4", "findAgentIdentityByCode: เจอ = 4 ช่องสาธารณะ (ไม่มี taxIdHash) · รหัสไม่มี/ผิดรูป ⇒ null", async () => {
    ok(I1.ok, "AI-2 ไม่ผ่าน");
    const f = agFn<unknown>("findAgentIdentityByCode");
    const r = asRec(await f(String(I1.identity?.publicCode)));
    eq(r && Object.keys(r).sort(), ["displayName", "id", "publicCode", "status"], "ช่อง");
    eq([await f(randCode()), await f("PTD"), await f("")], [null, null, null], "ไม่เจอ");
  });
  await st("AI-5", "setAgentIdentityTaxId (OWNER): เก็บ `v1:` + hex 64 = HMAC ตามสเปก (กุญแจสืบจาก INTEGRATIONS_CREDENTIALS_KEY · คำนวณโดยข้อสอบเอง) = agentTaxIdHash · เลขบุคคล/checksum ผิด ⇒ VALIDATION", async () => {
    ok(I1.ok, "AI-2 ไม่ผ่าน");
    const r = asRec(await agFn<unknown>("setAgentIdentityTaxId")({ agentUserId: I1.agentUserId }, TAX));
    ok(r?.ok === true, `ตั้งไม่ได้: ${fmt(r)}`);
    const h = (await q<{ h: string | null }>(`SELECT "taxIdHash" AS h FROM "AgentIdentity" WHERE id = $1`, [I1.identity?.id]))[0]?.h ?? "";
    ok(/^v1:[0-9a-f]{64}$/.test(h) && !h.includes(TAX), `แฮช: ${h}`);
    eq(h, expectTaxHash(TAX), "ตรงสเปก");
    eq(h, (fnOf(needAg(), "agentTaxIdHash", "agency facade") as (x: string) => string)(TAX), "ตรงกับ agentTaxIdHash");
    const set = agFn<unknown>("setAgentIdentityTaxId");
    eq([asRec(await set({ agentUserId: I1.agentUserId }, `${TAX.slice(0, 12)}${(Number(TAX[12]) + 1) % 10}`))?.code, asRec(await set({ agentUserId: I1.agentUserId }, PERSONAL))?.code], ["VALIDATION", "VALIDATION"], "checksum ผิด · เลขบุคคล");
  });
  await st("AI-6", "เลขภาษีเดียวกันบนสองตัวตน ⇒ ตั้งได้ทั้งคู่ (ไม่มี unique · มติ R1) · verify ของแต่ละตัวตนตรง · ล้าง (null) ได้", async () => {
    ok(I1.ok, "AI-2 ไม่ผ่าน");
    const I2 = await mk("two");
    ok(I2.ok, `สร้าง I2 ไม่ได้: ${fmt(I2)}`);
    const set = agFn<unknown>("setAgentIdentityTaxId"), v = agFn<unknown>("verifyAgentIdentityTaxId");
    eq(asRec(await set({ agentUserId: I2.agentUserId }, TAX))?.ok, true, "ตัวตนที่สองตั้งเลขเดียวกัน");
    eq([asRec(await v({ agentUserId: I1.agentUserId }, TAX))?.match, asRec(await v({ agentUserId: I2.agentUserId }, TAX))?.match], [true, true], "verify");
    ok(asRec(await set({ agentUserId: I2.agentUserId }, null))?.ok === true, "ล้าง");
    eq((await q<{ h: string | null }>(`SELECT "taxIdHash" AS h FROM "AgentIdentity" WHERE id = $1`, [I2.identity?.id]))[0]?.h ?? null, null, "หลังล้าง");
    ok(asRec(await set({ agentUserId: I1.agentUserId }, TAX2))?.ok === true, "I1 ตั้งเลขอื่น");
  });
  await st("AI-7", "verifyAgentIdentityTaxId: OWNER ของตัวตนตัวเอง ⇒ match true/false · ผู้ใช้ SALES ⇒ FORBIDDEN · ผู้ใช้ไม่มีอยู่ ⇒ FORBIDDEN", async () => {
    ok(I1.ok, "AI-2 ไม่ผ่าน");
    const v = agFn<unknown>("verifyAgentIdentityTaxId");
    const a = asRec(await v({ agentUserId: I1.agentUserId }, TAX2)), b = asRec(await v({ agentUserId: I1.agentUserId }, TAX));
    eq([a?.ok, a?.match, b?.ok, b?.match], [true, true, true, false], "match");
    const sales = rid("sales");
    await ins("AgentUser", { id: sales, identityId: I1.identity?.id, displayName: `${QC_MARK} sales`, role: "SALES" });
    eq([asRec(await v({ agentUserId: sales }, TAX2))?.code, asRec(await v({ agentUserId: rid("ghost") }, TAX2))?.code], ["FORBIDDEN", "FORBIDDEN"], "ไม่ใช่ OWNER/ADMIN");
  });
  await st("AI-8", "updateAgentIdentity: OWNER แก้ชื่อได้ · SALES/ADMIN ⇒ FORBIDDEN · ชื่อว่าง ⇒ VALIDATION · ผู้ใช้ DISABLED ⇒ FORBIDDEN", async () => {
    ok(I1.ok, "AI-2 ไม่ผ่าน");
    const u = agFn<unknown>("updateAgentIdentity");
    const r = asRec(await u({ agentUserId: I1.agentUserId }, { displayName: `${QC_MARK} ชื่อใหม่` }));
    eq([r?.ok, asRec(r?.identity)?.displayName], [true, `${QC_MARK} ชื่อใหม่`], "OWNER");
    const adm = rid("adm"), dis = rid("dis");
    await ins("AgentUser", { id: adm, identityId: I1.identity?.id, displayName: `${QC_MARK} admin`, role: "ADMIN" });
    await ins("AgentUser", { id: dis, identityId: I1.identity?.id, displayName: `${QC_MARK} off`, role: "OWNER", status: "DISABLED" });
    eq([asRec(await u({ agentUserId: adm }, { displayName: `${QC_MARK} x` }))?.code, asRec(await u({ agentUserId: I1.agentUserId }, { displayName: "  " }))?.code, asRec(await u({ agentUserId: dis }, { displayName: `${QC_MARK} y` }))?.code], ["FORBIDDEN", "VALIDATION", "FORBIDDEN"], "ผล");
  });
  await st("AI-9", "addAgentLogin: เพิ่ม LINE ให้ตัวเองได้ · ล็อกอินที่มีเจ้าของแล้ว ⇒ LOGIN_TAKEN · agentUserByLogin หาเจอทั้งสองวิธี", async () => {
    ok(I1.ok, "AI-2 ไม่ผ่าน");
    const sub = lineSub();
    const r = asRec(await agFn<unknown>("addAgentLogin")({ agentUserId: I1.agentUserId }, { kind: "LINE", providerId: "1650000021", subject: sub }));
    ok(r?.ok === true, `เพิ่มไม่ได้: ${fmt(r)}`);
    eq(asRec(await agFn<unknown>("addAgentLogin")({ agentUserId: I1.agentUserId }, { kind: "EMAIL", providerId: "email", subject: em("la-none") }))?.ok, true, "เพิ่มอีเมล");
    const I3 = await mk("three");
    eq(asRec(await agFn<unknown>("addAgentLogin")({ agentUserId: I3.agentUserId }, { kind: "LINE", providerId: "1650000021", subject: sub }))?.code, "LOGIN_TAKEN", "ชน");
    const by = agFn<unknown>("agentUserByLogin");
    eq([asRec(await by({ kind: "LINE", providerId: "1650000021", subject: sub }))?.agentUserId, asRec(await by({ kind: "EMAIL", providerId: "email", subject: em("one").toUpperCase() }))?.agentUserId, await by({ kind: "LINE", providerId: "1650000099", subject: sub })], [I1.agentUserId, I1.agentUserId, null], "หาเจอ");
  });
  await st("AI-10", "ความเป็นส่วนตัว (schema): AgentIdentity มีแค่ id displayName publicCode taxIdHash status createdAt updatedAt · ไม่มีคอลัมน์ภาษี/ธนาคาร/ติดต่อ/บัตร", async () => {
    await needTable("AgentIdentity");
    eq((await cols("AgentIdentity")).map((c) => c.column_name).sort(), ["createdAt", "displayName", "id", "publicCode", "status", "taxIdHash", "updatedAt"], "คอลัมน์");
  });
  await st("AI-11", "ตัวตนเดียวสองร้าน: tenantDb ร้าน B ค้นด้วย identityId เห็นแค่บัญชีของ B (ไม่เห็นเลขภาษีกล่องปิด/ธนาคาร/ติดต่อของ A)", async () => {
    needAgRows();
    await pool.query(`UPDATE "AgentAccount" SET "taxIdEnc" = 'sealed-A', "bankAccountEnc" = 'bank-A', contact = '{"phone":"0812345678"}' WHERE id = $1`, [accA]);
    const rows = (await (dlg(tdb({ tenantId: tB }), "AgentAccount").findMany as AnyFn)({ where: { identityId: identA } })) as Rec[];
    eq(rows.map((r) => [r.id, r.tenantId, r.taxIdEnc ?? null, r.bankAccountEnc ?? null]), [[accB, tB, null, null]], "ร้าน B");
  });
  await st("AI-12", "listAgentAccountsOfUser: คืนบัญชีของผู้ใช้ข้ามร้าน เฉพาะ {agentAccountId, tenantId, status, role} · สมาชิก inactive ไม่คืน · บัญชีของตัวตนอื่น (แถวสมาชิกผิดตัวตน) ไม่คืน", async () => {
    needAgRows(); ok(I1.ok, "AI-2 ไม่ผ่าน");
    const a1 = rid("accI1a"), b1 = rid("accI1b"), iid = String(I1.identity?.id ?? "");
    await ins("AgentAccount", { ...valid("AgentAccount", tA, uA), id: a1, identityId: iid, code: "I1A" });
    await ins("AgentAccount", { ...valid("AgentAccount", tB, uB), id: b1, identityId: iid, code: "I1B" });
    await ins("AgentAccountMember", { tenantId: tA, agentAccountId: a1, agentUserId: I1.agentUserId, role: "OWNER", addedByAgentUserId: I1.agentUserId });
    await ins("AgentAccountMember", { tenantId: tB, agentAccountId: b1, agentUserId: I1.agentUserId, role: "SALES", addedByAgentUserId: I1.agentUserId, active: false });
    await ins("AgentAccountMember", { tenantId: tA, agentAccountId: accA, agentUserId: I1.agentUserId, role: "ADMIN", addedByAgentUserId: I1.agentUserId });
    const r = ((await agFn<unknown>("listAgentAccountsOfUser")(I1.agentUserId)) as Rec[]) ?? [];
    eq(r.map((x) => Object.keys(x).sort()), [["agentAccountId", "role", "status", "tenantId"]], "ช่อง");
    eq(r.map((x) => [x.agentAccountId, x.tenantId, x.role]), [[a1, tA, "OWNER"]], "ค่า");
  });
  await st("AI-13", "entry.ts ไม่มีฟังก์ชันค้นตัวตนด้วยชื่อ/เลขภาษี/อีเมล และไม่มีผลใดคืน taxIdHash (static + ค่าจริง)", async () => {
    const src = stripComments(read(`${AG_DIR}/entry.ts`));
    ok(src, "ยังไม่มี entry.ts");
    const exps = [...src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]);
    const bad = exps.filter((n) => /search|byTax|byName|byEmail|findIdentit(?!yByCode)|listIdentit/i.test(n.replace("findAgentIdentityByCode", "")));
    ok(bad.length === 0, `ฟังก์ชันค้นต้องห้าม: ${bad.join(", ")}`);
    ok(I1.ok, "AI-2 ไม่ผ่าน");
    const outs = [I1, asRec(await agFn<unknown>("findAgentIdentityByCode")(String(I1.identity?.publicCode))), asRec(await agFn<unknown>("agentUserByLogin")({ kind: "EMAIL", providerId: "email", subject: em("one") }))];
    ok(!JSON.stringify(outs).includes("taxIdHash"), "ผลมี taxIdHash");
  });

  // ═══════════════ F. ฟอร์ม ═══════════════
  console.log("\n── F: ฟอร์มค่าตั้ง agency ──");
  const formFields = async (q0: Rec): Promise<Rec[] | null> => {
    const m = asRec(await S<unknown>("loadSettingsForm")(needOwnerA(), ctxA, q0));
    if (!m) return null;
    return ((m.groups ?? []) as Rec[]).flatMap((g) => (g.fields ?? []) as Rec[]);
  };
  const UNIT_KEYS = EXPECT.filter((e) => e.chain.includes(U) && !HIDDEN.includes(e.key)).map((e) => e.key).sort();
  await st("F-1", `ฟอร์มหน่วย TRIPS ชั้นร้าน: คีย์ agency = ${UNIT_KEYS.length} ตัวที่ chain มี UNIT (ไม่มี A3) · ตัวเลือก enum ป้ายไทยไม่ใช่ค่าดิบ · A5 ไม่มี AGENT_RESELLS · ตารางมี tableSpec · A37 ป้ายหน่วยงาน`, async () => {
    needOwnerA(); needDef(KEY("A1"));
    const f = await formFields({ domains: ["agency"], unitId: uA, unitType: "TRIPS" });
    ok(f, "ฟอร์ม null");
    eq((f ?? []).map((x) => String(x.key)).sort(), UNIT_KEYS, "คีย์");
    const by = new Map((f ?? []).map((x) => [String(x.key), x]));
    const bad: string[] = [];
    for (const x of f ?? []) {
      for (const o of (x.options as Rec[] | null) ?? []) if (String(o.labelTh) === String(o.value)) bad.push(`${String(x.key)}.${String(o.value)} ป้ายดิบ`);
      if (EXPECT.find((e) => e.key === x.key)?.type === "table" && !asRec(x.tableSpec)) bad.push(`${String(x.key)} ไม่มี tableSpec`);
    }
    eq(((by.get(KEY("A5"))?.options as Rec[] | null) ?? []).map((o) => o.value), ["SHOP_PRINCIPAL"], "ตัวเลือก A5");
    eq([by.get(KEY("A37"))?.reviewHint, by.get(KEY("A37"))?.reviewAuthorityTh, by.get(KEY("A26"))?.reviewHint], ["AUTHORITY", "กรมการท่องเที่ยว", "ACCOUNTANT"], "ป้าย");
    ok(bad.length === 0, bad.slice(0, 5).join(", "));
  });
  await st("F-2", "หน่วย BOOKING ⇒ ไม่มีคีย์ agency · หน่วย TICKET ⇒ มีคีย์ agency (CC §N.4)", async () => {
    needOwnerA(); needDef(KEY("A1"));
    const fb = await formFields({ domains: ["agency"], unitId: uA, unitType: "BOOKING" });
    const ft = await formFields({ domains: ["agency"], unitId: uA, unitType: "TICKET" });
    eq([(fb ?? []).length, (ft ?? []).length], [0, UNIT_KEYS.length], "จำนวน");
  });

  // ═══════════════ D. drift ═══════════════
  console.log("\n── D: drift (prisma migrate diff ฐาน → schema · อ่านอย่างเดียว) ──");
  await st("D-1", `ข้อความ diff ที่แตะ Trip*/Sell*/Agent* = DROP INDEX ของ ${DRIFT_OK.length} ชื่อที่รู้เท่านั้น (ของ RUN อื่น เช่น HR ไม่นับ)`, async () => {
    await needTable("AgentIdentity");
    const r = spawnSync(join(ROOT, "node_modules/.bin/prisma"), ["migrate", "diff", "--from-config-datasource", "prisma.config.ts", "--to-schema", "prisma/schema", "--script"], { cwd: ROOT, env: process.env, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
    ok(r.status === 0, `diff ล้ม exit=${r.status}: ${(r.stderr ?? "").slice(-200)}`);
    const st0 = stripSqlComments(r.stdout ?? "").split(";").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
    const ours = st0.filter((s) => /"(Trip|Sell|Agent)\w*"/.test(s));
    const extra = ours.filter((s) => !DRIFT_OK.some((n) => s === `DROP INDEX "${n}"`));
    ok(extra.length === 0, `drift ${extra.length}: ${extra.slice(0, 3).map((s) => s.slice(0, 100)).join(" | ")}`);
  });
  await st("D-2", "schema มีคอมเมนต์ `// SQL มือ:` ระบุชื่อ SQL มือทุกตัวของใบ (ผู้ทำ migration ถัดไปรู้ว่าห้ามรับ DROP)", () => {
    const txt = `${read("prisma/schema/agency.prisma")}\n${read("prisma/schema/supplier.prisma")}\n${read("prisma/schema/sellable.prisma")}`;
    const names = HAND_SQL_NAMES;
    const miss = names.filter((n) => !txt.includes(n));
    ok(miss.length === 0, `ไม่มีคอมเมนต์: ${miss.join(", ")}`);
  });

  // ═══════════════ G. regression ═══════════════
  console.log("\n── G: regression ──");
  const child = (args: string[]) => spawnSync(join(ROOT, "node_modules/.bin/tsx"), args, { cwd: ROOT, env: process.env, encoding: "utf8", timeout: 30 * 60_000, maxBuffer: 64 * 1024 * 1024 });
  const summary = (out: string): Rec | null => { const l = out.split("\n").find((x) => x.startsWith("JSON_SUMMARY ")); try { return l ? asRec(JSON.parse(l.slice(13))) : null; } catch { return null; } };
  if (NO_REG) {
    for (const [id, n] of [["G-1", "qc-trips-t0.1"], ["G-2", "qc-trips-p0.1"], ["G-3", "fitness"], ["G-4", "fitness F17.1 positive control"]]) skip(id, n, "--no-regression");
  } else {
    await st("G-1", "qc-trips-t0.1 หลัง migration: ที่ไม่ผ่านต้องอยู่ใน {M-1, M-6, RS-5} เท่านั้น (พลิกที่รู้ล่วงหน้า · ORACLE-EDIT ผู้คุม)", async () => {
      await needTable("AgentIdentity");
      const r = child(["scripts/qc-trips-t0.1.mts", "--no-regression"]);
      const s = summary(`${r.stdout ?? ""}`);
      ok(s, `ไม่มี JSON_SUMMARY (exit ${r.status})`);
      const failed = ((s?.failed as string[]) ?? []).filter((x) => !["M-1", "M-6", "RS-5"].includes(x));
      ok(failed.length === 0 && ((s?.skipped as string[]) ?? []).filter((x) => x !== "G-1" /* ORACLE-EDIT G-1 (ผู้คุม 13 พ.ย.): --no-regression ทำให้ t0.1 ข้าม G-1 ของตัวเอง */).length === 0, `ไม่ผ่านนอกรายการ: ${failed.join(", ")} · skip ${fmt(s?.skipped)}`);
    });
    await st("G-2", "qc-trips-p0.1 (seed/ฟิกซ์เจอร์/แยกร้าน) exit 0 หลัง migration", async () => {
      await needTable("AgentIdentity");
      const seeded = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug = ANY($1::text[])`, [["andaman-dive", "andaman-aquarium"]]);
      ok((seeded[0]?.n ?? 0) >= 2, "ฐานนี้ยังไม่ได้ seed (รัน seed-trips-qc.mts ก่อน)");
      const r = child(["scripts/qc-trips-p0.1.mts"]);
      ok(r.status === 0, `exit=${r.status} · ${JSON.stringify(summary(`${r.stdout ?? ""}`)?.failed ?? [])}`);
    });
    await st("G-3", "fitness: F17.1 ✅ · ไม่มี ❌ นอก F5.1 · F5.1 ถ้ายังแดง = 52 ไฟล์พอดี (agency/entry.ts · รอ ORACLE-EDIT baseline 51→52)", async () => {
      await needTable("AgentIdentity");
      const r = child(["scripts/fitness.mts"]);
      ok(`${r.stdout ?? ""}`.split("\n").some((l) => l.includes("✅") && l.includes("[F17.1]")), "ไม่มี ✅ [F17.1]");
      const lines = `${r.stdout ?? ""}`.split("\n").filter((l) => l.includes("❌"));
      const other = lines.filter((l) => !l.includes("[F5.1]"));
      ok(other.length === 0, `❌ ${other.length}: ${other.slice(0, 3).map((l) => l.trim().slice(0, 90)).join(" | ")}`);
      const f5 = lines.find((l) => l.includes("[F5.1]"));
      ok(!f5 || /เพิ่มเป็น 52 ไฟล์/.test(f5), `F5.1: ${f5?.trim().slice(0, 120)}`);
    });
    await st("G-4", "positive control ของ F17.1: ไฟล์ชั่วคราวนอกทางเข้า (src/lib/qc-a11-f17-probe.ts) อ้าง `.agentSession` ⇒ ❌ [F17.1] ชี้ไฟล์นั้น · ลบไฟล์ทิ้งทุกกรณี", async () => {
      ok(/"F17\.1"/.test(read("scripts/fitness.mts")), "ยังไม่มี F17.1 ใน fitness.mts");
      const probe = join(ROOT, "src/lib/qc-a11-f17-probe.ts");
      try {
        writeFileSync(probe, "// QC A1.1 probe (ลบอัตโนมัติ)\nexport const qcA11Probe = (db: { agentSession: { count: () => unknown } }) => db.agentSession.count();\n");
        const r = child(["scripts/fitness.mts"]);
        const l = `${r.stdout ?? ""}`.split("\n").find((x) => x.includes("[F17.1]")) ?? "";
        ok(l.includes("❌") && l.includes("qc-a11-f17-probe"), `F17.1 ไม่จับไฟล์ probe: ${l.trim().slice(0, 140)}`);
      } finally { try { unlinkSync(probe); } catch { /* ไม่มีไฟล์ */ } }
    });
  }
  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try { await cleanupTenants(tenantIds); await cleanupUsers(); await cleanupGlobal(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as AnyFn).call(p); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${p0 + (c.res === "PASS" ? 1 : 0)}/${t0 + 1}`; }
console.log(`\n===== QC TRIPS A1.1 · migration agency + AgentIdentity + ค่าตั้ง agency =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id) })}`);
process.exit(exitCode);
