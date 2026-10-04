// fitness-pos.mts — ด่าน fitness ของ RUN POS (F15.1–F15.4 · ใบ P0.1 รอบ 2)
//
// เรียกจาก `scripts/fitness.mts` (บล็อก `// POS P0.1 ▸ … ◂` หลัง F14) ผ่าน `runPosFitness(chk, ROOT)`
// หรือรันเดี่ยว: `pnpm exec tsx scripts/fitness-pos.mts [--update-pos-contract] [--print-catalog-writers]`
//
//   F15.1 แคตตาล็อก/ราคามีผู้เขียนที่เดียว — นับ "จุดเขียน" (call site) ต่อไฟล์ต่อชนิด ด้วย TypeScript AST:
//         ทุก write ของ MenuItem · MenuCategory · MenuOptionGroup · MenuOptionChoice · MenuItemOptionGroup · ShopProduct
//         + write ที่ตั้งราคา: AccountProduct.salePrice/posPrice · InvItem.priceSatang · BookingService.priceSatang
//         (data ที่ไม่ใช่ object literal / มี spread = นับเป็นผู้ตั้งราคา — fail-closed)
//         + nested relation write ที่ไปถึงโมเดลเหล่านั้น + SQL ดิบ + delegate ไดนามิก
//         นอก «src/lib/modules/pos/catalog.ts» ต้องอยู่ใน CATALOG_WRITER_BASELINE ด้วย "จำนวนเท่ากันเป๊ะ"
//         (เพิ่ม = ผู้เขียนใหม่ แดง · ลด = ปิดหนี้แล้วต้องลดตัวเลข แดง) · P1.1b ทำ baseline ให้ว่าง · สแกนเฉพาะ src/
//   F15.2 สัญญา createSale/voidSale/(refundSale) เข้ากันได้ย้อนหลัง — เทียบ snapshot `scripts/pos-sale-contract.json`
//         ด้วย TypeScript parser · แยกทิศ: ขาเข้า (พารามิเตอร์ · CreateSaleInput · MemberSaleChoices) / ขาออก (SaleResult · return)
//         · ทุก overload · snapshot หาย = แดง
//   F15.3 ทะเบียนปุ่ม POS ซื่อสัตย์ (F15.3a ครบ · F15.3b ตรงโค้ด) — ตัวสแกน testid ของ F14 (import อย่างเดียว) +
//         หนี้ "ปุ่มไร้ testid" นับด้วย JSX AST ต่อไฟล์ต่อชื่อแท็ก (ratchet สองทาง)
//   F15.4 ข้อความ pos.* สองภาษา — ครบสองฝั่ง ไม่ว่าง · ค่าภาษาไทยต้องมีอักษรไทย (ยกเว้นคำสากลใน UNIVERSAL_TOKENS)
//   F15.5 ตัวบ่งชี้ผู้เรียกระดับระบบของแคตตาล็อก (P1.1a R3–R5) — ไม่หลุดถึงโค้ดที่รับคำขอ · ห้ามเป็นค่าสำรอง/ค่าปริยาย/alias ที่ส่งออก
//   F15.6 `src/**` ห้าม import จาก `scripts/**` (static · `import()` · `require` · `import x = require` · `typeof import()`) (P1.1a R5)
//
// 🔴 static ล้วน: อ่านไฟล์อย่างเดียว · ไม่แตะ DB/เน็ต · ไม่ import `@/…` หรือ `src/lib/env` (pre-commit ไม่มี env — X12)
// 🔴 ทุกด่านห่อ try/catch — ไฟล์พัง/JSON เสีย = ด่านนั้นแดงพร้อมข้อความ ไม่ล้มทั้ง fitness
// 🔴 ไฟล์เดียวที่เขียนได้ = `scripts/pos-sale-contract.json` และเฉพาะเมื่อสั่ง `--update-pos-contract`

import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
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
    let st;
    try {
      st = statSync(p);
    } catch {
      continue; // symlink เสีย — ข้าม (ไม่ใช่ไฟล์ที่ใครเขียนโค้ดอยู่)
    }
    if (st.isDirectory()) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}
/** parse ไฟล์ด้วย TypeScript (ไม่มี type checker · เร็ว) — คอมเมนต์/สตริงไม่ใช่โค้ดโดยธรรมชาติของ AST */
function parse(abs: string, text?: string): ts.SourceFile {
  const kind = abs.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(abs, text ?? readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true, kind);
}
const lineAt = (sf: ts.SourceFile, n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
function unwrap(e: ts.Expression): ts.Expression {
  let x = e;
  while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isNonNullExpression(x) || ts.isSatisfiesExpression(x) || ts.isTypeAssertionExpression(x)) x = x.expression;
  return x;
}
const propName = (n: ts.PropertyName | ts.BindingName | undefined): string | null =>
  !n ? null : ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isNumericLiteral(n) ? n.text : null;

/** ห่อด่าน: ข้อผิดพลาดใด ๆ = ด่านนั้นแดงพร้อมข้อความ (ไม่ทำให้ fitness ทั้งไฟล์ล้ม) */
function guarded(chk: PosChk, id: string, name: string, fn: () => void) {
  try {
    fn();
  } catch (e) {
    chk(id, name, false, `ด่านนี้พังระหว่างตรวจ — ${e instanceof Error ? e.message.slice(0, 240) : String(e)}`, "CRITICAL");
  }
}

// ═══════════════════════════════════════════════════════════════
// F15.1 — ผู้เขียนแคตตาล็อก/ราคา
// ═══════════════════════════════════════════════════════════════
/** ที่เดียวที่ได้เขียนแคตตาล็อกหลัง P1.1 (ยังไม่มีไฟล์ ณ P0.1) */
export const CATALOG_WRITER = "src/lib/modules/pos/catalog.ts";
/**
 * POS P1.1b ▸ G1 ชุดผู้เขียนแคตตาล็อก = catalog.ts + catalog-legacy.ts (ผู้เขียนคนที่สอง: ประตูเดิมส่ง tx ของตัวเองมา — คำสั่งเขียนตารางเดิม
 * ย้ายมาที่นี่พร้อมฝั่ง PosProduct ในธุรกรรมเดียว) ◂
 */
export const CATALOG_WRITERS: readonly string[] = [CATALOG_WRITER, "src/lib/modules/pos/catalog-legacy.ts"];
/** โมเดลที่ "ทุก write" นับ (ต้นฉบับแคตตาล็อกเมนู/เว็บร้าน) */
const ALL_WRITE_MODELS = ["MenuItem", "MenuCategory", "MenuOptionGroup", "MenuOptionChoice", "MenuItemOptionGroup", "ShopProduct"] as const;
/** โมเดลที่นับเฉพาะ write ที่ตั้ง "ราคา" (ฟิลด์ที่ระบุ) — data ไม่ใช่ literal = นับ (fail-closed) */
const PRICE_MODELS: Record<string, readonly string[]> = {
  AccountProduct: ["salePrice", "posPrice"],
  InvItem: ["priceSatang"],
  // POS P1.1b ▸ มติ 2 (G9): BookingService ไม่ใช่ตารางแคตตาล็อก — ราคาเป็นสำเนาที่ serviceRoster ดึงจาก InvItem ตอนอ่าน (ทางย้อนเขียน InvItem) ◂
};
/**
 * POS P1.1b ▸ มติ 2: ไฟล์ที่ยกเว้นจาก F15.1 พร้อมเหตุผล (ไม่ใช่การเขียนแคตตาล็อก — ตัวสแกน static แยกไม่ได้)
 *   ใส่ได้เฉพาะเมื่อผู้คุมงานรับรอง · ห้ามใช้หลบผู้เขียนจริง ◂
 */
export const CATALOG_WRITER_EXEMPT: ReadonlyMap<string, string> = new Map([
  ["src/lib/platform/pdpa.ts", "ลบข้อมูลทั้งร้านตาม PDPA ผ่าน delegate ไดนามิก (ทุกโมเดลของร้าน) — ไม่ใช่การเขียนแคตตาล็อกรายแถว · ข้อมูลทั้งร้านหายพร้อมแถวแคตตาล็อก"],
]);
const WRITE_METHODS = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"]);
const NESTED_OPS = new Set(["create", "createMany", "update", "updateMany", "upsert", "connectOrCreate", "delete", "deleteMany", "set"]);
/** ชื่อตัวแปรที่ถือว่าเป็น client ของ Prisma เมื่อเจอ `x[ไม่ใช่ literal].<write>(` (delegate ไดนามิก) */
const CLIENT_NAMES = /^(prisma|tx|db|client|P|p|trx|tenantDb)$/;

/**
 * ผู้เขียนเดิม — ต่อไฟล์ต่อชนิด = จำนวน call site (ตรวจจากโค้ดจริงด้วยตัวสแกนนี้ 1 ต.ค. 2569 · พิมพ์ซ้ำได้ด้วย --print-catalog-writers)
 * ratchet: จำนวนจริงต้อง = ตัวเลขที่นี่ · P1.1b ย้ายเข้า catalog.ts แล้วลบแถวออก (เป้า = ว่าง)
 */
export const CATALOG_WRITER_BASELINE: Record<string, Record<string, number>> = {
  // POS P1.1b ▸ restaurant/menu.ts + restaurant/order.ts ย้ายเข้า catalog-legacy.ts แล้ว (G2 · G8) ◂
  // POS P1.1b ▸ shop/service.ts createProduct/updateProduct ย้ายเข้า catalog-legacy.ts แล้ว ◂
  // ราคาขาย POS หน้า "สินค้า/ราคา": updateAccountProductSalePrice · createAccountProductWithSalePrice
  "src/lib/modules/account/service.ts": { "AccountProduct.price": 2 },
  // POS P1.1b ▸ account/product.ts createProduct/updateProduct/archiveProduct ย้ายเข้า catalog-legacy.ts แล้ว ◂
  // POS P1.1b ▸ account/inventory-link.ts ซิงก์ลิงก์คลัง↔บัญชี ย้ายเข้า catalog-legacy.ts / inventory.applyAccountProductSync แล้ว (มติ 2) ◂
  // POS P1.1b ▸ inventory/service.ts createItem/updateItem ย้ายเข้า catalog-legacy.ts แล้ว ◂
  // POS P1.1b ▸ booking/service.ts (BookingService ออกจาก PRICE_MODELS) · platform/pdpa.ts (CATALOG_WRITER_EXEMPT) — มติ 2 ◂
};

