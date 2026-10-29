// QC — SVC D.7 · ค่าน้ำไฟทุกโหมด + หน้ากฎหมาย/VAT (ภาพ หอ 10) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/svc-briefs/svc-brief-d.7.md · ledger/SVC-MASTER-PLAN.md แถว D.7 · ledger/DESIGN-DORM-HOTEL.md §3 A4 + ภาคผนวก ก #9–15 #19–21
//        ledger/SVC-CORE-CONTRACT.md §1.5 §1.7 + ภาคต่อ 28 ต.ค. · ledger/design-dorm/README.md (ไฟ ฿19,824.00 ÷ 4,200 · น้ำ ฿3,840.00 ÷ 240)
//
// กลุ่มข้อ:
//   S  โครงสร้าง: ไฟล์ · facade · คอมโพเนนต์ 'use client' ไม่ลาก server · หน้า/actions มีด่าน · สิทธิ์ dorm.bill.run · def tariffRef · ใช้สูตร D.1 · ไม่เขียนตารางรัฐ
//   B  recordAuthorityBill — ต้นทุนจริง/หน่วย (README) · หน่วยจากมิเตอร์ MAIN · idempotent · audit เมื่อแก้ · ค่าเพี้ยน · รูปบิลส่วนตัว · 10 ทางพร้อมกัน
//   C  utilityCharges มิเตอร์รายห้อง (ต้นทุนจริง · README 59,000/59,472/9,600) · ห้องว่าง/พัก · ไม่มีบิล = บล็อกทุกโหมด · VAT บวกเพิ่ม (เทียบ D.1)
//   T  ตารางอัตรา (DormAuthorityTariff มีวันที่มีผล · override ระดับร้าน · ไม่มีตาราง = บล็อกทุกโหมด)
//   H  มิเตอร์รวมเฉลี่ย ตามคน/ห้อง/พื้นที่ ตรงสตางค์ (ค่าจากข้อสอบ D.1) · VAT บวกเพิ่ม Σ ≤ บิล
//   L  ตัวตรวจรายเดือน + ด่านออกบิล: ต้นทุนลด ⇒ อัตราคงที่เกิน ⇒ STRICT บล็อก / WARN ต้องเจ้าของยอมรับ / OUT_OF_SCOPE ผ่าน · ขั้นต่ำ · เหมาจ่าย · ไม่มีบิล
//   M  โหมดกฎหมาย: เจ้าของเท่านั้น · OUT_OF_SCOPE ในขอบเขตต้องมีหลักฐานไฟล์ส่วนตัว · dormLawModel ล็อกสำหรับผู้จัดการ
//   U  UtilityLawSettings (renderToStaticMarkup) ตามสัญญา DOM §5
//   X  ข้ามร้าน/ข้ามหน่วย · Q ฉากภาพ svcqc · V ภาพ (QC_BASE) · G regression · Z ล้างครบ (รวมตารางรัฐ + ผู้ใช้)
//   PC positive control ที่ต้องเขียวตั้งแต่ก่อนทำ (เครื่องยนต์ R0.3 · สูตร D.1 · ตัวตรวจ D.1)
//
// งวดสัมพัทธ์กับ "เดือนนี้ (ไทย)": PA = เดือนก่อน 2 · PB = เดือนก่อน · PC = เดือนก่อน 3 · ข้อมูลทดสอบอยู่ใต้ tenant ชั่วคราว slug `qc-svc-d7-*`
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.7.mts
//      ต่อท้าย `--no-regression` ข้ามหมวด G (SKIP — ไม่นับผ่าน · iso.sh ทิ้ง env จึงใช้ SVC_D7_NO_REGRESSION=1 ผ่าน iso ไม่ได้)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-d.7";
const SVC_HOST = "ep-mute-scene";
const FORBIDDEN_HOSTS = ["ep-royal-night", "ep-plain-art", "ep-cool-shadow", "ep-weathered-river", "ep-frosty-lab", "ep-fragrant-thunder"];
const RUN_CMD = "bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.7.mts";

// ═══════════════ 0. ด่านฐานข้อมูล ═══════════════
{
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const u = process.env[n] ?? "";
    if (!u) { console.error(`🔴 ${LABEL}: ไม่มี ${n} — รันผ่าน: ${RUN_CMD}`); process.exit(4); }
    const bad = FORBIDDEN_HOSTS.find((h) => u.includes(h));
    if (bad) { console.error(`🔴 ${LABEL}: ${n} ชี้ฐานต้องห้าม (${bad}) — หยุด`); process.exit(4); }
    let hn = "";
    try { hn = new URL(u).hostname; } catch { /* อ่านไม่ได้ = ปฏิเสธ */ }
    if (!hn.includes(SVC_HOST)) { console.error(`🔴 ${LABEL}: ${n} host ไม่ใช่ qc-svc (${SVC_HOST}) — หยุด`); process.exit(4); }
  }
  if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
  if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
}

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const pass = (id: string, name: string) => { cks.push({ id, res: "PASS", sev: "CRITICAL", why: "" }); console.log(`  ✅ [${id}] ${name}`); };
const fail = (id: string, name: string, why: string, sev: Sev) => { cks.push({ id, res: "FAIL", sev, why }); console.log(`  ❌ [${id}] ${name} — ${why}`); };
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => { cks.push({ id, res: "SKIP", sev, why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const chk = (id: string, name: string, ok: boolean, why: string, sev: Sev) => (ok ? pass(id, name) : fail(id, name, why, sev));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);
const J = (x: unknown) => { try { return JSON.stringify(x) ?? String(x); } catch { return String(x); } };
const read = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const THAI = /[฀-๿]/;
const LEGAL_BAD = /ล็อ[กค]ห้อง|ล็อ[กค]ประตู|ตัดน้ำ|ตัดไฟ|ระงับ(การ)?(จ่าย)?(น้ำ|ไฟ)|งด(จ่าย)?(น้ำ|ไฟ)|ยึดทรัพย์|ขนของออก/;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
const REASON = "ผู้เช่าทุกห้องตกลงอัตรานี้เป็นหนังสือ รอที่ปรึกษายืนยัน";

// ═══════════════ งวด (สัมพัทธ์กับเดือนนี้ไทย) ═══════════════
const DAY = 86_400_000;
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const D = (n: number) => addDays(TODAY, n);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const P = (k: number) => { const y = Number(TODAY.slice(0, 4)), m = Number(TODAY.slice(5, 7)) - 1 + k; const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12; return `${yy}-${String(mm + 1).padStart(2, "0")}`; };
const PA = P(-2), PB = P(-1), PC = P(-3);
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_D7_NO_REGRESSION === "1";

// ═══════════════ โหลดโมดูล ═══════════════
const { prisma } = (await import("@/lib/core/db")) as { prisma: any };
const { Prisma } = (await import("@prisma/client" as string)) as any;
const DORM_IDX = "src/lib/modules/dorm/index.ts";
let dorm: any = null;
let dormWhy = "";
if (!existsSync(join(ROOT, DORM_IDX))) dormWhy = `ยังไม่มี ${DORM_IDX}`;
else { try { dorm = await import(pathToFileURL(join(ROOT, DORM_IDX)).href); } catch (e) { dormWhy = `import facade dorm ล้ม: ${errMsg(e)}`; } }
const fn = (name: string): ((...a: any[]) => any) | null => (dorm && typeof dorm[name] === "function" ? dorm[name] : null);
const calc = (await import(pathToFileURL(join(ROOT, "src/lib/modules/dorm/calc.ts")).href)) as any;
const legal = (await import(pathToFileURL(join(ROOT, "src/lib/core/settings/legal/th-rental-2568.ts")).href)) as any;
const settings = (await import("@/lib/core/settings" as string)) as any;

const COMP_FILE = "src/components/dorm/UtilityLawSettings.tsx";
let compMod: any = null;
let compWhy = "";
if (!existsSync(join(ROOT, COMP_FILE))) compWhy = `ยังไม่มี ${COMP_FILE}`;
else { try { compMod = await import(pathToFileURL(join(ROOT, COMP_FILE)).href); } catch (e) { compWhy = `import UtilityLawSettings ล้ม: ${errMsg(e)}`; } }
const React = (await import("react" as string)) as any;
const RDS = (await import("react-dom/server" as string)) as any;
const LawC: any = compMod ? (typeof compMod.default === "function" ? compMod.default : typeof compMod.UtilityLawSettings === "function" ? compMod.UtilityLawSettings : null) : null;
if (compMod && !LawC && !compWhy) compWhy = "UtilityLawSettings.tsx ไม่มี default export ที่เป็นคอมโพเนนต์";

/** ตัวรันข้อ — needs = ชื่อฟังก์ชันใน facade dorm (ขาด = FAIL) · ui = ต้องใช้คอมโพเนนต์ */
async function T(id: string, name: string, needs: string[], body: () => Promise<[boolean, string?]>, sev: Sev = "CRITICAL", ui = false) {
  const miss = needs.filter((n) => !fn(n));
  if (miss.length) return fail(id, name, dorm ? `facade dorm ไม่มี ${miss.join(", ")}` : dormWhy, sev);
  if (ui && !LawC) return fail(id, name, compWhy || "ไม่มีคอมโพเนนต์ UtilityLawSettings", sev);
  try {
    const [ok, why] = await body();
    if (ok) pass(id, name); else fail(id, name, why ?? "ไม่ตรง", sev);
  } catch (e) {
    fail(id, name, `throw: ${errMsg(e)}`, sev);
  }
}

// ═══════════════ ตัวช่วย render ═══════════════
const noopAsync = async () => ({ ok: true });
const ACTIONS = { save: noopAsync, reset: noopAsync, setLegalMode: noopAsync, recordBill: noopAsync, accept: noopAsync };
const render = (model: unknown): string => String(RDS.renderToStaticMarkup(React.createElement(LawC, { model, unitSlug: "qc-d7", actions: ACTIONS }))).replace(/<!-- -->/g, "");
const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
const textOf = (html: string) => unesc(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const attrsOf = (openTag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of openTag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:="([^"]*)")?/g)) if (m[1] !== openTag.slice(1).split(/[\s>]/)[0]) out[m[1].toLowerCase()] = unesc(m[2] ?? "");
  return out;
};
/** ตัดกล่องทุกตัวที่มี attr ชื่อนี้ (แท็กสมดุล) → { attrs, html } */
function boxes(html: string, attr: string): { attrs: Record<string, string>; html: string }[] {
  const out: { attrs: Record<string, string>; html: string }[] = [];
  const re = new RegExp(`\\s${attr}(?:="|[\\s/>])`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const open = html.lastIndexOf("<", m.index);
    const openEnd = html.indexOf(">", m.index);
    const openTag = html.slice(open, openEnd + 1);
    const tag = /^<([a-zA-Z0-9-]+)/.exec(openTag)?.[1] ?? "div";
    let end = openEnd + 1;
    if (!openTag.endsWith("/>") && !["input", "img", "br", "hr"].includes(tag)) {
      const tagRe = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "g");
      tagRe.lastIndex = open;
      let depth = 0;
      let mm: RegExpExecArray | null;
      while ((mm = tagRe.exec(html))) {
        if (mm[2] === "/") { if (depth === 0) { end = tagRe.lastIndex; break; } continue; }
        depth += mm[1] === "/" ? -1 : 1;
        if (depth === 0) { end = tagRe.lastIndex; break; }
      }
    }
    out.push({ attrs: attrsOf(openTag), html: html.slice(open, end) });
  }
  return out;
}
/** ตัวเลือก (ปุ่ม/อินพุต) ถูกปิด: disabled บนตัวเอง หรือ input/button ข้างในทุกตัว disabled */
const isDisabled = (b: { attrs: Record<string, string>; html: string }) => {
  if ("disabled" in b.attrs || b.attrs["aria-disabled"] === "true") return true;
  const ctl = [...b.html.matchAll(/<(input|button)\b[^>]*>/g)].map((x) => attrsOf(x[0]));
  return ctl.length > 0 && ctl.every((a) => "disabled" in a);
};

