// fitness-hr.mts — ด่าน fitness ของ RUN HR V2 (F16.1–F16.5 · ใบ H0.4 · HR-V2-MASTER-PLAN §6)
//
// รันเดี่ยว: `pnpm exec tsx scripts/fitness-hr.mts` (หรือ `pnpm fitness:hr`) — exit 1 เมื่อมีด่าน CRITICAL/MAJOR แดง
// ผู้คุมงานจะต่อเข้ากับ `scripts/fitness.mts` ตอนตัด rc ผ่าน `runHrFitness(chk, ROOT)` (ใบนี้ห้ามแก้ fitness.mts)
//
//   F16.1 ไฟล์ "use client" ใต้ src/lib/modules/hr/** · src/app/app/sys/[id]/payroll/** และ src/app/app/**/hr/**
//         ห้ามแตะชื่อช่องอ่อนไหว (pinCode · pinHash · nationalId · bankAccountNo · ssoNumber · houseRegAddress) —
//         ตรวจทั้ง import (ชื่อ · type ที่ประกาศช่องเหล่านี้ · type ของโมเดล Prisma ที่มีช่องเหล่านี้ · `import [type] * as X`
//         แล้วอ้าง `X.T` แบบ QualifiedName · `Prisma.HrEmployee…` ) และการอ่านช่อง (`x.f` · `x["f"]` · `{ f } =`)
//         ยกเว้นช่องที่ DTO ใน privacy-shared.ts ประกาศไว้ และไฟล์นั้น import DTO นั้นจริง —
//         🔴 pinCode/pinHash **ไม่เคย** ผ่านข้อยกเว้นนี้ และถ้า privacy-shared.ts เองมีชื่อทั้งสองใน AST = แดง
//         ขีดจำกัด (heuristic — ยอมรับเป็นหนี้ตามมติผู้คุมงาน H0.4 r2): ไม่จับการรั่วทั้งก้อน (`JSON.stringify(e)` · spread `{...e}` ·
//         `Object.values(e)` / `Object.entries(e)`) และตาม import ลึกแค่ชั้นเดียว (type ที่ re-export ต่อกันไม่ถูกตาม) —
//         ด่านจริงคือข้อสอบความเป็นส่วนตัว (`qc-hf-hr-privacy`) ที่ดูไบต์ที่ส่งถึงเบราว์เซอร์ ด่านนี้เป็นตาข่ายชั้นแรกเท่านั้น
//   F16.2 `src/lib/modules/hr/payroll-rules.ts` ไบต์ตรงเดิม (sha256 ทั้งไฟล์ = PAYROLL_RULES_SHA256) — FREEZE
//   F16.3 ทุก page.tsx ใต้ src/app/** ที่ path มีส่วน `hr` · `payroll` · `kiosk` (ตัด route group `(…)` ออกก่อน)
//         import ตัวกันสิทธิ์ในรายการ (hr/privacy: `load*ForViewer` · `leaveItemsForViewer` · `require*` · `assert*` ·
//         hr/scope: ทุก export เมื่อไฟล์มีจริง) และเรียกใช้จริง — หรืออยู่ใน PAGE_GUARD_BASELINE ·
//         `hrViewerOf()` อย่างเดียว **ไม่ใช่** ตัวกัน (แค่สร้างผู้ดู ไม่ได้ปฏิเสธใคร)
//   F16.4 คีย์ใต้ `hr` ใน src/messages/th และ en ตรงกันเป๊ะ · ไม่ว่าง · ค่าไทยไม่ใช่ชื่อคีย์ตัวใหญ่ (^[A-Z_]+$)
//   F16.5 (เปิดเมื่อมี src/lib/modules/hr/pin.ts — ใบ H0.5) ห้ามแตะ pinCode นอก hr/pin.ts + scripts/hr-backfill-pin-hash.mts
//         (ไม่สแกน scripts/qc-*.mts — ข้อสอบต้องอ่านคอลัมน์ได้ แต่ห้ามพิมพ์ค่าออกจอเด็ดขาด)
//
// ratchet (กลไกเดียวกับ F14): ทุก BASELINE ลดได้อย่างเดียว — ปิดหนี้แล้วแต่ไม่ถอดแถว = แดง · หนี้ใหม่ = แดง
// 🔴 static ล้วน: อ่านไฟล์อย่างเดียว · ไม่แตะ DB/เน็ต · ไม่ import `@/…` · ไม่ import `src/lib/env` หรือ prisma (X12)
// 🔴 ทุกด่านห่อ try/catch — ไฟล์พัง/JSON เสีย = ด่านนั้นแดงพร้อมข้อความ ไม่ล้มทั้งไฟล์

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, resolve, dirname, sep } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

export type HrSev = "CRITICAL" | "MAJOR" | "MINOR";
export type HrChk = (id: string, name: string, ok: boolean, detail: string, sev?: HrSev) => void;

// ─────────────────── helpers ───────────────────
function walk(dir: string, filter: (p: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const p = join(dir, e);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue; // symlink เสีย — ข้าม
    }
    if (st.isDirectory()) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}
