// QC — POS RUN ใบ P2.13: สกิล `shark-pos-api` (ชั้น a ของ "สกิลทดสอบด้วย agent" — §4) · harness ในโปรเซส
//   เขียนก่อนสร้าง (fail-before) · ชั้น b (agent จริง 5 งานกับเซิร์ฟเวอร์ QC) = CONTROLLER-RUN ตอน merge (wo-notes/pos-P2.13-agent.md)
// requires: (ไม่ต้อง seed — ร้านชั่วคราวของ harness เอง)
//
// สัญญา (ผู้สร้างเขียน SKILL.md + recipes.md มือ · EN · คัดลอกไป /root/.claude/skills/shark-pos-api/ ให้ตรงไบต์):
//   .claude/skills/shark-pos-api/SKILL.md — front-matter `name: shark-pos-api` + `description:` · When to use · Setup (https://shark.in.th/api/v1/pos ·
//     Authorization: Bearer · X-Shark-System) · Conventions (satang · unitId · Idempotency-Key · error.code · page/pageSize) ·
//     Safety (never void/refund/cancel unless the user says so · confirm: true + reason · quote before selling · never ask for PINs)
//   .claude/skills/shark-pos-api/references/recipes.md — สูตร ≥ 8 ก้อน ```bash curl …``` ครอบ: list units · quote · sell · receipt · refund part ·
//     accept order · mark 86 · daily report CSV · ทุกก้อนเขียนตามด้วยบรรทัด `Error branch: `<status> <code>`` (หนึ่งรหัสจากชุดที่ harness เล่นซ้ำได้:
//     unauthorized · scope_missing · system_mismatch · idempotency_required (write) · confirm_required (danger) · not_found · validation)
//   ตัวแปรที่ใช้ในสูตรได้ (harness แทนค่าให้ — ชื่ออื่น = สูตรเสีย):
//     $SHARK_API_KEY · $SHARK_SYSTEM_ID · $UNIT_ID · $PRODUCT_ID · $SALE_ID · $LINE_ID · $ORDER_ID · $CHANNEL_ID · $FROM · $TO · $(uuidgen) / $IDEMPOTENCY_KEY
//   ฟิกซ์เจอร์ที่ค่าเหล่านี้ชี้ (ตัวเลขในสูตรใช้ค่าตายตัวนี้ได้):
//     PRODUCT_ID = สินค้าคลัง ราคา 4500 สตางค์ (VAT รวมในราคา · สต็อก 100) ที่สาขา UNIT_ID · SALE_ID = บิล PAID ของ PRODUCT_ID ×2 (9000 · CASH) · LINE_ID = บรรทัดนั้น
//     ORDER_ID = ออเดอร์ NEW (PICKUP) ของ CHANNEL_ID (LINE MAN · MANUAL · PLATFORM) PRODUCT_ID ×1 · FROM..TO = 7 วันไทยล่าสุด · คีย์ = pos-admin ผูก SHARK_SYSTEM_ID
//     หลังแต่ละสูตร harness คืนขาย PRODUCT_ID (สูตร 86 ไม่ทำให้สูตรถัดไปพัง)
// ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 skill fix): K7b K8b (มติ skill fix · ledger/wo-notes/pos-P2.13-review.md ท้ายไฟล์ · ช่องโหว่ 1 2 ของ agent test) — 10 + 2 = 12 ข้อ
//     K7b = สูตรต้องรันได้ทันทีหลัง export ตัวแปร: ห้ามมี $VAR / $(uuidgen) อยู่ในเครื่องหมาย ' (shell ไม่แทนค่า) — ใช้ body ใน " หรือ heredoc
//     K8b = มีสูตร POST /orders (ช่องทาง CUSTOM ด้วย $CHANNEL_CODE · startStatus NEW) + สูตร POST /orders/{id}/accept · เล่นซ้ำ: สร้าง → 2xx ออเดอร์ NEW บนช่องทาง CUSTOM ·
//           รับด้วยสูตร accept (ORDER_ID = ออเดอร์ที่เพิ่งสร้าง) → 2xx สถานะ ACCEPTED
//     ตัวแปรเพิ่ม: $CHANNEL_CODE = รหัสช่องทาง CUSTOM ของฟิกซ์เจอร์ (`PHONE` · adapter NONE · payout DIRECT) ที่สาขา UNIT_ID
//
// 🔴 กติกา: SKIP เมื่อยังไม่มี route/SKILL.md (exit 0 + เหตุผล) · QC_FORCE=1 = แดงตามเหตุผล ไม่ crash · --list ไม่แตะ DB · --no-db = K1–K7 (อ่านไฟล์ล้วน)
//    ฐาน QC4 เท่านั้น · ร้านชั่วคราว `posqc-p213s-<rand>` ลบทั้งร้านใน finally + ถังเพดานของคีย์รอบนี้ · globalThis.fetch = ตัวกั้น
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-api-skill";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P2.13S-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  D("K1", "S", "[§4 มติ 8] skills/shark-pos-api/SKILL.md มี front-matter name: shark-pos-api + description (ASCII) · หัวข้อ When to use / Setup / Conventions / Safety"), // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 DOC-2) มติ 4
  D("K2", "S", "[§4] Setup: https://shark.in.th/api/v1/pos · Authorization: Bearer · X-Shark-System · ชี้ไป references/endpoints.md + recipes.md"),
  D("K3", "S", "[§3 §4] Conventions: satang (จำนวนเต็ม) · unitId · Idempotency-Key · แยกทางด้วย error.code · page/pageSize · Accept: text/csv"),
  D("K4", "S", "[§4 safety] never void/refund/cancel โดยผู้ใช้ไม่ได้สั่ง · confirm: true + reason · quote ก่อนขาย · never ask for PINs (ไม่มีทาง PIN ใน API)"),
  D("K5", "S", "[มติ 8] references/endpoints.md (สร้างจาก gen-pos-api-docs) มีทุก `METHOD path` ของ 48 op"),
  D("K6", "S", "[§4] สำเนา /root/.claude/skills/shark-pos-api และ /root/.claude-b/skills/shark-pos-api/{SKILL.md, references/recipes.md, references/endpoints.md} ตรงไบต์กับของ repo (skills/shark-pos-api)"), // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 DOC-2) มติ 4
  D("K7", "S", "[§4] recipes.md ≥ 8 ก้อน curl แกะได้ (method · URL ใต้ /api/v1/pos · ตัวแปรที่รู้จักเท่านั้น · JSON body ถูก) · ครอบ 8 งาน · write มี Idempotency-Key · danger มี confirm:true+reason · ทุกก้อนมี Error branch ที่เล่นซ้ำได้"),
  D("K8", "M", "[§4 ชั้น a] เล่นซ้ำทุกสูตรผ่าน route ในโปรเซส (แทนค่าฟิกซ์เจอร์) → 200 ทุกก้อน · สูตร CSV ได้ text/csv"),
  D("K9", "M", "[§4 ชั้น a] ทุกสูตร: กลายรูปตาม Error branch ที่เขียนไว้ → ได้สถานะ + error.code ตรงตามที่เขียน"),
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 skill fix)
  D("K7b", "S", "[skill fix ช่องโหว่ 2] ทุกก้อน curl ใน recipes.md ไม่มี $VAR / $(uuidgen) อยู่ในเครื่องหมาย ' (รันได้ทันทีหลัง export ตัวแปร)"),
  D("K8b", "M", "[skill fix ช่องโหว่ 1] มีสูตร POST /orders (CUSTOM · $CHANNEL_CODE · startStatus NEW) + POST /orders/{id}/accept · เล่นซ้ำ: สร้าง 2xx NEW บน CUSTOM → รับ 2xx ACCEPTED"),
  D("K10", "-", "QC4 คืนสภาพ: ร้านชั่วคราว 0 แถว (คีย์ · แถวกันซ้ำ · บิล · ออเดอร์) + Tenant ถูกลบ · ถังเพดานของคีย์รอบนี้ 0"),
];
if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ (id · X · หัวข้อ)`);
  for (const [id, x, t] of CHECKS) console.log(`${id}\t${x}\t${t}`);
  process.exit(0);
}

// ═════════════════════════ ตัวช่วย ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , t]) => [id, t]));
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = id.startsWith("P2.13S-") ? id : `P2.13S-${id}`;
  if (!TITLE.has(full)) throw new Error(`id ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
