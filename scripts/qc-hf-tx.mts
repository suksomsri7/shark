// QC — POS HF-TX: createSale ต้องไม่ถือ interactive tx ของผู้เรียกเป็นของตัวเอง (Prisma 7 · `$transaction` ซ้อน = SAVEPOINT)
//   สัญญา: ledger/pos-briefs/pos-brief-HF-TX.md (Scope 1–4 · Oracle HT1–HT6 · §9 มติผู้คุม 1–5 — HT7 เพิ่มตามมติ 3)
//   หลักฐานเดิม: ledger/wo-notes/pos-HF-TX-investigation.md (probe: xmin แยก · อ่านบิลก่อน commit found:false)
// รัน: bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hf-tx.mts
//   --list = พิมพ์ทุก id ไม่แตะ DB · ด่าน SKIP: ยังไม่มี `src/lib/core/caller-tx.ts` หรือ `afterSaleCommitted` ⇒ SKIP (exit 0) · QC_FORCE=1 = รันต่อ (แดงตามเหตุผล)
//   ร้านชั่วคราวของตัวเอง `posqc-hftx-<rand>` + ผู้ใช้ชั่วคราว · ลบทิ้งใน finally (ตรวจ slug ก่อนลบ) · QC4 เท่านั้น
//
// ข้อสอบ:
//   HT1 ทางใบขอรับเงิน (PROMPTPAY manual PAID → submitRegisterSale · สินค้ามีสต็อก): PosSale/PosSaleLine/PosPayment/PosPaymentIntent xmin เดียว ·
//       OUT 1 แถว + onHand −1 · pos.sale.paid 1 แถว · ตัวสอดแนม prisma.posSale.findFirst (select status) ไม่เห็นการอ่านก่อน commit (ไม่มี found:false)
//   HT2 บัตรกำนัล sell + reload: PosSale/PosSaleLine/PosPayment xmin = GiftCard/GiftCardTxn xmin (outbox ไม่นับ — การระบายแก้แถว) · pos.sale.paid 1 แถว → DONE
//       (ระบายหลัง commit) · PosSale.giftCardId ตั้งแล้ว
//   HT2.5 (fix 1 · F2) ขายบัตรพร้อมกันสองคำขอด้วยคีย์เดียว ⇒ GiftCard 1 · PosSale 1 · SELL GiftCardTxn 1 · ผลของคำขอที่แพ้ pin = null (ทางลองใหม่ P2002 → ผลเดิม)
//   หมายเหตุ fix 1 (F1): xid ของผู้เรียก = `pg_current_xact_id()::xid` (32 บิตแบบเดียวกับ xmin · ไม่ใช่ txid_current() 64 บิตที่มี epoch)
//   HT3 สัญญา callerTx: (a) ผู้เรียก throw หลัง createSale(…, callerTx(tx)) ⇒ บิล 0 แถว · OUT 0 · (b) commit แล้ว afterSaleCommitted ⇒ xmin = xid ผู้เรียก ·
//       ไม่มีการอ่านในธุรกรรม · OUT 1 หลัง afterSaleCommitted
//   HT4 positive control: หน้าขายเงินสด (createSale เป็นเจ้าของ tx) xmin เดียว + OUT 1 (ไม่เปลี่ยน)
//   HT5 negative control: createSale(…, tx ดิบ) ⇒ ตัวตรวจเห็น xmin แยก + อ่าน found:false ก่อน commit (พิสูจน์ว่า HT1/HT2 แดงได้จริง · เขียวทั้งก่อน/หลัง HF)
//   HT6 [static] ทุก createSale(/regCreateSale( ใน src ที่ส่งอาร์กิวเมนต์ที่ 2 = prisma/PrismaClient หรือ callerTx(…) · ไม่มี Proxy ซ่อน $transaction ตัวอื่น
//       (regCallerTx/flatTx หาย) · core/caller-tx.ts บริสุทธิ์ · ทะเบียนผู้เรียก qc-pos-p1.6 U4 ไม่เปลี่ยน
//   HT7 [static] helper `"$transaction" in` ที่อยู่นอกขอบเขต (ไม่แก้) ถูกจดใน ledger/POS-OWNER-PENDING.md (บรรทัด HF-TX · HT7) ครบ/ตรงจำนวน — ไม่ให้รายการเน่าเงียบ
//   POS HF-GC ▸ (ledger/pos-briefs/pos-brief-HF-GC.md Scope 4 · §9 มติ 2) ◂
//   HT2.6 เติมบัตรใบเดียวพร้อมกัน 5 คำขอ (คีย์ต่างกัน ยอดเท่ากัน) ⇒ RELOAD 5 แถว · balanceAfter ไม่ซ้ำ = initial + k·satang (k=1..5) · max = ยอดบัตร ·
//       balanceAfter ที่แต่ละคำขอคืน = แถวของตัวเอง (แดงก่อนแก้: ทุกแถว = initial + satang เพราะอ่านยอดก่อนธุรกรรม)
//   HT2.7 ตาข่ายหนี้สิน 2110 ของการขายบัตร (ร้านเชื่อมบัญชี · สวิตช์ผูกบัญชีเปิด): ขาย ⇒ accountingDocId + JV อ้างอิง GiftCard#<id> 1 ใบ ·
//       ล้าง accountingDocId (จำลองช่วงพังหลัง commit) แล้ว (a) ขายซ้ำคีย์เดิม ⇒ คืน accountingDocId + JV ยัง 1 · (b) ล้างอีกครั้ง + เล่น consumer
//       giftcard.sold ×2 ต่อกัน + ×2 พร้อมกัน ⇒ คืน accountingDocId + JV ยัง 1 · (b2) ขายตอนตัดการเชื่อมบัญชี (ช่วงพังก่อนลงบัญชี — ยังไม่มี JV)
//       แล้วเชื่อมกลับ + เล่น consumer ⇒ JV 1 + accountingDocId ตั้ง · (c) ขายตอนสวิตช์ปิด → เปิดสวิตช์ + เล่น consumer ⇒ JV 0 · accountingDocId null
//       (แดงก่อนแก้: (a) คืน null / ไม่มีตาข่ายใน consumer)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

type Any = any;
const SUITE = "qc-hf-tx";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const FORCE = process.env.QC_FORCE === "1";

