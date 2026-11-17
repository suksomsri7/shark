// walk-hr.mts — เดินทุกจอ HR × 3 ขนาดจอ × th/en × ผู้ดูทุกแบบ (ใบ H5.1) — อ่านเมทริกซ์ `scripts/walk-hr-matrix.json` + ทะเบียน `scripts/hr-ui-inventory.json`
//
// ใช้ (CONTROLLER-RUN — ต้องมีเซิร์ฟเวอร์ :3226 · seed-hr-qc → seed-hr-walk ก่อน):
//   pnpm exec tsx scripts/walk-hr.mts --dry                     # ไม่มี env/DB/เซิร์ฟเวอร์: ตรวจเมทริกซ์กับทะเบียน + route จริง · เปิด Chromium ที่ about:blank · พิมพ์จำนวนช่อง/ภาพ
//   bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 \
//     pnpm exec tsx scripts/walk-hr.mts --base http://127.0.0.1:3226 [--only <state|row>] [--viewer O|owner] [--size 1440] [--lang th] [--resume] [--clicks primary|all|none] [--no-refusals|--refusals-only]
//   pnpm exec tsx scripts/walk-hr.mts --sheets                  # สร้าง contact sheet ใหม่จาก results.jsonl + PNG ที่มี (ไม่ต้องมีเซิร์ฟเวอร์/DB)
//
// ผลลัพธ์ (มติผู้คุมงาน 14 พ.ย.): /root/qc/hr-h5.1/<state>/<viewer>-<WxH>-<lang>.png · clicks/ (dialog ที่เปิดแล้วปิด) · refusals/ ·
//   results.jsonl (1 บรรทัด/ช่อง · ต่อท้าย) · sheets/<state>.html + .png (1440 | 1024 | 390 · MOCKUP | RENDER) · summary.json
// 🔴 ไม่กดส่งอะไรเลย: ทุกคำขอที่ไม่ใช่ GET/HEAD/OPTIONS ถูกตัดที่ระดับเครือข่าย (server action = POST) และบันทึกเป็น POST-BLOCKED
// ORACLE-EDIT (HR VIS-5a · controller r4): state.pressProbe = ปุ่ม submit ที่ walker กดจริง (POST ยังถูกตัดทุกคำขอ — ไม่มีอะไรถึงเซิร์ฟเวอร์) เพื่อจับหน้าพังก่อนส่งคำขอ (PAGE-CRASH) · --no-press ปิด ◂
//   PAGE-CRASH = หน้า error ของ Next ("This page couldn't load" / "A server error occurred" / Application error) หลังโหลดหรือหลังกด — ระบุปุ่มที่ถูกกดจริง (elementFromPoint) ·
//   FIT-CLIP = state.fit: เซลล์ตารางที่มองเห็นต้องอยู่ในกรอบ box ทั้งเซลล์ + เซลล์ใน must ไม่ถูกตัดข้อความ · ขนาดจอ extra (1280/1366/1536) ใช้เฉพาะ state ที่ระบุ sizes ◂
// ORACLE-EDIT (HR VIS-5d · controller) ◂ state.maxHeight {size: px} = PAGE-HEIGHT · state.fold {size: [selector …]} = FOLD (บนสุดของ element อยู่ในจอแรก · ท้าย " !full" = ทั้ง element · "@hrtabs" = แถบแท็บ HR) ·
//   state.tabStrip [size …] = TABS-CLIP (แถบแท็บ HR ไม่มีแท็บถูกตัด/เลื่อนซ่อน) · state.disabledFail = DISABLED-NO-REASON เป็น FAIL + รวมช่องใน <fieldset disabled> ·
//   state.cleanSeed [ตาราง …] = SEED-DIRTY ถ้าลายนิ้วมือของตารางเหล่านั้น (ร้าน QC) ต่างจาก manifest.after ของ seed-hr-walk (ของค้างจากการกดจริง) ◂
// 🔴 session ที่ mint ปักธง userAgent "qc-walk-hr" ลบเฉพาะแถวของรอบนี้ใน finally · ไม่มี process.exit() ในกรอบ try
// 🔴 ไม่ import visual-hr.mts (ไฟล์นั้นรันทันทีเมื่อ import) — ทำตามแบบของมัน (คุกกี้ตาม APP_ENV · puppeteer-core ของ /root/dive3d · /usr/bin/chromium-browser)
//    playwright ไม่อยู่ใน node_modules ของทรีนี้ (ตรวจ 14 พ.ย.) ⇒ ใช้ puppeteer-core ตัวเดียวกับ visual-hr · เปลี่ยนได้ด้วย WALK_PUPPETEER / WALK_CHROMIUM

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { HQC, addDays, bahtText } from "./hr-qc-env.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// ═══════════════════ 1. args ═══════════════════
const argv = process.argv.slice(2);
const opt = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const DRY = argv.includes("--dry");
const SHEETS_ONLY = argv.includes("--sheets");
const RESUME = argv.includes("--resume");
const BASE = (opt("--base") ?? "").replace(/\/$/, "");
const ONLY = opt("--only");
const F_VIEWER = opt("--viewer");
const F_SIZE = opt("--size");
const F_LANG = opt("--lang");
const CLICKS = (opt("--clicks") ?? "primary") as "primary" | "all" | "none";
const NO_REF = argv.includes("--no-refusals");
const REF_ONLY = argv.includes("--refusals-only");
const NO_PRESS = argv.includes("--no-press"); // ORACLE-EDIT (HR VIS-5a · controller r4): ปิด press probe ◂
const OUT = opt("--out") ?? "/root/qc/hr-h5.1";
const ROOT = process.cwd();
const MATRIX_PATH = "scripts/walk-hr-matrix.json";
const INV_PATH = "scripts/hr-ui-inventory.json";
const WALK_MANIFEST = "scripts/hr-walk-expected.json";
const UA = "qc-walk-hr";
const PPTR = process.env.WALK_PUPPETEER ?? "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
const CHROMIUM = process.env.WALK_CHROMIUM ?? "/usr/bin/chromium-browser";
if (!["primary", "all", "none"].includes(CLICKS)) {
  console.error("❌ walk-hr: --clicks ต้องเป็น primary | all | none");
  process.exit(2);
}

// ═══════════════════ 2. เมทริกซ์ + ทะเบียน ═══════════════════
type Size = { id: string; w: number; h: number; mobile: boolean; touch: boolean; extra?: boolean }; // ORACLE-EDIT (HR VIS-5a · controller r4): extra = ไม่อยู่ในชุดขนาดปริยาย ◂
type ViewerDef = { key: string; inventoryRole: string | null; money: boolean | "branch"; pii: "full" | "payroll" | "masked"; homeUnit?: string; selfEmployee?: string };
type State = {
  id: string; row: string; page: string; path: string; viewers: string[]; mockup: string | null; pairViewer?: string;
  pathBy?: Record<string, string>; expectFinal?: Record<string, string>; moneyOk?: string[]; limitedNote?: { viewers: string[]; selector: string };
  allowScroll?: string[]; click?: string; extra?: boolean; configMoneyOk?: string[]; why?: string; langs?: string[]; sizes?: string[]; todoInventoryPrefix?: string; coverage?: boolean;
  fit?: { box: string; cells: string; must?: string }; pressProbe?: string[]; // ORACLE-EDIT (HR VIS-5a · controller r4): FIT-CLIP + press probe ◂
  maxHeight?: Record<string, number>; fold?: Record<string, string[]>; tabStrip?: string[]; disabledFail?: boolean; cleanSeed?: string[]; // ORACLE-EDIT (HR VIS-5d · controller): PAGE-HEIGHT · FOLD · TABS-CLIP · DISABLED-NO-REASON FAIL · SEED-DIRTY ◂
};
type Refusal = { id: string; page: string; path: string; unknown: string; viewers: string[]; pathBy?: Record<string, string> };
type Matrix = { sizes: Size[]; langs: string[]; viewers: Record<string, ViewerDef>; allow: { enumsTh: string[]; thaiInEnExtra: string[]; readOnlyActions?: string[] }; states: State[]; refusals: Refusal[]; excludedInventoryPages: Record<string, string> };
type InvRow = { page: string; testid: string; kind: string; interactive: boolean; roles?: string[]; hiddenFor?: string[]; conditional?: string; expect?: { type?: string } };

const M = JSON.parse(readFileSync(MATRIX_PATH, "utf8")) as Matrix;
const INV = (JSON.parse(readFileSync(INV_PATH, "utf8")) as { rows: InvRow[] }).rows;
const tidRe = (t: string) => new RegExp(`^${t.replace(/\$\{[^}]*\}|<[^>]*>/g, "*").replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".+")}$`);
const invOf = (page: string) => INV.filter((r) => r.page === page).map((r) => ({ ...r, re: tidRe(r.testid) }));
const CLICK_TYPES = new Set(["navigate", "navigation", "modal", "ui", "inline-error"]);

// ═══════════════════ 3. route จริงใต้ src/app ═══════════════════
function routes(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f === "page.tsx") out.push(("/" + p.slice(join(ROOT, "src/app").length + 1).replace(/\/?page\.tsx$/, "")).replace(/\/\([^)]+\)/g, "") || "/");
    }
  };
  walk(join(ROOT, "src/app"));
  return out;
}
const routeRe = (r: string) => new RegExp(`^${r.replace(/\[\.\.\.[^\]]+\]/g, ".+").replace(/\[[^\]]+\]/g, "[^/]+")}$`);

// ═══════════════════ 4. ค่าแทนที่ใน path ═══════════════════
type Ids = Record<string, string>;
function placeholderIds(): Ids {
  const ids: Ids = { hr: "HRSYS", bogus: "cmzzzzzzzzzzzzzzzzzzzzzzz", paidRun: "RUNV1", paidRunPeriod: "2030-01", thisMonth: "2030-02", today: "2030-02-14", yesterday: "2030-02-13", rosterWeek: "2030-02-18" };
  for (const e of HQC.employees) ids[`emp.${e.key}`] = `EMP_${e.key}`;
  ids["emp.view"] = "EMP_view";
  for (const u of Object.keys(HQC.units)) ids[`unit.${u}`] = `UNIT_${u}`;
  for (const s of ["DRAFT", "APPROVED", "PAID", "REVERSED"]) {
    ids[`run.${s}`] = `RUN_${s}`;
    ids[`period.${s}`] = "2030-01";
  }
  return ids;
}
const fill = (tpl: string, ids: Ids) =>
  tpl.replace(/\{([a-zA-Z.]+)\}/g, (_m, k: string) => {
    if (!(k in ids) || !ids[k]) throw new Error(`ไม่รู้จักค่า {${k}} ใน "${tpl}"`);
    return ids[k]!;
  });