const rd = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const short = (v: unknown, n = 160) => {
  let s: string;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  return (s ?? "undefined").slice(0, n);
};
const joinP = (p: string[], ok = "ครบ") => p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || ok;
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
const ASCII = /^[\x20-\x7e]*$/;

/** P213_SKILL_DIR = ตัวควบคุมบวกของตัวแกะ (ชี้โฟลเดอร์สกิลตัวอย่าง · ใช้ตอนเขียนข้อสอบเท่านั้น — ด่านจริงไม่ตั้ง) */
const SKILL_DIR = process.env.P213_SKILL_DIR || join(ROOT, "skills/shark-pos-api"); // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 DOC-2) มติ 4: สกิลในรีโป (เดิม .claude/skills/…)
/** ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 DOC-2) มติ 4: สำเนาบ้านทั้งสอง (บัญชี A · B) ต้องตรงไบต์กับของรีโป (scripts/sync-skills.sh) ◂ */
const HOME_DIRS = ["/root/.claude/skills/shark-pos-api", "/root/.claude-b/skills/shark-pos-api"];
const FILES = ["SKILL.md", "references/recipes.md", "references/endpoints.md"] as const;
const ROUTE_FILE = "src/app/api/v1/pos/[...path]/route.ts";
/** 48 op (ตรงกับ OPS_SPEC ของ qc-pos-p2.13) — `METHOD path` */
const OP_PATHS = [
  "GET /units", "GET /sales", "GET /sales/{id}", "GET /sales/{id}/receipt", "POST /sales/quote", "POST /sales", "POST /sales/{id}/void", "GET /sales/{id}/refundable",
  "POST /sales/{id}/refund", "POST /sales/{id}/tax-invoice", "GET /shifts", "GET /shifts/current", "GET /shifts/{id}/x-report", "GET /shifts/{id}/z-report", "GET /devices",
  "GET /products", "GET /products/lookup", "GET /products/{id}/options", "POST /products", "PATCH /products/{id}", "PUT /products/{id}/price", "POST /products/{id}/archive",
  "POST /products/{id}/availability", "GET /channels", "POST /channels/{id}/pause", "POST /channels/{id}/resume", "GET /orders", "GET /orders/{id}", "POST /orders",
  "POST /orders/{id}/accept", "POST /orders/{id}/reject", "POST /orders/{id}/preparing", "POST /orders/{id}/ready", "POST /orders/{id}/complete", "POST /orders/{id}/cancel",
  "POST /orders/{id}/pay", "GET /reports/summary", "GET /reports/daily", "GET /reports/products", "GET /reports/staff", "GET /reports/payments", "GET /reports/margin",
  "GET /reports/shifts", "GET /reports/tax", "GET /reports/channels", "GET /reports/branches", "GET /reports/hourly", "GET /reports/anomalies",
] as const;
const VARS = ["SHARK_API_KEY", "SHARK_SYSTEM_ID", "UNIT_ID", "PRODUCT_ID", "SALE_ID", "LINE_ID", "ORDER_ID", "CHANNEL_ID", "FROM", "TO", "IDEMPOTENCY_KEY",
  "CHANNEL_CODE", /* ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 skill fix) */
] as const;
const ID_VARS = ["UNIT_ID", "PRODUCT_ID", "SALE_ID", "LINE_ID", "ORDER_ID", "CHANNEL_ID"] as const;
const ERROR_CODES = ["unauthorized", "scope_missing", "system_mismatch", "idempotency_required", "confirm_required", "not_found", "validation"] as const;
type ErrCode = (typeof ERROR_CODES)[number];
/** 8 งานที่สูตรต้องครอบ (§4) — [ชื่อ, method, path ที่จับคู่, ต้องเป็น CSV?] */
const TASKS: readonly [string, string, RegExp, boolean][] = [
  ["list units", "GET", /^\/units$/, false],
  ["quote", "POST", /^\/sales\/quote$/, false],
  ["sell", "POST", /^\/sales$/, false],
  ["receipt", "GET", /^\/sales\/[^/]+\/receipt$/, false],
  ["refund part", "POST", /^\/sales\/[^/]+\/refund$/, false],
  ["accept order", "POST", /^\/orders\/[^/]+\/accept$/, false],
  ["mark 86", "POST", /^\/products\/[^/]+\/availability$/, false],
  ["daily report CSV", "GET", /^\/reports\/daily$/, true],
];