/** แผนที่ความสัมพันธ์จาก prisma/schema: Model → { field → Model ปลายทาง } + รายชื่อ delegate ทั้งหมด */
function readSchema(ROOT: string): { delegates: Map<string, string>; rel: Map<string, Map<string, string>> } {
  const delegates = new Map<string, string>(); // delegate (camel) → Model
  const rel = new Map<string, Map<string, string>>();
  const files = walk(join(ROOT, "prisma", "schema"), (p) => p.endsWith(".prisma"));
  const blocks: [string, string][] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) blocks.push([m[1]!, m[2]!]);
  }
  for (const [name] of blocks) delegates.set(name[0]!.toLowerCase() + name.slice(1), name);
  const models = new Set(blocks.map(([n]) => n));
  for (const [name, body] of blocks) {
    const map = new Map<string, string>();
    for (const line of body.split("\n")) {
      const m = /^\s*(\w+)\s+(\w+)(\[\]|\?)?(\s|$)/.exec(line);
      if (m && models.has(m[2]!)) map.set(m[1]!, m[2]!);
    }
    rel.set(name, map);
  }
  return { delegates, rel };
}

export type WriteHit = { kind: string; line: number; why: string };
export type CatalogWriter = { file: string; hits: WriteHit[] };

/** วิเคราะห์ไฟล์เดียว (ใช้กับ fixture ของข้อพิสูจน์ด้านลบได้) */
export function scanFileWrites(sf: ts.SourceFile, schema: ReturnType<typeof readSchema>): WriteHit[] {
  const hits: WriteHit[] = [];
  const { delegates, rel } = schema;
  const tracked = (model: string) => (ALL_WRITE_MODELS as readonly string[]).includes(model) || model in PRICE_MODELS;
  // ── ตัวแปร/พารามิเตอร์ที่ถือ delegate (`const d = tx.menuItem` · `const { menuItem } = prisma` · `d: Prisma.MenuItemDelegate`)
  const varDelegate = new Map<string, string>();
  const visitDecl = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && n.initializer) {
      const init = unwrap(n.initializer);
      if (ts.isIdentifier(n.name)) {
        const d = delegateOf(init);
        if (d) varDelegate.set(n.name.text, d);
      } else if (ts.isObjectBindingPattern(n.name)) {
        for (const el of n.name.elements) {
          const key = propName(el.propertyName) ?? propName(el.name);
          if (key && delegates.has(key) && ts.isIdentifier(el.name)) varDelegate.set(el.name.text, delegates.get(key)!);
        }
      }
    }
    if (ts.isParameter(n) && ts.isIdentifier(n.name) && n.type) {
      const m = /(\w+)Delegate\b/.exec(n.type.getText(sf));
      if (m && delegates.has(m[1]![0]!.toLowerCase() + m[1]!.slice(1))) varDelegate.set(n.name.text, delegates.get(m[1]![0]!.toLowerCase() + m[1]!.slice(1))!);
    }
    ts.forEachChild(n, visitDecl);
  };
  function delegateOf(e: ts.Expression): string | null {
    const x = unwrap(e);
    if (ts.isPropertyAccessExpression(x) && delegates.has(x.name.text)) return delegates.get(x.name.text)!;
    if (ts.isElementAccessExpression(x) && ts.isStringLiteralLike(x.argumentExpression) && delegates.has(x.argumentExpression.text)) return delegates.get(x.argumentExpression.text)!;
    if (ts.isIdentifier(x) && varDelegate.has(x.text)) return varDelegate.get(x.text)!;
    return null;
  }
  visitDecl(sf);

  const objProps = (o: ts.ObjectLiteralExpression) => {
    const map = new Map<string, ts.Expression>();
    let opaque = false;
    for (const p of o.properties) {
      if (ts.isPropertyAssignment(p)) {
        const k = propName(p.name);
        if (k === null) opaque = true;
        else map.set(k, p.initializer);
      } else if (ts.isShorthandPropertyAssignment(p)) map.set(p.name.text, p.name);
      else if (ts.isSpreadAssignment(p)) opaque = true;
    }
    return { map, opaque };
  };
  /** payload ของ write (ค่าของ data) ต่อโมเดล — คืนเหตุผลถ้าเป็นการตั้งราคา (หรือ null) และไล่ nested ต่อ */
  function payload(model: string, node: ts.Expression | undefined, where: string, line: number): string | null {
    if (!node) return null;
    const x = unwrap(node);
    const priceFields = PRICE_MODELS[model];
    if (ts.isArrayLiteralExpression(x)) {
      let why: string | null = null;
      for (const el of x.elements) why = payload(model, ts.isSpreadElement(el) ? el.expression : el, where, line) ?? why;
      return why;
    }
    if (!ts.isObjectLiteralExpression(x)) return priceFields ? `data ไม่ใช่ object literal (${ts.SyntaxKind[x.kind]}) — fail-closed` : null;
    const { map, opaque } = objProps(x);
    nested(model, map, line);
    if (!priceFields) return null;
    const hit = priceFields.find((f) => map.has(f));
    if (hit) return `ตั้ง ${hit}`;
    if (opaque) return "data มี spread/คีย์คำนวณ — fail-closed";
    return null;
  }
  /** nested relation write: field ของ model ที่ชี้ไปโมเดลที่ติดตาม (หรือไล่ลึกต่อผ่านโมเดลอื่น) */
  function nested(model: string, props: Map<string, ts.Expression>, line: number) {
    const rmap = rel.get(model);
    if (!rmap) return;
    for (const [field, val] of props) {
      const target = rmap.get(field);
      if (!target) continue;
      const v = unwrap(val);
      if (!ts.isObjectLiteralExpression(v)) continue;
      const { map: ops } = objProps(v);
      for (const [op, opVal] of ops) {
        if (!NESTED_OPS.has(op)) continue;
        if ((ALL_WRITE_MODELS as readonly string[]).includes(target)) {
          hits.push({ kind: `nested:${model}.${field}→${target}`, line, why: `nested ${op}` });
          continue;
        }
        // ปลายทางที่ติดตามราคา / หรือโมเดลอื่น (ไล่ลึก): ค่าของ op = payload หรือ { data } / { create, update } / { where, create }
        const ov = unwrap(opVal);
        const subs: ts.Expression[] = [];
        if (ts.isObjectLiteralExpression(ov)) {
          const { map: inner } = objProps(ov);
          if (inner.has("data")) subs.push(inner.get("data")!);
          else if (inner.has("create") || inner.has("update")) {
            if (inner.has("create")) subs.push(inner.get("create")!);
            if (inner.has("update")) subs.push(inner.get("update")!);
          } else subs.push(ov);
        } else subs.push(ov);
        for (const s of subs) {
          if (op.startsWith("delete") || op === "set") continue;
          const why = payload(target, s, `nested ${model}.${field}`, line);
          if (why && target in PRICE_MODELS) hits.push({ kind: `nested:${model}.${field}→${target}.price`, line, why: `nested ${op}: ${why}` });
        }
      }
    }
  }

  const visit = (n: ts.Node) => {
    // ── call `<recv>.<method>(…)` ──
    if (ts.isCallExpression(n)) {
      const callee = unwrap(n.expression);
      if (ts.isPropertyAccessExpression(callee) && WRITE_METHODS.has(callee.name.text)) {
        const method = callee.name.text;
        const recv = unwrap(callee.expression);
        const model = delegateOf(recv);
        const line = lineAt(sf, n);
        if (model) {
          const arg = n.arguments[0] ? unwrap(n.arguments[0]) : undefined;
          const argObj = arg && ts.isObjectLiteralExpression(arg) ? objProps(arg).map : null;
          const payloads: (ts.Expression | undefined)[] =
            method === "upsert" ? [argObj?.get("create"), argObj?.get("update")] : method.startsWith("delete") ? [] : [argObj?.get("data")];
          if ((ALL_WRITE_MODELS as readonly string[]).includes(model)) {
            hits.push({ kind: `${model}.write`, line, why: method });
            for (const p of payloads) payload(model, p, model, line); // nested ต่อ
          } else if (model in PRICE_MODELS) {
            if (!method.startsWith("delete")) {
              let why: string | null = arg && !ts.isObjectLiteralExpression(arg) ? `อาร์กิวเมนต์ไม่ใช่ object literal — fail-closed` : null;
              for (const p of payloads) why = payload(model, p, model, line) ?? why;
              if (why) hits.push({ kind: `${model}.price`, line, why: `${method}: ${why}` });
            }
          } else {
            for (const p of payloads) payload(model, p, model, line); // โมเดลอื่น: ไล่ nested อย่างเดียว
          }
        } else if (ts.isElementAccessExpression(recv) && !ts.isStringLiteralLike(recv.argumentExpression)) {
          const base = unwrap(recv.expression);
          const baseName = ts.isIdentifier(base) ? base.text : ts.isCallExpression(base) ? base.expression.getText(sf) : "";
          if (CLIENT_NAMES.test(baseName)) hits.push({ kind: "dynamic", line, why: `${recv.getText(sf).slice(0, 40)}.${method} — delegate ไดนามิก (fail-closed)` });
        }
      }
    }
    // ── SQL ดิบใน string/template ──
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) {
      const t = n.getText(sf);
      for (const m of t.matchAll(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"(\w+)"/g)) {
        const model = m[2]!;
        if ((ALL_WRITE_MODELS as readonly string[]).includes(model)) hits.push({ kind: `raw:${model}`, line: lineAt(sf, n), why: m[1]! });
        else if (model in PRICE_MODELS && PRICE_MODELS[model]!.some((f) => t.includes(`"${f}"`)) && !/DELETE/.test(m[1]!)) hits.push({ kind: `raw:${model}.price`, line: lineAt(sf, n), why: m[1]! });
      }
      if (ts.isTemplateExpression(n)) return; // ไม่ต้องลงไปใน span ซ้ำ
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

const PREFILTER = /menuItem|menuCategory|menuOption|shopProduct|accountProduct|invItem|bookingService|MenuItem|MenuCategory|MenuOption|ShopProduct|AccountProduct|InvItem|BookingService|Delegate/;
export function scanCatalogWriters(ROOT: string): CatalogWriter[] {
  const schema = readSchema(ROOT);
  const out: CatalogWriter[] = [];
  for (const abs of walk(join(ROOT, "src"), (p) => /\.(ts|tsx|mts)$/.test(p))) {
    const text = readFileSync(abs, "utf8");
    if (!PREFILTER.test(text)) continue;
    if (CATALOG_WRITER_EXEMPT.has(relative(ROOT, abs).replace(/\\/g, "/"))) continue; // POS P1.1b ▸ มติ 2 ◂
    const hits = scanFileWrites(parse(abs, text), schema);
    if (hits.length) out.push({ file: relative(ROOT, abs), hits });
  }
  return out;
}
const countKinds = (hits: WriteHit[]) => {
  const c: Record<string, number> = {};
  for (const h of hits) c[h.kind] = (c[h.kind] ?? 0) + 1;
  return c;
};

// ═══════════════════════════════════════════════════════════════
// F15.2 — สัญญา createSale / voidSale / refundSale
// ═══════════════════════════════════════════════════════════════
export const SALE_SERVICE = "src/lib/modules/pos/service.ts";
export const SALE_CONTRACT = "scripts/pos-sale-contract.json";
const REQUIRED_FNS = ["createSale", "voidSale"] as const;
const OPTIONAL_FNS = ["refundSale"] as const;
/** ทิศของชนิด: ขาเข้า = ผู้เรียกส่งมา (เพิ่มแบบไม่บังคับได้) · ขาออก = ผู้เรียกอ่าน (ห้ามหด/ห้ามกว้างขึ้น) */
const CONTRACT_TYPES: Record<string, "input" | "output"> = { CreateSaleInput: "input", MemberSaleChoices: "input", SaleResult: "output" };

type Field = { optional: boolean; type: string };
type Param = { name: string; optional: boolean; type: string };
type FnSig = { params: Param[]; returns: string };
export type SaleContract = {
  $note?: string;
  source: string;
  /** ชื่อฟังก์ชัน → ลายเซ็นทุก overload ตามลำดับ (ไม่มี overload = 1 ตัว = ตัว implementation) */
  functions: Record<string, FnSig[]>;
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

/** อ่านสัญญาจากโค้ดจริงด้วย TypeScript parser — ช่องที่หาไม่เจอ = null (ผู้เรียกตัดสินว่าแดง) */
export function readSaleContract(ROOT: string): { fns: Record<string, FnSig[] | null>; types: Record<string, Record<string, Field> | null>; error?: string } {
  const abs = join(ROOT, SALE_SERVICE);
  const fns: Record<string, FnSig[] | null> = {};
  const types: Record<string, Record<string, Field> | null> = {};
  for (const n of [...REQUIRED_FNS, ...OPTIONAL_FNS]) fns[n] = null;
  for (const n of Object.keys(CONTRACT_TYPES)) types[n] = null;
  if (!existsSync(abs)) return { fns, types, error: `ไม่พบ ${SALE_SERVICE}` };
  const sf = parse(abs);
  const isExported = (n: ts.Node) => !!ts.getModifiers(n as ts.HasModifiers)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const sigOf = (params: ts.NodeArray<ts.ParameterDeclaration>, ret: ts.TypeNode | undefined): FnSig => ({
    params: params.map((p) => ({ name: p.name.getText(sf), optional: !!p.questionToken || !!p.initializer, type: p.type ? norm(p.type.getText(sf)) : "any" })),
    returns: ret ? norm(ret.getText(sf)) : "(ไม่ระบุ)",
  });
  const overloads: Record<string, FnSig[]> = {};
  const impls: Record<string, FnSig> = {};
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && isExported(st) && st.name.text in fns) {
      if (st.body) impls[st.name.text] = sigOf(st.parameters, st.type);
      else (overloads[st.name.text] ??= []).push(sigOf(st.parameters, st.type));
    }
    if (ts.isVariableStatement(st) && isExported(st)) {
      for (const d of st.declarationList.declarations) {
        const nm = d.name.getText(sf);
        if (!(nm in fns) || !d.initializer) continue;
        const init = unwrap(d.initializer);
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) impls[nm] = sigOf(init.parameters, init.type);
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
  // มี overload = ผู้เรียกเห็นเฉพาะลายเซ็น overload (ตัว implementation มองไม่เห็นจากข้างนอก)
  for (const n of Object.keys(fns)) fns[n] = overloads[n]?.length ? overloads[n]! : impls[n] ? [impls[n]!] : null;
  return { fns, types };
}

/** ใครเรียก createSale/voidSale/refundSale (src นอก service.ts) — ข้อมูลให้ผู้ตรวจเห็น ไม่ตัดสิน */
export function scanSaleCallers(ROOT: string): Record<string, string[]> {
  const names = [...REQUIRED_FNS, ...OPTIONAL_FNS] as string[];
  const out: Record<string, string[]> = Object.fromEntries(names.map((n) => [n, [] as string[]]));
  for (const abs of walk(join(ROOT, "src"), (p) => /\.(ts|tsx)$/.test(p))) {
    const r = relative(ROOT, abs);
    if (r === SALE_SERVICE) continue;
    const text = readFileSync(abs, "utf8");
    if (!/createSale|voidSale|refundSale/.test(text)) continue;
    const found = new Set<string>();
    const v = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const c = unwrap(n.expression);
        const nm = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : "";
        if (names.includes(nm)) found.add(nm);
      }
      ts.forEachChild(n, v);
    };
    v(parse(abs, text));
    for (const n of found) out[n]!.push(r);
  }
  for (const n of names) out[n]!.sort();
  return out;
}