const posix = (p: string) => p.split(sep).join("/");
function parse(abs: string, text?: string): ts.SourceFile {
  const kind = abs.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(abs, text ?? readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true, kind);
}
const lineAt = (sf: ts.SourceFile, n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
/** ไฟล์นี้ขึ้นต้นด้วย directive "use client" ไหม (ตาม AST — คอมเมนต์ก่อนหน้าไม่นับ) */
function isUseClient(sf: ts.SourceFile): boolean {
  for (const st of sf.statements) {
    if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)) {
      if (st.expression.text === "use client") return true;
      continue; // directive อื่น ("use strict") — ดูต่อ
    }
    break;
  }
  return false;
}
function guarded(chk: HrChk, id: string, name: string, fn: () => void) {
  try {
    fn();
  } catch (e) {
    chk(id, name, false, `ด่านนี้พังระหว่างตรวจ — ${e instanceof Error ? e.message.slice(0, 240) : String(e)}`, "CRITICAL");
  }
}

// ═══════════════════════════════════════════════════════════════
// F16.1 — ไฟล์ client ไม่แตะช่องอ่อนไหวของพนักงาน
// ═══════════════════════════════════════════════════════════════
export const SENSITIVE_FIELDS = ["pinCode", "pinHash", "nationalId", "bankAccountNo", "ssoNumber", "houseRegAddress"] as const;
const SENSITIVE = new Set<string>(SENSITIVE_FIELDS);
/** ไฟล์ DTO ที่อนุญาต (whitelist ของ HF-HR-0) — ช่องที่ DTO ในไฟล์นี้ประกาศ = อ่านได้ในไฟล์ client ที่ import DTO นั้น */
export const PRIVACY_SHARED = "src/lib/modules/hr/privacy-shared.ts";
/** รากที่ต้องสแกน (ไฟล์ "use client" เท่านั้น) */
const F161_ROOTS = ["src/lib/modules/hr", "src/app/app/sys/[id]/payroll"];
/** ช่องที่ข้อยกเว้น DTO ของ privacy-shared.ts ไม่มีวันปล่อยผ่าน (PIN ห้ามออกจาก server · มติ H0.4 r2 FIX C) */
export const NEVER_EXEMPT = new Set<string>(["pinCode", "pinHash"]);
const F161_APP_ROOT = "src/app/app"; // + ทุกไฟล์ใต้ส่วน path ที่ชื่อ "hr"
/**
 * หนี้เดิม (ratchet) — "<ไฟล์>|<ชื่อช่อง>" → "closes in <WO>"
 * ณ H0.4 (8 ต.ค. 2569): ว่าง — ไฟล์ client ไฟล์เดียวที่อ่านช่องอ่อนไหวคือ EmployeeProfileForm.tsx
 * ซึ่งอ่านผ่าน EmployeeProfileDto ของ privacy-shared.ts (ข้อยกเว้นตามแผน) ⇒ ด่านนี้กัดโค้ดใหม่ทันที
 */
export const F161_BASELINE = new Map<string, string>([]);

type F161Hit = { file: string; line: number; field: string; how: string };

/** ชื่อสมาชิกตื้น ๆ ของ type literal / interface (รวม intersection/union ชั้นเดียว) */
function memberNames(node: ts.Node | undefined, out = new Set<string>()): Set<string> {
  if (!node) return out;
  if (ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node)) {
    for (const m of node.members) {
      const n = m.name;
      if (n && (ts.isIdentifier(n) || ts.isStringLiteral(n))) out.add(n.text);
    }
  } else if (ts.isTypeAliasDeclaration(node)) memberNames(node.type, out);
  else if (ts.isIntersectionTypeNode(node) || ts.isUnionTypeNode(node)) for (const t of node.types) memberNames(t, out);
  else if (ts.isParenthesizedTypeNode(node)) memberNames(node.type, out);
  return out;
}
/** type/interface ที่ไฟล์นี้ประกาศ → ชื่อสมาชิก */
function declaredTypes(sf: ts.SourceFile): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const st of sf.statements) if ((ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) && st.name) m.set(st.name.text, memberNames(st));
  return m;
}
/** แปลง module specifier เป็นไฟล์ใน repo (relative · `@/` = src/) — หาไม่เจอ = null */
function resolveLocal(ROOT: string, fromAbs: string, spec: string): string | null {
  let base: string | null = null;
  if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromAbs), spec);
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}
/** โมเดล Prisma ที่มีช่องอ่อนไหว (อ่าน schema แบบข้อความ — ไม่ import prisma) */
function prismaSensitiveModels(ROOT: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of walk(join(ROOT, "prisma", "schema"), (p) => p.endsWith(".prisma"))) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
      const fields = m[2]!.split("\n").map((l) => /^\s*(\w+)\s+\w/.exec(l)?.[1]).filter((x): x is string => !!x && SENSITIVE.has(x));
      if (fields.length) out.set(m[1]!, fields);
    }
  }
  return out;
}
const isPrismaModule = (spec: string) => spec === "@prisma/client" || /(^|\/)(generated\/)?prisma(\/client)?$/.test(spec) || spec.includes("/generated/prisma");

export function discoverF161Files(ROOT: string): string[] {
  const files = new Set<string>();
  const code = (p: string) => (p.endsWith(".ts") || p.endsWith(".tsx")) && !p.endsWith(".d.ts");
  for (const r of F161_ROOTS) for (const f of walk(join(ROOT, r), code)) files.add(f);
  for (const f of walk(join(ROOT, F161_APP_ROOT), code)) if (posix(relative(join(ROOT, F161_APP_ROOT), f)).split("/").includes("hr")) files.add(f);
  return [...files].sort();
}

