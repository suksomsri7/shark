// HR H1.3 ▸ hr-seed-law-draft — ลงแถวกฎหมายเงินเดือน 4 แถว (สถานะ DRAFT) ใน HrLawTable จาก "ค่าที่เครื่องรุ่น 1 ใช้อยู่จริงวันนี้"
//
// ทำไม: ค่ากฎหมาย (ประกันสังคม · ขั้นภาษี · ค่าลดหย่อน · OT) วันนี้เป็นค่าคงที่ในโค้ด src/lib/modules/hr/payroll-rules.ts (FREEZE — ไม่แก้ ไม่ export ค่า)
//   H1.3 ย้าย "ตัวเลข" มาเป็นข้อมูลก่อน (ยังไม่มีใครอ่าน) · เครื่องรุ่น 2 (H3.3) จะอ่านแถวที่ ACTIVE เท่านั้น
//   🔴 สคริปต์นี้เขียน DRAFT อย่างเดียว · ไม่แก้แถวเดิม · ไม่ลบ · การเปิดใช้ (ACTIVE) = งานหลังบ้าน + ผู้รับรอง (H3.3 · HQ23)
//   MIN_WAGE ไม่มีแถว (โค้ดไม่มีค่าคงที่ — HQ25) · OT มีแค่ 1.5 เท่าวันทำงาน (2/3 เท่า = HQ10) · effectiveFrom = 1970-01-01 (ค่าที่ใช้มาตลอด)
//
// ใช้:
//   pnpm exec tsx scripts/hr-seed-law-draft.mts [--apply] [--key-prefix <p>]      (ค่าปริยาย prefix "v1" ⇒ sourceKey "v1:SSO" …)
//   (ไม่ใส่อะไร) = dry-run: ตรวจ 2 ชั้นกับค่าคงที่ · พิมพ์ 4 แถว + digest · อ่านฐานแล้วบอกว่าจะสร้าง/มีอยู่แล้ว/ไม่ตรง — ไม่เขียนอะไร
//   --apply      = ธุรกรรมเดียว: INSERT … ON CONFLICT ("sourceKey") DO NOTHING ต่อแถว → อ่านกลับ → ไม่ตรง = ย้อนทั้งก้อน
//                  บรรทัดผล: `created <n> · unchanged <n> · mismatched <n>` · รันซ้ำ = created 0 · unchanged 4
//   แถวเดิมที่ sourceKey เดียวกันแต่ค่าไม่ตรง ⇒ exit 1 + ข้อความไทย · ไม่เขียนอะไรเลย (ไม่สร้างแถวอื่นด้วย)
//
// env (ทางเดียวกับ hr-backfill-pin-hash.mts):
//   ค่าปริยาย: acc-v2-env.loadQcEnv() — ใต้ scripts/qc4.sh = QC4 · ด่าน prod ของ loadQcEnv ทำงานเสมอ
//   prod (runbook · ต้องได้ GO จากเจ้าของก่อน --apply): HR_SEED_LAW_PROD=1 HR_SEED_LAW_ENV_FILE=<ไฟล์ env ของ prod> pnpm exec tsx scripts/hr-seed-law-draft.mts [--apply]
//     มี DATABASE_URL ใน shell มาก่อน = หยุด exit 1 (ค่าใน shell จะชนะไฟล์เงียบ ๆ) · host production โดยไม่มี HR_SEED_LAW_PROD=1 = หยุด exit 3
//
// exports (import ไฟล์นี้ไม่รัน main — ข้อสอบ qc-hr-h1.3 import ใน process ลูก):
//   LAW_V1_ROWS · LAW_V1_DIGEST (sha256 ของ JSON เรียงกุญแจของ [kind, "YYYY-MM-DD", json] ×4 · ∞ = null) · verifyAgainstFrozen()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type LawKindV1 = "SSO" | "TAX_BRACKET" | "DEDUCTION" | "OT";
export type LawRowV1 = { kind: LawKindV1; effectiveFrom: string; json: Record<string, unknown> };