// ── ตัวแกะคำสั่ง curl (shell แบบย่อ: ' " \ ต่อบรรทัด · ชิ้นติดกันรวมเป็นคำเดียว) ──
type Recipe = { title: string; raw: string; error: { status: number; code: string } | null; problems: string[] };
type Parsed = { method: string; path: string; query: string; headers: Record<string, string>; body: string | null; problems: string[] };
function shellWords(cmd: string): { words: string[]; err: string } {
  const words: string[] = [];
  let cur = "";
  let has = false;
  let i = 0;
  const s = cmd.replace(/\\\r?\n/g, " ");
  while (i < s.length) {
    const c = s[i]!;
    if (c === "'") {
      const j = s.indexOf("'", i + 1);
      if (j < 0) return { words, err: "เครื่องหมาย ' ไม่ปิด" };
      cur += s.slice(i + 1, j);
      has = true;
      i = j + 1;
      continue;
    }
    if (c === '"') {
      i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === "\\" && i + 1 < s.length && '"\\$`'.includes(s[i + 1]!)) {
          cur += s[i + 1];
          i += 2;
          continue;
        }
        cur += s[i];
        i++;
      }
      if (i >= s.length) return { words, err: 'เครื่องหมาย " ไม่ปิด' };
      has = true;
      i++;
      continue;
    }
    if (c === "\\" && i + 1 < s.length) {
      cur += s[i + 1];
      has = true;
      i += 2;
      continue;
    }
    if (/\s/.test(c)) {
      if (has) words.push(cur);
      cur = "";
      has = false;
      i++;
      continue;
    }
    cur += c;
    has = true;
    i++;
  }
  if (has) words.push(cur);
  return { words, err: "" };
}
function substitute(cmd: string, vals: Record<string, string>, freshIdem: () => string): { out: string; unknown: string[] } {
  const unknown: string[] = [];
  let out = cmd.replace(/\$\(uuidgen\)/g, () => freshIdem());
  out = out.replace(/\$\{([A-Z_][A-Z0-9_]*)\}|\$([A-Z_][A-Z0-9_]*)/g, (m, a: string | undefined, b: string | undefined) => {
    const n = (a ?? b)!;
    if (n === "IDEMPOTENCY_KEY") return freshIdem();
    if (n in vals) return vals[n]!;
    unknown.push(n);
    return m;
  });
  return { out, unknown };
}
function parseCurl(cmd: string): Parsed {
  const r: Parsed = { method: "", path: "", query: "", headers: {}, body: null, problems: [] };
  const { words, err } = shellWords(cmd.trim());
  if (err) r.problems.push(err);
  if (words[0] !== "curl") r.problems.push("ไม่ขึ้นต้นด้วย curl");
  let method = "";
  let url = "";
  let getMode = false;
  const urlencoded: string[] = [];
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!;
    const next = () => words[++i] ?? "";
    if (w === "-X" || w === "--request") method = next().toUpperCase();
    else if (w === "-H" || w === "--header") {
      const h = next();
      const k = h.indexOf(":");
      if (k > 0) r.headers[h.slice(0, k).trim().toLowerCase()] = h.slice(k + 1).trim();
      else r.problems.push(`หัวผิดรูป ${h}`);
    } else if (w === "-d" || w === "--data" || w === "--data-raw" || w === "--data-binary") r.body = next();
    else if (w === "--data-urlencode") urlencoded.push(next());
    else if (w === "-G" || w === "--get") getMode = true;
    else if (/^-[sSiLfk]+$/.test(w) || ["--silent", "--show-error", "--fail", "--location", "--include", "--compressed"].includes(w)) continue;
    else if (/^https?:\/\//.test(w)) url = w;
    else if (w.startsWith("-")) r.problems.push(`ตัวเลือกที่ไม่รู้จัก ${w}`);
    else r.problems.push(`คำเกิน ${short(w, 30)}`);
  }
  if (getMode && r.body !== null) {
    urlencoded.push(r.body);
    r.body = null;
  }
  r.method = method || (r.body !== null ? "POST" : "GET");
  const m = /^https:\/\/shark\.in\.th\/api\/v1\/pos(\/[^?#]*)?(\?[^#]*)?$/.exec(url);
  if (!m) r.problems.push(`URL ไม่ใช่ https://shark.in.th/api/v1/pos/… (${short(url, 60)})`);
  r.path = m?.[1] ?? "";
  const q = new URLSearchParams((m?.[2] ?? "").replace(/^\?/, ""));
  for (const u of urlencoded) {
    const k = u.indexOf("=");
    if (k > 0) q.append(u.slice(0, k), u.slice(k + 1));
  }
  r.query = q.toString();
  if (r.body !== null) {
    try {
      JSON.parse(r.body);
    } catch {
      r.problems.push("body ไม่ใช่ JSON");
    }
  }
  return r;
}
function recipesOf(md: string): Recipe[] {
  const out: Recipe[] = [];
  const re = /```(?:bash|sh|shell)?\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    const block = m[1]!.trim();
    if (!/^curl\b/m.test(block)) continue;
    const before = md.slice(0, m.index);
    const title = (/(^|\n)#{2,4}\s+([^\n]+)\s*$/.exec(before.slice(Math.max(0, before.lastIndexOf("\n#"))))?.[2] ?? "").trim() || `recipe ${out.length + 1}`;
    const after = md.slice(m.index + m[0].length, (() => {
      const n = md.slice(m.index + m[0].length).search(/```|\n#{2,4}\s/);
      return n < 0 ? md.length : m.index + m[0].length + n;
    })());
    const e = /Error branch:\s*`?\s*(\d{3})\s+([a-z_]+)\s*`?/i.exec(after);
    const cmds = block.split(/\n(?=curl\b)/).filter((c) => /^curl\b/.test(c.trim()));
    const problems: string[] = [];
    if (cmds.length !== 1) problems.push(`ก้อนนี้มี curl ${cmds.length} คำสั่ง (ต้อง 1)`);
    out.push({ title, raw: (cmds[0] ?? block).split("\n").filter((l) => !/^\s*#/.test(l)).join("\n"), error: e ? { status: Number(e[1]), code: e[2]!.toLowerCase() } : null, problems });
  }
  return out;
}

// ═════════════════════════ 1. ข้อสถิต ═════════════════════════
const skillMd = rd(join(SKILL_DIR, "SKILL.md"));
const recipesMd = rd(join(SKILL_DIR, "references/recipes.md"));
const endpointsMd = rd(join(SKILL_DIR, "references/endpoints.md"));
const RECIPES = recipesOf(recipesMd);
const DUMMY: Record<string, string> = Object.fromEntries(VARS.map((v) => [v, v === "FROM" ? "2026-10-01" : v === "TO" ? "2026-10-07" : `qc${v.toLowerCase().replace(/_/g, "")}`]));
function runStatic(): void {
  console.log("\n── K ข้อสถิต (อ่านไฟล์) ──");
  {
    const p: string[] = [];
    const fm = /^---\n([\s\S]*?)\n---/.exec(skillMd)?.[1] ?? "";
    if (!skillMd) p.push("ไม่มี SKILL.md");
    else {
      if (!/^name:\s*shark-pos-api\s*$/m.test(fm)) p.push("front-matter ไม่มี name: shark-pos-api");
      const desc = /^description:\s*(.+)$/m.exec(fm)?.[1] ?? "";
      if (!desc || !ASCII.test(desc)) p.push("description ว่าง/ไม่ใช่ ASCII");
      for (const h of [/when to use/i, /setup/i, /conventions/i, /safety/i]) if (!new RegExp(`^#{1,3}\\s.*${h.source}`, "im").test(skillMd)) p.push(`ไม่มีหัวข้อ ${h.source}`);
    }
    chk("K1", p.length === 0, "front-matter + 4 หัวข้อ", joinP(p));
  }
  {
    const need: [RegExp, string][] = [[/https:\/\/shark\.in\.th\/api\/v1\/pos/, "base URL"], [/Authorization:\s*Bearer/, "Bearer"], [/X-Shark-System/, "X-Shark-System"], [/references\/endpoints\.md/, "endpoints.md"], [/references\/recipes\.md/, "recipes.md"]];
    const miss = need.filter(([re]) => !re.test(skillMd)).map(([, n]) => n);
    chk("K2", skillMd && miss.length === 0, "ครบ", miss.join(",") || (skillMd ? "ครบ" : "ไม่มี SKILL.md"));
  }
  {
    const need: [RegExp, string][] = [[/satang/i, "satang"], [/\bunitId\b/, "unitId"], [/Idempotency-Key/, "Idempotency-Key"], [/error\.code/, "error.code"], [/pageSize/, "pageSize"], [/\bpage\b/, "page"], [/text\/csv/, "text/csv"]];
    const miss = need.filter(([re]) => !re.test(skillMd)).map(([, n]) => n);
    chk("K3", skillMd && miss.length === 0, "ครบ", miss.join(",") || (skillMd ? "ครบ" : "ไม่มี SKILL.md"));
  }
  {
    const need: [RegExp, string][] = [
      [/never[^\n.]*\b(void|refund|cancel)/i, "never void/refund/cancel"],
      [/(unless|without)[^\n.]*(user|owner|you are told|asked)/i, "unless the user says so"],
      [/confirm["']?\s*:\s*true/, "confirm: true"],
      [/\breason\b/, "reason"],
      [/quote[^\n.]*before|before[^\n.]*(sell|sale)[^\n.]*quote/i, "quote before selling"],
      [/never[^\n.]*\bPINs?\b/i, "never ask for PINs"],
    ];
    const miss = need.filter(([re]) => !re.test(skillMd)).map(([, n]) => n);
    chk("K4", skillMd && miss.length === 0, "ครบ", miss.join(",") || (skillMd ? "ครบ" : "ไม่มี SKILL.md"));
  }
  {
    const miss = OP_PATHS.filter((op) => !endpointsMd.includes(op) && !endpointsMd.includes(op.replace(" /", " /api/v1/pos/")));
    chk("K5", endpointsMd && miss.length === 0, "48/48", endpointsMd ? `${OP_PATHS.length - miss.length}/48 ขาด ${miss.slice(0, 4).join(", ")}` : "ไม่มี endpoints.md");
  }
  {
    const p: string[] = [];
    for (const f of FILES) {
      const a = rd(join(SKILL_DIR, f));
      if (!a) p.push(`repo ไม่มี ${f}`);
      for (const home of HOME_DIRS) {
        const b = rd(join(home, f));
        if (a && a !== b) p.push(`${f} ${b ? "ต่างจาก" : "ไม่มีใน"} ${home}`);
      } // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 DOC-2) มติ 4
    }
    chk("K6", p.length === 0, "3/3 ตรงไบต์", joinP(p));
  }
  {
    const p: string[] = [];
    if (!recipesMd) p.push("ไม่มี recipes.md");
    if (RECIPES.length < 8) p.push(`curl ${RECIPES.length} ก้อน (คาด ≥ 8)`);
    let n = 0;
    const freshIdem = () => `qc-dummy-${++n}`;
    const seen = new Set<string>();
    for (const r of RECIPES) {
      const s = substitute(r.raw, DUMMY, freshIdem);
      if (s.unknown.length) p.push(`${r.title}: ตัวแปรที่ไม่รู้จัก ${s.unknown.join(",")}`);
      const c = parseCurl(s.out);
      for (const q of [...r.problems, ...c.problems]) p.push(`${r.title}: ${q}`);
      const isWrite = c.method !== "GET" && !/^\/sales\/quote$/.test(c.path);
      if (isWrite && !c.headers["idempotency-key"]) p.push(`${r.title}: write ไม่มี Idempotency-Key`);
      const danger = /\/(void|refund|archive|cancel)$/.test(c.path);
      if (danger) {
        let b: Any = null;
        try {
          b = JSON.parse(c.body ?? "null");
        } catch {
          b = null;
        }
        if (!(isRecord(b) && b.confirm === true && typeof b.reason === "string" && b.reason.trim().length >= 5)) p.push(`${r.title}: danger ไม่มี confirm:true + reason`);
      }
      if (!c.headers.authorization || !/^Bearer\s+/.test(c.headers.authorization)) p.push(`${r.title}: ไม่มี Authorization: Bearer`);
      if (!r.error) p.push(`${r.title}: ไม่มีบรรทัด Error branch`);
      else if (!(ERROR_CODES as readonly string[]).includes(r.error.code)) p.push(`${r.title}: Error branch ${r.error.code} เล่นซ้ำไม่ได้ (ชุดที่รองรับ: ${ERROR_CODES.join(" ")})`);
      else if (r.error.code === "idempotency_required" && !isWrite) p.push(`${r.title}: idempotency_required บนสูตรอ่าน`);
      else if (r.error.code === "confirm_required" && !danger) p.push(`${r.title}: confirm_required บนสูตรที่ไม่ใช่ danger`);
      for (const [name, m, re, csv] of TASKS) if (c.method === m && re.test(c.path) && (!csv || /text\/csv/.test(c.headers.accept ?? ""))) seen.add(name);
    }
    const missT = TASKS.map(([n]) => n).filter((n) => !seen.has(n));
    if (missT.length) p.push(`ไม่ครอบ: ${missT.join(", ")}`);
    chk("K7", p.length === 0, "≥ 8 ก้อน · 8 งาน · Error branch ทุกก้อน", joinP(p, `${RECIPES.length} ก้อน`));
  }
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 skill fix) — K7b: $ ในเครื่องหมาย ' = shell ไม่แทนค่า (สูตรส่ง "$UNIT_ID" ตามตัวอักษร)
  {
    const p: string[] = [];
    if (!RECIPES.length) p.push("ไม่มีสูตร");
    for (const r of RECIPES) {
      const bad = dollarsInSingleQuotes(r.raw);
      if (bad.length) p.push(`${r.title}: ${bad.slice(0, 3).join(" ")} อยู่ใน '…'`);
    }
    chk("K7b", p.length === 0, "0 ก้อนที่มี $ ใน '…'", joinP(p, `${RECIPES.length} ก้อน`));
  }
}
// ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 skill fix) — ตัวสแกน shell แบบย่อ: คืนชื่อ $VAR / $(…) ที่อยู่ระหว่าง ' … ' (นอก " … ")
function dollarsInSingleQuotes(cmd: string): string[] {
  const out: string[] = [];
  let mode: "none" | "single" | "double" = "none";
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]!;
    if (mode === "single") {
      if (c === "'") mode = "none";
      else if (c === "$" && /[A-Za-z_{(]/.test(cmd[i + 1] ?? "")) out.push(/^\$(\([^)]*\)|\{[^}]*\}|[A-Za-z_][A-Za-z0-9_]*)/.exec(cmd.slice(i))?.[0] ?? "$");
      continue;
    }
    if (c === "\\") {
      i++;
      continue;
    }
    if (mode === "double") {
      if (c === '"') mode = "none";
      continue;
    }
    if (c === "'") mode = "single";
    else if (c === '"') mode = "double";
  }
  return out;
}
const STATIC_IDS = ["K1", "K2", "K3", "K4", "K5", "K6", "K7", "K7b" /* ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 skill fix) */].map((x) => `P2.13S-${x}`);
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อ (อ่านไฟล์ · ไม่โหลด prisma)`);
  try {
    runStatic();
  } catch (e) {
    console.log(`💥 harness: ${(e as Error)?.stack?.split("\n").slice(0, 3).join(" | ")}`);
  }
  for (const id of STATIC_IDS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", "ไม่ถึง");
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failedN.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, registered: CHECKS.length, recipes: RECIPES.length })}`);
  process.exit(failedN.length ? 1 : 0);
}

