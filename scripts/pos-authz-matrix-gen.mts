// pos-authz-matrix-gen.mts — ตัวสร้าง/ตัวตรวจ `scripts/pos-authz-matrix.json` (POS P5.2 · ruling 3: แหล่งเดียวของตารางสิทธิ์)
//
// อ่านอย่างเดียว (fs + regex) · ไม่ import โค้ดของแอป · ไม่แตะ DB · ผลเหมือนเดิมทุกครั้งบนโค้ดเดียวกัน (เรียงตาม surface)
// ใช้:  bash scripts/iso.sh pnpm exec tsx scripts/pos-authz-matrix-gen.mts --write   (เขียนตารางใหม่ — แถว override ด้วยมือคงอยู่ใน OVERRIDES ข้างล่าง)
//       bash scripts/iso.sh pnpm exec tsx scripts/pos-authz-matrix-gen.mts --check   (exit 1 ถ้าไฟล์ไม่ตรงกับที่สร้าง)
//       bash scripts/iso.sh pnpm exec tsx scripts/pos-authz-matrix-gen.mts --list    (พิมพ์ surface ที่สแกนเจอ)
// qc-pos-p5.2 M1 import `scanSurfaces()` จากไฟล์นี้ (ตัวสแกนเดียวกับตัวสร้าง — แบบ gen-pos-api-docs --check)
//
// กติกาการสแกน (= ขอบเขตของ M1 · ใบใหม่ใน P6 ต้องเพิ่มแถว):
//   page    src/app/app/sys/[id]/pos/**/page.tsx + src/app/app/sys/[id]/page.tsx (PosContent ของหน้าภาพรวมระบบ)
//   public  page.tsx ใต้ src/app/(store)/** และ src/app/developers/** ที่ import โมดูล POS (+ developers/pos/page.tsx)
//   action  ทุก `export async function` ในไฟล์ที่ขึ้นต้นด้วย "use server" ใต้ src/lib/modules/pos/** · src/lib/pos-*.ts · src/lib/actions/pos.ts
//           (ไฟล์ "use server" ใต้ src/app/(store)/** ที่ import โมดูล POS = kind public)
//   api     ทุก HTTP method ที่ export ใน route.ts ใต้ src/app/api/pos/** · src/app/api/v1/pos/** · และ route.ts ใดก็ได้ใต้ src/app ที่ import โมดูล POS
//           (ไม่มี session = kind public) · REST op ของทะเบียน (definePosOp ใน src/lib/modules/pos/api/ops/*.ts) = surface `rest:<METHOD> <path>`
//   นอกขอบเขต (ไม่สแกน · เหตุผลใน $scope.outOfScope): หน้า /app/u/<unit>/restaurant|booking + /app/approvals (โมดูลเดิมที่เรียก POS เป็นทางผ่าน)
//
// ค่าบทบาท (roles): allow · deny · cond (ผ่านได้มีเงื่อนไข เช่น PIN ผู้จัดการ/ของตัวเอง) · token (ผู้ถือโทเคน/ลายเซ็น) · n/a · ? (ตัวสร้างอนุมานไม่ได้ — ต้องอ่านเพิ่ม)
//   OWNER · MANAGER (unitAccess [สาขา A]) · CASHIER (STAFF {pos.sale.create, member.customer.read} ที่สาขา A = PQC.cashierPermissions) ·
//   STAFF_NOPERM (STAFF ไม่มีคีย์ POS ที่สาขา A) · OTHER_UNIT (ผู้จัดการสาขา A ขอสาขา B) · OTHER_TENANT (สมาชิกร้านอื่น) · ANON (ไม่มี session) ·
//   API_KEY (scope ที่ต้องมี) · DEVICE (โทเคนเครื่อง/จอ/ตัวช่วยพิมพ์)
// การอนุมาน (action): คีย์สิทธิ์ = สตริงในตัวฟังก์ชัน ∪ ตัวช่วยในไฟล์เดียวกันที่เรียก (ชั้นเดียว) ∪ ค่าคงที่ที่อ้างชื่อ ∪ ช่องของแผนที่ NEED ที่อ้างด้วยสตริง —
//   กรองเฉพาะคีย์ที่มีในแคตตาล็อก src/lib/core/permissions.ts · CASHIER = allow เมื่อคีย์ใดคีย์หนึ่ง ∈ สิทธิ์แคชเชียร์ · มี `role !== "OWNER"` = เฉพาะเจ้าของ
//   ผลที่อนุมานได้เป็น "ความคาดหวัง" — oracle qc-pos-p5.2 ยิงจริง (R*/T*) · ค่าที่อ่านโค้ดแล้วแก้ = OVERRIDES (มีเหตุผลใน notes)
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

export const MATRIX_PATH = "scripts/pos-authz-matrix.json";
export const MATRIX_BASE = "2fb1fe8e";
export type RoleVal = "allow" | "deny" | "cond" | "token" | "n/a" | "?";
export const ROLE_KEYS = ["OWNER", "MANAGER", "CASHIER", "STAFF_NOPERM", "OTHER_UNIT", "OTHER_TENANT", "ANON", "API_KEY", "DEVICE"] as const;
export type Row = {
  surface: string;
  kind: "page" | "action" | "api" | "public";
  roles: Record<(typeof ROLE_KEYS)[number], string>;
  perm: string[];
  tenantScope: string;
  unitScoped: boolean;
  call: string;
  evidence: string;
  coveredBy: string;
  notes: string;
};
export const CASHIER_PERMS = ["pos.sale.create", "member.customer.read"];