/** 4 แถว v1 — ตัวเลขจำนวนเต็มล้วน (สตางค์ + basis point) · ลำดับ SSO, TAX_BRACKET, DEDUCTION, OT */
export const LAW_V1_ROWS: readonly LawRowV1[] = [
  { kind: "SSO", effectiveFrom: "1970-01-01", json: { rateBp: 500, minBaseSatang: 165000, maxBaseSatang: 1500000, rounding: "BAHT_HALF_UP", employerEqualsEmployee: true } },
  {
    kind: "TAX_BRACKET",
    effectiveFrom: "1970-01-01",
    json: {
      bands: [
        { upToSatang: 15000000, rateBp: 0 },
        { upToSatang: 30000000, rateBp: 500 },
        { upToSatang: 50000000, rateBp: 1000 },
        { upToSatang: 75000000, rateBp: 1500 },
        { upToSatang: 100000000, rateBp: 2000 },
        { upToSatang: 200000000, rateBp: 2500 },
        { upToSatang: 500000000, rateBp: 3000 },
        { upToSatang: null, rateBp: 3500 },
      ],
      rounding: "SATANG_HALF_UP_ONCE",
    },
  },
  { kind: "DEDUCTION", effectiveFrom: "1970-01-01", json: { expenseRateBp: 5000, expenseCapSatang: 10000000, personalSatang: 6000000, spouseSatang: 6000000, childSatang: 3000000, ssoAllowanceCapSatang: 900000 } },
  { kind: "OT", effectiveFrom: "1970-01-01", json: { workdayMultiplierBp: 15000, daysPerMonth: 30, hoursPerDay: 8 } },
];

const SCRIPT = "hr-seed-law-draft";
const RULES_FILE = "src/lib/modules/hr/payroll-rules.ts";
const PROD_HOST_MARK = "ep-royal-night";
const NOTE = "ค่าจากเครื่องคิดเงินเดือนรุ่น 1 (payroll-rules.ts) — รอนักบัญชียืนยัน (HQ23) · วันเริ่มใช้จริงตั้งตอนเปิดใช้";

/** ค่า JSON แบบมาตรฐาน: กุญแจเรียงทุกชั้น · array คงลำดับ · ∞ → null */
export function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  if (v && typeof v === "object" && !(v instanceof Date)) return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Any)[k])]));
  return v;
}
const dayOf = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
/** digest มาตรฐานของแถวกฎหมาย (สัญญาข้อสอบ H1.3) */
export function lawDigest(rows: readonly { kind: string; effectiveFrom: unknown; json: unknown }[]): string {
  return sha(JSON.stringify(canon(rows.map((r) => [r.kind, dayOf(r.effectiveFrom), r.json]))));
}
export const LAW_V1_DIGEST: string = lawDigest(LAW_V1_ROWS);
const stable = (v: unknown) => JSON.stringify(canon(v));

