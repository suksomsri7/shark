// QC — HR V2 · H4.6 stock issued to / damaged by an employee → PENDING payroll deduction · brief ledger/hr-briefs/hr-brief-H4.6.md
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// Tenants qc-hr-h46-<stamp> · 2031 dates · opts.now injected · SKIP while hr/stock-charge.ts is absent (QC_FORCE=1 runs) · --list
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h4.6.mts
// Money = integer satang · every expectation below is a literal (brief R5) · base = baseRef("QC_H46_BASE") · statics vs base n/a once in base
// ORACLE-EDIT (controller 12 Nov · Q8 ruled OPTION 2 — no ALLOWANCE refund row, no new kind): S1.3 field refundAdjustmentId → refundOwedSatang ·
//   LIST_KEYS refundAdjustmentId → refund · S6.2 = (a) unbound APPROVED cancelled in place + (b) DRAFT-bound via cancelAdjustment · S6.3 = (c) APPROVED-run
//   ⇒ payroll untouched + refundOwedSatang + markStockRefundRepaid idempotent/permissioned · S6.6 = 3 parallel withdraws ⇒ exactly 1 CANCELLED, no refund row
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  type Any, type Def, type Sev, type Base, type Who, ROOT, rd, short, errText, textOf, srt, failedKeys, stripComments, sha, dk, dbDate, tagOf,
  PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, baseRef, pathInBase, changedVsBase, diffHunks, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf,
  vOf, importsOf, flat, jsonOf, testidsOf, loadOpt, modState, msgParity, tokensOnly, useServerFile,
} from "./qc-hr-lib.mjs";

const SUITE = "qc-hr-h4.6";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h46-";
const H = "src/lib/modules/hr/";
const MIG_DIR = "20270104000000_hr_stock_charge";
const F = {
  sc: `${H}stock-charge.ts`, acts: `${H}stock-charge-actions.ts`, ui: `${H}stock-charge-ui.tsx`, payUi: `${H}payroll-ui.tsx`, payroll: `${H}payroll.ts`, privacy: `${H}privacy.ts`,
  mig: `prisma/migrations/${MIG_DIR}/migration.sql`, schema: "prisma/schema/payroll.prisma", invSchema: "prisma/schema/inventory.prisma", scope: "src/lib/core/scope.ts",
  page: "src/app/app/sys/[id]/hr/payroll/page.tsx", consumers: "src/lib/outbox-consumers.ts", labels: "src/lib/automation/labels.ts", fitness: "scripts/fitness.mts",
  th: "src/messages/th/common.json", en: "src/messages/en/common.json", inv: "scripts/hr-ui-inventory.json",
};
const EV = "hr.stock_charge.requested";
const T: Record<string, string> = {
  noAccess: "คุณไม่มีสิทธิ์ดูหรือจัดการรายการหักเงินของพนักงานคนนี้",
  self: "ขอหักเงินของตัวเองไม่ได้ — ให้ผู้ดูแลคนอื่นทำแทน",
  ended: "พนักงานคนนี้สิ้นสุดการจ้างแล้ว — ขอหักเงินผ่านระบบนี้ไม่ได้",
  kind: "เลือกชนิด: เบิกของ หรือ ค่าเสียหาย",
  item: "ไม่พบสินค้านี้ในคลัง (หรือเป็นบริการ)",
  qty: "จำนวนต้องเป็นจำนวนเต็ม 1–999",
  amount: "ยอดหักต้องเป็นจำนวนเต็มสตางค์ ตั้งแต่ 0.01 ถึง 50,000 บาท",
  noCost: "สินค้านี้ยังไม่มีต้นทุน — ระบุยอดหักเอง",
  desc: "กรุณาใส่รายละเอียด (ไม่เกิน 120 ตัวอักษร)",
  consent: "ต้องมีหนังสือยินยอมของพนักงาน — ระบุเลขที่หรือที่เก็บเอกสาร และวันที่ลงนาม (ไม่เกินวันนี้)",
  key: "คำขอไม่สมบูรณ์ — กรุณาเปิดหน้านี้ใหม่แล้วลองอีกครั้ง",
  replayDiff: "คำขอนี้ถูกส่งไปแล้วด้วยข้อมูลอื่น — กรุณาเปิดหน้านี้ใหม่",
  invAccess: "คุณไม่มีสิทธิ์เบิกหรือตัดสต็อกในคลังนี้",
  noPeriod: "หางวดเงินเดือนที่ยังไม่มีรอบจ่ายไม่พบ — ตรวจรอบจ่ายเงินเดือน",
  withdrawn: "รายการนี้ถอนไปแล้ว",
  withdrawPerm: "ถอนรายการนี้ได้เฉพาะผู้ยื่นขณะยังรออนุมัติ หรือผู้อนุมัติรายการเงินเดือน",
  notify: "มีรายการหักค่าของหรือค่าเสียหายรอการอนุมัติ",
};
const DECIDE_OWN_REQ = "อนุมัติรายการที่ตัวเองยื่นไม่ได้ — ให้เจ้าของหรือผู้มีสิทธิ์อนุมัติแทน";
const DECIDE_OWN_ROW = "อนุมัติรายการของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นหรือเจ้าของร้านตัดสิน";
const LIST_KEYS = "amountSatang,consentAt,consentRef,createdAt,description,employeeId,employeeName,id,itemName,kind,movementId,overCap,periodKey,qty,refund,requestedByName,status,unitCostSatang"; // ORACLE-EDIT (Q8 option 2): refundAdjustmentId → refund
const SELF_KEYS = "amountSatang,consentAt,createdAt,description,id,itemName,kind,periodKey,qty,status";
const UI_IDS = ["form", "kind", "employee", "inventory", "item", "qty", "take", "amount", "desc", "consent", "consent-ref", "consent-at", "submit", "list"].map((s) => `hr-stock-${s}`);
const UI_DYN = ["hr-stock-row-*", "hr-stock-withdraw-*"];