export type ContractDiff = { red: string[]; additions: string[]; info: string[] };
function diffParams(fn: string, idx: string, s: FnSig, c: FnSig, red: string[], additions: string[]) {
  // พารามิเตอร์ = ขาเข้า
  s.params.forEach((p, i) => {
    const q = c.params[i];
    if (!q) return red.push(`${fn}${idx}: พารามิเตอร์ที่ ${i + 1} "${p.name}" ถูกลบ`);
    if (q.name !== p.name) red.push(`${fn}${idx}: พารามิเตอร์ที่ ${i + 1} เปลี่ยนชื่อ "${p.name}" → "${q.name}"`);
    if (q.type !== p.type) red.push(`${fn}${idx}: พารามิเตอร์ "${p.name}" เปลี่ยนชนิด "${p.type}" → "${q.type}"`);
    if (p.optional && !q.optional) red.push(`${fn}${idx}: พารามิเตอร์ "${p.name}" เปลี่ยนจากไม่บังคับเป็นบังคับ`);
  });
  c.params.slice(s.params.length).forEach((q) => {
    if (!q.optional) red.push(`${fn}${idx}: เพิ่มพารามิเตอร์บังคับใหม่ "${q.name}" (ผู้เรียกเดิมพัง)`);
    else additions.push(`${fn}${idx}(…, ${q.name}?)`);
  });
  // ผลลัพธ์ = ขาออก: เปลี่ยนข้อความชนิด = แดง (รวมการเติม `| undefined`/`| null`)
  if (c.returns !== s.returns) red.push(`${fn}${idx}: ชนิดผลลัพธ์ (ขาออก) เปลี่ยน "${s.returns}" → "${c.returns}"`);
}
export function diffSaleContract(snap: SaleContract, cur: ReturnType<typeof readSaleContract>, callers: Record<string, string[]>): ContractDiff {
  const red: string[] = [];
  const additions: string[] = [];
  const info: string[] = [];
  if (cur.error) red.push(cur.error);
  for (const n of REQUIRED_FNS) if (!cur.fns[n]) red.push(`หา export function ${n} ใน ${SALE_SERVICE} ไม่เจอ (ฟังก์ชันหาย/ย้าย/ตัวแยกโค้ดพัง)`);
  for (const [n, sigs0] of Object.entries(snap.functions)) {
    const sigs = Array.isArray(sigs0) ? sigs0 : [sigs0 as unknown as FnSig];
    const c = cur.fns[n];
    if (!c) {
      if (!(REQUIRED_FNS as readonly string[]).includes(n)) red.push(`${n} อยู่ใน snapshot แต่หายจากโค้ด`);
      continue;
    }
    sigs.forEach((s, i) => {
      const tag = sigs.length > 1 || c.length > 1 ? `#${i + 1}` : "";
      if (!c[i]) red.push(`${n}: overload ที่ ${i + 1} ถูกลบ`);
      else diffParams(n, tag, s, c[i]!, red, additions);
    });
    if (c.length > sigs.length) additions.push(`${n}: overload ใหม่ ${c.length - sigs.length} ตัว`);
  }
  for (const n of OPTIONAL_FNS) if (cur.fns[n] && !snap.functions[n]) additions.push(`ฟังก์ชันใหม่ ${n}()`);
  for (const [tn, dir] of Object.entries(CONTRACT_TYPES)) {
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
      if (!cf) red.push(`${tn}.${f} ถูกลบ/เปลี่ยนชื่อ (${dir === "input" ? "ขาเข้า" : "ขาออก"})`);
      else {
        if (cf.type !== sf.type) red.push(`${tn}.${f} เปลี่ยนชนิด "${sf.type}" → "${cf.type}"${dir === "output" && /\|\s*(undefined|null)\b/.test(cf.type) && !/\|\s*(undefined|null)\b/.test(sf.type) ? " (ขาออกกว้างขึ้นเป็น nullable)" : ""}`);
        if (dir === "input" && sf.optional && !cf.optional) red.push(`${tn}.${f} (ขาเข้า) เปลี่ยนจากไม่บังคับเป็นบังคับ`);
        if (dir === "output" && !sf.optional && cf.optional) red.push(`${tn}.${f} (ขาออก) เปลี่ยนจากมีเสมอเป็นไม่บังคับ — ผู้อ่านเดิมพัง`);
      }
    }
    for (const [f, cf] of Object.entries(c)) {
      if (s[f]) continue;
      if (dir === "output") {
        additions.push(`${tn}.${f}${cf.optional ? "?" : ""} (ขาออก · เพิ่มได้)`);
        continue;
      }
      const parent = f.includes(".") ? f.replace(/(\[\])?\.[^.]+$/, "") : ""; // "lines[].qty" → "lines"
      const parentIsNew = !!parent && !s[parent] && !!c[parent];
      if (!cf.optional && !parentIsNew) red.push(`${tn}.${f} (ขาเข้า) เป็นฟิลด์ใหม่ที่ "บังคับ" — ผู้เรียกเดิมพัง (ต้องเป็น ${f}?)`);
      else additions.push(`${tn}.${f}${cf.optional ? "?" : ""}`);
    }
  }
  for (const [n, list] of Object.entries(callers)) {
    const before = new Set(snap.callers?.[n] ?? []);
    const added = list.filter((f) => !before.has(f));
    const gone = [...before].filter((f) => !list.includes(f));
    if (added.length || gone.length) info.push(`ผู้เรียก ${n} เปลี่ยน (+${added.length} ${added.join(", ")} · −${gone.length} ${gone.join(", ")}) — อัปเดต snapshot ด้วย --update-pos-contract`);
  }
  return { red, additions, info };
}

