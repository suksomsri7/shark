// fitness-pos.mts — ด่าน fitness ของ RUN POS (F15.1–F15.4 · ใบ P0.1)
//
// เรียกจาก `scripts/fitness.mts` (บล็อก `// POS P0.1 ▸ … ◂` หลัง F14) ผ่าน `runPosFitness(chk, ROOT)`
// หรือรันเดี่ยว: `pnpm exec tsx scripts/fitness-pos.mts [--update-pos-contract]`
//
//   F15.1 แคตตาล็อกมีผู้เขียนที่เดียว (ratchet) — ห้าม Prisma write ของ menuItem/shopProduct และห้ามเขียน
//         AccountProduct ที่ตั้ง salePrice นอก «src/lib/modules/pos/catalog.ts» ∪ BASELINE (ผู้เขียนเดิมวันนี้)
//         · baseline ที่ไม่เขียนแล้ว = แดง (ให้ถอดออก) · P1.1b เป็นคนทำ baseline ให้ว่าง
//   F15.2 สัญญา createSale/voidSale/(refundSale) เข้ากันได้ย้อนหลัง — เทียบกับ snapshot `scripts/pos-sale-contract.json`
//         ด้วย TypeScript parser (ไม่ใช่ regex) · ลบ/เปลี่ยนชื่อ/เปลี่ยนชนิด/ฟิลด์ใหม่ที่บังคับ = แดง · หาไม่เจอ = แดง
//         ฟิลด์ใหม่แบบ optional = เขียว + บอกให้ `--update-pos-contract` (เติมอย่างเดียว ไม่ลบไม่แก้ของเดิม)
//   F15.3 ทะเบียนปุ่ม POS ซื่อสัตย์ (F14.1/F14.2 ฉบับ POS) — ใช้ตัวสแกนเดียวกับ F14 (`scripts/lib/crm-testid-scan.mts`
//         import อย่างเดียว ไม่แตะโค้ดของ F14) + หนี้ "ปุ่มไม่มี testid" ต่อไฟล์แบบ ratchet
//   F15.4 ข้อความ POS สองภาษา — คีย์ใต้ `pos.*` ใน src/messages/{th,en}/*.json ต้องมีครบทั้งสองฝั่ง ไม่ว่าง
//         และค่าภาษาไทยต้องไม่ใช่ชื่อคีย์/ตัวพิมพ์ใหญ่แบบ enum (`^[A-Z_]+$`) · ยังไม่มี namespace = เขียว "0 คีย์"
//
// 🔴 static ล้วน: อ่านไฟล์อย่างเดียว · ไม่แตะ DB/เน็ต · ไม่ import `@/…` หรือ `src/lib/env` (pre-commit ไม่มี env — X12)
// 🔴 ไฟล์เดียวที่เขียนได้ = `scripts/pos-sale-contract.json` และเฉพาะเมื่อสั่ง `--update-pos-contract` เท่านั้น

import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { TESTID_RE, ANY_TESTID_RE, normId, globRe, tagAround, isInteractive, lineOf } from "./lib/crm-testid-scan.mjs";

export type PosSev = "CRITICAL" | "MAJOR" | "MINOR";
export type PosChk = (id: string, name: string, ok: boolean, detail: string, sev?: PosSev) => void;