// ═══════════════════ 5. ขยายเป็นช่อง ═══════════════════
type Cell = { key: string; kind: "state" | "refusal"; state: string; row: string; page: string; v: string; viewer: ViewerDef; size: Size; lang: string; tpl: string; unknownTpl?: string; def: State | Refusal; primary: boolean };
const sizeOf = (id: string) => M.sizes.find((s) => s.id === id || s.id.startsWith(id))!;
const DEF_SIZES = M.sizes.filter((s) => !s.extra); // ORACLE-EDIT (HR VIS-5a · controller r4): ขนาดปริยาย = ไม่ใช่ extra ◂
function cells(): { all: Cell[]; skippedTodo: string[] } {
  const all: Cell[] = [];
  const skippedTodo: string[] = [];
  for (const s of M.states) {
    if (s.todoInventoryPrefix && !INV.some((r) => r.testid.startsWith(s.todoInventoryPrefix!))) {
      skippedTodo.push(`${s.id} (no inventory rows ${s.todoInventoryPrefix}* yet)`);
      continue;
    }
    const sizes = (s.sizes ?? DEF_SIZES.map((x) => x.id)).map(sizeOf); // ORACLE-EDIT (HR VIS-5a · controller r4) ◂
    for (const v of s.viewers)
      for (const size of sizes)
        for (const lang of s.langs ?? M.langs)
          all.push({ key: `${s.id}|${v}|${size.id}|${lang}`, kind: "state", state: s.id, row: s.row, page: s.page, v, viewer: M.viewers[v]!, size, lang, tpl: s.pathBy?.[v] ?? s.path, def: s, primary: lang === "th" && (size.w === 1440 || size.w === 390) });
  }
  // เกณฑ์รับ 3: ทุกแถวทะเบียนต้องถูกเปิดด้วยผู้ดูทุกแบบใน roles ∪ hiddenFor — คู่ (หน้า, บทบาท) ที่เมทริกซ์ไม่ได้เปิด = ช่องครอบคลุม 1440 th
  //   (ใช้ path ของ state แรกของหน้านั้น · ไม่ตรวจ HTTP (200 หรือ 404 ก็ได้) · ตรวจ INV-LEAK + ความเป็นส่วนตัวตามปกติ)
  const codeOf = (role: string) => Object.entries(M.viewers).find(([, d]) => d.inventoryRole === role)?.[0];
  for (const page of [...new Set(INV.map((r) => r.page))]) {
    const first = M.states.find((s) => s.page === page && !s.todoInventoryPrefix && !s.click);
    if (!first) continue;
    const want = new Set(INV.filter((r) => r.page === page).flatMap((r) => [...(r.roles ?? []), ...(r.hiddenFor ?? [])]));
    const have = new Set([...M.states, ...M.refusals].filter((s) => s.page === page).flatMap((s) => s.viewers.map((v) => M.viewers[v]?.inventoryRole)));
    for (const role of [...want].filter((x) => !have.has(x))) {
      const v = codeOf(role);
      if (!v) continue;
      const def: State = { ...first, id: `cov-${first.id}`, viewers: [v], langs: ["th"], sizes: ["1440x900"], extra: true, coverage: true, mockup: null, limitedNote: undefined, expectFinal: undefined, why: `coverage: ${role} on ${page} (inventory roles ∪ hiddenFor)` };
      const size = sizeOf("1440x900");
      all.push({ key: `${def.id}|${v}|${size.id}|th`, kind: "state", state: def.id, row: "cov", page, v, viewer: M.viewers[v]!, size, lang: "th", tpl: first.pathBy?.[v] ?? first.path, def, primary: false });
    }
  }
  for (const r of M.refusals)
    for (const v of r.viewers) all.push({ key: `${r.id}|${v}|1440x900|th`, kind: "refusal", state: r.id, row: "refusal", page: r.page, v, viewer: M.viewers[v]!, size: sizeOf("1440x900"), lang: "th", tpl: r.pathBy?.[v] ?? r.path, unknownTpl: r.unknown, def: r, primary: false });
  return { all, skippedTodo };
}
const { all: ALL, skippedTodo } = cells();
const pick = (c: Cell) =>
  (!ONLY || c.state === ONLY || c.state.startsWith(ONLY) || c.row === ONLY) &&
  (!F_VIEWER || c.v === F_VIEWER || c.viewer.key === F_VIEWER) &&
  (!F_SIZE || c.size.id.startsWith(F_SIZE)) &&
  (!F_LANG || c.lang === F_LANG) &&
  !(NO_REF && c.kind === "refusal") &&
  !(REF_ONLY && c.kind !== "refusal");
const SEL = ALL.filter(pick);
const counts = (cs: Cell[]) => {
  const st = cs.filter((c) => c.kind === "state");
  const brief = st.filter((c) => !(c.def as State).extra);
  const cov = st.filter((c) => (c.def as State).coverage).length;
  return {
    coverageShots: cov,
    stateCells: new Set(st.map((c) => `${c.state}|${c.v}`)).size,
    briefCells: new Set(brief.map((c) => `${c.state}|${c.v}`)).size,
    briefShots: brief.length,
    extraShots: st.length - brief.length - cov,
    refusalShots: cs.length - st.length,
    totalShots: cs.length,
    mockupPairs: M.states.filter((s) => s.mockup && !s.todoInventoryPrefix && !s.extra).length * DEF_SIZES.length, // ORACLE-EDIT (HR VIS-5a · controller r4) ◂
    mockupPairsWithExtra: M.states.filter((s) => s.mockup && !(s.todoInventoryPrefix && skippedTodo.some((x) => x.startsWith(s.id)))).length * DEF_SIZES.length,
  };
};