/** --update-pos-contract: สร้างครั้งแรก หรือเติมของใหม่ที่เข้ากันได้ + ผู้เรียก · ไม่ลบไม่แก้ของเดิม · ปฏิเสธเมื่อยังแดง */
export function updateSaleContract(ROOT: string): { ok: boolean; message: string } {
  const path = join(ROOT, SALE_CONTRACT);
  const cur = readSaleContract(ROOT);
  const callers = scanSaleCallers(ROOT);
  if (cur.error || REQUIRED_FNS.some((n) => !cur.fns[n]) || Object.keys(CONTRACT_TYPES).some((t) => !cur.types[t])) {
    return { ok: false, message: `อ่านสัญญาจากโค้ดไม่ครบ — ไม่เขียน snapshot (${cur.error ?? "ฟังก์ชัน/ชนิดหาย"})` };
  }
  if (!existsSync(path)) {
    const snap: SaleContract = {
      $note: "สัญญาสาธารณะของ createSale/voidSale/refundSale (F15.2 ใน scripts/fitness-pos.mts) — สร้าง/เติมด้วย `pnpm exec tsx scripts/fitness-pos.mts --update-pos-contract` เท่านั้น · ผู้ตรวจต้อง diff กับ `git show <base>:scripts/pos-sale-contract.json` ทุกครั้งที่ไฟล์นี้เปลี่ยน",
      source: SALE_SERVICE,
      functions: Object.fromEntries(Object.entries(cur.fns).filter(([, v]) => v)) as Record<string, FnSig[]>,
      types: cur.types as Record<string, Record<string, Field>>,
      callers,
    };
    writeFileSync(path, JSON.stringify(snap, null, 2) + "\n");
    return { ok: true, message: `สร้าง ${SALE_CONTRACT} ครั้งแรก` };
  }
  const snap = JSON.parse(readFileSync(path, "utf8")) as SaleContract;
  const d = diffSaleContract(snap, cur, callers);
  if (d.red.length) return { ok: false, message: `ยังแดง ${d.red.length} ข้อ — --update-pos-contract เติมได้อย่างเดียว ไม่ลบ/ไม่แก้ของเดิม: ${d.red.join(" · ")}` };
  for (const [n, sigs] of Object.entries(cur.fns)) {
    if (!sigs) continue;
    const s = snap.functions[n];
    if (!s) snap.functions[n] = sigs;
    else {
      sigs.forEach((sig, i) => {
        if (!s[i]) s.push(sig);
        else s[i]!.params.push(...sig.params.slice(s[i]!.params.length));
      });
    }
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
/** ไฟล์ยึด (มีจริงวันนี้ — ต้องถูกค้นเจอเสมอ ไม่งั้นตัวค้นหาพัง) */
const POS_ANCHOR_FILES = ["src/lib/modules/pos/register-ui.tsx", "src/app/app/sys/[id]/pos/register/page.tsx"];
const MIN_PATTERN_CHARS = 4;
const ROW_KINDS = new Set(["button", "link", "menu", "tab", "toggle", "drag", "form", "filter", "input", "textarea", "select"]);
const ROW_ROLES = new Set(["owner", "manager", "cashier"]);
const EXPECT_TYPES = new Set(["modal", "navigate", "mutation", "download", "toast", "inline-error", "ui"]);

/**
 * ไฟล์ UI ของ POS (ตามแบบแผน path ไม่ใช่แค่โฟลเดอร์ชื่อ pos):
 *  (ก) `src/app/**` ที่มี segment `pos` · (ข) `src/lib/modules/pos/**` · (ค) `src/components/**` ที่อยู่ใต้โฟลเดอร์ขึ้นต้น `pos`
 *  (ง) ไฟล์ที่ไฟล์ใน (ก)–(ค) import มา ถ้าอยู่ในโฟลเดอร์ขึ้นต้น `register`/`pos` (ไล่จนนิ่ง)
 */
export function discoverPosFiles(ROOT: string): string[] {
  const isUi = (p: string) => /\.(tsx|ts)$/.test(p);
  const set = new Set<string>();
  for (const abs of walk(join(ROOT, "src", "app"), isUi)) if (relative(ROOT, abs).split("/").includes("pos")) set.add(relative(ROOT, abs));
  for (const abs of walk(join(ROOT, "src", "lib", "modules", "pos"), isUi)) set.add(relative(ROOT, abs));
  for (const abs of walk(join(ROOT, "src", "components"), isUi)) if (relative(ROOT, abs).split("/").slice(0, -1).some((s) => /^pos/i.test(s))) set.add(relative(ROOT, abs));
  const resolveImport = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(join(ROOT, from)), spec);
    else return null;
    for (const c of [base, `${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) {
      try {
        if (existsSync(c) && statSync(c).isFile()) return relative(ROOT, c);
      } catch {
        /* ข้าม */
      }
    }
    return null;
  };
  const queue = [...set];
  while (queue.length) {
    const f = queue.pop()!;
    let sf: ts.SourceFile;
    try {
      sf = parse(join(ROOT, f));
    } catch {
      continue;
    }
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      const r = resolveImport(f, st.moduleSpecifier.text);
      if (!r || set.has(r) || !r.startsWith("src/")) continue;
      if (r.split("/").slice(0, -1).some((s) => /^(register|pos)/i.test(s))) {
        set.add(r);
        queue.push(r);
      }
    }
  }
  return [...set].sort();
}

/** element ที่กดได้แต่ไม่มี data-testid — JSX AST (นิยาม "กดได้" เดียวกับ F14 · ไม่นับ <option>) → ชื่อแท็ก@บรรทัด */
export function untestidControls(src: string, file = "x.tsx"): string[] {
  const sf = parse(file.endsWith(".tsx") ? file : `${file}.tsx`, src);
  const hits: string[] = [];
  const v = (n: ts.Node) => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText(sf);
      if (tag !== "option") {
        const attrs = n.attributes.getText(sf);
        const hasTestid = n.attributes.properties.some((p) => ts.isJsxAttribute(p) && p.name.getText(sf) === "data-testid");
        if (!hasTestid && isInteractive(tag, `<${tag} ${attrs}`)) hits.push(`${tag}@${lineAt(sf, n)}`);
      }
    }
    ts.forEachChild(n, v);
  };
  v(sf);
  return hits;
}
const byTag = (list: string[]) => {
  const c: Record<string, number> = {};
  for (const h of list) {
    const t = h.slice(0, h.lastIndexOf("@"));
    c[t] = (c[t] ?? 0) + 1;
  }
  return c;
};

type Inv = { rows: unknown[]; foreign: { testid: string; owner: string }[]; debt: { file: string; untestid: number; byTag?: Record<string, number> }[] };
function readInventory(ROOT: string): Inv {
  const p = join(ROOT, POS_INVENTORY);
  if (!existsSync(p)) throw new Error(`ไม่พบ ${POS_INVENTORY}`);
  const j = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  if (!Array.isArray(j.rows)) throw new Error(`${POS_INVENTORY} ต้องมีคีย์ "rows" เป็น array`);
  const fItems = (j.$foreign as { items?: unknown } | undefined)?.items;
  const dItems = (j.baselineDebt as { items?: unknown } | undefined)?.items;
  if (!Array.isArray(fItems) || !Array.isArray(dItems)) throw new Error(`${POS_INVENTORY} ต้องมี $foreign.items และ baselineDebt.items เป็น array`);
  return { rows: j.rows, foreign: fItems as Inv["foreign"], debt: dItems as Inv["debt"] };
}

// ═══════════════════════════════════════════════════════════════
// F15.4 — ข้อความ pos.* สองภาษา
// ═══════════════════════════════════════════════════════════════
/** คำสากลที่ใช้ทับศัพท์ได้โดยไม่ต้องมีอักษรไทย (สั้นไว้ — เพิ่มต้องมีเหตุผล) */
export const UNIVERSAL_TOKENS = ["VAT", "QR", "PIN", "OK", "SKU", "POS", "PromptPay", "ID", "CSV", "PDF", "LINE", "KDS", "EAN", "Wi-Fi", "Bluetooth", "USB", "x", "X", "Z", "%"];
const THAI_RE = /[฀-๿]/;
function thaiValueProblem(v: string): string | null {
  if (THAI_RE.test(v)) return null;
  let rest = v.replace(/\{[^}]*\}/g, " "); // placeholder {count}
  for (const t of [...UNIVERSAL_TOKENS].sort((a, b) => b.length - a.length)) rest = rest.split(t).join(" ");
  return /[A-Za-z]/.test(rest) ? "ไม่มีอักษรไทย" : null;
}
function posMessages(ROOT: string, locale: string): { keys: Map<string, unknown>; files: string[] } {
  const keys = new Map<string, unknown>();
  const files: string[] = [];
  const flat = (o: unknown, prefix: string) => {
    if (o && typeof o === "object" && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) flat(v, `${prefix}.${k}`);
    else keys.set(prefix, o);
  };
  const take = (j: Record<string, unknown>, label: string, wholeNs: string | null) => {
    if (wholeNs) {
      files.push(label);
      flat(j, wholeNs);
      return;
    }
    if ("pos" in j) {
      files.push(`${label}#pos`);
      flat(j.pos, "pos");
    }
    for (const [k, v] of Object.entries(j)) {
      if (k.startsWith("pos.")) {
        files.push(`${label}#${k}`);
        flat(v, k); // คีย์แบน "pos.x" = pos.x
      }
    }
  };
  const read = (p: string) => JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  const dir = join(ROOT, "src", "messages", locale);
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      if (f.endsWith(".json")) take(read(p), `${locale}/${f}`, f === "pos.json" ? "pos" : null);
      else if (f === "pos" && statSync(p).isDirectory()) {
        for (const g of readdirSync(p).filter((x) => x.endsWith(".json")).sort()) take(read(join(p, g)), `${locale}/pos/${g}`, `pos.${g.replace(/\.json$/, "")}`);
      }
    }
  }
  const single = join(ROOT, "src", "messages", `${locale}.json`);
  if (existsSync(single)) take(read(single), `${locale}.json`, null);
  return { keys, files };
}