// ═══════════════════ ชั้นที่ 1 (static): อ่านค่าคงที่จาก payroll-rules.ts ด้วย TS AST (ไม่ import ค่า — มันไม่ได้ export) ═══════════════════
async function rowsFromRulesAst(): Promise<{ rows: LawRowV1[] | null; note: string }> {
  const path = resolve(process.cwd(), RULES_FILE);
  if (!existsSync(path)) return { rows: null, note: `ไม่พบ ${RULES_FILE}` };
  const src = readFileSync(path, "utf8");
  const tsMod = (await import("typescript")) as Any;
  const ts = tsMod.default ?? tsMod;
  const sf = ts.createSourceFile(RULES_FILE, src, ts.ScriptTarget.Latest, true);
  const consts = new Map<string, Any>();
  const fns = new Map<string, Any>();
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) consts.set(d.name.text, d.initializer);
    if (ts.isFunctionDeclaration(st) && st.name) fns.set(st.name.text, st);
  }
  const num = (n: Any): number => {
    if (!n) return Number.NaN;
    if (ts.isNumericLiteral(n)) return Number(String(n.text).replace(/_/g, ""));
    if (ts.isParenthesizedExpression(n)) return num(n.expression);
    if (ts.isIdentifier(n)) return consts.has(n.text) ? num(consts.get(n.text)) : Number.NaN;
    if (ts.isPropertyAccessExpression(n) && n.getText(sf) === "Number.POSITIVE_INFINITY") return Number.POSITIVE_INFINITY;
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AsteriskToken) return num(n.left) * num(n.right);
    return Number.NaN;
  };
  /** `const x = a ?? <ค่าปริยาย>` ในตัวฟังก์ชัน */
  const qq = (fn: string, v: string): number => {
    let out = Number.NaN;
    const walk = (n: Any) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === v && n.initializer && ts.isBinaryExpression(n.initializer) && n.initializer.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) out = num(n.initializer.right);
      ts.forEachChild(n, walk);
    };
    if (fns.get(fn)) walk(fns.get(fn));
    return out;
  };
  const text = (fn: string) => (fns.get(fn) ? String(fns.get(fn).getText(sf)).replace(/\s+/g, " ") : "");
  const ssoTxt = text("ssoContribution");
  const bahtRound = /Math\.round\(rawSatang \/ BAHT\) \* BAHT/.test(ssoTxt) && /\(baseSatang \* rateBp\) \/ 10000/.test(ssoTxt);
  const emplEq = /employeeSatang: roundedSatang, employerSatang: roundedSatang/.test(ssoTxt);
  const bands: { upToSatang: number | null; rateBp: number }[] = [];
  const bn = consts.get("TAX_BANDS");
  if (bn && ts.isArrayLiteralExpression(bn)) {
    for (const el of bn.elements) {
      if (!ts.isObjectLiteralExpression(el)) continue;
      const get = (k: string) => el.properties.find((p: Any) => ts.isPropertyAssignment(p) && p.name.getText(sf) === k)?.initializer;
      const up = num(get("upToSatang"));
      bands.push({ upToSatang: Number.isFinite(up) ? up : null, rateBp: Math.round(num(get("ratePct")) * 100) });
    }
  }
  const taxTxt = text("annualTaxSatang");
  const taxOnce = /return Math\.round\(tax\); \}$/.test(taxTxt) && /tax \+= \(taxableInBand \* band\.ratePct\) \/ 100;/.test(taxTxt);
  // อัตราค่าใช้จ่าย = ตัวเลขไม่เต็มตัวเดียวที่คูณใน monthlyWhtSatang (วันนี้ = ครึ่งหนึ่ง)
  let expenseRate = Number.NaN;
  {
    const walk = (n: Any) => {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AsteriskToken) for (const s of [n.left, n.right]) if (ts.isNumericLiteral(s) && !Number.isInteger(Number(s.text))) expenseRate = Number(s.text);
      ts.forEachChild(n, walk);
    };
    if (fns.get("monthlyWhtSatang")) walk(fns.get("monthlyWhtSatang"));
  }
  const rows: LawRowV1[] = [
    { kind: "SSO", effectiveFrom: "1970-01-01", json: { rateBp: qq("ssoContribution", "rateBp"), minBaseSatang: qq("ssoContribution", "minBase"), maxBaseSatang: qq("ssoContribution", "maxBase"), rounding: bahtRound ? "BAHT_HALF_UP" : "?", employerEqualsEmployee: emplEq } },
    { kind: "TAX_BRACKET", effectiveFrom: "1970-01-01", json: { bands, rounding: taxOnce ? "SATANG_HALF_UP_ONCE" : "?" } },
    {
      kind: "DEDUCTION",
      effectiveFrom: "1970-01-01",
      json: {
        expenseRateBp: Math.round(expenseRate * 10000),
        expenseCapSatang: num(consts.get("EXPENSE_CAP_SATANG")),
        personalSatang: num(consts.get("PERSONAL_ALLOWANCE_SATANG")),
        spouseSatang: num(consts.get("SPOUSE_ALLOWANCE_SATANG")),
        childSatang: num(consts.get("CHILD_ALLOWANCE_SATANG")),
        ssoAllowanceCapSatang: num(consts.get("SSO_ALLOWANCE_CAP_SATANG")),
      },
    },
    { kind: "OT", effectiveFrom: "1970-01-01", json: { workdayMultiplierBp: Math.round(qq("otHourlyRateSatang", "mult") * 10000), daysPerMonth: qq("otHourlyRateSatang", "days"), hoursPerDay: qq("otHourlyRateSatang", "hours") } },
  ];
  return { rows, note: "ok" };
}