const CHECKS: [string, string][] = [
  ["HT1.1", "ทางใบขอรับเงิน: PosSale/PosSaleLine/PosPayment/PosPaymentIntent xmin เดียว"],
  ["HT1.2", "ทางใบขอรับเงิน: OUT 1 แถว (−1) · onHand −1"],
  ["HT1.3", "ทางใบขอรับเงิน: pos.sale.paid 1 แถว"],
  ["HT1.4", "ทางใบขอรับเงิน: ไม่มีการอ่านบิลก่อน commit (ไม่มี found:false) · มีอ่านหลัง commit"],
  ["HT2.1", "บัตรกำนัล sell: PosSale/Line/Payment xmin = GiftCard/GiftCardTxn xmin · giftCardId ตั้งแล้ว"],
  ["HT2.2", "บัตรกำนัล sell: pos.sale.paid 1 แถว → DONE (ระบายหลัง commit)"],
  ["HT2.3", "บัตรกำนัล reload: PosSale/Line/Payment xmin = GiftCard/GiftCardTxn xmin · giftCardId ตั้งแล้ว"],
  ["HT2.4", "บัตรกำนัล reload: pos.sale.paid 1 แถว → DONE (ระบายหลัง commit)"],
  ["HT2.5", "บัตรกำนัล sell พร้อมกัน 2 คำขอคีย์เดียว ⇒ GiftCard 1 · PosSale 1 · SELL 1 · ผลที่เล่นซ้ำ pin null"],
  // POS HF-GC ▸ +2 (18 → 20) ◂
  ["HT2.6", "บัตรกำนัล reload พร้อมกัน 5 คำขอ ⇒ balanceAfter ไม่ซ้ำ = initial + k·satang · max = ยอดบัตร · ผลที่คืน = แถวของตัวเอง"],
  ["HT2.7", "บัตรกำนัล ตาข่ายหนี้สิน 2110: ขายซ้ำ/consumer คืน accountingDocId · JV GiftCard#<id> = 1 เสมอ · ขายตอนสวิตช์ปิด = 0 ตลอดไป"],
  ["HT3.1", "callerTx + ผู้เรียก rollback ⇒ บิล 0 แถว · OUT 0"],
  ["HT3.2", "callerTx + commit + afterSaleCommitted ⇒ xmin = xid ผู้เรียก · ไม่มีการอ่านในธุรกรรม · OUT 1"],
  ["HT4", "positive control: หน้าขายเงินสด xmin เดียว + OUT 1"],
  ["HT5", "negative control: tx ดิบ ⇒ ตัวตรวจเห็น xmin แยก + found:false ก่อน commit"],
  ["HT6.1", "[static] createSale/regCreateSale ที่ส่ง client: prisma/PrismaClient หรือ callerTx(…) เท่านั้น"],
  ["HT6.2", "[static] ไม่มี Proxy ซ่อน $transaction นอก core/caller-tx.ts (regCallerTx/flatTx หาย)"],
  ["HT6.3", "[static] core/caller-tx.ts บริสุทธิ์ (ไม่มี import) + export callerTx · service.ts export afterSaleCommitted · facade ส่งออก"],
  ["HT6.4", "[static] ทะเบียนผู้เรียก createSale (qc-pos-p1.6 U4) ไม่เปลี่ยน"],
  ["HT7", "[static] helper `\"$transaction\" in` นอกขอบเขต ถูกจดใน POS-OWNER-PENDING.md (HF-TX · HT7) ครบ/ตรงจำนวน"],
];
if (LIST) {
  for (const [id, t] of CHECKS) console.log(`${id}\t${t}`);
  process.exit(0);
}