// ═══════════════════════════════════════════════════════════════
// ตัวรวม
// ═══════════════════════════════════════════════════════════════
export function runPosFitness(chk: PosChk, ROOT: string): void {
  console.log("\n── F15: POS (แคตตาล็อก/ราคาผู้เขียนเดียว · สัญญา createSale · ทะเบียนปุ่ม POS · ข้อความ pos.* สองภาษา) ──");

  // ── F15.1 ──
  const n151 = `แคตตาล็อก/ราคามีผู้เขียนที่เดียว (catalog.ts ∪ baseline ต่อจุดเขียน · หนี้เดิม ${Object.keys(CATALOG_WRITER_BASELINE).length} ไฟล์ ${Object.values(CATALOG_WRITER_BASELINE).reduce((a, r) => a + Object.values(r).reduce((x, y) => x + y, 0), 0)} จุด)`;
  guarded(chk, "F15.1", n151, () => {
    const writers = scanCatalogWriters(ROOT);
    const up: string[] = [];
    const down: string[] = [];
    const now = new Map(writers.map((w) => [w.file, w]));
    for (const w of writers) {
      if (CATALOG_WRITERS.includes(w.file)) continue;
      const base = CATALOG_WRITER_BASELINE[w.file] ?? {};
      const c = countKinds(w.hits);
      for (const [k, n] of Object.entries(c)) {
        if (n > (base[k] ?? 0)) {
          const ex = w.hits.filter((h) => h.kind === k).map((h) => `@${h.line} ${h.why}`).slice(0, 4);
          up.push(`${w.file} ${k} ${base[k] ?? 0}→${n} [${ex.join(" · ")}]`);
        }
      }
    }
    for (const [file, base] of Object.entries(CATALOG_WRITER_BASELINE)) {
      const c = countKinds(now.get(file)?.hits ?? []);
      for (const [k, n] of Object.entries(base)) if ((c[k] ?? 0) < n) down.push(`${file} ${k} ${n}→${c[k] ?? 0}`);
    }
    const problems = [
      up.length ? `จุดเขียนแคตตาล็อก/ราคาใหม่นอก ${CATALOG_WRITER} ${up.length}: ${up.join(" · ")} → เขียนผ่าน catalog.ts (pos-brief-COMMON ข้อ 3)` : "",
      down.length ? `CATALOG_WRITER_BASELINE มีจุดที่ไม่เขียนแล้ว ลดตัวเลข (ratchet): ${down.join(" · ")}` : "",
    ].filter(Boolean);
    const total = writers.reduce((a, w) => a + w.hits.length, 0);
    chk("F15.1", n151, problems.length === 0, problems.length ? problems.join(" · ") : `ตรง (${writers.length} ไฟล์ ${total} จุด)`, "CRITICAL");
  });

  // ── F15.2 ──
  const n152 = `สัญญา createSale/voidSale/refundSale ใน ${SALE_SERVICE} เข้ากันได้ย้อนหลังกับ ${SALE_CONTRACT} (ขาเข้า/ขาออก · ทุก overload)`;
  guarded(chk, "F15.2", n152, () => {
    const path = join(ROOT, SALE_CONTRACT);
    if (!existsSync(path)) {
      chk("F15.2", n152, false, `ไม่พบ snapshot ${SALE_CONTRACT} — ห้ามลบเพื่อให้ผ่าน · สร้างใหม่ด้วย \`pnpm exec tsx scripts/fitness-pos.mts --update-pos-contract\` แล้วผู้ตรวจ diff กับ git show <base>:${SALE_CONTRACT}`, "CRITICAL");
      return;
    }
    const snap = JSON.parse(readFileSync(path, "utf8")) as SaleContract;
    if (!snap.functions || !snap.types) throw new Error(`${SALE_CONTRACT} ไม่มีคีย์ functions/types`);
    const callers = scanSaleCallers(ROOT);
    const d = diffSaleContract(snap, readSaleContract(ROOT), callers);
    const nFields = Object.values(snap.types).reduce((a, t) => a + Object.keys(t).length, 0);
    chk(
      "F15.2",
      n152,
      d.red.length === 0,
      d.red.length
        ? d.red.join(" · ")
        : `ตรง (${Object.keys(snap.functions).join("/")} · ${nFields} ฟิลด์ · ผู้เรียก createSale ${callers.createSale?.length ?? 0} ไฟล์)${d.additions.length ? ` · ของใหม่ที่เข้ากันได้ ${d.additions.length}: ${d.additions.join(", ")} → รัน --update-pos-contract` : ""}${d.info.length ? ` · ${d.info.join(" · ")}` : ""}`,
      "CRITICAL",
    );
  });

  // ── F15.3 ──
  const n153a = `ปุ่ม POS ที่มี data-testid มีแถวใน ${POS_INVENTORY} ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid`;
  const n153b = `ทุกแถวใน ${POS_INVENTORY} ชี้ testid ที่มีจริง · ไม่ซ้ำ · ฟิลด์ถูกต้อง · baselineDebt ไม่เหลือหนี้ที่ปิดแล้ว`;
  let inv: Inv | null = null;
  let invErr = "";
  try {
    inv = readInventory(ROOT);
  } catch (e) {
    invErr = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
  type Found = { id: string; file: string; interactive: boolean };
  const found: Found[] = [];
  let files: string[] = [];
  const debtNow = new Map<string, string[]>();
  let scanOk = false;
  guarded(chk, "F15.3a", n153a, () => {
    files = discoverPosFiles(ROOT);
    const foreignIds = new Set((inv?.foreign ?? []).map((f) => f.testid));
    const unreadable: { file: string; line: number; snippet: string; interactive: boolean }[] = [];
    for (const file of files) {
      const src = readFileSync(join(ROOT, file), "utf8");
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
      if (file.endsWith(".tsx")) {
        const u = untestidControls(src, file);
        if (u.length) debtNow.set(file, u);
      }
    }
    scanOk = true;
    const own = found.filter((f) => !foreignIds.has(f.id));
    const rowIds = (inv?.rows ?? []).map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>).testid : null)).filter((x): x is string => typeof x === "string" && !!x.trim() && !(x.includes("*") && x.replace(/\*/g, "").length < MIN_PATTERN_CHARS));
    const rowExact = new Set(rowIds.filter((id) => !id.includes("*")));
    const rowPatterns = rowIds.filter((id) => id.includes("*")).map((id) => ({ id, re: globRe(id) }));
    const registered = (id: string) => rowExact.has(id) || (id.includes("*") && rowPatterns.some((r) => r.re.test(id) || globRe(id).test(r.id)));
    const interactive = [...new Map(own.filter((f) => f.interactive).map((f) => [`${f.id}@${f.file}`, f])).values()];
    const unregistered = interactive.filter((f) => !registered(f.id));
    // หนี้ต่อไฟล์ต่อแท็ก: เพิ่มขึ้น = แดง
    const debtBase = new Map((inv?.debt ?? []).map((d) => [d.file, d]));
    const debtUp: string[] = [];
    for (const [file, list] of debtNow) {
      const base = debtBase.get(file);
      const now = byTag(list);
      for (const [tag, n] of Object.entries(now)) {
        const b = base?.byTag?.[tag] ?? (base?.byTag ? 0 : null);
        if (b === null ? list.length > (base?.untestid ?? 0) : n > b) debtUp.push(`${file} <${tag}> ${b ?? base?.untestid ?? 0}→${n} (${list.filter((h) => h.startsWith(`${tag}@`)).slice(0, 4).join(" ")})`);
      }
    }
    const anchorMissed = POS_ANCHOR_FILES.filter((f) => existsSync(join(ROOT, f)) && !files.includes(f));
    const p1 = [
      invErr ? `อ่านทะเบียนไม่ได้ — ${invErr}` : "",
      anchorMissed.length ? `ตัวค้นหาไฟล์ POS พัง — หาไฟล์ที่มีจริงไม่เจอ: ${anchorMissed.join(", ")}` : "",
      unregistered.length ? `${unregistered.length} ตัวไม่มีแถว: ${unregistered.slice(0, 10).map((f) => `${f.id} (${f.file})`).join(" · ")} → เพิ่มแถวใน ${POS_INVENTORY}` : "",
      unreadable.filter((u) => u.interactive).length ? `จุดเขียน data-testid ด้วยค่าที่อ่านไม่ออก: ${unreadable.filter((u) => u.interactive).slice(0, 6).map((u) => `${u.file}:${u.line} ${u.snippet}`).join(" · ")}` : "",
      debtUp.length ? `ปุ่ม/ช่องที่กดได้แต่ไม่มี data-testid เพิ่มขึ้น (ใส่ testid + แถวทะเบียน): ${debtUp.join(" · ")}` : "",
    ].filter(Boolean);
    const totalDebt = [...debtNow.values()].reduce((a, l) => a + l.length, 0);
    chk(
      "F15.3a",
      `${n153a} (สแกน ${files.length} ไฟล์ · หนี้ไร้ testid ${totalDebt})`,
      p1.length === 0,
      p1.length ? p1.join(" · ") : `ครบ (testid กดได้ ${interactive.length} · แถว ${rowIds.length} · ของทะเบียนอื่น ${foreignIds.size})`,
      "CRITICAL",
    );
  });
  // ── F15.3b ใช้ผลสแกนเดียวกับ F15.3a ──
  guarded(chk, "F15.3b", n153b, () => {
      if (!inv) throw new Error(`อ่านทะเบียนไม่ได้ — ${invErr}`);
      if (!scanOk) throw new Error("สแกนไฟล์ POS ไม่สำเร็จ (ดู F15.3a)");
      const rows = inv.rows;
      const obj = (r: unknown) => (typeof r === "object" && r !== null ? (r as Record<string, unknown>) : null);
      const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      const bad: string[] = [];
      rows.forEach((r, i) => {
        const o = obj(r);
        const why: string[] = [];
        if (!o) why.push("ไม่ใช่ออบเจ็กต์");
        else {
          if (!str(o.testid)) why.push("ไม่มี testid");
          if (!str(o.page) || !String(o.page).startsWith("/")) why.push("page ต้องเป็น path ขึ้นต้น /");
          if (!ROW_KINDS.has(String(o.kind))) why.push(`kind "${o.kind}" ไม่อยู่ในชุดที่อนุญาต`);
          if (!Array.isArray(o.roles) || o.roles.length === 0 || o.roles.some((x) => !ROW_ROLES.has(String(x)))) why.push(`roles ต้องไม่ว่างและอยู่ใน ${[...ROW_ROLES].join("/")}`);
          if (o.hiddenFor !== undefined && (!Array.isArray(o.hiddenFor) || o.hiddenFor.some((x) => !ROW_ROLES.has(String(x))))) why.push("hiddenFor นอกชุดบทบาท");
          const ex = obj(o.expect);
          if (o.expect !== undefined && (!ex || !EXPECT_TYPES.has(String(ex.type)))) why.push(`expect.type ต้องอยู่ใน ${[...EXPECT_TYPES].join("/")}`);
        }
        if (why.length) bad.push(`#${i} ${str(o?.testid) ?? "?"}: ${why.join(", ")}`);
      });
      const ids = rows.map((r) => str(obj(r)?.testid)).filter((x): x is string => !!x);
      const degenerate = ids.filter((id) => id.includes("*") && id.replace(/\*/g, "").length < MIN_PATTERN_CHARS);
      const foreignIds2 = new Set(inv.foreign.map((f) => f.testid));
      const own2 = found.filter((f) => !foreignIds2.has(f.id));
      const codeExact = new Set(own2.map((f) => f.id).filter((id) => !id.includes("*")));
      const codePatterns = own2.map((f) => f.id).filter((id) => id.includes("*")).map((id) => ({ id, re: globRe(id) }));
      const inCode = (id: string) => (id.includes("*") ? codePatterns.some((c) => c.re.test(id) || globRe(id).test(c.id)) : codeExact.has(id) || codePatterns.some((c) => c.re.test(id)));
      const ghosts = ids.filter((id) => !degenerate.includes(id) && !foreignIds2.has(id) && !inCode(id));
      const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
      const foreignDup = ids.filter((id) => foreignIds2.has(id));
      const foreignProblems: string[] = [];
      let crmRowIds = new Set<string>();
      if (existsSync(join(ROOT, CRM_INVENTORY))) {
        const cj = JSON.parse(readFileSync(join(ROOT, CRM_INVENTORY), "utf8")) as { rows?: { testid?: string }[] };
        crmRowIds = new Set((cj.rows ?? []).map((r) => r.testid ?? ""));
      }
      for (const f of inv.foreign) {
        const hits = found.filter((x) => x.id === f.testid);
        if (!hits.length) foreignProblems.push(`${f.testid} (ประกาศเป็นของ ${f.owner} แต่ไม่มีในโค้ด POS)`);
        else if (hits.some((h) => h.interactive) && f.owner === CRM_INVENTORY && !crmRowIds.has(f.testid)) foreignProblems.push(`${f.testid} (กดได้ แต่ไม่มีแถวใน ${f.owner})`);
      }
      // หนี้ลดลงแต่ baseline ไม่ลด = แดง (ต่อไฟล์ต่อแท็ก) · baseline ต้องตรงกับผลรวมของ byTag
      const debtDown: string[] = [];
      for (const d of inv.debt) {
        const list = debtNow.get(d.file) ?? [];
        const now = byTag(list);
        if (d.byTag) {
          const sum = Object.values(d.byTag).reduce((a, b) => a + b, 0);
          if (sum !== d.untestid) debtDown.push(`${d.file} untestid ${d.untestid} ≠ ผลรวม byTag ${sum}`);
          for (const [tag, n] of Object.entries(d.byTag)) if ((now[tag] ?? 0) < n) debtDown.push(`${d.file} <${tag}> ${n}→${now[tag] ?? 0}`);
        } else if (list.length < d.untestid) debtDown.push(`${d.file} ${d.untestid}→${list.length}`);
      }
      const p2 = [
        ghosts.length ? `แถวผี ${ghosts.length} (ไม่มี testid นี้ในโค้ด POS): ${ghosts.slice(0, 10).join(", ")}` : "",
        dupes.length ? `แถวซ้ำ: ${dupes.join(", ")}` : "",
        foreignDup.length ? `แถวของทะเบียนอื่นถูกลงซ้ำที่นี่: ${foreignDup.join(", ")}` : "",
        degenerate.length ? `แถวแพตเทิร์นกว้างเกิน (ตัวอักษรที่ไม่ใช่ * ต้อง ≥ ${MIN_PATTERN_CHARS}): ${degenerate.join(", ")}` : "",
        bad.length ? `แถวพิการ ${bad.length}: ${bad.slice(0, 5).join(" · ")}` : "",
        foreignProblems.length ? `$foreign ไม่ตรง: ${foreignProblems.join(" · ")}` : "",
        debtDown.length ? `baselineDebt ไม่ตรง/ปิดหนี้แล้ว ลดตัวเลขใน ${POS_INVENTORY} (ratchet): ${debtDown.join(" · ")}` : "",
      ].filter(Boolean);
      chk("F15.3b", `${n153b} (${ids.length} แถว)`, p2.length === 0, p2.length ? p2.join(" · ") : "ตรง");
  });

  // ── F15.4 ──
  const n154 = "ข้อความ pos.* มีครบทั้ง th/en · ไม่ว่าง · ค่าภาษาไทยมีอักษรไทย (ยกเว้นคำสากลใน UNIVERSAL_TOKENS)";
  guarded(chk, "F15.4", n154, () => {
    const th = posMessages(ROOT, "th");
    const en = posMessages(ROOT, "en");
    const problems: string[] = [];
    const onlyTh = [...th.keys.keys()].filter((k) => !en.keys.has(k));
    const onlyEn = [...en.keys.keys()].filter((k) => !th.keys.has(k));
    if (onlyTh.length) problems.push(`มีแต่ภาษาไทย ${onlyTh.length}: ${onlyTh.slice(0, 8).join(", ")}`);
    if (onlyEn.length) problems.push(`มีแต่ภาษาอังกฤษ ${onlyEn.length}: ${onlyEn.slice(0, 8).join(", ")}`);
    const empty = [...th.keys, ...en.keys].filter(([, v]) => typeof v !== "string" || !v.trim()).map(([k]) => k);
    if (empty.length) problems.push(`ค่าว่าง/ไม่ใช่ข้อความ ${empty.length}: ${[...new Set(empty)].slice(0, 8).join(", ")}`);
    const notThai = [...th.keys].filter(([, v]) => typeof v === "string" && v.trim() && thaiValueProblem(v)).map(([k, v]) => `${k}="${String(v).slice(0, 30)}"`);
    if (notThai.length) problems.push(`ค่าภาษาไทยไม่มีอักษรไทย ${notThai.length}: ${notThai.slice(0, 8).join(", ")}`);
    chk(
      "F15.4",
      n154,
      problems.length === 0,
      problems.length ? problems.join(" · ") : th.keys.size === 0 && en.keys.size === 0 ? "0 คีย์ (namespace ยังไม่ถูกสร้าง)" : `ครบ ${th.keys.size} คีย์ (${[...th.files, ...en.files].join(", ")})`,
    );
  });

  // ── F15.5 ── POS P1.1a R3 ▸ D5 · R4 ▸ E4
  const n155 = "ตัวบ่งชี้ผู้เรียกระดับระบบของแคตตาล็อก + backfill ไม่หลุดถึงโค้ดที่รับคำขอ (catalog.ts · สคริปต์ backfill · qc-* · allowlist เท่านั้น) · R4: ห้าม ?? / || / ?: / alias ของตัวบ่งชี้";
  guarded(chk, "F15.5", n155, () => {
    const v = scanSystemMarker(ROOT);
    chk("F15.5", n155, v.length === 0, v.length ? v.slice(0, 6).join(" · ") : "สะอาด", "CRITICAL");
  });

  // ── F15.6 ── POS P1.1a R5 ▸ F5
  const n156 = `src/** ห้าม import จาก scripts/** (static · import() · require · import = require · typeof import()) · baseline ${SRC_IMPORTS_SCRIPTS_BASELINE.size} จุด`;
  guarded(chk, "F15.6", n156, () => {
    const v = scanSrcImportsScripts(ROOT);
    const fresh = v.filter((x) => !SRC_IMPORTS_SCRIPTS_BASELINE.has(x.key));
    const gone = [...SRC_IMPORTS_SCRIPTS_BASELINE.keys()].filter((k) => !v.some((x) => x.key === k));
    const problems = [...fresh.map((x) => `${x.where}: ${x.why}`), ...gone.map((k) => `${k}: อยู่ใน baseline แต่หายแล้ว — ลบออกจาก SRC_IMPORTS_SCRIPTS_BASELINE`)];
    chk("F15.6", n156, problems.length === 0, problems.length ? problems.slice(0, 6).join(" · ") : `สะอาด (${v.length} จุดตาม baseline)`, "CRITICAL");
  });
}

