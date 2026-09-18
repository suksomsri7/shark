// QC — CRM v2 WO C1.2a: the custom-fields engine (`src/lib/modules/member/fields.ts`) learns `objectKey`
// Oracle writer · the C1.2a builder must NOT touch this file · QC database only (.env.qc)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c1.2a.mts
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in throwaway tenants)
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// CONTRACT (brief crm-brief-C1.2a.md + "Controller addendum 2026-09-18" + RESOLUTIONS R-E1)
//   • style: `FieldCtx.objectKey?: string`, default "customer" — never an `opts` field.
//   • customer ⇒ ctx.systemId is the MEMBER system · every other objectKey ⇒ the CRM system. The engine
//     re-resolves the system by tenant + type and refuses a mismatched pair (X1).
//   • non-customer values live in CustomRecordValue(recordType CONTACT|COMPANY|DEAL|CUSTOM) + history in
//     CustomRecordValueHistory when `trackHistory`. Custom objects: objectKey = CustomObject.key.
//   • system fields per object seeded by applyTemplate(ctx{objectKey}, "system"): contact 14 · company 12 · deal 12.
//   • limits per OBJECT: 60 fields, ≤ 20 filterable. LOOKUP to another object via options.objectKey, no self-cycle.
//   • D8: non-customer readers pass the actor; sensitive values dropped unless evaluateSensitiveAccess allows;
//     a MemberAccessLog row when shown.
//
// ASSUMPTIONS THIS ORACLE MAKES BEYOND THE BRIEF (controller: confirm or ORACLE-EDIT)
//   K1  the actor travels in the same style as objectKey: `FieldCtx.actor?: MemberActor` (ctx.actorUserId is
//       also set to the same user, so a builder that resolves the role from Membership passes too).
//   K2  a non-customer read with NO actor at all (actor absent, actorUserId null) drops sensitive values (fail
//       closed — "any reader passes the actor"). X8.5 is MAJOR, not CRITICAL.
//   K3  the MemberAccessLog row for a non-customer record carries the record id (or the contact's partyId) in
//       `customerId` (the only "whose data" column) and follows the member targeting rule: field in a sensitive
//       section ⇒ SECTION/section.id, a sensitive field ⇒ FIELD/field.id (list.ts sensitiveFieldsOf).
//   K4  "URL fields http/https only" = the company system field whose systemKey is `website` (there is no URL
//       field type in MemberFieldType and C1.2a has no migration).
//   K5  a custom objectKey must name a CustomObject of THAT CRM system (unknown / other-system key ⇒ refused).
//   K6  the section cap (MEMBER_LIMITS.sections = 12) is per object too — one CRM system holds sections of
//       contact + company + deal + every custom object, so a per-system cap would block ordinary setups (S6.4).
//
// GUARD (decision): the engine EXISTS, so a whole-file SKIP would hide the one thing that matters today —
//   the golden group G1. Instead probe P0 inserts two sections straight into a throwaway CRM system (objectKey
//   "contact" and "company") and calls listLayout({…, objectKey:"contact"}). If the company row comes back,
//   ctx.objectKey is being IGNORED ⇒ every new-behaviour group (S*, X*) is reported ⏭ SKIPPED and counted as
//   NOT passed (reason printed once) — never executed, because running them against a customer-bound engine
//   would only produce cascades. G1 always runs. When P0 says supported, everything runs and META.1 proves
//   every planned id actually got a verdict (an exception half-way through a group cannot hide checks).
//
// G1 — GOLDEN (the main risk: the default path must stay byte-identical for the live member system)
//   A representative customer fixture (4 system sections + 10 system fields shaped exactly like
//   scripts/member-backfill-fields.mts, 2 engine sections, 13 engine fields of all 11 types incl. one archived,
//   applyTemplate("dive") twice, 3 customers + an address, 6 writes + 18 refused writes, 25 filters + 6 refused,
//   15 checkFieldValue + 6 normalizeFieldOptions cases). Outputs are canonicalised (ids → symbolic tokens,
//   object keys sorted, `in/notIn` id lists sorted, timestamps that change per run → "<date>") and compared
//   BYTE-FOR-BYTE with literals frozen from the code at session/crm @ C1.1 (before C1.2a). Refreeze only with
//   `--capture-golden`, which refuses to run once the engine honours objectKey.
//
// X-GROUPS (D3)
//   X1 scope — here (other tenant · other CRM system · mismatched objectKey/system pair · foreign objectKey).
//   X2 keys/AI — n/a: no op/tool added (the API-key "readonly" actor is exercised under X8.4).
//   X3 races — here (12 in-process × 3 rounds + 4 processes × 3 calls × 2 rounds on the same record+field).
//   X4 redelivery — n/a: no consumer.   X5 timed claims — n/a: no job.   X7 public endpoint — n/a.
//   X6 dangerous input — here (length caps · SELECT options · URL schemes).
//   X8 PDPA — here (sensitive values dropped/shown by policy + MemberAccessLog).   X9 — n/a: engine calls,
//   no user-facing op (confirm/reason belong to the op layer of C1.2b/C1.9).   X10 — n/a: no secrets/files.
//
// R — REVIEW FIXES (appended after the builder's first review): R.1 GOVERNED_CRM_SYSTEM_KEYS via the facade · R.2/R.3
//   governed system columns refused whole-call (Thai, column unchanged) · R.4 sensitive filters on the CRM path ·
//   R.5 lockRecordForFieldWrite blocks a separate process (--r5-worker) · R.6 plain PrismaClient as tx ⇒ fork-free history.
// HOUSE RULES: throwaway tenants `qc-c12a-<rand>` (+`-b`), every table with a tenantId swept in `finally`
//   (4 passes) + the Users created here; CLEAN proves 0 rows left. Shared member QC data is never touched.
//   Last line JSON_SUMMARY. Modules that may not exist are imported with `await import("…" as string)`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const FIELDS_FILE = "src/lib/modules/member/fields.ts";
if (!existsSync(FIELDS_FILE)) {
  console.log(`⚠️  SKIPPED — ${FIELDS_FILE} does not exist`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

// ═══ X3 WORKER MODE — this file re-invoked as a child process (own PrismaClient = own connections) ═══
//   argv: --x3-worker <tenantId> <crmSystemId> <recordId> <fieldKey> <valuePrefix> <startAtMs> <calls> <userId>
const ARGV = process.argv.slice(2);
const WORKER_AT = ARGV.indexOf("--x3-worker");
if (WORKER_AT >= 0) {
  const [wT, wS, wR, wK, wPre, wStart, wCalls, wU] = ARGV.slice(WORKER_AT + 1);
  const FW = (await import("@/lib/modules/member/fields")) as Any;
  const waitMs = Number(wStart) - Date.now();
  if (waitMs > 0) await new Promise<void>((r) => setTimeout(r, waitMs));
  const out = await Promise.all(
    Array.from({ length: Number(wCalls) }, (_x, i) =>
      Promise.resolve()
        .then(() => FW.setFieldValues({ tenantId: wT, systemId: wS, actorUserId: wU, objectKey: "contact" }, wR, { [wK]: `${wPre}-${i}` }, { via: "STAFF" }))
        .then((r: Any) => `OK:${wPre}-${i}:${JSON.stringify(r?.changed ?? null)}`)
        .catch((e: Any) => `ERR:${e instanceof Error ? e.message : String(e)}`),
    ),
  );
  console.log(`X3WORKER ${JSON.stringify(out)}`);
  const dbw = (await import("@/lib/core/db")) as Any;
  await dbw.prisma.$disconnect();
  process.exit(0);
}
// ═══ R.5 WORKER MODE — one setFieldValues from a separate process, timed by the child's own clock ═══
//   argv: --r5-worker <tenantId> <crmSystemId> <recordId> <fieldKey> <value> <startAtMs> <userId>
const R5_AT = ARGV.indexOf("--r5-worker");
if (R5_AT >= 0) {
  const [wT, wS, wR, wK, wV, wStart, wU] = ARGV.slice(R5_AT + 1);
  const FW = (await import("@/lib/modules/member/fields")) as Any;
  const dbw = (await import("@/lib/core/db")) as Any;
  // warm the pool first, so the call at startAt measures the lock wait and not a TCP/TLS handshake
  await Promise.all([1, 2, 3].map(() => dbw.prisma.$queryRawUnsafe("SELECT 1")));
  const waitMs = Number(wStart) - Date.now();
  if (waitMs > 0) await new Promise<void>((r) => setTimeout(r, waitMs));
  const t0 = Date.now();
  let res = "";
  try {
    const r = await FW.setFieldValues({ tenantId: wT, systemId: wS, actorUserId: wU, objectKey: "contact" }, wR, { [wK]: wV }, { via: "STAFF" });
    res = `OK:${JSON.stringify(r?.changed ?? null)}`;
  } catch (e) {
    res = `ERR:${e instanceof Error ? e.message : String(e)}`;
  }
  const t1 = Date.now();
  console.log(`R5WORKER ${JSON.stringify({ t0, t1, res, late: waitMs <= 0 })}`);
  await dbw.prisma.$disconnect();
  process.exit(0);
}
const CAPTURE = ARGV.includes("--capture-golden");
/** oracle self-test only: run the new-behaviour groups even when P0 says unsupported (results are meaningless — used to smoke the oracle code) */
const FORCE_NEW = ARGV.includes("--force-new-groups");

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const F = (await import("@/lib/modules/member/fields")) as Any;

// ─────────────────────────── harness ───────────────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR" | "SKIPPED";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${cut(a, 700)}`}`);
};
const cut = (s: string, n = 260) => (s.length > n ? `${s.slice(0, n)}…` : s);
const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));
const thai = (s: unknown) => typeof s === "string" && /[ก-๙]/.test(s);
type Tried = { ok: boolean; v: Any; err: string };
const attempt = async (fn: () => Any): Promise<Tried> => {
  try {
    return { ok: true, v: await fn(), err: "" };
  } catch (e) {
    return { ok: false, v: undefined, err: e instanceof Error ? e.message : String(e) };
  }
};
/** refused by the ENGINE (Thai message) — a Prisma P2002/validation error does not count as a refusal */
const refused = (r: Tried) => !r.ok && thai(r.err);
const limitRefused = (r: Tried) => !r.ok && /LIMIT_REACHED/.test(r.err);
const emptyOrRefused = (r: Tried) => !r.ok || (Array.isArray(r.v?.sections) && r.v.sections.length === 0);
const show = (r: Tried) => (r.ok ? `ok ${cut(j(r.v), 160)}` : `threw ${cut(r.err, 160)}`);
const j = (v: Any): string =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x && typeof x === "object" && x.constructor?.name === "Decimal" ? x.toString() : x));
const sortIds = (a: string[]) => [...a].sort();
const sameSet = (a: string[], b: string[]) => j(sortIds(a)) === j(sortIds(b));

// ─────────── canonical form (G1) ───────────
const TOK = new Map<string, string>();
const reg = (id: string | null | undefined, name: string) => { if (id) TOK.set(id, name); };
const CUID_RE = /^c[a-z0-9]{20,32}$/;
const DATE_KEYS = new Set(["createdAt", "updatedAt", "archivedAt"]);
function norm(v: Any, key = ""): Any {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (v instanceof Date) return DATE_KEYS.has(key) ? "<date>" : v.toISOString();
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "object" && v.constructor?.name === "Decimal") return v.toString();
  if (typeof v === "string") return TOK.get(v) ?? (CUID_RE.test(v) ? "<?id>" : v);
  if (Array.isArray(v)) {
    const a = v.map((x) => norm(x));
    return key === "in" || key === "notIn" ? [...a].sort() : a;
  }
  if (typeof v === "object") {
    // object KEYS can be ids too (getFieldValues is keyed by record id) — tokenise them, then sort
    const out: Record<string, Any> = {};
    const keyOf = (k: string) => TOK.get(k) ?? (CUID_RE.test(k) ? "<?id>" : k);
    for (const k of Object.keys(v).sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0))) {
      const x = norm(v[k], k);
      if (x !== undefined) out[keyOf(k)] = x;
    }
    return out;
  }
  return v;
}
const canon = (v: Any) => JSON.stringify(norm(v));

// ─────────── the plan (META.1 proves every id got a verdict) ───────────
const range = (g: string, from: number, to: number) => Array.from({ length: to - from + 1 }, (_x, i) => `C1.2a-${g}.${from + i}`);
const PLAN_NEW: string[] = [
  ...range("S1", 1, 7), ...range("S2", 1, 6), ...range("S3", 1, 10), ...range("S4", 1, 3), ...range("S5", 1, 8),
  ...range("S6", 1, 4), ...range("S7", 1, 5), ...range("S8", 1, 1),
  ...range("X1", 1, 8), ...range("X3", 0, 4), ...range("X6", 1, 4), ...range("X8", 0, 6),
  ...range("R", 1, 6), // review fixes S1/S2/S4 (group R — appended after the builder's first review)
];
const PLAN_G1: string[] = range("G1", 0, 13);