const results = new Map<string, { ok: boolean; detail: string }>();
function chk(id: string, ok: boolean, detail: string): void {
  if (!CHECKS.some(([c]) => c === id)) throw new Error(`unregistered check ${id}`);
  results.set(id, { ok, detail });
  const title = CHECKS.find(([c]) => c === id)![1];
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${title} — ${detail}`);
}

// ═════════════════════════ 1. static (ไม่แตะ DB) ═════════════════════════
const rd = (p: string): string => {
  try {
    return readFileSync(join(ROOT, p), "utf8");
  } catch {
    return "";
  }
};
const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
function walk(dir: string): string[] {
  const out: string[] = [];
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const n of readdirSync(abs)) {
    const p = join(abs, n);
    if (statSync(p).isDirectory()) out.push(...walk(relative(ROOT, p)));
    else if (/\.(ts|tsx)$/.test(n)) out.push(relative(ROOT, p));
  }
  return out;
}
const SRC_FILES = walk("src");
const CALLER_TX_FILE = "src/lib/core/caller-tx.ts";
const SERVICE_FILE = "src/lib/modules/pos/service.ts";
const HAS_CALLER_TX = existsSync(join(ROOT, CALLER_TX_FILE));
const HAS_AFTER = /export\s+async\s+function\s+afterSaleCommitted\b/.test(stripComments(rd(SERVICE_FILE)));

console.log(`── ${SUITE} · [static] ──`);
{
  // HT6.1 — ผู้เรียกที่ส่ง client (อาร์กิวเมนต์ที่ 2) ต้องเป็น prisma/PrismaClient หรือ callerTx(…)
  //   regCreateSale = ตัวห่อของหน้าขาย (ส่งต่อ client ตรง) ⇒ ตรวจที่ผู้เรียก regCreateSale แทน (ข้อยกเว้นเดียว: ตัวห่อเอง)
  const PASS_THROUGH = new Set(["src/lib/modules/pos/register.ts#regCreateSale#client"]);
  const CLIENT_TYPES = new Set(["PrismaClient", "RegDb", "typeof prisma"]);
  const bad: string[] = [];
  const seen: string[] = [];
  for (const f of SRC_FILES) {
    if (f === SERVICE_FILE) continue;
    const text = rd(f);
    if (!/createSale/.test(text)) continue;
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const c = n.expression;
        const name = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : "";
        if ((name === "createSale" || name === "regCreateSale") && n.arguments.length >= 2) {
          const a = n.arguments[1]!;
          const txt = a.getText(sf).replace(/\s+/g, " ");
          const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
          let fnName = "";
          let paramType = "";
          for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
            if (ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isArrowFunction(p) || ts.isMethodDeclaration(p)) {
              if (!fnName && (ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name) fnName = p.name.getText(sf);
              if (!paramType && ts.isIdentifier(a)) {
                const prm = p.parameters.find((q) => q.name.getText(sf) === a.text);
                if (prm) paramType = prm.type ? prm.type.getText(sf).replace(/\s+/g, " ") : "(none)";
              }
            }
          }
          const ok =
            /^callerTx\(/.test(txt) ||
            txt === "prisma" ||
            (ts.isIdentifier(a) && CLIENT_TYPES.has(paramType)) ||
            PASS_THROUGH.has(`${f}#${fnName}#${txt}`);
          seen.push(`${f.replace("src/lib/modules/", "")}:${line} ${name}(…, ${txt})`);
          if (!ok) bad.push(`${f.replace("src/lib/modules/", "")}:${line} ${name}(…, ${txt}${paramType ? ` : ${paramType}` : ""})`);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  chk("HT6.1", bad.length === 0 && seen.length > 0, bad.length ? `ส่ง tx ดิบ ${bad.length}: ${bad.join(" · ")}` : `ครบ ${seen.length} จุด: ${seen.join(" · ")}`);

  // HT6.2 — Proxy ที่ซ่อน $transaction มีที่เดียว
  const proxies: string[] = [];
  for (const f of SRC_FILES) {
    if (f === CALLER_TX_FILE) continue;
    const code = stripComments(rd(f));
    if (/\b(regCallerTx|flatTx)\b/.test(code)) proxies.push(`${f.replace("src/lib/modules/", "")}: ${(code.match(/\b(regCallerTx|flatTx)\b/g) ?? []).length}× regCallerTx/flatTx`);
    for (let i = code.indexOf("new Proxy("); i >= 0; i = code.indexOf("new Proxy(", i + 1)) {
      if (code.slice(i, i + 500).includes("$transaction")) proxies.push(`${f.replace("src/lib/modules/", "")}: new Proxy ซ่อน $transaction`);
    }
  }
  chk("HT6.2", proxies.length === 0, proxies.length ? proxies.join(" · ") : "ไม่มี (มีแค่ core/caller-tx.ts)");

  // HT6.3 — core/caller-tx.ts บริสุทธิ์ + export · afterSaleCommitted ใน service + facade
  const ct = stripComments(rd(CALLER_TX_FILE));
  const facade = stripComments(rd("src/lib/modules/pos/index.ts"));
  const p3: string[] = [];
  if (!HAS_CALLER_TX) p3.push("ไม่มี core/caller-tx.ts");
  else {
    if (/\bimport\b|\brequire\s*\(/.test(ct)) p3.push("caller-tx.ts มี import/require");
    if (!/export\s+function\s+callerTx\s*</.test(ct)) p3.push("ไม่มี export function callerTx<T>");
    if (!/has:\s*\([^)]*\)\s*=>[^\n]*\$transaction[^\n]*false/.test(ct) || !/\$transaction"\)\s*return undefined/.test(ct)) p3.push("Proxy ไม่ได้ซ่อน $transaction (has false / get undefined)");
  }
  if (!HAS_AFTER) p3.push("service.ts ไม่ export afterSaleCommitted");
  if (!/\bafterSaleCommitted\b/.test(facade)) p3.push("pos/index.ts ไม่ส่งออก afterSaleCommitted");
  chk("HT6.3", p3.length === 0, p3.join(" · ") || "บริสุทธิ์ · export ครบ");

  // HT6.4 — ทะเบียน U4 ของ qc-pos-p1.6 (อ่านจากไฟล์ข้อสอบ) = นับจริง
  const p16 = rd("scripts/qc-pos-p1.6.mts");
  const block = /const CALL_SITES[^{]*\{([\s\S]*?)\n\};/.exec(p16)?.[1] ?? "";
  const reg: Record<string, number> = {};
  for (const m of block.matchAll(/"(src\/[^"]+)":\s*(\d+)/g)) reg[m[1]!] = Number(m[2]);
  const found: Record<string, number> = {};
  for (const f of SRC_FILES) {
    if (f === SERVICE_FILE || f === "src/lib/contracts.ts") continue;
    const n = (stripComments(rd(f)).match(/\bcreateSale\s*\(/g) ?? []).length;
    if (n) found[f] = n;
  }
  const diff = [...new Set([...Object.keys(reg), ...Object.keys(found)])].filter((f) => reg[f] !== found[f]).map((f) => `${f}:${reg[f] ?? 0}→${found[f] ?? 0}`);
  const tot = Object.values(found).reduce((a, b) => a + b, 0);
  chk("HT6.4", Object.keys(reg).length > 0 && diff.length === 0, `${tot} จุด/${Object.keys(found).length} ไฟล์${diff.length ? ` · ต่าง: ${diff.join(", ")}` : " ตรงทะเบียน"}`);

  // HT7 — helper `"$transaction" in` นอกขอบเขต (ไม่รวม pos/service.ts = ตัวเรื่องของ HF) ต้องอยู่ในบรรทัด HF-TX · HT7 ของ POS-OWNER-PENDING.md ตรงจำนวน
  const helpers: Record<string, number> = {};
  for (const f of SRC_FILES) {
    if (f === SERVICE_FILE || f === CALLER_TX_FILE) continue;
    const n = (stripComments(rd(f)).match(/["']\$transaction["']\s+in\b/g) ?? []).length;
    if (n) helpers[f.replace("src/lib/modules/", "")] = n;
  }
  const owner = rd("ledger/POS-OWNER-PENDING.md").split("\n").find((l) => l.includes("HF-TX") && l.includes("HT7")) ?? "";
  const listed: Record<string, number> = {};
  for (const m of owner.matchAll(/`([\w/.-]+\.ts)`(?:\s*×\s*(\d+))?/g)) listed[m[1]!] = Number(m[2] ?? 1);
  const d7 = [...new Set([...Object.keys(helpers), ...Object.keys(listed)])].filter((f) => helpers[f] !== listed[f]).map((f) => `${f}: src ${helpers[f] ?? 0} · จด ${listed[f] ?? 0}`);
  chk("HT7", !!owner && Object.keys(helpers).length > 0 && d7.length === 0,
    !owner ? `ไม่มีบรรทัด HF-TX · HT7 ใน POS-OWNER-PENDING.md (src มี ${Object.entries(helpers).map(([f, n]) => `${f}×${n}`).join(", ")})` : d7.length ? `ไม่ตรง: ${d7.join(" · ")}` : `ตรง ${Object.keys(helpers).length} ไฟล์ ${Object.values(helpers).reduce((a, b) => a + b, 0)} จุด`);
}

// ═════════════════════════ 2. ด่าน SKIP ═════════════════════════
const missing: string[] = [];
if (!HAS_CALLER_TX) missing.push("src/lib/core/caller-tx.ts");
if (!HAS_AFTER) missing.push("pos/service.ts afterSaleCommitted");
if (missing.length && !FORCE) {
  console.log(`\n⏭️  SKIP ${SUITE}: ยังไม่มี ${missing.join(", ")} — QC_FORCE=1 = รันต่อ (ต้องแดงตามเหตุผล)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: missing, registered: CHECKS.length })}`);
  process.exit(0);
}
if (FORCE && missing.length) console.log(`⚠️  QC_FORCE=1 — ยังขาด ${missing.join(", ")} (คาด: แดงตามเหตุผล ไม่ crash)`);

// ═════════════════════════ 3. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
{
  const mark = envMod.POS_QC_HOST_MARK as string;
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u!.includes(mark));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: เขียนได้เฉพาะ QC4 (${mark}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const svc: Any = await import("@/lib/modules/pos/service" as string);
const register: Any = await import("@/lib/modules/pos/register" as string);
const intentMod: Any = await import("@/lib/modules/pos/payment-intent" as string);
const devMod: Any = await import("@/lib/modules/pos/device" as string);
const shiftMod: Any = await import("@/lib/modules/pos/shift" as string);
const catalog: Any = await import("@/lib/modules/pos/catalog" as string);
const invSvc: Any = await import("@/lib/modules/inventory/service" as string);
const sysSvc: Any = await import("@/lib/modules/system/service" as string);
const G: Any = await import("@/lib/modules/giftcard/service" as string);
let callerTx: ((tx: Any) => Any) | null = null;
try {
  callerTx = ((await import("@/lib/core/caller-tx" as string)) as Any).callerTx ?? null;
} catch {
  callerTx = null;
}
const afterSaleCommitted: ((i: Any, id: string) => Promise<void>) | null = typeof svc.afterSaleCommitted === "function" ? svc.afterSaleCommitted : null;

const RAND = Math.random().toString(36).slice(2, 8);
const SLUG = `posqc-hftx-${RAND}`;
const EMAIL = `posqc-hftx-${RAND}-owner@qc.invalid`;
let T = "";
const wipe = { rowsLeft: -1, tenantLeft: -1, userLeft: -1 };

// ตัวสอดแนม: consumeSaleInventory อ่านบิลผ่าน prisma กลาง `posSale.findFirst({ where:{id,tenantId}, select:{status:true} })`
type Read = { id: string; found: boolean; phase: string };
const reads: Read[] = [];
let phase = "-";
const delegate = P.posSale;
const origFindFirst = delegate.findFirst.bind(delegate);
delegate.findFirst = async (a: Any) => {
  const r = await origFindFirst(a);
  if (a?.select?.status && Object.keys(a.select).length === 1 && a?.where?.id) reads.push({ id: String(a.where.id), found: !!r, phase });
  return r;
};
const spyOk = P.posSale.findFirst === delegate.findFirst;

const xmins = async (table: string, col: string, val: string): Promise<string[]> =>
  ((await P.$queryRawUnsafe(`SELECT xmin::text AS x FROM "${table}" WHERE "${col}" = $1 ORDER BY 1`, val)) as Any[]).map((r) => String(r.x));
const uniq = (a: string[]) => [...new Set(a)];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const readsOf = (id: string) => reads.filter((r) => r.id === id);
const fmtReads = (rs: Read[]) => (rs.length ? rs.map((r) => `${r.phase}:${r.found ? "found" : "found:false"}`).join(",") : "ไม่มี");

try {
  if (!spyOk) throw new Error("ติดตั้งตัวสอดแนม prisma.posSale.findFirst ไม่ได้");
  // ── fixture ──
  T = (await P.tenant.create({ data: { name: `QC HF-TX ${RAND}`, slug: SLUG } })).id;
  const U = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `HF-TX ${RAND}`, slug: `${SLUG}-a` } })).id;
  const POS = (await sysSvc.createSystem(T, "POS", `POS ${RAND}`)).id;
  const INV = (await sysSvc.createSystem(T, "INVENTORY", `INV ${RAND}`)).id;
  const MEM = (await sysSvc.createSystem(T, "MEMBER", `MEM ${RAND}`)).id;
  await sysSvc.linkUnit(T, POS, U);
  await sysSvc.linkUnit(T, INV, U);
  await sysSvc.linkUnit(T, MEM, U).catch(() => null);
  const user = await P.user.create({ data: { email: EMAIL, name: `HF-TX owner ${RAND}` } });
  await P.membership.create({ data: { userId: user.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  await P.paymentProfile.create({ data: { tenantId: T, promptpayId: "0812345678", displayName: "HF-TX" } });
  const owner = { userId: user.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const ictx = { tenantId: T, systemId: INV, actorUserId: user.id };
  const item = await invSvc.createItem(ictx, { sku: `hftx-${RAND}`, name: `HF-TX item ${RAND}`, unitLabel: "ชิ้น", costSatang: 1000 });
  await invSvc.receive(ictx, { itemId: item.id, qty: 100, costSatang: 1000, idempotencyKey: `hftx-${RAND}-recv` });
  const prod = await P.posProduct.findFirst({ where: { tenantId: T, systemId: POS, invItemId: item.id }, select: { id: true } });
  if (!prod) throw new Error("ไม่มี PosProduct ที่ซิงก์จากสินค้าคลัง");
  await catalog.setPrice({ tenantId: T, systemId: POS, actorUserId: user.id }, prod.id, 5000);
  const DEV = `hftx${RAND}d1`;
  const ctx = { tenantId: T, systemId: POS, unitId: U, deviceId: DEV };
  const rg = await devMod.registerDevice({ tenantId: T, systemId: POS, unitId: U }, owner, { name: "HF-TX", deviceCode: DEV });
  const sh = await shiftMod.openShift(ctx, owner, { deviceId: DEV, deviceLabel: "HF-TX", floatSatang: 0 });
  if (!rg?.ok || !sh?.ok) throw new Error(`fixture: device ${rg?.ok} shift ${sh?.ok}`);
  const onHand = async () => Number((await P.invItem.findUnique({ where: { id: item.id }, select: { onHand: true } })).onHand);
  const outs = async (saleId: string) => (await P.invMovement.findMany({ where: { tenantId: T, refId: saleId, type: "OUT" }, select: { qtyDelta: true } })) as Any[];
  const paidEvents = async (saleId: string) => ((await P.outboxEvent.findMany({ where: { tenantId: T, type: "pos.sale.paid" } })) as Any[]).filter((e) => e.payload?.saleId === saleId);
  const waitDone = async (saleId: string, ms = 20_000) => {
    const t0 = Date.now();
    let ev: Any[] = [];
    while (Date.now() - t0 < ms) {
      ev = await paidEvents(saleId);
      if (ev.length && ev.every((e) => e.status === "DONE")) break;
      await sleep(400);
    }
    return ev;
  };
  const line = [{ productId: prod.id, qty: 1 }];
  const stocked = (k: string) => ({ tenantId: T, unitId: U, systemId: POS, sourceModule: "POS", idempotencyKey: `hftx-${RAND}-${k}`, lines: [{ name: "HF-TX", qty: 1, unitPriceSatang: 5000, itemId: item.id, productId: prod.id }], payMethods: [{ type: "CASH", amountSatang: 5000 }] });

  // ── HT2 บัตรกำนัล (ทำก่อน — ยังไม่มีการระบายคิวอื่นของร้านนี้ค้าง) ──
  console.log("── HT2 บัตรกำนัล sell + reload ──");
  {
    const gctx = { tenantId: T, systemId: MEM, posSystemId: POS, actorUserId: user.id };
    await G.setSettings(gctx, owner, { enabled: true, reloadable: true });
    phase = "gc-sell";
    const s = await G.sell(gctx, owner, { satang: 100_000, payMethods: [{ type: "CASH", amountSatang: 100_000 }], unitId: U, recipient: { print: true }, idempotencyKey: `hftx-${RAND}-gs` });
    const sale = await P.posSale.findUnique({ where: { id: s.saleId }, select: { giftCardId: true } });
    const txnS = await P.giftCardTxn.findFirst({ where: { tenantId: T, giftCardId: s.giftCardId, type: "SELL" }, select: { id: true } });
    const xs = {
      PosSale: await xmins("PosSale", "id", s.saleId),
      PosSaleLine: await xmins("PosSaleLine", "saleId", s.saleId),
      PosPayment: await xmins("PosPayment", "saleId", s.saleId),
      GiftCard: await xmins("GiftCard", "id", s.giftCardId),
      GiftCardTxn: txnS ? await xmins("GiftCardTxn", "id", txnS.id) : [],
    };
    const evS = await waitDone(s.saleId); // xmin อ่านก่อน (การระบายแก้แถว outbox — ไม่นับ outbox ใน xmin)
    const all = uniq(Object.values(xs).flat());
    chk("HT2.1", all.length === 1 && Object.values(xs).every((v) => v.length > 0) && sale?.giftCardId === s.giftCardId,
      `xmin ${JSON.stringify(xs)} · giftCardId ${sale?.giftCardId === s.giftCardId ? "ตั้งแล้ว" : sale?.giftCardId}`);
    chk("HT2.2", evS.length === 1 && evS[0].status === "DONE", `pos.sale.paid ${evS.length} แถว · ${evS.map((e) => `${e.status}/${e.attempts}`).join(",") || "-"}`);

    // reload — ใช้บัตรใบเดิม (GiftCard ถูก update ในธุรกรรมของ reload)
    const card = await P.giftCard.findUnique({ where: { id: s.giftCardId }, select: { number: true } });
    phase = "gc-reload";
    const r = await G.reload(gctx, owner, { number: card.number, satang: 50_000, payMethods: [{ type: "CASH", amountSatang: 50_000 }], unitId: U, idempotencyKey: `hftx-${RAND}-gr` });
    const saleR = await P.posSale.findUnique({ where: { id: r.saleId }, select: { giftCardId: true } });
    const xr = {
      PosSale: await xmins("PosSale", "id", r.saleId),
      PosSaleLine: await xmins("PosSaleLine", "saleId", r.saleId),
      PosPayment: await xmins("PosPayment", "saleId", r.saleId),
      GiftCard: await xmins("GiftCard", "id", s.giftCardId),
      GiftCardTxn: await xmins("GiftCardTxn", "id", r.txnId),
    };
    const evR = await waitDone(r.saleId);
    const allR = uniq(Object.values(xr).flat());
    chk("HT2.3", allR.length === 1 && Object.values(xr).every((v) => v.length > 0) && saleR?.giftCardId === s.giftCardId,
      `xmin ${JSON.stringify(xr)} · giftCardId ${saleR?.giftCardId === s.giftCardId ? "ตั้งแล้ว" : saleR?.giftCardId}`);
    chk("HT2.4", evR.length === 1 && evR[0].status === "DONE", `pos.sale.paid ${evR.length} แถว · ${evR.map((e) => `${e.status}/${e.attempts}`).join(",") || "-"}`);

    // HT2.5 (fix 1 · F2) — สองคำขอขายพร้อมกันด้วยคีย์เดียว: ผู้แพ้รอ advisory lock ของ createSale → ได้บิลเดิม → GiftCardTxn ชน P2002
    //   → ธุรกรรมทั้งก้อน rollback (บัตรใบที่สอง + ธงบนบิลหายไปด้วย) → ทางลองใหม่เห็นคีย์แล้วคืนผลเดิม (pin null)
    phase = "gc-parallel";
    const cards0 = await P.giftCard.count({ where: { tenantId: T } });
    const idem = `hftx-${RAND}-gp`;
    const one = () => G.sell(gctx, owner, { satang: 70_000, payMethods: [{ type: "CASH", amountSatang: 70_000 }], unitId: U, recipient: { print: true }, idempotencyKey: idem });
    const settled = await Promise.allSettled([one(), one()]);
    const ok = settled.filter((x): x is PromiseFulfilledResult<Any> => x.status === "fulfilled").map((x) => x.value);
    const errs = settled.filter((x): x is PromiseRejectedResult => x.status === "rejected").map((x) => String((x.reason as Error)?.message ?? x.reason).slice(0, 80));
    const pkey = `giftcard-sell-${idem}`;
    const nCards = (await P.giftCard.count({ where: { tenantId: T } })) - cards0;
    const nSales = await P.posSale.count({ where: { tenantId: T, idempotencyKey: pkey } });
    const nSell = await P.giftCardTxn.count({ where: { tenantId: T, idempotencyKey: pkey, type: "SELL" } });
    const pins = ok.map((r) => (r.pin === null ? "null" : "set"));
    const sameCard = ok.length === 2 && ok[0].giftCardId === ok[1].giftCardId && ok[0].saleId === ok[1].saleId;
    const flag = ok.length ? await P.posSale.findUnique({ where: { id: ok[0].saleId }, select: { giftCardId: true } }) : null;
    chk("HT2.5", ok.length === 2 && nCards === 1 && nSales === 1 && nSell === 1 && sameCard && pins.filter((x) => x === "null").length === 1 && pins.filter((x) => x === "set").length === 1 && flag?.giftCardId === ok[0].giftCardId,
      `สำเร็จ ${ok.length}/2${errs.length ? ` (ล้ม: ${errs.join(" · ")})` : ""} · GiftCard +${nCards} · PosSale ${nSales} · SELL ${nSell} · บัตร/บิลเดียวกัน ${sameCard ? "ใช่" : "ไม่"} · pin ${pins.join("/")} · ธงบิล ${flag?.giftCardId === ok[0]?.giftCardId ? "ตรง" : "ไม่ตรง"}`);
  }

  // ── HT4 positive control: หน้าขายเงินสด (createSale เป็นเจ้าของ tx) ──
  console.log("── HT4 positive control ──");
  {
    const b = await onHand();
    phase = "cash";
    const r = await register.submitRegisterSale(ctx, owner, { lines: line, idempotencyKey: `hftx-${RAND}-c`, expectedGrandTotalSatang: 5000, payMethods: [{ type: "CASH", amountSatang: 5000 }], cashReceivedSatang: 5000 });
    const id = r?.ok ? String(r.saleId) : "";
    const xs = id ? uniq([...(await xmins("PosSale", "id", id)), ...(await xmins("PosSaleLine", "saleId", id)), ...(await xmins("PosPayment", "saleId", id))]) : [];
    const o = id ? await outs(id) : [];
    const a = await onHand();
    chk("HT4", !!id && xs.length === 1 && o.length === 1 && Number(o[0].qtyDelta) === -1 && a === b - 1 && !readsOf(id).some((x) => !x.found),
      id ? `xmin ${xs.join(",")} · OUT ${o.map((m) => m.qtyDelta).join(",")} · onHand ${b}→${a} · อ่าน ${fmtReads(readsOf(id))}` : `submit ${r?.code} ${String(r?.message ?? "").slice(0, 80)}`);
  }

  // ── HT1 ทางใบขอรับเงิน ──
  console.log("── HT1 ทางใบขอรับเงิน (P1.7) ──");
  {
    const ci = await intentMod.createPaymentIntent(ctx, owner, { method: "PROMPTPAY", amountSatang: 5000, idempotencyKey: `hftx-${RAND}-pi`, deviceId: DEV });
    const pid = ci?.ok ? String(ci.intent.id) : "";
    const mc = pid ? await intentMod.confirmPaymentIntentManual(ctx, owner, { intentId: pid }) : null;
    if (!pid || mc?.ok !== true) throw new Error(`HT1 fixture: intent ${ci?.code ?? "?"} confirm ${mc?.code ?? "?"}`);
    const b = await onHand();
    phase = "intent";
    const r = await register.submitRegisterSale(ctx, owner, { lines: line, idempotencyKey: `hftx-${RAND}-b`, expectedGrandTotalSatang: 5000, payMethods: [{ type: "PROMPTPAY", amountSatang: 5000, reference: pid }] });
    const id = r?.ok ? String(r.saleId) : "";
    if (!id) throw new Error(`HT1 submit: ${r?.code} ${String(r?.message ?? "").slice(0, 80)}`);
    const intentRow = await P.posPaymentIntent.findUnique({ where: { id: pid }, select: { status: true, saleId: true } });
    const xs = {
      PosSale: await xmins("PosSale", "id", id),
      PosSaleLine: await xmins("PosSaleLine", "saleId", id),
      PosPayment: await xmins("PosPayment", "saleId", id),
      PosPaymentIntent: await xmins("PosPaymentIntent", "id", pid),
    };
    chk("HT1.1", uniq(Object.values(xs).flat()).length === 1 && Object.values(xs).every((v) => v.length > 0) && intentRow?.status === "CONSUMED" && intentRow?.saleId === id,
      `xmin ${JSON.stringify(xs)} · intent ${intentRow?.status}`);
    const o = await outs(id);
    const a = await onHand();
    chk("HT1.2", o.length === 1 && Number(o[0].qtyDelta) === -1 && a === b - 1, `OUT ${o.map((m) => m.qtyDelta).join(",") || "ไม่มี"} · onHand ${b}→${a}`);
    const ev = await waitDone(id, 8_000);
    chk("HT1.3", ev.length === 1, `pos.sale.paid ${ev.length} แถว · ${ev.map((e) => `${e.status}/${e.attempts}`).join(",") || "-"}`);
    const rs = readsOf(id);
    chk("HT1.4", !rs.some((x) => !x.found) && rs.some((x) => x.found), `อ่าน ${fmtReads(rs)}`);
  }

  // ── HT3 สัญญา callerTx ──
  console.log("── HT3 สัญญา callerTx ──");
  if (!callerTx || !afterSaleCommitted) {
    chk("HT3.1", false, `ยังไม่มี ${missing.join(", ")}`);
    chk("HT3.2", false, `ยังไม่มี ${missing.join(", ")}`);
  } else {
    const wrap = callerTx;
    let sid = "";
    let threw = "";
    phase = "ht3-rollback";
    try {
      await P.$transaction(async (tx: Any) => {
        sid = (await svc.createSale(stocked("rb"), wrap(tx))).saleId;
        throw new Error("HFTX_ROLLBACK");
      }, { timeout: 20_000, maxWait: 10_000 });
    } catch (e) {
      threw = (e as Error).message;
    }
    const n = sid ? await P.posSale.count({ where: { id: sid } }) : -1;
    const o = sid ? await outs(sid) : [];
    chk("HT3.1", threw === "HFTX_ROLLBACK" && !!sid && n === 0 && o.length === 0 && readsOf(sid).length === 0, `ผู้เรียก throw "${threw}" · บิล ${n} แถว · OUT ${o.length} · อ่าน ${fmtReads(readsOf(sid))}`);

    const b = await onHand();
    const input = stocked("cm");
    let callerXid = "";
    let inside: Read[] = [];
    phase = "ht3-in-tx";
    const saleId: string = await P.$transaction(async (tx: Any) => {
      callerXid = String(((await tx.$queryRawUnsafe(`SELECT pg_current_xact_id()::xid::text AS x`)) as Any[])[0].x);
      const r = await svc.createSale(input, wrap(tx));
      inside = [...readsOf(r.saleId)];
      return r.saleId;
    }, { timeout: 20_000, maxWait: 10_000 });
    const before = (await outs(saleId)).length;
    phase = "ht3-after";
    await afterSaleCommitted(input, saleId);
    const o2 = await outs(saleId);
    const a = await onHand();
    const xs = uniq([...(await xmins("PosSale", "id", saleId)), ...(await xmins("PosSaleLine", "saleId", saleId)), ...(await xmins("PosPayment", "saleId", saleId))]);
    chk("HT3.2", xs.length === 1 && xs[0] === callerXid && inside.length === 0 && before === 0 && o2.length === 1 && a === b - 1 && !readsOf(saleId).some((x) => !x.found),
      `xmin ${xs.join(",")} vs ผู้เรียก ${callerXid} · อ่านในธุรกรรม ${fmtReads(inside)} · OUT ก่อน/หลัง afterSaleCommitted ${before}/${o2.length} · onHand ${b}→${a}`);
  }

  // ── HT5 negative control: tx ดิบ ──
  console.log("── HT5 negative control (tx ดิบ) ──");
  {
    let callerXid = "";
    let inside: Read[] = [];
    phase = "ht5-in-tx";
    const saleId: string = await P.$transaction(async (tx: Any) => {
      callerXid = String(((await tx.$queryRawUnsafe(`SELECT pg_current_xact_id()::xid::text AS x`)) as Any[])[0].x);
      const r = await svc.createSale(stocked("raw"), tx);
      inside = [...readsOf(r.saleId)];
      return r.saleId;
    }, { timeout: 20_000, maxWait: 10_000 });
    const xs = uniq(await xmins("PosSaleLine", "saleId", saleId));
    const split = xs.length > 0 && !xs.includes(callerXid);
    const preRead = inside.some((x) => !x.found);
    chk("HT5", split && preRead, `ตัวตรวจเห็น: xmin บรรทัด ${xs.join(",")} vs ผู้เรียก ${callerXid} (${split ? "แยก" : "ไม่แยก"}) · อ่านในธุรกรรม ${fmtReads(inside)}`);
  }

  // POS HF-GC ▸ HT2.6 + HT2.7 — ทำท้ายสุด (ผูกบัญชีให้ร้านชั่วคราวนี้ · ไม่กระทบข้อก่อนหน้า) · ก้อนของตัวเอง: ล้ม = แดงสองข้อนี้ ไม่ลากข้ออื่น ◂
  console.log("── HT2.6/HT2.7 บัตรกำนัล (HF-GC) ──");
  try {
    const gctx = { tenantId: T, systemId: MEM, posSystemId: POS, actorUserId: user.id };
    const accSys = await sysSvc.createSystem(T, "ACCOUNT", `ACC ${RAND}`);
    const accSvc: Any = await import("@/lib/modules/account/service" as string);
    const gl: Any = await import("@/lib/modules/account/gl" as string);
    await accSvc.saveSettings(T, accSys.id, { orgPrefix: "บริษัท", orgName: `HF-GC QC ${RAND} จำกัด`, taxId: "0835565009999", branchCode: "00000", vatRegistered: false, vatRateBp: 700, taxPointBasis: "ON_ISSUE", defaultDueDays: 30, defaultValidDays: 30 });
    await gl.ensureAccounting({ tenantId: T, systemId: accSys.id });
    const link = await P.accountSystemLink.create({ data: { tenantId: T, systemId: accSys.id, linkedKind: "POS", linkedId: POS } });
    await G.setSettings(gctx, owner, { enabled: true, reloadable: true, accountingLink: true });
    const consMod: Any = await import("@/lib/outbox-consumers" as string);
    const soldH: ((e: Any) => Promise<void>) | undefined = consMod?.consumers?.["giftcard.sold"];
    const jvCount = (cardId: string) => P.accountJournalEntry.count({ where: { tenantId: T, refType: "GiftCard", refId: cardId } }) as Promise<number>;
    const docOf = async (cardId: string) => ((await P.giftCard.findUnique({ where: { id: cardId }, select: { accountingDocId: true } })) as Any)?.accountingDocId ?? null;
    const soldEvt = (cardId: string) => P.outboxEvent.findFirst({ where: { tenantId: T, idempotencyKey: `giftcard.sold#${cardId}` } });
    const waitSold = async (cardId: string, ms = 20_000) => {
      const t0 = Date.now();
      let e: Any = null;
      while (Date.now() - t0 < ms) {
        e = await soldEvt(cardId);
        if (e && e.status !== "PENDING" && e.status !== "PROCESSING") break;
        await sleep(400);
      }
      return e;
    };
    const sellK = (k: string, satang = 100_000) => G.sell(gctx, owner, { satang, payMethods: [{ type: "CASH", amountSatang: satang }], unitId: U, recipient: { print: true }, idempotencyKey: `hfgc-${RAND}-${k}` });
    const runSold = async (cardId: string, n: number, parallel: boolean): Promise<string[]> => {
      const errs: string[] = [];
      const evt = await soldEvt(cardId);
      if (!evt || typeof soldH !== "function") return [!evt ? "ไม่มีแถว giftcard.sold" : "ไม่มี consumers[giftcard.sold]"];
      const one = () => soldH(evt).catch((e: Error) => { errs.push(String(e?.message ?? e).slice(0, 60)); });
      if (parallel) await Promise.all(Array.from({ length: n }, one));
      else for (let i = 0; i < n; i++) await one();
      return errs;
    };

    // ── HT2.6 เติมพร้อมกัน 5 คำขอ ──
    {
      phase = "gc-reload-par";
      const s = await sellK("r0", 100_000);
      const num = ((await P.giftCard.findUnique({ where: { id: s.giftCardId }, select: { number: true } })) as Any).number as string;
      const SAT = 10_000;
      const settled = await Promise.allSettled(Array.from({ length: 5 }, (_, i) =>
        G.reload(gctx, owner, { number: num, satang: SAT, payMethods: [{ type: "CASH", amountSatang: SAT }], unitId: U, idempotencyKey: `hfgc-${RAND}-rl${i}` })));
      const ok = settled.filter((x): x is PromiseFulfilledResult<Any> => x.status === "fulfilled").map((x) => x.value);
      const errs = settled.filter((x): x is PromiseRejectedResult => x.status === "rejected").map((x) => String((x.reason as Error)?.message ?? x.reason).slice(0, 60));
      const rows = (await P.giftCardTxn.findMany({ where: { tenantId: T, giftCardId: s.giftCardId, type: "RELOAD" }, select: { id: true, balanceAfter: true } })) as Any[];
      const bal = ((await P.giftCard.findUnique({ where: { id: s.giftCardId }, select: { balanceSatang: true } })) as Any).balanceSatang as number;
      const got = rows.map((r) => Number(r.balanceAfter)).sort((a, b) => a - b);
      const want = [1, 2, 3, 4, 5].map((k) => 100_000 + k * SAT);
      const byId = new Map(rows.map((r) => [r.id as string, Number(r.balanceAfter)]));
      const retMatch = ok.length === 5 && ok.every((r) => byId.get(r.txnId) === r.balanceAfter);
      chk("HT2.6", ok.length === 5 && rows.length === 5 && JSON.stringify(got) === JSON.stringify(want) && Math.max(...got) === bal && retMatch,
        `สำเร็จ ${ok.length}/5${errs.length ? ` (ล้ม: ${errs.join(" · ")})` : ""} · RELOAD ${rows.length} แถว · balanceAfter ${got.join(",")} (คาด ${want.join(",")}) · ยอดบัตร ${bal} · ผลที่คืนตรงแถว ${retMatch ? "ใช่" : "ไม่"}`);
    }

    // ── HT2.7 ตาข่ายหนี้สิน 2110 ──
    {
      const p: string[] = [];
      const notes: string[] = [];
      // ขายปกติ (สวิตช์เปิด + เชื่อมบัญชี)
      phase = "gc-acc-sell";
      const s1 = await sellK("a1");
      const d0 = await docOf(s1.giftCardId);
      const n0 = await jvCount(s1.giftCardId);
      notes.push(`ขาย: doc ${d0 ? "ตั้ง" : "null"} · JV ${n0}`);
      if (!s1.accountingDocId || d0 !== s1.accountingDocId || n0 !== 1) p.push(`ขายปกติ: doc ${s1.accountingDocId ? "ตั้ง" : "null"}/${d0 ? "ตั้ง" : "null"} · JV ${n0} (คาด 1)`);
      await waitSold(s1.giftCardId);
      // (a) ช่วงพังหลัง commit → ขายซ้ำคีย์เดิม
      await P.giftCard.update({ where: { id: s1.giftCardId }, data: { accountingDocId: null } });
      const ra = await sellK("a1");
      const da = await docOf(s1.giftCardId);
      const na = await jvCount(s1.giftCardId);
      notes.push(`(a) ขายซ้ำ: คืน ${ra.accountingDocId ? "ตั้ง" : "null"} · แถว ${da ? "ตั้ง" : "null"} · JV ${na}`);
      if (!ra.accountingDocId || da !== ra.accountingDocId || na !== 1 || ra.pin !== null) p.push(`(a) ขายซ้ำ: คืน ${ra.accountingDocId ?? "null"} · แถว ${da ?? "null"} · JV ${na} · pin ${ra.pin === null ? "null" : "set"}`);
      // (b) ช่วงพังหลัง commit → consumer เป็นตาข่าย (×2 ต่อกัน + ×2 พร้อมกัน)
      await P.giftCard.update({ where: { id: s1.giftCardId }, data: { accountingDocId: null } });
      const eb1 = await runSold(s1.giftCardId, 2, false);
      const db1 = await docOf(s1.giftCardId);
      await P.giftCard.update({ where: { id: s1.giftCardId }, data: { accountingDocId: null } });
      const eb2 = await runSold(s1.giftCardId, 2, true);
      const db2 = await docOf(s1.giftCardId);
      const nb = await jvCount(s1.giftCardId);
      notes.push(`(b) consumer ต่อกัน/พร้อมกัน: doc ${db1 ? "ตั้ง" : "null"}/${db2 ? "ตั้ง" : "null"} · JV ${nb}${eb1.length + eb2.length ? ` · throw ${[...eb1, ...eb2].join(" · ")}` : ""}`);
      if (!db1 || !db2 || db1 !== s1.accountingDocId || db2 !== s1.accountingDocId || nb !== 1 || eb1.length || eb2.length) p.push(`(b) consumer: doc ${db1 ?? "null"}/${db2 ?? "null"} · JV ${nb} · throw ${eb1.length + eb2.length}`);
      // (b2) ช่วงพังก่อนลงบัญชี: ขายตอนตัดการเชื่อม (ยังไม่มี JV) → เชื่อมกลับ → consumer ลงให้ 1 ใบ
      await P.accountSystemLink.update({ where: { id: link.id }, data: { enabled: false } });
      phase = "gc-acc-unlinked";
      const s2 = await sellK("a2");
      await waitSold(s2.giftCardId);
      const n2a = await jvCount(s2.giftCardId);
      await P.accountSystemLink.update({ where: { id: link.id }, data: { enabled: true } });
      const e2 = await runSold(s2.giftCardId, 2, true);
      const d2 = await docOf(s2.giftCardId);
      const n2b = await jvCount(s2.giftCardId);
      notes.push(`(b2) ไม่มี JV → consumer: JV ${n2a}→${n2b} · doc ${d2 ? "ตั้ง" : "null"}`);
      if (s2.accountingDocId || n2a !== 0 || n2b !== 1 || !d2 || e2.length) p.push(`(b2) ไม่มี JV: ขายคืน ${s2.accountingDocId ?? "null"} · JV ${n2a}→${n2b} · doc ${d2 ?? "null"}${e2.length ? ` · throw ${e2.join(" · ")}` : ""}`);
      // (c) ขายตอนสวิตช์ปิด → เปิดสวิตช์ + consumer ⇒ ไม่ลงย้อนหลัง
      await G.setSettings(gctx, owner, { accountingLink: false });
      phase = "gc-acc-off";
      const s3 = await sellK("a3");
      await waitSold(s3.giftCardId);
      await G.setSettings(gctx, owner, { accountingLink: true });
      const e3 = await runSold(s3.giftCardId, 2, false);
      const d3 = await docOf(s3.giftCardId);
      const n3 = await jvCount(s3.giftCardId);
      notes.push(`(c) สวิตช์ปิดตอนขาย: JV ${n3} · doc ${d3 ? "ตั้ง" : "null"}`);
      if (s3.accountingDocId || d3 || n3 !== 0 || e3.length) p.push(`(c) สวิตช์ปิด: ขายคืน ${s3.accountingDocId ?? "null"} · doc ${d3 ?? "null"} · JV ${n3}${e3.length ? ` · throw ${e3.join(" · ")}` : ""}`);
      chk("HT2.7", p.length === 0, p.length ? p.join(" | ") : notes.join(" · "));
    }
  } catch (e) {
    console.log(`💥 HF-GC block: ${(e as Error)?.stack?.split("\n").slice(0, 4).join(" | ")}`);
  }
} catch (e) {
  console.log(`💥 ${SUITE}: ${(e as Error)?.stack?.split("\n").slice(0, 4).join(" | ")}`);
} finally {
  delegate.findFirst = origFindFirst;
  if (T) {
    const t = (await P.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, T)) as Any[];
    if (t.length && t[0].slug === SLUG) {
      const tables = ((await P.$queryRawUnsafe(
        `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
         WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
      )) as Any[]).map((r: Any) => String(r.t));
      await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, T).catch(() => {});
      let pending = [...tables];
      for (let pass = 0; pass < 10 && pending.length; pass++) {
        const next: string[] = [];
        for (const tb of pending) {
          try {
            await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, T);
          } catch {
            next.push(tb);
          }
        }
        pending = next;
      }
      await P.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, T, SLUG).catch(() => {});
      let left = 0;
      for (const tb of tables) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, T)) as Any[])[0]?.n ?? 0);
      wipe.rowsLeft = left;
      wipe.tenantLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`, T)) as Any[])[0]?.n ?? 0);
    }
  }
  await P.user.deleteMany({ where: { email: EMAIL } }).catch(() => {});
  wipe.userLeft = await P.user.count({ where: { email: EMAIL } });
  await P.$disconnect?.();
}

for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ไม่ได้รัน (ล้มก่อนถึงข้อนี้)");
const failed = CHECKS.map(([id]) => id).filter((id) => !results.get(id)!.ok);
const residue = Math.max(0, wipe.rowsLeft) + Math.max(0, wipe.tenantLeft) + Math.max(0, wipe.userLeft);
console.log(`\n===== ${SUITE} ===== ผ่าน ${CHECKS.length - failed.length}/${CHECKS.length}${FORCE ? " (QC_FORCE)" : ""} · ล้างร้านชั่วคราว: แถวค้าง ${wipe.rowsLeft} · ร้าน ${wipe.tenantLeft} · ผู้ใช้ ${wipe.userLeft}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: CHECKS.length, passed: CHECKS.length - failed.length, failed, skipped: false, forced: FORCE, missing, residue })}`);
process.exit(failed.length || residue ? 1 : 0);