// ═══════════════════════════════════════════════════════════════
// F15.5 — ตัวบ่งชี้ผู้เรียกระดับระบบ (POS P1.1a round 3 · D5)
// ═══════════════════════════════════════════════════════════════
// ชื่อสร้างจากชิ้นส่วน — ไฟล์นี้เองจะได้ไม่ "ใช้" ตัวระบุทั้งสอง (และข้ามตัวเองชัด ๆ อีกชั้น)
const MARKER_ID = ["CATALOG", "SYSTEM", "ACTOR"].join("_");
const BACKFILL_ID = ["backfill", "Catalog"].join("");
const MARKER_USE_RE = new RegExp(`\\b(${MARKER_ID}|${BACKFILL_ID})\\b`);
/** นิพจน์นี้คือตัวบ่งชี้ตรง ๆ ไหม: `X` · `m.X` · `m?.X` · `m["X"]` (ห่อวงเล็บ/as/!/satisfies ได้) — คีย์ที่คำนวณ (`m[k]`) อยู่นอกขอบเขต (R4 E4) */
function isMarkerRef(e: ts.Expression | undefined): boolean {
  if (!e) return false;
  const r = unwrap(e);
  if (ts.isIdentifier(r)) return r.text === MARKER_ID;
  if (ts.isPropertyAccessExpression(r)) return r.name.text === MARKER_ID;
  if (ts.isElementAccessExpression(r)) return ts.isStringLiteralLike(r.argumentExpression) && r.argumentExpression.text === MARKER_ID;
  return false;
}
const LOGICAL = new Set([ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken]);
/** R5 F5: การกำหนดค่าแบบตรรกะ `??=` / `||=` / `&&=` */
const LOGICAL_ASSIGN = new Set([ts.SyntaxKind.QuestionQuestionEqualsToken, ts.SyntaxKind.BarBarEqualsToken, ts.SyntaxKind.AmpersandAmpersandEqualsToken]);
/** ค่าที่ "ถือ" ตัวบ่งชี้: ตัวบ่งชี้ตรง ๆ · ตัวถูกดำเนินการของ ?? / || / && · กิ่งของ ?: · ฟังก์ชันลูกศรที่คืนค่าเหล่านี้ */
function carriesMarker(e: ts.Expression | undefined): boolean {
  if (!e) return false;
  const r = unwrap(e);
  if (isMarkerRef(r)) return true;
  if (ts.isBinaryExpression(r) && LOGICAL.has(r.operatorToken.kind)) return carriesMarker(r.left) || carriesMarker(r.right);
  if (ts.isConditionalExpression(r)) return carriesMarker(r.whenTrue) || carriesMarker(r.whenFalse);
  if (ts.isArrowFunction(r) && !ts.isBlock(r.body)) return carriesMarker(r.body);
  return false;
}
/** R5 F5: ค่าที่ส่งออกได้ซึ่ง "พก" ตัวบ่งชี้ — carriesMarker + ค่าในออบเจกต์/อาร์เรย์ลิเทอรัล (`{ M }` · `{ k: M }` · `[M]` · spread) */
function holdsMarker(e: ts.Expression | undefined): boolean {
  if (!e) return false;
  if (carriesMarker(e)) return true;
  const r = unwrap(e);
  if (ts.isObjectLiteralExpression(r))
    return r.properties.some(
      (p) =>
        (ts.isPropertyAssignment(p) && holdsMarker(p.initializer)) ||
        (ts.isShorthandPropertyAssignment(p) && p.name.text === MARKER_ID) ||
        (ts.isSpreadAssignment(p) && holdsMarker(p.expression)),
    );
  if (ts.isArrayLiteralExpression(r)) return r.elements.some((x) => holdsMarker(ts.isSpreadElement(x) ? x.expression : x));
  return false;
}
const isExported = (n: ts.Node) => !!(ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
/**
 * การใช้ตัวบ่งชี้ที่ห้ามในโค้ดจริง (AST — ข้อความ/คอมเมนต์ที่อธิบายกติกาไม่นับ):
 *   • `x ?? <ตัวบ่งชี้>` (R3) · `x || <ตัวบ่งชี้>` (R4 E4) — ค่าว่าง/เท็จกลายเป็นผู้เรียกระดับระบบ — ทุกไฟล์
 *   • `c ? <ตัวบ่งชี้> : y` / `c ? y : <ตัวบ่งชี้>` (R4 E4) — ทุกไฟล์
 *   • alias (R4 E4) นอก catalog.ts: `const S = <ตัวบ่งชี้>` (รวมค่าที่ถือตัวบ่งชี้ตาม carriesMarker) · `S = <ตัวบ่งชี้>` ·
 *     `{ <ตัวบ่งชี้>: S } = …` · `import/export { <ตัวบ่งชี้> as S }` — `allowAlias` = ข้อสอบ `scripts/qc-*.mts` (ต้องถือตัวบ่งชี้ไว้ทดสอบ — มติที่ขอผู้คุมงาน)
 * การหลบด้วยคีย์ที่คำนวณ (`m[k]` ที่ k ประกอบตอนรัน) อยู่นอกขอบเขต (R4 E4)
 */
function markerMisuse(abs: string, text: string, allowAlias: boolean, isHome = false): { line: number; why: string }[] {
  const sf = parse(abs, text);
  const out: { line: number; why: string }[] = [];
  const visit = (n: ts.Node) => {
    // R5 F5 — ทุกไฟล์ (รวม catalog.ts และ qc-*): ค่าปริยายของพารามิเตอร์ · ค่าปริยายตอนแยกค่า · `??=` / `||=` / `&&=` · `&& <ตัวบ่งชี้>`
    // POS P1.1b ▸ G12: ค่าปริยายที่เป็นออบเจกต์ "ถือ" ตัวบ่งชี้ (`ctx = { actorUserId: M }`) ก็นับ (holdsMarker) ◂
    if (ts.isParameter(n) && holdsMarker(n.initializer)) out.push({ line: lineAt(sf, n), why: `ค่าปริยายของพารามิเตอร์ = ${MARKER_ID} (ผู้เรียกที่ไม่ส่งค่ากลายเป็นผู้เรียกระดับระบบ)` });
    if (ts.isBindingElement(n) && holdsMarker(n.initializer)) out.push({ line: lineAt(sf, n), why: `ค่าปริยายตอนแยกค่า (destructuring) = ${MARKER_ID}` });
    if (ts.isShorthandPropertyAssignment(n) && carriesMarker(n.objectAssignmentInitializer))
      out.push({ line: lineAt(sf, n), why: `ค่าปริยายตอนแยกค่า (\`{ x = ${MARKER_ID} } = …\`)` });
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      carriesMarker(n.right) &&
      (ts.isArrayLiteralExpression(n.parent) || ts.isPropertyAssignment(n.parent))
    )
      out.push({ line: lineAt(sf, n), why: `ค่าปริยายตอนแยกค่า (\`[x = ${MARKER_ID}] = …\` / \`{ k: x = ${MARKER_ID} } = …\`)` });
    if (ts.isBinaryExpression(n) && LOGICAL_ASSIGN.has(n.operatorToken.kind) && carriesMarker(n.right))
      out.push({ line: lineAt(sf, n), why: `\`${n.operatorToken.getText(sf)} ${MARKER_ID}\` (ห้ามใช้ตัวบ่งชี้เป็นค่าสำรอง)` });
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && isMarkerRef(n.right))
      out.push({ line: lineAt(sf, n), why: `\`&& ${MARKER_ID}\` (ห้ามเลือกผู้เรียกระดับระบบตามเงื่อนไข)` });
    // R5 F5 — ส่งออกตัวบ่งชี้ในชื่อใหม่/ชื่อเดิมจากไฟล์อื่นนอก catalog.ts = ห้าม (qc-* ตั้ง alias ได้แค่ตัวแปรภายในที่ไม่ส่งออก)
    if (!isHome) {
      const exp = (why: string) => out.push({ line: lineAt(sf, n), why: `ส่งออก ${MARKER_ID} (${why}) — มีบ้านเดียวคือ catalog.ts` });
      if (ts.isVariableStatement(n) && isExported(n) && n.declarationList.declarations.some((d) => holdsMarker(d.initializer))) exp("export const");
      else if (ts.isExportSpecifier(n) && (n.propertyName ? propName(n.propertyName as ts.Identifier) : n.name.text) === MARKER_ID) exp("export { … }");
      else if (ts.isExportAssignment(n) && holdsMarker(n.expression)) exp("export default");
    }
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken && isMarkerRef(n.right))
      out.push({ line: lineAt(sf, n), why: `\`?? ${MARKER_ID}\` (ห้ามใช้ตัวบ่งชี้เป็นค่าสำรอง)` });
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.BarBarToken && isMarkerRef(n.right))
      out.push({ line: lineAt(sf, n), why: `\`|| ${MARKER_ID}\` (ห้ามใช้ตัวบ่งชี้เป็นค่าสำรอง)` });
    if (ts.isConditionalExpression(n) && (isMarkerRef(n.whenTrue) || isMarkerRef(n.whenFalse)))
      out.push({ line: lineAt(sf, n), why: `\`? … : …\` มี ${MARKER_ID} ในกิ่ง (ห้ามเลือกผู้เรียกระดับระบบตามเงื่อนไข)` });
    if (!allowAlias) {
      const alias = (why: string) => out.push({ line: lineAt(sf, n), why: `alias ของ ${MARKER_ID} (${why}) — ใช้ชื่อเดิมเท่านั้น นอก catalog.ts ห้ามตั้งชื่อใหม่` });
      if (ts.isVariableDeclaration(n) && carriesMarker(n.initializer)) alias("ตัวแปร");
      else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && carriesMarker(n.right)) alias("กำหนดค่า");
      else if (ts.isBindingElement(n) && (n.propertyName ? propName(n.propertyName) === MARKER_ID : false) && propName(n.name) !== MARKER_ID) alias("แยกค่าเปลี่ยนชื่อ");
      else if ((ts.isImportSpecifier(n) || ts.isExportSpecifier(n)) && n.propertyName && propName(n.propertyName as ts.Identifier) === MARKER_ID && n.name.text !== MARKER_ID) alias("import/export as");
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
const MARKER_HOME = "src/lib/modules/pos/catalog.ts";
/** ไฟล์ที่ได้รับอนุญาตเพิ่ม (ว่างวันนี้ — P1.1b เติมไฟล์ legacy-sync ของตัวเอง พร้อมเหตุผล) */
export const SYSTEM_MARKER_ALLOWLIST: ReadonlyMap<string, string> = new Map<string, string>([
  // POS P1.1b ▸ G4a
  [
    "src/lib/modules/pos/catalog-legacy.ts",
    "ซิงก์ขาเดิม→แคตตาล็อก (P1.1b G4a): ประตูเดิมอนุญาตผู้กระทำตามกติกาโมดูลของตัวเองแล้ว ⇒ ฝั่งแคตตาล็อกเรียกแบบระบบ · ทุก export รับ tx ของผู้เรียก · ห้าม import จากโค้ดที่รับคำขอ (สแกนด้านล่าง)",
  ],
]);
/** POS P1.1b ▸ G4a: ไฟล์ที่โค้ดรับคำขอ (src/app · src/lib/actions · "use server") ห้าม import ทุกรูปแบบ ◂ */
const LEGACY_SYNC_HOME = "src/lib/modules/pos/catalog-legacy.ts";
const isMarkerAllowedPath = (f: string) =>
  f === MARKER_HOME || f === "scripts/pos-backfill-catalog.mts" || /^scripts\/qc-[^/]+\.mts$/.test(f) || SYSTEM_MARKER_ALLOWLIST.has(f);