// ═════════════════════════ 2. env + ด่าน SKIP ═════════════════════════
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, ROUTE_FILE))) skipReasons.push(`${ROUTE_FILE} ยังไม่มี`);
if (!skillMd) skipReasons.push("skills/shark-pos-api/SKILL.md ยังไม่มี"); // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 DOC-2) มติ 4
if (!recipesMd) skipReasons.push("skills/shark-pos-api/references/recipes.md ยังไม่มี");
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
if (skipReasons.length && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P2.13 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง)`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash · K10 เขียว)`);
{
  const mark = envMod.POS_QC_HOST_MARK as string;
  if (!(process.env.DATABASE_URL ?? "").includes(mark)) {
    console.error(`🔴 หยุด! ${SUITE}: เขียนได้เฉพาะ QC4 (${mark})`);
    process.exit(4);
  }
}

const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 140)})`);
    return null;
  }
};
const route = existsSync(join(ROOT, ROUTE_FILE)) ? await tryImport("@/app/api/v1/pos/[...path]/route") : null;
const akSvc = await tryImport("@/lib/api-keys/service");
const scopesMod = await tryImport("@/lib/api-keys/scopes");
const sysSvc = await tryImport("@/lib/modules/system/service");
const invSvc = await tryImport("@/lib/modules/inventory/service");
const catalog = await tryImport("@/lib/modules/pos/catalog");
const regFacade = await tryImport("@/lib/modules/pos/register");
const chMod = await tryImport("@/lib/modules/pos/channel");
const orderMod = await tryImport("@/lib/modules/pos/order");
const posIdx = await tryImport("@/lib/modules/pos");
const consMod = await tryImport("@/lib/outbox-consumers");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p213s-${RAND}`;
const T_SLUG = `posqc-p213s-${RAND}`;
let T = "";
const keyIds: string[] = [];
const realFetch = globalThis.fetch;
let guardHits = 0;
globalThis.fetch = (async () => {
  guardHits++;
  return new Response(`blocked by ${SUITE}`, { status: 503 });
}) as typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function drain(): Promise<void> {
  for (let i = 0; i < 2; i++) await consMod?.drainAll?.().catch?.(() => {});
}
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : "UNKNOWN");
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}` };
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, code: "THROW", message: String((e as Error)?.message ?? e).slice(0, 160) };
  }
}
type Res = { status: number; code: string; ctype: string; text: string };
async function replay(c: Parsed): Promise<Res> {
  const fn = route?.[c.method];
  if (typeof fn !== "function") return { status: 0, code: "ROUTE_MISSING", ctype: "", text: "" };
  try {
    const res: Response = await fn(new Request(`http://x/api/v1/pos${c.path}${c.query ? `?${c.query}` : ""}`, { method: c.method, headers: c.headers, body: c.body ?? undefined }), { params: Promise.resolve({ path: c.path.split("/").filter(Boolean) }) });
    const text = await res.text();
    let code = "";
    try {
      code = String(JSON.parse(text)?.error?.code ?? "");
    } catch {
      code = "";
    }
    return { status: res.status, code, ctype: String(res.headers.get("content-type") ?? ""), text };
  } catch (e) {
    return { status: -1, code: "THROW", ctype: "", text: (e as Error).message.slice(0, 120) };
  }
}