// ═══════════════ ล้างข้อมูล: ทุกตารางที่มี "tenantId" + ตารางรัฐ + ผู้ใช้ ═══════════════
let tenantTables: string[] | null = null;
async function tablesWithTenant(): Promise<string[]> {
  if (tenantTables) return tenantTables;
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  tenantTables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  return tenantTables;
}
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  const tables = await tablesWithTenant();
  let pending = [...tables];
  for (let pass = 0; pass < 10 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) {
      try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); }
      catch { next.push(t); }
    }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await prisma.tenant.deleteMany({ where: { id: { in: tids } } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
async function leftovers(tids: string[]): Promise<{ table: string; n: number }[]> {
  const out: { table: string; n: number }[] = [];
  if (tids.length) {
    for (const t of await tablesWithTenant()) {
      const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids);
      const n = Number(r[0]?.n ?? 0);
      if (n) out.push({ table: t, n });
    }
    const tn = await prisma.tenant.count({ where: { id: { in: tids } } });
    if (tn) out.push({ table: "Tenant", n: tn });
  }
  return out;
}

const TARIFF_PREFIX = "QCD7-";
const USER_MAIL = "qc-svc-d7-";
const tenantIds: string[] = [];
const userIds: string[] = [];
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d7-" } }, select: { id: true } });
  if (stale.length) { console.log(`  (กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await prisma.dormAuthorityTariff.deleteMany({ where: { tariffCode: { startsWith: TARIFF_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: USER_MAIL } } });

  // ═══════════════ S. โครงสร้าง ═══════════════
  console.log("\n── S โครงสร้าง ──");
  const F = {
    utility: "src/lib/modules/dorm/utility.ts",
    law: "src/lib/modules/dorm/law.ts",
    index: DORM_IDX,
    comp: COMP_FILE,
    nav: "src/components/dorm/DormSettingsNav.tsx",
    page: "src/app/app/u/[unitSlug]/dorm/settings/utility/page.tsx",
    actions: "src/app/app/u/[unitSlug]/dorm/settings/utility/actions.ts",
    scene: "scripts/svc-qc-utility-scene.mts",
  };
  {
    const miss = Object.values(F).filter((p) => !existsSync(join(ROOT, p)));
    chk("S-1", "มีไฟล์ของใบครบ (utility.ts · law.ts · UtilityLawSettings.tsx · DormSettingsNav.tsx · settings/utility/page.tsx · actions.ts · ฉาก svc-qc-utility-scene.mts)", !miss.length, `ขาด ${miss.join(", ")}`, "CRITICAL");
  }
  const API = ["recordAuthorityBill", "utilityCharges", "utilityBillingGate", "acceptUtilityLegalWarn", "setDormLegalMode", "dormLawModel", "authorityTariffFor"];
  {
    const miss = API.filter((n) => !fn(n));
    const d6 = ["submitReadings", "periodUsage", "dormAccess"].filter((n) => !fn(n));
    chk("S-2", "facade @/lib/modules/dorm export ครบ 7 ชื่อของ D.7 (§3) · ของ D.6 ยังอยู่", !miss.length && !d6.length, dorm ? `ขาด ${[...miss, ...d6].join(", ")}` : dormWhy, "CRITICAL");
  }
  const importsOf = (src: string) => [...src.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => ({ typeOnly: !!m[1], spec: m[2] }))
    .concat([...src.matchAll(/^\s*import\s+["']([^"']+)["']/gm)].map((m) => ({ typeOnly: false, spec: m[1] })))
    .concat([...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => ({ typeOnly: false, spec: m[1] })));
  const compSrc = read(F.comp);
  const navSrc = read(F.nav);
  {
    const useClient = (s: string) => /^(?:\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*["']use client["']/.test(s);
    const BAD = (s: string) => /^@prisma\//.test(s) || /^@\/lib\//.test(s) || /actions$/.test(s) || /^next\//.test(s);
    const bad = [compSrc, navSrc].flatMap((s) => importsOf(s).filter((i) => !i.typeOnly && BAD(i.spec)).map((i) => i.spec));
    const prismaWord = /\bprisma\b|tenantDb\(/.test(stripComments(compSrc + navSrc));
    chk("S-3", "UtilityLawSettings + DormSettingsNav: 'use client' · ไม่ import prisma/@/lib (ค่า)/actions/next/* (ได้เฉพาะ import type · settings-shared · ./DormSettingsNav · react) — action รับทาง prop",
      !!compSrc && !!navSrc && useClient(compSrc) && !bad.length && !prismaWord, compSrc ? `use client=${useClient(compSrc)} import ต้องห้าม=${bad.join(",") || "—"} prisma=${prismaWord}` : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    const p = read(F.page);
    const ok = !!p && !/^\s*["']use client["']/.test(p) && /requireUnit\s*\(/.test(p) && /["']DORM["']/.test(p) && /notFound\s*\(/.test(p) && /dormAccess\s*\(/.test(p) && /\.board\b/.test(p)
      && /from\s+["']@\/lib\/modules\/dorm["']/.test(p) && !/["']@\/lib\/modules\/dorm\//.test(p) && !/@\/lib\/core\/db|@prisma\//.test(p) && /UtilityLawSettings/.test(p) && /dormLawModel\s*\(/.test(p);
    chk("S-4", "หน้า /dorm/settings/utility: server component · requireUnit + DORM · dormAccess(...).board ไม่ผ่าน ⇒ notFound · dormLawModel ผ่าน facade · ส่งเข้า UtilityLawSettings · ไม่แตะ prisma", ok, p ? "ขาดด่าน/facade/คอมโพเนนต์ (ดู §5)" : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    const a = read(F.actions);
    const code = stripComments(a);
    const firstUseServer = /^\s*["']use server["']/.test(code);
    const exportsAll = [...code.matchAll(/^\s*export\s+(?!async\s+function)(\S+)/gm)].map((m) => m[1]);
    const names = ["recordAuthorityBillAction", "acceptUtilityLegalAction", "setDormLegalModeAction"].filter((n) => !new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(code));
    const gate = /requireUnit\s*\(/.test(code) && /["']dorm\.bill\.run["']/.test(code) && /["']DORM["']/.test(code);
    const trustInput = /input\??\.(tenantId|actorUserId)|tenantId\s*:\s*input\.|actorUserId\s*:\s*input\./.test(code);
    const floatMoney = /parseFloat\([^)]*\)\s*\*\s*100|Number\([^)]*\)\s*\*\s*100/.test(code);
    chk("S-5", "actions.ts: 'use server' · export async function เท่านั้น (3 ชื่อ) · requireUnit + DORM + ด่าน dorm.bill.run · ร้าน/ผู้กระทำจาก session · ไม่แปลงเงินด้วยทศนิยม×100",
      !!a && firstUseServer && !exportsAll.length && !names.length && gate && !trustInput && !floatMoney,
      a ? `use server=${firstUseServer} export อื่น=${exportsAll.join(",") || "—"} ขาด=${names.join(",") || "—"} ด่าน=${gate} input→tenant/actor=${trustInput} float×100=${floatMoney}` : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    let why = "";
    try {
      const pm = (await import("@/lib/core/permissions" as string)) as any;
      if (!pm.isPermissionKey?.("dorm.bill.run")) why = "dorm.bill.run ไม่อยู่ในทะเบียน";
      else {
        const l = pm.permissionLabel?.("dorm.bill.run");
        if (typeof l !== "string" || l === "dorm.bill.run" || !THAI.test(l)) why = "dorm.bill.run ไม่มีป้ายไทย";
        if (pm.moduleOfPermissionKey?.("dorm.bill.run") !== "dorm") why += ` module=${pm.moduleOfPermissionKey?.("dorm.bill.run")}`;
      }
    } catch (e) { why = `import permissions ล้ม: ${errMsg(e)}`; }
    chk("S-6", "permissions.ts: คีย์ dorm.bill.run (โมดูล dorm · ป้ายไทย)", !why, why, "MAJOR");
  }
  {
    const why: string[] = [];
    for (const k of ["rooms.utility.elec.tariffRef", "rooms.utility.water.tariffRef"]) {
      const d = settings.getDef(k);
      if (!d) { why.push(`${k} ไม่มี`); continue; }
      const sch = d.schema;
      const okSchema = sch.safeParse("PEA:1.1.2").success && sch.safeParse(null).success && !sch.safeParse("PEA 1.1.2").success && !sch.safeParse("XYZ:1").success;
      if (d.type !== "text" || !d.chain?.includes("UNIT") || !d.chain?.includes("BUILDING") || !okSchema || !THAI.test(d.labelTh ?? "")) why.push(`${k} type=${d.type} chain=${J(d.chain)} schema=${okSchema}`);
      if (!(settings.SNAPSHOT_KEYS?.bill ?? []).includes(k)) why.push(`${k} ไม่อยู่ใน SNAPSHOT_KEYS.bill`);
    }
    chk("S-7", "defs rooms: rooms.utility.{elec,water}.tariffRef (text · \"PEA:1.1.2\" · nullable · ชั้น UNIT/BUILDING · ป้ายไทย) + อยู่ใน SNAPSHOT_KEYS.bill", !why.length, why.join(" · "), "MAJOR");
  }
  const dormSrc = [F.utility, F.law];
  {
    const raw = dormSrc.filter((f) => /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(read(f)));
    const anyUse = dormSrc.concat([F.comp, F.nav, F.page, F.actions]).filter((f) => /:\s*any\b|as\s+any\b|<any>/.test(stripComments(read(f))));
    const getDay = dormSrc.concat([F.comp, F.actions]).filter((f) => /\.getDay\(\)|\.getDate\(\)|\.getMonth\(\)/.test(stripComments(read(f))));
    chk("S-8", "ไฟล์ใหม่: ไม่ import prisma ดิบ (F5.1) · ไม่มี any · ไม่มี getDay/getDate/getMonth ดิบ", existsSync(join(ROOT, F.utility)) && !raw.length && !anyUse.length && !getDay.length,
      existsSync(join(ROOT, F.utility)) ? `prisma ดิบ=${raw.join(",") || "—"} any=${anyUse.join(",") || "—"} getDay=${getDay.join(",") || "—"}` : "ยังไม่มี utility.ts", "MAJOR");
  }
  {
    const u = stripComments(read(F.utility) + read(F.law));
    const need = ["actualCostRate", "allocateShared", "computeBill", "evaluateLegal", "legalScope", "periodUsage", "occupancyRange", "isValidOutOfScopeReason", "setSettings", "loadSettingsForm"];
    const miss = need.filter((n) => !new RegExp(`\\b${n}\\b`).test(u));
    const line = /\butilityLine\b|\butilityCharge\b/.test(u);
    chk("S-9", "ใช้ชิ้นเดิม (ไม่เขียนสูตร/ตัวตรวจซ้ำ): actualCostRate · utilityLine/utilityCharge · allocateShared · computeBill · evaluateLegal · legalScope · periodUsage · occupancyRange · setSettings · loadSettingsForm", !!u && !miss.length && line,
      u ? `ขาด ${[...miss, ...(line ? [] : ["utilityLine/utilityCharge"])].join(", ") || "—"}` : "ยังไม่มีไฟล์", "MAJOR");
  }
  {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const ent of (spawnSync("ls", ["-1p", join(ROOT, dir)], { encoding: "utf8" }).stdout ?? "").split("\n").filter(Boolean)) {
        if (ent.endsWith("/")) walk(`${dir}/${ent.slice(0, -1)}`); else if (/\.(ts|tsx)$/.test(ent)) files.push(`${dir}/${ent}`);
      }
    };
    walk("src");
    const writes = files.filter((f) => /dormAuthorityTariff\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/.test(read(f)));
    chk("S-10", "ไม่มีโค้ดใน src เขียนตารางรัฐ DormAuthorityTariff (อ่านอย่างเดียว · D.0)", !writes.length, `เขียนที่ ${writes.join(", ")}`, "MAJOR");
  }
  {
    const all = [F.comp, F.nav, F.page, F.actions, F.utility, F.law].map(read).join("\n");
    const bad = LEGAL_BAD.exec(all);
    chk("S-11", "จอ/หน้า/service ไม่มีคำต้องห้าม สคบ. (ตัดไฟ/ตัดน้ำ/ล็อกห้อง…)", !!compSrc && !bad, compSrc ? `พบ ${bad?.[0]}` : "ยังไม่มีคอมโพเนนต์", "CRITICAL");
  }
  const SV = (await import("./svc-qc-data.mjs" as string)) as any;
  {
    const specs = SV.SQC_VISUAL_SPECS?.["d.7"];
    const fai = (SV.SQC_USERS ?? []).find((u: any) => u.key === "fai");
    const ok = Array.isArray(specs) && specs.some((s: any) => s.path === `/app/u/${SV.SQC_UNITS.dorm.slug}/dorm/settings/utility`) && fai?.permissions?.["dorm.view"] === true;
    chk("S-12", "(เงื่อนไขก่อน · ผู้คุมตั้งแล้ว) svc-qc-data: SQC_VISUAL_SPECS d.7 หน้า /dorm/settings/utility · fai มี dorm.view", !!ok, `specs=${J(specs)}`, "MINOR");
  }
  {
    const fit = read("scripts/fitness.mts");
    const used = new Set<string>();
    const deep: string[] = [];
    for (const f of dormSrc) for (const i of importsOf(read(f))) {
      const m = /^@\/lib\/modules\/([^/]+)(\/.*)?$/.exec(i.spec);
      if (!m || m[1] === "dorm" || i.typeOnly) continue;
      used.add(m[1]);
      if (m[2] && !(m[1] === "kanban" && m[2] === "/links")) deep.push(i.spec);
    }
    const missing = [...used].filter((x) => !fit.includes(`"dorm→${x}"`));
    chk("S-13", "เส้นข้ามโมดูลของไฟล์ใหม่มีใน ALLOWED_EDGES · ผ่าน facade (ไม่ล้วงลึก)", existsSync(join(ROOT, F.utility)) && !missing.length && !deep.length,
      existsSync(join(ROOT, F.utility)) ? `ใช้=${[...used].join(",") || "—"} ขาด=${missing.join(",") || "—"} ล้วงลึก=${deep.join(",") || "—"}` : "ยังไม่มี utility.ts", "MAJOR");
  }

  // ═══════════════ PC. positive control (เขียวตั้งแต่ก่อนทำ) ═══════════════
  console.log("\n── PC positive control (ชิ้นเดิม · ต้องเขียวตั้งแต่ก่อน builder) ──");
  {
    const r = [calc.actualCostRate({ billSatang: 1_982_400, units: 4200 }), calc.actualCostRate({ billSatang: 384_000, units: 240 }),
      calc.utilityCharge({ method: { kind: "ACTUAL_COST", billSatang: 1_982_400, billUnits: 4200 }, units: 125 }).amountSatang,
      calc.utilityCharge({ method: { kind: "ACTUAL_COST", billSatang: 1_982_400, billUnits: 4200 }, units: 126 }).amountSatang,
      calc.utilityCharge({ method: { kind: "ACTUAL_COST", billSatang: 384_000, billUnits: 240 }, units: 6 }).amountSatang];
    chk("PC-2", "สูตร D.1: ต้นทุนไฟ 472 · น้ำ 1600 · 125 หน่วย 59,000 · 126 หน่วย 59,472 · น้ำ 6 หน่วย 9,600 (README)", J(r) === J([472, 1600, 59_000, 59_472, 9_600]), J(r), "CRITICAL");
  }
  {
    const inp = { rateSatangPerUnit: 450, authorityBillSatang: 1_848_000, authorityUnits: 4200 };
    const s = legal.evaluateLegal("UTIL_FIXED_RATE_LE_COST", inp, { mode: "STRICT" });
    const w = legal.evaluateLegal("UTIL_FIXED_RATE_LE_COST", inp, { mode: "WARN" });
    const o = legal.evaluateLegal("UTIL_FIXED_RATE_LE_COST", inp, { mode: "OUT_OF_SCOPE", outOfScopeReason: REASON });
    const ok45 = legal.evaluateLegal("UTIL_FIXED_RATE_LE_COST", { ...inp, authorityBillSatang: 1_982_400 }, { mode: "STRICT" });
    const ok = s.level === "BLOCK" && w.level === "WARN" && w.needsOwnerApproval === true && o.level === "OK" && o.raw === "BLOCK" && ok45.level === "OK";
    chk("PC-3", "ตัวตรวจ D.1: อัตรา ฿4.50 vs ต้นทุน ฿4.40 ⇒ STRICT BLOCK · WARN WARN+เจ้าของอนุมัติ · นอกขอบเขต OK (raw BLOCK) · vs ฿4.72 ⇒ OK", ok, J({ s: s.level, w: [w.level, w.needsOwnerApproval], o: [o.level, o.raw], ok45: ok45.level }), "CRITICAL");
  }

  // ═══════════════ fixtures ═══════════════
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tA = await prisma.tenant.create({ data: { name: "QC D7 A", slug: `qc-svc-d7-a-${stamp}` } }); tenantIds.push(tA.id);
  const tB = await prisma.tenant.create({ data: { name: "QC D7 B", slug: `qc-svc-d7-b-${stamp}` } }); tenantIds.push(tB.id);
  const A = tA.id, B = tB.id;
  const mkUnit = async (tenantId: string, type: string, tag: string) => (await prisma.businessUnit.create({ data: { tenantId, type, name: `หอ D7 ${tag}`, slug: `d7${tag}-${stamp}` } })).id as string;
  const DU = await mkUnit(A, "DORM", "u");    // README · มิเตอร์รายห้อง ต้นทุนจริง
  const DV = await mkUnit(A, "DORM", "v");    // VAT บวกเพิ่ม
  const DT = await mkUnit(A, "DORM", "t");    // ตารางอัตรา
  const DS = await mkUnit(A, "DORM", "s");    // มิเตอร์รวม
  const DL = await mkUnit(A, "DORM", "l");    // ตัวตรวจรายเดือน
  const DM3 = await mkUnit(A, "DORM", "m3");  // โหมดกฎหมาย (3 ห้อง = ในขอบเขต)
  const DM2 = await mkUnit(A, "DORM", "m2");  // โหมดกฎหมาย (2 ห้อง = นอกขอบเขต)
  const HA = await mkUnit(A, "HOTEL", "h");
  const DBx = await mkUnit(B, "DORM", "b");

  // ผู้ใช้ (User global · ลบเองใน finally)
  const mkUser = async (tenantId: string, tag: string, role: string, unitAccess: string[], perms: Record<string, boolean> = {}) => {
    const id = `qc-d7-${tag}-${stamp}`;
    await prisma.user.create({ data: { id, email: `${USER_MAIL}${tag}-${stamp}@qc.invalid`, name: `QC D7 ${tag}` } });
    userIds.push(id);
    await prisma.membership.create({ data: { userId: id, tenantId, role, unitAccess, permissions: perms, acceptedAt: new Date() } });
    return { role, unitAccess, permissions: perms, userId: id };
  };
  const OWN = await mkUser(A, "owner", "OWNER", ["*"]);
  const MGR = await mkUser(A, "manager", "MANAGER", [DU, DV, DT, DS, DL, DM3, DM2]);
  const STV = await mkUser(A, "staffview", "STAFF", [DU, DL], { "dorm.view": true });
  const OWNB = await mkUser(B, "ownerb", "OWNER", ["*"]);
  const cOwn = { tenantId: A, actorUserId: OWN.userId }, cMgr = { tenantId: A, actorUserId: MGR.userId }, cStv = { tenantId: A, actorUserId: STV.userId };
  const cB = { tenantId: B, actorUserId: OWNB.userId };
  const sctxA = { tenantId: A }, sctxB = { tenantId: B };

  const mkType = async (tenantId: string, unitId: string, areaSqm: number | null = 24) =>
    (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: `มาตรฐาน ${areaSqm ?? "-"}`, capacity: 2, baseRateSatang: 450000, depositSatang: 0, rentMode: "MONTHLY", areaSqm } })).id as string;
  const mkBld = async (tenantId: string, unitId: string, name: string) => (await prisma.roomBuilding.create({ data: { tenantId, unitId, name, floors: 3, sortOrder: 1 } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, typeId: string, bld: string | null, number: string) =>
    (await prisma.hotelRoom.create({ data: { tenantId, unitId, roomTypeId: typeId, number, buildingId: bld, floorNo: 1, floor: "1" } })).id as string;
  const occ = (tenantId: string, unitId: string, roomId: string, refType: string, refId: string) =>
    prisma.roomOccupancy.create({ data: { tenantId, unitId, roomId, startDate: dbDate(D(-400)), endDate: dbDate(D(400)), kind: "LEASE", refType, refId } });
  const leaseWith = async (tenantId: string, unitId: string, roomId: string, coTenants: unknown) => {
    const l = await prisma.dormLease.create({ data: { tenantId, unitId, roomId, partyId: `qc-d7-party-${roomId}`, status: "ACTIVE", startDate: dbDate(D(-400)), endDate: dbDate(D(400)), rentSatang: 450000, coTenants } });
    const o = await occ(tenantId, unitId, roomId, "DormLease", l.id);
    await prisma.dormLease.update({ where: { id: l.id }, data: { occupancyId: o.id } });
  };
  const mkMeter = async (tenantId: string, unitId: string, roomId: string | null, kind: string, startReading: number, buildingId: string | null = null) =>
    (await prisma.dormMeter.create({ data: { tenantId, unitId, roomId, kind, role: roomId ? "ROOM" : "MAIN", startReading, buildingId } })).id as string;
  const rd = (tenantId: string, unitId: string, meterId: string, periodKey: string, value: number, extra: Record<string, unknown> = {}) =>
    prisma.dormMeterReading.create({ data: { tenantId, unitId, meterId, periodKey, kind: "PERIOD", value, source: "IMPORT", readAt: new Date(`${periodKey}-25T03:00:00Z`), ...extra } });
  /** ตั้งค่าตั้ง (ลบแถวเดิมของคีย์/ชั้นก่อน) · value undefined = ลบอย่างเดียว (กลับไปใช้ค่าแม่แบบ) */
  const setVal = async (tenantId: string, key: string, scope: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope, scopeId } });
    if (value !== undefined) await prisma.settingValue.create({ data: { tenantId, key, scope, scopeId, value: value === null ? Prisma.JsonNull : value, setById: "qc-d7" } });
  };
  const U = (unitId: string, key: string, value: unknown) => setVal(A, key, "UNIT", unitId, value);

  // ── DU (README · บ้านสวน): อาคาร A · ห้อง 101–105 · 104 ว่าง · 105 เลขถอยหลัง (พัก) ──
  const tyU = await mkType(A, DU);
  const bU = await mkBld(A, DU, "อาคาร A");
  const RU: Record<string, string> = {};
  for (const no of ["101", "102", "103", "104", "105"]) RU[no] = await mkRoom(A, DU, tyU, bU, no);
  for (const no of ["101", "102", "103", "105"]) await occ(A, DU, RU[no], "QcD7", `occ-${no}`);
  const EU: Record<string, string> = {};
  for (const [no, s] of [["101", 1287], ["102", 2000], ["103", 500], ["104", 0], ["105", 8904]] as const) EU[no] = await mkMeter(A, DU, RU[no], "ELEC", s);
  const WU101 = await mkMeter(A, DU, RU["101"], "WATER", 312);
  const MAINU = await mkMeter(A, DU, null, "ELEC", 10_000, bU);
  for (const [m, v] of [[EU["101"], 1412], [EU["102"], 2126], [EU["103"], 510], [EU["104"], 18], [WU101, 318], [MAINU, 14_200]] as const) await rd(A, DU, m, PA, v);
  await rd(A, DU, EU["105"], PA, 126, { flag: "BACKWARDS" });
  for (const [m, v] of [[EU["101"], 1532], [EU["102"], 2226], [EU["103"], 520], [WU101, 320], [MAINU, 18_200]] as const) await rd(A, DU, m, PB, v);

  // ── DV: VAT บวกเพิ่ม · V1 125 หน่วย · V2 6 หน่วย ──
  const tyV = await mkType(A, DV);
  const bV = await mkBld(A, DV, "อาคาร V");
  const RV1 = await mkRoom(A, DV, tyV, bV, "V1"), RV2 = await mkRoom(A, DV, tyV, bV, "V2");
  await occ(A, DV, RV1, "QcD7", "occ-v1"); await occ(A, DV, RV2, "QcD7", "occ-v2");
  const EV1 = await mkMeter(A, DV, RV1, "ELEC", 1287), EV2 = await mkMeter(A, DV, RV2, "ELEC", 312);
  await rd(A, DV, EV1, PA, 1412); await rd(A, DV, EV2, PA, 318);

  // ── DT: ตารางอัตรา (ไฟ TARIFF + tariffRef · น้ำ TARIFF ไม่มีตาราง) ──
  const TCODE = `${TARIFF_PREFIX}${stamp}`.slice(0, 20);
  const TIERS = [{ uptoUnits: 150, rateE4: 32_484 }, { uptoUnits: 400, rateE4: 42_218 }, { uptoUnits: null, rateE4: 44_217 }];
  await prisma.dormAuthorityTariff.create({ data: { authority: "PEA", kind: "ELEC", tariffCode: TCODE, label: "QC D7 ชุด 1", effectiveFrom: dbDate(`${P(-12)}-01`), effectiveTo: dbDate(`${PB}-01`), tiers: TIERS, ftE4: 3972 } });
  await prisma.dormAuthorityTariff.create({ data: { authority: "PEA", kind: "ELEC", tariffCode: TCODE, label: "QC D7 ชุด 2", effectiveFrom: dbDate(`${PB}-01`), effectiveTo: null, tiers: TIERS, ftE4: 5000 } });
  const tyT = await mkType(A, DT);
  const bT = await mkBld(A, DT, "อาคาร T");
  const RT1 = await mkRoom(A, DT, tyT, bT, "T1"), RT2 = await mkRoom(A, DT, tyT, bT, "T2");
  await occ(A, DT, RT1, "QcD7", "occ-t1"); await occ(A, DT, RT2, "QcD7", "occ-t2");
  const ET1 = await mkMeter(A, DT, RT1, "ELEC", 0), ET2 = await mkMeter(A, DT, RT2, "ELEC", 0), WT1 = await mkMeter(A, DT, RT1, "WATER", 0);
  await rd(A, DT, ET1, PA, 125); await rd(A, DT, ET2, PA, 200); await rd(A, DT, WT1, PA, 5);
  await rd(A, DT, ET1, PB, 256); await rd(A, DT, ET2, PB, 650);
  await U(DT, "rooms.utility.elec.method", "TARIFF");
  await U(DT, "rooms.utility.elec.tariffRef", `PEA:${TCODE}`);
  await U(DT, "rooms.utility.water.method", "TARIFF");

  // ── DS: มิเตอร์รวม (ไฟ) · S1 24 ตร.ม. 1 คน · S2 24 ตร.ม. 2 คน · S3 32 ตร.ม. 3 คน (+รถ 1 คัน ไม่นับ) · coTenants รูป D.5 {occupants, vehicles} · S4 ว่าง ──
  const tyS24 = await mkType(A, DS, 24), tyS32 = await mkType(A, DS, 32);
  const bS = await mkBld(A, DS, "อาคาร S");
  const RS: Record<string, string> = {};
  for (const [no, ty] of [["S1", tyS24], ["S2", tyS24], ["S3", tyS32], ["S4", tyS24]] as const) RS[no] = await mkRoom(A, DS, ty, bS, no);
  await leaseWith(A, DS, RS["S1"], { occupants: [], vehicles: [] });
  await leaseWith(A, DS, RS["S2"], { occupants: [{ name: "ผู้พักร่วม ก", phone: null }], vehicles: [] });
  await leaseWith(A, DS, RS["S3"], { occupants: [{ name: "ผู้พักร่วม ข", phone: null }, { name: "ผู้พักร่วม ค", phone: null }], vehicles: [{ plate: "กข 1234", kind: "CAR", note: null }] });
  await U(DS, "rooms.utility.elec.metering", "SHARED_METER");

  // ── DL: ตัวตรวจรายเดือน · ไฟอัตราคงที่ ฿4.50 · L1 100/100 หน่วย · L2 50/50 หน่วย ──
  const tyL = await mkType(A, DL);
  const bL = await mkBld(A, DL, "อาคาร L");
  const RL1 = await mkRoom(A, DL, tyL, bL, "L1"), RL2 = await mkRoom(A, DL, tyL, bL, "L2");
  await occ(A, DL, RL1, "QcD7", "occ-l1"); await occ(A, DL, RL2, "QcD7", "occ-l2");
  const EL1 = await mkMeter(A, DL, RL1, "ELEC", 0), EL2 = await mkMeter(A, DL, RL2, "ELEC", 0);
  await rd(A, DL, EL1, PA, 100); await rd(A, DL, EL2, PA, 50);
  await rd(A, DL, EL1, PB, 200); await rd(A, DL, EL2, PB, 100);
  await U(DL, "rooms.utility.elec.method", "FIXED_RATE");
  await U(DL, "rooms.utility.elec.fixedRate", 450);

  // ── DM3 (3 ห้อง) · DM2 (2 ห้อง) ──
  const tyM3 = await mkType(A, DM3), tyM2 = await mkType(A, DM2);
  for (const no of ["M1", "M2", "M3"]) await mkRoom(A, DM3, tyM3, null, no);
  for (const no of ["N1", "N2"]) await mkRoom(A, DM2, tyM2, null, no);
  const fPriv = (await prisma.fileAsset.create({ data: { tenantId: A, kind: "ATTACHMENT", path: `t/${A}/private/attachment/qc-d7-evidence.pdf`, cdnUrl: "private", contentType: "application/pdf", bytes: 10 } })).id as string;
  const fPub = (await prisma.fileAsset.create({ data: { tenantId: A, kind: "ATTACHMENT", path: `t/${A}/attachment/qc-d7-public.jpg`, cdnUrl: "https://cdn.invalid/x.jpg", contentType: "image/jpeg", bytes: 10 } })).id as string;
  const fForeign = (await prisma.fileAsset.create({ data: { tenantId: B, kind: "ATTACHMENT", path: `t/${B}/private/attachment/qc-d7-b.pdf`, cdnUrl: "private", contentType: "application/pdf", bytes: 10 } })).id as string;

  // ── ร้าน B: หอ 1 ห้อง + บิลงวดเดียวกัน (ต้องไม่ปนกับร้าน A) ──
  const tyB = await mkType(B, DBx);
  const bB = await mkBld(B, DBx, "อาคาร B");
  const RB1 = await mkRoom(B, DBx, tyB, bB, "B1");
  await occ(B, DBx, RB1, "QcD7", "occ-b1");
  await prisma.dormUtilityRate.create({ data: { tenantId: B, unitId: DBx, buildingId: null, kind: "ELEC", periodKey: PA, mode: "ACTUAL_COST", authorityBillSatang: 1, authorityUnits: 1, rateSatangPerUnit: 1 } });

  const VEX = { registered: true, pricesIncludeVat: false };
  const rec = (ctx: any, input: Record<string, unknown>, deps?: any): Promise<any> => fn("recordAuthorityBill")!(ctx, input, deps);
  const charges = (ctx: any, unitId: string, periodKey: string): Promise<any> => fn("utilityCharges")!(ctx, { unitId, periodKey });
  const gate = (ctx: any, unitId: string, periodKey: string): Promise<any> => fn("utilityBillingGate")!(ctx, { unitId, periodKey });
  const rowOf = (ch: any, roomId: string, kind: string) => (ch?.rows ?? []).find((r: any) => r.roomId === roomId && r.kind === kind);
  const grpOf = (ch: any, kind: string, buildingId?: string | null) => (ch?.groups ?? []).find((g: any) => g.kind === kind && (buildingId === undefined || g.buildingId === buildingId));
  const codes = (items: any[] | undefined, kind?: string) => (items ?? []).filter((i: any) => !kind || i.kind === kind).map((i: any) => i.code).sort();
  const rateRow = (unitId: string, kind: string, periodKey: string, buildingId: string | null) => prisma.dormUtilityRate.findFirst({ where: { tenantId: A, unitId, kind, periodKey, buildingId } });
  const auditOf = (action: string) => prisma.auditLog.findMany({ where: { tenantId: A, action }, orderBy: { createdAt: "asc" } });
  const grossOf = (amount: number, vat: { registered: boolean; pricesIncludeVat: boolean }, taxKind = "VAT7") =>
    calc.computeBill({ lines: [{ code: "ELEC", labelTh: "ค่าไฟฟ้า", amountSatang: amount, taxKind }], vat }).totalSatang as number;

  {
    let why = "";
    try {
      const pu = await fn("periodUsage")!({ tenantId: A }, { unitId: DU, periodKey: PA });
      const by = (m: string) => (pu ?? []).find((x: any) => x.meterId === m);
      const pb = await fn("periodUsage")!({ tenantId: A }, { unitId: DU, periodKey: PB });
      const main = (pb ?? []).find((x: any) => x.meterId === MAINU);
      const rooms = (await import("@/lib/modules/rooms" as string)) as any;
      const occs = await rooms.occupancyRange({ tenantId: A }, { unitId: DU, start: `${PA}-01`, end: `${PB}-01` });
      const occRooms = new Set((occs ?? []).map((o: any) => o.roomId));
      const got = [by(EU["101"])?.units, by(EU["102"])?.units, by(WU101)?.units, by(EU["105"])?.held, by(EU["105"])?.units, by(MAINU)?.units, main?.units, occRooms.has(RU["104"]), occRooms.has(RU["101"])];
      if (J(got) !== J([125, 126, 6, true, null, 4200, 4000, false, true])) why = `ได้ ${J(got)}`;
    } catch (e) { why = `throw ${errMsg(e)}`; }
    chk("PC-4", "ฉากทดสอบถูก (D.6 periodUsage + rooms occupancyRange ของเดิม): 101 ไฟ 125 · 102 ไฟ 126 · 101 น้ำ 6 · 105 พัก (units null) · MAIN PA 4,200 / PB 4,000 · 104 ว่าง · 101 มีผู้เช่า", !why, why, "CRITICAL");
  }

  // ═══════════════ B. ใส่บิลการไฟฟ้า/ประปา ═══════════════
  console.log("\n── B recordAuthorityBill ──");
  await T("B-1", "ไฟ PA อาคาร A ฿19,824.00 / 4,200 หน่วย ⇒ CREATED · ต้นทุน 472 (฿4.72 README) · unitsSource BILL · แถว DormUtilityRate ครบ (mode ACTUAL_COST · enteredById · legalCheck)", ["recordAuthorityBill"], async () => {
    const r = await rec(cOwn, { unitId: DU, kind: "ELEC", periodKey: PA, buildingId: bU, billSatang: 1_982_400, units: 4200 });
    const row = await rateRow(DU, "ELEC", PA, bU);
    const ok = r?.ok === true && r.status === "CREATED" && r.costRateSatangPerUnit === 472 && r.units === 4200 && r.unitsSource === "BILL" && typeof r.rateId === "string"
      && row?.id === r.rateId && row.authorityBillSatang === 1_982_400 && row.authorityUnits === 4200 && row.rateSatangPerUnit === 472 && row.mode === "ACTUAL_COST" && row.enteredById === OWN.userId
      && row.legalCheck?.level === "OK" && typeof row.legalCheck?.fingerprint === "string";
    return [ok, `${J(r).slice(0, 220)} row=${J(row && { bill: row.authorityBillSatang, u: row.authorityUnits, rate: row.rateSatangPerUnit, mode: row.mode, by: row.enteredById, lc: row.legalCheck?.level })}`];
  });
  await T("B-2", "น้ำ PA ฿3,840.00 / 240 หน่วย ⇒ ต้นทุน 1600 (฿16.00 README)", ["recordAuthorityBill"], async () => {
    const r = await rec(cOwn, { unitId: DU, kind: "WATER", periodKey: PA, buildingId: bU, billSatang: 384_000, units: 240 });
    return [r?.ok === true && r.status === "CREATED" && r.costRateSatangPerUnit === 1600, J(r).slice(0, 200)];
  });
  await T("B-3", "ไม่กรอกหน่วย ⇒ หน่วยมิเตอร์ MAIN ของอาคาร (PB: 14,200→18,200 = 4,000) · unitsSource MAIN_METER · ต้นทุน = actualCostRate (D.1)", ["recordAuthorityBill"], async () => {
    const r = await rec(cOwn, { unitId: DU, kind: "ELEC", periodKey: PB, buildingId: bU, billSatang: 1_848_000 });
    const want = calc.actualCostRate({ billSatang: 1_848_000, units: 4000 });
    return [r?.ok === true && r.units === 4000 && r.unitsSource === "MAIN_METER" && r.costRateSatangPerUnit === want, `${J(r).slice(0, 200)} ต้อง rate ${want}`];
  });
  await T("B-4", "ส่งบิลเดิมซ้ำ ⇒ UNCHANGED · rateId เดิม · updatedAt ไม่ขยับ · ไม่มี audit", ["recordAuthorityBill"], async () => {
    const before = await rateRow(DU, "ELEC", PA, bU);
    const r = await rec(cOwn, { unitId: DU, kind: "ELEC", periodKey: PA, buildingId: bU, billSatang: 1_982_400, units: 4200 });
    const after = await rateRow(DU, "ELEC", PA, bU);
    const au = await auditOf("dorm.utility.bill.updated");
    return [r?.ok === true && r.status === "UNCHANGED" && r.rateId === before?.id && after?.updatedAt?.getTime() === before?.updatedAt?.getTime() && au.length === 0, `${J(r).slice(0, 160)} audit=${au.length}`];
  });
  await T("B-5", "แก้ยอดบิล PB ⇒ UPDATED · อัตราใหม่ = actualCostRate · audit dorm.utility.bill.updated 1 แถวมี before/after", ["recordAuthorityBill"], async () => {
    const r = await rec(cOwn, { unitId: DU, kind: "ELEC", periodKey: PB, buildingId: bU, billSatang: 1_852_000 });
    const want = calc.actualCostRate({ billSatang: 1_852_000, units: 4000 });
    const row = await rateRow(DU, "ELEC", PB, bU);
    const au = await auditOf("dorm.utility.bill.updated");
    const ok = r?.ok === true && r.status === "UPDATED" && r.costRateSatangPerUnit === want && row?.rateSatangPerUnit === want && row?.authorityBillSatang === 1_852_000
      && au.length === 1 && J(au[0].before ?? {}).includes("1848000") && J(au[0].after ?? {}).includes("1852000");
    return [ok, `${J(r).slice(0, 160)} audit=${au.length} ${J(au[0]?.before).slice(0, 80)}→${J(au[0]?.after).slice(0, 80)}`];
  });
  await T("B-6", "ค่าเพี้ยน ⇒ INVALID_INPUT (reason ไทย) ไม่มีแถว: บิลทศนิยม · ติดลบ · kind GAS · งวด 13 · หน่วย 0 · หน่วยทศนิยม", ["recordAuthorityBill"], async () => {
    const n0 = await prisma.dormUtilityRate.count({ where: { tenantId: A } });
    const bad = [
      { billSatang: 1.5, units: 10, kind: "ELEC", periodKey: PC }, { billSatang: -1, units: 10, kind: "ELEC", periodKey: PC }, { billSatang: 100, units: 10, kind: "GAS", periodKey: PC },
      { billSatang: 100, units: 10, kind: "ELEC", periodKey: "2026-13" }, { billSatang: 100, units: 0, kind: "ELEC", periodKey: PC }, { billSatang: 100, units: 2.5, kind: "ELEC", periodKey: PC },
    ];
    const rs = [];
    for (const b of bad) rs.push(await rec(cOwn, { unitId: DU, buildingId: bU, ...b }));
    const n1 = await prisma.dormUtilityRate.count({ where: { tenantId: A } });
    return [rs.every((r: any) => r?.ok === false && r.code === "INVALID_INPUT" && THAI.test(r.reason ?? "")) && n1 === n0, `${J(rs.map((r: any) => r?.code))} แถว ${n0}→${n1}`];
  }, "MAJOR");
  await T("B-7", "น้ำ PB ไม่กรอกหน่วย และไม่มีมิเตอร์ MAIN น้ำ ⇒ UNITS_UNKNOWN ไม่มีแถว", ["recordAuthorityBill"], async () => {
    const r = await rec(cOwn, { unitId: DU, kind: "WATER", periodKey: PB, buildingId: bU, billSatang: 100_000 });
    const row = await rateRow(DU, "WATER", PB, bU);
    return [r?.ok === false && r.code === "UNITS_UNKNOWN" && THAI.test(r.reason ?? "") && !row, `${J(r)} row=${!!row}`];
  }, "MAJOR");
  await T("B-8", "X10 รูปบิล: ส่งบิลน้ำ PA เดิม + รูป ⇒ UPDATED · billPhotoFileId = FileAsset ส่วนตัว (/private/ · cdnUrl ไม่ใช่ http) · put ครั้งเดียว · ผลไม่มี URL", ["recordAuthorityBill"], async () => {
    let puts = 0;
    const r = await rec(cOwn, { unitId: DU, kind: "WATER", periodKey: PA, buildingId: bU, billSatang: 384_000, units: 240, photo: { data: JPEG, contentType: "image/jpeg" } }, { put: async () => { puts++; } });
    const row = await rateRow(DU, "WATER", PA, bU);
    const f = row?.billPhotoFileId ? await prisma.fileAsset.findFirst({ where: { id: row.billPhotoFileId, tenantId: A } }) : null;
    const ok = r?.ok === true && r.status === "UPDATED" && !!f && f.path.includes("/private/") && !/^https?:/.test(f.cdnUrl) && puts === 1 && !/https?:\/\//.test(J(r));
    return [ok, `${J(r).slice(0, 160)} file=${f?.path?.replace(/[^/]+$/, "…")} put=${puts}`];
  }, "MAJOR");
  await T("B-9", "X3 ใส่บิลคีย์ใหม่ 10 ทางพร้อมกัน ⇒ แถวเดียว · CREATED ตัวเดียว · ที่เหลือ UNCHANGED · ไม่มี throw/ล้ม", ["recordAuthorityBill"], async () => {
    const rs = await Promise.allSettled(Array.from({ length: 10 }, () => rec(cOwn, { unitId: DU, kind: "WATER", periodKey: PC, buildingId: bU, billSatang: 1000, units: 10 })));
    const vals = rs.map((x) => (x.status === "fulfilled" ? x.value : { thrown: errMsg(x.reason) }));
    const n = await prisma.dormUtilityRate.count({ where: { tenantId: A, unitId: DU, kind: "WATER", periodKey: PC } });
    const created = vals.filter((v: any) => v?.status === "CREATED").length, unch = vals.filter((v: any) => v?.status === "UNCHANGED").length;
    return [n === 1 && created === 1 && unch === 9 && vals.every((v: any) => v?.ok === true), `แถว=${n} CREATED=${created} UNCHANGED=${unch} อื่น=${J(vals.filter((v: any) => v?.ok !== true)).slice(0, 160)}`];
  });
  await T("B-10", "buildingId ของหน่วยอื่น ⇒ NOT_FOUND · หน่วย HOTEL ⇒ NOT_FOUND (ไม่มีแถว)", ["recordAuthorityBill"], async () => {
    const a = await rec(cOwn, { unitId: DL, kind: "ELEC", periodKey: PC, buildingId: bU, billSatang: 100, units: 1 });
    const b = await rec(cOwn, { unitId: HA, kind: "ELEC", periodKey: PC, billSatang: 100, units: 1 });
    const n = await prisma.dormUtilityRate.count({ where: { tenantId: A, OR: [{ unitId: DL, periodKey: PC }, { unitId: HA }] } });
    return [a?.ok === false && a.code === "NOT_FOUND" && b?.ok === false && b.code === "NOT_FOUND" && n === 0, `${J(a)} ${J(b)} แถว=${n}`];
  }, "MAJOR");

  // ═══════════════ C. ค่าน้ำไฟ มิเตอร์รายห้อง ═══════════════
  console.log("\n── C utilityCharges (มิเตอร์รายห้อง · ต้นทุนจริง · VAT) ──");
  let chU: any = null;
  await T("C-1", "PA ห้อง 101: ไฟ 125 หน่วย × 472 = 59,000 · น้ำ 6 หน่วย × 1600 = 9,600 (README ห้อง 204) · status OK · gross = ยอด (ไม่จด VAT)", ["utilityCharges"], async () => {
    chU = await charges(cOwn, DU, PA);
    const e = rowOf(chU, RU["101"], "ELEC"), w = rowOf(chU, RU["101"], "WATER");
    const ok = e?.status === "OK" && e.units === 125 && e.rateSatangPerUnit === 472 && e.amountSatang === 59_000 && e.grossSatang === 59_000 && e.metering === "ROOM_METER" && e.method === "ACTUAL_COST"
      && w?.status === "OK" && w.units === 6 && w.rateSatangPerUnit === 1600 && w.amountSatang === 9_600 && chU?.periodKey === PA;
    return [ok, `ELEC=${J(e)} WATER=${J(w)}`];
  });
  await T("C-2", "PA ห้อง 102: 126 หน่วย = 59,472 (README 207 ฿594.72) · ห้อง 103: 10 หน่วย = 4,720", ["utilityCharges"], async () => {
    const a = rowOf(chU, RU["102"], "ELEC"), b = rowOf(chU, RU["103"], "ELEC");
    return [a?.amountSatang === 59_472 && a?.units === 126 && b?.amountSatang === 4_720, `102=${J(a?.amountSatang)} 103=${J(b?.amountSatang)}`];
  });
  await T("C-3", "ห้องว่าง 104 ไม่มีแถว · ห้อง 105 เลขถอยหลัง ⇒ HELD ไม่มียอด · ห้องที่ไม่มีมิเตอร์น้ำ ⇒ NO_READING", ["utilityCharges"], async () => {
    const v = (chU?.rows ?? []).filter((r: any) => r.roomId === RU["104"]);
    const h = rowOf(chU, RU["105"], "ELEC"), nr = rowOf(chU, RU["102"], "WATER");
    return [v.length === 0 && h?.status === "HELD" && h.amountSatang === null && h.grossSatang === null && nr?.status === "NO_READING" && nr.amountSatang === null,
      `104=${v.length} 105=${J(h && { s: h.status, a: h.amountSatang })} 102น้ำ=${nr?.status}`];
  });
  await T("C-4", "กลุ่มไฟอาคาร A PA: บิล 1,982,400 · หน่วย 4,200 · ต้นทุน 472 · chargedRooms 3 · chargedTotal 123,192 · ตัวตรวจ OK · ด่าน PA ok", ["utilityCharges", "utilityBillingGate"], async () => {
    const g = grpOf(chU, "ELEC", bU);
    const gt = await gate(cOwn, DU, PA);
    const ok = g?.billSatang === 1_982_400 && g.billUnits === 4200 && g.costRateSatangPerUnit === 472 && g.chargedRooms === 3 && g.chargedTotalSatang === 123_192
      && g.legal?.level === "OK" && g.legal?.mode === "STRICT" && gt?.ok === true && gt.blocks?.length === 0 && gt.needsAcceptance?.length === 0;
    return [ok, `group=${J(g && { b: g.billSatang, u: g.billUnits, c: g.costRateSatangPerUnit, n: g.chargedRooms, t: g.chargedTotalSatang, l: g.legal?.level })} gate=${J(gt && { ok: gt.ok, b: codes(gt.blocks), n: codes(gt.needsAcceptance) })}`];
  });
  await T("C-5", "ยอดทุกแถว OK = utilityLine ของ D.1 (segments จริง · วิธีเดียวกัน) — ไม่มีสูตรเงินซ้ำ", ["utilityCharges"], async () => {
    const bad: string[] = [];
    for (const r of (chU?.rows ?? []).filter((x: any) => x.status === "OK")) {
      const bill = r.kind === "ELEC" ? { b: 1_982_400, u: 4200 } : { b: 384_000, u: 240 };
      const segs = r.kind === "WATER" ? [{ start: 312, end: 318 }] : [{ start: { [RU["101"]]: 1287, [RU["102"]]: 2000, [RU["103"]]: 500 }[r.roomId as string] ?? -1, end: { [RU["101"]]: 1412, [RU["102"]]: 2126, [RU["103"]]: 510 }[r.roomId as string] ?? -1 }];
      const want = calc.utilityLine({ kind: "METERED", segments: segs, method: { kind: "ACTUAL_COST", billSatang: bill.b, billUnits: bill.u, billedRooms: r.kind === "ELEC" ? 3 : 1 } }, null).amountSatang;
      if (r.amountSatang !== want) bad.push(`${r.roomNumber}/${r.kind} ได้ ${r.amountSatang} ต้อง ${want}`);
    }
    return [!!chU && (chU.rows ?? []).filter((x: any) => x.status === "OK").length === 4 && !bad.length, bad.join(" · ") || `แถว OK=${(chU?.rows ?? []).filter((x: any) => x.status === "OK").length}`];
  }, "MAJOR");
  await T("C-6", "PB น้ำไม่มีบิล (ต้นทุนจริง) ⇒ แถว NO_COST_BASIS BILL_MISSING · ด่าน PB บล็อก BILL_MISSING · โหมดนอกขอบเขต (มีเหตุผล) ก็ยังบล็อก", ["utilityCharges", "utilityBillingGate"], async () => {
    const ch = await charges(cOwn, DU, PB);
    const w = rowOf(ch, RU["101"], "WATER");
    const g1 = await gate(cOwn, DU, PB);
    await U(DU, "rooms.legal.mode", "OUT_OF_SCOPE"); await U(DU, "rooms.legal.outOfScopeReason", REASON);
    const g2 = await gate(cOwn, DU, PB);
    await U(DU, "rooms.legal.mode", undefined); await U(DU, "rooms.legal.outOfScopeReason", undefined);
    const ok = w?.status === "NO_COST_BASIS" && w.code === "BILL_MISSING" && w.amountSatang === null && g1?.ok === false && codes(g1.blocks, "WATER").includes("BILL_MISSING")
      && g2?.ok === false && codes(g2.blocks, "WATER").includes("BILL_MISSING");
    return [ok, `row=${J(w && { s: w.status, c: w.code })} STRICT=${J(codes(g1?.blocks))} OOS=${J(codes(g2?.blocks))}`];
  });
  await T("C-7", "VAT บวกเพิ่ม (จด · ไม่รวม VAT): อัตรา = actualCostRate(vat, billedRooms 2) · ยอด = หน่วย × อัตรา · gross = computeBill D.1 · Σgross ≤ บิล · ต้นทุนที่เก็บยังเป็น 472", ["recordAuthorityBill", "utilityCharges"], async () => {
    await U(DV, "rooms.vat.registered", true); await U(DV, "rooms.vat.pricesIncludeVat", false);
    const r = await rec(cOwn, { unitId: DV, kind: "ELEC", periodKey: PA, buildingId: bV, billSatang: 1_982_400, units: 4200 });
    const ch = await charges(cOwn, DV, PA);
    const rate = calc.actualCostRate({ billSatang: 1_982_400, units: 4200, vat: VEX, billedRooms: 2 });
    const a = rowOf(ch, RV1, "ELEC"), b = rowOf(ch, RV2, "ELEC");
    const g = grpOf(ch, "ELEC", bV);
    const ok = r?.ok === true && r.costRateSatangPerUnit === 472 && a?.rateSatangPerUnit === rate && a.amountSatang === 125 * rate && b?.amountSatang === 6 * rate
      && a.grossSatang === grossOf(125 * rate, VEX) && b.grossSatang === grossOf(6 * rate, VEX) && g?.chargedTotalSatang === a.grossSatang + b.grossSatang && g.chargedTotalSatang <= 1_982_400 && g.legal?.level === "OK";
    return [ok, `rate=${a?.rateSatangPerUnit} ต้อง ${rate} · V1=${a?.amountSatang}/${a?.grossSatang} V2=${b?.amountSatang}/${b?.grossSatang} Σ=${g?.chargedTotalSatang} cost=${r?.costRateSatangPerUnit}`];
  });
  await T("C-8", "positive: จด VAT แต่ราคารวม VAT แล้ว ⇒ อัตรา 472 · 125 หน่วย 59,000 · gross 59,000 (VAT อยู่ข้างใน)", ["utilityCharges"], async () => {
    await U(DV, "rooms.vat.pricesIncludeVat", true);
    const ch = await charges(cOwn, DV, PA);
    const a = rowOf(ch, RV1, "ELEC");
    await U(DV, "rooms.vat.pricesIncludeVat", false);
    return [a?.rateSatangPerUnit === 472 && a.amountSatang === 59_000 && a.grossSatang === 59_000, J(a)];
  }, "MAJOR");

  // ═══════════════ T. ตารางอัตรา ═══════════════
  console.log("\n── T ตารางอัตรา (DormAuthorityTariff · ขั้นบันได + Ft · วันที่มีผล) ──");
  await T("T-1", "authorityTariffFor: วันแรก PA ⇒ ชุด 1 (Ft 3972) · วันแรก PB ⇒ ชุด 2 (Ft 5000) · ก่อนมีผล ⇒ null · รหัสไม่มี ⇒ null", ["authorityTariffFor"], async () => {
    const f = fn("authorityTariffFor")!;
    const a = await f({ authority: "PEA", kind: "ELEC", tariffCode: TCODE, at: `${PA}-01` });
    const b = await f({ authority: "PEA", kind: "ELEC", tariffCode: TCODE, at: `${PB}-01` });
    const c = await f({ authority: "PEA", kind: "ELEC", tariffCode: TCODE, at: `${P(-14)}-01` });
    const d = await f({ authority: "PEA", kind: "ELEC", tariffCode: "QCD7-NOPE", at: `${PA}-01` });
    return [a?.ftE4 === 3972 && J(a?.tiers) === J(TIERS) && b?.ftE4 === 5000 && c === null && d === null, `${J(a && { ft: a.ftE4 })} ${J(b && { ft: b.ftE4 })} ${J(c)} ${J(d)}`];
  }, "MAJOR");
  await T("T-2", "TARIFF PA: T1 125 หน่วย = 45,570 · T2 200 หน่วย = 77,779 (ค่าจากข้อสอบ D.1) · rate null · ตัวตรวจยอดรวม ≤ บิล OK", ["recordAuthorityBill", "utilityCharges"], async () => {
    await rec(cOwn, { unitId: DT, kind: "ELEC", periodKey: PA, buildingId: bT, billSatang: 200_000, units: 325 });
    const ch = await charges(cOwn, DT, PA);
    const a = rowOf(ch, RT1, "ELEC"), b = rowOf(ch, RT2, "ELEC"), g = grpOf(ch, "ELEC", bT);
    return [a?.status === "OK" && a.amountSatang === 45_570 && a.rateSatangPerUnit === null && b?.amountSatang === 77_779 && g?.chargedTotalSatang === 123_349 && g.legal?.level === "OK" && a.method === "TARIFF",
      `T1=${J(a && { s: a.status, a: a.amountSatang, r: a.rateSatangPerUnit })} T2=${b?.amountSatang} Σ=${g?.chargedTotalSatang} legal=${g?.legal?.level}`];
  });
  await T("T-3", "TARIFF PB ใช้ตารางชุด 2 (Ft 5000): ยอด = utilityCharge D.1 · ไม่ใช่ค่าของชุด 1 (47,757 / 194,254)", ["recordAuthorityBill", "utilityCharges"], async () => {
    await rec(cOwn, { unitId: DT, kind: "ELEC", periodKey: PB, buildingId: bT, billSatang: 400_000, units: 581 });
    const ch = await charges(cOwn, DT, PB);
    const want = (u: number) => calc.utilityCharge({ method: { kind: "TARIFF", tiers: TIERS, ftE4: 5000 }, units: u }).amountSatang;
    const a = rowOf(ch, RT1, "ELEC"), b = rowOf(ch, RT2, "ELEC");
    return [a?.amountSatang === want(131) && b?.amountSatang === want(450) && a.amountSatang !== 47_757 && b.amountSatang !== 194_254, `T1=${a?.amountSatang} ต้อง ${want(131)} · T2=${b?.amountSatang} ต้อง ${want(450)}`];
  });
  await T("T-4", "น้ำ TARIFF ไม่มีตาราง ⇒ NO_COST_BASIS TARIFF_MISSING · ด่านบล็อกแม้โหมดนอกขอบเขตมีเหตุผล", ["utilityCharges", "utilityBillingGate"], async () => {
    const ch = await charges(cOwn, DT, PA);
    const w = rowOf(ch, RT1, "WATER");
    await U(DT, "rooms.legal.mode", "OUT_OF_SCOPE"); await U(DT, "rooms.legal.outOfScopeReason", REASON);
    const g = await gate(cOwn, DT, PA);
    await U(DT, "rooms.legal.mode", undefined); await U(DT, "rooms.legal.outOfScopeReason", undefined);
    return [w?.status === "NO_COST_BASIS" && w.code === "TARIFF_MISSING" && g?.ok === false && codes(g.blocks, "WATER").includes("TARIFF_MISSING"), `row=${J(w && { s: w.status, c: w.code })} gate=${J(codes(g?.blocks))}`];
  });
  await T("T-5", "ตารางของร้าน rooms.utility.tariffTable (ชั้น TENANT) ชนะตารางระบบ: [{ELEC · ไม่จำกัด · 40,000 E4 · Ft 0}] ⇒ T1 125 หน่วย = utilityCharge D.1 (50,000) · ลบแล้วกลับ 45,570", ["utilityCharges"], async () => {
    await setVal(A, "rooms.utility.tariffTable", "TENANT", A, [{ kind: "ELEC", uptoUnits: null, rateE4: 40_000, ftE4: 0 }]);
    const a = rowOf(await charges(cOwn, DT, PA), RT1, "ELEC");
    await setVal(A, "rooms.utility.tariffTable", "TENANT", A, undefined);
    const b = rowOf(await charges(cOwn, DT, PA), RT1, "ELEC");
    const want = calc.utilityCharge({ method: { kind: "TARIFF", tiers: [{ uptoUnits: null, rateE4: 40_000 }], ftE4: 0 }, units: 125 }).amountSatang;
    return [a?.amountSatang === want && want === 50_000 && b?.amountSatang === 45_570, `override=${a?.amountSatang} ต้อง ${want} · หลังลบ=${b?.amountSatang}`];
  }, "MAJOR");

  // ═══════════════ H. มิเตอร์รวมเฉลี่ย ═══════════════
  console.log("\n── H มิเตอร์รวมเฉลี่ย (คน · ห้อง · พื้นที่) — ตรงสตางค์ ──");
  const sh = (ch: any) => ["S1", "S2", "S3"].map((no) => rowOf(ch, RS[no], "ELEC"));
  await T("H-1", "ตามคน (ค่าเริ่ม #14) บิล 10,000: S1 1 คน · S2 2 คน · S3 3 คน (รถไม่นับ) ⇒ [1667, 3333, 5000] (ข้อสอบ D.1) · S4 ว่างไม่มีแถว · allocated 10,000", ["recordAuthorityBill", "utilityCharges"], async () => {
    await rec(cOwn, { unitId: DS, kind: "ELEC", periodKey: PA, buildingId: bS, billSatang: 10_000, units: 100 });
    const ch = await charges(cOwn, DS, PA);
    const rs = sh(ch);
    const s4 = (ch?.rows ?? []).filter((r: any) => r.roomId === RS["S4"]);
    const want = calc.allocateShared({ totalSatang: 10_000, basis: "PERSON", rooms: [{ roomId: "a", persons: 1 }, { roomId: "b", persons: 2 }, { roomId: "c", persons: 3 }] }).map((x: any) => x.amountSatang);
    const ok = J(rs.map((r: any) => r?.amountSatang)) === J([1667, 3333, 5000]) && J(want) === J([1667, 3333, 5000]) && J(rs.map((r: any) => r?.weight)) === J([1, 2, 3])
      && rs.every((r: any) => r?.metering === "SHARED_METER" && r.status === "OK") && s4.length === 0 && grpOf(ch, "ELEC", bS)?.allocatedSatang === 10_000;
    return [ok, `ได้ ${J(rs.map((r: any) => r && [r.amountSatang, r.weight, r.status]))} S4=${s4.length} allocated=${grpOf(ch, "ELEC", bS)?.allocatedSatang}`];
  });
  await T("H-2", "ตามห้อง (ตั้ง sharedBasis ROOM) ⇒ [3334, 3333, 3333] (ข้อสอบ D.1 · เศษเท่ากันให้ลำดับแรก)", ["utilityCharges"], async () => {
    await U(DS, "rooms.utility.sharedBasis", "ROOM");
    const rs = sh(await charges(cOwn, DS, PA));
    return [J(rs.map((r: any) => r?.amountSatang)) === J([3334, 3333, 3333]) && J(rs.map((r: any) => r?.weight)) === J([1, 1, 1]), J(rs.map((r: any) => r?.amountSatang))];
  });
  await T("H-3", "ตามพื้นที่ บิล 10,001 (PB): 24/24/32 ตร.ม. ⇒ [3000, 3000, 4001] (ข้อสอบ D.1) · weight 2400/2400/3200", ["recordAuthorityBill", "utilityCharges"], async () => {
    await U(DS, "rooms.utility.sharedBasis", "AREA");
    await rec(cOwn, { unitId: DS, kind: "ELEC", periodKey: PB, buildingId: bS, billSatang: 10_001, units: 100 });
    const rs = sh(await charges(cOwn, DS, PB));
    return [J(rs.map((r: any) => r?.amountSatang)) === J([3000, 3000, 4001]) && J(rs.map((r: any) => r?.weight)) === J([2400, 2400, 3200]), J(rs.map((r: any) => r && [r.amountSatang, r.weight]))];
  });
  await T("H-4", "Σ ส่วนแบ่ง = บิลพอดี (ไม่มีสตางค์หาย/เกิน) ทั้ง 3 ฐาน · ตัวตรวจยอดรวม ≤ บิล OK · units/rate = null (ไม่ใช่มิเตอร์ห้อง)", ["utilityCharges"], async () => {
    const out: string[] = [];
    for (const [basis, per, bill] of [["PERSON", PA, 10_000], ["ROOM", PA, 10_000], ["AREA", PB, 10_001]] as const) {
      await U(DS, "rooms.utility.sharedBasis", basis);
      const ch = await charges(cOwn, DS, per);
      const rs = sh(ch);
      const sum = rs.reduce((s: number, r: any) => s + (r?.amountSatang ?? 0), 0);
      const g = grpOf(ch, "ELEC", bS);
      if (sum !== bill || g?.chargedTotalSatang !== bill || g?.legal?.level !== "OK" || rs.some((r: any) => r?.units !== null || r?.rateSatangPerUnit !== null)) out.push(`${basis} Σ=${sum} total=${g?.chargedTotalSatang} legal=${g?.legal?.level}`);
    }
    await U(DS, "rooms.utility.sharedBasis", undefined);
    return [!out.length, out.join(" · ")];
  }, "MAJOR");
  await T("H-5", "VAT บวกเพิ่ม (ฐานห้อง): allocated = floor((บิล×100 − 50×n) ÷ 107) = 9,344 · ส่วนแบ่ง = allocateShared D.1 · Σgross (computeBill) ≤ บิล และขาดไม่เกิน n สตางค์", ["utilityCharges"], async () => {
    await U(DS, "rooms.utility.sharedBasis", "ROOM"); await U(DS, "rooms.vat.registered", true); await U(DS, "rooms.vat.pricesIncludeVat", false);
    const ch = await charges(cOwn, DS, PA);
    await U(DS, "rooms.utility.sharedBasis", undefined); await U(DS, "rooms.vat.registered", undefined); await U(DS, "rooms.vat.pricesIncludeVat", undefined);
    const rs = sh(ch);
    const T0 = Math.floor((10_000 * 100 - 50 * 3) / 107);
    const want = calc.allocateShared({ totalSatang: T0, basis: "ROOM", rooms: [{ roomId: "a" }, { roomId: "b" }, { roomId: "c" }] }).map((x: any) => x.amountSatang);
    const gross = rs.map((r: any) => r?.grossSatang ?? 0);
    const sg = gross.reduce((s: number, x: number) => s + x, 0);
    const ok = grpOf(ch, "ELEC", bS)?.allocatedSatang === T0 && T0 === 9_344 && J(rs.map((r: any) => r?.amountSatang)) === J(want) && J(gross) === J(want.map((a: number) => grossOf(a, VEX))) && sg <= 10_000 && 10_000 - sg <= 3;
    return [ok, `allocated=${grpOf(ch, "ELEC", bS)?.allocatedSatang} ต้อง ${T0} · ส่วนแบ่ง=${J(rs.map((r: any) => r?.amountSatang))} ต้อง ${J(want)} · Σgross=${sg}`];
  });
  await T("H-6", "มิเตอร์รวมไม่มีบิลของงวด ⇒ ทุกแถว NO_COST_BASIS BILL_MISSING · ด่านบล็อก", ["utilityCharges", "utilityBillingGate"], async () => {
    const ch = await charges(cOwn, DS, PC);
    const rs = sh(ch);
    const g = await gate(cOwn, DS, PC);
    return [rs.every((r: any) => r?.status === "NO_COST_BASIS" && r.code === "BILL_MISSING" && r.amountSatang === null) && g?.ok === false && codes(g.blocks, "ELEC").includes("BILL_MISSING"),
      `${J(rs.map((r: any) => r?.status))} gate=${J(codes(g?.blocks))}`];
  }, "MAJOR");

  // ═══════════════ L. ตัวตรวจรายเดือน + ด่านออกบิล + ยอมรับ ═══════════════
  console.log("\n── L ตัวตรวจรายเดือน (ต้นทุนลด ⇒ อัตราคงที่เกิน) · ด่านก่อนออกบิล · เจ้าของยอมรับ ──");
  const acc = (ctx: any, input: Record<string, unknown>): Promise<any> => fn("acceptUtilityLegalWarn")!(ctx, { unitId: DL, periodKey: PB, kind: "ELEC", buildingId: bL, ...input });
  await T("L-1", "STRICT · อัตราคงที่ ฿4.50 · ต้นทุน PA ฿4.72 ⇒ ไม่มีบล็อกไฟ · ยอด L1 100×450 = 45,000 · L2 50×450 = 22,500", ["recordAuthorityBill", "utilityCharges", "utilityBillingGate"], async () => {
    const r = await rec(cOwn, { unitId: DL, kind: "ELEC", periodKey: PA, buildingId: bL, billSatang: 1_982_400, units: 4200 });
    const ch = await charges(cOwn, DL, PA);
    const g = await gate(cOwn, DL, PA);
    const a = rowOf(ch, RL1, "ELEC"), b = rowOf(ch, RL2, "ELEC");
    return [r?.legal?.level === "OK" && a?.amountSatang === 45_000 && a.rateSatangPerUnit === 450 && a.method === "FIXED_RATE" && b?.amountSatang === 22_500 && codes(g?.blocks, "ELEC").length === 0 && codes(g?.needsAcceptance, "ELEC").length === 0,
      `legal=${r?.legal?.level} L1=${a?.amountSatang} L2=${b?.amountSatang} gate=${J({ b: codes(g?.blocks), n: codes(g?.needsAcceptance) })}`];
  });
  await T("L-2", "เดือนถัดไปต้นทุนลด ฿18,480.00/4,200 = ฿4.40 ⇒ ใส่บิลได้ (ไม่บล็อกการบันทึก) แต่ legal BLOCK · legalCheck เก็บ BLOCK · ด่าน PB บล็อก UTIL_FIXED_RATE_LE_COST", ["recordAuthorityBill", "utilityBillingGate"], async () => {
    const r = await rec(cOwn, { unitId: DL, kind: "ELEC", periodKey: PB, buildingId: bL, billSatang: 1_848_000, units: 4200 });
    const row = await rateRow(DL, "ELEC", PB, bL);
    const g = await gate(cOwn, DL, PB);
    const ok = r?.ok === true && r.costRateSatangPerUnit === 440 && r.legal?.level === "BLOCK" && r.legal.outcomes?.some((o: any) => o.ruleId === "UTIL_FIXED_RATE_LE_COST" && o.level === "BLOCK" && THAI.test(o.messageTh ?? ""))
      && row?.legalCheck?.level === "BLOCK" && g?.ok === false && codes(g.blocks, "ELEC").includes("UTIL_FIXED_RATE_LE_COST");
    return [ok, `rec=${J(r && { ok: r.ok, c: r.costRateSatangPerUnit, l: r.legal?.level })} stored=${row?.legalCheck?.level} gate=${J(codes(g?.blocks))}`];
  });
  await T("L-3", "positive: งวด PA ยังผ่าน (ตรวจด้วยบิลของงวดนั้น — ไม่ย้อนเปลี่ยน)", ["utilityBillingGate"], async () => {
    const g = await gate(cOwn, DL, PA);
    return [codes(g?.blocks, "ELEC").length === 0, J(codes(g?.blocks))];
  }, "MAJOR");
  await T("L-4", "STRICT ยอมรับไม่ได้: เจ้าของกดยอมรับ ⇒ LEGAL_BLOCK · ไม่มี acceptance/audit", ["acceptUtilityLegalWarn"], async () => {
    const r = await acc(cOwn, { reason: REASON });
    const row = await rateRow(DL, "ELEC", PB, bL);
    const au = await auditOf("dorm.utility.legal_accepted");
    return [r?.ok === false && r.code === "LEGAL_BLOCK" && !row?.legalCheck?.acceptance && au.length === 0, `${J(r)} acceptance=${!!row?.legalCheck?.acceptance} audit=${au.length}`];
  });
  await T("L-5", "ขอบพอดี: อัตราคงที่ = ต้นทุน (440) ⇒ ไม่บล็อก (≤) · คืน 450 ⇒ บล็อกอีก (อ่านค่าตั้งสดทุกครั้ง)", ["utilityBillingGate"], async () => {
    await U(DL, "rooms.utility.elec.fixedRate", 440);
    const a = await gate(cOwn, DL, PB);
    await U(DL, "rooms.utility.elec.fixedRate", 450);
    const b = await gate(cOwn, DL, PB);
    return [codes(a?.blocks, "ELEC").length === 0 && codes(b?.blocks, "ELEC").includes("UTIL_FIXED_RATE_LE_COST"), `440=${J(codes(a?.blocks))} 450=${J(codes(b?.blocks))}`];
  });
  await T("L-6", "โหมด WARN ⇒ ไม่มีบล็อก · needsAcceptance UTIL_FIXED_RATE_LE_COST · outcome needsOwnerApproval · ด่าน ok=false", ["utilityBillingGate", "utilityCharges"], async () => {
    await U(DL, "rooms.legal.mode", "WARN");
    const g = await gate(cOwn, DL, PB);
    const grp = grpOf(await charges(cOwn, DL, PB), "ELEC", bL);
    const o = grp?.legal?.outcomes?.find((x: any) => x.ruleId === "UTIL_FIXED_RATE_LE_COST");
    return [g?.ok === false && codes(g.blocks, "ELEC").length === 0 && codes(g.needsAcceptance, "ELEC").includes("UTIL_FIXED_RATE_LE_COST") && o?.level === "WARN" && o.raw === "BLOCK" && o.needsOwnerApproval === true && grp.legal.accepted === false,
      `gate=${J({ ok: g?.ok, b: codes(g?.blocks), n: codes(g?.needsAcceptance) })} outcome=${J(o)}`];
  });
  await T("L-7", "ผู้จัดการ/พนักงานยอมรับ ⇒ OWNER_ONLY (Membership สด) · ไม่มี acceptance", ["acceptUtilityLegalWarn"], async () => {
    const a = await acc(cMgr, { reason: REASON });
    const b = await acc(cStv, { reason: REASON });
    const c = await acc({ tenantId: A, actorUserId: null }, { reason: REASON });
    const row = await rateRow(DL, "ELEC", PB, bL);
    return [a?.ok === false && a.code === "OWNER_ONLY" && b?.ok === false && b.code === "OWNER_ONLY" && c?.ok === false && c.code === "OWNER_ONLY" && !row?.legalCheck?.acceptance, `${J(a)} ${J(b)} ${J(c)}`];
  });
  await T("L-8", "เจ้าของ เหตุผลสั้น (< 10 ตัว) ⇒ REASON_REQUIRED", ["acceptUtilityLegalWarn"], async () => {
    const r = await acc(cOwn, { reason: "  สั้น​ " });
    return [r?.ok === false && r.code === "REASON_REQUIRED", J(r)];
  }, "MAJOR");
  await T("L-9", "เจ้าของยอมรับ + เหตุผล ⇒ ok · ด่าน PB ok · legalCheck.acceptance (byUserId เจ้าของ · fingerprint) · audit dorm.utility.legal_accepted 1 · ซ้ำ ⇒ ok ไม่มี audit ใหม่", ["acceptUtilityLegalWarn", "utilityBillingGate"], async () => {
    const r = await acc(cOwn, { reason: REASON });
    const r2 = await acc(cOwn, { reason: REASON });
    const g = await gate(cOwn, DL, PB);
    const row = await rateRow(DL, "ELEC", PB, bL);
    const au = await auditOf("dorm.utility.legal_accepted");
    const ok = r?.ok === true && typeof r.fingerprint === "string" && r2?.ok === true && g?.ok === true && row?.legalCheck?.acceptance?.byUserId === OWN.userId && row.legalCheck.acceptance.fingerprint === r.fingerprint && au.length === 1;
    return [ok, `${J(r)} gate=${J({ ok: g?.ok, b: codes(g?.blocks), n: codes(g?.needsAcceptance) })} audit=${au.length}`];
  });
  await T("L-10", "ใส่บิล PB ใหม่ (ต้นทุนลดอีก ฿4.30) ⇒ UPDATED · การยอมรับเดิมไม่มีผล (fingerprint เปลี่ยน) ⇒ ด่าน ok=false ต้องยอมรับใหม่", ["recordAuthorityBill", "utilityBillingGate"], async () => {
    const r = await rec(cOwn, { unitId: DL, kind: "ELEC", periodKey: PB, buildingId: bL, billSatang: 1_806_000, units: 4200 });
    const g = await gate(cOwn, DL, PB);
    return [r?.status === "UPDATED" && r.costRateSatangPerUnit === 430 && g?.ok === false && codes(g.needsAcceptance, "ELEC").includes("UTIL_FIXED_RATE_LE_COST"), `${J(r && { s: r.status, c: r.costRateSatangPerUnit })} gate=${J({ ok: g?.ok, n: codes(g?.needsAcceptance) })}`];
  });
  await T("L-11", "นอกขอบเขต: ไม่มีเหตุผล ⇒ บล็อก OUT_OF_SCOPE_REASON_REQUIRED · มีเหตุผล ⇒ ด่าน ok (outcome OK · raw BLOCK)", ["utilityBillingGate", "utilityCharges"], async () => {
    await U(DL, "rooms.legal.mode", "OUT_OF_SCOPE");
    const a = await gate(cOwn, DL, PB);
    await U(DL, "rooms.legal.outOfScopeReason", REASON);
    const b = await gate(cOwn, DL, PB);
    const o = grpOf(await charges(cOwn, DL, PB), "ELEC", bL)?.legal?.outcomes?.find((x: any) => x.ruleId === "UTIL_FIXED_RATE_LE_COST");
    await U(DL, "rooms.legal.mode", undefined); await U(DL, "rooms.legal.outOfScopeReason", undefined);
    return [a?.ok === false && codes(a.blocks).includes("OUT_OF_SCOPE_REASON_REQUIRED") && b?.ok === true && o?.level === "OK" && o.raw === "BLOCK", `ไม่มีเหตุผล=${J(codes(a?.blocks))} มีเหตุผล=${b?.ok} outcome=${J(o && { l: o.level, r: o.raw })}`];
  });
  await T("L-12", "ค่าขั้นต่ำ (#13): STRICT ตั้ง ฿50 ⇒ บล็อก UTIL_NO_MINIMUM (งวด PA ที่อัตราผ่าน) · ปิด ⇒ ไม่บล็อก", ["utilityBillingGate"], async () => {
    await U(DL, "rooms.utility.minimum", 5000);
    const a = await gate(cOwn, DL, PA);
    await U(DL, "rooms.utility.minimum", undefined);
    const b = await gate(cOwn, DL, PA);
    return [codes(a?.blocks).includes("UTIL_NO_MINIMUM") && !codes(b?.blocks).includes("UTIL_NO_MINIMUM") && codes(b?.blocks, "ELEC").length === 0, `ตั้ง=${J(codes(a?.blocks))} ปิด=${J(codes(b?.blocks))}`];
  });
  await T("L-13", "เหมาจ่ายน้ำ ฿500/ห้อง × 2 ห้อง (วิธีวัด NONE ก็คิด): บิล PA ฿800 ⇒ บล็อก UTIL_FLAT_LE_COST · แถว 50,000 rate null · บิล PB ฿1,200 ⇒ ไม่บล็อก", ["recordAuthorityBill", "utilityCharges", "utilityBillingGate"], async () => {
    await U(DL, "rooms.utility.water.method", "FLAT"); await U(DL, "rooms.utility.water.flat", { per: "ROOM", satang: 50_000 }); await U(DL, "rooms.utility.water.metering", "NONE");
    await rec(cOwn, { unitId: DL, kind: "WATER", periodKey: PA, buildingId: bL, billSatang: 80_000, units: 20 });
    await rec(cOwn, { unitId: DL, kind: "WATER", periodKey: PB, buildingId: bL, billSatang: 120_000, units: 30 });
    const ch = await charges(cOwn, DL, PA);
    const w = rowOf(ch, RL1, "WATER");
    const a = await gate(cOwn, DL, PA), b = await gate(cOwn, DL, PB);
    return [w?.status === "OK" && w.amountSatang === 50_000 && w.rateSatangPerUnit === null && w.method === "FLAT" && codes(a?.blocks, "WATER").includes("UTIL_FLAT_LE_COST") && codes(b?.blocks, "WATER").length === 0,
      `row=${J(w && { s: w.status, a: w.amountSatang })} PA=${J(codes(a?.blocks, "WATER"))} PB=${J(codes(b?.blocks, "WATER"))}`];
  });
  await T("L-14", "งวดที่ยังไม่มีบิล (PC) · STRICT: อัตราคงที่/เหมาเทียบต้นทุนไม่ได้ ⇒ ไม่บล็อก แต่ needsAcceptance UTIL_COST_UNKNOWN (ไฟ+น้ำ)", ["utilityBillingGate"], async () => {
    const g = await gate(cOwn, DL, PC);
    return [g?.ok === false && (g.blocks ?? []).length === 0 && codes(g.needsAcceptance, "ELEC").includes("UTIL_COST_UNKNOWN") && codes(g.needsAcceptance, "WATER").includes("UTIL_COST_UNKNOWN"),
      `blocks=${J(codes(g?.blocks))} need=${J((g?.needsAcceptance ?? []).map((i: any) => `${i.kind}:${i.code}`))}`];
  }, "MAJOR");
  await T("L-15", "ยอมรับ UTIL_COST_UNKNOWN (ไม่มีแถวบิล) ⇒ สร้างแถวบิล null เก็บ acceptance · ด่าน PC ไฟไม่ต้องยอมรับแล้ว · ใส่บิลทีหลัง = UPDATED", ["acceptUtilityLegalWarn", "utilityBillingGate", "recordAuthorityBill"], async () => {
    const r = await fn("acceptUtilityLegalWarn")!(cOwn, { unitId: DL, periodKey: PC, kind: "ELEC", buildingId: bL, reason: REASON });
    const row = await rateRow(DL, "ELEC", PC, bL);
    const g = await gate(cOwn, DL, PC);
    const r2 = await rec(cOwn, { unitId: DL, kind: "ELEC", periodKey: PC, buildingId: bL, billSatang: 1_982_400, units: 4200 });
    return [r?.ok === true && row?.authorityBillSatang === null && !!row?.legalCheck?.acceptance && codes(g?.needsAcceptance, "ELEC").length === 0 && r2?.status === "UPDATED",
      `${J(r)} row=${J(row && { b: row.authorityBillSatang, acc: !!row.legalCheck?.acceptance })} need=${J(codes(g?.needsAcceptance, "ELEC"))} rec=${r2?.status}`];
  }, "MAJOR");
  await T("L-16", "กลุ่มที่ผ่านทั้งหมด ⇒ ยอมรับ = NOTHING_TO_ACCEPT · กลุ่มที่ไม่มี (อาคารอื่น) ⇒ NOT_FOUND", ["acceptUtilityLegalWarn"], async () => {
    const a = await fn("acceptUtilityLegalWarn")!(cOwn, { unitId: DL, periodKey: PA, kind: "ELEC", buildingId: bL, reason: REASON });
    const b = await fn("acceptUtilityLegalWarn")!(cOwn, { unitId: DL, periodKey: PA, kind: "ELEC", buildingId: bU, reason: REASON });
    return [a?.ok === false && a.code === "NOTHING_TO_ACCEPT" && b?.ok === false && b.code === "NOT_FOUND", `${J(a)} ${J(b)}`];
  }, "MINOR");

  // ═══════════════ M. โหมดกฎหมาย — เจ้าของเท่านั้น ═══════════════
  console.log("\n── M โหมดกฎหมาย (เจ้าของเท่านั้น · หลักฐาน) + dormLawModel ──");
  const modeRow = (unitId: string) => prisma.settingValue.findFirst({ where: { tenantId: A, key: "rooms.legal.mode", scope: "UNIT", scopeId: unitId } });
  const setMode = (actor: any, input: Record<string, unknown>): Promise<any> => fn("setDormLegalMode")!(actor, sctxA, input);
  {
    let why = "";
    try {
      const r = await settings.setSettings(MGR, sctxA, [{ key: "rooms.legal.mode", scope: "UNIT", scopeId: DM3, value: "WARN" }]);
      const row = await modeRow(DM3);
      if (!(r?.ok === false && r.code === "PERMISSION" && r.issues?.some((i: any) => i.code === "OWNER_ONLY") && !row)) why = `${J(r).slice(0, 200)} row=${!!row}`;
    } catch (e) { why = `throw ${errMsg(e)}`; }
    chk("PC-1", "เครื่องยนต์ R0.3: ผู้จัดการตั้ง rooms.legal.mode ⇒ PERMISSION/OWNER_ONLY ไม่มีแถว (positive control)", !why, why, "CRITICAL");
  }
  await T("M-1", "ผู้จัดการ setDormLegalMode WARN ⇒ OWNER_ONLY · ไม่มี SettingValue/SettingChange", ["setDormLegalMode"], async () => {
    const r = await setMode(MGR, { unitId: DM3, mode: "WARN" });
    const row = await modeRow(DM3);
    const ch = await prisma.settingChange.count({ where: { tenantId: A, key: "rooms.legal.mode" } });
    return [r?.ok === false && r.code === "OWNER_ONLY" && THAI.test(r.reason ?? "") && !row && ch === 0, `${J(r)} row=${!!row} change=${ch}`];
  });
  await T("M-2", "เจ้าของตั้ง WARN ⇒ ok · SettingValue UNIT = WARN · SettingChange โดยเจ้าของ", ["setDormLegalMode"], async () => {
    const r = await setMode(OWN, { unitId: DM3, mode: "WARN" });
    const row = await modeRow(DM3);
    const ch = await prisma.settingChange.findMany({ where: { tenantId: A, key: "rooms.legal.mode", scopeId: DM3 } });
    return [r?.ok === true && row?.value === "WARN" && ch.length === 1 && ch[0].actorId === OWN.userId, `${J(r)} row=${J(row?.value)} change=${J(ch.map((c: any) => c.actorId))}`];
  });
  await T("M-3", "หอ 3 ห้อง (ในขอบเขต) เลือกนอกขอบเขต + เหตุผล แต่ไม่มีหลักฐาน ⇒ EVIDENCE_REQUIRED · โหมดยัง WARN", ["setDormLegalMode"], async () => {
    const r = await setMode(OWN, { unitId: DM3, mode: "OUT_OF_SCOPE", reason: REASON, evidenceFileIds: [] });
    return [r?.ok === false && r.code === "EVIDENCE_REQUIRED" && (await modeRow(DM3))?.value === "WARN", J(r)];
  });
  await T("M-4", "X10 หลักฐานต้องเป็นไฟล์ส่วนตัวของร้าน: ไฟล์สาธารณะ ⇒ EVIDENCE_INVALID · ไฟล์ร้านอื่น ⇒ EVIDENCE_INVALID · id มั่ว ⇒ EVIDENCE_INVALID", ["setDormLegalMode"], async () => {
    const rs = [];
    for (const ids of [[fPub], [fForeign], ["no-such-file"]]) rs.push(await setMode(OWN, { unitId: DM3, mode: "OUT_OF_SCOPE", reason: REASON, evidenceFileIds: ids }));
    return [rs.every((r: any) => r?.ok === false && r.code === "EVIDENCE_INVALID") && (await modeRow(DM3))?.value === "WARN", J(rs.map((r: any) => r?.code))];
  });
  await T("M-5", "เหตุผลสั้น ⇒ REASON_REQUIRED · โหมดแปลก ⇒ INVALID_INPUT", ["setDormLegalMode"], async () => {
    const a = await setMode(OWN, { unitId: DM3, mode: "OUT_OF_SCOPE", reason: "สั้น", evidenceFileIds: [fPriv] });
    const b = await setMode(OWN, { unitId: DM3, mode: "LAX" });
    return [a?.ok === false && a.code === "REASON_REQUIRED" && b?.ok === false && b.code === "INVALID_INPUT", `${J(a)} ${J(b)}`];
  }, "MAJOR");
  await T("M-6", "หลักฐานไฟล์ส่วนตัวของร้าน ⇒ ok · mode OUT_OF_SCOPE + reason + evidence [id] ลงชั้น UNIT", ["setDormLegalMode"], async () => {
    const r = await setMode(OWN, { unitId: DM3, mode: "OUT_OF_SCOPE", reason: REASON, evidenceFileIds: [fPriv] });
    const rows = await prisma.settingValue.findMany({ where: { tenantId: A, scope: "UNIT", scopeId: DM3, key: { startsWith: "rooms.legal." } } });
    const v = Object.fromEntries(rows.map((x: any) => [x.key, x.value]));
    return [r?.ok === true && v["rooms.legal.mode"] === "OUT_OF_SCOPE" && v["rooms.legal.outOfScopeReason"] === REASON && J(v["rooms.legal.outOfScopeEvidence"]) === J([fPriv]), `${J(r)} ${J(v)}`];
  });
  await T("M-7", "หอ 2 ห้อง (นอกขอบเขตตามจำนวนห้อง) เลือกนอกขอบเขต + เหตุผล ไม่มีหลักฐาน ⇒ ok", ["setDormLegalMode"], async () => {
    const r = await setMode(OWN, { unitId: DM2, mode: "OUT_OF_SCOPE", reason: REASON });
    return [r?.ok === true && (await modeRow(DM2))?.value === "OUT_OF_SCOPE", J(r)];
  }, "MAJOR");
  await T("M-8", "X1 หน่วยร้านอื่น / หน่วย HOTEL ⇒ NOT_FOUND (ไม่มีแถว)", ["setDormLegalMode"], async () => {
    const a = await setMode(OWN, { unitId: DBx, mode: "WARN" });
    const b = await setMode(OWN, { unitId: HA, mode: "WARN" });
    const nB = await prisma.settingValue.count({ where: { tenantId: { in: [A, B] }, scopeId: { in: [DBx, HA] } } });
    return [a?.ok === false && a.code === "NOT_FOUND" && b?.ok === false && b.code === "NOT_FOUND" && nB === 0, `${J(a)} ${J(b)} แถว=${nB}`];
  });
  let mOwn: any = null, mMgr: any = null, mStv: any = null;
  await T("M-9", "dormLawModel เจ้าของ (DU · PA): legal.editable · canAccept · canRecordBill · scope 5 ห้อง APARTMENT ในขอบเขต · bills ไฟ 1,982,400/4,200/472 · น้ำ 384,000/240/1600 (hasPhoto) · check ok", ["dormLawModel"], async () => {
    mOwn = await fn("dormLawModel")!(OWN, sctxA, { unitId: DU, periodKey: PA });
    const e = (mOwn?.bills ?? []).find((b: any) => b.kind === "ELEC"), w = (mOwn?.bills ?? []).find((b: any) => b.kind === "WATER");
    const ok = mOwn?.unitId === DU && mOwn.periodKey === PA && mOwn.legal?.editable === true && mOwn.legal?.mode === "STRICT" && mOwn.canAccept === true && mOwn.canRecordBill === true
      && mOwn.scope?.roomCount === 5 && mOwn.scope?.inScope === true && mOwn.scope?.businessType === "APARTMENT"
      && e?.billSatang === 1_982_400 && e.units === 4200 && e.costRateSatangPerUnit === 472 && w?.billSatang === 384_000 && w.costRateSatangPerUnit === 1600 && w.hasPhoto === true
      && mOwn.check?.ok === true && Array.isArray(mOwn.form?.groups) && !/https?:\/\//.test(J(mOwn.bills));
    return [ok, `${J(mOwn && { legal: mOwn.legal, scope: mOwn.scope, canA: mOwn.canAccept, canR: mOwn.canRecordBill, bills: mOwn.bills, check: mOwn.check?.ok })}`.slice(0, 400)];
  });
  await T("M-10", "dormLawModel ผู้จัดการ: legal.editable false + lockedReasonTh ไทย (เจ้าของ) · canAccept false · canRecordBill true (MANAGER) · พนักงานดูอย่างเดียว canRecordBill false", ["dormLawModel"], async () => {
    mMgr = await fn("dormLawModel")!(MGR, sctxA, { unitId: DU, periodKey: PA });
    mStv = await fn("dormLawModel")!(STV, sctxA, { unitId: DU, periodKey: PA });
    const ok = mMgr?.legal?.editable === false && /เจ้าของ/.test(mMgr.legal.lockedReasonTh ?? "") && mMgr.canAccept === false && mMgr.canRecordBill === true && mStv?.canRecordBill === false && mStv.canAccept === false && mStv.legal?.editable === false;
    return [ok, `mgr=${J(mMgr && { legal: mMgr.legal, a: mMgr.canAccept, r: mMgr.canRecordBill })} staff=${J(mStv && { r: mStv.canRecordBill })}`];
  });
  await T("M-11", "X1 dormLawModel หน่วยร้านอื่น / HOTEL / ผู้ใช้ที่เข้าหน่วยไม่ได้ ⇒ null", ["dormLawModel"], async () => {
    const a = await fn("dormLawModel")!(OWN, sctxA, { unitId: DBx });
    const b = await fn("dormLawModel")!(OWN, sctxA, { unitId: HA });
    const c = await fn("dormLawModel")!(STV, sctxA, { unitId: DT });
    return [a === null && b === null && c === null, `${a === null} ${b === null} ${c === null}`];
  });

  // ═══════════════ U. จอ ═══════════════
  console.log("\n── U UtilityLawSettings (renderToStaticMarkup · สัญญา DOM §5) ──");
  const fieldOf = (m: any, key: string) => (m?.form?.groups ?? []).flatMap((g: any) => g.fields ?? []).find((f: any) => f.key === key);
  let hOwn = "", hMgr = "";
  await T("U-1", "เจ้าของ: data-dorm-law + data-period · เมนูซ้าย data-dorm-settings-nav รายการ active \"ค่าน้ำไฟ · กฎหมาย · VAT\"", ["dormLawModel"], async () => {
    if (!mOwn) return [false, "ไม่มีโมเดล (M-9)"];
    hOwn = render(mOwn);
    const w = boxes(hOwn, "data-dorm-law")[0];
    const nav = boxes(hOwn, "data-dorm-settings-nav")[0];
    const act = nav ? boxes(nav.html, "data-nav-active").filter((x) => x.attrs["data-nav-active"] === "true") : [];
    return [!!w && w.attrs["data-period"] === PA && act.length === 1 && /ค่าน้ำไฟ\s*·\s*กฎหมาย\s*·\s*VAT/.test(textOf(act[0].html)), `wrap=${!!w} period=${w?.attrs["data-period"]} nav=${!!nav} active=${act.map((a) => textOf(a.html)).join("|")}`];
  }, "MAJOR", true);
  await T("U-2", "การ์ดไฟ: กล่องบิล ฿19,824.00 · 4,200 หน่วย · ฿4.72 · การ์ดน้ำ: ฿3,840.00 · 240 หน่วย · ฿16.00 (README)", ["dormLawModel"], async () => {
    const e = boxes(hOwn, "data-utility-card").find((b) => b.attrs["data-utility-card"] === "ELEC");
    const w = boxes(hOwn, "data-utility-card").find((b) => b.attrs["data-utility-card"] === "WATER");
    const eb = e ? textOf(boxes(e.html, "data-authority-bill")[0]?.html ?? "") : "", wb = w ? textOf(boxes(w.html, "data-authority-bill")[0]?.html ?? "") : "";
    const ok = /ค่าไฟฟ้า/.test(textOf(e?.html ?? "")) && /ค่าน้ำประปา/.test(textOf(w?.html ?? "")) && eb.includes("฿19,824.00") && /4,200\s*หน่วย/.test(eb) && eb.includes("฿4.72")
      && wb.includes("฿3,840.00") && /240\s*หน่วย/.test(wb) && wb.includes("฿16.00");
    return [ok, `ไฟ="${eb.slice(0, 120)}" น้ำ="${wb.slice(0, 120)}"`];
  }, "CRITICAL", true);
  await T("U-3", "ตัวเลือกวิธีวัด/วิธีคิดมาจากทะเบียน: ค่าครบตาม options · ข้อความ = labelTh ของทะเบียน · ตัวที่มีผล data-selected (ROOM_METER · ACTUAL_COST)", ["dormLawModel"], async () => {
    const e = boxes(hOwn, "data-utility-card").find((b) => b.attrs["data-utility-card"] === "ELEC");
    const bad: string[] = [];
    for (const [attr, key, cur] of [["data-metering-option", "rooms.utility.elec.metering", "ROOM_METER"], ["data-method-option", "rooms.utility.elec.method", "ACTUAL_COST"]] as const) {
      const f = fieldOf(mOwn, key);
      const opts = boxes(e?.html ?? "", attr);
      const want = (f?.options ?? []).map((o: any) => o.value);
      if (!f || J(opts.map((o) => o.attrs[attr]).sort()) !== J([...want].sort())) bad.push(`${attr} ได้ ${J(opts.map((o) => o.attrs[attr]))} ต้อง ${J(want)}`);
      for (const o of opts) {
        const lab = (f?.options ?? []).find((x: any) => x.value === o.attrs[attr])?.labelTh ?? "∅";
        if (!textOf(o.html).includes(lab)) bad.push(`${o.attrs[attr]} ไม่มีป้าย "${lab}"`);
        if ((o.attrs["data-selected"] === "true") !== (o.attrs[attr] === cur)) bad.push(`${o.attrs[attr]} selected=${o.attrs["data-selected"]}`);
      }
    }
    return [!!e && !bad.length, bad.join(" · ").slice(0, 300) || "ไม่มีการ์ดไฟ"];
  }, "MAJOR", true);
  await T("U-4", "การ์ดโหมด: \"5 ห้อง\" + \"อยู่ในขอบเขต\" · ตัวเลือก STRICT/WARN/OUT_OF_SCOPE ครบ · STRICT selected · เจ้าของไม่มีตัวเลือกปิด", ["dormLawModel"], async () => {
    const c = boxes(hOwn, "data-legal-card")[0];
    const opts = c ? boxes(c.html, "data-legal-mode-option") : [];
    const t = textOf(c?.html ?? "");
    const ok = !!c && /5\s*ห้อง/.test(t) && /อยู่ในขอบเขต/.test(t) && J(opts.map((o) => o.attrs["data-legal-mode-option"]).sort()) === J(["OUT_OF_SCOPE", "STRICT", "WARN"])
      && opts.find((o) => o.attrs["data-legal-mode-option"] === "STRICT")?.attrs["data-selected"] === "true" && opts.every((o) => !isDisabled(o));
    return [ok, `card=${!!c} text="${t.slice(0, 100)}" opts=${J(opts.map((o) => [o.attrs["data-legal-mode-option"], o.attrs["data-selected"], isDisabled(o)]))}`];
  }, "CRITICAL", true);
  await T("U-5", "ผู้จัดการ: ตัวเลือกโหมดทุกตัว disabled + ข้อความ lockedReasonTh · ไม่มีปุ่มยอมรับ", ["dormLawModel"], async () => {
    if (!mMgr) return [false, "ไม่มีโมเดลผู้จัดการ (M-10)"];
    hMgr = render(mMgr);
    const c = boxes(hMgr, "data-legal-card")[0];
    const opts = c ? boxes(c.html, "data-legal-mode-option") : [];
    const ok = opts.length === 3 && opts.every(isDisabled) && textOf(c?.html ?? "").includes(mMgr.legal?.lockedReasonTh ?? "∅") && boxes(hMgr, "data-accept-legal").length === 0;
    return [ok, `opts=${J(opts.map((o) => isDisabled(o)))} ข้อความ="${textOf(c?.html ?? "").slice(0, 120)}"`];
  }, "CRITICAL", true);
  await T("U-6", "การ์ด VAT: data-vat-registered false · \"ยกเว้น VAT\" (ค่าห้อง) · \"VAT 7%\" · สวิตช์ขั้นต่ำ aria-checked false · ฐานเฉลี่ยครบ 3", ["dormLawModel"], async () => {
    const v = boxes(hOwn, "data-vat-card")[0];
    const mins = boxes(hOwn, "data-minimum");
    const sb = boxes(hOwn, "data-shared-basis").map((b) => b.attrs["data-shared-basis"]);
    const t = textOf(v?.html ?? "");
    const ok = v?.attrs["data-vat-registered"] === "false" && /ค่าห้อง/.test(t) && /ยกเว้น\s*VAT/.test(t) && /VAT\s*7\s*%/.test(t) && mins.length >= 1 && mins.every((m) => m.attrs["aria-checked"] === "false")
      && J([...new Set(sb)].sort()) === J(["AREA", "PERSON", "ROOM"]);
    return [ok, `vat=${v?.attrs["data-vat-registered"]} text="${t.slice(0, 120)}" min=${J(mins.map((m) => m.attrs["aria-checked"]))} basis=${J(sb)}`];
  }, "MAJOR", true);
  await T("U-7", "ผลตรวจรายเดือน (DL · PB · STRICT · ฿4.50 > ฿4.30): แถว data-legal-row ELEC data-level BLOCK + ข้อความ messageTh", ["dormLawModel"], async () => {
    const m = await fn("dormLawModel")!(OWN, sctxA, { unitId: DL, periodKey: PB });
    const h = render(m);
    const row = boxes(h, "data-legal-row").find((r) => r.attrs["data-legal-row"] === "ELEC");
    const msg = m?.check?.blocks?.find((b: any) => b.kind === "ELEC" && b.code === "UTIL_FIXED_RATE_LE_COST")?.messageTh ?? "∅";
    return [row?.attrs["data-level"] === "BLOCK" && textOf(row.html).includes(msg) && THAI.test(msg), `level=${row?.attrs["data-level"]} msg="${msg.slice(0, 80)}" text="${textOf(row?.html ?? "").slice(0, 120)}"`];
  }, "MAJOR", true);
  await T("U-8", "ฟอร์มใส่บิล: เจ้าของมี data-authority-bill-form ELEC+WATER (ช่อง amount · units · ไฟล์ image) · พนักงานดูอย่างเดียวไม่มีฟอร์ม", ["dormLawModel"], async () => {
    const forms = boxes(hOwn, "data-authority-bill-form");
    const e = forms.find((f) => f.attrs["data-authority-bill-form"] === "ELEC");
    const ins = e ? boxes(e.html, "data-bill-input").map((i) => i.attrs["data-bill-input"]) : [];
    const file = e ? [...e.html.matchAll(/<input[^>]*type="file"[^>]*>/g)].map((x) => attrsOf(x[0])) : [];
    const hS = mStv ? render(mStv) : "";
    const ok = J(forms.map((f) => f.attrs["data-authority-bill-form"]).sort()) === J(["ELEC", "WATER"]) && ins.includes("amount") && ins.includes("units") && file.some((f) => /image/.test(f.accept ?? ""))
      && !!hS && boxes(hS, "data-authority-bill-form").length === 0;
    return [ok, `forms=${J(forms.map((f) => f.attrs["data-authority-bill-form"]))} inputs=${J(ins)} file=${file.length} staff forms=${boxes(hS, "data-authority-bill-form").length}`];
  }, "MAJOR", true);
  await T("U-9", "WARN ต้องยอมรับ: เจ้าของมีปุ่ม data-accept-legal ELEC · ผู้จัดการไม่มีปุ่ม + \"รอเจ้าของยืนยัน\" · ทุกจอไม่มีคำต้องห้าม สคบ. / URL ไฟล์", ["dormLawModel"], async () => {
    await U(DL, "rooms.legal.mode", "WARN");
    const mo = await fn("dormLawModel")!(OWN, sctxA, { unitId: DL, periodKey: PB });
    const mm = await fn("dormLawModel")!(MGR, sctxA, { unitId: DL, periodKey: PB });
    await U(DL, "rooms.legal.mode", undefined);
    const ho = render(mo), hm = render(mm);
    const bad = [hOwn, hMgr, ho, hm].map((h) => LEGAL_BAD.exec(textOf(h))?.[0] ?? (/https?:\/\/[^"\s]*\.(jpe?g|png|pdf)/i.test(h) ? "URL" : "")).filter(Boolean);
    const ok = boxes(ho, "data-accept-legal").some((b) => b.attrs["data-accept-legal"] === "ELEC") && boxes(hm, "data-accept-legal").length === 0 && /รอเจ้าของยืนยัน/.test(textOf(hm)) && !bad.length;
    return [ok, `owner ปุ่ม=${J(boxes(ho, "data-accept-legal").map((b) => b.attrs["data-accept-legal"]))} mgr ปุ่ม=${boxes(hm, "data-accept-legal").length} รอ=${/รอเจ้าของยืนยัน/.test(textOf(hm))} ต้องห้าม=${J(bad)}`];
  }, "CRITICAL", true);

  // ═══════════════ X. ข้ามร้าน/ข้ามหน่วย ═══════════════
  console.log("\n── X ข้ามร้าน/ข้ามหน่วย (ระดับฐานข้อมูลจริง) ──");
  await T("X-1", "ร้าน A ใส่บิลหน่วยร้าน B ⇒ NOT_FOUND · แถวร้าน B ไม่เปลี่ยน (1 แถว)", ["recordAuthorityBill"], async () => {
    const r = await rec(cOwn, { unitId: DBx, kind: "ELEC", periodKey: PA, billSatang: 999, units: 9 });
    const rows = await prisma.dormUtilityRate.findMany({ where: { unitId: DBx } });
    return [r?.ok === false && r.code === "NOT_FOUND" && rows.length === 1 && rows[0].authorityBillSatang === 1 && rows[0].tenantId === B, `${J(r)} rows=${J(rows.map((x: any) => [x.tenantId === B, x.authorityBillSatang]))}`];
  });
  await T("X-2", "ร้าน A อ่านค่าน้ำไฟ/ด่านของหน่วยร้าน B ⇒ ผลว่าง / NOT_FOUND · ร้าน B อ่านหน่วยร้าน A ⇒ ผลว่าง", ["utilityCharges", "utilityBillingGate"], async () => {
    const a = await charges(cOwn, DBx, PA), g = await gate(cOwn, DBx, PA), b = await charges(cB, DU, PA), gb = await gate(cB, DU, PA);
    return [(a?.rows ?? [1]).length === 0 && (a?.groups ?? [1]).length === 0 && g?.ok === false && g.code === "NOT_FOUND" && (b?.rows ?? [1]).length === 0 && gb?.code === "NOT_FOUND",
      `A→B rows=${a?.rows?.length} gate=${g?.code} · B→A rows=${b?.rows?.length} gate=${gb?.code}`];
  });
  await T("X-3", "ยอมรับคำเตือนของหน่วยร้าน B ด้วยเจ้าของร้าน A ⇒ NOT_FOUND · เจ้าของร้าน B (ctx ร้าน A) ⇒ OWNER_ONLY/NOT_FOUND ไม่เขียน", ["acceptUtilityLegalWarn"], async () => {
    const a = await fn("acceptUtilityLegalWarn")!(cOwn, { unitId: DBx, periodKey: PA, kind: "ELEC", buildingId: null, reason: REASON });
    await U(DL, "rooms.legal.mode", "WARN");
    const b = await fn("acceptUtilityLegalWarn")!({ tenantId: A, actorUserId: OWNB.userId }, { unitId: DL, periodKey: PB, kind: "ELEC", buildingId: bL, reason: REASON });
    await U(DL, "rooms.legal.mode", undefined);
    const au = await prisma.auditLog.count({ where: { tenantId: B, action: "dorm.utility.legal_accepted" } });
    return [a?.ok === false && a.code === "NOT_FOUND" && b?.ok === false && ["OWNER_ONLY", "NOT_FOUND"].includes(b.code) && au === 0, `${J(a)} ${J(b)}`];
  });
  await T("X-4", "บิลร้าน B งวด/kind เดียวกัน (buildingId null) ไม่ถูกใช้กับร้าน A: DU PA ยังต้นทุน 472 · DS PC ยัง BILL_MISSING", ["utilityCharges"], async () => {
    const g = grpOf(await charges(cOwn, DU, PA), "ELEC", bU);
    const s = rowOf(await charges(cOwn, DS, PC), RS["S1"], "ELEC");
    return [g?.costRateSatangPerUnit === 472 && s?.code === "BILL_MISSING", `DU cost=${g?.costRateSatangPerUnit} DS=${s?.code}`];
  }, "MAJOR");
  await T("X-5", "ctx ร้าน B ใส่บิลด้วย unitId ร้าน A ⇒ NOT_FOUND (ไม่มีแถวใหม่ใน A)", ["recordAuthorityBill"], async () => {
    const n0 = await prisma.dormUtilityRate.count({ where: { tenantId: A } });
    const r = await rec(cB, { unitId: DU, kind: "ELEC", periodKey: P(-6), buildingId: bU, billSatang: 100, units: 1 });
    const n1 = await prisma.dormUtilityRate.count({ where: { tenantId: A } });
    const nB = await prisma.dormUtilityRate.count({ where: { tenantId: B } });
    return [r?.ok === false && r.code === "NOT_FOUND" && n0 === n1 && nB === 1, `${J(r)} A ${n0}→${n1} B=${nB}`];
  });

  // ═══════════════ Q. ฉาก svcqc ═══════════════
  console.log("\n── Q ฉากค่าน้ำไฟ (svcqc · บ้านสวนอพาร์ตเมนต์) ──");
  const svcT = SV.SQC_TENANT.id as string;
  const svcDorm = SV.SQC_UNITS.dorm.id as string;
  const seeded = await prisma.hotelRoom.count({ where: { tenantId: svcT, unitId: svcDorm } });
  const runTsx = (file: string, args: string[] = []) => {
    const r = spawnSync("pnpm", ["exec", "tsx", file, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const m = /SCENE_SUMMARY (\{.*\})/.exec(out);
    let sum: any = null;
    try { sum = m ? JSON.parse(m[1]) : null; } catch { /* อ่านไม่ได้ */ }
    return { status: r.status, out, sum };
  };
  if (seeded !== 36) {
    for (const [id, n] of [["Q-1", "ฉากรันได้"], ["Q-2", "บิล README ในโมเดลหน้า"], ["Q-3", "รันซ้ำไม่เขียน"]]) skip(id, n, `ร้าน svcqc หอมีห้อง ${seeded} (ต้อง 36) — รัน scripts/seed-svc-qc.mts ก่อน`, "MAJOR");
  } else {
    await T("Q-1", "ฉากค่าน้ำไฟรันได้ (exit 0) · พิมพ์ SCENE_SUMMARY {created,updated,removed}", [], async () => {
      if (!existsSync(join(ROOT, F.scene))) return [false, `ยังไม่มี ${F.scene}`];
      const r = runTsx(F.scene);
      return [r.status === 0 && !!r.sum && ["created", "updated", "removed"].every((k) => typeof r.sum[k] === "number"), `exit=${r.status} ${r.sum ? J(r.sum) : r.out.split("\n").slice(-4).join(" | ").slice(0, 240)}`];
    }, "MAJOR");
    await T("Q-2", "dormLawModel svcqc (เจ้าของ · งวดเดือนก่อน): ไฟ 1,982,400/4,200/472 · น้ำ 384,000/240/1600 · scope 36 ห้อง ในขอบเขต", ["dormLawModel"], async () => {
      const ou = (SV.SQC_USERS ?? []).find((u: any) => u.key === "owner");
      const m = await fn("dormLawModel")!({ role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ou.userId }, { tenantId: svcT }, { unitId: svcDorm, periodKey: PB });
      const e = (m?.bills ?? []).find((b: any) => b.kind === "ELEC"), w = (m?.bills ?? []).find((b: any) => b.kind === "WATER");
      return [e?.billSatang === 1_982_400 && e.units === 4200 && e.costRateSatangPerUnit === 472 && w?.billSatang === 384_000 && w.units === 240 && w.costRateSatangPerUnit === 1600 && m?.scope?.roomCount === 36 && m.scope.inScope === true,
        `${J(m?.bills)} scope=${J(m?.scope)}`];
    }, "MAJOR");
    await T("Q-3", "รันฉากซ้ำ ⇒ SCENE_SUMMARY 0/0/0", [], async () => {
      if (!existsSync(join(ROOT, F.scene))) return [false, `ยังไม่มี ${F.scene}`];
      const r = runTsx(F.scene);
      return [r.status === 0 && r.sum?.created === 0 && r.sum?.updated === 0 && r.sum?.removed === 0, `exit=${r.status} ${J(r.sum)}`];
    }, "MAJOR");
  }

  // ═══════════════ V. ภาพ ═══════════════
  console.log("\n── V ภาพ ค่าน้ำไฟ · กฎหมาย · VAT (ภาพ หอ 10) ──");
  {
    const specs = SV.SQC_VISUAL_SPECS?.["d.7"];
    const base = process.env.QC_BASE ?? "";
    for (const [id, user] of [["V-1", "owner"], ["V-2", "fai"]] as const) {
      const name = `ภาพ dorm-settings-law 1440 + 390 ด้วยผู้ใช้ ${user}${user === "fai" ? " (โหมดล็อก · ไม่มีฟอร์มใส่บิล)" : ""} · HTTP < 400 · ไม่ล้นแนวนอน`;
      if (!Array.isArray(specs) || !specs.length) fail(id, name, `ไม่มี SQC_VISUAL_SPECS d.7 ${J(specs)}`, "MAJOR");
      else if (!base) skip(id, name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + รันฉาก แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>", "MAJOR");
      else {
        const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "d.7", "--user", user, "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
        const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
        if (r.status === 0) pass(id, `${name} (ภาพ .qc-shots/svc/d.7 — ผู้คุมเทียบ PARITY กับ ledger/design-dorm/10-settings-law.png)`);
        else fail(id, name, `exit=${r.status} ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "MAJOR");
      }
    }
  }

  // ═══════════════ G. regression ═══════════════
  console.log("\n── G regression (ลูกโพรเซส · env เดียวกัน · ผ่าน = JSON_SUMMARY ไม่มี failed) ──");
  for (const [id, f, args] of [["G-1", "qc-svc-d.1", []], ["G-2", "qc-svc-d.6", ["--no-regression"]], ["G-3", "qc-svc-r0.4", []]] as const) {
    if (NO_REG) { skip(id, `regression ${f}`, "--no-regression / SVC_D7_NO_REGRESSION=1", "CRITICAL"); continue; }
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${f}.mts`, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const js = [...out.matchAll(/JSON_SUMMARY (\{.*\})/g)].map((m) => m[1]).pop();
    let sum: any = null;
    try { sum = js ? JSON.parse(js) : null; } catch { /* อ่านไม่ได้ */ }
    const failed: string[] = Array.isArray(sum?.failed) ? sum.failed : [];
    const ok = (!!sum && failed.length === 0) || (!sum && r.status === 0);
    if (ok) pass(id, `regression ${f} ไม่มีข้อแดง (${sum ? `${sum.passed}/${sum.total} · SKIP ${sum.skipped?.length ?? 0}` : "exit 0"})`);
    else fail(id, `regression ${f} ไม่มีข้อแดง`, `exit=${r.status} failed=${J(failed)} · ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "CRITICAL");
  }
} catch (e) {
  fail("CRASH", "จบกลางทาง", errMsg(e), "CRITICAL");
} finally {
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { await prisma.dormAuthorityTariff.deleteMany({ where: { tariffCode: { startsWith: TARIFF_PREFIX } } }); } catch (e) { console.log(`  ⚠️ cleanup tariff: ${errMsg(e)}`); }
  try { if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } }); } catch (e) { console.log(`  ⚠️ cleanup users: ${errMsg(e)}`); }
  try {
    const left = await leftovers(tenantIds);
    const tl = await prisma.dormAuthorityTariff.count({ where: { tariffCode: { startsWith: TARIFF_PREFIX } } });
    const ul = await prisma.user.count({ where: { email: { startsWith: USER_MAIL } } });
    if (tl) left.push({ table: "DormAuthorityTariff", n: tl });
    if (ul) left.push({ table: "User", n: ul });
    if (!left.length) pass("Z-1", `ล้างครบ: ทุกตารางที่มี tenantId ของร้านทดสอบ ${tenantIds.length} ร้าน + ตารางรัฐ QCD7-* + ผู้ใช้ทดสอบ = 0 แถว (ฉาก svcqc คงไว้ให้ถ่ายภาพ — ล้างด้วย scripts/svc-qc-utility-scene.mts --clear)`);
    else fail("Z-1", "ล้างครบ", J(left), "MAJOR");
  } catch (e) { fail("Z-1", "ล้างครบ", `ตรวจไม่ได้: ${errMsg(e)}`, "MAJOR"); }
  await prisma.$disconnect();
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC D.7 · ค่าน้ำไฟทุกโหมด + หน้ากฎหมาย/VAT =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id) })}`);
// exit 0 เมื่อไม่มีข้อแดง · รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้: V-1/V-2 ไม่มี QC_BASE · Q-* ร้าน svcqc ยังไม่ seed · G-* เมื่อ --no-regression — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