// ═══════════════════ ชั้นที่ 2 (behaviour): คิดจาก json แล้วเทียบกับฟังก์ชันจริงที่ FREEZE บนตารางค่าทดสอบ ═══════════════════
function evaluate(rows: readonly LawRowV1[]) {
  const j = (k: string) => rows.find((r) => r.kind === k)!.json as Any;
  const S = j("SSO");
  const T = j("TAX_BRACKET");
  const D = j("DEDUCTION");
  const O = j("OT");
  const sso = (sal: number) => {
    const base = Math.min(Math.max(sal, S.minBaseSatang), S.maxBaseSatang);
    const emp = S.rounding === "BAHT_HALF_UP" ? Math.round((base * S.rateBp) / 10000 / 100) * 100 : Number.NaN;
    return { baseSatang: base, employeeSatang: emp, employerSatang: S.employerEqualsEmployee ? emp : Number.NaN };
  };
  const tax = (net: number) => {
    if (net <= 0) return 0;
    let t = 0;
    let prev = 0;
    for (const b of T.bands as Any[]) {
      const up = b.upToSatang === null ? Number.POSITIVE_INFINITY : b.upToSatang;
      if (net <= prev) break;
      t += ((Math.min(net, up) - prev) * (b.rateBp / 100)) / 100;
      prev = up;
    }
    return T.rounding === "SATANG_HALF_UP_ONCE" ? Math.round(t) : Number.NaN;
  };
  const wht = (sal: number, ssoYear: number, spouse: boolean, children: number) => {
    const annual = sal * 12;
    const expense = Math.min((annual * D.expenseRateBp) / 10000, D.expenseCapSatang);
    const net = Math.max(0, annual - expense - D.personalSatang - (spouse ? D.spouseSatang : 0) - Math.max(0, children) * D.childSatang - Math.min(Math.max(0, ssoYear), D.ssoAllowanceCapSatang));
    return Math.max(0, Math.round(tax(net) / 12));
  };
  const ot = (sal: number) => (sal <= 0 || O.daysPerMonth <= 0 || O.hoursPerDay <= 0 ? 0 : Math.round((sal / O.daysPerMonth / O.hoursPerDay) * (O.workdayMultiplierBp / 10000)));
  return { sso, tax, wht, ot };
}