// registry: id | group | sev C/M/m | base R/G | title
const SEV: Record<string, Sev> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS: readonly Def[] = `
S1.1|R1|M|R|[static] migration ${MIG_DIR}: CREATE TYPE HrStockChargeKind (ISSUE,DAMAGE) · CREATE TABLE · no ALTER TYPE/DROP
S1.2|R1|C|R|[static] CHECKs amount 1..5000000 · qty 1..999 · consentRef 1..80 · description ≤ 120 · uniques requestKey/adjustmentId/partial movementId · employee FK RESTRICT
S1.3|R1|M|R|[static] payroll.prisma model + enum · core/scope.ts HrStockCharge: sys()
S1.4|R1|C|R|[db] HrStockCharge table + columns on the lane DB
S2.1|R5|C|R|valid vectors: 25000 · 37035 · 4999995 · override 15050 (unit 12345) · manual 8900 · override 5000000 · no-take 50000
S2.2|R5|C|R|adjustment rows: DEDUCTION · PENDING · INVENTORY_ISSUE · sourceRef hrstock:<key> · 2031-06 · requestedById · runId null · charge row amount = adjustment amount
S2.3|R5|C|R|amount refusals (7×10^5×7 · override 0/12.5/5000001/-100 · manual w/o override) ⇒ amount text · cost 0 ⇒ noCost
S2.4|R4|M|R|qty refusals 0/-1/1.5/1000 ⇒ qty text
S2.5|R4|M|R|item/desc/kind/key refusals (service · other-tenant item · no item+no desc · desc 121 · kind LOAN · key "short")
S2.6|R5|C|R|refusals write nothing (adjustments · charges · movements · stock unchanged)
S2.7|R6|C|R|stock literals after S2: B 49 · A 15 · D 1001 · Z 4 · C 10 · 5 HR movements (OUT, qty literal)
S2.8|R5|C|R|Σ E1 PENDING INVENTORY_ISSUE deductions = 10135980
S3.1|R3|C|R|allowed: owner · manager-u1 (u1 emp) · STAFF request+consume · STAFF request-only with takeStock=false
S3.2|R3|C|R|STAFF request-only + takeStock ⇒ invAccess (no row, no stock)
S3.3|R3|C|R|noAccess identical bytes: mgr-u1→u2 emp · inventory-only · member · payroll-only · other tenant · unknown id · other-tenant inv system · non-INVENTORY system
S3.4|R3|C|R|own row ⇒ self (payroll staff linked to E3)
S3.5|R3|C|R|gate refusals write nothing · item B = 47 after gates
S4.1|R6|C|R|same key twice ⇒ same chargeId · replayed · 1 adjustment · 1 movement · stock once
S4.2|R6|C|R|same key, other qty ⇒ replayDiff · nothing changed
S4.3|R6|C|R|[race] 5 lanes same key ⇒ one charge/adjustment/movement · stock once
S4.4|R6|C|R|resume: inventory movement already written for the key ⇒ charge reuses it · stock once
S4.5|R6|M|R|two keys same input ⇒ two charges
S5.1|R6|C|R|Bangkok month: 2031-07-01 00:30 +07 ⇒ 2031-07
S5.2|R6|C|R|live runs skip: Aug APPROVED + Sep PAID ⇒ 2031-10 · Nov REVERSED ⇒ 2031-11 · Dec DRAFT ⇒ 2032-01
S5.3|R6|C|R|no INVENTORY_ISSUE row bound to a run · fake runs untouched
S6.1|R7|C|R|withdraw PENDING ⇒ REJECTED (decidedById) · withdrawnAt/ById · status WITHDRAWN · second ⇒ withdrawn text
S6.2|R7|C|R|withdraw APPROVED (a) unbound ⇒ CANCELLED in place (REJECTED · Σ approved 0) · (b) DRAFT-bound ⇒ CANCELLED via cancelAdjustment (row gone · Σ 0) · no ALLOWANCE row
S6.3|R7|C|R|withdraw APPROVED bound to APPROVED run ⇒ REFUND_OWED 5000000 · payroll rows/run untouched · mark repaid: perm · ref · ok · idempotent
S6.4|R7|C|R|withdraw rights: requester own PENDING ok · requester other's ⇒ withdrawPerm · manager w/o payroll ⇒ withdrawPerm · linked employee ⇒ self · member ⇒ noAccess
S6.5|R7|M|R|adjustment deleted on payroll page ⇒ status REMOVED · withdraw ⇒ NOOP
S6.6|R7|C|R|[race] 3 parallel withdraws of an APPROVED charge ⇒ exactly 1 CANCELLED · no refund row
S7.1|R3|C|R|nothing APPROVED without a decision (all charge rows PENDING after S2–S5)
S7.2|R3|C|R|decideAdjustment: requester ⇒ own-request text · linked employee ⇒ own-row text · payroll approver ⇒ APPROVED
S8.1|R8|C|R|list viewers: owner/payroll obj · manager w/o payroll · request staff · member · employee ⇒ null · other tenant sees none of T
S8.2|R8|C|R|list keys exactly (18) · status/period literal
S8.3|R8|C|R|branch scope: payroll viewer [u1] sees E1 charges, none of E2
S8.4|R8|C|R|myStockCharges: own rows only · keys exactly (10) · member ⇒ none
S8.5|R9|C|R|inventory movement: sourceModule HR · refType HrStockCharge · refId key · note null · no employee/amount
S8.6|R6|C|R|outbox: 1 event per charge · payload exactly {chargeId, employeeId} · key …#chargeId · systemId HR
S8.7|R6|C|R|audit hr.stock_charge.request: ids only (no amount, no consent ref)
S8.8|R8|M|R|overCap: 150000 false · 150001 true · 4999995 true · no profile null
S9.1|R4|C|R|ENDED / inactive employee ⇒ ended text · nothing written
S9.2|R4|M|R|PENDING charge stays PENDING after the employee ends
S10.1|R10|C|R|consumer registered · replay ×2 ⇒ 1 notification to the linked user · title notify · no amount/item
S10.2|R10|M|R|[static] labels: event once · consumer hunk marked
S11.1|R4|C|R|consent refusals (missing · unconfirmed · empty ref · 81 chars · tomorrow · bad date) ⇒ consent text · nothing written
S11.2|R4|C|R|consent recorded: ref · date · recordedBy = requester · 80-char ref accepted
S12.1|R2|C|R|[static] stock-charge imports inventory only via "@/lib/modules/inventory" · no raw prisma · tx client
S12.2|R2|M|R|[static] fitness ALLOWED_EDGES "hr→inventory" in one marked hunk
S12.3|R2|M|R|[static] outbox-consumers: one marked hunk · labels one hunk
S13.1|R11|M|R|[static] actions "use server": 2 wrappers · requireTenant · no now
S13.2|UI|M|R|[static] ui testids · tokens · 44 px · payroll page mounts · source chip
S13.3|UI|m|R|[static] inventory rows · hr.stock th=en
S14.1|frozen|C|G|[static] payroll-rules sha · payroll.ts/privacy.ts/inventory/**/inventory.prisma unchanged vs base
S14.2|frozen|C|G|[db] manual requestAdjustment ⇒ sourceType/sourceRef null · consumeBatch same key ⇒ same movement
Z1|house|C|G|no residue
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`H4.6-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, skipExit, finish } = makeRegistry(SUITE, "H4.6-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.sc))) skipReasons.push(`${F.sc} absent (H4.6 not built)`);
if (skipReasons.length && !FORCE) skipExit(skipReasons);
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
const BASE = baseRef("QC_H46_BASE");
const IN_BASE = pathInBase(F.sc, BASE);
const git = (a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }).trim();
const atBase = (p: string) => {
  try {
    return git(["show", `${BASE}:${p}`]);
  } catch {
    return "";
  }
};