// ═══════════════════ 6. browser ═══════════════════
const PROFILE = `/tmp/chr-walk-hr-${process.pid}`;
async function launch(): Promise<Any> {
  if (!existsSync(PPTR)) throw new Error(`ไม่พบ puppeteer-core ที่ ${PPTR} (ตั้ง WALK_PUPPETEER)`);
  const pptr = (await import(PPTR as string)) as Any;
  return pptr.default.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${PROFILE}`] });
}
function cleanProfile() {
  for (const d of [PROFILE, `/tmp/snap-private-tmp/snap.chromium${PROFILE}`]) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ไม่มี/ไม่มีสิทธิ์ */
    }
  }
}

// ═══════════════════ 7. --dry ═══════════════════
if (DRY) {
  const errs: string[] = [];
  const warns: string[] = [];
  const R = routes();
  const ph = placeholderIds();
  const invPages = [...new Set(INV.map((r) => r.page))];
  const seenIds = new Set<string>();
  for (const s of [...M.states, ...M.refusals]) {
    if (seenIds.has(s.id)) errs.push(`id ซ้ำ ${s.id}`);
    seenIds.add(s.id);
    if (!R.includes(s.page)) errs.push(`${s.id}: page ${s.page} ไม่มี page.tsx ใต้ src/app`);
    for (const v of s.viewers) if (!M.viewers[v]) errs.push(`${s.id}: ผู้ดู ${v} ไม่อยู่ใน viewers`);
    const tpls = [s.path, ...Object.values(s.pathBy ?? {}), ...("unknown" in s ? [s.unknown] : [])];
    for (const t of tpls) {
      try {
        const p = fill(t, ph).split(/[?#]/)[0]!;
        const hit = R.filter((r) => routeRe(r).test(p));
        if (!hit.length) errs.push(`${s.id}: ${t} → ${p} ไม่ตรง route ใด`);
        else if (!hit.includes(s.page) && !(("unknown" in s) && t === s.unknown)) errs.push(`${s.id}: ${t} ตรง ${hit.join(",")} ไม่ใช่ ${s.page}`);
      } catch (e) {
        errs.push(`${s.id}: ${(e as Error).message}`);
      }
    }
    if ("mockup" in s && s.mockup && !existsSync(s.mockup)) errs.push(`${s.id}: ไม่พบภาพ mockup ${s.mockup}`);
    if ("click" in s && s.click && !/^\[data-testid/.test(s.click)) warns.push(`${s.id}: click ไม่ใช้ data-testid (${s.click})`);
    // ORACLE-EDIT (HR VIS-5a · controller r4): sizes ต้องมีในเมทริกซ์ · fit/pressProbe ต้องชี้ testid ในทะเบียนของหน้านั้น ◂
    if ("sizes" in s) for (const z of s.sizes ?? []) if (!M.sizes.some((x) => x.id === z || x.id.startsWith(z))) errs.push(`${s.id}: ขนาด ${z} ไม่อยู่ใน sizes`);
    if ("fit" in s && s.fit) for (const q of [s.fit.box, s.fit.must ?? ""].filter(Boolean)) { const t = /data-testid="([^"]+)"/.exec(q)?.[1]; if (!t || !invOf(s.page).some((r) => r.re.test(t) || r.testid === t)) errs.push(`${s.id}: fit ${q} ไม่มีในทะเบียน ${s.page}`); }
    if ("pressProbe" in s) for (const t of s.pressProbe ?? []) if (!invOf(s.page).some((r) => r.testid === t)) errs.push(`${s.id}: pressProbe ${t} ไม่มีในทะเบียน ${s.page}`);
    for (const z of [...Object.keys(("maxHeight" in s && s.maxHeight) || {}), ...Object.keys(("fold" in s && s.fold) || {}), ...(("tabStrip" in s && s.tabStrip) || [])]) if (!M.sizes.some((x) => x.id === z)) errs.push(`${s.id}: maxHeight/fold/tabStrip ขนาด ${z} ไม่อยู่ใน sizes`); // ORACLE-EDIT (HR VIS-5d · controller) ◂
    if ("cleanSeed" in s && (!Array.isArray(s.cleanSeed) || s.cleanSeed.some((t) => !/^[A-Z][A-Za-z]+$/.test(t)))) errs.push(`${s.id}: cleanSeed ต้องเป็นชื่อตาราง`); // ORACLE-EDIT (HR VIS-5d · controller) ◂
  }
  const covered = new Set([...M.states.filter((s) => !s.todoInventoryPrefix).map((s) => s.page), ...M.refusals.map((r) => r.page)]);
  const notCovered = invPages.filter((p) => !covered.has(p) && !M.excludedInventoryPages[p]);
  for (const p of notCovered) errs.push(`หน้าในทะเบียน ${p} ไม่อยู่ในเมทริกซ์และไม่มีเหตุผลยกเว้น`);
  for (const [p, why] of Object.entries(M.excludedInventoryPages)) if (!invPages.includes(p)) warns.push(`ยกเว้น ${p} แต่ไม่มีในทะเบียนแล้ว (${why})`);
  // viewers ในทะเบียนที่เมทริกซ์ไม่เคยเปิดหน้านั้น (roles ∪ hiddenFor — เกณฑ์รับ 3)
  const invRoleGaps: string[] = [];
  for (const p of invPages.filter((x) => covered.has(x))) {
    const want = new Set(INV.filter((r) => r.page === p).flatMap((r) => [...(r.roles ?? []), ...(r.hiddenFor ?? [])]));
    const have = new Set([...M.states, ...M.refusals].filter((s) => s.page === p).flatMap((s) => s.viewers.map((v) => M.viewers[v]?.inventoryRole).filter(Boolean) as string[]));
    const miss = [...want].filter((x) => !have.has(x));
    if (miss.length) invRoleGaps.push(`${p}: ${miss.join(",")}`);
  }
  // Chromium ครั้งเดียว
  let browserOk = "not run";
  try {
    const b = await launch();
    try {
      const pg = await b.newPage();
      await pg.goto("about:blank");
      const ua = (await pg.evaluate("navigator.userAgent")) as string;
      browserOk = `ok · ${(await b.version()) as string} · ${ua.includes("Headless") ? "headless" : "headed"}`;
    } finally {
      await b.close().catch(() => {});
    }
  } catch (e) {
    browserOk = `FAIL ${(e as Error).message.slice(0, 200)}`;
    errs.push(`Chromium: ${browserOk}`);
  } finally {
    cleanProfile();
  }
  const c = counts(ALL);
  console.log(`🧪 walk-hr --dry · states ${M.states.length} · refusals ${M.refusals.length} · routes under src/app ${R.length} · inventory rows ${INV.length} on ${invPages.length} pages`);
  for (const w of warns) console.log(`  ⚠️  ${w}`);
  for (const e of errs) console.log(`  ❌ ${e}`);
  for (const t of skippedTodo) console.log(`  ⏭  TODO ${t}`);
  for (const g of invRoleGaps) console.log(`  ℹ️  matrix rows never open ${g} → added as cov-* cells (1440 th)`);
  console.log(`  🌐 Chromium: ${browserOk}`);
  console.log(`DRY_SUMMARY ${JSON.stringify({ ...c, selected: SEL.length, skippedTodo, notCovered, excluded: M.excludedInventoryPages, invRoleGaps, errors: errs.length, browser: browserOk })}`);
  process.exit(errs.length ? 1 : 0);
}

// ═══════════════════ 8. contact sheets (ใช้ทั้งโหมด --sheets และท้ายการเดิน) ═══════════════════
type Finding = { kind: string; sev: "BLOCKER" | "FAIL" | "WARN" | "INFO"; detail: string };
type Result = { key: string; kind: string; state: string; row: string; page: string; v: string; viewer: string; size: string; lang: string; path: string; status: number; finalPath: string; png: string | null; findings: Finding[]; gaps: string[]; invSeen: string[]; clicks: { testid: string; outcome: string; png?: string }[]; at: string };
const readResults = (): Map<string, Result> => {
  const m = new Map<string, Result>();
  const f = join(OUT, "results.jsonl");
  if (!existsSync(f)) return m;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as Result;
      m.set(r.key, r);
    } catch {
      /* บรรทัดเสีย (ถูกตัดกลางคัน) — ข้าม */
    }
  }
  return m;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
async function buildSheets(browser: Any): Promise<string[]> {
  const res = readResults();
  const made: string[] = [];
  mkdirSync(join(OUT, "sheets"), { recursive: true });
  for (const s of M.states) {
    const rows = [...res.values()].filter((r) => r.state === s.id && r.png);
    if (!rows.length) continue;
    // ความกว้างที่แสดง: 1440 → 576 · 1024 → 512 · 390 → 390 (มือถือขนาดจริง อ่านได้)
    const shown = (w: number) => (w >= 1440 ? 576 : w >= 1024 ? 512 : w <= 430 ? w : Math.round(w * 0.5));
    const img = (p: string | null, w: number, label: string) =>
      p && existsSync(p) ? `<figure><figcaption>${esc(label)}</figcaption><a href="file://${p}"><img src="file://${p}" style="width:${shown(w)}px"></a></figure>` : `<figure class="miss"><figcaption>${esc(label)}</figcaption><div style="width:${shown(w)}px">—</div></figure>`;
    let html = `<!doctype html><meta charset="utf-8"><title>${esc(s.id)}</title><style>body{font:13px system-ui;margin:16px;background:#f4f4f5}h1{font-size:18px}h2{font-size:14px;margin:18px 0 6px}.r{display:flex;gap:12px;align-items:flex-start}figure{margin:0;background:#fff;padding:6px;border:1px solid #ddd}figcaption{font-weight:600;margin-bottom:4px}img{display:block;max-height:1800px;object-fit:cover;object-position:top}.miss div{height:120px;display:grid;place-items:center;color:#999}.f{color:#b91c1c}</style>`;
    html += `<h1>${esc(s.id)} · row ${esc(s.row)} · ${esc(s.page)}${s.mockup ? ` · mockup ${esc(s.mockup)}` : " · no mockup"}</h1><p>${esc(s.why ?? "")} — images cropped at 1800 px in this sheet; click for the full PNG.</p>`;
    if (s.mockup) {
      const pv = s.pairViewer ?? s.viewers[0]!;
      html += `<h2>MOCKUP | RENDER (${esc(M.viewers[pv]!.key)} · th)</h2>`;
      for (const z of M.sizes) {
        const r = res.get(`${s.id}|${pv}|${z.id}|th`);
        html += `<div class="r">${img(resolve(s.mockup), 1440, `MOCKUP ${s.mockup.split("/").pop()}`)}${img(r?.png ?? null, z.w, `RENDER ${z.id}`)}</div>`;
      }
    }
    for (const lang of s.langs ?? M.langs)
      for (const v of s.viewers) {
        const zs = (s.sizes ?? DEF_SIZES.map((x) => x.id)).map(sizeOf); // ORACLE-EDIT (HR VIS-5a · controller r4): คอลัมน์ = ขนาดของ state นั้น ◂
        const rs = zs.map((z) => res.get(`${s.id}|${v}|${z.id}|${lang}`));
        if (!rs.some(Boolean)) continue;
        const bad = rs.flatMap((r) => (r?.findings ?? []).filter((f) => f.sev === "FAIL" || f.sev === "BLOCKER")).length;
        html += `<h2>${esc(M.viewers[v]!.key)} · ${lang}${bad ? ` <span class="f">· ${bad} FAIL/BLOCKER</span>` : ""}</h2><div class="r">${zs.map((z, i) => img(rs[i]?.png ?? null, z.w, z.id)).join("")}</div>`; // ORACLE-EDIT (HR VIS-5a · controller r4): zs ◂
      }
    const htmlPath = join(OUT, "sheets", `${s.id}.html`);
    writeFileSync(htmlPath, html);
    if (browser) {
      const pg = await browser.newPage();
      try {
        await pg.setViewport({ width: 1900, height: 1000, deviceScaleFactor: 1 });
        await pg.goto(`file://${htmlPath}`, { waitUntil: "load", timeout: 120_000 });
        await pg.screenshot({ path: join(OUT, "sheets", `${s.id}.png`), fullPage: true, captureBeyondViewport: true });
      } catch (e) {
        console.log(`  ⚠️  sheet PNG ${s.id}: ${(e as Error).message.slice(0, 120)} (HTML ok)`);
      } finally {
        await pg.close().catch(() => {});
      }
    }
    made.push(s.id);
  }
  return made;
}
function summarize(): Record<string, Any> {
  const res = [...readResults().values()];
  const byKind: Record<string, number> = {};
  for (const r of res) for (const f of r.findings) byKind[`${f.sev}:${f.kind}`] = (byKind[`${f.sev}:${f.kind}`] ?? 0) + 1;
  const gaps: Record<string, Set<string>> = {};
  for (const r of res) for (const g of r.gaps) (gaps[r.page] ??= new Set()).add(g);
  // ทะเบียน: ผู้ดูทุกแบบที่เปิดหน้านั้น — แถวบังคับ (ไม่ conditional) ต้องเห็นอย่างน้อย 1 ครั้งที่ 1440 th · แถว conditional ที่ไม่เคยเห็น = รายการให้ดู
  const inv: Record<string, { missingRequired: string[]; unseenConditional: number }> = {};
  const groups = new Map<string, Set<string>>();
  for (const r of res.filter((x) => x.kind === "state" && x.size === "1440x900" && x.lang === "th")) {
    const role = M.viewers[r.v]?.inventoryRole;
    if (!role) continue;
    const k = `${r.page}|${role}`;
    const set = groups.get(k) ?? new Set<string>();
    for (const t of r.invSeen) set.add(t);
    groups.set(k, set);
  }
  for (const [k, seen] of groups) {
    const [page, role] = k.split("|") as [string, string];
    const rows = INV.filter((x) => x.page === page && (x.roles ?? []).includes(role));
    inv[k] = { missingRequired: rows.filter((x) => !x.conditional && !seen.has(x.testid)).map((x) => x.testid), unseenConditional: rows.filter((x) => x.conditional && !seen.has(x.testid)).length };
  }
  return {
    cellsRun: res.length,
    states: new Set(res.filter((r) => r.kind === "state").map((r) => r.state)).size,
    failedCells: res.filter((r) => r.findings.some((f) => f.sev === "FAIL" || f.sev === "BLOCKER")).length,
    findingsByKind: byKind,
    testidGaps: Object.fromEntries(Object.entries(gaps).map(([p, s]) => [p, [...s].sort()])),
    testidGapCount: Object.values(gaps).reduce((n, s) => n + s.size, 0),
    inventory: inv,
    inventoryMissingRequired: Object.values(inv).reduce((n, x) => n + x.missingRequired.length, 0),
    statesWithoutMockup: M.states.filter((s) => !s.mockup).map((s) => s.id),
    blockers: res.flatMap((r) => r.findings.filter((f) => f.sev === "BLOCKER").map((f) => `${r.key}: ${f.kind} ${f.detail}`)).slice(0, 50),
  };
}
if (SHEETS_ONLY) {
  let b: Any = null;
  try {
    b = await launch();
    const made = await buildSheets(b);
    console.log(`🗂  sheets: ${made.length} → ${join(OUT, "sheets")}`);
  } finally {
    await b?.close().catch(() => {});
    cleanProfile();
  }
  const sm = summarize();
  writeFileSync(join(OUT, "summary.json"), JSON.stringify(sm, null, 1) + "\n");
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: "walk-hr", mode: "sheets", ...sm, testidGaps: undefined, inventory: undefined })}`);
  process.exit(0);
}

// ═══════════════════ 9. เดินจริง (CONTROLLER-RUN) ═══════════════════
function die(msg: string): never {
  console.error(`❌ walk-hr: ${msg}`);
  process.exit(2);
}
if (!BASE) die("ไม่ได้ส่ง --base http://127.0.0.1:3226 (เซิร์ฟเวอร์เป็นงาน CONTROLLER-RUN · ใช้ --dry เพื่อตรวจเมทริกซ์)");
if (/:3215\b|:3225\b/.test(BASE)) die(`--base ${BASE} เป็นพอร์ตของเลนอื่น (3215 CRM · 3225 POS)`);
{
  const ping = await fetch(BASE, { redirect: "manual", signal: AbortSignal.timeout(5_000) }).catch((e: unknown) => e as Error);
  if (ping instanceof Error) die(`ต่อเซิร์ฟเวอร์ ${BASE} ไม่ได้ (${ping.message})`);
}
const envMod = await import("./hr-qc-env.mjs");
await envMod.loadHrQcEnv("walk-hr");
if (!existsSync(HQC.expectedPath)) die(`ไม่พบ ${HQC.expectedPath} — รัน seed-hr-qc ก่อน`);
if (!existsSync(WALK_MANIFEST)) die(`ไม่พบ ${WALK_MANIFEST} — รัน seed-hr-walk ก่อน`);
const E = JSON.parse(readFileSync(HQC.expectedPath, "utf8")) as Any;
const W = JSON.parse(readFileSync(WALK_MANIFEST, "utf8")) as Any;
if (W.tenantId !== E.tenant?.id || !W.complete) die(`${WALK_MANIFEST} ไม่ตรงร้าน/ไม่ครบ (complete=${W.complete}) — รัน seed-hr-walk ใหม่`);
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const { sha256 } = (await import("@/lib/core/hash" as string)) as Any;
const scope = await envMod.findQcTenant(prisma);
if (!scope || scope.tenantId !== E.tenant.id) {
  await prisma.$disconnect?.();
  die("hr-expected.json ไม่ตรงกับฐาน — รัน seed-hr-qc + seed-hr-walk ใหม่");
}
const IDS: Ids = {
  hr: E.systems.HR, bogus: "cmzzzzzzzzzzzzzzzzzzzzzzz", paidRun: E.paidRun.id, paidRunPeriod: E.dates.paidRunPeriod, thisMonth: E.dates.thisMonth, today: E.dates.today, yesterday: addDays(E.dates.today, -1), rosterWeek: E.roster?.week ?? "",
  "emp.view": W.ids["emp.view"] ?? "",
};
for (const [k, v] of Object.entries(E.employees as Record<string, string>)) IDS[`emp.${k}`] = v;
for (const [k, v] of Object.entries(E.units as Record<string, string>)) IDS[`unit.${k}`] = v;
for (const [k, v] of Object.entries((W.ids.runs ?? {}) as Record<string, string>)) IDS[`run.${k}`] = v;
for (const [k, v] of Object.entries((W.ids.periods ?? {}) as Record<string, string>)) IDS[`period.${k}`] = v;
const USERS: Record<string, string> = { ...Object.fromEntries(Object.entries(E.users as Record<string, { userId: string }>).map(([k, v]) => [k, v.userId])), ...Object.fromEntries(Object.entries((W.users ?? {}) as Record<string, { userId: string }>).map(([k, v]) => [k, v.userId])) };
const SECURE = (process.env.APP_ENV ?? "") !== "development";
// ORACLE-EDIT (HR VIS-5d · controller) ▸ SEED-DIRTY: ลายนิ้วมือตารางของร้าน QC (สูตรเดียวกับ seed-hr-walk digestOf) เทียบ manifest.after — คำนวณครั้งเดียวก่อนเดิน ◂
const SEED_DIRTY = new Map<string, string>();
for (const t of [...new Set(SEL.flatMap((c) => (c.kind === "state" ? ((c.def as State).cleanSeed ?? []) : [])))]) {
  const r = (await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n, md5(coalesce(string_agg(h, ',' ORDER BY h), '')) AS h FROM (SELECT md5((to_jsonb(x) - 'updatedAt')::text) AS h FROM "${t}" x WHERE "tenantId" = $1) s`, E.tenant.id).catch((e: Error) => [{ n: -1, h: `ERR ${e.message.slice(0, 60)}` }])) as { n: number; h: string }[];
  const now = (r[0]?.n ?? 0) > 0 ? r[0]! : null, was = (W.after ?? {})[t] as { n: number; h: string } | undefined;
  if (!W.after) SEED_DIRTY.set(t, "manifest has no `after` digest — run seed-hr-walk --down then up");
  else if ((now?.h ?? "") !== (was?.h ?? "")) SEED_DIRTY.set(t, `${was?.n ?? 0}→${now?.n ?? 0} rows${was?.n === now?.n ? " (rows changed)" : ""}`);
} // ◂ HR VIS-5d