// ─────────── state ───────────
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c12a-${rand}`;
let T = ""; let TB = "";
const USERS: string[] = [];
let M = ""; let M2 = ""; let CRM1 = ""; let CRM2 = ""; let CRMB = ""; let UNIT = "";
const U: Record<string, string> = {};
const ACT: Record<string, Any> = {};
const K: Record<string, string> = {}; // contacts
const CO: Record<string, string> = {}; // companies
const R: Record<string, string> = {}; // custom records
const OBJ: Record<string, string> = {}; // custom objects
let DEAL = "";
const cx = (objectKey: string, actor: Any = ACT.owner) => ({ tenantId: T, systemId: CRM1, actorUserId: actor?.userId ?? null, objectKey, actor });
const cx2 = (objectKey: string) => ({ tenantId: T, systemId: CRM2, actorUserId: U.owner, objectKey, actor: ACT.owner });
const cxB = (objectKey: string) => ({ tenantId: TB, systemId: CRMB, actorUserId: null, objectKey, actor: { userId: `${TAG}-b-owner`, role: "OWNER", unitAccess: ["*"], permissions: {} } });

async function group(name: string, fn: () => Promise<void>) {
  console.log(`\n── ${name} ──`);
  try {
    await fn();
  } catch (e) {
    chk(`C1.2a-${name}.ERR`, `group ${name} ran to the end without an unexpected exception`, false, "no exception", cut(errText(e) + "\n" + ((e as Error)?.stack ?? ""), 600));
  }
}

console.log(`\n═══ QC CRM v2 · C1.2a — custom-fields engine learns objectKey ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${CAPTURE ? " · CAPTURE MODE" : ""}\n`);

// ═══ setup that never depends on the new engine (plain rows) ═══
async function setupBase() {
  const sysSvc = (await import("@/lib/modules/system/service")) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  TB = (await P.tenant.create({ data: { name: `${TAG}-b`, slug: `${TAG}-b` } })).id;
  UNIT = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: "สาขาทดสอบ", slug: `${TAG}-u` } })).id;
  reg(UNIT, "unit:U");
  for (const role of ["OWNER", "MANAGER", "STAFF"]) {
    const u = await P.user.create({ data: { email: `${TAG}-${role.toLowerCase()}@qc.local`, name: `${TAG} ${role}` } });
    USERS.push(u.id);
    await P.membership.create({ data: { userId: u.id, tenantId: T, role, unitAccess: ["*"], permissions: {} } });
    U[role.toLowerCase()] = u.id;
    ACT[role.toLowerCase()] = { userId: u.id, role, unitAccess: ["*"], permissions: {} };
    reg(u.id, `user:${role.toLowerCase()}`);
  }
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  M = await mk(T, "MEMBER", "สมาชิก"); reg(M, "sys:M");
  M2 = await mk(T, "MEMBER", "สมาชิก 2");
  CRM1 = await mk(T, "CRM", "CRM 1");
  CRM2 = await mk(T, "CRM", "CRM 2");
  CRMB = await mk(TB, "CRM", "CRM B");
}

async function setupCrmRows() {
  const contact = async (sid: string, tid: string, name: string, phone: string, extra: Record<string, Any> = {}) =>
    (await P.crmContact.create({ data: { tenantId: tid, systemId: sid, name, phone, email: `${phone}@example.test`, ...extra } })).id as string;
  K.k1 = await contact(CRM1, T, "อัลฟ่า หนึ่ง", "0891110001", { firstName: "อัลฟ่า", lastName: "หนึ่ง", jobTitle: "ผู้จัดการ", department: "ขาย", note: "โน้ต k1" });
  K.k2 = await contact(CRM1, T, "เบต้า สอง", "0891110002", { firstName: "เบต้า", lastName: "สอง", jobTitle: "เจ้าของ" });
  K.k3 = await contact(CRM1, T, "แกมมา สาม", "0891110003", { firstName: "แกมมา" });
  K.k4 = await contact(CRM1, T, "เดลต้า สี่", "0899990004");
  K.k5 = await contact(CRM2, T, "ระบบสอง", "0891110005");
  K.kb = await contact(CRMB, TB, "ร้านบี", "0891110009");
  for (let i = 1; i <= 5; i += 1) K[`race${i}`] = await contact(CRM1, T, `แข่ง ${i}`, `08922200${i}0`);
  const company = async (sid: string, tid: string, name: string, n: string) =>
    (await P.crmCompany.create({ data: { tenantId: tid, systemId: sid, partyId: `${TAG}-party-${n}`, name, website: null } })).id as string;
  CO.co1 = await company(CRM1, T, "บจก. หนึ่ง", "1");
  CO.co2 = await company(CRM1, T, "บจก. สอง", "2");
  CO.coX = await company(CRM2, T, "บจก. ระบบสอง", "x");
  const pipe = await P.crmPipeline.create({ data: { tenantId: T, systemId: CRM1, name: "ขาย", isDefault: true } });
  const stage = await P.crmStage.create({ data: { tenantId: T, systemId: CRM1, pipelineId: pipe.id, name: "ใหม่", probability: 10 } });
  DEAL = (await P.crmDeal.create({ data: { tenantId: T, systemId: CRM1, contactId: K.k1, pipelineId: pipe.id, stageId: stage.id, title: "ดีลทดสอบ", valueSatang: 100000 } })).id;
  const obj = async (sid: string, tid: string, key: string, parentType: string) =>
    (await P.customObject.create({ data: { tenantId: tid, systemId: sid, key, label: key, labelPlural: key, parentType, titleFieldKey: key === "car" ? "plate" : "gname" } })).id as string;
  OBJ.car = await obj(CRM1, T, "car", "CONTACT");
  OBJ.garage = await obj(CRM1, T, "garage", "NONE");
  OBJ.garage2 = await obj(CRM2, T, "garage", "NONE");
  OBJ.boat2 = await obj(CRM2, T, "boat", "NONE");
  OBJ.carB = await obj(CRMB, TB, "car", "CONTACT");
  const rec = async (sid: string, tid: string, objectId: string, parentType: string, parentId: string | null, title: string) =>
    (await P.customRecord.create({ data: { tenantId: tid, systemId: sid, objectId, parentType, parentId, title } })).id as string;
  R.r1 = await rec(CRM1, T, OBJ.car, "CONTACT", K.k1, "รถ 1");
  R.r2 = await rec(CRM1, T, OBJ.car, "CONTACT", K.k2, "รถ 2");
  R.r3 = await rec(CRM1, T, OBJ.car, "CONTACT", K.k3, "รถ 3");
  R.g1 = await rec(CRM1, T, OBJ.garage, "NONE", null, "อู่ 1");
  R.g2 = await rec(CRM1, T, OBJ.garage, "NONE", null, "อู่ 2");
  R.g3 = await rec(CRM2, T, OBJ.garage2, "NONE", null, "อู่ระบบสอง");
  R.rb = await rec(CRMB, TB, OBJ.carB, "CONTACT", K.kb, "รถร้านบี");
}

/** P0 — does the engine honour ctx.objectKey? (rows inserted directly; deleted right after) */
async function probeObjectKey(): Promise<{ supported: boolean; why: string }> {
  const a = await P.memberSection.create({ data: { tenantId: T, systemId: CRM1, objectKey: "company", key: "p0company", label: "P0 company" } });
  const b = await P.memberSection.create({ data: { tenantId: T, systemId: CRM1, objectKey: "contact", key: "p0contact", label: "P0 contact" } });
  try {
    const r = await attempt(() => F.listLayout({ tenantId: T, systemId: CRM1, actorUserId: U.owner, objectKey: "contact", actor: ACT.owner }));
    if (!r.ok) return { supported: false, why: `listLayout({objectKey:"contact"}) threw: ${cut(r.err, 200)}` };
    const keys: string[] = (r.v?.sections ?? []).map((s: Any) => s.key);
    if (keys.includes("p0company")) return { supported: false, why: `listLayout({objectKey:"contact"}) returned the objectKey="company" section too — ctx.objectKey is IGNORED (sections: ${keys.join(",")})` };
    if (!keys.includes("p0contact")) return { supported: false, why: `listLayout({objectKey:"contact"}) did not return the contact section (sections: ${keys.join(",") || "-"})` };
    return { supported: true, why: "listLayout filters by ctx.objectKey" };
  } finally {
    await P.memberSection.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// G1 — the golden customer fixture (default objectKey) — everything below goes through TODAY's engine
// ═══════════════════════════════════════════════════════════════════════════════════
const C: Record<string, string> = {}; // customers
const G1_SYS_SECTIONS = [
  { key: "profile", label: "ข้อมูลพื้นฐาน", columns: 2, sortOrder: 0, description: "ชื่อ วันเกิด เพศ รหัสสมาชิก" },
  { key: "contact", label: "ช่องทางติดต่อ", columns: 2, sortOrder: 1, description: "เบอร์โทร อีเมล ไลน์ โซเชียล" },
  { key: "address", label: "ที่อยู่", columns: 2, sortOrder: 2, description: "ที่อยู่สำหรับจัดส่ง/ออกใบเสร็จ" },
  { key: "internal", label: "ข้อมูลภายใน", columns: 2, sortOrder: 3, description: "ที่มา ผู้ดูแล สาขาหลัก แท็ก โน้ต" },
];
const ch = (value: string, label = value) => ({ value, label });
// same shape as scripts/member-backfill-fields.mts (key = systemKey)
const G1_SYS_FIELDS: Any[] = [
  { key: "firstName", label: "ชื่อจริง", type: "TEXT", section: "profile", showInList: true, showOnCard: true, customerEditable: true },
  { key: "lastName", label: "นามสกุล", type: "TEXT", section: "profile", showInList: true, customerEditable: true },
  { key: "birthDate", label: "วันเกิด", type: "DATE", section: "profile", filterable: true, customerEditable: true },
  { key: "gender", label: "เพศ", type: "SELECT", section: "profile", filterable: true, customerEditable: true, options: { choices: [ch("MALE", "ชาย"), ch("FEMALE", "หญิง"), ch("OTHER", "อื่น ๆ"), ch("UNSPECIFIED", "ไม่ระบุ")] } },
  { key: "phone", label: "เบอร์โทร", type: "TEXT", section: "contact", required: true, unique: true, filterable: true, showInList: true, showOnCard: true },
  { key: "email", label: "อีเมล", type: "TEXT", section: "contact", unique: true, showInList: true, customerEditable: true },
  { key: "addressProvince", label: "จังหวัด", type: "TEXT", section: "address", filterable: true, customerEditable: true },
  { key: "tags", label: "แท็ก", type: "MULTI_SELECT", section: "internal", filterable: true, showInList: true, options: { choices: [] } },
  { key: "note", label: "โน้ตภายใน", type: "LONG_TEXT", section: "internal" },
  { key: "homeUnitId", label: "สาขาหลัก", type: "LOOKUP", section: "internal", filterable: true, showInList: true, options: { target: "UNIT" } },
];
const ctxM = () => ({ tenantId: T, systemId: M, actorUserId: U.owner });

async function g1Fixture(): Promise<Record<string, Any>> {
  const G: Record<string, Any> = {};
  const errs: Record<string, string> = {};
  const E = async (label: string, fn: () => Any) => { const r = await attempt(fn); errs[label] = r.ok ? `NO-ERROR ${canon(r.v)}` : r.err; };
  // system sections/fields — direct rows, exactly what the backfill writes
  const secId: Record<string, string> = {};
  for (const s of G1_SYS_SECTIONS) {
    const row = await P.memberSection.create({ data: { tenantId: T, systemId: M, key: s.key, label: s.label, description: s.description, columns: s.columns, sortOrder: s.sortOrder, isSystem: true } });
    secId[s.key] = row.id; reg(row.id, `sec:${s.key}`);
  }
  const perSec: Record<string, number> = {};
  for (const f of G1_SYS_FIELDS) {
    const so = perSec[f.section] ?? 0; perSec[f.section] = so + 1;
    const row = await P.memberField.create({
      data: {
        tenantId: T, systemId: M, sectionId: secId[f.section], key: f.key, label: f.label, type: f.type, options: f.options ?? {},
        required: f.required ?? false, unique: f.unique ?? false, filterable: f.filterable ?? false, showInList: f.showInList ?? false,
        showOnCard: f.showOnCard ?? false, customerEditable: f.customerEditable ?? false, isSystem: true, systemKey: f.key, sortOrder: so,
      },
    });
    reg(row.id, `fld:${f.key}`);
  }
  // customers
  const cust = async (n: string, data: Record<string, Any>) => { const r = await P.customer.create({ data: { tenantId: T, memberSystemId: M, ...data } }); C[n] = r.id; reg(r.id, `cust:${n}`); };
  await cust("A", { name: "สมชาย ใจดี", firstName: "สมชาย", lastName: "ใจดี", phone: "0810000001", email: "g1-a@example.test", birthDate: new Date("1990-05-20T00:00:00Z"), gender: "MALE", tags: ["vip"], homeUnitId: UNIT });
  await cust("B", { name: "สมหญิง รักดี", firstName: "สมหญิง", phone: "0810000002", birthDate: new Date("1985-11-02T00:00:00Z"), gender: "FEMALE", tags: [] });
  await cust("C", { name: "ทดสอบ", firstName: "ทดสอบ", phone: "0810000003", tags: ["new", "vip"] });
  await P.memberAddress.create({ data: { tenantId: T, customerId: C.A, kind: "HOME", isDefault: true, line1: "1 ถนนทดสอบ", province: "ภูเก็ต" } });

  // engine: sections + fields of all 11 types
  const ctx = ctxM();
  const dto: Record<string, Any> = {};
  dto.secDive = await F.createSection(ctx, { key: "dive", label: "ดำน้ำ (ร้านตั้งเอง)", description: "ใบรับรองและประสบการณ์", columns: 3 });
  reg(dto.secDive.id, "sec:dive");
  dto.secHealth = await F.createSection(ctx, { key: "health", label: "สุขภาพ", columns: 1, sensitive: true });
  reg(dto.secHealth.id, "sec:health");
  const fdefs: [string, string, string, Record<string, Any>][] = [
    ["certLevel", "dive", "SELECT", { filterable: true, trackHistory: true, showInList: true, options: { choices: [ch("OW", "Open Water"), ch("AOW", "Advanced"), { value: "RESCUE", label: "Rescue", color: "red" }] } }],
    ["logCount", "dive", "NUMBER", { filterable: true, options: { unit: "ไดฟ์", decimals: 0, min: 0, max: 10000 } }],
    ["depositSatang", "dive", "MONEY", {}],
    ["lastDiveOn", "dive", "DATE", { filterable: true }],
    ["nextCheckAt", "dive", "DATETIME", { filterable: true }],
    ["interests", "dive", "MULTI_SELECT", { filterable: true, options: { choices: [ch("wreck"), ch("reef"), ch("macro")] } }],
    ["hasGear", "dive", "BOOLEAN", { filterable: true }],
    ["bio", "dive", "LONG_TEXT", { customerEditable: true, description: "  ประวัติ  " }],
    ["favSpot", "dive", "TEXT", { filterable: true, options: { maxLength: 30 } }],
    ["buddyId", "dive", "LOOKUP", { filterable: true, options: { target: "CUSTOMER" } }],
    ["allergy", "health", "TEXT", { trackHistory: true }],
    ["medicalFile", "health", "FILE", {}],
    ["oldCode", "dive", "TEXT", {}],
  ];
  for (const [key, sec, type, extra] of fdefs) {
    const d = await F.createField(ctx, { sectionId: sec === "dive" ? dto.secDive.id : dto.secHealth.id, key, label: `ป้าย ${key}`, type, ...extra });
    reg(d.id, `fld:${key}`); dto[`f:${key}`] = d;
  }
  dto.updMedical = await F.updateField(ctx, dto["f:medicalFile"].id, { filterable: true });
  dto.updBio = await F.updateField(ctx, dto["f:bio"].id, { label: "ประวัติย่อ (แก้ป้าย)" });
  dto.archOld = await F.archiveField(ctx, dto["f:oldCode"].id);
  dto.updSec = await F.updateSection(ctx, dto.secDive.id, { collapsed: true });
  await E("createField.dupKey", () => F.createField(ctx, { sectionId: dto.secDive.id, key: "favSpot", label: "ซ้ำ", type: "TEXT" }));
  await E("createField.badType", () => F.createField(ctx, { sectionId: dto.secDive.id, key: "colorX", label: "สี", type: "COLOR" }));
  await E("createField.badKey", () => F.createField(ctx, { sectionId: dto.secDive.id, key: "Bad Key", label: "x", type: "TEXT" }));
  await E("createSection.dupKey", () => F.createSection(ctx, { key: "dive", label: "ซ้ำ" }));
  await E("updateField.systemType", () => F.updateField(ctx, [...TOK].find(([, v]) => v === "fld:phone")![0], { type: "NUMBER" }));
  await E("archiveField.system", () => F.archiveField(ctx, [...TOK].find(([, v]) => v === "fld:phone")![0]));
  await E("deleteSection.system", () => F.deleteSection(ctx, secId.profile));
  G.dto = dto;
  // template
  const t1 = await F.applyTemplate(ctx, "dive");
  for (const f of await P.memberField.findMany({ where: { systemId: M } })) if (!TOK.has(f.id)) reg(f.id, `fld:${f.key}`);
  for (const s of await P.memberSection.findMany({ where: { systemId: M } })) if (!TOK.has(s.id)) reg(s.id, `sec:${s.key}`);
  const t2 = await F.applyTemplate(ctx, "dive");
  await E("applyTemplate.unknown", () => F.applyTemplate(ctx, "no_such_template"));
  G.template = { t1, t2 };

  // writes
  const set = (id: string, values: Record<string, Any>, via = "STAFF") => F.setFieldValues(ctx, id, values, { via });
  const w: Record<string, Any> = {};
  w.w1 = await set(C.A, { certLevel: "AOW", logCount: 42, depositSatang: 1500.5, lastDiveOn: "2026-03-15", nextCheckAt: "2026-04-01T09:30:00+07:00", interests: ["wreck", "reef", "wreck"], hasGear: true, bio: "  ชอบดำน้ำกลางคืน  ", favSpot: "Koh Tao", buddyId: C.B, allergy: "กุ้ง", medicalFile: "file-qc-1" });
  w.w2 = await set(C.B, { certLevel: "OW", logCount: 5, hasGear: false, interests: ["reef"], lastDiveOn: "2025-12-31", favSpot: "Similan", nextCheckAt: "2026-05-01T00:00:00Z" });
  w.w3 = await set(C.A, { certLevel: "RESCUE", logCount: 42, favSpot: null, allergy: "กุ้ง, ถั่ว" });
  w.w4 = await set(C.A, { firstName: "สมชาย", gender: "MALE", addressProvince: "กระบี่", note: "ลูกค้าประจำ" });
  w.w5 = await set(C.C, { addressProvince: "ตรัง", birthDate: "2000-01-31", tags: [] });
  w.w6 = await set(C.B, { bio: "ของลูกค้าเอง" }, "CUSTOMER_SELF");
  w.w7 = await set(C.C, {});
  G.setReturns = w;
  await E("set.number", () => set(C.A, { logCount: "abc" }));
  await E("set.selectOption", () => set(C.A, { certLevel: "NOPE" }));
  await E("set.dateInvalid", () => set(C.A, { lastDiveOn: "2026-02-30" }));
  await E("set.unknownKey", () => set(C.A, { nope: 1 }));
  await E("set.archived", () => set(C.A, { oldCode: "x" }));
  await E("set.customerSelf", () => set(C.A, { certLevel: "OW" }, "CUSTOMER_SELF"));
  await E("set.required", () => set(C.A, { phone: null }));
  await E("set.uniqueTaken", () => set(C.B, { phone: "0810000001" }));
  await E("set.lookupMissing", () => set(C.A, { buddyId: "no-such-customer" }));
  await E("set.tagsNoChoice", () => set(C.A, { tags: ["x"] }));
  await E("set.maxLength", () => set(C.A, { favSpot: "x".repeat(31) }));
  await E("set.atomic", () => set(C.A, { favSpot: "Phi Phi", logCount: -1 }));
  await E("set.via", () => set(C.A, { favSpot: "y" }, "BOGUS"));
  await E("set.unknownCustomer", () => set("no-such-customer-id", { favSpot: "y" }));
  await E("set.decimals", () => set(C.A, { logCount: 1.5 }));
  await E("set.bool", () => set(C.A, { hasGear: "yes" }));
  await E("set.datetime", () => set(C.A, { nextCheckAt: "tomorrow" }));
  await E("set.multiNotArray", () => set(C.A, { interests: "wreck" }));
  G.errors = errs;

  // stored state
  const cells = await P.memberFieldValue.findMany({ where: { tenantId: T }, select: { customerId: true, fieldId: true, valueText: true, valueNumber: true, valueDate: true, valueBool: true, valueOptions: true, valueRef: true, valueFileId: true, updatedById: true } });
  G.cells = cells.map((c: Any) => canon(c)).sort();
  const hist = await P.memberFieldValueHistory.findMany({ where: { tenantId: T }, select: { customerId: true, fieldId: true, oldValue: true, newValue: true, changedById: true, changedVia: true } });
  G.history = hist.map((c: Any) => canon(c)).sort();
  const custCols = await P.customer.findMany({ where: { tenantId: T, memberSystemId: M }, select: { id: true, firstName: true, lastName: true, birthDate: true, gender: true, phone: true, email: true, tags: true, note: true, homeUnitId: true } });
  const addr = await P.memberAddress.findMany({ where: { tenantId: T }, select: { customerId: true, kind: true, isDefault: true, line1: true, province: true } });
  G.sysCols = { customers: custCols.map((c: Any) => canon(c)).sort(), addresses: addr.map((c: Any) => canon(c)).sort() };
  return G;
}

/** the read side of G1 — re-run with explicit objectKey (G1.11) and after the CRM data exists (G1.13) */
async function g1Reads(ctx: Any): Promise<Record<string, Any>> {
  const G: Record<string, Any> = {};
  const errs: Record<string, string> = {};
  const E = async (label: string, fn: () => Any) => { const r = await attempt(fn); errs[label] = r.ok ? `NO-ERROR ${canon(r.v)}` : r.err; };
  G.layout = {
    staff: await F.listLayout(ctx),
    customer: await F.listLayout(ctx, { audience: "customer" }),
    archived: await F.listLayout(ctx, { includeArchived: true }),
  };
  G.values = await F.getFieldValues(ctx, [C.A, C.B, C.C, "no-such-id", C.A]);
  const FILTERS: [string, Record<string, string>][] = [
    ["sel", { certLevel: "AOW,RESCUE" }], ["numRange", { logCount: "10..50" }], ["numEq", { logCount: "=5" }], ["numTo", { logCount: "..10" }],
    ["dateRange", { lastDiveOn: "2026-01-01..2026-12-31" }], ["dateEq", { lastDiveOn: "=2025-12-31" }], ["dtFrom", { nextCheckAt: "2026-04-15.." }],
    ["multi1", { interests: "wreck" }], ["multi2", { interests: "reef,macro" }], ["boolF", { hasGear: "false" }], ["boolThai", { hasGear: "ใช่" }],
    ["text", { favSpot: "Sim" }], ["textEq", { favSpot: "=Similan" }], ["lookup", { buddyId: C.B }], ["fileT", { medicalFile: "true" }], ["fileF", { medicalFile: "false" }],
    ["sysSelect", { gender: "MALE,FEMALE" }], ["sysDate", { birthDate: "1985-01-01..1989-12-31" }], ["sysText", { phone: "0810" }], ["sysTextEq", { phone: "=0810000003" }],
    ["sysAddress", { addressProvince: "กระบี่" }], ["sysMulti", { tags: "vip" }], ["sysLookup", { homeUnitId: UNIT }], ["combined", { certLevel: "OW,RESCUE", hasGear: "true" }], ["empty", {}],
  ];
  G.filterWhere = {}; G.filterRows = {};
  for (const [label, f] of FILTERS) {
    const w = await F.fieldFilterWhere(ctx, f);
    G.filterWhere[label] = w;
    const rows = await P.customer.findMany({ where: { AND: [{ tenantId: T, memberSystemId: M }, w] }, select: { id: true } });
    G.filterRows[label] = rows.map((r: Any) => TOK.get(r.id) ?? "<?id>").sort();
  }
  await E("filter.unknown", () => F.fieldFilterWhere(ctx, { nope: "x" }));
  await E("filter.notFilterable", () => F.fieldFilterWhere(ctx, { bio: "x" }));
  await E("filter.badNumber", () => F.fieldFilterWhere(ctx, { logCount: "a..b" }));
  await E("filter.badBool", () => F.fieldFilterWhere(ctx, { hasGear: "maybe" }));
  await E("filter.badDate", () => F.fieldFilterWhere(ctx, { lastDiveOn: "yesterday" }));
  await E("filter.emptySelect", () => F.fieldFilterWhere(ctx, { certLevel: "" }));
  const fld = (key: string) => G.layout.archived.sections.flatMap((s: Any) => s.fields).find((f: Any) => f.key === key);
  const CHECKS: [string, string, Any][] = [
    ["n7", "logCount", 7], ["n7.5", "logCount", 7.5], ["nStr", "logCount", "7"], ["selOk", "certLevel", "OW"], ["selBad", "certLevel", "x"],
    ["reqNull", "phone", null], ["trim", "phone", "  0899 "], ["date", "lastDiveOn", " 2026-01-02 "], ["dt", "nextCheckAt", "2026-01-02T03:04:05Z"],
    ["multiDup", "interests", ["macro", "macro"]], ["bool", "hasGear", false], ["blank", "favSpot", ""], ["file", "medicalFile", " f1 "],
    ["lookupNoDb", "buddyId", "abc"], ["money3", "depositSatang", 1.234],
  ];
  G.check = {};
  for (const [label, key, raw] of CHECKS) {
    const r = await attempt(() => F.checkFieldValue(fld(key), raw));
    G.check[label] = r.ok ? { value: r.v === undefined ? "<undefined>" : r.v } : { error: r.err };
  }
  const OPTS: [string, string, Any][] = [
    ["select", "SELECT", { choices: [{ value: "a", label: "A" }, { value: "b", label: "B", color: "red", extra: 1 }] }], ["selectEmpty", "SELECT", {}],
    ["numMinMax", "NUMBER", { min: 5, max: 1 }], ["textPattern", "TEXT", { pattern: "[" }], ["lookupUnit", "LOOKUP", { target: "UNIT" }], ["boolIgnores", "BOOLEAN", { x: 1 }],
  ];
  G.opts = {};
  for (const [label, type, raw] of OPTS) {
    const r = await attempt(() => F.normalizeFieldOptions(type, raw));
    G.opts[label] = r.ok ? { value: r.v } : { error: r.err };
  }
  G.errors = errs;
  return G;
}

function g1Snapshot(fix: Record<string, Any> | null, reads: Record<string, Any>): Record<string, string> {
  const out: Record<string, string> = {
    layout: canon(reads.layout), values: canon(reads.values), filterWhere: canon(reads.filterWhere), filterRows: canon(reads.filterRows),
    checks: canon({ check: reads.check, opts: reads.opts }), readErrors: canon(reads.errors),
  };
  if (fix) {
    Object.assign(out, {
      dto: canon(fix.dto), template: canon(fix.template), setReturns: canon(fix.setReturns), cells: canon({ cells: fix.cells, sysCols: fix.sysCols }),
      history: canon(fix.history), writeErrors: canon(fix.errors),
    });
  }
  return out;
}
const firstDiff = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return `@${i}: golden «${b.slice(Math.max(0, i - 60), i + 80)}» · actual «${a.slice(Math.max(0, i - 60), i + 80)}»`;
};
const goldenEq = (snap: Record<string, string>, keys: string[]) => {
  const bad = keys.filter((k) => GOLDEN[k] === undefined || snap[k] !== GOLDEN[k]);
  return { ok: bad.length === 0, detail: bad.map((k) => (GOLDEN[k] === undefined ? `${k}: golden not frozen` : `${k} ${firstDiff(snap[k] ?? "", GOLDEN[k])}`)).join(" ‖ ") || "-" };
};

// ═══════════════════════════════════════════════════════════════════════════════════
// NEW BEHAVIOUR (runs only when P0 says the engine honours ctx.objectKey)
// ═══════════════════════════════════════════════════════════════════════════════════
const FLD: Record<string, Record<string, string>> = { contact: {}, company: {}, deal: {}, car: {}, garage: {}, crm2: {}, b: {} };
const SEC: Record<string, string> = {};
const q = async <X = Any,>(sql: string): Promise<X[]> => (await P.$queryRawUnsafe(sql)) as X[];
const colTypes = async (t: string) => new Map((await q<{ column_name: string; data_type: string; udt_name: string }>(`select column_name, data_type, udt_name from information_schema.columns where table_schema='public' and table_name='${t}'`)).map((r) => [r.column_name, r]));
const valuesOf = async (ctx: Any, ids: string[]) => (await F.getFieldValues(ctx, ids)) as Record<string, Record<string, Any>>;
const blank = (v: Any) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

async function groupS5() {
  const TABLE: Record<string, string> = { contact: "CrmContact", company: "CrmCompany", deal: "CrmDeal" };
  const WANT: Record<string, number> = { contact: 14, company: 12, deal: 12 };
  const memberBefore = await P.memberField.count({ where: { systemId: M } });
  const first: Record<string, Tried> = {};
  let n = 1;
  for (const obj of ["contact", "company", "deal"]) {
    first[obj] = await attempt(() => F.applyTemplate(cx(obj), "system"));
    const rows = await P.memberField.findMany({ where: { tenantId: T, systemId: CRM1, objectKey: obj, isSystem: true } });
    const cols = await colTypes(TABLE[obj]);
    const keys = rows.map((r: Any) => r.systemKey);
    const bad = rows.filter((r: Any) => !r.systemKey || !cols.has(r.systemKey)).map((r: Any) => `${r.key}→${r.systemKey}`);
    const dupe = new Set(keys).size !== keys.length;
    chk(`C1.2a-S5.${n}`, `applyTemplate({objectKey:"${obj}"}, "system") seeds exactly ${WANT[obj]} system fields (§11.2) into the CRM system: isSystem · objectKey ${obj} · systemKey = a real ${TABLE[obj]} column (distinct) — a wrong count, a copy-into-values design (systemKey null) or a typo'd column fails`,
      first[obj].ok && first[obj].v?.added?.fields === WANT[obj] && rows.length === WANT[obj] && bad.length === 0 && !dupe,
      `${WANT[obj]} rows · all columns real`, `${show(first[obj])} · rows=${rows.length} · bad=${bad.join(",") || "-"} · dupe=${dupe} · keys=${keys.join(",")}`);
    n += 1;
  }
  const again = await Promise.all(["contact", "company", "deal"].map((o) => attempt(() => F.applyTemplate(cx(o), "system"))));
  const memberAfter = await P.memberField.count({ where: { systemId: M } });
  const crm2Sys = await P.memberField.count({ where: { systemId: CRM2 } });
  chk("C1.2a-S5.4", "second applyTemplate(\"system\") adds nothing for any object (idempotent) · the MEMBER system and the other CRM system gained no field",
    again.every((r) => r.ok && r.v?.added?.fields === 0 && r.v?.added?.sections === 0) && memberAfter === memberBefore && crm2Sys === 0,
    "added 0 ×3 · member/crm2 unchanged", `${again.map(show).join(" | ")} · member ${memberBefore}→${memberAfter} · crm2=${crm2Sys}`);
  for (const r of await P.memberField.findMany({ where: { systemId: CRM1, isSystem: true } })) FLD[r.objectKey][r.key] = r.id;

  // S5.5 pointer read
  const sysContact = await P.memberField.findMany({ where: { systemId: CRM1, objectKey: "contact", isSystem: true } });
  const cCols = await colTypes("CrmContact");
  const k1row = (await q(`select * from "CrmContact" where id='${K.k1}'`))[0] as Any;
  const bag = (await valuesOf(cx("contact"), [K.k1]))[K.k1] ?? {};
  const compared: string[] = []; const wrong: string[] = [];
  for (const f of sysContact) {
    const c = cCols.get(f.systemKey);
    if (!c || !["text", "character varying"].includes(c.data_type)) continue;
    const col = k1row?.[f.systemKey];
    if (col === null || col === undefined) continue;
    compared.push(f.key);
    if (bag[f.key] !== col) wrong.push(`${f.key}: ${j(bag[f.key])}≠${j(col)}`);
  }
  chk("C1.2a-S5.5", "system fields are POINTERS: getFieldValues(contact) returns the CrmContact column value for every text system field (≥3 compared — positive control)",
    compared.length >= 3 && wrong.length === 0, "≥3 compared · 0 wrong", `compared=${compared.join(",")} wrong=${wrong.join(" ; ") || "-"}`);
  // S5.6 pointer write
  const pick = ["jobTitle", "department", "note", "titleTh"]
    .map((k) => sysContact.find((f: Any) => f.systemKey === k && (f.type === "TEXT" || f.type === "LONG_TEXT"))).find(Boolean) as Any;
  const w = pick ? await attempt(() => F.setFieldValues(cx("contact"), K.k2, { [pick.key]: "QC-แก้ผ่านฟิลด์ระบบ" }, { via: "STAFF" })) : { ok: false, v: null, err: "no text system field among jobTitle/department/note/titleTh" };
  const colAfter = pick ? ((await q(`select "${pick.systemKey}" as v from "CrmContact" where id='${K.k2}'`))[0] as Any)?.v : null;
  const sysIds = (await P.memberField.findMany({ where: { systemId: CRM1, isSystem: true }, select: { id: true } })).map((r: Any) => r.id);
  const copies = await P.customRecordValue.count({ where: { fieldId: { in: sysIds } } });
  chk("C1.2a-S5.6", "setFieldValues on a contact system field writes the CrmContact column and NO CustomRecordValue row exists for any system field (no second copy)",
    w.ok && colAfter === "QC-แก้ผ่านฟิลด์ระบบ" && copies === 0, "column written · 0 copies", `${pick?.key ?? "-"} ${show(w)} · column=${j(colAfter)} · copies=${copies}`);
  // S5.7 D14
  const anyText = sysContact.find((f: Any) => f.type === "TEXT") as Any;
  const arch = await attempt(() => F.archiveField(cx("contact"), anyText?.id));
  const retype = await attempt(() => F.updateField(cx("contact"), anyText?.id, { type: "NUMBER" }));
  const relabel = await attempt(() => F.updateField(cx("contact"), anyText?.id, { label: "ป้ายใหม่ QC" }));
  const after = anyText ? await P.memberField.findUnique({ where: { id: anyText.id } }) : null;
  chk("C1.2a-S5.7", "D14 on CRM system fields: archive refused · type change refused · relabel allowed (row still isSystem, same type, not archived)",
    refused(arch) && refused(retype) && relabel.ok && after?.label === "ป้ายใหม่ QC" && after?.type === anyText?.type && !after?.archivedAt && after?.isSystem,
    "refused · refused · ok", `archive ${show(arch)} · retype ${show(retype)} · relabel ${show(relabel)}`);
  // S5.8 type compatibility
  const OK_TYPES: Record<string, string[]> = {
    TEXT: ["text", "character varying", "USER-DEFINED"], LONG_TEXT: ["text", "character varying"], LOOKUP: ["text", "character varying"], FILE: ["text", "character varying"],
    SELECT: ["text", "character varying", "USER-DEFINED"], NUMBER: ["integer", "bigint", "numeric", "smallint", "double precision", "real"], MONEY: ["integer", "bigint", "numeric"],
    DATE: ["timestamp without time zone", "timestamp with time zone", "date"], DATETIME: ["timestamp without time zone", "timestamp with time zone"], BOOLEAN: ["boolean"], MULTI_SELECT: ["ARRAY", "jsonb"],
  };
  const incompat: string[] = [];
  for (const obj of ["contact", "company", "deal"]) {
    const cols = await colTypes(TABLE[obj]);
    for (const f of await P.memberField.findMany({ where: { systemId: CRM1, objectKey: obj, isSystem: true } })) {
      const c = cols.get(f.systemKey);
      if (!c) continue;
      if (!(OK_TYPES[f.type] ?? []).includes(c.data_type)) incompat.push(`${obj}.${f.key}:${f.type}↔${c.data_type}`);
      if (c.data_type === "USER-DEFINED" && f.type === "SELECT") {
        const labels = (await q<{ enumlabel: string }>(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='${c.udt_name}'`)).map((r) => r.enumlabel);
        const choices = ((f.options as Any)?.choices ?? []).map((x: Any) => x.value);
        const off = choices.filter((v: string) => !labels.includes(v));
        if (choices.length === 0 || off.length > 0) incompat.push(`${obj}.${f.key}: choices ${choices.join("/") || "none"} vs enum ${labels.join("/")}`);
      }
    }
  }
  const sysTotal = await P.memberField.count({ where: { systemId: CRM1, isSystem: true, objectKey: { in: ["contact", "company", "deal"] } } });
  if (sysTotal !== 38) incompat.push(`precondition: ${sysTotal}/38 system fields exist`);
  chk("C1.2a-S5.8", "every system field's type fits its column (DATE↔timestamp, MONEY↔int/bigint, BOOLEAN↔boolean, MULTI↔array…) and a SELECT over an enum column offers exactly valid enum values — otherwise the first write fails in the database",
    incompat.length === 0, "0 incompatible", incompat.join(" · ") || "-", "MAJOR");
}

async function groupS1() {
  const made: { id: string; obj: string; sys: string; kind: "sec" | "fld" }[] = [];
  const sec = async (ctx: Any, key: string, extra: Record<string, Any> = {}) => {
    const d = await F.createSection(ctx, { key, label: `ส่วน ${key}`, ...extra });
    SEC[`${ctx.systemId === CRM1 ? "" : ctx.systemId === CRM2 ? "crm2:" : "b:"}${key}`] = d.id;
    made.push({ id: d.id, obj: ctx.objectKey, sys: ctx.systemId, kind: "sec" });
    return d.id as string;
  };
  const fld = async (ctx: Any, bucket: string, sectionId: string, key: string, type: string, extra: Record<string, Any> = {}) => {
    const d = await F.createField(ctx, { sectionId, key, label: `ฟิลด์ ${key}`, type, ...extra });
    FLD[bucket][key] = d.id;
    made.push({ id: d.id, obj: ctx.objectKey, sys: ctx.systemId, kind: "fld" });
    return d as Any;
  };
  const sC = await sec(cx("contact"), "sales");
  const choices = (...v: string[]) => ({ choices: v.map((x) => ({ value: x, label: x.toUpperCase() })) });
  await fld(cx("contact"), "contact", sC, "cText", "TEXT", { filterable: true });
  await fld(cx("contact"), "contact", sC, "cText2", "TEXT", { filterable: true });
  await fld(cx("contact"), "contact", sC, "cNum", "NUMBER", { filterable: true });
  await fld(cx("contact"), "contact", sC, "cDate", "DATE", { filterable: true });
  await fld(cx("contact"), "contact", sC, "cSel", "SELECT", { filterable: true, options: choices("a", "b", "c") });
  await fld(cx("contact"), "contact", sC, "cMulti", "MULTI_SELECT", { filterable: true, options: choices("x", "y", "z") });
  await fld(cx("contact"), "contact", sC, "cBool", "BOOLEAN", { filterable: true });
  await fld(cx("contact"), "contact", sC, "cMoney", "MONEY");
  await fld(cx("contact"), "contact", sC, "cDt", "DATETIME");
  await fld(cx("contact"), "contact", sC, "cLong", "LONG_TEXT");
  await fld(cx("contact"), "contact", sC, "cFile", "FILE");
  await fld(cx("contact"), "contact", sC, "cHist", "TEXT", { trackHistory: true });
  await fld(cx("contact"), "contact", sC, "cSens", "TEXT", { sensitive: true });
  await fld(cx("contact"), "contact", sC, "cMax", "TEXT", { options: { maxLength: 20 } });
  await fld(cx("contact"), "contact", sC, "cRace", "TEXT", { trackHistory: true });
  const sCo = await sec(cx("company"), "co_extra");
  const sCoS = await sec(cx("company"), "co_secret", { sensitive: true });
  const coText = await fld(cx("company"), "company", sCo, "cText", "TEXT");
  await fld(cx("company"), "company", sCoS, "coSecret", "TEXT");
  const sD = await sec(cx("deal"), "deal_extra");
  await fld(cx("deal"), "deal", sD, "dText", "TEXT");
  const sCar = await sec(cx("car"), "car_main");
  await fld(cx("car"), "car", sCar, "plate", "TEXT", { filterable: true, trackHistory: true });
  await fld(cx("car"), "car", sCar, "km", "NUMBER", { filterable: true });
  await fld(cx("car"), "car", sCar, "regOn", "DATE", { filterable: true });
  await fld(cx("car"), "car", sCar, "color", "SELECT", { filterable: true, options: choices("red", "blue") });
  await fld(cx("car"), "car", sCar, "extras", "MULTI_SELECT", { filterable: true, options: choices("tow", "gps") });
  await fld(cx("car"), "car", sCar, "insured", "BOOLEAN", { filterable: true });
  const sG = await sec(cx("garage"), "garage_main");
  await fld(cx("garage"), "garage", sG, "gname", "TEXT");
  // LOOKUPs that depend on the new options.objectKey / CRM targets — kept apart so a failure here does not stop S1
  const look = [
    await attempt(() => fld(cx("contact"), "contact", sC, "cLook", "LOOKUP", { filterable: true, options: { target: "COMPANY" } })),
    await attempt(() => fld(cx("car"), "car", sCar, "garageRef", "LOOKUP", { filterable: true, options: { target: "CUSTOM", objectKey: "garage" } })),
    await attempt(() => fld(cx("car"), "car", sCar, "ownerRef", "LOOKUP", { filterable: true, options: { target: "CONTACT" } })),
  ];
  if (!look.every((r) => r.ok)) console.log(`  ℹ️  LOOKUP fields: ${look.map(show).join(" | ")}`);
  const s2 = await sec(cx2("contact"), "sys2_sec");
  await fld(cx2("contact"), "crm2", s2, "sys2Only", "TEXT", { filterable: true });
  await fld(cx2("contact"), "crm2", s2, "cText", "TEXT", { filterable: true });
  const sB = await sec(cxB("contact"), "b_sec");
  await fld(cxB("contact"), "b", sB, "cText", "TEXT", { filterable: true });
  const sBcar = await sec(cxB("car"), "b_car");
  await fld(cxB("car"), "b", sBcar, "plate", "TEXT", { filterable: true });

  // S1.1 rows carry objectKey + systemId
  const secRows = await P.memberSection.findMany({ where: { id: { in: made.filter((m) => m.kind === "sec").map((m) => m.id) } } });
  const fldRows = await P.memberField.findMany({ where: { id: { in: made.filter((m) => m.kind === "fld").map((m) => m.id) } } });
  const byId = new Map<string, Any>([...secRows, ...fldRows].map((r: Any) => [r.id, r]));
  const wrong = made.filter((m) => byId.get(m.id)?.objectKey !== m.obj || byId.get(m.id)?.systemId !== m.sys).map((m) => `${m.kind}:${m.obj}:${byId.get(m.id)?.objectKey}`);
  chk("C1.2a-S1.1", `createSection/createField with ctx.objectKey store that objectKey and the ctx CRM system on every row (${made.length} rows · contact/company/deal/car/garage · 2 CRM systems · 2 tenants)`,
    wrong.length === 0 && made.length >= 40, "all rows tagged", wrong.join(",") || `${made.length} ok`);
  // S1.2 layout per object
  const layoutProblems: string[] = [];
  for (const obj of ["contact", "company", "deal", "car", "garage"]) {
    const lay = await F.listLayout(cx(obj));
    const secIds = lay.sections.map((s: Any) => s.id);
    const fIds = lay.sections.flatMap((s: Any) => s.fields.map((f: Any) => f.id));
    const dbS = await P.memberSection.findMany({ where: { id: { in: secIds } } });
    const dbF = await P.memberField.findMany({ where: { id: { in: fIds } } });
    const foreign = [...dbS, ...dbF].filter((r: Any) => r.objectKey !== obj || r.systemId !== CRM1).map((r: Any) => `${r.key}(${r.objectKey})`);
    const expected = await P.memberField.findMany({ where: { systemId: CRM1, objectKey: obj, archivedAt: null }, select: { id: true } });
    const missing = expected.filter((e: Any) => !fIds.includes(e.id)).length;
    if (foreign.length || missing || dbS.length !== secIds.length || dbF.length !== fIds.length) layoutProblems.push(`${obj}: foreign=${foreign.join(",") || "-"} missing=${missing}`);
  }
  chk("C1.2a-S1.2", "listLayout(ctx.objectKey) returns exactly that object's sections and fields for contact · company · deal · car · garage (nothing of another object, nothing missing)",
    layoutProblems.length === 0, "exact per object", layoutProblems.join(" ‖ ") || "-");
  // S1.3 key uniqueness is per object
  const dupSame = await attempt(() => F.createField(cx("contact"), { sectionId: sC, key: "cText", label: "ซ้ำ", type: "TEXT" }));
  const secSameKey = await attempt(() => F.createSection(cx("company"), { key: "sales", label: "sales ของบริษัท" }));
  const del = secSameKey.ok ? await attempt(() => F.deleteSection(cx("company"), secSameKey.v.id)) : secSameKey;
  chk("C1.2a-S1.3", "key uniqueness is per (system, objectKey): `cText` exists on contact AND company · section key `sales` reusable on company · a second `cText` on contact is refused (Thai)",
    FLD.contact.cText && coText?.id && FLD.contact.cText !== coText.id && secSameKey.ok && del.ok && refused(dupSame),
    "both exist · reuse ok · dup refused", `company cText=${!!coText?.id} · sectionReuse ${show(secSameKey)} · dup ${show(dupSame)}`);
  // S1.4 no field in another object's section
  const crossCreate = await attempt(() => F.createField(cx("company"), { sectionId: sC, key: "leak", label: "รั่ว", type: "TEXT" }));
  const crossMove1 = await attempt(() => F.updateField(cx("company"), coText.id, { sectionId: sC }));
  const crossMove2 = await attempt(() => F.updateField(cx("contact"), FLD.contact.cText, { sectionId: sCo }));
  const leakRows = await P.memberField.count({ where: { systemId: CRM1, key: "leak" } });
  const coTextRow = await P.memberField.findUnique({ where: { id: coText.id } });
  const cTextRow = await P.memberField.findUnique({ where: { id: FLD.contact.cText } });
  chk("C1.2a-S1.4", "a field can never sit in a section of another object: createField(company → contact section) and updateField moves across objects (both directions) are refused, rows unchanged",
    refused(crossCreate) && refused(crossMove1) && refused(crossMove2) && leakRows === 0 && coTextRow?.sectionId === sCo && cTextRow?.sectionId === sC,
    "3 refusals · unchanged", `${show(crossCreate)} | ${show(crossMove1)} | ${show(crossMove2)} · leak=${leakRows}`);
  // S1.5 id-based ops across objects
  const empty = await F.createSection(cx("garage"), { key: "garage_empty", label: "ว่าง" });
  const u1 = await attempt(() => F.updateField(cx("company"), FLD.contact.cText, { label: "hacked" }));
  const a1 = await attempt(() => F.archiveField(cx("deal"), FLD.contact.cText));
  const d1 = await attempt(() => F.deleteSection(cx("car"), empty.id));
  const us = await attempt(() => F.updateSection(cx("deal"), sC, { label: "hacked" }));
  const still = await P.memberSection.count({ where: { id: empty.id } });
  const cRow = await P.memberField.findUnique({ where: { id: FLD.contact.cText } });
  const sRow = await P.memberSection.findUnique({ where: { id: sC } });
  const d2 = await attempt(() => F.deleteSection(cx("garage"), empty.id));
  chk("C1.2a-S1.5", "id-based operations are object-scoped: updateField/archiveField/updateSection/deleteSection with the ctx of ANOTHER object are refused and change nothing (positive control: the right object deletes the empty section)",
    refused(u1) && refused(a1) && refused(d1) && refused(us) && still === 1 && cRow?.label !== "hacked" && !cRow?.archivedAt && sRow?.label !== "hacked" && d2.ok,
    "4 refusals · unchanged · control ok", `${show(u1)} | ${show(a1)} | ${show(d1)} | ${show(us)} | control ${show(d2)}`);
  // S1.6 stray rows never leak across the customer / CRM boundary
  const ctxM2 = { tenantId: T, systemId: M2, actorUserId: U.owner };
  const m2s = await F.createSection(ctxM2, { key: "m2sec", label: "ส่วนสมาชิก" });
  await F.createField(ctxM2, { sectionId: m2s.id, key: "m2f", label: "m2f", type: "TEXT", filterable: true });
  const straySec = await P.memberSection.create({ data: { tenantId: T, systemId: M2, objectKey: "contact", key: "stray", label: "หลง" } });
  const strayF = await P.memberField.create({ data: { tenantId: T, systemId: M2, sectionId: straySec.id, objectKey: "contact", key: "strayF", label: "หลง", type: "TEXT", filterable: true } });
  const custM2 = await P.customer.create({ data: { tenantId: T, memberSystemId: M2, name: "สมาชิก M2", phone: "0819999999" } });
  await P.memberFieldValue.create({ data: { tenantId: T, customerId: custM2.id, fieldId: strayF.id, valueText: "หลุด" } });
  const strayCust = await P.memberSection.create({ data: { tenantId: T, systemId: CRM1, objectKey: "customer", key: "strayCust", label: "หลงฝั่ง CRM" } });
  SEC.strayCust = strayCust.id;
  const layM2 = await F.listLayout(ctxM2);
  const m2Keys = layM2.sections.map((s: Any) => s.key);
  const setStray = await attempt(() => F.setFieldValues(ctxM2, custM2.id, { strayF: "x" }, { via: "STAFF" }));
  const filtStray = await attempt(() => F.fieldFilterWhere(ctxM2, { strayF: "x" }));
  const valsM2 = await F.getFieldValues(ctxM2, [custM2.id]);
  const layC = await F.listLayout(cx("contact"));
  chk("C1.2a-S1.6", "the customer path filters objectKey=\"customer\" and CRM paths never see customer rows: a stray contact-objectKey section/field inside a MEMBER system is invisible to listLayout/getFieldValues and refused by setFieldValues/fieldFilterWhere; a stray customer section inside the CRM system is absent from the contact layout",
    m2Keys.includes("m2sec") && !m2Keys.includes("stray") && refused(setStray) && refused(filtStray) && valsM2?.[custM2.id]?.strayF === undefined && !layC.sections.some((s: Any) => s.key === "strayCust"),
    "invisible · refused", `m2 sections=${m2Keys.join(",")} · set ${show(setStray)} · filter ${show(filtStray)} · values=${j(valsM2?.[custM2.id])} · contactLayout has strayCust=${layC.sections.some((s: Any) => s.key === "strayCust")}`);
  // S1.7 reorder is object-scoped
  const others = async () => j(await P.memberSection.findMany({ where: { systemId: CRM1, objectKey: { not: "contact" } }, orderBy: { id: "asc" }, select: { id: true, sortOrder: true } }));
  const before = await others();
  const contactSecs = (await F.listLayout(cx("contact"))).sections.map((s: Any) => s.id);
  const ro = await attempt(() => F.reorderSections(cx("contact"), [...contactSecs].reverse()));
  const rf = await attempt(() => F.reorderFields(cx("contact"), sC, [FLD.contact.cText2, FLD.contact.cText]));
  const after = await others();
  const newOrder = (await F.listLayout(cx("contact"))).sections.map((s: Any) => s.id);
  chk("C1.2a-S1.7", "reorderSections/reorderFields with objectKey contact reorder ONLY contact rows — the sortOrder of company/deal/car/garage/customer sections of the same CRM system is untouched",
    ro.ok && rf.ok && before === after && j(newOrder) === j([...contactSecs].reverse()),
    "others unchanged · contact reversed", `${show(ro)} · ${show(rf)} · othersChanged=${before !== after} · reversed=${j(newOrder) === j([...contactSecs].reverse())}`);
}

const setV = (ctx: Any, id: string, values: Record<string, Any>) => attempt(() => F.setFieldValues(ctx, id, values, { via: "STAFF" }));

async function groupS2() {
  const K1V = { cText: "Alpha Travel", cText2: "Beta", cNum: 10, cDate: "2026-01-15", cSel: "a", cMulti: ["x", "y"], cBool: true, cMoney: 1234.56, cDt: "2026-03-15T09:30:00+07:00", cLong: "ข้อความยาว\nสองบรรทัด", cFile: "file-qc-k1", cMax: "สั้น" };
  const w = await setV(cx("contact"), K.k1, K1V);
  const rows = await P.customRecordValue.findMany({ where: { recordId: K.k1 } });
  const memberRows = await P.memberFieldValue.count({ where: { tenantId: T, customerId: K.k1 } });
  chk("C1.2a-S2.1", "setFieldValues(ctx{objectKey:\"contact\"}, contactId, 12 values of 11 types) writes 12 CustomRecordValue rows (recordType CONTACT · recordId · tenantId) and no MemberFieldValue row; `changed` lists every key",
    w.ok && sameSet(w.v?.changed ?? [], Object.keys(K1V)) && rows.length === 12 && rows.every((r: Any) => r.recordType === "CONTACT" && r.tenantId === T) && memberRows === 0,
    "12 rows CONTACT", `${show(w)} · rows=${rows.length} types=${[...new Set(rows.map((r: Any) => r.recordType))].join(",")} · memberRows=${memberRows}`);
  const bag = (await valuesOf(cx("contact"), [K.k1]))[K.k1] ?? {};
  const expect: Record<string, Any> = { ...K1V, cDt: "2026-03-15T02:30:00.000Z" };
  const diff = Object.keys(expect).filter((k) => j(bag[k]) !== j(expect[k])).map((k) => `${k}: ${j(bag[k])}≠${j(expect[k])}`);
  chk("C1.2a-S2.2", "getFieldValues(contact) round-trips every type exactly as the customer path would (DATE \"YYYY-MM-DD\" · DATETIME ISO UTC · MONEY number · MULTI array)",
    diff.length === 0, "identical", diff.join(" · ") || "-");
  const cell = (key: string) => rows.find((r: Any) => r.fieldId === FLD.contact[key]) as Any;
  const cellOk = cell("cDate")?.valueDate?.toISOString() === "2026-01-15T00:00:00.000Z" && Number(cell("cNum")?.valueNumber) === 10 && j(cell("cSel")?.valueOptions) === j(["a"])
    && j(cell("cMulti")?.valueOptions) === j(["x", "y"]) && cell("cBool")?.valueBool === true && cell("cDt")?.valueDate?.toISOString() === "2026-03-15T02:30:00.000Z"
    && Number(cell("cMoney")?.valueNumber) === 1234.56 && cell("cFile")?.valueFileId === "file-qc-k1" && cell("cText")?.valueText === "Alpha Travel" && cell("cText")?.valueNumber === null;
  chk("C1.2a-S2.3", "cells are typed like MemberFieldValue: DATE = midnight UTC · DATETIME = instant · SELECT = [value] · numbers in valueNumber · other columns null",
    cellOk, "typed cells", j(rows.map((r: Any) => ({ f: Object.entries(FLD.contact).find(([, v]) => v === r.fieldId)?.[0], t: r.valueText, n: r.valueNumber, d: r.valueDate, o: r.valueOptions, b: r.valueBool, f2: r.valueFileId }))));
  const wc = await setV(cx("company"), CO.co1, { cText: "ข้อมูลบริษัท" });
  const wd = await setV(cx("deal"), DEAL, { dText: "ข้อมูลดีล" });
  const wr = await setV(cx("car"), R.r1, { plate: "กข 1234" });
  const rt = async (id: string) => (await P.customRecordValue.findMany({ where: { recordId: id } })).map((r: Any) => r.recordType).join(",");
  chk("C1.2a-S2.4", "recordType follows the object: company → COMPANY · deal → DEAL · custom object record → CUSTOM",
    wc.ok && wd.ok && wr.ok && (await rt(CO.co1)) === "COMPANY" && (await rt(DEAL)) === "DEAL" && (await rt(R.r1)) === "CUSTOM",
    "COMPANY/DEAL/CUSTOM", `${show(wc)} ${show(wd)} ${show(wr)} → ${await rt(CO.co1)}/${await rt(DEAL)}/${await rt(R.r1)}`);
  const same = await setV(cx("contact"), K.k1, { cText: "Alpha Travel" });
  const nul = await setV(cx("contact"), K.k1, { cMax: null });
  const cMaxRows = await P.customRecordValue.count({ where: { recordId: K.k1, fieldId: FLD.contact.cMax } });
  const atomic = await setV(cx("contact"), K.k1, { cText2: "ควรไม่ถูกเขียน", cNum: "ไม่ใช่ตัวเลข" });
  const t2 = (await P.customRecordValue.findFirst({ where: { recordId: K.k1, fieldId: FLD.contact.cText2 } }))?.valueText;
  chk("C1.2a-S2.5", "same value ⇒ changed [] · null ⇒ the value row is deleted · one invalid value ⇒ the whole call writes nothing (Thai error)",
    same.ok && (same.v?.changed ?? ["?"]).length === 0 && nul.ok && cMaxRows === 0 && refused(atomic) && t2 === "Beta",
    "[] · deleted · atomic", `same ${show(same)} · null rows=${cMaxRows} · atomic ${show(atomic)} cText2=${j(t2)}`);
  const asContact = await setV(cx("contact"), DEAL, { cText: "ผิดชนิด" });
  const asCar = await setV(cx("car"), R.g1, { plate: "ผิดวัตถุ" });
  const asCompany = await setV(cx("company"), K.k2, { cText: "ผิดชนิด" });
  const stray = await P.customRecordValue.count({ where: { recordId: { in: [DEAL, R.g1, K.k2] }, valueText: { in: ["ผิดชนิด", "ผิดวัตถุ"] } } });
  const control = await setV(cx("garage"), R.g1, { gname: "อู่ถูกวัตถุ" });
  chk("C1.2a-S2.6", "the record must be of the ctx object in this CRM system: a deal id written as a contact, a garage record written as a car, a contact written as a company — all refused, no row written",
    refused(asContact) && refused(asCar) && refused(asCompany) && stray === 0 && control.ok, "3 refusals · 0 rows · control ok", `${show(asContact)} | ${show(asCar)} | ${show(asCompany)} · rows=${stray} · control (garage record as garage) ${show(control)}`);
}

async function groupS3() {
  // fixture values (k1 set in S2)
  const must = async (p: Promise<Tried>) => { const r = await p; if (!r.ok) throw new Error(`fixture write failed: ${r.err}`); };
  await must(setV(cx("contact"), K.k2, { cText: "Beta Tours", cText2: "Alpha", cNum: 25.5, cDate: "2026-02-28", cSel: "b", cMulti: ["y"], cBool: false }));
  await must(setV(cx("contact"), K.k3, { cText: "Gamma", cNum: 100, cDate: "2025-12-31", cSel: "c", cMulti: ["z"] }));
  await must(setV(cx2("contact"), K.k5, { cText: "Alpha Omega", sys2Only: "x" }));
  await must(setV(cxB("contact"), K.kb, { cText: "Alpha B" }));
  await must(setV(cx("car"), R.r1, { plate: "กข 1234", km: 12000, regOn: "2024-05-01", color: "red", extras: ["tow", "gps"], insured: true }));
  await must(setV(cx("car"), R.r2, { plate: "ขค 5678", km: 55000.5, regOn: "2025-01-10", color: "blue", extras: ["gps"], insured: false }));
  await must(setV(cx("car"), R.r3, { plate: "กข 9999", km: 800, regOn: "2023-11-30", color: "red" }));
  await must(setV(cxB("car"), R.rb, { plate: "กข 0000" }));
  const refs = [
    await setV(cx("contact"), K.k1, { cLook: CO.co1 }), await setV(cx("contact"), K.k2, { cLook: CO.co2 }), await setV(cx("contact"), K.k3, { cLook: CO.co1 }),
    await setV(cx("car"), R.r1, { garageRef: R.g1, ownerRef: K.k1 }), await setV(cx("car"), R.r2, { garageRef: R.g2, ownerRef: K.k2 }), await setV(cx("car"), R.r3, { garageRef: R.g1, ownerRef: K.k1 }),
  ];
  const refsOk = refs.every((r) => r.ok);
  const name = new Map<string, string>([...Object.entries(K), ...Object.entries(R)].map(([k, v]) => [v, k]));
  const sel = async (obj: "contact" | "car", f: Record<string, string>) => {
    const r = await attempt(() => F.fieldFilterWhere(cx(obj), f));
    if (!r.ok) return { scoped: [`ERR ${cut(r.err, 120)}`], unscoped: [] as string[] };
    const scoped = obj === "contact"
      ? await P.crmContact.findMany({ where: { AND: [{ tenantId: T, systemId: CRM1 }, r.v] }, select: { id: true } })
      : await P.customRecord.findMany({ where: { AND: [{ objectId: OBJ.car }, r.v] }, select: { id: true } });
    const unscoped = obj === "contact"
      ? await P.crmContact.findMany({ where: r.v, select: { id: true } })
      : await P.customRecord.findMany({ where: r.v, select: { id: true } });
    const nm = (rows: Any[]) => rows.map((x: Any) => name.get(x.id) ?? `foreign:${x.id}`).sort();
    return { scoped: nm(scoped), unscoped: nm(unscoped) };
  };
  const TYPES: [string, [("contact" | "car"), Record<string, string>, string[]][]][] = [
    ["TEXT", [["contact", { cText: "Alpha" }, ["k1"]], ["contact", { cText: "=Gamma" }, ["k3"]], ["contact", { cText: "=Gam" }, []], ["car", { plate: "กข" }, ["r1", "r3"]]]],
    ["NUMBER", [["contact", { cNum: "10..30" }, ["k1", "k2"]], ["contact", { cNum: "=100" }, ["k3"]], ["contact", { cNum: "26.." }, ["k3"]], ["car", { km: "1000..60000" }, ["r1", "r2"]]]],
    ["DATE", [["contact", { cDate: "2026-01-01..2026-02-28" }, ["k1", "k2"]], ["contact", { cDate: "=2025-12-31" }, ["k3"]], ["car", { regOn: "2024-01-01..2025-12-31" }, ["r1", "r2"]]]],
    ["SELECT", [["contact", { cSel: "a,c" }, ["k1", "k3"]], ["car", { color: "red" }, ["r1", "r3"]]]],
    ["MULTI_SELECT", [["contact", { cMulti: "y" }, ["k1", "k2"]], ["contact", { cMulti: "z,x" }, ["k1", "k3"]], ["car", { extras: "tow" }, ["r1"]]]],
    ["BOOLEAN", [["contact", { cBool: "true" }, ["k1"]], ["contact", { cBool: "false" }, ["k2"]], ["car", { insured: "false" }, ["r2"]]]],
    ["LOOKUP", [["contact", { cLook: CO.co1 }, ["k1", "k3"]], ["car", { garageRef: R.g1 }, ["r1", "r3"]], ["car", { ownerRef: K.k1 }, ["r1", "r3"]]]],
  ];
  let n = 1;
  for (const [type, list] of TYPES) {
    const bad: string[] = [];
    for (const [obj, f, want] of list) {
      const got = await sel(obj, f);
      if (j(got.scoped) !== j([...want].sort()) || j(got.unscoped) !== j([...want].sort())) bad.push(`${obj} ${j(f)} → scoped ${j(got.scoped)} unscoped ${j(got.unscoped)} (want ${j(want)})`);
    }
    chk(`C1.2a-S3.${n}`, `fieldFilterWhere ${type} on a contact AND on a custom-object record selects exactly the expected rows — with and without an outer system scope (decoys: same text in another field, same key in another CRM system and another tenant)${type === "LOOKUP" && !refsOk ? " [LOOKUP fixture writes failed]" : ""}`,
      bad.length === 0 && (type !== "LOOKUP" || refsOk), "exact rows", bad.join(" ‖ ") || (refsOk ? "-" : refs.map(show).join(" | ")));
    n += 1;
  }
  const comb = await sel("contact", { cSel: "a,b", cNum: "20.." });
  const empty = await attempt(() => F.fieldFilterWhere(cx("contact"), {}));
  const emptyRows = empty.ok ? await P.crmContact.count({ where: { AND: [{ tenantId: T, systemId: CRM1 }, empty.v] } }) : -1;
  const allRows = await P.crmContact.count({ where: { tenantId: T, systemId: CRM1 } });
  chk("C1.2a-S3.8", "two filters combine with AND ({cSel:a,b · cNum:20..} → k2 only) · no filter = a fragment that selects every contact",
    j(comb.scoped) === j(["k2"]) && emptyRows === allRows, "k2 · all", `comb=${j(comb.scoped)} · empty ${show(empty)} rows=${emptyRows}/${allRows}`);
  const phoneF = (await P.memberField.findMany({ where: { systemId: CRM1, objectKey: "contact", isSystem: true } })).find((f: Any) => f.systemKey === "phone") as Any;
  let sysOk = false; let sysDetail = "no system field with systemKey phone on contact";
  if (phoneF) {
    const up = await attempt(() => F.updateField(cx("contact"), phoneF.id, { filterable: true }));
    const got = await sel("contact", { [phoneF.key]: "08911100" });
    sysOk = up.ok && j(got.scoped) === j(["k1", "k2", "k3"]);
    sysDetail = `${show(up)} · ${j(got.scoped)}`;
  }
  chk("C1.2a-S3.9", "a filter on a contact SYSTEM field (phone) filters the CrmContact column (k1,k2,k3 — not k4, not the race contacts)", sysOk, "k1,k2,k3", sysDetail);
  const e1 = await attempt(() => F.fieldFilterWhere(cx("contact"), { nope: "x" }));
  const e2 = await attempt(() => F.fieldFilterWhere(cx("contact"), { cHist: "x" }));
  const e3 = await attempt(() => F.fieldFilterWhere(cx("contact"), { plate: "กข" }));
  const e4 = await attempt(() => F.fieldFilterWhere(cx("car"), { cNum: "1..2" }));
  const e5 = await attempt(() => F.fieldFilterWhere(cx("contact"), { cNum: "a..b" }));
  chk("C1.2a-S3.10", "filters refuse (Thai): unknown key · not filterable · a key of another object (car key on contact, contact key on car) · malformed number",
    [e1, e2, e3, e4, e5].every(refused), "5 refusals", [e1, e2, e3, e4, e5].map(show).join(" | "));
}

async function groupS4() {
  const hist = (rec: string, fid: string) => P.customRecordValueHistory.findMany({ where: { recordId: rec, fieldId: fid }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  for (const v of ["v1", "v2", "v2", null]) await setV(cx("contact"), K.k4, { cHist: v });
  const h = await hist(K.k4, FLD.contact.cHist);
  const chain = h.map((r: Any) => `${j(r.oldValue)}→${j(r.newValue)}`);
  chk("C1.2a-S4.1", "trackHistory on a contact field: v1, v2, v2 (no change), null ⇒ exactly 3 CustomRecordValueHistory rows null→v1 · v1→v2 · v2→null with tenantId, recordId and changedById = the actor",
    j(chain) === j(["null→\"v1\"", "\"v1\"→\"v2\"", "\"v2\"→null"]) && h.every((r: Any) => r.tenantId === T && r.changedById === U.owner),
    "3 ordered rows", `${j(chain)} · by=${j(h.map((r: Any) => r.changedById))}`);
  await setV(cx("contact"), K.k4, { cText: "ไม่ติดตาม" });
  const untracked = await P.customRecordValueHistory.count({ where: { recordId: K.k4, fieldId: FLD.contact.cText } });
  const memberHist = await P.memberFieldValueHistory.count({ where: { tenantId: T, customerId: { in: Object.values(K) } } });
  chk("C1.2a-S4.2", "a field without trackHistory writes no history row · nothing of a CRM record ever lands in MemberFieldValueHistory",
    untracked === 0 && memberHist === 0 && h.length > 0 && (await P.customRecordValue.count({ where: { recordId: K.k4, fieldId: FLD.contact.cText } })) === 1,
    "0 · 0 (value row written, tracked field has history)", `untracked=${untracked} memberHistory=${memberHist} trackedRows=${h.length}`);
  await setV(cx("car"), R.r2, { plate: "ขค 5679" });
  const hc = await hist(R.r2, FLD.car.plate);
  chk("C1.2a-S4.3", "history works for a custom-object record (CUSTOM): plate null→ขค 5678 → ขค 5679",
    j(hc.map((r: Any) => `${j(r.oldValue)}→${j(r.newValue)}`)) === j(["null→\"ขค 5678\"", "\"ขค 5678\"→\"ขค 5679\""]), "2 rows", j(hc.map((r: Any) => [r.oldValue, r.newValue])));
}

async function groupS7() {
  const gRef = FLD.car.garageRef ? await P.memberField.findUnique({ where: { id: FLD.car.garageRef } }) : null;
  chk("C1.2a-S7.1", "LOOKUP to another custom object: createField(car, {target:\"CUSTOM\", objectKey:\"garage\"}) is accepted and the options keep objectKey",
    (gRef?.options as Any)?.target === "CUSTOM" && (gRef?.options as Any)?.objectKey === "garage", "{target:CUSTOM, objectKey:garage}", j(gRef?.options ?? "field missing"));
  const sCar = SEC.car_main;
  const self = await attempt(() => F.createField(cx("car"), { sectionId: sCar, key: "selfRef", label: "วนตัวเอง", type: "LOOKUP", options: { target: "CUSTOM", objectKey: "car" } }));
  const selfUpd = gRef ? await attempt(() => F.updateField(cx("car"), gRef.id, { options: { target: "CUSTOM", objectKey: "car" } })) : { ok: true, v: null, err: "" };
  const gAfter = gRef ? await P.memberField.findUnique({ where: { id: gRef.id } }) : null;
  chk("C1.2a-S7.2", "no self-cycle: a car LOOKUP pointing at car is refused on create AND on update (options unchanged)",
    refused(self) && refused(selfUpd) && (gAfter?.options as Any)?.objectKey === "garage", "refused ×2", `${show(self)} | ${show(selfUpd)} · after=${j(gAfter?.options)}`);
  const noKey = await attempt(() => F.createField(cx("car"), { sectionId: sCar, key: "lk1", label: "x", type: "LOOKUP", options: { target: "CUSTOM" } }));
  const ghost = await attempt(() => F.createField(cx("car"), { sectionId: sCar, key: "lk2", label: "x", type: "LOOKUP", options: { target: "CUSTOM", objectKey: "ghost" } }));
  const other = await attempt(() => F.createField(cx("car"), { sectionId: sCar, key: "lk3", label: "x", type: "LOOKUP", options: { target: "CUSTOM", objectKey: "boat" } }));
  chk("C1.2a-S7.3", "LOOKUP CUSTOM needs a real object of THIS CRM system: missing objectKey · unknown \"ghost\" · \"boat\" (exists only in the other CRM system) — all refused",
    !!gRef && refused(noKey) && refused(ghost) && refused(other), "3 refusals (control: the garage LOOKUP exists)", `${show(noKey)} | ${show(ghost)} | ${show(other)}`, "MAJOR");
  const stored = await P.customRecordValue.findFirst({ where: { recordId: R.r1, fieldId: FLD.car.garageRef } });
  const v1 = await setV(cx("car"), R.r2, { garageRef: R.r3 });
  const v2 = await setV(cx("car"), R.r2, { garageRef: R.g3 });
  const v3 = await setV(cx("car"), R.r2, { garageRef: R.rb });
  const v4 = await setV(cx("car"), R.r2, { garageRef: "no-such-record" });
  const r2g = await P.customRecordValue.findFirst({ where: { recordId: R.r2, fieldId: FLD.car.garageRef } });
  chk("C1.2a-S7.4", "a LOOKUP value must be a record of the target object in this CRM system: garage g1 stored as valueRef · a car record · the other system's garage · another tenant's record · a made-up id — all refused, r2 keeps g2",
    stored?.valueRef === R.g1 && [v1, v2, v3, v4].every(refused) && r2g?.valueRef === R.g2, "ok + 4 refusals", `r1=${stored?.valueRef === R.g1} · ${[v1, v2, v3, v4].map(show).join(" | ")} · r2=${r2g?.valueRef === R.g2}`);
  const o1 = await setV(cx("car"), R.r3, { ownerRef: K.k5 });
  const o2 = await setV(cx("car"), R.r3, { ownerRef: K.kb });
  const o3 = await setV(cx("car"), R.r3, { ownerRef: DEAL });
  const o4 = await setV(cx("contact"), K.k3, { cLook: CO.coX });
  const o5 = await setV(cx("car"), R.r3, { ownerRef: K.k3 });
  chk("C1.2a-S7.5", "LOOKUP CONTACT/COMPANY targets check the CRM tables of THIS system: other-system contact · other-tenant contact · a deal id · other-system company refused; a same-system contact accepted",
    [o1, o2, o3, o4].every(refused) && o5.ok, "4 refusals + ok", `${[o1, o2, o3, o4, o5].map(show).join(" | ")}`);
}

async function groupS8() {
  const MEM = (await import("@/lib/modules/member" as string)) as Any;
  const names = ["listLayout", "getFieldValues", "setFieldValues", "fieldFilterWhere", "applyTemplate", "checkFieldValue", "createSection", "createField", "updateField"];
  const ns = MEM?.fields;
  const missing = names.filter((n) => typeof ns?.[n] !== "function" || ns[n] !== F[n]);
  chk("C1.2a-S8.1", "the member facade exposes a `fields` namespace whose functions ARE the engine's (same identity — no wrapper that could drop objectKey)",
    !!ns && missing.length === 0, "all present", `ns=${!!ns} · missing/different: ${missing.join(",") || "-"}`);
}

async function groupX1() {
  const lay1 = await F.listLayout(cx("contact"));
  const ids1 = [...lay1.sections.map((s: Any) => s.id), ...lay1.sections.flatMap((s: Any) => s.fields.map((f: Any) => f.id))];
  const lay2 = await F.listLayout(cx2("contact"));
  const ids2 = [...lay2.sections.map((s: Any) => s.id), ...lay2.sections.flatMap((s: Any) => s.fields.map((f: Any) => f.id))];
  const leak12 = ids1.filter((x) => [SEC["crm2:sys2_sec"], FLD.crm2.sys2Only, FLD.crm2.cText].includes(x));
  const leak21 = ids2.filter((x) => ids1.includes(x));
  chk("C1.2a-X1.1", "another CRM system of the same tenant is invisible: each system's contact layout contains none of the other's sections/fields (same key cText in both)",
    leak12.length === 0 && leak21.length === 0 && ids2.includes(FLD.crm2.sys2Only), "0 leaks", `1→2 ${leak12.length} · 2→1 ${leak21.length}`);
  const empty2 = await F.createSection(cx2("contact"), { key: "sys2_empty", label: "ว่าง" });
  const a = await attempt(() => F.updateField(cx("contact"), FLD.crm2.sys2Only, { label: "hacked" }));
  const b = await attempt(() => F.archiveField(cx("contact"), FLD.crm2.sys2Only));
  const c = await attempt(() => F.deleteSection(cx("contact"), empty2.id));
  const d = await attempt(() => F.createField(cx("contact"), { sectionId: SEC["crm2:sys2_sec"], key: "intruder", label: "x", type: "TEXT" }));
  const e = await attempt(() => F.reorderFields(cx("contact"), SEC["crm2:sys2_sec"], [FLD.crm2.cText, FLD.crm2.sys2Only]));
  const row = await P.memberField.findUnique({ where: { id: FLD.crm2.sys2Only ?? "none" } });
  const secLeft = await P.memberSection.count({ where: { id: empty2.id } });
  const intr = await P.memberField.count({ where: { key: "intruder", tenantId: T } });
  chk("C1.2a-X1.2", "ids of the other CRM system are refused by every id-based call (updateField · archiveField · deleteSection · createField into its section · reorderFields) and nothing changes",
    [a, b, c, d, e].every(refused) && row?.label !== "hacked" && !row?.archivedAt && secLeft === 1 && intr === 0, "5 refusals · unchanged", [a, b, c, d, e].map(show).join(" | "));
  const w1 = await setV(cx("contact"), K.k5, { cText: "ข้ามระบบ" });
  const w2 = await setV(cx("contact"), K.k1, { sys2Only: "ข้ามระบบ" });
  const vals = await valuesOf(cx("contact"), [K.k5, K.kb, K.k1]);
  const crossRows = await P.customRecordValue.count({ where: { valueText: "ข้ามระบบ" } });
  chk("C1.2a-X1.3", "values never cross systems/tenants: writing a crm2 contact through crm1 · writing a crm2-only key on a crm1 contact are refused; getFieldValues(crm1, [crm2 contact, tenant-B contact]) returns nothing although both have value rows",
    refused(w1) && refused(w2) && crossRows === 0 && Object.keys(vals?.[K.k5] ?? {}).length === 0 && Object.keys(vals?.[K.kb] ?? {}).length === 0 && vals?.[K.k1]?.cText === "Alpha Travel",
    "refused · empty bags (control: own contact k1 has its cText)", `${show(w1)} | ${show(w2)} · rows=${crossRows} · bags=${j(vals)}`);
  const f1 = await attempt(() => F.fieldFilterWhere(cx("contact"), { sys2Only: "x" }));
  const f0 = await attempt(() => F.fieldFilterWhere(cx("contact"), { cText: "Alpha" }));
  chk("C1.2a-X1.4", "fieldFilterWhere with a key that exists only in the other CRM system is refused (control: an own key works)", refused(f1) && f0.ok, "refused · control ok", `${show(f1)} · control ${show(f0)}`);
  const t1 = await attempt(() => F.listLayout({ ...cx("contact"), systemId: CRMB }));
  const t2 = await attempt(() => F.createSection({ ...cx("contact"), systemId: CRMB }, { key: "xt", label: "x" }));
  const t3 = await attempt(() => F.listLayout({ ...cxB("contact"), systemId: CRM1 }));
  const t4 = await attempt(() => F.getFieldValues({ ...cx("contact"), systemId: CRMB }, [K.kb]));
  const xtRows = await P.memberSection.count({ where: { key: "xt" } });
  chk("C1.2a-X1.5", "another tenant: tenant T + tenant-B system id (and vice versa) ⇒ listLayout refused or empty · createSection refused · getFieldValues returns no value",
    emptyOrRefused(t1) && refused(t2) && emptyOrRefused(t3) && (!t4.ok || Object.keys(t4.v?.[K.kb] ?? {}).length === 0) && xtRows === 0,
    "refused/empty", `${show(t1)} | ${show(t2)} | ${show(t3)} | ${show(t4)} · rows=${xtRows}`);
  const mm = { tenantId: T, systemId: M, actorUserId: U.owner, objectKey: "contact", actor: ACT.owner };
  const m1 = await attempt(() => F.createSection(mm, { key: "mismatch", label: "x" }));
  const m2 = await attempt(() => F.listLayout(mm));
  const m3 = await attempt(() => F.setFieldValues(mm, K.k1, { cText: "x" }, { via: "STAFF" }));
  const m4 = await attempt(() => F.applyTemplate(mm, "system"));
  const m5 = await attempt(() => F.fieldFilterWhere(mm, { cText: "x" }));
  const nonCust = await P.memberSection.count({ where: { systemId: M, objectKey: { not: "customer" } } }) + await P.memberField.count({ where: { systemId: M, objectKey: { not: "customer" } } });
  chk("C1.2a-X1.6", "mismatched pair (objectKey \"contact\" + the MEMBER system id) is refused by createSection · setFieldValues · applyTemplate · fieldFilterWhere, listLayout is refused or empty, and the MEMBER system holds no non-customer row",
    refused(m1) && emptyOrRefused(m2) && refused(m3) && refused(m4) && refused(m5) && nonCust === 0, "refused ×4 · 0 rows", `${[m1, m2, m3, m4, m5].map(show).join(" | ")} · rows=${nonCust}`);
  const rc = { tenantId: T, systemId: CRM1, actorUserId: U.owner };
  const r1 = await attempt(() => F.createSection({ ...rc, objectKey: "customer" }, { key: "custInCrm", label: "x" }));
  const r2 = await attempt(() => F.createSection(rc, { key: "custInCrm2", label: "x" }));
  const r3 = await attempt(() => F.listLayout(rc));
  chk("C1.2a-X1.7", "reverse mismatch: objectKey \"customer\" (explicit or defaulted) with a CRM system id ⇒ createSection refused and listLayout refused or EMPTY (a stray customer-objectKey section sits in that CRM system — filtering by objectKey alone would return it)",
    refused(r1) && refused(r2) && emptyOrRefused(r3), "refused · empty", `${show(r1)} | ${show(r2)} | ${show(r3)}`);
  const g1 = await attempt(() => F.createSection(cx("ghost"), { key: "ghostSec", label: "x" }));
  const g2 = await attempt(() => F.createSection(cx("boat"), { key: "boatSec", label: "x" }));
  const g3 = await attempt(() => F.listLayout(cx("boat")));
  const gRows = await P.memberSection.count({ where: { tenantId: T, key: { in: ["ghostSec", "boatSec"] } } });
  chk("C1.2a-X1.8", "a custom objectKey must be an object of THIS CRM system: \"ghost\" (none) and \"boat\" (only in the other CRM system) ⇒ createSection refused, listLayout refused or empty",
    refused(g1) && refused(g2) && emptyOrRefused(g3) && gRows === 0, "refused", `${show(g1)} | ${show(g2)} | ${show(g3)} · rows=${gRows}`, "MAJOR");
}

async function groupX6() {
  const k = K.k4;
  const ok500 = await setV(cx("contact"), k, { cText: "ก".repeat(500) });
  const no501 = await setV(cx("contact"), k, { cText: "ข".repeat(501) });
  const ok4000 = await setV(cx("contact"), k, { cLong: "ค".repeat(4000) });
  const no4001 = await setV(cx("contact"), k, { cLong: "ง".repeat(4001) });
  const noMax = await setV(cx("contact"), k, { cMax: "x".repeat(21) });
  const t = (await P.customRecordValue.findFirst({ where: { recordId: k, fieldId: FLD.contact.cText } }))?.valueText ?? "";
  const sysText = (await P.memberField.findMany({ where: { systemId: CRM1, objectKey: "contact", isSystem: true, type: "TEXT" } })).find((f: Any) => ["jobTitle", "department", "titleTh"].includes(f.systemKey)) as Any;
  const noSys = sysText ? await setV(cx("contact"), k, { [sysText.key]: "จ".repeat(501) }) : { ok: true, v: null, err: "no text system field" };
  chk("C1.2a-X6.1", "length caps hold on CRM objects: TEXT 500 ok / 501 refused · LONG_TEXT 4000 ok / 4001 refused · options.maxLength 20 ⇒ 21 refused · a text SYSTEM field 501 refused — stored value stays the 500-char one",
    ok500.ok && refused(no501) && ok4000.ok && refused(no4001) && refused(noMax) && refused(noSys) && t.length === 500 && t.startsWith("ก"),
    "caps", `${[ok500, no501, ok4000, no4001, noMax, noSys].map((r) => (r.ok ? "ok" : "refused")).join(",")} · stored ${t.length}`);
  const s1 = await setV(cx("contact"), k, { cSel: "d" });
  const s2 = await setV(cx("contact"), k, { cMulti: ["x", "q"] });
  const s3 = await setV(cx("car"), R.r3, { color: "green", plate: "ไม่ควรเขียน" });
  const plate = (await P.customRecordValue.findFirst({ where: { recordId: R.r3, fieldId: FLD.car.plate } }))?.valueText;
  const cs = await P.customRecordValue.count({ where: { recordId: k, fieldId: { in: [FLD.contact.cSel, FLD.contact.cMulti] } } });
  chk("C1.2a-X6.2", "SELECT/MULTI values must be defined options (\"d\", [x,q], car color \"green\") — refused, and the valid value in the same call is not written",
    [s1, s2, s3].every(refused) && plate === "กข 9999" && cs === 0, "3 refusals · atomic", `${[s1, s2, s3].map(show).join(" | ")} · plate=${plate} · rows=${cs}`);
  const web = (await P.memberField.findMany({ where: { systemId: CRM1, objectKey: "company", isSystem: true } })).find((f: Any) => f.systemKey === "website") as Any;
  if (!web) {
    chk("C1.2a-X6.3", "URL fields http/https only (company system field `website`)", false, "a company system field with systemKey website", "none seeded");
  } else {
    const BAD = ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "file:///etc/passwd", "vbscript:msgbox(1)", "ftp://example.com/x"];
    const bad: Tried[] = [];
    for (const u of BAD) bad.push(await setV(cx("company"), CO.co2, { [web.key]: u }));
    const col1 = ((await q(`select website from "CrmCompany" where id='${CO.co2}'`))[0] as Any)?.website ?? null;
    const good1 = await setV(cx("company"), CO.co2, { [web.key]: "https://example.co.th/path?q=1" });
    const good2 = await setV(cx("company"), CO.co1, { [web.key]: "http://example.com" });
    const col2 = ((await q(`select website from "CrmCompany" where id='${CO.co2}'`))[0] as Any)?.website ?? null;
    chk("C1.2a-X6.3", "URL fields accept http/https only: javascript: (any case, leading space) · data: · file: · vbscript: · ftp: refused and never stored; https/http accepted into CrmCompany.website",
      bad.every(refused) && col1 === null && good1.ok && good2.ok && col2 === "https://example.co.th/path?q=1", "6 refusals · 2 ok",
      `${bad.map((r, i) => `${BAD[i].slice(0, 12)}:${r.ok ? "ACCEPTED" : "refused"}`).join(",")} · stored-before=${j(col1)} · ${show(good1)} · ${show(good2)}`);
  }
  const deal = await setV(cx("deal"), DEAL, { dText: "ฉ".repeat(501) });
  const car = await setV(cx("car"), R.r1, { plate: "ช".repeat(501) });
  const dealOk = await setV(cx("deal"), DEAL, { dText: "ฉ".repeat(500) });
  const carOk = await setV(cx("car"), R.r1, { plate: "ช".repeat(500) });
  chk("C1.2a-X6.4", "the same caps apply to deal and custom-object records (501-char TEXT refused on a deal and on a car)", refused(deal) && refused(car) && dealOk.ok && carOk.ok, "501 refused ×2 · 500 ok ×2", `${show(deal)} | ${show(car)} | ${show(dealOk)} | ${show(carOk)}`);
}

async function groupX8() {
  const must = async (p: Promise<Tried>) => { const r = await p; if (!r.ok) throw new Error(`fixture write failed: ${r.err}`); };
  await must(setV(cx("contact"), K.k1, { cSens: "ลับมาก-QC" }));
  await must(setV(cx("company"), CO.co1, { coSecret: "ลับบริษัท-QC" }));
  const logs = (userId: string, since: Date) => P.memberAccessLog.findMany({ where: { tenantId: T, userId, createdAt: { gte: since } } });
  const at = () => new Date(Date.now() - 1000);
  const t0 = at();
  const staff = (await valuesOf(cx("contact", ACT.staff), [K.k1]))[K.k1] ?? {};
  chk("C1.2a-X8.0", "[positive control] a STAFF reader still sees the NON-sensitive values of the same contact (otherwise the drop checks prove nothing)",
    staff.cText === "Alpha Travel", "cText visible", j(staff));
  const staffLogs = await logs(U.staff, t0);
  chk("C1.2a-X8.1", "STAFF (default policy OWNER/MANAGER) gets the sensitive contact value dropped/blank and no MemberAccessLog row is written for it",
    blank(staff.cSens) && staffLogs.length === 0, "dropped · 0 logs", `cSens=${j(staff.cSens)} · logs=${staffLogs.length}`);
  const t1 = at();
  const owner = (await valuesOf(cx("contact", ACT.owner), [K.k1]))[K.k1] ?? {};
  const ol = await logs(U.owner, t1);
  const k1Party = (await P.crmContact.findUnique({ where: { id: K.k1 } }))?.partyId;
  const olHit = ol.filter((r: Any) => r.targetType === "FIELD" && r.targetId === FLD.contact.cSens && (r.customerId === K.k1 || (k1Party && r.customerId === k1Party)));
  chk("C1.2a-X8.2", "OWNER sees the sensitive contact value AND a MemberAccessLog row is written (tenant · userId · FIELD/field id · customerId = the contact id or its partyId)",
    owner.cSens === "ลับมาก-QC" && olHit.length >= 1, "shown + ≥1 log", `cSens=${j(owner.cSens)} · logs=${j(ol.map((r: Any) => [r.targetType, r.targetId === FLD.contact.cSens, r.customerId === K.k1]))}`);
  const t2 = at();
  const mgr = (await valuesOf(cx("company", ACT.manager), [CO.co1]))[CO.co1] ?? {};
  const ml = await logs(U.manager, t2);
  const mlHit = ml.filter((r: Any) => r.targetType === "SECTION" && r.targetId === SEC.co_secret);
  chk("C1.2a-X8.3", "MANAGER sees a value that is sensitive through its SECTION (company) and the log targets SECTION/section id — the same rule as member list/export",
    mgr.coSecret === "ลับบริษัท-QC" && mlHit.length >= 1, "shown + SECTION log", `coSecret=${j(mgr.coSecret)} · logs=${j(ml.map((r: Any) => [r.targetType, r.targetId === SEC.co_secret]))}`, "MAJOR");
  const api = { ...ACT.owner, apiRole: "readonly", keyId: `${TAG}-key` };
  const apiBag = (await valuesOf(cx("contact", api), [K.k1]))[K.k1] ?? {};
  chk("C1.2a-X8.4", "an API key with bundle readonly never sees sensitive values, even when its creator is the OWNER", blank(apiBag.cSens), "dropped", j(apiBag.cSens), "MAJOR");
  const noActor = (await valuesOf({ tenantId: T, systemId: CRM1, actorUserId: null, objectKey: "contact" }, [K.k1]))[K.k1] ?? {};
  chk("C1.2a-X8.5", "[K2] a non-customer read with no actor at all drops sensitive values (fail closed)", blank(noActor.cSens) && noActor.cText === "Alpha Travel", "dropped · rest visible", j(noActor), "MAJOR");
  await P.memberSensitivePolicy.create({ data: { tenantId: T, systemId: CRM1, targetType: "FIELD", targetId: FLD.contact.cSens, roles: ["STAFF"], logAccess: true } });
  const t3 = at();
  const staff2 = (await valuesOf(cx("contact", ACT.staff), [K.k1]))[K.k1] ?? {};
  const mgr2 = (await valuesOf(cx("contact", ACT.manager), [K.k1]))[K.k1] ?? {};
  const sl2 = await logs(U.staff, t3);
  chk("C1.2a-X8.6", "the decision really comes from evaluateSensitiveAccess: a MemberSensitivePolicy (CRM system · FIELD cSens · roles [STAFF]) makes STAFF see it (and logged) while MANAGER — no longer in the policy — gets it dropped",
    staff2.cSens === "ลับมาก-QC" && blank(mgr2.cSens) && sl2.some((r: Any) => r.targetId === FLD.contact.cSens), "policy honoured", `staff=${j(staff2.cSens)} mgr=${j(mgr2.cSens)} staffLogs=${sl2.length}`);
}

type Hist = { oldValue: Any; newValue: Any; createdAt: Date };
function chainCheck(h: Hist[], okValues: string[], stored: Any) {
  const byOld = new Map<string, Hist[]>();
  for (const r of h) { const key = j(r.oldValue ?? null); byOld.set(key, [...(byOld.get(key) ?? []), r]); }
  const forks = [...byOld.values()].filter((v) => v.length > 1).length;
  const order: Hist[] = [];
  let cur = "null";
  while (byOld.has(cur) && order.length <= h.length) { const r = byOld.get(cur)![0]; order.push(r); cur = j(r.newValue ?? null); }
  const complete = forks === 0 && order.length === h.length && cur === j(stored ?? null);
  const setOk = sameSet(h.map((r) => String(r.newValue)), okValues);
  const monotonic = order.every((r, i) => i === 0 || r.createdAt.getTime() >= order[i - 1].createdAt.getTime());
  return { complete, setOk, monotonic, forks, len: h.length, walked: order.length };
}

function spawnWorkers(n: number, args: (i: number) => string[]): Promise<string[]> {
  return Promise.all(Array.from({ length: n }, (_x, i) => new Promise<string>((resolve) => {
    const c = spawn("pnpm", ["exec", "tsx", "scripts/qc-crm-c1.2a.mts", "--x3-worker", ...args(i)], { env: process.env });
    let out = "";
    const to = setTimeout(() => { try { c.kill("SIGKILL"); } catch { /* gone */ } }, 300_000);
    c.stdout.on("data", (d: Any) => { out += String(d); });
    c.stderr.on("data", (d: Any) => { out += String(d); });
    c.on("error", (e: Any) => { clearTimeout(to); resolve(`SPAWN-ERROR ${String(e)}`); });
    c.on("close", () => { clearTimeout(to); resolve(out); });
  })));
}

async function groupX3() {
  const fid = FLD.contact.cRace;
  const roundResult = async (rec: string, results: string[]) => {
    const okValues = results.filter((s) => s.startsWith("OK:")).map((s) => s.split(":")[1]);
    const rows = await P.customRecordValue.findMany({ where: { recordId: rec, fieldId: fid } });
    const h = (await P.customRecordValueHistory.findMany({ where: { recordId: rec, fieldId: fid }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })) as Hist[];
    return { rows: rows.length, okCalls: okValues.length, calls: results.length, errs: results.filter((s) => !s.startsWith("OK:")), ...chainCheck(h, okValues, rows[0]?.valueText) };
  };
  const inProc: Any[] = [];
  for (let r = 0; r < 3; r += 1) {
    const rec = K[`race${r + 1}`];
    const res = await Promise.all(Array.from({ length: 12 }, (_x, i) =>
      F.setFieldValues(cx("contact"), rec, { cRace: `ip${r}-${i}` }, { via: "STAFF" }).then(() => `OK:ip${r}-${i}`).catch((e: Any) => `ERR:${e instanceof Error ? e.message : String(e)}`)));
    inProc.push(await roundResult(rec, res));
  }
  const xp: Any[] = []; let spawnedOk = true;
  for (let r = 0; r < 2; r += 1) {
    const rec = K[`race${r + 4}`];
    const startAt = Date.now() + 30_000;
    const outs = await spawnWorkers(4, (i) => [T, CRM1, rec, "cRace", `xp${r}p${i}`, String(startAt), "3", U.owner]);
    const results = outs.flatMap((o) => { const m = /X3WORKER (\[.*\])/.exec(o); return m ? (JSON.parse(m[1]) as string[]).map((s) => (s.startsWith("OK:") ? `OK:${s.split(":")[1]}` : s)) : [`NO-OUTPUT ${cut(o, 200)}`]; });
    if (results.length !== 12 || results.some((s) => s.startsWith("NO-OUTPUT"))) spawnedOk = false;
    xp.push(await roundResult(rec, results));
  }
  const fmt = (a: Any[]) => a.map((x, i) => `r${i + 1}: rows=${x.rows} ok=${x.okCalls}/${x.calls} hist=${x.len} walked=${x.walked} forks=${x.forks}${x.errs.length ? ` err=${cut(x.errs[0], 100)}` : ""}`).join(" · ");
  chk("C1.2a-X3.0", "[positive control] the 4 worker PROCESSES really ran and answered 12 calls per round — otherwise X3.2 proves nothing", spawnedOk, "12 answers ×2", fmt(xp), "MAJOR");
  chk("C1.2a-X3.1", "12 parallel setFieldValues (in-process pool = several connections, 3 rounds) on the SAME contact+field: exactly ONE value row and a gap-free history chain null→…→stored covering every successful call (no fork = no two writers read the same old value)",
    inProc.every((x) => x.rows === 1 && x.complete && x.setOk), "1 row · complete chain", fmt(inProc));
  chk("C1.2a-X3.2", "the same race across 4 SEPARATE PROCESSES × 3 calls (2 rounds): one row and a complete chain — an in-process mutex passes X3.1 and fails here",
    xp.every((x) => x.rows === 1 && x.complete && x.setOk), "1 row · complete chain", fmt(xp));
  chk("C1.2a-X3.3", "no caller of the race sees an error (a find-then-create upsert leaks unique-constraint errors to users)",
    [...inProc, ...xp].every((x) => x.errs.length === 0), "0 errors", fmt([...inProc, ...xp]), "MAJOR");
  chk("C1.2a-X3.4", "history createdAt is non-decreasing along the chain (the history reads in the order it happened)",
    [...inProc, ...xp].every((x) => x.monotonic && x.len > 0 && x.complete), "monotonic (on complete, non-empty chains)", fmt([...inProc, ...xp]), "MINOR");
}

async function groupS6() {
  const count = (where: Any) => P.memberField.count({ where: { systemId: CRM1, archivedAt: null, ...where } });
  const n0 = await count({ objectKey: "car" });
  const created: string[] = []; let firstErr = "";
  for (let i = 0; n0 + i < 60; i += 1) {
    const r = await attempt(() => F.createField(cx("car"), { sectionId: SEC.car_main, key: `fill${i}`, label: `เติม ${i}`, type: "TEXT" }));
    if (r.ok) created.push(r.v.id); else { firstErr = r.err; break; }
  }
  const over = await attempt(() => F.createField(cx("car"), { sectionId: SEC.car_main, key: "fillOver", label: "เกิน", type: "TEXT" }));
  const carN = await count({ objectKey: "car" });
  const sysN = await count({});
  chk("C1.2a-S6.1", "60 fields per OBJECT: car fills up to 60 while the CRM system as a whole holds more than 60 · the 61st is refused LIMIT_REACHED",
    carN === 60 && sysN > 60 && limitRefused(over) && !firstErr, "car 60 · system >60 · 61st refused", `car=${carN} system=${sysN} · firstErr=${cut(firstErr, 120) || "-"} · 61st ${show(over)}`);
  const arch = await attempt(() => F.archiveField(cx("car"), created[0]));
  const add = await attempt(() => F.createField(cx("car"), { sectionId: SEC.car_main, key: "fillAfterArchive", label: "แทน", type: "TEXT" }));
  const restore = await attempt(() => F.restoreField(cx("car"), created[0]));
  chk("C1.2a-S6.2", "archived fields do not count (archive one → one more fits) and restoring past the cap is refused LIMIT_REACHED",
    created.length > 0 && carN === 60 && arch.ok && add.ok && limitRefused(restore) && (await count({ objectKey: "car" })) === 60, "ok · ok · refused (car stays 60)", `${show(arch)} | ${show(add)} | ${show(restore)}`);
  const f0 = await count({ objectKey: "car", filterable: true });
  const cands = created.slice(1);
  let fErr = ""; let i = 0;
  for (; f0 + i < 20 && i < cands.length; i += 1) {
    const r = await attempt(() => F.updateField(cx("car"), cands[i], { filterable: true }));
    if (!r.ok) { fErr = r.err; break; }
  }
  const f21 = await attempt(() => F.updateField(cx("car"), cands[i], { filterable: true }));
  const fCar = await count({ objectKey: "car", filterable: true });
  const fSys = await count({ filterable: true });
  chk("C1.2a-S6.3", "≤ 20 filterable per OBJECT: car reaches 20 while the system has more than 20 filterable fields · the 21st switch is refused LIMIT_REACHED",
    fCar === 20 && fSys > 20 && !fErr && limitRefused(f21), "car 20 · system >20 · refused", `car=${fCar} system=${fSys} · err=${cut(fErr, 120) || "-"} · 21st ${show(f21)}`);
  const secCar = await P.memberSection.count({ where: { systemId: CRM1, objectKey: "car" } });
  const made: Tried[] = [];
  for (let s = secCar; s < 12; s += 1) made.push(await attempt(() => F.createSection(cx("car"), { key: `carSec${s}`, label: `ส่วน ${s}` })));
  const total = await P.memberSection.count({ where: { systemId: CRM1 } });
  chk("C1.2a-S6.4", "[K6] the section cap is per object: car can reach 12 sections although the CRM system then holds more than 12",
    made.every((r) => r.ok) && total > 12, "all ok · system >12", `made=${made.length} failed=${made.filter((r) => !r.ok).map(show).join(" | ") || "-"} · system=${total}`, "MAJOR");
}

// ═══════════════════════════════════════════════════════════════════════════════════
// R — review fixes (after the first review of the C1.2a builder)
//   S1 GOVERNED_CRM_SYSTEM_KEYS: CRM-service-owned columns are refused by setFieldValues (Thai VALIDATION)
//   S2 the CRM filter path refuses a sensitive field / a field of a sensitive section unless evaluateSensitiveAccess allows
//   S4 lockRecordForFieldWrite(tx, recordId) exported (same advisory key) · a plain PrismaClient passed as tx ⇒ own transaction
//   Every R check carries its own positive control inside its verdict (listed in the detail on failure).
// ═══════════════════════════════════════════════════════════════════════════════════
const GOVERNED_MSG = /แก้ได้จากหน้าข้อมูล/;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

function spawnR5(argsList: string[][]): Promise<string[]> {
  return Promise.all(argsList.map((args) => new Promise<string>((resolve) => {
    const c = spawn("pnpm", ["exec", "tsx", "scripts/qc-crm-c1.2a.mts", "--r5-worker", ...args], { env: process.env });
    let out = "";
    const to = setTimeout(() => { try { c.kill("SIGKILL"); } catch { /* gone */ } }, 180_000);
    c.stdout.on("data", (d: Any) => { out += String(d); });
    c.stderr.on("data", (d: Any) => { out += String(d); });
    c.on("error", (e: Any) => { clearTimeout(to); resolve(`SPAWN-ERROR ${String(e)}`); });
    c.on("close", () => { clearTimeout(to); resolve(out); });
  })));
}

async function groupR() {
  const newContact = async (name: string, phone: string, extra: Record<string, Any> = {}) =>
    (await P.crmContact.create({ data: { tenantId: T, systemId: CRM1, name, phone, email: `${phone}@example.test`, ...extra } })).id as string;
  const sysKey = async (obj: string, systemKey: string) =>
    ((await P.memberField.findFirst({ where: { tenantId: T, systemId: CRM1, objectKey: obj, isSystem: true, systemKey } })) as Any)?.key as string | undefined;

  // ── R.1 facade export ──
  const facade = (await import("@/lib/modules/member" as string)) as Any;
  const G = facade?.fields?.GOVERNED_CRM_SYSTEM_KEYS as Any;
  const WANT_GOV: Record<string, string[]> = {
    contact: ["phone", "email", "marketingOptOut", "ownerUserId"],
    company: ["name", "taxId"],
    deal: ["valueSatang", "ownerUserId", "companyId", "stageId"],
  };
  const missingGov = Object.entries(WANT_GOV).flatMap(([o, ks]) => ks.filter((k) => !(G?.[o] instanceof Set && G[o].has(k))).map((k) => `${o}.${k}`));
  // control: the set is not "everything" — plain keys the review left writable are NOT in it
  const plainInGov = [["contact", "jobTitle"], ["contact", "department"], ["company", "industry"], ["deal", "nextStep"]].filter(([o, k]) => G?.[o]?.has?.(k)).map(([o, k]) => `${o}.${k}`);
  chk("C1.2a-R.1", "GOVERNED_CRM_SYSTEM_KEYS is exported through the member facade (`fields` namespace, same object as fields.ts) and holds contact phone/email/marketingOptOut/ownerUserId · company name/taxId · deal valueSatang/ownerUserId/companyId/stageId — [control] plain keys jobTitle/department/industry/nextStep are NOT in it",
    G && G === F.GOVERNED_CRM_SYSTEM_KEYS && missingGov.length === 0 && plainInGov.length === 0,
    "exported · all present · plain keys absent", `facade=${!!G} same=${G === F.GOVERNED_CRM_SYSTEM_KEYS} missing=${missingGov.join(",") || "-"} plainInSet=${plainInGov.join(",") || "-"}`);

  // ── R.2 governed keys refused, column unchanged · control: a plain system key in the same call pattern succeeds ──
  const kPhone = await sysKey("contact", "phone");
  const kOpt = await sysKey("contact", "marketingOptOut");
  const kJob = await sysKey("contact", "jobTitle");
  const kVal = await sysKey("deal", "valueSatang");
  const kNext = await sysKey("deal", "nextStep");
  const kTax = await sysKey("company", "taxId");
  const kInd = await sysKey("company", "industry");
  if (!kPhone || !kOpt || !kJob || !kVal || !kNext || !kTax || !kInd) throw new Error(`R fixture: system fields missing (phone=${kPhone} optOut=${kOpt} jobTitle=${kJob} valueSatang=${kVal} nextStep=${kNext} taxId=${kTax} industry=${kInd})`);
  const kg = await newContact("ควบคุม คีย์", "0893330001", { marketingOptOut: true, jobTitle: "เดิม" });
  const col = async (table: string, id: string, c: string) => ((await q(`select "${c}" as v from "${table}" where id='${id}'`))[0] as Any)?.v;
  const before = { phone: await col("CrmContact", kg, "phone"), opt: await col("CrmContact", kg, "marketingOptOut"), val: await col("CrmDeal", DEAL, "valueSatang"), tax: await col("CrmCompany", CO.co1, "taxId") };
  const gPhone = await setV(cx("contact"), kg, { [kPhone]: "0893339999" });
  const gOpt = await setV(cx("contact"), kg, { [kOpt]: false });
  const gVal = await setV(cx("deal"), DEAL, { [kVal]: 200000 });
  const gTax = await setV(cx("company"), CO.co1, { [kTax]: "0105551234567" });
  const after = { phone: await col("CrmContact", kg, "phone"), opt: await col("CrmContact", kg, "marketingOptOut"), val: await col("CrmDeal", DEAL, "valueSatang"), tax: await col("CrmCompany", CO.co1, "taxId") };
  const gov = (r: Tried) => refused(r) && GOVERNED_MSG.test(r.err);
  const cJob = await setV(cx("contact"), kg, { [kJob]: "ผู้จัดการ-R2" });
  const cNext = await setV(cx("deal"), DEAL, { [kNext]: "โทรนัด-R2" });
  const cInd = await setV(cx("company"), CO.co1, { [kInd]: "ท่องเที่ยว-R2" });
  const ctl = { job: await col("CrmContact", kg, "jobTitle"), next: await col("CrmDeal", DEAL, "nextStep"), ind: await col("CrmCompany", CO.co1, "industry") };
  chk("C1.2a-R.2", "setFieldValues (as OWNER) refuses governed system keys with the Thai governed-column message and leaves the column unchanged: contact phone · contact marketingOptOut true→false · deal valueSatang · company taxId — [control] plain system keys jobTitle / nextStep / industry in the same call pattern are written",
    gov(gPhone) && gov(gOpt) && gov(gVal) && gov(gTax) && j(after) === j(before) && before.opt === true
      && cJob.ok && cNext.ok && cInd.ok && ctl.job === "ผู้จัดการ-R2" && ctl.next === "โทรนัด-R2" && ctl.ind === "ท่องเที่ยว-R2",
    "4 governed refusals · columns unchanged · 3 controls written",
    `phone ${show(gPhone)} | optOut ${show(gOpt)} | value ${show(gVal)} | taxId ${show(gTax)} · before=${j(before)} after=${j(after)} · controls ${show(cJob)} ${show(cNext)} ${show(cInd)} → ${j(ctl)}`);

  // ── R.3 mixed payload refused as a whole ──
  const jobBefore = await col("CrmContact", kg, "jobTitle");
  const mixed = await setV(cx("contact"), kg, { [kJob]: "ไม่ควรถูกเขียน-R3", [kPhone]: "0893338888" });
  const mixedPlainCustom = await setV(cx("contact"), kg, { cText: "ไม่ควรถูกเขียน-R3", [kOpt]: false });
  const jobAfter = await col("CrmContact", kg, "jobTitle");
  const phoneAfter = await col("CrmContact", kg, "phone");
  const cTextRows = await P.customRecordValue.count({ where: { recordId: kg, fieldId: FLD.contact.cText } });
  const alone = await setV(cx("contact"), kg, { [kJob]: "ไม่ควรถูกเขียน-R3" });
  const jobControl = await col("CrmContact", kg, "jobTitle");
  chk("C1.2a-R.3", "a mixed payload {jobTitle, phone} (and {custom cText, marketingOptOut}) is refused as a whole — jobTitle column, phone column and the custom value row are all unchanged (no partial write) · [control] the same jobTitle value alone is then written",
    gov(mixed) && gov(mixedPlainCustom) && jobAfter === jobBefore && phoneAfter === before.phone && cTextRows === 0 && alone.ok && jobControl === "ไม่ควรถูกเขียน-R3",
    "refused ×2 · nothing written · control ok", `mixed ${show(mixed)} | mixed2 ${show(mixedPlainCustom)} · jobTitle ${j(jobBefore)}→${j(jobAfter)} · phone=${j(phoneAfter)} · cText rows=${cTextRows} · control ${show(alone)} → ${j(jobControl)}`);

  // ── R.4 sensitive filter on the CRM path ──
  //   ORACLE NOTE: X8's cSens / coSecret are NOT filterable (the engine refuses them as "not filterable" first, which would
  //   make a refusal vacuous) and X8.6 left a policy that ALLOWS STAFF on cSens — so R.4 adds its own filterable fields
  //   under the default policy: rSensF (sensitive FIELD, contact) and rCoSecF (plain field in the sensitive SECTION co_secret).
  const fS = await F.createField(cx("contact"), { sectionId: SEC.sales, key: "rSensF", label: "ฟิลด์ อ่อนไหวกรองได้", type: "TEXT", sensitive: true, filterable: true });
  const fC = await F.createField(cx("company"), { sectionId: SEC.co_secret, key: "rCoSecF", label: "ฟิลด์ ส่วนลับกรองได้", type: "TEXT", filterable: true });
  const must = async (p: Promise<Tried>) => { const r = await p; if (!r.ok) throw new Error(`fixture write failed: ${r.err}`); };
  await must(setV(cx("contact"), K.k1, { rSensF: "ลับกรอง-R4" }));
  await must(setV(cx("company"), CO.co1, { rCoSecF: "ลับบริษัทกรอง-R4" }));
  const noActor = (obj: string) => ({ tenantId: T, systemId: CRM1, actorUserId: null, objectKey: obj });
  const sensRefused = (r: Tried) => refused(r) && /อ่อนไหว/.test(r.err);
  const fStaff = await attempt(() => F.fieldFilterWhere(cx("contact", ACT.staff), { rSensF: "ลับกรอง-R4" }));
  const fNone = await attempt(() => F.fieldFilterWhere(noActor("contact"), { rSensF: "ลับกรอง-R4" }));
  const fOwner = await attempt(() => F.fieldFilterWhere(cx("contact", ACT.owner), { rSensF: "ลับกรอง-R4" }));
  const cStaff = await attempt(() => F.fieldFilterWhere(cx("company", ACT.staff), { rCoSecF: "ลับบริษัทกรอง-R4" }));
  const cNone = await attempt(() => F.fieldFilterWhere(noActor("company"), { rCoSecF: "ลับบริษัทกรอง-R4" }));
  const cOwner = await attempt(() => F.fieldFilterWhere(cx("company", ACT.owner), { rCoSecF: "ลับบริษัทกรอง-R4" }));
  const plainStaff = await attempt(() => F.fieldFilterWhere(cx("contact", ACT.staff), { cText: "Alpha Travel" }));
  const hits = async (model: string, r: Tried) => r.ok ? ((await P[model].findMany({ where: { AND: [{ tenantId: T, systemId: CRM1 }, r.v] }, select: { id: true } })) as Any[]).map((x) => x.id) : ["<refused>"];
  const ownerHits = await hits("crmContact", fOwner);
  const ownerCoHits = await hits("crmCompany", cOwner);
  const plainHits = await hits("crmContact", plainStaff);
  chk("C1.2a-R.4", "fieldFilterWhere on the CRM path refuses a sensitive FIELD (contact rSensF) and a field of a sensitive SECTION (company co_secret) for STAFF (default policy) and for no actor, with the Thai sensitive message — [control] OWNER gets a working filter that selects exactly the record holding the value, and STAFF can still filter a non-sensitive field (customer-path filters: unchanged, proven by G1.7/G1.8/G1.13)",
    fS?.id && fC?.id && sensRefused(fStaff) && sensRefused(fNone) && sensRefused(cStaff) && sensRefused(cNone)
      && j(ownerHits) === j([K.k1]) && j(ownerCoHits) === j([CO.co1]) && plainHits.includes(K.k1),
    "4 refusals · owner selects k1 / co1 · staff plain filter ok",
    `staff ${show(fStaff)} | none ${show(fNone)} | co.staff ${show(cStaff)} | co.none ${show(cNone)} · owner→${j(ownerHits)} co.owner→${j(ownerCoHits)} · staff plain→${j(plainHits)}`);

  // ── R.5 lockRecordForFieldWrite: a separate process waits for it on X, not on Y ──
  const exported = typeof F.lockRecordForFieldWrite === "function" && facade?.fields?.lockRecordForFieldWrite === F.lockRecordForFieldWrite;
  const X = await newContact("ล็อก X", "0893330005");
  const Y = await newContact("ล็อก Y", "0893330006");
  let r5: Any = { exported };
  if (exported) {
    const HOLD = 1_500;
    const startAt = Date.now() + 30_000;
    const kids = spawnR5([[T, CRM1, X, "cText2", "R5-X", String(startAt), U.owner], [T, CRM1, Y, "cText2", "R5-Y", String(startAt), U.owner]]);
    await sleep(startAt - 250 - Date.now());
    let lockAt = 0; let releaseLB = 0;
    await P.$transaction(async (t: Any) => {
      await F.lockRecordForFieldWrite(t, X);
      lockAt = Date.now();
      await sleep(startAt + HOLD - Date.now());
      releaseLB = Date.now(); // the lock is released at COMMIT, i.e. no earlier than this instant
    }, { timeout: 60_000 });
    const outs = await kids;
    const parse = (o: string) => { const m = /R5WORKER (\{.*\})/.exec(o); return m ? JSON.parse(m[1]) : { res: `NO-OUTPUT ${cut(o, 300)}` }; };
    const [ox, oy] = outs.map(parse);
    const vx = (await P.customRecordValue.findFirst({ where: { recordId: X, fieldId: FLD.contact.cText2 } }))?.valueText;
    const vy = (await P.customRecordValue.findFirst({ where: { recordId: Y, fieldId: FLD.contact.cText2 } }))?.valueText;
    r5 = { exported, lockAt, releaseLB, x: ox, y: oy, vx, vy };
  }
  const x = r5.x ?? {}; const y = r5.y ?? {};
  const xStartedUnderLock = x.t0 >= r5.lockAt && x.t0 < r5.releaseLB;
  const yStartedUnderLock = y.t0 >= r5.lockAt && y.t0 < r5.releaseLB;
  chk("C1.2a-R.5", "lockRecordForFieldWrite is exported (fields.ts + facade) and uses the setFieldValues lock: a setFieldValues on record X from a SEPARATE PROCESS, started while X is held (~1.5 s), completes only after the release — [control] the same call on record Y, started in the same window, completes before the release",
    exported && xStartedUnderLock && yStartedUnderLock && /^OK:/.test(x.res ?? "") && /^OK:/.test(y.res ?? "")
      && x.t1 >= r5.releaseLB && y.t1 < r5.releaseLB && r5.vx === "R5-X" && r5.vy === "R5-Y",
    "X waits past release · Y does not",
    `exported=${exported} · lockAt=${r5.lockAt} release≥${r5.releaseLB} · X t0=${x.t0} t1=${x.t1} (${x.t1 - r5.releaseLB} ms after release) ${cut(String(x.res), 120)} · Y t0=${y.t0} t1=${y.t1} (${y.t1 - r5.releaseLB} ms vs release) ${cut(String(y.res), 120)} · stored X=${j(r5.vx)} Y=${j(r5.vy)}`);

  // ── R.6 a plain PrismaClient passed as tx still gives a fork-free history ──
  const H = await newContact("ประวัติ R6", "0893330007");
  const res6 = await Promise.all(Array.from({ length: 6 }, (_x, i) =>
    F.setFieldValues(cx("contact"), H, { cHist: `r6-${i}` }, { via: "STAFF" }, prisma).then(() => `OK:r6-${i}`).catch((e: Any) => `ERR:${e instanceof Error ? e.message : String(e)}`)));
  const okValues = res6.filter((s) => s.startsWith("OK:")).map((s) => s.slice(3));
  const rows6 = await P.customRecordValue.findMany({ where: { recordId: H, fieldId: FLD.contact.cHist } });
  const h6 = (await P.customRecordValueHistory.findMany({ where: { recordId: H, fieldId: FLD.contact.cHist }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })) as Hist[];
  const c6 = chainCheck(h6, okValues, rows6[0]?.valueText);
  // control: the X3 chain checker really detects a fork (two writers that read the same old value)
  const t = new Date();
  const forked = chainCheck([{ oldValue: null, newValue: "a", createdAt: t }, { oldValue: null, newValue: "b", createdAt: t }], ["a", "b"], "b");
  chk("C1.2a-R.6", "setFieldValues(ctx, X, {cHist}, opts, prisma) — a plain PrismaClient passed as tx — ×6 in parallel with distinct values: 6 OK, one value row, a complete history chain null→…→stored with no fork (each row's old value = the previous row's new value) — [control] the same chain checker flags a synthetic forked history",
    okValues.length === 6 && rows6.length === 1 && c6.complete && c6.setOk && c6.len === 6 && !forked.complete && forked.forks === 1,
    "6 ok · 1 row · complete chain · control detects fork",
    `results=${j(res6.map((s) => cut(s, 80)))} · rows=${rows6.length} · hist=${c6.len} walked=${c6.walked} forks=${c6.forks} complete=${c6.complete} setOk=${c6.setOk} · control forks=${forked.forks} complete=${forked.complete}`);
}

// ═══════════════════════════════════════════════════════════════════════════════════
// 🔒 GOLDEN — frozen from session/crm BEFORE C1.2a (engine ignored objectKey). Regenerate only with
//    --capture-golden, which refuses once the engine honours objectKey. Keys: see g1Snapshot().
// ═══════════════════════════════════════════════════════════════════════════════════
// GOLDEN:BEGIN
// frozen 2026-09-18 from session/crm @ 18eaac6 (pre-C1.2a · P0 = objectKey ignored) — two captures byte-identical
const GOLDEN: Record<string, string> = {
  "layout": "{\"archived\":{\"sections\":[{\"collapsed\":false,\"columns\":2,\"description\":\"ชื่อ วันเกิด เพศ รหัสสมาชิก\",\"fields\":[{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:firstName\",\"isSystem\":true,\"key\":\"firstName\",\"label\":\"ชื่อจริง\",\"options\":{},\"required\":false,\"sectionId\":\"sec:profile\",\"sensitive\":false,\"showInList\":true,\"showOnCard\":true,\"sortOrder\":0,\"systemKey\":\"firstName\",\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:lastName\",\"isSystem\":true,\"key\":\"lastName\",\"label\":\"นามสกุล\",\"options\":{},\"required\":false,\"sectionId\":\"sec:profile\",\"sensitive\":false,\"showInList\":true,\"showOnCard\":false,\"sortOrder\":1,\"systemKey\":\"lastName\",\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:birthDate\",\"isSystem\":true,\"key\":\"birthDate\",\"label\":\"วันเกิด\",\"options\":{},\"required\":false,\"sectionId\":\"sec:profile\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":2,\"systemKey\":\"birthDate\",\"trackHistory\":false,\"type\":\"DATE\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:gender\",\"isSystem\":true,\"key\":\"gender\",\"label\":\"เพศ\",\"options\":{\"choices\":[{\"label\":\"ชาย\",\"value\":\"MALE\"},{\"label\":\"หญิง\",\"value\":\"FEMALE\"},{\"label\":\"อื่น ๆ\",\"value\":\"OTHER\"},{\"label\":\"ไม่ระบุ\",\"value\":\"UNSPECIFIED\"}]},\"required\":false,\"sectionId\":\"sec:profile\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":3,\"systemKey\":\"gender\",\"trackHistory\":false,\"type\":\"SELECT\",\"unique\":false}],\"id\":\"sec:profile\",\"isSystem\":true,\"key\":\"profile\",\"label\":\"ข้อมูลพื้นฐาน\",\"sensitive\":false,\"sortOrder\":0},{\"collapsed\":false,\"columns\":2,\"description\":\"เบอร์โทร อีเมล ไลน์ โซเชียล\",\"fields\":[{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:phone\",\"isSystem\":true,\"key\":\"phone\",\"label\":\"เบอร์โทร\",\"options\":{},\"required\":true,\"sectionId\":\"sec:contact\",\"sensitive\":false,\"showInList\":true,\"showOnCard\":true,\"sortOrder\":0,\"systemKey\":\"phone\",\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":true},{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:email\",\"isSystem\":true,\"key\":\"email\",\"label\":\"อีเมล\",\"options\":{},\"required\":false,\"sectionId\":\"sec:contact\",\"sensitive\":false,\"showInList\":true,\"showOnCard\":false,\"sortOrder\":1,\"systemKey\":\"email\",\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":true}],\"id\":\"sec:contact\",\"isSystem\":true,\"key\":\"contact\",\"label\":\"ช่องทางติดต่อ\",\"sensitive\":false,\"sortOrder\":1},{\"collapsed\":false,\"columns\":2,\"description\":\"ที่อยู่สำหรับจัดส่ง/ออกใบเสร็จ\",\"fields\":[{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:addressProvince\",\"isSystem\":true,\"key\":\"addressProvince\",\"label\":\"จังหวัด\",\"options\":{},\"required\":false,\"sectionId\":\"sec:address\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":0,\"systemKey\":\"addressProvince\",\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false}],\"id\":\"sec:address\",\"isSystem\":true,\"key\":\"address\",\"label\":\"ที่อยู่\",\"sensitive\":false,\"sortOrder\":2},{\"collapsed\":false,\"columns\":2,\"description\":\"ที่มา ผู้ดูแล สาขาหลัก แท็ก โน้ต\",\"fields\":[{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:tags\",\"isSystem\":true,\"key\":\"tags\",\"label\":\"แท็ก\",\"options\":{\"choices\":[]},\"required\":false,\"sectionId\":\"sec:internal\",\"sensitive\":false,\"showInList\":true,\"showOnCard\":false,\"sortOrder\":0,\"systemKey\":\"tags\",\"trackHistory\":false,\"type\":\"MULTI_SELECT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:note\",\"isSystem\":true,\"key\":\"note\",\"label\":\"โน้ตภายใน\",\"options\":{},\"required\":false,\"sectionId\":\"sec:internal\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":1,\"systemKey\":\"note\",\"trackHistory\":false,\"type\":\"LONG_TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:homeUnitId\",\"isSystem\":true,\"key\":\"homeUnitId\",\"label\":\"สาขาหลัก\",\"options\":{\"target\":\"UNIT\"},\"required\":false,\"sectionId\":\"sec:internal\",\"sensitive\":false,\"showInList\":true,\"showOnCard\":false,\"sortOrder\":2,\"systemKey\":\"homeUnitId\",\"trackHistory\":false,\"type\":\"LOOKUP\",\"unique\":false}],\"id\":\"sec:internal\",\"isSystem\":true,\"key\":\"internal\",\"label\":\"ข้อมูลภายใน\",\"sensitive\":false,\"sortOrder\":3},{\"collapsed\":true,\"columns\":3,\"description\":\"ใบรับรองและประสบการณ์\",\"fields\":[{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:certLevel\",\"isSystem\":false,\"key\":\"certLevel\",\"label\":\"ป้าย certLevel\",\"options\":{\"choices\":[{\"label\":\"Open Water\",\"value\":\"OW\"},{\"label\":\"Advanced\",\"value\":\"AOW\"},{\"color\":\"red\",\"label\":\"Rescue\",\"value\":\"RESCUE\"}]},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":true,\"showOnCard\":false,\"sortOrder\":0,\"systemKey\":null,\"trackHistory\":true,\"type\":\"SELECT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:logCount\",\"isSystem\":false,\"key\":\"logCount\",\"label\":\"ป้าย logCount\",\"options\":{\"decimals\":0,\"max\":10000,\"min\":0,\"unit\":\"ไดฟ์\"},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":1,\"systemKey\":null,\"trackHistory\":false,\"type\":\"NUMBER\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:depositSatang\",\"isSystem\":false,\"key\":\"depositSatang\",\"label\":\"ป้าย depositSatang\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":2,\"systemKey\":null,\"trackHistory\":false,\"type\":\"MONEY\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:lastDiveOn\",\"isSystem\":false,\"key\":\"lastDiveOn\",\"label\":\"ป้าย lastDiveOn\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":3,\"systemKey\":null,\"trackHistory\":false,\"type\":\"DATE\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:nextCheckAt\",\"isSystem\":false,\"key\":\"nextCheckAt\",\"label\":\"ป้าย nextCheckAt\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":4,\"systemKey\":null,\"trackHistory\":false,\"type\":\"DATETIME\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:interests\",\"isSystem\":false,\"key\":\"interests\",\"label\":\"ป้าย interests\",\"options\":{\"choices\":[{\"label\":\"wreck\",\"value\":\"wreck\"},{\"label\":\"reef\",\"value\":\"reef\"},{\"label\":\"macro\",\"value\":\"macro\"}]},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":5,\"systemKey\":null,\"trackHistory\":false,\"type\":\"MULTI_SELECT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:hasGear\",\"isSystem\":false,\"key\":\"hasGear\",\"label\":\"ป้าย hasGear\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":6,\"systemKey\":null,\"trackHistory\":false,\"type\":\"BOOLEAN\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":\"ประวัติ\",\"filterable\":false,\"id\":\"fld:bio\",\"isSystem\":false,\"key\":\"bio\",\"label\":\"ประวัติย่อ (แก้ป้าย)\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":7,\"systemKey\":null,\"trackHistory\":false,\"type\":\"LONG_TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:favSpot\",\"isSystem\":false,\"key\":\"favSpot\",\"label\":\"ป้าย favSpot\",\"options\":{\"maxLength\":30},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":8,\"systemKey\":null,\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:buddyId\",\"isSystem\":false,\"key\":\"buddyId\",\"label\":\"ป้าย buddyId\",\"options\":{\"target\":\"CUSTOMER\"},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":9,\"systemKey\":null,\"trackHistory\":false,\"type\":\"LOOKUP\",\"unique\":false},{\"archivedAt\":\"<date>\",\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:oldCode\",\"isSystem\":false,\"key\":\"oldCode\",\"label\":\"ป้าย oldCode\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":10,\"systemKey\":null,\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:certAgency\",\"isSystem\":false,\"key\":\"certAgency\",\"label\":\"หน่วยงานที่ออกใบรับรอง\",\"options\":{\"choices\":[{\"label\":\"PADI\",\"value\":\"PADI\"},{\"label\":\"SSI\",\"value\":\"SSI\"},{\"label\":\"NAUI\",\"value\":\"NAUI\"},{\"label\":\"อื่น ๆ\",\"value\":\"OTHER\"}]},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":11,\"systemKey\":null,\"trackHistory\":false,\"type\":\"SELECT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:certNo\",\"isSystem\":false,\"key\":\"certNo\",\"label\":\"เลขที่ใบรับรอง\",\"options\":{\"maxLength\":40},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":12,\"systemKey\":null,\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:diveCount\",\"isSystem\":false,\"key\":\"diveCount\",\"label\":\"จำนวนไดฟ์สะสม\",\"options\":{\"decimals\":0,\"min\":0,\"unit\":\"ไดฟ์\"},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":13,\"systemKey\":null,\"trackHistory\":false,\"type\":\"NUMBER\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:lastDiveAt\",\"isSystem\":false,\"key\":\"lastDiveAt\",\"label\":\"ไดฟ์ล่าสุด\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":14,\"systemKey\":null,\"trackHistory\":false,\"type\":\"DATE\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:wetsuitSize\",\"isSystem\":false,\"key\":\"wetsuitSize\",\"label\":\"ไซซ์เว็ทสูท\",\"options\":{\"choices\":[{\"label\":\"XS\",\"value\":\"XS\"},{\"label\":\"S\",\"value\":\"S\"},{\"label\":\"M\",\"value\":\"M\"},{\"label\":\"L\",\"value\":\"L\"},{\"label\":\"XL\",\"value\":\"XL\"},{\"label\":\"XXL\",\"value\":\"XXL\"}]},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":15,\"systemKey\":null,\"trackHistory\":false,\"type\":\"SELECT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:bootSize\",\"isSystem\":false,\"key\":\"bootSize\",\"label\":\"ไซซ์รองเท้าบูท\",\"options\":{\"choices\":[{\"label\":\"36\",\"value\":\"36\"},{\"label\":\"37\",\"value\":\"37\"},{\"label\":\"38\",\"value\":\"38\"},{\"label\":\"39\",\"value\":\"39\"},{\"label\":\"40\",\"value\":\"40\"},{\"label\":\"41\",\"value\":\"41\"},{\"label\":\"42\",\"value\":\"42\"},{\"label\":\"43\",\"value\":\"43\"},{\"label\":\"44\",\"value\":\"44\"},{\"label\":\"45\",\"value\":\"45\"},{\"label\":\"46\",\"value\":\"46\"}]},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":16,\"systemKey\":null,\"trackHistory\":false,\"type\":\"SELECT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:insuranceNo\",\"isSystem\":false,\"key\":\"insuranceNo\",\"label\":\"เลขกรมธรรม์ประกันดำน้ำ\",\"options\":{\"maxLength\":40},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":17,\"systemKey\":null,\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:insuranceExpiresAt\",\"isSystem\":false,\"key\":\"insuranceExpiresAt\",\"label\":\"ประกันดำน้ำหมดอายุ\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":18,\"systemKey\":null,\"trackHistory\":false,\"type\":\"DATE\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:instructorId\",\"isSystem\":false,\"key\":\"instructorId\",\"label\":\"ครูประจำ\",\"options\":{\"target\":\"EMPLOYEE\"},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":19,\"systemKey\":null,\"trackHistory\":false,\"type\":\"LOOKUP\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:medicalCertFile\",\"isSystem\":false,\"key\":\"medicalCertFile\",\"label\":\"ใบรับรองแพทย์\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":20,\"systemKey\":null,\"trackHistory\":false,\"type\":\"FILE\",\"unique\":false}],\"id\":\"sec:dive\",\"isSystem\":false,\"key\":\"dive\",\"label\":\"ดำน้ำ (ร้านตั้งเอง)\",\"sensitive\":false,\"sortOrder\":4},{\"collapsed\":false,\"columns\":1,\"description\":null,\"fields\":[{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:allergy\",\"isSystem\":false,\"key\":\"allergy\",\"label\":\"ป้าย allergy\",\"options\":{},\"required\":false,\"sectionId\":\"sec:health\",\"sensitive\":true,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":0,\"systemKey\":null,\"trackHistory\":true,\"type\":\"TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:medicalFile\",\"isSystem\":false,\"key\":\"medicalFile\",\"label\":\"ป้าย medicalFile\",\"options\":{},\"required\":false,\"sectionId\":\"sec:health\",\"sensitive\":true,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":1,\"systemKey\":null,\"trackHistory\":false,\"type\":\"FILE\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:conditions\",\"isSystem\":false,\"key\":\"conditions\",\"label\":\"โรคประจำตัว\",\"options\":{},\"required\":false,\"sectionId\":\"sec:health\",\"sensitive\":true,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":2,\"systemKey\":null,\"trackHistory\":true,\"type\":\"LONG_TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:emergencyContact\",\"isSystem\":false,\"key\":\"emergencyContact\",\"label\":\"ผู้ติดต่อฉุกเฉิน\",\"options\":{},\"required\":false,\"sectionId\":\"sec:health\",\"sensitive\":true,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":3,\"systemKey\":null,\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false}],\"id\":\"sec:health\",\"isSystem\":false,\"key\":\"health\",\"label\":\"สุขภาพ\",\"sensitive\":true,\"sortOrder\":5}]},\"customer\":{\"sections\":[{\"collapsed\":false,\"columns\":2,\"description\":\"ชื่อ วันเกิด เพศ รหัสสมาชิก\",\"fields\":[{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:firstName\",\"isSystem\":true,\"key\":\"firstName\",\"label\":\"ชื่อจริง\",\"options\":{},\"required\":false,\"sectionId\":\"sec:profile\",\"sensitive\":false,\"showInList\":true,\"showOnCard\":true,\"sortOrder\":0,\"systemKey\":\"firstName\",\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:lastName\",\"isSystem\":true,\"key\":\"lastName\",\"label\":\"นามสกุล\",\"options\":{},\"required\":false,\"sectionId\":\"sec:profile\",\"sensitive\":false,\"showInList\":true,\"showOnCard\":false,\"sortOrder\":1,\"systemKey\":\"lastName\",\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:birthDate\",\"isSystem\":true,\"key\":\"birthDate\",\"label\":\"วันเกิด\",\"options\":{},\"required\":false,\"sectionId\":\"sec:profile\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":2,\"systemKey\":\"birthDate\",\"trackHistory\":false,\"type\":\"DATE\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:gender\",\"isSystem\":true,\"key\":\"gender\",\"label\":\"เพศ\",\"options\":{\"choices\":[{\"label\":\"ชาย\",\"value\":\"MALE\"},{\"label\":\"หญิง\",\"value\":\"FEMALE\"},{\"label\":\"อื่น ๆ\",\"value\":\"OTHER\"},{\"label\":\"ไม่ระบุ\",\"value\":\"UNSPECIFIED\"}]},\"required\":false,\"sectionId\":\"sec:profile\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":3,\"systemKey\":\"gender\",\"trackHistory\":false,\"type\":\"SELECT\",\"unique\":false}],\"id\":\"sec:profile\",\"isSystem\":true,\"key\":\"profile\",\"label\":\"ข้อมูลพื้นฐาน\",\"sensitive\":false,\"sortOrder\":0},{\"collapsed\":false,\"columns\":2,\"description\":\"เบอร์โทร อีเมล ไลน์ โซเชียล\",\"fields\":[{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:email\",\"isSystem\":true,\"key\":\"email\",\"label\":\"อีเมล\",\"options\":{},\"required\":false,\"sectionId\":\"sec:contact\",\"sensitive\":false,\"showInList\":true,\"showOnCard\":false,\"sortOrder\":1,\"systemKey\":\"email\",\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":true}],\"id\":\"sec:contact\",\"isSystem\":true,\"key\":\"contact\",\"label\":\"ช่องทางติดต่อ\",\"sensitive\":false,\"sortOrder\":1},{\"collapsed\":false,\"columns\":2,\"description\":\"ที่อยู่สำหรับจัดส่ง/ออกใบเสร็จ\",\"fields\":[{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:addressProvince\",\"isSystem\":true,\"key\":\"addressProvince\",\"label\":\"จังหวัด\",\"options\":{},\"required\":false,\"sectionId\":\"sec:address\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":0,\"systemKey\":\"addressProvince\",\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false}],\"id\":\"sec:address\",\"isSystem\":true,\"key\":\"address\",\"label\":\"ที่อยู่\",\"sensitive\":false,\"sortOrder\":2},{\"collapsed\":true,\"columns\":3,\"description\":\"ใบรับรองและประสบการณ์\",\"fields\":[{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":\"ประวัติ\",\"filterable\":false,\"id\":\"fld:bio\",\"isSystem\":false,\"key\":\"bio\",\"label\":\"ประวัติย่อ (แก้ป้าย)\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":7,\"systemKey\":null,\"trackHistory\":false,\"type\":\"LONG_TEXT\",\"unique\":false}],\"id\":\"sec:dive\",\"isSystem\":false,\"key\":\"dive\",\"label\":\"ดำน้ำ (ร้านตั้งเอง)\",\"sensitive\":false,\"sortOrder\":4}]},\"staff\":{\"sections\":[{\"collapsed\":false,\"columns\":2,\"description\":\"ชื่อ วันเกิด เพศ รหัสสมาชิก\",\"fields\":[{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:firstName\",\"isSystem\":true,\"key\":\"firstName\",\"label\":\"ชื่อจริง\",\"options\":{},\"required\":false,\"sectionId\":\"sec:profile\",\"sensitive\":false,\"showInList\":true,\"showOnCard\":true,\"sortOrder\":0,\"systemKey\":\"firstName\",\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:lastName\",\"isSystem\":true,\"key\":\"lastName\",\"label\":\"นามสกุล\",\"options\":{},\"required\":false,\"sectionId\":\"sec:profile\",\"sensitive\":false,\"showInList\":true,\"showOnCard\":false,\"sortOrder\":1,\"systemKey\":\"lastName\",\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:birthDate\",\"isSystem\":true,\"key\":\"birthDate\",\"label\":\"วันเกิด\",\"options\":{},\"required\":false,\"sectionId\":\"sec:profile\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":2,\"systemKey\":\"birthDate\",\"trackHistory\":false,\"type\":\"DATE\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:gender\",\"isSystem\":true,\"key\":\"gender\",\"label\":\"เพศ\",\"options\":{\"choices\":[{\"label\":\"ชาย\",\"value\":\"MALE\"},{\"label\":\"หญิง\",\"value\":\"FEMALE\"},{\"label\":\"อื่น ๆ\",\"value\":\"OTHER\"},{\"label\":\"ไม่ระบุ\",\"value\":\"UNSPECIFIED\"}]},\"required\":false,\"sectionId\":\"sec:profile\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":3,\"systemKey\":\"gender\",\"trackHistory\":false,\"type\":\"SELECT\",\"unique\":false}],\"id\":\"sec:profile\",\"isSystem\":true,\"key\":\"profile\",\"label\":\"ข้อมูลพื้นฐาน\",\"sensitive\":false,\"sortOrder\":0},{\"collapsed\":false,\"columns\":2,\"description\":\"เบอร์โทร อีเมล ไลน์ โซเชียล\",\"fields\":[{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:phone\",\"isSystem\":true,\"key\":\"phone\",\"label\":\"เบอร์โทร\",\"options\":{},\"required\":true,\"sectionId\":\"sec:contact\",\"sensitive\":false,\"showInList\":true,\"showOnCard\":true,\"sortOrder\":0,\"systemKey\":\"phone\",\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":true},{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:email\",\"isSystem\":true,\"key\":\"email\",\"label\":\"อีเมล\",\"options\":{},\"required\":false,\"sectionId\":\"sec:contact\",\"sensitive\":false,\"showInList\":true,\"showOnCard\":false,\"sortOrder\":1,\"systemKey\":\"email\",\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":true}],\"id\":\"sec:contact\",\"isSystem\":true,\"key\":\"contact\",\"label\":\"ช่องทางติดต่อ\",\"sensitive\":false,\"sortOrder\":1},{\"collapsed\":false,\"columns\":2,\"description\":\"ที่อยู่สำหรับจัดส่ง/ออกใบเสร็จ\",\"fields\":[{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:addressProvince\",\"isSystem\":true,\"key\":\"addressProvince\",\"label\":\"จังหวัด\",\"options\":{},\"required\":false,\"sectionId\":\"sec:address\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":0,\"systemKey\":\"addressProvince\",\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false}],\"id\":\"sec:address\",\"isSystem\":true,\"key\":\"address\",\"label\":\"ที่อยู่\",\"sensitive\":false,\"sortOrder\":2},{\"collapsed\":false,\"columns\":2,\"description\":\"ที่มา ผู้ดูแล สาขาหลัก แท็ก โน้ต\",\"fields\":[{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:tags\",\"isSystem\":true,\"key\":\"tags\",\"label\":\"แท็ก\",\"options\":{\"choices\":[]},\"required\":false,\"sectionId\":\"sec:internal\",\"sensitive\":false,\"showInList\":true,\"showOnCard\":false,\"sortOrder\":0,\"systemKey\":\"tags\",\"trackHistory\":false,\"type\":\"MULTI_SELECT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:note\",\"isSystem\":true,\"key\":\"note\",\"label\":\"โน้ตภายใน\",\"options\":{},\"required\":false,\"sectionId\":\"sec:internal\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":1,\"systemKey\":\"note\",\"trackHistory\":false,\"type\":\"LONG_TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:homeUnitId\",\"isSystem\":true,\"key\":\"homeUnitId\",\"label\":\"สาขาหลัก\",\"options\":{\"target\":\"UNIT\"},\"required\":false,\"sectionId\":\"sec:internal\",\"sensitive\":false,\"showInList\":true,\"showOnCard\":false,\"sortOrder\":2,\"systemKey\":\"homeUnitId\",\"trackHistory\":false,\"type\":\"LOOKUP\",\"unique\":false}],\"id\":\"sec:internal\",\"isSystem\":true,\"key\":\"internal\",\"label\":\"ข้อมูลภายใน\",\"sensitive\":false,\"sortOrder\":3},{\"collapsed\":true,\"columns\":3,\"description\":\"ใบรับรองและประสบการณ์\",\"fields\":[{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:certLevel\",\"isSystem\":false,\"key\":\"certLevel\",\"label\":\"ป้าย certLevel\",\"options\":{\"choices\":[{\"label\":\"Open Water\",\"value\":\"OW\"},{\"label\":\"Advanced\",\"value\":\"AOW\"},{\"color\":\"red\",\"label\":\"Rescue\",\"value\":\"RESCUE\"}]},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":true,\"showOnCard\":false,\"sortOrder\":0,\"systemKey\":null,\"trackHistory\":true,\"type\":\"SELECT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:logCount\",\"isSystem\":false,\"key\":\"logCount\",\"label\":\"ป้าย logCount\",\"options\":{\"decimals\":0,\"max\":10000,\"min\":0,\"unit\":\"ไดฟ์\"},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":1,\"systemKey\":null,\"trackHistory\":false,\"type\":\"NUMBER\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:depositSatang\",\"isSystem\":false,\"key\":\"depositSatang\",\"label\":\"ป้าย depositSatang\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":2,\"systemKey\":null,\"trackHistory\":false,\"type\":\"MONEY\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:lastDiveOn\",\"isSystem\":false,\"key\":\"lastDiveOn\",\"label\":\"ป้าย lastDiveOn\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":3,\"systemKey\":null,\"trackHistory\":false,\"type\":\"DATE\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:nextCheckAt\",\"isSystem\":false,\"key\":\"nextCheckAt\",\"label\":\"ป้าย nextCheckAt\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":4,\"systemKey\":null,\"trackHistory\":false,\"type\":\"DATETIME\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:interests\",\"isSystem\":false,\"key\":\"interests\",\"label\":\"ป้าย interests\",\"options\":{\"choices\":[{\"label\":\"wreck\",\"value\":\"wreck\"},{\"label\":\"reef\",\"value\":\"reef\"},{\"label\":\"macro\",\"value\":\"macro\"}]},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":5,\"systemKey\":null,\"trackHistory\":false,\"type\":\"MULTI_SELECT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:hasGear\",\"isSystem\":false,\"key\":\"hasGear\",\"label\":\"ป้าย hasGear\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":6,\"systemKey\":null,\"trackHistory\":false,\"type\":\"BOOLEAN\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":\"ประวัติ\",\"filterable\":false,\"id\":\"fld:bio\",\"isSystem\":false,\"key\":\"bio\",\"label\":\"ประวัติย่อ (แก้ป้าย)\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":7,\"systemKey\":null,\"trackHistory\":false,\"type\":\"LONG_TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:favSpot\",\"isSystem\":false,\"key\":\"favSpot\",\"label\":\"ป้าย favSpot\",\"options\":{\"maxLength\":30},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":8,\"systemKey\":null,\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:buddyId\",\"isSystem\":false,\"key\":\"buddyId\",\"label\":\"ป้าย buddyId\",\"options\":{\"target\":\"CUSTOMER\"},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":9,\"systemKey\":null,\"trackHistory\":false,\"type\":\"LOOKUP\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:certAgency\",\"isSystem\":false,\"key\":\"certAgency\",\"label\":\"หน่วยงานที่ออกใบรับรอง\",\"options\":{\"choices\":[{\"label\":\"PADI\",\"value\":\"PADI\"},{\"label\":\"SSI\",\"value\":\"SSI\"},{\"label\":\"NAUI\",\"value\":\"NAUI\"},{\"label\":\"อื่น ๆ\",\"value\":\"OTHER\"}]},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":11,\"systemKey\":null,\"trackHistory\":false,\"type\":\"SELECT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:certNo\",\"isSystem\":false,\"key\":\"certNo\",\"label\":\"เลขที่ใบรับรอง\",\"options\":{\"maxLength\":40},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":12,\"systemKey\":null,\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:diveCount\",\"isSystem\":false,\"key\":\"diveCount\",\"label\":\"จำนวนไดฟ์สะสม\",\"options\":{\"decimals\":0,\"min\":0,\"unit\":\"ไดฟ์\"},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":13,\"systemKey\":null,\"trackHistory\":false,\"type\":\"NUMBER\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:lastDiveAt\",\"isSystem\":false,\"key\":\"lastDiveAt\",\"label\":\"ไดฟ์ล่าสุด\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":14,\"systemKey\":null,\"trackHistory\":false,\"type\":\"DATE\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:wetsuitSize\",\"isSystem\":false,\"key\":\"wetsuitSize\",\"label\":\"ไซซ์เว็ทสูท\",\"options\":{\"choices\":[{\"label\":\"XS\",\"value\":\"XS\"},{\"label\":\"S\",\"value\":\"S\"},{\"label\":\"M\",\"value\":\"M\"},{\"label\":\"L\",\"value\":\"L\"},{\"label\":\"XL\",\"value\":\"XL\"},{\"label\":\"XXL\",\"value\":\"XXL\"}]},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":15,\"systemKey\":null,\"trackHistory\":false,\"type\":\"SELECT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:bootSize\",\"isSystem\":false,\"key\":\"bootSize\",\"label\":\"ไซซ์รองเท้าบูท\",\"options\":{\"choices\":[{\"label\":\"36\",\"value\":\"36\"},{\"label\":\"37\",\"value\":\"37\"},{\"label\":\"38\",\"value\":\"38\"},{\"label\":\"39\",\"value\":\"39\"},{\"label\":\"40\",\"value\":\"40\"},{\"label\":\"41\",\"value\":\"41\"},{\"label\":\"42\",\"value\":\"42\"},{\"label\":\"43\",\"value\":\"43\"},{\"label\":\"44\",\"value\":\"44\"},{\"label\":\"45\",\"value\":\"45\"},{\"label\":\"46\",\"value\":\"46\"}]},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":16,\"systemKey\":null,\"trackHistory\":false,\"type\":\"SELECT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:insuranceNo\",\"isSystem\":false,\"key\":\"insuranceNo\",\"label\":\"เลขกรมธรรม์ประกันดำน้ำ\",\"options\":{\"maxLength\":40},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":17,\"systemKey\":null,\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:insuranceExpiresAt\",\"isSystem\":false,\"key\":\"insuranceExpiresAt\",\"label\":\"ประกันดำน้ำหมดอายุ\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":18,\"systemKey\":null,\"trackHistory\":false,\"type\":\"DATE\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:instructorId\",\"isSystem\":false,\"key\":\"instructorId\",\"label\":\"ครูประจำ\",\"options\":{\"target\":\"EMPLOYEE\"},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":19,\"systemKey\":null,\"trackHistory\":false,\"type\":\"LOOKUP\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:medicalCertFile\",\"isSystem\":false,\"key\":\"medicalCertFile\",\"label\":\"ใบรับรองแพทย์\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":20,\"systemKey\":null,\"trackHistory\":false,\"type\":\"FILE\",\"unique\":false}],\"id\":\"sec:dive\",\"isSystem\":false,\"key\":\"dive\",\"label\":\"ดำน้ำ (ร้านตั้งเอง)\",\"sensitive\":false,\"sortOrder\":4},{\"collapsed\":false,\"columns\":1,\"description\":null,\"fields\":[{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:allergy\",\"isSystem\":false,\"key\":\"allergy\",\"label\":\"ป้าย allergy\",\"options\":{},\"required\":false,\"sectionId\":\"sec:health\",\"sensitive\":true,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":0,\"systemKey\":null,\"trackHistory\":true,\"type\":\"TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:medicalFile\",\"isSystem\":false,\"key\":\"medicalFile\",\"label\":\"ป้าย medicalFile\",\"options\":{},\"required\":false,\"sectionId\":\"sec:health\",\"sensitive\":true,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":1,\"systemKey\":null,\"trackHistory\":false,\"type\":\"FILE\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:conditions\",\"isSystem\":false,\"key\":\"conditions\",\"label\":\"โรคประจำตัว\",\"options\":{},\"required\":false,\"sectionId\":\"sec:health\",\"sensitive\":true,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":2,\"systemKey\":null,\"trackHistory\":true,\"type\":\"LONG_TEXT\",\"unique\":false},{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:emergencyContact\",\"isSystem\":false,\"key\":\"emergencyContact\",\"label\":\"ผู้ติดต่อฉุกเฉิน\",\"options\":{},\"required\":false,\"sectionId\":\"sec:health\",\"sensitive\":true,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":3,\"systemKey\":null,\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false}],\"id\":\"sec:health\",\"isSystem\":false,\"key\":\"health\",\"label\":\"สุขภาพ\",\"sensitive\":true,\"sortOrder\":5}]}}",
  "values": "{\"cust:A\":{\"addressProvince\":\"กระบี่\",\"allergy\":\"กุ้ง, ถั่ว\",\"bio\":\"ชอบดำน้ำกลางคืน\",\"birthDate\":\"1990-05-20\",\"buddyId\":\"cust:B\",\"certLevel\":\"RESCUE\",\"depositSatang\":1500.5,\"email\":\"g1-a@example.test\",\"firstName\":\"สมชาย\",\"gender\":\"MALE\",\"hasGear\":true,\"homeUnitId\":\"unit:U\",\"interests\":[\"wreck\",\"reef\"],\"lastDiveOn\":\"2026-03-15\",\"lastName\":\"ใจดี\",\"logCount\":42,\"medicalFile\":\"file-qc-1\",\"nextCheckAt\":\"2026-04-01T02:30:00.000Z\",\"note\":\"ลูกค้าประจำ\",\"phone\":\"0810000001\",\"tags\":[\"vip\"]},\"cust:B\":{\"bio\":\"ของลูกค้าเอง\",\"birthDate\":\"1985-11-02\",\"certLevel\":\"OW\",\"favSpot\":\"Similan\",\"firstName\":\"สมหญิง\",\"gender\":\"FEMALE\",\"hasGear\":false,\"interests\":[\"reef\"],\"lastDiveOn\":\"2025-12-31\",\"logCount\":5,\"nextCheckAt\":\"2026-05-01T00:00:00.000Z\",\"phone\":\"0810000002\"},\"cust:C\":{\"addressProvince\":\"ตรัง\",\"birthDate\":\"2000-01-31\",\"firstName\":\"ทดสอบ\",\"phone\":\"0810000003\"},\"no-such-id\":{}}",
  "filterWhere": "{\"boolF\":{\"AND\":[{\"id\":{\"in\":[\"cust:B\"]}}]},\"boolThai\":{\"AND\":[{\"id\":{\"in\":[\"cust:A\"]}}]},\"combined\":{\"AND\":[{\"id\":{\"in\":[\"cust:A\",\"cust:B\"]}},{\"id\":{\"in\":[\"cust:A\"]}}]},\"dateEq\":{\"AND\":[{\"id\":{\"in\":[\"cust:B\"]}}]},\"dateRange\":{\"AND\":[{\"id\":{\"in\":[\"cust:A\"]}}]},\"dtFrom\":{\"AND\":[{\"id\":{\"in\":[\"cust:B\"]}}]},\"empty\":{},\"fileF\":{\"AND\":[{\"id\":{\"notIn\":[\"cust:A\"]}}]},\"fileT\":{\"AND\":[{\"id\":{\"in\":[\"cust:A\"]}}]},\"lookup\":{\"AND\":[{\"id\":{\"in\":[\"cust:A\"]}}]},\"multi1\":{\"AND\":[{\"id\":{\"in\":[\"cust:A\"]}}]},\"multi2\":{\"AND\":[{\"id\":{\"in\":[\"cust:A\",\"cust:B\"]}}]},\"numEq\":{\"AND\":[{\"id\":{\"in\":[\"cust:B\"]}}]},\"numRange\":{\"AND\":[{\"id\":{\"in\":[\"cust:A\"]}}]},\"numTo\":{\"AND\":[{\"id\":{\"in\":[\"cust:B\"]}}]},\"sel\":{\"AND\":[{\"id\":{\"in\":[\"cust:A\"]}}]},\"sysAddress\":{\"AND\":[{\"id\":{\"in\":[\"cust:A\"]}}]},\"sysDate\":{\"AND\":[{\"birthDate\":{\"gte\":\"1985-01-01T00:00:00.000Z\",\"lt\":\"1990-01-01T00:00:00.000Z\"}}]},\"sysLookup\":{\"AND\":[{\"homeUnitId\":\"unit:U\"}]},\"sysMulti\":{\"AND\":[{\"OR\":[{\"tags\":{\"array_contains\":[\"vip\"]}}]}]},\"sysSelect\":{\"AND\":[{\"gender\":{\"in\":[\"FEMALE\",\"MALE\"]}}]},\"sysText\":{\"AND\":[{\"phone\":{\"contains\":\"0810\"}}]},\"sysTextEq\":{\"AND\":[{\"phone\":\"0810000003\"}]},\"text\":{\"AND\":[{\"id\":{\"in\":[\"cust:B\"]}}]},\"textEq\":{\"AND\":[{\"id\":{\"in\":[\"cust:B\"]}}]}}",
  "filterRows": "{\"boolF\":[\"cust:B\"],\"boolThai\":[\"cust:A\"],\"combined\":[\"cust:A\"],\"dateEq\":[\"cust:B\"],\"dateRange\":[\"cust:A\"],\"dtFrom\":[\"cust:B\"],\"empty\":[\"cust:A\",\"cust:B\",\"cust:C\"],\"fileF\":[\"cust:B\",\"cust:C\"],\"fileT\":[\"cust:A\"],\"lookup\":[\"cust:A\"],\"multi1\":[\"cust:A\"],\"multi2\":[\"cust:A\",\"cust:B\"],\"numEq\":[\"cust:B\"],\"numRange\":[\"cust:A\"],\"numTo\":[\"cust:B\"],\"sel\":[\"cust:A\"],\"sysAddress\":[\"cust:A\"],\"sysDate\":[\"cust:B\"],\"sysLookup\":[\"cust:A\"],\"sysMulti\":[\"cust:A\"],\"sysSelect\":[\"cust:A\",\"cust:B\"],\"sysText\":[\"cust:A\",\"cust:B\",\"cust:C\"],\"sysTextEq\":[\"cust:C\"],\"text\":[\"cust:B\"],\"textEq\":[\"cust:B\"]}",
  "checks": "{\"check\":{\"blank\":{\"value\":null},\"bool\":{\"value\":false},\"date\":{\"value\":\"2026-01-02\"},\"dt\":{\"value\":\"2026-01-02T03:04:05.000Z\"},\"file\":{\"value\":\"f1\"},\"lookupNoDb\":{\"value\":\"abc\"},\"money3\":{\"error\":\"ค่าของฟิลด์ \\\"ป้าย depositSatang\\\" มีทศนิยมได้ไม่เกิน 2 ตำแหน่ง\"},\"multiDup\":{\"value\":[\"macro\"]},\"n7\":{\"value\":7},\"n7.5\":{\"error\":\"ค่าของฟิลด์ \\\"ป้าย logCount\\\" ต้องเป็นจำนวนเต็ม\"},\"nStr\":{\"error\":\"ค่าของฟิลด์ \\\"ป้าย logCount\\\" ต้องเป็นตัวเลข\"},\"reqNull\":{\"error\":\"ฟิลด์ \\\"เบอร์โทร\\\" เป็นข้อมูลที่ต้องกรอก — ใส่ค่าก่อนบันทึก\"},\"selBad\":{\"error\":\"ค่า \\\"x\\\" ไม่อยู่ในตัวเลือกของฟิลด์ \\\"ป้าย certLevel\\\" — เลือกได้ OW / AOW / RESCUE\"},\"selOk\":{\"value\":\"OW\"},\"trim\":{\"value\":\"0899\"}},\"opts\":{\"boolIgnores\":{\"value\":{}},\"lookupUnit\":{\"value\":{\"target\":\"UNIT\"}},\"numMinMax\":{\"error\":\"ค่าต่ำสุดต้องไม่มากกว่าค่าสูงสุด\"},\"select\":{\"value\":{\"choices\":[{\"label\":\"A\",\"value\":\"a\"},{\"color\":\"red\",\"label\":\"B\",\"value\":\"b\"}]}},\"selectEmpty\":{\"error\":\"ฟิลด์ชนิดตัวเลือกต้องมีรายการให้เลือกอย่างน้อย 1 ตัว และไม่เกิน 50 ตัว (แต่ละตัวมีค่า value และป้ายที่แสดง)\"},\"textPattern\":{\"error\":\"รูปแบบ (pattern) \\\"[\\\" ไม่ใช่นิพจน์ที่ระบบอ่านได้ — ตรวจอีกครั้งหรือเว้นว่างไว้\"}}}",
  "readErrors": "{\"filter.badBool\":\"ตัวกรองของฟิลด์ \\\"ป้าย hasGear\\\" ต้องเป็น true หรือ false\",\"filter.badDate\":\"ตัวกรองของฟิลด์ \\\"ป้าย lastDiveOn\\\" ต้องเป็นวันที่รูปแบบ ปี-เดือน-วัน เช่น 2026-01-01..2026-03-31\",\"filter.badNumber\":\"ตัวกรองของฟิลด์ \\\"ป้าย logCount\\\" ต้องเป็นตัวเลข เช่น 10..50 หรือ =42\",\"filter.emptySelect\":\"ตัวกรองของฟิลด์ \\\"ป้าย certLevel\\\" ต้องมีอย่างน้อย 1 ตัวเลือก (คั่นหลายตัวด้วยจุลภาค)\",\"filter.notFilterable\":\"ฟิลด์ \\\"ประวัติย่อ (แก้ป้าย)\\\" ยังไม่ได้เปิด \\\"ใช้กรองได้\\\" — เปิดที่หน้าตั้งค่าฟิลด์ก่อนจึงกรองด้วยฟิลด์นี้ได้\",\"filter.unknown\":\"ไม่มีฟิลด์ชื่ออ้างอิง \\\"nope\\\" ในระบบสมาชิกนี้ จึงใช้กรองไม่ได้\"}",
  "dto": "{\"archOld\":{\"archivedAt\":\"<date>\",\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:oldCode\",\"isSystem\":false,\"key\":\"oldCode\",\"label\":\"ป้าย oldCode\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":10,\"systemKey\":null,\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false},\"f:allergy\":{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:allergy\",\"isSystem\":false,\"key\":\"allergy\",\"label\":\"ป้าย allergy\",\"options\":{},\"required\":false,\"sectionId\":\"sec:health\",\"sensitive\":true,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":0,\"systemKey\":null,\"trackHistory\":true,\"type\":\"TEXT\",\"unique\":false},\"f:bio\":{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":\"ประวัติ\",\"filterable\":false,\"id\":\"fld:bio\",\"isSystem\":false,\"key\":\"bio\",\"label\":\"ป้าย bio\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":7,\"systemKey\":null,\"trackHistory\":false,\"type\":\"LONG_TEXT\",\"unique\":false},\"f:buddyId\":{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:buddyId\",\"isSystem\":false,\"key\":\"buddyId\",\"label\":\"ป้าย buddyId\",\"options\":{\"target\":\"CUSTOMER\"},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":9,\"systemKey\":null,\"trackHistory\":false,\"type\":\"LOOKUP\",\"unique\":false},\"f:certLevel\":{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:certLevel\",\"isSystem\":false,\"key\":\"certLevel\",\"label\":\"ป้าย certLevel\",\"options\":{\"choices\":[{\"label\":\"Open Water\",\"value\":\"OW\"},{\"label\":\"Advanced\",\"value\":\"AOW\"},{\"color\":\"red\",\"label\":\"Rescue\",\"value\":\"RESCUE\"}]},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":true,\"showOnCard\":false,\"sortOrder\":0,\"systemKey\":null,\"trackHistory\":true,\"type\":\"SELECT\",\"unique\":false},\"f:depositSatang\":{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:depositSatang\",\"isSystem\":false,\"key\":\"depositSatang\",\"label\":\"ป้าย depositSatang\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":2,\"systemKey\":null,\"trackHistory\":false,\"type\":\"MONEY\",\"unique\":false},\"f:favSpot\":{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:favSpot\",\"isSystem\":false,\"key\":\"favSpot\",\"label\":\"ป้าย favSpot\",\"options\":{\"maxLength\":30},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":8,\"systemKey\":null,\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false},\"f:hasGear\":{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:hasGear\",\"isSystem\":false,\"key\":\"hasGear\",\"label\":\"ป้าย hasGear\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":6,\"systemKey\":null,\"trackHistory\":false,\"type\":\"BOOLEAN\",\"unique\":false},\"f:interests\":{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:interests\",\"isSystem\":false,\"key\":\"interests\",\"label\":\"ป้าย interests\",\"options\":{\"choices\":[{\"label\":\"wreck\",\"value\":\"wreck\"},{\"label\":\"reef\",\"value\":\"reef\"},{\"label\":\"macro\",\"value\":\"macro\"}]},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":5,\"systemKey\":null,\"trackHistory\":false,\"type\":\"MULTI_SELECT\",\"unique\":false},\"f:lastDiveOn\":{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:lastDiveOn\",\"isSystem\":false,\"key\":\"lastDiveOn\",\"label\":\"ป้าย lastDiveOn\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":3,\"systemKey\":null,\"trackHistory\":false,\"type\":\"DATE\",\"unique\":false},\"f:logCount\":{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:logCount\",\"isSystem\":false,\"key\":\"logCount\",\"label\":\"ป้าย logCount\",\"options\":{\"decimals\":0,\"max\":10000,\"min\":0,\"unit\":\"ไดฟ์\"},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":1,\"systemKey\":null,\"trackHistory\":false,\"type\":\"NUMBER\",\"unique\":false},\"f:medicalFile\":{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:medicalFile\",\"isSystem\":false,\"key\":\"medicalFile\",\"label\":\"ป้าย medicalFile\",\"options\":{},\"required\":false,\"sectionId\":\"sec:health\",\"sensitive\":true,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":1,\"systemKey\":null,\"trackHistory\":false,\"type\":\"FILE\",\"unique\":false},\"f:nextCheckAt\":{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:nextCheckAt\",\"isSystem\":false,\"key\":\"nextCheckAt\",\"label\":\"ป้าย nextCheckAt\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":4,\"systemKey\":null,\"trackHistory\":false,\"type\":\"DATETIME\",\"unique\":false},\"f:oldCode\":{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":false,\"id\":\"fld:oldCode\",\"isSystem\":false,\"key\":\"oldCode\",\"label\":\"ป้าย oldCode\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":10,\"systemKey\":null,\"trackHistory\":false,\"type\":\"TEXT\",\"unique\":false},\"secDive\":{\"collapsed\":false,\"columns\":3,\"description\":\"ใบรับรองและประสบการณ์\",\"fields\":[],\"id\":\"sec:dive\",\"isSystem\":false,\"key\":\"dive\",\"label\":\"ดำน้ำ (ร้านตั้งเอง)\",\"sensitive\":false,\"sortOrder\":4},\"secHealth\":{\"collapsed\":false,\"columns\":1,\"description\":null,\"fields\":[],\"id\":\"sec:health\",\"isSystem\":false,\"key\":\"health\",\"label\":\"สุขภาพ\",\"sensitive\":true,\"sortOrder\":5},\"updBio\":{\"archivedAt\":null,\"customerEditable\":true,\"defaultValue\":null,\"description\":\"ประวัติ\",\"filterable\":false,\"id\":\"fld:bio\",\"isSystem\":false,\"key\":\"bio\",\"label\":\"ประวัติย่อ (แก้ป้าย)\",\"options\":{},\"required\":false,\"sectionId\":\"sec:dive\",\"sensitive\":false,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":7,\"systemKey\":null,\"trackHistory\":false,\"type\":\"LONG_TEXT\",\"unique\":false},\"updMedical\":{\"archivedAt\":null,\"customerEditable\":false,\"defaultValue\":null,\"description\":null,\"filterable\":true,\"id\":\"fld:medicalFile\",\"isSystem\":false,\"key\":\"medicalFile\",\"label\":\"ป้าย medicalFile\",\"options\":{},\"required\":false,\"sectionId\":\"sec:health\",\"sensitive\":true,\"showInList\":false,\"showOnCard\":false,\"sortOrder\":1,\"systemKey\":null,\"trackHistory\":false,\"type\":\"FILE\",\"unique\":false},\"updSec\":{\"collapsed\":true,\"columns\":3,\"description\":\"ใบรับรองและประสบการณ์\",\"fields\":[],\"id\":\"sec:dive\",\"isSystem\":false,\"key\":\"dive\",\"label\":\"ดำน้ำ (ร้านตั้งเอง)\",\"sensitive\":false,\"sortOrder\":4}}",
  "template": "{\"t1\":{\"added\":{\"fields\":12,\"sections\":0},\"created\":{\"fieldIds\":[\"fld:certAgency\",\"fld:certNo\",\"fld:diveCount\",\"fld:lastDiveAt\",\"fld:wetsuitSize\",\"fld:bootSize\",\"fld:insuranceNo\",\"fld:insuranceExpiresAt\",\"fld:instructorId\",\"fld:medicalCertFile\",\"fld:conditions\",\"fld:emergencyContact\"],\"sectionIds\":[]}},\"t2\":{\"added\":{\"fields\":0,\"sections\":0},\"created\":{\"fieldIds\":[],\"sectionIds\":[]}}}",
  "setReturns": "{\"w1\":{\"changed\":[\"certLevel\",\"logCount\",\"depositSatang\",\"lastDiveOn\",\"nextCheckAt\",\"interests\",\"hasGear\",\"bio\",\"favSpot\",\"buddyId\",\"allergy\",\"medicalFile\"]},\"w2\":{\"changed\":[\"certLevel\",\"logCount\",\"hasGear\",\"interests\",\"lastDiveOn\",\"favSpot\",\"nextCheckAt\"]},\"w3\":{\"changed\":[\"certLevel\",\"favSpot\",\"allergy\"]},\"w4\":{\"changed\":[\"addressProvince\",\"note\"]},\"w5\":{\"changed\":[\"addressProvince\",\"birthDate\",\"tags\"]},\"w6\":{\"changed\":[\"bio\"]},\"w7\":{\"changed\":[]}}",
  "cells": "{\"cells\":[\"{\\\"customerId\\\":\\\"cust:A\\\",\\\"fieldId\\\":\\\"fld:allergy\\\",\\\"updatedById\\\":\\\"user:owner\\\",\\\"valueBool\\\":null,\\\"valueDate\\\":null,\\\"valueFileId\\\":null,\\\"valueNumber\\\":null,\\\"valueOptions\\\":[],\\\"valueRef\\\":null,\\\"valueText\\\":\\\"กุ้ง, ถั่ว\\\"}\",\"{\\\"customerId\\\":\\\"cust:A\\\",\\\"fieldId\\\":\\\"fld:bio\\\",\\\"updatedById\\\":\\\"user:owner\\\",\\\"valueBool\\\":null,\\\"valueDate\\\":null,\\\"valueFileId\\\":null,\\\"valueNumber\\\":null,\\\"valueOptions\\\":[],\\\"valueRef\\\":null,\\\"valueText\\\":\\\"ชอบดำน้ำกลางคืน\\\"}\",\"{\\\"customerId\\\":\\\"cust:A\\\",\\\"fieldId\\\":\\\"fld:buddyId\\\",\\\"updatedById\\\":\\\"user:owner\\\",\\\"valueBool\\\":null,\\\"valueDate\\\":null,\\\"valueFileId\\\":null,\\\"valueNumber\\\":null,\\\"valueOptions\\\":[],\\\"valueRef\\\":\\\"cust:B\\\",\\\"valueText\\\":null}\",\"{\\\"customerId\\\":\\\"cust:A\\\",\\\"fieldId\\\":\\\"fld:certLevel\\\",\\\"updatedById\\\":\\\"user:owner\\\",\\\"valueBool\\\":null,\\\"valueDate\\\":null,\\\"valueFileId\\\":null,\\\"valueNumber\\\":null,\\\"valueOptions\\\":[\\\"RESCUE\\\"],\\\"valueRef\\\":null,\\\"valueText\\\":null}\",\"{\\\"customerId\\\":\\\"cust:A\\\",\\\"fieldId\\\":\\\"fld:depositSatang\\\",\\\"updatedById\\\":\\\"user:owner\\\",\\\"valueBool\\\":null,\\\"valueDate\\\":null,\\\"valueFileId\\\":null,\\\"valueNumber\\\":{\\\"d\\\":[1500,5000000],\\\"e\\\":3,\\\"s\\\":1},\\\"valueOptions\\\":[],\\\"valueRef\\\":null,\\\"valueText\\\":null}\",\"{\\\"customerId\\\":\\\"cust:A\\\",\\\"fieldId\\\":\\\"fld:hasGear\\\",\\\"updatedById\\\":\\\"user:owner\\\",\\\"valueBool\\\":true,\\\"valueDate\\\":null,\\\"valueFileId\\\":null,\\\"valueNumber\\\":null,\\\"valueOptions\\\":[],\\\"valueRef\\\":null,\\\"valueText\\\":null}\",\"{\\\"customerId\\\":\\\"cust:A\\\",\\\"fieldId\\\":\\\"fld:interests\\\",\\\"updatedById\\\":\\\"user:owner\\\",\\\"valueBool\\\":null,\\\"valueDate\\\":null,\\\"valueFileId\\\":null,\\\"valueNumber\\\":null,\\\"valueOptions\\\":[\\\"wreck\\\",\\\"reef\\\"],\\\"valueRef\\\":null,\\\"valueText\\\":null}\",\"{\\\"customerId\\\":\\\"cust:A\\\",\\\"fieldId\\\":\\\"fld:lastDiveOn\\\",\\\"updatedById\\\":\\\"user:owner\\\",\\\"valueBool\\\":null,\\\"valueDate\\\":\\\"2026-03-15T00:00:00.000Z\\\",\\\"valueFileId\\\":null,\\\"valueNumber\\\":null,\\\"valueOptions\\\":[],\\\"valueRef\\\":null,\\\"valueText\\\":null}\",\"{\\\"customerId\\\":\\\"cust:A\\\",\\\"fieldId\\\":\\\"fld:logCount\\\",\\\"updatedById\\\":\\\"user:owner\\\",\\\"valueBool\\\":null,\\\"valueDate\\\":null,\\\"valueFileId\\\":null,\\\"valueNumber\\\":{\\\"d\\\":[42],\\\"e\\\":1,\\\"s\\\":1},\\\"valueOptions\\\":[],\\\"valueRef\\\":null,\\\"valueText\\\":null}\",\"{\\\"customerId\\\":\\\"cust:A\\\",\\\"fieldId\\\":\\\"fld:medicalFile\\\",\\\"updatedById\\\":\\\"user:owner\\\",\\\"valueBool\\\":null,\\\"valueDate\\\":null,\\\"valueFileId\\\":\\\"file-qc-1\\\",\\\"valueNumber\\\":null,\\\"valueOptions\\\":[],\\\"valueRef\\\":null,\\\"valueText\\\":null}\",\"{\\\"customerId\\\":\\\"cust:A\\\",\\\"fieldId\\\":\\\"fld:nextCheckAt\\\",\\\"updatedById\\\":\\\"user:owner\\\",\\\"valueBool\\\":null,\\\"valueDate\\\":\\\"2026-04-01T02:30:00.000Z\\\",\\\"valueFileId\\\":null,\\\"valueNumber\\\":null,\\\"valueOptions\\\":[],\\\"valueRef\\\":null,\\\"valueText\\\":null}\",\"{\\\"customerId\\\":\\\"cust:B\\\",\\\"fieldId\\\":\\\"fld:bio\\\",\\\"updatedById\\\":\\\"user:owner\\\",\\\"valueBool\\\":null,\\\"valueDate\\\":null,\\\"valueFileId\\\":null,\\\"valueNumber\\\":null,\\\"valueOptions\\\":[],\\\"valueRef\\\":null,\\\"valueText\\\":\\\"ของลูกค้าเอง\\\"}\",\"{\\\"customerId\\\":\\\"cust:B\\\",\\\"fieldId\\\":\\\"fld:certLevel\\\",\\\"updatedById\\\":\\\"user:owner\\\",\\\"valueBool\\\":null,\\\"valueDate\\\":null,\\\"valueFileId\\\":null,\\\"valueNumber\\\":null,\\\"valueOptions\\\":[\\\"OW\\\"],\\\"valueRef\\\":null,\\\"valueText\\\":null}\",\"{\\\"customerId\\\":\\\"cust:B\\\",\\\"fieldId\\\":\\\"fld:favSpot\\\",\\\"updatedById\\\":\\\"user:owner\\\",\\\"valueBool\\\":null,\\\"valueDate\\\":null,\\\"valueFileId\\\":null,\\\"valueNumber\\\":null,\\\"valueOptions\\\":[],\\\"valueRef\\\":null,\\\"valueText\\\":\\\"Similan\\\"}\",\"{\\\"customerId\\\":\\\"cust:B\\\",\\\"fieldId\\\":\\\"fld:hasGear\\\",\\\"updatedById\\\":\\\"user:owner\\\",\\\"valueBool\\\":false,\\\"valueDate\\\":null,\\\"valueFileId\\\":null,\\\"valueNumber\\\":null,\\\"valueOptions\\\":[],\\\"valueRef\\\":null,\\\"valueText\\\":null}\",\"{\\\"customerId\\\":\\\"cust:B\\\",\\\"fieldId\\\":\\\"fld:interests\\\",\\\"updatedById\\\":\\\"user:owner\\\",\\\"valueBool\\\":null,\\\"valueDate\\\":null,\\\"valueFileId\\\":null,\\\"valueNumber\\\":null,\\\"valueOptions\\\":[\\\"reef\\\"],\\\"valueRef\\\":null,\\\"valueText\\\":null}\",\"{\\\"customerId\\\":\\\"cust:B\\\",\\\"fieldId\\\":\\\"fld:lastDiveOn\\\",\\\"updatedById\\\":\\\"user:owner\\\",\\\"valueBool\\\":null,\\\"valueDate\\\":\\\"2025-12-31T00:00:00.000Z\\\",\\\"valueFileId\\\":null,\\\"valueNumber\\\":null,\\\"valueOptions\\\":[],\\\"valueRef\\\":null,\\\"valueText\\\":null}\",\"{\\\"customerId\\\":\\\"cust:B\\\",\\\"fieldId\\\":\\\"fld:logCount\\\",\\\"updatedById\\\":\\\"user:owner\\\",\\\"valueBool\\\":null,\\\"valueDate\\\":null,\\\"valueFileId\\\":null,\\\"valueNumber\\\":{\\\"d\\\":[5],\\\"e\\\":0,\\\"s\\\":1},\\\"valueOptions\\\":[],\\\"valueRef\\\":null,\\\"valueText\\\":null}\",\"{\\\"customerId\\\":\\\"cust:B\\\",\\\"fieldId\\\":\\\"fld:nextCheckAt\\\",\\\"updatedById\\\":\\\"user:owner\\\",\\\"valueBool\\\":null,\\\"valueDate\\\":\\\"2026-05-01T00:00:00.000Z\\\",\\\"valueFileId\\\":null,\\\"valueNumber\\\":null,\\\"valueOptions\\\":[],\\\"valueRef\\\":null,\\\"valueText\\\":null}\"],\"sysCols\":{\"addresses\":[\"{\\\"customerId\\\":\\\"cust:A\\\",\\\"isDefault\\\":true,\\\"kind\\\":\\\"HOME\\\",\\\"line1\\\":\\\"1 ถนนทดสอบ\\\",\\\"province\\\":\\\"กระบี่\\\"}\",\"{\\\"customerId\\\":\\\"cust:C\\\",\\\"isDefault\\\":true,\\\"kind\\\":\\\"HOME\\\",\\\"line1\\\":\\\"\\\",\\\"province\\\":\\\"ตรัง\\\"}\"],\"customers\":[\"{\\\"birthDate\\\":\\\"1985-11-02T00:00:00.000Z\\\",\\\"email\\\":null,\\\"firstName\\\":\\\"สมหญิง\\\",\\\"gender\\\":\\\"FEMALE\\\",\\\"homeUnitId\\\":null,\\\"id\\\":\\\"cust:B\\\",\\\"lastName\\\":null,\\\"note\\\":null,\\\"phone\\\":\\\"0810000002\\\",\\\"tags\\\":[]}\",\"{\\\"birthDate\\\":\\\"1990-05-20T00:00:00.000Z\\\",\\\"email\\\":\\\"g1-a@example.test\\\",\\\"firstName\\\":\\\"สมชาย\\\",\\\"gender\\\":\\\"MALE\\\",\\\"homeUnitId\\\":\\\"unit:U\\\",\\\"id\\\":\\\"cust:A\\\",\\\"lastName\\\":\\\"ใจดี\\\",\\\"note\\\":\\\"ลูกค้าประจำ\\\",\\\"phone\\\":\\\"0810000001\\\",\\\"tags\\\":[\\\"vip\\\"]}\",\"{\\\"birthDate\\\":\\\"2000-01-31T00:00:00.000Z\\\",\\\"email\\\":null,\\\"firstName\\\":\\\"ทดสอบ\\\",\\\"gender\\\":null,\\\"homeUnitId\\\":null,\\\"id\\\":\\\"cust:C\\\",\\\"lastName\\\":null,\\\"note\\\":null,\\\"phone\\\":\\\"0810000003\\\",\\\"tags\\\":[]}\"]}}",
  "history": "[\"{\\\"changedById\\\":\\\"user:owner\\\",\\\"changedVia\\\":\\\"STAFF\\\",\\\"customerId\\\":\\\"cust:A\\\",\\\"fieldId\\\":\\\"fld:allergy\\\",\\\"newValue\\\":\\\"กุ้ง\\\",\\\"oldValue\\\":null}\",\"{\\\"changedById\\\":\\\"user:owner\\\",\\\"changedVia\\\":\\\"STAFF\\\",\\\"customerId\\\":\\\"cust:A\\\",\\\"fieldId\\\":\\\"fld:allergy\\\",\\\"newValue\\\":\\\"กุ้ง, ถั่ว\\\",\\\"oldValue\\\":\\\"กุ้ง\\\"}\",\"{\\\"changedById\\\":\\\"user:owner\\\",\\\"changedVia\\\":\\\"STAFF\\\",\\\"customerId\\\":\\\"cust:A\\\",\\\"fieldId\\\":\\\"fld:certLevel\\\",\\\"newValue\\\":\\\"AOW\\\",\\\"oldValue\\\":null}\",\"{\\\"changedById\\\":\\\"user:owner\\\",\\\"changedVia\\\":\\\"STAFF\\\",\\\"customerId\\\":\\\"cust:A\\\",\\\"fieldId\\\":\\\"fld:certLevel\\\",\\\"newValue\\\":\\\"RESCUE\\\",\\\"oldValue\\\":\\\"AOW\\\"}\",\"{\\\"changedById\\\":\\\"user:owner\\\",\\\"changedVia\\\":\\\"STAFF\\\",\\\"customerId\\\":\\\"cust:B\\\",\\\"fieldId\\\":\\\"fld:certLevel\\\",\\\"newValue\\\":\\\"OW\\\",\\\"oldValue\\\":null}\"]",
  "writeErrors": "{\"applyTemplate.unknown\":\"ไม่รู้จักเทมเพลตกิจการ \\\"no_such_template\\\" — เลือกได้ dive / clinic / dental / restaurant / fitness / hotel / retail / salon / tutoring / vet / carcare / travel / sportsclub / repair / realestate / b2b / general\",\"archiveField.system\":\"ฟิลด์ \\\"เบอร์โทร\\\" เป็นฟิลด์มาตรฐานของระบบ จึงเก็บเข้าคลังไม่ได้ — ปิดสวิตช์ \\\"แสดงในรายการ\\\" แทนได้\",\"createField.badKey\":\"ชื่ออ้างอิง (key) ของฟิลด์ใช้ได้เฉพาะ a–z, A–Z, 0–9 และ _ โดยขึ้นต้นด้วยตัวพิมพ์เล็ก ยาวไม่เกิน 40 ตัว — เช่น \\\"certLevel\\\"\",\"createField.badType\":\"ชนิดฟิลด์ \\\"COLOR\\\" ยังไม่มีในระบบ — เลือกได้ TEXT / LONG_TEXT / NUMBER / MONEY / DATE / DATETIME / SELECT / MULTI_SELECT / BOOLEAN / FILE / LOOKUP\",\"createField.dupKey\":\"มีฟิลด์ที่ใช้ชื่ออ้างอิง \\\"favSpot\\\" อยู่แล้วในระบบสมาชิกนี้ — ตั้งชื่ออ้างอิงอื่น\",\"createSection.dupKey\":\"มีส่วนที่ใช้ชื่ออ้างอิง \\\"dive\\\" อยู่แล้วในระบบสมาชิกนี้ — ตั้งชื่ออ้างอิงอื่น\",\"deleteSection.system\":\"ส่วน \\\"ข้อมูลพื้นฐาน\\\" เป็นส่วนมาตรฐานของระบบ ลบไม่ได้ — ซ่อนฟิลด์ที่ไม่ใช้แทนได้\",\"set.archived\":\"ฟิลด์ \\\"ป้าย oldCode\\\" ถูกเก็บเข้าคลังไว้ จึงบันทึกค่าใหม่ไม่ได้ — กู้คืนฟิลด์ก่อน\",\"set.atomic\":\"ค่าของฟิลด์ \\\"ป้าย logCount\\\" ต้องไม่น้อยกว่า 0\",\"set.bool\":\"ค่าของฟิลด์ \\\"ป้าย hasGear\\\" ต้องเป็นใช่/ไม่ใช่ (true หรือ false)\",\"set.customerSelf\":\"ฟิลด์ \\\"ป้าย certLevel\\\" ให้เจ้าหน้าที่ร้านเป็นผู้กรอก ลูกค้าจึงแก้เองไม่ได้\",\"set.dateInvalid\":\"ค่าของฟิลด์ \\\"ป้าย lastDiveOn\\\" ต้องเป็นวันที่รูปแบบ ปี-เดือน-วัน เช่น 2026-03-15\",\"set.datetime\":\"ค่าของฟิลด์ \\\"ป้าย nextCheckAt\\\" ต้องเป็นวันที่และเวลารูปแบบ ISO เช่น 2026-03-15T09:30:00+07:00\",\"set.decimals\":\"ค่าของฟิลด์ \\\"ป้าย logCount\\\" ต้องเป็นจำนวนเต็ม\",\"set.lookupMissing\":\"ไม่พบสมาชิกที่เลือกไว้ในฟิลด์ \\\"ป้าย buddyId\\\" ภายในร้านนี้ — เลือกใหม่จากรายการ\",\"set.maxLength\":\"ค่าของฟิลด์ \\\"ป้าย favSpot\\\" ยาว 31 ตัวอักษร เกินที่กำหนดไว้ 30 ตัวอักษร\",\"set.multiNotArray\":\"ค่าของฟิลด์ \\\"ป้าย interests\\\" ต้องเป็นรายการตัวเลือก (ส่งเป็น array แม้เลือกตัวเดียว)\",\"set.number\":\"ค่าของฟิลด์ \\\"ป้าย logCount\\\" ต้องเป็นตัวเลข\",\"set.required\":\"ฟิลด์ \\\"เบอร์โทร\\\" เป็นข้อมูลที่ต้องกรอก — ใส่ค่าก่อนบันทึก\",\"set.selectOption\":\"ค่า \\\"NOPE\\\" ไม่อยู่ในตัวเลือกของฟิลด์ \\\"ป้าย certLevel\\\" — เลือกได้ OW / AOW / RESCUE\",\"set.tagsNoChoice\":\"ค่า \\\"x\\\" ไม่อยู่ในตัวเลือกของฟิลด์ \\\"แท็ก\\\" — เลือกได้ \",\"set.uniqueTaken\":\"มีสมาชิกคนอื่นใช้ เบอร์โทร \\\"0810000001\\\" อยู่แล้ว — ตรวจว่าเป็นคนเดียวกันหรือไม่\",\"set.unknownCustomer\":\"ไม่พบสมาชิกคนนี้ในระบบสมาชิกนี้ — ตรวจว่าเปิดจากร้าน/ระบบเดียวกันหรือไม่\",\"set.unknownKey\":\"ไม่มีฟิลด์ชื่ออ้างอิง \\\"nope\\\" ในระบบสมาชิกนี้ — ตรวจการตั้งค่าฟิลด์อีกครั้ง\",\"set.via\":\"ที่มาของการบันทึก \\\"BOGUS\\\" ไม่อยู่ในรายการ — เลือกได้ SIGNUP_FORM / LIFF / STAFF / IMPORT / API / CUSTOMER_SELF\",\"updateField.systemType\":\"ฟิลด์ \\\"เบอร์โทร\\\" เป็นฟิลด์มาตรฐานของระบบ (ค่าอยู่ในข้อมูลลูกค้าโดยตรง) จึงเปลี่ยนชนิด/ชื่ออ้างอิง/ตัวเลือก/การห้ามซ้ำไม่ได้ — เปลี่ยนได้เฉพาะป้าย คำอธิบาย ลำดับ และสวิตช์การแสดงผล\"}",
};
// GOLDEN:END

// ═══════════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════════
try {
  await setupBase();
  await setupCrmRows();
  const probe = await probeObjectKey();
  console.log(`[P0] objectKey support: ${probe.supported ? "YES" : "NO"} — ${probe.why}`);
  if (CAPTURE) {
    if (probe.supported) throw new Error("--capture-golden refused: the engine already honours objectKey — the golden must stay frozen from the pre-C1.2a code");
    const fix = await g1Fixture();
    const snap = g1Snapshot(fix, await g1Reads(ctxM()));
    console.log("GOLDEN_TS_BEGIN");
    for (const [k, v] of Object.entries(snap)) console.log(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
    console.log("GOLDEN_TS_END");
  } else {
    chk("C1.2a-P0.1", "probe: listLayout honours ctx.objectKey (a company-objectKey section in the CRM system is NOT returned for objectKey \"contact\")", probe.supported, "supported", probe.why);

    // ── G1 golden ──
    console.log("\n── G1 golden (default objectKey = customer) ──");
    const fix = await g1Fixture();
    const snap = g1Snapshot(fix, await g1Reads(ctxM()));
    {
      const k = "layout";
      const tampered = snap[k].replace(/"label":"/, "\"label\":\"X");
      const naive = GOLDEN[k] !== undefined && tampered !== snap[k] && (tampered === GOLDEN[k]) === false;
      chk("C1.2a-G1.0", "[positive control] the comparator is not vacuous: a one-character change in a layout label is detected (and the golden is frozen)", naive && Object.keys(GOLDEN).length >= 12, "detects", `golden keys=${Object.keys(GOLDEN).length}`);
    }
    const G = (id: string, title: string, keys: string[], sev: Sev = "CRITICAL") => { const r = goldenEq(snap, keys); chk(id, title, r.ok, "byte-identical", r.detail, sev); };
    G("C1.2a-G1.1", "listLayout (staff · audience customer · includeArchived) byte-identical to the pre-C1.2a golden", ["layout"]);
    G("C1.2a-G1.2", "createSection/createField/updateField/archiveField/updateSection DTOs + applyTemplate(\"dive\") ×2 byte-identical", ["dto", "template"]);
    G("C1.2a-G1.3", "setFieldValues return values (7 writes incl. system columns, address creation, CUSTOMER_SELF, empty call) byte-identical", ["setReturns"]);
    G("C1.2a-G1.4", "stored MemberFieldValue cells + Customer/MemberAddress system columns byte-identical", ["cells"]);
    G("C1.2a-G1.5", "MemberFieldValueHistory rows (trackHistory fields) byte-identical", ["history"]);
    G("C1.2a-G1.6", "getFieldValues (3 customers + unknown id + duplicate) byte-identical — sensitive values still returned on the customer path without an actor", ["values"]);
    G("C1.2a-G1.7", "fieldFilterWhere where-fragments for 25 filters (all types, system + custom, combined, empty) byte-identical", ["filterWhere"]);
    G("C1.2a-G1.8", "the customers each of those 25 where-fragments actually selects — identical", ["filterRows"]);
    G("C1.2a-G1.9", "checkFieldValue (15 cases) + normalizeFieldOptions (6 cases) identical", ["checks"]);
    G("C1.2a-G1.10", "every Thai error message of the customer path (7 CRUD/template + 18 write + 6 filter refusals) identical", ["writeErrors", "readErrors"], "MAJOR");
    const ctxMx = { ...ctxM(), objectKey: "customer" };
    const snapX = g1Snapshot(null, await g1Reads(ctxMx));
    const noop = await attempt(() => F.setFieldValues(ctxMx, C.A, { certLevel: "RESCUE" }, { via: "STAFF" }));
    {
      const r = goldenEq(snapX, ["layout", "values", "filterWhere", "filterRows", "checks", "readErrors"]);
      chk("C1.2a-G1.11", "explicit ctx.objectKey \"customer\" gives exactly the golden reads, and an unchanged write returns changed []", r.ok && noop.ok && (noop.v?.changed ?? ["?"]).length === 0, "identical", `${r.detail} · noop ${show(noop)}`);
    }
    {
      const crv = await P.customRecordValue.count({ where: { tenantId: T } }) + await P.customRecordValueHistory.count({ where: { tenantId: T } });
      const nonCust = await P.memberSection.count({ where: { systemId: M, objectKey: { not: "customer" } } }) + await P.memberField.count({ where: { systemId: M, objectKey: { not: "customer" } } });
      chk("C1.2a-G1.12", "the customer path wrote nothing to CustomRecordValue/History and every MEMBER-system row it created has objectKey \"customer\"", crv === 0 && nonCust === 0, "0 · 0", `crm-value rows=${crv} · non-customer rows=${nonCust}`);
    }

    // ── new behaviour ──
    if (!probe.supported && !FORCE_NEW) {
      console.log(`\n── new-behaviour groups ⏭ SKIPPED — ${probe.why} ──`);
      for (const id of PLAN_NEW) { cks.push({ id, ok: false, sev: "SKIPPED" }); console.log(`  ⏭  [${id}] SKIPPED`); }
    } else {
      await group("S5", groupS5);
      await group("S1", groupS1);
      await group("S2", groupS2);
      await group("S3", groupS3);
      await group("S4", groupS4);
      await group("S7", groupS7);
      await group("S8", groupS8);
      await group("X1", groupX1);
      await group("X6", groupX6);
      await group("X8", groupX8);
      await group("X3", groupX3);
      await group("S6", groupS6);
      await group("R", groupR);
    }

    // ── G1 again, after the CRM rows/values exist in the same tenant ──
    {
      const post = g1Snapshot(null, await g1Reads(ctxM()));
      const r = goldenEq(post, ["layout", "values", "filterWhere", "filterRows", "checks", "readErrors"]);
      chk("C1.2a-G1.13", `golden reads are still identical at the end, with CRM sections/fields/values of ${probe.supported ? "every object" : "(plain CRM rows only — engine unsupported)"} living in the same tenant`, r.ok, "identical", r.detail);
    }
    if (probe.supported || FORCE_NEW) {
      const seen = new Set(cks.map((c) => c.id));
      const miss = [...PLAN_NEW, ...PLAN_G1].filter((id) => !seen.has(id));
      chk("C1.2a-META.1", "every planned check id received a verdict (no group died half-way silently)", miss.length === 0, "0 missing", miss.join(",") || "-");
    }
  }
} catch (e) {
  chk("C1.2a-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(`${errText(e)}\n${(e as Error)?.stack ?? ""}`, 800));
} finally {
  const ids = [T, TB].filter((x) => /^[a-z0-9]+$/i.test(x));
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* FK order — next pass */ } };
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[])
      .map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
    await del(() => P.user.deleteMany({ where: { id: { in: USERS } } }));
    try {
      const left: string[] = [];
      for (const t of tables) {
        const rows = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[];
        if (Number(rows?.[0]?.n ?? 0) > 0) left.push(`${t}=${rows[0].n}`);
      }
      const tenants = await P.tenant.count({ where: { id: { in: ids } } });
      const users = await P.user.count({ where: { id: { in: USERS } } });
      if (!CAPTURE) chk("C1.2a-CLEAN", "the QC database is given back as found — both throwaway tenants, every row with their tenantId and the users created here are gone", left.length === 0 && tenants === 0 && users === 0, "0 rows", `${left.join(" · ") || "-"} · tenants=${tenants} · users=${users}`, "MAJOR");
    } catch (e) {
      chk("C1.2a-CLEAN", "the QC database is given back as found", false, "0 rows", cut(errText(e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
const g1 = cks.filter((c) => /-G1\./.test(c.id));
const skippedIds = cks.filter((c) => c.sev === "SKIPPED").length;
console.log(`\n${passed === total ? "🟢" : "🔴"} C1.2a: ${passed}/${total} · G1 ${g1.filter((c) => c.ok).length}/${g1.length}${skippedIds ? ` · ${skippedIds} new-behaviour checks SKIPPED (engine ignores objectKey)` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings: findings.filter((f) => f.sev !== "SKIPPED"), skippedChecks: skippedIds, g1: { total: g1.length, passed: g1.filter((c) => c.ok).length } })}`);
process.exit(passed === total ? 0 : 1);