// ═════════════════════════ statics ═════════════════════════
function runStatic(): void {
  const mig = rd(F.mig);
  {
    const dirs = readdirSync(join(ROOT, "prisma/migrations"));
    const r = {
      file: !!mig && dirs.includes(MIG_DIR),
      enum: /CREATE TYPE "HrStockChargeKind" AS ENUM \('ISSUE',\s*'DAMAGE'\)/.test(mig),
      table: /CREATE TABLE "HrStockCharge"/.test(mig),
      noAlter: !!mig && !/ALTER TYPE|DROP TABLE|DROP COLUMN|DROP TYPE/i.test(mig),
    };
    ck("S1.1", r, "folder · enum · table · additive");
  }
  {
    const r = {
      amount: /CHECK[\s\S]{0,60}"amountSatang"[\s\S]{0,40}5000000/.test(mig),
      qty: /CHECK[\s\S]{0,80}"qty"[\s\S]{0,40}999/.test(mig),
      consent: /CHECK[\s\S]{0,80}"consentRef"[\s\S]{0,40}80/.test(mig),
      desc: /CHECK[\s\S]{0,80}"description"[\s\S]{0,40}120/.test(mig),
      uKey: /CREATE UNIQUE INDEX[^;]*"HrStockCharge"[^;]*"tenantId",\s*"requestKey"/.test(mig),
      uAdj: /CREATE UNIQUE INDEX[^;]*"HrStockCharge"[^;]*\("adjustmentId"\)/.test(mig),
      uMov: /CREATE UNIQUE INDEX[^;]*"HrStockCharge"[^;]*"tenantId",\s*"movementId"\)\s*WHERE\s*\(?"movementId" IS NOT NULL/.test(mig),
      fk: /FOREIGN KEY \("employeeId"\) REFERENCES "HrEmployee"\("id"\) ON DELETE RESTRICT/.test(mig),
    };
    ck("S1.2", r, "CHECKs · uniques · FK RESTRICT");
  }
  {
    const s = rd(F.schema);
    const m = /model HrStockCharge \{([\s\S]*?)\n\}/.exec(s)?.[1] ?? "";
    const r = {
      model: !!m, enum: /enum HrStockChargeKind \{\s*ISSUE\s+DAMAGE\s*\}/.test(s),
      fields: ["requestKey", "adjustmentId", "amountSatang", "unitCostSatang", "movementId", "consentRef", "consentAt", "consentRecordedById", "withdrawnAt", "refundOwedSatang"] /* ORACLE-EDIT (Q8 option 2) */.every((f) => new RegExp(`\\n\\s*${f}\\s`).test(m)),
      scope: /\bHrStockCharge:\s*sys\(\)/.test(rd(F.scope)),
    };
    ck("S1.3", r, "model · enum · scope");
  }
  {
    const s = stripComments(rd(F.sc));
    const imps = importsOf(rd(F.sc));
    const inv = imps.filter((i) => i.spec.startsWith("@/lib/modules/inventory"));
    const r = {
      file: !!s,
      facade: inv.length > 0 && inv.every((i) => i.spec === "@/lib/modules/inventory"),
      noRaw: !!s && !/\bprisma\b/.test(s.replace(/@prisma\/client/g, "")),
      tx: /tenantDb\([^)]*\)\.\$transaction/.test(s),
      noInvTable: !/\binv(Movement|Item|LocationStock|Lot)\s*\./.test(s),
    };
    ck("S12.1", r, "facade only · tenantDb tx · no inv table", inv.map((i) => i.spec).join());
  }
  {
    const hunks = IN_BASE ? null : diffHunks(BASE, F.fitness);
    const r = IN_BASE
      ? { na: true }
      : { edge: /"hr→inventory"/.test(rd(F.fitness)), one: (hunks ?? []).length === 1, marked: (hunks ?? []).every((h) => h.added.some((l) => /HR H4\.6/.test(l)) && h.removed.length === 0) };
    ck("S12.2", r, "1 marked hunk", IN_BASE ? "n/a · H4.6 in base" : `${(hunks ?? []).length} hunks`);
  }
  {
    const hc = IN_BASE ? null : diffHunks(BASE, F.consumers);
    const hl = IN_BASE ? null : diffHunks(BASE, F.labels);
    const r = IN_BASE
      ? { na: true }
      : {
          cons: (hc ?? []).length === 1 && (hc ?? []).every((h) => h.removed.length === 0 && h.added.some((l) => /HR H4\.6/.test(l)) && h.added.some((l) => l.includes(EV))),
          labels: (hl ?? []).length === 1 && (hl ?? []).every((h) => h.removed.length === 0),
        };
    ck("S12.3", r, "1 + 1 hunk", IN_BASE ? "n/a · H4.6 in base" : `cons=${(hc ?? []).length} labels=${(hl ?? []).length}`);
    const lab = rd(F.labels).split(`"${EV}"`).length - 1;
    ck("S10.2", { label: lab === 1, consumer: new RegExp(`"${EV.replace(/\./g, "\\.")}"\\s*:`).test(rd(F.consumers)) }, "label once · consumer key", `labels=${lab}`);
  }
  {
    const a = rd(F.acts);
    const u = useServerFile(a, ["requestStockChargeAction", "withdrawStockChargeAction"], [/requireTenant\(/]);
    ck("S13.1", { file: !!a, ...u.r, noNow: !/\bnow\s*:/.test(stripComments(a)) }, "use server · 2 wrappers · requireTenant · no now", u.got.join());
  }
  {
    const s = rd(F.ui);
    const ids = testidsOf(s, "hr-stock-");
    const miss = [...UI_IDS, ...UI_DYN].filter((t) => !ids.has(t));
    const r = {
      file: !!s, ids: !miss.length, ...tokensOnly(stripComments(s)), h44: /min-h-\[44px\]|min-h-11\b|h-11\b/.test(s),
      page: /stock-charge-ui/.test(stripComments(rd(F.page))), chip: rd(F.payUi).includes("hr-pay-src-stock"),
    };
    ck("S13.2", r, "ids · tokens · 44 px · mounted · chip", miss.join());
    const rows = ((jsonOf(F.inv)?.rows ?? []) as Any[]).filter((x) => String(x.testid ?? "").startsWith("hr-stock-") || x.testid === "hr-pay-src-stock");
    const rowIds = new Set(rows.map((x) => String(x.testid)));
    const th = flat(jsonOf(F.th)?.hr?.stock ?? {});
    const en = flat(jsonOf(F.en)?.hr?.stock ?? {});
    ck("S13.3", { rows: [...UI_IDS, ...UI_DYN, "hr-pay-src-stock"].every((t) => rowIds.has(t)), meta: rows.length > 0 && rows.every((x) => x.wo === "H4.6" && x.oracle === "qc-hr-h4.6"), ...msgParity(th, en, []) }, "rows · th=en", `rows=${rows.length} th=${Object.keys(th).length}`);
  }
  {
    const files = [F.payroll, F.privacy, F.invSchema, "src/lib/modules/inventory"];
    const d = IN_BASE ? "n/a · H4.6 in base" : changedVsBase(BASE, files);
    const rules = sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA;
    ck("S14.1", { rules, unchanged: IN_BASE || d === "unchanged" }, "sha · unchanged", `${rules ? "sha ok" : "sha ✗"} · ${d}`);
  }
}

// ═════════════════════════ DB ═════════════════════════
type RO = { ok: boolean; text: string; value: Any };
async function callMod(Mo: Any, fn: string, args: unknown[]): Promise<RO> {
  const mo = Mo && !Mo.__err ? Mo : null;
  if (typeof mo?.[fn] !== "function") return { ok: false, text: `∅${fn} (${modState(Mo, F.sc)})`, value: undefined };
  try {
    const v = (await mo[fn](...args)) as Any;
    const ok = v !== null && v !== undefined && !(typeof v === "object" && v.ok === false);
    return { ok, text: ok ? "" : textOf(v), value: v };
  } catch (e) {
    return { ok: false, text: `THROW ${errText(e)}`, value: undefined };
  }
}
const shown = (r: RO) => (r.ok ? "ok" : `"${short(r.text, 50)}"`);
const keysOf = (o: Any) => (o && typeof o === "object" ? srt(Object.keys(o)) : "∅");