async function behaviour(rows: readonly LawRowV1[]): Promise<{ vectors: number; mismatches: number; first: string }> {
  const R = (await import("@/lib/modules/hr/payroll-rules" as string)) as Any;
  const ev = evaluate(rows);
  let vectors = 0;
  let mismatches = 0;
  let first = "";
  const cmp = (tag: string, frozen: unknown, fromJson: unknown) => {
    vectors++;
    if (stable(frozen) !== stable(fromJson)) {
      mismatches++;
      if (!first) first = `${tag}: frozen=${stable(frozen)} json=${stable(fromJson)}`;
    }
  };
  const ssoGrid = new Set<number>([0, 1, 164_999, 165_000, 165_001, 1_499_999, 1_500_000, 1_500_001, 9_999_999]);
  for (let s = 0; s <= 3_000_000; s += 1_111) ssoGrid.add(s);
  for (const s of ssoGrid) cmp(`sso(${s})`, R.ssoContribution(s), ev.sso(s));
  const taxGrid = new Set<number>([-1, 0, 1, 99_999_999_999]);
  for (const e of [15_000_000, 30_000_000, 50_000_000, 75_000_000, 100_000_000, 200_000_000, 500_000_000]) for (const d of [-1, 0, 1]) taxGrid.add(e + d);
  for (let t = 0; t <= 700_000_000; t += 1_300_007) taxGrid.add(t);
  for (const t of taxGrid) cmp(`tax(${t})`, R.annualTaxSatang(t), ev.tax(t));
  const sal = [0, 1, 999_999, 1_000_000, 1_250_000, 1_666_667, 2_083_333, 2_500_000, 3_000_000, 4_166_667, 5_000_001, 8_333_333, 12_500_000, 16_666_667, 25_000_000, 41_666_667];
  const ssoYear = [0, 450_000, 899_999, 900_000, 900_001, 1_200_000];
  for (const s of sal) for (const sp of [false, true]) for (let c = 0; c <= 4; c++) for (const y of ssoYear) cmp(`wht(${s},${y},${sp},${c})`, R.monthlyWhtSatang({ monthlySalarySatang: s, ssoEmployeeYearSatang: y, deductions: { spouse: sp, children: c } }), ev.wht(s, y, sp, c));
  for (let s = -100; s <= 6_000_000; s += 17_011) cmp(`ot(${s})`, R.otHourlyRateSatang(s), ev.ot(s));
  return { vectors, mismatches, first };
}

/** ตรวจ 2 ชั้นก่อนเขียนทุกครั้ง: (ก) AST ของ payroll-rules.ts = LAW_V1_ROWS (ข) คิดจาก json = ฟังก์ชันจริง บน ≥ 2,000 ค่า · 0 ต่าง */
export async function verifyAgainstFrozen(): Promise<{ ok: boolean; staticOk: boolean; vectors: number; mismatches: number; digest: string; note: string }> {
  const ast = await rowsFromRulesAst();
  const staticOk = !!ast.rows && stable(ast.rows) === stable(LAW_V1_ROWS);
  const b = await behaviour(LAW_V1_ROWS);
  const intOnly = JSON.stringify(LAW_V1_ROWS.map((r) => r.json)).match(/-?\d+(\.\d+)?(e[+-]?\d+)?/gi)?.every((x) => Number.isSafeInteger(Number(x))) ?? false;
  const ok = staticOk && intOnly && b.vectors >= 2000 && b.mismatches === 0;
  const note = !staticOk ? `AST ≠ LAW_V1_ROWS (${ast.note})` : !intOnly ? "มีตัวเลขไม่เต็มใน json" : b.mismatches ? b.first : "ok";
  return { ok, staticOk, vectors: b.vectors, mismatches: b.mismatches, digest: LAW_V1_DIGEST, note };
}