// ── ตัวชี้ความเป็นส่วนตัว (sentinels) ──
const empName = Object.fromEntries(HQC.employees.map((e) => [e.key, e.name])) as Record<string, string>;
const nonHuahin = HQC.employees.filter((e) => e.unit !== "huahin").map((e) => e.name);
// H5.1 tuning ▸ ชื่อพนักงานต้องไม่ติดอักษร/วรรณยุกต์ไทยทั้งสองข้าง ("เจ" ≠ "เจ้าของร้าน" · "ต้น" ≠ "เริ่มต้น") ◂
const nameRe = (n: string) => new RegExp(`(?<![\u0E01-\u0E4E])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\u0E01-\u0E4E])`);
const hasName = (text: string, n: string) => nameRe(n).test(text);
const salaryOf = (e: { key: string; baseSalarySatang: number }) => ({ key: e.key, values: [String(e.baseSalarySatang), bahtText(e.baseSalarySatang)] });
const SALARY = [...HQC.employees.map(salaryOf), { key: "view", values: ["1800000", "18,000.00"] }];
const salarySentinels = [...new Set(SALARY.flatMap((x) => x.values))];
const sentinelIn = (src: string, v: string) => new RegExp(`(^|[^\\d,.])${v.replace(/[.,]/g, "\\$&")}($|[^\\d])`).test(src);
/** ฿ ที่ตามด้วยตัวเลข = จำนวนเงิน · ฿{amount} ในข้อความแปล / ฿ เปล่า ๆ = ป้ายสกุลเงิน ไม่ใช่ข้อมูล (H5.1 tuning) */
const BAHT_FIGURE = /฿\s?-?\d/;
/** H5.1 tuning ▸ ข้อความแปลคงที่ที่มีตัวเลขเงินอยู่ในตัว (เช่น "ค่าคอมฯ คงที่ต้องอยู่ระหว่าง ฿0–฿10,000" · "บิลเกิน ฿5,000 → สร้างดีล") ถูกส่งไปกับก้อนข้อความของหน้า —
 *  ไม่ใช่ข้อมูลของใคร ⇒ ตัดสตริงเหล่านี้ (ตามตัวอักษร จาก src/messages/{th,en}/*.json) ออกก่อนสแกน ฿ + ตัวเลข · ชื่อช่อง/เงินเดือนจริงยังตรวจเต็ม ◂ */
const MSG_MONEY: string[] = (() => {
  const out = new Set<string>();
  const visit = (x: unknown) => {
    if (typeof x === "string") {
      if (/฿\s?-?\d/.test(x)) out.add(x);
    } else if (x && typeof x === "object") Object.values(x).forEach(visit);
  };
  for (const lang of ["th", "en"]) {
    const dir = join(ROOT, "src/messages", lang);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      try {
        visit(JSON.parse(readFileSync(join(dir, f), "utf8")));
      } catch {
        /* ไฟล์ข้อความอ่านไม่ได้ = ไม่ตัด */
      }
    }
  }
  return [...out].sort((a, b) => b.length - a.length);
})();
const withoutStaticMoney = (t: string) => MSG_MONEY.reduce((acc, m) => (acc.includes(m) ? acc.split(m).join(" ") : acc), t);
const FIELD_SENTINELS = ["baseSalarySatang", "netSatang", "grossSatang", "amountSatang", "ytdJson", "bankAccountNo", "nationalId", "ssoNumber", "houseRegAddress"];
const NEVER_SENTINELS = ["pinHash", "pinCode"];
/** ช่องอ่อนไหวเต็มค่า ต่อพนักงาน (seed-hr-qc sensitive + วิวของ seed-hr-walk) */
const PII: { emp: string; values: string[] }[] = [
  // H5.1 tuning ▸ addressLine (ที่อยู่ติดต่อ) อยู่ชั้นพื้นฐานของ DTO โดยสัญญา (privacy-shared.ts EMPLOYEE_BASE_FIELDS) — ช่องอ่อนไหวคือ houseRegAddress (ตรวจด้วยชื่อช่อง) ◂
  ...HQC.employees.filter((e) => e.sensitive).map((e) => ({ emp: e.key, values: [e.sensitive!.nationalId, e.sensitive!.bankAccountNo] })),
  { emp: "view", values: [thaiId("110000000881"), "0000088123"] }, // ค่าเดียวกับ seed-hr-walk emp.view
];
function thaiId(prefix12: string): string {
  const d = prefix12.split("").map(Number);
  return prefix12 + String((11 - (d.reduce((a, x, i) => a + x * (13 - i), 0) % 11)) % 10);
}
const thaiAllow = (() => {
  const out = new Set<string>(M.allow.thaiInEnExtra);
  const visit = (x: unknown) => {
    if (typeof x === "string") {
      if (/[฀-๿]/.test(x)) out.add(x);
    } else if (Array.isArray(x)) x.forEach(visit);
    else if (x && typeof x === "object") Object.values(x).forEach(visit);
  };
  visit(HQC);
  return [...out].sort((a, b) => b.length - a.length);
})();
const MONEY_RE = /\d{1,3}(?:,\d{3})*\.\d{2}(?!\s*(?:ชม|ชั่วโมง|h\b|hr|hours?|วัน|days?|%|นาที|min))/g;
const ERR_RE = /\bError:|TypeError|\bPrisma\b|\bP20\d\d\b|\bat \S+ \(\S+:\d+:\d+\)|\bundefined\b|\bNaN\b|\[object Object\]/;
const KEY_RE = /\bhr\.[a-zA-Z]+\.[a-zA-Z.]+/;