/** ชื่อ type ของ Prisma ที่ลากช่องของโมเดลมาด้วย (`Prisma.HrEmployeeGetPayload` · `Prisma.HrEmployeeSelect` …) */
function prismaTypeOfModel(name: string, model: string): boolean {
  if (!name.startsWith(model)) return false;
  const rest = name.slice(model.length);
  return rest === "" || /^(GetPayload|Select|Omit|Include|(Unchecked)?(Create|Update)(Many)?(Mutation)?Input|Where(Unique)?Input|OrderByWithRelationInput|(FindMany|FindFirst|FindUnique|Create|Update|Delete|Upsert|Default)Args)$/.test(rest);
}

/** FIX C: privacy-shared.ts ต้องไม่มีชื่อ pinCode/pinHash ใน AST เลย (คอมเมนต์ไม่นับ) */
export function scanPrivacySharedPin(ROOT: string): F161Hit[] {
  const abs = join(ROOT, PRIVACY_SHARED);
  if (!existsSync(abs)) return [];
  const sf = parse(abs);
  const hits: F161Hit[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isIdentifier(n) || ts.isStringLiteralLike(n) || ts.isPrivateIdentifier(n)) && NEVER_EXEMPT.has(n.text)) {
      hits.push({ file: PRIVACY_SHARED, line: lineAt(sf, n), field: n.text, how: `privacy-shared.ts ประกาศ/อ้าง ${n.text} (PIN ห้ามอยู่ใน DTO)` });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

export function scanF161(ROOT: string, files = discoverF161Files(ROOT)): { clientFiles: string[]; hits: F161Hit[] } {
  const prismaModels = prismaSensitiveModels(ROOT);
  const clientFiles: string[] = [];
  const hits: F161Hit[] = scanPrivacySharedPin(ROOT);
  for (const abs of files) {
    const rel = posix(relative(ROOT, abs));
    if (rel === PRIVACY_SHARED) continue;
    const sf = parse(abs);
    if (!isUseClient(sf)) continue;
    clientFiles.push(rel);
    /** ช่องที่อ่านได้เพราะไฟล์นี้ import DTO จาก privacy-shared ที่ประกาศช่องนั้น (ไม่รวม pinCode/pinHash เสมอ) */
    const allowed = new Set<string>();
    const allow = (types: Map<string, Set<string>>, name: string) => {
      for (const f of types.get(name) ?? []) if (SENSITIVE.has(f) && !NEVER_EXEMPT.has(f)) allowed.add(f);
    };
    /** ชื่อในไฟล์ที่เป็น "ก้อน module" (import * as X · หรือชื่อที่ถูกใช้เป็น X.T เช่น Prisma) → ข้อมูลของ module นั้น */
    const qualifiers = new Map<string, { spec: string; types: Map<string, Set<string>>; shared: boolean; prisma: boolean }>();
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      const spec = st.moduleSpecifier.text;
      const target = resolveLocal(ROOT, abs, spec);
      const targetRel = target ? posix(relative(ROOT, target)) : null;
      const shared = targetRel === PRIVACY_SHARED;
      const prisma = isPrismaModule(spec);
      const names: { imported: string; local: string }[] = [];
      const cl = st.importClause;
      if (cl?.name) names.push({ imported: "default", local: cl.name.text });
      if (cl?.namedBindings && ts.isNamedImports(cl.namedBindings)) {
        for (const el of cl.namedBindings.elements) names.push({ imported: (el.propertyName ?? el.name).text, local: el.name.text });
      }
      const targetTypes = target ? declaredTypes(parse(target)) : new Map<string, Set<string>>();
      // `import [type] * as X from …` และชื่อที่ import มาแล้วถูกใช้เป็นตัวนำของ QualifiedName (`Prisma.HrEmployeeSelect`)
      if (cl?.namedBindings && ts.isNamespaceImport(cl.namedBindings)) qualifiers.set(cl.namedBindings.name.text, { spec, types: targetTypes, shared, prisma });
      for (const n of names) qualifiers.set(n.local, { spec, types: new Map(), shared: false, prisma });
      for (const n of names) {
        if (shared) {
          allow(targetTypes, n.imported);
          continue;
        }
        if (SENSITIVE.has(n.imported) || SENSITIVE.has(n.local)) hits.push({ file: rel, line: lineAt(sf, st), field: n.imported, how: `import ${n.imported} จาก ${spec}` });
        const fields = [...(targetTypes.get(n.imported) ?? [])].filter((f) => SENSITIVE.has(f));
        for (const f of fields) hits.push({ file: rel, line: lineAt(sf, st), field: f, how: `import type ${n.imported} (มีช่อง ${f}) จาก ${spec}` });
        if (prisma) for (const f of prismaModels.get(n.imported) ?? []) hits.push({ file: rel, line: lineAt(sf, st), field: f, how: `import โมเดล Prisma ${n.imported} (มีช่อง ${f})` });
      }
    }
    // รอบที่ 1: QualifiedName `X.T` (ตำแหน่ง type) และ `X.T` แบบ PropertyAccess ของ namespace import
    const qualified = (left: ts.Node, right: string, at: ts.Node) => {
      if (!ts.isIdentifier(left)) return;
      const q = qualifiers.get(left.text);
      if (!q) return;
      if (q.shared) {
        allow(q.types, right);
        return;
      }
      for (const f of [...(q.types.get(right) ?? [])].filter((x) => SENSITIVE.has(x))) hits.push({ file: rel, line: lineAt(sf, at), field: f, how: `อ้าง type ${left.text}.${right} (มีช่อง ${f}) จาก ${q.spec}` });
      if (q.prisma) for (const [model, fs] of prismaModels) if (prismaTypeOfModel(right, model)) for (const f of fs) hits.push({ file: rel, line: lineAt(sf, at), field: f, how: `อ้าง type Prisma ${left.text}.${right} (โมเดล ${model} มีช่อง ${f})` });
    };
    const pass1 = (node: ts.Node) => {
      if (ts.isQualifiedName(node)) qualified(node.left, node.right.text, node);
      else if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && qualifiers.has(node.expression.text)) qualified(node.expression, node.name.text, node);
      ts.forEachChild(node, pass1);
    };
    pass1(sf);
    // รอบที่ 2: การอ่านช่อง
    const visit = (node: ts.Node) => {
      let field: string | null = null;
      let how = "";
      if (ts.isPropertyAccessExpression(node) && SENSITIVE.has(node.name.text)) {
        field = node.name.text;
        how = `อ่าน .${field}`;
      } else if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && SENSITIVE.has(node.argumentExpression.text)) {
        field = node.argumentExpression.text;
        how = `อ่าน ["${field}"]`;
      } else if (ts.isBindingElement(node)) {
        const key = node.propertyName ?? node.name;
        if ((ts.isIdentifier(key) || ts.isStringLiteral(key)) && SENSITIVE.has(key.text) && ts.isObjectBindingPattern(node.parent)) {
          field = key.text;
          how = `แตกโครงสร้าง { ${field} }`;
        }
      }
      if (field && !allowed.has(field)) hits.push({ file: rel, line: lineAt(sf, node), field, how });
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { clientFiles, hits };
}