const { P, coreHash } = await qc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️ QC_FORCE=1 — running although: ${skipReasons.join(" · ")}`);
const SC = await loadOpt(F.sc, "@/lib/modules/hr/stock-charge");
console.log(`[${SUITE}] stock-charge=${modState(SC, F.sc)} · base=${BASE.slice(0, 9)}${IN_BASE ? " (H4.6 in base)" : ""}`);
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const pay = (await import("@/lib/modules/hr/payroll")) as Any;
const inv = (await import("@/lib/modules/inventory")) as Any;
const OC = (await import("@/lib/outbox-consumers")) as Any;
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const bkk = (day: string, hm = "10:00") => new Date(`${day}T${hm}:00+07:00`);
const DAY = "2031-06-10";
const NOW = bkk(DAY);
const CONSENT = { confirmed: true, ref: "ยินยอม-001", at: DAY };
let kn = 0;
const newKey = () => `qc46${tag}k${++kn}`;
const INV_TABLES = ["InvMovement", "InvLot", "InvLocationStock", "InvLocation", "InvItemImage", "InvItem", "InvCategory", "InvSettings"];

async function runDb(): Promise<void> {
  const T1 = await fx.newTenant("", `QC H4.6 ${tag}`);
  const T2 = await fx.newTenant("-b", `QC H4.6 อื่น ${tag}`);
  const u1 = await fx.newUnit(T1, `สาขาเหนือ ${tag}`, "u1");
  const u2 = await fx.newUnit(T1, `สาขาใต้ ${tag}`, "u2");
  const sH = (await sysSvc.createSystem(T1, "HR", `ทีม ${tag}`)).id as string;
  const sI = (await sysSvc.createSystem(T1, "INVENTORY", `คลัง ${tag}`)).id as string;
  const sH2 = (await sysSvc.createSystem(T2, "HR", `ทีมอื่น ${tag}`)).id as string;
  const sI2 = (await sysSvc.createSystem(T2, "INVENTORY", `คลังอื่น ${tag}`)).id as string;
  const cH = { tenantId: T1, systemId: sH };
  const cH2 = { tenantId: T2, systemId: sH2 };
  const cI = { tenantId: T1, systemId: sI };
  const W = {
    owner: await fx.mkUser(T1, "owner", `QC เจ้าของ ${tag}`, "OWNER", [], {}),
    mgrU1: await fx.mkUser(T1, "mgru1", `QC ผจก.เหนือ ${tag}`, "MANAGER", [u1], {}),
    payAll: await fx.mkUser(T1, "payall", `QC เงินเดือน ${tag}`, "STAFF", ["*"], { "hr.payroll.read": true, "hr.payadjust.approve": true }),
    payU1: await fx.mkUser(T1, "payu1", `QC เงินเดือนเหนือ ${tag}`, "STAFF", [u1], { "hr.payroll.read": true }),
    reqBoth: await fx.mkUser(T1, "reqboth", `QC ธุรการคลัง ${tag}`, "STAFF", [u1], { "hr.payadjust.request": true, "inventory.movement.consume": true }),
    reqHr: await fx.mkUser(T1, "reqhr", `QC ธุรการ ${tag}`, "STAFF", [u1], { "hr.payadjust.request": true }),
    invOnly: await fx.mkUser(T1, "invonly", `QC คลังล้วน ${tag}`, "STAFF", [u1], { "inventory.movement.consume": true }),
    member: await fx.mkUser(T1, "member", `QC สมาชิก ${tag}`, "STAFF", [], {}),
    emp1: await fx.mkUser(T1, "emp1", `QC พนักงานหนึ่ง ${tag}`, "STAFF", [], {}),
    paySelf: await fx.mkUser(T1, "payself", `QC เงินเดือนตัวเอง ${tag}`, "STAFF", ["*"], { "hr.payroll.read": true, "hr.payadjust.approve": true, "hr.payadjust.request": true }),
    other: await fx.mkUser(T2, "other", `QC ร้านอื่น ${tag}`, "OWNER", [], {}),
  };
  const E1 = await fx.mkEmp(T1, sH, `QC-H46 หนึ่ง ${tag}`, { unitId: u1, linkedUserId: W.emp1.id, startDate: "2030-01-01" });
  const E2 = await fx.mkEmp(T1, sH, `QC-H46 สอง ${tag}`, { unitId: u2, startDate: "2030-01-01" });
  const E3 = await fx.mkEmp(T1, sH, `QC-H46 สาม ${tag}`, { unitId: u1, linkedUserId: W.paySelf.id, startDate: "2030-01-01" });
  const E4 = await fx.mkEmp(T1, sH, `QC-H46 สี่ ${tag}`, { unitId: u1, startDate: "2030-01-01" });
  const EX = await fx.mkEmp(T1, sH, `QC-H46 ออกแล้ว ${tag}`, { unitId: u1, startDate: "2030-01-01", endDate: "2031-05-31", status: "ENDED", active: false });
  const EI = await fx.mkEmp(T1, sH, `QC-H46 ปิด ${tag}`, { unitId: u1, startDate: "2030-01-01", active: false });
  const EO = await fx.mkEmp(T2, sH2, `QC-H46 ร้านอื่น ${tag}`, { startDate: "2030-01-01" });
  await P.hrSalaryProfile.create({ data: { tenantId: T1, systemId: sH, employeeId: E1, baseSalarySatang: 1_500_000 } });
  const mkItem = async (tid: string, sid: string, sku: string, name: string, cost: number, onHand: number, kind = "PRODUCT") =>
    (await P.invItem.create({ data: { tenantId: tid, systemId: sid, sku: `${sku}-${tag}`, name: `${name} ${tag}`, costSatang: cost, onHand, kind } })).id as string;
  const I = {
    A: await mkItem(T1, sI, "A", "เสื้อพนักงาน", 12_345, 20),
    B: await mkItem(T1, sI, "B", "ผ้ากันเปื้อน", 25_000, 50),
    C: await mkItem(T1, sI, "C", "เครื่องชงกาแฟ", 714_286, 10),
    D: await mkItem(T1, sI, "D", "แก้ว", 5_005, 2000),
    Z: await mkItem(T1, sI, "Z", "ของแถม", 0, 5),
    S: await mkItem(T1, sI, "S", "ค่าบริการ", 10_000, 0, "SERVICE"),
    X: await mkItem(T2, sI2, "X", "ของร้านอื่น", 1_000, 10),
  };
  const onHand = async (id: string) => Number((await P.invItem.findUnique({ where: { id }, select: { onHand: true } }))?.onHand ?? -1);
  const adjs = (where: Any = {}) => P.hrPayAdjustment.findMany({ where: { tenantId: T1, sourceType: "INVENTORY_ISSUE", ...where }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const charges = async (): Promise<Any[]> => (await fx.rawRows(`SELECT * FROM "HrStockCharge" WHERE "tenantId" = $1 ORDER BY "createdAt"`, T1)) ?? [];
  const hrMoves = (where: Any = {}) => P.invMovement.findMany({ where: { tenantId: T1, refType: "HrStockCharge", ...where } }) as Promise<Any[]>;
  const snap = async () => `${(await adjs()).length}/${(await charges()).length}/${(await hrMoves()).length}/${(await Promise.all(Object.values(I).map(onHand))).join(":")}`;
  const input = (o: Any = {}) => ({ requestKey: newKey(), employeeId: E1, kind: "ISSUE", inventorySystemId: sI, consent: CONSENT, ...o });
  const req = (w: Who, inp: Any, now: Date = NOW, ctx: Any = cH) => callMod(SC, "requestStockCharge", [ctx, vOf(w), inp, { now }]);
  const wd = (w: Who, id: unknown, now: Date = NOW, ctx: Any = cH) => callMod(SC, "withdrawStockCharge", [ctx, vOf(w), id, { now }]);
  const list = (w: Who, f: Any = {}, ctx: Any = cH) => callMod(SC, "listStockCharges", [ctx, vOf(w), f]);
  const amt = (r: RO) => (r.ok ? Number(r.value?.amountSatang) : `✗${short(r.text, 40)}`);
  const is = (r: RO, t: string) => !r.ok && r.text === t;

  // ── S2 vectors (owner · E1) ──
  const v: Record<string, RO> = {};
  const vIn: Record<string, Any> = {
    v1: input({ itemId: I.B, qty: 1 }),
    v2: input({ itemId: I.A, qty: 3 }),
    v3: input({ itemId: I.D, qty: 999 }),
    v4: input({ itemId: I.A, qty: 2, amountSatang: 15_050 }),
    v5: input({ kind: "DAMAGE", inventorySystemId: undefined, description: "แก้วแตก", amountSatang: 8_900 }),
    v21: input({ kind: "DAMAGE", itemId: I.Z, qty: 1, amountSatang: 5_000_000 }),
    v22: input({ itemId: I.B, qty: 2, takeStock: false }),
  };
  for (const [k, i] of Object.entries(vIn)) v[k] = await req(W.owner, i);
  const WANT: Record<string, number> = { v1: 25_000, v2: 37_035, v3: 4_999_995, v4: 15_050, v5: 8_900, v21: 5_000_000, v22: 50_000 };
  {
    const got = Object.fromEntries(Object.keys(WANT).map((k) => [k, amt(v[k])]));
    const unit4 = (await charges()).find((c) => c.id === v.v4.value?.chargeId)?.unitCostSatang;
    ck("S2.1", { ...Object.fromEntries(Object.keys(WANT).map((k) => [k, got[k] === WANT[k]])), unit4: Number(unit4) === 12_345, move22: v.v22.ok && v.v22.value?.movementId === null }, "7 literals", short(got, 160));
  }
  {
    const rows = await adjs({ employeeId: E1 });
    const cs = await charges();
    const bad = Object.entries(vIn).filter(([k, i]) => {
      const a = rows.find((r) => r.id === v[k].value?.adjustmentId);
      const c = cs.find((x) => x.id === v[k].value?.chargeId);
      return !(a && a.kind === "DEDUCTION" && a.status === "PENDING" && a.sourceRef === `hrstock:${i.requestKey}` && a.periodKey === "2031-06" && a.requestedById === W.owner.id && a.runId === null && a.amountSatang === WANT[k] && c && Number(c.amountSatang) === WANT[k] && c.adjustmentId === a.id && v[k].value?.periodKey === "2031-06");
    });
    ck("S2.2", { rows: rows.length === 7, each: bad.length === 0 }, "7 rows as R6", `rows=${rows.length} bad=${bad.map(([k]) => k).join()}`);
  }
  const before2 = await snap();
  {
    const r = {
      c7: await req(W.owner, input({ itemId: I.C, qty: 7 })), o0: await req(W.owner, input({ itemId: I.A, qty: 1, amountSatang: 0 })),
      o125: await req(W.owner, input({ itemId: I.A, qty: 1, amountSatang: 12.5 })), oBig: await req(W.owner, input({ itemId: I.A, qty: 1, amountSatang: 5_000_001 })),
      oNeg: await req(W.owner, input({ itemId: I.A, qty: 1, amountSatang: -100 })), manual: await req(W.owner, input({ kind: "DAMAGE", description: "ไม่มียอด" })),
    };
    const z = await req(W.owner, input({ itemId: I.Z, qty: 2 }));
    ck("S2.3", { ...Object.fromEntries(Object.entries(r).map(([k, x]) => [k, is(x, T.amount)])), noCost: is(z, T.noCost) }, "amount ×6 · noCost", `${shown(r.c7)} ${shown(z)}`);
    const q = [0, -1, 1.5, 1000].map((n) => req(W.owner, input({ itemId: I.A, qty: n })));
    const qs = await Promise.all(q);
    ck("S2.4", Object.fromEntries(qs.map((x, i) => [`q${i}`, is(x, T.qty)])), "qty ×4", qs.map(shown).join(" "));
    const e = {
      svc: is(await req(W.owner, input({ itemId: I.S, qty: 1 })), T.item), other: is(await req(W.owner, input({ itemId: I.X, qty: 1 })), T.item),
      noDesc: is(await req(W.owner, input({ kind: "DAMAGE", amountSatang: 100 })), T.desc), long: is(await req(W.owner, input({ kind: "DAMAGE", description: "ก".repeat(121), amountSatang: 100 })), T.desc),
      kind: is(await req(W.owner, input({ kind: "LOAN", itemId: I.A, qty: 1 })), T.kind), key: is(await req(W.owner, input({ requestKey: "short", itemId: I.A, qty: 1 })), T.key),
    };
    ck("S2.5", e, "item ×2 · desc ×2 · kind · key");
    const after = await snap();
    ck("S2.6", { same: after === before2, built: !!v.v1.ok }, "unchanged", `${before2} → ${after}`);
  }
  {
    const st = { B: await onHand(I.B), A: await onHand(I.A), D: await onHand(I.D), Z: await onHand(I.Z), C: await onHand(I.C) };
    const mv = await hrMoves();
    const qtys = srt(mv.map((m) => `${m.type}${m.qtyDelta}`));
    ck("S2.7", { B: st.B === 49, A: st.A === 15, D: st.D === 1001, Z: st.Z === 4, C: st.C === 10, n: mv.length === 5, q: qtys === srt(["OUT-1", "OUT-3", "OUT-999", "OUT-2", "OUT-1"]) }, "49/15/1001/4/10 · 5 OUT", `${short(st, 80)} ${qtys}`);
    const sum = (await adjs({ employeeId: E1, status: "PENDING", kind: "DEDUCTION" })).reduce((s, a) => s + Number(a.amountSatang), 0);
    chk("S2.8", sum === 10_135_980, 10_135_980, sum);
  }

  // ── S3 gates ──
  const g1 = await req(W.mgrU1, input({ itemId: I.B, qty: 1 }));
  const g3 = await req(W.reqBoth, input({ itemId: I.B, qty: 1 }));
  const g5 = await req(W.reqHr, input({ itemId: I.B, qty: 1, takeStock: false }));
  const gO = await req(W.owner, input({ kind: "DAMAGE", description: "เก้าอี้หัก", amountSatang: 700, employeeId: E3 }));
  ck("S3.1", { owner: !!v.v1.ok && gO.ok, mgr: g1.ok, both: g3.ok, hrNoTake: g5.ok && amt(g5) === 25_000 }, "4 ok", [g1, g3, g5, gO].map(shown).join(" "));
  const before3 = await snap();
  const g4 = await req(W.reqHr, input({ itemId: I.B, qty: 1 }));
  chk("S3.2", is(g4, T.invAccess), T.invAccess, shown(g4));
  const na = {
    mgrU2: await req(W.mgrU1, input({ employeeId: E2, kind: "DAMAGE", description: "x", amountSatang: 100 })),
    invOnly: await req(W.invOnly, input({ itemId: I.B, qty: 1 })),
    member: await req(W.member, input({ kind: "DAMAGE", description: "x", amountSatang: 100 })),
    payOnly: await req(W.payAll, input({ kind: "DAMAGE", description: "x", amountSatang: 100 })),
    otherT: await req(W.other, input({ kind: "DAMAGE", description: "x", amountSatang: 100 }), NOW, cH2),
    unknown: await req(W.owner, input({ employeeId: `${E1}zz`, kind: "DAMAGE", description: "x", amountSatang: 100 })),
    invOther: await req(W.owner, input({ inventorySystemId: sI2, itemId: I.X, qty: 1 })),
    invNotInv: await req(W.owner, input({ inventorySystemId: sH, itemId: I.B, qty: 1 })),
  };
  ck("S3.3", Object.fromEntries(Object.entries(na).map(([k, x]) => [k, is(x, T.noAccess)])), "noAccess ×8 (same bytes)", Object.entries(na).filter(([, x]) => !is(x, T.noAccess)).map(([k, x]) => `${k}=${shown(x)}`).join(" "));
  const g11 = await req(W.paySelf, input({ employeeId: E3, kind: "DAMAGE", description: "x", amountSatang: 100 }));
  chk("S3.4", is(g11, T.self), T.self, shown(g11));
  {
    const after = await snap();
    ck("S3.5", { same: after === before3, B: (await onHand(I.B)) === 47 && !!g1.ok }, "unchanged · B 47", `${before3} → ${after}`);
  }
  const otherT2 = await req(W.other, { ...input({ employeeId: EO, kind: "DAMAGE", description: "x", amountSatang: 100 }) }, NOW, cH2);

  // ── S4 idempotency (E2 · item A) ──
  {
    const i1 = input({ employeeId: E2, itemId: I.A, qty: 1 });
    const a = await req(W.owner, i1);
    const b = await req(W.owner, i1);
    const ref = `hrstock:${i1.requestKey}`;
    const r = {
      same: a.ok && b.ok && a.value?.chargeId === b.value?.chargeId, replayed: a.value?.replayed === false && b.value?.replayed === true,
      adj: (await adjs({ sourceRef: ref })).length === 1, mv: (await hrMoves({ refId: i1.requestKey })).length === 1, A: (await onHand(I.A)) === 14,
    };
    ck("S4.1", r, "1 charge · stock once (A 14)", `${shown(a)} ${shown(b)}`);
    const before = await snap();
    const c = await req(W.owner, { ...i1, qty: 2 });
    ck("S4.2", { text: is(c, T.replayDiff), same: (await snap()) === before }, "replayDiff · unchanged", shown(c));
    const i3 = input({ employeeId: E2, itemId: I.A, qty: 1 });
    const rs = await Promise.all(Array.from({ length: 5 }, () => req(W.owner, i3)));
    const ids = new Set(rs.map((x) => x.value?.chargeId));
    ck("S4.3", { allOk: rs.every((x) => x.ok), one: ids.size === 1 && !ids.has(undefined), adj: (await adjs({ sourceRef: `hrstock:${i3.requestKey}` })).length === 1, mv: (await hrMoves({ refId: i3.requestKey })).length === 1, A: (await onHand(I.A)) === 13 }, "1 · A 13", rs.map(shown).join(" "));
    const i4 = input({ employeeId: E2, itemId: I.B, qty: 2 });
    let pre = "";
    try {
      pre = (await inv.consumeBatch(cI, { sourceModule: "HR", refType: "HrStockCharge", refId: i4.requestKey, parts: [{ itemId: I.B, qty: 2, idempotencyKey: `hr-stock:${sH}:${i4.requestKey}` }] })).movementIds?.[0] ?? "";
    } catch (e) {
      pre = `✗${errText(e)}`;
    }
    const d = await req(W.owner, i4);
    ck("S4.4", { ok: d.ok, reuse: !!pre && d.value?.movementId === pre, B: (await onHand(I.B)) === 45, mv: (await hrMoves({ refId: i4.requestKey })).length === 1 }, "reuse · B 45", `${shown(d)} pre=${short(pre, 30)}`);
    const k5 = { employeeId: E2, kind: "DAMAGE", description: "ซ้ำได้", amountSatang: 100 };
    const e1 = await req(W.owner, input(k5));
    const e2 = await req(W.owner, input(k5));
    ck("S4.5", { two: e1.ok && e2.ok && e1.value?.chargeId !== e2.value?.chargeId }, "2 charges", `${shown(e1)} ${shown(e2)}`);
  }

  // ── S5 period targeting (E2 manual) ──
  const run = async (period: string, status: string) =>
    (await P.hrPayrollRun.create({ data: { tenantId: T1, systemId: sH, periodKey: period, payDate: dbDate(`${period}-28`), status } })).id as string;
  const runs = { aug: await run("2031-08", "APPROVED"), sep: await run("2031-09", "PAID"), nov: await run("2031-11", "REVERSED"), dec: await run("2031-12", "DRAFT") };
  {
    const m = (now: Date) => req(W.owner, input({ employeeId: E2, kind: "DAMAGE", description: "งวด", amountSatang: 100 }), now);
    const p2 = await m(bkk("2031-07-01", "00:30"));
    chk("S5.1", p2.ok && p2.value?.periodKey === "2031-07", "2031-07", p2.ok ? p2.value?.periodKey : shown(p2));
    const p3 = await m(bkk("2031-08-15"));
    const p4 = await m(bkk("2031-11-15"));
    const p5 = await m(bkk("2031-12-15"));
    const got = [p3, p4, p5].map((x) => (x.ok ? x.value?.periodKey : shown(x)));
    ck("S5.2", { aug: got[0] === "2031-10", nov: got[1] === "2031-11", dec: got[2] === "2032-01" }, "2031-10 · 2031-11 · 2032-01", got.join(" "));
    const bound = (await adjs()).filter((a) => a.runId !== null);
    const rr = await P.hrPayrollRun.findMany({ where: { id: { in: Object.values(runs) } } });
    ck("S5.3", { none: bound.length === 0, built: p2.ok, runs: rr.length === 4 && rr.every((x: Any) => x.totalDeductSatang === 0 && x.totalNetSatang === 0) }, "0 bound · runs zero", `bound=${bound.length}`);
  }
  {
    const all = await adjs();
    chk("S7.1", all.length > 0 && all.every((a) => a.status === "PENDING"), "all PENDING", `${all.length} · ${srt(new Set(all.map((a) => a.status)))}`);
  }

  // ── S7 approval via the existing decideAdjustment ──
  const adjOf = (r: RO) => String(r.value?.adjustmentId ?? "∅");
  const dec = async (id: string, w: Who) => {
    try {
      return (await pay.decideAdjustment(cH, id, "APPROVED", { userId: w.id, isOwner: w.role === "OWNER" })) as Any;
    } catch (e) {
      return { ok: false, reason: `THROW ${errText(e)}` };
    }
  };
  {
    const a1 = await dec(adjOf(g3), W.reqBoth);
    const a2 = await dec(adjOf(gO), W.paySelf);
    const a3 = await dec(adjOf(v.v2), W.payAll);
    const st = (await list(W.owner)).value?.items?.find((x: Any) => x.id === v.v2.value?.chargeId)?.status;
    ck("S7.2", { own: a1?.reason === DECIDE_OWN_REQ, linked: a2?.reason === DECIDE_OWN_ROW, ok: a3?.ok === true && st === "APPROVED" }, "own-req · own-row · APPROVED", `${short(a1?.reason, 30)} | ${short(a2?.reason, 30)} | ${a3?.ok} ${st}`);
  }

  // ── S8 privacy / reads ──
  {
    const r = {
      owner: list(W.owner), pay: list(W.payAll), mgr: list(W.mgrU1), req: list(W.reqBoth), member: list(W.member), emp: list(W.emp1), other: list(W.other, {}, cH2),
    };
    const g = Object.fromEntries(await Promise.all(Object.entries(r).map(async ([k, p]) => [k, await p]))) as Record<string, RO>;
    const tIds = new Set((await charges()).map((c) => c.id));
    const otherItems = (g.other.value?.items ?? []) as Any[];
    ck("S8.1", {
      owner: g.owner.value?.items?.length === 20, pay: g.pay.value?.items?.length === g.owner.value?.items?.length,
      mgr: g.mgr.value === null, req: g.req.value === null, member: g.member.value === null, emp: g.emp.value === null,
      other: g.other.ok && otherItems.every((x) => !tIds.has(x.id)) && otherItems.length === (otherT2.ok ? 1 : 0),
    }, "2 obj · 4 null · other none", Object.entries(g).map(([k, x]) => `${k}=${x.value === null ? "null" : x.ok ? (x.value?.items?.length ?? "?") : shown(x)}`).join(" "));
    const items = (g.owner.value?.items ?? []) as Any[];
    const i2 = items.find((x) => x.id === v.v2.value?.chargeId);
    const i5 = items.find((x) => x.id === v.v5.value?.chargeId);
    ck("S8.2", {
      keys: items.length > 0 && items.every((x) => keysOf(x) === LIST_KEYS),
      v2: !!i2 && i2.amountSatang === 37_035 && i2.unitCostSatang === 12_345 && i2.qty === 3 && i2.periodKey === "2031-06" && i2.kind === "ISSUE" && i2.consentRef === CONSENT.ref && dk(i2.consentAt) === DAY,
      v5: !!i5 && i5.qty === null && i5.itemName === null && i5.description === "แก้วแตก" && i5.status === "PENDING" && i5.movementId === null,
    }, "18 keys · literals", items[0] ? keysOf(items[0]) : shown(g.owner));
    const u = (await list(W.payU1)).value?.items as Any[] | undefined;
    ck("S8.3", { e1: !!u && u.some((x) => x.employeeId === E1), noE2: !!u && !u.some((x) => x.employeeId === E2) }, "E1 only", u ? `${u.length}` : "∅");
    const mine = await callMod(SC, "myStockCharges", [{ tenantId: T1, userId: W.emp1.id }]);
    const mItems = (Array.isArray(mine.value) ? mine.value : mine.value?.items ?? []) as Any[];
    const e1Count = (await charges()).filter((c) => c.employeeId === E1).length;
    const mm = await callMod(SC, "myStockCharges", [{ tenantId: T1, userId: W.member.id }]);
    const mmItems = (Array.isArray(mm.value) ? mm.value : mm.value?.items ?? []) as Any[];
    ck("S8.4", { own: mItems.length === e1Count && e1Count > 0, keys: mItems.every((x) => keysOf(x) === SELF_KEYS), member: mine.ok && mmItems.length === 0 }, "own only · 10 keys", `${mItems.length}/${e1Count} ${mItems[0] ? keysOf(mItems[0]) : shown(mine)}`);
    const mv = (await hrMoves({ refId: vIn.v2.requestKey }))[0];
    const mvJson = JSON.stringify(mv ?? {});
    ck("S8.5", { one: !!mv, src: mv?.sourceModule === "HR" && mv?.refType === "HrStockCharge" && mv?.note === null && mv?.qtyDelta === -3, noPii: !!mv && ![E1, "หนึ่ง", "37035", W.owner.id].some((x) => mvJson.includes(x)), id: v.v2.value?.movementId === mv?.id }, "HR · no employee", short(mv ? { s: mv.sourceModule, t: mv.refType, n: mv.note } : "∅", 80));
    const evs = (await P.outboxEvent.findMany({ where: { tenantId: T1, type: EV } })) as Any[];
    const cs = await charges();
    ck("S8.6", {
      count: evs.length === cs.length && cs.length > 0,
      payload: evs.every((e) => keysOf(e.payload) === "chargeId,employeeId" && cs.some((c) => c.id === e.payload.chargeId && c.employeeId === e.payload.employeeId)),
      key: evs.every((e) => String(e.idempotencyKey).endsWith(`#${e.payload?.chargeId}`)), sys: evs.every((e) => e.systemId === sH),
    }, "1 per charge · ids only", `${evs.length}/${cs.length}`);
    const au = (await P.auditLog.findMany({ where: { tenantId: T1, action: "hr.stock_charge.request" } })) as Any[];
    const auJson = JSON.stringify(au.map((a) => [a.before, a.after, a.meta, a.metadata]));
    ck("S8.7", { some: au.length === cs.length && cs.length > 0, ids: au.every((a) => cs.some((c) => JSON.stringify(a).includes(c.id))), noAmount: !/37035|4999995|amountSatang/.test(auJson), noConsent: !auJson.includes(CONSENT.ref) }, "ids only", `${au.length}`);
    const c150 = await req(W.owner, input({ kind: "DAMAGE", description: "เพดาน", amountSatang: 150_000 }));
    const c151 = await req(W.owner, input({ kind: "DAMAGE", description: "เพดาน", amountSatang: 150_001 }));
    const it2 = ((await list(W.owner)).value?.items ?? []) as Any[];
    const oc = (r: RO) => it2.find((x) => x.id === r.value?.chargeId)?.overCap;
    const e2Row = it2.find((x) => x.employeeId === E2);
    ck("S8.8", { a: oc(c150) === false, b: oc(c151) === true, v3: oc(v.v3) === true, v2: oc(v.v2) === false, e2: !!e2Row && e2Row.overCap === null }, "false · true · true · false · null", `${oc(c150)} ${oc(c151)} ${oc(v.v3)} ${oc(v.v2)} ${e2Row?.overCap}`);
  }

  // ── S9 ENDED ──
  {
    const before = await snap();
    const x1 = await req(W.owner, input({ employeeId: EX, kind: "DAMAGE", description: "x", amountSatang: 100 }));
    const x2 = await req(W.owner, input({ employeeId: EI, kind: "DAMAGE", description: "x", amountSatang: 100 }));
    ck("S9.1", { ended: is(x1, T.ended), inactive: is(x2, T.ended), same: (await snap()) === before }, "ended ×2 · nothing", `${shown(x1)} ${shown(x2)}`);
    const y = await req(W.owner, input({ employeeId: E4, kind: "DAMAGE", description: "ก่อนออก", amountSatang: 500 }));
    await P.hrEmployee.update({ where: { id: E4 }, data: { active: false, employmentStatus: "ENDED", endDate: dbDate("2031-06-30") } });
    const st = ((await list(W.owner)).value?.items ?? []).find((x: Any) => x.id === y.value?.chargeId)?.status;
    const a = (await adjs({ employeeId: E4 }))[0];
    ck("S9.2", { ok: y.ok, list: st === "PENDING", adj: a?.status === "PENDING" }, "PENDING kept", `${shown(y)} ${st} ${a?.status}`);
  }

  // ── S11 consent ──
  {
    const before = await snap();
    const base = { kind: "DAMAGE", description: "ยินยอม", amountSatang: 100 };
    const c = {
      missing: await req(W.owner, input({ ...base, consent: undefined })), unconfirmed: await req(W.owner, input({ ...base, consent: { ...CONSENT, confirmed: false } })),
      empty: await req(W.owner, input({ ...base, consent: { ...CONSENT, ref: "" } })), long: await req(W.owner, input({ ...base, consent: { ...CONSENT, ref: "ก".repeat(81) } })),
      tomorrow: await req(W.owner, input({ ...base, consent: { ...CONSENT, at: "2031-06-11" } })), bad: await req(W.owner, input({ ...base, consent: { ...CONSENT, at: "2031-13-01" } })),
    };
    ck("S11.1", { ...Object.fromEntries(Object.entries(c).map(([k, x]) => [k, is(x, T.consent)])), same: (await snap()) === before }, "consent ×6 · nothing", Object.entries(c).filter(([, x]) => !is(x, T.consent)).map(([k, x]) => `${k}=${shown(x)}`).join(" "));
    const ok80 = await req(W.reqBoth, input({ ...base, consent: { ...CONSENT, ref: "ข".repeat(80) } }));
    const cs = await charges();
    const c2 = cs.find((x) => x.id === v.v2.value?.chargeId);
    const c80 = cs.find((x) => x.id === ok80.value?.chargeId);
    ck("S11.2", { v2: !!c2 && c2.consentRef === CONSENT.ref && dk(c2.consentAt) === DAY && c2.consentRecordedById === W.owner.id, r80: !!c80 && c80.consentRef === "ข".repeat(80) && c80.consentRecordedById === W.reqBoth.id }, "recorded", shown(ok80));
  }

  // ── S10 event replay ──
  {
    const cons = (OC.consumers ?? {}) as Record<string, Any>;
    const e = (await P.outboxEvent.findMany({ where: { tenantId: T1, type: EV } }) as Any[]).find((x) => x.payload?.chargeId === v.v2.value?.chargeId);
    if (e) for (let i = 0; i < 2; i++) await cons[EV]?.({ id: e.id, tenantId: e.tenantId, type: e.type, payload: e.payload, systemId: e.systemId, unitId: e.unitId }).catch((x: unknown) => console.log(`  ⚠ ${EV}: ${errText(x).slice(0, 80)}`));
    const ns = (await P.appNotification.findMany({ where: { recipientUserId: W.emp1.id } })) as Any[];
    const txt = JSON.stringify(ns.map((n) => [n.title, n.body]));
    ck("S10.1", { reg: typeof cons[EV] === "function", ev: !!e, one: ns.length === 1 && ns[0]?.title === T.notify, clean: !/37[,.]?035|370\.35|เสื้อพนักงาน/.test(txt) }, "1 · notify", `${ns.length} ${short(ns[0]?.title, 40)}`);
  }

  // ── S6 withdraw / reversal ──
  {
    const w1 = await wd(W.owner, v.v1.value?.chargeId);
    const a1 = (await adjs({ id: adjOf(v.v1) }))[0];
    const c1 = (await charges()).find((x) => x.id === v.v1.value?.chargeId);
    const s1 = ((await list(W.owner)).value?.items ?? []).find((x: Any) => x.id === v.v1.value?.chargeId)?.status;
    const w1b = await wd(W.owner, v.v1.value?.chargeId);
    ck("S6.1", { out: w1.ok && w1.value?.outcome === "REJECTED", adj: a1?.status === "REJECTED" && a1?.decidedById === W.owner.id, mark: !!c1?.withdrawnAt && c1?.withdrawnById === W.owner.id, list: s1 === "WITHDRAWN", again: is(w1b, T.withdrawn) }, "REJECTED · WITHDRAWN · once", `${shown(w1)} ${a1?.status} ${s1} ${shown(w1b)}`);
    // ORACLE-EDIT (Q8 option 2) ▸ (a) APPROVED, not bound to a run ⇒ cancelled in place · no income row
    const allowances = async () => (await P.hrPayAdjustment.findMany({ where: { tenantId: T1, kind: "ALLOWANCE" } })) as Any[];
    const approvedSum = async (key: string) => (await adjs({ sourceRef: `hrstock:${key}`, status: "APPROVED" })).reduce((s, a) => s + Number(a.amountSatang), 0);
    const statusIn = async (id: unknown) => ((await list(W.owner)).value?.items ?? []).find((x: Any) => x.id === id) as Any;
    const w2 = await wd(W.payAll, v.v2.value?.chargeId);
    const orig = (await adjs({ id: adjOf(v.v2) }))[0];
    const l2 = await statusIn(v.v2.value?.chargeId);
    const ra = {
      out: w2.ok && w2.value?.outcome === "CANCELLED" && w2.value?.refundOwedSatang === undefined,
      orig: orig?.status === "REJECTED" && orig?.decidedById === W.payAll.id && orig?.amountSatang === 37_035 && orig?.kind === "DEDUCTION" && orig?.runId === null,
      sum: (await approvedSum(vIn.v2.requestKey)) === 0, list: l2?.status === "CANCELLED" && l2?.refund === null,
    };
    // (b) APPROVED, bound to a DRAFT run ⇒ existing cancelAdjustment path (row deleted · draft recomputed)
    const kb = input({ employeeId: E2, kind: "DAMAGE", description: "รอบร่าง", amountSatang: 4_321 });
    const cb = await req(W.owner, kb, bkk("2033-02-10"));
    const db1 = await dec(adjOf(cb), W.payAll);
    const rDraft = await run("2033-02", "DRAFT");
    await P.hrPayAdjustment.updateMany({ where: { id: adjOf(cb), tenantId: T1 }, data: { runId: rDraft } });
    const wb = await wd(W.payAll, cb.value?.chargeId, bkk("2033-02-15"));
    const lb = await statusIn(cb.value?.chargeId);
    const rb = {
      setup: cb.ok && cb.value?.periodKey === "2033-02" && db1?.ok === true, out: wb.ok && wb.value?.outcome === "CANCELLED",
      gone: (await adjs({ id: adjOf(cb) })).length === 0, sum: (await approvedSum(kb.requestKey)) === 0,
      run: (await P.hrPayrollRun.findUnique({ where: { id: rDraft } }))?.status === "DRAFT", list: lb?.status === "CANCELLED",
    };
    const al = (await allowances()).length;
    ck("S6.2", { ...Object.fromEntries(Object.entries(ra).map(([k, x]) => [`a.${k}`, x])), ...Object.fromEntries(Object.entries(rb).map(([k, x]) => [`b.${k}`, x])), noAllowance: al === 0 }, "a CANCELLED in place · b CANCELLED via draft path · Σ 0 · no ALLOWANCE", `${shown(w2)} ${orig?.status} | ${shown(cb)} ${shown(wb)} | ALLOWANCE=${al}`);
    // (c) APPROVED, bound to an APPROVED run ⇒ payroll untouched · refund owed outside payroll · mark repaid
    const dr = await dec(adjOf(v.v21), W.payAll);
    const r32 = await run("2032-03", "APPROVED");
    await P.hrPayAdjustment.updateMany({ where: { id: adjOf(v.v21), tenantId: T1 }, data: { runId: r32 } });
    const runBefore = JSON.stringify(await P.hrPayrollRun.findUnique({ where: { id: r32 } }));
    const payBefore = JSON.stringify(await P.hrPayAdjustment.findMany({ where: { tenantId: T1 }, orderBy: { id: "asc" } }));
    const w3 = await wd(W.payAll, v.v21.value?.chargeId, bkk("2032-03-10"));
    const payAfter = JSON.stringify(await P.hrPayAdjustment.findMany({ where: { tenantId: T1 }, orderBy: { id: "asc" } }));
    const c3 = (await charges()).find((x) => x.id === v.v21.value?.chargeId);
    const l3 = await statusIn(v.v21.value?.chargeId);
    const mr = (w: Who, ref: string, now = bkk("2032-03-20")) => callMod(SC, "markStockRefundRepaid", [cH, vOf(w), v.v21.value?.chargeId, { ref }, { now }]);
    const mPerm = await mr(W.reqBoth, "โอนคืน-001");
    const mMem = await mr(W.member, "โอนคืน-001");
    const mEmpty = await mr(W.payAll, "");
    const mNotOwed = await callMod(SC, "markStockRefundRepaid", [cH, vOf(W.payAll), v.v3.value?.chargeId, { ref: "x" }, { now: bkk("2032-03-20") }]);
    const m1 = await mr(W.payAll, "โอนคืน-001");
    const m2 = await mr(W.payAll, "โอนคืน-002", bkk("2032-03-25"));
    const c3b = (await charges()).find((x) => x.id === v.v21.value?.chargeId);
    const l3b = await statusIn(v.v21.value?.chargeId);
    ck("S6.3", {
      dec: dr?.ok === true, out: w3.ok && w3.value?.outcome === "REFUND_OWED" && w3.value?.refundOwedSatang === 5_000_000,
      payroll: payAfter === payBefore, run: JSON.stringify(await P.hrPayrollRun.findUnique({ where: { id: r32 } })) === runBefore,
      owed: Number(c3?.refundOwedSatang) === 5_000_000 && c3?.withdrawnById === W.payAll.id && l3?.status === "REFUND_OWED" && l3?.refund?.owedSatang === 5_000_000,
      perm: is(mPerm, "บันทึกการคืนเงินได้เฉพาะเจ้าของร้านหรือผู้อนุมัติรายการเงินเดือน") && is(mMem, T.noAccess) && is(mNotOwed, "รายการนี้ไม่มียอดค้างคืน"),
      ref: is(mEmpty, "ระบุเลขที่หรือหลักฐานการคืนเงิน (1–80 ตัวอักษร)"),
      repaid: m1.ok && m1.value?.replayed === false && m2.ok && m2.value?.replayed === true && m2.value?.repaidAt === m1.value?.repaidAt,
      row: c3b?.repaidById === W.payAll.id && c3b?.repaidRef === "โอนคืน-001" && l3b?.status === "REPAID", noAllowance: (await allowances()).length === 0,
    }, "REFUND_OWED · payroll untouched · repaid once", `${shown(w3)} ${l3?.status} ${shown(mPerm)} ${shown(m1)} ${shown(m2)}`);
    const own = await wd(W.reqBoth, g3.value?.chargeId);
    const others = await wd(W.reqBoth, v.v3.value?.chargeId);
    const mgr = await wd(W.mgrU1, v.v3.value?.chargeId);
    const self = await wd(W.paySelf, gO.value?.chargeId);
    const mem = await wd(W.member, v.v3.value?.chargeId);
    ck("S6.4", { own: own.ok && own.value?.outcome === "REJECTED", others: is(others, T.withdrawPerm), mgr: is(mgr, T.withdrawPerm), self: is(self, T.self), member: is(mem, T.noAccess) }, "ok · perm · perm · self · noAccess", [own, others, mgr, self, mem].map(shown).join(" "));
    let del: Any = null;
    try {
      del = await pay.cancelAdjustment(cH, adjOf(v.v5), { userId: W.owner.id, isOwner: true });
    } catch (e) {
      del = { ok: false, reason: errText(e) };
    }
    const s5 = ((await list(W.owner)).value?.items ?? []).find((x: Any) => x.id === v.v5.value?.chargeId)?.status;
    const w5 = await wd(W.owner, v.v5.value?.chargeId);
    ck("S6.5", { del: del?.ok === true && !!v.v5.ok, removed: s5 === "REMOVED", noop: w5.ok && w5.value?.outcome === "NOOP" }, "REMOVED · NOOP", `${del?.ok} ${s5} ${shown(w5)}`);
    const d4 = await dec(adjOf(v.v4), W.payAll);
    const ws = await Promise.all([0, 1, 2].map(() => wd(W.payAll, v.v4.value?.chargeId)));
    const n4 = (await adjs({ sourceRef: `hrstock:${vIn.v4.requestKey}#refund` })).length;
    const a4 = (await adjs({ id: adjOf(v.v4) }))[0];
    // ORACLE-EDIT (Q8 option 2): exactly one CANCELLED (in place) · no refund row · no ALLOWANCE
    ck("S6.6", { dec: d4?.ok === true, one: ws.filter((x) => x.ok && x.value?.outcome === "CANCELLED").length === 1, rest: ws.filter((x) => is(x, T.withdrawn)).length === 2, rows: n4 === 0, adj: a4?.status === "REJECTED", noAllowance: (await P.hrPayAdjustment.count({ where: { tenantId: T1, kind: "ALLOWANCE" } })) === 0 }, "1 CANCELLED · 0 refund rows", `${ws.map(shown).join(" ")} rows=${n4} adj=${a4?.status}`);
  }

  // ── S14.2 controls (base behaviour) ──
  {
    let man: Any = null;
    try {
      man = await pay.requestAdjustment(cH, { employeeId: E2, periodKey: "2033-01", kind: "BONUS", amountSatang: 1_000, requestedById: W.owner.id });
    } catch (e) {
      man = { ok: false, reason: errText(e) };
    }
    const row = man?.id ? await P.hrPayAdjustment.findUnique({ where: { id: man.id } }) : null;
    let m1 = "", m2 = "";
    try {
      const k = `qc46-ctl-${tag}`;
      m1 = (await inv.consumeBatch(cI, { sourceModule: "QC", parts: [{ itemId: I.D, qty: 1, idempotencyKey: k }] })).movementIds?.[0] ?? "";
      m2 = (await inv.consumeBatch(cI, { sourceModule: "QC", parts: [{ itemId: I.D, qty: 1, idempotencyKey: k }] })).movementIds?.[0] ?? "";
    } catch (e) {
      m2 = `✗${errText(e)}`;
    }
    ck("S14.2", { manual: man?.ok === true && !!row && row.sourceType === null && row.sourceRef === null, inv: !!m1 && m1 === m2 }, "null source · same movement", `${short(man, 60)} ${m1 === m2}`);
  }
}

