// QC — SVC D.13 · ผังห้องหอ + KPI (หอ 01) · ตั้งนโยบาย/สิทธิ์ (หอ 17) · คีย์สิทธิ์หอ · ผู้ดูแลเห็นเฉพาะอาคาร · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-d.13.md (§2–§10 ผูกตรงตัว) · MASTER-PLAN แถว D.13 · CC §1.8 §8 · DH A1 + ภาคผนวก ก #59–64
//        ภาพ ledger/design-dorm/01-floorplan.png · 17-settings-policies.png · README หอ "3 พ.ย." (ค่า = SQC_DORM_HOME_SCENE ใน scripts/svc-qc-data.mts)
//        หนี้: svc-r0.8-carry "ภาพเทียบแบบ R0.4" (หอ 17) · /root/svc-runs/fix/d7.md (ทางลัดโหมดกฎหมาย · U-11) · /root/svc-runs/fix/d5.md (N+1 · fai) · D.6 (คนจดมิเตอร์ไม่เห็นเงิน)
//
// กลุ่มข้อ:
//   PC positive control (ต้องเขียวตั้งแต่ก่อนทำ: ข้อมูลฉาก README · เครื่องยนต์ · ฉากผังบนฐาน · RoomBoard R0.9 · ภาพ d.7 ปุ่มยอมรับ)
//   S  โครงสร้าง (ไฟล์ · client ไม่ลาก server · หน้าคงสัญญาสแตติก R0.9/D.6/R0.4 · ไม่แตะไฟล์ต้องห้าม · N+1 · ไม่มีคีย์ค่าตั้งใน tsx)
//   R  ทะเบียน (EDIT = dorm.settings.edit · writeVia · def buildingAssignments · DORM_POLICY_LAYOUT ครอบทุกช่อง)
//   K  สิทธิ์ pure (คีย์ CC §8 · planned · ตารางบทบาท · ชุดสิทธิ์ · dormAccess.money · แท็บ · วันที่ไทย)
//   D  โมเดลหน้า 01 = ฉาก README 3 พ.ย. (KPI · รอบบิล · ป้ายเงิน · ชื่อ · ต้องทำวันนี้)
//   M  คนไม่เห็นเงิน · คนจดมิเตอร์ 404 · ไม่เชื่อ actor (Membership สด)
//   B  ผู้ดูแลเห็นเฉพาะอาคาร (#64 · X1 ระดับอาคาร: ผัง + สัญญา)
//   N  หนี้ N+1 (securityDepositHeldMany)
//   P  หน้า 17 (โมเดล + render) · RT ทุกค่าบน 17 บันทึก/คืนค่าได้ · E ด่านเครื่องยนต์/ชุดสิทธิ์/ทางเฉพาะโหมดกฎหมาย
//   U  render หน้า 01 · U-11 ปุ่มยอมรับ (หน้า 10) มี data-fingerprint
//   X  ข้ามร้าน/ข้ามหน่วย/ผิดชนิดหน่วย · Q ฉาก svcqc · V ภาพ · Z ล้างครบ · G regression (หลังล้าง)
//
// ข้อมูลทดสอบ: tenant ชั่วคราว slug `svc-d13-*` + ผู้ใช้ `svc-d13-*@qc.invalid` · ลบใน finally (+ กวาดของค้างตอนเริ่ม)
// รัน (ห้ามครอบ timeout):
//   bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.13.mts
//   ต่อท้าย `--no-regression` ข้ามหมวด G (SKIP — ไม่นับผ่าน)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { randomBytes } from "node:crypto";

type Any = any;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-d.13";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_D13_NO_REGRESSION === "1";

// ═══════════════ 0. ด่านฐานข้อมูล ═══════════════
const envMod = (await import("./svc-qc-env.mts" as string)) as { loadSvcQcEnv: (label: string) => { host: string } };
envMod.loadSvcQcEnv(LABEL);
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }

// ═══════════════ ผลข้อ ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 260) ?? String(v); } catch { return String(v); } };
const ok = (cond: unknown, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string, sev: Sev) => {
  cks.push({ id, res, sev, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const skip = (id: string, name: string, why: string, sev: Sev = "MAJOR") => record(id, name, "SKIP", why, sev);
async function t(id: string, name: string, fn: () => unknown | Promise<unknown>, sev: Sev = "CRITICAL") {
  try { await fn(); record(id, name, "PASS", "", sev); } catch (e) { record(id, name, "FAIL", errMsg(e), sev); }
}
const THAI = /[฀-๿]/;
const isThai = (s: unknown) => typeof s === "string" && THAI.test(s);
const FORBIDDEN = /ตัดน้ำ|ตัดไฟ|ล็อกห้อง|ล็อคห้อง|ระงับน้ำ|ระงับไฟ|ระงับการใช้น้ำ|ยึดทรัพย์|ยึดของ|ขนของออก/;
const uniq = <T,>(a: T[]) => [...new Set(a)];
const sorted = (a: string[]) => [...a].sort();

// ═══════════════ ไฟล์ ═══════════════
const has = (f: string) => existsSync(join(ROOT, f));
const read = (f: string) => (has(f) ? readFileSync(join(ROOT, f), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const tryImport = async (spec: string): Promise<{ mod: Any; err: string }> => {
  try { return { mod: await import(spec as string), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const importFile = async (rel: string): Promise<{ mod: Any; err: string }> =>
  has(rel) ? tryImport(pathToFileURL(join(ROOT, rel)).href) : { mod: null, err: `ยังไม่มี ${rel}` };
const DU = "src/app/app/u/[unitSlug]/dorm";
const F = {
  home: "src/lib/modules/dorm/home.ts",
  scope: "src/lib/modules/dorm/scope.ts",
  policy: "src/lib/modules/dorm/policy.ts",
  access: "src/lib/modules/dorm/access.ts",
  lease: "src/lib/modules/dorm/lease.ts",
  index: "src/lib/modules/dorm/index.ts",
  accIndex: "src/lib/modules/account/index.ts",
  homeShared: "src/components/dorm/dorm-home-shared.ts",
  policyShared: "src/components/dorm/dorm-policy-shared.ts",
  homeC: "src/components/dorm/DormHome.tsx",
  policyC: "src/components/dorm/DormPolicySettings.tsx",
  tabsC: "src/components/dorm/DormTabs.tsx",
  board: "src/components/rooms/RoomBoard.tsx",
  lawC: "src/components/dorm/UtilityLawSettings.tsx",
  pHome: `${DU}/page.tsx`,
  pLayout: `${DU}/layout.tsx`,
  pSettings: `${DU}/settings/page.tsx`,
  pActions: `${DU}/settings/actions.ts`,
  pUnit: "src/app/app/u/[unitSlug]/page.tsx",
  perms: "src/lib/core/permissions.ts",
  defs: "src/lib/core/settings/defs/rooms.ts",
  types: "src/lib/core/settings/types.ts",
  registry: "src/lib/core/settings/registry.ts",
  sactions: "src/lib/core/settings/actions.ts",
  scene: "scripts/svc-qc-dorm-home-scene.mts",
};
const CLIENT_FILES = [F.homeC, F.policyC, F.tabsC];
const valueImports = (src: string): string[] =>
  [...stripComments(src).matchAll(/^\s*import\s+(?!type\b)([^;]*?)\s+from\s+["']([^"']+)["']/gm)]
    .filter((m) => !/^\{\s*type\s/.test(m[1].trim()) || m[1].replace(/type\s+\w+\s*,?/g, "").replace(/[{}\s,]/g, "").length > 0)
    .map((m) => m[2]);
const exportedFns = (src: string): { name: string; params: string; body: string }[] => {
  const s = stripComments(src);
  const ms = [...s.matchAll(/export\s+async\s+function\s+(\w+)\s*\(([^)]*)\)/g)];
  return ms.map((m, i) => ({ name: m[1], params: m[2], body: s.slice(m.index!, i + 1 < ms.length ? ms[i + 1].index : s.length) }));
};
const fnBody = (src: string, name: string): string => {
  const s = stripComments(src);
  const i = s.search(new RegExp(`(export\\s+)?(async\\s+)?function\\s+${name}\\s*\\(`));
  if (i < 0) return "";
  const rest = s.slice(i + 10);
  const j = rest.search(/\n(export\s+)?(async\s+)?function\s+\w+\s*\(|\nexport\s+(const|type)\s/);
  return s.slice(i, j < 0 ? s.length : i + 10 + j);
};
function gitDirty(paths: string[]): string[] {
  const r = spawnSync("git", ["status", "--porcelain", "--", ...paths], { cwd: ROOT, encoding: "utf8" });
  return (r.stdout ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
}
function srcFiles(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${n}`;
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) srcFiles(rel, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(rel);
  }
  return out;
}

// ═══════════════ HTML ═══════════════
const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
const textOf = (html: string) => unesc(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const VOID = new Set(["input", "img", "br", "hr", "meta", "link", "source", "area", "col", "wbr"]);
type El = { tag: string; attrs: Record<string, string>; html: string; start: number };
function parseAttrs(open: string): Record<string, string> {
  const out: Record<string, string> = {};
  const body = open.replace(/^<[a-zA-Z][\w-]*/, "").replace(/\/?>$/, "");
  for (const m of body.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:="([^"]*)")?/g)) out[m[1].toLowerCase()] = unesc(m[2] ?? "");
  return out;
}
function elems(html: string, attr: string, val?: string): El[] {
  const out: El[] = [];
  const re = /<([a-zA-Z][\w-]*)(\s[^>]*)?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = parseAttrs(m[0]);
    if (!(attr in attrs) || (val !== undefined && attrs[attr] !== val)) continue;
    const tag = m[1].toLowerCase();
    const start = m.index;
    if (VOID.has(tag) || m[0].endsWith("/>")) { out.push({ tag, attrs, html: m[0], start }); continue; }
    const tr = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "gi");
    tr.lastIndex = start;
    let depth = 0;
    let end = html.length;
    let x: RegExpExecArray | null;
    while ((x = tr.exec(html))) {
      if (x[2] === "/") continue;
      depth += x[1] === "/" ? -1 : 1;
      if (depth === 0) { end = tr.lastIndex; break; }
    }
    out.push({ tag, attrs, html: html.slice(start, end), start });
  }
  return out;
}
const one = (html: string, attr: string, val?: string): El => {
  const xs = elems(html, attr, val);
  if (xs.length !== 1) throw new AssertFail(`ต้องมี [${attr}${val !== undefined ? `="${val}"` : ""}] 1 ตัว ได้ ${xs.length}`);
  return xs[0];
};
const keysIn = (html: string): string[] => elems(html, "data-setting-key").map((e) => e.attrs["data-setting-key"]);

// ═══════════════ โหลดโมดูล ═══════════════
const S = await tryImport("@/lib/core/settings");
const SH = await tryImport("@/components/settings/settings-shared");
const RBAC = await tryImport("@/lib/core/rbac");
const PERM = await tryImport("@/lib/core/permissions");
const DM = await tryImport("@/lib/modules/dorm");
const ACC = await tryImport("@/lib/modules/account");
const ROOMS = await tryImport("@/lib/modules/rooms");
const AX = await importFile(F.access);
const HS = await importFile(F.homeShared);
const PS = await importFile(F.policyShared);
const SQ = (await import("./svc-qc-data.mts" as string)) as Any;
const REACT = await tryImport("react");
const RDS = await tryImport("react-dom/server");
const COMP = { home: await importFile(F.homeC), policy: await importFile(F.policyC), board: await importFile(F.board), law: await importFile(F.lawC) };
const s: Any = S.mod;
const sh: Any = SH.mod;
const fnOf = (mod: Any, name: string, why = ""): ((...a: Any[]) => Any) => {
  if (!mod || typeof mod[name] !== "function") throw new AssertFail(`ไม่มีฟังก์ชัน ${name}${why ? ` (${why})` : ""}`);
  return mod[name];
};
const dm = (name: string) => fnOf(DM.mod, name, DM.err || "ยังไม่ export จาก @/lib/modules/dorm");
const compOf = (c: { mod: Any; err: string }, label: string): Any => {
  const m = c.mod;
  const C = m ? (typeof m.default === "function" ? m.default : Object.values(m).find((x) => typeof x === "function")) : null;
  if (typeof C !== "function") throw new AssertFail(`คอมโพเนนต์ ${label}: ${c.err || "ไม่มี default export"}`);
  return C;
};
const h = (C: Any, props: Any, ...children: Any[]) => REACT.mod.createElement(C, props, ...children);
const ssr = (el: Any): string => String(RDS.mod.renderToStaticMarkup(el)).replace(/<!-- -->/g, "");
const noop = async () => ({ ok: true });
const renderHome = (model: Any): string => {
  ok(model, "ไม่มีโมเดล");
  const Home = compOf(COMP.home, "DormHome");
  const Board = compOf(COMP.board, "RoomBoard");
  return ssr(h(Home, { model, unitSlug: "qc-d13" }, h(Board, { cells: model.cells, date: model.date, buildings: model.buildings, occupantLabels: model.occupantLabels, finance: model.finance })));
};
const renderPolicy = (model: Any): string => {
  ok(model, "ไม่มีโมเดล");
  return ssr(h(compOf(COMP.policy, "DormPolicySettings"), { model, unitSlug: "qc-d13", actions: { save: noop, reset: noop, applyRolePreset: noop } }));
};
const listDefs = (d: string): Any[] => (s?.listDefs?.(d) ?? []) as Any[];
const getDef = (k: string): Any => s?.getDef?.(k);
const enumOptions = (schema: Any): string[] | null => {
  let sc = schema;
  for (let i = 0; i < 4 && sc; i++) {
    if (Array.isArray(sc.options) && sc.options.every((o: unknown) => typeof o === "string")) return sc.options as string[];
    sc = typeof sc.unwrap === "function" ? sc.unwrap() : null;
  }
  return null;
};

// ═══════════════ ค่าคาดหวัง ═══════════════
const SCN = SQ.SQC_DORM_HOME_SCENE as Any;
const POL = SQ.SQC_DORM_POLICY_SCENE as Any;
const R = SCN?.readme ?? {};
const EXP = SCN?.expect ?? {};
const PAGE10_GROUPS = ["general", "legal", "utility", "vat", "money"];
const CARDS = [
  { key: "billing", no: 1, head: "รอบบิล", groups: [["rooms", "billing"]] },
  { key: "lateFee", no: 2, head: "ค่าปรับ", groups: [["rooms", "lateFee"]] },
  { key: "services", no: 3, head: "ค่าบริการอื่น", groups: [["rooms", "services"]] },
  { key: "notify", no: 4, head: "เตือน · ทวง", groups: [["rooms", "notify"], ["rooms", "msg"], ["messaging", "channel"], ["messaging", "quiet"]] },
  { key: "deposit", no: 5, head: "เงินประกัน · สัญญา", groups: [["rooms", "deposit"], ["rooms", "lease"], ["rooms", "moveout"]] },
  { key: "roles", no: 6, head: "สิทธิ์ผู้ใช้", groups: [["rooms", "access"]] },
  { key: "meter", no: 7, head: "จดมิเตอร์", groups: [["rooms", "meter"]] },
  { key: "payments", no: 8, head: "รับเงิน", groups: [["payments", "receiver"], ["payments", "slip"], ["rooms", "payment"], ["rooms", "tax"]] },
  { key: "other", no: 9, head: "แจ้งซ่อม", groups: [["rooms", "repair"], ["rooms", "parcel"], ["rooms", "locale"]] },
] as const;
const unitKeys = (domain: string, group?: string): string[] =>
  listDefs(domain).filter((d) => !d.hiddenUntil && (d.chain as string[]).includes("UNIT") && (group === undefined || d.group === group)).map((d) => String(d.key));
const cardKeysExp = (card: (typeof CARDS)[number]): string[] => card.groups.flatMap(([d, g]) => unitKeys(d, g));
const DORM_OLD_KEYS = ["dorm.view", "dorm.meter.read", "dorm.bill.run", "dorm.lease.manage"];
const DORM_NEW_KEYS = [
  "dorm.import", "dorm.bill.send", "dorm.slip.review", "dorm.payment.manual", "dorm.latefee.waive", "dorm.moveout.manage",
  "dorm.deposit.deduct.approve", "dorm.repair.manage", "dorm.announce", "dorm.parcel.manage", "dorm.settings.edit", "dorm.settings.legal",
];
const PLANNED_OK = ["dorm.import", "dorm.latefee.waive", "dorm.moveout.manage", "dorm.deposit.deduct.approve", "dorm.repair.manage", "dorm.announce", "dorm.parcel.manage", "dorm.settings.legal"];
const MONEY_KEYS = ["dorm.bill.run", "dorm.bill.send", "dorm.slip.review", "dorm.payment.manual"];
type Cell = "YES" | "NO" | "REQUEST";
const ROLE_COLS = [["OWNER", "เจ้าของ"], ["CARETAKER", "ผู้ดูแล"], ["TECH", "ช่าง"], ["ACCOUNTANT", "บัญชี"]] as const;
const ROLE_ROWS: { id: string; label: string; keys: string[]; cells: [Cell, Cell, Cell, Cell] }[] = [
  { id: "bill", label: "ออก/ส่งบิล", keys: ["dorm.bill.run", "dorm.bill.send"], cells: ["YES", "YES", "NO", "YES"] },
  { id: "slip", label: "ยืนยันสลิป", keys: ["dorm.slip.review", "dorm.payment.manual"], cells: ["YES", "YES", "NO", "YES"] },
  { id: "meter", label: "จดมิเตอร์", keys: ["dorm.meter.read"], cells: ["YES", "YES", "YES", "NO"] },
  { id: "deposit", label: "หักประกัน", keys: ["dorm.deposit.deduct.approve"], cells: ["YES", "REQUEST", "NO", "NO"] },
  { id: "latefee", label: "ยกเว้นค่าปรับ", keys: ["dorm.latefee.waive"], cells: ["YES", "REQUEST", "NO", "NO"] },
  { id: "legal", label: "เปลี่ยนโหมดกฎหมาย", keys: ["dorm.settings.legal"], cells: ["YES", "NO", "NO", "NO"] },
  { id: "view", label: "ดูผังห้อง", keys: ["dorm.view"], cells: ["YES", "YES", "NO", "YES"] },
  { id: "lease", label: "สัญญา", keys: ["dorm.lease.manage", "dorm.moveout.manage"], cells: ["YES", "YES", "NO", "NO"] },
  { id: "repair", label: "แจ้งซ่อม", keys: ["dorm.repair.manage"], cells: ["YES", "YES", "YES", "NO"] },
  { id: "notice", label: "ประกาศ", keys: ["dorm.announce", "dorm.parcel.manage"], cells: ["YES", "YES", "NO", "NO"] },
  { id: "settings", label: "ตั้งค่าหอ", keys: ["dorm.settings.edit", "dorm.import"], cells: ["YES", "NO", "NO", "NO"] },
];
const presetExp = (role: "CARETAKER" | "TECH" | "ACCOUNTANT"): Record<string, boolean> => {
  const ci = ROLE_COLS.findIndex((c) => c[0] === role);
  const out: Record<string, boolean> = {};
  for (const r of ROLE_ROWS) for (const k of r.keys) out[k] = out[k] === true || r.cells[ci] === "YES";
  return out;
};
const NOV_ROOMS: string[] = Object.keys(SCN?.bills ?? {});
const PAID_ROOMS = NOV_ROOMS.filter((n) => !(SCN.slipPending as string[]).includes(n) && !(SCN.unpaid as string[]).includes(n));

// ═══════════════ PC (ไม่ใช้ฐาน) ═══════════════
console.log("\nPC. positive control (ข้อมูลฉาก · เครื่องยนต์ — ต้องเขียวก่อนทำ)");
await t("PC-1", "ข้อมูลฉาก README 3 พ.ย. ถูกต้องเลขคณิต: 31 บิล ฿174,126.40 = จ่าย 24 ฿133,912.80 + สลิป 3 ฿17,785.36 + ค้าง 4 ฿22,428.24 · ค้าง ต.ค. ฿10,200.40 · ห้องผู้เช่า = 36 − ว่าง 3 − จอง 1 − ซ่อม 1", () => {
  ok(SCN && POL, "ไม่มี SQC_DORM_HOME_SCENE / SQC_DORM_POLICY_SCENE");
  const sumOf = (rooms: string[]) => rooms.reduce((a, n) => a + (SCN.bills[n] as number), 0);
  eq(NOV_ROOMS.length, 31, "จำนวนบิล");
  eq(sumOf(NOV_ROOMS), EXP.totalSatang, "รวม");
  eq([PAID_ROOMS.length, sumOf(PAID_ROOMS)], [24, EXP.collectedSatang], "จ่ายแล้ว");
  eq(sumOf(SCN.slipPending), 1778536, "สลิปรอตรวจ");
  eq(sumOf(SCN.unpaid), 2242824, "ยังไม่จ่าย");
  eq(sumOf(SCN.slipPending) + sumOf(SCN.unpaid), EXP.outstandingSatang, "รอเก็บ");
  eq(Object.values(SCN.prevUnpaid as Record<string, number>).reduce((a, b) => a + b, 0), EXP.overdueSatang, "ค้าง ต.ค.");
  eq(SCN.bills["204"], 548600, "204 ฿5,486.00");
  const all = (SQ.SQC_DORM_ROOMS as Any[]).map((r) => r.number as string);
  const notLeased = [...Object.keys(SCN.vacantSince), SCN.moveIn.room, SCN.repairBlock.room];
  eq(sorted(all.filter((n) => !notLeased.includes(n))), sorted(NOV_ROOMS), "ห้องที่มีบิล = ห้องมีผู้เช่า");
});
await t("PC-2", "เครื่องยนต์ค่าตั้ง rooms โหลดได้ · แม่แบบ APARTMENT มี · ค่าฉาก 17 ผ่าน schema และต่างจากแม่แบบ (4 ข้อ) · rbac.evaluate · formatFieldValue", () => {
  ok(s, `โหลด @/lib/core/settings ไม่ได้: ${S.err}`);
  ok(s.getTemplate?.("rooms", POL.template), `ไม่มีแม่แบบ ${POL.template}`);
  eq(POL.unitDiffs.length, 4, "unitDiffs");
  for (const d of POL.unitDiffs) {
    const def = getDef(d.key);
    ok(def && (def.chain as string[]).includes("UNIT") && def.schema.safeParse(d.value).success, `ค่าฉาก ${d.key} ใช้ไม่ได้`);
    ok(!isDeepStrictEqual(s.defaultFor(def, POL.template), d.value), `${d.key} เท่าแม่แบบ`);
  }
  ok(typeof RBAC.mod?.evaluate === "function" && typeof sh?.formatFieldValue === "function", "rbac/settings-shared");
});

// ═══════════════ S. โครงสร้าง ═══════════════
console.log("\nS. โครงสร้าง · ขอบเขต import · หน้า · ไฟล์ต้องห้าม");
await t("S-1", "ไฟล์ส่งมอบครบ (home · scope · policy · shared 2 · คอมโพเนนต์ 3 · layout · actions 17 · สคริปต์ฉาก)", () => {
  const miss = [F.home, F.scope, F.policy, F.homeShared, F.policyShared, ...CLIENT_FILES, F.pLayout, F.pActions, F.scene].filter((f) => !has(f));
  ok(miss.length === 0, `ไม่มี ${miss.join(" · ")}`);
});
await t("S-2", "คอมโพเนนต์ client 3 ไฟล์: 'use client' บรรทัดแรก · ไม่ import ค่าจาก prisma/@/lib/core/db/@/lib/core/settings/@/lib/modules · ไม่ใช้ useRouter/next/link · โหลดได้", () => {
  const p: string[] = [];
  for (const f of CLIENT_FILES) {
    const src = read(f);
    if (!src) { p.push(`${f}: ไม่มี`); continue; }
    if (!/^\s*["']use client["']/.test(src)) p.push(`${f}: ไม่ใช่ 'use client'`);
    const bad = valueImports(src).filter((x) => /prisma|^@\/lib\/core\/(db|settings)$|^@\/lib\/modules\/|^next\/(link|navigation)/.test(x));
    if (bad.length) p.push(`${f}: ${bad.join(",")}`);
    if (/\buseRouter\s*\(|\busePathname\s*\(/.test(stripComments(src))) p.push(`${f}: hook ของ Next`);
  }
  for (const [k, c] of Object.entries(COMP)) if (!c.mod) p.push(`${k}: ${c.err}`);
  ok(p.length === 0, p.join(" · "));
});
await t("S-3", "ไฟล์ pure (dorm-home-shared · dorm-policy-shared · access): ไม่มี directive · ไม่ import prisma/next/db/node:/service · access import ได้แค่ rbac", () => {
  const p: string[] = [];
  for (const f of [F.homeShared, F.policyShared, F.access]) {
    const src = read(f);
    if (!src) { p.push(`${f}: ไม่มี`); continue; }
    if (/["']use (client|server)["']/.test(src.slice(0, 300))) p.push(`${f}: มี directive`);
    const bad = valueImports(src).filter((x) => /prisma|^next|^@\/lib\/core\/db|^node:|\/service$|^@\/lib\/core\/settings$|^@\/lib\/modules\//.test(x));
    if (bad.length) p.push(`${f}: ${bad.join(",")}`);
    if (f === F.access && valueImports(src).some((x) => x !== "@/lib/core/rbac")) p.push(`access.ts: ${valueImports(src).join(",")}`);
  }
  ok(p.length === 0, p.join(" · "));
});
await t("S-4", "หน้า /dorm คงสัญญาสแตติก R0.9 S-7 + D.6 S-8 (roomBoard( ผ่าน facade rooms · import RoomBoard · dormAccess(...).board · requireUnit · DORM · notFound) + ใช้ dormHomeModel(..cells..) · DormHome · server · ไม่แตะ prisma", () => {
  const p = stripComments(read(F.pHome));
  ok(p, "ไม่มีไฟล์");
  const need: [string, boolean][] = [
    ["facade rooms", /from\s+["']@\/lib\/modules\/rooms["']/.test(p) && !/["']@\/lib\/modules\/rooms\//.test(p)],
    ["roomBoard(", /roomBoard\s*\(/.test(p)], ["import RoomBoard", /@\/components\/rooms\/RoomBoard/.test(p)],
    ["dormAccess(...).board", /dormAccess\s*\(/.test(p) && /\.board\b/.test(p)], ["requireUnit", /requireUnit\s*\(/.test(p)],
    ["DORM", /["']DORM["']/.test(p)], ["notFound", /notFound\s*\(/.test(p)], ["dormHomeModel( … cells", /dormHomeModel\s*\([\s\S]{0,300}\bcells\b/.test(p)],
    ["DormHome", /DormHome/.test(p)], ["ไม่ใช่ client", !/^\s*["']use client["']/.test(read(F.pHome))], ["ไม่แตะ prisma", !/@\/lib\/core\/db|@prisma\//.test(p)],
    ["actor จาก auth.active", /auth\.active/.test(p)],
  ];
  const miss = need.filter(([, v]) => !v).map(([k]) => k);
  ok(miss.length === 0, `ขาด ${miss.join(" · ")}`);
});
await t("S-5", "หน้า /dorm/settings = หน้า 17: คงสตริง R0.4 F-6 (requireUnit · loadSettingsForm · notFound · saveSettingsAction · resetSettingAction · SettingsForm · \"DORM\" · rooms/payments/messaging) + loadDormPolicySettings + DORM_POLICY_GROUPS + DormPolicySettings · ไม่วาด <SettingsForm (ฟอร์มยาว) · ไม่อ่านสิทธิ์จาก searchParams", () => {
  const p = stripComments(read(F.pSettings));
  ok(p, "ไม่มีไฟล์");
  const miss = ["requireUnit", "loadSettingsForm", "notFound", "saveSettingsAction", "resetSettingAction", "SettingsForm", "\"DORM\"", "loadDormPolicySettings", "DORM_POLICY_GROUPS", "DormPolicySettings"].filter((w) => !p.includes(w));
  for (const d of ["rooms", "payments", "messaging"]) if (!new RegExp(`["']${d}["']`).test(p)) miss.push(d);
  ok(miss.length === 0, `ขาด ${miss.join(" · ")}`);
  ok(!/<SettingsForm\b/.test(p), "ยังวาดฟอร์มยาว <SettingsForm>");
  ok(!/searchParams[\s\S]{0,120}\b(role|unitAccess|tenantId|permissions)\b/.test(p), "อ่านสิทธิ์จาก searchParams");
}, "MAJOR");
await t("S-6", "settings/actions.ts: \"use server\" · export async function เท่านั้น = applyDormRolePresetAction · requireUnit → ด่าน dorm.settings.edit → applyDormRolePreset · refresh() · ไม่รับ tenantId/role/permissions", () => {
  const raw = read(F.pActions);
  ok(raw, "ไม่มีไฟล์");
  ok(/^\s*["']use server["']/.test(raw), "ไม่ใช่ \"use server\"");
  const src = stripComments(raw);
  ok(!/export\s+(const|let|type|interface|class|function\s)/.test(src.replace(/export\s+async\s+function/g, "")), "มี export ที่ไม่ใช่ async function");
  const fns = exportedFns(raw);
  eq(fns.map((f) => f.name), ["applyDormRolePresetAction"], "ชื่อ action");
  const fn = fns[0];
  ok(!/\b(tenantId|role|unitAccess|permissions|actor)\b\s*[:,)]/.test(fn.params), "รับค่าสิทธิ์จาก client");
  const ru = fn.body.search(/requireUnit\s*\(/), gate = fn.body.search(/dorm\.settings\.edit|\.settings\b/), work = fn.body.search(/applyDormRolePreset\s*\(/);
  ok(ru >= 0 && gate > ru && work > gate, `ลำดับ requireUnit(${ru}) → ด่าน(${gate}) → งาน(${work})`);
  ok(/\brefresh\s*\(/.test(fn.body), "ไม่ refresh()");
});
await t("S-7", "core actions.ts: saveSettingsAction เรียก writeViaIssues ก่อน setSettings( · resetSettingAction เรียกก่อน resetSetting( (ปิดทางลัดโหมดกฎหมาย — หนี้ D.7)", () => {
  const src = read(F.sactions);
  const sv = fnBody(src, "saveSettingsAction"), rs = fnBody(src, "resetSettingAction");
  const a = sv.search(/writeViaIssues\s*\(/), b = sv.search(/setSettings\s*\(/), c = rs.search(/writeViaIssues\s*\(/), d = rs.search(/resetSetting\s*\(/);
  ok(a >= 0 && b > a, `saveSettingsAction: writeViaIssues(${a}) ก่อน setSettings(${b})`);
  ok(c >= 0 && d > c, `resetSettingAction: writeViaIssues(${c}) ก่อน resetSetting(${d})`);
});
await t("S-8", "ไม่แตะไฟล์ต้องห้าม (prisma · service/form/template ของเครื่องยนต์ · components/settings · RoomBoard · meter · utility · law · UtilityLawSettings · DormSettingsNav) · types/registry แก้แบบเพิ่มอย่างเดียว (ไม่มีบรรทัดถูกลบ · บรรทัดเพิ่มเกี่ยว writeVia)", () => {
  // ORACLE-EDIT (ผู้คุม 29 ต.ค. · fix P3): service.ts แตะได้เฉพาะ applyTemplate RESET_ALL ข้ามคีย์ writeVia + rooms.access.* ⇒ บรรทัดเพิ่ม/ลบที่ไม่ว่างต้องอ้าง writeVia หรือ rooms.access
  {
    const d = spawnSync("git", ["diff", "-U0", "HEAD", "--", "src/lib/core/settings/service.ts"], { cwd: ROOT, encoding: "utf8" }).stdout ?? "";
    const ch = d.split("\n").filter((l) => /^[+-](?![+-])/.test(l)).map((l) => l.slice(1).trim()).filter((l) => l && !/^(\/\/|\*|\/\*)/.test(l) && !/^[{}()\[\];,]+$/.test(l));
    const off = ch.filter((l) => !/writeVia|rooms\.access|keep|skip|protected/i.test(l));
    if (off.length > 10) throw new Error(`service.ts แก้เกินขอบเขต P3: ${off.slice(0, 3).join(" | ").slice(0, 160)}`);
  }
  const dirty = gitDirty(["prisma", "src/lib/core/settings/form.ts", "src/lib/core/settings/template.ts", "src/components/settings",
    F.board, "src/lib/modules/dorm/meter.ts", "src/lib/modules/dorm/utility.ts", "src/lib/modules/dorm/law.ts", F.lawC, "src/components/dorm/DormSettingsNav.tsx"]);
  eq(dirty, [], "ไฟล์ต้องห้ามที่ถูกแก้");
  const p: string[] = [];
  for (const f of [F.types, F.registry]) {
    const d = spawnSync("git", ["diff", "-U0", "HEAD", "--", f], { cwd: ROOT, encoding: "utf8" }).stdout ?? "";
    const lines = d.split("\n").filter((l) => /^[+-](?![+-])/.test(l));
    const removed = lines.filter((l) => l.startsWith("-") && l.slice(1).trim() !== "");
    const added = lines.filter((l) => l.startsWith("+")).map((l) => l.slice(1).trim()).filter((l) => l && !/^(\/\/|\*|\/\*)/.test(l) && !/^[{}()\[\];,]+$/.test(l));
    if (removed.length) p.push(`${f}: ลบ ${removed.length} บรรทัด`);
    const off = added.filter((l) => !/writeVia/.test(l));
    if (off.length) p.push(`${f}: บรรทัดเพิ่มที่ไม่เกี่ยว writeVia: ${off[0].slice(0, 80)}`);
  }
  ok(p.length === 0, p.join(" · "));
});
await t("S-9", "หนี้ N+1 (D.5): listLeases ไม่เรียก securityDepositHeld( ทีละสัญญา · เรียก securityDepositHeldMany( (ไม่อยู่ในวน for)", () => {
  const b = fnBody(read(F.lease), "listLeases");
  ok(b, "ไม่พบ listLeases");
  ok(!/securityDepositHeld\s*\(/.test(b), "ยังเรียก securityDepositHeld( ใน listLeases");
  const i = b.search(/securityDepositHeldMany\s*\(/);
  ok(i >= 0, "ไม่เรียก securityDepositHeldMany");
  const loop = b.search(/for\s*\(\s*const\s+\w+\s+of\s+leases\b/);
  ok(loop < 0 || i < loop, "เรียกในวน");
});
await t("S-10", "คอมโพเนนต์ .tsx ไม่มีคีย์ค่าตั้ง \"rooms|payments|messaging.<กลุ่ม>.<ชื่อ>\" (ตำแหน่งอยู่ใน dorm-policy-shared ที่เดียว)", () => {
  const p: string[] = [];
  for (const f of CLIENT_FILES) {
    const hits = [...stripComments(read(f)).matchAll(/["'`](rooms|payments|messaging)\.[a-zA-Z]+(\.[A-Za-z]+)?["'`]/g)].map((m) => m[0]);
    if (hits.length) p.push(`${f}: ${uniq(hits).slice(0, 4).join(",")}`);
  }
  ok(p.length === 0, p.join(" · "));
}, "MAJOR");
await t("S-11", "layout โมดูลหอ: requireUnit · DORM · notFound · DormTabs · print:hidden (หน้าพิมพ์สัญญาไม่มีแท็บ) · หน้าแรกหน่วยมี UNIT_NAV.DORM → /dorm", () => {
  const l = stripComments(read(F.pLayout));
  const miss = ["requireUnit", "\"DORM\"", "notFound", "DormTabs"].filter((w) => !l.includes(w));
  ok(miss.length === 0, `layout ขาด ${miss.join(",")}`);
  ok(/print:hidden/.test(l + stripComments(read(F.tabsC))), "ไม่มี print:hidden");
  const u = stripComments(read(F.pUnit));
  ok(/DORM\s*:\s*\[[\s\S]{0,400}["']\/dorm["']/.test(u), "UNIT_NAV ไม่มี DORM → /dorm");
}, "MAJOR");
await t("S-12", "home/scope/policy ฝั่ง server: ไม่ import { prisma } (F5.1) · ใช้ tenantDb · ไม่มี 'use client'", () => {
  const p: string[] = [];
  for (const f of [F.home, F.scope, F.policy]) {
    const src = read(f);
    if (!src) { p.push(`${f}: ไม่มี`); continue; }
    if (/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(src)) p.push(`${f}: import prisma`);
    if (/^\s*["']use client["']/.test(src)) p.push(`${f}: use client`);
  }
  ok(p.length === 0, p.join(" · "));
  ok(/tenantDb/.test(read(F.home) + read(F.scope)), "ไม่ใช้ tenantDb");
}, "MAJOR");
await t("S-13", "facade: dorm export dormHomeModel · dormBuildingScope · loadDormPolicySettings · applyDormRolePreset · DORM_ROLE_ROWS · DORM_ROLE_COLUMNS · dormPresetPermissions · account export securityDepositHeldMany · core settings export writeViaIssues", () => {
  const miss = ["dormHomeModel", "dormBuildingScope", "loadDormPolicySettings", "applyDormRolePreset", "dormPresetPermissions"].filter((n) => typeof DM.mod?.[n] !== "function");
  for (const n of ["DORM_ROLE_ROWS", "DORM_ROLE_COLUMNS"]) if (!Array.isArray(DM.mod?.[n])) miss.push(n);
  if (typeof ACC.mod?.securityDepositHeldMany !== "function") miss.push("account.securityDepositHeldMany");
  if (typeof s?.writeViaIssues !== "function") miss.push("settings.writeViaIssues");
  ok(miss.length === 0, `ขาด ${miss.join(", ")}${DM.err ? ` (${DM.err})` : ""}`);
});
await t("S-14", "ไม่มีคำต้องห้าม สคบ. (ตัดน้ำไฟ/ล็อกห้อง/ยึดของ) ในไฟล์ใหม่ของใบนี้", () => {
  const bad = [F.home, F.scope, F.policy, F.homeShared, F.policyShared, ...CLIENT_FILES, F.pHome, F.pSettings, F.pLayout].filter((f) => FORBIDDEN.test(stripComments(read(f))));
  ok(bad.length === 0, bad.join(","));
});
await t("S-15", "(เงื่อนไขก่อน · ผู้คุมตั้งแล้ว) svc-qc-data: fai มี dorm.view + dorm.lease.manage + dorm.slip.review ไม่มี dorm.bill.run · meter = dorm.meter.read อย่างเดียว · SQC_VISUAL_SPECS d.13 (/dorm · /dorm/settings)", () => {
  const us: Any[] = SQ.SQC_USERS ?? [];
  const fai = us.find((u) => u.key === "fai"), meter = us.find((u) => u.key === "meter");
  ok(fai?.permissions?.["dorm.view"] && fai?.permissions?.["dorm.lease.manage"] && fai?.permissions?.["dorm.slip.review"] && !fai?.permissions?.["dorm.bill.run"], `fai ${fmt(fai?.permissions)}`);
  eq(Object.keys(meter?.permissions ?? {}), ["dorm.meter.read"], "meter");
  const sp = SQ.SQC_VISUAL_SPECS?.["d.13"] as Any[];
  eq(sp?.map((x) => x.path), [`/app/u/${SQ.SQC_UNITS.dorm.slug}/dorm`, `/app/u/${SQ.SQC_UNITS.dorm.slug}/dorm/settings`], "specs");
}, "MINOR");

// ═══════════════ R. ทะเบียน ═══════════════
console.log("\nR. ทะเบียน rooms · writeVia · DORM_POLICY_LAYOUT");
await t("R-1", "ทุก def rooms ใช้ editPermission \"dorm.settings.edit\" และคีย์อยู่ใน PERMISSION_KEYS (เดิม settings.rooms.edit ไม่เคยลงทะเบียน)", () => {
  const bad = listDefs("rooms").filter((d) => d.editPermission !== "dorm.settings.edit").map((d) => `${d.key}=${d.editPermission}`);
  ok(bad.length === 0, bad.slice(0, 4).join(" · "));
  ok(PERM.mod?.PERMISSION_KEYS?.has("dorm.settings.edit"), "dorm.settings.edit ไม่อยู่ใน PERMISSION_KEYS");
});
const LEGAL_KEYS = ["rooms.legal.mode", "rooms.legal.outOfScopeReason", "rooms.legal.outOfScopeEvidence"];
await t("R-2", "writeVia: 3 คีย์ rooms.legal.* มีป้ายไทยที่มี \"ค่าน้ำไฟ\" · คีย์อื่นทุกตัว (rooms/payments/messaging/booking) ไม่มี", () => {
  for (const k of LEGAL_KEYS) { const w = getDef(k)?.writeVia; ok(isThai(w) && String(w).includes("ค่าน้ำไฟ"), `${k}.writeVia=${fmt(w)}`); }
  const extra = ["rooms", "payments", "messaging", "booking"].flatMap((d) => listDefs(d)).filter((d) => d.writeVia !== undefined && !LEGAL_KEYS.includes(d.key)).map((d) => d.key);
  eq(extra, [], "คีย์อื่นที่มี writeVia");
});
await t("R-3", "writeViaIssues: คีย์ legal ⇒ 1 ข้อ code WRITE_VIA ข้อความไทยมีป้ายหน้า · คีย์ปกติ/ไม่รู้จัก ⇒ [] (positive: issueDay ผ่าน)", () => {
  const w = fnOf(s, "writeViaIssues");
  const r = w(["rooms.legal.mode", "rooms.billing.issueDay", "nope.x.y"]) as Any[];
  eq(r.map((x) => [x.key, x.code]), [["rooms.legal.mode", "WRITE_VIA"]], "ผล");
  ok(isThai(r[0].messageTh) && r[0].messageTh.includes("ค่าน้ำไฟ"), `ข้อความ ${r[0].messageTh}`);
  eq(w(["rooms.billing.issueDay"]), [], "คีย์ปกติ");
  eq((w(LEGAL_KEYS) as Any[]).length, 3, "ทั้งสามคีย์");
});
await t("R-4", "ทะเบียนปฏิเสธ writeVia ที่ไม่ใช่ข้อความไทย (defineSettings โดเมนทดสอบ throw)", async () => {
  const z = (await import("zod" as string)).z;
  for (const bad of ["", "settings page", 5]) {
    let threw = false;
    try { s.defineSettings(`qcd13${typeof bad}${String(bad).length}`, [{ key: `qcd13${typeof bad}${String(bad).length}.x.y`, domain: `qcd13${typeof bad}${String(bad).length}`, group: "x", type: "int", labelTh: "ทดสอบ", schema: z.number(), defaults: { _fallback: 1 }, chain: ["UNIT"], editPermission: "qcd13.edit", writeVia: bad }]); } catch { threw = true; }
    ok(threw, `writeVia=${fmt(bad)} ไม่ throw`);
  }
}, "MINOR");
await t("R-5", "def rooms.access.buildingAssignments: table · chain [UNIT] · ownerOnly · ค่าเริ่ม {} · schema รับ {membershipId:[buildingId]} ปฏิเสธ array/ค่าไม่ใช่สตริง · managerScope เดิมไม่เปลี่ยน (UNIT|BUILDING · ownerOnly)", () => {
  const d = getDef("rooms.access.buildingAssignments");
  ok(d, "ไม่มี def");
  eq([d.type, d.chain, d.ownerOnly === true, d.defaults._fallback, d.group], ["table", ["UNIT"], true, {}, "access"], "รูป def");
  ok(isThai(d.labelTh), "labelTh");
  ok(d.schema.safeParse({ m1: ["b1", "b2"] }).success && !d.schema.safeParse([["b1"]]).success && !d.schema.safeParse({ m1: [1] }).success && !d.schema.safeParse({ m1: "b1" }).success, "schema");
  const m = getDef("rooms.access.managerScope");
  eq([enumOptions(m.schema), m.ownerOnly], [["UNIT", "BUILDING"], true], "managerScope");
});
const LAYOUT: Any = PS.mod?.DORM_POLICY_LAYOUT;
await t("R-6", "DORM_POLICY_LAYOUT.cards: 9 การ์ด key/no/หัว/กลุ่ม ตามใบสั่ง §6.1 · segmented = [rooms.lateFee.kind] · previewTemplateKey = rooms.msg.bill", () => {
  ok(LAYOUT, `ไม่มี DORM_POLICY_LAYOUT (${PS.err})`);
  eq((LAYOUT.cards as Any[]).map((c) => [c.key, c.no]), CARDS.map((c) => [c.key, c.no]), "การ์ด");
  const p: string[] = [];
  (LAYOUT.cards as Any[]).forEach((c, i) => {
    if (!String(c.labelTh).includes(CARDS[i].head)) p.push(`หัว ${c.key}=${c.labelTh}`);
    if (!isDeepStrictEqual((c.groups as Any[]).map((g) => [g.domain, g.group]), CARDS[i].groups.map((g) => [...g]))) p.push(`กลุ่ม ${c.key}=${fmt(c.groups)}`);
  });
  ok(p.length === 0, p.join(" · "));
  eq([LAYOUT.segmented, LAYOUT.previewTemplateKey], [["rooms.lateFee.kind"], "rooms.msg.bill"], "segmented/preview");
}, "MAJOR");
await t("R-7", "ครอบคลุม: ช่อง UNIT (ไม่ซ่อน) ทุกช่องของ rooms ∪ payments ∪ messaging = การ์ด 17 ∪ กลุ่มหน้า 10 (general·legal·utility·vat·money) · ไม่ซ้อน · 17 ไม่มี rooms.legal.* · DORM_POLICY_GROUPS ครอบทุกกลุ่มการ์ด", () => {
  const all = sorted(["rooms", "payments", "messaging"].flatMap((d) => unitKeys(d)));
  const c17 = CARDS.flatMap(cardKeysExp);
  const c10 = PAGE10_GROUPS.flatMap((g) => unitKeys("rooms", g));
  eq(sorted([...c17, ...c10]), all, "ครอบ");
  eq(c17.filter((k) => c10.includes(k)), [], "ซ้อน");
  ok(!c17.some((k) => k.startsWith("rooms.legal.")), "17 มี legal");
  ok(c17.includes("rooms.access.buildingAssignments"), "การ์ด 6 ต้องมี buildingAssignments");
  const G = PS.mod?.DORM_POLICY_GROUPS as string[] | undefined;
  ok(Array.isArray(G), "ไม่มี DORM_POLICY_GROUPS");
  const miss = uniq(CARDS.flatMap((c) => c.groups.map(([, g]) => g))).filter((g) => !G!.includes(g));
  ok(miss.length === 0 && !G!.some((g) => PAGE10_GROUPS.includes(g)), `ขาด ${miss.join(",")} / มีกลุ่มหน้า 10 ${fmt(G)}`);
});
await t("R-8", "DORM_MSG_VAR_LABEL_TH: ป้ายไทยครบทุก templateVars ของ def rooms.msg.*", () => {
  const L = PS.mod?.DORM_MSG_VAR_LABEL_TH as Record<string, string> | undefined;
  ok(L, "ไม่มี");
  const vars = uniq(listDefs("rooms").filter((d) => d.group === "msg").flatMap((d) => (d.templateVars ?? []) as string[]));
  const bad = vars.filter((v) => !isThai(L![v]));
  ok(vars.length >= 10 && bad.length === 0, `ขาด ${bad.join(",")}`);
}, "MAJOR");

// ═══════════════ K. สิทธิ์ pure ═══════════════
console.log("\nK. คีย์สิทธิ์หอ · ตารางบทบาท · dormAccess · แท็บ");
await t("K-1", "permissions.ts: คีย์หอ CC §8 ครบ 16 (เดิม 4 + ใหม่ 12) อยู่ในโมดูล dorm พร้อมป้ายไทย · dorm.settings.legal ป้ายมี \"เจ้าของ\"", () => {
  const P: Any[] = PERM.mod?.PERMISSIONS ?? [];
  const p: string[] = [];
  for (const k of [...DORM_OLD_KEYS, ...DORM_NEW_KEYS]) { const d = P.find((x) => x.key === k); if (!d || d.module !== "dorm" || !isThai(d.label)) p.push(k); }
  ok(p.length === 0, `ขาด/ป้ายผิด ${p.join(",")}`);
  ok(String(P.find((x) => x.key === "dorm.settings.legal")?.label).includes("เจ้าของ"), "ป้าย settings.legal");
});
await t("K-2", "planned ⊆ {import · latefee.waive · moveout.manage · deposit.deduct.approve · repair.manage · announce · parcel.manage · settings.legal} · คีย์หอที่ไม่ planned มีโค้ดเรียกจริงใน src/ (นอก permissions.ts)", () => {
  const P: Any[] = (PERM.mod?.PERMISSIONS ?? []).filter((x: Any) => x.module === "dorm");
  const planned = P.filter((x) => x.planned).map((x) => x.key);
  const off = planned.filter((k: string) => !PLANNED_OK.includes(k));
  ok(off.length === 0, `planned เกิน ${off.join(",")}`);
  const corpus = srcFiles("src").filter((f) => f !== F.perms).map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n");
  const unused = P.filter((x) => !x.planned).map((x) => x.key as string).filter((k) => !corpus.includes(`"${k}"`) && !corpus.includes(`'${k}'`));
  ok(unused.length === 0, `ไม่ planned แต่ไม่มีโค้ดเรียก: ${unused.join(",")}`);
}, "MAJOR");
await t("K-3", "DORM_ROLE_COLUMNS 4 (เจ้าของ·ผู้ดูแล·ช่าง·บัญชี) · DORM_ROLE_ROWS 11 แถว id/ป้าย/คีย์/เซลล์ ตรงใบสั่ง §5.2 (6 แถวแรกเรียงตามภาพ 17)", () => {
  const cols = DM.mod?.DORM_ROLE_COLUMNS as Any[];
  eq(cols?.map((c) => [c.role, c.labelTh]), ROLE_COLS.map((c) => [...c]), "คอลัมน์");
  const rows = DM.mod?.DORM_ROLE_ROWS as Any[];
  ok(Array.isArray(rows), "ไม่มี DORM_ROLE_ROWS");
  eq(rows.map((r) => r.id), ROLE_ROWS.map((r) => r.id), "id แถว");
  const p: string[] = [];
  rows.forEach((r, i) => {
    const w = ROLE_ROWS[i];
    if (!String(r.labelTh).includes(w.label)) p.push(`${r.id} ป้าย ${r.labelTh}`);
    if (!isDeepStrictEqual(sorted(r.keys), sorted(w.keys))) p.push(`${r.id} keys ${fmt(r.keys)}`);
    if (!isDeepStrictEqual(ROLE_COLS.map((c) => r.cells?.[c[0]]), w.cells)) p.push(`${r.id} cells ${fmt(r.cells)}`);
  });
  ok(p.length === 0, p.join(" · "));
});
await t("K-4", "dormPresetPermissions: ทุกคีย์ของทุกแถว · YES = true · NO/REQUEST = false · ช่างไม่มีคีย์เงิน/dorm.view (คนจดมิเตอร์ไม่เห็นเงิน) · ผู้ดูแลไม่มี settings.legal/deposit.deduct.approve/latefee.waive", () => {
  const f = dm("dormPresetPermissions");
  for (const r of ["CARETAKER", "TECH", "ACCOUNTANT"] as const) eq(f(r), presetExp(r), r);
  const tech = f("TECH");
  ok([...MONEY_KEYS, "dorm.view"].every((k) => tech[k] === false), "ช่างได้คีย์เงิน/view");
  const care = f("CARETAKER");
  ok(["dorm.settings.legal", "dorm.deposit.deduct.approve", "dorm.latefee.waive"].every((k) => care[k] === false), "ผู้ดูแลได้คีย์ที่ต้องขออนุมัติ");
});
await t("K-5", "dormAccess: เดิม board/meter ไม่เปลี่ยน + money (bill.run|bill.send|slip.review|payment.manual) · lease · settings · คนจดมิเตอร์ money/board false · dorm.view อย่างเดียว money false · dorm.* ครบ · MANAGER หน่วยอื่น false", () => {
  const a = (perms: Record<string, boolean>, role = "STAFF", ua = ["u1"]) => dm("dormAccess")({ role, unitAccess: ua, permissions: perms }, "u1");
  const m = a({ "dorm.meter.read": true });
  eq([m.board, m.meter, m.money, m.lease, m.settings], [false, true, false, false, false], "meter");
  eq([a({ "dorm.view": true }).money, a({ "dorm.view": true }).board], [false, true], "view");
  for (const k of MONEY_KEYS) ok(a({ [k]: true }).money === true, `money ${k}`);
  eq([a({ "dorm.lease.manage": true }).lease, a({ "dorm.settings.edit": true }).settings], [true, true], "lease/settings");
  const all = a({ "dorm.*": true });
  ok(all.board && all.meter && all.money && all.lease && all.settings, "dorm.*");
  const mg = a({}, "MANAGER", ["u2"]);
  ok(!mg.board && !mg.money && !mg.meter, "MANAGER หน่วยอื่น");
  ok(a({}, "OWNER", []).money, "OWNER");
});
await t("K-6", "dormTabsFor: คนจดมิเตอร์ = [meter] · view อย่างเดียว = [board, settings] · fai (view+lease) = [board, tenants, settings] · ครบ = board · tenants · meter · settings · href ใต้ base", () => {
  const f = fnOf(HS.mod, "dormTabsFor", HS.err);
  const base = "/app/u/x";
  const keys = (acc: Any) => (f(acc, base) as Any[]).map((x) => x.key);
  eq(keys({ board: false, meter: true, leaseView: false }), ["meter"], "meter");
  eq(keys({ board: true, meter: false, leaseView: false }), ["board", "settings"], "view");
  eq(keys({ board: true, meter: false, leaseView: true }), ["board", "tenants", "settings"], "fai");
  const allT = f({ board: true, meter: true, leaseView: true }, base) as Any[];
  eq(allT.map((x) => [x.key, x.href]), [["board", `${base}/dorm`], ["tenants", `${base}/dorm/tenants`], ["meter", `${base}/dorm/meter`], ["settings", `${base}/dorm/settings`]], "ครบ");
  ok(allT.every((x) => isThai(x.labelTh)), "ป้ายไทย");
}, "MAJOR");
await t("K-7", "วันที่ไทย (pure · ไม่ใช้ getDay ดิบ): thaiMonthShort(\"2026-10\") = ต.ค. · thaiShortDate(\"2026-11-15\") = 15 พ.ย.", () => {
  eq([fnOf(HS.mod, "thaiMonthShort")("2026-10"), fnOf(HS.mod, "thaiShortDate")("2026-11-15"), fnOf(HS.mod, "thaiShortDate")("2026-01-05")], ["ต.ค.", "15 พ.ย.", "5 ม.ค."], "ผล");
  ok(!/\.get(Day|Date|Month)\s*\(/.test(stripComments(read(F.homeShared))), "ใช้ getDay/getDate/getMonth ดิบ");
}, "MINOR");

// ═══════════════ ฐานข้อมูล ═══════════════
const dbMod = await tryImport("@/lib/core/db");
if (!dbMod.mod) { console.error(`🔴 ${LABEL}: โหลด @/lib/core/db ไม่ได้ — ${dbMod.err}`); process.exit(4); }
const db: Any = dbMod.mod.prisma;
const PRISMA_NS: Any = (await import("@prisma/client" as string)).Prisma;
const DMMF_MODELS: { name: string; fields: { name: string; kind: string }[] }[] = PRISMA_NS?.dmmf?.datamodel?.models ?? [];
const delegate = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);
const TENANT_MODELS = DMMF_MODELS.filter((m) => m.fields.some((f) => f.name === "tenantId" && f.kind === "scalar")).map((m) => m.name).filter((n) => n !== "Tenant");
const SLUG = "svc-d13-";
const MAIL = "svc-d13-";
const tenantIds: string[] = [];
async function cleanup(ids: string[]) {
  if (ids.length) {
    for (let pass = 0; pass < 5; pass++) {
      for (const m of TENANT_MODELS) { try { await db[delegate(m)].deleteMany({ where: { tenantId: { in: ids } } }); } catch { /* FK — รอบถัดไป */ } }
    }
    try { await db.tenant.deleteMany({ where: { id: { in: ids } } }); } catch (e) { console.log(`  ⚠️ ลบ tenant: ${errMsg(e)}`); }
  }
  try { await db.user.deleteMany({ where: { email: { startsWith: MAIL } } }); } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}
async function leftovers(ids: string[]): Promise<{ table: string; n: number }[]> {
  const out: { table: string; n: number }[] = [];
  if (!ids.length) return out;
  for (const m of TENANT_MODELS) { try { const n = await db[delegate(m)].count({ where: { tenantId: { in: ids } } }); if (n) out.push({ table: m, n }); } catch { /* ไม่มีตาราง */ } }
  return out;
}
try {
  const stale = (await db.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } })) as { id: string }[];
  if (stale.length) console.log(`\n(กวาด tenant ค้าง ${stale.length})`);
  await cleanup(stale.map((r) => r.id));
} catch (e) { console.log(`  ⚠️ กวาดของค้าง: ${errMsg(e)}`); }

const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const RUN = uid();
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string; membershipId?: string };
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const bkkToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
let pendingG = false;

try {
  // ═══════════════ ฉาก ═══════════════
  const mkTenant = async (name: string) => { const r = await db.tenant.create({ data: { name, slug: `${SLUG}${uid()}` } }); tenantIds.push(r.id); return r.id as string; };
  const tA = await mkTenant("QC D.13 ร้าน A");
  const tB = await mkTenant("QC D.13 ร้าน B");
  const ctxA = { tenantId: tA };
  const ctxB = { tenantId: tB };
  const mkUnit = async (tenantId: string, type: string, name: string) => (await db.businessUnit.create({ data: { tenantId, type, name, slug: `u-${uid()}` } })).id as string;
  const UD = await mkUnit(tA, "DORM", "บ้านสวนทดสอบ D13");
  const UX = await mkUnit(tA, "DORM", "หอสองอาคาร D13");
  const UE = await mkUnit(tA, "DORM", "หอไม่มีรอบบิล D13");
  const UH = await mkUnit(tA, "HOTEL", "โรงแรม D13");
  const UDB = await mkUnit(tB, "DORM", "หอร้าน B D13");
  const unitSlugOf = async (id: string) => (await db.businessUnit.findFirst({ where: { id }, select: { slug: true } })).slug as string;
  const mkBld = async (tenantId: string, unitId: string, name: string) => (await db.roomBuilding.create({ data: { tenantId, unitId, name, floors: 3, sortOrder: 1 } })).id as string;
  const mkType = async (tenantId: string, unitId: string, name: string, monthly: number) =>
    (await db.hotelRoomType.create({ data: { tenantId, unitId, name, rentMode: "MONTHLY", baseRateSatang: 0, monthlyRateSatang: monthly } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, number: string, roomTypeId: string, buildingId: string | null, floorNo: number | null) =>
    (await db.hotelRoom.create({ data: { tenantId, unitId, number, roomTypeId, buildingId, floorNo } })).id as string;
  const mkOcc = async (tenantId: string, unitId: string, roomId: string, start: string, end: string, kind = "LEASE", refType = "DormLease", refId = `qc-${uid()}`) =>
    (await db.roomOccupancy.create({ data: { tenantId, unitId, roomId, startDate: dbDate(start), endDate: dbDate(end), kind, refType, refId } })).id as string;
  const mkParty = async (tenantId: string, name: string, phone: string) => (await db.party.create({ data: { tenantId, kind: "PERSON", name, phone, phoneNorm: phone } })).id as string;
  const mkLease = async (x: { tenantId: string; unitId: string; roomId: string; partyId: string; status: string; start: string; end: string; occupancyId: string | null; deposit?: number }) =>
    (await db.dormLease.create({ data: { tenantId: x.tenantId, unitId: x.unitId, roomId: x.roomId, partyId: x.partyId, status: x.status, startDate: dbDate(x.start), endDate: dbDate(x.end), rentSatang: 450000, commonFeeSatang: 30000, depositSatang: x.deposit ?? 900000, occupancyId: x.occupancyId, createdById: "QcD13" } })).id as string;
  const mkRun = async (tenantId: string, unitId: string, periodKey: string, sentAt: string, dueDate: string) =>
    (await db.dormBillRun.create({ data: { tenantId, unitId, periodKey, status: "SENT", sentAt: new Date(`${sentAt}T10:00:00+07:00`), dueDate: dbDate(dueDate), issueDate: dbDate(sentAt) } })).id as string;
  const mkBill = async (x: { tenantId: string; unitId: string; runId: string; leaseId: string; roomId: string; partyId: string; periodKey: string; status: string; total: number; paid: number; due: string }) =>
    (await db.dormBill.create({ data: { tenantId: x.tenantId, unitId: x.unitId, runId: x.runId, leaseId: x.leaseId, roomId: x.roomId, partyId: x.partyId, periodKey: x.periodKey, status: x.status, lines: [], subtotalSatang: x.total, totalSatang: x.total, paidSatang: x.paid, dueDate: dbDate(x.due), ...(x.status === "PAID" ? { paidAt: new Date(`${x.due}T09:00:00+07:00`) } : {}) } })).id as string;
  let slipN = 0;
  const mkSlip = async (tenantId: string, unitId: string, billId: string, expected: number, status: string) =>
    db.paymentSlip.create({ data: { tenantId, unitId, domain: "DORM", refType: "DORM_BILL", refId: billId, fileId: `qc-d13-file-${RUN}-${++slipN}`, imageHash: randomBytes(16).toString("hex"), expectedSatang: expected, amountSatang: expected, checks: { idempotencyKey: `qc-d13-${RUN}-${slipN}` }, status } });
  const mkRepair = async (tenantId: string, unitId: string, roomId: string, category: string, text: string, status = "OPEN") => db.dormRepair.create({ data: { tenantId, unitId, roomId, category, text, status } });

  const mkMember = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown> = {}): Promise<Actor> => {
    const id = `svc-d13-${tag}-${RUN}`;
    await db.user.create({ data: { id, email: `${MAIL}${tag}-${RUN}@qc.invalid`, name: `QC d13 ${tag}` } });
    const mb = await db.membership.create({ data: { userId: id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id, membershipId: mb.id };
  };
  const OWNER = await mkMember("owner", tA, "OWNER", ["*"]);
  const MGR = await mkMember("mgr", tA, "MANAGER", [UD, UX, UE]);
  const FAI = await mkMember("fai", tA, "STAFF", [UD, UX], { "dorm.view": true, "dorm.lease.manage": true, "dorm.slip.review": true });
  const VIEW = await mkMember("view", tA, "STAFF", [UD, UE], { "dorm.view": true });
  const METER = await mkMember("meter", tA, "STAFF", [UD], { "dorm.meter.read": true });
  const SEDIT = await mkMember("sedit", tA, "STAFF", [UD], { "dorm.view": true, "dorm.settings.edit": true });
  const CARE_A = await mkMember("care-a", tA, "STAFF", [UX], { "dorm.view": true, "dorm.lease.manage": true, "dorm.slip.review": true });
  const CARE_NONE = await mkMember("care-none", tA, "STAFF", [UX], { "dorm.view": true, "dorm.lease.manage": true, "dorm.slip.review": true });
  const MGR_X = await mkMember("mgr-x", tA, "MANAGER", [UX]);
  const TARGET = await mkMember("target", tA, "STAFF", [UD], { "dorm.view": true });
  const OWNER_B = await mkMember("owner-b", tB, "OWNER", ["*"]);
  const OTHER_B = await mkMember("staff-b", tB, "STAFF", [UDB], { "dorm.view": true });

  const setS = (a: Actor, ch: Any[], ctx: Any = ctxA) => fnOf(s, "setSettings")(a, ctx, ch);
  const HOME = (a: Actor, q: Any, ctx: Any = ctxA): Promise<Any> => dm("dormHomeModel")(a, ctx, q);
  const POLM = (a: Actor, q: Any, ctx: Any = ctxA): Promise<Any> => dm("loadDormPolicySettings")(a, ctx, q);
  const D = R.date as string;

  // ── หน่วย UD = ฉาก README 3 พ.ย. ──
  const bldA = await mkBld(tA, UD, "อาคาร A");
  const rtStd = await mkType(tA, UD, "ห้องมาตรฐาน", 450000);
  const rtLarge = await mkType(tA, UD, "ห้องใหญ่ (หัวมุม)", 520000);
  const room: Record<string, string> = {};
  for (const r of SQ.SQC_DORM_ROOMS as Any[]) room[r.number] = await mkRoom(tA, UD, r.number, r.typeId === SQ.SQC_DORM_TYPES.large.id ? rtLarge : rtStd, bldA, r.floorNo);
  const NAMES: Record<string, string> = { "204": "ณัฐชา ใจดี", "106": "วิชัย มั่นคง", "305": "สุดารัตน์ แก้วใส", "104": "ปวีณา ทองแท้", "309": "เมธี สุขสันต์" };
  const party: Record<string, string> = {};
  const lease: Record<string, string> = {};
  for (const [i, n] of NOV_ROOMS.entries()) {
    party[n] = await mkParty(tA, NAMES[n] ?? `ผู้เช่า${n} ทดสอบ`, `08${String(70000000 + i).padStart(8, "0")}`);
    const end = SCN.expiring[n] ?? "2027-05-31";
    const occ = await mkOcc(tA, UD, room[n], "2026-06-01", addDays(end, 1));
    lease[n] = await mkLease({ tenantId: tA, unitId: UD, roomId: room[n], partyId: party[n], status: "ACTIVE", start: "2026-06-01", end, occupancyId: occ });
  }
  const pastStart: Record<string, string> = { "108": "2026-03-01", "210": "2026-04-01", "311": "2026-05-01" };
  for (const [n, since] of Object.entries(SCN.vacantSince as Record<string, string>)) await mkOcc(tA, UD, room[n], pastStart[n], since, "LEASE", "QcPast");
  const p207old = await mkParty(tA, "ธนพล เดิม", "0879990207");
  const occ207old = await mkOcc(tA, UD, room["207"], "2026-02-01", SCN.moveIn.oldOccEnd);
  const l207old = await mkLease({ tenantId: tA, unitId: UD, roomId: room["207"], partyId: p207old, status: "ENDED", start: "2026-02-01", end: "2026-10-31", occupancyId: occ207old });
  const p207 = await mkParty(tA, SCN.moveIn.tenant, "0879990208");
  const occ207 = await mkOcc(tA, UD, room["207"], SCN.moveIn.start, "2027-11-15");
  await mkLease({ tenantId: tA, unitId: UD, roomId: room["207"], partyId: p207, status: "DRAFT", start: SCN.moveIn.start, end: "2027-11-14", occupancyId: occ207 });
  await mkOcc(tA, UD, room[SCN.repairBlock.room], SCN.repairBlock.start, SCN.repairBlock.end, "BLOCK", "QcRepair");
  const runNov = await mkRun(tA, UD, R.period, R.sentAt, R.dueDate);
  const runOct = await mkRun(tA, UD, R.prevPeriod, "2026-09-26", R.prevDueDate);
  const bill: Record<string, string> = {};
  for (const n of NOV_ROOMS) {
    const paid = PAID_ROOMS.includes(n);
    bill[n] = await mkBill({ tenantId: tA, unitId: UD, runId: runNov, leaseId: lease[n], roomId: room[n], partyId: party[n], periodKey: R.period, status: paid ? "PAID" : "SENT", total: SCN.bills[n], paid: paid ? SCN.bills[n] : 0, due: R.dueDate });
  }
  await mkBill({ tenantId: tA, unitId: UD, runId: runNov, leaseId: l207old, roomId: room["207"], partyId: p207old, periodKey: R.period, status: "VOID", total: 100000, paid: 0, due: R.dueDate }); // ไม่นับ (VOID)
  for (const [n, amt] of Object.entries(SCN.prevUnpaid as Record<string, number>)) await mkBill({ tenantId: tA, unitId: UD, runId: runOct, leaseId: lease[n], roomId: room[n], partyId: party[n], periodKey: R.prevPeriod, status: "SENT", total: amt, paid: 0, due: R.prevDueDate });
  await mkBill({ tenantId: tA, unitId: UD, runId: runOct, leaseId: lease["204"], roomId: room["204"], partyId: party["204"], periodKey: R.prevPeriod, status: "PAID", total: 548600, paid: 548600, due: R.prevDueDate }); // ต.ค. จ่ายแล้ว ไม่ค้าง
  for (const [i, n] of (SCN.slipPending as string[]).entries()) await mkSlip(tA, UD, bill[n], SCN.bills[n], i === 2 ? "PENDING" : "NEEDS_REVIEW");
  await mkSlip(tA, UD, bill["211"], SCN.bills["211"], "REJECTED"); // ปฏิเสธแล้ว ⇒ ยังเป็น "ยังไม่จ่าย"
  for (const r of SCN.repairsOpen as Any[]) await mkRepair(tA, UD, room[r.room], r.category, r.text);
  await mkRepair(tA, UD, room["101"], "OTHER", "งานเก่าเสร็จแล้ว", "DONE");

  // ── หน่วย UX = สองอาคาร (#64) ──
  const bXA = await mkBld(tA, UX, "อาคาร XA");
  const bXB = await mkBld(tA, UX, "อาคาร XB");
  const rtX = await mkType(tA, UX, "ห้อง X", 450000);
  const XR: Record<string, string> = {
    XA1: await mkRoom(tA, UX, "XA1", rtX, bXA, 1), XA2: await mkRoom(tA, UX, "XA2", rtX, bXA, 1),
    XB1: await mkRoom(tA, UX, "XB1", rtX, bXB, 1), XB2: await mkRoom(tA, UX, "XB2", rtX, bXB, 1), XN1: await mkRoom(tA, UX, "XN1", rtX, null, null),
  };
  const pXA = await mkParty(tA, "อาทิตย์ เอสาม", "0861110001");
  const pXB = await mkParty(tA, "บุษบา บีสาม", "0861110002");
  const oXA = await mkOcc(tA, UX, XR.XA1, "2026-06-01", "2027-06-01");
  const oXB = await mkOcc(tA, UX, XR.XB1, "2026-06-01", "2027-06-01");
  const lXA = await mkLease({ tenantId: tA, unitId: UX, roomId: XR.XA1, partyId: pXA, status: "ACTIVE", start: "2026-06-01", end: "2027-05-31", occupancyId: oXA, deposit: 900000 });
  const lXB = await mkLease({ tenantId: tA, unitId: UX, roomId: XR.XB1, partyId: pXB, status: "ACTIVE", start: "2026-06-01", end: "2027-05-31", occupancyId: oXB, deposit: 1040000 });
  const rXN = await mkRun(tA, UX, R.period, R.sentAt, R.dueDate);
  const rXO = await mkRun(tA, UX, R.prevPeriod, "2026-09-26", R.prevDueDate);
  await mkBill({ tenantId: tA, unitId: UX, runId: rXN, leaseId: lXA, roomId: XR.XA1, partyId: pXA, periodKey: R.period, status: "SENT", total: 500000, paid: 0, due: R.dueDate });
  await mkBill({ tenantId: tA, unitId: UX, runId: rXN, leaseId: lXB, roomId: XR.XB1, partyId: pXB, periodKey: R.period, status: "PAID", total: 600000, paid: 600000, due: R.dueDate });
  await mkBill({ tenantId: tA, unitId: UX, runId: rXO, leaseId: lXB, roomId: XR.XB1, partyId: pXB, periodKey: R.prevPeriod, status: "SENT", total: 333300, paid: 0, due: R.prevDueDate });
  await mkRepair(tA, UX, XR.XB1, "DOOR_LOCK", "ประตูXBพัง");
  // ── หน่วย UE (ไม่มีรอบบิล) · หน่วยร้าน B ──
  const rtE = await mkType(tA, UE, "ห้อง E", 450000);
  await mkRoom(tA, UE, "E1", rtE, null, 1);
  const rtB = await mkType(tB, UDB, "ห้อง B", 450000);
  const roomB = await mkRoom(tB, UDB, "B1", rtB, null, 1);

  const XB_LEAK = ["XB1", "XB2", XR.XB1, XR.XB2, "บุษบา", "ประตูXB", "600000", "333300", lXB, bXB];
  const slugD = await unitSlugOf(UD);

  // ── ค่าตั้ง ──
  let seeded = false;
  await t("PC-3", "ฉากบนฐาน (ก่อนทำ): roomBoard 3 พ.ย. = LEASE 31 · 302 BLOCKED · 207 ว่าง + next LEASE 15 พ.ย. · 31 ต.ค. มีผู้เช่า 32 · แม่แบบ APARTMENT + 4 ค่าหน้า 17 บันทึกผ่านเครื่องยนต์ได้", async () => {
    const rb = fnOf(ROOMS.mod, "roomBoard");
    const cells = (await rb(ctxA, { unitId: UD, date: D })) as Any[];
    eq(cells.length, 36, "ห้อง");
    eq(cells.filter((c) => c.use === "LEASED").length, 31, "LEASED 3 พ.ย.");
    const c207 = cells.find((c) => c.number === "207");
    eq([c207?.use, c207?.next?.startDate], ["VACANT", SCN.moveIn.start], "207");
    eq(cells.find((c) => c.number === "302")?.use, "BLOCKED", "302");
    eq(((await rb(ctxA, { unitId: UD, date: "2026-10-31" })) as Any[]).filter((c) => c.use === "LEASED").length, 32, "LEASED 31 ต.ค.");
    ok((await fnOf(s, "applyTemplate")(OWNER, ctxA, { unitId: UD, domain: "rooms", templateKey: POL.template, overwrite: "KEEP_CUSTOM" }))?.ok, "applyTemplate");
    const r1 = await setS(OWNER, POL.unitDiffs.map((d: Any) => ({ key: d.key, scope: "UNIT", scopeId: UD, value: d.value })));
    ok(r1?.ok, `ค่า 17 ${fmt(r1)}`);
    seeded = true;
  });
  const needSeed = () => { if (!seeded) throw new AssertFail("ฉาก PC-3 ไม่ผ่าน"); };
  let scoped = false;
  await t("B-0", "ตั้งขอบเขตอาคารของหน่วย UX ผ่านเครื่องยนต์ (เจ้าของ): managerScope = BUILDING · buildingAssignments {ผู้ดูแล A: [XA], ผู้จัดการ X: [XB]} ⇒ ok", async () => {
    needSeed();
    const r2 = await setS(OWNER, [
      { key: "rooms.access.managerScope", scope: "UNIT", scopeId: UX, value: "BUILDING" },
      { key: "rooms.access.buildingAssignments", scope: "UNIT", scopeId: UX, value: { [CARE_A.membershipId!]: [bXA], [MGR_X.membershipId!]: [bXB] } },
    ]);
    ok(r2?.ok, `ขอบเขตอาคาร ${fmt(r2)} (ต้องมี def rooms.access.buildingAssignments)`);
    scoped = true;
  });
  const needScope = () => { needSeed(); if (!scoped) throw new AssertFail("ตั้งขอบเขตอาคาร B-0 ไม่ผ่าน"); };

  // ═══════════════ D. หน้า 01 ═══════════════
  console.log("\nD. โมเดลหน้า 01 = ฉาก README 3 พ.ย. (เจ้าของ)");
  let homeO: Any = null;
  try { homeO = seeded ? await HOME(OWNER, { unitId: UD, date: D }) : null; } catch (e) { console.log(`  (dormHomeModel throw: ${errMsg(e)})`); }
  const needHome = () => { needSeed(); ok(homeO, "dormHomeModel ได้ null/throw หรือยังไม่มี"); };
  await t("D-1", "ห้องทั้งหมด 36 · 3 ชั้น · ประเภท 30/6 (มาก→น้อย) · basePath /app/u/<slug>/dorm · money true · scope ทั้งหน่วย · date = 2026-11-03", () => {
    needHome();
    eq([homeO.kpi.rooms.total, homeO.kpi.rooms.floors, homeO.kpi.rooms.byType.map((x: Any) => [x.name, x.count])], [36, 3, [["ห้องมาตรฐาน", 30], ["ห้องใหญ่ (หัวมุม)", 6]]], "rooms");
    eq([homeO.basePath, homeO.money, homeO.scope?.all, homeO.date, homeO.cells.length], [`/app/u/${slugD}/dorm`, true, true, D, 36], "หัวโมเดล");
  });
  await t("D-2", "มีผู้เช่า 31 · 86% · เดือนก่อน (31 ต.ค.) 32 · 89%", () => {
    needHome();
    eq(homeO.kpi.occupied, { count: EXP.occupied, pct: EXP.occupiedPct, prevMonthCount: EXP.prevMonthCount, prevMonthPct: EXP.prevMonthPct }, "occupied");
  });
  await t("D-3", "ว่าง·จอง·ซ่อม = 3·1·1 · ว่างนานสุด 108 = 34 วัน", () => {
    needHome();
    eq([homeO.kpi.vacant, homeO.kpi.booked, homeO.kpi.repair, homeO.kpi.longestVacant], [EXP.vacant, EXP.booked, EXP.repair, EXP.longestVacant], "vacancy");
  });
  await t("D-4", "รอบบิล พ.ย.: ส่ง 26 ต.ค. · 31 บิล (VOID ไม่นับ) · จ่าย 24 · สลิปรอตรวจ 3 (REJECTED ไม่นับ) · ยังไม่จ่าย 4 · ยอดรอบ ฿174,126.40 · รับแล้ว ฿133,912.80 · รอเก็บ ฿40,213.60", () => {
    needHome();
    const b = homeO.billing;
    eq([b?.periodKey, b?.status, b?.sentAt, b?.billCount, b?.paid, b?.slipPending, b?.unpaid, b?.held, b?.draft], [R.period, "SENT", R.sentAt, EXP.billCount, EXP.paid, EXP.slipPending, EXP.unpaid, 0, 0], "นับ");
    eq([b?.totalSatang, b?.collectedSatang, b?.outstandingSatang], [EXP.totalSatang, EXP.collectedSatang, EXP.outstandingSatang], "เงิน");
  });
  await t("D-5", "KPI เงิน: บิล พ.ย. รับแล้ว ฿133,912.80 (24 จาก 31 · ครบกำหนด 5 พ.ย.) · ค้างเดือนก่อน ฿10,200.40 (106 · 305 · เลยกำหนด 29 วัน)", () => {
    needHome();
    eq(homeO.kpi.collected, { satang: EXP.collectedSatang, paidBills: EXP.paid, billCount: EXP.billCount, dueDate: R.dueDate, periodKey: R.period }, "collected");
    eq(homeO.kpi.overdue, { satang: EXP.overdueSatang, rooms: EXP.overdueRooms, maxDaysLate: EXP.overdueMaxDaysLate }, "overdue");
  });
  await t("D-6", "ป้ายเงินต่อห้อง: 106/305 overdue \"ค้าง ต.ค. ฿5,214\"/\"฿4,986\" (ชนะบิล พ.ย.) · 104/206/309 pending \"สลิปรอตรวจ\" · 211/310 unpaid \"พ.ย. ยังไม่จ่าย\" · 204 paid \"พ.ย. จ่ายแล้ว\" · ห้องไม่มีบิลไม่มีป้าย · รวม 31 ห้อง", () => {
    needHome();
    const fin = homeO.finance as Record<string, Any>;
    const f = (n: string) => fin[room[n]];
    eq([f("106"), f("305")], [{ tone: "overdue", text: "ค้าง ต.ค. ฿5,214" }, { tone: "overdue", text: "ค้าง ต.ค. ฿4,986" }], "overdue");
    for (const n of SCN.slipPending) eq(f(n), { tone: "pending", text: "สลิปรอตรวจ" }, n);
    for (const n of ["211", "310"]) eq(f(n), { tone: "unpaid", text: "พ.ย. ยังไม่จ่าย" }, n);
    eq(f("204"), { tone: "paid", text: "พ.ย. จ่ายแล้ว" }, "204");
    for (const n of ["108", "210", "311", "302", "207"]) ok(!(room[n] in fin), `${n} มีป้าย`);
    eq(Object.keys(fin).length, 31, "จำนวนป้าย");
  });
  await t("D-7", "ชื่อบนผัง = ชื่อแรก: 204 ณัฐชา · 106 วิชัย · 207 \"เบญจา (ใหม่)\" · ห้องว่างไม่มี · ไม่มีนามสกุล/เบอร์ในโมเดลทั้งก้อน", () => {
    needHome();
    const L = homeO.occupantLabels as Record<string, string>;
    eq([L[room["204"]], L[room["106"]], L[room["207"]], room["108"] in L], ["ณัฐชา", "วิชัย", "เบญจา (ใหม่)", false], "labels");
    const js = JSON.stringify(homeO);
    for (const x of ["ใจดี", "มั่นคง", "คำแก้ว", "0870000", "087999"]) ok(!js.includes(x), `หลุด ${x}`);
  });
  await t("D-8", "ต้องทำวันนี้: ลำดับ overdue(2) · slips(3) · repairs(2 OPEN) · moveIns(1) · expiring(3) · ข้อความมีห้อง/ยอด/วัน · href ใต้ basePath", () => {
    needHome();
    const td = homeO.todo as Any[];
    eq(td.map((x) => [x.kind, x.count]), [["overdue", 2], ["slips", 3], ["repairs", 2], ["moveIns", 1], ["expiring", 3]], "รายการ");
    const txt = (k: string) => String(td.find((x) => x.kind === k)?.textTh ?? "");
    const need: [string, string[]][] = [["overdue", ["106", "305", "วิชัย", "฿5,214.00", "฿4,986.40", "29 วัน"]], ["slips", ["104", "206", "309"]], ["repairs", ["302", "204", "แอร์รั่ว"]], ["moveIns", ["207", "เบญจา", "15 พ.ย."]], ["expiring", ["103", "209", "310"]]];
    const p = need.flatMap(([k, ws]) => ws.filter((w) => !txt(k).includes(w)).map((w) => `${k}:${w}`));
    ok(p.length === 0, `ข้อความขาด ${p.join(",")}`);
    ok(td.every((x) => typeof x.href === "string" && x.href.startsWith(homeO.basePath)), `href ${fmt(td.map((x) => x.href))}`);
  });
  await t("D-9", "ไม่ส่ง date ⇒ ใช้วันนี้ไทย (ไม่ throw)", async () => {
    needSeed();
    const m = await HOME(OWNER, { unitId: UD });
    eq(m?.date, bkkToday(), "date");
  }, "MAJOR");
  await t("D-10", "ส่ง cells มา: ตัดช่องที่ไม่ใช่ห้องของหน่วย (ปลอมห้องจาก UX/ร้าน B) ทิ้ง · ได้ 36 ห้องเดิม", async () => {
    needSeed();
    const rb = fnOf(ROOMS.mod, "roomBoard");
    const cells = [...(await rb(ctxA, { unitId: UD, date: D })), ...(await rb(ctxA, { unitId: UX, date: D })), { ...(await rb(ctxA, { unitId: UD, date: D }))[0], roomId: roomB, number: "B1" }];
    const m = await HOME(OWNER, { unitId: UD, date: D, cells });
    eq(sorted((m?.cells as Any[]).map((c) => c.roomId)), sorted(Object.values(room)), "cells");
  });
  await t("D-11", "โมเดลไม่มีคำต้องห้าม สคบ. · ไม่มีอีเมล", () => {
    needHome();
    const js = JSON.stringify(homeO);
    ok(!FORBIDDEN.test(js) && !js.includes("@qc.invalid"), "พบคำต้องห้าม/อีเมล");
  }, "MAJOR");

  // ═══════════════ M. ไม่เห็นเงิน ═══════════════
  console.log("\nM. คนไม่เห็นเงิน · คนจดมิเตอร์ · Membership สด");
  await t("M-1", "dorm.view อย่างเดียว: money false · finance {} · collected/overdue/billing null · todo = repairs·moveIns·expiring · ไม่มี \"฿\"/ยอดเงินในโมเดล (ห้อง/KPI ห้องยังครบ)", async () => {
    needSeed();
    const m = await HOME(VIEW, { unitId: UD, date: D });
    ok(m, "ได้ null");
    eq([m.money, m.finance, m.kpi.collected, m.kpi.overdue, m.billing, m.kpi.rooms.total, m.kpi.occupied.count], [false, {}, null, null, null, 36, 31], "รูป");
    eq((m.todo as Any[]).map((x) => x.kind), ["repairs", "moveIns", "expiring"], "todo");
    const js = JSON.stringify(m);
    for (const x of ["฿", "13391280", "521400", "548600", "17412640"]) ok(!js.includes(x), `หลุด ${x}`);
  });
  await t("M-2", "คนจดมิเตอร์ (dorm.meter.read): dormHomeModel null · หน้า 17 null · listLeases ว่าง · dormLawModel null", async () => {
    needSeed();
    eq(await HOME(METER, { unitId: UD, date: D }), null, "home");
    eq(await POLM(METER, { unitId: UD }), null, "policy");
    eq(((await dm("listLeases")({ tenantId: tA, actorUserId: METER.userId }, { unitId: UD, tab: "CURRENT" })) as Any).rows.length, 0, "listLeases");
    eq(await dm("dormLawModel")(METER, ctxA, { unitId: UD }), null, "law");
  });
  await t("M-3", "ผู้ดูแล fai (view + lease.manage + slip.review): เห็นเงิน (overdue/billing ครบ)", async () => {
    needSeed();
    const m = await HOME(FAI, { unitId: UD, date: D });
    eq([m?.money, m?.billing?.paid, m?.kpi?.overdue?.satang], [true, EXP.paid, EXP.overdueSatang], "fai");
  }, "MAJOR");
  await t("M-4", "ไม่เชื่อ actor: userId ของคนจดมิเตอร์แต่ส่ง role OWNER/permissions dorm.* ⇒ ยัง null · userId ที่ไม่มีสมาชิกภาพ ⇒ null", async () => {
    needSeed();
    eq(await HOME({ ...METER, role: "OWNER", unitAccess: ["*"], permissions: { "dorm.*": true } }, { unitId: UD, date: D }), null, "ปลอม role");
    eq(await HOME({ ...OWNER, userId: `svc-d13-nobody-${RUN}` }, { unitId: UD, date: D }), null, "ไม่มีสมาชิกภาพ");
  });

  // ═══════════════ B. ขอบเขตอาคาร ═══════════════
  console.log("\nB. ผู้ดูแลเห็นเฉพาะอาคาร (#64 · X1)");
  await t("B-1", "dormBuildingScope: เจ้าของ all · ผู้ดูแล A = [XA] · ไม่มีรายการ = [] · MANAGER ถูกจำกัดด้วย (= [XB]) · หน่วยโหมด UNIT (UD) = all · ร้านอื่น = []", async () => {
    needScope();
    const f = dm("dormBuildingScope");
    const sc = (a: Actor, unitId = UX, ctx = ctxA) => f(ctx, { unitId, userId: a.userId });
    eq(await sc(OWNER), { all: true, buildingIds: null }, "owner");
    eq(await sc(CARE_A), { all: false, buildingIds: [bXA] }, "care A");
    eq(await sc(CARE_NONE), { all: false, buildingIds: [] }, "ไม่มีรายการ");
    eq(await sc(MGR_X), { all: false, buildingIds: [bXB] }, "MANAGER");
    eq(await sc(FAI, UD), { all: true, buildingIds: null }, "โหมด UNIT");
    eq(await sc(OWNER_B, UX, ctxB), { all: false, buildingIds: [] }, "ข้ามร้าน");
  });
  await t("B-2", "ผู้ดูแลอาคาร A: ผัง/KPI/บิล/ป้าย/ซ่อม เฉพาะ XA (2 ห้อง) · ไม่มี id/เลขห้อง/ชื่อ/ยอด/ซ่อม ของ XB และห้องไม่มีอาคาร หลุดในโมเดล", async () => {
    needScope();
    const m = await HOME(CARE_A, { unitId: UX, date: D });
    ok(m, "ได้ null");
    eq([sorted((m.cells as Any[]).map((c) => c.number)), m.kpi.rooms.total, (m.buildings as Any[]).map((b) => b.id), m.scope], [["XA1", "XA2"], 2, [bXA], { all: false, buildingIds: [bXA] }], "รูป");
    eq([m.billing?.billCount, m.billing?.totalSatang, m.kpi.overdue?.satang], [1, 500000, 0], "เงินเฉพาะ XA");
    const js = JSON.stringify(m);
    const leak = [...XB_LEAK, "XN1", XR.XN1].filter((x) => js.includes(x));
    ok(leak.length === 0, `หลุด ${leak.join(",")}`);
  });
  await t("B-3", "ไม่มีในรายการอาคาร ⇒ ไม่เห็นห้องใด (fail closed) · MANAGER ที่ถูกจำกัด XB เห็นเฉพาะ XB", async () => {
    needScope();
    const n = await HOME(CARE_NONE, { unitId: UX, date: D });
    eq([n?.cells?.length, n?.kpi?.rooms?.total, n?.billing?.billCount ?? 0], [0, 0, 0], "ไม่มีรายการ");
    const mx = await HOME(MGR_X, { unitId: UX, date: D });
    eq(sorted((mx?.cells as Any[] ?? []).map((c) => c.number)), ["XB1", "XB2"], "MANAGER XB");
  });
  await t("B-4", "listLeases ผู้ดูแลอาคาร A: แถวเฉพาะ XA1 · ยอดถือรวมเฉพาะ XA (เจ้าของเห็นสองอาคาร)", async () => {
    needScope();
    const L = dm("listLeases");
    const a = (await L({ tenantId: tA, actorUserId: CARE_A.userId }, { unitId: UX, tab: "CURRENT" })) as Any;
    eq(a.rows.map((r: Any) => r.roomNumber), ["XA1"], "rows");
    ok(!JSON.stringify(a).includes("บุษบา"), "หลุดชื่อ XB");
    const o = (await L({ tenantId: tA, actorUserId: OWNER.userId }, { unitId: UX, tab: "CURRENT" })) as Any;
    eq(sorted(o.rows.map((r: Any) => r.roomNumber)), ["XA1", "XB1"], "owner rows");
    pendingG = true; // ยอดถือตรวจใน N-2 (หลังลงประกันจริง)
  });
  await t("B-5", "อ่าน/เขียนสัญญานอกอาคาร ⇒ ไม่พบ: getLease null · leaseContract/leaseFileLinks/cancelLease/updateLeaseOccupants NOT_FOUND · สัญญา XB ไม่ขยับ", async () => {
    needScope();
    const c = { tenantId: tA, actorUserId: CARE_A.userId };
    eq(await dm("getLease")(c, { unitId: UX, leaseId: lXB }), null, "getLease");
    ok((await dm("getLease")(c, { unitId: UX, leaseId: lXA })) !== null, "positive: getLease XA");
    const before = await db.dormLease.findFirst({ where: { id: lXB }, select: { status: true, coTenants: true, updatedAt: true } });
    const p: string[] = [];
    for (const [n, r] of [
      ["leaseContract", await dm("leaseContract")(c, { unitId: UX, leaseId: lXB })],
      ["leaseFileLinks", await dm("leaseFileLinks")(c, { unitId: UX, leaseId: lXB })],
      ["cancelLease", await dm("cancelLease")(c, { unitId: UX, leaseId: lXB, reason: "ทดสอบขอบเขตอาคาร" })],
      ["updateLeaseOccupants", await dm("updateLeaseOccupants")(c, { unitId: UX, leaseId: lXB, occupants: [{ name: "แอบเพิ่ม" }], vehicles: [] })],
    ] as [string, Any][]) if (!(r?.ok === false && r.code === "NOT_FOUND")) p.push(`${n}=${fmt(r)}`);
    ok(p.length === 0, p.join(" · "));
    const after = await db.dormLease.findFirst({ where: { id: lXB }, select: { status: true, coTenants: true, updatedAt: true } });
    eq(after, before, "สัญญา XB");
  });
  await t("B-6", "createLease บนห้องอาคารอื่น (XB2) / ห้องไม่มีอาคาร (XN1) ⇒ NOT_FOUND · ไม่มีสัญญาใหม่", async () => {
    needScope();
    const c = { tenantId: tA, actorUserId: CARE_A.userId };
    const n0 = await db.dormLease.count({ where: { unitId: UX } });
    for (const rid of [XR.XB2, XR.XN1]) {
      const r = await dm("createLease")(c, { unitId: UX, roomId: rid, startDate: "2026-12-01", months: 12, tenant: { name: "ทดสอบ ขอบเขต", phone: "0861119999" } });
      ok(r?.ok === false && r.code === "NOT_FOUND", `${rid}: ${fmt(r)}`);
    }
    eq(await db.dormLease.count({ where: { unitId: UX } }), n0, "จำนวนสัญญา");
  });
  await t("B-7", "ผู้จัดการตั้ง managerScope/buildingAssignments ไม่ได้ (OWNER_ONLY · ไม่เขียน) · เจ้าของสลับเป็น UNIT ⇒ ผู้ดูแล A เห็นทั้งหน่วย (แล้วคืน BUILDING)", async () => {
    needScope();
    for (const ch of [{ key: "rooms.access.managerScope", value: "UNIT" }, { key: "rooms.access.buildingAssignments", value: { [MGR.membershipId!]: [bXA, bXB] } }]) {
      const r = await setS(MGR, [{ ...ch, scope: "UNIT", scopeId: UX }]);
      ok(r?.ok === false && JSON.stringify(r).includes("OWNER_ONLY"), `${ch.key}: ${fmt(r)}`);
    }
    ok((await setS(OWNER, [{ key: "rooms.access.managerScope", scope: "UNIT", scopeId: UX, value: "UNIT" }]))?.ok, "owner UNIT");
    const m = await HOME(CARE_A, { unitId: UX, date: D });
    eq(m?.cells?.length, 5, "เห็นทั้งหน่วย");
    ok((await setS(OWNER, [{ key: "rooms.access.managerScope", scope: "UNIT", scopeId: UX, value: "BUILDING" }]))?.ok, "คืน BUILDING");
  }, "MAJOR");

  // ═══════════════ N. หนี้ N+1 ═══════════════
  console.log("\nN. ยอดประกันถือหลายสัญญาในคำสั่งเดียว");
  let depOk = false;
  await t("PC-4", "(ฉาก) สมุดบัญชีหอ UX + ลงประกันจริง XA1 ฿9,000 · XB1 ฿10,400 ผ่าน postSecurityDeposit (positive control ของ N)", async () => {
    const { createSystem } = await import("@/lib/modules/system/service" as string);
    const { saveSettings } = await import("@/lib/modules/account/service" as string);
    const { ensureAccounting } = await import("@/lib/modules/account/gl" as string);
    const book = await createSystem(tA, "ACCOUNT", "บัญชีหอ D13");
    await saveSettings(tA, book.id, { orgName: "QC D13", vatRegistered: false });
    await ensureAccounting({ tenantId: tA, systemId: book.id });
    await db.accountSystemLink.create({ data: { tenantId: tA, systemId: book.id, linkedKind: "BUSINESS", linkedId: UX, enabled: true } });
    const post = fnOf(ACC.mod, "postSecurityDeposit");
    for (const [lid, pid, amt] of [[lXA, pXA, 900000], [lXB, pXB, 1040000]] as const) {
      const r = await post({ tenantId: tA, unitId: UX, leaseId: lid, amountSatang: amt, idempotencyKey: `qc-d13-${RUN}-${lid}`, partyId: pid, paidAt: new Date(), channel: "TRANSFER" });
      ok(r?.ok, fmt(r));
    }
    eq(await fnOf(ACC.mod, "securityDepositHeld")({ tenantId: tA, unitId: UX, leaseId: lXA }), 900000, "held XA");
    depOk = true;
  });
  await t("N-1", "securityDepositHeldMany = securityDepositHeld ต่อสัญญา (XA1 · XB1 · ไม่รู้จัก · สัญญาหน่วยอื่น ⇒ 0) · ร้านอื่น ⇒ 0", async () => {
    ok(depOk, "ฉาก PC-4 ไม่ผ่าน");
    const many = fnOf(ACC.mod, "securityDepositHeldMany");
    const ids = [lXA, lXB, "nope-lease", lease["204"]];
    const r = await many({ tenantId: tA, unitId: UX, leaseIds: ids });
    const one1 = fnOf(ACC.mod, "securityDepositHeld");
    for (const id of ids) eq(r[id] ?? 0, await one1({ tenantId: tA, unitId: UX, leaseId: id }), id);
    eq([r[lXA], r[lXB]], [900000, 1040000], "ยอด");
    const rb = await many({ tenantId: tB, unitId: UX, leaseIds: [lXA] });
    eq(rb[lXA] ?? 0, 0, "ข้ามร้าน");
  });
  await t("N-2", "listLeases heldTotalSatang: เจ้าของ ฿19,400 (สองอาคาร) · ผู้ดูแลอาคาร A ฿9,000 · แถวมี heldSatang ถูก", async () => {
    ok(depOk && pendingG, "ฉาก PC-4/B-4 ไม่ผ่าน");
    const L = dm("listLeases");
    const o = (await L({ tenantId: tA, actorUserId: OWNER.userId }, { unitId: UX, tab: "CURRENT" })) as Any;
    const a = (await L({ tenantId: tA, actorUserId: CARE_A.userId }, { unitId: UX, tab: "CURRENT" })) as Any;
    eq([o.heldTotalSatang, a.heldTotalSatang, a.rows[0]?.heldSatang], [1940000, 900000, 900000], "held");
  });

  // ═══════════════ P. หน้า 17 ═══════════════
  console.log("\nP. หน้า 17 (ตั้งนโยบาย · สิทธิ์)");
  let polO: Any = null;
  try { polO = seeded ? await POLM(OWNER, { unitId: UD }) : null; } catch (e) { console.log(`  (loadDormPolicySettings throw: ${errMsg(e)})`); }
  const needPol = () => { needSeed(); ok(polO, "loadDormPolicySettings ได้ null/throw หรือยังไม่มี"); };
  const formFields = (m: Any): Any[] => ((m?.form?.groups ?? []) as Any[]).flatMap((g) => g.fields);
  await t("P-1", "โมเดล: 9 การ์ด key/no/col · fieldKeys = ช่อง UNIT ของกลุ่มการ์ด · ไม่มี rooms.legal.* · แม่แบบ APARTMENT · diffCount 4 · form ชั้น UNIT ของหน่วย", () => {
    needPol();
    eq((polO.cards as Any[]).map((c) => [c.key, c.no, c.col]), CARDS.map((c) => [c.key, c.no, ((c.no - 1) % 3) + 1]), "การ์ด");
    const p = (polO.cards as Any[]).filter((c, i) => !isDeepStrictEqual(sorted(c.fieldKeys), sorted(cardKeysExp(CARDS[i])))).map((c) => `${c.key}: ${fmt(c.fieldKeys)}`);
    ok(p.length === 0, p.join(" · "));
    ok(!formFields(polO).some((f) => String(f.key).startsWith("rooms.legal.")), "มี legal");
    eq([polO.page, polO.template?.key, polO.diffCount, polO.form?.scope, polO.form?.scopeId], ["policies", POL.template, 4, "UNIT", UD], "หัว");
  });
  let htmlP = "";
  try { htmlP = polO ? renderPolicy(polO) : ""; } catch (e) { console.log(`  (render 17 throw: ${errMsg(e)})`); }
  const needHP = () => { needPol(); ok(htmlP, "render DormPolicySettings ไม่ได้"); };
  await t("P-2", "render: ราก data-dorm-policies · เมนูซ้าย active \"นโยบาย · ข้อความ · สิทธิ์\" · กริด data-cols=3 · การ์ด 1–9 เรียง + data-col · data-setting-key = ∪ fieldKeys (คีย์ละ 1)", () => {
    needHP();
    one(htmlP, "data-dorm-policies");
    const nav = one(htmlP, "data-dorm-settings-nav");
    ok(textOf(elems(nav.html, "data-nav-active", "true")[0]?.html ?? "").includes("นโยบาย · ข้อความ · สิทธิ์"), "nav active");
    eq(one(htmlP, "data-dp-grid").attrs["data-cols"], "3", "cols");
    eq(elems(htmlP, "data-dp-card").map((e) => [e.attrs["data-dp-card"], e.attrs["data-card-no"], e.attrs["data-col"]]), CARDS.map((c) => [c.key, String(c.no), String(((c.no - 1) % 3) + 1)]), "การ์ด");
    const ks = keysIn(htmlP);
    eq(ks.length, uniq(ks).length, "คีย์ซ้ำ");
    eq(sorted(ks), sorted((polO.cards as Any[]).flatMap((c) => c.fieldKeys)), "คีย์บนจอ");
    for (const [i, c] of CARDS.entries()) ok(textOf(elems(htmlP, "data-dp-card", c.key)[0].html).includes(CARDS[i].head), `หัว ${c.key}`);
  });
  await t("P-3", "แถวกะทัดรัด: เม็ดค่า = formatFieldValue · ป้าย \"ค่าเริ่ม <ค่าแม่แบบ>\" เฉพาะ 4 คีย์ที่ปรับ (วันออกบิล 26 · ค่าเริ่ม 25) · แถบ data-dp-diff N=4 \"ปรับจากแม่แบบ 4 ข้อ\"", () => {
    needHP();
    const fs = formFields(polO);
    const p: string[] = [];
    for (const f of fs) {
      const row = elems(htmlP, "data-setting-key", f.key)[0];
      if (!row) continue;
      const pill = elems(row.html, "data-dp-pill")[0];
      if (!f.masked && f.type !== "template" && (!pill || !textOf(pill.html).includes(sh.formatFieldValue(f, f.value)))) p.push(`pill ${f.key}`);
      const chip = elems(row.html, "data-dp-chip", "default");
      if (f.differsFromTemplate !== (chip.length === 1)) p.push(`chip ${f.key}`);
      else if (chip.length && !(textOf(chip[0].html).includes("ค่าเริ่ม") && textOf(chip[0].html).includes(sh.formatFieldValue(f, f.templateValue)))) p.push(`chip text ${f.key}: ${textOf(chip[0].html)}`);
    }
    ok(p.length === 0, p.slice(0, 6).join(" · "));
    eq(sorted(fs.filter((f) => f.differsFromTemplate).map((f) => f.key)), sorted(POL.unitDiffs.map((d: Any) => d.key)), "คีย์ที่ปรับ");
    const bar = one(htmlP, "data-dp-diff");
    ok(bar.attrs["data-diff-count"] === "4" && textOf(bar.html).includes("ปรับจากแม่แบบ 4 ข้อ"), textOf(bar.html));
  });
  await t("P-4", "การ์ดค่าปรับ: ป้าย \"รอตรวจกฎหมาย\" (มีช่อง pendingLegalReview) · ปุ่มแบ่งส่วนแบบค่าปรับครบทุกตัวเลือก ป้ายไทย · ตัวที่ใช้ aria-pressed=true", () => {
    needHP();
    const card = elems(htmlP, "data-dp-card", "lateFee")[0];
    ok(textOf(one(card.html, "data-dp-chip", "legal-review").html).includes("รอตรวจกฎหมาย"), "ป้ายกฎหมาย");
    const f = formFields(polO).find((x) => x.key === "rooms.lateFee.kind");
    const seg = one(card.html, "data-dp-seg");
    const opts = elems(seg.html, "data-option");
    eq(opts.map((o) => o.attrs["data-option"]), (f.options as Any[]).map((o) => o.value), "ตัวเลือก");
    ok(opts.every((o) => isThai(textOf(o.html))), "ป้ายไทย");
    eq(opts.filter((o) => o.attrs["aria-pressed"] === "true").map((o) => o.attrs["data-option"]), [f.value], "ตัวที่ใช้");
    for (const c of elems(htmlP, "data-dp-card").filter((e) => e.attrs["data-dp-card"] !== "lateFee"))
      ok(((polO.cards as Any[]).find((x) => x.key === c.attrs["data-dp-card"])?.pendingLegalReview === true) === (elems(c.html, "data-dp-chip", "legal-review").length === 1), `ป้ายกฎหมาย ${c.attrs["data-dp-card"]}`);
  }, "MAJOR");
  await t("P-5", "การ์ด 4: ตัวอย่างข้อความบิล data-dp-msg-preview ไม่มี { เหลือ · ตัวแปรเป็นชิป data-var ข้อความไทย", () => {
    needHP();
    const pv = one(elems(htmlP, "data-dp-card", "notify")[0].html, "data-dp-msg-preview");
    ok(!textOf(pv.html).includes("{"), textOf(pv.html));
    const vs = elems(pv.html, "data-var");
    ok(vs.length >= 4 && vs.every((v) => isThai(textOf(v.html))), `ชิป ${vs.length}`);
  }, "MAJOR");
  await t("P-6", "การ์ดสิทธิ์: หัว 4 บทบาทเรียง · 11 แถว · เซลล์ data-cell ตรงตาราง (✓ / — / ขออนุมัติ) · แถวหักประกันมี ฿2,000 · ฟอร์มใช้ชุดสิทธิ์เฉพาะเจ้าของ/ผู้จัดการ", async () => {
    needHP();
    const t2 = one(htmlP, "data-dp-roles");
    eq(elems(t2.html, "data-role").map((e) => [e.attrs["data-role"], textOf(e.html)]), ROLE_COLS.map((c) => [c[0], c[1]]), "หัว");
    eq(elems(t2.html, "data-role-row").map((e) => e.attrs["data-role-row"]), ROLE_ROWS.map((r) => r.id), "แถว");
    const p: string[] = [];
    const TXT: Record<Cell, string> = { YES: "✓", NO: "—", REQUEST: "ขออนุมัติ" };
    for (const r of ROLE_ROWS) for (const [ci, c] of ROLE_COLS.entries()) {
      const e = elems(t2.html, "data-role-cell", `${r.id}:${c[0]}`)[0];
      if (!e || e.attrs["data-cell"] !== r.cells[ci] || !textOf(e.html).includes(TXT[r.cells[ci]])) p.push(`${r.id}:${c[0]}`);
    }
    ok(p.length === 0, p.join(","));
    ok(textOf(elems(t2.html, "data-role-row", "deposit")[0].html).includes("฿2,000"), "฿2,000");
    eq(polO.depositThresholdSatang, 200000, "depositThresholdSatang");
    ok(elems(htmlP, "data-dp-role-apply").length === 1 && Array.isArray(polO.roles.applyTargets), "เจ้าของต้องมีฟอร์ม");
    const ms = await POLM(SEDIT, { unitId: UD });
    eq(ms?.roles?.applyTargets, null, "STAFF applyTargets");
    eq(elems(renderPolicy(ms), "data-dp-role-apply").length, 0, "STAFF ไม่มีฟอร์ม");
  });
  await t("P-7", "ขอบเขตอาคาร (การ์ด 6): data-dp-building-scope + data-setting-key buildingAssignments + data-scope-mode · หน่วย UX โหมด BUILDING แถวผู้ดูแล A ติ๊ก XA · ไม่มีอีเมล/เบอร์ในโมเดล/HTML · แก้ได้เฉพาะเจ้าของ", async () => {
    needHP();
    const m = await POLM(OWNER, { unitId: UX });
    ok(m, "ได้ null");
    eq([m.buildingScope?.mode, m.buildingScope?.editable, sorted((m.buildingScope?.buildings ?? []).map((b: Any) => b.id))], ["BUILDING", true, sorted([bXA, bXB])], "buildingScope");
    eq(m.buildingScope.assignments[CARE_A.membershipId!], [bXA], "assignments");
    ok(!(m.buildingScope.members as Any[]).some((x) => x.membershipId === OWNER.membershipId), "เจ้าของไม่ต้องอยู่ในรายการ");
    const html = renderPolicy(m);
    const sc = one(html, "data-dp-building-scope");
    eq([sc.attrs["data-scope-mode"], sc.attrs["data-setting-key"]], ["BUILDING", "rooms.access.buildingAssignments"], "attrs");
    const row = elems(sc.html, "data-member", CARE_A.membershipId!)[0];
    ok(row, "ไม่มีแถวผู้ดูแล A");
    eq(elems(row.html, "data-building").filter((e) => "checked" in e.attrs).map((e) => e.attrs["data-building"]), [bXA], "ติ๊ก");
    for (const x of [JSON.stringify(m), html]) ok(!x.includes("@qc.invalid") && !x.includes("0861110"), "หลุดอีเมล/เบอร์");
    eq((await POLM(MGR, { unitId: UX }))?.buildingScope?.editable, false, "ผู้จัดการแก้ไม่ได้");
  });
  await t("P-8", "render ปลอดภัย: ไม่มี <textarea ใน SSR · ไม่มีค่า enum ดิบเป็นข้อความ · ไม่มีคำต้องห้าม สคบ. · ไม่มีคีย์ rooms.legal.*", () => {
    needHP();
    ok(!/<textarea/i.test(htmlP), "มี textarea");
    const raws = new Set(formFields(polO).flatMap((f) => ((f.options ?? []) as Any[]).map((o) => String(o.value))).filter((v) => /^[A-Z][A-Z0-9_]{2,}$/.test(v)));
    const nodes = [...htmlP.matchAll(/>([^<]+)</g)].map((m) => unesc(m[1]).trim()).filter(Boolean);
    const bad = uniq(nodes.filter((n) => raws.has(n)));
    ok(bad.length === 0, `enum ดิบ ${bad.join(",")}`);
    ok(!FORBIDDEN.test(textOf(htmlP)), "คำต้องห้าม");
    ok(!keysIn(htmlP).some((k) => k.startsWith("rooms.legal.")), "มี legal");
  }, "MAJOR");
  await t("P-9", "สิทธิ์ต่อช่อง: dorm.view อย่างเดียว ⇒ ทุกแถว data-locked + เหตุผลไทย · dorm.settings.edit ⇒ วันออกบิลแก้ได้ แต่ ownerOnly (ยกเว้นค่าปรับ · managerScope) ล็อก", async () => {
    needScope();
    const mv = await POLM(VIEW, { unitId: UD });
    ok(mv, "view ได้ null");
    const hv = renderPolicy(mv);
    const rows = elems(hv, "data-setting-key");
    ok(rows.length > 20 && rows.every((r) => r.attrs["data-locked"] === "true"), `ล็อก ${rows.filter((r) => r.attrs["data-locked"] === "true").length}/${rows.length}`);
    ok(formFields(mv).every((f) => !f.editable && isThai(f.lockedReasonTh)), "เหตุผล");
    const me = await POLM(SEDIT, { unitId: UD });
    const ff = (k: string) => formFields(me).find((f) => f.key === k);
    eq([ff("rooms.billing.issueDay")?.editable, ff("rooms.lateFee.waiverApproval")?.editable, ff("rooms.access.managerScope")?.editable], [true, false, false], "SEDIT");
  }, "MAJOR");
  await t("P-10", "ส่ง form มา: ฟอร์มของหน่วยอื่น ⇒ null · ฟอร์มของหน่วยนี้ (จาก loadSettingsForm + DORM_POLICY_GROUPS) ⇒ การ์ด/ช่องเท่ากับไม่ส่ง", async () => {
    needPol();
    const lf = fnOf(s, "loadSettingsForm");
    const G = PS.mod?.DORM_POLICY_GROUPS as string[];
    const fx = await lf(OWNER, ctxA, { domains: ["rooms", "payments", "messaging"], groups: G, unitId: UX });
    eq(await POLM(OWNER, { unitId: UD, form: fx }), null, "ฟอร์มหน่วยอื่น");
    const fd = await lf(OWNER, ctxA, { domains: ["rooms", "payments", "messaging"], groups: G, unitId: UD });
    const m = await POLM(OWNER, { unitId: UD, form: fd });
    eq((m?.cards as Any[]).map((c) => sorted(c.fieldKeys)), (polO.cards as Any[]).map((c) => sorted(c.fieldKeys)), "เท่ากัน");
  }, "MAJOR");

  // ═══════════════ RT ═══════════════
  console.log("\nRT. ทุกค่าบนหน้า 17 บันทึก/คืนค่าได้");
  const altValue = (def: Any, v: Any): { ok: boolean; value?: Any } => {
    const cands: Any[] = [];
    if (def.type === "bool") cands.push(!v);
    else if (typeof v === "number") cands.push(v + 1, v - 1, v + 5, v * 2, 15);
    else if (def.type === "enum") cands.push(...(enumOptions(def.schema) ?? []).filter((o) => o !== v), null);
    else if (def.type === "template" && v && typeof v === "object") cands.push({ ...v, th: `${String(v.th)} ค่ะ` });
    else if (typeof v === "string") cands.push(`${v}ก`, "ทดสอบ");
    else if (Array.isArray(v)) cands.push([...v].reverse(), v.slice(0, Math.max(1, v.length - 1)), [...v, 30], [5]);
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (typeof x === "number") cands.push({ ...v, [k]: x + 1 }, { ...v, [k]: Math.max(0, x - 1) });
        if (typeof x === "boolean") cands.push({ ...v, [k]: !x });
        if (x === null) cands.push({ ...v, [k]: 30 });
      }
    } else if (v === null) cands.push(1, 30, 3000, "ทดสอบ", true);
    for (const c of cands) if (!isDeepStrictEqual(c, v) && def.schema.safeParse(c).success) return { ok: true, value: c };
    return { ok: false };
  };
  await t("RT-1", "ทุกช่องที่แก้ได้ (เจ้าของ) บนหน้า 17: บันทึกค่าใหม่ ⇒ โมเดลเห็นค่า (hasOwn) · คืนค่า ⇒ กลับค่าเดิม · ≥ 90% (ที่เหลือ = ปฏิเสธเป็นไทย) · ลองได้ ≥ 40 ช่อง", async () => {
    needPol();
    let tried = 0, done = 0;
    const p: string[] = [];
    const m0 = await POLM(OWNER, { unitId: UD });
    for (const f of formFields(m0)) {
      if (!f.editable || f.masked) continue;
      const def = getDef(f.key);
      const alt = altValue(def, f.value);
      if (!alt.ok) continue;
      tried++;
      const r = await setS(OWNER, [{ key: f.key, scope: "UNIT", scopeId: UD, value: alt.value }]);
      if (!r?.ok) { // ORACLE-EDIT (ผู้คุม 29 ต.ค.): "ปฏิเสธเป็นไทย" รวม LEGAL_BLOCK (เช่น returnDays 8 > 7 ตามประกาศ) + REQUIRES_INTEGRATION ด้วย ไม่ใช่แค่ VALIDATION
      if (!(["VALIDATION", "LEGAL_BLOCK", "REQUIRES_INTEGRATION"].includes(r?.code) && (r.issues ?? []).length > 0 && (r.issues ?? []).every((x: Any) => isThai(x.messageTh)))) p.push(`${f.key}: ${fmt(r)}`); continue; }
      const f1 = formFields(await POLM(OWNER, { unitId: UD })).find((x) => x.key === f.key);
      if (!f1?.hasOwn || !isDeepStrictEqual(f1.value, alt.value)) p.push(`${f.key}: หลังบันทึก ${fmt(f1?.value)}`);
      await fnOf(s, "resetSetting")(OWNER, ctxA, { key: f.key, scope: "UNIT", scopeId: UD });
      if (f.hasOwn) await setS(OWNER, [{ key: f.key, scope: "UNIT", scopeId: UD, value: f.value }]);
      const f2 = formFields(await POLM(OWNER, { unitId: UD })).find((x) => x.key === f.key);
      if (!isDeepStrictEqual(f2?.value, f.value)) p.push(`${f.key}: คืนแล้ว ${fmt(f2?.value)} ≠ ${fmt(f.value)}`);
      else done++;
    }
    ok(tried >= 40, `ลองได้แค่ ${tried} ช่อง`);
    ok(p.length === 0 && done >= Math.ceil(tried * 0.9), `สำเร็จ ${done}/${tried} · ${p.slice(0, 5).join(" · ")}`);
  });

  // ═══════════════ E. ด่านเครื่องยนต์ · ชุดสิทธิ์ · ทางเฉพาะโหมดกฎหมาย ═══════════════
  console.log("\nE. ด่านเครื่องยนต์ (dorm.settings.edit) · applyDormRolePreset · setDormLegalMode ยังใช้ได้");
  await t("E-1", "setSettings: STAFF dorm.settings.edit ตั้งวันออกบิลได้ · STAFF dorm.view อย่างเดียว ⇒ NO_PERMISSION ไม่เขียน · คีย์เดิม settings.rooms.edit ไม่มีผล", async () => {
    needSeed();
    const r = await setS(SEDIT, [{ key: "rooms.billing.issueDay", scope: "UNIT", scopeId: UD, value: 27 }]);
    ok(r?.ok, fmt(r));
    const v = await setS(VIEW, [{ key: "rooms.billing.issueDay", scope: "UNIT", scopeId: UD, value: 20 }]);
    ok(v?.ok === false && JSON.stringify(v).includes("NO_PERMISSION"), fmt(v));
    const old = await mkMember("old-perm", tA, "STAFF", [UD], { "dorm.view": true, "settings.rooms.edit": true });
    const o = await setS(old, [{ key: "rooms.billing.issueDay", scope: "UNIT", scopeId: UD, value: 20 }]);
    ok(o?.ok === false, `settings.rooms.edit ยังผ่าน ${fmt(o)}`);
    ok((await setS(OWNER, [{ key: "rooms.billing.issueDay", scope: "UNIT", scopeId: UD, value: 26 }]))?.ok, "คืน 26");
  });
  await t("E-2", "ทางเฉพาะโหมดกฎหมายยังทำงาน: setDormLegalMode(เจ้าของ, WARN) ok แล้ว STRICT ok (writeVia กันเฉพาะ action ทั่วไป)", async () => {
    
    const f = dm("setDormLegalMode");
    for (const mode of ["WARN", "STRICT"]) { const r = await f(OWNER, ctxA, { unitId: UD, mode }); ok(r?.ok, `${mode}: ${fmt(r)}`); }
  }, "MAJOR");
  await t("E-3", "applyDormRolePreset: เจ้าของใช้ TECH แล้ว CARETAKER กับพนักงาน ⇒ permissions ตรงชุด (ผ่าน updateStaffAccess) · STAFF ไม่มีสิทธิ์ ⇒ ok:false ไม่เปลี่ยน · สมาชิกร้านอื่น/บทบาทแปลก ⇒ ok:false", async () => {
    needSeed();
    const ap = dm("applyDormRolePreset");
    const perms = async (mid: string) => ((await db.membership.findFirst({ where: { id: mid }, select: { permissions: true } }))?.permissions ?? {}) as Record<string, unknown>;
    for (const role of ["TECH", "CARETAKER"] as const) {
      const r = await ap(OWNER, ctxA, { unitId: UD, membershipId: TARGET.membershipId, role });
      ok(r?.ok, `${role}: ${fmt(r)}`);
      const pm = await perms(TARGET.membershipId!);
      const exp = presetExp(role);
      const bad = Object.entries(exp).filter(([k, v]) => (pm[k] === true) !== v).map(([k]) => k);
      ok(bad.length === 0, `${role} ต่าง: ${bad.join(",")}`);
    }
    const before = await perms(TARGET.membershipId!);
    const r1 = await ap(VIEW, ctxA, { unitId: UD, membershipId: TARGET.membershipId, role: "ACCOUNTANT" });
    ok(r1?.ok === false && isThai(r1.reason), fmt(r1));
    eq(await perms(TARGET.membershipId!), before, "ไม่เปลี่ยน");
    ok((await ap(OWNER, ctxA, { unitId: UD, membershipId: OTHER_B.membershipId, role: "TECH" }))?.ok === false, "ร้านอื่น");
    ok((await ap(OWNER, ctxA, { unitId: UD, membershipId: TARGET.membershipId, role: "OWNER" }))?.ok === false, "บทบาทแปลก");
  });

  // ═══════════════ U. render หน้า 01 ═══════════════
  console.log("\nU. render หน้า 01 (DormHome + RoomBoard)");
  let htmlH = "";
  try { htmlH = homeO ? renderHome(homeO) : ""; } catch (e) { console.log(`  (render 01 throw: ${errMsg(e)})`); }
  const needHH = () => { needHome(); ok(htmlH, "render DormHome ไม่ได้"); };
  await t("U-1", "KPI 5 การ์ด data-kpi + data-kpi-value (36 · 31 · 3·1·1 · 13391280 · 1020040) · ข้อความ README (36 · 3 ชั้น · 86% · 32 · 89% · 108 · 34 วัน · ฿133,912.80 · 24 จาก 31 · 5 พ.ย. · ฿10,200.40 · 106 · 305 · 29 วัน)", () => {
    needHH();
    eq(one(htmlH, "data-dorm-home").attrs["data-date"], D, "data-date");
    const k = one(htmlH, "data-dorm-kpi");
    eq(elems(k.html, "data-kpi").map((e) => [e.attrs["data-kpi"], e.attrs["data-kpi-value"]]), [["rooms", "36"], ["occupied", "31"], ["vacancy", "3·1·1"], ["collected", String(EXP.collectedSatang)], ["overdue", String(EXP.overdueSatang)]], "การ์ด");
    const tx = (key: string) => textOf(elems(k.html, "data-kpi", key)[0].html);
    const need: [string, string[]][] = [["rooms", ["36", "3 ชั้น", "30", "6"]], ["occupied", ["31", "86%", "32", "89%"]], ["vacancy", ["108", "34 วัน"]], ["collected", ["฿133,912.80", "24 จาก 31", "5 พ.ย."]], ["overdue", ["฿10,200.40", "106", "305", "29 วัน"]]];
    const p = need.flatMap(([key, ws]) => ws.filter((w) => !tx(key).includes(w)).map((w) => `${key}:${w}`));
    ok(p.length === 0, `ขาด ${p.join(",")}`);
  });
  await t("U-2", "ผัง (children) ได้ป้ายเงิน/ชื่อจากโมเดล: 106 data-finance=overdue \"ค้าง ต.ค. ฿5,214\" · 104 pending · 211 unpaid · 204 paid + ณัฐชา · 207 \"เบญจา (ใหม่)\" · ผังอยู่หลัง KPI ก่อน todo", () => {
    needHH();
    const cell = (n: string) => elems(htmlH, "data-room-number", n)[0];
    eq([cell("106")?.attrs["data-finance"], cell("104")?.attrs["data-finance"], cell("211")?.attrs["data-finance"], cell("204")?.attrs["data-finance"], "data-finance" in (cell("108")?.attrs ?? {})], ["overdue", "pending", "unpaid", "paid", false], "tone");
    ok(textOf(cell("106").html).includes("ค้าง ต.ค. ฿5,214") && textOf(cell("204").html).includes("ณัฐชา") && textOf(cell("207").html).includes("เบญจา (ใหม่)"), "ข้อความ");
    const kpiAt = one(htmlH, "data-dorm-kpi").start, boardAt = cell("101").start, todoAt = one(htmlH, "data-dorm-todo").start;
    ok(kpiAt < boardAt && boardAt < todoAt, `ลำดับ ${kpiAt}/${boardAt}/${todoAt}`);
  }, "MAJOR");
  await t("U-3", "ต้องทำวันนี้: data-todo ลำดับ/ data-count ตรงโมเดล · ทุกแถวมีลิงก์ใต้ /app/u/qc-d13/dorm หรือ basePath", () => {
    needHH();
    const td = one(htmlH, "data-dorm-todo");
    eq(elems(td.html, "data-todo").map((e) => [e.attrs["data-todo"], e.attrs["data-count"]]), (homeO.todo as Any[]).map((x) => [x.kind, String(x.count)]), "แถว");
    for (const e of elems(td.html, "data-todo")) ok(/href="\/app\/u\/[^"]+\/dorm/.test(e.html), `ลิงก์ ${e.attrs["data-todo"]}`);
  }, "MAJOR");
  await t("U-4", "รอบบิล: data-dorm-billing data-period=2026-11 · ส่วน paid 24 / pending 3 / unpaid 4 · ฿174,126.40 · ฿40,213.60 · ส่งแล้ว 26 ต.ค.", () => {
    needHH();
    const b = one(htmlH, "data-dorm-billing");
    eq(b.attrs["data-period"], R.period, "period");
    eq(elems(b.html, "data-seg").map((e) => [e.attrs["data-seg"], e.attrs["data-count"]]), [["paid", "24"], ["pending", "3"], ["unpaid", "4"]], "seg");
    for (const w of ["฿174,126.40", "฿40,213.60", "ส่งแล้ว 26 ต.ค."]) ok(textOf(b.html).includes(w), `ขาด ${w}`);
  });
  await t("U-5", "ผู้ดู dorm.view อย่างเดียว: ไม่มีการ์ด collected/overdue · ไม่มีแผงรอบบิล · ไม่มี \"฿\" ทั้งหน้า · ไม่มี data-finance", async () => {
    needSeed();
    const hv = renderHome(await HOME(VIEW, { unitId: UD, date: D }));
    ok(elems(hv, "data-kpi", "collected").length === 0 && elems(hv, "data-kpi", "overdue").length === 0, "การ์ดเงิน");
    ok(elems(hv, "data-dorm-billing").length === 0 && !hv.includes("฿") && elems(hv, "data-finance").length === 0, "เงินหลุด");
  });
  await t("U-6", "หน่วยที่ยังไม่มีรอบบิล (เจ้าของ): billing null · data-billing-empty \"ยังไม่มีรอบบิล\"", async () => {
    needSeed();
    const m = await HOME(OWNER, { unitId: UE, date: D });
    eq(m?.billing, null, "billing");
    ok(textOf(one(renderHome(m), "data-billing-empty").html).includes("ยังไม่มีรอบบิล"), "ข้อความ");
  }, "MAJOR");
  await t("U-7", "หน้า 01 ไม่มีคำต้องห้าม สคบ. · ไม่มี <textarea", () => {
    needHH();
    ok(!FORBIDDEN.test(textOf(htmlH)) && !/<textarea/i.test(htmlH), "พบ");
  }, "MAJOR");
  await t("U-11", "(หนี้ D.7 · d7.md N1) หน้า 10: ปุ่มยอมรับคำเตือน data-accept-legal มี data-fingerprint = fingerprint ของกลุ่มในโมเดล · ไม่ใช่เจ้าของ ⇒ ไม่มีปุ่ม + \"รอเจ้าของยืนยัน\"", async () => {
    
    const base = await dm("dormLawModel")(OWNER, ctxA, { unitId: UD });
    ok(base, "dormLawModel null");
    const gi = { kind: "ELEC", buildingId: null, code: "UTIL_COST_UNKNOWN", messageTh: "ยังไม่มีบิลการไฟฟ้าของงวดนี้ — ต้องยืนยัน" };
    const m = { ...base, check: { ok: false, blocks: [], needsAcceptance: [gi] }, fingerprints: [{ kind: "ELEC", buildingId: null, fingerprint: "fp-qc-d13" }], canAccept: true };
    const Law = compOf(COMP.law, "UtilityLawSettings");
    const acts = { save: noop, reset: noop, setLegalMode: noop, recordBill: noop, accept: noop };
    const hh = ssr(h(Law, { model: m, unitSlug: "qc-d13", actions: acts }));
    const btn = elems(hh, "data-accept-legal", "ELEC");
    ok(btn.length === 1 && btn[0].attrs["data-fingerprint"] === "fp-qc-d13", `ปุ่ม ${fmt(btn.map((b) => b.attrs))}`);
    const hn = ssr(h(Law, { model: { ...m, canAccept: false }, unitSlug: "qc-d13", actions: acts }));
    ok(elems(hn, "data-accept-legal").length === 0 && textOf(hn).includes("รอเจ้าของยืนยัน"), "ไม่ใช่เจ้าของ");
  }, "MAJOR");

  // ═══════════════ X. ข้ามร้าน/หน่วย ═══════════════
  console.log("\nX. ข้ามร้าน · ข้ามหน่วย · ชนิดหน่วย");
  await t("X-1", "dormHomeModel / loadDormPolicySettings ⇒ null: ร้าน B ขอหน่วยร้าน A · ร้าน A ขอหน่วยร้าน B · หน่วย HOTEL · STAFF ที่ไม่คุมหน่วย (ผู้ดูแล UX ขอ UD) · ไม่ throw", async () => {
    needSeed();
    const p: string[] = [];
    for (const [tag, a, unitId, ctx] of [["B→A", OWNER_B, UD, ctxB], ["A→B", OWNER, UDB, ctxA], ["HOTEL", OWNER, UH, ctxA], ["STAFF หน่วยอื่น", CARE_A, UD, ctxA], ["ร้าน B staff→A", OTHER_B, UD, ctxB]] as [string, Actor, string, Any][]) {
      for (const [fn, f] of [["home", HOME], ["policy", POLM]] as const) {
        try { const m = await (f as Any)(a, { unitId, date: D }, ctx); if (m !== null) p.push(`${fn} ${tag}`); } catch (e) { p.push(`${fn} ${tag} throw ${errMsg(e)}`); }
      }
    }
    ok(p.length === 0, p.join(" · "));
  });
  await t("X-2", "โมเดลร้าน A ไม่มีข้อมูลร้าน B (id หน่วย/ห้อง) · โมเดล UD ไม่มีข้อมูล UX", () => {
    needHome();
    const js = JSON.stringify([homeO, polO]);
    for (const x of [tB, UDB, roomB, UX, XR.XA1, "XA1", "อาทิตย์"]) ok(!js.includes(x), `หลุด ${x}`);
  }, "MAJOR");

  // ═══════════════ Q. ฉาก svcqc ═══════════════
  console.log("\nQ. ฉาก svcqc (สคริปต์ฉากของ builder)");
  {
    const SQC = SQ.SQC;
    const du = await db.businessUnit.findFirst({ where: { id: SQC.units.dorm.id, tenantId: SQC.tenant.id } }).catch(() => null);
    const sceneLeases = du ? await db.dormLease.count({ where: { tenantId: SQC.tenant.id, unitId: SQC.units.dorm.id, createdById: "SvcQcScene" } }).catch(() => 0) : 0;
    const runTsx = (args: string[] = []) => {
      const r = spawnSync("pnpm", ["exec", "tsx", F.scene, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      const m = /SCENE_SUMMARY (\{.*\})/.exec(out);
      let sum: Any = null;
      try { sum = m ? JSON.parse(m[1]) : null; } catch { /* อ่านไม่ได้ */ }
      return { status: r.status, out, sum };
    };
    if (!du || sceneLeases < 31) {
      for (const [id, n] of [["Q-1", "ฉากรันได้"], ["Q-2", "โมเดลบนฉาก svcqc"], ["Q-3", "รันซ้ำไม่เขียน"]]) skip(id, n, !du ? "ร้าน svcqc ยังไม่ seed — รัน scripts/seed-svc-qc.mts ก่อน" : `สัญญาฉาก D.5 มี ${sceneLeases} (ต้อง ≥ 31) — รัน svc-qc-roomboard-scene แล้ว svc-qc-lease-scene ก่อน`);
    } else {
      await t("Q-1", "ฉากรันได้ (exit 0) · SCENE_SUMMARY {created,updated,removed}", () => {
        ok(has(F.scene), `ยังไม่มี ${F.scene}`);
        const r = runTsx();
        ok(r.status === 0 && r.sum && ["created", "updated", "removed"].every((k) => typeof r.sum[k] === "number"), `exit=${r.status} ${r.sum ? fmt(r.sum) : r.out.split("\n").slice(-4).join(" | ").slice(0, 240)}`);
      }, "MAJOR");
      await t("Q-2", "โมเดลบนฉาก svcqc (เจ้าของ · วันนี้): 36 ห้อง · มีผู้เช่า 31 · 3·1·1 · รอบบิล จ่าย 24/สลิป 3/ค้าง 4 · ยอด ฿174,126.40 · ค้างเดือนก่อน 106·305 ฿10,200.40 · หน้า 17 diffCount 4", async () => {
        const ou = (SQC.users as Any[]).find((u) => u.key === "owner");
        const own: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ou.userId };
        const c = { tenantId: SQC.tenant.id };
        const m = await HOME(own, { unitId: SQC.units.dorm.id }, c);
        eq([m?.kpi?.rooms?.total, m?.kpi?.occupied?.count, m?.kpi?.vacant, m?.kpi?.booked, m?.kpi?.repair], [36, 31, 3, 1, 1], "ห้อง");
        eq([m?.billing?.paid, m?.billing?.slipPending, m?.billing?.unpaid, m?.billing?.totalSatang], [24, 3, 4, EXP.totalSatang], "รอบบิล");
        eq([m?.kpi?.overdue?.rooms, m?.kpi?.overdue?.satang], [EXP.overdueRooms, EXP.overdueSatang], "ค้าง");
        // ORACLE-EDIT (ผู้คุม 30 ต.ค. · D.9): ฉากพอร์ทัล D.9 ตั้ง payments.receiver (UNIT หอ · setById "SvcQcScene:d9") อยู่ร่วมบน svcqc ⇒ ยอม +1
        const d9Recv = await db.settingValue.count({ where: { tenantId: SQC.tenant.id, key: "payments.receiver", scope: "UNIT", scopeId: SQC.units.dorm.id, setById: "SvcQcScene:d9" } });
        eq((await POLM(own, { unitId: SQC.units.dorm.id }, c))?.diffCount, 4 + (d9Recv > 0 ? 1 : 0), "diffCount");
      }, "MAJOR");
      await t("Q-3", "รันฉากซ้ำ ⇒ SCENE_SUMMARY 0/0/0", () => {
        const r = runTsx();
        ok(r.status === 0 && r.sum?.created === 0 && r.sum?.updated === 0 && r.sum?.removed === 0, `exit=${r.status} ${fmt(r.sum)}`);
      }, "MAJOR");
    }
  }

  // ═══════════════ V. ภาพ ═══════════════
  console.log("\nV. ภาพ d.13 (หอ 01 · หอ 17)");
  await t("V-1", "visual-svc d.13 --list ได้ (/dorm · /dorm/settings)", () => {
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "d.13", "--list"], { cwd: ROOT, env: { ...process.env, QC_BASE: "" }, encoding: "utf8" });
    ok(r.status === 0 && (r.stdout ?? "").includes("/dorm/settings"), `exit ${r.status}`);
  }, "MAJOR");
  {
    const base = process.env.QC_BASE ?? "";
    const name = "ถ่าย d.13 ด้วย owner และ fai 1440/390 · HTTP < 400 · ไม่ล้นแนวนอน (ผู้คุมเทียบ PARITY กับ 01-floorplan.png · 17-settings-policies.png)";
    if (!base) skip("V-2", name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + รันฉาก R0.9 → D.5 → D.13 แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>");
    else {
      const bad: string[] = [];
      for (const user of ["owner", "fai"]) {
        const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "d.13", "--user", user, "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
        if (r.status !== 0) bad.push(`${user} exit=${r.status} ${`${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").filter((l) => l.includes("❌")).slice(0, 2).join(" | ").slice(0, 200)}`);
      }
      record("V-2", name, bad.length ? "FAIL" : "PASS", bad.join(" · "), "MAJOR");
    }
  }
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try {
    const left = await leftovers(tenantIds);
    const tl = await db.tenant.count({ where: { slug: { startsWith: SLUG } } });
    const ul = await db.user.count({ where: { email: { startsWith: MAIL } } });
    if (tl) left.push({ table: "Tenant", n: tl });
    if (ul) left.push({ table: "User", n: ul });
    record("Z-1", `ล้างครบ: ทุกตารางที่มี tenantId ของร้านทดสอบ ${tenantIds.length} ร้าน + tenant + ผู้ใช้ svc-d13-* = 0 แถว (ฉาก svcqc คงไว้ให้ถ่ายภาพ — ล้างด้วย ${F.scene} --clear ก่อน lease-scene --clear)`,
      left.length ? "FAIL" : "PASS", fmt(left), "MAJOR");
  } catch (e) { record("Z-1", "ล้างครบ", "FAIL", `ตรวจไม่ได้: ${errMsg(e)}`, "MAJOR"); }

  // ═══════════════ G. regression (หลังล้างข้อมูล — บทเรียน D.5 G order) ═══════════════
  console.log("\nG. regression (ลูกโพรเซส · env เดียวกัน · หลังล้าง · ผ่าน = JSON_SUMMARY ไม่มี failed หรือ exit 0)");
  const REG: [string, string, string[]][] = [
    ["G-1", "qc-svc-r0.9", []], ["G-2", "qc-svc-d.6", ["--no-regression"]], ["G-3", "qc-svc-d.7", ["--no-regression"]], ["G-4", "qc-svc-d.5", ["--no-regression"]],
    ["G-5", "qc-svc-r0.4", []], ["G-6", "qc-svc-r0.3", []], ["G-7", "qc-svc-d.1", []], ["G-8", "qc-svc-d.2", []], ["G-9", "qc-svc-smoke", []],
  ];
  for (const [id, f, args] of REG) {
    if (NO_REG) { skip(id, `regression ${f}`, "--no-regression / SVC_D13_NO_REGRESSION=1", "CRITICAL"); continue; }
    try {
      const t0 = Date.now();
      const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${f}.mts`, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      const js = [...out.matchAll(/JSON_SUMMARY (\{.*\})/g)].map((m) => m[1]).pop();
      let sum: Any = null;
      try { sum = js ? JSON.parse(js) : null; } catch { /* อ่านไม่ได้ */ }
      const failed: string[] = Array.isArray(sum?.failed) ? sum.failed : [];
      const pass = (!!sum && failed.length === 0) || (!sum && r.status === 0);
      record(id, `regression ${f} (${Math.round((Date.now() - t0) / 1000)} วิ${sum ? ` · ${sum.passed}/${sum.total}` : ""})`, pass ? "PASS" : "FAIL",
        pass ? "" : `exit=${r.status} failed=${fmt(failed)} · ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "CRITICAL");
    } catch (e) { record(id, `regression ${f}`, "FAIL", errMsg(e), "CRITICAL"); }
  }
  await db.$disconnect?.().catch(() => {});
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC D.13 · ผังห้องหอ + KPI · ตั้งนโยบาย/สิทธิ์ · ขอบเขตอาคาร =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id) })}`);
// exit 0 เมื่อไม่มีข้อแดง · รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้: V-2 ไม่มี QC_BASE · Q-* ไม่ได้ seed/ฉากก่อนหน้า · G-* เมื่อ --no-regression — ผู้คุมรันครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