// ═══════════════════════════════════════════════════════════════
// F16.2 — payroll-rules.ts FREEZE
// ═══════════════════════════════════════════════════════════════
export const PAYROLL_RULES = "src/lib/modules/hr/payroll-rules.ts";
/** sha256 ของไบต์ทั้งไฟล์ ณ session/hr d43bdcb8 (8 ต.ค. 2569) — เปลี่ยนค่านี้ = ORACLE-EDIT ของผู้คุมงานเท่านั้น */
export const PAYROLL_RULES_SHA256 = "75a66c0c1354e932e7ba29609dcbf0919ffe82b51f476a3945fd1a0749833bf7";

// ═══════════════════════════════════════════════════════════════
// F16.3 — ทุกหน้า HR/payroll มีตัวกันสิทธิ์จาก hr/privacy หรือ hr/scope
// ═══════════════════════════════════════════════════════════════
/** ราก (ค้นทั้ง src/app) + ส่วน path ที่ทำให้หน้าเข้าขอบเขต — หลังตัด route group `(…)` */
export const PAGE_SCAN_ROOT = "src/app";
export const PAGE_SEGMENTS = new Set(["hr", "payroll", "kiosk"]);
export const GUARD_MODULES = ["@/lib/modules/hr/privacy", "@/lib/modules/hr/scope"];
const PRIVACY_FILE = "src/lib/modules/hr/privacy.ts";
const SCOPE_FILE = "src/lib/modules/hr/scope.ts";
/**
 * ตัวกันที่นับได้ (FIX E · H0.4 r2) — hr/privacy: `load*ForViewer` · `leaveItemsForViewer` · ชื่อขึ้นต้น `require` / `assert`
 * hr/scope: ทุก export (อ่านจากไฟล์จริงเมื่อมี) · 🔴 `hrViewerOf` / `hrAccessOf` / ตัวช่วยอื่นของ privacy ไม่นับ
 */
export const isPrivacyGuardName = (n: string) => /^load\w*ForViewer$/.test(n) || n === "leaveItemsForViewer" || /^(require|assert)/.test(n);
function scopeExports(ROOT: string): Set<string> {
  const abs = join(ROOT, SCOPE_FILE);
  const out = new Set<string>();
  if (!existsSync(abs)) return out;
  const sf = parse(abs);
  for (const st of sf.statements) {
    const exported = ts.canHaveModifiers(st) && (ts.getModifiers(st) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (exported && (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) {
      out.add(st.name.text);
    } else if (exported && ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) out.add(d.name.text);
    } else if (ts.isExportDeclaration(st) && !st.isTypeOnly && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) if (!el.isTypeOnly) out.add(el.name.text);
    }
  }
  return out;
}
/**
 * หนี้เดิม (ratchet) — หน้าที่ยังกันสิทธิ์ด้วย requireTenant + การเช็กคีย์ใน UI/service (ไม่ผ่าน hr/privacy|scope)
 * ปิดหนี้ = ใบที่เขียนหน้านั้นใหม่ถอดแถวออก (ถ้ามีตัวกันแล้วแต่ไม่ถอด = แดง)
 */
export const PAGE_GUARD_BASELINE = new Map<string, string>([
  ["src/app/app/sys/[id]/hr/attendance/page.tsx", "closes in H2.5"],
  ["src/app/app/sys/[id]/hr/leave/page.tsx", "closes in H2.7"],
  ["src/app/app/sys/[id]/hr/employees/page.tsx", "closes in H1.1/H4.4"],
  ["src/app/app/sys/[id]/hr/kiosk/page.tsx", "closes in H2.4"],
  ["src/app/app/sys/[id]/hr/payroll/page.tsx", "closes in H3.4"],
]);
/** จุดยึดของตัวค้นหา: หน้าที่มีตัวกันจริงวันนี้ต้องถูกเห็นว่า "มีตัวกัน" เสมอ (positive control) */
const F163_ANCHORS = ["src/app/app/sys/[id]/hr/employees/[employeeId]/page.tsx", "src/app/app/sys/[id]/payroll/[runId]/slip/[employeeId]/page.tsx"];