// ═════════════════════════ run ═════════════════════════
let crashed = "";
try {
  runStatic();
  {
    const cols = ((await P.$queryRawUnsafe(`SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'HrStockCharge'`).catch(() => [])) as Any[]);
    const c = Object.fromEntries(cols.map((x: Any) => [x.column_name, `${x.data_type}:${x.udt_name}`]));
    const need = { amountSatang: /^integer/, qty: /^integer/, unitCostSatang: /^integer/, consentAt: /^date/, kind: /HrStockChargeKind/, requestKey: /^text/, adjustmentId: /^text/, movementId: /^text/, consentRef: /^text/ };
    ck("S1.4", Object.fromEntries(Object.entries(need).map(([k, re]) => [k, re.test(c[k] ?? "")])), "columns", cols.length ? `${cols.length} cols` : "∅ table");
  }
  await runDb();
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  for (const tid of fx.tenants) {
    await P.$executeRawUnsafe(`DELETE FROM "HrStockCharge" WHERE "tenantId" = $1`, tid).catch(() => null);
    for (const t of INV_TABLES) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => null);
  }
  await cleanupFx(P, fx, SLUG);
  const left = await residueOf(P, fx, SLUG, SLUG_PREFIX);
  for (const tid of fx.tenants)
    for (const t of ["HrStockCharge", ...INV_TABLES, "AccountJournalEntry"]) {
      const r = await fx.rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid);
      if (r && Number(r[0]?.n) !== 0) left.push(`${t}=${r[0]?.n}`);
    }
  chk("Z1", left.length === 0, "none", left.join() || "clean");
}
process.exit(finish({ forced: FORCE, crashed, missing: skipReasons }));