// ═════════════════════════ 3. ฟิกซ์เจอร์ + เล่นซ้ำ ═════════════════════════
async function runDb(): Promise<void> {
  const notes: string[] = [];
  let fx = "";
  const S: Record<string, string> = {};
  const U: Record<string, string> = {};
  const V: Record<string, string> = {};
  let owner: Any = null;
  let ownerId = "";
  try {
    T = (await P.tenant.create({ data: { name: `QC P2.13 สกิล ${RAND}`, slug: T_SLUG } })).id;
    U.A = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขาA`, slug: `${T_SLUG}-a` } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", `POS ${RAND}`)).id;
    S.POS2 = (await sysSvc.createSystem(T, "POS", `POS สอง ${RAND}`)).id;
    S.INV = (await sysSvc.createSystem(T, "INVENTORY", `คลัง ${RAND}`)).id;
    await sysSvc.linkUnit(T, S.POS, U.A);
    await sysSvc.linkUnit(T, S.INV, U.A);
    const u = await P.user.create({ data: { email: `${T_SLUG}-owner@qc.invalid`, name: `เจ้าของ ${RAND}` } });
    await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    ownerId = u.id;
    owner = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
    const invCtx = { tenantId: T, systemId: S.INV, actorUserId: ownerId };
    const it = await invSvc.createItem(invCtx, { sku: `${TAG}-latte`, name: `กาแฟลาเต้ ${RAND}`, unitLabel: "แก้ว", costSatang: 1500 });
    await invSvc.receive(invCtx, { itemId: it.id, qty: 100, costSatang: 1500, idempotencyKey: `${TAG}-recv` });
    V.PRODUCT_ID = String((await P.posProduct.findFirst({ where: { tenantId: T, systemId: S.POS, invItemId: it.id }, select: { id: true } }))?.id ?? "");
    const sp = await call(catalog, "setPrice", { tenantId: T, systemId: S.POS, actorUserId: ownerId }, V.PRODUCT_ID, 4500);
    if (sp?.ok === false) throw new Error(`setPrice ${codeOf(sp)}`);
    const ctx = { tenantId: T, systemId: S.POS, unitId: U.A };
    await call(chMod, "ensureUnitChannels", P, ctx);
    const ch = await call(chMod, "saveChannel", ctx, owner, { code: "LINEMAN", name: `LINE MAN ${RAND}`, commissionBp: 3000 });
    V.CHANNEL_ID = String(ch?.channel?.id ?? "");
    // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 skill fix) — ช่องทาง CUSTOM (รหัสไม่ใช่แพลตฟอร์มสำเร็จรูป ⇒ kind CUSTOM · adapter NONE · payout DIRECT)
    const chc = await call(chMod, "saveChannel", ctx, owner, { code: "PHONE", name: `โทรสั่ง ${RAND}` });
    V.CHANNEL_CODE = String(chc?.channel?.code ?? "");
    if (!V.CHANNEL_CODE) notes.push(`ช่องทาง CUSTOM ฟิกซ์เจอร์: ${codeOf(chc)}`);
    const sale = await call(regFacade, "submitRegisterSale", ctx, owner, { lines: [{ productId: V.PRODUCT_ID, qty: 2 }], payMethods: [{ type: "CASH", amountSatang: 9000 }], cashReceivedSatang: 9000, expectedGrandTotalSatang: 9000, idempotencyKey: `qc213s${RAND}sale1` });
    V.SALE_ID = String(sale?.saleId ?? "");
    if (!V.SALE_ID) notes.push(`บิลฟิกซ์เจอร์: ${codeOf(sale)}`);
    V.LINE_ID = String((await P.posSaleLine.findFirst({ where: { tenantId: T, saleId: V.SALE_ID || "none" }, select: { id: true } }).catch(() => null))?.id ?? "");
    const ord = await call(orderMod, "ingestOrder", ctx, owner, { channelId: V.CHANNEL_ID, externalRef: `LM-${RAND}`, idempotencyKey: `qc213s${RAND}ord1`, startStatus: "NEW", fulfilment: "PICKUP", lines: [{ productId: V.PRODUCT_ID, qty: 1 }], customer: { name: `ลูกค้า ${RAND}` } });
    V.ORDER_ID = String(ord?.orderId ?? "");
    if (!V.ORDER_ID) notes.push(`ออเดอร์ฟิกซ์เจอร์: ${codeOf(ord)}`);
    await drain();
  } catch (e) {
    fx = `ฟิกซ์เจอร์:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const mk = async (label: string, scopes: string[], systemId: string): Promise<string> => {
    try {
      const k = await akSvc.createApiKey({ tenantId: T }, `QC P2.13 สกิล ${label} ${RAND}`, { scopes, systemId });
      keyIds.push(k.id);
      return String(k.rawKey);
    } catch (e) {
      notes.push(`createApiKey ${label}: ${(e as Error).message.slice(0, 80)}`);
      return `shark_none_${label}`;
    }
  };
  let adminScopes: string[] = [];
  try {
    adminScopes = scopesMod.expandBundles(["pos-admin"]);
  } catch {
    notes.push("expandBundles(pos-admin) ไม่รู้จัก");
  }
  const KEY = fx ? "shark_none" : await mk("admin", adminScopes, S.POS!);
  const NOSCOPE = fx ? "shark_none" : await mk("noscope", [], S.POS!);
  const today = String(posIdx?.bkkToday?.() ?? new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10));
  const vals: Record<string, string> = {
    SHARK_API_KEY: KEY, SHARK_SYSTEM_ID: S.POS ?? "none", UNIT_ID: U.A ?? "none", PRODUCT_ID: V.PRODUCT_ID ?? "none", SALE_ID: V.SALE_ID ?? "none", LINE_ID: V.LINE_ID ?? "none",
    ORDER_ID: V.ORDER_ID ?? "none", CHANNEL_ID: V.CHANNEL_ID ?? "none", CHANNEL_CODE: V.CHANNEL_CODE || "NONE" /* ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 skill fix) */, TO: today, FROM: new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10),
  };
  let idemN = 0;
  const freshIdem = () => `p213s-${RAND}-${++idemN}`;
  const ok8: string[] = [];
  const bad9: string[] = [];
  const restock = async () => {
    if (V.PRODUCT_ID && U.A) await call(catalog, "setAvailability", { tenantId: T, systemId: S.POS, unitId: U.A }, owner, { productId: V.PRODUCT_ID, unitId: U.A, available: true, source: "MANUAL" });
  };
  for (const r of RECIPES) {
    const s = substitute(r.raw, vals, freshIdem);
    const c = parseCurl(s.out);
    if (s.unknown.length || c.problems.length) {
      ok8.push(`${r.title}: แกะไม่ได้`);
      continue;
    }
    // ── err ก่อน (กลายรูปไม่ควรเขียนอะไร) แล้วค่อยเล่นจริง ──
    if (r.error && (ERROR_CODES as readonly string[]).includes(r.error.code)) {
      const code = r.error.code as ErrCode;
      let m: Parsed = { ...c, headers: { ...c.headers } };
      if (code === "unauthorized") delete m.headers.authorization;
      else if (code === "scope_missing") m.headers.authorization = `Bearer ${NOSCOPE}`;
      else if (code === "system_mismatch") m.headers["x-shark-system"] = S.POS2 ?? "none";
      else if (code === "idempotency_required") delete m.headers["idempotency-key"];
      else if (code === "confirm_required") {
        const b = JSON.parse(c.body ?? "{}");
        delete b.confirm;
        m.body = JSON.stringify(b);
      } else if (code === "not_found") {
        const nope: Record<string, string> = { ...vals };
        for (const v of ID_VARS) nope[v] = `nope${RAND}${v.toLowerCase().replace(/_/g, "")}`;
        m = parseCurl(substitute(r.raw, nope, freshIdem).out);
      } else if (code === "validation") {
        if (c.method === "GET") m.query = `${c.query ? `${c.query}&` : ""}__qc=1`;
        else {
          const b = JSON.parse(c.body ?? "{}");
          m.body = JSON.stringify({ ...(isRecord(b) ? b : {}), __qc: 1 });
        }
      }
      if (m.method !== "GET" && code !== "idempotency_required") m.headers["idempotency-key"] = freshIdem();
      const e = await replay(m);
      if (!(e.status === r.error.status && e.code === r.error.code)) bad9.push(`${r.title}: ${r.error.status} ${r.error.code} → ได้ ${e.status}${e.code ? `:${e.code}` : ""}`);
    } else bad9.push(`${r.title}: ไม่มี Error branch ที่เล่นซ้ำได้`);
    const res = await replay(c);
    const wantCsv = /text\/csv/.test(c.headers.accept ?? "");
    if (res.status !== 200) ok8.push(`${r.title}: ${res.status}${res.code ? `:${res.code}` : ""}`);
    else if (wantCsv && !res.ctype.includes("text/csv")) ok8.push(`${r.title}: ไม่ใช่ text/csv`);
    await drain();
    await restock();
  }
  if (!RECIPES.length) ok8.push("ไม่มีสูตร");
  const FXB = (s: string) => (fx ? `fixture:${fx} · ` : "") + (notes.length ? `[${notes.slice(0, 2).join(" | ")}] ` : "") + s;
  chk("K8", ok8.length === 0, `${RECIPES.length}/${RECIPES.length} → 200`, FXB(joinP(ok8)));
  if (RECIPES.length < 8) bad9.push(`สูตร ${RECIPES.length} ก้อน (คาด ≥ 8)`);
  chk("K9", bad9.length === 0, "ทุก Error branch ตรง", FXB(joinP(bad9)));
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 skill fix) — K8b: สูตรรับออเดอร์เข้า (CUSTOM · NEW) + สูตรรับออเดอร์ เล่นต่อกันจริง
  {
    const p: string[] = [];
    const parsedAll = RECIPES.map((r) => ({ r, c: parseCurl(substitute(r.raw, vals, freshIdem).out) }));
    const create = parsedAll.find(({ c }) => c.method === "POST" && c.path === "/orders");
    const accept = parsedAll.find(({ c }) => c.method === "POST" && /^\/orders\/[^/]+\/accept$/.test(c.path));
    let body: Any = null;
    try {
      body = JSON.parse(create?.c.body ?? "null");
    } catch {
      body = null;
    }
    if (!create) p.push("ไม่มีสูตร POST /orders");
    else {
      if (!/\$\{?CHANNEL_CODE\}?/.test(create.r.raw)) p.push("สูตร POST /orders ไม่ใช้ $CHANNEL_CODE (ช่องทาง CUSTOM)");
      if (!isRecord(body) || body.startStatus !== "NEW") p.push(`สูตร POST /orders startStatus=${short(isRecord(body) ? body.startStatus : body, 20)} (คาด NEW)`);
    }
    if (!accept) p.push("ไม่มีสูตร POST /orders/{id}/accept");
    if (create && accept && !p.length) {
      const res = await replay({ ...create.c, headers: { ...create.c.headers, "idempotency-key": freshIdem() } });
      let orderId = "";
      try {
        orderId = String(JSON.parse(res.text)?.data?.orderId ?? "");
      } catch {
        orderId = "";
      }
      if (res.status < 200 || res.status > 299 || !orderId) p.push(`สร้าง → ${res.status}${res.code ? `:${res.code}` : ""} ${short(res.text, 80)}`);
      else {
        const o0 = (await P.posOrder.findFirst({ where: { tenantId: T, id: orderId }, select: { status: true, channelId: true } }).catch(() => null)) as Any;
        const ch0 = o0 ? ((await P.salesChannel.findFirst({ where: { tenantId: T, id: o0.channelId }, select: { kind: true, code: true } }).catch(() => null)) as Any) : null;
        if (o0?.status !== "NEW" || ch0?.kind !== "CUSTOM") p.push(`ออเดอร์ ${o0?.status ?? "ไม่พบ"} บนช่องทาง ${ch0?.kind ?? "?"} (คาด NEW บน CUSTOM)`);
        const acc = parseCurl(substitute(accept.r.raw, { ...vals, ORDER_ID: orderId }, freshIdem).out);
        const ra = await replay(acc);
        if (ra.status < 200 || ra.status > 299) p.push(`รับ → ${ra.status}${ra.code ? `:${ra.code}` : ""} ${short(ra.text, 80)}`);
        const o1 = (await P.posOrder.findFirst({ where: { tenantId: T, id: orderId }, select: { status: true } }).catch(() => null)) as Any;
        if (o1?.status !== "ACCEPTED") p.push(`หลังรับ สถานะ ${o1?.status ?? "ไม่พบ"} (คาด ACCEPTED)`);
      }
      await drain();
    }
    chk("K8b", p.length === 0, "สร้าง 2xx NEW/CUSTOM → รับ 2xx ACCEPTED", FXB(joinP(p)));
  }
}