export function pageGuard(ROOT: string, abs: string, scope = scopeExports(ROOT)): { guarded: boolean; detail: string } {
  const sf = parse(abs);
  const locals = new Map<string, "privacy" | "scope">(); // ชื่อตัวกันในไฟล์ → module
  const namespaces = new Map<string, "privacy" | "scope">(); // import * as X
  const ignored: string[] = []; // import จาก module ตัวกันแต่ไม่ใช่ตัวกัน (เช่น hrViewerOf)
  const isGuard = (mod: "privacy" | "scope", name: string) => (mod === "privacy" ? isPrivacyGuardName(name) : scope.has(name));
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec = st.moduleSpecifier.text;
    const target = resolveLocal(ROOT, abs, spec);
    const targetRel = target ? posix(relative(ROOT, target)) : "";
    const mod: "privacy" | "scope" | null =
      spec === GUARD_MODULES[0] || spec === `${GUARD_MODULES[0]}.ts` || targetRel === PRIVACY_FILE ? "privacy" : spec === GUARD_MODULES[1] || spec === `${GUARD_MODULES[1]}.ts` || targetRel === SCOPE_FILE ? "scope" : null;
    if (!mod) continue;
    const cl = st.importClause;
    if (!cl || cl.isTypeOnly) continue;
    if (cl.namedBindings && ts.isNamedImports(cl.namedBindings)) {
      for (const el of cl.namedBindings.elements) {
        if (el.isTypeOnly) continue;
        const imported = (el.propertyName ?? el.name).text;
        if (isGuard(mod, imported)) locals.set(el.name.text, mod);
        else ignored.push(imported);
      }
    }
    if (cl.namedBindings && ts.isNamespaceImport(cl.namedBindings)) namespaces.set(cl.namedBindings.name.text, mod);
  }
  if (!locals.size && !namespaces.size) {
    return { guarded: false, detail: ignored.length ? `import แค่ ${ignored.join(", ")} จาก hr/privacy|scope — ไม่ใช่ตัวกัน (ต้องเรียก load*ForViewer / leaveItemsForViewer / require* / assert* หรือ export ของ hr/scope)` : "ไม่ import ตัวกันจาก hr/privacy หรือ hr/scope" };
  }
  const called = new Set<string>();
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const e = n.expression;
      if (ts.isIdentifier(e) && locals.has(e.text)) called.add(e.text);
      if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)) {
        const mod = namespaces.get(e.expression.text);
        if (mod && isGuard(mod, e.name.text)) called.add(`${e.expression.text}.${e.name.text}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return called.size
    ? { guarded: true, detail: [...called].join(", ") }
    : { guarded: false, detail: `import ${[...locals.keys(), ...[...namespaces.keys()].map((x) => `* as ${x}`)].join(", ")} แต่ไม่เรียกตัวกัน${ignored.length ? ` (เรียกได้แค่ ${ignored.join(", ")} — ไม่ใช่ตัวกัน)` : ""}` };
}
/** page.tsx ทุกไฟล์ใต้ src/app ที่ path (ตัด route group `(…)`) มีส่วน hr · payroll · kiosk */
export function discoverPages(ROOT: string): string[] {
  const base = join(ROOT, PAGE_SCAN_ROOT);
  return walk(base, (p) => p.endsWith(`${sep}page.tsx`))
    .filter((p) => posix(relative(base, p)).split("/").slice(0, -1).filter((seg) => !/^\(.*\)$/.test(seg)).some((seg) => PAGE_SEGMENTS.has(seg)))
    .map((p) => posix(relative(ROOT, p)))
    .sort();
}

// ═══════════════════════════════════════════════════════════════
// F16.4 — ข้อความ hr.* สองภาษา
// ═══════════════════════════════════════════════════════════════
/** คีย์ hr.* ที่ยอมให้มีภาษาเดียวชั่วคราว (ratchet) — ว่าง ณ H0.4 (namespace ยังไม่ถูกสร้าง) */
export const F164_BASELINE = new Map<string, string>([]);
function hrMessages(ROOT: string, locale: string): { present: boolean; keys: Map<string, unknown>; files: string[] } {
  const keys = new Map<string, unknown>();
  const files: string[] = [];
  let present = false;
  const flat = (o: unknown, prefix: string) => {
    if (o && typeof o === "object" && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) flat(v, `${prefix}.${k}`);
    else keys.set(prefix, o);
  };
  const take = (j: Record<string, unknown>, label: string, wholeNs: boolean) => {
    if (wholeNs) {
      present = true;
      files.push(label);
      flat(j, "hr");
      return;
    }
    if ("hr" in j) {
      present = true;
      files.push(`${label}#hr`);
      flat(j.hr, "hr");
    }
    for (const [k, v] of Object.entries(j)) {
      if (k.startsWith("hr.")) {
        present = true;
        files.push(`${label}#${k}`);
        flat(v, k);
      }
    }
  };
  const read = (p: string) => JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  const dir = join(ROOT, "src", "messages", locale);
  if (existsSync(dir)) for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) take(read(join(dir, f)), `${locale}/${f}`, f === "hr.json");
  const single = join(ROOT, "src", "messages", `${locale}.json`);
  if (existsSync(single)) take(read(single), `${locale}.json`, false);
  return { present, keys, files };
}