const isRequestPath = (f: string, text: string) =>
  f.startsWith("src/app/") || f.startsWith("src/lib/actions/") || /^\s*["']use server["']/m.test(text);

/** คืนรายการละเมิด (ว่าง = สะอาด) — export ไว้ให้ข้อสอบ/หลักฐานลบ (negative proof) เรียกตรง */
export function scanSystemMarker(ROOT: string): string[] {
  const out: string[] = [];
  const self = "scripts/fitness-pos.mts";
  const files = [
    ...walk(join(ROOT, "src"), (p) => /\.(ts|tsx|mts|js|mjs)$/.test(p)),
    ...walk(join(ROOT, "scripts"), (p) => /\.(ts|mts|js|mjs)$/.test(p)),
  ];
  for (const abs of files) {
    const f = relative(ROOT, abs).replace(/\\/g, "/");
    if (f === self) continue;
    const text = readFileSync(abs, "utf8");
    if (!MARKER_USE_RE.test(text)) continue;
    // R4 E4: ทุกไฟล์ (อนุญาตหรือไม่ก็ตาม) — alias ยกเว้นเฉพาะ catalog.ts (บ้านของมัน) และข้อสอบ scripts/qc-*.mts
    for (const m of markerMisuse(abs, text, f === MARKER_HOME || /^scripts\/qc-[^/]+\.mts$/.test(f), f === MARKER_HOME)) out.push(`${f}:${m.line}: ${m.why}`);
    if (!isMarkerAllowedPath(f)) out.push(`${f}: ใช้ ${MARKER_ID}/${BACKFILL_ID} นอกไฟล์ที่อนุญาต`);
    else if (isRequestPath(f, text)) out.push(`${f}: ไฟล์รับคำขอ ("use server" / src/app / src/lib/actions) ห้ามมีตัวบ่งชี้`);
  }
  // R5 F5: `export * from <catalog>` นอก catalog.ts = ส่งออกตัวบ่งชี้ต่อโดยไม่เอ่ยชื่อ (ไฟล์แบบนี้ไม่มีชื่อตัวบ่งชี้ — สแกนแยก)
  for (const abs of files) {
    const f = relative(ROOT, abs).replace(/\\/g, "/");
    if (f === self || f === MARKER_HOME) continue;
    const text = readFileSync(abs, "utf8");
    if (!/export\s*\*/.test(text)) continue;
    const sf = parse(abs, text);
    for (const st of sf.statements) {
      if (!ts.isExportDeclaration(st) || (st.exportClause && !ts.isNamespaceExport(st.exportClause)) || !st.moduleSpecifier || !ts.isStringLiteralLike(st.moduleSpecifier)) continue;
      if (resolvesTo(ROOT, abs, st.moduleSpecifier.text, MARKER_HOME)) out.push(`${f}:${lineAt(sf, st)}: \`export *\` จาก catalog.ts — ส่งออก ${MARKER_ID} ต่อ (ใช้รายการชื่อชัดเจนแบบ pos/index.ts)`);
    }
  }
  // POS P1.1b ▸ G4a: import catalog-legacy จากโค้ดที่รับคำขอ (static · namespace · export from · import() · require · import = require) ◂
  for (const abs of files) {
    const f = relative(ROOT, abs).replace(/\\/g, "/");
    if (f === self || f === LEGACY_SYNC_HOME || !f.startsWith("src/")) continue;
    const text = readFileSync(abs, "utf8");
    if (!text.includes("catalog-legacy") || !isRequestPath(f, text)) continue;
    const sf = parse(abs, text);
    const visit = (n: ts.Node) => {
      let spec: string | null = null;
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteralLike(n.moduleSpecifier)) spec = n.moduleSpecifier.text;
      else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference) && ts.isStringLiteralLike(n.moduleReference.expression)) spec = n.moduleReference.expression.text;
      else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require")) && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0]))
        spec = n.arguments[0].text;
      else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) spec = n.argument.literal.text;
      if (spec !== null && resolvesTo(ROOT, abs, spec, LEGACY_SYNC_HOME))
        out.push(`${f}:${lineAt(sf, n)}: import catalog-legacy จากโค้ดที่รับคำขอ (src/app · src/lib/actions · "use server") — เรียกผ่านประตูเดิมของโมดูลเท่านั้น`);
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  const home = existsSync(join(ROOT, MARKER_HOME)) ? readFileSync(join(ROOT, MARKER_HOME), "utf8") : "";
  if (home && !new RegExp(`${MARKER_ID}[^=\\n]*=\\s*Symbol\\(`).test(home)) out.push(`${MARKER_HOME}: ${MARKER_ID} ต้องสร้างด้วย Symbol(…)`);
  if (/Symbol\.for\(/.test(home)) out.push(`${MARKER_HOME}: ห้าม Symbol.for( (ลงทะเบียนกลาง = ปลอมได้)`);
  return out;
}