// ═══════════════════ main (เฉพาะเมื่อรันไฟล์นี้ตรง ๆ) ═══════════════════
async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  // HR H1.3 review F5 ▸ อาร์กิวเมนต์ผิด/ไม่รู้จัก = บอกวิธีใช้ + exit 2 ก่อนต่อฐานใด ๆ ◂
  const usage = (why: string) => {
    console.error(`❌ ${SCRIPT}: ${why}\n   วิธีใช้: pnpm exec tsx scripts/hr-seed-law-draft.mts [--apply] [--key-prefix <ชื่อ>]   (ชื่อ = ตัวอักษร/ตัวเลข/. _ - ไม่เกิน 80 ตัว · ปริยาย v1)`);
    return 2;
  };
  let APPLY = false;
  let PREFIX = "v1";
  let seenPrefix = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--apply") {
      if (APPLY) return usage("ใส่ --apply ซ้ำ");
      APPLY = true;
    } else if (a === "--key-prefix") {
      if (seenPrefix) return usage("ใส่ --key-prefix ซ้ำ");
      seenPrefix = true;
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("-") || !/^[A-Za-z0-9._-]{1,80}$/.test(v)) return usage("--key-prefix ต้องตามด้วยชื่อที่ถูกต้อง");
      PREFIX = v;
      i++;
    } else return usage(`ไม่รู้จัก ${a}`);
  }

  // 1) ตรวจกับค่าคงที่ก่อน (ไม่ต่อฐาน)
  const v = await verifyAgainstFrozen();
  console.log(`[${SCRIPT}] ตรวจกับ ${RULES_FILE}: AST=${v.staticOk ? "ตรง" : "ไม่ตรง"} · คิดจาก json ${v.vectors} ค่า ต่าง ${v.mismatches} · ${v.note}`);
  if (!v.ok) {
    console.error(`❌ ${SCRIPT}: ค่าในสคริปต์ไม่ตรงกับเครื่องคิดเงินเดือนรุ่น 1 — ไม่ได้เขียนอะไร (${v.note})`);
    return 1;
  }
  for (const r of LAW_V1_ROWS) console.log(`  ${`${PREFIX}:${r.kind}`.padEnd(24)} ${r.kind.padEnd(12)} ${r.effectiveFrom} DRAFT ${JSON.stringify(canon(r.json))}`);
  console.log(`  digest ${LAW_V1_DIGEST}`);

  // 2) env (เหมือน hr-backfill-pin-hash.mts)
  if (process.env.HR_SEED_LAW_PROD === "1") {
    const f = process.env.HR_SEED_LAW_ENV_FILE ?? "";
    if (!f) {
      console.error(`❌ ${SCRIPT}: HR_SEED_LAW_PROD=1 ต้องตั้ง HR_SEED_LAW_ENV_FILE=<ไฟล์ env ของ prod> ด้วย`);
      return 1;
    }
    if (process.env.DATABASE_URL !== undefined) {
      console.error(`❌ ${SCRIPT}: มี DATABASE_URL ตั้งไว้ใน shell อยู่แล้ว — ค่านี้จะชนะไฟล์ HR_SEED_LAW_ENV_FILE · unset แล้วรันใหม่ (ไม่ได้เขียนอะไร)`);
      return 1;
    }
    const p = resolve(process.cwd(), f);
    if (!existsSync(p)) {
      console.error(`❌ ${SCRIPT}: ไม่พบ HR_SEED_LAW_ENV_FILE`);
      return 1;
    }
    process.loadEnvFile(p);
    if (!process.env.DATABASE_URL) {
      console.error(`❌ ${SCRIPT}: ไฟล์ HR_SEED_LAW_ENV_FILE ไม่มี DATABASE_URL`);
      return 1;
    }
  } else {
    const { loadQcEnv } = (await import("./acc-v2-env.mts" as string)) as Any;
    loadQcEnv();
  }
  let host = "?";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    /* พิมพ์แค่ host */
  }
  console.log(`[${SCRIPT}] DB host = ${host} · โหมด ${APPLY ? "APPLY (เขียน)" : "dry-run (ไม่เขียน)"} · prefix ${PREFIX}`);
  if (host.includes(PROD_HOST_MARK) && process.env.HR_SEED_LAW_PROD !== "1") {
    console.error(`🔴 หยุด! host เป็น production (${PROD_HOST_MARK}) — ต้องตั้ง HR_SEED_LAW_PROD=1 ตาม runbook เท่านั้น`);
    return 3;
  }

  const { prisma } = (await import("@/lib/core/db")) as Any;
  const P = prisma as Any;
  const keys = LAW_V1_ROWS.map((r) => `${PREFIX}:${r.kind}`);
  type Db = { id: string; sourceKey: string; kind: string; effectiveFrom: string; json: unknown };
  const readRows = async (c: Any): Promise<Db[]> =>
    (await c.$queryRawUnsafe(`SELECT id, "sourceKey", kind::text AS kind, "effectiveFrom"::text AS "effectiveFrom", json FROM "HrLawTable" WHERE "sourceKey" = ANY($1::text[])`, keys)) as Db[];
  const compare = (rows: Db[]) => {
    const byKey = new Map(rows.map((r) => [r.sourceKey, r]));
    const missing: string[] = [];
    const same: string[] = [];
    const diff: string[] = [];
    for (const r of LAW_V1_ROWS) {
      const k = `${PREFIX}:${r.kind}`;
      const d = byKey.get(k);
      if (!d) missing.push(k);
      else if (d.kind === r.kind && dayOf(d.effectiveFrom) === r.effectiveFrom && stable(d.json) === stable(r.json)) same.push(k);
      else diff.push(k);
    }
    return { missing, same, diff };
  };
  const refuse = (diff: string[]) =>
    console.error(`❌ แถวกฎหมาย ${diff.join(", ")} ในฐานข้อมูลมีค่าไม่ตรงกับเครื่องคิดเงินเดือนรุ่น 1 — ไม่ได้เขียนอะไร (สคริปต์นี้ไม่แก้แถวเดิม · ให้ผู้ดูแลตรวจแถวนั้นก่อน)`);

  try {
    const pre = compare(await readRows(P));
    if (!APPLY) {
      console.log(`[${SCRIPT}] dry-run: จะสร้าง ${pre.missing.length} · มีอยู่แล้วตรงกัน ${pre.same.length} · ไม่ตรง ${pre.diff.length} — ไม่ได้เขียนอะไร`);
      if (pre.diff.length) {
        refuse(pre.diff);
        return 1;
      }
      return 0;
    }
    if (pre.diff.length) {
      console.log(`created 0 · unchanged ${pre.same.length} · mismatched ${pre.diff.length}`);
      refuse(pre.diff);
      return 1;
    }
    let created = 0;
    let post = pre;
    try {
      await P.$transaction(async (tx: Any) => {
        // รันซ้อนกัน 2 ตัว = ต่อคิวกัน
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, `hr-seed-law:${PREFIX}`);
        created = 0;
        for (const r of LAW_V1_ROWS) {
          const ins = (await tx.$queryRawUnsafe(
            `INSERT INTO "HrLawTable" ("id", "kind", "effectiveFrom", "json", "status", "sourceKey", "note")
             VALUES ($1, $2::"HrLawKind", $3::date, $4::jsonb, 'DRAFT'::"HrLawStatus", $5, $6)
             ON CONFLICT ("sourceKey") DO NOTHING RETURNING id`,
            `law${randomUUID().replace(/-/g, "")}`,
            r.kind,
            r.effectiveFrom,
            JSON.stringify(canon(r.json)),
            `${PREFIX}:${r.kind}`,
            NOTE,
          )) as Any[];
          created += ins.length;
        }
        post = compare(await readRows(tx));
        if (post.diff.length || post.missing.length) throw new Error("__H13_MISMATCH__");
      });
    } catch (e) {
      if (e instanceof Error && e.message === "__H13_MISMATCH__") {
        console.log(`created 0 · unchanged ${pre.same.length} · mismatched ${post.diff.length + post.missing.length}`);
        refuse([...post.diff, ...post.missing]);
        return 1;
      }
      throw e;
    }
    console.log(`created ${created} · unchanged ${LAW_V1_ROWS.length - created} · mismatched 0`);
    return 0;
  } finally {
    await P.$disconnect?.().catch?.(() => {});
  }
}

const invokedDirectly = (() => {
  try {
    return !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(`❌ ${SCRIPT}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
      process.exit(1);
    },
  );
}