// ═══════════════════════════════════════════════════════════════
// F16.5 — pinCode อ่านได้ที่ hr/pin.ts + สคริปต์ backfill เท่านั้น (เปิดเมื่อมี hr/pin.ts)
// ═══════════════════════════════════════════════════════════════
export const PIN_MODULE = "src/lib/modules/hr/pin.ts";
export const PIN_ALLOWED = new Set([PIN_MODULE, "scripts/hr-backfill-pin-hash.mts"]);
/**
 * ขอบเขต: src/** + scripts/**.mts — ยกเว้น scripts/qc-*.mts (ข้อสอบต้องอ่านคอลัมน์เพื่อพิสูจน์ว่า "ไม่มี PIN ตัวเปล่าเหลือ" —
 * oracles that read the column must never print it · มติผู้คุมงาน H0.4 r2 ข้อ 6)
 * และไฟล์นี้เอง (มีชื่อช่องเป็นค่าคงที่) — มติผู้คุมงานได้ปรับ
 */
const F165_EXCLUDE = (rel: string) => /^scripts\/qc-[^/]*\.mts$/.test(rel) || rel === "scripts/fitness-hr.mts";
/**
 * ผู้แตะ pinCode เดิม (ratchet · ใช้เมื่อด่านเปิด) — "<ไฟล์>" → { n: จำนวนจุดแตะ, closes } · นับด้วย --print-pin-readers
 * ณ H0.4: ทั้งหมด "closes in H0.5" (ใบ H0.5 ย้ายเข้า hr/pin.ts แล้วถอดแถว · จำนวนลดแต่ไม่แก้ตัวเลข = แดง)
 */