// ── วิเคราะห์ในหน้า (ฟังก์ชันล้วน — ส่งเข้า evaluate) ──
function analyze(o: { allowScroll: string[]; mobile: boolean }) {
  const d = document.documentElement;
  const b = document.body;
  const main = document.querySelector("main") ?? b;
  const vis = (el: Element) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const desc = (el: Element) => `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""}${el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/).slice(0, 2).join(".") : ""}`;
  const allowed = (el: Element) => el.closest('[data-scroll="x"]') || o.allowScroll.some((s) => el.matches(s) || el.closest(s) || el.querySelector(s));
  // H5.1 tuning ▸ แถบแท็บ/ชิปที่ตั้งใจเลื่อนได้ (ลูกทุกตัวเป็นลิงก์/ปุ่ม/แท็บ ≥ 2) และกล่องห่อตาราง = ตัวเลื่อนที่ประกาศโดยโครงสร้าง (WARN) · อย่างอื่น FAIL ◂
  const strip = (el: Element) => el.children.length >= 2 && Array.from(el.children).every((c) => c.matches('a, button, [role="tab"], [role="button"]') || (c.children.length === 1 && c.firstElementChild!.matches("a, button")));
  const tableWrap = (el: Element) => !!el.querySelector(":scope > table, :scope > div > table");
  const scrollers: { el: string; sw: number; cw: number; allowed: boolean }[] = [];
  for (const el of Array.from(main.querySelectorAll("*"))) {
    const h = el as HTMLElement;
    if (h.scrollWidth > h.clientWidth + 1 && h.clientWidth > 0) {
      const ox = getComputedStyle(h).overflowX;
      if (ox === "auto" || ox === "scroll") scrollers.push({ el: `${desc(h)}${strip(h) ? " (tab/chip strip)" : tableWrap(h) ? " (table wrapper)" : ""}`, sw: h.scrollWidth, cw: h.clientWidth, allowed: !!allowed(h) || strip(h) || tableWrap(h) });
    }
  }
  const clipped: string[] = [];
  for (const el of Array.from(document.querySelectorAll("[data-testid]"))) {
    const h = el as HTMLElement;
    const cs = getComputedStyle(h);
    if ((cs.textOverflow === "ellipsis" || cs.overflowX === "hidden" || cs.overflowX === "clip") && h.scrollWidth > h.clientWidth + 1 && (h.innerText ?? "").trim() && vis(h)) clipped.push(`${h.getAttribute("data-testid")} "${(h.innerText ?? "").trim().slice(0, 40)}"`);
  }
  const testids = [...new Set(Array.from(document.querySelectorAll("[data-testid]")).map((e) => e.getAttribute("data-testid")!))];
  const disabledNoReason: string[] = [];
  for (const el of Array.from(document.querySelectorAll("[data-testid]"))) {
    const h = el as HTMLElement & { disabled?: boolean };
    if ((h.disabled || h.getAttribute("aria-disabled") === "true") && vis(h) && !h.getAttribute("title") && !h.getAttribute("aria-describedby") && !h.getAttribute("data-reason")) disabledNoReason.push(h.getAttribute("data-testid")!);
  }
  const noTestid: string[] = [];
  const small: string[] = [];
  for (const el of Array.from(main.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"]'))) {
    if (!vis(el)) continue;
    const t = ((el as HTMLElement).innerText || el.getAttribute("aria-label") || el.getAttribute("name") || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 40);
    if (!el.getAttribute("data-testid")) {
      const anc = el.parentElement?.closest("[data-testid]")?.getAttribute("data-testid") ?? "-";
      noTestid.push(`${el.tagName.toLowerCase()}${el.getAttribute("type") ? `[type=${el.getAttribute("type")}]` : ""} "${t}" in ${anc}`);
    }
    if (o.mobile) {
      const r = (el as HTMLElement).getBoundingClientRect();
      const inline = el.tagName === "A" && getComputedStyle(el).display === "inline";
      if (!inline && (r.height < 44 || r.width < 44)) small.push(`${desc(el)} ${Math.round(r.width)}×${Math.round(r.height)} "${t}"`);
    }
  }
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open], [aria-modal="true"]')).filter(vis).length;
  return {
    overflow: { html: d.scrollWidth > d.clientWidth, body: !!b && b.scrollWidth > b.clientWidth, sw: Math.max(d.scrollWidth, b?.scrollWidth ?? 0), cw: d.clientWidth },
    scrollers,
    clipped,
    testids,
    disabledNoReason,
    noTestid,
    small,
    dialogs,
    mainText: (main as HTMLElement).innerText ?? "",
    // H5.1 tuning ▸ ข้อความของ element ปลายสุดคั่นบรรทัด — innerText ต่อ span แบบ flex ติดกัน ("พี่เก่งสาขาหัวหิน") ทำให้ตรวจชื่อแบบมีขอบเขตพลาด ◂
    leafText: (() => {
      const out: string[] = [];
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        const p = n.parentElement;
        const t = (n.textContent ?? "").trim();
        if (t && p && p.tagName !== "SCRIPT" && p.tagName !== "STYLE" && (vis(p) || p.tagName === "OPTION")) out.push(t);
      }
      return out.join("\n");
    })(),
    bodyText: b?.innerText ?? "",
  };
}