/** ตัวระบุโมดูลนี้ชี้ไฟล์ `targetRel` (ไม่มีนามสกุล/มี .ts/.mts/.js · หรือโฟลเดอร์ที่มี index) ไหม — รองรับ `./` `../` `@/` และ path เต็ม */
function resolvesTo(ROOT: string, fromAbs: string, spec: string, targetRel: string): boolean {
  const abs = specToAbs(ROOT, fromAbs, spec);
  if (!abs) return false;
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  const base = targetRel.replace(/\.(ts|tsx|mts|js|mjs)$/, "");
  return rel === targetRel || rel === base || rel.replace(/\.(ts|tsx|mts|js|mjs)$/, "") === base;
}
/** ตัวระบุโมดูล → path จริง (null = แพ็กเกจ / ไม่ใช่ path) · `@/x` = `src/x` (tsconfig paths) */
function specToAbs(ROOT: string, fromAbs: string, spec: string): string | null {
  if (spec.startsWith("./") || spec.startsWith("../") || spec === "." || spec === "..") return resolve(dirname(fromAbs), spec);
  if (spec.startsWith("@/")) return resolve(ROOT, "src", spec.slice(2));
  if (spec.startsWith("/")) return resolve(spec);
  if (spec.startsWith("file:")) {
    try {
      return new URL(spec).pathname;
    } catch {
      return null;
    }
  }
  if (spec === "scripts" || spec.startsWith("scripts/")) return resolve(ROOT, spec); // ไม่มี baseUrl — กันไว้ (fail-closed)
  return null;
}

// ═══════════════════════════════════════════════════════════════
// F15.6 — src/** ห้าม import จาก scripts/** (POS P1.1a round 5 · F5)
// ═══════════════════════════════════════════════════════════════
/** จุดที่มีอยู่แล้ว (key = `<ไฟล์>|<ตัวระบุ>`) — ว่าง: ต้นไม้วันนี้ไม่มีจุดละเมิด (ตรวจแล้ว R5) · ห้ามเพิ่มโดยไม่มีมติผู้คุมงาน */
export const SRC_IMPORTS_SCRIPTS_BASELINE: ReadonlyMap<string, string> = new Map<string, string>([]);
/** ข้อความหัวของตัวระบุ: สตริง · template ไม่มีตัวแทน · template ที่มีตัวแทน (ใช้ส่วนหัวก่อน `${`) — อย่างอื่น (ตัวแปร) = null (นอกขอบเขต) */
function specText(e: ts.Expression | undefined): string | null {
  if (!e) return null;
  const r = unwrap(e);
  if (ts.isStringLiteralLike(r)) return r.text;
  if (ts.isTemplateExpression(r)) return r.head.text;
  return null;
}
/** คืนจุดที่ไฟล์ใต้ src/ อ้างโมดูลใต้ scripts/ (AST · คอมเมนต์/สตริงธรรมดาไม่นับ) — export ไว้ให้หลักฐานลบเรียกตรง */
export function scanSrcImportsScripts(ROOT: string): { key: string; where: string; why: string }[] {
  const out: { key: string; where: string; why: string }[] = [];
  const scriptsDir = resolve(ROOT, "scripts");
  const underScripts = (abs: string | null) => !!abs && (abs === scriptsDir || abs.startsWith(scriptsDir + "/") || abs.startsWith(scriptsDir + "\\"));
  for (const abs of walk(join(ROOT, "src"), (p) => /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(p))) {
    const f = relative(ROOT, abs).replace(/\\/g, "/");
    const text = readFileSync(abs, "utf8");
    if (!/scripts|import\s*\(|require/.test(text)) continue;
    const sf = parse(abs, text);
    const hit = (n: ts.Node, spec: string, how: string) => {
      if (!underScripts(specToAbs(ROOT, abs, spec))) return;
      out.push({ key: `${f}|${spec}`, where: `${f}:${lineAt(sf, n)}`, why: `${how} "${spec}" — โค้ดแอปห้ามพึ่งสคริปต์ (scripts/** ไม่ถูก build/ไม่มีด่านของแอป)` });
    };
    const visit = (n: ts.Node) => {
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteralLike(n.moduleSpecifier))
        hit(n, n.moduleSpecifier.text, ts.isImportDeclaration(n) ? "import" : "export … from");
      else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) {
        const t = specText(n.moduleReference.expression);
        if (t !== null) hit(n, t, "import = require");
      } else if (ts.isCallExpression(n)) {
        const callee = n.expression;
        const isDyn = callee.kind === ts.SyntaxKind.ImportKeyword;
        const isReq =
          (ts.isIdentifier(callee) && callee.text === "require") ||
          (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "require" && callee.name.text === "resolve");
        if (isDyn || isReq) {
          const t = specText(n.arguments[0]);
          if (t !== null) hit(n, t, isDyn ? "import()" : "require");
        }
      } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) hit(n, n.argument.literal.text, "typeof import()");
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
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
  if (process.argv.includes("--print-catalog-writers")) {
    const ws = scanCatalogWriters(ROOT);
    const table = Object.fromEntries(ws.map((w) => [w.file, countKinds(w.hits)]));
    for (const w of ws) for (const h of w.hits) console.log(`  ${w.file}:${h.line} ${h.kind} — ${h.why}`);
    console.log(`CATALOG_WRITERS ${JSON.stringify(table)}`);
    process.exit(0);
  }
  if (process.argv.includes("--print-pos-files")) {
    for (const f of discoverPosFiles(ROOT)) {
      const u = f.endsWith(".tsx") ? untestidControls(readFileSync(join(ROOT, f), "utf8"), f) : [];
      console.log(`  ${f} ${u.length} ${JSON.stringify(byTag(u))}`);
    }
    process.exit(0);
  }
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