// ─────────────────── helpers ───────────────────
function walk(dir: string, filter: (p: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}
/** ลบคอมเมนต์แบบคงตำแหน่งตัวอักษร (บล็อก /* *\/ ทุกที่ + บรรทัดที่เป็นคอมเมนต์ทั้งบรรทัด) — โค้ดที่ถูกคอมเมนต์ไว้ไม่นับ */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^[ \t]*\/\/.*$/gm, (m) => " ".repeat(m.length));
}
/** ข้อความในวงเล็บที่เปิดที่ตำแหน่ง `open` (นับวงเล็บ ข้ามสตริง) */
function balancedArgs(src: string, open: number): string {
  let depth = 0;
  let quote = "";
  for (let i = open; i < src.length; i++) {
    const c = src[i]!;
    if (quote) {
      if (c === quote && src[i - 1] !== "\\") quote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return src.slice(open);
}

// ═══════════════════════════════════════════════════════════════
// F15.1 — ผู้เขียนแคตตาล็อก
// ═══════════════════════════════════════════════════════════════
/** ที่เดียวที่ได้เขียนแคตตาล็อกหลัง P1.1 (ยังไม่มีไฟล์ ณ P0.1) */
export const CATALOG_WRITER = "src/lib/modules/pos/catalog.ts";
/**
 * ผู้เขียนเดิม (ตรวจจากโค้ดจริง 1 ต.ค. 2569 ด้วยตัวสแกนข้างล่าง) — ratchet: ลดได้อย่างเดียว · P1.1b ทำให้ว่าง
 * key = ไฟล์ · value = เขียนอะไร (เหตุผลที่ยังอยู่)
 */
export const CATALOG_WRITER_BASELINE = new Map<string, string>([
  ["src/lib/modules/restaurant/menu.ts", "menuItem create/update (สร้าง/แก้/ทำซ้ำ/เก็บเมนู · สต็อกเมนู · reset รายวัน) — P1.1b ย้ายเข้า catalog.ts"],
  ["src/lib/modules/restaurant/order.ts", "menuItem update/updateMany (หักสต็อกเมนู + 86 อัตโนมัติตอนยืนยันออเดอร์) — P1.1b/P2.4"],
  ["src/lib/modules/shop/service.ts", "shopProduct create/update (สินค้าเว็บร้าน) — P1.1b/P2.8"],
  ["src/lib/modules/account/service.ts", "accountProduct updateMany/create ตั้ง salePrice (updateAccountProductSalePrice · createAccountProductWithSalePrice ที่หน้า POS 'สินค้า/ราคา' เรียก) — P1.1b"],
  ["src/lib/modules/account/product.ts", "accountProduct create/updateMany ที่มี salePrice (หน้าสินค้าของระบบบัญชี · API products-write) — P1.1b"],
]);
const CAT_WRITE_RE = /\b(menuItem|shopProduct)\s*\??\.\s*(createManyAndReturn|createMany|create|updateManyAndReturn|updateMany|update|upsert|deleteMany|delete)\s*\(/g;
const CAT_RAW_RE = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"(MenuItem|ShopProduct)"/g;
const AP_WRITE_RE = /\baccountProduct\s*\??\.\s*(createManyAndReturn|createMany|create|updateManyAndReturn|updateMany|update|upsert)\s*\(/g;
const AP_RAW_RE = /\b(INSERT\s+INTO|UPDATE)\s+"AccountProduct"[\s\S]{0,400}?"salePrice"/g;
/** มีการกำหนด salePrice ในไฟล์ (ไม่นับ `salePrice: true` ของ select · ไม่นับการอ่าน `x.salePrice`) */
const SALEPRICE_ASSIGN_RE = /(?<![.\w])salePrice\s*(?::(?!\s*true\b)|=(?!=)|,|\s*\})/;

export type CatalogWriter = { file: string; hits: string[] };
export function scanCatalogWriters(ROOT: string): CatalogWriter[] {
  const out: CatalogWriter[] = [];
  for (const abs of walk(join(ROOT, "src"), (p) => /\.(ts|tsx|mts)$/.test(p))) {
    const raw = readFileSync(abs, "utf8");
    if (!/menuItem|shopProduct|MenuItem|ShopProduct|accountProduct|AccountProduct/.test(raw)) continue;
    const src = stripComments(raw);
    const hits: string[] = [];
    for (const m of src.matchAll(CAT_WRITE_RE)) hits.push(`${m[1]}.${m[2]}@${lineOf(src, m.index ?? 0)}`);
    for (const m of src.matchAll(CAT_RAW_RE)) hits.push(`raw ${m[1]} "${m[2]}"@${lineOf(src, m.index ?? 0)}`);
    const fileAssignsSalePrice = SALEPRICE_ASSIGN_RE.test(src);
    for (const m of src.matchAll(AP_WRITE_RE)) {
      const at = m.index ?? 0;
      const args = balancedArgs(src, at + m[0].length - 1);
      const direct = /\bsalePrice\b/.test(args);
      // data ที่สร้างไว้ก่อน (`data: d` · `data,` · `...x`) — ตามไปดูไม่ได้ ⇒ ถือว่าตั้ง salePrice ถ้าไฟล์นี้มีการกำหนด salePrice
      const indirect = !direct && /\bdata\s*(?::\s*[A-Za-z_$][\w$]*\s*[,}]|[,}])|\.\.\.[A-Za-z_$]/.test(args) && fileAssignsSalePrice;
      if (direct || indirect) hits.push(`accountProduct.${m[1]}${direct ? "" : " (data ทางอ้อม)"} salePrice@${lineOf(src, at)}`);
    }
    for (const m of src.matchAll(AP_RAW_RE)) hits.push(`raw ${m[1]} "AccountProduct" salePrice@${lineOf(src, m.index ?? 0)}`);
    if (hits.length) out.push({ file: relative(ROOT, abs), hits });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// F15.2 — สัญญา createSale / voidSale / refundSale
// ═══════════════════════════════════════════════════════════════
export const SALE_SERVICE = "src/lib/modules/pos/service.ts";
export const SALE_CONTRACT = "scripts/pos-sale-contract.json";
/** ฟังก์ชันที่ต้องมี (หาไม่เจอ = แดง) · refundSale = ติดตามเมื่อเกิด (P1.8) */
const REQUIRED_FNS = ["createSale", "voidSale"] as const;
const OPTIONAL_FNS = ["refundSale"] as const;
/** ชนิดที่เป็นสัญญาสาธารณะ (re-export ใน pos/index.ts) */
const CONTRACT_TYPES = ["CreateSaleInput", "SaleResult", "MemberSaleChoices"] as const;

type Field = { optional: boolean; type: string };
type Param = { name: string; optional: boolean; type: string };
type FnSig = { params: Param[]; returns: string };
export type SaleContract = {
  $note?: string;
  source: string;
  functions: Record<string, FnSig>;
  types: Record<string, Record<string, Field>>;
  callers: Record<string, string[]>;
};

const norm = (s: string) => s.replace(/\/\/[^\n]*\n/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ").replace(/[;,]\s*([}\]])/g, " $1").trim();

function flattenMembers(members: ts.NodeArray<ts.TypeElement>, sf: ts.SourceFile, prefix: string, out: Record<string, Field>) {
  for (const m of members) {
    if (!ts.isPropertySignature(m) || !m.name) continue;
    const name = prefix + m.name.getText(sf);
    const optional = !!m.questionToken;
    const t = m.type;
    if (t && ts.isTypeLiteralNode(t)) {
      out[name] = { optional, type: "object" };
      flattenMembers(t.members, sf, `${name}.`, out);
    } else if (t && ts.isArrayTypeNode(t) && ts.isTypeLiteralNode(t.elementType)) {
      out[name] = { optional, type: "object[]" };
      flattenMembers(t.elementType.members, sf, `${name}[].`, out);
    } else {
      out[name] = { optional, type: t ? norm(t.getText(sf)) : "any" };
    }
  }
}

/** อ่านสัญญาจากโค้ดจริงด้วย TypeScript parser — คืน null ในช่องที่หาไม่เจอ (ผู้เรียกตัดสินว่าแดง) */
export function readSaleContract(ROOT: string): { fns: Record<string, FnSig | null>; types: Record<string, Record<string, Field> | null>; error?: string } {
  const abs = join(ROOT, SALE_SERVICE);
  const fns: Record<string, FnSig | null> = {};
  const types: Record<string, Record<string, Field> | null> = {};
  for (const n of [...REQUIRED_FNS, ...OPTIONAL_FNS]) fns[n] = null;
  for (const n of CONTRACT_TYPES) types[n] = null;
  if (!existsSync(abs)) return { fns, types, error: `ไม่พบ ${SALE_SERVICE}` };
  const sf = ts.createSourceFile(abs, readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const isExported = (n: ts.Node) => !!ts.getModifiers(n as ts.HasModifiers)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const sigOf = (params: ts.NodeArray<ts.ParameterDeclaration>, ret: ts.TypeNode | undefined): FnSig => ({
    params: params.map((p) => ({ name: p.name.getText(sf), optional: !!p.questionToken || !!p.initializer, type: p.type ? norm(p.type.getText(sf)) : "any" })),
    returns: ret ? norm(ret.getText(sf)) : "(ไม่ระบุ)",
  });
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && isExported(st) && st.name.text in fns) fns[st.name.text] = sigOf(st.parameters, st.type);
    if (ts.isVariableStatement(st) && isExported(st)) {
      for (const d of st.declarationList.declarations) {
        const nm = d.name.getText(sf);
        if (!(nm in fns) || !d.initializer) continue;
        if (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) fns[nm] = sigOf(d.initializer.parameters, d.initializer.type);
      }
    }
    if (ts.isTypeAliasDeclaration(st) && isExported(st) && st.name.text in types) {
      const f: Record<string, Field> = {};
      if (ts.isTypeLiteralNode(st.type)) flattenMembers(st.type.members, sf, "", f);
      else f.$self = { optional: false, type: norm(st.type.getText(sf)) };
      types[st.name.text] = f;
    }
    if (ts.isInterfaceDeclaration(st) && isExported(st) && st.name.text in types) {
      const f: Record<string, Field> = {};
      flattenMembers(st.members, sf, "", f);
      types[st.name.text] = f;
    }
  }
  return { fns, types };
}

/** ใครเรียก createSale/voidSale/refundSale (ไฟล์ใน src นอก service.ts) — ข้อมูลให้ผู้ตรวจเห็นว่าใครพึ่งสัญญานี้ */
export function scanSaleCallers(ROOT: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const names = [...REQUIRED_FNS, ...OPTIONAL_FNS];
  for (const n of names) out[n] = [];
  for (const abs of walk(join(ROOT, "src"), (p) => /\.(ts|tsx)$/.test(p))) {
    const r = relative(ROOT, abs);
    if (r === SALE_SERVICE) continue;
    const raw = readFileSync(abs, "utf8");
    if (!/createSale|voidSale|refundSale/.test(raw)) continue;
    const src = stripComments(raw);
    for (const n of names) if (new RegExp(`(?<!function\\s)\\b${n}\\s*\\(`).test(src)) out[n]!.push(r);
  }
  for (const n of names) out[n]!.sort();
  return out;
}

export type ContractDiff = { red: string[]; additions: string[]; info: string[] };
export function diffSaleContract(snap: SaleContract, cur: ReturnType<typeof readSaleContract>, callers: Record<string, string[]>): ContractDiff {
  const red: string[] = [];
  const additions: string[] = [];
  const info: string[] = [];
  if (cur.error) red.push(cur.error);
  // ── ฟังก์ชัน ──
  for (const n of REQUIRED_FNS) if (!cur.fns[n]) red.push(`หา export function ${n} ใน ${SALE_SERVICE} ไม่เจอ (ตัวแยกโค้ดพัง หรือฟังก์ชันหาย/ย้าย)`);
  for (const [n, s] of Object.entries(snap.functions)) {
    const c = cur.fns[n];
    if (!c) {
      if (!(REQUIRED_FNS as readonly string[]).includes(n)) red.push(`${n} อยู่ใน snapshot แต่หายจากโค้ด`);
      continue;
    }
    s.params.forEach((p, i) => {
      const q = c.params[i];
      if (!q) return red.push(`${n}: พารามิเตอร์ที่ ${i + 1} "${p.name}" ถูกลบ`);
      if (q.name !== p.name) red.push(`${n}: พารามิเตอร์ที่ ${i + 1} เปลี่ยนชื่อ "${p.name}" → "${q.name}"`);
      if (q.type !== p.type) red.push(`${n}: พารามิเตอร์ "${p.name}" เปลี่ยนชนิด "${p.type}" → "${q.type}"`);
      if (p.optional && !q.optional) red.push(`${n}: พารามิเตอร์ "${p.name}" เปลี่ยนจากไม่บังคับเป็นบังคับ`);
    });
    c.params.slice(s.params.length).forEach((q) => {
      if (!q.optional) red.push(`${n}: เพิ่มพารามิเตอร์บังคับใหม่ "${q.name}" (ผู้เรียกเดิมพัง — ต้องเป็นแบบไม่บังคับ)`);
      else additions.push(`${n}(…, ${q.name}?)`);
    });
    if (c.returns !== s.returns) red.push(`${n}: ชนิดผลลัพธ์เปลี่ยน "${s.returns}" → "${c.returns}"`);
  }
  for (const n of OPTIONAL_FNS) if (cur.fns[n] && !snap.functions[n]) additions.push(`ฟังก์ชันใหม่ ${n}()`);
  // ── ชนิด ──
  for (const tn of CONTRACT_TYPES) {
    const s = snap.types[tn];
    const c = cur.types[tn];
    if (!c) {
      red.push(`หา export type ${tn} ใน ${SALE_SERVICE} ไม่เจอ`);
      continue;
    }
    if (!s) {
      additions.push(`ชนิดใหม่ในสัญญา ${tn}`);
      continue;
    }
    for (const [f, sf] of Object.entries(s)) {
      const cf = c[f];
      if (!cf) red.push(`${tn}.${f} ถูกลบ/เปลี่ยนชื่อ`);
      else {
        if (cf.type !== sf.type) red.push(`${tn}.${f} เปลี่ยนชนิด "${sf.type}" → "${cf.type}"`);
        if (sf.optional && !cf.optional) red.push(`${tn}.${f} เปลี่ยนจากไม่บังคับเป็นบังคับ`);
      }
    }
    for (const [f, cf] of Object.entries(c)) {
      if (s[f]) continue;
      // ฟิลด์ลูกของ object ที่เพิ่มใหม่ทั้งก้อนแบบไม่บังคับ ไม่ถือเป็นฟิลด์บังคับของผู้เรียกเดิม
      const parent = f.includes(".") ? f.replace(/(\[\])?\.[^.]+$/, "") : ""; // "lines[].qty" → "lines" · "giftCard.pin" → "giftCard"
      const parentIsNew = !!parent && !s[parent] && !!c[parent];
      if (!cf.optional && !parentIsNew) red.push(`${tn}.${f} เป็นฟิลด์ใหม่ที่ "บังคับ" — ผู้เรียกเดิมพัง (ต้องเป็น ${f}?)`);
      else additions.push(`${tn}.${f}${cf.optional ? "?" : ""}`);
    }
  }
  // ── ผู้เรียก (ข้อมูล ไม่ตัดสิน) ──
  for (const [n, list] of Object.entries(callers)) {
    const before = new Set(snap.callers?.[n] ?? []);
    const added = list.filter((f) => !before.has(f));
    const gone = [...before].filter((f) => !list.includes(f));
    if (added.length || gone.length) info.push(`ผู้เรียก ${n} เปลี่ยน (+${added.length} ${added.join(", ")} · −${gone.length} ${gone.join(", ")}) — อัปเดต snapshot ด้วย --update-pos-contract`);
  }
  return { red, additions, info };
}

/** --update-pos-contract: เติมของใหม่แบบไม่บังคับ + ผู้เรียก · ไม่ลบไม่แก้ของเดิม · ปฏิเสธเมื่อยังแดง (ยกเว้นยังไม่มี snapshot) */
export function updateSaleContract(ROOT: string): { ok: boolean; message: string } {
  const path = join(ROOT, SALE_CONTRACT);
  const cur = readSaleContract(ROOT);
  const callers = scanSaleCallers(ROOT);
  if (cur.error || REQUIRED_FNS.some((n) => !cur.fns[n]) || CONTRACT_TYPES.some((t) => !cur.types[t])) {
    return { ok: false, message: `อ่านสัญญาจากโค้ดไม่ครบ — ไม่เขียน snapshot (${cur.error ?? "ฟังก์ชัน/ชนิดหาย"})` };
  }
  if (!existsSync(path)) {
    const snap: SaleContract = {
      $note: "สัญญาสาธารณะของ createSale/voidSale/refundSale (F15.2 ใน scripts/fitness-pos.mts) — สร้าง/เติมด้วย `pnpm exec tsx scripts/fitness-pos.mts --update-pos-contract` เท่านั้น · ห้ามแก้มือเพื่อให้ด่านเขียว",
      source: SALE_SERVICE,
      functions: Object.fromEntries(Object.entries(cur.fns).filter(([, v]) => v)) as Record<string, FnSig>,
      types: cur.types as Record<string, Record<string, Field>>,
      callers,
    };
    writeFileSync(path, JSON.stringify(snap, null, 2) + "\n");
    return { ok: true, message: `สร้าง ${SALE_CONTRACT} ครั้งแรก` };
  }
  const snap = JSON.parse(readFileSync(path, "utf8")) as SaleContract;
  const d = diffSaleContract(snap, cur, callers);
  if (d.red.length) return { ok: false, message: `ยังแดง ${d.red.length} ข้อ — --update-pos-contract เติมได้อย่างเดียว ไม่ลบ/ไม่แก้ของเดิม: ${d.red.join(" · ")}` };
  for (const [n, sig] of Object.entries(cur.fns)) {
    if (!sig) continue;
    const s = snap.functions[n];
    if (!s) snap.functions[n] = sig;
    else s.params.push(...sig.params.slice(s.params.length)); // ต่อท้ายเฉพาะพารามิเตอร์ใหม่แบบไม่บังคับ (ที่ผ่าน diff แล้ว)
  }
  for (const [tn, fields] of Object.entries(cur.types)) {
    if (!fields) continue;
    const s = (snap.types[tn] ??= {});
    for (const [f, v] of Object.entries(fields)) if (!s[f]) s[f] = v;
  }
  snap.callers = callers;
  writeFileSync(path, JSON.stringify(snap, null, 2) + "\n");
  return { ok: true, message: `เติม ${d.additions.length} รายการ${d.additions.length ? `: ${d.additions.join(", ")}` : ""} · ผู้เรียกอัปเดตแล้ว` };
}

// ═══════════════════════════════════════════════════════════════
// F15.3 — ทะเบียนปุ่ม POS
// ═══════════════════════════════════════════════════════════════
export const POS_INVENTORY = "scripts/pos-ui-inventory.json";
const CRM_INVENTORY = "scripts/crm-ui-inventory.json";
const POS_SEARCH_ROOTS = ["src/app", "src/components", "src/lib/modules"];
/** โฟลเดอร์ยึด (มีจริงวันนี้ — ตัวค้นหาต้องเจอเสมอ ไม่งั้นตัวค้นหาพัง) */
const POS_ANCHOR_DIRS = ["src/lib/modules/pos", "src/app/app/sys/[id]/pos"];
const MIN_PATTERN_CHARS = 4;

/** ทุกโฟลเดอร์ที่ชื่อ segment = "pos" เป๊ะ ๆ ใต้ src/app · src/components · src/lib/modules (P1.x สร้างหน้าใหม่ = ถูกกวาดเอง) */
function discoverPosDirs(ROOT: string): string[] {
  const out = new Set<string>();
  for (const root of POS_SEARCH_ROOTS) {
    const abs = join(ROOT, root);
    if (!existsSync(abs)) continue;
    const stack = [abs];
    while (stack.length) {
      const d = stack.pop()!;
      for (const e of readdirSync(d)) {
        if (e === "node_modules" || e === ".next" || e === ".git") continue;
        const child = join(d, e);
        if (!statSync(child).isDirectory()) continue;
        if (e === "pos") {
          out.add(relative(ROOT, child));
          continue;
        }
        stack.push(child);
      }
    }
  }
  return [...out].sort();
}

/** element ที่กดได้แต่ไม่มี data-testid (นิยาม "กดได้" เดียวกับ F14 · ไม่นับ <option> · ไม่นับ generic ของ TS) */
export function untestidControls(src0: string): string[] {
  const src = stripComments(src0);
  const hits: string[] = [];
  for (const m of src.matchAll(/<([A-Za-z][\w.]*)(?=[\s>/])/g)) {
    const at = m.index ?? 0;
    if (/[\w$)\]]/.test(src[at - 1] ?? "")) continue; // `useState<T>` · `Record<K,V>` = generic ไม่ใช่ JSX
    const tag = m[1]!;
    if (tag === "option") continue;
    const { attrs } = tagAround(src, at + 1);
    if (!isInteractive(tag, attrs) || /data-testid\s*=/.test(attrs)) continue;
    hits.push(`<${tag}>@${lineOf(src, at)}`);
  }
  return hits;
}

type Inv = { rows: unknown[]; foreign: { testid: string; owner: string }[]; debt: { file: string; untestid: number }[] };
function readInventory(ROOT: string): { inv: Inv | null; err: string } {
  try {
    const p = join(ROOT, POS_INVENTORY);
    if (!existsSync(p)) throw new Error(`ไม่พบ ${POS_INVENTORY}`);
    const j = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    if (!Array.isArray(j.rows)) throw new Error(`${POS_INVENTORY} ต้องมีคีย์ "rows" เป็น array`);
    const fItems = (j.$foreign as { items?: unknown } | undefined)?.items;
    const dItems = (j.baselineDebt as { items?: unknown } | undefined)?.items;
    if (!Array.isArray(fItems) || !Array.isArray(dItems)) throw new Error(`${POS_INVENTORY} ต้องมี $foreign.items และ baselineDebt.items เป็น array`);
    return { inv: { rows: j.rows, foreign: fItems as Inv["foreign"], debt: dItems as Inv["debt"] }, err: "" };
  } catch (e) {
    return { inv: null, err: e instanceof Error ? e.message.slice(0, 200) : String(e) };
  }
}

// ═══════════════════════════════════════════════════════════════
// F15.4 — ข้อความ pos.* สองภาษา
// ═══════════════════════════════════════════════════════════════
function posMessages(ROOT: string, locale: string): { keys: Map<string, unknown>; files: string[]; err: string } {
  const keys = new Map<string, unknown>();
  const files: string[] = [];
  const dir = join(ROOT, "src", "messages", locale);
  const flat = (o: unknown, prefix: string) => {
    if (o && typeof o === "object" && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) flat(v, `${prefix}.${k}`);
    else keys.set(prefix, o);
  };
  try {
    for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith(".json")).sort() : []) {
      const j = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>;
      if (f === "pos.json") {
        files.push(`${locale}/${f}`);
        flat(j, "pos");
      } else if (j && typeof j === "object" && "pos" in j) {
        files.push(`${locale}/${f}#pos`);
        flat(j.pos, "pos");
      }
    }
    // รูปแบบไฟล์เดียว src/messages/<locale>.json (เผื่ออนาคต)
    const single = join(ROOT, "src", "messages", `${locale}.json`);
    if (existsSync(single)) {
      const j = JSON.parse(readFileSync(single, "utf8")) as Record<string, unknown>;
      if (j && typeof j === "object" && "pos" in j) {
        files.push(`${locale}.json#pos`);
        flat(j.pos, "pos");
      }
    }
    return { keys, files, err: "" };
  } catch (e) {
    return { keys, files, err: e instanceof Error ? e.message.slice(0, 160) : String(e) };
  }
}