// HR H0.5 ▸ ปิดหนี้ครบ — ทุกจุดย้ายเข้า hr/pin.ts แล้ว (ratchet: ถอดแถวทั้งหมด · ห้ามเพิ่มกลับ) ◂
export const F165_BASELINE = new Map<string, { n: number; closes: string }>([]);
export function scanPinReaders(ROOT: string): Map<string, { line: number; how: string }[]> {
  const out = new Map<string, { line: number; how: string }[]>();
  const files = [
    ...walk(join(ROOT, "src"), (p) => (p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".mts")) && !p.endsWith(".d.ts")),
    ...walk(join(ROOT, "scripts"), (p) => p.endsWith(".mts") || p.endsWith(".ts")),
  ];
  for (const abs of files) {
    const rel = posix(relative(ROOT, abs));
    if (PIN_ALLOWED.has(rel) || F165_EXCLUDE(rel)) continue;
    const text = readFileSync(abs, "utf8");
    if (!text.includes("pinCode")) continue;
    const sf = parse(abs, text);
    const hits: { line: number; how: string }[] = [];
    const visit = (n: ts.Node) => {
      if (ts.isPropertyAccessExpression(n) && n.name.text === "pinCode") hits.push({ line: lineAt(sf, n), how: ".pinCode" });
      else if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression) && n.argumentExpression.text === "pinCode") hits.push({ line: lineAt(sf, n), how: '["pinCode"]' });
      else if ((ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) && n.name.text === "pinCode") hits.push({ line: lineAt(sf, n), how: "{ pinCode: … }" });
      else if (ts.isBindingElement(n)) {
        const k = n.propertyName ?? n.name;
        if ((ts.isIdentifier(k) || ts.isStringLiteral(k)) && k.text === "pinCode") hits.push({ line: lineAt(sf, n), how: "{ pinCode } =" });
      } else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) && /\bpinCode\b/.test(n.text)) {
        // SQL ดิบ / ชื่อช่องในสตริง — ยกเว้นคีย์ที่ถูกนับแล้วด้านบน (`{ "pinCode": … }` · `x["pinCode"]`)
        const p = n.parent;
        const counted = (ts.isPropertyAssignment(p) && p.name === n) || (ts.isElementAccessExpression(p) && p.argumentExpression === n) || (ts.isBindingElement(p) && p.propertyName === n);
        if (!counted) hits.push({ line: lineAt(sf, n), how: "สตริง 'pinCode'" });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    if (hits.length) out.set(rel, hits);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// ตัวรัน
// ═══════════════════════════════════════════════════════════════
export function runHrFitness(chk: HrChk, ROOT: string, log: (s: string) => void = console.log) {
  // ── F16.1 ──
  log("\n── F16.1: ไฟล์ \"use client\" ของ HR ไม่แตะช่องอ่อนไหว (pinCode · pinHash · nationalId · bankAccountNo · ssoNumber · houseRegAddress) ──");
  const n161 = "ไฟล์ \"use client\" ใต้ hr/** + sys/[id]/payroll/** ไม่ import/อ่านช่องอ่อนไหว (ยกเว้น DTO ของ privacy-shared.ts · pinCode/pinHash ไม่มีข้อยกเว้น)";
  guarded(chk, "F16.1", n161, () => {
    const files = discoverF161Files(ROOT);
    const { clientFiles, hits } = scanF161(ROOT, files);
    const fresh = hits.filter((h) => !F161_BASELINE.has(`${h.file}|${h.field}`));
    const healed = [...F161_BASELINE.keys()].filter((k) => !hits.some((h) => `${h.file}|${h.field}` === k));
    const anchorOk = files.some((f) => posix(relative(ROOT, f)) === PRIVACY_SHARED) && clientFiles.length > 0;
    const problems = [
      !anchorOk ? `ตัวค้นหาพัง — ไม่เจอ ${PRIVACY_SHARED} หรือไม่เจอไฟล์ "use client" เลย (สแกน ${files.length} ไฟล์)` : "",
      fresh.length ? `${fresh.length} จุด: ${fresh.slice(0, 10).map((h) => `${h.file}:${h.line} ${h.how}`).join(" · ")}${fresh.length > 10 ? " …" : ""} → ส่งผ่าน DTO ใน privacy-shared.ts (PIN ห้ามออกจาก server)` : "",
      healed.length ? `F161_BASELINE มีแถวที่ปิดแล้ว ถอดออก (ratchet): ${healed.join(", ")}` : "",
    ].filter(Boolean);
    chk("F16.1", `${n161} (ไฟล์ client ${clientFiles.length} · สแกน ${files.length} · หนี้เดิม ${F161_BASELINE.size})`, problems.length === 0, problems.length ? problems.join(" · ") : `สะอาด (${clientFiles.length} ไฟล์ client)`, "CRITICAL");
  });

  // ── F16.2 ──
  log("\n── F16.2: payroll-rules.ts ไบต์ตรงเดิม (FREEZE) ──");
  const n162 = `${PAYROLL_RULES} sha256 = PAYROLL_RULES_SHA256`;
  guarded(chk, "F16.2", n162, () => {
    const abs = join(ROOT, PAYROLL_RULES);
    if (!existsSync(abs)) {
      chk("F16.2", n162, false, `ไม่พบ ${PAYROLL_RULES} — FREEZE — new rules = new functions + engineVersion`, "CRITICAL");
      return;
    }
    const got = createHash("sha256").update(readFileSync(abs)).digest("hex");
    chk(
      "F16.2",
      n162,
      got === PAYROLL_RULES_SHA256,
      got === PAYROLL_RULES_SHA256 ? `ตรง ${got.slice(0, 12)}…` : `${PAYROLL_RULES} เปลี่ยน (sha256 ${got.slice(0, 12)}… ≠ ${PAYROLL_RULES_SHA256.slice(0, 12)}…) — FREEZE — new rules = new functions + engineVersion`,
      "CRITICAL",
    );
  });

  // ── F16.3 ──
  log("\n── F16.3: ทุก page.tsx ของ HR/payroll/kiosk มีตัวกันจาก hr/privacy หรือ hr/scope ──");
  const n163 = "page.tsx ใต้ src/app/** ที่มีส่วน hr|payroll|kiosk import+เรียกตัวกันในรายการของ @/lib/modules/hr/privacy|scope (hrViewerOf อย่างเดียวไม่นับ)";
  guarded(chk, "F16.3", n163, () => {
    const pages = discoverPages(ROOT);
    const scope = scopeExports(ROOT);
    const res = pages.map((p) => ({ p, ...pageGuard(ROOT, join(ROOT, p), scope) }));
    const missing = res.filter((r) => !r.guarded && !PAGE_GUARD_BASELINE.has(r.p));
    const healed = [...PAGE_GUARD_BASELINE.keys()].filter((b) => !pages.includes(b) || res.find((r) => r.p === b)?.guarded);
    const anchorMiss = F163_ANCHORS.filter((a) => existsSync(join(ROOT, a)) && !res.find((r) => r.p === a)?.guarded);
    const problems = [
      !pages.length ? "ตัวค้นหาพัง — ไม่เจอ page.tsx เลย" : "",
      anchorMiss.length ? `ตัวตรวจพัง — หน้าที่มีตัวกันจริงถูกมองว่าไม่มี: ${anchorMiss.join(", ")}` : "",
      missing.length ? `${missing.length} หน้าไม่มีตัวกัน: ${missing.map((m) => `${m.p} (${m.detail})`).join(" · ")} → เรียก loader load*ForViewer / require*/assert* จาก hr/privacy (หรือ export ของ hr/scope)` : "",
      healed.length ? `PAGE_GUARD_BASELINE มีหน้าที่ปิดหนี้แล้ว/ไม่มีแล้ว ถอดออก (ratchet): ${healed.join(", ")}` : "",
    ].filter(Boolean);
    const okPages = res.filter((r) => r.guarded).length;
    chk("F16.3", `${n163} (${pages.length} หน้า · มีตัวกัน ${okPages} · หนี้เดิม ${PAGE_GUARD_BASELINE.size})`, problems.length === 0, problems.length ? problems.join(" · ") : `ครบ (${okPages} มีตัวกัน · ${pages.length - okPages} อยู่ใน baseline)`, "CRITICAL");
  });

  // ── F16.4 ──
  log("\n── F16.4: ข้อความ hr.* ครบทั้ง th/en ──");
  const n164 = "คีย์ hr.* ใน th/en ตรงกัน · ไม่ว่าง · ค่าไทยไม่ใช่ ^[A-Z_]+$";
  guarded(chk, "F16.4", n164, () => {
    const th = hrMessages(ROOT, "th");
    const en = hrMessages(ROOT, "en");
    if (!th.present && !en.present) {
      chk("F16.4", n164, true, "0 keys (namespace not created yet)");
      return;
    }
    const problems: string[] = [];
    if (th.present !== en.present) problems.push(`namespace hr มีแค่ ${th.present ? "th" : "en"} (${[...th.files, ...en.files].join(", ")})`);
    const onlyTh = [...th.keys.keys()].filter((k) => !en.keys.has(k) && !F164_BASELINE.has(k));
    const onlyEn = [...en.keys.keys()].filter((k) => !th.keys.has(k) && !F164_BASELINE.has(k));
    if (onlyTh.length) problems.push(`มีแต่ th ${onlyTh.length}: ${onlyTh.slice(0, 8).join(", ")}`);
    if (onlyEn.length) problems.push(`มีแต่ en ${onlyEn.length}: ${onlyEn.slice(0, 8).join(", ")}`);
    const empty = [...th.keys, ...en.keys].filter(([, v]) => typeof v !== "string" || !v.trim()).map(([k]) => k);
    if (empty.length) problems.push(`ค่าว่าง/ไม่ใช่ข้อความ ${empty.length}: ${[...new Set(empty)].slice(0, 8).join(", ")}`);
    const keyish = [...th.keys].filter(([, v]) => typeof v === "string" && /^[A-Z_]+$/.test(v)).map(([k, v]) => `${k}="${v}"`);
    if (keyish.length) problems.push(`ค่า th เป็นชื่อคีย์ (^[A-Z_]+$) ${keyish.length}: ${keyish.slice(0, 8).join(", ")}`);
    const healed = [...F164_BASELINE.keys()].filter((k) => th.keys.has(k) === en.keys.has(k));
    if (healed.length) problems.push(`F164_BASELINE มีคีย์ที่ครบแล้ว ถอดออก (ratchet): ${healed.join(", ")}`);
    chk("F16.4", n164, problems.length === 0, problems.length ? problems.join(" · ") : `ครบ ${th.keys.size} keys (${[...th.files, ...en.files].join(", ")})`);
  });

  // ── F16.5 ──
  log("\n── F16.5: pinCode แตะได้แค่ hr/pin.ts + สคริปต์ backfill (หลัง H0.5) ──");
  const n165 = `ไม่มีการแตะ pinCode นอก ${[...PIN_ALLOWED].join(" · ")}`;
  guarded(chk, "F16.5", n165, () => {
    const readers = scanPinReaders(ROOT);
    const total = [...readers.values()].reduce((a, b) => a + b.length, 0);
    const qcNote = "scripts/qc-*.mts not scanned — oracles that read the column must never print it";
    if (!existsSync(join(ROOT, PIN_MODULE))) {
      chk("F16.5", n165, true, `inactive until H0.5 (ไม่มี ${PIN_MODULE} · วันนี้แตะ ${total} จุดใน ${readers.size} ไฟล์ · baseline ${F165_BASELINE.size} ไฟล์ · ${qcNote})`);
      return;
    }
    const problems: string[] = [];
    for (const [file, hits] of readers) {
      const b = F165_BASELINE.get(file);
      if (!b) problems.push(`${file} ${hits.length} จุด (${hits.slice(0, 4).map((h) => `:${h.line} ${h.how}`).join(" ")}) — ย้ายเข้า ${PIN_MODULE}`);
      else if (hits.length > b.n) problems.push(`${file} ${b.n}→${hits.length} (เพิ่ม · ${hits.slice(0, 4).map((h) => `:${h.line} ${h.how}`).join(" ")})`);
      else if (hits.length < b.n) problems.push(`${file} ${b.n}→${hits.length} ลดแล้ว — แก้ตัวเลขใน F165_BASELINE (ratchet)`);
    }
    for (const f of F165_BASELINE.keys()) if (!readers.has(f)) problems.push(`F165_BASELINE มี ${f} ที่ไม่แตะ pinCode แล้ว ถอดออก (ratchet)`);
    chk("F16.5", n165, problems.length === 0, problems.length ? `${problems.join(" · ")} · ${qcNote}` : `สะอาด (หนี้เดิม ${F165_BASELINE.size} ไฟล์ตามตัวเลข · ${qcNote})`, "CRITICAL");
  });
}

// ─────────────────── รันเดี่ยว ───────────────────
const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href;
  } catch {
    return false;
  }
})();
if (isMain) {
  const ROOT = resolve(import.meta.dirname, "..");
  if (process.argv.includes("--print-pin-readers")) {
    for (const [f, hits] of scanPinReaders(ROOT)) console.log(`  ${f} ${hits.length}: ${hits.map((h) => `:${h.line} ${h.how}`).join(" ")}`);
    process.exit(0);
  }
  const res: { id: string; name: string; ok: boolean; detail: string; sev: HrSev }[] = [];
  runHrFitness((id, name, ok, detail, sev = "MAJOR") => {
    res.push({ id, name, ok, detail, sev });
    console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name} — ${detail}`);
  }, ROOT);
  const failed = res.filter((r) => !r.ok);
  const bySev = (s: HrSev) => failed.filter((c) => c.sev === s).length;
  console.log("\n===== FITNESS-HR =====");
  console.log(`ผ่าน ${res.length - failed.length}/${res.length}`);
  console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
  console.log(`\nJSON_SUMMARY ${JSON.stringify({ suite: "fitness-hr", total: res.length, passed: res.length - failed.length, findings: failed.map((c) => ({ id: c.id, detail: c.detail, sev: c.sev })) })}`);
  process.exit(bySev("CRITICAL") + bySev("MAJOR") > 0 ? 1 : 0);
}
