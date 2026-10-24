// qc-pos-p5.3.mts — POS RUN ใบ P5.3 "ประสิทธิภาพ" (brief P5 §4 P5.3 · §10 มติ 7 8 9 · W-next-6) — ผู้เขียน oracle บัญชี B · 22 ต.ค. 2026
//
// ใช้:
//   bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p5.3.mts --list
//   bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p5.3.mts                 # โหมดด่าน (pos-gates-all / qc:all): ข้อสถิตอย่างเดียว · ไม่แตะ DB · ไม่เปิดเบราว์เซอร์
//   bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p5.3.mts --no-db         # = โหมดด่าน
//   bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p5.3.mts --red-before    # ข้อสถิตกับไฟล์ของฐาน PIN (git show) — แดงก่อนมีของใบนี้
//   ผู้คุม (รอบวัดจริง · ทรี d · QC5 · หลัง seed-pos-perf + build + serve · ห้ามรันคู่ build/typecheck/รอบภาพ/ตัวกด):
//   bash scripts/iso.sh bash scripts/qc5.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p5.3.mts --base http://127.0.0.1:<port> --tenant posqc-perf-<rand>
//     [--cold 5] [--warm 10] [--lookups 50] [--scans 20] [--bills 5] [--only B1,B2,…]
//
// ═════════════════════════ วิธีวัด (ledger/wo-notes/pos-P5.3-oracle.md §1) ═════════════════════════
// จอ       Chromium headless 1024×768 (iPad แนวนอน · hasTouch · ไม่ใช่ mobile) · แคชเชียร์ของร้านวัดผล (session mint · โทเคนผู้ขาย issueStaffToken ·
//          เครื่องที่ seed ลงทะเบียน · กะเปิดโดยเจ้าของผ่าน shift.openShift แล้วปิดนับตรงยอดตอนจบ)
// B1 cold  browser context ใหม่ต่อรอบ (แคช HTTP ว่าง) × --cold (5) · TTI = performance.now() (นับจาก navigation start) ตอนที่กริด
//          `pos-reg-grid` ไม่ busy + การ์ดสินค้าแรกเห็นได้ · hydrate แล้ว (React props บน DOM) · จุดกลางการ์ดไม่ถูกอะไรทับ (elementFromPoint)
// B2 warm  context เดียว อุ่น 1 รอบ แล้ว page.goto ซ้ำ × --warm (10) (แคช HTTP อุ่น) · TTI แบบเดียวกัน · p95 ≤ 1000 ms (gate)
// B2S      registerCatalog ในโปรเซส (ตัวโหลดหน้าแรกของหน้าขาย) อุ่น 2 + 20 รอบ · p50/p95 + จำนวน query (รายงาน)
// B3       registerScan ในโปรเซส (= ทางของเครื่องสแกนหน้าขาย และ handler ของ REST /products/lookup) × --lookups (50) บาร์โค้ดต่างกัน ·
//          catalog.byBarcode × 50 (รายงาน) · RTT ฐาน = SELECT 1 × 50 (รายงานคู่) — ตัวเลข server ทุกตัวรวม RTT ฐานแล้ว (net = ลบ q×RTT)
// B3H      HTTP GET /api/v1/pos/products/lookup บนเซิร์ฟเวอร์ที่เสิร์ฟ × 50 (คีย์ REST ของร้าน) · RTT แอป = GET /api/v1/pos/openapi.json × 50 (ไม่แตะ DB)
// B3U      เครื่องสแกนแบบคีย์บอร์ด (puppeteer keyboard.type + Enter ≤ 30 ms ต่อแป้น = SCAN_MAX_GAP_MS) × --scans (20) สินค้านอกหน้าแรก ·
//          เวลา = keydown ของอักษรตัวสุดท้าย → rAF หลังบรรทัดใหม่ขึ้นใน DOM · p95 ≤ 100 ms (gate · W-next-6 "ทางหน้าขาย")
// B4       บิล 200 บรรทัด × --bills (5): โหลดหน้า · โหลดเพิ่มให้มี ≥ 200 การ์ด · แตะ 199 การ์ด (รอ quote เงียบ) · แตะใบที่ 200 →
//          B4A เวลาถึงบรรทัด 200 ขึ้น (≤ 100 ms) · B4Q quote round-trip ของตะกร้า 200 บรรทัด (server action request → finished · ≤ 1000 ms) ·
//          B4P กดยืนยันชำระ (พอดียอด เงินสด) → การ์ดขายสำเร็จ `pos-reg-done` (≤ 2000 ms) — ⚠️ บิลเงินจริงในร้านวัดผลเท่านั้น (ลบไปกับ --drop)
// B4N      quoteRegisterCart ในโปรเซสที่ 1/20/200 บรรทัด อุ่น 2 + 10 รอบ · ความชัน query ต่อบรรทัด (q200−q20)/180 < 0.5 (gate · ไม่ใช่เวลา ⇒ แดงทันที)
// B5       listOrders ในโปรเซส × 20 (ค่าคงที่ต่อรอบ poll ของหน้าออเดอร์ · รายงาน · ข้ามได้ด้วย --only)
// แดง      มติ 8: ข้อ gate ที่เกินงบ "สองรอบติด" = แดง · เกินรอบเดียว = 🟡 (ok) — รอบก่อนอ่านจาก /root/pos-runs/perf/p53-*.json ล่าสุด (อายุ ≤ 24 ชม.)
//          ข้อที่วัดไม่ได้ (หน้าเด้ง login · หา element ไม่เจอ · บิลไม่บันทึก) = แดงทันทีพร้อมเหตุผล
// ผล       ตาราง + /root/pos-runs/perf/p53-<UTC>.json + บรรทัด JSON_SUMMARY {total passed failed metrics{p50 p95 budget gate verdict} rtt …}
// 🔴 รอบวัด: QC5 เท่านั้น (ep-fragrant-thunder · QC4 เฉพาะ PERF_ALLOW_QC4=1 ตามมติผู้คุม) · ร้าน posqc-perf-* เท่านั้น (ไม่ใช่ coffee/resto) ·
//    ต้องอยู่ใต้ with-gate-lock (SHARK_GATE_LOCK_MARKER) · ห้ามตั้ง CI · --base ต้องเป็น loopback และไม่ใช่ :3215 (CRM) ·
//    fetch ของโปรเซสนี้ออกได้เฉพาะ --base · session ที่ mint ลบเสมอ (finally + สัญญาณ) · โปรไฟล์ chromium ลบเสมอ ·
//    ไม่เรียก submit/createSale ในโปรเซส (scheduleDrain ในโปรเซสนี้จะระบายคิวของร้านอื่น) — บิลเกิดผ่านเซิร์ฟเวอร์ที่เสิร์ฟเท่านั้น
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SUITE = "qc-pos-p5.3";
/** ฐานของใบ (origin/session/pos ตอนเขียน oracle) — --red-before อ่านไฟล์ของหมุดนี้ */
const PIN = process.env.P53_PIN || "045ca85f";
/** หมุดเลน (แม่แบบ LANE-RULES) — ใบนี้ไม่มีข้อ "ไฟล์ห้ามแตะ" จึงใช้แค่พิมพ์คู่กับ PIN */
const LANE_PIN = process.env.P53_LANE_PIN || PIN;
const ROOT = process.cwd();
const ARGV = process.argv.slice(2);
const has = (f: string) => ARGV.includes(f);
const argOf = (f: string): string | null => (has(f) ? (ARGV[ARGV.indexOf(f) + 1] ?? null) : null);
const LIST = has("--list");
const NO_DB = has("--no-db");
const BASE_RAW = argOf("--base");
const TENANT = argOf("--tenant");
const REV = has("--red-before") ? PIN : argOf("--rev");
const ONLY = (argOf("--only") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const want = (k: string) => ONLY.length === 0 || ONLY.includes(k);
const intArg = (f: string, lo: number, hi: number, d: number) => {
  const n = Number(argOf(f) ?? d);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : d;
};
const RUNS = { cold: intArg("--cold", 3, 20, 5), warm: intArg("--warm", 3, 30, 10), lookups: intArg("--lookups", 10, 200, 50), scans: intArg("--scans", 5, 60, 20), bills: intArg("--bills", 2, 10, 5), server: 20, quote: 10 };
const PERF_DIR = "/root/pos-runs/perf";
const VIEWPORT = { width: 1024, height: 768 };

// ═════════════════════════ งบ (มติ 8 = W-next-6 ค่าปริยาย) — ข้อ S1 ตรวจตารางนี้กับ W_NEXT_6 ═════════════════════════
export const PERF_BUDGET = [
  { id: "P5.3-B1", metric: "register cold TTI (new context)", stat: "p95", budget: null, gate: false, unit: "ms", note: "W-next-6: cold reported only" },
  { id: "P5.3-B2", metric: "register warm TTI (cache warm)", stat: "p95", budget: 1000, gate: true, unit: "ms", note: "W-next-6: < 1.0 s warm on an iPad-class screen" },
  { id: "P5.3-B2S", metric: "registerCatalog in-process (page loader)", stat: "p95", budget: null, gate: false, unit: "ms", note: "server number reported beside RTT" },
  { id: "P5.3-B3", metric: "server barcode lookup (registerScan in-process)", stat: "p95", budget: 100, gate: false, unit: "ms", note: "W-next-6: server lookup reported" },
  { id: "P5.3-B3H", metric: "REST GET /products/lookup over HTTP", stat: "p95", budget: null, gate: false, unit: "ms", note: "reported beside app RTT" },
  { id: "P5.3-B3U", metric: "wedge scan → cart line rendered (register)", stat: "p95", budget: 100, gate: true, unit: "ms", note: "W-next-6: barcode < 100 ms on the register path" },
  { id: "P5.3-B4A", metric: "add line 200 → rendered", stat: "p95", budget: 100, gate: true, unit: "ms", note: "W-next-6: 200 lines = responsive UI" },
  { id: "P5.3-B4Q", metric: "quote round-trip at 200 lines", stat: "p95", budget: 1000, gate: true, unit: "ms", note: "brief U3" },
  { id: "P5.3-B4P", metric: "pay confirm → done card at 200 lines", stat: "p95", budget: 2000, gate: true, unit: "ms", note: "W-next-6: pay ≤ 2 s" },
  { id: "P5.3-B4N", metric: "quote queries per line 20→200 (N+1)", stat: "slope", budget: 0.5, gate: true, unit: "q/line", note: "structural — red on first run" },
  { id: "P5.3-B5", metric: "orders poll (listOrders in-process)", stat: "p95", budget: null, gate: false, unit: "ms", note: "optional · reported" },
] as const;
/** ค่าปริยายของ W-next-6 (brief §7) — ห้ามแก้โดยไม่มีคำตัดสินของเจ้าของ (ORACLE-EDIT) */
const W_NEXT_6: Record<string, number> = { "P5.3-B2": 1000, "P5.3-B3U": 100, "P5.3-B4A": 100, "P5.3-B4Q": 1000, "P5.3-B4P": 2000 };
const REPORT_ONLY = ["P5.3-B1", "P5.3-B2S", "P5.3-B3", "P5.3-B3H", "P5.3-B5"];

// ═════════════════════════ ทะเบียนข้อ ═════════════════════════
type Def = { id: string; mode: "static" | "measure"; title: string };
const DEFS: Def[] = [
  { id: "P5.3-S1", mode: "static", title: "ตาราง PERF_BUDGET มีครบ · ค่า gate = W-next-6 (B2 1000 · B3U 100 · B4A 100 · B4Q 1000 · B4P 2000) · cold/server = รายงาน" },
  { id: "P5.3-S2", mode: "static", title: "seed-pos-perf.mts มีด่าน: ห้าม coffee/resto · id posqc-perf-* · host QC5/QC4 · QC4 สร้างได้เฉพาะ PERF_ALLOW_QC4 · --drop ตรง slug · writer ของโมดูล · ไม่ drainAll · ไฟล์กุญแจนอกรีโป" },
  { id: "P5.3-S3", mode: "static", title: "ไม่มี host prod: oracle/seed ไม่อ่าน .env · ไม่มี host prod/QC1–3 · --base รับ loopback เท่านั้น (ไม่ใช่ :3215) · รอบวัดต้อง QC5" },
  { id: "P5.3-S4", mode: "static", title: "pos-gates.json มี qc-pos-p5.3 · mode ตามกติกา G2 (ไม่มีด่าน SKIP = unforced) · ไม่มี needs" },
  { id: "P5.3-N1", mode: "static", title: "self-test: ตัดสิน S2 แดงเมื่อด่าน coffee/resto หรือ writer ของโมดูลหายไป (probe ลบ)" },
  { id: "P5.3-N2", mode: "static", title: "self-test: ตัดสิน S1 แดงเมื่อแก้งบ B2 เป็น 1500 หรือปิด gate ของ B4P" },
  { id: "P5.3-N3", mode: "static", title: "self-test: baseAllowed ปฏิเสธ https://shark.in.th · :3215 · host อื่น — รับ 127.0.0.1/localhost · ตัดสิน S3 แดงเมื่อมี .env/host prod" },
  { id: "P5.3-N4", mode: "static", title: "self-test: ตัดสิน S4 แดงเมื่อ mode forced / ไม่มีแถว" },
  { id: "P5.3-N5", mode: "static", title: "self-test: กติกาสองรอบติด (เกิน+เกิน = แดง · เกินครั้งแรก = 🟡 · วัดไม่ได้ = แดง) · ความชัน N+1 (30/49/229 แดง · 30/32/33 เขียว)" },
  { id: "P5.3-B1", mode: "measure", title: "B1 cold TTI p50/p95 (รายงาน)" },
  { id: "P5.3-B2", mode: "measure", title: "B2 warm TTI p95 ≤ 1000 ms" },
  { id: "P5.3-B2S", mode: "measure", title: "B2S registerCatalog ในโปรเซส (รายงาน + query)" },
  { id: "P5.3-B3", mode: "measure", title: "B3 registerScan ในโปรเซส p95 (รายงาน · งบ 100 ms) + byBarcode + RTT ฐาน" },
  { id: "P5.3-B3H", mode: "measure", title: "B3H REST /products/lookup ทาง HTTP (รายงาน) + RTT แอป" },
  { id: "P5.3-B3U", mode: "measure", title: "B3U สแกนเครื่องคีย์บอร์ด → บรรทัดขึ้น p95 ≤ 100 ms" },
  { id: "P5.3-B4A", mode: "measure", title: "B4A เพิ่มบรรทัดที่ 200 → ขึ้นจอ p95 ≤ 100 ms" },
  { id: "P5.3-B4Q", mode: "measure", title: "B4Q quote 200 บรรทัด round-trip p95 ≤ 1000 ms" },
  { id: "P5.3-B4P", mode: "measure", title: "B4P ยืนยันชำระ → การ์ดสำเร็จ (200 บรรทัด) p95 ≤ 2000 ms" },
  { id: "P5.3-B4N", mode: "measure", title: "B4N quote 1/20/200 บรรทัด ไม่มี N+1 (ความชัน < 0.5 query/บรรทัด)" },
  { id: "P5.3-B5", mode: "measure", title: "B5 listOrders ในโปรเซส (รายงาน)" },
  { id: "P5.3-Z1", mode: "measure", title: "Z1 คืนสภาพ: session ที่ mint ลบหมด · กะที่เปิดในรอบนี้ปิดแล้ว · โปรไฟล์ chromium ลบแล้ว" },
  { id: "P5.3-Z2", mode: "measure", title: "Z2 ไม่มี fetch ออกนอก --base จากโปรเซสนี้" },
  { id: "P5.3-Z3", mode: "measure", title: "Z3 บิลของเครื่องวัดผลอยู่ในร้านวัดผลเท่านั้น · บิลรอบนี้ = จำนวนบิล B4 · ทุกใบ 200 บรรทัด" },
];

// ═════════════════════════ ตัวตัดสินบริสุทธิ์ (ใช้ทั้งข้อจริงและ self-test) ═════════════════════════
const LOOPBACK_HOSTS = ["127.0.0.1", "localhost"];
/** --base: http(s) loopback เท่านั้น · ห้ามพอร์ต CRM 3215 */
export function baseAllowed(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return (u.protocol === "http:" || u.protocol === "https:") && LOOPBACK_HOSTS.includes(u.hostname) && u.port !== "3215";
  } catch {
    return false;
  }
}
export function judgeBudgets(src: string | null): string[] {
  if (src === null) return ["ไม่มีไฟล์ scripts/qc-pos-p5.3.mts (ไม่มีตาราง PERF_BUDGET)"];
  const block = /export const PERF_BUDGET = \[([\s\S]*?)\] as const;/.exec(src)?.[1];
  if (!block) return ["ไม่พบ export const PERF_BUDGET = [ … ] as const"];
  const rows = new Map<string, { budget: string; gate: string }>();
  for (const m of block.matchAll(/\{ id: "(P5\.3-[A-Z0-9]+)"[^\n]*?budget: (null|[\d.]+), gate: (true|false)/g)) rows.set(m[1]!, { budget: m[2]!, gate: m[3]! });
  const p: string[] = [];
  for (const [id, b] of Object.entries(W_NEXT_6)) {
    const r = rows.get(id);
    if (!r) p.push(`${id} ไม่อยู่ในตาราง`);
    else if (r.gate !== "true" || Number(r.budget) !== b) p.push(`${id} budget ${r.budget} gate ${r.gate} ≠ W-next-6 ${b} gate`);
  }
  for (const id of REPORT_ONLY) if (rows.get(id)?.gate !== "false") p.push(`${id} ต้องเป็นรายงาน (gate false)`);
  if (rows.get("P5.3-B4N")?.gate !== "true") p.push("P5.3-B4N (N+1) ต้องเป็น gate");
  return p;
}
export function judgeSeed(src: string | null): string[] {
  if (src === null) return ["ไม่มีไฟล์ scripts/seed-pos-perf.mts"];
  const p: string[] = [];
  const need: [string, RegExp][] = [
    ["ห้ามร้าน coffee", /PERF_FORBIDDEN_TENANTS = \[[^\]]*"posqc-coffee-tenant"/],
    ["ห้ามร้าน resto", /PERF_FORBIDDEN_TENANTS = \[[^\]]*"posqc-resto-tenant"/],
    ["รูป id posqc-perf-*", /PERF_ID_RE = \/\^posqc-perf-/],
    ["host QC5", /qc5: "ep-fragrant-thunder"/],
    ["host QC4", /qc4: "ep-frosty-lab"/],
    ["ด่าน env ของ POS (loadPosQcEnv)", /loadPosQcEnv\(SUITE\)/],
    ["QC4 สร้างได้เฉพาะ PERF_ALLOW_QC4", /HOST === "qc4" && process\.env\.PERF_ALLOW_QC4 !== "1"/],
    ["--drop ผ่านด่าน id", /if \(DROP_ID\) \{\s*assertPerfTenantId\(DROP_ID\)/],
    ["ลบ Tenant ตรง id+slug", /DELETE FROM "Tenant" WHERE id = \$1 AND slug = \$1/],
    ["ไฟล์กุญแจนอกรีโป /root/pos-runs/", /PERF_CREDS_DIR = "\/root\/pos-runs\//],
  ];
  for (const [label, re] of need) if (!re.test(src)) p.push(`ขาด: ${label}`);
  for (const w of ["catalog.createProduct(", "catalog.createCategory(", "priceRule.savePriceRule(", "memberFacade.findOrCreate(", "payment.savePaymentProfile(", "device.registerDevice(", "staffPin.setStaffPin(", "apiKeys.createApiKey("])
    if (!src.includes(w)) p.push(`ไม่ใช้ writer ของโมดูล ${w}`);
  const code = src.replace(/^\s*\/\/.*$/gm, ""); // ข้อห้ามตัดสินจากโค้ด (บรรทัดคอมเมนต์ที่ "บอกว่าไม่ทำ" ไม่นับ)
  if (/\.(posProduct|posCategory|posPriceRule|posDevice|posStaffPin|paymentProfile|customer)\.(create|createMany|update|updateMany|upsert)\(/.test(code)) p.push("เขียนแคตตาล็อก/โปร/เครื่อง/PIN/สมาชิก/พร้อมเพย์ตรงด้วย prisma (ต้องผ่าน writer ของโมดูล)");
  if (/drainAll\s*\(/.test(code)) p.push("เรียก drainAll");
  if (/["'`]\.env["'`]/.test(code)) p.push("อ้าง .env");
  return p;
}
/** host prod + QC1–3 ของ CRM — ประกอบจากชิ้น (ไฟล์นี้เองต้องไม่มีสตริงเต็ม ไม่งั้น S3 จับตัวเอง) */
const FORBIDDEN_HOST_MARKS = [["ep", "royal", "night"], ["ep", "plain", "art"], ["ep", "cool", "shadow"], ["ep", "weathered", "river"]].map((x) => x.join("-"));
/** ชื่อไฟล์ env ของ prod ประกอบจากชิ้น (เหตุผลเดียวกัน) */
const DOT_ENV = [".", "env"].join("");
export function judgeNoProd(oracleSrc: string | null, seedSrc: string | null): string[] {
  const p: string[] = [];
  for (const [name, s] of [["qc-pos-p5.3.mts", oracleSrc], ["seed-pos-perf.mts", seedSrc]] as const) {
    if (s === null) {
      p.push(`ไม่มีไฟล์ ${name}`);
      continue;
    }
    if (/["'`]\.env["'`]/.test(s)) p.push(`${name} อ้าง .env`);
    for (const h of FORBIDDEN_HOST_MARKS) if (s.includes(h)) p.push(`${name} มี host ${h}`);
  }
  if (oracleSrc !== null) {
    const lb = /const LOOPBACK_HOSTS = \[([^\]]*)\]/.exec(oracleSrc)?.[1];
    if (lb === undefined) p.push("oracle ไม่มี LOOPBACK_HOSTS");
    else if (lb.split(",").map((x) => x.trim().replace(/^"|"$/g, "")).some((h) => !["127.0.0.1", "localhost"].includes(h))) p.push(`LOOPBACK_HOSTS มี host นอก loopback (${lb.trim()})`);
    if (!/u\.port !== "3215"/.test(oracleSrc)) p.push("baseAllowed ไม่กันพอร์ต CRM 3215");
    if (!/PERF_HOST_QC5 = "ep-fragrant-thunder"/.test(oracleSrc)) p.push("รอบวัดไม่ผูก QC5");
  }
  return p;
}
export function judgeGates(manifestText: string | null, oracleSrc: string | null): string[] {
  if (manifestText === null) return ["ไม่มี scripts/pos-gates.json"];
  let man: Any;
  try {
    man = JSON.parse(manifestText);
  } catch (e) {
    return [`pos-gates.json อ่านไม่ได้: ${(e as Error).message.slice(0, 60)}`];
  }
  const rows = (Array.isArray(man?.suites) ? man.suites : []).filter((s: Any) => s?.suite === SUITE);
  if (rows.length !== 1) return [`แถว ${SUITE} ใน pos-gates.json = ${rows.length} (ต้อง 1)`];
  const wantMode = oracleSrc !== null && new RegExp(["QC", "FORCE"].join("_")).test(oracleSrc) ? "forced" : "unforced"; // กติกา G2 ของ qc-pos-p2.14 (ประกอบชื่อจากชิ้น — ไฟล์นี้ไม่มีด่าน SKIP)
  const p: string[] = [];
  if (rows[0].mode !== wantMode) p.push(`mode ${rows[0].mode} (กติกา G2 → ${wantMode})`);
  if (rows[0].needs !== undefined) p.push(`needs ${rows[0].needs} (ใบนี้ไม่มี seed ของด่าน)`);
  return p;
}
export type Verdict = "green" | "amber" | "red" | "report" | "error";
/** มติ 8: gate เกินงบสองรอบติด = แดง · รอบแรกที่เกิน = amber · วัดไม่ได้ = error (แดง) · ไม่ใช่ gate = report */
export function verdict(gate: boolean, budget: number | null, value: number | null, prevOver: boolean | null): Verdict {
  if (value === null || !Number.isFinite(value)) return "error";
  if (!gate || budget === null) return "report";
  if (value <= budget) return "green";
  return prevOver === true ? "red" : "amber";
}
/** N+1: ความชัน query ต่อบรรทัดระหว่าง 20 → 200 บรรทัด */
export function slopeOf(q20: number, q200: number): number {
  return (q200 - q20) / 180;
}
const isOk = (v: Verdict) => v === "green" || v === "amber" || v === "report";

// ═════════════════════════ ตัวช่วยทั่วไป ═════════════════════════
const checks: { id: string; ok: boolean; expected: string; actual: string }[] = [];
function chk(id: string, ok: boolean, expected: unknown, actual: unknown): boolean {
  checks.push({ id, ok, expected: String(expected), actual: String(actual) });
  const t = DEFS.find((d) => d.id === id)?.title ?? "";
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${t}${ok ? ` — ${String(actual).slice(0, 240)}` : ` — expected ${String(expected).slice(0, 160)} | actual ${String(actual).slice(0, 400)}`}`);
  return ok;
}
const joinP = (p: string[]) => (p.length ? p.join(" · ") : "ครบ");
const pct = (xs: number[], p: number) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.ceil((p / 100) * a.length) - 1)]! : NaN;
};
const r1 = (x: number) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : x);
function readRev(rel: string): string | null {
  if (!REV) return existsSync(`${ROOT}/${rel}`) ? readFileSync(`${ROOT}/${rel}`, "utf8") : null;
  try {
    return execFileSync("git", ["-C", ROOT, "show", `${REV}:${rel}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}
function headSha(): string {
  try {
    return execFileSync("git", ["-C", ROOT, "rev-parse", "--short=8", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "?";
  }
}

// ═════════════════════════ --list ═════════════════════════
if (LIST) {
  console.log(`${SUITE} · PIN ${PIN} · LANE_PIN ${LANE_PIN} · ${DEFS.length} ข้อ (static ${DEFS.filter((d) => d.mode === "static").length} · measure ${DEFS.filter((d) => d.mode === "measure").length})`);
  for (const d of DEFS) console.log(`  ${d.id.padEnd(9)} ${d.mode.padEnd(7)} ${d.title}`);
  console.log("\nงบ (PERF_BUDGET):");
  for (const b of PERF_BUDGET) console.log(`  ${b.id.padEnd(9)} ${b.metric.padEnd(48)} ${b.stat.padEnd(5)} ${String(b.budget ?? "—").padStart(5)} ${b.unit.padEnd(6)} ${b.gate ? "gate" : "report"} · ${b.note}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "list", total: 0, passed: 0, ids: DEFS.map((d) => d.id) })}`);
  process.exit(0);
}

// ═════════════════════════ ข้อสถิต (ทุกโหมด) ═════════════════════════
function runStatic(): void {
  console.log(`── ข้อสถิต${REV ? ` (ไฟล์ของ ${REV} ผ่าน git show — red-before)` : " (ไฟล์ในทรี)"} ──`);
  const oracleSrc = readRev("scripts/qc-pos-p5.3.mts");
  const seedSrc = readRev("scripts/seed-pos-perf.mts");
  const manifest = readRev("scripts/pos-gates.json");
  const s1 = judgeBudgets(oracleSrc);
  chk("P5.3-S1", s1.length === 0, "ตารางครบ · ค่า = W-next-6", joinP(s1));
  const s2 = judgeSeed(seedSrc);
  chk("P5.3-S2", s2.length === 0, "ด่านครบ", joinP(s2));
  const s3 = judgeNoProd(oracleSrc, seedSrc);
  chk("P5.3-S3", s3.length === 0, "ไม่มี prod", joinP(s3));
  const s4 = judgeGates(manifest, oracleSrc);
  chk("P5.3-S4", s4.length === 0, "แถว unforced 1 แถว", joinP(s4));
  // self-test: ตัวตัดสินของไฟล์นี้ (head) ต้องพลิกเป็นแดงกับอินพุตที่ถูกทำให้เสีย — ใช้ไฟล์ในทรีเสมอ (ไม่ใช่ของ REV)
  const headOracle = existsSync(`${ROOT}/scripts/qc-pos-p5.3.mts`) ? readFileSync(`${ROOT}/scripts/qc-pos-p5.3.mts`, "utf8") : "";
  const headSeed = existsSync(`${ROOT}/scripts/seed-pos-perf.mts`) ? readFileSync(`${ROOT}/scripts/seed-pos-perf.mts`, "utf8") : "";
  const n1a = judgeSeed(headSeed.replace('"posqc-coffee-tenant", ', ""));
  const n1b = judgeSeed(headSeed.replaceAll("catalog.createProduct(", "createProductRaw("));
  const n1c = judgeSeed(headSeed + '\nawait P.posProduct.create({ data: {} });\n');
  chk("P5.3-N1", judgeSeed(headSeed).length === 0 && n1a.length > 0 && n1b.length > 0 && n1c.length > 0, "head เขียว · probe ลบ 3 แบบแดง", `head ${judgeSeed(headSeed).length} · ไม่มี coffee ${n1a.length} · ไม่มี createProduct ${n1b.length} · raw insert ${n1c.length}`);
  const n2a = judgeBudgets(headOracle.replace('{ id: "P5.3-B2", metric: "register warm TTI (cache warm)", stat: "p95", budget: 1000', '{ id: "P5.3-B2", metric: "register warm TTI (cache warm)", stat: "p95", budget: 1500'));
  const n2b = judgeBudgets(headOracle.replace('stat: "p95", budget: 2000, gate: true', 'stat: "p95", budget: 2000, gate: false'));
  chk("P5.3-N2", judgeBudgets(headOracle).length === 0 && n2a.length > 0 && n2b.length > 0, "head เขียว · B2 1500 แดง · B4P ปิด gate แดง", `head ${judgeBudgets(headOracle).length} · B2 1500 ${n2a.length} · B4P gate false ${n2b.length}`);
  const probes: [string, boolean][] = [["https://shark.in.th", false], ["http://127.0.0.1:3215", false], ["http://10.0.0.5:3228", false], ["file:///etc/passwd", false], ["http://127.0.0.1:3228", true], ["http://localhost:3229", true]];
  const bad = probes.filter(([u, w]) => baseAllowed(u) !== w).map(([u]) => u);
  const n3a = judgeNoProd(headOracle.replace('const LOOPBACK_HOSTS = ["127.0.0.1", "localhost"]', 'const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "shark.in.th"]'), headSeed);
  const n3b = judgeNoProd(headOracle, `${headSeed}\nprocess.loadEnvFile("${DOT_ENV}");\n`);
  chk("P5.3-N3", bad.length === 0 && judgeNoProd(headOracle, headSeed).length === 0 && n3a.length > 0 && n3b.length > 0, "probe base 6 ข้อตรง · S3 พลิกแดง 2 แบบ", `base ผิด ${bad.join(",") || "0"} · shark.in.th ใน LOOPBACK ${n3a.length} · .env ใน seed ${n3b.length}`);
  const goodMan = JSON.stringify({ suites: [{ suite: SUITE, mode: "unforced" }] });
  const n4a = judgeGates(JSON.stringify({ suites: [{ suite: SUITE, mode: "forced" }] }), headOracle);
  const n4b = judgeGates(JSON.stringify({ suites: [] }), headOracle);
  chk("P5.3-N4", judgeGates(goodMan, headOracle).length === 0 && n4a.length > 0 && n4b.length > 0, "unforced เขียว · forced/ไม่มีแถว แดง", `unforced ${judgeGates(goodMan, headOracle).length} · forced ${n4a.length} · ไม่มีแถว ${n4b.length}`);
  const vt: [Verdict, Verdict][] = [
    [verdict(true, 1000, 1200, true), "red"],
    [verdict(true, 1000, 1200, false), "amber"],
    [verdict(true, 1000, 1200, null), "amber"],
    [verdict(true, 1000, 900, true), "green"],
    [verdict(true, 1000, null, null), "error"],
    [verdict(false, null, 5000, true), "report"],
  ];
  const slopes = [slopeOf(49, 229) >= 0.5, slopeOf(32, 33) < 0.5];
  chk("P5.3-N5", vt.every(([a, b]) => a === b) && slopes.every(Boolean), "6 กรณี verdict + 2 กรณีความชันตรง", `${vt.map(([a, b]) => (a === b ? "✓" : `${a}≠${b}`)).join(" ")} · slope ${slopes.map((s) => (s ? "✓" : "✗")).join(" ")}`);
  // ข้อมูลประกอบ (ไม่นับ): index บาร์โค้ด — หนี้ P6.1 ตาม catalog.byBarcode D6
  const inv = readRev("prisma/schema/inventory.prisma") ?? "";
  const invModel = /model InvItem \{[\s\S]*?\n\}/.exec(inv)?.[0] ?? "";
  console.log(`  ℹ️  InvItem มี index ที่ขึ้นต้น barcode: ${/@@index\(\[(tenantId, )?barcode/.test(invModel) ? "มี" : "ไม่มี (หนี้ P6.1 — byBarcode/registerScan ทาง InvItem)"} · มติ 9: แก้ด้วย CREATE INDEX CONCURRENTLY ใน runbook P6.1`);
}

// ═════════════════════════ โหมดด่าน (ไม่มี --base) ═════════════════════════
const MEASURE = !!BASE_RAW && !NO_DB;
if (!MEASURE) {
  console.log(`${SUITE} · โหมด${REV ? " red-before" : "ด่าน"} (ข้อสถิตเท่านั้น · ไม่แตะ DB · ไม่เปิดเบราว์เซอร์) · head ${headSha()} · PIN ${PIN}`);
  runStatic();
  const failed = checks.filter((c) => !c.ok).map((c) => c.id);
  console.log(`\n===== ${SUITE} ===== ผ่าน ${checks.length - failed.length}/${checks.length}${REV ? ` (rev ${REV})` : ""}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: REV ? "red-before" : "gate", rev: REV, total: checks.length, passed: checks.length - failed.length, failed, budgets: Object.fromEntries(PERF_BUDGET.map((b) => [b.id, { budget: b.budget, gate: b.gate, stat: b.stat }])) })}`);
  process.exit(failed.length ? 1 : 0);
}

// ═════════════════════════ รอบวัด (CONTROLLER-RUN · QC5) ═════════════════════════
function die(msg: string, code = 2): never {
  console.error(`❌ ${msg}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "measure", total: 0, passed: 0, fatal: msg })}`);
  process.exit(code);
}
const PERF_HOST_QC5 = "ep-fragrant-thunder";
const PERF_HOST_QC4 = "ep-frosty-lab";
if (!baseAllowed(BASE_RAW)) die(`--base ${BASE_RAW} ต้องเป็น http://127.0.0.1:<port> (loopback · ไม่ใช่ :3215 ของ CRM)`);
const BASE = new URL(BASE_RAW!).origin;
if (!TENANT || !/^posqc-perf-[a-z0-9]{6,12}$/.test(TENANT) || ["posqc-coffee-tenant", "posqc-resto-tenant"].includes(TENANT)) die(`--tenant ต้องเป็นร้านวัดผล posqc-perf-<rand> จาก seed-pos-perf (ได้ ${TENANT ?? "-"})`, 4);
if (process.env.SHARK_GATE_LOCK_MARKER !== "1") die("รอบวัดต้องอยู่ใต้ scripts/with-gate-lock.sh (ไม่พบ SHARK_GATE_LOCK_MARKER) — ห้ามรันคู่รอบอื่น");
if (process.env.CI) die("รอบวัดห้ามตั้ง CI (with-gate-lock ข้าม flock เมื่อมี CI)");
const guardHits: string[] = [];
{
  const real = globalThis.fetch;
  globalThis.fetch = ((input: Any, init?: Any) => {
    const url = typeof input === "string" ? input : String(input?.url ?? input);
    if (!url.startsWith(BASE)) {
      guardHits.push(url.slice(0, 80));
      return Promise.reject(new Error(`${SUITE} ห้ามต่อ ${url.slice(0, 80)} (นอก --base)`));
    }
    return real(input, init);
  }) as typeof fetch;
}
const { loadPosQcEnv } = (await import("./pos-qc-env.mjs" as string)) as Any;
loadPosQcEnv(SUITE);
const { pairBrowserDevice } = (await import("./pos-device-pair.mjs" as string)) as Any; // POS P4.3 fix4 (CD-P43-10) ◂
// ด่านฐานหลังโหลด env (ไม่งั้นรันตรงโดยไม่มี qc5.sh จะได้ .env.qc = QC4 หลังด่าน) — ต้องมี URL และทุกตัวเป็น QC5
{
  const urls = [process.env.DATABASE_URL ?? "", process.env.DIRECT_URL ?? ""].filter(Boolean);
  if (!urls.length || urls.some((u) => !u.includes(PERF_HOST_QC5) && !(u.includes(PERF_HOST_QC4) && process.env.PERF_ALLOW_QC4 === "1")))
    die("รอบวัดต้องเป็น QC5 (scripts/qc5.sh · ep-fragrant-thunder) — QC4 เฉพาะ PERF_ALLOW_QC4=1", 4);
}
{
  const ping = await fetch(`${BASE}/api/v1/pos/openapi.json`, { redirect: "manual", signal: AbortSignal.timeout(10_000) }).catch((e: unknown) => e as Error);
  if (ping instanceof Error) die(`ต่อเซิร์ฟเวอร์ ${BASE} ไม่ได้ (${ping.message}) — ผู้คุมต้อง build + serve บนทรี d ก่อน`);
}
const credsFile = `${PERF_DIR}/${TENANT}.creds.json`;
if (!existsSync(credsFile)) die(`ไม่มีไฟล์กุญแจ ${credsFile} — รัน seed-pos-perf.mts บนฐานเดียวกันก่อน`);
const CR = JSON.parse(readFileSync(credsFile, "utf8")) as Any;
if (CR.tenantId !== TENANT || !CR.done?.all) die(`ไฟล์กุญแจ ${credsFile} ไม่ใช่ของ ${TENANT} หรือ seed ยังไม่จบ (done.all)`);

// Prisma client ที่นับ query — สร้างก่อน import @/lib/core/db (แบบ qc-crm-perf)
const { PrismaClient } = (await import("@prisma/client" as string)) as Any;
const { PrismaPg } = (await import("@prisma/adapter-pg" as string)) as Any;
type QEv = { query: string; duration: number };
let sink: QEv[] | null = null;
const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }), log: [{ emit: "event", level: "query" }], transactionOptions: { timeout: 30_000, maxWait: 10_000 } });
client.$on("query", (e: QEv) => {
  if (sink) sink.push({ query: e.query, duration: Number(e.duration) });
});
(globalThis as Any).prisma = client;
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
if (prisma !== client) die("@/lib/core/db ไม่ได้ใช้ client ที่นับ query (NODE_ENV=production?) — วัดไม่ได้");
const P = prisma as Any;
const { sha256 } = (await import("@/lib/core/hash" as string)) as Any;
const reg = (await import("@/lib/modules/pos/register" as string)) as Any;
const regShared = (await import("@/lib/modules/pos/register-shared" as string)) as Any;
const catalog = (await import("@/lib/modules/pos/catalog" as string)) as Any;
const shiftMod = (await import("@/lib/modules/pos/shift" as string)) as Any;
const staffPin = (await import("@/lib/modules/pos/staff-pin" as string)) as Any;
const orderMod = (await import("@/lib/modules/pos/order" as string)) as Any;
const seedMod = { perfBarcode: (i: number) => {
  const b12 = `8859${String(i).padStart(8, "0")}`;
  let s = 0;
  for (let k = 0; k < 12; k++) s += (k % 2 === 0 ? 1 : 3) * (b12.charCodeAt(k) - 48);
  return b12 + String((10 - (s % 10)) % 10);
} }; // = perfBarcode ของ seed-pos-perf.mts (ไม่ import ไฟล์ seed — มันรันตัวเองตอนโหลด)

const T = TENANT;
const SYS: string = CR.systems.POS;
const UNIT: string = CR.units.a;
const DEV: string = CR.deviceCode;
const UA = `${SUITE}-perf`;
const RUN_START = new Date();
const PROFILE = [`/tmp/chr-pos-p53-${process.pid}`, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-pos-p53-${process.pid}`];
const SESSIONS: string[] = [];
let BROWSER: Any = null;
let SHIFT_ID = "";
let SHIFT_OPENED_HERE = false;
const notes: string[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const productCount = await P.posProduct.count({ where: { tenantId: T, systemId: SYS, archivedAt: null } });
if (productCount < 400) die(`ร้าน ${T} มีสินค้า ${productCount} — ต้อง ≥ 400 (seed ไม่ครบ)`);
console.log(`${SUITE} · รอบวัด · base ${BASE} · ร้าน ${T} (สินค้า ${productCount}) · head ${headSha()} · ${RUN_START.toISOString()}`);
runStatic();

async function actorOf(membershipId: string, userId: string): Promise<Any> {
  const mb = await P.membership.findUnique({ where: { id: membershipId }, select: { role: true, unitAccess: true, permissions: true } });
  if (!mb) throw new Error(`ไม่พบ membership ${membershipId}`);
  return { userId, role: mb.role, unitAccess: Array.isArray(mb.unitAccess) ? mb.unitAccess.filter((u: unknown) => typeof u === "string") : [], permissions: mb.permissions && typeof mb.permissions === "object" ? mb.permissions : {} };
}
const OWNER = await actorOf(CR.users.owner.membershipId, CR.users.owner.userId);
const CASHIER = await actorOf(CR.users.cashier.membershipId, CR.users.cashier.userId);
const regCtx = { tenantId: T, systemId: SYS, unitId: UNIT };

// ═════════════════════════ ตัววัดในโปรเซส ═════════════════════════
type One = { ms: number; q: number; err?: string };
async function once(fn: () => Promise<unknown>): Promise<One> {
  sink = [];
  const s = performance.now();
  let err: string | undefined;
  try {
    const r = (await fn()) as Any;
    if (r && typeof r === "object" && r.ok === false) err = `${r.code ?? "refused"}`;
  } catch (e) {
    err = String((e as Error)?.message ?? e).slice(0, 160);
  }
  const ms = performance.now() - s;
  const q = sink.length;
  sink = null;
  return { ms, q, err };
}
async function series(n: number, warm: number, f: (i: number) => () => Promise<unknown>): Promise<{ ms: number[]; q: number[]; errs: string[] }> {
  for (let i = 0; i < warm; i++) await once(f(-1 - i));
  const out = { ms: [] as number[], q: [] as number[], errs: [] as string[] };
  for (let i = 0; i < n; i++) {
    const r = await once(f(i));
    out.ms.push(r.ms);
    out.q.push(r.q);
    if (r.err) out.errs.push(r.err);
  }
  return out;
}

// ═════════════════════════ ผลรวม + รอบก่อน ═════════════════════════
type Metric = { id: string; n: number; p50: number | null; p95: number | null; max: number | null; value: number | null; budget: number | null; gate: boolean; verdict?: Verdict; prevOver?: boolean | null; extra?: Record<string, unknown>; err?: string };
const M: Record<string, Metric> = {};
function put(id: string, xs: number[] | null, extra: Record<string, unknown> = {}, err?: string, valueOverride?: number | null): Metric {
  const b = PERF_BUDGET.find((x) => x.id === id)!;
  const ok = xs && xs.length ? xs : null;
  const m: Metric = {
    id, n: ok?.length ?? 0, p50: ok ? r1(pct(ok, 50)) : null, p95: ok ? r1(pct(ok, 95)) : null, max: ok ? r1(Math.max(...ok)) : null,
    value: valueOverride !== undefined ? valueOverride : ok ? r1(pct(ok, 95)) : null, budget: b.budget, gate: b.gate, extra, ...(err ? { err } : {}),
  };
  M[id] = m;
  return m;
}
function previousRun(): { file: string; at: string; metrics: Record<string, Metric> } | null {
  if (!existsSync(PERF_DIR)) return null;
  const files = readdirSync(PERF_DIR).filter((f) => /^p53-\d{8}T\d{6}Z\.json$/.test(f)).map((f) => ({ f, t: statSync(`${PERF_DIR}/${f}`).mtimeMs })).sort((a, b) => b.t - a.t);
  for (const { f, t } of files) {
    if (Date.now() - t > 24 * 3600_000) return null;
    try {
      const j = JSON.parse(readFileSync(`${PERF_DIR}/${f}`, "utf8"));
      return { file: f, at: j.at, metrics: j.metrics ?? {} };
    } catch {
      /* ไฟล์เสีย — ข้าม */
    }
  }
  return null;
}
const PREV = previousRun();

// ═════════════════════════ fixture: กะ · โทเคน · session ═════════════════════════
// POS P4.3 fix4 (CD-P43-10 · หลัง P5.2 D+E): เซิร์ฟเวอร์รับเครื่องจากคุกกี้ลงนาม shark_pos_device เท่านั้น — context ที่เปิดหน้าขายต้องจับคู่ DEV
//   ผ่าน ตั้งค่า › เครื่องขาย ในฐานะเจ้าของ (pos-device-pair.mts · session เจ้าของ mint แยก ลบพร้อม SESSIONS) · warmCtx จับคู่ด้วยหน้าจริง ·
//   context เย็นของ B1 รับ "คุกกี้ที่หน้าจริงออกให้" (การเปิดหน้าตั้งค่าใน context เย็นจะอุ่นแคช HTTP ⇒ B1 ไม่เย็นอีก) · กะของ DEV ยังเปิดผ่านโมดูลเหมือนเดิม ◂
let OWNER_COOKIES: Any[] = [];
let DEVICE_COOKIE: Any = null;
async function fixtures(): Promise<{ cookies: Any[]; staffJson: string }> {
  const open = await P.posShift.findFirst({ where: { tenantId: T, unitId: UNIT, deviceId: DEV, status: "OPEN" }, select: { id: true } });
  if (open) SHIFT_ID = open.id;
  else {
    const r = await shiftMod.openShift({ ...regCtx, deviceId: DEV }, OWNER, { deviceId: DEV, deviceLabel: "เครื่องวัดผล P5.3", floatSatang: 100_000 });
    if (!r.ok) throw new Error(`openShift ${DEV} → ${r.code}`);
    SHIFT_ID = r.shift.id;
    SHIFT_OPENED_HERE = true;
  }
  const t = await staffPin.issueStaffToken({ ...regCtx, deviceId: DEV }, { unitId: UNIT, deviceId: DEV, userId: CASHIER.userId });
  const staffJson = JSON.stringify({ userId: CASHIER.userId, name: CR.users.cashier.name, role: CASHIER.role, staffToken: t.staffToken, expiresAt: t.expiresAt });
  const token = "posp53" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const ttl = new Date(Date.now() + 3 * 3600_000);
  const row = await P.session.create({ data: { userId: CASHIER.userId, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
  SESSIONS.push(row.id);
  const https = BASE.startsWith("https:");
  const host = new URL(BASE).hostname;
  const cookies = https
    ? [{ name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: T, url: BASE, path: "/", secure: true }]
    : [{ name: "shark_session", value: token, domain: host, path: "/" }, { name: "shark_tenant", value: T, domain: host, path: "/" }];
  // POS P4.3 fix4 ▸ session เจ้าของ (จับคู่เครื่องผ่านหน้า · pos.device.manage) ◂
  const ownerToken = "posp53o" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const ownerRow = await P.session.create({ data: { userId: OWNER.userId, tokenHash: sha256(ownerToken), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
  SESSIONS.push(ownerRow.id);
  OWNER_COOKIES = https
    ? [{ name: "__Host-shark_session", value: ownerToken, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: T, url: BASE, path: "/", secure: true }]
    : [{ name: "shark_session", value: ownerToken, domain: host, path: "/" }, { name: "shark_tenant", value: T, domain: host, path: "/" }];
  return { cookies, staffJson };
}
let cleaned = false;
const restores: string[] = [];
async function cleanup(why: string): Promise<void> {
  if (cleaned) return;
  cleaned = true;
  try {
    await BROWSER?.close();
  } catch {
    /* ปิดแล้ว */
  }
  for (const d of PROFILE) rmSync(d, { recursive: true, force: true });
  try {
    if (SESSIONS.length) await P.session.deleteMany({ where: { id: { in: SESSIONS } } });
    restores.push(`ลบ session ${SESSIONS.length}`);
  } catch (e) {
    restores.push(`ลบ session ล้ม ${(e as Error).message.slice(0, 80)}`);
  }
  if (SHIFT_ID && SHIFT_OPENED_HERE) {
    try {
      const row = await P.posShift.findFirst({ where: { id: SHIFT_ID, tenantId: T } });
      if (row?.status === "OPEN") {
        const expected = (await shiftMod.computeReport(P, row)).expectedCashSatang;
        const r = await shiftMod.closeShift(regCtx, OWNER, { shiftId: SHIFT_ID, countedCashSatang: expected, idempotencyKey: `posqc-p53-close-${SHIFT_ID}` });
        restores.push(r.ok ? `ปิดกะ ${SHIFT_ID} (นับ = ยอดคาด ${expected})` : `ปิดกะล้ม ${r.code}`);
      }
    } catch (e) {
      restores.push(`ปิดกะล้ม ${(e as Error).message.slice(0, 80)}`);
    }
  }
  restores.push(`cleanup (${why})`);
}
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
  process.on(sig, () => {
    notes.push(`ถูกหยุดด้วย ${sig}`);
    void cleanup(sig).finally(() => process.exit(130));
  });

// ═════════════════════════ หน้าขายในเบราว์เซอร์ ═════════════════════════
const REG_URL = () => `${BASE}/app/sys/${SYS}/pos/register?unit=${encodeURIComponent(UNIT)}`;
/** สคริปต์ก่อนหน้า: เครื่อง + โทเคนผู้ขาย + ตัวจด keydown/บรรทัด (ตัวจดบรรทัดเฉพาะหน้าที่ขอ — 200 บรรทัดไม่ให้ observer รบกวน) */
async function preparePage(page: Any, cookies: Any[], staffJson: string, lineObserver: boolean): Promise<void> {
  await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 1, isMobile: false, hasTouch: true });
  await page.setCookie(...cookies, ...(DEVICE_COOKIE ? [DEVICE_COOKIE] : [])); // POS P4.3 fix4 ▸ คุกกี้เครื่องที่หน้าจริงออกให้ (context เย็นของ B1) ◂
  await page.evaluateOnNewDocument(
    (dk: string, dev: string, sk: string, sj: string, withObs: boolean) => {
      try {
        window.localStorage.setItem(dk, dev);
        window.sessionStorage.setItem(sk, sj);
      } catch {
        /* ไม่มี storage */
      }
      const w = window as unknown as { __p53: { keys: { k: string; t: number }[]; lines: { n: number; dom: number; paint: number }[] } };
      w.__p53 = { keys: [], lines: [] };
      window.addEventListener("keydown", (e) => w.__p53.keys.push({ k: e.key, t: e.timeStamp }), true); // ORACLE-EDIT ผู้คุม A 24.10 (CD-P53-O13c: บน window (ก่อนสคริปต์แอป) — ตัวจับสแกนของหน้าขายอยู่บน window capture และอาจกลืน Enter ก่อนถึง document
      if (!withObs) return;
      // ORACLE-EDIT ผู้คุม A 24.10 (CD-P53-O13: tsx keepNames ใส่ __name() รอบ arrow ที่ผูกชื่อในโค้ดฝั่งเบราว์เซอร์ → ReferenceError ใน page.evaluate — ห้ามผูกชื่อฟังก์ชันในคอลแบ็กเบราว์เซอร์)
      let last = 0;
      document.addEventListener("DOMContentLoaded", () => {
        new MutationObserver(() => {
          const n = new Set(Array.from(document.querySelectorAll('[data-testid^="pos-reg-cart-line-"]'), (e) => e.getAttribute("data-testid"))).size;
          if (n === last) return;
          last = n;
          const dom = performance.now();
          requestAnimationFrame(() => w.__p53.lines.push({ n, dom, paint: performance.now() }));
        }).observe(document.documentElement, { childList: true, subtree: true });
      });
    },
    "shark.pos.deviceId",
    DEV,
    `pos-staff:${DEV}`,
    staffJson,
    lineObserver,
  );
}
/** TTI ของหน้าขาย (ms นับจาก navigation start) — โยน StepError ถ้าหน้าไม่พร้อมใน 30 วิ */
async function loadRegister(page: Any): Promise<number> {
  const r = await page.goto(REG_URL(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  const url = String(page.url());
  if (/\/login|\/onboarding/.test(url)) throw new Error(`เด้งไป ${url.replace(BASE, "")} (session ไม่ติด)`);
  if (r && r.status() >= 400) throw new Error(`HTTP ${r.status()} ${url.replace(BASE, "")}`);
  const h = await page
    .waitForFunction(
      () => {
        const grid = document.querySelector('[data-testid="pos-reg-grid"]');
        if (!grid || grid.getAttribute("aria-busy") === "true") return false;
        const card = grid.querySelector('[data-testid^="pos-reg-product-"]') as HTMLButtonElement | null;
        if (!card || card.disabled || card.getClientRects().length === 0) return false;
        if (!Object.keys(card).some((k) => k.startsWith("__reactProps$"))) return false; // ยังไม่ hydrate = กดไม่ได้
        const b = card.getBoundingClientRect();
        const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        if (!top || !card.contains(top)) return false; // ถูกจอล็อก/แผ่น/แถบทับ
        return performance.now();
      },
      { polling: "raf", timeout: 30_000 },
    )
    .catch(async () => {
      const why = await page.evaluate(() => ({
        lock: !!document.querySelector('[data-testid="pos-lock-screen"]'),
        shift: !!document.querySelector('[data-testid="pos-reg-shift-required"]'),
        revoked: !!document.querySelector('[data-testid="pos-reg-device-revoked"]'),
        grid: !!document.querySelector('[data-testid="pos-reg-grid"]'),
        cards: document.querySelectorAll('[data-testid^="pos-reg-product-"]').length,
      })).catch(() => null);
      throw new Error(`หน้าขายไม่พร้อมใน 30 วิ ${JSON.stringify(why)}`);
    });
  return Number(await h.jsonValue());
}
type ActLog = { kind: string; lines: number; start: number; end: number; status: number; fail?: string }; // CD-P53-O13f fail = errorText ของ requestfailed
function trackActions(page: Any): ActLog[] {
  const log: ActLog[] = [];
  const map = new Map<Any, ActLog>();
  page.on("request", (r: Any) => {
    try {
      if (r.method() !== "POST" || !r.headers()["next-action"]) return;
      const body = String(r.postData() ?? "");
      const kind = body.includes('"sale":') ? "submit" : body.includes('"cart":') ? "quote" : body.includes('"barcode":') ? "scan" : body ? "other" : "unknown";
      const e: ActLog = { kind, lines: (body.match(/"productId"/g) ?? []).length, start: Date.now(), end: 0, status: 0 };
      map.set(r, e);
      log.push(e);
    } catch {
      /* ข้าม */
    }
  });
  const done = (r: Any, failed: boolean) => {
    const e = map.get(r);
    if (!e) return;
    e.end = Date.now();
    // ORACLE-EDIT ผู้คุม A 24.10 (CD-P53-O13f): server action ของ React ตอบเป็นสตรีม RSC — เมื่ออ่านครบ client ยกเลิกส่วนที่เหลือ ⇒ Chromium รายงาน requestfailed (ERR_ABORTED)
    //   ทั้งที่มี response 200 แล้ว (smoke2: quote/200/-1 แต่ยอดบนหน้านิ่ง) → ถือตามสถานะ response ถ้ามี · -1 เฉพาะเมื่อไม่มี response เลย · เก็บ errorText ไว้ดู
    const resp = r.response?.();
    const st = resp?.status?.();
    e.status = typeof st === "number" && st > 0 ? st : failed ? -1 : 0;
    if (failed) e.fail = String(r.failure?.()?.errorText ?? "");
  };
  page.on("requestfinished", (r: Any) => done(r, false));
  page.on("requestfailed", (r: Any) => done(r, true));
  return log;
}
async function newContext(): Promise<Any> {
  return typeof BROWSER.createBrowserContext === "function" ? BROWSER.createBrowserContext() : BROWSER.createIncognitoBrowserContext();
}

// ═════════════════════════ รัน ═════════════════════════
let crashed = "";
const salesBefore = await P.posSale.count({ where: { tenantId: T } }).catch(() => -1);
try {
  const { cookies, staffJson } = await fixtures();
  const barcodes = (from: number, n: number) => Array.from({ length: n }, (_, k) => seedMod.perfBarcode(from + k));

  // ── RTT ฐาน ──
  const rttDb = (await series(50, 2, () => () => P.$queryRawUnsafe("SELECT 1"))).ms;
  const RTT_DB = r1(pct(rttDb, 50));
  console.log(`\n── RTT ฐาน (SELECT 1 × 50) p50 ${RTT_DB} ms · p95 ${r1(pct(rttDb, 95))} ms ──`);

  // ── ในโปรเซส: B2S · B3 · B4N · B5 ──
  if (want("B2S")) {
    const s = await series(RUNS.server, 2, () => () => reg.registerCatalog(regCtx, CASHIER));
    put("P5.3-B2S", s.errs.length ? null : s.ms, { qPerRun: pct(s.q, 50), rttDb: RTT_DB, netP95: r1(pct(s.ms, 95) - pct(s.q, 50) * RTT_DB) }, s.errs[0]);
  }
  if (want("B3")) {
    const bc = barcodes(3000, RUNS.lookups);
    const s = await series(RUNS.lookups, 2, (i) => () => reg.registerScan(regCtx, CASHIER, { barcode: bc[Math.max(0, i)]! }));
    const bb = barcodes(3200, RUNS.lookups);
    const b2 = await series(RUNS.lookups, 2, (i) => () => catalog.byBarcode({ tenantId: T, systemId: SYS, actorUserId: CASHIER.userId }, UNIT, bb[Math.max(0, i)]!));
    const miss = await reg.registerScan(regCtx, CASHIER, { barcode: bc[0]! });
    put("P5.3-B3", s.errs.length || miss?.match !== "one" ? null : s.ms, { qPerRun: pct(s.q, 50), rttDb: RTT_DB, netP95: r1(pct(s.ms, 95) - pct(s.q, 50) * RTT_DB), byBarcodeP50: r1(pct(b2.ms, 50)), byBarcodeP95: r1(pct(b2.ms, 95)), byBarcodeQ: pct(b2.q, 50), byBarcodeErr: b2.errs[0] ?? null, match: miss?.match }, s.errs[0] ?? (miss?.match !== "one" ? `registerScan match ${miss?.match}` : undefined));
  }
  if (want("B4N")) {
    const ids = ((await P.posProduct.findMany({ where: { tenantId: T, systemId: SYS, archivedAt: null, parentId: null }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 200, select: { id: true } })) as Any[]).map((r: Any) => r.id as string);
    const cartOf = (n: number) => {
      let c: Any = { lines: [] };
      for (let k = 0; k < n; k++) c = regShared.cartAddProduct(c, ids[k]!, `p53-${n}-${k}`);
      return regShared.cartToQuoteInput(c);
    };
    const res: Record<number, { ms: number[]; q: number[]; errs: string[] }> = {};
    for (const n of [1, 20, 200]) res[n] = await series(RUNS.quote, 2, () => () => reg.quoteRegisterCart(regCtx, CASHIER, cartOf(n)));
    const q = (n: number) => pct(res[n]!.q, 50);
    const slope = slopeOf(q(20), q(200));
    const err = [1, 20, 200].map((n) => res[n]!.errs[0]).find(Boolean);
    put("P5.3-B4N", err ? null : [slope], { q1: q(1), q20: q(20), q200: q(200), ms1p95: r1(pct(res[1]!.ms, 95)), ms20p95: r1(pct(res[20]!.ms, 95)), ms200p95: r1(pct(res[200]!.ms, 95)), rttDb: RTT_DB }, err, err ? null : Math.round(slope * 1000) / 1000);
  }
  if (want("B5")) {
    const s = await series(RUNS.server, 2, () => () => orderMod.listOrders(regCtx, OWNER, {}));
    put("P5.3-B5", s.errs.length ? null : s.ms, { qPerRun: pct(s.q, 50), rttDb: RTT_DB }, s.errs[0]);
  }

  // ── HTTP: B3H ──
  if (want("B3H")) {
    const http = async (url: string, headers: Record<string, string> = {}) => {
      const s = performance.now();
      const r = await fetch(url, { headers: { ...headers, "cache-control": "no-cache" } });
      const body = await r.text();
      return { ms: performance.now() - s, status: r.status, body };
    };
    const noop: number[] = [];
    for (let i = 0; i < RUNS.lookups + 2; i++) {
      const r = await http(`${BASE}/api/v1/pos/openapi.json`);
      if (i >= 2) noop.push(r.ms);
    }
    const bc = barcodes(3400, RUNS.lookups);
    const ms: number[] = [];
    const bad: string[] = [];
    for (let i = -2; i < RUNS.lookups; i++) {
      const r = await http(`${BASE}/api/v1/pos/products/lookup?unitId=${encodeURIComponent(UNIT)}&barcode=${bc[Math.max(0, i)]}`, { authorization: `Bearer ${CR.apiKey.rawKey}` });
      if (r.status !== 200 || !/"match":"one"/.test(r.body)) bad.push(`${r.status} ${r.body.slice(0, 80)}`);
      if (i >= 0) ms.push(r.ms);
    }
    put("P5.3-B3H", bad.length ? null : ms, { appRttP50: r1(pct(noop, 50)), appRttP95: r1(pct(noop, 95)), netP95: r1(pct(ms, 95) - pct(noop, 50)) }, bad[0]);
  }

  // ── เบราว์เซอร์ ──
  const pptr = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string)) as Any;
  BROWSER = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${PROFILE[0]}`] });

  // POS P4.3 fix4 ▸ context อุ่นสร้างก่อน B1 แล้วจับคู่ DEV ผ่านหน้า ตั้งค่า › เครื่องขาย (เจ้าของ) — จับคู่ไม่ได้ (กุญแจไม่ตั้ง ฯลฯ) = harness ล้ม (ข้อเบราว์เซอร์ทั้งหมดวัดไม่ได้พร้อมเหตุ) ◂
  const warmCtx = await newContext();
  if (["B1", "B2", "B3U", "B4A", "B4Q", "B4P"].some(want)) {
    const pr = await pairBrowserDevice(warmCtx, { base: BASE, systemId: SYS, unitId: UNIT, deviceCode: DEV, ownerCookies: OWNER_COOKIES });
    console.log(`\n── จับคู่เครื่อง ${DEV} (เจ้าของ · ตั้งค่า › เครื่องขาย): ${pr.ok ? `${pr.how} · ${pr.detail}` : `ล้ม ${pr.state} — ${pr.detail}`} ──`);
    if (!pr.ok) throw new Error(`จับคู่เครื่อง ${DEV} ไม่ได้ (${pr.state}): ${pr.detail}`);
    DEVICE_COOKIE = pr.cookie;
    notes.push(`จับคู่เครื่อง ${DEV}: ${pr.how}`);
  }
  if (want("B1")) {
    const xs: number[] = [];
    let err: string | undefined;
    for (let i = 0; i < RUNS.cold && !err; i++) {
      const ctx = await newContext();
      try {
        const page = await ctx.newPage();
        await preparePage(page, cookies, staffJson, false);
        xs.push(await loadRegister(page));
      } catch (e) {
        err = (e as Error).message.slice(0, 200);
      } finally {
        await ctx.close().catch(() => undefined);
      }
    }
    put("P5.3-B1", err ? null : xs, {}, err);
  }
  // context อุ่นเดียวสำหรับ B2 · B3U · B4 (สร้าง + จับคู่ก่อน B1 — POS P4.3 fix4)
  if (want("B2")) {
    const xs: number[] = [];
    let err: string | undefined;
    try {
      const page = await warmCtx.newPage();
      await preparePage(page, cookies, staffJson, false);
      await loadRegister(page); // อุ่น
      for (let i = 0; i < RUNS.warm; i++) xs.push(await loadRegister(page));
      await page.close();
    } catch (e) {
      err = (e as Error).message.slice(0, 200);
    }
    put("P5.3-B2", err ? null : xs, { coldP50: M["P5.3-B1"]?.p50 ?? null }, err);
  }
  if (want("B3U")) {
    const xs: number[] = [];
    let err: string | undefined;
    try {
      const page = await warmCtx.newPage();
      await preparePage(page, cookies, staffJson, true);
      const acts = trackActions(page);
      await loadRegister(page);
      await sleep(500);
      const bc = barcodes(2600, RUNS.scans);
      // ORACLE-EDIT ผู้คุม A 24.10 (CD-P53-O13: tsx keepNames ใส่ __name() รอบ arrow ที่ผูกชื่อในโค้ดฝั่งเบราว์เซอร์ → ReferenceError ใน page.evaluate — ห้ามผูกชื่อฟังก์ชันในคอลแบ็กเบราว์เซอร์) + กติกาเครื่องสแกน: หน้าขายนับเป็นสแกนเมื่อทุกช่วงห่างคีย์ ≤ SCAN_MAX_GAP_MS (30 ms · scan-shared.ts) —
      // puppeteer ส่งคีย์ทีละตัวผ่าน CDP บนเครื่องที่โหลดสูง ช่วงห่างอาจเกิน 30 ms ⇒ หน้าขายจัดเป็น "พิมพ์" ไม่ใช่สแกน (ไม่ใช่ความช้าของสินค้า)
      // ⇒ อ่านช่วงห่างจริงจากตัวบันทึก __p53 แล้วลองใหม่ ≤ 3 ครั้งต่อบาร์โค้ด · นับ harnessSlow · ล้มจริงเฉพาะเมื่อ burst เร็วพอแต่บรรทัดไม่ขึ้น
      const SCAN_GAP_MS = 30;
      let harnessSlow = 0;
      let maxGapSeen = 0;
      let burstEmpty = 0; // ORACLE-EDIT ผู้คุม A 24.10 (CD-P53-O13c) จำนวนสแกนที่ recorder ไม่มีคีย์เลย
      type Rec = { keys: { k: string; t: number }[]; lines: { n: number; paint: number }[] };
      for (let k = 0; k < bc.length; k++) {
        let got = false;
        for (let attempt = 0; attempt < 3 && !got; attempt++) {
          const keysBefore = (await page.evaluate(() => (window as unknown as { __p53: Rec }).__p53.keys.length)) as number;
          // ORACLE-EDIT ผู้คุม A 24.10 (CD-P53-O13b: จับเวลา paint ในหน้าต่อสแกน — ตั้ง promise (MutationObserver → rAF → performance.now) ก่อนพิมพ์ แล้วเทียบกับ timeStamp ของคีย์สุดท้ายก่อน Enter (นาฬิกาเดียวกัน)
          //   แทนการพึ่ง recorder.lines ที่ติดตั้งตอน DOMContentLoaded (รอบ diag 2: keys บันทึกได้ แต่ lines ว่าง 0/5)
          const paintP = page.evaluate(
            (n: number) =>
              new Promise<number>((res) => {
                const mo = new MutationObserver(() => {
                  if (new Set(Array.from(document.querySelectorAll('[data-testid^="pos-reg-cart-line-"]'), (e) => e.getAttribute("data-testid"))).size < n) return;
                  mo.disconnect();
                  requestAnimationFrame(() => res(performance.now()));
                });
                mo.observe(document.documentElement, { childList: true, subtree: true });
                setTimeout(() => {
                  mo.disconnect();
                  res(-1);
                }, 10_000);
              }),
            k + 1,
          ) as Promise<number>;
          await page.keyboard.type(bc[k]!);
          await page.keyboard.press("Enter");
          const paint = await paintP;
          const shown = paint >= 0;
          const rec = (await page.evaluate(() => (window as unknown as { __p53: Rec }).__p53)) as Rec;
          const burst = rec.keys.slice(keysBefore);
          let gap = 0;
          for (let i = 1; i < burst.length; i++) gap = Math.max(gap, burst[i]!.t - burst[i - 1]!.t);
          maxGapSeen = Math.max(maxGapSeen, gap);
          if (shown) {
            // ORACLE-EDIT ผู้คุม A 24.10 (CD-P53-O13c: ถ้า Enter ไม่ถูกบันทึก (ถูกกลืน) ใช้คีย์สุดท้ายที่บันทึกได้ (ตัวเลขตัวท้าย) เป็นจุดเริ่ม — ค่าที่ได้รวมเวลากด Enter = ขอบบน
            const enter = burst.length ? burst[burst.length - 1]! : null;
            const lastChar = enter && enter.k === "Enter" ? (burst.length >= 2 ? burst[burst.length - 2]!.t : NaN) : enter ? enter.t : NaN;
            if (Number.isFinite(lastChar)) xs.push(paint - lastChar);
            else burstEmpty++;
            got = true;
          } else if (gap > SCAN_GAP_MS) {
            harnessSlow++;
            await sleep(400);
          } else {
            throw new Error(`สแกน ${bc[k]} แล้วบรรทัดที่ ${k + 1} ไม่ขึ้นใน 10 วิ (burst ช่วงห่างสูงสุด ${gap.toFixed(1)} ms ≤ ${SCAN_GAP_MS} = เครื่องสแกนจริง)`);
          }
        }
        if (!got) throw new Error(`สแกน ${bc[k]} ล้ม 3 ครั้ง: harness ส่งคีย์ช้ากว่าเครื่องสแกน (ช่วงห่างสูงสุด ${maxGapSeen.toFixed(1)} ms > ${SCAN_GAP_MS}) — เครื่องโหลดสูง ไม่ใช่ความช้าของสินค้า · ลองใหม่เมื่อเครื่องว่าง`);
        await sleep(150);
      }
      await sleep(400);
      const scanRtt = acts.filter((a) => a.kind === "scan" && a.end).map((a) => a.end - a.start);
      if (xs.length < bc.length) err = `จับเวลาได้ ${xs.length}/${bc.length} สแกน (recorder ว่าง ${burstEmpty})`;
      put("P5.3-B3U", err ? null : xs, { scanActionP50: r1(pct(scanRtt, 50)), scanActionP95: r1(pct(scanRtt, 95)), scanActions: scanRtt.length, harnessSlowRetries: harnessSlow, maxKeyGapMs: r1(maxGapSeen), recorderEmpty: burstEmpty }, err);
      await page.close();
    } catch (e) {
      put("P5.3-B3U", null, {}, (e as Error).message.slice(0, 200));
    }
  }
  if (want("B4A") || want("B4Q") || want("B4P")) {
    const add200: number[] = [];
    const quote: number[] = [];
    const settle: number[] = [];
    const pay: number[] = [];
    const submitRtt: number[] = [];
    const drain: number[] = []; // ORACLE-EDIT ผู้คุม A 24.10 (CD-P53-O13b)
    let err: string | undefined;
    for (let b = 0; b < RUNS.bills && !err; b++) {
      const page = await warmCtx.newPage();
      try {
        await preparePage(page, cookies, staffJson, false);
        const acts = trackActions(page);
        await loadRegister(page);
        // ≥ 200 การ์ด (หน้าแรก 100 · ปุ่มโหลดเพิ่ม)
        for (let t = 0; t < 4; t++) {
          const n = await page.evaluate(() => document.querySelectorAll('[data-testid="pos-reg-grid"] [data-testid^="pos-reg-product-"]').length);
          if (n >= 200) break;
          await page.evaluate(() => (document.querySelector('[data-testid="pos-reg-grid-more"]') as HTMLButtonElement | null)?.click());
          await page.waitForFunction((m: number) => document.querySelectorAll('[data-testid="pos-reg-grid"] [data-testid^="pos-reg-product-"]').length > m, { timeout: 15_000 }, n).catch(() => undefined);
        }
        const cards = await page.evaluate(() => document.querySelectorAll('[data-testid="pos-reg-grid"] [data-testid^="pos-reg-product-"]').length);
        if (cards < 200) throw new Error(`กริดมีการ์ด ${cards} < 200 หลังโหลดเพิ่ม`);
        await page.evaluate(async () => {
          const cs = Array.from(document.querySelectorAll('[data-testid="pos-reg-grid"] [data-testid^="pos-reg-product-"]')).slice(0, 199) as HTMLButtonElement[];
          for (const c of cs) {
            c.click();
            await new Promise((r) => setTimeout(r, 4));
          }
        });
        await page.waitForFunction(() => new Set(Array.from(document.querySelectorAll('[data-testid^="pos-reg-cart-line-"]'), (e) => e.getAttribute("data-testid"))).size >= 199, { timeout: 30_000 }).catch(() => {
          throw new Error("แตะ 199 การ์ดแล้วบรรทัดไม่ครบ 199");
        });
        await page.waitForNetworkIdle({ idleTime: 600, timeout: 30_000 }).catch(() => undefined);
        // ORACLE-EDIT ผู้คุม A 24.10 (CD-P53-O13b: harness แตะ 199 การ์ดใน <1 วิ = quote ต่อการ์ด 199 คำขอ (คนจริงไม่ทำ) — รอให้ยอดนิ่ง (ไม่มี aria-busy · ปุ่มชำระเปิด) ก่อนวัดบรรทัดที่ 200
        //   เดิมรอ network idle แค่ 30 วิ แล้วเดินต่อทั้งที่คำขอยังค้าง ⇒ "ยอด 200 บรรทัดไม่นิ่ง" = คิวค้างของ harness ไม่ใช่ความช้าของบรรทัดที่ 200 · เวลารอรายงานเป็น drainMs (ไม่เข้าเกณฑ์)
        const tDrain = Date.now();
        await page.waitForFunction(() => {
          const tt = document.querySelector('[data-testid="pos-reg-total"]');
          const pay = document.querySelector('[data-testid="pos-reg-pay"]') as HTMLButtonElement | null;
          return !!tt && tt.getAttribute("aria-busy") !== "true" && !!pay && !pay.disabled;
        }, { timeout: 120_000, polling: 250 }).catch(async () => {
          // ORACLE-EDIT ผู้คุม A 24.10 (CD-P53-O13c: พิมพ์สภาพหน้าตอนหมดเวลา เพื่อแยก "ยอดยังคำนวณ" / "ปุ่มชำระปิดด้วยเหตุอื่น (กะ · เครื่อง · สิทธิ์ · quote ผิดพลาด)"
          const st = (await page
            .evaluate(() => {
              const tts = Array.from(document.querySelectorAll('[data-testid="pos-reg-total"]')).map((e) => `${e.getAttribute("aria-busy") ?? "-"}:${(e.textContent ?? "").replace(/\s+/g, " ").slice(0, 40)}`);
              const pay = document.querySelector('[data-testid="pos-reg-pay"]') as HTMLButtonElement | null;
              const alerts = Array.from(document.querySelectorAll('[role="alert"],[role="status"],[data-testid]')).filter((e) => e.getAttribute("role") === "alert" || e.getAttribute("role") === "status" || /err|shift|lock|revoked|offline/.test(e.getAttribute("data-testid") ?? "")).map((e) => `${e.getAttribute("data-testid") ?? e.getAttribute("role")}:${(e.textContent ?? "").replace(/\s+/g, " ").slice(0, 60)}`); // CD-P53-O13e
              const lines = new Set(Array.from(document.querySelectorAll('[data-testid^="pos-reg-cart-line-"]'), (e) => e.getAttribute("data-testid"))).size;
              const payText = pay ? `${(pay.textContent ?? "").replace(/\s+/g, " ").slice(0, 80)} · title=${pay.getAttribute("title") ?? "-"} · aria=${pay.getAttribute("aria-label") ?? "-"}` : "-";
              // ORACLE-EDIT ผู้คุม A 24.10 (CD-P53-O13e · qc-pos-p4.1 R8): เลือกด้วย regex บนค่า attribute แทน selector ตัวอักษร — ป้ายวินิจฉัยไม่ใช่ testid ของทะเบียน
              const banners = Array.from(document.querySelectorAll("[data-testid]")).filter((e) => /^pos-(reg-(banner|shift|lock|device|limit|quote)|lock)/.test(e.getAttribute("data-testid") ?? "")).map((e) => `${e.getAttribute("data-testid")}:${(e.textContent ?? "").replace(/\s+/g, " ").slice(0, 60)}`);
              return { tts, pay: pay ? (pay.disabled ? "disabled" : "enabled") : "none", payText, lines, online: navigator.onLine, alerts: alerts.slice(0, 8), banners: banners.slice(0, 10) }; // ORACLE-EDIT ผู้คุม A 24.10 (CD-P53-O13d) ป้ายปุ่มชำระ + แบนเนอร์ = เหตุที่ปุ่มปิด
            })
            .catch((e: Error) => ({ evalError: e.message }))) as Any;
          try {
            writeFileSync(`/root/pos-runs/perf/p53-drain-state-${Date.now()}.json`, JSON.stringify(st, null, 1)); // ORACLE-EDIT ผู้คุม A 24.10 (CD-P53-O13d) ไฟล์เต็ม (บรรทัด log ถูกตัด)
          } catch {
            /* ไม่มีโฟลเดอร์ก็ข้าม */
          }
          throw new Error(`คิว quote ของ 199 การ์ดไม่ระบายใน 120 วิ (ก่อนวัดบรรทัดที่ 200) · สภาพหน้า ${JSON.stringify(st).slice(0, 600)}`);
        });
        drain.push(Date.now() - tDrain);
        const before = acts.length;
        const tClick = Date.now();
        const r = (await page.evaluate(
          () =>
            new Promise<{ paint: number }>((res) => {
              const cs = Array.from(document.querySelectorAll('[data-testid="pos-reg-grid"] [data-testid^="pos-reg-product-"]')) as HTMLButtonElement[];
              const target = cs[199]!;
              const t0 = performance.now();
              const mo = new MutationObserver(() => { // ORACLE-EDIT ผู้คุม A 24.10 (CD-P53-O13: tsx keepNames ใส่ __name() รอบ arrow ที่ผูกชื่อในโค้ดฝั่งเบราว์เซอร์ → ReferenceError ใน page.evaluate — ห้ามผูกชื่อฟังก์ชันในคอลแบ็กเบราว์เซอร์)
                if (new Set(Array.from(document.querySelectorAll('[data-testid^="pos-reg-cart-line-"]'), (e) => e.getAttribute("data-testid"))).size < 200) return;
                mo.disconnect();
                requestAnimationFrame(() => res({ paint: performance.now() - t0 }));
              });
              mo.observe(document.body, { childList: true, subtree: true });
              target.click();
              setTimeout(() => {
                mo.disconnect();
                res({ paint: -1 });
              }, 10_000);
            }),
        )) as { paint: number };
        if (r.paint < 0) throw new Error("บรรทัดที่ 200 ไม่ขึ้นใน 10 วิ");
        add200.push(r.paint);
        // quote ของตะกร้า 200 บรรทัด (คำขอ server action ที่มี productId 200 ตัว · หลังแตะใบที่ 200)
        await page.waitForFunction(() => {
          const tt = document.querySelector('[data-testid="pos-reg-total"]');
          const pay = document.querySelector('[data-testid="pos-reg-pay"]') as HTMLButtonElement | null;
          return !!tt && tt.getAttribute("aria-busy") !== "true" && !!pay && !pay.disabled;
        }, { timeout: 30_000, polling: "raf" }).catch(() => {
          throw new Error("ยอด 200 บรรทัดไม่นิ่ง/ปุ่มชำระไม่เปิดใน 30 วิ");
        });
        settle.push(Date.now() - tClick);
        for (let t = 0; t < 50; t++) {
          if (acts.slice(before).some((a) => a.kind === "quote" && a.lines === 200 && a.end)) break;
          await sleep(100);
        }
        const q200 = acts.slice(before).filter((a) => a.kind === "quote" && a.lines === 200 && a.end && a.status === 200);
        if (!q200.length) throw new Error(`ไม่พบคำขอ quote 200 บรรทัดที่จบ (คำขอหลังแตะ: ${acts.slice(before).map((a) => `${a.kind}/${a.lines}/${a.status}`).join(",") || "-"})`);
        quote.push(q200[q200.length - 1]!.end - q200[q200.length - 1]!.start);
        // ชำระพอดียอด (เงินสด) → การ์ดสำเร็จ
        await page.evaluate(() => (document.querySelector('[data-testid="pos-reg-pay"]') as HTMLButtonElement | null)?.click());
        await page.waitForSelector('[data-testid="pos-reg-paydlg-quick-exact"]', { visible: true, timeout: 15_000 }).catch(() => {
          throw new Error("กล่องชำระไม่ขึ้น (pos-reg-paydlg-quick-exact)");
        });
        await page.evaluate(() => (document.querySelector('[data-testid="pos-reg-paydlg-quick-exact"]') as HTMLButtonElement | null)?.click());
        await page.waitForFunction(() => !(document.querySelector('[data-testid="pos-reg-paydlg-confirm"]') as HTMLButtonElement | null)?.disabled, { timeout: 15_000 }).catch(() => {
          throw new Error("ปุ่มยืนยันชำระไม่เปิด");
        });
        const sb = acts.length;
        const pr = (await page.evaluate(
          () =>
            new Promise<number>((res) => {
              const btn = document.querySelector('[data-testid="pos-reg-paydlg-confirm"]') as HTMLButtonElement;
              const t0 = performance.now();
              btn.click();
              const iv = setInterval(() => { // ORACLE-EDIT ผู้คุม A 24.10 (CD-P53-O13: tsx keepNames ใส่ __name() รอบ arrow ที่ผูกชื่อในโค้ดฝั่งเบราว์เซอร์ → ReferenceError ใน page.evaluate — ห้ามผูกชื่อฟังก์ชันในคอลแบ็กเบราว์เซอร์) (เดิม rAF tick ผูกชื่อ)
                const d = document.querySelector('[data-testid="pos-reg-done"]');
                if (d && d.getClientRects().length) {
                  clearInterval(iv);
                  res(performance.now() - t0);
                } else if (performance.now() - t0 > 30_000) {
                  clearInterval(iv);
                  res(-1);
                }
              }, 8);
            }),
        )) as number;
        if (pr < 0) throw new Error("กดยืนยันแล้วการ์ดขายสำเร็จไม่ขึ้นใน 30 วิ");
        pay.push(pr);
        await sleep(300);
        const sub = acts.slice(sb).filter((a) => a.kind === "submit" && a.end);
        if (sub.length) submitRtt.push(sub[sub.length - 1]!.end - sub[sub.length - 1]!.start);
      } catch (e) {
        err = `บิล ${b + 1}: ${(e as Error).message.slice(0, 220)}`;
      } finally {
        await page.close().catch(() => undefined);
      }
    }
    put("P5.3-B4A", err ? null : add200, { drainP50: r1(pct(drain, 50)), drainMaxMs: drain.length ? Math.max(...drain) : null }, err); // ORACLE-EDIT ผู้คุม A 24.10 (CD-P53-O13b drain = เวลารอคิว quote 199 คำขอ (ข้อมูล · ไม่เข้าเกณฑ์)
    put("P5.3-B4Q", err ? null : quote, { totalSettleP95: r1(pct(settle, 95)), totalSettleP50: r1(pct(settle, 50)) }, err);
    put("P5.3-B4P", err ? null : pay, { submitActionP50: r1(pct(submitRtt, 50)), submitActionP95: r1(pct(submitRtt, 95)) }, err);
  }
  await warmCtx.close().catch(() => undefined);
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  await cleanup("finally");
}

// ═════════════════════════ ตัดสิน + บันทึก ═════════════════════════
console.log(`\n── ผลวัด (${VIEWPORT.width}×${VIEWPORT.height} · RTT ฐาน ${M["P5.3-B3"]?.extra?.rttDb ?? "?"} ms${PREV ? ` · รอบก่อน ${PREV.file}` : " · ไม่มีรอบก่อน ≤ 24 ชม."}) ──`);
console.log(`  ${"id".padEnd(9)} ${"metric".padEnd(48)} ${"n".padStart(3)} ${"p50".padStart(8)} ${"p95".padStart(8)} ${"max".padStart(8)} ${"budget".padStart(7)}  verdict`);
for (const b of PERF_BUDGET) {
  const short = b.id.replace("P5.3-", "");
  if (!want(short)) continue;
  const m = M[b.id] ?? put(b.id, null, {}, crashed ? `harness: ${crashed.slice(0, 120)}` : "ไม่ได้วัด");
  const prev = PREV?.metrics?.[b.id];
  m.prevOver = prev && prev.value !== null && prev.budget !== null ? prev.value > prev.budget : null;
  m.verdict = verdict(b.gate, b.budget, m.value, m.prevOver);
  const icon = { green: "🟢", amber: "🟡 OVER 1/2", red: "🔴 OVER 2/2", report: "⚪ report", error: "🔴 วัดไม่ได้" }[m.verdict];
  console.log(`  ${short.padEnd(9)} ${b.metric.padEnd(48)} ${String(m.n).padStart(3)} ${String(m.p50 ?? "—").padStart(8)} ${String(m.p95 ?? "—").padStart(8)} ${String(m.max ?? "—").padStart(8)} ${String(b.budget ?? "—").padStart(7)}  ${icon}${m.err ? ` · ${m.err}` : ""}${m.extra && Object.keys(m.extra).length ? ` · ${JSON.stringify(m.extra)}` : ""}`);
  const shown = b.id === "P5.3-B4N" ? `slope ${m.value} q/line (${JSON.stringify(m.extra)})` : `p50 ${m.p50} · p95 ${m.p95} · max ${m.max} ${b.unit}${m.extra && Object.keys(m.extra).length ? ` · ${JSON.stringify(m.extra)}` : ""}`;
  chk(b.id, b.id === "P5.3-B4N" ? m.value !== null && m.value < 0.5 : isOk(m.verdict), b.budget === null ? "วัดได้ (รายงาน)" : `${b.stat} ≤ ${b.budget} ${b.unit}${b.gate ? " (แดงเมื่อเกินสองรอบติด)" : " (รายงาน)"}`, `${m.verdict}${m.err ? ` · ${m.err}` : ""} · ${shown}${m.prevOver !== null && m.prevOver !== undefined ? ` · รอบก่อนเกิน ${m.prevOver}` : ""}`);
}
// Z: คืนสภาพ · เครือข่าย · บิล
const sessLeft = SESSIONS.length ? await P.session.count({ where: { id: { in: SESSIONS } } }).catch(() => -1) : 0;
const shiftRow = SHIFT_ID ? await P.posShift.findFirst({ where: { id: SHIFT_ID }, select: { status: true } }).catch(() => null) : null;
const profLeft = PROFILE.filter((d) => existsSync(d));
chk("P5.3-Z1", sessLeft === 0 && (!SHIFT_OPENED_HERE || shiftRow?.status !== "OPEN") && profLeft.length === 0, "session 0 · กะของรอบปิด · โปรไฟล์ลบ", `session ค้าง ${sessLeft} · กะ ${SHIFT_ID || "-"} ${shiftRow?.status ?? "-"}${SHIFT_OPENED_HERE ? " (เปิดในรอบนี้)" : " (มีอยู่ก่อน — คงไว้)"} · โปรไฟล์ค้าง ${profLeft.length} · ${restores.join(" · ")}`);
chk("P5.3-Z2", guardHits.length === 0, "0", `${guardHits.length}${guardHits.length ? ` (${guardHits.slice(0, 3).join(" · ")})` : ""}`);
const outside = SHIFT_ID ? await P.posSale.count({ where: { shiftId: SHIFT_ID, NOT: { tenantId: T } } }).catch(() => -1) : 0;
const runSales = SHIFT_ID ? ((await P.posSale.findMany({ where: { tenantId: T, shiftId: SHIFT_ID, createdAt: { gte: RUN_START } }, select: { id: true, _count: { select: { lines: true } } } }).catch(() => [])) as Any[]) : [];
const wantBills = want("B4P") || want("B4A") || want("B4Q") ? (M["P5.3-B4P"]?.n ?? 0) : 0;
const lineBad = runSales.filter((s: Any) => s._count?.lines !== 200).length;
chk("P5.3-Z3", outside === 0 && runSales.length === wantBills && lineBad === 0, `นอกร้าน 0 · บิลรอบนี้ ${wantBills} · ทุกใบ 200 บรรทัด`, `นอกร้าน ${outside} · บิลรอบนี้ (กะ ${SHIFT_ID || "-"}) ${runSales.length} (บิลของร้านก่อนรอบ ${salesBefore}) · ไม่ครบ 200 บรรทัด ${lineBad}`);

const stamp = RUN_START.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
mkdirSync(PERF_DIR, { recursive: true });
const outFile = `${PERF_DIR}/p53-${stamp}.json`;
const failed = checks.filter((c) => !c.ok).map((c) => c.id);
const rtt = { dbP50: M["P5.3-B3"]?.extra?.rttDb ?? M["P5.3-B2S"]?.extra?.rttDb ?? null, appP50: M["P5.3-B3H"]?.extra?.appRttP50 ?? null };
writeFileSync(outFile, JSON.stringify({ suite: SUITE, at: RUN_START.toISOString(), base: BASE, tenant: T, head: headSha(), viewport: VIEWPORT, runs: RUNS, rtt, previous: PREV?.file ?? null, metrics: M, checks, notes, crashed }, null, 2) + "\n");
console.log(`\nผล: ${outFile}`);
console.log(`\n===== ${SUITE} ===== ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(
  `JSON_SUMMARY ${JSON.stringify({
    suite: SUITE, mode: "measure", total: checks.length, passed: checks.length - failed.length, failed, tenant: T, base: BASE, rtt, previous: PREV?.file ?? null, out: outFile,
    metrics: Object.fromEntries(Object.values(M).map((m) => [m.id, { p50: m.p50, p95: m.p95, value: m.value, budget: m.budget, gate: m.gate, verdict: m.verdict, n: m.n }])), crashed: crashed || null,
  })}`,
);
await P.$disconnect().catch(() => undefined);
process.exit(failed.length ? 1 : 0);