// ── session ──
const MINE: string[] = [];
const cookieCache = new Map<string, Any[]>();
async function cookiesFor(viewerKey: string, lang: string): Promise<Any[]> {
  let base = cookieCache.get(viewerKey);
  if (!base) {
    const userId = USERS[viewerKey];
    if (!userId) throw new Error(`ไม่มีผู้ใช้ ${viewerKey} ใน hr-expected/hr-walk-expected`);
    const token = "hrw" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const ttl = new Date(Date.now() + 6 * 3600 * 1000);
    const row = await prisma.session.create({ data: { userId, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
    MINE.push(row.id);
    const host = new URL(BASE).hostname;
    base = SECURE
      ? [{ name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: E.tenant.id, url: BASE, path: "/", secure: true }]
      : [{ name: "shark_session", value: token, domain: host, path: "/" }, { name: "shark_tenant", value: E.tenant.id, domain: host, path: "/" }];
    cookieCache.set(viewerKey, base);
  }
  const host = new URL(BASE).hostname;
  return [...base, SECURE ? { name: "LOCALE", value: lang, url: BASE, path: "/" } : { name: "LOCALE", value: lang, domain: host, path: "/" }];
}

// ── หนึ่งช่อง ──
type Ctx2 = { blocked: string[]; errors: string[]; failed: string[]; lastBlockAt?: number; walkerCaused?: string[] };
/** id → ชื่อ server action จาก build ที่เสิร์ฟอยู่ (cwd/.next) — ใช้ตั้งชื่อใน POST-BLOCKED + ปล่อยตัวอ่านอย่างเดียว */
const ACTIONS = (() => {
  const m = new Map<string, string>();
  const f = join(ROOT, ".next/server/server-reference-manifest.json");
  if (!existsSync(f)) return m;
  try {
    const j = JSON.parse(readFileSync(f, "utf8")) as Record<string, Record<string, { exportedName?: string; filename?: string }>>;
    for (const sect of [j.node ?? {}, j.edge ?? {}]) for (const [id, v] of Object.entries(sect)) m.set(id, `${v.exportedName ?? "?"} (${v.filename ?? "?"})`);
  } catch {
    /* manifest อ่านไม่ได้ = ไม่มีชื่อ · ไม่ปล่อยอะไร */
  }
  return m;
})();
const READ_ONLY = new Set(M.allow.readOnlyActions ?? []);
async function openPage(browser: Any, c: Cell, ctx: Ctx2): Promise<Any> {
  const page = await browser.newPage();
  await page.setViewport({ width: c.size.w, height: c.size.h, deviceScaleFactor: 1, isMobile: c.size.mobile, hasTouch: c.size.touch });
  await page.evaluateOnNewDocument("window.__name = function (f) { return f; };");
  await page.setUserAgent(`Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 ${UA}`);
  await page.setCookie(...(await cookiesFor(c.viewer.key, c.lang)));
  await page.setRequestInterception(true);
  page.on("request", (r: Any) => {
    const m = r.method();
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
      const act = r.headers()["next-action"] as string | undefined;
      const name = act ? (ACTIONS.get(act) ?? `action ${act.slice(0, 10)}`) : "";
      if (act && READ_ONLY.has(name.split(" ")[0]!)) return void r.continue().catch(() => {}); // H5.1 tuning ▸ อ่านอย่างเดียว ตรวจซอร์สแล้ว (matrix allow.readOnlyActions) ◂
      ctx.blocked.push(`${m} ${r.url().replace(BASE, "").slice(0, 120)}${act ? ` (server action ${name})` : ""}`);
      ctx.lastBlockAt = Date.now();
      r.abort("blockedbyclient").catch(() => {});
    } else r.continue().catch(() => {});
  });
  // H5.1 tuning ▸ ข้อความที่ walker เป็นต้นเหตุเอง: "ERR_BLOCKED_BY_CLIENT" (คำขอที่ตัด) + pageerror "Failed to fetch" ภายใน 3 วิหลังตัด ⇒ WARN BLOCKED-BY-WALKER · อื่น ๆ = FAIL เหมือนเดิม ◂
  page.on("pageerror", (e: Error) => {
    const t = `pageerror ${e.message.slice(0, 160)}`;
    if (/^Failed to fetch$/.test(e.message) && ctx.lastBlockAt && Date.now() - ctx.lastBlockAt < 3_000) (ctx.walkerCaused ??= []).push(t);
    else ctx.errors.push(t);
  });
  page.on("console", (msg: Any) => {
    if (msg.type() !== "error") return;
    const t = String(msg.text()).slice(0, 160);
    if (/net::ERR_BLOCKED_BY_CLIENT/.test(t)) (ctx.walkerCaused ??= []).push(t);
    else ctx.errors.push(t);
  });
  page.on("dialog", (d: Any) => void d.dismiss().catch(() => {})); // ORACLE-EDIT (HR VIS-5a · controller r4): confirm/alert ของปุ่มที่ probe กด = ยกเลิก (ไม่ค้าง) ◂
  page.on("requestfailed", (r: Any) => {
    const t = r.failure()?.errorText ?? "";
    if (/ERR_BLOCKED_BY_CLIENT|ERR_ABORTED/.test(t)) return;
    ctx.failed.push(`${t} ${r.url().replace(BASE, "").slice(0, 120)}`);
  });
  page.on("response", (r: Any) => {
    if (r.status() >= 400 && r.request().resourceType() !== "document") ctx.failed.push(`HTTP ${r.status()} ${r.url().replace(BASE, "").slice(0, 120)}`);
  });
  return page;
}
const slug = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
// ORACLE-EDIT (HR VIS-5a · controller r4) ▸ หน้า error ของ Next (A1: ปุ่มรอบจ่ายทุกปุ่มพังเป็น "This page couldn't load · A server error occurred") ◂
const CRASH_RE = /This page couldn[’']t load|A server error occurred|Application error: a (?:client|server)-side exception has occurred|Internal Server Error/;
const crashOf = async (page: Any): Promise<string> => { const t = String(await page.evaluate("document.body ? document.body.innerText.slice(0, 600) : ''").catch(() => "")); return CRASH_RE.exec(t)?.[0] ?? ""; };
/** เปิด <details> ที่ปิดอยู่รอบปุ่ม (กด summary แบบผู้ใช้) · เลื่อนเข้าจอ · คืนสิ่งที่อยู่จริงใต้จุดกึ่งกลาง (ชื่อปุ่มที่จะถูกกด) */
async function reveal(page: Any, el: Any): Promise<{ opened: number; visible: boolean; hit: string; self: boolean }> {
  const opened = (await el.evaluate((n: Any) => { let k = 0; for (let d = n.closest("details:not([open])"); d && k < 5; d = n.closest("details:not([open])")) { const s = d.querySelector(":scope > summary"); if (s) s.click(); else d.open = true; k++; } return k; })) as number;
  if (opened) await new Promise((x) => setTimeout(x, 250));
  return (await el.evaluate((n: Any) => {
    n.scrollIntoView({ block: "center", inline: "center" });
    const r = n.getBoundingClientRect(), visible = (typeof n.checkVisibility === "function" ? n.checkVisibility() : true) && r.width > 0 && r.height > 0;
    const at = visible ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
    const t = at ? (at.closest("[data-testid]") as Any) : null;
    return { visible, self: !!at && (at === n || n.contains(at)), hit: at ? `${t?.dataset?.testid ?? at.tagName.toLowerCase()} "${String((at as Any).innerText ?? "").trim().slice(0, 40)}"` : "nothing" };
  }).then((x: Any) => ({ opened, ...x }))) as { opened: number; visible: boolean; hit: string; self: boolean };
}
/** FIT-CLIP: ทุกเซลล์ที่มองเห็นอยู่ในกรอบ box ทั้งเซลล์ · เซลล์ must ไม่ถูกตัดข้อความ (B1: คอลัมน์สถานะถูกตัดเมื่อเปิด drawer) */
const fitOf = (o: { box: string; cells: string; must: string }) => {
  const box = document.querySelector(o.box) as HTMLElement | null;
  if (!box) return { missing: true, out: [] as string[] };
  const br = box.getBoundingClientRect(), out: string[] = [];
  const tbl = box.querySelector("table") as HTMLElement | null;
  if (tbl && tbl.scrollWidth > box.clientWidth + 1) out.push(`table ${tbl.scrollWidth} > box ${box.clientWidth}`);
  const heads = Array.from(box.querySelectorAll("thead th")).filter((h) => (h as HTMLElement).getBoundingClientRect().width > 0).map((h) => (h as HTMLElement).innerText.trim());
  for (const c of Array.from(box.querySelectorAll(o.cells)) as HTMLElement[]) {
    const r = c.getBoundingClientRect();
    if (!r.width || getComputedStyle(c).display === "none") continue;
    const col = c.tagName === "TH" ? c.innerText.trim() : heads[Array.from(c.parentElement?.children ?? []).filter((x) => (x as HTMLElement).getBoundingClientRect().width > 0).indexOf(c)] ?? "?";
    if (r.right > br.right + 1 || r.left < br.left - 1) out.push(`${col}: cell ${Math.round(r.left)}–${Math.round(r.right)} outside box ${Math.round(br.left)}–${Math.round(br.right)} «${c.innerText.trim().slice(0, 24)}»`);
  }
  if (o.must) for (const c of Array.from(document.querySelectorAll(o.must)) as HTMLElement[]) if (c.getBoundingClientRect().width > 0 && c.scrollWidth > c.clientWidth + 1) out.push(`clipped text «${c.innerText.trim().slice(0, 30)}» ${c.scrollWidth}>${c.clientWidth}`);
  return { missing: false, out };
}; // ◂ HR VIS-5a
// H5.1 tuning ▸ เทียบเป็นชุดก้อน RSC เรียงแล้ว + ตัด </body></html>: forbidden กับ unknown ต่างกันแค่ตำแหน่งที่ก้อน "6:E{NEXT_HTTP_ERROR_FALLBACK;404}" ถูกสตรีม (ก่อน/หลัง </body>) — เนื้อหาเท่ากัน ◂
const stripIds = (html: string, ids: string[]) =>
  ids.reduce((s, id) => (id ? s.split(id).join("<ID>") : s), html).replace(/nonce="[^"]*"/g, 'nonce=""').replace("</body></html>", "").split(/(?=<script)/).sort().join("");

// ORACLE-EDIT (HR VIS-5d · controller) ▸ FOLD: บนสุดของ element ต้องอยู่ในจอแรก (" !full" = ทั้ง element) · "@hrtabs" = แถบแท็บ HR (กลุ่มลิงก์ ≥ 4 ตัวที่มีลิงก์ /hr/settings นอกเมนูซ้าย) ·
//   TABS-CLIP: แถบนั้นเลื่อนซ่อน (scrollWidth > clientWidth) หรือมีแท็บที่ขอบเกินกรอบ ◂
const v5dLayout = (o: { fold: string[] }) => {
  const H = window.innerHeight, out = { fold: [] as string[], strip: [] as string[] };
  const strip = (Array.from(document.querySelectorAll('a[href$="/hr/settings"]')).find((a) => !a.closest('[data-testid="hr-set-nav"]') && !!a.parentElement && a.parentElement.querySelectorAll(":scope > a").length >= 4)?.parentElement ?? null) as HTMLElement | null;
  for (const raw of o.fold) {
    const full = raw.endsWith(" !full"), sel = raw.replace(/ !full$/, "");
    const el = (sel === "@hrtabs" ? strip : document.querySelector(sel)) as HTMLElement | null;
    if (!el) { out.fold.push(`${sel}: absent`); continue; }
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) out.fold.push(`${sel}: not visible`);
    else if (r.top + window.scrollY >= H) out.fold.push(`${sel}: top ${Math.round(r.top + window.scrollY)} ≥ fold ${H}`);
    else if (full && r.bottom + window.scrollY > H) out.fold.push(`${sel}: bottom ${Math.round(r.bottom + window.scrollY)} > fold ${H} (whole element wanted)`);
  }
  if (!strip) out.strip.push("HR tab strip not found");
  else {
    const sr = strip.getBoundingClientRect();
    if (strip.scrollWidth > strip.clientWidth + 1) out.strip.push(`strip scrolls ${strip.scrollWidth}>${strip.clientWidth}`);
    for (const a of Array.from(strip.querySelectorAll(":scope > a")) as HTMLElement[]) { const r = a.getBoundingClientRect(); if (!r.width || r.right > sr.right + 1 || r.left < sr.left - 1) out.strip.push(`tab "${a.innerText.trim()}" outside ${Math.round(sr.left)}–${Math.round(sr.right)}`); }
  }
  return out;
};
/** DISABLED-NO-REASON (disabledFail): ทุกช่อง :disabled ที่มองเห็น (รวมช่องใน <fieldset disabled>) ต้องมี title / aria-describedby / data-reason ที่ตัวเองหรือ fieldset */
const v5dDisabled = () => {
  const has = (e: Element | null) => !!e && (!!e.getAttribute("title") || !!e.getAttribute("aria-describedby") || !!e.getAttribute("data-reason"));
  const out: string[] = [];
  for (const el of Array.from(document.querySelectorAll("input:disabled, select:disabled, textarea:disabled, button:disabled, fieldset:disabled, [aria-disabled=\"true\"]")) as HTMLElement[]) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || (el as HTMLInputElement).type === "hidden") continue;
    if (el.getAttribute("data-testid") && ((el as HTMLInputElement).disabled || el.getAttribute("aria-disabled") === "true")) continue; // analyze() already reports own-disabled testid elements
    if (has(el) || has(el.closest("fieldset[disabled]"))) continue;
    out.push(`${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : el.getAttribute("name") ? `[name=${el.getAttribute("name")}]` : ""} in ${el.parentElement?.closest("[data-testid]")?.getAttribute("data-testid") ?? "-"}`);
  }
  return out;
}; // ◂ HR VIS-5d
async function runCell(browser: Any, c: Cell): Promise<Result> {
  const findings: Finding[] = [];
  const add = (sev: Finding["sev"], kind: string, detail: string) => findings.push({ sev, kind, detail: detail.slice(0, 300) });
  const path = fill(c.tpl, IDS);
  const ctx: Ctx2 = { blocked: [], errors: [], failed: [] };
  const page = await openPage(browser, c, ctx);
  const isRef = c.kind === "refusal";
  const dir = isRef ? join(OUT, "refusals") : join(OUT, c.state);
  mkdirSync(dir, { recursive: true });
  const png = isRef ? join(dir, `${c.state}-${c.viewer.key}.png`) : join(dir, `${c.viewer.key}-${c.size.id}-${c.lang}.png`);
  const clicks: Result["clicks"] = [];
  let status = 0;
  let finalPath = "";
  let invSeen: string[] = [];
  let gaps: string[] = [];
  try {
    const resp = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 60_000 }).catch((e: Error) => {
      add("FAIL", "NAV", e.message);
      return null;
    });
    await new Promise((r) => setTimeout(r, 600));
    status = resp?.status() ?? 0;
    finalPath = page.url().replace(BASE, "");
    const st = c.def as State;
    if (!isRef && st.click) {
      await page.click(st.click).then(() => new Promise((r) => setTimeout(r, 500)), () => add("FAIL", "STATE-CLICK", `ไม่พบ ${st.click}`));
    }
    const a = (await page.evaluate(analyze, { allowScroll: isRef ? [] : (st.allowScroll ?? []), mobile: c.size.mobile })) as ReturnType<typeof analyze>;
    // ORACLE-EDIT (HR VIS-5a · controller r4) ▸ หน้า error ของ Next ตอนโหลด · FIT-CLIP ◂
    const crash0 = await crashOf(page);
    if (crash0) add("FAIL", "PAGE-CRASH", `on load${st.click ? ` after ${st.click}` : ""}: "${crash0}" (${finalPath})`);
    if (!isRef && st.fit) {
      const f = (await page.evaluate(fitOf, { box: st.fit.box, cells: st.fit.cells, must: st.fit.must ?? "" })) as ReturnType<typeof fitOf>;
      if (f.missing) add("FAIL", "FIT-CLIP", `ไม่พบ ${st.fit.box}`);
      for (const x of f.out.slice(0, 12)) add("FAIL", "FIT-CLIP", x);
    }
    // ORACLE-EDIT (HR VIS-5d · controller) ▸ PAGE-HEIGHT · FOLD · TABS-CLIP · DISABLED-NO-REASON (fieldset) · SEED-DIRTY — not on refusal / coverage (cov-*) cells ◂
    if (!isRef && !st.coverage) {
      const lim = st.maxHeight?.[c.size.id];
      if (lim) { const ph = (await page.evaluate("Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)")) as number; if (ph > lim) add("FAIL", "PAGE-HEIGHT", `${ph}px > ${lim}px`); }
      const fsel = st.fold?.[c.size.id] ?? [], wantStrip = (st.tabStrip ?? []).includes(c.size.id);
      if (fsel.length || wantStrip) {
        const v5d = (await page.evaluate(v5dLayout, { fold: fsel })) as ReturnType<typeof v5dLayout>;
        for (const x of v5d.fold) add("FAIL", "FOLD", x);
        if (wantStrip) for (const x of v5d.strip) add("FAIL", "TABS-CLIP", x);
      }
      if (st.disabledFail) for (const x of (await page.evaluate(v5dDisabled)) as string[]) add("FAIL", "DISABLED-NO-REASON", x);
      for (const t of st.cleanSeed ?? []) if (SEED_DIRTY.has(t)) add("FAIL", "SEED-DIRTY", `${t}: ${SEED_DIRTY.get(t)} since seed-hr-walk — press-probe/real-press leftovers on the page; seed --down → up before the shots`);
    } // ◂ HR VIS-5d
    const source = `${(await page.content()) as string}\n${(await page.evaluate("JSON.stringify(self.__next_f || [])")) as string}`;

    // HTTP / ปลายทาง
    if (isRef) {
      if (status !== 404) add("FAIL", "HTTP", `expected 404 got ${status} (${finalPath})`);
      const hrWords = HQC.employees.map((e) => e.name).filter((n) => hasName(a.leafText, n));
      if (hrWords.length) add("BLOCKER", "REFUSAL-LEAK", `HR names on refusal page: ${hrWords.join(",")}`);
      // ไบต์เท่ากัน: forbidden id vs unknown id — ยิงตรงด้วยคุกกี้เดียวกัน (ไม่ผ่านเบราว์เซอร์) · ตัด id ทั้งสองข้าง + nonce
      const unknownPath = fill((c.def as Refusal).unknown, IDS);
      const cookie = (await cookiesFor(c.viewer.key, c.lang)).map((k: Any) => `${k.name}=${k.value}`).join("; ");
      const get = (p: string) => fetch(`${BASE}${p}`, { headers: { cookie, "user-agent": UA }, redirect: "manual", signal: AbortSignal.timeout(60_000) }).then(async (r) => ({ status: r.status, body: await r.text() }));
      const [f1, f2] = [await get(path), await get(unknownPath)];
      const idList = Object.values(IDS).filter((x) => x && x.length >= 8);
      const n1 = stripIds(f1.body, idList);
      const n2 = stripIds(f2.body, idList);
      if (f1.status !== f2.status) add("FAIL", "REFUSAL-BYTES", `status forbidden ${f1.status} ≠ unknown ${f2.status} (${unknownPath})`);
      else if (n1 !== n2) add("FAIL", "REFUSAL-BYTES", `bodies differ after id/nonce normalisation (len ${n1.length} vs ${n2.length}) · unknown ${unknownPath}`);
      else if (!n1.length) add("WARN", "REFUSAL-BYTES", "empty bodies — compare by eye");
    } else {
      const wantFinal = st.expectFinal?.[c.v];
      if (wantFinal) {
        if (!finalPath.startsWith(wantFinal)) add("FAIL", "HTTP", `expected redirect to ${wantFinal} got ${finalPath} (${status})`);
      } else if (st.coverage) {
        if (status !== 200 && status !== 404) add("FAIL", "HTTP", `coverage cell: expected 200 or 404 got ${status}`);
      } else if (status !== 200) add("FAIL", "HTTP", `expected 200 got ${status} (${finalPath})`);
    }
    // console / คำขอที่ล้ม
    // H5.1 tuning ▸ ช่องครอบคลุม (cov-*) ที่ได้ 404 ตามสิทธิ์ = ข้อความ 404 ของเอกสารหลักเหมือนช่องปฏิเสธ ◂
    const refusedDoc = isRef || (!!st.coverage && status === 404);
    for (const e of ctx.errors) if (!(refusedDoc && /404|Not Found/i.test(e))) add("FAIL", "CONSOLE", e);
    for (const f of ctx.failed) if (!(refusedDoc && /HTTP 404/.test(f))) add("FAIL", "REQUEST", f);
    for (const b of ctx.blocked) add("WARN", "POST-BLOCKED", `on load: ${b}`);
    for (const w of [...new Set(ctx.walkerCaused ?? [])].filter((x) => x.startsWith("pageerror"))) add("WARN", "BLOCKED-BY-WALKER", w);
    // ล้น/เลื่อนแนวนอน
    if (a.overflow.html || a.overflow.body) add("FAIL", "HSCROLL-PAGE", `${a.overflow.sw}>${a.overflow.cw}`);
    for (const s of a.scrollers) add(s.allowed ? "WARN" : "FAIL", "HSCROLL-EL", `${s.el} ${s.sw}>${s.cw}${s.allowed ? " (declared scroller)" : ""}`);
    for (const x of a.clipped.slice(0, 20)) add("WARN", "CLIPPED", x);
    for (const x of a.small.slice(0, 20)) add("WARN", "TAP-44", x);
    for (const x of a.disabledNoReason) add(!isRef && !st.coverage && st.disabledFail ? "FAIL" : "WARN", "DISABLED-NO-REASON", x); // ORACLE-EDIT (HR VIS-5d · controller): disabledFail ◂
    // ข้อความ: i18n / enum / error
    const text = a.mainText;
    if (/MISSING_MESSAGE/.test(source) || /MISSING_MESSAGE/.test(a.bodyText)) add("FAIL", "I18N-MISSING", "MISSING_MESSAGE in page");
    const km = a.bodyText.match(KEY_RE);
    if (km) add("FAIL", "I18N-KEY", km[0]);
    if (c.lang === "en") {
      let rest = text;
      for (const s of thaiAllow) rest = rest.split(s).join(" ");
      const th = rest.match(/[^\s]*[\u0E01-\u0E3A\u0E40-\u0E5B]+[^\s]*/g); // H5.1 tuning ▸ ไม่นับ ฿ (U+0E3F สกุลเงิน ใช้ใน en ด้วย) ◂
      if (th) add("FAIL", "EN-THAI", [...new Set(th)].slice(0, 8).join(" · "));
    } else {
      const en = [...new Set((text.match(/\b[A-Z][A-Z_]{2,}\b/g) ?? []).filter((w) => !M.allow.enumsTh.includes(w)))];
      if (en.length) add("FAIL", "TH-RAW-ENUM", en.slice(0, 10).join(" "));
    }
    const em = a.bodyText.match(ERR_RE);
    if (em) add("FAIL", "RAW-ERROR", em[0]);
    // ความเป็นส่วนตัว (§6)
    const own = c.viewer.selfEmployee;
    const roleMoney = c.viewer.money === true || c.viewer.money === "branch";
    const ownPage = !isRef && (st.moneyOk ?? []).includes(c.v);
    const configMoney = !isRef && (st.configMoneyOk ?? []).includes(c.v);
    if (!roleMoney && !ownPage) {
      // ข้อความที่เห็น: จำนวนเงิน (฿ + ตัวเลข หรือ x,xxx.xx) — ยกเว้นหน้าค่าตั้ง/กฎหมายที่ระบุใน configMoneyOk (ยอดตามกฎหมาย/ค่าตั้งร้าน ไม่ใช่เงินของคน)
      if (!configMoney) {
        const fig = withoutStaticMoney(a.bodyText).match(new RegExp(BAHT_FIGURE.source + "[\\d,.]*", "g")) ?? [];
        const hits = [...fig.slice(0, 5), ...((a.bodyText.match(MONEY_RE) ?? []).slice(0, 5))];
        if (hits.length) add("BLOCKER", "PRIVACY-MONEY-TEXT", hits.join(" "));
      }
      const srcFig = configMoney ? [] : (withoutStaticMoney(source).match(new RegExp(BAHT_FIGURE.source + "[\\d,.]*", "g")) ?? []); // configMoneyOk: ยอดค่าตั้ง/กฎหมายในก้อนข้อมูลเดียวกับที่เห็น · ชื่อช่อง + เงินเดือนจริงยังตรวจ
      const src = [...srcFig.slice(0, 3), ...FIELD_SENTINELS.filter((f) => source.includes(f)), ...salarySentinels.filter((v) => sentinelIn(source, v))];
      if (src.length) add("BLOCKER", "PRIVACY-MONEY-SOURCE", src.slice(0, 8).join(" "));
    } else if (ownPage && !roleMoney) {
      // หน้าของตัวเอง: เงินของตัวเองได้ · เงินเดือนของคนอื่นไม่ได้
      const other = SALARY.filter((x) => x.key !== own).flatMap((x) => x.values.filter((v) => sentinelIn(source, v)).map((v) => `${x.key}:${v}`));
      if (other.length) add("BLOCKER", "PRIVACY-MONEY-SOURCE", `other employee salary on own page: ${other.slice(0, 5).join(" ")}`);
    }
    const never = NEVER_SENTINELS.filter((f) => source.includes(f));
    if (never.length) add("BLOCKER", "PRIVACY-PIN", never.join(" "));
    if (c.viewer.pii !== "full") {
      const pii = PII.filter((p) => p.emp !== own).flatMap((p) => p.values.filter((v) => a.bodyText.includes(v) || source.includes(v)).map((v) => `${p.emp}:${v.slice(0, 4)}…`));
      if (pii.length) add(c.viewer.pii === "masked" ? "BLOCKER" : "WARN", "PRIVACY-PII", pii.join(" "));
    }
    if (c.viewer.money === "branch") {
      const rows = (await page.evaluate(`Array.from(document.querySelectorAll('tr, li, [data-testid*="-row"], [data-testid*="-item-"]')).map(e => { const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); const o = []; for (let n = w.nextNode(); n; n = w.nextNode()) { const t = (n.textContent || '').trim(); if (t) o.push(t); } return o.join('\\n'); })`)) as string[];
      const bad = rows.filter((t) => nonHuahin.some((n) => hasName(t, n)) && (BAHT_FIGURE.test(t) || new RegExp(MONEY_RE.source).test(t)));
      if (bad.length) add("BLOCKER", "PRIVACY-BRANCH-MONEY", bad.slice(0, 3).map((t) => t.replace(/\s+/g, " ").slice(0, 80)).join(" | "));
    }
    if (!isRef && st.limitedNote?.viewers.includes(c.v)) {
      const n = (await page.evaluate(`document.querySelectorAll(${JSON.stringify(st.limitedNote.selector)}).length`)) as number;
      if (!n) add("FAIL", "LIMITED-NOTE", `ไม่พบ ${st.limitedNote.selector}`);
    }
    // ทะเบียน
    const inv = invOf(c.page);
    invSeen = inv.filter((r) => a.testids.some((t) => r.re.test(t))).map((r) => r.testid);
    const role = c.viewer.inventoryRole;
    if (role) for (const r of inv.filter((x) => (x.hiddenFor ?? []).includes(role) && invSeen.includes(x.testid))) add("FAIL", "INV-LEAK", `${r.testid} hiddenFor ${role}`);
    gaps = [...new Set(a.noTestid)];
    // สถานะหน้าจอ
    await page.screenshot({ path: png, fullPage: true });

    // กดทุกปุ่ม (เปิด → ถ่ายถ้าเป็น dialog → ปิด · ไม่ submit — POST ถูกตัด)
    const doClicks = !isRef && !st.click && (CLICKS === "all" || (CLICKS === "primary" && c.primary));
    if (doClicks) {
      const cand = inv.filter((r) => r.interactive && invSeen.includes(r.testid) && (CLICK_TYPES.has(r.expect?.type ?? "") || (r.expect?.type === "mutation" && /-(trigger|open)$/.test(r.testid))));
      const startUrl = `${BASE}${path}`;
      let dirty = false;
      for (const r of cand.slice(0, 60)) {
        const reset = async () => {
          await page.goto(startUrl, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => null);
          await new Promise((x) => setTimeout(x, 300));
          dirty = false;
        };
        if (dirty) await reset();
        const tid = (a.testids.find((t) => r.re.test(t)) ?? r.testid) as string;
        const sel = `[data-testid="${tid}"]`;
        const el = await page.$(sel);
        if (!el) {
          clicks.push({ testid: tid, outcome: "absent-after-reset" });
          continue;
        }
        // ORACLE-EDIT (HR VIS-5a · controller r4) ▸ เปิดกล่อง <details> ที่ซ่อนลิงก์ก่อน (hr-run2-ytd-link อยู่ในกล่อง "ต้องตรวจ") · กดเฉพาะเมื่อสิ่งที่อยู่ใต้จุดกดคือปุ่มนั้นจริง ◂
        const rv = await reveal(page, el);
        if (rv.opened) dirty = true;
        if (!rv.visible) {
          clicks.push({ testid: tid, outcome: `not-visible${rv.opened ? " (after opening details)" : ""}` });
          continue;
        }
        if (!rv.self) {
          clicks.push({ testid: tid, outcome: `obscured by ${rv.hit}` });
          add("WARN", "CLICK-OBSCURED", `${tid}: the click point is covered by ${rv.hit} — not pressed`);
          continue;
        }
        const box = await el.boundingBox();
        if (!box) {
          clicks.push({ testid: tid, outcome: "not-visible" });
          continue;
        }
        const dis = (await el.evaluate((n: Any) => !!(n.disabled || n.getAttribute("aria-disabled") === "true"))) as boolean;
        if (dis) {
          clicks.push({ testid: tid, outcome: "disabled" });
          continue;
        }
        const before = page.url();
        const blockedBefore = ctx.blocked.length;
        const errBefore = ctx.errors.length;
        const dlgBefore = (await page.evaluate(`Array.from(document.querySelectorAll('[role="dialog"], dialog[open], [aria-modal="true"]')).filter(e => e.getBoundingClientRect().width > 0).length`)) as number;
        const detailsBefore = (await page.evaluate(`document.querySelectorAll('details[open]').length`)) as number;
        try {
          await el.click({ delay: 20 });
        } catch (e) {
          clicks.push({ testid: tid, outcome: `click-failed ${(e as Error).message.slice(0, 60)}` });
          dirty = true;
          continue;
        }
        await new Promise((x) => setTimeout(x, 700));
        await page.waitForNetworkIdle({ idleTime: 300, timeout: 8_000 }).catch(() => {});
        if (ctx.blocked.length > blockedBefore) add(r.expect?.type === "mutation" ? "INFO" : "WARN", "POST-BLOCKED", `click ${tid}: ${ctx.blocked.slice(blockedBefore).join(" ; ")}`);
        const crashC = await crashOf(page); // ORACLE-EDIT (HR VIS-5a · controller r4): หน้า error หลังกด = PAGE-CRASH ระบุปุ่มที่ถูกกดจริง ◂
        if (crashC) add("FAIL", "PAGE-CRASH", `pressed ${rv.hit} (inventory ${tid}) → "${crashC}"${ctx.blocked.length > blockedBefore ? " after a blocked request" : " before any request left"}`);
        if (ctx.errors.length > errBefore) add("FAIL", "CLICK-ERROR", `${tid}: ${ctx.errors.slice(errBefore).join(" ; ")}`);
        if (crashC) { // ORACLE-EDIT (HR VIS-5a · controller r4): หน้าพังแล้ว ไม่ตีความต่อ ◂
          clicks.push({ testid: tid, outcome: `page-crash ${crashC}` });
          dirty = true;
          continue;
        }
        if (page.url() !== before) {
          clicks.push({ testid: tid, outcome: `navigated ${page.url().replace(BASE, "")}` });
          const body = (await page.evaluate("document.body.innerText")) as string;
          if (/404|ไม่พบหน้า|This page could not be found/.test(body.slice(0, 400))) add("FAIL", "CLICK-404", `${tid} → ${page.url().replace(BASE, "")}`);
          dirty = true;
          continue;
        }
        const dlg = (await page.evaluate(`Array.from(document.querySelectorAll('[role="dialog"], dialog[open], [aria-modal="true"]')).filter(e => e.getBoundingClientRect().width > 0).length`)) as number;
        const det = (await page.evaluate(`document.querySelectorAll('details[open]').length`)) as number;
        if (dlg > dlgBefore || det > detailsBefore) {
          const cdir = join(dir, "clicks");
          mkdirSync(cdir, { recursive: true });
          const cpng = join(cdir, `${c.viewer.key}-${c.size.id}-${c.lang}-${slug(tid)}.png`);
          await page.screenshot({ path: cpng, fullPage: false });
          // ปิด: Esc → ปุ่มยกเลิก/ปิด → กด summary ซ้ำ
          await page.keyboard.press("Escape");
          await new Promise((x) => setTimeout(x, 300));
          let still = (await page.evaluate(`Array.from(document.querySelectorAll('[role="dialog"], dialog[open], [aria-modal="true"]')).filter(e => e.getBoundingClientRect().width > 0).length`)) as number;
          if (still > dlgBefore) {
            await page.evaluate(`(() => { const d = Array.from(document.querySelectorAll('[role="dialog"], dialog[open], [aria-modal="true"]')).pop(); if (!d) return; const b = d.querySelector('[data-testid$="-cancel"], [data-testid$="-close"]') || Array.from(d.querySelectorAll('button')).find(x => /ยกเลิก|ปิด|Cancel|Close/i.test(x.innerText || x.getAttribute('aria-label') || '')); if (b && b.type !== 'submit') b.click(); })()`);
            await new Promise((x) => setTimeout(x, 300));
            still = (await page.evaluate(`Array.from(document.querySelectorAll('[role="dialog"], dialog[open], [aria-modal="true"]')).filter(e => e.getBoundingClientRect().width > 0).length`)) as number;
          }
          const detStill = (await page.evaluate(`document.querySelectorAll('details[open]').length`)) as number;
          const closed = still <= dlgBefore && detStill <= detailsBefore;
          if (!closed && detStill > detailsBefore && still <= dlgBefore) {
            await el.click().catch(() => {});
            await new Promise((x) => setTimeout(x, 200));
          }
          clicks.push({ testid: tid, outcome: closed ? "dialog-opened-closed" : "dialog-opened-not-closed-by-esc/cancel", png: cpng });
          if (!closed && still > dlgBefore) add("WARN", "MODAL-NO-CLOSE", tid);
          if (!closed) dirty = true;
        } else {
          clicks.push({ testid: tid, outcome: "ui" });
          dirty = true;
        }
      }
    }
    // ORACLE-EDIT (HR VIS-5a · controller r4) ▸ press probe: กดปุ่ม submit ของ state.pressProbe ทีละปุ่ม (POST ถูกตัดเสมอ) · หน้าพังก่อนมีคำขอ = PAGE-CRASH (ปิดผนึก closure ของ server action — A1) ◂
    const doPress = !isRef && !NO_PRESS && !!st.pressProbe?.length && c.lang === "th" && !c.size.mobile;
    if (doPress) {
      const startUrl = `${BASE}${path}`;
      for (const pat of st.pressProbe!) {
        const re = tidRe(pat);
        const tid = a.testids.find((t) => re.test(t));
        if (!tid) {
          clicks.push({ testid: pat, outcome: "press-probe: absent" });
          continue;
        }
        await page.goto(startUrl, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => null);
        await new Promise((x) => setTimeout(x, 300));
        const el = await page.$(`[data-testid="${tid}"]`);
        if (!el) {
          clicks.push({ testid: tid, outcome: "press-probe: absent-after-reset" });
          continue;
        }
        const rv = await reveal(page, el);
        const dis = (await el.evaluate((n: Any) => !!(n.disabled || n.getAttribute("aria-disabled") === "true"))) as boolean;
        if (!rv.visible || !rv.self || dis) {
          clicks.push({ testid: tid, outcome: `press-probe: ${dis ? "disabled" : !rv.visible ? "not-visible" : `obscured by ${rv.hit}`}` });
          continue;
        }
        const bB = ctx.blocked.length, eB = ctx.errors.length;
        await el.click({ delay: 20 }).catch(() => {});
        await new Promise((x) => setTimeout(x, 1_200));
        await page.waitForNetworkIdle({ idleTime: 300, timeout: 8_000 }).catch(() => {});
        const crash = await crashOf(page), sent = ctx.blocked.length > bB;
        if (crash && !sent) add("FAIL", "PAGE-CRASH", `pressed ${rv.hit} (${tid}) → "${crash}" before any request left — the form's server action cannot be serialised (inline "use server" closure)`);
        else if (crash) add("WARN", "BLOCKED-BY-WALKER", `pressed ${tid} → "${crash}" after the walker blocked its request`);
        else if (!sent) add("WARN", "PRESS-PROBE", `pressed ${tid}: no request and no crash (validation / confirm?) — inconclusive`);
        if (ctx.errors.length > eB && !crash) add("FAIL", "CLICK-ERROR", `${tid} (press probe): ${ctx.errors.slice(eB).join(" ; ")}`);
        clicks.push({ testid: tid, outcome: `press-probe: ${crash ? `page-crash ${sent ? "after" : "before"} request` : sent ? "request built (blocked)" : "no request"}` });
      }
    }
  } catch (e) {
    add("FAIL", "SCRIPT", (e instanceof Error ? e.message : String(e)).slice(0, 200));
  } finally {
    await page.close().catch(() => {});
  }
  return { key: c.key, kind: c.kind, state: c.state, row: c.row, page: c.page, v: c.v, viewer: c.viewer.key, size: c.size.id, lang: c.lang, path, status, finalPath, png: existsSync(png) ? png : null, findings, gaps, invSeen, clicks, at: new Date().toISOString() };
}