// ═══════════════════════════════════════════════════════════════
// ตัวรวม
// ═══════════════════════════════════════════════════════════════
export function runPosFitness(chk: PosChk, ROOT: string): void {
  console.log("\n── F15: POS (แคตตาล็อกผู้เขียนเดียว · สัญญา createSale · ทะเบียนปุ่ม POS · ข้อความ pos.* สองภาษา) ──");

  // ── F15.1 ──
  {
    const writers = scanCatalogWriters(ROOT);
    const files = new Set(writers.map((w) => w.file));
    const fresh = writers.filter((w) => w.file !== CATALOG_WRITER && !CATALOG_WRITER_BASELINE.has(w.file));
    const healed = [...CATALOG_WRITER_BASELINE.keys()].filter((f) => !files.has(f));
    const problems = [
      fresh.length ? `ผู้เขียนแคตตาล็อกใหม่นอก ${CATALOG_WRITER} ${fresh.length} ไฟล์: ${fresh.map((w) => `${w.file} [${w.hits.slice(0, 3).join(", ")}]`).join(" · ")} → ย้ายไปเรียก catalog.ts (POS-brief-COMMON ข้อ 3)` : "",
      healed.length ? `CATALOG_WRITER_BASELINE มีไฟล์ที่ไม่เขียนแล้ว ถอดออก (ratchet): ${healed.join(", ")}` : "",
    ].filter(Boolean);
    chk(
      "F15.1",
      `แคตตาล็อกมีผู้เขียนที่เดียว: menuItem/shopProduct write + AccountProduct.salePrice นอก catalog.ts ∪ baseline (หนี้เดิม ${CATALOG_WRITER_BASELINE.size} ไฟล์)`,
      problems.length === 0,
      problems.length ? problems.join(" · ") : `ตรง (ผู้เขียน ${writers.length} ไฟล์: ${writers.map((w) => `${w.file}×${w.hits.length}`).join(", ")})`,
      "CRITICAL",
    );
  }

  // ── F15.2 ──
  {
    const cur = readSaleContract(ROOT);
    const callers = scanSaleCallers(ROOT);
    const path = join(ROOT, SALE_CONTRACT);
    let ok = false;
    let detail = "";
    if (!existsSync(path)) {
      detail = `ไม่พบ snapshot ${SALE_CONTRACT} — สร้างด้วย \`pnpm exec tsx scripts/fitness-pos.mts --update-pos-contract\``;
    } else {
      let snap: SaleContract | null = null;
      try {
        snap = JSON.parse(readFileSync(path, "utf8")) as SaleContract;
        if (!snap.functions || !snap.types) throw new Error("ไม่มีคีย์ functions/types");
      } catch (e) {
        detail = `อ่าน ${SALE_CONTRACT} ไม่ได้ — ${e instanceof Error ? e.message : e}`;
      }
      if (snap) {
        const d = diffSaleContract(snap, cur, callers);
        ok = d.red.length === 0;
        const nFields = Object.values(snap.types).reduce((a, t) => a + Object.keys(t).length, 0);
        detail = ok
          ? `ตรง (${Object.keys(snap.functions).join("/")} · ${nFields} ฟิลด์ · ผู้เรียก createSale ${callers.createSale?.length ?? 0} ไฟล์)${d.additions.length ? ` · ของใหม่แบบไม่บังคับ ${d.additions.length}: ${d.additions.join(", ")} → รัน --update-pos-contract` : ""}${d.info.length ? ` · ${d.info.join(" · ")}` : ""}`
          : d.red.join(" · ");
      }
    }
    chk("F15.2", `สัญญา createSale/voidSale/refundSale ใน ${SALE_SERVICE} เข้ากันได้ย้อนหลังกับ ${SALE_CONTRACT}`, ok, detail, "CRITICAL");
  }

  // ── F15.3 ──
  {
    const { inv, err } = readInventory(ROOT);
    const dirs = discoverPosDirs(ROOT);
    const foreignIds = new Set((inv?.foreign ?? []).map((f) => f.testid));
    type Found = { id: string; file: string; interactive: boolean };
    const found: Found[] = [];
    const unreadable: { file: string; line: number; snippet: string; interactive: boolean }[] = [];
    const debtNow = new Map<string, string[]>();
    let scanned = 0;
    for (const d of dirs) {
      for (const abs of walk(join(ROOT, d), (p) => p.endsWith(".tsx") || p.endsWith(".ts"))) {
        scanned++;
        const file = relative(ROOT, abs);
        const src = readFileSync(abs, "utf8");
        const readAt = new Set<number>();
        for (const m of src.matchAll(TESTID_RE)) {
          readAt.add(m.index ?? -1);
          const { tag, attrs } = tagAround(src, m.index ?? 0);
          found.push({ id: normId(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? ""), file, interactive: isInteractive(tag, attrs) });
        }
        for (const m of src.matchAll(ANY_TESTID_RE)) {
          const at = m.index ?? -1;
          if (readAt.has(at)) continue;
          const { tag, attrs } = tagAround(src, at);
          unreadable.push({ file, line: lineOf(src, at), snippet: src.slice(at, at + 50).split("\n")[0]!, interactive: isInteractive(tag, attrs) });
        }
        if (abs.endsWith(".tsx")) {
          const u = untestidControls(src);
          if (u.length) debtNow.set(file, u);
        }
      }
    }
    const rows = inv?.rows ?? [];
    const rowObj = (r: unknown) => (typeof r === "object" && r !== null ? (r as Record<string, unknown>) : null);
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const malformed = rows.map((r, i) => ({ i, r })).filter(({ r }) => !rowObj(r) || !str(rowObj(r)!.testid) || !str(rowObj(r)!.page) || !str(rowObj(r)!.kind));
    const rowIdsAll = rows.map((r) => str(rowObj(r)?.testid)).filter((x): x is string => !!x);
    const degenerate = rowIdsAll.filter((id) => id.includes("*") && id.replace(/\*/g, "").length < MIN_PATTERN_CHARS);
    const rowIds = rowIdsAll.filter((id) => !degenerate.includes(id));
    const rowExact = new Set(rowIds.filter((id) => !id.includes("*")));
    const rowPatterns = rowIds.filter((id) => id.includes("*")).map((id) => ({ id, re: globRe(id) }));
    const own = found.filter((f) => !foreignIds.has(f.id));
    const codeExact = new Set(own.map((f) => f.id).filter((id) => !id.includes("*")));
    const codePatterns = own.map((f) => f.id).filter((id) => id.includes("*")).map((id) => ({ id, re: globRe(id) }));
    const registered = (id: string) => rowExact.has(id) || (id.includes("*") && rowPatterns.some((r) => r.re.test(id) || globRe(id).test(r.id)));
    const inCode = (id: string) => (id.includes("*") ? codePatterns.some((c) => c.re.test(id) || globRe(id).test(c.id)) : codeExact.has(id) || codePatterns.some((c) => c.re.test(id)));
    const interactive = [...new Map(own.filter((f) => f.interactive).map((f) => [`${f.id}@${f.file}`, f])).values()];
    const unregistered = interactive.filter((f) => !registered(f.id));
    const unreadableInteractive = unreadable.filter((u) => u.interactive);
    const ghosts = rowIds.filter((id) => !inCode(id));
    const dupes = [...new Set(rowIds.filter((id, i) => rowIds.indexOf(id) !== i))];
    const foreignDup = rowIds.filter((id) => foreignIds.has(id));
    // ของทะเบียนอื่น: ต้องมีจริงในไฟล์ POS · ถ้ากดได้ต้องมีแถวในทะเบียนเจ้าของ
    const foreignProblems: string[] = [];
    let crmRowIds = new Set<string>();
    try {
      const cj = JSON.parse(readFileSync(join(ROOT, CRM_INVENTORY), "utf8")) as { rows?: { testid?: string }[] };
      crmRowIds = new Set((cj.rows ?? []).map((r) => r.testid ?? ""));
    } catch {
      /* ไม่มีทะเบียน CRM = รายงานด้านล่างถ้ามี foreign ที่กดได้ */
    }
    for (const f of inv?.foreign ?? []) {
      const hits = found.filter((x) => x.id === f.testid);
      if (!hits.length) foreignProblems.push(`${f.testid} (ประกาศเป็นของ ${f.owner} แต่ไม่มีในโค้ด POS)`);
      else if (hits.some((h) => h.interactive) && f.owner === CRM_INVENTORY && !crmRowIds.has(f.testid)) foreignProblems.push(`${f.testid} (กดได้ แต่ไม่มีแถวใน ${f.owner})`);
    }
    // หนี้ปุ่มไม่มี testid (ratchet ต่อไฟล์)
    const debtBase = new Map((inv?.debt ?? []).map((d) => [d.file, d.untestid]));
    const debtUp: string[] = [];
    const debtDown: string[] = [];
    for (const [file, list] of debtNow) {
      const base = debtBase.get(file) ?? 0;
      if (list.length > base) debtUp.push(`${file} ${base}→${list.length} (${list.slice(0, 6).join(" ")}${list.length > 6 ? " …" : ""})`);
    }
    for (const [file, base] of debtBase) {
      const now = debtNow.get(file)?.length ?? 0;
      if (now < base) debtDown.push(`${file} ${base}→${now}`);
    }
    const anchorMissed = POS_ANCHOR_DIRS.filter((d) => existsSync(join(ROOT, d)) && !dirs.includes(d));
    const p1 = [
      err ? `อ่านทะเบียนไม่ได้ — ${err}` : "",
      anchorMissed.length ? `ตัวค้นหาโฟลเดอร์ POS พัง — หาโฟลเดอร์ที่มีจริงไม่เจอ: ${anchorMissed.join(", ")}` : "",
      dirs.length > 0 && scanned === 0 ? `พบโฟลเดอร์ ${dirs.join(", ")} แต่สแกนไม่ได้สักไฟล์` : "",
      unregistered.length ? `${unregistered.length} ตัวไม่มีแถว: ${unregistered.slice(0, 10).map((f) => `${f.id} (${f.file})`).join(" · ")} → เพิ่มแถวใน ${POS_INVENTORY}` : "",
      unreadableInteractive.length ? `${unreadableInteractive.length} จุดเขียน data-testid ด้วยค่าที่อ่านไม่ออก: ${unreadableInteractive.slice(0, 6).map((u) => `${u.file}:${u.line} ${u.snippet}`).join(" · ")}` : "",
      debtUp.length ? `ปุ่ม/ช่องที่กดได้แต่ไม่มี data-testid เพิ่มขึ้น (ใส่ testid + แถวทะเบียน): ${debtUp.join(" · ")}` : "",
    ].filter(Boolean);
    const totalDebt = [...debtNow.values()].reduce((a, l) => a + l.length, 0);
    chk(
      "F15.3a",
      `ปุ่ม POS ที่มี data-testid มีแถวใน ${POS_INVENTORY} ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน ${scanned} ไฟล์ใน ${dirs.length} โฟลเดอร์: ${dirs.join(", ") || "-"} · หนี้ไร้ testid ${totalDebt})`,
      p1.length === 0,
      p1.length ? p1.join(" · ") : `ครบ (testid กดได้ ${interactive.length} · แถว ${rowIds.length} · ของทะเบียนอื่น ${foreignIds.size})`,
      "CRITICAL",
    );
    const p2 = [
      err ? `อ่านทะเบียนไม่ได้ — ${err}` : "",
      ghosts.length ? `แถวผี ${ghosts.length} (ไม่มี testid นี้ในโค้ด POS): ${ghosts.slice(0, 10).join(", ")}` : "",
      dupes.length ? `แถวซ้ำ: ${dupes.join(", ")}` : "",
      foreignDup.length ? `แถวของทะเบียนอื่นถูกลงซ้ำที่นี่: ${foreignDup.join(", ")}` : "",
      degenerate.length ? `แถวแพตเทิร์นกว้างเกิน (ตัวอักษรที่ไม่ใช่ * ต้อง ≥ ${MIN_PATTERN_CHARS}): ${degenerate.join(", ")}` : "",
      malformed.length ? `แถวพิการ (ไม่มี testid/page/kind) ${malformed.length}: ${malformed.slice(0, 5).map((m) => `#${m.i} ${JSON.stringify(m.r).slice(0, 70)}`).join(" · ")}` : "",
      foreignProblems.length ? `$foreign ไม่ตรง: ${foreignProblems.join(" · ")}` : "",
      debtDown.length ? `baselineDebt มีไฟล์ที่ปิดหนี้ไปแล้ว ลดตัวเลขใน ${POS_INVENTORY} (ratchet): ${debtDown.join(" · ")}` : "",
    ].filter(Boolean);
    chk(
      "F15.3b",
      `ทุกแถวใน ${POS_INVENTORY} (${rowIds.length}) ชี้ testid ที่มีจริง · ไม่ซ้ำ · ไม่พิการ · baselineDebt ไม่เหลือหนี้ที่ปิดแล้ว`,
      p2.length === 0,
      p2.length ? p2.join(" · ") : "ตรง",
    );
  }

  // ── F15.4 ──
  {
    const th = posMessages(ROOT, "th");
    const en = posMessages(ROOT, "en");
    const problems: string[] = [];
    if (th.err || en.err) problems.push(`อ่านไฟล์ข้อความไม่ได้ — ${th.err || en.err}`);
    const onlyTh = [...th.keys.keys()].filter((k) => !en.keys.has(k));
    const onlyEn = [...en.keys.keys()].filter((k) => !th.keys.has(k));
    if (onlyTh.length) problems.push(`มีแต่ภาษาไทย ${onlyTh.length}: ${onlyTh.slice(0, 8).join(", ")}`);
    if (onlyEn.length) problems.push(`มีแต่ภาษาอังกฤษ ${onlyEn.length}: ${onlyEn.slice(0, 8).join(", ")}`);
    const empty = [...th.keys, ...en.keys].filter(([, v]) => typeof v !== "string" || !v.trim()).map(([k]) => k);
    if (empty.length) problems.push(`ค่าว่าง/ไม่ใช่ข้อความ ${empty.length}: ${[...new Set(empty)].slice(0, 8).join(", ")}`);
    const raw = [...th.keys].filter(([k, v]) => typeof v === "string" && (v.trim() === k || v.trim() === k.split(".").pop() || /^[A-Z_]+$/.test(v.trim()))).map(([k, v]) => `${k}="${v}"`);
    if (raw.length) problems.push(`ค่าภาษาไทยเป็นชื่อคีย์/enum ดิบ ${raw.length}: ${raw.slice(0, 8).join(", ")}`);
    chk(
      "F15.4",
      "ข้อความ pos.* มีครบทั้ง th/en · ไม่ว่าง · ภาษาไทยไม่ใช่ชื่อคีย์หรือ enum",
      problems.length === 0,
      problems.length ? problems.join(" · ") : th.keys.size === 0 && en.keys.size === 0 ? "0 คีย์ (namespace ยังไม่ถูกสร้าง)" : `ครบ ${th.keys.size} คีย์ (${[...th.files, ...en.files].join(", ")})`,
    );
  }
}

// ─────────────────── รันเดี่ยว (ด่าน F15 อย่างเดียว · หรือ --update-pos-contract) ───────────────────
const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href;
  } catch {
    return false;
  }
})();
if (isMain) {
  const ROOT = resolve(import.meta.dirname, "..");
  if (process.argv.includes("--update-pos-contract")) {
    const r = updateSaleContract(ROOT);
    console.log(`${r.ok ? "✅" : "❌"} --update-pos-contract: ${r.message}`);
    if (!r.ok) process.exit(1);
  }
  const res: { id: string; ok: boolean; detail: string; sev: PosSev }[] = [];
  runPosFitness((id, name, ok, detail, sev = "MAJOR") => {
    res.push({ id, ok, detail, sev });
    console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name} — ${detail}`);
  }, ROOT);
  const failed = res.filter((r) => !r.ok);
  console.log(`\nJSON_SUMMARY ${JSON.stringify({ suite: "fitness-pos", total: res.length, passed: res.length - failed.length, findings: failed })}`);
  process.exit(failed.some((f) => f.sev !== "MINOR") ? 1 : 0);
}