const rd = (root: string, p: string): string => {
  try {
    return readFileSync(join(root, p), "utf8");
  } catch {
    return "";
  }
};
function walk(root: string, dir: string): string[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const n of readdirSync(abs).sort()) {
    const p = join(dir, n);
    const st = statSync(join(root, p));
    if (st.isDirectory()) out.push(...walk(root, p));
    else out.push(p);
  }
  return out;
}
const IMPORTS_POS = /from\s+["'](?:@\/lib\/modules\/pos(?:\/[^"']*)?|@\/lib\/pos-[^"']*)["']|import\(\s*["'](?:@\/lib\/modules\/pos|@\/lib\/pos-)[^"']*["']\s*\)/;
const stripLead = (s: string) => s.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*|\s+)*/, "");
const isUseServer = (s: string) => /^["']use server["']/.test(stripLead(s));
const lineOf = (text: string, idx: number) => text.slice(0, idx).split("\n").length;

// ── แคตตาล็อกคีย์สิทธิ์ ──
export function permissionCatalog(root: string): Set<string> {
  const t = rd(root, "src/lib/core/permissions.ts");
  return new Set([...t.matchAll(/["']([a-z]+\.[a-zA-Z]+\.[a-zA-Z*]+)["']\s*:/g)].map((m) => m[1]!));
}

// ── ตัวแยกฟังก์ชัน/ค่าคงที่ระดับไฟล์ ──
type Block = { name: string; start: number; end: number; exported: boolean; kind: "fn" | "const" };
function topBlocks(code: string): Block[] {
  const re = /^(export\s+)?(?:(async\s+)?function\s+(\w+)|const\s+(\w+)\s*(?::[^=\n]+)?=)/gm;
  const hits: { name: string; at: number; exported: boolean; kind: "fn" | "const" }[] = [];
  for (const m of code.matchAll(re)) hits.push({ name: (m[3] ?? m[4])!, at: m.index!, exported: !!m[1], kind: m[3] ? "fn" : "const" });
  // จบที่บรรทัดคอลัมน์ 0 ถัดไปที่เริ่มประกาศ (export/function/const/type/interface/class/คอมเมนต์ JSDoc)
  const boundary = [...code.matchAll(/^(?:export\s|async\s+function\s|function\s|const\s|let\s|type\s|interface\s|class\s|\/\*\*|\/\/ ═|\/\/ ──)/gm)].map((m) => m.index!);
  return hits.map((h) => {
    const next = boundary.find((b) => b > h.at);
    return { name: h.name, start: h.at, end: next ?? code.length, exported: h.exported, kind: h.kind };
  });
}
function keysIn(text: string, cat: Set<string>): string[] {
  return [...new Set([...text.matchAll(/["'`]([a-z]+\.[a-zA-Z]+\.[a-zA-Z*]+)["'`]/g)].map((m) => m[1]!).filter((k) => cat.has(k)))].sort();
}
const OWNER_ONLY = /role\s*!==\s*["']OWNER["']/;

type ActionInfo = { name: string; line: number; perm: string[]; ownerOnly: boolean; sig: string; body: string; gateLine: number };
/** ค่าคงที่คีย์สิทธิ์ที่ import มาจากไฟล์ข้างเคียง (`export const X = "pos.report.view"`) — ชื่อ → คีย์ */
function importedKeyConsts(root: string, file: string, code: string, cat: Set<string>): Map<string, string> {
  const out = new Map<string, string>();
  const dir = file.replace(/\/[^/]+$/, "");
  for (const m of code.matchAll(/^import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/gm)) {
    const spec = m[2]!;
    const target = spec.startsWith("./") ? `${dir}/${spec.slice(2)}` : spec.startsWith("@/") ? `src/${spec.slice(2)}` : "";
    if (!target) continue;
    const src = rd(root, `${target}.ts`) || rd(root, `${target}/index.ts`);
    if (!src) continue;
    for (const part of m[1]!.split(",")) {
      const [orig, alias] = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/);
      if (!orig) continue;
      const v = new RegExp(`export\\s+const\\s+${orig}\\s*=\\s*["']([^"']+)["']`).exec(src)?.[1];
      if (v && cat.has(v)) out.set((alias ?? orig).trim(), v);
    }
  }
  return out;
}
function actionsOf(code: string, cat: Set<string>, imported: Map<string, string> = new Map()): ActionInfo[] {
  const blocks = topBlocks(code);
  const helpers = new Map(blocks.filter((b) => !b.exported).map((b) => [b.name, code.slice(b.start, b.end)]));
  // แผนที่ NEED แบบ { key: [ ...คีย์... ] }
  const maps = new Map<string, Map<string, string[]>>();
  for (const b of blocks.filter((x) => x.kind === "const")) {
    const t = code.slice(b.start, b.end);
    const ent = new Map<string, string[]>();
    for (const m of t.matchAll(/^\s+(\w+)\s*:\s*(\[[^\n]*\])/gm)) {
      const ks = keysIn(m[2]!, cat);
      if (ks.length) ent.set(m[1]!, ks);
    }
    if (ent.size) maps.set(b.name, ent);
  }
  const out: ActionInfo[] = [];
  for (const b of blocks.filter((x) => x.exported && x.kind === "fn")) {
    const body = code.slice(b.start, b.end);
    if (!/^export\s+async\s+function/.test(body)) continue;
    // ตัวช่วย/ค่าคงที่ที่อ้างถึง แบบส่งต่อ (ลึก ≤ 3 ชั้น · เรียงชื่อ ⇒ ผลคงที่)
    let text = body;
    const called = new Set<string>();
    let frontier = [body];
    for (let depth = 0; depth < 3 && frontier.length; depth++) {
      const next: string[] = [];
      for (const t of frontier) {
        for (const n of [...new Set([...t.matchAll(/\b([A-Za-z_]\w*)\b/g)].map((m) => m[1]!))].sort()) {
          if (called.has(n) || n === b.name || !helpers.has(n)) continue;
          called.add(n);
          next.push(helpers.get(n)!);
          text += "\n" + helpers.get(n)!;
        }
      }
      frontier = next;
    }
    for (const n of body.matchAll(/\b([A-Za-z_]\w*)\b/g)) called.add(n[1]!);
    let perm = keysIn(text, cat);
    for (const n of new Set([...text.matchAll(/\b([A-Za-z_]\w*)\b/g)].map((m) => m[1]!))) if (imported.has(n)) perm = [...new Set([...perm, imported.get(n)!])].sort();
    for (const [mapName, ent] of maps) {
      if (!called.has(mapName) && !text.includes(`${mapName}[`)) continue;
      for (const lit of [...body.matchAll(/["'](\w+)["']/g)].map((m) => m[1]!)) if (ent.has(lit)) perm = [...new Set([...perm, ...ent.get(lit)!])].sort();
    }
    // แถวที่ไม่มีคีย์ในตัวเองแต่ไฟล์มีแผนที่เดียว = ใช้แผนที่นั้นทั้งก้อน (ไม่ทำ — ปล่อยเป็น ? ให้คนอ่าน)
    const ownerOnly = OWNER_ONLY.test(text);
    const sig = (/^export\s+async\s+function\s+\w+\s*\(([^)]*)\)/.exec(body)?.[1] ?? "").replace(/\s+/g, " ").trim();
    // บรรทัดหลักฐาน: บรรทัดแรกในตัวฟังก์ชันที่มีคีย์/ตัวช่วยด่าน/ตรวจบทบาท · ไม่มี = บรรทัด requireTenant/session · ไม่มี = บรรทัดประกาศ
    const lines = body.split("\n");
    // ตัวช่วยด่าน = มีเครื่องหมายด่านเอง หรือเรียกตัวช่วยด่านอื่น (จุดตรึง)
    const gateHelpers = [...helpers.keys()].filter((n) => /assertCan|evaluate\(|canAccessUnit|requireMembership|canViewPayroll|role\s*[!=]==/.test(helpers.get(n)!));
    for (let grow = true; grow; ) {
      grow = false;
      for (const n of [...helpers.keys()].sort()) {
        if (gateHelpers.includes(n)) continue;
        if (gateHelpers.some((g) => new RegExp(`\\b${g}\\s*\\(`).test(helpers.get(n)!))) {
          gateHelpers.push(n);
          grow = true;
        }
      }
    }
    const gateRe = new RegExp(`assertCan|evaluate\\(|canAccessUnit|requireMembership|role\\s*[!=]==|${["gate", ...gateHelpers].map((n) => `\\b${n}\\s*\\(`).join("|")}|["'](?:pos|restaurant|inventory|member|api)\\.[a-zA-Z]+\\.[a-zA-Z]+["']`);
    let gi = lines.findIndex((l, i) => i > 0 && gateRe.test(l));
    if (gi < 0) gi = lines.findIndex((l, i) => i > 0 && /requireTenant|requireAuth|\bsession\s*\(|getAuth/.test(l));
    // action สาธารณะ: บรรทัดที่ส่งโทเคน/คุกกี้เข้าโมดูล
    if (gi < 0) gi = lines.findIndex((l, i) => i > 0 && /\(\s*(?:tokenOf\()?\w*(?:[Tt]oken|chatTag|code)\b|cookies\(\)|DISPLAY_COOKIE/.test(l));
    if (gi < 0) gi = 0;
    out.push({ name: b.name, line: lineOf(code, b.start), perm, ownerOnly, sig, body, gateLine: lineOf(code, b.start) + gi });
  }
  return out;
}
function callStyle(sig: string): string {
  if (!sig) return "none";
  if (/^\w+\s*:\s*FormData/.test(sig)) return "form";
  if (/^\w+\s*:\s*string\s*,/.test(sig) || /^\w+\s*:\s*string$/.test(sig)) return /token|Token|chatTag|code/.test(sig.split(":")[0]!) ? "token" : "pos";
  return "obj";
}

// ── สแกน ──
export type Scanned = { surface: string; kind: Row["kind"]; file: string; line: number; extra?: Partial<Row> };
export function scanSurfaces(root: string): Scanned[] {
  const cat = permissionCatalog(root);
  const out: Scanned[] = [];
  // page
  for (const f of walk(root, "src/app/app/sys/[id]/pos").filter((p) => p.endsWith("/page.tsx"))) out.push({ surface: f, kind: "page", file: f, line: 1 });
  if (existsSync(join(root, "src/app/app/sys/[id]/page.tsx"))) out.push({ surface: "src/app/app/sys/[id]/page.tsx", kind: "page", file: "src/app/app/sys/[id]/page.tsx", line: 1 });
  // public pages
  for (const f of [...walk(root, "src/app/(store)"), ...walk(root, "src/app/developers")].filter((p) => p.endsWith("/page.tsx"))) {
    if (IMPORTS_POS.test(rd(root, f)) || f === "src/app/developers/pos/page.tsx") out.push({ surface: f, kind: "public", file: f, line: 1 });
  }
  // actions
  const actionFiles = [
    ...walk(root, "src/lib/modules/pos").filter((p) => /\.tsx?$/.test(p)),
    ...readdirSync(join(root, "src/lib")).filter((n) => /^pos-.*\.ts$/.test(n)).sort().map((n) => `src/lib/${n}`),
    "src/lib/actions/pos.ts",
    ...walk(root, "src/app/(store)").filter((p) => /\.tsx?$/.test(p) && !p.endsWith("page.tsx") && !p.endsWith("route.ts")),
  ];
  for (const f of [...new Set(actionFiles)]) {
    const code = rd(root, f);
    if (!isUseServer(code)) continue;
    const store = f.startsWith("src/app/(store)/");
    if (store && !IMPORTS_POS.test(code)) continue;
    for (const a of actionsOf(code, cat, importedKeyConsts(root, f, code, cat))) out.push({ surface: `${f}#${a.name}`, kind: store ? "public" : "action", file: f, line: a.line });
  }
  // routes
  const routes = walk(root, "src/app").filter((p) => p.endsWith("/route.ts"));
  for (const f of routes) {
    const code = rd(root, f);
    const posDir = f.startsWith("src/app/api/pos/") || f.startsWith("src/app/api/v1/pos/");
    if (!posDir && !IMPORTS_POS.test(code)) continue;
    for (const m of code.matchAll(/^export\s+(?:async\s+function\s+|const\s+)(GET|POST|PATCH|PUT|DELETE)\b/gm)) {
      out.push({ surface: `${f}#${m[1]}`, kind: "api", file: f, line: lineOf(code, m.index!) });
    }
  }
  // REST ops
  for (const f of walk(root, "src/lib/modules/pos/api/ops").filter((p) => p.endsWith(".ts"))) {
    const code = rd(root, f);
    for (const m of code.matchAll(/definePosOp\(\{\s*id:\s*"([^"]+)",\s*method:\s*"(\w+)",\s*path:\s*"([^"]+)"/g)) {
      out.push({ surface: `rest:${m[2]} ${m[3]}`, kind: "api", file: f, line: lineOf(code, m.index!), extra: { notes: `op ${m[1]}` } });
    }
  }
  return out.sort((a, b) => (a.surface < b.surface ? -1 : a.surface > b.surface ? 1 : 0));
}

// ── coveredBy: ชุดที่อ้างชื่อ surface ใกล้คำปฏิเสธ (±2 บรรทัด) ──
const SUITE_RE = /^(qc-pos-.*|qc-hf-.*|qc-chat-security.*)\.mts$/;
const DENY_NEAR = /PERMISSION_DENIED|NO_PERMISSION|FORBIDDEN|forbidden|ForbiddenError|notFound|NOT_FOUND|SALE_NOT_FOUND|scope_missing|unauthorized|\b40[134]\b|ปฏิเสธ|ไม่มีสิทธิ์|คนสาขา|ร้านอื่น|สาขาอื่น/;
function suiteTexts(root: string): [string, string[]][] {
  return readdirSync(join(root, "scripts")).filter((n) => SUITE_RE.test(n) && n !== "qc-pos-p5.2.mts").sort().map((n) => [n.replace(/\.mts$/, ""), rd(root, `scripts/${n}`).split("\n")]);
}
function coveredByOf(token: string, suites: [string, string[]][]): string {
  if (!token || token.length < 6) return "";
  const hit: string[] = [];
  for (const [id, lines] of suites) {
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i]!.includes(token)) continue;
      const win = lines.slice(Math.max(0, i - 2), i + 3).join("\n");
      if (DENY_NEAR.test(win)) {
        hit.push(id);
        break;
      }
    }
  }
  return hit.join(",");
}

// ── ค่าที่อ่านโค้ดแล้วกำหนดด้วยมือ (surface → ทับเฉพาะช่องที่ระบุ) — ทุกแถวมีเหตุผลใน notes ──
const R = (o: Partial<Row["roles"]>) => o;
const SESSION_DENY = { OTHER_TENANT: "deny", ANON: "deny", API_KEY: "n/a", DEVICE: "n/a" };
export const OVERRIDES: Record<string, Partial<Omit<Row, "roles">> & { roles?: Partial<Row["roles"]> }> = {
  // ─ หน้าแอป (ด่าน = access.ts deciders · qc-hf-pos-page-authz) ─
  "src/app/app/sys/[id]/page.tsx": { roles: R({ CASHIER: "allow", STAFF_NOPERM: "deny", OTHER_UNIT: "deny" }), perm: ["pos.sale.create"], tenantScope: "session · appSystem.findFirst({id, tenantId})", notes: "PosContent แสดงเฉพาะ posSalesScope ≠ null · ยอดกรองสาขาตาม scope (page-authz O-1/O-2)" },
  "src/app/app/sys/[id]/pos/close/page.tsx": { roles: R({ CASHIER: "allow", STAFF_NOPERM: "deny", OTHER_UNIT: "deny" }), perm: ["pos.sale.create"], notes: "posSalesScope → notFound · closeDay* ส่ง unitIds (page-authz C-8)" },
  "src/app/app/sys/[id]/pos/kds/page.tsx": { roles: R({ CASHIER: "allow", STAFF_NOPERM: "deny", OTHER_UNIT: "deny" }), perm: ["pos.sale.create", "pos.sale.read", "restaurant.kds.advance"], notes: "posKdsView ไม่ผ่าน = การ์ดปฏิเสธ (page-authz KD-1)" },
  "src/app/app/sys/[id]/pos/orders/page.tsx": { roles: R({ CASHIER: "allow", STAFF_NOPERM: "deny", OTHER_UNIT: "deny" }), perm: ["pos.sale.create", "pos.sale.read"], notes: "posOrdersView ไม่ผ่าน = การ์ดปฏิเสธ (page-authz OR-1)" },
  "src/app/app/sys/[id]/pos/products/page.tsx": { roles: R({ CASHIER: "deny", STAFF_NOPERM: "deny", OTHER_UNIT: "deny", MANAGER: "cond" }), perm: ["pos.product.setPrice"], notes: "posCanSetTenantPrice = ทุกสาขาที่ราคาไปถึง · ผู้จัดการสาขาเดียว = โหมดสาขา (page-authz P-7) · แคชเชียร์ = การ์ดปฏิเสธ 200" },
  "src/app/app/sys/[id]/pos/products/price-rules/page.tsx": { roles: R({ CASHIER: "deny", STAFF_NOPERM: "deny", OTHER_UNIT: "deny" }), perm: ["pos.price.rule"], notes: "การ์ดปฏิเสธ pos-price-rules-refusal (page-authz PG-5)" },
  "src/app/app/sys/[id]/pos/register/page.tsx": { roles: R({ CASHIER: "allow", STAFF_NOPERM: "deny", OTHER_UNIT: "deny" }), perm: ["pos.sale.create"], notes: "posRegisterView ไม่ผ่าน = notFound (page-authz R-11)" },
  "src/app/app/sys/[id]/pos/reports/page.tsx": { roles: R({ CASHIER: "deny", STAFF_NOPERM: "deny", OTHER_UNIT: "deny" }), perm: ["pos.report.view"], notes: "สาขาที่ดูได้ = pos.report.view ต่อสาขา (page-authz PG-4)" },
  "src/app/app/sys/[id]/pos/reports/print/page.tsx": { roles: R({ CASHIER: "deny", STAFF_NOPERM: "deny", OTHER_UNIT: "deny" }), perm: ["pos.report.view"], notes: "การ์ดปฏิเสธก่อน posReportPrintAction (page-authz RP-1)" },
  "src/app/app/sys/[id]/pos/sales/page.tsx": { roles: R({ CASHIER: "allow", STAFF_NOPERM: "deny", OTHER_UNIT: "deny" }), perm: ["pos.sale.create", "pos.sale.read"], notes: "posSalesReadScope → notFound · where = posSaleWhere (page-authz S-8)" },
  "src/app/app/sys/[id]/pos/settings/page.tsx": { roles: R({ CASHIER: "cond", STAFF_NOPERM: "deny", OTHER_UNIT: "deny" }), perm: ["pos.sale.create", "pos.settings.manage"], notes: "แท็บทั่วไปอ่านได้ด้วย pos.sale.create · เขียน = action (page-authz PG-3)" },
  "src/app/app/sys/[id]/pos/shifts/page.tsx": { roles: R({ CASHIER: "cond", STAFF_NOPERM: "deny", OTHER_UNIT: "deny" }), perm: ["pos.shift.operate", "pos.shift.manage"], notes: "การ์ดปฏิเสธใน ShiftsClient · แคชเชียร์เห็นกะของตัวเองเมื่อมี pos.shift.operate (page-authz PG-2)" },
  "src/app/app/sys/[id]/pos/stock/page.tsx": { roles: R({ CASHIER: "deny", STAFF_NOPERM: "deny", OTHER_UNIT: "deny" }), perm: ["pos.stock.count"], notes: "การ์ดปฏิเสธ pos-stock-refusal (page-authz PG-1)" },
  "src/app/app/sys/[id]/pos/tables/page.tsx": { roles: R({ CASHIER: "allow", STAFF_NOPERM: "deny", OTHER_UNIT: "deny" }), perm: ["pos.sale.create"], notes: "posRegisterView ไม่ผ่าน = การ์ดปฏิเสธ (page-authz T-1)" },
  // ─ หน้าสาธารณะ ─
  "src/app/(store)/r/[token]/page.tsx": { tenantScope: "token: receipt 12 Crockford (60 บิต) · saleForToken unique index", notes: "แขนง POS: posPublicRateGuard receiptRead 60/นาที/IP ก่อนค้นโทเคน (CD-P52-F2 · P5.2-P5) · แขนงบัญชี accountRateGuard publicToken" }, // ORACLE-EDIT (builder P5.2 fix1 · CD-P52-F2): notes เดิม "🔴 แขนง POS ข้ามเพดาน IP …"
  "src/app/(store)/q/[linkToken]/page.tsx": { tenantScope: "token: order link 16 Crockford (80 บิต) · PosOrderLink.token unique · ACTIVE", notes: "isLinkToken ก่อนแตะ DB · เพดานอ่าน qrLink 30/นาที/IP (CD-P52-F3 · P5.2-P6)" }, // ORACLE-EDIT (builder P5.2 fix1 · CD-P52-F3): เดิม "ไม่มีเพดานอ่าน"
  "src/app/(store)/q/o/[orderToken]/page.tsx": { tenantScope: "token: order 12 Crockford (60 บิต) · PosOrder.publicToken unique", notes: "อ่านแล้วอาจเขียน 1 ครั้ง (หมดเวลาจ่าย) · เพดานอ่าน qrOrder 39/นาที/IP (CD-P52-F3 · P5.2-P6)" }, // ORACLE-EDIT (builder P5.2 fix1 · CD-P52-F3): เดิม "ไม่มีเพดานอ่าน"
  "src/app/(store)/q/t/[qrToken]/page.tsx": { tenantScope: "token: RestaurantTable.qrToken — ใหม่/หมุน = newTableQrToken qr_+base64url(16 ไบต์) 128 บิต · โทเคนเก่า (cuid / qr_<uuid32>) ใช้ต่อได้", notes: "CD-P52-F4 (P5.2-P2) · เพดานอ่าน qrTable 54/นาที/IP (CD-P52-F3) · รูปหลวม [A-Za-z0-9_-]{8,64} · หมุน QR ที่พิมพ์แล้ว = W27 (เจ้าของ)" }, // ORACLE-EDIT (builder P5.2 fix1 · CD-P52-F4/F3): เดิม "🔴 cuid() ส่วนสุ่ม < 60 บิต …"
  "src/app/(store)/d/page.tsx": { roles: R({ DEVICE: "token" }), tenantScope: "token: คุกกี้ pos_display (32 ไบต์ · tokenHash)", notes: "จับคู่ด้วยรหัสสั้น + เพดาน 10/นาที/IP (display.ts)" },
  "src/app/developers/pos/page.tsx": { roles: R({ ANON: "allow" }), tenantScope: "ไม่มีข้อมูลร้าน (คู่มือคงที่)", notes: "เอกสารสาธารณะ" },
  "src/app/(store)/s/[tenantSlug]/[unitSlug]/restaurant/t/[qrToken]/page.tsx": { tenantScope: "slug ร้าน/สาขา + qrToken", notes: "สาขาที่ผูก POS = redirect /q/t/<qrToken> (legacyTableQrRedirect) · ไม่ผูก = หน้าเดิม (LEG)" },
  // ─ route ─
  "src/app/api/v1/pos/[...path]/route.ts#GET": { roles: R({ API_KEY: "scope" }), tenantScope: "key: ApiKey.tenantId · systemId ของคีย์ / X-Shark-System · ตัวกรองสาขา pos.filter.unit", notes: "ประตูเดียว dispatch (qc-pos-p2.13 AU1–AU9)" },
  "src/app/api/v1/pos/[...path]/route.ts#POST": { roles: R({ API_KEY: "scope" }), tenantScope: "key: ApiKey.tenantId · systemId ของคีย์ / X-Shark-System · ตัวกรองสาขา pos.filter.unit", notes: "ประตูเดียว dispatch + Idempotency-Key (qc-pos-p2.13 ID1–ID5)" },
  "src/app/api/v1/pos/[...path]/route.ts#PATCH": { roles: R({ API_KEY: "scope" }), tenantScope: "key", notes: "ประตูเดียว dispatch" },
  "src/app/api/v1/pos/[...path]/route.ts#PUT": { roles: R({ API_KEY: "scope" }), tenantScope: "key", notes: "ประตูเดียว dispatch" },
  "src/app/api/v1/pos/[...path]/route.ts#DELETE": { roles: R({ API_KEY: "scope" }), tenantScope: "key", notes: "ประตูเดียว dispatch" },
  "src/app/api/v1/pos/openapi.json/route.ts#GET": { kind: "public", roles: R({ ANON: "allow" }), tenantScope: "ไม่มีข้อมูลร้าน", notes: "สเปกสาธารณะ" },
  "src/app/developers/pos.md/route.ts#GET": { kind: "public", roles: R({ ANON: "allow" }), tenantScope: "ไม่มีข้อมูลร้าน", notes: "คู่มือสาธารณะ" },
  "src/app/api/payment/beam/webhook/route.ts#POST": { kind: "public", roles: R({ ANON: "token", DEVICE: "n/a" }), tenantScope: "signature: hex HMAC-SHA256(raw, BEAM_WEBHOOK_SECRET) · ร้านจาก intent (referenceId pos-<pi_id>)", notes: "timingSafeEqual · ซ้ำ = idempotent (P5.2-S3 · qc-pos-p1.7 W2 ระดับฟังก์ชัน)" },
  "src/app/api/pos/platform/[provider]/[channelId]/route.ts#POST": { kind: "public", roles: R({ ANON: "token" }), tenantScope: "signature: x-shark-signature hex HMAC(raw, webhookSecret ของช่องทาง) · ร้านจากช่องทาง", notes: "โครง: ถูก = 503 ADAPTER_PENDING ไม่เขียน · ไม่มี timestamp/nonce (H6 · ruling 6 = adapter จริง)" },
  "src/app/api/pos/platform/[provider]/[channelId]/route.ts#GET": { kind: "public", roles: R({ ANON: "deny" }), tenantScope: "—", notes: "405" },
  "src/app/api/pos/print-agent/jobs/route.ts#GET": { kind: "public", roles: R({ ANON: "deny", DEVICE: "token" }), tenantScope: "token: Bearer spa_ + 32 ไบต์ (tokenHash) · ร้าน/สาขาจากแถว agent", notes: "long-poll ≤ PRINT_POLL_MAX_SEC" },
  "src/app/api/pos/print-agent/jobs/[id]/ack/route.ts#POST": { kind: "public", roles: R({ ANON: "deny", DEVICE: "token" }), tenantScope: "token: Bearer agent · งานต้องเป็นของ agent นั้น", notes: "ack ซ้ำ = P5.2-S4" },
  "src/app/api/pos/sync/route.ts#POST": { roles: R({ CASHIER: "allow", STAFF_NOPERM: "deny", OTHER_UNIT: "deny", OTHER_TENANT: "deny", ANON: "deny" }), perm: ["pos.sale.create"], unitScoped: true, tenantScope: "session (getAuth) · systemId/unitId/deviceId ตรวจซ้ำที่ offline-sync", notes: "sameOrigin (ไม่มี Origin = ผ่าน) · คีย์กันซ้ำต่อบิล (qc-pos-p3.4)" },
  "src/app/api/pos/sync/snapshot/route.ts#POST": { roles: R({ CASHIER: "allow", STAFF_NOPERM: "deny", OTHER_UNIT: "deny", OTHER_TENANT: "deny", ANON: "deny" }), perm: ["pos.sale.create"], unitScoped: true, tenantScope: "session (getAuth)", notes: "ราคา snapshot ต่อเครื่อง (qc-pos-p3.4)" },
  "src/app/api/cron/hourly/route.ts#GET": { roles: R({ ANON: "deny", OWNER: "n/a", MANAGER: "n/a", CASHIER: "n/a", STAFF_NOPERM: "n/a", OTHER_UNIT: "n/a", OTHER_TENANT: "n/a", API_KEY: "n/a", DEVICE: "token" }), tenantScope: "cron secret (isCronAuthorized)", notes: "งาน POS: forceCloseStaleShifts · expirePaymentIntents · expirePreorders · sendPosDailyBriefs · sweepPosBoard · sweepDealIntents" },
  "src/app/api/store/[tenantSlug]/[unitSlug]/restaurant/order/route.ts#POST": { kind: "public", roles: R({ ANON: "token" }), tenantScope: "slug ร้าน/สาขา + qrToken", notes: "LEG-1: สาขาที่ผูก POS = 409 POS_LINKED · เพดาน 20/นาที/IP" },
  "src/app/api/store/[tenantSlug]/[unitSlug]/restaurant/service-request/route.ts#POST": { kind: "public", roles: R({ ANON: "token" }), tenantScope: "slug ร้าน/สาขา + qrToken", notes: "LEG-1 409 · เพดาน 10/นาที/IP" },
  "src/app/api/store/[tenantSlug]/[unitSlug]/restaurant/session/route.ts#GET": { kind: "public", roles: R({ ANON: "token" }), tenantScope: "slug ร้าน/สาขา + qrToken", notes: "LEG-1 409 · เพดาน 20/นาที/IP" },
  "src/app/(store)/s/[tenantSlug]/[unitSlug]/restaurant/bill/route.ts#GET": { kind: "public", roles: R({ ANON: "token" }), tenantScope: "slug ร้าน/สาขา + qrToken", notes: "LEG-1 409 · เพดาน 30/นาที/IP" },
  "src/app/(store)/s/[tenantSlug]/[unitSlug]/restaurant/notify-payment/route.ts#POST": { kind: "public", roles: R({ ANON: "token" }), tenantScope: "slug ร้าน/สาขา + qrToken", notes: "LEG-1 409 · เพดาน 6/นาที/IP" },
  // ─ action: ค่าที่ตัวอนุมานพลาด (อ่านโค้ดแล้ว) ─
  "src/lib/modules/pos/ai-panel-actions.ts#posAiPanelAction": { notes: "REPORT_PERMISSION (reports.ts:28) · canManage = OWNER เฉพาะปุ่มตั้งค่า" },
  // ORACLE-EDIT (builder P5.2 fix1 · CD-P52-F1 controller B: O4 แก้เป็น "อ่านแบบปิดช่องอ่อนไหว เว้นแต่ UI ไม่ต้องอ่าน" — การ์ด AI โหลดตัวอ่านเฉพาะเจ้าของร้าน ⇒ ด่านเดียวกับตัวเขียน) — เดิม: MANAGER allow · notes "🔴 คาดหวัง … สงสัยเป็นช่อง P5.2-R2"
  "src/lib/modules/pos/ai-settings-actions.ts#getPosAiSettingsAction": { roles: R({ MANAGER: "deny", CASHIER: "deny", STAFF_NOPERM: "deny" }), perm: ["pos.settings.manage"], notes: "CD-P52-F1: ด่านเดียวกับ updatePosAiSettingsAction (OWNER + pos.settings.manage) ก่อนอ่าน DB · client (SharkSettings aiOwner) เรียกเฉพาะเจ้าของร้าน · ค่าตั้งมี brief.email/managerUserIds" },
  "src/lib/modules/pos/receipt-settings-actions.ts#updatePosReceiptUnitSettingsAction": { roles: R({ CASHIER: "deny", STAFF_NOPERM: "deny" }), perm: ["pos.device.manage"], notes: "ด่านในโมดูล receipt-settings.ts:169 evaluate pos.device.manage ที่สาขา · taxBranchNo = ทุกสาขา (:171)" },
  "src/lib/modules/pos/recipe-actions.ts#recipeCostAction": { roles: R({ CASHIER: "allow", STAFF_NOPERM: "deny" }), perm: ["pos.product.manage", "pos.report.view", "pos.sale.create"], notes: "ด่านในโมดูล recipe.ts:114 (sale.create | product.manage | report.view) · ต้นทุนเฉพาะ manage/report.view" },
  "src/lib/modules/pos/register-actions.ts#retryPendingStockCutsAction": { roles: R({ CASHIER: "deny", STAFF_NOPERM: "deny" }), perm: ["pos.settings.manage"], notes: "ด่านในโมดูล service.ts:1481 pos.settings.manage ที่สาขา" },
  "src/lib/modules/pos/settings-actions.ts#updatePosStaffCommissionAction": { roles: R({ MANAGER: "deny", CASHIER: "deny", STAFF_NOPERM: "deny" }), perm: ["hr.payroll.read"], notes: "ด่านในโมดูล settings-general.ts:613 canViewPayroll (OWNER หรือ hr.payroll.read)" },
  "src/lib/modules/pos/hr-link-actions.ts#syncStaffCommissionNowAction": { roles: R({ MANAGER: "deny", CASHIER: "deny", STAFF_NOPERM: "deny" }), perm: ["hr.payroll.read"], unitScoped: false, notes: "canViewPayroll (hr-link-actions.ts:61) · ทั้งร้าน" },
  "src/lib/modules/pos/ai-settings-actions.ts#updatePosAiSettingsAction": { roles: R({ MANAGER: "deny" }), notes: "เฉพาะ OWNER (ai-settings-actions.ts:49)" },
  "src/lib/modules/pos/credit-settings-actions.ts#updatePosCreditSettingsAction": { roles: R({ MANAGER: "deny", CASHIER: "deny", STAFF_NOPERM: "deny" }), perm: ["pos.credit.manage"], notes: "P3.6U CD-P36U-2: เฉพาะ OWNER — โมดูล credit-settings.ts:83 ตรวจ m.role === OWNER ใต้ FOR UPDATE · action ตรวจ pos.credit.manage ก่อน (:30) · เขียนแค่ settings.pos.credit.{enabled,requireBuyer} + orders.memberOnBill (controller override 22.10 หลัง merge P3.6U)" },
  "src/lib/modules/pos/payment-settings-actions.ts#updatePosPaymentSettingsAction": { roles: R({ MANAGER: "deny" }), notes: "pos.settings.payment + payment-settings.ts:127 actor.role !== OWNER" },
  "src/lib/modules/pos/integration-creds-actions.ts#saveIntegrationCredentialsAction": { roles: R({ MANAGER: "deny" }), notes: "integration-creds.ts:171 เฉพาะ OWNER (qc-pos-p3-skel CR1)" },
  "src/lib/modules/pos/chat-link-actions.ts#setPosChatSettingsAction": { roles: R({ MANAGER: "deny" }), notes: "chat-link.ts:66 actor.role !== OWNER" },
  "src/lib/pos-board-actions.ts#savePosBoardSettingsAction": { roles: R({ MANAGER: "deny", CASHIER: "deny", STAFF_NOPERM: "deny" }), notes: "board-settings.ts:182 เฉพาะ OWNER (action ไม่มีคีย์)" },
  "src/lib/pos-board-actions.ts#createAnomalyCardAction": { roles: R({ CASHIER: "deny", STAFF_NOPERM: "deny" }), perm: ["pos.report.anomaly", "pos.report.view"], notes: "ด่านใน pos-board-bridges (pos.report.view + pos.report.anomaly)" },
  "src/lib/pos-board-ui-actions.ts#posBoardCardsAction": { roles: R({ CASHIER: "cond", STAFF_NOPERM: "cond" }), notes: "กุญแจที่ไม่มีสิทธิ์ถูกตัดทิ้งเงียบ (ok:true cards []) — ไม่ใช่คำปฏิเสธ (ไม่อยู่ในชุด R1/R2)" },
  "src/lib/modules/pos/refund-actions.ts#refundSaleAction": { roles: R({ CASHIER: "cond" }), notes: "pos.sale.refund · แคชเชียร์ได้เฉพาะมี managerPin (refund.ts ตรวจ PIN + สิทธิ์ผู้จัดการ)" },
  "src/lib/modules/pos/bills-actions.ts#voidSaleAction": { roles: R({ CASHIER: "cond" }), notes: "pos.sale.void · แคชเชียร์ต้องมี PIN ผู้จัดการ/คำขออนุมัติ" },
  "src/lib/modules/pos/shift-actions.ts#openShiftAction": { notes: "🟡 D1c: deviceId จาก client (shift-actions.ts:77–79) · ruling 4 เลื่อนไปรอบแก้" },
  "src/lib/modules/pos/staff-pin-actions.ts#setStaffPinAction": { roles: R({ CASHIER: "deny" }), notes: "PIN ของคนอื่นต้อง pos.staff.manage (staff-pin.ts) — action ผ่านด่าน pos.sale.create ก่อน" },
  "src/lib/modules/pos/staff-pin-actions.ts#unlockStaffPinAction": { roles: R({ CASHIER: "deny" }), notes: "ปลดล็อก PIN คนอื่นต้อง pos.staff.manage (staff-pin.ts)" },
  "src/lib/actions/pos.ts#exportDaySalesCsvAction": { notes: "เดิม: throw ForbiddenError (ไม่อยู่ในชุด R2 ของ p1.6) · page-authz C-9" },
  "src/lib/actions/pos.ts#setItemSalePriceAction": { roles: R({ CASHIER: "deny", MANAGER: "cond" }), notes: "posCanSetTenantPrice ทุกสาขา (page-authz P-8) · throw ForbiddenError" },
};

// ── สร้างแถว ──
function deriveAction(a: ActionInfo, unitScoped: boolean): Row["roles"] {
  const hasCashier = a.perm.some((k) => CASHIER_PERMS.includes(k));
  const cashier = a.ownerOnly ? "deny" : a.perm.length === 0 ? "?" : hasCashier ? "allow" : "deny";
  return {
    OWNER: "allow",
    MANAGER: a.ownerOnly ? "deny" : "allow",
    CASHIER: cashier,
    STAFF_NOPERM: a.perm.length === 0 && !a.ownerOnly ? "?" : "deny",
    OTHER_UNIT: unitScoped ? "deny" : "n/a",
    ...SESSION_DENY,
  } as Row["roles"];
}
const PUBLIC_ROLES = (): Row["roles"] => ({ OWNER: "n/a", MANAGER: "n/a", CASHIER: "n/a", STAFF_NOPERM: "n/a", OTHER_UNIT: "n/a", OTHER_TENANT: "n/a", ANON: "token", API_KEY: "n/a", DEVICE: "n/a" });
const PAGE_ROLES = (): Row["roles"] => ({ OWNER: "allow", MANAGER: "allow", CASHIER: "?", STAFF_NOPERM: "?", OTHER_UNIT: "?", OTHER_TENANT: "deny", ANON: "deny", API_KEY: "n/a", DEVICE: "n/a" });

function evidenceFor(root: string, s: Scanned): string {
  const code = rd(root, s.file);
  const lines = code.split("\n");
  const from = Math.max(0, s.line - 1);
  const find = (re: RegExp, start = from, limit = 400) => {
    for (let i = start; i < Math.min(lines.length, start + limit); i++) if (re.test(lines[i]!)) return i + 1;
    return 0;
  };
  let n = 0;
  if (s.kind === "page") n = find(/View\(|Scope\(|posCanSetTenantPrice|canAccessUnit\(/, 0, 2000);
  else if (s.kind === "public" && s.file.endsWith("page.tsx")) n = find(/is\w+Token\(|_RE\.test\(|DISPLAY_COOKIE\)|legacyTableQrRedirect\(/, 0, 2000) || find(/export default/, 0, 2000);
  else if (s.surface.startsWith("rest:")) n = find(/^\s*action:\s*POS_SCOPES\.\w+/, from, 30);
  else if (s.file.endsWith("route.ts")) n = find(/authorization|getAuth\(|isCronAuthorized\(|verifyWebhook\(|handlePlatformInbound\(|ackPrintJob\(|claimPrintJobs\(|dispatch|posLinkedLegacyDoor\(|checkRateLimit\(|status: 405/, from, 60);
  if (!n) n = s.line;
  return `${s.file}:${n}`;
}
export function buildMatrix(root: string): { header: Record<string, unknown>; rows: Row[] } {
  const cat = permissionCatalog(root);
  const scanned = scanSurfaces(root);
  const suites = suiteTexts(root);
  const actionCache = new Map<string, ActionInfo[]>();
  const rows: Row[] = [];
  for (const s of scanned) {
    let row: Row;
    if (s.kind === "action" || (s.kind === "public" && s.surface.includes("#") && !s.file.endsWith("route.ts"))) {
      if (!actionCache.has(s.file)) actionCache.set(s.file, actionsOf(rd(root, s.file), cat, importedKeyConsts(root, s.file, rd(root, s.file), cat)));
      const a = actionCache.get(s.file)!.find((x) => `${s.file}#${x.name}` === s.surface)!;
      const unitScoped = /\bunitId\b|\bTarget\b|\bRegTarget\b|\bArgs\b/.test(a.sig) || /\bunitId\b/.test(a.body.slice(0, 400));
      const isPublic = s.kind === "public";
      row = {
        surface: s.surface,
        kind: s.kind,
        roles: isPublic ? { ...PUBLIC_ROLES(), ...(s.file.includes("/(store)/d/") ? { DEVICE: "token", ANON: "token" } : {}) } : deriveAction(a, unitScoped),
        perm: a.perm,
        tenantScope: isPublic ? (s.file.includes("/(store)/d/") ? "token: คุกกี้ pos_display" : s.file.includes("/(store)/q/") ? "token: QR โต๊ะ / ลิงก์สั่งล่วงหน้า / ออเดอร์ (อาร์กิวเมนต์แรก)" : "token: ใบเสร็จ 12 ตัว (อาร์กิวเมนต์แรก)") : "session: membership ของ session (requireTenant) · systemId/unitId จากคำขอตรวจซ้ำในโมดูล",
        unitScoped: isPublic ? false : unitScoped,
        call: callStyle(a.sig),
        evidence: `${s.file}:${a.gateLine}`,
        coveredBy: coveredByOf(a.name, suites),
        notes: a.ownerOnly ? "เฉพาะ OWNER (ตรวจบทบาทในไฟล์ action)" : a.perm.length === 0 ? "ไม่มีคีย์สิทธิ์ในไฟล์ action — ด่านอยู่ในโมดูล" : "",
      };
    } else if (s.kind === "page") {
      row = { surface: s.surface, kind: "page", roles: PAGE_ROLES(), perm: [], tenantScope: "session · appSystem.findFirst({id, tenantId, type POS}) → notFound", unitScoped: true, call: "page", evidence: evidenceFor(root, s), coveredBy: coveredByOf(s.surface.replace(/^src\/app\/app\/sys\/\[id\]\//, "").replace(/\/page\.tsx$/, "/page.tsx"), suites) || coveredByOf(s.surface, suites), notes: "" };
    } else if (s.surface.startsWith("rest:")) {
      const code = rd(root, s.file);
      const at = code.split("\n").slice(s.line - 1, s.line + 12).join("\n");
      const scopeKey = /action:\s*POS_SCOPES\.(\w+)/.exec(at)?.[1] ?? "";
      const scopes = rd(root, "src/lib/modules/pos/api/op.ts");
      const scope = new RegExp(`\\b${scopeKey}:\\s*"([^"]+)"`).exec(scopes)?.[1] ?? (scopeKey ? `?${scopeKey}` : "?");
      const opId = (s.extra?.notes ?? "").replace(/^op /, "");
      const hasId = s.surface.includes("{id}");
      row = {
        surface: s.surface,
        kind: "api",
        roles: { OWNER: "n/a", MANAGER: "n/a", CASHIER: "n/a", STAFF_NOPERM: "n/a", OTHER_UNIT: "deny", OTHER_TENANT: "deny", ANON: "deny", API_KEY: scope, DEVICE: "n/a" },
        perm: scope.startsWith("?") ? [] : [scope],
        tenantScope: hasId ? "key: ร้านของคีย์ · {id} ต้องเป็นของร้าน+ระบบ+สาขาที่คีย์เข้าได้ (404)" : "key: ร้านของคีย์ · unitId (query/body) ต้องเป็นสาขาของระบบ + ตัวกรองคีย์ (404)",
        unitScoped: true,
        call: "rest",
        evidence: evidenceFor(root, s),
        coveredBy: coveredByOf(`"${opId}"`, suites) || "qc-pos-p2.13",
        notes: `op ${opId}${hasId ? " · IDOR ข้ามร้าน/สาขาด้วย {id} = P5.2-K1/K2" : ""}`,
      };
    } else {
      row = {
        surface: s.surface,
        kind: s.kind,
        roles: s.kind === "public" ? PUBLIC_ROLES() : { ...PAGE_ROLES(), CASHIER: "?", STAFF_NOPERM: "?", OTHER_UNIT: "?" },
        perm: [],
        tenantScope: s.kind === "public" ? "token" : "?",
        unitScoped: false,
        call: s.file.endsWith("route.ts") ? "http" : "page",
        evidence: evidenceFor(root, s),
        coveredBy: coveredByOf(s.file.replace(/^src\/app/, "").replace(/\/(route|page)\.tsx?$/, ""), suites),
        notes: "",
      };
    }
    const o = OVERRIDES[s.surface];
    if (o) {
      const { roles, ...rest } = o;
      row = { ...row, ...rest, roles: { ...row.roles, ...(roles ?? {}) } as Row["roles"] };
      if (o.kind === "public" && !roles?.OWNER) row.roles = { ...PUBLIC_ROLES(), ...(roles ?? {}) } as Row["roles"];
    }
    rows.push(row);
  }
  const header = {
    $schema: "pos-authz-matrix/1",
    $note: "POS P5.2 ruling 3 — แหล่งเดียวของตารางสิทธิ์ POS · สร้างด้วย scripts/pos-authz-matrix-gen.mts (--write) · qc-pos-p5.2 M1 แดงเมื่อมี surface ที่ไม่อยู่ในตาราง · ใบใหม่ต้องรัน --write แล้วตรวจแถวของตัวเอง",
    $base: MATRIX_BASE,
    $roles: {
      OWNER: "เจ้าของร้าน (ทุกสาขา)",
      MANAGER: "MANAGER unitAccess [สาขา A] — evaluate = เต็มสิทธิ์ในสาขาที่คุม · คีย์ระดับร้าน (ไม่ส่ง unitId) ผ่านด้วย",
      CASHIER: "STAFF {pos.sale.create, member.customer.read} ที่สาขา A (PQC.cashierPermissions)",
      STAFF_NOPERM: "STAFF ไม่มีคีย์ POS ที่สาขา A",
      OTHER_UNIT: "ผู้จัดการสาขา A ส่ง unitId/ระเบียนของสาขา B",
      OTHER_TENANT: "OWNER ของร้านอื่น ส่ง id ของร้านนี้",
      ANON: "ไม่มี session (action → redirect /login · route → 401)",
      API_KEY: "scope ที่ op ต้องมี (REST) · scope = ประตู dispatch",
      DEVICE: "โทเคนเครื่อง/จอลูกค้า/ตัวช่วยพิมพ์/ลับ cron",
    },
    $values: "allow · deny · cond (มีเงื่อนไข: PIN ผู้จัดการ/โหมดสาขา/ของตัวเอง) · token · scope · n/a · ? (อนุมานไม่ได้ — hunter อ่าน)",
    $scan: "page: src/app/app/sys/[id]/pos/**/page.tsx + sys/[id]/page.tsx · public: page.tsx ใต้ (store)/developers ที่ import POS · action: export async function ของไฟล์ \"use server\" ใต้ src/lib/modules/pos/** · src/lib/pos-*.ts · src/lib/actions/pos.ts · (store)/** · api: route.ts ใต้ api/pos · api/v1/pos · route ใดที่ import POS · rest: definePosOp ใน pos/api/ops",
    $outOfScope: [
      "src/app/app/u/[unitSlug]/restaurant/** · booking · src/app/app/approvals — หน้าของโมดูลเดิม เรียก POS เป็นทางผ่าน (ประตู LEG ของ P2.14 / D11 = lens ของ hunter L1)",
      "src/app/(store)/r/[token]/actions.ts — แขนงใบกำกับของบัญชี (ไม่ import POS · accountRateGuard publicSubmit)",
      "src/lib/actions/restaurant.ts · booking.ts · modules/giftcard — action ของโมดูลอื่นที่เรียก createSale (สัญญา pos-sale-contract.json)",
    ],
  };
  rows.sort((a, b) => (a.surface < b.surface ? -1 : a.surface > b.surface ? 1 : 0));
  return { header, rows };
}
export function renderMatrix(m: { header: Record<string, unknown>; rows: Row[] }): string {
  const head = JSON.stringify(m.header, null, 2).replace(/\n}$/, "");
  const body = m.rows.map((r) => "    " + JSON.stringify(r)).join(",\n");
  return `${head},\n  "rows": [\n${body}\n  ]\n}\n`;
}

// ── CLI ──
const isMain = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` || (process.argv[1] ?? "").endsWith("pos-authz-matrix-gen.mts");
  } catch {
    return false;
  }
})();
if (isMain) {
  const root = process.cwd();
  const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--list") ? "list" : "check";
  if (mode === "list") {
    for (const s of scanSurfaces(root)) console.log(`${s.kind.padEnd(6)} ${s.surface}`);
    process.exit(0);
  }
  const text = renderMatrix(buildMatrix(root));
  if (mode === "write") {
    writeFileSync(join(root, MATRIX_PATH), text);
    const m = JSON.parse(text) as { rows: Row[] };
    const by: Record<string, number> = {};
    for (const r of m.rows) by[r.kind] = (by[r.kind] ?? 0) + 1;
    console.log(`เขียน ${relative(root, join(root, MATRIX_PATH))}: ${m.rows.length} แถว ${JSON.stringify(by)}`);
    process.exit(0);
  }
  const cur = rd(root, MATRIX_PATH);
  if (cur === text) {
    console.log(`✅ ${MATRIX_PATH} ตรงกับตัวสร้าง`);
    process.exit(0);
  }
  console.log(`❌ ${MATRIX_PATH} ไม่ตรงกับตัวสร้าง — รัน --write แล้วตรวจ diff`);
  process.exit(1);
}