// ═════════════════════════ 4. รัน + คืนสภาพ ═════════════════════════
let crashed = "";
try {
  runStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
}
const left: string[] = [];
let tenantLeft = 0;
let buckets = 0;
try {
  await drain();
  await sleep(300);
  if (T) {
    const t = (await P.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, T)) as Any[];
    if (!t.length || t[0].slug === T_SLUG) {
      const tables = ((await P.$queryRawUnsafe(
        `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
         WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
      )) as Any[]).map((r: Any) => String(r.t));
      await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, T).catch(() => {});
      let pending = [...tables];
      for (let pass = 0; pass < 12 && pending.length; pass++) {
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
      await P.$executeRawUnsafe(`DELETE FROM "User" WHERE email LIKE $1`, `${T_SLUG}-%@qc.invalid`).catch(() => {});
      await P.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, T, T_SLUG).catch(() => {});
      for (const tb of tables) {
        const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, T).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? 0);
        if (n) left.push(`${tb}:${n}`);
      }
      tenantLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`, T)) as Any[])[0]?.n ?? 0);
    } else left.push("slug ไม่ตรง — ไม่ลบ");
  }
  for (const kid of keyIds) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `%:api:%:${kid}`).catch(() => {});
  for (const kid of keyIds) buckets += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE $1`, `%:api:%:${kid}`).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1);
} catch (e) {
  left.push(`cleanup: ${(e as Error).message.slice(0, 120)}`);
} finally {
  globalThis.fetch = realFetch;
}
chk("K10", left.length === 0 && tenantLeft === 0 && buckets === 0, "0 แถว · Tenant ลบ · ถัง 0", `${left.join(", ") || "0 แถว"} · Tenant ${tenantLeft} · ถัง ${buckets}`);
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
if (guardHits) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits} ครั้ง`);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, recipes: RECIPES.length, residue: left.length + tenantLeft })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);