// ═══════════════════ 10. วน ═══════════════════
mkdirSync(OUT, { recursive: true });
const done = RESUME ? readResults() : new Map<string, Result>();
const todo = SEL.filter((c) => !done.has(c.key));
console.log(`🚶 walk-hr · ${BASE} · ${todo.length}/${SEL.length} ช่อง (resume ${RESUME ? done.size : "off"}) · clicks ${CLICKS} · out ${OUT}`);
let fatal = "";
let browser: Any = null;
let n = 0;
try {
  browser = await launch();
  for (const c of todo) {
    const r = await runCell(browser, c);
    appendFileSync(join(OUT, "results.jsonl"), JSON.stringify(r) + "\n");
    n += 1;
    const bad = r.findings.filter((f) => f.sev === "FAIL" || f.sev === "BLOCKER");
    console.log(`  ${r.findings.some((f) => f.sev === "BLOCKER") ? "⛔" : bad.length ? "❌" : "✅"} [${n}/${todo.length}] ${c.key} HTTP ${r.status}${bad.length ? ` · ${bad.map((f) => f.kind).join(",")}` : ""}${r.clicks.length ? ` · clicks ${r.clicks.length}` : ""}`);
  }
  console.log("🗂  contact sheets …");
  const made = await buildSheets(browser);
  console.log(`🗂  ${made.length} sheets → ${join(OUT, "sheets")}`);
} catch (e) {
  fatal = (e instanceof Error ? (e.stack ?? e.message) : String(e)).slice(0, 400);
} finally {
  await browser?.close().catch(() => {});
  cleanProfile();
  const del = MINE.length ? (await prisma.session.deleteMany({ where: { id: { in: MINE }, userAgent: UA } })).count : 0;
  console.log(`🧹 ลบ session ของรอบนี้ ${del}/${MINE.length}`);
  await prisma.$disconnect?.();
}
const sm: Record<string, Any> = { suite: "walk-hr", base: BASE, ranThisTime: n, fatal: fatal || null, matrix: counts(ALL), ...summarize() };
writeFileSync(join(OUT, "summary.json"), JSON.stringify(sm, null, 1) + "\n");
if (fatal) console.error(`❌ ${fatal}`);
console.log(`\nJSON_SUMMARY ${JSON.stringify({ ...sm, testidGaps: undefined, inventory: undefined })}`);
process.exitCode = fatal || sm.failedCells ? 1 : 0;
